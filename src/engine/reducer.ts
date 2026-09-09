import type {
  ActivityV094,
  ActualCostV097,
  BudgetCategoryV097,
  BudgetLineV097,
  ChangeOrderStatusV097,
  ChangeOrderV097,
  CommercialSignalV094,
  CommitmentV097,
  ConflictV094,
  ConstraintV094,
  DependencyV094,
  MoneyV097,
  ProjectEventV094,
  ProjectFinancialsV097,
  ProjectModelV094,
  ScopeItemV096,
  SourceV094,
  WorkloadSignalV094,
} from "../domain/types";

function cloneActivity(activity: ActivityV094): ActivityV094 {
  return {
    ...activity,
    duration: {
      ...activity.duration,
      sourceIds: [...activity.duration.sourceIds],
    },
    constraintIds: [...activity.constraintIds],
    sourceIds: [...activity.sourceIds],
    ...(activity.actualStartSourceIds
      ? { actualStartSourceIds: [...activity.actualStartSourceIds] }
      : {}),
    ...(activity.actualStartVerification
      ? { actualStartVerification: activity.actualStartVerification }
      : {}),
    ...(activity.actualFinishSourceIds
      ? { actualFinishSourceIds: [...activity.actualFinishSourceIds] }
      : {}),
    ...(activity.actualFinishVerification
      ? { actualFinishVerification: activity.actualFinishVerification }
      : {}),
    ...(activity.scheduleLock
      ? { scheduleLock: { ...activity.scheduleLock } }
      : {}),
    ...(activity.tags ? { tags: [...activity.tags] } : {}),
  };
}

function cloneConstraint(constraint: ConstraintV094): ConstraintV094 {
  return {
    ...constraint,
    sourceIds: [...constraint.sourceIds],
    ...(constraint.readiness ? { readiness: { ...constraint.readiness } } : {}),
  };
}

function cloneDependency(dependency: DependencyV094): DependencyV094 {
  return { ...dependency, sourceIds: [...dependency.sourceIds] };
}

function cloneSource(source: SourceV094): SourceV094 {
  return { ...source };
}

function cloneConflict(conflict: ConflictV094): ConflictV094 {
  return {
    ...conflict,
    activityIds: [...conflict.activityIds],
    sourceIds: [...conflict.sourceIds],
  };
}

function cloneCommercialSignal(
  signal: CommercialSignalV094,
): CommercialSignalV094 {
  return {
    ...signal,
    activityIds: [...signal.activityIds],
    sourceIds: [...signal.sourceIds],
  };
}

function cloneWorkloadSignal(signal: WorkloadSignalV094): WorkloadSignalV094 {
  return {
    ...signal,
    activityIds: [...signal.activityIds],
    sourceIds: [...signal.sourceIds],
  };
}

function cloneScopeItem(item: ScopeItemV096): ScopeItemV096 {
  return {
    ...item,
    activityIds: [...item.activityIds],
    planDocumentRefs: [...item.planDocumentRefs],
    sourceIds: [...item.sourceIds],
    ...(item.allowance ? { allowance: { ...item.allowance } } : {}),
  };
}

function cloneMoney(money: MoneyV097): MoneyV097 {
  return { ...money };
}

function cloneBudgetCategory(category: BudgetCategoryV097): BudgetCategoryV097 {
  return { ...category, sourceIds: [...category.sourceIds] };
}

function cloneBudgetLine(line: BudgetLineV097): BudgetLineV097 {
  return {
    ...line,
    scopeItemIds: [...line.scopeItemIds],
    sourceIds: [...line.sourceIds],
    ...(line.baselineAmount
      ? { baselineAmount: cloneMoney(line.baselineAmount) }
      : {}),
  };
}

function cloneCommitment(commitment: CommitmentV097): CommitmentV097 {
  return {
    ...commitment,
    amount: cloneMoney(commitment.amount),
    allocations: commitment.allocations.map((allocation) => ({
      ...allocation,
      amount: cloneMoney(allocation.amount),
    })),
    scopeItemIds: [...commitment.scopeItemIds],
    sourceIds: [...commitment.sourceIds],
  };
}

