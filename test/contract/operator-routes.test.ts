/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import { D1HowlerRepository } from "../../src/worker/repository";
import { validateIntent } from "../../src/operator/intent";
import type { IntentV1 } from "../../src/operator/intent";
import {
  TransientRepositoryReadError,
  executeWorkflow,
} from "../../src/operator/workflow";
import type {
  AuthorizationAttestation,
  WorkflowExecutorDeps,
  WorkflowExecutorRepository,
} from "../../src/operator/workflow";

const operatorMigrationSources = import.meta.glob<string>(
  "../../migrations/*.sql",
  { eager: true, import: "default", query: "?raw" },
);
function operatorMigrationSql(): string {
  const entry = Object.entries(operatorMigrationSources).find(([p]) =>
    p.endsWith("/0002_operator_runs.sql"),
  );
  if (!entry) throw new Error("missing migration 0002_operator_runs.sql");
  return entry[1];
}

const ADMIN_KEY = "test-admin-key-operator-routes";
const PROJECT_ID = "deboard-v091";

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

function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

async function seedProject(): Promise<void> {
  const response = await worker.fetch(
    jsonRequest("POST", `/v1/projects/${PROJECT_ID}/seed`),
    adminEnv(),
  );
  expect(response.status).toBe(201);
}

function forecastQueryIntent(overrides: Partial<IntentV1> = {}): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "key-op-routes-1",
    projectId: PROJECT_ID,
    kind: "FORECAST_QUERY",
    requestedEffect: "READ_ONLY",
    expectedProjectRevision: null,
    submittedAt: "2026-08-30T13:00:00.000Z",
    source: { channel: "API" },
    payload: { type: "QUERY" },
    ...overrides,
  };
  const result = validateIntent(candidate);
  if (!result.valid) {
    throw new Error(
      `test fixture is not a valid intent: ${JSON.stringify(result.problems)}`,
    );
  }
  return result.intent;
}

function stalePreviewIntent(overrides: Partial<IntentV1> = {}): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "key-op-routes-stale",
    projectId: PROJECT_ID,
    kind: "EVIDENCE_PREVIEW",
    requestedEffect: "PREVIEW",
    expectedProjectRevision: 999,
    submittedAt: "2026-08-30T13:00:00.000Z",
    source: { channel: "API" },
    payload: {
      type: "EVIDENCE",
      event: {
        id: "evt-op-routes-stale",
        baseRevision: 999,
        projectId: PROJECT_ID,
        type: "FIELD_UPDATE",
        occurredAt: "2026-08-30T13:00:00.000Z",
        receivedAt: "2026-08-30T13:00:00.000Z",
        sourceIds: [],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: ["masonry"],
        mutations: [],
        payload: {},
      },
    },
    ...overrides,
  };
  const result = validateIntent(candidate);
  if (!result.valid) {
    throw new Error(
      `test fixture is not a valid intent: ${JSON.stringify(result.problems)}`,
    );
  }
  return result.intent;
}

const AUTHORIZATION: AuthorizationAttestation = {
  authenticated: true,
  mode: "shadow",
  workerName: "jarvis-voice-staging",
};

/** Delegates every method to the real repository, failing `loadProject` transiently N times. */
function flakyRepo(
  repo: D1HowlerRepository,
  failuresBeforeSuccess: number,
): WorkflowExecutorRepository {
  let calls = 0;
  return {
    claimIntent: repo.claimIntent.bind(repo),
    loadWorkflowRun: repo.loadWorkflowRun.bind(repo),
    updateWorkflowRunState: repo.updateWorkflowRunState.bind(repo),
    finalizeWorkflowRun: repo.finalizeWorkflowRun.bind(repo),
    finalizeWorkflowRunStep: repo.finalizeWorkflowRunStep.bind(repo),
    loadWorkflowResult: repo.loadWorkflowResult.bind(repo),
    loadWorkflowStep: repo.loadWorkflowStep.bind(repo),
    ensureWorkflowStep: repo.ensureWorkflowStep.bind(repo),
    startWorkflowStep: repo.startWorkflowStep.bind(repo),
    completeWorkflowStep: repo.completeWorkflowStep.bind(repo),
    skipWorkflowStep: repo.skipWorkflowStep.bind(repo),
    failWorkflowStep: repo.failWorkflowStep.bind(repo),
    loadProject: async (projectId: string) => {
      calls += 1;
      if (calls <= failuresBeforeSuccess) {
        throw new TransientRepositoryReadError();
      }
      return repo.loadProject(projectId);
    },
    loadLatestForecast: repo.loadLatestForecast.bind(repo),
    loadLatestPublishedForecast: repo.loadLatestPublishedForecast.bind(repo),
    loadForecastById: repo.loadForecastById.bind(repo),
    loadPredictionOutcomes: repo.loadPredictionOutcomes.bind(repo),
    commitShadowTransition: repo.commitShadowTransition.bind(repo),
    loadEventById: repo.loadEventById.bind(repo),
    loadOversightReviewById: repo.loadOversightReviewById.bind(repo),
  };
}

