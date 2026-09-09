import { describe, expect, it } from "vitest";
import { applyEventMutations } from "../../src/engine/reducer";
import type {
  ActualCostV097,
  BudgetCategoryV097,
  BudgetLineV097,
  ChangeOrderV097,
  CommitmentV097,
  EventMutationV094,
  ProjectEventV094,
  ProjectFinancialsV097,
  ProjectModelV094,
} from "../../src/domain/types";

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

function event(
  mutations: EventMutationV094[],
  overrides: Partial<ProjectEventV094> = {},
): ProjectEventV094 {
  return {
    id: "e1",
    baseRevision: 0,
    projectId: "p1",
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-26T12:00:00Z",
    receivedAt: "2026-08-26T12:00:00Z",
    sourceIds: [],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: [],
    mutations,
    payload: {},
    ...overrides,
  };
}

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

describe("applyEventMutations: INITIALIZE_PROJECT_FINANCIALS", () => {
  it("creates an empty financials container with the given currency", () => {
    const e = event([{ op: "INITIALIZE_PROJECT_FINANCIALS", currency: "USD" }]);
    const result = applyEventMutations(model(), e);
    expect(result.financials).toEqual(financials({ currency: "USD" }));
  });

  it("throws if financials are already initialized", () => {
    const e = event([{ op: "INITIALIZE_PROJECT_FINANCIALS", currency: "EUR" }]);
    expect(() =>
      applyEventMutations(model({ financials: financials() }), e),
    ).toThrow(
      "Project financials are already initialized and cannot be re-initialized",
    );
  });
});

describe("applyEventMutations: SET_PROJECT_FINANCIAL_BASELINE", () => {
  it("sets baseline, baselineSetAt, and baselineSourceIds", () => {
    const e = event(
      [
        {
          op: "SET_PROJECT_FINANCIAL_BASELINE",
          baseline: { amountMinor: 40000000, currency: "USD" },
        },
      ],
      { sourceIds: ["s1"], occurredAt: "2026-09-01T00:00:00Z" },
    );
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(result.financials?.baseline).toEqual({
      amountMinor: 40000000,
      currency: "USD",
    });
    expect(result.financials?.baselineSetAt).toBe("2026-09-01T00:00:00Z");
    expect(result.financials?.baselineSourceIds).toEqual(["s1"]);
  });

  it("never creates a budget category as a side effect (Correction 10)", () => {
    const e = event([
      {
        op: "SET_PROJECT_FINANCIAL_BASELINE",
        baseline: { amountMinor: 40000000, currency: "USD" },
      },
    ]);
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(result.financials?.categories).toEqual({});
  });

  it("throws if financials are not yet initialized", () => {
    const e = event([
      {
        op: "SET_PROJECT_FINANCIAL_BASELINE",
        baseline: { amountMinor: 100, currency: "USD" },
      },
    ]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Cannot apply SET_PROJECT_FINANCIAL_BASELINE before project financials are initialized",
    );
  });
});

describe("applyEventMutations: budget categories", () => {
  it("upserts a budget category", () => {
    const e = event([{ op: "UPSERT_BUDGET_CATEGORY", category: category() }]);
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(result.financials?.categories.cat1?.name).toBe("Cabinetry");
  });

  it("throws if financials are not yet initialized", () => {
    const e = event([{ op: "UPSERT_BUDGET_CATEGORY", category: category() }]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Cannot apply UPSERT_BUDGET_CATEGORY before project financials are initialized",
    );
  });

  it("deactivates a budget category", () => {
    const e = event([{ op: "DEACTIVATE_BUDGET_CATEGORY", categoryId: "cat1" }]);
    const result = applyEventMutations(
      model({ financials: financials({ categories: { cat1: category() } }) }),
      e,
    );
    expect(result.financials?.categories.cat1?.active).toBe(false);
  });

  it("throws for an unknown category in DEACTIVATE_BUDGET_CATEGORY", () => {
    const e = event([
      { op: "DEACTIVATE_BUDGET_CATEGORY", categoryId: "missing" },
    ]);
    expect(() =>
      applyEventMutations(model({ financials: financials() }), e),
    ).toThrow("Unknown budget category in DEACTIVATE_BUDGET_CATEGORY: missing");
  });
});

