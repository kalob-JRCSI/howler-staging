// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Task 10/11): the provider-agnostic
// contract for AI-assisted financial interpretation, plus the deterministic resolver every
// provider (the Task 10 test double, Task 11's real OpenAI adapter) sits behind.
//
// Mirrors the existing conversational claim pipeline's central safety boundary exactly
// (src/operator/interpreter.ts's `toClaim`, `assertNoForbiddenClaimFields`): a `CallFinancialModel`
// implementation NEVER supplies ids, opcodes, verification, or a pre-parsed money value. It only
// ever lifts free-text spans out of the utterance (a vendor name, a trade/category word, a dollar
// figure as written). Every one of those spans is independently re-resolved against REAL
// canonical entities and re-parsed via src/domain/money.ts's own deterministic parser by this
// file's own code -- never trusted from the model. The model's output is untrusted interpretation,
// never authorization (OpenAI request contract, "server validation remains mandatory").
//
// This intentionally does NOT touch src/operator/conversation.ts's existing activity/constraint
// claim pipeline at all -- that pipeline's ResolvedEntity is hard-typed to activity|constraint and
// has no path to a budget line/commitment/change order. Reusing it would mean widening a
// safety-critical, already-shipped file for an unrelated domain. Instead this produces a
// BudgetCommandV097 directly and hands it to the exact same buildBudgetEvent
// (src/operator/budget.ts) the manual UI already uses -- "without rewriting: Budget, Change
// Orders, Scope, Schedule, canonical events, confirmation, financial validation."

import type { BudgetCommandV097 } from "./budget";
import type { ChangeOrderCommandV097 } from "./change-orders";
import type {
  CommitmentAllocationV097,
  MoneyV097,
  ProjectModelV094,
} from "../domain/types";
import { MoneyError, parseMoneyInput } from "../domain/money";

export type FinancialIntentKind =
  | "RECORD_COMMITMENT"
  | "RECORD_ACTUAL_COST_VS_ALLOWANCE"
  | "CLARIFICATION_NEEDED";

/**
 * The one shape every CallFinancialModel implementation must return. Every field below is a raw
 * text span lifted from the utterance -- never a resolved id, never a parsed number. See this
 * file's header for why.
 */
export interface FinancialInterpretationResult {
  intent: FinancialIntentKind;
  /** e.g. "Medina" in "Medina's approved plumbing proposal is $18,750." */
  vendorText?: string;
  /** e.g. "plumbing" -- used only to help resolve which budget category/line, never stored verbatim. */
  tradeOrCategoryText?: string;
  /** e.g. "Mrs. Pratt's carpet" -- resolved against scope items with a linked allowance. */
  subjectText?: string;
  /** e.g. "$18,750" for RECORD_COMMITMENT. */
  amountText?: string;
  /** e.g. "$1,000" for RECORD_ACTUAL_COST_VS_ALLOWANCE. */
  allowanceAmountText?: string;
  /** e.g. "$175" for RECORD_ACTUAL_COST_VS_ALLOWANCE. */
  varianceAmountText?: string;
  varianceDirection?: "OVER" | "UNDER";
  /** Required when intent is CLARIFICATION_NEEDED -- never a generic "I don't understand". */
  clarificationReason?: string;
}

/** Small, resolvable financial context -- never the full event ledger (cost/latency control). */
export interface FinancialInterpretationRequest {
  utterance: string;
  projectId: string;
  currency: string | null;
  categories: { id: string; name: string }[];
  budgetLines: {
    id: string;
    description: string;
    categoryId: string;
    trade: string | null;
    costCode: string | null;
  }[];
  scopeItemsWithAllowance: {
    id: string;
    description: string;
    allowanceBudgetLineId: string;
  }[];
}

export type CallFinancialModel = (
  request: FinancialInterpretationRequest,
) => Promise<FinancialInterpretationResult>;

