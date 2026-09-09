# Phase 4: reconciliation of both owner instructions

Status: requirements reconciliation, 2026-09-09. No runtime implementation or
compliance claim. This document corrects the prior audit; it does not replace
either owner instruction.

## Inputs, authority and corrections

1. [Phase 4 Budget + Change Orders directive](2026-09-08-howler-phase4-budget-change-orders-directive.md):
   full owner text preserved verbatim. Defines scope, financial functionality,
   fields, tests, ownership, accepted base and execution discipline.
2. [Universal Data Interaction Contract](2026-09-08-howler-universal-data-interaction-contract.md):
   permanent manual-first, AI-assisted rules for every PM-owned mutable data
   element, including the fields introduced by Phase 4.

Apply both cumulatively. A requirement that applies to all future modules is not
permission to build those modules now. An accepted earlier milestone is not proof
of full Universal Contract compliance. Neither a display nor a shared backend
interface alone proves functional manual or AI interaction.

Corrections incorporated into the capability audit:

- Removed the unrequested USD-only editing restriction. Currency and precision
  must be explicit/validated; no silent currency conversion or defaulting.
- Removed the choice to substitute “AI-ready commands” for the actual AI-assisted
  financial interaction requirement. The plan includes the proposal adapter,
  clarification/confirmation UI and end-to-end tests. Eventual coverage must be
  tracked honestly, not silently dropped or declared complete.
- Made cost code/trade, original/current allowance and status, explicit commitment
  scope/activity associations, and requested/proposed/approved/rejected CO dates
  explicit. They were missing or insufficiently specified in the earlier summary.
- Added originating a DRAFT CO from Scope/Budget, remaining factual intelligence
  conditions, exact summary labels, compact UI requirements, and the acceptance
  walkthroughs below.
- Preserved Claude as authoritative implementer and Codex as bounded support.
  Codex's audit proposes engineering choices; it does not approve a new architecture.
- Distinguished required work from proposed engineering semantics. Legacy spend
  clarification is not full accounting reconciliation and cannot block project
  opening. A nine-task outline is not the detailed implementation plan still owed.

## Combined requirement-to-delivery map

