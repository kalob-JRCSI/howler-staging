import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import type { ProjectModelV094 } from "../../src/domain/types";

const ADMIN_KEY = "test-admin-key-scope-routes";

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

interface ScopeItemRow {
  id: string;
  description: string;
  phase: string;
  status: string;
  included: boolean;
  addedAfterBaseline: boolean;
  baselineDescription: string | null;
  activities: {
    activityId: string;
    activityName: string;
    activityState: string;
  }[];
}

interface ScopePreviewResponse {
  projectRevision: number;
  reviewToken: string;
  historyNote: string;
  clerical: boolean;
  event: { id: string; baseRevision: number };
  persisted: boolean;
}

describe("GET /v1/projects/:id/scope", () => {
  it("returns an honest empty scope for a project with no baseline and no scope items yet", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/scope"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      projectId: string;
      items: ScopeItemRow[];
    };
    expect(body.projectId).toBe("deboard-v091");
    expect(body.items).toEqual([]);
  });

  it("requires the same Bearer admin key as every other /v1 route", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/scope", false),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("404s for an unknown project", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/ghost-project/scope"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /v1/projects/:id/scope/commands/preview", () => {
  it("previews an ADD_SCOPE_ITEM command without persisting it", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ADD_SCOPE_ITEM",
          description: "Exterior lamp-post relocation",
          phase: "Exterior",
        },
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as ScopePreviewResponse;
    expect(body.persisted).toBe(false);
    expect(body.historyNote).toContain("Exterior lamp-post relocation");
    expect(body.clerical).toBe(false);

    const scopeAfter = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    expect(scopeAfter.items).toEqual([]);
  });

  it("marks a clerical command (SET_DESCRIPTION) distinctly from a material one (SET_STATUS)", async () => {
    const addResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ADD_SCOPE_ITEM",
          description: "Custom closet",
          phase: "Finishes",
        },
      }),
      adminEnv(),
    );
    const added = (await jsonBody(addResponse)) as ScopePreviewResponse;
    await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: added.event,
        reviewToken: added.reviewToken,
      }),
      adminEnv(),
    );
    const scope = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    const scopeItemId = scope.items[0]?.id;
    expect(scopeItemId).toBeDefined();

    const clericalResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "SET_DESCRIPTION",
          scopeItemId,
          description: "Walk-in custom closet",
        },
      }),
      adminEnv(),
    );
    expect(
      ((await jsonBody(clericalResponse)) as ScopePreviewResponse).clerical,
    ).toBe(true);

    const materialResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: { kind: "SET_STATUS", scopeItemId, status: "IN_PROGRESS" },
      }),
      adminEnv(),
    );
    expect(
      ((await jsonBody(materialResponse)) as ScopePreviewResponse).clerical,
    ).toBe(false);
  });

  it("rejects a malformed command with 400 and a clear error list, never a raw 500", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: { kind: "ADD_SCOPE_ITEM" },
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await jsonBody(response)) as {
      error: string;
      details?: { errors: string[] };
    };
    expect(body.error).toBe("Invalid scope command");
    expect(body.details?.errors.length).toBeGreaterThan(0);
  });

  it("rejects associating a scope item with an unknown activity", async () => {
    const addResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ADD_SCOPE_ITEM",
          description: "Custom closet",
          phase: "Finishes",
        },
      }),
      adminEnv(),
    );
    const added = (await jsonBody(addResponse)) as ScopePreviewResponse;
    await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: added.event,
        reviewToken: added.reviewToken,
      }),
      adminEnv(),
    );
    const scope = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    const scopeItemId = scope.items[0]?.id;

    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ASSOCIATE_ACTIVITIES",
          scopeItemId,
          activityIds: ["does-not-exist"],
        },
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("requires the same Bearer admin key as every other /v1 route", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/scope/commands/preview",
        {
          command: {
            kind: "ADD_SCOPE_ITEM",
            description: "x",
            phase: "Exterior",
          },
        },
        false,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });
});

