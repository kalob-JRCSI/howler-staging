// Canonical v1 workflow run/step contracts and transition rules for the OPERATOR_INTENT_V1
// workflow, transcribed from docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md
// §8.2 and §10.4. Pure types and deterministic checks only — no persistence, no HTTP, no D1.
//
// Task 13 additionally implements the transport-independent executor for read-only and preview
// intent kinds, and Task 14 extends it with the one revision-safe shadow mutation
// (EVIDENCE_APPLY_SHADOW's COMMIT_SHADOW step — design §7.2's canonical ten-step workflow, §11).
// It accepts a canonical IntentV1 plus injected dependencies only — never Request, Response, HTTP
// routing, UI, microphone code, bearer-token parsing, or fetch — so any future adapter (HTTP,
// voice, watch, desktop, glasses, ...) can submit the same intent into it unchanged.

import type { ProjectEventV094, ProjectModelV094 } from "../domain/types";
import { forecastAfterEvent } from "../engine/engine";
import type { ForecastRunV094 } from "../engine/engine";
import type { OversightReviewV094 } from "../engine/oversight";
import { analyzeRecovery } from "../engine/solver";
import type { ForecastSnapshotV094 } from "../engine/solver";
import type { PredictionOutcomeV094 } from "../engine/learning";
import { RevisionConflictError } from "../engine/storage";
import { projectHealth } from "../worker/health";
import type { ProjectHealthV094 } from "../worker/health";
import { sha256Hex } from "../worker/hash";
import { validateIntent } from "./intent";
import type { IntentV1, ProjectEventInput } from "./intent";
import {
  assertPermittedEffect,
  assertShadowCommitPermitted,
  assertStagingShadowPolicy,
} from "./policy";
import type { StagingShadowContext } from "./policy";
import { buildResult } from "./result";
import type {
  EvidencePreviewResponseV094,
  RecoveryResponseV094,
  ResultOutput,
  ResultV1,
  ShadowTransitionResponseV094,
} from "./result";

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

// ---------------------------------------------------------------------------------------------
// Task 13: canonical step ledger + resumable executor.
// ---------------------------------------------------------------------------------------------

/** Design §7.2's canonical ten-step order. Conditional steps are persisted SKIPPED, never omitted. */
export const WORKFLOW_STEP_NAMES = [
  "RECEIVE",
  "VALIDATE",
  "AUTHORIZE_POLICY",
  "LOAD_PROJECT",
  "CHECK_REVISION",
  "PREPARE",
  "EXECUTE_ENGINE",
  "COMMIT_SHADOW",
  "BUILD_RESULT",
  "FINALIZE",
] as const;

export type WorkflowStepName = (typeof WORKFLOW_STEP_NAMES)[number];

export const WORKFLOW_STEP_ORDINALS: Readonly<
  Record<WorkflowStepName, number>
> = Object.fromEntries(
  WORKFLOW_STEP_NAMES.map((name, index) => [name, index]),
) as Record<WorkflowStepName, number>;

const MAX_READ_ATTEMPTS = 3;
/** Task 13's workflow attempt budget is a fixed invariant, never caller-configurable. */
export const TASK13_MAX_WORKFLOW_ATTEMPTS = 3;

/**
 * Thrown by `readWithRetry` only after genuinely exhausting the full read budget on an error
 * classified as transient — distinct from a non-retryable error (which propagates immediately,
 * unwrapped, on its first occurrence). The executor catches this specific type to decide between
 * INTERRUPTED and terminal FAILED/RETRY_EXHAUSTED.
 */
export class ReadRetryExhaustedError extends Error {
  constructor(public readonly cause: unknown) {
    super("Transient repository read failed after the maximum retry budget");
  }
}

/**
 * The *only* error type `readWithRetry` treats as retryable. A repository read (or a test double
 * standing in for one) must explicitly throw this to signal a genuinely transient condition —
 * anything else (a generic Error, a programming error, malformed SQL, an invariant failure, a
 * malformed-persisted-JSON defect, ...) fails immediately on its first occurrence. This replaces
 * message-sniffing (e.g. excluding only "Invalid persisted JSON") with an explicit, closed
 * classification: retryable is opt-in, not the default.
 */
export class TransientRepositoryReadError extends Error {
  constructor(public readonly cause?: unknown) {
    super("Transient repository read failure");
  }
}

/**
 * Thrown by COMMIT_SHADOW's reconciliation check when domain evidence is partially or
 * inconsistently present — e.g. a committed event whose matching forecast snapshot or oversight
 * review cannot be found or does not cross-reference it. Design §10.4: this is terminal,
 * non-resumable `FAILED/COMMIT_STATE_AMBIGUOUS`; an operator investigates rather than the
 * workflow risking a duplicate mutation by guessing.
 */
export class CommitStateAmbiguousError extends Error {}

/**
 * Retries one repository read up to MAX_READ_ATTEMPTS total calls (the initial call plus two
 * retries — design §10.3), synchronously, with no timer and no sleep. Only
 * `TransientRepositoryReadError` is retried; anything else propagates on its first occurrence.
 * Writes are never passed through this helper.
 */
async function readWithRetry<T>(read: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof TransientRepositoryReadError)) throw error;
      lastError = error;
    }
  }
  throw new ReadRetryExhaustedError(lastError);
}

export interface WorkflowExecutorClock {
  now(): Date;
}

export interface WorkflowExecutorIds {
  next(): string;
}

/**
 * Confirms route-level admin authentication already succeeded before this transport-independent
 * executor was ever invoked — the credential itself never reaches operator/* code (design §7.2
 * step 3: "record that route-level admin authentication succeeded ... the secret itself is never
 * persisted").
 */
export interface AuthorizationAttestation extends StagingShadowContext {
  authenticated: true;
}

type ClaimOutcome =
  | { outcome: "CLAIMED" | "REPLAY"; run: WorkflowRunV1 }
  | { outcome: "IDEMPOTENCY_KEY_REUSE" | "INTENT_ID_REUSE" };

/**
 * The exact repository surface the executor needs, expressed structurally rather than imported
 * from worker/repository.ts — keeps operator/* fully decoupled from the D1/worker persistence
 * layer. Any object with this shape (the real D1HowlerRepository included) satisfies it.
 */
