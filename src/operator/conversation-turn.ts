// Field-readiness blocker fix: the first real, callable production conversational PM path.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// and docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md.
//
// Every piece this ties together already existed as a tested-in-isolation library
// (interpretTurn, resolveClaimProject, compileClaim, createConversationalClaimGateway) but nothing
// in the real worker ever called them together end to end. This module is that wiring: text turn
// -> interpretTurn -> resolveClaimProject (canonical project identity, never caller-assumed) ->
// load the REAL model for the resolved project -> compileClaim -> gateway.previewClaim. It never
// auto-applies (that stays gated behind respondToConversationalConfirmation, called only once a
// real affirmative/negative response arrives) and it never constructs its own resume path (a
// caller needing resume semantics uses the existing FieldVoiceBridge.resumeWorkflow via Task 18's
// own resolveVoiceCommand, unchanged and untouched by this module).
//
// routeConversationalTurn (added for the field-entry blocker fix) is the real top-level entry
// point: it recognizes a correction ("...actually") or an uncertainty/defer signal ("I'm not sure
// yet", "leave that open") against the single pending claim session.lastReferencedEntity points
// to, using the same deterministic, non-LLM text patterns Task 10's resolveCorrection/deferClaim
// already established -- this is routing, not a second reasoning engine. Anything that doesn't
// match falls through to the full interpretTurn pipeline exactly as before.
//
// This module lives in src/operator/ (not src/worker/voice-transport.ts) deliberately:
// conversation.ts already imports projectMention/normalizeProjectId FROM voice-transport.ts, so a
// module needing conversation.ts, claim-compiler.ts, interpreter.ts, AND voice-transport.ts's
// gateway/confirmation types together would create a cycle if it lived inside voice-transport.ts
// itself. voice-transport.ts imports nothing from src/operator/, so this one-way dependency
// (operator -> worker utility) is the same direction conversation.ts already uses today.

import {
  addClaim,
  claimMatchesLastReferencedEntity,
  deferClaim,
  resolveClaimEntity,
  resolveClaimProject,
  resolveCorrection,
  type Clarification,
  type ConversationClaim,
  type ConversationSession,
} from "./conversation";
import { interpretTurn, type InterpreterVocabulary } from "./interpreter";
import { compileClaim } from "./claim-compiler";
import type {
  ClaimApplyOutcome,
  ClaimPreviewOutcome,
  ConfirmedClaimMutation,
  PendingVoiceConfirmation,
  TimingSample,
} from "../worker/voice-transport";
import type { ProjectModelV094 } from "../domain/types";

export interface ConversationalClaimGateway {
  previewClaim(
    mutation: ConfirmedClaimMutation,
    projectId: string,
    expectedProjectRevision: number,
    captureSessionId: string,
  ): Promise<ClaimPreviewOutcome>;
  respondToPendingClaim(
    confirmationId: string,
    response: { affirmative: boolean },
    respondAt?: number,
  ): Promise<ClaimApplyOutcome>;
  invalidateClaim(eventId: string): void;
}

export interface ConversationalTurnDeps {
  callModel: (prompt: string) => Promise<string>;
  loadProjectModel: (projectId: string) => Promise<ProjectModelV094 | null>;
  vocabulary: InterpreterVocabulary;
  gateway: ConversationalClaimGateway;
  captureSessionId: string;
  recordTiming?: (sample: TimingSample) => void;
  clock?: () => number;
  now?: () => string;
}

export interface PendingConversationalClaim {
  claim: ConversationClaim;
  confirmation: PendingVoiceConfirmation;
  previewResult: { workflowState: string };
}

export type ConversationalTurnResult =
  | { kind: "CLARIFICATION"; clarifications: Clarification[] }
  | {
      kind: "AWAITING_CONFIRMATION";
      pending: PendingConversationalClaim[];
      clarifications: Clarification[];
    }
  | { kind: "NO_OP"; clarifications: Clarification[] }
  | { kind: "DEFERRED"; claimId: string }
  | {
      kind: "CORRECTED";
      pending?: PendingConversationalClaim;
      clarifications: Clarification[];
    };

function stage(
  recordTiming: ((sample: TimingSample) => void) | undefined,
  name: string,
  durationMs: number,
): void {
  if (recordTiming) recordTiming({ stage: name, durationMs });
}

function eventIdFor(claimId: string): string {
  return `voice-conversation-${claimId}`;
}

/** Safety repair (blocker 1): a safe, honest, category-classified message for a preview that did
 * not reach SUCCEEDED — never a raw error dump, never implying anything was recorded. */
