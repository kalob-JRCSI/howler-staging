import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPack } from "../src/pack.js";
import { defaultRepoRoot, loadCatalog } from "../src/catalog.js";
import { measureBaseline } from "../src/measure.js";

/**
 * Measures baseline-vs-routed against the REAL repo catalog (context/catalog/index.json), not the
 * synthetic test fixture catalog — this is the number this phase can actually stand behind. No
 * 25-40% target is asserted or claimed; only what is actually measured here.
 */
describe("baseline vs routed context size (real catalog)", () => {
  it("the routed pack for an implementation-handoff task is smaller than the naive baseline", async () => {
    const repoRoot = defaultRepoRoot();
    const catalog = loadCatalog(repoRoot);
    const baseline = measureBaseline(catalog, repoRoot);
    const routed = await buildPack(
      {
        taskOrStage: "context-skill-fabric-phase0-2",
        taskType: "implementation-handoff",
      },
      { repoRoot, catalog, now: () => new Date("2026-08-30T00:00:00.000Z") },
    );

    expect(routed.measurement.selectedChars).toBeLessThan(baseline.chars);
    expect(routed.measurement.selectedFileCount).toBeLessThanOrEqual(
      baseline.fileCount,
    );

    const reductionPct =
      baseline.chars > 0
        ? Math.round(
            (1 - routed.measurement.selectedChars / baseline.chars) * 1000,
          ) / 10
        : 0;

    const report = {
      note: "Phase 0-2 measured baseline-vs-routed comparison for the real catalog. Forward-only; no historical figure implied.",
      taskType: "implementation-handoff",
      baseline: {
        fileCount: baseline.fileCount,
        chars: baseline.chars,
        approxTokens: baseline.approxTokens,
      },
      routed: {
        fileCount: routed.measurement.selectedFileCount,
        chars: routed.measurement.selectedChars,
        approxTokens: routed.measurement.approxTokens,
      },
      measuredReductionPercent: reductionPct,
    };

    const outDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "baseline-vs-routed-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  });
});
