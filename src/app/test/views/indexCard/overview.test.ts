import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderOverview } from "../../../views/indexCard/overview";
import type { ProjectSummaryLike } from "../../../types";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function baseSummary(
  overrides: Partial<ProjectSummaryLike> = {},
): ProjectSummaryLike {
  return {
    projectId: "carver",
    projectName: "Carver",
    progressPercent: 40,
    integrity: { score: 82, condition: "Stable, exposed", primaryDriver: "" },
    budget: {
      baseline: 100000,
      spent: 40000,
      remaining: 60000,
      spentPercent: 40,
    },
    primaryExposure: "No critical exposure identified.",
    nextMovement: "Framing forecast to start 2026-09-20.",
    projectedCompletion: "2026-12-01",
    schedule: { committed: [], forecast: [] },
    scope: [{ id: "framing", label: "Framing", phase: "Framing" }],
    blockedScopeItems: [],
    scopeAddedAfterBaselineCount: 0,
    financials: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderOverview", () => {
  it("shows real priority actions and top risks from the forecast, never invented text", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, {
          modelRevision: 3,
          latest: {
            pmActions: [
              {
                activityId: "framing",
                priority: "CRITICAL",
                requiredBy: "2026-09-20",
                dueStatus: "UPCOMING",
                truthState: "FORECASTED",
                action: "Confirm framing crew for Sep 20 start.",
              },
            ],
            recoveryAnalysis: {
              protectionActions: [
                { id: "p1", action: "Secure backfill date before framing." },
              ],
            },
          },
          published: null,
        }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(body, "carver", baseSummary());

    expect(body.textContent).toContain(
      "Confirm framing crew for Sep 20 start.",
    );
    expect(body.textContent).toContain("Secure backfill date before framing.");
    expect(body.textContent).toContain("No critical exposure identified.");
    expect(body.textContent).toContain("Framing");
  });

  it("shows an honest empty state when the forecast has no priority actions or risks", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, {
          modelRevision: 0,
          latest: {
            pmActions: [],
            recoveryAnalysis: { protectionActions: [] },
          },
          published: null,
        }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(body, "carver", baseSummary());

    expect(body.textContent).toContain("No priority actions identified.");
  });

  it("still renders the summary-derived sections when the forecast read fails", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse(500, {})));
    const body = document.createElement("div");
    await renderOverview(body, "carver", baseSummary());

    expect(body.textContent).toContain("No priority actions identified.");
    expect(body.textContent).toContain("$40,000 spent / $60,000 remaining");
  });

  it("reports an unrecorded budget honestly rather than fabricating zero", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, {
          modelRevision: 0,
          latest: null,
          published: null,
        }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(
      body,
      "carver",
      baseSummary({
        budget: {
          baseline: null,
          spent: null,
          remaining: null,
          spentPercent: null,
        },
      }),
    );

    expect(body.textContent).toContain("Budget not recorded");
  });
});

describe("renderOverview: Phase 3 scope sync", () => {
  it("surfaces a BLOCKED scope item as a risk, alongside forecast-derived risks", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, { modelRevision: 0, latest: null, published: null }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(
      body,
      "carver",
      baseSummary({ blockedScopeItems: ["Custom closet"] }),
    );
    expect(body.textContent).toContain('Scope blocked: "Custom closet".');
  });

  it("reports the count of scope items added after baseline, and omits the line when zero", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, { modelRevision: 0, latest: null, published: null }),
      ),
    );
    const bodyWithAdditions = document.createElement("div");
    await renderOverview(
      bodyWithAdditions,
      "carver",
      baseSummary({ scopeAddedAfterBaselineCount: 2 }),
    );
    expect(bodyWithAdditions.textContent).toContain(
      "2 scope items added after baseline.",
    );

    const bodyWithoutAdditions = document.createElement("div");
    await renderOverview(bodyWithoutAdditions, "carver", baseSummary());
    expect(bodyWithoutAdditions.textContent).not.toContain(
      "added after baseline",
    );
  });

  it("never blends scope into progressPercent or budget -- summary fields pass through untouched", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, { modelRevision: 0, latest: null, published: null }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(
      body,
      "carver",
      baseSummary({
        progressPercent: 40,
        blockedScopeItems: ["Custom closet"],
      }),
    );
    expect(body.textContent).toContain("$40,000 spent / $60,000 remaining");
  });
});

describe("renderOverview: Phase 4 financials sync (Task 8)", () => {
  it("omits the Phase 4 financial section entirely when Budget was never set up", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, { modelRevision: 0, latest: null, published: null }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(body, "carver", baseSummary({ financials: null }));
    expect(body.textContent).not.toContain("Revised budget");
  });

  it("shows the real financial summary, with Unknown rather than a fabricated $0, once Budget is set up", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, { modelRevision: 0, latest: null, published: null }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(
      body,
      "carver",
      baseSummary({
        financials: {
          currency: "USD",
          baseline: null,
          approvedChangeOrderTotal: { amountMinor: 0, currency: "USD" },
          pendingChangeOrderTotal: { amountMinor: 0, currency: "USD" },
          revisedBudget: null,
          committedTotal: { amountMinor: 100000, currency: "USD" },
          actualTotal: { amountMinor: 50000, currency: "USD" },
          remaining: null,
        },
      }),
    );
    expect(body.textContent).toContain("Revised budget: Unknown");
    expect(body.textContent).toContain("Committed: $1,000.00");
    expect(body.textContent).toContain("Actual recorded: $500.00");
    expect(body.textContent).toContain("Remaining/uncommitted: Unknown");
  });

  it("never touches the legacy Budget line -- both sections render side by side", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, { modelRevision: 0, latest: null, published: null }),
      ),
    );
    const body = document.createElement("div");
    await renderOverview(
      body,
      "carver",
      baseSummary({
        financials: {
          currency: "USD",
          baseline: { amountMinor: 40000000, currency: "USD" },
          approvedChangeOrderTotal: { amountMinor: 0, currency: "USD" },
          pendingChangeOrderTotal: { amountMinor: 0, currency: "USD" },
          revisedBudget: { amountMinor: 40000000, currency: "USD" },
          committedTotal: { amountMinor: 0, currency: "USD" },
          actualTotal: { amountMinor: 0, currency: "USD" },
          remaining: { amountMinor: 40000000, currency: "USD" },
        },
      }),
    );
    expect(body.textContent).toContain("$40,000 spent / $60,000 remaining");
    expect(body.textContent).toContain("Revised budget: $400,000.00");
  });
});