function describePreviewFailure(workflowState: string): string {
  switch (workflowState) {
    case "BLOCKED":
      return "I can't record that yet — it touches an unresolved block.";
    case "INTERRUPTED":
      return "That preview was interrupted before it could finish — nothing was recorded.";
    default:
      return "I couldn't preview that change, so nothing was recorded.";
  }
}

type ClaimResolutionOutcome =
  | {
      session: ConversationSession;
      kind: "PENDING";
      pending: PendingConversationalClaim;
    }
  | {
      session: ConversationSession;
      kind: "CLARIFICATION";
      clarification: Clarification;
    }
  | { session: ConversationSession; kind: "NO_OP" };

/**
 * Shared by resolveConversationalTurn's main loop and routeConversationalTurn's correction path:
 * resolves the claim's project (canonical identity, never caller-assumed), loads the real model
 * for that resolved id, compiles, and previews. Never applies. On a successful preview, stores the
 * claim in session.pendingClaims at AWAITING_CONFIRMATION (representing "awaiting the real,
 * external evidence-level confirmation" -- Task 10's own state, reused for its existing meaning:
 * a claim sitting here is exactly what resolveCorrection/deferClaim already know how to find) and
 * advances session.lastReferencedEntity so a following correction/defer utterance can find it.
 */
async function resolveAndPreviewClaim(
  claim: ConversationClaim,
  session: ConversationSession,
  deps: ConversationalTurnDeps,
  clock: () => number,
): Promise<ClaimResolutionOutcome> {
  const resolutionStartedAt = clock();
  const projectResult = resolveClaimProject(
    claim,
    session,
    deps.vocabulary.projectIds,
    deps.vocabulary.aliases,
  );
  if (typeof projectResult !== "string") {
    stage(
      deps.recordTiming,
      "project_resolution",
      clock() - resolutionStartedAt,
    );
    return { session, kind: "CLARIFICATION", clarification: projectResult };
  }
  const resolvedProjectId = projectResult;
  // Field-readiness blocker fix: claim.projectRef is enforced against canonical identity here --
  // the model loaded below is always the one for resolveClaimProject's own resolved id, never a
  // caller-assumed or separately-passed one, and session.activeProjectId only ever advances to a
  // project this same resolution step actually proved.
  let workingSession: ConversationSession = {
    ...session,
    activeProjectId: resolvedProjectId,
  };
  const model = await deps.loadProjectModel(resolvedProjectId);
  stage(deps.recordTiming, "project_resolution", clock() - resolutionStartedAt);
  if (!model) {
    return {
      session: workingSession,
      kind: "CLARIFICATION",
      clarification: {
        kind: "CLARIFICATION",
        message: `I could not load project "${resolvedProjectId}".`,
      },
    };
  }

  // interpretTurn always emits a freshly-parsed claim at userConfirmationState: "UNCONFIRMED"
  // (its own hardcoded contract) -- but interpretTurn itself already refuses to emit a claimType
  // at all unless it could confidently classify the span (an ambiguous or uncertain span becomes
  // a Clarification instead, never a guessed claim). A STATED claim reaching this point has
  // therefore already cleared the interpreter's own confidence gate, so this promotes it to
  // CONFIRMED for compilation -- the semantic "is this what you meant" checkpoint the STATED/
  // TENTATIVE distinction exists to express. A TENTATIVE claim is never promoted here, so it
  // always hits compileClaim's own "not confirmed yet" refusal, exactly as the design requires.
  const claimForCompile: ConversationClaim =
    claim.certainty === "STATED"
      ? { ...claim, userConfirmationState: "CONFIRMED" }
      : claim;
  const compiled = compileClaim(
    claimForCompile,
    model,
    workingSession,
    deps.recordTiming,
    clock,
  );

  const verificationStartedAt = clock();
  if ("kind" in compiled) {
    stage(deps.recordTiming, "verification", clock() - verificationStartedAt);
    return {
      session: workingSession,
      kind: "CLARIFICATION",
      clarification: compiled,
    };
  }
  if (compiled.mutationClass === null) {
    // DECISION_UNRESOLVED / CONSTRAINT_UNRESOLVED: confirms an item stays open, no mutation --
    // nothing to preview or apply, and nothing this function needs to remember afterward.
    stage(deps.recordTiming, "verification", clock() - verificationStartedAt);
    return { session: workingSession, kind: "NO_OP" };
  }

  const previewStartedAt = clock();
  const previewOutcome = await deps.gateway.previewClaim(
    { event: compiled.event, mutationClass: compiled.mutationClass },
    resolvedProjectId,
    model.revision,
    deps.captureSessionId,
  );
  stage(deps.recordTiming, "preview", clock() - previewStartedAt);

  // Safety repair (blocker 1 — preview must fail closed): a BLOCKED/FAILED/INTERRUPTED/malformed
  // preview never becomes an AWAITING_CONFIRMATION result. The claim is never stored into
  // session.pendingClaims and lastReferencedEntity never advances for it — there is nothing
  // pending to correct, defer, or confirm, so nothing should look like there is.
  if (previewOutcome.outcome === "PREVIEW_FAILED") {
    stage(deps.recordTiming, "verification", clock() - previewStartedAt);
    return {
      session: workingSession,
      kind: "CLARIFICATION",
      clarification: {
        kind: "CLARIFICATION",
        message: describePreviewFailure(
          previewOutcome.previewResult.workflowState,
        ),
      },
    };
  }

  const entityResult = resolveClaimEntity(claimForCompile, model);
  const lastReferencedEntity =
    "kind" in entityResult
      ? workingSession.lastReferencedEntity
      : {
          type: entityResult.type,
          id: entityResult.id,
          label:
            entityResult.type === "activity"
              ? (model.activities[entityResult.id]?.name ?? entityResult.id)
              : (model.constraints[entityResult.id]?.label ?? entityResult.id),
        };

  const storedClaim: ConversationClaim = {
    ...claimForCompile,
    userConfirmationState: "AWAITING_CONFIRMATION",
  };
  workingSession = addClaim(workingSession, storedClaim);
  workingSession = { ...workingSession, lastReferencedEntity };
  stage(deps.recordTiming, "verification", clock() - verificationStartedAt);

  return {
    session: workingSession,
    kind: "PENDING",
    pending: {
      claim: storedClaim,
      confirmation: previewOutcome.confirmation,
      previewResult: previewOutcome.previewResult,
    },
  };
}

