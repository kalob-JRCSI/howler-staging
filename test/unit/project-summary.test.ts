import { describe, expect, it } from "vitest";
import { buildProjectSummary } from "../../src/operator/project-summary";
import type {
  ActivityV094,
  ConflictV094,
  ConstraintV094,
  ProjectFinancialsV097,
  ProjectModelV094,
} from "../../src/domain/types";
import type {
  ActivityForecastV094,
  ForecastSnapshotV094,
} from "../../src/engine/solver";
import type { ProjectHealthV094 } from "../../src/worker/health";

function baseModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test Project",
    projectType: "RESIDENTIAL",
    timezone: "UTC",
    forecastAnchorDate: "2026-01-01",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {},
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

function activity(
  id: string,
  overrides: Partial<ActivityV094> = {},
): ActivityV094 {
  return {
    id,
    name: id,
    phase: "General",
    state: "NOT_STARTED",
    duration: { optimistic: 1, likely: 1, conservative: 2, sourceIds: [] },
    constraintIds: [],
    sourceIds: [],
    ...overrides,
  };
}

function constraint(
  id: string,
  overrides: Partial<ConstraintV094> = {},
): ConstraintV094 {
  return {
    id,
    activityId: "a1",
    type: "TRADE",
    label: `Constraint ${id}`,
    state: "UNVERIFIED",
    hard: true,
    sourceIds: [],
    verification: "UNVERIFIED",
    ...overrides,
  };
}

function conflict(
  id: string,
  overrides: Partial<ConflictV094> = {},
): ConflictV094 {
  return {
    id,
    category: "SCHEDULE",
    description: `Conflict ${id}`,
    activityIds: [],
    sourceIds: [],
    severity: "HIGH",
    status: "OPEN",
    ...overrides,
  };
}

function baseHealth(
  overrides: Partial<ProjectHealthV094> = {},
): ProjectHealthV094 {
  return {
    projectId: "p1",
    revision: 0,
    forecastVersion: null,
    completion: null,
    meanForecastConfidence: 0,
    openConflicts: [],
    blockedConstraints: [],
    unverifiedHardConstraints: [],
    lowCoverage: [],
    accuracyByHorizon: [],
    ...overrides,
  };
}

const ZERO_CONFIDENCE = {
  scopeClarity: 1,
  dependencyClarity: 1,
  materialReadiness: 1,
  tradeReadiness: 1,
  inspectionReadiness: 1,
  freshness: 1,
  historicalEvidence: 1,
  fieldVerification: 1,
  contradictionPenalty: 0,
  overall: 1,
};

function activityForecast(
  id: string,
  startLikely: string,
  finishLikely: string,
  overrides: Partial<ActivityForecastV094> = {},
): ActivityForecastV094 {
  return {
    activityId: id,
    activityName: id,
    phase: "General",
    activityState: "NOT_STARTED",
    truthState: "PROJECTED",
    dateBasis: "FORECAST",
    assumptions: [],
    start: {
      optimistic: startLikely,
      likely: startLikely,
      conservative: startLikely,
    },
    finish: {
      optimistic: finishLikely,
      likely: finishLikely,
      conservative: finishLikely,
    },
    likelyFloatWorkdays: 0,
    critical: false,
    impactStatus: "UNCHANGED",
    confidence: ZERO_CONFIDENCE,
    evidence: { sourceIds: [], eventIds: [] },
    requiredBy: [],
    drivers: [],
    warnings: [],
    ...overrides,
  };
}

function baseForecast(
  overrides: Partial<ForecastSnapshotV094> = {},
): ForecastSnapshotV094 {
  return {
    id: "f1",
    modelRevision: 0,
    projectId: "p1",
    version: 1,
    status: "WORKING",
    generatedAt: "2026-01-01T00:00:00.000Z",
    basedOnEventIds: [],
    basedOnSourceIds: [],
    evidenceRevision: 0,
    impactActivityIds: [],
    activityForecasts: {},
    pmActions: [],
    completion: {
      optimistic: "2026-02-01",
      likely: "2026-02-01",
      conservative: "2026-02-01",
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

describe("buildProjectSummary: progress and integrity are separate values", () => {
  it("a project can be 80% progress while integrity is 60, neither derived from the other", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "COMPLETE",
          duration: {
            optimistic: 4,
            likely: 8,
            conservative: 10,
            sourceIds: [],
          },
        }),
        b: activity("b", {
          state: "NOT_STARTED",
          duration: {
            optimistic: 1,
            likely: 2,
            conservative: 3,
            sourceIds: [],
          },
        }),
      },
      constraints: {
        c1: constraint("c1", { state: "BLOCKED" }),
        c2: constraint("c2", { state: "BLOCKED", activityId: "b" }),
      },
    });
    const health = baseHealth({
      blockedConstraints: [
        constraint("c1", { state: "BLOCKED" }),
        constraint("c2", { state: "BLOCKED", activityId: "b" }),
      ],
      openConflicts: [conflict("k1", { severity: "HIGH" })],
    });
    const summary = buildProjectSummary(model, undefined, health);
    expect(summary.progressPercent).toBe(80);
    expect(summary.integrity.score).toBe(60);
  });
});

