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

const PREVIEW_FUNCTION_PATTERN = /function\s+\w*[Pp]review\w*\s*\(/;

/**
 * Checks both the rendered HTML *and* the client script source for every concrete
 * implicit-default/escalation mechanism this codebase's pattern could use, not only one
 * double-quoted HTML regex:
 *
 *  1. an `<option>` marked `selected` for EVIDENCE_APPLY_SHADOW, either quote style
 *  2. a control's `.value` forced to the literal string in script (an assignment, not a read --
 *     `kindEl.value` being *read* to build a request from the user's own selection is fine;
 *     `kindEl.value = "EVIDENCE_APPLY_SHADOW"` forcing it is not)
 *  3. a `DEFAULT`/`INITIAL`-named constant declared as the literal string
 *  4. a preview-named function that automatically calls an apply-named function
 *
 * A user explicitly choosing Apply at runtime (reading `.value`, comparing it, submitting it)
 * never matches any of these -- only an unconditional assignment/declaration/auto-invocation does.
 */
export function checkEvidenceApplyShadowExplicit(
  html: string,
  clientScriptSource: string,
): GateResult {
  const impliedSelectedInHtml =
    /value=["']EVIDENCE_APPLY_SHADOW["'][^>]*selected/.test(html) ||
    /selected[^>]*value=["']EVIDENCE_APPLY_SHADOW["']/.test(html);
  if (impliedSelectedInHtml) {
    return {
      id: "evidence-apply-shadow-explicit",
      pass: false,
      reason:
        "EVIDENCE_APPLY_SHADOW is marked as the default-selected HTML option",
      location: "intent-kind select (HTML)",
    };
  }

  if (/\.value\s*=\s*["']EVIDENCE_APPLY_SHADOW["']/.test(clientScriptSource)) {
    return {
      id: "evidence-apply-shadow-explicit",
      pass: false,
      reason:
        "Client script assigns a control's value to EVIDENCE_APPLY_SHADOW directly (implicit default/escalation)",
      location: "client script .value assignment",
    };
  }

  if (
    /(?:const|let|var)\s+\w*(?:DEFAULT|INITIAL)\w*\s*=\s*["']EVIDENCE_APPLY_SHADOW["']/i.test(
      clientScriptSource,
    )
  ) {
    return {
      id: "evidence-apply-shadow-explicit",
      pass: false,
      reason:
        "Client script declares a default/initial constant set to EVIDENCE_APPLY_SHADOW",
      location: "client script default constant",
    };
  }

  const previewBody = extractFunctionBody(
    clientScriptSource,
    PREVIEW_FUNCTION_PATTERN,
  );
  if (previewBody && /\b\w*[Aa]pply\w*\s*\(/.test(previewBody)) {
    return {
      id: "evidence-apply-shadow-explicit",
      pass: false,
      reason:
        "A preview-related function automatically invokes an apply-related function",
      location: "preview function body",
    };
  }

  return {
    id: "evidence-apply-shadow-explicit",
    pass: true,
    reason:
      "EVIDENCE_APPLY_SHADOW is never default-selected, forced, or auto-invoked from preview",
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `forbiddenSymbols` is the caller-supplied denylist of exported value names (function/const/
 * class) from the engine/domain/operator layer -- built mechanically by
 * `extractExportedValueNames` over the real source files, not a small hand-picked sample this
 * function owns itself (a hardcoded 6-name list here would only catch those exact 6 names; a
 * mechanically-derived list is exhaustive relative to what those modules currently export).
 * Matches on a whole-identifier boundary, so it catches both a call (`analyzeRecovery(...)`) and
 * a bare reference (an alias, a re-export) alike -- either is a structural proof of leakage --
 * without false-positiving on an unrelated identifier that merely contains the name as a
 * substring (e.g. `analyzeRecoveryReportUiLabel`).
 */
export function checkNoBrowserBusinessLogic(
  source: string,
  forbiddenSymbols: readonly string[],
): GateResult {
  const found = forbiddenSymbols.find((name) =>
    new RegExp(`\\b${escapeRegExp(name)}\\b`).test(source),
  );
  if (found) {
    return {
      id: "no-browser-business-logic",
      pass: false,
      reason: `Client-embedded source references a server-only canonical symbol: ${found}`,
      location: found,
    };
  }
  return {
    id: "no-browser-business-logic",
    pass: true,
    reason:
      "No canonical engine/domain/operator symbol found in client-embedded source",
  };
}

/** Explicit tokens for the live integrations Task 17 forbids -- Google Calendar/Drive hosts and
 * client class names, plus the shared Google OAuth host any such integration would need. A plain
 * relative-path fetch to Howler's own API (e.g. `fetch("/v1/intents", ...)`) never matches any of
 * these, so normal same-origin calls are never flagged. */
const FORBIDDEN_LIVE_CONNECTOR_TOKENS = [
  "calendar.google.com",
  "googleapis.com/calendar",
  "drive.google.com",
  "googleapis.com/drive",
  "accounts.google.com",
  "GoogleCalendar",
  "GoogleDrive",
];

export function checkNoLiveConnectorReferences(source: string): GateResult {
  const found = FORBIDDEN_LIVE_CONNECTOR_TOKENS.find((token) =>
    source.includes(token),
  );
  if (found) {
    return {
      id: "no-live-connector-references",
      pass: false,
      reason: `Source references a forbidden live connector integration point: ${found}`,
      location: found,
    };
  }
  return {
    id: "no-live-connector-references",
    pass: true,
    reason: "No forbidden live connector reference found",
  };
}
