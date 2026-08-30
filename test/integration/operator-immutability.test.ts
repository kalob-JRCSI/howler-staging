/// <reference types="vite/client" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import { D1HowlerRepository } from "../../src/worker/repository";
import { validateIntent } from "../../src/operator/intent";
import type { IntentV1 } from "../../src/operator/intent";
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

function validIntent(overrides: Partial<IntentV1> = {}): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "key-1",
    projectId: "deboard-v091",
    kind: "FORECAST_QUERY",
    requestedEffect: "READ_ONLY",
    expectedProjectRevision: null,
    submittedAt: NOW,
    source: { channel: "API" },
    payload: { type: "QUERY" },
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

async function claimSampleIntent(
  repo: D1HowlerRepository,
  overrides: Partial<IntentV1> = {},
): Promise<IntentV1> {
  const intent = validIntent(overrides);
  const result = await repo.claimIntent({
    intent,
    workflowId: "wf-1",
    maxAttempts: 3,
    now: NOW,
  });
  if (result.outcome !== "CLAIMED")
    throw new Error("setup: claim did not succeed");
  return intent;
}

function sampleResult(overrides: Partial<ResultV1> = {}): ResultV1 {
  return {
    schemaVersion: "1",
    resultId: "result-1",
    intentId: "11111111-1111-4111-8111-111111111111",
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

/** Advances a freshly-claimed (RECEIVED) run to RUNNING via the real, legal transition path. */
async function advanceToRunning(
  repo: D1HowlerRepository,
  workflowId = "wf-1",
): Promise<void> {
  await repo.updateWorkflowRunState({
    workflowId,
    expectedState: "RECEIVED",
    nextState: "VALIDATING",
    now: NOW,
  });
  await repo.updateWorkflowRunState({
    workflowId,
    expectedState: "VALIDATING",
    nextState: "READY",
    now: NOW,
  });
  await repo.updateWorkflowRunState({
    workflowId,
    expectedState: "READY",
    nextState: "RUNNING",
    now: NOW,
    markStarted: true,
  });
}

describe("operator_intents is immutable", () => {
  it("rejects UPDATE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE operator_intents SET kind = 'RECOVERY_QUERY' WHERE intent_id = '11111111-1111-4111-8111-111111111111'",
      ).run(),
    ).rejects.toThrow("operator_intents is immutable");
  });

  it("rejects DELETE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM operator_intents WHERE intent_id = '11111111-1111-4111-8111-111111111111'",
      ).run(),
    ).rejects.toThrow("operator_intents is immutable");
  });
});

describe("workflow_results is immutable", () => {
  async function finalizeSample(repo: D1HowlerRepository): Promise<void> {
    await claimSampleIntent(repo);
    await advanceToRunning(repo);
    const changed = await repo.finalizeWorkflowRun({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      terminalState: "SUCCEEDED",
      result: sampleResult(),
      now: NOW,
    });
    if (!changed) throw new Error("setup: finalize did not succeed");
  }

  it("rejects UPDATE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await finalizeSample(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE workflow_results SET status = 'FAILED' WHERE result_id = 'result-1'",
      ).run(),
    ).rejects.toThrow("workflow_results is immutable");
  });

  it("rejects DELETE", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await finalizeSample(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM workflow_results WHERE result_id = 'result-1'",
      ).run(),
    ).rejects.toThrow("workflow_results is immutable");
  });
});

describe("workflow_type/workflow_version are stored and read back faithfully, never silently overwritten", () => {
  it("rejects a workflow_type other than OPERATOR_INTENT_V1", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES ('wf-bad', '22222222-2222-4222-8222-222222222222', '${"a".repeat(64)}', 'deboard-v091', 'ROGUE_WORKFLOW', 1, 'RECEIVED', 1, 3, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects a workflow_version other than 1", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES ('wf-bad', '33333333-3333-4333-8333-333333333333', '${"a".repeat(64)}', 'deboard-v091', 'OPERATOR_INTENT_V1', 2, 'RECEIVED', 1, 3, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("loadWorkflowRun reads workflow_type/workflow_version from the row, not a hardcoded constant", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.workflowType).toBe("OPERATOR_INTENT_V1");
    expect(run?.workflowVersion).toBe(1);
  });
});

