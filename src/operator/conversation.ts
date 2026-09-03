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
    const candidateTokens = tokenize(
      [activity.name, ...(activity.tags ?? [])].join(" "),
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
    const candidateTokens = tokenize(constraint.label);
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

function claimMatchesLastReferencedEntity(
  claim: ConversationClaim,
  entity: ConversationSession["lastReferencedEntity"],
): boolean {
  if (!entity) return false;
  const subject = `${claim.subjectText} ${claim.subjectRef}`.toLowerCase();
  return (
    subject.includes(entity.id.toLowerCase()) ||
    subject.includes(entity.label.toLowerCase())
  );
}

const ISO_DATE_IN_TEXT = /\d{4}-\d{2}-\d{2}/;

/** Deterministic, non-LLM extraction of a correction's new value/date from raw correction text
 * (e.g. "No, Thursday actually" / "No, 2026-09-10 actually"). Strips common correction framing
 * ("No,", "actually") and keeps the remainder as the claim's new `value`; an ISO date literally
 * present in the text also becomes the new `effectiveDate`. This function never calls a model —
 * it is deliberately conservative rather than attempting full natural-language date resolution. */
function extractCorrectionPatch(text: string): {
  value?: string;
  effectiveDate?: string;
} {
  const cleaned = text
    .trim()
    .replace(/^no[,]?\s*/i, "")
    .replace(/\s*,?\s*actually\.?$/i, "")
    .trim();
  const isoMatch = ISO_DATE_IN_TEXT.exec(cleaned);
  const patch: { value?: string; effectiveDate?: string } = {};
  if (cleaned.length > 0) patch.value = cleaned;
  if (isoMatch) patch.effectiveDate = isoMatch[0];
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
 */
export function resolveCompletion(
  session: ConversationSession,
  text: string,
): ConversationSession | Clarification {
  void text;
  if (!session.currentQuestionRef) {
    return {
      kind: "CLARIFICATION",
      message: "I don't know which item you mean — what should I mark done?",
    };
  }
  const targetId = session.currentQuestionRef;
  const index = session.activeDebriefItems.findIndex(
    (item) => item.itemId === targetId,
  );
  if (index === -1) {
    return {
      kind: "CLARIFICATION",
      message: "That item is no longer active — what should I mark done?",
    };
  }
  const items = [...session.activeDebriefItems];
  const target = items[index];
  if (!target) {
    return {
      kind: "CLARIFICATION",
      message: "That item is no longer active — what should I mark done?",
    };
  }
  items[index] = { ...target, status: "CONFIRMED_COMPLETE" };
  return { ...session, activeDebriefItems: items };
}
