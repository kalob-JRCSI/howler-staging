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
//   - POST /v1/intents (EVIDENCE_PREVIEW, a fresh UUID per call, never persisted) as the existing,
//     safest available read mechanism for proving an already-existing project's identity/lineage
//     (see "409 does not prove activation" below)
//   - GET /v1/projects/deboard-v091/events to prove an already-existing DeBoard project's lineage
//     via its own immutable, deterministic bootstrap event id
//   - POST /v1/intents (EVIDENCE_APPLY_SHADOW, fixed intentId/idempotencyKey) for the DeBoard
//     reconciliation event (./deboard-reconciliation.ts) -- the exact same event and ids
//     test/integration/deboard-reconciliation.test.ts already proves apply cleanly through the
//     real HTTP boundary
//   - POST /v1/intents (FORECAST_QUERY / FORECAST_HEALTH_QUERY, a fresh UUID per run) as an
//     end-to-end read-health check *in addition to*, never *instead of*, the identity/lineage
//     proof below -- seven successful forecast reads alone are never sufficient by themselves to
//     declare activation successful
//
// 409 DOES NOT PROVE ACTIVATION. An import/seed call returning 409 ("already exists") only proves
// *a* project with that id already exists -- never that its content is the authoritative pilot
// seed. An old placeholder, a stale test fixture, or any other incorrectly-provisioned project
// could return 409 and still answer FORECAST_QUERY/FORECAST_HEALTH_QUERY successfully; treating
// that alone as "activated" would let this script falsely report the authoritative pilot state is
// live when it never was. So every 409 is followed by an identity/lineage proof, using only
// existing read mechanisms (no new HTTP route, no second truth store):
//   - the six KF Live projects: an EVIDENCE_PREVIEW with an empty-mutation ("no-op") event against
//     the project's *current* revision (learned via one revision-mismatch probe if not already
//     known) returns a forecast `candidate` computed fresh from the live, persisted model --
//     carrying `basedOnSourceIds` (= every source id currently on the model) and
//     `activityForecasts` (keyed by every activity id currently on the model), all without ever
//     mutating anything (PREVIEW never persists). The authoritative pilot-seed.ts model for that
//     project has one single, distinctively-named dashboard source id
//     (`${projectId}-dashboard-sep3`) and a known activity id set -- lineage is provable exactly
//     when the existing project's current source ids include that authoritative source id *and*
//     its current activity ids are a superset of the authoritative activity id set. An exact-size
//     match is the authoritative seed itself (safe idempotent rerun); a strict superset is a
//     legitimate descendant (real PM work layered on top -- preserved, never overwritten); missing
//     either signal means lineage cannot be proven -- abort, identify the project, never overwrite
//     and never delete it.
//   - DeBoard: its own seed (src/worker/deboard-seed.ts) always registers one fixed, deterministic
//     bootstrap event id ("deboard-v091-baseline-evidence-2026-08-26") in the project's immutable
//     event ledger. GET .../events (already existing, read-only) either contains that id -- lineage
//     proven, safe to proceed to reconciliation -- or it doesn't, in which case this is not the
//     expected DeBoard lineage and the run aborts before ever attempting reconciliation against it.
//
// Idempotent by construction, not by any new dedup logic of this script's own:
//   - init-db's CREATE TABLE IF NOT EXISTS statements are naturally safe to re-run
//   - import/seed calls treat a 409 as "possibly already activated" and gate it behind the
//     identity/lineage proof above before ever calling it safe -- never overwrite, never delete,
//     never retry as a mutation
//   - the reconciliation intent keeps the exact same fixed intentId/idempotencyKey every run, so
//     a second run's identical submission comes back `replayed: true` (the executor's own
//     existing per-(projectId,idempotencyKey) dedup) rather than reapplying
//   - the verification queries are read-only (FORECAST_QUERY/FORECAST_HEALTH_QUERY) and always
//     use a fresh UUID, so verification is a genuine live read every run, never a cached replay
//
// Any response this script did not expect (neither the documented success shape, a documented
// already-activated 409 with provable lineage, nor a documented replay) aborts the whole run
// immediately with a non-zero exit and the full response body printed -- never silently continues
// past unexpected/conflicting/unprovable state.
//
// Usage:
//   HOWLER_ADMIN_KEY=<key> node scripts/activate-pilot.ts [--base-url http://127.0.0.1:8787]
//
// Defaults to a local wrangler dev server. Pointing this at a real staging/production URL is the
// operator's own separate, explicit decision (--base-url or HOWLER_BASE_URL) -- never this
// script's default, and this script does not deploy anything itself.

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PILOT_PROJECTS, buildPilotSeedProject } from "./pilot-seed.ts";
import { deboardReconciliationEvent } from "./deboard-reconciliation.ts";
import type { ProjectModelV094 } from "../src/domain/types";

const DEBOARD_PROJECT_ID = "deboard-v091";
const ALL_SEVEN_PROJECT_IDS = [
  DEBOARD_PROJECT_ID,
  ...PILOT_PROJECTS.map((p) => p.projectId),
];

