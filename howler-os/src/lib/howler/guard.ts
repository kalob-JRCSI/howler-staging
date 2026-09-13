const hits = new Map<string, number[]>();

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "local"
  );
}

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const next = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  next.push(now);
  hits.set(key, next);
  return next.length > max;
}

export const SHARE_TOKEN_RE = /^d[a-z0-9]{8,32}$/i;

export function goodShareToken(token: string): boolean {
  return SHARE_TOKEN_RE.test(token.trim());
}

export function clampUpdatedAt(incoming: unknown, current: number | undefined): number {
  const now = Date.now();
  const value = typeof incoming === "number" && Number.isFinite(incoming) ? incoming : now;
  const stamped = Math.min(Math.max(0, value), now + 5000);
  if (current && stamped < current) return current;
  return stamped;
}
