// Canonical v1 workflow run/step contracts and transition rules for the OPERATOR_INTENT_V1
// workflow, transcribed from docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md
// §8.2 and §10.4. Pure types and deterministic checks only — no persistence, no HTTP, no D1.

export type WorkflowState =
  | "RECEIVED"
  | "VALIDATING"
  | "READY"
  | "RUNNING"
  | "INTERRUPTED"
  | "BLOCKED"
  | "FAILED"
  | "SUCCEEDED";

export type StepState =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "BLOCKED" | "FAILED" | "SKIPPED";

export interface WorkflowProblem {
  code: string;
  category:
    | "VALIDATION"
    | "AUTHORIZATION"
    | "POLICY"
    | "REVISION"
    | "TRANSIENT"
    | "INTERNAL";
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface WorkflowRunV1 {
  schemaVersion: "1";
  workflowId: string;
  workflowType: "OPERATOR_INTENT_V1";
  workflowVersion: 1;
  intentId: string;
  intentHash: string;
  projectId: string;
  state: WorkflowState;
  currentStep: string | null;
  attempt: number;
  maxAttempts: number;
  resumable: boolean;
  interruption?: WorkflowProblem;
  blockedReason?: WorkflowProblem;
  failure?: WorkflowProblem;
  resultId?: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkflowStepV1 {
  schemaVersion: "1";
  workflowId: string;
  stepName: string;
  ordinal: number;
  state: StepState;
  attempt: number;
  inputHash: string;
  output?: unknown;
  outputHash?: string;
  problem?: WorkflowProblem;
  startedAt?: string;
  completedAt?: string;
}

export const ALL_WORKFLOW_STATES: readonly WorkflowState[] = [
  "RECEIVED",
  "VALIDATING",
  "READY",
  "RUNNING",
  "INTERRUPTED",
  "BLOCKED",
  "FAILED",
  "SUCCEEDED",
];

export const TERMINAL_WORKFLOW_STATES: readonly WorkflowState[] = [
  "SUCCEEDED",
  "BLOCKED",
  "FAILED",
];

/**
 * The complete allowed transition set from design §10.4: "RECEIVED -> VALIDATING -> READY ->
 * RUNNING", "RUNNING -> INTERRUPTED", "INTERRUPTED -> RUNNING", "RUNNING ->
 * SUCCEEDED|BLOCKED|FAILED"; retry exhaustion "INTERRUPTED -> FAILED". No other transition —
 * including any self-transition or any exit from a terminal state — is valid.
 */
const WORKFLOW_TRANSITIONS: ReadonlySet<string> = new Set([
  "RECEIVED->VALIDATING",
  "VALIDATING->READY",
  "READY->RUNNING",
  "RUNNING->INTERRUPTED",
  "INTERRUPTED->RUNNING",
  "RUNNING->SUCCEEDED",
  "RUNNING->BLOCKED",
  "RUNNING->FAILED",
  "INTERRUPTED->FAILED",
]);

export function isValidTransition(
  from: WorkflowState,
  to: WorkflowState,
): boolean {
  return WORKFLOW_TRANSITIONS.has(`${from}->${to}`);
}

export function isTerminalWorkflowState(state: WorkflowState): boolean {
  return TERMINAL_WORKFLOW_STATES.includes(state);
}

/**
 * Design §8.2: "BLOCKED, FAILED, and SUCCEEDED are terminal and each has exactly one result."
 * INTERRUPTED "means a retryable technical problem stopped the current attempt and no terminal
 * result exists yet" — so it requires no result and a retryable interruption problem.
 */
export function validateTerminalInvariants(
  run: WorkflowRunV1,
): WorkflowProblem[] {
  const violations: WorkflowProblem[] = [];

  if (isTerminalWorkflowState(run.state)) {
    if (!run.resultId) {
      violations.push({
        code: "TERMINAL_RESULT_MISSING",
        category: "INTERNAL",
        message: `Terminal state ${run.state} requires exactly one result, but resultId is missing`,
        retryable: false,
      });
    }
    return violations;
  }

  if (run.state === "INTERRUPTED") {
    if (run.resultId) {
      violations.push({
        code: "INTERRUPTED_RESULT_PRESENT",
        category: "INTERNAL",
        message: "INTERRUPTED state must not have a result",
        retryable: false,
      });
    }
    if (!run.interruption) {
      violations.push({
        code: "INTERRUPTED_PROBLEM_MISSING",
        category: "INTERNAL",
        message: "INTERRUPTED state requires an interruption problem",
        retryable: false,
      });
    } else if (!run.interruption.retryable) {
      violations.push({
        code: "INTERRUPTED_PROBLEM_NOT_RETRYABLE",
        category: "INTERNAL",
        message: "INTERRUPTED state requires a retryable interruption problem",
        retryable: false,
      });
    }
  }

  return violations;
}
