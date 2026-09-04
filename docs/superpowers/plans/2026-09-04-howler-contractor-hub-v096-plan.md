# Howler v0.9.6 Contractor Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one end-to-end contractor-hub slice: create a new project from messy text, review/approve Howler's synthesized baseline, open a clean Index Card backed by canonical project state, update the project naturally, and see the Penthouse reflect the changed project position.

**Architecture:** Preserve the existing `ProjectModelV094` / D1 / event / forecast / conversation kernel and rebuild the product boundary around it. Add a small Project Genesis service that converts user-friendly intake into a validated canonical project, a deterministic derived project-summary layer for Penthouse/Index Card display, and a sharper dashboard/Index Card UI in `src/worker/admin.ts`. The pilot keeps routine updates on the existing fast deterministic conversation path; Genesis is the only new synthesis path and is isolated behind an adapter so a real model can replace the pilot parser later without changing canonical persistence.

**Tech Stack:** TypeScript 6, Cloudflare Workers + D1, Vitest 4 with `@cloudflare/vitest-plugin`, existing forecast/recovery engine, existing operator/conversation stack, server-rendered HTML/CSS/vanilla browser JS in `src/worker/admin.ts`.

**Spec:** `docs/superpowers/specs/2026-09-04-howler-contractor-hub-v096-design.md`

## Global Constraints

- Keep `claude/v096-contractor-hub` based on the accepted `a744be5dc7478486e1b917a57c1ad133c03b3c06` product-integration base plus the approved design/plan commits.
- Do not rewrite the existing deterministic event, revision, Apply, forecast, recovery, or confirmation machinery merely for architectural neatness.
- Penthouse is the map: concise project decision intelligence only. Detailed schedule/forecast belongs inside the Index Card.
- Index Card is the project: project identity, baseline scope, budget awareness, schedule/forecast, exposures, next movement, activity/update surface.
- Progress and Project Integrity are separate values.
- Committed dates and forecast dates remain visibly distinct.
- No external party is contacted, rescheduled, or committed by this slice.
- Routine project updates use the existing fast path; no new expensive reasoning step is added to ordinary update execution.
- There is no live model binding in the repository today. v0.9.6 therefore uses a conservative pilot Genesis synthesizer behind an injected interface; swapping in a real model later must not change the canonical project-creation contract.
- Never require hand-authored JSON in the user-facing Project Genesis flow.
- Preserve source/evidence for intake facts; no silent overwrite and no wrong-project mutation.
- The UI must stay sharp and legible: compact typography, restrained graphics, strong spacing, no oversized headings, no duplicated portfolio data, no compounded project text.
- Correct completion claim after implementation: **"Cleared the safety gate and ready for controlled field testing."** Do not call it field-ready before pilot evidence.
- Node version remains `24.20.0`; do not add dependencies unless a task proves they are necessary.
- Final verification is `npm run verify` plus staging-route smoke verification before pilot activation.

## Agent Allocation for This Build Session

Use both Claude and Codex, but never let them concurrently edit the same working tree or files.

- **Claude — implementation lane:** execute the plan sequentially, TDD-first, one task/commit at a time on `claude/v096-contractor-hub`.
- **Codex — independent breaker/reviewer lane:** after each Claude task commit, review that exact SHA/diff, run focused tests or reason adversarially about the changed surface, and return findings only. Codex does not edit the implementation branch while Claude is working.
- **Claude — remediation lane:** apply only accepted review findings, rerun the task tests, and create a fix commit if needed.
- **Integration gate:** no task advances on unresolved P0/P1 findings. Full regression and staging verification happen once at the end rather than after every tiny CSS edit.

This gives us two agents without merge collisions and preserves one authoritative implementation history.

---

## File Structure

### New files

- `src/operator/genesis.ts` — Genesis contracts, validation, normalization, and canonical `ProjectModelV094` builder. Pure; no D1/network.
- `src/worker/genesis-field-model.ts` — conservative pilot text synthesizer implementing the Genesis adapter. No persistence.
- `src/operator/project-summary.ts` — deterministic Progress, Project Integrity, budget position, primary exposure, next movement, and committed-vs-forecast derived view.
- `test/unit/genesis.test.ts` — pure Genesis contract/builder tests.
- `test/unit/genesis-field-model.test.ts` — realistic messy-text synthesis tests.
- `test/unit/project-summary.test.ts` — derived-summary tests.
- `test/integration/genesis-http.test.ts` — preview/commit persistence, isolation, duplicate and malformed request tests.
- `test/integration/contractor-hub-pilot.test.ts` — one full Project Genesis -> Index Card data -> natural update -> summary refresh scenario.

### Existing files modified

