# Phase 4: Budget + Change Orders capability audit and design proposal

Status: audit complete; proposed design and build sequence awaiting owner review.
This is not an implementation-completion claim.

Base: `3aed78e2241a06e3b299baec8a73a2b6b8f11277`, accepted Phase 3 development
milestone. Working branch: `codex/v096-phase4-budget-change-orders`.

Authority: the owner's Phase 4 directive and the permanent
[Universal Data Interaction Contract](2026-09-08-howler-universal-data-interaction-contract.md).
Budget and Change Orders are the only new modules in scope. Storage architecture
is accepted separately; no provider activation or storage implementation here.

## 1. Existing capabilities and concrete gaps

All line references below are at the accepted base, not a claim about future code.

| Area | Evidence | What Phase 4 can reuse / must add |
| --- | --- | --- |
| Budget shape | `src/domain/types.ts:162` (`ProjectBudgetV096`) | Only optional numeric `baseline`, `spent`, required string `currency`; no financial records or lifecycle. Preserve this legacy contract. |
| Legacy validation | `src/domain/validation.ts:296` | Finite, nonnegative baseline/spent; no minor-unit or safe-integer constraint. Do not retroactively reject valid legacy projects. |
| Genesis | `src/operator/genesis.ts:295`, `:519` | Validates then copies legacy monetary numbers. Revision 0 and empty event ledger remain creation invariants. New finances must not reinterpret these numbers as cents. |
| Summary | `src/operator/project-summary.ts:154` | Remaining is baseline minus spent when both are known; unknowns are null. No CO, commitment, allocation, or actual-cost arithmetic. Existing response has no currency. |
| Display | `src/app/format.ts:15`, `src/app/views/indexCard/overview.ts:11` | Dollar-prefixed, whole-number display is insufficient for exact money/currency. New finance display must preserve minor units and explicit currency. |
| Module UI | `src/app/views/indexCard/shell.ts:37`, `:39` | Budget and Change Orders both render placeholders. Real manual workspaces must replace only these two renderers. |
| Scope | `src/domain/types.ts:186`, `:192`; `src/operator/scope.ts:154`, `:483` | Current Scope and frozen baseline coexist; Scope allowance is already editable in major units. Linked financial allowances must not create competing copies. Read effective scope through `buildScopeView`, including unmaterialized baseline rows. |
| Schedule associations | `ScopeItemV096.activityIds`, `buildScheduleView`, `buildScheduleEvent` | Reuse real project activity IDs. A declared CO impact is not an instruction to change dates or durations. |
| Canonical apply | `src/engine/engine.ts:34`, `:90`; `src/engine/reducer.ts:94` | New model, append-only event, revision increment, validation and forecast after mutation. Add bounded financial mutations, not a separate persistence path. |
| D1 atomicity | `src/worker/repository.ts:620`; `migrations/0001_v094_baseline.sql:8-16` | Event insert, project-model trigger, forecast and oversight persist in one batch. Reuse project revision checks and append-only history. |
| Preview/apply routes | `src/worker/index.ts:301`, `:1932`, `:2017` | Existing reviewed event/candidate token and shadow apply path. Financial previews need financial before/after consequences as well as forecast consequences. Existing stale/duplicate rejection is not itself a friendly uncertain-delivery recovery UI. |
| Session bridge | `src/worker/entry.ts`, `isProductOperatorRoute` | Explicit project-route allowlist and server-held credentials. Add only authorized finance read/preview routes; no new auth architecture. |
| History | `src/app/views/indexCard/activity.ts:11` | Already reads canonical events and renders note/type. Financial commands must supply precise, currency-aware before/after notes. |
| AI boundary | `src/operator/conversation.ts:21`; `src/operator/claim-compiler.ts:21` | Existing claims resolve activity/constraint semantics, not budgets/COs. A reusable command layer enables future adapters but does not prove AI coverage. |
| Seeds | `src/worker/deboard-seed.ts`, `scripts/pilot-seed.ts` | Source names mentioning budget or material quotes are not structured financial totals. Do not populate costs from labels, schedule, or commercial signals. Test these projects with no finance data. |

