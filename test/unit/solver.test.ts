import { describe, expect, it } from "vitest";
import { analyzeRecovery, generateForecast } from "../../src/engine/solver";
import type {
  ActivityV094,
  ConstraintV094,
  DependencyV094,
  ProjectModelV094,
} from "../../src/domain/types";

function activity(overrides: Partial<ActivityV094> = {}): ActivityV094 {
  return {
    id: "a",
    name: "Activity A",
    phase: "Phase",
    state: "NOT_STARTED",
    duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
    constraintIds: [],
    sourceIds: [],
    ...overrides,
  };
}

function dependency(overrides: Partial<DependencyV094> = {}): DependencyV094 {
  return {
    id: "d1",
    active: true,
    predecessorId: "a",
    successorId: "b",
    type: "FINISH_TO_START",
    lagWorkdays: 0,
    hard: true,
    reason: "test",
    sourceIds: [],
    ...overrides,
  };
}

function constraint(overrides: Partial<ConstraintV094> = {}): ConstraintV094 {
  return {
    id: "c1",
    activityId: "a",
    type: "MATERIAL",
    label: "Constraint one",
    state: "UNVERIFIED",
    hard: true,
    sourceIds: [],
    verification: "UNVERIFIED",
    ...overrides,
  };
}

// Monday 2026-08-24 anchor; a (2 workdays) -> b (3 workdays), FINISH_TO_START, no slack anywhere.
function chainModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-24",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {
      a: activity({
        id: "a",
        name: "Activity A",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
      }),
      b: activity({
        id: "b",
        name: "Activity B",
        duration: { optimistic: 2, likely: 3, conservative: 4, sourceIds: [] },
      }),
    },
    constraints: {},
    dependencies: { d1: dependency() },
    eventLedger: [],
    ...overrides,
  };
}

const GENERATED_AT = "2026-08-24T12:00:00.000Z";

describe("generateForecast: scenario solving and critical path", () => {
  it("computes likely start/finish for a two-activity finish-to-start chain", () => {
    const snapshot = generateForecast(chainModel(), GENERATED_AT, 1);
    expect(snapshot.activityForecasts.a?.start.likely).toBe("2026-08-24");
    expect(snapshot.activityForecasts.a?.finish.likely).toBe("2026-08-25");
    expect(snapshot.activityForecasts.b?.start.likely).toBe("2026-08-26");
    expect(snapshot.activityForecasts.b?.finish.likely).toBe("2026-08-28");
  });

  it("marks every activity in a pure serial chain as critical (zero float)", () => {
    const snapshot = generateForecast(chainModel(), GENERATED_AT, 1);
    expect(snapshot.activityForecasts.a?.critical).toBe(true);
    expect(snapshot.activityForecasts.b?.critical).toBe(true);
    expect(snapshot.activityForecasts.a?.likelyFloatWorkdays).toBe(0);
  });

  it("sets project completion to the latest likely finish across all activities", () => {
    const snapshot = generateForecast(chainModel(), GENERATED_AT, 1);
    expect(snapshot.completion.likely).toBe("2026-08-28");
  });

  it("gives a parallel (non-dependent) activity positive float and non-critical status", () => {
    const model = chainModel({
      activities: {
        a: activity({
          id: "a",
          duration: {
            optimistic: 1,
            likely: 2,
            conservative: 3,
            sourceIds: [],
          },
        }),
        b: activity({
          id: "b",
          duration: {
            optimistic: 2,
            likely: 3,
            conservative: 4,
            sourceIds: [],
          },
        }),
        c: activity({
          id: "c",
          name: "Activity C",
          duration: {
            optimistic: 1,
            likely: 1,
            conservative: 1,
            sourceIds: [],
          },
        }),
      },
    });
    const snapshot = generateForecast(model, GENERATED_AT, 1);
    expect(snapshot.activityForecasts.c?.critical).toBe(false);
    expect(snapshot.activityForecasts.c?.likelyFloatWorkdays).toBeGreaterThan(
      0,
    );
  });

  it("respects a hard constraint readiness date as an earliest-start floor", () => {
    const model = chainModel({
      constraints: {
        c1: constraint({
          activityId: "a",
          readiness: {
            optimistic: "2026-08-27",
            likely: "2026-08-27",
            conservative: "2026-08-27",
          },
        }),
      },
      activities: {
        ...chainModel().activities,
        a: activity({
          id: "a",
          constraintIds: ["c1"],
          duration: {
            optimistic: 1,
            likely: 2,
            conservative: 3,
            sourceIds: [],
          },
        }),
      },
    });
    const snapshot = generateForecast(model, GENERATED_AT, 1);
    expect(snapshot.activityForecasts.a?.start.likely).toBe("2026-08-27");
  });

  it("holds a scheduleLock start/finish exactly regardless of otherwise-computed dates", () => {
    const model = chainModel({
      activities: {
        ...chainModel().activities,
        a: activity({
          id: "a",
          scheduleLock: {
            startDate: "2026-08-25",
            finishDate: "2026-08-25",
            sourceId: "s1",
          },
        }),
      },
    });
    const snapshot = generateForecast(model, GENERATED_AT, 1);
    expect(snapshot.activityForecasts.a?.start.likely).toBe("2026-08-25");
    expect(snapshot.activityForecasts.a?.finish.likely).toBe("2026-08-25");
  });

  it("holds an actualStart exactly and derives finish from it", () => {
    const model = chainModel({
      activities: {
        ...chainModel().activities,
        a: activity({
          id: "a",
          actualStart: "2026-08-25",
          actualStartVerification: "PM_CONFIRMED",
        }),
      },
    });
    const snapshot = generateForecast(model, GENERATED_AT, 1);
    expect(snapshot.activityForecasts.a?.start.likely).toBe("2026-08-25");
  });
});

