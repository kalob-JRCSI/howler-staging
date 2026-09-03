// Field-readiness blocker fix: the first real, callable, wired production conversational PM
// path -- interpretTurn -> resolveClaimProject -> load the REAL model for the resolved project ->
// compileClaim -> gateway.previewClaim, never auto-applying. Ties together modules that existed
// only as an untested-together library before this file: nothing in the real worker ever called
// interpretTurn/resolveClaimProject/compileClaim end to end prior to this.

import { describe, expect, it } from "vitest";
import {
  resolveConversationalTurn,
  respondToConversationalConfirmation,
  routeConversationalTurn,
} from "../../src/operator/conversation-turn";
import { createSession } from "../../src/operator/conversation";
import { createConversationalClaimGateway } from "../../src/worker/voice-transport";
import type { FieldVoiceBridge } from "../../src/worker/voice-transport";
import type { ProjectModelV094 } from "../../src/domain/types";

function projectModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: "deboard-v091",
    revision: 1,
    name: "DeBoard",
    projectType: "RESIDENTIAL",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {
      masonry: {
        id: "masonry",
        name: "CMU foundation walls",
        phase: "Foundation",
        state: "NOT_STARTED",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: [],
        sourceIds: [],
        tags: ["masonry"],
      },
    },
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

function fakeBridge(): {
  bridge: FieldVoiceBridge;
  previewCalls: unknown[];
  applyCalls: unknown[];
} {
  const previewCalls: unknown[] = [];
  const applyCalls: unknown[] = [];
  const bridge: FieldVoiceBridge = {
    listProjectIds: () => ["deboard-v091"],
    listResumableWorkflows: () => [],
    getEvidenceFields: () => null,
    submitQuery: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
    submitPreview: (projectId, evidenceSnapshot, expectedProjectRevision) => {
      previewCalls.push({
        projectId,
        evidenceSnapshot,
        expectedProjectRevision,
      });
      return Promise.resolve({ workflowState: "SUCCEEDED" });
    },
    submitApply: (confirmation) => {
      applyCalls.push(confirmation);
      return Promise.resolve({ workflowState: "SUCCEEDED" });
    },
    resumeWorkflow: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
    submitConversationalTurn: () =>
      Promise.reject(new Error("not used by this gateway")),
    submitConversationalConfirm: () =>
      Promise.reject(new Error("not used by this gateway")),
  };
  return { bridge, previewCalls, applyCalls };
}

function callModelReturning(
  json: unknown,
): (prompt: string) => Promise<string> {
  return () => Promise.resolve(JSON.stringify(json));
}

