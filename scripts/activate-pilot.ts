// Pilot activation (Phase 2 requirement #5 -- "This is critical"): activates the seven pilot
// projects (DeBoard + the six KF Live PM Intelligence Dashboard projects) against a target
// Howler Worker's D1 database, over the real, existing HTTP API only -- never by touching D1
// directly, never by inventing a new bundled server route or a second seed/import mechanism.
//
// A successful `wrangler deploy` proves the Worker's code is live. It does NOT prove the pilot
// data exists in that Worker's D1 database -- deployment and data activation are two separate
// facts, and this script is what actually establishes the second one, with its own verification
// step at the end (never trust the activation calls' own 2xx status alone).
//
// Reuses, unmodified:
//   - POST /v1/admin/init-db               schema init/verify (CREATE TABLE IF NOT EXISTS --
//                                           already idempotent, see src/worker/index.ts)
//   - POST /v1/projects/:id/import         the six KF Live projects (./pilot-seed.ts)
//   - POST /v1/projects/deboard-v091/seed  DeBoard's own existing, more detailed seed
//   - POST /v1/intents (EVIDENCE_APPLY_SHADOW, fixed intentId/idempotencyKey) for the DeBoard
//     reconciliation event (./deboard-reconciliation.ts) -- the exact same event and ids
//     test/integration/deboard-reconciliation.test.ts already proves apply cleanly through the
//     real HTTP boundary
//   - POST /v1/intents (FORECAST_QUERY / FORECAST_HEALTH_QUERY, a fresh UUID per run) to verify
//     every one of the seven projects has both a successful canonical read and a successful
//     forecast read after activation
//
// Idempotent by construction, not by any new dedup logic of this script's own:
//   - init-db's CREATE TABLE IF NOT EXISTS statements are naturally safe to re-run
//   - import/seed calls treat a 409 ("already exists") as "already activated" and move on --
//     never overwrite, never delete, never retry as a mutation
//   - the reconciliation intent keeps the exact same fixed intentId/idempotencyKey every run, so
//     a second run's identical submission comes back `replayed: true` (the executor's own
//     existing per-(projectId,idempotencyKey) dedup) rather than reapplying
//   - the verification queries are read-only (FORECAST_QUERY/FORECAST_HEALTH_QUERY) and always
//     use a fresh UUID, so verification is a genuine live read every run, never a cached replay
//
// Any response this script did not expect (neither the documented success shape nor a documented
// already-activated 409) aborts the whole run immediately with a non-zero exit and the full
// response body printed -- never silently continues past unexpected/conflicting state.
//
// Usage:
//   HOWLER_ADMIN_KEY=<key> node scripts/activate-pilot.ts [--base-url http://127.0.0.1:8787]
//
// Defaults to a local wrangler dev server. Pointing this at a real staging/production URL is the
// operator's own separate, explicit decision (--base-url or HOWLER_BASE_URL) -- never this
// script's default, and this script does not deploy anything itself.

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PILOT_PROJECTS, buildPilotSeedProject } from "./pilot-seed";
import { deboardReconciliationEvent } from "./deboard-reconciliation";
import type { ProjectModelV094 } from "../src/domain/types";

const DEBOARD_PROJECT_ID = "deboard-v091";
const ALL_SEVEN_PROJECT_IDS = [
  DEBOARD_PROJECT_ID,
  ...PILOT_PROJECTS.map((p) => p.projectId),
];

interface ActivationOptions {
  baseUrl: string;
  adminKey: string;
}

function parseOptions(argv: string[]): ActivationOptions {
  let baseUrl = process.env.HOWLER_BASE_URL ?? "http://127.0.0.1:8787";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base-url" && argv[i + 1]) {
      baseUrl = argv[i + 1] as string;
      i += 1;
    }
  }
  const adminKey = process.env.HOWLER_ADMIN_KEY;
  if (!adminKey) {
    throw new Error(
      "HOWLER_ADMIN_KEY is not set -- refusing to run without an admin credential (fail closed).",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), adminKey };
}

class AbortActivation extends Error {}

