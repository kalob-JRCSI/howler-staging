// Deterministic claim-to-mutation compiler.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// "Deterministic claim-to-mutation compiler" section, and
// docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md Tasks 4-5.
//
// Pure functions only — no network/D1 access anywhere in this file. Every failure mode returns a
// typed Clarification rather than falling through to a best-guess mutation.

import type {
  Clarification,
  ConversationClaim,
  ConversationClaimType,
  ConversationSession,
} from "./conversation";
import { resolveClaimEntity } from "./conversation";
import type {
  ConstraintReadinessV094,
  EventMutationV094,
  ProjectEventV094,
  ProjectModelV094,
  SourceV094,
} from "../domain/types";

type ResolvedEntity = { type: "activity" | "constraint"; id: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

/** Claim types that assert a state has become COMPLETE/SATISFIED on the resolved entity. */
const COMPLETION_CLAIM_TYPES = new Set<ConversationClaim["claimType"]>([
  "ACTIVITY_COMPLETED",
  "ITEM_COMPLETED",
  "DELIVERY_RECEIVED",
  "INSPECTION_COMPLETED",
  "CONDITION_OBSERVED",
]);

/**
 * Checks the claim-type-to-current-state table: a claimed transition that doesn't make sense
 * against the entity's current recorded state (e.g. completing something already complete, or
 * moving a date earlier than an already-recorded start) clarifies instead of silently no-op
 * mutating. `context.isCorrection` intentionally bypasses the earlier-than-start guard only —
 * "no, Wednesday not Thursday" may legitimately move a *pending, unconfirmed* claim's date
 * backward; it never bypasses the completed/satisfied-state checks.
 */
export function validateClaimTransition(
  claim: ConversationClaim,
  entity: ResolvedEntity,
  projectModel: ProjectModelV094,
  context: { isCorrection?: boolean } = {},
): { valid: true } | Clarification {
  if (entity.type === "activity") {
    const activity = projectModel.activities[entity.id];
    if (!activity) {
      return {
        kind: "CLARIFICATION",
        message: `I could not find activity "${entity.id}" in this project.`,
      };
    }
    const impliesForwardProgress =
      claim.claimType === "ACTIVITY_STARTED" ||
      COMPLETION_CLAIM_TYPES.has(claim.claimType);
    if (impliesForwardProgress && activity.state === "COMPLETE") {
      return {
        kind: "CLARIFICATION",
        message: `${activity.name} is already marked done — did something change?`,
      };
    }
    if (
      !context.isCorrection &&
      claim.effectiveDate &&
      activity.actualStart &&
      isValidIsoDate(claim.effectiveDate) &&
      claim.effectiveDate < activity.actualStart &&
      (COMPLETION_CLAIM_TYPES.has(claim.claimType) ||
        claim.claimType === "ACTIVITY_STARTED")
    ) {
      return {
        kind: "CLARIFICATION",
        message: `${claim.effectiveDate} is earlier than ${activity.name}'s recorded start (${activity.actualStart}) — is this a correction?`,
      };
    }
    return { valid: true };
  }

  const constraint = projectModel.constraints[entity.id];
  if (!constraint) {
    return {
      kind: "CLARIFICATION",
      message: `I could not find constraint "${entity.id}" in this project.`,
    };
  }
  if (
    COMPLETION_CLAIM_TYPES.has(claim.claimType) &&
    constraint.state === "SATISFIED"
  ) {
    return {
      kind: "CLARIFICATION",
      message: `${constraint.label} is already marked satisfied — did something change?`,
    };
  }
  return { valid: true };
}

/**
 * Parses `effectiveDate` (when present) as ISO-8601; rejects malformed values. Never coerces a
 * bad value into a "close enough" one.
 */
export function validateClaimValue(
  claim: ConversationClaim,
): { valid: true } | Clarification {
  if (claim.effectiveDate === undefined) return { valid: true };
  if (!isValidIsoDate(claim.effectiveDate)) {
    return {
      kind: "CLARIFICATION",
      message: `"${claim.effectiveDate}" is not a date I can record.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------------------------
// Deterministic claim-to-mutation compiler (Task 5).
//
// `CLASSIFY` is the one and only place `mutationClass` is ever assigned, and it is a total,
// TypeScript-exhaustiveness-checked table keyed only by `claim.claimType` — the `satisfies`
// clause below makes it a compile error to add a fourteenth `ConversationClaimType` without also
// giving it a `CLASSIFY` entry. No branch anywhere in `compileClaim` reads `claim.value`,
// `claim.effectiveDate`, or any other claim content to influence `mutationClass`, and no branch
// ever reads an interpreter-supplied `mutationClass`/`mutationOp`/`activityId`/`constraintId`
// field even if one is smuggled onto the claim object — `ConversationClaim` has no such field,
// and every mutation op/entity id/verification state below is either a compiler-chosen literal
// or a value already proven real by `resolveClaimEntity` (Task 3).
// ---------------------------------------------------------------------------------------------

export const CLASSIFY = {
  ACTIVITY_STARTED: "FACT",
  ACTIVITY_COMPLETED: "FACT",
  ITEM_COMPLETED: "FACT",
  DELIVERY_RECEIVED: "FACT",
  INSPECTION_COMPLETED: "FACT",
  CONDITION_OBSERVED: "FACT",
  SCHEDULE_CHANGED: "COMMITMENT",
  DELIVERY_EXPECTED: "COMMITMENT",
  TRADE_ATTENDANCE_PLANNED: "COMMITMENT",
  WORK_REQUESTED: "COMMITMENT",
  DECISION_EXPECTED: "COMMITMENT",
  DECISION_UNRESOLVED: null,
  CONSTRAINT_UNRESOLVED: null,
} satisfies Record<ConversationClaimType, "FACT" | "COMMITMENT" | null>;

export interface ProposedMutation {
  event: ProjectEventV094;
  mutationClass: "FACT" | "COMMITMENT";
}

/** The two no-mutation claim types (`DECISION_UNRESOLVED`/`CONSTRAINT_UNRESOLVED`) resolve here:
 * no event, `mutationClass: null` — this claim only confirms an item stays open. */
export interface NoMutationResult {
  mutationClass: null;
}

export type CompileClaimResult =
  ProposedMutation | NoMutationResult | Clarification;

type ResolvedClaimEntity = { type: "activity" | "constraint"; id: string };

function sourceIdFor(claim: ConversationClaim): string {
  return `src-voice-${claim.sessionId}-${claim.sourceTurnId}-${claim.claimId}`;
}

function buildSourceMutation(
  claim: ConversationClaim,
  sourceId: string,
): { op: "UPSERT_SOURCE"; source: SourceV094 } {
  const excerpt = (claim.value ?? claim.subjectText).slice(0, 200);
  const source: SourceV094 = {
    id: sourceId,
    type: "VOICE_CONVERSATION",
    label: `Voice conversation (session ${claim.sessionId}, turn ${claim.sourceTurnId}): "${excerpt}"`,
    observedAt: claim.capturedAt,
    authority: 0.9,
    reliability: 0.9,
    ...(claim.effectiveDate ? { effectiveDate: claim.effectiveDate } : {}),
  };
  return { op: "UPSERT_SOURCE", source };
}

function requireDate(claim: ConversationClaim): string | Clarification {
  if (!claim.effectiveDate) {
    return {
      kind: "CLARIFICATION",
      message: "What date should I record for that?",
    };
  }
  return claim.effectiveDate;
}

function wrongEntityType(expected: string): Clarification {
  return { kind: "CLARIFICATION", message: `I need ${expected} for that.` };
}

function requireConstraintOfType(
  entity: ResolvedClaimEntity,
  projectModel: ProjectModelV094,
  type: string,
): Clarification | undefined {
  if (entity.type !== "constraint") return wrongEntityType("a constraint");
  const constraint = projectModel.constraints[entity.id];
  if (!constraint || constraint.type.toUpperCase() !== type) {
    return {
      kind: "CLARIFICATION",
      message: `That doesn't look like a ${type.toLowerCase()} item.`,
    };
  }
  return undefined;
}

function resolveImpactSeedActivityIds(
  entity: ResolvedClaimEntity,
  projectModel: ProjectModelV094,
): string[] {
  if (entity.type === "activity") return [entity.id];
  const constraint = projectModel.constraints[entity.id];
  return constraint ? [constraint.activityId] : [];
}

function buildMutations(
  claim: ConversationClaim,
  entity: ResolvedClaimEntity,
  projectModel: ProjectModelV094,
  sourceId: string,
): EventMutationV094[] | Clarification {
  switch (claim.claimType) {
    case "ACTIVITY_STARTED": {
      if (entity.type !== "activity") return wrongEntityType("an activity");
      const date = requireDate(claim);
      if (typeof date !== "string") return date;
      return [{ op: "SET_ACTUAL_START", activityId: entity.id, date }];
    }
    case "ACTIVITY_COMPLETED":
    case "ITEM_COMPLETED": {
      if (entity.type === "activity") {
        const date = requireDate(claim);
        if (typeof date !== "string") return date;
        return [
          { op: "SET_ACTUAL_FINISH", activityId: entity.id, date },
          {
            op: "SET_ACTIVITY_STATE",
            activityId: entity.id,
            state: "COMPLETE",
          },
        ];
      }
      return [
        {
          op: "SET_CONSTRAINT_STATE",
          constraintId: entity.id,
          state: "SATISFIED",
          verification: "PM_CONFIRMED",
        },
      ];
    }
    case "DELIVERY_RECEIVED": {
      const problem = requireConstraintOfType(entity, projectModel, "MATERIAL");
      if (problem) return problem;
      return [
        {
          op: "SET_CONSTRAINT_STATE",
          constraintId: entity.id,
          state: "SATISFIED",
          verification: "PM_CONFIRMED",
        },
      ];
    }
    case "INSPECTION_COMPLETED": {
      const problem = requireConstraintOfType(
        entity,
        projectModel,
        "INSPECTION",
      );
      if (problem) return problem;
      return [
        {
          op: "SET_CONSTRAINT_STATE",
          constraintId: entity.id,
          state: "SATISFIED",
          verification: "PM_CONFIRMED",
        },
      ];
    }
    case "CONDITION_OBSERVED": {
      if (entity.type !== "constraint") return wrongEntityType("a constraint");
      return [
        {
          op: "SET_CONSTRAINT_STATE",
          constraintId: entity.id,
          state: "SATISFIED",
          verification: "PM_CONFIRMED",
        },
      ];
    }
    case "SCHEDULE_CHANGED":
    case "DELIVERY_EXPECTED":
    case "TRADE_ATTENDANCE_PLANNED":
    case "WORK_REQUESTED": {
      if (entity.type !== "activity") return wrongEntityType("an activity");
      const date = requireDate(claim);
      if (typeof date !== "string") return date;
      return [
        {
          op: "SET_SCHEDULE_LOCK",
          activityId: entity.id,
          lock: { startDate: date, sourceId },
        },
      ];
    }
    case "DECISION_EXPECTED": {
      const problem = requireConstraintOfType(entity, projectModel, "DECISION");
      if (problem) return problem;
      const date = requireDate(claim);
      if (typeof date !== "string") return date;
      const constraint = projectModel.constraints[entity.id];
      const readiness: ConstraintReadinessV094 = {
        optimistic: constraint?.readiness?.optimistic ?? date,
        likely: date,
        conservative: constraint?.readiness?.conservative ?? date,
      };
      return [
        {
          op: "SET_CONSTRAINT_READINESS",
          constraintId: entity.id,
          readiness,
          verification: "PM_CONFIRMED",
        },
      ];
    }
    case "DECISION_UNRESOLVED":
    case "CONSTRAINT_UNRESOLVED":
      // Unreachable in practice — CLASSIFY[claim.claimType] is null for both, and compileClaim
      // returns a NoMutationResult before ever calling buildMutations for them. Kept only so the
      // switch remains exhaustive over ConversationClaimType.
      return {
        kind: "CLARIFICATION",
        message: "This claim type never produces a mutation.",
      };
    default: {
      const exhaustive: never = claim.claimType;
      throw new Error(
        `buildMutations: unhandled claimType ${String(exhaustive)}`,
      );
    }
  }
}

/** Task 15: optional stage timing instrumentation. No-op when `recordTiming` is absent (the
 * default, every existing call site) — never required, never sent anywhere by default. */
export interface TimingSample {
  stage: string;
  durationMs: number;
}
export type RecordTiming = (sample: TimingSample) => void;

/**
 * Pure function, no network/D1 access. Given a `ConversationClaim`, the current
 * `ProjectModelV094` for the already-resolved project, and the session, resolves the claim's
 * entity, validates the transition and value, classifies `mutationClass` via the fixed `CLASSIFY`
 * table above (the only step that ever decides FACT vs. COMMITMENT), and — only once the claim is
 * `CONFIRMED` — compiles a real, applyable `ProposedMutation`. Any failure along the way returns
 * a typed `Clarification` instead of falling through to a best-guess mutation or a best-guess
 * `mutationClass`.
 */
export function compileClaim(
  claim: ConversationClaim,
  projectModel: ProjectModelV094,
  session: ConversationSession,
  recordTiming?: RecordTiming,
  clock: () => number = Date.now,
): CompileClaimResult {
  const startedAt = clock();
  // `session` is accepted for interface stability (the design/plan's stated signature is
  // `compileClaim(claim, projectModel, session)`) but is not currently read by compileClaimBody —
  // the compiler resolves everything it needs from `claim`/`projectModel` alone.
  void session;
  try {
    return compileClaimBody(claim, projectModel);
  } finally {
    if (recordTiming) {
      recordTiming({ stage: "compileClaim", durationMs: clock() - startedAt });
    }
  }
}

function compileClaimBody(
  claim: ConversationClaim,
  projectModel: ProjectModelV094,
): CompileClaimResult {
  const mutationClass = CLASSIFY[claim.claimType];

  if (mutationClass === null) {
    return { mutationClass: null };
  }

  if (claim.userConfirmationState !== "CONFIRMED") {
    return {
      kind: "CLARIFICATION",
      message:
        "I have not confirmed that yet — say yes to record it, or correct it first.",
    };
  }

  const entity = resolveClaimEntity(claim, projectModel);
  if ("kind" in entity) return entity;

  const transitionCheck = validateClaimTransition(claim, entity, projectModel);
  if ("kind" in transitionCheck) return transitionCheck;

  const valueCheck = validateClaimValue(claim);
  if ("kind" in valueCheck) return valueCheck;

  const sourceId = sourceIdFor(claim);
  const mutations = buildMutations(claim, entity, projectModel, sourceId);
  if (!Array.isArray(mutations)) return mutations;

  const sourceMutation = buildSourceMutation(claim, sourceId);
  const impactSeedActivityIds = resolveImpactSeedActivityIds(
    entity,
    projectModel,
  );

  const event: ProjectEventV094 = {
    id: `voice-conversation-${claim.claimId}`,
    baseRevision: projectModel.revision,
    projectId: projectModel.projectId,
    type: "FIELD_UPDATE",
    occurredAt: claim.effectiveDate
      ? `${claim.effectiveDate}T12:00:00.000Z`
      : claim.capturedAt,
    receivedAt: claim.capturedAt,
    sourceIds: [sourceMutation.source.id],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds,
    mutations: [sourceMutation, ...mutations],
    payload: { claimType: claim.claimType, subjectText: claim.subjectText },
    note: `Voice conversation claim ${claim.claimId}`,
    // Field-readiness blocker fix: this must also live on the event itself, not only on the
    // sibling ProposedMutation.mutationClass field below -- the scoped oversight gate
    // (src/operator/workflow.ts's isScopedFactBypass) reads event.mutationClass once this event
    // reaches the canonical evidence-apply path, and would otherwise always see it as absent
    // (defaulting to COMMITMENT semantics), so no conversational FACT claim would ever actually
    // get the FACT bypass in production.
    mutationClass,
  };

  return { event, mutationClass };
}
