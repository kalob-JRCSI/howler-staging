import { buildProjectSummary } from "../operator/project-summary";
import legacyWorker from "./index";
import { appShellHtml } from "./app-shell";
import {
  authenticatePilotUser,
  clearSessionCookie,
  createSessionCookie,
  loginPage,
  pilotAuthConfigFromEnv,
  readSession,
} from "./auth";
import { projectHealth } from "./health";
import { HttpError, json, readJson } from "./http";
import { D1HowlerRepository } from "./repository";

interface PortfolioProjectRow {
  project_id: string;
  name: string;
  revision: number;
  updated_at: string;
}

async function requireProductSession(
  request: Request,
  env: Env,
): Promise<void> {
  const secret = env.HOWLER_SESSION_SIGNING_SECRET;
  if (!secret) {
    throw new HttpError(500, "Product session signing is not configured");
  }
  const user = await readSession(request, secret);
  if (!user) throw new HttpError(401, "Unauthorized");
}

async function readPortfolioRows(env: Env): Promise<PortfolioProjectRow[]> {
  const result = await env.HOWLER_DB.prepare(
    `SELECT project_id, name, revision, updated_at
       FROM projects
      ORDER BY name COLLATE NOCASE ASC, project_id ASC`,
  ).all<PortfolioProjectRow>();
  return result.results;
}

async function readPortfolio(env: Env): Promise<Response> {
  const rows = await readPortfolioRows(env);
  const repo = new D1HowlerRepository(env.HOWLER_DB);
  const projects = [];

  // One browser request returns every currently-visible canonical project. The pilot repository
  // does not yet have an archive/ownership field, so the repository boundary currently treats all
  // canonical rows as visible. Keeping that decision server-side lets a later active/archive or
  // organization filter change without rewriting the Penthouse contract.
  for (const row of rows) {
    const model = await repo.loadProject(row.project_id);
    if (!model) {
      throw new Error(
        `Portfolio row ${row.project_id} disappeared while building its summary`,
      );
    }
    const forecast = await repo.loadLatestForecast(row.project_id);
    const health = await projectHealth(repo, model, forecast);
    projects.push(buildProjectSummary(model, forecast, health));
  }

  return json(
    {
      schemaVersion: "0.9.6",
      generatedAt: new Date().toISOString(),
      projects,
    },
    200,
    { "cache-control": "no-store" },
  );
}

/**
 * Phase 1 recovery: the authenticated product root is now the real Dashboard/Index Card
 * application (src/app/, built to public/app.js) rather than the legacy field-dashboard HTML.
 * The shell itself carries no project data -- src/app/main.ts fetches GET /v1/portfolio and the
 * per-project routes below on its own, client-side, exactly like any other authenticated fetch
 * this gateway already gates.
 */
function productAppShell(): Response {
  return new Response(appShellHtml(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Phase 1 recovery: the legacy field-dashboard HTML (Penthouse, Genesis intake, the
 * conversational-update box, Admin & diagnostics) is preserved byte-for-byte and relocated here --
 * never patched, never linked from the product app above. /admin/field is kept as a
 * backward-compatible alias for anyone with it bookmarked; both require the same product session
 * the rest of this gateway already requires.
 */
async function diagnosticsPage(request: Request, env: Env): Promise<Response> {
  const legacyUrl = new URL(request.url);
  legacyUrl.pathname = "/admin/field";
  const legacyResponse = await legacyWorker.fetch(
    new Request(legacyUrl, request),
    env,
  );
  const headers = new Headers(legacyResponse.headers);
  headers.set("cache-control", "no-store");
  return new Response(legacyResponse.body, {
    status: legacyResponse.status,
    statusText: legacyResponse.statusText,
    headers,
  });
}

function isProductOperatorRoute(request: Request, pathname: string): boolean {
  if (request.method === "POST" && pathname === "/v1/intents") return true;
  if (
    request.method === "POST" &&
    /^\/v1\/workflows\/[^/]+\/resume$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/summary$/.test(pathname)
  ) {
    return true;
  }
  // Phase 1 recovery: the Index Card's Overview and Activity modules read a project's forecast
  // (priority actions, recovery/risk analysis) and its event ledger (recent activity) directly --
  // the same two existing, read-only routes the legacy admin diagnostics panel already used.
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/forecast$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/events$/.test(pathname)
  ) {
    return true;
  }
  // Phase 2 recovery (Editable Project Schedule): the Schedule module's read view, plus the two
  // steps of the existing preview -> confirm -> apply save model. `schedule/commands/preview`
  // translates a typed PM edit into the exact same canonical event format `events/apply-shadow`
  // already commits -- both routes existed (or were added) specifically so a manual schedule
  // edit never needs raw JSON or a second mutation path.
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/schedule$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/schedule\/commands\/preview$/.test(pathname)
  ) {
    return true;
  }
  // Phase 3 recovery (Functional Project Scope Workspace): the Scope module's own read view and
  // preview step, following the exact same pattern as Schedule immediately above -- apply reuses
  // the existing events/apply-shadow route already allowlisted below.
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/scope$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/scope\/commands\/preview$/.test(pathname)
  ) {
    return true;
  }
  // Phase 4 recovery (Budget + Change Orders): same pattern as Schedule/Scope immediately above --
  // apply reuses the existing events/apply-shadow route already allowlisted below.
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/budget$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/budget\/commands\/preview$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "GET" &&
    /^\/v1\/projects\/[^/]+\/change-orders$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/change-orders\/commands\/preview$/.test(pathname)
  ) {
    return true;
  }
  // Phase 4 (Budget + Change Orders, Task 10): the deterministic conversational financial path --
  // same preview-only, apply-reuses-events/apply-shadow pattern as Budget/Change Orders above.
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/financial-conversation\/turn$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/events\/apply-shadow$/.test(pathname)
  ) {
    return true;
  }
  if (
    request.method === "POST" &&
    /^\/v1\/projects\/[^/]+\/conversation\/turn$/.test(pathname)
  ) {
    return true;
  }
  return (
    request.method === "POST" &&
    (pathname === "/v1/projects/genesis/preview" ||
      pathname === "/v1/projects/genesis/commit")
  );
}

