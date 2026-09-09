import { assertISODate } from "../engine/date";
import { buildGraphIndex } from "../engine/graph";
import { isSupportedCurrency, isValidMoney } from "./money";
import type { MoneyV097, ProjectModelV094 } from "./types";

function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
}

const DURATION_LABELS = ["optimistic", "likely", "conservative"] as const;

export function validateProjectModel(model: ProjectModelV094): void {
  if (!model.projectId) throw new Error("projectId is required");
  if (!Number.isInteger(model.revision) || model.revision < 0) {
    throw new Error("project revision must be an integer >= 0");
  }
  if (!model.name) throw new Error("project name is required");
  assertISODate(model.forecastAnchorDate);
  if (model.calendar.workingWeekdays.length === 0) {
    throw new Error("Work calendar must contain at least one working weekday");
  }
  if (
    new Set(model.calendar.workingWeekdays).size !==
      model.calendar.workingWeekdays.length ||
    model.calendar.workingWeekdays.some(
      (d) => !Number.isInteger(d) || d < 0 || d > 6,
    )
  ) {
    throw new Error(
      "Work calendar weekdays must be unique integers from 0 through 6",
    );
  }
  for (const holiday of model.calendar.holidays) assertISODate(holiday);

  for (const source of Object.values(model.sources)) {
    assertUnitInterval(source.authority, `source ${source.id} authority`);
    assertUnitInterval(source.reliability, `source ${source.id} reliability`);
    if (
      source.supersededBySourceId &&
      !model.sources[source.supersededBySourceId]
    ) {
      throw new Error(
        `Source ${source.id} references unknown superseding source ${source.supersededBySourceId}`,
      );
    }
  }

  for (const activity of Object.values(model.activities)) {
    const d = activity.duration;
    for (const label of DURATION_LABELS) {
      const value = d[label];
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(
          `Activity ${activity.id} duration ${label} must be an integer >= 1`,
        );
      }
    }
    if (!(d.optimistic <= d.likely && d.likely <= d.conservative)) {
      throw new Error(
        `Activity ${activity.id} duration estimates must satisfy optimistic <= likely <= conservative`,
      );
    }
    for (const constraintId of activity.constraintIds) {
      const c = model.constraints[constraintId];
      if (!c)
        throw new Error(
          `Activity ${activity.id} references unknown constraint ${constraintId}`,
        );
      if (c.activityId !== activity.id)
        throw new Error(
          `Constraint ${constraintId} is attached to the wrong activity`,
        );
    }
    for (const sourceId of [
      ...activity.sourceIds,
      ...activity.duration.sourceIds,
    ]) {
      if (!model.sources[sourceId])
        throw new Error(
          `Activity ${activity.id} references unknown source ${sourceId}`,
        );
    }
    if (activity.actualStart) assertISODate(activity.actualStart);
    if (activity.actualFinish) assertISODate(activity.actualFinish);
    for (const sourceId of activity.actualStartSourceIds ?? []) {
      if (!model.sources[sourceId])
        throw new Error(
          `Activity ${activity.id} actualStart references unknown source ${sourceId}`,
        );
    }
    for (const sourceId of activity.actualFinishSourceIds ?? []) {
      if (!model.sources[sourceId])
        throw new Error(
          `Activity ${activity.id} actualFinish references unknown source ${sourceId}`,
        );
    }
    if (activity.actualStart && !activity.actualStartVerification) {
      throw new Error(
        `Activity ${activity.id} actualStart is missing verification status`,
      );
    }
    if (activity.actualFinish && !activity.actualFinishVerification) {
      throw new Error(
        `Activity ${activity.id} actualFinish is missing verification status`,
      );
    }
    if (activity.actualFinish && !activity.actualStart) {
      throw new Error(
        `Activity ${activity.id} has actualFinish without actualStart`,
      );
    }
    if (
      activity.actualStart &&
      activity.actualFinish &&
      activity.actualFinish < activity.actualStart
    ) {
      throw new Error(
        `Activity ${activity.id} actualFinish is before actualStart`,
      );
    }
    if (activity.scheduleLock?.startDate)
      assertISODate(activity.scheduleLock.startDate);
    if (activity.scheduleLock?.finishDate)
      assertISODate(activity.scheduleLock.finishDate);
    if (
      activity.scheduleLock?.startDate &&
      activity.scheduleLock.finishDate &&
      activity.scheduleLock.finishDate < activity.scheduleLock.startDate
    ) {
      throw new Error(
        `Activity ${activity.id} schedule lock finish precedes start`,
      );
    }
    if (
      activity.scheduleLock &&
      !model.sources[activity.scheduleLock.sourceId]
    ) {
      throw new Error(
        `Activity ${activity.id} schedule lock references unknown source ${activity.scheduleLock.sourceId}`,
      );
    }
  }

  for (const constraint of Object.values(model.constraints)) {
    if (!model.activities[constraint.activityId]) {
      throw new Error(
        `Constraint ${constraint.id} references unknown activity`,
      );
    }
    for (const sourceId of constraint.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Constraint ${constraint.id} references unknown source ${sourceId}`,
        );
    }
    if (constraint.readiness) {
      assertISODate(constraint.readiness.optimistic);
      assertISODate(constraint.readiness.likely);
      assertISODate(constraint.readiness.conservative);
      if (!(
        constraint.readiness.optimistic <= constraint.readiness.likely &&
        constraint.readiness.likely <= constraint.readiness.conservative
      )) {
        throw new Error(
          `Constraint ${constraint.id} readiness window is out of order`,
        );
      }
    }
  }

  for (const dependency of Object.values(model.dependencies)) {
    for (const sourceId of dependency.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Dependency ${dependency.id} references unknown source ${sourceId}`,
        );
    }
  }

  if (model.revision !== model.eventLedger.length) {
    throw new Error(
      `Project revision ${String(model.revision)} does not match immutable event ledger length ${String(model.eventLedger.length)}`,
    );
  }

  for (const conflict of Object.values(model.conflicts ?? {})) {
    for (const activityId of conflict.activityIds) {
      if (!model.activities[activityId])
        throw new Error(
          `Conflict ${conflict.id} references unknown activity ${activityId}`,
        );
    }
    for (const sourceId of conflict.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Conflict ${conflict.id} references unknown source ${sourceId}`,
        );
    }
  }

  for (const signal of Object.values(model.commercialSignals ?? {})) {
    if (!Number.isFinite(signal.amount) || signal.amount < 0) {
      throw new Error(`Commercial signal ${signal.id} has invalid amount`);
    }
    for (const activityId of signal.activityIds) {
      if (!model.activities[activityId])
        throw new Error(
          `Commercial signal ${signal.id} references unknown activity ${activityId}`,
        );
    }
    for (const sourceId of signal.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Commercial signal ${signal.id} references unknown source ${sourceId}`,
        );
    }
  }

  for (const signal of Object.values(model.workloadSignals ?? {})) {
    if (!Number.isFinite(signal.value) || signal.value < 0) {
      throw new Error(`Workload signal ${signal.id} has invalid value`);
    }
    for (const activityId of signal.activityIds) {
      if (!model.activities[activityId])
        throw new Error(
          `Workload signal ${signal.id} references unknown activity ${activityId}`,
        );
    }
    for (const sourceId of signal.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Workload signal ${signal.id} references unknown source ${sourceId}`,
        );
    }
  }

  const SCOPE_STATUSES = new Set([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "BLOCKED",
    "NOT_APPLICABLE",
  ]);
  for (const item of Object.values(model.scopeItems ?? {})) {
    if (!item.description.trim()) {
      throw new Error(`Scope item ${item.id} is missing a description`);
    }
    if (!SCOPE_STATUSES.has(item.status)) {
      throw new Error(
        `Scope item ${item.id} has invalid status ${item.status}`,
      );
    }
    for (const activityId of item.activityIds) {
      if (!model.activities[activityId])
        throw new Error(
          `Scope item ${item.id} references unknown activity ${activityId}`,
        );
    }
    for (const sourceId of item.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Scope item ${item.id} references unknown source ${sourceId}`,
        );
    }
    if (item.allowance) {
      if (
        !Number.isFinite(item.allowance.amount) ||
        item.allowance.amount < 0
      ) {
        throw new Error(
          `Scope item ${item.id} allowance amount must be a non-negative finite number`,
        );
      }
      if (!item.allowance.currency) {
        throw new Error(`Scope item ${item.id} allowance is missing currency`);
      }
    }
    if (
      item.allowanceBudgetLineId &&
      !model.financials?.budgetLines[item.allowanceBudgetLineId]
    ) {
      throw new Error(
        `Scope item ${item.id} references unknown budget line ${item.allowanceBudgetLineId}`,
      );
    }
  }

  // Phase 4 (Howler Recovery Directive, Budget + Change Orders, corrected plan): a project tracks
  // money in exactly one currency (`financials.currency`) -- no invented FX conversion. Every
  // MoneyV097 value reachable from `financials` must both be individually valid (supported
  // currency, safe-integer minor units) AND share that one project currency exactly; a
  // budget line priced in a different-but-otherwise-valid currency is still rejected.
  if (model.financials) {
    const fin = model.financials;
    if (!isSupportedCurrency(fin.currency)) {
      throw new Error(
        `Project financials currency "${fin.currency}" is not supported`,
      );
    }
    function assertOwnCurrency(label: string, money: MoneyV097): void {
      if (!isValidMoney(money)) {
        throw new Error(`${label} is not a valid money amount`);
      }
      if (money.currency !== fin.currency) {
        throw new Error(
          `${label} currency ${money.currency} does not match the project's tracked currency ${fin.currency}`,
        );
      }
    }
    // Correction 5/6: partial/unallocated allocation is legal -- this only rejects
    // OVER-allocation (allocations summing beyond the total), never under-allocation.
    function assertAllocationsWithinTotal(
      label: string,
      total: MoneyV097,
      allocations: { budgetLineId: string; amount: MoneyV097 }[],
    ): void {
      let allocated = 0;
      for (const allocation of allocations) {
        assertOwnCurrency(
          `${label} allocation to ${allocation.budgetLineId}`,
          allocation.amount,
        );
        if (!fin.budgetLines[allocation.budgetLineId]) {
          throw new Error(
            `${label} allocation references unknown budget line ${allocation.budgetLineId}`,
          );
        }
        allocated += allocation.amount.amountMinor;
      }
      const overAllocated =
        total.amountMinor >= 0
          ? allocated > total.amountMinor
          : allocated < total.amountMinor;
      if (overAllocated) {
        throw new Error(
          `${label} allocations (${String(allocated)}) exceed its total amount (${String(total.amountMinor)})`,
        );
      }
    }

    // Correction 2/3: baseline is optional -- "Unknown," never fabricated as $0.
    if (fin.baseline) {
      assertOwnCurrency("Project financial baseline", fin.baseline);
    }
    for (const sourceId of fin.baselineSourceIds) {
      if (!model.sources[sourceId]) {
        throw new Error(
          `Project financial baseline references unknown source ${sourceId}`,
        );
      }
    }

    for (const cat of Object.values(fin.categories)) {
      if (!cat.name.trim()) {
        throw new Error(`Budget category ${cat.id} is missing a name`);
      }
      for (const sourceId of cat.sourceIds) {
        if (!model.sources[sourceId]) {
          throw new Error(
            `Budget category ${cat.id} references unknown source ${sourceId}`,
          );
        }
      }
    }

    for (const line of Object.values(fin.budgetLines)) {
      if (!line.description.trim()) {
        throw new Error(`Budget line ${line.id} is missing a description`);
      }
      if (!fin.categories[line.categoryId]) {
        throw new Error(
          `Budget line ${line.id} references unknown budget category ${line.categoryId}`,
        );
      }
      // Correction 2/3: baselineAmount is optional -- "Unknown," never fabricated as $0.
      if (line.baselineAmount) {
        assertOwnCurrency(
          `Budget line ${line.id} baselineAmount`,
          line.baselineAmount,
        );
      }
      for (const scopeItemId of line.scopeItemIds) {
        if (!model.scopeItems?.[scopeItemId]) {
          throw new Error(
            `Budget line ${line.id} references unknown scope item ${scopeItemId}`,
          );
        }
      }
      for (const sourceId of line.sourceIds) {
        if (!model.sources[sourceId]) {
          throw new Error(
            `Budget line ${line.id} references unknown source ${sourceId}`,
          );
        }
      }
    }

    const COMMITMENT_STATUSES = new Set(["ACTIVE", "VOID"]);
    for (const c of Object.values(fin.commitments)) {
      assertOwnCurrency(`Commitment ${c.id} amount`, c.amount);
      if (!COMMITMENT_STATUSES.has(c.status)) {
        throw new Error(`Commitment ${c.id} has invalid status ${c.status}`);
      }
      assertAllocationsWithinTotal(
        `Commitment ${c.id}`,
        c.amount,
        c.allocations,
      );
      if (c.activityId && !model.activities[c.activityId]) {
        throw new Error(
          `Commitment ${c.id} references unknown activity ${c.activityId}`,
        );
      }
      for (const scopeItemId of c.scopeItemIds) {
        if (!model.scopeItems?.[scopeItemId]) {
          throw new Error(
            `Commitment ${c.id} references unknown scope item ${scopeItemId}`,
          );
        }
      }
      for (const sourceId of c.sourceIds) {
        if (!model.sources[sourceId]) {
          throw new Error(
            `Commitment ${c.id} references unknown source ${sourceId}`,
          );
        }
      }
    }

    const ACTUAL_COST_STATUSES = new Set(["RECORDED", "VOID"]);
    for (const actual of Object.values(fin.actualCosts)) {
      assertOwnCurrency(`Actual cost ${actual.id} amount`, actual.amount);
      assertISODate(actual.date);
      if (!actual.description.trim()) {
        throw new Error(`Actual cost ${actual.id} is missing a description`);
      }
      if (!ACTUAL_COST_STATUSES.has(actual.status)) {
        throw new Error(
          `Actual cost ${actual.id} has invalid status ${actual.status}`,
        );
      }
      // Correction 6: budgetLineId is optional -- an unallocated actual cost is a real, valid
      // state, never coerced onto a guessed line.
      if (actual.budgetLineId && !fin.budgetLines[actual.budgetLineId]) {
        throw new Error(
          `Actual cost ${actual.id} references unknown budget line ${actual.budgetLineId}`,
        );
      }
      if (actual.commitmentId && !fin.commitments[actual.commitmentId]) {
        throw new Error(
          `Actual cost ${actual.id} references unknown commitment ${actual.commitmentId}`,
        );
      }
      for (const sourceId of actual.sourceIds) {
        if (!model.sources[sourceId]) {
          throw new Error(
            `Actual cost ${actual.id} references unknown source ${sourceId}`,
          );
        }
      }
    }

    const CHANGE_ORDER_STATUSES = new Set([
      "DRAFT",
      "PROPOSED",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "VOID",
    ]);
    for (const co of Object.values(fin.changeOrders)) {
      if (!co.title.trim()) {
        throw new Error(`Change order ${co.id} is missing a title`);
      }
      if (!CHANGE_ORDER_STATUSES.has(co.status)) {
        throw new Error(
          `Change order ${co.id} has invalid status ${co.status}`,
        );
      }
      assertOwnCurrency(`Change order ${co.id} cost`, co.cost);
      assertAllocationsWithinTotal(
        `Change order ${co.id}`,
        co.cost,
        co.costAllocations,
      );
      if (co.categoryId && !fin.categories[co.categoryId]) {
        throw new Error(
          `Change order ${co.id} references unknown budget category ${co.categoryId}`,
        );
      }
      for (const scopeItemId of co.scopeItemIds) {
        if (!model.scopeItems?.[scopeItemId]) {
          throw new Error(
            `Change order ${co.id} references unknown scope item ${scopeItemId}`,
          );
        }
      }
      for (const activityId of co.activityIds) {
        if (!model.activities[activityId]) {
          throw new Error(
            `Change order ${co.id} references unknown activity ${activityId}`,
          );
        }
      }
      for (const sourceId of co.sourceIds) {
        if (!model.sources[sourceId]) {
          throw new Error(
            `Change order ${co.id} references unknown source ${sourceId}`,
          );
        }
      }
    }
  }

  if (model.projectProfile) {
    const profile = model.projectProfile;
    const scopeIds = new Set<string>();
    for (const item of profile.baselineScope) {
      if (!item.id)
        throw new Error("Project profile scope item is missing an id");
      if (scopeIds.has(item.id)) {
        throw new Error(`Duplicate project profile scope item id: ${item.id}`);
      }
      scopeIds.add(item.id);
      if (!item.label)
        throw new Error(
          `Project profile scope item ${item.id} is missing a label`,
        );
    }
    if (profile.budget) {
      if (
        profile.budget.baseline !== undefined &&
        (!Number.isFinite(profile.budget.baseline) ||
          profile.budget.baseline < 0)
      ) {
        throw new Error(
          "Project profile budget baseline must be a non-negative finite number",
        );
      }
      if (
        profile.budget.spent !== undefined &&
        (!Number.isFinite(profile.budget.spent) || profile.budget.spent < 0)
      ) {
        throw new Error(
          "Project profile budget spent must be a non-negative finite number",
        );
      }
    }
    // P2/nonblocking (deliberately deferred): this uses the same loose Date.parse-based
    // timestamp check as every other ISODateTime field in the codebase
    // (src/operator/intent.ts's isValidTimestamp), which does accept some non-ISO strings. No
    // stricter canonical ISO-datetime helper exists anywhere else in the codebase today, and
    // inventing one solely for this one field would be a new timestamp subsystem out of scope
    // for this fix. genesisApprovedAt is set internally by buildProjectFromGenesis from
    // `new Date().toISOString()`, not sourced from the untrusted proposal payload, so the
    // practical exposure is low; revisit only if pilot evidence shows it matters.
    if (
      profile.genesisApprovedAt !== undefined &&
      !Number.isFinite(Date.parse(profile.genesisApprovedAt))
    ) {
      throw new Error(
        "Project profile genesisApprovedAt must be a valid ISO date-time",
      );
    }
  }

  const eventIds = new Set<string>();
  for (const [eventIndex, event] of model.eventLedger.entries()) {
    if (eventIds.has(event.id))
      throw new Error(`Duplicate event ID in ledger: ${event.id}`);
    eventIds.add(event.id);
    if (
      !Number.isFinite(Date.parse(event.occurredAt)) ||
      !Number.isFinite(Date.parse(event.receivedAt))
    ) {
      throw new Error(`Event ${event.id} has invalid timestamps`);
    }
    if (event.projectId !== model.projectId)
      throw new Error(`Event ${event.id} belongs to a different project`);
    if (!Number.isInteger(event.baseRevision) || event.baseRevision < 0) {
      throw new Error(`Event ${event.id} has invalid baseRevision`);
    }
    if (event.baseRevision !== eventIndex) {
      throw new Error(
        `Event ${event.id} baseRevision ${String(event.baseRevision)} does not match ledger position ${String(eventIndex)}`,
      );
    }
    for (const sourceId of event.sourceIds) {
      if (!model.sources[sourceId])
        throw new Error(
          `Event ${event.id} references unknown source ${sourceId}`,
        );
    }
    for (const activityId of event.impactSeedActivityIds) {
      if (!model.activities[activityId])
        throw new Error(
          `Event ${event.id} references unknown impact seed ${activityId}`,
        );
    }
  }

  buildGraphIndex(model);
}
