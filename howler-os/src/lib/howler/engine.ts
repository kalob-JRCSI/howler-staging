import { countyCriteria } from "./ky-code";
import {
  conventionalFramingPatch,
  DATUM_LABEL,
  describeEnvelope,
  formatFtIn,
  PROVENANCE_LABEL,
  typicalGarageLayoutPatch,
  unresolvedRegister,
} from "./layout";
import { formatMoney, type Money, zero } from "./money";
import { TRADEWALK, tradewalkBlueprint } from "./tradewalk";
import { evidenceNote, recognizeEvidence, shouldAdoptDeboardTradewalk } from "./commands";
import { nextCall } from "./derive";
import { ensureJob } from "./job";
import { activityForTrade, scopeAddRipple, tradeFromText } from "./ripple";
import type {
  Activity,
  Blueprint,
  BlueprintRoom,
  BudgetLine,
  ChangeOrder,
  CoStatus,
  CommandPreview,
  Contact,
  DimDatum,
  DimProvenance,
  DrawingIssueStatus,
  EvidenceKind,
  HealthBand,
  HistoryEvent,
  InspectionStatus,
  Opening,
  PermitStatus,
  Project,
  ScopeItem,
  SelectionItem,
  SelectionStatus,
} from "./types";
import { emptyBlueprint, ensureBlueprint, OCCUPANCY_LABEL } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function record(
  project: Project,
  type: string,
  note: string,
  clerical: boolean,
  mutate: (draft: Project) => void,
  recordId?: string,
): Project {
  const draft: Project = structuredClone(project);
  mutate(draft);
  draft.revision += 1;
  const event: HistoryEvent = {
    id: nextId("evt"),
    revision: draft.revision,
    type,
    occurredAt: nowIso(),
    note,
    clerical,
    ...(recordId ? { recordId } : {}),
  };
  draft.events = [event, ...draft.events];
  return draft;
}

function requireFinancials(project: Project) {
  if (!project.financials) {
    throw new Error("Project financials are not initialized.");
  }
  return project.financials;
}

export function previewInitialize(currency: string): CommandPreview {
  return {
    understood: `Initialize project financials in ${currency}.`,
    changes: ["Budget workspace", "Default construction categories"],
    consequences: [
      "Creates canonical financials. Missing amounts stay Unknown, not $0.",
      "Default categories are optional starters the PM can edit.",
    ],
    nextAction: "Confirm to open Budget and Change Orders on this project.",
    clerical: false,
    eventType: "PROJECT_FINANCIALS_INITIALIZED",
    apply: (project) =>
      record(project, "PROJECT_FINANCIALS_INITIALIZED", `Financials initialized in ${currency}.`, false, (draft) => {
        const names = [
          "General Conditions",
          "Sitework",
          "Concrete",
          "Masonry",
          "Framing",
          "Roofing",
          "Windows / Doors",
          "Electrical",
          "Plumbing",
          "HVAC",
          "Insulation",
          "Drywall",
          "Interior Finishes",
          "Cabinetry",
        ];
        draft.financials = {
          currency,
          baseline: null,
          categories: Object.fromEntries(
            names.map((name, index) => {
              const id = `cat-${index + 1}`;
              return [
                id,
                {
                  id,
                  name,
                  isDefault: true,
                  active: true,
                  sortOrder: index + 1,
                  notes: null,
                },
              ];
            }),
          ),
          lines: {},
          commitments: {},
          actualCosts: {},
          changeOrders: {},
        };
      }),
  };
}

export function previewSetBaseline(amount: Money): CommandPreview {
  return {
    understood: `Set original budget to ${formatMoney(amount)}.`,
    changes: ["Original Budget", "Revised Budget", "Overview"],
    consequences: [
      "Original Budget becomes this amount.",
      "Revised Budget = original + approved Change Orders only.",
      "Pending Change Orders stay out of Revised Budget.",
    ],
    nextAction: "Confirm this original budget figure.",
    clerical: false,
    eventType: "SET_PROJECT_FINANCIAL_BASELINE",
    apply: (project) =>
      record(
        project,
        "SET_PROJECT_FINANCIAL_BASELINE",
        `Original budget set to ${formatMoney(amount)}.`,
        false,
        (draft) => {
          const fin = requireFinancials(draft);
          fin.baseline = amount;
        },
      ),
  };
}

export function previewAddLine(input: {
  categoryId: string;
  description: string;
  baselineAmount: Money | null;
  isAllowance: boolean;
  trade?: string;
  costCode?: string;
  scopeItemIds?: string[];
  notes?: string;
}): CommandPreview {
  return {
    understood: `Add budget line "${input.description}"${input.baselineAmount ? ` at ${formatMoney(input.baselineAmount)}` : " with unknown amount"}.`,
    changes: ["Budget lines", input.scopeItemIds?.length ? "Scope association" : "Unassociated line"],
    consequences: [
      input.baselineAmount
        ? "Line baseline is recorded. Revised amount follows approved COs allocated to this line."
        : "Amount stays Unknown until a baseline is entered. Unknown is not $0.",
      input.isAllowance ? "Tracked as an allowance. Overrun will not auto-create a Change Order." : "Regular budget line.",
    ],
    nextAction: input.baselineAmount ? "Confirm the new line." : "Save the line, then add a baseline when known.",
    clerical: !input.baselineAmount,
    eventType: "BUDGET_LINE_ADDED",
    apply: (project) =>
      record(project, "BUDGET_LINE_ADDED", `Added budget line "${input.description}".`, !input.baselineAmount, (draft) => {
        const fin = requireFinancials(draft);
        const id = nextId("line");
        const line: BudgetLine = {
          id,
          categoryId: input.categoryId,
          description: input.description,
          costCode: input.costCode ?? null,
          trade: input.trade ?? null,
          baselineAmount: input.baselineAmount,
          isAllowance: input.isAllowance,
          vendorRef: null,
          activityId: null,
          scopeItemIds: input.scopeItemIds ?? [],
          notes: input.notes ?? null,
          active: true,
        };
        fin.lines[id] = line;
      }),
  };
}

export function previewPatchLine(
  lineId: string,
  patch: Partial<Pick<BudgetLine, "description" | "notes" | "trade" | "costCode" | "vendorRef" | "activityId" | "categoryId" | "isAllowance" | "baselineAmount" | "scopeItemIds" | "active">>,
): CommandPreview {
  const consequential = patch.baselineAmount !== undefined || patch.active === false || patch.isAllowance !== undefined;
  return {
    understood: consequential
      ? `Update budget line ${lineId} (consequential fields).`
      : `Clerical update to budget line ${lineId}.`,
    changes: ["Budget line", ...(patch.scopeItemIds ? ["Scope association"] : [])],
    consequences: consequential
      ? ["Derived totals and findings will recompute from the new facts."]
      : ["History will record the clerical edit. Totals are unchanged."],
    nextAction: consequential ? "Confirm the change." : "Save the clerical edit.",
    clerical: !consequential,
    eventType: "BUDGET_LINE_UPDATED",
    apply: (project) =>
      record(project, "BUDGET_LINE_UPDATED", `Updated budget line ${lineId}.`, !consequential, (draft) => {
        const line = requireFinancials(draft).lines[lineId];
        if (!line) throw new Error("Unknown budget line.");
        Object.assign(line, patch);
      }, lineId),
  };
}

