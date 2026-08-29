/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*", {
  eager: true,
  import: "default",
  query: "?raw",
});

const requiredFiles = [
  "README.md",
  "deboard-seed.json",
  "initial-forecast.json",
  "masonry-apply-shadow.json",
  "masonry-preview.json",
  "recovery.json",
  "route-contracts.json",
  "schema.sql",
] as const;

const jsonFixtureFiles = [
  "deboard-seed.json",
  "initial-forecast.json",
  "masonry-apply-shadow.json",
  "masonry-preview.json",
  "recovery.json",
  "route-contracts.json",
] as const;

const hashedFixtureFiles = [...jsonFixtureFiles, "schema.sql"] as const;

function fixtureName(modulePath: string): string {
  return modulePath.slice(modulePath.lastIndexOf("/") + 1);
}

function fixtureSource(fileName: string): string {
  const entry = Object.entries(fixtureSources).find(
    ([modulePath]) => fixtureName(modulePath) === fileName,
  );

  expect(entry, `missing fixture ${fileName}`).toBeDefined();
  if (!entry) {
    throw new Error(`missing fixture ${fileName}`);
  }
  return entry[1];
}

function recordedHashes(readme: string): Map<string, string> {
  const hashes = new Map<string, string>();

  for (const match of readme.matchAll(
    /^\| `([^`]+)` \| `([a-f0-9]{64})` \|$/gmu,
  )) {
    const [, file, hash] = match;
    if (file === undefined || hash === undefined) continue;
    hashes.set(file, hash);
  }

  return hashes;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("v0.9.4 characterization fixture integrity", () => {
  it("contains the complete required corpus", () => {
    const actualFiles = Object.keys(fixtureSources).map(fixtureName).sort();

    expect(actualFiles).toEqual(requiredFiles);
  });

  it.each(jsonFixtureFiles)(
    "%s is JSON for engine compatibility v0.9.4",
    (fileName) => {
      const fixture = JSON.parse(fixtureSource(fileName)) as {
        engineCompatibilityVersion?: unknown;
      };

      expect(fixture.engineCompatibilityVersion).toBe("0.9.4");
    },
  );

  it.each(hashedFixtureFiles)(
    "%s matches its recorded SHA-256",
    async (fileName) => {
      const hashes = recordedHashes(fixtureSource("README.md"));

      expect(
        hashes.get(fileName),
        `missing recorded hash for ${fileName}`,
      ).toBe(await sha256(fixtureSource(fileName)));
    },
  );
});
