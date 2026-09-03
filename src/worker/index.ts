import {
  forecastAfterEvent,
  forecastInitial,
  publishForecast,
} from "../engine/engine";
import type { ForecastRunV094 } from "../engine/engine";
import { analyzeRecovery } from "../engine/solver";
import type { ForecastSnapshotV094 } from "../engine/solver";
import { validateProjectModel } from "../domain/validation";
import { RevisionConflictError } from "../engine/storage";
import { createDeboardSeed } from "./deboard-seed";
import { adminPage, operatorPanelPage, fieldDashboardPage } from "./admin";
import { buildHealthReport, projectHealth } from "./health";
import { sha256Hex } from "./hash";
import { json, readJson, HttpError, requireAdmin } from "./http";
import { D1HowlerRepository } from "./repository";
import { validateUnderstandingProposal } from "./understanding";
import type { UnderstandingProposalInputV094 } from "./understanding";
import type { ProjectEventV094, ProjectModelV094 } from "../domain/types";
import { validateIntent } from "../operator/intent";
import { executeWorkflow, isTerminalWorkflowState } from "../operator/workflow";
import type {
  AuthorizationAttestation,
  ExecuteWorkflowResult,
  WorkflowExecutorDeps,
} from "../operator/workflow";
import { buildIntentSubmissionResponse } from "../operator/result";

// Engine/admin-page compatibility version. Distinct from GET /health's own `version` field, which
// buildHealthReport (src/worker/health.ts) now owns and reports as "0.9.5" with an additive
// engineCompatibilityVersion of "0.9.4" — see design doc §4.3.
const SERVICE_VERSION = "0.9.4";

// Task 15: the operator executor judges this against `assertStagingShadowPolicy`
// (src/operator/policy.ts) exactly as policy.ts's own STAGING_WORKER_NAME constant does. Not read
// from an env binding — wrangler.jsonc's own committed worker name has no runtime env
// counterpart, so this mirrors SERVICE_VERSION's existing hardcoded-constant pattern above.
const OPERATOR_WORKER_NAME = "jarvis-voice-staging";

const SCHEMA_TABLES = [
  "projects",
  "project_events",
  "forecast_snapshots",
  "oversight_reviews",
  "learning_records",
  "prediction_outcomes",
] as const;

const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0), current_model_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS project_events (project_id TEXT NOT NULL, event_id TEXT NOT NULL, base_revision INTEGER NOT NULL, new_revision INTEGER NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, event_json TEXT NOT NULL, model_after_json TEXT NOT NULL, PRIMARY KEY (project_id, event_id), UNIQUE (project_id, new_revision), FOREIGN KEY (project_id) REFERENCES projects(project_id))",
  "CREATE TRIGGER IF NOT EXISTS project_events_revision_guard BEFORE INSERT ON project_events BEGIN SELECT CASE WHEN (SELECT revision FROM projects WHERE project_id = NEW.project_id) IS NULL THEN RAISE(ABORT, 'HOWLER_PROJECT_NOT_FOUND') WHEN (SELECT revision FROM projects WHERE project_id = NEW.project_id) <> NEW.base_revision THEN RAISE(ABORT, 'HOWLER_REVISION_CONFLICT') WHEN NEW.new_revision <> NEW.base_revision + 1 THEN RAISE(ABORT, 'HOWLER_INVALID_REVISION_INCREMENT') END; END",
  "CREATE TRIGGER IF NOT EXISTS project_events_apply_model AFTER INSERT ON project_events BEGIN UPDATE projects SET revision = NEW.new_revision, current_model_json = NEW.model_after_json, updated_at = NEW.received_at WHERE project_id = NEW.project_id; END",
  "CREATE TRIGGER IF NOT EXISTS project_events_no_update BEFORE UPDATE ON project_events BEGIN SELECT RAISE(ABORT, 'project_events is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS project_events_no_delete BEFORE DELETE ON project_events BEGIN SELECT RAISE(ABORT, 'project_events is append-only'); END",
  "CREATE TABLE IF NOT EXISTS forecast_snapshots (snapshot_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, model_revision INTEGER NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('WORKING','PROPOSED','PUBLISHED')), snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (project_id, version), FOREIGN KEY (project_id) REFERENCES projects(project_id))",
  "CREATE TABLE IF NOT EXISTS oversight_reviews (review_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, candidate_snapshot_id TEXT NOT NULL, decision TEXT NOT NULL CHECK (decision IN ('PASS','PASS_WITH_WARNINGS','BLOCK')), review_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(project_id), FOREIGN KEY (candidate_snapshot_id) REFERENCES forecast_snapshots(snapshot_id))",
  "CREATE TABLE IF NOT EXISTS learning_records (learning_id TEXT PRIMARY KEY, layer TEXT NOT NULL, subject_key TEXT NOT NULL, hypothesis_type TEXT NOT NULL, record_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS prediction_outcomes (prediction_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, activity_id TEXT NOT NULL, source_snapshot_id TEXT NOT NULL, horizon_days INTEGER NOT NULL, point_error_workdays REAL NOT NULL, range_hit INTEGER NOT NULL CHECK (range_hit IN (0,1)), confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1), outcome_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(project_id), FOREIGN KEY (source_snapshot_id) REFERENCES forecast_snapshots(snapshot_id))",
  "CREATE INDEX IF NOT EXISTS idx_project_events_revision ON project_events(project_id, new_revision)",
  "CREATE INDEX IF NOT EXISTS idx_forecast_project_status ON forecast_snapshots(project_id, status, version)",
  "CREATE INDEX IF NOT EXISTS idx_outcomes_project_activity ON prediction_outcomes(project_id, activity_id)",
  "CREATE TRIGGER IF NOT EXISTS forecast_snapshots_no_update BEFORE UPDATE ON forecast_snapshots BEGIN SELECT RAISE(ABORT, 'forecast_snapshots is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS forecast_snapshots_no_delete BEFORE DELETE ON forecast_snapshots BEGIN SELECT RAISE(ABORT, 'forecast_snapshots is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS oversight_reviews_no_update BEFORE UPDATE ON oversight_reviews BEGIN SELECT RAISE(ABORT, 'oversight_reviews is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS oversight_reviews_no_delete BEFORE DELETE ON oversight_reviews BEGIN SELECT RAISE(ABORT, 'oversight_reviews is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS prediction_outcomes_no_update BEFORE UPDATE ON prediction_outcomes BEGIN SELECT RAISE(ABORT, 'prediction_outcomes is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS prediction_outcomes_no_delete BEFORE DELETE ON prediction_outcomes BEGIN SELECT RAISE(ABORT, 'prediction_outcomes is append-only'); END",
] as const;