async function callApi(
  opts: ActivationOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${opts.baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.adminKey}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function abort(message: string, detail?: unknown): never {
  process.stderr.write(`ABORT: ${message}\n`);
  if (detail !== undefined) {
    process.stderr.write(`${JSON.stringify(detail, null, 2)}\n`);
  }
  throw new AbortActivation(message);
}

async function initSchema(opts: ActivationOptions): Promise<void> {
  const result = await callApi(opts, "POST", "/v1/admin/init-db");
  const ok = (result.body as { ok?: unknown } | null)?.ok;
  if (result.status !== 200 || ok !== true) {
    abort("schema init/verify did not report ok:true", result);
  }
  log("Schema: initialized/verified.");
}

/** Every activity id and constraint id needs a provenance manifest entry (POST .../import's own
 * contract, src/worker/index.ts) -- derived here from the model's own single dashboard source,
 * never invented per-field detail the snapshot did not actually carry. */
function buildProvenance(
  model: ProjectModelV094,
): Record<string, { sourceId: string; modifiedTime: string }> {
  const sourceId = Object.keys(model.sources)[0];
  if (!sourceId) {
    throw new Error(
      `project ${model.projectId} has no source to attribute provenance to`,
    );
  }
  const modifiedTime =
    model.sources[sourceId]?.observedAt ?? new Date().toISOString();
  const provenance: Record<string, { sourceId: string; modifiedTime: string }> =
    {};
  for (const id of Object.keys(model.activities)) {
    provenance[id] = { sourceId, modifiedTime };
  }
  for (const id of Object.keys(model.constraints)) {
    provenance[id] = { sourceId, modifiedTime };
  }
  return provenance;
}

async function activateKfLiveProject(
  opts: ActivationOptions,
  projectId: string,
): Promise<"activated" | "already-activated"> {
  const model = buildPilotSeedProject(
    PILOT_PROJECTS.find((p) => p.projectId === projectId) ??
      abort(`no pilot seed definition registered for ${projectId}`),
  );
  const provenance = buildProvenance(model);
  const result = await callApi(
    opts,
    "POST",
    `/v1/projects/${encodeURIComponent(projectId)}/import`,
    { project: model, provenance },
  );
  if (result.status === 201) return "activated";
  if (result.status === 409) return "already-activated";
  abort(`unexpected response importing ${projectId}`, result);
}

async function seedDeboard(
  opts: ActivationOptions,
): Promise<"activated" | "already-activated"> {
  const result = await callApi(
    opts,
    "POST",
    `/v1/projects/${DEBOARD_PROJECT_ID}/seed`,
  );
  if (result.status === 201) return "activated";
  if (result.status === 409) return "already-activated";
  abort("unexpected response seeding deboard-v091", result);
}

async function applyDeboardReconciliation(
  opts: ActivationOptions,
): Promise<void> {
  // Fixed, never-changing ids -- the exact same ones
  // test/integration/deboard-reconciliation.test.ts proves apply cleanly through the real HTTP
  // boundary. Keeping them fixed here (not freshly generated) is what makes a second run of this
  // script replay instead of reapplying: the executor's own existing per-(projectId,
  // idempotencyKey) dedup, not a new mechanism this script invents.
  const intent = {
    schemaVersion: "1",
    intentId: "b244404f-93e2-4410-adc8-1eb027cf0635",
    idempotencyKey: "d61605b4-ddea-4244-bd3c-8aee0f1b070a",
    projectId: DEBOARD_PROJECT_ID,
    kind: "EVIDENCE_APPLY_SHADOW",
    requestedEffect: "APPLY_SHADOW",
    expectedProjectRevision: deboardReconciliationEvent.baseRevision,
    submittedAt: "2026-09-03T12:00:00.000Z",
    source: { channel: "API" },
    payload: { type: "EVIDENCE", event: deboardReconciliationEvent },
  };
  const result = await callApi(opts, "POST", "/v1/intents", intent);
  const body = result.body as {
    replayed?: unknown;
    run?: { state?: unknown };
    result?: { status?: unknown };
  } | null;
  if (result.status === 200 && body?.replayed === true) {
    log("DeBoard reconciliation: already applied (replayed, not reapplied).");
    return;
  }
  if (
    result.status === 201 &&
    body?.run?.state === "SUCCEEDED" &&
    body.result?.status === "SUCCEEDED"
  ) {
    log("DeBoard reconciliation: applied.");
    return;
  }
  abort(
    "DeBoard reconciliation did not reach a recognized success shape (SUCCEEDED or a replay) -- refusing to claim it applied",
    result,
  );
}

interface VerificationRow {
  projectId: string;
  canonicalRead: "SUCCEEDED" | "FAILED";
  forecastRead: "SUCCEEDED" | "FAILED";
}

async function verifyProjectRead(
  opts: ActivationOptions,
  projectId: string,
  kind: "FORECAST_QUERY" | "FORECAST_HEALTH_QUERY",
): Promise<"SUCCEEDED" | "FAILED"> {
  const intent = {
    schemaVersion: "1",
    intentId: randomUUID(),
    idempotencyKey: randomUUID(),
    projectId,
    kind,
    requestedEffect: "READ_ONLY",
    expectedProjectRevision: null,
    submittedAt: new Date().toISOString(),
    source: { channel: "API" },
    payload: { type: "QUERY" },
  };
  const result = await callApi(opts, "POST", "/v1/intents", intent);
  const body = result.body as {
    run?: { state?: unknown };
    result?: { status?: unknown };
  } | null;
  const succeeded =
    result.status === 201 &&
    body?.run?.state === "SUCCEEDED" &&
    body.result?.status === "SUCCEEDED";
  return succeeded ? "SUCCEEDED" : "FAILED";
}

async function verifyAllSevenProjects(
  opts: ActivationOptions,
): Promise<VerificationRow[]> {
  const rows: VerificationRow[] = [];
  for (const projectId of ALL_SEVEN_PROJECT_IDS) {
    const canonicalRead = await verifyProjectRead(
      opts,
      projectId,
      "FORECAST_QUERY",
    );
    const forecastRead = await verifyProjectRead(
      opts,
      projectId,
      "FORECAST_HEALTH_QUERY",
    );
    rows.push({ projectId, canonicalRead, forecastRead });
  }
  return rows;
}

export async function activatePilot(
  opts: ActivationOptions,
): Promise<VerificationRow[]> {
  log(`Activating pilot data against ${opts.baseUrl} ...`);
  await initSchema(opts);

  for (const def of PILOT_PROJECTS) {
    const outcome = await activateKfLiveProject(opts, def.projectId);
    log(`${def.projectId}: ${outcome}.`);
  }

  const deboardOutcome = await seedDeboard(opts);
  log(`${DEBOARD_PROJECT_ID}: ${deboardOutcome}.`);
  await applyDeboardReconciliation(opts);

  log("Verifying all seven projects (canonical read + forecast read) ...");
  const rows = await verifyAllSevenProjects(opts);
  const failures = rows.filter(
    (r) => r.canonicalRead !== "SUCCEEDED" || r.forecastRead !== "SUCCEEDED",
  );

  log("");
  log("Project        Canonical read   Forecast read");
  for (const row of rows) {
    log(
      `${row.projectId.padEnd(15)} ${row.canonicalRead.padEnd(16)} ${row.forecastRead}`,
    );
  }
  log("");

  if (failures.length > 0) {
    abort(
      `${String(failures.length)} of 7 projects failed verification`,
      failures,
    );
  }

  log(
    "All seven projects verified: canonical read + forecast read both SUCCEEDED.",
  );
  return rows;
}

async function main(): Promise<void> {
  const opts = parseOptions(process.argv.slice(2));
  await activatePilot(opts);
}

// Only run when executed directly (`node scripts/activate-pilot.ts`), never on import -- so
// test/unit/activate-pilot.test.ts can import activatePilot/buildProvenance for real assertions
// without triggering a live network run as a side effect of import.
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error: unknown) => {
    if (!(error instanceof AbortActivation)) {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    }
    process.exitCode = 1;
  });
}
