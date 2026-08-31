// Task 17: deterministic, parameterized safety-invariant gate checks. Each function takes an
// explicit input rather than reading a real file itself -- this is what makes "introduce a
// deliberate fixture violation and prove the gate fails" possible in test/gates.test.ts without
// touching the real repo. test/safety/release-gate.test.ts feeds these the real repo's own
// values/content to prove the accepted candidate currently passes every gate.

import { isSafetyCompliant } from "../../../src/operator/policy";
import type { SafetyCandidate } from "../../../src/operator/policy";
import type { GateResult, RouteDescriptor } from "./schemas";

/** Reuses the canonical `isSafetyCompliant` check directly -- the release gate never
 * re-implements the safety-object rule, only reports it as a named gate. */
export function checkStagingShadowCompliance(
  safety: SafetyCandidate,
): GateResult {
  if (!isSafetyCompliant(safety)) {
    return {
      id: "staging-shadow-compliance",
      pass: false,
      reason: `Safety object is not staging/shadow compliant: ${JSON.stringify(safety)}`,
      location: "OPERATOR_SAFETY",
    };
  }
  return {
    id: "staging-shadow-compliance",
    pass: true,
    reason: "Safety object is fully staging/shadow compliant",
  };
}

export interface LiveSystemCandidate {
  liveSystemsConnected: boolean;
  dashboardConnected: boolean;
  calendarConnected: boolean;
}

const LIVE_SYSTEM_FLAGS = [
  "liveSystemsConnected",
  "dashboardConnected",
  "calendarConnected",
] as const;

export function checkLiveSystemActivation(
  safety: LiveSystemCandidate,
): GateResult {
  const active = LIVE_SYSTEM_FLAGS.filter((flag) => safety[flag]);
  const firstActive = active[0];
  if (firstActive) {
    return {
      id: "live-system-activation",
      pass: false,
      reason: `Live system flag(s) active: ${active.join(", ")}`,
      location: firstActive,
    };
  }
  return {
    id: "live-system-activation",
    pass: true,
    reason: "No live system flags are active",
  };
}

export interface ProductionConfigCandidate {
  mode: string;
  productionDeployment: boolean;
}

export function checkProductionConfig(
  config: ProductionConfigCandidate,
): GateResult {
  if (config.mode !== "shadow") {
    return {
      id: "production-config",
      pass: false,
      reason: `mode must be "shadow", got "${config.mode}"`,
      location: "mode",
    };
  }
  if (config.productionDeployment) {
    return {
      id: "production-config",
      pass: false,
      reason: "productionDeployment must be false",
      location: "productionDeployment",
    };
  }
  return {
    id: "production-config",
    pass: true,
    reason: "mode=shadow and productionDeployment=false",
  };
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Fails if any mutation-method route is outside the caller-supplied accepted set -- a route
 * table addition never silently becomes a legacy-style mutation path. Read-only routes outside
 * the accepted set are unaffected. */
export function checkNoLegacyMutationRoute(
  routes: RouteDescriptor[],
  allowedMutationPaths: readonly string[],
): GateResult {
  const allowed = new Set(allowedMutationPaths);
  const violation = routes.find(
    (route) =>
      MUTATION_METHODS.has(route.method.toUpperCase()) &&
      !allowed.has(route.path),
  );
  if (violation) {
    return {
      id: "no-legacy-mutation-route",
      pass: false,
      reason: `Mutation route not in the accepted set: ${violation.method} ${violation.path}`,
      location: violation.path,
    };
  }
  return {
    id: "no-legacy-mutation-route",
    pass: true,
    reason: "Every mutation route is in the accepted set",
  };
}

export function checkEvidenceApplyShadowExplicit(html: string): GateResult {
  const impliedSelected =
    /value="EVIDENCE_APPLY_SHADOW"[^>]*selected/.test(html) ||
    /selected[^>]*value="EVIDENCE_APPLY_SHADOW"/.test(html);
  if (impliedSelected) {
    return {
      id: "evidence-apply-shadow-explicit",
      pass: false,
      reason: "EVIDENCE_APPLY_SHADOW is marked as the default-selected option",
      location: "intent-kind select",
    };
  }
  return {
    id: "evidence-apply-shadow-explicit",
    pass: true,
    reason: "EVIDENCE_APPLY_SHADOW is never default-selected",
  };
}

/** Extracts one function's `{ ... }` body via brace-depth counting -- no real parser needed for
 * this deterministic, single-purpose scan. Returns null if the name pattern or a balanced brace
 * pair is not found. */
function extractFunctionBody(
  source: string,
  namePattern: RegExp,
): string | null {
  const match = namePattern.exec(source);
  if (!match) return null;
  const startIndex = source.indexOf("{", match.index);
  if (startIndex === -1) return null;
  let depth = 0;
  for (let i = startIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return null;
}

const RESUME_FUNCTION_PATTERN = /function\s+\w*[Rr]esume\w*\s*\(/;

/** Fails if a resume-related function submits a fresh POST /v1/intents instead of the canonical
 * .../resume endpoint -- an interrupted workflow must be continued only through Resume. */
export function checkCanonicalResumeOwnership(source: string): GateResult {
  const body = extractFunctionBody(source, RESUME_FUNCTION_PATTERN);
  if (!body) {
    return {
      id: "canonical-resume-ownership",
      pass: false,
      reason: "No resume-related function found in the supplied source",
      location: "resume function",
    };
  }
  if (body.includes('"/v1/intents"') || body.includes("'/v1/intents'")) {
    return {
      id: "canonical-resume-ownership",
      pass: false,
      reason:
        "A resume-related function submits to /v1/intents instead of the canonical /v1/workflows/:workflowId/resume endpoint",
      location: "resume function body",
    };
  }
  if (!/\/resume/.test(body)) {
    return {
      id: "canonical-resume-ownership",
      pass: false,
      reason:
        "A resume-related function does not call the canonical .../resume endpoint",
      location: "resume function body",
    };
  }
  return {
    id: "canonical-resume-ownership",
    pass: true,
    reason:
      "Resume-related function targets the canonical .../resume endpoint only",
  };
}

/** Canonical engine/operator function names that must only ever run server-side. Their name
 * appearing inside client-embedded source is a structural proof of leaked business logic --
 * these functions are never importable in a browser context, so the only way the literal call
 * text appears there is a duplicated implementation. */
const FORBIDDEN_SERVER_ONLY_CALLS = [
  "analyzeRecovery(",
  "forecastAfterEvent(",
  "forecastInitial(",
  "publishForecast(",
  "commitShadowTransition(",
  "validateProjectModel(",
];

export function checkNoBrowserBusinessLogic(source: string): GateResult {
  const found = FORBIDDEN_SERVER_ONLY_CALLS.find((name) =>
    source.includes(name),
  );
  if (found) {
    return {
      id: "no-browser-business-logic",
      pass: false,
      reason: `Client-embedded source calls a server-only canonical function: ${found}`,
      location: found,
    };
  }
  return {
    id: "no-browser-business-logic",
    pass: true,
    reason:
      "No canonical server-only function call found in client-embedded source",
  };
}