describe("stored workflow constraints (attempt/max_attempts/ordinal bounds)", () => {
  it("rejects attempt < 1", async () => {
    await claimSampleIntentRawPrereqs();
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES ('wf-bad', '11111111-1111-4111-8111-111111111111', '${"a".repeat(64)}', 'deboard-v091', 'OPERATOR_INTENT_V1', 1, 'RECEIVED', 0, 3, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects max_attempts < 1", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES ('wf-bad', '11111111-1111-4111-8111-111111111111', '${"a".repeat(64)}', 'deboard-v091', 'OPERATOR_INTENT_V1', 1, 'RECEIVED', 1, 0, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects attempt > max_attempts", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES ('wf-bad', '11111111-1111-4111-8111-111111111111', '${"a".repeat(64)}', 'deboard-v091', 'OPERATOR_INTENT_V1', 1, 'RECEIVED', 4, 3, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects a workflow_steps row with a negative ordinal", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_steps
        (workflow_id, step_name, ordinal, state, attempt, input_hash)
        VALUES ('wf-1', 'RECEIVE', -1, 'PENDING', 1, '${"a".repeat(64)}')`,
      ).run(),
    ).rejects.toThrow();
  });

  it("rejects a workflow_steps row with attempt < 1", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_steps
        (workflow_id, step_name, ordinal, state, attempt, input_hash)
        VALUES ('wf-1', 'RECEIVE', 0, 'PENDING', 0, '${"a".repeat(64)}')`,
      ).run(),
    ).rejects.toThrow();
  });

  it("rejects a non-hex-shaped intent_hash", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, created_at, updated_at)
        VALUES ('wf-bad', '11111111-1111-4111-8111-111111111111', 'not-a-hash', 'deboard-v091', 'OPERATOR_INTENT_V1', 1, 'RECEIVED', 1, 3, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  async function claimSampleIntentRawPrereqs(): Promise<void> {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
  }
});

describe("workflow_runs terminal<=>result_id CHECK constraint", () => {
  it("rejects a terminal state with no result_id", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE workflow_runs SET state = 'SUCCEEDED' WHERE workflow_id = 'wf-1'",
      ).run(),
    ).rejects.toThrow();
  });

  it("rejects a non-terminal state with a result_id set", async () => {
    // Directly attempt to construct an inconsistent row; the CHECK constraint must reject it
    // regardless of repository-level guards.
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_runs
        (workflow_id, intent_id, intent_hash, project_id, workflow_type, workflow_version, state, attempt, max_attempts, resumable, result_id, created_at, updated_at)
        VALUES ('wf-bad', '11111111-1111-4111-8111-111111111111', '${"a".repeat(64)}', 'deboard-v091', 'OPERATOR_INTENT_V1', 1, 'RECEIVED', 1, 3, 0, 'result-x', ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });
});

describe("workflow_results identity/status guard trigger", () => {
  it("rejects a result whose intent_id does not match the referenced run's intent_id", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await env.HOWLER_DB.prepare(
      "UPDATE workflow_runs SET state = 'SUCCEEDED', result_id = 'result-1' WHERE workflow_id = 'wf-1'",
    ).run();
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_results (result_id, workflow_id, intent_id, project_id, status, result_json, created_at)
        VALUES ('result-1', 'wf-1', '99999999-9999-4999-8999-999999999999', 'deboard-v091', 'SUCCEEDED', '{}', ?)`,
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/HOWLER_RESULT_INTENT_MISMATCH/);
  });

  it("rejects a result whose status does not match the run's current state", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await env.HOWLER_DB.prepare(
      "UPDATE workflow_runs SET state = 'SUCCEEDED', result_id = 'result-1' WHERE workflow_id = 'wf-1'",
    ).run();
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO workflow_results (result_id, workflow_id, intent_id, project_id, status, result_json, created_at)
        VALUES ('result-1', 'wf-1', ?, 'deboard-v091', 'FAILED', '{}', ?)`,
      )
        .bind(intent.intentId, NOW)
        .run(),
    ).rejects.toThrow(/HOWLER_RESULT_STATUS_MISMATCH/);
  });
});

