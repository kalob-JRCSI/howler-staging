// Phase 4 (Howler Recovery Directive, Budget + Change Orders, corrected plan): Budget answers
// "what did we plan to spend, what have we committed, what have we actually spent" -- Change
// Orders (src/operator/change-orders.ts) answers "what changed since baseline." Same pattern as
// Schedule/Scope: a pure translation layer over the canonical event-sourced kernel.
//
//   buildBudgetView:  ProjectModelV094 -> the full Budget workspace read model, including every
//                      total a PM or Howler Intelligence would call "revised," "committed,"
//                      "actual," or "remaining" -- always DERIVED here, never stored on any
//                      entity, so a retried or duplicate-confirmed event can never double-count.
//   buildBudgetEvent:  a typed BudgetCommandV097 -> a well-formed ProjectEventV094, reusing the
//                      9 UPSERT_X/DEACTIVATE_X/INITIALIZE/SET_BASELINE mutations from
//                      src/engine/reducer.ts exactly as Scope/Schedule reuse their own.
//
// Missing vs. zero: `baseline` and anything derived FROM it (revisedBudget, remaining) are
// nullable -- null means "Unknown," never a fabricated $0. Aggregates over a real, always-defined
// collection (committedTotal, actualTotal, approvedChangeOrderTotal, pendingChangeOrderTotal) are
// never null: a project with zero commitments really has committed $0, that is not "Unknown."

import type {
  ActualCostStatusV097,
  ActualCostV097,
  BudgetCategoryV097,
  BudgetLineV097,
  CommitmentAllocationV097,
  CommitmentStatusV097,
  CommitmentV097,
  ISODate,
  ISODateTime,
  MoneyV097,
  ProjectEventV094,
  ProjectFinancialsV097,
  ProjectModelV094,
  SourceV094,
} from "../domain/types";
import { isSupportedCurrency, isValidMoney } from "../domain/money";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

function sumMinor(amounts: MoneyV097[]): number {
  return amounts.reduce((total, m) => total + m.amountMinor, 0);
}

function zeroOrSum(currency: string, amounts: MoneyV097[]): MoneyV097 {
  return { amountMinor: sumMinor(amounts), currency };
}

