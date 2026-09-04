import { describe, expect, it } from "vitest";
import { classifyVitestRun } from "../src/classify.mjs";

// sourceLocation is the exact "line:column" of the *specific* accepted assertion within its
// multi-assertion test -- the accepted context-pack test has several `expect(...).toBe(...)`
// calls with the same generic failure text ("expected false to be true"), so file+fullName+
// fingerprint alone cannot tell the accepted `fixture-budget-a` assertion apart from, say, its
// neighboring `fixture-mandatory-safety` assertion failing for a real, unrelated reason. These
// exact values were captured from a real run against the current accepted source
// (test/safety/repository-policy.test.ts:45:74, tools/context-pack/test/select.test.ts:306:63).
// If either accepted assertion's line ever moves (an unrelated edit above it in the same file),
// this signature stops matching and the defect correctly reverts to an unrecognized, blocking
// failure -- updating these two location values is then an intentional, reviewed action, not an
// automatic one.
const REPO_POLICY_DEFECT = {
  id: "repository-policy-crlf-regex",
  fileSuffix: "test/safety/repository-policy.test.ts",
  fullName:
    "repository policy: CI never receives Cloudflare credentials ci.yml's pull_request trigger has no branch restriction",
  fingerprint:
    "AssertionError: pull_request trigger must be present: expected null not to be null // Object.is equality",
  sourceLocation: "45:74",
  note: "CRLF-sensitive regex.",
};

const CONTEXT_PACK_DEFECT = {
  id: "context-pack-crlf-budget-fixture",
  fileSuffix: "tools/context-pack/test/select.test.ts",
  fullName:
    "context-budget pruning prunes lower-priority-tier entries first, and mandatory material survives budget pressure",
  fingerprint:
    "AssertionError: expected false to be true // Object.is equality",
  sourceLocation: "306:63",
  note: "CRLF-checked-out fixture budget boundary.",
};

const KNOWN_DEFECTS = [REPO_POLICY_DEFECT, CONTEXT_PACK_DEFECT];