// Task 12 (migrations/0002_operator_runs.sql): additive operator persistence tables. Kept as its
// own constant array, exactly mirroring SCHEMA_STATEMENTS' pattern, so init-db's v0.9.4 readiness
// fields/values are completely unaffected — operator-table readiness is reported as a new,
// additive field. test/contract/v094-routes.test.ts proves this array stays byte-for-semantic
// identical to the committed migration file, so the route cannot drift from migration source.
const OPERATOR_SCHEMA_TABLES = [
  "operator_intents",
  "workflow_runs",
  "workflow_steps",
  "workflow_results",
] as const;

const OPERATOR_SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS operator_intents (intent_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('FORECAST_QUERY','FORECAST_HEALTH_QUERY','RECOVERY_QUERY','EVIDENCE_PREVIEW','EVIDENCE_APPLY_SHADOW')), request_json TEXT NOT NULL, request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'), created_at TEXT NOT NULL, UNIQUE (project_id, idempotency_key))",
  "CREATE TRIGGER IF NOT EXISTS operator_intents_no_update BEFORE UPDATE ON operator_intents BEGIN SELECT RAISE(ABORT, 'operator_intents is immutable'); END",
  "CREATE TRIGGER IF NOT EXISTS operator_intents_no_delete BEFORE DELETE ON operator_intents BEGIN SELECT RAISE(ABORT, 'operator_intents is immutable'); END",
  "CREATE TABLE IF NOT EXISTS workflow_runs (workflow_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, intent_hash TEXT NOT NULL CHECK (length(intent_hash) = 64 AND intent_hash NOT GLOB '*[^0-9a-f]*'), project_id TEXT NOT NULL, workflow_type TEXT NOT NULL CHECK (workflow_type = 'OPERATOR_INTENT_V1'), workflow_version INTEGER NOT NULL CHECK (workflow_version = 1), state TEXT NOT NULL CHECK (state IN ('RECEIVED','VALIDATING','READY','RUNNING','INTERRUPTED','BLOCKED','FAILED','SUCCEEDED')), current_step TEXT, attempt INTEGER NOT NULL CHECK (attempt >= 1), max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1), resumable INTEGER NOT NULL CHECK (resumable IN (0,1)), interruption_json TEXT, blocked_reason_json TEXT, failure_json TEXT, result_id TEXT, created_at TEXT NOT NULL, started_at TEXT, updated_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY (intent_id) REFERENCES operator_intents(intent_id), CHECK (attempt <= max_attempts), CHECK ((state IN ('SUCCEEDED','BLOCKED','FAILED') AND result_id IS NOT NULL) OR (state NOT IN ('SUCCEEDED','BLOCKED','FAILED') AND result_id IS NULL)))",
  "CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_state ON workflow_runs(project_id, state)",
  "CREATE TABLE IF NOT EXISTS workflow_steps (workflow_id TEXT NOT NULL, step_name TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK (ordinal >= 0), state TEXT NOT NULL CHECK (state IN ('PENDING','RUNNING','SUCCEEDED','BLOCKED','FAILED','SKIPPED')), attempt INTEGER NOT NULL CHECK (attempt >= 1), input_hash TEXT NOT NULL CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'), output_json TEXT, output_hash TEXT, problem_json TEXT, started_at TEXT, completed_at TEXT, PRIMARY KEY (workflow_id, step_name), FOREIGN KEY (workflow_id) REFERENCES workflow_runs(workflow_id))",
  "CREATE TABLE IF NOT EXISTS workflow_results (result_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL UNIQUE, intent_id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('SUCCEEDED','BLOCKED','FAILED')), result_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (workflow_id) REFERENCES workflow_runs(workflow_id), FOREIGN KEY (intent_id) REFERENCES operator_intents(intent_id))",
  "CREATE TRIGGER IF NOT EXISTS workflow_results_no_update BEFORE UPDATE ON workflow_results BEGIN SELECT RAISE(ABORT, 'workflow_results is immutable'); END",
  "CREATE TRIGGER IF NOT EXISTS workflow_results_no_delete BEFORE DELETE ON workflow_results BEGIN SELECT RAISE(ABORT, 'workflow_results is immutable'); END",
  "CREATE TRIGGER IF NOT EXISTS workflow_results_identity_guard BEFORE INSERT ON workflow_results BEGIN SELECT CASE WHEN (SELECT intent_id FROM workflow_runs WHERE workflow_id = NEW.workflow_id) <> NEW.intent_id THEN RAISE(ABORT, 'HOWLER_RESULT_INTENT_MISMATCH') WHEN (SELECT project_id FROM workflow_runs WHERE workflow_id = NEW.workflow_id) <> NEW.project_id THEN RAISE(ABORT, 'HOWLER_RESULT_PROJECT_MISMATCH') WHEN (SELECT state FROM workflow_runs WHERE workflow_id = NEW.workflow_id) <> NEW.status THEN RAISE(ABORT, 'HOWLER_RESULT_STATUS_MISMATCH') END; END",
] as const;

