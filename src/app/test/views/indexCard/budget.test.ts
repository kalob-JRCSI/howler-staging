import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMoneyDecimal } from "../../../format";
import type {
  BudgetCategoryViewLike,
  BudgetLineViewLike,
  FinancialFindingKindLike,
  ProjectBudgetWorkspaceLike,
  ProjectScopeLike,
  ScopeItemViewLike,
} from "../../../types";
import { renderBudget } from "../../../views/indexCard/budget";

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
    legacyBudget: null,
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

function emptyScope(
  overrides: Partial<ProjectScopeLike> = {},
): ProjectScopeLike {
  return {
    projectId: "carver",
    projectRevision: 3,
    items: [],
    insights: [],
    allActivities: [],
    ...overrides,
  };
}

function scopeItem(
  overrides: Partial<ScopeItemViewLike> = {},
): ScopeItemViewLike {
  return {
    id: "scope1",
    description: "Kitchen cabinets",
    phase: "Interior",
    status: "NOT_STARTED",
    included: true,
    trade: null,
    allowance: null,
    linkedBudgetLine: null,
    responsibleVendor: null,
    activities: [],
    notes: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    addedAfterBaseline: false,
    baselineDescription: null,
    baselinePhase: null,
    ...overrides,
  };
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
    // No legacy budget on this project's profile -- never a dead "adopt" button.
    expect(
      body.querySelector('form[data-action="ADOPT_LEGACY_BASELINE"]'),
    ).toBeNull();
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
      if (url.endsWith("/scope") && method === "GET") {
        return Promise.resolve(jsonResponse(200, emptyScope()));
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
      if (url.endsWith("/scope") && method === "GET") {
        return Promise.resolve(jsonResponse(200, emptyScope()));
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
      if (url.endsWith("/scope")) {
        return Promise.resolve(jsonResponse(200, emptyScope()));
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

describe("renderBudget: ADOPT_LEGACY_BASELINE affordance (Phase 4 Task 12, legacy compatibility)", () => {
  it("shows an 'adopt from project intake' action only when the backend reports a real legacy budget", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          workspace({ legacyBudget: { baseline: 310000, currency: "USD" } }),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).toContain("$310,000.00");
    expect(
      body.querySelector('form[data-action="ADOPT_LEGACY_BASELINE"]'),
    ).not.toBeNull();
  });

  it("previews then requires confirmation before applying -- never an immediate clerical save", async () => {
    let getBudgetCount = 0;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/budget") && method === "GET") {
        getBudgetCount += 1;
        return Promise.resolve(
          jsonResponse(
            200,
            getBudgetCount === 1
              ? workspace({
                  legacyBudget: { baseline: 310000, currency: "USD" },
                })
              : initializedWorkspace(),
          ),
        );
      }
      if (url.endsWith("/scope") && method === "GET") {
        return Promise.resolve(jsonResponse(200, emptyScope()));
      }
      if (url.endsWith("/budget/commands/preview")) {
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-adopt",
            historyNote:
              "Adopted the legacy project budget baseline ($310,000.00) from project intake -- no re-entry required.",
            clerical: false,
            event: { id: "evt-adopt", baseRevision: 3 },
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
      'form[data-action="ADOPT_LEGACY_BASELINE"]',
    );
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const confirmButton = body.querySelector<HTMLButtonElement>(
      "#budget-adopt-panel .sched-confirm",
    );
    expect(confirmButton).not.toBeNull();
    expect(body.textContent).toContain("no re-entry required");

    confirmButton?.click();
    await flushAsyncWork();
    expect(getBudgetCount).toBeGreaterThanOrEqual(2);
  });
});

describe("parseMoneyDecimal", () => {
  it("assembles minor units from digit strings, never parseFloat * 100", () => {
    expect(parseMoneyDecimal("19.99", "USD")).toEqual({
      amountMinor: 1999,
      currency: "USD",
    });
    expect(parseMoneyDecimal("10000.10", "USD")).toEqual({
      amountMinor: 1000010,
      currency: "USD",
    });
    expect(parseMoneyDecimal("18750", "CAD")).toEqual({
      amountMinor: 1875000,
      currency: "CAD",
    });
    expect(parseMoneyDecimal("-175.00", "USD")).toEqual({
      amountMinor: -17500,
      currency: "USD",
    });
  });

  it("rejects empty, non-decimal, excess precision, and exponent notation", () => {
    expect(parseMoneyDecimal("", "USD")).toBeNull();
    expect(parseMoneyDecimal("  ", "USD")).toBeNull();
    expect(parseMoneyDecimal("abc", "USD")).toBeNull();
    expect(parseMoneyDecimal("1e3", "USD")).toBeNull();
    expect(parseMoneyDecimal("100.001", "USD")).toBeNull();
    expect(parseMoneyDecimal("19.99.00", "USD")).toBeNull();
  });
});

describe("FinancialFindingKindLike stays in lockstep with operator kinds", () => {
  it("lists every operator financial finding kind the Budget workspace can name", () => {
    const kinds = [
      "LINE_HAS_NO_BASELINE",
      "ACTUAL_COST_UNALLOCATED",
      "COMMITMENT_HAS_UNALLOCATED_AMOUNT",
      "APPROVED_CO_HAS_UNALLOCATED_AMOUNT",
      "ALLOWANCE_OVERRUN",
      "SCOPE_ALLOWANCE_NOT_LINKED",
      "LINE_COMMITMENT_OVER_REVISED",
      "LINE_ACTUAL_OVER_REVISED",
      "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
      "LINE_HAS_NO_SCOPE",
      "PENDING_CO_UNPRICED",
    ] as const satisfies readonly FinancialFindingKindLike[];
    type AssertSame<A, B> = [A] extends [B]
      ? [B] extends [A]
        ? true
        : never
      : never;
    const _lockstep: AssertSame<
      (typeof kinds)[number],
      FinancialFindingKindLike
    > = true;
    expect(_lockstep).toBe(true);
    expect(kinds).toHaveLength(11);
  });
});

describe("renderBudget: Tell Howler, scope association, and money parse", () => {
  it("mounts the Tell Howler control on an initialized workspace", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.endsWith("/scope")) {
        return Promise.resolve(jsonResponse(200, emptyScope()));
      }
      return Promise.resolve(jsonResponse(200, initializedWorkspace()));
    });
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    expect(body.textContent).toContain("Tell Howler");
    expect(
      body.querySelector('form[data-action="FINANCIAL_CONVERSATION"]'),
    ).not.toBeNull();
    expect(urls.some((url) => url.endsWith("/scope"))).toBe(true);
  });

  it("shows ASSOCIATE_LINE_SCOPE_ITEMS with fetched included scope items", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/scope")) {
        return Promise.resolve(
          jsonResponse(
            200,
            emptyScope({
              items: [
                scopeItem(),
                scopeItem({
                  id: "scope2",
                  description: "Excluded millwork",
                  included: false,
                }),
              ],
            }),
          ),
        );
      }
      return Promise.resolve(
        jsonResponse(
          200,
          initializedWorkspace({
            categories: [category()],
            lines: [line()],
          }),
        ),
      );
    });
    const body = document.createElement("div");
    await renderBudget(body, "carver");
    body.querySelector<HTMLElement>('tr[data-line="line1"]')?.click();
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="ASSOCIATE_LINE_SCOPE_ITEMS"]',
    );
    expect(form).not.toBeNull();
    const options = Array.from(
      form?.querySelectorAll<HTMLOptionElement>("option") ?? [],
    );
    expect(options.map((option) => option.value)).toEqual(["scope1"]);
    expect(options[0]?.textContent).toContain("Kitchen cabinets");
  });

  it("SET_FINANCIAL_BASELINE posts digit-string minor units, not float * 100", async () => {
    let posted: { command?: { baseline?: { amountMinor: number } } } | null =
      null;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/scope")) {
        return Promise.resolve(jsonResponse(200, emptyScope()));
      }
      if (url.endsWith("/budget") && method === "GET") {
        return Promise.resolve(jsonResponse(200, initializedWorkspace()));
      }
      if (url.endsWith("/budget/commands/preview")) {
        posted = JSON.parse(String(init?.body ?? "{}")) as typeof posted;
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-money",
            historyNote: "Financial baseline set.",
            clerical: false,
            event: { id: "evt-money", baseRevision: 3 },
            delta: null,
            recoveryAnalysis: { status: "ON_TRACK", protectionActions: [] },
          }),
        );
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    const body = document.createElement("div");
    await renderBudget(body, "carver");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="SET_FINANCIAL_BASELINE"]',
    );
    const amount = form?.querySelector<HTMLInputElement>(
      'input[name="amount"]',
    );
    if (amount) amount.value = "10000.10";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(posted?.command?.baseline?.amountMinor).toBe(1000010);
  });

  it("a clerical Tell Howler turn auto-applies after the preview note, with no Confirm", async () => {
    let applyCount = 0;
    let resolveApply: ((value: Response) => void) | null = null;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/scope")) {
        return Promise.resolve(jsonResponse(200, emptyScope()));
      }
      if (url.endsWith("/budget") && method === "GET") {
        return Promise.resolve(
          jsonResponse(200, initializedWorkspace({ categories: [category()] })),
        );
      }
      if (url.endsWith("/financial-conversation/turn")) {
        return Promise.resolve(
          jsonResponse(200, {
            outcome: "RESOLVED",
            historyNote: 'Notes updated for "Cabinetry".',
            clerical: true,
            reviewToken: "token-fc-clerical",
            event: { id: "evt-fc-clerical", baseRevision: 3 },
          }),
        );
      }
      if (url.endsWith("/events/apply-shadow")) {
        applyCount += 1;
        return new Promise<Response>((resolve) => {
          resolveApply = resolve;
        });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    const body = document.createElement("div");
    await renderBudget(body, "carver");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="FINANCIAL_CONVERSATION"]',
    );
    const textarea = form?.querySelector<HTMLTextAreaElement>(
      'textarea[name="text"]',
    );
    if (textarea) textarea.value = "Rename the Cabinetry notes.";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(
      body.querySelector(".sched-consequence-note")?.textContent,
    ).toContain("Notes updated");
    expect(body.querySelector(".sched-confirm")).toBeNull();
    expect(applyCount).toBe(1);

    resolveApply?.(jsonResponse(201, { applied: true, projectRevision: 4 }));
    await flushAsyncWork();
    expect(applyCount).toBe(1);
  });

  it("a non-clerical Tell Howler turn requires Confirm before apply-shadow", async () => {
    let applyCount = 0;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/scope")) {
        return Promise.resolve(jsonResponse(200, emptyScope()));
      }
      if (url.endsWith("/budget") && method === "GET") {
        return Promise.resolve(jsonResponse(200, initializedWorkspace()));
      }
      if (url.endsWith("/financial-conversation/turn")) {
        return Promise.resolve(
          jsonResponse(200, {
            outcome: "RESOLVED",
            historyNote: "Added commitment of $18,750.00.",
            clerical: false,
            reviewToken: "token-fc-money",
            event: { id: "evt-fc-money", baseRevision: 3 },
          }),
        );
      }
      if (url.endsWith("/events/apply-shadow")) {
        applyCount += 1;
        return Promise.resolve(
          jsonResponse(201, { applied: true, projectRevision: 4 }),
        );
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    const body = document.createElement("div");
    await renderBudget(body, "carver");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="FINANCIAL_CONVERSATION"]',
    );
    const textarea = form?.querySelector<HTMLTextAreaElement>(
      'textarea[name="text"]',
    );
    if (textarea) textarea.value = "Medina's plumbing proposal is $18,750.";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(body.textContent).toContain("Added commitment of $18,750.00.");
    expect(body.querySelector(".sched-confirm")).not.toBeNull();
    expect(applyCount).toBe(0);

    body.querySelector<HTMLButtonElement>(".sched-confirm")?.click();
    await flushAsyncWork();
    expect(applyCount).toBe(1);
  });
});
