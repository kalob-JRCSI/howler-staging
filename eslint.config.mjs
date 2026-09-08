import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "worker-configuration.d.ts",
      // Sibling git worktrees (checked out via `git worktree add .worktrees/<name>`) are separate
      // branches with their own already-reviewed history -- linting them from here reports errors
      // against code this branch never touched and cannot fix. Local wrangler/pnpm build state is
      // gitignored generated output, never source.
      ".worktrees/**",
      ".wrangler/**",
      ".pnpm-store/**",
      // Phase 1 recovery: src/app/ is a genuinely separate browser bundle (its own tsconfig,
      // DOM lib, no Cloudflare Workers globals) linted by its own fully isolated invocation
      // (src/app/eslint.config.mjs, `npm run lint:app`) instead of being swept into this run.
      // typescript-eslint's projectService has a known, unresolved upstream bug where project
      // resolution can become nondeterministic across multiple tsconfig projects depending on
      // file glob/config processing order (typescript-eslint/typescript-eslint#10159) -- adding
      // src/app/tsconfig.json as an eighth project here reproducibly broke type resolution for
      // completely unrelated, untouched files in CI (Linux) while never once reproducing locally
      // across many attempts (Windows), consistent with that issue's own description. Full
      // isolation, not further tsconfig tuning, is the only fix within this repo's control.
      "src/app/**",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
);
