// Conversational PM layer — semantic claim model and ephemeral session state.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// and docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md (commit ee7fef2).
//
// This module owns the *semantic* boundary the probabilistic interpreter is allowed to emit:
// ConversationClaim carries a business-meaning `claimType` label only. It has no field that
// could ever be serialized into an EventMutationV094 op, a real activityId/constraintId, a
// VerificationState, or a mutationClass — those five decisions belong exclusively to the
// deterministic compiler (src/operator/claim-compiler.ts), never to this type or its producer.

import { normalizeProjectId, projectMention } from "../worker/voice-transport";
import type { DebriefItem } from "./debrief";
import type { ProjectModelV094 } from "../domain/types";

export type ConversationClaimType =
  // OBSERVED (past/already-occurred) — the compiler classifies every one of these FACT.
  | "ACTIVITY_STARTED"
  | "ACTIVITY_COMPLETED"
  | "ITEM_COMPLETED"
  | "DELIVERY_RECEIVED"
  | "INSPECTION_COMPLETED"
  | "CONDITION_OBSERVED"
  // COMMITMENT (future intent/schedule/promise/request/expectation) — the compiler classifies
  // every one of these COMMITMENT.
  | "SCHEDULE_CHANGED"
  | "DELIVERY_EXPECTED"
  | "TRADE_ATTENDANCE_PLANNED"
  | "WORK_REQUESTED"
  | "DECISION_EXPECTED"
  // NON-MUTATING — no mutation is ever produced for these; they only confirm an item stays
  // open, unchanged.
  | "DECISION_UNRESOLVED"
  | "CONSTRAINT_UNRESOLVED";

export interface ConversationClaim {
  claimId: string;
  sessionId: string;
  projectRef: string; // raw project name/alias text as spoken, not a resolved projectId
  subjectRef: string; // resolved-candidate label if the interpreter has a guess
  subjectText: string; // raw spoken phrase
  claimType: ConversationClaimType;
  value?: string; // free-form claimed value, e.g. a date string, a state description
  effectiveDate?: string; // ISO date if the claim states or implies one
  certainty: "STATED" | "TENTATIVE";
  sourceTurnId: string;
  capturedAt: string; // ISODateTime, when the interpreter produced this claim
  userConfirmationState:
    | "UNCONFIRMED"
    | "AWAITING_CONFIRMATION"
    | "CONFIRMED"
    | "DEFERRED"
    | "DISCARDED";
}

/**
 * The five keys a `ConversationClaim` must never carry: any of them would let an interpreter
 * (probabilistic, AI-authored) reach past the semantic boundary into a decision that belongs
 * exclusively to the deterministic compiler. Used as a structural guardrail both by this file's
 * own tests and by the interpreter (Task 9) before returning any parsed claim to a caller.
 */
const FORBIDDEN_CLAIM_FIELDS = [
  "mutationOp",
  "activityId",
  "constraintId",
  "verification",
  "mutationClass",
] as const;

