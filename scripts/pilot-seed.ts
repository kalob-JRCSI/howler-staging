// Pilot activation: authoritative pilot project data for the 6 non-DeBoard pilot projects
// ("KF Live PM Intelligence Dashboard -- New Model v2": Stewart, Swiderski, Pratt, Carver,
// Ciurlizza, McMillan; DeBoard keeps its own existing, more detailed seed in
// src/worker/deboard-seed.ts and is reconciled separately -- see docs/pilot/deboard-reconciliation
// for that event). Content below is transcribed directly from the Sep 3, 2026 snapshot the user
// supplied -- not fabricated, not inferred.
//
// Deliberately lives under scripts/, not src/worker/: the generalized POST /v1/projects/:id/import
// route (Task 13) already exists precisely so onboarding a new project never requires a new
// worker-shipped *-seed.ts file -- see test/integration/project-import.test.ts's
// "import_route_is_parameterized: one route handles any projectId, and no new *-seed.ts files
// exist on disk" regression test, which enumerates src/worker/*.ts at test-collection time and
// fails if a second one appears. This file is a one-time-use data module (imported by
// test/unit/pilot-seed.test.ts and the real browser pilot-activation test), never bundled into
// the Worker itself.
//
// Modeling discipline applied throughout (see docs/superpowers -- same discipline the rest of
// Howler's domain model already enforces):
//   FACT        -- an activity marked COMPLETE (with actualStart/actualFinish + PM_CONFIRMED
//                  verification) or IN_PROGRESS (actively underway, never marked COMPLETE without
//                  an independently confirmed finish). A scheduled/expected event is NEVER marked
//                  COMPLETE merely because a date was scheduled -- see Swiderski's Aug 31 drywall
//                  below, which stays NOT_STARTED with an UNVERIFIED completion-status constraint
//                  precisely because the snapshot says completion is unknown.
//   COMMITMENT/
//   EXPECTED    -- a constraint's real `readiness` window (a scheduled/targeted date range),
//                  verification PM_CONFIRMED (the target itself is confirmed real), never an
//                  actualStart/actualFinish.
//   UNKNOWN     -- a constraint with NO readiness window at all, verification UNVERIFIED --
//                  genuinely unresolved, never guessed at.
//   BLOCKER/
//   RISK        -- one conflict per project (severity HIGH for Ciurlizza's RED, hard county-
//                  clearance gate; MEDIUM for the five YELLOW/GREEN projects), status OPEN.
//   NEXT ACTION -- carried in that same conflict's description (ProjectModelV094 has no dedicated
//                  field for this, matching deboard-seed.ts's own established convention).
// Explicit real-world blocking order the snapshot states (e.g. "cabinetry repairs need
// definition/completion before Artistic side-splash installation") is encoded as a real
// DependencyV094, not just prose, wherever the snapshot states one.
//
// Entity names are deliberately distinct and un-prefixed (never "<ProjectName> <thing>") --
// mirroring deboard-seed.ts's own pattern (e.g. "CMU foundation walls", never "DeBoard CMU
// foundation walls"). An earlier version of this file prefixed every entity with the project's own
// display name, which made any utterance mentioning the project (mandatory for project resolution)
// match every entity at once via resolveClaimEntity's token-overlap matching -- found via a real
// browser session, fixed by using distinct real-world-flavored names throughout.

import type {
  ConstraintReadinessV094,
  ProjectModelV094,
  SourceV094,
} from "../src/domain/types";

export interface PilotProjectDefinition {
  projectId: string;
  displayName: string;
}

export const PILOT_PROJECTS: PilotProjectDefinition[] = [
  { projectId: "stewart-v1", displayName: "Stewart" },
  { projectId: "swiderski-v1", displayName: "Swiderski" },
  { projectId: "pratt-v1", displayName: "Pratt" },
  { projectId: "carver-v1", displayName: "Carver" },
  { projectId: "ciurlizza-v1", displayName: "Ciurlizza" },
  { projectId: "mcmillan-v1", displayName: "McMillan" },
];

const SNAPSHOT_DATE = "2026-09-03";
const SNAPSHOT_DT = "2026-09-03T00:00:00.000Z";

