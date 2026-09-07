import legacyWorker from "./kernel";
import {
  authenticatePilotUser,
  clearSessionCookie,
  createSessionCookie,
  loginPage,
  pilotAuthConfigFromEnv,
  readSession,
} from "./auth";
import { HttpError, json, readJson } from "./http";

async function handleProductBoundary(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    const secret = env.HOWLER_SESSION_SIGNING_SECRET;
    const user = secret ? await readSession(request, secret) : null;
    return user ? legacyWorker.fetch(request, env) : loginPage();
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
