import { describe, expect, it } from "vitest";
import {
  validateClaimTransition,
  validateClaimValue,
} from "../../src/operator/claim-compiler";
import type {
  Clarification,
  ConversationClaim,
} from "../../src/operator/conversation";
import type { ProjectModelV094 } from "../../src/domain/types";

function isValid(
  result: { valid: true } | Clarification,
): result is { valid: true } {
  return "valid" in result && result.valid === true;
}

function claim(overrides: Partial<ConversationClaim> = {}): ConversationClaim {
  return {
    claimId: "claim-1",
    sessionId: "session-1",
    projectRef: "deboard-v091",
    subjectRef: "",
    subjectText: "masonry",
    claimType: "ACTIVITY_STARTED",
    effectiveDate: "2026-08-28",
    certainty: "STATED",
    sourceTurnId: "turn-1",
    capturedAt: "2026-09-03T12:00:00.000Z",
    userConfirmationState: "CONFIRMED",
    ...overrides,
  };
}

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
        constraintIds: ["masonry-material"],
        sourceIds: [],
        tags: ["masonry"],
      },
      framing: {
        id: "framing",
        name: "Structural framing",
        phase: "Framing",
        state: "COMPLETE",
        actualStart: "2026-08-20",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: [],
        sourceIds: [],
        tags: ["framing"],
      },
      electrical_rough: {
        id: "electrical_rough",
        name: "Electrical rough-in",
        phase: "MEP Rough",
        state: "IN_PROGRESS",
        actualStart: "2026-08-25",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: [],
        sourceIds: [],
        tags: ["electrical"],
      },
    },
    constraints: {
      "masonry-material": {
        id: "masonry-material",
        activityId: "masonry",
        type: "MATERIAL",
        label: "CMU block package on site",
        state: "UNVERIFIED",
        hard: true,
        sourceIds: [],
        verification: "UNVERIFIED",
      },
      "masonry-trade": {
        id: "masonry-trade",
        activityId: "masonry",
        type: "TRADE_AVAILABILITY",
        label: "Masonry crew mobilized",
        state: "SATISFIED",
        hard: true,
        sourceIds: [],
        verification: "PM_CONFIRMED",
      },
    },
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

describe("validateClaimTransition", () => {
  it("clarifies ACTIVITY_COMPLETED against an activity already COMPLETE", () => {
    const model = projectModel();
    const result = validateClaimTransition(
      claim({ claimType: "ACTIVITY_COMPLETED", subjectText: "framing" }),
      { type: "activity", id: "framing" },
      model,
    );
    expect(isValid(result)).toBe(false);
  });

  it("clarifies DELIVERY_RECEIVED against a constraint already SATISFIED", () => {
    const model = projectModel();
    const result = validateClaimTransition(
      claim({ claimType: "DELIVERY_RECEIVED", subjectText: "masonry trade" }),
      { type: "constraint", id: "masonry-trade" },
      model,
    );
    expect(isValid(result)).toBe(false);
  });

  it("permits ACTIVITY_STARTED against a NOT_STARTED activity", () => {
    const model = projectModel();
    const result = validateClaimTransition(
      claim({ claimType: "ACTIVITY_STARTED" }),
      { type: "activity", id: "masonry" },
      model,
    );
    expect(isValid(result)).toBe(true);
  });

  it("rejects a completion date earlier than the entity's existing actualStart", () => {
    const model = projectModel();
    const result = validateClaimTransition(
      claim({
        claimType: "ACTIVITY_COMPLETED",
        subjectText: "electrical rough-in",
        effectiveDate: "2026-08-01",
      }),
      { type: "activity", id: "electrical_rough" },
      model,
    );
    expect(isValid(result)).toBe(false);
  });

  it("permits a correction-flagged claim to move a date earlier than a prior pending claim", () => {
    const model = projectModel({
      activities: {
        masonry: {
          id: "masonry",
          name: "CMU foundation walls",
          phase: "Foundation",
          state: "NOT_STARTED",
          duration: {
            optimistic: 1,
            likely: 2,
            conservative: 3,
            sourceIds: [],
          },
          constraintIds: [],
          sourceIds: [],
        },
      },
    });
    const result = validateClaimTransition(
      claim({ claimType: "ACTIVITY_STARTED", effectiveDate: "2026-08-01" }),
      { type: "activity", id: "masonry" },
      model,
      { isCorrection: true },
    );
    expect(isValid(result)).toBe(true);
  });
});

describe("validateClaimValue", () => {
  it("accepts a well-formed ISO date", () => {
    const result = validateClaimValue(claim({ effectiveDate: "2026-08-28" }));
    expect(isValid(result)).toBe(true);
  });

  it("clarifies a malformed date", () => {
    const result = validateClaimValue(
      claim({ effectiveDate: "not-a-real-date" }),
    );
    expect(isValid(result)).toBe(false);
  });

  it("accepts a claim with no effectiveDate at all", () => {
    const c = claim();
    delete c.effectiveDate;
    const result = validateClaimValue(c);
    expect(isValid(result)).toBe(true);
  });
});