async function handleProductOperatorRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!isProductOperatorRoute(request, pathname)) return null;

  const secret = env.HOWLER_SESSION_SIGNING_SECRET;
  const user = secret ? await readSession(request, secret) : null;
  if (!user) return null;

  if (!env.HOWLER_ADMIN_KEY) {
    throw new HttpError(500, "Product operator gateway is not configured");
  }
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${env.HOWLER_ADMIN_KEY}`);
  return await legacyWorker.fetch(new Request(request, { headers }), env);
}

async function handleProductBoundary(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    const secret = env.HOWLER_SESSION_SIGNING_SECRET;
    const user = secret ? await readSession(request, secret) : null;
    return user ? productAppShell() : loginPage();
  }

  // Phase 1 recovery: the legacy field-dashboard UI is relocated to its own explicit path, never
  // linked from the product app above. /admin/field is kept only as a backward-compatible alias.
  if (
    request.method === "GET" &&
    (url.pathname === "/admin/diagnostics" || url.pathname === "/admin/field")
  ) {
    const secret = env.HOWLER_SESSION_SIGNING_SECRET;
    const user = secret ? await readSession(request, secret) : null;
    return user ? await diagnosticsPage(request, env) : loginPage();
  }

  if (request.method === "GET" && url.pathname === "/v1/portfolio") {
    await requireProductSession(request, env);
    return await readPortfolio(env);
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    if (!env.HOWLER_SESSION_SIGNING_SECRET) {
      throw new HttpError(500, "Product session signing is not configured");
    }
    const raw = (await readJson(request)) as {
      username?: unknown;
      password?: unknown;
    } | null;
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.username !== "string" ||
      typeof raw.password !== "string"
    ) {
      throw new HttpError(400, "Login requires username and password strings");
    }
    const user = await authenticatePilotUser(
      raw.username,
      raw.password,
      pilotAuthConfigFromEnv(env),
    );
    if (!user) throw new HttpError(401, "Unauthorized");
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "set-cookie": await createSessionCookie(
          user,
          env.HOWLER_SESSION_SIGNING_SECRET,
        ),
      },
    });
  }

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "set-cookie": clearSessionCookie(),
      },
    });
  }

  const operatorResponse = await handleProductOperatorRoute(request, env);
  if (operatorResponse) return operatorResponse;

  // Phase 2 recovery: standard SPA fallback. src/app/router.ts (Router.render) owns all
  // client-side navigation -- the server holds no route table to keep in sync with it, and never
  // did even in Phase 1. Without this, a hard reload or direct link on any deep route (e.g.
  // /projects/:id/schedule, exercised by this phase's own browser acceptance test) 404s, because
  // the server previously only ever served the app shell at exactly "/". Every real route this
  // gateway owns (/v1/*, /admin*, /health) is excluded and keeps its exact existing behavior;
  // this only ever answers a GET that isn't one of those, with the same shell-or-login choice "/"
  // itself already makes. An unauthenticated request still only ever sees the login page; an
  // authenticated request landing on a path the client router doesn't recognize gets the app
  // shell's own honest "Not found." (Router.render's existing fallback), never fabricated content.
  if (
    request.method === "GET" &&
    !url.pathname.startsWith("/v1/") &&
    !url.pathname.startsWith("/admin") &&
    url.pathname !== "/health"
  ) {
    const secret = env.HOWLER_SESSION_SIGNING_SECRET;
    const user = secret ? await readSession(request, secret) : null;
    return user ? productAppShell() : loginPage();
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const productResponse = await handleProductBoundary(request, env);
      if (productResponse) return productResponse;
      return await legacyWorker.fetch(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          { error: error.message, details: error.details },
          error.status,
        );
      }
      const requestId = crypto.randomUUID();
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          level: "error",
          service: "howler-product-gateway-staging",
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          message,
        }),
      );
      return json({ error: "Internal server error", requestId }, 500);
    }
  },
};
