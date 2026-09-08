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
