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

const seedFixture = fixture("deboard-seed.json") as {
  response: { body: { project: ProjectModelV094 } };
};
const previewFixture = fixture("masonry-preview.json") as {
  request: { body: ProjectEventV094 };
  response: { body: Record<string, unknown> };
};

const GENERATED_AT = "2026-08-27T12:00:00.000Z";
const NOW = "2026-08-30T13:00:00.000Z";
const PROJECT_ID = "deboard-v091";

const AUTHORIZATION: AuthorizationAttestation = {
  authenticated: true,
  mode: "shadow",
  workerName: "jarvis-voice-staging",
};

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Mirrors test/parity/masonry-transition.test.ts's exact seeding approach — the real seed route
 * uses wall-clock time, so the repository is seeded directly with the fixed GENERATED_AT to
 * reproduce the frozen golden fixture's project state byte-for-byte.
 */
async function seedFixedProject(repo: D1HowlerRepository): Promise<void> {
  const model = seedFixture.response.body.project;
  const initial = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, initial.candidate, initial.oversight);
}

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

function previewIntent(overrides: Partial<IntentV1> = {}): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "key-preview-1",
    projectId: PROJECT_ID,
    kind: "EVIDENCE_PREVIEW",
    requestedEffect: "PREVIEW",
    expectedProjectRevision: previewFixture.request.body.baseRevision,
    submittedAt: NOW,
    source: { channel: "API" },
    payload: { type: "EVIDENCE", event: previewFixture.request.body },
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

async function domainTableSnapshot(repo: D1HowlerRepository) {
  return {
    project: await repo.loadProject(PROJECT_ID),
    events: await repo.loadEvents(PROJECT_ID),
    latestForecast: await repo.loadLatestForecast(PROJECT_ID),
    publishedForecast: await repo.loadLatestPublishedForecast(PROJECT_ID),
  };
}

describe("EVIDENCE_PREVIEW workflow execution: masonry golden parity", () => {
  it("matches the frozen masonry-preview.json response body exactly, including the deterministic review token", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedFixedProject(repo);
    const before = await domainTableSnapshot(repo);

    const intent = previewIntent();
    const outcome = await executeWorkflow(buildDeps(repo), intent);

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    expect(outcome.result.status).toBe("SUCCEEDED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.output?.type).toBe("EVIDENCE_PREVIEW");
    if (outcome.result.output?.type !== "EVIDENCE_PREVIEW") return;

    expect(outcome.result.output.data).toEqual(previewFixture.response.body);
    expect(outcome.result.output.data.reviewToken).toBe(
      previewFixture.response.body.reviewToken,
    );

    // No domain mutation from a preview.
    const after = await domainTableSnapshot(repo);
    expect(after).toEqual(before);
  });

  it("executes CHECK_REVISION and PREPARE, skips COMMIT_SHADOW, and persists all ten ordered steps", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedFixedProject(repo);

    const intent = previewIntent();
    const outcome = await executeWorkflow(buildDeps(repo), intent);
    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    const steps = await repo.loadWorkflowSteps(outcome.run.workflowId);
    expect(steps.map((s) => s.stepName)).toEqual([...WORKFLOW_STEP_NAMES]);
    const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));

    expect(byName.CHECK_REVISION?.state).toBe("SUCCEEDED");
    expect(byName.PREPARE?.state).toBe("SUCCEEDED");
    expect(byName.COMMIT_SHADOW?.state).toBe("SKIPPED");
    for (const name of [
      "RECEIVE",
      "VALIDATE",
      "AUTHORIZE_POLICY",
      "LOAD_PROJECT",
      "CHECK_REVISION",
      "PREPARE",
      "EXECUTE_ENGINE",
      "BUILD_RESULT",
      "FINALIZE",
    ] as const) {
      expect(byName[name]?.state).toBe("SUCCEEDED");
      expect(byName[name]?.inputHash).toMatch(HEX64);
      expect(byName[name]?.outputHash).toMatch(HEX64);
    }
  });

  it("blocks with REVISION_CONFLICT (no domain mutation) when expectedProjectRevision is stale", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedFixedProject(repo);
    const before = await domainTableSnapshot(repo);

    const staleEvent = {
      ...previewFixture.request.body,
      baseRevision: previewFixture.request.body.baseRevision + 1,
    };
    const intent = previewIntent({
      intentId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "key-preview-stale",
      expectedProjectRevision: staleEvent.baseRevision,
      payload: { type: "EVIDENCE", event: staleEvent },
    });

    const outcome = await executeWorkflow(buildDeps(repo), intent);
    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;

    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.problem?.code).toBe("REVISION_CONFLICT");
    expect(outcome.run.state).toBe("BLOCKED");

    const after = await domainTableSnapshot(repo);
    expect(after).toEqual(before);
  });
});
