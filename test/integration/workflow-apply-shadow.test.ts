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
import { forecastInitial } from "../../src/engine/engine";
import { D1HowlerRepository } from "../../src/worker/repository";
import { validateIntent } from "../../src/operator/intent";
import type { IntentV1 } from "../../src/operator/intent";
import { WORKFLOW_STEP_NAMES } from "../../src/operator/workflow";
import type {
  AuthorizationAttestation,
  WorkflowExecutorDeps,
} from "../../src/operator/workflow";
import { executeWorkflow } from "../../src/operator/workflow";
import type { ProjectModelV094 } from "../../src/domain/types";

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

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
});
function fixture(fileName: string): unknown {
  const entry = Object.entries(fixtureSources).find(([modulePath]) =>
    modulePath.endsWith(`/${fileName}`),
  );
  if (!entry) throw new Error(`missing fixture ${fileName}`);
  return JSON.parse(entry[1]);
}

interface RawEventFixture {
  id: string;
  baseRevision: number;
  projectId: string;
  type: string;
  occurredAt: string;
  receivedAt: string;
  sourceIds: string[];
  verification: string;
  impactSeedActivityIds: string[];
  mutations: unknown[];
  payload: Record<string, unknown>;
  note?: string;
}

const applyShadowFixture = fixture("masonry-apply-shadow.json") as {
  request: { body: { event: RawEventFixture } };
};

const GENERATED_AT = "2026-08-27T12:00:00.000Z";
const NOW = "2026-08-30T13:00:00.000Z";
const MASONRY_PROJECT_ID = "deboard-v091";
const MINIMAL_PROJECT_ID = "shadow-p1";

const AUTHORIZATION: AuthorizationAttestation = {
  authenticated: true,
  mode: "shadow",
  workerName: "jarvis-voice-staging",
};

const HEX64 = /^[0-9a-f]{64}$/;

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

function buildDeps(repo: D1HowlerRepository): WorkflowExecutorDeps {
  return {
    repo,
    clock: createFixedClock(NOW),
    workflowIds: createDeterministicIds("wf"),
    resultIds: createDeterministicIds("result"),
    authorization: AUTHORIZATION,
  };
}

/** Mirrors test/integration/repository-v094.test.ts's minimal seed model. */
function minimalModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: MINIMAL_PROJECT_ID,
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

async function seedMasonryProject(repo: D1HowlerRepository): Promise<void> {
  const seedFixture = fixture("deboard-seed.json") as {
    response: { body: { project: ProjectModelV094 } };
  };
  const model = seedFixture.response.body.project;
  const initial = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, initial.candidate, initial.oversight);
}

function applyShadowIntent(
  projectId: string,
  event: RawEventFixture,
  overrides: Partial<IntentV1> = {},
): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "33333333-3333-4333-8333-333333333333",
    idempotencyKey: "key-apply-shadow-1",
    projectId,
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

