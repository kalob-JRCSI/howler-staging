import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRepoRoot } from "../src/catalog.js";

interface PackageJsonScripts {
  scripts: Record<string, string>;
}

function readPackageJson(): PackageJsonScripts {
  const raw = readFileSync(join(defaultRepoRoot(), "package.json"), "utf-8");
  return JSON.parse(raw) as PackageJsonScripts;
}

/**
 * Finding 1: the context-pack tests must be enforced by the repository's normal
 * verification/CI path, not merely runnable on their own. This is a policy assertion, not a
 * behavioral test of the packer itself — it exists specifically to catch a future accidental
 * removal of test:context-pack from verify.
 */
describe("verify enforces the context-pack test gate", () => {
  it("package.json's test:context-pack script exists and runs the tool's own vitest project", () => {
    const pkg = readPackageJson();
    expect(pkg.scripts["test:context-pack"]).toBeDefined();
    expect(pkg.scripts["test:context-pack"]).toContain(
      "tools/context-pack/vitest.config.ts",
    );
  });

  it("package.json's verify script invokes test:context-pack", () => {
    const pkg = readPackageJson();
    expect(pkg.scripts.verify).toContain("npm run test:context-pack");
  });

  it("verify still runs the pre-existing Howler runtime test suite unchanged", () => {
    const pkg = readPackageJson();
    expect(pkg.scripts.verify).toContain("npm test");
  });
});
