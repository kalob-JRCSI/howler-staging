// wrangler.jsonc intentionally declares only vars/bindings, not secrets, so `wrangler types`
// cannot infer HOWLER_ADMIN_KEY. This merges project-owned secret bindings into the generated Env
// interface per Cloudflare's documented pattern, without editing worker-configuration.d.ts.
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
//
// v0.9.6 pilot product auth adds three independent secret bindings. The pilot username/password
// verifier authenticates the single controlled pilot account; HOWLER_SESSION_SIGNING_SECRET signs
// the browser's HttpOnly product session. None of these reuse HOWLER_ADMIN_KEY or the confirmation
// signing secret, and none are declared in wrangler.jsonc or embedded into client code.
//
// Phase 4 Task 11 (real staging AI provider, src/worker/openai-financial-provider.ts): three more
// bindings, none yet present in wrangler.jsonc's vars or as a configured secret (confirmed via
// `wrangler secret list` against the real staging Worker) -- src/worker/financial-model-provider.ts
// safely defaults to the deterministic double until an operator adds HOWLER_OPENAI_API_KEY as a
// secret and sets HOWLER_AI_PROVIDER/HOWLER_AI_MODEL as plain vars. HOWLER_OPENAI_API_KEY must
// never be embedded into client code, canonical project state, Activity History, or logs.
interface Env {
  HOWLER_ADMIN_KEY?: string;
  HOWLER_CONFIRMATION_SIGNING_SECRET?: string;
  HOWLER_PILOT_USERNAME?: string;
  HOWLER_PILOT_PASSWORD_HASH?: string;
  HOWLER_SESSION_SIGNING_SECRET?: string;
  HOWLER_OPENAI_API_KEY?: string;
  HOWLER_AI_PROVIDER?: string;
  HOWLER_AI_MODEL?: string;
}

declare namespace Cloudflare {
  interface Env {
    HOWLER_ADMIN_KEY?: string;
    HOWLER_CONFIRMATION_SIGNING_SECRET?: string;
    HOWLER_PILOT_USERNAME?: string;
    HOWLER_PILOT_PASSWORD_HASH?: string;
    HOWLER_SESSION_SIGNING_SECRET?: string;
    HOWLER_OPENAI_API_KEY?: string;
    HOWLER_AI_PROVIDER?: string;
    HOWLER_AI_MODEL?: string;
  }
}