function subtractOrNull(a: MoneyV097 | null, b: MoneyV097): MoneyV097 | null {
  return a === null
    ? null
    : { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

function addToNullable(a: MoneyV097 | null, b: MoneyV097): MoneyV097 | null {
  return a === null
    ? null
    : { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export interface ProjectFinancialSummaryV097 {
  currency: string;
  baseline: MoneyV097 | null;
  approvedChangeOrderTotal: MoneyV097;
  pendingChangeOrderTotal: MoneyV097;
  revisedBudget: MoneyV097 | null;
  committedTotal: MoneyV097;
  actualTotal: MoneyV097;
  remaining: MoneyV097 | null;
}

function approvedChangeOrderAmounts(fin: ProjectFinancialsV097): MoneyV097[] {
  return Object.values(fin.changeOrders)
    .filter((co) => co.status === "APPROVED")
    .map((co) => co.cost);
}

function pendingChangeOrderAmounts(fin: ProjectFinancialsV097): MoneyV097[] {
  return Object.values(fin.changeOrders)
    .filter(
      (co) => co.status === "PROPOSED" || co.status === "PENDING_APPROVAL",
    )
    .map((co) => co.cost);
}

export function buildProjectFinancialSummary(
  fin: ProjectFinancialsV097,
): ProjectFinancialSummaryV097 {
  const approvedChangeOrderTotal = zeroOrSum(
    fin.currency,
    approvedChangeOrderAmounts(fin),
  );
  const pendingChangeOrderTotal = zeroOrSum(
    fin.currency,
    pendingChangeOrderAmounts(fin),
  );
  const committedTotal = zeroOrSum(
    fin.currency,
    Object.values(fin.commitments)
      .filter((c) => c.status === "ACTIVE")
      .map((c) => c.amount),
  );
  const actualTotal = zeroOrSum(
    fin.currency,
    Object.values(fin.actualCosts)
      .filter((a) => a.status === "RECORDED")
      .map((a) => a.amount),
  );
  const revisedBudget = addToNullable(
    fin.baseline ?? null,
    approvedChangeOrderTotal,
  );
  const remaining = subtractOrNull(revisedBudget, committedTotal);
  return {
    currency: fin.currency,
    baseline: fin.baseline ?? null,
    approvedChangeOrderTotal,
    pendingChangeOrderTotal,
    revisedBudget,
    committedTotal,
    actualTotal,
    remaining,
  };
}

export interface BudgetCategoryViewV097 {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  sortOrder: number | null;
  notes: string | null;
}

export interface BudgetLineViewV097 {
  id: string;
  categoryId: string;
  categoryName: string;
  description: string;
  costCode: string | null;
  trade: string | null;
  baselineAmount: MoneyV097 | null;
  isAllowance: boolean;
  vendorRef: string | null;
  scopeItemIds: string[];
  notes: string | null;
  active: boolean;
  committedTotal: MoneyV097;
  actualTotal: MoneyV097;
  approvedChangeOrderTotal: MoneyV097;
  revisedAmount: MoneyV097 | null;
  remaining: MoneyV097 | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

function lineAllocations(
  fin: ProjectFinancialsV097,
  lineId: string,
): { committed: MoneyV097[]; approvedCO: MoneyV097[] } {
  const committed: MoneyV097[] = [];
  for (const c of Object.values(fin.commitments)) {
    if (c.status !== "ACTIVE") continue;
    for (const allocation of c.allocations) {
      if (allocation.budgetLineId === lineId) committed.push(allocation.amount);
    }
  }
  const approvedCO: MoneyV097[] = [];
  for (const co of Object.values(fin.changeOrders)) {
    if (co.status !== "APPROVED") continue;
    for (const allocation of co.costAllocations) {
      if (allocation.budgetLineId === lineId)
        approvedCO.push(allocation.amount);
    }
  }
  return { committed, approvedCO };
}

function viewRowFromBudgetLine(
  fin: ProjectFinancialsV097,
  line: BudgetLineV097,
): BudgetLineViewV097 {
  const { committed, approvedCO } = lineAllocations(fin, line.id);
  const committedTotal = zeroOrSum(fin.currency, committed);
  const approvedChangeOrderTotal = zeroOrSum(fin.currency, approvedCO);
  const actualTotal = zeroOrSum(
    fin.currency,
    Object.values(fin.actualCosts)
      .filter((a) => a.status === "RECORDED" && a.budgetLineId === line.id)
      .map((a) => a.amount),
  );
  const revisedAmount = addToNullable(
    line.baselineAmount ?? null,
    approvedChangeOrderTotal,
  );
  return {
    id: line.id,
    categoryId: line.categoryId,
    categoryName: fin.categories[line.categoryId]?.name ?? line.categoryId,
    description: line.description,
    costCode: line.costCode ?? null,
    trade: line.trade ?? null,
    baselineAmount: line.baselineAmount ?? null,
    isAllowance: line.isAllowance,
    vendorRef: line.vendorRef ?? null,
    scopeItemIds: [...line.scopeItemIds],
    notes: line.notes ?? null,
    active: line.active,
    committedTotal,
    actualTotal,
    approvedChangeOrderTotal,
    revisedAmount,
    remaining: subtractOrNull(revisedAmount, committedTotal),
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

export interface CommitmentViewV097 {
  id: string;
  amount: MoneyV097;
  allocatedTotal: MoneyV097;
  unallocatedAmount: MoneyV097;
  allocations: CommitmentAllocationV097[];
  vendorRef: string | null;
  activityId: string | null;
  scopeItemIds: string[];
  reference: string | null;
  status: CommitmentStatusV097;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

function viewRowFromCommitment(commitment: CommitmentV097): CommitmentViewV097 {
  const allocatedTotal = zeroOrSum(
    commitment.amount.currency,
    commitment.allocations.map((a) => a.amount),
  );
  return {
    id: commitment.id,
    amount: commitment.amount,
    allocatedTotal,
    unallocatedAmount: {
      amountMinor: commitment.amount.amountMinor - allocatedTotal.amountMinor,
      currency: commitment.amount.currency,
    },
    allocations: commitment.allocations.map((a) => ({ ...a })),
    vendorRef: commitment.vendorRef ?? null,
    activityId: commitment.activityId ?? null,
    scopeItemIds: [...commitment.scopeItemIds],
    reference: commitment.reference ?? null,
    status: commitment.status,
    notes: commitment.notes ?? null,
    createdAt: commitment.createdAt,
    updatedAt: commitment.updatedAt,
  };
}

export interface ActualCostViewV097 {
  id: string;
  amount: MoneyV097;
  date: ISODate;
  description: string;
  budgetLineId: string | null;
  commitmentId: string | null;
  reference: string | null;
  status: ActualCostStatusV097;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

function viewRowFromActualCost(actualCost: ActualCostV097): ActualCostViewV097 {
  return {
    id: actualCost.id,
    amount: actualCost.amount,
    date: actualCost.date,
    description: actualCost.description,
    budgetLineId: actualCost.budgetLineId ?? null,
    commitmentId: actualCost.commitmentId ?? null,
    reference: actualCost.reference ?? null,
    status: actualCost.status,
    notes: actualCost.notes ?? null,
    createdAt: actualCost.createdAt,
    updatedAt: actualCost.updatedAt,
  };
}

export interface ProjectBudgetWorkspaceV097 {
  projectId: string;
  projectRevision: number;
  initialized: boolean;
  currency: string | null;
  summary: ProjectFinancialSummaryV097 | null;
  categories: BudgetCategoryViewV097[];
  lines: BudgetLineViewV097[];
  commitments: CommitmentViewV097[];
  actualCosts: ActualCostViewV097[];
}

/**
 * Pure, cheap, deterministic derivation of the full Budget workspace. Performs no D1 access and
 * mutates nothing. A project with no `financials` at all (never initialized) is honestly
 * represented as `initialized: false` with every collection empty -- never a fabricated $0
 * workspace.
 */
export function buildBudgetView(
  model: ProjectModelV094,
): ProjectBudgetWorkspaceV097 {
  const fin = model.financials;
  if (!fin) {
    return {
      projectId: model.projectId,
      projectRevision: model.revision,
      initialized: false,
      currency: null,
      summary: null,
      categories: [],
      lines: [],
      commitments: [],
      actualCosts: [],
    };
  }
  return {
    projectId: model.projectId,
    projectRevision: model.revision,
    initialized: true,
    currency: fin.currency,
    summary: buildProjectFinancialSummary(fin),
    categories: Object.values(fin.categories)
      .map((c) => ({
        id: c.id,
        name: c.name,
        isDefault: c.isDefault,
        active: c.active,
        sortOrder: c.sortOrder ?? null,
        notes: c.notes ?? null,
      }))
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    lines: Object.values(fin.budgetLines)
      .map((line) => viewRowFromBudgetLine(fin, line))
      .sort((a, b) => a.description.localeCompare(b.description)),
    commitments: Object.values(fin.commitments)
      .map(viewRowFromCommitment)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    actualCosts: Object.values(fin.actualCosts)
      .map(viewRowFromActualCost)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type BudgetCommandV097 =
  | { kind: "INITIALIZE_FINANCIALS"; currency: string }
  | { kind: "SET_FINANCIAL_BASELINE"; baseline: MoneyV097 }
  | {
      kind: "ADD_CATEGORY";
      name: string;
      isDefault?: boolean;
      sortOrder?: number;
      notes?: string;
    }
  | { kind: "SET_CATEGORY_NAME"; categoryId: string; name: string }
  | { kind: "SET_CATEGORY_SORT_ORDER"; categoryId: string; sortOrder: number }
  | { kind: "SET_CATEGORY_NOTES"; categoryId: string; notes: string }
  | { kind: "DEACTIVATE_CATEGORY"; categoryId: string }
  | {
      kind: "ADD_LINE";
      categoryId: string;
      description: string;
      costCode?: string;
      trade?: string;
      baselineAmount?: MoneyV097;
      isAllowance?: boolean;
      vendorRef?: string;
      scopeItemIds?: string[];
      notes?: string;
    }
  | { kind: "SET_LINE_DESCRIPTION"; budgetLineId: string; description: string }
  | { kind: "SET_LINE_CATEGORY"; budgetLineId: string; categoryId: string }
  | { kind: "SET_LINE_COST_CODE"; budgetLineId: string; costCode: string }
  | { kind: "SET_LINE_TRADE"; budgetLineId: string; trade: string }
  | {
      kind: "SET_LINE_BASELINE_AMOUNT";
      budgetLineId: string;
      baselineAmount: MoneyV097 | null;
    }
  | {
      kind: "SET_LINE_IS_ALLOWANCE";
      budgetLineId: string;
      isAllowance: boolean;
    }
  | { kind: "SET_LINE_VENDOR"; budgetLineId: string; vendorRef: string }
  | {
      kind: "ASSOCIATE_LINE_SCOPE_ITEMS";
      budgetLineId: string;
      scopeItemIds: string[];
    }
  | { kind: "SET_LINE_NOTES"; budgetLineId: string; notes: string }
  | { kind: "DEACTIVATE_LINE"; budgetLineId: string }
  | {
      kind: "ADD_COMMITMENT";
      amount: MoneyV097;
      allocations?: CommitmentAllocationV097[];
      vendorRef?: string;
      activityId?: string;
      scopeItemIds?: string[];
      reference?: string;
      notes?: string;
    }
  | { kind: "SET_COMMITMENT_AMOUNT"; commitmentId: string; amount: MoneyV097 }
  | {
      kind: "SET_COMMITMENT_ALLOCATIONS";
      commitmentId: string;
      allocations: CommitmentAllocationV097[];
    }
  | { kind: "SET_COMMITMENT_VENDOR"; commitmentId: string; vendorRef: string }
  | {
      kind: "SET_COMMITMENT_ACTIVITY";
      commitmentId: string;
      activityId: string;
    }
  | {
      kind: "ASSOCIATE_COMMITMENT_SCOPE_ITEMS";
      commitmentId: string;
      scopeItemIds: string[];
    }
  | {
      kind: "SET_COMMITMENT_REFERENCE";
      commitmentId: string;
      reference: string;
    }
  | { kind: "SET_COMMITMENT_NOTES"; commitmentId: string; notes: string }
  | { kind: "VOID_COMMITMENT"; commitmentId: string }
  | {
      kind: "ADD_ACTUAL_COST";
      amount: MoneyV097;
      date: ISODate;
      description: string;
      budgetLineId?: string;
      commitmentId?: string;
      reference?: string;
      notes?: string;
    }
  | { kind: "SET_ACTUAL_COST_AMOUNT"; actualCostId: string; amount: MoneyV097 }
  | { kind: "SET_ACTUAL_COST_DATE"; actualCostId: string; date: ISODate }
  | {
      kind: "SET_ACTUAL_COST_DESCRIPTION";
      actualCostId: string;
      description: string;
    }
  | {
      kind: "SET_ACTUAL_COST_BUDGET_LINE";
      actualCostId: string;
      budgetLineId: string | null;
    }
  | {
      kind: "SET_ACTUAL_COST_COMMITMENT";
      actualCostId: string;
      commitmentId: string | null;
    }
  | {
      kind: "SET_ACTUAL_COST_REFERENCE";
      actualCostId: string;
      reference: string;
    }
  | { kind: "SET_ACTUAL_COST_NOTES"; actualCostId: string; notes: string }
  | { kind: "VOID_ACTUAL_COST"; actualCostId: string };

/**
 * Commands whose consequence is limited to this one record's own text/metadata -- safe for the UI
 * to apply without an interactive preview step, exactly like Scope's own
 * CLERICAL_SCOPE_COMMAND_KINDS. Anything that creates a record, touches money, or changes an
 * allocation/void status still shows the full preview -> consequence -> confirm flow.
 */
export const CLERICAL_BUDGET_COMMAND_KINDS = new Set([
  "SET_CATEGORY_NAME",
  "SET_CATEGORY_SORT_ORDER",
  "SET_CATEGORY_NOTES",
  "SET_LINE_DESCRIPTION",
  "SET_LINE_COST_CODE",
  "SET_LINE_TRADE",
  "SET_LINE_VENDOR",
  "SET_LINE_NOTES",
  "SET_COMMITMENT_VENDOR",
  "SET_COMMITMENT_REFERENCE",
  "SET_COMMITMENT_NOTES",
  "SET_ACTUAL_COST_DESCRIPTION",
  "SET_ACTUAL_COST_REFERENCE",
  "SET_ACTUAL_COST_NOTES",
]);

export class BudgetCommandError extends Error {}

function requireFinancials(model: ProjectModelV094): ProjectFinancialsV097 {
  const fin = model.financials;
  if (!fin) {
    throw new BudgetCommandError("Project financials are not yet initialized");
  }
  return fin;
}

function requireOwnCurrencyMoney(
  fin: ProjectFinancialsV097,
  label: string,
  money: MoneyV097,
): void {
  if (!isValidMoney(money)) {
    throw new BudgetCommandError(`${label} is not a valid money amount`);
  }
  if (money.currency !== fin.currency) {
    throw new BudgetCommandError(
      `${label} currency ${money.currency} does not match the project's tracked currency ${fin.currency}`,
    );
  }
}

function requireCategory(
  fin: ProjectFinancialsV097,
  categoryId: string,
): BudgetCategoryV097 {
  const category = fin.categories[categoryId];
  if (!category) {
    throw new BudgetCommandError(`Unknown budget category: ${categoryId}`);
  }
  return category;
}

function requireLine(
  fin: ProjectFinancialsV097,
  budgetLineId: string,
): BudgetLineV097 {
  const line = fin.budgetLines[budgetLineId];
  if (!line) {
    throw new BudgetCommandError(`Unknown budget line: ${budgetLineId}`);
  }
  return line;
}

function requireCommitment(
  fin: ProjectFinancialsV097,
  commitmentId: string,
): CommitmentV097 {
  const commitment = fin.commitments[commitmentId];
  if (!commitment) {
    throw new BudgetCommandError(`Unknown commitment: ${commitmentId}`);
  }
  return commitment;
}

function requireActualCost(
  fin: ProjectFinancialsV097,
  actualCostId: string,
): ActualCostV097 {
  const actualCost = fin.actualCosts[actualCostId];
  if (!actualCost) {
    throw new BudgetCommandError(`Unknown actual cost: ${actualCostId}`);
  }
  return actualCost;
}

interface BuiltBudgetEvent {
  event: ProjectEventV094;
  historyNote: string;
  clerical: boolean;
}

export function buildBudgetEvent(
  model: ProjectModelV094,
  command: BudgetCommandV097,
  now: ISODateTime,
  newId: () => string,
): BuiltBudgetEvent {
  const sourceId = newId();
  const effectiveDate = now.slice(0, 10);
  const clerical = CLERICAL_BUDGET_COMMAND_KINDS.has(command.kind);

  function source(label: string): SourceV094 {
    return {
      id: sourceId,
      type: "PM_BUDGET_EDIT",
      label,
      observedAt: now,
      effectiveDate,
      authority: 1,
      reliability: 1,
    };
  }

  function finish(
    type: string,
    historyNote: string,
    mutations: ProjectEventV094["mutations"],
  ): BuiltBudgetEvent {
    return {
      historyNote,
      clerical,
      event: {
        id: newId(),
        baseRevision: model.revision,
        projectId: model.projectId,
        type,
        occurredAt: now,
        receivedAt: now,
        sourceIds: [sourceId],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: [],
        mutations: [
          { op: "UPSERT_SOURCE", source: source(historyNote) },
          ...mutations,
        ],
        payload: { budgetCommand: command },
        note: historyNote,
      },
    };
  }

  if (command.kind === "INITIALIZE_FINANCIALS") {
    if (model.financials) {
      throw new BudgetCommandError(
        "Project financials are already initialized",
      );
    }
    if (!isSupportedCurrency(command.currency)) {
      throw new BudgetCommandError(`Unsupported currency: ${command.currency}`);
    }
    return finish(
      "PROJECT_FINANCIALS_INITIALIZED",
      `Project financials initialized in ${command.currency}.`,
      [{ op: "INITIALIZE_PROJECT_FINANCIALS", currency: command.currency }],
    );
  }

  const fin = requireFinancials(model);

  if (command.kind === "SET_FINANCIAL_BASELINE") {
    requireOwnCurrencyMoney(fin, "Financial baseline", command.baseline);
    return finish(
      "PROJECT_FINANCIAL_BASELINE_SET",
      `Project financial baseline set.`,
      [{ op: "SET_PROJECT_FINANCIAL_BASELINE", baseline: command.baseline }],
    );
  }

  if (command.kind === "ADD_CATEGORY") {
    if (!command.name.trim()) {
      throw new BudgetCommandError("Category name is required");
    }
    const id = newId();
    const category: BudgetCategoryV097 = {
      id,
      name: command.name.trim(),
      isDefault: command.isDefault ?? false,
      active: true,
      sourceIds: [sourceId],
      createdAt: now,
      updatedAt: now,
      ...(command.sortOrder !== undefined
        ? { sortOrder: command.sortOrder }
        : {}),
      ...(command.notes ? { notes: command.notes } : {}),
    };
    return finish(
      "BUDGET_CATEGORY_ADDED",
      `Added budget category "${category.name}".`,
      [{ op: "UPSERT_BUDGET_CATEGORY", category }],
    );
  }

  if (command.kind === "DEACTIVATE_CATEGORY") {
    const category = requireCategory(fin, command.categoryId);
    return finish(
      "BUDGET_CATEGORY_DEACTIVATED",
      `Removed budget category "${category.name}".`,
      [{ op: "DEACTIVATE_BUDGET_CATEGORY", categoryId: category.id }],
    );
  }

  if (
    command.kind === "SET_CATEGORY_NAME" ||
    command.kind === "SET_CATEGORY_SORT_ORDER" ||
    command.kind === "SET_CATEGORY_NOTES"
  ) {
    const current = requireCategory(fin, command.categoryId);
    const updated: BudgetCategoryV097 = {
      ...current,
      updatedAt: now,
      sourceIds: [sourceId],
    };
    if (command.kind === "SET_CATEGORY_NAME") {
      if (!command.name.trim()) {
        throw new BudgetCommandError("Category name is required");
      }
      updated.name = command.name.trim();
      return finish(
        "BUDGET_CATEGORY_RENAMED",
        `Budget category "${current.name}" renamed to "${updated.name}".`,
        [{ op: "UPSERT_BUDGET_CATEGORY", category: updated }],
      );
    }
    if (command.kind === "SET_CATEGORY_SORT_ORDER") {
      updated.sortOrder = command.sortOrder;
      return finish(
        "BUDGET_CATEGORY_SORT_ORDER_CHANGED",
        `"${current.name}" sort order changed.`,
        [{ op: "UPSERT_BUDGET_CATEGORY", category: updated }],
      );
    }
    updated.notes = command.notes;
    return finish(
      "BUDGET_CATEGORY_NOTES_CHANGED",
      `Notes updated for "${current.name}".`,
      [{ op: "UPSERT_BUDGET_CATEGORY", category: updated }],
    );
  }

  if (command.kind === "ADD_LINE") {
    requireCategory(fin, command.categoryId);
    if (!command.description.trim()) {
      throw new BudgetCommandError("Budget line description is required");
    }
    if (command.baselineAmount) {
      requireOwnCurrencyMoney(
        fin,
        "Budget line baseline amount",
        command.baselineAmount,
      );
    }
    const id = newId();
    const line: BudgetLineV097 = {
      id,
      categoryId: command.categoryId,
      description: command.description.trim(),
      isAllowance: command.isAllowance ?? false,
      scopeItemIds: command.scopeItemIds
        ? [...new Set(command.scopeItemIds)]
        : [],
      active: true,
      sourceIds: [sourceId],
      createdAt: now,
      updatedAt: now,
      ...(command.costCode ? { costCode: command.costCode } : {}),
      ...(command.trade ? { trade: command.trade } : {}),
      ...(command.baselineAmount
        ? { baselineAmount: command.baselineAmount }
        : {}),
      ...(command.vendorRef ? { vendorRef: command.vendorRef } : {}),
      ...(command.notes ? { notes: command.notes } : {}),
    };
    return finish(
      "BUDGET_LINE_ADDED",
      `Added budget line "${line.description}".`,
      [{ op: "UPSERT_BUDGET_LINE", budgetLine: line }],
    );
  }

  if (command.kind === "DEACTIVATE_LINE") {
    const line = requireLine(fin, command.budgetLineId);
    return finish(
      "BUDGET_LINE_DEACTIVATED",
      `Removed budget line "${line.description}".`,
      [{ op: "DEACTIVATE_BUDGET_LINE", budgetLineId: line.id }],
    );
  }

  if (
    command.kind === "SET_LINE_DESCRIPTION" ||
    command.kind === "SET_LINE_CATEGORY" ||
    command.kind === "SET_LINE_COST_CODE" ||
    command.kind === "SET_LINE_TRADE" ||
    command.kind === "SET_LINE_BASELINE_AMOUNT" ||
    command.kind === "SET_LINE_IS_ALLOWANCE" ||
    command.kind === "SET_LINE_VENDOR" ||
    command.kind === "ASSOCIATE_LINE_SCOPE_ITEMS" ||
    command.kind === "SET_LINE_NOTES"
  ) {
    const current = requireLine(fin, command.budgetLineId);
    const updated: BudgetLineV097 = {
      ...current,
      updatedAt: now,
      sourceIds: [sourceId],
    };
    switch (command.kind) {
      case "SET_LINE_DESCRIPTION": {
        if (!command.description.trim()) {
          throw new BudgetCommandError("Budget line description is required");
        }
        updated.description = command.description.trim();
        return finish(
          "BUDGET_LINE_DESCRIPTION_CHANGED",
          `Budget line renamed to "${updated.description}".`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_CATEGORY": {
        requireCategory(fin, command.categoryId);
        updated.categoryId = command.categoryId;
        return finish(
          "BUDGET_LINE_CATEGORY_CHANGED",
          `"${current.description}" moved to a different category.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_COST_CODE": {
        updated.costCode = command.costCode;
        return finish(
          "BUDGET_LINE_COST_CODE_CHANGED",
          `"${current.description}" cost code set to ${command.costCode}.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_TRADE": {
        updated.trade = command.trade;
        return finish(
          "BUDGET_LINE_TRADE_CHANGED",
          `"${current.description}" reclassified to ${command.trade}.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_BASELINE_AMOUNT": {
        if (command.baselineAmount) {
          requireOwnCurrencyMoney(
            fin,
            "Budget line baseline amount",
            command.baselineAmount,
          );
          updated.baselineAmount = command.baselineAmount;
        } else {
          delete updated.baselineAmount;
        }
        return finish(
          "BUDGET_LINE_BASELINE_CHANGED",
          `"${current.description}" baseline amount updated.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_IS_ALLOWANCE": {
        updated.isAllowance = command.isAllowance;
        return finish(
          "BUDGET_LINE_ALLOWANCE_FLAG_CHANGED",
          `"${current.description}" allowance designation set to ${String(command.isAllowance)}.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_VENDOR": {
        updated.vendorRef = command.vendorRef;
        return finish(
          "BUDGET_LINE_VENDOR_CHANGED",
          `"${current.description}" assigned to ${command.vendorRef}.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "ASSOCIATE_LINE_SCOPE_ITEMS": {
        updated.scopeItemIds = [...new Set(command.scopeItemIds)];
        return finish(
          "BUDGET_LINE_SCOPE_ASSOCIATED",
          `"${current.description}" scope associations updated.`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
      case "SET_LINE_NOTES": {
        updated.notes = command.notes;
        return finish(
          "BUDGET_LINE_NOTES_CHANGED",
          `Notes updated for "${current.description}".`,
          [{ op: "UPSERT_BUDGET_LINE", budgetLine: updated }],
        );
      }
    }
  }

  if (command.kind === "ADD_COMMITMENT") {
    requireOwnCurrencyMoney(fin, "Commitment amount", command.amount);
    for (const allocation of command.allocations ?? []) {
      requireLine(fin, allocation.budgetLineId);
      requireOwnCurrencyMoney(fin, "Commitment allocation", allocation.amount);
    }
    const id = newId();
    const commitment: CommitmentV097 = {
      id,
      amount: command.amount,
      allocations: command.allocations
        ? command.allocations.map((a) => ({ ...a }))
        : [],
      scopeItemIds: command.scopeItemIds
        ? [...new Set(command.scopeItemIds)]
        : [],
      status: "ACTIVE",
      sourceIds: [sourceId],
      createdAt: now,
      updatedAt: now,
      ...(command.vendorRef ? { vendorRef: command.vendorRef } : {}),
      ...(command.activityId ? { activityId: command.activityId } : {}),
      ...(command.reference ? { reference: command.reference } : {}),
      ...(command.notes ? { notes: command.notes } : {}),
    };
    return finish(
      "COMMITMENT_ADDED",
      `Added commitment of ${String(command.amount.amountMinor)} ${command.amount.currency}.`,
      [{ op: "UPSERT_COMMITMENT", commitment }],
    );
  }

  if (command.kind === "VOID_COMMITMENT") {
    const current = requireCommitment(fin, command.commitmentId);
    return finish("COMMITMENT_VOIDED", `Voided commitment ${current.id}.`, [
      {
        op: "UPSERT_COMMITMENT",
        commitment: {
          ...current,
          status: "VOID",
          updatedAt: now,
          sourceIds: [sourceId],
        },
      },
    ]);
  }

  if (
    command.kind === "SET_COMMITMENT_AMOUNT" ||
    command.kind === "SET_COMMITMENT_ALLOCATIONS" ||
    command.kind === "SET_COMMITMENT_VENDOR" ||
    command.kind === "SET_COMMITMENT_ACTIVITY" ||
    command.kind === "ASSOCIATE_COMMITMENT_SCOPE_ITEMS" ||
    command.kind === "SET_COMMITMENT_REFERENCE" ||
    command.kind === "SET_COMMITMENT_NOTES"
  ) {
    const current = requireCommitment(fin, command.commitmentId);
    const updated: CommitmentV097 = {
      ...current,
      updatedAt: now,
      sourceIds: [sourceId],
    };
    switch (command.kind) {
      case "SET_COMMITMENT_AMOUNT": {
        requireOwnCurrencyMoney(fin, "Commitment amount", command.amount);
        updated.amount = command.amount;
        return finish(
          "COMMITMENT_AMOUNT_CHANGED",
          `Commitment ${current.id} amount changed.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
      case "SET_COMMITMENT_ALLOCATIONS": {
        for (const allocation of command.allocations) {
          requireLine(fin, allocation.budgetLineId);
          requireOwnCurrencyMoney(
            fin,
            "Commitment allocation",
            allocation.amount,
          );
        }
        updated.allocations = command.allocations.map((a) => ({ ...a }));
        return finish(
          "COMMITMENT_ALLOCATIONS_CHANGED",
          `Commitment ${current.id} allocations updated.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
      case "SET_COMMITMENT_VENDOR": {
        updated.vendorRef = command.vendorRef;
        return finish(
          "COMMITMENT_VENDOR_CHANGED",
          `Commitment ${current.id} assigned to ${command.vendorRef}.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
      case "SET_COMMITMENT_ACTIVITY": {
        if (!model.activities[command.activityId]) {
          throw new BudgetCommandError(
            `Unknown activity: ${command.activityId}`,
          );
        }
        updated.activityId = command.activityId;
        return finish(
          "COMMITMENT_ACTIVITY_ASSOCIATED",
          `Commitment ${current.id} associated with an activity.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
      case "ASSOCIATE_COMMITMENT_SCOPE_ITEMS": {
        updated.scopeItemIds = [...new Set(command.scopeItemIds)];
        return finish(
          "COMMITMENT_SCOPE_ASSOCIATED",
          `Commitment ${current.id} scope associations updated.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
      case "SET_COMMITMENT_REFERENCE": {
        updated.reference = command.reference;
        return finish(
          "COMMITMENT_REFERENCE_CHANGED",
          `Commitment ${current.id} reference updated.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
      case "SET_COMMITMENT_NOTES": {
        updated.notes = command.notes;
        return finish(
          "COMMITMENT_NOTES_CHANGED",
          `Notes updated for commitment ${current.id}.`,
          [{ op: "UPSERT_COMMITMENT", commitment: updated }],
        );
      }
    }
  }

  if (command.kind === "ADD_ACTUAL_COST") {
    requireOwnCurrencyMoney(fin, "Actual cost amount", command.amount);
    if (!command.description.trim()) {
      throw new BudgetCommandError("Actual cost description is required");
    }
    if (command.budgetLineId) requireLine(fin, command.budgetLineId);
    if (command.commitmentId) requireCommitment(fin, command.commitmentId);
    const id = newId();
    const actualCost: ActualCostV097 = {
      id,
      amount: command.amount,
      date: command.date,
      description: command.description.trim(),
      status: "RECORDED",
      sourceIds: [sourceId],
      createdAt: now,
      updatedAt: now,
      ...(command.budgetLineId ? { budgetLineId: command.budgetLineId } : {}),
      ...(command.commitmentId ? { commitmentId: command.commitmentId } : {}),
      ...(command.reference ? { reference: command.reference } : {}),
      ...(command.notes ? { notes: command.notes } : {}),
    };
    return finish(
      "ACTUAL_COST_ADDED",
      `Recorded actual cost: "${actualCost.description}".`,
      [{ op: "UPSERT_ACTUAL_COST", actualCost }],
    );
  }

  if (command.kind === "VOID_ACTUAL_COST") {
    const current = requireActualCost(fin, command.actualCostId);
    return finish(
      "ACTUAL_COST_VOIDED",
      `Voided actual cost "${current.description}".`,
      [
        {
          op: "UPSERT_ACTUAL_COST",
          actualCost: {
            ...current,
            status: "VOID",
            updatedAt: now,
            sourceIds: [sourceId],
          },
        },
      ],
    );
  }

  {
    // This is the last remaining command group by construction (every other kind was handled
    // and returned above), so `command` is already narrowed to exactly these 7 SET_ACTUAL_COST_*
    // variants -- an explicit re-check here would be a statically-always-true condition.
    const current = requireActualCost(fin, command.actualCostId);
    const updated: ActualCostV097 = {
      ...current,
      updatedAt: now,
      sourceIds: [sourceId],
    };
    switch (command.kind) {
      case "SET_ACTUAL_COST_AMOUNT": {
        requireOwnCurrencyMoney(fin, "Actual cost amount", command.amount);
        updated.amount = command.amount;
        return finish(
          "ACTUAL_COST_AMOUNT_CHANGED",
          `Actual cost "${current.description}" amount changed.`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
      case "SET_ACTUAL_COST_DATE": {
        updated.date = command.date;
        return finish(
          "ACTUAL_COST_DATE_CHANGED",
          `Actual cost "${current.description}" date changed.`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
      case "SET_ACTUAL_COST_DESCRIPTION": {
        if (!command.description.trim()) {
          throw new BudgetCommandError("Actual cost description is required");
        }
        updated.description = command.description.trim();
        return finish(
          "ACTUAL_COST_DESCRIPTION_CHANGED",
          `Actual cost renamed to "${updated.description}".`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
      case "SET_ACTUAL_COST_BUDGET_LINE": {
        if (command.budgetLineId) {
          requireLine(fin, command.budgetLineId);
          updated.budgetLineId = command.budgetLineId;
        } else {
          delete updated.budgetLineId;
        }
        return finish(
          "ACTUAL_COST_BUDGET_LINE_CHANGED",
          `Actual cost "${current.description}" budget line association updated.`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
      case "SET_ACTUAL_COST_COMMITMENT": {
        if (command.commitmentId) {
          requireCommitment(fin, command.commitmentId);
          updated.commitmentId = command.commitmentId;
        } else {
          delete updated.commitmentId;
        }
        return finish(
          "ACTUAL_COST_COMMITMENT_CHANGED",
          `Actual cost "${current.description}" commitment association updated.`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
      case "SET_ACTUAL_COST_REFERENCE": {
        updated.reference = command.reference;
        return finish(
          "ACTUAL_COST_REFERENCE_CHANGED",
          `Actual cost "${current.description}" reference updated.`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
      case "SET_ACTUAL_COST_NOTES": {
        updated.notes = command.notes;
        return finish(
          "ACTUAL_COST_NOTES_CHANGED",
          `Notes updated for actual cost "${current.description}".`,
          [{ op: "UPSERT_ACTUAL_COST", actualCost: updated }],
        );
      }
    }
  }

  const exhaustive: never = command;
  throw new BudgetCommandError(
    `Unhandled budget command: ${(exhaustive as { kind?: string }).kind ?? "unknown"}`,
  );
}
