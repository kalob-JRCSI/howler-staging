import type {
  CommercialSignalV094,
  ConstraintV094,
  ProjectModelV094,
  SourceV094,
} from "../domain/types";

export interface CoverageBreakdownV094 {
  activityId: string;
  physicalDefinition: number;
  commercialCoverage: number;
  materialCoverage: number;
  tradeCoverage: number;
  scheduleDefinition: number;
  overall: number;
  gaps: string[];
}

function average(values: number[], fallback = 0): number {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : fallback;
}

function sourceQuality(s: SourceV094): number {
  return s.supersededBySourceId ? 0.1 : s.authority * s.reliability;
}

function commercialScore(signal: CommercialSignalV094): number {
  const coverage =
    signal.scopeCoverage === "FULL"
      ? 1
      : signal.scopeCoverage === "PARTIAL"
        ? 0.65
        : signal.scopeCoverage === "ALLOWANCE"
          ? 0.45
          : 0.25;
  return coverage * (signal.selected ? 1 : 0.7);
}

function constraintScore(constraint: ConstraintV094): number {
  if (constraint.state === "SATISFIED") return 1;
  if (constraint.state === "COMMITTED") return 0.82;
  if (constraint.state === "FORECASTED") return 0.62;
  if (constraint.state === "UNVERIFIED") return 0.42;
  if (constraint.state === "STALE_REVERIFY") return 0.42;
  if (constraint.state === "BLOCKED") return 0;
  return 0.35;
}

export function activityCoverage(
  model: ProjectModelV094,
  activityId: string,
): CoverageBreakdownV094 {
  const activity = model.activities[activityId];
  if (!activity) throw new Error(`Unknown activity ${activityId}`);
  const sources = activity.sourceIds
    .map((id) => model.sources[id])
    .filter((s): s is SourceV094 => Boolean(s));
  const design = sources.filter((s) =>
    ["PLAN", "SCOPE", "ENGINEERING"].includes(s.type),
  );
  const physicalDefinition = average(design.map(sourceQuality), 0.2);
  const commercial = Object.values(model.commercialSignals ?? {}).filter((s) =>
    s.activityIds.includes(activityId),
  );
  const commercialCoverage = average(commercial.map(commercialScore), 0.15);
  const constraints = activity.constraintIds
    .map((id) => model.constraints[id])
    .filter((c): c is ConstraintV094 => Boolean(c));
  const material = constraints.filter((c) => c.type === "MATERIAL");
  const trade = constraints.filter((c) => c.type === "TRADE_AVAILABILITY");
  const materialCoverage = average(material.map(constraintScore), 0.35);
  const tradeCoverage = average(
    trade.map(constraintScore),
    sources.some((s) => ["CONTRACT", "TRADE_CONFIRMATION"].includes(s.type))
      ? 0.8
      : 0.35,
  );
  const deps = Object.values(model.dependencies).filter(
    (d) =>
      d.active &&
      d.hard &&
      (d.predecessorId === activityId || d.successorId === activityId),
  );
  const scheduleDefinition =
    deps.length > 0 || activity.phase.toLowerCase().includes("closeout")
      ? 0.9
      : 0.55;
  const overall =
    physicalDefinition * 0.3 +
    commercialCoverage * 0.2 +
    materialCoverage * 0.18 +
    tradeCoverage * 0.17 +
    scheduleDefinition * 0.15;
  const gaps: string[] = [];
  if (physicalDefinition < 0.6)
    gaps.push("Physical scope/design evidence is weak or conflicting");
  if (commercialCoverage < 0.55)
    gaps.push(
      "Commercial coverage is incomplete, allowance-only, or unselected",
    );
  if (materialCoverage < 0.55)
    gaps.push("Material readiness/coverage is not sufficiently verified");
  if (tradeCoverage < 0.55)
    gaps.push("Trade assignment or availability is not sufficiently verified");
  if (scheduleDefinition < 0.6)
    gaps.push("Dependency definition is incomplete");
  return {
    activityId,
    physicalDefinition,
    commercialCoverage,
    materialCoverage,
    tradeCoverage,
    scheduleDefinition,
    overall,
    gaps,
  };
}
