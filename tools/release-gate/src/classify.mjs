// Task 17 correction: pure, unit-testable classification of one vitest JSON-reporter run against
// the release gate's known-baseline-defect allowlist. Extracted out of run.mjs specifically so
// its edge cases (suite crash, malformed JSON, missing report, nonzero exit with an empty
// failure list) can be proven with fixtures rather than only exercised by actually spawning
// vitest. Plain JS (not TS) because run.mjs, which is executed directly by `node` with no
// transpilation step, imports it too.
//
// Core invariant: a nonzero process exit is a failure UNLESS every individual failure found in
// the report exactly matches a known baseline defect's signature (file + full test name + a
// stable message fingerprint, i.e. the first line of the assertion's failure message, before its
// stack trace). A suite-level crash (import/setup failure) carries no test name at all, so it can
// never match a known defect and always fails closed. A well-formed report with a nonzero exit
// but no classifiable failure anywhere is itself treated as a failure -- an unexplained exit code
// is never silently trusted into a PASS.

/**
 * @typedef {{ id: string; fileSuffix: string; fullName: string; fingerprint: string; sourceLocation: string; note: string }} KnownDefect
 * @typedef {{ file: string; description: string }} ClassifiedFailure
 * @typedef {{ pass: boolean; knownDefectsMatched: KnownDefect[]; unknownFailures: ClassifiedFailure[] }} ClassificationResult
 */

function firstLine(message) {
  const index = message.indexOf("\n");
  return index === -1 ? message : message.slice(0, index);
}

/** Extracts the first stack frame's `line:column` from a failure message -- the exact call site
 * of the assertion that threw, not merely which file/test it lives in. A multi-assertion test can
 * have several `expect(...)` calls that produce byte-identical first-line messages; this is what
 * tells them apart. */
