// Pilot activation (Phase 2 requirement #5 -- "This is critical"), requirement #9 minimum tests:
// "staging activation is idempotent", "DeBoard reconciliation is not duplicated", "activation
// refuses unsafe conflicting newer state", "seven-project verification checks actual D1 reads".
//
// Independent-review correction: a 409 on import/seed never proves activation by itself -- an old
// placeholder or stale fixture could also 409 and also answer forecast queries successfully. Every
// test below that exercises a 409 path also drives the identity/lineage proof
// (EVIDENCE_PREVIEW-based for the six KF Live projects, event-ledger-based for DeBoard) that now
// gates whether a 409 is ever treated as safe.
//
// Plain-Node unit tests (see ../vitest.config.ts) driving activatePilot() against a stubbed
// global fetch -- proves the orchestration logic itself (how this script interprets each HTTP
// response), not the underlying domain data, which test/unit/pilot-seed.test.ts and
// test/integration/deboard-reconciliation.test.ts already cover in full through the real HTTP
// boundary.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activatePilot } from "../activate-pilot.ts";
import { PILOT_PROJECTS, buildPilotSeedProject } from "../pilot-seed.ts";

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes a stubbed fetch by (method, pathname) exact match, falling back to a per-kind dispatch
 * for /v1/intents (every intent kind shares one path); records every call made. */
function stubFetch(handlers: Record<string, (call: Call) => Response>): {
  calls: Call[];
} {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body: unknown =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined;
      const call: Call = { method, path: url.pathname, body };
      calls.push(call);
      const key = `${method} ${url.pathname}`;
      const handler =
        handlers[key] ??
        (url.pathname === "/v1/intents" && typeof body === "object"
          ? handlers[
              `POST /v1/intents:${String((body as { kind?: unknown }).kind)}`
            ]
          : undefined);
      if (!handler) {
        throw new Error(
          `no stub handler for ${key} (body: ${JSON.stringify(body)})`,
        );
      }
      return Promise.resolve(handler(call));
    },
  );
  return { calls };
}

function succeededIntent(): Response {
  return jsonResponse(201, {
    run: { state: "SUCCEEDED" },
    result: { status: "SUCCEEDED" },
  });
}

const OPTS = { baseUrl: "http://127.0.0.1:8787", adminKey: "test-admin-key" };

const PROBE_REVISION_SENTINEL = Number.MAX_SAFE_INTEGER;

function findPilotDefinition(projectId: string) {
  const def = PILOT_PROJECTS.find((p) => p.projectId === projectId);
  if (!def) throw new Error(`no pilot definition for ${projectId}`);
  return def;
}

const STEWART_MODEL = buildPilotSeedProject(findPilotDefinition("stewart-v1"));
const STEWART_AUTHORITATIVE_SOURCE_ID = (() => {
  const id = Object.keys(STEWART_MODEL.sources)[0];
  if (!id) throw new Error("stewart-v1 model has no source");
  return id;
})();
const STEWART_AUTHORITATIVE_ACTIVITY_IDS = Object.keys(
  STEWART_MODEL.activities,
);

/** A realistic EVIDENCE_PREVIEW handler for one project: BLOCKED/REVISION_CONFLICT (HTTP 409,
 * matching the real server's respondToWorkflowOutcome) when the submitted expectedProjectRevision
 * doesn't match `revision`, otherwise SUCCEEDED (HTTP 201) with a forecast `candidate` carrying the
 * given source/activity ids -- mirrors exactly what a live EVIDENCE_PREVIEW against that project's
 * real, current, persisted model would return. */
function evidencePreviewHandler(
  revision: number,
  basedOnSourceIds: string[],
  activityIds: string[],
): (call: Call) => Response {
  return (call) => {
    const body = call.body as { expectedProjectRevision?: unknown };
    if (body.expectedProjectRevision !== revision) {
      return jsonResponse(409, {
        run: { state: "BLOCKED" },
        result: {
          status: "BLOCKED",
          problem: {
            code: "REVISION_CONFLICT",
            category: "REVISION",
            message: "stale",
            details: { currentRevision: revision },
          },
        },
      });
    }
    const activityForecasts: Record<string, unknown> = {};
    for (const id of activityIds) {
      activityForecasts[id] = { activityId: id, activityName: id };
    }
    return jsonResponse(201, {
      run: { state: "SUCCEEDED" },
      result: {
        status: "SUCCEEDED",
        output: {
          type: "EVIDENCE_PREVIEW",
          data: { candidate: { basedOnSourceIds, activityForecasts } },
        },
      },
    });
  };
}

