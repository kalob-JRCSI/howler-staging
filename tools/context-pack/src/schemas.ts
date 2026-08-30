// Typed schemas for the Howler context/skill fabric (development infrastructure only — no
// runtime/D1 schemas here). Authority order is fixed and explicit; a schema field never implies
// an authority higher than what the source actually is.

/** Fixed authority order, highest first. Never invert when comparing two AuthorityRefs. */
export const AUTHORITY_ORDER = [
  "GIT_CANONICAL",
  "RUNTIME_TRUTH",
  "ACCEPTED_RECEIPT",
  "AGENT_MEMORY",
] as const;

export type Authority = (typeof AUTHORITY_ORDER)[number];

export function authorityRank(authority: Authority): number {
  return AUTHORITY_ORDER.indexOf(authority);
}

/** True if `a` is strictly higher authority than `b`. */
export function outranks(a: Authority, b: Authority): boolean {
  return authorityRank(a) < authorityRank(b);
}

export interface AuthorityRef {
  authority: Authority;
  path: string;
  note?: string;
}

export interface AcceptedReceipt {
  schemaVersion: "1";
  id: string;
  kind: "acceptedReceipt";
  throughTask: number;
  baseSha: string;
  acceptedAt: string;
  summary: string;
  evidence: AuthorityRef[];
  notAccepted?: string[];
}

export interface HandoffRecord {
  schemaVersion: "1";
  kind: "handoffRecord";
  taskId: string;
  title: string;
  status: "IN_PROGRESS" | "BLOCKED" | "COMPLETE";
  baseSha: string;
  blocks: string[];
  summary: string;
  relevantPaths: string[];
}

export type CatalogEntryKind =
  "skill" | "receipt" | "handoff" | "spec" | "plan" | "test-dir" | "doc";

export interface CatalogEntry {
  id: string;
  kind: CatalogEntryKind;
  path: string;
  authority: Authority;
  tags: string[];
  taskTypes: string[];
  /** Priority tier 1: safety/invariant material. Never pruned by budget. */
  mandatory?: boolean;
  /** Priority tier 2: always relevant regardless of tags/taskTypes (e.g. current handoff). */
  alwaysInclude?: boolean;
  /** Explicitly known stale at catalog-authoring time (distinct from missing-on-disk). */
  stale?: boolean;
  /**
   * Progressive disclosure: support files this entry (almost always a skill) may pull in.
   * Never loaded unless this entry is itself selected AND the reference's own tags match the
   * request — a reference is never loaded on its own.
   */
  references?: CatalogReference[];
  summary: string;
}

export interface CatalogReference {
  id: string;
  path: string;
  authority: Authority;
  tags: string[];
  summary: string;
}

export interface CatalogFile {
  schemaVersion: "1";
  entries: CatalogEntry[];
}

export interface TagIndexFile {
  schemaVersion: "1";
  tags: Record<string, string[]>;
}

export interface PackInput {
  taskOrStage: string;
  taskType: string;
  affectedFiles?: string[];
  tags?: string[];
  budgetChars?: number;
}

export interface SelectedFile {
  id: string;
  path: string;
  authority: Authority;
  reason: string;
  provenance: string;
  priorityTier: 1 | 2 | 3 | 4 | 5 | 6;
  mandatory: boolean;
  chars: number;
  approxTokens: number;
  stale: boolean;
  missing: boolean;
}

export interface OmittedEntry {
  id: string;
  path: string;
  reason: string;
}

export interface PackMeasurement {
  selectedFileCount: number;
  selectedChars: number;
  approxTokens: number;
  acceptedHistoryRefsSelected: number;
  mandatoryIncluded: boolean;
}

/** Canonical (hashed) shape of a pack — deliberately excludes generatedAt/any timestamp. */
export interface CanonicalPack {
  schemaVersion: "1";
  input: PackInput;
  selected: SelectedFile[];
  omitted: OmittedEntry[];
  measurement: PackMeasurement;
}

export interface PackOutput extends CanonicalPack {
  hash: string;
  generatedAt: string;
}
