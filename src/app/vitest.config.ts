import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain-jsdom vitest project for src/app/ -- deliberately not the Cloudflare/Miniflare pool the
// root vitest.config.ts uses for Howler runtime tests. workerd has no DOM at all (no document,
// no window, no HTMLElement), so this browser-side app needs a real DOM test environment instead.
// `root` is pinned to this file's own directory (absolute), independent of the CWD a caller
// invokes vitest from -- same pattern as scripts/vitest.config.ts.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