describe("preview -> apply-shadow: the full save/confirm/reforecast/history flow for scope", () => {
  it("adds, associates, and changes status of a scope item, each persisting and recording history", async () => {
    const addResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ADD_SCOPE_ITEM",
          description: "Exterior lamp-post relocation",
          phase: "Exterior",
        },
      }),
      adminEnv(),
    );
    const added = (await jsonBody(addResponse)) as ScopePreviewResponse;
    const addApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: added.event,
        reviewToken: added.reviewToken,
      }),
      adminEnv(),
    );
    expect(addApply.status).toBe(201);

    let scope = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    expect(scope.items).toHaveLength(1);
    const scopeItemId = scope.items[0]?.id;
    expect(scopeItemId).toBeDefined();
    expect(scope.items[0]?.addedAfterBaseline).toBe(true);
    expect(scope.items[0]?.baselineDescription).toBeNull();

    const associateResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ASSOCIATE_ACTIVITIES",
          scopeItemId,
          activityIds: ["framing"],
        },
      }),
      adminEnv(),
    );
    const associatePreview = (await jsonBody(
      associateResponse,
    )) as ScopePreviewResponse;
    await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: associatePreview.event,
        reviewToken: associatePreview.reviewToken,
      }),
      adminEnv(),
    );

    const statusResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: { kind: "SET_STATUS", scopeItemId, status: "IN_PROGRESS" },
      }),
      adminEnv(),
    );
    const statusPreview = (await jsonBody(
      statusResponse,
    )) as ScopePreviewResponse;
    const statusApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: statusPreview.event,
        reviewToken: statusPreview.reviewToken,
      }),
      adminEnv(),
    );
    expect(statusApply.status).toBe(201);

    scope = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    expect(scope.items[0]?.status).toBe("IN_PROGRESS");
    expect(scope.items[0]?.activities).toEqual([
      {
        activityId: "framing",
        activityName: "Structural framing + second-floor/loft system",
        activityState: "NOT_STARTED",
      },
    ]);

    const events = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/events?limit=100"),
        adminEnv(),
      ),
    )) as { events: { note?: string }[] };
    expect(
      events.events.some((e) =>
        e.note?.includes("Exterior lamp-post relocation"),
      ),
    ).toBe(true);
    expect(events.events.some((e) => e.note?.includes("IN_PROGRESS"))).toBe(
      true,
    );
  });

  it("deactivates a scope item non-destructively -- it stops appearing in the view but the write succeeds", async () => {
    const addResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ADD_SCOPE_ITEM",
          description: "Shower accent wall",
          phase: "Finishes",
        },
      }),
      adminEnv(),
    );
    const added = (await jsonBody(addResponse)) as ScopePreviewResponse;
    await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: added.event,
        reviewToken: added.reviewToken,
      }),
      adminEnv(),
    );
    const scope = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    const scopeItemId = scope.items[0]?.id;

    const deactivateResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: { kind: "DEACTIVATE_SCOPE_ITEM", scopeItemId },
      }),
      adminEnv(),
    );
    const deactivatePreview = (await jsonBody(
      deactivateResponse,
    )) as ScopePreviewResponse;
    const deactivateApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: deactivatePreview.event,
        reviewToken: deactivatePreview.reviewToken,
      }),
      adminEnv(),
    );
    expect(deactivateApply.status).toBe(201);

    const scopeAfter = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    expect(scopeAfter.items).toEqual([]);
  });

  it("Correction 8: an exact retry of an already-applied event replays the original success instead of a false conflict", async () => {
    const previewResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/scope/commands/preview", {
        command: {
          kind: "ADD_SCOPE_ITEM",
          description: "Custom closet",
          phase: "Finishes",
        },
      }),
      adminEnv(),
    );
    const preview = (await jsonBody(previewResponse)) as ScopePreviewResponse;

    const firstApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(firstApply.status).toBe(201);
    const firstApplied = (await jsonBody(firstApply)) as {
      projectRevision: number;
    };

    const secondApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(secondApply.status).toBe(200);
    const secondApplied = (await jsonBody(secondApply)) as {
      applied: boolean;
      replayed: boolean;
      projectRevision: number;
    };
    expect(secondApplied.applied).toBe(true);
    expect(secondApplied.replayed).toBe(true);
    expect(secondApplied.projectRevision).toBe(firstApplied.projectRevision);

    const scopeAfterRetry = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/scope"),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    expect(
      scopeAfterRetry.items.filter((i) => i.description === "Custom closet"),
    ).toHaveLength(1);
  });

  it("still rejects a genuinely different event whose baseRevision has gone stale, with 409", async () => {
    const firstPreview = (await jsonBody(
      await worker.fetch(
        jsonRequest(
          "POST",
          "/v1/projects/deboard-v091/scope/commands/preview",
          {
            command: {
              kind: "ADD_SCOPE_ITEM",
              description: "Custom closet",
              phase: "Finishes",
            },
          },
        ),
        adminEnv(),
      ),
    )) as ScopePreviewResponse;
    const firstApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: firstPreview.event,
        reviewToken: firstPreview.reviewToken,
      }),
      adminEnv(),
    );
    expect(firstApply.status).toBe(201);

    const secondPreview = (await jsonBody(
      await worker.fetch(
        jsonRequest(
          "POST",
          "/v1/projects/deboard-v091/scope/commands/preview",
          {
            command: {
              kind: "ADD_SCOPE_ITEM",
              description: "Custom mudroom bench",
              phase: "Finishes",
            },
          },
        ),
        adminEnv(),
      ),
    )) as ScopePreviewResponse;
    expect(secondPreview.event.id).not.toBe(firstPreview.event.id);
    const staleEvent = {
      ...secondPreview.event,
      baseRevision: firstPreview.projectRevision,
    };
    const secondApply = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
        event: staleEvent,
        reviewToken: secondPreview.reviewToken,
      }),
      adminEnv(),
    );
    expect(secondApply.status).toBe(409);
  });
});

