/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import { createFixedClock } from "../helpers/clock";
import { createDeterministicIds } from "../helpers/ids";
import { createDeboardSeed } from "../../src/worker/deboard-seed";
import { forecastInitial } from "../../src/engine/engine";
import { D1HowlerRepository } from "../../src/worker/repository";
import { validateIntent } from "../../src/operator/intent";
import type { IntentV1 } from "../../src/operator/intent";
import { WORKFLOW_STEP_NAMES } from "../../src/operator/workflow";
import type {
  AuthorizationAttestation,
  WorkflowExecutorDeps,
  WorkflowExecutorRepository,
} from "../../src/operator/workflow";
import { executeWorkflow } from "../../src/operator/workflow";

const operatorMigrationSources = import.meta.glob<string>(
  "../../migrations/*.sql",
  { eager: true, import: "default", query: "?raw" },
);
function operatorMigrationSql(): string {
  const entry = Object.entries(operatorMigrationSources).find(([p]) =>
    p.endsWith("/0002_operator_runs.sql"),
  );
  if (!entry) throw new Error("missing migration 0002_operator_runs.sql");
  return entry[1];
}

const GENERATED_AT = "2026-08-30T12:00:00.000Z";
const NOW = "2026-08-30T13:00:00.000Z";
const PROJECT_ID = "deboard-v091";

const AUTHORIZATION: AuthorizationAttestation = {
  authenticated: true,
  mode: "shadow",
  workerName: "jarvis-voice-staging",
};

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

async function seedProject(repo: D1HowlerRepository) {
  const model = createDeboardSeed();
  const initial = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, initial.candidate, initial.oversight);
}

function queryIntent(): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "key-interruption-1",
    projectId: PROJECT_ID,
    kind: "FORECAST_QUERY",
    requestedEffect: "READ_ONLY",
    expectedProjectRevision: null,
    submittedAt: NOW,
    source: { channel: "API" },
    payload: { type: "QUERY" },
  };
  const result = validateIntent(candidate);
  if (!result.valid) {
    throw new Error(
      `test fixture is not a valid intent: ${JSON.stringify(result.problems)}`,
    );
  }
  return result.intent;
}

/**
 * Wraps a real repository, delegating every method except `loadProject`, which fails with a
 * generic (transient-classified) error for the first `failuresBeforeSuccess` calls made through
 * *this specific wrapper instance*, then delegates to the real repository. Each call increments
 * `callLog` so tests can prove exactly how many underlying reads actually happened.
 */
function flakyRepo(
  repo: D1HowlerRepository,
  failuresBeforeSuccess: number,
  callLog: number[],
): WorkflowExecutorRepository {
  return {
    claimIntent: repo.claimIntent.bind(repo),
    loadWorkflowRun: repo.loadWorkflowRun.bind(repo),
    updateWorkflowRunState: repo.updateWorkflowRunState.bind(repo),
    finalizeWorkflowRun: repo.finalizeWorkflowRun.bind(repo),
    loadWorkflowResult: repo.loadWorkflowResult.bind(repo),
    loadWorkflowStep: repo.loadWorkflowStep.bind(repo),
    ensureWorkflowStep: repo.ensureWorkflowStep.bind(repo),
    startWorkflowStep: repo.startWorkflowStep.bind(repo),
    completeWorkflowStep: repo.completeWorkflowStep.bind(repo),
    skipWorkflowStep: repo.skipWorkflowStep.bind(repo),
    failWorkflowStep: repo.failWorkflowStep.bind(repo),
    loadProject: async (projectId: string) => {
      callLog.push(callLog.length + 1);
      if (callLog.length <= failuresBeforeSuccess) {
        throw new Error("D1 read failed (transient)");
      }
      return repo.loadProject(projectId);
    },
    loadLatestForecast: repo.loadLatestForecast.bind(repo),
    loadLatestPublishedForecast: repo.loadLatestPublishedForecast.bind(repo),
    loadForecastById: repo.loadForecastById.bind(repo),
    loadPredictionOutcomes: repo.loadPredictionOutcomes.bind(repo),
  };
}

function buildDeps(
  executorRepo: WorkflowExecutorRepository,
): WorkflowExecutorDeps {
  return {
    repo: executorRepo,
    clock: createFixedClock(NOW),
    workflowIds: createDeterministicIds("wf"),
    resultIds: createDeterministicIds("result"),
    authorization: AUTHORIZATION,
  };
}

describe("transient read retry within budget", () => {
  it("two transient failures followed by a third successful call complete the workflow without interruption", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const callLog: number[] = [];

    const outcome = await executeWorkflow(
      buildDeps(flakyRepo(repo, 2, callLog)),
      queryIntent(),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("SUCCEEDED");
    expect(outcome.run.state).toBe("SUCCEEDED");
    expect(outcome.run.attempt).toBe(1);
    // Exactly 3 loadProject calls: 2 failures + 1 success, all within the same attempt/step.
    expect(callLog.length).toBe(3);
  });
});