// Every object name the operator schema actually creates (tables + trigger + index), used to
// prove exact bidirectional parity against the migration file — not just "these table names
// exist" (which a malformed/partial same-named object would also satisfy).
const OPERATOR_SCHEMA_OBJECT_NAMES = [
  "operator_intents",
  "operator_intents_no_update",
  "operator_intents_no_delete",
  "workflow_runs",
  "idx_workflow_runs_project_state",
  "workflow_steps",
  "workflow_results",
  "workflow_results_no_update",
  "workflow_results_no_delete",
  "workflow_results_identity_guard",
] as const;

/** D1/SQLite drops the (semantically inert) `IF NOT EXISTS` clause from the stored DDL text. */
function normalizeSchemaStatement(sql: string): string {
  return sql
    .replace(
      /^(CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER))\s+IF NOT EXISTS\s+/i,
      "$1 ",
    )
    .trim();
}

interface OperatorSchemaInitResult {
  ok: boolean;
  expected: readonly string[];
  found: string[];
}

interface SchemaInitResult {
  ok: boolean;
  expected: readonly string[];
  found: string[];
  statementsApplied: number;
  operatorSchema: OperatorSchemaInitResult;
}

async function applyStatements(
  db: D1Database,
  statements: readonly string[],
  label: string,
): Promise<number> {
  let applied = 0;
  // Iterated via `.entries()` rather than a classic indexed for-loop: with
  // `noUncheckedIndexedAccess`, indexed access types as `string | undefined`, but `.entries()`
  // yields the element type directly since it always produces exactly `length` pairs.
  for (const [index, statement] of statements.entries()) {
    try {
      await db.prepare(statement).run();
      applied += 1;
    } catch (error) {
      throw new HttpError(
        500,
        `${label} initialization failed at statement ${String(index + 1)}`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }
  return applied;
}

async function findExistingTables(
  db: D1Database,
  tables: readonly string[],
): Promise<string[]> {
  const placeholders = tables.map(() => "?").join(",");
  const found = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders}) ORDER BY name`,
    )
    .bind(...tables)
    .all<{ name: string }>();
  return found.results.map((row) => row.name);
}

/**
 * Verifies the *full* operator schema is present with byte-for-semantic-identical DDL — every
 * table, trigger, and index the migration creates, not just "a table with this name exists".
 * A malformed or partial same-named object (wrong columns, missing constraint, etc.) has
 * different normalized SQL text and so is correctly reported as not ready.
 */
async function verifyOperatorSchemaReadiness(
  db: D1Database,
): Promise<OperatorSchemaInitResult> {
  const placeholders = OPERATOR_SCHEMA_OBJECT_NAMES.map(() => "?").join(",");
  const found = await db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master WHERE name IN (${placeholders})`,
    )
    .bind(...OPERATOR_SCHEMA_OBJECT_NAMES)
    .all<{ type: string; name: string; sql: string | null }>();
  const foundStatements = new Set(
    found.results.map((row) =>
      row.sql ? normalizeSchemaStatement(row.sql) : "",
    ),
  );
  const expectedStatements = OPERATOR_SCHEMA_STATEMENTS.map(
    normalizeSchemaStatement,
  );
  const ok =
    found.results.length === OPERATOR_SCHEMA_OBJECT_NAMES.length &&
    expectedStatements.every((expected) => foundStatements.has(expected));
  const tableNames = found.results
    .filter((row) => row.type === "table")
    .map((row) => row.name);
  return { ok, expected: OPERATOR_SCHEMA_TABLES, found: tableNames };
}

