// Project Genesis (v0.9.6 Contractor Hub,
// docs/superpowers/specs/2026-09-04-howler-contractor-hub-v096-design.md): converts a
// user-reviewed intake proposal into a canonical ProjectModelV094 at revision 0. Pure -- no D1, no
// network, no HTTP. Genesis is the only new synthesis path; the existing deterministic
// project/event/forecast kernel remains authoritative once a project exists (see
// buildProjectFromGenesis below, which returns a project the existing
// D1HowlerRepository.createProject/forecastInitial pipeline can persist unchanged).

import { validateProjectModel } from "../domain/validation";
import { assertISODate } from "../engine/date";
import type {
  ActivityV094,
  DependencyV094,
  ProjectModelV094,
  ProjectProfileV096,
  SourceV094,
} from "../domain/types";

export interface GenesisScopeItemV096 {
  id: string;
  label: string;
  phase: string;
  optimisticDays?: number;
  likelyDays?: number;
  conservativeDays?: number;
}

export interface GenesisKnownDateV096 {
  subjectId: string;
  kind: "COMMITTED_START" | "COMMITTED_FINISH" | "FORECAST_START";
  date: string;
  label: string;
}

export interface GenesisProposalV096 {
  schemaVersion: "0.9.6";
  proposalId: string;
  projectId: string;
  projectName: string;
  clientName?: string;
  address?: string;
  projectType: string;
  timezone: string;
  forecastAnchorDate: string;
  sourceText: string;
  baselineScope: GenesisScopeItemV096[];
  knownDates: GenesisKnownDateV096[];
  budget?: { baseline?: number; spent?: number; currency: string };
  assumptions: string[];
  risks: string[];
  missingCritical: string[];
}

// Recognized construction phase order -- used only to infer conservative, non-speculative
// dependencies between recognized phases that are both actually present in the approved baseline
// scope. Never used to invent a relationship between unrecognized phase labels.
const PHASE_ORDER = [
  "Demolition",
  "Foundation",
  "Framing",
  "MEP Rough-In",
  "Inspection",
  "Insulation",
  "Drywall",
  "Paint",
  "Finishes",
  "MEP Finals",
  "Punch",
  "Closeout",
];

// Task 8 pilot smoke correction: a scope item whose phase falls OUTSIDE PHASE_ORDER entirely
// (most commonly "General" -- the default fallback phase for room-named scope like "Kitchen" or
// "Primary bath" -- and "Envelope", which covers windows/doors/roofing) never participates in the
// recognized-phase sequencing above at all, by design. Left with no relationship to Demolition
// whatsoever, such an item forecasts from the project's own anchor date with no regard for a
// committed Demolition start, which is exactly how the pilot smoke test caught Kitchen/Primary
// bath/Windows forecast to start days before Demolition's committed date. The guarded conservative
// inference in buildProjectFromGenesis below (every Demolition-phase item precedes every such
// unrecognized-phase item, unless that item already carries its own explicit committed date)
// applies only to these project types -- new construction has nothing being demolished away from
// a room's prior use, and the plain/default "RESIDENTIAL" type carries no signal this inference is
// appropriate.
const DEMOLITION_INFERENCE_PROJECT_TYPES = new Set([
  "RESIDENTIAL_REMODEL",
  "RESIDENTIAL_RENOVATION",
  "RESIDENTIAL_ADDITION",
]);

