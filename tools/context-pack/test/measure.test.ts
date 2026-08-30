import { describe, expect, it } from "vitest";
import { approxTokenCount, measurePack } from "../src/measure.js";
import type { SelectedFile } from "../src/schemas.js";

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
    const measurement = measurePack(selected, new Set(["a"]));
    expect(measurement.selectedFileCount).toBe(2);
    expect(measurement.selectedChars).toBe(150);
    expect(measurement.approxTokens).toBe(38);
    expect(measurement.acceptedHistoryRefsSelected).toBe(1);
  });

  it("mandatoryIncluded is false only if a mandatory entry is present but missing", () => {
    const ok = measurePack(
      [file({ id: "m", mandatory: true, missing: false })],
      new Set(),
    );
    expect(ok.mandatoryIncluded).toBe(true);
  });
});
