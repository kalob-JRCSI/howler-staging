// Transcribed from baseline commit d851357bd08a795df3508ff610da9eaa1c386a43 (worker.js); unclosed categorical fields stay `string` rather than a guessed union.

export type ISODate = string;
export type ISODateTime = string;

export type ActivityState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type VerificationState =
  | "UNVERIFIED"
  | "STALE_REVERIFY"
  | "PM_CONFIRMED"
  | "CORROBORATED"
  | "FIELD_VERIFIED"
  | "VERIFIED_ACTUAL";

export interface DurationEstimateV094 {
  optimistic: number;
  likely: number;
  conservative: number;
  sourceIds: string[];
}

export interface ScheduleLockV094 {
  startDate?: ISODate;
  finishDate?: ISODate;
  sourceId: string;
}

export interface ConstraintReadinessV094 {
  optimistic: ISODate;
  likely: ISODate;
  conservative: ISODate;
}

export interface SourceV094 {
  id: string;
  type: string;
  label: string;
  observedAt: ISODateTime;
  authority: number;
  reliability: number;
  effectiveDate?: ISODate;
  supersededBySourceId?: string;
}

export interface ActivityV094 {
  id: string;
  name: string;
  phase: string;
  state: ActivityState;
  duration: DurationEstimateV094;
  constraintIds: string[];
  sourceIds: string[];
  actualStart?: ISODate;
  actualStartSourceIds?: string[];
  actualStartVerification?: VerificationState;
  actualFinish?: ISODate;
  actualFinishSourceIds?: string[];
  actualFinishVerification?: VerificationState;
  scheduleLock?: ScheduleLockV094;
  tags?: string[];
}

export interface ConstraintV094 {
  id: string;
  activityId: string;
  type: string;
  label: string;
  state: string;
  hard: boolean;
  readiness?: ConstraintReadinessV094;
  sourceIds: string[];
  verification: VerificationState;
}

export interface DependencyV094 {
  id: string;
  active: boolean;
  predecessorId: string;
  successorId: string;
  type: string;
  lagWorkdays: number;
  hard: boolean;
  reason: string;
  sourceIds: string[];
}

export interface ConflictV094 {
  id: string;
  category: string;
  description: string;
  activityIds: string[];
  sourceIds: string[];
  severity: string;
  status: string;
  resolutionNote?: string;
}

export interface CommercialSignalV094 {
  id: string;
  kind: string;
  activityIds: string[];
  workPackage: string;
  amount: number;
  currency: string;
  selected: boolean;
  scopeCoverage: string;
  sourceIds: string[];
}

export interface WorkloadSignalV094 {
  id: string;
  activityIds: string[];
  dimension: string;
  value: number;
  unit: string;
  label: string;
  sourceIds: string[];
}

export interface WorkCalendarV094 {
  workingWeekdays: number[];
  holidays: ISODate[];
}

export interface ProjectEventV094 {
  id: string;
  baseRevision: number;
  projectId: string;
  type: string;
  occurredAt: ISODateTime;
  receivedAt: ISODateTime;
  sourceIds: string[];
  verification: VerificationState;
  impactSeedActivityIds: string[];
  mutations: EventMutationV094[];
  payload: Record<string, unknown>;
  note?: string;
  causeCode?: string;
  causeVerification?: string;
}

export interface ProjectModelV094 {
  projectId: string;
  revision: number;
  name: string;
  projectType: string;
  timezone: string;
  forecastAnchorDate: ISODate;
  calendar: WorkCalendarV094;
  sources: Record<string, SourceV094>;
  activities: Record<string, ActivityV094>;
  constraints: Record<string, ConstraintV094>;
  dependencies: Record<string, DependencyV094>;
  conflicts?: Record<string, ConflictV094>;
  commercialSignals?: Record<string, CommercialSignalV094>;
  workloadSignals?: Record<string, WorkloadSignalV094>;
  eventLedger: ProjectEventV094[];
}

// Every EventMutationV094 variant below corresponds 1:1 to a `case` in the
// baseline bundle's src/reducer.js `applyEventMutations` switch statement.

export interface SetActualStartMutationV094 {
  op: "SET_ACTUAL_START";
  activityId: string;
  date: ISODate;
}

export interface SetActualFinishMutationV094 {
  op: "SET_ACTUAL_FINISH";
  activityId: string;
  date: ISODate;
}

export interface SetActivityStateMutationV094 {
  op: "SET_ACTIVITY_STATE";
  activityId: string;
  state: ActivityState;
}

export interface SetDurationMutationV094 {
  op: "SET_DURATION";
  activityId: string;
  duration: DurationEstimateV094;
}

export interface SetConstraintStateMutationV094 {
  op: "SET_CONSTRAINT_STATE";
  constraintId: string;
  state: string;
  verification?: VerificationState;
}

export interface SetConstraintReadinessMutationV094 {
  op: "SET_CONSTRAINT_READINESS";
  constraintId: string;
  readiness: ConstraintReadinessV094;
  verification?: VerificationState;
}

export interface SetScheduleLockMutationV094 {
  op: "SET_SCHEDULE_LOCK";
  activityId: string;
  lock: ScheduleLockV094;
}

export interface ClearScheduleLockMutationV094 {
  op: "CLEAR_SCHEDULE_LOCK";
  activityId: string;
}

export interface UpsertSourceMutationV094 {
  op: "UPSERT_SOURCE";
  source: SourceV094;
}

export interface SupersedeSourceMutationV094 {
  op: "SUPERSEDE_SOURCE";
  sourceId: string;
  supersededBySourceId: string;
}

export interface UpsertConflictMutationV094 {
  op: "UPSERT_CONFLICT";
  conflict: ConflictV094;
}

export interface ResolveConflictMutationV094 {
  op: "RESOLVE_CONFLICT";
  conflictId: string;
  resolutionNote: string;
}

export interface UpsertCommercialSignalMutationV094 {
  op: "UPSERT_COMMERCIAL_SIGNAL";
  signal: CommercialSignalV094;
}

export interface UpsertWorkloadSignalMutationV094 {
  op: "UPSERT_WORKLOAD_SIGNAL";
  signal: WorkloadSignalV094;
}

export interface UpsertActivityMutationV094 {
  op: "UPSERT_ACTIVITY";
  activity: ActivityV094;
}

export interface UpsertConstraintMutationV094 {
  op: "UPSERT_CONSTRAINT";
  constraint: ConstraintV094;
}

export interface UpsertDependencyMutationV094 {
  op: "UPSERT_DEPENDENCY";
  dependency: DependencyV094;
}

export interface DeactivateDependencyMutationV094 {
  op: "DEACTIVATE_DEPENDENCY";
  dependencyId: string;
}

export type EventMutationV094 =
  | SetActualStartMutationV094
  | SetActualFinishMutationV094
  | SetActivityStateMutationV094
  | SetDurationMutationV094
  | SetConstraintStateMutationV094
  | SetConstraintReadinessMutationV094
  | SetScheduleLockMutationV094
  | ClearScheduleLockMutationV094
  | UpsertSourceMutationV094
  | SupersedeSourceMutationV094
  | UpsertConflictMutationV094
  | ResolveConflictMutationV094
  | UpsertCommercialSignalMutationV094
  | UpsertWorkloadSignalMutationV094
  | UpsertActivityMutationV094
  | UpsertConstraintMutationV094
  | UpsertDependencyMutationV094
  | DeactivateDependencyMutationV094;