function cloneActualCost(actualCost: ActualCostV097): ActualCostV097 {
  return {
    ...actualCost,
    amount: cloneMoney(actualCost.amount),
    sourceIds: [...actualCost.sourceIds],
  };
}

function cloneChangeOrder(changeOrder: ChangeOrderV097): ChangeOrderV097 {
  return {
    ...changeOrder,
    cost: cloneMoney(changeOrder.cost),
    costAllocations: changeOrder.costAllocations.map((allocation) => ({
      ...allocation,
      amount: cloneMoney(allocation.amount),
    })),
    scopeItemIds: [...changeOrder.scopeItemIds],
    activityIds: [...changeOrder.activityIds],
    sourceIds: [...changeOrder.sourceIds],
  };
}

function cloneProjectFinancials(
  financials: ProjectFinancialsV097,
): ProjectFinancialsV097 {
  return {
    ...financials,
    ...(financials.baseline
      ? { baseline: cloneMoney(financials.baseline) }
      : {}),
    baselineSourceIds: [...financials.baselineSourceIds],
    categories: Object.fromEntries(
      Object.entries(financials.categories).map(([id, category]) => [
        id,
        cloneBudgetCategory(category),
      ]),
    ),
    budgetLines: Object.fromEntries(
      Object.entries(financials.budgetLines).map(([id, line]) => [
        id,
        cloneBudgetLine(line),
      ]),
    ),
    commitments: Object.fromEntries(
      Object.entries(financials.commitments).map(([id, commitment]) => [
        id,
        cloneCommitment(commitment),
      ]),
    ),
    actualCosts: Object.fromEntries(
      Object.entries(financials.actualCosts).map(([id, actualCost]) => [
        id,
        cloneActualCost(actualCost),
      ]),
    ),
    changeOrders: Object.fromEntries(
      Object.entries(financials.changeOrders).map(([id, changeOrder]) => [
        id,
        cloneChangeOrder(changeOrder),
      ]),
    ),
  };
}

// Exact-once approval (corrected plan, Change Orders acceptance walkthrough): APPROVED is
// reachable only from PENDING_APPROVAL and leads only to VOID, so an already-approved change
// order's budget effect can never be silently reapplied by re-sending an UPSERT_CHANGE_ORDER.
// REJECTED may reopen to DRAFT (an explicit PM correction, not an automatic retry) or go straight
// to VOID; VOID is terminal. A brand-new change order (no prior record) may only be created in
// DRAFT -- see the CO_CREATION_STATUS check at the call site below.
const CHANGE_ORDER_TRANSITIONS: Record<
  ChangeOrderStatusV097,
  ChangeOrderStatusV097[]
> = {
  DRAFT: ["PROPOSED", "VOID"],
  PROPOSED: ["PENDING_APPROVAL", "DRAFT", "VOID"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "VOID"],
  APPROVED: ["VOID"],
  REJECTED: ["DRAFT", "VOID"],
  VOID: [],
};

function assertLegalChangeOrderTransition(
  changeOrderId: string,
  previous: ChangeOrderV097 | undefined,
  next: ChangeOrderV097,
): void {
  if (!previous) {
    if (next.status !== "DRAFT") {
      throw new Error(
        `Change order ${changeOrderId} must be created in DRAFT status, not ${next.status}`,
      );
    }
    return;
  }
  if (previous.status === next.status) return;
  const allowed = CHANGE_ORDER_TRANSITIONS[previous.status];
  if (!allowed.includes(next.status)) {
    throw new Error(
      `Change order ${changeOrderId} cannot transition from ${previous.status} to ${next.status}`,
    );
  }
}

