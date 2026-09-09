import { afterEach, describe, expect, it, vi } from "vitest";
import { selectCallFinancialModel } from "../../src/worker/financial-model-provider";
import type { FinancialInterpretationRequest } from "../../src/operator/financial-interpreter";

function request(): FinancialInterpretationRequest {
  return {
    utterance: "Medina's approved plumbing proposal is $18,750.",
    projectId: "p1",
    currency: "USD",
    categories: [],
    budgetLines: [],
    scopeItemsWithAllowance: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectCallFinancialModel", () => {
  it("defaults to the deterministic double when HOWLER_AI_PROVIDER is unset -- never an accidental live call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const callModel = selectCallFinancialModel({});
    const result = await callModel(request());
    expect(result.intent).toBe("RECORD_COMMITMENT");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the deterministic double for any provider value other than exactly 'openai'", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const callModel = selectCallFinancialModel({
      HOWLER_AI_PROVIDER: "anthropic",
    });
    await callModel(request());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selects the real OpenAI-backed provider when HOWLER_AI_PROVIDER is 'openai' and the key is configured", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      intent: "CLARIFICATION_NEEDED",
                      vendorText: null,
                      tradeOrCategoryText: null,
                      subjectText: null,
                      amountText: null,
                      allowanceAmountText: null,
                      varianceAmountText: null,
                      varianceDirection: null,
                      clarificationReason: "test",
                    }),
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const callModel = selectCallFinancialModel({
      HOWLER_AI_PROVIDER: "openai",
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await callModel(request());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.openai.com/v1/responses");
  });

  it("propagates a clear configuration error when 'openai' is selected without a configured key, never silently downgrading to the deterministic double", () => {
    expect(() =>
      selectCallFinancialModel({ HOWLER_AI_PROVIDER: "openai" }),
    ).toThrow("HOWLER_OPENAI_API_KEY is not configured");
  });
});
