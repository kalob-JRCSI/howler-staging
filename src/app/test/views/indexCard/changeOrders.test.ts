import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderChangeOrders } from "../../../views/indexCard/changeOrders";
import type {
  ChangeOrderViewLike,
  ProjectBudgetWorkspaceLike,
  ProjectChangeOrdersWorkspaceLike,
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

function changeOrder(
  overrides: Partial<ChangeOrderViewLike> = {},
): ChangeOrderViewLike {
  return {
    id: "co1",
    number: null,
    title: "Cabinetry upgrade",
    description: null,
    reason: null,
    status: "DRAFT",
    cost: { amountMinor: 680000, currency: "USD" },
    costAllocations: [],
    allocatedTotal: { amountMinor: 0, currency: "USD" },
    unallocatedAmount: { amountMinor: 680000, currency: "USD" },
    declaredScheduleImpactDays: null,
    scopeItemIds: [],
    activityIds: [],
    categoryId: null,
    categoryName: null,
    clientApproved: null,
    requestedAt: "2026-08-01T00:00:00.000Z",
    proposedAt: null,
    approvedAt: null,
    rejectedAt: null,
    voidedAt: null,
    notes: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function workspace(
  overrides: Partial<ProjectChangeOrdersWorkspaceLike> = {},
): ProjectChangeOrdersWorkspaceLike {
  return {
    projectId: "carver",
    projectRevision: 3,
    initialized: false,
    currency: null,
    approvedTotal: null,
    pendingTotal: null,
    changeOrders: [],
    ...overrides,
  };
}

function initializedWorkspace(
  overrides: Partial<ProjectChangeOrdersWorkspaceLike> = {},
): ProjectChangeOrdersWorkspaceLike {
  return workspace({
    initialized: true,
    currency: "USD",
    approvedTotal: { amountMinor: 0, currency: "USD" },
    pendingTotal: { amountMinor: 0, currency: "USD" },
    ...overrides,
  });
}

function budgetWorkspace(
  overrides: Partial<ProjectBudgetWorkspaceLike> = {},
): ProjectBudgetWorkspaceLike {
  return {
    projectId: "carver",
    projectRevision: 3,
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
    categories: [],
    lines: [],
    commitments: [],
    actualCosts: [],
    findings: [],
    legacyBudget: null,
    ...overrides,
  };
}

function stubFetchRouting(
  routes: Record<
    string,
    (init: RequestInit | undefined) => Response | Promise<Response>
  >,
): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    for (const [suffix, handler] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return Promise.resolve(handler(init));
    }
    throw new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url}`);
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderChangeOrders", () => {
  it("shows an honest message when Budget has not been set up yet", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, workspace())),
    );
    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    expect(body.textContent).toContain("Set up Budget first");
  });

  it("renders a DRAFT change order and its exposure summary", async () => {
    stubFetchRouting({
      "/change-orders": () =>
        jsonResponse(
          200,
          initializedWorkspace({ changeOrders: [changeOrder()] }),
        ),
      "/budget": () => jsonResponse(200, budgetWorkspace()),
    });
    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    const row = body.querySelector('tr[data-co="co1"]');
    expect(row?.textContent).toContain("Cabinetry upgrade");
    expect(row?.textContent).toContain("DRAFT");
    expect(row?.textContent).toContain("$6,800.00");
  });

  it("shows an honest empty state when there are no change orders yet", async () => {
    stubFetchRouting({
      "/change-orders": () => jsonResponse(200, initializedWorkspace()),
      "/budget": () => jsonResponse(200, budgetWorkspace()),
    });
    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    expect(body.textContent).toContain("No change orders recorded yet.");
  });

  it("PROPOSE (a lifecycle action) is never clerical -- shows preview -> confirm", async () => {
    let getCoCount = 0;
    stubFetchRouting({
      "/change-orders": () => {
        getCoCount += 1;
        return jsonResponse(
          200,
          initializedWorkspace({
            changeOrders: [
              changeOrder({
                status: getCoCount === 1 ? "DRAFT" : "PROPOSED",
              }),
            ],
          }),
        );
      },
      "/budget": () => jsonResponse(200, budgetWorkspace()),
      "/change-orders/commands/preview": () =>
        jsonResponse(200, {
          projectRevision: 3,
          reviewToken: "token-1",
          historyNote: '"Cabinetry upgrade" proposed.',
          clerical: false,
          event: { id: "evt-1", baseRevision: 3 },
          delta: null,
          recoveryAnalysis: { status: "ON_TRACK", protectionActions: [] },
        }),
      "/events/apply-shadow": () =>
        jsonResponse(201, { applied: true, projectRevision: 4 }),
    });

    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    body.querySelector<HTMLElement>('tr[data-co="co1"]')?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    detail
      ?.querySelector<HTMLButtonElement>('[data-action="PROPOSE"]')
      ?.click();
    await flushAsyncWork();

    expect(body.querySelector(".sched-confirm")).not.toBeNull();
    body.querySelector<HTMLButtonElement>(".sched-confirm")?.click();
    await flushAsyncWork();
    expect(getCoCount).toBeGreaterThanOrEqual(2);
  });

  it("a clerical edit (SET_TITLE) applies immediately, with no confirmation step", async () => {
    let getCoCount = 0;
    stubFetchRouting({
      "/change-orders": () => {
        getCoCount += 1;
        return jsonResponse(
          200,
          initializedWorkspace({
            changeOrders: [
              changeOrder({
                title:
                  getCoCount === 1
                    ? "Cabinetry upgrade"
                    : "Kitchen cabinetry upgrade",
              }),
            ],
          }),
        );
      },
      "/budget": () => jsonResponse(200, budgetWorkspace()),
      "/change-orders/commands/preview": () =>
        jsonResponse(200, {
          projectRevision: 3,
          reviewToken: "token-2",
          historyNote: "Change order renamed.",
          clerical: true,
          event: { id: "evt-2", baseRevision: 3 },
          delta: null,
          recoveryAnalysis: { status: "ON_TRACK", protectionActions: [] },
        }),
      "/events/apply-shadow": () =>
        jsonResponse(201, { applied: true, projectRevision: 4 }),
    });

    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    body.querySelector<HTMLElement>('tr[data-co="co1"]')?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_TITLE"]',
    );
    const input = form?.querySelector<HTMLInputElement>('input[name="title"]');
    if (input) input.value = "Kitchen cabinetry upgrade";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(body.querySelector(".sched-confirm")).toBeNull();
    expect(getCoCount).toBeGreaterThanOrEqual(2);
  });

  it("shows an inline error and never applies when preview fails", async () => {
    stubFetchRouting({
      "/change-orders": () =>
        jsonResponse(
          200,
          initializedWorkspace({ changeOrders: [changeOrder()] }),
        ),
      "/budget": () => jsonResponse(200, budgetWorkspace()),
      "/change-orders/commands/preview": () =>
        jsonResponse(400, {
          error: "Invalid change order command",
          details: { errors: ["title is required"] },
        }),
    });

    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    body.querySelector<HTMLElement>('tr[data-co="co1"]')?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_TITLE"]',
    );
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const panel = detail?.querySelector<HTMLElement>(".sched-action-panel");
    expect(panel?.textContent).toContain("Invalid change order command");
  });

  it("mounts the Tell Howler control on an initialized workspace", async () => {
    stubFetchRouting({
      "/change-orders": () => jsonResponse(200, initializedWorkspace()),
      "/budget": () => jsonResponse(200, budgetWorkspace()),
    });
    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    expect(body.textContent).toContain("Tell Howler");
    expect(
      body.querySelector('form[data-action="FINANCIAL_CONVERSATION"]'),
    ).not.toBeNull();
  });

  it("ADD_CHANGE_ORDER posts digit-string minor units, not float * 100", async () => {
    let posted: { command?: { cost?: { amountMinor: number } } } | null = null;
    stubFetchRouting({
      "/change-orders": () => jsonResponse(200, initializedWorkspace()),
      "/budget": () => jsonResponse(200, budgetWorkspace()),
      "/change-orders/commands/preview": (init) => {
        posted = JSON.parse(String(init?.body ?? "{}")) as typeof posted;
        return jsonResponse(200, {
          projectRevision: 3,
          reviewToken: "token-money",
          historyNote: "Draft change order created.",
          clerical: false,
          event: { id: "evt-money", baseRevision: 3 },
          delta: null,
          recoveryAnalysis: { status: "ON_TRACK", protectionActions: [] },
        });
      },
    });

    const body = document.createElement("div");
    await renderChangeOrders(body, "carver");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="ADD_CHANGE_ORDER"]',
    );
    const title = form?.querySelector<HTMLInputElement>('input[name="title"]');
    const amount = form?.querySelector<HTMLInputElement>(
      'input[name="amount"]',
    );
    if (title) title.value = "Extra millwork";
    if (amount) amount.value = "10000.10";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(posted?.command?.cost?.amountMinor).toBe(1000010);
  });
});
