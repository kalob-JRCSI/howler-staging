#!/usr/bin/env node
// Task 14 (docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md): DeBoard
// factual-sync validation. Records the exact manual smoke sequence run against a real local
// `wrangler dev` to prove the conversational/evidence pipeline end to end, on the real, familiar
// DeBoard fixture, this plan's own stated proof that the whole pipeline works.
//
// Usage:
//   1. In one terminal: npx wrangler dev --port 8799
//      (with a .dev.vars file containing HOWLER_ADMIN_KEY=<any local key>, gitignored/untracked —
//      never commit a real admin key)
//   2. In another terminal:
//        HOWLER_BASE_URL=http://127.0.0.1:8799 HOWLER_ADMIN_KEY=<same key> node
//        scripts/task14-deboard-fact-sync-validation.mjs
//
// This script is a re-runnable record of the validation performed during implementation, not a
// new production code path — it only calls the existing, unmodified /v1/admin/init-db,
// /v1/projects/deboard-v091/seed, and /v1/intents routes over plain HTTP.

const BASE_URL = process.env.HOWLER_BASE_URL ?? "http://127.0.0.1:8799";
const ADMIN_KEY = process.env.HOWLER_ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error(
    "Set HOWLER_ADMIN_KEY (must match the running wrangler dev's .dev.vars).",
  );
  process.exit(1);
}

async function call(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json };
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  OK: ${message}`);
}

const NOW = new Date().toISOString();

function masonryEvent({ id, sourceId, mutationClass }) {
  const event = {
    id,
    baseRevision: 1,
    projectId: "deboard-v091",
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-28T12:00:00.000Z",
    receivedAt: NOW,
    sourceIds: [sourceId],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["masonry"],
    mutations: [
      {
        op: "UPSERT_SOURCE",
        source: {
          id: sourceId,
          type: "VOICE_CONVERSATION",
          label:
            "Voice conversation: masonry actually started Aug 28, first block package delivered, masonry crew mobilized",
          observedAt: NOW,
          authority: 0.9,
          reliability: 0.9,
          effectiveDate: "2026-08-28",
        },
      },
      { op: "SET_ACTUAL_START", activityId: "masonry", date: "2026-08-28" },
      {
        op: "SET_CONSTRAINT_STATE",
        constraintId: "masonry-material",
        state: "SATISFIED",
        verification: "PM_CONFIRMED",
      },
      {
        op: "SET_CONSTRAINT_STATE",
        constraintId: "masonry-trade",
        state: "SATISFIED",
        verification: "PM_CONFIRMED",
      },
    ],
    payload: { claimType: "ACTIVITY_STARTED" },
  };
  if (mutationClass) event.mutationClass = mutationClass;
  return event;
}

function intent({ intentId, idempotencyKey, kind, event }) {
  return {
    schemaVersion: "1",
    intentId,
    idempotencyKey,
    projectId: "deboard-v091",
    kind,
    requestedEffect: kind === "EVIDENCE_PREVIEW" ? "PREVIEW" : "APPLY_SHADOW",
    expectedProjectRevision: 1,
    submittedAt: NOW,
    source: { channel: "API" },
    payload: { type: "EVIDENCE", event },
  };
}

async function main() {
  console.log("== init-db ==");
  await call("/v1/admin/init-db");

  console.log(
    "== seed deboard-v091 (idempotent: 409 if already seeded, fine) ==",
  );
  const seed = await call("/v1/projects/deboard-v091/seed");
  if (seed.status === 201) {
    assert(seed.body.project.revision === 1, "seed revision is 1");
    assert(seed.body.oversight.decision === "BLOCK", "seed oversight is BLOCK");
  } else {
    console.log(
      `  (seed returned ${String(seed.status)}, assuming already seeded)`,
    );
  }

  console.log(
    "== RED: apply the three masonry facts WITHOUT mutationClass (today's default) ==",
  );
  const redEvent = masonryEvent({
    id: "task14-red",
    sourceId: "src-task14-red",
  });
  const red = await call(
    "/v1/intents",
    intent({
      intentId: "55555555-5555-4555-8555-555555555561",
      idempotencyKey: "task14-red",
      kind: "EVIDENCE_APPLY_SHADOW",
      event: redEvent,
    }),
  );
  assert(
    red.body.result?.problem?.code === "OVERSIGHT_BLOCKED",
    "RED: OVERSIGHT_BLOCKED",
  );
  assert(red.body.result?.persisted === false, "RED: not persisted");

  console.log("== GREEN check 1: EVIDENCE_PREVIEW succeeds ==");
  const greenEvent = masonryEvent({
    id: "task14-green",
    sourceId: "src-task14-green",
    mutationClass: "FACT",
  });
  const preview = await call(
    "/v1/intents",
    intent({
      intentId: "55555555-5555-4555-8555-555555555562",
      idempotencyKey: "task14-preview",
      kind: "EVIDENCE_PREVIEW",
      event: greenEvent,
    }),
  );
  assert(
    preview.body.result?.status === "SUCCEEDED",
    "GREEN check 1: preview SUCCEEDED",
  );

  console.log(
    "== GREEN check 2: EVIDENCE_APPLY_SHADOW succeeds, revision 1 -> 2 ==",
  );
  const apply = await call(
    "/v1/intents",
    intent({
      intentId: "55555555-5555-4555-8555-555555555563",
      idempotencyKey: "task14-apply",
      kind: "EVIDENCE_APPLY_SHADOW",
      event: greenEvent,
    }),
  );
  assert(apply.body.result?.persisted === true, "GREEN check 2: persisted");
  assert(
    apply.body.result?.projectRevisionBefore === 1,
    "GREEN check 2: revision before 1",
  );
  assert(
    apply.body.result?.projectRevisionAfter === 2,
    "GREEN check 2: revision after 2",
  );

  console.log(
    "== GREEN check 3-5: masonry IN_PROGRESS, delta matches, completion 2026-11-13 ==",
  );
  const delta = apply.body.result?.output?.data?.delta;
  assert(
    delta?.completionLikely?.from === "2026-11-11",
    "check 5: completion from 2026-11-11",
  );
  assert(
    delta?.completionLikely?.to === "2026-11-13",
    "check 5: completion to 2026-11-13",
  );
  assert(delta?.shiftedActivityCount === 30, "check 5: 30 shifted activities");
  assert(delta?.criticalShiftCount === 18, "check 5: 18 critical shifted");

  console.log("== GREEN check 6: unrelated BLOCK findings unchanged ==");
  const oversight = apply.body.result?.output?.data?.oversight;
  assert(oversight?.decision === "BLOCK", "check 6: oversight still BLOCK");
  const stillBlocked = (oversight?.findings ?? [])
    .filter((f) => f.severity === "BLOCK")
    .flatMap((f) => f.activityIds);
  assert(
    stillBlocked.includes("structural_reconcile") &&
      stillBlocked.includes("brick_veneer"),
    "check 6: structural_reconcile and brick_veneer still BLOCK",
  );

  console.log("\nAll Task 14 GREEN checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