No accepted module was re-audited wholesale. These are direct dependencies and
capability gaps for the newly authorized financial features.

## 2. Architecture choice

Considered:

1. Add more aggregate numbers to the three-field budget. Rejected: cannot explain
   allocation, change provenance, corrections, or double-counting.
2. Add an optional typed financial submodel on `ProjectModelV094`, retain the
   legacy profile receipt, and derive all summaries through pure functions.
   Recommended: uses existing transactional/event infrastructure without forcing
   records into the legacy object.
3. Dedicated financial SQL tables/projections. Not necessary for this first
   project-scoped slice. Reconsider on measured model size/query needs, not an
   ideological ban. Any future projection remains derived, never a competing
   canonical authority.

No migration is currently justified. Implementation must measure representative
financial model/event sizes and stop for a design adjustment if the existing
bounded project-document approach proves inadequate. No generic accounting ledger,
tax engine, exchange rates, payment status, or external finance integration.

## 3. Proposed financial truth rules

### Money and legacy compatibility

- New monetary inputs are decimal strings parsed into checked integer minor
  units; never `parseFloat(value) * 100`. Check every addition/subtraction and
  aggregate for safe-integer bounds. Reject excess fractional precision,
  exponent notation, non-finite inputs and mixed currencies.
- One explicit currency per project financial submodel. Proposed first pilot
  editing support is USD (2 decimal places); unsupported legacy currencies still
  load honestly, without a dollar label, and require an explicit supported-currency
  design before editing. This restriction needs owner approval, not silent rollout.
- Preserve `projectProfile.budget` unchanged as the Genesis/import receipt. On
  read, expose legacy values and provenance without writing or guessing a date.
  Exact legacy decimal conversion is required; values that cannot be represented
  safely remain visible as legacy data with a reconciliation requirement.
- Initial financial setup explicitly establishes the new project baseline and
  tracking basis. Do not fabricate line allocations from a project total.
- Legacy `spent` is a reported aggregate, not paid status or automatically an
  itemized actual. Keep it separate from new recorded actuals. A combined
  life-to-date total requires explicit PM reconciliation and an opening-cost
  basis/cutoff; records asserted to be included in that opening basis must not
  count again. Before reconciliation, show the two components separately and
  report the combined total unknown.
- Missing is not zero. A sum of recorded entries may be exactly zero while
  total project commitments/costs remain incomplete. Show completeness and scope
  of coverage alongside every total. No automatic completeness claim from an
  empty collection or a newly initialized module.

### Records and canonical ownership

Proposed optional `financials` submodel holds project baseline settings, editable
categories, budget lines, commitments, actual-cost records, Change Orders and
explicit tracking/reconciliation metadata. Stable IDs are scoped to the project;
all relationships resolve against the same canonical model. Preserve historical
source references and created/updated event identity; do not accept arbitrary
provenance from an AI/client payload.

- Categories are editable local records, initially offered from the owner's
  construction list, never an imposed accounting code system.
- Budget lines own description, category, baseline allocation, optional allowance
  designation/expected selection cost, scope/activity IDs, optional external
  vendor reference, notes, and active status. Revised amounts are derived from
  baseline allocation plus approved CO allocations, not independently editable.
- Project baseline and line allocations are distinct. Allocating a line does
  not increase the project baseline. Show the difference as unallocated baseline
  or over-allocation; do not silently normalize either side.
- Commitments have a known amount, status (`DRAFT`, `COMMITTED`, `CLOSED`, `VOID`),
  reference/PO, optional vendor reference, and line allocations. `COMMITTED` and
  `CLOSED` count as committed cost; closed is not paid. Moving draft to committed
  requires explicit confirmation. Corrections/voids are new events.
- A commitment can allocate across multiple lines: allocations plus an explicitly
  recorded unallocated remainder sum exactly to its amount, without duplicate
  line IDs. Project totals count the commitment
  once, not once per related scope/activity. Unallocated amounts are explicit.
