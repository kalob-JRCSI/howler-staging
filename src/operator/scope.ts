// Phase 3 (Howler Recovery Directive, Functional Project Scope Workspace): Scope answers WHAT
// are we building; Schedule (src/operator/schedule.ts) answers WHEN. This file follows that exact
// same pattern -- a pure translation layer over the canonical event-sourced kernel, no new
// persistence path, no second source of truth:
//
//   buildScopeView:   ProjectModelV094 -> the full scope read model the Scope module renders,
//                      merging the frozen projectProfile.baselineScope with the mutable
//                      model.scopeItems map (baseline vs current), plus a small set of factual,
//                      non-fabricated observations Howler can reason over.
//   buildScopeEvent:  a typed ScopeCommandV096 -> a well-formed ProjectEventV094, using the exact
//                      same UPSERT_SCOPE_ITEM/DEACTIVATE_SCOPE_ITEM mutations Schedule's own
//                      UPSERT_ACTIVITY/DEACTIVATE_DEPENDENCY pattern already established.
//
// Baseline vs current: projectProfile.baselineScope is never mutated by anything in this file --
// it stays exactly as Genesis (or an import) produced it, forever. model.scopeItems is the live,
// mutable current scope. A scope item whose id also appears in baselineScope descended from that
// baseline entry (and is shown alongside it for comparison); one that doesn't was added after
// baseline. Until a baseline item is first edited, it is never copied into model.scopeItems at
// all -- the view synthesizes its "current == baseline" row on read, and the first command that
// touches it is what actually materializes it into scopeItems (see resolveScopeItem below).

import type {
  ActivityV094,
  ISODateTime,
  MoneyV097,
  ProjectEventV094,
  ProjectFinancialsV097,
  ProjectModelV094,
  ScopeAllowanceV096,
  ScopeItemV096,
  ScopeStatusV096,
  SourceV094,
} from "../domain/types";
import { computeBudgetLineActualTotal } from "./budget";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface ScopeActivityRefV096 {
  activityId: string;
  activityName: string;
  activityState: string;
}

// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Task 8 cross-module sync): the
// real, canonical replacement for Phase 3's standalone ScopeAllowanceV096 figure, once a scope
// item is linked to a real budget line (ScopeItemV096.allowanceBudgetLineId). Reuses Budget's own
// computeBudgetLineActualTotal so this can never independently drift from what Budget itself
// reports for the same line. `variance` is null only when the linked line has no baselineAmount
// yet (Unknown, never fabricated as $0) -- exactly the "$1,000 allowance vs $1,175 selected cost
// gives -$175 variance" example the directive requires.
export interface ScopeLinkedBudgetLineV096 {
  budgetLineId: string;
  description: string;
  allowanceAmount: MoneyV097 | null;
  actualTotal: MoneyV097;
  variance: MoneyV097 | null;
}

export interface ScopeItemViewV096 {
  id: string;
  description: string;
  phase: string;
  status: ScopeStatusV096;
  included: boolean;
  trade: string | null;
  allowance: ScopeAllowanceV096 | null;
  linkedBudgetLine: ScopeLinkedBudgetLineV096 | null;
  responsibleVendor: string | null;
  activities: ScopeActivityRefV096[];
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  // Baseline comparison -- both fields are honest even for a project with no Genesis baseline at
  // all (baselineDescription/baselinePhase are simply null; addedAfterBaseline is true).
  addedAfterBaseline: boolean;
  baselineDescription: string | null;
  baselinePhase: string | null;
}

export type ScopeInsightKindV096 =
  | "NO_SCHEDULE_ACTIVITY"
  | "ADDED_AFTER_BASELINE"
  | "COMPLETE_BUT_ACTIVITY_INCOMPLETE"
  | "UNSCOPED_ACTIVITY";

export interface ScopeInsightV096 {
  kind: ScopeInsightKindV096;
  scopeItemId: string | null;
  activityId: string | null;
  message: string;
}

export interface ProjectScopeV096 {
  projectId: string;
  projectRevision: number;
  items: ScopeItemViewV096[];
  insights: ScopeInsightV096[];
  // Every real schedule activity in the project, regardless of whether any scope item currently
  // references it -- lets the PM associate a scope item with an activity that has no scope item
  // yet (the most common real case), not just re-select ones already scoped elsewhere.
  allActivities: ScopeActivityRefV096[];
}