/** A benign event on the minimal single-activity model: no BLOCK-triggering condition. */
function benignEvent(): RawEventFixture {
  return {
    id: "shadow-evt-1",
    baseRevision: 0,
    projectId: MINIMAL_PROJECT_ID,
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

async function domainTableSnapshot(
  repo: D1HowlerRepository,
  projectId: string,
) {
  return {
    project: await repo.loadProject(projectId),
    events: await repo.loadEvents(projectId),
    latestForecast: await repo.loadLatestForecast(projectId),
    publishedForecast: await repo.loadLatestPublishedForecast(projectId),
  };
}

describe("EVIDENCE_APPLY_SHADOW workflow execution: successful commit", () => {
  it("commits the event/candidate/oversight atomically, advances one revision, and returns a persisted SHADOW_TRANSITION result", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);

    const intent = applyShadowIntent(MINIMAL_PROJECT_ID, benignEvent());
    const outcome = await executeWorkflow(buildDeps(repo), intent);

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    expect(outcome.result.status).toBe("SUCCEEDED");
    expect(outcome.result.persisted).toBe(true);
    expect(outcome.result.projectRevisionBefore).toBe(0);
    expect(outcome.result.projectRevisionAfter).toBe(1);
    expect(outcome.result.output?.type).toBe("SHADOW_TRANSITION");
    if (outcome.result.output?.type !== "SHADOW_TRANSITION") return;
    expect(outcome.result.output.data.applied).toBe(true);
    expect(outcome.result.output.data.projectRevision).toBe(1);
    expect(outcome.result.output.data.publicationGate.publishable).toBe(false);
    expect(outcome.result.output.data.publicationGate.mode).toBe("shadow");

    // The domain mutation actually landed: project revision advanced, event/forecast persisted.
    const project = await repo.loadProject(MINIMAL_PROJECT_ID);
    expect(project?.revision).toBe(1);
    const events = await repo.loadEvents(MINIMAL_PROJECT_ID);
    expect(events.map((e) => e.id)).toEqual(["shadow-evt-1"]);
    const latest = await repo.loadLatestForecast(MINIMAL_PROJECT_ID);
    expect(latest?.status).not.toBe("PUBLISHED");
    expect(
      await repo.loadLatestPublishedForecast(MINIMAL_PROJECT_ID),
    ).toBeUndefined();
  });

  it("executes CHECK_REVISION, PREPARE, and COMMIT_SHADOW, and persists all ten ordered steps", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);

    const intent = applyShadowIntent(MINIMAL_PROJECT_ID, benignEvent());
    const outcome = await executeWorkflow(buildDeps(repo), intent);
    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    const steps = await repo.loadWorkflowSteps(outcome.run.workflowId);
    expect(steps.map((s) => s.stepName)).toEqual([...WORKFLOW_STEP_NAMES]);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    for (const name of WORKFLOW_STEP_NAMES) {
      expect(byName[name]?.state, name).toBe("SUCCEEDED");
      expect(byName[name]?.inputHash, name).toMatch(HEX64);
      expect(byName[name]?.outputHash, name).toMatch(HEX64);
    }
  });
});

describe("EVIDENCE_APPLY_SHADOW workflow execution: duplicate delivery", () => {
  it("resubmitting the identical completed intent replays the same immutable result and never advances a second revision", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMinimalProject(repo);
    const intent = applyShadowIntent(MINIMAL_PROJECT_ID, benignEvent());

    const first = await executeWorkflow(buildDeps(repo), intent);
    expect(first.outcome).toBe("COMPLETED");
    if (first.outcome !== "COMPLETED") return;

    const second = await executeWorkflow(buildDeps(repo), intent);
    expect(second.outcome).toBe("COMPLETED");
    if (second.outcome !== "COMPLETED") return;

    expect(second.result.resultId).toBe(first.result.resultId);
    expect(second.run.workflowId).toBe(first.run.workflowId);
    expect(second.run.attempt).toBe(first.run.attempt);

    const project = await repo.loadProject(MINIMAL_PROJECT_ID);
    expect(project?.revision).toBe(1);
    const events = await repo.loadEvents(MINIMAL_PROJECT_ID);
    expect(events).toHaveLength(1);
    const resultCount = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultCount?.count).toBe(1);
  });
});

describe("EVIDENCE_APPLY_SHADOW workflow execution: oversight BLOCK", () => {
  it("creates terminal BLOCKED with one immutable result and no domain mutation (masonry golden BLOCK fixture)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);
    const before = await domainTableSnapshot(repo, MASONRY_PROJECT_ID);

    const intent = applyShadowIntent(
      MASONRY_PROJECT_ID,
      applyShadowFixture.request.body.event,
    );
    const outcome = await executeWorkflow(buildDeps(repo), intent);

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("OVERSIGHT_BLOCKED");
    expect(outcome.run.state).toBe("BLOCKED");

    const after = await domainTableSnapshot(repo, MASONRY_PROJECT_ID);
    expect(after).toEqual(before);

    const steps = await repo.loadWorkflowSteps(outcome.run.workflowId);
    expect(steps.map((s) => s.stepName)).toEqual([...WORKFLOW_STEP_NAMES]);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
    expect(byName.CHECK_REVISION?.state).toBe("SUCCEEDED");
    expect(byName.PREPARE?.state).toBe("SUCCEEDED");
    expect(byName.EXECUTE_ENGINE?.state).toBe("SUCCEEDED");
    expect(byName.COMMIT_SHADOW?.state).toBe("BLOCKED");
    expect(byName.BUILD_RESULT?.state).toBe("SUCCEEDED");
    expect(byName.FINALIZE?.state).toBe("SUCCEEDED");
  });
});
