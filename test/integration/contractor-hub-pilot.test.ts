/// <reference types="vite/client" />

// v0.9.6 Contractor Hub, Task 7: the pilot acceptance slice. Proves the exact product loop the
// design doc requires end to end, through the real HTTP boundary only (never a helper-only
// shortcut for the steps under test):
//
//   CONSUME -> ANALYZE -> REVIEW -> COMMIT BASELINE -> OPERATE PROJECT -> NATURAL UPDATE ->
//   CONFIRM IF REQUIRED -> RECOMPUTE CANONICAL STATE -> READ UPDATED SUMMARY ->
//   PROVE OTHER PROJECTS UNCHANGED
//
// This is not a route-smoke test -- each assertion below traces back to a specific design/plan
// guarantee (docs/superpowers/specs/2026-09-04-howler-contractor-hub-v096-design.md, "Required
// v0.9.6 pilot slice").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import { D1HowlerRepository } from "../../src/worker/repository";
import { validateProjectModel } from "../../src/domain/validation";
import type { ProjectModelV094 } from "../../src/domain/types";
import type { GenesisProposalV096 } from "../../src/operator/genesis";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

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

const ADMIN_KEY = "test-admin-key-contractor-hub-pilot";
const CONFIRMATION_SIGNING_SECRET =
  "test-confirmation-signing-secret-contractor-hub-pilot-never-sent-to-client";

const SMITH_INTAKE =
  "Create Smith Residence. 2,800sf remodel. Budget is $310k. Scope is kitchen, primary bath, flooring, windows, electrical service upgrade and HVAC modifications. Demo starts September 14. We already selected Wayland for electrical. Cabinets are still being priced.";

const SMITH_ID = "smith-residence";
const REVIEWED_NAME = "Smith Residence - Reviewed";
const CONTROL_ID = "control-project";

// Deterministic 2026 test environment (Task 7 requirement): every server-side new Date() call --
// Genesis's own forecastAnchorDate/year resolution, the conversation route's "today", the solver's
// evidence-supported actualStart -- must observe this exact fixed instant, never the real wall
// clock, so "Demo starts September 14" always resolves to 2026-09-14 and every "today"-derived
// assertion stays correct regardless of which real calendar day the suite happens to run on.
const FIXED_NOW = "2026-09-06T16:00:00.000Z";
const FIXED_TODAY = "2026-09-06";

const APPROVED_CONDITIONS = [
  "Stable",
  "Stable, exposed",
  "At risk",
  "Critical",
];

function adminEnv(): Env {
  return {
    ...env,
    HOWLER_ADMIN_KEY: ADMIN_KEY,
    HOWLER_CONFIRMATION_SIGNING_SECRET: CONFIRMATION_SIGNING_SECRET,
  };
}

function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  authorized = true,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorized) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function jsonBody<T>(response: Response): Promise<T> {
  return await response.json();
}

