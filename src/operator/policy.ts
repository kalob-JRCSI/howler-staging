// Canonical v1 safety policy: staging/shadow authorization checks and the fixed safety invariants
// every result must carry, transcribed from
// docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md §7.2 step 3, §8.3, and §11.
// Pure policy checks only — no persistence, no HTTP, no D1, no external calls, no env access.

import { REQUIRED_EFFECT_BY_KIND } from "./intent";
import type { IntentKind, RequestedEffect } from "./intent";
import type { WorkflowProblem } from "./workflow";

/**
 * The exact safety values every ResultV1 must carry (design §8.3). Server-generated constants,
 * never accepted from client input or an intent payload.
 */
export const OPERATOR_SAFETY = {
  mode: "shadow",
  stagingOnly: true,
  liveSystemsConnected: false,
  dashboardConnected: false,
  calendarConnected: false,
  productionDeployment: false,
} as const;

export type OperatorSafety = typeof OPERATOR_SAFETY;

/**
 * A structurally-shaped but not yet value-verified safety object — e.g. one reconstructed from
 * persisted JSON in a later task. Widened deliberately so `isSafetyCompliant`'s comparisons are
 * genuine runtime checks rather than tautologies the type system already guarantees.
 */
export interface SafetyCandidate {
  mode: string;
  stagingOnly: boolean;
  liveSystemsConnected: boolean;
  dashboardConnected: boolean;
  calendarConnected: boolean;
  productionDeployment: boolean;
}

export function isSafetyCompliant(safety: SafetyCandidate): boolean {
  return (
    safety.mode === "shadow" &&
    safety.stagingOnly &&
    !safety.liveSystemsConnected &&
    !safety.dashboardConnected &&
    !safety.calendarConnected &&
    !safety.productionDeployment
  );
}

export interface StagingShadowContext {
  mode: string;
  workerName: string;
}

const STAGING_WORKER_NAME = "jarvis-voice-staging";

/**
 * Design §7.2 step 3 (AUTHORIZE_POLICY): "assert shadow mode, staging target, and permitted
 * effect." The runtime mode/worker name are supplied by the caller (operator/* has no env
 * access); this only judges them.
 */
export function assertStagingShadowPolicy(
  context: StagingShadowContext,
): WorkflowProblem | undefined {
  if (context.workerName !== STAGING_WORKER_NAME) {
    return {
      code: "POLICY_NOT_STAGING_TARGET",
      category: "POLICY",
      message: `Worker target must be exactly ${STAGING_WORKER_NAME}`,
      retryable: false,
      details: { workerName: context.workerName },
    };
  }
  if (context.mode !== "shadow") {
    return {
      code: "POLICY_NOT_SHADOW_MODE",
      category: "POLICY",
      message: "HOWLER_MODE must be shadow",
      retryable: false,
      details: { mode: context.mode },
    };
  }
  return undefined;
}

/**
 * Defense-in-depth beyond validateIntent's own schema check: rejects any kind/effect pairing
 * that is not the one permitted combination for that kind, including any hypothetical
 * publication or external-system effect the closed RequestedEffect union does not even express.
 */
export function assertPermittedEffect(
  kind: IntentKind,
  requestedEffect: RequestedEffect,
): WorkflowProblem | undefined {
  const required = REQUIRED_EFFECT_BY_KIND[kind];
  if (requestedEffect !== required) {
    return {
      code: "POLICY_EFFECT_NOT_PERMITTED",
      category: "POLICY",
      message: `${kind} may only request the ${required} effect`,
      retryable: false,
      details: { kind, requestedEffect, required },
    };
  }
  return undefined;
}
