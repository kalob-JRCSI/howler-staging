import { describe, expect, it } from "vitest";
import { computeConfidence } from "../../src/engine/confidence";
import type {
  ActivityV094,
  ConstraintV094,
  DependencyV094,
  ProjectModelV094,
  SourceV094,
  VerificationState,
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
    label: "constraint",
    state: "UNVERIFIED",
    hard: true,
    sourceIds: [],
    verification: "UNVERIFIED",
    ...overrides,
  };
}

function dependency(overrides: Partial<DependencyV094> = {}): DependencyV094 {
  return {
    id: "d1",
    active: true,
    predecessorId: "other",
    successorId: "a1",
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
    activities: {},
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

const GENERATED_AT = "2026-08-26T12:00:00.000Z";

describe("computeConfidence: scopeClarity", () => {
  it("falls back to 0.45 with no scope sources", () => {
    const m = model();
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).scopeClarity).toBe(0.45);
  });

  it("uses authority * reliability for a non-superseded scope source", () => {
    const s = source({
      id: "s1",
      type: "PLAN",
      authority: 0.8,
      reliability: 0.5,
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).scopeClarity).toBeCloseTo(
      0.4,
      10,
    );
  });

  it("scores a superseded scope source at 0.15", () => {
    const s = source({ id: "s1", type: "SCOPE", supersededBySourceId: "s2" });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).scopeClarity).toBeCloseTo(
      0.15,
      10,
    );
  });

  it("ignores a non-scope source type", () => {
    const s = source({
      id: "s1",
      type: "ESTIMATE",
      authority: 1,
      reliability: 1,
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).scopeClarity).toBe(0.45);
  });

  it("clamps a scope score above 1 to exactly 1", () => {
    const s = source({
      id: "s1",
      type: "ENGINEERING",
      authority: 1.5,
      reliability: 1,
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).scopeClarity).toBe(1);
  });
});

describe("computeConfidence: readiness truth-state mapping (materialReadiness)", () => {
  it.each([
    ["SATISFIED", 1],
    ["COMMITTED", 0.82],
    ["FORECASTED", 0.62],
    ["UNVERIFIED", 0.42],
    ["STALE_REVERIFY", 0.42],
    ["BLOCKED", 0],
    ["SOME_UNKNOWN_STATE", 0.35],
  ] as const)("maps constraint state %s to %s", (state, expected) => {
    const c = constraint({ id: "c1", type: "MATERIAL", state });
    const m = model({ constraints: { c1: c } });
    const a = activity({ constraintIds: ["c1"] });
    expect(computeConfidence(m, a, GENERATED_AT).materialReadiness).toBeCloseTo(
      expected,
      10,
    );
  });

  it("falls back to 0.72 with no matching constraints", () => {
    const m = model();
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).materialReadiness).toBe(0.72);
  });

  it("filters constraints by exact type for tradeReadiness vs materialReadiness", () => {
    const material = constraint({
      id: "c1",
      type: "MATERIAL",
      state: "SATISFIED",
    });
    const trade = constraint({
      id: "c2",
      type: "TRADE_AVAILABILITY",
      state: "BLOCKED",
    });
    const m = model({ constraints: { c1: material, c2: trade } });
    const a = activity({ constraintIds: ["c1", "c2"] });
    const result = computeConfidence(m, a, GENERATED_AT);
    expect(result.materialReadiness).toBe(1);
    expect(result.tradeReadiness).toBe(0);
  });
});