async function tableCount(table: string): Promise<number> {
  const row = await env.HOWLER_DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table}`,
  ).first<{ n: number }>();
  return row?.n ?? -1;
}

async function tableCounts(): Promise<{
  projects: number;
  project_events: number;
  forecast_snapshots: number;
  oversight_reviews: number;
}> {
  const [projects, project_events, forecast_snapshots, oversight_reviews] =
    await Promise.all([
      tableCount("projects"),
      tableCount("project_events"),
      tableCount("forecast_snapshots"),
      tableCount("oversight_reviews"),
    ]);
  return { projects, project_events, forecast_snapshots, oversight_reviews };
}

interface ProjectSummary {
  projectId: string;
  projectName: string;
  progressPercent: number;
  integrity: { score: number; condition: string; primaryDriver: string };
  budget: {
    baseline: number | null;
    spent: number | null;
    remaining: number | null;
    spentPercent: number | null;
  };
  primaryExposure: string;
  nextMovement: string;
  projectedCompletion: string | null;
  schedule: {
    committed: {
      activityId: string;
      activityName: string;
      startDate: string | null;
      finishDate: string | null;
      basis: string;
    }[];
    forecast: { activityId: string; basis: string }[];
  };
  scope: { id: string; label: string; phase: string }[];
}

async function getSummary(projectId: string): Promise<{
  status: number;
  summary: ProjectSummary;
}> {
  const response = await worker.fetch(
    jsonRequest("GET", `/v1/projects/${projectId}/summary`),
    adminEnv(),
  );
  return { status: response.status, summary: await jsonBody(response) };
}

interface TurnResponse {
  session: {
    activeProjectId: string | null;
    pendingClaims: { userConfirmationState: string }[];
  };
  turn?: {
    kind: string;
    pending?: {
      claim: { claimId: string };
      confirmation: { confirmationId: string; projectId: string } & Record<
        string,
        unknown
      >;
      previewResult: { workflowState: string };
    }[];
    clarifications?: { message: string }[];
  };
  confirm?: { outcome: string; result?: { workflowState: string } };
  timing?: { stage: string; durationMs: number }[];
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await applySchema(env.HOWLER_DB, operatorMigrationSql());
});

// Freeze Date only -- confirmed experimentally that the Cloudflare Workers vitest pool runs this
// test file and the imported worker module (src/worker/index.ts) in the same JS realm, so
// vi.setSystemTime here is genuinely observed by every new Date() call inside worker.fetch()'s
// handler code, not merely inside this test file. Deliberately does NOT fake timers/setTimeout: D1
// is real async I/O and must keep running on real microtask/macrotask scheduling.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Runs the real preview -> PM correction -> commit sequence (Steps 2-4) and returns the committed
 * projectId plus the exact corrected proposal that was sent to /commit. Shared by every test below
 * so the duplicate-confirmation and wrong-project tests don't re-litigate what the main scenario
 * test already proves in detail -- they just need "a real, committed Smith project" to build on.
 */
async function commitSmith(): Promise<{
  projectId: string;
  proposal: GenesisProposalV096;
}> {
  const previewResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/genesis/preview", { text: SMITH_INTAKE }),
    adminEnv(),
  );
  const previewBody = await jsonBody<{ proposal: GenesisProposalV096 }>(
    previewResponse,
  );
  const correctedProposal: GenesisProposalV096 = {
    ...previewBody.proposal,
    projectName: REVIEWED_NAME,
  };
  const commitResponse = await worker.fetch(
    jsonRequest("POST", "/v1/projects/genesis/commit", {
      proposal: correctedProposal,
    }),
    adminEnv(),
  );
  expect(commitResponse.status).toBe(201);
  return {
    projectId: correctedProposal.projectId,
    proposal: correctedProposal,
  };
}

/** A minimal, valid, distinct second project via the existing /:id/import canonical path (Task 13's
 * generalized onboarding route) -- proves the pilot slice's cross-project isolation against a
 * project that never touched Genesis at all, not just a second Genesis project. */
function controlProjectFixture(): {
  project: ProjectModelV094;
  provenance: Record<string, { sourceId: string; section?: string }>;
} {
  return {
    project: {
      projectId: CONTROL_ID,
      revision: 0,
      name: "Control Project",
      projectType: "RESIDENTIAL",
      timezone: "UTC",
      forecastAnchorDate: "2026-09-01",
      calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
      sources: {
        "src-control": {
          id: "src-control",
          type: "FIELD_REPORT",
          label: "Control project fixture",
          observedAt: "2026-08-31T00:00:00.000Z",
          authority: 0.9,
          reliability: 0.9,
        },
      },
      activities: {
        trim: {
          id: "trim",
          name: "Trim install",
          phase: "Finishes",
          state: "NOT_STARTED",
          duration: {
            optimistic: 2,
            likely: 4,
            conservative: 7,
            sourceIds: ["src-control"],
          },
          constraintIds: [],
          sourceIds: ["src-control"],
        },
      },
      constraints: {},
      dependencies: {},
      eventLedger: [],
    } as unknown as ProjectModelV094,
    provenance: {
      trim: { sourceId: "src-control", section: "Control fixture" },
    },
  };
}

async function commitControl(): Promise<void> {
  const fixture = controlProjectFixture();
  const response = await worker.fetch(
    jsonRequest("POST", `/v1/projects/${CONTROL_ID}/import`, fixture),
    adminEnv(),
  );
  expect(response.status).toBe(201);
}

describe("Task 7: the complete v0.9.6 Contractor Hub pilot slice, end to end", () => {
  it("CONSUME -> ANALYZE -> REVIEW -> COMMIT -> OPERATE -> NATURAL UPDATE -> CONFIRM -> RECOMPUTE -> READ, with a control project proven untouched", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);

    // ---------------------------------------------------------------------------------------
    // STEP 1: clean database. beforeEach already dropped/reapplied schema; take the zero-row
    // baseline this scenario builds from.
    // ---------------------------------------------------------------------------------------
    const zeroCounts = await tableCounts();
    expect(zeroCounts).toEqual({
      projects: 0,
      project_events: 0,
      forecast_snapshots: 0,
      oversight_reviews: 0,
    });

    // ---------------------------------------------------------------------------------------
    // STEP 2: Genesis preview (CONSUME -> ANALYZE). Real HTTP POST, real admin auth semantics.
    // ---------------------------------------------------------------------------------------
    const previewResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/preview", {
        text: SMITH_INTAKE,
      }),
      adminEnv(),
    );
    expect(previewResponse.status).toBe(200);
    const previewBody = await jsonBody<{
      schemaVersion: string;
      preview: boolean;
      proposal: GenesisProposalV096;
    }>(previewResponse);
    expect(previewBody.schemaVersion).toBe("0.9.6");
    expect(previewBody.preview).toBe(true);
    const proposal = previewBody.proposal;

    expect(proposal.projectName).toBe("Smith Residence");
    // Deterministic id: resolveProjectId slugifies the name when no preferredProjectId is sent.
    expect(proposal.projectId).toBe(SMITH_ID);
    expect(proposal.projectType).toBe("RESIDENTIAL_REMODEL");
    expect(proposal.budget?.baseline).toBe(310000);
    expect(proposal.baselineScope.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Demolition",
        "Kitchen",
        "Primary bath",
        "Flooring",
        "Windows",
        "Electrical service upgrade",
        "HVAC modifications",
      ]),
    );
    expect(proposal.baselineScope).toHaveLength(7);

    const demolitionDate = proposal.knownDates.find(
      (d) => d.subjectId === "demolition",
    );
    expect(demolitionDate?.kind).toBe("COMMITTED_START");
    expect(demolitionDate?.date).toBe("2026-09-14");

    // Vendor selection is represented only as an unverified assumption -- never fabricated
    // canonical vendor/trade state (there is no vendor/trade field anywhere in the proposal).
    expect(
      proposal.assumptions.some(
        (a) => /Wayland/i.test(a) && /unverified/i.test(a),
      ),
    ).toBe(true);
    // Cabinetry pricing remains unresolved, as designed -- surfaced as an assumption, never a
    // baseline scope item or a budget line item invented from an unpriced allowance.
    expect(
      proposal.assumptions.some(
        (a) => /cabinet/i.test(a) && /unresolved/i.test(a),
      ),
    ).toBe(true);
    expect(proposal.baselineScope.some((s) => /cabinet/i.test(s.label))).toBe(
      false,
    );
    // Duration validation remains an explicit missingCritical item.
    expect(proposal.missingCritical).toContain(
      "Activity durations need PM validation",
    );

    // Preview is pure analysis: zero canonical rows of any kind.
    expect(await tableCounts()).toEqual(zeroCounts);

    // ---------------------------------------------------------------------------------------
    // STEP 3: simulate PM review/correction. One legitimate, visible correction -- the project
    // name -- made on the actual returned proposal, then re-submitted through the same contract.
    // ---------------------------------------------------------------------------------------
    const correctedProposal: GenesisProposalV096 = {
      ...proposal,
      projectName: REVIEWED_NAME,
    };
    // Explicit design assertion: a name correction never changes canonical project identity.
    expect(correctedProposal.projectId).toBe(proposal.projectId);

    // ---------------------------------------------------------------------------------------
    // STEP 4: Genesis commit (COMMIT BASELINE).
    // ---------------------------------------------------------------------------------------
    const commitResponse = await worker.fetch(
      jsonRequest("POST", "/v1/projects/genesis/commit", {
        proposal: correctedProposal,
      }),
      adminEnv(),
    );
    expect(commitResponse.status).toBe(201);
    const commitBody = await jsonBody<{
      schemaVersion: string;
      projectId: string;
      revision: number;
      forecastVersion: number;
      publishable: boolean;
      stagingOnly: boolean;
    }>(commitResponse);
    expect(commitBody.schemaVersion).toBe("0.9.6");
    expect(commitBody.projectId).toBe(SMITH_ID);
    expect(commitBody.revision).toBe(0);
    expect(typeof commitBody.forecastVersion).toBe("number");
    expect(commitBody.publishable).toBe(false);
    expect(commitBody.stagingOnly).toBe(true);

    const afterCommitCounts = await tableCounts();
    expect(afterCommitCounts.projects).toBe(1);
    expect(afterCommitCounts.forecast_snapshots).toBe(1);
    expect(afterCommitCounts.oversight_reviews).toBe(1);
    // Genesis is initial state, not a fake creation event.
    expect(afterCommitCounts.project_events).toBe(0);

    const smithModelAfterCommit = await repo.loadProject(SMITH_ID);
    expect(smithModelAfterCommit).toBeDefined();
    if (!smithModelAfterCommit) throw new Error("unreachable");
    expect(() => {
      validateProjectModel(smithModelAfterCommit);
    }).not.toThrow();
    expect(smithModelAfterCommit.revision).toBe(0);
    expect(smithModelAfterCommit.eventLedger).toHaveLength(0);
    expect(smithModelAfterCommit.name).toBe(REVIEWED_NAME);
    expect(smithModelAfterCommit.projectProfile?.baselineScope).toHaveLength(7);
    expect(smithModelAfterCommit.projectProfile?.budget?.baseline).toBe(310000);
    expect(
      smithModelAfterCommit.activities.demolition?.scheduleLock?.startDate,
    ).toBe("2026-09-14");
    // FORECAST_START semantics were never even sent for Smith -- every other activity has no
    // scheduleLock at all, proving nothing but the one explicit COMMITTED_START was promoted.
    for (const [id, activity] of Object.entries(
      smithModelAfterCommit.activities,
    )) {
      if (id === "demolition") continue;
      expect(activity.scheduleLock).toBeUndefined();
    }

    const initialForecast = await repo.loadLatestForecast(SMITH_ID);
    expect(initialForecast).toBeDefined();
    expect(initialForecast?.modelRevision).toBe(0);

    // ---------------------------------------------------------------------------------------
    // STEP 5: initial summary (OPERATE PROJECT begins).
    // ---------------------------------------------------------------------------------------
    const { status: initialSummaryStatus, summary: initialSummary } =
      await getSummary(SMITH_ID);
    expect(initialSummaryStatus).toBe(200);
    expect(initialSummary.projectId).toBe(SMITH_ID);
    expect(initialSummary.projectName).toBe(REVIEWED_NAME);
    // Every activity NOT_STARTED -- truthfully 0, never fabricated.
    expect(initialSummary.progressPercent).toBe(0);
    expect(typeof initialSummary.integrity.score).toBe("number");
    expect(APPROVED_CONDITIONS).toContain(initialSummary.integrity.condition);
    expect(initialSummary.budget.baseline).toBe(310000);
    // Spend was never stated in the intake -- remains an honest unknown, never fabricated zero.
    expect(initialSummary.budget.spent).toBeNull();
    expect(initialSummary.budget.remaining).toBeNull();
    expect(initialSummary.scope.map((s) => s.label)).toEqual(
      expect.arrayContaining([
        "Demolition",
        "Kitchen",
        "Primary bath",
        "Flooring",
        "Windows",
        "Electrical service upgrade",
        "HVAC modifications",
      ]),
    );
    const initialCommittedDemo = initialSummary.schedule.committed.find(
      (item) => item.activityId === "demolition",
    );
    expect(initialCommittedDemo).toBeDefined();
    expect(initialCommittedDemo?.startDate).toBe("2026-09-14");
    expect(initialCommittedDemo?.basis).toBe("COMMITTED");
    expect(
      initialSummary.schedule.forecast.some(
        (item) => item.activityId === "demolition",
      ),
    ).toBe(false);
    expect(initialSummary.projectedCompletion).not.toBeNull();
    expect(typeof initialSummary.nextMovement).toBe("string");
    expect(initialSummary.nextMovement.length).toBeGreaterThan(0);
    expect(typeof initialSummary.primaryExposure).toBe("string");
    expect(initialSummary.primaryExposure.length).toBeGreaterThan(0);

    // ---------------------------------------------------------------------------------------
    // STEP 6: control project, created via the existing generalized /:id/import path -- not
    // Genesis -- so the pilot slice proves isolation against a project that never touched Genesis
    // at all, not merely a second Genesis project.
    // ---------------------------------------------------------------------------------------
    await commitControl();
    const controlModelBefore = await repo.loadProject(CONTROL_ID);
    const controlForecastBefore = await repo.loadLatestForecast(CONTROL_ID);
    const { summary: controlSummaryBefore } = await getSummary(CONTROL_ID);
    const controlEventsBefore = await repo.loadEvents(CONTROL_ID);
    expect(controlModelBefore?.revision).toBe(0);

    // ---------------------------------------------------------------------------------------
    // STEP 7: natural project update through the real conversation/turn route only -- no manual
    // event compilation, no direct /v1/intents call, no direct evidence apply, no DB patch.
    // ---------------------------------------------------------------------------------------
    const turnResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${SMITH_ID}/conversation/turn`, {
        text: "Demolition started today",
        session: null,
      }),
      adminEnv(),
    );
    expect(turnResponse.status).toBe(200);
    const turnBody = await jsonBody<TurnResponse>(turnResponse);

    // ---------------------------------------------------------------------------------------
    // STEP 8: follow the real confirmation contract exactly -- extract the genuine, server-signed
    // pending confirmation and send it back unmodified.
    // ---------------------------------------------------------------------------------------
    expect(turnBody.turn?.kind).toBe("AWAITING_CONFIRMATION");
    const pending = turnBody.turn?.pending?.[0];
    expect(pending).toBeDefined();
    expect(pending?.previewResult.workflowState).toBe("SUCCEEDED");
    const confirmation = pending?.confirmation;
    expect(confirmation?.confirmationId).toBeTruthy();
    expect(confirmation?.projectId).toBe(SMITH_ID);

    // Preview must never auto-Apply.
    const smithModelBeforeApply = await repo.loadProject(SMITH_ID);
    expect(
      smithModelBeforeApply?.activities.demolition?.actualStart,
    ).toBeUndefined();

    const confirmResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${SMITH_ID}/conversation/turn`, {
        session: turnBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    expect(confirmResponse.status).toBe(200);
    const confirmBody = await jsonBody<TurnResponse>(confirmResponse);
    expect(confirmBody.confirm?.outcome).toBe("APPLIED");
    expect(confirmBody.confirm?.result?.workflowState).toBe("SUCCEEDED");

    // ---------------------------------------------------------------------------------------
    // STEP 9: verify Smith's canonical mutation.
    // ---------------------------------------------------------------------------------------
    const smithModelAfterApply = await repo.loadProject(SMITH_ID);
    expect(smithModelAfterApply).toBeDefined();
    if (!smithModelAfterApply) throw new Error("unreachable");
    expect(() => {
      validateProjectModel(smithModelAfterApply);
    }).not.toThrow();
    expect(smithModelAfterApply.revision).toBe(1);
    expect(smithModelAfterApply.activities.demolition?.state).toBe(
      "IN_PROGRESS",
    );
    expect(smithModelAfterApply.activities.demolition?.actualStart).toBe(
      FIXED_TODAY,
    );
    expect(smithModelAfterApply.eventLedger).toHaveLength(1);
    const smithEventsAfterApply = await repo.loadEvents(SMITH_ID);
    expect(smithEventsAfterApply).toHaveLength(1);
    // Provenance/source linkage remains valid: the applied activity still traces back to a real,
    // named source (the original Genesis source, at minimum), never an empty/dangling list.
    expect(
      (smithModelAfterApply.activities.demolition?.sourceIds ?? []).length,
    ).toBeGreaterThan(0);
    for (const sourceId of smithModelAfterApply.activities.demolition
      ?.sourceIds ?? []) {
      expect(smithModelAfterApply.sources[sourceId]).toBeDefined();
    }

    // ---------------------------------------------------------------------------------------
    // STEP 10: verify the updated forecast.
    // ---------------------------------------------------------------------------------------
    const forecastAfterApply = await repo.loadLatestForecast(SMITH_ID);
    expect(forecastAfterApply).toBeDefined();
    expect(forecastAfterApply?.modelRevision).toBe(1);
    expect(forecastAfterApply?.version).toBeGreaterThan(
      initialForecast?.version ?? 0,
    );
    // The engine forecasts every activity's timing regardless of scheduleLock (needed to compute
    // overall project completion) -- the committed/forecast truth boundary the design cares about
    // is enforced at the summary/presentation layer (verified in Step 11 below), not by omitting
    // locked activities from this raw internal record. What genuinely proves this forecast was
    // recomputed from the accepted update is each activity's own basis label advancing correctly:
    // before Apply, demolition was COMMITMENT_SUPPORTED (a schedule lock, not yet evidenced); after
    // Apply, it is EVIDENCE_SUPPORTED (a real, accepted fact) -- never silently downgraded back to
    // a plain FORECAST basis.
    expect(initialForecast?.activityForecasts.demolition?.dateBasis).toBe(
      "COMMITMENT_SUPPORTED",
    );
    expect(forecastAfterApply?.activityForecasts.demolition?.dateBasis).toBe(
      "EVIDENCE_SUPPORTED",
    );

    // ---------------------------------------------------------------------------------------
    // STEP 11: verify the updated summary differs meaningfully from the saved initial summary.
    // ---------------------------------------------------------------------------------------
    const { status: updatedSummaryStatus, summary: updatedSummary } =
      await getSummary(SMITH_ID);
    expect(updatedSummaryStatus).toBe(200);
    expect(updatedSummary.projectId).toBe(SMITH_ID);
    expect(updatedSummary.projectName).toBe(REVIEWED_NAME);
    // Deterministic from canonical activities: 7 baseline activities, each defaulting to a
    // 4-day "likely" duration (Genesis's own PILOT_BASELINE_DURATION_DAYS) -> 28 total weight.
    // Demolition alone is now IN_PROGRESS (0.5x weight = 2) -> round(2 / 28 * 100) = 7.
    expect(updatedSummary.progressPercent).toBe(7);
    expect(updatedSummary.progressPercent).toBeGreaterThan(
      initialSummary.progressPercent,
    );
    // nextMovement is genuinely recomputed on every read (GET summary never caches). Task 8 pilot
    // smoke correction: this used to assert nextMovement stayed pinned to "Kitchen forecast to
    // start <anchor date>" both before and after the update, reasoning that Kitchen's phase
    // ("General") was never recognized by Genesis's PHASE_ORDER so it could never be affected by
    // anything Demolition-related. That was itself a symptom of the bug the correction fixes --
    // Kitchen was genuinely unsequenced, forecast from the project's own anchor date with no
    // regard for Demolition at all. With the guarded Demolition -> unrecognized-phase inference in
    // place, Demolition -- not Kitchen -- is correctly the earliest-dated incomplete activity both
    // before and after the update, so nextMovement now legitimately tracks Demolition's own state:
    // before the update it reflects Demolition's committed start; after, Demolition's real
    // actualStart (recorded by the update itself) makes it the new earliest date, so the two
    // values are no longer expected to match -- unlike Kitchen's old, disconnected date, this one
    // is correctly the same activity's own state genuinely advancing.
    expect(initialSummary.nextMovement).toBe(
      "Demolition forecast to start 2026-09-14.",
    );
    expect(updatedSummary.nextMovement).toBe(
      `Demolition forecast to start ${FIXED_TODAY}.`,
    );
    expect(updatedSummary.projectedCompletion).not.toBeNull();
    expect(typeof updatedSummary.integrity.score).toBe("number");
    expect(APPROVED_CONDITIONS).toContain(updatedSummary.integrity.condition);
    // Approved baseline unaffected by an ordinary field update.
    expect(updatedSummary.budget.baseline).toBe(310000);
    expect(updatedSummary.scope).toEqual(initialSummary.scope);
    const updatedCommittedDemo = updatedSummary.schedule.committed.find(
      (item) => item.activityId === "demolition",
    );
    expect(updatedCommittedDemo?.basis).toBe("COMMITTED");
    expect(
      updatedSummary.schedule.forecast.some(
        (item) => item.activityId === "demolition",
      ),
    ).toBe(false);

    // ---------------------------------------------------------------------------------------
    // STEP 12: wrong-project proof -- the control project is byte-for-byte unchanged.
    // ---------------------------------------------------------------------------------------
    const controlModelAfter = await repo.loadProject(CONTROL_ID);
    expect(controlModelAfter).toEqual(controlModelBefore);
    const controlForecastAfter = await repo.loadLatestForecast(CONTROL_ID);
    expect(controlForecastAfter).toEqual(controlForecastBefore);
    const { summary: controlSummaryAfter } = await getSummary(CONTROL_ID);
    expect(controlSummaryAfter).toEqual(controlSummaryBefore);
    const controlEventsAfter = await repo.loadEvents(CONTROL_ID);
    expect(controlEventsAfter).toEqual(controlEventsBefore);
    expect(controlEventsAfter).toHaveLength(0);

    // ---------------------------------------------------------------------------------------
    // STEP 13: no external side effects. This slice runs entirely against internal
    // canonical/staging machinery -- reuse the existing /health route's own live-system flags
    // rather than inventing a new check.
    // ---------------------------------------------------------------------------------------
    const healthResponse = await worker.fetch(
      new Request("https://example.test/health"),
      adminEnv(),
    );
    const health = await jsonBody<{
      mode: string;
      liveSystemsConnected: boolean;
      dashboardConnected: boolean;
      calendarConnected: boolean;
    }>(healthResponse);
    expect(health.mode).toBe("shadow");
    expect(health.liveSystemsConnected).toBe(false);
    expect(health.dashboardConnected).toBe(false);
    expect(health.calendarConnected).toBe(false);
  });
});

describe("Task 7: duplicate confirmation safety on the full natural-language pilot path", () => {
  it("a second identical affirmative confirmation does not apply again", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const { projectId } = await commitSmith();

    const turnResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${projectId}/conversation/turn`, {
        text: "Demolition started today",
        session: null,
      }),
      adminEnv(),
    );
    const turnBody = await jsonBody<TurnResponse>(turnResponse);
    const confirmation = turnBody.turn?.pending?.[0]?.confirmation;
    expect(confirmation).toBeDefined();

    const firstConfirm = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${projectId}/conversation/turn`, {
        session: turnBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    const firstConfirmBody = await jsonBody<TurnResponse>(firstConfirm);
    expect(firstConfirmBody.confirm?.outcome).toBe("APPLIED");

    const revisionAfterFirst = (await repo.loadProject(projectId))?.revision;
    expect(revisionAfterFirst).toBe(1);
    const eventsAfterFirst = await repo.loadEvents(projectId);
    expect(eventsAfterFirst).toHaveLength(1);

    // Replay: the exact same original confirmation, sent again (a client resend/retry) -- under
    // this suite's frozen clock, the two requests are now genuinely byte-identical (including
    // submittedAt), so repo.claimIntent's own conflict resolution (src/worker/repository.ts's
    // resolveClaimConflict) correctly classifies this as REPLAY (an exact retry of a request whose
    // canonical hash already matches), not IDEMPOTENCY_KEY_REUSE (a same-identity request whose
    // content differs). REPLAY truthfully returns the original cached SUCCEEDED result rather than
    // re-executing -- this is the accepted, existing, documented safe-duplicate contract this
    // mechanism was built for, not a new or weakened one. The real safety invariant asserted below
    // is that the canonical Apply itself never repeats: revision and event count must not advance
    // a second time, regardless of which of the two safe outcomes (REPLAY or REUSE) a given retry
    // happens to hit.
    const secondConfirm = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${projectId}/conversation/turn`, {
        session: turnBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    expect(secondConfirm.status).toBe(200);
    const secondConfirmBody = await jsonBody<TurnResponse>(secondConfirm);
    expect(secondConfirmBody.confirm?.outcome).toBe("APPLIED");
    expect(secondConfirmBody.confirm?.result?.workflowState).toBe("SUCCEEDED");

    const revisionAfterSecond = (await repo.loadProject(projectId))?.revision;
    expect(revisionAfterSecond).toBe(1);
    const eventsAfterSecond = await repo.loadEvents(projectId);
    expect(eventsAfterSecond).toHaveLength(1);
    expect(eventsAfterSecond).toEqual(eventsAfterFirst);
  });
});