export function applyEventMutations(
  model: ProjectModelV094,
  event: ProjectEventV094,
): ProjectModelV094 {
  const activities: Record<string, ActivityV094> = Object.fromEntries(
    Object.entries(model.activities).map(([id, activity]) => [
      id,
      cloneActivity(activity),
    ]),
  );
  const constraints: Record<string, ConstraintV094> = Object.fromEntries(
    Object.entries(model.constraints).map(([id, constraint]) => [
      id,
      cloneConstraint(constraint),
    ]),
  );
  const dependencies: Record<string, DependencyV094> = Object.fromEntries(
    Object.entries(model.dependencies).map(([id, dependency]) => [
      id,
      cloneDependency(dependency),
    ]),
  );
  const sources: Record<string, SourceV094> = Object.fromEntries(
    Object.entries(model.sources).map(([id, source]) => [
      id,
      cloneSource(source),
    ]),
  );
  const conflicts: Record<string, ConflictV094> = Object.fromEntries(
    Object.entries(model.conflicts ?? {}).map(([id, conflict]) => [
      id,
      cloneConflict(conflict),
    ]),
  );
  const commercialSignals: Record<string, CommercialSignalV094> =
    Object.fromEntries(
      Object.entries(model.commercialSignals ?? {}).map(([id, signal]) => [
        id,
        cloneCommercialSignal(signal),
      ]),
    );
  const workloadSignals: Record<string, WorkloadSignalV094> =
    Object.fromEntries(
      Object.entries(model.workloadSignals ?? {}).map(([id, signal]) => [
        id,
        cloneWorkloadSignal(signal),
      ]),
    );
  const scopeItems: Record<string, ScopeItemV096> = Object.fromEntries(
    Object.entries(model.scopeItems ?? {}).map(([id, item]) => [
      id,
      cloneScopeItem(item),
    ]),
  );
  let financials: ProjectFinancialsV097 | undefined = model.financials
    ? cloneProjectFinancials(model.financials)
    : undefined;
  function requireFinancials(opLabel: string): ProjectFinancialsV097 {
    if (!financials) {
      throw new Error(
        `Cannot apply ${opLabel} before project financials are initialized`,
      );
    }
    return financials;
  }
  for (const mutation of event.mutations) {
    switch (mutation.op) {
      case "SET_ACTUAL_START": {
        const activity = activities[mutation.activityId];
        if (!activity)
          throw new Error(
            `Unknown activity in SET_ACTUAL_START: ${mutation.activityId}`,
          );
        activity.actualStart = mutation.date;
        activity.actualStartSourceIds = [...event.sourceIds];
        activity.actualStartVerification = event.verification;
        activity.state =
          activity.state === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS";
        break;
      }
      case "SET_ACTUAL_FINISH": {
        const activity = activities[mutation.activityId];
        if (!activity)
          throw new Error(
            `Unknown activity in SET_ACTUAL_FINISH: ${mutation.activityId}`,
          );
        activity.actualFinish = mutation.date;
        activity.actualFinishSourceIds = [...event.sourceIds];
        activity.actualFinishVerification = event.verification;
        activity.state = "COMPLETE";
        break;
      }
      case "SET_ACTIVITY_STATE": {
        const activity = activities[mutation.activityId];
        if (!activity)
          throw new Error(
            `Unknown activity in SET_ACTIVITY_STATE: ${mutation.activityId}`,
          );
        activity.state = mutation.state;
        break;
      }
      case "SET_DURATION": {
        const activity = activities[mutation.activityId];
        if (!activity)
          throw new Error(
            `Unknown activity in SET_DURATION: ${mutation.activityId}`,
          );
        activity.duration = {
          ...mutation.duration,
          sourceIds: [...mutation.duration.sourceIds],
        };
        break;
      }
      case "SET_CONSTRAINT_STATE": {
        const constraint = constraints[mutation.constraintId];
        if (!constraint)
          throw new Error(
            `Unknown constraint in SET_CONSTRAINT_STATE: ${mutation.constraintId}`,
          );
        constraint.state = mutation.state;
        if (mutation.verification)
          constraint.verification = mutation.verification;
        break;
      }
      case "SET_CONSTRAINT_READINESS": {
        const constraint = constraints[mutation.constraintId];
        if (!constraint)
          throw new Error(
            `Unknown constraint in SET_CONSTRAINT_READINESS: ${mutation.constraintId}`,
          );
        constraint.readiness = { ...mutation.readiness };
        if (mutation.verification)
          constraint.verification = mutation.verification;
        break;
      }
      case "SET_SCHEDULE_LOCK": {
        const activity = activities[mutation.activityId];
        if (!activity)
          throw new Error(
            `Unknown activity in SET_SCHEDULE_LOCK: ${mutation.activityId}`,
          );
        activity.scheduleLock = { ...mutation.lock };
        break;
      }
      case "CLEAR_SCHEDULE_LOCK": {
        const activity = activities[mutation.activityId];
        if (!activity)
          throw new Error(
            `Unknown activity in CLEAR_SCHEDULE_LOCK: ${mutation.activityId}`,
          );
        delete activity.scheduleLock;
        break;
      }
      case "UPSERT_SOURCE":
        sources[mutation.source.id] = cloneSource(mutation.source);
        break;
      case "SUPERSEDE_SOURCE": {
        const source = sources[mutation.sourceId];
        if (!source)
          throw new Error(
            `Unknown source in SUPERSEDE_SOURCE: ${mutation.sourceId}`,
          );
        if (!sources[mutation.supersededBySourceId])
          throw new Error(
            `Unknown superseding source in SUPERSEDE_SOURCE: ${mutation.supersededBySourceId}`,
          );
        if (mutation.sourceId === mutation.supersededBySourceId)
          throw new Error("A source cannot supersede itself");
        source.supersededBySourceId = mutation.supersededBySourceId;
        break;
      }
      case "UPSERT_CONFLICT":
        conflicts[mutation.conflict.id] = cloneConflict(mutation.conflict);
        break;
      case "RESOLVE_CONFLICT": {
        const conflict = conflicts[mutation.conflictId];
        if (!conflict)
          throw new Error(
            `Unknown conflict in RESOLVE_CONFLICT: ${mutation.conflictId}`,
          );
        conflict.status = "RESOLVED";
        conflict.resolutionNote = mutation.resolutionNote;
        break;
      }
      case "UPSERT_COMMERCIAL_SIGNAL":
        commercialSignals[mutation.signal.id] = cloneCommercialSignal(
          mutation.signal,
        );
        break;
      case "UPSERT_WORKLOAD_SIGNAL":
        workloadSignals[mutation.signal.id] = cloneWorkloadSignal(
          mutation.signal,
        );
        break;
      case "UPSERT_ACTIVITY":
        activities[mutation.activity.id] = cloneActivity(mutation.activity);
        break;
      case "UPSERT_CONSTRAINT": {
        constraints[mutation.constraint.id] = cloneConstraint(
          mutation.constraint,
        );
        const owner = activities[mutation.constraint.activityId];
        if (!owner)
          throw new Error(
            `UPSERT_CONSTRAINT references unknown activity ${mutation.constraint.activityId}`,
          );
        if (!owner.constraintIds.includes(mutation.constraint.id))
          owner.constraintIds.push(mutation.constraint.id);
        break;
      }
      case "UPSERT_DEPENDENCY":
        dependencies[mutation.dependency.id] = cloneDependency(
          mutation.dependency,
        );
        break;
      case "DEACTIVATE_DEPENDENCY": {
        const dependency = dependencies[mutation.dependencyId];
        if (!dependency)
          throw new Error(
            `Unknown dependency in DEACTIVATE_DEPENDENCY: ${mutation.dependencyId}`,
          );
        dependency.active = false;
        break;
      }
      case "UPSERT_SCOPE_ITEM":
        scopeItems[mutation.scopeItem.id] = cloneScopeItem(mutation.scopeItem);
        break;
      case "DEACTIVATE_SCOPE_ITEM": {
        const scopeItem = scopeItems[mutation.scopeItemId];
        if (!scopeItem)
          throw new Error(
            `Unknown scope item in DEACTIVATE_SCOPE_ITEM: ${mutation.scopeItemId}`,
          );
        scopeItem.active = false;
        break;
      }
      case "INITIALIZE_PROJECT_FINANCIALS": {
        // A project's tracked currency is chosen once, permanently -- re-initializing (even to
        // the same currency) would imply the choice is revisable, and a different currency would
        // be an invented FX conversion. Both are rejected the same way: this op only ever runs
        // once per project.
        if (financials) {
          throw new Error(
            "Project financials are already initialized and cannot be re-initialized",
          );
        }
        financials = {
          currency: mutation.currency,
          baselineSourceIds: [],
          categories: {},
          budgetLines: {},
          commitments: {},
          actualCosts: {},
          changeOrders: {},
        };
        break;
      }
      case "SET_PROJECT_FINANCIAL_BASELINE": {
        // Correction 10: setting/correcting the baseline never creates a budget category as a
        // side effect -- only `baseline`/`baselineSetAt`/`baselineSourceIds` are touched here.
        const current = requireFinancials("SET_PROJECT_FINANCIAL_BASELINE");
        current.baseline = cloneMoney(mutation.baseline);
        current.baselineSetAt = event.occurredAt;
        current.baselineSourceIds = [...event.sourceIds];
        break;
      }
      case "UPSERT_BUDGET_CATEGORY": {
        const current = requireFinancials("UPSERT_BUDGET_CATEGORY");
        current.categories[mutation.category.id] = cloneBudgetCategory(
          mutation.category,
        );
        break;
      }
      case "DEACTIVATE_BUDGET_CATEGORY": {
        const current = requireFinancials("DEACTIVATE_BUDGET_CATEGORY");
        const category = current.categories[mutation.categoryId];
        if (!category)
          throw new Error(
            `Unknown budget category in DEACTIVATE_BUDGET_CATEGORY: ${mutation.categoryId}`,
          );
        category.active = false;
        break;
      }
      case "UPSERT_BUDGET_LINE": {
        const current = requireFinancials("UPSERT_BUDGET_LINE");
        if (!current.categories[mutation.budgetLine.categoryId]) {
          throw new Error(
            `UPSERT_BUDGET_LINE references unknown budget category ${mutation.budgetLine.categoryId}`,
          );
        }
        current.budgetLines[mutation.budgetLine.id] = cloneBudgetLine(
          mutation.budgetLine,
        );
        break;
      }
      case "DEACTIVATE_BUDGET_LINE": {
        const current = requireFinancials("DEACTIVATE_BUDGET_LINE");
        const line = current.budgetLines[mutation.budgetLineId];
        if (!line)
          throw new Error(
            `Unknown budget line in DEACTIVATE_BUDGET_LINE: ${mutation.budgetLineId}`,
          );
        line.active = false;
        break;
      }
      case "UPSERT_COMMITMENT": {
        const current = requireFinancials("UPSERT_COMMITMENT");
        current.commitments[mutation.commitment.id] = cloneCommitment(
          mutation.commitment,
        );
        break;
      }
      case "UPSERT_ACTUAL_COST": {
        const current = requireFinancials("UPSERT_ACTUAL_COST");
        current.actualCosts[mutation.actualCost.id] = cloneActualCost(
          mutation.actualCost,
        );
        break;
      }
      case "UPSERT_CHANGE_ORDER": {
        const current = requireFinancials("UPSERT_CHANGE_ORDER");
        const previous = current.changeOrders[mutation.changeOrder.id];
        assertLegalChangeOrderTransition(
          mutation.changeOrder.id,
          previous,
          mutation.changeOrder,
        );
        current.changeOrders[mutation.changeOrder.id] = cloneChangeOrder(
          mutation.changeOrder,
        );
        break;
      }
      default: {
        const exhaustive: never = mutation;
        throw new Error(
          `Unhandled mutation ${(exhaustive as { op?: string }).op ?? "unknown"}`,
        );
      }
    }
  }
  return {
    ...model,
    activities,
    constraints,
    dependencies,
    sources,
    conflicts,
    commercialSignals,
    workloadSignals,
    scopeItems,
    ...(financials ? { financials } : {}),
  };
}