describe("resolveConversationalTurn", () => {
  it("a real FACT utterance resolves the project, loads its real model, compiles, and previews — never auto-applying", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const loadedProjectIds: string[] = [];
    const loadProjectModel = (projectId: string) => {
      loadedProjectIds.push(projectId);
      return Promise.resolve(projectModel());
    };
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
        },
      ],
    });
    const session = createSession("t");
    const { result } = await resolveConversationalTurn(
      "masonry started Friday",
      session,
      {
        callModel,
        loadProjectModel,
        vocabulary: {
          projectIds: ["deboard-v091"],
          aliases: [{ alias: "deboard", projectId: "deboard-v091" }],
        },
        gateway,
        captureSessionId: "capture-1",
      },
    );
    expect(result.kind).toBe("AWAITING_CONFIRMATION");
    if (result.kind !== "AWAITING_CONFIRMATION") return;
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]?.confirmation.state).toBe("PENDING");
    expect(loadedProjectIds).toEqual(["deboard-v091"]);
    expect(previewCalls).toHaveLength(1);
    expect(applyCalls).toHaveLength(0);
  });

  it("field-readiness blocker: claim.projectRef is enforced against canonical identity — the model loaded is always the one for the resolved project, never a caller-assumed one", async () => {
    const { bridge } = fakeBridge();
    const loadCalls: string[] = [];
    const loadProjectModel = (projectId: string) => {
      loadCalls.push(projectId);
      return Promise.resolve(
        projectId === "carver-001"
          ? projectModel({ projectId: "carver-001" })
          : null,
      );
    };
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLAIM",
          projectRef: "carver",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
        },
      ],
    });
    const session = createSession("t");
    const { result } = await resolveConversationalTurn(
      "masonry started Friday",
      session,
      {
        callModel,
        loadProjectModel,
        vocabulary: {
          projectIds: ["deboard-v091", "carver-001"],
          aliases: [{ alias: "carver", projectId: "carver-001" }],
        },
        gateway,
        captureSessionId: "capture-1",
      },
    );
    expect(loadCalls).toEqual(["carver-001"]);
    expect(result.kind).toBe("AWAITING_CONFIRMATION");
  });

  it("an utterance naming no known project and no active session project clarifies — never guesses, never loads a model", async () => {
    const { bridge } = fakeBridge();
    let loadCalled = false;
    const loadProjectModel = () => {
      loadCalled = true;
      return Promise.resolve(projectModel());
    };
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLAIM",
          projectRef: "",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
        },
      ],
    });
    const session = createSession("t");
    const { result } = await resolveConversationalTurn(
      "masonry started Friday",
      session,
      {
        callModel,
        loadProjectModel,
        vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
        gateway,
        captureSessionId: "capture-1",
      },
    );
    expect(result.kind).toBe("CLARIFICATION");
    expect(loadCalled).toBe(false);
  });

  it("an ambiguous span from the interpreter surfaces as a clarification without ever reaching the compiler", async () => {
    const { bridge } = fakeBridge();
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLARIFICATION",
          message: "did that happen, or is that when it's planned?",
        },
      ],
    });
    const session = createSession("t");
    const { result } = await resolveConversationalTurn(
      "Jason moved Wednesday",
      session,
      {
        callModel,
        loadProjectModel: () => Promise.resolve(projectModel()),
        vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
        gateway,
        captureSessionId: "capture-1",
      },
    );
    expect(result.kind).toBe("CLARIFICATION");
  });

  it("a non-mutating claim type (CONSTRAINT_UNRESOLVED) is acknowledged without ever calling previewClaim", async () => {
    const { bridge, previewCalls } = fakeBridge();
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard-v091",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "CONSTRAINT_UNRESOLVED",
          certainty: "STATED",
        },
      ],
    });
    const session = createSession("t");
    const { result } = await resolveConversationalTurn(
      "still waiting on the block package",
      session,
      {
        callModel,
        loadProjectModel: () => Promise.resolve(projectModel()),
        vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
        gateway,
        captureSessionId: "capture-1",
      },
    );
    expect(previewCalls).toHaveLength(0);
    expect(
      result.kind === "AWAITING_CONFIRMATION" || result.kind === "NO_OP",
    ).toBe(true);
  });

  it("reports timing stages across the full pipeline", async () => {
    const { bridge } = fakeBridge();
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 0;
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => (tick += 5),
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard-v091",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
        },
      ],
    });
    const session = createSession("t");
    await resolveConversationalTurn("masonry started Friday", session, {
      callModel,
      loadProjectModel: () => Promise.resolve(projectModel()),
      vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
      gateway,
      captureSessionId: "capture-1",
      recordTiming: (sample) => samples.push(sample),
      clock: () => (tick += 1),
    });
    const stages = new Set(samples.map((s) => s.stage));
    for (const expected of [
      "input_transport",
      "interpretTurn",
      "project_resolution",
      "compileClaim",
      "preview",
      "verification",
      "total",
    ]) {
      expect(stages.has(expected), `missing stage ${expected}`).toBe(true);
    }
  });
});

describe("respondToConversationalConfirmation", () => {
  it("applies only after an explicit affirmative response, and reports the confirmation_wait and apply stages", async () => {
    const { bridge, applyCalls } = fakeBridge();
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 0;
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => (tick += 10),
      (sample) => samples.push(sample),
    );
    const callModel = callModelReturning({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard-v091",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
        },
      ],
    });
    const session = createSession("t");
    const { result } = await resolveConversationalTurn(
      "masonry started Friday",
      session,
      {
        callModel,
        loadProjectModel: () => Promise.resolve(projectModel()),
        vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
        gateway,
        captureSessionId: "capture-1",
      },
    );
    expect(result.kind).toBe("AWAITING_CONFIRMATION");
    if (result.kind !== "AWAITING_CONFIRMATION") return;
    const confirmationId = result.pending[0]?.confirmation.confirmationId;
    expect(confirmationId).toBeDefined();
    if (!confirmationId) return;

    expect(applyCalls).toHaveLength(0);
    const outcome = await respondToConversationalConfirmation(
      confirmationId,
      { affirmative: true },
      gateway,
    );
    expect(outcome.outcome).toBe("APPLIED");
    expect(applyCalls).toHaveLength(1);
  });
});

