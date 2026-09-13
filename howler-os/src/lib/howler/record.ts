function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function recordingSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

export function createHoldRecorder(): {
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
} {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  return {
    start: async () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mime = pickMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.start();
    },
    stop: () =>
      new Promise((resolve) => {
        const rec = recorder;
        const live = stream;
        recorder = null;
        stream = null;
        if (!rec || rec.state === "inactive") {
          live?.getTracks().forEach((track) => track.stop());
          resolve(null);
          return;
        }
        rec.onstop = () => {
          live?.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          chunks = [];
          resolve(blob.size >= 800 ? blob : null);
        };
        rec.stop();
      }),
  };
}

export async function transcribeBlob(blob: Blob): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const form = new FormData();
  const ext = blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("file", new File([blob], `speech.${ext}`, { type: blob.type || "audio/webm" }));
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
  if (!json) return { ok: false, error: "Could not transcribe. Type the command." };
  if (json.ok && json.text) return { ok: true, text: json.text };
  return { ok: false, error: json.error || "Could not transcribe. Type the command." };
}
