import { describe, expect, it } from "vitest";
import {
  interpretFinancialTurn,
  type CallFinancialModel,
  type FinancialInterpretationResult,
} from "../../src/operator/financial-interpreter";
import { buildFieldTestCallFinancialModel } from "../../src/worker/financial-conversation-field-model";
import type {
  BudgetCategoryV097,
  BudgetLineV097,
  ProjectFinancialsV097,
  ProjectModelV094,
  ScopeItemV096,
} from "../../src/domain/types";
import type { BudgetCommandV097 } from "../../src/operator/budget";

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
    name: "Plumbing",
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
    description: "Plumbing rough-in",
    trade: "Plumbing",
    isAllowance: false,
    scopeItemIds: [],
    active: true,
    sourceIds: [],
    createdAt: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function scopeItem(
  id: string,
  overrides: Partial<ScopeItemV096> = {},
): ScopeItemV096 {
  return {
    id,
    description: id,
    phase: "Finishes",
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

function fixedModel(result: FinancialInterpretationResult): CallFinancialModel {
  return () => Promise.resolve(result);
}

const TODAY = "2026-09-09";

describe("interpretFinancialTurn: RECORD_COMMITMENT (Medina plumbing example)", () => {
  it("resolves 'Medina's approved plumbing proposal is $18,750.' against the real deterministic double, allocated to a matching line", async () => {
    const project = model({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: { line1: budgetLine() },
      }),
    });
    const resolution = await interpretFinancialTurn(
      project,
      "Medina's approved plumbing proposal is $18,750.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("RESOLVED");
    if (resolution.outcome !== "RESOLVED") return;
    expect(resolution.module).toBe("BUDGET");
    const command = resolution.command as Extract<
      BudgetCommandV097,
      { kind: "ADD_COMMITMENT" }
    >;
    expect(command.kind).toBe("ADD_COMMITMENT");
    expect(command.amount).toEqual({ amountMinor: 1875000, currency: "USD" });
    expect(command.vendorRef).toBe("Medina");
    expect(command.allocations).toEqual([
      {
        budgetLineId: "line1",
        amount: { amountMinor: 1875000, currency: "USD" },
      },
    ]);
  });

  it("proceeds unallocated (never a blocking failure) when no budget line matches the trade text", async () => {
    const project = model({ financials: financials() });
    const resolution = await interpretFinancialTurn(
      project,
      "Medina's approved plumbing proposal is $18,750.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("RESOLVED");
    if (resolution.outcome !== "RESOLVED") return;
    const command = resolution.command as Extract<
      BudgetCommandV097,
      { kind: "ADD_COMMITMENT" }
    >;
    expect(command.allocations).toBeUndefined();
  });

  it("asks for clarification when more than one budget line matches the trade text", async () => {
    const project = model({
      financials: financials({
        categories: { cat1: category() },
        budgetLines: {
          line1: budgetLine({ id: "line1", description: "Plumbing rough-in" }),
          line2: budgetLine({ id: "line2", description: "Plumbing fixtures" }),
        },
      }),
    });
    const resolution = await interpretFinancialTurn(
      project,
      "Medina's approved plumbing proposal is $18,750.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });

  it("asks for clarification when the model supplies no amount", async () => {
    const project = model({ financials: financials() });
    const resolution = await interpretFinancialTurn(
      project,
      "Medina's plumbing work is approved.",
      fixedModel({ intent: "RECORD_COMMITMENT", vendorText: "Medina" }),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });

  it("asks for clarification when the amount text cannot be parsed as money", async () => {
    const project = model({ financials: financials() });
    const resolution = await interpretFinancialTurn(
      project,
      "Medina's approved plumbing proposal is a lot.",
      fixedModel({
        intent: "RECORD_COMMITMENT",
        vendorText: "Medina",
        amountText: "a lot",
      }),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });
});

describe("interpretFinancialTurn: ambiguous restatement (required Task 13 acceptance case)", () => {
  it("never assumes estimate vs. approved commitment for 'Medina came in at 18,750.' -- must clarify", async () => {
    const project = model({ financials: financials() });
    const resolution = await interpretFinancialTurn(
      project,
      "Medina came in at 18,750.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
    if (resolution.outcome !== "CLARIFICATION") return;
    expect(resolution.message.toLowerCase()).toContain("estimate");
  });
});

describe("interpretFinancialTurn: RECORD_ACTUAL_COST_VS_ALLOWANCE (Pratt carpet example)", () => {
  function projectWithAllowance(): ProjectModelV094 {
    return model({
      financials: financials({
        budgetLines: {
          line1: budgetLine({
            id: "line1",
            description: "Carpet allowance",
            isAllowance: true,
          }),
        },
      }),
      scopeItems: {
        s1: scopeItem("s1", {
          description: "Mrs. Pratt's carpet",
          allowanceBudgetLineId: "line1",
        }),
      },
    });
  }

  it("resolves 'Mrs. Pratt's carpet is $175 over the $1,000 allowance.' without ever creating a Change Order", async () => {
    const resolution = await interpretFinancialTurn(
      projectWithAllowance(),
      "Mrs. Pratt's carpet is $175 over the $1,000 allowance.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("RESOLVED");
    if (resolution.outcome !== "RESOLVED") return;
    expect(resolution.module).toBe("BUDGET");
    expect(resolution.command.kind).toBe("ADD_ACTUAL_COST");
    const command = resolution.command as Extract<
      BudgetCommandV097,
      { kind: "ADD_ACTUAL_COST" }
    >;
    // 1000 + 175 = 1175, deterministically computed from two independently-parsed amounts.
    expect(command.amount).toEqual({ amountMinor: 117500, currency: "USD" });
    expect(command.budgetLineId).toBe("line1");
  });

  it("computes UNDER correctly as allowance minus variance", async () => {
    const resolution = await interpretFinancialTurn(
      projectWithAllowance(),
      "irrelevant utterance text",
      fixedModel({
        intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
        subjectText: "Mrs. Pratt's carpet",
        allowanceAmountText: "$1,000",
        varianceAmountText: "$175",
        varianceDirection: "UNDER",
      }),
      TODAY,
    );
    expect(resolution.outcome).toBe("RESOLVED");
    if (resolution.outcome !== "RESOLVED") return;
    const command = resolution.command as Extract<
      BudgetCommandV097,
      { kind: "ADD_ACTUAL_COST" }
    >;
    expect(command.amount).toEqual({ amountMinor: 82500, currency: "USD" });
  });

  it("asks for clarification when no scope item with a linked allowance matches the subject", async () => {
    const resolution = await interpretFinancialTurn(
      model({ financials: financials() }),
      "Mrs. Pratt's carpet is $175 over the $1,000 allowance.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });

  it("asks for clarification when more than one scope item matches the subject", async () => {
    const project = model({
      financials: financials({
        budgetLines: {
          line1: budgetLine({ id: "line1", isAllowance: true }),
          line2: budgetLine({ id: "line2", isAllowance: true }),
        },
      }),
      scopeItems: {
        s1: scopeItem("s1", {
          description: "carpet upstairs",
          allowanceBudgetLineId: "line1",
        }),
        s2: scopeItem("s2", {
          description: "carpet downstairs",
          allowanceBudgetLineId: "line2",
        }),
      },
    });
    const resolution = await interpretFinancialTurn(
      project,
      "irrelevant utterance text",
      fixedModel({
        intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
        subjectText: "carpet",
        allowanceAmountText: "$1,000",
        varianceAmountText: "$175",
        varianceDirection: "OVER",
      }),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });

  it("asks for clarification when the amounts are missing, never guessing an actual cost", async () => {
    const resolution = await interpretFinancialTurn(
      projectWithAllowance(),
      "irrelevant utterance text",
      fixedModel({
        intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
        subjectText: "Mrs. Pratt's carpet",
      }),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });
});

describe("interpretFinancialTurn: fail-closed behavior", () => {
  it("asks for clarification when project financials have no tracked currency yet", async () => {
    const resolution = await interpretFinancialTurn(
      model(),
      "Medina's approved plumbing proposal is $18,750.",
      buildFieldTestCallFinancialModel(),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
    if (resolution.outcome !== "CLARIFICATION") return;
    expect(resolution.message).toContain("set up yet");
  });

  it("asks for clarification instead of throwing when the provider itself fails", async () => {
    const failingProvider: CallFinancialModel = () =>
      Promise.reject(new Error("provider unavailable"));
    const resolution = await interpretFinancialTurn(
      model({ financials: financials() }),
      "Medina's approved plumbing proposal is $18,750.",
      failingProvider,
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
  });

  it("passes through an explicit CLARIFICATION_NEEDED reason from the provider verbatim", async () => {
    const resolution = await interpretFinancialTurn(
      model({ financials: financials() }),
      "irrelevant utterance text",
      fixedModel({
        intent: "CLARIFICATION_NEEDED",
        clarificationReason: "custom reason from provider",
      }),
      TODAY,
    );
    expect(resolution.outcome).toBe("CLARIFICATION");
    if (resolution.outcome !== "CLARIFICATION") return;
    expect(resolution.message).toBe("custom reason from provider");
  });
});