- `src/domain/types.ts` — add one optional backward-compatible `projectProfile` block to canonical project state; no existing field changes.
- `src/domain/validation.ts` — validate `projectProfile` when present.
- `src/worker/index.ts` — add Genesis preview/commit routes and a read-only project-summary route; reuse `forecastInitial`, `D1HowlerRepository.createProject`, and current conversation route.
- `src/worker/admin.ts` — sharpen Penthouse, add Project Genesis UI, add selected Index Card UI, remove portfolio-level detailed forecast/movement clutter, keep diagnostics behind the existing drawer.
- `test/unit/field-dashboard.test.ts` — dashboard/Index Card browser-behavior tests.
- `test/unit/admin-ui.test.ts` — static HTML/CSP/copy assertions as needed.
- `test/integration/project-import.test.ts` — only if refactoring shared create-project persistence requires proving existing import behavior stays unchanged.
- `test/safety/release-gate.test.ts` — only if route inventory/release-gate fixtures explicitly enumerate new public staging routes.

---

### Task 1: Add the canonical v0.9.6 project profile and Genesis contracts

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/validation.ts`
- Create: `src/operator/genesis.ts`
- Test: `test/unit/genesis.test.ts`

**Interfaces:**
- Consumes: existing `ProjectModelV094`, `ActivityV094`, `DependencyV094`, `SourceV094`, `CommercialSignalV094`.
- Produces:
  - `ProjectProfileV096`
  - `GenesisProposalV096`
  - `GenesisScopeItemV096`
  - `GenesisKnownDateV096`
  - `validateGenesisProposal(proposal): string[]`
  - `buildProjectFromGenesis(proposal, approvedAt): ProjectModelV094`

- [ ] **Step 1: Write failing tests for the optional canonical profile and Genesis builder**

Create `test/unit/genesis.test.ts` with tests equivalent to:

```ts
import { describe, expect, it } from "vitest";
import {
  buildProjectFromGenesis,
  validateGenesisProposal,
  type GenesisProposalV096,
} from "../../src/operator/genesis";
import { validateProjectModel } from "../../src/domain/validation";

function proposal(): GenesisProposalV096 {
  return {
    schemaVersion: "0.9.6",
    proposalId: "genesis-smith-1",
    projectId: "smith-residence",
    projectName: "Smith Residence",
    projectType: "RESIDENTIAL_REMODEL",
    timezone: "America/New_York",
    forecastAnchorDate: "2026-09-14",
    sourceText: "Smith Residence remodel. Budget $310,000. Kitchen, primary bath, flooring and windows. Demo starts September 14.",
    baselineScope: [
      { id: "demo", label: "Demolition", phase: "Demolition" },
      { id: "kitchen", label: "Kitchen", phase: "Interior" },
      { id: "primary-bath", label: "Primary bath", phase: "Interior" },
      { id: "flooring", label: "Flooring", phase: "Finishes" },
      { id: "windows", label: "Windows", phase: "Envelope" },
    ],
    knownDates: [
      { subjectId: "demo", kind: "COMMITTED_START", date: "2026-09-14", label: "Demo start" },
    ],
    budget: { baseline: 310000, currency: "USD" },
    assumptions: ["Unspecified activity durations use pilot baseline estimates and require PM review."],
    risks: [],
    missingCritical: [],
  };
}

describe("Project Genesis canonical builder", () => {
  it("builds a valid canonical project without hand-authored ProjectModel JSON", () => {
    const model = buildProjectFromGenesis(proposal(), "2026-09-04T20:00:00.000Z");
    expect(() => validateProjectModel(model)).not.toThrow();
    expect(model.projectProfile?.baselineScope.map((x) => x.label)).toContain("Kitchen");
    expect(model.projectProfile?.budget?.baseline).toBe(310000);
    expect(model.activities.demo?.scheduleLock?.startDate).toBe("2026-09-14");
  });

  it("keeps baseline scope in the canonical profile and activities instead of replacing it with free-form notes", () => {
    const model = buildProjectFromGenesis(proposal(), "2026-09-04T20:00:00.000Z");
    expect(model.projectProfile?.baselineScope).toHaveLength(5);
    expect(Object.keys(model.activities)).toEqual(expect.arrayContaining(["demo", "kitchen", "primary-bath", "flooring", "windows"]));
  });

  it("returns validation errors instead of building when project identity or scope is missing", () => {
    const broken = { ...proposal(), projectName: "", baselineScope: [] };
    expect(validateGenesisProposal(broken)).toEqual(expect.arrayContaining([
      "projectName is required",
      "baselineScope must contain at least one work item",
    ]));
  });
});
```

- [ ] **Step 2: Run the new unit test and verify RED**

Run:

```bash
npm run test:unit -- test/unit/genesis.test.ts
```

Expected: FAIL because `src/operator/genesis.ts` and the v0.9.6 profile types do not exist.

- [ ] **Step 3: Add the optional canonical profile types**

Add to `src/domain/types.ts` without changing any existing required field:

```ts
export interface ProjectProfileScopeItemV096 {
  id: string;
  label: string;
  phase: string;
}

export interface ProjectBudgetV096 {
  baseline?: number;
  spent?: number;
  currency: string;
}

