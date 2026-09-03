# Howler Conversational PM Layer

## Status and scope

Design for review. No conversational runtime, claim compiler, debrief view, or onboarding importer is implemented by this document. Nothing in this spec changes `src/domain/types.ts`'s existing shapes, `src/operator/intent.ts`'s existing validation, D1 schema/migrations, Task 15-17 operator contracts, or Task 18 voice-transport capture/confirmation/idempotency behavior. `deboard-v091` is not modified by writing this spec; its two pre-existing oversight BLOCK findings (`structural_reconcile`/`framing` plan-vs-engineering conflict, `brick_veneer` match/quote) and its three queued-but-unapplied masonry facts (actual start Aug 28, `masonry-material` satisfied, `masonry-trade` satisfied) are preserved exactly as the Den-activation pass left them.

The problem this spec solves: today, voice can only trigger one of five fixed `IntentKind`s (`commandKind()` in `src/worker/voice-transport.ts`) and apply an evidence snapshot that already exists, hand-built in the admin UI's JSON textarea. There is no path from a spoken sentence like "the wall package came in yesterday, Jason moved to Wednesday" to a structured project update. This spec defines that path without creating a second way to mutate project state.

## Locked architecture

```
VOICE / TEXT
  -> transcript
  -> semantic ConversationClaim[]                 (probabilistic, AI-authored)
  -> deterministic project/entity resolution       (deterministic)
  -> deterministic claim validation                 (deterministic)
  -> deterministic canonical mutation compilation   (deterministic)
  -> evidence preview                               (existing, unmodified)
  -> explicit confirmation where required           (existing, unmodified)
  -> canonical Apply                                (existing, unmodified)
  -> existing project state
  -> existing forecast/recovery
  -> safe spoken response
```

The probabilistic interpreter's output boundary is fixed: it emits `ConversationClaim[]`, never `EventMutationV094[]`. Everything left of "deterministic project/entity resolution" may be wrong, ambiguous, or hallucinated, and the architecture assumes it will be sometimes. Everything right of it is exactly as deterministic and testable as the existing Task 15-18 machinery, because it *is* that machinery — the claim compiler is a new, pure, deterministic function; evidence preview, confirmation, and Apply are the unmodified existing functions.

## Semantic claim boundary

```ts
export type ConversationClaimType =
  // OBSERVED (past/already-occurred) — the compiler classifies every one of these FACT.
  | "ACTIVITY_STARTED"          // "masonry started Friday"
  | "ACTIVITY_COMPLETED"        // "Saul finished the trim"
  | "ITEM_COMPLETED"            // same as ACTIVITY_COMPLETED for a constraint-shaped item
  | "DELIVERY_RECEIVED"         // "the block package arrived yesterday"
  | "INSPECTION_COMPLETED"      // "the inspection passed"
  | "CONDITION_OBSERVED"        // "the crew is on site", "the wall is up" — observed constraint/blocker state
  // COMMITMENT (future intent/schedule/promise/request/expectation) — the compiler classifies every one of these COMMITMENT.
  | "SCHEDULE_CHANGED"          // "Jason is moving to Wednesday" (the plan changed, not yet performed)
  | "DELIVERY_EXPECTED"         // "the block package is coming Monday"
  | "TRADE_ATTENDANCE_PLANNED"  // "Sam will pour Friday"
  | "WORK_REQUESTED"            // "schedule framing Thursday", "have Wayland come tomorrow"
  | "DECISION_EXPECTED"         // "Mrs. Pratt needs to choose carpet by Friday" — a due-date commitment/control point, not a no-op
  // NON-MUTATING — no mutation is ever produced for these; they only confirm an item stays open, unchanged.
  | "DECISION_UNRESOLVED"
  | "CONSTRAINT_UNRESOLVED";

export interface ConversationClaim {
  claimId: string;
  sessionId: string;
  projectRef: string; // the raw project name/alias text as spoken, not a resolved projectId
  subjectRef: string; // resolved-candidate label if the interpreter has a guess, e.g. "masonry"
  subjectText: string; // the raw spoken phrase, e.g. "the wall package", "Jason's rough-in"
  claimType: ConversationClaimType;
  value?: string; // free-form claimed value, e.g. a date string, a state description
  effectiveDate?: string; // ISO date if the claim states or implies one
  certainty: "STATED" | "TENTATIVE"; // "I think Friday but don't mark it yet" -> TENTATIVE
  sourceTurnId: string;
  capturedAt: string; // ISODateTime, when the interpreter produced this claim
  userConfirmationState: "UNCONFIRMED" | "AWAITING_CONFIRMATION" | "CONFIRMED" | "DEFERRED" | "DISCARDED";
}
```

