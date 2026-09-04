import { describe, expect, it } from "vitest";
import { applyEventMutations } from "../../src/engine/reducer";
import {
  appendEvent,
  forecastAfterEvent,
  forecastInitial,
  publishForecast,
} from "../../src/engine/engine";
import type {
  ActivityV094,
  ConstraintV094,
  EventMutationV094,
  ProjectEventV094,
  ProjectModelV094,
  SourceV094,
} from "../../src/domain/types";

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

function source(overrides: Partial<SourceV094> = {}): SourceV094 {
  return {
    id: "s1",
    type: "PLAN",
    label: "Source one",
    observedAt: "2026-08-26T00:00:00Z",
    authority: 0.9,
    reliability: 0.9,
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
    sources: { s1: source() },
    activities: { a1: activity() },
    constraints: { c1: constraint() },
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

function event(
  mutations: EventMutationV094[],
  overrides: Partial<ProjectEventV094> = {},
): ProjectEventV094 {
  return {
    id: "e1",
    baseRevision: 0,
    projectId: "p1",
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-26T12:00:00Z",
    receivedAt: "2026-08-26T12:00:00Z",
    sourceIds: [],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: [],
    mutations,
    payload: {},
    ...overrides,
  };
}

describe("applyEventMutations: SET_ACTUAL_START / SET_ACTUAL_FINISH", () => {
  it("sets actualStart, its source IDs, verification, and moves state to IN_PROGRESS", () => {
    const e = event(
      [{ op: "SET_ACTUAL_START", activityId: "a1", date: "2026-08-26" }],
      { sourceIds: ["s1"], verification: "PM_CONFIRMED" },
    );
    const result = applyEventMutations(model(), e);
    expect(result.activities.a1?.actualStart).toBe("2026-08-26");
    expect(result.activities.a1?.actualStartSourceIds).toEqual(["s1"]);
    expect(result.activities.a1?.actualStartVerification).toBe("PM_CONFIRMED");
    expect(result.activities.a1?.state).toBe("IN_PROGRESS");
  });

  it("keeps state COMPLETE if it was already COMPLETE when SET_ACTUAL_START fires", () => {
    const e = event([
      { op: "SET_ACTUAL_START", activityId: "a1", date: "2026-08-26" },
    ]);
    const result = applyEventMutations(
      model({ activities: { a1: activity({ state: "COMPLETE" }) } }),
      e,
    );
    expect(result.activities.a1?.state).toBe("COMPLETE");
  });

  it("sets actualFinish and always moves state to COMPLETE", () => {
    const e = event(
      [{ op: "SET_ACTUAL_FINISH", activityId: "a1", date: "2026-08-28" }],
      { sourceIds: ["s1"], verification: "PM_CONFIRMED" },
    );
    const result = applyEventMutations(model(), e);
    expect(result.activities.a1?.actualFinish).toBe("2026-08-28");
    expect(result.activities.a1?.actualFinishSourceIds).toEqual(["s1"]);
    expect(result.activities.a1?.state).toBe("COMPLETE");
  });

  it("throws for an unknown activity in SET_ACTUAL_START", () => {
    const e = event([
      { op: "SET_ACTUAL_START", activityId: "missing", date: "2026-08-26" },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown activity in SET_ACTUAL_START: missing",
    );
  });
});

describe("applyEventMutations: SET_ACTIVITY_STATE / SET_DURATION", () => {
  it("sets the activity state directly", () => {
    const e = event([
      { op: "SET_ACTIVITY_STATE", activityId: "a1", state: "IN_PROGRESS" },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.activities.a1?.state).toBe("IN_PROGRESS");
  });

  it("replaces the duration estimate", () => {
    const e = event([
      {
        op: "SET_DURATION",
        activityId: "a1",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 4,
          sourceIds: ["s1"],
        },
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.activities.a1?.duration).toEqual({
      optimistic: 2,
      likely: 3,
      conservative: 4,
      sourceIds: ["s1"],
    });
  });

  it("throws for an unknown activity in SET_DURATION", () => {
    const e = event([
      {
        op: "SET_DURATION",
        activityId: "missing",
        duration: { optimistic: 1, likely: 1, conservative: 1, sourceIds: [] },
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown activity in SET_DURATION: missing",
    );
  });
});

describe("applyEventMutations: constraint state / readiness", () => {
  it("sets constraint state and verification when provided", () => {
    const e = event([
      {
        op: "SET_CONSTRAINT_STATE",
        constraintId: "c1",
        state: "SATISFIED",
        verification: "PM_CONFIRMED",
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.constraints.c1?.state).toBe("SATISFIED");
    expect(result.constraints.c1?.verification).toBe("PM_CONFIRMED");
  });

  it("leaves verification unchanged when SET_CONSTRAINT_STATE omits it", () => {
    const e = event([
      { op: "SET_CONSTRAINT_STATE", constraintId: "c1", state: "SATISFIED" },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.constraints.c1?.verification).toBe("UNVERIFIED");
  });

  it("sets constraint readiness", () => {
    const e = event([
      {
        op: "SET_CONSTRAINT_READINESS",
        constraintId: "c1",
        readiness: {
          optimistic: "2026-08-26",
          likely: "2026-08-27",
          conservative: "2026-08-28",
        },
        verification: "PM_CONFIRMED",
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.constraints.c1?.readiness).toEqual({
      optimistic: "2026-08-26",
      likely: "2026-08-27",
      conservative: "2026-08-28",
    });
  });

  it("throws for an unknown constraint in SET_CONSTRAINT_STATE", () => {
    const e = event([
      {
        op: "SET_CONSTRAINT_STATE",
        constraintId: "missing",
        state: "SATISFIED",
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown constraint in SET_CONSTRAINT_STATE: missing",
    );
  });
});

describe("applyEventMutations: schedule locks", () => {
  it("sets a schedule lock", () => {
    const e = event([
      {
        op: "SET_SCHEDULE_LOCK",
        activityId: "a1",
        lock: {
          startDate: "2026-08-26",
          finishDate: "2026-08-27",
          sourceId: "s1",
        },
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.activities.a1?.scheduleLock).toEqual({
      startDate: "2026-08-26",
      finishDate: "2026-08-27",
      sourceId: "s1",
    });
  });

  it("clears a schedule lock", () => {
    const e = event([{ op: "CLEAR_SCHEDULE_LOCK", activityId: "a1" }]);
    const result = applyEventMutations(
      model({
        activities: { a1: activity({ scheduleLock: { sourceId: "s1" } }) },
      }),
      e,
    );
    expect(result.activities.a1?.scheduleLock).toBeUndefined();
  });

  it("throws for an unknown activity in SET_SCHEDULE_LOCK", () => {
    const e = event([
      {
        op: "SET_SCHEDULE_LOCK",
        activityId: "missing",
        lock: { sourceId: "s1" },
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown activity in SET_SCHEDULE_LOCK: missing",
    );
  });
});

describe("applyEventMutations: source supersession", () => {
  it("upserts a new source", () => {
    const e = event([
      {
        op: "UPSERT_SOURCE",
        source: source({ id: "s2", label: "New source" }),
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.sources.s2?.label).toBe("New source");
  });

  it("marks a source superseded by another", () => {
    const e = event([
      { op: "SUPERSEDE_SOURCE", sourceId: "s1", supersededBySourceId: "s2" },
    ]);
    const result = applyEventMutations(
      model({
        sources: { s1: source({ id: "s1" }), s2: source({ id: "s2" }) },
      }),
      e,
    );
    expect(result.sources.s1?.supersededBySourceId).toBe("s2");
  });

  it("throws when a source supersedes itself", () => {
    const e = event([
      { op: "SUPERSEDE_SOURCE", sourceId: "s1", supersededBySourceId: "s1" },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "A source cannot supersede itself",
    );
  });

  it("throws when the superseding source is unknown", () => {
    const e = event([
      {
        op: "SUPERSEDE_SOURCE",
        sourceId: "s1",
        supersededBySourceId: "missing",
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown superseding source in SUPERSEDE_SOURCE: missing",
    );
  });

  it("throws when the superseded source itself is unknown", () => {
    const e = event([
      {
        op: "SUPERSEDE_SOURCE",
        sourceId: "missing",
        supersededBySourceId: "s1",
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown source in SUPERSEDE_SOURCE: missing",
    );
  });
});

describe("applyEventMutations: conflicts, commercial and workload signals", () => {
  it("upserts a conflict", () => {
    const e = event([
      {
        op: "UPSERT_CONFLICT",
        conflict: {
          id: "conf1",
          category: "TEST",
          description: "test",
          activityIds: [],
          sourceIds: [],
          severity: "HIGH",
          status: "OPEN",
        },
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.conflicts?.conf1?.status).toBe("OPEN");
  });

  it("resolves a conflict and records the resolution note", () => {
    const e = event([
      {
        op: "RESOLVE_CONFLICT",
        conflictId: "conf1",
        resolutionNote: "handled",
      },
    ]);
    const result = applyEventMutations(
      model({
        conflicts: {
          conf1: {
            id: "conf1",
            category: "TEST",
            description: "test",
            activityIds: [],
            sourceIds: [],
            severity: "HIGH",
            status: "OPEN",
          },
        },
      }),
      e,
    );
    expect(result.conflicts?.conf1?.status).toBe("RESOLVED");
    expect(result.conflicts?.conf1?.resolutionNote).toBe("handled");
  });

  it("throws for an unknown conflict in RESOLVE_CONFLICT", () => {
    const e = event([
      { op: "RESOLVE_CONFLICT", conflictId: "missing", resolutionNote: "n/a" },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown conflict in RESOLVE_CONFLICT: missing",
    );
  });

  it("upserts a commercial signal", () => {
    const e = event([
      {
        op: "UPSERT_COMMERCIAL_SIGNAL",
        signal: {
          id: "sig1",
          kind: "ESTIMATE",
          activityIds: ["a1"],
          workPackage: "wp",
          amount: 1,
          currency: "USD",
          selected: true,
          scopeCoverage: "FULL",
          sourceIds: [],
        },
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.commercialSignals?.sig1?.amount).toBe(1);
  });

  it("upserts a workload signal", () => {
    const e = event([
      {
        op: "UPSERT_WORKLOAD_SIGNAL",
        signal: {
          id: "work1",
          activityIds: ["a1"],
          dimension: "AREA",
          value: 1,
          unit: "SF",
          label: "l",
          sourceIds: [],
        },
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.workloadSignals?.work1?.value).toBe(1);
  });
});

describe("applyEventMutations: activities, constraints, dependencies", () => {
  it("upserts a whole activity", () => {
    const e = event([
      {
        op: "UPSERT_ACTIVITY",
        activity: activity({ id: "a2", name: "Activity Two" }),
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.activities.a2?.name).toBe("Activity Two");
  });

  it("upserts a constraint and links it onto its owning activity's constraintIds", () => {
    const e = event([
      {
        op: "UPSERT_CONSTRAINT",
        constraint: constraint({ id: "c2", activityId: "a1" }),
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.constraints.c2).toBeDefined();
    expect(result.activities.a1?.constraintIds).toContain("c2");
  });

  it("does not duplicate an already-linked constraint ID", () => {
    const e = event([
      {
        op: "UPSERT_CONSTRAINT",
        constraint: constraint({ id: "c1", activityId: "a1" }),
      },
    ]);
    const result = applyEventMutations(
      model({ activities: { a1: activity({ constraintIds: ["c1"] }) } }),
      e,
    );
    expect(result.activities.a1?.constraintIds).toEqual(["c1"]);
  });

  it("throws when UPSERT_CONSTRAINT references an unknown activity", () => {
    const e = event([
      {
        op: "UPSERT_CONSTRAINT",
        constraint: constraint({ id: "c2", activityId: "missing" }),
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "UPSERT_CONSTRAINT references unknown activity missing",
    );
  });

  it("upserts a dependency", () => {
    const e = event([
      {
        op: "UPSERT_DEPENDENCY",
        dependency: {
          id: "d1",
          active: true,
          predecessorId: "a1",
          successorId: "a1",
          type: "FINISH_TO_START",
          lagWorkdays: 0,
          hard: true,
          reason: "r",
          sourceIds: [],
        },
      },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.dependencies.d1).toBeDefined();
  });

  it("deactivates a dependency", () => {
    const e = event([{ op: "DEACTIVATE_DEPENDENCY", dependencyId: "d1" }]);
    const result = applyEventMutations(
      model({
        dependencies: {
          d1: {
            id: "d1",
            active: true,
            predecessorId: "a1",
            successorId: "a1",
            type: "FINISH_TO_START",
            lagWorkdays: 0,
            hard: true,
            reason: "r",
            sourceIds: [],
          },
        },
      }),
      e,
    );
    expect(result.dependencies.d1?.active).toBe(false);
  });

  it("throws for an unknown dependency in DEACTIVATE_DEPENDENCY", () => {
    const e = event([{ op: "DEACTIVATE_DEPENDENCY", dependencyId: "missing" }]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Unknown dependency in DEACTIVATE_DEPENDENCY: missing",
    );
  });
});

describe("applyEventMutations: cloning and immutability", () => {
  it("does not mutate the original model", () => {
    const original = model();
    const e = event([
      { op: "SET_ACTIVITY_STATE", activityId: "a1", state: "COMPLETE" },
    ]);
    applyEventMutations(original, e);
    expect(original.activities.a1?.state).toBe("NOT_STARTED");
  });

  it("applies multiple mutations in array order", () => {
    const e = event([
      { op: "SET_ACTIVITY_STATE", activityId: "a1", state: "IN_PROGRESS" },
      { op: "SET_ACTIVITY_STATE", activityId: "a1", state: "COMPLETE" },
    ]);
    const result = applyEventMutations(model(), e);
    expect(result.activities.a1?.state).toBe("COMPLETE");
  });
});

describe("engine.ts orchestration: appendEvent, forecastAfterEvent, publishForecast", () => {
  it("appendEvent rejects a duplicate event ID", () => {
    const e = event([]);
    const withEvent = appendEvent(model(), e);
    expect(() => appendEvent(withEvent, { ...e, baseRevision: 1 })).toThrow(
      "Duplicate event ID: e1",
    );
  });

  it("appendEvent rejects an event for a different project", () => {
    const e = event([], { projectId: "other" });
    expect(() => appendEvent(model(), e)).toThrow(
      "Event e1 belongs to a different project",
    );
  });

  it("appendEvent rejects a stale baseRevision", () => {
    const e = event([], { baseRevision: 5 });
    expect(() => appendEvent(model(), e)).toThrow(
      "Stale event e1: expected baseRevision 0, got 5",
    );
  });

  it("appendEvent appends to the ledger and increments revision", () => {
    const e = event([]);
    const result = appendEvent(model(), e);
    expect(result.revision).toBe(1);
    expect(result.eventLedger.map((ev) => ev.id)).toEqual(["e1"]);
  });

  it("forecastInitial rejects a non-integer or sub-1 version", () => {
    expect(() =>
      forecastInitial(
        model({ revision: 0, eventLedger: [] }),
        "2026-08-26T12:00:00Z",
        0,
      ),
    ).toThrow("Initial forecast version must be an integer >= 1");
  });

  it("forecastAfterEvent rejects a version that does not exceed the baseline version", () => {
    const initial = forecastInitial(model(), "2026-08-26T12:00:00Z", 1);
    const e = event([], { baseRevision: 0 });
    expect(() =>
      forecastAfterEvent(
        model(),
        e,
        "2026-08-26T12:00:00Z",
        1,
        initial.candidate,
      ),
    ).toThrow("Forecast version must increase beyond baseline version 1");
  });

  it("publishForecast throws when oversight blocked the run", () => {
    const e = event(
      [{ op: "SET_ACTIVITY_STATE", activityId: "a1", state: "COMPLETE" }],
      {
        type: "SCOPE_CHANGE",
        impactSeedActivityIds: [],
      },
    );
    const run = forecastAfterEvent(
      model(),
      e,
      "2026-08-26T12:00:00Z",
      2,
      forecastInitial(model(), "2026-08-26T12:00:00Z", 1).candidate,
    );
    expect(run.oversight.decision).toBe("BLOCK");
    expect(() => publishForecast(run)).toThrow(
      "Forecast cannot be published because oversight review blocked it",
    );
  });

  it("publishForecast succeeds and sets status PUBLISHED when not blocked", () => {
    const run = forecastInitial(model(), "2026-08-26T12:00:00Z", 1);
    expect(run.oversight.decision).not.toBe("BLOCK");
    const published = publishForecast(run);
    expect(published.status).toBe("PUBLISHED");
  });
});