function w(
  optimistic: string,
  likely: string,
  conservative: string,
): ConstraintReadinessV094 {
  return { optimistic, likely, conservative };
}

function dashboardSource(projectId: string, label: string): SourceV094 {
  return {
    id: `${projectId}-dashboard-sep3`,
    type: "PM_INPUT",
    label,
    observedAt: SNAPSHOT_DT,
    effectiveDate: SNAPSHOT_DATE,
    authority: 0.9,
    reliability: 0.9,
  };
}

// ---------------------------------------------------------------------------------------------
// STEWART -- YELLOW
// ---------------------------------------------------------------------------------------------
function buildStewart(): ProjectModelV094 {
  const projectId = "stewart-v1";
  const src = dashboardSource(
    projectId,
    "KF Live PM Intelligence Dashboard -- Stewart status Sep 3, 2026",
  );
  return {
    projectId,
    revision: 0,
    name: "Stewart (YELLOW)",
    projectType: "PILOT",
    timezone: "America/New_York",
    forecastAnchorDate: SNAPSHOT_DATE,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [src.id]: src },
    activities: {
      final_punch_review: {
        id: "final_punch_review",
        name: "Final punch review and trade/vendor assignment",
        phase: "Closeout",
        state: "IN_PROGRESS",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 5,
          sourceIds: [src.id],
        },
        constraintIds: ["punch-trade-assignment"],
        sourceIds: [src.id],
      },
      tile_handrail_scope: {
        id: "tile_handrail_scope",
        name: "Tom Pollock tile and handrail scope",
        phase: "Finish Carpentry",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      dax_painting: {
        id: "dax_painting",
        name: "Dax Painting",
        phase: "Painting",
        state: "IN_PROGRESS",
        duration: {
          optimistic: 3,
          likely: 5,
          conservative: 8,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
      },
      cabinetry_flooring_repairs: {
        id: "cabinetry_flooring_repairs",
        name: "Cabinetry repair and tape-residue flooring correction",
        phase: "Closeout",
        state: "NOT_STARTED",
        duration: {
          optimistic: 2,
          likely: 4,
          conservative: 6,
          sourceIds: [src.id],
        },
        constraintIds: [
          "bill-moore-flooring-response",
          "wonderfox-cabinetry-repair",
        ],
        sourceIds: [src.id],
      },
      side_splash_install: {
        id: "side_splash_install",
        name: "Artistic Granite & Marble side-splash installation",
        phase: "Finish",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
      },
    },
    constraints: {
      "punch-trade-assignment": {
        id: "punch-trade-assignment",
        activityId: "final_punch_review",
        type: "SEQUENCING",
        label: "Remaining punch items still require trade/vendor assignment",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "bill-moore-flooring-response": {
        id: "bill-moore-flooring-response",
        activityId: "cabinetry_flooring_repairs",
        type: "INFORMATION",
        label:
          "Bill Moore flooring damage (tape residue) response/correction path not yet given",
        state: "PENDING",
        hard: true,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "wonderfox-cabinetry-repair": {
        id: "wonderfox-cabinetry-repair",
        activityId: "cabinetry_flooring_repairs",
        type: "INFORMATION",
        label:
          "Mr. Wonderfox cabinetry repair price, scope and availability not yet given (photos sent)",
        state: "PENDING",
        hard: true,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {
      "dep-stewart-cabinetry-before-sidesplash": {
        id: "dep-stewart-cabinetry-before-sidesplash",
        active: true,
        predecessorId: "cabinetry_flooring_repairs",
        successorId: "side_splash_install",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason:
          "Cabinetry repairs need definition/completion before Artistic side-splash installation",
        sourceIds: [src.id],
      },
    },
    conflicts: {
      "stewart-punch-closeout-risk": {
        id: "stewart-punch-closeout-risk",
        category: "CLOSEOUT_RISK",
        description:
          "Cabinetry repairs and flooring correction remain undefined, blocking Artistic side-splash installation; remaining punch items still need trade/vendor assignment. Next actions: obtain Bill Moore flooring response; obtain Wonderfox cabinetry repair price/scope/schedule; complete cabinetry repairs before Artistic side splashes; continue Dax Painting; continue assigning/scheduling final punch by trade.",
        activityIds: [
          "cabinetry_flooring_repairs",
          "side_splash_install",
          "final_punch_review",
        ],
        sourceIds: [src.id],
        severity: "MEDIUM",
        status: "OPEN",
      },
    },
    eventLedger: [],
  };
}

// ---------------------------------------------------------------------------------------------
// SWIDERSKI -- YELLOW
// ---------------------------------------------------------------------------------------------
function buildSwiderski(): ProjectModelV094 {
  const projectId = "swiderski-v1";
  const src = dashboardSource(
    projectId,
    "KF Live PM Intelligence Dashboard -- Swiderski status Sep 3, 2026",
  );
  return {
    projectId,
    revision: 0,
    name: "Swiderski (YELLOW)",
    projectType: "PILOT",
    timezone: "America/New_York",
    forecastAnchorDate: SNAPSHOT_DATE,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [src.id]: src },
    activities: {
      bathroom_tile: {
        id: "bathroom_tile",
        name: "Bathroom tile",
        phase: "Finish",
        state: "COMPLETE",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 4,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      // Not marked COMPLETE: the Aug 31 bed-coat/tape/finish date was scheduled, but the snapshot
      // says actual completion status is unknown -- a scheduled/expected event never becomes
      // completed truth merely because it was scheduled.
      drywall_bed_tape_finish: {
        id: "drywall_bed_tape_finish",
        name: "Drywall bed coat, tape and finish -- bathroom, living room, foyer (Tim Antle / Antle Drywall)",
        phase: "Drywall",
        state: "NOT_STARTED",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 4,
          sourceIds: [src.id],
        },
        constraintIds: ["drywall-completion-status"],
        sourceIds: [src.id],
      },
      painting: {
        id: "painting",
        name: "Painting (post-drywall)",
        phase: "Painting",
        state: "NOT_STARTED",
        duration: {
          optimistic: 3,
          likely: 5,
          conservative: 7,
          sourceIds: [src.id],
        },
        constraintIds: ["paint-selection-pending"],
        sourceIds: [src.id],
      },
      electrical_finals: {
        id: "electrical_finals",
        name: "Electrical finals",
        phase: "Electrical",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
      },
    },
    constraints: {
      "drywall-completion-status": {
        id: "drywall-completion-status",
        activityId: "drywall_bed_tape_finish",
        type: "INFORMATION",
        label:
          "Tim Antle scheduled Aug 31 for bed coat/tape/finish; scope contractually agreed by email (Jeffrey/Paul), but actual completion status is not yet verified",
        state: "SCHEDULED_UNVERIFIED",
        hard: true,
        readiness: w("2026-08-31", "2026-08-31", "2026-08-31"),
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "paint-selection-pending": {
        id: "paint-selection-pending",
        activityId: "painting",
        type: "INFORMATION",
        label: "Mr. Swiderski paint selections not yet given",
        state: "PENDING",
        hard: true,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {
      "dep-swiderski-drywall-before-paint": {
        id: "dep-swiderski-drywall-before-paint",
        active: true,
        predecessorId: "drywall_bed_tape_finish",
        successorId: "painting",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason:
          "Paint selections control transition from drywall into painting",
        sourceIds: [src.id],
      },
      "dep-swiderski-paint-before-electrical": {
        id: "dep-swiderski-paint-before-electrical",
        active: true,
        predecessorId: "painting",
        successorId: "electrical_finals",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason: "Electrical finals follow drywall and paint completion",
        sourceIds: [src.id],
      },
    },
    conflicts: {
      "swiderski-drywall-paint-risk": {
        id: "swiderski-drywall-paint-risk",
        category: "SEQUENCING_RISK",
        description:
          "Actual Aug 31 drywall completion status is unverified and Mr. Swiderski's paint selections are outstanding, both gating the drywall-to-paint-to-electrical sequence. Next actions: verify actual drywall completion status; obtain paint selections; release painting after drywall; schedule electrical finals after drywall/paint completion.",
        activityIds: [
          "drywall_bed_tape_finish",
          "painting",
          "electrical_finals",
        ],
        sourceIds: [src.id],
        severity: "MEDIUM",
        status: "OPEN",
      },
    },
    eventLedger: [],
  };
}

// ---------------------------------------------------------------------------------------------
// PRATT -- YELLOW
// ---------------------------------------------------------------------------------------------
function buildPratt(): ProjectModelV094 {
  const projectId = "pratt-v1";
  const src = dashboardSource(
    projectId,
    "KF Live PM Intelligence Dashboard -- Pratt status Sep 3, 2026",
  );
  return {
    projectId,
    revision: 0,
    name: "Pratt (YELLOW)",
    projectType: "PILOT",
    timezone: "America/New_York",
    forecastAnchorDate: SNAPSHOT_DATE,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [src.id]: src },
    activities: {
      vanity_cabinetry: {
        id: "vanity_cabinetry",
        name: "Vanity cabinetry install (both walls)",
        phase: "Finish Carpentry",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      electrical_finals: {
        id: "electrical_finals",
        name: "Electrical finals (Waylon)",
        phase: "Electrical",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      handles_molding: {
        id: "handles_molding",
        name: "Handles and molding -- top-column cabinetry (Lewis Hill)",
        phase: "Finish Carpentry",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 1,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      carpet_install: {
        id: "carpet_install",
        name: "Carpet install (Cindy Pratt allowance $998)",
        phase: "Flooring",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: ["carpet-allowance-check"],
        sourceIds: [src.id],
      },
      painting_reassignment: {
        id: "painting_reassignment",
        name: "Painting scope reassignment (Saul scope voided)",
        phase: "Painting",
        state: "NOT_STARTED",
        duration: {
          optimistic: 3,
          likely: 5,
          conservative: 7,
          sourceIds: [src.id],
        },
        constraintIds: ["painter-reassignment"],
        sourceIds: [src.id],
      },
      kenny_closet: {
        id: "kenny_closet",
        name: "Kenny closet material install",
        phase: "Finish Carpentry",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: ["kenny-closet-material"],
        sourceIds: [src.id],
      },
      plumbing_final: {
        id: "plumbing_final",
        name: "Plumbing finals",
        phase: "Plumbing",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: ["plumbing-final-verify"],
        sourceIds: [src.id],
      },
    },
    constraints: {
      "carpet-allowance-check": {
        id: "carpet-allowance-check",
        activityId: "carpet_install",
        type: "BUDGET",
        label:
          "Cindy Pratt's carpet selection must be verified against the $998 allowance before release. Known selections on file: walls Sherwin-Williams Balanced Beige SW 7037 (eggshell, premium mildew-resistant bath paint); doors/trim Porter/PPG Velvet White (semi-gloss); ceiling Velvet White (flat); shower-wall grout Bostik Mobe Pearl H145; shower floor/tub backsplash grout TEC Warm Taupe 973.",
        state: "PENDING",
        hard: true,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "painter-reassignment": {
        id: "painter-reassignment",
        activityId: "painting_reassignment",
        type: "TRADE_AVAILABILITY",
        label:
          "Replacement painter not yet selected between Brayance Painting / Dax Painting; Saul contract reconciliation outcome not yet confirmed",
        state: "PENDING",
        hard: true,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "kenny-closet-material": {
        id: "kenny-closet-material",
        activityId: "kenny_closet",
        type: "MATERIAL",
        label: "Kenny closet material readiness/install date not yet secured",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "plumbing-final-verify": {
        id: "plumbing-final-verify",
        activityId: "plumbing_final",
        type: "INFORMATION",
        label: "Plumbing-final completion not yet verified",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {},
    conflicts: {
      "pratt-closeout-risk": {
        id: "pratt-closeout-risk",
        category: "CLOSEOUT_RISK",
        description:
          "Carpet allowance verification, Saul contract reconciliation/painter reassignment, Kenny closet material readiness, and plumbing finals remain open closeout items. Next actions: verify carpet against allowance before release; reconcile Saul contract and void painting scope; assign/schedule replacement painter; secure Kenny material readiness/install date; verify plumbing finals.",
        activityIds: [
          "carpet_install",
          "painting_reassignment",
          "kenny_closet",
          "plumbing_final",
        ],
        sourceIds: [src.id],
        severity: "MEDIUM",
        status: "OPEN",
      },
    },
    eventLedger: [],
  };
}

// ---------------------------------------------------------------------------------------------
// CARVER -- YELLOW
// ---------------------------------------------------------------------------------------------
function buildCarver(): ProjectModelV094 {
  const projectId = "carver-v1";
  const src = dashboardSource(
    projectId,
    "KF Live PM Intelligence Dashboard -- Carver status Sep 3, 2026",
  );
  return {
    projectId,
    revision: 0,
    name: "Carver (YELLOW)",
    projectType: "PILOT",
    timezone: "America/New_York",
    forecastAnchorDate: SNAPSHOT_DATE,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [src.id]: src },
    activities: {
      trim_install: {
        id: "trim_install",
        name: "Cox Interiors trim install",
        phase: "Finish Carpentry",
        state: "COMPLETE",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 4,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      shower_grout_seal: {
        id: "shower_grout_seal",
        name: "Shower grouting and sealing",
        phase: "Tile",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      painting: {
        id: "painting",
        name: "Painting",
        phase: "Painting",
        state: "COMPLETE",
        duration: {
          optimistic: 3,
          likely: 5,
          conservative: 7,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
        actualStart: SNAPSHOT_DATE,
        actualStartSourceIds: [src.id],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: SNAPSHOT_DATE,
        actualFinishSourceIds: [src.id],
        actualFinishVerification: "PM_CONFIRMED",
      },
      light_fixtures: {
        id: "light_fixtures",
        name: "Light fixture pickup/delivery/install (Brittany ordered)",
        phase: "Electrical",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: ["light-delivery-commitment"],
        sourceIds: [src.id],
      },
      electrical_finals: {
        id: "electrical_finals",
        name: "Electrical finals",
        phase: "Electrical",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 1,
          sourceIds: [src.id],
        },
        constraintIds: ["electrical-finals-commitment"],
        sourceIds: [src.id],
      },
      granite_install: {
        id: "granite_install",
        name: "Artistic Granite & Marble installation",
        phase: "Countertops",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: ["granite-install-commitment"],
        sourceIds: [src.id],
      },
      shoe_mold_stain: {
        id: "shoe_mold_stain",
        name: "Remaining shoe-mold stain match and finish (David Stanfield)",
        phase: "Finish Carpentry",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: ["stain-match-pending"],
        sourceIds: [src.id],
      },
      office_paint_touchup: {
        id: "office_paint_touchup",
        name: "Office-area wall paint match/touch-up",
        phase: "Painting",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: ["office-paint-match-pending"],
        sourceIds: [src.id],
      },
    },
    constraints: {
      "light-delivery-commitment": {
        id: "light-delivery-commitment",
        activityId: "light_fixtures",
        type: "MATERIAL",
        label: "Light pickup/delivery committed for Sep 8",
        state: "COMMITTED",
        hard: false,
        readiness: w("2026-09-08", "2026-09-08", "2026-09-08"),
        sourceIds: [src.id],
        verification: "PM_CONFIRMED",
      },
      "electrical-finals-commitment": {
        id: "electrical-finals-commitment",
        activityId: "electrical_finals",
        type: "TRADE_AVAILABILITY",
        label: "Electrical finals scheduled Sep 9",
        state: "COMMITTED",
        hard: false,
        readiness: w("2026-09-09", "2026-09-09", "2026-09-09"),
        sourceIds: [src.id],
        verification: "PM_CONFIRMED",
      },
      "granite-install-commitment": {
        id: "granite-install-commitment",
        activityId: "granite_install",
        type: "TRADE_AVAILABILITY",
        label: "Artistic Granite & Marble installation scheduled Sep 9",
        state: "COMMITTED",
        hard: false,
        readiness: w("2026-09-09", "2026-09-09", "2026-09-09"),
        sourceIds: [src.id],
        verification: "PM_CONFIRMED",
      },
      "stain-match-pending": {
        id: "stain-match-pending",
        activityId: "shoe_mold_stain",
        type: "INFORMATION",
        label:
          "Correct Minwax stain match for remaining shoe mold not yet confirmed",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "office-paint-match-pending": {
        id: "office-paint-match-pending",
        activityId: "office_paint_touchup",
        type: "INFORMATION",
        label: "Office-area wall paint match not yet confirmed",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {},
    conflicts: {
      "carver-closeout-risk": {
        id: "carver-closeout-risk",
        category: "CLOSEOUT_RISK",
        description:
          "Light delivery, shoe-mold stain match, office paint match, electrical finals, and granite installation all control final closeout sequencing. Next actions: execute Sep 8 light pickup/delivery; secure stain match and finish remaining trim with David Stanfield; secure office paint match/touch-up; execute Sep 9 electrical finals and granite installation; prepare final closeout when clients return from vacation.",
        activityIds: [
          "light_fixtures",
          "electrical_finals",
          "granite_install",
          "shoe_mold_stain",
          "office_paint_touchup",
        ],
        sourceIds: [src.id],
        severity: "MEDIUM",
        status: "OPEN",
      },
    },
    eventLedger: [],
  };
}

// ---------------------------------------------------------------------------------------------
// CIURLIZZA -- RED
// ---------------------------------------------------------------------------------------------
function buildCiurlizza(): ProjectModelV094 {
  const projectId = "ciurlizza-v1";
  const src = dashboardSource(
    projectId,
    "KF Live PM Intelligence Dashboard -- Ciurlizza status Sep 3, 2026",
  );
  return {
    projectId,
    revision: 0,
    name: "Ciurlizza (RED)",
    projectType: "PILOT",
    timezone: "America/New_York",
    forecastAnchorDate: SNAPSHOT_DATE,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [src.id]: src },
    activities: {
      electrical_mobilize_complete: {
        id: "electrical_mobilize_complete",
        name: "Wayland Electric mobilization and completion",
        phase: "Electrical",
        state: "NOT_STARTED",
        duration: {
          optimistic: 2,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: [
          "wayland-mobilize-commitment",
          "electrical-completion-target",
        ],
        sourceIds: [src.id],
      },
      county_site_walk: {
        id: "county_site_walk",
        name: "Fayette County overall site walk",
        phase: "Inspection",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 1,
          sourceIds: [src.id],
        },
        constraintIds: ["county-walk-unconfirmed"],
        sourceIds: [src.id],
      },
      pocket_doors: {
        id: "pocket_doors",
        name: "Frosted pocket door install (McKeller/Jorge approved)",
        phase: "Doors",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: [
          "pocket-door-design-approved",
          "pocket-door-order-unconfirmed",
        ],
        sourceIds: [src.id],
      },
      window_orders: {
        id: "window_orders",
        name: "Bay and egress window orders (Builders First Choice)",
        phase: "Windows",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: ["window-order-status-unknown"],
        sourceIds: [src.id],
      },
      insulation_drywall: {
        id: "insulation_drywall",
        name: "31-W insulation then Tim Antle drywall",
        phase: "Insulation/Drywall",
        state: "NOT_STARTED",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 5,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
      },
    },
    constraints: {
      "wayland-mobilize-commitment": {
        id: "wayland-mobilize-commitment",
        activityId: "electrical_mobilize_complete",
        type: "TRADE_AVAILABILITY",
        label: "Wayland Electric scheduled to mobilize Sep 8",
        state: "COMMITTED",
        hard: true,
        readiness: w("2026-09-08", "2026-09-08", "2026-09-08"),
        sourceIds: [src.id],
        verification: "PM_CONFIRMED",
      },
      "electrical-completion-target": {
        id: "electrical-completion-target",
        activityId: "electrical_mobilize_complete",
        type: "SCHEDULE_TARGET",
        label: "Target electrical completion / stickered inspection Sep 10",
        state: "COMMITTED",
        hard: true,
        readiness: w("2026-09-10", "2026-09-10", "2026-09-10"),
        sourceIds: [src.id],
        verification: "PM_CONFIRMED",
      },
      "county-walk-unconfirmed": {
        id: "county-walk-unconfirmed",
        activityId: "county_site_walk",
        type: "INFORMATION",
        label:
          "Fayette County overall site walk intended for Sep 11, but the appointment still must be secured -- not yet committed",
        state: "PENDING",
        hard: true,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      // The design decision itself is a real, confirmed FACT (McKeller and Jorge approved
      // frosted pocket doors) -- distinct from whether Cox Interiors has actually placed the
      // order, which remains genuinely unknown (see pocket-door-order-unconfirmed below).
      "pocket-door-design-approved": {
        id: "pocket-door-design-approved",
        activityId: "pocket_doors",
        type: "INFORMATION",
        label: "McKeller and Jorge approved frosted pocket doors",
        state: "APPROVED",
        hard: false,
        sourceIds: [src.id],
        verification: "PM_CONFIRMED",
      },
      "pocket-door-order-unconfirmed": {
        id: "pocket-door-order-unconfirmed",
        activityId: "pocket_doors",
        type: "MATERIAL",
        label: "Cox Interiors frosted pocket-door order not yet confirmed",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "window-order-status-unknown": {
        id: "window-order-status-unknown",
        activityId: "window_orders",
        type: "MATERIAL",
        label:
          "Builders First Choice bay-window and egress-window order status unknown",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {
      "dep-ciurlizza-county-before-insulation": {
        id: "dep-ciurlizza-county-before-insulation",
        active: true,
        predecessorId: "county_site_walk",
        successorId: "insulation_drywall",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason:
          "Finish sequence cannot safely release until required county clearance",
        sourceIds: [src.id],
      },
      "dep-ciurlizza-electrical-before-insulation": {
        id: "dep-ciurlizza-electrical-before-insulation",
        active: true,
        predecessorId: "electrical_mobilize_complete",
        successorId: "insulation_drywall",
        type: "FINISH_TO_START",
        lagWorkdays: 0,
        hard: true,
        reason:
          "After clearance, schedule 31-W insulation then Tim Antle drywall",
        sourceIds: [src.id],
      },
    },
    conflicts: {
      "ciurlizza-county-clearance-block": {
        id: "ciurlizza-county-clearance-block",
        category: "REGULATORY_CLEARANCE",
        description:
          "Electrical completion/stickered inspection, county site-walk/clearance, and window/pocket-door orders are all unresolved; the finish sequence cannot safely release until required county clearance. Next actions: Sep 4 contact Fayette County and secure Sep 11 site walk; verify bay and egress window orders with Colin; confirm Cox Interiors pocket-door order; Sep 8 verify Wayland mobilization; Sep 10 verify electrical completion/sticker; Sep 11 complete county site walk if confirmed; after clearance schedule 31-W insulation then Tim Antle drywall.",
        activityIds: [
          "electrical_mobilize_complete",
          "county_site_walk",
          "pocket_doors",
          "window_orders",
        ],
        sourceIds: [src.id],
        severity: "HIGH",
        status: "OPEN",
      },
    },
    eventLedger: [],
  };
}

// ---------------------------------------------------------------------------------------------
// MCMILLAN -- GREEN
// ---------------------------------------------------------------------------------------------
function buildMcmillan(): ProjectModelV094 {
  const projectId = "mcmillan-v1";
  const src = dashboardSource(
    projectId,
    "KF Live PM Intelligence Dashboard -- McMillan status Sep 3, 2026",
  );
  return {
    projectId,
    revision: 0,
    name: "McMillan (GREEN)",
    projectType: "PILOT",
    timezone: "America/New_York",
    forecastAnchorDate: SNAPSHOT_DATE,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [src.id]: src },
    activities: {
      concrete_platform_sidewalk: {
        id: "concrete_platform_sidewalk",
        name: "Concrete platform and sidewalk pour/stamp/color",
        phase: "Exterior Closeout",
        state: "IN_PROGRESS",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
      },
      electrical_circuit_correction: {
        id: "electrical_circuit_correction",
        name: "Bonham Electric light-pole/water-heater shared-circuit correction",
        phase: "Electrical",
        state: "IN_PROGRESS",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 1,
          sourceIds: [src.id],
        },
        constraintIds: [],
        sourceIds: [src.id],
      },
      porch_ceiling: {
        id: "porch_ceiling",
        name: "Porch-ceiling renovation",
        phase: "Exterior Closeout",
        state: "NOT_STARTED",
        duration: {
          optimistic: 2,
          likely: 3,
          conservative: 4,
          sourceIds: [src.id],
        },
        constraintIds: ["porch-ceiling-approval-pending"],
        sourceIds: [src.id],
      },
      column_painting: {
        id: "column_painting",
        name: "Column painting",
        phase: "Exterior Closeout",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 2,
          conservative: 3,
          sourceIds: [src.id],
        },
        constraintIds: ["column-paint-approval-pending"],
        sourceIds: [src.id],
      },
      interior_site_walk: {
        id: "interior_site_walk",
        name: "David Stanfield interior site walk / estimate",
        phase: "Interior",
        state: "NOT_STARTED",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 1,
          sourceIds: [src.id],
        },
        constraintIds: ["stanfield-walk-pending"],
        sourceIds: [src.id],
      },
    },
    constraints: {
      "porch-ceiling-approval-pending": {
        id: "porch-ceiling-approval-pending",
        activityId: "porch_ceiling",
        type: "INFORMATION",
        label:
          "Porch-ceiling renovation approval/committed dates not yet given",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "column-paint-approval-pending": {
        id: "column-paint-approval-pending",
        activityId: "column_painting",
        type: "INFORMATION",
        label: "Column-painting approval/committed dates not yet given",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
      "stanfield-walk-pending": {
        id: "stanfield-walk-pending",
        activityId: "interior_site_walk",
        type: "INFORMATION",
        label:
          "David Stanfield interior site-walk date/estimate not yet secured",
        state: "PENDING",
        hard: false,
        sourceIds: [src.id],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {},
    conflicts: {
      "mcmillan-closeout-dependencies": {
        id: "mcmillan-closeout-dependencies",
        category: "CLOSEOUT_RISK",
        description:
          "Exterior closeout depends on remaining porch-ceiling and column-paint scopes; interior scope still requires a Stanfield site walk/estimate. Next actions: verify Sep 3 concrete completion; verify Bonham electrical correction completion; secure porch-ceiling and column-paint approval/dates; schedule David Stanfield interior site walk and obtain estimate.",
        activityIds: ["porch_ceiling", "column_painting", "interior_site_walk"],
        sourceIds: [src.id],
        severity: "MEDIUM",
        status: "OPEN",
      },
    },
    commercialSignals: {
      "sig-mcmillan-electrical-co": {
        id: "sig-mcmillan-electrical-co",
        kind: "CHANGE_ORDER",
        activityIds: ["electrical_circuit_correction"],
        workPackage:
          "Bonham Electric light-pole/water-heater circuit separation (code compliance)",
        amount: 600,
        currency: "USD",
        selected: true,
        scopeCoverage: "FULL",
        sourceIds: [src.id],
      },
    },
    eventLedger: [],
  };
}

const PILOT_PROJECT_BUILDERS: Record<string, () => ProjectModelV094> = {
  "stewart-v1": buildStewart,
  "swiderski-v1": buildSwiderski,
  "pratt-v1": buildPratt,
  "carver-v1": buildCarver,
  "ciurlizza-v1": buildCiurlizza,
  "mcmillan-v1": buildMcmillan,
};

/**
 * Builds the authoritative Sep 3, 2026 project model for one pilot project, transcribed from the
 * "KF Live PM Intelligence Dashboard -- New Model v2" snapshot. `def` only selects which builder
 * runs (kept for backward compatibility with callers that iterate PILOT_PROJECTS generically);
 * each project's actual content is project-specific, not templated.
 */
export function buildPilotSeedProject(
  def: PilotProjectDefinition,
): ProjectModelV094 {
  const builder = PILOT_PROJECT_BUILDERS[def.projectId];
  if (!builder) {
    throw new Error(`no pilot seed builder registered for ${def.projectId}`);
  }
  return builder();
}
