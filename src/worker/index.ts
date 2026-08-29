import { buildHealthReport } from "./health";
import { HttpError, json, requireAdmin } from "./http";

interface Env {
  HOWLER_DB?: D1Database;
  HOWLER_MODE?: string;
  HOWLER_ADMIN_KEY?: string;
}

const ADMIN_HTML =
  "<!doctype html><html><body><main><h1>Howler staging admin</h1></main></body></html>";

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function projectRoute(
  pathname: string,
): { projectId: string; action: string } | undefined {
  const match = /^\/v1\/projects\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match?.[1] || !match[2]) return undefined;
  return { projectId: decodeURIComponent(match[1]), action: match[2] };
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (
    request.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/admin")
  ) {
    return html(ADMIN_HTML);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    const report = await buildHealthReport(
      env.HOWLER_DB,
      env.HOWLER_MODE,
      Boolean(env.HOWLER_ADMIN_KEY),
    );
    return json(report, report.ok ? 200 : 503);
  }

  if (request.method === "POST" && url.pathname === "/v1/admin/init-db") {
    await requireAdmin(request, env.HOWLER_ADMIN_KEY);
    return json({ error: "v0.9.4 init-db handler recovery pending" }, 501);
  }

  if (
    request.method === "POST" &&
    url.pathname === "/v1/projects/deboard-v091/seed"
  ) {
    await requireAdmin(request, env.HOWLER_ADMIN_KEY);
    return json({ error: "v0.9.4 seed handler recovery pending" }, 501);
  }

  const route = projectRoute(url.pathname);
  if (route) {
    const getActions = new Set([
      "forecast",
      "forecast/health",
      "forecast/recovery",
      "events",
      "learning",
    ]);
    const postActions = new Set([
      "understanding/preview",
      "events/preview",
      "events/apply-shadow",
      "events/publish",
    ]);
    const registered =
      (request.method === "GET" && getActions.has(route.action)) ||
      (request.method === "POST" && postActions.has(route.action));

    if (registered) {
      await requireAdmin(request, env.HOWLER_ADMIN_KEY);
      if (request.method === "POST" && route.action === "events/publish") {
        return json(
          { error: "Publishing is disabled while HOWLER_MODE=shadow" },
          403,
        );
      }
      return json(
        { error: `v0.9.4 ${route.action} handler recovery pending` },
        501,
      );
    }
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          error.details === undefined
            ? { error: error.message }
            : { error: error.message, details: error.details },
          error.status,
        );
      }
      console.error(error);
      return json({ error: "Internal server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
