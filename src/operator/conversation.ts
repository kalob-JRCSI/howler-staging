// Conversational PM layer — semantic claim model and ephemeral session state.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// and docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md (commit ee7fef2).
//
// This module owns the *semantic* boundary the probabilistic interpreter is allowed to emit:
// ConversationClaim carries a business-meaning `claimType` label only. It has no field that
// could ever be serialized into an EventMutationV094 op, a real activityId/constraintId, a
// VerificationState, or a mutationClass — those five decisions belong exclusively to the
// deterministic compiler (src/operator/claim-compiler.ts), never to this type or its producer.

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
  activeDebriefItems: unknown[]; // DebriefItem[] — typed by src/operator/debrief.ts (Task 8)
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
 */
export function applyCorrection(
  session: ConversationSession,
  claimId: string,
  patch: { value?: string; effectiveDate?: string },
): ConversationSession {
  return replaceClaim(session, claimId, (claim) => ({
    ...claim,
    ...(patch.value !== undefined ? { value: patch.value } : {}),
    ...(patch.effectiveDate !== undefined
      ? { effectiveDate: patch.effectiveDate }
      : {}),
  }));
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

export function confirmClaim(
  session: ConversationSession,
  claimId: string,
): ConversationSession {
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
export function endSession(_session: ConversationSession): void {
  return;
}
