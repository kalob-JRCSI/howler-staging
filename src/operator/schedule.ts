// Phase 2 (Howler Recovery Directive, Editable Project Schedule): a manual PM control surface
// built entirely on top of the existing event-sourced kernel. This file adds no new mutation
// ops, no new persistence path, and no new forecasting logic -- it is a pure, testable
// translation layer in both directions:
//
//   buildScheduleView:  ProjectModelV094 + ForecastSnapshotV094 -> the full schedule read model
//                        the Index Card Schedule module renders (mirrors project-summary.ts's
//                        own "derive, never persist" pattern).
//   buildScheduleEvent: a small, typed ScheduleCommandV096 -> a well-formed ProjectEventV094
//                        (correct baseRevision, a freshly synthesized Source so referential
//                        integrity holds, and the exact EventMutationV094 variant(s) the reducer
//                        already knows how to apply). The caller hands this event to the exact
//                        same reviewedRun/commitShadowTransition pipeline every other event in
//                        this codebase already goes through -- this is not a second schedule
//                        source of truth, it is ergonomics over the one that already exists.

import type {
  ActivityState,
  ActivityV094,
  DependencyV094,
  DurationEstimateV094,
  ISODate,
  ISODateTime,
  ProjectEventV094,
  ProjectModelV094,
  SourceV094,
} from "../domain/types";
import type { ForecastSnapshotV094 } from "../engine/solver";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface ScheduleDependencyRefV096 {
  dependencyId: string;
  activityId: string;
  activityName: string;
  type: string;
  lagWorkdays: number;
  hard: boolean;
  reason: string;
}

export interface ScheduleConstraintRefV096 {
  constraintId: string;
  type: string;
  label: string;
  state: string;
  hard: boolean;
}

export interface ScheduleActivityV096 {
  activityId: string;
  name: string;
  phase: string;
  state: ActivityState;
  // Derived only from an existing TRADE_AVAILABILITY constraint's label on this activity.
  // `null` (never a fabricated guess) when no such constraint exists.
  trade: string | null;
  duration: { optimistic: number; likely: number; conservative: number };
  committedStart: ISODate | null;
  committedFinish: ISODate | null;
  forecastStart: ISODate | null;
  forecastFinish: ISODate | null;
  actualStart: ISODate | null;
  actualFinish: ISODate | null;
  isLocked: boolean;
  critical: boolean | null;
  floatWorkdays: number | null;
  predecessors: ScheduleDependencyRefV096[];
  successors: ScheduleDependencyRefV096[];
  constraints: ScheduleConstraintRefV096[];
  warnings: string[];
}

export interface ProjectScheduleV096 {
  projectId: string;
  projectRevision: number;
  forecastVersion: number | null;
  activities: ScheduleActivityV096[];
}

function tradeLabelFor(
  model: ProjectModelV094,
  activity: ActivityV094,
): string | null {
  for (const constraintId of activity.constraintIds) {
    const constraint = model.constraints[constraintId];
    if (constraint?.type === "TRADE_AVAILABILITY") return constraint.label;
  }
  return null;
}

function dependencyRefs(
  model: ProjectModelV094,
  activityId: string,
  direction: "predecessors" | "successors",
): ScheduleDependencyRefV096[] {
  const refs: ScheduleDependencyRefV096[] = [];
  for (const dependency of Object.values(model.dependencies)) {
    if (!dependency.active) continue;
    const otherId =
      direction === "predecessors"
        ? dependency.successorId === activityId
          ? dependency.predecessorId
          : null
        : dependency.predecessorId === activityId
          ? dependency.successorId
          : null;
    if (otherId === null) continue;
    const other = model.activities[otherId];
    refs.push({
      dependencyId: dependency.id,
      activityId: otherId,
      activityName: other?.name ?? otherId,
      type: dependency.type,
      lagWorkdays: dependency.lagWorkdays,
      hard: dependency.hard,
      reason: dependency.reason,
    });
  }
  return refs;
}

function constraintRefs(
  model: ProjectModelV094,
  activity: ActivityV094,
): ScheduleConstraintRefV096[] {
  return activity.constraintIds
    .map((id) => model.constraints[id])
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      constraintId: c.id,
      type: c.type,
      label: c.label,
      state: c.state,
      hard: c.hard,
    }));
}