function assertion(overrides = {}) {
  return {
    fullName: REPO_POLICY_DEFECT.fullName,
    status: "failed",
    failureMessages: [
      `${REPO_POLICY_DEFECT.fingerprint}\n    at file.ts:${REPO_POLICY_DEFECT.sourceLocation}`,
    ],
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
                  `${CONTEXT_PACK_DEFECT.fingerprint}\n    at select.ts:${CONTEXT_PACK_DEFECT.sourceLocation}`,
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

describe("BLOCKER 1: known-defect signature includes the exact assertion's source location", () => {
  // The accepted context-pack test has several `expect(...).toBe(...)` calls that share the same
  // generic "expected false to be true" first-line message. Simulates the two *other* real
  // assertions in that same test (fixture-mandatory-safety, fixture-handoff-current) failing for
  // a genuinely unrelated reason, at their own distinct source lines -- neither may be mistaken
  // for the one accepted `fixture-budget-a` defect merely because the file/name/generic message
  // line all coincide.
  function contextPackFileResult(sourceLocation: string) {
    return {
      name: "C:/repo/tools/context-pack/test/select.test.ts",
      status: "failed",
      assertionResults: [
        {
          fullName: CONTEXT_PACK_DEFECT.fullName,
          status: "failed",
          failureMessages: [
            `${CONTEXT_PACK_DEFECT.fingerprint}\n    at select.ts:${sourceLocation}`,
          ],
        },
      ],
    };
  }

  it("1: the exact accepted context-budget assertion (matching source location) -> KNOWN BASELINE DEFECT", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: {
        testResults: [
          contextPackFileResult(CONTEXT_PACK_DEFECT.sourceLocation),
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([CONTEXT_PACK_DEFECT]);
  });

  it("2: same test, but the mandatory-safety assertion fails instead (earlier line) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      // fixture-mandatory-safety's expect() is several lines above fixture-budget-a's.
      report: { testResults: [contextPackFileResult("299:10")] },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
    expect(result.unknownFailures).toHaveLength(1);
  });

  it("3: same test, but the handoff-current assertion fails instead (a different line) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: { testResults: [contextPackFileResult("302:10")] },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("4: same file/name/generic-first-line, any other source location -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: { testResults: [contextPackFileResult("999:99")] },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("5: the accepted assertion appears to have moved (location shifted by an unrelated edit) -> fails closed until the signature is deliberately updated", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      // One plausible shift: four lines were added above the assertion.
      report: { testResults: [contextPackFileResult("310:63")] },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
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

describe("BLOCKER 2: known-defect suppression never excuses process-level abnormality", () => {
  const cleanKnownDefectReport = {
    testResults: [fileResult()],
  };

  it("1: known defect + normal expected exit (signal null) -> KNOWN BASELINE DEFECT, nonblocking", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([REPO_POLICY_DEFECT]);
  });

  it("2: known defect present, but the process was killed by a signal -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: null,
      signal: "SIGTERM",
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("3: known defect present, but exitCode is null with no signal reported -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: null,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("4: known defect + an extra unexplained suite failure (normal process) -> FAIL, known defect still reported", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: {
        testResults: [
          fileResult(),
          {
            name: "test/unit/other.test.ts",
            status: "failed",
            assertionResults: [],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toEqual([REPO_POLICY_DEFECT]);
  });

  it("5: exactly the two known defects, normal process -> allowed (PASS)", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: {
        testResults: [
          fileResult(),
          {
            name: "C:/repo/tools/context-pack/test/select.test.ts",
            status: "failed",
            assertionResults: [
              {
                fullName: CONTEXT_PACK_DEFECT.fullName,
                status: "failed",
                failureMessages: [
                  `${CONTEXT_PACK_DEFECT.fingerprint}\n    at select.ts:${CONTEXT_PACK_DEFECT.sourceLocation}`,
                ],
              },
            ],
          },
        ],
      },
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([
      REPO_POLICY_DEFECT,
      CONTEXT_PACK_DEFECT,
    ]);
  });

  it("6: known defect + an unrecognized process failure (exitCode null) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: null,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });

  it("omitting signal entirely (backward compatible) behaves like signal: null for a normal exit", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
  });
});

describe("BLOCKER 3 (final): known-defect suppression requires an internally consistent process exit code", () => {
  // Prior to this fix, once a failure was classified as an exact known baseline defect, the
  // classifier stopped caring what the numeric exit code actually was -- only the *unclassified*
  // path checked exit code at all. That meant a report showing only the accepted known defect,
  // paired with a process exit code that could never actually occur for an ordinary vitest
  // assertion-failure run (0 -- contradicts the report; 2, 130, etc -- not vitest's normal
  // failure code), was still suppressed into a silent PASS.
  const cleanKnownDefectReport = { testResults: [fileResult()] };

  const bothKnownDefectsReport = {
    testResults: [
      fileResult(),
      {
        name: "C:/repo/tools/context-pack/test/select.test.ts",
        status: "failed",
        assertionResults: [
          {
            fullName: CONTEXT_PACK_DEFECT.fullName,
            status: "failed",
            failureMessages: [
              `${CONTEXT_PACK_DEFECT.fingerprint}\n    at select.ts:${CONTEXT_PACK_DEFECT.sourceLocation}`,
            ],
          },
        ],
      },
    ],
  };

  const noFailuresReport = {
    testResults: [
      {
        name: "test/unit/x.test.ts",
        status: "passed",
        assertionResults: [{ fullName: "x works", status: "passed" }],
      },
    ],
  };

  const knownPlusUnknownReport = {
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
  };

  it("1: exact known defect + exitCode 1 -> allowed known baseline defect", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([REPO_POLICY_DEFECT]);
  });

  it("2: both exact known defects + exitCode 1 -> allowed known baseline defects", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: bothKnownDefectsReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
    expect(result.knownDefectsMatched).toEqual([
      REPO_POLICY_DEFECT,
      CONTEXT_PACK_DEFECT,
    ]);
  });

  it("3: exact known defect + exitCode 0 -> FAIL (report/process contradiction)", () => {
    const result = classifyVitestRun({
      exitCode: 0,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.unknownFailures.length).toBeGreaterThan(0);
  });

  it("4: exact known defect + exitCode 2 -> FAIL (unexpected process exit)", () => {
    const result = classifyVitestRun({
      exitCode: 2,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.unknownFailures.length).toBeGreaterThan(0);
  });

  it("5: exact known defect + an arbitrary nonzero exit code other than the expected one -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: 130,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.unknownFailures.length).toBeGreaterThan(0);
  });

  it("6: known defect + signal -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: null,
      signal: "SIGTERM",
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("7: known defect + null exitCode (no signal reported) -> FAIL", () => {
    const result = classifyVitestRun({
      exitCode: null,
      signal: null,
      report: cleanKnownDefectReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toHaveLength(0);
  });

  it("8: known defect + unknown assertion + otherwise-expected failure exit (1) -> FAIL, known defect still reported", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: knownPlusUnknownReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
    expect(result.knownDefectsMatched).toEqual([REPO_POLICY_DEFECT]);
  });

  it("9: no failures anywhere + exitCode 0 -> PASS", () => {
    const result = classifyVitestRun({
      exitCode: 0,
      signal: null,
      report: noFailuresReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(true);
  });

  it("10: no failures anywhere + exitCode 1 -> FAIL (unexplained nonzero exit)", () => {
    const result = classifyVitestRun({
      exitCode: 1,
      signal: null,
      report: noFailuresReport,
      knownDefects: KNOWN_DEFECTS,
    });
    expect(result.pass).toBe(false);
  });
});
