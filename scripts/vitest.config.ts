import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain-Node vitest project for scripts/ — deliberately not the Cloudflare/Miniflare pool the
// root vitest.config.ts uses for Howler runtime tests. activate-pilot.ts talks to a real HTTP
// server over Node's global fetch/node:crypto/node:url and has no D1/Workers dependency of its
// own (D1 lives entirely on the other side of the HTTP boundary it calls). `root` is pinned to
// this file's own directory (absolute), independent of the CWD a caller invokes vitest from --
// same pattern as tools/context-pack/vitest.config.ts.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    include: ["test/**/*.test.ts"],
  },
});
