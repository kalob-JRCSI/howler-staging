// Howler v0.9.6 Contractor Hub (design doc "Progress versus Project Integrity" /
// "Schedule and forecast model"; plan Task 4): derives ONE deterministic, read-only project
// summary for both the Penthouse portfolio card and the Index Card, from already-computed
// canonical state. Never a second canonical engine: this file computes nothing that isn't a
// cheap, pure transformation of `model`/`forecast`/`health` -- no D1 access, no network/model
// calls, no mutation of any input, and no persistence of any derived value (progressPercent,
// integrity score/condition/driver, primaryExposure, nextMovement, projectedCompletion are all
// recomputed on every read, never written back to canonical state).

import type { ActivityV094, ProjectModelV094 } from "../domain/types";
import type { ForecastSnapshotV094 } from "../engine/solver";
import type { ProjectHealthV094 } from "../worker/health";

export interface ProjectScheduleItemV096 {
  activityId: string;
  activityName: string;
  phase: string;
  startDate: string | null;
  finishDate: string | null;
  basis: "COMMITTED" | "FORECAST";
}

export interface ProjectSummaryV096 {
  projectId: string;
  projectName: string;
  progressPercent: number;
  integrity: {
    score: number;
    condition: string;
    primaryDriver: string;
  };
  budget: {
    baseline: number | null;
    spent: number | null;
    remaining: number | null;
    spentPercent: number | null;
  };
  primaryExposure: string;
  nextMovement: string;
  projectedCompletion: string | null;
  schedule: {
    committed: ProjectScheduleItemV096[];
    forecast: ProjectScheduleItemV096[];
  };
  scope: { id: string; label: string; phase: string }[];
}

// Persisted staging data includes forecast snapshots created before recoveryAnalysis was added.
// Current in-memory forecasts always carry it, but read-side summaries must remain compatible with
// those immutable historical snapshots instead of letting one older row abort the whole portfolio.
type PersistedForecastWithLegacyRecovery = Omit<
  ForecastSnapshotV094,
  "recoveryAnalysis"
> & {
  recoveryAnalysis?: ForecastSnapshotV094["recoveryAnalysis"];
};

function criticalExposureCountFromPersistedForecast(
  forecast: ForecastSnapshotV094 | undefined,
): number {
  const persisted = forecast as PersistedForecastWithLegacyRecovery | undefined;
  return persisted?.recoveryAnalysis?.criticalExposureCount ?? 0;
}

// Production progress only: weighted by each activity's likely-duration estimate, never by
// budget spend, elapsed calendar time, forecast percent, or a plain activity-count average.
function computeProgressPercent(model: ProjectModelV094): number {
  let totalWeight = 0;
  let completedWeight = 0;
  for (const activity of Object.values(model.activities)) {
    const weight = activity.duration.likely;
    totalWeight += weight;
    if (activity.state === "COMPLETE") completedWeight += weight;
    else if (activity.state === "IN_PROGRESS") completedWeight += weight * 0.5;
  }
  if (totalWeight === 0) return 0;
  return Math.round((completedWeight / totalWeight) * 100);
}

// Exact pilot baseline formula (design doc / plan Task 4) -- explicitly pilot-tunable, never
// persisted as canonical truth. Do not modify these weights without a documented plan change.
function computeIntegrityScore(
  health: ProjectHealthV094,
  forecast: ForecastSnapshotV094 | undefined,
): number {
  let score = 100;
  score -= Math.min(30, health.blockedConstraints.length * 15);
  score -= Math.min(
    20,
    health.openConflicts.filter((c) => c.severity === "HIGH").length * 10,
  );
  score -= Math.min(15, health.unverifiedHardConstraints.length * 5);
  score -= Math.min(15, criticalExposureCountFromPersistedForecast(forecast));
  score -= Math.min(10, health.lowCoverage.length * 2);
  return Math.max(0, Math.min(100, score));
}

function conditionLabel(score: number): string {
  if (score >= 85) return "Stable";
  if (score >= 70) return "Stable, exposed";
  if (score >= 50) return "At risk";
  return "Critical";
}

