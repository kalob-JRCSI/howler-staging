const MAX_JSON_BYTES = 256 * 1024;
const encoder = new TextEncoder();

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = "HttpError";
  }
}

async function readBodyText(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new HttpError(
      413,
      `JSON body exceeds ${String(MAX_JSON_BYTES)} bytes`,
    );
  }
  if (!request.body) return "";
  // Ambient `body` type is untyped `ReadableStream`; pin the reader's element type explicitly.
  const reader =
    request.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel("request body too large");
        throw new HttpError(
          413,
          `JSON body exceeds ${String(MAX_JSON_BYTES)} bytes`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const text = await readBodyText(request);
  if (!text.trim()) throw new HttpError(400, "JSON body is required");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

async function timingSafeTokenEqual(
  actual: string,
  expected: string,
): Promise<boolean> {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(actualHash, expectedHash);
}

export async function requireAdmin(
  request: Request,
  expected: string | undefined,
): Promise<void> {
  if (!expected) throw new HttpError(500, "HOWLER_ADMIN_KEY is not configured");
  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!(await timingSafeTokenEqual(actual, expected)))
    throw new HttpError(401, "Unauthorized");
}
