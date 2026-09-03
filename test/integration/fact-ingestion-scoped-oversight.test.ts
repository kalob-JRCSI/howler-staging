/// <reference types="vite/client" />

// Task 6: the scoped oversight-gate extension. Reuses the same real DeBoard fixture and the same
// EVIDENCE_APPLY_SHADOW workflow harness as test/integration/workflow-apply-shadow.test.ts (whose
// "oversight BLOCK" test already regression-pins today's project-wide-refusal behavior for an
// event with no mutationClass set). This file proves the one new, narrowly-scoped bypass rule:
// a FACT-class event may persist despite an open BLOCK finding, if and only if none of its
// impactSeedActivityIds overlap that finding's activityIds — and that a COMMITMENT-class event,
// or any event that does overlap, is refused exactly as before.

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

const GENERATED_AT = "2026-08-27T12:00:00.000Z";
const NOW = "2026-08-30T13:00:00.000Z";
const MASONRY_PROJECT_ID = "deboard-v091";

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

function buildDeps(repo: D1HowlerRepository): WorkflowExecutorDeps {
  return {
    repo,
    clock: createFixedClock(NOW),
    workflowIds: createDeterministicIds("wf"),
    resultIds: createDeterministicIds("result"),
    authorization: AUTHORIZATION,
  };
}

async function seedMasonryProject(repo: D1HowlerRepository): Promise<void> {
  const seedFixture = fixture("deboard-seed.json") as {
    response: { body: { project: ProjectModelV094 } };
  };
  const model = seedFixture.response.body.project;
  const initial = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, initial.candidate, initial.oversight);
}

interface EventInput {
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
  mutationClass?: "FACT" | "COMMITMENT";
}

/**
 * The three real, previously-approved DeBoard masonry facts, applied together (matching the
 * plan's Task 14 DeBoard-validation scenario): actual start Aug 28, masonry-material satisfied,
 * masonry-trade satisfied. Scoped only to `masonry` — no overlap with
 * structural_reconcile/framing/brick_veneer. A partial fact (e.g. only SET_ACTUAL_START, leaving
 * both hard constraints UNVERIFIED) leaves masonry's own unverified-critical-path BLOCK finding
 * standing and would still be correctly refused by the scope test — this fixture intentionally
 * clears all three so the resulting oversight has no BLOCK finding left scoped to `masonry`.
 */
