import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "test-admin-key-financial-conversation-routes";
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

async function jsonBody(response: Response): Promise<unknown> {
  return response.json();
}

async function seedProject(): Promise<void> {
  const response = await worker.fetch(
    jsonRequest("POST", `/v1/projects/${PROJECT_ID}/seed`),
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

interface CommandPreviewResponse {
  reviewToken: string;
  event: { id: string; baseRevision: number };
}

async function previewAndApply(path: string, command: unknown): Promise<void> {
  const previewResponse = await worker.fetch(
    jsonRequest("POST", path, { command }),
    adminEnv(),
  );
  expect(previewResponse.status).toBe(200);
  const preview = (await jsonBody(previewResponse)) as CommandPreviewResponse;
  const applyResponse = await worker.fetch(
    jsonRequest("POST", `/v1/projects/${PROJECT_ID}/events/apply-shadow`, {
      event: preview.event,
      reviewToken: preview.reviewToken,
    }),
    adminEnv(),
  );
  expect(applyResponse.status).toBe(201);
}

async function previewBudget(command: unknown): Promise<void> {
  await previewAndApply(
    `/v1/projects/${PROJECT_ID}/budget/commands/preview`,
    command,
  );
}

async function previewScope(command: unknown): Promise<void> {
  await previewAndApply(
    `/v1/projects/${PROJECT_ID}/scope/commands/preview`,
    command,
  );
}

interface BudgetView {
  categories: { id: string; name: string }[];
  lines: {
    id: string;
    description: string;
    trade: string | null;
    baselineAmount: unknown;
  }[];
  commitments: { id: string; vendorRef: string | null; amount: unknown }[];
  actualCosts: { id: string; amount: unknown; budgetLineId: string | null }[];
  findings: { kind: string }[];
}

async function fetchBudget(): Promise<BudgetView> {
  return (await jsonBody(
    await worker.fetch(
      plainRequest("GET", `/v1/projects/${PROJECT_ID}/budget`),
      adminEnv(),
    ),
  )) as BudgetView;
}

interface ScopeView {
  items: { id: string; description: string }[];
}

async function fetchScope(): Promise<ScopeView> {
  return (await jsonBody(
    await worker.fetch(
      plainRequest("GET", `/v1/projects/${PROJECT_ID}/scope`),
      adminEnv(),
    ),
  )) as ScopeView;
}

interface ChangeOrdersView {
  changeOrders: { id: string }[];
}

async function fetchChangeOrders(): Promise<ChangeOrdersView> {
  return (await jsonBody(
    await worker.fetch(
      plainRequest("GET", `/v1/projects/${PROJECT_ID}/change-orders`),
      adminEnv(),
    ),
  )) as ChangeOrdersView;
}

interface TurnResponse {
  outcome: "RESOLVED" | "CLARIFICATION";
  message?: string;
  reviewToken?: string;
  clerical?: boolean;
  event?: { id: string; baseRevision: number };
  historyNote?: string;
}

async function postTurn(text: string): Promise<Response> {
  return worker.fetch(
    jsonRequest(
      "POST",
      `/v1/projects/${PROJECT_ID}/financial-conversation/turn`,
      { text },
    ),
    adminEnv(),
  );
}

describe("POST /v1/projects/:id/financial-conversation/turn", () => {
  it("requires the same Bearer admin key as every other /v1 route", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        `/v1/projects/${PROJECT_ID}/financial-conversation/turn`,
        { text: "Medina's approved plumbing proposal is $18,750." },
        false,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("404s for an unknown project", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        "/v1/projects/ghost-project/financial-conversation/turn",
        {
          text: "Medina's approved plumbing proposal is $18,750.",
        },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("400s on a missing text field, never a raw 500", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        `/v1/projects/${PROJECT_ID}/financial-conversation/turn`,
        {},
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("400s on an empty text field", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        `/v1/projects/${PROJECT_ID}/financial-conversation/turn`,
        { text: "   " },
      ),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("Phase 4 Task 11: fails closed with a clear 500, never a fake credential or a silent fallback, when 'openai' is selected without a configured key", async () => {
    const response = await worker.fetch(
      jsonRequest(
        "POST",
        `/v1/projects/${PROJECT_ID}/financial-conversation/turn`,
        { text: "Medina's approved plumbing proposal is $18,750." },
      ),
      { ...adminEnv(), HOWLER_AI_PROVIDER: "openai" },
    );
    expect(response.status).toBe(500);
    const body = (await jsonBody(response)) as { error: string };
    expect(body.error).toBe("HOWLER_OPENAI_API_KEY is not configured");
  });

  it("clarifies rather than guesses when financials have not been initialized yet", async () => {
    const response = await postTurn(
      "Medina's approved plumbing proposal is $18,750.",
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as TurnResponse;
    expect(body.outcome).toBe("CLARIFICATION");
    expect(body.message).toContain("set up yet");
  });

  describe("with financials initialized", () => {
    let plumbingLineId: string;

    beforeEach(async () => {
      await previewBudget({ kind: "INITIALIZE_FINANCIALS", currency: "USD" });
      await previewBudget({ kind: "ADD_CATEGORY", name: "Plumbing" });
      const categoryId = (await fetchBudget()).categories[0]?.id;
      await previewBudget({
        kind: "ADD_LINE",
        categoryId,
        description: "Plumbing rough-in",
        trade: "Plumbing",
      });
      plumbingLineId = (await fetchBudget()).lines[0]?.id as string;
      expect(plumbingLineId).toBeDefined();
    });

    it("required acceptance case 1: resolves Medina's approved plumbing commitment, previews it, applies it exactly once through the same event path the manual UI uses", async () => {
      const response = await postTurn(
        "Medina's approved plumbing proposal is $18,750.",
      );
      expect(response.status).toBe(200);
      const body = (await jsonBody(response)) as TurnResponse;
      expect(body.outcome).toBe("RESOLVED");
      expect(body.clerical).toBe(false);
      expect(body.event).toBeDefined();

      const applyResponse = await worker.fetch(
        jsonRequest("POST", `/v1/projects/${PROJECT_ID}/events/apply-shadow`, {
          event: body.event,
          reviewToken: body.reviewToken,
        }),
        adminEnv(),
      );
      expect(applyResponse.status).toBe(201);

      const budget = await fetchBudget();
      expect(budget.commitments).toHaveLength(1);
      expect(budget.commitments[0]?.vendorRef).toBe("Medina");
      expect(budget.commitments[0]?.amount).toEqual({
        amountMinor: 1875000,
        currency: "USD",
      });

      // Retrying the exact same event/reviewToken must never double-apply
      // (idempotent-apply, src/engine/idempotent-apply.ts).
      const retryResponse = await worker.fetch(
        jsonRequest("POST", `/v1/projects/${PROJECT_ID}/events/apply-shadow`, {
          event: body.event,
          reviewToken: body.reviewToken,
        }),
        adminEnv(),
      );
      // A replayed retry reports 200 (not a fresh 201) -- src/engine/idempotent-apply.ts's
      // REPLAYED outcome, same contract every other apply-shadow retry follows.
      expect(retryResponse.status).toBe(200);
      const budgetAfterRetry = await fetchBudget();
      expect(budgetAfterRetry.commitments).toHaveLength(1);
    });

    it("required acceptance case 2: never assumes estimate vs. approved commitment for an ambiguous restatement -- clarifies instead", async () => {
      const response = await postTurn("Medina came in at 18,750.");
      expect(response.status).toBe(200);
      const body = (await jsonBody(response)) as TurnResponse;
      expect(body.outcome).toBe("CLARIFICATION");
      expect(body.event).toBeUndefined();

      const budget = await fetchBudget();
      expect(budget.commitments).toHaveLength(0);
    });

    it("required acceptance case 3: proposes the allowance variance without ever automatically generating a Change Order", async () => {
      await previewBudget({
        kind: "ADD_LINE",
        categoryId: (await fetchBudget()).categories[0]?.id,
        description: "Carpet allowance",
        isAllowance: true,
        baselineAmount: { amountMinor: 100000, currency: "USD" },
      });
      const budgetBefore = await fetchBudget();
      const carpetLine = budgetBefore.lines.find(
        (l) => l.description === "Carpet allowance",
      );
      expect(carpetLine).toBeDefined();

      await previewScope({
        kind: "ADD_SCOPE_ITEM",
        description: "Mrs. Pratt's carpet",
        phase: "Finishes",
      });
      const scopeItemId = (await fetchScope()).items.find(
        (i) => i.description === "Mrs. Pratt's carpet",
      )?.id;
      expect(scopeItemId).toBeDefined();
      await previewScope({
        kind: "SET_ALLOWANCE_BUDGET_LINE",
        scopeItemId,
        budgetLineId: carpetLine?.id,
      });

      const response = await postTurn(
        "Mrs. Pratt's carpet is $175 over the $1,000 allowance.",
      );
      expect(response.status).toBe(200);
      const body = (await jsonBody(response)) as TurnResponse;
      expect(body.outcome).toBe("RESOLVED");
      expect(body.event?.id).toBeDefined();

      await worker.fetch(
        jsonRequest("POST", `/v1/projects/${PROJECT_ID}/events/apply-shadow`, {
          event: body.event,
          reviewToken: body.reviewToken,
        }),
        adminEnv(),
      );

      const budgetAfter = await fetchBudget();
      const actualCost = budgetAfter.actualCosts.find(
        (a) => a.budgetLineId === carpetLine?.id,
      );
      expect(actualCost?.amount).toEqual({
        amountMinor: 117500,
        currency: "USD",
      });
      expect(
        budgetAfter.findings.some((f) => f.kind === "ALLOWANCE_OVERRUN"),
      ).toBe(true);

      const changeOrders = await fetchChangeOrders();
      expect(changeOrders.changeOrders).toHaveLength(0);
    });
  });
});
