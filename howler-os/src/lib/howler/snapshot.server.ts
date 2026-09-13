import {
  LIVE_PROJECT_IDS,
  overlayDashboard,
  projectFromDashboardRow,
  slugFromName,
  slugFromProjectId,
  type DashboardRow,
  type LiveProjectId,
} from "./dashboard";
import { createSeedState, SEED_VERSION } from "./seed";
import type { Project } from "./types";

export type JobSnapshot = {
  updatedAt: number;
  seedVersion: string;
  projects: Record<string, Project>;
};

type D1Like = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      first: <T>() => Promise<T | null>;
      all: <T>() => Promise<{ results: T[] }>;
      run: () => Promise<unknown>;
    };
    all: <T>() => Promise<{ results: T[] }>;
    first: <T>() => Promise<T | null>;
    run: () => Promise<unknown>;
  };
};

function envDb(): D1Like | undefined {
  const bag = globalThis as {
    __HOWLER_ENV?: { HOWLER_DB?: D1Like };
    __env__?: { HOWLER_DB?: D1Like };
  };
  return bag.__HOWLER_ENV?.HOWLER_DB ?? bag.__env__?.HOWLER_DB;
}

let snapshot: JobSnapshot | null = null;

function seedProjects(): Record<string, Project> {
  return createSeedState().projects;
}

export function getJobSnapshot(): JobSnapshot {
  if (snapshot && snapshot.seedVersion === SEED_VERSION) return snapshot;
  snapshot = {
    projects: seedProjects(),
    seedVersion: SEED_VERSION,
    updatedAt: snapshot?.updatedAt ?? 0,
  };
  return snapshot;
}

export function setJobSnapshot(next: JobSnapshot) {
  snapshot = next;
}

function parseStored(json: string | null | undefined, slug: LiveProjectId): Project | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Project | JobSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if ("projects" in parsed && parsed.projects && typeof parsed.projects === "object") {
      const nested =
        parsed.projects[slug] ??
        parsed.projects["deboard-v091"] ??
        parsed.projects["deboard-v09"] ??
        parsed.projects.deboard;
      return nested ? { ...nested, id: slug } : null;
    }
    if (!("id" in parsed) && !("activities" in parsed)) return null;
    return { ...(parsed as Project), id: slug };
  } catch {
    return null;
  }
}

function hasJobBook(project: Project | null): boolean {
  if (!project) return false;
  return Boolean(
    Object.keys(project.activities ?? {}).length ||
      Object.keys(project.scopeItems ?? {}).length ||
      project.financials ||
      Object.keys(project.job?.contacts ?? {}).length ||
      (project.blueprint?.evidence?.length ?? 0) ||
      (project.events?.length ?? 0) > 1,
  );
}

function mergeRow(row: DashboardRow, seed: Record<string, Project>): { slug: LiveProjectId; project: Project } | null {
  const slug = slugFromProjectId(row.project_id) ?? slugFromName(row.name);
  if (!slug) return null;
  const stored = parseStored(row.current_model_json, slug);
  const fromSeed = seed[slug];
  const fromRow = projectFromDashboardRow(row, slug);
  const base = hasJobBook(stored)
    ? { ...(fromSeed ?? fromRow), ...stored, id: slug }
    : (fromSeed ?? stored ?? fromRow);
  return { slug, project: overlayDashboard(base, row, slug) };
}

type PragmaCol = { name: string; notnull: number; pk: number; dflt_value: unknown };

async function ensureDashboardColumns(db: D1Like): Promise<PragmaCol[]> {
  const info = await db.prepare("PRAGMA table_info(projects)").all<PragmaCol>();
  const cols = info.results ?? [];
  const names = new Set(cols.map((row) => row.name));
  const adds: [string, string][] = [
    ["project_id", "project_id TEXT"],
    ["revision", "revision INTEGER DEFAULT 0"],
    ["current_model_json", "current_model_json TEXT"],
  ];
  for (const [name, ddl] of adds) {
    if (names.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE projects ADD COLUMN ${ddl}`).run();
      names.add(name);
    } catch {
      /* column may already exist */
    }
  }
  if (!names.has("project_id") || !names.has("current_model_json")) {
    const again = await db.prepare("PRAGMA table_info(projects)").all<PragmaCol>();
    return again.results ?? cols;
  }
  return cols;
}

async function backfillLiveRows(
  db: D1Like,
  rows: DashboardRow[],
  seed: Record<string, Project>,
): Promise<void> {
  const matched = new Set<LiveProjectId>();
  for (const row of rows) {
    const merged = mergeRow(row, seed);
    if (!merged) continue;
    matched.add(merged.slug);
    if (row.project_id === merged.slug && row.current_model_json && row.current_model_json.length > 40) continue;
    const key = row.id ?? row.project_id ?? row.name;
    try {
      await db
        .prepare(
          `UPDATE projects
           SET project_id = ?, revision = COALESCE(revision, 0), current_model_json = ?
           WHERE id = ? OR project_id = ? OR name = ?`,
        )
        .bind(merged.slug, JSON.stringify(merged.project), key, row.project_id, row.name)
        .run();
    } catch {
      /* leave the in-memory overlay; never DROP */
    }
  }
  for (const slug of LIVE_PROJECT_IDS) {
    if (matched.has(slug) || !seed[slug]) continue;
    const project = seed[slug];
    try {
      await db
        .prepare(
          `INSERT INTO projects (name, project_id, revision, current_model_json, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(project.name, slug, project.revision ?? 0, JSON.stringify(project), new Date().toISOString())
        .run();
    } catch {
      /* row may already exist under a name we didn't match */
    }
  }
}

export async function loadJobSnapshot(): Promise<JobSnapshot> {
  const memory = getJobSnapshot();
  const db = envDb();
  if (!db) return memory;
  try {
    await ensureDashboardColumns(db);
    const result = await db.prepare("SELECT * FROM projects").all<DashboardRow>();
    const rows = result.results ?? [];
    const seed = seedProjects();
    await backfillLiveRows(db, rows, seed);
    const projects: Record<string, Project> = {};
    const refreshed = await db.prepare("SELECT * FROM projects").all<DashboardRow>();
    for (const row of refreshed.results ?? rows) {
      const merged = mergeRow(row, seed);
      if (!merged) continue;
      projects[merged.slug] = merged.project;
    }
    for (const id of LIVE_PROJECT_IDS) {
      if (!projects[id] && seed[id]) projects[id] = seed[id];
    }
    if (Object.keys(projects).length === 0) return memory;
    snapshot = {
      projects,
      seedVersion: SEED_VERSION,
      updatedAt: Date.now(),
    };
    return snapshot;
  } catch {
    return memory;
  }
}

export async function persistJobSnapshot(next: JobSnapshot): Promise<void> {
  setJobSnapshot(next);
  const db = envDb();
  if (!db) return;
  try {
    const now = new Date().toISOString();
    for (const id of LIVE_PROJECT_IDS) {
      const project = next.projects[id];
      if (!project) continue;
      await db
        .prepare(
          `UPDATE projects
           SET current_model_json = ?, revision = ?, updated_at = ?, project_id = ?
           WHERE project_id = ?`,
        )
        .bind(JSON.stringify(project), project.revision ?? 0, now, id, id)
        .run();
    }
  } catch {
    /* never rewrite schema; never touch howler-intelligence-staging */
  }
}
