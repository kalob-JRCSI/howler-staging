import type {
  ActivityV094,
  ConstraintV094,
  ISODateTime,
  ProjectModelV094,
  SourceV094,
} from "../domain/types";

export interface ConfidenceBreakdownV094 {
  scopeClarity: number;
  dependencyClarity: number;
  materialReadiness: number;
  tradeReadiness: number;
  inspectionReadiness: number;
  freshness: number;
  historicalEvidence: number;
  fieldVerification: number;
  contradictionPenalty: number;
  overall: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[], fallback: number): number {
  return values.length === 0
    ? fallback
    : values.reduce((a, b) => a + b, 0) / values.length;
}

function sourceScore(source: SourceV094): number {
  return source.supersededBySourceId
    ? 0.15
    : source.authority * source.reliability;
}

function operationalFreshness(
  source: SourceV094,
  generatedAt: ISODateTime,
): number {
  const staticTypes = new Set(["PLAN", "SCOPE", "ENGINEERING", "CONTRACT"]);
  if (staticTypes.has(source.type))
    return source.supersededBySourceId ? 0.2 : 1;
  const observed = Date.parse(source.observedAt);
  const generated = Date.parse(generatedAt);
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(generated) ||
    generated < observed
  )
    return 0.5;
  const ageDays = (generated - observed) / 86_400_000;
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.9;
  if (ageDays <= 90) return 0.7;
  if (ageDays <= 180) return 0.5;
  return 0.35;
}

function truthStateScore(state: string): number {
  if (state === "SATISFIED") return 1;
  if (state === "COMMITTED") return 0.82;
  if (state === "FORECASTED") return 0.62;
  if (state === "UNVERIFIED") return 0.42;
  if (state === "STALE_REVERIFY") return 0.42;
  if (state === "BLOCKED") return 0;
  return 0.35;
}

function constraintReadiness(
  constraints: ConstraintV094[],
  type: string,
): number {
  const selected = constraints.filter((c) => c.type === type);
  return average(
    selected.map((c) => truthStateScore(c.state)),
    0.72,
  );
}

export function computeConfidence(
  model: ProjectModelV094,
  activity: ActivityV094,
  generatedAt: ISODateTime,
): ConfidenceBreakdownV094 {
  const combinedSourceIds = [
    ...new Set([...activity.sourceIds, ...activity.duration.sourceIds]),
  ];
  const sources = combinedSourceIds
    .map((id) => model.sources[id])
    .filter((s): s is SourceV094 => Boolean(s));
  const constraints = activity.constraintIds
    .map((id) => model.constraints[id])
    .filter((c): c is ConstraintV094 => Boolean(c));
  const scopeSources = sources.filter((s) =>
    ["PLAN", "SCOPE", "ENGINEERING"].includes(s.type),
  );
  const incoming = Object.values(model.dependencies).filter(
    (d) => d.active && d.successorId === activity.id && d.hard,
  );
  const dependencySourceScores = incoming.flatMap((d) =>
    d.sourceIds.flatMap((id) => {
      const source = model.sources[id];
      return source ? [sourceScore(source)] : [];
    }),
  );
  // Preserved from the baseline; not consumed by any downstream calculation there either.
  const allSourceScores = sources.map(sourceScore);
  const scopeClarity = average(scopeSources.map(sourceScore), 0.45);
  const dependencyClarity = average(
    dependencySourceScores,
    incoming.length === 0 ? 0.95 : 0.5,
  );
  const materialReadiness = constraintReadiness(constraints, "MATERIAL");
  const tradeReadiness = constraintReadiness(constraints, "TRADE_AVAILABILITY");
  const inspectionReadiness = constraintReadiness(constraints, "INSPECTION");
  const freshness = average(
    sources.map((s) => operationalFreshness(s, generatedAt)),
    0.55,
  );
  const historicalEvidence = 0.5; // Replaced by calibrated historical feature service when enough verified outcomes exist.
  const eventSourceIds = new Set(
    model.eventLedger
      .filter((event) => event.impactSeedActivityIds.includes(activity.id))
      .flatMap((event) => event.sourceIds),
  );
  const eventSources = [...eventSourceIds]
    .map((id) => model.sources[id])
    .filter((source): source is SourceV094 => Boolean(source));
  const fieldEvidenceSources = [...sources, ...eventSources].filter((source) =>
    ["FIELD_REPORT", "ACTUAL_VERIFICATION"].includes(source.type),
  );
  const verifiedConstraintFloor = constraints.some(
    (constraint) =>
      constraint.state === "SATISFIED" &&
      ["FIELD_VERIFIED", "VERIFIED_ACTUAL", "PM_CONFIRMED"].includes(
        constraint.verification,
      ),
  )
    ? 0.88
    : 0.4;
  const fieldVerification = activity.actualFinish
    ? 1
    : activity.actualStart
      ? 0.95
      : average(fieldEvidenceSources.map(sourceScore), verifiedConstraintFloor);
  const contradictionPenalty = Math.min(
    0.4,
    constraints.filter(
      (c) =>
        c.state === "BLOCKED" &&
        ["DOCUMENTATION", "INFORMATION"].includes(c.type),
    ).length *
      0.15 +
      sources.filter((s) => Boolean(s.supersededBySourceId)).length * 0.05,
  );
  const weighted =
    scopeClarity * 0.18 +
    dependencyClarity * 0.16 +
    materialReadiness * 0.14 +
    tradeReadiness * 0.14 +
    inspectionReadiness * 0.1 +
    freshness * 0.1 +
    historicalEvidence * 0.08 +
    fieldVerification * 0.1;
  const overall = clamp01(weighted - contradictionPenalty);
  void allSourceScores;
  return {
    scopeClarity: clamp01(scopeClarity),
    dependencyClarity: clamp01(dependencyClarity),
    materialReadiness: clamp01(materialReadiness),
    tradeReadiness: clamp01(tradeReadiness),
    inspectionReadiness: clamp01(inspectionReadiness),
    freshness: clamp01(freshness),
    historicalEvidence,
    fieldVerification: clamp01(fieldVerification),
    contradictionPenalty,
    overall,
  };
}
