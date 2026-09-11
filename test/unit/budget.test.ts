import { describe, expect, it } from "vitest";
import {
  buildBudgetEvent,
  buildBudgetView,
  BudgetCommandError,
  CLERICAL_BUDGET_COMMAND_KINDS,
  DEFAULT_BUDGET_CATEGORY_NAMES,
} from "../../src/operator/budget";
import type {
  ActualCostV097,
  BudgetCategoryV097,
  BudgetLineV097,
  ChangeOrderV097,
  CommitmentV097,
  ProjectFinancialsV097,
  ProjectModelV094,
} from "../../src/domain/types";

function financials(
  overrides: Partial<ProjectFinancialsV097> = {},
): ProjectFinancialsV097 {
  return {
    currency: "USD",
    baselineSourceIds: [],
    categories: {},
    budgetLines: {},
    commitments: {},
    actualCosts: {},
    changeOrders: {},
    ...overrides,
  };
}

function category(
  overrides: Partial<BudgetCategoryV097> = {},
): BudgetCategoryV097 {
  return {
    id: "cat1",
    name: "Cabinetry",
    isDefault: false,
    active: true,
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function budgetLine(overrides: Partial<BudgetLineV097> = {}): BudgetLineV097 {
  return {
    id: "line1",
    categoryId: "cat1",
    description: "Kitchen cabinets",
    isAllowance: false,
    scopeItemIds: [],
    active: true,
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function commitment(overrides: Partial<CommitmentV097> = {}): CommitmentV097 {
  return {
    id: "commit1",
    amount: { amountMinor: 100000, currency: "USD" },
    allocations: [],
    scopeItemIds: [],
    status: "ACTIVE",
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function actualCost(overrides: Partial<ActualCostV097> = {}): ActualCostV097 {
  return {
    id: "actual1",
    amount: { amountMinor: 50000, currency: "USD" },
    date: "2026-08-26",
    description: "Cabinet deposit",
    status: "RECORDED",
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function changeOrder(
  overrides: Partial<ChangeOrderV097> = {},
): ChangeOrderV097 {
  return {
    id: "co1",
    title: "Cabinetry upgrade",
    status: "DRAFT",
    cost: { amountMinor: 680000, currency: "USD" },
    costAllocations: [],
    scopeItemIds: [],
    activityIds: [],
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function model(overrides: Partial<ProjectModelV094> = {}): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {},
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `id${String(idCounter)}`;
}

describe("buildBudgetView", () => {
  it("reports an uninitialized project honestly, never a fabricated $0 workspace", () => {
    const view = buildBudgetView(model());
    expect(view.initialized).toBe(false);
    expect(view.currency).toBeNull();
    expect(view.summary).toBeNull();
    expect(view.categories).toEqual([]);
    expect(view.lines).toEqual([]);
  });

  it("reports baseline as null (Unknown) when never set, and revisedBudget as null too", () => {
    const view = buildBudgetView(model({ financials: financials() }));
    expect(view.summary?.baseline).toBeNull();
    expect(view.summary?.revisedBudget).toBeNull();
  });

  it("computes committedTotal/actualTotal as real zero (not Unknown) when collections are empty", () => {
    const view = buildBudgetView(model({ financials: financials() }));
    expect(view.summary?.committedTotal).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
    expect(view.summary?.actualTotal).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
  });

  it("computes revisedBudget = baseline + approved change orders only (not pending/draft)", () => {
    const view = buildBudgetView(
      model({
        financials: financials({
          baseline: { amountMinor: 40000000, currency: "USD" },
          changeOrders: {
            approved: changeOrder({
              id: "approved",
              status: "APPROVED",
              cost: { amountMinor: 1250000, currency: "USD" },
            }),
            pending: changeOrder({
              id: "pending",
              status: "PENDING_APPROVAL",
              cost: { amountMinor: 800000, currency: "USD" },
            }),
            draft: changeOrder({ id: "draft", status: "DRAFT" }),
          },
        }),
      }),
    );
    expect(view.summary?.revisedBudget).toEqual({
      amountMinor: 41250000,
      currency: "USD",
    });
    expect(view.summary?.pendingChangeOrderTotal).toEqual({
      amountMinor: 800000,
      currency: "USD",
    });
  });

  it("excludes VOID commitments and VOID actual costs from their totals", () => {
    const view = buildBudgetView(
      model({
        financials: financials({
          commitments: {
            active: commitment({
              id: "active",
              amount: { amountMinor: 1000, currency: "USD" },
            }),
            voided: commitment({
              id: "voided",
              status: "VOID",
              amount: { amountMinor: 99999, currency: "USD" },
            }),
          },
          actualCosts: {
            recorded: actualCost({
              id: "recorded",
              amount: { amountMinor: 500, currency: "USD" },
            }),
            voided: actualCost({
              id: "voided",
              status: "VOID",
              amount: { amountMinor: 99999, currency: "USD" },
            }),
          },
        }),
      }),
    );
    expect(view.summary?.committedTotal).toEqual({
      amountMinor: 1000,
      currency: "USD",
    });
    expect(view.summary?.actualTotal).toEqual({
      amountMinor: 500,
      currency: "USD",
    });
  });

  it("line view: revisedAmount and remaining are null when baselineAmount is absent", () => {
    const view = buildBudgetView(
      model({
        financials: financials({
          categories: { cat1: category() },
          budgetLines: { line1: budgetLine() },
        }),
      }),
    );
    expect(view.lines[0]?.revisedAmount).toBeNull();
    expect(view.lines[0]?.remaining).toBeNull();
  });

  it("line view: aggregates only allocations targeting that specific line, from active/approved records", () => {
    const view = buildBudgetView(
      model({
        financials: financials({
          categories: { cat1: category() },
          budgetLines: {
            line1: budgetLine({
              baselineAmount: { amountMinor: 100000, currency: "USD" },
            }),
            other: budgetLine({ id: "other", description: "Other line" }),
          },
          commitments: {
            c1: commitment({
              allocations: [
                {
                  budgetLineId: "line1",
                  amount: { amountMinor: 30000, currency: "USD" },
                },
                {
                  budgetLineId: "other",
                  amount: { amountMinor: 99999, currency: "USD" },
                },
              ],
            }),
          },
          changeOrders: {
            co1: changeOrder({
              status: "APPROVED",
              costAllocations: [
                {
                  budgetLineId: "line1",
                  amount: { amountMinor: 10000, currency: "USD" },
                },
              ],
            }),
          },
        }),
      }),
    );
    const line1 = view.lines.find((l) => l.id === "line1");
    expect(line1?.committedTotal).toEqual({
      amountMinor: 30000,
      currency: "USD",
    });
    expect(line1?.approvedChangeOrderTotal).toEqual({
      amountMinor: 10000,
      currency: "USD",
    });
    expect(line1?.revisedAmount).toEqual({
      amountMinor: 110000,
      currency: "USD",
    });
    expect(line1?.remaining).toEqual({ amountMinor: 80000, currency: "USD" });
  });

  it("commitment view: computes unallocatedAmount as the real remainder, not zero", () => {
    const view = buildBudgetView(
      model({
        financials: financials({
          commitments: {
            c1: commitment({
              amount: { amountMinor: 100000, currency: "USD" },
              allocations: [
                {
                  budgetLineId: "line1",
                  amount: { amountMinor: 60000, currency: "USD" },
                },
              ],
            }),
          },
        }),
      }),
    );
    expect(view.commitments[0]?.unallocatedAmount).toEqual({
      amountMinor: 40000,
      currency: "USD",
    });
  });
});

describe("buildBudgetEvent: INITIALIZE_FINANCIALS / SET_FINANCIAL_BASELINE", () => {
  it("initializes financials with a supported currency", () => {
    const built = buildBudgetEvent(
      model(),
      { kind: "INITIALIZE_FINANCIALS", currency: "USD" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(built.event.mutations).toContainEqual({
      op: "INITIALIZE_PROJECT_FINANCIALS",
      currency: "USD",
    });
    expect(built.clerical).toBe(false);
  });

  it("seeds DEFAULT_BUDGET_CATEGORY_NAMES as default categories on INITIALIZE_FINANCIALS", () => {
    const built = buildBudgetEvent(
      model(),
      { kind: "INITIALIZE_FINANCIALS", currency: "USD" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    const categoryMutations = built.event.mutations.filter(
      (m) => m.op === "UPSERT_BUDGET_CATEGORY",
    );
    expect(categoryMutations).toHaveLength(
      DEFAULT_BUDGET_CATEGORY_NAMES.length,
    );
    expect(
      categoryMutations.map((m) =>
        "category" in m ? m.category.name : undefined,
      ),
    ).toEqual([...DEFAULT_BUDGET_CATEGORY_NAMES]);
    expect(
      categoryMutations.every(
        (m) => "category" in m && m.category.isDefault && m.category.active,
      ),
    ).toBe(true);
  });

  it("rejects an unsupported currency", () => {
    expect(() =>
      buildBudgetEvent(
        model(),
        { kind: "INITIALIZE_FINANCIALS", currency: "JPY" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("rejects re-initializing an already-initialized project", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        { kind: "INITIALIZE_FINANCIALS", currency: "USD" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Project financials are already initialized");
  });

  it("rejects a baseline in a different currency than the project's tracked currency", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        {
          kind: "SET_FINANCIAL_BASELINE",
          baseline: { amountMinor: 100, currency: "EUR" },
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("rejects any command before financials are initialized", () => {
    expect(() =>
      buildBudgetEvent(
        model(),
        { kind: "ADD_CATEGORY", name: "Cabinetry" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Project financials are not yet initialized");
  });
});

describe("buildBudgetEvent: categories and lines", () => {
  it("rejects an empty category name", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        { kind: "ADD_CATEGORY", name: "   " },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("ADD_LINE requires the category to already exist", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        { kind: "ADD_LINE", categoryId: "missing", description: "Line" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Unknown budget category: missing");
  });

  it("ADD_LINE rejects a baselineAmount in the wrong currency", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials({ categories: { cat1: category() } }) }),
        {
          kind: "ADD_LINE",
          categoryId: "cat1",
          description: "Line",
          baselineAmount: { amountMinor: 100, currency: "GBP" },
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("leaves baselineAmount unset when omitted from ADD_LINE (Unknown, never $0)", () => {
    const built = buildBudgetEvent(
      model({ financials: financials({ categories: { cat1: category() } }) }),
      { kind: "ADD_LINE", categoryId: "cat1", description: "Line" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_BUDGET_LINE",
    );
    expect(
      mutation && "budgetLine" in mutation
        ? mutation.budgetLine.baselineAmount
        : undefined,
    ).toBeUndefined();
  });

  it("ASSOCIATE_LINE_SCOPE_ITEMS replaces the line's scopeItemIds and is not clerical", () => {
    const built = buildBudgetEvent(
      model({
        financials: financials({
          categories: { cat1: category() },
          budgetLines: {
            line1: budgetLine({ scopeItemIds: ["old-scope"] }),
          },
        }),
      }),
      {
        kind: "ASSOCIATE_LINE_SCOPE_ITEMS",
        budgetLineId: "line1",
        scopeItemIds: ["scope-a", "scope-b", "scope-a"],
      },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(built.clerical).toBe(false);
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_BUDGET_LINE",
    );
    expect(
      mutation && "budgetLine" in mutation
        ? mutation.budgetLine.scopeItemIds
        : undefined,
    ).toEqual(["scope-a", "scope-b"]);
    expect(built.event.note).toContain("scope associations updated");
  });

  it("ASSOCIATE_LINE_SCOPE_ITEMS rejects an unknown budget line", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        {
          kind: "ASSOCIATE_LINE_SCOPE_ITEMS",
          budgetLineId: "missing",
          scopeItemIds: ["scope-a"],
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Unknown budget line: missing");
  });
});

describe("buildBudgetEvent: commitments and actual costs", () => {
  it("ADD_COMMITMENT validates each allocation's budget line exists and currency matches", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        {
          kind: "ADD_COMMITMENT",
          amount: { amountMinor: 1000, currency: "USD" },
          allocations: [
            {
              budgetLineId: "missing",
              amount: { amountMinor: 500, currency: "USD" },
            },
          ],
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Unknown budget line: missing");
  });

  it("VOID_COMMITMENT re-upserts with status VOID rather than a separate deactivate op", () => {
    const built = buildBudgetEvent(
      model({
        financials: financials({ commitments: { commit1: commitment() } }),
      }),
      { kind: "VOID_COMMITMENT", commitmentId: "commit1" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    const mutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_COMMITMENT",
    );
    expect(
      mutation && "commitment" in mutation
        ? mutation.commitment.status
        : undefined,
    ).toBe("VOID");
  });

  it("ADD_ACTUAL_COST validates an optional budgetLineId/commitmentId when provided", () => {
    expect(() =>
      buildBudgetEvent(
        model({ financials: financials() }),
        {
          kind: "ADD_ACTUAL_COST",
          amount: { amountMinor: 100, currency: "USD" },
          date: "2026-08-26",
          description: "test",
          budgetLineId: "missing",
        },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow("Unknown budget line: missing");
  });

  it("ADD_ACTUAL_COST accepts no budgetLineId at all (unallocated)", () => {
    const built = buildBudgetEvent(
      model({ financials: financials() }),
      {
        kind: "ADD_ACTUAL_COST",
        amount: { amountMinor: 100, currency: "USD" },
        date: "2026-08-26",
        description: "test",
      },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(
      built.event.mutations.some((m) => m.op === "UPSERT_ACTUAL_COST"),
    ).toBe(true);
  });
});

describe("buildBudgetEvent: clerical classification", () => {
  it("marks pure text/metadata edits as clerical", () => {
    for (const kind of CLERICAL_BUDGET_COMMAND_KINDS) {
      expect(typeof kind).toBe("string");
    }
    expect(CLERICAL_BUDGET_COMMAND_KINDS.has("SET_LINE_DESCRIPTION")).toBe(
      true,
    );
    expect(CLERICAL_BUDGET_COMMAND_KINDS.has("SET_CATEGORY_NAME")).toBe(true);
  });

  it("marks money-touching and creation commands as NOT clerical", () => {
    expect(CLERICAL_BUDGET_COMMAND_KINDS.has("ADD_LINE")).toBe(false);
    expect(CLERICAL_BUDGET_COMMAND_KINDS.has("SET_LINE_BASELINE_AMOUNT")).toBe(
      false,
    );
    expect(CLERICAL_BUDGET_COMMAND_KINDS.has("ADD_COMMITMENT")).toBe(false);
    expect(
      CLERICAL_BUDGET_COMMAND_KINDS.has("SET_COMMITMENT_ALLOCATIONS"),
    ).toBe(false);
    expect(CLERICAL_BUDGET_COMMAND_KINDS.has("VOID_COMMITMENT")).toBe(false);
  });

  it("stamps clerical: true on the built event only for clerical command kinds", () => {
    const built = buildBudgetEvent(
      model({ financials: financials({ categories: { cat1: category() } }) }),
      { kind: "SET_CATEGORY_NAME", categoryId: "cat1", name: "Renamed" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(built.clerical).toBe(true);
  });
});

describe("buildBudgetEvent: source and verification", () => {
  it("stamps a fresh, referentially-valid Source and PM_CONFIRMED verification on every command", () => {
    const built = buildBudgetEvent(
      model({ financials: financials() }),
      { kind: "ADD_CATEGORY", name: "Cabinetry" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(built.event.verification).toBe("PM_CONFIRMED");
    expect(built.event.sourceIds).toHaveLength(1);
    const sourceMutation = built.event.mutations.find(
      (m) => m.op === "UPSERT_SOURCE",
    );
    expect(
      sourceMutation && "source" in sourceMutation
        ? sourceMutation.source.id
        : undefined,
    ).toBe(built.event.sourceIds[0]);
  });
});

describe("buildBudgetEvent: ADOPT_LEGACY_BASELINE (Phase 4 Task 12, legacy compatibility)", () => {
  it("initializes financials AND sets the baseline in one shot when financials do not yet exist", () => {
    const built = buildBudgetEvent(
      model({
        projectProfile: {
          baselineScope: [],
          budget: { baseline: 310000, currency: "USD" },
        },
      }),
      { kind: "ADOPT_LEGACY_BASELINE" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(built.event.mutations.map((m) => m.op)).toEqual([
      "UPSERT_SOURCE",
      "INITIALIZE_PROJECT_FINANCIALS",
      ...DEFAULT_BUDGET_CATEGORY_NAMES.map(() => "UPSERT_BUDGET_CATEGORY"),
      "SET_PROJECT_FINANCIAL_BASELINE",
    ]);
    expect(built.event.mutations).toContainEqual({
      op: "INITIALIZE_PROJECT_FINANCIALS",
      currency: "USD",
    });
    expect(built.event.mutations).toContainEqual({
      op: "SET_PROJECT_FINANCIAL_BASELINE",
      baseline: { amountMinor: 31000000, currency: "USD" },
    });
    expect(built.clerical).toBe(false);
  });

  it("sets only the baseline when financials are already initialized with the matching currency", () => {
    const built = buildBudgetEvent(
      model({
        projectProfile: {
          baselineScope: [],
          budget: { baseline: 310000, currency: "USD" },
        },
        financials: financials(),
      }),
      { kind: "ADOPT_LEGACY_BASELINE" },
      "2026-08-26T12:00:00Z",
      newId,
    );
    expect(built.event.mutations.map((m) => m.op)).toEqual([
      "UPSERT_SOURCE",
      "SET_PROJECT_FINANCIAL_BASELINE",
    ]);
    expect(built.event.mutations).toContainEqual({
      op: "SET_PROJECT_FINANCIAL_BASELINE",
      baseline: { amountMinor: 31000000, currency: "USD" },
    });
  });

  it("throws when there is no legacy budget on the project's profile at all", () => {
    expect(() =>
      buildBudgetEvent(
        model(),
        { kind: "ADOPT_LEGACY_BASELINE" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("throws when the profile has a budget but no baseline figure", () => {
    expect(() =>
      buildBudgetEvent(
        model({
          projectProfile: {
            baselineScope: [],
            budget: { currency: "USD" },
          },
        }),
        { kind: "ADOPT_LEGACY_BASELINE" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("throws, never silently coercing, when the legacy currency is not supported", () => {
    expect(() =>
      buildBudgetEvent(
        model({
          projectProfile: {
            baselineScope: [],
            budget: { baseline: 310000, currency: "Monopoly dollars" },
          },
        }),
        { kind: "ADOPT_LEGACY_BASELINE" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("throws, never silently overriding, when financials are already tracking a different currency", () => {
    expect(() =>
      buildBudgetEvent(
        model({
          projectProfile: {
            baselineScope: [],
            budget: { baseline: 310000, currency: "USD" },
          },
          financials: financials({ currency: "CAD" }),
        }),
        { kind: "ADOPT_LEGACY_BASELINE" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });

  it("throws, never double-adopting, when the financial baseline has already been set", () => {
    expect(() =>
      buildBudgetEvent(
        model({
          projectProfile: {
            baselineScope: [],
            budget: { baseline: 310000, currency: "USD" },
          },
          financials: financials({
            baseline: { amountMinor: 30000000, currency: "USD" },
          }),
        }),
        { kind: "ADOPT_LEGACY_BASELINE" },
        "2026-08-26T12:00:00Z",
        newId,
      ),
    ).toThrow(BudgetCommandError);
  });
});
