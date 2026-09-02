import { describe, expect, it, vi } from "vitest";
import {
  createCaptureController,
  createPendingVoiceConfirmation,
  createVoicePresentation,
  normalizeProjectId,
  resolveVoiceCommand,
  speakVoicePresentation,
  type VoiceCaptureRecognition,
} from "../../src/worker/voice-transport";

describe("voice command resolver", () => {
  const projects = ["carver-001", "deboard-001"];

  it.each([
    ["forecast carver-001", "FORECAST_QUERY"],
    ["health for carver-001", "FORECAST_HEALTH_QUERY"],
    ["what is blocking carver-001", "FORECAST_HEALTH_QUERY"],
    ["recovery plan for carver-001", "RECOVERY_QUERY"],
    ["preview evidence for carver-001", "EVIDENCE_PREVIEW"],
  ])("maps %s to %s", (text, kind) => {
    const result = resolveVoiceCommand(text, {
      projectIds: projects,
      aliases: [],
    });
    expect(result.kind).toBe("INTENT");
    if (result.kind === "INTENT") expect(result.intentKind).toBe(kind);
  });

  it("requires confirmation for Apply and never creates evidence from speech", () => {
    const result = resolveVoiceCommand("apply evidence to carver-001", {
      projectIds: projects,
      aliases: [],
      evidenceSnapshot: { eventId: "existing-event" },
    });
    expect(result.kind).toBe("CONFIRMATION_REQUIRED");
    if (result.kind === "CONFIRMATION_REQUIRED") {
      expect(result.projectId).toBe("carver-001");
      expect(result.evidenceSnapshot).toEqual({ eventId: "existing-event" });
    }
  });

  it("clarifies unknown, missing, and ambiguous projects", () => {
    expect(
      resolveVoiceCommand("forecast missing-001", {
        projectIds: projects,
        aliases: [],
      }).kind,
    ).toBe("CLARIFICATION");
    expect(
      resolveVoiceCommand("forecast carver", {
        projectIds: projects,
        aliases: [],
      }).kind,
    ).toBe("CLARIFICATION");
    expect(
      resolveVoiceCommand("do something carver-001", {
        projectIds: projects,
        aliases: [],
      }).kind,
    ).toBe("CLARIFICATION");
  });

  it("normalizes only trim, case, and whitespace", () => {
    expect(normalizeProjectId("  CARVER-001  ")).toBe("carver-001");
    expect(normalizeProjectId("carver  001")).toBe("carver 001");
  });

  it("resumes only one exact interrupted workflow", () => {
    const result = resolveVoiceCommand("resume that workflow", {
      projectIds: projects,
      aliases: [],
      resumableWorkflows: [{ workflowId: "wf-1", projectId: "carver-001" }],
    });
    expect(result).toEqual({
      kind: "RESUME",
      workflowId: "wf-1",
      projectId: "carver-001",
    });
  });
});

describe("voice capture ownership", () => {
  function recognition(): VoiceCaptureRecognition & {
    emit: (event: string, value?: unknown) => void;
  } {
    const handlers = new Map<string, (value?: unknown) => void>();
    return {
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, value) => handlers.get(event)?.(value),
    };
  }

  it("ignores interim and duplicate final callbacks", () => {
    const fake = recognition();
    const resolved: string[] = [];
    const controller = createCaptureController({
      createRecognition: () => fake,
      onFinal: (transcript) => resolved.push(transcript),
    });
    controller.start();
    fake.emit("result", { isFinal: false, transcript: "forecast" });
    fake.emit("result", { isFinal: true, transcript: "forecast carver-001" });
    fake.emit("result", { isFinal: true, transcript: "forecast carver-001" });
    expect(resolved).toEqual(["forecast carver-001"]);
  });

  it("ignores a stale session callback after a new deliberate session starts", () => {
    const first = recognition();
    const second = recognition();
    const resolved: string[] = [];
    let call = 0;
    const controller = createCaptureController({
      createRecognition: () => (call++ === 0 ? first : second),
      onFinal: (transcript) => resolved.push(transcript),
    });
    controller.start();
    controller.start();
    first.emit("result", { isFinal: true, transcript: "forecast carver-001" });
    expect(resolved).toEqual([]);
    expect(controller.currentSessionId()).toMatch(/^capture-/);
    second.emit("result", {
      isFinal: true,
      transcript: "forecast deboard-001",
    });
    expect(resolved).toEqual(["forecast deboard-001"]);
  });
});

describe("safe voice presentation", () => {
  it("returns allowlisted summaries without raw server text", () => {
    const presentation = createVoicePresentation({
      status: "SUCCEEDED",
      projectId: "carver-001",
      actionKind: "FORECAST_QUERY",
    });
    expect(presentation.safeSummary).toBeTruthy();
    expect(presentation).not.toHaveProperty("rawResponse");
    expect(presentation).not.toHaveProperty("problemDetails");
  });

  const safe = createVoicePresentation({
    status: "SUCCEEDED",
    projectId: "carver-001",
    actionKind: "FORECAST_QUERY",
  });

  it("speaks only the safe summary when synthesis is supported", () => {
    const spoken: string[] = [];
    const result = speakVoicePresentation(safe, {
      SpeechSynthesisUtterance: class {
        constructor(readonly text: string) {}
        toString(): string {
          return this.text;
        }
      },
      speechSynthesis: {
        speak: (utterance: { text: string }) => spoken.push(utterance.text),
      },
    });
    expect(result).toBe(true);
    expect(spoken).toEqual([safe.safeSummary]);
  });

  it("uses visual-only output when synthesis is unsupported", () => {
    expect(speakVoicePresentation(safe, {})).toBe(false);
  });

  it("keeps workflow outcome successful when synthesis throws", () => {
    expect(
      speakVoicePresentation(safe, {
        SpeechSynthesisUtterance: class {
          constructor() {
            throw new Error("internal synthesis failure");
          }
          toString(): string {
            return "";
          }
        },
        speechSynthesis: { speak: () => undefined },
      }),
    ).toBe(false);
    expect(safe.status).toBe("RESULT");
  });

  it.each([
    ["raw JSON", JSON.stringify({ result: { secret: "admin-key" } })],
    ["problem details", "WorkflowProblem.message WorkflowProblem.details"],
    ["credentials", "Authorization Bearer admin-key evidence payload"],
  ])("never speaks %s", (_label, forbidden) => {
    const spoken: string[] = [];
    speakVoicePresentation(safe, {
      SpeechSynthesisUtterance: class {
        constructor(readonly text: string) {}
        toString(): string {
          return this.text;
        }
      },
      speechSynthesis: {
        speak: (utterance: { text: string }) => spoken.push(utterance.text),
      },
    });
    expect(spoken.join(" ")).not.toContain(forbidden);
  });
});

describe("immutable Apply confirmation", () => {
  it("deep copies and fingerprints the existing evidence snapshot", () => {
    const evidence = { eventId: "evt-1", nested: { value: 1 } };
    const confirmation = createPendingVoiceConfirmation({
      confirmationId: "confirm-1",
      projectId: "carver-001",
      evidenceSnapshot: evidence,
      captureSessionId: "capture-1",
      createdAt: 1000,
      expectedProjectRevision: 4,
    });
    evidence.nested.value = 9;
    expect(confirmation.state).toBe("PENDING");
    expect(confirmation.expiresAt).toBe(31_000);
    expect(confirmation.immutableSnapshot).toEqual({
      eventId: "evt-1",
      nested: { value: 1 },
    });
    expect(confirmation.snapshotFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