export interface WorkflowExecutorRepository {
  claimIntent(input: {
    intent: IntentV1;
    workflowId: string;
    maxAttempts: number;
    now: string;
  }): Promise<ClaimOutcome>;
  loadWorkflowRun(workflowId: string): Promise<WorkflowRunV1 | undefined>;
  updateWorkflowRunState(input: {
    workflowId: string;
    expectedState: WorkflowState;
    nextState: WorkflowState;
    now: string;
    currentStep?: string | null;
    interruption?: WorkflowProblem;
    blockedReason?: WorkflowProblem;
    failure?: WorkflowProblem;
    resultId?: string;
    markStarted?: boolean;
    resumable?: boolean;
    incrementAttempt?: boolean;
  }): Promise<boolean>;
  finalizeWorkflowRun(input: {
    workflowId: string;
    expectedState: WorkflowState;
    terminalState: "SUCCEEDED" | "BLOCKED" | "FAILED";
    result: ResultV1;
    now: string;
  }): Promise<boolean>;
  finalizeWorkflowRunStep(input: {
    workflowId: string;
    expectedState: WorkflowState;
    terminalState: "SUCCEEDED" | "BLOCKED" | "FAILED";
    result: ResultV1;
    stepOutput: unknown;
    stepOutputHash: string;
    now: string;
  }): Promise<boolean>;
  loadWorkflowResult(resultId: string): Promise<ResultV1 | undefined>;
  loadWorkflowStep(
    workflowId: string,
    stepName: WorkflowStepName,
  ): Promise<WorkflowStepV1 | undefined>;
  ensureWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    ordinal: number;
    inputHash: string;
    attempt: number;
  }): Promise<WorkflowStepV1>;
  startWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    attempt: number;
    now: string;
  }): Promise<void>;
  completeWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    output: unknown;
    outputHash: string;
    now: string;
  }): Promise<void>;
  skipWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    ordinal: number;
    inputHash: string;
    now: string;
  }): Promise<void>;
  failWorkflowStep(input: {
    workflowId: string;
    stepName: WorkflowStepName;
    state: "BLOCKED" | "FAILED";
    problem: WorkflowProblem;
    now: string;
  }): Promise<void>;
  loadProject(projectId: string): Promise<ProjectModelV094 | undefined>;
  loadLatestForecast(
    projectId: string,
  ): Promise<ForecastSnapshotV094 | undefined>;
  loadLatestPublishedForecast(
    projectId: string,
  ): Promise<ForecastSnapshotV094 | undefined>;
  loadForecastById(
    projectId: string,
    snapshotId: string,
  ): Promise<ForecastSnapshotV094 | undefined>;
  loadPredictionOutcomes(projectId?: string): Promise<PredictionOutcomeV094[]>;
  /**
   * Task 14: the only operator domain mutation. Deliberately the sole write method this
   * structural interface exposes — the live/controlled-publish commit variant is never part of
   * this type, so no operator code can reach it even by accident (design §11's "no IntentKind
   * maps to" that variant, enforced at the type boundary).
   */
  commitShadowTransition(transition: {
    expectedRevision: number;
    modelAfterEvent: ProjectModelV094;
    event: ProjectEventV094;
    candidate: ForecastSnapshotV094;
    oversight: OversightReviewV094;
  }): Promise<void>;
  /** COMMIT_SHADOW reconciliation: has this exact event already been committed by a prior attempt? */
  loadEventById(
    projectId: string,
    eventId: string,
  ): Promise<ProjectEventV094 | undefined>;
  /** COMMIT_SHADOW reconciliation: the paired oversight-review half of the same evidence check. */
  loadOversightReviewById(
    reviewId: string,
  ): Promise<OversightReviewV094 | undefined>;
}

export interface WorkflowExecutorDeps {
  repo: WorkflowExecutorRepository;
  clock: WorkflowExecutorClock;
  workflowIds: WorkflowExecutorIds;
  resultIds: WorkflowExecutorIds;
  authorization: AuthorizationAttestation;
}

export type ExecuteWorkflowResult =
  | { outcome: "IDEMPOTENCY_KEY_REUSE" | "INTENT_ID_REUSE" }
  | { outcome: "INTERRUPTED"; run: WorkflowRunV1 }
  | { outcome: "CONCURRENT_RESUME_LOST"; run: WorkflowRunV1 }
  | { outcome: "COMPLETED"; run: WorkflowRunV1; result: ResultV1 };

function nowString(deps: WorkflowExecutorDeps): string {
  return deps.clock.now().toISOString();
}

function assertOrdinalNotDrifted(
  workflowId: string,
  stepName: WorkflowStepName,
  persistedOrdinal: number,
): void {
  const expected = WORKFLOW_STEP_ORDINALS[stepName];
  if (persistedOrdinal !== expected) {
    throw new Error(
      `Workflow step ${workflowId}/${stepName} ordinal drifted: persisted ${String(persistedOrdinal)}, expected ${String(expected)} — refusing to reuse or accept it`,
    );
  }
}

/**
 * Idempotently ensures a step row exists (insert-if-absent), reusing an already-SUCCEEDED
 * persisted output when its ordinal and input hash still match — "completed steps do not rerun"
 * — and otherwise (re-)running `compute` under the current workflow attempt. Ordinal/input-hash
 * are verified *before* any reuse, not only on the repository's own insert-time guard (which never
 * runs at all on the reuse path) — a persisted definition may never silently drift.
 */
async function runStep<TOutput>(
  deps: WorkflowExecutorDeps,
  workflowId: string,
  runAttempt: number,
  stepName: WorkflowStepName,
  hashInput: unknown,
  compute: () => TOutput | Promise<TOutput>,
): Promise<TOutput> {
  const inputHash = await sha256Hex(hashInput);
  const persisted = await deps.repo.loadWorkflowStep(workflowId, stepName);
  if (persisted) {
    assertOrdinalNotDrifted(workflowId, stepName, persisted.ordinal);
    if (persisted.state === "SUCCEEDED") {
      if (persisted.inputHash !== inputHash) {
        throw new Error(
          `Workflow step ${workflowId}/${stepName} input hash changed between attempts — replay is unsafe`,
        );
      }
      return persisted.output as TOutput;
    }
  }
  await deps.repo.ensureWorkflowStep({
    workflowId,
    stepName,
    ordinal: WORKFLOW_STEP_ORDINALS[stepName],
    inputHash,
    attempt: runAttempt,
  });
  await deps.repo.startWorkflowStep({
    workflowId,
    stepName,
    attempt: runAttempt,
    now: nowString(deps),
  });
  const output = await compute();
  const outputHash = await sha256Hex(output);
  await deps.repo.completeWorkflowStep({
    workflowId,
    stepName,
    output,
    outputHash,
    now: nowString(deps),
  });
  return output;
}

