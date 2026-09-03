// Pilot activation: reconciles DeBoard's real, existing project model (src/worker/deboard-seed.ts,
// created via the existing POST /v1/projects/deboard-v091/seed route -- completely unmodified,
// including every parity/golden test fixture that snapshots its exact output) against the Sep 3,
// 2026 KF Live PM Intelligence Dashboard snapshot, via the existing evidence-apply mechanism
// (the same one the admin evidence textarea already uses) -- never by hand-editing the seed
// fixture itself.
//
// Every mutation here is scoped to activities the real, pre-existing DeBoard oversight review does
// NOT already BLOCK (conf-plan-engineering: structural_reconcile/framing; conf-brick-match:
// brick_veneer -- both real, pre-existing HIGH-severity open conflicts, left completely untouched)
// -- submitted as a mutationClass: "FACT" event so the scoped-FACT-bypass this codebase already
// implements (src/operator/workflow.ts's isScopedFactBypass) can admit it despite the project's
// existing BLOCK, exactly as that mechanism was built for. "John Marr framing start date" is
// therefore recorded as prose (in the new conflict's description) rather than as a new constraint
// object on the "framing" activity itself -- attaching one there would touch a BLOCKed activity id
// and get refused, and framing's readiness is already correctly gated by the real, pre-existing
// BLOCK regardless.
//
// No conflict was found between this snapshot and DeBoard's existing canonical state: every field
// changed below was previously NOT_STARTED/UNVERIFIED/absent (masonry had no actualStart; the
// building-delivery package had no actualFinish; no backfill/wall-penetration constraint existed
// at all) -- newer information arriving to fill in previously-unknown state, never a contradiction
// of anything the model had actually asserted as true.

import type { ProjectEventV094 } from "../src/domain/types";

const SRC_ID = "deboard-v091-dashboard-sep3";