describe("buildProjectSummary: progress weighting", () => {
  it("weights COMPLETE at full likely-duration and NOT_STARTED at zero", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "COMPLETE",
          duration: {
            optimistic: 4,
            likely: 8,
            conservative: 10,
            sourceIds: [],
          },
        }),
        b: activity("b", {
          state: "NOT_STARTED",
          duration: {
            optimistic: 1,
            likely: 2,
            conservative: 3,
            sourceIds: [],
          },
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.progressPercent).toBe(80);
  });

  it("weights IN_PROGRESS at exactly half its likely-duration", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "IN_PROGRESS",
          duration: {
            optimistic: 5,
            likely: 10,
            conservative: 15,
            sourceIds: [],
          },
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.progressPercent).toBe(50);
  });

  it("never uses elapsed calendar time, budget spend, or forecast percent", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "NOT_STARTED",
          duration: {
            optimistic: 1,
            likely: 100,
            conservative: 200,
            sourceIds: [],
          },
        }),
      },
      projectProfile: {
        baselineScope: [],
        budget: { baseline: 1000, spent: 999, currency: "USD" },
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.progressPercent).toBe(0);
  });

  it("returns 0, never NaN, when there are no activities", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.progressPercent).toBe(0);
    expect(Number.isNaN(summary.progressPercent)).toBe(false);
  });
});

describe("buildProjectSummary: integrity formula (exact pilot baseline)", () => {
  it.each([
    [
      85,
      "Stable",
      {
        blocked: 0,
        highConflicts: 0,
        unverified: 3,
        criticalExposureCount: undefined,
      },
    ],
    [
      84,
      "Stable, exposed",
      { blocked: 0, highConflicts: 0, unverified: 3, criticalExposureCount: 1 },
    ],
    [
      70,
      "Stable, exposed",
      {
        blocked: 2,
        highConflicts: 0,
        unverified: 0,
        criticalExposureCount: undefined,
      },
    ],
    [
      69,
      "At risk",
      { blocked: 2, highConflicts: 0, unverified: 0, criticalExposureCount: 1 },
    ],
    [
      50,
      "At risk",
      {
        blocked: 2,
        highConflicts: 2,
        unverified: 0,
        criticalExposureCount: undefined,
      },
    ],
    [
      49,
      "Critical",
      { blocked: 2, highConflicts: 2, unverified: 0, criticalExposureCount: 1 },
    ],
  ] as const)(
    "score %d yields condition %s",
    (
      expectedScore,
      expectedCondition,
      { blocked, highConflicts, unverified, criticalExposureCount },
    ) => {
      const health = baseHealth({
        blockedConstraints: Array.from({ length: blocked }, (_, i) =>
          constraint(`b${String(i)}`, { state: "BLOCKED" }),
        ),
        openConflicts: Array.from({ length: highConflicts }, (_, i) =>
          conflict(`h${String(i)}`, { severity: "HIGH" }),
        ),
        unverifiedHardConstraints: Array.from({ length: unverified }, (_, i) =>
          constraint(`u${String(i)}`, { hard: true, state: "UNVERIFIED" }),
        ),
      });
      const forecast =
        criticalExposureCount === undefined
          ? undefined
          : baseForecast({
              recoveryAnalysis: {
                status: "PROTECTION_REQUIRED",
                recoveryAvailable: false,
                recoveryStandbyAvailable: false,
                advisoryOnly: true,
                levers: [],
                protectionActions: [],
                criticalExposureCount,
              },
            });
      const summary = buildProjectSummary(baseModel(), forecast, health);
      expect(summary.integrity.score).toBe(expectedScore);
      expect(summary.integrity.condition).toBe(expectedCondition);
    },
  );

  it("never modifies the documented weights or adds undocumented penalties (100 with no findings)", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.integrity.score).toBe(100);
    expect(summary.integrity.condition).toBe("Stable");
  });
});

