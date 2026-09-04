import { assertISODate } from "../engine/date";
import { buildGraphIndex } from "../engine/graph";
import type { ProjectModelV094 } from "./types";

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
