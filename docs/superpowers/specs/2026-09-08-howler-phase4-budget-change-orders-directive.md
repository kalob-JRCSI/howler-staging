# Phase 4 Budget + Change Orders — owner directive

Authoritative owner instruction, preserved verbatim below. Read together with
`2026-09-08-howler-universal-data-interaction-contract.md`, which adds permanent
manual-first, AI-assisted requirements. Neither document replaces the other.
Derived audits/plans cannot narrow either instruction without explicit approval.

---

Claude,

Phase 3 — Project Scope Workspace — is accepted as a **development milestone**.

Verified baseline:

Branch:
`claude/v096-phase3-scope-workspace`

Accepted head:
`3aed78e2241a06e3b299baec8a73a2b6b8f11277`

CI run:
`34283564352`

Proceed by branching Phase 4 from this accepted Phase 3 head.

Do not merge to `main`.

Do not deploy as a field pilot.

# STORAGE ARCHITECTURE DECISION

The lifecycle-based hybrid recommendation is accepted as the architectural direction:

* Photos: Howler-native private R2 storage for new field captures.
* Plans: Google Drive working references, with explicit retained snapshots for issued/approved revisions when durable evidence is needed.
* Documents: Google Drive while collaborative/draft; retained snapshot when explicitly executed/final.
* Canonical project events/metadata remain authoritative for project associations, approval state and provenance.

This is **architecture approval only**.

Do not activate R2, Drive credentials, buckets, migrations or storage implementation during Phase 4.

Also, do not treat the recommendation's current “no new D1 table” language as an immutable implementation constraint. The event/canonical model remains authoritative, but a future implementation may use dedicated D1 projection/read tables for file/version metadata if the file-module audit demonstrates that is safer and cleaner.

Storage implementation still requires its own approved phase.

---

# PHASE 4 — BUDGET + CHANGE ORDERS

Howler must now become capable of answering one of the most important PM questions:

**What is this project supposed to cost, what have we committed, what has changed, and where are we financially exposed?**

The existing one-line budget display is rejected as sufficient functionality.

This phase builds two tightly related project modules:

1. **Budget**
2. **Change Orders**

They must operate together but remain conceptually distinct.

Budget = project financial control.

Change Orders = approved/proposed changes to scope, cost and potentially schedule.

---

# BUDGET PRODUCT PURPOSE

Inside:

Dashboard
→ Client
→ Index Card
→ Budget

the PM must be able to understand the financial position of that specific project.

The Budget should answer:

* What was the original budget?
* What is the current/revised budget?
* How much is committed?
* How much actual cost has been recorded?
* What allowances remain?
* What approved changes changed the budget?
* What pending changes create exposure?
* Which trades/scope areas are over or under expectation?
* Which scope has no financial coverage?
* Which known costs have not yet been committed?

Do not turn this into full accounting software.

Howler is a construction PM system, not QuickBooks.

---

# FINANCIAL TRUTH RULE

Financial data must be treated as high-integrity information.

Never infer cost simply because a scope item or schedule activity exists.

Never convert an estimate into an approved commitment without explicit action.

Never convert a commitment into an actual cost merely because work completed.

Never mark something paid because an invoice or cost exists.

Unknown remains unknown.

All money calculations must be deterministic and testable.

Use a safe money representation such as integer cents/minor currency units internally rather than floating-point arithmetic.

Currency must be explicit.

---

# REQUIRED BUDGET STRUCTURE

Audit the existing `ProjectBudgetV096` first and extend rather than blindly replacing it.

At minimum, Howler needs the conceptual ability to represent:

## Project-level totals

* Original/baseline project budget
* Approved change-order adjustment
* Current/revised budget
* Pending change exposure
* Committed cost
* Recorded actual cost
* Remaining uncommitted budget
* Forecast exposure where factually supported

## Budget line / cost category

Each meaningful budget line should support where applicable:

* ID
* Description
* Category / cost code / trade
* Baseline amount
* Revised amount
* Allowance designation
* Associated scope item(s)
* Associated trade/vendor reference when available
* Commitment amount
* Recorded actual amount
* Notes
* Status
* Source/provenance
* Created/updated history