The interpreter may identify *business meaning* only, expressed as one of the thirteen `ConversationClaimType` values above — including which side of the observed/future line it heard (`ACTIVITY_STARTED` vs. `SCHEDULE_CHANGED`, `DELIVERY_RECEIVED` vs. `DELIVERY_EXPECTED`, and so on). It may **not** decide a mutation opcode, an activity ID, a constraint ID, a reducer state transition, a verification level, a `mutationClass`, or Apply authority. Those seven decisions are exclusively the deterministic compiler's job (next section), never the interpreter's — critically, **selecting a `claimType` is not the same as selecting a `mutationClass`**: the interpreter picks the business-meaning label (is this an observed start, or a planned attendance?), and only the compiler's fixed `CLASSIFY` table (below) turns that label into `"FACT"` or `"COMMITMENT"`. `ConversationClaim` has no field that names an `EventMutationV094` op, no field that names a real `activityId`/`constraintId` from any project model, no field that carries a `VerificationState`, and no field that carries a `mutationClass` — the type simply doesn't have the property. If the interpreter cannot confidently tell which `claimType` a claim is — most commonly, whether "Jason moved to Wednesday" describes a schedule change (`SCHEDULE_CHANGED`) or completed work (`ACTIVITY_COMPLETED`) — it must return a `Clarification` instead of guessing a `claimType`. This is the only place temporal ambiguity gets resolved, and it never resolves toward `FACT` by default: an unresolved claim type has no mutation class at all, because it never reaches the compiler as a claim.

## Deterministic claim-to-mutation compiler

`src/operator/claim-compiler.ts` (new). Pure function, no network/D1 access, given a `ConversationClaim`, the current `ProjectModelV094` for the resolved project (already loaded by the caller), and the session's known project/alias vocabulary:

1. **Resolve project.** Reuse `projectMention()` (`src/worker/voice-transport.ts`, unchanged) against `claim.projectRef`, falling back to `session.activeProjectId` when the claim carries no explicit project reference. Zero or multiple matches with no active-project tiebreak -> `CLARIFICATION`, never a guess.
2. **Resolve project entity.** Match `claim.subjectText`/`subjectRef` against the resolved project's actual `activities`/`constraints` labels and any known aliases (e.g. "the wall package" -> an activity whose `name` or `tags` match "wall"/"subfloor"/"building package"). This is string/label matching against real model data already in memory, not a second LLM call.
3. **Verify unique mapping.** More than one plausible activity/constraint match, or zero matches -> `CLARIFICATION` naming the ambiguous candidates. Never silently pick the first match.
4. **Check allowed semantic transition.** Each `ConversationClaimType` maps to a fixed, small set of legal `EventMutationV094` ops (table below). If the claimed transition doesn't make sense against the entity's current state (e.g. `ACTIVITY_COMPLETED` claimed for an activity already `COMPLETE`), the compiler emits a `CLARIFICATION` ("that's already marked done — did something change?") rather than a no-op mutation.
5. **Validate date/value.** `effectiveDate` must parse as a valid ISO date and must not be earlier than the entity's existing recorded start (for a completion/date-move claim) without an explicit correction context. Malformed or contradictory values -> `CLARIFICATION`.
6. **Classify `mutationClass`.** `mutationClass = CLASSIFY[claim.claimType]` — a fixed, exhaustive, hand-written table (below), never a heuristic over `claim.value`/`effectiveDate`/free text. `CLASSIFY` is total over all thirteen `ConversationClaimType` values (a TypeScript exhaustiveness check — a `never`-typed fallthrough — makes it a compile error to add a fourteenth `claimType` without also adding its `CLASSIFY` entry). This is the one step that answers FACT-vs-COMMITMENT, and it never reads anything the interpreter wrote beyond the `claimType` label itself.
7. **Determine provenance.** Builds one `UpsertSourceMutationV094` per compiled claim: `type: "VOICE_CONVERSATION"`, `label` containing a short transcript excerpt (never full raw audio — text only) plus `sessionId`/`sourceTurnId`, `observedAt` = compile time. Event-level `verification` is `PM_CONFIRMED` once `userConfirmationState === "CONFIRMED"`; a claim can never compile into an applyable event before confirmation.
8. **Emit `ProposedMutation`.** A `{ event: ProjectEventV094-shaped object, mutationClass: "FACT" | "COMMITMENT" }` (see Oversight model, next section) ready for the existing evidence-preview call — never submitted directly.
9. **Refuse or clarify.** Any failure in steps 1-5 halts compilation for that claim and returns a typed refusal reason; it never falls through to a best-guess mutation, and never falls through to a best-guess `mutationClass` either.

Claim-type -> mutation-class -> allowed-mutation table (closed set, extended only by a future spec revision, never inferred at runtime):