export type FinancialTurnResolution =
  | { outcome: "RESOLVED"; module: "BUDGET"; command: BudgetCommandV097 }
  | {
      outcome: "RESOLVED";
      module: "CHANGE_ORDER";
      command: ChangeOrderCommandV097;
    }
  | { outcome: "CLARIFICATION"; message: string };

function buildRequestContext(
  model: ProjectModelV094,
  utterance: string,
): FinancialInterpretationRequest {
  const fin = model.financials;
  return {
    utterance,
    projectId: model.projectId,
    currency: fin?.currency ?? null,
    categories: fin
      ? Object.values(fin.categories)
          .filter((c) => c.active)
          .map((c) => ({ id: c.id, name: c.name }))
      : [],
    budgetLines: fin
      ? Object.values(fin.budgetLines)
          .filter((l) => l.active)
          .map((l) => ({
            id: l.id,
            description: l.description,
            categoryId: l.categoryId,
            trade: l.trade ?? null,
            costCode: l.costCode ?? null,
          }))
      : [],
    scopeItemsWithAllowance: Object.values(model.scopeItems ?? {})
      .filter((item) => item.active && item.allowanceBudgetLineId)
      .map((item) => ({
        id: item.id,
        description: item.description,
        allowanceBudgetLineId: item.allowanceBudgetLineId as string,
      })),
  };
}

