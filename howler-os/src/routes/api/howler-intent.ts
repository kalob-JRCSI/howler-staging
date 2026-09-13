import { createFileRoute } from "@tanstack/react-router";
import { clientKey, rateLimited } from "@/lib/howler/guard";

type JobCard = { id: string; name: string; clientName: string; note: string };
const KINDS = new Set(["progress", "status", "close", "money", "plans"]);

async function intent({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (rateLimited(`intent:${clientKey(request)}`, 30, 60_000)) {
    return Response.json({ ok: false as const }, { status: 429 });
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return Response.json({ ok: false as const });

  const body = (await request.json()) as {
    text?: string;
    activeProjectId?: string | null;
    jobs?: JobCard[];
    picture?: string | null;
  };
  const text = (body.text ?? "").trim().slice(0, 1200);
  if (!text) return Response.json({ ok: false as const });

  const jobs = (body.jobs ?? []).slice(0, 12).map((job) => ({
    id: String(job.id ?? "").slice(0, 64),
    name: String(job.name ?? "").slice(0, 80),
    clientName: String(job.clientName ?? "").slice(0, 80),
    note: String(job.note ?? "").slice(0, 160),
  }));
  const ids = new Set(jobs.map((job) => job.id));
  const roster = jobs.map((job) => `${job.id}: ${job.name}`).join("\n");
  const picture = (body.picture ?? "").slice(0, 400);

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You are Howler. Fix speech-to-text for Kentucky Fine Homes jobs only. " +
            'Return JSON only: {"rewrite": string, "projectId": string|null, "kind": "progress"|"status"|"close"|"money"|"plans", "say": string}. ' +
            "kind=progress is the default. Never rewrite a progress update into plans, envelope, width, depth, garage size, studs, or drawings. " +
            "Do not invent a change order, SOP, budget move, or dollar amount. " +
            "kind=money only if they named dollars, invoice, budget, or a change order. " +
            "kind=plans only if they are talking about drawings, studs, joists, or a building size. " +
            "rewrite: keep THEIR words. Only fix names. Do not add new topics. " +
            "say: 1-2 spoken sentences, conversational. Do not mention budget unless they did.",
        },
        {
          role: "user",
          content:
            `JOBS:\n${roster}\nACTIVE: ${body.activeProjectId ?? "none"}\n` +
            (picture ? `PARSED:\n${picture}\n` : "") +
            `COMMAND:\n${text}`,
        },
      ],
    }),
  });
  if (!res.ok) return Response.json({ ok: false as const });
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return Response.json({ ok: false as const });
  try {
    const parsed = JSON.parse(match[0]) as {
      rewrite?: string;
      projectId?: string | null;
      kind?: string;
      say?: string;
    };
    const rewrite = (parsed.rewrite ?? "").trim().slice(0, 1200);
    if (!rewrite) return Response.json({ ok: false as const });
    const projectId = parsed.projectId && ids.has(parsed.projectId) ? parsed.projectId : null;
    const kind = parsed.kind && KINDS.has(parsed.kind) ? parsed.kind : "progress";
    return Response.json({
      ok: true as const,
      rewrite,
      projectId,
      kind,
      say: (parsed.say ?? "").trim().slice(0, 400) || null,
    });
  } catch {
    return Response.json({ ok: false as const });
  }
}

export const Route = createFileRoute("/api/howler-intent")({
  server: { handlers: { POST: intent } },
});
