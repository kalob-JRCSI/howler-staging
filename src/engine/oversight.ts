import { addWorkdays, durationFinish } from "./date";
import { buildGraphIndex } from "./graph";
import type { ForecastSnapshotV094 } from "./solver";
import type {
  ISODateTime,
  ProjectEventV094,
  ProjectModelV094,
} from "../domain/types";

export interface OversightFindingV094 {
  category: string;
  severity: "BLOCK" | "WARN" | "PASS";
  message: string;
  activityIds: string[];
  sourceIds?: string[];
}

export interface OversightReviewV094 {
  id: string;
  projectId: string;
  candidateSnapshotId: string;
  createdAt: ISODateTime;
  findings: OversightFindingV094[];
  decision: "PASS" | "PASS_WITH_WARNINGS" | "BLOCK";
}

function decisionFrom(
  findings: OversightFindingV094[],
): "PASS" | "PASS_WITH_WARNINGS" | "BLOCK" {
  if (findings.some((f) => f.severity === "BLOCK")) return "BLOCK";
  if (findings.some((f) => f.severity === "WARN")) return "PASS_WITH_WARNINGS";
  return "PASS";
}

function addFinding(
  findings: OversightFindingV094[],
  category: string,
  severity: "BLOCK" | "WARN" | "PASS",
  message: string,
  activityIds: string[],
  sourceIds?: string[],
): void {
  findings.push({
    category,
    severity,
    message,
    activityIds,
    ...(sourceIds ? { sourceIds } : {}),
  });
}

