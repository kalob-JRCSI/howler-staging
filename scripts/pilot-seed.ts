// Pilot activation: minimum deterministic pilot seed for the initial 7-project pilot roster
// ("KF Live PM Intelligence Dashboard -- New Model v2": Stewart, Swiderski, Pratt, Carver,
// Ciurlizza, DeBoard, McMillan). DeBoard already has its own real, detailed seed
// (createDeboardSeed in src/worker/deboard-seed.ts) and is not duplicated here.
//
// Deliberately lives under scripts/, not src/worker/: the generalized POST /v1/projects/:id/import
// route (Task 13) already exists precisely so onboarding a new project never requires a new
// worker-shipped *-seed.ts file -- see test/integration/project-import.test.ts's
// "import_route_is_parameterized: one route handles any projectId, and no new *-seed.ts files
// exist on disk" regression test, which enumerates src/worker/*.ts at test-collection time and
// fails if a second one appears. This file is a one-time-use fixture/data module (imported by
// test/unit/pilot-seed.test.ts and the real browser pilot-activation test), never bundled into
// the Worker itself.
//
// This is deliberately NOT a Google Drive/Sheets ingestion. No tool available in this environment
// can read that external dashboard, and no URL to it was provided -- and fabricating specific
// "facts" about real, ongoing construction projects under real names would be worse than an
// honestly-generic placeholder. Each of the 6 projects below gets a small, clearly-labeled
// placeholder skeleton, seeded once through the existing, unmodified
// POST /v1/projects/:id/import route (Task 13) -- no new route, no new creation mechanism. A real
// PM replaces the placeholder content for a project the same way: one import call with the real
// schedule/commercial snapshot, whenever that data is available. Howler never re-reads any
// external dashboard on every interaction.
//
// Each project's skeleton deliberately keeps the five categories the pilot spec requires Howler to
// never conflate distinct, using the closest real domain-model concept for each (no fabricated new
// field):
//   FACT        -- the "mobilization" activity: COMPLETE, with a verified actualStart/actualFinish.
//   COMMITMENT/
//   EXPECTED    -- the "committed-phase" activity's constraint: a real readiness window
//                  (optimistic/likely/conservative), i.e. an expected date range, not yet an actual.
//   UNKNOWN     -- the "unresolved-phase" activity's constraint: no readiness window at all,
//                  state PENDING, verification UNVERIFIED -- genuinely unresolved, not guessed.
//   BLOCKER/
//   RISK        -- a WARN-severity, OPEN conflict flagging the placeholder itself as the risk.
//   NEXT ACTION -- carried in that same conflict's description, mirroring how
//                  deboard-seed.ts already encodes next-step guidance inside a constraint/conflict
//                  label rather than a dedicated field (none exists in ProjectModelV094).

import type { ProjectModelV094 } from "../src/domain/types";

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

const PILOT_SEED_ANCHOR_DATE = "2026-09-01";

export function buildPilotSeedProject(
  def: PilotProjectDefinition,
  forecastAnchorDate: string = PILOT_SEED_ANCHOR_DATE,
): ProjectModelV094 {
  const sourceId = `${def.projectId}-src-intake`;
  return {
    projectId: def.projectId,
    revision: 0,
    name: def.displayName,
    projectType: "PILOT",
    timezone: "UTC",
    forecastAnchorDate,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {
      [sourceId]: {
        id: sourceId,
        type: "PM_INTAKE",
        label: `${def.displayName} pilot onboarding intake`,
        observedAt: `${forecastAnchorDate}T00:00:00.000Z`,
        authority: 0.6,
        reliability: 0.6,
      },
    },
    // Deliberately distinct, un-prefixed activity/constraint names -- an earlier version of this
    // fixture prefixed every one of these with `${def.displayName}` (mirroring how "DeBoard" is
    // never actually embedded inside deboard-seed.ts's own activity names, e.g. "CMU foundation
    // walls"). That made every entity share the "committed" -- no, share the project's own display
    // name -- as a token, so ANY utterance mentioning the project (mandatory, since project
    // resolution needs it) matched all 5 entities via resolveClaimEntity's token-overlap matching,
    // turning routine pilot dialogue permanently, pathologically ambiguous. Found via a real
    // browser session against stewart-v1. Distinct real-world-flavored names (matching DeBoard's
    // own pattern) let a natural utterance resolve to exactly one entity.
    activities: {
      mobilization: {
        id: "mobilization",
        name: "Site mobilization and initial walk",
        phase: "Mobilization",
        state: "COMPLETE",
        duration: {
          optimistic: 1,
          likely: 1,
          conservative: 2,
          sourceIds: [sourceId],
        },
        constraintIds: [],
        sourceIds: [sourceId],
        actualStart: forecastAnchorDate,
        actualStartSourceIds: [sourceId],
        actualStartVerification: "PM_CONFIRMED",
        actualFinish: forecastAnchorDate,
        actualFinishSourceIds: [sourceId],
        actualFinishVerification: "PM_CONFIRMED",
      },
      "committed-phase": {
        id: "committed-phase",
        name: "Framing and rough-in package",
        phase: "Execution",
        state: "NOT_STARTED",
        duration: {
          optimistic: 3,
          likely: 5,
          conservative: 8,
          sourceIds: [sourceId],
        },
        constraintIds: ["committed-readiness"],
        sourceIds: [sourceId],
      },
      "unresolved-phase": {
        id: "unresolved-phase",
        name: "Finish trades sequencing",
        phase: "Execution",
        state: "NOT_STARTED",
        duration: {
          optimistic: 3,
          likely: 5,
          conservative: 8,
          sourceIds: [sourceId],
        },
        constraintIds: ["unresolved-readiness"],
        sourceIds: [sourceId],
      },
    },
    constraints: {
      "committed-readiness": {
        id: "committed-readiness",
        activityId: "committed-phase",
        type: "READINESS",
        label: "Framing crew has committed a readiness window",
        state: "EXPECTED",
        hard: false,
        readiness: {
          optimistic: "2026-09-08",
          likely: "2026-09-10",
          conservative: "2026-09-15",
        },
        sourceIds: [sourceId],
        verification: "PM_CONFIRMED",
      },
      "unresolved-readiness": {
        id: "unresolved-readiness",
        activityId: "unresolved-phase",
        type: "READINESS",
        label: "Finish trades readiness has not been confirmed yet",
        state: "PENDING",
        hard: true,
        sourceIds: [sourceId],
        verification: "UNVERIFIED",
      },
    },
    dependencies: {},
    conflicts: {
      "pilot-onboarding-gap": {
        id: "pilot-onboarding-gap",
        category: "DATA_GAP",
        description: `${def.displayName} is running on a placeholder pilot seed, not real project data yet. Next action: replace this via POST /v1/projects/${def.projectId}/import with the real schedule/commercial snapshot.`,
        activityIds: ["unresolved-phase"],
        sourceIds: [sourceId],
        severity: "WARN",
        status: "OPEN",
      },
    },
    eventLedger: [],
  };
}
