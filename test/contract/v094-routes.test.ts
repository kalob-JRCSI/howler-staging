/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
  introspectSchemaObjects,
  parseFixtureStatements,
} from "../helpers/d1";

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
});

function fixture(fileName: string): unknown {
  const entry = Object.entries(fixtureSources).find(([modulePath]) =>
    modulePath.endsWith(`/${fileName}`),
  );
  if (!entry) throw new Error(`missing fixture ${fileName}`);
  return JSON.parse(entry[1]);
}

// Task 12: local loader for the operator migration file, mirroring test/helpers/d1.ts's own
// baselineMigrationSql() pattern without adding a new export there (out of Task 12's file list).
const operatorMigrationSources = import.meta.glob<string>(
  "../../migrations/*.sql",
  { eager: true, import: "default", query: "?raw" },
);

function operatorMigrationSql(): string {
  const entry = Object.entries(operatorMigrationSources).find(([modulePath]) =>
    modulePath.endsWith("/0002_operator_runs.sql"),
  );
  if (!entry) throw new Error("missing migration 0002_operator_runs.sql");
  return entry[1];
}

interface RouteContract {
  method: string;
  pathPattern: string;
  examplePath: string;
  authentication: string;
}

const routeContracts = fixture("route-contracts.json") as {
  routeCount: number;
  routes: RouteContract[];
};

const ADMIN_KEY = "test-admin-key-v094-routes";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  authed = true,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authed) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function plainRequest(method: string, path: string, authed = true): Request {
  const headers = new Headers();
  if (authed) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, { method, headers });
}

// `Response.json()` is typed `Promise<any>`; routing it through an explicit `unknown` return type
// here means the casts at each call site narrow from `unknown` (a real narrowing) rather than from
// `any` (which @typescript-eslint/no-unnecessary-type-assertion flags as a no-op).
function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

async function seedProject(): Promise<void> {
  const response = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
    adminEnv(),
  );
  expect(response.status).toBe(201);
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

describe("v0.9.4 route inventory", () => {
  it("matches the frozen 14-route contract fixture exactly", () => {
    expect(routeContracts.routeCount).toBe(14);
    expect(routeContracts.routes).toHaveLength(14);
  });
});

describe("GET / and GET /admin", () => {
  it("are public and return the admin HTML page with the frozen security headers", async () => {
    for (const path of ["/", "/admin"]) {
      const response = await worker.fetch(
        plainRequest("GET", path, false),
        adminEnv(),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });
});

describe("GET /health", () => {
  it("is public and reports the approved v0.9.5 diagnostic shape", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/health", false),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "ok",
        "service",
        "mode",
        "version",
        "database",
        "adminConfigured",
        "liveSystemsConnected",
        "engineCompatibilityVersion",
        "dashboardConnected",
        "calendarConnected",
      ].sort(),
    );
    expect(body.service).toBe("howler-scheduling-staging");
    expect(body.mode).toBe("shadow");
    expect(body.version).toBe("0.9.5");
    expect(body.engineCompatibilityVersion).toBe("0.9.4");
    expect(body.liveSystemsConnected).toBe(false);
    expect(body.dashboardConnected).toBe(false);
    expect(body.calendarConnected).toBe(false);
    expect(body.adminConfigured).toBe(true);
  });

  it("requires no authorization header at all", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/health"),
      env,
    );
    expect(response.status).toBe(200);
  });
});

describe("every /v1 route requires Bearer HOWLER_ADMIN_KEY before any work", () => {
  it.each(
    routeContracts.routes.filter((route) =>
      route.pathPattern.startsWith("/v1"),
    ),
  )("rejects $method $pathPattern with 401 and no admin key", async (route) => {
    const path = route.examplePath.split("?")[0] ?? route.examplePath;
    const response = await worker.fetch(
      route.method === "GET"
        ? plainRequest(route.method, path, false)
        : jsonRequest(route.method, path, {}, false),
      adminEnv(),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("performs no persistence when the seed route is called unauthenticated", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/seed", undefined, false),
      adminEnv(),
    );
    expect(response.status).toBe(401);
    const check = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
      adminEnv(),
    );
    // If the unauthenticated call above had persisted anything, the seed would now conflict.
    expect(check.status).toBe(201);
  });

  it("returns 500 when HOWLER_ADMIN_KEY is not configured at all, even with a bearer token supplied", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/forecast"),
      env,
    );
    expect(response.status).toBe(500);
  });
});

