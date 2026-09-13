/**
 * One fact, many ledgers. A command is not a form in one module —
 * it is a ripple Howler traces before you confirm.
 *
 * Honesty: Howler will not invent a price, rewrite a committed date,
 * approve a CO, or place a fixture. Those hops stay NEEDS_YOU / WATCH.
 */
import { contractDates, financialSummary } from "./derive";
import { materialTakeoff, ensureJob } from "./job";
import { unresolvedRegister } from "./layout";
import { add, formatMoney } from "./money";
import type { CommandPreview, Project } from "./types";
import { ensureBlueprint } from "./types";

export type RippleStatus = "WILL_WRITE" | "UNCHANGED" | "NEEDS_YOU" | "WATCH";

export interface RippleHop {
  ledger: string;
  moduleId: string;
  status: RippleStatus;
  fact: string;
}

export interface LiveFact {
  id: string;
  ledger: string;
  moduleId: string;
  label: string;
  value: string;
  tone: "ok" | "warn" | "danger" | "neutral";
}

const TRADES = ["plumbing", "electrical", "hvac", "framing", "concrete", "masonry", "roofing", "cabinetry"] as const;

export function tradeFromText(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\b(mini[- ]?split|heat pump|hvac|air handler)\b/.test(lower)) return "HVAC";
  const hit = TRADES.find((trade) => lower.includes(trade));
  return hit ? hit[0].toUpperCase() + hit.slice(1) : null;
}

export function activityForTrade(project: Project, trade: string | null) {
  if (!trade) return { hit: null as (typeof project.activities)[string] | null, candidates: [] as string[] };
  const needle = trade.toLowerCase();
  const open = Object.values(project.activities).filter(
    (item) => item.trade && item.trade.toLowerCase() === needle && item.state !== "COMPLETE",
  );
  if (open.length === 1) return { hit: open[0], candidates: [open[0].name] };
  return { hit: null, candidates: open.map((item) => item.name) };
}

export function scopeAddRipple(
  project: Project,
  description: string,
  trade: string | null,
): RippleHop[] {
  const summary = financialSummary(project);
  const activity = activityForTrade(project, trade);
  const rooms = Object.values(ensureBlueprint(project).rooms);
  const namedRoom = rooms.find((room) =>
    description.toLowerCase().split(/\s+/).some((word) => word.length > 3 && room.name.toLowerCase().includes(word)),
  );

  return [
    {
      ledger: "Scope",
      moduleId: "scope",
      status: "WILL_WRITE",
      fact: `Add “${description}” after baseline. Not original contract work.`,
    },
    {
      ledger: "Change Orders",
      moduleId: "change-orders",
      status: "WILL_WRITE",
      fact: "Draft an unpriced CO for this scope. Howler will not invent a dollar amount.",
    },
    {
      ledger: "Budget",
      moduleId: "budget",
      status: summary ? "UNCHANGED" : "NEEDS_YOU",
      fact: summary
        ? `Revised stays ${formatMoney(summary.revisedBudget)} until you price the CO and approve it. Pending never inflates Revised.`
        : "Budget is not initialized. The CO still drafts; money stays Unknown.",
    },
    {
      ledger: "Schedule",
      moduleId: "schedule",
      status: activity.hit ? "WATCH" : "NEEDS_YOU",
      fact: activity.hit
        ? `Candidate activity “${activity.hit.name}” — associated, not rewritten. Committed dates stay put.`
        : activity.candidates.length
          ? `Several ${trade} activities. Name which one. Dates are not moved.`
          : "No schedule activity named. Howler will not invent a duration.",
    },
    {
      ledger: "Plans",
      moduleId: "plans",
      status: namedRoom ? "WATCH" : "WATCH",
      fact: namedRoom
        ? `Room “${namedRoom.name}” exists. Equipment is not placed. Howler will not invent a pad or circuit.`
        : "No matching room. A01 does not gain a fixture from a scope sentence.",
    },
    {
      ledger: "Materials",
      moduleId: "materials",
      status: "WATCH",
      fact: "Takeoff stays derived from the model. This item is not a counted stick until you specify it.",
    },
    {
      ledger: "Inspections",
      moduleId: "inspections",
      status: "WATCH",
      fact: trade === "Electrical" || trade === "HVAC" || trade === "Plumbing"
        ? `Rough ${trade.toLowerCase()} may pick up work. Panel / fixture locations stay Unknown until recorded.`
        : "Inspection card is unchanged until the field is ready.",
    },
  ];
}

