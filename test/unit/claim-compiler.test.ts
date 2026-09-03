import { describe, expect, it } from "vitest";
import {
  CLASSIFY,
  compileClaim,
  validateClaimTransition,
  validateClaimValue,
} from "../../src/operator/claim-compiler";
import { createSession } from "../../src/operator/conversation";
import type {
  Clarification,
  ConversationClaim,
  ConversationClaimType,
} from "../../src/operator/conversation";
import type { ProjectModelV094 } from "../../src/domain/types";

function isValid(
  result: { valid: true } | Clarification,
): result is { valid: true } {
  return "valid" in result;
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
        label: "CMU block package delivered",
        state: "UNVERIFIED",
        hard: true,
        sourceIds: [],
        verification: "UNVERIFIED",
      },
      "masonry-trade": {
        id: "masonry-trade",
        activityId: "masonry",
        type: "TRADE_AVAILABILITY",
        label: "Trade crew mobilized on site",
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

function decisionProjectModel(): ProjectModelV094 {
  const base = projectModel();
  return {
    ...base,
    activities: {
      ...base.activities,
      flooring: {
        id: "flooring",
        name: "Flooring install",
        phase: "Finishes",
        state: "NOT_STARTED",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: ["carpet-decision"],
        sourceIds: [],
        tags: ["flooring"],
      },
    },
    constraints: {
      ...base.constraints,
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
      "rough-inspection": {
        id: "rough-inspection",
        activityId: "electrical_rough",
        type: "INSPECTION",
        label: "MEP rough inspection",
        state: "UNVERIFIED",
        hard: true,
        sourceIds: [],
        verification: "UNVERIFIED",
      },
    },
  };
}

function confirmedClaim(
  overrides: Partial<ConversationClaim> = {},
): ConversationClaim {
  return claim({ userConfirmationState: "CONFIRMED", ...overrides });
}

describe("CLASSIFY table", () => {
  it("is exhaustive and correct over all thirteen ConversationClaimType values", () => {
    const expected: Record<
      ConversationClaimType,
      "FACT" | "COMMITMENT" | null
    > = {
      ACTIVITY_STARTED: "FACT",
      ACTIVITY_COMPLETED: "FACT",
      ITEM_COMPLETED: "FACT",
      DELIVERY_RECEIVED: "FACT",
      INSPECTION_COMPLETED: "FACT",
      CONDITION_OBSERVED: "FACT",
      SCHEDULE_CHANGED: "COMMITMENT",
      DELIVERY_EXPECTED: "COMMITMENT",
      TRADE_ATTENDANCE_PLANNED: "COMMITMENT",
      WORK_REQUESTED: "COMMITMENT",
      DECISION_EXPECTED: "COMMITMENT",
      DECISION_UNRESOLVED: null,
      CONSTRAINT_UNRESOLVED: null,
    };
    expect(CLASSIFY).toEqual(expected);
  });

  it.each([
    ["ACTIVITY_STARTED", "FACT"],
    ["ACTIVITY_COMPLETED", "FACT"],
    ["ITEM_COMPLETED", "FACT"],
    ["DELIVERY_RECEIVED", "FACT"],
    ["INSPECTION_COMPLETED", "FACT"],
    ["CONDITION_OBSERVED", "FACT"],
    ["SCHEDULE_CHANGED", "COMMITMENT"],
    ["DELIVERY_EXPECTED", "COMMITMENT"],
    ["TRADE_ATTENDANCE_PLANNED", "COMMITMENT"],
    ["WORK_REQUESTED", "COMMITMENT"],
    ["DECISION_EXPECTED", "COMMITMENT"],
    ["DECISION_UNRESOLVED", null],
    ["CONSTRAINT_UNRESOLVED", null],
  ] as [ConversationClaimType, "FACT" | "COMMITMENT" | null][])(
    "classify_%s_is_%s",
    (claimType, expectedClass) => {
      expect(CLASSIFY[claimType]).toBe(expectedClass);
    },
  );

  it("classify_activity_started_is_fact: 'masonry started Friday' classifies FACT", () => {
    expect(CLASSIFY.ACTIVITY_STARTED).toBe("FACT");
  });

  it("classify_attendance_planned_is_commitment: 'Jason will be there Wednesday' classifies COMMITMENT", () => {
    expect(CLASSIFY.TRADE_ATTENDANCE_PLANNED).toBe("COMMITMENT");
  });

  it("classify_delivery_received_vs_expected: block arrived vs. block is coming, same subject, distinct classes", () => {
    expect(CLASSIFY.DELIVERY_RECEIVED).toBe("FACT");
    expect(CLASSIFY.DELIVERY_EXPECTED).toBe("COMMITMENT");
    expect(CLASSIFY.DELIVERY_RECEIVED).not.toBe(CLASSIFY.DELIVERY_EXPECTED);
  });

  it("classify_work_requested_is_commitment: 'schedule framing Thursday' classifies COMMITMENT", () => {
    expect(CLASSIFY.WORK_REQUESTED).toBe("COMMITMENT");
  });

  it("classify_decision_expected_is_commitment: DECISION_EXPECTED is COMMITMENT, never null", () => {
    expect(CLASSIFY.DECISION_EXPECTED).toBe("COMMITMENT");
    expect(CLASSIFY.DECISION_EXPECTED).not.toBeNull();
  });
});

describe("compileClaim", () => {
  const session = createSession("2026-09-03T08:00:00.000Z");

  it("compiles ACTIVITY_STARTED into a FACT-class SET_ACTUAL_START mutation", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "ACTIVITY_STARTED",
        subjectText: "masonry",
        effectiveDate: "2026-08-28",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("FACT");
    const ops = result.event.mutations.map((m) => m.op);
    expect(ops).toContain("SET_ACTUAL_START");
    expect(ops).toContain("UPSERT_SOURCE");
    expect(result.event.verification).toBe("PM_CONFIRMED");
    expect(result.event.impactSeedActivityIds).toEqual(["masonry"]);
  });

  it("field-readiness blocker: the compiled event itself carries mutationClass, not only the sibling ProposedMutation field — the scoped oversight gate reads event.mutationClass, and would silently see undefined without this", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "ACTIVITY_STARTED",
        subjectText: "masonry",
        effectiveDate: "2026-08-28",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.event.mutationClass).toBe("FACT");
  });

  it("compiles ACTIVITY_COMPLETED against an activity into SET_ACTUAL_FINISH + SET_ACTIVITY_STATE", () => {
    const model = decisionProjectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "ACTIVITY_COMPLETED",
        subjectText: "flooring install",
        effectiveDate: "2026-09-10",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("FACT");
    const ops = result.event.mutations.map((m) => m.op);
    expect(ops).toContain("SET_ACTUAL_FINISH");
    expect(ops).toContain("SET_ACTIVITY_STATE");
  });

  it("compiles DELIVERY_RECEIVED against a MATERIAL constraint into SET_CONSTRAINT_STATE SATISFIED", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "DELIVERY_RECEIVED",
        subjectText: "block package",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("FACT");
    const stateMutation = result.event.mutations.find(
      (m) => m.op === "SET_CONSTRAINT_STATE",
    );
    expect(
      stateMutation && "state" in stateMutation
        ? stateMutation.state
        : undefined,
    ).toBe("SATISFIED");
    expect(result.event.impactSeedActivityIds).toEqual(["masonry"]);
  });

  it("compiles INSPECTION_COMPLETED against an INSPECTION constraint into SET_CONSTRAINT_STATE SATISFIED", () => {
    const model = decisionProjectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "INSPECTION_COMPLETED",
        subjectText: "MEP rough inspection",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("FACT");
  });

  it("compiles CONDITION_OBSERVED against a named constraint into SET_CONSTRAINT_STATE SATISFIED", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "CONDITION_OBSERVED",
        subjectText: "block package",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("FACT");
  });

  it("field-readiness blocker: a negative-polarity CONDITION_OBSERVED ('the crew never showed up') clarifies instead of asserting SATISFIED", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "CONDITION_OBSERVED",
        subjectText: "block package",
        value: "the crew never showed up",
      }),
      model,
      session,
    );
    expect("kind" in result).toBe(true);
  });

  it("field-readiness blocker: 'not delivered yet' as a CONDITION_OBSERVED value clarifies rather than marking the constraint SATISFIED", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "CONDITION_OBSERVED",
        subjectText: "block package",
        value: "not delivered yet",
      }),
      model,
      session,
    );
    expect("kind" in result).toBe(true);
  });

  it("a plain positive CONDITION_OBSERVED value still compiles to SATISFIED normally", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "CONDITION_OBSERVED",
        subjectText: "block package",
        value: "the crew is on site",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    const constraintOp = result.event.mutations.find(
      (m) => m.op === "SET_CONSTRAINT_STATE",
    );
    expect(constraintOp && "state" in constraintOp ? constraintOp.state : undefined).toBe(
      "SATISFIED",
    );
  });

  it("compiles SCHEDULE_CHANGED into a COMMITMENT-class SET_SCHEDULE_LOCK mutation", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "SCHEDULE_CHANGED",
        subjectText: "masonry",
        effectiveDate: "2026-09-02",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("COMMITMENT");
    const ops = result.event.mutations.map((m) => m.op);
    expect(ops).toContain("SET_SCHEDULE_LOCK");
  });

  it("classify_decision_expected_is_commitment / row 42: DECISION_EXPECTED resolves the existing decision constraint and compiles to SET_CONSTRAINT_READINESS", () => {
    const model = decisionProjectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "DECISION_EXPECTED",
        subjectText: "carpet decision",
        effectiveDate: "2026-09-12",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    expect(result.mutationClass).toBe("COMMITMENT");
    const readinessMutation = result.event.mutations.find(
      (m) => m.op === "SET_CONSTRAINT_READINESS",
    );
    expect(readinessMutation).toBeDefined();
    if (readinessMutation && "readiness" in readinessMutation) {
      expect(readinessMutation.readiness.likely).toBe("2026-09-12");
      expect(readinessMutation.constraintId).toBe("carpet-decision");
    }
    // Never UPSERT_CONSTRAINT — the constraint must already exist.
    expect(result.event.mutations.map((m) => m.op)).not.toContain(
      "UPSERT_CONSTRAINT",
    );
  });

  it("a DECISION_EXPECTED claim with no matching existing constraint fails closed to Clarification, never creates one", () => {
    const model = projectModel(); // no decision-type constraint present
    const result = compileClaim(
      confirmedClaim({
        claimType: "DECISION_EXPECTED",
        subjectText: "paint color decision",
        effectiveDate: "2026-09-12",
      }),
      model,
      session,
    );
    expect("kind" in result).toBe(true);
  });

  it("DECISION_UNRESOLVED classifies null mutationClass and produces no event", () => {
    const model = decisionProjectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "DECISION_UNRESOLVED",
        subjectText: "carpet decision",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(false);
    expect("mutationClass" in result && result.mutationClass === null).toBe(
      true,
    );
  });

  it("CONSTRAINT_UNRESOLVED classifies null mutationClass and produces no event", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "CONSTRAINT_UNRESOLVED",
        subjectText: "block package",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(false);
    expect("mutationClass" in result && result.mutationClass === null).toBe(
      true,
    );
  });

  it("refuses to compile a claim that is not yet CONFIRMED", () => {
    const model = projectModel();
    const result = compileClaim(
      claim({
        claimType: "ACTIVITY_STARTED",
        subjectText: "masonry",
        effectiveDate: "2026-08-28",
        userConfirmationState: "AWAITING_CONFIRMATION",
      }),
      model,
      session,
    );
    expect("kind" in result).toBe(true);
  });

  it("interpreter_ignores_injected_mutation_class: an adversarial mutationClass on the claim has zero effect on compileClaim's output", () => {
    const model = projectModel();
    const legitimate = confirmedClaim({
      claimType: "SCHEDULE_CHANGED",
      subjectText: "masonry",
      effectiveDate: "2026-09-02",
    });
    const adversarial = {
      ...legitimate,
      mutationClass: "FACT",
    } as unknown as ConversationClaim;
    const legitimateResult = compileClaim(legitimate, model, session);
    const adversarialResult = compileClaim(adversarial, model, session);
    expect("event" in legitimateResult && "event" in adversarialResult).toBe(
      true,
    );
    if ("event" in legitimateResult && "event" in adversarialResult) {
      expect(adversarialResult.mutationClass).toBe(
        legitimateResult.mutationClass,
      );
      expect(adversarialResult.mutationClass).toBe("COMMITMENT");
    }
  });

  it("provenance: applied fact carries a VOICE_CONVERSATION source with a text-only transcript excerpt and session/turn refs, never raw audio", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "ACTIVITY_STARTED",
        subjectText: "masonry",
        value: "masonry actually started Friday",
        effectiveDate: "2026-08-28",
        sessionId: "session-42",
        sourceTurnId: "turn-7",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
    if (!("event" in result)) return;
    const upsertSource = result.event.mutations.find(
      (m) => m.op === "UPSERT_SOURCE",
    );
    expect(upsertSource && "source" in upsertSource).toBe(true);
    if (upsertSource && "source" in upsertSource) {
      expect(upsertSource.source.type).toBe("VOICE_CONVERSATION");
      expect(upsertSource.source.label).toContain("session-42");
      expect(upsertSource.source.label).toContain("turn-7");
      expect(typeof upsertSource.source.label).toBe("string");
    }
  });
});

describe("compileClaim timing", () => {
  const session = createSession("2026-09-03T08:00:00.000Z");

  it("reports exactly one timing sample per call when recordTiming is provided", () => {
    const model = projectModel();
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 1000;
    const clock = () => (tick += 10);
    compileClaim(
      confirmedClaim({
        claimType: "ACTIVITY_STARTED",
        subjectText: "masonry",
        effectiveDate: "2026-08-28",
      }),
      model,
      session,
      (sample) => samples.push(sample),
      clock,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.stage).toBe("compileClaim");
    expect(samples[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports no samples when recordTiming is omitted", () => {
    const model = projectModel();
    const result = compileClaim(
      confirmedClaim({
        claimType: "ACTIVITY_STARTED",
        subjectText: "masonry",
        effectiveDate: "2026-08-28",
      }),
      model,
      session,
    );
    expect("event" in result).toBe(true);
  });
});
