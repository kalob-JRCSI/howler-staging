import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenAIStagingFinancialModel,
  DEFAULT_OPENAI_FINANCIAL_MODEL,
} from "../../src/worker/openai-financial-provider";
import type { FinancialInterpretationRequest } from "../../src/operator/financial-interpreter";

function request(
  overrides: Partial<FinancialInterpretationRequest> = {},
): FinancialInterpretationRequest {
  return {
    utterance: "Medina's approved plumbing proposal is $18,750.",
    projectId: "p1",
    currency: "USD",
    categories: [],
    budgetLines: [],
    scopeItemsWithAllowance: [],
    ...overrides,
  };
}

function responsesApiBody(
  parsed: unknown,
  usage: { input_tokens?: number; output_tokens?: number } = {
    input_tokens: 120,
    output_tokens: 40,
  },
): unknown {
  return {
    output: [
      // A leading non-message item (e.g. a reasoning trace) must never be mistaken for the
      // actual structured output -- extractOutputText must skip past it.
      { type: "reasoning", content: [] },
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(parsed) }],
      },
    ],
    usage,
  };
}

function stubFetchOnce(
  status: number,
  body: unknown,
): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildOpenAIStagingFinancialModel: fail-closed on missing configuration", () => {
  it("throws immediately, before any network call, when HOWLER_OPENAI_API_KEY is not configured", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(() => buildOpenAIStagingFinancialModel({})).toThrow(
      "HOWLER_OPENAI_API_KEY is not configured",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("buildOpenAIStagingFinancialModel: request shape (Stage C authorization contract)", () => {
  it("sends a single, non-agentic, store:false, Structured Outputs request with the default staging model", async () => {
    const fetchSpy = stubFetchOnce(
      200,
      responsesApiBody({
        intent: "RECORD_COMMITMENT",
        vendorText: "Medina",
        tradeOrCategoryText: "plumbing",
        subjectText: null,
        amountText: "$18,750",
        allowanceAmountText: null,
        varianceAmountText: null,
        varianceDirection: null,
        clarificationReason: null,
      }),
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await callModel(request());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-test-not-a-real-key",
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const parsedBody = JSON.parse(init.body as string) as Record<
      string,
      unknown
    >;
    expect(parsedBody.model).toBe(DEFAULT_OPENAI_FINANCIAL_MODEL);
    expect(parsedBody.store).toBe(false);
    expect(parsedBody.tools).toBeUndefined();
    expect(parsedBody.previous_response_id).toBeUndefined();
    const format = (
      parsedBody.text as { format: { type: string; strict: boolean } }
    ).format;
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(String(parsedBody.input)).toContain(
      "Medina's approved plumbing proposal is $18,750.",
    );
  });

  it("uses HOWLER_AI_MODEL when configured, never a hardcoded escalation", async () => {
    const fetchSpy = stubFetchOnce(
      200,
      responsesApiBody({
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
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
      HOWLER_AI_MODEL: "gpt-5.6-sol",
    });
    await callModel(request());
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(init.body as string) as { model: string };
    expect(parsedBody.model).toBe("gpt-5.6-sol");
  });

  it("never includes the API key anywhere in the request body", async () => {
    const fetchSpy = stubFetchOnce(
      200,
      responsesApiBody({
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
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-super-secret-value",
    });
    await callModel(request());
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.body as string).not.toContain("sk-super-secret-value");
  });
});

describe("buildOpenAIStagingFinancialModel: parses a valid response, converting null to undefined", () => {
  it("parses RECORD_COMMITMENT and reports token usage via the optional callback", async () => {
    stubFetchOnce(
      200,
      responsesApiBody(
        {
          intent: "RECORD_COMMITMENT",
          vendorText: "Medina",
          tradeOrCategoryText: "plumbing",
          subjectText: null,
          amountText: "$18,750",
          allowanceAmountText: null,
          varianceAmountText: null,
          varianceDirection: null,
          clarificationReason: null,
        },
        { input_tokens: 200, output_tokens: 55 },
      ),
    );
    const recordUsage = vi.fn();
    const callModel = buildOpenAIStagingFinancialModel(
      { HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key" },
      recordUsage,
    );
    const result = await callModel(request());
    expect(result).toEqual({
      intent: "RECORD_COMMITMENT",
      vendorText: "Medina",
      tradeOrCategoryText: "plumbing",
      amountText: "$18,750",
    });
    expect(recordUsage).toHaveBeenCalledWith({
      promptTokens: 200,
      completionTokens: 55,
    });
  });

  it("parses RECORD_ACTUAL_COST_VS_ALLOWANCE with a real varianceDirection", async () => {
    stubFetchOnce(
      200,
      responsesApiBody({
        intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
        vendorText: null,
        tradeOrCategoryText: null,
        subjectText: "Mrs. Pratt's carpet",
        amountText: null,
        allowanceAmountText: "$1,000",
        varianceAmountText: "$175",
        varianceDirection: "OVER",
        clarificationReason: null,
      }),
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    const result = await callModel(request());
    expect(result).toEqual({
      intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
      subjectText: "Mrs. Pratt's carpet",
      allowanceAmountText: "$1,000",
      varianceAmountText: "$175",
      varianceDirection: "OVER",
    });
  });
});

describe("buildOpenAIStagingFinancialModel: fails closed on any malformed or errored response", () => {
  it("throws on a non-2xx HTTP response", async () => {
    stubFetchOnce(500, { error: "server error" });
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await expect(callModel(request())).rejects.toThrow(/HTTP 500/);
  });

  it("throws when no message/output_text item is present", async () => {
    stubFetchOnce(200, { output: [{ type: "reasoning", content: [] }] });
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await expect(callModel(request())).rejects.toThrow(/no output_text/);
  });

  it("throws when the output_text is not valid JSON", async () => {
    stubFetchOnce(200, {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "not json" }],
        },
      ],
    });
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await expect(callModel(request())).rejects.toThrow();
  });

  it("throws on an unrecognized intent value -- Structured Outputs is not trusted blindly", async () => {
    stubFetchOnce(
      200,
      responsesApiBody({
        intent: "DO_SOMETHING_ELSE",
        vendorText: null,
        tradeOrCategoryText: null,
        subjectText: null,
        amountText: null,
        allowanceAmountText: null,
        varianceAmountText: null,
        varianceDirection: null,
        clarificationReason: null,
      }),
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await expect(callModel(request())).rejects.toThrow(/unrecognized intent/);
  });

  it("throws on an invalid varianceDirection value", async () => {
    stubFetchOnce(
      200,
      responsesApiBody({
        intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
        vendorText: null,
        tradeOrCategoryText: null,
        subjectText: "carpet",
        amountText: null,
        allowanceAmountText: "$1,000",
        varianceAmountText: "$175",
        varianceDirection: "SIDEWAYS",
        clarificationReason: null,
      }),
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await expect(callModel(request())).rejects.toThrow(/varianceDirection/);
  });

  it("throws when a text field is a non-string type, never silently coercing it", async () => {
    stubFetchOnce(
      200,
      responsesApiBody({
        intent: "RECORD_COMMITMENT",
        vendorText: 12345,
        tradeOrCategoryText: null,
        subjectText: null,
        amountText: "$18,750",
        allowanceAmountText: null,
        varianceAmountText: null,
        varianceDirection: null,
        clarificationReason: null,
      }),
    );
    const callModel = buildOpenAIStagingFinancialModel({
      HOWLER_OPENAI_API_KEY: "sk-test-not-a-real-key",
    });
    await expect(callModel(request())).rejects.toThrow(/vendorText/);
  });
});
