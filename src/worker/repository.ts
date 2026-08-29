import { RevisionConflictError } from "../engine/storage";
import type { ProjectEventV094, ProjectModelV094 } from "../domain/types";
import type { ForecastSnapshotV094 } from "../engine/solver";
import type { OversightReviewV094 } from "../engine/oversight";
import type {
  LearningRecordV094,
  PredictionOutcomeV094,
} from "../engine/learning";

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
}
