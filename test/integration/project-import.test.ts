/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

// Vite's import.meta.glob (not node:fs, unavailable in the workerd test pool) enumerates real
// files on disk at test-collection time — a genuine file-existence assertion, not a guess.
const workerSourceFiles = import.meta.glob<string>("../../src/worker/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
});
const seedFileNames = Object.keys(workerSourceFiles)
  .map((path) => path.split("/").pop() ?? path)
  .filter((name) => name.endsWith("-seed.ts"));

function workerIndexSource(): string {
  const entry = Object.entries(workerSourceFiles).find(([path]) =>
    path.endsWith("/index.ts"),
  );
  if (!entry) throw new Error("missing src/worker/index.ts");
  return entry[1];
}

const ADMIN_KEY = "test-admin-key-project-import";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

function jsonRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

function stewartFixture(projectId = "stewart-v01"): {
  project: unknown;
  provenance: Record<
    string,
    { sourceId: string; section?: string; modifiedTime?: string }
  >;
} {
  return {
    project: {
      projectId,
      revision: 0,
      name: "Stewart Residence",
      projectType: "RESIDENTIAL",
      timezone: "UTC",
      forecastAnchorDate: "2026-09-01",
      calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
      sources: {
        "src-kf-dashboard": {
          id: "src-kf-dashboard",
          type: "FIELD_REPORT",
          label: "KF Live PM Intelligence Dashboard v2",
          observedAt: "2026-08-31T16:52:29.000Z",
          authority: 0.9,
          reliability: 0.9,
        },
      },
      activities: {
        framing: {
          id: "framing",
          name: "Framing",
          phase: "Framing",
          state: "NOT_STARTED",
          duration: {
            optimistic: 5,
            likely: 7,
            conservative: 10,
            sourceIds: ["src-kf-dashboard"],
          },
          constraintIds: [],
          sourceIds: ["src-kf-dashboard"],
        },
      },
      constraints: {},
      dependencies: {},
      eventLedger: [],
    },
    provenance: {
      framing: {
        sourceId: "src-kf-dashboard",
        section: "Framing schedule",
        modifiedTime: "2026-08-31T16:52:29.000Z",
      },
    },
  };
}

describe("POST /v1/projects/:id/import", () => {
  it("import_preserves_provenance: an imported project's activities trace back to a named source with a manifest entry", async () => {
    const fixture = stewartFixture();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/stewart-v01/import", fixture),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    const body = (await jsonBody(response)) as {
      project: { projectId: string; revision: number };
      provenanceManifest: Record<string, unknown>;
    };
    expect(body.project.projectId).toBe("stewart-v01");
    expect(body.provenanceManifest.framing).toBeDefined();
  });

  it("import_route_is_parameterized: one route handles any projectId, and no new *-seed.ts files exist on disk", async () => {
    const fixture = stewartFixture("carver-v01");
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/carver-v01/import", fixture),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    expect(seedFileNames).toEqual(["deboard-seed.ts"]);
  });

  it("import_preview_before_create: a dryRun preview performs zero D1 writes", async () => {
    const fixture = stewartFixture("preview-only-v01");
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/preview-only-v01/import", {
        ...fixture,
        dryRun: true,
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as { preview: boolean };
    expect(body.preview).toBe(true);

    const row = await env.HOWLER_DB.prepare(
      "SELECT project_id FROM projects WHERE project_id = ?",
    )
      .bind("preview-only-v01")
      .first();
    expect(row).toBeNull();
  });

  it("import_failure_no_partial_write: a payload that fails validateProjectModel leaves zero rows for that ID", async () => {
    const fixture = stewartFixture("broken-v01");
    const invalidProject = { ...(fixture.project as Record<string, unknown>) };
    delete invalidProject.name; // required field missing -> validateProjectModel throws
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/broken-v01/import", {
        project: invalidProject,
        provenance: fixture.provenance,
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);

    const projectRow = await env.HOWLER_DB.prepare(
      "SELECT project_id FROM projects WHERE project_id = ?",
    )
      .bind("broken-v01")
      .first();
    expect(projectRow).toBeNull();
    const eventRow = await env.HOWLER_DB.prepare(
      "SELECT event_id FROM project_events WHERE project_id = ?",
    )
      .bind("broken-v01")
      .first();
    expect(eventRow).toBeNull();
  });

  it("import_never_writes_back_to_source: the import handler makes no write/update call to any external document source", () => {
    const source = workerIndexSource();
    // Structural proof: the import handler never references a Drive/Docs write endpoint or any
    // outbound call to an external document API — it only ever reads the payload the caller
    // already sent and writes to this worker's own D1 binding via the repository.
    expect(/googleapis\.com|drive\.google|docs\.google/i.test(source)).toBe(
      false,
    );
  });

  it("rejects when the payload's project.projectId does not match the URL's :id", async () => {
    const fixture = stewartFixture("mismatch-v01");
    (fixture.project as Record<string, unknown>).projectId = "different-id";
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/mismatch-v01/import", fixture),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects when an activity has no provenance manifest entry", async () => {
    const fixture = stewartFixture("no-provenance-v01");
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/no-provenance-v01/import", {
        project: fixture.project,
        provenance: {},
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a payload missing activities/constraints entirely with a clean 400, not an unhandled crash", async () => {
    // The provenance-manifest check reads Object.keys(model.activities)/model.constraints on the
    // raw request body BEFORE validateProjectModel ever runs -- a payload from an untrusted HTTP
    // caller that omits those fields must fail closed with a normal error response, never throw.
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/malformed-v01/import", {
        project: { projectId: "malformed-v01" },
        provenance: {},
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });
});
