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

import type {
  GenesisKnownDateV096,
  GenesisProposalV096,
  GenesisScopeItemV096,
} from "../operator/genesis";

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

const DEFAULT_TIMEZONE = "America/New_York";

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
    const lower = raw.toLowerCase();
    for (const { keyword, projectType } of PROJECT_TYPE_KEYWORDS) {
      if (lower.includes(keyword)) return { projectType };
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

const MONEY_RE = /\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?\b/i;

function findBudget(
  sentences: string[],
): { baseline: number; currency: string } | undefined {
  for (const raw of sentences) {
    if (!/budget/i.test(raw)) continue;
    const match = MONEY_RE.exec(raw);
    if (!match?.[1]) continue;
    const baseline = parseMoneyAmount(match[1], Boolean(match[2]));
    if (!Number.isFinite(baseline) || baseline <= 0) continue;
    return { baseline, currency: "USD" };
  }
  return undefined;
}

function splitScopePhrases(sentence: string): string[] {
  return sentence
    .split(/,|;|\band\b/i)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
}

function findScopeListItems(sentences: string[]): GenesisScopeItemV096[] {
  const items: GenesisScopeItemV096[] = [];
  const seenIds = new Set<string>();
  for (const raw of sentences) {
    const scopeMatch = /^scope\s*(?:is|:)\s*(.+)$/i.exec(
      stripTrailingPunctuation(raw),
    );
    if (!scopeMatch?.[1]) continue;
    for (const phrase of splitScopePhrases(scopeMatch[1])) {
      const id = slugify(phrase);
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
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

function monthDayToIsoDate(
  monthName: string,
  day: string,
  year: number,
): string | undefined {
  const monthIndex = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === monthName.toLowerCase(),
  );
  if (monthIndex === -1) return undefined;
  const dayNumber = Number(day);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
    return undefined;
  }
  const month = String(monthIndex + 1).padStart(2, "0");
  const paddedDay = String(dayNumber).padStart(2, "0");
  return `${String(year)}-${month}-${paddedDay}`;
}

const MONTH_NAME_PATTERN = MONTH_NAMES.join("|");
const ACTIVITY_START_RE = new RegExp(
  `\\b([A-Za-z][A-Za-z ]{0,40}?)\\s+starts?\\s+(${MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  "gi",
);

function findActivityStartDates(
  text: string,
  year: number,
  existingIds: Set<string>,
): ActivityStartResult[] {
  const results: ActivityStartResult[] = [];
  for (const match of text.matchAll(ACTIVITY_START_RE)) {
    const subjectPhrase = match[1]?.trim();
    const monthName = match[2];
    const day = match[3];
    if (!subjectPhrase || !monthName || !day) continue;
    const date = monthDayToIsoDate(monthName, day, year);
    if (!date) continue;

    const dictionaryEntry = SCOPE_DICTIONARY[subjectPhrase.toLowerCase()];
    const subjectId = dictionaryEntry?.id ?? slugify(subjectPhrase);
    const subjectLabel =
      dictionaryEntry?.label ?? capitalizeFirst(subjectPhrase);
    if (!subjectId) continue;

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
        date,
        label: `${subjectLabel} start`,
      },
    });
  }
  return results;
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

/**
 * Conservative pilot text synthesizer implementing the GenesisSynthesizer seam. Consumes first,
 * interrogates second: every field is either extracted from an explicit statement in `text` or
 * left honestly unresolved (empty string / undefined / omitted) with a concise assumption or
 * missingCritical note -- never fabricated. A real model can replace this function later without
 * changing the GenesisProposalV096 contract callers depend on.
 */
export const synthesizeGenesisField: GenesisSynthesizer = (
  text,
  now,
  preferredProjectId,
) => {
  const sentences = splitSentences(text);
  const year = new Date(now).getUTCFullYear();

  const projectName = findProjectName(sentences);
  const { projectType, assumption: projectTypeAssumption } =
    findProjectType(sentences);
  const budget = findBudget(sentences);

  const scopeItems = findScopeListItems(sentences);
  const existingIds = new Set(scopeItems.map((item) => item.id));
  const activityStarts = findActivityStartDates(text, year, existingIds);
  for (const { scopeItem } of activityStarts) {
    if (scopeItem) scopeItems.push(scopeItem);
  }
  const knownDates = activityStarts.map((result) => result.knownDate);

  const assumptions = findAssumptionSentences(sentences);
  if (projectTypeAssumption) assumptions.push(projectTypeAssumption);

  const missingCritical: string[] = [];
  if (!projectName) {
    missingCritical.push(
      "Project name was not stated in the intake; do not proceed without a PM-provided name.",
    );
  }
  if (scopeItems.length > 0) {
    missingCritical.push("Activity durations need PM validation");
  }

  const projectId =
    preferredProjectId ?? (projectName ? slugify(projectName) : "");

  return {
    schemaVersion: "0.9.6",
    proposalId: `genesis-${projectId || "draft"}-${now}`,
    projectId,
    projectName,
    projectType,
    timezone: DEFAULT_TIMEZONE,
    forecastAnchorDate: now.slice(0, 10),
    sourceText: text,
    baselineScope: scopeItems,
    knownDates,
    ...(budget ? { budget } : {}),
    assumptions,
    risks: [],
    missingCritical,
  };
};
