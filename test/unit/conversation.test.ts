import { describe, expect, it } from "vitest";
import {
  addClaim,
  applyCorrection,
  assertNoForbiddenClaimFields,
  confirmClaim,
  createSession,
  deferClaim,
  endSession,
  type ConversationClaim,
  type ConversationSession,
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

describe("ConversationSession session", () => {
  it("creates a session with the expected shape", () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    expect(session.startedAt).toBe("2026-09-03T08:00:00.000Z");
    expect(session.activeProjectId).toBeNull();
    expect(session.activeDebriefItems).toEqual([]);
    expect(session.currentQuestionRef).toBeNull();
    expect(session.pendingClaims).toEqual([]);
    expect(session.unresolvedClarifications).toEqual([]);
    expect(session.lastReferencedEntity).toBeNull();
    expect(session.turnLog).toEqual([]);
    expect(session.confirmationState).toBe("IDLE");
    expect(typeof session.sessionId).toBe("string");
    expect(session.sessionId.length).toBeGreaterThan(0);
  });

  it("generates unique sessionIds across repeated calls", () => {
    const ids = new Set(
      Array.from({ length: 20 }, () =>
        createSession("2026-09-03T08:00:00.000Z").sessionId,
      ),
    );
    expect(ids.size).toBe(20);
  });

  it("bounds turnLog to the last 20 entries", () => {
    let session = createSession("2026-09-03T08:00:00.000Z");
    for (let i = 0; i < 25; i++) {
      session = {
        ...session,
        turnLog: [
          ...session.turnLog,
          { turnId: `turn-${String(i)}`, text: `utterance ${String(i)}`, at: session.startedAt },
        ].slice(-20),
      };
    }
    expect(session.turnLog).toHaveLength(20);
    expect(session.turnLog[0]?.turnId).toBe("turn-5");
    expect(session.turnLog[19]?.turnId).toBe("turn-24");
  });

  it("addClaim appends a claim to pendingClaims without mutating the input session", () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const claim = validClaim();
    const next = addClaim(session, claim);
    expect(session.pendingClaims).toEqual([]);
    expect(next.pendingClaims).toEqual([claim]);
  });

  it("applyCorrection replaces a claim's value/effectiveDate in place", () => {
    let session = createSession("2026-09-03T08:00:00.000Z");
    const claim = validClaim({
      claimId: "claim-x",
      userConfirmationState: "AWAITING_CONFIRMATION",
    });
    session = addClaim(session, claim);
    const corrected = applyCorrection(session, "claim-x", {
      value: "Thursday",
      effectiveDate: "2026-09-10",
    });
    expect(corrected.pendingClaims).toHaveLength(1);
    expect(corrected.pendingClaims[0]?.value).toBe("Thursday");
    expect(corrected.pendingClaims[0]?.effectiveDate).toBe("2026-09-10");
    expect(corrected.pendingClaims[0]?.claimId).toBe("claim-x");
  });

  it("deferClaim marks the claim DEFERRED", () => {
    let session = createSession("2026-09-03T08:00:00.000Z");
    session = addClaim(session, validClaim({ claimId: "claim-y" }));
    const deferred = deferClaim(session, "claim-y");
    expect(deferred.pendingClaims[0]?.userConfirmationState).toBe("DEFERRED");
  });

  it("confirmClaim marks the claim CONFIRMED", () => {
    let session = createSession("2026-09-03T08:00:00.000Z");
    session = addClaim(
      session,
      validClaim({
        claimId: "claim-z",
        userConfirmationState: "AWAITING_CONFIRMATION",
      }),
    );
    const confirmed = confirmClaim(session, "claim-z");
    expect(confirmed.pendingClaims[0]?.userConfirmationState).toBe(
      "CONFIRMED",
    );
  });

  it("endSession is a no-op that returns nothing — there is no module-level state to survive it", () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const result = endSession(session) as unknown;
    expect(result).toBeUndefined();
  });
});