export function assertNoForbiddenClaimFields(claim: unknown): void {
  if (typeof claim !== "object" || claim === null) {
    throw new Error("assertNoForbiddenClaimFields: claim must be an object");
  }
  const record = claim as Record<string, unknown>;
  const present = FORBIDDEN_CLAIM_FIELDS.filter((key) => key in record);
  if (present.length > 0) {
    throw new Error(
      `ConversationClaim carries forbidden field(s): ${present.join(", ")}. ` +
        "Only the deterministic claim compiler may decide a mutation op, activity/constraint " +
        "id, verification state, or mutationClass.",
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Ephemeral conversation/debrief session state (Task 2).
//
// Ephemeral, in-memory for the life of one debrief; never written to D1; discarded when the
// session ends. Every function below is a pure, immutable-update function — none reference
// module-level `let`/`const` state, `fetch`, D1, `localStorage`, or `sessionStorage`. The only
// place session data ever lives is the caller's own reference to the value these functions
// return.
// ---------------------------------------------------------------------------------------------

export interface Clarification {
  kind: "CLARIFICATION";
  message: string;
  candidates?: string[];
  relatedClaimId?: string;
}

export interface ConversationSession {
  sessionId: string;
  startedAt: string;
  activeProjectId: string | null;
  activeDebriefItems: DebriefItem[];
  currentQuestionRef: string | null; // itemId currently being asked about
  pendingClaims: ConversationClaim[];
  unresolvedClarifications: { message: string; relatedClaimId?: string }[];
  lastReferencedEntity: {
    type: "activity" | "constraint";
    id: string;
    label: string;
  } | null;
  turnLog: { turnId: string; text: string; at: string }[]; // bounded, last 20 turns only
  confirmationState: "IDLE" | "AWAITING_CONFIRMATION";
}

const TURN_LOG_LIMIT = 20;

let sessionSequence = 0;

/**
 * `sessionSequence` above is module-level, but it is purely a monotonic counter used to make
 * generated sessionIds unique within a process — it never holds session content, and nothing
 * about a `ConversationSession`'s own data (claims, turns, entities) is ever stored here. A
 * session's actual state lives only in the object this function returns and whatever the caller
 * does with it.
 */
export function createSession(startedAt: string): ConversationSession {
  sessionSequence += 1;
  return {
    sessionId: `conv-session-${startedAt}-${String(sessionSequence)}`,
    startedAt,
    activeProjectId: null,
    activeDebriefItems: [],
    currentQuestionRef: null,
    pendingClaims: [],
    unresolvedClarifications: [],
    lastReferencedEntity: null,
    turnLog: [],
    confirmationState: "IDLE",
  };
}

export function pushTurn(
  session: ConversationSession,
  turn: { turnId: string; text: string; at: string },
): ConversationSession {
  return {
    ...session,
    turnLog: [...session.turnLog, turn].slice(-TURN_LOG_LIMIT),
  };
}

export function addClaim(
  session: ConversationSession,
  claim: ConversationClaim,
): ConversationSession {
  return { ...session, pendingClaims: [...session.pendingClaims, claim] };
}

function replaceClaim(
  session: ConversationSession,
  claimId: string,
  update: (claim: ConversationClaim) => ConversationClaim,
): ConversationSession {
  return {
    ...session,
    pendingClaims: session.pendingClaims.map((claim) =>
      claim.claimId === claimId ? update(claim) : claim,
    ),
  };
}

/**
 * Replaces a single pending claim's `value`/`effectiveDate` in place — no new claim is appended,
 * no duplicate project event can ever result. Callers (Task 10's `resolveCorrection`) are
 * responsible for first proving exactly one candidate claim exists; this function only performs
 * the in-place patch once a target claimId is already known.
 *
 * `patch.effectiveDate` has three distinct states, not two: a real ISO string sets it, `undefined`
 * leaves it untouched, and `null` explicitly clears it. Field-readiness blocker fix: a correction
 * whose text carries a new `value` but no ISO date literal (`null`) must clear the claim's
 * existing `effectiveDate` rather than silently keep the old one — "No, Thursday actually" against
 * a claim previously dated for Wednesday must not leave that stale Wednesday date in place, since
 * this deterministic layer has no day-name-to-ISO-date resolution to trust it's still correct.
 * `compileClaim`'s own `requireDate` then naturally re-asks for a date on the next compile attempt
 * instead of silently compiling against a now-contradicted one.
 */
export function applyCorrection(
  session: ConversationSession,
  claimId: string,
  patch: { value?: string; effectiveDate?: string | null },
): ConversationSession {
  return replaceClaim(session, claimId, (claim) => {
    const next: ConversationClaim = {
      ...claim,
      ...(patch.value !== undefined ? { value: patch.value } : {}),
    };
    if (patch.effectiveDate === null) {
      delete next.effectiveDate;
    } else if (patch.effectiveDate !== undefined) {
      next.effectiveDate = patch.effectiveDate;
    }
    return next;
  });
}

export function deferClaim(
  session: ConversationSession,
  claimId: string,
): ConversationSession {
  return replaceClaim(session, claimId, (claim) => ({
    ...claim,
    userConfirmationState: "DEFERRED",
  }));
}

/**
 * Pilot activation: a real bug found via a real browser session -- confirming (or rejecting) a
 * claim through the HTTP conversation/turn route's `confirm` branch previously left that claim
 * sitting in `session.pendingClaims` at `AWAITING_CONFIRMATION` forever (the confirm branch never
 * touched claim state at all), so a later, unrelated "not sure yet" utterance could match
 * `findAwaitingClaim` against an already-resolved claim and defer it instead of falling through to
 * fresh interpretation. `discardClaim` gives the confirm branch a real transition for the
 * user-said-no case, mirroring `confirmClaim`'s user-said-yes transition exactly.
 */
export function discardClaim(
  session: ConversationSession,
  claimId: string,
): ConversationSession {
  return replaceClaim(session, claimId, (claim) => ({
    ...claim,
    userConfirmationState: "DISCARDED",
  }));
}

/**
 * Field-readiness blocker fix: a `TENTATIVE` claim ("I think Friday but don't mark it yet") must
 * never reach `CONFIRMED` through this function, even if a caller mistakenly invokes it directly
 * — the design's own invariant is that a `TENTATIVE` claim is structurally incapable of reaching
 * `compileClaim`'s provenance step. Refuses with a `Clarification` instead of silently no-op'ing,
 * so a caller that expected a confirmation to happen finds out it didn't.
 */
export function confirmClaim(
  session: ConversationSession,
  claimId: string,
): ConversationSession | Clarification {
  const target = session.pendingClaims.find(
    (claim) => claim.claimId === claimId,
  );
  if (target && target.certainty === "TENTATIVE") {
    return {
      kind: "CLARIFICATION",
      message:
        "That was only a tentative note — say it again more definitely to record it.",
      relatedClaimId: claimId,
    };
  }
  return replaceClaim(session, claimId, (claim) => ({
    ...claim,
    userConfirmationState: "CONFIRMED",
  }));
}

/**
 * Ephemeral by construction: there is no module-level session store to clear, so this function
 * is a deliberate no-op. It exists only to make "nothing persists when the session ends" an
 * explicit, testable contract point — the caller's own reference was always the only place this
 * session's data lived, and discarding that reference is the caller's job, not this function's.
 */
export function endSession(session: ConversationSession): void {
  void session;
}

// ---------------------------------------------------------------------------------------------
// Deterministic project/entity resolution (Task 3).
//
// String/label matching against real, already-loaded model data — never a second LLM call, never
// a guess. Zero or multiple candidate matches always fail closed to a `Clarification`; a resolved
// id is structurally guaranteed to be a real key of `projectModel.activities`/`.constraints`
// since it is only ever read out of those two records, never constructed.
// ---------------------------------------------------------------------------------------------

const ENTITY_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "is",
  "are",
  "was",
  "were",
  "that",
  "this",
  "it",
  "its",
  "for",
  "with",
  "has",
  "have",
  "had",
]);

function tokenize(text: string): string[] {
  return normalizeProjectId(text)
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3 && !ENTITY_STOPWORDS.has(token));
}

