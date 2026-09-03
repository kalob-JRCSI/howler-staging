# Conversational PM Layer Implementation Plan

Authority: `docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md` at commit `271ab9b6471a745b6363dcfed9a54fe71462a639` (includes the mutationClass-ownership and BLOCK-scope-semantics correction). No runtime implementation is included in this plan document. Do not begin any task until this plan itself is reviewed and approved.

New production modules: `src/operator/conversation.ts`, `src/operator/claim-compiler.ts`, `src/operator/debrief.ts`, `src/operator/interpreter.ts`. Modified production modules: `src/domain/types.ts` (one additive field), `src/operator/workflow.ts` (one scoped gate rule), `src/worker/voice-transport.ts` (additive entry point only — `commandKind`/`resolveVoiceCommand`/`FieldVoiceBridge`/capture/confirmation untouched), `src/worker/index.ts` (generalize the existing seed handler). Existing Task 15-18 interfaces are consumed, never recreated.

Every RED/GREEN command below uses `npm.cmd exec vitest -- run <path> -t "<pattern>"` against the root vitest config unless a task's tests live in a tool with its own config, matching this repository's existing convention (`docs/superpowers/plans/2026-09-02-howler-v095-task18-voice-transport-plan.md`).

## Task 1: ConversationClaim semantic model

**Files**
- Create: `src/operator/conversation.ts`
- Modify: none
- Test: `test/unit/conversation.test.ts`

