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
import { validateIntent } from "../../src/operator/intent";
import type { IntentV1 } from "../../src/operator/intent";

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

/**
 * Complete, real IntentV1 payloads — not reduced fixtures — round-tripped through Task 11's own
 * `validateIntent` so every fixture is provably a genuinely valid intent, matching how claimIntent
 * is actually meant to be called from the trusted (post-validation) boundary.
 */
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

describe("claimIntent: derives identity/hash from the trusted IntentV1 boundary", () => {
  it("inserts the intent and its one-to-one workflow run, persisting exactly the canonical JSON that was hashed", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = validIntent();
    const result = await repo.claimIntent({
      intent,
      workflowId: "wf-1",
      maxAttempts: 3,
      now: NOW,
    });
    expect(result.outcome).toBe("CLAIMED");
    if (result.outcome === "CLAIMED") {
      expect(result.run.workflowId).toBe("wf-1");
      expect(result.run.intentId).toBe(intent.intentId);
      expect(result.run.projectId).toBe("deboard-v091");
      expect(result.run.state).toBe("RECEIVED");
      expect(result.run.attempt).toBe(1);
      expect(result.run.maxAttempts).toBe(3);
      expect(result.run.resumable).toBe(false);
      expect(result.run.currentStep).toBeNull();
      expect(result.run.workflowType).toBe("OPERATOR_INTENT_V1");
      expect(result.run.workflowVersion).toBe(1);
    }
    expect(await runCount()).toBe(1);

    const row = await env.HOWLER_DB.prepare(
      "SELECT request_json, request_hash FROM operator_intents WHERE intent_id = ?",
    )
      .bind(intent.intentId)
      .first<{ request_json: string; request_hash: string }>();
    expect(row?.request_hash).toBe(
      await sha256Hex(JSON.parse(row?.request_json ?? "null")),
    );
    expect(JSON.parse(row?.request_json ?? "{}")).toEqual({
      schemaVersion: intent.schemaVersion,
      intentId: intent.intentId,
      idempotencyKey: intent.idempotencyKey,
      projectId: intent.projectId,
      kind: intent.kind,
      requestedEffect: intent.requestedEffect,
      expectedProjectRevision: intent.expectedProjectRevision,
      submittedAt: intent.submittedAt,
      source: intent.source,
      payload: intent.payload,
    });
  });

  it("never persists an admin key or Authorization header even if one is present on the intent object reference", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = validIntent();
    // Simulate an upstream bug that spread extra properties onto the same object reference.
    const contaminated = {
      ...intent,
      Authorization: "Bearer super-secret-admin-key",
      HOWLER_ADMIN_KEY: "super-secret-admin-key",
    } as IntentV1;
    await repo.claimIntent({
      intent: contaminated,
      workflowId: "wf-1",
      maxAttempts: 3,
      now: NOW,
    });
    const row = await env.HOWLER_DB.prepare(
      "SELECT request_json FROM operator_intents WHERE intent_id = ?",
    )
      .bind(intent.intentId)
      .first<{ request_json: string }>();
    expect(row?.request_json ?? "").not.toMatch(
      /super-secret-admin-key|Authorization|HOWLER_ADMIN_KEY/i,
    );
  });
});

