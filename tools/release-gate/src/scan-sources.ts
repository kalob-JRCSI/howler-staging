// Task 17 final hardening (Blocker 4): repository-wide source discovery for
// checkNoLiveConnectorReferences. checkNoLiveConnectorReferences itself (gates.ts) is untouched --
// it still just inspects whichever single source string it's handed. What was missing is *which*
// files ever got handed to it: before this file existed, only the two client-embedded scripts and
// src/worker/index.ts were checked (test/safety/release-gate.test.ts), so a live connector added
// to any other file under src/worker, src/operator, src/engine, or src/domain -- a brand new file,
// or an existing file importing a new one -- would never be scanned and the release gate would
// falsely PASS. This module scans every file in a discovered path->content map (the shape Vite's
// `import.meta.glob` produces) instead of a hand-picked few, while excluding tests/docs/fixtures
// so a forbidden token appearing inside a test that asserts it's forbidden is never itself a
// violation.

import { checkNoLiveConnectorReferences } from "./gates";
import type { GateResult } from "./schemas";

const EXCLUDED_PATH_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /(^|\/)docs?\//,
  /(^|\/)fixtures?\//,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.wrangler\//,
];

/** Whether a discovered file path is out of scope for live-connector scanning -- tests, docs,
 * fixtures, and build output never count as source, no matter what strings they contain. */
export function isLiveConnectorScanExcluded(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Scans every non-excluded file in a discovered path->content map for a forbidden live connector
 * reference, reusing checkNoLiveConnectorReferences per file rather than reimplementing its token
 * matching. Fails on the first offending file (in sorted path order, for determinism); passes only
 * if every in-scope file is clean.
 */
export function scanSourcesForLiveConnectorReferences(
  sources: Record<string, string>,
): GateResult {
  const inScopePaths = Object.keys(sources)
    .filter((path) => !isLiveConnectorScanExcluded(path))
    .sort();

  for (const path of inScopePaths) {
    const content = sources[path] ?? "";
    const result = checkNoLiveConnectorReferences(content);
    if (!result.pass) {
      return {
        id: "no-live-connector-references",
        pass: false,
        reason: `${path}: ${result.reason}`,
        location: path,
      };
    }
  }

  return {
    id: "no-live-connector-references",
    pass: true,
    reason: `No forbidden live connector reference found across ${String(inScopePaths.length)} scanned source file(s)`,
  };
}