describe("Task 11 transition rules are enforced by updateWorkflowRunState", () => {
  it("rejects RECEIVED -> RUNNING (must pass through VALIDATING and READY)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await expect(
      repo.updateWorkflowRunState({
        workflowId: "wf-1",
        expectedState: "RECEIVED",
        nextState: "RUNNING",
        now: NOW,
      }),
    ).rejects.toThrow(/Invalid workflow state transition/);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("RECEIVED");
  });

  it("rejects INTERRUPTED -> SUCCEEDED directly (must return to RUNNING first)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await advanceToRunning(repo);
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
    // updateWorkflowRunState refuses terminal targets outright, by design (findings #1/#2):
    // SUCCEEDED can only be reached through finalizeWorkflowRun.
    await expect(
      repo.updateWorkflowRunState({
        workflowId: "wf-1",
        expectedState: "INTERRUPTED",
        nextState: "SUCCEEDED",
        now: NOW,
      }),
    ).rejects.toThrow(/finalizeWorkflowRun/);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("INTERRUPTED");
  });

  it("succeeds when the expected current state matches (RECEIVED -> VALIDATING)", async () => {
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
      expectedState: "READY", // actual state is RECEIVED
      nextState: "RUNNING",
      now: NOW,
    });
    expect(changed).toBe(false);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("RECEIVED");
  });

  it("records an interruption problem, then legally resumes back to RUNNING", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await advanceToRunning(repo);
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

    const resumed = await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "INTERRUPTED",
      nextState: "RUNNING",
      now: NOW,
    });
    expect(resumed).toBe(true);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("RUNNING");
  });

  it("rejects an INTERRUPTED target with a non-retryable problem (terminal invariant enforced before SQL)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await expect(
      repo.updateWorkflowRunState({
        workflowId: "wf-1",
        expectedState: "RUNNING",
        nextState: "INTERRUPTED",
        now: NOW,
        interruption: {
          code: "VALIDATION_FAILED",
          category: "VALIDATION",
          message: "not retryable",
          retryable: false,
        },
      }),
    ).rejects.toThrow(/Invalid workflow run state update/);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("RUNNING");
  });
});

