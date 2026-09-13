import { add, formatMoney, money, sum, type Money } from "./money";
import type {
  Activity,
  FinancialSummary,
  Finding,
  PriorityAction,
  Project,
  ScopeItem,
} from "./types";

function addWorkdays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  let remaining = days;
  const step = days >= 0 ? 1 : -1;
  remaining = Math.abs(remaining);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + step);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

export function forecastActivity(
  project: Project,
  activity: Activity,
): { start: string | null; finish: string | null; critical: boolean } {
  if (activity.committedStart && activity.committedFinish) {
    return {
      start: activity.committedStart,
      finish: activity.committedFinish,
      critical: true,
    };
  }
  if (activity.actualStart && activity.actualFinish) {
    return {
      start: activity.actualStart,
      finish: activity.actualFinish,
      critical: true,
    };
  }
  let start = activity.committedStart ?? activity.actualStart;
  if (!start && activity.predecessorId) {
    const pred = project.activities[activity.predecessorId];
    if (pred) {
      const predForecast = forecastActivity(project, pred);
      start = predForecast.finish ? addWorkdays(predForecast.finish, 1) : null;
    }
  }
  const finish = start ? addWorkdays(start, Math.max(activity.durationLikely - 1, 0)) : null;
  return { start, finish, critical: activity.state !== "COMPLETE" && !activity.predecessorId };
}

export function financialSummary(project: Project): FinancialSummary | null {
  const fin = project.financials;
  if (!fin) return null;
  const currency = fin.currency;
  const approved = Object.values(fin.changeOrders).filter((co) => co.status === "APPROVED");
  const pending = Object.values(fin.changeOrders).filter(
    (co) => co.status === "PROPOSED" || co.status === "PENDING_APPROVAL",
  );
  const approvedChangeOrderTotal = sum(
    currency,
    approved.map((co) => co.cost),
  );
  const pendingChangeOrderTotal = sum(
    currency,
    pending.map((co) => co.cost),
  );
  const committedTotal = sum(
    currency,
    Object.values(fin.commitments)
      .filter((c) => c.status === "ACTIVE")
      .map((c) => c.amount),
  );
  const actualTotal = sum(
    currency,
    Object.values(fin.actualCosts)
      .filter((c) => c.status === "RECORDED")
      .map((c) => c.amount),
  );
  const revisedBudget = fin.baseline ? add(fin.baseline, approvedChangeOrderTotal) : null;
  const remaining = revisedBudget ? add(revisedBudget, money(-actualTotal.amountMinor, currency)) : null;
  return {
    currency,
    baseline: fin.baseline,
    approvedChangeOrderTotal,
    pendingChangeOrderTotal,
    revisedBudget,
    committedTotal,
    actualTotal,
    remaining,
  };
}

export function lineCommitted(project: Project, lineId: string): Money | null {
  const fin = project.financials;
  if (!fin) return null;
  const amounts = Object.values(fin.commitments)
    .filter((item) => item.status === "ACTIVE")
    .flatMap((item) => item.allocations.filter((row) => row.budgetLineId === lineId).map((row) => row.amount));
  return amounts.length ? sum(fin.currency, amounts) : money(0, fin.currency);
}

export function lineActual(project: Project, lineId: string): Money | null {
  const fin = project.financials;
  if (!fin) return null;
  const amounts = Object.values(fin.actualCosts)
    .filter((item) => item.status === "RECORDED" && item.budgetLineId === lineId)
    .map((item) => item.amount);
  return amounts.length ? sum(fin.currency, amounts) : money(0, fin.currency);
}

export function lineRevised(project: Project, lineId: string): Money | null {
  const fin = project.financials;
  const line = fin?.lines[lineId];
  if (!fin || !line) return null;
  const extras = Object.values(fin.changeOrders)
    .filter((co) => co.status === "APPROVED")
    .flatMap((co) => co.allocations.filter((row) => row.budgetLineId === lineId).map((row) => row.amount));
  const base = line.baselineAmount ?? money(0, fin.currency);
  return extras.length ? add(base, sum(fin.currency, extras)) : base;
}