export function previewAddCommitment(input: {
  amount: Money;
  vendorRef: string;
  budgetLineId: string;
  reference?: string;
  notes?: string;
}): CommandPreview {
  return {
    understood: `Add ${formatMoney(input.amount)} commitment${input.vendorRef ? ` to ${input.vendorRef}` : ""}.`,
    changes: ["Commitments", "Budget line committed total", "Overview remaining/uncommitted"],
    consequences: [
      "Committed total increases by this amount.",
      "Actual recorded is unchanged. Commitment is not spend.",
      "If this exceeds the line's revised budget, Howler will flag it.",
    ],
    nextAction: "Confirm the commitment.",
    clerical: false,
    eventType: "COMMITMENT_ADDED",
    apply: (project) =>
      record(
        project,
        "COMMITMENT_ADDED",
        `Added commitment of ${formatMoney(input.amount)}${input.vendorRef ? ` (${input.vendorRef})` : ""}.`,
        false,
        (draft) => {
          const fin = requireFinancials(draft);
          const id = nextId("cmt");
          fin.commitments[id] = {
            id,
            amount: input.amount,
            allocations: [{ budgetLineId: input.budgetLineId, amount: input.amount }],
            vendorRef: input.vendorRef || null,
            activityId: null,
            scopeItemIds: [],
            reference: input.reference ?? null,
            status: "ACTIVE",
            notes: input.notes ?? null,
          };
        },
      ),
  };
}

export function previewAddActual(input: {
  amount: Money;
  date: string;
  description: string;
  budgetLineId: string;
  notes?: string;
}): CommandPreview {
  return {
    understood: `Record actual cost ${formatMoney(input.amount)} for "${input.description}".`,
    changes: ["Actual recorded", "Budget line actual total", "Overview"],
    consequences: [
      "This is recorded cost, not a payment and not a commitment.",
      "Allowance overruns are flagged. No Change Order is invented.",
    ],
    nextAction: "Confirm the actual cost.",
    clerical: false,
    eventType: "ACTUAL_COST_RECORDED",
    apply: (project) =>
      record(
        project,
        "ACTUAL_COST_RECORDED",
        `Recorded ${formatMoney(input.amount)} actual for "${input.description}".`,
        false,
        (draft) => {
          const fin = requireFinancials(draft);
          const id = nextId("act");
          fin.actualCosts[id] = {
            id,
            amount: input.amount,
            date: input.date,
            description: input.description,
            budgetLineId: input.budgetLineId,
            commitmentId: null,
            reference: null,
            status: "RECORDED",
            notes: input.notes ?? null,
          };
        },
      ),
  };
}

export function previewAddCategory(name: string): CommandPreview {
  return {
    understood: `Add budget category "${name}".`,
    changes: ["Budget categories"],
    consequences: ["Category is available for new lines. Existing lines are unchanged."],
    nextAction: "Save the category.",
    clerical: true,
    eventType: "BUDGET_CATEGORY_ADDED",
    apply: (project) =>
      record(project, "BUDGET_CATEGORY_ADDED", `Added category "${name}".`, true, (draft) => {
        const fin = requireFinancials(draft);
        const id = nextId("cat");
        fin.categories[id] = {
          id,
          name,
          isDefault: false,
          active: true,
          sortOrder: Object.keys(fin.categories).length + 1,
          notes: null,
        };
      }),
  };
}

export function previewCreateChangeOrder(input: {
  title: string;
  description: string;
  reason: string;
  cost: Money;
  declaredScheduleDays: number | null;
  scopeItemIds: string[];
  activityIds: string[];
  budgetLineId?: string | null;
  notes?: string;
}): CommandPreview {
  return {
    understood: `Create DRAFT change order "${input.title}"${input.cost.amountMinor ? ` at ${formatMoney(input.cost)}` : " unpriced"}.`,
    changes: ["Change Orders", "Pending CO exposure (after propose)", "Scope associations"],
    consequences: [
      "Starts as DRAFT. Approved budget does not change.",
      input.declaredScheduleDays
        ? `Declared schedule impact +${input.declaredScheduleDays} days is recorded as a claim. Schedule activities are not rewritten.`
        : "No declared schedule impact.",
    ],
    nextAction: "Confirm the draft, then propose it when ready.",
    clerical: false,
    eventType: "CHANGE_ORDER_CREATED",
    apply: (project) => {
      const id = nextId("co");
      return record(
        project,
        "CHANGE_ORDER_CREATED",
        `Created DRAFT change order "${input.title}".`,
        false,
        (draft) => {
          const fin = requireFinancials(draft);
          const count = Object.keys(fin.changeOrders).length + 1;
          const allocations = input.budgetLineId
            ? [{ budgetLineId: input.budgetLineId, amount: input.cost }]
            : [];
          fin.changeOrders[id] = {
            id,
            number: `CO-${String(count).padStart(3, "0")}`,
            title: input.title,
            description: input.description,
            reason: input.reason,
            status: "DRAFT",
            cost: input.cost,
            allocations,
            declaredScheduleDays: input.declaredScheduleDays,
            scopeItemIds: input.scopeItemIds,
            activityIds: input.activityIds,
            categoryId: null,
            clientApproval: null,
            requestedAt: nowIso(),
            proposedAt: null,
            approvedAt: null,
            rejectedAt: null,
            notes: input.notes ?? null,
          };
        },
        id,
      );
    },
  };
}

const LIFECYCLE: Record<string, { next: CoStatus; type: string; label: string }> = {
  PROPOSE: { next: "PROPOSED", type: "CHANGE_ORDER_PROPOSED", label: "Propose" },
  SUBMIT_FOR_APPROVAL: {
    next: "PENDING_APPROVAL",
    type: "CHANGE_ORDER_SUBMITTED",
    label: "Submit for approval",
  },
  APPROVE: { next: "APPROVED", type: "CHANGE_ORDER_APPROVED", label: "Approve" },
  REJECT: { next: "REJECTED", type: "CHANGE_ORDER_REJECTED", label: "Reject" },
  VOID: { next: "VOID", type: "CHANGE_ORDER_VOIDED", label: "Void" },
  REOPEN: { next: "DRAFT", type: "CHANGE_ORDER_REOPENED", label: "Reopen" },
};

export function previewCoLifecycle(changeOrderId: string, action: keyof typeof LIFECYCLE): CommandPreview {
  const spec = LIFECYCLE[action];
  const approved = action === "APPROVE";
  return {
    understood: `${spec.label} change order ${changeOrderId}.`,
    changes: ["Change Order status", ...(approved ? ["Revised Budget", "Overview", "Pending exposure"] : ["Pending exposure"])],
    consequences: approved
      ? [
          "Approved cost enters Revised Budget exactly once.",
          "Pending exposure for this CO clears.",
          "Declared schedule days still do not rewrite Schedule.",
        ]
      : action === "REJECT" || action === "VOID"
        ? ["Rejected/void COs never enter Revised Budget. Original evidence stays in History."]
        : ["Approved budget is unchanged until explicit approval."],
    nextAction: `Confirm ${spec.label.toLowerCase()}.`,
    clerical: false,
    eventType: spec.type,
    apply: (project) =>
      record(
        project,
        spec.type,
        `${spec.label} change order ${changeOrderId}.`,
        false,
        (draft) => {
          const co = requireFinancials(draft).changeOrders[changeOrderId];
          if (!co) throw new Error("Unknown change order.");
          co.status = spec.next;
          if (action === "PROPOSE") co.proposedAt = nowIso();
          if (action === "APPROVE") co.approvedAt = nowIso();
          if (action === "REJECT") co.rejectedAt = nowIso();
        },
        changeOrderId,
      ),
  };
}