describe("POST /v1/admin/init-db", () => {
  it("initializes the schema and reports the exact expected/found table set", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/admin/init-db"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      ok: boolean;
      expected: string[];
      found: string[];
      statementsApplied: number;
      stagingOnly: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.found.slice().sort()).toEqual(body.expected.slice().sort());
    expect(body.statementsApplied).toBe(19);
    expect(body.stagingOnly).toBe(true);
  });

  it("produces a schema semantically identical to migrations/0001_v094_baseline.sql (no drift between the router's inline statements and the migration file)", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/admin/init-db"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const live = await introspectSchemaObjects(env.HOWLER_DB);
    const expectedStatements = parseFixtureStatements(baselineMigrationSql());
    // init-db now also applies the additive operator schema (Task 12), so `live` legitimately
    // contains more than just the 19 v0.9.4 objects — assert every v0.9.4 object is still present
    // (drift-free) rather than asserting the *total* count equals only the v0.9.4 count.
    for (const expectedSql of expectedStatements) {
      expect(live.map((object) => object.sql)).toContain(expectedSql);
    }
  });

  it("produces an operator schema semantically identical to migrations/0002_operator_runs.sql (no drift between the router's inline statements and the migration file)", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/admin/init-db"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const live = await introspectSchemaObjects(env.HOWLER_DB);
    const expectedStatements = parseFixtureStatements(operatorMigrationSql());
    for (const expectedSql of expectedStatements) {
      expect(live.map((object) => object.sql)).toContain(expectedSql);
    }
  });

  it("reports additive operatorSchema readiness without altering any existing v0.9.4 field", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/admin/init-db"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      ok: boolean;
      expected: string[];
      found: string[];
      statementsApplied: number;
      operatorSchema: { ok: boolean; expected: string[]; found: string[] };
      stagingOnly: boolean;
    };
    // Existing v0.9.4 fields are byte-for-byte unchanged from Task 9.
    expect(body.ok).toBe(true);
    expect(body.found.slice().sort()).toEqual(body.expected.slice().sort());
    expect(body.statementsApplied).toBe(19);
    expect(body.stagingOnly).toBe(true);
    // New, purely additive field.
    expect(body.operatorSchema.ok).toBe(true);
    expect(body.operatorSchema.found.slice().sort()).toEqual(
      body.operatorSchema.expected.slice().sort(),
    );
    expect(body.operatorSchema.expected.slice().sort()).toEqual(
      [
        "operator_intents",
        "workflow_runs",
        "workflow_steps",
        "workflow_results",
      ].sort(),
    );
  });

  it("is idempotent: reapplying does not delete or duplicate existing data", async () => {
    await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
    await seedProject();
    const second = await worker.fetch(
      jsonRequest("POST", "/v1/admin/init-db"),
      adminEnv(),
    );
    expect(second.status).toBe(200);
    const forecast = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/forecast"),
      adminEnv(),
    );
    expect(forecast.status).toBe(200);
  });
});

describe("POST /v1/projects/deboard-v091/seed", () => {
  beforeEach(async () => {
    await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
  });

  it("seeds the DeBoard model with the exact v0.9.4 response contract", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "project",
      "initialForecast",
      "oversight",
      "forecastable",
      "commitmentEligible",
      "oversightPublishable",
      "publishable",
      "stagingOnly",
    ]);
    expect(body.publishable).toBe(false);
    expect(body.stagingOnly).toBe(true);
  });

  it("rejects a second seed with 409", async () => {
    await seedProject();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
      adminEnv(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "DeBoard v0.9.1 is already seeded",
    });
  });
});