export interface ProjectProfileV096 {
  clientName?: string;
  address?: string;
  baselineScope: ProjectProfileScopeItemV096[];
  budget?: ProjectBudgetV096;
  genesisSourceId?: string;
  genesisApprovedAt?: ISODateTime;
}
```

and add only this optional field to `ProjectModelV094`:

```ts
projectProfile?: ProjectProfileV096;
```

Extend `validateProjectModel` so, when `projectProfile` exists, it rejects negative/non-finite money values, empty scope IDs/labels, duplicate scope IDs, and malformed `genesisApprovedAt`; projects without `projectProfile` remain byte-for-behavior compatible.

- [ ] **Step 4: Implement `src/operator/genesis.ts`**

Use these exact public contracts:

```ts
export interface GenesisScopeItemV096 {
  id: string;
  label: string;
  phase: string;
  optimisticDays?: number;
  likelyDays?: number;
  conservativeDays?: number;
}

export interface GenesisKnownDateV096 {
  subjectId: string;
  kind: "COMMITTED_START" | "COMMITTED_FINISH" | "FORECAST_START";
  date: string;
  label: string;
}

export interface GenesisProposalV096 {
  schemaVersion: "0.9.6";
  proposalId: string;
  projectId: string;
  projectName: string;
  clientName?: string;
  address?: string;
  projectType: string;
  timezone: string;
  forecastAnchorDate: string;
  sourceText: string;
  baselineScope: GenesisScopeItemV096[];
  knownDates: GenesisKnownDateV096[];
  budget?: { baseline?: number; spent?: number; currency: string };
  assumptions: string[];
  risks: string[];
  missingCritical: string[];
}
```

`buildProjectFromGenesis()` must:

1. Validate proposal first and throw one joined `Error` if invalid.
2. Create one PM-confirmed source:

```ts
const sourceId = `src-genesis-${proposal.proposalId}`;
```

with `type: "PM_CONFIRMED_GENESIS"`, `observedAt: approvedAt`, `authority: 1`, `reliability: 1`.
3. Create one activity per `baselineScope` item.
4. Use explicit duration values when supplied; otherwise use a deliberately visible pilot baseline `optimistic: 2, likely: 4, conservative: 7` and add the source ID. The proposal UI must already expose that assumption before approval.
5. Apply `COMMITTED_START`/`COMMITTED_FINISH` as `scheduleLock` values with the Genesis source; never turn forecast-only dates into commitments.
6. Create only conservative recognized dependencies from a fixed phase-order list:

```ts
const PHASE_ORDER = [
  "Demolition",
  "Foundation",
  "Framing",
  "MEP Rough-In",
  "Inspection",
  "Insulation",
  "Drywall",
  "Paint",
  "Finishes",
  "MEP Finals",
  "Punch",
  "Closeout",
];
```

Only connect adjacent recognized phases that both exist. Do not invent dependency relationships among unrecognized items.
7. Copy the approved baseline scope and budget into `projectProfile`.
8. Set `revision: 0` and `eventLedger: []`; Genesis is initial state, not a fake post-creation event.

- [ ] **Step 5: Run unit tests and typecheck**

Run:

```bash
npm run test:unit -- test/unit/genesis.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/domain/types.ts src/domain/validation.ts src/operator/genesis.ts test/unit/genesis.test.ts
git commit -m "feat: add canonical project genesis contract"
```

**Codex review gate:** review the Task 1 commit for accidental required-field changes, unbounded inference, invalid schedule locks, and any route/persistence changes that should not exist yet.

---

### Task 2: Build the conservative pilot Genesis synthesizer

**Files:**
- Create: `src/worker/genesis-field-model.ts`
- Test: `test/unit/genesis-field-model.test.ts`

**Interfaces:**
- Consumes: raw user intake text + `now` + optional proposed `projectId`.
- Produces: `synthesizeGenesisField(text, now, preferredProjectId?): GenesisProposalV096`.
- Later replacement seam: callers use a `GenesisSynthesizer` function type, not this concrete implementation.

- [ ] **Step 1: Write failing realistic-intake tests**

Cover this exact pilot sentence:

```text
Create Smith Residence. 2,800sf remodel. Budget is $310k. Scope is kitchen, primary bath, flooring, windows, electrical service upgrade and HVAC modifications. Demo starts September 14. We already selected Wayland for electrical. Cabinets are still being priced.
```

Assertions:

```ts
expect(result.projectName).toBe("Smith Residence");
expect(result.projectType).toBe("RESIDENTIAL_REMODEL");
expect(result.budget?.baseline).toBe(310000);
expect(result.baselineScope.map((x) => x.label)).toEqual(expect.arrayContaining([
  "Demolition",
  "Kitchen",
  "Primary bath",
  "Flooring",
  "Windows",
  "Electrical service upgrade",
  "HVAC modifications",
]));
expect(result.knownDates).toContainEqual(expect.objectContaining({
  subjectId: "demolition",
  kind: "COMMITTED_START",
  date: "2026-09-14",
}));
expect(result.assumptions.length).toBeGreaterThan(0);
expect(result.missingCritical).toContain("Activity durations need PM validation");
```

Also test:
- missing project name remains a clear `missingCritical` item rather than inventing one;
- `$400,000`, `$400k`, and `400k budget` normalize correctly;
- unknown scope terms are preserved as scope labels instead of discarded;
- no sentence creates an external commitment/action.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm run test:unit -- test/unit/genesis-field-model.test.ts
```

Expected: FAIL because synthesizer does not exist.

- [ ] **Step 3: Implement one isolated pilot synthesizer**

