import { workdaysBetween } from "./date";
import type {
  ConstraintReadinessV094,
  ISODate,
  ISODateTime,
  ProjectModelV094,
} from "../domain/types";

export type LearningLayerV094 = string;
export type LearningStageV094 =
  "OBSERVATION" | "EMERGING" | "VALIDATED" | "OPERATING_RULE";
export type HypothesisTypeV094 = string;
export type EvidenceKindV094 = string;

export interface PredictionOutcomeV094 {
  predictionId: string;
  activityId: string;
  horizonDays: number;
  predicted: ConstraintReadinessV094;
  actual: ISODate;
  pointErrorWorkdays: number;
  rangeHit: boolean;
  confidenceAtPrediction: number;
  sourceSnapshotId: string;
}

export interface LearningRecordV094 {
  id: string;
  layer: LearningLayerV094;
  hypothesisType: HypothesisTypeV094;
  subjectKey: string;
  hypothesis: string;
  evidenceEventIds: string[];
  evidenceProjectIds: string[];
  observationCount: number;
  verifiedOutcomeCount: number;
  contradictingOutcomeCount: number;
  confidence: number;
  stage: LearningStageV094;
  lastObservedAt: ISODateTime;
}

export interface LearningUpdateInputV094 {
  id: string;
  layer: LearningLayerV094;
  hypothesisType: HypothesisTypeV094;
  subjectKey: string;
  hypothesis: string;
  projectId: string;
  eventId: string;
  evidenceKind: EvidenceKindV094;
  supportsHypothesis: boolean;
  lastObservedAt: ISODateTime;
}

export function evaluatePredictionOutcome(
  model: ProjectModelV094,
  predictionId: string,
  activityId: string,
  sourceSnapshotId: string,
  predicted: ConstraintReadinessV094,
  actual: ISODate,
  confidenceAtPrediction: number,
  horizonDays: number,
): PredictionOutcomeV094 {
  const pointErrorWorkdays = workdaysBetween(
    predicted.likely,
    actual,
    model.calendar,
  );
  const rangeHit =
    actual >= predicted.optimistic && actual <= predicted.conservative;
  return {
    predictionId,
    activityId,
    horizonDays,
    predicted,
    actual,
    pointErrorWorkdays,
    rangeHit,
    confidenceAtPrediction,
    sourceSnapshotId,
  };
}

export function calibratedConfidence(
  records: PredictionOutcomeV094[],
  requestedBin: number,
  tolerance = 0.1,
): number | undefined {
  const selected = records.filter(
    (r) => Math.abs(r.confidenceAtPrediction - requestedBin) <= tolerance,
  );
  if (selected.length < 5) return undefined;
  return selected.filter((r) => r.rangeHit).length / selected.length;
}

function countsForPromotion(
  kind: EvidenceKindV094,
  hypothesisType: HypothesisTypeV094,
): boolean {
  if (kind === "CORRELATION") return false;
  if (hypothesisType === "CAUSAL") return kind === "VERIFIED_CAUSE";
  return kind === "VERIFIED_OUTCOME" || kind === "VERIFIED_CAUSE";
}

function minimumDistinctProjects(
  layer: LearningLayerV094,
  stage: string,
): number {
  if (layer === "EVENT") return Number.POSITIVE_INFINITY;
  if (stage === "EMERGING")
    return ["COMPANY", "PROJECT_TYPE", "TRADE_VENDOR", "HOWLER_SELF"].includes(
      layer,
    )
      ? 2
      : 1;
  if (stage === "VALIDATED")
    return ["COMPANY", "PROJECT_TYPE", "TRADE_VENDOR", "HOWLER_SELF"].includes(
      layer,
    )
      ? 3
      : 2;
  if (stage === "OPERATING_RULE")
    return ["COMPANY", "PROJECT_TYPE", "TRADE_VENDOR", "HOWLER_SELF"].includes(
      layer,
    )
      ? 4
      : 3;
  return 1;
}

export function updateLearningRecord(
  prior: LearningRecordV094 | undefined,
  input: LearningUpdateInputV094,
): LearningRecordV094 {
  const promotable = countsForPromotion(
    input.evidenceKind,
    input.hypothesisType,
  );
  const verified =
    (prior?.verifiedOutcomeCount ?? 0) +
    (promotable && input.supportsHypothesis ? 1 : 0);
  const contradicting =
    (prior?.contradictingOutcomeCount ?? 0) +
    (promotable && !input.supportsHypothesis ? 1 : 0);
  const total = verified + contradicting;
  const empirical = total === 0 ? 0.5 : verified / total;
  const confidence = total === 0 ? 0.5 : (verified + 2) / (total + 4); // Bayesian shrinkage toward 0.5.
  const evidenceProjectIds = [
    ...new Set([...(prior?.evidenceProjectIds ?? []), input.projectId]),
  ];
  const distinctProjects = evidenceProjectIds.length;
  const observationCount = (prior?.observationCount ?? 0) + 1;
  let stage: LearningStageV094 = "OBSERVATION";
  if (
    total >= 3 &&
    confidence >= 0.65 &&
    distinctProjects >= minimumDistinctProjects(input.layer, "EMERGING")
  )
    stage = "EMERGING";
  if (
    total >= 6 &&
    confidence >= 0.75 &&
    distinctProjects >= minimumDistinctProjects(input.layer, "VALIDATED")
  )
    stage = "VALIDATED";
  if (
    total >= 10 &&
    confidence >= 0.82 &&
    empirical >= 0.8 &&
    distinctProjects >= minimumDistinctProjects(input.layer, "OPERATING_RULE")
  )
    stage = "OPERATING_RULE";
  return {
    id: prior?.id ?? input.id,
    layer: input.layer,
    hypothesisType: input.hypothesisType,
    subjectKey: input.subjectKey,
    hypothesis: input.hypothesis,
    evidenceEventIds: [...(prior?.evidenceEventIds ?? []), input.eventId],
    evidenceProjectIds,
    observationCount,
    verifiedOutcomeCount: verified,
    contradictingOutcomeCount: contradicting,
    confidence,
    stage,
    lastObservedAt: input.lastObservedAt,
  };
}

export function decayedLearningWeight(
  record: LearningRecordV094,
  asOf: ISODateTime,
): number {
  const ageDays = Math.max(
    0,
    (Date.parse(asOf) - Date.parse(record.lastObservedAt)) / 86_400_000,
  );
  const halfLifeDays =
    record.layer === "TRADE_VENDOR"
      ? 180
      : record.layer === "COMPANY"
        ? 365
        : 270;
  return record.confidence * Math.pow(0.5, ageDays / halfLifeDays);
}