function projectNotFoundResponse(): Response {
  return jsonResponse(500, {
    run: { state: "FAILED" },
    result: {
      status: "FAILED",
      problem: {
        code: "PROJECT_NOT_FOUND",
        category: "INTERNAL",
        message: "not found",
        retryable: false,
      },
    },
  });
}

const OTHER_KF_LIVE_IDS = PILOT_PROJECTS.map((p) => p.projectId).filter(
  (id) => id !== "stewart-v1",
);

/** A fully "already activated, exact authoritative match" world for the five KF Live projects
 * other than stewart-v1 (each treated identically -- exact revision-0 match) -- used by every test
 * below that only cares about stewart-v1's specific scenario and needs the rest of the run to
 * proceed uneventfully to that project. */
function otherKfLiveHandlers(): Record<string, (call: Call) => Response> {
  const handlers: Record<string, (call: Call) => Response> = {};
  for (const id of OTHER_KF_LIVE_IDS) {
    handlers[`POST /v1/projects/${id}/import`] = () =>
      jsonResponse(409, { error: "already exists" });
  }
  return handlers;
}

/** Merges evidencePreviewHandler dispatch across every project by inspecting the request body's
 * projectId -- the stub router only keys /v1/intents by kind, so this one handler covers all KF
 * Live EVIDENCE_PREVIEW calls for a whole scenario. */
function multiProjectEvidencePreviewHandler(
  byProject: Record<
    string,
    { revision: number; sourceIds: string[]; activityIds: string[] }
  >,
): (call: Call) => Response {
  return (call) => {
    const body = call.body as { projectId?: unknown };
    const projectId = String(body.projectId);
    const config = byProject[projectId];
    if (!config) {
      throw new Error(`no EVIDENCE_PREVIEW stub config for ${projectId}`);
    }
    return evidencePreviewHandler(
      config.revision,
      config.sourceIds,
      config.activityIds,
    )(call);
  };
}

function exactMatchConfig(projectId: string) {
  const model = buildPilotSeedProject(findPilotDefinition(projectId));
  return {
    revision: 0,
    sourceIds: Object.keys(model.sources),
    activityIds: Object.keys(model.activities),
  };
}

function allOtherProjectsExactMatchConfig(): Record<
  string,
  { revision: number; sourceIds: string[]; activityIds: string[] }
> {
  const config: Record<
    string,
    { revision: number; sourceIds: string[]; activityIds: string[] }
  > = {};
  for (const id of OTHER_KF_LIVE_IDS) {
    config[id] = exactMatchConfig(id);
  }
  return config;
}