export function liveFacts(project: Project): LiveFact[] {
  const facts: LiveFact[] = [];
  const summary = financialSummary(project);
  const bp = ensureBlueprint(project);
  const calendar = contractDates(project);

  facts.push({
    id: "fact-start",
    ledger: "Schedule",
    moduleId: "schedule",
    label: "Official start",
    value: calendar.officialStart,
    tone: calendar.startKnown ? "ok" : "warn",
  });
  facts.push({
    id: "fact-finish",
    ledger: "Schedule",
    moduleId: "schedule",
    label: "Intended finish",
    value: calendar.intendedFinish,
    tone: calendar.finishKnown ? "ok" : "warn",
  });

  facts.push({
    id: "fact-budget",
    ledger: "Budget",
    moduleId: "budget",
    label: "Revised",
    value: summary ? formatMoney(summary.revisedBudget) : "Unknown",
    tone: summary ? "ok" : "warn",
  });

  const pending = Object.values(project.financials?.changeOrders ?? {}).filter(
    (co) => co.status === "DRAFT" || co.status === "PROPOSED" || co.status === "PENDING_APPROVAL",
  );
  for (const co of pending) {
    facts.push({
      id: `fact-co-${co.id}`,
      ledger: "Change Orders",
      moduleId: "change-orders",
      label: co.number,
      value: `${co.status.replaceAll("_", " ")} · ${co.title} · ${formatMoney(co.cost)}`,
      tone: co.cost.amountMinor === 0 ? "warn" : "neutral",
    });
  }

  for (const item of Object.values(project.scopeItems).filter((row) => row.included && !row.fromBaseline)) {
    facts.push({
      id: `fact-scp-${item.id}`,
      ledger: "Scope",
      moduleId: "scope",
      label: "Added after baseline",
      value: item.description,
      tone: "warn",
    });
  }

  const inProgress = Object.values(project.activities).find((item) => item.state === "IN_PROGRESS");
  if (inProgress) {
    facts.push({
      id: `fact-act-${inProgress.id}`,
      ledger: "Schedule",
      moduleId: "schedule",
      label: "In progress",
      value: inProgress.name,
      tone: "ok",
    });
  }

  if (bp.widthIn && bp.depthIn) {
    facts.push({
      id: "fact-env",
      ledger: "Plans",
      moduleId: "plans",
      label: "Envelope",
      value: `${bp.envelopeProvenance ?? "PROPOSED"} · ${bp.dimDatum ?? "FACE_FRAMING"}`,
      tone: (bp.envelopeProvenance ?? "PROPOSED") === "VERIFIED" ? "ok" : "warn",
    });
  }

  for (const item of unresolvedRegister(bp).filter((row) => row.blocking).slice(0, 4)) {
    facts.push({
      id: `fact-unr-${item.id}`,
      ledger: "Plans",
      moduleId: "plans",
      label: item.title,
      value: item.message,
      tone: "danger",
    });
  }

  for (const line of materialTakeoff(project).filter((row) => row.status === "UNKNOWN").slice(0, 3)) {
    facts.push({
      id: `fact-mat-${line.id}`,
      ledger: "Materials",
      moduleId: "materials",
      label: line.item,
      value: line.qty,
      tone: "warn",
    });
  }

  return facts;
}

export function annotatePreview(project: Project, preview: CommandPreview): CommandPreview {
  if (preview.ripple && preview.ripple.length > 0) return preview;
  return { ...preview, ripple: hopsFor(project, preview) };
}