function buildScheduleActivity(
  model: ProjectModelV094,
  activity: ActivityV094,
  forecast: ForecastSnapshotV094 | undefined,
): ScheduleActivityV096 {
  const activityForecast = forecast?.activityForecasts[activity.id];
  return {
    activityId: activity.id,
    name: activity.name,
    phase: activity.phase,
    state: activity.state,
    trade: tradeLabelFor(model, activity),
    duration: {
      optimistic: activity.duration.optimistic,
      likely: activity.duration.likely,
      conservative: activity.duration.conservative,
    },
    committedStart: activity.scheduleLock?.startDate ?? null,
    committedFinish: activity.scheduleLock?.finishDate ?? null,
    forecastStart: activityForecast?.start.likely ?? null,
    forecastFinish: activityForecast?.finish.likely ?? null,
    actualStart: activity.actualStart ?? null,
    actualFinish: activity.actualFinish ?? null,
    isLocked: Boolean(activity.scheduleLock),
    critical: activityForecast?.critical ?? null,
    floatWorkdays: activityForecast?.likelyFloatWorkdays ?? null,
    predecessors: dependencyRefs(model, activity.id, "predecessors"),
    successors: dependencyRefs(model, activity.id, "successors"),
    constraints: constraintRefs(model, activity),
    warnings: activityForecast?.warnings ?? [],
  };
}

function scheduleSortKey(activity: ScheduleActivityV096): string {
  return (
    activity.committedStart ??
    activity.actualStart ??
    activity.forecastStart ??
    "9999-99-99"
  );
}

/**
 * Pure, cheap, deterministic derivation of the full schedule the Index Card's Schedule module
 * renders. Performs no D1 access and mutates neither `model` nor `forecast`. Any field the
 * canonical state does not (yet) contain for a given activity comes back `null` -- never a
 * fabricated placeholder value.
 */
