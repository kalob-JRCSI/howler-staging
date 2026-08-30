import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPack } from "../src/pack.js";
import type { PackInput } from "../src/schemas.js";
import { TEST_CATALOG } from "./fixtures/test-catalog.js";

const FIXTURE_REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "repo-root",
);

const FIXED_NOW = () => new Date("2026-08-30T00:00:00.000Z");
const LATER_NOW = () => new Date("2099-01-01T00:00:00.000Z");

describe("stable canonical pack hash", () => {
  it("is identical across repeated identical requests", async () => {
    const input: PackInput = {
      taskOrStage: "s1",
      taskType: "implementation-handoff",
    };
    const a = await buildPack(input, {
      repoRoot: FIXTURE_REPO_ROOT,
      catalog: TEST_CATALOG,
      now: FIXED_NOW,
    });
    const b = await buildPack(input, {
      repoRoot: FIXTURE_REPO_ROOT,
      catalog: TEST_CATALOG,
      now: FIXED_NOW,
    });
    expect(b.hash).toBe(a.hash);
  });

  it("is unaffected by generatedAt / the current timestamp", async () => {
    const input: PackInput = {
      taskOrStage: "s1",
      taskType: "implementation-handoff",
    };
    const early = await buildPack(input, {
      repoRoot: FIXTURE_REPO_ROOT,
      catalog: TEST_CATALOG,
      now: FIXED_NOW,
    });
    const later = await buildPack(input, {
      repoRoot: FIXTURE_REPO_ROOT,
      catalog: TEST_CATALOG,
      now: LATER_NOW,
    });
    expect(early.generatedAt).not.toBe(later.generatedAt);
    expect(later.hash).toBe(early.hash);
  });

  it("differs for a genuinely different request", async () => {
    const a = await buildPack(
      { taskOrStage: "s1", taskType: "implementation-handoff" },
      { repoRoot: FIXTURE_REPO_ROOT, catalog: TEST_CATALOG, now: FIXED_NOW },
    );
    const b = await buildPack(
      { taskOrStage: "s1", taskType: "parity-review" },
      { repoRoot: FIXTURE_REPO_ROOT, catalog: TEST_CATALOG, now: FIXED_NOW },
    );
    expect(b.hash).not.toBe(a.hash);
  });
});

describe("measurement", () => {
  it("reports selected file count, chars, approx tokens, and accepted-history refs selected", async () => {
    const output = await buildPack(
      { taskOrStage: "s1", taskType: "accepted-history-lookup" },
      { repoRoot: FIXTURE_REPO_ROOT, catalog: TEST_CATALOG, now: FIXED_NOW },
    );
    expect(output.measurement.selectedFileCount).toBe(output.selected.length);
    expect(output.measurement.selectedChars).toBeGreaterThan(0);
    expect(output.measurement.approxTokens).toBe(
      Math.ceil(output.measurement.selectedChars / 4),
    );
    expect(
      output.measurement.acceptedHistoryRefsSelected,
    ).toBeGreaterThanOrEqual(1);
    expect(output.measurement.mandatoryIncluded).toBe(true);
  });
});

/**
 * Representative fixtures (design doc §6): implementation-handoff, parity-review,
 * cloudflare-safety, accepted-history-lookup, stale-source, missing-source. Each entry's
 * `expectedRelevantIds` is the ground truth designed into the fixture catalog — set independently
 * of the selector's own reasoning, so precision is measured, not assumed.
 */
const REPRESENTATIVE_FIXTURES: {
  name: string;
  input: PackInput;
  expectedRelevantIds: string[];
}[] = [
  {
    name: "implementation handoff",
    input: { taskOrStage: "s1", taskType: "implementation-handoff" },
    expectedRelevantIds: [
      "fixture-mandatory-safety",
      "fixture-handoff-current",
      "fixture-receipt-relevant",
      "fixture-spec-design",
      "fixture-skill-handoff",
    ],
  },
  {
    name: "parity review",
    input: { taskOrStage: "s1", taskType: "parity-review" },
    expectedRelevantIds: [
      "fixture-mandatory-safety",
      "fixture-handoff-current",
      "fixture-spec-design",
      "fixture-skill-parity",
    ],
  },
  {
    name: "cloudflare safety review",
    input: { taskOrStage: "s1", taskType: "cloudflare-safety" },
    expectedRelevantIds: [
      "fixture-mandatory-safety",
      "fixture-handoff-current",
      "fixture-spec-cloudflare-detail",
    ],
  },
  {
    name: "accepted-history lookup",
    input: { taskOrStage: "s1", taskType: "accepted-history-lookup" },
    expectedRelevantIds: [
      "fixture-mandatory-safety",
      "fixture-handoff-current",
      "fixture-receipt-relevant",
    ],
  },
  {
    name: "stale/missing source lookup",
    input: { taskOrStage: "s1", taskType: "stale-lookup" },
    expectedRelevantIds: [
      "fixture-mandatory-safety",
      "fixture-handoff-current",
      "fixture-receipt-stale",
    ],
  },
];

describe("representative fixture set: recall and precision", () => {
  it("mandatory invariant recall is 100% across the fixture set", async () => {
    const outputs = await Promise.all(
      REPRESENTATIVE_FIXTURES.map((f) =>
        buildPack(f.input, {
          repoRoot: FIXTURE_REPO_ROOT,
          catalog: TEST_CATALOG,
          now: FIXED_NOW,
        }),
      ),
    );
    const recalls = outputs.map((o) =>
      o.selected.some(
        (s) => s.id === "fixture-mandatory-safety" && s.mandatory,
      ),
    );
    const recall = recalls.filter(Boolean).length / recalls.length;
    expect(recall).toBe(1);
  });

  it("relevant-context precision exceeds 90% across the fixture set", async () => {
    let totalSelected = 0;
    let totalRelevant = 0;
    for (const fixture of REPRESENTATIVE_FIXTURES) {
      const output = await buildPack(fixture.input, {
        repoRoot: FIXTURE_REPO_ROOT,
        catalog: TEST_CATALOG,
        now: FIXED_NOW,
      });
      totalSelected += output.selected.length;
      totalRelevant += output.selected.filter((s) =>
        fixture.expectedRelevantIds.includes(s.id),
      ).length;
      // Never select the deliberately-unrelated trap entry.
      expect(
        output.selected.some((s) => s.id === "fixture-receipt-unrelated"),
      ).toBe(false);
    }
    const precision = totalRelevant / totalSelected;
    expect(totalSelected).toBeGreaterThanOrEqual(15);
    expect(precision).toBeGreaterThan(0.9);
  });
});
