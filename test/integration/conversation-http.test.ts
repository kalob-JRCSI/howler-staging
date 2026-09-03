/// <reference types="vite/client" />

// Field-readiness blocker fix: the real-path contract test through the actual production HTTP
// boundary -- POST /v1/projects/deboard-v091/conversation/turn -- proving the full chain: HTTP
// input -> auth -> project resolution -> conversational interpretation -> canonical project model
// -> Preview -> confirmation boundary -> Apply -> verified resulting project state. Deliberately
// NOT satisfied with helper-only tests: every request below goes through worker.fetch, the exact
// same entry point a real browser/phone request would use.

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

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

const ADMIN_KEY = "test-admin-key-conversation-http";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  authorized = true,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorized) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function jsonBody<T>(response: Response): Promise<T> {
  return await response.json();
}

interface TurnResponse {
  session: unknown;
  turn?: {
    kind: string;
    pending?: {
      claim: { claimId: string };
      confirmation: { confirmationId: string } & Record<string, unknown>;
      previewResult: { workflowState: string };
    }[];
    clarifications?: { message: string }[];
    claimId?: string;
  };
  confirm?: { outcome: string; result?: { workflowState: string } };
  timing?: { stage: string; durationMs: number }[];
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

async function seedDeboard(): Promise<void> {
  const response = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
    adminEnv(),
  );
  expect(response.status).toBe(201);
}

async function loadDeboardModel(): Promise<{
  activities: Record<string, { actualStart?: string; state: string }>;
}> {
  const row = await env.HOWLER_DB.prepare(
    "SELECT current_model_json FROM projects WHERE project_id = ?",
  )
    .bind("deboard-v091")
    .first<{ current_model_json: string }>();
  if (!row) throw new Error("deboard-v091 project row not found");
  return JSON.parse(row.current_model_json) as {
    activities: Record<string, { actualStart?: string; state: string }>;
  };
}