describe("Task 7: wrong-project attack on the natural-language conversation route", () => {
  it("a genuinely-issued Smith confirmation is refused against the Control project's conversation route, and neither project is mutated", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const { projectId: smithId } = await commitSmith();
    await commitControl();

    const turnResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${smithId}/conversation/turn`, {
        text: "Demolition started today",
        session: null,
      }),
      adminEnv(),
    );
    const turnBody = await jsonBody<TurnResponse>(turnResponse);
    const confirmation = turnBody.turn?.pending?.[0]?.confirmation;
    expect(confirmation).toBeDefined();
    expect(confirmation?.projectId).toBe(smithId);

    const controlModelBefore = await repo.loadProject(CONTROL_ID);
    const smithModelBefore = await repo.loadProject(smithId);

    // The real client-sendable attack: a genuine, untampered, server-signed confirmation --
    // legitimately issued for Smith -- submitted against Control's own conversation/turn URL.
    // Session is omitted (a stateless client can always retry with only the confirmation object),
    // which isolates this from the already-covered session/URL project-mismatch check and proves
    // the confirmation binding itself is project-scoped independent of session state.
    const attackResponse = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${CONTROL_ID}/conversation/turn`, {
        session: null,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    expect(attackResponse.status).toBe(400);

    const controlModelAfter = await repo.loadProject(CONTROL_ID);
    expect(controlModelAfter).toEqual(controlModelBefore);
    const controlEvents = await repo.loadEvents(CONTROL_ID);
    expect(controlEvents).toHaveLength(0);

    // Smith itself was not accidentally mutated through the Control route either -- the claim
    // remains exactly as unapplied as before the attack.
    const smithModelAfter = await repo.loadProject(smithId);
    expect(smithModelAfter).toEqual(smithModelBefore);
    expect(smithModelAfter?.activities.demolition?.actualStart).toBeUndefined();

    // The real, correctly-scoped confirmation still works afterward -- the attack did not corrupt
    // or consume it.
    const legitimateConfirm = await worker.fetch(
      jsonRequest("POST", `/v1/projects/${smithId}/conversation/turn`, {
        session: turnBody.session,
        confirm: { confirmation, affirmative: true },
      }),
      adminEnv(),
    );
    const legitimateBody = await jsonBody<TurnResponse>(legitimateConfirm);
    expect(legitimateBody.confirm?.outcome).toBe("APPLIED");
  });
});