function masonryEvent(overrides: Partial<EventInput> = {}): EventInput {
  return {
    id: "voice-conversation-masonry-start",
    baseRevision: 1,
    projectId: MASONRY_PROJECT_ID,
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-28T12:00:00.000Z",
    receivedAt: NOW,
    sourceIds: ["src-voice-masonry-start"],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["masonry"],
    mutations: [
      {
        op: "UPSERT_SOURCE",
        source: {
          id: "src-voice-masonry-start",
          type: "VOICE_CONVERSATION",
          label:
            'Voice conversation: "masonry actually started Aug 28, first block package delivered, masonry crew mobilized"',
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
    ...overrides,
  };
}

/** Scoped only to structural_reconcile/framing — the exact activities the open BLOCK finding
 * names — so an overlapping FACT can be distinguished from a non-overlapping one. */
function overlappingFactEvent(): EventInput {
  return masonryEvent({
    id: "voice-conversation-structural-reconcile",
    impactSeedActivityIds: ["structural_reconcile", "framing"],
    sourceIds: ["src-voice-structural-reconcile"],
    mutations: [
      {
        op: "UPSERT_SOURCE",
        source: {
          id: "src-voice-structural-reconcile",
          type: "VOICE_CONVERSATION",
          label:
            'Voice conversation: "the structural engineering conflict is resolved"',
          observedAt: NOW,
          authority: 0.9,
          reliability: 0.9,
        },
      },
      {
        op: "SET_CONSTRAINT_STATE",
        constraintId: "engineering-reconcile",
        state: "SATISFIED",
        verification: "PM_CONFIRMED",
      },
    ],
  });
}

function applyShadowIntent(event: EventInput): IntentV1 {
  const candidate = {
    schemaVersion: "1",
    intentId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: `key-${event.id}`,
    projectId: MASONRY_PROJECT_ID,
    kind: "EVIDENCE_APPLY_SHADOW",
    requestedEffect: "APPLY_SHADOW",
    expectedProjectRevision: event.baseRevision,
    submittedAt: NOW,
    source: { channel: "API" },
    payload: { type: "EVIDENCE", event },
  };
  const result = validateIntent(candidate);
  if (!result.valid) {
    throw new Error(
      `test fixture is not a valid intent: ${JSON.stringify(result.problems)}`,
    );
  }
  return result.intent;
}

describe("scoped fact-ingestion oversight gate", () => {
  it("fact_applies_despite_unrelated_block: a FACT-class event scoped only to masonry applies and persists despite the open structural_reconcile/brick_veneer BLOCK findings", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    const event = masonryEvent({ mutationClass: "FACT" });
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("SUCCEEDED");
    expect(outcome.result.persisted).toBe(true);
    expect(outcome.result.projectRevisionBefore).toBe(1);
    expect(outcome.result.projectRevisionAfter).toBe(2);

    const project = await repo.loadProject(MASONRY_PROJECT_ID);
    expect(project?.activities.masonry?.actualStart).toBe("2026-08-28");
  });

  it("unrelated_block_persists_after_fact: after the FACT apply, the freshly recomputed oversight review still reports the same unrelated BLOCK findings, unchanged severity", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    const event = masonryEvent({ mutationClass: "FACT" });
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );
    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.persisted).toBe(true);
    expect(outcome.result.output?.type).toBe("SHADOW_TRANSITION");
    if (outcome.result.output?.type !== "SHADOW_TRANSITION") return;

    // The next oversight review, recomputed after this FACT apply, re-evaluates from the
    // unmodified structural_reconcile/brick_veneer conflicts — never cleared, downgraded, or
    // auto-resolved by a FACT event.
    const review = outcome.result.output.data.oversight;
    expect(review.decision).toBe("BLOCK");
    const blockFindingActivityIds = review.findings
      .filter((f) => f.severity === "BLOCK")
      .flatMap((f) => f.activityIds);
    expect(blockFindingActivityIds).toEqual(
      expect.arrayContaining(["structural_reconcile", "brick_veneer"]),
    );

    // Reload from D1 directly too — the persisted oversight review, not just the in-memory
    // result, still carries the same BLOCK findings.
    const persistedReview = await repo.loadOversightReviewById(review.id);
    expect(persistedReview?.decision).toBe("BLOCK");
  });

  it("overlapping_fact_still_blocked: a FACT-class event whose impactSeedActivityIds overlaps a BLOCK finding is refused via the FACT path exactly like a COMMITMENT would be", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    const event = overlappingFactEvent();
    event.mutationClass = "FACT";
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("OVERSIGHT_BLOCKED");
  });

  it("commitment_class_still_blocked: a COMMITMENT-class event scoped only to masonry (no overlap with any BLOCK finding) is still refused — proves the bypass is mutationClass-gated, not merely scope-gated", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    const event = masonryEvent({ mutationClass: "COMMITMENT" });
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("OVERSIGHT_BLOCKED");
  });

  it("an event with mutationClass absent (today's every existing caller) is refused exactly as before — regression-pins current OVERSIGHT_BLOCKED behavior", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    const event = masonryEvent(); // no mutationClass field at all
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("OVERSIGHT_BLOCKED");
  });

  it("decision_expected_commitment_still_gated_by_unrelated_block: a COMMITMENT-class event derived from a DECISION_EXPECTED claim, scoped only to non-blocked activities, is still refused", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    const event = masonryEvent({
      id: "voice-conversation-decision-expected",
      mutationClass: "COMMITMENT",
      impactSeedActivityIds: ["electrical_rough"],
      sourceIds: ["src-voice-decision-expected"],
      mutations: [
        {
          op: "UPSERT_SOURCE",
          source: {
            id: "src-voice-decision-expected",
            type: "VOICE_CONVERSATION",
            label: 'Voice conversation: "Jason Bonham is confirmed for Friday"',
            observedAt: NOW,
            authority: 0.9,
            reliability: 0.9,
          },
        },
        {
          op: "SET_CONSTRAINT_READINESS",
          constraintId: "electrical-trade",
          readiness: {
            optimistic: "2026-09-04",
            likely: "2026-09-04",
            conservative: "2026-09-04",
          },
          verification: "PM_CONFIRMED",
        },
      ],
    });
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("OVERSIGHT_BLOCKED");
  });

  it("caller_supplied_seed_cannot_lie_about_scope: a FACT event whose declared impactSeedActivityIds is unrelated to masonry but whose real mutations target the blocked structural_reconcile constraint is still refused — the gate must derive scope from the mutations themselves, never trust the caller's own seed list", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await seedMasonryProject(repo);

    // Declares only "masonry" (genuinely unrelated to any BLOCK finding) as its impact seed, but
    // its actual mutation satisfies "engineering-reconcile", whose real activityId is
    // "structural_reconcile" -- exactly one of the open BLOCK finding's own activityIds. A gate
    // that trusts the declared seed list would wrongly let this through.
    const event = masonryEvent({
      id: "voice-conversation-scope-lie",
      mutationClass: "FACT",
      impactSeedActivityIds: ["masonry"],
      sourceIds: ["src-voice-scope-lie"],
      mutations: [
        {
          op: "UPSERT_SOURCE",
          source: {
            id: "src-voice-scope-lie",
            type: "VOICE_CONVERSATION",
            label: 'Voice conversation: "the structural engineering conflict is resolved"',
            observedAt: NOW,
            authority: 0.9,
            reliability: 0.9,
          },
        },
        {
          op: "SET_CONSTRAINT_STATE",
          constraintId: "engineering-reconcile",
          state: "SATISFIED",
          verification: "PM_CONFIRMED",
        },
      ],
    });
    const outcome = await executeWorkflow(
      buildDeps(repo),
      applyShadowIntent(event),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    if (outcome.outcome !== "COMPLETED") return;
    expect(outcome.result.status).toBe("BLOCKED");
    expect(outcome.result.persisted).toBe(false);
    expect(outcome.result.problem?.code).toBe("OVERSIGHT_BLOCKED");
  });

});

// NOTE (discovered while testing the fix above, deliberately not addressed here — a distinct,
// deeper architectural question from "caller-supplied seed lying about scope"): forecastAfterEvent
// (src/engine/engine.ts) computes the oversight review AFTER applying the event's own mutations,
// so a FACT-class RESOLVE_CONFLICT that resolves the very conflict a BLOCK finding is derived from
// legitimately clears that BLOCK by the time isScopedFactBypass's caller checks
// `forecastRun.oversight.decision`, regardless of scope derivation. The design spec's own "worked
// not-automatically-allowed case" says resolving a BLOCK-scoped condition must never be reachable
// through this gate at all -- today RESOLVE_CONFLICT is not producible by the claim compiler, so
// this is only reachable via a directly-submitted (non-conversational) evidence intent, but it is
// a real gap: whether the gate should check the PRE-mutation oversight review instead (or refuse
// RESOLVE_CONFLICT under mutationClass "FACT" outright) is a decision this fix does not make.