export function computeFindings(project: Project): Finding[] {
  const findings: Finding[] = [];
  const fin = project.financials;
  if (!fin) return findings;
  for (const line of Object.values(fin.lines)) {
    if (!line.active) continue;
    if (!line.baselineAmount) {
      findings.push({
        kind: "LINE_HAS_NO_BASELINE",
        budgetLineId: line.id,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: null,
        message: `${line.description} has no baseline.`,
      });
    }
    if (line.scopeItemIds.length === 0) {
      findings.push({
        kind: "LINE_HAS_NO_SCOPE",
        budgetLineId: line.id,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: null,
        scopeItemId: null,
        message: `${line.description} is not tied to Scope.`,
      });
    }
  }
  for (const co of Object.values(fin.changeOrders)) {
    if ((co.status === "DRAFT" || co.status === "PROPOSED" || co.status === "PENDING_APPROVAL") && co.cost.amountMinor === 0) {
      findings.push({
        kind: co.status === "DRAFT" ? "DRAFT_CO_UNPRICED" : "PENDING_CO_UNPRICED",
        budgetLineId: null,
        commitmentId: null,
        actualCostId: null,
        changeOrderId: co.id,
        scopeItemId: null,
        message: `${co.number} is unpriced.`,
      });
    }
  }
  return findings;
}

export function findingNextAction(finding: Finding): string {
  if (finding.kind === "DRAFT_CO_UNPRICED" || finding.kind === "PENDING_CO_UNPRICED") {
    return "Price it before it can move Revised.";
  }
  if (finding.kind === "LINE_HAS_NO_BASELINE") return "Set a baseline or keep it Unknown.";
  return "Open the ledger and close the gap.";
}

export function priorityActions(project: Project): PriorityAction[] {
  const actions: PriorityAction[] = [];
  for (const inspection of Object.values(project.job.inspections)) {
    if (inspection.status === "FAILED") {
      actions.push({
        id: `insp-${inspection.id}`,
        priority: "CRITICAL",
        action: `Clear the ${inspection.name} fail.`,
        requiredBy: inspection.date,
      });
    }
  }
  for (const phase of heldPhasesOf(project)) {
    actions.push({
      id: `hold-${phase}`,
      priority: "WATCH",
      action: `${phase} is held. Do not release it from a field update.`,
      requiredBy: null,
    });
  }
  const findings = computeFindings(project).slice(0, 3);
  for (const finding of findings) {
    actions.push({
      id: `find-${finding.kind}-${finding.changeOrderId ?? finding.budgetLineId ?? "x"}`,
      priority: "WATCH",
      action: finding.message,
      requiredBy: null,
    });
  }
  return actions.slice(0, 6);
}

export function integrity(project: Project): { score: number } {
  const findings = computeFindings(project);
  const failed = Object.values(project.job.inspections).filter((item) => item.status === "FAILED").length;
  let score = 100 - findings.length * 8 - failed * 20;
  if (project.paused) score -= 10;
  if (!project.officialStart) score -= 4;
  return { score: Math.max(0, Math.min(100, score)) };
}

export function heldPhasesOf(project: Project): string[] {
  return [...new Set(project.heldPhases ?? [])];
}

function phaseIsHeld(project: Project, phase: string): boolean {
  const held = heldPhasesOf(project).map((item) => item.toLowerCase());
  return held.includes(phase.toLowerCase());
}

export function scopeProgressWeight(project: Project, item: ScopeItem): number {
  if (!item.included || phaseIsHeld(project, item.phase)) return 0;
  if (item.complete) return 1;
  const activity = item.activityId ? project.activities[item.activityId] : null;
  if (activity?.state === "COMPLETE") return 1;
  if (activity?.state === "IN_PROGRESS") return 0.5;
  return 0;
}

