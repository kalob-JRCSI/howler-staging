// Phase 1 recovery: hand-mirrored copies of the exact wire shapes this app consumes, kept
// independent of the real src/operator/src/engine/src/domain modules -- those transitively pull
// in Cloudflare Workers-only globals (D1Database, SubtleCrypto.timingSafeEqual, Env) that conflict
// with this bundle's browser DOM lib. This is the same pattern src/worker/admin.ts's own client
// script already uses for its ProjectSummaryLike/GenesisProposalLike interfaces, for the same
// reason -- it also runs in a different compilation environment than the Worker code that emits
// it. Any change to the real response shape must be mirrored here by hand.

export interface ProjectScheduleItemLike {
  activityId: string;
  activityName: string;
  phase: string;
  startDate: string | null;
  finishDate: string | null;
  basis: "COMMITTED" | "FORECAST";
}

export interface ProjectSummaryLike {
  projectId: string;
  projectName: string;
  progressPercent: number;
  integrity: { score: number; condition: string; primaryDriver: string };
  budget: {
    baseline: number | null;
    spent: number | null;
    remaining: number | null;
    spentPercent: number | null;
  };
  primaryExposure: string;
  nextMovement: string;
  projectedCompletion: string | null;
  schedule: {
    committed: ProjectScheduleItemLike[];
    forecast: ProjectScheduleItemLike[];
  };
  scope: { id: string; label: string; phase: string }[];
  blockedScopeItems: string[];
  scopeAddedAfterBaselineCount: number;
}

export interface PmActionLike {
  activityId: string;
  priority: "CRITICAL" | "WATCH";
  requiredBy: string;
  dueStatus: "OVERDUE" | "DUE_NOW" | "UPCOMING";
  truthState: string;
  action: string;
}

export interface ProtectionActionLike {
  id: string;
  action: string;
}

export interface ForecastSnapshotLike {
  pmActions: PmActionLike[];
  recoveryAnalysis: { protectionActions: ProtectionActionLike[] };
}

export interface ProjectEventLike {
  id: string;
  baseRevision: number;
  type: string;
  occurredAt: string;
  note?: string;
}

// Phase 2 (Editable Project Schedule): hand-mirrored copies of src/operator/schedule.ts's own
// wire shapes, for the same reason as every other *Like type in this file -- this bundle cannot
// import the real domain/operator modules.

export type ActivityStateLike = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export interface ScheduleDependencyRefLike {
  dependencyId: string;
  activityId: string;
  activityName: string;
  type: string;
  lagWorkdays: number;
  hard: boolean;
  reason: string;
}

export interface ScheduleConstraintRefLike {
  constraintId: string;
  type: string;
  label: string;
  state: string;
  hard: boolean;
}

export interface ScheduleActivityLike {
  activityId: string;
  name: string;
  phase: string;
  state: ActivityStateLike;
  trade: string | null;
  duration: { optimistic: number; likely: number; conservative: number };
  committedStart: string | null;
  committedFinish: string | null;
  forecastStart: string | null;
  forecastFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  isLocked: boolean;
  critical: boolean | null;
  floatWorkdays: number | null;
  predecessors: ScheduleDependencyRefLike[];
  successors: ScheduleDependencyRefLike[];
  constraints: ScheduleConstraintRefLike[];
  warnings: string[];
}

export interface ProjectScheduleLike {
  projectId: string;
  projectRevision: number;
  forecastVersion: number | null;
  activities: ScheduleActivityLike[];
}

export interface ThreePointInputLike {
  optimistic: number;
  likely: number;
  conservative: number;
}

export type ScheduleCommandLike =
  | {
      kind: "ADD_ACTIVITY";
      name: string;
      phase: string;
      duration: ThreePointInputLike;
    }
  | { kind: "RENAME_ACTIVITY"; activityId: string; name: string }
  | { kind: "SET_PHASE"; activityId: string; phase: string }
  | { kind: "SET_DURATION"; activityId: string; duration: ThreePointInputLike }
  | {
      kind: "SET_COMMITTED_DATES";
      activityId: string;
      startDate?: string;
      finishDate?: string;
    }
  | { kind: "CLEAR_COMMITTED_DATES"; activityId: string }
  | {
      kind: "ADD_DEPENDENCY";
      predecessorId: string;
      successorId: string;
      type: string;
      lagWorkdays: number;
      hard: boolean;
      reason: string;
    }
  | { kind: "REMOVE_DEPENDENCY"; dependencyId: string }
  | {
      kind: "EDIT_DEPENDENCY";
      dependencyId: string;
      type?: string;
      lagWorkdays?: number;
      hard?: boolean;
      reason?: string;
    }
  | { kind: "SET_ACTUAL_START"; activityId: string; date: string }
  | { kind: "SET_ACTUAL_FINISH"; activityId: string; date: string }
  | {
      kind: "SET_ACTIVITY_STATE";
      activityId: string;
      state: ActivityStateLike;
    };

