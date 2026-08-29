import {
  addWorkdays,
  durationFinish,
  maxDate,
  minDate,
  workdaysBetween,
} from "./date";
import { buildGraphIndex } from "./graph";
import { computeConfidence } from "./confidence";
import type { ConfidenceBreakdownV094 } from "./confidence";
import type {
  ActivityV094,
  ISODate,
  ISODateTime,
  ProjectModelV094,
} from "../domain/types";

export interface DateRangeV094 {
  optimistic: ISODate;
  likely: ISODate;
  conservative: ISODate;
}

export type RequiredByItemV094 =
  | {
      kind: "CONSTRAINT";
      id: string;
      label: string;
      constraintType: string;
      truthState: string;
      requiredBy: ISODate;
      action: string;
    }
  | {
      kind: "PREDECESSOR_FINISH" | "PREDECESSOR_START";
      id: string;
      activityId: string;
      label: string;
      truthState: string;
      requiredBy: ISODate;
      action: string;
    };

export interface ActivityForecastV094 {
  activityId: string;
  activityName: string;
  phase: string;
  activityState: string;
  truthState: string;
  dateBasis: string;
  assumptions: string[];
  start: DateRangeV094;
  finish: DateRangeV094;
  likelyFloatWorkdays: number;
  critical: boolean;
  impactStatus: string;
  confidence: ConfidenceBreakdownV094;
  evidence: { sourceIds: string[]; eventIds: string[] };
  requiredBy: RequiredByItemV094[];
  drivers: string[];
  warnings: string[];
}

export interface DeltaFieldV094 {
  from: ISODate;
  to: ISODate;
  deltaWorkdays: number;
}

export interface ShiftedActivityV094 {
  activityId: string;
  activityName: string;
  critical: boolean;
  startLikely: DeltaFieldV094;
  finishLikely: DeltaFieldV094;
}

export interface ForecastDeltaV094 {
  fromSnapshotId: string;
  fromVersion: number;
  completionLikely: DeltaFieldV094;
  shiftedActivityCount: number;
  criticalShiftCount: number;
  shiftedActivities: ShiftedActivityV094[];
}

export interface SupersededSourceSummaryV094 {
  sourceId: string;
  label: string;
  effectiveDate: ISODate | null;
  supersededBySourceId: string;
  supersedingLabel: string;
  supersedingObservedAt: ISODateTime | null;
}

export interface PmActionV094 {
  activityId: string;
  priority: "CRITICAL" | "WATCH";
  requiredBy: ISODate;
  dueStatus: "OVERDUE" | "DUE_NOW" | "UPCOMING";
  truthState: string;
  action: string;
}

export interface ProtectionActionV094 {
  id: string;
  type: "EARLY_CONSTRAINT_CLOSEOUT";
  activityId: string;
  activityName: string;
  constraintId: string;
  constraintType: string;
  requiredBy: ISODate;
  urgency: "UNSCHEDULED" | "OVERDUE" | "DUE_NOW" | "UPCOMING";
  truthState: string;
  severity: "BLOCK" | "CRITICAL" | "WATCH";
  critical: true;
  confidence: number;
  action: string;
}

export type StandbyLeverV094 =
  | {
      id: string;
      type: "SAME_DAY_HANDOFF_REVIEW";
      predecessorId: string;
      successorId: string;
      earliestRelevantDate: ISODate;
      maxRecoverableWorkdays: number;
      confidence: number;
      requiresValidation: true;
      standby: boolean;
      action: string;
    }
  | {
      id: string;
      type: "DURATION_COMPRESSION_REVIEW";
      activityId: string;
      earliestRelevantDate: ISODate;
      maxRecoverableWorkdays: number;
      confidence: number;
      requiresValidation: true;
      standby: boolean;
      action: string;
    };

export interface RecoveryAnalysisV094 {
  status:
    | "NO_FORECAST"
    | "ON_TRACK"
    | "PROTECTION_REQUIRED"
    | "RECOVERY_AVAILABLE"
    | "RECOVERY_NOT_MODELED";
  recoveryAvailable: boolean;
  recoveryStandbyAvailable: boolean;
  advisoryOnly: boolean;
  reason?: string;
  delayWorkdays?: number;
  baselineCompletionLikely?: ISODate | null;
  currentCompletionLikely?: ISODate | null;
  recoverableWorkdays?: number;
  recoverableCompletionLikely?: ISODate | null;
  recoveryConfidence?: number;
  standbyRecoveryCapacityWorkdays?: number;
  criticalExposureCount?: number;
  blockedProtectionCount?: number;
  nextRiskDate?: ISODate | null;
  requiresPmValidation?: boolean;
  criticalShiftActivityIds?: string[];
  levers: StandbyLeverV094[];
  standbyLevers?: StandbyLeverV094[];
  protectionActions: ProtectionActionV094[];
  rule?: string;
}