| `claimType` | `mutationClass` | Allowed mutation(s) |
|---|---|---|
| `ACTIVITY_STARTED` | `FACT` | `SET_ACTUAL_START` |
| `ACTIVITY_COMPLETED` / `ITEM_COMPLETED` | `FACT` | `SET_ACTUAL_FINISH`, and `SET_ACTIVITY_STATE` (`COMPLETE`) if the entity is an activity; `SET_CONSTRAINT_STATE` (`SATISFIED`) if it's a constraint |
| `DELIVERY_RECEIVED` | `FACT` | `SET_CONSTRAINT_STATE` (state `SATISFIED`) on a `MATERIAL`-type constraint |
| `INSPECTION_COMPLETED` | `FACT` | `SET_CONSTRAINT_STATE` (`SATISFIED`) on an inspection-typed constraint |
| `CONDITION_OBSERVED` | `FACT` | `SET_CONSTRAINT_STATE` (`SATISFIED`) on the named constraint (e.g. trade-mobilization, site-readiness) |
| `SCHEDULE_CHANGED` | `COMMITMENT` | `SET_SCHEDULE_LOCK` on the named activity |
| `DELIVERY_EXPECTED` | `COMMITMENT` | `SET_SCHEDULE_LOCK` or `SET_DURATION` on the material-dependent activity — documents an *expected* date, never treated as receipt |
| `TRADE_ATTENDANCE_PLANNED` | `COMMITMENT` | `SET_SCHEDULE_LOCK` on the named activity |
| `WORK_REQUESTED` | `COMMITMENT` | `SET_SCHEDULE_LOCK` on the named activity |
| `DECISION_EXPECTED` | `COMMITMENT` | `SET_CONSTRAINT_READINESS` on the named decision-type constraint — sets `readiness.likely` (and only `readiness.likely`; `optimistic`/`conservative` are left untouched unless the claim states them) to the stated due date. Never `UPSERT_CONSTRAINT` — the constraint must already exist; a decision with no matching constraint fails closed to `CLARIFICATION` at step 3 (entity resolution), it does not create one. |
| `DECISION_UNRESOLVED` / `CONSTRAINT_UNRESOLVED` | `null` | no mutation — this claim type only ever *confirms an item stays open*; it feeds the `DebriefItem` view's `status` back to `OPEN`, it never produces an event |

No claim type maps to `UPSERT_ACTIVITY`, `UPSERT_CONSTRAINT`, `UPSERT_DEPENDENCY`, `UPSERT_CONFLICT`, `RESOLVE_CONFLICT`, or any commercial/workload-signal mutation — creating new graph structure or resolving a conflict from conversation is out of this spec's scope entirely, matching "no new forecasting engine." Note the FACT/COMMITMENT split tracks *exactly* the OBSERVED/COMMITMENT grouping in the `ConversationClaimType` definition above — a `claimType` never appears in the "OBSERVED" comment group and classifies `COMMITMENT`, or vice versa; the two groupings are the same fact expressed twice (once in the type, once in this table) for readability, not two independent decisions that could drift apart.

**`DECISION_EXPECTED` vs. `DECISION_UNRESOLVED`/`CONSTRAINT_UNRESOLVED` — why one mutates and the others don't.** `DECISION_EXPECTED` carries *new information*: a due-by date the project didn't previously have recorded, or a changed one ("the client needs to choose carpet by Friday"). That is a control point exactly like a schedule commitment — it can go stale, it can be missed, and the project model needs to hold it so source-freshness tracking (below) can later flag it. `DECISION_UNRESOLVED` and `CONSTRAINT_UNRESOLVED` carry *no new information* — they are the debrief's own question ("is the carpet decision still pending?") being answered "yes, still pending, nothing has changed." Re-asserting an already-known open state is not an event; it only tells the `DebriefItem` view to keep surfacing the item rather than marking it stale-unanswered for this session. Put differently: `DECISION_EXPECTED` is how a due date *enters* the model; `DECISION_UNRESOLVED`/`CONSTRAINT_UNRESOLVED` is how the debrief confirms a due date *already in* the model hasn't been resolved yet. The two are never interchangeable — an interpreter that heard "still waiting on the carpet decision" must not reach for `DECISION_EXPECTED` (there is no new date in that utterance to record).

## Oversight model: fact ingestion vs. action authorization

Approved direction (Option B). Verified empirically against the real system this session: `EVIDENCE_APPLY_SHADOW` today refuses to persist *any* event once a project's current oversight review carries a `BLOCK` finding, regardless of whether the new event touches the blocked activities at all (confirmed: DeBoard's three queued masonry facts were refused by `OVERSIGHT_BLOCKED` even though the only two `BLOCK`-severity findings on the project are about `structural_reconcile`/`framing` and `brick_veneer`, neither of which the masonry facts touch).

**This does not fit the existing contract as-is.** `IntentV1`/`ProjectEventV094` (`src/domain/types.ts`) have no field distinguishing "this event only records a fact" from "this event authorizes downstream action," and the workflow layer's oversight-gate check (in `src/operator/workflow.ts`) is project-wide, not activity-scoped. A narrowly-scoped contract extension is required:

