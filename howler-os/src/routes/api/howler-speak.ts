import { createFileRoute } from "@tanstack/react-router";
import { clientKey, rateLimited } from "@/lib/howler/guard";

/** Howler voice. Optional rented engine. Client only talks to Howler. */

async function speak({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (rateLimited(`speak:${clientKey(request)}`, 20, 60_000)) {
    return new Response("Slow down", { status: 429 });
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return new Response("Voice offline", { status: 503 });
  const body = (await request.json()) as { text?: string };
  const text = (body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (!text) return new Response("Empty", { status: 400 });

  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: "eve",
      language: "en",
    }),
  });
  if (!res.ok) {
    const fallback = await fetch("https://api.x.ai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-voice-latest",
        voice: "eve",
        input: text,
      }),
    });
    if (!fallback.ok) return new Response("TTS failed", { status: 502 });
    return new Response(fallback.body, {
      headers: { "Content-Type": fallback.headers.get("Content-Type") || "audio/mpeg" },
    });
  }
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mpeg" },
  });
}

export const Route = createFileRoute("/api/howler-speak")({
  server: { handlers: { POST: speak } },
});
