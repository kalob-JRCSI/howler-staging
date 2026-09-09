import { describe, expect, it } from "vitest";
import { validateProjectModel } from "../../src/domain/validation";
import type {
  ActualCostV097,
  BudgetCategoryV097,
  BudgetLineV097,
  ChangeOrderV097,
  CommitmentV097,
  ProjectFinancialsV097,
  ProjectModelV094,
  ScopeItemV096,
} from "../../src/domain/types";

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

function scopeItem(overrides: Partial<ScopeItemV096> = {}): ScopeItemV096 {
  return {
    id: "scope1",
    description: "Kitchen",
    phase: "Interior",
    active: true,
    status: "NOT_STARTED",
    included: true,
    activityIds: [],
    planDocumentRefs: [],
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function baseModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test Project",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {
      s1: {
        id: "s1",
        type: "PLAN",
        label: "Plan",
        observedAt: "2026-08-26T00:00:00Z",
        authority: 0.9,
        reliability: 0.9,
      },
    },
    activities: {},
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

describe("validateProjectModel: project financials", () => {
  it("accepts a well-formed, fully linked financial model", () => {
    const model = baseModel({
      scopeItems: { scope1: scopeItem({ allowanceBudgetLineId: "line1" }) },
      financials: financials({
        baseline: { amountMinor: 40000000, currency: "USD" },
        baselineSourceIds: ["s1"],
        categories: { cat1: category() },
        budgetLines: {
          line1: budgetLine({ scopeItemIds: ["scope1"], sourceIds: ["s1"] }),
        },
        commitments: {
          commit1: commitment({
            allocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 60000, currency: "USD" },
              },
            ],
          }),
        },
        actualCosts: { actual1: actualCost({ budgetLineId: "line1" }) },
        changeOrders: {
          co1: changeOrder({
            costAllocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 500000, currency: "USD" },
              },
            ],
            scopeItemIds: ["scope1"],
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("accepts a project with no financials at all (not yet initialized)", () => {
    expect(() => {
      validateProjectModel(baseModel());
    }).not.toThrow();
  });

  it("accepts financials with no baseline set (Unknown, never $0)", () => {
    const model = baseModel({ financials: financials() });
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("rejects an unsupported financials currency", () => {
    const model = baseModel({ financials: financials({ currency: "JPY" }) });
    expect(() => {
      validateProjectModel(model);
    }).toThrow('Project financials currency "JPY" is not supported');
  });

  it("rejects a baseline in a different currency than the project's tracked currency", () => {
    const model = baseModel({
      financials: financials({
        baseline: { amountMinor: 100, currency: "EUR" },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Project financial baseline currency EUR does not match the project's tracked currency USD",
    );
  });

  it("rejects a baseline referencing an unknown source", () => {
    const model = baseModel({
      financials: financials({ baselineSourceIds: ["missing"] }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Project financial baseline references unknown source missing");
  });

  it("rejects a budget line referencing an unknown category", () => {
    const model = baseModel({
      financials: financials({ budgetLines: { line1: budgetLine() } }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Budget line line1 references unknown budget category cat1");
  });

  it("accepts a budget line with baselineAmount absent (Unknown, never $0)", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine() },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("rejects a budget line baselineAmount in the wrong currency", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100, currency: "GBP" },
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Budget line line1 baselineAmount currency GBP does not match the project's tracked currency USD",
    );
  });

  it("rejects a budget line referencing an unknown scope item", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine({ scopeItemIds: ["missing"] }) },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Budget line line1 references unknown scope item missing");
  });

  it("rejects a commitment with an invalid status", () => {
    const model = baseModel({
      financials: financials({
        commitments: {
          commit1: {
            ...commitment(),
            status: "SOMETHING_ELSE" as unknown as "ACTIVE",
          },
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Commitment commit1 has invalid status SOMETHING_ELSE");
  });

  it("accepts a commitment with a partial (under-)allocation", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine() },
        commitments: {
          commit1: commitment({
            allocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 1000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("rejects a commitment whose allocations exceed its total amount", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine() },
        commitments: {
          commit1: commitment({
            amount: { amountMinor: 1000, currency: "USD" },
            allocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 5000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Commitment commit1 allocations (5000) exceed its total amount (1000)",
    );
  });

  it("rejects a commitment allocation referencing an unknown budget line", () => {
    const model = baseModel({
      financials: financials({
        commitments: {
          commit1: commitment({
            allocations: [
              {
                budgetLineId: "missing",
                amount: { amountMinor: 100, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Commitment commit1 allocation references unknown budget line missing",
    );
  });

  it("accepts an actual cost with no budgetLineId (unallocated, Correction 6)", () => {
    const model = baseModel({
      financials: financials({ actualCosts: { actual1: actualCost() } }),
    });
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("rejects an actual cost referencing an unknown budget line", () => {
    const model = baseModel({
      financials: financials({
        actualCosts: { actual1: actualCost({ budgetLineId: "missing" }) },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Actual cost actual1 references unknown budget line missing");
  });

  it("rejects an actual cost referencing an unknown commitment", () => {
    const model = baseModel({
      financials: financials({
        actualCosts: { actual1: actualCost({ commitmentId: "missing" }) },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Actual cost actual1 references unknown commitment missing");
  });

  it("rejects a change order with an invalid status", () => {
    const model = baseModel({
      financials: financials({
        changeOrders: {
          co1: { ...changeOrder(), status: "CANCELLED" as unknown as "DRAFT" },
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Change order co1 has invalid status CANCELLED");
  });

  it("rejects change order cost allocations that exceed its total cost", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine() },
        changeOrders: {
          co1: changeOrder({
            cost: { amountMinor: 1000, currency: "USD" },
            costAllocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 5000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow(
      "Change order co1 allocations (5000) exceed its total amount (1000)",
    );
  });

  it("accepts a credit (negative-cost) change order with matching negative allocations within magnitude", () => {
    const model = baseModel({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine() },
        changeOrders: {
          co1: changeOrder({
            cost: { amountMinor: -50000, currency: "USD" },
            costAllocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: -20000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
  });

  it("rejects a change order referencing an unknown scope item", () => {
    const model = baseModel({
      financials: financials({
        changeOrders: { co1: changeOrder({ scopeItemIds: ["missing"] }) },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Change order co1 references unknown scope item missing");
  });

  it("rejects a change order referencing an unknown activity", () => {
    const model = baseModel({
      financials: financials({
        changeOrders: { co1: changeOrder({ activityIds: ["missing"] }) },
      }),
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Change order co1 references unknown activity missing");
  });

  it("rejects a scope item's allowanceBudgetLineId when the budget line doesn't exist", () => {
    const model = baseModel({
      scopeItems: { scope1: scopeItem({ allowanceBudgetLineId: "missing" }) },
    });
    expect(() => {
      validateProjectModel(model);
    }).toThrow("Scope item scope1 references unknown budget line missing");
  });
});