describe("one exhausted workflow attempt interrupts, and serial re-entry resumes without rerunning completed steps", () => {
  it("interrupts with a retryable problem and no result, preserving already-completed checkpoints; resuming completes the run", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    // Attempt 1: loadProject fails on every call (budget of 3 exhausted) -> INTERRUPTED.
    const firstCallLog: number[] = [];
    const interrupted = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, firstCallLog)),
      intent,
    );

    expect(interrupted.outcome).toBe("INTERRUPTED");
    if (interrupted.outcome !== "INTERRUPTED") return;
    expect(interrupted.run.state).toBe("INTERRUPTED");
    expect(interrupted.run.attempt).toBe(1);
    expect(interrupted.run.resumable).toBe(true);
    expect(interrupted.run.interruption?.retryable).toBe(true);
    expect(interrupted.run.resultId).toBeUndefined();
    expect(firstCallLog.length).toBe(3);

    const resultCountAfterInterrupt = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCountAfterInterrupt?.count).toBe(0);

    const stepsAfterInterrupt = await repo.loadWorkflowSteps(
      interrupted.run.workflowId,
    );
    const byNameAfterInterrupt = Object.fromEntries(
      stepsAfterInterrupt.map((s) => [s.stepName, s]),
    );
    expect(byNameAfterInterrupt.RECEIVE?.state).toBe("SUCCEEDED");
    expect(byNameAfterInterrupt.VALIDATE?.state).toBe("SUCCEEDED");
    expect(byNameAfterInterrupt.AUTHORIZE_POLICY?.state).toBe("SUCCEEDED");
    const completedAtBeforeResume = {
      RECEIVE: byNameAfterInterrupt.RECEIVE?.completedAt,
      VALIDATE: byNameAfterInterrupt.VALIDATE?.completedAt,
      AUTHORIZE_POLICY: byNameAfterInterrupt.AUTHORIZE_POLICY?.completedAt,
    };
    // LOAD_PROJECT never reached SUCCEEDED (it was left RUNNING when the retry budget exhausted).
    expect(byNameAfterInterrupt.LOAD_PROJECT?.state).not.toBe("SUCCEEDED");

    // Resume: a fresh call into the executor for the same intent, this time with a healthy repo.
    const secondCallLog: number[] = [];
    const resumed = await executeWorkflow(
      buildDeps(flakyRepo(repo, 0, secondCallLog)),
      intent,
    );

    expect(resumed.outcome).toBe("COMPLETED");
    if (resumed.outcome !== "COMPLETED") return;
    expect(resumed.result.status).toBe("SUCCEEDED");
    expect(resumed.run.state).toBe("SUCCEEDED");
    // Exactly one more workflow attempt was consumed by the resume.
    expect(resumed.run.attempt).toBe(2);
    // Exactly one immutable result exists for the whole run.
    const resultCountAfterResume = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCountAfterResume?.count).toBe(1);

    // Serial re-entry did not rerun the already-completed steps: their persisted completedAt is
    // byte-for-byte unchanged from right after the interrupted attempt.
    const stepsAfterResume = await repo.loadWorkflowSteps(
      interrupted.run.workflowId,
    );
    const byNameAfterResume = Object.fromEntries(
      stepsAfterResume.map((s) => [s.stepName, s]),
    );
    expect(byNameAfterResume.RECEIVE?.completedAt).toBe(
      completedAtBeforeResume.RECEIVE,
    );
    expect(byNameAfterResume.VALIDATE?.completedAt).toBe(
      completedAtBeforeResume.VALIDATE,
    );
    expect(byNameAfterResume.AUTHORIZE_POLICY?.completedAt).toBe(
      completedAtBeforeResume.AUTHORIZE_POLICY,
    );
    expect(stepsAfterResume.map((s) => s.stepName)).toEqual([
      ...WORKFLOW_STEP_NAMES,
    ]);
    expect(byNameAfterResume.LOAD_PROJECT?.state).toBe("SUCCEEDED");
  });

  it("the third exhausted workflow attempt fails terminally with RETRY_EXHAUSTED and exactly one immutable result", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    // Attempt 1: exhausted -> INTERRUPTED (attempt stays 1).
    const attempt1 = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(attempt1.outcome).toBe("INTERRUPTED");

    // Attempt 2 (resume): exhausted again -> INTERRUPTED (attempt becomes 2).
    const attempt2 = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(attempt2.outcome).toBe("INTERRUPTED");
    if (attempt2.outcome !== "INTERRUPTED") return;
    expect(attempt2.run.attempt).toBe(2);

    // Attempt 3 (resume): exhausted again, but this is the final allowed attempt -> terminal FAILED.
    const attempt3 = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );

    expect(attempt3.outcome).toBe("COMPLETED");
    if (attempt3.outcome !== "COMPLETED") return;
    expect(attempt3.result.status).toBe("FAILED");
    expect(attempt3.result.problem?.code).toBe("RETRY_EXHAUSTED");
    expect(attempt3.result.problem?.retryable).toBe(false);
    expect(attempt3.run.state).toBe("FAILED");
    expect(attempt3.run.resumable).toBe(false);

    const resultCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount?.count).toBe(1);
  });
});