describe("finalizeWorkflowRun: atomic, relationally consistent terminal transition", () => {
  it("inserts the result and transitions the run together, in one atomic operation", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await advanceToRunning(repo);
    const changed = await repo.finalizeWorkflowRun({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      terminalState: "SUCCEEDED",
      result: sampleResult({ intentId: intent.intentId }),
      now: NOW,
    });
    expect(changed).toBe(true);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("SUCCEEDED");
    expect(run?.resultId).toBe("result-1");
    const resultRow = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultRow?.count).toBe(1);
  });

  it("is guarded: returns false and persists nothing when the run is no longer in the expected state", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    // Still RECEIVED, not RUNNING.
    const changed = await repo.finalizeWorkflowRun({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      terminalState: "SUCCEEDED",
      result: sampleResult({ intentId: intent.intentId }),
      now: NOW,
    });
    expect(changed).toBe(false);
    const resultRow = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultRow?.count).toBe(0);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("RECEIVED");
  });

  it("rejects a terminal transition outside the canonical matrix (e.g. RECEIVED -> SUCCEEDED)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await expect(
      repo.finalizeWorkflowRun({
        workflowId: "wf-1",
        expectedState: "RECEIVED",
        terminalState: "SUCCEEDED",
        result: sampleResult({ intentId: intent.intentId }),
        now: NOW,
      }),
    ).rejects.toThrow(/Invalid terminal transition/);
  });

  it("rejects a result whose status disagrees with the requested terminal state", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await expect(
      repo.finalizeWorkflowRun({
        workflowId: "wf-1",
        expectedState: "RUNNING",
        terminalState: "FAILED",
        result: sampleResult({
          intentId: intent.intentId,
          status: "SUCCEEDED",
        }),
        now: NOW,
      }),
    ).rejects.toThrow(/does not match terminal state/);
  });

  it("rejects a result whose intentId does not match the workflow's own intentId", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await expect(
      repo.finalizeWorkflowRun({
        workflowId: "wf-1",
        expectedState: "RUNNING",
        terminalState: "SUCCEEDED",
        result: sampleResult({
          intentId: "99999999-9999-4999-8999-999999999999",
        }),
        now: NOW,
      }),
    ).rejects.toThrow(/intentId does not match/);
  });

  it("allows retry-exhaustion INTERRUPTED -> FAILED", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await repo.updateWorkflowRunState({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      nextState: "INTERRUPTED",
      now: NOW,
      interruption: {
        code: "RETRY_EXHAUSTED",
        category: "TRANSIENT",
        message: "exhausted",
        retryable: true,
      },
    });
    const changed = await repo.finalizeWorkflowRun({
      workflowId: "wf-1",
      expectedState: "INTERRUPTED",
      terminalState: "FAILED",
      result: sampleResult({ intentId: intent.intentId, status: "FAILED" }),
      now: NOW,
    });
    expect(changed).toBe(true);
    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("FAILED");
  });

  it("a genuine concurrent double-finalize race, deterministically barriered at the pre-finalization read: the loser returns false rather than rejecting", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await advanceToRunning(repo);

    // finalizeWorkflowRun's very first async step is `await this.loadWorkflowRun(workflowId)` —
    // the pre-finalization read whose result feeds the `current.state !== expectedState`
    // pre-check. Without a barrier, nothing guarantees both concurrent calls actually reach that
    // read before either one completes its full write — one caller's entire finalize could race
    // ahead and commit before the other's pre-check even runs, in which case the loser would
    // return false via the early pre-check and never touch the catch-path fix at all. Barriering
    // this call forces both contenders to observe the same pre-finalization state ("RUNNING")
    // before either is released to proceed, so the test deterministically exercises the
    // catch-path race recovery every run, not just incidentally.
    const originalLoadWorkflowRun = repo.loadWorkflowRun.bind(repo);
    const observedPreCheckStates: (string | undefined)[] = [];
    let arrivals = 0;
    let releaseBarrier: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const loadWorkflowRunSpy = vi
      .spyOn(repo, "loadWorkflowRun")
      .mockImplementation(async (workflowId: string) => {
        const result = await originalLoadWorkflowRun(workflowId);
        arrivals += 1;
        if (arrivals <= 2) {
          // Only the first two arrivals are the two callers' pre-finalization reads; barrier
          // exactly those two, then let everything after (including a loser's later catch-path
          // re-check) through immediately — the barrier promise is already resolved by then.
          observedPreCheckStates.push(result?.state);
          if (arrivals === 2) releaseBarrier();
          await barrier;
        }
        return result;
      });

    let a: boolean;
    let b: boolean;
    try {
      [a, b] = await Promise.all([
        repo.finalizeWorkflowRun({
          workflowId: "wf-1",
          expectedState: "RUNNING",
          terminalState: "SUCCEEDED",
          result: sampleResult({
            intentId: intent.intentId,
            resultId: "result-A",
          }),
          now: NOW,
        }),
        repo.finalizeWorkflowRun({
          workflowId: "wf-1",
          expectedState: "RUNNING",
          terminalState: "SUCCEEDED",
          result: sampleResult({
            intentId: intent.intentId,
            resultId: "result-B",
          }),
          now: NOW,
        }),
      ]);
    } finally {
      loadWorkflowRunSpy.mockRestore();
    }

    // Both contenders observed the same pre-finalization state before either was released —
    // proof the barrier actually held both at the intended point rather than letting one race
    // ahead of the other's read.
    expect(observedPreCheckStates).toEqual(["RUNNING", "RUNNING"]);

    // Exactly one true, one false; neither call rejected (Promise.all itself proves that — a
    // rejection here would fail this test with an uncaught error instead).
    expect([a, b].sort()).toEqual([false, true]);

    const resultRow = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultRow?.count).toBe(1);

    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("SUCCEEDED");

    // The losing caller must have gone through finalizeWorkflowRun's catch-path re-check (a third
    // loadWorkflowRun call beyond the two barriered pre-checks), not merely returned false from
    // some other guard — proving the intended race-recovery path was the one actually exercised.
    expect(arrivals).toBe(3);
  });
});