describe("applyEventMutations: budget lines", () => {
  it("upserts a budget line when its category exists", () => {
    const e = event([{ op: "UPSERT_BUDGET_LINE", budgetLine: budgetLine() }]);
    const result = applyEventMutations(
      model({ financials: financials({ categories: { cat1: category() } }) }),
      e,
    );
    expect(result.financials?.budgetLines.line1?.description).toBe(
      "Kitchen cabinets",
    );
  });

  it("throws when the referenced category is unknown", () => {
    const e = event([{ op: "UPSERT_BUDGET_LINE", budgetLine: budgetLine() }]);
    expect(() =>
      applyEventMutations(model({ financials: financials() }), e),
    ).toThrow("UPSERT_BUDGET_LINE references unknown budget category cat1");
  });

  it("leaves baselineAmount unset (Unknown, never $0) when omitted", () => {
    const e = event([{ op: "UPSERT_BUDGET_LINE", budgetLine: budgetLine() }]);
    const result = applyEventMutations(
      model({ financials: financials({ categories: { cat1: category() } }) }),
      e,
    );
    expect(
      result.financials?.budgetLines.line1?.baselineAmount,
    ).toBeUndefined();
  });

  it("deactivates a budget line", () => {
    const e = event([{ op: "DEACTIVATE_BUDGET_LINE", budgetLineId: "line1" }]);
    const result = applyEventMutations(
      model({
        financials: financials({
          categories: { cat1: category() },
          budgetLines: { line1: budgetLine() },
        }),
      }),
      e,
    );
    expect(result.financials?.budgetLines.line1?.active).toBe(false);
  });

  it("throws for an unknown budget line in DEACTIVATE_BUDGET_LINE", () => {
    const e = event([
      { op: "DEACTIVATE_BUDGET_LINE", budgetLineId: "missing" },
    ]);
    expect(() =>
      applyEventMutations(model({ financials: financials() }), e),
    ).toThrow("Unknown budget line in DEACTIVATE_BUDGET_LINE: missing");
  });
});

describe("applyEventMutations: commitments and actual costs", () => {
  it("upserts a commitment with a partially allocated amount (Correction 6)", () => {
    const e = event([
      {
        op: "UPSERT_COMMITMENT",
        commitment: commitment({
          allocations: [
            {
              budgetLineId: "line1",
              amount: { amountMinor: 60000, currency: "USD" },
            },
          ],
        }),
      },
    ]);
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(result.financials?.commitments.commit1?.amount.amountMinor).toBe(
      100000,
    );
    expect(result.financials?.commitments.commit1?.allocations).toHaveLength(1);
  });

  it("throws if financials are not yet initialized", () => {
    const e = event([{ op: "UPSERT_COMMITMENT", commitment: commitment() }]);
    expect(() => applyEventMutations(model(), e)).toThrow(
      "Cannot apply UPSERT_COMMITMENT before project financials are initialized",
    );
  });

  it("upserts an unallocated actual cost (Correction 6: budgetLineId is optional)", () => {
    const e = event([{ op: "UPSERT_ACTUAL_COST", actualCost: actualCost() }]);
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(
      result.financials?.actualCosts.actual1?.budgetLineId,
    ).toBeUndefined();
  });

  it("voids a commitment via re-UPSERT with status VOID rather than a separate DEACTIVATE op", () => {
    const e = event([
      { op: "UPSERT_COMMITMENT", commitment: commitment({ status: "VOID" }) },
    ]);
    const result = applyEventMutations(
      model({
        financials: financials({ commitments: { commit1: commitment() } }),
      }),
      e,
    );
    expect(result.financials?.commitments.commit1?.status).toBe("VOID");
  });
});

