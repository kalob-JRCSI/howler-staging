import { describe, expect, it } from "vitest";
import {
  createConfirmedClaimSubmitter,
  createDebriefApplyPresentation,
  createDebriefBlockedPresentation,
  speakVoicePresentation,
  type ConfirmedClaimMutation,
  type FieldVoiceBridge,
} from "../../src/worker/voice-transport";
import type { PendingVoiceConfirmation } from "../../src/worker/voice-transport";
import type { ProjectEventV094 } from "../../src/domain/types";
import type { ForecastDeltaV094 } from "../../src/engine/solver";

function fakeEvent(id: string): ProjectEventV094 {
  return {
    id,
    baseRevision: 1,
    projectId: "deboard-v091",
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-28T12:00:00.000Z",
    receivedAt: "2026-08-28T12:00:00.000Z",
    sourceIds: [`src-${id}`],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["masonry"],
    mutations: [],
    payload: {},
  };
}

function fakeMutation(
  id = "voice-conversation-masonry-start",
): ConfirmedClaimMutation {
  return { event: fakeEvent(id), mutationClass: "FACT" };
}

function fakeBridge(): {
  bridge: FieldVoiceBridge;
  previewCalls: unknown[];
  applyCalls: PendingVoiceConfirmation[];
} {
  const previewCalls: unknown[] = [];
  const applyCalls: PendingVoiceConfirmation[] = [];
  const bridge: FieldVoiceBridge = {
    listProjectIds: () => [],
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
  };
  return { bridge, previewCalls, applyCalls };
}

describe("submitConfirmedClaim", () => {
  it("submits exactly one EVIDENCE_PREVIEW then exactly one EVIDENCE_APPLY_SHADOW for one confirmed claim", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const result = await submitConfirmedClaim(
      fakeMutation(),
      "deboard-v091",
      1,
    );
    expect(result.workflowState).toBe("SUCCEEDED");
    expect(previewCalls).toHaveLength(1);
    expect(applyCalls).toHaveLength(1);
  });

  it("preview happens strictly before apply", async () => {
    const order: string[] = [];
    const bridge: FieldVoiceBridge = {
      listProjectIds: () => [],
      listResumableWorkflows: () => [],
      getEvidenceFields: () => null,
      submitQuery: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      submitPreview: () => {
        order.push("PREVIEW");
        return Promise.resolve({ workflowState: "SUCCEEDED" });
      },
      submitApply: () => {
        order.push("APPLY");
        return Promise.resolve({ workflowState: "SUCCEEDED" });
      },
      resumeWorkflow: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
    };
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    await submitConfirmedClaim(fakeMutation(), "deboard-v091", 1);
    expect(order).toEqual(["PREVIEW", "APPLY"]);
  });

  it("duplicate_confirmation_single_apply: a second, duplicate confirmation call for the identical claim produces zero additional POSTs", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const mutation = fakeMutation();
    const first = await submitConfirmedClaim(mutation, "deboard-v091", 1);
    const second = await submitConfirmedClaim(mutation, "deboard-v091", 1);
    expect(first).toEqual(second);
    expect(previewCalls).toHaveLength(1);
    expect(applyCalls).toHaveLength(1);
  });

  it("two different confirmed claims each get their own preview/apply pair", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    await submitConfirmedClaim(fakeMutation("event-a"), "deboard-v091", 1);
    await submitConfirmedClaim(fakeMutation("event-b"), "deboard-v091", 2);
    expect(previewCalls).toHaveLength(2);
    expect(applyCalls).toHaveLength(2);
  });

  it("no other endpoint is ever called by this function — only bridge.submitPreview/submitApply", async () => {
    let otherCallCount = 0;
    const bridge: FieldVoiceBridge = {
      listProjectIds: () => {
        otherCallCount++;
        return [];
      },
      listResumableWorkflows: () => {
        otherCallCount++;
        return [];
      },
      getEvidenceFields: () => {
        otherCallCount++;
        return null;
      },
      submitQuery: () => {
        otherCallCount++;
        return Promise.resolve({ workflowState: "SUCCEEDED" });
      },
      submitPreview: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      submitApply: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      resumeWorkflow: () => {
        otherCallCount++;
        return Promise.resolve({ workflowState: "SUCCEEDED" });
      },
    };
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    await submitConfirmedClaim(fakeMutation(), "deboard-v091", 1);
    expect(otherCallCount).toBe(0);
  });
});

