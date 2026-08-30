import { RevisionConflictError } from "../engine/storage";
import type { ProjectEventV094, ProjectModelV094 } from "../domain/types";
import type { ForecastSnapshotV094 } from "../engine/solver";
import type { OversightReviewV094 } from "../engine/oversight";
import type {
  LearningRecordV094,
  PredictionOutcomeV094,
} from "../engine/learning";
import type { IntentV1, ProjectEventInput } from "../operator/intent";
import {
  isValidTransition,
  validateTerminalInvariants,
} from "../operator/workflow";
import type {
  StepState,
  WorkflowProblem,
  WorkflowRunV1,
  WorkflowState,
  WorkflowStepName,
  WorkflowStepV1,
} from "../operator/workflow";
import type { ResultV1 } from "../operator/result";
import { sha256Hex, stableStringify } from "./hash";

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid persisted JSON for ${label}`);
  }
}

export interface ForecastTransitionV094 {
  expectedRevision: number;
  modelAfterEvent: ProjectModelV094;
  event: ProjectEventV094;
  candidate: ForecastSnapshotV094;
  oversight: OversightReviewV094;
  published: ForecastSnapshotV094;
}

export interface ShadowTransitionV094 {
  expectedRevision: number;
  modelAfterEvent: ProjectModelV094;
  event: ProjectEventV094;
  candidate: ForecastSnapshotV094;
  oversight: OversightReviewV094;
}

export interface ClaimIntentInput {
  /**
   * The already-validated intent (the output of Task 11's `validateIntent`), not independently
   * supplied identity columns/JSON/hash. `claimIntent` derives everything it persists — intentId,
   * projectId, idempotencyKey, kind, canonical JSON, and its SHA-256 — from this one trusted
   * object, so the persisted hash can never disagree with the persisted JSON.
   */
  intent: IntentV1;
  workflowId: string;
  maxAttempts: number;
  now: string;
}

export type ClaimIntentResult =
  | { outcome: "CLAIMED"; run: WorkflowRunV1 }
  | { outcome: "REPLAY"; run: WorkflowRunV1 }
  | { outcome: "IDEMPOTENCY_KEY_REUSE" }
  | { outcome: "INTENT_ID_REUSE" };

export interface UpdateWorkflowRunStateInput {
  workflowId: string;
  expectedState: WorkflowState;
  nextState: WorkflowState;
  now: string;
  currentStep?: string | null;
  interruption?: WorkflowProblem;
  blockedReason?: WorkflowProblem;
  failure?: WorkflowProblem;
  resultId?: string;
  markStarted?: boolean;
  markCompleted?: boolean;
  /** True only while INTERRUPTED and its problem is retryable (design §10.4); false otherwise. */
  resumable?: boolean;
  /** Set only on an INTERRUPTED -> RUNNING resume — a new workflow attempt (design §10.3). */
  incrementAttempt?: boolean;
}

export interface FinalizeWorkflowRunInput {
  workflowId: string;
  expectedState: WorkflowState;
  terminalState: "SUCCEEDED" | "BLOCKED" | "FAILED";
  result: ResultV1;
  now: string;
}

interface WorkflowRunRow {
  workflow_id: string;
  intent_id: string;
  intent_hash: string;
  project_id: string;
  workflow_type: string;
  workflow_version: number;
  state: WorkflowState;
  current_step: string | null;
  attempt: number;
  max_attempts: number;
  resumable: number;
  interruption_json: string | null;
  blocked_reason_json: string | null;
  failure_json: string | null;
  result_id: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
}

function mapWorkflowRunRow(row: WorkflowRunRow): WorkflowRunV1 {
  // Read workflow_type/workflow_version from the row itself rather than substituting the
  // canonical constants — a schema CHECK constraint prevents writing anything else, but the
  // loader must still faithfully reflect whatever is actually persisted, not paper over it.
  return {
    schemaVersion: "1",
    workflowId: row.workflow_id,
    workflowType: row.workflow_type as WorkflowRunV1["workflowType"],
    workflowVersion: row.workflow_version as WorkflowRunV1["workflowVersion"],
    intentId: row.intent_id,
    intentHash: row.intent_hash,
    projectId: row.project_id,
    state: row.state,
    currentStep: row.current_step,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    resumable: row.resumable === 1,
    ...(row.interruption_json
      ? {
          interruption: parseJson(
            row.interruption_json,
            `workflow run ${row.workflow_id} interruption`,
          ) as WorkflowProblem,
        }
      : {}),
    ...(row.blocked_reason_json
      ? {
          blockedReason: parseJson(
            row.blocked_reason_json,
            `workflow run ${row.workflow_id} blockedReason`,
          ) as WorkflowProblem,
        }
      : {}),
    ...(row.failure_json
      ? {
          failure: parseJson(
            row.failure_json,
            `workflow run ${row.workflow_id} failure`,
          ) as WorkflowProblem,
        }
      : {}),
    ...(row.result_id ? { resultId: row.result_id } : {}),
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    updatedAt: row.updated_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
}

const WORKFLOW_RUN_COLUMNS =
  "workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, current_step, attempt, max_attempts, resumable, interruption_json, blocked_reason_json, failure_json, result_id, created_at, started_at, updated_at, completed_at";

interface WorkflowStepRow {
  workflow_id: string;
  step_name: string;
  ordinal: number;
  state: StepState;
  attempt: number;
  input_hash: string;
  output_json: string | null;
  output_hash: string | null;
  problem_json: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const WORKFLOW_STEP_COLUMNS =
  "workflow_id, step_name, ordinal, state, attempt, input_hash, output_json, output_hash, problem_json, started_at, completed_at";

function mapWorkflowStepRow(row: WorkflowStepRow): WorkflowStepV1 {
  return {
    schemaVersion: "1",
    workflowId: row.workflow_id,
    stepName: row.step_name,
    ordinal: row.ordinal,
    state: row.state,
    attempt: row.attempt,
    inputHash: row.input_hash,
    ...(row.output_json !== null
      ? {
          output: parseJson(
            row.output_json,
            `workflow step ${row.workflow_id}/${row.step_name} output`,
          ),
        }
      : {}),
    ...(row.output_hash ? { outputHash: row.output_hash } : {}),
    ...(row.problem_json
      ? {
          problem: parseJson(
            row.problem_json,
            `workflow step ${row.workflow_id}/${row.step_name} problem`,
          ) as WorkflowProblem,
        }
      : {}),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
}

/**
 * Canonicalizes IntentV1's own `source` field to its fixed, declared shape (channel and the
 * optional operatorLabel audit tag). Guards against an extra property — e.g. a smuggled
 * credential — riding along on the same nested object reference, since `validateIntent` checks
 * `source.channel` but returns the original object rather than reconstructing it.
 */
function toCanonicalSource(
  source: IntentV1["source"],
): Record<string, unknown> {
  return {
    channel: source.channel,
    ...(source.operatorLabel !== undefined
      ? { operatorLabel: source.operatorLabel }
      : {}),
  };
}

/**
 * Canonicalizes a v0.9.4 evidence event's own top-level fields — the shape IntentV1's payload
 * union declares for `event` — guarding the same nested-object-reference risk one level deeper.
 * `event.payload` and `event.mutations` are the pre-existing, intentionally free-form v0.9.4
 * domain contract (not part of IntentV1 itself) and are passed through unchanged.
 */
function toCanonicalEvent(event: ProjectEventInput): Record<string, unknown> {
  return {
    id: event.id,
    baseRevision: event.baseRevision,
    projectId: event.projectId,
    type: event.type,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    sourceIds: event.sourceIds,
    verification: event.verification,
    impactSeedActivityIds: event.impactSeedActivityIds,
    mutations: event.mutations,
    payload: event.payload,
    ...(event.note !== undefined ? { note: event.note } : {}),
    ...(event.causeCode !== undefined ? { causeCode: event.causeCode } : {}),
    ...(event.causeVerification !== undefined
      ? { causeVerification: event.causeVerification }
      : {}),
  };
}

/**
 * Canonicalizes IntentV1's own `payload` discriminated union to its fixed, declared shape,
 * guarding the same nested-object-reference risk as `toCanonicalSource`.
 */
function toCanonicalPayload(
  payload: IntentV1["payload"],
): Record<string, unknown> {
  if (payload.type === "EVIDENCE") {
    return { type: "EVIDENCE", event: toCanonicalEvent(payload.event) };
  }
  return { type: "QUERY" };
}

/**
 * Explicit allow-list of IntentV1's own fields, matching the interface exactly. Guards against
 * hashing/persisting anything beyond it — e.g. an Authorization header or admin key accidentally
 * spread onto the same object reference upstream — regardless of what extra enumerable
 * properties the runtime object might carry beyond its declared type. `source` and `payload` are
 * themselves nested objects that `validateIntent` checks but does not reconstruct, so they are
 * canonicalized recursively rather than passed through by reference.
 */
function toCanonicalIntentRecord(intent: IntentV1): Record<string, unknown> {
  return {
    schemaVersion: intent.schemaVersion,
    intentId: intent.intentId,
    idempotencyKey: intent.idempotencyKey,
    projectId: intent.projectId,
    kind: intent.kind,
    requestedEffect: intent.requestedEffect,
    expectedProjectRevision: intent.expectedProjectRevision,
    submittedAt: intent.submittedAt,
    source: toCanonicalSource(intent.source),
    payload: toCanonicalPayload(intent.payload),
  };
}

export class D1HowlerRepository {
  constructor(private readonly db: D1Database) {}

  async projectExists(projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT project_id FROM projects WHERE project_id = ? LIMIT 1")
      .bind(projectId)
      .first<{ project_id: string }>();
    return Boolean(row?.project_id);
  }

  async createProject(
    model: ProjectModelV094,
    initial: ForecastSnapshotV094,
    oversight: OversightReviewV094,
  ): Promise<void> {
    if (
      model.eventLedger.length > 1 ||
      model.revision !== model.eventLedger.length
    ) {
      throw new Error(
        "Seed project supports zero or one bootstrap evidence event and revision must match the ledger",
      );
    }
    if (
      initial.projectId !== model.projectId ||
      initial.modelRevision !== model.revision
    ) {
      throw new Error("Initial forecast does not match seed project revision");
    }
    if (oversight.candidateSnapshotId !== initial.id) {
      throw new Error(
        "Initial oversight review does not reference the initial forecast",
      );
    }
    const now = initial.generatedAt;
    const baseModel: ProjectModelV094 = {
      ...model,
      revision: 0,
      eventLedger: [],
    };
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO projects (project_id, name, revision, current_model_json, updated_at)
        VALUES (?, ?, 0, ?, ?)`,
        )
        .bind(model.projectId, model.name, JSON.stringify(baseModel), now),
    ];
    const bootstrap = model.eventLedger[0];
    if (bootstrap) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO project_events
        (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            model.projectId,
            bootstrap.id,
            0,
            1,
            bootstrap.type,
            bootstrap.occurredAt,
            bootstrap.receivedAt,
            JSON.stringify(bootstrap),
            JSON.stringify(model),
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO forecast_snapshots
        (snapshot_id, project_id, model_revision, version, status, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          initial.id,
          initial.projectId,
          initial.modelRevision,
          initial.version,
          initial.status,
          JSON.stringify(initial),
          initial.generatedAt,
        ),
      this.db
        .prepare(
          `INSERT INTO oversight_reviews
        (review_id, project_id, candidate_snapshot_id, decision, review_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          oversight.id,
          oversight.projectId,
          oversight.candidateSnapshotId,
          oversight.decision,
          JSON.stringify(oversight),
          oversight.createdAt,
        ),
    );
    await this.db.batch(statements);
  }

  async loadProject(projectId: string): Promise<ProjectModelV094 | undefined> {
    const row = await this.db
      .prepare(
        "SELECT project_id, revision, current_model_json FROM projects WHERE project_id = ? LIMIT 1",
      )
      .bind(projectId)
      .first<{
        project_id: string;
        revision: number;
        current_model_json: string;
      }>();
    if (!row) return undefined;
    const model = parseJson(
      row.current_model_json,
      `project ${projectId}`,
    ) as ProjectModelV094;
    if (model.revision !== row.revision)
      throw new Error(`Persisted project ${projectId} revision mismatch`);
    return model;
  }

  async loadLatestPublishedForecast(
    projectId: string,
  ): Promise<ForecastSnapshotV094 | undefined> {
    const row = await this.db
      .prepare(
        `SELECT snapshot_json AS json FROM forecast_snapshots
      WHERE project_id = ? AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1`,
      )
      .bind(projectId)
      .first<{ json: string }>();
    return row
      ? (parseJson(
          row.json,
          `published forecast ${projectId}`,
        ) as ForecastSnapshotV094)
      : undefined;
  }

  async loadLatestForecast(
    projectId: string,
  ): Promise<ForecastSnapshotV094 | undefined> {
    const row = await this.db
      .prepare(
        `SELECT snapshot_json AS json FROM forecast_snapshots
      WHERE project_id = ? ORDER BY version DESC LIMIT 1`,
      )
      .bind(projectId)
      .first<{ json: string }>();
    return row
      ? (parseJson(row.json, `forecast ${projectId}`) as ForecastSnapshotV094)
      : undefined;
  }

  async loadForecastById(
    projectId: string,
    snapshotId: string,
  ): Promise<ForecastSnapshotV094 | undefined> {
    const row = await this.db
      .prepare(
        `SELECT snapshot_json AS json FROM forecast_snapshots
      WHERE project_id = ? AND snapshot_id = ? LIMIT 1`,
      )
      .bind(projectId, snapshotId)
      .first<{ json: string }>();
    return row
      ? (parseJson(row.json, `forecast ${snapshotId}`) as ForecastSnapshotV094)
      : undefined;
  }

  async loadEvents(
    projectId: string,
    limit = 100,
  ): Promise<ProjectEventV094[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const result = await this.db
      .prepare(
        `SELECT event_json AS json FROM project_events
      WHERE project_id = ? ORDER BY new_revision DESC LIMIT ?`,
      )
      .bind(projectId, safeLimit)
      .all<{ json: string }>();
    return result.results
      .map((r) => parseJson(r.json, `event ${projectId}`) as ProjectEventV094)
      .reverse();
  }

  async loadLearningRecords(
    subjectKey?: string,
  ): Promise<LearningRecordV094[]> {
    const stmt = subjectKey
      ? this.db
          .prepare(
            "SELECT record_json AS json FROM learning_records WHERE subject_key = ? ORDER BY updated_at DESC",
          )
          .bind(subjectKey)
      : this.db.prepare(
          "SELECT record_json AS json FROM learning_records ORDER BY updated_at DESC LIMIT 250",
        );
    const result = await stmt.all<{ json: string }>();
    return result.results.map(
      (r) => parseJson(r.json, "learning record") as LearningRecordV094,
    );
  }

  async commitForecastTransition(
    transition: ForecastTransitionV094,
  ): Promise<void> {
    const {
      expectedRevision,
      modelAfterEvent,
      event,
      candidate,
      oversight,
      published,
    } = transition;
    if (published.status !== "PUBLISHED")
      throw new Error("Production transition requires a published snapshot");
    if (modelAfterEvent.revision !== expectedRevision + 1)
      throw new Error("Transition revision increment is invalid");
    if (event.baseRevision !== expectedRevision)
      throw new Error("Event baseRevision does not match expectedRevision");
    if (
      candidate.id !== published.id ||
      candidate.version !== published.version
    ) {
      throw new Error(
        "Published snapshot must be the reviewed candidate version",
      );
    }
    if (oversight.candidateSnapshotId !== candidate.id)
      throw new Error("Oversight review does not reference candidate snapshot");
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO project_events
        (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          event.projectId,
          event.id,
          event.baseRevision,
          modelAfterEvent.revision,
          event.type,
          event.occurredAt,
          event.receivedAt,
          JSON.stringify(event),
          JSON.stringify(modelAfterEvent),
        ),
      this.db
        .prepare(
          `INSERT INTO forecast_snapshots
        (snapshot_id, project_id, model_revision, version, status, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?)`,
        )
        .bind(
          published.id,
          published.projectId,
          published.modelRevision,
          published.version,
          JSON.stringify(published),
          published.generatedAt,
        ),
      this.db
        .prepare(
          `INSERT INTO oversight_reviews
        (review_id, project_id, candidate_snapshot_id, decision, review_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          oversight.id,
          oversight.projectId,
          oversight.candidateSnapshotId,
          oversight.decision,
          JSON.stringify(oversight),
          oversight.createdAt,
        ),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("HOWLER_REVISION_CONFLICT") ||
        message.includes(
          "UNIQUE constraint failed: project_events.project_id, project_events.new_revision",
        )
      ) {
        throw new RevisionConflictError(
          `Project ${event.projectId} changed before this update could publish`,
        );
      }
      throw error;
    }
  }

  async commitShadowTransition(
    transition: ShadowTransitionV094,
  ): Promise<void> {
    const { expectedRevision, modelAfterEvent, event, candidate, oversight } =
      transition;
    if (candidate.status === "PUBLISHED")
      throw new Error(
        "Shadow transition requires a non-published forecast candidate",
      );
    if (modelAfterEvent.revision !== expectedRevision + 1)
      throw new Error("Shadow transition revision increment is invalid");
    if (event.baseRevision !== expectedRevision)
      throw new Error(
        "Shadow event baseRevision does not match expectedRevision",
      );
    if (candidate.modelRevision !== modelAfterEvent.revision) {
      throw new Error(
        "Shadow candidate modelRevision does not match event-applied project revision",
      );
    }
    if (oversight.candidateSnapshotId !== candidate.id)
      throw new Error(
        "Shadow oversight review does not reference candidate snapshot",
      );
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO project_events
        (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          event.projectId,
          event.id,
          event.baseRevision,
          modelAfterEvent.revision,
          event.type,
          event.occurredAt,
          event.receivedAt,
          JSON.stringify(event),
          JSON.stringify(modelAfterEvent),
        ),
      this.db
        .prepare(
          `INSERT INTO forecast_snapshots
        (snapshot_id, project_id, model_revision, version, status, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          candidate.id,
          candidate.projectId,
          candidate.modelRevision,
          candidate.version,
          candidate.status,
          JSON.stringify(candidate),
          candidate.generatedAt,
        ),
      this.db
        .prepare(
          `INSERT INTO oversight_reviews
        (review_id, project_id, candidate_snapshot_id, decision, review_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          oversight.id,
          oversight.projectId,
          oversight.candidateSnapshotId,
          oversight.decision,
          JSON.stringify(oversight),
          oversight.createdAt,
        ),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("HOWLER_REVISION_CONFLICT") ||
        message.includes(
          "UNIQUE constraint failed: project_events.project_id, project_events.new_revision",
        )
      ) {
        throw new RevisionConflictError(
          `Project ${event.projectId} changed before this shadow update could be applied`,
        );
      }
      throw error;
    }
  }

  async saveLearningRecord(record: LearningRecordV094): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO learning_records
      (learning_id, layer, subject_key, hypothesis_type, record_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(learning_id) DO UPDATE SET
        layer = excluded.layer,
        subject_key = excluded.subject_key,
        hypothesis_type = excluded.hypothesis_type,
        record_json = excluded.record_json,
        updated_at = excluded.updated_at`,
      )
      .bind(
        record.id,
        record.layer,
        record.subjectKey,
        record.hypothesisType,
        JSON.stringify(record),
        record.lastObservedAt,
      )
      .run();
  }

  async savePredictionOutcome(outcome: PredictionOutcomeV094): Promise<void> {
    const snapshotRow = await this.db
      .prepare(
        "SELECT project_id FROM forecast_snapshots WHERE snapshot_id = ? LIMIT 1",
      )
      .bind(outcome.sourceSnapshotId)
      .first<{ project_id: string }>();
    if (!snapshotRow)
      throw new Error(`Unknown source snapshot ${outcome.sourceSnapshotId}`);
    await this.db
      .prepare(
        `INSERT INTO prediction_outcomes
      (prediction_id, project_id, activity_id, source_snapshot_id, horizon_days, point_error_workdays, range_hit, confidence, outcome_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        outcome.predictionId,
        snapshotRow.project_id,
        outcome.activityId,
        outcome.sourceSnapshotId,
        outcome.horizonDays,
        outcome.pointErrorWorkdays,
        outcome.rangeHit ? 1 : 0,
        outcome.confidenceAtPrediction,
        JSON.stringify(outcome),
        new Date().toISOString(),
      )
      .run();
  }

  async loadPredictionOutcomes(
    projectId?: string,
  ): Promise<PredictionOutcomeV094[]> {
    const stmt = projectId
      ? this.db
          .prepare(
            "SELECT outcome_json AS json FROM prediction_outcomes WHERE project_id = ? ORDER BY created_at DESC",
          )
          .bind(projectId)
      : this.db.prepare(
          "SELECT outcome_json AS json FROM prediction_outcomes ORDER BY created_at DESC LIMIT 1000",
        );
    const result = await stmt.all<{ json: string }>();
    return result.results.map(
      (r) => parseJson(r.json, "prediction outcome") as PredictionOutcomeV094,
    );
  }

  /**
   * Idempotent intent claim (design §10.1): a new (projectId, idempotencyKey) inserts both the
   * immutable intent row and its one-to-one workflow run atomically. A conflicting intentId or
   * (projectId, idempotencyKey) with the *same* request hash replays the existing run rather than
   * executing again; a conflict with a *different* hash reports which uniqueness rule reused.
   * Never receives or persists the admin key, an Authorization header, or any other credential —
   * only the explicit allow-listed IntentV1 fields are ever hashed or written.
   */
  async claimIntent(input: ClaimIntentInput): Promise<ClaimIntentResult> {
    const canonicalIntent = toCanonicalIntentRecord(input.intent);
    const canonicalRequestJson = stableStringify(canonicalIntent);
    const requestHash = await sha256Hex(canonicalIntent);
    const { intentId, projectId, idempotencyKey, kind } = input.intent;

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO operator_intents
        (intent_id, project_id, idempotency_key, kind, request_json, request_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          intentId,
          projectId,
          idempotencyKey,
          kind,
          canonicalRequestJson,
          requestHash,
          input.now,
        ),
      this.db
        .prepare(
          `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, current_step, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'OPERATOR_INTENT_V1', 1, 'RECEIVED', NULL, 1, ?, 0, ?, ?)`,
        )
        .bind(
          input.workflowId,
          intentId,
          requestHash,
          projectId,
          input.maxAttempts,
          input.now,
          input.now,
        ),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      return this.resolveClaimConflict(
        intentId,
        projectId,
        idempotencyKey,
        requestHash,
        error,
      );
    }
    const run = await this.loadWorkflowRunByIntentId(intentId);
    if (!run) {
      throw new Error(
        `Claimed intent ${intentId} but its workflow run was not found`,
      );
    }
    return { outcome: "CLAIMED", run };
  }

  /**
   * Resolves an INSERT failure by independently querying *both* identity dimensions — never by
   * parsing which specific constraint the D1 error text names, since the message alone cannot
   * distinguish an ordinary retry from a split-identity collision. Replays only when both
   * dimensions consistently resolve to the same existing intent; a genuine disagreement between
   * them fails closed, and a resolved intent with no corresponding run is treated as corruption,
   * never as ordinary reuse.
   */
  private async resolveClaimConflict(
    intentId: string,
    projectId: string,
    idempotencyKey: string,
    requestHash: string,
    originalError: unknown,
  ): Promise<ClaimIntentResult> {
    const byIntentId = await this.loadIntentSummary("intent_id", intentId);
    const byIdempotencyKey = await this.loadIntentSummaryByIdempotencyKey(
      projectId,
      idempotencyKey,
    );

    if (!byIntentId && !byIdempotencyKey) {
      // Neither identity dimension actually collided in the database — the batch failure must be
      // something else entirely, so surface it rather than misclassifying it as reuse.
      throw originalError;
    }

    if (
      byIntentId &&
      byIdempotencyKey &&
      byIntentId.intentId !== byIdempotencyKey.intentId
    ) {
      throw new Error(
        `Split-identity collision: intentId ${intentId} and (projectId, idempotencyKey) resolve to two different existing intents (${byIntentId.intentId} vs ${byIdempotencyKey.intentId})`,
      );
    }

    const resolved = byIntentId ?? byIdempotencyKey;
    if (!resolved) throw originalError;

    if (resolved.requestHash !== requestHash) {
      return byIntentId
        ? { outcome: "INTENT_ID_REUSE" }
        : { outcome: "IDEMPOTENCY_KEY_REUSE" };
    }
    const run = await this.loadWorkflowRunByIntentId(resolved.intentId);
    if (!run) {
      throw new Error(
        `Corruption: intent ${resolved.intentId} exists but has no workflow run`,
      );
    }
    return { outcome: "REPLAY", run };
  }

  private async loadIntentSummary(
    column: "intent_id",
    value: string,
  ): Promise<{ intentId: string; requestHash: string } | undefined> {
    const row = await this.db
      .prepare(
        `SELECT intent_id, request_hash FROM operator_intents WHERE ${column} = ? LIMIT 1`,
      )
      .bind(value)
      .first<{ intent_id: string; request_hash: string }>();
    return row
      ? { intentId: row.intent_id, requestHash: row.request_hash }
      : undefined;
  }

  private async loadIntentSummaryByIdempotencyKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<{ intentId: string; requestHash: string } | undefined> {
    const row = await this.db
      .prepare(
        `SELECT intent_id, request_hash FROM operator_intents
        WHERE project_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(projectId, idempotencyKey)
      .first<{ intent_id: string; request_hash: string }>();
    return row
      ? { intentId: row.intent_id, requestHash: row.request_hash }
      : undefined;
  }

  async loadWorkflowRun(
    workflowId: string,
  ): Promise<WorkflowRunV1 | undefined> {
    const row = await this.db
      .prepare(
        `SELECT ${WORKFLOW_RUN_COLUMNS} FROM workflow_runs WHERE workflow_id = ? LIMIT 1`,
      )
      .bind(workflowId)
      .first<WorkflowRunRow>();
    return row ? mapWorkflowRunRow(row) : undefined;
  }

  async loadWorkflowRunByIntentId(
    intentId: string,
  ): Promise<WorkflowRunV1 | undefined> {
    const row = await this.db
      .prepare(
        `SELECT ${WORKFLOW_RUN_COLUMNS} FROM workflow_runs WHERE intent_id = ? LIMIT 1`,
      )
      .bind(intentId)
      .first<WorkflowRunRow>();
    return row ? mapWorkflowRunRow(row) : undefined;
  }

  /**
   * Guarded (optimistic) run-state update for *non-terminal* transitions only (RECEIVED ->
   * VALIDATING -> READY -> RUNNING, RUNNING -> INTERRUPTED, INTERRUPTED -> RUNNING). Rejects any
   * transition outside Task 11's canonical state matrix (`isValidTransition`) and any resulting
   * shape that would violate Task 11's terminal/interruption invariants
   * (`validateTerminalInvariants`) *before* issuing SQL — reusing that logic rather than
   * duplicating a second, potentially-conflicting state graph here. A terminal target state
   * (SUCCEEDED/BLOCKED/FAILED) must go through `finalizeWorkflowRun` instead, since only that
   * method can atomically attach the one required result. The WHERE clause still requires the row
   * to still be in `expectedState` for true DB-level optimistic concurrency; returns whether that
   * guard held (a row actually changed).
   */
  async updateWorkflowRunState(
    input: UpdateWorkflowRunStateInput,
  ): Promise<boolean> {
    if (
      input.nextState === "SUCCEEDED" ||
      input.nextState === "BLOCKED" ||
      input.nextState === "FAILED"
    ) {
      throw new Error(
        `updateWorkflowRunState cannot target terminal state ${input.nextState}; use finalizeWorkflowRun`,
      );
    }
    if (!isValidTransition(input.expectedState, input.nextState)) {
      throw new Error(
        `Invalid workflow state transition: ${input.expectedState} -> ${input.nextState}`,
      );
    }
    const current = await this.loadWorkflowRun(input.workflowId);
    if (!current) {
      throw new Error(`Cannot update unknown workflow run ${input.workflowId}`);
    }
    if (current.state !== input.expectedState) return false;

    const prospective: WorkflowRunV1 = {
      ...current,
      state: input.nextState,
      ...(input.currentStep !== undefined
        ? { currentStep: input.currentStep }
        : {}),
      ...(input.interruption ? { interruption: input.interruption } : {}),
      ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
      ...(input.failure ? { failure: input.failure } : {}),
      ...(input.resultId ? { resultId: input.resultId } : {}),
    };
    const violations = validateTerminalInvariants(prospective);
    if (violations.length > 0) {
      throw new Error(
        `Invalid workflow run state update: ${violations.map((v) => v.message).join("; ")}`,
      );
    }

    const result = await this.db
      .prepare(
        `UPDATE workflow_runs
        SET state = ?,
            current_step = ?,
            interruption_json = ?,
            blocked_reason_json = ?,
            failure_json = ?,
            resumable = ?,
            attempt = attempt + ?,
            started_at = CASE WHEN ? THEN COALESCE(started_at, ?) ELSE started_at END,
            updated_at = ?
        WHERE workflow_id = ? AND state = ?`,
      )
      .bind(
        input.nextState,
        input.currentStep ?? null,
        input.interruption ? JSON.stringify(input.interruption) : null,
        input.blockedReason ? JSON.stringify(input.blockedReason) : null,
        input.failure ? JSON.stringify(input.failure) : null,
        input.resumable ? 1 : 0,
        input.incrementAttempt ? 1 : 0,
        input.markStarted ? 1 : 0,
        input.now,
        input.now,
        input.workflowId,
        input.expectedState,
      )
      .run();
    return result.meta.changes > 0;
  }

  /**
   * Atomically finalizes a workflow run: inserts the one immutable result row and performs the
   * allowed terminal transition (RUNNING -> SUCCEEDED|BLOCKED|FAILED, or retry-exhaustion
   * INTERRUPTED -> FAILED) in a single D1 batch, so neither can happen without the other. The
   * run's state is updated *before* the result insert within the same batch so the schema's own
   * `workflow_results_identity_guard` trigger — which compares the result's identity/status
   * against the run's row — observes the already-terminal state, not the pre-transition one.
   * Returns false (no SQL executed) if the run is no longer in `expectedState`.
   */
  async finalizeWorkflowRun(input: FinalizeWorkflowRunInput): Promise<boolean> {
    if (!isValidTransition(input.expectedState, input.terminalState)) {
      throw new Error(
        `Invalid terminal transition: ${input.expectedState} -> ${input.terminalState}`,
      );
    }
    if (input.result.status !== input.terminalState) {
      throw new Error(
        `Result status ${input.result.status} does not match terminal state ${input.terminalState}`,
      );
    }
    if (input.result.workflowId !== input.workflowId) {
      throw new Error(
        "Result workflowId does not match the workflow being finalized",
      );
    }
    const current = await this.loadWorkflowRun(input.workflowId);
    if (!current) {
      throw new Error(
        `Cannot finalize unknown workflow run ${input.workflowId}`,
      );
    }
    if (current.intentId !== input.result.intentId) {
      throw new Error("Result intentId does not match the workflow's intentId");
    }
    if (current.projectId !== input.result.projectId) {
      throw new Error(
        "Result projectId does not match the workflow's projectId",
      );
    }
    if (current.state !== input.expectedState) return false;

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE workflow_runs
          SET state = ?, result_id = ?, updated_at = ?, completed_at = ?
          WHERE workflow_id = ? AND state = ?`,
        )
        .bind(
          input.terminalState,
          input.result.resultId,
          input.now,
          input.now,
          input.workflowId,
          input.expectedState,
        ),
      this.db
        .prepare(
          `INSERT INTO workflow_results
          (result_id, workflow_id, intent_id, project_id, status, result_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.result.resultId,
          input.result.workflowId,
          input.result.intentId,
          input.result.projectId,
          input.result.status,
          JSON.stringify(input.result),
          input.result.createdAt,
        ),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      // The guard's own WHERE clause not matching (a concurrent finalize already ran) surfaces as
      // a workflow_results UNIQUE/identity failure once the UPDATE silently affects zero rows and
      // a competing finalize has already moved the run to a terminal state — re-check the run's
      // actual state rather than guess from the error text. A state that has moved away from
      // expectedState means someone else won the race; a state that is still expectedState means
      // this failure is unexplained by a race and must not be swallowed.
      const stillCurrent = await this.loadWorkflowRun(input.workflowId);
      if (stillCurrent && stillCurrent.state !== input.expectedState) {
        return false;
      }
      throw error;
    }
    return true;
  }

  /** Loads one immutable canonical result (design §9's "load immutable results" primitive). */
  async loadWorkflowResult(resultId: string): Promise<ResultV1 | undefined> {
    const row = await this.db
      .prepare(
        "SELECT result_json FROM workflow_results WHERE result_id = ? LIMIT 1",
      )
      .bind(resultId)
      .first<{ result_json: string }>();
    return row
      ? (parseJson(row.result_json, `workflow result ${resultId}`) as ResultV1)
      : undefined;
  }

  async loadWorkflowStep(
    workflowId: string,
    stepName: WorkflowStepName,
  ): Promise<WorkflowStepV1 | undefined> {
    const row = await this.db
      .prepare(
        `SELECT ${WORKFLOW_STEP_COLUMNS} FROM workflow_steps WHERE workflow_id = ? AND step_name = ? LIMIT 1`,
      )
      .bind(workflowId, stepName)
      .first<WorkflowStepRow>();
    return row ? mapWorkflowStepRow(row) : undefined;
  }

  async loadWorkflowSteps(workflowId: string): Promise<WorkflowStepV1[]> {
    const result = await this.db
      .prepare(
        `SELECT ${WORKFLOW_STEP_COLUMNS} FROM workflow_steps WHERE workflow_id = ? ORDER BY ordinal ASC`,
      )
      .bind(workflowId)
      .all<WorkflowStepRow>();
    return result.results.map(mapWorkflowStepRow);
  }

  /**
   * Idempotently ensures a step row exists as PENDING (insert-if-absent), then returns whatever is
   * actually persisted. Verifies a pre-existing row's ordinal/inputHash still match what this call
   * expects — either drifting between attempts of the same intent is an invariant violation
   * ("verify ordinal/input-hash definitions on reuse"), not a normal resumability case.
   */
  async ensureWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    ordinal: number;
    inputHash: string;
  }): Promise<WorkflowStepV1> {
    await this.db
      .prepare(
        `INSERT INTO workflow_steps
        (workflow_id, step_name, ordinal, state, attempt, input_hash, started_at, completed_at)
        VALUES (?, ?, ?, 'PENDING', 1, ?, NULL, NULL)
        ON CONFLICT(workflow_id, step_name) DO NOTHING`,
      )
      .bind(input.workflowId, input.stepName, input.ordinal, input.inputHash)
      .run();
    const row = await this.loadWorkflowStep(input.workflowId, input.stepName);
    if (!row) {
      throw new Error(
        `Failed to ensure workflow step ${input.workflowId}/${input.stepName}`,
      );
    }
    if (row.ordinal !== input.ordinal) {
      throw new Error(
        `Workflow step ${input.workflowId}/${input.stepName} ordinal changed between attempts: persisted ${String(row.ordinal)}, expected ${String(input.ordinal)}`,
      );
    }
    if (row.inputHash !== input.inputHash) {
      throw new Error(
        `Workflow step ${input.workflowId}/${input.stepName} input hash changed between attempts — replay is unsafe`,
      );
    }
    return row;
  }

  async startWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE workflow_steps
        SET state = 'RUNNING', started_at = COALESCE(started_at, ?)
        WHERE workflow_id = ? AND step_name = ?`,
      )
      .bind(input.now, input.workflowId, input.stepName)
      .run();
  }

  async completeWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    output: unknown;
    outputHash: string;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE workflow_steps
        SET state = 'SUCCEEDED', output_json = ?, output_hash = ?, completed_at = ?
        WHERE workflow_id = ? AND step_name = ?`,
      )
      .bind(
        JSON.stringify(input.output ?? null),
        input.outputHash,
        input.now,
        input.workflowId,
        input.stepName,
      )
      .run();
  }

  /** Idempotently persists a conditional step as SKIPPED — never simply omitted. */
  async skipWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    ordinal: number;
    inputHash: string;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO workflow_steps
        (workflow_id, step_name, ordinal, state, attempt, input_hash, started_at, completed_at)
        VALUES (?, ?, ?, 'SKIPPED', 1, ?, ?, ?)
        ON CONFLICT(workflow_id, step_name) DO NOTHING`,
      )
      .bind(
        input.workflowId,
        input.stepName,
        input.ordinal,
        input.inputHash,
        input.now,
        input.now,
      )
      .run();
  }

  async failWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    state: "BLOCKED" | "FAILED";
    problem: WorkflowProblem;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE workflow_steps
        SET state = ?, problem_json = ?, completed_at = ?
        WHERE workflow_id = ? AND step_name = ?`,
      )
      .bind(
        input.state,
        JSON.stringify(input.problem),
        input.now,
        input.workflowId,
        input.stepName,
      )
      .run();
  }
}
