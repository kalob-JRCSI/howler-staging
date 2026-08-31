#!/usr/bin/env node
// Task 17: the composed release regression gate. A thin orchestrator only -- every real check is
// an existing authoritative npm script or the new fixture-tested gate functions in gates.ts; this
// file adds no new safety logic of its own, only runs/interprets them and prints one clear
// PASS/FAIL summary naming the failing gate and reason.
//
// Known baseline defects: exactly two pre-existing, independently reproduced test failures (a
// CRLF-sensitive regex in test/safety/repository-policy.test.ts, and a CRLF-sensitive fixture
// budget boundary in tools/context-pack/test/select.test.ts) are recognized ONLY by their exact
// file + full test name. They are always reported, never hidden, and never block the gate BY
// THEMSELVES -- but a failure in the same file with a different name, or any other unrecognized
// failure anywhere, fails the gate closed. No wildcard/filename-only/generic suppression.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const KNOWN_BASELINE_DEFECTS = [
  {
    id: "repository-policy-crlf-regex",
    fileSuffix: "test/safety/repository-policy.test.ts",
    fullName:
      "repository policy: CI never receives Cloudflare credentials ci.yml's pull_request trigger has no branch restriction",
    note: "CRLF-sensitive regex assumes LF line endings; the committed content is compliant, only this worktree's checkout line endings trip the check.",
  },
  {
    id: "context-pack-crlf-budget-fixture",
    fileSuffix: "tools/context-pack/test/select.test.ts",
    fullName:
      "context-budget pruning prunes lower-priority-tier entries first, and mandatory material survives budget pressure",
    note: "CRLF-checked-out fixture shifts a hardcoded byte-count budget threshold across a pass/fail boundary.",
  },
];

/** Files Task 17 itself touches -- format:check runs against exactly this list, never the whole
 * repo, per the locked decision that repo-wide CRLF noise on untouched files is reported
 * separately and never blocks this gate. */
const TASK_17_TOUCHED_FILES = [
  "src/operator/observability.ts",
  "test/unit/operator-observability.test.ts",
  "test/safety/release-gate.test.ts",
  "tools/release-gate/src/schemas.ts",
  "tools/release-gate/src/gates.ts",
  "tools/release-gate/src/run.mjs",
  "tools/release-gate/tsconfig.json",
  "tools/release-gate/vitest.config.ts",
  "tools/release-gate/test/gates.test.ts",
  "package.json",
  "context/receipts/accepted/through-task-016b.json",
  "context/catalog/index.json",
  "context/catalog/tags.json",
  "context/handoff/current-task.json",
  "docs/superpowers/plans/2026-08-31-howler-v095-task17-observability-safety-gates-plan.md",
];

/** @typedef {{ id: string; pass: boolean; reason: string; location?: string }} StepResult */

/** @type {StepResult[]} */
const steps = [];

function runCommand(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
}

function npmRun(script, args = []) {
  return runCommand("npm", ["run", script, ...args]);
}

function recordSimpleGate(id, result) {
  const pass = result.status === 0;
  const tail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .trim()
    .split("\n")
    .slice(-15)
    .join("\n");
  steps.push({
    id,
    pass,
    reason: pass
      ? `${id} succeeded`
      : `${id} failed (exit ${String(result.status)})\n${tail}`,
  });
}

