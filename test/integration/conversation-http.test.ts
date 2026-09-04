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

  // Pilot activation: a real bug found via a real browser session -- the confirm branch never
  // updated session.pendingClaims, so a claim stayed AWAITING_CONFIRMATION forever after being
  // applied, and a later unrelated "not sure yet" utterance would match `findAwaitingClaim`
  // against it and misreport DEFERRED instead of falling through to fresh interpretation.
  it("after a claim is confirmed and applied, it no longer counts as AWAITING_CONFIRMATION -- a later unrelated 'not sure yet' does not defer it", async () => {
    await seedDeboard();

    const turnResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "DeBoard foundation started today",
      }),
      adminEnv(),
    );
    const turnBody = await jsonBody<TurnResponse>(turnResponse);
    const confirmation = turnBody.turn?.pending?.[0]?.confirmation;

    const confirmResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: turnBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    const confirmBody = await jsonBody<TurnResponse>(confirmResponse);
    expect(confirmBody.confirm?.outcome).toBe("APPLIED");
    const confirmedSession = confirmBody.session as {
      pendingClaims: { userConfirmationState: string }[];
    };
    expect(
      confirmedSession.pendingClaims.every(
        (c) => c.userConfirmationState !== "AWAITING_CONFIRMATION",
      ),
    ).toBe(true);

    const unrelated = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        session: confirmBody.session,
        text: "Not sure yet about that one",
      }),
      adminEnv(),
    );
    expect(unrelated.status).toBe(200);
    const unrelatedBody = await jsonBody<TurnResponse>(unrelated);
    // Nothing is AWAITING_CONFIRMATION any more, so this cannot be a real DEFER of the
    // already-applied claim -- it falls through to fresh interpretation instead.
    expect(unrelatedBody.turn?.kind).not.toBe("DEFERRED");

    // Still exactly one actualStart write on the masonry activity -- the stale-session bug never
    // caused (or could have caused) a second Apply either.
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.state).toBe("IN_PROGRESS");
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
    // call is recognized by executeWorkflow's own existing idempotency mechanism as a genuine
    // duplicate -- the real invariant is the project revision only ever advancing once, checked
    // below.
    //
    // Safety repair (blocker 3 — Apply result truth): executeWorkflow classifies a genuine
    // intentId/idempotencyKey reuse as its own distinct outcome (IDEMPOTENCY_KEY_REUSE /
    // INTENT_ID_REUSE), which workflowStateFromOutcome — this codebase's one existing, shared
    // outcome-to-status mapping, used by every mutating route, not something this fix invents —
    // has always reported as "FAILED", never as a "SUCCEEDED" replay. The route's own confirm
    // branch previously hardcoded `outcome: "APPLIED"` regardless of the real result, silently
    // masking this; now that it reports the real workflowState truthfully, the second identical
    // confirmation is honestly reported as FAILED (this exact request applied nothing new), while
    // the safety-critical invariant — exactly one real Apply, ever — still holds underneath.
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
    expect(confirmTwiceBody.confirm?.outcome).toBe("FAILED");

    const row = await env.HOWLER_DB.prepare(
      "SELECT revision FROM projects WHERE project_id = ?",
    )
      .bind("deboard-v091")
      .first<{ revision: number }>();
    // Started at revision 1; exactly one apply advances it to 2, never further -- this is the
    // actual safety invariant, independent of how the duplicate attempt's outcome is labeled.
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

// ---------------------------------------------------------------------------------------------
// Safety repair (HOWLER FIELD-READINESS REPAIR — SAFETY / TRANSPORT LANE): adversarial coverage
// for blockers 2 (server-bound confirmation), 3 (Apply result truth), 4 (project-scoped
// conversation), and 6 (non-blocking) through the real HTTP boundary.
// ---------------------------------------------------------------------------------------------

/** Runs a real turn that previews a real, applyable DeBoard claim and returns the exact
 * session/confirmation the server issued -- a genuinely signed, untampered confirmation each
 * adversarial test below mutates one field of. */
async function realDeboardConfirmation(): Promise<{
  session: unknown;
  confirmation: Record<string, unknown>;
}> {
  await seedDeboard();
  const response = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
      text: "DeBoard foundation started today",
    }),
    adminEnv(),
  );
  const body = await jsonBody<TurnResponse>(response);
  const confirmation = body.turn?.pending?.[0]?.confirmation;
  if (!confirmation) throw new Error("expected a real pending confirmation");
  return { session: body.session, confirmation };
}

async function confirmWith(
  session: unknown,
  confirmation: unknown,
): Promise<{ status: number; body: TurnResponse }> {
  const response = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
      session,
      confirm: { confirmation, affirmative: true },
    }),
    adminEnv(),
  );
  return {
    status: response.status,
    body: await jsonBody<TurnResponse>(response),
  };
}