/**
 * Reuses `projectMention()` (`src/worker/voice-transport.ts`, unchanged) for the actual
 * resolution decision. An explicit, non-empty `claim.projectRef` is never overridden by
 * `session.activeProjectId` — the active project only ever fills in for a claim that names no
 * project at all.
 */
export function resolveClaimProject(
  claim: ConversationClaim,
  session: ConversationSession,
  knownProjectIds: string[],
  aliases: { alias: string; projectId: string }[],
): string | Clarification {
  const explicit = claim.projectRef.trim();
  if (explicit.length === 0) {
    if (session.activeProjectId) return session.activeProjectId;
    return { kind: "CLARIFICATION", message: "Which project do you mean?" };
  }
  const match = projectMention(explicit, {
    projectIds: knownProjectIds,
    aliases,
  });
  if (match) return match;

  // Candidate list purely for the clarification message — the resolve/no-resolve decision
  // itself belongs entirely to projectMention above, unchanged.
  const normalized = normalizeProjectId(explicit);
  const idCandidates = knownProjectIds.filter((id) =>
    normalized.includes(normalizeProjectId(id)),
  );
  const aliasCandidates = aliases
    .filter((alias) => normalized.includes(normalizeProjectId(alias.alias)))
    .map((alias) => alias.projectId);
  const candidates = Array.from(new Set([...idCandidates, ...aliasCandidates]));
  return {
    kind: "CLARIFICATION",
    message:
      candidates.length > 1
        ? `Which project do you mean — ${candidates.join(" or ")}?`
        : "Which project do you mean?",
    ...(candidates.length > 0 ? { candidates } : {}),
  };
}

/**
 * Matches `claim.subjectText`/`subjectRef` case-insensitively against each activity's/
 * constraint's `name`/`label`/`tags`. It is structurally impossible for this function to return
 * an id absent from `projectModel.activities`/`.constraints`, since every candidate id is read
 * directly from those two records, never synthesized.
 */