export function scopeStatus(
  project: Project,
  item: ScopeItem,
): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (!item.included || phaseIsHeld(project, item.phase)) {
    return { label: "Held", tone: "warn" };
  }
  if (item.complete) return { label: "Complete", tone: "ok" };
  const activity = item.activityId ? project.activities[item.activityId] : null;
  if (activity?.state === "COMPLETE") return { label: "Complete", tone: "ok" };
  if (activity?.state === "IN_PROGRESS") return { label: "Closing out", tone: "ok" };
  return { label: "Open", tone: "warn" };
}

export function progressPercent(project: Project): number {
  const scope = Object.values(project.scopeItems).filter(
    (item) => item.included && !phaseIsHeld(project, item.phase),
  );
  if (scope.length > 0) {
    const done = scope.reduce((sumScore, item) => sumScore + scopeProgressWeight(project, item), 0);
    return Math.round((done / scope.length) * 100);
  }
  let total = 0;
  let done = 0;
  for (const activity of Object.values(project.activities)) {
    if (phaseIsHeld(project, activity.phase)) continue;
    total += activity.durationLikely;
    if (activity.state === "COMPLETE") done += activity.durationLikely;
    else if (activity.state === "IN_PROGRESS") done += activity.durationLikely * 0.5;
  }
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

export function nextMovement(project: Project): string {
  if (project.paused) return "PAUSED — whole job held";
  const inProgress = Object.values(project.activities).find(
    (activity) => activity.state === "IN_PROGRESS" && !phaseIsHeld(project, activity.phase),
  );
  if (inProgress) return inProgress.name;
  const next = Object.values(project.activities).find(
    (activity) => activity.state !== "COMPLETE" && !phaseIsHeld(project, activity.phase),
  );
  return next?.name ?? "No open live-path work";
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "Unknown";
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function contractDates(project: Project): {
  officialStart: string;
  intendedFinish: string;
  startKnown: boolean;
  finishKnown: boolean;
} {
  return {
    officialStart: formatDay(project.officialStart),
    intendedFinish: formatDay(project.intendedFinish),
    startKnown: Boolean(project.officialStart),
    finishKnown: Boolean(project.intendedFinish),
  };
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function formatDayShort(iso: string | null | undefined): string {
  return formatDay(iso).replace(/, \d{4}$/, "");
}

function addCalendarDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inRange(iso: string | null | undefined, from: string, to: string): iso is string {
  return Boolean(iso && iso >= from && iso <= to);
}

export interface WindowItem {
  id: string;
  iso: string;
  when: string;
  name: string;
  mark: string;
}

export interface CardGlance {
  now: string;
  progress: number;
  window: WindowItem[];
  windowHint: string | null;
  solve: string[];
}

function pushUnique(list: string[], line: string) {
  if (!list.includes(line)) list.push(line);
}

function solveLine(activity: Activity, start: string | null): string | null {
  const notes = activity.notes ?? "";
  if (/confirm in the field|field-confirm/i.test(notes)) return `Confirm ${activity.name} in the field`;
  if (/proposed co|not approved/i.test(notes)) return `Resolve ${activity.name} — still proposed`;
  if (activity.state === "NOT_STARTED" && start) {
    return `Have ${activity.trade ?? activity.name} ready ${formatDayShort(start)}`;
  }
  if (activity.state === "IN_PROGRESS") return `Keep ${activity.name} moving`;
  return null;
}

export function glanceNow(project: Project): string {
  if (project.paused) return "Whole job paused.";
  const raw = (project.dashboardNote ?? nextMovement(project)).replace(/Next call:\s*.+$/i, "").trim();
  const sentence = raw.split(/(?<=[.!?])\s+/)[0]?.trim() || raw;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trim()}…` : sentence;
}

export function cardGlance(project: Project, asOf = todayIso()): CardGlance {
  const until = addCalendarDays(asOf, 14);
  const window: WindowItem[] = [];

  for (const inspection of Object.values(project.job.inspections)) {
    if (inspection.status === "PASSED") continue;
    if (!inRange(inspection.date, asOf, until)) continue;
    window.push({
      id: `insp-${inspection.id}`,
      iso: inspection.date,
      when: formatDayShort(inspection.date),
      name: inspection.name,
      mark: inspection.status.replaceAll("_", " ").toLowerCase(),
    });
  }

  for (const activity of Object.values(project.activities)) {
    if (activity.state === "COMPLETE") continue;
    const forecast = forecastActivity(project, activity);
    const iso = inRange(forecast.start, asOf, until)
      ? forecast.start
      : inRange(forecast.finish, asOf, until)
        ? forecast.finish
        : null;
    if (!iso) continue;
    window.push({
      id: activity.id,
      iso,
      when: formatDayShort(iso),
      name: activity.name,
      mark: activity.state === "IN_PROGRESS" ? "live" : iso === forecast.finish ? "due" : "starts",
    });
  }

  window.sort((a, b) => a.iso.localeCompare(b.iso) || a.name.localeCompare(b.name));
  const shown = window.slice(0, 4);

  const note = project.dashboardNote ?? "";
  const nextFromNote = /Next call:\s*(.+)$/i.exec(note)?.[1]?.trim();
  const solve: string[] = [];
  if (nextFromNote) pushUnique(solve, nextFromNote.slice(0, 140));
  if (project.paused) pushUnique(solve, "Decide whether the whole job stays paused");
  for (const inspection of Object.values(project.job.inspections)) {
    if (inspection.status === "FAILED") {
      pushUnique(solve, `Clear the ${inspection.name} fail before the next inspection`);
    }
  }
  for (const phase of heldPhasesOf(project)) {
    pushUnique(solve, `${phase} held — do not release it`);
  }
  const live = Object.values(project.activities).filter((activity) => {
    if (activity.state === "COMPLETE") return false;
    if (/\b(complete|done|finished|poured|closed)\b/i.test(note) && activity.trade && note.toLowerCase().includes(activity.trade.toLowerCase())) {
      return false;
    }
    if (/\b(complete|done|finished|poured|closed)\b/i.test(note) && note.toLowerCase().includes(activity.name.toLowerCase().split(" ")[0] ?? "###")) {
      return false;
    }
    return true;
  });
  const upcoming = Object.values(project.activities).filter((activity) => {
    if (activity.state === "COMPLETE") return false;
    const forecast = forecastActivity(project, activity);
    return inRange(forecast.start, asOf, until) || inRange(forecast.finish, asOf, until);
  });
  for (const activity of [...live, ...upcoming]) {
    if (solve.length >= 3) break;
    const line = solveLine(activity, forecastActivity(project, activity).start);
    if (line) pushUnique(solve, line);
  }
  if (solve.length === 0) pushUnique(solve, nextMovement(project));

  return {
    now: glanceNow(project),
    progress: progressPercent(project),
    window: shown,
    windowHint: shown.length ? null : "Nothing dated in the next 14 days",
    solve,
  };
}

export function spokenBrief(project: Project): string {
  const pct = progressPercent(project);
  const next = nextMovement(project);
  const held = heldPhasesOf(project);
  const hold = held.length ? ` ${held.join(" and ")} held.` : "";
  const pause = project.paused ? " Whole job paused." : "";
  return `${project.name}. ${project.healthBand}. ${pct} percent. ${project.dashboardNote ?? project.projectType}${hold}${pause} Next: ${next}.`;
}

export function primaryExposure(project: Project): string {
  const summary = financialSummary(project);
  if (!summary?.pendingChangeOrderTotal || summary.pendingChangeOrderTotal.amountMinor === 0) {
    return project.dashboardNote ?? project.projectType;
  }
  return `Pending CO exposure ${formatMoney(summary.pendingChangeOrderTotal)}`;
}

export function matchWork(
  project: Project,
  text: string,
): { activityIds: string[]; scopeIds: string[]; labels: string[] } {
  const t = text.toLowerCase();
  const activityIds: string[] = [];
  const labels: string[] = [];
  for (const activity of Object.values(project.activities)) {
    if (activity.state === "COMPLETE") continue;
    const hay = `${activity.name} ${activity.trade ?? ""} ${activity.phase}`.toLowerCase();
    const tokens = [...new Set(hay.split(/[^a-z0-9]+/).filter((part) => part.length >= 4))];
    const hit =
      Boolean(activity.trade && t.includes(activity.trade.toLowerCase())) ||
      tokens.some((token) => t.includes(token));
    if (!hit) continue;
    activityIds.push(activity.id);
    labels.push(activity.name);
  }
  const scopeIds: string[] = [];
  for (const item of Object.values(project.scopeItems)) {
    if (!item.included || item.complete) continue;
    const hay = `${item.description} ${item.trade ?? ""} ${item.phase}`.toLowerCase();
    const tokens = hay.split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
    if (
      (item.activityId && activityIds.includes(item.activityId)) ||
      tokens.some((token) => t.includes(token))
    ) {
      scopeIds.push(item.id);
    }
  }
  return { activityIds, scopeIds, labels };
}

export function matchClosedWork(
  project: Project,
  text: string,
): { activityIds: string[]; scopeIds: string[]; labels: string[] } {
  const clauses = text
    .split(/[,;]|\.(?:\s|$)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const doneClauses = clauses.filter((part) =>
    /\b(done|complete|completed|finished|closed|poured|wrapped|signed off)\b/i.test(part),
  );
  if (doneClauses.length === 0) {
    return /\b(done|complete|completed|finished|closed|poured|wrapped|signed off)\b/i.test(text)
      ? matchWork(project, text)
      : { activityIds: [], scopeIds: [], labels: [] };
  }
  const activityIds: string[] = [];
  const scopeIds: string[] = [];
  const labels: string[] = [];
  for (const clause of doneClauses) {
    const hit = matchWork(project, clause);
    for (const id of hit.activityIds) if (!activityIds.includes(id)) activityIds.push(id);
    for (const id of hit.scopeIds) if (!scopeIds.includes(id)) scopeIds.push(id);
    for (const label of hit.labels) if (!labels.includes(label)) labels.push(label);
  }
  return { activityIds, scopeIds, labels };
}

export function nextCall(project: Project, closingIds: string[] = []): string {
  const remaining = Object.values(project.activities).filter(
    (activity) =>
      activity.state !== "COMPLETE" &&
      !closingIds.includes(activity.id) &&
      !phaseIsHeld(project, activity.phase),
  );
  const live = remaining.find((activity) => activity.state === "IN_PROGRESS");
  const next = live ?? remaining[0];
  if (!next) return "No open live-path work.";
  return `Next call: ${next.name}`;
}

export function splitUpdate(text: string): { body: string; nextSaid: string | null } {
  const match =
    /\b(?:what'?s next[,:]?|next(?: call| up| is)?[,:]?|then|awaiting|waiting on|waiting for)\s+(.+)$/i.exec(text);
  if (!match || match.index === undefined) return { body: text, nextSaid: null };
  const body = text.slice(0, match.index).replace(/[,.]+$/, "").trim();
  const nextSaid = match[1].replace(/\bno budget.*$/i, "").trim();
  return { body: body || text, nextSaid: nextSaid.length > 1 ? nextSaid : null };
}

export function jobBrief(
  project: Project,
  asOf = todayIso(),
): { now: string; last: { when: string; text: string }[]; next: string[] } {
  const glance = cardGlance(project, asOf);
  const weekAgo = addCalendarDays(asOf, -7);
  const last = project.events
    .filter((event) => event.occurredAt.slice(0, 10) >= weekAgo)
    .slice(0, 5)
    .map((event) => ({
      when: formatDayShort(event.occurredAt.slice(0, 10)),
      text: event.note,
    }));
  return { now: glance.now, last, next: glance.solve.slice(0, 3) };
}
