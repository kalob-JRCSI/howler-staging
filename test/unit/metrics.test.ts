import { describe, expect, it } from "vitest";
import {
  compoundImpactRatio,
  horizonBucket,
  summarizeAccuracy,
} from "../../src/engine/metrics";
import type { PredictionAccuracyRecordV094 } from "../../src/engine/metrics";

function record(
  overrides: Partial<PredictionAccuracyRecordV094> = {},
): PredictionAccuracyRecordV094 {
  return {
    horizonDays: 1,
    pointErrorWorkdays: 0,
    rangeHit: true,
    confidenceAtPrediction: 0.7,
    ...overrides,
  };
}

describe("horizonBucket", () => {
  it.each([
    [0, "0-3"],
    [3, "0-3"],
    [4, "4-7"],
    [7, "4-7"],
    [8, "8-14"],
    [14, "8-14"],
    [15, "15-30"],
    [30, "15-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "61+"],
    [365, "61+"],
  ] as const)("buckets %s days as %s", (days, expected) => {
    expect(horizonBucket(days)).toBe(expected);
  });
});

describe("summarizeAccuracy", () => {
  it("returns an empty array for no records", () => {
    expect(summarizeAccuracy([])).toEqual([]);
  });

  it("omits buckets with no records and orders remaining buckets by horizon", () => {
    const records = [record({ horizonDays: 61 }), record({ horizonDays: 1 })];
    const summary = summarizeAccuracy(records);
    expect(summary.map((s) => s.bucket)).toEqual(["0-3", "61+"]);
  });

  it("aggregates count, mean absolute error, signed bias, range coverage, and confidence", () => {
    const records = [
      record({
        horizonDays: 1,
        pointErrorWorkdays: 2,
        rangeHit: true,
        confidenceAtPrediction: 0.6,
      }),
      record({
        horizonDays: 2,
        pointErrorWorkdays: -4,
        rangeHit: false,
        confidenceAtPrediction: 0.8,
      }),
    ];
    const [summary] = summarizeAccuracy(records);
    expect(summary?.bucket).toBe("0-3");
    expect(summary?.count).toBe(2);
    expect(summary?.maeWorkdays).toBeCloseTo(3, 10); // (|2| + |-4|) / 2
    expect(summary?.meanBiasWorkdays).toBeCloseTo(-1, 10); // (2 + -4) / 2
    expect(summary?.rangeCoverage).toBeCloseTo(0.5, 10); // 1 of 2 hit
    expect(summary?.meanConfidence).toBeCloseTo(0.7, 10); // (0.6 + 0.8) / 2
    expect(summary?.calibrationGap).toBeCloseTo(0.5 - 0.7, 10);
  });
});

describe("compoundImpactRatio", () => {
  it("returns undefined when the trigger delay is exactly zero", () => {
    expect(compoundImpactRatio(0, 10)).toBeUndefined();
  });

  it("returns the absolute ratio of final impact to trigger delay", () => {
    expect(compoundImpactRatio(2, -8)).toBe(4);
    expect(compoundImpactRatio(-2, 8)).toBe(4);
  });
});