function alreadyActivatedHandlers(): Record<string, (call: Call) => Response> {
  return {
    "POST /v1/admin/init-db": () =>
      jsonResponse(200, { ok: true, expected: [], found: [] }),
    ...otherKfLiveHandlers(),
    "POST /v1/projects/stewart-v1/import": () =>
      jsonResponse(409, { error: "Project stewart-v1 already exists" }),
    "POST /v1/projects/deboard-v091/seed": () =>
      jsonResponse(409, { error: "DeBoard v0.9.1 is already seeded" }),
    "GET /v1/projects/deboard-v091/events": () =>
      jsonResponse(200, {
        events: [{ id: "deboard-v091-baseline-evidence-2026-08-26" }],
      }),
    "POST /v1/intents:EVIDENCE_PREVIEW": multiProjectEvidencePreviewHandler({
      "stewart-v1": exactMatchConfig("stewart-v1"),
      ...allOtherProjectsExactMatchConfig(),
    }),
    "POST /v1/intents:EVIDENCE_APPLY_SHADOW": () =>
      jsonResponse(200, { replayed: true }),
    "POST /v1/intents:FORECAST_QUERY": succeededIntent,
    "POST /v1/intents:FORECAST_HEALTH_QUERY": succeededIntent,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("activatePilot: idempotent re-run (staging activation is idempotent)", () => {
  it("treats every already-existing project (409) with provable authoritative lineage as already-activated, never retries as a mutation", async () => {
    const { calls } = stubFetch(alreadyActivatedHandlers());
    const rows = await activatePilot(OPTS);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.canonicalRead === "SUCCEEDED")).toBe(true);
    expect(rows.every((r) => r.forecastRead === "SUCCEEDED")).toBe(true);

    // Exactly one import/seed attempt per project -- a 409 is accepted as steady state, never
    // retried or escalated into a second mutating call for the same project.
    const importCalls = calls.filter((c) => c.path.endsWith("/import"));
    expect(importCalls).toHaveLength(6);
    const seedCalls = calls.filter((c) => c.path.endsWith("/seed"));
    expect(seedCalls).toHaveLength(1);
    // Never deletes or overwrites -- no DELETE call, and no second import/seed attempt for any
    // project already proven.
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });
});

// Adversarial test 1 (independent-review correction): a 409 existing project whose content does
// NOT trace back to the authoritative seed -- even though it also answers forecast queries
// successfully -- must never be accepted as activated.
describe("activatePilot: WRONG existing project (409 + placeholder content + successful forecast reads) MUST FAIL", () => {
  it("aborts when the existing project's source ids do not include the authoritative dashboard source id", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_PREVIEW"] =
      multiProjectEvidencePreviewHandler({
        // A placeholder/stale fixture: right activity ids, but a completely unrelated source --
        // never actually derived from the authoritative pilot-seed.ts snapshot.
        "stewart-v1": {
          revision: 0,
          sourceIds: ["some-other-unrelated-source"],
          activityIds: STEWART_AUTHORITATIVE_ACTIVITY_IDS,
        },
        ...allOtherProjectsExactMatchConfig(),
      });
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });

  it("aborts when the existing project is missing an authoritative activity even with the right source id", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_PREVIEW"] =
      multiProjectEvidencePreviewHandler({
        "stewart-v1": {
          revision: 0,
          sourceIds: [STEWART_AUTHORITATIVE_SOURCE_ID],
          // Missing the last authoritative activity -- an incomplete/corrupted placeholder.
          activityIds: STEWART_AUTHORITATIVE_ACTIVITY_IDS.slice(0, -1),
        },
        ...allOtherProjectsExactMatchConfig(),
      });
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });

  it("successful FORECAST_QUERY/FORECAST_HEALTH_QUERY reads alone never override a failed lineage proof (requirement: seven successful forecast reads alone are not sufficient)", async () => {
    // Every read-only query kind succeeds for every project (proving the placeholder is
    // queryable), but the lineage proof for stewart-v1 still fails -- the run must still abort.
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_PREVIEW"] =
      multiProjectEvidencePreviewHandler({
        "stewart-v1": {
          revision: 0,
          sourceIds: ["some-other-unrelated-source"],
          activityIds: STEWART_AUTHORITATIVE_ACTIVITY_IDS,
        },
        ...allOtherProjectsExactMatchConfig(),
      });
    handlers["POST /v1/intents:FORECAST_QUERY"] = succeededIntent;
    handlers["POST /v1/intents:FORECAST_HEALTH_QUERY"] = succeededIntent;
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });
});

