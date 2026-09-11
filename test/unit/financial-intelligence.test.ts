import { describe, expect, it } from "vitest";
import {
  computeFinancialFindings,
  type FinancialFindingKindV097,
} from "../../src/operator/financial-intelligence";
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

  it("LINE_COMMITMENT_OVER_REVISED: flags when allocated commitments exceed the line's revised amount", () => {
    const model = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
          }),
        },
        commitments: {
          commit1: commitment({
            amount: { amountMinor: 150000, currency: "USD" },
            allocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 150000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "LINE_COMMITMENT_OVER_REVISED",
        budgetLineId: "line1",
      }),
    );
    const finding = findings.find(
      (f) => f.kind === "LINE_COMMITMENT_OVER_REVISED",
    );
    expect(finding?.message).toContain("$1,500.00");
    expect(finding?.message).toContain("$1,000.00");
  });

  it("LINE_COMMITMENT_OVER_REVISED: never fires when committed is within revised, or the baseline is Unknown", () => {
    const withinRevised = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
          }),
        },
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
      computeFinancialFindings(withinRevised).some(
        (f) => f.kind === "LINE_COMMITMENT_OVER_REVISED",
      ),
    ).toBe(false);

    const unknownBaseline = baseModel({
      financials: financials({
        budgetLines: { line1: budgetLine({ scopeItemIds: ["scope1"] }) },
        commitments: {
          commit1: commitment({
            allocations: [
              {
                budgetLineId: "line1",
                amount: { amountMinor: 150000, currency: "USD" },
              },
            ],
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(unknownBaseline).some(
        (f) => f.kind === "LINE_COMMITMENT_OVER_REVISED",
      ),
    ).toBe(false);
  });

  it("LINE_ACTUAL_OVER_REVISED: flags when recorded actuals exceed the line's revised amount", () => {
    const model = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
          }),
        },
        actualCosts: {
          a1: actualCost({
            amount: { amountMinor: 125000, currency: "USD" },
            budgetLineId: "line1",
          }),
        },
      }),
    });
    const findings = computeFinancialFindings(model);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "LINE_ACTUAL_OVER_REVISED",
        budgetLineId: "line1",
      }),
    );
    const finding = findings.find((f) => f.kind === "LINE_ACTUAL_OVER_REVISED");
    expect(finding?.message).toContain("$1,250.00");
    expect(finding?.message).toContain("$1,000.00");
  });

  it("LINE_ACTUAL_OVER_REVISED: never fires when actual is within revised, or the actual is VOID", () => {
    const withinRevised = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
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
      computeFinancialFindings(withinRevised).some(
        (f) => f.kind === "LINE_ACTUAL_OVER_REVISED",
      ),
    ).toBe(false);

    const voided = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
          }),
        },
        actualCosts: {
          a1: actualCost({
            amount: { amountMinor: 125000, currency: "USD" },
            budgetLineId: "line1",
            status: "VOID",
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(voided).some(
        (f) => f.kind === "LINE_ACTUAL_OVER_REVISED",
      ),
    ).toBe(false);
  });

  it("SCOPE_HAS_NO_BUDGET_ASSOCIATION: flags an included scope item with no budget line link", () => {
    const model = baseModel({
      scopeItems: { scope1: scopeItem() },
      financials: financials(),
    });
    expect(computeFinancialFindings(model)).toContainEqual(
      expect.objectContaining({
        kind: "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
        scopeItemId: "scope1",
      }),
    );
  });

  it("SCOPE_HAS_NO_BUDGET_ASSOCIATION: never fires once associated, linked as an allowance, or excluded", () => {
    const associated = baseModel({
      scopeItems: { scope1: scopeItem() },
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(associated).some(
        (f) => f.kind === "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
      ),
    ).toBe(false);

    const linkedAllowance = baseModel({
      scopeItems: { scope1: scopeItem({ allowanceBudgetLineId: "line1" }) },
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(linkedAllowance).some(
        (f) => f.kind === "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
      ),
    ).toBe(false);

    const excluded = baseModel({
      scopeItems: { scope1: scopeItem({ included: false }) },
      financials: financials(),
    });
    expect(
      computeFinancialFindings(excluded).some(
        (f) => f.kind === "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
      ),
    ).toBe(false);
  });

  it("LINE_HAS_NO_SCOPE: flags an active budget line with no scope association", () => {
    const model = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
          }),
        },
      }),
    });
    expect(computeFinancialFindings(model)).toContainEqual(
      expect.objectContaining({
        kind: "LINE_HAS_NO_SCOPE",
        budgetLineId: "line1",
      }),
    );
  });

  it("LINE_HAS_NO_SCOPE: never fires once associated, or for a deactivated line", () => {
    const associated = baseModel({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            baselineAmount: { amountMinor: 100000, currency: "USD" },
            scopeItemIds: ["scope1"],
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(associated).some(
        (f) => f.kind === "LINE_HAS_NO_SCOPE",
      ),
    ).toBe(false);

    const deactivated = baseModel({
      financials: financials({
        budgetLines: { line1: budgetLine({ active: false }) },
      }),
    });
    expect(
      computeFinancialFindings(deactivated).some(
        (f) => f.kind === "LINE_HAS_NO_SCOPE",
      ),
    ).toBe(false);
  });

  it("PENDING_CO_UNPRICED: flags a PROPOSED or PENDING_APPROVAL change order with $0 cost", () => {
    const proposed = baseModel({
      financials: financials({
        changeOrders: {
          co1: changeOrder({
            status: "PROPOSED",
            cost: { amountMinor: 0, currency: "USD" },
          }),
        },
      }),
    });
    expect(computeFinancialFindings(proposed)).toContainEqual(
      expect.objectContaining({
        kind: "PENDING_CO_UNPRICED",
        changeOrderId: "co1",
      }),
    );

    const pending = baseModel({
      financials: financials({
        changeOrders: {
          co1: changeOrder({
            status: "PENDING_APPROVAL",
            cost: { amountMinor: 0, currency: "USD" },
          }),
        },
      }),
    });
    expect(computeFinancialFindings(pending)).toContainEqual(
      expect.objectContaining({
        kind: "PENDING_CO_UNPRICED",
        changeOrderId: "co1",
      }),
    );
  });

  it("PENDING_CO_UNPRICED: never fires for a priced pending CO, or for DRAFT/APPROVED even at $0", () => {
    const priced = baseModel({
      financials: financials({
        changeOrders: {
          co1: changeOrder({
            status: "PROPOSED",
            cost: { amountMinor: 100, currency: "USD" },
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(priced).some(
        (f) => f.kind === "PENDING_CO_UNPRICED",
      ),
    ).toBe(false);

    const draft = baseModel({
      financials: financials({
        changeOrders: {
          co1: changeOrder({
            status: "DRAFT",
            cost: { amountMinor: 0, currency: "USD" },
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(draft).some(
        (f) => f.kind === "PENDING_CO_UNPRICED",
      ),
    ).toBe(false);

    const approved = baseModel({
      financials: financials({
        changeOrders: {
          co1: changeOrder({
            status: "APPROVED",
            cost: { amountMinor: 0, currency: "USD" },
          }),
        },
      }),
    });
    expect(
      computeFinancialFindings(approved).some(
        (f) => f.kind === "PENDING_CO_UNPRICED",
      ),
    ).toBe(false);
  });

  it("FinancialFindingKindV097 stays in lockstep with src/app/types.ts FinancialFindingKindLike", () => {
    // Compile-time: adding an operator kind without updating this list fails `satisfies`.
    // Runtime: the listed kinds are the exact frontend union -- keep both files together.
    const kinds = [
      "LINE_HAS_NO_BASELINE",
      "ACTUAL_COST_UNALLOCATED",
      "COMMITMENT_HAS_UNALLOCATED_AMOUNT",
      "APPROVED_CO_HAS_UNALLOCATED_AMOUNT",
      "ALLOWANCE_OVERRUN",
      "SCOPE_ALLOWANCE_NOT_LINKED",
      "LINE_COMMITMENT_OVER_REVISED",
      "LINE_ACTUAL_OVER_REVISED",
      "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
      "LINE_HAS_NO_SCOPE",
      "PENDING_CO_UNPRICED",
    ] as const satisfies readonly FinancialFindingKindV097[];
    type AssertSame<A, B> = [A] extends [B]
      ? [B] extends [A]
        ? true
        : never
      : never;
    const _lockstep: AssertSame<
      (typeof kinds)[number],
      FinancialFindingKindV097
    > = true;
    expect(_lockstep).toBe(true);
    expect(kinds).toHaveLength(11);
  });
});
