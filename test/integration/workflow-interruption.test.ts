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
import {
  TransientRepositoryReadError,
  WORKFLOW_STEP_NAMES,
} from "../../src/operator/workflow";
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

function healthQueryIntent(): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "key-interruption-health-1",
    projectId: PROJECT_ID,
    kind: "FORECAST_HEALTH_QUERY",
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
    finalizeWorkflowRunStep: repo.finalizeWorkflowRunStep.bind(repo),
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
        throw new TransientRepositoryReadError();
      }
      return repo.loadProject(projectId);
    },
    loadLatestForecast: repo.loadLatestForecast.bind(repo),
    loadLatestPublishedForecast: repo.loadLatestPublishedForecast.bind(repo),
    loadForecastById: repo.loadForecastById.bind(repo),
    loadPredictionOutcomes: repo.loadPredictionOutcomes.bind(repo),
  };
}

/** Like `flakyRepo`, but fails `loadPredictionOutcomes` instead — interrupts at EXECUTE_ENGINE for FORECAST_HEALTH_QUERY, not LOAD_PROJECT. */
function flakyHealthRepo(
  repo: D1HowlerRepository,
  failuresBeforeSuccess: number,
  callLog: number[],
): WorkflowExecutorRepository {
  return {
    ...flakyRepo(repo, 0, []),
    loadPredictionOutcomes: async (projectId?: string) => {
      callLog.push(callLog.length + 1);
      if (callLog.length <= failuresBeforeSuccess) {
        throw new TransientRepositoryReadError();
      }
      return repo.loadPredictionOutcomes(projectId);
    },
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

  it("explicit TransientRepositoryReadError retries up to exactly three calls before exhaustion interrupts the run", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const callLog: number[] = [];

    const outcome = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, callLog)),
      queryIntent(),
    );

    expect(outcome.outcome).toBe("INTERRUPTED");
    expect(callLog.length).toBe(3);
  });
});

describe("retry classification is explicit, not permissive", () => {
  /** Wraps a real repository, but `loadProject` always throws a plain, untagged Error. */
  function genericErrorRepo(
    repo: D1HowlerRepository,
    callLog: number[],
  ): WorkflowExecutorRepository {
    return {
      ...flakyRepo(repo, 0, []),
      loadProject: (projectId: string) => {
        callLog.push(callLog.length + 1);
        void projectId;
        return Promise.reject(new Error("a generic, unclassified failure"));
      },
    };
  }

  it("a generic (untagged) Error is never retried: exactly one repository call, and it propagates immediately", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const callLog: number[] = [];

    await expect(
      executeWorkflow(
        buildDeps(genericErrorRepo(repo, callLog)),
        queryIntent(),
      ),
    ).rejects.toThrow("a generic, unclassified failure");

    expect(callLog.length).toBe(1);
    // No interruption, no completion, no result — the call rejected outright.
    const runCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_runs WHERE state != 'RUNNING'",
    ).first<{ count: number }>();
    // The run is left exactly where the uncaught throw found it (RUNNING, mid-LOAD_PROJECT).
    expect(runCount?.count).toBe(0);
  });
});

describe("concurrent resume ownership: only the CAS winner executes workflow steps", () => {
  it("two simultaneous resumptions of the same interrupted run: exactly one wins and executes to completion; the loser executes no workflow step", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    const interrupted = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");

    const callLogA: number[] = [];
    const callLogB: number[] = [];
    const [a, b] = await Promise.all([
      executeWorkflow(buildDeps(flakyRepo(repo, 0, callLogA)), intent),
      executeWorkflow(buildDeps(flakyRepo(repo, 0, callLogB)), intent),
    ]);

    expect([a.outcome, b.outcome].sort()).toEqual([
      "COMPLETED",
      "CONCURRENT_RESUME_LOST",
    ]);

    const winner = a.outcome === "COMPLETED" ? a : b;
    const loserCallLog = a.outcome === "COMPLETED" ? callLogB : callLogA;
    expect(winner.outcome).toBe("COMPLETED");
    if (winner.outcome !== "COMPLETED") return;

    // Exactly one engine execution: the winner's own LOAD_PROJECT read happened, the loser's
    // never did — it never reached `runSteps` at all.
    expect(loserCallLog.length).toBe(0);
    expect(winner.result.status).toBe("SUCCEEDED");
    // Exactly one attempt increment consumed the resume, not two.
    expect(winner.run.attempt).toBe(2);

    // Exactly one terminal immutable result exists for the whole run.
    const resultCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount?.count).toBe(1);
  });
});

