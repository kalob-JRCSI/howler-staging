import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderScope } from "../../../views/indexCard/scope";
import type { ProjectScopeLike, ScopeItemViewLike } from "../../../types";

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

function scopeItem(
  overrides: Partial<ScopeItemViewLike> = {},
): ScopeItemViewLike {
  return {
    id: "s1",
    description: "Custom closet",
    phase: "Finishes",
    status: "NOT_STARTED",
    included: true,
    trade: null,
    allowance: null,
    responsibleVendor: null,
    activities: [],
    notes: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    addedAfterBaseline: true,
    baselineDescription: null,
    baselinePhase: null,
    ...overrides,
  };
}

function scope(items: ScopeItemViewLike[]): ProjectScopeLike {
  return {
    projectId: "carver",
    projectRevision: 3,
    items,
    insights: [],
    allActivities: [
      {
        activityId: "framing",
        activityName: "Framing",
        activityState: "NOT_STARTED",
      },
    ],
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderScope", () => {
  it("renders every scope item honestly, marking items added after baseline", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, scope([scopeItem()]))),
    );
    const body = document.createElement("div");
    await renderScope(body, "carver");

    const rows = Array.from(body.querySelectorAll(".sched-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Custom closet");
    expect(rows[0]?.textContent).toContain("(new)");
  });

  it("shows an honest empty state when there is no scope yet", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse(200, scope([]))));
    const body = document.createElement("div");
    await renderScope(body, "carver");
    expect(body.textContent).toContain("No scope items recorded yet.");
  });

  it("shows baseline comparison in the detail panel for a materialized baseline item", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          scope([
            scopeItem({
              description: "Hall bathroom tile",
              addedAfterBaseline: false,
              baselineDescription: "Master shower tile",
              baselinePhase: "Finishes",
            }),
          ]),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderScope(body, "carver");
    body.querySelector<HTMLElement>(".sched-row")?.click();
    expect(body.querySelector(".sched-detail-row")?.textContent).toContain(
      "Master shower tile",
    );
  });

  it("applies a clerical edit immediately, with no confirmation step", async () => {
    const initial = scope([scopeItem()]);
    const afterApply = scope([
      scopeItem({ description: "Walk-in custom closet" }),
    ]);
    let scopeFetchCount = 0;
    const calls: string[] = [];

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url.endsWith("/scope") && method === "GET") {
        scopeFetchCount += 1;
        return Promise.resolve(
          jsonResponse(200, scopeFetchCount === 1 ? initial : afterApply),
        );
      }
      if (url.endsWith("/scope/commands/preview")) {
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-1",
            historyNote:
              'Scope "Custom closet" renamed to "Walk-in custom closet".',
            clerical: true,
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
    await renderScope(body, "carver");
    body.querySelector<HTMLElement>(".sched-row")?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_DESCRIPTION"]',
    );
    const input = form?.querySelector<HTMLInputElement>(
      'input[name="description"]',
    );
    if (input) input.value = "Walk-in custom closet";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    expect(calls.some((c) => c.includes("/events/apply-shadow"))).toBe(true);
    expect(scopeFetchCount).toBeGreaterThanOrEqual(2);
    expect(body.querySelector(".sched-confirm")).toBeNull();
  });

  it("shows the preview -> confirm flow for a material edit (SET_STATUS)", async () => {
    const initial = scope([scopeItem()]);
    const afterApply = scope([scopeItem({ status: "IN_PROGRESS" })]);
    let scopeFetchCount = 0;

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/scope") && method === "GET") {
        scopeFetchCount += 1;
        return Promise.resolve(
          jsonResponse(200, scopeFetchCount === 1 ? initial : afterApply),
        );
      }
      if (url.endsWith("/scope/commands/preview")) {
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-2",
            historyNote:
              '"Custom closet" status changed from NOT_STARTED to IN_PROGRESS.',
            clerical: false,
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
    await renderScope(body, "carver");
    body.querySelector<HTMLElement>(".sched-row")?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_STATUS"]',
    );
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const panel = detail?.querySelector<HTMLElement>(".sched-action-panel");
    expect(panel?.textContent).toContain("IN_PROGRESS");
    const confirmButton =
      panel?.querySelector<HTMLButtonElement>(".sched-confirm");
    expect(confirmButton).toBeDefined();
    expect(scopeFetchCount).toBe(1);

    confirmButton?.click();
    await flushAsyncWork();
    expect(scopeFetchCount).toBeGreaterThanOrEqual(2);
  });

  it("shows an inline error and never applies when preview fails", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/scope") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse(200, scope([scopeItem()])));
      }
      if (url.endsWith("/scope/commands/preview")) {
        return Promise.resolve(
          jsonResponse(400, {
            error: "Invalid scope command",
            details: { errors: ["description is required"] },
          }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const body = document.createElement("div");
    await renderScope(body, "carver");
    body.querySelector<HTMLElement>(".sched-row")?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const form = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_DESCRIPTION"]',
    );
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const panel = detail?.querySelector<HTMLElement>(".sched-action-panel");
    expect(panel?.textContent).toContain("Invalid scope command");
  });

  it("filters the visible items by phase", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          scope([
            scopeItem({
              id: "a",
              description: "Kitchen backsplash",
              phase: "Finishes",
            }),
            scopeItem({
              id: "b",
              description: "Rough plumbing",
              phase: "MEP Rough",
            }),
          ]),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderScope(body, "carver");
    expect(body.querySelectorAll(".sched-row")).toHaveLength(2);

    const select = body.querySelector<HTMLSelectElement>("#scope-phase-filter");
    if (select) {
      select.value = "Finishes";
      select.dispatchEvent(new Event("change"));
    }
    const rows = body.querySelectorAll(".sched-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Kitchen backsplash");
  });
});
