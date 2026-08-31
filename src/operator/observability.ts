// Task 17: structured, deterministic observability for canonical operator execution. Pure
// mapping only -- no persistence, no HTTP, no env access, same convention as intent.ts/
// workflow.ts/policy.ts. Reshapes already-persisted WorkflowRunV1 + WorkflowStepV1[] + optional
// ResultV1 (loaded by the caller through the existing repository read methods) into one
// secret-free record. This never becomes a second execution/mutation path: it only observes rows
// the canonical pipeline already wrote.

import type { IntentKind } from "./intent";
import type {
  StepState,
  WorkflowProblem,
  WorkflowRunV1,
  WorkflowState,
  WorkflowStepName,
  WorkflowStepV1,
} from "./workflow";
import { WORKFLOW_STEP_NAMES } from "./workflow";
import type { ResultStatus, ResultV1 } from "./result";

/** `WorkflowProblem` with `details` deliberately omitted -- `details` can carry raw
 * revision/diff-shaped data the pipeline does not currently classify as safe-to-expose, so the
 * conservative default is to omit it entirely rather than selectively allowlist fields. */
export interface RedactedProblem {
  code: string;
  category: WorkflowProblem["category"];
  message: string;
  retryable: boolean;
}

export interface ExecutionTraceStep {
  stepName: WorkflowStepName;
  state: StepState;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  problem: RedactedProblem | null;
}

export type OversightDecision = "PASS" | "PASS_WITH_WARNINGS" | "BLOCK";

export interface ExecutionVerification {
  decision: OversightDecision;
  findingsCount: number;
}

export interface ExecutionTraceV1 {
  schemaVersion: "1";
  intentId: string;
  workflowId: string;
  intentKind: IntentKind | null;
  projectId: string;
  workflowState: WorkflowState;
  currentStep: string | null;
  attempt: number;
  maxAttempts: number;
  resultId: string | null;
  resultStatus: ResultStatus | null;
  problem: RedactedProblem | null;
  verification: ExecutionVerification | null;
  /** Ordered by the canonical step sequence (WORKFLOW_STEP_NAMES); a step not yet reached is
   * simply absent, never a placeholder entry. No raw step output/inputHash/outputHash. */
  steps: ExecutionTraceStep[];
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  durationMs: number | null;
}

function redact(problem: WorkflowProblem | undefined): RedactedProblem | null {
  if (!problem) return null;
  return {
    code: problem.code,
    category: problem.category,
    message: problem.message,
    retryable: problem.retryable,
  };
}

/** Exactly one of interruption/blockedReason/failure applies for a given state, per the workflow
 * state machine's own terminal/interrupted invariants (validateTerminalInvariants). */
function problemForState(run: WorkflowRunV1): WorkflowProblem | undefined {
  switch (run.state) {
    case "INTERRUPTED":
      return run.interruption;
    case "BLOCKED":
      return run.blockedReason;
    case "FAILED":
      return run.failure;
    default:
      return undefined;
  }
}

interface OversightReviewShape {
  decision: unknown;
  findings: unknown[];
}

function isOversightReviewShape(value: unknown): value is OversightReviewShape {
  return (
    typeof value === "object" &&
    value !== null &&
    "decision" in value &&
    "findings" in value &&
    Array.isArray((value as OversightReviewShape).findings)
  );
}

function isOversightDecision(value: unknown): value is OversightDecision {
  return (
    value === "PASS" || value === "PASS_WITH_WARNINGS" || value === "BLOCK"
  );
}

/** Surfaces only the verification *decision* and a *count* of findings -- never the raw findings
 * array, which can describe specific project/activity details beyond what observability needs. */
function verificationFrom(
  result: ResultV1 | undefined,
): ExecutionVerification | null {
  const oversight = result?.oversight;
  if (oversight === undefined || !isOversightReviewShape(oversight))
    return null;
  if (!isOversightDecision(oversight.decision)) return null;
  return {
    decision: oversight.decision,
    findingsCount: oversight.findings.length,
  };
}

function buildSteps(steps: WorkflowStepV1[]): ExecutionTraceStep[] {
  const byName = new Map(steps.map((step) => [step.stepName, step]));
  const ordered: ExecutionTraceStep[] = [];
  for (const stepName of WORKFLOW_STEP_NAMES) {
    const step = byName.get(stepName);
    if (!step) continue;
    ordered.push({
      stepName,
      state: step.state,
      attempt: step.attempt,
      ...(step.startedAt !== undefined ? { startedAt: step.startedAt } : {}),
      ...(step.completedAt !== undefined
        ? { completedAt: step.completedAt }
        : {}),
      problem: redact(step.problem),
    });
  }
  return ordered;
}

/**
 * Builds one structured, secret-free execution record from already-loaded canonical rows. Throws
 * (an existing-invariant violation, never a normal outcome) if a supplied `result` does not
 * actually correlate to `run` -- correlation is verified, not merely asserted by construction.
 *
 * `intentKind` is optional because a workflow with no result yet (RUNNING/INTERRUPTED) carries no
 * `ResultV1.intentKind` to fall back on; a caller that already has the original claimed intent can
 * pass its `kind` directly. Never invented or defaulted to a guess.
 */
export function buildExecutionTrace(
  run: WorkflowRunV1,
  steps: WorkflowStepV1[],
  result?: ResultV1,
  intentKind?: IntentKind,
): ExecutionTraceV1 {
  if (result && result.workflowId !== run.workflowId) {
    throw new Error(
      `buildExecutionTrace: result.workflowId (${result.workflowId}) does not correlate to run.workflowId (${run.workflowId})`,
    );
  }
  if (result && result.intentId !== run.intentId) {
    throw new Error(
      `buildExecutionTrace: result.intentId (${result.intentId}) does not correlate to run.intentId (${run.intentId})`,
    );
  }

  return {
    schemaVersion: "1",
    intentId: run.intentId,
    workflowId: run.workflowId,
    intentKind: intentKind ?? result?.intentKind ?? null,
    projectId: run.projectId,
    workflowState: run.state,
    currentStep: run.currentStep,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    resultId: run.resultId ?? null,
    resultStatus: result?.status ?? null,
    problem: redact(problemForState(run)),
    verification: verificationFrom(result),
    steps: buildSteps(steps),
    createdAt: run.createdAt,
    ...(run.startedAt !== undefined ? { startedAt: run.startedAt } : {}),
    updatedAt: run.updatedAt,
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    durationMs:
      run.completedAt !== undefined
        ? Date.parse(run.completedAt) - Date.parse(run.createdAt)
        : null,
  };
}
