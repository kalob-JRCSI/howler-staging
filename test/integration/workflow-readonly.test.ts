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
import type { IntentKind, IntentV1 } from "../../src/operator/intent";
import { WORKFLOW_STEP_NAMES } from "../../src/operator/workflow";
import type {
  AuthorizationAttestation,
  WorkflowExecutorDeps,
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

const HEX64 = /^[0-9a-f]{64}$/;

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

async function seedProject(repo: D1HowlerRepository) {
  const model = createDeboardSeed();
  const initial = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, initial.candidate, initial.oversight);
  return { model, initial };
}

function buildDeps(repo: D1HowlerRepository): WorkflowExecutorDeps {
  return {
    repo,
    clock: createFixedClock(NOW),
    workflowIds: createDeterministicIds("wf"),
    resultIds: createDeterministicIds("result"),
    authorization: AUTHORIZATION,
  };
}

function queryIntent(kind: IntentKind, intentId: string): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId,
    idempotencyKey: `key-${intentId}`,
    projectId: PROJECT_ID,
    kind,
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

async function domainTableSnapshot(repo: D1HowlerRepository) {
  return {
    project: await repo.loadProject(PROJECT_ID),
    events: await repo.loadEvents(PROJECT_ID),
    latestForecast: await repo.loadLatestForecast(PROJECT_ID),
    publishedForecast: await repo.loadLatestPublishedForecast(PROJECT_ID),
  };
}

const QUERY_KINDS: {
  kind: IntentKind;
  intentId: string;
  expectedType: string;
}[] = [
  {
    kind: "FORECAST_QUERY",
    intentId: "11111111-1111-4111-8111-111111111111",
    expectedType: "FORECAST",
  },
  {
    kind: "FORECAST_HEALTH_QUERY",
    intentId: "22222222-2222-4222-8222-222222222222",
    expectedType: "FORECAST_HEALTH",
  },
  {
    kind: "RECOVERY_QUERY",
    intentId: "33333333-3333-4333-8333-333333333333",
    expectedType: "RECOVERY",
  },
];

describe.each(QUERY_KINDS)(
  "read-only workflow execution: $kind",
  ({ kind, intentId, expectedType }) => {
    it("produces exactly one intent/run/result, all ten ordered steps, correct SKIPPED states, persisted=false, and no domain mutation", async () => {
      const repo = new D1HowlerRepository(env.HOWLER_DB);
      await seedProject(repo);
      const before = await domainTableSnapshot(repo);

      const intent = queryIntent(kind, intentId);
      const outcome = await executeWorkflow(buildDeps(repo), intent);

      expect(outcome.outcome).toBe("COMPLETED");
      if (outcome.outcome !== "COMPLETED") return;

      expect(outcome.result.status).toBe("SUCCEEDED");
      expect(outcome.result.persisted).toBe(false);
      expect(outcome.result.intentKind).toBe(kind);
      expect(outcome.result.output?.type).toBe(expectedType);
      expect(outcome.run.state).toBe("SUCCEEDED");
      expect(outcome.run.resultId).toBe(outcome.result.resultId);

      // Exactly one intent, one run, one result.
      const intentCount = await env.HOWLER_DB.prepare(
        "SELECT COUNT(*) AS count FROM operator_intents",
      ).first<{ count: number }>();
      expect(intentCount?.count).toBe(1);
      const runCount = await env.HOWLER_DB.prepare(
        "SELECT COUNT(*) AS count FROM workflow_runs",
      ).first<{ count: number }>();
      expect(runCount?.count).toBe(1);
      const resultCount = await env.HOWLER_DB.prepare(
        "SELECT COUNT(*) AS count FROM workflow_results",
      ).first<{ count: number }>();
      expect(resultCount?.count).toBe(1);

      // All ten ordered step rows, in exact canonical order, each with valid checkpoint hashes.
      const steps = await repo.loadWorkflowSteps(outcome.run.workflowId);
      expect(steps.map((s) => s.stepName)).toEqual([...WORKFLOW_STEP_NAMES]);
      expect(steps.map((s) => s.ordinal)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
      for (const step of steps) {
        expect(step.inputHash).toMatch(HEX64);
      }

      const byName = Object.fromEntries(steps.map((s) => [s.stepName, s]));
      expect(byName.CHECK_REVISION?.state).toBe("SKIPPED");
      expect(byName.PREPARE?.state).toBe("SKIPPED");
      expect(byName.COMMIT_SHADOW?.state).toBe("SKIPPED");
      for (const name of [
        "RECEIVE",
        "VALIDATE",
        "AUTHORIZE_POLICY",
        "LOAD_PROJECT",
        "EXECUTE_ENGINE",
        "BUILD_RESULT",
        "FINALIZE",
      ] as const) {
        expect(byName[name]?.state).toBe("SUCCEEDED");
        expect(byName[name]?.outputHash).toMatch(HEX64);
      }

      // No v0.9.4 domain table was mutated by a read-only query.
      const after = await domainTableSnapshot(repo);
      expect(after).toEqual(before);
    });
  },
);
