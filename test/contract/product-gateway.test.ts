/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/entry";
import { pilotPasswordHash } from "../../src/worker/auth";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "product-gateway-admin-key-never-render";
const PILOT_PASSWORD = "product-gateway-password";

async function productEnv(): Promise<Env> {
  return {
    ...env,
    HOWLER_ADMIN_KEY: ADMIN_KEY,
    HOWLER_PILOT_USERNAME: "kalob",
    HOWLER_PILOT_PASSWORD_HASH: await pilotPasswordHash(PILOT_PASSWORD),
    HOWLER_SESSION_SIGNING_SECRET: "product-gateway-session-secret",
  };
}

async function loginCookie(productEnv: Env): Promise<string> {
  const response = await worker.fetch(
    new Request("https://example.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "kalob", password: PILOT_PASSWORD }),
    }),
    productEnv,
  );
  expect(response.status).toBe(204);
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

describe("authenticated product gateway", () => {
  it("renders Penthouse with the canonical roster and no visible admin credential", async () => {
    await env.HOWLER_DB.prepare(
      `INSERT INTO projects (project_id, name, revision, current_model_json, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
    )
      .bind(
        "canonical-after-login",
        "Canonical After Login",
        "{}",
        "2026-09-07T20:00:00.000Z",
      )
      .run();
    const product = await productEnv();
    const cookie = await loginCookie(product);

    const response = await worker.fetch(
      new Request("https://example.test/", { headers: { cookie } }),
      product,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("canonical-after-login");
    expect(html).toContain('id="admin-key"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value="product-session"');
    expect(html).not.toContain(
      "Paste the staging admin key to load the portfolio",
    );
    expect(html).not.toContain(ADMIN_KEY);
  });

  it("uses the product session for approved operator routes without exposing bearer auth", async () => {
    const product = await productEnv();
    const cookie = await loginCookie(product);
    const response = await worker.fetch(
      new Request("https://example.test/v1/intents", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: "{not json",
      }),
      product,
    );

    expect(response.status).toBe(400);
  });

  it("never promotes a product session to an admin route", async () => {
    const product = await productEnv();
    const cookie = await loginCookie(product);
    const response = await worker.fetch(
      new Request("https://example.test/v1/admin/init-db", {
        method: "POST",
        headers: { cookie },
      }),
      product,
    );

    expect(response.status).toBe(401);
  });
});
