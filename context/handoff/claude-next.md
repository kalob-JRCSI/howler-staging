# Claude next — paste this as the first Claude Code message

You are Claude Code on `kalob-JRCSI/howler-staging`.

```
git checkout claude/v096-phase4-budget-change-orders
git pull
```

Read `CLAUDE.md`, then `AGENTS.md`, then `context/handoff/current-task.json`. Then do **only** the work below. Push this branch. Stop. Do not merge `main`, deploy, change `HOWLER_MODE`, or activate storage. Do not start Phase 5.

Grok is running a live field-pilot OS in parallel. It is **not** a second canonical model. Do not port its React files. Land the same loop on the Worker: input → validate against canonical project → preview consequence → confirm if consequential → one event → dependents recalculate → History + Dashboard/Overview/Intelligence update → continue from the new state.

## 1. Browser acceptance (isolated local staging config)

Walk through `docs/superpowers/specs/2026-09-09-howler-phase4-requirements-reconciliation.md` against Budget + Change Orders on DeBoard (227 Marengo Dr).

Must hold:

- Original $400,000 + approved CO-001 $12,500 = Revised $412,500
- Pending CO-002 $8,000 is exposure, **not** in Revised
- Plumbing allowance $1,000 vs actual $1,175 → overrun finding, **no auto-CO**
- Approve a pending CO → Revised moves by that amount once
- Declared CO schedule days do **not** rewrite Schedule
- Unknown stays Unknown, never $0
- Manual and Tell Howler hit the same commands
- Carver financials uninitialized → Unknown, not invented numbers

Report what you actually clicked. If a walkthrough fails, fix it on this branch.

## 2. Scope-originated unpriced DRAFT Change Order (Worker)

`ADD_CHANGE_ORDER` already creates `status: "DRAFT"` and accepts `scopeItemIds` + `$0` cost (`src/operator/change-orders.ts`). The **Scope Index Card UI does not offer it**.

Add a **Draft Change Order** control on each Scope item in `src/app/views/indexCard/scope.ts`:

- Preview → confirm (consequential, never clerical auto-apply)
- Title like `Scope change: {item.description}`
- `cost: { amountMinor: 0, currency }` — no fabricated price
- `scopeItemIds: [item.id]`
- `activityIds` from the item’s linked activities if any
- No auto-approval
- Schedule unchanged
- Revised budget unchanged
- Same command Tell Howler can also issue (manual + AI parity)

Reuse existing `previewChangeOrderCommand` / apply-shadow. Do not invent a Scope-only mutation.

## 3. Intelligence: unpriced DRAFT is visible, without breaking PENDING_CO_UNPRICED

Live OS now surfaces `DRAFT_CO_UNPRICED` as its **own** finding kind. Worker tests currently require `PENDING_CO_UNPRICED` **not** to fire for DRAFT $0 (`test/unit/financial-intelligence.test.ts`). Keep that.

Add `DRAFT_CO_UNPRICED` in lockstep:

- `src/operator/financial-intelligence.ts`
- `src/app/types.ts` `FinancialFindingKindLike`
- unit test: DRAFT $0 → `DRAFT_CO_UNPRICED`; PROPOSED $0 still `PENDING_CO_UNPRICED`; priced DRAFT does not fire
- Overview / Budget findings list should show it with a next action: price when known or leave Unknown; propose when ready; approved budget unchanged

## 4. Tests, format, push

- Focused unit + contract tests for Scope → ADD_CHANGE_ORDER and the new finding
- Prettier only files you touch
- Push `claude/v096-phase4-budget-change-orders`
- Comment on https://github.com/kalob-JRCSI/howler-staging/issues/16 with SHA + 14-area matrix
- Do not claim field-pilot ready

## Out of scope

Grok live OS, Phase 5 modules, `main`, deploy, `HOWLER_MODE`, storage, new SQL tables, a second source of truth.