**Interfaces:** produces `ConversationClaimType`, `ConversationClaim` exactly as typed in the spec's "Semantic claim boundary" section — no `EventMutationV094` op field, no `activityId`/`constraintId` field, no `VerificationState` field, no `mutationClass` field.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "claim shape"`
**EXPECTED RED:** module does not exist; a type-level test (a small runtime shape-check helper, since TS types alone don't fail at test time) asserting `ConversationClaim` objects never carry `mutationOp`/`activityId`/`constraintId`/`verification`/`mutationClass` keys fails to compile/import.
**Minimum implementation:** add `ConversationClaimType` union and `ConversationClaim` interface exactly as specified; add a `assertNoForbiddenClaimFields(claim: unknown): void` pure helper that throws if any of the five forbidden keys are present, used by later tasks' tests as a structural guardrail.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "claim shape"`
**EXPECTED GREEN:** a claim object built with only the specified fields passes; a deliberately-malformed test fixture carrying an extra `mutationOp` key fails `assertNoForbiddenClaimFields`.
**Checkpoint/review:** confirm no field on `ConversationClaim` could be serialized into an `EventMutationV094`. Commit: `feat: add ConversationClaim semantic model`.

## Task 2: Ephemeral conversation/debrief session state

**Files**
- Create: none (extend `src/operator/conversation.ts`)
- Modify: `src/operator/conversation.ts`
- Test: `test/unit/conversation.test.ts`

**Interfaces:** produces `ConversationSession` exactly as typed in the spec, plus pure functions `createSession(startedAt: string): ConversationSession`, `addClaim(session, claim): ConversationSession`, `applyCorrection(session, claimId, patch): ConversationSession`, `deferClaim(session, claimId): ConversationSession`, `confirmClaim(session, claimId): ConversationSession`, `endSession(session): void` (discards, returns nothing — ephemeral by construction, never writes anywhere).

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "session"`
**EXPECTED RED:** session creation, bounded turn-log retention, and teardown tests fail (no implementation exists).
**Minimum implementation:** add `ConversationSession` type and the state-transition functions above as pure, immutable-update functions (each returns a new session object; no shared mutable module state, no D1/network access anywhere in this file). Bound `turnLog` to the last 20 entries (oldest dropped on push). `endSession` is a no-op that exists only to make "nothing persists" an explicit, testable contract point (asserts the caller's reference is the only place session data ever lived).
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "session"`
**EXPECTED GREEN:** a session with 25 pushed turns retains exactly the most recent 20; calling `endSession` followed by inspecting any module-level state (there is none) proves nothing durable was written; `sessionId`s are unique across repeated `createSession` calls.
**Checkpoint/review:** grep `src/operator/conversation.ts` for any `fetch`/`D1`/`localStorage`/`sessionStorage` reference — must be zero. Commit: `feat: add ephemeral conversation session state`.

## Task 3: Deterministic project/entity resolution

**Files**
- Create: none (extend `src/operator/conversation.ts`)
- Modify: `src/operator/conversation.ts`
- Test: `test/unit/conversation.test.ts`

**Interfaces:** consumes `projectMention()` (`src/worker/voice-transport.ts`, unchanged import) and a `ProjectModelV094` (`src/domain/types.ts`, unchanged); produces `resolveClaimProject(claim, session, knownProjectIds, aliases): string | Clarification` and `resolveClaimEntity(claim, projectModel): { type: "activity" | "constraint"; id: string } | Clarification`, where `Clarification = { kind: "CLARIFICATION"; message: string; candidates?: string[] }`.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "resolve project|resolve entity"`
**EXPECTED RED:** explicit-project, inherited-active-project, ambiguous-project, unknown-entity, and ambiguous-entity tests fail.
**Minimum implementation:** `resolveClaimProject` calls `projectMention(claim.projectRef, context)` first; on no match, falls back to `session.activeProjectId` only if `claim.projectRef` is empty (never overrides an explicit, non-matching project mention with the active one); multiple project matches with no active-context tiebreak returns `Clarification`. `resolveClaimEntity` matches `claim.subjectText`/`subjectRef` case-insensitively against each activity's/constraint's `name`/`label`/`tags`; zero or multiple matches returns `Clarification` naming the candidates; a subject matching no real `activityId`/`constraintId` in the model can never produce a resolved ID — it is structurally impossible to return an ID absent from `projectModel.activities`/`projectModel.constraints`, since the function only ever returns keys it iterated from those two records.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "resolve project|resolve entity"`
**EXPECTED GREEN:** explicit project resolves regardless of `activeProjectId`; empty `projectRef` inherits `activeProjectId`; two plausible project matches with no active context clarifies; an entity phrase matching two activities clarifies and names both; a phrase matching nothing real never yields a fabricated ID.
**Checkpoint/review:** confirm `resolveClaimEntity`'s return type cannot express an ID that isn't a key of the input `projectModel.activities`/`.constraints` — inspect by reading the implementation, not just the tests. Commit: `feat: add deterministic project and entity resolution`.

## Task 4: Deterministic claim validation

**Files**
- Create: none (extend `src/operator/claim-compiler.ts`, new file)
- Modify: none
- Test: `test/unit/claim-compiler.test.ts`

**Interfaces:** consumes a resolved `{ projectId, entity }` pair (Task 3 output) and the `ConversationClaim`; produces `validateClaimTransition(claim, entity, projectModel): { valid: true } | Clarification` and `validateClaimValue(claim): { valid: true } | Clarification`.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/claim-compiler.test.ts -t "validate"`
**EXPECTED RED:** already-complete-activity, malformed-date, and date-earlier-than-recorded-start tests fail.
**Minimum implementation:** `validateClaimTransition` checks the claim-type-to-current-state table (e.g. `ACTIVITY_COMPLETED` against an activity already `state: "COMPLETE"` clarifies instead of no-op mutating); `validateClaimValue` parses `effectiveDate` as ISO-8601, rejects malformed dates, and rejects a completion/date-move date earlier than the entity's existing `actualStart` without an explicit correction context flag.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/claim-compiler.test.ts -t "validate"`
**EXPECTED GREEN:** a claim against an already-complete activity clarifies; a malformed date clarifies; a correction-flagged claim is permitted to move a date earlier (corrections intentionally bypass the earlier-than-start guard, since "no, Wednesday not Thursday" may legitimately move a date backward relative to a prior *pending, unconfirmed* claim).
**Checkpoint/review:** confirm no validation path silently coerces a bad value into a "close enough" one. Commit: `feat: add deterministic claim validation`.

## Task 5: Deterministic claim-to-mutation compiler

**Files**
- Create: none (extend `src/operator/claim-compiler.ts`)
- Modify: none
- Test: `test/unit/claim-compiler.test.ts`

**Interfaces:** consumes Task 3/4 outputs; produces `compileClaim(claim: ConversationClaim, projectModel: ProjectModelV094, session: ConversationSession): ProposedMutation | Clarification`, where `ProposedMutation = { event: ProjectEventV094; mutationClass: "FACT" }` (the `ProjectEventV094` shape is the existing `src/domain/types.ts` type, imported unchanged).

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/claim-compiler.test.ts -t "compile"`
**EXPECTED RED:** the closed claim-type-to-mutation-op table, the provenance `UPSERT_SOURCE` construction, and the "compiler output cannot express a forbidden interpreter decision" tests fail.
**Minimum implementation:** implement the closed table from the spec (`DELIVERY_OCCURRED` -> `SET_CONSTRAINT_STATE`/`SATISFIED` on a `MATERIAL` constraint; `TRADE_DATE_CHANGED`/`DATE_MOVED` -> `SET_SCHEDULE_LOCK`/`SET_DURATION`; `ACTIVITY_STARTED` -> `SET_ACTUAL_START`; `ACTIVITY_COMPLETED`/`ITEM_COMPLETED` -> `SET_ACTUAL_FINISH` + `SET_ACTIVITY_STATE`/`SET_CONSTRAINT_STATE`; `INSPECTION_COMPLETED` -> `SET_CONSTRAINT_STATE`/`SATISFIED`; `DECISION_UNRESOLVED`/`CONSTRAINT_UNRESOLVED` -> no mutation, returns `null` meaning "no event, feed back into DebriefItem status OPEN"). Always sets `mutationClass: "FACT"` — this compiler produces no other value, ever (see Task 6 for why `"COMMITMENT"` never originates here). Builds one `UpsertSourceMutationV094` with `type: "VOICE_CONVERSATION"`, `label` containing a transcript excerpt + `sessionId`/`sourceTurnId` (text only), `observedAt` = compile time. Event-level `verification` is hardcoded `"PM_CONFIRMED"` and is only reachable once `claim.userConfirmationState === "CONFIRMED"` — `compileClaim` refuses (returns `Clarification`) for any other confirmation state.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/claim-compiler.test.ts -t "compile"`
**EXPECTED GREEN:** every claim type in the table compiles to exactly its specified mutation op(s) and no others; a claim not yet `CONFIRMED` never compiles; `mutationClass` is always `"FACT"` from this function, with a code-level assertion (not just a test) that no branch can return `"COMMITMENT"`.
**Checkpoint/review:** read `compileClaim` end to end and confirm there is no code path where a field of `claim` (interpreter output) is copied directly into `mutation.op`, `mutation.activityId`/`constraintId`, `event.verification`, or `mutationClass` — every one of those five values must be a compiler-chosen literal or a value already proven real by Task 3/4, never a pass-through of interpreter text. Commit: `feat: add deterministic claim-to-mutation compiler`.

## Task 6: mutationClass schema field and scoped oversight gate

**Files**
- Create: none
- Modify: `src/domain/types.ts`, `src/operator/intent.ts`, `src/operator/workflow.ts`
- Test: `test/unit/operator-intent.test.ts`, `test/integration/fact-ingestion-scoped-oversight.test.ts` (new)

**Interfaces:** adds `mutationClass?: "FACT" | "COMMITMENT"` to `ProjectEventV094` (`src/domain/types.ts`), optional and defaulting to `"COMMITMENT"` wherever absent so every existing caller (admin UI evidence textarea, this session's own hand-built DeBoard sync, all of Task 15-17's existing tests) keeps today's exact behavior with zero code changes on their part. Extends `validateEvent` (`src/operator/intent.ts`) to accept the optional field without requiring it. Extends the oversight-gate check in `src/operator/workflow.ts`'s `EVIDENCE_APPLY_SHADOW` handling with the scoped rule.

**RED COMMAND A (schema/validation):** `npm.cmd exec vitest -- run test/unit/operator-intent.test.ts -t "mutationClass"`
**RED COMMAND B (gate behavior):** `npm.cmd exec vitest -- run test/integration/fact-ingestion-scoped-oversight.test.ts`
**EXPECTED RED A:** `validateEvent` neither accepts nor is aware of `mutationClass`; a payload carrying it is accepted today only because unknown fields are ignored, not because it's validated — the RED test asserts a *malformed* `mutationClass` value (e.g. `"DELETE_EVERYTHING"`) is currently NOT rejected, proving there's no validation yet to reject it.
**EXPECTED RED B:** does not exist; a project seeded with the same DeBoard fixture used this session, carrying the same real `structural_reconcile`/`brick_veneer` BLOCK findings, refuses a `FACT`-class event scoped to `masonry` exactly as it refuses a `COMMITMENT`-class one today (no scoped bypass exists yet).
**Minimum implementation:** add the optional field to the type; extend `validateEvent` to, when `mutationClass` is present, require it to be exactly `"FACT"` or `"COMMITMENT"` (reject anything else) — absence remains valid (defaults downstream to `"COMMITMENT"` semantics). In `src/operator/workflow.ts`, locate the existing oversight-gate check that produces `OVERSIGHT_BLOCKED` and add: if the resolved `event.mutationClass === "FACT"` **and** `event.impactSeedActivityIds` has zero intersection with the union of `activityIds` across every `BLOCK`-severity finding in the current oversight review, allow the apply to persist; every other combination (`mutationClass` absent/`"COMMITMENT"`, or any overlap regardless of `mutationClass`) keeps the exact existing refusal path unchanged. This is the only new conditional in the gate; nothing else about oversight computation, `forecastInitial`, or the `CRITICAL_PATH`/`DOCUMENTATION` finding logic changes.
**GREEN COMMAND A:** `npm.cmd exec vitest -- run test/unit/operator-intent.test.ts -t "mutationClass"`
**GREEN COMMAND B:** `npm.cmd exec vitest -- run test/integration/fact-ingestion-scoped-oversight.test.ts`
**EXPECTED GREEN A:** an invalid `mutationClass` value is rejected with a typed problem; `mutationClass` absent, `"FACT"`, and `"COMMITMENT"` are all accepted.
**EXPECTED GREEN B:** a `FACT`-class event scoped only to `masonry` applies and persists (revision advances) on the real DeBoard fixture despite its open `structural_reconcile`/`brick_veneer` `BLOCK` findings; a `FACT`-class event whose `impactSeedActivityIds` includes `"structural_reconcile"` or `"framing"` or `"brick_veneer"` is refused with `OVERSIGHT_BLOCKED`, identically to a `COMMITMENT`-class event touching the same activities; a `COMMITMENT`-class event scoped only to `masonry` is *still* refused (proves the bypass is `mutationClass`-gated, not just scope-gated) — this row regression-pins today's exact behavior for every existing caller.
**Checkpoint/review:** re-run the exact manual DeBoard `EVIDENCE_PREVIEW`/`EVIDENCE_APPLY_SHADOW` sequence from the Den-activation session (same three masonry mutations, same source), this time with `mutationClass: "FACT"` set explicitly on the hand-built event, against a fresh local `wrangler dev` — confirm it now applies where it was refused before, and confirm a fresh oversight query afterward still reports `structural_reconcile`/`brick_veneer` as `BLOCK`. This is a manual smoke check in addition to the automated tests, because this gate is the one security-critical piece of the whole plan. Commit: `feat: add mutationClass and scoped fact-ingestion oversight gate`.

## Task 7: Source freshness classification

**Files**
- Create: none (extend `src/operator/debrief.ts`, new file)
- Modify: none
- Test: `test/unit/debrief.test.ts`

**Interfaces:** produces `SourceFreshness = "OBSERVED_CONFIRMED" | "PLANNED_SCHEDULED" | "STALE_EXPIRED" | "UNKNOWN_OUTCOME"` and `classifySourceFreshness(claim: { tense: "PAST" | "FUTURE"; effectiveDate?: string }, now: string, supersededBy?: { tense: "PAST"; effectiveDate?: string }): SourceFreshness` — a pure function taking an explicit `now` for determinism (matches the injected-clock convention from Task 18's confirmation-expiry design).

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/debrief.test.ts -t "freshness"`
**EXPECTED RED:** module/function absent; observed/planned/stale/unknown classification tests fail.
**Minimum implementation:** past-tense claim -> `OBSERVED_CONFIRMED`; future-tense claim with `effectiveDate` not yet passed relative to `now` -> `PLANNED_SCHEDULED`; future-tense claim whose `effectiveDate` has passed relative to `now` and no `supersededBy` observed-claim exists -> `STALE_EXPIRED` for the record, `UNKNOWN_OUTCOME` as the caller-facing classification (the two are the same underlying state; `UNKNOWN_OUTCOME` is the name used once it's surfaced as a `DebriefItem`); a `supersededBy` observed claim on the same subject overrides regardless of the original claim's own dates.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/debrief.test.ts -t "freshness"`
**EXPECTED GREEN:** a fixture built from this session's real Aug 31 KF dashboard read — Ciurlizza's "Thursday, Sep 3 site meeting" claim, `now` fixed to `2026-09-04T00:00:00Z` — classifies as `UNKNOWN_OUTCOME`; the same fixture with `now` fixed to `2026-09-02T00:00:00Z` (before the meeting) classifies as `PLANNED_SCHEDULED`; a `DELIVERY_OCCURRED`-style past-tense claim always classifies `OBSERVED_CONFIRMED` regardless of `now`.
**Checkpoint/review:** confirm `sourceFreshness` is never stored as a field anywhere (grep for it in `src/domain/types.ts` — must be absent), only computed on demand. Commit: `feat: add source freshness classification`.

## Task 8: Derived DebriefItem view

**Files**
- Create: none (extend `src/operator/debrief.ts`)
- Modify: none
- Test: `test/unit/debrief.test.ts`

**Interfaces:** consumes existing, already-computed data (oversight reviews, health/recovery query results, workflow states — all already-existing types from `src/operator/*`/`src/engine/*`, no new fetch); produces `DebriefItem` exactly as typed in the spec, and `buildDebriefItems(projectModels: ProjectModelV094[], oversightReviews: OversightReviewV094[], healthResults: unknown[], recoveryResults: unknown[], now: string): DebriefItem[]`, plus `prioritizeDebriefItems(items: DebriefItem[]): DebriefItem[][]` grouping into the 8-category priority order with related same-project items grouped into one inner array.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/debrief.test.ts -t "buildDebriefItems|prioritize"`
**EXPECTED RED:** derivation-from-existing-data, category-bucketing, priority-ordering, and same-project-grouping tests fail.
**Minimum implementation:** map `CRITICAL_PATH` `WARN`/`BLOCK` oversight findings on unverified hard constraints to `DebriefItem`s (this is the exact mechanism that already surfaced `masonry-material`/`masonry-trade` as real findings this session); map `topRisks`/`priorityActions` and `INTERRUPTED`/`BLOCKED`/`FAILED` workflow states similarly; map `UNKNOWN_OUTCOME`-classified claims (Task 7) to `STALE_DATE`/category items. `prioritizeDebriefItems` sorts into the required 8-category order and groups items sharing both a `projectId` and adjacent category-tier (1-3) into the same inner group.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/debrief.test.ts -t "buildDebriefItems|prioritize"`
**EXPECTED GREEN:** a fixture built from the real DeBoard seed's actual oversight findings (this session's own data — `masonry-material`, `masonry-trade` `CRITICAL_PATH` `WARN`s, `structural_reconcile`/`brick_veneer` `BLOCK`s) produces `DebriefItem`s with correct `category`/`severity`/`supportingRefs`; `masonry-material` and `masonry-trade` land in the same inner group (both `TRADE_MOVEMENT`/`MATERIAL_MOVEMENT` tier, same project, same activity); no new D1 read or fetch occurs inside `buildDebriefItems` (asserted via a spy that fails the test if called).
**Checkpoint/review:** confirm `buildDebriefItems` and `prioritizeDebriefItems` are pure (same input, same output, no side effects) by running them twice against frozen fixtures and diffing. Commit: `feat: add derived DebriefItem view`.

## Task 9: Multi-fact conversational interpretation boundary

**Files**
- Create: `src/operator/interpreter.ts`
- Modify: none
- Test: `test/unit/interpreter.test.ts`

**Interfaces:** produces `interpretTurn(text: string, session: ConversationSession, callModel: (prompt: string) => Promise<string>): Promise<ConversationClaim[] | Clarification>` — `callModel` is an injected dependency (matches the fake-clock/fake-recognition injection convention from Task 18); tests never call a real model.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/interpreter.test.ts -t "interpret"`
**EXPECTED RED:** single-claim, two-independent-claims, one-valid-plus-one-ambiguous, and forbidden-field-stripping tests fail (module absent).
**Minimum implementation:** `interpretTurn` builds a prompt naming the session's known project/entity vocabulary (from the caller-supplied project models — the interpreter never has D1 access itself), calls the injected `callModel`, parses the response into zero or more `ConversationClaim`-shaped objects, and — critically — runs every parsed claim through `assertNoForbiddenClaimFields` (Task 1) before returning; any claim the model response tries to smuggle a forbidden field into is stripped of the interpreter's ability to matter, since `compileClaim` (Task 5) only ever reads the seven legitimate `ConversationClaim` fields regardless of what extra JSON keys a malformed model response contained.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/interpreter.test.ts -t "interpret"`
**EXPECTED GREEN:** a fake `callModel` returning two distinct facts for "second block came Monday and Jason moved to Wednesday" yields two `ConversationClaim`s; a fake model returning one clear fact plus one fact with an ambiguous subject yields one `ConversationClaim` and one `Clarification` for the ambiguous span, not a single all-or-nothing failure; a fake model whose raw JSON response includes an extra `mutationOp` key never causes that key to survive into the returned `ConversationClaim[]`.
**Checkpoint/review:** confirm this is the *only* file in the new modules that ever calls `callModel`/anything resembling a network AI call — grep the other new files for any such call, must be zero. Commit: `feat: add conversational interpretation boundary`.

## Task 10: Correction, defer, and uncertainty behavior

**Files**
- Create: none (extend `src/operator/conversation.ts`)
- Modify: `src/operator/conversation.ts`
- Test: `test/unit/conversation.test.ts`

**Interfaces:** extends Task 2's session functions with `resolveCorrection(session, text): ConversationSession | Clarification`, `resolveCompletion(session, text): ConversationSession | Clarification` ("yes, that's done" binding), building on `session.lastReferencedEntity` and `session.currentQuestionRef`.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "correction|defer|uncertainty|completion"`
**EXPECTED RED:** correction-replaces-pending, correction-with-no-active-claim-clarifies, tentative-never-confirms, defer-keeps-open, and completion-binds-to-exact-item tests fail.
**Minimum implementation:** `resolveCorrection` finds the single `pendingClaims` entry at `AWAITING_CONFIRMATION` whose resolved entity equals `lastReferencedEntity`; exactly one match mutates that claim's `value`/`effectiveDate` in place (no new claim appended); zero or multiple matches returns `Clarification`. Defer sets the matching claim (if any) to `DEFERRED` and leaves the source `DebriefItem` (tracked by `currentQuestionRef`) at its existing `OPEN`/`UNKNOWN` status — no code path in this file ever sets a `DebriefItem.status` to a resolved value on a deferral. A `TENTATIVE`-certainty claim is only ever added at `userConfirmationState: "UNCONFIRMED"` and no function in this file ever transitions an `UNCONFIRMED`+`TENTATIVE` claim to `AWAITING_CONFIRMATION` or `CONFIRMED` — that transition is only reachable for `STATED`-certainty claims. `resolveCompletion` requires `session.currentQuestionRef` to be set and binds only to the `DebriefItem`/claim at that exact ref, never a fuzzy "most recent" guess.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts -t "correction|defer|uncertainty|completion"`
**EXPECTED GREEN:** "No, Thursday actually" replaces the single pending Jason-date claim, `pendingClaims.length` unchanged; the same correction with two candidate pending claims on the same entity clarifies; "I think Friday but don't mark it yet" produces a claim that, when the full session is later inspected for any claim that reached `compileClaim` (Task 5), is provably never present in that set; "leave that open" leaves `DebriefItem.status === "OPEN"`; "yes, that's done" with `currentQuestionRef` unset clarifies rather than guessing which item.
**Checkpoint/review:** confirm no function added in this task can set `userConfirmationState: "CONFIRMED"` on a `TENTATIVE` claim under any input. Commit: `feat: add correction, defer, and uncertainty handling`.

## Task 11: Canonical evidence preview/apply integration

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/contract/conversation-flow.test.ts` (new)

**Interfaces:** consumes Task 5's `ProposedMutation` and the existing, unmodified `submitAction`/`buildIntentPayload`/idempotency-kernel machinery (Task 16A/16B/18, unchanged); produces `submitConfirmedClaim(mutation: ProposedMutation, projectId: string, expectedProjectRevision: number): Promise<{ workflowState: string }>` that constructs and submits **exactly** the same `IntentV1` shape a hand-typed evidence-textarea submission would (kind `EVIDENCE_PREVIEW` first, then `EVIDENCE_APPLY_SHADOW` after confirmation), through the same `POST /v1/intents` path.

**RED COMMAND:** `npm.cmd exec vitest -- run test/contract/conversation-flow.test.ts -t "submit"`
**EXPECTED RED:** preview-then-apply sequencing, duplicate-confirmation-idempotency, and no-second-mutation-path tests fail.
**Minimum implementation:** `submitConfirmedClaim` always calls preview first and only proceeds to apply after an explicit second confirmation call (mirrors the existing `EVIDENCE_PREVIEW`/`EVIDENCE_APPLY_SHADOW` two-step already used by the manual evidence UI); reuses the existing idempotency-key derivation from `createSubmissionKernel` (Task 16A/16B) so a duplicate confirmation (double "yes") reuses the same pending identity rather than double-submitting — no new idempotency mechanism is written.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/contract/conversation-flow.test.ts -t "submit"`
**EXPECTED GREEN:** exactly one `EVIDENCE_PREVIEW` POST followed by exactly one `EVIDENCE_APPLY_SHADOW` POST for one confirmed claim; a second, duplicate confirmation call produces zero additional POSTs; a fake HTTP transport proves no other endpoint (no direct D1 access, no bespoke mutation route) is ever called by this function.
**Checkpoint/review:** diff this function's request-construction code against the existing `submitAction` in `src/worker/admin.ts` — they must share the exact same `buildIntentPayload`/kernel call, not a parallel reimplementation. Commit: `feat: bridge conversational claims to canonical evidence apply`.

## Task 12: Safe spoken response integration

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/contract/conversation-flow.test.ts`

**Interfaces:** consumes the existing `VoicePresentation`/`speakVoicePresentation` allowlist (Task 18, unchanged) and Task 11's apply result plus real `EVIDENCE_PREVIEW` `delta`/`recoveryAnalysis` output; produces a debrief-specific safe summary sentence, and an explicit spoken surfacing of an `OVERSIGHT_BLOCKED` refusal (never a silent failure).

**RED COMMAND:** `npm.cmd exec vitest -- run test/contract/conversation-flow.test.ts -t "spoken"`
**EXPECTED RED:** delta-to-speech summary and blocked-surfaced-not-swallowed tests fail.
**Minimum implementation:** extend the existing safe-template mapping (never bypassing the Task 18 allowlist — only `VoicePresentation.safeSummary` reaches speech, exactly as today) with a debrief-flavored template that reads `delta.completionLikely`/`delta.shiftedActivityCount` from a real preview result into a fixed-shape sentence (no raw JSON, no free-text echo of the model's own words); when `submitConfirmedClaim` (Task 11) receives `OVERSIGHT_BLOCKED`, the spoken response is a fixed template naming that the item could not be recorded and why (block category, never raw problem JSON) — this is a new allowlisted template, not an exception to the allowlist.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/contract/conversation-flow.test.ts -t "spoken"`
**EXPECTED GREEN:** a real preview delta (using this session's actual DeBoard numbers — start shifted 2 workdays, completion Nov 11 -> Nov 13) produces the expected fixed-template sentence; an `OVERSIGHT_BLOCKED` result produces a spoken "I can't record that yet, it touches an unresolved block" style sentence rather than silence or a raw error dump.
**Checkpoint/review:** confirm the debrief template additions still pass every existing Task 18 "raw JSON/secret/problem text never spoken" test unmodified. Commit: `feat: add debrief spoken responses`.

## Task 13: Project onboarding/import architecture

**Files**
- Create: none
- Modify: `src/worker/index.ts`
- Test: `test/integration/project-import.test.ts` (new)

**Interfaces:** generalizes the existing `POST /v1/projects/deboard-v091/seed` handler into `POST /v1/projects/:id/import`, accepting a normalized baseline `ProjectModelV094`-shaped payload (no `eventLedger`) plus a provenance manifest; reuses `validateProjectModel`, `repo.createProject`, `forecastInitial` verbatim (all existing, unchanged).

**RED COMMAND:** `npm.cmd exec vitest -- run test/integration/project-import.test.ts`
**EXPECTED RED:** parameterized-route, preview-before-create, no-partial-create-on-failure, and provenance-manifest tests fail (route doesn't exist yet).
**Minimum implementation:** add the parameterized route; add an `import preview` step (dry-run `validateProjectModel` + `forecastInitial` without calling `repo.createProject`) reachable before the actual creation call, mirroring the `EVIDENCE_PREVIEW`/`EVIDENCE_APPLY_SHADOW` two-step pattern already used elsewhere in this codebase; on any validation failure during the actual create step, no `projects` row and no `project_events` row are written (the existing `repo.createProject` call is already one atomic operation per Task 12's original design — this task adds no new partial-write surface, it only generalizes the `projectId` parameter and adds the preview step in front of the existing call).
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/integration/project-import.test.ts`
**EXPECTED GREEN:** importing a normalized Stewart-shaped fixture via `POST /v1/projects/stewart-v01/import` succeeds and returns a receipt structurally identical to the existing `/seed` response; a preview call with the same payload performs zero D1 writes (asserted directly against the D1 binding); a payload that fails `validateProjectModel` leaves zero rows in `projects` for that ID; the receipt's provenance manifest names which source field backs each seeded activity/constraint.
**Checkpoint/review:** confirm `deboard-v091`'s existing `/seed` route either becomes a thin wrapper around the new parameterized route or is left completely untouched (either is acceptable; a second, divergent implementation is not) — read the diff to confirm which. Confirm no code in this task writes back to Google Drive or creates any new local summary/spreadsheet file. Commit: `feat: add generalized project import route`.

## Task 14: DeBoard factual-sync validation

**Files**
- Create: none
- Modify: none (validation-only task; if it exposes a defect, the fix belongs to the specific task above that owns the broken behavior, not a new ad hoc patch here)
- Test: manual smoke sequence against local `wrangler dev`, recorded in the task's checkpoint output — no new automated test file (Tasks 6/11's automated tests already cover the mechanism; this task proves it end-to-end on the real, familiar fixture)

**Interfaces:** consumes Tasks 1-13 complete; reuses the exact `deboard-sync.mjs`-style script/approach from the Den-activation session, with `mutationClass: "FACT"` now set explicitly on the constructed event.

**RED COMMAND:** re-run the Den-activation session's exact `EVIDENCE_APPLY_SHADOW` submission (same three masonry mutations: `SET_ACTUAL_START` on `masonry` dated 2026-08-28, `SET_CONSTRAINT_STATE` `SATISFIED` on `masonry-material`, `SET_CONSTRAINT_STATE` `SATISFIED` on `masonry-trade`, plus the `UPSERT_SOURCE`) against a freshly seeded local `deboard-v091`, with `mutationClass` **omitted** (today's default).
**EXPECTED RED:** `OVERSIGHT_BLOCKED`, `persisted: false`, revision unchanged — reproduces the exact Den-activation result, proving nothing upstream silently changed the baseline behavior.
**Implementation:** none — this is a pure validation task.
**GREEN COMMAND:** the same submission with `mutationClass: "FACT"` set explicitly.
**EXPECTED GREEN, checked in this exact order:**
1. `EVIDENCE_PREVIEW` succeeds (already proven in the Den-activation session; reconfirm unchanged).
2. `EVIDENCE_APPLY_SHADOW` succeeds — `persisted: true`, project revision advances from 1 to 2.
3. A fresh `FORECAST_HEALTH_QUERY` shows `masonry.state === "IN_PROGRESS"`, `actualStart === "2026-08-28"`.
4. `masonry-material` and `masonry-trade` constraints show `state: "SATISFIED"`.
5. Forecast/recovery numbers match the Den-activation session's preview exactly (completion-likely 2026-11-13, the same 30-activity/18-critical shift).
6. A fresh oversight review still reports `structural_reconcile`/`framing` and `brick_veneer` findings at `BLOCK` severity, unchanged wording.
7. The real `/admin/field` Penthouse view (same manual browser check pattern used throughout the Task 19 sessions) reflects `deboard-v091`'s updated status/finish/health in the portfolio row and, if still tracked as noteworthy, an updated priorities entry.

**Checkpoint/review:** this is the plan's actual proof that the whole pipeline works end to end on real, previously-blocked data. If any of the seven GREEN checks fails, do not patch around it in this task — identify which task above owns the broken piece, fix it there with its own RED/GREEN cycle, and re-run this validation from RED. Second block delivery date, garage-door dimensions, `structural_reconcile`, and `brick_veneer` remain untouched and unresolved throughout — confirm this explicitly as part of the checkpoint, not just implicitly by absence of change. Commit: `test: validate DeBoard factual sync end to end` (this commit records the validation script/notes used, not new production code).

## Task 15: Performance instrumentation (measurement only)

**Files**
- Create: none
- Modify: `src/operator/interpreter.ts`, `src/operator/claim-compiler.ts`, `src/worker/voice-transport.ts`
- Test: `test/unit/interpreter.test.ts`, `test/unit/claim-compiler.test.ts`, `test/contract/conversation-flow.test.ts`

**Interfaces:** each of `interpretTurn`, `compileClaim`, `submitConfirmedClaim` (preview and apply legs separately), and the existing `speakVoicePresentation` call site records a `{ stage: string; durationMs: number }` sample via an injected `recordTiming?: (sample) => void` callback — optional, no-op when absent, never required by any caller, never sent anywhere by default (no telemetry endpoint is added).

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/interpreter.test.ts test/unit/claim-compiler.test.ts test/contract/conversation-flow.test.ts -t "timing"`
**EXPECTED RED:** timing-callback-invoked tests fail (no instrumentation exists).
**Minimum implementation:** wrap each named stage's body with a start/end timestamp pair (using the same injected-clock convention as Task 18's confirmation expiry, so tests stay deterministic) and call `recordTiming` if provided. No model-provider change, no routing change, no caching, no batching — purely measurement.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/interpreter.test.ts test/unit/claim-compiler.test.ts test/contract/conversation-flow.test.ts -t "timing"`
**EXPECTED GREEN:** a fake clock/recorder proves each named stage reports exactly one timing sample per call, with no samples reported when `recordTiming` is omitted.
**Checkpoint/review:** confirm no new dependency, no new network destination, and no behavior change occurs when `recordTiming` is absent (the default, every existing call site). Commit: `feat: add optional stage timing instrumentation`.

## Task 16: Full regression and release verification

**Files**
- Create: none
- Modify: none unless a prior focused test exposes a defect
- Test: every file listed below

**Interfaces:** consumes all Task 1-15 outputs; produces classified test, gate, and scope results.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/conversation.test.ts test/unit/claim-compiler.test.ts test/unit/debrief.test.ts test/unit/interpreter.test.ts test/contract/conversation-flow.test.ts test/integration/fact-ingestion-scoped-oversight.test.ts test/integration/project-import.test.ts test/unit/operator-intent.test.ts`
**EXPECTED RED:** any incomplete conversational-layer behavior fails before final integration.
**GREEN COMMAND:** same command.
**EXPECTED GREEN:** all focused conversational-layer tests pass.

**REGRESSION COMMANDS:**
- Focused conversational-layer tests: the GREEN COMMAND above.
- Task 18 voice-transport tests (must be unmodified in behavior): `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts test/contract/voice-transport.test.ts`
- Task 17 release-gate tests: `npm.cmd run test:release-gate`; `npm.cmd run gate:release`
- Task 16B field-dashboard tests: `npm.cmd exec vitest -- run test/unit/field-dashboard.test.ts test/contract/field-dashboard.test.ts`
- Task 16A operator/admin UI tests: `npm.cmd exec vitest -- run test/unit/admin-ui.test.ts test/contract/admin-ui.test.ts`
- Task 15 operator contract tests: `npm.cmd exec vitest -- run test/contract/operator-routes.test.ts`
- Task 19 Penthouse presentation tests: `npm.cmd exec vitest -- run test/contract/penthouse-presentation.test.ts test/safety/public-assets.test.ts tools/browser-artifact/test/embedded-scripts.test.ts --config tools/browser-artifact/vitest.config.ts`
- Domain/engine unit tests (oversight/coverage/solver must be unaffected outside the one scoped gate rule): `npm.cmd exec vitest -- run test/unit/oversight.test.ts test/unit/coverage.test.ts test/unit/solver.test.ts test/unit/reducer.test.ts`
- Broader runtime suite: `npm.cmd test`
- Context suite: `npm.cmd run test:context-pack`
- Full verification: `npm.cmd run verify`
- Release gate: `npm.cmd run gate:release`
- Cloudflare type generation: `npm.cmd run cf-typegen:check`
- Dry build: `npm.cmd run build:dry`
- Whitespace: `git diff --check`

**EXPECTED RED:** a regression command identifies any changed accepted behavior or release-gate violation; the two known baseline defects (`test/safety/repository-policy.test.ts` CRLF regex, `tools/context-pack/test/select.test.ts:306:63` CRLF budget fixture) remain separately classified and non-blocking.
**Minimum implementation:** repair only local defects surfaced by this plan's own new code; do not weaken gates, do not modify unrelated baseline fixtures, do not touch Penthouse presentation, Index Card design, or forecast-engine internals to make a regression pass.
**EXPECTED GREEN:** focused conversational-layer, Task 18, Task 17, Task 16A/16B, Task 15, Task 19, domain/engine, and broader checks pass, with exactly the two accepted baseline defects reported where applicable and zero new failures.
**Checkpoint/review:** final changed-file audit (confirm the file list matches exactly this plan's "New/modified production modules" list plus test files); local commit `feat: add Howler conversational PM layer`. Do not push, merge, deploy, modify `deboard-v091`'s live-database revision beyond what Task 14's validation itself advances, or start Index Card design.

## Acceptance matrix

| # | Requirement | Exact test file/name | Fake/adapter | RED expectation | GREEN assertion |
|---:|---|---|---|---|---|
| 1 | one simple semantic claim | `test/unit/interpreter.test.ts` / `interpret_single_claim` | fake `callModel` | no interpreter | one `ConversationClaim` |
| 2 | two independent facts in one utterance | `test/unit/interpreter.test.ts` / `interpret_two_claims` | fake `callModel` | one merged/lost claim | two distinct `ConversationClaim`s |
| 3 | one valid + one ambiguous fact in same utterance | `test/unit/interpreter.test.ts` / `interpret_mixed_ambiguity` | fake `callModel` + fixture project model | all-or-nothing failure | one claim + one `Clarification`, independently |
| 4 | explicit project resolution | `test/unit/conversation.test.ts` / `resolve_project_explicit` | project/alias fixture | no resolver | exact `projectId` regardless of `activeProjectId` |
| 5 | inherited active-project context | `test/unit/conversation.test.ts` / `resolve_project_inherited` | session fixture | ignores context | `activeProjectId` used when `projectRef` empty |
| 6 | ambiguous project requires clarification | `test/unit/conversation.test.ts` / `resolve_project_ambiguous` | two-project fixture | tie-breaks | `Clarification` |
| 7 | correction replaces pending claim instead of duplicating | `test/unit/conversation.test.ts` / `correction_replaces_pending` | session with one pending claim | new claim appended | same claim mutated, count unchanged |
| 8 | correction with no uniquely active claim clarifies | `test/unit/conversation.test.ts` / `correction_no_target_clarifies` | empty/ambiguous session | guesses target | `Clarification` |
| 9 | "I think Friday but don't mark it yet" never reaches Apply | `test/unit/conversation.test.ts` / `tentative_never_confirms` | session fixture | reaches `AWAITING_CONFIRMATION` | stays `UNCONFIRMED`, absent from any compiled set |
| 10 | "Leave that open" keeps DebriefItem unresolved | `test/unit/conversation.test.ts` / `defer_keeps_item_open` | debrief-item fixture | status flips resolved | `status === "OPEN"` after defer |
| 11 | "Yes, that's done" binds only to the exact active stale item | `test/unit/conversation.test.ts` / `completion_binds_exact_item` | session with `currentQuestionRef` | fuzzy-binds most recent | binds only `currentQuestionRef`; unset ref clarifies |
| 12 | old source planned date becomes UNKNOWN OUTCOME after its expected time | `test/unit/debrief.test.ts` / `freshness_planned_becomes_unknown` | real Aug 31 KF fixture, fixed `now` | stays PLANNED forever | `UNKNOWN_OUTCOME` once `now` passes the date |
| 13 | planned future work is not treated as observed completion | `test/unit/debrief.test.ts` / `freshness_planned_not_observed` | same fixture | classified OBSERVED | `PLANNED_SCHEDULED` before its date |
| 14 | factual masonry start accepted despite unrelated framing/LVL BLOCK | `test/integration/fact-ingestion-scoped-oversight.test.ts` / `fact_applies_despite_unrelated_block` | real DeBoard seed fixture | `OVERSIGHT_BLOCKED` | `persisted: true`, revision advances |
| 15 | unrelated BLOCK remains BLOCK after factual apply | `test/integration/fact-ingestion-scoped-oversight.test.ts` / `unrelated_block_persists_after_fact` | same fixture | finding cleared/downgraded | `structural_reconcile`/`brick_veneer` still `BLOCK`, same message |
| 16 | fact that directly overlaps a blocked safety condition cannot bypass the relevant BLOCK automatically | `test/integration/fact-ingestion-scoped-oversight.test.ts` / `overlapping_fact_still_blocked` | same fixture, event scoped to `structural_reconcile` | applies via FACT path | `OVERSIGHT_BLOCKED`, identical to COMMITMENT-class |
| 17 | COMMITMENT/action remains blocked where safety applies | `test/integration/fact-ingestion-scoped-oversight.test.ts` / `commitment_class_still_blocked` | same fixture, `mutationClass: "COMMITMENT"` scoped to `masonry` | applies via scoped rule | `OVERSIGHT_BLOCKED` (proves gate is class-checked, not scope-only) |
| 18 | deterministic compiler rejects unknown entity IDs | `test/unit/conversation.test.ts` / `resolve_entity_unknown_rejected` | project model fixture | fabricates an ID | `Clarification`, no ID returned |
| 19 | deterministic compiler rejects ambiguous entity mapping | `test/unit/conversation.test.ts` / `resolve_entity_ambiguous_rejected` | two-match fixture | first-match guess | `Clarification` naming both |
| 20 | interpreter cannot specify an EventMutation opcode | `test/unit/interpreter.test.ts` / `interpreter_output_has_no_mutation_op` | malformed fake `callModel` response | forbidden key survives | `assertNoForbiddenClaimFields` strips/rejects |
| 21 | interpreter cannot choose verification state | `test/unit/interpreter.test.ts` / `interpreter_output_has_no_verification` | same | forbidden key survives | absent from returned claims |
| 22 | interpreter cannot choose mutationClass | `test/unit/interpreter.test.ts` / `interpreter_output_has_no_mutation_class` | same | forbidden key survives | absent; `compileClaim` is sole assigner (Task 5 checkpoint) |
| 23 | no raw audio persistence | `test/unit/conversation.test.ts` / `no_audio_in_session_or_claim` | storage/session spy | audio field present | zero audio bytes anywhere in session/claim/event |
| 24 | session bounded-turn retention | `test/unit/conversation.test.ts` / `session_turn_log_bounded` | 25-turn fixture | unbounded growth | exactly last 20 retained |
| 25 | session teardown clears ephemeral context | `test/unit/conversation.test.ts` / `session_end_discards_state` | session fixture | state survives `endSession` | no module-level state exists to survive |
| 26 | confirmed applied fact gets durable provenance | `test/contract/conversation-flow.test.ts` / `applied_fact_has_provenance` | fake HTTP + real compiler | missing/generic source | `UPSERT_SOURCE` with `VOICE_CONVERSATION` type, transcript excerpt, session/turn ref |
| 27 | deferred/tentative fact does not become durable project truth | `test/contract/conversation-flow.test.ts` / `deferred_never_applied` | fake HTTP | apply attempted | zero `EVIDENCE_APPLY_SHADOW` POSTs for deferred/tentative claims |
| 28 | duplicate voice confirmation cannot double-apply | `test/contract/conversation-flow.test.ts` / `duplicate_confirmation_single_apply` | fake HTTP | two POSTs | exactly one `EVIDENCE_APPLY_SHADOW` POST |
| 29 | oversight BLOCK is surfaced conversationally, not silently swallowed | `test/contract/conversation-flow.test.ts` / `blocked_result_spoken_not_silent` | fake synthesis | silent/generic failure | fixed allowlisted "could not record, unresolved block" template |
| 30 | six-project onboarding preserves source provenance | `test/integration/project-import.test.ts` / `import_preserves_provenance` | Stewart-shaped fixture | missing manifest | every seeded activity/constraint traces to a named source |
| 31 | onboarding does not create six permanent handwritten seed files | `test/integration/project-import.test.ts` / `import_route_is_parameterized` | route introspection | one seed file per project | one parameterized route, zero new `*-seed.ts` files (checked by file-existence assertion) |
| 32 | import preview occurs before project creation | `test/integration/project-import.test.ts` / `import_preview_before_create` | D1 write spy | preview writes | zero D1 writes during preview |
| 33 | import failure leaves no partial project | `test/integration/project-import.test.ts` / `import_failure_no_partial_write` | invalid model fixture | partial row written | zero rows in `projects`/`project_events` for the failed ID |
| 34 | live PM doc remains input, not a competing operational database | `test/integration/project-import.test.ts` / `import_never_writes_back_to_source` | Drive-write spy | write-back call | zero write/update calls to the source document |
| 35 | DeBoard's two existing BLOCK findings remain untouched during masonry fact synchronization | Task 14 manual validation, step 6 | real local `wrangler dev` | findings altered/cleared | identical `BLOCK` severity and message, both findings |

Every matrix row is implemented by Tasks 1-13; Task 14 is the end-to-end proof; Task 15 adds measurement only; Task 16 executes the complete matrix and regression commands.

## Explicit scope boundary

This plan does not change, and no task above may be used to justify changing: Penthouse dashboard design (composition, atmosphere, navigation, portfolio/priorities/movement presentation — all Task 19, accepted). Index Card design (not started by any task here). Forecast engine internals (`src/engine/*` — `solver.ts`, `confidence.ts`, `coverage.ts`, `reducer.ts` are read from, never modified, except that Task 6's regression command explicitly re-runs their existing tests unchanged to prove this). Model-provider/AI routing (Task 9's `callModel` is a single injected function boundary, not a routing layer). Storage architecture (D1 schema changes are limited to the one additive `mutationClass` field; no new table). Wake word, background listening, or any capture-lifecycle change (Task 18's `VoiceCaptureAdapter` is untouched). Phone Action Button. Production deployment. Google Drive backend redesign (the onboarding importer reads a document; it never writes one).