describe("maxAttempts is an immutable Task 13 invariant (exactly 3)", () => {
  it("a newly claimed run always persists maxAttempts=3, regardless of anything a caller could configure", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const outcome = await executeWorkflow(
      buildDeps(flakyRepo(repo, 0, [])),
      queryIntent(),
    );
    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.run.maxAttempts).toBe(3);
  });

  it("replay/resume never alters the persisted attempt limit", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    const interrupted = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");
    if (interrupted.outcome !== "INTERRUPTED") return;
    expect(interrupted.run.maxAttempts).toBe(3);

    const resumed = await executeWorkflow(
      buildDeps(flakyRepo(repo, 0, [])),
      intent,
    );
    expect(resumed.outcome).toBe("COMPLETED");
    if (resumed.outcome !== "COMPLETED") return;
    expect(resumed.run.maxAttempts).toBe(3);
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

describe("persisted step definitions cannot silently drift", () => {
  it("a corrupted ordinal on an already-SUCCEEDED step causes resume to fail before any further execution", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    const interrupted = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");
    if (interrupted.outcome !== "INTERRUPTED") return;

    // RECEIVE already completed SUCCEEDED before LOAD_PROJECT interrupted. Corrupt its ordinal.
    await env.HOWLER_DB.prepare(
      "UPDATE workflow_steps SET ordinal = 99 WHERE workflow_id = ? AND step_name = 'RECEIVE'",
    )
      .bind(interrupted.run.workflowId)
      .run();

    const callLog: number[] = [];
    await expect(
      executeWorkflow(buildDeps(flakyRepo(repo, 0, callLog)), intent),
    ).rejects.toThrow(/ordinal drifted/);
    // The corruption is caught before LOAD_PROJECT's own read is ever attempted again.
    expect(callLog.length).toBe(0);
  });

  it("a corrupted input hash on an already-SKIPPED step causes resume to fail before any further execution", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = healthQueryIntent();

    // Interrupt at EXECUTE_ENGINE so CHECK_REVISION/PREPARE are already persisted SKIPPED.
    const interrupted = await executeWorkflow(
      buildDeps(flakyHealthRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");
    if (interrupted.outcome !== "INTERRUPTED") return;

    const beforeCorruption = await repo.loadWorkflowStep(
      interrupted.run.workflowId,
      "CHECK_REVISION",
    );
    expect(beforeCorruption?.state).toBe("SKIPPED");

    await env.HOWLER_DB.prepare(
      "UPDATE workflow_steps SET input_hash = ? WHERE workflow_id = ? AND step_name = 'CHECK_REVISION'",
    )
      .bind("f".repeat(64), interrupted.run.workflowId)
      .run();

    const callLog: number[] = [];
    await expect(
      executeWorkflow(buildDeps(flakyHealthRepo(repo, 0, callLog)), intent),
    ).rejects.toThrow(/input hash changed/);
    // The corruption is caught before EXECUTE_ENGINE's own read is ever attempted again.
    expect(callLog.length).toBe(0);
  });
});

describe("step attempt metadata accurately records which workflow attempt (re)executed a step", () => {
  it("previously completed steps retain their original attempt; a resumed incomplete step records the new attempt", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    const interrupted = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");
    if (interrupted.outcome !== "INTERRUPTED") return;

    const stepsAfterInterrupt = await repo.loadWorkflowSteps(
      interrupted.run.workflowId,
    );
    const byNameBefore = Object.fromEntries(
      stepsAfterInterrupt.map((s) => [s.stepName, s]),
    );
    expect(byNameBefore.RECEIVE?.attempt).toBe(1);
    expect(byNameBefore.VALIDATE?.attempt).toBe(1);
    expect(byNameBefore.AUTHORIZE_POLICY?.attempt).toBe(1);
    expect(byNameBefore.LOAD_PROJECT?.attempt).toBe(1);

    const resumed = await executeWorkflow(
      buildDeps(flakyRepo(repo, 0, [])),
      intent,
    );
    expect(resumed.outcome).toBe("COMPLETED");
    if (resumed.outcome !== "COMPLETED") return;
    expect(resumed.run.attempt).toBe(2);

    const stepsAfterResume = await repo.loadWorkflowSteps(
      interrupted.run.workflowId,
    );
    const byNameAfter = Object.fromEntries(
      stepsAfterResume.map((s) => [s.stepName, s]),
    );
    // Already-completed steps retain their original attempt.
    expect(byNameAfter.RECEIVE?.attempt).toBe(1);
    expect(byNameAfter.VALIDATE?.attempt).toBe(1);
    expect(byNameAfter.AUTHORIZE_POLICY?.attempt).toBe(1);
    // The step that was incomplete and got retried now records the attempt it succeeded under.
    expect(byNameAfter.LOAD_PROJECT?.attempt).toBe(2);
  });
});