describe("computeConfidence: freshness bands", () => {
  it.each([
    ["ESTIMATE", "2026-08-26T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 1], // 0 days
    ["ESTIMATE", "2026-08-19T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 1], // exactly 7 days
    ["ESTIMATE", "2026-08-18T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.9], // 8 days
    ["ESTIMATE", "2026-07-27T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.9], // exactly 30 days
    ["ESTIMATE", "2026-07-26T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.7], // 31 days
    ["ESTIMATE", "2026-05-28T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.7], // exactly 90 days
    ["ESTIMATE", "2026-05-27T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.5], // 91 days
    ["ESTIMATE", "2026-02-27T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.5], // exactly 180 days
    ["ESTIMATE", "2026-02-26T00:00:00.000Z", "2026-08-26T00:00:00.000Z", 0.35], // 181 days
  ] as const)(
    "ages a %s source from %s to %s at %s",
    (type, observedAt, generatedAt, expected) => {
      const s = source({
        id: "s1",
        type,
        observedAt,
        authority: 1,
        reliability: 1,
      });
      const m = model({ sources: { s1: s } });
      const a = activity({ sourceIds: ["s1"] });
      expect(computeConfidence(m, a, generatedAt).freshness).toBeCloseTo(
        expected,
        10,
      );
    },
  );

  it("treats a static-type source as always fresh unless superseded", () => {
    const s = source({
      id: "s1",
      type: "PLAN",
      observedAt: "2020-01-01T00:00:00Z",
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).freshness).toBe(1);
  });

  it("scores a superseded static-type source at 0.2", () => {
    const s = source({
      id: "s1",
      type: "SCOPE",
      observedAt: "2020-01-01T00:00:00Z",
      supersededBySourceId: "s2",
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).freshness).toBe(0.2);
  });

  it("falls back to 0.5 when generatedAt precedes observedAt", () => {
    const s = source({
      id: "s1",
      type: "ESTIMATE",
      observedAt: "2026-08-27T00:00:00Z",
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, "2026-08-26T00:00:00.000Z").freshness).toBe(
      0.5,
    );
  });

  it("falls back to 0.5 when observedAt is unparseable", () => {
    const s = source({ id: "s1", type: "ESTIMATE", observedAt: "not-a-date" });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).freshness).toBe(0.5);
  });

  it("falls back to 0.55 with no sources at all", () => {
    const m = model();
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).freshness).toBe(0.55);
  });
});

describe("computeConfidence: dependencyClarity", () => {
  it("falls back to 0.95 with no incoming hard dependencies", () => {
    const m = model();
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).dependencyClarity).toBe(0.95);
  });

  it("falls back to 0.5 when an incoming hard dependency resolves no sources", () => {
    const dep = dependency({ sourceIds: ["missing-source"] });
    const m = model({ dependencies: { d1: dep } });
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).dependencyClarity).toBe(0.5);
  });

  it("ignores an inactive incoming dependency", () => {
    const dep = dependency({ active: false, sourceIds: ["missing"] });
    const m = model({ dependencies: { d1: dep } });
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).dependencyClarity).toBe(0.95);
  });

  it("ignores a soft (non-hard) incoming dependency", () => {
    const dep = dependency({ hard: false, sourceIds: ["missing"] });
    const m = model({ dependencies: { d1: dep } });
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).dependencyClarity).toBe(0.95);
  });

  it("ignores a dependency where the activity is the predecessor, not the successor", () => {
    const dep = dependency({
      predecessorId: "a1",
      successorId: "other",
      sourceIds: ["missing"],
    });
    const m = model({ dependencies: { d1: dep } });
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).dependencyClarity).toBe(0.95);
  });

  it("averages resolved dependency source scores", () => {
    const s = source({ id: "s1", authority: 1, reliability: 0.5 });
    const dep = dependency({ sourceIds: ["s1"] });
    const m = model({ sources: { s1: s }, dependencies: { d1: dep } });
    const a = activity();
    expect(computeConfidence(m, a, GENERATED_AT).dependencyClarity).toBeCloseTo(
      0.5,
      10,
    );
  });
});