export interface ForecastSnapshotV094 {
  id: string;
  modelRevision: number;
  projectId: string;
  version: number;
  status: "WORKING" | "PROPOSED" | "PUBLISHED";
  generatedAt: ISODateTime;
  basedOnEventIds: string[];
  basedOnSourceIds: string[];
  evidenceRevision: number;
  impactActivityIds: string[];
  activityForecasts: Record<string, ActivityForecastV094>;
  pmActions: PmActionV094[];
  completion: DateRangeV094;
  supersededSources: SupersededSourceSummaryV094[];
  delta?: ForecastDeltaV094;
  deltaFromSnapshotId?: string;
  recoveryAnalysis: RecoveryAnalysisV094;
}

type Scenario = "optimistic" | "likely" | "conservative";

function scenarioDuration(activity: ActivityV094, scenario: Scenario): number {
  return activity.duration[scenario];
}

function constraintReadinessFor(
  model: ProjectModelV094,
  activityId: string,
  scenario: Scenario,
): ISODate | undefined {
  let result: ISODate | undefined;
  for (const constraint of Object.values(model.constraints)) {
    if (constraint.activityId !== activityId || !constraint.hard) continue;
    if (!constraint.readiness) continue;
    const date = constraint.readiness[scenario];
    result = result ? maxDate(result, date) : date;
  }
  return result;
}

function solveScenario(
  model: ProjectModelV094,
  scenario: Scenario,
): { start: Record<string, ISODate>; finish: Record<string, ISODate> } {
  const graph = buildGraphIndex(model);
  const start: Record<string, ISODate> = {};
  const finish: Record<string, ISODate> = {};
  for (const id of graph.topologicalOrder) {
    const activity = model.activities[id];
    if (!activity) continue;
    const duration = scenarioDuration(activity, scenario);
    let candidateStart = model.forecastAnchorDate;
    const constraintDate = constraintReadinessFor(model, id, scenario);
    if (constraintDate)
      candidateStart = maxDate(candidateStart, constraintDate);
    for (const dep of graph.incoming[id] ?? []) {
      if (!dep.hard) continue;
      const predStart = start[dep.predecessorId];
      const predFinish = finish[dep.predecessorId];
      if (!predStart || !predFinish)
        throw new Error(
          `Predecessor ${dep.predecessorId} was not solved before ${id}`,
        );
      const dependencyDate =
        dep.type === "FINISH_TO_START"
          ? addWorkdays(predFinish, 1 + dep.lagWorkdays, model.calendar)
          : addWorkdays(predStart, dep.lagWorkdays, model.calendar);
      candidateStart = maxDate(candidateStart, dependencyDate);
    }
    if (activity.actualStart) {
      // Actual history is evidence, not something the solver is allowed to move. Keep it and let oversight surface the model conflict.
      candidateStart = activity.actualStart;
    } else if (activity.scheduleLock?.startDate) {
      // Locks are held exactly. Oversight will block publication if the lock violates hard feasibility.
      candidateStart = activity.scheduleLock.startDate;
    }
    start[id] = candidateStart;
    finish[id] =
      activity.actualFinish ??
      activity.scheduleLock?.finishDate ??
      durationFinish(candidateStart, duration, model.calendar);
  }
  return { start, finish };
}

function solveLikelyCpm(
  model: ProjectModelV094,
  likely: { start: Record<string, ISODate>; finish: Record<string, ISODate> },
): {
  earliestStart: Record<string, ISODate>;
  latestStart: Record<string, ISODate>;
  float: Record<string, number>;
  projectFinish: ISODate;
} {
  const graph = buildGraphIndex(model);
  const earliestStart: Record<string, ISODate> = { ...likely.start };
  let projectFinish = model.forecastAnchorDate;
  for (const id of graph.topologicalOrder) {
    const finish = likely.finish[id];
    if (finish) projectFinish = maxDate(projectFinish, finish);
  }
  const effectiveDuration: Record<string, number> = {};
  for (const id of graph.topologicalOrder) {
    const s = likely.start[id];
    const f = likely.finish[id];
    effectiveDuration[id] =
      s && f ? Math.max(1, workdaysBetween(s, f, model.calendar) + 1) : 1;
  }
  const latestStart: Record<string, ISODate> = {};
  for (const id of graph.topologicalOrder) {
    const duration = effectiveDuration[id] ?? 1;
    latestStart[id] = addWorkdays(
      projectFinish,
      -(duration - 1),
      model.calendar,
    );
  }
  for (const id of [...graph.topologicalOrder].reverse()) {
    let current = latestStart[id];
    if (current === undefined) continue;
    for (const dep of graph.outgoing[id] ?? []) {
      if (!dep.hard) continue;
      const successorLatest = latestStart[dep.successorId];
      if (successorLatest === undefined) continue;
      const duration = effectiveDuration[id] ?? 1;
      const maxPredStart =
        dep.type === "FINISH_TO_START"
          ? addWorkdays(
              successorLatest,
              -(duration + dep.lagWorkdays),
              model.calendar,
            )
          : addWorkdays(successorLatest, -dep.lagWorkdays, model.calendar);
      current = minDate(current, maxPredStart);
    }
    latestStart[id] = current;
  }
  const float: Record<string, number> = {};
  for (const id of graph.topologicalOrder) {
    const es = earliestStart[id];
    const ls = latestStart[id];
    float[id] =
      es && ls ? Math.max(0, workdaysBetween(es, ls, model.calendar)) : 0;
  }
  return { earliestStart, latestStart, float, projectFinish };
}

