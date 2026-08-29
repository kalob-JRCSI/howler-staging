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

describe("migration 0002_operator_runs applied to an empty database (after 0001)", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
  });

  it("creates exactly the operator tables/triggers/indexes recorded in the migration file, additive to the existing six v0.9.4 tables", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const live = await introspectSchemaObjects(env.HOWLER_DB);

    const expectedOperatorStatements = parseFixtureStatements(
      operatorMigrationSql(),
    );
    for (const expectedSql of expectedOperatorStatements) {
      expect(live.map((o) => o.sql)).toContain(expectedSql);
    }
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
    expect(live.filter((o) => o.type === "trigger")).toHaveLength(10 + 4);
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

describe("migration 0002 applied to a populated frozen v0.9.4 database", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
  });

  it("preserves all existing v0.9.4 data byte-for-byte after applying the additive operator migration", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = createDeboardSeed();
    const initial = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, initial.candidate, initial.oversight);

    const beforeProject = await repo.loadProject("deboard-v091");
    const beforeForecast = await repo.loadLatestForecast("deboard-v091");
    const beforeEvents = await repo.loadEvents("deboard-v091");

    await applySchema(env.HOWLER_DB, operatorMigrationSql());

    const afterProject = await repo.loadProject("deboard-v091");
    const afterForecast = await repo.loadLatestForecast("deboard-v091");
    const afterEvents = await repo.loadEvents("deboard-v091");
    expect(afterProject).toEqual(beforeProject);
    expect(afterForecast).toEqual(beforeForecast);
    expect(afterEvents).toEqual(beforeEvents);
  });

  it("keeps existing append-only guards on the original six tables fully intact", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = createDeboardSeed();
    const initial = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, initial.candidate, initial.oversight);
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
  });

  it("keeps the existing revision-guard trigger semantics unchanged", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = createDeboardSeed();
    const initial = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, initial.candidate, initial.oversight);
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

  it("reapplying 0002 (idempotent CREATE ... IF NOT EXISTS) does not duplicate or alter the operator schema", async () => {
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const first = await introspectSchemaObjects(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, operatorMigrationSql());
    const second = await introspectSchemaObjects(env.HOWLER_DB);
    expect(second).toEqual(first);
  });
});
