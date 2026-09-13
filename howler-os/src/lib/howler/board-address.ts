/** The word Howler is a name. It is never an address. */
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

export function howlerPublicHref(path = "/"): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    url.hash = "";
    if (path && path !== url.pathname) {
      url.pathname = path.startsWith("/") ? path : `/${path}`;
      url.search = "";
    }
    const href = url.toString();
    if (!isCopyableAddress(href)) return null;
    if (url.hostname === "jarvis-voice-staging.kalob.workers.dev") return href;
    if (url.hostname.endsWith(".grok.com") || url.hostname === "grok.com") return null;
    return href;
  } catch {
    return null;
  }
}

export function liveBoardHref(path = "/"): string | null {
  return howlerPublicHref(path);
}

export function boardHrefFromHost(hostHeader: string, path = "/"): string | null {
  const raw = hostHeader.split(",")[0]?.trim() ?? "";
  const host = raw.replace(/:\d+$/, "").toLowerCase();
  if (!host || host === "howler") return null;
  if (host === "grok.com" || host.endsWith(".grok.com")) return null;
  if (!host.includes(".")) return null;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const href = `https://${raw.replace(/:\d+$/, "")}${suffix}`;
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
