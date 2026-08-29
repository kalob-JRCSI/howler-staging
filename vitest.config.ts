import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          HOWLER_MODE: "shadow",
        },
        d1Databases: ["HOWLER_DB"],
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
