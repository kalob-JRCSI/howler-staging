# Howler Recovery — Handoff (Claude → Codex)

Written because the Claude session that did this work ran low on usage mid-task.
This is a cold-start briefing: read this fully before touching code.

## Who is directing this work

The user (repo owner) is running a formal, phased recovery of the Howler product
after rejecting an earlier pilot as unusable. Each phase follows the same
discipline: **audit existing code first → produce a written plan → implement →
verify locally → browser-test for real → commit → push → wait for CI → report**.
Do not skip the audit/plan step on future phases — the user explicitly requires
it before "substantial implementation."

**Governance rules that apply to all future work, not just this phase:**

- The Dashboard → Project Index Card → Modules architecture is **frozen**. Do not
  reinterpret it. The 14 functional areas (13 modules + Howler Intelligence) are
  fixed; see the module-completion matrix below.
- No second source of truth, ever. Every new feature extends the _existing_
  event-sourced `ProjectModelV094` (one JSON blob per project in D1's `projects`
  table) through the _existing_ reducer/mutation/event-ledger pipeline. Never a
  new SQL table, never a parallel state store.
- Manual PM controls are mandatory; AI/intelligence is additive, never a
  substitute. Every module needs direct edit UI, not just conversational commands.
- Never claim "pilot ready." This is explicitly a development milestone at every
  phase. Say so in every completion report, and always report the exact
  module-completion matrix (see below) — never a vague total.
- Preserve the safety architecture: edit → preview (shows real consequence) →
  explicit confirm → apply → canonical event recorded → re-forecast → history
  updated. Ceremony should scale with consequence (clerical text edits can
  auto-apply after preview; anything materially consequential needs an explicit
  Confirm click) but the event/audit trail is never skipped.
- Do not fabricate data. Any field the canonical model doesn't have comes back
  `null`/"Unknown" — never guessed.
- Codex is the supporting engineer for bounded delegated work; whoever is
  "Claude" in this loop is the authoritative implementer responsible for
  architecture, integration, and final decisions. In practice, for this session,
  no live Codex/Claude peer was reachable, so all audits and implementation were
  done directly — that's now flipped: **you (Codex) are the one continuing this
  work**, so you inherit the "authoritative implementer" responsibilities too.

## Module completion matrix (current, as of this handoff)

| Module                      | Status                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                    | FUNCTIONAL                                                                                                                                                                                                                                                                                                                                     |
| Schedule                    | FUNCTIONAL                                                                                                                                                                                                                                                                                                                                     |
| Scope                       | FUNCTIONAL (implementation done, **CI not yet green — see blocker below**)                                                                                                                                                                                                                                                                     |
| Plans                       | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Photos                      | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Budget                      | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Documents                   | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Change Orders               | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Selections                  | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Trades / Vendors / Contacts | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Materials / Procurement     | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Inspections / Permits       | PLACEHOLDER                                                                                                                                                                                                                                                                                                                                    |
| Activity / History          | FUNCTIONAL                                                                                                                                                                                                                                                                                                                                     |
| Howler Intelligence         | PARTIAL — real CPM solver output surfaced in Overview/Schedule (priority actions, protection actions, critical path/float); Scope adds 4 factual observations (no-schedule-activity, added-after-baseline, complete-but-activity-incomplete, unscoped-activity). No new algorithms added. Not cross-cutting into modules that don't exist yet. |

## Branch map

- `claude/v096-phase1-dashboard-recovery` — Phase 1, merged conceptually accepted,
  CI green at `cb0dc9e`. Real Dashboard→Index Card navigation, Overview, Activity
  History, honest placeholders for everything else.
- `claude/v096-phase2-editable-schedule` — Phase 2, accepted, CI green at
  `67d9e58`. Full editable Schedule module.
- `claude/v096-phase3-scope-workspace` — Phase 3, **implementation complete,
  pushed, but CI is currently RED**. This is where you pick up. Latest commit:
  `1df4561` ("feat: Phase 3 - Functional Project Scope Workspace").