function extractSourceLocation(message) {
  const match = /:(\d+):(\d+)\b/.exec(message);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function matchKnownDefect(
  file,
  fullName,
  fingerprint,
  sourceLocation,
  knownDefects,
) {
  return knownDefects.find(
    (defect) =>
      file.replaceAll("\\", "/").endsWith(defect.fileSuffix) &&
      fullName === defect.fullName &&
      fingerprint === defect.fingerprint &&
      sourceLocation !== null &&
      sourceLocation === defect.sourceLocation,
  );
}

/**
 * A known-defect signature may excuse only its own exact assertion failure -- never a
 * process-level abnormality. `signal` truthy means the process was killed by a signal (never a
 * normal vitest completion, whether tests pass or fail); `exitCode === null` with no signal is
 * equally inexplicable (a spawn error, or any other case Node did not attribute to a specific
 * exit code or signal). Either makes the report -- even one that otherwise looks like it contains
 * only known-defect assertions -- untrustworthy, since an abnormal process may not have finished
 * writing it.
 */
function isAbnormalProcessTermination(exitCode, signal) {
  return Boolean(signal) || exitCode === null;
}

/** The numeric exit code a normal `vitest run` uses when one or more tests failed. Known-defect
 * suppression is a statement about the *content* of an otherwise-ordinary failing run's report --
 * it must never be allowed to also excuse a process exit code that could not have come from that
 * same ordinary run (0, despite the report showing a failure; 2, 130, or any other code besides
 * this one). */
const VITEST_ASSERTION_FAILURE_EXIT_CODE = 1;

/**
 * @param {{ exitCode: number | null; signal?: string | null; report: unknown; knownDefects: KnownDefect[] }} input
 * @returns {ClassificationResult}
 */
export function classifyVitestRun({
  exitCode,
  signal = null,
  report,
  knownDefects,
}) {
  if (isAbnormalProcessTermination(exitCode, signal)) {
    return {
      pass: false,
      knownDefectsMatched: [],
      unknownFailures: [
        {
          file: "(process)",
          description: signal
            ? `vitest process terminated abnormally by signal ${signal}`
            : "vitest process exited with no recognized exit code (exitCode is null and no signal was reported)",
        },
      ],
    };
  }

  if (report === null || typeof report !== "object") {
    return {
      pass: false,
      knownDefectsMatched: [],
      unknownFailures: [
        {
          file: "(report)",
          description: "vitest produced no parseable JSON report",
        },
      ],
    };
  }

  const testResults = report.testResults;
  if (!Array.isArray(testResults)) {
    return {
      pass: false,
      knownDefectsMatched: [],
      unknownFailures: [
        {
          file: "(report)",
          description: "vitest JSON report has no testResults array",
        },
      ],
    };
  }

  if (testResults.length === 0) {
    return {
      pass: false,
      knownDefectsMatched: [],
      unknownFailures: [
        {
          file: "(report)",
          description: "vitest JSON report's testResults array is empty",
        },
      ],
    };
  }

  const knownDefectsMatched = [];
  const unknownFailures = [];

  for (const file of testResults) {
    const fileName =
      typeof file?.name === "string" ? file.name : "(unknown file)";
    const assertionResults = Array.isArray(file?.assertionResults)
      ? file.assertionResults
      : [];
    const failedAssertions = assertionResults.filter(
      (a) => a && typeof a === "object" && a.status === "failed",
    );

    if (file?.status === "failed" && failedAssertions.length === 0) {
      // Suite-level failure (import/setup crash, reporter-visible but no individual test ran) --
      // no assertion identity exists to match against a known defect signature.
      unknownFailures.push({
        file: fileName,
        description:
          "suite-level failure with no individual test result (import/setup crash?)",
      });
      continue;
    }

    for (const assertion of failedAssertions) {
      const fullName =
        typeof assertion.fullName === "string" ? assertion.fullName : "";
      const failureMessages = Array.isArray(assertion.failureMessages)
        ? assertion.failureMessages
        : [];
      const firstMessage =
        typeof failureMessages[0] === "string" ? failureMessages[0] : "";
      const fingerprint = firstLine(firstMessage);
      const sourceLocation = extractSourceLocation(firstMessage);
      const match = matchKnownDefect(
        fileName,
        fullName,
        fingerprint,
        sourceLocation,
        knownDefects,
      );
      if (match) {
        knownDefectsMatched.push(match);
      } else {
        unknownFailures.push({
          file: fileName,
          description: fullName || "(unknown test)",
        });
      }
    }
  }

  // Known-defect suppression is only ever valid when the numeric exit code is internally
  // consistent with what the report actually says happened: 0 when nothing failed anywhere
  // (including known defects), and exactly VITEST_ASSERTION_FAILURE_EXIT_CODE when something did
  // -- whether that something is entirely known defects, entirely unknown failures, or a mix. Any
  // other exit code is a process/report contradiction and is never excused by a matched known
  // defect; this is checked once, after classification, rather than folded into the matching loop
  // above, so it applies uniformly regardless of which failures were found.
  const hasAnyFailure =
    knownDefectsMatched.length > 0 || unknownFailures.length > 0;
  if (!hasAnyFailure && exitCode !== 0) {
    unknownFailures.push({
      file: "(process)",
      description: `vitest exited with code ${String(exitCode)} but no failure was found in its report`,
    });
  } else if (hasAnyFailure && exitCode !== VITEST_ASSERTION_FAILURE_EXIT_CODE) {
    unknownFailures.push({
      file: "(process)",
      description:
        exitCode === 0
          ? "vitest exited with code 0 but its report shows failure(s) (report/process contradiction)"
          : `vitest exited with code ${String(exitCode)} but its report shows failure(s); expected exit code ${String(VITEST_ASSERTION_FAILURE_EXIT_CODE)} for an ordinary assertion-failure run (unexpected process exit)`,
    });
  }

  return {
    pass: unknownFailures.length === 0,
    knownDefectsMatched,
    unknownFailures,
  };
}
