// wrangler.jsonc intentionally declares only vars/bindings, not secrets, so `wrangler types`
// cannot infer HOWLER_ADMIN_KEY. This merges it into the generated Env interface per Cloudflare's
// documented pattern for project-owned secret bindings, without editing worker-configuration.d.ts.
interface Env {
  HOWLER_ADMIN_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    HOWLER_ADMIN_KEY?: string;
  }
}
