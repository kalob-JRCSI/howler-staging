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

async function runCount(): Promise<number> {
  const row = await env.HOWLER_DB.prepare(
    "SELECT COUNT(*) AS count FROM workflow_runs",
  ).first<{ count: number }>();
  return row?.count ?? -1;
}

describe("canonical hashing: sorted object keys, preserved array order", () => {
  it("hashes identically regardless of object key insertion order", async () => {
    const a = { b: 1, a: [3, 1, 2] };
    const b = { a: [3, 1, 2], b: 1 };
    expect(await sha256Hex(a)).toBe(await sha256Hex(b));
  });

  it("preserves array element order in the canonical string", () => {
    expect(stableStringify({ a: [3, 1, 2], b: 1 })).toBe('{"a":[3,1,2],"b":1}');
  });

  it("hashes differently when array order differs", async () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [3, 2, 1] };
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(b));
  });
});

describe("claimIntent: a new key claims exactly once", () => {
  it("inserts the intent and its one-to-one workflow run", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const payload = { kind: "FORECAST_QUERY" };
    const requestHash = await sha256Hex(payload);
    const result = await repo.claimIntent({
      intentId: "intent-1",
      projectId: "deboard-v091",
      idempotencyKey: "key-1",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload),
      requestHash,
      workflowId: "wf-1",
      maxAttempts: 3,
      now: NOW,
    });
    expect(result.outcome).toBe("CLAIMED");
    if (result.outcome === "CLAIMED") {
      expect(result.run.workflowId).toBe("wf-1");
      expect(result.run.intentId).toBe("intent-1");
      expect(result.run.intentHash).toBe(requestHash);
      expect(result.run.projectId).toBe("deboard-v091");
      expect(result.run.state).toBe("RECEIVED");
      expect(result.run.attempt).toBe(1);
      expect(result.run.maxAttempts).toBe(3);
      expect(result.run.resumable).toBe(false);
      expect(result.run.currentStep).toBeNull();
    }
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: same (projectId, idempotencyKey) + same hash reuses the winning run", () => {
  it("a retry with a different client-generated intentId still replays the original run, without a second execution", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const payload = { kind: "FORECAST_QUERY", note: "identical content" };
    const requestHash = await sha256Hex(payload);
    const first = await repo.claimIntent({
      intentId: "intent-A",
      projectId: "deboard-v091",
      idempotencyKey: "key-shared",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload),
      requestHash,
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    expect(first.outcome).toBe("CLAIMED");

    const second = await repo.claimIntent({
      intentId: "intent-B",
      projectId: "deboard-v091",
      idempotencyKey: "key-shared",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload),
      requestHash,
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });
    expect(second.outcome).toBe("REPLAY");
    if (second.outcome === "REPLAY") {
      expect(second.run.workflowId).toBe("wf-A");
      expect(second.run.intentId).toBe("intent-A");
    }
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: same (projectId, idempotencyKey) + different hash => IDEMPOTENCY_KEY_REUSE", () => {
  it("rejects without executing a second time when content differs under the same key", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const payload1 = { kind: "FORECAST_QUERY", note: "version 1" };
    const payload2 = { kind: "FORECAST_QUERY", note: "version 2" };
    const first = await repo.claimIntent({
      intentId: "intent-A",
      projectId: "deboard-v091",
      idempotencyKey: "key-shared",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload1),
      requestHash: await sha256Hex(payload1),
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    expect(first.outcome).toBe("CLAIMED");

    const second = await repo.claimIntent({
      intentId: "intent-B",
      projectId: "deboard-v091",
      idempotencyKey: "key-shared",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload2),
      requestHash: await sha256Hex(payload2),
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });
    expect(second.outcome).toBe("IDEMPOTENCY_KEY_REUSE");
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: same intent ID + different hash => INTENT_ID_REUSE", () => {
  it("rejects when the same intentId is reused for genuinely different content", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const payload1 = { kind: "FORECAST_QUERY", note: "version 1" };
    const payload2 = { kind: "FORECAST_QUERY", note: "version 2" };
    const first = await repo.claimIntent({
      intentId: "intent-shared",
      projectId: "deboard-v091",
      idempotencyKey: "key-A",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload1),
      requestHash: await sha256Hex(payload1),
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    expect(first.outcome).toBe("CLAIMED");

    const second = await repo.claimIntent({
      intentId: "intent-shared",
      projectId: "deboard-v091",
      idempotencyKey: "key-B",
      kind: "FORECAST_QUERY",
      canonicalRequestJson: stableStringify(payload2),
      requestHash: await sha256Hex(payload2),
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });
    expect(second.outcome).toBe("INTENT_ID_REUSE");
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: concurrent claims — the loser loads the winning run rather than creating another", () => {
  it("two simultaneous claims for the same (projectId, idempotencyKey, hash) resolve to exactly one run", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const payload = { kind: "FORECAST_QUERY" };
    const requestHash = await sha256Hex(payload);
    const [a, b] = await Promise.all([
      repo.claimIntent({
        intentId: "intent-X",
        projectId: "deboard-v091",
        idempotencyKey: "key-concurrent",
        kind: "FORECAST_QUERY",
        canonicalRequestJson: stableStringify(payload),
        requestHash,
        workflowId: "wf-X",
        maxAttempts: 3,
        now: NOW,
      }),
      repo.claimIntent({
        intentId: "intent-Y",
        projectId: "deboard-v091",
        idempotencyKey: "key-concurrent",
        kind: "FORECAST_QUERY",
        canonicalRequestJson: stableStringify(payload),
        requestHash,
        workflowId: "wf-Y",
        maxAttempts: 3,
        now: NOW,
      }),
    ]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["CLAIMED", "REPLAY"]);
    const winner = a.outcome === "CLAIMED" ? a : b;
    const loser = a.outcome === "CLAIMED" ? b : a;
    expect(winner.outcome).toBe("CLAIMED");
    expect(loser.outcome).toBe("REPLAY");
    if (winner.outcome === "CLAIMED" && loser.outcome === "REPLAY") {
      expect(loser.run.workflowId).toBe(winner.run.workflowId);
    }
    expect(await runCount()).toBe(1);
  });
});