Export:

```ts
export type GenesisSynthesizer = (
  text: string,
  now: string,
  preferredProjectId?: string,
) => GenesisProposalV096;

export const synthesizeGenesisField: GenesisSynthesizer = (...) => { ... };
```

Implementation rules:

- Normalize project name from `Create <name>`, `<name> project`, or the first title-like sentence only when explicit.
- Normalize slug with lowercase alphanumerics and hyphens; never silently collide with an existing D1 ID (collision check happens in HTTP task).
- Recognize `new build`, `remodel`, `renovation`, `addition`; otherwise use `RESIDENTIAL` and add an assumption.
- Recognize money with `k` and comma/dollar formats.
- Recognize common scope terms through a fixed dictionary (`demo`, `foundation`, `framing`, `electrical`, `plumbing`, `hvac`, `insulation`, `drywall`, `paint`, `tile`, `flooring`, `cabinet`, `countertop`, `window`, `door`, `roof`, `trim`, `punch`, `closeout`) while preserving unmatched comma/semicolon scope phrases verbatim.
- Recognize explicit month/day dates using `2026` from the intake year supplied by `now`; never infer a hidden date when none is stated.
- Add `"Activity durations need PM validation"` whenever any scope item lacks explicit duration.
- Keep named trade/vendor statements in `assumptions`/source text for this slice; do not create a separate trade subsystem now.
- If extraction is uncertain, preserve the original source text and add a concise `missingCritical`/assumption item rather than fabricating a fact.

This file is the replaceable pilot adapter. Do not place D1 calls, forecast calls, or UI rendering here.

- [ ] **Step 4: Run focused tests**

```bash
npm run test:unit -- test/unit/genesis-field-model.test.ts test/unit/genesis.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/worker/genesis-field-model.ts test/unit/genesis-field-model.test.ts
git commit -m "feat: synthesize pilot project intake"
```

**Codex review gate:** try messy punctuation, missing names, unusual dollar formats, and text that should remain unknown. Any invented project identity/date/budget is P1.

---

### Task 3: Add Genesis preview/commit HTTP routes using the existing canonical persistence path

**Files:**
- Modify: `src/worker/index.ts`
- Create: `test/integration/genesis-http.test.ts`
- Modify if needed: `test/integration/project-import.test.ts`

**Interfaces:**
- Produces:
  - `POST /v1/projects/genesis/preview`
  - `POST /v1/projects/genesis/commit`
  - no new database tables
- Reuses: `forecastInitial()`, `D1HowlerRepository.createProject()`, existing admin authorization, existing project validation.

- [ ] **Step 1: Write failing HTTP tests**

Tests must prove:

1. Preview accepts `{ text: string }`, requires admin auth, returns `GenesisProposalV096`, writes zero D1 rows.
2. Commit accepts `{ proposal: GenesisProposalV096 }`, validates it, builds canonical project, generates initial forecast, writes one project plus forecast/oversight rows, and returns `201`.
3. Commit rejects an existing `projectId` with `409` and changes nothing.
4. URL-free global Genesis routes cannot accidentally mutate another project.
5. Malformed body returns `400`, not `500`.
6. Forecast-only intake dates are not persisted as schedule locks.
7. Existing `/v1/projects/:id/import` tests stay green.

Core test shape:

```ts
const preview = await worker.fetch(
  jsonRequest("POST", "/v1/projects/genesis/preview", { text: INTAKE }),
  adminEnv(),
);
expect(preview.status).toBe(200);
const proposal = (await preview.json() as { proposal: GenesisProposalV096 }).proposal;

const before = await env.HOWLER_DB.prepare("SELECT COUNT(*) AS n FROM projects").first<{ n: number }>();
expect(before?.n).toBe(0);

const committed = await worker.fetch(
  jsonRequest("POST", "/v1/projects/genesis/commit", { proposal }),
  adminEnv(),
);
expect(committed.status).toBe(201);
expect((await committed.json() as { projectId: string }).projectId).toBe(proposal.projectId);
```

- [ ] **Step 2: Run and verify RED**

```bash
npm run test:integration -- test/integration/genesis-http.test.ts
```

Expected: 404/route failures.

- [ ] **Step 3: Implement the routes in `src/worker/index.ts`**

Preview behavior:

```ts
const proposal = synthesizeGenesisField(text, new Date().toISOString(), preferredProjectId);
return json({ schemaVersion: "0.9.6", preview: true, proposal });
```

Commit behavior:

```ts
const errors = validateGenesisProposal(proposal);
if (errors.length) throw new HttpError(400, "Invalid Genesis proposal", { errors });
if (await repo.projectExists(proposal.projectId)) {
  throw new HttpError(409, `Project ${proposal.projectId} already exists`);
}
const approvedAt = new Date().toISOString();
const model = buildProjectFromGenesis(proposal, approvedAt);
validateProjectModel(model);
const initial = forecastInitial(model, approvedAt, 1);
await repo.createProject(model, initial.candidate, initial.oversight);
return json({
  schemaVersion: "0.9.6",
  projectId: model.projectId,
  revision: model.revision,
  forecastVersion: initial.candidate.version,
  oversightDecision: initial.oversight.decision,
  publishable: false,
  stagingOnly: true,
}, 201);
```