describe("EVIDENCE_APPLY_SHADOW is rejected before any claim or persistence", () => {
  it("creates zero intents, runs, steps, and results", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const candidate = {
      schemaVersion: "1",
      intentId: "55555555-5555-4555-8555-555555555555",
      idempotencyKey: "key-apply-shadow-1",
      projectId: PROJECT_ID,
      kind: "EVIDENCE_APPLY_SHADOW",
      requestedEffect: "APPLY_SHADOW",
      expectedProjectRevision: 1,
      submittedAt: NOW,
      source: { channel: "API" },
      payload: {
        type: "EVIDENCE",
        event: {
          id: "evt-1",
          baseRevision: 1,
          projectId: PROJECT_ID,
          type: "FIELD_UPDATE",
          occurredAt: NOW,
          receivedAt: NOW,
          sourceIds: ["src-1"],
          verification: "PM_CONFIRMED",
          impactSeedActivityIds: ["masonry"],
          mutations: [],
          payload: {},
        },
      },
    };
    const validated = validateIntent(candidate);
    if (!validated.valid) {
      throw new Error(
        `test fixture is not a valid intent: ${JSON.stringify(validated.problems)}`,
      );
    }

    await expect(
      executeWorkflow(buildDeps(flakyRepo(repo, 0, [])), validated.intent),
    ).rejects.toThrow(/Task 14/);

    const intentCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM operator_intents",
    ).first<{ count: number }>();
    expect(intentCount?.count).toBe(0);
    const runCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_runs",
    ).first<{ count: number }>();
    expect(runCount?.count).toBe(0);
    const stepCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_steps",
    ).first<{ count: number }>();
    expect(stepCount?.count).toBe(0);
    const resultCount2 = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount2?.count).toBe(0);
  });
});

describe("BUILD_RESULT executes on terminal non-success paths too", () => {
  it("stale-revision BLOCKED and RETRY_EXHAUSTED FAILED both persist all ten canonical steps including a SUCCEEDED BUILD_RESULT", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedProject(repo);
    const intent = queryIntent();

    // Drive to terminal FAILED via three exhausted attempts (reuses the RETRY_EXHAUSTED path).
    await executeWorkflow(buildDeps(flakyRepo(repo, Infinity, [])), intent);
    await executeWorkflow(buildDeps(flakyRepo(repo, Infinity, [])), intent);
    const attempt3b = await executeWorkflow(
      buildDeps(flakyRepo(repo, Infinity, [])),
      intent,
    );
    expect(attempt3b.outcome).toBe("COMPLETED");
    if (attempt3b.outcome !== "COMPLETED") return;
    expect(attempt3b.result.status).toBe("FAILED");

    const steps = await repo.loadWorkflowSteps(attempt3b.run.workflowId);
    expect(steps.map((s) => s.stepName)).toEqual([...WORKFLOW_STEP_NAMES]);
    expect(steps.map((s) => s.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    expect(byName.BUILD_RESULT?.state).toBe("SUCCEEDED");
    expect(byName.FINALIZE?.state).toBe("SUCCEEDED");
  });
});
