import { describe, expect, it } from "vitest";
import {
  isLiveConnectorScanExcluded,
  scanSourcesForLiveConnectorReferences,
} from "../src/scan-sources";

// BLOCKER 4: checkNoLiveConnectorReferences (tools/release-gate/src/gates.ts) only ever inspected
// whichever single source string a caller happened to hand it -- before this file existed, real
// repo coverage (test/safety/release-gate.test.ts) only fed it the two client-embedded scripts
// and src/worker/index.ts, so a live connector added anywhere else under src/worker, src/operator,
// src/engine, or src/domain (a new file, or an existing file gaining a new import) would never be
// scanned at all and the release gate would falsely PASS. scanSourcesForLiveConnectorReferences
// closes that gap by scanning every discovered file in a path->content map (as produced by Vite's
// `import.meta.glob`) rather than a hand-picked few, while still ignoring tests/docs/fixtures so a
// reference to a forbidden token *inside a test asserting it's forbidden* is never itself a
// violation. It reuses checkNoLiveConnectorReferences verbatim per file; it does not reimplement it.

describe("isLiveConnectorScanExcluded", () => {
  it("excludes test files", () => {
    expect(isLiveConnectorScanExcluded("src/worker/index.test.ts")).toBe(true);
    expect(
      isLiveConnectorScanExcluded("test/safety/release-gate.test.ts"),
    ).toBe(true);
  });

  it("excludes docs and fixtures", () => {
    expect(isLiveConnectorScanExcluded("docs/notes.md")).toBe(true);
    expect(isLiveConnectorScanExcluded("src/worker/fixtures/sample.ts")).toBe(
      true,
    );
  });

  it("does not exclude real source files", () => {
    expect(isLiveConnectorScanExcluded("src/worker/google-calendar.ts")).toBe(
      false,
    );
    expect(isLiveConnectorScanExcluded("src/operator/policy.ts")).toBe(false);
  });
});

describe("scanSourcesForLiveConnectorReferences", () => {
  it("1: a clean set of source files passes", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/index.ts": `export function handle() { return fetch("/v1/intents"); }`,
      "src/operator/policy.ts": `export const OPERATOR_SAFETY = { mode: "shadow" };`,
    });
    expect(result.pass).toBe(true);
  });

  it("2: a new file with a Google Calendar client reference fails", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/index.ts": `export function handle() { return fetch("/v1/intents"); }`,
      "src/worker/google-calendar.ts": `const client = new GoogleCalendarClient(credentials);`,
    });
    expect(result.pass).toBe(false);
    expect(result.location).toBe("src/worker/google-calendar.ts");
  });

  it("3: a neutral-looking import whose imported file contains the forbidden reference still fails", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/index.ts": `import { sync } from "./calendar-sync"; sync();`,
      "src/worker/calendar-sync.ts": `export function sync() { return fetch("https://www.googleapis.com/calendar/v3/events"); }`,
    });
    expect(result.pass).toBe(false);
    expect(result.location).toBe("src/worker/calendar-sync.ts");
  });

  it("4: a new Google Drive module fails", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/drive-export.ts": `const client = new GoogleDriveClient(credentials);`,
    });
    expect(result.pass).toBe(false);
    expect(result.location).toBe("src/worker/drive-export.ts");
  });

  it("5: an OAuth / live-connector authorization module fails", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/oauth.ts": `window.location = "https://accounts.google.com/o/oauth2/auth";`,
    });
    expect(result.pass).toBe(false);
    expect(result.location).toBe("src/worker/oauth.ts");
  });

  it("6: the same forbidden strings inside tests/docs are ignored, not scanned", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/index.ts": `export function handle() { return fetch("/v1/intents"); }`,
      "test/safety/live-connector.test.ts": `it("rejects GoogleCalendarClient", () => { expect(check("new GoogleCalendarClient()").pass).toBe(false); });`,
      "docs/decisions/no-calendar.md": `We forbid calendar.google.com integrations.`,
    });
    expect(result.pass).toBe(true);
  });

  it("7: normal same-origin Howler API fetches across many files pass", () => {
    const result = scanSourcesForLiveConnectorReferences({
      "src/worker/index.ts": `fetch("/v1/intents", { method: "POST" });`,
      "src/worker/admin.ts": `fetch(\`/v1/workflows/\${id}/resume\`, { method: "POST" });`,
      "src/operator/workflow.ts": `export function noop() {}`,
      "src/engine/engine.ts": `export function run() {}`,
      "src/domain/validation.ts": `export function validate() {}`,
    });
    expect(result.pass).toBe(true);
  });
});