Important: `createProject()` already supports a zero-event revision-0 project. Do not duplicate its D1 statements in the route.

- [ ] **Step 4: Run Genesis and import regression tests**

```bash
npm run test:integration -- test/integration/genesis-http.test.ts test/integration/project-import.test.ts test/integration/repository-v094.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/worker/index.ts test/integration/genesis-http.test.ts test/integration/project-import.test.ts
git commit -m "feat: add project genesis preview and commit routes"
```

**Codex review gate:** attack auth, duplicate IDs, malformed payloads, preview writes, forecast creation, and wrong-project persistence. Any preview write or cross-project write is P0.

---

### Task 4: Build one deterministic project-summary view for Penthouse and Index Card

**Files:**
- Create: `src/operator/project-summary.ts`
- Modify: `src/worker/index.ts`
- Create: `test/unit/project-summary.test.ts`
- Extend: `test/integration/genesis-http.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProjectSummaryV096 {
  projectId: string;
  projectName: string;
  progressPercent: number;
  integrity: {
    score: number;
    condition: string;
    primaryDriver: string;
  };
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
    committed: ProjectScheduleItemV096[];
    forecast: ProjectScheduleItemV096[];
  };
  scope: { id: string; label: string; phase: string }[];
}
```

and read-only route `GET /v1/projects/:id/summary`.

- [ ] **Step 1: Write RED tests for Progress and Integrity separation**

Tests:

- a project can be 80% progress and 60 integrity;
- progress is weighted by activity likely-duration, not budget spend;
- missing `spent` does not fabricate spend or remaining values;
- a committed schedule lock appears only in `schedule.committed`;
- normal forecast activities appear in `schedule.forecast`;
- Project Integrity uses deterministic penalties and returns one plain-language driver.

Use this exact scoring baseline for pilot transparency:

```ts
let score = 100;
score -= Math.min(30, health.blockedConstraints.length * 15);
score -= Math.min(20, health.openConflicts.filter((c) => c.severity === "HIGH").length * 10);
score -= Math.min(15, health.unverifiedHardConstraints.length * 5);
score -= Math.min(15, forecast?.recoveryAnalysis.criticalExposureCount ?? 0);
score -= Math.min(10, health.lowCoverage.length * 2);
score = Math.max(0, Math.min(100, score));
```

Condition labels:

```ts
score >= 85 -> "Stable"
score >= 70 -> "Stable, exposed"
score >= 50 -> "At risk"
else -> "Critical"
```

This formula is explicitly pilot-tunable; do not persist the score as canonical truth.

Progress calculation:

```ts
weight = activity.duration.likely
COMPLETE = 1.0 * weight
IN_PROGRESS = 0.5 * weight
NOT_STARTED = 0
```

Round to nearest integer. This is production progress only.

- [ ] **Step 2: Run and verify RED**

```bash
npm run test:unit -- test/unit/project-summary.test.ts
```

- [ ] **Step 3: Implement `buildProjectSummary()`**

Signature:

```ts
export function buildProjectSummary(
  model: ProjectModelV094,
  forecast: ForecastSnapshotV094 | undefined,
  health: ProjectHealthV094,
): ProjectSummaryV096
```

Rules:

- `primaryExposure`: first blocked constraint, else first HIGH conflict, else first forecast PM action, else `"No critical exposure identified."`.
- `nextMovement`: earliest incomplete activity by forecast likely start; if committed lock exists earlier, use that activity and label it `Committed`.
- `projectedCompletion`: `forecast?.completion.likely ?? null`.
- budget remaining only when baseline and spent are both known.
- no color/status bucket field is returned; UI decides restrained accent from continuous score if desired.

- [ ] **Step 4: Add `GET /v1/projects/:id/summary`**

Route sequence:

```ts
requireAdmin(...)
model = await repo.loadProject(id)
forecast = await repo.loadLatestForecast(id)
health = await projectHealth(repo, model, forecast)
summary = buildProjectSummary(model, forecast, health)
return json(summary)
```

404 when project absent.

- [ ] **Step 5: Run focused tests**

```bash
npm run test:unit -- test/unit/project-summary.test.ts
npm run test:integration -- test/integration/genesis-http.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/operator/project-summary.ts src/worker/index.ts test/unit/project-summary.test.ts test/integration/genesis-http.test.ts
git commit -m "feat: derive contractor hub project summaries"
```

**Codex review gate:** verify Progress and Integrity cannot be conflated, missing budget data is never invented, committed dates are not forecast dates, and score logic is deterministic/cheap.

---

### Task 5: Rebuild Penthouse as the sharp portfolio map and add Project Genesis UX

**Files:**
- Modify: `src/worker/admin.ts`
- Modify: `test/unit/field-dashboard.test.ts`
- Modify: `test/unit/admin-ui.test.ts`

**Interfaces:**
- Consumes: `GET /v1/projects/:id/summary`, Genesis preview/commit routes.
- Produces: concise portfolio map, New Project intake/review/approve flow, selected project routing to Index Card.

