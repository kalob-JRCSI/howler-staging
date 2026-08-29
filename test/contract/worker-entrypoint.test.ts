import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

describe("worker entrypoint", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
  });

  it("serves the public health route through the Worker entrypoint", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const response = await worker.fetch(
      new Request("https://howler.test/health"),
      { ...env, HOWLER_MODE: "shadow", HOWLER_ADMIN_KEY: "test-admin-key" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      service: "howler-scheduling-staging",
      version: "0.9.5",
      engineCompatibilityVersion: "0.9.4",
      liveSystemsConnected: false,
    });
  });

  it("returns 404 JSON for an unknown public route", async () => {
    const response = await worker.fetch(
      new Request("https://howler.test/not-a-route"),
      { ...env, HOWLER_MODE: "shadow", HOWLER_ADMIN_KEY: "test-admin-key" },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Not found",
    });
  });
});
