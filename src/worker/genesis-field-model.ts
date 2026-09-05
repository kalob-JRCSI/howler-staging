// Project Genesis (v0.9.6 Contractor Hub,
// docs/superpowers/specs/2026-09-04-howler-contractor-hub-v096-design.md): the conservative
// pilot text synthesizer implementing the Genesis adapter seam (GenesisSynthesizer). Consumes
// raw project-intake text; produces a GenesisProposalV096 for the user to review and correct
// before Task 3's HTTP commit route ever validates/builds a canonical project from it.
//
// Deliberately a replaceable pilot adapter, not a second canonical engine: pure parsing/synthesis
// only. No D1, no HTTP, no forecast call, no UI rendering, no external model/API call, no
// external commitment of any kind. "Consume first, interrogate second" -- when extraction is
// uncertain or absent, this never fabricates a fact; it leaves the field unresolved and adds a
// concise assumption/missingCritical item instead.
//
// synthesizeGenesisField throws if `now` is not a valid timestamp: `now` is a system input, not
// project truth, and this function must never derive a malformed date (e.g. "NaN-09-14") from it.

import type {
  GenesisKnownDateV096,
  GenesisProposalV096,
  GenesisScopeItemV096,
} from "../operator/genesis";
import { assertISODate } from "../engine/date";

export type GenesisSynthesizer = (
  text: string,
  now: string,
  preferredProjectId?: string,
) => GenesisProposalV096;

interface ScopeDictionaryEntry {
  id: string;
  label: string;
  phase: string;
}

// Fixed, conservative construction-domain dictionary (design: "a practical baseline
// understanding of construction terminology"). Used two ways below: (1) to decide which
// *phase* an unmatched scope-list phrase like "electrical service upgrade" belongs to, via a
// substring match against the phrase, without renaming the phrase itself; and (2) to canonicalize
// a short, exact activity reference (e.g. "Demo" in "Demo starts September 14") to its proper
// construction identity ("Demolition"). Phase names align with the recognized phase order Task 1
// (src/operator/genesis.ts's PHASE_ORDER) uses for dependency inference where that alignment is
// meaningful; a phrase matching no dictionary entry simply gets no automatic dependency inference
// later, which is expected and safe.
const SCOPE_DICTIONARY: Record<string, ScopeDictionaryEntry> = {
  demo: { id: "demolition", label: "Demolition", phase: "Demolition" },
  foundation: { id: "foundation", label: "Foundation", phase: "Foundation" },
  framing: { id: "framing", label: "Framing", phase: "Framing" },
  electrical: {
    id: "electrical",
    label: "Electrical",
    phase: "MEP Rough-In",
  },
  plumbing: { id: "plumbing", label: "Plumbing", phase: "MEP Rough-In" },
  hvac: { id: "hvac", label: "HVAC", phase: "MEP Rough-In" },
  insulation: {
    id: "insulation",
    label: "Insulation",
    phase: "Insulation",
  },
  drywall: { id: "drywall", label: "Drywall", phase: "Drywall" },
  paint: { id: "paint", label: "Paint", phase: "Paint" },
  tile: { id: "tile", label: "Tile", phase: "Finishes" },
  flooring: { id: "flooring", label: "Flooring", phase: "Finishes" },
  cabinet: { id: "cabinets", label: "Cabinets", phase: "Finishes" },
  countertop: {
    id: "countertops",
    label: "Countertops",
    phase: "Finishes",
  },
  window: { id: "windows", label: "Windows", phase: "Envelope" },
  door: { id: "doors", label: "Doors", phase: "Envelope" },
  roof: { id: "roofing", label: "Roofing", phase: "Envelope" },
  trim: { id: "trim", label: "Trim", phase: "Finishes" },
  punch: { id: "punch-list", label: "Punch list", phase: "Punch" },
  closeout: { id: "closeout", label: "Closeout", phase: "Closeout" },
};

const PROJECT_TYPE_KEYWORDS: { keyword: string; projectType: string }[] = [
  { keyword: "new build", projectType: "RESIDENTIAL_NEW_BUILD" },
  { keyword: "remodel", projectType: "RESIDENTIAL_REMODEL" },
  { keyword: "renovation", projectType: "RESIDENTIAL_RENOVATION" },
  { keyword: "addition", projectType: "RESIDENTIAL_ADDITION" },
];