/**
 * Idempotently persists a conditionally-inapplicable step as SKIPPED — never simply omitted.
 * Verifies ordinal/input-hash before accepting an already-SKIPPED row, the same as `runStep` does
 * for a completed one — a persisted SKIPPED definition may never silently drift either.
 */
async function skipStep(
  deps: WorkflowExecutorDeps,
  workflowId: string,
  stepName: WorkflowStepName,
): Promise<void> {
  const inputHash = await sha256Hex({ workflowId, stepName, skipped: true });
  const existing = await deps.repo.loadWorkflowStep(workflowId, stepName);
  if (existing) {
    assertOrdinalNotDrifted(workflowId, stepName, existing.ordinal);
    if (existing.state === "SKIPPED" && existing.inputHash !== inputHash) {
      throw new Error(
        `Workflow step ${workflowId}/${stepName} input hash changed between attempts of a SKIPPED step — replay is unsafe`,
      );
    }
  }
  await deps.repo.skipWorkflowStep({
    workflowId,
    stepName,
    ordinal: WORKFLOW_STEP_ORDINALS[stepName],
    inputHash,
    now: nowString(deps),
  });
}

/** Skips every canonical step strictly between `from` (already handled) and BUILD_RESULT. */
async function skipRemainingSteps(
  deps: WorkflowExecutorDeps,
  workflowId: string,
  from: WorkflowStepName,
): Promise<void> {
  const start = WORKFLOW_STEP_ORDINALS[from] + 1;
  const end = WORKFLOW_STEP_ORDINALS.BUILD_RESULT;
  for (let index = start; index < end; index++) {
    const stepName = WORKFLOW_STEP_NAMES[index];
    if (!stepName) continue;
    await skipStep(deps, workflowId, stepName);
  }
}

function projectNotFoundProblem(projectId: string): WorkflowProblem {
  return {
    code: "PROJECT_NOT_FOUND",
    category: "INTERNAL",
    message: `Project ${projectId} not found`,
    retryable: false,
  };
}

function noForecastProblem(projectId: string): WorkflowProblem {
  return {
    code: "NO_FORECAST_EXISTS",
    category: "INTERNAL",
    message: `No forecast exists for ${projectId}`,
    retryable: false,
  };
}

/**
 * FINALIZE, atomically recording the terminal run state, the immutable result, and the FINALIZE
 * step's own completion in one D1 batch (`finalizeWorkflowRunStep`) — a failure completing the
 * step can never leave a committed terminal run/result with FINALIZE still incomplete, because
 * there is no separate "complete the step" write left to fail after the commit.
 */
async function finalizeStep(
  deps: WorkflowExecutorDeps,
  run: WorkflowRunV1,
  result: ResultV1,
): Promise<WorkflowRunV1> {
  const stepName: WorkflowStepName = "FINALIZE";
  const hashInput = { resultId: result.resultId };
  const inputHash = await sha256Hex(hashInput);
  const persisted = await deps.repo.loadWorkflowStep(run.workflowId, stepName);
  if (persisted) {
    assertOrdinalNotDrifted(run.workflowId, stepName, persisted.ordinal);
    if (persisted.state === "SUCCEEDED") {
      if (persisted.inputHash !== inputHash) {
        throw new Error(
          `Workflow step ${run.workflowId}/${stepName} input hash changed between attempts — replay is unsafe`,
        );
      }
      const finalRun = await deps.repo.loadWorkflowRun(run.workflowId);
      if (!finalRun) {
        throw new Error(
          `Workflow run ${run.workflowId} vanished after finalize`,
        );
      }
      return finalRun;
    }
  } else {
    await deps.repo.ensureWorkflowStep({
      workflowId: run.workflowId,
      stepName,
      ordinal: WORKFLOW_STEP_ORDINALS[stepName],
      inputHash,
      attempt: run.attempt,
    });
  }
  const now = nowString(deps);
  await deps.repo.startWorkflowStep({
    workflowId: run.workflowId,
    stepName,
    attempt: run.attempt,
    now,
  });
  const stepOutput = { finalized: true };
  const stepOutputHash = await sha256Hex(stepOutput);
  const applied = await deps.repo.finalizeWorkflowRunStep({
    workflowId: run.workflowId,
    expectedState: "RUNNING",
    terminalState: result.status,
    result,
    stepOutput,
    stepOutputHash,
    now,
  });
  if (!applied) {
    throw new Error(
      `finalizeWorkflowRunStep did not apply for workflow ${run.workflowId} (expected RUNNING)`,
    );
  }
  const finalRun = await deps.repo.loadWorkflowRun(run.workflowId);
  if (!finalRun) {
    throw new Error(`Workflow run ${run.workflowId} vanished after finalize`);
  }
  return finalRun;
}

/**
 * Marks `atStep` terminal (BLOCKED/FAILED), reusing its already-persisted row (e.g. one left
 * RUNNING when a transient read's retry budget was exhausted) rather than re-deriving a fresh
 * input hash that would spuriously disagree with what is already there — the step already exists
 * in that case, and its original input hash remains correct and unchanged.
 */
async function markStepTerminal(
  deps: WorkflowExecutorDeps,
  workflowId: string,
  runAttempt: number,
  atStep: WorkflowStepName,
  state: "BLOCKED" | "FAILED",
  problem: WorkflowProblem,
  now: string,
): Promise<void> {
  const existing = await deps.repo.loadWorkflowStep(workflowId, atStep);
  if (existing) {
    assertOrdinalNotDrifted(workflowId, atStep, existing.ordinal);
  } else {
    const inputHash = await sha256Hex({ workflowId, stepName: atStep });
    await deps.repo.ensureWorkflowStep({
      workflowId,
      stepName: atStep,
      ordinal: WORKFLOW_STEP_ORDINALS[atStep],
      inputHash,
      attempt: runAttempt,
    });
    await deps.repo.startWorkflowStep({
      workflowId,
      stepName: atStep,
      attempt: runAttempt,
      now,
    });
  }
  await deps.repo.failWorkflowStep({
    workflowId,
    stepName: atStep,
    state,
    problem,
    now,
  });
}

interface CommitShadowOutput {
  persisted: true;
  alreadyCommitted: boolean;
}

