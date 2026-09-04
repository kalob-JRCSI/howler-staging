import { describe, expect, it } from "vitest";
import {
  createConversationalClaimGateway,
  createDebriefApplyPresentation,
  createDebriefBlockedPresentation,
  speakVoicePresentation,
  type ConfirmedClaimMutation,
  type FieldVoiceBridge,
} from "../../src/worker/voice-transport";
import type {
  ClaimPreviewOutcome,
  PendingVoiceConfirmation,
} from "../../src/worker/voice-transport";
import type { ProjectEventV094 } from "../../src/domain/types";
import type { ForecastDeltaV094 } from "../../src/engine/solver";

/** Narrows a `ClaimPreviewOutcome` to its PREVIEWED branch, failing the test loudly if the
 * preview did not actually succeed — every existing test in this file expects a successful
 * preview, so a PREVIEW_FAILED outcome here is a real test failure, never silently ignored. */
function expectPreviewed(
  outcome: ClaimPreviewOutcome,
): Extract<ClaimPreviewOutcome, { outcome: "PREVIEWED" }> {
  if (outcome.outcome !== "PREVIEWED") {
    throw new Error(
      `expected a PREVIEWED outcome, got ${outcome.outcome} (${outcome.previewResult.workflowState})`,
    );
  }
  return outcome;
}

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
    submitConversationalTurn: () =>
      Promise.reject(new Error("not used by this gateway")),
    submitConversationalConfirm: () =>
      Promise.reject(new Error("not used by this gateway")),
  };
  return { bridge, previewCalls, applyCalls };
}