export function previewPatchChangeOrder(
  changeOrderId: string,
  patch: Partial<Pick<ChangeOrder, "title" | "description" | "reason" | "notes" | "number" | "cost" | "declaredScheduleDays" | "scopeItemIds" | "activityIds" | "allocations">>,
): CommandPreview {
  const consequential =
    patch.cost !== undefined ||
    patch.declaredScheduleDays !== undefined ||
    patch.scopeItemIds !== undefined ||
    patch.activityIds !== undefined ||
    patch.allocations !== undefined;
  return {
    understood: consequential
      ? `Update change order ${changeOrderId} (consequential fields).`
      : `Clerical edit to change order ${changeOrderId}.`,
    changes: ["Change Order", ...(consequential ? ["Financial exposure if priced/pending"] : [])],
    consequences: consequential
      ? ["If this CO is not APPROVED, Revised Budget stays unchanged."]
      : ["History records the text edit."],
    nextAction: consequential ? "Confirm the change." : "Save the clerical edit.",
    clerical: !consequential,
    eventType: "CHANGE_ORDER_UPDATED",
    apply: (project) =>
      record(
        project,
        "CHANGE_ORDER_UPDATED",
        `Updated change order ${changeOrderId}.`,
        !consequential,
        (draft) => {
          const co = requireFinancials(draft).changeOrders[changeOrderId];
          if (!co) throw new Error("Unknown change order.");
          if (co.status === "APPROVED" && patch.cost) {
            throw new Error("Approved cost is protected evidence. Void/correct instead of silent overwrite.");
          }
          Object.assign(co, patch);
        },
        changeOrderId,
      ),
  };
}

export function previewPatchScope(
  scopeItemId: string,
  patch: Partial<Pick<ScopeItem, "description" | "phase" | "trade" | "notes" | "complete" | "included" | "activityId" | "allowanceLineId">>,
): CommandPreview {
  const consequential = patch.complete !== undefined || patch.included !== undefined || patch.allowanceLineId !== undefined;
  return {
    understood: `Update scope item ${scopeItemId}.`,
    changes: ["Scope", ...(patch.allowanceLineId ? ["Budget association"] : [])],
    consequences: consequential
      ? ["Overview blocked-scope and financial coverage findings will recompute."]
      : ["Clerical scope edit. History is recorded."],
    nextAction: consequential ? "Confirm." : "Save.",
    clerical: !consequential,
    eventType: "SCOPE_ITEM_UPDATED",
    apply: (project) =>
      record(project, "SCOPE_ITEM_UPDATED", `Updated scope "${project.scopeItems[scopeItemId]?.description ?? scopeItemId}".`, !consequential, (draft) => {
        const item = draft.scopeItems[scopeItemId];
        if (!item) throw new Error("Unknown scope item.");
        Object.assign(item, patch);
      }, scopeItemId),
  };
}

export function previewAddScope(
  input: {
    description: string;
    phase: string;
    trade?: string;
    activityId?: string | null;
  },
  project: Project,
): CommandPreview {
  const trade = input.trade ?? tradeFromText(input.description);
  const activityId = input.activityId ?? activityForTrade(project, trade).hit?.id ?? null;
  return {
    understood: `Add scope “${input.description}” and draft an unpriced change order.`,
    changes: ["Scope", "Change Orders", "Overview fact index"],
    consequences: [
      "This is after-baseline work. It is a change order, not a notepad line.",
      "Revised Budget does not move until you price the CO and approve it.",
      "Schedule dates are not rewritten. Materials takeoff is not invented from the name.",
    ],
    nextAction: "Confirm the ripple. Then price the CO when you know the number.",
    clerical: false,
    eventType: "SCOPE_CHANGE_DRAFTED",
    ripple: scopeAddRipple(project, input.description, trade),
    apply: (proj) =>
      record(
        proj,
        "SCOPE_CHANGE_DRAFTED",
        `Added scope “${input.description}” and drafted an unpriced CO.`,
        false,
        (draft) => {
          const scopeId = nextId("scp");
          draft.scopeItems[scopeId] = {
            id: scopeId,
            description: input.description,
            phase: input.phase,
            trade: trade ?? null,
            included: true,
            complete: false,
            activityId,
            allowanceLineId: null,
            notes: "Added after baseline — paired with a draft CO.",
            fromBaseline: false,
          };
          const fin = draft.financials;
          if (!fin) return;
          const id = nextId("co");
          const count = Object.keys(fin.changeOrders).length + 1;
          fin.changeOrders[id] = {
            id,
            number: `CO-${String(count).padStart(3, "0")}`,
            title: `Scope change: ${input.description}`,
            description: input.description,
            reason: "Added after baseline",
            status: "DRAFT",
            cost: zero(fin.currency),
            allocations: [],
            declaredScheduleDays: null,
            scopeItemIds: [scopeId],
            activityIds: activityId ? [activityId] : [],
            categoryId: null,
            clientApproval: null,
            requestedAt: nowIso(),
            proposedAt: null,
            approvedAt: null,
            rejectedAt: null,
            notes: "Unpriced. Howler will not invent a cost.",
          };
        },
      ),
  };
}

export function previewPatchActivity(
  activityId: string,
  patch: Partial<
    Pick<
      Activity,
      | "name"
      | "phase"
      | "state"
      | "committedStart"
      | "committedFinish"
      | "actualStart"
      | "actualFinish"
      | "notes"
      | "trade"
      | "durationLikely"
      | "predecessorId"
      | "locked"
    >
  >,
): CommandPreview {
  const consequential =
    patch.state !== undefined ||
    patch.committedStart !== undefined ||
    patch.committedFinish !== undefined ||
    patch.actualStart !== undefined ||
    patch.actualFinish !== undefined ||
    patch.durationLikely !== undefined ||
    patch.predecessorId !== undefined ||
    patch.locked !== undefined;
  return {
    understood: `Update schedule activity ${activityId}.`,
    changes: ["Schedule", "Forecast", "Overview next movement"],
    consequences: [
      "Dependent activities re-forecast from this canonical change.",
      "A Change Order's declared +days does not perform this update. Schedule is only changed here.",
    ],
    nextAction: consequential ? "Confirm the schedule change." : "Save the note.",
    clerical: !consequential,
    eventType: "SCHEDULE_UPDATED",
    apply: (project) =>
      record(
        project,
        "SCHEDULE_UPDATED",
        `Updated schedule "${project.activities[activityId]?.name ?? activityId}".`,
        !consequential,
        (draft) => {
          const activity = draft.activities[activityId];
          if (!activity) throw new Error("Unknown activity.");
          if (activity.locked && (patch.committedStart || patch.committedFinish) && patch.locked !== false) {
            throw new Error("Locked activity dates are protected. Clear the lock first.");
          }
          Object.assign(activity, patch);
        },
        activityId,
      ),
  };
}

export function previewProgressUpdate(
  note: string,
  work: { activityIds?: string[]; scopeIds?: string[]; labels?: string[]; nextSaid?: string | null } = {},
): CommandPreview {
  const cleaned = note.replace(/\s+/g, " ").trim().slice(0, 280);
  const activityIds = work.activityIds ?? [];
  const scopeIds = work.scopeIds ?? [];
  const labels = work.labels ?? [];
  const nextSaid = work.nextSaid?.replace(/\s+/g, " ").trim() || null;
  const closing = activityIds.length + scopeIds.length > 0;
  const named = labels.length ? labels.join("; ") : "named work";
  return {
    understood: closing ? `${named} complete.` : cleaned,
    changes: closing
      ? ["Status", "Index card", "Next call to action"]
      : ["Status", "Index card"],
    consequences: [
      closing
        ? `Closes ${named}. ${nextSaid ? `Next call: ${nextSaid}` : "Next call to action lands on the card and overview."}`
        : nextSaid
          ? `Next call: ${nextSaid}`
          : "Status and last-week log update.",
    ],
    nextAction: "Confirm to write this on the job overview and index card.",
    clerical: true,
    eventType: "JOB_STATUS_UPDATED",
    apply: (project) =>
      record(project, "JOB_STATUS_UPDATED", cleaned, true, (draft) => {
        const today = nowIso().slice(0, 10);
        for (const id of activityIds) {
          const activity = draft.activities[id];
          if (!activity) continue;
          activity.state = "COMPLETE";
          activity.actualFinish = activity.actualFinish ?? today;
        }
        for (const id of scopeIds) {
          const item = draft.scopeItems[id];
          if (!item) continue;
          item.complete = true;
        }
        const nextLine = nextSaid ? `Next call: ${nextSaid}` : nextCall(draft);
        draft.dashboardNote = closing ? `${named} complete. ${nextLine}` : nextSaid ? `${cleaned} ${nextLine}` : cleaned;
      }),
  };
}