- [ ] **Step 1: Write static/UI tests that fail against the current Penthouse**

Tests must require:

- no portfolio-level 14-day Movement Gantt;
- no dead/fake nav buttons for Forecast/Trades/Materials/etc.;
- main page contains `New project`, `Project Integrity`, `Progress`, `Budget`, `Primary exposure`, `Next movement`, `Projected completion` copy/anchors;
- `Command the work.` remains brand copy but is not a 520px+ hero requirement;
- Project Genesis textarea exists and no JSON textarea is exposed;
- portfolio project selection opens one selected Index Card instead of rendering all detailed project cards in the primary page;
- legacy evidence/admin controls remain under `Admin & diagnostics` only.

- [ ] **Step 2: Write browser-client tests for Genesis**

Extend fake DOM IDs with:

```text
new-project-open
genesis-panel
genesis-text
genesis-analyze
genesis-review
genesis-approve
genesis-cancel
index-card-container
```

Test:

1. click New Project -> panel visible;
2. enter messy text -> Analyze posts `/v1/projects/genesis/preview`;
3. preview response renders normal fields, assumptions, missing critical info;
4. user edits project name/budget/scope through standard form inputs;
5. Approve posts `/v1/projects/genesis/commit` with corrected proposal;
6. successful commit adds project to local tracked project list, refreshes portfolio summary, selects/open its Index Card;
7. no admin key persistence regression.

- [ ] **Step 3: Replace the portfolio information hierarchy in `fieldDashboardHtml()`**

Keep `PENTHOUSE_TOKENS` but simplify the top-level layout:

```text
HOWLER / PENTHOUSE                     [voice] [New project]
COMMAND THE WORK.
Portfolio overview

[Project card] [Project card] [Project card]

Needs attention
(one concise line per affected project)

Selected Index Card appears below or in-place after project click
```

Each portfolio card/row shows only:

```text
PROJECT NAME
Project Integrity: 82 / 100 — Stable, exposed
Progress: 72%        [thin progress bar]
Budget: $X spent / $Y remaining   OR   Budget: baseline known · spend not recorded
Primary exposure: ...
Next movement: ...
Projected completion: Sep 18
```

Rules:

- visual health accent is secondary; never render a giant RED/YELLOW/GREEN badge;
- use a thin integrity meter and thin progress meter rather than large circular widgets in this session;
- remove the portfolio Movement Gantt and `Howler notice` duplication;
- priorities section may remain, but one line per project and no duplicated exposure already printed elsewhere unless it is severe enough to deserve the portfolio attention area;
- reduce `.ph-atmosphere` desktop min-height from `520px` to a compact band no taller than `220px`; reduce command heading to a maximum `32px` desktop and `28px` mobile;
- do not remove staging/shadow banner or voice control.

- [ ] **Step 4: Add Genesis review rendering**

Render a readable review card, not JSON:

```text
Project
  Smith Residence
  Residential remodel

Baseline scope
  Demolition
  Kitchen
  Primary bath
  ...

Budget
  $310,000 baseline

Known dates
  Demo start — Sep 14 — Committed

Howler assumptions
  Activity durations need PM validation

Missing / confirm
  ...

[Approve baseline] [Edit] [Cancel]
```

Use ordinary `<input>`/`<textarea>` controls for correction. The source text can be retained in a collapsed `Original intake` details block.

- [ ] **Step 5: Make portfolio refresh use one summary GET per project**

For the primary portfolio, call `/v1/projects/:id/summary`; do not fire three operator-query workflows merely to populate the map. Keep old query workflows only for the diagnostics card and existing safety tooling.

This is an explicit speed/cost improvement: portfolio display becomes read-only derived data.

- [ ] **Step 6: Run UI unit tests**

```bash
npm run test:unit -- test/unit/field-dashboard.test.ts test/unit/admin-ui.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/worker/admin.ts test/unit/field-dashboard.test.ts test/unit/admin-ui.test.ts
git commit -m "feat: make Penthouse the contractor portfolio map"
```

**Codex review gate:** review visual hierarchy from HTML/CSS and behavior tests. Specifically reject duplicated portfolio information, oversized hero typography, hidden project creation, any JSON-first UX, or reintroduction of fake navigation.

---

### Task 6: Make the selected Index Card the project operating environment

**Files:**
- Modify: `src/worker/admin.ts`
- Modify: `test/unit/field-dashboard.test.ts`
- Modify: `test/unit/admin-ui.test.ts`

**Interfaces:**
- Consumes: project summary route + existing `/v1/projects/:id/conversation/turn`.
- Produces: one selected project Index Card with overview, baseline scope, budget, forecast calendar, exposures/next move, and natural-language update input.

- [ ] **Step 1: Write RED tests for Index Card structure**

Require one selected Index Card to contain:

- project name;
- Project Integrity meter + condition + primary driver;
- Progress meter;
- budget baseline/spent/remaining with honest unknown states;
- baseline scope section;
- primary exposure and next movement;
- schedule/forecast calendar/list;
- clear `Committed` and `Forecast` labels;
- `Tell Howler what changed` text input;
- latest update result/clarification area;
- no full Index Cards for every portfolio project at once.