describe("conversational claim gateway: preview never auto-applies", () => {
  it("previewClaim runs exactly one EVIDENCE_PREVIEW and returns a PENDING confirmation — it never calls submitApply on its own", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const { previewClaim } = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const outcome = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    expect(outcome.previewResult.workflowState).toBe("SUCCEEDED");
    expect(outcome.confirmation.state).toBe("PENDING");
    expect(previewCalls).toHaveLength(1);
    expect(applyCalls).toHaveLength(0);
  });

  it("apply only happens after respondToPendingClaim receives a real affirmative response — never synthesized by previewClaim itself", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    expect(applyCalls).toHaveLength(0);

    const outcome = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: true },
    );
    expect(outcome.outcome).toBe("APPLIED");
    expect(previewCalls).toHaveLength(1);
    expect(applyCalls).toHaveLength(1);
  });

  it("a negative response cancels the confirmation and never calls submitApply", async () => {
    const { bridge, applyCalls } = fakeBridge();
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    const outcome = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: false },
    );
    expect(outcome.outcome).toBe("CANCELLED");
    expect(applyCalls).toHaveLength(0);
  });

  it("preview happens strictly before apply, and apply only happens after an explicit confirm call", async () => {
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
      submitConversationalTurn: () =>
        Promise.reject(new Error("not used by this gateway")),
      submitConversationalConfirm: () =>
        Promise.reject(new Error("not used by this gateway")),
    };
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    expect(order).toEqual(["PREVIEW"]);
    await respondToPendingClaim(preview.confirmation.confirmationId, {
      affirmative: true,
    });
    expect(order).toEqual(["PREVIEW", "APPLY"]);
  });

  it("duplicate_confirmation_single_apply: a second, duplicate affirmative response for the same confirmation produces zero additional POSTs", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    const first = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: true },
    );
    const second = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: true },
    );
    expect(first.outcome).toBe("APPLIED");
    expect(second.outcome).toBe("NOOP");
    expect(previewCalls).toHaveLength(1);
    expect(applyCalls).toHaveLength(1);
  });

  it("duplicate preview calls for the identical claim before any response reuse the same in-flight/settled preview — never a second submitPreview", async () => {
    const { bridge, previewCalls } = fakeBridge();
    const { previewClaim } = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const mutation = fakeMutation();
    const first = expectPreviewed(
      await previewClaim(mutation, "deboard-v091", 1, "capture-1"),
    );
    const second = expectPreviewed(
      await previewClaim(mutation, "deboard-v091", 1, "capture-1"),
    );
    expect(first.confirmation.confirmationId).toBe(
      second.confirmation.confirmationId,
    );
    expect(previewCalls).toHaveLength(1);
  });

  it("a rejected preview is not cached forever — a later retry for the same claim gets a fresh attempt, not the same rejection replayed", async () => {
    let attempt = 0;
    const bridge: FieldVoiceBridge = {
      listProjectIds: () => [],
      listResumableWorkflows: () => [],
      getEvidenceFields: () => null,
      submitQuery: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      submitPreview: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("transient network failure"))
          : Promise.resolve({ workflowState: "SUCCEEDED" });
      },
      submitApply: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      resumeWorkflow: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      submitConversationalTurn: () =>
        Promise.reject(new Error("not used by this gateway")),
      submitConversationalConfirm: () =>
        Promise.reject(new Error("not used by this gateway")),
    };
    const { previewClaim } = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const mutation = fakeMutation();
    await expect(
      previewClaim(mutation, "deboard-v091", 1, "capture-1"),
    ).rejects.toThrow("transient network failure");
    const retried = expectPreviewed(
      await previewClaim(mutation, "deboard-v091", 1, "capture-1"),
    );
    expect(retried.previewResult.workflowState).toBe("SUCCEEDED");
    expect(attempt).toBe(2);
  });

  it("two different confirmed claims each get their own preview/apply pair", async () => {
    const { bridge, previewCalls, applyCalls } = fakeBridge();
    let confirmationSequence = 0;
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => `confirmation-${String((confirmationSequence += 1))}`,
        () => 1_000,
      );
    const previewA = expectPreviewed(
      await previewClaim(
        fakeMutation("event-a"),
        "deboard-v091",
        1,
        "capture-a",
      ),
    );
    const previewB = expectPreviewed(
      await previewClaim(
        fakeMutation("event-b"),
        "deboard-v091",
        2,
        "capture-b",
      ),
    );
    await respondToPendingClaim(previewA.confirmation.confirmationId, {
      affirmative: true,
    });
    await respondToPendingClaim(previewB.confirmation.confirmationId, {
      affirmative: true,
    });
    expect(previewCalls).toHaveLength(2);
    expect(applyCalls).toHaveLength(2);
  });

  it("no other endpoint is ever called by this gateway — only bridge.submitPreview/submitApply", async () => {
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
      submitConversationalTurn: () =>
        Promise.reject(new Error("not used by this gateway")),
      submitConversationalConfirm: () =>
        Promise.reject(new Error("not used by this gateway")),
    };
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    await respondToPendingClaim(preview.confirmation.confirmationId, {
      affirmative: true,
    });
    expect(otherCallCount).toBe(0);
  });
});

/** A bridge whose submitPreview always reports the given non-SUCCEEDED (or malformed) preview
 * workflowState — used to prove blocker 1: a confirmation may only ever be created from a
 * genuinely SUCCEEDED preview. */