/**
 * A same-id activity is the exact convention buildProjectFromGenesis (src/operator/genesis.ts)
 * already uses -- every Genesis-created activity's id literally IS its originating scope item's
 * id. Reusing that convention here gives every Genesis-created project a real, honest default
 * schedule association for free, never a guess: it only ever fires when that exact activity
 * really exists.
 */
function defaultActivityIds(
  model: ProjectModelV094,
  scopeItemId: string,
): string[] {
  return model.activities[scopeItemId] ? [scopeItemId] : [];
}

function activityRef(
  model: ProjectModelV094,
  activityId: string,
): ScopeActivityRefV096 {
  const activity: ActivityV094 | undefined = model.activities[activityId];
  return {
    activityId,
    activityName: activity?.name ?? activityId,
    activityState: activity?.state ?? "UNKNOWN",
  };
}

function linkedBudgetLineFor(
  fin: ProjectFinancialsV097 | undefined,
  allowanceBudgetLineId: string | undefined,
): ScopeLinkedBudgetLineV096 | null {
  if (!fin || !allowanceBudgetLineId) return null;
  const line = fin.budgetLines[allowanceBudgetLineId];
  if (!line) return null;
  const allowanceAmount = line.baselineAmount ?? null;
  const actualTotal = computeBudgetLineActualTotal(fin, line.id);
  return {
    budgetLineId: line.id,
    description: line.description,
    allowanceAmount,
    actualTotal,
    variance: allowanceAmount
      ? {
          amountMinor: allowanceAmount.amountMinor - actualTotal.amountMinor,
          currency: allowanceAmount.currency,
        }
      : null,
  };
}

function viewRowFromScopeItem(
  model: ProjectModelV094,
  item: ScopeItemV096,
  baselineById: Map<string, { description: string; phase: string }>,
): ScopeItemViewV096 {
  const baseline = baselineById.get(item.id) ?? null;
  return {
    id: item.id,
    description: item.description,
    phase: item.phase,
    status: item.status,
    included: item.included,
    trade: item.trade ?? null,
    allowance: item.allowance ?? null,
    linkedBudgetLine: linkedBudgetLineFor(
      model.financials,
      item.allowanceBudgetLineId,
    ),
    responsibleVendor: item.responsibleVendor ?? null,
    activities: item.activityIds.map((id) => activityRef(model, id)),
    notes: item.notes ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    addedAfterBaseline: baseline === null,
    baselineDescription: baseline?.description ?? null,
    baselinePhase: baseline?.phase ?? null,
  };
}

/**
 * Pure, cheap, deterministic derivation of the full Scope workspace. Performs no D1 access and
 * mutates nothing. A baseline item never yet edited is synthesized as a transient "current ==
 * baseline" row (state NOT_STARTED, included, no allowance/vendor/notes -- Genesis records none
 * of those) -- it is never written back anywhere by this function.
 */
export function buildScopeView(model: ProjectModelV094): ProjectScopeV096 {
  const baselineEntries = model.projectProfile?.baselineScope ?? [];
  const baselineById = new Map(
    baselineEntries.map((b) => [
      b.id,
      { description: b.label, phase: b.phase },
    ]),
  );

  const rows: ScopeItemViewV096[] = [];
  const materializedIds = new Set(Object.keys(model.scopeItems ?? {}));

  for (const item of Object.values(model.scopeItems ?? {})) {
    if (!item.active) continue;
    rows.push(viewRowFromScopeItem(model, item, baselineById));
  }

  for (const baseline of baselineEntries) {
    if (materializedIds.has(baseline.id)) continue;
    const transient: ScopeItemV096 = {
      id: baseline.id,
      description: baseline.label,
      phase: baseline.phase,
      active: true,
      status: "NOT_STARTED",
      included: true,
      activityIds: defaultActivityIds(model, baseline.id),
      planDocumentRefs: [],
      sourceIds: [],
      createdAt:
        model.projectProfile?.genesisApprovedAt ?? model.forecastAnchorDate,
      updatedAt:
        model.projectProfile?.genesisApprovedAt ?? model.forecastAnchorDate,
    };
    rows.push(viewRowFromScopeItem(model, transient, baselineById));
  }

  rows.sort(
    (a, b) =>
      a.phase.localeCompare(b.phase) ||
      a.description.localeCompare(b.description),
  );

  return {
    projectId: model.projectId,
    projectRevision: model.revision,
    items: rows,
    insights: buildScopeInsights(model, rows),
    allActivities: Object.keys(model.activities)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => activityRef(model, id)),
  };
}

