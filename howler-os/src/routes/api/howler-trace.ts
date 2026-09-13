import { createFileRoute } from "@tanstack/react-router";

type TraceEvent = { t: number; kind: string; detail?: string };

const events: TraceEvent[] = [];
const MAX = 200;

async function handle({ request }: { request: Request }) {
  if (request.method === "GET") {
    return Response.json({
      events: events.slice(-40).map((event) => ({
        t: event.t,
        kind: event.kind,
        detail: (event.detail ?? "").slice(0, 160),
      })),
    });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = (await request.json().catch(() => null)) as { kind?: string; detail?: string } | null;
  if (!body?.kind) return Response.json({ ok: false }, { status: 400 });
  events.push({ t: Date.now(), kind: body.kind, detail: (body.detail ?? "").slice(0, 500) });
  if (events.length > MAX) events.splice(0, events.length - MAX);
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/howler-trace")({
  server: { handlers: { GET: handle, POST: handle } },
});
