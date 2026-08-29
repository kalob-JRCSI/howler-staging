/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
  introspectSchemaObjects,
  parseFixtureStatements,
  tableColumns,
} from "../helpers/d1";
import { createDeboardSeed } from "../../src/worker/deboard-seed";
import { forecastInitial } from "../../src/engine/engine";
import { D1HowlerRepository } from "../../src/worker/repository";

// Local loader for the operator migration file, mirroring test/helpers/d1.ts's own
// baselineMigrationSql() pattern without adding a new export there (not in Task 12's file list).
const operatorMigrationSources = import.meta.glob<string>(
  "../../migrations/*.sql",
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
);

function operatorMigrationSql(): string {
  const entry = Object.entries(operatorMigrationSources).find(([modulePath]) =>
    modulePath.endsWith("/0002_operator_runs.sql"),
  );
  if (!entry) throw new Error("missing migration 0002_operator_runs.sql");
  return entry[1];
}

const GENERATED_AT = "2026-08-27T12:00:00.000Z";

const OPERATOR_OBJECT_NAMES = [
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
];

describe("migration 0002_operator_runs applied to an empty database (after 0001)", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
  });

  it("creates exactly the operator objects recorded in the migration file — full bidirectional parity, no extras, no omissions", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const live = await introspectSchemaObjects(env.HOWLER_DB);
    const liveOperator = live.filter((o) =>
      OPERATOR_OBJECT_NAMES.includes(o.name),
    );
    const expectedOperatorStatements = parseFixtureStatements(
      operatorMigrationSql(),
    );

    expect(liveOperator).toHaveLength(expectedOperatorStatements.length);
    expect(liveOperator).toHaveLength(OPERATOR_OBJECT_NAMES.length);
    expect(new Set(liveOperator.map((o) => o.sql))).toEqual(
      new Set(expectedOperatorStatements),
    );

    // The six pre-existing v0.9.4 objects are untouched by the same introspection.
    const expected0001Statements = parseFixtureStatements(
      baselineMigrationSql(),
    );
    for (const expectedSql of expected0001Statements) {
      expect(live.map((o) => o.sql)).toContain(expectedSql);
    }
  });

  it("matches the exact table/trigger/index counts once both migrations are applied", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const live = await introspectSchemaObjects(env.HOWLER_DB);
    expect(live.filter((o) => o.type === "table")).toHaveLength(6 + 4);
    expect(live.filter((o) => o.type === "trigger")).toHaveLength(10 + 5);
    expect(
      live.filter((o) => o.type === "index" && o.name.startsWith("idx_")),
    ).toHaveLength(3 + 1);
  });

  it("matches the exact column set for operator_intents", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const columns = await tableColumns(env.HOWLER_DB, "operator_intents");
    expect(columns.map((c) => c.name)).toEqual([
      "intent_id",
      "project_id",
      "idempotency_key",
      "kind",
      "request_json",
      "request_hash",
      "created_at",
    ]);
  });

  it("matches the exact column set for workflow_runs", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const columns = await tableColumns(env.HOWLER_DB, "workflow_runs");
    expect(columns.map((c) => c.name)).toEqual([
      "workflow_id",
      "intent_id",
      "intent_hash",
      "project_id",
      "workflow_type",
      "workflow_version",
      "state",
      "current_step",
      "attempt",
      "max_attempts",
      "resumable",
      "interruption_json",
      "blocked_reason_json",
      "failure_json",
      "result_id",
      "created_at",
      "started_at",
      "updated_at",
      "completed_at",
    ]);
  });

  it("matches the exact column set for workflow_steps", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const columns = await tableColumns(env.HOWLER_DB, "workflow_steps");
    expect(columns.map((c) => c.name)).toEqual([
      "workflow_id",
      "step_name",
      "ordinal",
      "state",
      "attempt",
      "input_hash",
      "output_json",
      "output_hash",
      "problem_json",
      "started_at",
      "completed_at",
    ]);
  });

  it("matches the exact column set for workflow_results", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const columns = await tableColumns(env.HOWLER_DB, "workflow_results");
    expect(columns.map((c) => c.name)).toEqual([
      "result_id",
      "workflow_id",
      "intent_id",
      "project_id",
      "status",
      "result_json",
      "created_at",
    ]);
  });
});