// Adversarial test 2: exact authoritative match -> safe idempotent success. (Also covered by the
// "idempotent re-run" describe block above; this one asserts the specific EXACT-match verdict path
// via revision-probe-then-confirm.)
describe("activatePilot: 409 existing project + correct authoritative activation state -> safe idempotent success", () => {
  it("probes the real current revision (via one REVISION_CONFLICT) then confirms an exact source/activity match, and proceeds", async () => {
    const handlers = alreadyActivatedHandlers();
    const { calls } = stubFetch(handlers);
    const rows = await activatePilot(OPTS);
    expect(rows.find((r) => r.projectId === "stewart-v1")?.canonicalRead).toBe(
      "SUCCEEDED",
    );
    const previewCalls = calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        (c.body as { kind?: unknown; projectId?: unknown }).kind ===
          "EVIDENCE_PREVIEW" &&
        (c.body as { projectId?: unknown }).projectId === "stewart-v1",
    );
    // One probe (wrong sentinel revision) + one confirmed read (the real revision) -- never more.
    expect(previewCalls).toHaveLength(2);
    expect(
      (previewCalls[0]?.body as { expectedProjectRevision?: unknown })
        .expectedProjectRevision,
    ).toBe(PROBE_REVISION_SENTINEL);
    expect(
      (previewCalls[1]?.body as { expectedProjectRevision?: unknown })
        .expectedProjectRevision,
    ).toBe(0);
  });
});

// Adversarial test 3: a legitimate newer project state (real PM work layered on top of the
// authoritative seed -- a provable superset) must be preserved, never overwritten, and the run
// still succeeds.
describe("activatePilot: 409 existing project + legitimate newer state with provable lineage -> preserve, succeed without overwrite", () => {
  it("accepts a strict superset of the authoritative source/activity ids as a legitimate descendant", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_PREVIEW"] =
      multiProjectEvidencePreviewHandler({
        "stewart-v1": {
          // A real PM has since advanced this project past the seed's own revision.
          revision: 3,
          sourceIds: [
            STEWART_AUTHORITATIVE_SOURCE_ID,
            "field-report-2026-09-10",
          ],
          activityIds: [
            ...STEWART_AUTHORITATIVE_ACTIVITY_IDS,
            "new_activity_added_after_seed",
          ],
        },
        ...allOtherProjectsExactMatchConfig(),
      });
    const { calls } = stubFetch(handlers);
    const rows = await activatePilot(OPTS);
    expect(rows).toHaveLength(7);
    // No import call beyond the initial 409-triggering attempt -- the newer state is never
    // overwritten by a second/forced import.
    const importCalls = calls.filter(
      (c) => c.path === "/v1/projects/stewart-v1/import",
    );
    expect(importCalls).toHaveLength(1);
  });
});

// Adversarial test 4: newer-looking state (more activities than the seed) whose lineage cannot
// actually be proven (missing the authoritative source) must still abort -- "looks newer" is not
// itself proof of legitimate descent.
describe("activatePilot: 409 existing project + newer-looking state with UNPROVABLE lineage -> abort, never overwrite", () => {
  it("aborts even though the existing project has MORE activities than the authoritative seed, because the authoritative source id is missing", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_PREVIEW"] =
      multiProjectEvidencePreviewHandler({
        "stewart-v1": {
          revision: 5,
          sourceIds: ["totally-unrelated-project-source"],
          activityIds: [
            ...STEWART_AUTHORITATIVE_ACTIVITY_IDS,
            "unrelated_extra_activity",
          ],
        },
        ...allOtherProjectsExactMatchConfig(),
      });
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });
});

describe("activatePilot: DeBoard reconciliation is not duplicated", () => {
  it("treats a replayed:true response as success without ever re-submitting a second reconciliation intent", async () => {
    const { calls } = stubFetch(alreadyActivatedHandlers());
    await activatePilot(OPTS);
    const reconciliationCalls = calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        (c.body as { kind?: unknown } | undefined)?.kind ===
          "EVIDENCE_APPLY_SHADOW",
    );
    expect(reconciliationCalls).toHaveLength(1);
  });

  it("submits the exact same fixed intentId/idempotencyKey every run, never a fresh one", async () => {
    const { calls } = stubFetch(alreadyActivatedHandlers());
    await activatePilot(OPTS);
    const reconciliationCall = calls.find(
      (c) =>
        c.path === "/v1/intents" &&
        (c.body as { kind?: unknown } | undefined)?.kind ===
          "EVIDENCE_APPLY_SHADOW",
    );
    const body = reconciliationCall?.body as
      { intentId?: unknown; idempotencyKey?: unknown } | undefined;
    expect(body?.intentId).toBe("b244404f-93e2-4410-adc8-1eb027cf0635");
    expect(body?.idempotencyKey).toBe("d61605b4-ddea-4244-bd3c-8aee0f1b070a");
  });

  it("aborts before ever attempting reconciliation when DeBoard's existing 409 cannot be proven to be the expected DeBoard lineage", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["GET /v1/projects/deboard-v091/events"] = () =>
      // An unrelated/placeholder project at the deboard-v091 id -- no matching bootstrap event.
      jsonResponse(200, { events: [{ id: "some-unrelated-event" }] });
    const { calls } = stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
    const reconciliationCalls = calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        (c.body as { kind?: unknown } | undefined)?.kind ===
          "EVIDENCE_APPLY_SHADOW",
    );
    expect(reconciliationCalls).toHaveLength(0);
  });
});

