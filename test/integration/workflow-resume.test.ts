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
import { forecastAfterEvent, forecastInitial } from "../../src/engine/engine";
import { D1HowlerRepository } from "../../src/worker/repository";
import { validateIntent } from "../../src/operator/intent";
import type { IntentV1 } from "../../src/operator/intent";
import { TransientRepositoryReadError } from "../../src/operator/workflow";
import type {
  AuthorizationAttestation,
  WorkflowExecutorDeps,
  WorkflowExecutorRepository,
} from "../../src/operator/workflow";
import { executeWorkflow } from "../../src/operator/workflow";
import type {
  ProjectEventV094,
  ProjectModelV094,
} from "../../src/domain/types";

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

const GENERATED_AT = "2026-08-27T12:00:00.000Z";
const NOW = "2026-08-30T13:00:00.000Z";
const PROJECT_ID = "shadow-p1";

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

function minimalModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: PROJECT_ID,
    revision: 0,
    name: "Shadow Test Project",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {
      a1: {
        id: "a1",
        name: "Activity One",
        phase: "Phase",
        state: "NOT_STARTED",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: [],
        sourceIds: [],
      },
    },
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

async function seedMinimalProject(repo: D1HowlerRepository): Promise<void> {
  const model = minimalModel();
  const initial = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, initial.candidate, initial.oversight);
}

function benignEvent(id: string, baseRevision: number): ProjectEventV094 {
  return {
    id,
    baseRevision,
    projectId: PROJECT_ID,
    type: "FIELD_UPDATE",
    occurredAt: NOW,
    receivedAt: NOW,
    sourceIds: [],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["a1"],
    mutations: [],
    payload: {},
  };
}

function applyShadowIntent(
  event: ProjectEventV094,
  overrides: Partial<IntentV1> = {},
): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "66666666-6666-4666-8666-666666666666",
    idempotencyKey: "key-resume-1",
    projectId: PROJECT_ID,
    kind: "EVIDENCE_APPLY_SHADOW",
    requestedEffect: "APPLY_SHADOW",
    expectedProjectRevision: event.baseRevision,
    submittedAt: NOW,
    source: { channel: "API" },
    payload: { type: "EVIDENCE", event },
    ...overrides,
  };
  const result = validateIntent(candidate);
  if (!result.valid) {
    throw new Error(
      `test fixture is not a valid intent: ${JSON.stringify(result.problems)}`,
    );
  }
  return result.intent;
}

function passthroughRepo(repo: D1HowlerRepository): WorkflowExecutorRepository {
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
    loadProject: repo.loadProject.bind(repo),
    loadLatestForecast: repo.loadLatestForecast.bind(repo),
    loadLatestPublishedForecast: repo.loadLatestPublishedForecast.bind(repo),
    loadForecastById: repo.loadForecastById.bind(repo),
    loadPredictionOutcomes: repo.loadPredictionOutcomes.bind(repo),
    commitShadowTransition: repo.commitShadowTransition.bind(repo),
    loadEventById: repo.loadEventById.bind(repo),
    loadOversightReviewById: repo.loadOversightReviewById.bind(repo),
  };
}

/**
 * Wraps a real repository, failing `loadEventById` (COMMIT_SHADOW's reconciliation read) with a
 * transient-classified error for the first `failuresBeforeSuccess` calls made through *this
 * specific wrapper instance*, then delegating to the real repository.
 */
function flakyCommitReconciliationRepo(
  repo: D1HowlerRepository,
  failuresBeforeSuccess: number,
  callLog: number[],
): WorkflowExecutorRepository {
  return {
    ...passthroughRepo(repo),
    loadEventById: async (projectId: string, eventId: string) => {
      callLog.push(callLog.length + 1);
      if (callLog.length <= failuresBeforeSuccess) {
        throw new TransientRepositoryReadError();
      }
      return repo.loadEventById(projectId, eventId);
    },
  };
}

describe("EVIDENCE_APPLY_SHADOW: transient interruption during COMMIT_SHADOW reconciliation, then resume", () => {
  it("interrupts (no mutation yet), then a resume with the same intent completes the commit exactly once", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);
    const intent = applyShadowIntent(benignEvent("evt-resume-1", 0));

    const interrupted = await executeWorkflow(
      buildDeps(flakyCommitReconciliationRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");
    if (interrupted.outcome !== "INTERRUPTED") return;
    expect(interrupted.run.interruption?.code).toBe("TRANSIENT_READ_EXHAUSTED");

    // No domain mutation happened before the interruption.
    expect((await repo.loadProject(PROJECT_ID))?.revision).toBe(0);

    const resumed = await executeWorkflow(
      buildDeps(flakyCommitReconciliationRepo(repo, 0, [])),
      intent,
    );
    expect(resumed.outcome).toBe("COMPLETED");
    if (resumed.outcome !== "COMPLETED") return;
    expect(resumed.result.status).toBe("SUCCEEDED");
    expect(resumed.result.persisted).toBe(true);
    expect(resumed.result.projectRevisionAfter).toBe(1);
    expect(resumed.run.attempt).toBe(2);

    const project = await repo.loadProject(PROJECT_ID);
    expect(project?.revision).toBe(1);
    const events = await repo.loadEvents(PROJECT_ID);
    expect(events.map((e) => e.id)).toEqual(["evt-resume-1"]);
  });
});

