/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import { sha256Hex } from "../../src/worker/hash";

const ADMIN_KEY = "auth-route-admin-key";
const PILOT_PASSWORD = "pilot-route-password";
const SESSION_SECRET = "auth-route-session-signing-secret";

async function productEnv(): Promise<Env> {
  return {
    ...env,
    HOWLER_ADMIN_KEY: ADMIN_KEY,
    HOWLER_PILOT_USERNAME: "kalob",
    HOWLER_PILOT_PASSWORD_HASH: await sha256Hex(PILOT_PASSWORD),
    HOWLER_SESSION_SIGNING_SECRET: SESSION_SECRET,
  };
}

function request(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string; admin?: boolean } = {},
): Request {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.admin) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.split(";", 1)[0] ?? "";
}

async function login(): Promise<{ response: Response; cookie: string }> {
  const response = await worker.fetch(
    request("POST", "/auth/login", {
      body: { username: "kalob", password: PILOT_PASSWORD },
    }),
    await productEnv(),
  );
  return { response, cookie: cookieFrom(response) };
}

describe("pilot product authentication routes", () => {
  it("shows only the login surface at the unauthenticated root", async () => {
    const response = await worker.fetch(
      request("GET", "/"),
      await productEnv(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Sign in");
    expect(html).toContain("username");
    expect(html).toContain("password");
    expect(html).not.toContain("deboard-v091");
    expect(html).not.toContain("HOWLER_ADMIN_KEY");
  });

  it("sets a secure product session cookie for valid credentials", async () => {
    const { response, cookie } = await login();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(204);
    expect(cookie).toMatch(/^howler_session=.+/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("rejects invalid credentials without creating a session", async () => {
    const response = await worker.fetch(
      request("POST", "/auth/login", {
        body: { username: "kalob", password: "wrong" },
      }),
      await productEnv(),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("renders Penthouse only when the product session is valid", async () => {
    const { cookie } = await login();
    const response = await worker.fetch(
      request("GET", "/", { cookie }),
      await productEnv(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Command the work.");
    expect(html).toContain("New project");
  });

  it("logout expires the product session", async () => {
    const { cookie } = await login();
    const response = await worker.fetch(
      request("POST", "/auth/logout", { cookie }),
      await productEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });

  it("does not let a product session authorize admin-only routes", async () => {
    const { cookie } = await login();
    const response = await worker.fetch(
      request("POST", "/v1/admin/init-db", { cookie }),
      await productEnv(),
    );

    expect(response.status).toBe(401);
  });

  it("preserves existing admin bearer authorization", async () => {
    const response = await worker.fetch(
      request("POST", "/v1/admin/init-db", { admin: true }),
      await productEnv(),
    );

    expect(response.status).not.toBe(401);
  });
});
