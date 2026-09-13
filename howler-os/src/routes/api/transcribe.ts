import { createFileRoute } from "@tanstack/react-router";
import { clientKey, howlerSecret, rateLimited } from "@/lib/howler/guard";

const MAX_BYTES = 3_500_000;

async function transcribe({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (rateLimited(`stt:${clientKey(request)}`, 20, 60_000)) {
    return Response.json({ ok: false, error: "Slow down." }, { status: 429 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return Response.json({ ok: false, error: "Clip too long." }, { status: 413 });
  }
  const apiKey = howlerSecret("HOWLER_OPENAI_API_KEY") || howlerSecret("OPENAI_API_KEY");
  if (!apiKey) {
    return Response.json({ ok: false, error: "Voice is not available. Type the command." }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof Blob) || file.size < 800) {
    return Response.json({ ok: false, error: "No speech captured." });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "Clip too long." });
  }

  const name = file instanceof File && file.name ? file.name : "speech.webm";
  const type = file.type || "audio/webm";
  if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|mp3)|video\/webm/i.test(type) && !/\.(webm|ogg|wav|mp3|m4a)$/i.test(name)) {
    return Response.json({ ok: false, error: "That file is not speech audio." });
  }

  const body = new FormData();
  body.append("model", "whisper-1");
  body.append("language", "en");
  body.append("prompt", "Hey Howler McMillan DeBoard Ciurlizza Carver Pratt Stewart Swiderski Craven");
  body.append("file", new File([file], "speech.webm", { type }));

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  if (!res.ok) {
    return Response.json({
      ok: false,
      error: "Could not transcribe. Type the command.",
    });
  }
  const json = (await res.json()) as { text?: string };
  const text = (json.text ?? "").trim();
  if (!text) {
    return Response.json({ ok: false, error: "No words in that clip." });
  }
  return Response.json({ ok: true, text });
}

export const Route = createFileRoute("/api/transcribe")({
  server: { handlers: { POST: transcribe } },
});