// Excludes the common idiom "in addition to" (meaning "furthermore") from being read as a
// home-addition project-type signal. A single named exclusion, not general semantic
// classification.
const ADDITION_IDIOM_RE = /\bin\s+addition\s+to\b/i;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_NAME_PATTERN = MONTH_NAMES.join("|");
const MONTH_NAME_ANYWHERE_RE = new RegExp(
  `\\b(?:${MONTH_NAME_PATTERN})\\b`,
  "i",
);

const DEFAULT_TIMEZONE = "America/New_York";

// The pilot grammar for a direct COMMITTED_START is deliberately narrow: <SIMPLE ACTIVITY
// SUBJECT> starts <Month> <Day>. A simple activity subject is a bare noun phrase (e.g. "Demo",
// "Electrical service upgrade", "Cabinet install") -- it must never contain clause/auxiliary
// language that turns the subject into a statement ("We expect Demo to...", "Demo is scheduled
// to...", "Demo will..."). Checked ONLY against the captured subject of a direct-start match
// (never against the whole sentence, and never against the separately-captured month), so a
// month named "May" can never be mistaken for the modal word "may": this list can grow without
// risk of colliding with a month name, because it only ever inspects text captured as "the
// subject", which by construction ends right before the literal "start(s)" token.
const CLAUSE_MARKER_RE = new RegExp(
  "\\b(?:" +
    [
      "we",
      "i",
      "they",
      "he",
      "she",
      "it",
      "is",
      "are",
      "was",
      "were",
      "will",
      "would",
      "expect",
      "expects",
      "expected",
      "hope",
      "hoping",
      "plan",
      "planning",
      "planned",
      "intend",
      "intending",
      "intended",
      "anticipate",
      "anticipating",
      "aim",
      "aiming",
      "scheduled",
      "supposed",
      "discussed",
      "forecast",
      "may",
      "might",
      "could",
      "should",
      "probably",
      "maybe",
      "tentatively",
      "likely",
      "possibly",
      "potentially",
    ].join("|") +
    ")\\b",
  "i",
);

// A clause almost always ends in a dangling infinitive marker ("...to start"): the subject
// capture for "We expect Demo to start September 14" is "We expect Demo to", which ends in a
// standalone "to". Rejecting that shape catches constructions the fixed word list might miss,
// without turning this into a general grammar parser.
const ENDS_IN_STANDALONE_TO_RE = /\bto$/i;

function isSimpleActivitySubject(subjectPhrase: string): boolean {
  return (
    !CLAUSE_MARKER_RE.test(subjectPhrase) &&
    !ENDS_IN_STANDALONE_TO_RE.test(subjectPhrase)
  );
}

