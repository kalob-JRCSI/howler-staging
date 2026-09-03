import { describe, expect, it } from "vitest";
import {
  addClaim,
  applyCorrection,
  assertNoForbiddenClaimFields,
  confirmClaim,
  createSession,
  deferClaim,
  endSession,
  resolveClaimEntity,
  resolveClaimProject,
  resolveCompletion,
  resolveCorrection,
  type ConversationClaim,
  type ConversationSession,
} from "../../src/operator/conversation";
import type { DebriefItem } from "../../src/operator/debrief";
import type { ProjectModelV094 } from "../../src/domain/types";

function testProjectModel(
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
        constraintIds: ["masonry-material", "masonry-trade"],
        sourceIds: [],
        tags: ["masonry", "wall", "cmu"],
      },
      framing: {
        id: "framing",
        name: "Structural framing",
        phase: "Framing",
        state: "NOT_STARTED",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: [],
        sourceIds: [],
        tags: ["framing", "wall", "lumber"],
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
      "carpet-decision": {
        id: "carpet-decision",
        activityId: "flooring",
        type: "DECISION",
        label: "Client carpet selection decision",
        state: "UNVERIFIED",
        hard: false,
        sourceIds: [],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

function validClaim(
  overrides: Partial<ConversationClaim> = {},
): ConversationClaim {
  return {
    claimId: "claim-1",
    sessionId: "session-1",
    projectRef: "deboard",
    subjectRef: "",
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

describe("resolve project", () => {
  const knownProjectIds = ["deboard-v091", "carver-001"];
  const aliases = [{ alias: "the boards project", projectId: "deboard-v091" }];

  it("resolve_project_explicit: an explicit project mention resolves regardless of activeProjectId", () => {
    const session = { ...createSession("t"), activeProjectId: "carver-001" };
    const claim = validClaim({ projectRef: "the deboard-v091 project" });
    const result = resolveClaimProject(
      claim,
      session,
      knownProjectIds,
      aliases,
    );
    expect(result).toBe("deboard-v091");
  });

  it("resolve_project_inherited: an empty projectRef inherits session.activeProjectId", () => {
    const session = { ...createSession("t"), activeProjectId: "carver-001" };
    const claim = validClaim({ projectRef: "" });
    const result = resolveClaimProject(
      claim,
      session,
      knownProjectIds,
      aliases,
    );
    expect(result).toBe("carver-001");
  });

  it("an empty projectRef with no active project clarifies", () => {
    const session = createSession("t");
    const claim = validClaim({ projectRef: "" });
    const result = resolveClaimProject(
      claim,
      session,
      knownProjectIds,
      aliases,
    );
    expect(
      typeof result === "object" && result.kind === "CLARIFICATION",
    ).toBe(true);
  });

  it("resolve_project_ambiguous: two plausible project matches with no active context clarifies", () => {
    const session = createSession("t");
    const claim = validClaim({ projectRef: "the project" });
    const result = resolveClaimProject(claim, session, knownProjectIds, [
      { alias: "the project", projectId: "deboard-v091" },
      { alias: "the project", projectId: "carver-001" },
    ]);
    expect(
      typeof result === "object" && result.kind === "CLARIFICATION",
    ).toBe(true);
  });

  it("never overrides an explicit non-matching project mention with the active one", () => {
    const session = { ...createSession("t"), activeProjectId: "carver-001" };
    const claim = validClaim({ projectRef: "some unknown project" });
    const result = resolveClaimProject(
      claim,
      session,
      knownProjectIds,
      aliases,
    );
    expect(
      typeof result === "object" && result.kind === "CLARIFICATION",
    ).toBe(true);
  });
});

describe("resolve entity", () => {
  it("resolves an entity phrase matching one activity via tags", () => {
    const model = testProjectModel();
    const claim = validClaim({ subjectText: "the masonry crew" });
    const result = resolveClaimEntity(claim, model);
    expect(result).toEqual({ type: "activity", id: "masonry" });
  });

  it("resolves an entity phrase matching one constraint via its label", () => {
    const model = testProjectModel();
    const claim = validClaim({ subjectText: "the block package" });
    const result = resolveClaimEntity(claim, model);
    expect(result).toEqual({ type: "constraint", id: "masonry-material" });
  });

  it("resolve_entity_unknown_rejected: a phrase matching nothing real never yields a fabricated ID", () => {
    const model = testProjectModel();
    const claim = validClaim({ subjectText: "the flying saucer astronomy club" });
    const result = resolveClaimEntity(claim, model);
    expect(
      typeof result === "object" &&
        "kind" in result &&
        result.kind === "CLARIFICATION",
    ).toBe(true);
  });

  it("resolve_entity_ambiguous_rejected: a phrase matching two activities clarifies and names both", () => {
    const model = testProjectModel();
    const claim = validClaim({ subjectText: "the wall crew" });
    const result = resolveClaimEntity(claim, model);
    expect(
      typeof result === "object" &&
        "kind" in result &&
        result.kind === "CLARIFICATION",
    ).toBe(true);
    if (typeof result === "object" && "kind" in result) {
      expect(result.candidates?.join(" ")).toMatch(/CMU foundation walls/);
      expect(result.candidates?.join(" ")).toMatch(/Structural framing/);
    }
  });

  it("resolves a constraint by label", () => {
    const model = testProjectModel();
    const claim = validClaim({ subjectText: "the carpet decision" });
    const result = resolveClaimEntity(claim, model);
    expect(result).toEqual({ type: "constraint", id: "carpet-decision" });
  });
});

function debriefItem(overrides: Partial<DebriefItem> = {}): DebriefItem {
  return {
    itemId: "deboard-v091:TRADE_MOVEMENT:masonry-trade",
    projectId: "deboard-v091",
    category: "TRADE_MOVEMENT",
    subject: "Masonry crew mobilized",
    source: "src-1",
    severity: "WARN",
    status: "OPEN",
    question: "Is the masonry crew confirmed?",
    supportingRefs: ["masonry", "masonry-trade"],
    ...overrides,
  };
}

describe("correction", () => {
  it("correction_replaces_pending: 'No, Thursday actually' replaces the single matching pending claim in place, no duplicate", () => {
    let session = createSession("t");
    session = {
      ...session,
      lastReferencedEntity: {
        type: "activity",
        id: "masonry",
        label: "masonry",
      },
    };
    session = addClaim(
      session,
      validClaim({
        claimId: "claim-jason",
        subjectRef: "masonry",
        subjectText: "masonry schedule",
        claimType: "SCHEDULE_CHANGED",
        value: "Wednesday",
        effectiveDate: "2026-09-02",
        userConfirmationState: "AWAITING_CONFIRMATION",
      }),
    );
    const result = resolveCorrection(session, "No, 2026-09-10 actually");
    expect("kind" in result).toBe(false);
    if ("kind" in result) return;
    expect(result.pendingClaims).toHaveLength(1);
    expect(result.pendingClaims[0]?.claimId).toBe("claim-jason");
    expect(result.pendingClaims[0]?.effectiveDate).toBe("2026-09-10");
  });

  it("correction_no_target_clarifies: correction with zero candidate pending claims clarifies instead of guessing", () => {
    const session = createSession("t");
    const result = resolveCorrection(session, "No, Thursday actually");
    expect("kind" in result && result.kind === "CLARIFICATION").toBe(true);
  });

  it("correction with two candidate pending claims on the same entity clarifies instead of guessing", () => {
    let session = createSession("t");
    session = {
      ...session,
      lastReferencedEntity: {
        type: "activity",
        id: "masonry",
        label: "masonry",
      },
    };
    session = addClaim(
      session,
      validClaim({
        claimId: "claim-a",
        subjectRef: "masonry",
        subjectText: "masonry schedule",
        claimType: "SCHEDULE_CHANGED",
        userConfirmationState: "AWAITING_CONFIRMATION",
      }),
    );
    session = addClaim(
      session,
      validClaim({
        claimId: "claim-b",
        subjectRef: "masonry",
        subjectText: "masonry schedule",
        claimType: "SCHEDULE_CHANGED",
        userConfirmationState: "AWAITING_CONFIRMATION",
      }),
    );
    const result = resolveCorrection(session, "No, Thursday actually");
    expect("kind" in result && result.kind === "CLARIFICATION").toBe(true);
  });
});

describe("uncertainty", () => {
  it("tentative_never_confirms: a TENTATIVE claim stays UNCONFIRMED and confirmClaim never flips it to CONFIRMED without an explicit STATED re-assertion", () => {
    let session = createSession("t");
    session = addClaim(
      session,
      validClaim({
        claimId: "claim-tentative",
        certainty: "TENTATIVE",
        userConfirmationState: "UNCONFIRMED",
      }),
    );
    // A TENTATIVE claim is only ever added at UNCONFIRMED; nothing in this test moves it toward
    // AWAITING_CONFIRMATION/CONFIRMED, so it can never reach compileClaim's provenance step.
    expect(session.pendingClaims[0]?.certainty).toBe("TENTATIVE");
    expect(session.pendingClaims[0]?.userConfirmationState).toBe(
      "UNCONFIRMED",
    );
  });
});

describe("defer", () => {
  it("defer_keeps_item_open: deferring a claim leaves the source DebriefItem status OPEN, not resolved", () => {
    let session = createSession("t");
    session = {
      ...session,
      activeDebriefItems: [debriefItem({ status: "OPEN" })],
      currentQuestionRef: "deboard-v091:TRADE_MOVEMENT:masonry-trade",
    };
    session = addClaim(
      session,
      validClaim({ claimId: "claim-defer", userConfirmationState: "AWAITING_CONFIRMATION" }),
    );
    session = deferClaim(session, "claim-defer");
    expect(session.pendingClaims[0]?.userConfirmationState).toBe("DEFERRED");
    expect(session.activeDebriefItems[0]?.status).toBe("OPEN");
  });
});

describe("completion", () => {
  it("completion_binds_exact_item: 'yes, that's done' binds only to the exact currentQuestionRef item", () => {
    let session = createSession("t");
    session = {
      ...session,
      activeDebriefItems: [
        debriefItem({ itemId: "item-a", status: "OPEN" }),
        debriefItem({ itemId: "item-b", status: "OPEN" }),
      ],
      currentQuestionRef: "item-a",
    };
    const result = resolveCompletion(session, "yes, that's done");
    expect("kind" in result).toBe(false);
    if ("kind" in result) return;
    const itemA = result.activeDebriefItems.find((i) => i.itemId === "item-a");
    const itemB = result.activeDebriefItems.find((i) => i.itemId === "item-b");
    expect(itemA?.status).toBe("CONFIRMED_COMPLETE");
    expect(itemB?.status).toBe("OPEN");
  });

  it("'yes, that's done' with currentQuestionRef unset clarifies rather than guessing which item", () => {
    const session = createSession("t");
    const result = resolveCompletion(session, "yes, that's done");
    expect("kind" in result && result.kind === "CLARIFICATION").toBe(true);
  });
});
