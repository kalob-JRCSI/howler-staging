import { buildHealthReport } from "./health";
import { HttpError, json } from "./http";

interface Env {
  HOWLER_DB?: D1Database;
  HOWLER_MODE?: string;
  HOWLER_ADMIN_KEY?: string;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    const report = await buildHealthReport(
      env.HOWLER_DB,
      env.HOWLER_MODE,
      Boolean(env.HOWLER_ADMIN_KEY),
    );
    return json(report, report.ok ? 200 : 503);
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