function hopsFor(project: Project, preview: CommandPreview): RippleHop[] {
  const type = preview.eventType;
  if (type.startsWith("CHANGE_ORDER")) return coHops(project, preview);
  if (type === "JOB_STATUS_UPDATED") return progressHops(preview);
  if (type === "SCHEDULE_UPDATED") return scheduleHops(project, preview);
  if (type === "BLUEPRINT_OPENING_UPSERTED") return openingHops(project, preview);
  if (type === "INSPECTION_UPDATED" || type === "PERMIT_UPDATED") return inspectionHops(project, preview);
  if (type === "ACTUAL_COST_RECORDED" || type === "COMMITMENT_ADDED" || type === "BUDGET_LINE_UPDATED" || type === "SET_PROJECT_FINANCIAL_BASELINE") {
    return budgetHops(project, preview);
  }
  return fallbackHops(preview);
}

function progressHops(preview: CommandPreview): RippleHop[] {
  return [
    {
      ledger: "Status",
      moduleId: "overview",
      status: "WILL_WRITE",
      fact: preview.understood,
    },
    {
      ledger: "Next call",
      moduleId: "overview",
      status: "WILL_WRITE",
      fact: preview.consequences[0] ?? "Index card and overview show the next call to action.",
    },
  ];
}

function fallbackHops(preview: CommandPreview): RippleHop[] {
  const hops: RippleHop[] = preview.changes.map((change) => ({
    ledger: change.split(/[·(]/)[0]?.trim() || "Record",
    moduleId: "overview",
    status: "WILL_WRITE" as const,
    fact: change,
  }));
  for (const line of preview.consequences.slice(0, 4)) {
    hops.push({
      ledger: "Honesty",
      moduleId: "overview",
      status: /not |will not |unchanged|unknown/i.test(line) ? "UNCHANGED" : "WATCH",
      fact: line,
    });
  }
  return hops;
}

function findCo(project: Project, preview: CommandPreview) {
  const id = /change order\s+(co-[a-z0-9-]+)/i.exec(preview.understood)?.[1];
  if (id && project.financials?.changeOrders[id]) return project.financials.changeOrders[id];
  const titled = /"([^"]+)"/.exec(preview.understood)?.[1];
  if (titled) {
    return Object.values(project.financials?.changeOrders ?? {}).find((co) => co.title === titled) ?? null;
  }
  return Object.values(project.financials?.changeOrders ?? {}).find((co) =>
    preview.understood.toLowerCase().includes(co.number.toLowerCase()) ||
    preview.understood.toLowerCase().includes(co.title.toLowerCase()),
  ) ?? null;
}

function coHops(project: Project, preview: CommandPreview): RippleHop[] {
  const co = findCo(project, preview);
  const summary = financialSummary(project);
  const approving = preview.eventType === "CHANGE_ORDER_APPROVED";
  const pricing = preview.eventType === "CHANGE_ORDER_UPDATED";
  const nextRevised =
    approving && summary?.revisedBudget && co
      ? add(summary.revisedBudget, co.cost)
      : summary?.revisedBudget ?? null;
  const scopeNames = (co?.scopeItemIds ?? [])
    .map((id) => project.scopeItems[id]?.description)
    .filter(Boolean);
  const actNames = (co?.activityIds ?? [])
    .map((id) => project.activities[id]?.name)
    .filter(Boolean);

  return [
    {
      ledger: "Change Orders",
      moduleId: "change-orders",
      status: "WILL_WRITE",
      fact: co
        ? `${co.number} “${co.title}” → ${preview.eventType.replace("CHANGE_ORDER_", "").replaceAll("_", " ")} · ${formatMoney(co.cost)}`
        : preview.understood,
    },
    {
      ledger: "Budget",
      moduleId: "budget",
      status: approving ? "WILL_WRITE" : "UNCHANGED",
      fact: approving
        ? co && co.cost.amountMinor === 0
          ? "Cost is $0. Approving writes zero into Revised. Price it first if that is wrong."
          : `Revised becomes ${formatMoney(nextRevised)} (approved cost enters once). Pending for this CO clears.`
        : pricing
          ? `Revised stays ${formatMoney(summary?.revisedBudget ?? null)} until this CO is approved.`
          : `Revised stays ${formatMoney(summary?.revisedBudget ?? null)}. Pending exposure moves only after propose/submit.`,
    },
    {
      ledger: "Schedule",
      moduleId: "schedule",
      status: co?.declaredScheduleDays ? "NEEDS_YOU" : "UNCHANGED",
      fact: co?.declaredScheduleDays
        ? `Declared +${co.declaredScheduleDays} days is a claim${actNames.length ? ` on ${actNames.join(", ")}` : ""}. Howler will not rewrite committed dates.`
        : "No declared schedule impact. Dates stay put.",
    },
    {
      ledger: "Scope",
      moduleId: "scope",
      status: scopeNames.length ? "WATCH" : "WATCH",
      fact: scopeNames.length ? `Tied to: ${scopeNames.join("; ")}.` : "No scope item linked.",
    },
    {
      ledger: "Materials",
      moduleId: "materials",
      status: "WATCH",
      fact: "Takeoff does not gain a stick from a dollar amount.",
    },
  ];
}

