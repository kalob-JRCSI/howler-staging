const SESSION_COOKIE = "howler_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeBytesEqual(actual, expected) {
  let mismatch = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return mismatch === 0;
}

async function timingSafeStringEqual(actual, expected) {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return constantTimeBytesEqual(new Uint8Array(actualHash), new Uint8Array(expectedHash));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, "=");
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function cookieValue(request, name) {
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

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

function publicPath(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/__grok/") ||
    pathname.startsWith("/plans/") ||
    pathname.startsWith("/evidence/") ||
    pathname === "/favicon.svg" ||
    pathname === "/og.jpg" ||
    pathname === "/api/howler-command"
  );
}

function loginPage() {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Sign In</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; min-height: 100%; background: #0c0b09; color: #ece7dc; font: 16px/1.45 "IBM Plex Sans", ui-sans-serif, system-ui; }
    main { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
    form { width: min(360px, 100%); display: grid; gap: 12px; }
    h1 { font: 400 28px/1.1 "Source Serif 4", Georgia, serif; margin: 0; }
    p { margin: 0 0 8px; color: #b7b1a6; font-size: 13px; }
    label { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #8d877c; }
    input { background: #16140f; color: #ece7dc; border: 1px solid #3a352c; border-radius: 8px; padding: 12px; font: inherit; }
    button { background: #ece7dc; color: #0c0b09; border: 0; border-radius: 8px; padding: 12px 16px; font: 600 14px inherit; cursor: pointer; }
    #status { min-height: 1.2em; color: #d7a15b; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <form id="login-form">
      <h1>Howler</h1>
      <p>Sign in to the board.</p>
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
      if (response.ok) { location.replace('/'); return; }
      status.textContent = response.status === 401 ? 'Invalid username or password.' : 'Unable to sign in.';
    });
  </script>
</body>
</html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function handlePilotGate(request, env) {
  if (!env?.HOWLER_PILOT_PASSWORD_HASH || !env?.HOWLER_PILOT_USERNAME) return null;
  const url = new URL(request.url);
  if (publicPath(url.pathname)) return null;

  if (request.method === "POST" && url.pathname === "/auth/login") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false }, { status: 400 });
    }
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const hash = await sha256Hex(password);
    const [userOk, passOk] = await Promise.all([
      timingSafeStringEqual(username, env.HOWLER_PILOT_USERNAME),
      timingSafeStringEqual(hash, env.HOWLER_PILOT_PASSWORD_HASH),
    ]);
    if (!userOk || !passOk) return Response.json({ ok: false }, { status: 401 });
    if (!env.HOWLER_SESSION_SIGNING_SECRET) {
      return Response.json({ ok: false }, { status: 500 });
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "pilot-kalob",
      displayName: "Kalob",
      role: "OWNER_PM",
      issuedAt,
      expiresAt: issuedAt + SESSION_TTL_SECONDS,
    });
    const encoded = bytesToBase64Url(encoder.encode(payload));
    const signature = await hmacHex(env.HOWLER_SESSION_SIGNING_SECRET, encoded);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `${SESSION_COOKIE}=${encoded}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  if (url.pathname === "/auth/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        location: "/",
        "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  const secret = env.HOWLER_SESSION_SIGNING_SECRET;
  const token = cookieValue(request, SESSION_COOKIE);
  if (secret && token) {
    const dot = token.lastIndexOf(".");
    if (dot > 0) {
      const encoded = token.slice(0, dot);
      const signature = token.slice(dot + 1);
      const expected = await hmacHex(secret, encoded);
      if (await timingSafeStringEqual(signature, expected)) {
        const bytes = base64UrlToBytes(encoded);
        if (bytes) {
          try {
            const parsed = JSON.parse(new TextDecoder().decode(bytes));
            if (parsed && Math.floor(Date.now() / 1000) < parsed.expiresAt) return null;
          } catch {
            /* fall through to login */
          }
        }
      }
    }
  }

  if (url.pathname.startsWith("/api/")) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return loginPage();
}