- Add `mutationClass: "FACT" | "COMMITMENT"` to `ProjectEventV094` (`src/domain/types.ts`), optional, defaulting to `"COMMITMENT"` semantics for any existing caller that doesn't set it — this is the backward-compatibility hinge: every intent submitted today (the admin UI's manual evidence textarea, this session's own hand-built DeBoard sync) keeps today's exact strict behavior unless it explicitly opts into `"FACT"`.
- The conversational claim compiler is the *only* producer that ever sets this field on an event, and it sets it to *either* value — `"FACT"` for the six OBSERVED claim types, `"COMMITMENT"` for the five COMMITMENT claim types (see the claim-type table above). The remaining two claim types (`DECISION_UNRESOLVED`, `CONSTRAINT_UNRESOLVED`) never reach this step at all — they classify `null` and produce no event, so `mutationClass` is never assigned to them. Both `FACT` and `COMMITMENT` only ever originate from the compiler's fixed `CLASSIFY` table, never from the interpreter and never inferred from a claim's wording — see Semantic claim boundary.
- The workflow layer's oversight-gate check gains exactly one narrowly-scoped bypass rule, and it applies to `"FACT"` only: an event with `mutationClass: "FACT"` may persist even while `oversight.decision === "BLOCK"`, **if and only if** none of the event's `impactSeedActivityIds` intersect any `BLOCK`-severity finding's `activityIds` on the current oversight review. Every other combination keeps today's exact refusal — this explicitly includes a `"COMMITMENT"` event whose activities don't overlap any `BLOCK` finding at all: an unrelated `BLOCK` elsewhere in the project does not, and must not, become a reason to newly permit a `COMMITMENT` that would otherwise be refused today. The bypass is `mutationClass`-gated first, scope-gated second; it is not "any event that happens not to overlap a BLOCK finding gets through."
- The `BLOCK` finding itself is never touched, downgraded, or auto-resolved by a `FACT` event — the next oversight review recomputed after a `FACT` apply re-evaluates from the *unmodified* `structural_reconcile`/`brick_veneer` conflicts and reports `BLOCK` again if they're still open, because they still are.
- The overlap check in the previous bullet is a **scope test, not a semantic one** — the gate never inspects what a claim *says*, only which `activityIds` it touches. This is deliberate: it means the gate cannot be tricked by a claim's wording. A claim whose `impactSeedActivityIds` overlaps a `BLOCK` finding is refused via the `FACT` path *regardless of what the claim asserts* — including a claim that asserts the blocked condition is itself now resolved.

**Worked "not automatically allowed" case.** Suppose a debrief answer is "the structural engineering conflict is resolved, the LVL calcs match the plans now." Its natural entity binding is `structural_reconcile`/`framing` — exactly the `BLOCK` finding's own `activityIds`. Whatever `claimType` the interpreter picks for this (most plausibly `CONDITION_OBSERVED`, still `FACT`-classified), the claim's `impactSeedActivityIds` overlaps the `BLOCK` finding, so the scope test refuses it via the `FACT` path, full stop — the compiler does not attempt to judge whether the claim, if true, would actually resolve the conflict. Resolving a `BLOCK`-scoped condition requires satisfying *that finding's own* evidence/oversight requirements (the same rigor Task 15-17's oversight review already applies to any `COMMITMENT`-class change), which is a distinct, stricter mechanism this spec does not define or build. In practice today that means: a claim overlapping an open `BLOCK` finding is never applied by the conversational layer at all — the debrief can surface the finding and the user's answer to `src/worker/admin.ts`'s existing manual evidence path (unchanged by this spec), but the voice/claim pipeline itself has no route to clear it. FACT ingestion never means action authorization, and it never means *block resolution* either — those are two different, both-forbidden things this pipeline cannot do.

