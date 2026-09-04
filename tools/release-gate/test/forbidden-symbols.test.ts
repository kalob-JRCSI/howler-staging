import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractExportedValueNames,
  KNOWN_HARMLESS_NAME_COLLISIONS,
} from "../src/forbidden-symbols";
import { checkNoBrowserBusinessLogic } from "../src/gates";
import {
  createSubmissionKernel,
  fieldDashboardClientScript,
  operatorPanelClientScript,
} from "../../../src/worker/admin";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("extractExportedValueNames: fixture behavior", () => {
  it("extracts exported function names", () => {
    const source = `export function analyzeRecovery(a, b) { return a + b; }`;
    expect(extractExportedValueNames(source)).toContain("analyzeRecovery");
  });

  it("extracts exported const names", () => {
    const source = `export const OPERATOR_SAFETY = { mode: "shadow" };`;
    expect(extractExportedValueNames(source)).toContain("OPERATOR_SAFETY");
  });

  it("extracts exported class names", () => {
    const source = `export class D1HowlerRepository {}`;
    expect(extractExportedValueNames(source)).toContain("D1HowlerRepository");
  });

  it("does not extract type-only exports (they never exist at runtime)", () => {
    const source = `export type Foo = string;\nexport interface Bar { x: number }`;
    const names = extractExportedValueNames(source);
    expect(names).not.toContain("Foo");
    expect(names).not.toContain("Bar");
  });
});

describe("checkNoBrowserBusinessLogic: broader, mechanically-derived denylist", () => {
  it("PASS: client source contains no forbidden symbol", () => {
    const source = `
      function runQuery(projectId, kind) {
        void callApi(fetch, sessionStorage, adminKeyValue(), "/v1/intents", { method: "POST" });
      }
    `;
    const result = checkNoBrowserBusinessLogic(source, [
      "analyzeRecovery",
      "forecastAfterEvent",
    ]);
    expect(result.pass).toBe(true);
  });

  it("FAIL: catches a renamed local wrapper that still calls the forbidden symbol", () => {
    const source = `
      function computeForecastLocally(model, event) {
        return forecastAfterEvent(model, event);
      }
    `;
    const result = checkNoBrowserBusinessLogic(source, ["forecastAfterEvent"]);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("forecastAfterEvent");
  });

  it("FAIL: catches a bare reference (not just a call) to a forbidden symbol", () => {
    const source = `const localAlias = validateProjectModel;`;
    const result = checkNoBrowserBusinessLogic(source, [
      "validateProjectModel",
    ]);
    expect(result.pass).toBe(false);
  });

  it("does not false-positive on an unrelated identifier that merely contains a forbidden name as a substring", () => {
    const source = `function analyzeRecoveryReportUiLabel() { return "Recovery"; }`;
    const result = checkNoBrowserBusinessLogic(source, ["analyzeRecovery"]);
    expect(result.pass).toBe(true);
  });
});

describe("real repo: the mechanically-derived denylist covers actual engine/domain/operator exports", () => {
  const ENGINE_DOMAIN_OPERATOR_FILES = [
    "src/engine/confidence.ts",
    "src/engine/coverage.ts",
    "src/engine/date.ts",
    "src/engine/engine.ts",
    "src/engine/graph.ts",
    "src/engine/learning.ts",
    "src/engine/metrics.ts",
    "src/engine/oversight.ts",
    "src/engine/reducer.ts",
    "src/engine/solver.ts",
    "src/engine/storage.ts",
    "src/domain/validation.ts",
    "src/operator/intent.ts",
    "src/operator/workflow.ts",
    "src/operator/result.ts",
    "src/operator/policy.ts",
    "src/operator/observability.ts",
  ];

  function loadForbiddenSymbols(): string[] {
    const all = new Set<string>();
    for (const path of ENGINE_DOMAIN_OPERATOR_FILES) {
      const source = readFileSync(`${repoRoot}/${path}`, "utf8");
      for (const name of extractExportedValueNames(source)) all.add(name);
    }
    for (const known of KNOWN_HARMLESS_NAME_COLLISIONS) all.delete(known);
    return [...all];
  }

  it("includes far more than the previous 6-item hand-picked list", () => {
    const symbols = loadForbiddenSymbols();
    expect(symbols.length).toBeGreaterThan(20);
    expect(symbols).toContain("analyzeRecovery");
    expect(symbols).toContain("validateProjectModel");
    expect(symbols).toContain("buildExecutionTrace");
  });

  it("both Task 16A's and Task 16B's real client-embedded source pass -- no engine/domain/operator symbol leaks in", () => {
    const forbidden = loadForbiddenSymbols();
    const operatorSource =
      createSubmissionKernel.toString() + operatorPanelClientScript.toString();
    const fieldSource =
      createSubmissionKernel.toString() + fieldDashboardClientScript.toString();
    expect(checkNoBrowserBusinessLogic(operatorSource, forbidden).pass).toBe(
      true,
    );
    expect(checkNoBrowserBusinessLogic(fieldSource, forbidden).pass).toBe(true);
  });

  it("a renamed inline copy of a forbidden symbol injected into real client source is still caught", () => {
    const forbidden = loadForbiddenSymbols();
    const tampered =
      `
      function sneaky() { return analyzeRecovery(model, latest, baseline); }
    ` + fieldDashboardClientScript.toString();
    expect(checkNoBrowserBusinessLogic(tampered, forbidden).pass).toBe(false);
  });
});