/**
 * COMMIT_SHADOW cannot use `runStep`'s generic reuse semantics: a non-SUCCEEDED persisted row does
 * NOT mean "safe to recompute", because the underlying atomic D1 write may already have landed
 * durably even though this step's own ledger row never recorded it (e.g. a crash between the
 * commit and `completeWorkflowStep`). Design §10.3/§10.4: "A domain commit is never blindly
 * retried. Resume first checks the stable event ID, project revision, forecast ID/version, and
 * oversight record to determine whether the atomic batch committed." A found-but-inconsistent
 * event (matching forecast/oversight missing or cross-referenced wrongly) throws
 * `CommitStateAmbiguousError` rather than guessing; a genuinely absent event is safe to commit.
 */
async function runCommitShadowStep(
  deps: WorkflowExecutorDeps,
  run: WorkflowRunV1,
  intent: IntentV1,
  event: ProjectEventInput,
  forecastRun: ForecastRunV094,
): Promise<CommitShadowOutput> {
  const stepName: WorkflowStepName = "COMMIT_SHADOW";
  const { candidate, oversight, modelAfterEvent } = forecastRun;
  const inputHash = await sha256Hex({
    eventId: event.id,
    candidateId: candidate.id,
    oversightId: oversight.id,
  });
  const persisted = await deps.repo.loadWorkflowStep(run.workflowId, stepName);
  if (persisted) {
    assertOrdinalNotDrifted(run.workflowId, stepName, persisted.ordinal);
    if (persisted.state === "SUCCEEDED") {
      if (persisted.inputHash !== inputHash) {
        throw new Error(
          `Workflow step ${run.workflowId}/${stepName} input hash changed between attempts — replay is unsafe`,
        );
      }
      return persisted.output as CommitShadowOutput;
    }
  } else {
    await deps.repo.ensureWorkflowStep({
      workflowId: run.workflowId,
      stepName,
      ordinal: WORKFLOW_STEP_ORDINALS[stepName],
      inputHash,
      attempt: run.attempt,
    });
  }
  await deps.repo.startWorkflowStep({
    workflowId: run.workflowId,
    stepName,
    attempt: run.attempt,
    now: nowString(deps),
  });

  const existingEvent = await readWithRetry(() =>
    deps.repo.loadEventById(intent.projectId, event.id),
  );

  let output: CommitShadowOutput;
  if (existingEvent) {
    const existingCandidate = await readWithRetry(() =>
      deps.repo.loadForecastById(intent.projectId, candidate.id),
    );
    const existingOversight = await readWithRetry(() =>
      deps.repo.loadOversightReviewById(oversight.id),
    );
    if (
      !existingCandidate ||
      !existingOversight ||
      existingOversight.candidateSnapshotId !== existingCandidate.id
    ) {
      throw new CommitStateAmbiguousError(
        `Workflow ${run.workflowId}: event ${event.id} already exists but its forecast/oversight evidence is missing or inconsistent`,
      );
    }
    output = { persisted: true, alreadyCommitted: true };
  } else {
    const policyProblem = assertShadowCommitPermitted(intent.kind);
    if (policyProblem) {
      // Unreachable in practice — runSteps only ever calls this from the EVIDENCE_APPLY_SHADOW
      // branch — but kept as a genuine runtime assertion, not a comment, per this codebase's
      // established defense-in-depth pattern.
      throw new Error(policyProblem.message);
    }
    await deps.repo.commitShadowTransition({
      expectedRevision: event.baseRevision,
      modelAfterEvent,
      event: event as unknown as ProjectEventV094,
      candidate,
      oversight,
    });
    output = { persisted: true, alreadyCommitted: false };
  }

  const outputHash = await sha256Hex(output);
  await deps.repo.completeWorkflowStep({
    workflowId: run.workflowId,
    stepName,
    output,
    outputHash,
    now: nowString(deps),
  });
  return output;
}

/**
 * Terminal, non-retryable failure: marks `atStep` FAILED, skips whatever never ran, then still
 * routes the result construction through a real BUILD_RESULT step (SUCCEEDED — building a FAILED
 * ResultV1 is itself a successful build) before FINALIZE, so all ten canonical steps exist on
 * this path exactly as they do on the success path.
 */
