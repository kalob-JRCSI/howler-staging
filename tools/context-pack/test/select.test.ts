import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectForPack } from "../src/select.js";
import { outranks } from "../src/schemas.js";
import type { PackInput } from "../src/schemas.js";
import { TEST_CATALOG } from "./fixtures/test-catalog.js";

const FIXTURE_REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "repo-root",
);

function input(overrides: Partial<PackInput> = {}): PackInput {
  return {
    taskOrStage: "test-stage",
    taskType: "implementation-handoff",
    ...overrides,
  };
}

describe("mandatory safety/invariant inclusion", () => {
  it("is included for every request regardless of taskType/tags", () => {
    const requests: PackInput[] = [
      input({ taskType: "implementation-handoff" }),
      input({ taskType: "parity-review" }),
      input({ taskType: "accepted-history-lookup" }),
      input({ taskType: "totally-unrelated-task-type", tags: [] }),
    ];
    for (const req of requests) {
      const { selected } = selectForPack(TEST_CATALOG, req, FIXTURE_REPO_ROOT);
      expect(selected.some((f) => f.id === "fixture-mandatory-safety")).toBe(
        true,
      );
      expect(
        selected.find((f) => f.id === "fixture-mandatory-safety")?.mandatory,
      ).toBe(true);
    }
  });

  it("recall is 100%: mandatory entries never fail to appear", () => {
    const fixtures: PackInput[] = [
      input({ taskType: "implementation-handoff" }),
      input({ taskType: "parity-review" }),
      input({ taskType: "accepted-history-lookup" }),
      input({ taskType: "stale-lookup" }),
      input({ taskType: "missing-lookup" }),
    ];
    const recalls = fixtures.map((req) => {
      const { selected } = selectForPack(TEST_CATALOG, req, FIXTURE_REPO_ROOT);
      return selected.some(
        (f) => f.id === "fixture-mandatory-safety" && f.mandatory,
      );
    });
    expect(recalls.every(Boolean)).toBe(true);
    expect(recalls.length).toBeGreaterThanOrEqual(5);
  });
});

describe("current handoff is always included", () => {
  it("appears regardless of taskType", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "totally-unrelated" }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-handoff-current")).toBe(true);
  });
});

describe("relevant accepted-history selection and unrelated exclusion", () => {
  it("selects the relevant receipt for a matching taskType", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "accepted-history-lookup" }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-receipt-relevant")).toBe(
      true,
    );
  });

  it("excludes the unrelated receipt for a matching-but-different request", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "implementation-handoff" }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-receipt-unrelated")).toBe(
      false,
    );
  });

  it("excludes the unrelated receipt even for an accepted-history-lookup request with no overlapping tags", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "accepted-history-lookup" }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-receipt-unrelated")).toBe(
      false,
    );
  });
});

describe("deterministic ordering", () => {
  it("orders by priority tier ascending, then id ascending, independent of catalog array order", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "implementation-handoff" }),
      FIXTURE_REPO_ROOT,
    );
    const tiers = selected.map((f) => f.priorityTier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);

    const reversedCatalog = {
      ...TEST_CATALOG,
      entries: [...TEST_CATALOG.entries].reverse(),
    };
    const { selected: selectedReversed } = selectForPack(
      reversedCatalog,
      input({ taskType: "implementation-handoff" }),
      FIXTURE_REPO_ROOT,
    );
    expect(selectedReversed.map((f) => f.id)).toEqual(
      selected.map((f) => f.id),
    );
  });

  it("is deterministic across repeated identical calls", () => {
    const req = input({ taskType: "implementation-handoff" });
    const first = selectForPack(TEST_CATALOG, req, FIXTURE_REPO_ROOT);
    const second = selectForPack(TEST_CATALOG, req, FIXTURE_REPO_ROOT);
    expect(second.selected.map((f) => f.id)).toEqual(
      first.selected.map((f) => f.id),
    );
    expect(second.omitted).toEqual(first.omitted);
  });
});

describe("authority ordering", () => {
  it("outranks() reflects the fixed GIT_CANONICAL > RUNTIME_TRUTH > ACCEPTED_RECEIPT > AGENT_MEMORY order", () => {
    expect(outranks("GIT_CANONICAL", "RUNTIME_TRUTH")).toBe(true);
    expect(outranks("RUNTIME_TRUTH", "ACCEPTED_RECEIPT")).toBe(true);
    expect(outranks("ACCEPTED_RECEIPT", "AGENT_MEMORY")).toBe(true);
    expect(outranks("AGENT_MEMORY", "GIT_CANONICAL")).toBe(false);
    expect(outranks("ACCEPTED_RECEIPT", "GIT_CANONICAL")).toBe(false);
  });

  it("no selected entry claims an authority its catalog definition does not have (receipts/skills never claim GIT_CANONICAL)", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "implementation-handoff" }),
      FIXTURE_REPO_ROOT,
    );
    const receiptOrSkill = selected.filter(
      (f) =>
        f.id.startsWith("fixture-receipt") || f.id.startsWith("fixture-skill"),
    );
    expect(
      receiptOrSkill.every((f) => f.authority === "ACCEPTED_RECEIPT"),
    ).toBe(true);
  });
});