function buildScopeInsights(
  model: ProjectModelV094,
  rows: ScopeItemViewV096[],
): ScopeInsightV096[] {
  const insights: ScopeInsightV096[] = [];
  const referencedActivityIds = new Set<string>();

  for (const row of rows) {
    for (const activity of row.activities)
      referencedActivityIds.add(activity.activityId);

    if (row.included && row.activities.length === 0) {
      insights.push({
        kind: "NO_SCHEDULE_ACTIVITY",
        scopeItemId: row.id,
        activityId: null,
        message: `"${row.description}" has no related schedule activity.`,
      });
    }
    if (row.addedAfterBaseline) {
      insights.push({
        kind: "ADDED_AFTER_BASELINE",
        scopeItemId: row.id,
        activityId: null,
        message: `"${row.description}" was added after baseline and may need a change order.`,
      });
    }
    if (row.status === "COMPLETE") {
      const incomplete = row.activities.find(
        (a) => a.activityState !== "COMPLETE" && a.activityState !== "UNKNOWN",
      );
      if (incomplete) {
        insights.push({
          kind: "COMPLETE_BUT_ACTIVITY_INCOMPLETE",
          scopeItemId: row.id,
          activityId: incomplete.activityId,
          message: `"${row.description}" is marked complete, but "${incomplete.activityName}" is not.`,
        });
      }
    }
  }

  for (const activity of Object.values(model.activities)) {
    if (!referencedActivityIds.has(activity.id)) {
      insights.push({
        kind: "UNSCOPED_ACTIVITY",
        scopeItemId: null,
        activityId: activity.id,
        message: `"${activity.name}" has no corresponding scope item.`,
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type ScopeCommandV096 =
  | {
      kind: "ADD_SCOPE_ITEM";
      description: string;
      phase: string;
      trade?: string;
      included?: boolean;
      responsibleVendor?: string;
      notes?: string;
    }
  | { kind: "SET_DESCRIPTION"; scopeItemId: string; description: string }
  | { kind: "SET_PHASE"; scopeItemId: string; phase: string }
  | { kind: "SET_TRADE"; scopeItemId: string; trade: string }
  | { kind: "SET_INCLUDED"; scopeItemId: string; included: boolean }
  | {
      kind: "SET_ALLOWANCE";
      scopeItemId: string;
      allowance: ScopeAllowanceV096 | null;
    }
  | { kind: "SET_RESPONSIBLE_VENDOR"; scopeItemId: string; vendor: string }
  | { kind: "SET_STATUS"; scopeItemId: string; status: ScopeStatusV096 }
  | { kind: "SET_NOTES"; scopeItemId: string; notes: string }
  | {
      kind: "ASSOCIATE_ACTIVITIES";
      scopeItemId: string;
      activityIds: string[];
    }
  // Phase 4 (Task 8 cross-module sync): the one-allowance-owner link to a real Budget line
  // (ScopeItemV096.allowanceBudgetLineId). `budgetLineId: null` unlinks it -- the legacy
  // standalone `allowance` field above is untouched either way.
  | {
      kind: "SET_ALLOWANCE_BUDGET_LINE";
      scopeItemId: string;
      budgetLineId: string | null;
    }
  | { kind: "DEACTIVATE_SCOPE_ITEM"; scopeItemId: string };

/**
 * Commands whose consequence is limited to this one scope item's own text/metadata -- safe for
 * the UI to apply without an interactive preview step (per the recovery directive: "do not
 * overburden minor text corrections with unnecessary ceremony"). Every other command still shows
 * the full preview -> consequence -> confirm flow, since it can plausibly affect budget,
 * schedule, trades, or client approvals. Every command -- clerical or not -- still goes through
 * the exact same event/apply-shadow pipeline; this only controls whether the *UI* pauses for
 * confirmation.
 */
export const CLERICAL_SCOPE_COMMAND_KINDS = new Set([
  "SET_DESCRIPTION",
  "SET_PHASE",
  "SET_TRADE",
  "SET_RESPONSIBLE_VENDOR",
  "SET_NOTES",
]);

export class ScopeCommandError extends Error {}

/**
 * Resolves the current, mutable ScopeItemV096 a command targets -- materializing it from
 * baselineScope on first touch (including the free default schedule association) if it has never
 * been edited before. This is the one place "baseline vs current" actually forks: everything
 * after this point operates on a real, independent current-scope record.
 */
function resolveScopeItem(
  model: ProjectModelV094,
  scopeItemId: string,
  now: ISODateTime,
): ScopeItemV096 {
  const existing = model.scopeItems?.[scopeItemId];
  if (existing) return existing;
  const baseline = model.projectProfile?.baselineScope.find(
    (b) => b.id === scopeItemId,
  );
  if (!baseline) {
    throw new ScopeCommandError(`Unknown scope item: ${scopeItemId}`);
  }
  return {
    id: baseline.id,
    description: baseline.label,
    phase: baseline.phase,
    active: true,
    status: "NOT_STARTED",
    included: true,
    activityIds: defaultActivityIds(model, baseline.id),
    planDocumentRefs: [],
    sourceIds: [],
    createdAt: model.projectProfile?.genesisApprovedAt ?? now,
    updatedAt: now,
  };
}

interface BuiltScopeEvent {
  event: ProjectEventV094;
  historyNote: string;
  /** Mirrors buildScheduleEvent's own CLERICAL_SCOPE_COMMAND_KINDS-driven UI hint. */
  clerical: boolean;
}

export function buildScopeEvent(
  model: ProjectModelV094,
  command: ScopeCommandV096,
  now: ISODateTime,
  newId: () => string,
): BuiltScopeEvent {
  const sourceId = newId();
  const effectiveDate = now.slice(0, 10);
  const clerical = CLERICAL_SCOPE_COMMAND_KINDS.has(command.kind);

  function source(label: string): SourceV094 {
    return {
      id: sourceId,
      type: "PM_SCOPE_EDIT",
      label,
      observedAt: now,
      effectiveDate,
      authority: 1,
      reliability: 1,
    };
  }

  function finish(
    type: string,
    historyNote: string,
    scopeItem: ScopeItemV096,
    extraMutations: ProjectEventV094["mutations"] = [],
  ): BuiltScopeEvent {
    return {
      historyNote,
      clerical,
      event: {
        id: newId(),
        baseRevision: model.revision,
        projectId: model.projectId,
        type,
        occurredAt: now,
        receivedAt: now,
        sourceIds: [sourceId],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: scopeItem.activityIds,
        mutations: [
          { op: "UPSERT_SOURCE", source: source(historyNote) },
          { op: "UPSERT_SCOPE_ITEM", scopeItem },
          ...extraMutations,
        ],
        payload: { scopeCommand: command },
        note: historyNote,
      },
    };
  }

  if (command.kind === "ADD_SCOPE_ITEM") {
    if (!command.description.trim()) {
      throw new ScopeCommandError("Scope item description is required");
    }
    const id = newId();
    const scopeItem: ScopeItemV096 = {
      id,
      description: command.description.trim(),
      phase: command.phase,
      active: true,
      status: "NOT_STARTED",
      included: command.included ?? true,
      activityIds: defaultActivityIds(model, id),
      planDocumentRefs: [],
      sourceIds: [sourceId],
      createdAt: now,
      updatedAt: now,
      ...(command.trade ? { trade: command.trade } : {}),
      ...(command.responsibleVendor
        ? { responsibleVendor: command.responsibleVendor }
        : {}),
      ...(command.notes ? { notes: command.notes } : {}),
    };
    return finish(
      "SCOPE_ITEM_ADDED",
      `Added scope: "${scopeItem.description}".`,
      scopeItem,
    );
  }

  if (command.kind === "DEACTIVATE_SCOPE_ITEM") {
    const current = resolveScopeItem(model, command.scopeItemId, now);
    return finish(
      "SCOPE_ITEM_DEACTIVATED",
      `Removed scope: "${current.description}".`,
      { ...current, active: false, updatedAt: now, sourceIds: [sourceId] },
      [{ op: "DEACTIVATE_SCOPE_ITEM", scopeItemId: current.id }],
    );
  }

  const current = resolveScopeItem(model, command.scopeItemId, now);
  const updated: ScopeItemV096 = {
    ...current,
    updatedAt: now,
    sourceIds: [sourceId],
  };

  switch (command.kind) {
    case "SET_DESCRIPTION": {
      if (!command.description.trim()) {
        throw new ScopeCommandError("Scope item description is required");
      }
      const from = current.description;
      updated.description = command.description.trim();
      return finish(
        "SCOPE_DESCRIPTION_CHANGED",
        `Scope "${from}" renamed to "${updated.description}".`,
        updated,
      );
    }
    case "SET_PHASE": {
      updated.phase = command.phase;
      return finish(
        "SCOPE_PHASE_CHANGED",
        `"${current.description}" moved from phase "${current.phase}" to "${command.phase}".`,
        updated,
      );
    }
    case "SET_TRADE": {
      updated.trade = command.trade;
      return finish(
        "SCOPE_TRADE_CHANGED",
        `"${current.description}" reclassified to ${command.trade}.`,
        updated,
      );
    }
    case "SET_INCLUDED": {
      updated.included = command.included;
      return finish(
        "SCOPE_INCLUDED_CHANGED",
        `"${current.description}" ${command.included ? "included" : "excluded"}.`,
        updated,
      );
    }
    case "SET_ALLOWANCE": {
      if (command.allowance) {
        if (
          !Number.isFinite(command.allowance.amount) ||
          command.allowance.amount < 0
        ) {
          throw new ScopeCommandError(
            "Allowance amount must be a non-negative finite number",
          );
        }
        updated.allowance = command.allowance;
      } else {
        delete updated.allowance;
      }
      return finish(
        "SCOPE_ALLOWANCE_CHANGED",
        command.allowance
          ? `Allowance for "${current.description}" set to ${String(command.allowance.amount)} ${command.allowance.currency}.`
          : `Allowance cleared for "${current.description}".`,
        updated,
      );
    }
    case "SET_RESPONSIBLE_VENDOR": {
      updated.responsibleVendor = command.vendor;
      return finish(
        "SCOPE_VENDOR_CHANGED",
        `"${current.description}" assigned to ${command.vendor}.`,
        updated,
      );
    }
    case "SET_STATUS": {
      updated.status = command.status;
      return finish(
        "SCOPE_STATUS_CHANGED",
        `"${current.description}" status changed from ${current.status} to ${command.status}.`,
        updated,
      );
    }
    case "SET_NOTES": {
      updated.notes = command.notes;
      return finish(
        "SCOPE_NOTES_CHANGED",
        `Notes updated for "${current.description}".`,
        updated,
      );
    }
    case "ASSOCIATE_ACTIVITIES": {
      for (const activityId of command.activityIds) {
        if (!model.activities[activityId]) {
          throw new ScopeCommandError(`Unknown activity: ${activityId}`);
        }
      }
      updated.activityIds = [...new Set(command.activityIds)];
      const names = updated.activityIds
        .map((id) => model.activities[id]?.name ?? id)
        .join(", ");
      return finish(
        "SCOPE_ACTIVITIES_ASSOCIATED",
        `"${current.description}" associated with: ${names || "no activities"}.`,
        updated,
      );
    }
    case "SET_ALLOWANCE_BUDGET_LINE": {
      if (command.budgetLineId) {
        const line = model.financials?.budgetLines[command.budgetLineId];
        if (!line) {
          throw new ScopeCommandError(
            `Unknown budget line: ${command.budgetLineId}`,
          );
        }
        updated.allowanceBudgetLineId = command.budgetLineId;
        return finish(
          "SCOPE_ALLOWANCE_BUDGET_LINE_LINKED",
          `"${current.description}" allowance linked to budget line "${line.description}".`,
          updated,
        );
      }
      delete updated.allowanceBudgetLineId;
      return finish(
        "SCOPE_ALLOWANCE_BUDGET_LINE_UNLINKED",
        `"${current.description}" allowance unlinked from its budget line.`,
        updated,
      );
    }
    default: {
      const exhaustive: never = command;
      throw new ScopeCommandError(
        `Unhandled scope command: ${(exhaustive as { kind?: string }).kind ?? "unknown"}`,
      );
    }
  }
}
