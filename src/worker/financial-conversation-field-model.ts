// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Task 10): a minimal, deterministic,
// clearly-scoped `CallFinancialModel` implementation (src/operator/financial-interpreter.ts) for
// CI, unit tests, integration fixtures, and the field-test HTTP path -- the same role
// src/worker/conversation-field-model.ts already plays for the existing activity/constraint
// conversational pipeline (see that file's own header comment).
//
// This is NOT a reasoning engine and it never masquerades as the real runtime AI: it recognizes a
// small, explicit set of financial statement shapes via ordered regex matching, and produces ONLY
// free-text spans -- never a resolved id, never a parsed number (src/operator/
// financial-interpreter.ts's own header explains why that boundary matters). Anything it cannot
// confidently match becomes CLARIFICATION_NEEDED, never a guessed intent -- this codebase's
// "never guess, fail closed" policy, matching the deterministic-parser-role requirement: if the
// real model provider is unavailable, only explicitly supported deterministic commands may be
// handled and everything else must fall back to clarification, never a silent downgrade
// masquerading as full natural-language understanding.
//
// Deliberately ordered most-specific-first, mirroring conversation-field-model.ts's own
// discipline: an explicit "approved ... proposal" commitment statement is checked before the
// looser, deliberately ambiguous "came in at" phrasing, so a genuinely approved commitment is
// never demoted to a clarification merely because it also happens to contain an amount phrase.

import type {
  CallFinancialModel,
  FinancialInterpretationResult,
} from "../operator/financial-interpreter";

const MONEY_SPAN = String.raw`\$[\d,]+(?:\.\d{1,2})?`;

// "Medina's approved plumbing proposal is $18,750." -- an explicit approval word ("approved") is
// load-bearing here: it is what distinguishes a real commitment from a bare informal figure.
const APPROVED_COMMITMENT = new RegExp(
  String.raw`^(.+?)'s\s+approved\s+(.+?)\s+(?:proposal|bid|quote|estimate)\s+is\s+(${MONEY_SPAN})`,
  "i",
);

// "Mrs. Pratt's carpet is $175 over the $1,000 allowance." -- variance direction and both amounts
// are lifted as raw spans; the actual arithmetic is done by financial-interpreter.ts's own code
// from two independently re-parsed numbers, never trusted from this match.
const ALLOWANCE_VARIANCE = new RegExp(
  String.raw`^(.+?)\s+is\s+(${MONEY_SPAN})\s+(over|under)\s+the\s+(${MONEY_SPAN})\s+allowance`,
  "i",
);

// "Medina came in at $18,750." / "Medina came in at 18,750." -- deliberately ambiguous: this
// phrasing alone never establishes estimate vs. approved commitment (Task 13's required
// acceptance test), so it must always resolve to CLARIFICATION_NEEDED, never a guessed
// RECORD_COMMITMENT, even though it names a vendor and an amount just like the approved case does.
const AMBIGUOUS_VENDOR_FIGURE = new RegExp(
  String.raw`^(.+?)\s+came\s+in\s+at\s+(?:${MONEY_SPAN}|[\d,]+(?:\.\d{1,2})?)`,
  "i",
);

// Every call site here passes a group index that the corresponding regex's own fixed pattern
// shape guarantees is captured whenever `exec` matched at all -- unreachable in practice, but the
// compiler cannot see that guarantee through RegExpExecArray's indexed-element typing (same
// precedent as src/domain/money.ts's own DECIMAL_INPUT_PATTERN guard).
function requireGroup(match: RegExpExecArray, index: number): string {
  const value = match[index];
  if (value === undefined) {
    throw new Error(`Expected capture group ${String(index)} to be present`);
  }
  return value;
}

export function buildFieldTestCallFinancialModel(): CallFinancialModel {
  return (request) => {
    const utterance = request.utterance.trim();

    const approved = APPROVED_COMMITMENT.exec(utterance);
    if (approved) {
      const result: FinancialInterpretationResult = {
        intent: "RECORD_COMMITMENT",
        vendorText: requireGroup(approved, 1),
        tradeOrCategoryText: requireGroup(approved, 2),
        amountText: requireGroup(approved, 3),
      };
      return Promise.resolve(result);
    }

    const variance = ALLOWANCE_VARIANCE.exec(utterance);
    if (variance) {
      const direction =
        requireGroup(variance, 3).toLowerCase() === "over" ? "OVER" : "UNDER";
      const result: FinancialInterpretationResult = {
        intent: "RECORD_ACTUAL_COST_VS_ALLOWANCE",
        subjectText: requireGroup(variance, 1),
        varianceAmountText: requireGroup(variance, 2),
        varianceDirection: direction,
        allowanceAmountText: requireGroup(variance, 4),
      };
      return Promise.resolve(result);
    }

    const ambiguous = AMBIGUOUS_VENDOR_FIGURE.exec(utterance);
    if (ambiguous) {
      const result: FinancialInterpretationResult = {
        intent: "CLARIFICATION_NEEDED",
        clarificationReason: `"${utterance}" names an amount for ${requireGroup(ambiguous, 1)} but doesn't say whether it's an estimate or an approved commitment -- which is it?`,
      };
      return Promise.resolve(result);
    }

    const result: FinancialInterpretationResult = {
      intent: "CLARIFICATION_NEEDED",
      clarificationReason: `I couldn't understand "${utterance}" as a financial statement -- please use the manual entry forms instead.`,
    };
    return Promise.resolve(result);
  };
}
