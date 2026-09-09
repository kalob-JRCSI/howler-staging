/// <reference types="vite/client" />

// Phase 4 Task 12 (Howler Recovery Directive, Budget + Change Orders, legacy compatibility):
// proves ADOPT_LEGACY_BASELINE end to end through the real HTTP boundary -- a project created via
// the existing Genesis intake path (v0.9.6 Contractor Hub) already carries
// projectProfile.budget.baseline/currency from the PM's own original intake text; this proves the
// Budget module can adopt that real figure into financials.baseline without the PM ever retyping
// it, using the exact same preview -> apply-shadow path every other Budget command uses.

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import type { GenesisProposalV096 } from "../../src/operator/genesis";
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

const ADMIN_KEY = "test-admin-key-budget-legacy-adoption";
const SMITH_INTAKE =
  "Create Smith Residence. 2,800sf remodel. Budget is $310k. Scope is kitchen, primary bath, flooring, windows, electrical service upgrade and HVAC modifications. Demo starts September 14. We already selected Wayland for electrical. Cabinets are still being priced.";

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

async function jsonBody<T>(response: Response): Promise<T> {
  return await response.json();
}

async function commitSmithResidence(): Promise<string> {
  const previewResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/genesis/preview", { text: SMITH_INTAKE }),
    adminEnv(),
  );
  const previewBody = await jsonBody<{ proposal: GenesisProposalV096 }>(
    previewResponse,
  );
  const commitResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/genesis/commit", {
      proposal: previewBody.proposal,
    }),
    adminEnv(),
  );
  expect(commitResponse.status).toBe(201);
  return previewBody.proposal.projectId;
}

interface BudgetPreviewResponse {
  reviewToken: string;
  event: { id: string; baseRevision: number };
}

interface BudgetView {
  initialized: boolean;
  currency: string | null;
  summary: {
    baseline: { amountMinor: number; currency: string } | null;
  } | null;
}

async function fetchBudget(projectId: string): Promise<BudgetView> {
  return jsonBody<BudgetView>(
    await worker.fetch(
      jsonRequest("GET", `/v1/projects/${projectId}/budget`),
      adminEnv(),
    ),
  );
}

async function previewAdoptLegacyBaseline(
  projectId: string,
): Promise<Response> {
  return worker.fetch(
    jsonRequest("POST", `/v1/projects/${projectId}/budget/commands/preview`, {
      command: { kind: "ADOPT_LEGACY_BASELINE" },
    }),
    adminEnv(),
  );
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

describe("ADOPT_LEGACY_BASELINE: real Genesis-intake project, real HTTP boundary", () => {
  it("adopts the real Genesis-intake baseline/currency into financials -- no PM re-entry required", async () => {
    const projectId = await commitSmithResidence();

    const previewResponse = await previewAdoptLegacyBaseline(projectId);
    expect(previewResponse.status).toBe(200);
    const preview = await jsonBody<BudgetPreviewResponse>(previewResponse);

    const applyResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${projectId}/events/apply-shadow`, {
        event: preview.event,
        reviewToken: preview.reviewToken,
      }),
      adminEnv(),
    );
    expect(applyResponse.status).toBe(201);

    const budget = await fetchBudget(projectId);
    expect(budget.initialized).toBe(true);
    expect(budget.currency).toBe("USD");
    expect(budget.summary?.baseline).toEqual({
      amountMinor: 31000000,
      currency: "USD",
    });
  });

  it("rejects with a clean 400, never a 500, when the project has no legacy budget on its profile", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
      adminEnv(),
    );
    expect(response.status).toBe(201);

    const previewResponse = await previewAdoptLegacyBaseline("deboard-v091");
    expect(previewResponse.status).toBe(400);
  });

  it("rejects a second adoption attempt with a clean 400 -- never double-adopting", async () => {
    const projectId = await commitSmithResidence();
    const firstPreview = await jsonBody<BudgetPreviewResponse>(
      await previewAdoptLegacyBaseline(projectId),
    );
    await worker.fetch(
      jsonRequest("POST", `/v1/projects/${projectId}/events/apply-shadow`, {
        event: firstPreview.event,
        reviewToken: firstPreview.reviewToken,
      }),
      adminEnv(),
    );

    const secondPreviewResponse = await previewAdoptLegacyBaseline(projectId);
    expect(secondPreviewResponse.status).toBe(400);
  });
});