async function failRun(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
  problem: WorkflowProblem,
  atStep: WorkflowStepName,
): Promise<ExecuteWorkflowResult> {
  const now = nowString(deps);
  await markStepTerminal(
    deps,
    run.workflowId,
    run.attempt,
    atStep,
    "FAILED",
    problem,
    now,
  );
  await skipRemainingSteps(deps, run.workflowId, atStep);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { status: "FAILED", problem },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "FAILED",
        persisted: false,
        projectRevisionBefore: null,
        projectRevisionAfter: null,
        forecastVersion: null,
        problem,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

/**
 * Business-state block (e.g. a stale revision) — terminal, not retryable, no domain mutation.
 * Routes through BUILD_RESULT the same way `failRun` does, for the same reason.
 */
async function blockRun(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
  problem: WorkflowProblem,
  atStep: WorkflowStepName,
  projectRevision: number,
): Promise<ExecuteWorkflowResult> {
  const now = nowString(deps);
  await markStepTerminal(
    deps,
    run.workflowId,
    run.attempt,
    atStep,
    "BLOCKED",
    problem,
    now,
  );
  await skipRemainingSteps(deps, run.workflowId, atStep);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { status: "BLOCKED", problem },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "BLOCKED",
        persisted: false,
        projectRevisionBefore: projectRevision,
        projectRevisionAfter: projectRevision,
        forecastVersion: null,
        problem,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

/**
 * A transient read's retry budget was exhausted. If workflow attempts remain, interrupts the run
 * (resumable, retryable problem, no result yet). If this was already the final allowed attempt,
 * the run instead fails terminally with RETRY_EXHAUSTED and exactly one immutable result.
 */
async function interruptRun(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
  atStep: WorkflowStepName,
): Promise<ExecuteWorkflowResult> {
  // The exhaustion decision always uses the run's own *persisted* maxAttempts, never a
  // caller-supplied value — that limit is fixed at claim time and is not configurable per call.
  if (run.attempt >= run.maxAttempts) {
    const exhausted: WorkflowProblem = {
      code: "RETRY_EXHAUSTED",
      category: "TRANSIENT",
      message: `Workflow attempts exhausted (${String(run.maxAttempts)}) while retrying ${atStep}`,
      retryable: false,
      details: { step: atStep, attempts: run.attempt },
    };
    return failRun(deps, intent, run, exhausted, atStep);
  }
  const problem: WorkflowProblem = {
    code: "TRANSIENT_READ_EXHAUSTED",
    category: "TRANSIENT",
    message: `Transient repository read failures exhausted the retry budget during ${atStep}`,
    retryable: true,
    details: { step: atStep },
  };
  await deps.repo.updateWorkflowRunState({
    workflowId: run.workflowId,
    expectedState: "RUNNING",
    nextState: "INTERRUPTED",
    now: nowString(deps),
    currentStep: atStep,
    interruption: problem,
    resumable: true,
  });
  const updated = await deps.repo.loadWorkflowRun(run.workflowId);
  if (!updated) {
    throw new Error(
      `Workflow run ${run.workflowId} vanished while interrupting`,
    );
  }
  return { outcome: "INTERRUPTED", run: updated };
}

interface LoadedProject {
  model: ProjectModelV094 | undefined;
  latest: ForecastSnapshotV094 | undefined;
  published: ForecastSnapshotV094 | undefined;
}

async function runForecastQuery(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
): Promise<ExecuteWorkflowResult> {
  let loaded: LoadedProject;
  try {
    loaded = await runStep(
      deps,
      run.workflowId,
      run.attempt,
      "LOAD_PROJECT",
      { projectId: intent.projectId },
      async (): Promise<LoadedProject> => {
        const model = await readWithRetry(() =>
          deps.repo.loadProject(intent.projectId),
        );
        if (!model)
          return { model: undefined, latest: undefined, published: undefined };
        const [latest, published] = await Promise.all([
          readWithRetry(() => deps.repo.loadLatestForecast(intent.projectId)),
          readWithRetry(() =>
            deps.repo.loadLatestPublishedForecast(intent.projectId),
          ),
        ]);
        return { model, latest, published };
      },
    );
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "LOAD_PROJECT");
    }
    throw error;
  }

  await skipStep(deps, run.workflowId, "CHECK_REVISION");
  await skipStep(deps, run.workflowId, "PREPARE");

  const { model, latest, published } = loaded;
  if (!model) {
    return failRun(
      deps,
      intent,
      run,
      projectNotFoundProblem(intent.projectId),
      "EXECUTE_ENGINE",
    );
  }

  const output = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "EXECUTE_ENGINE",
    {
      modelRevision: model.revision,
      latestVersion: latest?.version ?? null,
      publishedVersion: published?.version ?? null,
    },
    (): ResultOutput => ({
      type: "FORECAST",
      data: {
        modelRevision: model.revision,
        latest: latest ?? null,
        published: published ?? null,
      },
    }),
  );

  await skipStep(deps, run.workflowId, "COMMIT_SHADOW");

  const now = nowString(deps);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { output },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "SUCCEEDED",
        persisted: false,
        projectRevisionBefore: model.revision,
        projectRevisionAfter: model.revision,
        forecastVersion: latest?.version ?? null,
        output,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

interface LoadedHealthProject {
  model: ProjectModelV094 | undefined;
  latest: ForecastSnapshotV094 | undefined;
}

async function runForecastHealthQuery(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
): Promise<ExecuteWorkflowResult> {
  let loaded: LoadedHealthProject;
  try {
    loaded = await runStep(
      deps,
      run.workflowId,
      run.attempt,
      "LOAD_PROJECT",
      { projectId: intent.projectId },
      async (): Promise<LoadedHealthProject> => {
        const model = await readWithRetry(() =>
          deps.repo.loadProject(intent.projectId),
        );
        if (!model) return { model: undefined, latest: undefined };
        const latest = await readWithRetry(() =>
          deps.repo.loadLatestForecast(intent.projectId),
        );
        return { model, latest };
      },
    );
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "LOAD_PROJECT");
    }
    throw error;
  }

  await skipStep(deps, run.workflowId, "CHECK_REVISION");
  await skipStep(deps, run.workflowId, "PREPARE");

  const { model, latest } = loaded;
  if (!model) {
    return failRun(
      deps,
      intent,
      run,
      projectNotFoundProblem(intent.projectId),
      "EXECUTE_ENGINE",
    );
  }

  let health: ProjectHealthV094;
  try {
    health = await runStep(
      deps,
      run.workflowId,
      run.attempt,
      "EXECUTE_ENGINE",
      { revision: model.revision, latestVersion: latest?.version ?? null },
      async () => {
        const reader = {
          loadPredictionOutcomes: (projectId?: string) =>
            readWithRetry(() => deps.repo.loadPredictionOutcomes(projectId)),
        };
        return projectHealth(reader, model, latest);
      },
    );
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "EXECUTE_ENGINE");
    }
    throw error;
  }

  await skipStep(deps, run.workflowId, "COMMIT_SHADOW");

  const output: ResultOutput = { type: "FORECAST_HEALTH", data: health };
  const now = nowString(deps);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { output },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "SUCCEEDED",
        persisted: false,
        projectRevisionBefore: model.revision,
        projectRevisionAfter: model.revision,
        forecastVersion: latest?.version ?? null,
        output,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

interface LoadedRecoveryProject {
  model: ProjectModelV094 | undefined;
  latest: ForecastSnapshotV094 | undefined;
  baseline: ForecastSnapshotV094 | undefined;
}

const RECOVERY_LAYER_VERSION = "0.9.4";