async function initializeSchema(
  db: D1Database | undefined,
): Promise<SchemaInitResult> {
  if (!db) throw new HttpError(500, "HOWLER_DB is not bound");
  const statementsApplied = await applyStatements(
    db,
    SCHEMA_STATEMENTS,
    "Schema",
  );
  const tableNames = await findExistingTables(db, SCHEMA_TABLES);
  await applyStatements(db, OPERATOR_SCHEMA_STATEMENTS, "Operator schema");
  const operatorSchema = await verifyOperatorSchemaReadiness(db);
  return {
    ok: tableNames.length === SCHEMA_TABLES.length,
    expected: SCHEMA_TABLES,
    found: tableNames,
    statementsApplied,
    operatorSchema,
  };
}

function route(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function nextVersion(latest: ForecastSnapshotV094 | undefined): number {
  return (latest?.version ?? 0) + 1;
}

interface RawEventShape {
  projectId?: unknown;
  baseRevision?: unknown;
  sourceIds?: unknown;
  impactSeedActivityIds?: unknown;
  mutations?: unknown;
  occurredAt?: unknown;
  receivedAt?: unknown;
}

interface ReviewedRunResult {
  model: ProjectModelV094;
  baseline: ForecastSnapshotV094 | undefined;
  latest: ForecastSnapshotV094 | undefined;
  comparisonBaseline: ForecastSnapshotV094 | undefined;
  run: ForecastRunV094;
  reviewToken: string;
}

async function reviewedRun(
  repo: D1HowlerRepository,
  projectId: string,
  rawEvent: unknown,
): Promise<ReviewedRunResult> {
  const model = await repo.loadProject(projectId);
  if (!model) throw new HttpError(404, `Project ${projectId} not found`);
  // Baseline reads `event.projectId` before checking whether `event` is an object at all; a
  // null/primitive body throws an unhandled TypeError here (caught by fetch()'s generic 500
  // branch) rather than reaching the "Event body is required" 400 below. Preserved exactly.
  const rawShape = rawEvent as RawEventShape;
  if (rawShape.projectId !== projectId)
    throw new HttpError(400, "Event projectId does not match URL project ID");
  const [baseline, latest] = await Promise.all([
    repo.loadLatestPublishedForecast(projectId),
    repo.loadLatestForecast(projectId),
  ]);
  if (!rawEvent || typeof rawEvent !== "object")
    throw new HttpError(400, "Event body is required");
  if (
    !Number.isInteger(rawShape.baseRevision) ||
    rawShape.baseRevision !== model.revision
  ) {
    throw new HttpError(
      409,
      `Event baseRevision must equal current project revision ${String(model.revision)}`,
    );
  }
  if (
    !Array.isArray(rawShape.sourceIds) ||
    !Array.isArray(rawShape.impactSeedActivityIds) ||
    !Array.isArray(rawShape.mutations)
  ) {
    throw new HttpError(
      400,
      "Event sourceIds, impactSeedActivityIds, and mutations must be arrays",
    );
  }
  if (
    !Number.isFinite(Date.parse(String(rawShape.occurredAt))) ||
    !Number.isFinite(Date.parse(String(rawShape.receivedAt)))
  ) {
    throw new HttpError(
      400,
      "Event occurredAt and receivedAt must be valid ISO timestamps",
    );
  }
  const event = rawEvent as ProjectEventV094;
  const comparisonBaseline = latest ?? baseline;
  const run = forecastAfterEvent(
    model,
    event,
    event.receivedAt,
    nextVersion(latest),
    comparisonBaseline,
  );
  const reviewToken = await sha256Hex({
    projectRevision: model.revision,
    latestForecastVersion: latest?.version ?? 0,
    event,
    candidate: run.candidate,
    oversight: run.oversight,
  });
  return { model, baseline, latest, comparisonBaseline, run, reviewToken };
}

/**
 * Task 15: the one place a repository + runtime mode become the injected dependencies
 * `executeWorkflow` (src/operator/workflow.ts) needs. Builds no domain/workflow behavior of its
 * own — purely transport-side wiring so the HTTP layer never duplicates operator logic.
 */
function buildWorkflowExecutorDeps(
  repo: D1HowlerRepository,
  mode: string,
): WorkflowExecutorDeps {
  const authorization: AuthorizationAttestation = {
    authenticated: true,
    mode,
    workerName: OPERATOR_WORKER_NAME,
  };
  return {
    repo,
    clock: { now: () => new Date() },
    workflowIds: { next: () => crypto.randomUUID() },
    resultIds: { next: () => crypto.randomUUID() },
    authorization,
  };
}

/**
 * The one place an `ExecuteWorkflowResult` becomes an HTTP response (design §7.3) — shared by
 * `POST /v1/intents` and the resume route, so the outcome-to-status mapping and the "was this a
 * replay" determination exist in exactly one place, not duplicated per route.
 *
 * `SUCCEEDED` -> 200 (replay) or 201 (fresh). `BLOCKED` -> 409: a business/revision/oversight
 * prerequisite conflicts with the current request (design §10.2 explicitly normalizes a
 * commit-time revision race to this same status). `FAILED` -> 500: a non-retryable
 * internal/technical failure, not a client-format problem — still returned as a structured
 * `WorkflowProblem`, never a stack trace.
 */
function respondToWorkflowOutcome(
  outcome: ExecuteWorkflowResult,
  alreadyTerminalBefore: boolean,
): Response {
  switch (outcome.outcome) {
    case "IDEMPOTENCY_KEY_REUSE":
      throw new HttpError(
        409,
        "Idempotency key reused with a different request",
        { code: "IDEMPOTENCY_KEY_REUSE" },
      );
    case "INTENT_ID_REUSE":
      throw new HttpError(409, "Intent ID reused with a different request", {
        code: "INTENT_ID_REUSE",
      });
    case "CONCURRENT_RESUME_LOST":
      throw new HttpError(
        409,
        "This workflow is concurrently being advanced by another request",
        {
          code: "CONCURRENT_RESUME_LOST",
          workflowId: outcome.run.workflowId,
        },
      );
    case "INTERRUPTED":
      return json(
        buildIntentSubmissionResponse(false, outcome.run, undefined),
        202,
      );
    case "COMPLETED": {
      const response = buildIntentSubmissionResponse(
        alreadyTerminalBefore,
        outcome.run,
        outcome.result,
      );
      if (outcome.result.status === "SUCCEEDED") {
        return json(response, alreadyTerminalBefore ? 200 : 201);
      }
      if (outcome.result.status === "BLOCKED") {
        return json(response, 409);
      }
      return json(response, 500);
    }
  }
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = route(url.pathname);
  // wrangler.jsonc's committed HOWLER_MODE:"shadow" makes `wrangler types` infer the narrow
  // literal type "shadow" for env.HOWLER_MODE. The runtime value is an ordinary var that could be
  // "controlled" in a differently-configured deployment, so it is widened once here (matching
  // baseline's own `env.HOWLER_MODE ?? "shadow"` fallback) rather than assumed to be one literal.
  const mode = (env.HOWLER_MODE as string | undefined) ?? "shadow";

  if (
    request.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/admin")
  ) {
    return adminPage(SERVICE_VERSION);
  }

  // Task 16A: a second, independent same-origin page — does not replace or modify /admin above.
  if (request.method === "GET" && url.pathname === "/admin/operator") {
    return operatorPanelPage();
  }

  // Task 16B: a third, independent same-origin page — does not replace or modify / or
  // /admin/operator above.
  if (request.method === "GET" && url.pathname === "/admin/field") {
    return fieldDashboardPage();
  }

  if (request.method === "GET" && url.pathname === "/health") {
    const adminConfigured = Boolean(env.HOWLER_ADMIN_KEY);
    return json(await buildHealthReport(env.HOWLER_DB, mode, adminConfigured));
  }

  if (parts[0] !== "v1") throw new HttpError(404, "Not found");
  await requireAdmin(request, env.HOWLER_ADMIN_KEY);

  if (request.method === "POST" && parts.join("/") === "v1/admin/init-db") {
    const result = await initializeSchema(env.HOWLER_DB);
    return json({ ...result, stagingOnly: true }, result.ok ? 200 : 500);
  }

  const repo = new D1HowlerRepository(env.HOWLER_DB);

  if (
    request.method === "POST" &&
    parts.join("/") === "v1/projects/deboard-v091/seed"
  ) {
    if (await repo.projectExists("deboard-v091"))
      throw new HttpError(409, "DeBoard v0.9.1 is already seeded");
    const model = createDeboardSeed();
    validateProjectModel(model);
    const initial = forecastInitial(model, new Date().toISOString(), 1);
    // Do not bypass oversight. A blocked seed remains WORKING, never force-labeled PUBLISHED.
    await repo.createProject(model, initial.candidate, initial.oversight);
    return json(
      {
        project: model,
        initialForecast: initial.candidate,
        oversight: initial.oversight,
        forecastable: initial.forecastable,
        commitmentEligible: initial.commitmentEligible,
        oversightPublishable: initial.publishable,
        publishable: false,
        stagingOnly: true,
      },
      201,
    );
  }

  // Conversational PM layer (Task 13): generalizes the deboard-v091/seed route above into a
  // reusable, projectId-parameterized onboarding path — reuses repo.createProject/
  // validateProjectModel/forecastInitial verbatim (all existing, unchanged); no second creation
  // path is built. `dryRun: true` runs the same validation/forecast preview without ever calling
  // repo.createProject (zero D1 writes) — the same EVIDENCE_PREVIEW/EVIDENCE_APPLY_SHADOW
  // two-step pattern already used elsewhere in this codebase, applied to project creation.
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[1] === "projects" &&
    parts[2] &&
    parts[3] === "import"
  ) {
    const targetProjectId = parts[2];
    const raw = (await readJson(request)) as {
      project?: unknown;
      provenance?: unknown;
      dryRun?: unknown;
    } | null;
    if (!raw || typeof raw !== "object" || !raw.project) {
      throw new HttpError(400, "import requires a project body");
    }
    const model = raw.project as ProjectModelV094;
    if (model.projectId !== targetProjectId) {
      throw new HttpError(
        400,
        `import payload projectId "${String(model.projectId)}" does not match URL project id "${targetProjectId}"`,
      );
    }
    const provenance =
      raw.provenance && typeof raw.provenance === "object"
        ? (raw.provenance as Record<string, unknown>)
        : {};
    const missingProvenance = [
      ...Object.keys(model.activities ?? {}),
      ...Object.keys(model.constraints ?? {}),
    ].filter((id) => !(id in provenance));
    if (missingProvenance.length > 0) {
      throw new HttpError(
        400,
        `import payload is missing a provenance manifest entry for: ${missingProvenance.join(", ")}`,
      );
    }

    try {
      validateProjectModel(model);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Invalid project model",
      );
    }
    const initial = forecastInitial(model, new Date().toISOString(), 1);

    if (raw.dryRun === true) {
      return json({
        preview: true,
        projectId: model.projectId,
        forecastable: initial.forecastable,
        commitmentEligible: initial.commitmentEligible,
        oversightPublishable: initial.publishable,
        provenanceManifest: provenance,
      });
    }

    if (await repo.projectExists(targetProjectId)) {
      throw new HttpError(409, `Project ${targetProjectId} already exists`);
    }
    // Do not bypass oversight. A blocked import remains WORKING, never force-labeled PUBLISHED —
    // mirrors the existing deboard-v091/seed handler's own contract exactly.
    await repo.createProject(model, initial.candidate, initial.oversight);
    return json(
      {
        project: model,
        initialForecast: initial.candidate,
        oversight: initial.oversight,
        forecastable: initial.forecastable,
        commitmentEligible: initial.commitmentEligible,
        oversightPublishable: initial.publishable,
        publishable: false,
        stagingOnly: true,
        provenanceManifest: provenance,
      },
      201,
    );
  }

  // Task 15: additive operator HTTP contracts (design §7.3). Thin adapters only — all four
  // routes call straight into `executeWorkflow`/the repository; no workflow/domain logic is
  // reimplemented here.
  if (request.method === "POST" && parts.join("/") === "v1/intents") {
    const body = await readJson(request);
    const validated = validateIntent(body);
    if (!validated.valid) {
      throw new HttpError(400, "Invalid intent", {
        problems: validated.problems,
      });
    }
    const intent = validated.intent;
    const before = await repo.loadWorkflowRunByIntentId(intent.intentId);
    const alreadyTerminal =
      before !== undefined && isTerminalWorkflowState(before.state);
    const outcome = await executeWorkflow(
      buildWorkflowExecutorDeps(repo, mode),
      intent,
    );
    return respondToWorkflowOutcome(outcome, alreadyTerminal);
  }

  if (
    request.method === "GET" &&
    parts.length === 3 &&
    parts[1] === "workflows" &&
    parts[2]
  ) {
    const workflowId = parts[2];
    const run = await repo.loadWorkflowRun(workflowId);
    if (!run) throw new HttpError(404, `Workflow ${workflowId} not found`);
    return json(run);
  }

  if (
    request.method === "GET" &&
    parts.length === 3 &&
    parts[1] === "results" &&
    parts[2]
  ) {
    const resultId = parts[2];
    const result = await repo.loadWorkflowResult(resultId);
    if (!result) throw new HttpError(404, `Result ${resultId} not found`);
    return json(result);
  }

  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[1] === "workflows" &&
    parts[2] &&
    parts[3] === "resume"
  ) {
    const workflowId = parts[2];
    const run = await repo.loadWorkflowRun(workflowId);
    if (!run) throw new HttpError(404, `Workflow ${workflowId} not found`);
    const intent = await repo.loadIntentByWorkflowId(workflowId);
    if (!intent) {
      throw new HttpError(
        500,
        `Workflow ${workflowId} has no matching intent record`,
      );
    }
    const alreadyTerminal = isTerminalWorkflowState(run.state);
    const outcome = await executeWorkflow(
      buildWorkflowExecutorDeps(repo, mode),
      intent,
    );
    return respondToWorkflowOutcome(outcome, alreadyTerminal);
  }

  if (parts[1] !== "projects" || !parts[2])
    throw new HttpError(404, "Not found");
  const projectId = parts[2];

  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[3] === "forecast"
  ) {
    const model = await repo.loadProject(projectId);
    if (!model) throw new HttpError(404, `Project ${projectId} not found`);
    const [latest, published] = await Promise.all([
      repo.loadLatestForecast(projectId),
      repo.loadLatestPublishedForecast(projectId),
    ]);
    return json({ modelRevision: model.revision, latest, published });
  }

  if (
    request.method === "GET" &&
    parts.length === 5 &&
    parts[3] === "forecast" &&
    parts[4] === "health"
  ) {
    const model = await repo.loadProject(projectId);
    if (!model) throw new HttpError(404, `Project ${projectId} not found`);
    const latest = await repo.loadLatestForecast(projectId);
    return json(await projectHealth(repo, model, latest));
  }

  if (
    request.method === "GET" &&
    parts.length === 5 &&
    parts[3] === "forecast" &&
    parts[4] === "recovery"
  ) {
    const model = await repo.loadProject(projectId);
    if (!model) throw new HttpError(404, `Project ${projectId} not found`);
    const latest = await repo.loadLatestForecast(projectId);
    if (!latest)
      throw new HttpError(404, `No forecast exists for ${projectId}`);
    const baseline = latest.deltaFromSnapshotId
      ? await repo.loadForecastById(projectId, latest.deltaFromSnapshotId)
      : await repo.loadLatestPublishedForecast(projectId);
    const recovery = analyzeRecovery(model, latest, baseline);
    return json({
      projectId,
      projectRevision: model.revision,
      latestVersion: latest.version,
      baselineVersion: baseline?.version ?? null,
      recovery,
      recoveryLayer: {
        version: SERVICE_VERSION,
        status: recovery.status,
        nextRiskDate: recovery.nextRiskDate ?? null,
        criticalExposureCount: recovery.criticalExposureCount ?? 0,
        blockedProtectionCount: recovery.blockedProtectionCount ?? 0,
        standbyRecoveryCapacityWorkdays:
          recovery.standbyRecoveryCapacityWorkdays ?? 0,
      },
      publicationGate: {
        forecastAllowed: true,
        commitmentEligible: false,
        publishable: false,
        mode,
      },
      stagingOnly: true,
    });
  }

  if (request.method === "GET" && parts.length === 4 && parts[3] === "events") {
    const limit = Number(url.searchParams.get("limit") ?? "100");
    return json({
      events: await repo.loadEvents(
        projectId,
        Number.isFinite(limit) ? limit : 100,
      ),
    });
  }

  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[3] === "learning"
  ) {
    return json({
      learning: await repo.loadLearningRecords(
        url.searchParams.get("subjectKey") ?? undefined,
      ),
    });
  }

  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[3] === "understanding" &&
    parts[4] === "preview"
  ) {
    const input = (await readJson(request)) as UnderstandingProposalInputV094;
    if (input.projectId !== projectId)
      throw new HttpError(
        400,
        "Understanding proposal projectId does not match URL project ID",
      );
    return json(validateUnderstandingProposal(input));
  }

  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[3] === "events" &&
    parts[4] === "preview"
  ) {
    const event = await readJson(request);
    const result = await reviewedRun(repo, projectId, event);
    return json({
      projectRevision: result.model.revision,
      baselineVersion: result.baseline?.version ?? null,
      latestVersion: result.latest?.version ?? null,
      comparisonVersion: result.comparisonBaseline?.version ?? null,
      candidate: result.run.candidate,
      delta: result.run.candidate.delta ?? null,
      recoveryAnalysis: result.run.candidate.recoveryAnalysis,
      supersededSources: result.run.candidate.supersededSources,
      impactActivityIds: result.run.candidate.impactActivityIds,
      oversight: result.run.oversight,
      forecastable: result.run.forecastable,
      commitmentEligible: result.run.commitmentEligible,
      oversightPublishable: result.run.publishable,
      publishable: mode === "controlled" && result.run.publishable,
      reviewToken: result.reviewToken,
      persisted: false,
      mode,
      stagingOnly: mode === "shadow",
    });
  }

  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[3] === "events" &&
    parts[4] === "apply-shadow"
  ) {
    if (mode !== "shadow") {
      throw new HttpError(
        403,
        "Shadow evidence application is available only while HOWLER_MODE=shadow",
      );
    }
    const body = (await readJson(request)) as {
      event?: unknown;
      reviewToken?: unknown;
    };
    const result = await reviewedRun(repo, projectId, body.event);
    if (result.reviewToken !== body.reviewToken) {
      throw new HttpError(
        409,
        "Preview no longer matches the current project state. Re-preview before applying shadow evidence.",
      );
    }
    await repo.commitShadowTransition({
      expectedRevision: result.model.revision,
      modelAfterEvent: result.run.modelAfterEvent,
      event: body.event as ProjectEventV094,
      candidate: result.run.candidate,
      oversight: result.run.oversight,
    });
    return json(
      {
        applied: true,
        stagingOnly: true,
        projectRevision: result.run.modelAfterEvent.revision,
        candidate: result.run.candidate,
        delta: result.run.candidate.delta ?? null,
        recoveryAnalysis: result.run.candidate.recoveryAnalysis,
        supersededSources: result.run.candidate.supersededSources,
        impactActivityIds: result.run.candidate.impactActivityIds,
        oversight: result.run.oversight,
        publicationGate: {
          forecastAllowed: true,
          commitmentEligible: result.run.commitmentEligible,
          publishable: false,
          mode: "shadow",
        },
      },
      201,
    );
  }

  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[3] === "events" &&
    parts[4] === "publish"
  ) {
    if (mode !== "controlled") {
      throw new HttpError(
        403,
        "Publishing is disabled while HOWLER_MODE=shadow",
      );
    }
    const body = (await readJson(request)) as {
      event?: unknown;
      reviewToken?: unknown;
    };
    const result = await reviewedRun(repo, projectId, body.event);
    if (result.reviewToken !== body.reviewToken) {
      throw new HttpError(
        409,
        "Preview no longer matches the current project state. Re-preview before publishing.",
      );
    }
    if (!result.run.publishable) {
      throw new HttpError(
        409,
        "Oversight blocked publication",
        result.run.oversight,
      );
    }
    const published = publishForecast(result.run);
    await repo.commitForecastTransition({
      expectedRevision: result.model.revision,
      modelAfterEvent: result.run.modelAfterEvent,
      event: body.event as ProjectEventV094,
      candidate: result.run.candidate,
      oversight: result.run.oversight,
      published,
    });
    return json({ published, oversight: result.run.oversight }, 201);
  }

  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: error.message, details: error.details },
          error.status,
        );
      if (error instanceof RevisionConflictError)
        return json({ error: error.message, code: "REVISION_CONFLICT" }, 409);
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          level: "error",
          service: "howler-scheduling-staging",
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          message,
        }),
      );
      return json({ error: "Internal server error", requestId }, 500);
    }
  },
};
