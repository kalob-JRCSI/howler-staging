import { describe, expect, it } from "vitest";
import {
  calibratedConfidence,
  decayedLearningWeight,
  evaluatePredictionOutcome,
  updateLearningRecord,
} from "../../src/engine/learning";
import type {
  LearningRecordV094,
  LearningUpdateInputV094,
  PredictionOutcomeV094,
} from "../../src/engine/learning";
import type { ProjectModelV094 } from "../../src/domain/types";

const calendarModel: ProjectModelV094 = {
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
};

describe("evaluatePredictionOutcome", () => {
  it("computes the signed workday error between the predicted likely date and the actual date", () => {
    const outcome = evaluatePredictionOutcome(
      calendarModel,
      "pred-1",
      "a1",
      "snap-1",
      {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      "2026-08-28",
      0.7,
      3,
    );
    expect(outcome.pointErrorWorkdays).toBe(2);
  });

  it("marks rangeHit true when the actual date lands exactly on the optimistic boundary", () => {
    const outcome = evaluatePredictionOutcome(
      calendarModel,
      "pred-1",
      "a1",
      "snap-1",
      {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      "2026-08-24",
      0.7,
      3,
    );
    expect(outcome.rangeHit).toBe(true);
  });

  it("marks rangeHit true when the actual date lands exactly on the conservative boundary", () => {
    const outcome = evaluatePredictionOutcome(
      calendarModel,
      "pred-1",
      "a1",
      "snap-1",
      {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      "2026-08-28",
      0.7,
      3,
    );
    expect(outcome.rangeHit).toBe(true);
  });

  it("marks rangeHit false when the actual date is outside the predicted range", () => {
    const outcome = evaluatePredictionOutcome(
      calendarModel,
      "pred-1",
      "a1",
      "snap-1",
      {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      "2026-08-31",
      0.7,
      3,
    );
    expect(outcome.rangeHit).toBe(false);
  });
});

describe("calibratedConfidence", () => {
  function outcome(
    confidenceAtPrediction: number,
    rangeHit: boolean,
  ): PredictionOutcomeV094 {
    return {
      predictionId: "p",
      activityId: "a1",
      horizonDays: 1,
      predicted: {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      actual: "2026-08-26",
      pointErrorWorkdays: 0,
      rangeHit,
      confidenceAtPrediction,
      sourceSnapshotId: "snap",
    };
  }

  it("returns undefined with fewer than 5 matching records", () => {
    const records = [
      outcome(0.7, true),
      outcome(0.7, true),
      outcome(0.7, false),
      outcome(0.7, true),
    ];
    expect(calibratedConfidence(records, 0.7)).toBeUndefined();
  });

  it("returns the empirical hit rate once at least 5 records fall within tolerance", () => {
    const records = [
      outcome(0.7, true),
      outcome(0.7, true),
      outcome(0.7, true),
      outcome(0.7, false),
      outcome(0.7, false),
    ];
    expect(calibratedConfidence(records, 0.7)).toBeCloseTo(0.6, 10);
  });

  it("excludes records outside the tolerance window", () => {
    const records = [
      outcome(0.9, true),
      outcome(0.9, true),
      outcome(0.9, true),
      outcome(0.9, true),
      outcome(0.9, true),
      outcome(0.5, false),
    ];
    expect(calibratedConfidence(records, 0.9, 0.1)).toBe(1);
  });
});

describe("updateLearningRecord", () => {
  function input(
    overrides: Partial<LearningUpdateInputV094> = {},
  ): LearningUpdateInputV094 {
    return {
      id: "rec-1",
      layer: "PROJECT",
      hypothesisType: "OUTCOME",
      subjectKey: "subject",
      hypothesis: "hypothesis",
      projectId: "proj-1",
      eventId: "event-1",
      evidenceKind: "VERIFIED_OUTCOME",
      supportsHypothesis: true,
      lastObservedAt: "2026-08-26T00:00:00Z",
      ...overrides,
    };
  }

  it("initializes a fresh record at OBSERVATION with confidence 0.5 when no evidence counts", () => {
    const record = updateLearningRecord(
      undefined,
      input({ evidenceKind: "CORRELATION" }),
    );
    expect(record.verifiedOutcomeCount).toBe(0);
    expect(record.contradictingOutcomeCount).toBe(0);
    expect(record.confidence).toBe(0.5);
    expect(record.stage).toBe("OBSERVATION");
  });

  it("never counts CORRELATION evidence toward promotion even for a CAUSAL hypothesis", () => {
    const record = updateLearningRecord(
      undefined,
      input({
        evidenceKind: "CORRELATION",
        hypothesisType: "CAUSAL",
        supportsHypothesis: true,
      }),
    );
    expect(record.verifiedOutcomeCount).toBe(0);
  });

  it("requires VERIFIED_CAUSE specifically for a CAUSAL hypothesis, not VERIFIED_OUTCOME", () => {
    const record = updateLearningRecord(
      undefined,
      input({
        evidenceKind: "VERIFIED_OUTCOME",
        hypothesisType: "CAUSAL",
        supportsHypothesis: true,
      }),
    );
    expect(record.verifiedOutcomeCount).toBe(0);
  });

  it("counts VERIFIED_CAUSE for a CAUSAL hypothesis", () => {
    const record = updateLearningRecord(
      undefined,
      input({
        evidenceKind: "VERIFIED_CAUSE",
        hypothesisType: "CAUSAL",
        supportsHypothesis: true,
      }),
    );
    expect(record.verifiedOutcomeCount).toBe(1);
  });

  it("accepts either VERIFIED_OUTCOME or VERIFIED_CAUSE for a non-causal hypothesis", () => {
    const a = updateLearningRecord(
      undefined,
      input({ evidenceKind: "VERIFIED_OUTCOME", hypothesisType: "OTHER" }),
    );
    const b = updateLearningRecord(
      undefined,
      input({ evidenceKind: "VERIFIED_CAUSE", hypothesisType: "OTHER" }),
    );
    expect(a.verifiedOutcomeCount).toBe(1);
    expect(b.verifiedOutcomeCount).toBe(1);
  });

  it("increments contradictingOutcomeCount instead when the evidence does not support the hypothesis", () => {
    const record = updateLearningRecord(
      undefined,
      input({ supportsHypothesis: false }),
    );
    expect(record.contradictingOutcomeCount).toBe(1);
    expect(record.verifiedOutcomeCount).toBe(0);
  });

  it("applies Bayesian shrinkage toward 0.5 as (verified + 2) / (total + 4)", () => {
    let prior: LearningRecordV094 | undefined;
    for (let i = 0; i < 5; i += 1) {
      prior = updateLearningRecord(
        prior,
        input({
          eventId: `event-${String(i)}`,
          projectId: `proj-${String(i)}`,
        }),
      );
    }
    expect(prior?.observationCount).toBe(5);
    expect(prior?.verifiedOutcomeCount).toBe(5);
    expect(prior?.confidence).toBeCloseTo(7 / 9, 10);
  });

  it("stays at OBSERVATION below every promotion threshold", () => {
    const record = updateLearningRecord(undefined, input());
    expect(record.stage).toBe("OBSERVATION");
  });

  it("promotes to EMERGING once total, confidence, and distinct-project thresholds are met", () => {
    let prior: LearningRecordV094 | undefined;
    for (let i = 0; i < 3; i += 1) {
      prior = updateLearningRecord(
        prior,
        input({
          eventId: `event-${String(i)}`,
          projectId: `proj-${String(i)}`,
          layer: "PROJECT",
        }),
      );
    }
    expect(prior?.stage).toBe("EMERGING");
  });

  it("never promotes an EVENT-layer record past OBSERVATION regardless of evidence volume", () => {
    let prior: LearningRecordV094 | undefined;
    for (let i = 0; i < 12; i += 1) {
      prior = updateLearningRecord(
        prior,
        input({
          eventId: `event-${String(i)}`,
          projectId: `proj-${String(i)}`,
          layer: "EVENT",
        }),
      );
    }
    expect(prior?.stage).toBe("OBSERVATION");
  });

  it("requires a higher distinct-project count for the COMPANY layer than a plain PROJECT layer at EMERGING", () => {
    // 3 observations, all from the same project: enough distinct projects (1) for a plain layer's EMERGING
    // threshold (1), but not enough (needs 2) for the COMPANY layer.
    let plain: LearningRecordV094 | undefined;
    let company: LearningRecordV094 | undefined;
    for (let i = 0; i < 3; i += 1) {
      plain = updateLearningRecord(
        plain,
        input({
          eventId: `event-${String(i)}`,
          projectId: "proj-1",
          layer: "PROJECT",
        }),
      );
      company = updateLearningRecord(
        company,
        input({
          eventId: `event-${String(i)}`,
          projectId: "proj-1",
          layer: "COMPANY",
        }),
      );
    }
    expect(plain?.stage).toBe("EMERGING");
    expect(company?.stage).toBe("OBSERVATION");
  });

  it("carries forward prior evidence event and project IDs, and preserves the original record id", () => {
    const first = updateLearningRecord(
      undefined,
      input({ eventId: "event-1", projectId: "proj-1" }),
    );
    const second = updateLearningRecord(
      first,
      input({ id: "rec-2", eventId: "event-2", projectId: "proj-2" }),
    );
    expect(second.id).toBe("rec-1");
    expect(second.evidenceEventIds).toEqual(["event-1", "event-2"]);
    expect(second.evidenceProjectIds).toEqual(["proj-1", "proj-2"]);
    expect(second.observationCount).toBe(2);
  });
});

describe("decayedLearningWeight", () => {
  it("returns the full confidence with zero elapsed age", () => {
    const record: LearningRecordV094 = {
      id: "r1",
      layer: "PROJECT",
      hypothesisType: "OUTCOME",
      subjectKey: "s",
      hypothesis: "h",
      evidenceEventIds: [],
      evidenceProjectIds: [],
      observationCount: 1,
      verifiedOutcomeCount: 1,
      contradictingOutcomeCount: 0,
      confidence: 0.8,
      stage: "OBSERVATION",
      lastObservedAt: "2026-08-26T00:00:00Z",
    };
    expect(decayedLearningWeight(record, "2026-08-26T00:00:00Z")).toBe(0.8);
  });

  it("halves the confidence after exactly one half-life for a default 270-day layer", () => {
    const record: LearningRecordV094 = {
      id: "r1",
      layer: "PROJECT",
      hypothesisType: "OUTCOME",
      subjectKey: "s",
      hypothesis: "h",
      evidenceEventIds: [],
      evidenceProjectIds: [],
      observationCount: 1,
      verifiedOutcomeCount: 1,
      contradictingOutcomeCount: 0,
      confidence: 0.8,
      stage: "OBSERVATION",
      lastObservedAt: "2026-01-01T00:00:00Z",
    };
    const asOf = new Date(
      Date.parse("2026-01-01T00:00:00Z") + 270 * 86_400_000,
    ).toISOString();
    expect(decayedLearningWeight(record, asOf)).toBeCloseTo(0.4, 10);
  });

  it("uses a 180-day half-life for the TRADE_VENDOR layer", () => {
    const record: LearningRecordV094 = {
      id: "r1",
      layer: "TRADE_VENDOR",
      hypothesisType: "OUTCOME",
      subjectKey: "s",
      hypothesis: "h",
      evidenceEventIds: [],
      evidenceProjectIds: [],
      observationCount: 1,
      verifiedOutcomeCount: 1,
      contradictingOutcomeCount: 0,
      confidence: 0.8,
      stage: "OBSERVATION",
      lastObservedAt: "2026-01-01T00:00:00Z",
    };
    const asOf = new Date(
      Date.parse("2026-01-01T00:00:00Z") + 180 * 86_400_000,
    ).toISOString();
    expect(decayedLearningWeight(record, asOf)).toBeCloseTo(0.4, 10);
  });

  it("uses a 365-day half-life for the COMPANY layer", () => {
    const record: LearningRecordV094 = {
      id: "r1",
      layer: "COMPANY",
      hypothesisType: "OUTCOME",
      subjectKey: "s",
      hypothesis: "h",
      evidenceEventIds: [],
      evidenceProjectIds: [],
      observationCount: 1,
      verifiedOutcomeCount: 1,
      contradictingOutcomeCount: 0,
      confidence: 0.8,
      stage: "OBSERVATION",
      lastObservedAt: "2026-01-01T00:00:00Z",
    };
    const asOf = new Date(
      Date.parse("2026-01-01T00:00:00Z") + 365 * 86_400_000,
    ).toISOString();
    expect(decayedLearningWeight(record, asOf)).toBeCloseTo(0.4, 10);
  });
});