describe("computeConfidence: fieldVerification", () => {
  it("is 1 when the activity has an actualFinish", () => {
    const a = activity({
      actualFinish: "2026-08-26",
      actualFinishVerification: "PM_CONFIRMED",
    });
    expect(computeConfidence(model(), a, GENERATED_AT).fieldVerification).toBe(
      1,
    );
  });

  it("is 0.95 when the activity has an actualStart but no actualFinish", () => {
    const a = activity({
      actualStart: "2026-08-26",
      actualStartVerification: "PM_CONFIRMED",
    });
    expect(computeConfidence(model(), a, GENERATED_AT).fieldVerification).toBe(
      0.95,
    );
  });

  it("falls back to the unverified floor of 0.4 with no field evidence and no satisfied+verified constraint", () => {
    const a = activity();
    expect(computeConfidence(model(), a, GENERATED_AT).fieldVerification).toBe(
      0.4,
    );
  });

  it.each([
    "FIELD_VERIFIED",
    "VERIFIED_ACTUAL",
    "PM_CONFIRMED",
  ] as VerificationState[])(
    "raises the floor to 0.88 for a satisfied constraint verified as %s",
    (verification) => {
      const c = constraint({ state: "SATISFIED", verification });
      const m = model({ constraints: { c1: c } });
      const a = activity({ constraintIds: ["c1"] });
      expect(computeConfidence(m, a, GENERATED_AT).fieldVerification).toBe(
        0.88,
      );
    },
  );

  it("does not raise the floor when the satisfied constraint's verification is not in the accepted list", () => {
    const c = constraint({ state: "SATISFIED", verification: "CORROBORATED" });
    const m = model({ constraints: { c1: c } });
    const a = activity({ constraintIds: ["c1"] });
    expect(computeConfidence(m, a, GENERATED_AT).fieldVerification).toBe(0.4);
  });

  it("averages field-evidence source scores over the floor when present", () => {
    const s = source({
      id: "s1",
      type: "FIELD_REPORT",
      authority: 1,
      reliability: 0.6,
    });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(computeConfidence(m, a, GENERATED_AT).fieldVerification).toBeCloseTo(
      0.6,
      10,
    );
  });
});

describe("computeConfidence: contradictionPenalty", () => {
  it("is 0 with no blocked constraints or superseded sources", () => {
    expect(
      computeConfidence(model(), activity(), GENERATED_AT).contradictionPenalty,
    ).toBe(0);
  });

  it("adds 0.15 per blocked DOCUMENTATION or INFORMATION constraint", () => {
    const c = constraint({ type: "INFORMATION", state: "BLOCKED" });
    const m = model({ constraints: { c1: c } });
    const a = activity({ constraintIds: ["c1"] });
    expect(
      computeConfidence(m, a, GENERATED_AT).contradictionPenalty,
    ).toBeCloseTo(0.15, 10);
  });

  it("does not count a blocked constraint of a different type", () => {
    const c = constraint({ type: "MATERIAL", state: "BLOCKED" });
    const m = model({ constraints: { c1: c } });
    const a = activity({ constraintIds: ["c1"] });
    expect(computeConfidence(m, a, GENERATED_AT).contradictionPenalty).toBe(0);
  });

  it("adds 0.05 per superseded source referenced by the activity", () => {
    const s = source({ id: "s1", supersededBySourceId: "s2" });
    const m = model({ sources: { s1: s } });
    const a = activity({ sourceIds: ["s1"] });
    expect(
      computeConfidence(m, a, GENERATED_AT).contradictionPenalty,
    ).toBeCloseTo(0.05, 10);
  });

  it("caps the combined penalty at 0.4", () => {
    const constraints = Object.fromEntries(
      [0, 1, 2].map((i) => [
        `c${String(i)}`,
        constraint({
          id: `c${String(i)}`,
          type: "DOCUMENTATION",
          state: "BLOCKED",
        }),
      ]),
    );
    const m = model({ constraints });
    const a = activity({ constraintIds: Object.keys(constraints) });
    expect(computeConfidence(m, a, GENERATED_AT).contradictionPenalty).toBe(
      0.4,
    );
  });
});

describe("computeConfidence: historicalEvidence and overall", () => {
  it("always reports historicalEvidence as the fixed constant 0.5", () => {
    expect(
      computeConfidence(model(), activity(), GENERATED_AT).historicalEvidence,
    ).toBe(0.5);
  });

  it("computes overall as the documented weighted sum minus the contradiction penalty", () => {
    const result = computeConfidence(model(), activity(), GENERATED_AT);
    // No sources/constraints/deps/actuals -> every component is its documented fallback.
    const expected =
      0.45 * 0.18 +
      0.95 * 0.16 +
      0.72 * 0.14 +
      0.72 * 0.14 +
      0.72 * 0.1 +
      0.55 * 0.1 +
      0.5 * 0.08 +
      0.4 * 0.1 -
      0;
    expect(result.overall).toBeCloseTo(expected, 10);
  });
});