// Fixed conservative priority aligned with the integrity formula's own penalty order -- the
// first factor that actually contributed a penalty is reported, using existing constraint/
// conflict labels rather than generated narrative.
function computePrimaryDriver(
  health: ProjectHealthV094,
  forecast: ForecastSnapshotV094 | undefined,
): string {
  const blocked = health.blockedConstraints[0];
  if (blocked) return `Blocked constraint: ${blocked.label}.`;
  const highConflict = health.openConflicts.find((c) => c.severity === "HIGH");
  if (highConflict)
    return `High-severity conflict: ${highConflict.description}.`;
  const unverified = health.unverifiedHardConstraints[0];
  if (unverified) return `Unverified hard constraint: ${unverified.label}.`;
  const criticalExposureCount =
    criticalExposureCountFromPersistedForecast(forecast);
  if (criticalExposureCount > 0) {
    return `Critical forecast exposure affecting ${String(criticalExposureCount)} activit${criticalExposureCount === 1 ? "y" : "ies"}.`;
  }
  const lowCoverage = health.lowCoverage[0];
  if (lowCoverage) {
    return `Low information coverage on activity ${lowCoverage.activityId}.`;
  }
  return "Stable: no material integrity penalty identified.";
}

// A separate priority chain from primaryDriver -- the dashboard's "what needs attention" card,
// not the integrity-score explanation. Uses concise existing label/description/action text only.
function computePrimaryExposure(
  health: ProjectHealthV094,
  forecast: ForecastSnapshotV094 | undefined,
): string {
  const blocked = health.blockedConstraints[0];
  if (blocked) return `Blocked: ${blocked.label}.`;
  const highConflict = health.openConflicts.find((c) => c.severity === "HIGH");
  if (highConflict) return `Conflict: ${highConflict.description}.`;
  const firstPmAction = forecast?.pmActions[0];
  if (firstPmAction) return firstPmAction.action;
  return "No critical exposure identified.";
}

function computeBudget(model: ProjectModelV094): ProjectSummaryV096["budget"] {
  const budget = model.projectProfile?.budget;
  const baseline = budget?.baseline ?? null;
  const spent = budget?.spent ?? null;
  const remaining =
    baseline !== null && spent !== null ? baseline - spent : null;
  const spentPercent =
    baseline !== null && spent !== null && baseline > 0
      ? Math.round((spent / baseline) * 100)
      : null;
  return { baseline, spent, remaining, spentPercent };
}

function computeScope(model: ProjectModelV094): ProjectSummaryV096["scope"] {
  return (model.projectProfile?.baselineScope ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    phase: item.phase,
  }));
}

// Committed dates come ONLY from activity.scheduleLock; forecast dates come ONLY from
// forecast.activityForecasts. An activity with a lock is never also listed in `forecast` --
// the committed lock wins presentation, and a forecast date can never be relabeled as a
// commitment.
//
// Task 8 pilot smoke correction: a schedule lock's start and finish fields are retired
// INDEPENDENTLY, each by its own matching actual fact -- a committed START is settled history
// once activity.actualStart exists, but a committed FINISH on that SAME activity remains a live,
// unsatisfied commitment until activity.actualFinish exists too. An earlier version of this fix
// suppressed the entire row the moment actualStart existed, which correctly retired a satisfied
// committed start but also silently hid a still-active committed finish (e.g. locked start Sep 14
// / finish Sep 18, actual start Sep 12: Sep 14 is settled, but Sep 18 is still a live commitment
// that must remain visible). The row is omitted only once every locked field it actually carries
// has been settled by its matching actual fact -- the lock itself is always left completely
// untouched on the activity (it remains real provenance/history); only whether each field is
// still surfaced here as a pending commitment changes. Neither field is ever moved into
// `forecast` instead -- a probabilistic forecast date for something that is a settled fact would
// be its own, different dishonesty. computeNextMovement is where an in-progress activity's real
// state is surfaced truthfully.
function computeSchedule(
  model: ProjectModelV094,
  forecast: ForecastSnapshotV094 | undefined,
): ProjectSummaryV096["schedule"] {
  const committed: ProjectScheduleItemV096[] = [];
  const forecastItems: ProjectScheduleItemV096[] = [];
  for (const activity of Object.values(model.activities)) {
    if (activity.scheduleLock) {
      const startDate = activity.actualStart
        ? null
        : (activity.scheduleLock.startDate ?? null);
      const finishDate = activity.actualFinish
        ? null
        : (activity.scheduleLock.finishDate ?? null);
      if (startDate !== null || finishDate !== null) {
        committed.push({
          activityId: activity.id,
          activityName: activity.name,
          phase: activity.phase,
          startDate,
          finishDate,
          basis: "COMMITTED",
        });
      }
      continue;
    }
    // An unlocked activity that has nonetheless actually started is never relabeled as a
    // forecast -- a probabilistic date for a settled fact would be its own dishonesty.
    if (activity.actualStart) continue;
    const activityForecast = forecast?.activityForecasts[activity.id];
    if (activityForecast) {
      forecastItems.push({
        activityId: activity.id,
        activityName: activity.name,
        phase: activity.phase,
        startDate: activityForecast.start.likely,
        finishDate: activityForecast.finish.likely,
        basis: "FORECAST",
      });
    }
  }
  return { committed, forecast: forecastItems };
}