**Worked FACT/COMMITMENT pairs** (the temporal-ambiguity distinction this section exists to make explicit):
- "Masonry started Friday" -> `ACTIVITY_STARTED` -> `FACT`. "Jason will be there Wednesday" -> `TRADE_ATTENDANCE_PLANNED` -> `COMMITMENT`.
- "Block arrived Monday" -> `DELIVERY_RECEIVED` -> `FACT`. "Block is coming Monday" -> `DELIVERY_EXPECTED` -> `COMMITMENT`.
- "Schedule framing Thursday" -> `WORK_REQUESTED` -> `COMMITMENT` (a request is never an observation, regardless of how confidently it's stated).
- "Mrs. Pratt needs to choose carpet by Friday" -> `DECISION_EXPECTED` -> `COMMITMENT` (a due date the model didn't have before — a control point, not an observation). "She's still deciding on carpet" with no new date -> `DECISION_UNRESOLVED` -> `null`, no mutation (nothing new to record; the item just stays open).
- "Jason moved to Wednesday," spoken with nothing in the session or utterance clarifying whether it means the schedule changed or the work happened -> the interpreter cannot safely pick between `SCHEDULE_CHANGED` and `ACTIVITY_COMPLETED`, so it returns a `Clarification` ("did that happen, or is that when it's now planned?") instead of a claim. There is no default here; an unresolved `claimType` never reaches step 6 to be classified at all, so it is not possible for this ambiguity to resolve toward `FACT` by omission.

Example under the allowed rule: "Masonry actually started Aug 28" (`ACTIVITY_STARTED`) compiles to a `FACT`-class event whose `impactSeedActivityIds` is `["masonry"]` — no overlap with `structural_reconcile`/`framing`/`brick_veneer` — so it applies, and DeBoard's forecast/recovery recompute from that new reality. "Proceed with framing despite the unresolved engineering conflict" is not expressible as any of the thirteen claim types this spec's compiler recognizes (there is no "authorize despite conflict" claim type, and conflict resolution isn't in the allowed-mutation table for any of them) — the interpreter has no `claimType` to reach for it, so this never becomes a claim in the first place, let alone a `COMMITMENT` one.

This contract extension (the `mutationClass` field and the scoped gate check) is implementation work for a future plan, not built by this spec — it is called out explicitly because the rest of this design depends on it existing; without it, every conversational claim this spec produces would hit the same `OVERSIGHT_BLOCKED` wall the manual DeBoard sync did.

## Source freshness

Applies to both the live-PM-doc ingestion path and any `ConversationClaim` derived from it or from conversation.

- **OBSERVED / CONFIRMED** — the source states the fact as having already happened, stated in the past tense as accomplished ("Lee Block delivered the first block package Thursday, Aug 27").
- **PLANNED / SCHEDULED** — the source states a future commitment as of the source's own timestamp ("Thursday, Sep 3 at 8:00 AM, hold an on-site meeting ... verify the window selection"). A planned date is evidence of an intention that existed when the source was written — nothing more.
- **STALE / EXPIRED** — a `PLANNED/SCHEDULED` claim whose date has passed relative to "now," with no later `OBSERVED/CONFIRMED` claim on the same subject superseding it.
- **UNKNOWN OUTCOME** — the derived state a `STALE/EXPIRED` planned item sits in until resolved. This is not a failure state; it's an honest "we don't know yet" that becomes a `DebriefItem`.

A future scheduled date in an older source is never treated as evidence that the work occurred — only an `OBSERVED/CONFIRMED` claim (from a fresher source read, or from a debrief answer) does that. The KF Live PM Intelligence Dashboard v2 read this session (`modifiedTime: 2026-08-31T16:52:29Z`) already exhibits exactly this pattern: Ciurlizza's "Thursday, Sep 3 site meeting to verify selections" is `PLANNED/SCHEDULED` as of Aug 31, and — because it's now Sep 3 or later relative to any debrief run after that date — becomes `STALE/EXPIRED` -> `UNKNOWN OUTCOME` -> a natural debrief question ("did the Thursday selections meeting happen?"), never silently assumed complete.

`sourceFreshness` is a computed property (derived from `effectiveDate`/`observedAt` vs. "now" and whether a later claim supersedes it), not a stored field on `ConversationClaim` or `ProjectEventV094` — storing it would let it go stale itself.

**`DECISION_EXPECTED` lifecycle (the same PLANNED-to-STALE machinery, worked through a decision instead of a schedule commitment).** "Client decision expected Friday" compiles as `DECISION_EXPECTED` -> `COMMITMENT` -> `SET_CONSTRAINT_READINESS` sets `readiness.likely` to that Friday; the event's own `PLANNED/SCHEDULED` freshness holds while Friday is still in the future. Friday passes with no `OBSERVED/CONFIRMED` claim superseding it -> the same freshness rule as any other planned date applies: `STALE/EXPIRED` -> `UNKNOWN OUTCOME` -> the next debrief surfaces it as a `CLIENT_DECISION`-category `DebriefItem` ("did the carpet decision happen?"), exactly like the Ciurlizza selections-meeting example above. If the user later says "she picked option B Friday," that is a *new*, separately-confirmed claim (`ITEM_COMPLETED` -> `FACT` -> `SET_CONSTRAINT_STATE` `SATISFIED` on the same constraint) following the ordinary FACT path start to finish — provenance, confirmation, compile, preview, apply, all of it. The prior `COMMITMENT` event is never rewritten, superseded in place, or silently reinterpreted as a completion; the two events simply coexist in the ledger, and the constraint's current `state`/`readiness` reflect whichever event applied last. Nothing about `DECISION_EXPECTED` short-circuits this — it produces one ordinary `COMMITMENT` event, observed by the same freshness rule as every other commitment.

## Debrief item view

`src/operator/debrief.ts` (new). One normalized, **derived** view over data Howler already computes — not a second competing database, not a persisted table.

```ts
export interface DebriefItem {
  itemId: string; // deterministic, derived from projectId + category + subject
  projectId: string;
  category:
    | "BLOCKING_TODAY"
    | "EXPIRED_COMMITMENT"
    | "TRADE_MOVEMENT"
    | "MATERIAL_MOVEMENT"
    | "INSPECTION"
    | "CLIENT_DECISION"
    | "STALE_DATE"
    | "HOUSEKEEPING";
  subject: string; // e.g. "masonry-material", "Jason Bonham electrical rough-in"
  expectedAt?: string;
  lastVerifiedAt?: string;
  source: string; // sourceId(s) this item traces to
  severity: "BLOCK" | "WARN" | "INFO"; // carried straight from the oversight finding when one exists
  status: "OPEN" | "CONFIRMED_COMPLETE" | "MOVED" | "DEFERRED" | "UNKNOWN";
  question: string; // the exact spoken prompt Howler would ask
  supportingRefs: string[]; // activityIds/constraintIds/oversight-finding ids backing this item
}
```

Inputs, all already computed by existing engine/operator code and simply read, never recomputed: `CRITICAL_PATH` `WARN`/`BLOCK` oversight findings on unverified hard constraints (exactly the `masonry-material`/`masonry-trade` findings verified this session); `topRisks`/`priorityActions` from health/recovery queries; `INTERRUPTED`/`BLOCKED`/`FAILED` workflow states already surfaced by `isNoteworthy` (`src/worker/admin.ts`); and `STALE/EXPIRED` -> `UNKNOWN OUTCOME` items from the source-freshness rule above. `buildDebriefItems(projectModels, oversightReviews, healthResults, recoveryResults)` is a pure function over data the caller already has in hand — it adds no new fetch, no new D1 read.

## Conversation session

Ephemeral, in-memory for the life of one debrief; never written to D1; discarded when the session ends.

```ts
export interface ConversationSession {
  sessionId: string;
  startedAt: string;
  activeProjectId: string | null;
  activeDebriefItems: DebriefItem[];
  currentQuestionRef: string | null; // itemId currently being asked about
  pendingClaims: ConversationClaim[];
  unresolvedClarifications: { message: string; relatedClaimId?: string }[];
  lastReferencedEntity: { type: "activity" | "constraint"; id: string; label: string } | null;
  turnLog: { turnId: string; text: string; at: string }[]; // bounded, last N turns only
  confirmationState: "IDLE" | "AWAITING_CONFIRMATION";
}
```

`TENTATIVE`-certainty claims ("I think Friday but don't mark it yet") stay in `pendingClaims` at `userConfirmationState: "UNCONFIRMED"` forever within the session — they are structurally incapable of reaching the compiler's step 7 (provenance/`PM_CONFIRMED`), so they can never become canonical project truth. When the session ends, everything above is discarded; the only durable trace of the debrief is whatever claims actually completed the full pipeline into applied events, each carrying its own `VOICE_CONVERSATION` source — never a session transcript, never raw audio.

## Multi-fact parsing

"Second block came Monday and Jason moved to Wednesday" must become two independent `ConversationClaim`s. The interpreter (the one probabilistic step, outside this spec's deterministic surface) segments an utterance into candidate spans and emits one claim per span; each span is independently carried through project/entity resolution. One ambiguous span produces one `CLARIFICATION` for that span only — it does not discard or block compilation of the other, unambiguous claim from the same utterance.

## Corrections

"Jason moved to Wednesday." / "No, Thursday actually." — the second turn is resolved against `session.pendingClaims` filtered to `AWAITING_CONFIRMATION` claims whose resolved entity matches `session.lastReferencedEntity`. If exactly one such claim exists, its `value`/`effectiveDate` is replaced in place — no new claim, no duplicate project event. If zero or more than one candidate exists to correct, the turn becomes a `CLARIFICATION` ("I don't have an open item to correct — what should I update?") rather than guessing which pending claim the correction targets.

## Defer / uncertainty

"Leave that open." — any pending claim tied to the current `DebriefItem` moves to `userConfirmationState: "DEFERRED"`; the `DebriefItem.status` itself stays `OPEN`/`UNKNOWN`, never flips to a resolved status. "I think Friday but don't mark it yet." — see Conversation session above: the claim is `TENTATIVE`, stays `UNCONFIRMED`, never compiles into an applyable event, never reaches Apply. Both cases leave the underlying stale item genuinely stale for the next debrief — matching hide != archive != delete.

## Project resolution and multi-project safety

First pass reuses `projectMention()` unchanged. An utterance naming no project inherits `session.activeProjectId` from an earlier turn in the same session; an utterance naming a different project switches it. If a claim's subject text could plausibly match entities in more than one tracked project and there is no active-project context to break the tie, the compiler's step 3 (unique mapping) fails closed into a `CLARIFICATION` — this is the same mechanism as entity ambiguity within one project, not a separate rule.

## Project onboarding

Current live portfolio has seven projects; only `deboard-v091` exists in Howler (verified by grep this session — `deboard-seed.ts` is the only seed file in the repository). Do not hand-write six more seed files; do not turn the Google Doc into a second permanent database.

```
authoritative source (KF Live PM Intelligence Dashboard v2, or any future source)
  -> normalized baseline ProjectModelV094 (name, activities, constraints, sources, no eventLedger yet)
  -> deterministic validation (validateProjectModel, already exists, unchanged)
  -> provenance manifest (which source doc/section/modifiedTime backs each field)
  -> import preview (dry-run through the same forecastInitial/oversight path the seed endpoint already runs)
  -> explicit creation/import (POST /v1/projects/:id/import — generalizes the existing
     POST /v1/projects/deboard-v091/seed handler in src/worker/index.ts into a reusable,
     projectId-parameterized path, reusing repo.createProject/validateProjectModel/forecastInitial verbatim)
  -> import receipt (projectId, revision, forecastable/oversight decision, provenance manifest,
     returned to the caller — same shape the existing /seed response already returns)
```

The live doc (or its future replacement) remains an *input* to this pipeline every time onboarding runs; Howler's D1-backed `ProjectModelV094`/event ledger remains the only operational data model. No summary document, no duplicate spreadsheet, no second Howler-side project-memory doc is created by this design.

## DeBoard blockers

`structural_reconcile`/`framing` (plans-vs-engineering conflict) and `brick_veneer` (match/quote) remain `BLOCK`-severity, unresolved, untouched by this spec. The three approved masonry facts (actual start Aug 28 — `ACTIVITY_STARTED`; `masonry-material` satisfied — `DELIVERY_RECEIVED`; `masonry-trade` satisfied — `CONDITION_OBSERVED`) all classify `FACT` under the table above and remain queued exactly as the Den-activation pass left them — proven representable and forecast-consistent via a real `EVIDENCE_PREVIEW`, refused at `EVIDENCE_APPLY_SHADOW` by the current project-wide oversight gate. They become eligible for application once the scoped-gate extension above exists; this spec does not apply them. Should the second block delivery later come up in a debrief, "second block is coming Friday" classifies `DELIVERY_EXPECTED` -> `COMMITMENT` (a plan, not receipt), while "second block came Friday" classifies `DELIVERY_RECEIVED` -> `FACT` — the same distinction, on the same subject, still queued facts vs. still-open commitments.

## Morning debrief flow (illustrative)

Session opens -> `buildDebriefItems` across tracked projects -> items bucketed into the required priority order (blocking-today, expired commitments, trade movements, material movements, inspections, client decisions, stale dates, housekeeping) -> items 1-3 (blocking/expired/trade) grouped per project when they share a project, so DeBoard's `masonry-material` + `masonry-trade` — both real `WARN` findings on the same activity — are asked about together, not as two separate questions -> Howler asks the highest-priority group first -> the user answers across one or more turns, possibly with multiple facts, a correction, or a deferral -> each `CONFIRMED` claim compiles and runs the real, unmodified evidence preview (spoken consequence uses the actual `delta`, e.g. "masonry start moved two days, completion now the 13th instead of the 11th") -> explicit confirmation -> real Apply -> next group. This is an example of the shape, not a scripted transcript to hardcode.

## Files / modules proposed

- `src/operator/conversation.ts` — `ConversationClaim`, `ConversationSession` types and pure state-transition functions (create, add claim, apply correction, defer, confirm, expire session).
- `src/operator/claim-compiler.ts` — the deterministic compiler described above: `compileClaim(claim, projectModel, sessionVocabulary) -> ProposedMutation | Clarification`.
- `src/operator/debrief.ts` — `buildDebriefItems(...)` pure derivation over existing project/oversight/health/recovery data; priority bucketing/grouping.
- `src/operator/interpreter.ts` — the single probabilistic boundary: `interpretTurn(text, session) -> ConversationClaim[] | Clarification`. Isolated so it's the only module that ever calls out to a language-understanding step; everything downstream of it is pure and deterministic.
- `src/worker/voice-transport.ts` — extended, not replaced: existing `commandKind`/`resolveVoiceCommand`/`FieldVoiceBridge`/capture/confirmation code stays exactly as Task 18 shipped it; a new, separate `resolveConversationalTurn`-style entry point is added alongside for debrief sessions.
- `src/domain/types.ts` — one additive field, `mutationClass: "FACT" | "COMMITMENT"` on `ProjectEventV094` (see Oversight model).
- `src/operator/workflow.ts` — the scoped oversight-gate extension described above (activity-overlap check for `FACT`-class events).
- `src/worker/index.ts` — generalize the existing `/v1/projects/deboard-v091/seed` handler into a parameterized `/v1/projects/:id/import` handler (Project onboarding section).

Test files: `test/unit/conversation.test.ts`, `test/unit/claim-compiler.test.ts`, `test/unit/debrief.test.ts`, `test/contract/conversation-flow.test.ts`, `test/integration/fact-ingestion-scoped-oversight.test.ts`, `test/integration/project-import.test.ts`.

## Test design

- **Multi-fact parsing**: one utterance with two independent facts compiles to two `ConversationClaim`s handled independently.
- **Ambiguous entity resolution**: a claim whose subject text matches two activities/constraints in the resolved project yields `CLARIFICATION`, names both candidates, produces no mutation.
- **Project context carryover**: a follow-up utterance naming no project inherits `session.activeProjectId`; a different explicit project name overrides it.
- **Correction replaces pending claim**: "No, Thursday actually" mutates the single matching `AWAITING_CONFIRMATION` claim in place; asserts no second claim/event is created; asserts a correction with zero or multiple candidates clarifies instead of guessing.
- **Uncertainty does not apply**: a `TENTATIVE` claim never reaches the compiler's provenance step; asserts no `EVIDENCE_APPLY_SHADOW` intent is ever constructed from it.
- **Defer keeps item unresolved**: "leave that open" leaves the source `DebriefItem.status` at `OPEN`/`UNKNOWN` after the session, not `CONFIRMED_COMPLETE`.
- **Claim-type classification is exhaustive and correct**: each of the eleven mutation-producing `claimType` values compiles to exactly its table-specified `mutationClass` — `ACTIVITY_STARTED`/`ACTIVITY_COMPLETED`/`ITEM_COMPLETED`/`DELIVERY_RECEIVED`/`INSPECTION_COMPLETED`/`CONDITION_OBSERVED` all `FACT`; `SCHEDULE_CHANGED`/`DELIVERY_EXPECTED`/`TRADE_ATTENDANCE_PLANNED`/`WORK_REQUESTED`/`DECISION_EXPECTED` all `COMMITMENT`; `DECISION_UNRESOLVED`/`CONSTRAINT_UNRESOLVED` both classify `null` and produce no event. Includes the seven worked pairs from the Oversight model section verbatim as fixtures ("masonry started Friday" -> FACT, "Jason will be there Wednesday" -> COMMITMENT, "block arrived Monday" -> FACT, "block is coming Monday" -> COMMITMENT, "schedule framing Thursday" -> COMMITMENT, "Mrs. Pratt needs to choose carpet by Friday" -> COMMITMENT vs. "she's still deciding on carpet" -> null/no mutation, ambiguous "Jason moved Wednesday" with no disambiguating context -> `Clarification`, never a default `FACT`).
- **`DECISION_EXPECTED` compiles to a real `COMMITMENT` mutation**: "the client decision is due Friday" resolves the named decision-type constraint, classifies `COMMITMENT`, and compiles to `SET_CONSTRAINT_READINESS` with `readiness.likely` set to that Friday — asserts the event is a real, applyable `ProposedMutation`, not a no-op, and asserts `mutationClass` is `"COMMITMENT"` never `null`.
- **An unrelated BLOCK does not incorrectly gate the `DECISION_EXPECTED` commitment**: the same event from the previous case, scoped only to non-blocked activities, is still refused while the project carries any open `BLOCK` finding — proving `DECISION_EXPECTED`'s `COMMITMENT` classification gets no special-case bypass, exactly like every other `COMMITMENT`.
- **An expired decision surfaces as `UNKNOWN OUTCOME`, not silently resolved**: a `DECISION_EXPECTED` event whose `readiness.likely` date has passed with no later `OBSERVED/CONFIRMED` claim on the same constraint transitions `PLANNED/SCHEDULED` -> `STALE/EXPIRED` -> `UNKNOWN OUTCOME`, and `buildDebriefItems` surfaces it as a `CLIENT_DECISION`-category `DebriefItem` with `status: "UNKNOWN"`.
- **A later confirmed decision is a separate observed fact, never inferred from the old commitment**: "she picked option B Friday" after the above compiles as its own `ITEM_COMPLETED` -> `FACT` -> `SET_CONSTRAINT_STATE` (`SATISFIED`) claim through the full ordinary FACT path; asserts the prior `COMMITMENT` event is untouched (not rewritten, not deleted) and that no code path auto-derives this outcome from the expired commitment without an explicit new claim.
- **Interpreter cannot set `mutationClass`**: a malformed/adversarial interpreter response that includes a `mutationClass` key is asserted to have zero effect on the compiler's output — the compiler's classification is proven identical whether or not that key is present, since `CLASSIFY` only ever reads `claimType`.
- **Factual update accepted despite unrelated BLOCK**: a `FACT`-class event whose `impactSeedActivityIds` doesn't overlap an existing `BLOCK` finding's `activityIds` persists (mirrors this session's real DeBoard masonry preview, replayed once the scoped gate exists).
- **Unsafe action remains BLOCKED**: a `COMMITMENT`-class event, or any event overlapping a `BLOCK` finding's activities, is refused exactly as today — regression-pins the current `OVERSIGHT_BLOCKED` behavior this session proved.
- **An unrelated BLOCK never newly authorizes a COMMITMENT**: a `COMMITMENT`-class event scoped only to non-blocked activities is still refused while the project carries any open `BLOCK` finding, proving the bypass is `mutationClass`-gated and not merely scope-gated.
- **A relevant BLOCK cannot be cleared by an overlapping FACT**: a `FACT`-class event whose `impactSeedActivityIds` includes an activity named in an open `BLOCK` finding is refused via the `FACT` path exactly like a `COMMITMENT` would be, regardless of what the claim's content asserts (the "not automatically allowed" worked case).
- **Factual update cannot clear unrelated BLOCK**: after a `FACT` apply, the next oversight review still reports the same unrelated `BLOCK` findings, unchanged severity.
- **Source-freshness handling**: an `OBSERVED/CONFIRMED` claim past-dates and overrides an earlier `PLANNED/SCHEDULED` claim on the same subject; a `PLANNED/SCHEDULED` claim whose date has passed with no confirming claim yields `UNKNOWN OUTCOME`.
- **Old planned date becomes stale/unknown**: a fixture built from this session's actual Aug 31 KF dashboard read (Ciurlizza's Sep 3 meeting) demonstrates the exact `PLANNED -> STALE/EXPIRED -> UNKNOWN OUTCOME -> DebriefItem` transition once "now" passes Sep 3.
- **No raw audio persistence**: asserts `ConversationSession`/`ConversationClaim`/the applied event's `UPSERT_SOURCE` label never contain audio data, only text.
- **Project onboarding provenance**: an imported project's `sources` map traces every seeded activity/constraint back to a named source with a manifest entry; import preview surfaces validation failures before any `POST /v1/projects/:id/import` commit.
- **Duplicate confirmation protection**: confirming the same claim twice (double "yes") applies exactly once — reuses the existing idempotency-key pattern from `createSubmissionKernel`, not a new mechanism.
- **Full canonical preview/apply integration**: a `CONFIRMED` claim's compiled event runs through the real, unmodified `EVIDENCE_PREVIEW` -> `EVIDENCE_APPLY_SHADOW` HTTP path end to end, same as this session's manual DeBoard exercise, proving the conversational path never diverges from the canonical one.

## What this spec explicitly does not change

`commandKind`/`resolveVoiceCommand`/`FieldVoiceBridge`/capture ownership/confirmation expiry (Task 18, unmodified). `validateIntent`/`validateEvent` and the `IntentV1`/`ProjectEventV094` shapes, apart from the one additive `mutationClass` field. D1 schema/migrations. The Penthouse dashboard and any future Index Card design. Any model-provider/AI-routing architecture beyond the single, isolated `interpretTurn` boundary. Production deployment.
