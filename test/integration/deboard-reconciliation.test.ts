/// <reference types="vite/client" />

// Pilot activation: proves the DeBoard reconciliation event (scripts/deboard-reconciliation.ts)
// applies cleanly through the real production HTTP boundary against DeBoard's real, completely
// unmodified seed (src/worker/deboard-seed.ts) -- and that the pre-existing conf-plan-engineering/
// conf-brick-match BLOCK conflicts are left untouched, exactly as the FACT-scoped-bypass mechanism
// requires.

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import { deboardReconciliationEvent } from "../../scripts/deboard-reconciliation";

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

const ADMIN_KEY = "test-admin-key-deboard-reconciliation";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

function jsonRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${ADMIN_KEY}`,
  });
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function jsonBody<T>(response: Response): Promise<T> {
  return await response.json();
}

interface DeboardModel {
  revision: number;
  activities: Record<
    string,
    {
      state: string;
      actualStart?: string;
      actualFinish?: string;
      constraintIds: string[];
    }
  >;
  constraints: Record<
    string,
    { readiness?: unknown; verification: string; state: string }
  >;
  conflicts: Record<string, { status: string; severity: string }>;
}

async function loadDeboardModel(): Promise<DeboardModel> {
  const row = await env.HOWLER_DB.prepare(
    "SELECT current_model_json FROM projects WHERE project_id = ?",
  )
    .bind("deboard-v091")
    .first<{ current_model_json: string }>();
  if (!row) throw new Error("deboard-v091 project row not found");
  return JSON.parse(row.current_model_json) as DeboardModel;
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

async function seedDeboard(): Promise<void> {
  const response = await worker.fetch(
    jsonRequest("POST", "/v1/projects/deboard-v091/seed"),
    adminEnv(),
  );
  expect(response.status).toBe(201);
}

describe("DeBoard reconciliation: applies through the real HTTP boundary against the real, unmodified seed", () => {
  it("real, pre-existing HIGH-severity BLOCK conflicts (conf-plan-engineering, conf-brick-match) leave the project BLOCKed before reconciliation", async () => {
    await seedDeboard();
    const model = await loadDeboardModel();
    expect(model.conflicts["conf-plan-engineering"]?.severity).toBe("HIGH");
    expect(model.conflicts["conf-plan-engineering"]?.status).toBe("OPEN");
    expect(model.conflicts["conf-brick-match"]?.severity).toBe("HIGH");
  });

  it("the FACT-scoped reconciliation event applies despite the pre-existing BLOCK, because none of its mutations touch the blocked activities (structural_reconcile, framing, brick_veneer)", async () => {
    await seedDeboard();
    const before = await loadDeboardModel();
    expect(before.activities.masonry?.state).toBe("NOT_STARTED");
    expect(before.activities.masonry?.actualStart).toBeUndefined();

    const intentResponse = await worker.fetch(
      jsonRequest("POST", "/v1/intents", {
        schemaVersion: "1",
        intentId: "b244404f-93e2-4410-adc8-1eb027cf0635",
        idempotencyKey: "d61605b4-ddea-4244-bd3c-8aee0f1b070a",
        projectId: "deboard-v091",
        kind: "EVIDENCE_APPLY_SHADOW",
        requestedEffect: "APPLY_SHADOW",
        expectedProjectRevision: deboardReconciliationEvent.baseRevision,
        submittedAt: "2026-09-03T12:00:00.000Z",
        source: { channel: "API" },
        payload: { type: "EVIDENCE", event: deboardReconciliationEvent },
      }),
      adminEnv(),
    );
    expect(intentResponse.status).toBe(201);
    const body = await jsonBody<{
      run: { state: string };
      result: { status: string; persisted: boolean };
    }>(intentResponse);
    expect(body.run.state).toBe("SUCCEEDED");
    expect(body.result.status).toBe("SUCCEEDED");
    expect(body.result.persisted).toBe(true);

    const after = await loadDeboardModel();
    expect(after.revision).toBe(2);

    // FACT: masonry actively under construction, never marked complete.
    expect(after.activities.masonry?.state).toBe("IN_PROGRESS");
    expect(after.activities.masonry?.actualStart).toBe("2026-09-03");
    expect(after.activities.masonry?.actualFinish).toBeUndefined();

    // COMMITMENT: a real target, not an actual.
    const target = after.constraints["masonry-completion-target"];
    expect(target?.readiness).toEqual({
      optimistic: "2026-09-04",
      likely: "2026-09-04",
      conservative: "2026-09-05",
    });

    // FACT: building package confirmed on site.
    expect(after.activities.building_delivery?.state).toBe("COMPLETE");
    expect(after.activities.building_delivery?.actualFinish).toBe("2026-09-03");

    // UNKNOWN: backfill readiness genuinely unresolved -- no readiness window, UNVERIFIED.
    const backfill = after.constraints["backfill-readiness"];
    expect(backfill?.readiness).toBeUndefined();
    expect(backfill?.verification).toBe("UNVERIFIED");

    // UNKNOWN: plumbing wall penetration genuinely unresolved.
    const penetration = after.constraints["plumbing-wall-penetration"];
    expect(penetration?.readiness).toBeUndefined();
    expect(penetration?.verification).toBe("UNVERIFIED");

    // RISK/NEXT ACTION: new conflict recorded, scoped away from the blocked activities.
    expect(after.conflicts["conf-masonry-transition-risk"]?.status).toBe(
      "OPEN",
    );

    // The pre-existing BLOCK conflicts are completely untouched.
    expect(after.conflicts["conf-plan-engineering"]?.status).toBe("OPEN");
    expect(after.conflicts["conf-plan-engineering"]?.severity).toBe("HIGH");
    expect(after.conflicts["conf-brick-match"]?.status).toBe("OPEN");
    expect(after.conflicts["conf-brick-match"]?.severity).toBe("HIGH");

    // "framing" itself is completely untouched -- still exactly as the real seed defined it.
    expect(after.activities.framing?.state).toBe("NOT_STARTED");
    expect(after.activities.framing?.constraintIds).toEqual([
      "framer-availability",
      "framing-material",
    ]);
  });

  it("a duplicate submission (same intentId+idempotencyKey) replays instead of applying a second time", async () => {
    await seedDeboard();
    const intent = {
      schemaVersion: "1",
      intentId: "e26cb708-84c4-43e1-91a6-67d7a514b8df",
      idempotencyKey: "f29f670e-7be2-4781-91e9-b675ca288187",
      projectId: "deboard-v091",
      kind: "EVIDENCE_APPLY_SHADOW",
      requestedEffect: "APPLY_SHADOW",
      expectedProjectRevision: deboardReconciliationEvent.baseRevision,
      submittedAt: "2026-09-03T12:00:00.000Z",
      source: { channel: "API" },
      payload: { type: "EVIDENCE", event: deboardReconciliationEvent },
    };
    const first = await worker.fetch(
      jsonRequest("POST", "/v1/intents", intent),
      adminEnv(),
    );
    expect(first.status).toBe(201);
    const second = await worker.fetch(
      jsonRequest("POST", "/v1/intents", intent),
      adminEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = await jsonBody<{ replayed: boolean }>(second);
    expect(secondBody.replayed).toBe(true);

    const model = await loadDeboardModel();
    expect(model.revision).toBe(2);
  });
});
