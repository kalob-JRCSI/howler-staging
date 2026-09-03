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
// This module lives in src/operator/ (not src/worker/voice-transport.ts) deliberately:
// conversation.ts already imports projectMention/normalizeProjectId FROM voice-transport.ts, so a
// module needing conversation.ts, claim-compiler.ts, interpreter.ts, AND voice-transport.ts's
// gateway/confirmation types together would create a cycle if it lived inside voice-transport.ts
// itself. voice-transport.ts imports nothing from src/operator/, so this one-way dependency
// (operator -> worker utility) is the same direction conversation.ts already uses today.

import {
  addClaim,
  resolveClaimProject,
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
  | { kind: "NO_OP"; clarifications: Clarification[] };

function stage(
  recordTiming: ((sample: TimingSample) => void) | undefined,
  name: string,
  durationMs: number,
): void {
  if (recordTiming) recordTiming({ stage: name, durationMs });
}

/**
 * The single real, wired production entry point: one text turn in, deterministic project/claim
 * resolution and compilation, and — for every claim that compiles to a real mutation — a real
 * preview, never an auto-apply. Reports timing across every named stage the field test needs:
 * input_transport, interpretTurn (reported by interpretTurn itself), project_resolution,
 * compileClaim (reported by compileClaim itself), preview (this function's own wrapper around
 * gateway.previewClaim, which separately reports the finer-grained EVIDENCE_PREVIEW leg),
 * verification (finalizing/bookkeeping each resolved claim before returning), and total.
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
    const resolutionStartedAt = clock();
    const projectResult = resolveClaimProject(
      claim,
      workingSession,
      deps.vocabulary.projectIds,
      deps.vocabulary.aliases,
    );
    if (typeof projectResult !== "string") {
      stage(
        deps.recordTiming,
        "project_resolution",
        clock() - resolutionStartedAt,
      );
      clarifications.push(projectResult);
      continue;
    }
    const resolvedProjectId = projectResult;
    // Field-readiness blocker fix: claim.projectRef is enforced against canonical identity here
    // -- the model loaded below is always the one for resolveClaimProject's own resolved id,
    // never a caller-assumed or separately-passed one, and workingSession.activeProjectId only
    // ever advances to a project this same resolution step actually proved.
    workingSession = { ...workingSession, activeProjectId: resolvedProjectId };
    const model = await deps.loadProjectModel(resolvedProjectId);
    stage(
      deps.recordTiming,
      "project_resolution",
      clock() - resolutionStartedAt,
    );
    if (!model) {
      clarifications.push({
        kind: "CLARIFICATION",
        message: `I could not load project "${resolvedProjectId}".`,
      });
      continue;
    }

    // interpretTurn always emits a freshly-parsed claim at userConfirmationState: "UNCONFIRMED"
    // (its own hardcoded contract) -- but interpretTurn itself already refuses to emit a
    // claimType at all unless it could confidently classify the span (an ambiguous or uncertain
    // span becomes a Clarification instead, never a guessed claim). A STATED claim reaching this
    // point has therefore already cleared the interpreter's own confidence gate, so this promotes
    // it to CONFIRMED for compilation -- the semantic "is this what you meant" checkpoint the
    // STATED/TENTATIVE distinction exists to express. A TENTATIVE claim is never promoted here,
    // so it always hits compileClaim's own "not confirmed yet" refusal, exactly as the design
    // requires: TENTATIVE claims are structurally incapable of reaching a compiled mutation
    // without an explicit, separate, later re-assertion.
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
      clarifications.push(compiled);
      stage(deps.recordTiming, "verification", clock() - verificationStartedAt);
      continue;
    }
    if (compiled.mutationClass === null) {
      // DECISION_UNRESOLVED / CONSTRAINT_UNRESOLVED: confirms an item stays open, no mutation --
      // nothing to preview or apply, and nothing this function needs to remember afterward.
      stage(deps.recordTiming, "verification", clock() - verificationStartedAt);
      continue;
    }

    const previewStartedAt = clock();
    const previewOutcome = await deps.gateway.previewClaim(
      { event: compiled.event, mutationClass: compiled.mutationClass },
      resolvedProjectId,
      model.revision,
      deps.captureSessionId,
    );
    stage(deps.recordTiming, "preview", clock() - previewStartedAt);

    workingSession = addClaim(workingSession, claimForCompile);
    pending.push({
      claim: claimForCompile,
      confirmation: previewOutcome.confirmation,
      previewResult: previewOutcome.previewResult,
    });
    stage(deps.recordTiming, "verification", clock() - verificationStartedAt);
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

/**
 * Called only once a real, external affirmative/negative response arrives for a pending
 * confirmation `resolveConversationalTurn` produced — never synthesized internally. Reports
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
