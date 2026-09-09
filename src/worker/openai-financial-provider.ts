// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Task 11): the real, staging-only
// OpenAI Responses API adapter for the CallFinancialModel abstraction
// (src/operator/financial-interpreter.ts). This is the ONLY file in the codebase allowed to know
// about OpenAI's request/response shapes -- operator/domain code imports nothing from here, and
// this file imports nothing from OpenAI's SDK (a plain `fetch` call to the documented REST
// endpoint is all this bounded, non-agentic request needs, so no new dependency is introduced
// either).
//
// Governing constraints (Stage C authorization, verbatim):
// - Bounded interpretation call via the Responses API -- explicitly NOT an agent loop: no web
//   search, no file search, no computer use, no autonomous tool execution, no model-side direct
//   mutations. This adapter sends no `tools` field at all and never follows a `previous_response_id`
//   chain -- exactly one request, one response, per call.
// - `store: false` on every call -- Howler owns its own project state/confirmation
//   state/event history/provenance, never depends on API-side conversation persistence.
// - Structured Outputs/JSON Schema (`text.format`, strict mode) constrains the shape, but the
//   parsed result is still treated as untrusted interpretation here (RESPONSE_SCHEMA_KEYS
//   validation below) -- interpretFinancialTurn's own deterministic resolution and
//   src/domain/validation.ts's canonical validation are what actually authorize anything, exactly
//   like every other CallFinancialModel implementation.
// - One model call per turn, no automatic retries, a hard timeout, fail-closed (any error --
//   config, network, timeout, malformed response -- is thrown, which interpretFinancialTurn's own
//   try/catch already converts into a safe CLARIFICATION outcome, never a crash and never a
//   silent guess).
// - No automatic escalation to a costlier model: the model name comes from HOWLER_AI_MODEL,
//   defaulting to the staging default (gpt-5.6-terra) only when that var is unset -- never
//   hardcoded to a "better" model on this file's own initiative.
// - The API key is read once from env, sent only in this request's own Authorization header, and
//   never appears in a thrown error message, a log line, or the parsed result.

import type {
  CallFinancialModel,
  FinancialInterpretationRequest,
  FinancialInterpretationResult,
} from "../operator/financial-interpreter";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";
// Exported so diagnostics (GET /health) can report the actual effective model without duplicating
// this default as a second, driftable hardcoded string.
export const DEFAULT_OPENAI_FINANCIAL_MODEL = "gpt-5.6-terra";
const REQUEST_TIMEOUT_MS = 15000;

const INTERPRETATION_INTENTS = [
  "RECORD_COMMITMENT",
  "RECORD_ACTUAL_COST_VS_ALLOWANCE",
  "CLARIFICATION_NEEDED",
] as const;

const NULLABLE_TEXT_FIELDS = [
  "vendorText",
  "tradeOrCategoryText",
  "subjectText",
  "amountText",
  "allowanceAmountText",
  "varianceAmountText",
  "clarificationReason",
] as const;

// OpenAI Structured Outputs (strict mode) requires every property to be listed in `required`,
// including "optional" ones -- expressed here as nullable types instead. This is what makes the
// raw text-span contract (never an id, never a parsed number -- see financial-interpreter.ts's
// own header) enforceable at the API boundary, not just by convention.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTERPRETATION_INTENTS] },
    vendorText: { type: ["string", "null"] },
    tradeOrCategoryText: { type: ["string", "null"] },
    subjectText: { type: ["string", "null"] },
    amountText: { type: ["string", "null"] },
    allowanceAmountText: { type: ["string", "null"] },
    varianceAmountText: { type: ["string", "null"] },
    varianceDirection: {
      type: ["string", "null"],
      enum: ["OVER", "UNDER", null],
    },
    clarificationReason: { type: ["string", "null"] },
  },
  required: [
    "intent",
    "vendorText",
    "tradeOrCategoryText",
    "subjectText",
    "amountText",
    "allowanceAmountText",
    "varianceAmountText",
    "varianceDirection",
    "clarificationReason",
  ],
  additionalProperties: false,
};

