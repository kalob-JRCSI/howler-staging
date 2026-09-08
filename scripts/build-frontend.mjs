// Phase 1 recovery: builds the new Dashboard/Index Card app (src/app/) into the static assets
// Cloudflare already serves from ./public (see wrangler.jsonc's assets.directory) -- app.js and
// styles.css carry no project data, only UI code, so they are freely public exactly like
// public/assets/*.webp already are. Every actual data read/write still goes through the existing
// session-gated Worker routes. Run via `npm run build:frontend`; wired into `npm run verify` and
// CI before the Wrangler bundle/dry-run steps so a stale bundle can never ship silently.

import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "public");

mkdirSync(publicDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/app/main.ts")],
  bundle: true,
  outfile: path.join(publicDir, "app.js"),
  format: "esm",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
});

copyFileSync(
  path.join(root, "src/app/styles.css"),
  path.join(publicDir, "styles.css"),
);
