import type {
  ActivityV094,
  CommercialSignalV094,
  ConflictV094,
  ConstraintV094,
  DependencyV094,
  ProjectEventV094,
  ProjectModelV094,
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
  };
}
