import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain-Node vitest project for tools/release-gate — same reasoning as tools/context-pack's own
// config: this tool has no D1/Workers dependency, so it deliberately does not use the root
// vitest.config.ts's Cloudflare/Miniflare pool. `root` is pinned to this file's own directory
// (absolute), independent of the CWD a caller invokes vitest from.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    include: ["test/**/*.test.ts"],
  },
});
