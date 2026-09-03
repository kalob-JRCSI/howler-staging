import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain-Node vitest project for tools/browser-artifact -- same reasoning as
// tools/context-pack/tools/release-gate's own configs: this tool spawns the real `wrangler`
// bundler as a child process and imports its output directly in Node, so it deliberately does not
// use the root vitest.config.ts's Cloudflare/Miniflare pool (which uses a *different* bundler
// configuration that does not reproduce the defect this tool exists to catch -- see
// test/embedded-scripts.test.ts's own comment). `root` is pinned to this file's own directory
// (absolute), independent of the CWD a caller invokes vitest from. The real wrangler build takes
// several seconds, so this suite's default timeout is raised accordingly.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