function runVitestJson(id, args) {
  const dir = mkdtempSync(join(tmpdir(), "howler-release-gate-"));
  const outputFile = join(dir, "report.json");
  try {
    const result = runCommand("npx", [
      "vitest",
      "run",
      ...args,
      "--reporter=json",
      `--outputFile=${outputFile}`,
    ]);
    if (!existsSync(outputFile)) {
      steps.push({
        id,
        pass: false,
        reason: `${id}: vitest produced no JSON report (exit ${String(result.status)})\n${(result.stderr ?? "").split("\n").slice(-15).join("\n")}`,
      });
      return;
    }
    /** @type {{ testResults: { name: string; assertionResults: { title: string; fullName: string; status: string }[] }[] }} */
    const report = JSON.parse(readFileSync(outputFile, "utf8"));
    const failures = [];
    for (const fileResult of report.testResults) {
      for (const assertion of fileResult.assertionResults) {
        if (assertion.status !== "failed") continue;
        failures.push({ file: fileResult.name, fullName: assertion.fullName });
      }
    }

    const known = [];
    const unknown = [];
    for (const failure of failures) {
      const match = KNOWN_BASELINE_DEFECTS.find(
        (defect) =>
          failure.file.replaceAll("\\", "/").endsWith(defect.fileSuffix) &&
          failure.fullName === defect.fullName,
      );
      if (match) known.push({ failure, defect: match });
      else unknown.push(failure);
    }

    for (const { defect } of known) {
      steps.push({
        id: `KNOWN BASELINE DEFECT: ${defect.id}`,
        pass: true,
        reason: `${defect.fileSuffix} :: ${defect.fullName}\n${defect.note}`,
      });
    }

    if (unknown.length > 0) {
      steps.push({
        id,
        pass: false,
        reason:
          `${String(unknown.length)} unrecognized failure(s):\n` +
          unknown.map((f) => `  - ${f.file} :: ${f.fullName}`).join("\n"),
      });
    } else {
      steps.push({
        id,
        pass: true,
        reason: `${id} succeeded (${String(known.length)} known baseline defect(s) excluded from blocking)`,
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runFormatCheckOnTouchedFiles() {
  const existing = TASK_17_TOUCHED_FILES.filter((f) =>
    existsSync(join(repoRoot, f)),
  );
  const result = runCommand("npx", ["prettier", "--check", ...existing]);
  recordSimpleGate("format:check (Task 17-touched files only)", result);
}

function reportRepoWideFormatNoiseInformationally() {
  const result = runCommand("npm", ["run", "format:check"]);
  const pass = result.status === 0;
  console.log(
    pass
      ? "INFO: repo-wide `npm run format:check` is currently clean."
      : "INFO (non-blocking, not evaluated by this gate): repo-wide `npm run format:check` reports pre-existing CRLF formatting noise on files outside Task 17's scope. This is not an allowlisted release-gate defect; see the Task 17 plan/report for classification.",
  );
}

// --- run every gate ---------------------------------------------------------------------------

recordSimpleGate("lint", npmRun("lint"));
recordSimpleGate("typecheck", npmRun("typecheck"));
runFormatCheckOnTouchedFiles();
runVitestJson("test (unit/integration/contract/parity/safety)", [
  "--passWithNoTests",
  "test/unit",
  "test/integration",
  "test/contract",
  "test/parity",
  "test/safety",
]);
runVitestJson("test:context-pack", [
  "--config",
  "tools/context-pack/vitest.config.ts",
]);
runVitestJson("test:release-gate", [
  "--config",
  "tools/release-gate/vitest.config.ts",
]);
recordSimpleGate("cf-typegen:check", npmRun("cf-typegen:check"));
recordSimpleGate("build:dry", npmRun("build:dry"));

reportRepoWideFormatNoiseInformationally();

// --- summary -----------------------------------------------------------------------------------

console.log("\n==================== RELEASE GATE REPORT ====================");
for (const step of steps) {
  console.log(`${step.pass ? "PASS" : "FAIL"}  ${step.id}`);
  if (!step.pass) {
    console.log(
      step.reason
        .split("\n")
        .map((line) => `      ${line}`)
        .join("\n"),
    );
  }
}

const failed = steps.filter((step) => !step.pass);
const overallPass = failed.length === 0;

console.log(
  "\n===============================================================",
);
if (overallPass) {
  console.log("RELEASE GATE: PASS");
} else {
  console.log("RELEASE GATE: FAIL");
  console.log(`Failed gate(s): ${failed.map((s) => s.id).join(", ")}`);
}
console.log(
  "===============================================================\n",
);

process.exit(overallPass ? 0 : 1);
