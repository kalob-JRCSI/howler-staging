import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSchedule } from "../../../views/indexCard/schedule";
import type { ProjectScheduleLike, ScheduleActivityLike } from "../../../types";

// A form submit handler fires `void runCommand(...)` without the test holding its promise, and
// a real Response.json() involves more microtask hops than a couple of `await Promise.resolve()`
// can reliably flush. A single macrotask tick runs strictly after every pending microtask, so
// this reliably waits for the fire-and-forget async work above to settle.
function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// api.ts only ever calls fetch(path, init) with a plain string path -- this repo's isolated
// tsconfig types the mock's parameter as the full RequestInfo | URL union regardless, so this
// narrows explicitly rather than stringifying a possible Request/URL with String()
// (@typescript-eslint/no-base-to-string).
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

function activity(
  overrides: Partial<ScheduleActivityLike> = {},
): ScheduleActivityLike {
  return {
    activityId: "framing",
    name: "Framing",
    phase: "Framing",
    state: "NOT_STARTED",
    trade: null,
    duration: { optimistic: 2, likely: 3, conservative: 5 },
    committedStart: null,
    committedFinish: null,
    forecastStart: "2026-09-14",
    forecastFinish: "2026-09-18",
    actualStart: null,
    actualFinish: null,
    isLocked: false,
    critical: false,
    floatWorkdays: 2,
    predecessors: [],
    successors: [],
    constraints: [],
    warnings: [],
    ...overrides,
  };
}

function schedule(activities: ScheduleActivityLike[]): ProjectScheduleLike {
  return {
    projectId: "carver",
    projectRevision: 3,
    forecastVersion: 2,
    activities,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderSchedule", () => {
  it("renders every canonical activity with honest fields, never fabricated", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          schedule([
            activity(),
            activity({
              activityId: "masonry",
              name: "Masonry",
              forecastStart: null,
              forecastFinish: null,
            }),
          ]),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderSchedule(body, "carver");

    const rows = Array.from(body.querySelectorAll(".sched-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Framing");
    expect(rows[1]?.textContent).toContain("Masonry");
    // The second activity has no forecast dates -- must show an honest dash, never a guess.
    expect(rows[1]?.textContent).toContain("—");
  });

  it("shows an honest empty state when there are no activities yet", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, schedule([]))),
    );
    const body = document.createElement("div");
    await renderSchedule(body, "carver");
    expect(body.textContent).toContain("No activities recorded yet.");
  });

  it("expands a row on click to reveal dependency and constraint detail", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        jsonResponse(
          200,
          schedule([
            activity({
              constraints: [
                {
                  constraintId: "c1",
                  type: "TRADE_AVAILABILITY",
                  label: "Acme Framing Co.",
                  state: "UNVERIFIED",
                  hard: true,
                },
              ],
            }),
          ]),
        ),
      ),
    );
    const body = document.createElement("div");
    await renderSchedule(body, "carver");

    expect(body.querySelector(".sched-detail-row")).toBeNull();
    body.querySelector<HTMLElement>(".sched-row")?.click();
    expect(body.querySelector(".sched-detail-row")?.textContent).toContain(
      "Acme Framing Co.",
    );

    body.querySelector<HTMLElement>(".sched-row")?.click();
    expect(body.querySelector(".sched-detail-row")).toBeNull();
  });

  it("runs the full edit -> preview -> confirm -> apply -> reload flow for a committed-date change", async () => {
    const initial = schedule([activity()]);
    const afterApply = schedule([
      activity({ committedStart: "2026-09-18", isLocked: true }),
    ]);
    const calls: { url: string; method: string }[] = [];
    let scheduleFetchCount = 0;

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (url.endsWith("/schedule") && method === "GET") {
        scheduleFetchCount += 1;
        return Promise.resolve(
          jsonResponse(200, scheduleFetchCount === 1 ? initial : afterApply),
        );
      }
      if (url.endsWith("/schedule/commands/preview")) {
        return Promise.resolve(
          jsonResponse(200, {
            projectRevision: 3,
            reviewToken: "token-1",
            historyNote:
              'Committed dates for "Framing" changed: start unset -> 2026-09-18, finish unset -> unset.',
            event: { id: "evt-1", baseRevision: 3 },
            delta: {
              completionLikely: {
                from: "2026-10-01",
                to: "2026-10-05",
                deltaWorkdays: 4,
              },
              shiftedActivityCount: 1,
              criticalShiftCount: 0,
              shiftedActivities: [
                {
                  activityId: "framing",
                  activityName: "Framing",
                  critical: false,
                  startLikely: {
                    from: "2026-09-14",
                    to: "2026-09-18",
                    deltaWorkdays: 4,
                  },
                  finishLikely: {
                    from: "2026-09-18",
                    to: "2026-09-22",
                    deltaWorkdays: 4,
                  },
                },
              ],
            },
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
    await renderSchedule(body, "carver");

    body.querySelector<HTMLElement>(".sched-row")?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    expect(detail).not.toBeNull();

    const dateForm = detail?.querySelector<HTMLFormElement>(
      'form[data-action="SET_COMMITTED_DATES"]',
    );
    expect(dateForm).toBeDefined();
    const startInput = dateForm?.querySelector<HTMLInputElement>(
      'input[name="startDate"]',
    );
    if (startInput) startInput.value = "2026-09-18";
    dateForm?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const panel = detail?.querySelector<HTMLElement>(".sched-action-panel");
    expect(panel?.textContent).toContain("2026-09-18");
    expect(panel?.textContent).toContain("ON_TRACK");

    const confirmButton =
      panel?.querySelector<HTMLButtonElement>(".sched-confirm");
    expect(confirmButton).toBeDefined();
    confirmButton?.click();
    await flushAsyncWork();

    expect(calls.some((c) => c.url.endsWith("/events/apply-shadow"))).toBe(
      true,
    );
    // Reload after apply must re-fetch the schedule (not trust the stale in-memory copy).
    expect(scheduleFetchCount).toBeGreaterThanOrEqual(2);
  });

  it("shows an inline error and never applies when preview fails", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/schedule") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse(200, schedule([activity()])));
      }
      if (url.endsWith("/schedule/commands/preview")) {
        return Promise.resolve(
          jsonResponse(400, {
            error: "Invalid schedule command",
            details: { errors: ["activityId is required"] },
          }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const body = document.createElement("div");
    await renderSchedule(body, "carver");
    body.querySelector<HTMLElement>(".sched-row")?.click();
    const detail = body.querySelector<HTMLElement>(".sched-detail-row");
    const renameForm = detail?.querySelector<HTMLFormElement>(
      'form[data-action="RENAME_ACTIVITY"]',
    );
    renameForm?.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushAsyncWork();

    const panel = detail?.querySelector<HTMLElement>(".sched-action-panel");
    expect(panel?.textContent).toContain("Invalid schedule command");
    expect(panel?.querySelector(".sched-confirm")).toBeNull();
  });
});
