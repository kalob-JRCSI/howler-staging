import { describe, expect, it } from "vitest";
import { activityCoverage } from "../../src/engine/coverage";
import type {
  ActivityV094,
  CommercialSignalV094,
  ConstraintV094,
  DependencyV094,
  ProjectModelV094,
  SourceV094,
} from "../../src/domain/types";

function source(overrides: Partial<SourceV094> = {}): SourceV094 {
  return {
    id: "s1",
    type: "PLAN",
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
    label: "constraint",
    state: "UNVERIFIED",
    hard: true,
    sourceIds: [],
    verification: "UNVERIFIED",
    ...overrides,
  };
}

function signal(
  overrides: Partial<CommercialSignalV094> = {},
): CommercialSignalV094 {
  return {
    id: "sig1",
    kind: "ESTIMATE",
    activityIds: ["a1"],
    workPackage: "work",
    amount: 100,
    currency: "USD",
    selected: true,
    scopeCoverage: "FULL",
    sourceIds: [],
    ...overrides,
  };
}

function dependency(overrides: Partial<DependencyV094> = {}): DependencyV094 {
  return {
    id: "d1",
    active: true,
    predecessorId: "a1",
    successorId: "other",
    type: "FINISH_TO_START",
    lagWorkdays: 0,
    hard: true,
    reason: "test",
    sourceIds: [],
    ...overrides,
  };
}