describe("buildProjectSummary: primary driver", () => {
  it("names the blocked constraint first when one exists", () => {
    const health = baseHealth({
      blockedConstraints: [
        constraint("blocker-1", { label: "Electrical final" }),
      ],
      openConflicts: [
        conflict("c1", { severity: "HIGH", description: "Schedule clash" }),
      ],
    });
    const summary = buildProjectSummary(baseModel(), undefined, health);
    expect(summary.integrity.primaryDriver).toContain("Electrical final");
  });

  it("falls back to a HIGH conflict when no blocked constraint exists", () => {
    const health = baseHealth({
      openConflicts: [
        conflict("c1", { severity: "HIGH", description: "Schedule clash" }),
      ],
    });
    const summary = buildProjectSummary(baseModel(), undefined, health);
    expect(summary.integrity.primaryDriver).toContain("Schedule clash");
  });

  it("is deterministic across repeated calls with the same input", () => {
    const health = baseHealth({
      blockedConstraints: [
        constraint("blocker-1", { label: "Electrical final" }),
      ],
    });
    const a = buildProjectSummary(baseModel(), undefined, health);
    const b = buildProjectSummary(baseModel(), undefined, health);
    expect(a.integrity.primaryDriver).toBe(b.integrity.primaryDriver);
  });

  it("reports a stable message when there is no material penalty", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.integrity.primaryDriver.length).toBeGreaterThan(0);
    expect(summary.integrity.score).toBe(100);
  });
});

describe("buildProjectSummary: budget honesty", () => {
  it("case A: baseline and spent both known", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [],
        budget: { baseline: 310000, spent: 100000, currency: "USD" },
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.budget.baseline).toBe(310000);
    expect(summary.budget.spent).toBe(100000);
    expect(summary.budget.remaining).toBe(210000);
    expect(summary.budget.spentPercent).not.toBeNull();
    expect(summary.budget.spentPercent).toBeCloseTo(32, 0);
  });

  it("case B: spent absent -- remaining/spentPercent never fabricated", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [],
        budget: { baseline: 310000, currency: "USD" },
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.budget.baseline).toBe(310000);
    expect(summary.budget.spent).toBeNull();
    expect(summary.budget.remaining).toBeNull();
    expect(summary.budget.spentPercent).toBeNull();
  });

  it("case C: projectProfile entirely absent -- all four null", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.budget).toEqual({
      baseline: null,
      spent: null,
      remaining: null,
      spentPercent: null,
    });
  });

  it("case D: baseline 0 never divides by zero or produces NaN/Infinity", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [],
        budget: { baseline: 0, spent: 500, currency: "USD" },
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.budget.baseline).toBe(0);
    expect(summary.budget.spentPercent).toBeNull();
    expect(Number.isFinite(summary.budget.remaining ?? 0)).toBe(true);
    expect(summary.budget.remaining).not.toBeNull();
  });

  it("never infers spend from commercialSignals, contract values, forecast, or activity completion", () => {
    const model = baseModel({
      activities: {
        a: activity("a", { state: "COMPLETE" }),
      },
      commercialSignals: {
        cs1: {
          id: "cs1",
          kind: "CONTRACT_VALUE",
          activityIds: [],
          workPackage: "General",
        } as unknown as ProjectModelV094["commercialSignals"] extends
          Record<string, infer T> | undefined
          ? T
          : never,
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.budget).toEqual({
      baseline: null,
      spent: null,
      remaining: null,
      spentPercent: null,
    });
  });
});

