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
