/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "test-admin-key-v094-safety";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

// `Response.json()` is typed `Promise<any>`; routing it through an explicit `unknown` return type
// here means the casts at each call site narrow from `unknown` (a real narrowing) rather than from
// `any` (which @typescript-eslint/no-unnecessary-type-assertion flags as a no-op).
function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

function post(path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_KEY}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// Reads raw source text at build time via Vite's `?raw` glob import, since the sandboxed Workers
// test runtime has no Node `fs` (nodejs_compat is deliberately not enabled).
function readSource(sources: Record<string, string>, suffix: string): string {
  const entry = Object.entries(sources).find(([modulePath]) =>
    modulePath.endsWith(suffix),
  );
  if (!entry) throw new Error(`missing source file ending in ${suffix}`);
  return entry[1];
}

describe("domain code has no fetch calls", () => {
  const domainSources = import.meta.glob<string>("../../src/domain/**/*.ts", {
    eager: true,
    import: "default",
    query: "?raw",
  });
  const engineSources = import.meta.glob<string>("../../src/engine/**/*.ts", {
    eager: true,
    import: "default",
    query: "?raw",
  });

  it("contains no `fetch(` call anywhere in src/domain", () => {
    for (const [path, source] of Object.entries(domainSources)) {
      expect(source, `${path} must not call fetch()`).not.toMatch(
        /\bfetch\s*\(/,
      );
    }
    expect(Object.keys(domainSources).length).toBeGreaterThan(0);
  });

  it("contains no `fetch(` call anywhere in src/engine", () => {
    for (const [path, source] of Object.entries(engineSources)) {
      expect(source, `${path} must not call fetch()`).not.toMatch(
        /\bfetch\s*\(/,
      );
    }
    expect(Object.keys(engineSources).length).toBeGreaterThan(0);
  });
});

describe("no checked-in worker.js bundle", () => {
  const suspectPaths = import.meta.glob(
    [
      "../../worker.js",
      "../../src/worker.js",
      "../../src/worker/worker.js",
      "../../dist/worker.js",
    ],
    { eager: true },
  );

  it("has no worker.js at any of the historically dangerous locations", () => {
    expect(Object.keys(suspectPaths)).toHaveLength(0);
  });
});

describe("committed Worker/D1 identifiers are unchanged", () => {
  const wranglerSources = import.meta.glob<string>("../../wrangler.jsonc", {
    eager: true,
    import: "default",
    query: "?raw",
  });
  const wrangler = readSource(wranglerSources, "wrangler.jsonc");

  it("targets only the jarvis-voice-staging Worker", () => {
    expect(wrangler).toContain('"name": "jarvis-voice-staging"');
  });

  it("keeps the exact HOWLER_DB binding and database identifiers", () => {
    expect(wrangler).toContain('"binding": "HOWLER_DB"');
    expect(wrangler).toContain(
      '"database_name": "howler-intelligence-staging"',
    );
    expect(wrangler).toContain(
      '"database_id": "b1049979-11cc-4faa-9a94-a0f42f9f4f23"',
    );
  });

  it("keeps HOWLER_MODE committed as shadow", () => {
    expect(wrangler).toContain('"HOWLER_MODE": "shadow"');
  });
});

describe("no route can publish while HOWLER_MODE=shadow", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    await worker.fetch(post("/v1/admin/init-db"), adminEnv());
    await worker.fetch(post("/v1/projects/deboard-v091/seed"), adminEnv());
  });

  it("returns 403 for /events/publish regardless of the reviewToken supplied", async () => {
    const response = await worker.fetch(
      post("/v1/projects/deboard-v091/events/publish", {
        event: {},
        reviewToken: "anything",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(403);
  });

  it("never creates a PUBLISHED forecast_snapshots row, even after preview and apply-shadow activity", async () => {
    const forecastResponse = await worker.fetch(
      new Request("https://example.test/v1/projects/deboard-v091/forecast", {
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
      }),
      adminEnv(),
    );
    const forecast = (await jsonBody(forecastResponse)) as {
      modelRevision: number;
    };
    const previewEvent = {
      id: "safety-test-event-1",
      baseRevision: forecast.modelRevision,
      projectId: "deboard-v091",
      type: "FIELD_UPDATE",
      occurredAt: "2026-08-27T12:00:00.000Z",
      receivedAt: "2026-08-27T12:00:00.000Z",
      sourceIds: [],
      verification: "PM_CONFIRMED",
      impactSeedActivityIds: [],
      mutations: [],
      payload: {},
    };
    const previewResponse = await worker.fetch(
      post("/v1/projects/deboard-v091/events/preview", previewEvent),
      adminEnv(),
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await jsonBody(previewResponse)) as {
      reviewToken: string;
    };
    const applyResponse = await worker.fetch(
      post("/v1/projects/deboard-v091/events/apply-shadow", {
        event: previewEvent,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(applyResponse.status).toBe(201);

    const publishAttempt = await worker.fetch(
      post("/v1/projects/deboard-v091/events/publish", {
        event: previewEvent,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(publishAttempt.status).toBe(403);

    const row = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM forecast_snapshots WHERE status = 'PUBLISHED'",
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });
});

describe("append-only guards remain active on rows the router itself persisted", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    await worker.fetch(post("/v1/admin/init-db"), adminEnv());
    await worker.fetch(post("/v1/projects/deboard-v091/seed"), adminEnv());
  });

  it("rejects UPDATE on project_events rows created via the seed route", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE project_events SET event_type = 'X' WHERE project_id = 'deboard-v091'",
      ).run(),
    ).rejects.toThrow("project_events is append-only");
  });

  it("rejects DELETE on forecast_snapshots rows created via the seed route", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM forecast_snapshots WHERE project_id = 'deboard-v091'",
      ).run(),
    ).rejects.toThrow("forecast_snapshots is append-only");
  });

  it("rejects UPDATE on oversight_reviews rows created via the seed route", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE oversight_reviews SET decision = 'BLOCK' WHERE project_id = 'deboard-v091'",
      ).run(),
    ).rejects.toThrow("oversight_reviews is append-only");
  });
});