function compareImpact(
  activityId: string,
  start: DateRangeV094,
  finish: DateRangeV094,
  likelyFloatWorkdays: number,
  baseline: ForecastSnapshotV094 | undefined,
): string {
  const prior = baseline?.activityForecasts[activityId];
  if (!prior) return "UNCHANGED";
  if (prior.impactStatus === "LOCKED") return "LOCKED";
  const shifted =
    prior.start.likely !== start.likely ||
    prior.finish.likely !== finish.likely;
  if (shifted) return "SHIFTED";
  if (
    likelyFloatWorkdays < prior.likelyFloatWorkdays ||
    likelyFloatWorkdays <= 1
  )
    return "AT_RISK";
  return "UNCHANGED";
}

function driverSummary(model: ProjectModelV094, activityId: string): string[] {
  const graph = buildGraphIndex(model);
  const drivers: string[] = [];
  for (const dep of graph.incoming[activityId] ?? []) {
    drivers.push(
      `${dep.hard ? "Hard" : "Soft"} ${dep.type}: ${model.activities[dep.predecessorId]?.name ?? dep.predecessorId}`,
    );
  }
  const activity = model.activities[activityId];
  if (!activity) return drivers;
  for (const constraintId of activity.constraintIds) {
    const c = model.constraints[constraintId];
    if (c) drivers.push(`${c.type}: ${c.label} [${c.state}]`);
  }
  if (activity.scheduleLock) drivers.push("PM schedule lock");
  if (activity.actualStart) drivers.push("Verified actual start");
  return drivers;
}

function forecastWarnings(
  model: ProjectModelV094,
  activityId: string,
): string[] {
  const activity = model.activities[activityId];
  const warnings: string[] = [];
  if (!activity) return warnings;
  for (const constraintId of activity.constraintIds) {
    const c = model.constraints[constraintId];
    if (!c) continue;
    if (c.state === "BLOCKED")
      warnings.push(`Blocked ${c.type.toLowerCase()} constraint: ${c.label}`);
    else if (c.state === "UNVERIFIED" && c.hard)
      warnings.push(
        `Unverified hard ${c.type.toLowerCase()} constraint: ${c.label}`,
      );
    else if (c.state === "STALE_REVERIFY" && c.hard)
      warnings.push(`Stale evidence requires re-verification: ${c.label}`);
    else if (c.state === "FORECASTED" && c.hard)
      warnings.push(
        `Forecast-only hard ${c.type.toLowerCase()} constraint: ${c.label}`,
      );
  }
  return warnings;
}

function activityTruthState(activity: ActivityV094): string {
  if (activity.actualFinish || activity.state === "COMPLETE")
    return "SATISFIED";
  if (activity.actualStart || activity.state === "IN_PROGRESS")
    return "SATISFIED";
  if (activity.scheduleLock) return "COMMITTED";
  return "FORECASTED";
}

function evidenceFor(
  model: ProjectModelV094,
  activity: ActivityV094,
): { sourceIds: string[]; eventIds: string[] } {
  const sourceIds = new Set([
    ...activity.sourceIds,
    ...activity.duration.sourceIds,
  ]);
  for (const constraintId of activity.constraintIds) {
    const c = model.constraints[constraintId];
    for (const sourceId of c?.sourceIds ?? []) sourceIds.add(sourceId);
  }
  for (const dep of Object.values(model.dependencies)) {
    if (
      !dep.active ||
      (dep.predecessorId !== activity.id && dep.successorId !== activity.id)
    )
      continue;
    for (const sourceId of dep.sourceIds) sourceIds.add(sourceId);
  }
  return {
    sourceIds: [...sourceIds],
    eventIds: model.eventLedger
      .filter((e) => e.impactSeedActivityIds.includes(activity.id))
      .map((e) => e.id),
  };
}