describe("baseline vs current scope, at the HTTP level", () => {
  const PROJECT_ID = "baseline-fixture-v1";

  function minimalModelWithBaseline(): ProjectModelV094 {
    return {
      projectId: PROJECT_ID,
      revision: 0,
      name: "Baseline Fixture",
      projectType: "RESIDENTIAL",
      timezone: "UTC",
      forecastAnchorDate: "2026-01-01",
      calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
      sources: {},
      activities: {
        tile: {
          id: "tile",
          name: "Master shower tile",
          phase: "Finishes",
          state: "NOT_STARTED",
          duration: {
            optimistic: 2,
            likely: 3,
            conservative: 5,
            sourceIds: [],
          },
          constraintIds: [],
          sourceIds: [],
        },
      },
      constraints: {},
      dependencies: {},
      eventLedger: [],
      projectProfile: {
        baselineScope: [
          { id: "tile", label: "Master shower tile", phase: "Finishes" },
        ],
      },
    };
  }

  beforeEach(async () => {
    const model = minimalModelWithBaseline();
    await env.HOWLER_DB.prepare(
      `INSERT INTO projects (project_id, name, revision, current_model_json, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
    )
      .bind(
        PROJECT_ID,
        model.name,
        JSON.stringify(model),
        "2026-01-01T00:00:00.000Z",
      )
      .run();
  });

  it("shows a real Genesis-style baseline item transiently, with its free activity default, before any edit", async () => {
    const response = await worker.fetch(
      plainRequest("GET", `/v1/projects/${PROJECT_ID}/scope`),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as { items: ScopeItemRow[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "tile",
      description: "Master shower tile",
      addedAfterBaseline: false,
      baselineDescription: "Master shower tile",
    });
    expect(body.items[0]?.activities).toEqual([
      {
        activityId: "tile",
        activityName: "Master shower tile",
        activityState: "NOT_STARTED",
      },
    ]);
  });

  it("materializes the baseline item on first edit, preserving baseline for comparison", async () => {
    const previewResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${PROJECT_ID}/scope/commands/preview`, {
        command: {
          kind: "SET_DESCRIPTION",
          scopeItemId: "tile",
          description: "Hall bathroom tile",
        },
      }),
      adminEnv(),
    );
    const preview = (await jsonBody(previewResponse)) as ScopePreviewResponse;
    const applyResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${PROJECT_ID}/events/apply-shadow`, {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(applyResponse.status).toBe(201);

    const scope = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", `/v1/projects/${PROJECT_ID}/scope`),
        adminEnv(),
      ),
    )) as { items: ScopeItemRow[] };
    expect(scope.items[0]?.description).toBe("Hall bathroom tile");
    expect(scope.items[0]?.baselineDescription).toBe("Master shower tile");
    expect(scope.items[0]?.addedAfterBaseline).toBe(false);
  });
});
