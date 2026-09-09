# Howler Universal Data Interaction Contract

Status: user-approved permanent product requirement, 2026-09-08.
Applies to current and future modules. This is a requirement, not a claim that
all existing modules already comply. It does not authorize unrelated module
implementation, external integration, deployment, or additional permissions.

## Manual-first, AI-assisted, one canonical state

Every mutable project-management data element the PM is allowed to own supports:

1. Direct manual viewing.
2. Direct manual creation where applicable.
3. Direct manual editing.
4. Direct manual correction/deactivation where applicable.
5. AI-assisted interpretation and proposed entry/update.
6. Validation before persistence.
7. Consequence analysis where appropriate.
8. Confirmation for consequential mutations.
9. Persistence into the same canonical project state as manual controls.
10. Project Activity/History recording.
11. Recalculation/synchronization of every dependent Howler module.

There is no separate AI-only project state. Both entry paths operate on the same
canonical facts and must use the same deterministic business validation and
mutation pathway. UI draft state and unconfirmed AI proposals are not facts.

## Scope

This contract covers project details; Schedule; Scope; Budget; Change Orders;
Selections; Trades/Vendors/Contacts; Materials/Procurement; Inspections/Permits;
Plans, Photos and Documents metadata/associations; project statuses; dates;
commitments; notes; relationships; allowances; cost records; and future PM-owned
project facts. A module is not functional merely because it displays records.

For each mutable record type, the PM must be able to manage it manually, and the
AI interface must eventually safely operate it through the same canonical system.
Until AI coverage is implemented and tested, report it explicitly as partial or
pending. A shared backend alone is not proof of a working AI interaction.

## Protected values

| Data | Rule |
| --- | --- |
| Audit / History | Append-only; a correction creates a new event, never rewrites an old one. |
| Approved evidence | Issued plans, executed documents and retained evidence are versioned, never silently replaced. |
| Original files/photos | Preserve originals; editable metadata is not replacement evidence. |
| Forecasts | Derived; PMs change factual schedule inputs and Howler recalculates outputs. |
| Intelligence / risk / integrity | Derived from facts; no direct overwrite of computed findings/scores. |
| Provenance / audit metadata | System-controlled, not freely client- or AI-assigned. |

Human-supplied references, dates and explanatory notes may be inputs; system
identity, verification, timestamps and audit attribution must remain controlled
by their existing trusted boundaries.

## Safe AI mutation sequence

Interpret → resolve project/entity/field → validate against current canonical
state → identify ambiguity → calculate relevant consequences → preview proposed
change → confirm when consequential → apply through the normal canonical pathway
→ verify persisted outcome → update dependent modules.

Unresolved or ambiguous project, entity, field, date, amount, currency or intent
requires clarification. Do not choose silently, invent facts, elevate a tentative
statement into a commitment, or bypass existing permissions. An AI model's
confidence is not authorization or evidence of correctness.

Bind confirmation to the resolved project, entity, proposed values and reviewed
revision. A correction changes the proposal and invalidates superseded approval.
Cancellation/defer does not mutate. Repeated delivery must not duplicate effects;
uncertain persistence is not success. A later deliberate new action must not be
mistaken for an old delivery retry.

## Synchronization and consequences

One accepted change propagates to every relevant surface through canonical state
and derived views, not independent copies of facts.

- Material delivery change: Materials → affected factual Schedule inputs through
  the authorized command → Forecast → Overview/Priority Actions/Risks → History.
- Approved Change Order: Change Orders → Budget → Scope association → relevant
  intelligence → History. Declared schedule impact alone does not alter Schedule.
- Inspection passed: Inspections → genuinely associated blocked activities under
  canonical rules → Forecast → Overview → History.

Dependencies must be explicit and factually supported. Do not fabricate an
association to make a demonstration work. Refresh failures must show stale or
unavailable status, not conflicting views presented as current. Late responses
from another project/revision must not overwrite newer state.

Example: manually setting a wall-package delivery date and interpreting
“Builders First Choice moved the wall package to Friday” must converge on the
same resolved canonical input and downstream outcome. The AI path first resolves
which project/package, which Friday and the existing delivery commitment, then
previews the affected framing consequences before confirmation. Transport-specific
provenance may differ; the business facts must not.

## Required acceptance evidence

For each new mutable record type, list manual view/create/edit/correct controls,
AI proposal coverage, protected fields, command/event, validation, confirmation
policy, history entry, dependent views, and tests. Mark non-applicable operations
explicitly with a reason; do not silently omit them.

Prove manual and AI proposals for the same resolved change converge on equivalent
business state; ambiguity produces no mutation; validation/authorization cannot
be bypassed; consequential confirmation binds the reviewed change; duplicate and
uncertain delivery do not duplicate effects; persistence is verified; protected
data stays protected; dependent views refresh and survive reload; and cross-project
associations fail. Do not claim AI coverage before the corresponding adapter is
implemented and tested.

Existing accepted milestones remain accepted at their recorded scope. Track
contract coverage as an explicit follow-on gap rather than re-auditing accepted
history wholesale. Every future completion report includes all 14 product areas
and qualifies manual capability versus AI coverage. “Development build” does not
mean field-ready pilot.
