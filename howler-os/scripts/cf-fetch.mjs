import nitro from "./index.mjs";
import { handlePilotGate } from "./pilot-gate.mjs";

/** Additive-only. Never DROP. Bound HOWLER_DB is howler-dashboard. */
async function ensureDashboardColumns(env) {
  const db = env?.HOWLER_DB;
  if (!db || env.__HOWLER_SCHEMA_READY) return;
  try {
    const info = await db.prepare("PRAGMA table_info(projects)").all();
    const names = new Set((info.results || []).map((row) => String(row.name || "")));
    if (!names.has("project_id")) await db.prepare("ALTER TABLE projects ADD COLUMN project_id TEXT").run();
    if (!names.has("revision")) await db.prepare("ALTER TABLE projects ADD COLUMN revision INTEGER DEFAULT 0").run();
    if (!names.has("current_model_json")) await db.prepare("ALTER TABLE projects ADD COLUMN current_model_json TEXT").run();
    env.__HOWLER_SCHEMA_READY = true;
  } catch (error) {
    console.log("howler-dashboard schema", error);
  }
}

export default {
  async fetch(request, env, ctx) {
    globalThis.__HOWLER_ENV = env;
    globalThis.__env__ = env;
    await ensureDashboardColumns(env);
    const gated = await handlePilotGate(request, env);
    if (gated) return gated;
    return nitro.fetch(request, env, ctx);
  },
};
