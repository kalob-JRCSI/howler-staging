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
    intentId: "77777777-7777-4777-8777-777777777777",
    idempotencyKey: "key-ambiguous-1",
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

describe("EVIDENCE_APPLY_SHADOW: ambiguous commit evidence", () => {
  it("a committed event whose matching forecast/oversight evidence is missing yields terminal, non-resumable FAILED/COMMIT_STATE_AMBIGUOUS and attempts no further mutation", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);
    const event = benignEvent("evt-ambiguous-1", 0);
    const intent = applyShadowIntent(event);

    // Attempt 1: reaches EXECUTE_ENGINE (cached against revision 0), then COMMIT_SHADOW's
    // reconciliation read fails transiently and exhausts its budget -> INTERRUPTED.
    const interrupted = await executeWorkflow(
      buildDeps(flakyCommitReconciliationRepo(repo, Infinity, [])),
      intent,
    );
    expect(interrupted.outcome).toBe("INTERRUPTED");

    // Simulates corrupted/partial evidence: only the event row exists (e.g. a hypothetical
    // non-atomic write, or on-disk corruption) -- its matching forecast_snapshots and
    // oversight_reviews rows were never written. This is deliberately constructed directly
    // against D1, bypassing the repository's own atomic commitShadowTransition, since that method
    // can never itself produce a partial result to exercise this defensive check.
    const model = await repo.loadProject(PROJECT_ID);
    if (!model) throw new Error("seed project missing");
    const priorRun = forecastAfterEvent(
      model,
      event,
      event.receivedAt,
      2,
      undefined,
    );
    await env.HOWLER_DB.prepare(
      `INSERT INTO project_events
      (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        PROJECT_ID,
        event.id,
        0,
        1,
        event.type,
        event.occurredAt,
        event.receivedAt,
        JSON.stringify(event),
        JSON.stringify(priorRun.modelAfterEvent),
      )
      .run();

    // Attempt 2 (resume, real non-flaky repo): must detect the inconsistent evidence rather than
    // guess, and must never attempt a further mutation of its own.
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
    expect(resumed.result.status).toBe("FAILED");
    expect(resumed.result.persisted).toBe(false);
    expect(resumed.result.problem?.code).toBe("COMMIT_STATE_AMBIGUOUS");
    expect(resumed.run.state).toBe("FAILED");
    expect(resumed.run.resumable).toBe(false);
    expect(commitCalls).toBe(0);

    // No forecast_snapshots/oversight_reviews row was ever created for this event.
    expect(
      await repo.loadForecastById(PROJECT_ID, priorRun.candidate.id),
    ).toBeUndefined();
    expect(
      await repo.loadOversightReviewById(priorRun.oversight.id),
    ).toBeUndefined();

    const steps = await repo.loadWorkflowSteps(resumed.run.workflowId);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    expect(byName.COMMIT_SHADOW?.state).toBe("FAILED");
    expect(byName.BUILD_RESULT?.state).toBe("SUCCEEDED");
    expect(byName.FINALIZE?.state).toBe("SUCCEEDED");
  });
});