function scheduleHops(project: Project, preview: CommandPreview): RippleHop[] {
  const id = /activity\s+(act-[a-z0-9-]+)/i.exec(preview.understood)?.[1];
  const activity = (id && project.activities[id]) || null;
  const linked = Object.values(project.scopeItems).filter((item) => item.activityId && activity && item.activityId === activity.id);
  const dependents = Object.values(project.activities).filter((item) => activity && item.predecessorId === activity.id);
  const finishing = /\bCOMPLETE\b/.test(preview.understood) || (activity && /finish|complete/i.test(preview.understood));
  return [
    {
      ledger: "Schedule",
      moduleId: "schedule",
      status: "WILL_WRITE",
      fact: activity ? `“${activity.name}” updates. Forecast recomputes from this canonical change.` : preview.understood,
    },
    {
      ledger: "Scope",
      moduleId: "scope",
      status: linked.length ? "WATCH" : "UNCHANGED",
      fact: linked.length
        ? finishing
          ? `${linked.map((item) => item.description).join("; ")} stay open until you mark them complete. Finishing the activity does not close the scope.`
          : `Linked: ${linked.map((item) => item.description).join("; ")}.`
        : "No scope item on this activity.",
    },
    {
      ledger: "Change Orders",
      moduleId: "change-orders",
      status: "UNCHANGED",
      fact: "A CO’s declared +days does not perform this update. Schedule only changes here.",
    },
    {
      ledger: "Downstream",
      moduleId: "schedule",
      status: dependents.length ? "WATCH" : "UNCHANGED",
      fact: dependents.length
        ? `${dependents.map((item) => item.name).join(", ")} re-forecast from the predecessor. Locked dates stay locked.`
        : "No successor activities.",
    },
  ];
}

function openingHops(project: Project, preview: CommandPreview): RippleHop[] {
  const kind = /overhead door|man door|window/i.exec(preview.understood)?.[0] ?? "opening";
  const blocking = unresolvedRegister(ensureBlueprint(project)).filter((item) => item.blocking);
  return [
    {
      ledger: "Plans",
      moduleId: "plans",
      status: "WILL_WRITE",
      fact: `${preview.understood} Opening schedule and elevations update.`,
    },
    {
      ledger: "Materials",
      moduleId: "materials",
      status: "WATCH",
      fact:
        /overhead/i.test(kind)
          ? "OHD leaf is now sized. Header and track stay typical until specified — Howler will not invent a Simpson."
          : "Takeoff picks up the unit when the schedule has a size. Fasteners stay Unknown.",
    },
    {
      ledger: "Inspections",
      moduleId: "inspections",
      status: "WATCH",
      fact: "Framing inspection still waits on headers and the stair run. This opening does not pass the card.",
    },
    {
      ledger: "Budget",
      moduleId: "budget",
      status: "UNCHANGED",
      fact: `Revised stays ${formatMoney(financialSummary(project)?.revisedBudget ?? null)}. A door size is not a change order.`,
    },
    {
      ledger: "Unresolved",
      moduleId: "plans",
      status: blocking.some((item) => item.id === "ohd-leaf") && /overhead/i.test(kind) ? "WILL_WRITE" : "WATCH",
      fact: /overhead/i.test(kind)
        ? "OHD leaf Unknown will clear. Stair run stays Unknown."
        : blocking[0]
          ? `Still blocking: ${blocking[0].title}.`
          : "No blocking register items.",
    },
  ];
}

