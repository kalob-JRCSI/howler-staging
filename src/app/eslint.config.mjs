import tseslint from "typescript-eslint";

// Phase 1 recovery: a fully separate, isolated ESLint config for src/app/ -- deliberately never
// merged into the root eslint.config.mjs's single project-service run. See that file's own
// comment for why: typescript-eslint/typescript-eslint#10159 (project service resolution can
// become nondeterministic across multiple tsconfig projects depending on glob/config processing
// order), which reproducibly broke unrelated files' type resolution in CI once this project was
// added as an eighth tsconfig project to the shared run. This config's own `project` points
// directly at src/app/tsconfig.json (the older, explicit-path style, not projectService) so it
// never needs to auto-discover anything.
export default tseslint.config({
  files: ["**/*.ts"],
  extends: [tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: {
      project: ["./tsconfig.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
  },
});
