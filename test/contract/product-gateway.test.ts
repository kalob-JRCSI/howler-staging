/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/entry";
import legacyWorker from "../../src/worker/index";
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

// `Response.json()` is typed `Promise<any>`; routing it through an explicit `unknown` return type
// here means the casts at each call site narrow from `unknown` (a real narrowing) rather than from
// `any` (which @typescript-eslint/no-unnecessary-type-assertion flags as a no-op).
function jsonBody(response: Response): Promise<unknown> {
  return response.json();
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
  // Phase 1 recovery: the authenticated root now serves the real Dashboard/Index Card app shell
  // (src/app/, built to public/app.js) rather than the legacy field-dashboard HTML with the
  // canonical roster embedded server-side. The shell carries no project data of its own -- the
  // app fetches GET /v1/portfolio itself, client-side, exactly like every other authenticated
  // read this gateway gates (proven separately by the v096-portfolio-routes contract test). This
  // test now only proves the shell is genuinely the new app, not the old admin-key-bearing page.
  it("serves the product app shell with no admin-key field or credential, never the legacy roster-embedded HTML", async () => {
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
    expect(html).toContain('id="app-root"');
    expect(html).toContain('src="/app.js"');
    // The shell never embeds project data server-side -- it is fetched by the app itself.
    expect(html).not.toContain("canonical-after-login");
    expect(html).not.toContain("Command the work.");
    expect(html).not.toContain('id="admin-key"');
    expect(html).not.toContain('document.getElementById("admin-key")');
    expect(html).not.toContain(
      "Paste the staging admin key to load the portfolio",
    );
    expect(html).not.toContain(ADMIN_KEY);
  });

  // Regression guard: /admin/diagnostics must always be byte-for-byte identical to the legacy
  // worker's own /admin/field output -- proving the isolation in src/worker/entry.ts really is a
  // plain, unpatched proxy (no more product-shell.ts-style regex surgery on this HTML) and can
  // never silently drift from the legacy page it is supposed to preserve.
  it("serves /admin/diagnostics byte-for-byte identical to the legacy worker's own /admin/field, unpatched", async () => {
    const product = await productEnv();
    const cookie = await loginCookie(product);

    const response = await worker.fetch(
      new Request("https://example.test/admin/diagnostics", {
        headers: { cookie },
      }),
      product,
    );
    const html = await response.text();

    const legacyResponse = await legacyWorker.fetch(
      new Request("https://example.test/admin/field"),
      product,
    );
    const legacyHtml = await legacyResponse.text();

    expect(response.status).toBe(legacyResponse.status);
    expect(html).toBe(legacyHtml);
    expect(html).toContain("Command the work.");
  });

  it("still protects /admin/diagnostics behind the product session, same as /admin/field", async () => {
    const product = await productEnv();
    const response = await worker.fetch(
      new Request("https://example.test/admin/diagnostics"),
      product,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Command the work.");
  });

  // Phase 2 recovery: src/app/router.ts owns every client-side route (/projects/:id,
  // /projects/:id/:moduleId, ...) with no matching server route table. Before this fallback, a
  // hard reload or direct link on any of those deep paths 404d -- exactly the browser action this
  // phase's own acceptance test performs after a schedule edit ("reload the browser, confirm the
  // edit persisted"). This proves the fix without a real browser: the server must answer the same
  // app shell, not a bare 404, for a deep client route.
  it("serves the app shell (not a 404) on a hard reload of a deep client-side route", async () => {
    const product = await productEnv();
    const cookie = await loginCookie(product);

    const response = await worker.fetch(
      new Request("https://example.test/projects/deboard-v091/schedule", {
        headers: { cookie },
      }),
      product,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="app-root"');
    expect(html).toContain('src="/app.js"');
  });

  it("still shows the login page for a deep client-side route with no session", async () => {
    const product = await productEnv();
    const response = await worker.fetch(
      new Request("https://example.test/projects/deboard-v091/schedule"),
      product,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Sign in");
    expect(html).not.toContain('id="app-root"');
  });

  it("never applies the SPA fallback to /v1, /admin, or /health -- their exact existing contracts are unchanged", async () => {
    const product = await productEnv();
    const cookie = await loginCookie(product);

    // A /v1 path outside the product allowlist falls through to the legacy worker exactly as
    // before -- requireAdmin's Bearer check (401 for a cookie-only request), never the app shell.
    const unknownApiRoute = await worker.fetch(
      new Request("https://example.test/v1/this-route-does-not-exist", {
        headers: { cookie },
      }),
      product,
    );
    expect(unknownApiRoute.status).toBe(401);
    expect(await unknownApiRoute.text()).not.toContain('id="app-root"');

    const health = await worker.fetch(
      new Request("https://example.test/health"),
      product,
    );
    expect(health.status).toBe(200);
    expect(await health.text()).not.toContain('id="app-root"');
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

  // Phase 2 recovery (Editable Project Schedule): the Schedule module's own read view and its
  // preview -> apply save model must be reachable through the product session -- the same cookie
  // auth every other Index Card fetch already uses -- never the raw Bearer admin key a browser
  // session never holds.
  it("exposes the Schedule module's read view and save flow to a product session, without a bearer admin key", async () => {
    const product = await productEnv();
    await legacyWorker.fetch(
      new Request("https://example.test/v1/projects/deboard-v091/seed", {
        method: "POST",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
      }),
      product,
    );
    const cookie = await loginCookie(product);

    const scheduleResponse = await worker.fetch(
      new Request("https://example.test/v1/projects/deboard-v091/schedule", {
        headers: { cookie },
      }),
      product,
    );
    expect(scheduleResponse.status).toBe(200);
    const schedule = (await jsonBody(scheduleResponse)) as {
      activities: { activityId: string }[];
    };
    expect(schedule.activities.some((a) => a.activityId === "framing")).toBe(
      true,
    );

    const previewResponse = await worker.fetch(
      new Request(
        "https://example.test/v1/projects/deboard-v091/schedule/commands/preview",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            command: {
              kind: "SET_ACTIVITY_STATE",
              activityId: "framing",
              state: "IN_PROGRESS",
            },
          }),
        },
      ),
      product,
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await jsonBody(previewResponse)) as {
      event: unknown;
      reviewToken: string;
    };

    const applyResponse = await worker.fetch(
      new Request(
        "https://example.test/v1/projects/deboard-v091/events/apply-shadow",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            event: preview.event,
            reviewToken: preview.reviewToken,
          }),
        },
      ),
      product,
    );
    expect(applyResponse.status).toBe(201);
  });

  // Phase 4 recovery (Budget + Change Orders): the Budget module's own read view and its
  // preview -> apply save model must be reachable through the product session, following the
  // exact same pattern the Schedule test above already proves.
  it("exposes the Budget module's read view and save flow to a product session, without a bearer admin key", async () => {
    const product = await productEnv();
    await legacyWorker.fetch(
      new Request("https://example.test/v1/projects/deboard-v091/seed", {
        method: "POST",
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
      }),
      product,
    );
    const cookie = await loginCookie(product);

    const budgetResponse = await worker.fetch(
      new Request("https://example.test/v1/projects/deboard-v091/budget", {
        headers: { cookie },
      }),
      product,
    );
    expect(budgetResponse.status).toBe(200);
    const budget = (await jsonBody(budgetResponse)) as { initialized: boolean };
    expect(budget.initialized).toBe(false);

    const previewResponse = await worker.fetch(
      new Request(
        "https://example.test/v1/projects/deboard-v091/budget/commands/preview",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            command: { kind: "INITIALIZE_FINANCIALS", currency: "USD" },
          }),
        },
      ),
      product,
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await jsonBody(previewResponse)) as {
      event: unknown;
      reviewToken: string;
    };

    const applyResponse = await worker.fetch(
      new Request(
        "https://example.test/v1/projects/deboard-v091/events/apply-shadow",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            event: preview.event,
            reviewToken: preview.reviewToken,
          }),
        },
      ),
      product,
    );
    expect(applyResponse.status).toBe(201);
  });
});
