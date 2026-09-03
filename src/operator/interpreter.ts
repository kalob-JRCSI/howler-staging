// The single probabilistic boundary of the conversational PM layer.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// "Semantic claim boundary" and "Multi-fact parsing" sections, and
// docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md Task 9.
//
// This is the ONLY module that ever calls out to a language-understanding step (via the injected
// `callModel`); everything downstream of it (conversation.ts, claim-compiler.ts, debrief.ts) is
// pure and deterministic. `callModel` is an injected dependency exactly like Task 18's
// fake-clock/fake-recognition convention — tests never call a real model.

import {
  assertNoForbiddenClaimFields,
  type Clarification,
  type ConversationClaim,
  type ConversationClaimType,
  type ConversationSession,
} from "./conversation";

const CLAIM_TYPES = new Set<ConversationClaimType>([
  "ACTIVITY_STARTED",
  "ACTIVITY_COMPLETED",
  "ITEM_COMPLETED",
  "DELIVERY_RECEIVED",
  "INSPECTION_COMPLETED",
  "CONDITION_OBSERVED",
  "SCHEDULE_CHANGED",
  "DELIVERY_EXPECTED",
  "TRADE_ATTENDANCE_PLANNED",
  "WORK_REQUESTED",
  "DECISION_EXPECTED",
  "DECISION_UNRESOLVED",
  "CONSTRAINT_UNRESOLVED",
]);

export interface InterpretedTurn {
  claims: ConversationClaim[];
  clarifications: Clarification[];
}

export interface InterpreterVocabulary {
  projectIds: string[];
  aliases: { alias: string; projectId: string }[];
}

function buildPrompt(
  text: string,
  session: ConversationSession,
  vocabulary: InterpreterVocabulary,
): string {
  return [
    "You are extracting semantic PM claims from a spoken debrief turn.",
    "Return ONLY JSON of the shape:",
    '{"spans": [ {"type": "CLAIM", "projectRef": string, "subjectRef": string, "subjectText": string, "claimType": one of the thirteen ConversationClaimType values, "value"?: string, "effectiveDate"?: string (ISO date), "certainty": "STATED" | "TENTATIVE"} | {"type": "CLARIFICATION", "message": string, "candidates"?: string[]} ]}',
    "Segment the utterance into independent claim spans. Never choose a mutation opcode, activity/constraint id, verification state, or mutationClass -- only the claimType label. If you cannot confidently tell whether a span is observed (past) or a future commitment, return a CLARIFICATION span for it instead of guessing.",
    `Known projects: ${vocabulary.projectIds.join(", ") || "(none supplied)"}`,
    `Active project: ${session.activeProjectId ?? "(none)"}`,
    `Utterance: ${text}`,
  ].join("\n");
}

