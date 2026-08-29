/// <reference types="vite/client" />

const migrationSources = import.meta.glob<string>("../../migrations/*.sql", {
  eager: true,
  import: "default",
  query: "?raw",
});

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*.sql", {
  eager: true,
  import: "default",
  query: "?raw",
});

function readGlob(
  sources: Record<string, string>,
  fileName: string,
  label: string,
): string {
  const entry = Object.entries(sources).find(([modulePath]) =>
    modulePath.endsWith(`/${fileName}`),
  );
  if (!entry) {
    throw new Error(`missing ${label} ${fileName}`);
  }
  return entry[1];
}

/** The actual migration file wrangler/D1 will apply — the schema source of truth going forward. */
export function baselineMigrationSql(): string {
  return readGlob(migrationSources, "0001_v094_baseline.sql", "migration");
}

/** The frozen v0.9.4 characterization fixture recorded in Task 2, used as the comparison target. */
export function frozenSchemaSql(): string {
  return readGlob(fixtureSources, "schema.sql", "fixture");
}

/**
 * D1's `exec()` splits statements by newline and rejects comment-only or blank lines, unlike a
 * general-purpose SQL file parser. Every statement in both `schema.sql` and the migration file is
 * already single-line, so stripping comment/blank lines is sufficient to make either file `exec()`-able.
 */
export function stripSqlCommentsAndBlankLines(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith("--"))
    .join("\n");
}

export async function applySchema(db: D1Database, sql: string): Promise<void> {
  await db.exec(stripSqlCommentsAndBlankLines(sql));
}

export interface SchemaObject {
  type: string;
  name: string;
  sql: string;
}

/** D1/SQLite drops the (semantically inert) `IF NOT EXISTS` clause from the stored DDL text. */
function normalizeCreateStatement(sql: string): string {
  return sql
    .replace(
      /^(CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER))\s+IF NOT EXISTS\s+/i,
      "$1 ",
    )
    .trim();
}

export async function introspectSchemaObjects(
  db: D1Database,
): Promise<SchemaObject[]> {
  const result = await db
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','trigger','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name",
    )
    .all<{ type: string; name: string; sql: string | null }>();
  return result.results.map((row) => ({
    type: row.type,
    name: row.name,
    sql: row.sql ? normalizeCreateStatement(row.sql) : "",
  }));
}

/** One statement per non-comment, non-blank line, in file order — matches `schema.sql`'s own layout. */
export function parseFixtureStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"))
    .map((line) => normalizeCreateStatement(line).replace(/;$/, ""));
}

export interface TableColumn {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

export async function tableColumns(
  db: D1Database,
  tableName: string,
): Promise<TableColumn[]> {
  const result = await db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all<TableColumn>();
  return result.results;
}

/**
 * Drops every user table (SQLite cascades dependent triggers/indexes) so a fresh schema can be
 * reapplied. D1 enforces FOREIGN KEY constraints, so children must drop before parents; rather
 * than hardcode the schema's dependency order, this retries in passes, dropping whatever
 * currently has no remaining referencing table, until nothing is left.
 */
export async function dropAllTables(db: D1Database): Promise<void> {
  const result = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>();
  let remaining = result.results.map((row) => row.name);
  while (remaining.length > 0) {
    const stillBlocked: string[] = [];
    for (const name of remaining) {
      try {
        await db.exec(`DROP TABLE "${name}"`);
      } catch {
        stillBlocked.push(name);
      }
    }
    if (stillBlocked.length === remaining.length) {
      throw new Error(
        `Unable to drop tables due to unresolved foreign key dependencies: ${stillBlocked.join(", ")}`,
      );
    }
    remaining = stillBlocked;
  }
}
