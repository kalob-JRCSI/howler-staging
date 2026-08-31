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
 * @typedef {{ id: string; fileSuffix: string; fullName: string; fingerprint: string; note: string }} KnownDefect
 * @typedef {{ file: string; description: string }} ClassifiedFailure
 * @typedef {{ pass: boolean; knownDefectsMatched: KnownDefect[]; unknownFailures: ClassifiedFailure[] }} ClassificationResult
 */

function firstLine(message) {
  const index = message.indexOf("\n");
  return index === -1 ? message : message.slice(0, index);
}

function matchKnownDefect(file, fullName, fingerprint, knownDefects) {
  return knownDefects.find(
    (defect) =>
      file.replaceAll("\\", "/").endsWith(defect.fileSuffix) &&
      fullName === defect.fullName &&
      fingerprint === defect.fingerprint,
  );
}

/**
 * @param {{ exitCode: number | null; report: unknown; knownDefects: KnownDefect[] }} input
 * @returns {ClassificationResult}
 */
export function classifyVitestRun({ exitCode, report, knownDefects }) {
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
      const match = matchKnownDefect(
        fileName,
        fullName,
        fingerprint,
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

  // A nonzero exit that produced no classifiable failure at all is itself suspicious (a signal,
  // a crash before the reporter could record anything meaningful, etc.) -- never silently PASS.
  if (
    exitCode !== 0 &&
    unknownFailures.length === 0 &&
    knownDefectsMatched.length === 0
  ) {
    unknownFailures.push({
      file: "(process)",
      description: `vitest exited with code ${String(exitCode)} but no failure was found in its report`,
    });
  }

  return {
    pass: unknownFailures.length === 0,
    knownDefectsMatched,
    unknownFailures,
  };
}
