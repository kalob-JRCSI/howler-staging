import { createFileRoute } from "@tanstack/react-router";
import { runFieldCommand } from "@/lib/howler/field-command";
import { clientKey, commandTokenOk, rateLimited } from "@/lib/howler/guard";
import { SEED_VERSION } from "@/lib/howler/seed";
import { loadJobSnapshot, persistJobSnapshot } from "@/lib/howler/snapshot.server";

/** Siri door: no session cookie. Requires HOWLER_COMMAND_TOKEN. No Access-Control-Allow-Origin: *. */
const cors = {
  "Access-Control-Allow-Headers": "content-type, x-howler-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

async function handle({ request }: { request: Request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") {
    if (!(await commandTokenOk(request, null))) return json({ ok: false }, 401);
    await loadJobSnapshot();
    return json({ ok: true, say: "Howler is ready. Post a command." });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  if (rateLimited(`command:${clientKey(request)}`, 20, 60_000)) {
    return json({ ok: false, say: "Howler is busy. Try again in a minute." }, 429);
  }
  let body: { command?: unknown; text?: unknown; token?: unknown } = {};
  try {
    body = (await request.json()) as { command?: unknown; text?: unknown; token?: unknown };
  } catch {
    return json({ ok: false, say: "I did not get that." }, 400);
  }
  if (!(await commandTokenOk(request, body))) return json({ ok: false }, 401);
  const command = String(body.command ?? body.text ?? "");
  const snap = await loadJobSnapshot();
  const result = runFieldCommand(snap.projects, command, null);
  if (result.applied) {
    await persistJobSnapshot({
      projects: result.projects,
      seedVersion: SEED_VERSION,
      updatedAt: Date.now(),
    });
    // FIX2: read back before claiming Recorded
    try {
      const verify = await loadJobSnapshot();
      const jobName = result.job;
      const found = jobName
        ? Object.values(verify.projects).find((p) => p?.name === jobName || (p as { id?: string })?.id === jobName)
        : null;
      if (!found) {
        return json({
          ok: false,
          say: `${jobName || "That job"} write could not be verified. Nothing claimed as Recorded.`,
          applied: false,
          job: result.job,
        });
      }
    } catch {
      return json({
        ok: false,
        say: "Persist readback failed. Nothing claimed as Recorded.",
        applied: false,
        job: result.job,
      });
    }
  }
  return json({
    ok: true,
    say: result.say,
    applied: result.applied,
    job: result.job,
  });
}

export const Route = createFileRoute("/api/howler-command")({
  server: { handlers: { GET: handle, POST: handle, OPTIONS: handle } },
});