/** Creates a genuinely INTERRUPTED run directly through the executor (Task 13/14 machinery),
 * bypassing HTTP, so HTTP-layer tests can assert on the *mapping* of an already-interrupted
 * precondition without re-proving the interruption mechanism itself. */
async function createInterruptedRun(intent: IntentV1): Promise<void> {
  const repo = new D1HowlerRepository(env.HOWLER_DB);
  const deps: WorkflowExecutorDeps = {
    repo: flakyRepo(repo, Infinity),
    clock: { now: () => new Date("2026-08-30T13:00:00.000Z") },
    workflowIds: { next: () => crypto.randomUUID() },
    resultIds: { next: () => crypto.randomUUID() },
    authorization: AUTHORIZATION,
  };
  const outcome = await executeWorkflow(deps, intent);
  expect(outcome.outcome).toBe("INTERRUPTED");
}

describe("every new /v1 operator route requires Bearer auth before any work", () => {
  it.each([
    ["POST", "/v1/intents"],
    ["GET", "/v1/workflows/wf-unknown"],
    ["GET", "/v1/results/result-unknown"],
    ["POST", "/v1/workflows/wf-unknown/resume"],
  ])(
    "rejects unauthenticated %s %s with 401 before any parse/persist",
    async (method, path) => {
      const response =
        method === "GET"
          ? await worker.fetch(plainRequest(method, path, false), adminEnv())
          : await worker.fetch(
              jsonRequest(method, path, "not json", false),
              adminEnv(),
            );
      expect(response.status).toBe(401);
      expect(await jsonBody(response)).toEqual({ error: "Unauthorized" });

      const runCount = await env.HOWLER_DB.prepare(
        "SELECT COUNT(*) AS count FROM workflow_runs",
      ).first<{ count: number }>();
      expect(runCount?.count).toBe(0);
    },
  );
});

describe("POST /v1/intents", () => {
  it("executes a valid FORECAST_QUERY intent and returns 201 for a newly completed run", async () => {
    await seedProject();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/intents", forecastQueryIntent()),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    const body = (await jsonBody(response)) as {
      replayed: boolean;
      run: { state: string; workflowId: string };
      result: { status: string; resultId: string };
    };
    expect(body.replayed).toBe(false);
    expect(body.run.state).toBe("SUCCEEDED");
    expect(body.result.status).toBe("SUCCEEDED");
  });

  it("returns 200 with the identical result for a deterministic duplicate/replay", async () => {
    await seedProject();
    const intent = forecastQueryIntent();
    const first = await worker.fetch(
      jsonRequest("POST", "/v1/intents", intent),
      adminEnv(),
    );
    expect(first.status).toBe(201);
    const firstBody = (await jsonBody(first)) as {
      result: { resultId: string };
    };

    const second = await worker.fetch(
      jsonRequest("POST", "/v1/intents", intent),
      adminEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = (await jsonBody(second)) as {
      replayed: boolean;
      result: { resultId: string };
    };
    expect(secondBody.replayed).toBe(true);
    expect(secondBody.result.resultId).toBe(firstBody.result.resultId);

    const resultCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount?.count).toBe(1);
  });

  it("rejects malformed JSON with 400 and no persistence", async () => {
    await seedProject();
    const response = await worker.fetch(
      new Request("https://example.test/v1/intents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_KEY}`,
        },
        body: "{not json",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    const runCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_runs",
    ).first<{ count: number }>();
    expect(runCount?.count).toBe(0);
  });

  it("rejects a structurally invalid IntentV1 with 400 and structured problems", async () => {
    await seedProject();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/intents", { schemaVersion: "1" }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await jsonBody(response)) as {
      error: string;
      details: { problems: unknown[] };
    };
    expect(Array.isArray(body.details.problems)).toBe(true);
    expect(body.details.problems.length).toBeGreaterThan(0);
  });

  it("rejects an unsupported intent kind with 400", async () => {
    await seedProject();
    // A raw candidate, sent directly -- not built through forecastQueryIntent(), which validates
    // client-side and would itself reject this before the request ever reached the server.
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/intents", {
        schemaVersion: "1",
        intentId: "55555555-5555-4555-8555-555555555555",
        idempotencyKey: "key-op-routes-bogus-kind",
        projectId: PROJECT_ID,
        kind: "BOGUS_KIND",
        requestedEffect: "READ_ONLY",
        expectedProjectRevision: null,
        submittedAt: "2026-08-30T13:00:00.000Z",
        source: { channel: "API" },
        payload: { type: "QUERY" },
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("blocks a stale-revision EVIDENCE_PREVIEW intent with 409", async () => {
    await seedProject();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/intents", stalePreviewIntent()),
      adminEnv(),
    );
    expect(response.status).toBe(409);
    const body = (await jsonBody(response)) as {
      result: { status: string; problem: { code: string } };
    };
    expect(body.result.status).toBe("BLOCKED");
    expect(body.result.problem.code).toBe("REVISION_CONFLICT");
  });
});

