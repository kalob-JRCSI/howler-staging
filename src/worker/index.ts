import { forecastInitial } from "../engine/engine";
import { createDeboardSeed } from "./deboard-seed";
import { buildHealthReport } from "./health";
import { HttpError, json, requireAdmin } from "./http";
import { D1HowlerRepository } from "./repository";

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

function requireDb(db: D1Database | undefined): D1Database {
  if (!db) throw new HttpError(503, "HOWLER_DB is not bound");
  return db;
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
    const repository = new D1HowlerRepository(requireDb(env.HOWLER_DB));
    const project = createDeboardSeed();
    if (await repository.projectExists(project.projectId)) {
      throw new HttpError(409, `Project ${project.projectId} already exists`);
    }
    const run = forecastInitial(project, new Date().toISOString());
    await repository.createProject(project, run.candidate, run.oversight);
    return json(
      {
        project,
        initialForecast: {
          modelRevision: project.revision,
          latest: run.candidate,
        },
        oversight: run.oversight,
        forecastable: run.forecastable,
        commitmentEligible: run.commitmentEligible,
        oversightPublishable: run.publishable,
        publishable: false,
        stagingOnly: true,
      },
      201,
    );
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

      const repository = new D1HowlerRepository(requireDb(env.HOWLER_DB));
      if (request.method === "GET" && route.action === "forecast") {
        const project = await repository.loadProject(route.projectId);
        if (!project) throw new HttpError(404, "Project not found");
        const latest = await repository.loadLatestForecast(route.projectId);
        return json({ modelRevision: project.revision, latest: latest ?? null });
      }
      if (request.method === "GET" && route.action === "events") {
        const limit = Number(url.searchParams.get("limit") ?? "100");
        return json({ events: await repository.loadEvents(route.projectId, limit) });
      }
      if (request.method === "GET" && route.action === "learning") {
        return json({ learning: await repository.loadLearningRecords(route.projectId) });
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