// Deliberately visible pilot baseline duration for a scope item with no explicit estimate. The
// Genesis review UI must surface this assumption before approval (design: "The proposal UI must
// already expose that assumption before approval").
const PILOT_BASELINE_DURATION_DAYS = {
  optimistic: 2,
  likely: 4,
  conservative: 7,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Reuses the same canonical schedule-date rule the rest of the domain enforces
// (src/engine/date.ts's assertISODate: strict YYYY-MM-DD, real calendar day) rather than the
// far looser Date.parse, which also accepts human-readable strings like "September 14, 2026" and
// silently normalizes invalid calendar dates like "2026-02-30".
function isValidIsoDate(value: string): boolean {
  try {
    assertISODate(value);
    return true;
  } catch {
    return false;
  }
}

// Plain JS objects treat an own-property assignment keyed "__proto__" as a prototype
// reassignment rather than a normal data property (obj["__proto__"] = x mutates obj's own
// prototype instead of creating an entry), and "constructor"/"prototype" carry similar
// footguns. A scope item id equal to one of these would silently vanish from
// Object.keys(activities) once assigned in buildProjectFromGenesis. Reject them here, at the
// single point every scope/known-date id is validated, rather than changing how the canonical
// activities/dependencies/sources records are constructed everywhere.
const RESERVED_IDENTIFIERS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeIdentifier(value: string): boolean {
  return !RESERVED_IDENTIFIERS.has(value);
}

/**
 * Deterministic, collision-free dependency id for an ordered (predecessorId, successorId) pair.
 * Plain concatenation (`${predecessorId}-${successorId}`) is not collision-free: scope ids may
 * themselves contain hyphens, so predecessor "a-b" + successor "c" and predecessor "a" +
 * successor "b-c" both concatenate to the same literal string "a-b-c". Length-prefixing each
 * component (`<len>:<value>`) makes the pair unambiguous for any string component, without
 * forbidding hyphens (or any other character) in valid scope ids and without reaching for a hash
 * or a second id subsystem.
 */
function genesisDependencyId(
  predecessorId: string,
  successorId: string,
): string {
  return `dep-genesis-${String(predecessorId.length)}:${predecessorId}-${String(successorId.length)}:${successorId}`;
}

interface EffectiveDuration {
  optimistic: number;
  likely: number;
  conservative: number;
}

function effectiveDuration(item: GenesisScopeItemV096): EffectiveDuration {
  return {
    optimistic: item.optimisticDays ?? PILOT_BASELINE_DURATION_DAYS.optimistic,
    likely: item.likelyDays ?? PILOT_BASELINE_DURATION_DAYS.likely,
    conservative:
      item.conservativeDays ?? PILOT_BASELINE_DURATION_DAYS.conservative,
  };
}

// Mirrors the exact invariant src/domain/validation.ts's validateProjectModel enforces on every
// activity's duration (each estimate a positive integer, optimistic <= likely <= conservative) --
// checked here, on the *effective* value (explicit or defaulted), so a malformed estimate is
// reported as a clean Genesis proposal error instead of surfacing later as a generic
// validateProjectModel throw.
function validateEffectiveDuration(
  item: GenesisScopeItemV096,
  errors: string[],
): void {
  const duration = effectiveDuration(item);
  for (const [label, value] of Object.entries(duration)) {
    if (!Number.isInteger(value) || value < 1) {
      errors.push(
        `baselineScope item ${item.id} ${label} duration must be an integer >= 1`,
      );
    }
  }
  if (!(
    duration.optimistic <= duration.likely &&
    duration.likely <= duration.conservative
  )) {
    errors.push(
      `baselineScope item ${item.id} duration estimates must satisfy optimistic <= likely <= conservative`,
    );
  }
}

/**
 * Pure proposal-level validation -- returns every problem found rather than throwing, so a caller
 * (the HTTP commit route, a UI review step, or buildProjectFromGenesis itself) can surface all of
 * them at once instead of one at a time.
 */
export function validateGenesisProposal(
  proposal: GenesisProposalV096,
): string[] {
  const errors: string[] = [];

  // Deliberately not re-checked here: TypeScript already guarantees schemaVersion is exactly
  // "0.9.6" for any value actually typed GenesisProposalV096, so a runtime `!== "0.9.6"`
  // comparison is dead code against this signature (confirmed by
  // @typescript-eslint/no-unnecessary-condition). The real risk is untrusted HTTP JSON that has
  // merely been *cast* to this type without being proven to match it -- that check belongs at
  // Task 3's HTTP commit route, on the raw parsed body, before it is ever treated as a
  // GenesisProposalV096 (the same pattern src/operator/intent.ts's validateIntent already uses
  // for its own untrusted-JSON boundary).
  if (!isNonEmptyString(proposal.proposalId)) {
    errors.push("proposalId is required");
  }
  if (!isNonEmptyString(proposal.projectId)) {
    errors.push("projectId is required");
  }
  if (!isNonEmptyString(proposal.projectName)) {
    errors.push("projectName is required");
  }
  if (!isNonEmptyString(proposal.projectType)) {
    errors.push("projectType is required");
  }
  if (!isNonEmptyString(proposal.timezone)) {
    errors.push("timezone is required");
  }
  if (!isNonEmptyString(proposal.forecastAnchorDate)) {
    errors.push("forecastAnchorDate is required");
  } else if (!isValidIsoDate(proposal.forecastAnchorDate)) {
    errors.push("forecastAnchorDate must be a valid date");
  }

  if (proposal.baselineScope.length === 0) {
    errors.push("baselineScope must contain at least one work item");
  }
  const scopeIds = new Set<string>();
  for (const item of proposal.baselineScope) {
    if (!isNonEmptyString(item.id)) {
      errors.push("baselineScope item is missing an id");
      continue;
    }
    if (!isSafeIdentifier(item.id)) {
      errors.push(`baselineScope item id is not allowed: ${item.id}`);
      continue;
    }
    if (scopeIds.has(item.id)) {
      errors.push(`baselineScope has a duplicate item id: ${item.id}`);
    }
    scopeIds.add(item.id);
    if (!isNonEmptyString(item.label)) {
      errors.push(`baselineScope item ${item.id} is missing a label`);
    }
    if (!isNonEmptyString(item.phase)) {
      errors.push(`baselineScope item ${item.id} is missing a phase`);
    }
    validateEffectiveDuration(item, errors);
  }

  // Tracks each subject's committed dates so a duplicate kind (last-one-wins) or a
  // start-after-finish contradiction is reported here, before buildProjectFromGenesis ever
  // constructs a schedule lock validateProjectModel would separately reject.
  const committedStartBySubject = new Map<string, string>();
  const committedFinishBySubject = new Map<string, string>();
  for (const known of proposal.knownDates) {
    if (!scopeIds.has(known.subjectId)) {
      errors.push(
        `knownDates entry references unknown baselineScope item: ${known.subjectId}`,
      );
    }
    if (!isNonEmptyString(known.date) || !isValidIsoDate(known.date)) {
      errors.push(
        `knownDates entry for ${known.subjectId} has an invalid date`,
      );
    } else if (known.kind === "COMMITTED_START") {
      if (committedStartBySubject.has(known.subjectId)) {
        errors.push(
          `knownDates has more than one COMMITTED_START for ${known.subjectId}`,
        );
      }
      committedStartBySubject.set(known.subjectId, known.date);
    } else if (known.kind === "COMMITTED_FINISH") {
      if (committedFinishBySubject.has(known.subjectId)) {
        errors.push(
          `knownDates has more than one COMMITTED_FINISH for ${known.subjectId}`,
        );
      }
      committedFinishBySubject.set(known.subjectId, known.date);
    }
    if (!isNonEmptyString(known.label)) {
      errors.push(`knownDates entry for ${known.subjectId} is missing a label`);
    }
  }
  for (const [subjectId, start] of committedStartBySubject) {
    const finish = committedFinishBySubject.get(subjectId);
    if (finish !== undefined && finish < start) {
      errors.push(
        `knownDates for ${subjectId} has a committed finish before its committed start`,
      );
    }
  }

  if (proposal.budget) {
    const { baseline, spent, currency } = proposal.budget;
    if (!isNonEmptyString(currency)) {
      errors.push("budget currency is required when budget is present");
    }
    if (
      baseline !== undefined &&
      (!Number.isFinite(baseline) || baseline < 0)
    ) {
      errors.push("budget baseline must be a non-negative finite number");
    }
    if (spent !== undefined && (!Number.isFinite(spent) || spent < 0)) {
      errors.push("budget spent must be a non-negative finite number");
    }
  }

  return errors;
}

/**
 * Builds the canonical revision-0 ProjectModelV094 for an approved Genesis proposal. Throws one
 * joined Error if the proposal itself is invalid (callers that already ran
 * validateGenesisProposal for a 400-style response won't normally hit this). Genesis is initial
 * project state, not a fake post-creation event -- eventLedger stays empty and revision stays 0,
 * matching the existing invariant that revision === eventLedger.length
 * (src/domain/validation.ts).
 */
export function buildProjectFromGenesis(
  proposal: GenesisProposalV096,
  approvedAt: string,
): ProjectModelV094 {
  const errors = validateGenesisProposal(proposal);
  if (errors.length > 0) {
    throw new Error(`Invalid Genesis proposal: ${errors.join("; ")}`);
  }

  const sourceId = `src-genesis-${proposal.proposalId}`;
  const source: SourceV094 = {
    id: sourceId,
    type: "PM_CONFIRMED_GENESIS",
    label: `Project Genesis intake for ${proposal.projectName}`,
    observedAt: approvedAt,
    authority: 1,
    reliability: 1,
  };

  const activities: Record<string, ActivityV094> = {};
  for (const item of proposal.baselineScope) {
    activities[item.id] = {
      id: item.id,
      name: item.label,
      phase: item.phase,
      state: "NOT_STARTED",
      duration: {
        optimistic:
          item.optimisticDays ?? PILOT_BASELINE_DURATION_DAYS.optimistic,
        likely: item.likelyDays ?? PILOT_BASELINE_DURATION_DAYS.likely,
        conservative:
          item.conservativeDays ?? PILOT_BASELINE_DURATION_DAYS.conservative,
        sourceIds: [sourceId],
      },
      constraintIds: [],
      sourceIds: [sourceId],
    };
  }

  // Apply known committed dates as schedule locks only -- a FORECAST_START known date never
  // becomes a commitment (design: "never turn forecast-only dates into commitments").
  for (const known of proposal.knownDates) {
    const activity = activities[known.subjectId];
    if (!activity) continue;
    if (known.kind === "COMMITTED_START") {
      activity.scheduleLock = {
        ...activity.scheduleLock,
        startDate: known.date,
        sourceId,
      };
    } else if (known.kind === "COMMITTED_FINISH") {
      activity.scheduleLock = {
        ...activity.scheduleLock,
        finishDate: known.date,
        sourceId,
      };
    }
  }

  // Connect recognized phases that are both actually present, walking the ordered SUBSET of
  // recognized phases present in this scope rather than requiring literal PHASE_ORDER index
  // adjacency. A small remodel routinely skips most of the 12-phase taxonomy (e.g. Demolition +
  // MEP Rough-In + Finishes, with Foundation/Framing/Inspection/Insulation/Drywall/Paint all
  // absent) -- the previous index-adjacency-only version silently generated zero dependencies for
  // exactly this common shape, because it required Foundation and Framing (both absent) to bridge
  // Demolition to MEP Rough-In (Task 8 pilot smoke: "Smith Residence forecast sequencing"). Never
  // invents a relationship between two recognized phases unless BOTH are present, and never
  // reorders PHASE_ORDER itself -- it only skips gaps.
  //
  // These dependencies (and the guarded conservative ones below) are marked hard: true, not the
  // inert hard: false a purely-descriptive "recognized phase order" label might suggest --
  // src/engine/solver.ts's solveScenario forward pass (`if (!dep.hard) continue`) only ever lets a
  // HARD dependency's predecessor finish date push a successor's forecast start; a soft dependency
  // is solver-invisible and only ever surfaces as driver-summary text, never actually affecting a
  // computed date. Genesis's own recognized-phase sequencing is exactly the kind of
  // strong-confidence, non-speculative inference the design calls for actually reflecting in the
  // forecast a PM sees, not merely narrating in a details panel. A hard dependency never overrides
  // an activity's own scheduleLock: solveScenario applies an explicit lock unconditionally AFTER
  // computing the dependency-derived candidate date, so a PM's own commitment is always preserved.
  //
  // Dependency ids built below always carry the fixed, non-empty "dep-genesis-" prefix, so the
  // constructed key can never equal a reserved Record-prototype identifier
  // ("__proto__"/"constructor"/"prototype") regardless of which (already-validated-safe) scope
  // ids it is built from -- no separate reserved-identifier check is needed for dependency ids
  // themselves.
  const itemsByPhase = new Map<string, GenesisScopeItemV096[]>();
  for (const item of proposal.baselineScope) {
    if (!PHASE_ORDER.includes(item.phase)) continue;
    const list = itemsByPhase.get(item.phase);
    if (list) {
      list.push(item);
    } else {
      itemsByPhase.set(item.phase, [item]);
    }
  }
  const dependencies: Record<string, DependencyV094> = {};
  const addDependency = (
    predecessor: GenesisScopeItemV096,
    successor: GenesisScopeItemV096,
    reason: string,
  ): void => {
    const dependencyId = genesisDependencyId(predecessor.id, successor.id);
    // Defense-in-depth: genesisDependencyId is deterministic and collision-free for any ordered
    // pair, so this should never actually fire -- but if it ever did, silently overwriting an
    // existing relationship would be far worse than failing loudly.
    if (dependencies[dependencyId]) {
      throw new Error(
        `Generated dependency id collision: ${dependencyId} (predecessor ${predecessor.id}, successor ${successor.id})`,
      );
    }
    dependencies[dependencyId] = {
      id: dependencyId,
      active: true,
      predecessorId: predecessor.id,
      successorId: successor.id,
      type: "FINISH_TO_START",
      lagWorkdays: 0,
      hard: true,
      reason,
      sourceIds: [sourceId],
    };
  };

  const presentRecognizedPhases = PHASE_ORDER.filter((phase) =>
    itemsByPhase.has(phase),
  );
  for (let i = 0; i < presentRecognizedPhases.length - 1; i += 1) {
    const currentPhase = presentRecognizedPhases[i];
    const nextPhase = presentRecognizedPhases[i + 1];
    if (currentPhase === undefined || nextPhase === undefined) continue;
    const predecessors = itemsByPhase.get(currentPhase);
    const successors = itemsByPhase.get(nextPhase);
    if (!predecessors || !successors) continue;
    for (const predecessor of predecessors) {
      for (const successor of successors) {
        addDependency(
          predecessor,
          successor,
          `${currentPhase} precedes ${nextPhase} (Genesis recognized phase order)`,
        );
      }
    }
  }

  // Guarded conservative inference (Task 8 pilot smoke correction, Part 2a): a remodel/
  // renovation/addition project that includes Demolition routinely also has scope named by ROOM
  // rather than trade ("Kitchen", "Primary bath") or otherwise outside the recognized PHASE_ORDER
  // taxonomy ("Envelope") -- the loop above never touches those, by design, since it never invents
  // a relationship unless BOTH phases are recognized. In practice, interior/envelope/finish work
  // never genuinely precedes demolition in this project shape, so one conservative edge FROM every
  // Demolition-phase item TO every such unrecognized-phase item is a safe, narrow inference --
  // never among the unrecognized items themselves (that would still be inventing an ordering this
  // code has no basis for), and never onto a target that already carries its own explicit
  // committed date of either kind (an explicit PM commitment is always authoritative and is never
  // silently reinterpreted or overridden by an inferred relationship -- it is simply left alone).
  // Not applied to RESIDENTIAL_NEW_BUILD or any project type outside
  // DEMOLITION_INFERENCE_PROJECT_TYPES, and not applied when no Demolition-phase item is present
  // at all -- neither case has any real basis for this inference.
  if (
    DEMOLITION_INFERENCE_PROJECT_TYPES.has(proposal.projectType) &&
    itemsByPhase.has("Demolition")
  ) {
    const demolitionItems = itemsByPhase.get("Demolition") ?? [];
    const committedSubjectIds = new Set(
      proposal.knownDates
        .filter(
          (known) =>
            known.kind === "COMMITTED_START" ||
            known.kind === "COMMITTED_FINISH",
        )
        .map((known) => known.subjectId),
    );
    for (const item of proposal.baselineScope) {
      if (PHASE_ORDER.includes(item.phase)) continue;
      if (committedSubjectIds.has(item.id)) continue;
      for (const predecessor of demolitionItems) {
        addDependency(
          predecessor,
          item,
          `Demolition precedes ${item.label} (Genesis conservative inference -- ${item.phase} is not a recognized sequencing phase)`,
        );
      }
    }
  }

  const profile: ProjectProfileV096 = {
    baselineScope: proposal.baselineScope.map((item) => ({
      id: item.id,
      label: item.label,
      phase: item.phase,
    })),
    genesisSourceId: sourceId,
    genesisApprovedAt: approvedAt,
    ...(proposal.clientName !== undefined
      ? { clientName: proposal.clientName }
      : {}),
    ...(proposal.address !== undefined ? { address: proposal.address } : {}),
    ...(proposal.budget !== undefined
      ? {
          budget: {
            currency: proposal.budget.currency,
            ...(proposal.budget.baseline !== undefined
              ? { baseline: proposal.budget.baseline }
              : {}),
            ...(proposal.budget.spent !== undefined
              ? { spent: proposal.budget.spent }
              : {}),
          },
        }
      : {}),
  };

  const model: ProjectModelV094 = {
    projectId: proposal.projectId,
    revision: 0,
    name: proposal.projectName,
    projectType: proposal.projectType,
    timezone: proposal.timezone,
    forecastAnchorDate: proposal.forecastAnchorDate,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: { [sourceId]: source },
    activities,
    constraints: {},
    dependencies,
    eventLedger: [],
    projectProfile: profile,
  };

  // Defense-in-depth, not a substitute for the proposal-level checks above: a final invariant
  // check so this function can never return canonical state validateProjectModel itself would
  // reject.
  validateProjectModel(model);
  return model;
}
