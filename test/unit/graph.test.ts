import { describe, expect, it } from "vitest";
import { buildGraphIndex, impactCone } from "../../src/engine/graph";
import type {
  ActivityV094,
  DependencyV094,
  ProjectModelV094,
} from "../../src/domain/types";

function activity(id: string): ActivityV094 {
  return {
    id,
    name: id,
    phase: "Phase",
    state: "NOT_STARTED",
    duration: { optimistic: 1, likely: 1, conservative: 1, sourceIds: [] },
    constraintIds: [],
    sourceIds: [],
  };
}

function dependency(
  id: string,
  predecessorId: string,
  successorId: string,
  overrides: Partial<DependencyV094> = {},
): DependencyV094 {
  return {
    id,
    active: true,
    predecessorId,
    successorId,
    type: "FINISH_TO_START",
    lagWorkdays: 0,
    hard: true,
    reason: "test",
    sourceIds: [],
    ...overrides,
  };
}

function model(
  activities: ActivityV094[],
  dependencies: DependencyV094[],
): ProjectModelV094 {
  return {
    projectId: "test-project",
    revision: 0,
    name: "Test project",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: Object.fromEntries(activities.map((a) => [a.id, a])),
    constraints: {},
    dependencies: Object.fromEntries(dependencies.map((d) => [d.id, d])),
    eventLedger: [],
  };
}

describe("buildGraphIndex", () => {
  it("orders activities topologically with alphabetical tie-breaking", () => {
    const m = model(
      [activity("c"), activity("a"), activity("b")],
      [dependency("d1", "a", "c"), dependency("d2", "b", "c")],
    );
    expect(buildGraphIndex(m).topologicalOrder).toEqual(["a", "b", "c"]);
  });

  it("ignores an inactive dependency when computing order and indegree", () => {
    const m = model(
      [activity("a"), activity("b")],
      [dependency("d1", "a", "b", { active: false })],
    );
    expect(buildGraphIndex(m).topologicalOrder).toEqual(["a", "b"]);
  });

  it("does not gate ordering on a soft (non-hard) dependency", () => {
    const m = model(
      [activity("a"), activity("b")],
      [dependency("d1", "b", "a", { hard: false })],
    );
    expect(buildGraphIndex(m).topologicalOrder).toEqual(["a", "b"]);
  });

  it("throws on a hard dependency cycle", () => {
    const m = model(
      [activity("a"), activity("b")],
      [dependency("d1", "a", "b"), dependency("d2", "b", "a")],
    );
    expect(() => buildGraphIndex(m)).toThrow(
      "Hard dependency cycle detected. Publishing must be blocked until the cycle is resolved.",
    );
  });

  it("throws when a dependency references an unknown activity", () => {
    const m = model([activity("a")], [dependency("d1", "a", "missing")]);
    expect(() => buildGraphIndex(m)).toThrow(
      "Dependency d1 references unknown activity",
    );
  });

  it("throws on a self-referential dependency", () => {
    const m = model([activity("a")], [dependency("d1", "a", "a")]);
    expect(() => buildGraphIndex(m)).toThrow(
      "Dependency d1 is self-referential",
    );
  });

  it("throws on a negative lag", () => {
    const m = model(
      [activity("a"), activity("b")],
      [dependency("d1", "a", "b", { lagWorkdays: -1 })],
    );
    expect(() => buildGraphIndex(m)).toThrow(
      /lag must be a non-negative integer/,
    );
  });

  it("populates incoming and outgoing indexes for each dependency", () => {
    const dep = dependency("d1", "a", "b");
    const m = model([activity("a"), activity("b")], [dep]);
    const index = buildGraphIndex(m);
    expect(index.outgoing.a).toEqual([dep]);
    expect(index.incoming.b).toEqual([dep]);
  });
});

describe("impactCone", () => {
  it("returns only downstream activities in topological order", () => {
    const m = model(
      [activity("a"), activity("b"), activity("c"), activity("d")],
      [dependency("d1", "a", "b"), dependency("d2", "b", "c")],
    );
    expect(impactCone(m, ["b"])).toEqual(["b", "c"]);
  });

  it("includes the seed itself even with no downstream activities", () => {
    const m = model([activity("a")], []);
    expect(impactCone(m, ["a"])).toEqual(["a"]);
  });

  it("throws when a seed references an unknown activity", () => {
    const m = model([activity("a")], []);
    expect(() => impactCone(m, ["missing"])).toThrow(
      "Impact seed references unknown activity: missing",
    );
  });
});