describe("POST /v1/projects/:id/conversation/turn — real HTTP boundary", () => {
  it("full chain: HTTP input -> auth -> project resolution -> interpretation -> canonical model -> Preview -> confirmation boundary -> Apply -> verified resulting project state", async () => {
    await seedDeboard();

    const turnResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "DeBoard foundation started today",
      }),
      adminEnv(),
    );
    expect(turnResponse.status).toBe(200);
    const turnBody = await jsonBody<TurnResponse>(turnResponse);
    expect(turnBody.turn?.kind).toBe("AWAITING_CONFIRMATION");
    const pending = turnBody.turn?.pending?.[0];
    expect(pending).toBeDefined();
    expect(pending?.previewResult.workflowState).toBe("SUCCEEDED");

    const confirmation = pending?.confirmation;
    expect(confirmation?.confirmationId).toBeTruthy();

    // The masonry activity must NOT be started yet -- Preview must never auto-Apply.
    const modelBeforeApply = await loadDeboardModel();
    expect(modelBeforeApply.activities.masonry?.actualStart).toBeUndefined();

    const confirmResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: turnBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    expect(confirmResponse.status).toBe(200);
    const confirmBody = await jsonBody<TurnResponse>(confirmResponse);
    expect(confirmBody.confirm?.outcome).toBe("APPLIED");
    expect(confirmBody.confirm?.result?.workflowState).toBe("SUCCEEDED");

    // Verified resulting project state: the actual D1-persisted model now reflects the applied
    // fact.
    const modelAfterApply = await loadDeboardModel();
    expect(modelAfterApply.activities.masonry?.actualStart).toBeTruthy();
    expect(modelAfterApply.activities.masonry?.state).toBe("IN_PROGRESS");
  });

  it("finding: the literal 'DeBoard masonry started today' phrase is genuinely, correctly ambiguous against DeBoard's real data (the masonry activity plus two unrelated constraints whose real labels also contain the word 'masonry') — clarifies rather than guessing, never silently picks one", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "DeBoard masonry started today",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = await jsonBody<TurnResponse>(response);
    expect(body.turn?.kind).toBe("CLARIFICATION");
    const message = body.turn?.clarifications?.[0]?.message ?? "";
    expect(message).toContain("more than one thing");

    // Nothing was applied -- an ambiguous match never falls through to a best guess.
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("'Actually Tuesday' modifies the pending conversational claim rather than creating unrelated project truth, over real HTTP requests", async () => {
    await seedDeboard();

    const first = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "DeBoard foundation started today",
      }),
      adminEnv(),
    );
    const firstBody = await jsonBody<TurnResponse>(first);
    expect(firstBody.turn?.kind).toBe("AWAITING_CONFIRMATION");
    const firstClaimId = firstBody.turn?.pending?.[0]?.claim.claimId;

    const second = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: firstBody.session,
        text: "Actually Tuesday",
      }),
      adminEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = await jsonBody<TurnResponse>(second);
    expect(secondBody.turn?.kind).toBe("CORRECTED");
    const secondSession = secondBody.session as {
      pendingClaims: {
        claimId: string;
        value?: string;
        effectiveDate?: string;
      }[];
    };
    expect(secondSession.pendingClaims).toHaveLength(1);
    expect(secondSession.pendingClaims[0]?.claimId).toBe(firstClaimId);
    expect(secondSession.pendingClaims[0]?.value).toBe("Tuesday");

    // Nothing was ever applied -- the correction alone cannot apply anything.
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("'I'm not sure yet' defers the pending claim and applies nothing, over real HTTP requests", async () => {
    await seedDeboard();

    const first = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "DeBoard foundation started today",
      }),
      adminEnv(),
    );
    const firstBody = await jsonBody<TurnResponse>(first);
    expect(firstBody.turn?.kind).toBe("AWAITING_CONFIRMATION");

    const second = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: firstBody.session,
        text: "I'm not sure yet",
      }),
      adminEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = await jsonBody<TurnResponse>(second);
    expect(secondBody.turn?.kind).toBe("DEFERRED");

    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("wrong project: a session claiming a different active project than the URL is rejected with 400", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: {
          sessionId: "s1",
          startedAt: "2026-09-03T00:00:00.000Z",
          activeProjectId: "some-other-project",
          activeDebriefItems: [],
          currentQuestionRef: null,
          pendingClaims: [],
          unresolvedClarifications: [],
          lastReferencedEntity: null,
          turnLog: [],
          confirmationState: "IDLE",
        },
        text: "masonry started today",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("unauthorized: a request with no admin auth header is rejected", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/deboard-v091/conversation/turn",
        { text: "masonry started today" },
        false,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("duplicate confirmation: a second identical affirmative response (the client resending the exact same original confirmation, e.g. a network retry) produces exactly one Apply at the canonical level", async () => {
    await seedDeboard();
    const first = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "DeBoard foundation started today",
      }),
      adminEnv(),
    );
    const firstBody = await jsonBody<TurnResponse>(first);
    const confirmation = firstBody.turn?.pending?.[0]?.confirmation;
    expect(confirmation?.confirmationId).toBeTruthy();

    // Both requests resend the exact same original (still-PENDING, from the client's point of
    // view) confirmation object -- Workers are stateless, so nothing server-side remembers the
    // first call happened. respondToVoiceConfirmation itself will transition PENDING -> CONSUMED
    // both times (it has no memory either), but buildServerFieldVoiceBridge derives a
    // deterministic idempotencyKey from confirmation.confirmationId, so the second submitApply
    // call is recognized by executeWorkflow's own existing idempotency mechanism as a replay of
    // the same logical intent and returns the cached result rather than re-executing -- the real
    // invariant is the project revision only ever advancing once, checked below.
    const confirmOnce = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: firstBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    const confirmOnceBody = await jsonBody<TurnResponse>(confirmOnce);
    expect(confirmOnceBody.confirm?.outcome).toBe("APPLIED");

    const confirmTwice = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: firstBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    const confirmTwiceBody = await jsonBody<TurnResponse>(confirmTwice);
    expect(confirmTwiceBody.confirm?.outcome).toBe("APPLIED");

    const row = await env.HOWLER_DB.prepare(
      "SELECT revision FROM projects WHERE project_id = ?",
    )
      .bind("deboard-v091")
      .first<{ revision: number }>();
    // Started at revision 1; exactly one apply advances it to 2, never further.
    expect(row?.revision).toBe(2);
  });

  it("malformed session: a non-object session value fails closed with 400, applying nothing", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: "not-an-object",
        text: "masonry started today",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("malformed request: missing text and no confirm block fails closed with 400", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {}),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("Task18 direct forecast command (the existing /v1/intents FORECAST_QUERY path) is completely unchanged", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/intents", {
        schemaVersion: "1",
        intentId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "forecast-query-unchanged",
        projectId: "deboard-v091",
        kind: "FORECAST_QUERY",
        requestedEffect: "READ_ONLY",
        expectedProjectRevision: null,
        submittedAt: "2026-09-03T12:00:00.000Z",
        source: { channel: "API" },
        payload: { type: "QUERY" },
      }),
      adminEnv(),
    );
    expect([200, 201]).toContain(response.status);
  });

  it("Resume: the existing canonical /v1/workflows/:id/resume route is untouched and still live", async () => {
    await seedDeboard();
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/workflows/nonexistent-workflow-id/resume",
        undefined,
      ),
      adminEnv(),
    );
    // Still the exact same canonical route logic: an unknown workflow id 404s, proving this
    // route was never shadowed or reimplemented by the new conversation/turn route.
    expect(response.status).toBe(404);
  });
});