export interface ShiftedActivityLike {
  activityId: string;
  activityName: string;
  critical: boolean;
  startLikely: { from: string; to: string; deltaWorkdays: number };
  finishLikely: { from: string; to: string; deltaWorkdays: number };
}

export interface ScheduleCommandPreviewLike {
  projectRevision: number;
  reviewToken: string;
  historyNote: string;
  event: unknown;
  delta: {
    completionLikely: { from: string; to: string; deltaWorkdays: number };
    shiftedActivityCount: number;
    criticalShiftCount: number;
    shiftedActivities: ShiftedActivityLike[];
  } | null;
  recoveryAnalysis: {
    status: string;
    protectionActions: ProtectionActionLike[];
  };
}

// Phase 3 (Functional Project Scope Workspace): hand-mirrored copies of src/operator/scope.ts's
// own wire shapes, for the same reason as every other *Like type in this file.

export type ScopeStatusLike =
  "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "NOT_APPLICABLE";

export interface ScopeAllowanceLike {
  amount: number;
  currency: string;
  note?: string;
}

export interface ScopeActivityRefLike {
  activityId: string;
  activityName: string;
  activityState: string;
}

export interface ScopeItemViewLike {
  id: string;
  description: string;
  phase: string;
  status: ScopeStatusLike;
  included: boolean;
  trade: string | null;
  allowance: ScopeAllowanceLike | null;
  responsibleVendor: string | null;
  activities: ScopeActivityRefLike[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  addedAfterBaseline: boolean;
  baselineDescription: string | null;
  baselinePhase: string | null;
}

export type ScopeInsightKindLike =
  | "NO_SCHEDULE_ACTIVITY"
  | "ADDED_AFTER_BASELINE"
  | "COMPLETE_BUT_ACTIVITY_INCOMPLETE"
  | "UNSCOPED_ACTIVITY";

export interface ScopeInsightLike {
  kind: ScopeInsightKindLike;
  scopeItemId: string | null;
  activityId: string | null;
  message: string;
}

export interface ProjectScopeLike {
  projectId: string;
  projectRevision: number;
  items: ScopeItemViewLike[];
  insights: ScopeInsightLike[];
  allActivities: ScopeActivityRefLike[];
}

export type ScopeCommandLike =
  | {
      kind: "ADD_SCOPE_ITEM";
      description: string;
      phase: string;
      trade?: string;
      included?: boolean;
      responsibleVendor?: string;
      notes?: string;
    }
  | { kind: "SET_DESCRIPTION"; scopeItemId: string; description: string }
  | { kind: "SET_PHASE"; scopeItemId: string; phase: string }
  | { kind: "SET_TRADE"; scopeItemId: string; trade: string }
  | { kind: "SET_INCLUDED"; scopeItemId: string; included: boolean }
  | {
      kind: "SET_ALLOWANCE";
      scopeItemId: string;
      allowance: ScopeAllowanceLike | null;
    }
  | { kind: "SET_RESPONSIBLE_VENDOR"; scopeItemId: string; vendor: string }
  | { kind: "SET_STATUS"; scopeItemId: string; status: ScopeStatusLike }
  | { kind: "SET_NOTES"; scopeItemId: string; notes: string }
  | { kind: "ASSOCIATE_ACTIVITIES"; scopeItemId: string; activityIds: string[] }
  | { kind: "DEACTIVATE_SCOPE_ITEM"; scopeItemId: string };

export interface ScopeCommandPreviewLike {
  projectRevision: number;
  reviewToken: string;
  historyNote: string;
  clerical: boolean;
  event: unknown;
  delta: ScheduleCommandPreviewLike["delta"];
  recoveryAnalysis: {
    status: string;
    protectionActions: ProtectionActionLike[];
  };
}

// Phase 4 (Budget + Change Orders): hand-mirrored copies of src/operator/budget.ts's and
// src/operator/change-orders.ts's own wire shapes, for the same reason as every other *Like type
// in this file. `MoneyLike.currency` is deliberately just `string` here, exactly like the
// server's own wire type -- validity is the server's job, never re-validated client-side.

export interface MoneyLike {
  amountMinor: number;
  currency: string;
}

export interface AllocationLike {
  budgetLineId: string;
  amount: MoneyLike;
}

export interface ProjectFinancialSummaryLike {
  currency: string;
  baseline: MoneyLike | null;
  approvedChangeOrderTotal: MoneyLike;
  pendingChangeOrderTotal: MoneyLike;
  revisedBudget: MoneyLike | null;
  committedTotal: MoneyLike;
  actualTotal: MoneyLike;
  remaining: MoneyLike | null;
}

export interface BudgetCategoryViewLike {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  sortOrder: number | null;
  notes: string | null;
}

export interface BudgetLineViewLike {
  id: string;
  categoryId: string;
  categoryName: string;
  description: string;
  costCode: string | null;
  trade: string | null;
  baselineAmount: MoneyLike | null;
  isAllowance: boolean;
  vendorRef: string | null;
  scopeItemIds: string[];
  notes: string | null;
  active: boolean;
  committedTotal: MoneyLike;
  actualTotal: MoneyLike;
  approvedChangeOrderTotal: MoneyLike;
  revisedAmount: MoneyLike | null;
  remaining: MoneyLike | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentViewLike {
  id: string;
  amount: MoneyLike;
  allocatedTotal: MoneyLike;
  unallocatedAmount: MoneyLike;
  allocations: AllocationLike[];
  vendorRef: string | null;
  activityId: string | null;
  scopeItemIds: string[];
  reference: string | null;
  status: "ACTIVE" | "VOID";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActualCostViewLike {
  id: string;
  amount: MoneyLike;
  date: string;
  description: string;
  budgetLineId: string | null;
  commitmentId: string | null;
  reference: string | null;
  status: "RECORDED" | "VOID";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBudgetWorkspaceLike {
  projectId: string;
  projectRevision: number;
  initialized: boolean;
  currency: string | null;
  summary: ProjectFinancialSummaryLike | null;
  categories: BudgetCategoryViewLike[];
  lines: BudgetLineViewLike[];
  commitments: CommitmentViewLike[];
  actualCosts: ActualCostViewLike[];
}

export type BudgetCommandLike =
  | { kind: "INITIALIZE_FINANCIALS"; currency: string }
  | { kind: "SET_FINANCIAL_BASELINE"; baseline: MoneyLike }
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
      baselineAmount?: MoneyLike;
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
      baselineAmount: MoneyLike | null;
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
      amount: MoneyLike;
      allocations?: AllocationLike[];
      vendorRef?: string;
      activityId?: string;
      scopeItemIds?: string[];
      reference?: string;
      notes?: string;
    }
  | { kind: "SET_COMMITMENT_AMOUNT"; commitmentId: string; amount: MoneyLike }
  | {
      kind: "SET_COMMITMENT_ALLOCATIONS";
      commitmentId: string;
      allocations: AllocationLike[];
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
      amount: MoneyLike;
      date: string;
      description: string;
      budgetLineId?: string;
      commitmentId?: string;
      reference?: string;
      notes?: string;
    }
  | { kind: "SET_ACTUAL_COST_AMOUNT"; actualCostId: string; amount: MoneyLike }
  | { kind: "SET_ACTUAL_COST_DATE"; actualCostId: string; date: string }
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

export interface BudgetCommandPreviewLike {
  projectRevision: number;
  reviewToken: string;
  historyNote: string;
  clerical: boolean;
  event: unknown;
  delta: ScheduleCommandPreviewLike["delta"];
  recoveryAnalysis: {
    status: string;
    protectionActions: ProtectionActionLike[];
  };
}

export type ChangeOrderStatusLike =
  "DRAFT" | "PROPOSED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "VOID";

export interface ChangeOrderViewLike {
  id: string;
  number: string | null;
  title: string;
  description: string | null;
  reason: string | null;
  status: ChangeOrderStatusLike;
  cost: MoneyLike;
  costAllocations: AllocationLike[];
  allocatedTotal: MoneyLike;
  unallocatedAmount: MoneyLike;
  declaredScheduleImpactDays: number | null;
  scopeItemIds: string[];
  activityIds: string[];
  categoryId: string | null;
  categoryName: string | null;
  clientApproved: boolean | null;
  requestedAt: string | null;
  proposedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  voidedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChangeOrdersWorkspaceLike {
  projectId: string;
  projectRevision: number;
  initialized: boolean;
  currency: string | null;
  approvedTotal: MoneyLike | null;
  pendingTotal: MoneyLike | null;
  changeOrders: ChangeOrderViewLike[];
}

export type ChangeOrderCommandLike =
  | {
      kind: "ADD_CHANGE_ORDER";
      title: string;
      cost: MoneyLike;
      description?: string;
      reason?: string;
      number?: string;
      costAllocations?: AllocationLike[];
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
  | { kind: "SET_COST"; changeOrderId: string; cost: MoneyLike }
  | {
      kind: "SET_COST_ALLOCATIONS";
      changeOrderId: string;
      costAllocations: AllocationLike[];
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

export interface ChangeOrderCommandPreviewLike {
  projectRevision: number;
  reviewToken: string;
  historyNote: string;
  clerical: boolean;
  event: unknown;
  delta: ScheduleCommandPreviewLike["delta"];
  recoveryAnalysis: {
    status: string;
    protectionActions: ProtectionActionLike[];
  };
}
