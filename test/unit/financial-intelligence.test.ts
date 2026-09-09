import { describe, expect, it } from "vitest";
import { computeFinancialFindings } from "../../src/operator/financial-intelligence";
import type {
  ActualCostV097,
  BudgetLineV097,
  ChangeOrderV097,
  CommitmentV097,
  ProjectFinancialsV097,
  ProjectModelV094,
  ScopeItemV096,
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

function budgetLine(overrides: Partial<BudgetLineV097> = {}): BudgetLineV097 {
  return {
    id: "line1",
    categoryId: "cat1",
    description: "Kitchen cabinets",
    isAllowance: false,
    scopeItemIds: [],
    active: true,
    sourceIds: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function actualCost(overrides: Partial<ActualCostV097> = {}): ActualCostV097 {
  return {
    id: "actual1",
    amount: { amountMinor: 50000, currency: "USD" },
    date: "2026-08-15",
    description: "Cabinet deposit",
    status: "RECORDED",
    sourceIds: [],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
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
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function changeOrder(
  overrides: Partial<ChangeOrderV097> = {},
): ChangeOrderV097 {
  return {
    id: "co1",
    title: "Cabinetry upgrade",
    status: "APPROVED",
    cost: { amountMinor: 680000, currency: "USD" },
    costAllocations: [],
    scopeItemIds: [],
    activityIds: [],
    sourceIds: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function scopeItem(overrides: Partial<ScopeItemV096> = {}): ScopeItemV096 {
  return {
    id: "scope1",
    description: "Kitchen fixtures",
    phase: "Interior",
    active: true,
    status: "NOT_STARTED",
    included: true,
    activityIds: [],
    planDocumentRefs: [],
    sourceIds: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
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

describe("computeFinancialFindings", () => {
  it("returns an empty list (never a fabricated 'all clear') when financials were never initialized", () => {
    expect(computeFinancialFindings(baseModel())).toEqual([]);
  });

  it("LINE_HAS_NO_BASELINE: flags an active budget line with no baselineAmount", () => {
    const model = baseModel({
      financials: financials({ budgetLines: { line1: budgetLine() } }),
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "LINE_HAS_NO_BASELINE",
        budgetLineId: "line1",
      }),
    );
  });

  it("LINE_HAS_NO_BASELINE: never fires once a baseline is set, or for a deactivated line", () => {
    const withBaseline = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(withBaseline).some(
        (f) => f.kind === "LINE_HAS_NO_BASELINE",
      ),
    ).toBe(false);

    const deactivated = baseModel({
      financials: financials({
        budgetLines: { line1: budgetLine({ active: false }) },
      }),
    });
    expect(
      computeFinancialFindings(deactivated).some(
        (f) => f.kind === "LINE_HAS_NO_BASELINE",
      ),
    ).toBe(false);
  });

  it("ACTUAL_COST_UNALLOCATED: flags a RECORDED actual cost with no budgetLineId", () => {
    const model = baseModel({
      financials: financials({ actualCosts: { actual1: actualCost() } }),
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "ACTUAL_COST_UNALLOCATED",
        actualCostId: "actual1",
      }),
    );
  });

  it("ACTUAL_COST_UNALLOCATED: never fires once allocated, or for a VOID actual cost", () => {
    const allocated = baseModel({
      financials: financials({
        actualCosts: { actual1: actualCost({ budgetLineId: "line1" }) },
      }),
    });
    expect(
      computeFinancialFindings(allocated).some(
        (f) => f.kind === "ACTUAL_COST_UNALLOCATED",
      ),
    ).toBe(false);

    const voided = baseModel({
      financials: financials({
        actualCosts: { actual1: actualCost({ status: "VOID" }) },
      }),
    });
    expect(
      computeFinancialFindings(voided).some(
        (f) => f.kind === "ACTUAL_COST_UNALLOCATED",
      ),
    ).toBe(false);
  });

  it("COMMITMENT_HAS_UNALLOCATED_AMOUNT: flags a partially allocated ACTIVE commitment", () => {
    const model = baseModel({
      financials: financials({
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
      }),
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "COMMITMENT_HAS_UNALLOCATED_AMOUNT",
        commitmentId: "commit1",
      }),
    );
  });

  it("COMMITMENT_HAS_UNALLOCATED_AMOUNT: never fires when fully allocated, or for a VOID commitment", () => {
    const fullyAllocated = baseModel({
      financials: financials({
        commitments: {
          commit1: commitment({
            allocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 100000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(fullyAllocated).some(
        (f) => f.kind === "COMMITMENT_HAS_UNALLOCATED_AMOUNT",
      ),
    ).toBe(false);

    const voided = baseModel({
      financials: financials({
        commitments: { commit1: commitment({ status: "VOID" }) },
      }),
    });
    expect(
      computeFinancialFindings(voided).some(
        (f) => f.kind === "COMMITMENT_HAS_UNALLOCATED_AMOUNT",
      ),
    ).toBe(false);
  });

  it("APPROVED_CO_HAS_UNALLOCATED_AMOUNT: flags a partially allocated APPROVED change order", () => {
    const model = baseModel({
      financials: financials({
        changeOrders: {
          co1: changeOrder({
            costAllocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 500000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "APPROVED_CO_HAS_UNALLOCATED_AMOUNT",
        changeOrderId: "co1",
      }),
    );
  });

  it("APPROVED_CO_HAS_UNALLOCATED_AMOUNT: never fires for a DRAFT/PENDING change order, even if unallocated", () => {
    const draft = baseModel({
      financials: financials({
        changeOrders: { co1: changeOrder({ status: "DRAFT" }) },
      }),
    });
    expect(
      computeFinancialFindings(draft).some(
        (f) => f.kind === "APPROVED_CO_HAS_UNALLOCATED_AMOUNT",
      ),
    ).toBe(false);
  });

  it("SCOPE_ALLOWANCE_NOT_LINKED: flags a scope item with a legacy allowance but no allowanceBudgetLineId", () => {
    const model = baseModel({
      scopeItems: {
        scope1: scopeItem({
          allowance: { amount: 1000, currency: "USD" },
        }),
      },
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "SCOPE_ALLOWANCE_NOT_LINKED",
        scopeItemId: "scope1",
      }),
    );
  });

  it("SCOPE_ALLOWANCE_NOT_LINKED: never fires once linked, or with no legacy allowance at all", () => {
    const linked = baseModel({
      scopeItems: {
        scope1: scopeItem({
          allowance: { amount: 1000, currency: "USD" },
          allowanceBudgetLineId: "line1",
        }),
      },
      financials: financials({ budgetLines: { line1: budgetLine() } }),
    });
    expect(
      computeFinancialFindings(linked).some(
        (f) => f.kind === "SCOPE_ALLOWANCE_NOT_LINKED",
      ),
    ).toBe(false);

    const noAllowance = baseModel({ scopeItems: { scope1: scopeItem() } });
    expect(
      computeFinancialFindings(noAllowance).some(
        (f) => f.kind === "SCOPE_ALLOWANCE_NOT_LINKED",
      ),
    ).toBe(false);
  });

  it("ALLOWANCE_OVERRUN: computes the exact $1,000 allowance vs $1,175 actual example", () => {
    const model = baseModel({
      scopeItems: {
        scope1: scopeItem({ allowanceBudgetLineId: "line1" }),
      },
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
          }),
        },
        actualCosts: {
          a1: actualCost({
            amount: { amountMinor: 117500, currency: "USD" },
            budgetLineId: "line1",
          }),
        },
      }),
    });
    const findings = computeFinancialFindings(model);
    const finding = findings.find((f) => f.kind === "ALLOWANCE_OVERRUN");
    expect(finding).toBeDefined();
    expect(finding?.scopeItemId).toBe("scope1");
    expect(finding?.budgetLineId).toBe("line1");
    expect(finding?.message).toContain("$1,000.00");
    expect(finding?.message).toContain("$175.00");
  });

  it("ALLOWANCE_OVERRUN: never fires when actual is within the allowance, or the allowance is Unknown", () => {
    const withinAllowance = baseModel({
      scopeItems: { scope1: scopeItem({ allowanceBudgetLineId: "line1" }) },
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
          }),
        },
        actualCosts: {
          a1: actualCost({
            amount: { amountMinor: 90000, currency: "USD" },
            budgetLineId: "line1",
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(withinAllowance).some(
        (f) => f.kind === "ALLOWANCE_OVERRUN",
      ),
    ).toBe(false);

    const unknownAllowance = baseModel({
      scopeItems: { scope1: scopeItem({ allowanceBudgetLineId: "line1" }) },
      financials: financials({
        budgetLines: { line1: budgetLine() },
        actualCosts: {
          a1: actualCost({
            amount: { amountMinor: 90000, currency: "USD" },
            budgetLineId: "line1",
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(unknownAllowance).some(
        (f) => f.kind === "ALLOWANCE_OVERRUN",
      ),
    ).toBe(false);
  });
});