Do not fabricate vendor relationships before the Trades/Vendors module exists.

Use stable optional IDs so those relationships can be added later.

---

# BUDGET CATEGORIES / COST CODES

Do not hardcode an overcomplicated accounting cost-code system.

Support useful construction organization such as:

* General Conditions
* Sitework
* Concrete
* Masonry
* Framing
* Roofing
* Windows / Doors
* Electrical
* Plumbing
* HVAC
* Insulation
* Drywall
* Paint
* Flooring
* Tile
* Cabinetry
* Countertops
* Glass
* Trim / Finish Carpentry
* Fixtures / Selections
* Landscaping
* Other

But the PM must also be able to create/edit categories.

Do not lock Howler to this exact list.

---

# ALLOWANCES

Allowances are first-class budget concepts.

An allowance should be able to represent:

* Original allowance amount
* Related scope
* Selection/category
* Current expected or selected cost when known
* Actual cost when recorded
* Remaining allowance / overage
* Status

Example:

Carpet allowance: $1,000
Selected carpet: $1,175

Howler can truthfully show:

Allowance variance: **-$175 / $175 over allowance**

It should NOT automatically create a client change order unless the PM initiates that process.

---

# COMMITMENTS

A commitment represents cost the project has actually committed to a vendor/trade/order.

Examples:

* Signed subcontract
* Approved vendor quote
* Purchase order
* Confirmed material order where company policy considers that committed

The PM must be able to:

* Add commitment
* Edit commitment
* Associate it with budget line(s)
* Associate it with scope item(s)
* Add vendor/trade identifier where known
* Enter amount
* Enter reference/PO number where applicable
* Change status
* Deactivate/correct erroneous records audibly
* View total committed

Do not automatically interpret every estimate as a commitment.

---

# ACTUAL COSTS

For this phase, Howler needs at least a controlled way to manually record known actual costs.

Examples:

* Invoice received
* Material receipt/cost
* Final subcontract cost

Do not build payment processing.

Do not pretend this is accounting reconciliation.

Support:

* amount
* date
* description
* related budget line
* related commitment where applicable
* source/reference
* notes

Later financial/accounting integrations may supersede or enrich this.

---

# CHANGE ORDERS

Change Orders require a dedicated module:

Dashboard
→ Client
→ Index Card
→ Change Orders

A Change Order should support at minimum:

* CO ID / number
* Title
* Description
* Reason
* Status
* Cost impact
* Schedule impact where known
* Related Scope item(s)
* Related Schedule activity/activities
* Related budget category/line
* Client approval state
* Requested/proposed date
* Approved/rejected date when applicable
* Notes
* Supporting-document references later
* Event/history provenance

---

# CHANGE ORDER LIFECYCLE

Use an explicit lifecycle.

A reasonable initial model:

* DRAFT
* PROPOSED
* PENDING_APPROVAL
* APPROVED
* REJECTED
* VOID

If existing architecture suggests slightly different names, document the reasoning.

An APPROVED change order may affect the revised budget.

A pending/proposed change order does **not** silently become approved budget.

Show it separately as financial exposure.

Example:

Original budget: $400,000
Approved COs: +$12,500
Current approved budget: $412,500
Pending CO exposure: +$8,000

Do not report $420,500 as the approved budget.

---

# CHANGE ORDER ↔ SCOPE

This is why Scope came first.

A material scope change should be able to originate or associate with a Change Order.

Example:

Scope adds:
"Upgrade porch ceiling to stained tongue-and-groove."

Howler should be able to recognize:

* baseline scope did not contain this item
* new scope exists
* financial impact may need determination
* potential Change Order exists/is needed

Do not automatically generate an approved CO.

Howler may recommend:

> New scope is not represented in the approved budget. Review for Change Order.

That is useful PM intelligence.

---

# CHANGE ORDER ↔ SCHEDULE

A Change Order can also create schedule impact.

Example:

Added custom cabinetry:
+ $6,800
Potential +14-day lead time.

Howler should allow a CO to reference affected Schedule activities.

If the PM explicitly approves a schedule adjustment, it should use the canonical Schedule event workflow.

Do NOT silently mutate the schedule merely because a CO says "+14 days."