function realDeboardDelta(): ForecastDeltaV094 {
  return {
    fromSnapshotId: "deboard-v091-forecast-v1",
    fromVersion: 1,
    completionLikely: {
      from: "2026-11-11",
      to: "2026-11-13",
      deltaWorkdays: 2,
    },
    shiftedActivityCount: 18,
    criticalShiftCount: 18,
    shiftedActivities: [],
  };
}

describe("debrief spoken responses", () => {
  it("a real preview delta produces the expected fixed-template sentence, never raw JSON", () => {
    const presentation = createDebriefApplyPresentation({
      projectId: "deboard-v091",
      delta: realDeboardDelta(),
    });
    expect(presentation.status).toBe("RESULT");
    expect(presentation.safeSummary).toContain("deboard-v091");
    expect(presentation.safeSummary).toContain("18");
    expect(presentation.safeSummary).toContain("2026-11-13");
    expect(presentation.safeSummary).toContain("2026-11-11");
    expect(presentation.safeSummary).not.toMatch(/[{}[\]]/);
  });

  it("blocked_result_spoken_not_silent: an OVERSIGHT_BLOCKED result produces a fixed allowlisted 'could not record, unresolved block' template, never silence or a raw error dump", () => {
    const presentation = createDebriefBlockedPresentation({
      projectId: "deboard-v091",
      blockReason: "OVERSIGHT_BLOCKED",
    });
    expect(presentation.status).toBe("ERROR");
    expect(presentation.safeSummary.length).toBeGreaterThan(0);
    expect(presentation.safeSummary).toContain("deboard-v091");
    expect(presentation.safeSummary.toLowerCase()).toContain("block");
    expect(presentation.safeSummary).not.toMatch(/[{}[\]]/);
  });

  it("the blocked presentation still speaks through the existing, unmodified speakVoicePresentation allowlist", () => {
    const presentation = createDebriefBlockedPresentation({
      projectId: "deboard-v091",
      blockReason: "OVERSIGHT_BLOCKED",
    });
    let spoken: string | undefined;
    const platform = {
      speechSynthesis: {
        speak: (utterance: unknown) => {
          spoken = (utterance as { text?: string }).text;
        },
      },
      SpeechSynthesisUtterance: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      } as unknown as new (text: string) => unknown,
    };
    const ok = speakVoicePresentation(presentation, platform);
    expect(ok).toBe(true);
    expect(spoken).toBe(presentation.safeSummary);
  });
});

describe("timing", () => {
  it("submitConfirmedClaim reports one timing sample for the preview leg and one for the apply leg", async () => {
    const { bridge } = fakeBridge();
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 1000;
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => (tick += 15),
      (sample) => samples.push(sample),
    );
    await submitConfirmedClaim(fakeMutation(), "deboard-v091", 1);
    const stages = samples.map((s) => s.stage).sort();
    expect(stages).toEqual(["EVIDENCE_APPLY_SHADOW", "EVIDENCE_PREVIEW"]);
    for (const sample of samples) {
      expect(sample.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("submitConfirmedClaim reports no samples when recordTiming is omitted", async () => {
    const { bridge } = fakeBridge();
    const { submitConfirmedClaim } = createConfirmedClaimSubmitter(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const result = await submitConfirmedClaim(
      fakeMutation(),
      "deboard-v091",
      1,
    );
    expect(result.workflowState).toBe("SUCCEEDED");
  });

  it("speakVoicePresentation reports one timing sample when recordTiming is provided", () => {
    const presentation = createDebriefApplyPresentation({
      projectId: "deboard-v091",
      delta: realDeboardDelta(),
    });
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 2000;
    const platform = {
      speechSynthesis: { speak: () => undefined },
      SpeechSynthesisUtterance: function (text: string) {
        void text;
      } as unknown as new (text: string) => unknown,
    };
    speakVoicePresentation(
      presentation,
      platform,
      (sample) => samples.push(sample),
      () => (tick += 5),
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.stage).toBe("speakVoicePresentation");
  });

  it("speakVoicePresentation reports no samples when recordTiming is omitted", () => {
    const presentation = createDebriefApplyPresentation({
      projectId: "deboard-v091",
      delta: null,
    });
    const platform = {
      speechSynthesis: { speak: () => undefined },
      SpeechSynthesisUtterance: function (text: string) {
        void text;
      } as unknown as new (text: string) => unknown,
    };
    const ok = speakVoicePresentation(presentation, platform);
    expect(ok).toBe(true);
  });
});
