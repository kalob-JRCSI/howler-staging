import { describe, expect, it } from "vitest";
import { classifyVitestRun } from "../src/classify.mjs";

const REPO_POLICY_DEFECT = {
  id: "repository-policy-crlf-regex",
  fileSuffix: "test/safety/repository-policy.test.ts",
  fullName:
    "repository policy: CI never receives Cloudflare credentials ci.yml's pull_request trigger has no branch restriction",
  fingerprint:
    "AssertionError: pull_request trigger must be present: expected null not to be null // Object.is equality",
  note: "CRLF-sensitive regex.",
};

const CONTEXT_PACK_DEFECT = {
  id: "context-pack-crlf-budget-fixture",
  fileSuffix: "tools/context-pack/test/select.test.ts",
  fullName:
    "context-budget pruning prunes lower-priority-tier entries first, and mandatory material survives budget pressure",
  fingerprint:
    "AssertionError: expected false to be true // Object.is equality",
  note: "CRLF-checked-out fixture budget boundary.",
};

const KNOWN_DEFECTS = [REPO_POLICY_DEFECT, CONTEXT_PACK_DEFECT];

function assertion(overrides = {}) {
  return {
    fullName: REPO_POLICY_DEFECT.fullName,
    status: "failed",
    failureMessages: [`${REPO_POLICY_DEFECT.fingerprint}\n    at file.ts:1:1`],
    ...overrides,
  };
}

function fileResult(overrides = {}) {
  return {
    name: "C:/repo/test/safety/repository-policy.test.ts",
    status: "failed",
    assertionResults: [assertion()],
    ...overrides,
  };
}

describe("clean run", () => {
  it("PASS: exit 0, no failed assertions anywhere", () => {
    const result = classifyVitestRun({
      exitCode: 0,
      report: {
        testResults: [
          {
            name: "test/unit/x.test.ts",
            status: "passed",
            assertionResults: [{ fullName: "x works", status: "passed" }],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.unknownFailures).toHaveLength(0);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });
});

describe("HIGH 1: exact known-defect signature matching", () => {
  it("1: exact known failure -> classified as the known baseline defect, pass=true", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: { testResults: [fileResult()] },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([REPO_POLICY_DEFECT]);
    expect(result.unknownFailures).toHaveLength(0);
  });

  it("2: same file + same test name + different assertion message -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          fileResult({
            assertionResults: [
              assertion({
                failureMessages: [
                  "AssertionError: something else entirely // Object.is equality\n    at file.ts:1:1",
                ],
              }),
            ],
          }),
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
    expect(result.unknownFailures).toHaveLength(1);
  });

  it("3: same file + different test name -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          fileResult({
            assertionResults: [
              assertion({ fullName: "some other test entirely" }),
            ],
          }),
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("4: identical fullName + fingerprint but in a different file -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          fileResult({ name: "C:/repo/test/unit/unrelated.test.ts" }),
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("5: malformed/missing failure data (no failureMessages) -> FAIL, never guessed as known", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          fileResult({
            assertionResults: [assertion({ failureMessages: [] })],
          }),
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("matches the second known defect independently of the first", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          {
            name: "C:/repo/tools/context-pack/test/select.test.ts",
            status: "failed",
            assertionResults: [
              {
                fullName: CONTEXT_PACK_DEFECT.fullName,
                status: "failed",
                failureMessages: [
                  `${CONTEXT_PACK_DEFECT.fingerprint}\n    at select.ts:99:1`,
                ],
              },
            ],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([CONTEXT_PACK_DEFECT]);
  });

  it("a real failure alongside a known one still fails overall, but the known one is still reported", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          fileResult(),
          {
            name: "test/unit/other.test.ts",
            status: "failed",
            assertionResults: [
              {
                fullName: "something genuinely broke",
                status: "failed",
                failureMessages: ["AssertionError: broke\n    at x:1:1"],
              },
            ],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toEqual([REPO_POLICY_DEFECT]);
    expect(result.unknownFailures).toHaveLength(1);
  });
});

describe("HIGH 2: nonzero exit must never silently become PASS", () => {
  it("suite-level import/setup failure (empty assertionResults) -> FAIL even though zero assertions failed", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          {
            name: "test/safety/broken-import.test.ts",
            status: "failed",
            assertionResults: [],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.unknownFailures.length).toBeGreaterThan(0);
  });

  it("nonzero exit with a report that shows zero failures anywhere -> FAIL (unexplained)", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          {
            name: "test/unit/x.test.ts",
            status: "passed",
            assertionResults: [{ fullName: "x", status: "passed" }],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("testResults is an empty array -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 0,
      report: { testResults: [] },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("report is null (missing output file / reporter crash) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: null,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("report is malformed (testResults not an array) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: { testResults: "not-an-array" },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("report is not even an object (e.g. a parse fallback string) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: "not json",
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("process killed by signal (exitCode null) with no report -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: null,
      report: null,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("a classifier can never infer success solely because zero assertions were found failed, when the exit code says otherwise", () => {
    // Same shape as the originally-reproduced bug: a crashed suite with no assertions, but the
    // top-level exit code is nonzero.
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        success: false,
        testResults: [
          {
            name: "test/safety/whatever.test.ts",
            status: "failed",
            message: "Cannot find module '../../src/operator/does-not-exist'",
            assertionResults: [],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });
});
