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
import { WORKFLOW_STEP_NAMES, isTerminalWorkflowState } from "./workflow";
import type { ResultStatus, ResultV1 } from "./result";

/** `WorkflowProblem` with `details` AND `message` deliberately omitted. `details` can carry raw
 * revision/diff-shaped data the pipeline does not currently classify as safe-to-expose. `message`
 * is free-form prose -- every current call site happens to build it from a fixed, non-sensitive
 * template, but nothing in the type system guarantees that stays true, and observability is meant
 * to be safe to emit without re-auditing every future WorkflowProblem construction site. `code` +
 * `category` + `retryable` alone is still a useful, structured classification (see
 * REQUIRED_EFFECT_BY_KIND-style closed enums for `code`/`category`); omission is preferred here
 * over attempting to regex-scrub arbitrary prose, which cannot be proven complete. */
export interface RedactedProblem {
  code: string;
  category: WorkflowProblem["category"];
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

const TERMINAL_RESULT_STATUS_BY_STATE: Partial<
  Record<WorkflowState, ResultStatus>
> = {
  SUCCEEDED: "SUCCEEDED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
};

/**
 * Validates that every supplied row actually belongs to the same canonical execution -- never
 * invents or assumes a relationship the persisted contracts don't establish. Throws (an
 * existing-invariant violation, never a normal outcome) on the first mismatch found:
 *
 *  - every step's workflowId must belong to this run
 *  - a supplied result's workflowId/intentId/projectId must match the run
 *  - if the run already points to a resultId, a supplied result's resultId must match it
 *  - a result is only ever valid for a terminal run.state (SUCCEEDED/BLOCKED/FAILED) -- design
 *    §8.2: "result?: ResultV1 // absent only while run.state is INTERRUPTED" generalizes to every
 *    non-terminal state
 *  - a supplied result's status must match the one status the terminal run.state permits
 *  - a caller-supplied intentKind must agree with the result's own intentKind when both exist --
 *    contradictory metadata is never silently combined
 */
function assertCorrelated(
  run: WorkflowRunV1,
  steps: WorkflowStepV1[],
  result: ResultV1 | undefined,
  intentKind: IntentKind | undefined,
): void {
  for (const step of steps) {
    if (step.workflowId !== run.workflowId) {
      throw new Error(
        `buildExecutionTrace: step ${step.stepName}'s workflowId (${step.workflowId}) does not correlate to run.workflowId (${run.workflowId})`,
      );
    }
  }

  if (!result) return;

  if (result.workflowId !== run.workflowId) {
    throw new Error(
      `buildExecutionTrace: result.workflowId (${result.workflowId}) does not correlate to run.workflowId (${run.workflowId})`,
    );
  }
  if (result.intentId !== run.intentId) {
    throw new Error(
      `buildExecutionTrace: result.intentId (${result.intentId}) does not correlate to run.intentId (${run.intentId})`,
    );
  }
  if (result.projectId !== run.projectId) {
    throw new Error(
      `buildExecutionTrace: result.projectId (${result.projectId}) does not correlate to run.projectId (${run.projectId})`,
    );
  }
  if (run.resultId !== undefined && result.resultId !== run.resultId) {
    throw new Error(
      `buildExecutionTrace: result.resultId (${result.resultId}) does not match run.resultId (${run.resultId})`,
    );
  }
  if (!isTerminalWorkflowState(run.state)) {
    throw new Error(
      `buildExecutionTrace: a result was supplied for a non-terminal run.state (${run.state}); only SUCCEEDED/BLOCKED/FAILED runs have a result`,
    );
  }
  const expectedStatus = TERMINAL_RESULT_STATUS_BY_STATE[run.state];
  if (expectedStatus !== undefined && result.status !== expectedStatus) {
    throw new Error(
      `buildExecutionTrace: result.status (${result.status}) is inconsistent with terminal run.state (${run.state})`,
    );
  }
  if (intentKind !== undefined && intentKind !== result.intentKind) {
    throw new Error(
      `buildExecutionTrace: supplied intentKind (${intentKind}) contradicts result.intentKind (${result.intentKind})`,
    );
  }
}

/** Finite, nonnegative, deterministic, or null -- never NaN, never negative. Malformed
 * timestamps and a completedAt that precedes createdAt (both genuine data anomalies, not normal
 * outcomes) are represented the same way as "not yet completed": no duration to report. */
function computeDurationMs(
  createdAt: string,
  completedAt: string | undefined,
): number | null {
  if (completedAt === undefined) return null;
  const created = Date.parse(createdAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(created) || !Number.isFinite(completed)) return null;
  const durationMs = completed - created;
  return durationMs >= 0 ? durationMs : null;
}

/**
 * Builds one structured, secret-free execution record from already-loaded canonical rows. See
 * `assertCorrelated` for the full set of cross-row invariants this verifies before building
 * anything.
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
  assertCorrelated(run, steps, result, intentKind);

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
    durationMs: computeDurationMs(run.createdAt, run.completedAt),
  };
}