- [ ] **Step 2: Implement `indexCardHtml(summary, projectId)` in browser-client rendering**

Use a compact structure:

```text
CARVER                                        82 / 100
Stable, schedule exposed                     72% Progress

Budget                         Howler brief
$284k spent / $116k remaining  Exposure: ...
                               Next: ...

Schedule & Forecast
Sep 9  Granite install       COMMITTED
Sep 10 Electrical finals     FORECAST
Sep 12 Glass template        FORECAST

Baseline scope
...

Tell Howler what changed
[____________________________________] [Update]
```

No giant cards inside cards. Use section dividers and 11–14px support type.

- [ ] **Step 3: Render schedule from `summary.schedule`**

Merge committed + forecast rows for display, sort by date, and visually distinguish with text badges:

```html
<span class="ic-date-kind ic-committed">Committed</span>
<span class="ic-date-kind ic-forecast">Forecast</span>
```

Do not change canonical schedule data in the browser.

For forecast rows, prefer likely start date. If the activity already has a committed lock, do not duplicate it as forecast.

- [ ] **Step 4: Reuse the existing conversation endpoint for updates**

The Index Card update button sends exactly the current API request used by `submitConversationalTurn(projectId, text)`.

On result:

- if clarification -> display the concise question and do not fabricate a change;
- if confirmation required -> reuse existing confirmation flow;
- if applied -> refresh only the selected project summary and its Penthouse card;
- show one concise message such as `"Schedule and forecast updated to reflect the accepted project change."` when the response indicates a derived schedule change.

Do not create a second mutation path for Index Card updates.

- [ ] **Step 5: Move legacy detailed project cards into Admin & diagnostics**

The current `projects-container`/`projectCardHtml()` evidence controls are useful diagnostics but cannot remain the primary project experience. Mount them only inside the existing `<details class="ph-admin-drawer">` section.

Keep existing tests for evidence preview/apply/voice bridge passing; update selectors only where the DOM parent changes.

- [ ] **Step 6: Run focused UI/conversation tests**

```bash
npm run test:unit -- test/unit/field-dashboard.test.ts test/unit/admin-ui.test.ts test/unit/conversation-turn.test.ts test/unit/claim-compiler.test.ts
npm run test:integration -- test/integration/conversation-http.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/worker/admin.ts test/unit/field-dashboard.test.ts test/unit/admin-ui.test.ts
git commit -m "feat: turn Index Card into the project workspace"
```

**Codex review gate:** verify the Index Card is a client of canonical state, not parallel local truth; schedule labels are truthful; update flow reuses conversation endpoint; old admin tooling is still reachable but not product-facing.

---

### Task 7: Prove the full v0.9.6 pilot slice end to end

**Files:**
- Create: `test/integration/contractor-hub-pilot.test.ts`
- Modify only if route/test inventory requires it: `test/safety/release-gate.test.ts`
- Modify only if generated Cloudflare types change: `worker-configuration.d.ts`

**Interfaces:**
- Validates the entire approved v0.9.6 scenario with no external systems.

- [ ] **Step 1: Write the end-to-end pilot test**

Scenario:

1. Initialize clean D1.
2. Preview the Smith Residence messy intake.
3. Correct one field in the returned proposal in test code, simulating PM review.
4. Commit baseline.
5. GET summary and assert project name, scope, budget, progress/integrity, and schedule are present.
6. Send a natural update through existing `/v1/projects/smith-residence/conversation/turn` for an activity that exists, using a phrase supported by the current field model, e.g. `"Demolition started today"`.
7. Follow the existing confirmation path if the endpoint requests it.
8. GET summary again and assert only Smith Residence changed and progress/next movement/forecast are recomputed.
9. Create/read a second control project and prove its revision/summary is unchanged.
10. Assert no external-system endpoint was invoked.

- [ ] **Step 2: Run the new test and fix only genuine integration gaps**

```bash
npm run test:integration -- test/integration/contractor-hub-pilot.test.ts test/integration/genesis-http.test.ts test/integration/conversation-http.test.ts
```

Expected: PASS after wiring fixes.

- [ ] **Step 3: Run the full regression suite**

```bash
npm run verify
```

Expected: all formatting, lint, typecheck, unit, integration, contract, parity, safety, tool suites, Cloudflare typegen check, and dry deploy pass.

Do not declare success from a subset.

- [ ] **Step 4: Codex final adversarial review of the complete branch**

Codex reviews the full diff from `a744be5dc7478486e1b917a57c1ad133c03b3c06` to branch HEAD and specifically checks:

- Genesis preview cannot write;
- commit cannot overwrite existing projects;
- no wrong-project updates;
- Project Integrity and Progress are separate;
- budget unknowns remain unknown;
- committed/forecast dates are distinguishable;
- portfolio is map-level only;
- Index Card uses canonical project state;
- natural update uses existing confirmation/Apply machinery;
- no dead/fake nav was added;
- no expensive model call is added to normal refresh/update paths;
- CSP/admin-key handling does not regress;
- staging/shadow guarantees remain intact.

Claude fixes accepted P0/P1 findings, reruns focused tests, then reruns `npm run verify` if any code changed.