export function buildScheduleView(
  model: ProjectModelV094,
  forecast: ForecastSnapshotV094 | undefined,
): ProjectScheduleV096 {
  const activities = Object.values(model.activities)
    .map((activity) => buildScheduleActivity(model, activity, forecast))
    .sort(
      (a, b) =>
        scheduleSortKey(a).localeCompare(scheduleSortKey(b)) ||
        a.name.localeCompare(b.name),
    );
  return {
    projectId: model.projectId,
    projectRevision: model.revision,
    forecastVersion: forecast?.version ?? null,
    activities,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface ThreePointInputV096 {
  optimistic: number;
  likely: number;
  conservative: number;
}

export type ScheduleCommandV096 =
  | {
      kind: "ADD_ACTIVITY";
      name: string;
      phase: string;
      duration: ThreePointInputV096;
    }
  | { kind: "RENAME_ACTIVITY"; activityId: string; name: string }
  | { kind: "SET_PHASE"; activityId: string; phase: string }
  | { kind: "SET_DURATION"; activityId: string; duration: ThreePointInputV096 }
  | {
      kind: "SET_COMMITTED_DATES";
      activityId: string;
      startDate?: ISODate;
      finishDate?: ISODate;
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
  | { kind: "SET_ACTUAL_START"; activityId: string; date: ISODate }
  | { kind: "SET_ACTUAL_FINISH"; activityId: string; date: ISODate }
  | { kind: "SET_ACTIVITY_STATE"; activityId: string; state: ActivityState };

export class ScheduleCommandError extends Error {}

function requireActivity(
  model: ProjectModelV094,
  activityId: string,
): ActivityV094 {
  const activity = model.activities[activityId];
  if (!activity) {
    throw new ScheduleCommandError(`Unknown activity: ${activityId}`);
  }
  return activity;
}

function requireDependency(
  model: ProjectModelV094,
  dependencyId: string,
): DependencyV094 {
  const dependency = model.dependencies[dependencyId];
  if (!dependency || !dependency.active) {
    throw new ScheduleCommandError(`Unknown dependency: ${dependencyId}`);
  }
  return dependency;
}

function toDuration(
  input: ThreePointInputV096,
  sourceId: string,
): DurationEstimateV094 {
  if (
    !Number.isInteger(input.optimistic) ||
    !Number.isInteger(input.likely) ||
    !Number.isInteger(input.conservative) ||
    input.optimistic < 1 ||
    input.optimistic > input.likely ||
    input.likely > input.conservative
  ) {
    throw new ScheduleCommandError(
      "Duration must satisfy 1 <= optimistic <= likely <= conservative",
    );
  }
  return { ...input, sourceIds: [sourceId] };
}

interface BuiltScheduleEvent {
  event: ProjectEventV094;
  /** Human-readable line for Activity History -- also carried as event.note. */
  historyNote: string;
}

/**
 * Translates one typed ScheduleCommandV096 into a well-formed ProjectEventV094 against the
 * given (current) canonical model. Pure and synchronous -- no D1, no network, no clock/id
 * globals -- so every command is unit-testable without a running worker. `newId`/`now` are
 * injected exactly like the existing conversational gateway's own
 * `createConversationalClaimGateway(bridge, () => crypto.randomUUID(), Date.now, ...)` pattern.
 */
export function buildScheduleEvent(
  model: ProjectModelV094,
  command: ScheduleCommandV096,
  now: ISODateTime,
  newId: () => string,
): BuiltScheduleEvent {
  const sourceId = newId();
  const effectiveDate = now.slice(0, 10);

  function source(label: string): SourceV094 {
    return {
      id: sourceId,
      type: "PM_SCHEDULE_EDIT",
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
    impactSeedActivityIds: string[],
    mutations: ProjectEventV094["mutations"],
  ): BuiltScheduleEvent {
    return {
      historyNote,
      event: {
        id: newId(),
        baseRevision: model.revision,
        projectId: model.projectId,
        type,
        occurredAt: now,
        receivedAt: now,
        sourceIds: [sourceId],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds,
        mutations: [
          { op: "UPSERT_SOURCE", source: source(historyNote) },
          ...mutations,
        ],
        payload: { scheduleCommand: command },
        note: historyNote,
      },
    };
  }

  switch (command.kind) {
    case "ADD_ACTIVITY": {
      if (!command.name.trim()) {
        throw new ScheduleCommandError("Activity name is required");
      }
      const activityId = newId();
      const duration = toDuration(command.duration, sourceId);
      const activity: ActivityV094 = {
        id: activityId,
        name: command.name.trim(),
        phase: command.phase,
        state: "NOT_STARTED",
        duration,
        constraintIds: [],
        sourceIds: [sourceId],
      };
      return finish(
        "SCHEDULE_ACTIVITY_ADDED",
        `Added activity "${activity.name}".`,
        [activityId],
        [{ op: "UPSERT_ACTIVITY", activity }],
      );
    }

    case "RENAME_ACTIVITY": {
      const activity = requireActivity(model, command.activityId);
      if (!command.name.trim()) {
        throw new ScheduleCommandError("Activity name is required");
      }
      return finish(
        "SCHEDULE_ACTIVITY_RENAMED",
        `Renamed "${activity.name}" to "${command.name.trim()}".`,
        [activity.id],
        [
          {
            op: "UPSERT_ACTIVITY",
            activity: { ...activity, name: command.name.trim() },
          },
        ],
      );
    }

    case "SET_PHASE": {
      const activity = requireActivity(model, command.activityId);
      return finish(
        "SCHEDULE_PHASE_CHANGED",
        `Moved "${activity.name}" from phase "${activity.phase}" to "${command.phase}".`,
        [activity.id],
        [
          {
            op: "UPSERT_ACTIVITY",
            activity: { ...activity, phase: command.phase },
          },
        ],
      );
    }

    case "SET_DURATION": {
      const activity = requireActivity(model, command.activityId);
      const duration = toDuration(command.duration, sourceId);
      return finish(
        "SCHEDULE_DURATION_CHANGED",
        `Duration for "${activity.name}" changed to ${String(duration.likely)}d (${String(duration.optimistic)}-${String(duration.conservative)}).`,
        [activity.id],
        [{ op: "SET_DURATION", activityId: activity.id, duration }],
      );
    }

    case "SET_COMMITTED_DATES": {
      const activity = requireActivity(model, command.activityId);
      if (!command.startDate && !command.finishDate) {
        throw new ScheduleCommandError(
          "At least one of startDate or finishDate is required",
        );
      }
      const startDate = command.startDate ?? activity.scheduleLock?.startDate;
      const finishDate =
        command.finishDate ?? activity.scheduleLock?.finishDate;
      if (startDate && finishDate && finishDate < startDate) {
        throw new ScheduleCommandError(
          "Committed finish cannot precede committed start",
        );
      }
      const fromStart = activity.scheduleLock?.startDate ?? "unset";
      const fromFinish = activity.scheduleLock?.finishDate ?? "unset";
      return finish(
        "SCHEDULE_COMMITTED_DATE_CHANGED",
        `Committed dates for "${activity.name}" changed: start ${fromStart} -> ${startDate ?? "unset"}, finish ${fromFinish} -> ${finishDate ?? "unset"}.`,
        [activity.id],
        [
          {
            op: "SET_SCHEDULE_LOCK",
            activityId: activity.id,
            lock: {
              ...(startDate ? { startDate } : {}),
              ...(finishDate ? { finishDate } : {}),
              sourceId,
            },
          },
        ],
      );
    }

    case "CLEAR_COMMITTED_DATES": {
      const activity = requireActivity(model, command.activityId);
      if (!activity.scheduleLock) {
        throw new ScheduleCommandError(
          `"${activity.name}" has no committed dates to clear`,
        );
      }
      return finish(
        "SCHEDULE_COMMITMENT_CLEARED",
        `Cleared committed dates for "${activity.name}".`,
        [activity.id],
        [{ op: "CLEAR_SCHEDULE_LOCK", activityId: activity.id }],
      );
    }

    case "ADD_DEPENDENCY": {
      const predecessor = requireActivity(model, command.predecessorId);
      const successor = requireActivity(model, command.successorId);
      if (predecessor.id === successor.id) {
        throw new ScheduleCommandError("An activity cannot depend on itself");
      }
      const dependencyId = newId();
      const dependency: DependencyV094 = {
        id: dependencyId,
        active: true,
        predecessorId: predecessor.id,
        successorId: successor.id,
        type: command.type,
        lagWorkdays: command.lagWorkdays,
        hard: command.hard,
        reason: command.reason,
        sourceIds: [sourceId],
      };
      return finish(
        "SCHEDULE_DEPENDENCY_ADDED",
        `Added dependency: "${successor.name}" now depends on "${predecessor.name}".`,
        [predecessor.id, successor.id],
        [{ op: "UPSERT_DEPENDENCY", dependency }],
      );
    }

    case "REMOVE_DEPENDENCY": {
      const dependency = requireDependency(model, command.dependencyId);
      const predecessorName =
        model.activities[dependency.predecessorId]?.name ??
        dependency.predecessorId;
      const successorName =
        model.activities[dependency.successorId]?.name ??
        dependency.successorId;
      return finish(
        "SCHEDULE_DEPENDENCY_REMOVED",
        `Removed dependency: "${successorName}" no longer depends on "${predecessorName}".`,
        [dependency.predecessorId, dependency.successorId],
        [{ op: "DEACTIVATE_DEPENDENCY", dependencyId: dependency.id }],
      );
    }

    case "EDIT_DEPENDENCY": {
      const dependency = requireDependency(model, command.dependencyId);
      const updated: DependencyV094 = {
        ...dependency,
        type: command.type ?? dependency.type,
        lagWorkdays: command.lagWorkdays ?? dependency.lagWorkdays,
        hard: command.hard ?? dependency.hard,
        reason: command.reason ?? dependency.reason,
        sourceIds: [sourceId],
      };
      const successorName =
        model.activities[dependency.successorId]?.name ??
        dependency.successorId;
      return finish(
        "SCHEDULE_DEPENDENCY_EDITED",
        `Edited dependency feeding "${successorName}".`,
        [dependency.predecessorId, dependency.successorId],
        [{ op: "UPSERT_DEPENDENCY", dependency: updated }],
      );
    }

    case "SET_ACTUAL_START": {
      const activity = requireActivity(model, command.activityId);
      return finish(
        "SCHEDULE_ACTUAL_START_RECORDED",
        `Recorded actual start for "${activity.name}": ${command.date}.`,
        [activity.id],
        [
          {
            op: "SET_ACTUAL_START",
            activityId: activity.id,
            date: command.date,
          },
        ],
      );
    }

    case "SET_ACTUAL_FINISH": {
      const activity = requireActivity(model, command.activityId);
      if (!activity.actualStart) {
        throw new ScheduleCommandError(
          `"${activity.name}" has no actual start recorded yet`,
        );
      }
      if (command.date < activity.actualStart) {
        throw new ScheduleCommandError(
          "Actual finish cannot precede actual start",
        );
      }
      return finish(
        "SCHEDULE_ACTUAL_FINISH_RECORDED",
        `Recorded actual finish for "${activity.name}": ${command.date}.`,
        [activity.id],
        [
          {
            op: "SET_ACTUAL_FINISH",
            activityId: activity.id,
            date: command.date,
          },
        ],
      );
    }

    case "SET_ACTIVITY_STATE": {
      const activity = requireActivity(model, command.activityId);
      return finish(
        "SCHEDULE_ACTIVITY_STATE_CHANGED",
        `Changed state of "${activity.name}" from ${activity.state} to ${command.state}.`,
        [activity.id],
        [
          {
            op: "SET_ACTIVITY_STATE",
            activityId: activity.id,
            state: command.state,
          },
        ],
      );
    }

    default: {
      const exhaustive: never = command;
      throw new ScheduleCommandError(
        `Unhandled schedule command: ${(exhaustive as { kind?: string }).kind ?? "unknown"}`,
      );
    }
  }
}
