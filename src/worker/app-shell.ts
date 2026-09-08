// Phase 1 recovery (Howler product recovery directive, 2026-09-08): the authenticated product
// root now serves this minimal static shell instead of the legacy field-dashboard HTML. All real
// UI lives in the separately-built src/app/ bundle (public/app.js), which this shell loads as a
// normal external script -- exactly like public/assets/*.webp, app.js and styles.css are freely
// public static files served by Cloudflare's own asset worker (they carry no project data, only
// UI code), while every actual data read/write still goes through the existing session-gated
// /v1/* routes. This file is never patched at runtime (no more product-shell.ts-style regex
// surgery on server-rendered HTML) -- it is a fixed, small, literal template.
export function appShellHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app-root">Loading Howler…</div>
  <script type="module" src="/app.js"></script>
</body>
</html>`;
}