/**
 * The full-interpretation entry point: one text turn in, deterministic project/claim resolution
 * and compilation, and — for every claim that compiles to a real mutation — a real preview, never
 * an auto-apply. Reports timing across every named stage the field test needs: input_transport,
 * interpretTurn (reported by interpretTurn itself), project_resolution, compileClaim (reported by
 * compileClaim itself), preview (this function's own wrapper around gateway.previewClaim, which
 * separately reports the finer-grained EVIDENCE_PREVIEW leg), verification (finalizing/
 * bookkeeping each resolved claim before returning), and total. Prefer routeConversationalTurn
 * below as the real entry point — it calls this for anything that isn't a correction/defer.
 */
export async function resolveConversationalTurn(
  text: string,
  session: ConversationSession,
  deps: ConversationalTurnDeps,
): Promise<{ session: ConversationSession; result: ConversationalTurnResult }> {
  const clock = deps.clock ?? Date.now;
  const nowIso = deps.now ?? (() => new Date().toISOString());
  const totalStartedAt = clock();

  const inputStartedAt = clock();
  const trimmed = text.trim();
  stage(deps.recordTiming, "input_transport", clock() - inputStartedAt);

  const interpreted = await interpretTurn(
    trimmed,
    session,
    deps.callModel,
    deps.vocabulary,
    nowIso(),
    deps.recordTiming,
    clock,
  );

  let workingSession = session;
  const clarifications: Clarification[] = [...interpreted.clarifications];
  const pending: PendingConversationalClaim[] = [];

  for (const claim of interpreted.claims) {
    const resolved = await resolveAndPreviewClaim(
      claim,
      workingSession,
      deps,
      clock,
    );
    workingSession = resolved.session;
    if (resolved.kind === "CLARIFICATION")
      clarifications.push(resolved.clarification);
    else if (resolved.kind === "PENDING") pending.push(resolved.pending);
  }

  stage(deps.recordTiming, "total", clock() - totalStartedAt);

  if (pending.length > 0) {
    return {
      session: workingSession,
      result: { kind: "AWAITING_CONFIRMATION", pending, clarifications },
    };
  }
  if (clarifications.length > 0) {
    return {
      session: workingSession,
      result: { kind: "CLARIFICATION", clarifications },
    };
  }
  return {
    session: workingSession,
    result: { kind: "NO_OP", clarifications },
  };
}

