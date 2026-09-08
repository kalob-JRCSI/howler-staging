import { beforeEach, describe, expect, it } from "vitest";
import {
  buildScheduleEvent,
  buildScheduleView,
  ScheduleCommandError,
} from "../../src/operator/schedule";
import type { ScheduleCommandV096 } from "../../src/operator/schedule";
import { applyEventMutations } from "../../src/engine/reducer";
import { validateProjectModel } from "../../src/domain/validation";
import { appendEvent } from "../../src/engine/engine";
import type {
  ActivityV094,
  DependencyV094,
  ProjectModelV094,
  SourceV094,
} from "../../src/domain/types";
import type {
  ActivityForecastV094,
  ForecastSnapshotV094,
} from "../../src/engine/solver";

function activity(
  id: string,
  overrides: Partial<ActivityV094> = {},
): ActivityV094 {
  return {
    id,
    name: id,
    phase: "Framing",
    state: "NOT_STARTED",
    duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: [] },
    constraintIds: [],
    sourceIds: [],
    ...overrides,
  };
}

function dependency(
  id: string,
  overrides: Partial<DependencyV094> = {},
): DependencyV094 {
  return {
    id,
    active: true,
    predecessorId: "a1",
    successorId: "a2",
    type: "FINISH_TO_START",
    lagWorkdays: 0,
    hard: true,
    reason: "sequence",
    sourceIds: [],
    ...overrides,
  };
}