describe("GET /v1/workflows/:workflowId", () => {
  it("returns the persisted run for a known workflow", async () => {
    await seedProject();
    const submit = await worker.fetch(
      jsonRequest("POST", "/v1/intents", forecastQueryIntent()),
      adminEnv(),
    );
    const submitBody = (await jsonBody(submit)) as {
      run: { workflowId: string };
    };
    const response = await worker.fetch(
      plainRequest("GET", `/v1/workflows/${submitBody.run.workflowId}`),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as { workflowId: string };
    expect(body.workflowId).toBe(submitBody.run.workflowId);
  });

  it("returns 404 for an unknown workflow", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/workflows/does-not-exist"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /v1/results/:resultId", () => {
  it("returns the persisted result for a known result", async () => {
    await seedProject();
    const submit = await worker.fetch(
      jsonRequest("POST", "/v1/intents", forecastQueryIntent()),
      adminEnv(),
    );
    const submitBody = (await jsonBody(submit)) as {
      result: { resultId: string };
    };
    const response = await worker.fetch(
      plainRequest("GET", `/v1/results/${submitBody.result.resultId}`),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as { resultId: string };
    expect(body.resultId).toBe(submitBody.result.resultId);
  });

  it("returns 404 for an unknown result", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/results/does-not-exist"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /v1/workflows/:workflowId/resume", () => {
  it("resumes an interrupted run to completion (201, same workflow, no second run)", async () => {
    await seedProject();
    const intent = forecastQueryIntent({
      intentId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "key-op-routes-resume-1",
    });
    await createInterruptedRun(intent);

    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const interruptedRun = await repo.loadWorkflowRunByIntentId(
      intent.intentId,
    );
    if (!interruptedRun) throw new Error("interrupted run missing");
    expect(interruptedRun.state).toBe("INTERRUPTED");

    const response = await worker.fetch(
      jsonRequest("POST", `/v1/workflows/${interruptedRun.workflowId}/resume`),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    const body = (await jsonBody(response)) as {
      replayed: boolean;
      run: { workflowId: string; state: string };
      result: { status: string };
    };
    expect(body.replayed).toBe(false);
    expect(body.run.workflowId).toBe(interruptedRun.workflowId);
    expect(body.run.state).toBe("SUCCEEDED");
    expect(body.result.status).toBe("SUCCEEDED");

    const runCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_runs",
    ).first<{ count: number }>();
    expect(runCount?.count).toBe(1);
  });

  it("returns 404 for an unknown workflow", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/workflows/does-not-exist/resume"),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("two concurrent resumes of the same interrupted run: one succeeds, the other gets 409", async () => {
    await seedProject();
    const intent = forecastQueryIntent({
      intentId: "44444444-4444-4444-8444-444444444444",
      idempotencyKey: "key-op-routes-resume-race",
    });
    await createInterruptedRun(intent);

    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const interruptedRun = await repo.loadWorkflowRunByIntentId(
      intent.intentId,
    );
    if (!interruptedRun) throw new Error("interrupted run missing");

    const [a, b] = await Promise.all([
      worker.fetch(
        jsonRequest(
          "POST",
          `/v1/workflows/${interruptedRun.workflowId}/resume`,
        ),
        adminEnv(),
      ),
      worker.fetch(
        jsonRequest(
          "POST",
          `/v1/workflows/${interruptedRun.workflowId}/resume`,
        ),
        adminEnv(),
      ),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const resultCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount?.count).toBe(1);
  });
});

describe("no stack traces or secrets ever reach the client", () => {
  it("an unexpected internal error returns only {error, requestId}, never the admin key or a stack frame", async () => {
    const brokenEnv = { ...adminEnv(), HOWLER_DB: undefined } as unknown as Env;
    const response = await worker.fetch(
      plainRequest("GET", "/v1/workflows/anything"),
      brokenEnv,
    );
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain(ADMIN_KEY);
    expect(text).not.toMatch(/at [A-Za-z]/); // stack-frame marker
    expect(text).not.toMatch(/TypeError/);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
  });
});

describe("transport adapters do not duplicate operator mutation logic", () => {
  const workerSources = import.meta.glob<string>("../../src/worker/index.ts", {
    eager: true,
    import: "default",
    query: "?raw",
  });

  function countOccurrences(source: string, needle: string): number {
    return source.split(needle).length - 1;
  }

  it("Task 15 adds no new call site of any domain-mutation function — routes call only executeWorkflow/the repository", () => {
    const [source] = Object.values(workerSources);
    if (!source) throw new Error("could not read src/worker/index.ts source");
    // Exactly the pre-existing v0.9.4 legacy call sites (reviewedRun's forecastAfterEvent, the
    // apply-shadow route's commitShadowTransition, the publish route's commitForecastTransition)
    // — Task 15's new routes must add none of their own.
    expect(countOccurrences(source, "forecastAfterEvent(")).toBe(1);
    expect(countOccurrences(source, "commitShadowTransition(")).toBe(1);
    expect(countOccurrences(source, "commitForecastTransition(")).toBe(1);
    expect(countOccurrences(source, "runOversightReview(")).toBe(0);
    // The new routes call the operator executor directly, exactly once each.
    expect(countOccurrences(source, "executeWorkflow(")).toBe(2);
  });
});