function inspectionHops(project: Project, preview: CommandPreview): RippleHop[] {
  const id = /(insp-[a-z0-9-]+)/i.exec(preview.understood)?.[1];
  const job = ensureJob(project);
  const card = id ? job.inspections[id] : null;
  const passed = /passed/i.test(preview.understood) || preview.understood.includes("PASSED");
  return [
    {
      ledger: "Inspections",
      moduleId: "inspections",
      status: "WILL_WRITE",
      fact: card ? `${card.name}${card.code ? ` (${card.code})` : ""} — ${preview.understood}` : preview.understood,
    },
    {
      ledger: "Permit",
      moduleId: "inspections",
      status: job.permitStatus === "ISSUED" ? "WATCH" : "NEEDS_YOU",
      fact:
        job.permitStatus === "ISSUED"
          ? `Permit ${job.permitNumber ?? "issued"}. A pass is your record, not the AHJ stamp.`
          : "Permit is not issued. Howler will not invent a card number.",
    },
    {
      ledger: "Schedule",
      moduleId: "schedule",
      status: "WATCH",
      fact: passed
        ? "A pass does not mark the activity complete. Say the finish date if the work is done."
        : "Inspection status does not move committed dates.",
    },
    {
      ledger: "Budget",
      moduleId: "budget",
      status: "UNCHANGED",
      fact: "Revised is unchanged. A failed card is not a change order until you add the work.",
    },
  ];
}

function budgetHops(project: Project, preview: CommandPreview): RippleHop[] {
  const summary = financialSummary(project);
  return [
    {
      ledger: "Budget",
      moduleId: "budget",
      status: "WILL_WRITE",
      fact: preview.understood,
    },
    {
      ledger: "Change Orders",
      moduleId: "change-orders",
      status: "UNCHANGED",
      fact: "Actuals and commitments do not approve a CO. Revised only moves on explicit approval.",
    },
    {
      ledger: "Overview",
      moduleId: "overview",
      status: "WATCH",
      fact: `Current revised ${formatMoney(summary?.revisedBudget ?? null)}.`,
    },
  ];
}

/** Linked ledgers for a single record — the opposite of “edit down below.” */
export function livesIn(project: Project, kind: "scope" | "activity" | "co", id: string): string[] {
  if (kind === "scope") {
    const item = project.scopeItems[id];
    if (!item) return [];
    const lines: string[] = [];
    if (item.activityId && project.activities[item.activityId]) {
      lines.push(`Schedule: ${project.activities[item.activityId]!.name}`);
    }
    const cos = Object.values(project.financials?.changeOrders ?? {}).filter((co) => co.scopeItemIds.includes(id));
    for (const co of cos) lines.push(`${co.number} ${co.status.replaceAll("_", " ")}`);
    const budget = Object.values(project.financials?.lines ?? {}).find((line) => line.scopeItemIds.includes(id));
    if (budget) lines.push(`Budget: ${budget.description}`);
    if (item.allowanceLineId && project.financials?.lines[item.allowanceLineId]) {
      lines.push(`Allowance: ${project.financials.lines[item.allowanceLineId]!.description}`);
    }
    return lines;
  }
  if (kind === "activity") {
    const activity = project.activities[id];
    if (!activity) return [];
    return Object.values(project.scopeItems)
      .filter((item) => item.activityId === id)
      .map((item) => `Scope: ${item.description}`);
  }
  const co = project.financials?.changeOrders[id];
  if (!co) return [];
  return [
    ...co.scopeItemIds.map((sid) => `Scope: ${project.scopeItems[sid]?.description ?? sid}`),
    ...co.activityIds.map((aid) => `Schedule: ${project.activities[aid]?.name ?? aid}`),
  ];
}