describe("buildProjectSummary: Phase 4 financials (Task 8 cross-module sync)", () => {
  function financialsWith(
    overrides: Partial<ProjectFinancialsV097> = {},
  ): ProjectFinancialsV097 {
    return {
      currency: "USD",
      baselineSourceIds: [],
      categories: {},
      budgetLines: {},
      commitments: {},
      actualCosts: {},
      changeOrders: {},
      ...overrides,
    };
  }

  it("is null when the project's financials were never initialized -- never a fabricated $0 summary", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.financials).toBeNull();
  });

  it("never conflates the Phase 4 financials with the legacy projectProfile.budget field", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [],
        budget: { baseline: 310000, spent: 100000, currency: "USD" },
      },
      financials: financialsWith(),
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.budget).toEqual({
      baseline: 310000,
      spent: 100000,
      remaining: 210000,
      spentPercent: 32,
    });
    expect(summary.financials).not.toBeNull();
    expect(summary.financials?.currency).toBe("USD");
  });

  it("reports the exact same numbers buildProjectFinancialSummary itself would -- never a separate recomputation", () => {
    const model = baseModel({
      financials: financialsWith({
        baseline: { amountMinor: 40000000, currency: "USD" },
        changeOrders: {
          co1: {
            id: "co1",
            title: "Cabinetry upgrade",
            status: "APPROVED",
            cost: { amountMinor: 1250000, currency: "USD" },
            costAllocations: [],
            scopeItemIds: [],
            activityIds: [],
            sourceIds: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        },
      }),
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.financials?.revisedBudget).toEqual({
      amountMinor: 41250000,
      currency: "USD",
    });
  });
});

describe("buildProjectSummary: scope comes only from the approved profile", () => {
  it("preserves id/label/phase from projectProfile.baselineScope", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [
          { id: "kitchen", label: "Kitchen", phase: "General" },
          { id: "flooring", label: "Flooring", phase: "Finishes" },
        ],
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.scope).toEqual([
      { id: "kitchen", label: "Kitchen", phase: "General" },
      { id: "flooring", label: "Flooring", phase: "Finishes" },
    ]);
  });

  it("returns an empty array when there is no profile, never fabricating scope from activities", () => {
    const model = baseModel({
      activities: { a: activity("a") },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.scope).toEqual([]);
  });
});

