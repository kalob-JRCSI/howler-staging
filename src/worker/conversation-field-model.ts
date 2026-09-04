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
//
// Safety repair (blocker 5 -- conservative expansion, ordinary pilot language only): adds
// recognition for COMMITMENT-flavored verb phrases ("is coming", "expects to <verb>") and
// UNCERTAIN/UNKNOWN phrases ("not sure", "don't have that date yet"), plus day-name date
// resolution ("Monday", "Friday") so a COMMITMENT claim can carry a real date. Every new claim
// type comes from `src/operator/conversation.ts`'s own existing `ConversationClaimType` union and
// is classified FACT/COMMITMENT/null by claim-compiler.ts's existing, unmodified `CLASSIFY`
// table -- this file only ever picks *which* existing claimType applies; it never decides what a
// claimType means. UNCERTAIN phrases are checked before FACT/COMMITMENT verb phrases, so a
// hedged statement is never mis-read as a confident one merely because it happens to contain a
// recognized verb.

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

interface CommitmentMatch {
  claimType: "TRADE_ATTENDANCE_PLANNED" | "WORK_REQUESTED";
  pattern: RegExp;
}

// A scheduled/expected event, never a completed one -- claim-compiler.ts's own CLASSIFY table
// maps both of these to "COMMITMENT" (never "FACT"), and neither ever sets an actualStart/
// actualFinish (buildMutations emits SET_SCHEDULE_LOCK for both, exactly the same as
// SCHEDULE_CHANGED/DELIVERY_EXPECTED already in that table).
const COMMITMENT_MATCHES: CommitmentMatch[] = [
  {
    claimType: "TRADE_ATTENDANCE_PLANNED",
    pattern: /\b(is coming|coming|will come|will be there|will be here)\b/i,
  },
  {
    claimType: "WORK_REQUESTED",
    pattern:
      /\b(expects? to|plans? to|is (?:planning|scheduled) to|intends? to)\b/i,
  },
];

// Genuine uncertainty is recognized *before* any FACT/COMMITMENT verb phrase, so a hedged
// statement ("not sure if it started") is never misread as a confident FACT merely because it
// contains a recognized verb elsewhere in the same sentence. Maps to CONSTRAINT_UNRESOLVED --
// claim-compiler.ts's CLASSIFY table gives this (and DECISION_UNRESOLVED) `mutationClass: null`,
// so compileClaim returns a NoMutationResult immediately, before ever resolving an entity or
// touching project state: nothing is ever applied, nothing is ever guessed.
const UNCERTAIN_PATTERN =
  /\b(not sure|don'?t know|unsure|not certain|haven'?t (?:heard|gotten)|don'?t have (?:that|a|the) date|no date yet)\b/i;

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
  return resolveWeekday(text, today);
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** "Monday"/"Friday"/etc. always resolves to the *next* occurrence of that weekday, strictly
 * after today -- ordinary construction-scheduling usage ("Jason is coming Monday") always means
 * the imminent one ahead, never today even if today happens to be that weekday, and never a past
 * occurrence. Deliberately conservative: matches only a bare weekday name, not "next Monday" or
 * "this Monday" (those remain unrecognized -> CLARIFICATION, never guessed). */
function resolveWeekday(text: string, today: string): string | undefined {
  const match =
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(
      text,
    );
  if (!match?.[1]) return undefined;
  const targetIndex = WEEKDAYS.indexOf(match[1].toLowerCase());
  const base = new Date(`${today}T00:00:00.000Z`);
  const currentIndex = base.getUTCDay();
  let delta = targetIndex - currentIndex;
  if (delta <= 0) delta += 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

function stripMatchedWords(text: string, ...patterns: RegExp[]): string {
  let result = text;
  for (const pattern of patterns) result = result.replace(pattern, " ");
  return result
    .replace(ISO_DATE, " ")
    .replace(/\btoday\b/i, " ")
    .replace(/\byesterday\b/i, " ")
    .replace(
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      " ",
    )
    .replace(/[.?!,]+$/g, "")
    .trim();
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

    if (UNCERTAIN_PATTERN.test(text)) {
      const subjectText = stripMatchedWords(text, UNCERTAIN_PATTERN);
      return Promise.resolve(
        JSON.stringify({
          spans: [
            {
              type: "CLAIM",
              projectRef: text,
              subjectRef: subjectText,
              subjectText: subjectText || text,
              claimType: "CONSTRAINT_UNRESOLVED",
              certainty: "STATED",
            },
          ],
        }),
      );
    }

    const verb = VERB_MATCHES.find((v) => v.pattern.test(text));
    if (verb) {
      const effectiveDate = resolveDate(text, now());
      const subjectText = stripMatchedWords(text, verb.pattern);
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
    }

    const commitment = COMMITMENT_MATCHES.find((c) => c.pattern.test(text));
    if (commitment) {
      const effectiveDate = resolveDate(text, now());
      const subjectText = stripMatchedWords(text, commitment.pattern);
      const span: Record<string, unknown> = {
        type: "CLAIM",
        projectRef: text,
        subjectRef: subjectText,
        subjectText: subjectText || text,
        claimType: commitment.claimType,
        certainty: "STATED",
      };
      if (effectiveDate) span.effectiveDate = effectiveDate;
      return Promise.resolve(JSON.stringify({ spans: [span] }));
    }

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
