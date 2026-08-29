// Canonical v1 result and intent-submission-response contracts, plus server-created result
// construction, transcribed from
// docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md §8.3. Pure construction
// only — no persistence, no HTTP, no D1, no external calls.

import type {
  ForecastDeltaV094,
  ForecastSnapshotV094,
  RecoveryAnalysisV094,
  SupersededSourceSummaryV094,
} from "../engine/solver";
import type { ProposedForecastV094 } from "../engine/engine";
import type { OversightReviewV094 } from "../engine/oversight";
import type { ProjectHealthV094 } from "../worker/health";
import type { IntentKind } from "./intent";
import type { WorkflowProblem, WorkflowRunV1 } from "./workflow";
import { OPERATOR_SAFETY } from "./policy";
import type { OperatorSafety } from "./policy";

export type ResultStatus = "SUCCEEDED" | "BLOCKED" | "FAILED";

/** Recovered v0.9.4 HTTP response shape for `GET /v1/projects/:projectId/forecast/recovery`. */
export interface RecoveryResponseV094 {
  projectId: string;
  projectRevision: number;
  latestVersion: number;
  baselineVersion: number | null;
  recovery: RecoveryAnalysisV094;
  recoveryLayer: {
    version: string;
    status: RecoveryAnalysisV094["status"];
    nextRiskDate: string | null;
    criticalExposureCount: number;
    blockedProtectionCount: number;
    standbyRecoveryCapacityWorkdays: number;
  };
  publicationGate: {
    forecastAllowed: true;
    commitmentEligible: boolean;
    publishable: boolean;
    mode: string;
  };
  stagingOnly: true;
}

/** Recovered v0.9.4 HTTP response shape for `POST .../events/preview`. */
export interface EvidencePreviewResponseV094 {
  projectRevision: number;
  baselineVersion: number | null;
  latestVersion: number | null;
  comparisonVersion: number | null;
  candidate: ProposedForecastV094;
  delta: ForecastDeltaV094 | null;
  recoveryAnalysis: RecoveryAnalysisV094;
  supersededSources: SupersededSourceSummaryV094[];
  impactActivityIds: string[];
  oversight: OversightReviewV094;
  forecastable: true;
  commitmentEligible: boolean;
  oversightPublishable: boolean;
  publishable: boolean;
  reviewToken: string;
  persisted: false;
  mode: string;
  stagingOnly: boolean;
}

/** Recovered v0.9.4 HTTP response shape for `POST .../events/apply-shadow`. */
export interface ShadowTransitionResponseV094 {
  applied: true;
  stagingOnly: true;
  projectRevision: number;
  candidate: ProposedForecastV094;
  delta: ForecastDeltaV094 | null;
  recoveryAnalysis: RecoveryAnalysisV094;
  supersededSources: SupersededSourceSummaryV094[];
  impactActivityIds: string[];
  oversight: OversightReviewV094;
  publicationGate: {
    forecastAllowed: true;
    commitmentEligible: boolean;
    publishable: false;
    mode: "shadow";
  };
}

export type ResultOutput =
  | {
      type: "FORECAST";
      data: {
        modelRevision: number;
        latest: ForecastSnapshotV094 | null;
        published: ForecastSnapshotV094 | null;
      };
    }
  | { type: "FORECAST_HEALTH"; data: ProjectHealthV094 }
  | { type: "RECOVERY"; data: RecoveryResponseV094 }
  | { type: "EVIDENCE_PREVIEW"; data: EvidencePreviewResponseV094 }
  | { type: "SHADOW_TRANSITION"; data: ShadowTransitionResponseV094 };

export interface ResultV1 {
  schemaVersion: "1";
  resultId: string;
  intentId: string;
  workflowId: string;
  projectId: string;
  intentKind: IntentKind;
  status: ResultStatus;
  persisted: boolean; // domain transition persisted, not audit rows
  projectRevisionBefore: number | null;
  projectRevisionAfter: number | null;
  forecastVersion: number | null;
  output?: ResultOutput;
  oversight?: unknown;
  warnings: { code: string; message: string }[];
  problem?: WorkflowProblem;
  safety: OperatorSafety;
  createdAt: string;
}

export interface IntentSubmissionResponseV1 {
  schemaVersion: "1";
  replayed: boolean; // delivery metadata, never persisted into ResultV1
  run: WorkflowRunV1;
  result?: ResultV1; // absent only while run.state is INTERRUPTED
}

export interface BuildResultInput {
  resultId: string;
  intentId: string;
  workflowId: string;
  projectId: string;
  intentKind: IntentKind;
  status: ResultStatus;
  persisted: boolean;
  projectRevisionBefore: number | null;
  projectRevisionAfter: number | null;
  forecastVersion: number | null;
  output?: ResultOutput;
  oversight?: unknown;
  warnings?: { code: string; message: string }[];
  problem?: WorkflowProblem;
  createdAt: string;
}

/**
 * Server-created, immutable result construction. `safety` is deliberately not a field of
 * `BuildResultInput` at all — it is always `OPERATOR_SAFETY`, never accepted from caller input.
 */
export function buildResult(input: BuildResultInput): ResultV1 {
  return {
    schemaVersion: "1",
    resultId: input.resultId,
    intentId: input.intentId,
    workflowId: input.workflowId,
    projectId: input.projectId,
    intentKind: input.intentKind,
    status: input.status,
    persisted: input.persisted,
    projectRevisionBefore: input.projectRevisionBefore,
    projectRevisionAfter: input.projectRevisionAfter,
    forecastVersion: input.forecastVersion,
    ...(input.output ? { output: input.output } : {}),
    ...(input.oversight !== undefined ? { oversight: input.oversight } : {}),
    warnings: input.warnings ?? [],
    ...(input.problem ? { problem: input.problem } : {}),
    safety: OPERATOR_SAFETY,
    createdAt: input.createdAt,
  };
}

/**
 * Design §8.3: "result?: ResultV1 // absent only while run.state is INTERRUPTED." Throws rather
 * than silently constructing an inconsistent envelope.
 */
export function buildIntentSubmissionResponse(
  replayed: boolean,
  run: WorkflowRunV1,
  result: ResultV1 | undefined,
): IntentSubmissionResponseV1 {
  const shouldHaveResult = run.state !== "INTERRUPTED";
  const hasResult = result !== undefined;
  if (hasResult !== shouldHaveResult) {
    throw new Error(
      `IntentSubmissionResponseV1 result presence (${String(hasResult)}) does not match run.state (${run.state}); expected present=${String(shouldHaveResult)}`,
    );
  }
  return {
    schemaVersion: "1",
    replayed,
    run,
    ...(result ? { result } : {}),
  };
}
