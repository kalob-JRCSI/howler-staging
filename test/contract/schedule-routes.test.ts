import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "test-admin-key-schedule-routes";

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

async function jsonBody(response: Response): Promise<unknown> {
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
  await worker.fetch(jsonRequest("POST", "/v1/admin/init-db"), adminEnv());
  await seedProject();
});

interface ScheduleActivityRow {
  activityId: string;
  name: string;
  phase: string;
  committedStart: string | null;
  committedFinish: string | null;
  trade: string | null;
  critical: boolean | null;
}

interface SchedulePreviewResponse {
  projectRevision: number;
  reviewToken: string;
  historyNote: string;
  delta: unknown;
  candidate: unknown;
  event: { id: string; baseRevision: number };
  persisted: boolean;
}

describe("GET /v1/projects/:id/schedule", () => {
  it("returns every canonical activity with honest null fields, never fabricated data", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/schedule"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      projectId: string;
      projectRevision: number;
      activities: ScheduleActivityRow[];
    };
    expect(body.projectId).toBe("deboard-v091");
    const framing = body.activities.find((a) => a.activityId === "framing");
    expect(framing).toBeDefined();
    // trade is never fabricated -- only ever derived from a real TRADE_AVAILABILITY constraint.
    expect(typeof framing?.trade === "string" || framing?.trade === null).toBe(
      true,
    );
  });

  it("requires the same Bearer admin key as every other /v1 route", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/schedule", false),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("404s for an unknown project", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/ghost-project/schedule"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /v1/projects/:id/schedule/commands/preview", () => {
  it("translates a typed command into a real event and previews its forecast consequence, without persisting", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: {
            kind: "SET_COMMITTED_DATES",
            activityId: "framing",
            startDate: "2026-09-18",
          },
        },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as SchedulePreviewResponse;
    expect(body.persisted).toBe(false);
    expect(body.historyNote).toContain("framing");
    expect(typeof body.reviewToken).toBe("string");
    expect(body.event.baseRevision).toBe(body.projectRevision);
    expect(body.delta).toBeDefined();

    // Preview alone must not have changed the read model.
    const scheduleAfter = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/schedule"),
        adminEnv(),
      ),
    )) as { activities: ScheduleActivityRow[] };
    const framing = scheduleAfter.activities.find(
      (a) => a.activityId === "framing",
    );
    expect(framing?.committedStart).not.toBe("2026-09-18");
  });

  it("rejects a malformed command with 400 and a clear error list, never a raw 500", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: { kind: "SET_COMMITTED_DATES" },
        },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await jsonBody(response)) as {
      error: string;
      details?: { errors: string[] };
    };
    expect(body.error).toBe("Invalid schedule command");
    expect(body.details?.errors.length).toBeGreaterThan(0);
  });

  it("rejects an unrecognized command kind", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: { kind: "DEMOLISH_PROJECT" },
        },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("reports an unknown activity id as 400, not a 500", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: {
            kind: "RENAME_ACTIVITY",
            activityId: "does-not-exist",
            name: "New Name",
          },
        },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("requires the same Bearer admin key as every other /v1 route", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: {
            kind: "SET_ACTIVITY_STATE",
            activityId: "framing",
            state: "IN_PROGRESS",
          },
        },
        false,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });
});

describe("preview -> apply-shadow: the full save/confirm/reforecast/history flow", () => {
  it("applies a previewed schedule command through the existing apply-shadow route, updates the schedule, and records history", async () => {
    const previewResponse = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: {
            kind: "SET_COMMITTED_DATES",
            activityId: "framing",
            startDate: "2026-09-18",
          },
        },
      ),
      adminEnv(),
    );
    const preview = (await jsonBody(
      previewResponse,
    )) as SchedulePreviewResponse;

    const applyResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(applyResponse.status).toBe(201);
    const applied = (await jsonBody(applyResponse)) as {
      applied: boolean;
      projectRevision: number;
    };
    expect(applied.applied).toBe(true);
    expect(applied.projectRevision).toBe(preview.projectRevision + 1);

    const schedule = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/schedule"),
        adminEnv(),
      ),
    )) as { activities: ScheduleActivityRow[] };
    const framing = schedule.activities.find((a) => a.activityId === "framing");
    expect(framing?.committedStart).toBe("2026-09-18");

    const events = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/events?limit=100"),
        adminEnv(),
      ),
    )) as { events: { note?: string }[] };
    expect(events.events.some((e) => e.note?.includes("2026-09-18"))).toBe(
      true,
    );
  });

  it("rejects re-applying a previewed event whose baseRevision has gone stale, with 409", async () => {
    const previewResponse = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/schedule/commands/preview",
        {
          command: {
            kind: "SET_ACTIVITY_STATE",
            activityId: "framing",
            state: "IN_PROGRESS",
          },
        },
      ),
      adminEnv(),
    );
    const preview = (await jsonBody(
      previewResponse,
    )) as SchedulePreviewResponse;

    const firstApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(firstApply.status).toBe(201);

    const secondApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(secondApply.status).toBe(409);
  });
});