function activity(overrides: Partial<ActivityV094> = {}): ActivityV094 {
  return {
    id: "a1",
    name: "Activity",
    phase: "Phase",
    state: "NOT_STARTED",
    duration: { optimistic: 1, likely: 1, conservative: 1, sourceIds: [] },
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

describe("activityCoverage", () => {
  it("throws for an unknown activity", () => {
    expect(() => activityCoverage(model(), "missing")).toThrow(
      "Unknown activity missing",
    );
  });

  it("uses documented fallbacks with no evidence at all", () => {
    const result = activityCoverage(model(), "a1");
    expect(result.physicalDefinition).toBe(0.2);
    expect(result.commercialCoverage).toBe(0.15);
    expect(result.materialCoverage).toBe(0.35);
    expect(result.tradeCoverage).toBe(0.35);
    expect(result.scheduleDefinition).toBe(0.55);
  });

  describe("physicalDefinition", () => {
    it("scores a non-superseded design source at authority * reliability", () => {
      const s = source({
        id: "s1",
        type: "PLAN",
        authority: 0.8,
        reliability: 0.5,
      });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      expect(activityCoverage(m, "a1").physicalDefinition).toBeCloseTo(0.4, 10);
    });

    it("scores a superseded design source at 0.1", () => {
      const s = source({ id: "s1", type: "SCOPE", supersededBySourceId: "s2" });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      expect(activityCoverage(m, "a1").physicalDefinition).toBeCloseTo(0.1, 10);
    });

    it("ignores a non-design source type", () => {
      const s = source({
        id: "s1",
        type: "ESTIMATE",
        authority: 1,
        reliability: 1,
      });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      expect(activityCoverage(m, "a1").physicalDefinition).toBe(0.2);
    });
  });

  describe("commercialCoverage", () => {
    it.each([
      ["FULL", true, 1],
      ["FULL", false, 0.7],
      ["PARTIAL", true, 0.65],
      ["ALLOWANCE", true, 0.45],
      ["OTHER", true, 0.25],
    ] as const)(
      "scores scopeCoverage=%s selected=%s at %s",
      (scopeCoverage, selected, expected) => {
        const sig = signal({ scopeCoverage, selected });
        const m = model({ activities: { a1: activity() } });
        m.commercialSignals = { sig1: sig };
        expect(activityCoverage(m, "a1").commercialCoverage).toBeCloseTo(
          expected,
          10,
        );
      },
    );

    it("only counts signals referencing the activity", () => {
      const m = model();
      m.commercialSignals = { sig1: signal({ activityIds: ["other"] }) };
      expect(activityCoverage(m, "a1").commercialCoverage).toBe(0.15);
    });
  });

  describe("materialCoverage and tradeCoverage truth-state mapping", () => {
    it.each([
      ["SATISFIED", 1],
      ["COMMITTED", 0.82],
      ["FORECASTED", 0.62],
      ["UNVERIFIED", 0.42],
      ["STALE_REVERIFY", 0.42],
      ["BLOCKED", 0],
      ["SOME_UNKNOWN_STATE", 0.35],
    ] as const)(
      "maps constraint state %s to %s for materialCoverage",
      (state, expected) => {
        const c = constraint({ type: "MATERIAL", state });
        const m = model({
          constraints: { c1: c },
          activities: { a1: activity({ constraintIds: ["c1"] }) },
        });
        expect(activityCoverage(m, "a1").materialCoverage).toBeCloseTo(
          expected,
          10,
        );
      },
    );

    it("falls back tradeCoverage to 0.8 when a CONTRACT/TRADE_CONFIRMATION source is present", () => {
      const s = source({ id: "s1", type: "TRADE_CONFIRMATION" });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      expect(activityCoverage(m, "a1").tradeCoverage).toBe(0.8);
    });

    it("falls back tradeCoverage to 0.35 without a CONTRACT/TRADE_CONFIRMATION source", () => {
      const s = source({ id: "s1", type: "ESTIMATE" });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      expect(activityCoverage(m, "a1").tradeCoverage).toBe(0.35);
    });
  });

  describe("scheduleDefinition", () => {
    it("is 0.9 when an active hard dependency touches the activity", () => {
      const dep = dependency();
      const m = model({ dependencies: { d1: dep } });
      expect(activityCoverage(m, "a1").scheduleDefinition).toBe(0.9);
    });

    it("ignores an inactive dependency", () => {
      const dep = dependency({ active: false });
      const m = model({ dependencies: { d1: dep } });
      expect(activityCoverage(m, "a1").scheduleDefinition).toBe(0.55);
    });

    it("ignores a soft (non-hard) dependency", () => {
      const dep = dependency({ hard: false });
      const m = model({ dependencies: { d1: dep } });
      expect(activityCoverage(m, "a1").scheduleDefinition).toBe(0.55);
    });

    it("is 0.9 for a closeout-phase activity regardless of dependencies, case-insensitively", () => {
      const m = model({
        activities: { a1: activity({ phase: "Project Closeout" }) },
      });
      expect(activityCoverage(m, "a1").scheduleDefinition).toBe(0.9);
    });
  });

  describe("overall and gaps", () => {
    it("computes overall as the documented weighted sum", () => {
      const result = activityCoverage(model(), "a1");
      const expected =
        0.2 * 0.3 + 0.15 * 0.2 + 0.35 * 0.18 + 0.35 * 0.17 + 0.55 * 0.15;
      expect(result.overall).toBeCloseTo(expected, 10);
    });

    it("reports all five gaps when every component is below its threshold", () => {
      const result = activityCoverage(model(), "a1");
      expect(result.gaps).toEqual([
        "Physical scope/design evidence is weak or conflicting",
        "Commercial coverage is incomplete, allowance-only, or unselected",
        "Material readiness/coverage is not sufficiently verified",
        "Trade assignment or availability is not sufficiently verified",
        "Dependency definition is incomplete",
      ]);
    });

    it("reports no physicalDefinition gap exactly at the 0.6 boundary", () => {
      const s = source({
        id: "s1",
        type: "PLAN",
        authority: 1,
        reliability: 0.6,
      });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      const result = activityCoverage(m, "a1");
      expect(result.physicalDefinition).toBe(0.6);
      expect(result.gaps).not.toContain(
        "Physical scope/design evidence is weak or conflicting",
      );
    });

    it("reports a physicalDefinition gap just below the 0.6 boundary", () => {
      const s = source({
        id: "s1",
        type: "PLAN",
        authority: 1,
        reliability: 0.59,
      });
      const m = model({
        sources: { s1: s },
        activities: { a1: activity({ sourceIds: ["s1"] }) },
      });
      const result = activityCoverage(m, "a1");
      expect(result.physicalDefinition).toBeCloseTo(0.59, 10);
      expect(result.gaps).toContain(
        "Physical scope/design evidence is weak or conflicting",
      );
    });

    it("reports no scheduleDefinition gap exactly at the 0.6 boundary is not reachable, but 0.9 clears it", () => {
      const dep = dependency();
      const m = model({ dependencies: { d1: dep } });
      const result = activityCoverage(m, "a1");
      expect(result.gaps).not.toContain("Dependency definition is incomplete");
    });
  });
});