interface RawClaimSpan {
  type?: unknown;
  projectRef?: unknown;
  subjectRef?: unknown;
  subjectText?: unknown;
  claimType?: unknown;
  value?: unknown;
  effectiveDate?: unknown;
  certainty?: unknown;
  message?: unknown;
  candidates?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds a `ConversationClaim` by copying ONLY the seven legitimate claim fields the interpreter
 * is allowed to populate — never a wholesale spread of the raw model span. This is what actually
 * strips a forbidden field (`mutationOp`/`activityId`/`constraintId`/`verification`/
 * `mutationClass`) of any ability to matter, regardless of what extra JSON keys a malformed or
 * adversarial model response contained; `assertNoForbiddenClaimFields` below is then a
 * defense-in-depth check on top of that, not the only line of defense.
 */
function toClaim(
  raw: RawClaimSpan,
  session: ConversationSession,
  sourceTurnId: string,
  index: number,
  now: string,
): ConversationClaim | null {
  if (typeof raw.claimType !== "string") return null;
  if (!CLAIM_TYPES.has(raw.claimType as ConversationClaimType)) return null;
  if (typeof raw.subjectText !== "string") return null;
  const certainty =
    raw.certainty === "TENTATIVE" ? "TENTATIVE" : "STATED";

  const claim: ConversationClaim = {
    claimId: `${session.sessionId}-${sourceTurnId}-${String(index)}`,
    sessionId: session.sessionId,
    projectRef: typeof raw.projectRef === "string" ? raw.projectRef : "",
    subjectRef: typeof raw.subjectRef === "string" ? raw.subjectRef : "",
    subjectText: raw.subjectText,
    claimType: raw.claimType as ConversationClaimType,
    certainty,
    sourceTurnId,
    capturedAt: now,
    userConfirmationState: "UNCONFIRMED",
  };
  if (typeof raw.value === "string") claim.value = raw.value;
  if (typeof raw.effectiveDate === "string") {
    claim.effectiveDate = raw.effectiveDate;
  }

  assertNoForbiddenClaimFields(claim);
  return claim;
}

function toClarification(raw: RawClaimSpan): Clarification {
  const message =
    typeof raw.message === "string"
      ? raw.message
      : "I could not confidently interpret part of that.";
  const clarification: Clarification = { kind: "CLARIFICATION", message };
  if (Array.isArray(raw.candidates)) {
    const candidates = raw.candidates.filter(
      (c): c is string => typeof c === "string",
    );
    if (candidates.length > 0) clarification.candidates = candidates;
  }
  return clarification;
}

/**
 * The single probabilistic boundary. Segments `text` into independent claim spans via the
 * injected `callModel`, and — critically — every parsed claim is built by `toClaim`'s strict
 * whitelist copy and re-checked by `assertNoForbiddenClaimFields` before ever being returned, so
 * no forbidden field an adversarial or malformed model response tried to smuggle in can survive.
 * A span the model could not confidently classify becomes its own `Clarification` and never
 * blocks the other, unambiguous claims/clarifications from the same utterance. A totally
 * unparseable model response fails closed to a single Clarification, never a fabricated claim.
 */
export async function interpretTurn(
  text: string,
  session: ConversationSession,
  callModel: (prompt: string) => Promise<string>,
  vocabulary: InterpreterVocabulary = { projectIds: [], aliases: [] },
  now: string = new Date().toISOString(),
): Promise<InterpretedTurn> {
  const sourceTurnId = `turn-${String(session.turnLog.length + 1)}`;
  const prompt = buildPrompt(text, session, vocabulary);

  let raw: unknown;
  try {
    const responseText = await callModel(prompt);
    raw = JSON.parse(responseText) as unknown;
  } catch {
    return {
      claims: [],
      clarifications: [
        {
          kind: "CLARIFICATION",
          message: "I did not understand that — could you say it again?",
        },
      ],
    };
  }

  if (!isRecord(raw) || !Array.isArray(raw.spans)) {
    return {
      claims: [],
      clarifications: [
        {
          kind: "CLARIFICATION",
          message: "I did not understand that — could you say it again?",
        },
      ],
    };
  }

  const claims: ConversationClaim[] = [];
  const clarifications: Clarification[] = [];

  raw.spans.forEach((rawSpan: unknown, index: number) => {
    if (!isRecord(rawSpan)) {
      clarifications.push({
        kind: "CLARIFICATION",
        message: "I could not confidently interpret part of that.",
      });
      return;
    }
    const span = rawSpan as RawClaimSpan;
    if (span.type === "CLARIFICATION") {
      clarifications.push(toClarification(span));
      return;
    }
    if (span.type === "CLAIM") {
      const claim = toClaim(span, session, sourceTurnId, index, now);
      if (claim) {
        claims.push(claim);
      } else {
        clarifications.push({
          kind: "CLARIFICATION",
          message: "I could not confidently interpret part of that.",
        });
      }
      return;
    }
    clarifications.push({
      kind: "CLARIFICATION",
      message: "I could not confidently interpret part of that.",
    });
  });

  return { claims, clarifications };
}
