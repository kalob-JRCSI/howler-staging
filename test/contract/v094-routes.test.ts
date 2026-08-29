import { describe, expect, it } from "vitest";

import worker from "../../src/worker/index";

const preservedRoutes = [
  ["GET", "/"],
  ["GET", "/admin"],
  ["GET", "/health"],
  ["POST", "/v1/admin/init-db"],
  ["POST", "/v1/projects/deboard-v091/seed"],
  ["GET", "/v1/projects/deboard-v091/forecast"],
  ["GET", "/v1/projects/deboard-v091/forecast/health"],
  ["GET", "/v1/projects/deboard-v091/forecast/recovery"],
  ["GET", "/v1/projects/deboard-v091/events"],
  ["GET", "/v1/projects/deboard-v091/learning"],
  ["POST", "/v1/projects/deboard-v091/understanding/preview"],
  ["POST", "/v1/projects/deboard-v091/events/preview"],
  ["POST", "/v1/projects/deboard-v091/events/apply-shadow"],
  ["POST", "/v1/projects/deboard-v091/events/publish"],
] as const;

describe("v0.9.4 preserved route inventory", () => {
  it.each(preservedRoutes)("preserves %s %s", async (method, path) => {
    const response = await worker.fetch(
      new Request(`https://howler.test${path}`, { method }),
      {
        HOWLER_MODE: "shadow",
        HOWLER_ADMIN_KEY: "test-admin-key",
      },
      {} as ExecutionContext,
    );

    expect(response.status, `${method} ${path} must be registered`).not.toBe(404);
  });

  it("keeps shadow publication disabled after authentication", async () => {
    const response = await worker.fetch(
      new Request("https://howler.test/v1/projects/deboard-v091/events/publish", {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      {
        HOWLER_MODE: "shadow",
        HOWLER_ADMIN_KEY: "test-admin-key",
      },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Publishing is disabled while HOWLER_MODE=shadow",
    });
  });
});