function forecastBasisFor(
  model: ProjectModelV094,
  activity: ActivityV094,
): { type: string; assumptions: string[] } {
  if (
    activity.actualFinish ||
    activity.actualStart ||
    activity.state === "COMPLETE" ||
    activity.state === "IN_PROGRESS"
  ) {
    return { type: "EVIDENCE_SUPPORTED", assumptions: [] };
  }
  if (activity.scheduleLock) {
    return { type: "COMMITMENT_SUPPORTED", assumptions: [] };
  }
  const assumptions: string[] = [];
  let hasCommitment = false;
  for (const constraintId of activity.constraintIds) {
    const constraint = model.constraints[constraintId];
    if (!constraint || !constraint.hard) continue;
    if (constraint.state === "SATISFIED") continue;
    if (constraint.state === "COMMITTED") {
      hasCommitment = true;
      continue;
    }
    assumptions.push(
      `${constraint.type}: ${constraint.label} [${constraint.state}]`,
    );
  }
  const graph = buildGraphIndex(model);
  for (const dep of graph.incoming[activity.id] ?? []) {
    if (!dep.hard) continue;
    const predecessor = model.activities[dep.predecessorId];
    if (!predecessor) continue;
    if (predecessor.actualFinish || predecessor.state === "COMPLETE") continue;
    if (predecessor.scheduleLock) {
      hasCommitment = true;
      continue;
    }
    assumptions.push(`${dep.type}: ${predecessor.name} remains forecasted`);
  }
  if (assumptions.length > 0) return { type: "CONDITIONAL", assumptions };
  if (hasCommitment) return { type: "COMMITMENT_SUPPORTED", assumptions: [] };
  return { type: "MODEL_FORECAST", assumptions: [] };
}

function buildForecastDelta(
  model: ProjectModelV094,
  activityForecasts: Record<string, ActivityForecastV094>,
  completion: DateRangeV094,
  baseline: ForecastSnapshotV094 | undefined,
): ForecastDeltaV094 | undefined {
  if (!baseline) return undefined;
  const shiftedActivities: ShiftedActivityV094[] = [];
  for (const current of Object.values(activityForecasts)) {
    const prior = baseline.activityForecasts[current.activityId];
    if (!prior) continue;
    const startDelta = workdaysBetween(
      prior.start.likely,
      current.start.likely,
      model.calendar,
    );
    const finishDelta = workdaysBetween(
      prior.finish.likely,
      current.finish.likely,
      model.calendar,
    );
    if (startDelta === 0 && finishDelta === 0) continue;
    shiftedActivities.push({
      activityId: current.activityId,
      activityName: current.activityName,
      critical: current.critical,
      startLikely: {
        from: prior.start.likely,
        to: current.start.likely,
        deltaWorkdays: startDelta,
      },
      finishLikely: {
        from: prior.finish.likely,
        to: current.finish.likely,
        deltaWorkdays: finishDelta,
      },
    });
  }
  const completionLikelyDeltaWorkdays = workdaysBetween(
    baseline.completion.likely,
    completion.likely,
    model.calendar,
  );
  return {
    fromSnapshotId: baseline.id,
    fromVersion: baseline.version,
    completionLikely: {
      from: baseline.completion.likely,
      to: completion.likely,
      deltaWorkdays: completionLikelyDeltaWorkdays,
    },
    shiftedActivityCount: shiftedActivities.length,
    criticalShiftCount: shiftedActivities.filter((item) => item.critical)
      .length,
    shiftedActivities,
  };
}

function supersededSourceSummary(
  model: ProjectModelV094,
): SupersededSourceSummaryV094[] {
  return Object.values(model.sources)
    .filter((source) => Boolean(source.supersededBySourceId))
    .map((source) => {
      const superseding = source.supersededBySourceId
        ? model.sources[source.supersededBySourceId]
        : undefined;
      return {
        sourceId: source.id,
        label: source.label,
        effectiveDate: source.effectiveDate ?? null,
        supersededBySourceId: source.supersededBySourceId ?? "",
        supersedingLabel:
          superseding?.label ?? source.supersededBySourceId ?? "",
        supersedingObservedAt: superseding?.observedAt ?? null,
      };
    });
}

function recoveryUrgency(
  requiredBy: ISODate | null | undefined,
  anchorDate: ISODate,
): "UNSCHEDULED" | "OVERDUE" | "DUE_NOW" | "UPCOMING" {
  if (!requiredBy) return "UNSCHEDULED";
  if (requiredBy < anchorDate) return "OVERDUE";
  if (requiredBy === anchorDate) return "DUE_NOW";
  return "UPCOMING";
}