- [ ] **Step 5: Commit final integration fixes**

```bash
git add test/integration/contractor-hub-pilot.test.ts test/safety/release-gate.test.ts worker-configuration.d.ts src test
git commit -m "test: verify contractor hub pilot slice"
```

Only include files that actually changed; do not stage caches or unrelated generated files.

---

### Task 8: Deploy the exact reviewed SHA to staging and re-enter controlled pilot

**Files:**
- No product-code changes expected.
- Existing: `.github/workflows/deploy.yml`
- Existing: `scripts/activate-pilot.ts` only if activation is still part of the intended controlled-pilot procedure; do not relax its exact staging allowlist.

**Interfaces:**
- Deployment target remains the known staging Worker only.

- [ ] **Step 1: Record exact candidate SHA**

```bash
git rev-parse HEAD
```

Store the exact SHA in the deployment/review note. Do not deploy a moving branch tip without recording it.

- [ ] **Step 2: Push branch and run the existing staging deployment workflow for that exact SHA**

Expected environment remains staging/shadow. No production target is permitted.

- [ ] **Step 3: Verify staging product behavior manually**

At the staging Worker:

1. Root opens Penthouse, not old scheduling admin.
2. Dashboard is visually compact and legible.
3. Existing pilot projects show concise map-level data.
4. New Project opens Project Genesis.
5. Paste the Smith Residence realistic intake.
6. Preview is readable, no JSON required.
7. Correct/approve baseline.
8. New Index Card opens.
9. Confirm scope, budget awareness, progress/integrity, schedule labels, exposure, next movement.
10. Enter one supported natural project update.
11. Complete confirmation if required.
12. Verify Index Card changes.
13. Return/observe Penthouse summary changes for the same project.
14. Verify another project did not change.
15. Confirm Admin & diagnostics still contains old safety/evidence controls.

- [ ] **Step 4: Verify logs/CI for the exact SHA**

Required before pilot:

- deployment workflow success;
- secret preflight success;
- staging Worker target only;
- D1 staging binding only;
- HOWLER mode remains shadow unless an explicitly reviewed pilot step says otherwise;
- no failing post-deploy smoke checks.

- [ ] **Step 5: Re-enter controlled pilot with the correct claim**

Allowed statement:

> **Cleared the safety gate and ready for controlled field testing.**

Pilot log should capture per interaction:

```text
User said -> Howler understood -> state changed -> forecast changed -> correct/useful? -> unnecessary question? -> slow? -> expensive path used unnecessarily? -> presentation helped/hurt?
```

Tune learning generalization, interruption frequency, Progress weighting, Integrity weighting, and deep-reasoning thresholds only from pilot evidence unless a safety defect requires immediate correction.

---

## Execution Order and Review Cadence

Use this exact cadence during the single build session:

```text
Task 1 Claude implement -> focused tests -> commit -> Codex review -> fix if needed
Task 2 Claude implement -> focused tests -> commit -> Codex review -> fix if needed
Task 3 Claude implement -> focused tests -> commit -> Codex review -> fix if needed
Task 4 Claude implement -> focused tests -> commit -> Codex review -> fix if needed
Task 5 Claude implement -> focused tests -> commit -> Codex review -> fix if needed
Task 6 Claude implement -> focused tests -> commit -> Codex review -> fix if needed
Task 7 full integration -> Codex final branch review -> full verify
Task 8 deploy exact SHA -> staging smoke -> controlled pilot
```

Do not have Claude and Codex both make changes against the same files at the same time. The speed gain comes from immediate independent review, not parallel conflicting edits.

## Plan Self-Review

### Spec coverage

- Project Genesis create/analyze/review/approve: Tasks 1-3 and 5.
- Canonical one-project truth: Tasks 1, 3, 4, 6.
- Penthouse as map: Task 5.
- Sharp/clean visual presentation: Tasks 5-6.
- Index Card as project hub: Task 6.
- Progress vs Project Integrity: Task 4 + UI Tasks 5-6.
- Budget spent/remaining with unknown-safe behavior: Task 4 + UI.
- Forecast inside Index Card rather than portfolio: Tasks 5-6.
- Committed vs forecast dates: Task 4 + Task 6.
- Existing natural update/canonical mutation reuse: Task 6.
- Fast default path / cost discipline: Tasks 4-6; summary reads are deterministic and normal updates keep existing path.
- Pilot-tunable learning/weighting: deliberately deferred; Task 8 records evidence.
- No full accounting/code/jurisdiction/vendor-learning expansion: preserved by Global Constraints.
- Controlled pilot return: Tasks 7-8.

### Placeholder scan

No `TBD`, `TODO`, "implement later", or unspecified error/test steps remain. Deferred capabilities are explicitly out of this slice rather than placeholders inside it.

### Type consistency

- `GenesisProposalV096` is defined once in Task 1 and reused unchanged in Tasks 2-3.
- `ProjectSummaryV096` is defined once in Task 4 and consumed unchanged by Tasks 5-6.
- Existing `ProjectModelV094`, `ForecastSnapshotV094`, `ProjectHealthV094`, and conversation endpoints remain the canonical integration points.
