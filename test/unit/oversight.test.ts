import { describe, expect, it } from "vitest";
import { runOversightReview } from "../../src/engine/oversight";
import type {
  ActivityForecastV094,
  ForecastSnapshotV094,
} from "../../src/engine/solver";
import type {
  ActivityV094,
  ConflictV094,
  ConstraintV094,
  ProjectEventV094,
  ProjectModelV094,
  SourceV094,
} from "../../src/domain/types";

function source(overrides: Partial<SourceV094> = {}): SourceV094 {
  return {
    id: "s1",
    type: "FIELD_REPORT",
    label: "source",
    observedAt: "2026-08-26T00:00:00Z",
    authority: 0.9,
    reliability: 0.9,
    ...overrides,
  };
}

function constraint(overrides: Partial<ConstraintV094> = {}): ConstraintV094 {
  return {
    id: "c1",
    activityId: "a1",
    type: "MATERIAL",
    label: "Constraint one",
    state: "UNVERIFIED",
    hard: true,
    sourceIds: [],
    verification: "UNVERIFIED",
    ...overrides,
  };
}

function activity(overrides: Partial<ActivityV094> = {}): ActivityV094 {
  return {
    id: "a1",
    name: "Activity One",
    phase: "Phase",
    state: "NOT_STARTED",
    duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
    constraintIds: [],
    sourceIds: [],
    ...overrides,
  };
}

function model(overrides: Partial<ProjectModelV094> = {}): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: { a1: activity() },
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

const CONFIDENCE = {
  scopeClarity: 0.8,
  dependencyClarity: 0.8,
  materialReadiness: 0.8,
  tradeReadiness: 0.8,
  inspectionReadiness: 0.8,
  freshness: 0.8,
  historicalEvidence: 0.5,
  fieldVerification: 0.8,
  contradictionPenalty: 0,
  overall: 0.8,
};

function forecast(
  overrides: Partial<ActivityForecastV094> = {},
): ActivityForecastV094 {
  return {
    activityId: "a1",
    activityName: "Activity One",
    phase: "Phase",
    activityState: "NOT_STARTED",
    truthState: "FORECASTED",
    dateBasis: "MODEL_FORECAST",
    assumptions: [],
    start: {
      optimistic: "2026-08-26",
      likely: "2026-08-26",
      conservative: "2026-08-26",
    },
    finish: {
      optimistic: "2026-08-27",
      likely: "2026-08-28",
      conservative: "2026-08-29",
    },
    likelyFloatWorkdays: 0,
    critical: false,
    impactStatus: "UNCHANGED",
    confidence: CONFIDENCE,
    evidence: { sourceIds: [], eventIds: [] },
    requiredBy: [],
    drivers: [],
    warnings: [],
    ...overrides,
  };
}

function candidate(
  activityForecasts: Record<string, ActivityForecastV094>,
  overrides: Partial<ForecastSnapshotV094> = {},
): ForecastSnapshotV094 {
  return {
    id: "snap-1",
    modelRevision: 0,
    projectId: "p1",
    version: 1,
    status: "WORKING",
    generatedAt: "2026-08-26T12:00:00Z",
    basedOnEventIds: [],
    basedOnSourceIds: [],
    evidenceRevision: 0,
    impactActivityIds: ["a1"],
    activityForecasts,
    pmActions: [],
    completion: {
      optimistic: "2026-08-27",
      likely: "2026-08-28",
      conservative: "2026-08-29",
    },
    supersededSources: [],
    recoveryAnalysis: {
      status: "NO_FORECAST",
      recoveryAvailable: false,
      recoveryStandbyAvailable: false,
      advisoryOnly: true,
      levers: [],
      protectionActions: [],
    },
    ...overrides,
  };
}

function baseEvent(
  overrides: Partial<ProjectEventV094> = {},
): ProjectEventV094 {
  return {
    id: "e1",
    baseRevision: 0,
    projectId: "p1",
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-26T00:00:00Z",
    receivedAt: "2026-08-26T00:00:00Z",
    sourceIds: [],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["a1"],
    mutations: [],
    payload: {},
    ...overrides,
  };
}

