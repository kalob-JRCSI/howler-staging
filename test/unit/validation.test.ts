import { describe, expect, it } from "vitest";
import { validateProjectModel } from "../../src/domain/validation";
import type {
  ActivityV094,
  ConstraintV094,
  EventMutationV094,
  ProjectEventV094,
  ProjectModelV094,
  SourceV094,
} from "../../src/domain/types";

interface Fixture {
  model: ProjectModelV094;
  source: SourceV094;
  activity: ActivityV094;
  constraint: ConstraintV094;
  event: ProjectEventV094;
}

function baseModel(): Fixture {
  const source: SourceV094 = {
    id: "s1",
    type: "PLAN",
    label: "Plan",
    observedAt: "2026-08-26T00:00:00Z",
    authority: 0.9,
    reliability: 0.9,
  };
  const activity: ActivityV094 = {
    id: "a1",
    name: "Activity One",
    phase: "Phase",
    state: "NOT_STARTED",
    duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: ["s1"] },
    constraintIds: ["c1"],
    sourceIds: ["s1"],
  };
  const constraint: ConstraintV094 = {
    id: "c1",
    activityId: "a1",
    type: "MATERIAL",
    label: "Constraint One",
    state: "UNVERIFIED",
    hard: true,
    sourceIds: ["s1"],
    verification: "UNVERIFIED",
  };
  const event: ProjectEventV094 = {
    id: "e1",
    baseRevision: 0,
    projectId: "p1",
    type: "BASELINE_EVIDENCE",
    occurredAt: "2026-08-26T12:00:00Z",
    receivedAt: "2026-08-26T12:00:00Z",
    sourceIds: ["s1"],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["a1"],
    mutations: [],
    payload: {},
  };
  const model: ProjectModelV094 = {
    projectId: "p1",
    revision: 1,
    name: "Test Project",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { s1: source },
    activities: { a1: activity },
    constraints: { c1: constraint },
    dependencies: {},
    eventLedger: [event],
  };
  return { model, source, activity, constraint, event };
}