const SYSTEM_INSTRUCTIONS = `You interpret one homeowner/contractor financial statement for a
construction project-management tool. You do NOT have authority to change anything yourself --
you only extract raw text spans from the utterance for Howler's own deterministic code to resolve
and validate.

Rules:
- Never invent, guess, or normalize an id. Only lift the exact words the utterance uses for a
  vendor, trade/category, subject, or amount.
- Never do arithmetic yourself and never pre-parse a dollar figure into a number -- copy the
  amount text exactly as written (e.g. "$18,750" or "18,750").
- intent is exactly one of: RECORD_COMMITMENT (an approved/confirmed commitment amount is being
  recorded against a vendor/trade), RECORD_ACTUAL_COST_VS_ALLOWANCE (an actual cost is being
  described relative to an existing allowance, as an amount over or under it), or
  CLARIFICATION_NEEDED (anything else, including when the statement does not clearly establish
  whether a figure is a firm commitment versus an informal estimate or quote -- when in doubt,
  choose CLARIFICATION_NEEDED and explain why in clarificationReason).
- Every field you do not have a confident value for must be null, never a fabricated guess.
- Respond with only the structured fields -- no prose, no explanation outside clarificationReason.`;

function buildInput(request: FinancialInterpretationRequest): string {
  const context = {
    currency: request.currency,
    categories: request.categories,
    budgetLines: request.budgetLines,
    scopeItemsWithAllowance: request.scopeItemsWithAllowance,
  };
  return `${SYSTEM_INSTRUCTIONS}\n\nProject financial context (JSON):\n${JSON.stringify(context)}\n\nPM utterance:\n${request.utterance}`;
}

interface ResponsesApiOutputContent {
  type: string;
  text?: string;
}

interface ResponsesApiOutputItem {
  type: string;
  content?: ResponsesApiOutputContent[];
}

interface ResponsesApiBody {
  output?: ResponsesApiOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function extractOutputText(body: ResponsesApiBody): string {
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI Responses API returned no output_text message");
}

function isInterpretationIntent(
  value: unknown,
): value is FinancialInterpretationResult["intent"] {
  return (
    typeof value === "string" &&
    (INTERPRETATION_INTENTS as readonly string[]).includes(value)
  );
}

// Defense-in-depth (Stage C authorization: "server-side validation remains mandatory
// regardless"): re-validates the parsed JSON against the exact contract even though Structured
// Outputs' strict mode should already guarantee this shape -- an API-level guarantee is not a
// substitute for this codebase's own trust boundary.
function parseInterpretationJson(raw: string): FinancialInterpretationResult {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("OpenAI Responses API output was not a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (!isInterpretationIntent(record.intent)) {
    throw new Error("OpenAI Responses API output had an unrecognized intent");
  }
  const result: FinancialInterpretationResult = { intent: record.intent };
  for (const field of NULLABLE_TEXT_FIELDS) {
    const value = record[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") {
      throw new Error(
        `OpenAI Responses API output field "${field}" was not a string`,
      );
    }
    result[field] = value;
  }
  const direction = record.varianceDirection;
  if (direction === "OVER" || direction === "UNDER") {
    result.varianceDirection = direction;
  } else if (direction !== null && direction !== undefined) {
    throw new Error(
      'OpenAI Responses API output field "varianceDirection" was not OVER/UNDER/null',
    );
  }
  return result;
}

export interface OpenAIFinancialUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * Builds the real, staging-only CallFinancialModel. Throws immediately (before any network call
 * is ever attempted) if HOWLER_OPENAI_API_KEY is not configured -- this is a genuine server
 * misconfiguration, not an ambiguous PM utterance, and must never be papered over by silently
 * falling back to the deterministic double while claiming live AI is active.
 */
export function buildOpenAIStagingFinancialModel(
  env: { HOWLER_OPENAI_API_KEY?: string; HOWLER_AI_MODEL?: string },
  recordUsage?: (usage: OpenAIFinancialUsage) => void,
): CallFinancialModel {
  const apiKey = env.HOWLER_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("HOWLER_OPENAI_API_KEY is not configured");
  }
  const model = env.HOWLER_AI_MODEL ?? DEFAULT_OPENAI_FINANCIAL_MODEL;

  return async (request) => {
    const response = await fetch(RESPONSES_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: buildInput(request),
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "financial_interpretation",
            schema: RESPONSE_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `OpenAI Responses API returned HTTP ${String(response.status)}`,
      );
    }
    const body = await response.json<ResponsesApiBody>();
    const result = parseInterpretationJson(extractOutputText(body));
    if (recordUsage) {
      recordUsage({
        promptTokens: body.usage?.input_tokens ?? null,
        completionTokens: body.usage?.output_tokens ?? null,
      });
    }
    return result;
  };
}