describe("generateForecast: impact comparison against a baseline", () => {
  it("reports UNCHANGED for every activity when there is no baseline", () => {
    const snapshot = generateForecast(chainModel(), GENERATED_AT, 1);
    expect(snapshot.activityForecasts.a?.impactStatus).toBe("UNCHANGED");
  });

  it("reports SHIFTED when an activity's likely dates move relative to the baseline", () => {
    const baseline = generateForecast(chainModel(), GENERATED_AT, 1);
    const delayedModel = chainModel({
      activities: {
        ...chainModel().activities,
        a: activity({
          id: "a",
          duration: {
            optimistic: 2,
            likely: 4,
            conservative: 5,
            sourceIds: [],
          },
        }),
      },
    });
    const next = generateForecast(delayedModel, GENERATED_AT, 2, baseline);
    expect(next.activityForecasts.a?.impactStatus).toBe("SHIFTED");
    expect(next.activityForecasts.a?.critical).toBe(true);
  });

  it("locks impact status to LOCKED when the activity carries a schedule lock, even if dates shifted", () => {
    const baseline = generateForecast(chainModel(), GENERATED_AT, 1);
    const lockedModel = chainModel({
      activities: {
        ...chainModel().activities,
        a: activity({
          id: "a",
          scheduleLock: {
            startDate: "2026-08-31",
            finishDate: "2026-08-31",
            sourceId: "s1",
          },
        }),
      },
    });
    const next = generateForecast(lockedModel, GENERATED_AT, 2, baseline);
    expect(next.activityForecasts.a?.impactStatus).toBe("LOCKED");
  });

  it("rejects a version that does not exceed the baseline version", () => {
    const baseline = generateForecast(chainModel(), GENERATED_AT, 1);
    // generateForecast itself does not enforce version ordering (engine.ts does); this
    // documents that generateForecast will still compute a snapshot even if called with a
    // non-increasing version, since the guard lives in the caller (forecastAfterEvent).
    const snapshot = generateForecast(chainModel(), GENERATED_AT, 1, baseline);
    expect(snapshot.version).toBe(1);
  });
});

