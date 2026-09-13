import { createFileRoute } from "@tanstack/react-router";
import { runFieldCommand } from "@/lib/howler/field-command";
import { clientKey, rateLimited } from "@/lib/howler/guard";
import { SEED_VERSION } from "@/lib/howler/seed";
import { getJobSnapshot, setJobSnapshot } from "@/lib/howler/snapshot.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

async function handle({ request }: { request: Request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") {
    return json({ ok: true, say: "Howler is ready. Post a command." });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  if (rateLimited(`command:${clientKey(request)}`, 20, 60_000)) {
    return json({ ok: false, say: "Howler is busy. Try again in a minute." }, 429);
  }
  let command = "";
  try {
    const body = (await request.json()) as { command?: unknown; text?: unknown };
    command = String(body.command ?? body.text ?? "");
  } catch {
    return json({ ok: false, say: "I did not get that." }, 400);
  }
  const snap = getJobSnapshot();
  const result = runFieldCommand(snap.projects, command, null);
  if (result.applied) {
    setJobSnapshot({
      projects: result.projects,
      seedVersion: SEED_VERSION,
      updatedAt: Date.now(),
    });
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