export function resolveClaimEntity(
  claim: ConversationClaim,
  projectModel: ProjectModelV094,
): { type: "activity" | "constraint"; id: string } | Clarification {
  const subjectTokens = new Set(
    tokenize(`${claim.subjectText} ${claim.subjectRef}`),
  );
  if (subjectTokens.size === 0) {
    return {
      kind: "CLARIFICATION",
      message: `I could not identify what "${claim.subjectText}" refers to.`,
    };
  }

  const candidates: {
    type: "activity" | "constraint";
    id: string;
    label: string;
  }[] = [];

  for (const activity of Object.values(projectModel.activities)) {
    // Field-readiness blocker fix: also match the activity's own id, not just its display name/
    // tags -- a real activity like DeBoard's "masonry" (display name "CMU foundation walls", no
    // tags at all) is exactly what a PM says out loud, and previously had no way to resolve at
    // all short of literally saying "CMU foundation walls".
    const candidateTokens = tokenize(
      [activity.id, activity.name, ...(activity.tags ?? [])].join(" "),
    );
    if (candidateTokens.some((token) => subjectTokens.has(token))) {
      candidates.push({
        type: "activity",
        id: activity.id,
        label: activity.name,
      });
    }
  }
  for (const constraint of Object.values(projectModel.constraints)) {
    const candidateTokens = tokenize(`${constraint.id} ${constraint.label}`);
    if (candidateTokens.some((token) => subjectTokens.has(token))) {
      candidates.push({
        type: "constraint",
        id: constraint.id,
        label: constraint.label,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      kind: "CLARIFICATION",
      message: `I could not find "${claim.subjectText}" in this project.`,
    };
  }
  if (candidates.length > 1) {
    return {
      kind: "CLARIFICATION",
      message: `That could mean more than one thing: ${candidates
        .map((candidate) => candidate.label)
        .join(", ")}.`,
      candidates: candidates.map((candidate) => candidate.label),
    };
  }
  const only = candidates[0];
  if (!only) {
    return {
      kind: "CLARIFICATION",
      message: `I could not find "${claim.subjectText}" in this project.`,
    };
  }
  return { type: only.type, id: only.id };
}

// ---------------------------------------------------------------------------------------------
// Correction, defer, and uncertainty behavior (Task 10).
// ---------------------------------------------------------------------------------------------

/**
 * Field-readiness blocker fix: this previously required the entity's whole `id`/`label` to appear
 * as a literal substring of the claim's subject text -- which holds for a hand-typed fixture like
 * subjectText "masonry schedule" against id "masonry", but not for a naturally-phrased utterance
 * like subjectText "DeBoard foundation" (the claim that started the real DeBoard "masonry"
 * activity, display name "CMU foundation walls") -- neither the id nor the full label is a
 * substring of that subject, even though "foundation" plainly refers to the same activity. Now
 * uses the same token-overlap matching `resolveClaimEntity` already uses to resolve entities in
 * the first place, so the two stay consistent: whatever `resolveClaimEntity` was willing to match
 * a claim to, this can recognize a later correction/defer utterance referring back to.
 */
export function claimMatchesLastReferencedEntity(
  claim: ConversationClaim,
  entity: ConversationSession["lastReferencedEntity"],
): boolean {
  if (!entity) return false;
  const subjectTokens = new Set(
    tokenize(`${claim.subjectText} ${claim.subjectRef}`),
  );
  const entityTokens = tokenize(`${entity.id} ${entity.label}`);
  return entityTokens.some((token) => subjectTokens.has(token));
}

const ISO_DATE_IN_TEXT = /\d{4}-\d{2}-\d{2}/;

/** Deterministic, non-LLM extraction of a correction's new value/date from raw correction text
 * (e.g. "No, Thursday actually" / "No, 2026-09-10 actually"). Strips common correction framing
 * ("No,", "actually") and keeps the remainder as the claim's new `value`; an ISO date literally
 * present in the text also becomes the new `effectiveDate`. This function never calls a model —
 * it is deliberately conservative rather than attempting full natural-language date resolution.
 * Field-readiness blocker fix: when the correction changes `value` but carries no ISO date literal
 * (e.g. a day name like "Thursday", which this deterministic layer cannot resolve to a real date),
 * `effectiveDate` is explicitly `null` — a signal to `applyCorrection` to clear the claim's
 * existing date rather than silently leave a now-contradicted one in place. */
function extractCorrectionPatch(text: string): {
  value?: string;
  effectiveDate?: string | null;
} {
  const cleaned = text
    .trim()
    .replace(/^no[,]?\s*/i, "")
    // Field-readiness blocker fix: "Actually Tuesday" (leading "Actually", no "No,") is a real
    // correction phrasing the field test uses, distinct from the trailing "...actually." form
    // already handled below -- both strip to the same bare value.
    .replace(/^actually[,]?\s*/i, "")
    .replace(/\s*,?\s*actually\.?$/i, "")
    .trim();
  const isoMatch = ISO_DATE_IN_TEXT.exec(cleaned);
  const patch: { value?: string; effectiveDate?: string | null } = {};
  if (cleaned.length > 0) {
    patch.value = cleaned;
    patch.effectiveDate = isoMatch ? isoMatch[0] : null;
  }
  return patch;
}

/**
 * "No, Thursday actually." — resolved against `session.pendingClaims` filtered to
 * `AWAITING_CONFIRMATION` claims whose subject matches `session.lastReferencedEntity`. Exactly
 * one candidate mutates that claim's `value`/`effectiveDate` in place (no new claim, no
 * duplicate project event — reuses Task 2's `applyCorrection`). Zero or multiple candidates fail
 * closed to a `Clarification` rather than guessing which pending claim the correction targets.
 */
export function resolveCorrection(
  session: ConversationSession,
  text: string,
): ConversationSession | Clarification {
  const candidates = session.pendingClaims.filter(
    (claim) =>
      claim.userConfirmationState === "AWAITING_CONFIRMATION" &&
      claimMatchesLastReferencedEntity(claim, session.lastReferencedEntity),
  );
  if (candidates.length !== 1) {
    return {
      kind: "CLARIFICATION",
      message: "I don't have an open item to correct — what should I update?",
    };
  }
  const target = candidates[0];
  if (!target) {
    return {
      kind: "CLARIFICATION",
      message: "I don't have an open item to correct — what should I update?",
    };
  }
  const patch = extractCorrectionPatch(text);
  return applyCorrection(session, target.claimId, patch);
}

/**
 * "Yes, that's done." — binds only to the exact `DebriefItem` at `session.currentQuestionRef`,
 * never a fuzzy "most recent" guess. An unset `currentQuestionRef`, or one that no longer names
 * an active item, fails closed to a `Clarification` rather than guessing which item.
 *
 * Field-readiness blocker fix: this used to flip the `DebriefItem`'s own `status` to
 * `"CONFIRMED_COMPLETE"` directly, in the ephemeral session view, with no corresponding canonical
 * project mutation ever produced — a user saying "yes, that's done" made the debrief item *look*
 * resolved while the real project model's activity/constraint state never changed. It now leaves
 * `activeDebriefItems` untouched and instead adds a real `ITEM_COMPLETED` `ConversationClaim`
 * (already `CONFIRMED`, since the user just explicitly affirmed it) to `session.pendingClaims` —
 * the same claim the compiler/evidence-apply pipeline is built to carry through to a real
 * mutation. The item's status only actually changes once that claim is compiled, applied, and
 * `buildDebriefItems` re-derives the view from the new canonical truth; this function itself
 * never claims completion ahead of that.
 */
export function resolveCompletion(
  session: ConversationSession,
  text: string,
  now: string = new Date().toISOString(),
): ConversationSession | Clarification {
  void text;
  if (!session.currentQuestionRef) {
    return {
      kind: "CLARIFICATION",
      message: "I don't know which item you mean — what should I mark done?",
    };
  }
  const targetId = session.currentQuestionRef;
  const target = session.activeDebriefItems.find(
    (item) => item.itemId === targetId,
  );
  if (!target) {
    return {
      kind: "CLARIFICATION",
      message: "That item is no longer active — what should I mark done?",
    };
  }
  const claim: ConversationClaim = {
    claimId: `completion-${target.itemId}`,
    sessionId: session.sessionId,
    projectRef: target.projectId,
    subjectRef: target.subject,
    subjectText: target.subject,
    claimType: "ITEM_COMPLETED",
    certainty: "STATED",
    sourceTurnId: `turn-${String(session.turnLog.length)}`,
    capturedAt: now,
    userConfirmationState: "CONFIRMED",
  };
  return addClaim(session, claim);
}