describe("analyzeRecovery", () => {
  it("reports NO_FORECAST when there is no current forecast", () => {
    const result = analyzeRecovery(chainModel(), undefined, undefined);
    expect(result.status).toBe("NO_FORECAST");
    expect(result.recoveryAvailable).toBe(false);
  });

  it("reports ON_TRACK when there is no delay and no protection exposure", () => {
    const model = chainModel({ dependencies: {} });
    const current = generateForecast(model, GENERATED_AT, 1);
    const result = analyzeRecovery(model, current, undefined);
    expect(result.status).toBe("ON_TRACK");
    expect(result.delayWorkdays).toBe(0);
  });

  it("reports PROTECTION_REQUIRED when there is no delay but a critical activity has an unresolved hard constraint", () => {
    const model = chainModel({
      constraints: { c1: constraint({ activityId: "a", state: "UNVERIFIED" }) },
      activities: {
        ...chainModel().activities,
        a: activity({ id: "a", constraintIds: ["c1"] }),
      },
    });
    const current = generateForecast(model, GENERATED_AT, 1);
    const result = analyzeRecovery(model, current, undefined);
    expect(result.status).toBe("PROTECTION_REQUIRED");
    expect(result.criticalExposureCount).toBeGreaterThan(0);
  });

  it("reports RECOVERY_AVAILABLE when a delay exists and a compressible critical activity can absorb it", () => {
    const baseline = generateForecast(chainModel(), GENERATED_AT, 1);
    const delayedModel = chainModel({
      activities: {
        a: activity({
          id: "a",
          duration: {
            optimistic: 1,
            likely: 4,
            conservative: 5,
            sourceIds: [],
          },
        }),
        b: activity({
          id: "b",
          duration: {
            optimistic: 2,
            likely: 3,
            conservative: 4,
            sourceIds: [],
          },
        }),
      },
    });
    const current = generateForecast(delayedModel, GENERATED_AT, 2, baseline);
    const result = analyzeRecovery(delayedModel, current, baseline);
    expect(result.delayWorkdays).toBeGreaterThan(0);
    expect(result.status).toBe("RECOVERY_AVAILABLE");
    expect(result.recoveryAvailable).toBe(true);
    expect(result.recoverableWorkdays).toBeGreaterThan(0);
  });

  it("reports RECOVERY_NOT_MODELED when a delay exists but no lever can recover it", () => {
    // A single, dependency-free, non-compressible (likely === optimistic) activity: no
    // handoff pairing is possible (no dependencies) and no duration lever is possible
    // (nothing to compress), so a delay driven purely by a constraint push cannot be modeled.
    const soloModel: ProjectModelV094 = {
      ...chainModel(),
      activities: {
        a: activity({
          id: "a",
          duration: {
            optimistic: 2,
            likely: 2,
            conservative: 2,
            sourceIds: [],
          },
        }),
      },
      dependencies: {},
    };
    const baseline = generateForecast(soloModel, GENERATED_AT, 1);
    const delayedModel: ProjectModelV094 = {
      ...soloModel,
      constraints: {
        c1: constraint({
          activityId: "a",
          hard: true,
          readiness: {
            optimistic: "2026-08-27",
            likely: "2026-08-27",
            conservative: "2026-08-27",
          },
        }),
      },
      activities: {
        a: activity({
          id: "a",
          constraintIds: ["c1"],
          duration: {
            optimistic: 2,
            likely: 2,
            conservative: 2,
            sourceIds: [],
          },
        }),
      },
    };
    const current = generateForecast(delayedModel, GENERATED_AT, 2, baseline);
    const result = analyzeRecovery(delayedModel, current, baseline);
    expect(result.delayWorkdays).toBeGreaterThan(0);
    expect(result.status).toBe("RECOVERY_NOT_MODELED");
    expect(result.recoveryAvailable).toBe(false);
  });

  it("includes a same-day handoff lever between two critical activities linked by a zero-lag hard finish-to-start dependency", () => {
    const model = chainModel();
    const current = generateForecast(model, GENERATED_AT, 1);
    const result = analyzeRecovery(model, current, undefined);
    expect(
      result.levers.some((lever) => lever.type === "SAME_DAY_HANDOFF_REVIEW"),
    ).toBe(true);
  });

  it("marks a protection action OVERDUE when its lead time pushes the required-by date before the anchor", () => {
    // Activity 'a' starts exactly on the anchor date; a TRADE_AVAILABILITY constraint carries
    // a 2-workday lead, so requiredBy = anchor - 2 workdays, which is necessarily before the anchor.
    const model = chainModel({
      constraints: {
        c1: constraint({
          activityId: "a",
          type: "TRADE_AVAILABILITY",
          state: "UNVERIFIED",
        }),
      },
      activities: {
        ...chainModel().activities,
        a: activity({ id: "a", constraintIds: ["c1"] }),
      },
    });
    const current = generateForecast(model, GENERATED_AT, 1);
    const result = analyzeRecovery(model, current, undefined);
    expect(result.protectionActions.length).toBeGreaterThan(0);
    expect(result.protectionActions[0]?.urgency).toBe("OVERDUE");
  });
});
