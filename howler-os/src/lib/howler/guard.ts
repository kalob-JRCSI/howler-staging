const hits = new Map<string, number[]>();
const encoder = new TextEncoder();

export function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
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

export function howlerSecret(name: string): string {
  const bag = globalThis as {
    __HOWLER_ENV?: Record<string, unknown>;
    __env__?: Record<string, unknown>;
  };
  const value = bag.__HOWLER_ENV?.[name] ?? bag.__env__?.[name] ?? process.env[name];
  return typeof value === "string" ? value : "";
}

function constantTimeBytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  let mismatch = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return mismatch === 0;
}

/** Same function as scripts/pilot-gate.mjs — used for the login password. */
export async function timingSafeStringEqual(actual: string, expected: string): Promise<boolean> {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return constantTimeBytesEqual(new Uint8Array(actualHash), new Uint8Array(expectedHash));
}

export function commandTokenFrom(request: Request, body: { token?: unknown } | null): string {
  const header = request.headers.get("x-howler-token")?.trim() ?? "";
  if (header) return header;
  return String(body?.token ?? "").trim();
}

export async function commandTokenOk(request: Request, body: { token?: unknown } | null): Promise<boolean> {
  const expected = howlerSecret("HOWLER_COMMAND_TOKEN");
  if (!expected) return false;
  return timingSafeStringEqual(commandTokenFrom(request, body), expected);
}