// A separate, narrower marker list for constructions where the direct-start shape never matches at
// all (e.g. "We hope to start Demo September 14" -- the month doesn't immediately follow "start").
// Deliberately excludes may/might/could/should/probably/etc: those are only ever relevant to the
// subject-level check above, so this list can never misfire on a month name.
const NON_DIRECT_FORECAST_RE =
  /\b(?:hope|hoping|plan|planning|forecast|forecasted|expect|expects|expected|intend|intending|anticipate|anticipating|aim|aiming)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripTrailingPunctuation(sentence: string): string {
  return sentence.replace(/[.!?]+$/, "").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capitalizeFirst(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function findPhaseForPhrase(phrase: string): string {
  const lower = phrase.toLowerCase();
  for (const entry of Object.values(SCOPE_DICTIONARY)) {
    if (lower.includes(entry.label.toLowerCase())) return entry.phase;
  }
  for (const [keyword, entry] of Object.entries(SCOPE_DICTIONARY)) {
    if (lower.includes(keyword)) return entry.phase;
  }
  return "General";
}

function findProjectName(sentences: string[]): string {
  for (const raw of sentences) {
    const sentence = stripTrailingPunctuation(raw);
    const createMatch = /^create\s+(.+)$/i.exec(sentence);
    if (createMatch?.[1]) return createMatch[1].trim();
    const projectSuffixMatch = /^(.+?)\s+project$/i.exec(sentence);
    if (projectSuffixMatch?.[1]) return projectSuffixMatch[1].trim();
  }
  return "";
}

function findProjectType(sentences: string[]): {
  projectType: string;
  assumption?: string;
} {
  for (const raw of sentences) {
    for (const { keyword, projectType } of PROJECT_TYPE_KEYWORDS) {
      const boundaryRe = new RegExp(
        `\\b${keyword.replace(/\s+/g, "\\s+")}\\b`,
        "i",
      );
      if (!boundaryRe.test(raw)) continue;
      if (keyword === "addition" && ADDITION_IDIOM_RE.test(raw)) continue;
      return { projectType };
    }
  }
  return {
    projectType: "RESIDENTIAL",
    assumption:
      "Project type not explicitly stated in the intake; defaulted to RESIDENTIAL and needs PM confirmation.",
  };
}

function parseMoneyAmount(digits: string, hasKSuffix: boolean): number {
  const numeric = Number(digits.replace(/,/g, ""));
  return hasKSuffix ? numeric * 1000 : numeric;
}

// Each pattern shares the same 4-group scheme regardless of where the phrase falls relative to
// the amount: (1) sign before "$", (2) sign after "$", (3) digits, (4) "k" suffix. Tried in
// descending precedence so a sentence with multiple dollar figures binds to the phrase that
// actually names the project budget, never just "the first number in the sentence".
const TOTAL_PROJECT_BUDGET_RE =
  /total\s+project\s+budget\s*(?:is|:)?\s*(-)?\s*\$?\s*(-)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?/gi;
const TOTAL_BUDGET_RE =
  /total\s+budget\s*(?:is|:)?\s*(-)?\s*\$?\s*(-)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?/gi;
const PROJECT_BUDGET_RE =
  /project\s+budget\s*(?:is|:)?\s*(-)?\s*\$?\s*(-)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?/gi;
const BUDGET_IS_RE =
  /\bbudget\s*(?:is|:)\s*(-)?\s*\$?\s*(-)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?/gi;
const AMOUNT_BUDGET_RE =
  /(-)?\s*\$?\s*(-)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?\s*budget\b/gi;

const BUDGET_PATTERNS = [
  TOTAL_PROJECT_BUDGET_RE,
  TOTAL_BUDGET_RE,
  PROJECT_BUDGET_RE,
  BUDGET_IS_RE,
  AMOUNT_BUDGET_RE,
];

interface BudgetResult {
  budget?: { baseline: number; currency: string };
  assumption?: string;
}

function extractMoneyMatch(match: RegExpMatchArray): {
  isNegative: boolean;
  baseline: number;
} {
  const isNegative = Boolean(match[1] || match[2]);
  const baseline = parseMoneyAmount(match[3] ?? "", Boolean(match[4]));
  return { isNegative, baseline };
}

// Ranks are evaluated across the WHOLE intake (all budget-mentioning sentences at once) before
// ever falling to a lower-precedence rank -- not sentence-by-sentence. Two same-rank statements
// with different amounts anywhere in the intake ("Budget is $400k. Budget is $425k.") are
// genuinely ambiguous and must never be silently resolved to whichever sentence came first; a
// higher-precedence phrase anywhere in the intake ("Total project budget is $425k.") correctly
// overrides a lower-precedence figure regardless of sentence order.
function findBudget(sentences: string[]): BudgetResult {
  const budgetSentences = sentences.filter((s) => /budget/i.test(s));
  if (budgetSentences.length === 0) return {};

  for (const pattern of BUDGET_PATTERNS) {
    const parsed = budgetSentences.flatMap((raw) =>
      [...raw.matchAll(pattern)].map((m) => extractMoneyMatch(m)),
    );
    if (parsed.length === 0) continue;
    if (parsed.some((p) => p.isNegative)) {
      return {
        assumption:
          "Unresolved as of intake: a negative budget amount could not be accepted as a baseline.",
      };
    }
    const distinctBaselines = new Set(parsed.map((p) => p.baseline));
    if (distinctBaselines.size > 1) {
      return {
        assumption:
          "Unresolved as of intake: multiple competing project budget amounts were stated and require PM resolution.",
      };
    }
    const baseline = parsed[0]?.baseline;
    if (baseline === undefined || !Number.isFinite(baseline) || baseline < 0) {
      continue;
    }
    return { budget: { baseline, currency: "USD" } };
  }
  return {};
}

function splitScopePhrases(sentence: string): string[] {
  return sentence
    .split(/,|;|\band\b/i)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
}

function uniqueScopeId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  while (usedIds.has(`${baseId}-${String(suffix)}`)) suffix += 1;
  return `${baseId}-${String(suffix)}`;
}

function findScopeListItems(sentences: string[]): GenesisScopeItemV096[] {
  const items: GenesisScopeItemV096[] = [];
  // Dedupes an exactly-repeated phrase (case-insensitive); distinct phrases that merely
  // slugify to the same id are NOT deduped here -- see usedIds below.
  const seenPhrases = new Set<string>();
  // Guarantees unique ids: two distinct phrases that collide after slugification (e.g. "a-b"
  // and "a b") each keep their own scope item, via a numeric suffix on the second. Also
  // guarantees a Unicode-only phrase (which slugify strips to "") gets a deterministic
  // "scope-item-N" fallback id instead of silently vanishing -- no transliteration/Unicode
  // normalization dependency, just a plain incrementing counter fed through the same
  // uniqueness logic as everything else.
  const usedIds = new Set<string>();
  let fallbackCounter = 0;
  for (const raw of sentences) {
    const scopeMatch = /^scope\s*(?:is|:)\s*(.+)$/i.exec(
      stripTrailingPunctuation(raw),
    );
    if (!scopeMatch?.[1]) continue;
    for (const phrase of splitScopePhrases(scopeMatch[1])) {
      const normalizedPhrase = phrase.trim().toLowerCase();
      if (!normalizedPhrase || seenPhrases.has(normalizedPhrase)) continue;
      seenPhrases.add(normalizedPhrase);
      let baseId = slugify(phrase);
      if (!baseId) {
        fallbackCounter += 1;
        baseId = `scope-item-${String(fallbackCounter)}`;
      }
      const id = uniqueScopeId(baseId, usedIds);
      usedIds.add(id);
      items.push({
        id,
        label: capitalizeFirst(phrase),
        phase: findPhaseForPhrase(phrase),
      });
    }
  }
  return items;
}

interface ActivityStartResult {
  scopeItem?: GenesisScopeItemV096;
  knownDate: GenesisKnownDateV096;
}

type IsoDateAttempt = { ok: true; date: string } | { ok: false };

function tryBuildIsoDate(
  monthName: string,
  day: string,
  year: number,
): IsoDateAttempt {
  const monthIndex = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === monthName.toLowerCase(),
  );
  if (monthIndex === -1) return { ok: false };
  const dayNumber = Number(day);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
    return { ok: false };
  }
  const month = String(monthIndex + 1).padStart(2, "0");
  const paddedDay = String(dayNumber).padStart(2, "0");
  const candidate = `${String(year)}-${month}-${paddedDay}`;
  try {
    assertISODate(candidate);
  } catch {
    return { ok: false };
  }
  return { ok: true, date: candidate };
}