describe("buildProjectSummary: committed vs forecast schedule", () => {
  it("an activity with scheduleLock.startDate only appears in committed with that start date", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          scheduleLock: { startDate: "2026-09-14", sourceId: "src-1" },
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.committed).toHaveLength(1);
    expect(summary.schedule.committed[0]).toMatchObject({
      activityId: "a",
      startDate: "2026-09-14",
      finishDate: null,
      basis: "COMMITTED",
    });
    expect(summary.schedule.forecast).toEqual([]);
  });

  it("an activity with scheduleLock.finishDate only appears in committed with that finish date", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          scheduleLock: { finishDate: "2026-09-20", sourceId: "src-1" },
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.committed[0]).toMatchObject({
      activityId: "a",
      startDate: null,
      finishDate: "2026-09-20",
      basis: "COMMITTED",
    });
  });

  it("an activity with both a committed start and finish reports both", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          scheduleLock: {
            startDate: "2026-09-14",
            finishDate: "2026-09-20",
            sourceId: "src-1",
          },
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.committed[0]).toMatchObject({
      startDate: "2026-09-14",
      finishDate: "2026-09-20",
      basis: "COMMITTED",
    });
  });

  it("an activity with no lock but a forecast entry appears only in schedule.forecast", () => {
    const model = baseModel({
      activities: { a: activity("a") },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-10-01", "2026-10-05"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.schedule.committed).toEqual([]);
    expect(summary.schedule.forecast).toHaveLength(1);
    expect(summary.schedule.forecast[0]).toMatchObject({
      activityId: "a",
      startDate: "2026-10-01",
      finishDate: "2026-10-05",
      basis: "FORECAST",
    });
  });

  it("with no forecast snapshot, unlocked activities produce no forecast schedule items", () => {
    const model = baseModel({
      activities: { a: activity("a") },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.forecast).toEqual([]);
    expect(summary.schedule.committed).toEqual([]);
  });

  it("never lets a forecast date create a committed item, and never duplicates a locked activity into forecast", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          scheduleLock: { startDate: "2026-09-14", sourceId: "src-1" },
        }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-11-01", "2026-11-05"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.schedule.committed).toHaveLength(1);
    expect(summary.schedule.committed[0]?.startDate).toBe("2026-09-14");
    expect(summary.schedule.forecast).toEqual([]);
  });

  // Task 8 pilot smoke correction: once an activity has actually started, a committed START on
  // that activity is settled history, not a still-pending commitment -- continuing to list it in
  // `committed` would present it as simultaneously awaiting a future start and already under way
  // (the exact contradiction the pilot smoke test caught after "Demolition started today"). This
  // is the start-ONLY lock case: nothing else on the lock remains pending, so the row is omitted
  // entirely. Never moved into `forecast` either -- a probabilistic forecast date for a settled
  // fact is its own dishonesty.
  it("an activity with a start-only schedule lock and an actualStart no longer appears in committed (nor forecast)", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "IN_PROGRESS",
          scheduleLock: { startDate: "2026-09-14", sourceId: "src-1" },
          actualStart: "2026-09-06",
        }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-09-06", "2026-09-10"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.schedule.committed).toEqual([]);
    expect(summary.schedule.forecast).toEqual([]);
  });

  // Task 8 pilot smoke correction (narrower round): the fix above originally suppressed the
  // ENTIRE committed row the moment actualStart existed -- correct for a start-only lock, but it
  // also silently hid a still-active committed FINISH on a lock that carries both fields. Locked
  // start Sep 14 / finish Sep 18, actual start Sep 12: Sep 14 is settled, but Sep 18 remains a
  // live, unsatisfied commitment that must stay visible.
  it("an activity with a start+finish schedule lock and only an actualStart keeps the row, with startDate settled to null and the original finishDate intact", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "IN_PROGRESS",
          scheduleLock: {
            startDate: "2026-09-14",
            finishDate: "2026-09-18",
            sourceId: "src-1",
          },
          actualStart: "2026-09-12",
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.committed).toHaveLength(1);
    expect(summary.schedule.committed[0]).toMatchObject({
      activityId: "a",
      startDate: null,
      finishDate: "2026-09-18",
      basis: "COMMITTED",
    });
    expect(summary.schedule.forecast).toEqual([]);
  });

  // A finish-only lock never had a committed start to begin with, so actualStart settles nothing
  // that was pending -- the committed finish simply remains, exactly as if actualStart were absent.
  it("an activity with a finish-only schedule lock and an actualStart still shows the committed finish", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "IN_PROGRESS",
          scheduleLock: { finishDate: "2026-09-18", sourceId: "src-1" },
          actualStart: "2026-09-12",
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.committed).toHaveLength(1);
    expect(summary.schedule.committed[0]).toMatchObject({
      activityId: "a",
      startDate: null,
      finishDate: "2026-09-18",
      basis: "COMMITTED",
    });
  });

  // Once actualFinish also exists, the committed finish is settled too -- with both locked fields
  // now retired by their own matching actual fact, no pending committed row remains at all.
  it("an activity with a start+finish schedule lock and both actualStart and actualFinish has no pending committed row", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "COMPLETE",
          scheduleLock: {
            startDate: "2026-09-14",
            finishDate: "2026-09-18",
            sourceId: "src-1",
          },
          actualStart: "2026-09-12",
          actualFinish: "2026-09-19",
        }),
      },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.schedule.committed).toEqual([]);
    expect(summary.schedule.forecast).toEqual([]);
  });
});

describe("buildProjectSummary: primary exposure", () => {
  it("uses the first blocked constraint when one exists", () => {
    const health = baseHealth({
      blockedConstraints: [constraint("b1", { label: "Electrical final" })],
    });
    const summary = buildProjectSummary(baseModel(), undefined, health);
    expect(summary.primaryExposure).toContain("Electrical final");
  });

  it("falls back to the first HIGH conflict when no blocked constraint exists", () => {
    const health = baseHealth({
      openConflicts: [
        conflict("c1", { severity: "MEDIUM", description: "Minor overlap" }),
        conflict("c2", {
          severity: "HIGH",
          description: "Glass vs paint clash",
        }),
      ],
    });
    const summary = buildProjectSummary(baseModel(), undefined, health);
    expect(summary.primaryExposure).toContain("Glass vs paint clash");
  });

  it("falls back to the first forecast PM action when no blocked/HIGH-conflict exists", () => {
    const forecast = baseForecast({
      pmActions: [
        {
          activityId: "a",
          priority: "CRITICAL",
          requiredBy: "2026-09-10",
          dueStatus: "DUE_NOW",
          truthState: "UNVERIFIED",
          action: "Confirm electrical trade availability",
        },
      ],
    });
    const summary = buildProjectSummary(baseModel(), forecast, baseHealth());
    expect(summary.primaryExposure).toBe(
      "Confirm electrical trade availability",
    );
  });

  it("falls back to the truthful default when nothing is exposed", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.primaryExposure).toBe("No critical exposure identified.");
  });
});

