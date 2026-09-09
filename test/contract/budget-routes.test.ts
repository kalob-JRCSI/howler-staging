import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "test-admin-key-budget-routes";

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

interface BudgetPreviewResponse {
  projectRevision: number;
  reviewToken: string;
  clerical: boolean;
  event: { id: string; baseRevision: number };
}

interface BudgetView {
  initialized: boolean;
  currency: string | null;
  summary: {
    baseline: unknown;
    committedTotal: { amountMinor: number; currency: string };
  } | null;
  categories: { id: string; name: string }[];
  lines: { id: string; description: string; categoryId: string }[];
}

async function previewAndApply(
  command: unknown,
): Promise<{ preview: BudgetPreviewResponse; applyStatus: number }> {
  const previewResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/budget/commands/preview", {
      command,
    }),
    adminEnv(),
  );
  expect(previewResponse.status).toBe(200);
  const preview = (await jsonBody(previewResponse)) as BudgetPreviewResponse;
  const applyResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/events/apply-shadow", {
      event: preview.event,
      reviewToken: preview.reviewToken,
    }),
    adminEnv(),
  );
  return { preview, applyStatus: applyResponse.status };
}

describe("GET /v1/projects/:id/budget", () => {
  it("reports an uninitialized project honestly", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/v1/projects/deboard-v091/budget"),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as BudgetView;
    expect(body.initialized).toBe(false);
    expect(body.currency).toBeNull();
    expect(body.summary).toBeNull();
  });
});

describe("preview -> apply-shadow: Budget save/confirm flow", () => {
  it("initializes financials, adds a category, adds a line, and sets a baseline", async () => {
    const init = await previewAndApply({
      kind: "INITIALIZE_FINANCIALS",
      currency: "USD",
    });
    expect(init.applyStatus).toBe(201);

    const category = await previewAndApply({
      kind: "ADD_CATEGORY",
      name: "Cabinetry",
    });
    expect(category.applyStatus).toBe(201);

    const budgetAfterCategory = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/budget"),
        adminEnv(),
      ),
    )) as BudgetView;
    expect(budgetAfterCategory.initialized).toBe(true);
    expect(budgetAfterCategory.currency).toBe("USD");
    const categoryId = budgetAfterCategory.categories.find(
      (c) => c.name === "Cabinetry",
    )?.id;
    expect(categoryId).toBeDefined();

    const line = await previewAndApply({
      kind: "ADD_LINE",
      categoryId,
      description: "Kitchen cabinets",
      baselineAmount: { amountMinor: 1450000, currency: "USD" },
    });
    expect(line.applyStatus).toBe(201);

    const baseline = await previewAndApply({
      kind: "SET_FINANCIAL_BASELINE",
      baseline: { amountMinor: 40000000, currency: "USD" },
    });
    expect(baseline.applyStatus).toBe(201);

    const finalBudget = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/budget"),
        adminEnv(),
      ),
    )) as BudgetView & {
      summary: { baseline: { amountMinor: number; currency: string } };
    };
    expect(
      finalBudget.lines.find((l) => l.description === "Kitchen cabinets")
        ?.categoryId,
    ).toBe(categoryId);
    expect(finalBudget.summary.baseline).toEqual({
      amountMinor: 40000000,
      currency: "USD",
    });
  });

  it("Task 9: GET /budget includes real, structured financial intelligence findings", async () => {
    await previewAndApply({ kind: "INITIALIZE_FINANCIALS", currency: "USD" });
    const category = await previewAndApply({
      kind: "ADD_CATEGORY",
      name: "Cabinetry",
    });
    const categoryId = (
      (await jsonBody(
        await worker.fetch(
          plainRequest("GET", "/v1/projects/deboard-v091/budget"),
          adminEnv(),
        ),
      )) as BudgetView
    ).categories[0]?.id;
    expect(category.applyStatus).toBe(201);
    expect(categoryId).toBeDefined();

    // Deliberately no baselineAmount -- should surface as LINE_HAS_NO_BASELINE.
    const line = await previewAndApply({
      kind: "ADD_LINE",
      categoryId,
      description: "Kitchen cabinets",
    });
    expect(line.applyStatus).toBe(201);

    const budget = (await jsonBody(
      await worker.fetch(
        plainRequest("GET", "/v1/projects/deboard-v091/budget"),
        adminEnv(),
      ),
    )) as BudgetView & {
      findings: {
        kind: string;
        budgetLineId: string | null;
        message: string;
      }[];
    };
    expect(
      budget.findings.some(
        (f) =>
          f.kind === "LINE_HAS_NO_BASELINE" &&
          f.message.includes("Kitchen cabinets"),
      ),
    ).toBe(true);
  });

  it("rejects an invalid budget command shape with 400, never a raw 500", async () => {
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/budget/commands/preview", {
        command: { kind: "NOT_A_REAL_COMMAND" },
      }),
      adminEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects ADD_LINE against an unknown category with a clean 400, not a 500", async () => {
    await previewAndApply({ kind: "INITIALIZE_FINANCIALS", currency: "USD" });
    const response = await worker.fetch(
      jsonRequest("POST", "/v1/projects/deboard-v091/budget/commands/preview", {
        command: {
          kind: "ADD_LINE",
          categoryId: "missing-category",
          description: "Orphan line",
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
        "/v1/projects/deboard-v091/budget/commands/preview",
        { command: { kind: "INITIALIZE_FINANCIALS", currency: "USD" } },
        false,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(401);
  });
});