// DeBoard's own seed (src/worker/deboard-seed.ts) always registers this exact, fixed bootstrap
// event id -- deterministic regardless of when the seed function runs, so its presence in the
// project's event ledger is proof of DeBoard lineage without needing to compare full event
// content.
const DEBOARD_BOOTSTRAP_EVENT_ID = "deboard-v091-baseline-evidence-2026-08-26";

// An expectedProjectRevision virtually guaranteed to mismatch the real one (real revisions start
// at 0 or 1 and only ever increment by small amounts) -- used purely to provoke a REVISION_CONFLICT
// response, which discloses the project's actual current revision in problem.details.currentRevision
// without this script ever having to guess or separately track it. A non-negative integer, as
// required by the intent schema (src/operator/intent.ts).
const PROBE_REVISION_SENTINEL = Number.MAX_SAFE_INTEGER;

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

/** Builds one EVIDENCE_PREVIEW intent: a syntactically valid, genuinely empty-mutation event
 * (`mutations: []`) against `expectedProjectRevision`. Never persists anything (PREVIEW skips
 * COMMIT_SHADOW unconditionally, src/operator/workflow.ts) -- this is a pure read, reusable to
 * both probe a project's current revision (via the REVISION_CONFLICT it provokes when the guess is
 * wrong) and, once the revision is known, read back the live model's current source/activity ids
 * via the response's forecast `candidate`. */
async function submitEvidencePreview(
  opts: ActivationOptions,
  projectId: string,
  expectedProjectRevision: number,
): Promise<{ status: number; body: unknown }> {
  const now = new Date().toISOString();
  const intent = {
    schemaVersion: "1",
    intentId: randomUUID(),
    idempotencyKey: randomUUID(),
    projectId,
    kind: "EVIDENCE_PREVIEW",
    requestedEffect: "PREVIEW",
    expectedProjectRevision,
    submittedAt: now,
    source: { channel: "API" },
    payload: {
      type: "EVIDENCE",
      event: {
        id: "pilot-activation-lineage-check",
        baseRevision: expectedProjectRevision,
        projectId,
        type: "PILOT_ACTIVATION_LINEAGE_CHECK",
        occurredAt: now,
        receivedAt: now,
        sourceIds: [],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: [],
        mutations: [],
        payload: {},
        note: "Pilot activation identity/lineage probe -- read-only, never persisted (EVIDENCE_PREVIEW never commits).",
      },
    },
  };
  return callApi(opts, "POST", "/v1/intents", intent);
}

type LineageProbeResult =
  | { exists: false }
  | {
      exists: true;
      revision: number;
      basedOnSourceIds: string[];
      activityIds: string[];
    };

/** Reads an existing project's *current* live content -- source ids and activity ids -- via the
 * safest existing read mechanism available (a no-op EVIDENCE_PREVIEW, which never mutates or
 * persists anything). The project's revision is not known upfront, so this probes with a
 * near-certainly-wrong revision first; a REVISION_CONFLICT response discloses the real one
 * (`problem.details.currentRevision`), which is then used for the real read. A PROJECT_NOT_FOUND
 * response at either step means the project genuinely does not exist. */
async function readProjectLineageState(
  opts: ActivationOptions,
  projectId: string,
): Promise<LineageProbeResult> {
  const probe = await submitEvidencePreview(
    opts,
    projectId,
    PROBE_REVISION_SENTINEL,
  );
  const probeBody = probe.body as {
    run?: { state?: unknown };
    result?: {
      status?: unknown;
      problem?: { code?: unknown; details?: { currentRevision?: unknown } };
      output?: { data?: unknown };
    };
  } | null;
  const probeProblemCode = probeBody?.result?.problem?.code;
  if (probeProblemCode === "PROJECT_NOT_FOUND") {
    return { exists: false };
  }
  let revision: number;
  let dataBody = probeBody;
  if (probeProblemCode === "REVISION_CONFLICT") {
    const currentRevision =
      probeBody?.result?.problem?.details?.currentRevision;
    if (typeof currentRevision !== "number") {
      abort(
        `lineage probe for ${projectId} reported REVISION_CONFLICT but no usable currentRevision`,
        probe,
      );
    }
    revision = currentRevision;
    const confirmed = await submitEvidencePreview(opts, projectId, revision);
    dataBody = confirmed.body as typeof probeBody;
  } else if (
    probeBody?.run?.state === "SUCCEEDED" &&
    probeBody.result?.status === "SUCCEEDED"
  ) {
    // The astronomically unlikely case where the sentinel actually matched -- still need the
    // real revision for the returned result.
    revision = PROBE_REVISION_SENTINEL;
  } else {
    abort(`unexpected lineage probe response for ${projectId}`, probe);
  }
  if (
    dataBody?.run?.state !== "SUCCEEDED" ||
    dataBody.result?.status !== "SUCCEEDED"
  ) {
    abort(
      `lineage read for ${projectId} did not reach SUCCEEDED even after resolving its current revision`,
      dataBody,
    );
  }
  const data = dataBody.result.output?.data as
    | {
        candidate?: {
          basedOnSourceIds?: unknown;
          activityForecasts?: Record<string, unknown>;
        };
      }
    | undefined;
  const basedOnSourceIds = data?.candidate?.basedOnSourceIds;
  const activityForecasts = data?.candidate?.activityForecasts;
  if (!Array.isArray(basedOnSourceIds) || !activityForecasts) {
    abort(
      `lineage read for ${projectId} did not return a usable candidate`,
      dataBody,
    );
  }
  return {
    exists: true,
    revision,
    basedOnSourceIds: basedOnSourceIds as string[],
    activityIds: Object.keys(activityForecasts),
  };
}