describe("activatePilot: aborts clearly on unexpected/conflicting state", () => {
  it("aborts without proceeding when an import call returns an unexpected status", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/projects/stewart-v1/import"] = () =>
      jsonResponse(500, { error: "unexpected D1 failure" });
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });

  it("aborts when a lineage probe itself reports the project does not exist despite the 409", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_PREVIEW"] = (call) => {
      const body = call.body as { projectId?: unknown };
      if (body.projectId === "stewart-v1") return projectNotFoundResponse();
      return multiProjectEvidencePreviewHandler(
        allOtherProjectsExactMatchConfig(),
      )(call);
    };
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });

  it("aborts (never silently reports success) when any project fails its post-activation verification read", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:FORECAST_QUERY"] = (call) =>
      (call.body as { projectId?: unknown }).projectId === "ciurlizza-v1"
        ? jsonResponse(500, { error: "boom" })
        : succeededIntent();
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });
});

describe("activatePilot: fresh activation (nothing exists yet)", () => {
  it("imports all six KF Live projects, seeds DeBoard, and applies reconciliation on a clean environment", async () => {
    const handlers: Record<string, (call: Call) => Response> = {
      "POST /v1/admin/init-db": () =>
        jsonResponse(200, { ok: true, expected: [], found: [] }),
      "POST /v1/projects/deboard-v091/seed": () =>
        jsonResponse(201, { project: {}, stagingOnly: true }),
      "POST /v1/intents:EVIDENCE_APPLY_SHADOW": () => succeededIntent(),
      "POST /v1/intents:FORECAST_QUERY": succeededIntent,
      "POST /v1/intents:FORECAST_HEALTH_QUERY": succeededIntent,
    };
    for (const id of [
      "stewart-v1",
      "swiderski-v1",
      "pratt-v1",
      "carver-v1",
      "ciurlizza-v1",
      "mcmillan-v1",
    ]) {
      handlers[`POST /v1/projects/${id}/import`] = () =>
        jsonResponse(201, { project: {}, stagingOnly: true });
    }
    const { calls } = stubFetch(handlers);
    const rows = await activatePilot(OPTS);
    expect(rows).toHaveLength(7);

    // A fresh 201 import never triggers a lineage probe -- there is nothing to prove identity
    // against.
    const previewCalls = calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        (c.body as { kind?: unknown } | undefined)?.kind === "EVIDENCE_PREVIEW",
    );
    expect(previewCalls).toHaveLength(0);

    // Every import call carries a provenance entry for every activity and constraint id in its
    // own project (the import route's own contract) -- proves this script never sends an
    // incomplete manifest for the real pilot-seed.ts data.
    const importCalls = calls.filter((c) => c.path.endsWith("/import"));
    expect(importCalls).toHaveLength(6);
    for (const call of importCalls) {
      const body = call.body as {
        project: {
          activities: Record<string, unknown>;
          constraints: Record<string, unknown>;
        };
        provenance: Record<string, unknown>;
      };
      for (const id of Object.keys(body.project.activities)) {
        expect(body.provenance).toHaveProperty(id);
      }
      for (const id of Object.keys(body.project.constraints)) {
        expect(body.provenance).toHaveProperty(id);
      }
    }
  });
});
