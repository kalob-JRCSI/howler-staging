import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderActivity } from "../../../views/indexCard/activity";

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

describe("renderActivity", () => {
  it("renders the real event ledger, most recent revision first", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, {
          events: [
            {
              id: "e1",
              baseRevision: 0,
              type: "PM_RECONCILIATION",
              occurredAt: "2026-09-01T12:00:00.000Z",
              note: "Baseline evidence recorded.",
            },
            {
              id: "e2",
              baseRevision: 1,
              type: "SET_ACTUAL_START",
              occurredAt: "2026-09-05T09:00:00.000Z",
              note: "Framing started.",
            },
          ],
        }),
      ),
    );
    const body = document.createElement("div");
    await renderActivity(body, "carver");

    const items = Array.from(body.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Framing started.");
    expect(items[1]).toContain("Baseline evidence recorded.");
  });

  it("falls back to the event type when no note is present", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(200, {
          events: [
            {
              id: "e1",
              baseRevision: 0,
              type: "PM_RECONCILIATION",
              occurredAt: "2026-09-01T12:00:00.000Z",
            },
          ],
        }),
      ),
    );
    const body = document.createElement("div");
    await renderActivity(body, "carver");
    expect(body.textContent).toContain("PM_RECONCILIATION");
  });

  it("shows an honest empty state when no events exist yet", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, { events: [] })),
    );
    const body = document.createElement("div");
    await renderActivity(body, "carver");
    expect(body.textContent).toContain("No project activity recorded yet.");
  });

  it("shows an honest error state when the read fails, never fabricated activity", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse(500, {})));
    const body = document.createElement("div");
    await renderActivity(body, "carver");
    expect(body.textContent).toContain("Could not load project activity.");
  });
});