describe("finalizeWorkflowRunStep (Task 13): FINALIZE step completion, terminal run transition, and result insert are one atomic operation", () => {
  it("on success, atomically commits the run transition, the result, and the FINALIZE step together", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = await claimSampleIntent(repo);
    await advanceToRunning(repo);
    await repo.ensureWorkflowStep({
      workflowId: "wf-1",
      stepName: "FINALIZE",
      ordinal: 9,
      inputHash: "a".repeat(64),
      attempt: 1,
    });
    await repo.startWorkflowStep({
      workflowId: "wf-1",
      stepName: "FINALIZE",
      attempt: 1,
      now: NOW,
    });

    const applied = await repo.finalizeWorkflowRunStep({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      terminalState: "SUCCEEDED",
      result: sampleResult({ intentId: intent.intentId }),
      stepOutput: { finalized: true },
      stepOutputHash: "b".repeat(64),
      now: NOW,
    });
    expect(applied).toBe(true);

    const run = await repo.loadWorkflowRun("wf-1");
    expect(run?.state).toBe("SUCCEEDED");
    expect(run?.resultId).toBe("result-1");
    const resultRow = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultRow?.count).toBe(1);
    const step = await repo.loadWorkflowStep("wf-1", "FINALIZE");
    expect(step?.state).toBe("SUCCEEDED");
    expect(step?.outputHash).toBe("b".repeat(64));
  });

  it("if the batch fails, commits nothing: the run stays non-terminal, no result exists, and FINALIZE stays incomplete", async () => {
    // First, a genuinely completed, unrelated workflow occupies resultId "result-1".
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const firstIntent = await claimSampleIntent(repo);
    await advanceToRunning(repo);
    const firstApplied = await repo.finalizeWorkflowRun({
      workflowId: "wf-1",
      expectedState: "RUNNING",
      terminalState: "SUCCEEDED",
      result: sampleResult({ intentId: firstIntent.intentId }),
      now: NOW,
    });
    expect(firstApplied).toBe(true);

    // A second, independent run tries to finalize while colliding on the same resultId — the
    // INSERT will fail on the workflow_results.result_id UNIQUE constraint, forcing the whole
    // batch (run transition + result insert + FINALIZE step completion) to roll back together.
    const secondClaim = await repo.claimIntent({
      intent: validIntent({
        intentId: "33333333-3333-4333-8333-333333333333",
        idempotencyKey: "key-3",
      }),
      workflowId: "wf-2",
      maxAttempts: 3,
      now: NOW,
    });
    if (secondClaim.outcome !== "CLAIMED") {
      throw new Error("setup: second claim did not succeed");
    }
    await repo.updateWorkflowRunState({
      workflowId: "wf-2",
      expectedState: "RECEIVED",
      nextState: "VALIDATING",
      now: NOW,
    });
    await repo.updateWorkflowRunState({
      workflowId: "wf-2",
      expectedState: "VALIDATING",
      nextState: "READY",
      now: NOW,
    });
    await repo.updateWorkflowRunState({
      workflowId: "wf-2",
      expectedState: "READY",
      nextState: "RUNNING",
      now: NOW,
      markStarted: true,
    });
    await repo.ensureWorkflowStep({
      workflowId: "wf-2",
      stepName: "FINALIZE",
      ordinal: 9,
      inputHash: "a".repeat(64),
      attempt: 1,
    });
    await repo.startWorkflowStep({
      workflowId: "wf-2",
      stepName: "FINALIZE",
      attempt: 1,
      now: NOW,
    });

    await expect(
      repo.finalizeWorkflowRunStep({
        workflowId: "wf-2",
        expectedState: "RUNNING",
        terminalState: "SUCCEEDED",
        result: sampleResult({
          resultId: "result-1", // colliding on purpose
          workflowId: "wf-2",
          intentId: "33333333-3333-4333-8333-333333333333",
        }),
        stepOutput: { finalized: true },
        stepOutputHash: "c".repeat(64),
        now: NOW,
      }),
    ).rejects.toThrow();

    const run = await repo.loadWorkflowRun("wf-2");
    expect(run?.state).toBe("RUNNING");
    expect(run?.resultId).toBeUndefined();
    const resultRow = await env.HOWLER_DB.prepare(
      "SELECT COUNT(*) AS count FROM workflow_results",
    ).first<{ count: number }>();
    expect(resultRow?.count).toBe(1); // only the first (unrelated) run's result
    const step = await repo.loadWorkflowStep("wf-2", "FINALIZE");
    expect(step?.state).toBe("RUNNING");
    expect(step?.outputHash).toBeUndefined();
  });
});

describe("never persists the admin key or any authentication secret", () => {
  it("the persisted canonical request JSON contains no admin-key-shaped content", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await claimSampleIntent(repo);
    const row = await env.HOWLER_DB.prepare(
      "SELECT request_json FROM operator_intents WHERE intent_id = '11111111-1111-4111-8111-111111111111'",
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