describe("validateProjectModel", () => {
  it("accepts a well-formed model", () => {
    const { model } = baseModel();
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("requires a projectId", () => {
    const { model } = baseModel();
    model.projectId = "";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("projectId is required");
  });

  it("requires an integer revision >= 0", () => {
    const { model } = baseModel();
    model.revision = -1;
    model.eventLedger = [];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("project revision must be an integer >= 0");
  });

  it("requires a project name", () => {
    const { model } = baseModel();
    model.name = "";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("project name is required");
  });

  it("validates the forecast anchor date", () => {
    const { model } = baseModel();
    model.forecastAnchorDate = "not-a-date";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Invalid ISO schedule date: not-a-date");
  });

  it("requires at least one working weekday", () => {
    const { model } = baseModel();
    model.calendar.workingWeekdays = [];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Work calendar must contain at least one working weekday");
  });

  it("rejects duplicate or out-of-range working weekdays", () => {
    const { model } = baseModel();
    model.calendar.workingWeekdays = [1, 1];
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Work calendar weekdays must be unique integers from 0 through 6",
    );
  });

  it("validates each holiday date", () => {
    const { model } = baseModel();
    model.calendar.holidays = ["2026-02-30"];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Invalid calendar date: 2026-02-30");
  });

  it("rejects a source authority outside the unit interval", () => {
    const { model, source } = baseModel();
    source.authority = 1.5;
    expect(() => {
      validateProjectModel(model);
    }).toThrow("source s1 authority must be between 0 and 1");
  });

  it("rejects a source that supersedes an unknown source", () => {
    const { model, source } = baseModel();
    source.supersededBySourceId = "missing";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Source s1 references unknown superseding source missing");
  });

  it("rejects duration estimates out of optimistic <= likely <= conservative order", () => {
    const { model, activity } = baseModel();
    activity.duration = {
      optimistic: 3,
      likely: 2,
      conservative: 1,
      sourceIds: ["s1"],
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Activity a1 duration estimates must satisfy optimistic <= likely <= conservative",
    );
  });

  it("rejects a non-integer duration value", () => {
    const { model, activity } = baseModel();
    activity.duration.likely = 1.5;
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 duration likely must be an integer >= 1");
  });

  it("rejects an activity referencing an unknown constraint", () => {
    const { model, activity } = baseModel();
    activity.constraintIds = ["missing"];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 references unknown constraint missing");
  });

  it("rejects a constraint attached to the wrong activity", () => {
    const { model, constraint } = baseModel();
    constraint.activityId = "other";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Constraint c1 is attached to the wrong activity");
  });

  it("rejects an activity referencing an unknown source", () => {
    const { model, activity } = baseModel();
    activity.sourceIds = ["missing"];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 references unknown source missing");
  });

  it("rejects actualFinish without actualStart", () => {
    const { model, activity } = baseModel();
    activity.actualFinish = "2026-08-27";
    activity.actualFinishVerification = "PM_CONFIRMED";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 has actualFinish without actualStart");
  });

  it("rejects actualStart missing a verification status", () => {
    const { model, activity } = baseModel();
    activity.actualStart = "2026-08-26";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 actualStart is missing verification status");
  });

  it("rejects actualFinish before actualStart", () => {
    const { model, activity } = baseModel();
    activity.actualStart = "2026-08-27";
    activity.actualStartVerification = "PM_CONFIRMED";
    activity.actualFinish = "2026-08-26";
    activity.actualFinishVerification = "PM_CONFIRMED";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 actualFinish is before actualStart");
  });

  it("rejects a schedule lock finish before its start", () => {
    const { model, activity } = baseModel();
    activity.scheduleLock = {
      startDate: "2026-08-27",
      finishDate: "2026-08-26",
      sourceId: "s1",
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 schedule lock finish precedes start");
  });

  it("rejects a schedule lock referencing an unknown source", () => {
    const { model, activity } = baseModel();
    activity.scheduleLock = { sourceId: "missing" };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Activity a1 schedule lock references unknown source missing");
  });

  it("rejects a constraint referencing an unknown activity", () => {
    const { model } = baseModel();
    model.activities = {};
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Constraint c1 references unknown activity");
  });

  it("rejects a constraint readiness window out of order", () => {
    const { model, constraint } = baseModel();
    constraint.readiness = {
      optimistic: "2026-08-28",
      likely: "2026-08-27",
      conservative: "2026-08-26",
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Constraint c1 readiness window is out of order");
  });

  it("rejects a dependency referencing an unknown source", () => {
    const { model } = baseModel();
    model.dependencies.d1 = {
      id: "d1",
      active: true,
      predecessorId: "a1",
      successorId: "a1",
      type: "FINISH_TO_START",
      lagWorkdays: 0,
      hard: true,
      reason: "test",
      sourceIds: ["missing"],
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Dependency d1 references unknown source missing");
  });

  it("requires the revision to match the event ledger length", () => {
    const { model } = baseModel();
    model.revision = 2;
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Project revision 2 does not match immutable event ledger length 1",
    );
  });

  it("rejects a conflict referencing an unknown activity", () => {
    const { model } = baseModel();
    model.conflicts = {
      conf1: {
        id: "conf1",
        category: "TEST",
        description: "test",
        activityIds: ["missing"],
        sourceIds: [],
        severity: "HIGH",
        status: "OPEN",
      },
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Conflict conf1 references unknown activity missing");
  });

  it("rejects a commercial signal with an invalid amount", () => {
    const { model } = baseModel();
    model.commercialSignals = {
      sig1: {
        id: "sig1",
        kind: "ESTIMATE",
        activityIds: ["a1"],
        workPackage: "test",
        amount: -1,
        currency: "USD",
        selected: true,
        scopeCoverage: "FULL",
        sourceIds: [],
      },
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Commercial signal sig1 has invalid amount");
  });

  it("rejects a workload signal with an invalid value", () => {
    const { model } = baseModel();
    model.workloadSignals = {
      work1: {
        id: "work1",
        activityIds: ["a1"],
        dimension: "AREA",
        value: -1,
        unit: "SF",
        label: "test",
        sourceIds: [],
      },
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Workload signal work1 has invalid value");
  });

  it("rejects a duplicate event ID in the ledger", () => {
    const { model, event } = baseModel();
    model.revision = 2;
    model.eventLedger.push({ ...event, baseRevision: 1 });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Duplicate event ID in ledger: e1");
  });

  it("rejects an event with invalid timestamps", () => {
    const { model, event } = baseModel();
    event.occurredAt = "not-a-timestamp";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Event e1 has invalid timestamps");
  });

  it("rejects an event belonging to a different project", () => {
    const { model, event } = baseModel();
    event.projectId = "other-project";
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Event e1 belongs to a different project");
  });

  it("rejects an event whose baseRevision does not match its ledger position", () => {
    const { model, event } = baseModel();
    event.baseRevision = 5;
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Event e1 baseRevision 5 does not match ledger position 0");
  });

  it("rejects an event referencing an unknown source", () => {
    const { model, event } = baseModel();
    event.sourceIds = ["missing"];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Event e1 references unknown source missing");
  });

  it("rejects an event referencing an unknown impact seed activity", () => {
    const { model, event } = baseModel();
    event.impactSeedActivityIds = ["missing"];
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Event e1 references unknown impact seed missing");
  });

  it("rejects a model with a hard dependency cycle", () => {
    const { model, activity } = baseModel();
    model.activities.a2 = { ...activity, id: "a2", constraintIds: [] };
    model.dependencies = {
      d1: {
        id: "d1",
        active: true,
        predecessorId: "a1",
        successorId: "a2",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason: "test",
        sourceIds: [],
      },
      d2: {
        id: "d2",
        active: true,
        predecessorId: "a2",
        successorId: "a1",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason: "test",
        sourceIds: [],
      },
    };
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Hard dependency cycle detected. Publishing must be blocked until the cycle is resolved.",
    );
  });
});

describe("EventMutationV094 discriminants", () => {
  const knownOps: EventMutationV094["op"][] = [
    "SET_ACTUAL_START",
    "SET_ACTUAL_FINISH",
    "SET_ACTIVITY_STATE",
    "SET_DURATION",
    "SET_CONSTRAINT_STATE",
    "SET_CONSTRAINT_READINESS",
    "SET_SCHEDULE_LOCK",
    "CLEAR_SCHEDULE_LOCK",
    "UPSERT_SOURCE",
    "SUPERSEDE_SOURCE",
    "UPSERT_CONFLICT",
    "RESOLVE_CONFLICT",
    "UPSERT_COMMERCIAL_SIGNAL",
    "UPSERT_WORKLOAD_SIGNAL",
    "UPSERT_ACTIVITY",
    "UPSERT_CONSTRAINT",
    "UPSERT_DEPENDENCY",
    "DEACTIVATE_DEPENDENCY",
  ];

  it("covers exactly the 18 mutation ops found in the baseline reducer", () => {
    expect(knownOps).toHaveLength(18);
    expect(new Set(knownOps).size).toBe(18);
  });

  it("exhaustively discriminates every mutation op at compile time", () => {
    function describeMutation(mutation: EventMutationV094): string {
      switch (mutation.op) {
        case "SET_ACTUAL_START":
          return `${mutation.activityId}:${mutation.date}`;
        case "SET_ACTUAL_FINISH":
          return `${mutation.activityId}:${mutation.date}`;
        case "SET_ACTIVITY_STATE":
          return `${mutation.activityId}:${mutation.state}`;
        case "SET_DURATION":
          return `${mutation.activityId}:${String(mutation.duration.likely)}`;
        case "SET_CONSTRAINT_STATE":
          return `${mutation.constraintId}:${mutation.state}`;
        case "SET_CONSTRAINT_READINESS":
          return `${mutation.constraintId}:${mutation.readiness.likely}`;
        case "SET_SCHEDULE_LOCK":
          return `${mutation.activityId}:${mutation.lock.sourceId}`;
        case "CLEAR_SCHEDULE_LOCK":
          return mutation.activityId;
        case "UPSERT_SOURCE":
          return mutation.source.id;
        case "SUPERSEDE_SOURCE":
          return `${mutation.sourceId}:${mutation.supersededBySourceId}`;
        case "UPSERT_CONFLICT":
          return mutation.conflict.id;
        case "RESOLVE_CONFLICT":
          return `${mutation.conflictId}:${mutation.resolutionNote}`;
        case "UPSERT_COMMERCIAL_SIGNAL":
          return mutation.signal.id;
        case "UPSERT_WORKLOAD_SIGNAL":
          return mutation.signal.id;
        case "UPSERT_ACTIVITY":
          return mutation.activity.id;
        case "UPSERT_CONSTRAINT":
          return mutation.constraint.id;
        case "UPSERT_DEPENDENCY":
          return mutation.dependency.id;
        case "DEACTIVATE_DEPENDENCY":
          return mutation.dependencyId;
      }
    }

    const sample: EventMutationV094 = {
      op: "CLEAR_SCHEDULE_LOCK",
      activityId: "a1",
    };
    expect(describeMutation(sample)).toBe("a1");
  });
});
