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
