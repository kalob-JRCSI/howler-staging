// Deterministic routing/selection. No embeddings, no vector search — selection is explicit
// tag/taskType set-intersection plus fixed priority tiers, with a stable tie-break sort so output
// order never depends on catalog file order or object-key iteration order.

import { entryExistsOnDisk, readEntryContent } from "./catalog.js";
import type {
  CatalogEntry,
  CatalogFile,
  CatalogReference,
  OmittedEntry,
  PackInput,
  SelectedFile,
} from "./schemas.js";

export type PriorityTier = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Routing priority (design doc §4):
 * 1 mandatory safety/invariants (never pruned)
 * 2 current handoff (alwaysInclude entries)
 * 3 directly relevant accepted receipts
 * 4 relevant specs/contracts
 * 5 relevant development skills
 * 6 skill reference support files (progressive disclosure — see selectReferences)
 */
export function priorityTierFor(entry: CatalogEntry): PriorityTier {
  if (entry.mandatory) return 1;
  if (entry.alwaysInclude || entry.kind === "handoff") return 2;
  if (entry.kind === "receipt") return 3;
  if (entry.kind === "skill") return 5;
  return 4; // spec, plan, test-dir, doc
}

function matchesRequest(entry: CatalogEntry, input: PackInput): boolean {
  if (entry.mandatory || entry.alwaysInclude || entry.kind === "handoff")
    return true;
  if (entry.taskTypes.includes(input.taskType)) return true;
  const requestTags = input.tags ?? [];
  return entry.tags.some((tag) => requestTags.includes(tag));
}

function reasonFor(entry: CatalogEntry, input: PackInput): string {
  if (entry.mandatory) return "mandatory safety/invariant material";
  if (entry.alwaysInclude || entry.kind === "handoff")
    return "current handoff, always included";
  if (entry.taskTypes.includes(input.taskType)) {
    return `taskType "${input.taskType}" matches catalog entry taskTypes`;
  }
  const requestTags = input.tags ?? [];
  const matchedTag = entry.tags.find((tag) => requestTags.includes(tag));
  return matchedTag ? `tag "${matchedTag}" matches` : "matched";
}

/** Stable comparator: priority tier ascending, then id ascending — never catalog file order. */
function compareSelection(a: SelectedFile, b: SelectedFile): number {
  if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
  return a.id.localeCompare(b.id);
}

interface BuildOneResult {
  file: SelectedFile;
  omitted?: OmittedEntry;
}

function buildSelectedFile(
  entry: CatalogEntry,
  input: PackInput,
  repoRoot: string,
  tier: PriorityTier,
  provenance: string,
): BuildOneResult {
  const missing = !entryExistsOnDisk(entry, repoRoot);
  const content = missing ? undefined : readEntryContent(entry, repoRoot);
  const chars = content?.length ?? 0;
  const file: SelectedFile = {
    id: entry.id,
    path: entry.path,
    authority: entry.authority,
    reason: reasonFor(entry, input),
    provenance,
    priorityTier: tier,
    mandatory: entry.mandatory === true,
    chars,
    approxTokens: Math.ceil(chars / 4),
    stale: entry.stale === true,
    missing,
  };
  if (missing) {
    return {
      file,
      omitted: {
        id: entry.id,
        path: entry.path,
        reason: "missing: catalog entry's target does not exist on disk",
      },
    };
  }
  return { file };
}

function buildReferenceFile(
  reference: CatalogReference,
  parentId: string,
  repoRoot: string,
): BuildOneResult {
  const missing = !entryExistsOnDisk(reference, repoRoot);
  const content = missing ? undefined : readEntryContent(reference, repoRoot);
  const chars = content?.length ?? 0;
  const file: SelectedFile = {
    id: reference.id,
    path: reference.path,
    authority: reference.authority,
    reason: `progressive disclosure: referenced by selected skill "${parentId}"`,
    provenance: `skill-reference:${parentId}`,
    priorityTier: 6,
    mandatory: false,
    chars,
    approxTokens: Math.ceil(chars / 4),
    stale: false,
    missing,
  };
  if (missing) {
    return {
      file,
      omitted: {
        id: reference.id,
        path: reference.path,
        reason: "missing: referenced support file does not exist on disk",
      },
    };
  }
  return { file };
}

export interface SelectResult {
  selected: SelectedFile[];
  omitted: OmittedEntry[];
}

/**
 * Selects catalog entries for `input`, applies an optional character budget (mandatory entries
 * are structurally exempt — added before the budget loop and never revisited by it), and returns
 * a deterministically ordered result. A missing entry is moved to `omitted` (flagged, not
 * silently dropped); a stale entry stays selected with `stale: true` (flagged, not silently
 * trusted).
 */
export function selectForPack(
  catalog: CatalogFile,
  input: PackInput,
  repoRoot: string,
): SelectResult {
  const candidates = catalog.entries.filter((entry) =>
    matchesRequest(entry, input),
  );

  const built = candidates.map((entry) => {
    const tier = priorityTierFor(entry);
    return buildSelectedFile(
      entry,
      input,
      repoRoot,
      tier,
      `catalog:${entry.id}`,
    );
  });

  const mandatory = built.filter((b) => b.file.mandatory && !b.omitted);
  const rest = built.filter((b) => !b.file.mandatory || b.omitted);

  const selected: SelectedFile[] = mandatory.map((b) => b.file);
  const omitted: OmittedEntry[] = [];
  let runningChars = selected.reduce((sum, f) => sum + f.chars, 0);

  const restSorted = [...rest].sort((a, b) => compareSelection(a.file, b.file));
  for (const item of restSorted) {
    if (item.omitted) {
      omitted.push(item.omitted);
      continue;
    }
    if (
      input.budgetChars !== undefined &&
      runningChars + item.file.chars > input.budgetChars
    ) {
      omitted.push({
        id: item.file.id,
        path: item.file.path,
        reason: `budget pruned: would exceed budgetChars=${String(input.budgetChars)}`,
      });
      continue;
    }
    selected.push(item.file);
    runningChars += item.file.chars;
  }

  // Progressive disclosure: expand references only for entries that actually made it into the
  // final selection (post-budget), and only the references whose own tags match the request —
  // catalog metadata -> the skill -> its references, never references without their skill.
  const requestTags = input.tags ?? [];
  const selectedIds = new Set(selected.map((f) => f.id));
  for (const entry of candidates) {
    if (!selectedIds.has(entry.id) || !entry.references?.length) continue;
    for (const reference of entry.references) {
      if (!reference.tags.some((tag) => requestTags.includes(tag))) continue;
      const built = buildReferenceFile(reference, entry.id, repoRoot);
      if (built.omitted) {
        omitted.push(built.omitted);
      } else {
        selected.push(built.file);
      }
    }
  }

  selected.sort(compareSelection);
  omitted.sort((a, b) => a.id.localeCompare(b.id));
  return { selected, omitted };
}
