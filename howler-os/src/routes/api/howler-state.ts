import { createFileRoute } from "@tanstack/react-router";
import { clampUpdatedAt } from "@/lib/howler/guard";
import { getJobSnapshot, setJobSnapshot } from "@/lib/howler/snapshot.server";
import type { Project } from "@/lib/howler/types";

const MAX_BYTES = 1_500_000;

async function handle({ request }: { request: Request }) {
  if (request.method === "GET") {
    const snapshot = getJobSnapshot();
    if (!snapshot.updatedAt) return new Response(null, { status: 204 });
    const tag = `"${snapshot.updatedAt}"`;
    if (request.headers.get("If-None-Match") === tag) {
      return new Response(null, { status: 304, headers: { ETag: tag } });
    }
    return Response.json(snapshot, {
      headers: { ETag: tag, "Cache-Control": "private, no-store" },
    });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return new Response("Too large", { status: 413 });
  let body: { updatedAt?: number; seedVersion?: string; projects?: Record<string, Project> };
  try {
    body = JSON.parse(raw) as { updatedAt?: number; seedVersion?: string; projects?: Record<string, Project> };
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!body?.projects || typeof body.seedVersion !== "string") {
    return Response.json({ ok: false }, { status: 400 });
  }
  const current = getJobSnapshot();
  const updatedAt = clampUpdatedAt(body.updatedAt, current.updatedAt || undefined);
  if (current.updatedAt && updatedAt < current.updatedAt) {
    return Response.json({ ok: true, updatedAt: current.updatedAt });
  }
  setJobSnapshot({ projects: body.projects, seedVersion: body.seedVersion, updatedAt });
  return Response.json({ ok: true, updatedAt });
}

export const Route = createFileRoute("/api/howler-state")({
  server: { handlers: { GET: handle, POST: handle } },
});
