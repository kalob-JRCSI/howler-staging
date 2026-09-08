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
