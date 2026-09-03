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
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyVitestRun } from "./classify.mjs";
import {
  resolveChangedFiles,
  resolveComparisonBase,
  resolveMergeBaseSha,
} from "./changed-files.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function resolveGitRevision(revision) {
  const result = runCommand("git", ["rev-parse", "--verify", revision]);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function comparisonBase() {
  const explicitSha = process.env.RELEASE_GATE_BASE_SHA;
  const ciBaseRef = process.env.GITHUB_BASE_REF;
  const ciBaseSha = process.env.GITHUB_BASE_SHA;
  const ciBaseRefSha = ciBaseRef
    ? resolveGitRevision(`origin/${ciBaseRef}`)
    : undefined;
  const localBaseRef =
    process.env.RELEASE_GATE_BASE_REF ?? "origin/v0.9.5-dashboard-bridge";
  const resolved = resolveComparisonBase({
    explicitSha,
    explicitShaValid: Boolean(explicitSha && resolveGitRevision(explicitSha)),
    ciBaseRef,
    ciBaseSha,
    ciBaseShaValid: Boolean(ciBaseSha && resolveGitRevision(ciBaseSha)),
    localBaseRef,
    localBaseRefSha: ciBaseRefSha ?? resolveGitRevision(localBaseRef),
  });
  return resolved;
}

/** Extensions Prettier reliably formats in this repo -- filters the dynamic changed-file list so
 * an unrelated binary/unsupported file never produces gate noise. Still fully dynamic: this is a
 * type filter, not a filename allowlist. */
const FORMATTABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".html",
]);

// Each signature has three independent parts -- exact source file, exact full test name (describe
// path + title), and a stable fingerprint (the first line of the assertion's failure message,
// before its stack trace, so no absolute path or line number is part of the signature). All three
// must match; a failure with the same file+name but a different message is a different failure
// and fails closed. See tools/release-gate/test/classify.test.ts for the exhaustive matching
// behavior this feeds.
// `sourceLocation` (the exact "line:column" of this one assertion, captured from a real run
// against the current accepted source) is required alongside file+fullName+fingerprint because
// the accepted context-pack test has several `expect(...).toBe(...)` calls sharing the same
// generic "expected false to be true" message -- without it, a different assertion in that same
// test failing for a real, unrelated reason could be mistaken for this defect. If either
// accepted assertion's line ever moves (an unrelated edit above it in the same file), this
// signature stops matching by design; updating these two values back to reality is then a
// deliberate, reviewed action, not automatic.
const KNOWN_BASELINE_DEFECTS = [
  {
    id: "repository-policy-crlf-regex",
    fileSuffix: "test/safety/repository-policy.test.ts",
    fullName:
      "repository policy: CI never receives Cloudflare credentials ci.yml's pull_request trigger has no branch restriction",
    fingerprint:
      "AssertionError: pull_request trigger must be present: expected null not to be null // Object.is equality",
    sourceLocation: "45:74",
    note: "CRLF-sensitive regex assumes LF line endings; the committed content is compliant, only this worktree's checkout line endings trip the check.",
  },
  {
    id: "context-pack-crlf-budget-fixture",
    fileSuffix: "tools/context-pack/test/select.test.ts",
    fullName:
      "context-budget pruning prunes lower-priority-tier entries first, and mandatory material survives budget pressure",
    fingerprint:
      "AssertionError: expected false to be true // Object.is equality",
    sourceLocation: "306:63",
    note: "CRLF-checked-out fixture shifts a hardcoded byte-count budget threshold across a pass/fail boundary.",
  },
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

    let report = null;
    if (existsSync(outputFile)) {
      try {
        report = JSON.parse(readFileSync(outputFile, "utf8"));
      } catch {
        report = null; // malformed JSON -- classifyVitestRun treats this the same as no report
      }
    }

    const classification = classifyVitestRun({
      exitCode: result.status,
      signal: result.signal,
      report,
      knownDefects: KNOWN_BASELINE_DEFECTS,
    });

    for (const defect of classification.knownDefectsMatched) {
      steps.push({
        id: `KNOWN BASELINE DEFECT: ${defect.id}`,
        pass: true,
        reason: `${defect.fileSuffix} :: ${defect.fullName}\n${defect.note}`,
      });
    }

    if (classification.pass) {
      steps.push({
        id,
        pass: true,
        reason: `${id} succeeded (${String(classification.knownDefectsMatched.length)} known baseline defect(s) excluded from blocking)`,
      });
    } else {
      steps.push({
        id,
        pass: false,
        reason:
          `${String(classification.unknownFailures.length)} unrecognized failure(s) (process exit ${String(result.status)}${result.signal ? `, signal ${result.signal}` : ""}):\n` +
          classification.unknownFailures
            .map((f) => `  - ${f.file} :: ${f.description}`)
            .join("\n"),
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Discovers the candidate's actually-changed files dynamically -- against BASE_SHA (tracked
 * changes, staged or not) plus any new untracked file -- rather than a hardcoded list frozen to
 * one task's file set. A future candidate with a different diff is checked correctly without
 * this script needing to be edited first.
 *
 * Diffs from the actual merge-base (divergence point) between the comparison base and HEAD, not
 * from the base ref's current tip -- a plain two-dot diff against a base ref that has advanced
 * with unrelated commits since this branch diverged would otherwise pull those unrelated files
 * into the changed-file scope (empirically reproduced: see resolveMergeBaseSha's own doc comment
 * and tools/release-gate/test/changed-files.test.ts).
 *
 * Fails closed: any failure to resolve/discover comparison state (an invalid BASE_SHA, a
 * nonexistent commit, unrelated histories with no merge-base, a spawn error, an untracked-file
 * discovery failure) is surfaced as an `ok:false` result with a reason -- it is never silently
 * converted into an empty file list, which would make the format-check gate vacuously PASS over a
 * candidate that was never actually compared against anything.
 */
function getChangedFiles() {
  const base = comparisonBase();
  if (!base.ok) return base;
  const mergeBase = resolveMergeBaseSha(
    runCommand("git", ["merge-base", base.base, "HEAD"]),
  );
  if (!mergeBase.ok) return mergeBase;
  const diffResult = runCommand("git", ["diff", "--name-only", mergeBase.sha]);
  const untrackedResult = runCommand("git", [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  return resolveChangedFiles({ diffResult, untrackedResult });
}

function runFormatCheckOnChangedFiles() {
  const base = comparisonBase();
  const gateId = base.ok
    ? `format:check (changed files vs ${base.base.slice(0, 12)})`
    : "format:check (changed files vs unresolved base)";
  const discovery = getChangedFiles();
  if (!discovery.ok) {
    steps.push({
      id: gateId,
      pass: false,
      reason: `changed-file discovery failed: ${discovery.reason}`,
    });
    return;
  }
  const formattable = discovery.files.filter(
    (f) =>
      FORMATTABLE_EXTENSIONS.has(extname(f)) && existsSync(join(repoRoot, f)),
  );
  if (formattable.length === 0) {
    steps.push({
      id: gateId,
      pass: true,
      reason: "No formattable changed files found against the base",
    });
    return;
  }
  const result = runCommand("npx", ["prettier", "--check", ...formattable]);
  recordSimpleGate(gateId, result);
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
runFormatCheckOnChangedFiles();
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
runVitestJson("test:browser-artifact", [
  "--config",
  "tools/browser-artifact/vitest.config.ts",
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
