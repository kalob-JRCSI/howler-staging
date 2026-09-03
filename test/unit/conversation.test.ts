import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenClaimFields,
  type ConversationClaim,
} from "../../src/operator/conversation";

function validClaim(
  overrides: Partial<ConversationClaim> = {},
): ConversationClaim {
  return {
    claimId: "claim-1",
    sessionId: "session-1",
    projectRef: "deboard",
    subjectRef: "masonry",
    subjectText: "the masonry crew",
    claimType: "ACTIVITY_STARTED",
    value: "Friday",
    effectiveDate: "2026-08-28",
    certainty: "STATED",
    sourceTurnId: "turn-1",
    capturedAt: "2026-09-03T12:00:00.000Z",
    userConfirmationState: "UNCONFIRMED",
    ...overrides,
  };
}

describe("ConversationClaim claim shape", () => {
  it("accepts a claim built only from the specified fields", () => {
    const claim = validClaim();
    expect(() => {
      assertNoForbiddenClaimFields(claim);
    }).not.toThrow();
  });

  it("never carries a mutationOp field", () => {
    const malformed = { ...validClaim(), mutationOp: "SET_ACTUAL_START" };
    expect(() => {
      assertNoForbiddenClaimFields(malformed);
    }).toThrow();
  });

  it("never carries an activityId field", () => {
    const malformed = { ...validClaim(), activityId: "masonry" };
    expect(() => {
      assertNoForbiddenClaimFields(malformed);
    }).toThrow();
  });

  it("never carries a constraintId field", () => {
    const malformed = { ...validClaim(), constraintId: "masonry-material" };
    expect(() => {
      assertNoForbiddenClaimFields(malformed);
    }).toThrow();
  });

  it("never carries a verification field", () => {
    const malformed = { ...validClaim(), verification: "PM_CONFIRMED" };
    expect(() => {
      assertNoForbiddenClaimFields(malformed);
    }).toThrow();
  });

  it("never carries a mutationClass field", () => {
    const malformed = { ...validClaim(), mutationClass: "FACT" };
    expect(() => {
      assertNoForbiddenClaimFields(malformed);
    }).toThrow();
  });

  it("accepts every claim type in the closed thirteen-value union", () => {
    const claimTypes: ConversationClaim["claimType"][] = [
      "ACTIVITY_STARTED",
      "ACTIVITY_COMPLETED",
      "ITEM_COMPLETED",
      "DELIVERY_RECEIVED",
      "INSPECTION_COMPLETED",
      "CONDITION_OBSERVED",
      "SCHEDULE_CHANGED",
      "DELIVERY_EXPECTED",
      "TRADE_ATTENDANCE_PLANNED",
      "WORK_REQUESTED",
      "DECISION_EXPECTED",
      "DECISION_UNRESOLVED",
      "CONSTRAINT_UNRESOLVED",
    ];
    for (const claimType of claimTypes) {
      expect(() => {
        assertNoForbiddenClaimFields(validClaim({ claimType }));
      }).not.toThrow();
    }
  });
});