- Actual records carry amount, date, description, source/reference, notes, line
  allocation, optional commitment association, and recorded/void status. Recording
  an invoice means recorded cost, never payment. Duplicate reference warnings do
  not silently discard a legitimate separate cost; event identity handles retry.
- For Phase 4, costs and commitments are nonnegative; negative CO adjustments
  are supported. Actual correction/deactivation uses a new auditable event, not
  an untraceable deletion. Credit-note accounting is not implicitly implemented.
- Deactivating a referenced line/category requires explicit reassignment or
  refusal; it must not hide live commitments, actuals, or approved CO amounts.
  Voiding a CO never deletes incurred actuals or vendor commitments.

### Scope allowance ownership

An existing Scope allowance remains a legacy fact until the PM explicitly links
it to an allowance budget line. Linking validates currency/value and previews any
conflict; it never silently increases the project budget. For a linked allowance,
Budget becomes the single monetary owner and Scope reads a derived adapter view.
Manual Scope allowance edits and future AI allowance edits call the same financial
command. Legacy data remains history, not a second current amount. One allowance
owner per linked Scope item; no implicit summing of duplicate coverage.

The owner example must hold exactly: 100000 minor units allowance minus 117500
selected expected cost = -17500 variance. No automatic CO. Missing selected cost
means unknown expected variance; actual variance is calculated separately only
when actual costs exist.

## 4. CO lifecycle, effects and totals

