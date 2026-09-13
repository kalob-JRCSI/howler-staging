export function howlerTrace(kind: string, detail?: unknown): void {
  if (typeof window === "undefined") return;
  const text =
    typeof detail === "string"
      ? detail
      : detail == null
        ? undefined
        : JSON.stringify(detail).slice(0, 500);
  void fetch("/api/howler-trace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, detail: text }),
    keepalive: true,
  }).catch(() => undefined);
}

export function howlerTraceEnv(): string {
  if (typeof window === "undefined") return "ssr";
  let frame = "top";
  try {
    frame = window.self === window.top ? "top" : "iframe";
  } catch {
    frame = "iframe";
  }
  return `${frame} ${window.location.origin}`;
}

export function howlerIsFramed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function openHowlerTab(): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(window.location.href, "_blank");
}
