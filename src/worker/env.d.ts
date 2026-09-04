// wrangler.jsonc intentionally declares only vars/bindings, not secrets, so `wrangler types`
// cannot infer HOWLER_ADMIN_KEY. This merges it into the generated Env interface per Cloudflare's
// documented pattern for project-owned secret bindings, without editing worker-configuration.d.ts.
//
// Safety repair (blocker 2 — server-bound confirmation, corrected): HOWLER_CONFIRMATION_SIGNING_SECRET
// is a SEPARATE secret from HOWLER_ADMIN_KEY. HOWLER_ADMIN_KEY is, by this app's own design, known
// to the browser (the operator pastes it into the admin-key field; the client sends it as the
// Authorization: Bearer header on every request) — using it as an HMAC signing key for
// confirmations gave a legitimately-authenticated-but-tampering client the exact secret needed to
// forge its own valid signatures, defeating the entire point of server-side signing.
// HOWLER_CONFIRMATION_SIGNING_SECRET is never read by any client-embedded code, never included in
// any response body, and never accepted from any request — see src/worker/index.ts's
// signConfirmationMac/verifyConfirmationBinding, the only two places it is ever read.
interface Env {
  HOWLER_ADMIN_KEY?: string;
  HOWLER_CONFIRMATION_SIGNING_SECRET?: string;
}

declare namespace Cloudflare {
  interface Env {
    HOWLER_ADMIN_KEY?: string;
    HOWLER_CONFIRMATION_SIGNING_SECRET?: string;
  }
}
