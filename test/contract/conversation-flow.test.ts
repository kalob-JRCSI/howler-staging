import { describe, expect, it } from "vitest";
import {
  createConfirmedClaimSubmitter,
  type ConfirmedClaimMutation,
  type FieldVoiceBridge,
} from "../../src/worker/voice-transport";
import type { PendingVoiceConfirmation } from "../../src/worker/voice-transport";
import type { ProjectEventV094 } from "../../src/domain/types";

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

function fakeMutation(id = "voice-conversation-masonry-start"): ConfirmedClaimMutation {
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
      previewCalls.push({ projectId, evidenceSnapshot, expectedProjectRevision });
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
