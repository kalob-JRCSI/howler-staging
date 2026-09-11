// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Task 9): Howler Intelligence for
// the financial domain -- "factual traceable derived findings, not direct edits or generic
// filler" (universal data interaction contract). Every finding here links to real, structured
// facts already on canonical state (a budget line id, an actual cost id, a change order id, a
// scope item id) -- never a generated narrative and never a fabricated risk score. Pure, cheap,
// deterministic: no D1 access, no mutation, recomputed on every read exactly like
// src/operator/scope.ts's own ScopeInsightV096 list.

import type { ProjectModelV094 } from "../domain/types";
import { formatMoneyMinor } from "../domain/money";
import {
  computeBudgetLineActualTotal,
  computeBudgetLineCommittedTotal,
} from "./budget";

// Keep in lockstep with src/app/types.ts FinancialFindingKindLike -- the browser workspace
// names these findings from the GET /budget payload and cannot invent kinds of its own.
export type FinancialFindingKindV097 =
  | "LINE_HAS_NO_BASELINE"
  | "ACTUAL_COST_UNALLOCATED"
  | "COMMITMENT_HAS_UNALLOCATED_AMOUNT"
  | "APPROVED_CO_HAS_UNALLOCATED_AMOUNT"
  | "ALLOWANCE_OVERRUN"
  | "SCOPE_ALLOWANCE_NOT_LINKED"
  | "LINE_COMMITMENT_OVER_REVISED"
  | "LINE_ACTUAL_OVER_REVISED"
  | "SCOPE_HAS_NO_BUDGET_ASSOCIATION"
  | "LINE_HAS_NO_SCOPE"
  | "PENDING_CO_UNPRICED";

export interface FinancialFindingV097 {
  kind: FinancialFindingKindV097;
  budgetLineId: string | null;
  commitmentId: string | null;
  actualCostId: string | null;
  changeOrderId: string | null;
  scopeItemId: string | null;
  message: string;
}

// A legacy allowance can exist on a scope item long before Budget is ever set up (Phase 3
// predates Phase 4), so this check runs independently of `model.financials` -- unlike every
// other finding below, which needs real Budget data to observe anything at all.
function scopeAllowanceFindings(
  model: ProjectModelV094,
): FinancialFindingV097[] {
  const findings: FinancialFindingV097[] = [];
  for (const item of Object.values(model.scopeItems ?? {})) {
    if (!item.active) continue;
    if (item.allowance && !item.allowanceBudgetLineId) {
      findings.push({
        kind: "SCOPE_ALLOWANCE_NOT_LINKED",
        budgetLineId: null,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: item.id,
        message: `"${item.description}" has a legacy allowance figure that has not been linked to a real budget line.`,
      });
    }
  }
  return findings;
}

/**
 * Pure, cheap, deterministic derivation of every factual financial observation Howler can
 * currently support. Returns an empty list (never a fabricated "all clear") when `model.financials`
 * has not been initialized -- there is nothing yet to observe.
 */
