// Deterministic claim-to-mutation compiler.
// Authority: docs/superpowers/specs/2026-09-03-howler-conversational-pm-design.md (commit 494ba82)
// "Deterministic claim-to-mutation compiler" section, and
// docs/superpowers/plans/2026-09-03-howler-conversational-pm-plan.md Tasks 4-5.
//
// Pure functions only — no network/D1 access anywhere in this file. Every failure mode returns a
// typed Clarification rather than falling through to a best-guess mutation.

import type { ConversationClaim, Clarification } from "./conversation";
import type { ProjectModelV094 } from "../domain/types";

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
