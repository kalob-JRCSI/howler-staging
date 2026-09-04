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
import { WORKFLOW_STEP_NAMES } from "../../src/operator/workflow";
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
    intentId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "key-revconflict-1",
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

/** Delegates every method to the real repository unmodified — a passthrough base to override. */
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

describe("EVIDENCE_APPLY_SHADOW: stale expectedProjectRevision (checked before commit)", () => {
  it("blocks with REVISION_CONFLICT and no domain mutation", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);

    const staleEvent = benignEvent("evt-stale", 1); // current revision is 0
    const intent = applyShadowIntent(staleEvent);

    const outcome = await executeWorkflow(
      buildDeps(passthroughRepo(repo)),
      intent,
    );
    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("REVISION_CONFLICT");
    expect(outcome.run.state).toBe("BLOCKED");

    const project = await repo.loadProject(PROJECT_ID);
    expect(project?.revision).toBe(0);
    expect(await repo.loadEvents(PROJECT_ID)).toEqual([]);

    const steps = await repo.loadWorkflowSteps(outcome.run.workflowId);
    expect(steps.map((s) => s.stepName)).toEqual([...WORKFLOW_STEP_NAMES]);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    expect(byName.CHECK_REVISION?.state).toBe("SUCCEEDED");
    expect(byName.PREPARE?.state).toBe("BLOCKED");
    expect(byName.EXECUTE_ENGINE?.state).toBe("SKIPPED");
    expect(byName.COMMIT_SHADOW?.state).toBe("SKIPPED");
  });
});

describe("EVIDENCE_APPLY_SHADOW: revision race discovered only at commit time", () => {
  it("normalizes a commit-time revision race to the same BLOCKED/REVISION_CONFLICT result (design §10.2), with no double mutation", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);

    // This attempt's CHECK_REVISION reads revision 0 and passes. Before its own COMMIT_SHADOW
    // write lands, a concurrent competing intent commits first (simulated here by racing the
    // real repository directly, exactly as a second concurrent request would) — genuinely
    // advancing the project to revision 1 out from under this attempt.
    const model = await repo.loadProject(PROJECT_ID);
    if (!model) throw new Error("seed project missing");
    const racerEvent = benignEvent("evt-racer", 0);
    const racerRun = forecastAfterEvent(model, racerEvent, NOW, 2, undefined);

    const racingRepo: WorkflowExecutorRepository = {
      ...passthroughRepo(repo),
      commitShadowTransition: async (transition) => {
        await repo.commitShadowTransition({
          expectedRevision: 0,
          modelAfterEvent: racerRun.modelAfterEvent,
          event: racerEvent,
          candidate: racerRun.candidate,
          oversight: racerRun.oversight,
        });
        return repo.commitShadowTransition(transition);
      },
    };

    const staleEvent = benignEvent("evt-loser", 0);
    const intent = applyShadowIntent(staleEvent);
    const outcome = await executeWorkflow(buildDeps(racingRepo), intent);

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("REVISION_CONFLICT");

    // Exactly the racer's mutation landed — the loser never advanced a second revision.
    const project = await repo.loadProject(PROJECT_ID);
    expect(project?.revision).toBe(1);
    const events = await repo.loadEvents(PROJECT_ID);
    expect(events.map((e) => e.id)).toEqual(["evt-racer"]);

    const steps = await repo.loadWorkflowSteps(outcome.run.workflowId);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    expect(byName.COMMIT_SHADOW?.state).toBe("BLOCKED");
  });
});