export function runOversightReview(
  model: ProjectModelV094,
  candidate: ForecastSnapshotV094,
  triggeringEvent: ProjectEventV094 | undefined,
  createdAt: ISODateTime,
): OversightReviewV094 {
  const findings: OversightFindingV094[] = [];
  const graph = buildGraphIndex(model);
  if (triggeringEvent) {
    if (triggeringEvent.verification === "UNVERIFIED") {
      addFinding(
        findings,
        "EVIDENCE",
        "WARN",
        "Triggering event is unverified. Forecast may be explored internally but material schedule changes should not be published as fact.",
        triggeringEvent.impactSeedActivityIds,
        triggeringEvent.sourceIds,
      );
    }
    if (
      ["SCOPE_CHANGE", "DOCUMENT_REVISION"].includes(triggeringEvent.type) &&
      triggeringEvent.impactSeedActivityIds.length === 0
    ) {
      addFinding(
        findings,
        "DOCUMENTATION",
        "BLOCK",
        "Scope/document change has no mapped impact seed activities.",
        [],
      );
    }
  }
  for (const conflict of Object.values(model.conflicts ?? {})) {
    if (conflict.status !== "OPEN") continue;
    if (conflict.severity === "HIGH") {
      addFinding(
        findings,
        "DOCUMENTATION",
        "BLOCK",
        `Open high-severity project truth conflict: ${conflict.description}`,
        conflict.activityIds,
        conflict.sourceIds,
      );
    } else if (conflict.severity === "MEDIUM") {
      addFinding(
        findings,
        "DOCUMENTATION",
        "WARN",
        `Open project truth conflict: ${conflict.description}`,
        conflict.activityIds,
        conflict.sourceIds,
      );
    }
  }
  for (const activity of Object.values(model.activities)) {
    const forecast = candidate.activityForecasts[activity.id];
    if (!forecast) continue;
    const blockedHard = activity.constraintIds
      .map((id) => model.constraints[id])
      .filter((c): c is NonNullable<typeof c> =>
        Boolean(c && c.hard && c.state === "BLOCKED"),
      );
    if (blockedHard.length > 0) {
      addFinding(
        findings,
        "DOCUMENTATION",
        "BLOCK",
        `Activity has blocked hard constraints: ${blockedHard.map((c) => c.label).join(", ")}`,
        [activity.id],
      );
    }
    const unverifiedHard = activity.constraintIds
      .map((id) => model.constraints[id])
      .filter((c): c is NonNullable<typeof c> =>
        Boolean(c && c.hard && c.state === "UNVERIFIED"),
      );
    if (unverifiedHard.length > 0 && forecast.critical) {
      addFinding(
        findings,
        "CRITICAL_PATH",
        "WARN",
        `Critical activity relies on unverified hard constraints: ${unverifiedHard.map((c) => c.label).join(", ")}`,
        [activity.id],
      );
    }
    const forecastedHard = activity.constraintIds
      .map((id) => model.constraints[id])
      .filter((c): c is NonNullable<typeof c> =>
        Boolean(c && c.hard && c.state === "FORECASTED"),
      );
    if (forecastedHard.length > 0 && forecast.critical) {
      addFinding(
        findings,
        "CRITICAL_PATH",
        "WARN",
        `Critical activity relies on forecast-only hard constraints: ${forecastedHard.map((c) => c.label).join(", ")}. Forecasting may continue, but do not convert these dates into commitments.`,
        [activity.id],
      );
    }
    if (activity.scheduleLock?.finishDate) {
      const forecastStart = forecast.start.likely;
      const earliestLikelyFinish = durationFinish(
        forecastStart,
        activity.duration.likely,
        model.calendar,
      );
      if (activity.scheduleLock.finishDate < earliestLikelyFinish) {
        addFinding(
          findings,
          "CALENDAR",
          "BLOCK",
          `PM-locked finish ${activity.scheduleLock.finishDate} is earlier than likely duration permits (${earliestLikelyFinish}).`,
          [activity.id],
          [activity.scheduleLock.sourceId],
        );
      }
    }
    if (activity.scheduleLock?.startDate) {
      let earliestFeasible = model.forecastAnchorDate;
      for (const cId of activity.constraintIds) {
        const c = model.constraints[cId];
        if (c?.hard && c.readiness)
          earliestFeasible =
            earliestFeasible > c.readiness.likely
              ? earliestFeasible
              : c.readiness.likely;
      }
      for (const dep of graph.incoming[activity.id] ?? []) {
        if (!dep.hard) continue;
        const pred = candidate.activityForecasts[dep.predecessorId];
        if (!pred) continue;
        const required =
          dep.type === "FINISH_TO_START"
            ? addWorkdays(
                pred.finish.likely,
                1 + dep.lagWorkdays,
                model.calendar,
              )
            : addWorkdays(pred.start.likely, dep.lagWorkdays, model.calendar);
        if (required > earliestFeasible) earliestFeasible = required;
      }
      if (activity.scheduleLock.startDate < earliestFeasible) {
        addFinding(
          findings,
          "CALENDAR",
          "BLOCK",
          `PM-locked start ${activity.scheduleLock.startDate} is earlier than hard-feasible start ${earliestFeasible}. Keep the lock visible, but do not publish it as feasible.`,
          [activity.id],
          [activity.scheduleLock.sourceId],
        );
      }
    }
    if (activity.actualStart) {
      let modeledEarliest = model.forecastAnchorDate;
      for (const cId of activity.constraintIds) {
        const c = model.constraints[cId];
        if (c?.hard && c.readiness && c.readiness.likely > modeledEarliest)
          modeledEarliest = c.readiness.likely;
      }
      for (const dep of graph.incoming[activity.id] ?? []) {
        if (!dep.hard) continue;
        const pred = candidate.activityForecasts[dep.predecessorId];
        if (!pred) continue;
        const required =
          dep.type === "FINISH_TO_START"
            ? addWorkdays(
                pred.finish.likely,
                1 + dep.lagWorkdays,
                model.calendar,
              )
            : addWorkdays(pred.start.likely, dep.lagWorkdays, model.calendar);
        if (required > modeledEarliest) modeledEarliest = required;
      }
      if (activity.actualStart < modeledEarliest) {
        addFinding(
          findings,
          "DEPENDENCY",
          "BLOCK",
          `Verified actual start ${activity.actualStart} precedes modeled hard-feasible start ${modeledEarliest}. Reconcile the dependency/partial-release model before learning from this outcome.`,
          [activity.id],
        );
      }
      const actualSources = (activity.actualStartSourceIds ?? [])
        .map((id) => model.sources[id])
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      const hasActualEvidence = actualSources.some((s) =>
        [
          "FIELD_REPORT",
          "PM_INPUT",
          "TRADE_CONFIRMATION",
          "INSPECTION",
          "ACTUAL_VERIFICATION",
        ].includes(s.type),
      );
      const actualVerificationAccepted = [
        "PM_CONFIRMED",
        "VERIFIED_ACTUAL",
      ].includes(activity.actualStartVerification ?? "UNVERIFIED");
      if (!hasActualEvidence || !actualVerificationAccepted) {
        addFinding(
          findings,
          "LEARNING_SAFETY",
          "BLOCK",
          "Activity has an actual start without accepted independent evidence and verification. Calendar, unverified statements, or AI forecast must never self-confirm an actual.",
          [activity.id],
        );
      }
    }
    const completionEvidence = activity.actualFinishSourceIds ?? [];
    const aiOnly =
      completionEvidence.length > 0 &&
      completionEvidence.every(
        (id) => model.sources[id]?.type === "AI_FORECAST",
      );
    if (aiOnly && activity.state === "COMPLETE") {
      addFinding(
        findings,
        "LEARNING_SAFETY",
        "BLOCK",
        "Completed activity is supported only by AI forecast evidence.",
        [activity.id],
      );
    }
    if (
      forecast.confidence.overall < 0.45 &&
      forecast.impactStatus === "SHIFTED"
    ) {
      addFinding(
        findings,
        "EVIDENCE",
        "WARN",
        `Shifted forecast has low confidence (${String(Math.round(forecast.confidence.overall * 100))}%). Publish as a range/risk, not a precise commitment.`,
        [activity.id],
      );
    }
  }
  const criticalShifted = Object.values(candidate.activityForecasts).filter(
    (f) => f.critical && f.impactStatus === "SHIFTED",
  );
  if (criticalShifted.length > 0) {
    addFinding(
      findings,
      "CRITICAL_PATH",
      "WARN",
      `Critical-path movement detected in ${String(criticalShifted.length)} activities. Recovery alternatives and trade remobilization exposure should be reviewed before publication.`,
      criticalShifted.map((f) => f.activityId),
    );
    if (candidate.recoveryAnalysis.recoveryAvailable) {
      addFinding(
        findings,
        "CRITICAL_PATH",
        "WARN",
        `Advisory recovery capacity detected: up to ${String(candidate.recoveryAnalysis.recoverableWorkdays ?? 0)} workday(s), with modeled completion ${candidate.recoveryAnalysis.recoverableCompletionLikely ?? ""}. Recovery remains conditional until PM/trade/field evidence confirms the selected lever.`,
        candidate.recoveryAnalysis.criticalShiftActivityIds ?? [],
      );
    }
  } else {
    addFinding(
      findings,
      "CRITICAL_PATH",
      "PASS",
      "No critical-path activity currently requires a published shift.",
      [],
    );
  }
  return {
    id: `${candidate.id}-oversight`,
    projectId: model.projectId,
    candidateSnapshotId: candidate.id,
    createdAt,
    findings,
    decision: decisionFrom(findings),
  };
}
