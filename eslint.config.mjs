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