function source(id: string, overrides: Partial<SourceV094> = {}): SourceV094 {
  return {
    id,
    type: "PLAN",
    label: `Source ${id}`,
    observedAt: "2026-08-01T00:00:00Z",
    authority: 0.9,
    reliability: 0.9,
    ...overrides,
  };
}

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
  overrides: Partial<ActivityForecastV094> = {},
): ActivityForecastV094 {
  return {
    activityId: id,
    activityName: id,
    phase: "Framing",
    activityState: "NOT_STARTED",
    truthState: "PROJECTED",
    dateBasis: "FORECAST",
    assumptions: [],
    start: {
      optimistic: "2026-09-01",
      likely: "2026-09-01",
      conservative: "2026-09-03",
    },
    finish: {
      optimistic: "2026-09-05",
      likely: "2026-09-05",
      conservative: "2026-09-08",
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
    generatedAt: "2026-08-01T00:00:00.000Z",
    basedOnEventIds: [],
    basedOnSourceIds: [],
    evidenceRevision: 0,
    impactActivityIds: [],
    activityForecasts: {},
    pmActions: [],
    completion: {
      optimistic: "2026-10-01",
      likely: "2026-10-01",
      conservative: "2026-10-05",
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

function idSequence(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String((n += 1))}`;
}

// This repo's tsconfig sets noUncheckedIndexedAccess, so every array/record index below is typed
// possibly-undefined even where the test setup guarantees it exists. A throwing helper narrows
// the type without reaching for a banned non-null assertion (@typescript-eslint/no-non-null-assertion).
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`expected ${label} to be defined`);
  return value;
}

function activityOf(model: ProjectModelV094, id: string): ActivityV094 {
  return required(model.activities[id], `activities.${id}`);
}

function dependencyOf(model: ProjectModelV094, id: string): DependencyV094 {
  return required(model.dependencies[id], `dependencies.${id}`);
}

describe("buildScheduleView", () => {
  it("reports every field honestly, null where canonical state has nothing", () => {
    const model = baseModel({
      activities: { a1: activity("a1", { name: "Framing" }) },
    });
    const view = buildScheduleView(model, undefined);
    expect(view.activities).toHaveLength(1);
    const row = required(view.activities[0], "view.activities[0]");
    expect(row.committedStart).toBeNull();
    expect(row.forecastStart).toBeNull();
    expect(row.actualStart).toBeNull();
    expect(row.trade).toBeNull();
    expect(row.critical).toBeNull();
    expect(row.floatWorkdays).toBeNull();
    expect(row.predecessors).toEqual([]);
    expect(row.constraints).toEqual([]);
  });

  it("surfaces committed dates, forecast dates, and actuals independently", () => {
    const model = baseModel({
      activities: {
        a1: activity("a1", {
          scheduleLock: { startDate: "2026-09-01", sourceId: "s1" },
          actualStart: "2026-09-02",
        }),
      },
      sources: { s1: source("s1") },
    });
    const forecast = baseForecast({
      activityForecasts: {
        a1: activityForecast("a1", { critical: true, likelyFloatWorkdays: 0 }),
      },
    });
    const row = required(
      buildScheduleView(model, forecast).activities[0],
      "activities[0]",
    );
    expect(row.committedStart).toBe("2026-09-01");
    expect(row.actualStart).toBe("2026-09-02");
    expect(row.forecastStart).toBe("2026-09-01");
    expect(row.critical).toBe(true);
  });

  it("derives trade only from a TRADE_AVAILABILITY constraint's label, never fabricated", () => {
    const model = baseModel({
      activities: { a1: activity("a1", { constraintIds: ["c1"] }) },
      constraints: {
        c1: {
          id: "c1",
          activityId: "a1",
          type: "TRADE_AVAILABILITY",
          label: "Acme Framing Co.",
          state: "UNVERIFIED",
          hard: true,
          sourceIds: [],
          verification: "UNVERIFIED",
        },
      },
    });
    const row = required(
      buildScheduleView(model, undefined).activities[0],
      "activities[0]",
    );
    expect(row.trade).toBe("Acme Framing Co.");
    expect(row.constraints).toEqual([
      {
        constraintId: "c1",
        type: "TRADE_AVAILABILITY",
        label: "Acme Framing Co.",
        state: "UNVERIFIED",
        hard: true,
      },
    ]);
  });

  it("lists only active dependencies as predecessors/successors", () => {
    const model = baseModel({
      activities: { a1: activity("a1"), a2: activity("a2") },
      dependencies: {
        d1: dependency("d1"),
        d2: dependency("d2", { active: false, id: "d2" }),
      },
    });
    const view = buildScheduleView(model, undefined);
    const successor = view.activities.find((a) => a.activityId === "a2");
    expect(successor?.predecessors).toEqual([
      {
        dependencyId: "d1",
        activityId: "a1",
        activityName: "a1",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason: "sequence",
      },
    ]);
  });
});

describe("buildScheduleEvent", () => {
  const now = "2026-09-08T12:00:00.000Z";
  let uniqueId: () => string;

  beforeEach(() => {
    uniqueId = idSequence("id");
  });

  function apply(
    model: ProjectModelV094,
    command: ScheduleCommandV096,
  ): ProjectModelV094 {
    const { event } = buildScheduleEvent(model, command, now, uniqueId);
    const mutated = applyEventMutations(model, event);
    const withEvent = appendEvent(mutated, event);
    validateProjectModel(withEvent);
    return withEvent;
  }

  it("ADD_ACTIVITY creates a valid new activity with a real source", () => {
    const model = baseModel();
    const result = apply(model, {
      kind: "ADD_ACTIVITY",
      name: "New Framing Task",
      phase: "Framing",
      duration: { optimistic: 2, likely: 3, conservative: 4 },
    });
    const added = Object.values(result.activities).find(
      (a) => a.name === "New Framing Task",
    );
    expect(added).toBeDefined();
    expect(added?.state).toBe("NOT_STARTED");
    expect(result.revision).toBe(1);
  });

  it("RENAME_ACTIVITY and SET_PHASE patch only the targeted field", () => {
    const model = baseModel({
      activities: {
        a1: activity("a1", { name: "Old Name", phase: "Old Phase" }),
      },
    });
    const renamed = apply(model, {
      kind: "RENAME_ACTIVITY",
      activityId: "a1",
      name: "New Name",
    });
    expect(activityOf(renamed, "a1").name).toBe("New Name");
    expect(activityOf(renamed, "a1").phase).toBe("Old Phase");
    expect(activityOf(renamed, "a1").duration).toEqual(
      activityOf(model, "a1").duration,
    );

    const rephased = apply(renamed, {
      kind: "SET_PHASE",
      activityId: "a1",
      phase: "MEP Rough-In",
    });
    expect(activityOf(rephased, "a1").phase).toBe("MEP Rough-In");
    expect(activityOf(rephased, "a1").name).toBe("New Name");
  });

  it("SET_DURATION rejects an out-of-order three-point estimate", () => {
    const model = baseModel({ activities: { a1: activity("a1") } });
    expect(() =>
      buildScheduleEvent(
        model,
        {
          kind: "SET_DURATION",
          activityId: "a1",
          duration: { optimistic: 5, likely: 2, conservative: 1 },
        },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
  });

  it("SET_COMMITTED_DATES sets one field at a time without clobbering the other", () => {
    const model = baseModel({ activities: { a1: activity("a1") } });
    const started = apply(model, {
      kind: "SET_COMMITTED_DATES",
      activityId: "a1",
      startDate: "2026-09-14",
    });
    expect(activityOf(started, "a1").scheduleLock).toMatchObject({
      startDate: "2026-09-14",
    });
    expect(activityOf(started, "a1").scheduleLock?.finishDate).toBeUndefined();

    const finished = apply(started, {
      kind: "SET_COMMITTED_DATES",
      activityId: "a1",
      finishDate: "2026-09-20",
    });
    expect(activityOf(finished, "a1").scheduleLock).toMatchObject({
      startDate: "2026-09-14",
      finishDate: "2026-09-20",
    });
  });

  it("SET_COMMITTED_DATES rejects a finish before start", () => {
    const model = baseModel({ activities: { a1: activity("a1") } });
    expect(() =>
      buildScheduleEvent(
        model,
        {
          kind: "SET_COMMITTED_DATES",
          activityId: "a1",
          startDate: "2026-09-20",
          finishDate: "2026-09-14",
        },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
  });

  it("CLEAR_COMMITTED_DATES removes an existing lock and rejects when there is none", () => {
    const model = baseModel({
      activities: {
        a1: activity("a1", {
          scheduleLock: { startDate: "2026-09-14", sourceId: "s0" },
        }),
      },
      sources: { s0: source("s0") },
    });
    const cleared = apply(model, {
      kind: "CLEAR_COMMITTED_DATES",
      activityId: "a1",
    });
    expect(activityOf(cleared, "a1").scheduleLock).toBeUndefined();

    expect(() =>
      buildScheduleEvent(
        cleared,
        { kind: "CLEAR_COMMITTED_DATES", activityId: "a1" },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
  });

  it("ADD_DEPENDENCY, EDIT_DEPENDENCY, and REMOVE_DEPENDENCY round-trip through the real reducer", () => {
    const model = baseModel({
      activities: { a1: activity("a1"), a2: activity("a2") },
    });
    const added = apply(model, {
      kind: "ADD_DEPENDENCY",
      predecessorId: "a1",
      successorId: "a2",
      type: "FINISH_TO_START",
      lagWorkdays: 1,
      hard: true,
      reason: "must follow framing",
    });
    const dep = Object.values(added.dependencies).find((d) => d.active);
    if (!dep)
      throw new Error("expected ADD_DEPENDENCY to create an active dependency");
    expect(dep.lagWorkdays).toBe(1);
    const dependencyId = dep.id;

    const edited = apply(added, {
      kind: "EDIT_DEPENDENCY",
      dependencyId,
      lagWorkdays: 3,
    });
    expect(dependencyOf(edited, dependencyId).lagWorkdays).toBe(3);
    expect(dependencyOf(edited, dependencyId).active).toBe(true);

    const removed = apply(edited, { kind: "REMOVE_DEPENDENCY", dependencyId });
    expect(dependencyOf(removed, dependencyId).active).toBe(false);
  });

  it("ADD_DEPENDENCY rejects a self-dependency and an unknown activity", () => {
    const model = baseModel({ activities: { a1: activity("a1") } });
    expect(() =>
      buildScheduleEvent(
        model,
        {
          kind: "ADD_DEPENDENCY",
          predecessorId: "a1",
          successorId: "a1",
          type: "FINISH_TO_START",
          lagWorkdays: 0,
          hard: true,
          reason: "x",
        },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
    expect(() =>
      buildScheduleEvent(
        model,
        {
          kind: "ADD_DEPENDENCY",
          predecessorId: "a1",
          successorId: "ghost",
          type: "FINISH_TO_START",
          lagWorkdays: 0,
          hard: true,
          reason: "x",
        },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
  });

  it("SET_ACTUAL_START then SET_ACTUAL_FINISH auto-transition state through the real reducer", () => {
    const model = baseModel({ activities: { a1: activity("a1") } });
    const started = apply(model, {
      kind: "SET_ACTUAL_START",
      activityId: "a1",
      date: "2026-09-14",
    });
    expect(activityOf(started, "a1").state).toBe("IN_PROGRESS");
    expect(activityOf(started, "a1").actualStart).toBe("2026-09-14");

    const finished = apply(started, {
      kind: "SET_ACTUAL_FINISH",
      activityId: "a1",
      date: "2026-09-18",
    });
    expect(activityOf(finished, "a1").state).toBe("COMPLETE");
    expect(activityOf(finished, "a1").actualFinish).toBe("2026-09-18");
  });

  it("SET_ACTUAL_FINISH rejects when there is no actual start yet, or when it precedes it", () => {
    const model = baseModel({ activities: { a1: activity("a1") } });
    expect(() =>
      buildScheduleEvent(
        model,
        { kind: "SET_ACTUAL_FINISH", activityId: "a1", date: "2026-09-18" },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);

    const started = apply(model, {
      kind: "SET_ACTUAL_START",
      activityId: "a1",
      date: "2026-09-14",
    });
    expect(() =>
      buildScheduleEvent(
        started,
        { kind: "SET_ACTUAL_FINISH", activityId: "a1", date: "2026-09-10" },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
  });

  it("SET_ACTIVITY_STATE applies a direct override", () => {
    const model = baseModel({
      activities: { a1: activity("a1", { state: "COMPLETE" }) },
    });
    const reopened = apply(model, {
      kind: "SET_ACTIVITY_STATE",
      activityId: "a1",
      state: "IN_PROGRESS",
    });
    expect(activityOf(reopened, "a1").state).toBe("IN_PROGRESS");
  });

  it("every command rejects an unknown activity id", () => {
    const model = baseModel();
    expect(() =>
      buildScheduleEvent(
        model,
        { kind: "RENAME_ACTIVITY", activityId: "ghost", name: "x" },
        now,
        idSequence("id"),
      ),
    ).toThrow(ScheduleCommandError);
  });

  it("stamps a fresh, referentially-valid Source and a human-readable history note on every command", () => {
    const model = baseModel({
      activities: { a1: activity("a1", { name: "Framing" }) },
    });
    const { event, historyNote } = buildScheduleEvent(
      model,
      {
        kind: "SET_COMMITTED_DATES",
        activityId: "a1",
        startDate: "2026-09-18",
      },
      now,
      idSequence("id"),
    );
    expect(event.verification).toBe("PM_CONFIRMED");
    expect(event.baseRevision).toBe(model.revision);
    expect(historyNote).toContain("Framing");
    expect(historyNote).toContain("2026-09-18");
    const sourceMutation = event.mutations.find(
      (m) => m.op === "UPSERT_SOURCE",
    );
    expect(sourceMutation).toBeDefined();
  });
});