describe("runOversightReview: decision aggregation", () => {
  it("decides PASS when there are no findings", () => {
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.decision).toBe("PASS");
  });

  it("decides BLOCK when any finding is BLOCK severity, even alongside WARN findings", () => {
    const m = model({
      activities: { a1: activity({ constraintIds: ["c1"] }) },
      constraints: { c1: constraint({ state: "BLOCKED" }) },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.decision).toBe("BLOCK");
  });

  it("decides PASS_WITH_WARNINGS when findings are WARN-only", () => {
    const event = baseEvent({ verification: "UNVERIFIED" });
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast() }),
      event,
      "2026-08-26T12:00:00Z",
    );
    expect(review.decision).toBe("PASS_WITH_WARNINGS");
  });

  it("stamps the review id, projectId, candidateSnapshotId, and createdAt", () => {
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast() }, { id: "snap-x" }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.id).toBe("snap-x-oversight");
    expect(review.projectId).toBe("p1");
    expect(review.candidateSnapshotId).toBe("snap-x");
    expect(review.createdAt).toBe("2026-08-26T12:00:00Z");
  });
});

describe("runOversightReview: triggering event findings", () => {
  it("warns when the triggering event is unverified", () => {
    const event = baseEvent({ verification: "UNVERIFIED" });
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast() }),
      event,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "EVIDENCE",
        severity: "WARN",
        message:
          "Triggering event is unverified. Forecast may be explored internally but material schedule changes should not be published as fact.",
      }),
    );
  });

  it("blocks a scope/document change with no mapped impact seed activities", () => {
    const event = baseEvent({
      type: "SCOPE_CHANGE",
      impactSeedActivityIds: [],
    });
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast() }),
      event,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "DOCUMENTATION",
        severity: "BLOCK",
        message: "Scope/document change has no mapped impact seed activities.",
      }),
    );
  });

  it("does not block a scope change that does map to impact seed activities", () => {
    const event = baseEvent({
      type: "SCOPE_CHANGE",
      impactSeedActivityIds: ["a1"],
    });
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast() }),
      event,
      "2026-08-26T12:00:00Z",
    );
    expect(review.decision).toBe("PASS");
  });
});

describe("runOversightReview: open conflict findings", () => {
  function conflict(overrides: Partial<ConflictV094> = {}): ConflictV094 {
    return {
      id: "conf1",
      category: "TEST",
      description: "Test conflict",
      activityIds: ["a1"],
      sourceIds: [],
      severity: "HIGH",
      status: "OPEN",
      ...overrides,
    };
  }

  it("blocks on an open HIGH-severity conflict", () => {
    const m = model({ conflicts: { conf1: conflict({ severity: "HIGH" }) } });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "DOCUMENTATION",
        severity: "BLOCK",
        message: "Open high-severity project truth conflict: Test conflict",
      }),
    );
  });

  it("warns on an open MEDIUM-severity conflict", () => {
    const m = model({ conflicts: { conf1: conflict({ severity: "MEDIUM" }) } });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "DOCUMENTATION",
        severity: "WARN",
        message: "Open project truth conflict: Test conflict",
      }),
    );
  });

  it("ignores a resolved conflict", () => {
    const m = model({ conflicts: { conf1: conflict({ status: "RESOLVED" }) } });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.decision).toBe("PASS");
  });
});

