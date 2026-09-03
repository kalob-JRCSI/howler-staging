/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

// Non-eager glob: we only need the matched file paths (the map's keys), never the file
// contents, so nothing here ever imports/parses the binary assets themselves.
const publicFiles = import.meta.glob("../../public/**/*");

function relativePaths(): string[] {
  return Object.keys(publicFiles).map((p) => p.replace(/^.*\/public\//, ""));
}

describe("repository policy: public/ contains only non-sensitive presentation assets", () => {
  it("public/ is not empty (this test would pass vacuously otherwise)", () => {
    expect(relativePaths().length).toBeGreaterThan(0);
  });

  it("every file under public/ is an allowlisted, fingerprinted presentation asset or the cache-header config", () => {
    const isHeadersConfig = (path: string) => path === "_headers";
    const isFingerprintedAtmosphereWebp = (path: string) =>
      /^assets\/penthouse-atmosphere(-mobile)?\.[0-9a-f]{6,}\.webp$/.test(path);
    for (const path of relativePaths()) {
      const allowed =
        isHeadersConfig(path) || isFingerprintedAtmosphereWebp(path);
      expect(
        allowed,
        `unexpected file in public/: "${path}" -- public/ is served to any visitor with no admin authentication, so it may only ever contain non-sensitive presentation assets (fingerprinted Penthouse atmosphere artwork) and the _headers cache-control config. Never client documents, plans, estimates, exports, evidence, credentials, or other private operational data.`,
      ).toBe(true);
    }
  });

  it("no filename under public/ names private client/operational data, even accidentally", () => {
    const sensitivePattern =
      /client|project-?evidence|estimate|invoice|budget|contract|credential|secret|password|token|export|plan\b/i;
    for (const path of relativePaths()) {
      expect(path).not.toMatch(sensitivePattern);
    }
  });
});