describe("routeConversationalTurn: field-test entry (correction / defer / uncertainty)", () => {
  async function stateAMasonryClaim(deps: {
    callModel: (prompt: string) => Promise<string>;
    loadProjectModel: (projectId: string) => Promise<ProjectModelV094 | null>;
    vocabulary: {
      projectIds: string[];
      aliases: { alias: string; projectId: string }[];
    };
    gateway: ReturnType<typeof createConversationalClaimGateway>;
    captureSessionId: string;
  }) {
    const session = createSession("t");
    return routeConversationalTurn("masonry started Friday", session, deps);
  }

  function statedClaimModel(): (prompt: string) => Promise<string> {
    return () =>
      Promise.resolve(
        JSON.stringify({
          spans: [
            {
              type: "CLAIM",
              projectRef: "deboard-v091",
              subjectRef: "masonry",
              subjectText: "masonry",
              claimType: "ACTIVITY_STARTED",
              effectiveDate: "2026-08-28",
              certainty: "STATED",
            },
          ],
        }),
      );
  }

  it("'Actually Tuesday' modifies the pending conversational claim rather than creating unrelated project truth", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const deps = {
      callModel: statedClaimModel(),
      loadProjectModel: () => Promise.resolve(projectModel()),
      vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
      gateway,
      captureSessionId: "capture-1",
    };
    const first = await stateAMasonryClaim(deps);
    expect(first.result.kind).toBe("AWAITING_CONFIRMATION");
    expect(previewCalls).toHaveLength(1);

    const second = await routeConversationalTurn(
      "Actually Tuesday",
      first.session,
      deps,
    );
    // No ISO date in "Actually Tuesday" -- this deterministic layer cannot resolve a day name to
    // a real date, so the correction clears the stale effectiveDate and the re-preview attempt
    // correctly clarifies asking for one, rather than either keeping the stale date or fabricating
    // a new one. Either way, no second, unrelated project mutation was ever submitted.
    expect(second.result.kind).toBe("CORRECTED");
    const correctedClaim = second.session.pendingClaims.find(
      (c) => c.claimId === first.session.pendingClaims[0]?.claimId,
    );
    expect(correctedClaim?.value).toBe("Tuesday");
    expect(correctedClaim?.effectiveDate).toBeUndefined();
    expect(second.session.pendingClaims).toHaveLength(1); // same claim, not a duplicate
    expect(applyCalls).toHaveLength(0);
  });

  it("'I'm not sure yet' defers the pending claim and applies nothing", async () => {
    const { bridge, applyCalls } = fakeBridge();
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const deps = {
      callModel: statedClaimModel(),
      loadProjectModel: () => Promise.resolve(projectModel()),
      vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
      gateway,
      captureSessionId: "capture-1",
    };
    const first = await stateAMasonryClaim(deps);
    expect(first.result.kind).toBe("AWAITING_CONFIRMATION");

    const second = await routeConversationalTurn(
      "I'm not sure yet",
      first.session,
      deps,
    );
    expect(second.result.kind).toBe("DEFERRED");
    const claimId = first.session.pendingClaims[0]?.claimId;
    const deferredClaim = second.session.pendingClaims.find(
      (c) => c.claimId === claimId,
    );
    expect(deferredClaim?.userConfirmationState).toBe("DEFERRED");
    expect(applyCalls).toHaveLength(0);
  });

  it("a correction invalidates the stale preview so a duplicate-id re-preview call is not silently served the old confirmation", async () => {
    const { bridge, previewCalls } = fakeBridge();
    let confirmationSequence = 0;
    const gateway = createConversationalClaimGateway(
      bridge,
      () => `confirmation-${String((confirmationSequence += 1))}`,
      () => 1_000,
    );
    const deps = {
      callModel: statedClaimModel(),
      loadProjectModel: () => Promise.resolve(projectModel()),
      vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
      gateway,
      captureSessionId: "capture-1",
    };
    const first = await stateAMasonryClaim(deps);
    expect(first.result.kind).toBe("AWAITING_CONFIRMATION");
    const firstConfirmationId =
      first.result.kind === "AWAITING_CONFIRMATION"
        ? first.result.pending[0]?.confirmation.confirmationId
        : undefined;

    // A correction that DOES carry an ISO date should produce a fresh, distinct preview call.
    const second = await routeConversationalTurn(
      "No, 2026-09-01 actually",
      first.session,
      deps,
    );
    expect(second.result.kind).toBe("CORRECTED");
    expect(previewCalls).toHaveLength(2); // original + corrected, never served from stale cache
    if (second.result.kind === "CORRECTED" && second.result.pending) {
      expect(second.result.pending.confirmation.confirmationId).not.toBe(
        firstConfirmationId,
      );
    }
  });

  it("Task18 direct commands are untouched: routeConversationalTurn only recognizes correction/defer text patterns, never the commandKind vocabulary", async () => {
    const { bridge } = fakeBridge();
    const gateway = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    // "forecast" is a real Task 18 commandKind trigger word -- routeConversationalTurn must not
    // intercept it as a correction/defer; it should fall through to full interpretation (which,
    // with no matching span from this fake model, clarifies rather than guessing).
    const deps = {
      callModel: () =>
        Promise.resolve(
          JSON.stringify({
            spans: [{ type: "CLARIFICATION", message: "n/a" }],
          }),
        ),
      loadProjectModel: () => Promise.resolve(projectModel()),
      vocabulary: { projectIds: ["deboard-v091"], aliases: [] },
      gateway,
      captureSessionId: "capture-1",
    };
    const session = createSession("t");
    const { result } = await routeConversationalTurn(
      "forecast for deboard",
      session,
      deps,
    );
    expect(result.kind).toBe("CLARIFICATION");
  });
});