type LineageVerdict = "EXACT" | "DESCENDANT" | "UNPROVABLE";

/** The KF Live identity/lineage proof itself: an existing project's current source/activity ids
 * (read live via readProjectLineageState) are compared against the authoritative pilot-seed.ts
 * model for that same projectId. Lineage is provable only when the live project's source ids
 * include the authoritative dashboard source id *and* its activity ids are a superset of the
 * authoritative activity id set -- an old placeholder or an unrelated stale fixture will be
 * missing one or both and cannot be mistaken for the real thing just because it also answers
 * forecast queries successfully. */
function proveKfLiveLineage(
  authoritativeModel: ProjectModelV094,
  probe: { basedOnSourceIds: string[]; activityIds: string[] },
): LineageVerdict {
  const authoritativeSourceId = Object.keys(authoritativeModel.sources)[0];
  const authoritativeActivityIds = Object.keys(authoritativeModel.activities);
  const hasAuthoritativeSource =
    authoritativeSourceId !== undefined &&
    probe.basedOnSourceIds.includes(authoritativeSourceId);
  const hasAllAuthoritativeActivities = authoritativeActivityIds.every((id) =>
    probe.activityIds.includes(id),
  );
  if (!hasAuthoritativeSource || !hasAllAuthoritativeActivities) {
    return "UNPROVABLE";
  }
  return probe.activityIds.length === authoritativeActivityIds.length
    ? "EXACT"
    : "DESCENDANT";
}

type ActivationOutcome =
  "activated" | "already-activated" | "descendant-preserved";

async function activateKfLiveProject(
  opts: ActivationOptions,
  projectId: string,
): Promise<ActivationOutcome> {
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
  if (result.status !== 409) {
    abort(`unexpected response importing ${projectId}`, result);
  }
  // 409 alone does not prove activation -- a stale/placeholder project could also 409 here and
  // also answer forecast queries successfully. Prove identity/lineage before ever calling this
  // safe.
  const probe = await readProjectLineageState(opts, projectId);
  if (!probe.exists) {
    abort(
      `${projectId} returned 409 on import but a lineage probe reports the project does not exist -- inconsistent state, refusing to proceed`,
      probe,
    );
  }
  const verdict = proveKfLiveLineage(model, probe);
  if (verdict === "UNPROVABLE") {
    abort(
      `existing project ${projectId} could not be proven to be the authoritative pilot seed or a legitimate descendant of it -- refusing to treat its 409 as safe activation. Never overwritten, never deleted.`,
      {
        projectId,
        authoritativeSourceId: Object.keys(model.sources)[0],
        authoritativeActivityIds: Object.keys(model.activities),
        existingSourceIds: probe.basedOnSourceIds,
        existingActivityIds: probe.activityIds,
      },
    );
  }
  return verdict === "EXACT" ? "already-activated" : "descendant-preserved";
}

/** DeBoard's own lineage proof: its seed (src/worker/deboard-seed.ts) always registers a single,
 * fixed, deterministic bootstrap event id in the project's immutable event ledger. Reading that
 * ledger back (the already-existing, read-only GET .../events route) and checking for that exact
 * id is the whole proof -- no new mechanism, no comparison of full event content needed. */
async function proveDeboardLineage(
  opts: ActivationOptions,
): Promise<"PROVABLE" | "UNPROVABLE"> {
  const result = await callApi(
    opts,
    "GET",
    `/v1/projects/${DEBOARD_PROJECT_ID}/events?limit=500`,
  );
  const events = (result.body as { events?: { id?: unknown }[] } | null)
    ?.events;
  if (result.status !== 200 || !Array.isArray(events)) {
    abort(
      "could not read deboard-v091's event ledger to prove lineage",
      result,
    );
  }
  return events.some((e) => e.id === DEBOARD_BOOTSTRAP_EVENT_ID)
    ? "PROVABLE"
    : "UNPROVABLE";
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
  if (result.status !== 409) {
    abort("unexpected response seeding deboard-v091", result);
  }
  // 409 alone does not prove this is the expected DeBoard lineage -- prove it via the project's
  // own immutable bootstrap event id before ever applying reconciliation against it.
  const lineage = await proveDeboardLineage(opts);
  if (lineage === "UNPROVABLE") {
    abort(
      "existing deboard-v091 project could not be proven to be the expected DeBoard lineage (its bootstrap event id was not found in the event ledger) -- refusing to treat its 409 as safe, and refusing to run reconciliation against it. Never overwritten, never deleted.",
      { expectedBootstrapEventId: DEBOARD_BOOTSTRAP_EVENT_ID },
    );
  }
  return "already-activated";
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
