/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/entry";
import { sha256Hex } from "../../src/worker/hash";

const PILOT_PASSWORD = "portfolio-contract-password";
const PRODUCT_ENV = {
  ...env,
  HOWLER_PILOT_USERNAME: "kalob",
  HOWLER_PILOT_PASSWORD_HASH: await sha256Hex(PILOT_PASSWORD),
  HOWLER_SESSION_SIGNING_SECRET: "portfolio-contract-session-secret",
} satisfies Env;

async function loginCookie(): Promise<string> {
  const response = await worker.fetch(
    new Request("https://example.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "kalob", password: PILOT_PASSWORD }),
    }),
    PRODUCT_ENV,
  );
  expect(response.status).toBe(204);
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
}

describe("GET /v1/portfolio", () => {
  it("rejects an unauthenticated product request", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/v1/portfolio"),
      PRODUCT_ENV,
    );

    expect(response.status).toBe(401);
  });

  it("accepts the signed product session instead of requiring HOWLER_ADMIN_KEY", async () => {
    const cookie = await loginCookie();
    const response = await worker.fetch(
      new Request("https://example.test/v1/portfolio", {
        headers: { cookie },
      }),
      PRODUCT_ENV,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.schemaVersion).toBe("0.9.6");
    expect(Array.isArray(body.projects)).toBe(true);
  });
});