describe("buildProjectSummary: next movement", () => {
  it("chooses the earliest incomplete activity by forecast likely start by default", () => {
    const model = baseModel({
      activities: {
        a: activity("a", { state: "NOT_STARTED" }),
        b: activity("b", { state: "NOT_STARTED" }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-10-05", "2026-10-10"),
        b: activityForecast("b", "2026-09-20", "2026-09-25"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).toContain("b");
    expect(summary.nextMovement).not.toContain("Committed");
  });

  it("ignores COMPLETE activities entirely", () => {
    const model = baseModel({
      activities: {
        a: activity("a", { state: "COMPLETE" }),
        b: activity("b", { state: "NOT_STARTED" }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-09-01", "2026-09-05"),
        b: activityForecast("b", "2026-10-01", "2026-10-05"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).toContain("b");
  });

  it("prefers a committed start earlier than the earliest forecast start, and labels it Committed", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "NOT_STARTED",
          scheduleLock: { startDate: "2026-09-01", sourceId: "src-1" },
        }),
        b: activity("b", { state: "NOT_STARTED" }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        b: activityForecast("b", "2026-10-01", "2026-10-05"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).toContain("Committed");
    expect(summary.nextMovement).toContain("a");
  });

  it("keeps the forecast choice when the committed start is not earlier than the forecast start", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "NOT_STARTED",
          scheduleLock: { startDate: "2026-11-01", sourceId: "src-1" },
        }),
        b: activity("b", { state: "NOT_STARTED" }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        b: activityForecast("b", "2026-10-01", "2026-10-05"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).not.toContain("Committed");
    expect(summary.nextMovement).toContain("b");
  });

  it("never uses a committed finish date as if it were a committed start", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "NOT_STARTED",
          scheduleLock: { finishDate: "2026-01-01", sourceId: "src-1" },
        }),
        b: activity("b", { state: "NOT_STARTED" }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        b: activityForecast("b", "2026-10-01", "2026-10-05"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).not.toContain("Committed");
    expect(summary.nextMovement).toContain("b");
  });

  it("returns a concise truthful fallback when no incomplete schedulable activity exists", () => {
    const model = baseModel({
      activities: { a: activity("a", { state: "COMPLETE" }) },
    });
    const summary = buildProjectSummary(model, undefined, baseHealth());
    expect(summary.nextMovement.length).toBeGreaterThan(0);
    expect(summary.nextMovement).not.toContain("Committed");
  });

  // Task 8 pilot smoke correction: an activity's own forecast is frequently derived FROM its
  // schedule lock (solveScenario applies the lock as the activity's candidate start), so an exact
  // tie between the earliest committed date and the earliest forecast date is common, not a rare
  // edge case -- and is not evidence the forecast is somehow more authoritative. Previously the
  // strict `<` comparison let a tie fall through to the forecast phrasing, mislabeling a real
  // commitment as a mere forecast.
  it("treats a committed start that exactly ties the earliest forecast start as Committed, not forecast", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "NOT_STARTED",
          scheduleLock: { startDate: "2026-09-14", sourceId: "src-1" },
        }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-09-14", "2026-09-18"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).toBe("Committed: a starts 2026-09-14.");
  });

  // Task 8 pilot smoke correction: describing an already-started activity as "forecast to start"
  // its own actualStart date directly contradicts the accepted fact that it started. It also must
  // never be relabeled "Committed" (the old commitment is settled history, not upcoming) and it
  // takes priority over any still-not-started candidate, however much earlier that candidate's
  // date might be labeled -- something already under way is the most immediately relevant fact.
  it("describes an IN_PROGRESS activity truthfully instead of as 'forecast to start' or 'Committed', ahead of any not-started candidate", () => {
    const model = baseModel({
      activities: {
        a: activity("a", {
          state: "IN_PROGRESS",
          scheduleLock: { startDate: "2026-09-14", sourceId: "src-1" },
          actualStart: "2026-09-06",
        }),
        b: activity("b", { state: "NOT_STARTED" }),
      },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-09-06", "2026-09-10"),
        b: activityForecast("b", "2026-09-20", "2026-09-25"),
      },
    });
    const summary = buildProjectSummary(model, forecast, baseHealth());
    expect(summary.nextMovement).toBe("a is in progress (started 2026-09-06).");
    expect(summary.nextMovement).not.toContain("forecast to start");
    expect(summary.nextMovement).not.toContain("Committed");
  });
});

