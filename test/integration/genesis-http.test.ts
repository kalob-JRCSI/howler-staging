/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import { synthesizeGenesisField } from "../../src/worker/genesis-field-model";
import type { GenesisProposalV096 } from "../../src/operator/genesis";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "test-admin-key-genesis-http";
const NOW = "2026-09-04T20:00:00.000Z";

const SMITH_INTAKE =
  "Create Smith Residence. 2,800sf remodel. Budget is $310k. Scope is kitchen, primary bath, flooring, windows, electrical service upgrade and HVAC modifications. Demo starts September 14. We already selected Wayland for electrical. Cabinets are still being priced.";

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

function unauthedJsonRequest(
  method: string,
  path: string,
  body?: unknown,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function rawTextRequest(
  method: string,
  path: string,
  rawBody: string,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    body: rawBody,
  });
}

function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

async function tableCount(table: string): Promise<number> {
  const row = await env.HOWLER_DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table}`,
  ).first<{ n: number }>();
  return row?.n ?? -1;
}

async function tableCounts(): Promise<{
  projects: number;
  project_events: number;
  forecast_snapshots: number;
  oversight_reviews: number;
}> {
  // A literal 4-element array of explicit promise expressions (not `.map()` over a plain
  // string array) is what lets TypeScript infer Promise.all's result as a fixed-length tuple
  // here -- `.map()` over `string[]` would return a general `Promise<number>[]`, and
  // destructuring a general array under noUncheckedIndexedAccess widens each element to
  // `number | undefined` even though every branch always resolves to a real number.
  const [projects, project_events, forecast_snapshots, oversight_reviews] =
    await Promise.all([
      tableCount("projects"),
      tableCount("project_events"),
      tableCount("forecast_snapshots"),
      tableCount("oversight_reviews"),
    ]);
  return { projects, project_events, forecast_snapshots, oversight_reviews };
}

async function projectRow(projectId: string): Promise<unknown> {
  return env.HOWLER_DB.prepare(
    "SELECT project_id, name, revision, current_model_json, updated_at FROM projects WHERE project_id = ?",
  )
    .bind(projectId)
    .first();
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

function validProposal(preferredProjectId: string): GenesisProposalV096 {
  return synthesizeGenesisField(SMITH_INTAKE, NOW, preferredProjectId);
}

describe("POST /v1/projects/genesis/preview", () => {
  it("preview happy path: returns the synthesized proposal and writes zero rows", async () => {
    const before = await tableCounts();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", {
        text: SMITH_INTAKE,
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      schemaVersion: string;
      preview: boolean;
      proposal: GenesisProposalV096;
    };
    expect(body.schemaVersion).toBe("0.9.6");
    expect(body.preview).toBe(true);
    expect(body.proposal.projectName).toBe("Smith Residence");
    expect(body.proposal.projectType).toBe("RESIDENTIAL_REMODEL");
    expect(body.proposal.budget?.baseline).toBe(310000);
    const after = await tableCounts();
    expect(after).toEqual(before);
    expect(after).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("preview accepts an optional preferredProjectId and writes zero rows", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", {
        text: SMITH_INTAKE,
        preferredProjectId: "smith-residence-preview",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as {
      proposal: GenesisProposalV096;
    };
    expect(body.proposal.projectId).toBe("smith-residence-preview");
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });
});

describe("POST /v1/projects/genesis/preview: auth", () => {
  it("rejects a request with no Authorization header, writes zero rows", async () => {
    const response = await worker.fetch(
      unauthedJsonRequest("POST", "/v1/projects/genesis/preview", {
        text: SMITH_INTAKE,
      }),
      adminEnv(),
    );
    expect(response.status).toBe(401);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects a request with an invalid admin key, writes zero rows", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("authorization", "Bearer wrong-key");
    const response = await worker.fetch(
      new Request("https://example.test/v1/projects/genesis/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: SMITH_INTAKE }),
      }),
      adminEnv(),
    );
    expect(response.status).toBe(401);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });
});

describe("POST /v1/projects/genesis/preview: malformed input returns 400, never 500", () => {
  it("rejects malformed JSON syntax", async () => {
    const response = await worker.fetch(
      rawTextRequest("POST", "/v1/projects/genesis/preview", "{not valid json"),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a missing body", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview"),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["array body", []],
    ["string body", "just some text"],
    ["null body", null],
    ["number body", 42],
  ])("rejects a %s instead of an object", async (_label, body) => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", body),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a body missing text", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", {}),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["number", 123],
    ["object", { nested: true }],
    ["array", ["a"]],
    ["boolean", true],
  ])("rejects text that is a %s, not a string", async (_label, text) => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", { text }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it.each(["", "   ", "\n\t "])(
    "rejects empty/whitespace-only text: %j",
    async (text) => {
      const response = await worker.fetch(
        jsonRequest("POST", "/v1/projects/genesis/preview", { text }),
        adminEnv(),
      );
      expect(response.status).toBe(400);
    },
  );

  it("rejects a non-string preferredProjectId", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", {
        text: SMITH_INTAKE,
        preferredProjectId: 42,
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("never leaves rows behind after any malformed preview attempt", async () => {
    await worker.fetch(
      rawTextRequest("POST", "/v1/projects/genesis/preview", "{broken"),
      adminEnv(),
    );
    await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", { text: 5 }),
      adminEnv(),
    );
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });
});

describe("POST /v1/projects/genesis/commit: happy path", () => {
  it("builds, forecasts, and persists a revision-0 canonical project, returning 201", async () => {
    const proposal = validProposal("smith-residence-commit");
    const before = await tableCounts();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    const body = (await jsonBody(response)) as {
      schemaVersion: string;
      projectId: string;
      revision: number;
      forecastVersion: number;
      oversightDecision: string;
      publishable: boolean;
      stagingOnly: boolean;
    };
    expect(body.schemaVersion).toBe("0.9.6");
    expect(body.projectId).toBe("smith-residence-commit");
    expect(body.revision).toBe(0);
    expect(typeof body.forecastVersion).toBe("number");
    expect(typeof body.oversightDecision).toBe("string");
    expect(body.publishable).toBe(false);
    expect(body.stagingOnly).toBe(true);

    const after = await tableCounts();
    expect(after.projects).toBe(before.projects + 1);
    expect(after.forecast_snapshots).toBe(before.forecast_snapshots + 1);
    expect(after.oversight_reviews).toBe(before.oversight_reviews + 1);
    // Genesis is initial state, not a fake creation event: zero bootstrap events.
    expect(after.project_events).toBe(before.project_events);

    const row = (await projectRow("smith-residence-commit")) as {
      revision: number;
    } | null;
    expect(row?.revision).toBe(0);
  });
});

describe("POST /v1/projects/genesis/commit: raw runtime discriminator validation", () => {
  it("rejects a body that is not a JSON object", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", []),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a missing proposal field", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", {}),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["string", "not-an-object"],
    ["array", []],
    ["null", null],
    ["number", 7],
  ])(
    "rejects proposal that is a %s, not a plain object",
    async (_label, proposal) => {
      const response = await worker.fetch(
        jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
        adminEnv(),
      );
      expect(response.status).toBe(400);
    },
  );

  it.each([
    ["wrong minor version", "0.9.5"],
    ["wrong major version", "1.0"],
    ["numeric schemaVersion", 96],
  ])("rejects schemaVersion %s", async (_label, schemaVersion) => {
    const proposal = { ...validProposal("schema-bad-1"), schemaVersion };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects a proposal missing schemaVersion entirely", async () => {
    const proposal = validProposal("schema-bad-2") as unknown as Record<
      string,
      unknown
    >;
    delete proposal.schemaVersion;
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("never casts the raw payload before the discriminator check: malformed proposal.schemaVersion never reaches validateGenesisProposal as a false pass", async () => {
    // A schemaVersion of "0.9.6" the literal type expects is only reachable through validated
    // input -- proving the boundary rejects wrong values before any GenesisProposalV096-typed
    // logic runs on them.
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", {
        proposal: { schemaVersion: "0.9.6-beta" },
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /v1/projects/genesis/commit: invalid proposal rejected by validateGenesisProposal", () => {
  it("rejects a missing projectId with useful detail, zero writes", async () => {
    const proposal = { ...validProposal("invalid-1"), projectId: "" };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await jsonBody(response)) as {
      details?: { errors?: string[] };
    };
    expect(body.details?.errors?.some((e) => /projectId/i.test(e))).toBe(true);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects malformed scope (empty baselineScope), zero writes", async () => {
    const proposal = { ...validProposal("invalid-2"), baselineScope: [] };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects an invalid knownDates date, zero writes", async () => {
    const base = validProposal("invalid-3");
    const proposal = {
      ...base,
      knownDates: [
        {
          subjectId: base.baselineScope[0]?.id ?? "demolition",
          kind: "COMMITTED_START" as const,
          date: "2026-13-99",
          label: "bad date",
        },
      ],
    };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects conflicting commitments (duplicate COMMITTED_START for same subject), zero writes", async () => {
    const base = validProposal("invalid-4");
    const subjectId = base.baselineScope[0]?.id ?? "demolition";
    const proposal = {
      ...base,
      knownDates: [
        {
          subjectId,
          kind: "COMMITTED_START" as const,
          date: "2026-09-14",
          label: "start a",
        },
        {
          subjectId,
          kind: "COMMITTED_START" as const,
          date: "2026-10-01",
          label: "start b",
        },
      ],
    };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects a malformed budget (negative baseline), zero writes", async () => {
    const base = validProposal("invalid-5");
    const proposal = {
      ...base,
      budget: { baseline: -100, currency: "USD" },
    };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });

  it("rejects an unsafe reserved scope item id, zero writes", async () => {
    const base = validProposal("invalid-6");
    const proposal = {
      ...base,
      baselineScope: [
        ...base.baselineScope,
        { id: "constructor", label: "Constructor", phase: "General" },
      ],
    };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    expect(await tableCounts()).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });
  });
});

describe("POST /v1/projects/genesis/commit: duplicate project id", () => {
  it("returns 409 and does not mutate the existing project", async () => {
    const proposal = validProposal("duplicate-target");
    const first = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(first.status).toBe(201);

    const before = await projectRow("duplicate-target");
    const beforeCounts = await tableCounts();

    const second = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", {
        proposal: { ...proposal, projectName: "Tampered Name" },
      }),
      adminEnv(),
    );
    expect(second.status).toBe(409);

    const after = await projectRow("duplicate-target");
    expect(after).toEqual(before);
    expect(await tableCounts()).toEqual(beforeCounts);
  });
});

describe("POST /v1/projects/genesis/commit: global route cannot mutate another project", () => {
  it("committing project B leaves control project A byte-for-byte unchanged", async () => {
    const controlProposal = validProposal("control-project-a");
    const controlResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", {
        proposal: controlProposal,
      }),
      adminEnv(),
    );
    expect(controlResponse.status).toBe(201);
    const controlBefore = await projectRow("control-project-a");
    const countsBefore = await tableCounts();

    const otherProposal = validProposal("other-project-b");
    const otherResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", {
        proposal: otherProposal,
      }),
      adminEnv(),
    );
    expect(otherResponse.status).toBe(201);

    const controlAfter = await projectRow("control-project-a");
    expect(controlAfter).toEqual(controlBefore);

    const countsAfter = await tableCounts();
    expect(countsAfter.projects).toBe(countsBefore.projects + 1);
    expect(countsAfter.forecast_snapshots).toBe(
      countsBefore.forecast_snapshots + 1,
    );
    expect(countsAfter.oversight_reviews).toBe(
      countsBefore.oversight_reviews + 1,
    );

    const otherRow = await projectRow("other-project-b");
    expect(otherRow).not.toBeNull();
  });
});

describe("POST /v1/projects/genesis/commit: forecast-only dates never become schedule locks", () => {
  it("a FORECAST_START knownDate does not create a scheduleLock on the persisted activity", async () => {
    const base = validProposal("forecast-only-1");
    const subjectId = base.baselineScope[0]?.id;
    if (!subjectId) throw new Error("test fixture must have a scope item");
    const proposal: GenesisProposalV096 = {
      ...base,
      knownDates: [
        {
          subjectId,
          kind: "FORECAST_START",
          date: "2026-10-01",
          label: `${subjectId} forecast start`,
        },
      ],
    };
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(response.status).toBe(201);

    const row = (await projectRow("forecast-only-1")) as {
      current_model_json: string;
    } | null;
    expect(row).not.toBeNull();
    const model = JSON.parse(row?.current_model_json ?? "{}") as {
      activities: Record<string, { scheduleLock?: unknown }>;
    };
    expect(model.activities[subjectId]?.scheduleLock).toBeUndefined();
  });
});

const APPROVED_CONDITIONS = [
  "Stable",
  "Stable, exposed",
  "At risk",
  "Critical",
];

describe("GET /v1/projects/:id/summary", () => {
  it("reflects the just-committed Smith Residence project, read-only", async () => {
    const proposal = validProposal("smith-residence-summary");
    const commitResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    expect(commitResponse.status).toBe(201);

    const before = await tableCounts();
    const response = await worker.fetch(
      jsonRequest("GET", "/v1/projects/smith-residence-summary/summary"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const summary = (await jsonBody(response)) as {
      projectId: string;
      projectName: string;
      progressPercent: number;
      integrity: { score: number; condition: string; primaryDriver: string };
      budget: { baseline: number | null };
      scope: { id: string; label: string; phase: string }[];
      projectedCompletion: string | null;
      schedule: {
        committed: {
          activityId: string;
          startDate: string | null;
          basis: string;
        }[];
        forecast: { activityId: string; basis: string }[];
      };
    };

    expect(summary.projectId).toBe("smith-residence-summary");
    expect(summary.projectName).toBe("Smith Residence");
    expect(typeof summary.progressPercent).toBe("number");
    expect(Number.isNaN(summary.progressPercent)).toBe(false);
    // A freshly-created Genesis project has every activity NOT_STARTED -- truthfully 0, never a
    // fabricated non-zero value.
    expect(summary.progressPercent).toBe(0);
    expect(typeof summary.integrity.score).toBe("number");
    expect(APPROVED_CONDITIONS).toContain(summary.integrity.condition);
    expect(summary.budget.baseline).toBe(310000);
    expect(summary.scope.map((s) => s.label)).toEqual(
      expect.arrayContaining([
        "Kitchen",
        "Primary bath",
        "Flooring",
        "Windows",
        "Electrical service upgrade",
        "HVAC modifications",
      ]),
    );
    expect(summary.projectedCompletion).not.toBeNull();

    const demolitionCommitted = summary.schedule.committed.find(
      (item) => item.activityId === "demolition",
    );
    expect(demolitionCommitted).toBeDefined();
    expect(demolitionCommitted?.startDate).toBe("2026-09-14");
    expect(demolitionCommitted?.basis).toBe("COMMITTED");
    expect(
      summary.schedule.forecast.some(
        (item) => item.activityId === "demolition",
      ),
    ).toBe(false);

    const after = await tableCounts();
    expect(after).toEqual(before);
  });

  it("returns 404 for a project that does not exist", async () => {
    const response = await worker.fetch(
      jsonRequest("GET", "/v1/projects/does-not-exist/summary"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("rejects an unauthenticated request with the existing auth semantics", async () => {
    const response = await worker.fetch(
      unauthedJsonRequest(
        "GET",
        "/v1/projects/smith-residence-summary/summary",
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("never causes a row-count change of any kind, including on a 404", async () => {
    const proposal = validProposal("summary-zero-write-check");
    await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
      adminEnv(),
    );
    const before = await tableCounts();
    await worker.fetch(
      jsonRequest("GET", "/v1/projects/summary-zero-write-check/summary"),
      adminEnv(),
    );
    await worker.fetch(
      jsonRequest("GET", "/v1/projects/missing-project-xyz/summary"),
      adminEnv(),
    );
    expect(await tableCounts()).toEqual(before);
  });
});