export function previewSetJobMeta(patch: {
  paused?: boolean;
  heldPhases?: string[];
  dashboardNote?: string;
  healthBand?: HealthBand;
  projectType?: string;
  officialStart?: string | null;
  intendedFinish?: string | null;
}): CommandPreview {
  const dateNote =
    patch.officialStart !== undefined
      ? `Official start ${patch.officialStart ?? "Unknown"}.`
      : patch.intendedFinish !== undefined
        ? `Intended finish ${patch.intendedFinish ?? "Unknown"}.`
        : null;
  return {
    understood: dateNote
      ? dateNote
      : patch.dashboardNote
        ? patch.dashboardNote
        : `Update job status${patch.heldPhases ? ` — hold ${patch.heldPhases.join(", ")}` : ""}${patch.paused === false ? " — live work released" : ""}.`,
    changes: ["Overview", "Index card", "Schedule next movement"],
    consequences: [
      "Official start and intended finish live on the index card. A trade target is not the job finish.",
      "Howler will not mark remaining work complete from a date on the card.",
    ],
    nextAction: "Confirm the status change.",
    clerical: patch.officialStart !== undefined || patch.intendedFinish !== undefined,
    eventType: "JOB_STATUS_UPDATED",
    apply: (project) =>
      record(project, "JOB_STATUS_UPDATED", dateNote ?? patch.dashboardNote ?? "Updated job status.", Boolean(dateNote), (draft) => {
        if (patch.paused !== undefined) draft.paused = patch.paused;
        if (patch.heldPhases) draft.heldPhases = patch.heldPhases;
        if (patch.dashboardNote) draft.dashboardNote = patch.dashboardNote;
        if (patch.healthBand) draft.healthBand = patch.healthBand;
        if (patch.projectType) draft.projectType = patch.projectType;
        if (patch.officialStart !== undefined) draft.officialStart = patch.officialStart;
        if (patch.intendedFinish !== undefined) draft.intendedFinish = patch.intendedFinish;
      }),
  };
}

export function previewCloseout(activityIds: string[], note: string): CommandPreview {
  const today = nowIso().slice(0, 10);
  return {
    understood: "Named closeout work is in progress. Remaining items are not marked complete.",
    changes: ["Schedule", "Overview progress", "Index card"],
    consequences: [
      "In-progress closeout counts half of those scope items until you mark them complete with a date.",
      "Howler will not invent a finish date from “closing out.”",
      "Held phases (Interior) stay held.",
    ],
    nextAction: "Recorded on the job. Say Hey Howler for the next update.",
    clerical: true,
    eventType: "SCHEDULE_UPDATED",
    apply: (project) =>
      record(
        project,
        "SCHEDULE_UPDATED",
        "Closeout marked in progress. Remaining work not marked complete.",
        false,
        (draft) => {
          draft.paused = false;
          if (!draft.heldPhases) draft.heldPhases = [];
          for (const id of activityIds) {
            const activity = draft.activities[id];
            if (!activity || activity.state === "COMPLETE") continue;
            activity.state = "IN_PROGRESS";
            activity.actualStart = activity.actualStart ?? today;
            activity.notes = note;
          }
          const interiorHeld = Object.values(draft.scopeItems).some(
            (item) => /interior|precon/i.test(item.phase) && !item.included,
          );
          if (interiorHeld && !draft.heldPhases.includes("Interior")) {
            draft.heldPhases = [...draft.heldPhases, "Interior"];
          }
          draft.dashboardNote = note;
        },
        activityIds[0],
      ),
  };
}

type BlueprintPatch = Partial<
  Omit<Blueprint, "jurisdiction" | "codeEdition" | "weathering" | "rooms">
>;

export type { BlueprintPatch };

function omitUndefined<T extends Record<string, unknown>>(patch: T): T {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as T;
}

