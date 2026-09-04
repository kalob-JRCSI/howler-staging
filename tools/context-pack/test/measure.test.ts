import { describe, expect, it } from "vitest";
import { approxTokenCount, measurePack } from "../src/measure.js";
import type { OmittedEntry, SelectedFile } from "../src/schemas.js";

describe("approxTokenCount", () => {
  it("is a deterministic ceil(chars/4) approximation, not a real tokenizer", () => {
    expect(approxTokenCount(0)).toBe(0);
    expect(approxTokenCount(4)).toBe(1);
    expect(approxTokenCount(5)).toBe(2);
  });
});

describe("measurePack", () => {
  function file(overrides: Partial<SelectedFile> = {}): SelectedFile {
    return {
      id: "x",
      path: "x",
      authority: "GIT_CANONICAL",
      reason: "r",
      provenance: "p",
      priorityTier: 4,
      mandatory: false,
      chars: 100,
      approxTokens: 25,
      stale: false,
      missing: false,
      ...overrides,
    };
  }

  it("sums chars and counts accepted-history refs by id membership", () => {
    const selected = [
      file({ id: "a", chars: 100 }),
      file({ id: "b", chars: 50 }),
    ];
    const measurement = measurePack(selected, [], new Set(["a"]));
    expect(measurement.selectedFileCount).toBe(2);
    expect(measurement.selectedChars).toBe(150);
    expect(measurement.approxTokens).toBe(38);
    expect(measurement.acceptedHistoryRefsSelected).toBe(1);
  });

  it("mandatoryIncluded is true for a healthy catalog with no omissions", () => {
    const ok = measurePack(
      [file({ id: "m", mandatory: true, missing: false })],
      [],
      new Set(),
    );
    expect(ok.mandatoryIncluded).toBe(true);
  });

  it("mandatoryIncluded is false when a mandatory entry is missing from disk (moved to omitted, never in selected)", () => {
    // Regression: a missing mandatory entry never appears in `selected` at all (select.ts moves
    // it to `omitted`), so checking only `selected` for missing mandatory entries is a vacuous
    // truth that silently false-passes. measurePack must also inspect `omitted`.
    const omitted: OmittedEntry[] = [
      {
        id: "m",
        path: "does/not/exist.md",
        reason: "missing: catalog entry's target does not exist on disk",
        mandatory: true,
      },
    ];
    const measurement = measurePack([], omitted, new Set());
    expect(measurement.mandatoryIncluded).toBe(false);
  });

  it("mandatoryIncluded stays true when only non-mandatory entries are omitted", () => {
    const omitted: OmittedEntry[] = [
      {
        id: "n",
        path: "some/optional.md",
        reason: "budget pruned",
        mandatory: false,
      },
    ];
    const measurement = measurePack(
      [file({ id: "m", mandatory: true, missing: false })],
      omitted,
      new Set(),
    );
    expect(measurement.mandatoryIncluded).toBe(true);
  });
});