describe("claimIntent: same (projectId, idempotencyKey) + same content reuses the winning run", () => {
  it("a byte-identical resubmission (the operator UI retains intentId/idempotencyKey/submittedAt across a retry, per design §8.1) replays the original run without a second execution", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intent = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
    });
    const first = await repo.claimIntent({
      intent,
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    expect(first.outcome).toBe("CLAIMED");

    // The retry resubmits the identical intent object — same intentId, idempotencyKey, and
    // content — exactly as design §8.1 describes a real retry, rather than a distinct intent
    // that merely happens to share the idempotency key (that scenario is IDEMPOTENCY_KEY_REUSE,
    // tested below, since intentId is itself part of the hashed canonical record).
    const second = await repo.claimIntent({
      intent,
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });
    expect(second.outcome).toBe("REPLAY");
    if (second.outcome === "REPLAY") {
      expect(second.run.workflowId).toBe("wf-A");
      expect(second.run.intentId).toBe(intent.intentId);
    }
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: same (projectId, idempotencyKey) + different content => IDEMPOTENCY_KEY_REUSE", () => {
  it("rejects without executing a second time when content differs under the same key", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intentA = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "key-shared",
    });
    const first = await repo.claimIntent({
      intent: intentA,
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    expect(first.outcome).toBe("CLAIMED");

    const intentB = validIntent({
      intentId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "key-shared",
      kind: "RECOVERY_QUERY", // genuinely different content -> different hash
    });
    const second = await repo.claimIntent({
      intent: intentB,
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });
    expect(second.outcome).toBe("IDEMPOTENCY_KEY_REUSE");
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: same intent ID + different content => INTENT_ID_REUSE", () => {
  it("rejects when the same intentId is reused for genuinely different content", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intentA = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "key-A",
    });
    const first = await repo.claimIntent({
      intent: intentA,
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    expect(first.outcome).toBe("CLAIMED");

    const intentB = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "key-B",
      kind: "RECOVERY_QUERY",
    });
    const second = await repo.claimIntent({
      intent: intentB,
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });
    expect(second.outcome).toBe("INTENT_ID_REUSE");
    expect(await runCount()).toBe(1);
  });
});

describe("claimIntent: split-identity collision fails closed", () => {
  it("throws when intentId and (projectId, idempotencyKey) resolve to two different existing intents", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const intentA = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "key-A",
    });
    const intentB = validIntent({
      intentId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "key-B",
    });
    await repo.claimIntent({
      intent: intentA,
      workflowId: "wf-A",
      maxAttempts: 3,
      now: NOW,
    });
    await repo.claimIntent({
      intent: intentB,
      workflowId: "wf-B",
      maxAttempts: 3,
      now: NOW,
    });

    // Reuses intentId from A but idempotencyKey from B — both already claimed, by two DIFFERENT
    // prior intents. This can only happen via a client/data bug and must fail closed.
    const splitIdentity = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "key-B",
    });
    await expect(
      repo.claimIntent({
        intent: splitIdentity,
        workflowId: "wf-C",
        maxAttempts: 3,
        now: NOW,
      }),
    ).rejects.toThrow(/split-identity/i);
    expect(await runCount()).toBe(2);
  });
});

describe("claimIntent: a resolved duplicate with no corresponding run is corruption, not reuse", () => {
  it("throws rather than treating a missing winner run as normal replay", async () => {
    // Bypass the repository's own atomic claim to construct a corrupted state: an intent row
    // with no matching workflow_runs row at all (impossible via claimIntent itself).
    const intent = validIntent();
    const canonical = {
      schemaVersion: intent.schemaVersion,
      intentId: intent.intentId,
      idempotencyKey: intent.idempotencyKey,
      projectId: intent.projectId,
      kind: intent.kind,
      requestedEffect: intent.requestedEffect,
      expectedProjectRevision: intent.expectedProjectRevision,
      submittedAt: intent.submittedAt,
      source: intent.source,
      payload: intent.payload,
    };
    const hash = await sha256Hex(canonical);
    await env.HOWLER_DB.prepare(
      `INSERT INTO operator_intents
        (intent_id, project_id, idempotency_key, kind, request_json, request_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        intent.intentId,
        intent.projectId,
        intent.idempotencyKey,
        intent.kind,
        stableStringify(canonical),
        hash,
        NOW,
      )
      .run();

    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await expect(
      repo.claimIntent({
        intent,
        workflowId: "wf-new",
        maxAttempts: 3,
        now: NOW,
      }),
    ).rejects.toThrow(/corruption/i);
  });
});

describe("claimIntent: concurrent claims — the loser loads the winning run rather than creating another", () => {
  it("two simultaneous claims of the identical intent (a double-submit race) resolve to exactly one run", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    // Same intentId/idempotencyKey/content submitted twice in a race — e.g. a network retry
    // firing while the first request is still in flight. A distinct intentId that merely shares
    // the idempotency key is a different scenario (IDEMPOTENCY_KEY_REUSE, tested above), since
    // intentId is itself part of the hashed canonical record.
    const intent = validIntent({
      intentId: "11111111-1111-4111-8111-111111111111",
    });
    const [a, b] = await Promise.all([
      repo.claimIntent({
        intent,
        workflowId: "wf-X",
        maxAttempts: 3,
        now: NOW,
      }),
      repo.claimIntent({
        intent,
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
