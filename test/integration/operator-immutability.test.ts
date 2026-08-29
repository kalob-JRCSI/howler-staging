/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import { D1HowlerRepository } from "../../src/worker/repository";
import { sha256Hex, stableStringify } from "../../src/worker/hash";
import { OPERATOR_SAFETY } from "../../src/operator/policy";
import type { ResultV1 } from "../../src/operator/result";

const operatorMigrationSources = import.meta.glob<string>(
  "../../migrations/*.sql",
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
);

function operatorMigrationSql(): string {
  const entry = Object.entries(operatorMigrationSources).find(([modulePath]) =>
    modulePath.endsWith("/0002_operator_runs.sql"),
  );
  if (!entry) throw new Error("missing migration 0002_operator_runs.sql");
  return entry[1];
}

const NOW = "2026-08-29T12:00:00.000Z";

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

async function claimSampleIntent(repo: D1HowlerRepository): Promise<void> {
  const payload = { kind: "FORECAST_QUERY" };
  const result = await repo.claimIntent({
    intentId: "intent-1",
    projectId: "deboard-v091",
    idempotencyKey: "key-1",
    kind: "FORECAST_QUERY",
    canonicalRequestJson: stableStringify(payload),
    requestHash: await sha256Hex(payload),
    workflowId: "wf-1",
    maxAttempts: 3,
    now: NOW,
  });
  if (result.outcome !== "CLAIMED")
    throw new Error("setup: claim did not succeed");
}

function sampleResult(overrides: Partial<ResultV1> = {}): ResultV1 {
  return {
    schemaVersion: "1",
    resultId: "result-1",
    intentId: "intent-1",
    workflowId: "wf-1",
    projectId: "deboard-v091",
    intentKind: "FORECAST_QUERY",
    status: "SUCCEEDED",
    persisted: false,
    projectRevisionBefore: 1,
    projectRevisionAfter: 1,
    forecastVersion: 1,
    warnings: [],
    safety: OPERATOR_SAFETY,
    createdAt: NOW,
    ...overrides,
  };
}

describe("operator_intents is immutable", () => {
  it("rejects UPDATE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE operator_intents SET kind = 'RECOVERY_QUERY' WHERE intent_id = 'intent-1'",
      ).run(),
    ).rejects.toThrow("operator_intents is immutable");
  });

  it("rejects DELETE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM operator_intents WHERE intent_id = 'intent-1'",
      ).run(),
    ).rejects.toThrow("operator_intents is immutable");
  });
});

describe("workflow_results is immutable", () => {
  it("rejects UPDATE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await repo.recordWorkflowResult(sampleResult());
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE workflow_results SET status = 'FAILED' WHERE result_id = 'result-1'",
      ).run(),
    ).rejects.toThrow("workflow_results is immutable");
  });

  it("rejects DELETE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await repo.recordWorkflowResult(sampleResult());
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM workflow_results WHERE result_id = 'result-1'",
      ).run(),
    ).rejects.toThrow("workflow_results is immutable");
  });

  it("enforces unique result_id, workflow_id, and intent_id", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await repo.recordWorkflowResult(sampleResult());
    // Same result_id again (even with different workflow/intent) must fail.
    await expect(
      repo.recordWorkflowResult(
        sampleResult({ workflowId: "wf-1", intentId: "intent-1" }),
      ),
    ).rejects.toThrow();
  });
});

describe("workflow_runs is mutable operational state, but only through guarded updates", () => {
  it("updateWorkflowRunState succeeds when the expected current state matches", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    const changed = await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "RECEIVED",
      nextState: "VALIDATING",
      now: NOW,
    });
    expect(changed).toBe(true);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("VALIDATING");
  });

  it("is guarded: a mismatched expected state changes nothing and reports false", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    const changed = await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "RUNNING", // actual state is RECEIVED
      nextState: "SUCCEEDED",
      now: NOW,
    });
    expect(changed).toBe(false);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("RECEIVED");
  });

  it("records an interruption problem and clears it back out on the next guarded update", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "RECEIVED",
      nextState: "RUNNING",
      now: NOW,
      markStarted: true,
    });
    await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      nextState: "INTERRUPTED",
      now: NOW,
      interruption: {
        code: "TRANSIENT_D1_READ_FAILURE",
        category: "TRANSIENT",
        message: "transient",
        retryable: true,
      },
    });
    const interrupted = await repo.loadWorkflowRun("wf-1");
    expect(interrupted?.state).toBe("INTERRUPTED");
    expect(interrupted?.interruption?.retryable).toBe(true);
    expect(interrupted?.startedAt).toBe(NOW);

    const changed = await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "INTERRUPTED",
      nextState: "SUCCEEDED",
      now: NOW,
      resultId: "result-1",
      markCompleted: true,
    });
    expect(changed).toBe(true);
    const finished = await repo.loadWorkflowRun("wf-1");
    expect(finished?.state).toBe("SUCCEEDED");
    expect(finished?.resultId).toBe("result-1");
    expect(finished?.completedAt).toBe(NOW);
  });
});

describe("never persists the admin key or any authentication secret", () => {
  it("the persisted canonical request JSON contains no admin-key-shaped content", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    const row = await env.HOWLER_DB.prepare(
      "SELECT request_json FROM operator_intents WHERE intent_id = 'intent-1'",
    ).first<{ request_json: string }>();
    expect(row?.request_json ?? "").not.toMatch(
      /HOWLER_ADMIN_KEY|Authorization|Bearer/i,
    );
  });

  it("no operator table column stores a secret/token-shaped field at all", async () => {
    for (const table of [
      "operator_intents",
      "workflow_runs",
      "workflow_steps",
      "workflow_results",
    ]) {
      const columns = await env.HOWLER_DB.prepare(
        `PRAGMA table_info(${table})`,
      ).all<{ name: string }>();
      for (const column of columns.results) {
        expect(
          column.name.toLowerCase(),
          `${table}.${column.name}`,
        ).not.toMatch(/secret|token|admin_key|password/);
      }
    }
  });
});
