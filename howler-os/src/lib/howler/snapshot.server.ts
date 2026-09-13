import { createSeedState, SEED_VERSION } from "./seed";
import type { Project } from "./types";

export type JobSnapshot = {
  updatedAt: number;
  seedVersion: string;
  projects: Record<string, Project>;
};

/** Own row on howler-dashboard. Never the other eight project ids. */
const BOARD_ROW = "kf-live-board";

type D1Like = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
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

export function getJobSnapshot(): JobSnapshot {
  if (snapshot && snapshot.seedVersion === SEED_VERSION) return snapshot;
  const seed = createSeedState();
  snapshot = {
    projects: seed.projects,
    seedVersion: SEED_VERSION,
    updatedAt: snapshot?.updatedAt ?? 0,
  };
  return snapshot;
}

export function setJobSnapshot(next: JobSnapshot) {
  snapshot = next;
}

export async function loadJobSnapshot(): Promise<JobSnapshot> {
  const memory = getJobSnapshot();
  const db = envDb();
  if (!db) return memory;
  try {
    const row = await db
      .prepare("SELECT current_model_json FROM projects WHERE project_id = ?")
      .bind(BOARD_ROW)
      .first<{ current_model_json: string }>();
    if (!row?.current_model_json) return memory;
    const parsed = JSON.parse(row.current_model_json) as JobSnapshot;
    if (!parsed?.projects || typeof parsed.projects !== "object") return memory;
    snapshot = {
      projects: parsed.projects,
      seedVersion: typeof parsed.seedVersion === "string" ? parsed.seedVersion : SEED_VERSION,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
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
    await db
      .prepare(
        `INSERT INTO projects (project_id, name, revision, current_model_json, updated_at)
         VALUES (?, 'KF Live', 0, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           current_model_json = excluded.current_model_json,
           updated_at = excluded.updated_at`,
      )
      .bind(BOARD_ROW, JSON.stringify(next), new Date().toISOString())
      .run();
  } catch {
    /* never rewrite schema; memory still holds the board */
  }
}