async function runRecoveryQuery(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
): Promise<ExecuteWorkflowResult> {
  let loaded: LoadedRecoveryProject;
  try {
    loaded = await runStep(
      deps,
      run.workflowId,
      run.attempt,
      "LOAD_PROJECT",
      { projectId: intent.projectId },
      async (): Promise<LoadedRecoveryProject> => {
        const model = await readWithRetry(() =>
          deps.repo.loadProject(intent.projectId),
        );
        if (!model)
          return { model: undefined, latest: undefined, baseline: undefined };
        const latest = await readWithRetry(() =>
          deps.repo.loadLatestForecast(intent.projectId),
        );
        if (!latest) return { model, latest: undefined, baseline: undefined };
        const deltaFromSnapshotId = latest.deltaFromSnapshotId;
        const baseline = deltaFromSnapshotId
          ? await readWithRetry(() =>
              deps.repo.loadForecastById(intent.projectId, deltaFromSnapshotId),
            )
          : await readWithRetry(() =>
              deps.repo.loadLatestPublishedForecast(intent.projectId),
            );
        return { model, latest, baseline };
      },
    );
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "LOAD_PROJECT");
    }
    throw error;
  }

  await skipStep(deps, run.workflowId, "CHECK_REVISION");
  await skipStep(deps, run.workflowId, "PREPARE");

  const { model, latest, baseline } = loaded;
  if (!model) {
    return failRun(
      deps,
      intent,
      run,
      projectNotFoundProblem(intent.projectId),
      "EXECUTE_ENGINE",
    );
  }
  if (!latest) {
    return failRun(
      deps,
      intent,
      run,
      noForecastProblem(intent.projectId),
      "EXECUTE_ENGINE",
    );
  }

  const output = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "EXECUTE_ENGINE",
    {
      revision: model.revision,
      latestVersion: latest.version,
      baselineVersion: baseline?.version ?? null,
    },
    (): ResultOutput => {
      const recovery = analyzeRecovery(model, latest, baseline);
      const data: RecoveryResponseV094 = {
        projectId: intent.projectId,
        projectRevision: model.revision,
        latestVersion: latest.version,
        baselineVersion: baseline?.version ?? null,
        recovery,
        recoveryLayer: {
          version: RECOVERY_LAYER_VERSION,
          status: recovery.status,
          nextRiskDate: recovery.nextRiskDate ?? null,
          criticalExposureCount: recovery.criticalExposureCount ?? 0,
          blockedProtectionCount: recovery.blockedProtectionCount ?? 0,
          standbyRecoveryCapacityWorkdays:
            recovery.standbyRecoveryCapacityWorkdays ?? 0,
        },
        publicationGate: {
          forecastAllowed: true,
          commitmentEligible: false,
          publishable: false,
          mode: deps.authorization.mode,
        },
        stagingOnly: true,
      };
      return { type: "RECOVERY", data };
    },
  );

  await skipStep(deps, run.workflowId, "COMMIT_SHADOW");

  const now = nowString(deps);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { output },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "SUCCEEDED",
        persisted: false,
        projectRevisionBefore: model.revision,
        projectRevisionAfter: model.revision,
        forecastVersion: latest.version,
        output,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

async function runEvidencePreview(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
): Promise<ExecuteWorkflowResult> {
  if (intent.payload.type !== "EVIDENCE") {
    throw new Error(
      `EVIDENCE_PREVIEW intent ${intent.intentId} does not carry an EVIDENCE payload`,
    );
  }
  const event: ProjectEventInput = intent.payload.event;

  let loaded: LoadedProject;
  try {
    loaded = await runStep(
      deps,
      run.workflowId,
      run.attempt,
      "LOAD_PROJECT",
      { projectId: intent.projectId },
      async (): Promise<LoadedProject> => {
        const model = await readWithRetry(() =>
          deps.repo.loadProject(intent.projectId),
        );
        if (!model)
          return { model: undefined, latest: undefined, published: undefined };
        const [latest, published] = await Promise.all([
          readWithRetry(() => deps.repo.loadLatestForecast(intent.projectId)),
          readWithRetry(() =>
            deps.repo.loadLatestPublishedForecast(intent.projectId),
          ),
        ]);
        return { model, latest, published };
      },
    );
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "LOAD_PROJECT");
    }
    throw error;
  }

  const { model, latest, published } = loaded;
  if (!model) {
    return failRun(
      deps,
      intent,
      run,
      projectNotFoundProblem(intent.projectId),
      "CHECK_REVISION",
    );
  }
  const currentRevision = model.revision;

  const revisionCheck = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "CHECK_REVISION",
    { expected: intent.expectedProjectRevision, current: currentRevision },
    () => ({ ok: intent.expectedProjectRevision === currentRevision }),
  );

  if (!revisionCheck.ok) {
    const problem: WorkflowProblem = {
      code: "REVISION_CONFLICT",
      category: "REVISION",
      message: `Expected project revision ${String(intent.expectedProjectRevision)} does not match current revision ${String(currentRevision)}`,
      retryable: false,
      details: {
        currentRevision,
        expectedRevision: intent.expectedProjectRevision,
      },
    };
    return blockRun(deps, intent, run, problem, "PREPARE", currentRevision);
  }

  const preparedEvent = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "PREPARE",
    { event },
    () => event,
  );

  const comparisonBaseline = latest ?? published;
  const nextForecastVersion = (latest?.version ?? 0) + 1;

  const engineOutput = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "EXECUTE_ENGINE",
    {
      revision: currentRevision,
      latestVersion: latest?.version ?? null,
      event: preparedEvent,
    },
    async () => {
      const forecastRun: ForecastRunV094 = forecastAfterEvent(
        model,
        preparedEvent as unknown as Parameters<typeof forecastAfterEvent>[1],
        preparedEvent.receivedAt,
        nextForecastVersion,
        comparisonBaseline,
      );
      const reviewToken = await sha256Hex({
        projectRevision: currentRevision,
        latestForecastVersion: latest?.version ?? 0,
        event: preparedEvent,
        candidate: forecastRun.candidate,
        oversight: forecastRun.oversight,
      });
      return { forecastRun, reviewToken };
    },
  );

  await skipStep(deps, run.workflowId, "COMMIT_SHADOW");

  const mode = deps.authorization.mode;
  const data: EvidencePreviewResponseV094 = {
    projectRevision: currentRevision,
    baselineVersion: published?.version ?? null,
    latestVersion: latest?.version ?? null,
    comparisonVersion: comparisonBaseline?.version ?? null,
    candidate: engineOutput.forecastRun.candidate,
    delta: engineOutput.forecastRun.candidate.delta ?? null,
    recoveryAnalysis: engineOutput.forecastRun.candidate.recoveryAnalysis,
    supersededSources: engineOutput.forecastRun.candidate.supersededSources,
    impactActivityIds: engineOutput.forecastRun.candidate.impactActivityIds,
    oversight: engineOutput.forecastRun.oversight,
    forecastable: true,
    commitmentEligible: engineOutput.forecastRun.commitmentEligible,
    oversightPublishable: engineOutput.forecastRun.publishable,
    // `mode` is always "shadow" in this staging build; the "controlled" publish path is out of
    // Task 13's scope entirely (design §11 — only EVIDENCE_APPLY_SHADOW ever mutates, and that
    // kind is not implemented by this executor).
    publishable: false,
    reviewToken: engineOutput.reviewToken,
    persisted: false,
    mode,
    stagingOnly: mode === "shadow",
  };
  const output: ResultOutput = { type: "EVIDENCE_PREVIEW", data };

  const now = nowString(deps);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { output },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "SUCCEEDED",
        persisted: false,
        projectRevisionBefore: currentRevision,
        projectRevisionAfter: currentRevision,
        forecastVersion: latest?.version ?? null,
        output,
        oversight: engineOutput.forecastRun.oversight,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