describe("progressive skill disclosure", () => {
  it("does not load a skill's reference when the request's tags do not match it", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "implementation-handoff", tags: [] }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-skill-handoff")).toBe(true);
    expect(
      selected.some((f) => f.id === "fixture-skill-handoff-ref-checklist"),
    ).toBe(false);
  });

  it("loads the reference only when both the skill is selected and the request tags match it", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({
        taskType: "implementation-handoff",
        tags: ["handoff-checklist"],
      }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-skill-handoff")).toBe(true);
    const reference = selected.find(
      (f) => f.id === "fixture-skill-handoff-ref-checklist",
    );
    expect(reference).toBeDefined();
    expect(reference?.priorityTier).toBe(6);
  });

  it("never loads the reference if its parent skill was not itself selected", () => {
    // parity-review request: fixture-skill-handoff is not selected, so its reference must not
    // appear even though the tag is present.
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "parity-review", tags: ["handoff-checklist"] }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-skill-handoff")).toBe(false);
    expect(
      selected.some((f) => f.id === "fixture-skill-handoff-ref-checklist"),
    ).toBe(false);
  });

  it("omits the reference with an explicit budget reason when remaining budget is insufficient (Finding 3 regression)", () => {
    // Main selection (mandatory + handoff + receipt + spec + skill) totals 426 chars; the
    // checklist reference is 107 chars. A budget of 450 leaves only 24 chars remaining — not
    // enough for the reference, which must therefore be omitted for a budget reason, not
    // silently included regardless of budget.
    const { selected, omitted } = selectForPack(
      TEST_CATALOG,
      input({
        taskType: "implementation-handoff",
        tags: ["handoff-checklist"],
        budgetChars: 450,
      }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-skill-handoff")).toBe(true);
    expect(
      selected.some((f) => f.id === "fixture-skill-handoff-ref-checklist"),
    ).toBe(false);
    const prunedRef = omitted.find(
      (o) => o.id === "fixture-skill-handoff-ref-checklist",
    );
    expect(prunedRef).toBeDefined();
    expect(prunedRef?.reason).toMatch(/budget/i);
  });

  it("still includes the reference when remaining budget is sufficient", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({
        taskType: "implementation-handoff",
        tags: ["handoff-checklist"],
        budgetChars: 600,
      }),
      FIXTURE_REPO_ROOT,
    );
    expect(
      selected.some((f) => f.id === "fixture-skill-handoff-ref-checklist"),
    ).toBe(true);
  });

  it("mandatory material is exempt from the budget even when a reference is pruned", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({
        taskType: "implementation-handoff",
        tags: ["handoff-checklist"],
        budgetChars: 450,
      }),
      FIXTURE_REPO_ROOT,
    );
    expect(
      selected.some((f) => f.id === "fixture-mandatory-safety" && f.mandatory),
    ).toBe(true);
  });
});

describe("stale source behavior", () => {
  it("a stale entry is still selected, but flagged stale — not silently trusted, not silently dropped", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "stale-lookup" }),
      FIXTURE_REPO_ROOT,
    );
    const stale = selected.find((f) => f.id === "fixture-receipt-stale");
    expect(stale).toBeDefined();
    expect(stale?.stale).toBe(true);
    expect(stale?.missing).toBe(false);
  });
});

describe("missing source behavior", () => {
  it("a missing entry is moved to omitted with a stated reason, not silently dropped or trusted", () => {
    const { selected, omitted } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "missing-lookup" }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-spec-missing")).toBe(false);
    const omittedEntry = omitted.find((o) => o.id === "fixture-spec-missing");
    expect(omittedEntry).toBeDefined();
    expect(omittedEntry?.reason).toMatch(/missing/i);
  });
});

describe("context-budget pruning", () => {
  it("prunes lower-priority-tier entries first, and mandatory material survives budget pressure", () => {
    const { selected, omitted } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "budget-test", budgetChars: 390 }),
      FIXTURE_REPO_ROOT,
    );
    expect(selected.some((f) => f.id === "fixture-mandatory-safety")).toBe(
      true,
    );
    expect(selected.some((f) => f.id === "fixture-handoff-current")).toBe(true);
    expect(selected.some((f) => f.id === "fixture-budget-a")).toBe(true);
    expect(selected.some((f) => f.id === "fixture-budget-b")).toBe(false);
    const prunedB = omitted.find((o) => o.id === "fixture-budget-b");
    expect(prunedB?.reason).toMatch(/budget/i);
  });

  it("mandatory material survives even an extremely tight budget", () => {
    const { selected } = selectForPack(
      TEST_CATALOG,
      input({ taskType: "budget-test", budgetChars: 1 }),
      FIXTURE_REPO_ROOT,
    );
    expect(
      selected.some((f) => f.id === "fixture-mandatory-safety" && f.mandatory),
    ).toBe(true);
  });
});