Use `DRAFT`, `PROPOSED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `VOID`.
Transitions: DRAFT → PROPOSED or VOID; PROPOSED → DRAFT, PENDING_APPROVAL,
REJECTED or VOID; PENDING_APPROVAL → DRAFT, APPROVED, REJECTED or VOID;
APPROVED → VOID only; REJECTED and VOID terminal. Rework of a terminal CO creates
a new, linked CO. Approved cost/allocations cannot be edited in place: explicitly
void and replace with preserved history. Notes can be corrected by a new event.

Each CO has stable ID and project-unique number, title/description/reason, signed
cost impact or unknown, requested date, client approval state, notes, same-project
scope/activity associations, budget allocations and source/event provenance.
Supporting-document references remain unpopulated unless an existing valid
canonical reference can be resolved; no storage feature is introduced.

Approval requires a known cost impact (explicit zero is valid), valid allocations,
and recorded PM attestation of client approval, or explicit not-required rationale
under existing company policy. This records an attestation, not a digital-signature
system. Approval/rejection dates are explicitly captured and validated; system
event timestamps/actor provenance stay system-controlled.

- Approved adjustment = signed sum of currently APPROVED CO impacts.
- Revised approved budget = known current baseline + approved adjustment.
- Preserve the original captured baseline; a correction creates a separately
  traceable baseline revision with reason and a before/after confirmation.
- PROPOSED/PENDING_APPROVAL form pending exposure. Show gross proposed additions
  and credits separately as well as net; proposed savings must not hide exposure.
  DRAFT estimates are a separately labeled list, not approved budget.
- Unknown pending amounts remain counted as unpriced changes; a known subtotal
  must not masquerade as the complete pending exposure.
- CO approval changes its lifecycle once; budget totals are derived from that
  state, not incremented by the client. Duplicate approval must not add twice.
- Voiding an approved +680000 CO removes exactly that approved adjustment. It
  does not erase the approval event, existing costs, or other COs.
- Remaining uncommitted budget means revised budget minus recorded commitments,
  qualified by commitment completeness. It does not also subtract actuals already
  within those commitments. Show actual-to-budget variance separately.
- No numeric forecast-at-completion is claimed without sufficient explicit
  remaining-cost and reconciliation inputs. Phase 4 can instead show factual
  committed/actual overruns, allowances, and priced/unpriced pending exposure.

Declared schedule impact records magnitude, unit and uncertainty; it does not
generate Schedule mutations. An explicit subsequent schedule adjustment uses
`buildScheduleEvent` and its own preview/confirmation. Approving a CO leaves
activities, dependencies, durations and locks unchanged. Scope association also
does not create or approve new scope automatically.

## 5. Shared manual/AI command path and delivery safety

Add pure financial command validation/builders and read models, with injected
clock/IDs. Manual forms and future financial interpretation adapters must emit
the same typed commands; no HTTP, speech or model-provider assumptions in these
functions. Keep interpretation outside deterministic financial authority.

Read routes: project Budget and Change Orders. Command preview routes: project
Budget and Change Orders. Applying continues through the canonical reviewed
event/shadow persistence path. New financial mutation validation must enforce
lifecycle/association/protected-field rules at the reducer boundary too, so a
raw event cannot bypass the command builder's rules.

Preview returns resolved project/entity IDs, revision, normalized monetary inputs,
financial before/after totals, affected associations, forecast consequences,
history note, and explicit confirmation classification. All money, association,
lifecycle, correction and deactivation changes require confirmation; text-only
notes/descriptions can use lighter auditable handling. No per-keystroke writes.

Client keeps one reviewed event identity through delivery retries. On ambiguous
network outcome, resolve that event and exact persisted content through canonical
reads before declaring success or offering a replay. Same ID/different content
is a conflict. A new deliberate action gets a fresh ID. Do not weaken accepted
duplicate/stale rejection for unrelated event clients; if a new reconciliation
response is required, scope it explicitly and regression-test existing contracts.

After verified apply, refetch Budget, COs, project summary and relevant Scope/
Schedule/History views at the applied revision or newer. UI requests are bound to
project and render generation; late responses cannot replace newer state. Report
refresh failure as stale/unavailable, separately from confirmed persistence.

AI coverage for every new financial command must be listed as implemented/tested
or pending. A command-equivalence harness is required now; it does not stand in
for a working natural-language adapter. The permanent requirement permits eventual
coverage, so do not label Phase 4 universally AI-functional unless that adapter
coverage is actually delivered. Its scope must be agreed before implementation.

## 6. Factual intelligence and module synchronization

Initial observations: selected allowance overrun; actual/committed line amount
above known revised line budget; current Scope with no budget association; new
Scope with unknown cost/no CO association; unpriced pending CO; pending CO with
explicitly linked critical activity. Each finding includes project/revision and
source record IDs. Missing coverage means “not recorded,” not “not purchased.”

Only add near-term unconfirmed-commitment observations where explicit line/activity
relationships and canonical forecast dates support them. No inferred vendor, no
financial warning solely because a screen needs content. Overview and Dashboard
show actionable financial facts from the same derived summary, not a second total
or an invented combined integrity score. Budget retains detailed financial control.

## 7. Proposed implementation sequence and review gates

Every implementation task follows RED → smallest implementation → GREEN →
spec-compliance/code-quality review → correction → task-scoped commit. No financial
code is implemented by this audit.

| Task | Deliverable and files | Required proof before proceeding |
| --- | --- | --- |
| 1 | Safe money/legacy adapter: new `src/domain/money.ts`, focused `test/unit/money.test.ts`, `test/unit/budget-legacy.test.ts` | Exact decimals, safe overflow rejection, currency checks, zero versus unknown, legacy overprecision/exponent/large values do not break project loading. |
| 2 | Optional financial contracts/validation in `src/domain/types.ts`, `src/domain/validation.ts`; new `test/unit/financial-validation.test.ts` | ID uniqueness/reserved-key rejection, allocations, dates, project association checks, references, completeness, no regressions to legacy validation/Genesis. |
| 3 | Pure Budget/CO derivation in new `src/operator/budget.ts`, `src/operator/change-orders.ts`; corresponding unit tests | All formulas and user examples, unknowns, signed CO credit, order-independent sums, no double counting, no source-model mutation. |
| 4 | Typed command compilation and reducer operations; `src/engine/reducer.ts`, new `src/domain/financial-mutations.ts`; `test/unit/financial-commands.test.ts`, `test/unit/financial-reducer.test.ts` | Valid/invalid lifecycle pairs, confirmed corrections, immutability/history, protected inputs, no raw-event bypass, no schedule side effects. |
| 5 | Worker read/preview wiring and canonical reconciliation, `src/worker/index.ts`, `src/worker/entry.ts`; repository additions only if a required exact-event read is missing | New `test/contract/budget-routes.test.ts`, `test/contract/change-order-routes.test.ts`, `test/integration/financial-persistence.test.ts`: auth, project isolation, stale revision, concurrent approval, duplicate/catch path, uncertain delivery, all-or-nothing D1 batch. |
| 6 | Shared allowance ownership and financial summary integration: `src/operator/scope.ts`, `src/operator/project-summary.ts`, Scope compatibility adapter where needed | `test/integration/financial-cross-module.test.ts`; existing Scope/summary tests. Editing one allowance through either surface updates the same fact. Missing historical amounts remain unknown. |
| 7 | Real manual workspaces: new `src/app/views/indexCard/budget.ts`, `src/app/views/indexCard/changeOrders.ts`; update `src/app/views/indexCard/shell.ts`, `src/app/api.ts`, `src/app/types.ts`, `src/app/format.ts`, `src/app/views/indexCard/overview.ts`, `src/app/styles.css` | New app Budget/CO tests; exact minor-unit display, manual create/edit/correct/deactivate, real controls outside diagnostics, confirmation, reload, cross-project and stale-response tests. |
| 8 | Universal-contract financial coverage matrix and manual/AI command-equivalence tests in `test/unit/financial-interaction.test.ts`; agreed financial interpreter slice only | Same resolved business input produces equivalent canonical facts; missing/ambiguous project/entity/amount/currency clarifies; no arbitrary derived/provenance writes. Report uncovered natural-language commands honestly. |
| 9 | Local seeded browser acceptance, full regression/CI, final module matrix | Full Budget/CO owner walkthrough, screenshots/read-back/history evidence, no hidden schedule changes; all CI jobs pass at final feature SHA. No deployment/merge. |

Before task 1, turn this approved proposal into exact RED/GREEN command-level tasks
with ledger and final operation/route names. Do not use this sequence to bypass
design approval or improvise unresolved financial semantics.

## 8. Verification and guardrails

Fresh accepted-base targeted verification completed: 204/204 tests across seven
files: Genesis, validation, reducer, project-summary, Scope, Scope routes, Schedule
routes. This is a bounded dependency baseline, not a new full audit. Local Node is
24.19.0; the lockfile/CI require 24.20.0. Do not change the pin to hide that mismatch.
CI at accepted SHA is already green (run 34283564352). The independent audit agent
could not complete because its workspace credit limit was reached; findings here
are the primary agent's source inspection, not a claimed independent approval.

Implementation test gates must cover both root and isolated app/tool configs.
Run the existing `npm run verify` chain in the pinned Linux environment; known
Windows CRLF-sensitive tests are not permission to skip Linux CI or rewrite fixtures.
Keep new POST preview route acknowledgments explicit in
`test/safety/release-gate.test.ts` and
`tools/release-gate/test/extract-routes.test.ts`. Do not weaken gates.

Browser acceptance uses a local isolated staging-configured Worker/D1 seed;
invented test amounts are labeled test data, never written into remote pilot
projects. Remote staging mutation would require separate authorization. Preserve
`jarvis-voice`, `jarvis-voice-staging`, `HOWLER_DB`,
`howler-intelligence-staging`, D1 ID `b1049979-11cc-4faa-9a94-a0f42f9f4f23`,
`HOWLER_ADMIN_KEY`, existing contracts, shadow mode and all false live-system flags.

## 9. Decisions to approve before code

Approve the proposed canonical financial submodel, legacy reconciliation and CO
void/replacement rules. Confirm whether USD-only editing is sufficient for this
pilot, and whether Phase 4 delivers manual management plus tested AI-ready commands
with explicit pending interpreter coverage, or includes full financial conversation
coverage now. These materially affect implementation scope; they are not assumptions
to conceal in code. No feature implementation or Phase 4 completion is claimed yet.
