import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderBudget } from "../../../views/indexCard/budget";
import type {
  BudgetCategoryViewLike,
  BudgetLineViewLike,
  ProjectBudgetWorkspaceLike,
} from "../../../types";

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function category(
  overrides: Partial<BudgetCategoryViewLike> = {},
): BudgetCategoryViewLike {
  return {
    id: "cat1",
    name: "Cabinetry",
    isDefault: false,
    active: true,
    sortOrder: null,
    notes: null,
    ...overrides,
  };
}

function line(overrides: Partial<BudgetLineViewLike> = {}): BudgetLineViewLike {
  return {
    id: "line1",
    categoryId: "cat1",
    categoryName: "Cabinetry",
    description: "Kitchen cabinets",
    costCode: null,
    trade: null,
    baselineAmount: null,
    isAllowance: false,
    vendorRef: null,
    scopeItemIds: [],
    notes: null,
    active: true,
    committedTotal: { amountMinor: 0, currency: "USD" },
    actualTotal: { amountMinor: 0, currency: "USD" },
    approvedChangeOrderTotal: { amountMinor: 0, currency: "USD" },
    revisedAmount: null,
    remaining: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function workspace(
  overrides: Partial<ProjectBudgetWorkspaceLike> = {},
): ProjectBudgetWorkspaceLike {
  return {
    projectId: "carver",
    projectRevision: 3,
    initialized: false,
    currency: null,
    summary: null,
    categories: [],
    lines: [],
    commitments: [],
    actualCosts: [],
    findings: [],
    ...overrides,
  };
}

function initializedWorkspace(
  overrides: Partial<ProjectBudgetWorkspaceLike> = {},
): ProjectBudgetWorkspaceLike {
  return workspace({
    initialized: true,
    currency: "USD",
    summary: {
      currency: "USD",
      baseline: null,
      approvedChangeOrderTotal: { amountMinor: 0, currency: "USD" },
      pendingChangeOrderTotal: { amountMinor: 0, currency: "USD" },
      revisedBudget: null,
      committedTotal: { amountMinor: 0, currency: "USD" },
      actualTotal: { amountMinor: 0, currency: "USD" },
      remaining: null,
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderBudget", () => {
  it("shows the uninitialized state honestly, never a fabricated $0 workspace", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, workspace())),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).toContain("have not been set up yet");
    expect(
      body.querySelector('form[data-action="INITIALIZE_FINANCIALS"]'),
    ).not.toBeNull();
  });

  it("shows baseline as Unknown, not $0, when never set", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, initializedWorkspace())),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).toContain("Baseline: Unknown");
  });

  it("renders categories, lines, commitments, and actual costs honestly when empty", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, initializedWorkspace())),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).toContain("No budget categories yet.");
    expect(body.textContent).toContain("No budget lines recorded yet.");
    expect(body.textContent).toContain("No commitments recorded yet.");
    expect(body.textContent).toContain("No actual costs recorded yet.");
  });

  it("renders a budget line row with its derived totals", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          initializedWorkspace({
            categories: [category()],
            lines: [
              line({
                baselineAmount: { amountMinor: 100000, currency: "USD" },
                revisedAmount: { amountMinor: 100000, currency: "USD" },
                remaining: { amountMinor: 100000, currency: "USD" },
              }),
            ],
          }),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    const row = body.querySelector('tr[data-line="line1"]');
    expect(row?.textContent).toContain("Kitchen cabinets");
    expect(row?.textContent).toContain("$1,000.00");
  });

  it("INITIALIZE_FINANCIALS is not clerical -- shows preview -> confirm, not an immediate save", async () => {
    let getBudgetCount = 0;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/budget") && method === "GET") {
        getBudgetCount += 1;
        return Promise.resolve(
          jsonResponse(
            200,
            getBudgetCount === 1 ? workspace() : initializedWorkspace(),
          ),
        );
      }
      if (url.endsWith("/budget/commands/preview")) {
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-1",
            historyNote: "Project financials initialized in USD.",
            clerical: false,
            event: { id: "evt-1", baseRevision: 3 },
            delta: null,
            recoveryAnalysis: { status: "ON_TRACK", protectionActions: [] },
          }),
        );
      }
      if (url.endsWith("/events/apply-shadow")) {
        return Promise.resolve(
          jsonResponse(201, { applied: true, projectRevision: 4 }),
        );
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    const body = document.createElement("div");
    await renderBudget(body, "carver");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="INITIALIZE_FINANCIALS"]',
    );
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(body.querySelector(".sched-confirm")).not.toBeNull();
    body.querySelector<HTMLButtonElement>(".sched-confirm")?.click();
    await flushAsyncWork();
    expect(getBudgetCount).toBeGreaterThanOrEqual(2);
  });

  it("a clerical edit (SET_CATEGORY_NAME) applies immediately, with no confirmation step", async () => {
    const initial = initializedWorkspace({ categories: [category()] });
    const afterApply = initializedWorkspace({
      categories: [category({ name: "Millwork" })],
    });
    let getBudgetCount = 0;

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/budget") && method === "GET") {
        getBudgetCount += 1;
        return Promise.resolve(
          jsonResponse(200, getBudgetCount === 1 ? initial : afterApply),
        );
      }
      if (url.endsWith("/budget/commands/preview")) {
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-2",
            historyNote: 'Budget category "Cabinetry" renamed to "Millwork".',
            clerical: true,
            event: { id: "evt-2", baseRevision: 3 },
            delta: null,
            recoveryAnalysis: { status: "ON_TRACK", protectionActions: [] },
          }),
        );
      }
      if (url.endsWith("/events/apply-shadow")) {
        return Promise.resolve(
          jsonResponse(201, { applied: true, projectRevision: 4 }),
        );
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    const body = document.createElement("div");
    await renderBudget(body, "carver");
    body.querySelector<HTMLElement>('tr[data-category="cat1"]')?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_CATEGORY_NAME"]',
    );
    const input = form?.querySelector<HTMLInputElement>('input[name="name"]');
    if (input) input.value = "Millwork";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(body.querySelector(".sched-confirm")).toBeNull();
    expect(getBudgetCount).toBeGreaterThanOrEqual(2);
  });

  it("shows an inline error and never applies when preview fails", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/budget") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          jsonResponse(200, initializedWorkspace({ categories: [category()] })),
        );
      }
      if (url.endsWith("/budget/commands/preview")) {
        return Promise.resolve(
          jsonResponse(400, {
            error: "Invalid budget command",
            details: { errors: ["name is required"] },
          }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const body = document.createElement("div");
    await renderBudget(body, "carver");
    body.querySelector<HTMLElement>('tr[data-category="cat1"]')?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_CATEGORY_NAME"]',
    );
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const panel = detail?.querySelector<HTMLElement>(".sched-action-panel");
    expect(panel?.textContent).toContain("Invalid budget command");
  });
});

describe("renderBudget: Phase 4 financial intelligence findings (Task 9)", () => {
  it("shows real, structured findings under Observations", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          initializedWorkspace({
            findings: [
              {
                kind: "LINE_HAS_NO_BASELINE",
                budgetLineId: "line1",
                commitmentId: null,
                actualCostId: null,
                changeOrderId: null,
                scopeItemId: null,
                message:
                  'Budget line "Kitchen cabinets" has no baseline amount recorded.',
              },
            ],
          }),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).toContain("Observations");
    expect(body.textContent).toContain(
      'Budget line "Kitchen cabinets" has no baseline amount recorded.',
    );
  });

  it("shows no Observations section at all when there are no findings", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, initializedWorkspace({ findings: [] })),
      ),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).not.toContain("Observations");
  });
});
