import legacyWorker from "./index";
import {
  authenticatePilotUser,
  clearSessionCookie,
  createSessionCookie,
  loginPage,
  pilotAuthConfigFromEnv,
  readSession,
} from "./auth";
import { HttpError, json, readJson } from "./http";
import { decorateProductDashboard } from "./product-shell";

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
  return json(
    {
      schemaVersion: "0.9.6",
      projects: rows.map((row) => ({
        projectId: row.project_id,
        projectName: row.name,
        revision: row.revision,
        updatedAt: row.updated_at,
      })),
    },
    200,
    { "cache-control": "no-store" },
  );
}

async function productDashboard(request: Request, env: Env): Promise<Response> {
  const [legacyResponse, rows] = await Promise.all([
    legacyWorker.fetch(request, env),
    readPortfolioRows(env),
  ]);
  const contentType = legacyResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return legacyResponse;

  const html = decorateProductDashboard(
    await legacyResponse.text(),
    rows.map((row) => row.project_id),
  );
  const headers = new Headers(legacyResponse.headers);
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  return new Response(html, {
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

  if (
    request.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/admin/field")
  ) {
    const secret = env.HOWLER_SESSION_SIGNING_SECRET;
    const user = secret ? await readSession(request, secret) : null;
    return user ? await productDashboard(request, env) : loginPage();
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

  return await handleProductOperatorRoute(request, env);
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