export function computeFinancialFindings(
  model: ProjectModelV094,
): FinancialFindingV097[] {
  const findings: FinancialFindingV097[] = [];
  findings.push(...scopeAllowanceFindings(model));

  const fin = model.financials;
  if (!fin) return findings;

  for (const line of Object.values(fin.budgetLines)) {
    if (!line.active) continue;
    if (!line.baselineAmount) {
      findings.push({
        kind: "LINE_HAS_NO_BASELINE",
        budgetLineId: line.id,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: null,
        message: `Budget line "${line.description}" has no baseline amount recorded.`,
      });
    }
    if (line.scopeItemIds.length === 0) {
      findings.push({
        kind: "LINE_HAS_NO_SCOPE",
        budgetLineId: line.id,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: null,
        message: `Budget line "${line.description}" is not associated with any Scope item.`,
      });
    }
    const approvedCO = Object.values(fin.changeOrders)
      .filter((co) => co.status === "APPROVED")
      .flatMap((co) =>
        co.costAllocations.filter((a) => a.budgetLineId === line.id),
      )
      .reduce((total, a) => total + a.amount.amountMinor, 0);
    const revisedMinor = line.baselineAmount
      ? line.baselineAmount.amountMinor + approvedCO
      : null;
    if (revisedMinor !== null) {
      const committed = computeBudgetLineCommittedTotal(fin, line.id);
      if (committed.amountMinor > revisedMinor) {
        findings.push({
          kind: "LINE_COMMITMENT_OVER_REVISED",
          budgetLineId: line.id,
          commitmentId: null,
          actualCostId: null,
          changeOrderId: null,
          scopeItemId: null,
          message: `Budget line "${line.description}" has ${formatMoneyMinor(committed)} committed against a revised budget of ${formatMoneyMinor({ amountMinor: revisedMinor, currency: fin.currency })}.`,
        });
      }
      const actual = computeBudgetLineActualTotal(fin, line.id);
      if (actual.amountMinor > revisedMinor) {
        findings.push({
          kind: "LINE_ACTUAL_OVER_REVISED",
          budgetLineId: line.id,
          commitmentId: null,
          actualCostId: null,
          changeOrderId: null,
          scopeItemId: null,
          message: `Budget line "${line.description}" has ${formatMoneyMinor(actual)} actual recorded against a revised budget of ${formatMoneyMinor({ amountMinor: revisedMinor, currency: fin.currency })}.`,
        });
      }
    }
  }

  for (const actualCost of Object.values(fin.actualCosts)) {
    if (actualCost.status !== "RECORDED") continue;
    if (!actualCost.budgetLineId) {
      findings.push({
        kind: "ACTUAL_COST_UNALLOCATED",
        budgetLineId: null,
        commitmentId: null,
        actualCostId: actualCost.id,
        changeOrderId: null,
        scopeItemId: null,
        message: `Actual cost "${actualCost.description}" (${formatMoneyMinor(actualCost.amount)}) is not allocated to a budget line.`,
      });
    }
  }

  for (const commitment of Object.values(fin.commitments)) {
    if (commitment.status !== "ACTIVE") continue;
    const allocated = commitment.allocations.reduce(
      (total, a) => total + a.amount.amountMinor,
      0,
    );
    const unallocated = commitment.amount.amountMinor - allocated;
    if (unallocated !== 0) {
      findings.push({
        kind: "COMMITMENT_HAS_UNALLOCATED_AMOUNT",
        budgetLineId: null,
        commitmentId: commitment.id,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: null,
        message: `Commitment ${commitment.id} has ${formatMoneyMinor({ amountMinor: unallocated, currency: commitment.amount.currency })} not yet allocated to a budget line.`,
      });
    }
  }

  for (const co of Object.values(fin.changeOrders)) {
    if (co.status === "PROPOSED" || co.status === "PENDING_APPROVAL") {
      if (co.cost.amountMinor === 0) {
        findings.push({
          kind: "PENDING_CO_UNPRICED",
          budgetLineId: null,
          commitmentId: null,
          actualCostId: null,
          changeOrderId: co.id,
          scopeItemId: null,
          message: `Pending change order "${co.title}" has no priced cost yet. Approved budget is unchanged.`,
        });
      }
    }
    if (co.status !== "APPROVED") continue;
    const allocated = co.costAllocations.reduce(
      (total, a) => total + a.amount.amountMinor,
      0,
    );
    const unallocated = co.cost.amountMinor - allocated;
    if (unallocated !== 0) {
      findings.push({
        kind: "APPROVED_CO_HAS_UNALLOCATED_AMOUNT",
        budgetLineId: null,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: co.id,
        scopeItemId: null,
        message: `Approved change order "${co.title}" has ${formatMoneyMinor({ amountMinor: unallocated, currency: co.cost.currency })} not yet allocated to a budget line.`,
      });
    }
  }

  const associatedScopeIds = new Set<string>();
  for (const line of Object.values(fin.budgetLines)) {
    if (!line.active) continue;
    for (const scopeItemId of line.scopeItemIds) {
      associatedScopeIds.add(scopeItemId);
    }
  }

  for (const item of Object.values(model.scopeItems ?? {})) {
    if (!item.active) continue;
    if (
      item.included &&
      !item.allowanceBudgetLineId &&
      !associatedScopeIds.has(item.id)
    ) {
      findings.push({
        kind: "SCOPE_HAS_NO_BUDGET_ASSOCIATION",
        budgetLineId: null,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: item.id,
        message: `"${item.description}" has no Budget line association, so its financial coverage is unknown.`,
      });
    }
    if (item.allowanceBudgetLineId) {
      const line = fin.budgetLines[item.allowanceBudgetLineId];
      if (line?.baselineAmount) {
        const actualTotal = computeBudgetLineActualTotal(fin, line.id);
        if (actualTotal.amountMinor > line.baselineAmount.amountMinor) {
          findings.push({
            kind: "ALLOWANCE_OVERRUN",
            budgetLineId: line.id,
            commitmentId: null,
            actualCostId: null,
            changeOrderId: null,
            scopeItemId: item.id,
            message: `"${item.description}" allowance of ${formatMoneyMinor(line.baselineAmount)} is exceeded by ${formatMoneyMinor({ amountMinor: actualTotal.amountMinor - line.baselineAmount.amountMinor, currency: line.baselineAmount.currency })} in actual cost.`,
          });
        }
      }
    }
  }

  return findings;
}