// Anchored to the entire (punctuation-stripped) sentence: a conservative, sentence-level parser
// rather than a broad regex search across the whole text. This intentionally only recognizes the
// simplest direct-commitment shape ("<subject> start(s) <Month> <Day>"); the month and day are
// captured in their OWN groups, separate from the subject, so a month name can never end up being
// checked as if it were part of the subject. Anything with additional trailing words (an explicit
// year, extra clauses) fails this exact-length match and is instead picked up by
// LOOSE_ACTIVITY_START_RE below.
const DIRECT_ACTIVITY_START_RE = new RegExp(
  `^([A-Za-z][A-Za-z ]{0,40}?)\\s+starts?\\s+(${MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`,
  "i",
);

// Unanchored version of the same shape, used ONLY to detect that a sentence looks like a
// start-date statement in a form the pilot parser doesn't fully support (e.g. a trailing explicit
// year: "Demo starts September 14, 2026."). Never used to construct a knownDate -- only to avoid
// silently discarding the user's statement without a review note.
const LOOSE_ACTIVITY_START_RE = new RegExp(
  `\\b([A-Za-z][A-Za-z ]{0,40}?)\\s+starts?\\s+(${MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  "i",
);

function findActivityStartDates(
  sentences: string[],
  year: number,
  existingIds: Set<string>,
): { results: ActivityStartResult[]; hedgeAssumptions: string[] } {
  const results: ActivityStartResult[] = [];
  const hedgeAssumptions: string[] = [];

  for (const raw of sentences) {
    const sentence = stripTrailingPunctuation(raw);
    const directMatch = DIRECT_ACTIVITY_START_RE.exec(sentence);

    if (!directMatch) {
      // Doesn't fit the exact single-clause shape. Either it's a date-shaped statement in an
      // unsupported format (trailing year, extra clause) -- surfaced as a parser-limitation
      // note -- or it's a non-direct forecast/planning construction ("we hope to start...",
      // "...is forecast for...") that never matched a start-date shape at all. Either way: no
      // commitment, no phantom scope item.
      if (LOOSE_ACTIVITY_START_RE.test(sentence)) {
        hedgeAssumptions.push(
          `Unresolved as of intake: stated start date could not be accepted by the pilot date parser: ${sentence}.`,
        );
      } else if (
        NON_DIRECT_FORECAST_RE.test(sentence) &&
        MONTH_NAME_ANYWHERE_RE.test(sentence)
      ) {
        hedgeAssumptions.push(
          `Forecast/uncertain start noted (not committed): ${sentence}.`,
        );
      }
      continue;
    }

    const subjectPhrase = directMatch[1]?.trim();
    const monthName = directMatch[2];
    const day = directMatch[3];
    if (!subjectPhrase || !monthName || !day) continue;

    // Structural rejection: checked only against the captured SUBJECT, never the whole
    // sentence and never the separately-captured month, so "Demo starts May 14" is unaffected
    // while "Demo probably starts September 14" (subject captures "Demo probably") and
    // "We expect Demo to start September 14" (subject captures "We expect Demo to") are both
    // rejected -- the subject is no longer a simple activity noun phrase, it's a clause.
    if (!isSimpleActivitySubject(subjectPhrase)) {
      hedgeAssumptions.push(
        `Forecast/uncertain start noted (not committed): ${sentence}.`,
      );
      continue;
    }

    const dictionaryEntry = SCOPE_DICTIONARY[subjectPhrase.toLowerCase()];
    const subjectId = dictionaryEntry?.id ?? slugify(subjectPhrase);
    const subjectLabel =
      dictionaryEntry?.label ?? capitalizeFirst(subjectPhrase);
    if (!subjectId) continue;

    const dateResult = tryBuildIsoDate(monthName, day, year);
    if (!dateResult.ok) {
      // Never silently discard an explicit date-shaped statement, and never invent a
      // corrected date -- surface why it could not be accepted instead.
      hedgeAssumptions.push(
        `Unresolved as of intake: stated start date for ${subjectLabel} (${monthName} ${day}) could not be accepted as a valid calendar date.`,
      );
      continue;
    }

    const scopeItem = existingIds.has(subjectId)
      ? undefined
      : {
          id: subjectId,
          label: subjectLabel,
          phase: dictionaryEntry?.phase ?? findPhaseForPhrase(subjectPhrase),
        };
    if (scopeItem) existingIds.add(subjectId);

    results.push({
      ...(scopeItem ? { scopeItem } : {}),
      knownDate: {
        subjectId,
        kind: "COMMITTED_START",
        date: dateResult.date,
        label: `${subjectLabel} start`,
      },
    });
  }
  return { results, hedgeAssumptions };
}

const VENDOR_SELECTION_RE = /\bselected\s+[A-Z][\w'&-]*\s+for\s+/i;
const UNCERTAINTY_PATTERNS = [
  /still being priced/i,
  /not yet (?:selected|priced|confirmed|finalized)/i,
  /\bTBD\b/i,
  /\bpending\b/i,
  /not yet confirmed/i,
];

function findAssumptionSentences(sentences: string[]): string[] {
  const assumptions: string[] = [];
  for (const raw of sentences) {
    const sentence = stripTrailingPunctuation(raw);
    if (VENDOR_SELECTION_RE.test(sentence)) {
      assumptions.push(`Trade/vendor note (unverified): ${sentence}.`);
      continue;
    }
    if (UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(sentence))) {
      assumptions.push(`Unresolved as of intake: ${sentence}.`);
    }
  }
  return assumptions;
}

function parseNow(now: string): Date {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `synthesizeGenesisField: now must be a valid timestamp, received: ${now}`,
    );
  }
  return parsed;
}

// Deterministic, simple, and free of raw unvalidated input: a compact form of the (already
// validated by parseNow) timestamp, with characters that are awkward in identifiers/URLs
// (":", ".") replaced. No hashing/crypto/random UUID subsystem.
function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

// Mirrors Task 1's own reserved-identifier guard (src/operator/genesis.ts's RESERVED_IDENTIFIERS)
// for this one field, without importing a shared subsystem: a caller-supplied preferredProjectId
// must never resolve to one of these, even after normalization.
const RESERVED_PROJECT_IDS = new Set(["__proto__", "prototype", "constructor"]);

// Resolves canonical project identity. A caller-supplied preferredProjectId is normalized the
// same conservative way as a name-derived slug (never trusted verbatim); if it normalizes to
// nothing OR to a reserved identifier, falls back to the name-derived slug; if neither resolves,
// identity is left honestly unresolved with a missingCritical note rather than manufacturing a
// random id.
function resolveProjectId(
  preferredProjectId: string | undefined,
  projectName: string,
  missingCritical: string[],
): string {
  if (preferredProjectId !== undefined) {
    const normalized = slugify(preferredProjectId);
    if (normalized && !RESERVED_PROJECT_IDS.has(normalized)) return normalized;
  }
  if (projectName) {
    const nameSlug = slugify(projectName);
    if (nameSlug) return nameSlug;
  }
  missingCritical.push(
    "Project identifier could not be resolved from the intake; a PM-provided project ID is required.",
  );
  return "";
}

/**
 * Conservative pilot text synthesizer implementing the GenesisSynthesizer seam. Consumes first,
 * interrogates second: every field is either extracted from an explicit statement in `text` or
 * left honestly unresolved (empty string / undefined / omitted) with a concise assumption or
 * missingCritical note -- never fabricated. A real model can replace this function later without
 * changing the GenesisProposalV096 contract callers depend on. Throws if `now` is not a valid
 * timestamp (a system input, never project truth).
 */
export const synthesizeGenesisField: GenesisSynthesizer = (
  text,
  now,
  preferredProjectId,
) => {
  const nowDate = parseNow(now);
  const year = nowDate.getUTCFullYear();
  const sentences = splitSentences(text);

  const projectName = findProjectName(sentences);
  const { projectType, assumption: projectTypeAssumption } =
    findProjectType(sentences);
  const { budget, assumption: budgetAssumption } = findBudget(sentences);

  const scopeItems = findScopeListItems(sentences);
  const existingIds = new Set(scopeItems.map((item) => item.id));
  const { results: activityStarts, hedgeAssumptions } = findActivityStartDates(
    sentences,
    year,
    existingIds,
  );
  for (const { scopeItem } of activityStarts) {
    if (scopeItem) scopeItems.push(scopeItem);
  }
  const knownDates = activityStarts.map((result) => result.knownDate);

  const assumptions = findAssumptionSentences(sentences);
  assumptions.push(...hedgeAssumptions);
  if (projectTypeAssumption) assumptions.push(projectTypeAssumption);
  if (budgetAssumption) assumptions.push(budgetAssumption);
  assumptions.push(
    "Timezone defaulted to America/New_York for the pilot and needs PM confirmation.",
  );

  const missingCritical: string[] = [];
  if (!projectName) {
    missingCritical.push(
      "Project name was not stated in the intake; do not proceed without a PM-provided name.",
    );
  }
  if (scopeItems.length > 0) {
    missingCritical.push("Activity durations need PM validation");
  }

  const projectId = resolveProjectId(
    preferredProjectId,
    projectName,
    missingCritical,
  );

  return {
    schemaVersion: "0.9.6",
    proposalId: `genesis-${projectId || "draft"}-${compactTimestamp(nowDate)}`,
    projectId,
    projectName,
    projectType,
    timezone: DEFAULT_TIMEZONE,
    forecastAnchorDate: nowDate.toISOString().slice(0, 10),
    sourceText: text,
    baselineScope: scopeItems,
    knownDates,
    ...(budget ? { budget } : {}),
    assumptions,
    risks: [],
    missingCritical,
  };
};
