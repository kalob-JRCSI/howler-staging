// Project Genesis (v0.9.6 Contractor Hub,
// docs/superpowers/specs/2026-09-04-howler-contractor-hub-v096-design.md): converts a
// user-reviewed intake proposal into a canonical ProjectModelV094 at revision 0. Pure -- no D1, no
// network, no HTTP. Genesis is the only new synthesis path; the existing deterministic
// project/event/forecast kernel remains authoritative once a project exists (see
// buildProjectFromGenesis below, which returns a project the existing
// D1HowlerRepository.createProject/forecastInitial pipeline can persist unchanged).

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
// dependencies between adjacent recognized phases that are both actually present in the approved
// baseline scope. Never used to invent a relationship between unrecognized phase labels.
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

function isValidIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
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
  }

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
    }
    if (!isNonEmptyString(known.label)) {
      errors.push(`knownDates entry for ${known.subjectId} is missing a label`);
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

  // Only connect adjacent recognized phases that are both actually present -- never invent a
  // dependency relationship among unrecognized/unmatched phase labels.
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
  for (let i = 0; i < PHASE_ORDER.length - 1; i += 1) {
    const currentPhase = PHASE_ORDER[i];
    const nextPhase = PHASE_ORDER[i + 1];
    if (currentPhase === undefined || nextPhase === undefined) continue;
    const predecessors = itemsByPhase.get(currentPhase);
    const successors = itemsByPhase.get(nextPhase);
    if (!predecessors || !successors) continue;
    for (const predecessor of predecessors) {
      for (const successor of successors) {
        const dependencyId = `dep-genesis-${predecessor.id}-${successor.id}`;
        dependencies[dependencyId] = {
          id: dependencyId,
          active: true,
          predecessorId: predecessor.id,
          successorId: successor.id,
          type: "FINISH_TO_START",
          lagWorkdays: 0,
          hard: false,
          reason: `${currentPhase} precedes ${nextPhase} (Genesis recognized phase order)`,
          sourceIds: [sourceId],
        };
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

  return {
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
}
