// Forward-only measurement. No historical token-usage figures are claimed anywhere in this
// module — only counts of what a given pack actually selected, computed now.

import { entryExistsOnDisk, readEntryContent } from "./catalog.js";
import type {
  CatalogFile,
  OmittedEntry,
  PackMeasurement,
  SelectedFile,
} from "./schemas.js";

export interface BaselineMeasurement {
  fileCount: number;
  chars: number;
  approxTokens: number;
}

/**
 * What a naive "read everything plausibly relevant" baseline would include: every catalog entry,
 * unconditionally, regardless of taskType/tags. This is the comparison point the routed pack
 * (buildPack) is measured against — see design doc §5.
 */
export function measureBaseline(
  catalog: CatalogFile,
  repoRoot: string,
): BaselineMeasurement {
  let chars = 0;
  let fileCount = 0;
  for (const entry of catalog.entries) {
    if (!entryExistsOnDisk(entry, repoRoot)) continue;
    const content = readEntryContent(entry, repoRoot);
    if (content === undefined) continue; // directory entry
    fileCount += 1;
    chars += content.length;
  }
  return { fileCount, chars, approxTokens: approxTokenCount(chars) };
}

/**
 * A deterministic, documented *approximation* of token count — not a real tokenizer. Chosen
 * purely so pack measurements are stable and comparable across runs, not as a token-accuracy
 * claim.
 */
export function approxTokenCount(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * `mandatoryIncluded` must be false whenever ANY mandatory catalog entry the request matched is
 * unavailable — including one moved to `omitted` (e.g. missing from disk), which `selected` alone
 * can never reveal, since a missing mandatory entry is never present in `selected` at all.
 */
export function measurePack(
  selected: SelectedFile[],
  omitted: OmittedEntry[],
  acceptedHistoryEntryIds: ReadonlySet<string>,
): PackMeasurement {
  const selectedChars = selected.reduce((sum, file) => sum + file.chars, 0);
  return {
    selectedFileCount: selected.length,
    selectedChars,
    approxTokens: approxTokenCount(selectedChars),
    acceptedHistoryRefsSelected: selected.filter((file) =>
      acceptedHistoryEntryIds.has(file.id),
    ).length,
    mandatoryIncluded:
      selected.every((file) => !file.mandatory || !file.missing) &&
      omitted.every((entry) => !entry.mandatory),
  };
}
