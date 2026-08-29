import { activityCoverage } from "../engine/coverage";
import type { CoverageBreakdownV094 } from "../engine/coverage";
import { summarizeAccuracy } from "../engine/metrics";
import type { AccuracySummaryV094 } from "../engine/metrics";
import type { ForecastSnapshotV094, DateRangeV094 } from "../engine/solver";
import type {
  ConflictV094,
  ConstraintV094,
  ProjectModelV094,
} from "../domain/types";

interface PredictionOutcomeReader {
  loadPredictionOutcomes(projectId?: string): Promise<
    {
      horizonDays: number;
      pointErrorWorkdays: number;
      rangeHit: boolean;
      confidenceAtPrediction: number;
    }[]
  >;
}

export interface ProjectHealthV094 {
  projectId: string;
  revision: number;
  forecastVersion: number | null;
  completion: DateRangeV094 | null;
  meanForecastConfidence: number;
  openConflicts: ConflictV094[];
  blockedConstraints: ConstraintV094[];
  unverifiedHardConstraints: ConstraintV094[];
  lowCoverage: CoverageBreakdownV094[];
  accuracyByHorizon: AccuracySummaryV094[];
}

export async function projectHealth(
  repo: PredictionOutcomeReader,
  model: ProjectModelV094,
  forecast: ForecastSnapshotV094 | undefined,
): Promise<ProjectHealthV094> {
  const coverage = Object.keys(model.activities).map((id) =>
    activityCoverage(model, id),
  );
  const outcomes = await repo.loadPredictionOutcomes(model.projectId);
  const accuracy = summarizeAccuracy(outcomes);
  const openConflicts = Object.values(model.conflicts ?? {}).filter(
    (c) => c.status === "OPEN",
  );
  const blockedConstraints = Object.values(model.constraints).filter(
    (c) => c.state === "BLOCKED",
  );
  const unverifiedHardConstraints = Object.values(model.constraints).filter(
    (c) => c.hard && c.state === "UNVERIFIED",
  );
  const lowCoverage = coverage
    .filter((c) => c.overall < 0.6)
    .sort((a, b) => a.overall - b.overall);
  const confidence = forecast
    ? Object.values(forecast.activityForecasts).reduce(
        (sum, f) => sum + f.confidence.overall,
        0,
      ) / Math.max(1, Object.keys(forecast.activityForecasts).length)
    : 0;
  return {
    projectId: model.projectId,
    revision: model.revision,
    forecastVersion: forecast?.version ?? null,
    completion: forecast?.completion ?? null,
    meanForecastConfidence: confidence,
    openConflicts,
    blockedConstraints,
    unverifiedHardConstraints,
    lowCoverage,
    accuracyByHorizon: accuracy,
  };
}

/**
 * The v0.9.4 baseline's `GET /health` route assembled this diagnostic inline in `worker/index.js`
 * (SERVICE_VERSION="0.9.4", SCHEMA_TABLES=[...]) rather than as a named, testable function.
 * Mechanically extracted here unchanged, plus the v0.9.5-approved additions: `version` bumped to
 * "0.9.5", `engineCompatibilityVersion` ("0.9.4"), and explicit `dashboardConnected`/
 * `calendarConnected` flags (design doc §4.3, §16 — always false, never live-connected).
 */
const SCHEMA_TABLES = [
  "projects",
  "project_events",
  "forecast_snapshots",
  "oversight_reviews",
  "learning_records",
  "prediction_outcomes",
] as const;

export interface WorkerHealthV094 {
  ok: boolean;
  service: string;
  mode: string;
  version: string;
  database: { bound: boolean; schemaReady: boolean; error?: string };
  adminConfigured: boolean;
  liveSystemsConnected: false;
  engineCompatibilityVersion: string;
  dashboardConnected: false;
  calendarConnected: false;
}

export async function buildHealthReport(
  db: D1Database | undefined,
  mode: string | undefined,
  adminConfigured: boolean,
): Promise<WorkerHealthV094> {
  const databaseBound = Boolean(db);
  let schemaReady = false;
  let databaseError: string | undefined;
  if (databaseBound && db) {
    try {
      const placeholders = SCHEMA_TABLES.map(() => "?").join(",");
      const rows = await db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
        )
        .bind(...SCHEMA_TABLES)
        .all<{ name: string }>();
      schemaReady = rows.results.length === SCHEMA_TABLES.length;
    } catch (error) {
      databaseError = error instanceof Error ? error.message : String(error);
    }
  }
  const database = databaseError
    ? { bound: databaseBound, schemaReady, error: databaseError }
    : { bound: databaseBound, schemaReady };
  return {
    ok: databaseBound && schemaReady && adminConfigured,
    service: "howler-scheduling-staging",
    mode: mode ?? "shadow",
    version: "0.9.5",
    database,
    adminConfigured,
    liveSystemsConnected: false,
    engineCompatibilityVersion: "0.9.4",
    dashboardConnected: false,
    calendarConnected: false,
  };
}