Task numbers refer to the [capability audit's proposed sequence](2026-09-09-howler-phase4-financial-capability-audit.md#7-proposed-implementation-sequence-and-review-gates).
Every row remains to be demonstrated by implementation, not merely documented.

| Required capability from the two instructions | Incorporation / acceptance obligation | Proposed tasks |
| --- | --- | --- |
| Exact accepted base; no main merge or field-pilot deployment | Base `3aed78e2241a06e3b299baec8a73a2b6b8f11277`; isolated Phase 4 branch; feature commits/test/browser/CI evidence; development-build label | All |
| Distinct Budget and Change Orders under Dashboard → Client → Index Card | Replace both placeholders with direct operational workspaces; retain existing navigation architecture | 7, 9 |
| Existing financial/state audit first | Budget, Scope, events, reducer, summary, Genesis, legacy seeds, History and Schedule IDs inspected and cited | Audit, 1–2 |
| No fabricated financial truth | Estimates, commitments, actual costs and payments never inferred from each other; missing is not zero; legacy records still load | 1–6 |
| Deterministic money and explicit currency | Exact minor-unit parsing, checked arithmetic/aggregates, precision/currency validation and property tests; legacy numbers not reinterpreted as cents | 1–4 |
| Project financial summary | Original/baseline, approved adjustment, revised budget, pending exposure, commitments, actual recorded, remaining/uncommitted, factual forecast exposure and coverage/unknown labels | 3, 6–7 |
| Budget line fields | Stable ID, description, editable category/cost code/trade, baseline/revised amount, allowance designation, scope/vendor references, commitments/actuals, notes/status/provenance/history | 2–7 |
| Editable categories | Preserve owner's entire construction starter list as optional defaults; PM can create/edit categories; no imposed accounting taxonomy | 2–4, 7–8 |
| First-class allowances | Original allowance, scope, selection/category, known selected/expected and actual cost, remaining/overage/status; one canonical amount across Scope/Budget | 2–8 |
| Commitments | Add/edit/correct/deactivate; line/scope associations, optional known vendor/trade ID and Schedule association, amount/PO/reference/status; totals counted once | 2–8 |
| Actual costs | Manual and assisted recording/correction: amount/date/description/line/optional commitment/source/reference/notes; no payment processing or claim of accounting reconciliation | 2–8 |
| CO complete record and lifecycle | ID/number/title/description/reason/status/cost/declared schedule impact/scope/activity/category-line/client approval/dates/notes/provenance; document references later | 2–8 |
| Approved versus pending/rejected CO | Only approved impacts enter revised budget; pending stays separate; exact-once approval; explicit auditable reject/void/correction; original evidence preserved | 3–5, 7–9 |
| Scope and Schedule associations | Scope can originate/associate a CO; no auto-approval or invented price; declared schedule impact is distinct from separately authorized Schedule modification | 4–9 |
| Direct PM controls for every owned financial field | Manual view/create/edit/correct/deactivate where applicable; no conversation-only records; reload persistence | 4, 7, 9 |
| AI-assisted operations for the same data | Interpret → resolve project/entity/field → validate → clarify → consequences → preview → confirm → canonical apply → verify → synchronize; actual adapter and UI tests | 4–5, 8–9 |
| One canonical state and protected values | No AI-only state; history append-only, evidence versioned, originals preserved; derived forecasts/risks/integrity and trusted provenance not directly overwritable | 2–9 |
| Proportionate confirmation | Baseline, approval/void, significant commitments and material actual changes explicitly confirmed; harmless text can be lighter but auditable; no keystroke theater | 4–5, 7–9 |
| Every relevant dependent surface synchronizes | Financial views, Scope associations, factual Schedule dependencies, forecast, Overview, priority/risk views and History derive from the accepted revision; failures/stale responses visible | 5–9 |
| Factual intelligence only | Allowance/line overruns, uncovered Scope/lines/costs, known uncommitted costs, explicit critical-activity links, priced/unpriced CO exposure; each observation links to actual structured facts | 3, 6–9 |
| Project isolation | Validate every relationship in its project; Carver→DeBoard Scope and DeBoard→McMillan Schedule denied; no cross-project stale-response leakage | 2, 4–5, 7–9 |
| Full owner walkthrough and regression discipline | Budget and CO sequences below; unit/property/contract/D1/browser tests; all configured CI gates; task-scoped commits | All |
| Storage direction versus Phase 4 scope | Hybrid accepted only as architecture; future justified D1 file projections allowed; no Phase 4 storage activation/credentials/buckets or storage migrations | All |

## Mandatory browser acceptance: Budget

Use a real canonical seed in an isolated local staging-configured environment;
test amounts are explicit test data, not invented remote project facts.

1. Login → Dashboard → select project → Index Card → Budget.
2. See known financial state with honest missing/unknown labels and currency.
3. Create line → associate a real Scope item → enter baseline → mark allowance
   → preview/confirm/save → reload and verify canonical persistence.
4. Add commitment → reload → record actual cost → verify exact totals, History
   entries, and only relevant Overview changes.
5. Demonstrate $1,000 allowance versus $1,175 selected cost gives -$175 variance
   and no automatically created CO. Test committed amount above known line budget.
6. Test missing data, direct edit/correction/deactivation, stale revision, invalid
   money and currency precision, cross-project associations, and failed refresh.
7. Repeat equivalent financial entries through the real AI-assisted PM control:
   interpret, resolve, clarify if needed, preview, correct/defer/cancel/confirm,
   then verify the same canonical business state and synchronized views. Include
   duplicate confirmation, uncertain delivery, and protected-field refusal.

## Mandatory browser acceptance: Change Orders

1. On the same project, open Change Orders → create DRAFT → add description →
   associate existing Scope → enter positive cost and declared schedule impact.
2. Move to PROPOSED/PENDING_APPROVAL. Verify approved budget is unchanged.
3. Approve explicitly. Verify revised budget changes exactly once; reload; verify
   History and relevant Overview exposure clears or changes.
4. Reject a separate CO and verify it has no approved-budget effect. Exercise
   explicit void/reversal and correction with preserved history.
5. Demonstrate baseline $400,000 + approved $12,500 = approved $412,500, with
   pending $8,000 still separate, never an approved $420,500.
6. Demonstrate cabinetry CO +$6,800 with declared +14-day lead time leaves
   activities/dependencies/locks unchanged until separately confirmed Schedule
   workflow. Test Scope-originated DRAFT CO without fabricated price/approval.
7. Exercise the same CO operations via AI proposals and verify canonical parity,
   ambiguity refusal, confirmation binding, exact-once persistence and dependent
   view synchronization. No Schedule rewrite from prose alone.

## Required final 14-area report

This is a reporting template, not a declaration of implemented status. Final
report must supply actual status, manual capability and AI coverage/evidence for
each row. “Pending” never means FUNCTIONAL under the complete contract.

| Product area | Phase 4 obligation / limit |
| --- | --- |
| Overview | Relevant financial summary, risks and dependent refresh |
| Schedule | Preserve manual/canonical controls; CO prose cannot mutate it |
| Scope | Budget/allowance/CO associations share canonical facts |
| Plans | No implementation; future metadata controls and versioned evidence contract retained |
| Photos | No implementation; future editable metadata with preserved originals |
| Budget | Full required financial management, manual and safe AI-assisted paths |
| Documents | No implementation; future metadata controls and retained evidence contract retained |
| Change Orders | Full required management/lifecycle, manual and safe AI-assisted paths |
| Selections | No module implementation; allowance selection metadata only |
| Trades / Vendors / Contacts | No module implementation; real optional stable references only |
| Materials / Procurement | No module implementation; contract's delivery example remains a future requirement |
| Inspections / Permits | No module implementation; contract's synchronization example remains a future requirement |
| Activity / History | Append-only financial events; corrections add events |
| Howler Intelligence | Factual traceable derived findings, not direct edits or generic filler |

## Boundaries and execution handoff

Do not implement R2, Drive, Plans, Photos, Documents, full accounting, invoice OCR,
payments, QuickBooks, vendor/selection/procurement modules, deeper plan/photo AI,
or production deployment. Do not casually add mutations/tables, but do not force
financial records into the old three-field object merely to avoid a justified
schema design. Preserve shadow mode, all false live-system flags, identifiers,
bindings, secrets, API contracts and staging architecture.

Claude remains authoritative implementer; bounded Codex review/test support must
not block progress if unavailable. The next artifact is the detailed implementation
plan derived from this reconciliation and the capability audit. The current audit
outline is not that plan. This correction pass changes documentation only; no
application code, push, merge, deployment or external activation occurs.