describe("migration 0002 applied to a populated frozen v0.9.4 database (all six legacy tables)", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
  });

  async function populateAllLegacyTables(
    repo: D1HowlerRepository,
  ): Promise<void> {
    // projects, project_events, forecast_snapshots, oversight_reviews (via createProject).
    const model = createDeboardSeed();
    const initial = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, initial.candidate, initial.oversight);

    // learning_records.
    await repo.saveLearningRecord({
      id: "rec-1",
      layer: "PROJECT",
      hypothesisType: "OUTCOME",
      subjectKey: "subject-1",
      hypothesis: "test hypothesis",
      evidenceEventIds: [],
      evidenceProjectIds: [],
      observationCount: 1,
      verifiedOutcomeCount: 1,
      contradictingOutcomeCount: 0,
      confidence: 0.6,
      stage: "OBSERVATION",
      lastObservedAt: GENERATED_AT,
    });

    // prediction_outcomes (references the seeded forecast snapshot).
    await repo.savePredictionOutcome({
      predictionId: "pred-1",
      activityId: "masonry",
      horizonDays: 3,
      predicted: {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      actual: "2026-08-26",
      pointErrorWorkdays: 0,
      rangeHit: true,
      confidenceAtPrediction: 0.7,
      sourceSnapshotId: initial.candidate.id,
    });
  }

  it("preserves all historical rows/data across every legacy table, byte-for-byte, after applying the additive operator migration", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await populateAllLegacyTables(repo);

    const before = {
      project: await repo.loadProject("deboard-v091"),
      forecast: await repo.loadLatestForecast("deboard-v091"),
      events: await repo.loadEvents("deboard-v091"),
      learning: await repo.loadLearningRecords(),
      outcomes: await repo.loadPredictionOutcomes("deboard-v091"),
    };

    await applySchema(env.HOWLER_DB, operatorMigrationSql());

    const after = {
      project: await repo.loadProject("deboard-v091"),
      forecast: await repo.loadLatestForecast("deboard-v091"),
      events: await repo.loadEvents("deboard-v091"),
      learning: await repo.loadLearningRecords(),
      outcomes: await repo.loadPredictionOutcomes("deboard-v091"),
    };

    expect(after.project).toEqual(before.project);
    expect(after.forecast).toEqual(before.forecast);
    expect(after.events).toEqual(before.events);
    expect(after.learning).toEqual(before.learning);
    expect(after.outcomes).toEqual(before.outcomes);
    expect(after.project?.revision).toBe(before.project?.revision);
  });

  it("preserves the exact historical schema definitions (tables/triggers/indexes) for every legacy object", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await populateAllLegacyTables(repo);
    const before = await introspectSchemaObjects(env.HOWLER_DB);

    await applySchema(env.HOWLER_DB, operatorMigrationSql());

    const after = await introspectSchemaObjects(env.HOWLER_DB);
    const beforeByName = new Map(before.map((o) => [o.name, o.sql]));
    for (const [name, sql] of beforeByName) {
      const match = after.find((o) => o.name === name);
      expect(match?.sql, `schema object ${name}`).toBe(sql);
    }
  });

  it("passes PRAGMA foreign_key_check after the additive migration", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await populateAllLegacyTables(repo);
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const violations = await env.HOWLER_DB.prepare(
      "PRAGMA foreign_key_check",
    ).all();
    expect(violations.results).toEqual([]);
  });

  it("keeps existing append-only guards on the original six tables fully intact", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await populateAllLegacyTables(repo);
    await applySchema(env.HOWLER_DB, operatorMigrationSql());

    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE forecast_snapshots SET status = 'PUBLISHED' WHERE project_id = 'deboard-v091'",
      ).run(),
    ).rejects.toThrow("forecast_snapshots is append-only");
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM project_events WHERE project_id = 'deboard-v091'",
      ).run(),
    ).rejects.toThrow("project_events is append-only");
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE prediction_outcomes SET range_hit = 0 WHERE prediction_id = 'pred-1'",
      ).run(),
    ).rejects.toThrow("prediction_outcomes is append-only");
  });

  it("keeps the existing revision-guard trigger semantics unchanged", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await populateAllLegacyTables(repo);
    await applySchema(env.HOWLER_DB, operatorMigrationSql());

    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO project_events
        (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
        VALUES ('deboard-v091', 'stale-event', 0, 2, 'FIELD_UPDATE', ?, ?, '{}', '{}')`,
      )
        .bind(GENERATED_AT, GENERATED_AT)
        .run(),
    ).rejects.toThrow("HOWLER_REVISION_CONFLICT");
  });

  it("reapplying 0002 (idempotent CREATE ... IF NOT EXISTS) does not duplicate or alter the operator schema, with historical data already present", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await populateAllLegacyTables(repo);
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const first = await introspectSchemaObjects(env.HOWLER_DB);
    const beforeProject = await repo.loadProject("deboard-v091");

    await applySchema(env.HOWLER_DB, operatorMigrationSql());

    const second = await introspectSchemaObjects(env.HOWLER_DB);
    expect(second).toEqual(first);
    expect(await repo.loadProject("deboard-v091")).toEqual(beforeProject);
  });
});
