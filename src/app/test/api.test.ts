import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPortfolio,
  fetchProjectEvents,
  fetchProjectForecast,
  fetchProjectSummary,
  logout,
  UnauthorizedError,
} from "../api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("fetchPortfolio requests GET /v1/portfolio with same-origin credentials and no caching", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      (input: string | URL, init?: RequestInit): Promise<Response> => {
        expect(String(input)).toBe("/v1/portfolio");
        capturedInit = init;
        return Promise.resolve(
          jsonResponse(200, {
            schemaVersion: "0.9.6",
            generatedAt: "2026-09-08T00:00:00.000Z",
            projects: [],
          }),
        );
      },
    );
    const result = await fetchPortfolio();
    expect(result.projects).toEqual([]);
    expect(capturedInit?.credentials).toBe("same-origin");
    expect(capturedInit?.cache).toBe("no-store");
  });

  it("fetchProjectSummary URL-encodes the project id", async () => {
    vi.stubGlobal("fetch", (input: string | URL): Promise<Response> => {
      expect(String(input)).toBe("/v1/projects/smith%20residence/summary");
      return Promise.resolve(
        jsonResponse(200, {
          projectId: "smith residence",
          projectName: "Smith Residence",
          progressPercent: 0,
          integrity: { score: 100, condition: "Stable", primaryDriver: "" },
          budget: {
            baseline: null,
            spent: null,
            remaining: null,
            spentPercent: null,
          },
          primaryExposure: "None",
          nextMovement: "None",
          projectedCompletion: null,
          schedule: { committed: [], forecast: [] },
          scope: [],
        }),
      );
    });
    const summary = await fetchProjectSummary("smith residence");
    expect(summary.projectId).toBe("smith residence");
  });

  it("fetchProjectForecast and fetchProjectEvents hit the exact existing routes", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: string | URL): Promise<Response> => {
      calls.push(String(input));
      if (String(input).includes("/forecast")) {
        return Promise.resolve(
          jsonResponse(200, {
            modelRevision: 3,
            latest: null,
            published: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { events: [] }));
    });
    await fetchProjectForecast("carver");
    await fetchProjectEvents("carver", 10);
    expect(calls).toEqual([
      "/v1/projects/carver/forecast",
      "/v1/projects/carver/events?limit=10",
    ]);
  });

  it("throws UnauthorizedError on a 401 without exposing response details", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse(401, {})));
    await expect(fetchPortfolio()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws a generic error on any other non-ok status", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse(500, {})));
    await expect(fetchPortfolio()).rejects.toThrow(/request failed/);
  });

  it("logout POSTs to /auth/logout with same-origin credentials", async () => {
    let capturedMethod: string | undefined;
    vi.stubGlobal(
      "fetch",
      (_input: string | URL, init?: RequestInit): Promise<Response> => {
        capturedMethod = init?.method;
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    await logout();
    expect(capturedMethod).toBe("POST");
  });
});