describe("EVIDENCE_APPLY_SHADOW: duplicate/retry after the domain committed but the step ledger never recorded it", () => {
  it("reconstructs the same persisted result without re-committing or advancing a second revision", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);
    const event = benignEvent("evt-crash-1", 0);
    const intent = applyShadowIntent(event);

    // Attempt 1: reaches EXECUTE_ENGINE (cached), then COMMIT_SHADOW's reconciliation read fails
    // transiently and exhausts its budget -> INTERRUPTED. No commit has happened yet.
    const interrupted = await executeWorkflow(
      buildDeps(flakyCommitReconciliationRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");
    expect((await repo.loadProject(PROJECT_ID))?.revision).toBe(0);

    // Simulates a crash: some prior process actually completed the atomic domain commit (using
    // the exact same deterministic forecastAfterEvent output this workflow itself would compute
    // for this event), but never got to record the COMMIT_SHADOW step or finalize the run.
    const model = await repo.loadProject(PROJECT_ID);
    if (!model) throw new Error("seed project missing");
    const priorRun = forecastAfterEvent(
      model,
      event,
      event.receivedAt,
      2,
      undefined,
    );
    await repo.commitShadowTransition({
      expectedRevision: 0,
      modelAfterEvent: priorRun.modelAfterEvent,
      event,
      candidate: priorRun.candidate,
      oversight: priorRun.oversight,
    });
    expect((await repo.loadProject(PROJECT_ID))?.revision).toBe(1);

    // Attempt 2 (resume, real non-flaky repo): must recognize the already-committed evidence
    // rather than blindly retrying the commit.
    let commitCalls = 0;
    const countingRepo: WorkflowExecutorRepository = {
      ...passthroughRepo(repo),
      commitShadowTransition: async (transition) => {
        commitCalls += 1;
        return repo.commitShadowTransition(transition);
      },
    };
    const resumed = await executeWorkflow(buildDeps(countingRepo), intent);

    expect(resumed.outcome).toBe("COMPLETED");
    if (resumed.outcome !== "COMPLETED") return;
    expect(resumed.result.status).toBe("SUCCEEDED");
    expect(resumed.result.persisted).toBe(true);
    expect(resumed.result.projectRevisionBefore).toBe(0);
    expect(resumed.result.projectRevisionAfter).toBe(1);

    // The workflow's own resumed attempt never re-invoked the atomic commit.
    expect(commitCalls).toBe(0);
    // Revision advanced exactly once end-to-end, and there is exactly one event row.
    expect((await repo.loadProject(PROJECT_ID))?.revision).toBe(1);
    const events = await repo.loadEvents(PROJECT_ID);
    expect(events.map((e) => e.id)).toEqual(["evt-crash-1"]);

    const steps = await repo.loadWorkflowSteps(resumed.run.workflowId);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    expect(byName.COMMIT_SHADOW?.state).toBe("SUCCEEDED");
  });
});

describe("EVIDENCE_APPLY_SHADOW: concurrent resume ownership", () => {
  it("two simultaneous resumptions of the same interrupted run: exactly one wins and commits; the loser never touches the domain", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);
    const intent = applyShadowIntent(benignEvent("evt-race-1", 0));

    const interrupted = await executeWorkflow(
      buildDeps(flakyCommitReconciliationRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");

    const [a, b] = await Promise.all([
      executeWorkflow(
        buildDeps(flakyCommitReconciliationRepo(repo, 0, [])),
        intent,
      ),
      executeWorkflow(
        buildDeps(flakyCommitReconciliationRepo(repo, 0, [])),
        intent,
      ),
    ]);

    expect([a.outcome, b.outcome].sort()).toEqual([
      "COMPLETED",
      "CONCURRENT_RESUME_LOST",
    ]);
    const winner = a.outcome === "COMPLETED" ? a : b;
    expect(winner.outcome).toBe("COMPLETED");
    if (winner.outcome !== "COMPLETED") return;
    expect(winner.result.status).toBe("SUCCEEDED");
    expect(winner.result.persisted).toBe(true);
    expect(winner.run.attempt).toBe(2);

    // Exactly one domain mutation and one terminal result for the whole run.
    const project = await repo.loadProject(PROJECT_ID);
    expect(project?.revision).toBe(1);
    const events = await repo.loadEvents(PROJECT_ID);
    expect(events.map((e) => e.id)).toEqual(["evt-race-1"]);
    const resultCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount?.count).toBe(1);
  });
});