// Incomplete activities only. Default candidate: earliest forecast likely start. A committed
// start lock overrides that default whenever it is at least as early -- a tie prefers the
// COMMITTED framing (Task 8 pilot smoke correction: an activity's own forecast is frequently
// derived FROM its committed lock, e.g. via solveScenario applying the lock as its candidate
// start, so an exact tie is not evidence the forecast is somehow the more authoritative of the
// two -- the commitment is). A committed finish is never treated as a start, and a forecast date
// is never silently promoted into a commitment.
function computeNextMovement(
  model: ProjectModelV094,
  forecast: ForecastSnapshotV094 | undefined,
): string {
  const incomplete = Object.values(model.activities).filter(
    (a) => a.state !== "COMPLETE",
  );
  if (incomplete.length === 0) return "No incomplete activities remain.";

  // Task 8 pilot smoke correction: an activity that has actually started is a settled, present-
  // tense fact -- describing it as "forecast to start" or "committed to start" some date (its own
  // actualStart included) directly contradicts the very evidence that started it. This takes
  // priority over both the forecast and committed candidates below: something already under way
  // is more immediately relevant to a PM than anything still in the future, and it is never
  // itself a candidate for either loop (both are scoped to activities with no actualStart).
  let inProgressCandidate: { activity: ActivityV094; date: string } | undefined;
  for (const activity of incomplete) {
    if (!activity.actualStart) continue;
    if (
      !inProgressCandidate ||
      activity.actualStart < inProgressCandidate.date
    ) {
      inProgressCandidate = { activity, date: activity.actualStart };
    }
  }
  if (inProgressCandidate) {
    return `${inProgressCandidate.activity.name} is in progress (started ${inProgressCandidate.date}).`;
  }

  let forecastCandidate: { activity: ActivityV094; date: string } | undefined;
  for (const activity of incomplete) {
    const date = forecast?.activityForecasts[activity.id]?.start.likely;
    if (date === undefined) continue;
    if (!forecastCandidate || date < forecastCandidate.date) {
      forecastCandidate = { activity, date };
    }
  }

  let committedCandidate: { activity: ActivityV094; date: string } | undefined;
  for (const activity of incomplete) {
    const date = activity.scheduleLock?.startDate;
    if (date === undefined) continue;
    if (!committedCandidate || date < committedCandidate.date) {
      committedCandidate = { activity, date };
    }
  }

  if (
    committedCandidate &&
    (!forecastCandidate || committedCandidate.date <= forecastCandidate.date)
  ) {
    return `Committed: ${committedCandidate.activity.name} starts ${committedCandidate.date}.`;
  }
  if (forecastCandidate) {
    return `${forecastCandidate.activity.name} forecast to start ${forecastCandidate.date}.`;
  }
  return "No schedulable next movement identified.";
}

/**
 * Pure, cheap, deterministic derivation of the one project-summary view shared by Penthouse and
 * the Index Card. Performs no D1 access, no network/model call, and mutates neither `model` nor
 * `forecast` nor `health`; the same inputs always produce the same output. Nothing this function
 * returns is ever written back to canonical state -- it is recomputed on every read.
 */
export function buildProjectSummary(
  model: ProjectModelV094,
  forecast: ForecastSnapshotV094 | undefined,
  health: ProjectHealthV094,
): ProjectSummaryV096 {
  const score = computeIntegrityScore(health, forecast);
  return {
    projectId: model.projectId,
    projectName: model.name,
    progressPercent: computeProgressPercent(model),
    integrity: {
      score,
      condition: conditionLabel(score),
      primaryDriver: computePrimaryDriver(health, forecast),
    },
    budget: computeBudget(model),
    primaryExposure: computePrimaryExposure(health, forecast),
    nextMovement: computeNextMovement(model, forecast),
    projectedCompletion: forecast?.completion.likely ?? null,
    schedule: computeSchedule(model, forecast),
    scope: computeScope(model),
  };
}