describe("runOversightReview: activity constraint findings", () => {
  it("blocks an activity with a blocked hard constraint", () => {
    const m = model({
      activities: { a1: activity({ constraintIds: ["c1"] }) },
      constraints: {
        c1: constraint({ state: "BLOCKED", label: "Blocked one" }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "DOCUMENTATION",
        severity: "BLOCK",
        message: "Activity has blocked hard constraints: Blocked one",
      }),
    );
  });

  it("warns on a critical activity with an unverified hard constraint", () => {
    const m = model({
      activities: { a1: activity({ constraintIds: ["c1"] }) },
      constraints: {
        c1: constraint({ state: "UNVERIFIED", label: "Unverified one" }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast({ critical: true }) }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "CRITICAL_PATH",
        severity: "WARN",
        message:
          "Critical activity relies on unverified hard constraints: Unverified one",
      }),
    );
  });

  it("does not warn on an unverified hard constraint when the activity is not critical", () => {
    const m = model({
      activities: { a1: activity({ constraintIds: ["c1"] }) },
      constraints: { c1: constraint({ state: "UNVERIFIED" }) },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast({ critical: false }) }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.decision).toBe("PASS");
  });

  it("warns on a critical activity with a forecast-only hard constraint", () => {
    const m = model({
      activities: { a1: activity({ constraintIds: ["c1"] }) },
      constraints: {
        c1: constraint({ state: "FORECASTED", label: "Forecasted one" }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast({ critical: true }) }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "CRITICAL_PATH",
        severity: "WARN",
        message:
          "Critical activity relies on forecast-only hard constraints: Forecasted one. Forecasting may continue, but do not convert these dates into commitments.",
      }),
    );
  });
});

describe("runOversightReview: schedule lock findings", () => {
  it("blocks a PM-locked finish earlier than the likely duration permits", () => {
    const m = model({
      activities: {
        a1: activity({
          scheduleLock: { finishDate: "2026-08-26", sourceId: "s1" },
        }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({
        a1: forecast({
          start: {
            optimistic: "2026-08-26",
            likely: "2026-08-26",
            conservative: "2026-08-26",
          },
        }),
      }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(
      review.findings.some(
        (f) =>
          f.category === "CALENDAR" &&
          f.severity === "BLOCK" &&
          f.message.includes("PM-locked finish"),
      ),
    ).toBe(true);
  });

  it("does not block a PM-locked finish that the likely duration permits", () => {
    const m = model({
      activities: {
        a1: activity({
          duration: {
            optimistic: 1,
            likely: 1,
            conservative: 1,
            sourceIds: [],
          },
          scheduleLock: { finishDate: "2026-08-31", sourceId: "s1" },
        }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({
        a1: forecast({
          start: {
            optimistic: "2026-08-26",
            likely: "2026-08-26",
            conservative: "2026-08-26",
          },
        }),
      }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings.some((f) => f.category === "CALENDAR")).toBe(false);
  });

  it("blocks a PM-locked start earlier than hard-feasible given a constraint readiness date", () => {
    const m = model({
      activities: {
        a1: activity({
          constraintIds: ["c1"],
          scheduleLock: { startDate: "2026-08-24", sourceId: "s1" },
        }),
      },
      constraints: {
        c1: constraint({
          hard: true,
          readiness: {
            optimistic: "2026-08-26",
            likely: "2026-08-26",
            conservative: "2026-08-26",
          },
        }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(
      review.findings.some(
        (f) =>
          f.category === "CALENDAR" &&
          f.severity === "BLOCK" &&
          f.message.includes("PM-locked start"),
      ),
    ).toBe(true);
  });
});

describe("runOversightReview: actual-start findings", () => {
  it("blocks a verified actual start that precedes the modeled hard-feasible start", () => {
    const m = model({
      activities: {
        a1: activity({
          constraintIds: ["c1"],
          actualStart: "2026-08-24",
          actualStartVerification: "PM_CONFIRMED",
          actualStartSourceIds: ["s1"],
        }),
      },
      constraints: {
        c1: constraint({
          hard: true,
          readiness: {
            optimistic: "2026-08-26",
            likely: "2026-08-26",
            conservative: "2026-08-26",
          },
        }),
      },
      sources: { s1: source({ type: "FIELD_REPORT" }) },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(
      review.findings.some(
        (f) =>
          f.category === "DEPENDENCY" &&
          f.severity === "BLOCK" &&
          f.message.includes("precedes modeled hard-feasible start"),
      ),
    ).toBe(true);
  });

  it("blocks an actual start lacking accepted independent evidence", () => {
    const m = model({
      activities: {
        a1: activity({
          actualStart: "2026-08-26",
          actualStartVerification: "PM_CONFIRMED",
          actualStartSourceIds: [],
        }),
      },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "LEARNING_SAFETY",
        severity: "BLOCK",
        message:
          "Activity has an actual start without accepted independent evidence and verification. Calendar, unverified statements, or AI forecast must never self-confirm an actual.",
      }),
    );
  });

  it("blocks an actual start with evidence but an unaccepted verification value", () => {
    const m = model({
      activities: {
        a1: activity({
          actualStart: "2026-08-26",
          actualStartVerification: "UNVERIFIED",
          actualStartSourceIds: ["s1"],
        }),
      },
      sources: { s1: source({ type: "FIELD_REPORT" }) },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings.some((f) => f.category === "LEARNING_SAFETY")).toBe(
      true,
    );
  });

  it("does not block an actual start with accepted evidence and verification", () => {
    const m = model({
      activities: {
        a1: activity({
          actualStart: "2026-08-26",
          actualStartVerification: "PM_CONFIRMED",
          actualStartSourceIds: ["s1"],
        }),
      },
      sources: { s1: source({ type: "FIELD_REPORT" }) },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings.some((f) => f.category === "LEARNING_SAFETY")).toBe(
      false,
    );
  });
});

describe("runOversightReview: completion and confidence findings", () => {
  it("blocks a completed activity supported only by AI-forecast evidence", () => {
    const m = model({
      activities: {
        a1: activity({ state: "COMPLETE", actualFinishSourceIds: ["s1"] }),
      },
      sources: { s1: source({ type: "AI_FORECAST" }) },
    });
    const review = runOversightReview(
      m,
      candidate({ a1: forecast() }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "LEARNING_SAFETY",
        severity: "BLOCK",
        message:
          "Completed activity is supported only by AI forecast evidence.",
      }),
    );
  });

  it("warns on a shifted forecast with low confidence", () => {
    const review = runOversightReview(
      model(),
      candidate({
        a1: forecast({
          impactStatus: "SHIFTED",
          confidence: { ...CONFIDENCE, overall: 0.3 },
        }),
      }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "EVIDENCE",
        severity: "WARN",
        message:
          "Shifted forecast has low confidence (30%). Publish as a range/risk, not a precise commitment.",
      }),
    );
  });
});

describe("runOversightReview: critical-path summary finding", () => {
  it("passes with the default message when no critical activity has shifted", () => {
    const review = runOversightReview(
      model(),
      candidate({
        a1: forecast({ critical: true, impactStatus: "UNCHANGED" }),
      }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "CRITICAL_PATH",
        severity: "PASS",
        message:
          "No critical-path activity currently requires a published shift.",
      }),
    );
  });

  it("warns when a critical activity has shifted", () => {
    const review = runOversightReview(
      model(),
      candidate({ a1: forecast({ critical: true, impactStatus: "SHIFTED" }) }),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "CRITICAL_PATH",
        severity: "WARN",
        message:
          "Critical-path movement detected in 1 activities. Recovery alternatives and trade remobilization exposure should be reviewed before publication.",
      }),
    );
  });

  it("adds an advisory recovery-capacity finding when recovery is available", () => {
    const review = runOversightReview(
      model(),
      candidate(
        { a1: forecast({ critical: true, impactStatus: "SHIFTED" }) },
        {
          recoveryAnalysis: {
            status: "RECOVERY_AVAILABLE",
            recoveryAvailable: true,
            recoveryStandbyAvailable: true,
            advisoryOnly: true,
            recoverableWorkdays: 2,
            recoverableCompletionLikely: "2026-08-30",
            criticalShiftActivityIds: ["a1"],
            levers: [],
            protectionActions: [],
          },
        },
      ),
      undefined,
      "2026-08-26T12:00:00Z",
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        category: "CRITICAL_PATH",
        severity: "WARN",
        message:
          "Advisory recovery capacity detected: up to 2 workday(s), with modeled completion 2026-08-30. Recovery remains conditional until PM/trade/field evidence confirms the selected lever.",
      }),
    );
  });
});