function describeBlueprintPatch(patch: BlueprintPatch): string {
  const parts: string[] = [];
  if (patch.widthIn != null && patch.depthIn != null) {
    parts.push(`envelope ${formatFtIn(patch.widthIn)} × ${formatFtIn(patch.depthIn)}`);
  } else if (patch.widthIn != null) parts.push(`width ${formatFtIn(patch.widthIn)}`);
  else if (patch.depthIn != null) parts.push(`depth ${formatFtIn(patch.depthIn)}`);
  if (patch.eaveHeightIn != null) parts.push(`walls ${formatFtIn(patch.eaveHeightIn)}`);
  if (patch.roofRise != null && patch.roofRun != null) parts.push(`pitch ${patch.roofRise}/${patch.roofRun}`);
  if (patch.studSize || patch.studSpacingIn) {
    parts.push(`studs ${patch.studSize ?? ""}${patch.studSpacingIn ? ` ${patch.studSpacingIn}" O.C.` : ""}`.trim());
  }
  if (patch.joistSize || patch.joistSpacingIn) {
    parts.push(`joists ${patch.joistSize ?? ""}${patch.joistSpacingIn ? ` ${patch.joistSpacingIn}" O.C.` : ""}`.trim());
  }
  if (patch.rafterSize || patch.rafterSpacingIn) {
    parts.push(`rafters ${patch.rafterSize ?? ""}${patch.rafterSpacingIn ? ` ${patch.rafterSpacingIn}" O.C.` : ""}`.trim());
  }
  if (patch.county) parts.push(`${patch.county} County`);
  if (patch.occupancy) parts.push(OCCUPANCY_LABEL[patch.occupancy]);
  if (patch.stories != null) parts.push(`${patch.stories} stor${patch.stories === 1 ? "y" : "ies"}`);
  if (patch.overheadDoorWidthIn != null) parts.push(`overhead door ${formatFtIn(patch.overheadDoorWidthIn)}`);
  if (patch.openings && patch.openings.length) {
    parts.push(
      `${patch.openings.length} opening${patch.openings.length === 1 ? "" : "s"} (${patch.openings
        .map((item) => item.kind)
        .join(", ")})`,
    );
  }
  if (patch.frostDepthIn != null) parts.push(`frost ${formatFtIn(patch.frostDepthIn)}`);
  if (patch.overhangIn != null) parts.push(`overhang ${formatFtIn(patch.overhangIn)}`);
  if (patch.drawingScale) parts.push(`scale ${patch.drawingScale === "FIT" ? "fit to sheet" : `${patch.drawingScale}" = 1'-0"`}`);
  if (patch.dimDatum) parts.push(`datum ${DATUM_LABEL[patch.dimDatum].toLowerCase()}`);
  if (patch.envelopeProvenance) parts.push(`envelope ${PROVENANCE_LABEL[patch.envelopeProvenance].toLowerCase()}`);
  if (patch.drawingStatus) parts.push(`status ${patch.drawingStatus.toLowerCase()}`);
  if (patch.notes) parts.push("notes");
  return parts.length ? parts.join(", ") : "blueprint fields";
}

export function previewPatchBlueprint(patch: BlueprintPatch): CommandPreview {
  const understood = describeBlueprintPatch(patch);
  const county = patch.county ? countyCriteria(patch.county) : null;
  const snow = county ? county.snowPsf : patch.groundSnowLoadPsf;
  return {
    understood: `Record ${understood} on Plans.`,
    changes: ["Plans working drawings", "Stud / joist / rafter layouts", "Kentucky code findings"],
    consequences: [
      "Drawings recompute from this envelope. Unknown fields stay Unknown — they are not filled with zeros.",
      county
        ? `${county.name} County ground snow load is ${county.snowPsf} psf (KRC Table R301.2(1)). Wind stays 115 mph Vult. Weathering stays Severe.`
        : "County/snow stay as entered. Howler will not guess a county from the street address.",
      "These are working drawings, not a sealed engineering set. AHJ + licensed design professional still required where the code requires it.",
    ],
    nextAction: "Confirm. Open Plans to read the sheets and the engineer-plan checklist.",
    clerical: false,
    eventType: "BLUEPRINT_UPDATED",
    apply: (project) =>
      record(project, "BLUEPRINT_UPDATED", `Updated Plans: ${understood}.`, false, (draft) => {
        if (!draft.blueprint) draft.blueprint = emptyBlueprint();
        const next = { ...ensureBlueprint(draft), ...omitUndefined(patch as Record<string, unknown>) } as Blueprint;
        if (county) {
          next.county = county.name;
          next.groundSnowLoadPsf = county.snowPsf;
        } else if (snow != null) {
          next.groundSnowLoadPsf = snow;
        }
        next.windSpeedMph = 115;
        next.weathering = "SEVERE";
        next.jurisdiction = "KENTUCKY";
        next.codeEdition = "KRC_2018";
        if (!next.openings) next.openings = [];
        if (patch.overheadDoorWidthIn != null) {
          const existing = next.openings.find((item) => item.kind === "OHD");
          const width = patch.overheadDoorWidthIn;
          const height = patch.overheadDoorHeightIn ?? existing?.heightIn ?? 84;
          const offset = next.widthIn ? Math.max(0, (next.widthIn - width) / 2) : (existing?.offsetIn ?? 0);
          if (existing) {
            existing.widthIn = width;
            existing.heightIn = height;
            existing.offsetIn = offset;
            existing.provenance = existing.provenance ?? "PROPOSED";
          } else {
            next.openings.push({
              id: nextId("op"),
              kind: "OHD",
              wall: "FRONT",
              widthIn: width,
              heightIn: height,
              offsetIn: offset,
              sillIn: 0,
              headerSize: "2x12",
              provenance: "PROPOSED",
              offsetProvenance: "INFERRED",
              datum: next.dimDatum ?? "FACE_FRAMING",
              notes: null,
            });
          }
        }
        const ohd = next.openings.find((item) => item.kind === "OHD");
        if (ohd) {
          next.overheadDoorWidthIn = ohd.widthIn;
          next.overheadDoorHeightIn = ohd.heightIn;
        }
        if (patch.widthIn != null || patch.depthIn != null) {
          next.envelopeProvenance = patch.envelopeProvenance ?? "PROPOSED";
        }
        if (
          next.drawingStatus === "ISSUED" &&
          (patch.widthIn != null ||
            patch.depthIn != null ||
            patch.eaveHeightIn != null ||
            patch.openings != null ||
            patch.overheadDoorWidthIn != null)
        ) {
          next.drawingStatus = "DRAFT";
        }
        draft.blueprint = next;
      }),
  };
}

function roomsFromScopeInto(draft: Project) {
  if (!draft.blueprint) draft.blueprint = emptyBlueprint();
  const names = new Set(Object.values(draft.blueprint.rooms).map((room) => room.name.toLowerCase()));
  for (const item of Object.values(draft.scopeItems)) {
    if (!item.included) continue;
    const text = item.description.toLowerCase();
    if (/\b(slab|cabinetry|fixture|allowance|drainage)\b/.test(text)) continue;
    if (names.has(item.description.toLowerCase())) continue;
    const id = nextId("rm");
    const isGarage = /\bgarage\b/.test(text);
    const isUpper = /\b(office|flex|second|2nd|upper)\b/.test(text);
    const fullFloor = (isGarage || isUpper) && draft.blueprint.widthIn && draft.blueprint.depthIn;
    draft.blueprint.rooms[id] = {
      id,
      name: item.description,
      level: isUpper ? 2 : 1,
      widthIn: fullFloor ? draft.blueprint.widthIn : null,
      depthIn: fullFloor ? draft.blueprint.depthIn : null,
      originXIn: fullFloor ? 0 : null,
      originYIn: fullFloor ? 0 : null,
      scopeItemIds: [item.id],
      notes: fullFloor ? "Sized from envelope. Edit if this space is only part of the floor." : "Size Unknown.",
    };
    names.add(item.description.toLowerCase());
  }
}

export function previewDrawWorkingSet(project: Project, patch: BlueprintPatch = {}): CommandPreview {
  const base = ensureBlueprint(project);
  const merged = { ...base, ...omitUndefined(patch as Record<string, unknown>) } as Blueprint;
  const typical = typicalGarageLayoutPatch(merged);
  const roomsEmpty = Object.keys(base.rooms).length === 0;
  const openingCount = (typical.openings ?? merged.openings ?? []).length;
  const understood = `Draw working set: ${describeBlueprintPatch({ ...patch, ...typical })}.`;
  return {
    understood,
    changes: [
      "Plans working drawings (plan, elevation, roof, studs, joists)",
      "Typical openings (confirm sizes)",
      "Kentucky code findings",
      roomsEmpty ? "Rooms named from Scope" : "Rooms (unchanged)",
    ],
    consequences: [
      "Envelope, walls, and pitch become canonical. Typical doors/framing fill only empty fields — they are design intent, still editable.",
      openingCount
        ? `Openings on the sheet: ${openingCount}. Change any door on Plans if this job is not a typical garage.`
        : "No typical openings added (occupancy is not a garage, or doors already exist).",
      "Howler will not invent a bath size or a county snow load. Unknown stays Unknown.",
      "Working drawings, not a sealed PE set. AHJ governs.",
    ],
    nextAction: "Confirm to draw the sheets. Edit any dimension, door, or room after.",
    clerical: false,
    eventType: "BLUEPRINT_WORKING_SET",
    apply: (proj) =>
      record(proj, "BLUEPRINT_WORKING_SET", understood, false, (draft) => {
        if (!draft.blueprint) draft.blueprint = emptyBlueprint();
        const next = {
          ...ensureBlueprint(draft),
          ...omitUndefined(patch as Record<string, unknown>),
        } as Blueprint;
        const filled = typicalGarageLayoutPatch(next);
        Object.assign(next, filled);
        if (!next.openings) next.openings = [];
        const ohd = next.openings.find((item) => item.kind === "OHD");
        if (ohd) {
          next.overheadDoorWidthIn = ohd.widthIn;
          next.overheadDoorHeightIn = ohd.heightIn;
        }
        next.jurisdiction = "KENTUCKY";
        next.codeEdition = "KRC_2018";
        next.windSpeedMph = 115;
        next.weathering = "SEVERE";
        const county = next.county ? countyCriteria(next.county) : null;
        if (county) next.groundSnowLoadPsf = county.snowPsf;
        draft.blueprint = next;
        if (Object.keys(draft.blueprint.rooms).length === 0) roomsFromScopeInto(draft);
      }),
  };
}

export function previewAdoptTradewalkSet(sourceName?: string): CommandPreview {
  const t = TRADEWALK;
  const from = sourceName ? ` from ${sourceName}` : "";
  return {
    understood: `Adopt the Tradewalk drawing set (${t.issued})${from}: envelope ${formatFtIn(t.overallWidthIn)} × ${formatFtIn(t.overallDepthIn)}, mower shed ${formatFtIn(t.shedWidthIn)} × ${formatFtIn(t.shedDepthIn)}, 10'-0" first-floor walls, 8/12, 2x4 walls, 2x12 joists @ 16" O.C., 2x8 rafters @ 16" O.C., Madison County.`,
    changes: [
      "Plans A01–A11 working drawings plus A15 wall framing",
      "Rooms: GARAGE, STORAGE SHED FOR LAWN MOWER, STAIRWELL, office/flex, half bath",
      "Kentucky code findings (Madison 15 psf). A12–A14 3D stay on the Tradewalk PDF.",
    ],
    consequences: [
      "Sizes are from Deboard Tradewalk Plans.pdf (A01/A03/A05/A06) and Stanfield citing A01 — not guessed.",
      "A01 tags 2868 man doors and 2840DH windows. SB3621 twice is a 3'-6\" × 2'-1\" window (same cipher) — type/wall Unknown, not an OHD, not a Simpson SSTB36 holdown.",
      "A09 shows two garage-door openers. Leaf widths stay Unknown until you enter the double and the single.",
      "A07 framing to outside of studs is 36'-8\" × 29'-3 3/16\". Murphy B1 4-ply / B2 3-ply / B3 4-ply PASSED (Calcs 8/17/2026).",
      "A11 half-bath is an option. Stairwell is named; run stays Unknown until you place it.",
      "Working drawings citing Tradewalk. Not a new PE stamp. AHJ governs.",
      "Revised budget is unchanged.",
    ],
    nextAction: "Confirm to replace the live sheets with the Tradewalk layout. Every dimension stays editable.",
    clerical: false,
    eventType: "BLUEPRINT_TRADEWALK_ADOPTED",
    apply: (project) =>
      record(
        project,
        "BLUEPRINT_TRADEWALK_ADOPTED",
        `Adopted Tradewalk Plans ${t.issued} as the working set.`,
        false,
        (draft) => {
          const next = tradewalkBlueprint();
          const county = countyCriteria(next.county ?? "");
          if (county) next.groundSnowLoadPsf = county.snowPsf;
          next.jurisdiction = "KENTUCKY";
          next.codeEdition = "KRC_2018";
          next.windSpeedMph = 115;
          next.weathering = "SEVERE";
          const kind = sourceName ? recognizeEvidence(sourceName) : "TRADEWALK";
          next.evidence = [
            ...(next.evidence ?? []),
            {
              id: nextId("ev"),
              name: sourceName ?? TRADEWALK.source,
              kind,
              note: evidenceNote(kind, sourceName ?? TRADEWALK.source),
              url: null,
            },
          ];
          draft.blueprint = next;
        },
      ),
  };
}

export function previewRecordEvidence(input: { name: string; kind?: EvidenceKind }): CommandPreview {
  const kind = input.kind ?? recognizeEvidence(input.name);
  const note = evidenceNote(kind, input.name);
  if (shouldAdoptDeboardTradewalk(input.name)) {
    return previewAdoptTradewalkSet(input.name);
  }
  return {
    understood: `Record uploaded file ${input.name} as evidence. Geometry stays Unknown.`,
    changes: ["Plans evidence register"],
    consequences: [
      note,
      "Howler will not invent a building size from a scan. Give width by depth or confirm this is the Tradewalk set.",
    ],
    nextAction: "Confirm to keep the filename on the job. Then tell Howler what the file contains.",
    clerical: true,
    eventType: "BLUEPRINT_EVIDENCE",
    apply: (project) =>
      record(project, "BLUEPRINT_EVIDENCE", `Evidence: ${input.name}`, true, (draft) => {
        const bp = ensureBlueprint(draft);
        bp.evidence = [
          ...(bp.evidence ?? []),
          { id: nextId("ev"), name: input.name, kind, note, url: null },
        ];
        draft.blueprint = bp;
      }),
  };
}

export function previewUpsertOpening(input: Opening): CommandPreview {
  const kind = input.kind === "OHD" ? "overhead door" : input.kind === "MAN" ? "man door" : "window";
  return {
    understood: `Place ${kind} ${formatFtIn(input.widthIn)}${input.heightIn ? ` × ${formatFtIn(input.heightIn)}` : ""} on the ${input.wall.toLowerCase()} wall.`,
    changes: ["Plans openings", "Elevation / stud layout"],
    consequences: [
      "Opening is design intent on the working drawings. Header callout is typical until you enter a specified header.",
      "Revised budget is unchanged.",
    ],
    nextAction: "Confirm the opening.",
    clerical: false,
    eventType: "BLUEPRINT_OPENING_UPSERTED",
    apply: (project) => {
      const id = input.id || nextId("op");
      return record(
        project,
        "BLUEPRINT_OPENING_UPSERTED",
        `Opening ${kind} on ${input.wall}.`,
        false,
        (draft) => {
          if (!draft.blueprint) draft.blueprint = emptyBlueprint();
          const next: Opening = {
            ...input,
            id,
            provenance: input.provenance ?? "PROPOSED",
            offsetProvenance: input.offsetProvenance ?? "PROPOSED",
            datum: input.datum ?? draft.blueprint.dimDatum ?? "FACE_FRAMING",
          };
          const list = draft.blueprint.openings ?? [];
          const index = list.findIndex((item) => item.id === id);
          if (index >= 0) list[index] = next;
          else list.push(next);
          draft.blueprint.openings = list;
          if (next.kind === "OHD") {
            draft.blueprint.overheadDoorWidthIn = next.widthIn;
            draft.blueprint.overheadDoorHeightIn = next.heightIn;
          }
        },
        id,
      );
    },
  };
}

export function previewRemoveOpening(openingId: string): CommandPreview {
  return {
    understood: `Remove opening ${openingId} from Plans.`,
    changes: ["Plans openings"],
    consequences: ["The opening leaves the drawing. Envelope is unchanged."],
    nextAction: "Confirm removal.",
    clerical: true,
    eventType: "BLUEPRINT_OPENING_REMOVED",
    apply: (project) =>
      record(project, "BLUEPRINT_OPENING_REMOVED", `Removed opening ${openingId}.`, true, (draft) => {
        if (!draft.blueprint) return;
        draft.blueprint.openings = (draft.blueprint.openings ?? []).filter((item) => item.id !== openingId);
        const ohd = draft.blueprint.openings.find((item) => item.kind === "OHD");
        if (!ohd) {
          draft.blueprint.overheadDoorWidthIn = null;
          draft.blueprint.overheadDoorHeightIn = null;
        }
      }, openingId),
  };
}

export function previewSuggestConventionalFraming(): CommandPreview {
  return {
    understood: "Fill empty framing fields with conventional KRC layout (does not overwrite sizes already entered).",
    changes: ["Stud size/spacing", "Joist size/spacing if habitable above", "Rafter size/spacing"],
    consequences: [
      "Only null fields are filled. Entered dimensions, pitch, and county are unchanged.",
      "Suggested default for habitable-over-garage: 2x4 @ 16\" O.C., 2x10 joists @ 16\" O.C., 2x8 rafters @ 16\" O.C.",
      "Howler still checks those suggestions against tabulated spans. Exceeding a table is an engineer finding, not a silent pass.",
    ],
    nextAction: "Confirm the suggested conventional layout.",
    clerical: false,
    eventType: "BLUEPRINT_FRAMING_SUGGESTED",
    apply: (project) =>
      record(
        project,
        "BLUEPRINT_FRAMING_SUGGESTED",
        "Applied conventional framing suggestions to empty fields.",
        false,
        (draft) => {
          if (!draft.blueprint) draft.blueprint = emptyBlueprint();
          Object.assign(draft.blueprint, conventionalFramingPatch(draft.blueprint));
        },
      ),
  };
}

export function previewUpsertRoom(input: {
  id?: string;
  name: string;
  level: number;
  widthIn: number | null;
  depthIn: number | null;
  originXIn: number | null;
  originYIn: number | null;
  scopeItemIds: string[];
  notes: string | null;
}): CommandPreview {
  const size =
    input.widthIn && input.depthIn
      ? `${formatFtIn(input.widthIn)} × ${formatFtIn(input.depthIn)}`
      : "size Unknown";
  return {
    understood: `Place room "${input.name}" on level ${input.level} (${size}).`,
    changes: ["Plans rooms", "Floor plan sheets"],
    consequences: [
      input.widthIn && input.depthIn
        ? "Room is drawn on the level plan."
        : "Room is named on the sheet. Size stays Unknown until entered — Howler will not invent a 6×8 bath.",
      "Scope associations are recorded. They do not change Budget.",
    ],
    nextAction: "Confirm the room.",
    clerical: false,
    eventType: "BLUEPRINT_ROOM_UPSERTED",
    apply: (project) => {
      const id = input.id ?? nextId("rm");
      return record(
        project,
        "BLUEPRINT_ROOM_UPSERTED",
        `Room "${input.name}" on level ${input.level}.`,
        false,
        (draft) => {
          if (!draft.blueprint) draft.blueprint = emptyBlueprint();
          const room: BlueprintRoom = {
            id,
            name: input.name,
            level: input.level,
            widthIn: input.widthIn,
            depthIn: input.depthIn,
            originXIn: input.originXIn,
            originYIn: input.originYIn,
            scopeItemIds: input.scopeItemIds,
            notes: input.notes,
          };
          draft.blueprint.rooms[id] = room;
        },
        id,
      );
    },
  };
}

export function previewIssueDrawingSet(project?: Project): CommandPreview {
  const bp = project ? ensureBlueprint(project) : null;
  const unresolved = bp ? unresolvedRegister(bp) : [];
  const blocking = unresolved.filter((item) => item.blocking);
  const watches = unresolved.filter((item) => !item.blocking);
  const blockingLine = blocking.length
    ? `Blocking: ${blocking.map((item) => item.title).join("; ")}.`
    : "No blocking unresolved items.";
  const watchLine = watches.length
    ? `Still open (not invented): ${watches
        .slice(0, 6)
        .map((item) => item.title)
        .join("; ")}${watches.length > 6 ? "…" : ""}.`
    : "No watch items on the register.";
  return {
    understood: "Issue the working-drawing set for contractor layout (not a PE stamp).",
    changes: ["Drawing issue status", "Activity / History", "Title block revision"],
    consequences: [
      blockingLine,
      watchLine,
      "Issued for layout records the exact revision contractors can work from. It does not become a sealed PE stamp.",
      "Guests on a live drawing session do not receive Howler. They only see the sheets.",
      "Changing envelope, openings, or wall height after issue returns the set to Draft.",
    ],
    nextAction: blocking.length
      ? "Confirm to issue anyway with unresolved items listed on the title block, or enter the missing sizes first."
      : "Confirm the issue, then export the PDF.",
    clerical: false,
    eventType: "BLUEPRINT_SET_ISSUED",
    apply: (proj) =>
      record(proj, "BLUEPRINT_SET_ISSUED", "Issued working-drawing set for layout.", false, (draft) => {
        if (!draft.blueprint) draft.blueprint = emptyBlueprint();
        draft.blueprint.drawingStatus = "ISSUED";
        draft.blueprint.issuedRevision = draft.revision + 1;
      }),
  };
}

export function previewSetDrawingDatum(datum: DimDatum): CommandPreview {
  return {
    understood: `Set drawing dimensions ${DATUM_LABEL[datum].toLowerCase()}.`,
    changes: ["Plans dimension datum", "Title block"],
    consequences: [
      "Every overall and opening dimension on the sheets states this surface. Intermediate chains still have to close.",
      "A01 Tradewalk overall remains the recorded finished-face size; A07 framing size stays to face of framing.",
      "Revised budget is unchanged.",
    ],
    nextAction: "Confirm the datum.",
    clerical: false,
    eventType: "BLUEPRINT_DATUM_SET",
    apply: (project) =>
      record(project, "BLUEPRINT_DATUM_SET", `Dimension datum ${DATUM_LABEL[datum]}.`, false, (draft) => {
        if (!draft.blueprint) draft.blueprint = emptyBlueprint();
        draft.blueprint.dimDatum = datum;
      }),
  };
}

export function previewSetEnvelopeProvenance(provenance: DimProvenance): CommandPreview {
  return {
    understood: `Mark the envelope ${PROVENANCE_LABEL[provenance].toLowerCase()}.`,
    changes: ["Plans envelope provenance", "Issue register"],
    consequences: [
      provenance === "VERIFIED"
        ? "Envelope is now a verified field measurement. It is not inferred from a PDF scale."
        : `Envelope provenance becomes ${PROVENANCE_LABEL[provenance]}. Unknown stays visible until you verify.`,
      "Drawings recompute labels. Geometry is unchanged.",
    ],
    nextAction: "Confirm provenance.",
    clerical: false,
    eventType: "BLUEPRINT_ENVELOPE_PROVENANCE",
    apply: (project) =>
      record(
        project,
        "BLUEPRINT_ENVELOPE_PROVENANCE",
        `Envelope ${PROVENANCE_LABEL[provenance]}.`,
        false,
        (draft) => {
          if (!draft.blueprint) draft.blueprint = emptyBlueprint();
          draft.blueprint.envelopeProvenance = provenance;
        },
      ),
  };
}

export function previewSetDrawingStatus(status: DrawingIssueStatus): CommandPreview {
  if (status === "ISSUED") return previewIssueDrawingSet();
  return {
    understood: status === "REVIEWED" ? "Mark the drawing set reviewed (not issued)." : "Return the drawing set to draft.",
    changes: ["Drawing issue status", "Title block"],
    consequences: [
      status === "REVIEWED"
        ? "Reviewed means a person looked. It is not issued for layout and not a PE stamp."
        : "Draft is the working state. Issued revisions stay on History.",
    ],
    nextAction: "Confirm the status change.",
    clerical: false,
    eventType: "BLUEPRINT_STATUS_SET",
    apply: (project) =>
      record(project, "BLUEPRINT_STATUS_SET", `Drawing status ${status}.`, false, (draft) => {
        if (!draft.blueprint) draft.blueprint = emptyBlueprint();
        draft.blueprint.drawingStatus = status;
      }),
  };
}

export function previewReplaceBlueprint(blueprint: Blueprint, note: string): CommandPreview {
  return {
    understood: note,
    changes: ["Plans working drawings"],
    consequences: [
      "A drawing-session edit landed on the project. Budget and Schedule are untouched.",
      "Unknown fields stay Unknown.",
    ],
    nextAction: "Open Plans to read the updated sheets.",
    clerical: true,
    eventType: "BLUEPRINT_COLLAB_SYNC",
    apply: (project) =>
      record(project, "BLUEPRINT_COLLAB_SYNC", note, true, (draft) => {
        draft.blueprint = { ...emptyBlueprint(), ...blueprint, rooms: blueprint.rooms ?? {}, openings: blueprint.openings ?? [] };
      }),
  };
}

export function previewRemoveRoom(roomId: string): CommandPreview {
  return {
    understood: `Remove room ${roomId} from Plans.`,
    changes: ["Plans rooms"],
    consequences: ["The room leaves the drawing. Envelope and framing are unchanged."],
    nextAction: "Confirm removal.",
    clerical: true,
    eventType: "BLUEPRINT_ROOM_REMOVED",
    apply: (project) =>
      record(project, "BLUEPRINT_ROOM_REMOVED", `Removed room ${roomId}.`, true, (draft) => {
        if (draft.blueprint?.rooms[roomId]) delete draft.blueprint.rooms[roomId];
      }, roomId),
  };
}

export function previewRoomsFromScope(project: Project): CommandPreview {
  const bp = ensureBlueprint(project);
  const existingNames = new Set(Object.values(bp.rooms).map((room) => room.name.toLowerCase()));
  const candidates = Object.values(project.scopeItems).filter((item) => {
    if (!item.included) return false;
    const text = item.description.toLowerCase();
    if (/\b(slab|cabinetry|fixture|allowance|drainage)\b/.test(text)) return false;
    return !existingNames.has(item.description.toLowerCase());
  });
  return {
    understood: `Name rooms from current Scope (${candidates.length} new). Sizes stay Unknown unless the envelope already covers a full-floor space.`,
    changes: ["Plans rooms"],
    consequences: [
      "Howler will not invent a 6×8 bath or a 12×16 office.",
      "Garage / full-floor office can use the recorded envelope as the room size when that envelope exists.",
      describeEnvelope(bp),
    ],
    nextAction: candidates.length ? "Confirm Scope-derived rooms." : "No new rooms to add from Scope.",
    clerical: false,
    eventType: "BLUEPRINT_ROOMS_FROM_SCOPE",
    apply: (proj) =>
      record(proj, "BLUEPRINT_ROOMS_FROM_SCOPE", "Named rooms from Scope.", false, (draft) => {
        if (!draft.blueprint) draft.blueprint = emptyBlueprint();
        const names = new Set(Object.values(draft.blueprint.rooms).map((room) => room.name.toLowerCase()));
        for (const item of Object.values(draft.scopeItems)) {
          if (!item.included) continue;
          const text = item.description.toLowerCase();
          if (/\b(slab|cabinetry|fixture|allowance|drainage)\b/.test(text)) continue;
          if (names.has(item.description.toLowerCase())) continue;
          const id = nextId("rm");
          const isGarage = /\bgarage\b/.test(text);
          const isUpper = /\b(office|flex|second|2nd|upper)\b/.test(text);
          const fullFloor = (isGarage || isUpper) && draft.blueprint.widthIn && draft.blueprint.depthIn;
          draft.blueprint.rooms[id] = {
            id,
            name: item.description,
            level: isUpper ? 2 : 1,
            widthIn: fullFloor ? draft.blueprint.widthIn : null,
            depthIn: fullFloor ? draft.blueprint.depthIn : null,
            originXIn: fullFloor ? 0 : null,
            originYIn: fullFloor ? 0 : null,
            scopeItemIds: [item.id],
            notes: fullFloor ? "Sized from envelope. Edit if this space is only part of the floor." : "Size Unknown.",
          };
          names.add(item.description.toLowerCase());
        }
      }),
  };
}

export function previewSetInspection(
  inspectionId: string,
  patch: { status?: InspectionStatus; date?: string | null; notes?: string | null },
): CommandPreview {
  return {
    understood: `Inspection ${inspectionId}: ${patch.status ?? "update"}${patch.date ? ` ${patch.date}` : ""}.`,
    changes: ["Inspections / Permits"],
    consequences: [
      "A pass is only recorded if you said it passed. Howler will not sign the AHJ card.",
      "Revised budget is unchanged.",
    ],
    nextAction: "Confirm the inspection record.",
    clerical: false,
    eventType: "INSPECTION_UPDATED",
    apply: (project) =>
      record(project, "INSPECTION_UPDATED", `Inspection ${inspectionId} ${patch.status ?? "updated"}.`, false, (draft) => {
        const job = ensureJob(draft);
        const current = job.inspections[inspectionId];
        if (!current) return;
        job.inspections[inspectionId] = { ...current, ...patch };
        draft.job = job;
      }, inspectionId),
  };
}

export function previewSetPermit(status: PermitStatus, number: string | null): CommandPreview {
  return {
    understood: `Permit ${status.toLowerCase().replace("_", " ")}${number ? ` #${number}` : ""}.`,
    changes: ["Inspections / Permits"],
    consequences: ["This is the AHJ card, not a PE stamp. Revised budget is unchanged."],
    nextAction: "Confirm permit status.",
    clerical: false,
    eventType: "PERMIT_UPDATED",
    apply: (project) =>
      record(project, "PERMIT_UPDATED", `Permit ${status}${number ? ` ${number}` : ""}.`, false, (draft) => {
        const job = ensureJob(draft);
        job.permitStatus = status;
        job.permitNumber = number ?? job.permitNumber;
        draft.job = job;
      }),
  };
}

export function previewUpsertContact(input: Partial<Contact> & { name: string; trade: string }): CommandPreview {
  return {
    understood: `Contact ${input.name} · ${input.trade}.`,
    changes: ["Trades / Vendors / Contacts"],
    consequences: ["A name is not a contract. Revised budget is unchanged."],
    nextAction: "Confirm the contact.",
    clerical: true,
    eventType: "CONTACT_UPSERT",
    apply: (project) =>
      record(project, "CONTACT_UPSERT", `Contact ${input.name}.`, true, (draft) => {
        const job = ensureJob(draft);
        const existing = Object.values(job.contacts).find(
          (item) => item.name.toLowerCase() === input.name.toLowerCase(),
        );
        const id = existing?.id ?? input.id ?? nextId("ct");
        job.contacts[id] = {
          id,
          name: input.name,
          trade: input.trade,
          phone: input.phone ?? existing?.phone ?? null,
          notes: input.notes ?? existing?.notes ?? null,
        };
        draft.job = job;
      }),
  };
}

export function previewUpsertSelection(input: Partial<SelectionItem> & { id: string; name: string }): CommandPreview {
  return {
    understood: `Selection ${input.name}${input.value ? `: ${input.value}` : ""}.`,
    changes: ["Selections"],
    consequences: ["Match-existing is a field fact. Unknown stays Unknown."],
    nextAction: "Confirm the selection.",
    clerical: false,
    eventType: "SELECTION_UPSERT",
    apply: (project) =>
      record(project, "SELECTION_UPSERT", `Selection ${input.name}.`, false, (draft) => {
        const job = ensureJob(draft);
        const existing = job.selections[input.id];
        job.selections[input.id] = {
          id: input.id,
          name: input.name,
          value: input.value ?? existing?.value ?? null,
          status: (input.status ?? existing?.status ?? "SELECTED") as SelectionStatus,
          notes: input.notes ?? existing?.notes ?? null,
        };
        draft.job = job;
      }),
  };
}

export function previewAddPhoto(caption: string, evidenceName: string | null): CommandPreview {
  return {
    understood: `Photo note: ${caption}.`,
    changes: ["Photos"],
    consequences: ["Caption is recorded. The image itself stays on your device / Drive."],
    nextAction: "Confirm the photo note.",
    clerical: true,
    eventType: "PHOTO_NOTED",
    apply: (project) =>
      record(project, "PHOTO_NOTED", caption, true, (draft) => {
        const job = ensureJob(draft);
        const id = nextId("ph");
        job.photos[id] = {
          id,
          caption,
          takenAt: nowIso().slice(0, 10),
          evidenceName,
        };
        draft.job = job;
      }),
  };
}

export { LIFECYCLE };