const CORRECTION_PATTERN = /\bactually\b/i;
const UNCERTAINTY_OR_DEFER_PATTERN =
  /\b(not sure|don'?t know|unsure|not certain|leave (that|it) open|skip that)\b/i;

function findAwaitingClaim(
  session: ConversationSession,
): ConversationClaim | undefined {
  const candidates = session.pendingClaims.filter(
    (claim) =>
      claim.userConfirmationState === "AWAITING_CONFIRMATION" &&
      claimMatchesLastReferencedEntity(claim, session.lastReferencedEntity),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The real top-level entry point for one HTTP turn. Deterministic pre-routing (the same category
 * of thing as Task 18's own regex commandKind, not a second reasoning engine) recognizes a
 * correction or an uncertainty/defer signal against the single pending claim
 * session.lastReferencedEntity points to, before ever calling interpretTurn -- exactly mirroring
 * Task 10's original resolveCorrection/deferClaim design, now actually wired to the live pending-
 * confirmation claims resolveAndPreviewClaim produces. Anything that doesn't match either pattern,
 * or has no single matching pending claim, falls through to the full resolveConversationalTurn
 * pipeline unchanged.
 */
export async function routeConversationalTurn(
  text: string,
  session: ConversationSession,
  deps: ConversationalTurnDeps,
): Promise<{ session: ConversationSession; result: ConversationalTurnResult }> {
  const trimmed = text.trim();
  const clock = deps.clock ?? Date.now;

  if (UNCERTAINTY_OR_DEFER_PATTERN.test(trimmed)) {
    const target = findAwaitingClaim(session);
    if (target) {
      deps.gateway.invalidateClaim(eventIdFor(target.claimId));
      const deferred = deferClaim(session, target.claimId);
      return {
        session: deferred,
        result: { kind: "DEFERRED", claimId: target.claimId },
      };
    }
    // No specific pending claim to defer -- a bare "I'm not sure" with nothing pending is not
    // itself a claim, so this falls through to full interpretation rather than guessing a target.
  }

  if (CORRECTION_PATTERN.test(trimmed)) {
    const target = findAwaitingClaim(session);
    if (target) {
      const correctionResult = resolveCorrection(session, trimmed);
      if ("kind" in correctionResult) {
        return {
          session,
          result: { kind: "CORRECTED", clarifications: [correctionResult] },
        };
      }
      const correctedSession = correctionResult;
      const correctedClaim = correctedSession.pendingClaims.find(
        (c) => c.claimId === target.claimId,
      );
      if (!correctedClaim) {
        return {
          session: correctedSession,
          result: { kind: "CORRECTED", clarifications: [] },
        };
      }
      // Field-readiness blocker fix: applyCorrection patches the claim in place (same claimId),
      // so a recompiled event would keep the same deterministic voice-conversation-${claimId} id
      // and silently hit the gateway's stale preview cache without this.
      deps.gateway.invalidateClaim(eventIdFor(target.claimId));
      const resolved = await resolveAndPreviewClaim(
        correctedClaim,
        correctedSession,
        deps,
        clock,
      );
      if (resolved.kind === "PENDING") {
        return {
          session: resolved.session,
          result: {
            kind: "CORRECTED",
            pending: resolved.pending,
            clarifications: [],
          },
        };
      }
      if (resolved.kind === "CLARIFICATION") {
        return {
          session: resolved.session,
          result: {
            kind: "CORRECTED",
            clarifications: [resolved.clarification],
          },
        };
      }
      return {
        session: resolved.session,
        result: { kind: "CORRECTED", clarifications: [] },
      };
    }
    // No single matching pending claim -- not confidently a correction of anything specific,
    // falls through rather than guessing.
  }

  return resolveConversationalTurn(text, session, deps);
}

/**
 * Called only once a real, external affirmative/negative response arrives for a pending
 * confirmation resolveAndPreviewClaim produced — never synthesized internally. Reports
 * confirmation_wait (the real elapsed time between the confirmation being created and this
 * response arriving) in addition to the gateway's own apply-leg timing.
 */
export async function respondToConversationalConfirmation(
  confirmationId: string,
  response: { affirmative: boolean },
  gateway: ConversationalClaimGateway,
  recordTiming?: (sample: TimingSample) => void,
  clock: () => number = Date.now,
): Promise<ClaimApplyOutcome> {
  const waitStartedAt = clock();
  const outcome = await gateway.respondToPendingClaim(confirmationId, response);
  stage(recordTiming, "confirmation_wait", clock() - waitStartedAt);
  return outcome;
}