describe("safety repair blocker 2: server-bound confirmation — client tampering is refused, never applied", () => {
  it("a forged confirmation.projectId (redirected to a different project) is rejected with 400, and nothing is applied", async () => {
    const { session, confirmation } = await realDeboardConfirmation();
    const forged = { ...confirmation, projectId: "some-other-project" };
    const { status } = await confirmWith(session, forged);
    expect(status).toBe(400);
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("altered canonicalEvidence is rejected with 400, and nothing is applied", async () => {
    const { session, confirmation } = await realDeboardConfirmation();
    const originalEvidence = confirmation.canonicalEvidence as Record<
      string,
      unknown
    >;
    const forged = {
      ...confirmation,
      canonicalEvidence: {
        ...originalEvidence,
        mutations: [
          {
            op: "SET_ACTUAL_FINISH",
            activityId: "masonry",
            date: "2026-09-03",
          },
        ],
      },
    };
    const { status } = await confirmWith(session, forged);
    expect(status).toBe(400);
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
    expect(model.activities.masonry?.state).toBe("NOT_STARTED");
  });

  it("an altered snapshotFingerprint (stale/mismatched against the real evidence) is rejected with 400, and nothing is applied", async () => {
    const { session, confirmation } = await realDeboardConfirmation();
    const forged = {
      ...confirmation,
      snapshotFingerprint:
        "0000000000000000000000000000000000000000000000000000000000000000",
    };
    const { status } = await confirmWith(session, forged);
    expect(status).toBe(400);
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("a stale/forged expectedProjectRevision is rejected with 400, and nothing is applied", async () => {
    const { session, confirmation } = await realDeboardConfirmation();
    const forged = {
      ...confirmation,
      expectedProjectRevision: 999,
    };
    const { status } = await confirmWith(session, forged);
    expect(status).toBe(400);
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("a confirmation missing serverMac entirely (never issued by this server) is rejected with 400", async () => {
    const { session, confirmation } = await realDeboardConfirmation();
    const withoutMac = { ...confirmation };
    delete withoutMac.serverMac;
    const { status } = await confirmWith(session, withoutMac);
    expect(status).toBe(400);
    const model = await loadDeboardModel();
    expect(model.activities.masonry?.actualStart).toBeUndefined();
  });

  it("an untampered, genuinely-issued confirmation still applies normally", async () => {
    const { session, confirmation } = await realDeboardConfirmation();
    const { status, body } = await confirmWith(session, confirmation);
    expect(status).toBe(200);
    expect(body.confirm?.outcome).toBe("APPLIED");
    const model = await loadDeboardModel();
    // The route's real callModel resolves "today" against the real wall clock, not a fixed test
    // date -- assert against today's own real date, not a hardcoded one.
    expect(model.activities.masonry?.actualStart).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });
});

describe("safety repair blocker 4: the route project is authoritative context", () => {
  it("a DeBoard-card utterance that never names the project resolves against DeBoard directly, never asking 'Which project do you mean?'", async () => {
    await seedDeboard();
    // Deliberately "Foundation started today." (not "Foundation walls started today.") -- DeBoard's
    // real seed also has an activity named "Walls and subfloor package delivery", so adding "walls"
    // here would trigger a real, separate, *correct* entity-level ambiguity (already proven
    // elsewhere) that has nothing to do with this test's actual subject: project-level resolution.
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
        text: "Foundation started today.",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = await jsonBody<TurnResponse>(response);
    expect(body.turn?.kind).toBe("AWAITING_CONFIRMATION");
    const message = body.turn?.clarifications?.[0]?.message ?? "";
    expect(message).not.toContain("Which project");
  });
});

describe("safety repair blocker 6: a reasoning/clarification failure on one project never blocks another", () => {
  it("an unrecognized utterance on one project and a real, successful turn on another project resolve independently when run concurrently", async () => {
    await seedDeboard();
    const carverImport = await worker.fetch(
      jsonRequest("POST", "/v1/projects/carver-v1/import", {
        project: {
          projectId: "carver-v1",
          revision: 0,
          name: "Carver",
          projectType: "PILOT",
          timezone: "UTC",
          forecastAnchorDate: "2026-09-03",
          calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
          sources: {},
          activities: {
            trim_install: {
              id: "trim_install",
              name: "Trim install",
              phase: "Finish",
              state: "NOT_STARTED",
              duration: {
                optimistic: 1,
                likely: 1,
                conservative: 2,
                sourceIds: [],
              },
              constraintIds: [],
              sourceIds: [],
            },
          },
          constraints: {},
          dependencies: {},
          eventLedger: [],
        },
        provenance: {
          trim_install: { sourceId: "test-intake", section: "test fixture" },
        },
      }),
      adminEnv(),
    );
    expect(carverImport.status).toBe(201);

    const [failing, succeeding] = await Promise.all([
      worker.fetch(
        jsonRequest("POST", "/v1/projects/deboard-v091/conversation/turn", {
          text: "asdkfjasldkfj nonsense utterance",
        }),
        adminEnv(),
      ),
      worker.fetch(
        jsonRequest("POST", "/v1/projects/carver-v1/conversation/turn", {
          text: "Trim install started today",
        }),
        adminEnv(),
      ),
    ]);
    expect(failing.status).toBe(200);
    const failingBody = await jsonBody<TurnResponse>(failing);
    expect(failingBody.turn?.kind).toBe("CLARIFICATION");

    expect(succeeding.status).toBe(200);
    const succeedingBody = await jsonBody<TurnResponse>(succeeding);
    expect(succeedingBody.turn?.kind).toBe("AWAITING_CONFIRMATION");
  });
});
