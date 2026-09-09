// Phase 4 (Howler Recovery Directive, Budget + Change Orders, corrected plan): Change Orders
// answers "what changed since baseline" -- Budget (src/operator/budget.ts) answers "what did we
// plan/commit/spend." Same pattern as Scope/Schedule/Budget: a pure translation layer over the
// canonical event-sourced kernel.
//
// Lifecycle transitions are exposed as named actions (PROPOSE, SUBMIT_FOR_APPROVAL, APPROVE,
// REJECT, REOPEN_TO_DRAFT, VOID), never a generic SET_STATUS -- each action asserts the one
// specific prior status it requires, so the UI/AI layer can never construct an arbitrary status
// jump. src/engine/reducer.ts's own CHANGE_ORDER_TRANSITIONS table is still the final, independent
// authority checked at apply time; the checks here exist only to fail fast with a friendlier
// message before an event is even built.

import type {
  ChangeOrderCostAllocationV097,
  ChangeOrderStatusV097,
  ChangeOrderV097,
  ISODateTime,
  MoneyV097,
  ProjectEventV094,
  ProjectFinancialsV097,
  ProjectModelV094,
  SourceV094,
} from "../domain/types";
import { isValidMoney } from "../domain/money";
import { buildProjectFinancialSummary } from "./budget";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface ChangeOrderViewV097 {
  id: string;
  number: string | null;
  title: string;
  description: string | null;
  reason: string | null;
  status: ChangeOrderStatusV097;
  cost: MoneyV097;
  costAllocations: ChangeOrderCostAllocationV097[];
  allocatedTotal: MoneyV097;
  unallocatedAmount: MoneyV097;
  declaredScheduleImpactDays: number | null;
  scopeItemIds: string[];
  activityIds: string[];
  categoryId: string | null;
  categoryName: string | null;
  clientApproved: boolean | null;
  requestedAt: ISODateTime | null;
  proposedAt: ISODateTime | null;
  approvedAt: ISODateTime | null;
  rejectedAt: ISODateTime | null;
  voidedAt: ISODateTime | null;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

function viewRowFromChangeOrder(
  fin: ProjectFinancialsV097,
  co: ChangeOrderV097,
): ChangeOrderViewV097 {
  const allocatedMinor = co.costAllocations.reduce(
    (total, a) => total + a.amount.amountMinor,
    0,
  );
  return {
    id: co.id,
    number: co.number ?? null,
    title: co.title,
    description: co.description ?? null,
    reason: co.reason ?? null,
    status: co.status,
    cost: co.cost,
    costAllocations: co.costAllocations.map((a) => ({ ...a })),
    allocatedTotal: { amountMinor: allocatedMinor, currency: co.cost.currency },
    unallocatedAmount: {
      amountMinor: co.cost.amountMinor - allocatedMinor,
      currency: co.cost.currency,
    },
    declaredScheduleImpactDays: co.declaredScheduleImpactDays ?? null,
    scopeItemIds: [...co.scopeItemIds],
    activityIds: [...co.activityIds],
    categoryId: co.categoryId ?? null,
    categoryName: co.categoryId
      ? (fin.categories[co.categoryId]?.name ?? co.categoryId)
      : null,
    clientApproved: co.clientApproved ?? null,
    requestedAt: co.requestedAt ?? null,
    proposedAt: co.proposedAt ?? null,
    approvedAt: co.approvedAt ?? null,
    rejectedAt: co.rejectedAt ?? null,
    voidedAt: co.voidedAt ?? null,
    notes: co.notes ?? null,
    createdAt: co.createdAt,
    updatedAt: co.updatedAt,
  };
}

export interface ProjectChangeOrdersWorkspaceV097 {
  projectId: string;
  projectRevision: number;
  initialized: boolean;
  currency: string | null;
  approvedTotal: MoneyV097 | null;
  pendingTotal: MoneyV097 | null;
  changeOrders: ChangeOrderViewV097[];
}

/**
 * Pure, cheap, deterministic derivation of the full Change Orders workspace. Performs no D1
 * access and mutates nothing. Reuses buildProjectFinancialSummary from Budget for
 * approved/pending totals so the two workspaces can never silently disagree on the same numbers.
 */
export function buildChangeOrdersView(
  model: ProjectModelV094,
): ProjectChangeOrdersWorkspaceV097 {
  const fin = model.financials;
  if (!fin) {
    return {
      projectId: model.projectId,
      projectRevision: model.revision,
      initialized: false,
      currency: null,
      approvedTotal: null,
      pendingTotal: null,
      changeOrders: [],
    };
  }
  const summary = buildProjectFinancialSummary(fin);
  return {
    projectId: model.projectId,
    projectRevision: model.revision,
    initialized: true,
    currency: fin.currency,
    approvedTotal: summary.approvedChangeOrderTotal,
    pendingTotal: summary.pendingChangeOrderTotal,
    changeOrders: Object.values(fin.changeOrders)
      .map((co) => viewRowFromChangeOrder(fin, co))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type ChangeOrderCommandV097 =
  | {
      kind: "ADD_CHANGE_ORDER";
      title: string;
      cost: MoneyV097;
      description?: string;
      reason?: string;
      number?: string;
      costAllocations?: ChangeOrderCostAllocationV097[];
      declaredScheduleImpactDays?: number;
      scopeItemIds?: string[];
      activityIds?: string[];
      categoryId?: string;
      notes?: string;
    }
  | { kind: "SET_TITLE"; changeOrderId: string; title: string }
  | { kind: "SET_DESCRIPTION"; changeOrderId: string; description: string }
  | { kind: "SET_REASON"; changeOrderId: string; reason: string }
  | { kind: "SET_NUMBER"; changeOrderId: string; number: string }
  | { kind: "SET_NOTES"; changeOrderId: string; notes: string }
  | { kind: "SET_COST"; changeOrderId: string; cost: MoneyV097 }
  | {
      kind: "SET_COST_ALLOCATIONS";
      changeOrderId: string;
      costAllocations: ChangeOrderCostAllocationV097[];
    }
  | {
      kind: "SET_DECLARED_SCHEDULE_IMPACT";
      changeOrderId: string;
      declaredScheduleImpactDays: number | null;
    }
  | {
      kind: "ASSOCIATE_SCOPE_ITEMS";
      changeOrderId: string;
      scopeItemIds: string[];
    }
  | {
      kind: "ASSOCIATE_ACTIVITIES";
      changeOrderId: string;
      activityIds: string[];
    }
  | { kind: "SET_CATEGORY"; changeOrderId: string; categoryId: string | null }
  | {
      kind: "SET_CLIENT_APPROVED";
      changeOrderId: string;
      clientApproved: boolean;
    }
  | { kind: "PROPOSE"; changeOrderId: string }
  | { kind: "SUBMIT_FOR_APPROVAL"; changeOrderId: string }
  | { kind: "APPROVE"; changeOrderId: string }
  | { kind: "REJECT"; changeOrderId: string }
  | { kind: "REOPEN_TO_DRAFT"; changeOrderId: string }
  | { kind: "VOID"; changeOrderId: string };

/**
 * Text/metadata-only commands, exactly like Scope's/Budget's own clerical sets. Every lifecycle
 * transition, every money/allocation/schedule-impact/association/category/client-approval change
 * still requires the full preview -> consequence -> confirm flow.
 */
export const CLERICAL_CHANGE_ORDER_COMMAND_KINDS = new Set([
  "SET_TITLE",
  "SET_DESCRIPTION",
  "SET_REASON",
  "SET_NUMBER",
  "SET_NOTES",
]);

export class ChangeOrderCommandError extends Error {}

function requireFinancials(model: ProjectModelV094): ProjectFinancialsV097 {
  const fin = model.financials;
  if (!fin) {
    throw new ChangeOrderCommandError(
      "Project financials are not yet initialized",
    );
  }
  return fin;
}

function requireOwnCurrencyMoney(
  fin: ProjectFinancialsV097,
  label: string,
  money: MoneyV097,
): void {
  if (!isValidMoney(money)) {
    throw new ChangeOrderCommandError(`${label} is not a valid money amount`);
  }
  if (money.currency !== fin.currency) {
    throw new ChangeOrderCommandError(
      `${label} currency ${money.currency} does not match the project's tracked currency ${fin.currency}`,
    );
  }
}

function requireChangeOrder(
  fin: ProjectFinancialsV097,
  changeOrderId: string,
): ChangeOrderV097 {
  const co = fin.changeOrders[changeOrderId];
  if (!co) {
    throw new ChangeOrderCommandError(`Unknown change order: ${changeOrderId}`);
  }
  return co;
}

function requireStatus(
  co: ChangeOrderV097,
  expected: ChangeOrderStatusV097[],
  actionLabel: string,
): void {
  if (!expected.includes(co.status)) {
    throw new ChangeOrderCommandError(
      `Cannot ${actionLabel} change order ${co.id}: it is ${co.status}, expected ${expected.join(" or ")}`,
    );
  }
}

interface BuiltChangeOrderEvent {
  event: ProjectEventV094;
  historyNote: string;
  clerical: boolean;
}

export function buildChangeOrderEvent(
  model: ProjectModelV094,
  command: ChangeOrderCommandV097,
  now: ISODateTime,
  newId: () => string,
): BuiltChangeOrderEvent {
  const fin = requireFinancials(model);
  const sourceId = newId();
  const effectiveDate = now.slice(0, 10);
  const clerical = CLERICAL_CHANGE_ORDER_COMMAND_KINDS.has(command.kind);

  function source(label: string): SourceV094 {
    return {
      id: sourceId,
      type: "PM_CHANGE_ORDER_EDIT",
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
    changeOrder: ChangeOrderV097,
  ): BuiltChangeOrderEvent {
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
        impactSeedActivityIds: changeOrder.activityIds,
        mutations: [
          { op: "UPSERT_SOURCE", source: source(historyNote) },
          { op: "UPSERT_CHANGE_ORDER", changeOrder },
        ],
        payload: { changeOrderCommand: command },
        note: historyNote,
      },
    };
  }

  function validateAllocations(
    allocations: ChangeOrderCostAllocationV097[],
  ): void {
    for (const allocation of allocations) {
      if (!fin.budgetLines[allocation.budgetLineId]) {
        throw new ChangeOrderCommandError(
          `Unknown budget line: ${allocation.budgetLineId}`,
        );
      }
      requireOwnCurrencyMoney(
        fin,
        "Change order allocation",
        allocation.amount,
      );
    }
  }

  if (command.kind === "ADD_CHANGE_ORDER") {
    if (!command.title.trim()) {
      throw new ChangeOrderCommandError("Change order title is required");
    }
    requireOwnCurrencyMoney(fin, "Change order cost", command.cost);
    if (command.categoryId && !fin.categories[command.categoryId]) {
      throw new ChangeOrderCommandError(
        `Unknown budget category: ${command.categoryId}`,
      );
    }
    for (const activityId of command.activityIds ?? []) {
      if (!model.activities[activityId]) {
        throw new ChangeOrderCommandError(`Unknown activity: ${activityId}`);
      }
    }
    validateAllocations(command.costAllocations ?? []);
    const id = newId();
    const changeOrder: ChangeOrderV097 = {
      id,
      title: command.title.trim(),
      status: "DRAFT",
      cost: command.cost,
      costAllocations: (command.costAllocations ?? []).map((a) => ({ ...a })),
      scopeItemIds: command.scopeItemIds
        ? [...new Set(command.scopeItemIds)]
        : [],
      activityIds: command.activityIds ? [...new Set(command.activityIds)] : [],
      requestedAt: now,
      sourceIds: [sourceId],
      createdAt: now,
      updatedAt: now,
      ...(command.description ? { description: command.description } : {}),
      ...(command.reason ? { reason: command.reason } : {}),
      ...(command.number ? { number: command.number } : {}),
      ...(command.declaredScheduleImpactDays !== undefined
        ? { declaredScheduleImpactDays: command.declaredScheduleImpactDays }
        : {}),
      ...(command.categoryId ? { categoryId: command.categoryId } : {}),
      ...(command.notes ? { notes: command.notes } : {}),
    };
    return finish(
      "CHANGE_ORDER_ADDED",
      `Added change order "${changeOrder.title}" (DRAFT).`,
      changeOrder,
    );
  }

  const current = requireChangeOrder(fin, command.changeOrderId);
  const updated: ChangeOrderV097 = {
    ...current,
    updatedAt: now,
    sourceIds: [sourceId],
  };

  switch (command.kind) {
    case "SET_TITLE": {
      if (!command.title.trim()) {
        throw new ChangeOrderCommandError("Change order title is required");
      }
      updated.title = command.title.trim();
      return finish(
        "CHANGE_ORDER_TITLE_CHANGED",
        `Change order renamed to "${updated.title}".`,
        updated,
      );
    }
    case "SET_DESCRIPTION": {
      updated.description = command.description;
      return finish(
        "CHANGE_ORDER_DESCRIPTION_CHANGED",
        `"${current.title}" description updated.`,
        updated,
      );
    }
    case "SET_REASON": {
      updated.reason = command.reason;
      return finish(
        "CHANGE_ORDER_REASON_CHANGED",
        `"${current.title}" reason updated.`,
        updated,
      );
    }
    case "SET_NUMBER": {
      updated.number = command.number;
      return finish(
        "CHANGE_ORDER_NUMBER_CHANGED",
        `"${current.title}" number set to ${command.number}.`,
        updated,
      );
    }
    case "SET_NOTES": {
      updated.notes = command.notes;
      return finish(
        "CHANGE_ORDER_NOTES_CHANGED",
        `Notes updated for "${current.title}".`,
        updated,
      );
    }
    case "SET_COST": {
      requireOwnCurrencyMoney(fin, "Change order cost", command.cost);
      updated.cost = command.cost;
      return finish(
        "CHANGE_ORDER_COST_CHANGED",
        `"${current.title}" cost updated.`,
        updated,
      );
    }
    case "SET_COST_ALLOCATIONS": {
      validateAllocations(command.costAllocations);
      updated.costAllocations = command.costAllocations.map((a) => ({ ...a }));
      return finish(
        "CHANGE_ORDER_ALLOCATIONS_CHANGED",
        `"${current.title}" budget line allocations updated.`,
        updated,
      );
    }
    case "SET_DECLARED_SCHEDULE_IMPACT": {
      if (command.declaredScheduleImpactDays === null) {
        delete updated.declaredScheduleImpactDays;
      } else {
        updated.declaredScheduleImpactDays = command.declaredScheduleImpactDays;
      }
      return finish(
        "CHANGE_ORDER_SCHEDULE_IMPACT_DECLARED",
        `"${current.title}" declared schedule impact updated (Schedule itself is unchanged until separately authorized).`,
        updated,
      );
    }
    case "ASSOCIATE_SCOPE_ITEMS": {
      updated.scopeItemIds = [...new Set(command.scopeItemIds)];
      return finish(
        "CHANGE_ORDER_SCOPE_ASSOCIATED",
        `"${current.title}" scope associations updated.`,
        updated,
      );
    }
    case "ASSOCIATE_ACTIVITIES": {
      for (const activityId of command.activityIds) {
        if (!model.activities[activityId]) {
          throw new ChangeOrderCommandError(`Unknown activity: ${activityId}`);
        }
      }
      updated.activityIds = [...new Set(command.activityIds)];
      return finish(
        "CHANGE_ORDER_ACTIVITIES_ASSOCIATED",
        `"${current.title}" activity associations updated (context only, Schedule itself is unchanged).`,
        updated,
      );
    }
    case "SET_CATEGORY": {
      if (command.categoryId) {
        if (!fin.categories[command.categoryId]) {
          throw new ChangeOrderCommandError(
            `Unknown budget category: ${command.categoryId}`,
          );
        }
        updated.categoryId = command.categoryId;
      } else {
        delete updated.categoryId;
      }
      return finish(
        "CHANGE_ORDER_CATEGORY_CHANGED",
        `"${current.title}" budget category updated.`,
        updated,
      );
    }
    case "SET_CLIENT_APPROVED": {
      updated.clientApproved = command.clientApproved;
      return finish(
        "CHANGE_ORDER_CLIENT_APPROVAL_CHANGED",
        `"${current.title}" client approval set to ${String(command.clientApproved)}.`,
        updated,
      );
    }
    case "PROPOSE": {
      requireStatus(current, ["DRAFT"], "propose");
      updated.status = "PROPOSED";
      updated.proposedAt = now;
      return finish(
        "CHANGE_ORDER_PROPOSED",
        `"${current.title}" proposed.`,
        updated,
      );
    }
    case "SUBMIT_FOR_APPROVAL": {
      requireStatus(current, ["PROPOSED"], "submit for approval");
      updated.status = "PENDING_APPROVAL";
      return finish(
        "CHANGE_ORDER_SUBMITTED_FOR_APPROVAL",
        `"${current.title}" submitted for approval.`,
        updated,
      );
    }
    case "APPROVE": {
      requireStatus(current, ["PENDING_APPROVAL"], "approve");
      updated.status = "APPROVED";
      updated.approvedAt = now;
      return finish(
        "CHANGE_ORDER_APPROVED",
        `"${current.title}" approved.`,
        updated,
      );
    }
    case "REJECT": {
      requireStatus(current, ["PENDING_APPROVAL"], "reject");
      updated.status = "REJECTED";
      updated.rejectedAt = now;
      return finish(
        "CHANGE_ORDER_REJECTED",
        `"${current.title}" rejected.`,
        updated,
      );
    }
    case "REOPEN_TO_DRAFT": {
      requireStatus(current, ["PROPOSED", "REJECTED"], "reopen");
      updated.status = "DRAFT";
      return finish(
        "CHANGE_ORDER_REOPENED",
        `"${current.title}" reopened to draft.`,
        updated,
      );
    }
    case "VOID": {
      requireStatus(
        current,
        ["DRAFT", "PROPOSED", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
        "void",
      );
      updated.status = "VOID";
      updated.voidedAt = now;
      return finish(
        "CHANGE_ORDER_VOIDED",
        `"${current.title}" voided.`,
        updated,
      );
    }
    default: {
      const exhaustive: never = command;
      throw new ChangeOrderCommandError(
        `Unhandled change order command: ${(exhaustive as { kind?: string }).kind ?? "unknown"}`,
      );
    }
  }
}
