import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
  frozenSchemaSql,
  introspectSchemaObjects,
  parseFixtureStatements,
  tableColumns,
} from "../helpers/d1";

describe("migration 0001_v094_baseline applied to an empty database", () => {
  it("creates exactly the tables, triggers, and indexes recorded in the frozen v0.9.4 schema fixture", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());

    const live = await introspectSchemaObjects(env.HOWLER_DB);
    const expectedStatements = parseFixtureStatements(frozenSchemaSql());

    expect(live).toHaveLength(expectedStatements.length);
    for (const expectedSql of expectedStatements) {
      expect(live.map((object) => object.sql)).toContain(expectedSql);
    }
  });

  it("matches the exact table count, trigger count, and index count from the fixture", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const live = await introspectSchemaObjects(env.HOWLER_DB);
    expect(live.filter((o) => o.type === "table")).toHaveLength(6);
    expect(live.filter((o) => o.type === "trigger")).toHaveLength(10);
    // 3 explicit indexes plus SQLite's automatic indexes for PRIMARY KEY/UNIQUE constraints.
    expect(
      live.filter((o) => o.type === "index" && o.name.startsWith("idx_")),
    ).toHaveLength(3);
  });

  it("matches the exact column set for the projects table", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const columns = await tableColumns(env.HOWLER_DB, "projects");
    expect(columns.map((c) => c.name)).toEqual([
      "project_id",
      "name",
      "revision",
      "current_model_json",
      "updated_at",
    ]);
    const revision = columns.find((c) => c.name === "revision");
    expect(revision?.dflt_value).toBe("0");
  });

  it("matches the exact column set for the project_events table", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const columns = await tableColumns(env.HOWLER_DB, "project_events");
    expect(columns.map((c) => c.name)).toEqual([
      "project_id",
      "event_id",
      "base_revision",
      "new_revision",
      "event_type",
      "occurred_at",
      "received_at",
      "event_json",
      "model_after_json",
    ]);
  });

  it("upgrades a populated frozen v0.9.4 database by reapplying 0001 without deleting or mutating existing data", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    await env.HOWLER_DB.prepare(
      "INSERT INTO projects (project_id, name, revision, current_model_json, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("p1", "Existing project", 0, "{}", "2026-08-26T00:00:00Z")
      .run();

    // Reapply the same migration statements (idempotent CREATE ... IF NOT EXISTS) against the now-populated database.
    await applySchema(env.HOWLER_DB, baselineMigrationSql());

    const row = await env.HOWLER_DB.prepare(
      "SELECT project_id, name, revision FROM projects WHERE project_id = ?",
    )
      .bind("p1")
      .first();
    expect(row).toEqual({
      project_id: "p1",
      name: "Existing project",
      revision: 0,
    });
    const live = await introspectSchemaObjects(env.HOWLER_DB);
    expect(live).toHaveLength(parseFixtureStatements(frozenSchemaSql()).length);
  });

  it("dropAllTables + reapply produces byte-identical schema to a fresh apply (helper sanity check)", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const first = await introspectSchemaObjects(env.HOWLER_DB);
    await dropAllTables(env.HOWLER_DB);
    const empty = await introspectSchemaObjects(env.HOWLER_DB);
    expect(empty).toHaveLength(0);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const second = await introspectSchemaObjects(env.HOWLER_DB);
    expect(second).toEqual(first);
  });
});
