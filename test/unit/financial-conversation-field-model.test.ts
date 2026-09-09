import { describe, expect, it } from "vitest";
import { buildFieldTestCallFinancialModel } from "../../src/worker/financial-conversation-field-model";
import type { FinancialInterpretationRequest } from "../../src/operator/financial-interpreter";

function request(utterance: string): FinancialInterpretationRequest {
  return {
    utterance,
    projectId: "p1",
    currency: "USD",
    categories: [],
    budgetLines: [],
    scopeItemsWithAllowance: [],
  };
}

describe("buildFieldTestCallFinancialModel", () => {
  const callModel = buildFieldTestCallFinancialModel();

  it("matches an explicit approved commitment as RECORD_COMMITMENT with raw text spans, never a parsed amount", async () => {
    const result = await callModel(
      request("Medina's approved plumbing proposal is $18,750."),
    );
    expect(result).toEqual({
      intent: "RECORD_COMMITMENT",
      vendorText: "Medina",
      tradeOrCategoryText: "plumbing",
      amountText: "$18,750",
    });
  });

  it("never treats a bare 'came in at' figure as a confirmed commitment -- always CLARIFICATION_NEEDED", async () => {
    const result = await callModel(request("Medina came in at 18,750."));
    expect(result.intent).toBe("CLARIFICATION_NEEDED");
    expect(result.clarificationReason).toBeTruthy();
  });

  it("matches an allowance-variance statement as RECORD_ACTUAL_COST_VS_ALLOWANCE", async () => {
    const result = await callModel(
      request("Mrs. Pratt's carpet is $175 over the $1,000 allowance."),
    );
    expect(result).toEqual({
      intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
      subjectText: "Mrs. Pratt's carpet",
      varianceAmountText: "$175",
      varianceDirection: "OVER",
      allowanceAmountText: "$1,000",
    });
  });

  it("recognizes 'under' as well as 'over'", async () => {
    const result = await callModel(
      request("The tile work is $50 under the $800 allowance."),
    );
    expect(result.intent).toBe("RECORD_ACTUAL_COST_VS_ALLOWANCE");
    expect(result.varianceDirection).toBe("UNDER");
  });

  it("falls back to a generic CLARIFICATION_NEEDED for anything it cannot recognize", async () => {
    const result = await callModel(
      request("The weather has been nice this week."),
    );
    expect(result.intent).toBe("CLARIFICATION_NEEDED");
    expect(result.clarificationReason).toContain("manual entry");
  });

  it("never fabricates a vendor/trade/amount field for an unmatched utterance", async () => {
    const result = await callModel(request("something ambiguous"));
    expect(result.vendorText).toBeUndefined();
    expect(result.amountText).toBeUndefined();
  });
});