export const deboardReconciliationEvent: ProjectEventV094 = {
  id: "deboard-v091-reconciliation-2026-09-03",
  baseRevision: 1,
  projectId: "deboard-v091",
  type: "PM_RECONCILIATION",
  occurredAt: "2026-09-03T12:00:00.000Z",
  receivedAt: "2026-09-03T12:00:00.000Z",
  sourceIds: [SRC_ID],
  verification: "PM_CONFIRMED",
  impactSeedActivityIds: [
    "masonry",
    "building_delivery",
    "backfill_gradework",
    "underslab_mep",
  ],
  mutationClass: "FACT",
  note: "KF Live PM Intelligence Dashboard snapshot reconciliation, Sep 3, 2026. Scoped away from the existing structural_reconcile/framing/brick_veneer BLOCK -- those remain untouched.",
  payload: {
    purpose: "Sep 3, 2026 KF Live PM Intelligence Dashboard reconciliation",
  },
  mutations: [
    {
      op: "UPSERT_SOURCE",
      source: {
        id: SRC_ID,
        type: "PM_INPUT",
        label:
          "KF Live PM Intelligence Dashboard -- DeBoard status Sep 3, 2026",
        observedAt: "2026-09-03T00:00:00.000Z",
        effectiveDate: "2026-09-03",
        authority: 0.9,
        reliability: 0.9,
      },
    },
    // FACT: foundation walls actively under construction as of Sep 3.
    {
      op: "UPSERT_ACTIVITY",
      activity: {
        id: "masonry",
        name: "CMU foundation walls",
        phase: "Foundation",
        state: "IN_PROGRESS",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 5,
          sourceIds: ["src-scope", "src-masonry-calendar"],
        },
        constraintIds: [
          "masonry-material",
          "masonry-trade",
          "masonry-completion-target",
        ],
        sourceIds: ["src-plans", "src-scope", "src-dashboard", SRC_ID],
        actualStart: "2026-09-03",
        actualStartSourceIds: [SRC_ID],
        actualStartVerification: "PM_CONFIRMED",
      },
    },
    // COMMITMENT/TARGET: foundation-wall completion targeted Sep 4, possible rollover into Sep 5.
    {
      op: "UPSERT_CONSTRAINT",
      constraint: {
        id: "masonry-completion-target",
        activityId: "masonry",
        type: "SCHEDULE_TARGET",
        label:
          "PM target: foundation-wall completion Sep 4, possible rollover into Sep 5",
        state: "COMMITTED",
        hard: false,
        readiness: {
          optimistic: "2026-09-04",
          likely: "2026-09-04",
          conservative: "2026-09-05",
        },
        sourceIds: [SRC_ID],
        verification: "PM_CONFIRMED",
      },
    },
    // FACT: walls, subfloor and building package are on site -- no current material blocker.
    {
      op: "UPSERT_ACTIVITY",
      activity: {
        id: "building_delivery",
        name: "Walls and subfloor package delivery",
        phase: "Procurement",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 1,
          sourceIds: ["src-building-package"],
        },
        constraintIds: ["building-delivery-ready"],
        sourceIds: ["src-building-package", "src-dashboard", SRC_ID],
        actualStart: "2026-08-28",
        actualStartSourceIds: ["src-building-package"],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: "2026-09-03",
        actualFinishSourceIds: [SRC_ID],
        actualFinishVerification: "FIELD_VERIFIED",
      },
    },
    {
      op: "UPSERT_CONSTRAINT",
      constraint: {
        id: "building-delivery-ready",
        activityId: "building_delivery",
        type: "MATERIAL",
        label: "Walls/subfloor delivery Aug 28 -- confirmed on site Sep 3",
        state: "DELIVERED",
        hard: true,
        readiness: {
          optimistic: "2026-08-28",
          likely: "2026-08-28",
          conservative: "2026-08-28",
        },
        sourceIds: ["src-building-package", SRC_ID],
        verification: "FIELD_VERIFIED",
      },
    },
    // UNKNOWN: Sam's committed backfill/garage-pad preparation date not yet given. No such scope
    // item existed in the model at all -- added as new activity + constraint, never replacing
    // valid existing project architecture.
    {
      op: "UPSERT_ACTIVITY",
      activity: {
        id: "backfill_gradework",
        name: "Backfill and garage-pad grading prep",
        phase: "Site Work",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [SRC_ID],
        },
        constraintIds: ["backfill-readiness"],
        sourceIds: [SRC_ID],
      },
    },
    {
      op: "UPSERT_CONSTRAINT",
      constraint: {
        id: "backfill-readiness",
        activityId: "backfill_gradework",
        type: "TRADE_AVAILABILITY",
        label:
          "Sam's committed backfill / garage-pad preparation date not yet given",
        state: "PENDING",
        hard: true,
        sourceIds: [SRC_ID],
        verification: "UNVERIFIED",
      },
    },
    // UNKNOWN: Medina plumbing wall-penetration completion/date not yet confirmed.
    {
      op: "UPSERT_ACTIVITY",
      activity: {
        id: "underslab_mep",
        name: "Under-slab plumbing/electrical routing",
        phase: "MEP",
        state: "NOT_STARTED",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 5,
          sourceIds: ["src-scope", "src-plumbing"],
        },
        constraintIds: ["mep-routing", "plumbing-wall-penetration"],
        sourceIds: ["src-scope", "src-plumbing", SRC_ID],
      },
    },
    {
      op: "UPSERT_CONSTRAINT",
      constraint: {
        id: "plumbing-wall-penetration",
        activityId: "underslab_mep",
        type: "INFORMATION",
        label:
          "Medina plumbing wall-penetration completion/date not yet confirmed",
        state: "PENDING",
        hard: false,
        sourceIds: [SRC_ID],
        verification: "UNVERIFIED",
      },
    },
    // BLOCKER/RISK + NEXT ACTION. John Marr's framing start date (also UNKNOWN per the snapshot)
    // is recorded here as prose, not as a new constraint on "framing" -- framing is already gated
    // by the real, pre-existing conf-plan-engineering BLOCK, and a FACT-classified mutation
    // touching "framing" would collide with that BLOCK's scope and be refused.
    {
      op: "UPSERT_CONFLICT",
      conflict: {
        id: "conf-masonry-transition-risk",
        category: "SEQUENCING_RISK",
        description:
          "Transition from masonry into backfill/site preparation, plumbing wall penetrations, garage-pad work and framing must avoid idle time. John Marr's framing start date is not yet secured (framing remains separately gated by the existing plan/engineering reconciliation block). Next actions: verify foundation-wall completion Sep 4/5; secure Sam's backfill and main/lower garage-pad preparation date; coordinate Medina plumbing wall penetrations; secure John Marr framing start against completed prerequisites.",
        activityIds: ["masonry", "backfill_gradework", "underslab_mep"],
        sourceIds: [SRC_ID],
        severity: "MEDIUM",
        status: "OPEN",
      },
    },
  ],
};