describe("project-scoped read routes", () => {
  beforeEach(async () => {
    await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
    await seedProject();
  });

  it("GET forecast returns modelRevision/latest (published omitted until publish, which shadow mode never reaches)", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/forecast"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    // `json()` serializes with JSON.stringify, which drops keys whose value is `undefined` — so
    // `published` (never set in shadow mode, since publish always 403s) is absent, not `null`.
    expect(Object.keys(body)).toEqual(["modelRevision", "latest"]);
    expect(body.modelRevision).toBe(1);
  });

  it("GET forecast/health returns the project health summary contract", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/forecast/health"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "projectId",
      "revision",
      "forecastVersion",
      "completion",
      "meanForecastConfidence",
      "openConflicts",
      "blockedConstraints",
      "unverifiedHardConstraints",
      "lowCoverage",
      "accuracyByHorizon",
    ]);
  });

  it("GET forecast/recovery returns the recovery/protection contract", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/forecast/recovery"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "projectId",
      "projectRevision",
      "latestVersion",
      "baselineVersion",
      "recovery",
      "recoveryLayer",
      "publicationGate",
      "stagingOnly",
    ]);
    expect(body.publicationGate).toEqual({
      forecastAllowed: true,
      commitmentEligible: false,
      publishable: false,
      mode: "shadow",
    });
  });

  it("GET events returns the seed's bootstrap evidence event", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/events?limit=100"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      events: { id: string; type: string }[];
    };
    // The DeBoard seed model carries exactly one bootstrap evidence event in its ledger
    // (revision 1 after seeding), which the seed route persists as a real project_events row.
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.id).toBe(
      "deboard-v091-baseline-evidence-2026-08-26",
    );
    expect(body.events[0]?.type).toBe("BASELINE_EVIDENCE");
  });

  it("GET learning returns the learning-record contract", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/learning"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ learning: [] });
  });
});

describe("POST .../understanding/preview", () => {
  beforeEach(async () => {
    await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
    await seedProject();
  });

  it("accepts a well-formed proposal (valid: true) and returns the constructed event", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/understanding/preview", {
        eventId: "e1",
        baseRevision: 1,
        projectId: "deboard-v091",
        eventType: "FIELD_UPDATE",
        occurredAt: "2026-08-27T12:00:00.000Z",
        receivedAt: "2026-08-27T12:00:00.000Z",
        sourceIds: ["src-plans"],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: [],
        mutations: [],
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["valid", "errors", "warnings", "event"]);
    expect(body.valid).toBe(true);
  });

  it("rejects a malformed proposal (valid: false, no event field) with the validation contract", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/understanding/preview", {
        eventId: "",
        baseRevision: 1,
        projectId: "deboard-v091",
        eventType: "FIELD_UPDATE",
        occurredAt: "2026-08-27T12:00:00.000Z",
        receivedAt: "2026-08-27T12:00:00.000Z",
        sourceIds: [],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: [],
        mutations: [],
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["valid", "errors", "warnings"]);
    expect(body.valid).toBe(false);
  });

  it("rejects a projectId mismatch between body and URL with 400", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/understanding/preview", {
        eventId: "e1",
        baseRevision: 1,
        projectId: "other-project",
        eventType: "FIELD_UPDATE",
        occurredAt: "2026-08-27T12:00:00.000Z",
        receivedAt: "2026-08-27T12:00:00.000Z",
        sourceIds: [],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: [],
        mutations: [],
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Understanding proposal projectId does not match URL project ID",
    });
  });
});

describe("bounded JSON body rejection on a real POST route", () => {
  beforeEach(async () => {
    await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
    await seedProject();
  });

  it("rejects an oversized events/preview body with 413", async () => {
    const oversized = {
      padding: "x".repeat(256 * 1024 + 1),
    };
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/events/preview",
        oversized,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(413);
  });
});

describe("POST .../events/publish while HOWLER_MODE=shadow", () => {
  beforeEach(async () => {
    await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
    await seedProject();
  });

  it("always returns 403 in committed shadow mode, regardless of body", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/publish", {
        event: {},
        reviewToken: "irrelevant",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Publishing is disabled while HOWLER_MODE=shadow",
    });
  });

  it("returns 403 before touching the request body at all (auth and mode gates run first)", async () => {
    const response = await worker.fetch(
      new Request(
        "https://example.test/v1/projects/deboard-v091/events/publish",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${ADMIN_KEY}`,
            "content-type": "application/json",
          },
          body: "{not valid json",
        },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(403);
  });
});

describe("unregistered routes", () => {
  it("returns 404 for an unknown path under /v1", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/nope"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("returns 404 for an unknown top-level path", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/nope", false),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });
});