function bridgeWithPreviewResult(workflowState: string): {
  bridge: FieldVoiceBridge;
  applyCalls: unknown[];
} {
  const applyCalls: unknown[] = [];
  const bridge: FieldVoiceBridge = {
    listProjectIds: () => [],
    listResumableWorkflows: () => [],
    getEvidenceFields: () => null,
    submitQuery: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
    submitPreview: () => Promise.resolve({ workflowState }),
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
  return { bridge, applyCalls };
}

describe("safety repair blocker 1: preview must fail closed", () => {
  it.each([
    ["BLOCKED"],
    ["FAILED"],
    ["INTERRUPTED"],
    ["SOMETHING_UNEXPECTED"], // malformed/unrecognized workflowState
  ])(
    "a %s preview never produces an actionable confirmation",
    async (workflowState) => {
      const { bridge, applyCalls } = bridgeWithPreviewResult(workflowState);
      const { previewClaim } = createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
      const outcome = await previewClaim(
        fakeMutation(),
        "deboard-v091",
        1,
        "capture-1",
      );
      expect(outcome.outcome).toBe("PREVIEW_FAILED");
      if (outcome.outcome === "PREVIEW_FAILED") {
        expect(outcome.previewResult.workflowState).toBe(workflowState);
      }
      expect(
        (outcome as { confirmation?: unknown }).confirmation,
      ).toBeUndefined();
      expect(applyCalls).toHaveLength(0);
    },
  );

  it("a later retry of the same claim after a BLOCKED preview gets a fresh attempt, not the same failure replayed forever", async () => {
    let attempt = 0;
    const bridge: FieldVoiceBridge = {
      listProjectIds: () => [],
      listResumableWorkflows: () => [],
      getEvidenceFields: () => null,
      submitQuery: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      submitPreview: () => {
        attempt += 1;
        return Promise.resolve({
          workflowState: attempt === 1 ? "BLOCKED" : "SUCCEEDED",
        });
      },
      submitApply: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      resumeWorkflow: () => Promise.resolve({ workflowState: "SUCCEEDED" }),
      submitConversationalTurn: () =>
        Promise.reject(new Error("not used by this gateway")),
      submitConversationalConfirm: () =>
        Promise.reject(new Error("not used by this gateway")),
    };
    const { previewClaim } = createConversationalClaimGateway(
      bridge,
      () => "confirmation-1",
      () => 1_000,
    );
    const mutation = fakeMutation();
    const first = await previewClaim(mutation, "deboard-v091", 1, "capture-1");
    expect(first.outcome).toBe("PREVIEW_FAILED");
    const second = expectPreviewed(
      await previewClaim(mutation, "deboard-v091", 1, "capture-1"),
    );
    expect(second.previewResult.workflowState).toBe("SUCCEEDED");
    expect(attempt).toBe(2);
  });
});

describe("safety repair blocker 3: Apply result truth", () => {
  it.each([
    ["BLOCKED"],
    ["FAILED"],
    ["INTERRUPTED"],
    ["SOMETHING_UNEXPECTED"], // malformed/unrecognized workflowState -> reported as FAILED
  ])("a %s Apply is never reported as APPLIED", async (workflowState) => {
    const { bridge } = fakeBridge();
    bridge.submitApply = () => Promise.resolve({ workflowState });
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    const outcome = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: true },
    );
    expect(outcome.outcome).not.toBe("APPLIED");
    if (workflowState === "BLOCKED" || workflowState === "INTERRUPTED") {
      expect(outcome.outcome).toBe(workflowState);
    } else {
      // FAILED, and any malformed/unrecognized workflowState, is reported as FAILED.
      expect(outcome.outcome).toBe("FAILED");
    }
  });

  it("a SUCCEEDED Apply is reported as APPLIED", async () => {
    const { bridge } = fakeBridge();
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    const outcome = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: true },
    );
    expect(outcome.outcome).toBe("APPLIED");
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
  it("the gateway reports one timing sample for the preview leg and one for the apply leg", async () => {
    const { bridge } = fakeBridge();
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 1000;
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => (tick += 15),
        (sample) => samples.push(sample),
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    await respondToPendingClaim(preview.confirmation.confirmationId, {
      affirmative: true,
    });
    const stages = samples.map((s) => s.stage).sort();
    expect(stages).toEqual(["EVIDENCE_APPLY_SHADOW", "EVIDENCE_PREVIEW"]);
    for (const sample of samples) {
      expect(sample.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("the gateway reports no samples when recordTiming is omitted", async () => {
    const { bridge } = fakeBridge();
    const { previewClaim, respondToPendingClaim } =
      createConversationalClaimGateway(
        bridge,
        () => "confirmation-1",
        () => 1_000,
      );
    const preview = expectPreviewed(
      await previewClaim(fakeMutation(), "deboard-v091", 1, "capture-1"),
    );
    const outcome = await respondToPendingClaim(
      preview.confirmation.confirmationId,
      { affirmative: true },
    );
    expect(outcome.outcome).toBe("APPLIED");
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
