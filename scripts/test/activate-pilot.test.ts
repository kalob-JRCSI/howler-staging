// Pilot activation (Phase 2 requirement #5 -- "This is critical"), requirement #9 minimum tests:
// "staging activation is idempotent", "DeBoard reconciliation is not duplicated", "activation
// refuses unsafe conflicting newer state", "seven-project verification checks actual D1 reads".
//
// Plain-Node unit tests (see ../vitest.config.ts) driving activatePilot() against a stubbed
// global fetch -- proves the orchestration logic itself (how this script interprets each HTTP
// response), not the underlying domain data, which test/unit/pilot-seed.test.ts and
// test/integration/deboard-reconciliation.test.ts already cover in full through the real HTTP
// boundary.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activatePilot } from "../activate-pilot";

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

/** Routes a stubbed fetch by (method, pathname) exact match; records every call made. */
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
        // Query intents all share one path -- dispatch those by kind instead.
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

/** A fully "already activated" world: every import/seed call is a 409, the reconciliation intent
 * comes back replayed, and every verification query succeeds -- the steady-state a second run of
 * this script should reach. */
function alreadyActivatedHandlers(): Record<string, (call: Call) => Response> {
  return {
    "POST /v1/admin/init-db": () =>
      jsonResponse(200, { ok: true, expected: [], found: [] }),
    "POST /v1/projects/stewart-v1/import": () =>
      jsonResponse(409, { error: "Project stewart-v1 already exists" }),
    "POST /v1/projects/swiderski-v1/import": () =>
      jsonResponse(409, { error: "already exists" }),
    "POST /v1/projects/pratt-v1/import": () =>
      jsonResponse(409, { error: "already exists" }),
    "POST /v1/projects/carver-v1/import": () =>
      jsonResponse(409, { error: "already exists" }),
    "POST /v1/projects/ciurlizza-v1/import": () =>
      jsonResponse(409, { error: "already exists" }),
    "POST /v1/projects/mcmillan-v1/import": () =>
      jsonResponse(409, { error: "already exists" }),
    "POST /v1/projects/deboard-v091/seed": () =>
      jsonResponse(409, { error: "DeBoard v0.9.1 is already seeded" }),
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
  it("treats every already-existing project (409) as already-activated, never retries as a mutation", async () => {
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
});

describe("activatePilot: aborts clearly on unexpected/conflicting state", () => {
  it("aborts without proceeding when an import call returns an unexpected status", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/projects/stewart-v1/import"] = () =>
      jsonResponse(500, { error: "unexpected D1 failure" });
    stubFetch(handlers);
    await expect(activatePilot(OPTS)).rejects.toThrow();
  });

  it("aborts when the reconciliation intent comes back BLOCKED instead of SUCCEEDED or replayed", async () => {
    const handlers = alreadyActivatedHandlers();
    handlers["POST /v1/intents:EVIDENCE_APPLY_SHADOW"] = () =>
      jsonResponse(200, {
        run: { state: "BLOCKED" },
        result: { status: "BLOCKED", problem: { code: "REVISION_CONFLICT" } },
      });
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
