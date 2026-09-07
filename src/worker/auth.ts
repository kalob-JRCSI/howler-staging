import { hmacSha256Hex } from "./hash";
import { HttpError } from "./http";

const SESSION_COOKIE = "howler_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  role: string;
}

interface SessionPayload extends AuthenticatedUser {
  issuedAt: number;
  expiresAt: number;
}

export interface PilotAuthConfig {
  username: string;
  passwordHash: string;
  user: AuthenticatedUser;
}

export interface ProductAuthEnv {
  HOWLER_PILOT_USERNAME?: string;
  HOWLER_PILOT_PASSWORD_HASH?: string;
  HOWLER_SESSION_SIGNING_SECRET?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function pilotPasswordHash(password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(password),
  );
  return bytesToHex(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, "=");
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
): boolean {
  let mismatch = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return mismatch === 0;
}

async function timingSafeStringEqual(
  actual: string,
  expected: string,
): Promise<boolean> {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return constantTimeBytesEqual(
    new Uint8Array(actualHash),
    new Uint8Array(expectedHash),
  );
}

export async function authenticatePilotUser(
  username: string,
  password: string,
  config: PilotAuthConfig,
): Promise<AuthenticatedUser | null> {
  const [usernameMatches, passwordMatches] = await Promise.all([
    timingSafeStringEqual(username, config.username),
    pilotPasswordHash(password).then((hash) =>
      timingSafeStringEqual(hash, config.passwordHash),
    ),
  ]);
  return usernameMatches && passwordMatches ? config.user : null;
}

function sessionPayload(
  user: AuthenticatedUser,
  nowMs: number,
): SessionPayload {
  const issuedAt = Math.floor(nowMs / 1000);
  return {
    ...user,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS,
  };
}

async function signPayload(
  encodedPayload: string,
  secret: string,
): Promise<string> {
  return hmacSha256Hex(secret, encodedPayload);
}

export async function createSessionCookie(
  user: AuthenticatedUser,
  secret: string,
  nowMs = Date.now(),
): Promise<string> {
  const payload = sessionPayload(user, nowMs);
  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  );
  const signature = await signPayload(encodedPayload, secret);
  return `${SESSION_COOKIE}=${encodedPayload}.${signature}; Path=/; Max-Age=${String(SESSION_TTL_SECONDS)}; HttpOnly; Secure; SameSite=Strict`;
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.id === "string" &&
    typeof payload.displayName === "string" &&
    typeof payload.role === "string" &&
    typeof payload.issuedAt === "number" &&
    typeof payload.expiresAt === "number"
  );
}

export async function readSession(
  request: Request,
  secret: string,
  nowMs = Date.now(),
): Promise<AuthenticatedUser | null> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const encodedPayload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expectedSignature = await signPayload(encodedPayload, secret);
  if (!(await timingSafeStringEqual(signature, expectedSignature))) return null;

  const bytes = base64UrlToBytes(encodedPayload);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!isSessionPayload(parsed)) return null;
  if (Math.floor(nowMs / 1000) >= parsed.expiresAt) return null;
  if (parsed.expiresAt <= parsed.issuedAt) return null;

  return {
    id: parsed.id,
    displayName: parsed.displayName,
    role: parsed.role,
  };
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function requireProductSession(
  request: Request,
  secret: string | undefined,
): Promise<AuthenticatedUser> {
  if (!secret) {
    throw new HttpError(500, "Product session signing is not configured");
  }
  const user = await readSession(request, secret);
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

export function pilotAuthConfigFromEnv(env: ProductAuthEnv): PilotAuthConfig {
  if (!env.HOWLER_PILOT_USERNAME || !env.HOWLER_PILOT_PASSWORD_HASH) {
    throw new HttpError(500, "Pilot authentication is not configured");
  }
  return {
    username: env.HOWLER_PILOT_USERNAME,
    passwordHash: env.HOWLER_PILOT_PASSWORD_HASH,
    user: {
      id: "pilot-kalob",
      displayName: "Kalob",
      role: "OWNER_PM",
    },
  };
}

export function loginPage(): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Sign In</title>
</head>
<body>
  <main>
    <h1>HOWLER</h1>
    <p>Construction Intelligence</p>
    <form id="login-form">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      <p id="status" role="status" aria-live="polite"></p>
    </form>
  </main>
  <script>
    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('status');
      status.textContent = 'Signing in...';
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value,
        }),
      });
      if (response.ok) {
        location.replace('/');
        return;
      }
      status.textContent = response.status === 401 ? 'Invalid username or password.' : 'Unable to sign in.';
    });
  </script>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    },
  );
}