Distinguish:

**declared schedule impact**

from

**applied schedule modification**

---

# BUDGET ↔ SCOPE

A Budget line should be able to associate to one or more Scope items.

This enables Howler to identify future conditions such as:

* scope with no budget coverage
* budget line with no scope
* allowance associated with scope
* approved CO affecting scope
* commitment attached to wrong scope/trade

Implement only observations that can be supported reliably by actual structured data.

---

# BUDGET ↔ SCHEDULE

Do not tightly couple every dollar to a Schedule activity.

But optional associations should be possible where operationally useful.

Examples:

Roof package commitment
→ Roofing activity

Concrete commitment
→ Foundation/slab activity

This allows future intelligence such as:

> Roofing is scheduled to begin, but the related material commitment is still unconfirmed.

Do not over-engineer this relationship in Phase 4.

---

# DIRECT PM CONTROLS

Budget cannot be conversation-only.

PM must be able to directly:

* Add/edit/deactivate budget line
* Set baseline amount
* Set/revise category
* Mark allowance
* Associate scope
* Add commitment
* Edit commitment
* Record actual cost
* Add Change Order
* Edit Change Order
* Change CO lifecycle state
* Approve/reject/void CO through explicit control
* Enter cost impact
* Enter declared schedule impact
* Associate CO to Scope/Schedule/Budget
* Reload and see all state persist

---

# CONSEQUENCE / CONFIRMATION MODEL

Financial changes are consequential.

Use the established pattern where appropriate:

edit
→ preview
→ show consequence
→ confirm
→ canonical apply
→ recompute financial summary
→ update Overview/History/Intelligence

Examples requiring explicit confirmation:

* changing baseline budget
* approving Change Order
* voiding an approved Change Order
* recording significant commitment
* materially altering an actual cost

Minor note/text correction can use lighter handling while remaining auditable.

Do not create confirmation theater for every keystroke.

---

# FINANCIAL SUMMARY

The Budget module should clearly show a concise PM summary at the top.

Example conceptually:

Original Budget
Approved Changes
Current Budget
Committed
Actual Recorded
Pending CO Exposure
Remaining / Uncommitted

The exact visual design is Claude's responsibility, but it should be easy to read in seconds.

Avoid giant typography and excessive cards.

This is an operational construction interface.

---

# DASHBOARD / OVERVIEW SYNCHRONIZATION

Do not overload the portfolio Dashboard with accounting data.

At project level, Overview should surface financial information only when relevant:

Examples:

* Budget exposed
* Allowance exceeded
* Large pending CO
* Critical scope has no commitment
* Cost unknown for newly added scope

Dashboard should surface financial risk when it actually requires PM attention.

It does not need the entire Budget module duplicated on the Dashboard.

---

# HOWLER INTELLIGENCE — PHASE 4

Use structured financial truth to begin expanding intelligence.

Supported examples where data exists:

* allowance overrun
* scope item without associated budget coverage
* budget line with no commitment as work approaches
* approved scope change lacking Change Order
* pending CO with schedule-critical scope
* actual cost above revised budget line
* commitment exceeds budget line
* major cost record lacking scope association

Do not produce generic financial warnings merely to populate an Intelligence screen.

Every finding must be traceable to real canonical facts.

---

# ACTIVITY / HISTORY

Financial changes must appear in Project Activity.

Examples:

* Electrical commitment added: $14,500
* Carpet allowance revised: $1,000
* Change Order 004 proposed: +$6,800
* Change Order 004 approved
* Project approved budget changed $400,000 → $406,800
* Actual countertop cost recorded: $5,250

No invisible financial mutation.

---

# BACKWARD COMPATIBILITY

Existing seeded/legacy projects may have only:

`baseline`
`spent`
`currency`

They must continue loading.

Do not require every project to migrate manually before its Index Card opens.

Create backward-compatible defaults and explicit UNKNOWN/EMPTY states.

Never turn missing historical data into zero unless zero is factually known.

Missing ≠ $0.

---

# PROJECT ISOLATION

Every financial object must be project-scoped.

A Carver budget line cannot be associated with a DeBoard scope item.