/**
 * Task 14: the only intent kind that mutates domain state. Shares LOAD_PROJECT / CHECK_REVISION /
 * PREPARE / EXECUTE_ENGINE with `runEvidencePreview` (design §7.2's steps 4-7 are identical for
 * both evidence kinds), then adds COMMIT_SHADOW — persisting the event/candidate/oversight
 * atomically via `runCommitShadowStep`, only when oversight did not BLOCK (design §11: "An
 * oversight BLOCK yields a blocked result and no domain mutation").
 */
async function runEvidenceApplyShadow(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
): Promise<ExecuteWorkflowResult> {
  if (intent.payload.type !== "EVIDENCE") {
    throw new Error(
      `EVIDENCE_APPLY_SHADOW intent ${intent.intentId} does not carry an EVIDENCE payload`,
    );
  }
  const event: ProjectEventInput = intent.payload.event;

  let loaded: LoadedProject;
  try {
    loaded = await runStep(
      deps,
      run.workflowId,
      run.attempt,
      "LOAD_PROJECT",
      { projectId: intent.projectId },
      async (): Promise<LoadedProject> => {
        const model = await readWithRetry(() =>
          deps.repo.loadProject(intent.projectId),
        );
        if (!model)
          return { model: undefined, latest: undefined, published: undefined };
        const [latest, published] = await Promise.all([
          readWithRetry(() => deps.repo.loadLatestForecast(intent.projectId)),
          readWithRetry(() =>
            deps.repo.loadLatestPublishedForecast(intent.projectId),
          ),
        ]);
        return { model, latest, published };
      },
    );
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "LOAD_PROJECT");
    }
    throw error;
  }

  const { model, latest, published } = loaded;
  if (!model) {
    return failRun(
      deps,
      intent,
      run,
      projectNotFoundProblem(intent.projectId),
      "CHECK_REVISION",
    );
  }
  const currentRevision = model.revision;

  const revisionCheck = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "CHECK_REVISION",
    { expected: intent.expectedProjectRevision, current: currentRevision },
    () => ({ ok: intent.expectedProjectRevision === currentRevision }),
  );

  if (!revisionCheck.ok) {
    const problem: WorkflowProblem = {
      code: "REVISION_CONFLICT",
      category: "REVISION",
      message: `Expected project revision ${String(intent.expectedProjectRevision)} does not match current revision ${String(currentRevision)}`,
      retryable: false,
      details: {
        currentRevision,
        expectedRevision: intent.expectedProjectRevision,
      },
    };
    return blockRun(deps, intent, run, problem, "PREPARE", currentRevision);
  }

  const preparedEvent = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "PREPARE",
    { event },
    () => event,
  );

  const comparisonBaseline = latest ?? published;
  const nextForecastVersion = (latest?.version ?? 0) + 1;

  const engineOutput = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "EXECUTE_ENGINE",
    {
      revision: currentRevision,
      latestVersion: latest?.version ?? null,
      event: preparedEvent,
    },
    () => {
      const forecastRun: ForecastRunV094 = forecastAfterEvent(
        model,
        preparedEvent as unknown as Parameters<typeof forecastAfterEvent>[1],
        preparedEvent.receivedAt,
        nextForecastVersion,
        comparisonBaseline,
      );
      return { forecastRun };
    },
  );
  const { forecastRun } = engineOutput;

  if (forecastRun.oversight.decision === "BLOCK") {
    const problem: WorkflowProblem = {
      code: "OVERSIGHT_BLOCKED",
      category: "POLICY",
      message: `Oversight review ${forecastRun.oversight.id} blocked this shadow evidence application`,
      retryable: false,
      details: { oversightId: forecastRun.oversight.id },
    };
    return blockRun(
      deps,
      intent,
      run,
      problem,
      "COMMIT_SHADOW",
      currentRevision,
    );
  }

  try {
    await runCommitShadowStep(deps, run, intent, preparedEvent, forecastRun);
  } catch (error) {
    if (error instanceof ReadRetryExhaustedError) {
      return interruptRun(deps, intent, run, "COMMIT_SHADOW");
    }
    if (error instanceof RevisionConflictError) {
      const problem: WorkflowProblem = {
        code: "REVISION_CONFLICT",
        category: "REVISION",
        message: `Project ${intent.projectId} revision changed concurrently before the shadow commit could apply`,
        retryable: false,
        details: { currentRevision },
      };
      return blockRun(
        deps,
        intent,
        run,
        problem,
        "COMMIT_SHADOW",
        currentRevision,
      );
    }
    if (error instanceof CommitStateAmbiguousError) {
      const problem: WorkflowProblem = {
        code: "COMMIT_STATE_AMBIGUOUS",
        category: "INTERNAL",
        message: error.message,
        retryable: false,
      };
      return failRun(deps, intent, run, problem, "COMMIT_SHADOW");
    }
    throw error;
  }

  const nextRevision = currentRevision + 1;
  const data: ShadowTransitionResponseV094 = {
    applied: true,
    stagingOnly: true,
    projectRevision: nextRevision,
    candidate: forecastRun.candidate,
    delta: forecastRun.candidate.delta ?? null,
    recoveryAnalysis: forecastRun.candidate.recoveryAnalysis,
    supersededSources: forecastRun.candidate.supersededSources,
    impactActivityIds: forecastRun.candidate.impactActivityIds,
    oversight: forecastRun.oversight,
    publicationGate: {
      forecastAllowed: true,
      commitmentEligible: forecastRun.commitmentEligible,
      publishable: false,
      mode: "shadow",
    },
  };
  const output: ResultOutput = { type: "SHADOW_TRANSITION", data };

  const now = nowString(deps);
  const result = await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "BUILD_RESULT",
    { output },
    () =>
      buildResult({
        resultId: deps.resultIds.next(),
        intentId: intent.intentId,
        workflowId: run.workflowId,
        projectId: intent.projectId,
        intentKind: intent.kind,
        status: "SUCCEEDED",
        persisted: true,
        projectRevisionBefore: currentRevision,
        projectRevisionAfter: nextRevision,
        forecastVersion: forecastRun.candidate.version,
        output,
        oversight: forecastRun.oversight,
        createdAt: now,
      }),
  );
  const finalRun = await finalizeStep(deps, run, result);
  return { outcome: "COMPLETED", run: finalRun, result };
}

