/** Howler’s live address. Never Grok. Never the word Howler. */
export const HOWLER_PUBLIC_ORIGIN = "https://jarvis-voice-staging.kalob.workers.dev";

export function howlerPublicHref(path = "/"): string {
  const suffix = !path || path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return `${HOWLER_PUBLIC_ORIGIN}${suffix}`;
}

export function isCopyableAddress(value: string): boolean {
  const text = value.trim();
  if (!text || text.toLowerCase() === "howler") return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname.length > 0 && url.hostname.toLowerCase() !== "howler";
  } catch {
    return false;
  }
}

export const isHowlerHttps = isCopyableAddress;

export function liveBoardHref(path = "/"): string | null {
  const href = howlerPublicHref(path);
  return isCopyableAddress(href) ? href : null;
}

export function boardHrefFromHost(_hostHeader: string, path = "/"): string | null {
  const href = howlerPublicHref(path);
  return isCopyableAddress(href) ? href : null;
}

export function applyTabTitle(href = howlerPublicHref()): void {
  if (typeof document === "undefined") return;
  if (href && isCopyableAddress(href)) document.title = href;
}

export async function copyHttpsAddress(value: string): Promise<boolean> {
  if (!isCopyableAddress(value)) return false;
  try {
    await navigator.clipboard.writeText(value);
    if (typeof navigator.clipboard.readText === "function") {
      const got = (await navigator.clipboard.readText()).trim();
      if (got.toLowerCase() === "howler") return false;
    }
    return true;
  } catch {
    const node = document.createElement("textarea");
    node.value = value;
    node.setAttribute("readonly", "");
    node.style.position = "fixed";
    node.style.left = "0";
    node.style.top = "0";
    node.style.width = "2px";
    node.style.height = "2px";
    document.body.appendChild(node);
    node.focus();
    node.select();
    node.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    node.remove();
    return ok;
  }
}