A DeBoard CO cannot affect McMillan Schedule.

Test cross-project association denial explicitly.

---

# ACCEPTANCE TEST — BUDGET

Use a real staging/seed project.

1. Login.
2. Dashboard.
3. Select project.
4. Open Budget.
5. See current known financial state.
6. Create a budget line.
7. Associate it with a Scope item.
8. Enter baseline amount.
9. Mark it as an allowance.
10. Save/confirm.
11. Reload.
12. Confirm persistence.
13. Add commitment.
14. Reload.
15. Record actual cost.
16. Verify correct totals.
17. Verify Activity History.
18. Verify Overview only changes where relevant.

Then test:

* over-allowance condition
* commitment greater than line budget
* missing value/unknown handling
* deactivation/correction
* stale revision
* invalid money input
* cross-project association rejection

---

# ACCEPTANCE TEST — CHANGE ORDER

On the same staging project:

1. Open Change Orders.
2. Create CO in DRAFT.
3. Add description.
4. Associate existing Scope item.
5. Enter +cost impact.
6. Enter declared schedule impact.
7. Move to PROPOSED/PENDING_APPROVAL.
8. Verify approved project budget has NOT changed.
9. Approve CO explicitly.
10. Verify approved/revised budget changes exactly once.
11. Reload and confirm persistence.
12. Verify History.
13. Verify relevant Overview financial exposure clears/changes.
14. Reject a separate test CO and verify it does not affect approved budget.
15. Test void/reversal behavior according to the designed accounting semantics.

Also test that approving the CO does not silently rewrite Schedule activities.

---

# DATA MODEL AUDIT FIRST

Before substantial implementation:

Inspect:

* existing `ProjectBudgetV096`
* Scope V096 structures
* ProjectEvent mutation model
* reducer compatibility
* project-summary budget logic
* Genesis budget behavior
* seeded legacy projects
* Activity History
* Schedule association identifiers

Produce a concrete Phase 4 data/backend capability audit.

Then present the implementation plan.

Do not create new tables/mutation ops casually.

But unlike Scope, do not force a complex financial subsystem into an obviously inadequate three-field object simply to avoid a migration.

Choose the cleanest architecture that preserves:

* canonical truth
* event history
* backward compatibility
* project isolation
* deterministic money arithmetic

---

# MODULE MATRIX AFTER PHASE 4

Report all 14 explicitly:

Overview
Schedule
Scope
Plans
Photos
Budget
Documents
Change Orders
Selections
Trades / Vendors / Contacts
Materials / Procurement
Inspections / Permits
Activity / History
Howler Intelligence

No aggregate count without the actual table.

---

# WHAT IS NOT AUTHORIZED IN PHASE 4

Do not implement:

* R2
* Google Drive integration
* Plans
* Photos
* Documents
* full accounting integration
* invoice OCR
* payment processing
* QuickBooks integration
* vendor module
* selections module
* procurement module
* deeper AI plan/photo analysis
* production deployment

Stay on Budget + Change Orders.

---

# CODEX SUPPORT

Claude remains authoritative implementer.

If Codex is available, delegate bounded work such as:

* financial model regression audit
* money-arithmetic/property tests
* cross-project isolation test matrix
* legacy budget compatibility review
* Change Order lifecycle test review

Codex does not redefine the architecture.

If unavailable, do not block.

---

# DEFINITION OF PHASE 4 DONE

Budget is no longer a placeholder.

Change Orders is no longer a placeholder.

The PM can manage both directly.

Financial arithmetic is deterministic.

Baseline/current/pending values are distinguishable.

Allowances work.

Commitments work.

Recorded actual costs work.

Change Order lifecycle works.

Approved COs affect revised budget exactly once.

Pending/rejected COs do not affect approved budget.

Scope associations work.

Schedule associations do not silently mutate Schedule.

Financial changes are in History.

Relevant risks reach Overview/Intelligence.

Legacy projects still load honestly.

Project isolation is enforced.

Browser acceptance passes.

CI passes.

Final report still calls Howler a **development build**, not a field-ready pilot.

Proceed with the Phase 4 capability audit and implementation plan, then execute under the established branch/test/browser/CI discipline.