async function runSteps(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
  run: WorkflowRunV1,
): Promise<ExecuteWorkflowResult> {
  await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "RECEIVE",
    { workflowId: run.workflowId },
    () => ({ intentId: intent.intentId, intentHash: run.intentHash }),
  );

  await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "VALIDATE",
    { intent },
    () => {
      const validated = validateIntent(intent);
      if (!validated.valid) {
        throw new Error(
          `Intent ${intent.intentId} failed re-validation inside the executor: ${JSON.stringify(validated.problems)}`,
        );
      }
      return { valid: true };
    },
  );

  const policyProblem =
    assertStagingShadowPolicy({
      mode: deps.authorization.mode,
      workerName: deps.authorization.workerName,
    }) ?? assertPermittedEffect(intent.kind, intent.requestedEffect);
  if (policyProblem) {
    return failRun(deps, intent, run, policyProblem, "AUTHORIZE_POLICY");
  }
  await runStep(
    deps,
    run.workflowId,
    run.attempt,
    "AUTHORIZE_POLICY",
    {
      mode: deps.authorization.mode,
      workerName: deps.authorization.workerName,
      kind: intent.kind,
      requestedEffect: intent.requestedEffect,
    },
    () => ({ authorized: true }),
  );

  switch (intent.kind) {
    case "FORECAST_QUERY":
      return runForecastQuery(deps, intent, run);
    case "FORECAST_HEALTH_QUERY":
      return runForecastHealthQuery(deps, intent, run);
    case "RECOVERY_QUERY":
      return runRecoveryQuery(deps, intent, run);
    case "EVIDENCE_PREVIEW":
      return runEvidencePreview(deps, intent, run);
    case "EVIDENCE_APPLY_SHADOW":
      return runEvidenceApplyShadow(deps, intent, run);
  }
}

const LINEAR_PATH_TO_RUNNING: Partial<Record<WorkflowState, WorkflowState>> = {
  RECEIVED: "VALIDATING",
  VALIDATING: "READY",
  READY: "RUNNING",
  INTERRUPTED: "RUNNING",
};

/**
 * Advances the fixed RECEIVED -> VALIDATING -> READY -> RUNNING bookkeeping path one transition
 * at a time, incrementing `attempt` exactly on an INTERRUPTED -> RUNNING resume (a new workflow
 * attempt, design §10.3/§10.4).
 *
 * Task 13 supports serial re-entry only, not concurrent resume leasing (that is Task 14 scope).
 * But two concurrent callers can still both load the same INTERRUPTED run and both attempt this
 * same CAS transition — only one `updateWorkflowRunState` call actually applies (its guarded
 * WHERE clause matches for exactly one caller); the loser must not silently reload and proceed as
 * though it had won, since after the winner commits, a blind reload would show state RUNNING and
 * be indistinguishable from having advanced it itself. Every transition attempt's own `applied`
 * result is therefore checked; a `false` here means *this caller* lost a race and must return
 * without ever reaching `runSteps`.
 */
async function advanceToRunning(
  deps: WorkflowExecutorDeps,
  run: WorkflowRunV1,
): Promise<{ run: WorkflowRunV1 } | { lostRace: true }> {
  // A claim can only observe RUNNING already, at entry, if some other call performed the
  // transition — a brand-new claim always starts RECEIVED, and this function's own loop is what
  // ever moves a run *to* RUNNING. Observing RUNNING here therefore never grants execution
  // ownership by itself: this caller did not win any CAS to get here, so it must not proceed into
  // runSteps any more than a caller that loses the loop's own CAS below does.
  if (run.state === "RUNNING") {
    return { lostRace: true };
  }
  let current = run;
  while (current.state !== "RUNNING") {
    const nextState = LINEAR_PATH_TO_RUNNING[current.state];
    if (!nextState) {
      throw new Error(
        `Cannot advance workflow run ${current.workflowId} to RUNNING from state ${current.state}`,
      );
    }
    const resuming = current.state === "INTERRUPTED";
    const applied = await deps.repo.updateWorkflowRunState({
      workflowId: current.workflowId,
      expectedState: current.state,
      nextState,
      now: nowString(deps),
      markStarted: nextState === "RUNNING",
      resumable: false,
      incrementAttempt: resuming,
    });
    if (!applied) {
      return { lostRace: true };
    }
    const reloaded = await deps.repo.loadWorkflowRun(current.workflowId);
    if (!reloaded) {
      throw new Error(
        `Workflow run ${current.workflowId} vanished while advancing to RUNNING`,
      );
    }
    current = reloaded;
  }
  return { run: current };
}

/**
 * The sole executor entrypoint: canonical IntentV1 + injected dependencies only. Claims the
 * intent (Task 12), advances the run to RUNNING (resuming an INTERRUPTED run as a new workflow
 * attempt), then walks the canonical step order for the intent's kind. A duplicate/conflicting
 * claim, an already-terminal replay, and a lost concurrent-resume race all return without
 * executing (or re-executing) any workflow step.
 */
export async function executeWorkflow(
  deps: WorkflowExecutorDeps,
  intent: IntentV1,
): Promise<ExecuteWorkflowResult> {
  const claim = await deps.repo.claimIntent({
    intent,
    workflowId: deps.workflowIds.next(),
    maxAttempts: TASK13_MAX_WORKFLOW_ATTEMPTS,
    now: nowString(deps),
  });
  if (!("run" in claim)) {
    return claim;
  }

  let run = claim.run;

  if (isTerminalWorkflowState(run.state)) {
    const result = run.resultId
      ? await deps.repo.loadWorkflowResult(run.resultId)
      : undefined;
    if (!result) {
      throw new Error(
        `Workflow run ${run.workflowId} is terminal but its result ${String(run.resultId)} could not be loaded`,
      );
    }
    return { outcome: "COMPLETED", run, result };
  }

  const advanced = await advanceToRunning(deps, run);
  if ("lostRace" in advanced) {
    const current = await deps.repo.loadWorkflowRun(run.workflowId);
    if (!current) {
      throw new Error(
        `Workflow run ${run.workflowId} vanished after losing a concurrent resume race`,
      );
    }
    return { outcome: "CONCURRENT_RESUME_LOST", run: current };
  }
  run = advanced.run;
  return runSteps(deps, intent, run);
}