Each phase branch was created via `git worktree add .worktrees/<name> -b
claude/<branch> origin/<previous-phase-branch>` — i.e., branched from the tip of
the previous accepted phase, not from `main`. Follow the same pattern for
Phase 4: branch from `origin/claude/v096-phase3-scope-workspace` once its CI is
green.

## Immediate blocker — fix this first

CI run for commit `1df4561` on `claude/v096-phase3-scope-workspace` failed at
the **"Format check"** step (`npm run format:check` → `prettier --check .`),
before Lint/Typecheck/Test even ran (they show as "skipped" because the
`&&`-chained verify job stops at the first failure).

This is a **real** failure, not the known pre-existing Windows-CRLF-checkout
artifact that's been showing up locally all session (CI runs on Linux with LF
checkout, so if prettier fails there, a real file has real formatting
problems). One of the Phase 3 files almost certainly has a formatting issue
that slipped past local verification — likely because it was edited _after_ the
last local `prettier --write` pass on it, or a file wasn't included in one of
the targeted `prettier --write <file list>` calls during the session (multiple
new/changed files were formatted individually rather than via `prettier --write
.`, so it's easy for one to have been missed after a later edit).

**To fix:**

1. `cd` into the `v096-phase3-scope-workspace` worktree (or check it out fresh).
2. Run `npx prettier --write .` — but **do not** blindly commit the result: this
   repo has a known, pre-existing, Windows-only CRLF checkout issue that makes
   ~211 _unrelated, untouched_ files also show as failing `prettier --check .`
   locally (confirmed harmless — they fail identically on the clean parent
   commit before any of this session's work, and CI itself is LF/Linux so it
   never sees this). So: run `git status --short` after `prettier --write .`
   and **only stage the files that are part of this branch's actual diff**
   (check `git diff origin/claude/v096-phase2-editable-schedule --stat` to see
   the real file list, currently 20 files — see the Phase 3 commit message for
   the full list). Revert everything else with `git checkout -- <file>` before
   committing.
3. Commit as a small follow-up fix (e.g. `fix: prettier formatting on Phase 3
scope files`), push, and re-watch CI. Once "Format check" passes, confirm
   Lint / Typecheck / Test / etc. all pass too (they were never reached yet, so
   don't assume they're clean — though local runs earlier in the session were
   all green with the same content, so this should just be the one formatting
   fix).
4. Once CI is fully green, do the real browser acceptance walkthrough one more
   time if anything changed (it shouldn't have — this is a pure formatting fix)
   and then report Phase 3 complete to the user, using the module-completion
   matrix above and explicitly stating this is a development milestone.

## What Phase 3 actually built (Scope module)

Full design rationale is in the Phase 3 commit message (`git log -1` on
`1df4561`) and in the code comments themselves — both are thorough. Summary:

- `src/domain/types.ts`: new `scopeItems?: Record<string, ScopeItemV096>` map on
  `ProjectModelV094`, deliberately separate from the existing (frozen, never
  mutated) `projectProfile.baselineScope`. Two new mutation ops:
  `UPSERT_SCOPE_ITEM`, `DEACTIVATE_SCOPE_ITEM` (same pattern as the existing
  `UPSERT_DEPENDENCY`/`DEACTIVATE_DEPENDENCY`).
- `src/operator/scope.ts`: `buildScopeView` (read model, merges baseline +
  current, lazily materializes untouched baseline items, computes 4 factual
  insights) and `buildScopeEvent` (11 typed commands → canonical events).
  Reuses the exact convention `buildProjectFromGenesis` already establishes —
  a Genesis-created scope item and its originating activity share the same id
  — to auto-associate schedule activities for free where that convention holds.
- `src/operator/project-summary.ts`: now also computes `blockedScopeItems` and
  `scopeAddedAfterBaselineCount` for Overview sync. `progressPercent` is
  deliberately left untouched by scope (don't blend the two).
- New routes in `src/worker/index.ts`: `GET /v1/projects/:id/scope`,
  `POST /v1/projects/:id/scope/commands/preview`. Apply reuses the _existing_
  `POST /v1/projects/:id/events/apply-shadow` route verbatim — no new apply
  path. Both added to `src/worker/entry.ts`'s `isProductOperatorRoute`
  allowlist.
- `src/app/views/indexCard/scope.ts`: the frontend module. Table + phase/trade
  filters + expandable detail rows with inline edit forms. Clerical edits
  (rename, re-phase, re-trade, vendor, notes) auto-apply after preview with no
  confirmation click; everything else shows the full preview→consequence→
  confirm flow. The backend's preview response carries a `clerical: boolean`
  flag so the frontend never duplicates that list.
- Two safety-gate test files needed updating for the new mutation route
  (`test/safety/release-gate.test.ts` and
  `tools/release-gate/test/extract-routes.test.ts` both hand-maintain an
  `ACCEPTED_MUTATION_ROUTES` allowlist — **any future new POST route will need
  the same acknowledgment in both files**, with a comment explaining why it's
  not a new mutation mechanism). Same for `test/unit/validation.test.ts`'s
  frozen mutation-op-count exhaustiveness test if you ever add another new
  `EventMutationV094` variant.

All of this was verified locally (lint, typecheck, full test suite, isolated
`src/app` lint/typecheck/test, `cf-typegen:check`, `build:dry`) and via a real
browser session against the seeded `deboard-v091` project: add scope item →
reload persists → associate with a real schedule activity → status change →
reload persists both → Schedule module shows the activity untouched → Activity
History records all 5 changes in order → Overview shows "1 scope item added
after baseline" → Dashboard resyncs. Also browser-verified: allowance
recording, exclusion preview (cancelled, not confirmed), and non-destructive
deactivation (item disappears from the view but its full history remains in
Activity/History). Stale-revision-conflict and invalid-activity-association are
covered by contract tests (`test/contract/scope-routes.test.ts`); project
isolation is structural (no shared state exists to leak across projects) and
covered by a two-project contract test in the same file.

**None of this local/browser verification is in doubt** — the CI failure is
just a formatting gate, not a functional regression. Don't re-derive the design
or re-do the browser walkthrough from scratch; just fix the format check and
confirm the rest of CI passes.

## Known pre-existing, NOT-your-problem issues

Two things will show up locally on Windows and are **not** real bugs — do not
"fix" them by changing repo config, and do not waste time chasing them:

1. `test/safety/repository-policy.test.ts`'s `"ci.yml's pull_request trigger
has no branch restriction"` test fails locally on Windows due to a CRLF
   checkout mismatch in `.github/workflows/ci.yml` (the file itself is
   untouched; git checks it out with CRLF on Windows, the test's regex
   expects LF). Passes fine in real CI (Linux/LF). Confirmed present
   identically on the clean Phase 1 and Phase 2 baselines before any Phase 3
   work.
2. `tools/context-pack/test/select.test.ts`'s budget-pruning test
   (`"prunes lower-priority-tier entries first..."`) fails locally on Windows
   for the same CRLF-byte-count-sensitivity reason (its fixture files have
   CRLF line endings on Windows, shifting a byte-budget threshold). Also
   confirmed pre-existing on the clean Phase 1 baseline.
3. Running `npm run test:context-pack` also has a **side effect**: one of its
   tests (`baseline-report.test.ts`) legitimately _rewrites_
   `tools/context-pack/test/fixtures/baseline-vs-routed-report.json` with
   fresh real-repo measurements every time it runs. This is intentional
   (a snapshot-report mechanism), but don't accidentally commit that
   regenerated file as part of an unrelated change — `git checkout -- ` it
   before committing unless you're deliberately updating that baseline number.
4. If you ever run the app locally with `wrangler dev` and create a
   `.dev.vars` file for a pilot username/password/secrets, **remove it (or
   move it aside) before running `npm run cf-typegen:check`** — `wrangler
types` will pick up those local-only secrets and regenerate
   `worker-configuration.d.ts` with extra bogus Env fields, which then looks
   like a real binding-drift failure but isn't. `git checkout --
worker-configuration.d.ts` to discard if this happens.
5. Every worktree needs its own `npm ci` — `node_modules` is not shared
   across worktrees, and if you skip this, commands silently fall back to
   whatever's in a _different_ worktree/checkout up the directory tree
   (Node's module resolution walks up), which can be a stale/wrong dependency
   set. Always run `npm ci` fresh in a new worktree before trusting any
   lint/test/build result from it.

## What's next after Phase 3 is CI-green

The user's Phase 3 directive also asked for a **Drive vs R2 vs Hybrid file-
architecture recommendation** (for the future Plans/Photos/Documents modules),
explicitly "owed before Phase 3 closes" but **not authorized for
implementation** — it's a decision document only, no code. This was **not
finished** — the Claude session was mid-draft (had confirmed there's currently
zero R2 binding and zero Drive integration in the codebase, and had sketched
the recommendation but not written or published it) when usage ran out.

**You need to produce this before reporting Phase 3 fully closed.** Rough shape
of the analysis already worked out (feel free to refine, but this is a solid
starting point grounded in the actual codebase):

- **Photos → R2-native, always.** Captured fresh in the field, never
  "co-edited," Howler benefits from controlling bytes directly (thumbnailing,
  EXIF, direct AI-vision indexing against scope items), least likely to
  already exist in a client's Drive.
- **Plans → Drive-first reference, optional R2 mirror.** Plan sets are usually
  produced externally by an architect/engineer and often already live in a
  shared Drive folder before a PM ever opens Howler. Store a `driveFileId` +
  cached metadata, don't duplicate bytes into R2 unless the PM explicitly asks
  for an offline/pinned copy.
- **Documents → hybrid by lifecycle stage.** A draft proposal/contract still
  being negotiated benefits from Drive's live co-editing (reference it). Once
  _executed_ (signed), pull an immutable copy into R2 as the authoritative
  record — a signed contract is a fact that gets locked in, matching the
  event-sourced philosophy, not a live pointer that could silently change.
- **Cross-cutting metadata layer**: one canonical `FileRefV097`-shaped record
  per file regardless of where bytes live (`storage: "DRIVE"|"R2"`,
  `driveFileId?`, `r2Key?`, category, associated scope/activity ids, sourceId)
  — this is exactly why Phase 3's `ScopeItemV096.planDocumentRefs` field
  already exists as an empty-for-now, forward-compatible placeholder. Extend
  that pattern, don't invent a second one.
- **Permissions**: recommend a Howler-managed _service account_ for Drive
  access (Howler fetches server-side, gates through its own existing session
  model) over per-user OAuth — matches the exact "server holds the secret,
  browser never does" pattern already established for `HOWLER_ADMIN_KEY`.
- **Revisions**: R2 files get explicit version events in the canonical event
  ledger (same event-sourced pattern as everything else); Drive files rely on
  Drive's own native revision history — don't reimplement it.
- **AI indexing**: R2 content is directly indexable on Howler's own schedule;
  Drive content needs an explicit sync job (nightly or on-demand), never
  assumed real-time.
- Explicitly state in the delivered doc: **no R2 bucket created, no Drive API
  credentials exist, no implementation code written** — this is the user's
  decision to make, not something authorized yet.

Format: this is a good candidate for a proper published document (the previous
session was about to build it as a designed reference page) rather than just
chat text, since it's a real decision artifact the user may want to keep or
share. Use good judgment on format if you don't have the same tooling
available.

## Reporting back to the user

When Phase 3 is fully done (CI green, Drive/R2 doc delivered), report using the
exact module-completion-matrix format the user specified (see table above) —
they were explicit that vague totals aren't acceptable. Reaffirm this is a
development milestone, not field-pilot readiness, and name what's still
PLACEHOLDER. Then wait for their direction on what's next (likely Phase 4 on
one of the remaining placeholder modules, or Plans/Photos/Documents once the
Drive/R2 decision is made).