function buildProtectionActions(
  model: ProjectModelV094,
  current: ForecastSnapshotV094,
): ProtectionActionV094[] {
  const actions: ProtectionActionV094[] = [];
  const seen = new Set<string>();
  for (const forecast of Object.values(current.activityForecasts)) {
    if (!forecast.critical) continue;
    const activity = model.activities[forecast.activityId];
    if (!activity) continue;
    for (const constraintId of activity.constraintIds) {
      const constraint = model.constraints[constraintId];
      if (!constraint || !constraint.hard || constraint.state === "SATISFIED")
        continue;
      const req = forecast.requiredBy.find(
        (item) => item.kind === "CONSTRAINT" && item.id === constraintId,
      );
      const requiredBy = req?.requiredBy ?? forecast.start.likely;
      const key = `${forecast.activityId}:${constraint.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const severity =
        constraint.state === "BLOCKED"
          ? "BLOCK"
          : constraint.state === "STALE_REVERIFY"
            ? "CRITICAL"
            : "WATCH";
      actions.push({
        id: `protect:${constraint.id}`,
        type: "EARLY_CONSTRAINT_CLOSEOUT",
        activityId: activity.id,
        activityName: activity.name,
        constraintId: constraint.id,
        constraintType: constraint.type,
        requiredBy,
        urgency: recoveryUrgency(requiredBy, model.forecastAnchorDate),
        truthState: constraint.state,
        severity,
        critical: true,
        confidence: forecast.confidence.overall,
        action: `Close ${constraint.label} by ${requiredBy} to protect ${activity.name} and prevent a downstream critical-path shift.`,
      });
    }
  }
  const severityRank: Record<string, number> = {
    BLOCK: 0,
    CRITICAL: 1,
    WATCH: 2,
  };
  const urgencyRank: Record<string, number> = {
    OVERDUE: 0,
    DUE_NOW: 1,
    UPCOMING: 2,
    UNSCHEDULED: 3,
  };
  actions.sort(
    (a, b) =>
      (urgencyRank[a.urgency] ?? 9) - (urgencyRank[b.urgency] ?? 9) ||
      a.requiredBy.localeCompare(b.requiredBy) ||
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      a.activityName.localeCompare(b.activityName),
  );
  return actions;
}

function buildStandbyRecoveryLevers(
  model: ProjectModelV094,
  current: ForecastSnapshotV094,
): StandbyLeverV094[] {
  const graph = buildGraphIndex(model);
  const levers: StandbyLeverV094[] = [];
  const criticalIds = new Set(
    Object.values(current.activityForecasts)
      .filter((forecast) => forecast.critical)
      .map((forecast) => forecast.activityId),
  );
  for (const dep of Object.values(model.dependencies)) {
    if (
      !dep.active ||
      !dep.hard ||
      dep.type !== "FINISH_TO_START" ||
      dep.lagWorkdays !== 0
    )
      continue;
    if (
      !criticalIds.has(dep.predecessorId) ||
      !criticalIds.has(dep.successorId)
    )
      continue;
    const predecessor = current.activityForecasts[dep.predecessorId];
    const successor = current.activityForecasts[dep.successorId];
    if (!predecessor || !successor) continue;
    const confidence = Math.min(
      0.82,
      predecessor.confidence.overall,
      successor.confidence.overall,
    );
    levers.push({
      id: `handoff:${dep.id}`,
      type: "SAME_DAY_HANDOFF_REVIEW",
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      earliestRelevantDate: predecessor.finish.likely,
      maxRecoverableWorkdays: 1,
      confidence,
      requiresValidation: true,
      standby: true,
      action: `Pre-plan whether ${predecessor.activityName} can field-release ${successor.activityName} on the same workday if a delay occurs. Do not overlap until PM, trade, field, and inspection evidence allow it.`,
    });
  }
  for (const activityId of graph.topologicalOrder) {
    if (!criticalIds.has(activityId)) continue;
    const activity = model.activities[activityId];
    const forecast = current.activityForecasts[activityId];
    if (!activity || !forecast) continue;
    const compressible = Math.max(
      0,
      activity.duration.likely - activity.duration.optimistic,
    );
    if (compressible <= 0) continue;
    levers.push({
      id: `duration:${activity.id}`,
      type: "DURATION_COMPRESSION_REVIEW",
      activityId: activity.id,
      earliestRelevantDate: forecast.start.likely,
      maxRecoverableWorkdays: compressible,
      confidence: Math.min(0.8, forecast.confidence.overall * 0.9),
      requiresValidation: true,
      standby: true,
      action: `Pre-qualify whether ${activity.name} can be completed in the optimistic ${String(activity.duration.optimistic)}-workday duration instead of the likely ${String(activity.duration.likely)}-workday duration without reducing scope, quality, safety, or required inspections.`,
    });
  }
  levers.sort(
    (a, b) =>
      a.earliestRelevantDate.localeCompare(b.earliestRelevantDate) ||
      b.maxRecoverableWorkdays - a.maxRecoverableWorkdays ||
      b.confidence - a.confidence,
  );
  return levers.slice(0, 8);
}

export function analyzeRecovery(
  model: ProjectModelV094,
  current: ForecastSnapshotV094 | undefined,
  baseline: ForecastSnapshotV094 | undefined,
): RecoveryAnalysisV094 {
  if (!current) {
    return {
      status: "NO_FORECAST",
      recoveryAvailable: false,
      recoveryStandbyAvailable: false,
      advisoryOnly: true,
      reason: "No current forecast is available for recovery analysis.",
      levers: [],
      protectionActions: [],
    };
  }
  const delta = current.delta;
  const delayWorkdays = Math.max(0, delta?.completionLikely.deltaWorkdays ?? 0);
  const baselineCompletionLikely =
    baseline?.completion.likely ?? delta?.completionLikely.from ?? null;
  const currentCompletionLikely = current.completion.likely;
  const protectionActions = buildProtectionActions(model, current);
  const standbyLevers = buildStandbyRecoveryLevers(model, current);
  const firstProtectionAction = protectionActions[0];
  const nextRiskDate = firstProtectionAction
    ? firstProtectionAction.requiredBy
    : null;
  const blockedProtectionCount = protectionActions.filter(
    (item) => item.truthState === "BLOCKED",
  ).length;
  const criticalExposureCount = protectionActions.length;
  const standbyRecoveryCapacityWorkdays = standbyLevers.reduce(
    (max, lever) => Math.max(max, lever.maxRecoverableWorkdays),
    0,
  );
  const standbyConfidence = standbyLevers.length
    ? Math.max(
        0,
        Math.min(
          1,
          standbyLevers
            .slice(0, 3)
            .reduce((sum, lever) => sum + lever.confidence, 0) /
            Math.min(3, standbyLevers.length),
        ),
      )
    : 0;
  if (delayWorkdays <= 0) {
    return {
      status: criticalExposureCount > 0 ? "PROTECTION_REQUIRED" : "ON_TRACK",
      recoveryAvailable: false,
      recoveryStandbyAvailable: standbyLevers.length > 0,
      delayWorkdays: 0,
      baselineCompletionLikely,
      currentCompletionLikely,
      recoverableWorkdays: 0,
      recoverableCompletionLikely: currentCompletionLikely,
      recoveryConfidence: standbyConfidence,
      standbyRecoveryCapacityWorkdays,
      criticalExposureCount,
      blockedProtectionCount,
      nextRiskDate,
      advisoryOnly: true,
      requiresPmValidation: true,
      levers: standbyLevers,
      protectionActions: protectionActions.slice(0, 12),
      rule: "On-track does not mean no action. Protection actions are generated from unsatisfied hard constraints on the current critical path. Standby recovery levers are pre-qualified options only and never become schedule commitments without PM, trade, field, inspection, or material evidence.",
    };
  }
  const shiftedCritical = (delta?.shiftedActivities ?? []).filter(
    (item) => item.critical,
  );
  const shiftedCriticalIds = new Set(
    shiftedCritical.map((item) => item.activityId),
  );
  const levers: StandbyLeverV094[] = [];
  for (const standby of standbyLevers) {
    const touchesShifted =
      standby.type === "DURATION_COMPRESSION_REVIEW"
        ? shiftedCriticalIds.has(standby.activityId)
        : shiftedCriticalIds.has(standby.predecessorId) ||
          shiftedCriticalIds.has(standby.successorId);
    if (!touchesShifted) continue;
    levers.push({ ...standby, standby: false });
  }
  levers.sort(
    (a, b) =>
      a.earliestRelevantDate.localeCompare(b.earliestRelevantDate) ||
      b.maxRecoverableWorkdays - a.maxRecoverableWorkdays ||
      b.confidence - a.confidence,
  );
  const bestCapacity = levers.reduce(
    (max, lever) => Math.max(max, lever.maxRecoverableWorkdays),
    0,
  );
  const recoverableWorkdays = Math.min(delayWorkdays, bestCapacity);
  const recoveryAvailable = recoverableWorkdays > 0;
  const topRecoveryLevers = levers
    .filter((lever) => lever.maxRecoverableWorkdays > 0)
    .slice(0, 6);
  const recoveryConfidence =
    recoveryAvailable && topRecoveryLevers.length
      ? Math.max(
          0,
          Math.min(
            1,
            topRecoveryLevers
              .slice(0, 3)
              .reduce((sum, lever) => sum + lever.confidence, 0) /
              Math.min(3, topRecoveryLevers.length),
          ),
        )
      : 0;
  const recoverableCompletionLikely =
    recoveryAvailable && currentCompletionLikely
      ? addWorkdays(
          currentCompletionLikely,
          -recoverableWorkdays,
          model.calendar,
        )
      : currentCompletionLikely;
  return {
    status: recoveryAvailable ? "RECOVERY_AVAILABLE" : "RECOVERY_NOT_MODELED",
    recoveryAvailable,
    recoveryStandbyAvailable: standbyLevers.length > 0,
    delayWorkdays,
    baselineCompletionLikely,
    currentCompletionLikely,
    recoverableWorkdays,
    recoverableCompletionLikely,
    recoveryConfidence,
    standbyRecoveryCapacityWorkdays,
    criticalExposureCount,
    blockedProtectionCount,
    nextRiskDate,
    advisoryOnly: true,
    requiresPmValidation: true,
    criticalShiftActivityIds: [...shiftedCriticalIds],
    levers: topRecoveryLevers,
    standbyLevers,
    protectionActions: protectionActions.slice(0, 12),
    rule: "Recovery options are advisory. Howler does not convert a recovery lever into a schedule commitment until the required trade, field, inspection, material, or PM evidence is confirmed.",
  };
}

function requiredByFor(
  model: ProjectModelV094,
  activity: ActivityV094,
  likelyStart: ISODate,
): RequiredByItemV094[] {
  const graph = buildGraphIndex(model);
  const items: RequiredByItemV094[] = [];
  for (const constraintId of activity.constraintIds) {
    const c = model.constraints[constraintId];
    if (!c || !c.hard || c.state === "SATISFIED") continue;
    const leadWorkdays =
      c.type === "TRADE_AVAILABILITY"
        ? 2
        : c.type === "INFORMATION" || c.type === "INSPECTION"
          ? 1
          : 0;
    const leadDate =
      leadWorkdays > 0
        ? addWorkdays(likelyStart, -leadWorkdays, model.calendar)
        : likelyStart;
    const requiredBy =
      c.state === "COMMITTED" && c.readiness?.likely
        ? c.readiness.likely
        : leadDate;
    items.push({
      kind: "CONSTRAINT",
      id: c.id,
      label: c.label,
      constraintType: c.type,
      truthState: c.state,
      requiredBy,
      action:
        c.state === "COMMITTED"
          ? `Verify ${c.label} is actually satisfied by ${requiredBy}`
          : c.state === "STALE_REVERIFY"
            ? `Re-verify ${c.label} by ${requiredBy}`
            : `Resolve/confirm ${c.label} by ${requiredBy}`,
    });
  }
  for (const dep of graph.incoming[activity.id] ?? []) {
    if (!dep.hard) continue;
    const requiredBy =
      dep.type === "FINISH_TO_START"
        ? addWorkdays(likelyStart, -(1 + dep.lagWorkdays), model.calendar)
        : addWorkdays(likelyStart, -dep.lagWorkdays, model.calendar);
    const predecessor = model.activities[dep.predecessorId];
    if (predecessor?.actualFinish || predecessor?.state === "COMPLETE")
      continue;
    items.push({
      kind:
        dep.type === "FINISH_TO_START"
          ? "PREDECESSOR_FINISH"
          : "PREDECESSOR_START",
      id: dep.id,
      activityId: dep.predecessorId,
      label: predecessor?.name ?? dep.predecessorId,
      truthState: predecessor ? activityTruthState(predecessor) : "FORECASTED",
      requiredBy,
      action: `${predecessor?.name ?? dep.predecessorId} must ${dep.type === "FINISH_TO_START" ? "finish" : "start"} by ${requiredBy} to protect ${activity.name}`,
    });
  }
  return items.sort((a, b) => a.requiredBy.localeCompare(b.requiredBy));
}

function buildPmActions(
  model: ProjectModelV094,
  activityForecasts: Record<string, ActivityForecastV094>,
): PmActionV094[] {
  const actions: PmActionV094[] = [];
  const seen = new Set<string>();
  for (const forecast of Object.values(activityForecasts)) {
    if (!forecast.critical && forecast.likelyFloatWorkdays > 2) continue;
    for (const req of forecast.requiredBy) {
      if (req.truthState === "SATISFIED" || req.kind !== "CONSTRAINT") continue;
      const key = `${forecast.activityId}:${req.kind}:${req.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dueStatus =
        req.requiredBy < model.forecastAnchorDate
          ? "OVERDUE"
          : req.requiredBy === model.forecastAnchorDate
            ? "DUE_NOW"
            : "UPCOMING";
      actions.push({
        activityId: forecast.activityId,
        priority: forecast.critical ? "CRITICAL" : "WATCH",
        requiredBy: req.requiredBy,
        dueStatus,
        truthState: req.truthState,
        action: req.action,
      });
    }
  }
  return actions
    .sort(
      (a, b) =>
        a.requiredBy.localeCompare(b.requiredBy) ||
        (a.priority === "CRITICAL" ? -1 : 1),
    )
    .slice(0, 15);
}

export function generateForecast(
  model: ProjectModelV094,
  generatedAt: ISODateTime,
  version: number,
  baseline?: ForecastSnapshotV094,
  impactedActivityIds?: Set<string>,
): ForecastSnapshotV094 {
  const optimistic = solveScenario(model, "optimistic");
  const likely = solveScenario(model, "likely");
  const conservative = solveScenario(model, "conservative");
  const cpm = solveLikelyCpm(model, likely);
  const activityForecasts: Record<string, ActivityForecastV094> = {};
  let completionOptimistic = model.forecastAnchorDate;
  let completionLikely = model.forecastAnchorDate;
  let completionConservative = model.forecastAnchorDate;
  for (const activity of Object.values(model.activities)) {
    const start: DateRangeV094 = {
      optimistic: optimistic.start[activity.id] ?? model.forecastAnchorDate,
      likely: likely.start[activity.id] ?? model.forecastAnchorDate,
      conservative: conservative.start[activity.id] ?? model.forecastAnchorDate,
    };
    const finish: DateRangeV094 = {
      optimistic: optimistic.finish[activity.id] ?? model.forecastAnchorDate,
      likely: likely.finish[activity.id] ?? model.forecastAnchorDate,
      conservative:
        conservative.finish[activity.id] ?? model.forecastAnchorDate,
    };
    completionOptimistic = maxDate(completionOptimistic, finish.optimistic);
    completionLikely = maxDate(completionLikely, finish.likely);
    completionConservative = maxDate(
      completionConservative,
      finish.conservative,
    );
    const inImpactCone =
      !impactedActivityIds || impactedActivityIds.has(activity.id);
    const impactStatus = inImpactCone
      ? compareImpact(
          activity.id,
          start,
          finish,
          cpm.float[activity.id] ?? 0,
          baseline,
        )
      : "UNCHANGED";
    const dateBasis = forecastBasisFor(model, activity);
    activityForecasts[activity.id] = {
      activityId: activity.id,
      activityName: activity.name,
      phase: activity.phase,
      activityState: activity.state,
      truthState: activityTruthState(activity),
      dateBasis: dateBasis.type,
      assumptions: dateBasis.assumptions,
      start,
      finish,
      likelyFloatWorkdays: cpm.float[activity.id] ?? 0,
      critical: (cpm.float[activity.id] ?? 0) === 0,
      impactStatus: activity.scheduleLock
        ? impactStatus === "SHIFTED"
          ? "LOCKED"
          : impactStatus
        : impactStatus,
      confidence: computeConfidence(model, activity, generatedAt),
      evidence: evidenceFor(model, activity),
      requiredBy: requiredByFor(model, activity, start.likely),
      drivers: driverSummary(model, activity.id),
      warnings: forecastWarnings(model, activity.id),
    };
  }
  const completion: DateRangeV094 = {
    optimistic: completionOptimistic,
    likely: completionLikely,
    conservative: completionConservative,
  };
  const delta = buildForecastDelta(
    model,
    activityForecasts,
    completion,
    baseline,
  );
  const snapshot: ForecastSnapshotV094 = {
    id: `${model.projectId}-forecast-v${String(version)}`,
    modelRevision: model.revision,
    projectId: model.projectId,
    version,
    status: "WORKING",
    generatedAt,
    basedOnEventIds: model.eventLedger.map((e) => e.id),
    basedOnSourceIds: Object.keys(model.sources),
    evidenceRevision: model.revision,
    impactActivityIds: impactedActivityIds
      ? [...impactedActivityIds]
      : Object.keys(model.activities),
    activityForecasts,
    pmActions: buildPmActions(model, activityForecasts),
    completion,
    supersededSources: supersededSourceSummary(model),
    recoveryAnalysis: {
      status: "NO_FORECAST",
      recoveryAvailable: false,
      recoveryStandbyAvailable: false,
      advisoryOnly: true,
      levers: [],
      protectionActions: [],
    },
    ...(delta && baseline ? { delta, deltaFromSnapshotId: baseline.id } : {}),
  };
  snapshot.recoveryAnalysis = analyzeRecovery(model, snapshot, baseline);
  return snapshot;
}
