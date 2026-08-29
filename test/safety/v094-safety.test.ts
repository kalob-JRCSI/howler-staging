import { describe, expect, it } from "vitest";

import worker from "../../src/worker/index";

const env = {
  HOWLER_MODE: "shadow",
  HOWLER_ADMIN_KEY: "test-admin-key",
};

describe("v0.9.4 worker safety", () => {
  it("authenticates v1 before requiring a database binding", async () => {
    const response = await worker.fetch(
      new Request("https://howler.test/v1/projects/deboard-v091/events", {
        method: "GET",
      }),
      env,
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects an oversized JSON body before event handling", async () => {
    const response = await worker.fetch(
      new Request("https://howler.test/v1/projects/deboard-v091/events/preview", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
          "Content-Length": String(256 * 1024 + 1),
        },
        body: "{}",
      }),
      env,
    );
    expect(response.status).toBe(413);
  });

  it("never enables publishing in shadow mode", async () => {
    const response = await worker.fetch(
      new Request("https://howler.test/v1/projects/deboard-v091/events/publish", {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      env,
    );
    expect(response.status).toBe(403);
  });
});
