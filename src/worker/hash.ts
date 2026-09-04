type Normalizable = unknown;

function normalize(value: Normalizable): Normalizable {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Safety repair (blocker 2 — server-bound confirmation): a real, secret-keyed HMAC-SHA256 over
 * `value`'s stable JSON serialization, hex-encoded. Unlike `sha256Hex` above (an unkeyed digest —
 * anyone can recompute it, so it proves nothing about who produced a value), this proves the
 * signature could only have been produced by someone holding `secret` — the actual property
 * needed to detect a client-tampered confirmation. `secret` is expected to be a real per-
 * deployment secret already required for every request (e.g. `env.HOWLER_ADMIN_KEY`), never a
 * new one this fix introduces.
 */
export async function hmacSha256Hex(
  secret: string,
  value: unknown,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new TextEncoder().encode(stableStringify(value));
  const signature = await crypto.subtle.sign("HMAC", key, bytes);
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