describe("applyEventMutations: change order lifecycle transitions", () => {
  function withChangeOrder(status: ChangeOrderV097["status"]) {
    return model({
      financials: financials({
        changeOrders: { co1: changeOrder({ status }) },
      }),
    });
  }

  it("creates a new change order only in DRAFT status", () => {
    const e = event([
      { op: "UPSERT_CHANGE_ORDER", changeOrder: changeOrder() },
    ]);
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(result.financials?.changeOrders.co1?.status).toBe("DRAFT");
  });

  it("throws when a new change order is created in a non-DRAFT status", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "PROPOSED" }),
      },
    ]);
    expect(() =>
      applyEventMutations(model({ financials: financials() }), e),
    ).toThrow("Change order co1 must be created in DRAFT status, not PROPOSED");
  });

  it("allows DRAFT -> PROPOSED -> PENDING_APPROVAL -> APPROVED", () => {
    let current = model({ financials: financials() });
    current = applyEventMutations(
      current,
      event([{ op: "UPSERT_CHANGE_ORDER", changeOrder: changeOrder() }]),
    );
    current = applyEventMutations(
      current,
      event([
        {
          op: "UPSERT_CHANGE_ORDER",
          changeOrder: changeOrder({ status: "PROPOSED" }),
        },
      ]),
    );
    current = applyEventMutations(
      current,
      event([
        {
          op: "UPSERT_CHANGE_ORDER",
          changeOrder: changeOrder({ status: "PENDING_APPROVAL" }),
        },
      ]),
    );
    current = applyEventMutations(
      current,
      event([
        {
          op: "UPSERT_CHANGE_ORDER",
          changeOrder: changeOrder({ status: "APPROVED" }),
        },
      ]),
    );
    expect(current.financials?.changeOrders.co1?.status).toBe("APPROVED");
  });

  it("allows APPROVED -> VOID as an explicit reversal", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "VOID" }),
      },
    ]);
    const result = applyEventMutations(withChangeOrder("APPROVED"), e);
    expect(result.financials?.changeOrders.co1?.status).toBe("VOID");
  });

  it("rejects APPROVED -> PROPOSED (an approval can never be silently unwound to pending)", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "PROPOSED" }),
      },
    ]);
    expect(() => applyEventMutations(withChangeOrder("APPROVED"), e)).toThrow(
      "Change order co1 cannot transition from APPROVED to PROPOSED",
    );
  });

  it("rejects re-approving an already-approved change order via APPROVED -> APPROVED -> re-VOID double count: APPROVED cannot go to PENDING_APPROVAL", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "PENDING_APPROVAL" }),
      },
    ]);
    expect(() => applyEventMutations(withChangeOrder("APPROVED"), e)).toThrow(
      "Change order co1 cannot transition from APPROVED to PENDING_APPROVAL",
    );
  });

  it("rejects any transition out of VOID (terminal)", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "DRAFT" }),
      },
    ]);
    expect(() => applyEventMutations(withChangeOrder("VOID"), e)).toThrow(
      "Change order co1 cannot transition from VOID to DRAFT",
    );
  });

  it("allows REJECTED -> DRAFT as an explicit PM correction/reopen", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "DRAFT" }),
      },
    ]);
    const result = applyEventMutations(withChangeOrder("REJECTED"), e);
    expect(result.financials?.changeOrders.co1?.status).toBe("DRAFT");
  });

  it("allows re-upserting the same status (e.g. editing notes without a status change)", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({ status: "PROPOSED", notes: "clarified" }),
      },
    ]);
    const result = applyEventMutations(withChangeOrder("PROPOSED"), e);
    expect(result.financials?.changeOrders.co1?.notes).toBe("clarified");
  });

  it("supports a negative cost for a credit change order", () => {
    const e = event([
      {
        op: "UPSERT_CHANGE_ORDER",
        changeOrder: changeOrder({
          cost: { amountMinor: -50000, currency: "USD" },
        }),
      },
    ]);
    const result = applyEventMutations(model({ financials: financials() }), e);
    expect(result.financials?.changeOrders.co1?.cost.amountMinor).toBe(-50000);
  });
});

describe("applyEventMutations: financials cloning and immutability", () => {
  it("does not mutate the original model's financials", () => {
    const original = model({
      financials: financials({ categories: { cat1: category() } }),
    });
    const e = event([{ op: "DEACTIVATE_BUDGET_CATEGORY", categoryId: "cat1" }]);
    applyEventMutations(original, e);
    expect(original.financials?.categories.cat1?.active).toBe(true);
  });

  it("does not share array/object references with the original budget line", () => {
    const original = model({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine({ scopeItemIds: ["scope1"] }) },
      }),
    });
    const result = applyEventMutations(original, event([]));
    result.financials?.budgetLines.line1?.scopeItemIds.push("scope2");
    expect(original.financials?.budgetLines.line1?.scopeItemIds).toEqual([
      "scope1",
    ]);
  });
});