function parseMoneyText(text: string, currency: string): MoneyV097 | null {
  const cleaned = text.replace(/[$,]/g, "").trim();
  try {
    return parseMoneyInput(cleaned, currency);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

type MatchOutcome<T> =
  { kind: "NONE" } | { kind: "UNIQUE"; value: T } | { kind: "AMBIGUOUS" };

function findUniqueMatch<T>(
  candidates: T[],
  needle: string,
  searchableText: (item: T) => string[],
): MatchOutcome<T> {
  const lowerNeedle = needle.trim().toLowerCase();
  if (!lowerNeedle) return { kind: "NONE" };
  const matches = candidates.filter((candidate) =>
    searchableText(candidate).some(
      (field) =>
        field.toLowerCase().includes(lowerNeedle) ||
        lowerNeedle.includes(field.toLowerCase()),
    ),
  );
  if (matches.length === 0) return { kind: "NONE" };
  if (matches.length > 1) return { kind: "AMBIGUOUS" };
  return { kind: "UNIQUE", value: matches[0] as T };
}

function resolveCommitment(
  result: FinancialInterpretationResult,
  request: FinancialInterpretationRequest,
  currency: string,
): FinancialTurnResolution {
  if (!result.amountText) {
    return {
      outcome: "CLARIFICATION",
      message:
        "I heard a commitment, but no dollar amount -- what was the approved amount?",
    };
  }
  const amount = parseMoneyText(result.amountText, currency);
  if (!amount) {
    return {
      outcome: "CLARIFICATION",
      message: `I couldn't parse "${result.amountText}" as an amount in ${currency}.`,
    };
  }

  let allocations: CommitmentAllocationV097[] | undefined;
  if (result.tradeOrCategoryText) {
    const lineMatch = findUniqueMatch(
      request.budgetLines,
      result.tradeOrCategoryText,
      (l) => [l.description, l.trade ?? "", l.costCode ?? ""],
    );
    if (lineMatch.kind === "AMBIGUOUS") {
      return {
        outcome: "CLARIFICATION",
        message: `More than one budget line matches "${result.tradeOrCategoryText}" -- which one is this commitment against?`,
      };
    }
    if (lineMatch.kind === "UNIQUE") {
      allocations = [{ budgetLineId: lineMatch.value.id, amount }];
    }
    // NONE: proceed unallocated -- a real, visible fact for the PM to resolve later
    // (Correction 6), never a blocking failure just because no matching line exists yet.
  }

  const command: BudgetCommandV097 = {
    kind: "ADD_COMMITMENT",
    amount,
    ...(result.vendorText ? { vendorRef: result.vendorText } : {}),
    ...(allocations ? { allocations } : {}),
  };
  return { outcome: "RESOLVED", module: "BUDGET", command };
}

function resolveActualCostVsAllowance(
  result: FinancialInterpretationResult,
  request: FinancialInterpretationRequest,
  currency: string,
  today: string,
): FinancialTurnResolution {
  if (!result.subjectText) {
    return {
      outcome: "CLARIFICATION",
      message: "Which scope item or allowance is this actual cost against?",
    };
  }
  const subjectMatch = findUniqueMatch(
    request.scopeItemsWithAllowance,
    result.subjectText,
    (item) => [item.description],
  );
  if (subjectMatch.kind === "NONE") {
    return {
      outcome: "CLARIFICATION",
      message: `I couldn't find a scope item with a linked allowance matching "${result.subjectText}".`,
    };
  }
  if (subjectMatch.kind === "AMBIGUOUS") {
    return {
      outcome: "CLARIFICATION",
      message: `More than one scope item matches "${result.subjectText}" -- which one do you mean?`,
    };
  }

  if (
    !result.allowanceAmountText ||
    !result.varianceAmountText ||
    !result.varianceDirection
  ) {
    return {
      outcome: "CLARIFICATION",
      message:
        "I heard an allowance variance, but not both amounts clearly -- what was the allowance, and by how much did the actual cost differ?",
    };
  }
  const allowanceAmount = parseMoneyText(result.allowanceAmountText, currency);
  const varianceAmount = parseMoneyText(result.varianceAmountText, currency);
  if (!allowanceAmount || !varianceAmount) {
    return {
      outcome: "CLARIFICATION",
      message: `I couldn't parse the amounts in "${result.allowanceAmountText}" / "${result.varianceAmountText}".`,
    };
  }
  // Never trusts the model's arithmetic -- both amounts are independently, deterministically
  // parsed by this file's own code, then combined here. The allowance figure is used only to
  // compute the real actual-cost amount being recorded; the variance the PM ultimately sees is
  // always the canonical budget line's own baselineAmount vs. this actual cost
  // (src/operator/scope.ts's linkedBudgetLineFor), never this utterance's restated allowance.
  const actualAmountMinor =
    result.varianceDirection === "OVER"
      ? allowanceAmount.amountMinor + varianceAmount.amountMinor
      : allowanceAmount.amountMinor - varianceAmount.amountMinor;

  const command: BudgetCommandV097 = {
    kind: "ADD_ACTUAL_COST",
    amount: { amountMinor: actualAmountMinor, currency },
    date: today,
    description: result.subjectText,
    budgetLineId: subjectMatch.value.allowanceBudgetLineId,
  };
  return { outcome: "RESOLVED", module: "BUDGET", command };
}

/**
 * The one bounded, non-agentic interpretation call per turn (cost/latency control). Fails closed
 * to Clarification on any ambiguity, missing context, or provider error -- never guesses, never
 * silently defaults a currency, and never auto-generates a Change Order from an over-allowance
 * observation.
 */
export async function interpretFinancialTurn(
  model: ProjectModelV094,
  utterance: string,
  callFinancialModel: CallFinancialModel,
  today: string,
): Promise<FinancialTurnResolution> {
  const currency = model.financials?.currency;
  if (!currency) {
    return {
      outcome: "CLARIFICATION",
      message:
        "This project's financials have not been set up yet -- set a tracked currency in Budget first.",
    };
  }

  const request = buildRequestContext(model, utterance);
  let result: FinancialInterpretationResult;
  try {
    result = await callFinancialModel(request);
  } catch {
    return {
      outcome: "CLARIFICATION",
      message:
        "I couldn't interpret that -- please use the manual entry forms instead.",
    };
  }

  if (result.intent === "CLARIFICATION_NEEDED") {
    return {
      outcome: "CLARIFICATION",
      message:
        result.clarificationReason ??
        "I need more detail before I can record that.",
    };
  }
  if (result.intent === "RECORD_COMMITMENT") {
    return resolveCommitment(result, request, currency);
  }
  return resolveActualCostVsAllowance(result, request, currency, today);
}
