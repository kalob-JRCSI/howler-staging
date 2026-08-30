import type { CatalogEntry, CatalogFile } from "../../src/schemas.js";

// A controlled, synthetic catalog used only by tests — kept deliberately separate from the real
// context/catalog/index.json so tests never depend on (or are broken by) real catalog content
// changing over time. Paths are resolved against test/fixtures/repo-root/ (a tiny fixture repo
// tree checked in alongside this file).

export const MANDATORY_SAFETY: CatalogEntry = {
  id: "fixture-mandatory-safety",
  kind: "spec",
  path: "safety/invariants.md",
  authority: "RUNTIME_TRUTH",
  tags: ["safety"],
  taskTypes: [],
  mandatory: true,
  summary: "Fixture mandatory safety invariant.",
};

export const HANDOFF_CURRENT: CatalogEntry = {
  id: "fixture-handoff-current",
  kind: "handoff",
  path: "handoff/current-task.json",
  authority: "ACCEPTED_RECEIPT",
  tags: ["handoff"],
  taskTypes: [],
  alwaysInclude: true,
  summary: "Fixture current handoff.",
};

export const RECEIPT_RELEVANT: CatalogEntry = {
  id: "fixture-receipt-relevant",
  kind: "receipt",
  path: "receipts/through-task-013.json",
  authority: "ACCEPTED_RECEIPT",
  tags: ["accepted-history"],
  taskTypes: ["accepted-history-lookup", "implementation-handoff"],
  summary:
    "Fixture accepted-history receipt relevant to implementation-handoff/lookup.",
};

export const RECEIPT_UNRELATED: CatalogEntry = {
  id: "fixture-receipt-unrelated",
  kind: "receipt",
  path: "receipts/unrelated.json",
  authority: "ACCEPTED_RECEIPT",
  tags: ["unrelated-topic"],
  taskTypes: ["unrelated-task-type"],
  summary:
    "Fixture accepted-history receipt that must be excluded from unrelated requests.",
};

export const SPEC_CLOUDFLARE_DETAIL: CatalogEntry = {
  id: "fixture-spec-cloudflare-detail",
  kind: "spec",
  path: "specs/cloudflare-detail.md",
  authority: "RUNTIME_TRUTH",
  tags: ["cloudflare"],
  taskTypes: ["cloudflare-safety"],
  summary:
    "Fixture non-mandatory cloudflare-safety-specific detail, distinct from the always-included mandatory invariant.",
};

export const SPEC_DESIGN: CatalogEntry = {
  id: "fixture-spec-design",
  kind: "spec",
  path: "specs/design.md",
  authority: "GIT_CANONICAL",
  tags: ["spec"],
  taskTypes: ["implementation-handoff", "parity-review"],
  summary: "Fixture design spec.",
};

export const SKILL_HANDOFF: CatalogEntry = {
  id: "fixture-skill-handoff",
  kind: "skill",
  path: "skills/handoff/SKILL.md",
  authority: "ACCEPTED_RECEIPT",
  tags: ["handoff"],
  taskTypes: ["implementation-handoff"],
  summary:
    "Fixture handoff skill, with a reference support file loaded only when relevant.",
  references: [
    {
      id: "fixture-skill-handoff-ref-checklist",
      path: "skills/handoff/checklist.md",
      authority: "ACCEPTED_RECEIPT",
      tags: ["handoff-checklist"],
      summary:
        "Fixture reference support file — only pulled in for handoff-checklist requests.",
    },
  ],
};

export const SKILL_PARITY: CatalogEntry = {
  id: "fixture-skill-parity",
  kind: "skill",
  path: "skills/parity/SKILL.md",
  authority: "ACCEPTED_RECEIPT",
  tags: ["parity"],
  taskTypes: ["parity-review"],
  summary: "Fixture parity-review skill.",
};

export const STALE_RECEIPT: CatalogEntry = {
  id: "fixture-receipt-stale",
  kind: "receipt",
  path: "receipts/stale.json",
  authority: "ACCEPTED_RECEIPT",
  tags: ["accepted-history", "stale-topic"],
  taskTypes: ["stale-lookup"],
  stale: true,
  summary: "Fixture receipt deliberately marked stale.",
};

export const MISSING_SPEC: CatalogEntry = {
  id: "fixture-spec-missing",
  kind: "spec",
  path: "specs/does-not-exist.md",
  authority: "GIT_CANONICAL",
  tags: ["missing-topic"],
  taskTypes: ["missing-lookup"],
  summary: "Fixture catalog entry whose target file does not exist on disk.",
};

export const LOW_PRIORITY_BUDGET_A: CatalogEntry = {
  id: "fixture-budget-a",
  kind: "doc",
  path: "docs/budget-a.md",
  authority: "GIT_CANONICAL",
  tags: ["budget-topic"],
  taskTypes: ["budget-test"],
  summary: "Fixture budget-test doc A (large).",
};

export const LOW_PRIORITY_BUDGET_B: CatalogEntry = {
  id: "fixture-budget-b",
  kind: "doc",
  path: "docs/budget-b.md",
  authority: "GIT_CANONICAL",
  tags: ["budget-topic"],
  taskTypes: ["budget-test"],
  summary: "Fixture budget-test doc B (large).",
};

export const MANDATORY_MISSING: CatalogEntry = {
  id: "fixture-mandatory-missing",
  kind: "spec",
  path: "safety/does-not-exist-invariants.md",
  authority: "RUNTIME_TRUTH",
  tags: ["safety"],
  taskTypes: [],
  mandatory: true,
  summary:
    "Fixture mandatory entry whose target does not exist on disk (Finding 2 regression).",
};

/**
 * Isolated from TEST_CATALOG on purpose: this catalog's own mandatory entry is deliberately
 * missing, which would otherwise poison every other test's `mandatoryIncluded`/recall assertions
 * if mixed into the shared fixture catalog.
 */
export const MISSING_MANDATORY_CATALOG: CatalogFile = {
  schemaVersion: "1",
  entries: [MANDATORY_MISSING],
};

export const TEST_CATALOG: CatalogFile = {
  schemaVersion: "1",
  entries: [
    MANDATORY_SAFETY,
    HANDOFF_CURRENT,
    RECEIPT_RELEVANT,
    RECEIPT_UNRELATED,
    SPEC_CLOUDFLARE_DETAIL,
    SPEC_DESIGN,
    SKILL_HANDOFF,
    SKILL_PARITY,
    STALE_RECEIPT,
    MISSING_SPEC,
    LOW_PRIORITY_BUDGET_A,
    LOW_PRIORITY_BUDGET_B,
  ],
};
