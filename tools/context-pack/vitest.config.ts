import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain-Node vitest project for tools/context-pack — deliberately not the Cloudflare/Miniflare
// pool the root vitest.config.ts uses for Howler runtime tests. This tool has no D1/Workers
// dependency at all. `root` is pinned to this file's own directory (absolute), independent of
// the CWD a caller invokes vitest from.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    include: ["test/**/*.test.ts"],
  },
});