describe("buildProjectSummary: projected completion", () => {
  it("reflects forecast.completion.likely when a forecast exists", () => {
    const forecast = baseForecast({
      completion: {
        optimistic: "2026-11-01",
        likely: "2026-11-15",
        conservative: "2026-12-01",
      },
    });
    const summary = buildProjectSummary(baseModel(), forecast, baseHealth());
    expect(summary.projectedCompletion).toBe("2026-11-15");
  });

  it("is null when no forecast exists, with no inference/extra prediction", () => {
    const summary = buildProjectSummary(baseModel(), undefined, baseHealth());
    expect(summary.projectedCompletion).toBeNull();
  });
});

describe("buildProjectSummary: cheap, deterministic, pure", () => {
  it("is a plain synchronous function, never async", () => {
    expect(buildProjectSummary.constructor.name).not.toBe("AsyncFunction");
  });

  it("produces the same output for the same input", () => {
    const model = baseModel({
      activities: {
        a: activity("a", { state: "IN_PROGRESS" }),
      },
      projectProfile: {
        baselineScope: [{ id: "kitchen", label: "Kitchen", phase: "General" }],
        budget: { baseline: 100, spent: 50, currency: "USD" },
      },
    });
    const health = baseHealth({
      blockedConstraints: [constraint("b1")],
    });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-09-01", "2026-09-05"),
      },
    });
    const first = buildProjectSummary(model, forecast, health);
    const second = buildProjectSummary(model, forecast, health);
    expect(first).toEqual(second);
  });

  it("never mutates the model, forecast, or health inputs", () => {
    const model = baseModel({
      activities: { a: activity("a", { state: "IN_PROGRESS" }) },
    });
    const health = baseHealth({ blockedConstraints: [constraint("b1")] });
    const forecast = baseForecast({
      activityForecasts: {
        a: activityForecast("a", "2026-09-01", "2026-09-05"),
      },
    });
    const modelBefore = structuredClone(model);
    const healthBefore = structuredClone(health);
    const forecastBefore = structuredClone(forecast);
    buildProjectSummary(model, forecast, health);
    expect(model).toEqual(modelBefore);
    expect(health).toEqual(healthBefore);
    expect(forecast).toEqual(forecastBefore);
  });
});

describe("buildProjectSummary: Phase 3 scope sync (factual only, never fabricated)", () => {
  it("lists BLOCKED scope items by description, and nothing else", () => {
    const model = baseModel({
      scopeItems: {
        s1: {
          id: "s1",
          description: "Custom closet",
          phase: "Finishes",
          active: true,
          status: "BLOCKED",
          included: true,
          activityIds: [],
          planDocumentRefs: [],
          sourceIds: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        s2: {
          id: "s2",
          description: "Kitchen backsplash",
          phase: "Finishes",
          active: true,
          status: "IN_PROGRESS",
          included: true,
          activityIds: [],
          planDocumentRefs: [],
          sourceIds: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    });
    const health = baseHealth();
    const summary = buildProjectSummary(model, undefined, health);
    expect(summary.blockedScopeItems).toEqual(["Custom closet"]);
  });

  it("counts scope items added after baseline, and only those", () => {
    const model = baseModel({
      projectProfile: {
        baselineScope: [
          { id: "tile", label: "Master shower tile", phase: "Finishes" },
        ],
      },
      scopeItems: {
        lamp: {
          id: "lamp",
          description: "Exterior lamp-post relocation",
          phase: "Exterior",
          active: true,
          status: "NOT_STARTED",
          included: true,
          activityIds: [],
          planDocumentRefs: [],
          sourceIds: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    });
    const health = baseHealth();
    const summary = buildProjectSummary(model, undefined, health);
    // "tile" is untouched baseline scope (not added after baseline); "lamp" has no baseline
    // counterpart at all.
    expect(summary.scopeAddedAfterBaselineCount).toBe(1);
  });

  it("never blends scope completion into progressPercent", () => {
    const model = baseModel({
      activities: { a: activity("a", { state: "NOT_STARTED" }) },
      scopeItems: {
        s1: {
          id: "s1",
          description: "Custom closet",
          phase: "Finishes",
          active: true,
          status: "COMPLETE",
          included: true,
          activityIds: [],
          planDocumentRefs: [],
          sourceIds: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    });
    const health = baseHealth();
    const summary = buildProjectSummary(model, undefined, health);
    expect(summary.progressPercent).toBe(0);
  });
});
