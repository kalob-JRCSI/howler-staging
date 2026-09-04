// Field-readiness blocker fix: a minimal, deterministic, clearly-scoped `callModel`
// implementation for interpretTurn's existing, required dependency (src/operator/interpreter.ts's
// "single probabilistic boundary" contract: given a prompt, return the JSON claim-span shape).
//
// This is NOT a new reasoning engine, and it does not replace or duplicate interpretTurn -- it
// fills the one external dependency interpretTurn already declares, the same way Task 18's own
// regex-based commandKind is deterministic pattern matching, not AI. No live LLM/external API
// binding exists anywhere in this codebase today (no AI binding in wrangler.jsonc, no model API
// key), and provisioning one is a real infrastructure decision (cost, a new binding, an external
// dependency) this fix does not make unilaterally. This stand-in exists so the field-test HTTP
// path is genuinely reachable and testable today; swapping in a real model-backed `callModel`
// later requires no change anywhere else -- interpretTurn's contract is the same either way.
//
// Deliberately conservative, matching this whole codebase's "never guess, fail closed" policy:
// recognizes a small, explicit set of FACT-observation verb phrases and two relative date words
// ("today"/"yesterday") plus a literal ISO date. Anything it cannot confidently match becomes a
// CLARIFICATION span, never a guessed claim -- exactly interpretTurn's own documented contract for
// what a real model is expected to do when uncertain.

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

interface VerbMatch {
  claimType:
    | "ACTIVITY_STARTED"
    | "ACTIVITY_COMPLETED"
    | "DELIVERY_RECEIVED"
    | "INSPECTION_COMPLETED"
    | "CONDITION_OBSERVED";
  pattern: RegExp;
}

// Ordered: more specific phrases first, so "inspection passed" isn't swallowed by a looser rule.
const VERB_MATCHES: VerbMatch[] = [
  {
    claimType: "INSPECTION_COMPLETED",
    pattern: /\b(passed inspection|inspection passed|inspected)\b/i,
  },
  {
    claimType: "DELIVERY_RECEIVED",
    pattern: /\b(delivered|arrived|received)\b/i,
  },
  {
    claimType: "ACTIVITY_COMPLETED",
    pattern: /\b(finished|completed|done)\b/i,
  },
  { claimType: "ACTIVITY_STARTED", pattern: /\b(started|began|begun)\b/i },
  {
    claimType: "CONDITION_OBSERVED",
    pattern: /\b(is on site|showed up|mobilized|is up)\b/i,
  },
];

function resolveDate(text: string, now: string): string | undefined {
  const iso = ISO_DATE.exec(text);
  if (iso?.[1]) return iso[1];
  const today = now.slice(0, 10);
  if (/\btoday\b/i.test(text)) return today;
  if (/\byesterday\b/i.test(text)) {
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

function projectAliasFromId(projectId: string): string {
  return projectId.replace(/-v?\d+$/i, "");
}

/**
 * Builds a `callModel` for the given known project ids, matching interpretTurn's exact
 * `(prompt: string) => Promise<string>` contract. The prompt itself (built by interpretTurn's own
 * buildPrompt) is not parsed here -- this reads the same raw utterance text out of the prompt's
 * own "Utterance: ..." line, since that's the only information a real model call would need to
 * act on. Returns the exact `{"spans": [...]}` JSON shape interpretTurn expects.
 */
export function buildFieldTestCallModel(
  now: () => string = () => new Date().toISOString(),
): (prompt: string) => Promise<string> {
  return (prompt: string) => {
    const utteranceLine = /^Utterance: (.*)$/m.exec(prompt);
    const text = utteranceLine?.[1]?.trim() ?? "";
    if (!text) {
      return Promise.resolve(
        JSON.stringify({
          spans: [
            {
              type: "CLARIFICATION",
              message: "I did not hear anything to record.",
            },
          ],
        }),
      );
    }

    const verb = VERB_MATCHES.find((v) => v.pattern.test(text));
    if (!verb) {
      return Promise.resolve(
        JSON.stringify({
          spans: [
            {
              type: "CLARIFICATION",
              message: "I could not confidently interpret that.",
            },
          ],
        }),
      );
    }

    const effectiveDate = resolveDate(text, now());
    const withoutVerb = text.replace(verb.pattern, " ").trim();
    const withoutDate = withoutVerb
      .replace(ISO_DATE, " ")
      .replace(/\btoday\b/i, " ")
      .replace(/\byesterday\b/i, " ")
      .trim();
    const subjectText = withoutDate.replace(/[.?!,]+$/g, "").trim();

    const span: Record<string, unknown> = {
      type: "CLAIM",
      projectRef: text,
      subjectRef: subjectText,
      subjectText: subjectText || text,
      claimType: verb.claimType,
      certainty: "STATED",
    };
    if (effectiveDate) span.effectiveDate = effectiveDate;

    return Promise.resolve(JSON.stringify({ spans: [span] }));
  };
}

/** Derives a reasonable alias list ("deboard" for "deboard-v091") for the known project ids this
 * route is scoped to, so a plain-language mention resolves without requiring the exact slug. */
export function fieldTestAliasesFor(
  projectIds: string[],
): { alias: string; projectId: string }[] {
  return projectIds
    .map((projectId) => ({ alias: projectAliasFromId(projectId), projectId }))
    .filter(
      (entry) => entry.alias.length > 0 && entry.alias !== entry.projectId,
    );
}
