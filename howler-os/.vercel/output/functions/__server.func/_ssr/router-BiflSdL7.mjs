import { o as __toESM } from "../_runtime.mjs";
import { a as OCCUPANCY_LABEL, d as emptyBlueprint, f as ensureBlueprint, i as LUMBER_SIZES, l as clampUpdatedAt, m as rateLimited, n as DRAWING_SCALES, u as clientKey } from "./guard-Dnnludmw.mjs";
import { H as require_react, R as redirect, _ as createRootRoute, b as useRouter, d as useRouterState, g as createFileRoute, h as lazyRouteComponent, l as Scripts, m as Outlet, p as createRouter, u as HeadContent, x as require_jsx_runtime, y as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as TriangleAlert } from "../_libs/lucide-react.mjs";
import { a as number, c as union, i as literal, l as unknown, n as _enum, o as object, r as discriminatedUnion, s as string, t as number$1 } from "../_libs/zod.mjs";
import { t as create } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/interpret-C3QORjvy.js
function parseMoneyDecimal(decimalString, currency) {
	const trimmed = decimalString.trim();
	if (!trimmed) return null;
	const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
	if (!match) return null;
	const fractional = match[3] ?? "";
	if (fractional.length > 2) return null;
	const combined = `${match[2] ?? "0"}${fractional.padEnd(2, "0")}`;
	const magnitude = BigInt(combined);
	const signed = match[1] === "-" ? -magnitude : magnitude;
	if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
	return {
		amountMinor: Number(signed),
		currency
	};
}
function formatMoney(money) {
	if (!money) return "Unknown";
	const negative = money.amountMinor < 0;
	const abs = Math.abs(money.amountMinor);
	const whole = Math.trunc(abs / 100);
	const cents = abs % 100;
	const symbol = money.currency === "USD" ? "$" : `${money.currency} `;
	return `${negative ? "-" : ""}${symbol}${whole.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}
function money(amountMinor, currency = "USD") {
	return {
		amountMinor,
		currency
	};
}
function zero(currency) {
	return {
		amountMinor: 0,
		currency
	};
}
function add(a, b) {
	if (a.currency !== b.currency) throw new Error("Currency mismatch");
	return {
		amountMinor: a.amountMinor + b.amountMinor,
		currency: a.currency
	};
}
function sum(currency, amounts) {
	return {
		amountMinor: amounts.reduce((total, item) => total + item.amountMinor, 0),
		currency
	};
}
function addWorkdays(iso, days) {
	const date = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
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
function forecastActivity(project, activity) {
	if (activity.committedStart && activity.committedFinish) return {
		start: activity.committedStart,
		finish: activity.committedFinish,
		critical: true
	};
	if (activity.actualStart && activity.actualFinish) return {
		start: activity.actualStart,
		finish: activity.actualFinish,
		critical: true
	};
	let start = activity.committedStart ?? activity.actualStart;
	if (!start && activity.predecessorId) {
		const pred = project.activities[activity.predecessorId];
		if (pred) {
			const predForecast = forecastActivity(project, pred);
			start = predForecast.finish ? addWorkdays(predForecast.finish, 1) : null;
		}
	}
	const finish = start ? addWorkdays(start, Math.max(activity.durationLikely - 1, 0)) : null;
	return {
		start,
		finish,
		critical: activity.state !== "COMPLETE" && !activity.predecessorId
	};
}
function financialSummary(project) {
	const fin = project.financials;
	if (!fin) return null;
	const currency = fin.currency;
	const approved = Object.values(fin.changeOrders).filter((co) => co.status === "APPROVED");
	const pending = Object.values(fin.changeOrders).filter((co) => co.status === "PROPOSED" || co.status === "PENDING_APPROVAL");
	const approvedChangeOrderTotal = sum(currency, approved.map((co) => co.cost));
	const pendingChangeOrderTotal = sum(currency, pending.map((co) => co.cost));
	const committedTotal = sum(currency, Object.values(fin.commitments).filter((c) => c.status === "ACTIVE").map((c) => c.amount));
	const actualTotal = sum(currency, Object.values(fin.actualCosts).filter((c) => c.status === "RECORDED").map((c) => c.amount));
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
		remaining
	};
}
function lineCommitted(project, lineId) {
	const fin = project.financials;
	if (!fin) return null;
	const amounts = Object.values(fin.commitments).filter((item) => item.status === "ACTIVE").flatMap((item) => item.allocations.filter((row) => row.budgetLineId === lineId).map((row) => row.amount));
	return amounts.length ? sum(fin.currency, amounts) : money(0, fin.currency);
}
function lineActual(project, lineId) {
	const fin = project.financials;
	if (!fin) return null;
	const amounts = Object.values(fin.actualCosts).filter((item) => item.status === "RECORDED" && item.budgetLineId === lineId).map((item) => item.amount);
	return amounts.length ? sum(fin.currency, amounts) : money(0, fin.currency);
}
function lineRevised(project, lineId) {
	const fin = project.financials;
	const line = fin?.lines[lineId];
	if (!fin || !line) return null;
	const extras = Object.values(fin.changeOrders).filter((co) => co.status === "APPROVED").flatMap((co) => co.allocations.filter((row) => row.budgetLineId === lineId).map((row) => row.amount));
	const base = line.baselineAmount ?? money(0, fin.currency);
	return extras.length ? add(base, sum(fin.currency, extras)) : base;
}
function computeFindings(project) {
	const findings = [];
	const fin = project.financials;
	if (!fin) return findings;
	for (const line of Object.values(fin.lines)) {
		if (!line.active) continue;
		if (!line.baselineAmount) findings.push({
			kind: "LINE_HAS_NO_BASELINE",
			budgetLineId: line.id,
			commitmentId: null,
			actualCostId: null,
			changeOrderId: null,
			scopeItemId: null,
			message: `${line.description} has no baseline.`
		});
		if (line.scopeItemIds.length === 0) findings.push({
			kind: "LINE_HAS_NO_SCOPE",
			budgetLineId: line.id,
			commitmentId: null,
			actualCostId: null,
			changeOrderId: null,
			scopeItemId: null,
			message: `${line.description} is not tied to Scope.`
		});
	}
	for (const co of Object.values(fin.changeOrders)) if ((co.status === "DRAFT" || co.status === "PROPOSED" || co.status === "PENDING_APPROVAL") && co.cost.amountMinor === 0) findings.push({
		kind: co.status === "DRAFT" ? "DRAFT_CO_UNPRICED" : "PENDING_CO_UNPRICED",
		budgetLineId: null,
		commitmentId: null,
		actualCostId: null,
		changeOrderId: co.id,
		scopeItemId: null,
		message: `${co.number} is unpriced.`
	});
	return findings;
}
function findingNextAction(finding) {
	if (finding.kind === "DRAFT_CO_UNPRICED" || finding.kind === "PENDING_CO_UNPRICED") return "Price it before it can move Revised.";
	if (finding.kind === "LINE_HAS_NO_BASELINE") return "Set a baseline or keep it Unknown.";
	return "Open the ledger and close the gap.";
}
function priorityActions(project) {
	const actions = [];
	for (const inspection of Object.values(project.job.inspections)) if (inspection.status === "FAILED") actions.push({
		id: `insp-${inspection.id}`,
		priority: "CRITICAL",
		action: `Clear the ${inspection.name} fail.`,
		requiredBy: inspection.date
	});
	for (const phase of heldPhasesOf(project)) actions.push({
		id: `hold-${phase}`,
		priority: "WATCH",
		action: `${phase} is held. Do not release it from a field update.`,
		requiredBy: null
	});
	const findings = computeFindings(project).slice(0, 3);
	for (const finding of findings) actions.push({
		id: `find-${finding.kind}-${finding.changeOrderId ?? finding.budgetLineId ?? "x"}`,
		priority: "WATCH",
		action: finding.message,
		requiredBy: null
	});
	return actions.slice(0, 6);
}
function integrity(project) {
	const findings = computeFindings(project);
	const failed = Object.values(project.job.inspections).filter((item) => item.status === "FAILED").length;
	let score = 100 - findings.length * 8 - failed * 20;
	if (project.paused) score -= 10;
	if (!project.officialStart) score -= 4;
	return { score: Math.max(0, Math.min(100, score)) };
}
function heldPhasesOf(project) {
	return [...new Set(project.heldPhases ?? [])];
}
function phaseIsHeld(project, phase) {
	return heldPhasesOf(project).map((item) => item.toLowerCase()).includes(phase.toLowerCase());
}
function scopeProgressWeight(project, item) {
	if (!item.included || phaseIsHeld(project, item.phase)) return 0;
	if (item.complete) return 1;
	const activity = item.activityId ? project.activities[item.activityId] : null;
	if (activity?.state === "COMPLETE") return 1;
	if (activity?.state === "IN_PROGRESS") return .5;
	return 0;
}
function scopeStatus(project, item) {
	if (!item.included || phaseIsHeld(project, item.phase)) return {
		label: "Held",
		tone: "warn"
	};
	if (item.complete) return {
		label: "Complete",
		tone: "ok"
	};
	const activity = item.activityId ? project.activities[item.activityId] : null;
	if (activity?.state === "COMPLETE") return {
		label: "Complete",
		tone: "ok"
	};
	if (activity?.state === "IN_PROGRESS") return {
		label: "Closing out",
		tone: "ok"
	};
	return {
		label: "Open",
		tone: "warn"
	};
}
function progressPercent(project) {
	const scope = Object.values(project.scopeItems).filter((item) => item.included && !phaseIsHeld(project, item.phase));
	if (scope.length > 0) {
		const done = scope.reduce((sumScore, item) => sumScore + scopeProgressWeight(project, item), 0);
		return Math.round(done / scope.length * 100);
	}
	let total = 0;
	let done = 0;
	for (const activity of Object.values(project.activities)) {
		if (phaseIsHeld(project, activity.phase)) continue;
		total += activity.durationLikely;
		if (activity.state === "COMPLETE") done += activity.durationLikely;
		else if (activity.state === "IN_PROGRESS") done += activity.durationLikely * .5;
	}
	if (total === 0) return 0;
	return Math.round(done / total * 100);
}
function nextMovement(project) {
	if (project.paused) return "PAUSED — whole job held";
	const inProgress = Object.values(project.activities).find((activity) => activity.state === "IN_PROGRESS" && !phaseIsHeld(project, activity.phase));
	if (inProgress) return inProgress.name;
	return Object.values(project.activities).find((activity) => activity.state !== "COMPLETE" && !phaseIsHeld(project, activity.phase))?.name ?? "No open live-path work";
}
function formatDay(iso) {
	if (!iso) return "Unknown";
	const [year, month, day] = iso.split("-").map(Number);
	if (!year || !month || !day) return "Unknown";
	return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC"
	});
}
function contractDates(project) {
	return {
		officialStart: formatDay(project.officialStart),
		intendedFinish: formatDay(project.intendedFinish),
		startKnown: Boolean(project.officialStart),
		finishKnown: Boolean(project.intendedFinish)
	};
}
function todayIso(now = /* @__PURE__ */ new Date()) {
	return now.toISOString().slice(0, 10);
}
function formatDayShort(iso) {
	return formatDay(iso).replace(/, \d{4}$/, "");
}
function addCalendarDays(iso, days) {
	const date = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
function inRange(iso, from, to) {
	return Boolean(iso && iso >= from && iso <= to);
}
function pushUnique(list, line) {
	if (!list.includes(line)) list.push(line);
}
function solveLine(activity, start) {
	const notes = activity.notes ?? "";
	if (/confirm in the field|field-confirm/i.test(notes)) return `Confirm ${activity.name} in the field`;
	if (/proposed co|not approved/i.test(notes)) return `Resolve ${activity.name} — still proposed`;
	if (activity.state === "NOT_STARTED" && start) return `Have ${activity.trade ?? activity.name} ready ${formatDayShort(start)}`;
	if (activity.state === "IN_PROGRESS") return `Keep ${activity.name} moving`;
	return null;
}
function cardGlance(project, asOf = todayIso()) {
	const until = addCalendarDays(asOf, 14);
	const window = [];
	for (const inspection of Object.values(project.job.inspections)) {
		if (inspection.status === "PASSED") continue;
		if (!inRange(inspection.date, asOf, until)) continue;
		window.push({
			id: `insp-${inspection.id}`,
			iso: inspection.date,
			when: formatDayShort(inspection.date),
			name: inspection.name,
			mark: inspection.status.replaceAll("_", " ").toLowerCase()
		});
	}
	for (const activity of Object.values(project.activities)) {
		if (activity.state === "COMPLETE") continue;
		const forecast = forecastActivity(project, activity);
		const iso = inRange(forecast.start, asOf, until) ? forecast.start : inRange(forecast.finish, asOf, until) ? forecast.finish : null;
		if (!iso) continue;
		window.push({
			id: activity.id,
			iso,
			when: formatDayShort(iso),
			name: activity.name,
			mark: activity.state === "IN_PROGRESS" ? "live" : iso === forecast.finish ? "due" : "starts"
		});
	}
	window.sort((a, b) => a.iso.localeCompare(b.iso) || a.name.localeCompare(b.name));
	const shown = window.slice(0, 4);
	const note = project.dashboardNote ?? "";
	const nextFromNote = /Next call:\s*(.+)$/i.exec(note)?.[1]?.trim();
	const solve = [];
	if (nextFromNote) pushUnique(solve, nextFromNote.slice(0, 140));
	if (project.paused) pushUnique(solve, "Decide whether the whole job stays paused");
	for (const inspection of Object.values(project.job.inspections)) if (inspection.status === "FAILED") pushUnique(solve, `Clear the ${inspection.name} fail before the next inspection`);
	for (const phase of heldPhasesOf(project)) pushUnique(solve, `${phase} held — do not release it`);
	const live = Object.values(project.activities).filter((activity) => {
		if (activity.state === "COMPLETE") return false;
		if (/complete/i.test(note) && activity.trade && note.toLowerCase().includes(activity.trade.toLowerCase())) return false;
		if (/complete/i.test(note) && note.toLowerCase().includes(activity.name.toLowerCase().split(" ")[0] ?? "###")) return false;
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
		now: project.paused ? "Whole job paused." : project.dashboardNote ?? nextMovement(project),
		progress: progressPercent(project),
		window: shown,
		windowHint: shown.length ? null : "Nothing dated in the next 14 days",
		solve
	};
}
function spokenBrief(project) {
	const pct = progressPercent(project);
	const next = nextMovement(project);
	const held = heldPhasesOf(project);
	const hold = held.length ? ` ${held.join(" and ")} held.` : "";
	const pause = project.paused ? " Whole job paused." : "";
	return `${project.name}. ${project.healthBand}. ${pct} percent. ${project.dashboardNote ?? project.projectType}${hold}${pause} Next: ${next}.`;
}
function matchWork(project, text) {
	const t = text.toLowerCase();
	const activityIds = [];
	const labels = [];
	for (const activity of Object.values(project.activities)) {
		if (activity.state === "COMPLETE") continue;
		const hay = `${activity.name} ${activity.trade ?? ""} ${activity.phase}`.toLowerCase();
		const tokens = [...new Set(hay.split(/[^a-z0-9]+/).filter((part) => part.length >= 4))];
		if (!(Boolean(activity.trade && t.includes(activity.trade.toLowerCase())) || tokens.some((token) => t.includes(token)))) continue;
		activityIds.push(activity.id);
		labels.push(activity.name);
	}
	const scopeIds = [];
	for (const item of Object.values(project.scopeItems)) {
		if (!item.included || item.complete) continue;
		const tokens = `${item.description} ${item.trade ?? ""} ${item.phase}`.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
		if (item.activityId && activityIds.includes(item.activityId) || tokens.some((token) => t.includes(token))) scopeIds.push(item.id);
	}
	return {
		activityIds,
		scopeIds,
		labels
	};
}
function matchClosedWork(project, text) {
	const doneClauses = text.split(/[,;]|\.(?:\s|$)/).map((part) => part.trim()).filter(Boolean).filter((part) => /\b(done|complete|completed|finished|closed)\b/i.test(part));
	if (doneClauses.length === 0) return /\b(done|complete|completed|finished|closed)\b/i.test(text) ? matchWork(project, text) : {
		activityIds: [],
		scopeIds: [],
		labels: []
	};
	const activityIds = [];
	const scopeIds = [];
	const labels = [];
	for (const clause of doneClauses) {
		const hit = matchWork(project, clause);
		for (const id of hit.activityIds) if (!activityIds.includes(id)) activityIds.push(id);
		for (const id of hit.scopeIds) if (!scopeIds.includes(id)) scopeIds.push(id);
		for (const label of hit.labels) if (!labels.includes(label)) labels.push(label);
	}
	return {
		activityIds,
		scopeIds,
		labels
	};
}
function nextCall(project, closingIds = []) {
	const remaining = Object.values(project.activities).filter((activity) => activity.state !== "COMPLETE" && !closingIds.includes(activity.id) && !phaseIsHeld(project, activity.phase));
	const next = remaining.find((activity) => activity.state === "IN_PROGRESS") ?? remaining[0];
	if (!next) return "No open live-path work.";
	return `Next call: ${next.name}`;
}
function splitUpdate(text) {
	const match = /\b(?:what'?s next[,:]?|next(?: call| up| is)?[,:]?|then|awaiting|waiting on|waiting for)\s+(.+)$/i.exec(text);
	if (!match || match.index === void 0) return {
		body: text,
		nextSaid: null
	};
	const body = text.slice(0, match.index).replace(/[,.]+$/, "").trim();
	const nextSaid = match[1].replace(/\bno budget.*$/i, "").trim();
	return {
		body: body || text,
		nextSaid: nextSaid.length > 1 ? nextSaid : null
	};
}
function jobBrief(project, asOf = todayIso()) {
	const glance = cardGlance(project, asOf);
	const weekAgo = addCalendarDays(asOf, -7);
	const last = project.events.filter((event) => event.occurredAt.slice(0, 10) >= weekAgo).slice(0, 5).map((event) => ({
		when: formatDayShort(event.occurredAt.slice(0, 10)),
		text: event.note
	}));
	return {
		now: glance.now,
		last,
		next: glance.solve.slice(0, 3)
	};
}
/**
* Drive drawing / scope references for the seven live jobs.
* Named files only. Unnamed PDFs that belong to other addresses stay unmatched.
* Visual Tradewalk sets found 2026-09-12 in Kalob / J&R Drive — recorded, not scaled.
*/
function driveFileUrl(fileId) {
	return `https://drive.google.com/file/d/${fileId}/view`;
}
function driveDocUrl(fileId) {
	return `https://docs.google.com/document/d/${fileId}/edit`;
}
function ref(id, name, kind, note, fileId, extra = {}) {
	return {
		id,
		name,
		kind,
		note,
		url: extra.url ?? driveFileUrl(fileId),
		fileId,
		issued: extra.issued ?? null,
		sheets: extra.sheets,
		previewSrc: extra.previewSrc ?? null,
		storedSrc: extra.storedSrc ?? null
	};
}
var DEBOARD_SHEETS = [
	{
		number: "A01",
		title: "Proposed 1st floor plan"
	},
	{
		number: "A02",
		title: "Proposed attic plan"
	},
	{
		number: "A03",
		title: "Foundation plan"
	},
	{
		number: "A04",
		title: "Elevations"
	},
	{
		number: "A05",
		title: "Building section"
	},
	{
		number: "A06",
		title: "Wall section detail"
	},
	{
		number: "A07",
		title: "Attic floor framing"
	},
	{
		number: "A08",
		title: "Roof framing plan"
	},
	{
		number: "A09",
		title: "Electric plan (garage)"
	},
	{
		number: "A10",
		title: "Electric plan (attic)"
	},
	{
		number: "A11",
		title: "Plumbing plan"
	},
	{
		number: "A15",
		title: "Wall framing"
	}
];
var CIURLIZZA_KITCHEN_SHEETS = [
	{
		number: "A01",
		title: "Existing floor plan"
	},
	{
		number: "A02",
		title: "Demo plan"
	},
	{
		number: "A03",
		title: "Proposed floor plan"
	},
	{
		number: "A04",
		title: "Framing plan"
	}
];
var CIURLIZZA_BASEMENT_SHEETS = [
	{
		number: "A01",
		title: "Existing floor plan"
	},
	{
		number: "A02",
		title: "Demo plan"
	},
	{
		number: "A03",
		title: "Proposed floor plan"
	},
	{
		number: "A04",
		title: "Framing plan"
	},
	{
		number: "A05",
		title: "Electric plan"
	},
	{
		number: "A06",
		title: "Plumbing plan"
	},
	{
		number: "A07",
		title: "3D view"
	},
	{
		number: "A08",
		title: "3D view"
	}
];
var MCMILLAN_PORCH_SHEETS = [
	{
		number: "A01",
		title: "Existing floor plan — porch 51'-9\" × 7'-8\""
	},
	{
		number: "A02",
		title: "Demo plan"
	},
	{
		number: "A03",
		title: "Proposed floor plan — porch 51'-7\" × 8'-6\""
	},
	{
		number: "A04",
		title: "Elevation — ~4.5\" risers, ~11\" treads, 6 steps"
	},
	{
		number: "A05",
		title: "3D capture"
	}
];
var CARVER_HALL_SHEETS = [
	{
		number: "A01",
		title: "Existing floor plan"
	},
	{
		number: "A02",
		title: "Demo plan — expand into office closet"
	},
	{
		number: "A03",
		title: "Proposed floor plan"
	},
	{
		number: "A04",
		title: "Framing / accessory placement"
	},
	{
		number: "A05",
		title: "Elevations — vanity / niche"
	},
	{
		number: "A06",
		title: "Electric plan"
	},
	{
		number: "A07",
		title: "Plumbing plan"
	},
	{
		number: "A08",
		title: "3D capture"
	}
];
var CARVER_MASTER_SHEETS = [
	{
		number: "A01",
		title: "Existing floor plan — keep tub surround"
	},
	{
		number: "A02",
		title: "Demo plan — keep vanity cabinets"
	},
	{
		number: "A03",
		title: "Proposed floor plan"
	},
	{
		number: "A04",
		title: "Framing / accessory placement"
	},
	{
		number: "A05",
		title: "Elevations"
	},
	{
		number: "A06",
		title: "Electric plan"
	},
	{
		number: "A07",
		title: "Plumbing plan"
	},
	{
		number: "A08",
		title: "3D capture"
	}
];
var DEBOARD_REFS = [
	ref("ev-tw", "Deboard Tradewalk Plans.pdf", "TRADEWALK", "A01–A11 + A15. Latest Drive copy Aug 14, 2026. Already the working set. Howler working sheets are drawn from this PDF — not a PE stamp.", "1C-TdtWpVnHL-VC5cSqxhCPK-f3iK9-_A", {
		issued: "June 12, 2025 · Drive copy Aug 14, 2026",
		sheets: DEBOARD_SHEETS,
		previewSrc: "/plans/deboard-a01.png",
		storedSrc: "/evidence/deboard/Deboard-Tradewalk-Plans.pdf"
	}),
	ref("ev-tw-early", "plans.pdf", "TRADEWALK", "Same Deboard Tradewalk set, earlier Drive copy (July 23, 2026). Title is only “plans.pdf”. Latest copy is Deboard Tradewalk Plans.pdf.", "17-Yqnx23N7_zNQ2HRyh5sibt4ogSky1z", {
		issued: "June 12, 2025 · Drive copy July 23, 2026",
		sheets: DEBOARD_SHEETS
	}),
	ref("ev-calcs", "Deboard Calcs.pdf", "CALCS", "Murphy LVL B1/B2/B3. 8/17/2026. Coordinated with A07.", "1JYq2cDF9qU8i8buH_R2Cs3MzbsoK0IXt", { issued: "August 17, 2026" }),
	ref("ev-framing", "David S Deboard Framing.pdf", "FRAMING", "Stanfield framing. Cites A01.", "1McP71m1fOMUaTaOhcCpS7-Dh7hGMpvS8", { issued: "July 21, 2026" }),
	ref("ev-scope", "David S Deboard scope.pdf", "SCOPE", "Stanfield scope PDF. Howler copy stored. Original stays in Drive.", "1uRoUzf29EXsTgQ4ygmzw0a_VwMx34NFL", { storedSrc: "/evidence/deboard/David-S-Deboard-scope.pdf" }),
	ref("ev-sow-rules", "Scope of Work and Rules", "SCOPE", "Deboard job rules + full garage SOW. Copied from the Drive Google Doc into Howler. Original not deleted.", "1b2ADEtIfjbPik8d1UC6hhR5yTC7FAKENTN38Mbu1aBE", {
		url: driveDocUrl("1b2ADEtIfjbPik8d1UC6hhR5yTC7FAKENTN38Mbu1aBE"),
		issued: "August 6, 2026",
		storedSrc: "/evidence/deboard/sow-and-rules.txt"
	}),
	ref("ev-site-adu", "Deboard Site Plan", "SITE", "Google Doc: “Sweet Spot Design – 34' × 36' detached structure,” 10:12, guest suite. Design 2 ADU narrative. NOT governing. Working set is Tradewalk A01–A11 + A15 (37'-4 7/8\" × 30'-0 1/16\", 8/12).", "1eLDzo5bXYRcOJJTf-t8dv2UhdBHnpg4qn0jvmpyDyVA", {
		url: driveDocUrl("1eLDzo5bXYRcOJJTf-t8dv2UhdBHnpg4qn0jvmpyDyVA"),
		issued: "June 3, 2026"
	}),
	ref("ev-mars", "John_Mars_Deboard_Labor_Estimate_2026-08-06.pdf", "ESTIMATE", "John Marr / Mars labor estimate. Not a drawing. Framing confirmation still pending.", "1v-9jgd7YIl5ppNDLWIRkn9Rxr_-rx6Oy", { issued: "August 6, 2026" })
];
var CIURLIZZA_REFS = [
	ref("ev-kitchen-tw", "KITCHEN PLANS 4.29.pdf", "TRADEWALK", "Ciurlizza Residence, 740 Andover Village Dr, Lexington KY 40509. Apr 29, 2026. Visual remodel set: existing / demo / proposed / framing. Rooms named Dining, Kitchen, Living, Foyer, Office, Bathroom, Bedroom, Mud Room. Callouts: install beam as needed for removed posts, pocket doors, bay window, new exterior door. Envelope not adopted — existing house. Yeiser remains the structural correction reference.", "1EyEzJUUeO5gdFXLDXTONGiKLXrNUoWw4", {
		issued: "April 29, 2026",
		sheets: CIURLIZZA_KITCHEN_SHEETS,
		storedSrc: "/evidence/ciurlizza/KITCHEN-PLANS-4.29.pdf"
	}),
	ref("ev-basement-tw", "BASEMENT PLANS 4.29.pdf", "TRADEWALK", "Same job, basement visual set. Apr 29, 2026. A01–A08 including electric, plumbing, 3D. Frame for egress window. Greenwich recessed doors tagged. Envelope not adopted.", "1GinRFtl0SUO1rfyK6hNgpsmAYQc7-Ybw", {
		issued: "April 29, 2026",
		sheets: CIURLIZZA_BASEMENT_SHEETS,
		storedSrc: "/evidence/ciurlizza/BASEMENT-PLANS-4.29.pdf"
	}),
	ref("ev-yeiser", "260215 Ciurlizza Residence — YEISER MARKUPS.pdf", "STRUCTURAL", "Yeiser Structural. Feb 26, 2026. Demo A02 + framing A04. LVL 5.25×16, LVL 3.5×9.25, 2x6 fur-out, bay window, pocket doors, egress window. Existing steel beams FIELD VERIFY. Not a field measurement.", "1Gb3lQUTziyD9gYb-QFhaJLHRDZDv-W21", { issued: "February 26, 2026" }),
	ref("ev-yeiser-1f", "260215 Ciurlizza — UPDATED 1ST FLOOR FRAMING YEISER MARKUPS.pdf", "STRUCTURAL", "Updated first-floor framing. Flush LVL 5.25×16. LUS210 hangers. Existing (3) 2x10 w/ 1\" steel plate FIELD VERIFY. 16'-0\" span field verify.", "1wCAhYN0ywbxh1zyoFrqnruwUtipW_TCg", { issued: "June 19, 2026 Drive copy" }),
	ref("ev-beam", "David S cuilizza beam.pdf", "FRAMING", "Stanfield beam PDF. Filename misspells Ciurlizza.", "12-GZMjvKGjH7Zx7prA61TdkvGYte0ZrO"),
	ref("ev-window", "David S Window Repair Kitchen.pdf", "UPLOAD", "Kitchen window repair. Not a full set.", "1HDEruPtI4QA_TMKBHIutejRf95Or7QqO"),
	ref("ev-andover-scan", "740 ANDOVER VILLAGE DR.pdf", "SITE", "Address-named PDF. Scan/encoded text — Howler could not read dimensions from it. Not used as geometry.", "1gEx134r-8ZJxyHnFEYlf_JN99HffNBdr", { issued: "May 21, 2026" }),
	ref("ev-jr-andover-quote", "J&R Andover Village Quote.docx", "QUOTE", "J&R quote for Andover Village / Ciurlizza. Word file — recorded as a reference, not a drawing.", "1j64g7_h1reJbUWTnaND-LTfQWKsf7nwr", { issued: "June 3, 2026" }),
	ref("ev-jr-carpet", "J&R - Ciurlizza Carpet.PDF", "QUOTE", "J&R carpet quote for Ciurlizza. Not a floor plan.", "1DSgRAMxOBKkcKITlskFq_6BPXkYdOTpp", { issued: "May 12, 2026" }),
	ref("ev-basement-sow", "BASEMENT Scope of Work.docx", "SCOPE", "Ciurlizza Job Rules + basement remodel SOW. Howler copy stored as text. Original Word file stays in Drive.", "1TciKJikhzH7l_ACiu30XpXC5f0DTDKyS", {
		issued: "February 26, 2026",
		storedSrc: "/evidence/ciurlizza/basement-sow-and-rules.txt"
	})
];
var MCMILLAN_REFS = [
	ref("ev-porch-tw", "McMillanPorchsheet2.pdf", "TRADEWALK", "McMillans, 109 Caveson Way. Oct 20, 2025. Visual porch Tradewalk: A01 existing 51'-9\" × 7'-8\" porch, A02 demo, A03 proposed 51'-7\" × 8'-6\" porch, A04 elevation (~4.5\" risers, ~11\" treads, 6 steps, ~26.5\" deck height, ~29 3/8\" retaining wall), A05 3D. House overall on the sheet is not adopted as a new envelope. Interior remains paused.", "1XL_H9kvJRhqTcaiI2QCLqSSVRkCNUEmF", {
		issued: "October 20, 2025",
		sheets: MCMILLAN_PORCH_SHEETS
	}),
	ref("ev-kitchen-plan", "McMillanKitchen.plan", "UPLOAD", "Chief Architect .plan file. Binary — recorded as a reference. Howler cannot parse .plan geometry.", "1f_vGg0lCXRh6cZNYCpgH12lmcPkKOVL3", { issued: "June 4, 2026" }),
	ref("ev-sow", "McMillan Scope of Work.pdf", "SCOPE", "Porch + interior SOW. Howler copy stored. Interior remains paused pending Stanfield vs Saul.", "1GvMWbPcIp7ToRujSqh6v9kN_oQqkX88W", { storedSrc: "/evidence/mcmillan/McMillan-Scope-of-Work.pdf" }),
	ref("ev-proposal", "McMillan Proposal.docx", "SCOPE", "Proposal file. Binary — recorded as a reference, not parsed as a drawing.", "1aoQxqcHSFIm_dZsu1r-JZAFmeYmL0aSF"),
	ref("ev-binder", "McMillan Binder.docx", "SCOPE", "Binder. Not a floor plan.", "13mORwPJkAjkEVbp0gokrrd1P1lcRf-Of"),
	ref("ev-stanfield-int", "David S McMillan interior entire scope (not finish drywall)", "ESTIMATE", "Stanfield interior estimate, prepared for J&R construction (info@jrcsi.com). Drive copy Sep 10, 2026. Demo / framing / LVT / shower curb named. Dollar total not extracted (garbled). Interior stays paused until compared against Saul. Howler will not invent the number.", "1H2ooQ1jaFwxeJSLLhNqgkABHFcjKlDbo", { issued: "September 9, 2026" }),
	ref("ev-ceiling-co", "David S Mcmillan Ceiling change order.pdf", "ESTIMATE", "Stanfield ceiling change order. Not an approved CO in Howler — recorded as a file. Pending never inflates Revised.", "1pDSmSY1-4YLDRav8Y9BLvD2XRN_x382A", { issued: "September 3, 2026" })
];
var CARVER_REFS = [
	ref("ev-hall-tw", "hall design.pdf", "TRADEWALK", "Carver/Julian Residence, 1035 Wil Rose Ln, Versailles KY 40383. June 4, 2026. Upstairs hall bath A01–A08: existing / demo (expand into office closet) / proposed / framing-accessories / elevations / electric / plumbing / 3D. Howler copy stored. Drive original not deleted.", "1XZiJGbYQZ7cDB4a9WSX2kfULKXbFGb29", {
		issued: "June 4, 2026 · Drive copy Sep 2, 2026",
		sheets: CARVER_HALL_SHEETS,
		previewSrc: "/plans/carver/hall-bath-floor.png",
		storedSrc: "/evidence/carver/hall-design.pdf"
	}),
	ref("ev-master-tw", "master design.pdf", "TRADEWALK", "Same job, master bath. June 4, 2026. Keep tub surround and vanity cabinets. Demo shower tile/door, vanity top, toilet. A01–A08. Howler copy stored.", "1xaOsa5uL-xUytU0DVlcQVXzIVwX2PdpI", {
		issued: "June 4, 2026 · Drive copy Sep 2, 2026",
		sheets: CARVER_MASTER_SHEETS,
		previewSrc: "/plans/carver/master-bath-floor.png",
		storedSrc: "/evidence/carver/master-design.pdf"
	}),
	ref("ev-sow", "Carver/Julian Scope of Work and Rules.docx", "SCOPE", "Master + upstairs bath SOW and job rules. Copied into Howler as text. Original Word file stays in Drive.", "1K3KQLeLZc0S8P1uPs0YQKjBMFD2IRLjh", {
		issued: "September 2, 2026",
		storedSrc: "/evidence/carver/sow-and-rules.txt"
	}),
	ref("ev-inv-1", "Davud S Invoice Carver.pdf", "ESTIMATE", "Stanfield invoice 1. Filename misspells David. Not a drawing.", "1AxV921luzqf0JxuikysWUvQmjyCaVjPh", { issued: "July 19, 2026" }),
	ref("ev-inv-2", "David S invoice 2 carver.pdf", "ESTIMATE", "Stanfield invoice 2. Not a drawing.", "1SnYhL_TVpBVFoPokzQVEytTQN126nKdV", { issued: "July 19, 2026" }),
	ref("ev-inv-3", "David S Carver invoice 3.pdf", "ESTIMATE", "Stanfield invoice 3. Not a drawing.", "1rL7aEPRkVXw6gxP-aOC4KsQDmQ2uYPhT", { issued: "July 19, 2026" })
];
var STEWART_REFS = [ref("ev-tile", "Stewart Tile.pdf", "QUOTE", "Tile quote named Stewart. Not a floor plan. Geometry stays Unknown.", "1sUCv_w4RxBpqqndMjHFfwp-XYEWHKtmw", { issued: "January 22, 2026" })];
var SWIDERSKI_REFS = [ref("ev-tile", "David S Swiderski tile quote.pdf", "QUOTE", "Stanfield tile quote for Swiderski. Not a floor plan. Geometry stays Unknown.", "1u6gq7iSKCXI0ykC7dEN9YZ4uSQ6X3kUH", { issued: "August 4, 2026" })];
var PRATT_REFS = [];
var UNMATCHED_DRIVE_PLANS = [
	{
		name: "TRADEWALK PLANS.pdf",
		address: "North Residence — 3910 Old Frankfort Pike, Versailles, KY 40383",
		note: "July 31, 2026. Visual Tradewalk: foundation / first floor / second floor / elevations. Crawl + garage slab, option dog run. Not one of the seven live jobs. Howler will not hang it on Pratt or DeBoard.",
		fileId: "17JdVC50ZKYReYa6SrxAyZUZkH_7kueYb",
		kind: "TRADEWALK",
		issued: "July 31, 2026",
		sheets: [
			{
				number: "A01",
				title: "Slab / crawl space foundation"
			},
			{
				number: "A02",
				title: "Foundation plan"
			},
			{
				number: "A03",
				title: "First floor plan"
			}
		]
	},
	{
		name: "Garrison Plans.pdf",
		address: "Garrison Residence — 645 Montclair Dr, Lexington, KY 40502",
		note: "Aug 11, 2026. Visual set: existing floor, proposed options 1 and 2, electric, plumbing. Highlighted walls are new construction. Not in the live portfolio.",
		fileId: "1as2lduM3H1sAxloshZN1zNsn5zqezKCs",
		kind: "TRADEWALK",
		issued: "August 11, 2026",
		sheets: [
			{
				number: "A01",
				title: "Existing floor plan"
			},
			{
				number: "A02",
				title: "Proposed floor plan (option 1 / option 2)"
			},
			{
				number: "A03",
				title: "Electric plan"
			},
			{
				number: "A04",
				title: "Plumbing plan"
			}
		]
	},
	{
		name: "FLOOR PLAN.pdf",
		address: "Garrison Residence — 645 Montclair Dr, Lexington, KY 40502",
		note: "Aug 11, 2026. A01 only — same Garrison job as Garrison Plans.pdf. Not in the live portfolio.",
		fileId: "1Z7JbeLvvHEixxTDexP2nTtvRzSCa9_mO",
		kind: "TRADEWALK",
		issued: "August 11, 2026",
		sheets: [{
			number: "A01",
			title: "Floor plan"
		}]
	},
	{
		name: "GANZEL PLANS REVISED.pdf",
		address: "Ganzel Residence — 115 Creek Rock Cir, Nicholasville, KY 40356",
		note: "Aug 5, 2026. Visual Tradewalk: site, floor, foundation, wall details, roof framing, electric, 3D. 2x6 rafters 16\" O.C., 5/12 vaulted gable + 1/12 shed. Sauna / cupola electric notes. Not a live Howler job.",
		fileId: "1xHTvHN3eFjTix-JGw_wQBsljwQanYT4j",
		kind: "TRADEWALK",
		issued: "August 5, 2026",
		sheets: [
			{
				number: "A01",
				title: "Site plan"
			},
			{
				number: "A02",
				title: "Floor plan"
			},
			{
				number: "A03",
				title: "Foundation plan"
			},
			{
				number: "A04",
				title: "Building details"
			},
			{
				number: "A05",
				title: "Roof framing plan"
			},
			{
				number: "A06",
				title: "Electric plan"
			},
			{
				number: "A07",
				title: "3D captures"
			}
		]
	},
	{
		name: "J&R Revised .pdf",
		address: "Ganzel — 21' × 20' pad (William Welch / Charlotte Construct)",
		note: "Sep 3, 2026. Named J&R Revised — it is a Ganzel site-work / 4,000 PSI pad quote, not a floor plan. $9,000 full pad vs $3,150 site-work-only. Not hung on a live job.",
		fileId: "1a14GFyQsMUNWI4eCHgEUh8R2hKWVm-Vz",
		kind: "QUOTE",
		issued: "September 3, 2026"
	},
	{
		name: "Plans - REVISED 7.29.pdf",
		address: "Tyler Residence — 2217 Savannah Ln, Lexington, KY 40513",
		note: "July 29, 2026. Visual Tradewalk: existing / demo / proposed / framing / elevations / fireplace / electric / 3D / site. Deck rebuild, keep existing structure. Not a live Howler job.",
		fileId: "1IxTqeiGoExro4DKsUaIk_ImobA1hmp6k",
		kind: "TRADEWALK",
		issued: "July 29, 2026",
		sheets: [
			{
				number: "A01",
				title: "Existing floor plan"
			},
			{
				number: "A02",
				title: "Demo plan"
			},
			{
				number: "A03",
				title: "Proposed floor plan"
			},
			{
				number: "A04",
				title: "Framing plan"
			},
			{
				number: "A05",
				title: "Elevations"
			},
			{
				number: "A06",
				title: "Fireplace details"
			},
			{
				number: "A07",
				title: "Electric plan"
			},
			{
				number: "A08",
				title: "3D capture"
			},
			{
				number: "A09",
				title: "Site plan"
			}
		]
	},
	{
		name: "Tyler, Chris - Builder Set Plans 10.01.25.pdf",
		address: "Tyler / Chris — builder set",
		note: "Oct 1, 2025 builder set. Drive would not extract text. Same Tyler family as Plans - REVISED 7.29.pdf. Not a live job.",
		fileId: "1Czra7N2F7Y7bxl90KNOc925D1PqTLfaB",
		kind: "TRADEWALK",
		issued: "October 1, 2025"
	},
	{
		name: "Plans.pdf",
		address: "Gainesway Small Animal Clinic — 1230 Armstrong Mill Rd, Lexington, KY 40517",
		note: "June 7, 2025. Clinic remodel visual set (exam rooms, kennels, parking). Not a residence and not a live Howler job.",
		fileId: "1Uq21Cxb6iE_JjFeto-cN8rHNKYgMzfx4",
		kind: "TRADEWALK",
		issued: "June 7, 2025",
		sheets: [
			{
				number: "A03",
				title: "Proposed floor plan"
			},
			{
				number: "A04",
				title: "Parking layout"
			},
			{
				number: "A05",
				title: "Building section"
			},
			{
				number: "A06",
				title: "Electric plan"
			}
		]
	},
	{
		name: "Craven Floor Plan.plan",
		address: "Craven — Chief Architect source",
		note: "Mar 21, 2026 .plan file plus Design 1–3 and Design 4. Binary. Not parsed. Not a live job.",
		fileId: "1OYImSULYMEHDNb_iXd7ZmHTsVdbhdpT_",
		kind: "UPLOAD",
		issued: "March 21, 2026"
	}
];
var JR_PROCESS_REFS = [ref("ev-jr-howto", "J&R How To Plan A Remodel.pptx", "PROCESS", "J&R company visual planning deck (jalyn, Mar 30, 2026). How to plan a remodel — process, not a job drawing. 28 MB presentation.", "1rnvg2eD7HCIosVWTOISBnWXdLyD1uWvg", { issued: "March 30, 2026" }), ref("ev-jr-4000", "J&R 4000 (1).pdf", "QUOTE", "Invoice TO J&R Construction (1035 Wil Rose Lane) from MG Remodeling, June 27, 2026. Bathroom framing + drywall. Job address not named on the invoice. Not hung on a live card.", "1bk98LD9fpPLSclPRm_fWZaJAPAObmX3k", { issued: "June 27, 2026" })];
var DEBOARD_WORKING_PREVIEWS = [
	{
		number: "A01",
		title: "Proposed 1st floor",
		src: "/plans/deboard-a01.png"
	},
	{
		number: "A04",
		title: "Elevations",
		src: "/plans/deboard-a04.png"
	},
	{
		number: "A06",
		title: "Wall section",
		src: "/plans/deboard-a06.png"
	},
	{
		number: "A07",
		title: "Attic framing",
		src: "/plans/deboard-a07.png"
	},
	{
		number: "A15",
		title: "Wall framing",
		src: "/plans/deboard-a15.png"
	}
];
function ciurlizzaBlueprint() {
	return {
		...emptyBlueprint(),
		county: "Fayette",
		occupancy: "DWELLING",
		stories: 2,
		envelopeProvenance: "UNKNOWN",
		drawingStatus: "REVIEWED",
		drawingScale: "1/4",
		dimDatum: "FACE_FRAMING",
		studSize: "2x6",
		openings: [],
		rooms: {},
		evidence: CIURLIZZA_REFS,
		notes: "Visual remodel set in Drive: KITCHEN PLANS 4.29.pdf and BASEMENT PLANS 4.29.pdf (Apr 29, 2026) — existing/demo/proposed/framing plus basement electric/plumbing/3D. Yeiser Structural markups (Feb 26, 2026) remain the correction reference for the failed Fayette inspection. Existing house — envelope not a new box. Yeiser: field-verify assumed framing, dimensions, and existing steel. LVL 5.25×16 flush beam; LVL 3.5×9.25 header; (4) 2x6 or LVL 1.5×3.5 stud packs; 2x6 wall to fur out for plumbing; Versa-Lam LVL 2.1E 3100 SP; SYP #2 min. Temporary shoring by contractor. Tags include 2868, 5068, 2468, W3561, 3050DH — walls not placed. FRAME FOR NEW BAY WINDOW, EGRESS WINDOW, POCKET DOOR ×2 — sizes Unknown. Failed Fayette inspection is the live gate. These sheets are not a passed stamp."
	};
}
function mcmillanBlueprint() {
	return {
		...emptyBlueprint(),
		occupancy: "DWELLING",
		stories: 2,
		envelopeProvenance: "UNKNOWN",
		drawingStatus: "REVIEWED",
		drawingScale: "1/4",
		dimDatum: "FACE_FRAMING",
		evidence: MCMILLAN_REFS,
		notes: "McMillanPorchsheet2.pdf (Oct 20, 2025) is the visual porch Tradewalk for 109 Caveson Way. A01 existing porch 51'-9\" × 7'-8\". A03 proposed porch 51'-7\" × 8'-6\". A04 ~4.5\" risers, ~11\" treads, 6 steps, ~26.5\" deck height. House overall on that sheet is not adopted as a new box. McMillanKitchen.plan is a Chief Architect file — not parsed. Exterior is closing out. Interior remains held pending Stanfield vs Saul. Geometry besides the named porch stays Unknown."
	};
}
function mcmillanScope() {
	const item = (id, description, phase, included, notes, trade = null, activityId = null) => ({
		id,
		description,
		phase,
		trade,
		included,
		complete: false,
		activityId,
		allowanceLineId: null,
		notes,
		fromBaseline: true
	});
	return {
		"scp-porch": item("scp-porch", "Phase 1 front porch repairs", "Closeout", true, "SOW §2 + McMillanPorchsheet2.pdf A03 proposed 51'-7\" × 8'-6\" porch. Walkway, pavers herringbone, curved steps, brick planter walls. Owner: exterior is closing out — not marked complete.", "Masonry", "act-porch"),
		"scp-concrete": item("scp-concrete", "Concrete platform and sidewalk", "Closeout", true, "KF Sep 3 IN_PROGRESS. Stamp/color. Field-confirm before complete.", "Concrete", "act-concrete"),
		"scp-elec": item("scp-elec", "Bonham Electric circuit correction", "Electrical", true, "Light-pole / water-heater shared circuit. Proposed CO $600. Revised unchanged until approved.", "Electrical", "act-elec"),
		"scp-ceiling": item("scp-ceiling", "Porch-ceiling renovation", "Closeout", true, "Approval / committed dates not yet given.", "Carpentry", "act-ceiling"),
		"scp-columns": item("scp-columns", "Porch columns to match rear / column paint", "Closeout", true, "Material and size to be confirmed. Cracked-column reply still unverified to client.", "Masonry", "act-columns"),
		"scp-builtin": item("scp-builtin", "Upstairs hallway glass-front built-in", "Interior", false, "Interior — held pending Stanfield vs Saul.", "Cabinetry", "act-compare"),
		"scp-island": item("scp-island", "Kitchen island for 36\" cooktop + butcher block", "Interior", false, "Interior — held. Green cabinet finish, door style TBD.", "Cabinetry", "act-compare"),
		"scp-bath": item("scp-bath", "Master bath renovation", "Interior", false, "Interior — held. Walk-in shower, heated floor, client-provided tile/fixtures.", "Tile", "act-compare"),
		"scp-closet": item("scp-closet", "Master closet reconfiguration", "Interior", false, "Interior — held. Closet system allowance $5,000.", "Closets", "act-compare"),
		"scp-floor": item("scp-floor", "Master bedroom flooring", "Interior", false, "Interior — held. Remove LVT, client-supplied flooring.", "Flooring", "act-compare")
	};
}
function carverBlueprint() {
	return {
		...emptyBlueprint(),
		county: "Woodford",
		occupancy: "DWELLING",
		stories: 2,
		envelopeProvenance: "UNKNOWN",
		drawingStatus: "REVIEWED",
		drawingScale: "1/4",
		dimDatum: "FACE_FINISH",
		evidence: CARVER_REFS,
		notes: "Carver/Julian, 1035 Wil Rose Ln, Versailles KY 40383. Two Tradewalk sets copied into Howler: hall design.pdf (upstairs bath, expand into office closet) and master design.pdf (keep tub surround + vanity cabinets). June 4, 2026. Existing house — envelope not a new box. Remaining field work is electrical finals, Artistic vanities, Gatsby Glass. These sheets are not a PE stamp."
	};
}
var CARVER_WORKING_PREVIEWS = [
	{
		number: "MB",
		title: "Master bath floor",
		src: "/plans/carver/master-bath-floor.png"
	},
	{
		number: "MB3D",
		title: "Master bath capture",
		src: "/plans/carver/master-bath-1.png"
	},
	{
		number: "HB",
		title: "Hall bath floor",
		src: "/plans/carver/hall-bath-floor.png"
	},
	{
		number: "HB3D",
		title: "Hall bath capture",
		src: "/plans/carver/hall-bath-1.png"
	}
];
function emptyEvidenceBlueprint(refs, notes) {
	return {
		...emptyBlueprint(),
		evidence: refs,
		notes
	};
}
var TRADEWALK = {
	source: "Deboard Tradewalk Plans.pdf",
	issued: "June 12, 2025",
	job: "DEBOARD RESIDENCE",
	addressLine: "227 MARENGO DR.",
	cityLine: "RICHMOND, KY 40475",
	county: "Madison",
	occupancy: "GARAGE_WITH_HABITABLE",
	stories: 2,
	/** A01 overall — 37'-4 7/8" */
	overallWidthIn: 448.875,
	/** A01 / A03 — 30'-0 1/16" */
	overallDepthIn: 360.0625,
	/** Garage bay = overall − mower shed = 26'-0" */
	garageWidthIn: 312,
	garageDepthIn: 360.0625,
	/** A01 + Stanfield citing A01 — 11'-4 7/8" × 10'-8 1/2" */
	shedWidthIn: 136.875,
	shedDepthIn: 128.5,
	/** A05 callout + Stanfield first-floor walls */
	eaveHeightIn: 120,
	roofRise: 8,
	roofRun: 12,
	roofStyle: "GABLE",
	/** A06 wall section */
	studSize: "2x4",
	studSpacingIn: 16,
	joistSize: "2x12",
	joistSpacingIn: 16,
	rafterSize: "2x8",
	rafterSpacingIn: 16,
	joistDirection: "WIDTH",
	overhangIn: 12,
	drawingScale: "1/8",
	insulation: {
		wall: "R-13 min.",
		floor: "R-19 min. in floor joists",
		roof: "R-38 min. at rafters",
		slab: "R-10 2\" rigid"
	},
	foundation: {
		footing: "12x24 concrete footing",
		block: "12\" block brick ledge + 8\" top block",
		sill: "Treated sill plate, cast-in-place anchor bolts",
		drain: "4\" HDPE drain, filter fabric, coarse gravel",
		slab: "Concrete slab, vapor barrier, 4\" gravel",
		pier: "2'×2'×2' pier to support LVL beam (A03)",
		thicken: "Thicken pad for wall supporting floor joists (A03)"
	},
	matchExisting: [
		"Soldier course to match existing house (A04)",
		"Quoins on corners to match existing house (A04)",
		"Eave return to match existing house (A04)",
		"Adjust shed height as needed for drop in grade (A04)",
		"Slope ground away 5% for 10' (A06)",
		"Brick veneer, metal ties 16\" vertically and 16\" horizontally (A06)",
		"1\" air gap, Tyvek house wrap (A06)"
	],
	lvls: [
		"B1 Murphy 2.0E 1.75×20 4-ply LVL — ~24' girder, PASSED (Calcs 8/17/2026)",
		"B2 Murphy 2.0E 1.75×20 3-ply LVL — ~20'-1 1/2\", PASSED",
		"B3 Murphy 2.0E 1.75×20 4-ply LVL — ~8'-3 1/2\", PASSED",
		"Floor live 40 psf / dead 12 psf, IRC 2018, second floor. ASD. Valid until 4/2/2029.",
		"Add LVL beam to support floor joists (A07)",
		"Add post to support LVL in stairwell wall (A07)"
	],
	/** A07 overall to outside of framing (brick veneer is outside this). */
	framingOuterWidthIn: 440,
	framingOuterDepthIn: 351.1875,
	openingsUnknown: "A09 shows two garage-door openers (double + single per Scope). Leaf widths are not dimensioned on A01 — enter them. Man doors tagged 2868 (2'-8\"×6'-8\"). Windows tagged 2840DH. A01 also tags SB3621 twice — 3'-6\"×2'-1\" by the same cipher as 2868. Type (SB) and wall stay Unknown. Not an OHD. Not a Simpson SSTB36 holdown bolt.",
	electric: {
		garage: [
			"Two garage-door openers (A09) — leaf widths Unknown",
			"Add outlets per code (A09) — count not dimensioned",
			"Option for electric car charger (A09)"
		],
		attic: [
			"Add lighting in unfinished attic space (A10)",
			"Dimmer on can-light switch (A10)",
			"Switch at bottom of stairs for stairwell lighting (A10)",
			"Electric for HVAC mini-split (A10)",
			"3-way switching at stair (A10)"
		]
	},
	plumbing: [
		"Option: half bath in garage for pool access (A11)",
		"CL 17'-3\", CL 1'-6\", CL 1'-7\" recorded on A11 — confirm what they measure",
		"No fixture schedule on the set — not invented"
	],
	sheetIndex: [
		{
			number: "A01",
			title: "PROPOSED 1ST FLOOR PLAN",
			drawn: true
		},
		{
			number: "A02",
			title: "PROPOSED ATTIC PLAN",
			drawn: true
		},
		{
			number: "A03",
			title: "FOUNDATION PLAN",
			drawn: true
		},
		{
			number: "A04",
			title: "ELEVATIONS",
			drawn: true
		},
		{
			number: "A05",
			title: "BUILDING SECTION",
			drawn: true
		},
		{
			number: "A06",
			title: "WALL SECTION DETAIL",
			drawn: true
		},
		{
			number: "A07",
			title: "ATTIC FLOOR FRAMING",
			drawn: true
		},
		{
			number: "A08",
			title: "ROOF FRAMING PLAN",
			drawn: true
		},
		{
			number: "A09",
			title: "ELECTRIC PLAN (GARAGE)",
			drawn: true
		},
		{
			number: "A10",
			title: "ELECTRIC PLAN (ATTIC)",
			drawn: true
		},
		{
			number: "A11",
			title: "PLUMBING PLAN",
			drawn: true
		},
		{
			number: "A12–A14",
			title: "3D CAPTURE",
			drawn: false
		},
		{
			number: "A15",
			title: "WALL FRAMING",
			drawn: true
		}
	],
	sheets: [
		{
			id: "L1",
			number: "A01",
			title: "PROPOSED 1ST FLOOR PLAN"
		},
		{
			id: "L2",
			number: "A02",
			title: "PROPOSED ATTIC PLAN"
		},
		{
			id: "FDN",
			number: "A03",
			title: "FOUNDATION PLAN"
		},
		{
			id: "EL",
			number: "A04",
			title: "ELEVATIONS"
		},
		{
			id: "SEC",
			number: "A05",
			title: "BUILDING SECTION"
		},
		{
			id: "WALL",
			number: "A06",
			title: "WALL SECTION DETAIL"
		},
		{
			id: "JOIST",
			number: "A07",
			title: "ATTIC FLOOR FRAMING"
		},
		{
			id: "ROOF",
			number: "A08",
			title: "ROOF FRAMING PLAN"
		}
	]
};
function citesTradewalk(bp) {
	return Boolean(bp.notes && /tradewalk/i.test(bp.notes));
}
/** A01 tag SB3621 ×2. Same 4-digit cipher as 2868 / 2840DH. Not a Simpson connector. */
var SB3621 = {
	tag: "SB3621",
	count: 2,
	widthIn: 42,
	heightIn: 25,
	kind: "WINDOW",
	notes: "A01 tag. Size inferred from 2868 cipher (3'-6\" × 2'-1\"). Operation SB and wall Unknown. Not an OHD. Not Simpson SSTB36 (36-7/8\" holdown bolt)."
};
function sb3621Summary() {
	return [
		"SB3621 is an A01 opening tag, not a structural connector.",
		"Same cipher as 2868 and 2840DH: 36 21 → 3'-6\" wide × 2'-1\" high (42\" × 25\").",
		"Height 2'-1\" reads as a short window (transom / awning / hopper / utility) — not a man door and not an overhead door.",
		"Prefix SB is the operation code. It is not confirmed (slider vs single-hung vs catalog name). Howler will not invent the type.",
		"Tagged twice. Walls and offsets were not dimensioned — not placed on the plan.",
		"Not Simpson SSTB36 (that's a 36-7/8\" cast-in-place holdown bolt, ESR-2611) and not an HDB holdown.",
		"Say “SB3621 on the left” (or front / back / right / shed) to place one. Size stays INFERRED from the tag until you verify."
	].join(" ");
}
function room(partial) {
	return partial;
}
function tradewalkBlueprint() {
	const t = TRADEWALK;
	const openings = [
		{
			id: "op-man-2868-a",
			kind: "MAN",
			wall: "FRONT",
			widthIn: 32,
			heightIn: 80,
			offsetIn: 12,
			sillIn: 0,
			headerSize: "2x10",
			tag: "2868",
			provenance: "VERIFIED",
			offsetProvenance: "PROPOSED",
			datum: "FACE_FRAMING",
			notes: "A01 tag 2868 — 2'-8\" × 6'-8\". Offset is a placeholder — confirm."
		},
		{
			id: "op-man-2868-b",
			kind: "MAN",
			wall: "RIGHT",
			widthIn: 32,
			heightIn: 80,
			offsetIn: 24,
			sillIn: 0,
			headerSize: "2x10",
			tag: "2868",
			provenance: "VERIFIED",
			offsetProvenance: "PROPOSED",
			datum: "FACE_FRAMING",
			notes: "Second A01 tag 2868. Wall/offset not dimensioned — confirm."
		},
		{
			id: "op-win-2840-a",
			kind: "WINDOW",
			wall: "LEFT",
			widthIn: 32,
			heightIn: 48,
			offsetIn: 72,
			sillIn: 36,
			headerSize: "2x10",
			tag: "2840DH",
			provenance: "VERIFIED",
			offsetProvenance: "PROPOSED",
			datum: "FACE_FRAMING",
			notes: "A01 tag 2840DH — 2'-8\" × 4'-0\" double-hung. Wall is typical — confirm."
		},
		{
			id: "op-win-2840-b",
			kind: "WINDOW",
			wall: "BACK",
			widthIn: 32,
			heightIn: 48,
			offsetIn: 48,
			sillIn: 36,
			headerSize: "2x10",
			tag: "2840DH",
			provenance: "VERIFIED",
			offsetProvenance: "PROPOSED",
			datum: "FACE_FRAMING",
			notes: "Second A01 tag 2840DH. Wall/offset not dimensioned — confirm."
		}
	];
	const rooms = {
		"rm-garage": room({
			id: "rm-garage",
			name: "GARAGE",
			level: 1,
			widthIn: t.garageWidthIn,
			depthIn: t.garageDepthIn,
			originXIn: 0,
			originYIn: 0,
			scopeItemIds: [],
			notes: "Tradewalk A01 — two-car garage."
		}),
		"rm-shed": room({
			id: "rm-shed",
			name: "STORAGE SHED FOR LAWN MOWER",
			level: 1,
			widthIn: t.shedWidthIn,
			depthIn: t.shedDepthIn,
			originXIn: t.garageWidthIn,
			originYIn: 0,
			scopeItemIds: [],
			notes: "Tradewalk A01 + Stanfield citing A01: 11'-4 7/8\" × 10'-8 1/2\"."
		}),
		"rm-stair": room({
			id: "rm-stair",
			name: "STAIRWELL",
			level: 1,
			widthIn: null,
			depthIn: null,
			originXIn: null,
			originYIn: null,
			scopeItemIds: [],
			notes: "Named on A01. Place size — Howler will not invent the stair run."
		}),
		"rm-office": room({
			id: "rm-office",
			name: "Conditioned second-floor office / flex",
			level: 2,
			widthIn: t.garageWidthIn,
			depthIn: t.garageDepthIn,
			originXIn: 0,
			originYIn: 0,
			scopeItemIds: [],
			notes: "A02 attic over the garage. Sized from the L footprint until rooms are split."
		}),
		"rm-attic-shed": room({
			id: "rm-attic-shed",
			name: "Attic over mower shed",
			level: 2,
			widthIn: t.shedWidthIn,
			depthIn: t.shedDepthIn,
			originXIn: t.garageWidthIn,
			originYIn: 0,
			scopeItemIds: [],
			notes: "A02 — attic follows the L. Size from A01 shed."
		}),
		"rm-bath": room({
			id: "rm-bath",
			name: "Half bath",
			level: 2,
			widthIn: null,
			depthIn: null,
			originXIn: null,
			originYIn: null,
			scopeItemIds: [],
			notes: "A11 option for garage-level bath for pool access. Size Unknown."
		})
	};
	return {
		...emptyBlueprint(),
		county: t.county,
		occupancy: t.occupancy,
		stories: t.stories,
		widthIn: t.overallWidthIn,
		depthIn: t.overallDepthIn,
		eaveHeightIn: t.eaveHeightIn,
		roofRise: t.roofRise,
		roofRun: t.roofRun,
		roofStyle: t.roofStyle,
		overhangIn: t.overhangIn,
		studSize: t.studSize,
		studSpacingIn: t.studSpacingIn,
		joistSize: t.joistSize,
		joistSpacingIn: t.joistSpacingIn,
		joistDirection: t.joistDirection,
		rafterSize: t.rafterSize,
		rafterSpacingIn: t.rafterSpacingIn,
		drawingScale: t.drawingScale,
		drawingStatus: "DRAFT",
		dimDatum: "FACE_FINISH",
		envelopeProvenance: "VERIFIED",
		issuedRevision: null,
		openings,
		rooms,
		evidence: DEBOARD_REFS,
		notes: `From ${t.source}, ${t.issued}. ${t.openingsUnknown}`
	};
}
function formatFtIn(inches) {
	if (inches == null || Number.isNaN(inches)) return "Unknown";
	const sign = inches < 0 ? "-" : "";
	const abs = Math.abs(inches);
	const ft = Math.floor((abs + 1e-9) / 12);
	const inchRaw = abs - ft * 12;
	const sixteenths = Math.round(inchRaw * 16);
	let whole = Math.floor(sixteenths / 16);
	let frac = sixteenths % 16;
	let feet = ft;
	if (whole === 12) {
		feet += 1;
		whole = 0;
		frac = 0;
	}
	if (frac === 0) return `${sign}${feet}'-${whole}"`;
	let n = frac;
	let d = 16;
	while (n % 2 === 0 && d > 1) {
		n /= 2;
		d /= 2;
	}
	return `${sign}${feet}'-${whole} ${n}/${d}"`;
}
function feetToInches(feet) {
	return Math.round(feet * 12);
}
function envelopeComplete(bp) {
	return bp.widthIn != null && bp.depthIn != null && bp.widthIn > 0 && bp.depthIn > 0;
}
function pitchRatio(bp) {
	if (!bp.roofRise || !bp.roofRun) return null;
	return bp.roofRise / bp.roofRun;
}
function pitchDegrees(bp) {
	const ratio = pitchRatio(bp);
	if (ratio == null) return null;
	return Math.atan(ratio) * 180 / Math.PI;
}
function gableSpanIn(bp) {
	if (!envelopeComplete(bp) || bp.widthIn == null) return null;
	return bp.widthIn;
}
function ridgeRiseIn(bp) {
	const span = gableSpanIn(bp);
	const ratio = pitchRatio(bp);
	if (span == null || ratio == null) return null;
	if (bp.roofStyle === "SHED") return span * ratio;
	return span / 2 * ratio;
}
function ridgeHeightIn(bp) {
	if (bp.eaveHeightIn == null) return null;
	const rise = ridgeRiseIn(bp);
	if (rise == null) return null;
	return bp.eaveHeightIn + rise;
}
function rafterLengthIn(bp) {
	const span = gableSpanIn(bp);
	const ratio = pitchRatio(bp);
	if (span == null || ratio == null) return null;
	const run = bp.roofStyle === "SHED" ? span : span / 2;
	const rise = run * ratio;
	const overhang = bp.overhangIn ?? 0;
	return Math.hypot(run, rise) + overhang * Math.hypot(1, ratio);
}
function roofAreaSf(bp) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return null;
	const ratio = pitchRatio(bp);
	const slope = ratio == null ? 1 : Math.hypot(1, ratio);
	const overhang = bp.overhangIn ?? 0;
	return (bp.widthIn + 2 * overhang) * (bp.depthIn + 2 * overhang) * slope / 144;
}
function joistSpanIn(bp) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return null;
	return bp.joistDirection === "DEPTH" ? bp.depthIn : bp.widthIn;
}
function rafterHorizontalSpanIn(bp) {
	const span = gableSpanIn(bp);
	if (span == null) return null;
	if (bp.roofStyle === "SHED") return span;
	return span / 2;
}
function stations(lengthIn, spacingIn) {
	if (lengthIn <= 0 || spacingIn <= 0) return [0];
	const result = [];
	for (let x = 0; x < lengthIn - .25; x += spacingIn) result.push(Math.round(x * 100) / 100);
	if (result[result.length - 1] !== lengthIn) result.push(lengthIn);
	return result;
}
function memberCount(lengthIn, spacingIn) {
	return stations(lengthIn, spacingIn).length;
}
function framingTakeoff(bp) {
	const lines = [];
	const width = bp.widthIn;
	const depth = bp.depthIn;
	const height = bp.eaveHeightIn;
	const spacing = bp.studSpacingIn;
	const size = bp.studSize ?? "2x4";
	if (width && depth && spacing) {
		const long = memberCount(width, spacing);
		const short = memberCount(depth, spacing);
		const corners = 8;
		const door = bp.overheadDoorWidthIn ? Math.max(0, Math.round(bp.overheadDoorWidthIn / spacing) - 1) : 0;
		const kingJacks = bp.overheadDoorWidthIn ? 6 : 0;
		const count = long * 2 + short * 2 + corners + kingJacks - door;
		lines.push({
			id: "studs",
			label: "Studs, typical bearing (count includes corners; deducts door cavity)",
			count,
			size,
			lengthEach: height ? formatFtIn(height) : "Unknown wall height",
			notes: `${spacing}" O.C. · ${long} on each ${formatFtIn(width)} wall · ${short} on each ${formatFtIn(depth)} wall`
		});
		const plateEach = 2 * width + 2 * depth;
		lines.push({
			id: "plates",
			label: "Plates (1 bottom + 2 top, linear)",
			count: 3,
			size,
			lengthEach: formatFtIn(plateEach),
			notes: "Double top plate typical. Corners overlap — add 10% waste in the field."
		});
	} else lines.push({
		id: "studs",
		label: "Studs",
		count: null,
		size,
		lengthEach: "Unknown",
		notes: "Need envelope and stud spacing."
	});
	if (bp.joistSize && bp.joistSpacingIn && width && depth) {
		const span = joistSpanIn(bp);
		const run = bp.joistDirection === "DEPTH" ? width : depth;
		const count = span && run ? memberCount(run, bp.joistSpacingIn) : null;
		lines.push({
			id: "joists",
			label: "Floor joists",
			count,
			size: bp.joistSize,
			lengthEach: span ? formatFtIn(span) : "Unknown",
			notes: `${bp.joistSpacingIn}" O.C. spanning ${bp.joistDirection === "DEPTH" ? "depth" : "width"} · plus rim / band each side`
		});
	}
	if (bp.rafterSize && bp.rafterSpacingIn && width && depth) {
		const length = rafterLengthIn(bp);
		const run = bp.depthIn;
		const oneSide = run ? memberCount(run, bp.rafterSpacingIn) : null;
		const sides = bp.roofStyle === "SHED" ? 1 : 2;
		lines.push({
			id: "rafters",
			label: bp.roofStyle === "SHED" ? "Rafters (shed)" : "Rafters (each slope)",
			count: oneSide == null ? null : oneSide * sides,
			size: bp.rafterSize,
			lengthEach: length ? formatFtIn(length) : "Unknown",
			notes: `${bp.rafterSpacingIn}" O.C. · ridge / beam extra · trusses replace this count if used`
		});
	}
	const roof = roofAreaSf(bp);
	lines.push({
		id: "roof",
		label: "Roof covering (plan × slope factor)",
		count: roof == null ? null : Math.ceil(roof / 100),
		size: "square",
		lengthEach: roof == null ? "Unknown" : `${Math.ceil(roof)} sf`,
		notes: roof == null ? "Need envelope and pitch." : "Add waste. Ice barrier per AHJ where required."
	});
	return lines;
}
function conventionalFramingPatch(bp) {
	const habitable = bp.occupancy === "GARAGE_WITH_HABITABLE" || bp.occupancy === "DWELLING" || (bp.stories ?? 0) >= 2;
	const patch = {};
	if (!bp.studSize) patch.studSize = habitable ? "2x6" : "2x4";
	if (!bp.studSpacingIn) patch.studSpacingIn = 16;
	if (habitable) {
		if (!bp.joistSize) patch.joistSize = "2x10";
		if (!bp.joistSpacingIn) patch.joistSpacingIn = 16;
		if (!bp.stories) patch.stories = 2;
	}
	if (!bp.rafterSize) patch.rafterSize = "2x8";
	if (!bp.rafterSpacingIn) patch.rafterSpacingIn = 16;
	if (!bp.roofStyle) patch.roofStyle = "GABLE";
	if (bp.overhangIn == null) patch.overhangIn = 12;
	return patch;
}
function nominalDepthIn(size) {
	switch (size) {
		case "2x4": return 3.5;
		case "2x6": return 5.5;
		case "2x8": return 7.25;
		case "2x10": return 9.25;
		case "2x12": return 11.25;
		default: return 5.5;
	}
}
function wallThicknessIn(bp) {
	return nominalDepthIn(bp.studSize) + 1;
}
function lumberThicknessIn() {
	return 1.5;
}
function typicalOhdWidthIn(widthIn) {
	if (widthIn >= 264) return 192;
	if (widthIn >= 216) return 120;
	if (widthIn >= 168) return 108;
	return 96;
}
function conventionalOpenings(bp) {
	if (!bp.widthIn || !bp.depthIn) return [];
	const ohdW = typicalOhdWidthIn(bp.widthIn);
	return [{
		id: "op-ohd",
		kind: "OHD",
		wall: "FRONT",
		widthIn: ohdW,
		heightIn: 84,
		offsetIn: Math.max(0, (bp.widthIn - ohdW) / 2),
		sillIn: 0,
		headerSize: "2x12",
		provenance: "INFERRED",
		offsetProvenance: "INFERRED",
		datum: "FACE_FRAMING",
		notes: "Typical double-bay overhead door — confirm size"
	}, {
		id: "op-man",
		kind: "MAN",
		wall: "LEFT",
		widthIn: 36,
		heightIn: 80,
		offsetIn: 48,
		sillIn: 0,
		headerSize: "2x10",
		provenance: "INFERRED",
		offsetProvenance: "INFERRED",
		datum: "FACE_FRAMING",
		notes: "Typical 3'-0\" man door on left wall — confirm"
	}];
}
function resolveOpenings(bp) {
	if (bp.openings && bp.openings.length > 0) return bp.openings;
	if (bp.overheadDoorWidthIn && bp.widthIn) return [{
		id: "op-ohd-legacy",
		kind: "OHD",
		wall: "FRONT",
		widthIn: bp.overheadDoorWidthIn,
		heightIn: bp.overheadDoorHeightIn,
		offsetIn: Math.max(0, (bp.widthIn - bp.overheadDoorWidthIn) / 2),
		sillIn: 0,
		headerSize: "2x12",
		provenance: "PROPOSED",
		offsetProvenance: "INFERRED",
		datum: "FACE_FRAMING",
		notes: null
	}];
	return [];
}
function typicalGarageLayoutPatch(bp) {
	const patch = { ...conventionalFramingPatch(bp) };
	if ((bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE" || bp.occupancy === "POST_AND_FRAME") && resolveOpenings(bp).length === 0 && bp.widthIn && bp.depthIn) {
		const openings = conventionalOpenings({
			...bp,
			...patch
		});
		patch.openings = openings;
		const ohd = openings.find((item) => item.kind === "OHD");
		if (ohd) {
			patch.overheadDoorWidthIn = ohd.widthIn;
			patch.overheadDoorHeightIn = ohd.heightIn;
		}
	}
	return patch;
}
function openingLabel(opening) {
	if (opening.tag) return opening.tag;
	return `${opening.kind === "OHD" ? "OHD" : opening.kind === "MAN" ? "MAN DOOR" : "WINDOW"} ${opening.heightIn ? `${formatFtIn(opening.widthIn)} × ${formatFtIn(opening.heightIn)}` : formatFtIn(opening.widthIn)}`;
}
function describeEnvelope(bp) {
	if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return "Envelope Unknown";
	const pitch = bp.roofRise && bp.roofRun ? ` · ${bp.roofRise}/${bp.roofRun}` : " · pitch Unknown";
	const walls = bp.eaveHeightIn ? ` · walls ${formatFtIn(bp.eaveHeightIn)}` : " · wall height Unknown";
	return `${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}${walls}${pitch}`;
}
function scaleInchesPerFoot(scaleId) {
	return DRAWING_SCALES.find((item) => item.id === scaleId)?.inchesPerFoot ?? null;
}
function scaleLabel(scaleId) {
	return DRAWING_SCALES.find((item) => item.id === scaleId)?.label ?? "Scale Unknown";
}
function svgPerBuildingInch(scaleId, fitPxPerInch) {
	const ipf = scaleInchesPerFoot(scaleId);
	if (ipf == null) return fitPxPerInch;
	return ipf / 12 * 72;
}
function planLayout(widthIn, depthIn, scaleId, box = {
	x: 140,
	y: 56,
	w: 620,
	h: 400
}) {
	const fitS = Math.min(box.w / widthIn, box.h / depthIn);
	const s = svgPerBuildingInch(scaleId, fitS);
	const w = widthIn * s;
	const d = depthIn * s;
	const fits = w <= box.w + .5 && d <= box.h + .5;
	return {
		x: box.x + Math.max(0, (box.w - w) / 2),
		y: box.y + Math.max(0, (box.h - d) / 2),
		w,
		d,
		s,
		fits,
		fitS
	};
}
function parseDrawingScale(text) {
	const lower = text.toLowerCase();
	const talkingScale = /\bscale\b/.test(lower) || /\bequals?\s+(a\s+)?foot\b/.test(lower) || /=/.test(lower);
	if (/\bfit(\s+to\s+sheet)?\b/.test(lower) && talkingScale) return "FIT";
	if (!talkingScale && !/\b(quarter|eighth)\s+inch\s+scale\b/.test(lower)) return null;
	if (/\b3\s*\/\s*16/.test(lower)) return "3/16";
	if (/\b1\s*\/\s*4/.test(lower) || /\bquarter\s+inch\b/.test(lower)) return "1/4";
	if (/\b1\s*\/\s*8/.test(lower) || /\beighth\s+inch\b/.test(lower)) return "1/8";
	if (/\b1\s*\/\s*16/.test(lower)) return "1/16";
	return null;
}
/** Sized rooms that are not the full envelope — garage + shed make the L. */
function planParts(bp, level) {
	if (!bp.widthIn || !bp.depthIn) return [];
	const sized = Object.values(bp.rooms).filter((room) => room.level === level && room.widthIn && room.depthIn && room.originXIn != null && room.originYIn != null).filter((room) => !(room.originXIn === 0 && room.originYIn === 0 && room.widthIn === bp.widthIn && room.depthIn === bp.depthIn)).map((room) => ({
		id: room.id,
		name: room.name,
		xIn: room.originXIn,
		yIn: room.originYIn,
		wIn: room.widthIn,
		dIn: room.depthIn
	}));
	if (sized.length >= 2) return sized;
	return [{
		id: "envelope",
		name: level === 1 ? "GARAGE" : "LEVEL 2",
		xIn: 0,
		yIn: 0,
		wIn: bp.widthIn,
		dIn: bp.depthIn
	}];
}
function isLFootprint(bp, level = 1) {
	const parts = planParts(bp, level);
	if (parts.length < 2 || !bp.widthIn || !bp.depthIn) return false;
	return parts.reduce((sum, part) => sum + part.wIn * part.dIn, 0) < bp.widthIn * bp.depthIn - 12;
}
var DATUM_LABEL = {
	FACE_FRAMING: "TO FACE OF FRAMING",
	FACE_FINISH: "TO FINISHED FACE (BRICK)",
	CENTERLINE: "TO CENTERLINE"
};
var PROVENANCE_LABEL = {
	VERIFIED: "VERIFIED",
	INFERRED: "INFERRED",
	PROPOSED: "PROPOSED",
	UNKNOWN: "UNKNOWN"
};
var STATUS_LABEL = {
	DRAFT: "DRAFT — NOT ISSUED",
	REVIEWED: "REVIEWED — NOT ISSUED",
	ISSUED: "ISSUED FOR LAYOUT"
};
function provenanceSuffix(provenance) {
	if (!provenance || provenance === "VERIFIED") return "";
	if (provenance === "INFERRED") return " INF";
	if (provenance === "PROPOSED") return " PROP";
	return " UNK";
}
function uniqueMarks(openings) {
	const counts = /* @__PURE__ */ new Map();
	const bases = openings.map((opening, index) => {
		const base = opening.tag?.trim() || (opening.kind === "OHD" ? `OHD${index + 1}` : opening.kind === "MAN" ? `D${index + 1}` : `W${index + 1}`);
		counts.set(base, (counts.get(base) ?? 0) + 1);
		return base;
	});
	const seen = /* @__PURE__ */ new Map();
	return bases.map((base) => {
		if ((counts.get(base) ?? 1) === 1) return base;
		const n = (seen.get(base) ?? 0) + 1;
		seen.set(base, n);
		return `${base}${String.fromCharCode(64 + n)}`;
	});
}
function openingSchedule(bp) {
	const openings = resolveOpenings(bp);
	const marks = uniqueMarks(openings);
	const rows = openings.map((opening, index) => ({
		id: opening.id,
		mark: marks[index] ?? opening.tag ?? opening.id,
		kind: opening.kind,
		size: formatFtIn(opening.widthIn),
		height: opening.heightIn != null ? formatFtIn(opening.heightIn) : "Unknown",
		wall: opening.wall,
		offset: formatFtIn(opening.offsetIn),
		header: opening.headerSize ?? "—",
		provenance: opening.provenance ?? "PROPOSED",
		offsetProvenance: opening.offsetProvenance ?? "PROPOSED",
		datum: opening.datum ?? bp.dimDatum ?? "FACE_FRAMING",
		notes: opening.notes ?? "",
		missing: false
	}));
	if (["DETACHED_GARAGE", "GARAGE_WITH_HABITABLE"].includes(bp.occupancy) && !openings.some((item) => item.kind === "OHD")) rows.push({
		id: "missing-ohd",
		mark: "OHD",
		kind: "OHD",
		size: "Unknown",
		height: "Unknown",
		wall: "FRONT",
		offset: "Unknown",
		header: "—",
		provenance: "UNKNOWN",
		offsetProvenance: "UNKNOWN",
		datum: bp.dimDatum ?? "FACE_FRAMING",
		notes: citesTradewalk(bp) ? "A09 two openers (double + single). Leaf widths not on A01." : "Overhead door width not recorded.",
		missing: true
	});
	if (citesTradewalk(bp) && !openings.some((item) => /^SB3621/i.test(item.tag ?? ""))) for (const mark of ["SB3621A", "SB3621B"]) rows.push({
		id: `missing-${mark.toLowerCase()}`,
		mark,
		kind: SB3621.kind,
		size: formatFtIn(SB3621.widthIn),
		height: formatFtIn(SB3621.heightIn),
		wall: "Unknown",
		offset: "Unknown",
		header: "—",
		provenance: "INFERRED",
		offsetProvenance: "UNKNOWN",
		datum: bp.dimDatum ?? "FACE_FRAMING",
		notes: SB3621.notes,
		missing: true
	});
	return rows;
}
function unresolvedRegister(bp) {
	const items = [];
	const trade = citesTradewalk(bp);
	if (!envelopeComplete(bp)) items.push({
		id: "env-unknown",
		title: "Envelope is Unknown",
		message: "Width and depth are not recorded. Howler will not invent a building size.",
		sheet: "A01",
		blocking: true
	});
	else if ((bp.envelopeProvenance ?? "PROPOSED") !== "VERIFIED") items.push({
		id: "env-unverified",
		title: "Envelope is not a verified field measurement",
		message: `Overall ${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)} is ${PROVENANCE_LABEL[bp.envelopeProvenance ?? "PROPOSED"]}. Scaling a PDF is not a field measurement. Mark verified after you measure, or keep it as design intent.`,
		sheet: "A01",
		blocking: false
	});
	const openings = resolveOpenings(bp);
	if ((bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE") && !openings.some((item) => item.kind === "OHD") && bp.overheadDoorWidthIn == null) items.push({
		id: "ohd-leaf",
		title: "Overhead-door leaf widths are Unknown",
		message: trade ? "A09 shows two garage-door openers. Enter the double and the single. Howler will not invent 16'-0\"." : "Header, king, and jack studs cannot be laid out until the door width is entered.",
		sheet: "A01",
		blocking: true
	});
	for (const opening of openings) if ((opening.offsetProvenance ?? "PROPOSED") === "PROPOSED" || opening.offsetProvenance === "UNKNOWN") items.push({
		id: `off-${opening.id}`,
		title: `${opening.tag ?? openingLabel(opening)} offset is ${opening.offsetProvenance ?? "PROPOSED"}`,
		message: `Offset ${formatFtIn(opening.offsetIn)} from the ${opening.wall.toLowerCase()} wall start is not a verified field measurement. Confirm before issuing for layout.`,
		sheet: "A01",
		blocking: false
	});
	for (const room of Object.values(bp.rooms)) if (room.widthIn == null || room.depthIn == null) {
		const stair = /stair/i.test(room.name);
		const bath = /bath/i.test(room.name);
		items.push({
			id: `rm-${room.id}`,
			title: `${room.name} size is Unknown`,
			message: stair ? "Stairwell is named. Run, width, and direction stay Unknown until you place them. Kentucky: 36 in clear, 8¼ in max riser, 9 in min tread (KRC R311.7 — not IRC 7¾ / 10)." : bath ? "Half bath is an option. In or out, and which corner, stay Unknown. If a lav goes in, GFCI within 6 ft of the sink (E3902.1)." : `${room.name} is named. Size stays Unknown — Howler will not invent it.`,
			sheet: stair ? "A01" : bath ? "A11" : "A01",
			blocking: stair
		});
	}
	if (trade) {
		const placed = openings.filter((item) => /^SB3621/i.test(item.tag ?? "")).length;
		items.push({
			id: "sb3621",
			title: placed >= SB3621.count ? "SB3621 walls still need a field check" : "SB3621 tagged twice — wall Unknown",
			message: placed >= SB3621.count ? "SB3621 is a 3'-6\" × 2'-1\" window (same cipher as 2868). Operation SB is unconfirmed. Not a Simpson SSTB36 holdown." : "A01 tags SB3621 twice. Same cipher as 2868 → 3'-6\" × 2'-1\" window. Type SB and wall stay Unknown — not drawn. Not an OHD. Not Simpson SSTB36 (36-7/8\" holdown bolt).",
			sheet: "A01",
			blocking: false
		});
		items.push({
			id: "panel",
			title: "Electrical panel location is Unknown",
			message: "A09/A10 record devices. Panel location and amps are not on the set — not invented (E3701).",
			sheet: "A09",
			blocking: false
		});
		items.push({
			id: "existing-house",
			title: "Existing house / garage size is not on the set",
			message: "Dashed existing footprints are place-holders. Size is not on Tradewalk — not invented.",
			sheet: "A01",
			blocking: false
		});
	}
	if (bp.frostDepthIn == null) items.push({
		id: "frost",
		title: "Frost depth is Unknown",
		message: "Typical Kentucky AHJ value is 24 in. Enter the official’s number. Howler will not assume it.",
		sheet: "A03",
		blocking: false
	});
	return items;
}
var KY_STAIR = {
	maxRiserIn: 8.25,
	minTreadIn: 9,
	minWidthIn: 36,
	clearOneHandrailIn: 31.5,
	clearTwoHandrailIn: 27,
	handrailProjectionIn: 4.5,
	minHeadroomIn: 80,
	maxFlightRiseIn: 147,
	maxVariationIn: .375,
	nosingMinIn: .75,
	nosingMaxIn: 1.25,
	nosingRadiusMaxIn: .5625,
	nosingNotRequiredTreadIn: 11,
	openRiserSphereIn: 4,
	handrailMinIn: 34,
	handrailMaxIn: 38,
	handrailRequiredRisers: 4,
	landingStraightIn: 36,
	guardMinIn: 36,
	guardOnStairsMinIn: 34,
	/** Vanilla IRC — do not use these for a Kentucky job. */
	ircMaxRiserIn: 7.75,
	ircMinTreadIn: 10
};
function minRisersForRise(riseIn) {
	if (!(riseIn > 0)) return 0;
	return Math.ceil(riseIn / KY_STAIR.maxRiserIn - 1e-9);
}
function riserHeightIn(riseIn, risers) {
	if (!(risers > 0) || !(riseIn > 0)) return null;
	return riseIn / risers;
}
function minGoingIn(risers) {
	if (risers < 2) return 0;
	return (risers - 1) * KY_STAIR.minTreadIn;
}
function proposedStairFromWalls(bp) {
	if (bp.eaveHeightIn == null || bp.eaveHeightIn <= 0) return null;
	const joistDepthIn = bp.joistSize ? nominalDepthIn(bp.joistSize) : null;
	const proposedRiseIn = bp.eaveHeightIn + (joistDepthIn ?? 0);
	const minRisers = minRisersForRise(proposedRiseIn);
	const height = riserHeightIn(proposedRiseIn, minRisers) ?? 0;
	const treads = Math.max(0, minRisers - 1);
	const note = joistDepthIn ? `${formatFtIn(bp.eaveHeightIn)} walls + ${bp.joistSize} (${formatFtIn(joistDepthIn)}) — subfloor not added` : `${formatFtIn(bp.eaveHeightIn)} walls — floor assembly Unknown, not added`;
	return {
		wallHeightIn: bp.eaveHeightIn,
		joistDepthIn,
		proposedRiseIn,
		minRisers,
		riserHeightIn: height,
		minGoingIn: minGoingIn(minRisers),
		treads,
		provenance: "PROPOSED",
		note
	};
}
function stairCodeSummary(bp) {
	const proposal = proposedStairFromWalls(bp);
	const bits = [
		"Kentucky stair code is the 2018 KRC (2015 IRC with KY amendments), not vanilla IRC.",
		`Riser max 8¼ in (R311.7.5.1) — IRC is 7¾ in. Do not use 7¾ on this job.`,
		`Tread min 9 in (R311.7.5.2) — IRC is 10 in. Do not use 10 as the Kentucky minimum.`,
		"Width 36 in clear (R311.7.1). Headroom 6'-8\" (R311.7.2). Uniformity ⅜ in (R311.7.5).",
		"Handrail 34–38 in on any flight of 4 or more risers (R311.7.8).",
		"Landing 36 in in the direction of travel on a straight run (R311.7.6). Exception: no landing at the top of an interior / enclosed-garage flight if a door does not swing over the stairs.",
		"Max 147 in between floors or landings (R311.7.3). Richmond Building Inspection publishes the same numbers."
	];
	if (proposal) bits.push(`From recorded walls: ${proposal.note} → proposed floor-to-floor ${formatFtIn(proposal.proposedRiseIn)} needs at least ${proposal.minRisers} risers at ${proposal.riserHeightIn.toFixed(2)}" and ${formatFtIn(proposal.minGoingIn)} of going (${proposal.treads} treads × 9"). That is PROPOSED, not a field measurement. Run, width, and direction stay Unknown until you place them.`);
	else bits.push("Floor-to-floor is Unknown — Howler will not invent a stringer.");
	return bits.join(" ");
}
function stairLimitRows(bp) {
	const proposal = proposedStairFromWalls(bp);
	const rows = [
		{
			label: "WIDTH",
			value: `36" clear min`,
			code: "R311.7.1"
		},
		{
			label: "RISER",
			value: `8¼" max · KY (not IRC 7¾")`,
			code: "R311.7.5.1"
		},
		{
			label: "TREAD",
			value: `9" min · KY (not IRC 10")`,
			code: "R311.7.5.2"
		},
		{
			label: "HEADROOM",
			value: `6'-8"`,
			code: "R311.7.2"
		},
		{
			label: "HANDRAIL",
			value: `34–38" if 4+ risers`,
			code: "R311.7.8"
		},
		{
			label: "LANDING",
			value: `36" straight run`,
			code: "R311.7.6"
		},
		{
			label: "FLIGHT",
			value: `147" max between floors`,
			code: "R311.7.3"
		}
	];
	if (proposal) rows.push({
		label: "THIS JOB",
		value: `${proposal.minRisers} risers · going ≥ ${formatFtIn(proposal.minGoingIn)} PROP`,
		code: "PROPOSED"
	});
	else rows.push({
		label: "THIS JOB",
		value: "Run Unknown — not invented",
		code: "R311.7"
	});
	return rows;
}
/** KRC 2018 Table R301.2(1) — 20 psf counties. All others 15 psf. */
var SNOW_20 = /* @__PURE__ */ new Set([
	"Boone",
	"Boyd",
	"Bracken",
	"Campbell",
	"Carroll",
	"Floyd",
	"Gallatin",
	"Grant",
	"Greenup",
	"Henry",
	"Kenton",
	"Knott",
	"Leslie",
	"Letcher",
	"Lewis",
	"Martin",
	"Mason",
	"Trimble"
]);
var HIGH_ELEVATION = {
	Bell: "Footnote b: above 2,600 ft use a site-specific snow study.",
	Harlan: "Footnote b: above 2,600 ft use a site-specific snow study.",
	Letcher: "Footnote c: above 2,500 ft use a site-specific snow study."
};
var KY_COUNTIES = [
	"Adair",
	"Allen",
	"Anderson",
	"Ballard",
	"Barren",
	"Bath",
	"Bell",
	"Boone",
	"Bourbon",
	"Boyd",
	"Boyle",
	"Bracken",
	"Breathitt",
	"Breckinridge",
	"Bullitt",
	"Butler",
	"Caldwell",
	"Calloway",
	"Campbell",
	"Carlisle",
	"Carroll",
	"Carter",
	"Casey",
	"Christian",
	"Clark",
	"Clay",
	"Clinton",
	"Crittenden",
	"Cumberland",
	"Daviess",
	"Edmonson",
	"Elliott",
	"Estill",
	"Fayette",
	"Fleming",
	"Floyd",
	"Franklin",
	"Fulton",
	"Gallatin",
	"Garrard",
	"Grant",
	"Graves",
	"Grayson",
	"Green",
	"Greenup",
	"Hancock",
	"Hardin",
	"Harlan",
	"Harrison",
	"Hart",
	"Henderson",
	"Henry",
	"Hickman",
	"Hopkins",
	"Jackson",
	"Jefferson",
	"Jessamine",
	"Johnson",
	"Kenton",
	"Knott",
	"Knox",
	"Larue",
	"Laurel",
	"Lawrence",
	"Lee",
	"Leslie",
	"Letcher",
	"Lewis",
	"Lincoln",
	"Livingston",
	"Logan",
	"Lyon",
	"Madison",
	"Magoffin",
	"Marion",
	"Marshall",
	"Martin",
	"Mason",
	"McCracken",
	"McCreary",
	"McLean",
	"Meade",
	"Menifee",
	"Mercer",
	"Metcalfe",
	"Monroe",
	"Montgomery",
	"Morgan",
	"Muhlenberg",
	"Nelson",
	"Nicholas",
	"Ohio",
	"Oldham",
	"Owen",
	"Owsley",
	"Pendleton",
	"Perry",
	"Pike",
	"Powell",
	"Pulaski",
	"Robertson",
	"Rockcastle",
	"Rowan",
	"Russell",
	"Scott",
	"Shelby",
	"Simpson",
	"Spencer",
	"Taylor",
	"Todd",
	"Trigg",
	"Trimble",
	"Union",
	"Warren",
	"Washington",
	"Wayne",
	"Webster",
	"Whitley",
	"Wolfe",
	"Woodford"
];
function matchCounty(text) {
	const lower = text.toLowerCase();
	return KY_COUNTIES.filter((county) => lower.includes(county.toLowerCase())).sort((a, b) => b.length - a.length)[0] ?? null;
}
function countyCriteria(county) {
	const name = KY_COUNTIES.find((item) => item.toLowerCase() === county.toLowerCase());
	if (!name) return null;
	return {
		name,
		snowPsf: SNOW_20.has(name) ? 20 : 15,
		footnote: HIGH_ELEVATION[name] ?? null
	};
}
/**
* Conservative SPF No.2 tabulated floor-joist spans, inches.
* Source: IRC 2015 Table R502.3.1(2) / KRC 2018 Ch. 5 — 40 psf LL / 10 psf DL, L/360.
* Values rounded down from published feet-inches so Howler never overstates span.
*/
var JOIST_SPF2 = {
	"2x6": {
		12: 123,
		16: 112,
		19.2: 105,
		24: 97
	},
	"2x8": {
		12: 162,
		16: 147,
		19.2: 138,
		24: 123
	},
	"2x10": {
		12: 207,
		16: 185,
		19.2: 174,
		24: 153
	},
	"2x12": {
		12: 251,
		16: 222,
		19.2: 209,
		24: 180
	}
};
/**
* Conservative SPF No.2 rafter horizontal spans, inches.
* Source: IRC 2015 Table R802.5.1(1) family — 20 psf ground snow / 10 psf DL,
* ceiling not attached to rafters. Covers both 15 and 20 psf KY counties.
*/
var RAFTER_SPF2_20 = {
	"2x6": {
		12: 138,
		16: 125,
		19.2: 117,
		24: 102
	},
	"2x8": {
		12: 182,
		16: 165,
		19.2: 155,
		24: 135
	},
	"2x10": {
		12: 232,
		16: 193,
		19.2: 181,
		24: 157
	},
	"2x12": {
		12: 269,
		16: 232,
		19.2: 218,
		24: 190
	}
};
var SPECIES_LABEL = {
	SPF_2: "SPF No.2",
	DF_LARCH_2: "Douglas Fir-Larch No.2",
	SYP_2: "Southern Pine No.2"
};
function tabulatedJoistSpanIn(size, spacingIn) {
	const row = JOIST_SPF2[size];
	if (!row) return null;
	return row[nearestSpacing(spacingIn)] ?? null;
}
function tabulatedRafterSpanIn(size, spacingIn) {
	const row = RAFTER_SPF2_20[size];
	if (!row) return null;
	return row[nearestSpacing(spacingIn)] ?? null;
}
function nearestSpacing(spacingIn) {
	if (spacingIn <= 12) return 12;
	if (spacingIn <= 16) return 16;
	if (spacingIn <= 19.2) return 19.2;
	return 24;
}
function speciesLabel(species) {
	return SPECIES_LABEL[species];
}
function computePlanFindings(project) {
	const bp = ensureBlueprint(project);
	const findings = [];
	const trade = citesTradewalk(bp);
	findings.push({
		id: "disclaimer",
		severity: "INFO",
		code: "R106.1 / KRS 322",
		title: "Working drawings, not a sealed set",
		message: "These are design-intent / field-layout drawings. They are not sealed by a licensed design professional. The authority having jurisdiction (AHJ) decides what must be engineered. Do not submit this set as a PE-stamped permit package. Code basis is the 2018 Kentucky Residential Code (2015 IRC), 815 KAR 7:125.",
		engineerLikely: false
	});
	if (!bp.widthIn || !bp.depthIn) findings.push({
		id: "envelope",
		severity: "WATCH",
		code: "Envelope",
		title: "Envelope is Unknown",
		message: "Width and depth are not recorded. Howler will not invent a building size. Enter feet (example: 24 by 32) to generate plan, stud, and joist layouts.",
		engineerLikely: false
	});
	if (!bp.county) findings.push({
		id: "county",
		severity: "WATCH",
		code: "Table R301.2(1)",
		title: "County is Unknown",
		message: "Ground snow load stays Unknown until a Kentucky county is entered. Wind is 115 mph Vult statewide. Weathering is Severe statewide. Howler will not guess the county from the street address.",
		engineerLikely: false
	});
	else {
		const criteria = countyCriteria(bp.county);
		if (criteria?.footnote) findings.push({
			id: "snow-elev",
			severity: "WATCH",
			code: "Table R301.2(1)",
			title: `${criteria.name} County high-elevation snow`,
			message: criteria.footnote,
			engineerLikely: true
		});
	}
	if (bp.frostDepthIn == null) findings.push({
		id: "frost",
		severity: "INFO",
		code: "R403.1.4",
		title: "Frost depth is Unknown",
		message: "Typical Kentucky AHJ value is 24 in. Enter the frost depth the building official uses. Howler will not assume it.",
		engineerLikely: false
	});
	const habitableAbove = bp.occupancy === "GARAGE_WITH_HABITABLE" || (bp.stories ?? 0) >= 2 && bp.occupancy !== "DETACHED_GARAGE" && bp.occupancy !== "POST_AND_FRAME";
	if (habitableAbove) {
		findings.push({
			id: "r302-6",
			severity: "REQUIRED",
			code: "R302.6",
			title: "Garage / habitable separation",
			message: "Habitable rooms above a garage require not less than 5/8 in Type X gypsum (or equivalent) on the garage ceiling. Supporting structure for that assembly needs not less than 1/2 in gypsum or equivalent. Call this out on the L1 ceiling.",
			engineerLikely: false
		});
		const stair = proposedStairFromWalls(bp);
		findings.push({
			id: "r311-ky",
			severity: "WATCH",
			code: "R311.7 (KY)",
			title: "Stair geometry is Kentucky-amended",
			message: stair ? `KRC 2018 max riser is 8¼ in and min tread is 9 in — not IRC 7¾ / 10. Richmond Building Inspection publishes the same. From recorded ${stair.note}: proposed floor-to-floor ${formatFtIn(stair.proposedRiseIn)} needs ≥ ${stair.minRisers} risers at ${stair.riserHeightIn.toFixed(2)}" and ≥ ${formatFtIn(stair.minGoingIn)} of going. Run, width, and direction stay Unknown. Howler will not cut a stringer from this.` : `KRC 2018 max riser is ${KY_STAIR.maxRiserIn}" and min tread is ${KY_STAIR.minTreadIn}" (R311.7.5). Vanilla IRC 7¾ / 10 does not apply. Width 36 in, headroom 6'-8". Enter floor-to-floor before layout.`,
			engineerLikely: false
		});
	}
	if (bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE") {
		findings.push({
			id: "r302-6-walls",
			severity: "INFO",
			code: "R302.6",
			title: "Garage wall separation (if attached or < 3 ft)",
			message: "From a dwelling and attics: 1/2 in gypsum on the garage side. Garages less than 3 ft from a dwelling on the same lot: 1/2 in gypsum on the interior of those exterior walls. Detached buildings farther than 3 ft do not pick up that wall rule.",
			engineerLikely: false
		});
		findings.push({
			id: "r302-5",
			severity: "INFO",
			code: "R302.5.1",
			title: "Opening from garage into dwelling",
			message: "No opening from a private garage directly into a sleeping room. Other openings shall be a solid wood or honeycomb-core steel door not less than 1-3/8 in thick, or a 20-minute fire-rated door.",
			engineerLikely: false
		});
		findings.push({
			id: "r309-1",
			severity: "INFO",
			code: "R309.1",
			title: "Garage floor surface",
			message: "Garage floor shall be an approved noncombustible material. The parking area shall slope to a drain or toward the main vehicle doorway. Howler will not invent a drain if none is recorded.",
			engineerLikely: false
		});
		findings.push({
			id: "e3902",
			severity: "INFO",
			code: "E3902.2 / E3901.9",
			title: "Garage receptacles",
			message: "All 125-volt, single-phase, 15- and 20-ampere receptacles in garages shall have GFCI protection (E3902.2). At least one receptacle in each vehicle bay (E3901.9). A 20-ampere garage receptacle circuit with no other outlets is required (2015 IRC Ch. 37 / NEC 210.11(C)(4)). Device count on A09 is typical, not a circuit schedule.",
			engineerLikely: false
		});
		findings.push({
			id: "r309-4",
			severity: "INFO",
			code: "R309.4",
			title: "Garage-door openers",
			message: "Automatic garage door openers, if provided, shall be listed and labeled in accordance with UL 325. Leaf widths stay Unknown until entered.",
			engineerLikely: false
		});
		findings.push({
			id: "r315",
			severity: "INFO",
			code: "R315.2.1",
			title: "Carbon monoxide alarm (attached garage)",
			message: "New dwelling units with an attached garage require a carbon monoxide alarm. Howler will not invent detector locations on A09 — they belong in the dwelling, not as a guessed garage device.",
			engineerLikely: false
		});
	}
	const heightIn = bp.eaveHeightIn;
	const studSpacing = bp.studSpacingIn;
	const studSize = bp.studSize;
	const stories = bp.stories ?? (habitableAbove ? 2 : null);
	if (studSize === "2x4" && heightIn != null && heightIn > 120) findings.push({
		id: "stud-height",
		severity: "REQUIRED",
		code: "R602.3(5)",
		title: "2x4 bearing height exceeds conventional 10 ft",
		message: `Unsupported 2x4 bearing height is ${formatFtIn(heightIn)}. IRC/KRC Table R602.3(5) caps conventional 2x4 bearing walls at 10'-0". Taller walls need 2x6, engineered design, or an accepted alternative.`,
		engineerLikely: true
	});
	if (habitableAbove && studSpacing != null && studSpacing > 16) findings.push({
		id: "stud-oc",
		severity: "REQUIRED",
		code: "R602.3(5)",
		title: "Stud spacing is not conventional with a floor above",
		message: `Studs at ${studSpacing}" O.C. with a floor + roof-ceiling above. Table R602.3(5) allows 24" O.C. 2x4 only when the wall supports a roof-ceiling assembly and no floor. Use 16" O.C. or engineered wall design.`,
		engineerLikely: true
	});
	if (!habitableAbove && stories === 1 && studSpacing != null && studSpacing > 24) findings.push({
		id: "stud-oc-roof",
		severity: "REQUIRED",
		code: "R602.3(5)",
		title: "Stud spacing exceeds 24 in O.C.",
		message: `Studs at ${studSpacing}" O.C. exceed the conventional 24" maximum even for roof-ceiling only.`,
		engineerLikely: true
	});
	if (habitableAbove && (stories ?? 0) >= 3 && studSize === "2x4") findings.push({
		id: "stud-stories",
		severity: "REQUIRED",
		code: "R602.3(5)",
		title: "2x4 supporting two floors is outside this table path",
		message: "A 2x4 wall supporting two floors plus a roof-ceiling is outside the simple Table R602.3(5) path Howler checks. Have a design professional size the wall, or change the stud size.",
		engineerLikely: true
	});
	if (habitableAbove && bp.joistSize && bp.joistSpacingIn && bp.widthIn && bp.depthIn) {
		const span = joistSpanIn(bp);
		const allowed = tabulatedJoistSpanIn(bp.joistSize, bp.joistSpacingIn);
		if (span != null && allowed != null && span > allowed) findings.push({
			id: "joist-span",
			severity: "REQUIRED",
			code: "R502.3 / Table R502.3.1(2)",
			title: "Floor joist span exceeds tabulated",
			message: `Joists span ${formatFtIn(span)} at ${bp.joistSize} ${bp.joistSpacingIn}" O.C. (${speciesLabel(bp.joistSpecies)}, 40 psf LL / 10 psf DL). Tabulated max is ${formatFtIn(allowed)}. Add a bearing beam, tighten spacing, step up the joist, or engineer the floor.${trade ? " Tradewalk A07 calls for an LVL to support the joists; Murphy 1.75×20 B1/B2/B3 PASSED (8/17/2026, IRC 2018, 40/12). The unsplit envelope is not the joist span — place the bearings. That is not a new PE stamp." : ""}`,
			engineerLikely: true
		});
	} else if (habitableAbove && (!bp.joistSize || !bp.joistSpacingIn)) findings.push({
		id: "joist-unknown",
		severity: "WATCH",
		code: "R502.3",
		title: "Floor joists are Unknown",
		message: "A floor above the garage is in scope, but joist size and spacing are not recorded. Enter them (example: 2x10 at 16 on center) so Howler can check Table R502.3.1(2).",
		engineerLikely: false
	});
	if (bp.rafterSize && bp.rafterSpacingIn) {
		const span = rafterHorizontalSpanIn(bp);
		const allowed = tabulatedRafterSpanIn(bp.rafterSize, bp.rafterSpacingIn);
		if (span != null && allowed != null && span > allowed) findings.push({
			id: "rafter-span",
			severity: "REQUIRED",
			code: "R802.5 / Table R802.5.1(1)",
			title: "Rafter span exceeds tabulated (sawn lumber)",
			message: `Rafters run ${formatFtIn(span)} horizontally at ${bp.rafterSize} ${bp.rafterSpacingIn}" O.C. Conservative 20 psf snow tabulated max is ${formatFtIn(allowed)}. Use a ridge beam, closer spacing, larger rafters, or engineered trusses.`,
			engineerLikely: true
		});
	} else if (bp.widthIn && bp.roofRise && bp.roofRun && !bp.rafterSize) findings.push({
		id: "rafter-unknown",
		severity: "INFO",
		code: "R802.5",
		title: "Rafters / trusses are Unknown",
		message: "Roof pitch is recorded but rafter size is not. Common path on this occupancy is engineered roof trusses (AHJ typically requires the sealed truss package) or sawn rafters checked to Table R802.5.1(1).",
		engineerLikely: false
	});
	if (bp.overheadDoorWidthIn != null && bp.overheadDoorWidthIn >= 192 && habitableAbove) findings.push({
		id: "header",
		severity: "REQUIRED",
		code: "R602.7",
		title: "Wide overhead-door header",
		message: `Overhead door is ${formatFtIn(bp.overheadDoorWidthIn)} with a floor above. Sawn-lumber headers in Table R602.7 typically do not cover this opening. Specify an engineered header / LVL and have it sized.`,
		engineerLikely: true
	});
	else if ((bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE") && bp.overheadDoorWidthIn == null) findings.push({
		id: "door-unknown",
		severity: "INFO",
		code: "R602.7",
		title: "Overhead door size is Unknown",
		message: trade ? "A09 shows two garage-door openers (double + single per Scope). Leaf widths are not dimensioned on A01. Enter them — Howler will not invent a 16-foot door." : "Header and king/jack studs cannot be laid out until the door width is entered.",
		engineerLikely: false
	});
	if (bp.occupancy === "POST_AND_FRAME") {
		const widthFt = bp.widthIn ? (bp.widthIn + 2 * (bp.overhangIn ?? 0)) / 12 : null;
		const wallFt = bp.eaveHeightIn ? bp.eaveHeightIn / 12 : null;
		const over = [
			widthFt != null && widthFt > 48 ? `width including overhang ${widthFt.toFixed(1)} ft > 48 ft` : null,
			wallFt != null && wallFt > 16 ? `wall height ${wallFt.toFixed(1)} ft > 16 ft` : null,
			(bp.stories ?? 1) > 1 ? "more than one story" : null
		].filter(Boolean);
		if (over.length) findings.push({
			id: "r327",
			severity: "REQUIRED",
			code: "R327",
			title: "Post-and-frame outside KRC R327 limits",
			message: `R327 conventional post-and-frame is single-story, 48 ft max width including overhang, 16 ft max wall, 20 ft mean roof, 8 ft max post spacing. This envelope is outside: ${over.join("; ")}. Structural calculations or R106.1 design professional required.`,
			engineerLikely: true
		});
		else findings.push({
			id: "r327-ok",
			severity: "INFO",
			code: "R327",
			title: "Post-and-frame appears inside R327 limits",
			message: "Stay inside: 6x6 min posts, 8 ft max spacing, poured piers 48 in below grade, 2x4 girts 24 in O.C., knee braces, metal roof on purlins. Confirm soil 2,000 psf assumption with the AHJ.",
			engineerLikely: false
		});
	}
	if ((bp.stories ?? 0) > 3) findings.push({
		id: "stories",
		severity: "REQUIRED",
		code: "R101 / KBC",
		title: "More than three stories",
		message: "Buildings over three stories are outside the Kentucky Residential Code. Use the Kentucky Building Code with a registered design professional.",
		engineerLikely: true
	});
	findings.push({
		id: "truss-package",
		severity: "INFO",
		code: "R802.10",
		title: "Truss placement package",
		message: "If the roof is engineered trusses, the manufacturer’s sealed placement drawings and bracing details are typically required by the AHJ even when the rest of the building is conventional construction.",
		engineerLikely: false
	});
	findings.push({
		id: "wind",
		severity: "INFO",
		code: "Table R301.2(1)",
		title: "Wind and weathering (statewide)",
		message: "Kentucky Vult = 115 mph all counties. Concrete weathering = Severe. Investigate topographic effects per R301.2.1. Air-entrain concrete per Table R402.2.",
		engineerLikely: false
	});
	const skipUnresolved = /* @__PURE__ */ new Set([
		"env-unknown",
		"ohd-leaf",
		"frost"
	]);
	const unresolved = unresolvedRegister(bp);
	const offsetCount = unresolved.filter((item) => item.id.startsWith("off-")).length;
	for (const item of unresolved) {
		if (skipUnresolved.has(item.id) || item.id.startsWith("off-")) continue;
		findings.push({
			id: item.id,
			severity: item.blocking ? "WATCH" : "INFO",
			code: "Coordination",
			title: item.title,
			message: `${item.message} See ${item.sheet}.`,
			engineerLikely: false
		});
	}
	if (offsetCount) findings.push({
		id: "offsets-proposed",
		severity: "INFO",
		code: "Coordination",
		title: `${offsetCount} opening offset${offsetCount === 1 ? "" : "s"} not verified`,
		message: "Door and window offsets from corners are proposed until confirmed. Tags and sizes stay as recorded. Howler will not treat a placeholder offset as a field measurement.",
		engineerLikely: false
	});
	if ((bp.drawingStatus ?? "DRAFT") !== "ISSUED" && envelopeComplete(bp)) findings.push({
		id: "not-issued",
		severity: "INFO",
		code: "Issue",
		title: `${bp.drawingStatus ?? "DRAFT"} — not issued for layout`,
		message: "Issue the set when a contractor should work from this revision. Issue lists unresolved items on the title block. It is still not a PE stamp.",
		engineerLikely: false
	});
	return findings;
}
function engineerRequired(project) {
	return computePlanFindings(project).filter((finding) => finding.engineerLikely);
}
function plansStatusLine(project) {
	const bp = ensureBlueprint(project);
	const bits = [];
	if (bp.widthIn && bp.depthIn) bits.push(`${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}`);
	else bits.push("envelope Unknown");
	if (bp.roofRise && bp.roofRun) bits.push(`${bp.roofRise}/${bp.roofRun} pitch`);
	if (bp.county) bits.push(`${bp.county} Co`);
	if (engineerRequired(project).length) bits.push("engineer review likely");
	return bits.join(" · ");
}
var COMMAND_EXAMPLES = [
	{
		group: "Upload",
		phrase: "Review the Deboard plans from my Google Drive",
		does: "Adopt the recorded Tradewalk set"
	},
	{
		group: "Upload",
		phrase: "Use the Tradewalk plans",
		does: "Same as dropping Deboard Tradewalk Plans.pdf"
	},
	{
		group: "Plans",
		phrase: "Draw the working set",
		does: "Generate A01–A11 + A15 from the live model"
	},
	{
		group: "Plans",
		phrase: "Fill conventional framing",
		does: "Same as the conventional button"
	},
	{
		group: "Plans",
		phrase: "Rooms from scope",
		does: "Name rooms from included scope"
	},
	{
		group: "Plans",
		phrase: "24 by 32 garage, 9 foot walls, 8/12 roof",
		does: "Record envelope (proposed, not field-measured)"
	},
	{
		group: "Plans",
		phrase: "Man door 2868 on the left",
		does: "Tag and size from the door schedule"
	},
	{
		group: "Plans",
		phrase: "16 by 7 overhead on the front",
		does: "Record an OHD only when you name the size"
	},
	{
		group: "Plans",
		phrase: "Face of framing",
		does: "Dimension datum"
	},
	{
		group: "Issue",
		phrase: "Mark envelope verified",
		does: "Field measurement, not a sketch"
	},
	{
		group: "Issue",
		phrase: "Mark the drawings reviewed",
		does: "Reviewed, not issued"
	},
	{
		group: "Issue",
		phrase: "Issue the drawings",
		does: "Issue for layout — lists unresolved"
	},
	{
		group: "Issue",
		phrase: "Export the PDF",
		does: "Print the set and queue issue"
	},
	{
		group: "Code",
		phrase: "What's the code basis",
		does: "2018 KRC / 815 KAR 7:125"
	},
	{
		group: "Code",
		phrase: "What's the stair code",
		does: "KY 8¼\" / 9\" — not IRC 7¾ / 10"
	},
	{
		group: "Code",
		phrase: "What's SB3621",
		does: "3'-6\" × 2'-1\" window tag — not a Simpson holdown"
	},
	{
		group: "Job",
		phrase: "Hey Howler, McMillan exterior is closing out",
		does: "Wake + mark released closeout in progress. Interior stays held."
	},
	{
		group: "Job",
		phrase: "How's McMillan",
		does: "Spoken brief — no mutation"
	},
	{
		group: "Job",
		phrase: "Add scope mini split for the office",
		does: "Ripple: scope + unpriced CO. Revised unchanged"
	},
	{
		group: "Job",
		phrase: "Footing inspection passed",
		does: "Inspections card — not a PE stamp"
	},
	{
		group: "Job",
		phrase: "Permit submitted",
		does: "AHJ filing, not issued"
	},
	{
		group: "Job",
		phrase: "Add contact Medina Plumbing plumbing",
		does: "Trades / vendors"
	},
	{
		group: "Job",
		phrase: "Photo: footing rebar before pour",
		does: "Photos caption only"
	}
];
function recognizeEvidence(name) {
	const n = name.toLowerCase();
	if (/yeiser/.test(n)) return "STRUCTURAL";
	if (/mcmillanporch|kitchen plans|basement plans|garrison plans|ganzel plans|plans - revised/.test(n)) return "TRADEWALK";
	if (/scope of work|sow/.test(n)) return "SCOPE";
	if (/deboard/.test(n) && /calc/.test(n)) return "CALCS";
	if (/stanfield|david s\.? deboard framing/.test(n)) return "FRAMING";
	if (/deboard/.test(n) && /tradewalk|plan/.test(n)) return "TRADEWALK";
	if (/tradewalk/.test(n) && /deboard/.test(n)) return "TRADEWALK";
	if (/tradewalk/.test(n)) return "TRADEWALK";
	if (/estimate|invoice/.test(n)) return "ESTIMATE";
	if (/quote/.test(n)) return "QUOTE";
	if (/site plan/.test(n)) return "SITE";
	if (/how to plan a remodel/.test(n)) return "PROCESS";
	return "UPLOAD";
}
/** Only Deboard-named Tradewalk / calcs / framing replace the Deboard working set. */
function shouldAdoptDeboardTradewalk(name) {
	const n = name.toLowerCase();
	if (/north|garrison|ganzel|tyler|mcmillan|ciurlizza|craven|gainesway|andover|savannah|montclair|creek rock/.test(n)) return false;
	return /deboard/.test(n) && /tradewalk|calc|framing|plan/.test(n);
}
function evidenceNote(kind, name) {
	if (kind === "TRADEWALK") {
		if (/deboard/i.test(name)) return `${name} matches the Deboard Tradewalk Plans set. Sheets A01–A11 + A15 will redraw from that model after you confirm.`;
		return `${name} is a visual Tradewalk / drawing set. Recorded as a reference on this job. Howler will not hang it on a different address and will not invent geometry from it.`;
	}
	if (kind === "CALCS") return `${name} matches Deboard Calcs (Murphy LVL). Adopting the Tradewalk working set so B1/B2/B3 stay coordinated.`;
	if (kind === "FRAMING") return `${name} matches Stanfield / Deboard framing. Adopting the Tradewalk working set it cites.`;
	if (kind === "STRUCTURAL") return `${name} is recorded as structural/markup evidence. Howler did not scale it. Field-verify callouts stay field-verify.`;
	if (kind === "SCOPE") return `${name} is a scope document, not a floor plan. Geometry stays Unknown.`;
	if (kind === "SITE") return `${name} is a site / ADU narrative. Not governing geometry unless you say so.`;
	if (kind === "ESTIMATE" || kind === "QUOTE") return `${name} is a price file, not a drawing. Howler will not invent a total from a garbled extract.`;
	if (kind === "PROCESS") return `${name} is company process documentation, not a job drawing.`;
	return `${name} is recorded as evidence. Howler did not scale it and did not invent a building from it. Name the dimensions it contains, or say it is the Tradewalk set.`;
}
function parseOpeningTag(raw) {
	const match = /^([A-Z]{0,3})(\d)(\d)(\d)(\d)([A-Z]{0,3})$/i.exec(raw.trim());
	if (!match) return null;
	return {
		tag: raw.trim().toUpperCase(),
		prefix: match[1].toUpperCase(),
		suffix: match[6].toUpperCase(),
		widthIn: Number(match[2]) * 12 + Number(match[3]),
		heightIn: Number(match[4]) * 12 + Number(match[5])
	};
}
function sizeFromDoorTag(tag) {
	const parsed = parseOpeningTag(tag);
	if (!parsed) return null;
	return {
		widthIn: parsed.widthIn,
		heightIn: parsed.heightIn
	};
}
var JR_SITE_RULES = [
	"Do not enter or work inside if anyone 18 or younger is present without an adult. If they arrive, leave immediately and call the office.",
	"No alcohol. No profanity. No smoking. No loud music. Clean shoes, booties, or socks only.",
	"Do not enter areas outside the scope unless the client or J&R asks.",
	"Shirt at all times. No tank tops. No vulgar slogans.",
	"Report defects, safety issues, accidents, or concerns immediately to J&R.",
	"Clean up after yourself. Never use the client's tools or supplies.",
	"End of day: clean enough for a 3-year-old to walk in.",
	"If it doesn't look right or match — do not install it. Ask first.",
	"If you spill it, clean it immediately.",
	"If protection is missing on appliances, tubs, tile, or windows — stop and tell J&R.",
	"After you install — cover for protection until the next phase.",
	"If you break or damage anything, contact J&R immediately."
];
function item(id, description, phase, opts = {}) {
	return {
		id,
		description,
		phase,
		trade: opts.trade ?? null,
		included: opts.included ?? true,
		complete: opts.complete ?? false,
		activityId: opts.activityId ?? null,
		allowanceLineId: opts.allowanceLineId ?? null,
		notes: opts.notes ?? null,
		fromBaseline: opts.fromBaseline ?? true
	};
}
/** Carver/Julian SOW — two baths. Dashboard is final closeout. Remaining: electrical finals, vanities, glass. */
function carverSowScope() {
	return {
		"scp-mb-demo": item("scp-mb-demo", "Master bath demolition", "Demo", {
			trade: "Demo",
			complete: true,
			activityId: "act-demo",
			notes: "SOW: retain existing tub/surround and floor at curbed shower. Demo for plumbing, electrical, tile, framing only."
		}),
		"scp-mb-frame": item("scp-mb-frame", "Master bath framing / blocking", "Framing", {
			trade: "Framing",
			complete: true,
			activityId: "act-frame",
			notes: "Curbed shower, stone-curb blocking, shower-door / grab-bar blocking, 12\"H × 28\"W Schluter niche header. master design.pdf A04."
		}),
		"scp-mb-plumb": item("scp-mb-plumb", "Master bath plumbing", "Systems", {
			trade: "Plumbing",
			complete: true,
			activityId: "act-mech-rough",
			notes: "Shower valve/trim, vanity rehook, tub faucet rehook, bidet. Remaining closeout is electrical/vanity/glass — not a new plumbing punch on the KF dashboard."
		}),
		"scp-mb-elec": item("scp-mb-elec", "Master bath electrical rough", "Systems", {
			trade: "Electrical",
			complete: true,
			activityId: "act-mech-rough",
			notes: "Two sconces, can over tub, can over shower, heated exhaust, towel-warmer outlet, bidet outlet, GFCI. Finals still open (Waylon, Sep 9 — not field-confirmed)."
		}),
		"scp-mb-drywall": item("scp-mb-drywall", "Master bath drywall", "Finishes", {
			trade: "Drywall",
			complete: true,
			activityId: "act-drywall",
			notes: "Moisture-resistant in wet areas. Glue and screw."
		}),
		"scp-mb-schluter": item("scp-mb-schluter", "Master bath Schluter waterproofing", "Wet", {
			trade: "Tile",
			complete: true,
			activityId: "act-tile",
			notes: "Pan, curb, membrane, banding, corners, drain, flood test. Per manufacturer."
		}),
		"scp-mb-tile": item("scp-mb-tile", "Master bath tile", "Finishes", {
			trade: "Tile",
			complete: true,
			activityId: "act-tile",
			notes: "Walls, floor, 12×28 niche at 48\" AFF. Power grout. Look-ahead Aug 3 was already tile finals."
		}),
		"scp-mb-paint": item("scp-mb-paint", "Master bath painting", "Painting", {
			trade: "Painting",
			complete: true,
			activityId: "act-paint",
			notes: "Drywall touch-ups matching. Vanity paint is with Artistic, still open."
		}),
		"scp-ub-demo-frame": item("scp-ub-demo-frame", "Upstairs bath demo + expand into closet", "Demo", {
			trade: "Framing",
			complete: true,
			activityId: "act-demo",
			notes: "Full demo. Expand into office closet. Keep vanity for reuse. hall design.pdf A02/A03."
		}),
		"scp-ub-wet": item("scp-ub-wet", "Upstairs bath plumbing / Schluter / tile", "Finishes", {
			trade: "Tile",
			complete: true,
			activityId: "act-tile",
			notes: "New shower, toilet, bidet. Schluter system. 12×28 niche at 48\" AFF. Horizontal grab 36\" AFF."
		}),
		"scp-ub-paint": item("scp-ub-paint", "Upstairs bath painting", "Painting", {
			trade: "Painting",
			complete: true,
			activityId: "act-paint",
			notes: "Two coats walls, two coats trim, flat ceiling."
		}),
		"scp-elec-final": item("scp-elec-final", "Electrical finals — Waylon", "Closeout", {
			trade: "Electrical",
			complete: false,
			activityId: "act-elec",
			notes: "Scheduled Wed Sep 9. KF dashboard did not confirm complete."
		}),
		"scp-vanity": item("scp-vanity", "Artistic vanities — both baths", "Closeout", {
			trade: "Cabinetry",
			complete: false,
			activityId: "act-vanity",
			notes: "Master: refinish existing, two coats. Upstairs: reuse original, panel open end, cabinet above toilet. Artistic Sep 9 not field-confirmed."
		}),
		"scp-glass": item("scp-glass", "Gatsby Glass shower doors — both baths", "Closeout", {
			trade: "Glass",
			complete: false,
			activityId: "act-glass",
			notes: "Master: pull handle interior, towel bar exterior. Upstairs: glass doors. Template Wed Sep 16 8:00–9:00 a.m."
		})
	};
}
/** Deboard garage SOW — full contracted build. Foundation is underway; the rest is still ahead. */
function deboardSowScope() {
	return {
		"scp-site": item("scp-site", "Site preparation / layout / pad", "Site", {
			trade: "Site",
			complete: true,
			activityId: "act-footer",
			notes: "SOW: layout, excavate, compact pad, drainage, rough grade. Footer and block are in — pad is behind them."
		}),
		"scp-footer": item("scp-footer", "Reinforced footings", "Foundation", {
			trade: "Concrete",
			complete: true,
			activityId: "act-footer",
			notes: "Stair-stepped as required. Complete."
		}),
		"scp-masonry": item("scp-masonry", "CMU stem walls", "Foundation", {
			trade: "Masonry",
			complete: true,
			activityId: "act-block",
			notes: "Fully slushed, anchor bolts. Brick veneer / soldier course / quoins are later."
		}),
		"scp-slab": item("scp-slab", "Garage + mower-storage slab", "Foundation", {
			trade: "Concrete",
			complete: false,
			activityId: "act-concrete",
			notes: "SOW order: Footer, Block, Framing dried in, then poured concrete. KF: Sam expected complete Sat Sep 12 — not marked complete from a target."
		}),
		"scp-garage": item("scp-garage", "Detached garage structure", "Structure", {
			trade: "Framing",
			complete: false,
			activityId: "act-framing",
			notes: "Two-car garage, mower storage, stairwell, second-floor office/flex, half bath, attic storage. John Marr unconfirmed after pads."
		}),
		"scp-brick": item("scp-brick", "Full brick veneer to match house", "Envelope", {
			trade: "Masonry",
			complete: false,
			notes: "Soldier courses, quoins, ties, flashing. After dry-in."
		}),
		"scp-roof": item("scp-roof", "Roofing / weatherproofing", "Envelope", {
			trade: "Roofing",
			complete: false,
			activityId: "act-roof",
			notes: "Ice/water, underlayment, shingles, flashing, ridge vent, soffit, fascia, gutters, downspouts."
		}),
		"scp-openings": item("scp-openings", "Windows, service door, overhead doors", "Envelope", {
			trade: "Openings",
			complete: false,
			notes: "Energy-efficient windows at office. One double OHD + one single OHD at mower storage. Leaf widths Unknown."
		}),
		"scp-bath": item("scp-bath", "Half bath", "Systems", {
			trade: "Plumbing",
			complete: false,
			activityId: "act-mech",
			allowanceLineId: "line-fixtures",
			notes: "Second-floor half bath. Option on A11 — in or out not decided."
		}),
		"scp-office": item("scp-office", "Conditioned second-floor office / flex", "Finishes", {
			trade: "Interior",
			complete: false,
			notes: "Mini-split HVAC, insulation, drywall, paint, flooring. Added after baseline walk.",
			fromBaseline: false
		}),
		"scp-hvac": item("scp-hvac", "Mini-split HVAC — second floor", "Systems", {
			trade: "HVAC",
			complete: false,
			activityId: "act-mech",
			notes: "Serving finished office/flex only."
		}),
		"scp-electrical": item("scp-electrical", "Electrical service, rough, lighting", "Systems", {
			trade: "Electrical",
			complete: false,
			activityId: "act-mech",
			notes: "Jason Bonham follow-on unconfirmed. Panel location Unknown."
		}),
		"scp-cabinetry": item("scp-cabinetry", "Office cabinetry", "Finishes", {
			trade: "Cabinetry",
			complete: false,
			activityId: "act-cabinetry"
		}),
		"scp-final": item("scp-final", "Final grade, cleanup, inspections, walkthrough", "Closeout", {
			trade: null,
			complete: false
		})
	};
}
/** Ciurlizza basement SOW + kitchen/basement Tradewalk items. Failed Fayette inspection is the live gate. */
function ciurlizzaSowScope() {
	return {
		"scp-demo": item("scp-demo", "Basement leftover demo / debris", "Demo", {
			trade: "Demo",
			complete: true,
			notes: "SOW: remove leftover construction materials. Framing exists to fail inspection."
		}),
		"scp-frame": item("scp-frame", "Basement 2x4 / 2x6 walls, soffits, chases", "Framing", {
			trade: "Framing",
			complete: true,
			notes: "Built. Fayette County failed — not a passed framing card. Fire stop, LVL docs, 2x4 strapping still required."
		}),
		"scp-correct": item("scp-correct", "Failed inspection corrections", "Corrections", {
			complete: false,
			notes: "31-W fire stop Tue Sep 15. LVL specs from Marcus / 84 Lumber. 2x4 wall strapping. Reinspection Thu Sep 17."
		}),
		"scp-fire": item("scp-fire", "31-W fire stop", "Corrections", {
			trade: "Firestopping",
			complete: false,
			activityId: "act-firestop"
		}),
		"scp-lvl": item("scp-lvl", "LVL specifications / documentation", "Corrections", {
			trade: "Lumber",
			complete: false,
			activityId: "act-lvl",
			notes: "Marcus at 84 Lumber. Howler will not invent sizes."
		}),
		"scp-strap": item("scp-strap", "2x4 wall strapping", "Corrections", {
			trade: "Framing",
			complete: false,
			activityId: "act-strap"
		}),
		"scp-plumb": item("scp-plumb", "Basement full-bath plumbing rough", "Systems", {
			trade: "Plumbing",
			complete: false,
			notes: "Shower, toilet, single vanity. Locations confirmed at plumber walk-thru. Option: whole-house filtration."
		}),
		"scp-elec": item("scp-elec", "Basement electrical — 21 cans + bath", "Systems", {
			trade: "Electrical",
			complete: false,
			notes: "21 can lights, TV backlighting, surround, mechanical lighting, 2 vanity pendants, exhaust, flush mount."
		}),
		"scp-hvac": item("scp-hvac", "Basement HVAC supplies/returns + bath vent", "Systems", {
			trade: "HVAC",
			complete: false
		}),
		"scp-insul": item("scp-insul", "Batt insulation — new walls and bathroom", "Envelope", {
			trade: "Insulation",
			complete: false,
			notes: "Blocked until reinspection passes."
		}),
		"scp-drywall": item("scp-drywall", "Basement drywall", "Finishes", {
			trade: "Drywall",
			complete: false,
			activityId: "act-antle",
			notes: "Material Fri Sep 18. Antle Mon Sep 21. Contingent on county clearance."
		}),
		"scp-tile": item("scp-tile", "Onyx shower + bath floor tile", "Finishes", {
			trade: "Tile",
			complete: false,
			notes: "Onyx shower system per basement SOW."
		}),
		"scp-windows": item("scp-windows", "Bay and egress windows (Builders First Choice)", "Envelope", {
			complete: false,
			notes: "Verify with Colin that both are ordered. Secondary to inspection. Kitchen + basement Tradewalk."
		}),
		"scp-pocket": item("scp-pocket", "Frosted pocket door (Cox Interiors)", "Finishes", {
			complete: false,
			notes: "Approved order — track. Kitchen Tradewalk callout."
		}),
		"scp-kitchen-beam": item("scp-kitchen-beam", "Kitchen beam as needed for removed posts", "Framing", {
			trade: "Framing",
			complete: false,
			notes: "KITCHEN PLANS 4.29 A04 + Yeiser LVL 5.25×16. Existing steel FIELD VERIFY."
		})
	};
}
var CARVER_RULES = JR_SITE_RULES;
var DEBOARD_RULES = JR_SITE_RULES;
var CIURLIZZA_RULES = JR_SITE_RULES;
/**
* Field job book — inspections, trades, materials, photos, selections.
* Derived from the same project truth as Plans. Howler will not invent a pass.
*/
var INSPECTION_STATUSES = [
	{
		id: "NOT_READY",
		label: "Not ready"
	},
	{
		id: "READY",
		label: "Ready to call"
	},
	{
		id: "SCHEDULED",
		label: "Scheduled"
	},
	{
		id: "PASSED",
		label: "Passed"
	},
	{
		id: "FAILED",
		label: "Failed"
	}
];
function emptyJob() {
	return {
		permitStatus: "NOT_FILED",
		permitNumber: null,
		inspections: Object.fromEntries(defaultInspections().map((item) => [item.id, item])),
		contacts: {},
		selections: {},
		photos: {},
		rules: []
	};
}
function defaultInspections() {
	return [
		{
			id: "insp-footing",
			name: "Footing",
			code: "R403",
			status: "NOT_READY",
			date: null,
			notes: "Before placing concrete."
		},
		{
			id: "insp-foundation",
			name: "Foundation / slab",
			code: "R506 / R309.1",
			status: "NOT_READY",
			date: null,
			notes: "Slope to door or drain. Air-entrain (Severe)."
		},
		{
			id: "insp-framing",
			name: "Framing",
			code: "R602 / R502 / R802",
			status: "NOT_READY",
			date: null,
			notes: "OHD headers wait on leaf width. Stair run Unknown."
		},
		{
			id: "insp-rough-e",
			name: "Rough electrical",
			code: "E3901 / E3902",
			status: "NOT_READY",
			date: null,
			notes: "GFCI, 20A garage circuit. Panel location Unknown."
		},
		{
			id: "insp-rough-p",
			name: "Rough plumbing",
			code: "P2601",
			status: "NOT_READY",
			date: null,
			notes: "Half bath is an option — skip if out."
		},
		{
			id: "insp-insulation",
			name: "Insulation / energy",
			code: "N1102",
			status: "NOT_READY",
			date: null,
			notes: "R-values on A06 are mins, not a REScheck."
		},
		{
			id: "insp-final",
			name: "Final",
			code: "R110",
			status: "NOT_READY",
			date: null,
			notes: "AHJ card. Not a PE stamp."
		}
	];
}
function ensureJob(project) {
	const base = project.job ?? emptyJob();
	const inspections = {
		...Object.fromEntries(defaultInspections().map((item) => [item.id, item])),
		...base.inspections
	};
	return {
		permitStatus: base.permitStatus ?? "NOT_FILED",
		permitNumber: base.permitNumber ?? null,
		inspections,
		contacts: base.contacts ?? {},
		selections: base.selections ?? {},
		photos: base.photos ?? {},
		rules: base.rules ?? []
	};
}
function deboardJob() {
	const inspections = Object.fromEntries(defaultInspections().map((item) => [item.id, item]));
	inspections["insp-footing"] = {
		...inspections["insp-footing"],
		status: "READY",
		notes: "Footer activity is complete. Card not recorded — not marked passed."
	};
	return {
		permitStatus: "NOT_FILED",
		permitNumber: null,
		inspections,
		contacts: {
			"ct-marr": {
				id: "ct-marr",
				name: "John Marr",
				trade: "Framing",
				phone: "813-477-7007",
				notes: "Custom Home Expert LLC. Field schedule after Sam. Tracker also lists David Stanfield as SELECTED framing labor."
			},
			"ct-bonham": {
				id: "ct-bonham",
				name: "Jason Bonham",
				trade: "Electrical",
				phone: null,
				notes: "Forecast $15,000 electrical. Tracker 16.010 still says Elliot pending."
			},
			"ct-sam": {
				id: "ct-sam",
				name: "Sam the Concrete Man",
				trade: "Concrete",
				phone: "859-539-6809",
				notes: "Samuel Haralu. Selected package $26,200."
			},
			"ct-medyna": {
				id: "ct-medyna",
				name: "Medyna Plumbing",
				trade: "Plumbing",
				phone: "859-576-8680",
				notes: "Estimate #230 at $7,800. Alex Medyna."
			},
			"ct-antle": {
				id: "ct-antle",
				name: "Antle Drywall",
				trade: "Drywall",
				phone: "859-326-1183",
				notes: "Timothy Antle. Tracker $6,800 / forecast $7,500."
			},
			"ct-jasper": {
				id: "ct-jasper",
				name: "Dylan Jasper",
				trade: "Painting",
				phone: null,
				notes: "Agreed labor $4,000."
			},
			"ct-parker": {
				id: "ct-parker",
				name: "Anthony Parker",
				trade: "HVAC",
				phone: "859-771-4613",
				notes: "Parkers Heating and Cooling. Forecast $7,366 vs tracker $5,250."
			},
			"ct-stanfield": {
				id: "ct-stanfield",
				name: "David Stanfield",
				trade: "Framing",
				phone: "859-241-7059",
				notes: "Tracker SELECTED $13,500.72 framing labor. Field is John Marr."
			},
			"ct-bldr": {
				id: "ct-bldr",
				name: "Builders First Choice",
				trade: "Materials",
				phone: "502-735-5703",
				notes: "Collin Veley. Quote SO 88750150 expired."
			}
		},
		selections: {
			"sel-brick": {
				id: "sel-brick",
				name: "Brick veneer",
				value: "Match existing house",
				status: "MATCH_EXISTING",
				notes: "Soldier course, quoins, eave return — A04."
			},
			"sel-ohd": {
				id: "sel-ohd",
				name: "Overhead doors",
				value: null,
				status: "UNKNOWN",
				notes: "Two openers on A09. Leaf widths Unknown."
			},
			"sel-bath": {
				id: "sel-bath",
				name: "Half bath",
				value: null,
				status: "UNKNOWN",
				notes: "Option on A11. In or out not decided."
			},
			"sel-sb3621": {
				id: "sel-sb3621",
				name: "SB3621 windows",
				value: "3'-6\" × 2'-1\" (tag)",
				status: "UNKNOWN",
				notes: "Operation SB and wall Unknown. Not Simpson SSTB36."
			}
		},
		photos: {},
		rules: DEBOARD_RULES
	};
}
function materialTakeoff(project) {
	const bp = ensureBlueprint(project);
	const lines = framingTakeoff(bp).map((line) => ({
		id: line.id,
		trade: "Framing",
		item: line.label,
		qty: line.count == null ? "Unknown" : `${line.count} × ${line.size} @ ${line.lengthEach}`,
		status: line.count == null ? "UNKNOWN" : "FROM_MODEL",
		notes: line.notes
	}));
	if (citesTradewalk(bp)) for (const lvl of TRADEWALK.lvls.slice(0, 3)) lines.push({
		id: `lvl-${lvl.slice(0, 2)}`,
		trade: "Framing",
		item: lvl.split("—")[0]?.trim() ?? lvl,
		qty: "See Deboard Calcs",
		status: "FROM_MODEL",
		notes: "Murphy LVL PASSED. Not a Howler stamp."
	});
	if (!bp.openings.some((item) => item.kind === "OHD") && bp.overheadDoorWidthIn == null) lines.push({
		id: "mat-ohd",
		trade: "Doors",
		item: "Overhead door leaves",
		qty: "Unknown",
		status: "UNKNOWN",
		notes: "Double + single. Howler will not invent 16'-0\"."
	});
	lines.push({
		id: "mat-stair",
		trade: "Framing",
		item: "Stair stringers",
		qty: "Unknown",
		status: "UNKNOWN",
		notes: "KY 8¼\" max riser / 9\" min tread. Run not placed."
	});
	return lines;
}
var PERMIT_LABEL = {
	NOT_FILED: "Not filed",
	SUBMITTED: "Submitted",
	ISSUED: "Issued"
};
/**
* One fact, many ledgers. A command is not a form in one module —
* it is a ripple Howler traces before you confirm.
*
* Honesty: Howler will not invent a price, rewrite a committed date,
* approve a CO, or place a fixture. Those hops stay NEEDS_YOU / WATCH.
*/
var TRADES = [
	"plumbing",
	"electrical",
	"hvac",
	"framing",
	"concrete",
	"masonry",
	"roofing",
	"cabinetry"
];
function tradeFromText(text) {
	const lower = text.toLowerCase();
	if (/\b(mini[- ]?split|heat pump|hvac|air handler)\b/.test(lower)) return "HVAC";
	const hit = TRADES.find((trade) => lower.includes(trade));
	return hit ? hit[0].toUpperCase() + hit.slice(1) : null;
}
function activityForTrade(project, trade) {
	if (!trade) return {
		hit: null,
		candidates: []
	};
	const needle = trade.toLowerCase();
	const open = Object.values(project.activities).filter((item) => item.trade && item.trade.toLowerCase() === needle && item.state !== "COMPLETE");
	if (open.length === 1) return {
		hit: open[0],
		candidates: [open[0].name]
	};
	return {
		hit: null,
		candidates: open.map((item) => item.name)
	};
}
function scopeAddRipple(project, description, trade) {
	const summary = financialSummary(project);
	const activity = activityForTrade(project, trade);
	const namedRoom = Object.values(ensureBlueprint(project).rooms).find((room) => description.toLowerCase().split(/\s+/).some((word) => word.length > 3 && room.name.toLowerCase().includes(word)));
	return [
		{
			ledger: "Scope",
			moduleId: "scope",
			status: "WILL_WRITE",
			fact: `Add “${description}” after baseline. Not original contract work.`
		},
		{
			ledger: "Change Orders",
			moduleId: "change-orders",
			status: "WILL_WRITE",
			fact: "Draft an unpriced CO for this scope. Howler will not invent a dollar amount."
		},
		{
			ledger: "Budget",
			moduleId: "budget",
			status: summary ? "UNCHANGED" : "NEEDS_YOU",
			fact: summary ? `Revised stays ${formatMoney(summary.revisedBudget)} until you price the CO and approve it. Pending never inflates Revised.` : "Budget is not initialized. The CO still drafts; money stays Unknown."
		},
		{
			ledger: "Schedule",
			moduleId: "schedule",
			status: activity.hit ? "WATCH" : "NEEDS_YOU",
			fact: activity.hit ? `Candidate activity “${activity.hit.name}” — associated, not rewritten. Committed dates stay put.` : activity.candidates.length ? `Several ${trade} activities. Name which one. Dates are not moved.` : "No schedule activity named. Howler will not invent a duration."
		},
		{
			ledger: "Plans",
			moduleId: "plans",
			status: namedRoom ? "WATCH" : "WATCH",
			fact: namedRoom ? `Room “${namedRoom.name}” exists. Equipment is not placed. Howler will not invent a pad or circuit.` : "No matching room. A01 does not gain a fixture from a scope sentence."
		},
		{
			ledger: "Materials",
			moduleId: "materials",
			status: "WATCH",
			fact: "Takeoff stays derived from the model. This item is not a counted stick until you specify it."
		},
		{
			ledger: "Inspections",
			moduleId: "inspections",
			status: "WATCH",
			fact: trade === "Electrical" || trade === "HVAC" || trade === "Plumbing" ? `Rough ${trade.toLowerCase()} may pick up work. Panel / fixture locations stay Unknown until recorded.` : "Inspection card is unchanged until the field is ready."
		}
	];
}
function liveFacts(project) {
	const facts = [];
	const summary = financialSummary(project);
	const bp = ensureBlueprint(project);
	const calendar = contractDates(project);
	facts.push({
		id: "fact-start",
		ledger: "Schedule",
		moduleId: "schedule",
		label: "Official start",
		value: calendar.officialStart,
		tone: calendar.startKnown ? "ok" : "warn"
	});
	facts.push({
		id: "fact-finish",
		ledger: "Schedule",
		moduleId: "schedule",
		label: "Intended finish",
		value: calendar.intendedFinish,
		tone: calendar.finishKnown ? "ok" : "warn"
	});
	facts.push({
		id: "fact-budget",
		ledger: "Budget",
		moduleId: "budget",
		label: "Revised",
		value: summary ? formatMoney(summary.revisedBudget) : "Unknown",
		tone: summary ? "ok" : "warn"
	});
	const pending = Object.values(project.financials?.changeOrders ?? {}).filter((co) => co.status === "DRAFT" || co.status === "PROPOSED" || co.status === "PENDING_APPROVAL");
	for (const co of pending) facts.push({
		id: `fact-co-${co.id}`,
		ledger: "Change Orders",
		moduleId: "change-orders",
		label: co.number,
		value: `${co.status.replaceAll("_", " ")} · ${co.title} · ${formatMoney(co.cost)}`,
		tone: co.cost.amountMinor === 0 ? "warn" : "neutral"
	});
	for (const item of Object.values(project.scopeItems).filter((row) => row.included && !row.fromBaseline)) facts.push({
		id: `fact-scp-${item.id}`,
		ledger: "Scope",
		moduleId: "scope",
		label: "Added after baseline",
		value: item.description,
		tone: "warn"
	});
	const inProgress = Object.values(project.activities).find((item) => item.state === "IN_PROGRESS");
	if (inProgress) facts.push({
		id: `fact-act-${inProgress.id}`,
		ledger: "Schedule",
		moduleId: "schedule",
		label: "In progress",
		value: inProgress.name,
		tone: "ok"
	});
	if (bp.widthIn && bp.depthIn) facts.push({
		id: "fact-env",
		ledger: "Plans",
		moduleId: "plans",
		label: "Envelope",
		value: `${bp.envelopeProvenance ?? "PROPOSED"} · ${bp.dimDatum ?? "FACE_FRAMING"}`,
		tone: (bp.envelopeProvenance ?? "PROPOSED") === "VERIFIED" ? "ok" : "warn"
	});
	for (const item of unresolvedRegister(bp).filter((row) => row.blocking).slice(0, 4)) facts.push({
		id: `fact-unr-${item.id}`,
		ledger: "Plans",
		moduleId: "plans",
		label: item.title,
		value: item.message,
		tone: "danger"
	});
	for (const line of materialTakeoff(project).filter((row) => row.status === "UNKNOWN").slice(0, 3)) facts.push({
		id: `fact-mat-${line.id}`,
		ledger: "Materials",
		moduleId: "materials",
		label: line.item,
		value: line.qty,
		tone: "warn"
	});
	return facts;
}
function annotatePreview(project, preview) {
	if (preview.ripple && preview.ripple.length > 0) return preview;
	return {
		...preview,
		ripple: hopsFor(project, preview)
	};
}
function hopsFor(project, preview) {
	const type = preview.eventType;
	if (type.startsWith("CHANGE_ORDER")) return coHops(project, preview);
	if (type === "JOB_STATUS_UPDATED") return progressHops(preview);
	if (type === "SCHEDULE_UPDATED") return scheduleHops(project, preview);
	if (type === "BLUEPRINT_OPENING_UPSERTED") return openingHops(project, preview);
	if (type === "INSPECTION_UPDATED" || type === "PERMIT_UPDATED") return inspectionHops(project, preview);
	if (type === "ACTUAL_COST_RECORDED" || type === "COMMITMENT_ADDED" || type === "BUDGET_LINE_UPDATED" || type === "SET_PROJECT_FINANCIAL_BASELINE") return budgetHops(project, preview);
	return fallbackHops(preview);
}
function progressHops(preview) {
	return [{
		ledger: "Status",
		moduleId: "overview",
		status: "WILL_WRITE",
		fact: preview.understood
	}, {
		ledger: "Next call",
		moduleId: "overview",
		status: "WILL_WRITE",
		fact: preview.consequences[0] ?? "Index card and overview show the next call to action."
	}];
}
function fallbackHops(preview) {
	const hops = preview.changes.map((change) => ({
		ledger: change.split(/[·(]/)[0]?.trim() || "Record",
		moduleId: "overview",
		status: "WILL_WRITE",
		fact: change
	}));
	for (const line of preview.consequences.slice(0, 4)) hops.push({
		ledger: "Honesty",
		moduleId: "overview",
		status: /not |will not |unchanged|unknown/i.test(line) ? "UNCHANGED" : "WATCH",
		fact: line
	});
	return hops;
}
function findCo(project, preview) {
	const id = /change order\s+(co-[a-z0-9-]+)/i.exec(preview.understood)?.[1];
	if (id && project.financials?.changeOrders[id]) return project.financials.changeOrders[id];
	const titled = /"([^"]+)"/.exec(preview.understood)?.[1];
	if (titled) return Object.values(project.financials?.changeOrders ?? {}).find((co) => co.title === titled) ?? null;
	return Object.values(project.financials?.changeOrders ?? {}).find((co) => preview.understood.toLowerCase().includes(co.number.toLowerCase()) || preview.understood.toLowerCase().includes(co.title.toLowerCase())) ?? null;
}
function coHops(project, preview) {
	const co = findCo(project, preview);
	const summary = financialSummary(project);
	const approving = preview.eventType === "CHANGE_ORDER_APPROVED";
	const pricing = preview.eventType === "CHANGE_ORDER_UPDATED";
	const nextRevised = approving && summary?.revisedBudget && co ? add(summary.revisedBudget, co.cost) : summary?.revisedBudget ?? null;
	const scopeNames = (co?.scopeItemIds ?? []).map((id) => project.scopeItems[id]?.description).filter(Boolean);
	const actNames = (co?.activityIds ?? []).map((id) => project.activities[id]?.name).filter(Boolean);
	return [
		{
			ledger: "Change Orders",
			moduleId: "change-orders",
			status: "WILL_WRITE",
			fact: co ? `${co.number} “${co.title}” → ${preview.eventType.replace("CHANGE_ORDER_", "").replaceAll("_", " ")} · ${formatMoney(co.cost)}` : preview.understood
		},
		{
			ledger: "Budget",
			moduleId: "budget",
			status: approving ? "WILL_WRITE" : "UNCHANGED",
			fact: approving ? co && co.cost.amountMinor === 0 ? "Cost is $0. Approving writes zero into Revised. Price it first if that is wrong." : `Revised becomes ${formatMoney(nextRevised)} (approved cost enters once). Pending for this CO clears.` : pricing ? `Revised stays ${formatMoney(summary?.revisedBudget ?? null)} until this CO is approved.` : `Revised stays ${formatMoney(summary?.revisedBudget ?? null)}. Pending exposure moves only after propose/submit.`
		},
		{
			ledger: "Schedule",
			moduleId: "schedule",
			status: co?.declaredScheduleDays ? "NEEDS_YOU" : "UNCHANGED",
			fact: co?.declaredScheduleDays ? `Declared +${co.declaredScheduleDays} days is a claim${actNames.length ? ` on ${actNames.join(", ")}` : ""}. Howler will not rewrite committed dates.` : "No declared schedule impact. Dates stay put."
		},
		{
			ledger: "Scope",
			moduleId: "scope",
			status: scopeNames.length ? "WATCH" : "WATCH",
			fact: scopeNames.length ? `Tied to: ${scopeNames.join("; ")}.` : "No scope item linked."
		},
		{
			ledger: "Materials",
			moduleId: "materials",
			status: "WATCH",
			fact: "Takeoff does not gain a stick from a dollar amount."
		}
	];
}
function scheduleHops(project, preview) {
	const id = /activity\s+(act-[a-z0-9-]+)/i.exec(preview.understood)?.[1];
	const activity = id && project.activities[id] || null;
	const linked = Object.values(project.scopeItems).filter((item) => item.activityId && activity && item.activityId === activity.id);
	const dependents = Object.values(project.activities).filter((item) => activity && item.predecessorId === activity.id);
	const finishing = /\bCOMPLETE\b/.test(preview.understood) || activity && /finish|complete/i.test(preview.understood);
	return [
		{
			ledger: "Schedule",
			moduleId: "schedule",
			status: "WILL_WRITE",
			fact: activity ? `“${activity.name}” updates. Forecast recomputes from this canonical change.` : preview.understood
		},
		{
			ledger: "Scope",
			moduleId: "scope",
			status: linked.length ? "WATCH" : "UNCHANGED",
			fact: linked.length ? finishing ? `${linked.map((item) => item.description).join("; ")} stay open until you mark them complete. Finishing the activity does not close the scope.` : `Linked: ${linked.map((item) => item.description).join("; ")}.` : "No scope item on this activity."
		},
		{
			ledger: "Change Orders",
			moduleId: "change-orders",
			status: "UNCHANGED",
			fact: "A CO’s declared +days does not perform this update. Schedule only changes here."
		},
		{
			ledger: "Downstream",
			moduleId: "schedule",
			status: dependents.length ? "WATCH" : "UNCHANGED",
			fact: dependents.length ? `${dependents.map((item) => item.name).join(", ")} re-forecast from the predecessor. Locked dates stay locked.` : "No successor activities."
		}
	];
}
function openingHops(project, preview) {
	const kind = /overhead door|man door|window/i.exec(preview.understood)?.[0] ?? "opening";
	const blocking = unresolvedRegister(ensureBlueprint(project)).filter((item) => item.blocking);
	return [
		{
			ledger: "Plans",
			moduleId: "plans",
			status: "WILL_WRITE",
			fact: `${preview.understood} Opening schedule and elevations update.`
		},
		{
			ledger: "Materials",
			moduleId: "materials",
			status: "WATCH",
			fact: /overhead/i.test(kind) ? "OHD leaf is now sized. Header and track stay typical until specified — Howler will not invent a Simpson." : "Takeoff picks up the unit when the schedule has a size. Fasteners stay Unknown."
		},
		{
			ledger: "Inspections",
			moduleId: "inspections",
			status: "WATCH",
			fact: "Framing inspection still waits on headers and the stair run. This opening does not pass the card."
		},
		{
			ledger: "Budget",
			moduleId: "budget",
			status: "UNCHANGED",
			fact: `Revised stays ${formatMoney(financialSummary(project)?.revisedBudget ?? null)}. A door size is not a change order.`
		},
		{
			ledger: "Unresolved",
			moduleId: "plans",
			status: blocking.some((item) => item.id === "ohd-leaf") && /overhead/i.test(kind) ? "WILL_WRITE" : "WATCH",
			fact: /overhead/i.test(kind) ? "OHD leaf Unknown will clear. Stair run stays Unknown." : blocking[0] ? `Still blocking: ${blocking[0].title}.` : "No blocking register items."
		}
	];
}
function inspectionHops(project, preview) {
	const id = /(insp-[a-z0-9-]+)/i.exec(preview.understood)?.[1];
	const job = ensureJob(project);
	const card = id ? job.inspections[id] : null;
	const passed = /passed/i.test(preview.understood) || preview.understood.includes("PASSED");
	return [
		{
			ledger: "Inspections",
			moduleId: "inspections",
			status: "WILL_WRITE",
			fact: card ? `${card.name}${card.code ? ` (${card.code})` : ""} — ${preview.understood}` : preview.understood
		},
		{
			ledger: "Permit",
			moduleId: "inspections",
			status: job.permitStatus === "ISSUED" ? "WATCH" : "NEEDS_YOU",
			fact: job.permitStatus === "ISSUED" ? `Permit ${job.permitNumber ?? "issued"}. A pass is your record, not the AHJ stamp.` : "Permit is not issued. Howler will not invent a card number."
		},
		{
			ledger: "Schedule",
			moduleId: "schedule",
			status: "WATCH",
			fact: passed ? "A pass does not mark the activity complete. Say the finish date if the work is done." : "Inspection status does not move committed dates."
		},
		{
			ledger: "Budget",
			moduleId: "budget",
			status: "UNCHANGED",
			fact: "Revised is unchanged. A failed card is not a change order until you add the work."
		}
	];
}
function budgetHops(project, preview) {
	const summary = financialSummary(project);
	return [
		{
			ledger: "Budget",
			moduleId: "budget",
			status: "WILL_WRITE",
			fact: preview.understood
		},
		{
			ledger: "Change Orders",
			moduleId: "change-orders",
			status: "UNCHANGED",
			fact: "Actuals and commitments do not approve a CO. Revised only moves on explicit approval."
		},
		{
			ledger: "Overview",
			moduleId: "overview",
			status: "WATCH",
			fact: `Current revised ${formatMoney(summary?.revisedBudget ?? null)}.`
		}
	];
}
/** Linked ledgers for a single record — the opposite of “edit down below.” */
function livesIn(project, kind, id) {
	if (kind === "scope") {
		const item = project.scopeItems[id];
		if (!item) return [];
		const lines = [];
		if (item.activityId && project.activities[item.activityId]) lines.push(`Schedule: ${project.activities[item.activityId].name}`);
		const cos = Object.values(project.financials?.changeOrders ?? {}).filter((co) => co.scopeItemIds.includes(id));
		for (const co of cos) lines.push(`${co.number} ${co.status.replaceAll("_", " ")}`);
		const budget = Object.values(project.financials?.lines ?? {}).find((line) => line.scopeItemIds.includes(id));
		if (budget) lines.push(`Budget: ${budget.description}`);
		if (item.allowanceLineId && project.financials?.lines[item.allowanceLineId]) lines.push(`Allowance: ${project.financials.lines[item.allowanceLineId].description}`);
		return lines;
	}
	if (kind === "activity") {
		if (!project.activities[id]) return [];
		return Object.values(project.scopeItems).filter((item) => item.activityId === id).map((item) => `Scope: ${item.description}`);
	}
	const co = project.financials?.changeOrders[id];
	if (!co) return [];
	return [...co.scopeItemIds.map((sid) => `Scope: ${project.scopeItems[sid]?.description ?? sid}`), ...co.activityIds.map((aid) => `Schedule: ${project.activities[aid]?.name ?? aid}`)];
}
function nowIso() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function nextId(prefix) {
	return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function record(project, type, note, clerical, mutate, recordId) {
	const draft = structuredClone(project);
	mutate(draft);
	draft.revision += 1;
	draft.events = [{
		id: nextId("evt"),
		revision: draft.revision,
		type,
		occurredAt: nowIso(),
		note,
		clerical,
		...recordId ? { recordId } : {}
	}, ...draft.events];
	return draft;
}
function requireFinancials(project) {
	if (!project.financials) throw new Error("Project financials are not initialized.");
	return project.financials;
}
function previewInitialize(currency) {
	return {
		understood: `Initialize project financials in ${currency}.`,
		changes: ["Budget workspace", "Default construction categories"],
		consequences: ["Creates canonical financials. Missing amounts stay Unknown, not $0.", "Default categories are optional starters the PM can edit."],
		nextAction: "Confirm to open Budget and Change Orders on this project.",
		clerical: false,
		eventType: "PROJECT_FINANCIALS_INITIALIZED",
		apply: (project) => record(project, "PROJECT_FINANCIALS_INITIALIZED", `Financials initialized in ${currency}.`, false, (draft) => {
			draft.financials = {
				currency,
				baseline: null,
				categories: Object.fromEntries([
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
					"Cabinetry"
				].map((name, index) => {
					const id = `cat-${index + 1}`;
					return [id, {
						id,
						name,
						isDefault: true,
						active: true,
						sortOrder: index + 1,
						notes: null
					}];
				})),
				lines: {},
				commitments: {},
				actualCosts: {},
				changeOrders: {}
			};
		})
	};
}
function previewSetBaseline(amount) {
	return {
		understood: `Set original budget to ${formatMoney(amount)}.`,
		changes: [
			"Original Budget",
			"Revised Budget",
			"Overview"
		],
		consequences: [
			"Original Budget becomes this amount.",
			"Revised Budget = original + approved Change Orders only.",
			"Pending Change Orders stay out of Revised Budget."
		],
		nextAction: "Confirm this original budget figure.",
		clerical: false,
		eventType: "SET_PROJECT_FINANCIAL_BASELINE",
		apply: (project) => record(project, "SET_PROJECT_FINANCIAL_BASELINE", `Original budget set to ${formatMoney(amount)}.`, false, (draft) => {
			const fin = requireFinancials(draft);
			fin.baseline = amount;
		})
	};
}
function previewAddLine(input) {
	return {
		understood: `Add budget line "${input.description}"${input.baselineAmount ? ` at ${formatMoney(input.baselineAmount)}` : " with unknown amount"}.`,
		changes: ["Budget lines", input.scopeItemIds?.length ? "Scope association" : "Unassociated line"],
		consequences: [input.baselineAmount ? "Line baseline is recorded. Revised amount follows approved COs allocated to this line." : "Amount stays Unknown until a baseline is entered. Unknown is not $0.", input.isAllowance ? "Tracked as an allowance. Overrun will not auto-create a Change Order." : "Regular budget line."],
		nextAction: input.baselineAmount ? "Confirm the new line." : "Save the line, then add a baseline when known.",
		clerical: !input.baselineAmount,
		eventType: "BUDGET_LINE_ADDED",
		apply: (project) => record(project, "BUDGET_LINE_ADDED", `Added budget line "${input.description}".`, !input.baselineAmount, (draft) => {
			const fin = requireFinancials(draft);
			const id = nextId("line");
			const line = {
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
				active: true
			};
			fin.lines[id] = line;
		})
	};
}
function previewPatchLine(lineId, patch) {
	const consequential = patch.baselineAmount !== void 0 || patch.active === false || patch.isAllowance !== void 0;
	return {
		understood: consequential ? `Update budget line ${lineId} (consequential fields).` : `Clerical update to budget line ${lineId}.`,
		changes: ["Budget line", ...patch.scopeItemIds ? ["Scope association"] : []],
		consequences: consequential ? ["Derived totals and findings will recompute from the new facts."] : ["History will record the clerical edit. Totals are unchanged."],
		nextAction: consequential ? "Confirm the change." : "Save the clerical edit.",
		clerical: !consequential,
		eventType: "BUDGET_LINE_UPDATED",
		apply: (project) => record(project, "BUDGET_LINE_UPDATED", `Updated budget line ${lineId}.`, !consequential, (draft) => {
			const line = requireFinancials(draft).lines[lineId];
			if (!line) throw new Error("Unknown budget line.");
			Object.assign(line, patch);
		}, lineId)
	};
}
function previewAddCommitment(input) {
	return {
		understood: `Add ${formatMoney(input.amount)} commitment${input.vendorRef ? ` to ${input.vendorRef}` : ""}.`,
		changes: [
			"Commitments",
			"Budget line committed total",
			"Overview remaining/uncommitted"
		],
		consequences: [
			"Committed total increases by this amount.",
			"Actual recorded is unchanged. Commitment is not spend.",
			"If this exceeds the line's revised budget, Howler will flag it."
		],
		nextAction: "Confirm the commitment.",
		clerical: false,
		eventType: "COMMITMENT_ADDED",
		apply: (project) => record(project, "COMMITMENT_ADDED", `Added commitment of ${formatMoney(input.amount)}${input.vendorRef ? ` (${input.vendorRef})` : ""}.`, false, (draft) => {
			const fin = requireFinancials(draft);
			const id = nextId("cmt");
			fin.commitments[id] = {
				id,
				amount: input.amount,
				allocations: [{
					budgetLineId: input.budgetLineId,
					amount: input.amount
				}],
				vendorRef: input.vendorRef || null,
				activityId: null,
				scopeItemIds: [],
				reference: input.reference ?? null,
				status: "ACTIVE",
				notes: input.notes ?? null
			};
		})
	};
}
function previewAddActual(input) {
	return {
		understood: `Record actual cost ${formatMoney(input.amount)} for "${input.description}".`,
		changes: [
			"Actual recorded",
			"Budget line actual total",
			"Overview"
		],
		consequences: ["This is recorded cost, not a payment and not a commitment.", "Allowance overruns are flagged. No Change Order is invented."],
		nextAction: "Confirm the actual cost.",
		clerical: false,
		eventType: "ACTUAL_COST_RECORDED",
		apply: (project) => record(project, "ACTUAL_COST_RECORDED", `Recorded ${formatMoney(input.amount)} actual for "${input.description}".`, false, (draft) => {
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
				notes: input.notes ?? null
			};
		})
	};
}
function previewAddCategory(name) {
	return {
		understood: `Add budget category "${name}".`,
		changes: ["Budget categories"],
		consequences: ["Category is available for new lines. Existing lines are unchanged."],
		nextAction: "Save the category.",
		clerical: true,
		eventType: "BUDGET_CATEGORY_ADDED",
		apply: (project) => record(project, "BUDGET_CATEGORY_ADDED", `Added category "${name}".`, true, (draft) => {
			const fin = requireFinancials(draft);
			const id = nextId("cat");
			fin.categories[id] = {
				id,
				name,
				isDefault: false,
				active: true,
				sortOrder: Object.keys(fin.categories).length + 1,
				notes: null
			};
		})
	};
}
function previewCreateChangeOrder(input) {
	return {
		understood: `Create DRAFT change order "${input.title}"${input.cost.amountMinor ? ` at ${formatMoney(input.cost)}` : " unpriced"}.`,
		changes: [
			"Change Orders",
			"Pending CO exposure (after propose)",
			"Scope associations"
		],
		consequences: ["Starts as DRAFT. Approved budget does not change.", input.declaredScheduleDays ? `Declared schedule impact +${input.declaredScheduleDays} days is recorded as a claim. Schedule activities are not rewritten.` : "No declared schedule impact."],
		nextAction: "Confirm the draft, then propose it when ready.",
		clerical: false,
		eventType: "CHANGE_ORDER_CREATED",
		apply: (project) => {
			const id = nextId("co");
			return record(project, "CHANGE_ORDER_CREATED", `Created DRAFT change order "${input.title}".`, false, (draft) => {
				const fin = requireFinancials(draft);
				const count = Object.keys(fin.changeOrders).length + 1;
				const allocations = input.budgetLineId ? [{
					budgetLineId: input.budgetLineId,
					amount: input.cost
				}] : [];
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
					notes: input.notes ?? null
				};
			}, id);
		}
	};
}
var LIFECYCLE = {
	PROPOSE: {
		next: "PROPOSED",
		type: "CHANGE_ORDER_PROPOSED",
		label: "Propose"
	},
	SUBMIT_FOR_APPROVAL: {
		next: "PENDING_APPROVAL",
		type: "CHANGE_ORDER_SUBMITTED",
		label: "Submit for approval"
	},
	APPROVE: {
		next: "APPROVED",
		type: "CHANGE_ORDER_APPROVED",
		label: "Approve"
	},
	REJECT: {
		next: "REJECTED",
		type: "CHANGE_ORDER_REJECTED",
		label: "Reject"
	},
	VOID: {
		next: "VOID",
		type: "CHANGE_ORDER_VOIDED",
		label: "Void"
	},
	REOPEN: {
		next: "DRAFT",
		type: "CHANGE_ORDER_REOPENED",
		label: "Reopen"
	}
};
function previewCoLifecycle(changeOrderId, action) {
	const spec = LIFECYCLE[action];
	const approved = action === "APPROVE";
	return {
		understood: `${spec.label} change order ${changeOrderId}.`,
		changes: ["Change Order status", ...approved ? [
			"Revised Budget",
			"Overview",
			"Pending exposure"
		] : ["Pending exposure"]],
		consequences: approved ? [
			"Approved cost enters Revised Budget exactly once.",
			"Pending exposure for this CO clears.",
			"Declared schedule days still do not rewrite Schedule."
		] : action === "REJECT" || action === "VOID" ? ["Rejected/void COs never enter Revised Budget. Original evidence stays in History."] : ["Approved budget is unchanged until explicit approval."],
		nextAction: `Confirm ${spec.label.toLowerCase()}.`,
		clerical: false,
		eventType: spec.type,
		apply: (project) => record(project, spec.type, `${spec.label} change order ${changeOrderId}.`, false, (draft) => {
			const co = requireFinancials(draft).changeOrders[changeOrderId];
			if (!co) throw new Error("Unknown change order.");
			co.status = spec.next;
			if (action === "PROPOSE") co.proposedAt = nowIso();
			if (action === "APPROVE") co.approvedAt = nowIso();
			if (action === "REJECT") co.rejectedAt = nowIso();
		}, changeOrderId)
	};
}
function previewPatchChangeOrder(changeOrderId, patch) {
	const consequential = patch.cost !== void 0 || patch.declaredScheduleDays !== void 0 || patch.scopeItemIds !== void 0 || patch.activityIds !== void 0 || patch.allocations !== void 0;
	return {
		understood: consequential ? `Update change order ${changeOrderId} (consequential fields).` : `Clerical edit to change order ${changeOrderId}.`,
		changes: ["Change Order", ...consequential ? ["Financial exposure if priced/pending"] : []],
		consequences: consequential ? ["If this CO is not APPROVED, Revised Budget stays unchanged."] : ["History records the text edit."],
		nextAction: consequential ? "Confirm the change." : "Save the clerical edit.",
		clerical: !consequential,
		eventType: "CHANGE_ORDER_UPDATED",
		apply: (project) => record(project, "CHANGE_ORDER_UPDATED", `Updated change order ${changeOrderId}.`, !consequential, (draft) => {
			const co = requireFinancials(draft).changeOrders[changeOrderId];
			if (!co) throw new Error("Unknown change order.");
			if (co.status === "APPROVED" && patch.cost) throw new Error("Approved cost is protected evidence. Void/correct instead of silent overwrite.");
			Object.assign(co, patch);
		}, changeOrderId)
	};
}
function previewPatchScope(scopeItemId, patch) {
	const consequential = patch.complete !== void 0 || patch.included !== void 0 || patch.allowanceLineId !== void 0;
	return {
		understood: `Update scope item ${scopeItemId}.`,
		changes: ["Scope", ...patch.allowanceLineId ? ["Budget association"] : []],
		consequences: consequential ? ["Overview blocked-scope and financial coverage findings will recompute."] : ["Clerical scope edit. History is recorded."],
		nextAction: consequential ? "Confirm." : "Save.",
		clerical: !consequential,
		eventType: "SCOPE_ITEM_UPDATED",
		apply: (project) => record(project, "SCOPE_ITEM_UPDATED", `Updated scope "${project.scopeItems[scopeItemId]?.description ?? scopeItemId}".`, !consequential, (draft) => {
			const item = draft.scopeItems[scopeItemId];
			if (!item) throw new Error("Unknown scope item.");
			Object.assign(item, patch);
		}, scopeItemId)
	};
}
function previewAddScope(input, project) {
	const trade = input.trade ?? tradeFromText(input.description);
	const activityId = input.activityId ?? activityForTrade(project, trade).hit?.id ?? null;
	return {
		understood: `Add scope “${input.description}” and draft an unpriced change order.`,
		changes: [
			"Scope",
			"Change Orders",
			"Overview fact index"
		],
		consequences: [
			"This is after-baseline work. It is a change order, not a notepad line.",
			"Revised Budget does not move until you price the CO and approve it.",
			"Schedule dates are not rewritten. Materials takeoff is not invented from the name."
		],
		nextAction: "Confirm the ripple. Then price the CO when you know the number.",
		clerical: false,
		eventType: "SCOPE_CHANGE_DRAFTED",
		ripple: scopeAddRipple(project, input.description, trade),
		apply: (proj) => record(proj, "SCOPE_CHANGE_DRAFTED", `Added scope “${input.description}” and drafted an unpriced CO.`, false, (draft) => {
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
				fromBaseline: false
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
				notes: "Unpriced. Howler will not invent a cost."
			};
		})
	};
}
function previewPatchActivity(activityId, patch) {
	const consequential = patch.state !== void 0 || patch.committedStart !== void 0 || patch.committedFinish !== void 0 || patch.actualStart !== void 0 || patch.actualFinish !== void 0 || patch.durationLikely !== void 0 || patch.predecessorId !== void 0 || patch.locked !== void 0;
	return {
		understood: `Update schedule activity ${activityId}.`,
		changes: [
			"Schedule",
			"Forecast",
			"Overview next movement"
		],
		consequences: ["Dependent activities re-forecast from this canonical change.", "A Change Order's declared +days does not perform this update. Schedule is only changed here."],
		nextAction: consequential ? "Confirm the schedule change." : "Save the note.",
		clerical: !consequential,
		eventType: "SCHEDULE_UPDATED",
		apply: (project) => record(project, "SCHEDULE_UPDATED", `Updated schedule "${project.activities[activityId]?.name ?? activityId}".`, !consequential, (draft) => {
			const activity = draft.activities[activityId];
			if (!activity) throw new Error("Unknown activity.");
			if (activity.locked && (patch.committedStart || patch.committedFinish) && patch.locked !== false) throw new Error("Locked activity dates are protected. Clear the lock first.");
			Object.assign(activity, patch);
		}, activityId)
	};
}
function previewProgressUpdate(note, work = {}) {
	const cleaned = note.replace(/\s+/g, " ").trim().slice(0, 280);
	const activityIds = work.activityIds ?? [];
	const scopeIds = work.scopeIds ?? [];
	const labels = work.labels ?? [];
	const nextSaid = work.nextSaid?.replace(/\s+/g, " ").trim() || null;
	const closing = activityIds.length + scopeIds.length > 0;
	const named = labels.length ? labels.join("; ") : "named work";
	return {
		understood: closing ? `${named} complete.` : cleaned,
		changes: closing ? [
			"Status",
			"Index card",
			"Next call to action"
		] : ["Status", "Index card"],
		consequences: [closing ? `Closes ${named}. ${nextSaid ? `Next call: ${nextSaid}` : "Next call to action lands on the card and overview."}` : nextSaid ? `Next call: ${nextSaid}` : "Status and last-week log update."],
		nextAction: "Confirm to write this on the job overview and index card.",
		clerical: true,
		eventType: "JOB_STATUS_UPDATED",
		apply: (project) => record(project, "JOB_STATUS_UPDATED", cleaned, true, (draft) => {
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
		})
	};
}
function previewSetJobMeta(patch) {
	const dateNote = patch.officialStart !== void 0 ? `Official start ${patch.officialStart ?? "Unknown"}.` : patch.intendedFinish !== void 0 ? `Intended finish ${patch.intendedFinish ?? "Unknown"}.` : null;
	return {
		understood: dateNote ? dateNote : patch.dashboardNote ? patch.dashboardNote : `Update job status${patch.heldPhases ? ` — hold ${patch.heldPhases.join(", ")}` : ""}${patch.paused === false ? " — live work released" : ""}.`,
		changes: [
			"Overview",
			"Index card",
			"Schedule next movement"
		],
		consequences: ["Official start and intended finish live on the index card. A trade target is not the job finish.", "Howler will not mark remaining work complete from a date on the card."],
		nextAction: "Confirm the status change.",
		clerical: patch.officialStart !== void 0 || patch.intendedFinish !== void 0,
		eventType: "JOB_STATUS_UPDATED",
		apply: (project) => record(project, "JOB_STATUS_UPDATED", dateNote ?? patch.dashboardNote ?? "Updated job status.", Boolean(dateNote), (draft) => {
			if (patch.paused !== void 0) draft.paused = patch.paused;
			if (patch.heldPhases) draft.heldPhases = patch.heldPhases;
			if (patch.dashboardNote) draft.dashboardNote = patch.dashboardNote;
			if (patch.healthBand) draft.healthBand = patch.healthBand;
			if (patch.projectType) draft.projectType = patch.projectType;
			if (patch.officialStart !== void 0) draft.officialStart = patch.officialStart;
			if (patch.intendedFinish !== void 0) draft.intendedFinish = patch.intendedFinish;
		})
	};
}
function previewCloseout(activityIds, note) {
	const today = nowIso().slice(0, 10);
	return {
		understood: "Named closeout work is in progress. Remaining items are not marked complete.",
		changes: [
			"Schedule",
			"Overview progress",
			"Index card"
		],
		consequences: [
			"In-progress closeout counts half of those scope items until you mark them complete with a date.",
			"Howler will not invent a finish date from “closing out.”",
			"Held phases (Interior) stay held."
		],
		nextAction: "Recorded on the job. Say Hey Howler for the next update.",
		clerical: true,
		eventType: "SCHEDULE_UPDATED",
		apply: (project) => record(project, "SCHEDULE_UPDATED", "Closeout marked in progress. Remaining work not marked complete.", false, (draft) => {
			draft.paused = false;
			if (!draft.heldPhases) draft.heldPhases = [];
			for (const id of activityIds) {
				const activity = draft.activities[id];
				if (!activity || activity.state === "COMPLETE") continue;
				activity.state = "IN_PROGRESS";
				activity.actualStart = activity.actualStart ?? today;
				activity.notes = note;
			}
			if (Object.values(draft.scopeItems).some((item) => /interior|precon/i.test(item.phase) && !item.included) && !draft.heldPhases.includes("Interior")) draft.heldPhases = [...draft.heldPhases, "Interior"];
			draft.dashboardNote = note;
		}, activityIds[0])
	};
}
function omitUndefined(patch) {
	return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== void 0));
}
function describeBlueprintPatch(patch) {
	const parts = [];
	if (patch.widthIn != null && patch.depthIn != null) parts.push(`envelope ${formatFtIn(patch.widthIn)} × ${formatFtIn(patch.depthIn)}`);
	else if (patch.widthIn != null) parts.push(`width ${formatFtIn(patch.widthIn)}`);
	else if (patch.depthIn != null) parts.push(`depth ${formatFtIn(patch.depthIn)}`);
	if (patch.eaveHeightIn != null) parts.push(`walls ${formatFtIn(patch.eaveHeightIn)}`);
	if (patch.roofRise != null && patch.roofRun != null) parts.push(`pitch ${patch.roofRise}/${patch.roofRun}`);
	if (patch.studSize || patch.studSpacingIn) parts.push(`studs ${patch.studSize ?? ""}${patch.studSpacingIn ? ` ${patch.studSpacingIn}" O.C.` : ""}`.trim());
	if (patch.joistSize || patch.joistSpacingIn) parts.push(`joists ${patch.joistSize ?? ""}${patch.joistSpacingIn ? ` ${patch.joistSpacingIn}" O.C.` : ""}`.trim());
	if (patch.rafterSize || patch.rafterSpacingIn) parts.push(`rafters ${patch.rafterSize ?? ""}${patch.rafterSpacingIn ? ` ${patch.rafterSpacingIn}" O.C.` : ""}`.trim());
	if (patch.county) parts.push(`${patch.county} County`);
	if (patch.occupancy) parts.push(OCCUPANCY_LABEL[patch.occupancy]);
	if (patch.stories != null) parts.push(`${patch.stories} stor${patch.stories === 1 ? "y" : "ies"}`);
	if (patch.overheadDoorWidthIn != null) parts.push(`overhead door ${formatFtIn(patch.overheadDoorWidthIn)}`);
	if (patch.openings && patch.openings.length) parts.push(`${patch.openings.length} opening${patch.openings.length === 1 ? "" : "s"} (${patch.openings.map((item) => item.kind).join(", ")})`);
	if (patch.frostDepthIn != null) parts.push(`frost ${formatFtIn(patch.frostDepthIn)}`);
	if (patch.overhangIn != null) parts.push(`overhang ${formatFtIn(patch.overhangIn)}`);
	if (patch.drawingScale) parts.push(`scale ${patch.drawingScale === "FIT" ? "fit to sheet" : `${patch.drawingScale}" = 1'-0"`}`);
	if (patch.dimDatum) parts.push(`datum ${DATUM_LABEL[patch.dimDatum].toLowerCase()}`);
	if (patch.envelopeProvenance) parts.push(`envelope ${PROVENANCE_LABEL[patch.envelopeProvenance].toLowerCase()}`);
	if (patch.drawingStatus) parts.push(`status ${patch.drawingStatus.toLowerCase()}`);
	if (patch.notes) parts.push("notes");
	return parts.length ? parts.join(", ") : "blueprint fields";
}
function previewPatchBlueprint(patch) {
	const understood = describeBlueprintPatch(patch);
	const county = patch.county ? countyCriteria(patch.county) : null;
	const snow = county ? county.snowPsf : patch.groundSnowLoadPsf;
	return {
		understood: `Record ${understood} on Plans.`,
		changes: [
			"Plans working drawings",
			"Stud / joist / rafter layouts",
			"Kentucky code findings"
		],
		consequences: [
			"Drawings recompute from this envelope. Unknown fields stay Unknown — they are not filled with zeros.",
			county ? `${county.name} County ground snow load is ${county.snowPsf} psf (KRC Table R301.2(1)). Wind stays 115 mph Vult. Weathering stays Severe.` : "County/snow stay as entered. Howler will not guess a county from the street address.",
			"These are working drawings, not a sealed engineering set. AHJ + licensed design professional still required where the code requires it."
		],
		nextAction: "Confirm. Open Plans to read the sheets and the engineer-plan checklist.",
		clerical: false,
		eventType: "BLUEPRINT_UPDATED",
		apply: (project) => record(project, "BLUEPRINT_UPDATED", `Updated Plans: ${understood}.`, false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			const next = {
				...ensureBlueprint(draft),
				...omitUndefined(patch)
			};
			if (county) {
				next.county = county.name;
				next.groundSnowLoadPsf = county.snowPsf;
			} else if (snow != null) next.groundSnowLoadPsf = snow;
			next.windSpeedMph = 115;
			next.weathering = "SEVERE";
			next.jurisdiction = "KENTUCKY";
			next.codeEdition = "KRC_2018";
			if (!next.openings) next.openings = [];
			if (patch.overheadDoorWidthIn != null) {
				const existing = next.openings.find((item) => item.kind === "OHD");
				const width = patch.overheadDoorWidthIn;
				const height = patch.overheadDoorHeightIn ?? existing?.heightIn ?? 84;
				const offset = next.widthIn ? Math.max(0, (next.widthIn - width) / 2) : existing?.offsetIn ?? 0;
				if (existing) {
					existing.widthIn = width;
					existing.heightIn = height;
					existing.offsetIn = offset;
					existing.provenance = existing.provenance ?? "PROPOSED";
				} else next.openings.push({
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
					notes: null
				});
			}
			const ohd = next.openings.find((item) => item.kind === "OHD");
			if (ohd) {
				next.overheadDoorWidthIn = ohd.widthIn;
				next.overheadDoorHeightIn = ohd.heightIn;
			}
			if (patch.widthIn != null || patch.depthIn != null) next.envelopeProvenance = patch.envelopeProvenance ?? "PROPOSED";
			if (next.drawingStatus === "ISSUED" && (patch.widthIn != null || patch.depthIn != null || patch.eaveHeightIn != null || patch.openings != null || patch.overheadDoorWidthIn != null)) next.drawingStatus = "DRAFT";
			draft.blueprint = next;
		})
	};
}
function roomsFromScopeInto(draft) {
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
			notes: fullFloor ? "Sized from envelope. Edit if this space is only part of the floor." : "Size Unknown."
		};
		names.add(item.description.toLowerCase());
	}
}
function previewDrawWorkingSet(project, patch = {}) {
	const base = ensureBlueprint(project);
	const merged = {
		...base,
		...omitUndefined(patch)
	};
	const typical = typicalGarageLayoutPatch(merged);
	const roomsEmpty = Object.keys(base.rooms).length === 0;
	const openingCount = (typical.openings ?? merged.openings ?? []).length;
	const understood = `Draw working set: ${describeBlueprintPatch({
		...patch,
		...typical
	})}.`;
	return {
		understood,
		changes: [
			"Plans working drawings (plan, elevation, roof, studs, joists)",
			"Typical openings (confirm sizes)",
			"Kentucky code findings",
			roomsEmpty ? "Rooms named from Scope" : "Rooms (unchanged)"
		],
		consequences: [
			"Envelope, walls, and pitch become canonical. Typical doors/framing fill only empty fields — they are design intent, still editable.",
			openingCount ? `Openings on the sheet: ${openingCount}. Change any door on Plans if this job is not a typical garage.` : "No typical openings added (occupancy is not a garage, or doors already exist).",
			"Howler will not invent a bath size or a county snow load. Unknown stays Unknown.",
			"Working drawings, not a sealed PE set. AHJ governs."
		],
		nextAction: "Confirm to draw the sheets. Edit any dimension, door, or room after.",
		clerical: false,
		eventType: "BLUEPRINT_WORKING_SET",
		apply: (proj) => record(proj, "BLUEPRINT_WORKING_SET", understood, false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			const next = {
				...ensureBlueprint(draft),
				...omitUndefined(patch)
			};
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
		})
	};
}
function previewAdoptTradewalkSet(sourceName) {
	const t = TRADEWALK;
	const from = sourceName ? ` from ${sourceName}` : "";
	return {
		understood: `Adopt the Tradewalk drawing set (${t.issued})${from}: envelope ${formatFtIn(t.overallWidthIn)} × ${formatFtIn(t.overallDepthIn)}, mower shed ${formatFtIn(t.shedWidthIn)} × ${formatFtIn(t.shedDepthIn)}, 10'-0" first-floor walls, 8/12, 2x4 walls, 2x12 joists @ 16" O.C., 2x8 rafters @ 16" O.C., Madison County.`,
		changes: [
			"Plans A01–A11 working drawings plus A15 wall framing",
			"Rooms: GARAGE, STORAGE SHED FOR LAWN MOWER, STAIRWELL, office/flex, half bath",
			"Kentucky code findings (Madison 15 psf). A12–A14 3D stay on the Tradewalk PDF."
		],
		consequences: [
			"Sizes are from Deboard Tradewalk Plans.pdf (A01/A03/A05/A06) and Stanfield citing A01 — not guessed.",
			"A01 tags 2868 man doors and 2840DH windows. SB3621 twice is a 3'-6\" × 2'-1\" window (same cipher) — type/wall Unknown, not an OHD, not a Simpson SSTB36 holdown.",
			"A09 shows two garage-door openers. Leaf widths stay Unknown until you enter the double and the single.",
			"A07 framing to outside of studs is 36'-8\" × 29'-3 3/16\". Murphy B1 4-ply / B2 3-ply / B3 4-ply PASSED (Calcs 8/17/2026).",
			"A11 half-bath is an option. Stairwell is named; run stays Unknown until you place it.",
			"Working drawings citing Tradewalk. Not a new PE stamp. AHJ governs.",
			"Revised budget is unchanged."
		],
		nextAction: "Confirm to replace the live sheets with the Tradewalk layout. Every dimension stays editable.",
		clerical: false,
		eventType: "BLUEPRINT_TRADEWALK_ADOPTED",
		apply: (project) => record(project, "BLUEPRINT_TRADEWALK_ADOPTED", `Adopted Tradewalk Plans ${t.issued} as the working set.`, false, (draft) => {
			const next = tradewalkBlueprint();
			const county = countyCriteria(next.county ?? "");
			if (county) next.groundSnowLoadPsf = county.snowPsf;
			next.jurisdiction = "KENTUCKY";
			next.codeEdition = "KRC_2018";
			next.windSpeedMph = 115;
			next.weathering = "SEVERE";
			const kind = sourceName ? recognizeEvidence(sourceName) : "TRADEWALK";
			next.evidence = [...next.evidence ?? [], {
				id: nextId("ev"),
				name: sourceName ?? TRADEWALK.source,
				kind,
				note: evidenceNote(kind, sourceName ?? TRADEWALK.source),
				url: null
			}];
			draft.blueprint = next;
		})
	};
}
function previewRecordEvidence(input) {
	const kind = input.kind ?? recognizeEvidence(input.name);
	const note = evidenceNote(kind, input.name);
	if (shouldAdoptDeboardTradewalk(input.name)) return previewAdoptTradewalkSet(input.name);
	return {
		understood: `Record uploaded file ${input.name} as evidence. Geometry stays Unknown.`,
		changes: ["Plans evidence register"],
		consequences: [note, "Howler will not invent a building size from a scan. Give width by depth or confirm this is the Tradewalk set."],
		nextAction: "Confirm to keep the filename on the job. Then tell Howler what the file contains.",
		clerical: true,
		eventType: "BLUEPRINT_EVIDENCE",
		apply: (project) => record(project, "BLUEPRINT_EVIDENCE", `Evidence: ${input.name}`, true, (draft) => {
			const bp = ensureBlueprint(draft);
			bp.evidence = [...bp.evidence ?? [], {
				id: nextId("ev"),
				name: input.name,
				kind,
				note,
				url: null
			}];
			draft.blueprint = bp;
		})
	};
}
function previewUpsertOpening(input) {
	const kind = input.kind === "OHD" ? "overhead door" : input.kind === "MAN" ? "man door" : "window";
	return {
		understood: `Place ${kind} ${formatFtIn(input.widthIn)}${input.heightIn ? ` × ${formatFtIn(input.heightIn)}` : ""} on the ${input.wall.toLowerCase()} wall.`,
		changes: ["Plans openings", "Elevation / stud layout"],
		consequences: ["Opening is design intent on the working drawings. Header callout is typical until you enter a specified header.", "Revised budget is unchanged."],
		nextAction: "Confirm the opening.",
		clerical: false,
		eventType: "BLUEPRINT_OPENING_UPSERTED",
		apply: (project) => {
			const id = input.id || nextId("op");
			return record(project, "BLUEPRINT_OPENING_UPSERTED", `Opening ${kind} on ${input.wall}.`, false, (draft) => {
				if (!draft.blueprint) draft.blueprint = emptyBlueprint();
				const next = {
					...input,
					id,
					provenance: input.provenance ?? "PROPOSED",
					offsetProvenance: input.offsetProvenance ?? "PROPOSED",
					datum: input.datum ?? draft.blueprint.dimDatum ?? "FACE_FRAMING"
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
			}, id);
		}
	};
}
function previewRemoveOpening(openingId) {
	return {
		understood: `Remove opening ${openingId} from Plans.`,
		changes: ["Plans openings"],
		consequences: ["The opening leaves the drawing. Envelope is unchanged."],
		nextAction: "Confirm removal.",
		clerical: true,
		eventType: "BLUEPRINT_OPENING_REMOVED",
		apply: (project) => record(project, "BLUEPRINT_OPENING_REMOVED", `Removed opening ${openingId}.`, true, (draft) => {
			if (!draft.blueprint) return;
			draft.blueprint.openings = (draft.blueprint.openings ?? []).filter((item) => item.id !== openingId);
			if (!draft.blueprint.openings.find((item) => item.kind === "OHD")) {
				draft.blueprint.overheadDoorWidthIn = null;
				draft.blueprint.overheadDoorHeightIn = null;
			}
		}, openingId)
	};
}
function previewSuggestConventionalFraming() {
	return {
		understood: "Fill empty framing fields with conventional KRC layout (does not overwrite sizes already entered).",
		changes: [
			"Stud size/spacing",
			"Joist size/spacing if habitable above",
			"Rafter size/spacing"
		],
		consequences: [
			"Only null fields are filled. Entered dimensions, pitch, and county are unchanged.",
			"Suggested default for habitable-over-garage: 2x4 @ 16\" O.C., 2x10 joists @ 16\" O.C., 2x8 rafters @ 16\" O.C.",
			"Howler still checks those suggestions against tabulated spans. Exceeding a table is an engineer finding, not a silent pass."
		],
		nextAction: "Confirm the suggested conventional layout.",
		clerical: false,
		eventType: "BLUEPRINT_FRAMING_SUGGESTED",
		apply: (project) => record(project, "BLUEPRINT_FRAMING_SUGGESTED", "Applied conventional framing suggestions to empty fields.", false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			Object.assign(draft.blueprint, conventionalFramingPatch(draft.blueprint));
		})
	};
}
function previewUpsertRoom(input) {
	const size = input.widthIn && input.depthIn ? `${formatFtIn(input.widthIn)} × ${formatFtIn(input.depthIn)}` : "size Unknown";
	return {
		understood: `Place room "${input.name}" on level ${input.level} (${size}).`,
		changes: ["Plans rooms", "Floor plan sheets"],
		consequences: [input.widthIn && input.depthIn ? "Room is drawn on the level plan." : "Room is named on the sheet. Size stays Unknown until entered — Howler will not invent a 6×8 bath.", "Scope associations are recorded. They do not change Budget."],
		nextAction: "Confirm the room.",
		clerical: false,
		eventType: "BLUEPRINT_ROOM_UPSERTED",
		apply: (project) => {
			const id = input.id ?? nextId("rm");
			return record(project, "BLUEPRINT_ROOM_UPSERTED", `Room "${input.name}" on level ${input.level}.`, false, (draft) => {
				if (!draft.blueprint) draft.blueprint = emptyBlueprint();
				const room = {
					id,
					name: input.name,
					level: input.level,
					widthIn: input.widthIn,
					depthIn: input.depthIn,
					originXIn: input.originXIn,
					originYIn: input.originYIn,
					scopeItemIds: input.scopeItemIds,
					notes: input.notes
				};
				draft.blueprint.rooms[id] = room;
			}, id);
		}
	};
}
function previewIssueDrawingSet(project) {
	const bp = project ? ensureBlueprint(project) : null;
	const unresolved = bp ? unresolvedRegister(bp) : [];
	const blocking = unresolved.filter((item) => item.blocking);
	const watches = unresolved.filter((item) => !item.blocking);
	return {
		understood: "Issue the working-drawing set for contractor layout (not a PE stamp).",
		changes: [
			"Drawing issue status",
			"Activity / History",
			"Title block revision"
		],
		consequences: [
			blocking.length ? `Blocking: ${blocking.map((item) => item.title).join("; ")}.` : "No blocking unresolved items.",
			watches.length ? `Still open (not invented): ${watches.slice(0, 6).map((item) => item.title).join("; ")}${watches.length > 6 ? "…" : ""}.` : "No watch items on the register.",
			"Issued for layout records the exact revision contractors can work from. It does not become a sealed PE stamp.",
			"Guests on a live drawing session do not receive Howler. They only see the sheets.",
			"Changing envelope, openings, or wall height after issue returns the set to Draft."
		],
		nextAction: blocking.length ? "Confirm to issue anyway with unresolved items listed on the title block, or enter the missing sizes first." : "Confirm the issue, then export the PDF.",
		clerical: false,
		eventType: "BLUEPRINT_SET_ISSUED",
		apply: (proj) => record(proj, "BLUEPRINT_SET_ISSUED", "Issued working-drawing set for layout.", false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			draft.blueprint.drawingStatus = "ISSUED";
			draft.blueprint.issuedRevision = draft.revision + 1;
		})
	};
}
function previewSetDrawingDatum(datum) {
	return {
		understood: `Set drawing dimensions ${DATUM_LABEL[datum].toLowerCase()}.`,
		changes: ["Plans dimension datum", "Title block"],
		consequences: [
			"Every overall and opening dimension on the sheets states this surface. Intermediate chains still have to close.",
			"A01 Tradewalk overall remains the recorded finished-face size; A07 framing size stays to face of framing.",
			"Revised budget is unchanged."
		],
		nextAction: "Confirm the datum.",
		clerical: false,
		eventType: "BLUEPRINT_DATUM_SET",
		apply: (project) => record(project, "BLUEPRINT_DATUM_SET", `Dimension datum ${DATUM_LABEL[datum]}.`, false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			draft.blueprint.dimDatum = datum;
		})
	};
}
function previewSetEnvelopeProvenance(provenance) {
	return {
		understood: `Mark the envelope ${PROVENANCE_LABEL[provenance].toLowerCase()}.`,
		changes: ["Plans envelope provenance", "Issue register"],
		consequences: [provenance === "VERIFIED" ? "Envelope is now a verified field measurement. It is not inferred from a PDF scale." : `Envelope provenance becomes ${PROVENANCE_LABEL[provenance]}. Unknown stays visible until you verify.`, "Drawings recompute labels. Geometry is unchanged."],
		nextAction: "Confirm provenance.",
		clerical: false,
		eventType: "BLUEPRINT_ENVELOPE_PROVENANCE",
		apply: (project) => record(project, "BLUEPRINT_ENVELOPE_PROVENANCE", `Envelope ${PROVENANCE_LABEL[provenance]}.`, false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			draft.blueprint.envelopeProvenance = provenance;
		})
	};
}
function previewSetDrawingStatus(status) {
	if (status === "ISSUED") return previewIssueDrawingSet();
	return {
		understood: status === "REVIEWED" ? "Mark the drawing set reviewed (not issued)." : "Return the drawing set to draft.",
		changes: ["Drawing issue status", "Title block"],
		consequences: [status === "REVIEWED" ? "Reviewed means a person looked. It is not issued for layout and not a PE stamp." : "Draft is the working state. Issued revisions stay on History."],
		nextAction: "Confirm the status change.",
		clerical: false,
		eventType: "BLUEPRINT_STATUS_SET",
		apply: (project) => record(project, "BLUEPRINT_STATUS_SET", `Drawing status ${status}.`, false, (draft) => {
			if (!draft.blueprint) draft.blueprint = emptyBlueprint();
			draft.blueprint.drawingStatus = status;
		})
	};
}
function previewReplaceBlueprint(blueprint, note) {
	return {
		understood: note,
		changes: ["Plans working drawings"],
		consequences: ["A drawing-session edit landed on the project. Budget and Schedule are untouched.", "Unknown fields stay Unknown."],
		nextAction: "Open Plans to read the updated sheets.",
		clerical: true,
		eventType: "BLUEPRINT_COLLAB_SYNC",
		apply: (project) => record(project, "BLUEPRINT_COLLAB_SYNC", note, true, (draft) => {
			draft.blueprint = {
				...emptyBlueprint(),
				...blueprint,
				rooms: blueprint.rooms ?? {},
				openings: blueprint.openings ?? []
			};
		})
	};
}
function previewRemoveRoom(roomId) {
	return {
		understood: `Remove room ${roomId} from Plans.`,
		changes: ["Plans rooms"],
		consequences: ["The room leaves the drawing. Envelope and framing are unchanged."],
		nextAction: "Confirm removal.",
		clerical: true,
		eventType: "BLUEPRINT_ROOM_REMOVED",
		apply: (project) => record(project, "BLUEPRINT_ROOM_REMOVED", `Removed room ${roomId}.`, true, (draft) => {
			if (draft.blueprint?.rooms[roomId]) delete draft.blueprint.rooms[roomId];
		}, roomId)
	};
}
function previewRoomsFromScope(project) {
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
			describeEnvelope(bp)
		],
		nextAction: candidates.length ? "Confirm Scope-derived rooms." : "No new rooms to add from Scope.",
		clerical: false,
		eventType: "BLUEPRINT_ROOMS_FROM_SCOPE",
		apply: (proj) => record(proj, "BLUEPRINT_ROOMS_FROM_SCOPE", "Named rooms from Scope.", false, (draft) => {
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
					notes: fullFloor ? "Sized from envelope. Edit if this space is only part of the floor." : "Size Unknown."
				};
				names.add(item.description.toLowerCase());
			}
		})
	};
}
function previewSetInspection(inspectionId, patch) {
	return {
		understood: `Inspection ${inspectionId}: ${patch.status ?? "update"}${patch.date ? ` ${patch.date}` : ""}.`,
		changes: ["Inspections / Permits"],
		consequences: ["A pass is only recorded if you said it passed. Howler will not sign the AHJ card.", "Revised budget is unchanged."],
		nextAction: "Confirm the inspection record.",
		clerical: false,
		eventType: "INSPECTION_UPDATED",
		apply: (project) => record(project, "INSPECTION_UPDATED", `Inspection ${inspectionId} ${patch.status ?? "updated"}.`, false, (draft) => {
			const job = ensureJob(draft);
			const current = job.inspections[inspectionId];
			if (!current) return;
			job.inspections[inspectionId] = {
				...current,
				...patch
			};
			draft.job = job;
		}, inspectionId)
	};
}
function previewSetPermit(status, number) {
	return {
		understood: `Permit ${status.toLowerCase().replace("_", " ")}${number ? ` #${number}` : ""}.`,
		changes: ["Inspections / Permits"],
		consequences: ["This is the AHJ card, not a PE stamp. Revised budget is unchanged."],
		nextAction: "Confirm permit status.",
		clerical: false,
		eventType: "PERMIT_UPDATED",
		apply: (project) => record(project, "PERMIT_UPDATED", `Permit ${status}${number ? ` ${number}` : ""}.`, false, (draft) => {
			const job = ensureJob(draft);
			job.permitStatus = status;
			job.permitNumber = number ?? job.permitNumber;
			draft.job = job;
		})
	};
}
function previewUpsertContact(input) {
	return {
		understood: `Contact ${input.name} · ${input.trade}.`,
		changes: ["Trades / Vendors / Contacts"],
		consequences: ["A name is not a contract. Revised budget is unchanged."],
		nextAction: "Confirm the contact.",
		clerical: true,
		eventType: "CONTACT_UPSERT",
		apply: (project) => record(project, "CONTACT_UPSERT", `Contact ${input.name}.`, true, (draft) => {
			const job = ensureJob(draft);
			const existing = Object.values(job.contacts).find((item) => item.name.toLowerCase() === input.name.toLowerCase());
			const id = existing?.id ?? input.id ?? nextId("ct");
			job.contacts[id] = {
				id,
				name: input.name,
				trade: input.trade,
				phone: input.phone ?? existing?.phone ?? null,
				notes: input.notes ?? existing?.notes ?? null
			};
			draft.job = job;
		})
	};
}
function previewUpsertSelection(input) {
	return {
		understood: `Selection ${input.name}${input.value ? `: ${input.value}` : ""}.`,
		changes: ["Selections"],
		consequences: ["Match-existing is a field fact. Unknown stays Unknown."],
		nextAction: "Confirm the selection.",
		clerical: false,
		eventType: "SELECTION_UPSERT",
		apply: (project) => record(project, "SELECTION_UPSERT", `Selection ${input.name}.`, false, (draft) => {
			const job = ensureJob(draft);
			const existing = job.selections[input.id];
			job.selections[input.id] = {
				id: input.id,
				name: input.name,
				value: input.value ?? existing?.value ?? null,
				status: input.status ?? existing?.status ?? "SELECTED",
				notes: input.notes ?? existing?.notes ?? null
			};
			draft.job = job;
		})
	};
}
function previewAddPhoto(caption, evidenceName) {
	return {
		understood: `Photo note: ${caption}.`,
		changes: ["Photos"],
		consequences: ["Caption is recorded. The image itself stays on your device / Drive."],
		nextAction: "Confirm the photo note.",
		clerical: true,
		eventType: "PHOTO_NOTED",
		apply: (project) => record(project, "PHOTO_NOTED", caption, true, (draft) => {
			const job = ensureJob(draft);
			const id = nextId("ph");
			job.photos[id] = {
				id,
				caption,
				takenAt: nowIso().slice(0, 10),
				evidenceName
			};
			draft.job = job;
		})
	};
}
var CODE_BASIS = "2018 Kentucky Residential Code (based on 2015 IRC)";
var CODE_ADOPTION = "815 KAR 7:125";
var CODE_SHORT = "2018 KRC (2015 IRC)";
function formatCodeNote(note) {
	return note.code ? `${note.text} · ${note.code}` : note.text;
}
function designCriteria(bp) {
	const county = bp.county ? countyCriteria(bp.county) : null;
	const snow = bp.groundSnowLoadPsf != null ? `${bp.groundSnowLoadPsf} psf${county ? ` (${county.name} Co.)` : ""}` : "Unknown — county not recorded";
	const frost = bp.frostDepthIn != null ? `${bp.frostDepthIn}"` : "Unknown — not assumed";
	const occupancy = bp.occupancy ? bp.occupancy === "GARAGE_WITH_HABITABLE" ? "Garage + habitable above" : bp.occupancy === "DETACHED_GARAGE" ? "Detached garage" : bp.occupancy : "Unknown";
	return [
		{
			label: "CODE",
			value: CODE_SHORT,
			code: CODE_ADOPTION
		},
		{
			label: "AHJ",
			value: bp.county ? `${bp.county} Co., KY` : "KY — county Unknown",
			code: "KRS 198B.060"
		},
		{
			label: "SNOW",
			value: snow,
			code: "Table R301.2(1)"
		},
		{
			label: "WIND",
			value: `${bp.windSpeedMph} mph Vult`,
			code: "Table R301.2(1)"
		},
		{
			label: "WEATH",
			value: "Severe — air-entrain",
			code: "Table R402.2"
		},
		{
			label: "FROST",
			value: frost,
			code: "R403.1.4"
		},
		{
			label: "OCC",
			value: occupancy,
			code: "R101 / R309"
		},
		{
			label: "PREP",
			value: "Working drawings — not sealed",
			code: "R106.1 / KRS 322"
		}
	];
}
function codeBasisSummary(bp) {
	const county = bp.county ? countyCriteria(bp.county) : null;
	const snow = bp.groundSnowLoadPsf != null ? `${bp.groundSnowLoadPsf} psf ground snow` : "snow Unknown until a county is entered";
	const where = county ? `${county.name} County` : "Kentucky (county Unknown)";
	return [
		`Code basis: ${CODE_BASIS}, adopted by ${CODE_ADOPTION}.`,
		`${where}: ${snow}; wind ${bp.windSpeedMph} mph Vult; weathering Severe (Table R301.2(1)).`,
		"Callouts on A01–A11 cite the section they satisfy — GFCI is E3902.2, garage/habitable ceiling is R302.6, stairs are KRC R311.7 (8¼\" max riser / 9\" min tread — not vanilla IRC 7¾ / 10).",
		"This is not a PE-stamped permit package (KRS 322 / R106.1). The AHJ decides what must be engineered.",
		bp.frostDepthIn == null ? "Frost depth stays Unknown (R403.1.4). Howler will not assume 24 in." : `Frost depth recorded as ${bp.frostDepthIn} in (R403.1.4).`
	].join(" ");
}
function sheetKeynotes(bp, sheet) {
	const trade = citesTradewalk(bp);
	const garage = bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE";
	const habitableAbove = bp.occupancy === "GARAGE_WITH_HABITABLE";
	const stairUnknown = Object.values(bp.rooms).some((room) => /stair/i.test(room.name) && (room.widthIn == null || room.depthIn == null));
	switch (sheet) {
		case "L1": return trade ? [
			{
				id: "l-shape",
				text: "L-shape from A01 — not a 24×32 box",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "shed",
				text: `Shed ${formatFtIn(TRADEWALK.shedWidthIn)} × ${formatFtIn(TRADEWALK.shedDepthIn)}`,
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "ohd",
				text: "Two OHD (A09) — leaf widths Unknown. Header waits",
				code: "R602.7",
				honesty: "UNKNOWN"
			},
			{
				id: "man",
				text: "Man doors tagged 2868 — see schedule",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "r3025",
				text: "Door to dwelling: 1-3/8\" solid or 20-min",
				code: "R302.5.1",
				honesty: "CHECK"
			},
			{
				id: "win",
				text: "Windows tagged 2840DH — see schedule",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "sb3621",
				text: "SB3621 ×2 = 3'-6\"×2'-1\" window. Wall Unknown. Not Simpson",
				code: "A01 tag",
				honesty: "CHECK"
			},
			{
				id: "stair",
				text: stairUnknown ? "STAIRWELL named — run Unknown. KY 36\" / 8¼\" / 9\"" : "Stair layout recorded",
				code: "R311.7 KY",
				honesty: stairUnknown ? "UNKNOWN" : "CHECK"
			},
			{
				id: "r3026",
				text: habitableAbove ? "5/8\" Type X on garage ceiling (habitable above)" : "Garage/habitable separation",
				code: "R302.6",
				honesty: habitableAbove ? "APPLIES" : "CHECK"
			}
		] : [{
			id: "env",
			text: envelopeComplete(bp) ? `Envelope ${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}` : "Envelope Unknown — Howler will not invent a size",
			code: "R106.1.1",
			honesty: envelopeComplete(bp) ? "CHECK" : "UNKNOWN"
		}, {
			id: "r3026",
			text: habitableAbove ? "5/8\" Type X on garage ceiling (habitable above)" : "Confirm occupancy before fire-separation callouts",
			code: habitableAbove ? "R302.6" : "R309",
			honesty: habitableAbove ? "APPLIES" : "UNKNOWN"
		}];
		case "L2": return [
			{
				id: "attic",
				text: trade ? "A10 calls unfinished attic — not assumed sleeping" : "Attic occupancy Unknown",
				code: "R310 / R314",
				honesty: "CHECK"
			},
			{
				id: "stair-up",
				text: stairUnknown ? "Stair run Unknown — KY 8¼\" riser / 9\" tread" : "Stair from A01",
				code: "R311.7 KY",
				honesty: stairUnknown ? "UNKNOWN" : "CHECK"
			},
			{
				id: "sep",
				text: habitableAbove ? "Garage ceiling below is 5/8\" Type X" : "Confirm assembly",
				code: "R302.6",
				honesty: habitableAbove ? "APPLIES" : "CHECK"
			}
		];
		case "FDN": return trade ? [
			{
				id: "ftg",
				text: "12x24 footing dashed around slab (A03)",
				code: "R403.1",
				honesty: "APPLIES"
			},
			{
				id: "pier",
				text: "2'×2'×2' pier to support LVL (A03)",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "pad",
				text: "Thicken pad for joist-bearing wall (A03)",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "frost",
				text: bp.frostDepthIn == null ? "Frost Unknown — enter the AHJ value" : `Frost ${bp.frostDepthIn}"`,
				code: "R403.1.4",
				honesty: bp.frostDepthIn == null ? "UNKNOWN" : "APPLIES"
			},
			{
				id: "air",
				text: "Air-entrain concrete (Severe weathering)",
				code: "Table R402.2",
				honesty: "APPLIES"
			},
			{
				id: "slab",
				text: "Garage floor noncombustible; slope to door or drain",
				code: "R309.1",
				honesty: "APPLIES"
			}
		] : [{
			id: "frost",
			text: bp.frostDepthIn == null ? "Frost Unknown — enter the AHJ value" : `Frost ${bp.frostDepthIn}"`,
			code: "R403.1.4",
			honesty: bp.frostDepthIn == null ? "UNKNOWN" : "APPLIES"
		}, {
			id: "air",
			text: "Air-entrain concrete (Severe weathering)",
			code: "Table R402.2",
			honesty: "APPLIES"
		}];
		case "EL": return [
			{
				id: "veneer",
				text: trade ? "Brick veneer, soldier, quoins to match existing" : "Exterior finish as recorded",
				code: "R703.8",
				honesty: trade ? "APPLIES" : "CHECK"
			},
			{
				id: "grade",
				text: trade ? "Slope ground away 5% for 10' (A06)" : "Grade away from foundation",
				code: "R401.3",
				honesty: "CHECK"
			},
			{
				id: "shed-ht",
				text: trade ? "Adjust shed height for drop in grade (A04)" : "Grade at shed Unknown",
				code: null,
				honesty: trade ? "CHECK" : "UNKNOWN"
			}
		];
		case "SEC": {
			const proposal = proposedStairFromWalls(bp);
			return [
				{
					id: "eave",
					text: bp.eaveHeightIn != null ? `First-floor walls ${formatFtIn(bp.eaveHeightIn)}` : "Wall height Unknown",
					code: "Table R602.3(5)",
					honesty: bp.eaveHeightIn != null ? "APPLIES" : "UNKNOWN"
				},
				{
					id: "typex",
					text: habitableAbove ? "5/8\" Type X garage ceiling" : "Confirm ceiling assembly",
					code: "R302.6",
					honesty: habitableAbove ? "APPLIES" : "CHECK"
				},
				{
					id: "riser",
					text: "KY riser 8¼\" max — not IRC 7¾\"",
					code: "R311.7.5.1",
					honesty: "APPLIES"
				},
				{
					id: "tread",
					text: "KY tread 9\" min — not IRC 10\"",
					code: "R311.7.5.2",
					honesty: "APPLIES"
				},
				{
					id: "width",
					text: "36\" clear · headroom 6'-8\"",
					code: "R311.7.1 / .2",
					honesty: "APPLIES"
				},
				{
					id: "cut",
					text: proposal ? `${proposal.minRisers} risers · going ≥ ${formatFtIn(proposal.minGoingIn)} PROP` : "Stair run Unknown — not invented",
					code: "R311.7",
					honesty: proposal ? "CHECK" : "UNKNOWN"
				},
				{
					id: "stamp",
					text: "Working section — not a PE stamp",
					code: "R106.1 / KRS 322",
					honesty: "APPLIES"
				}
			];
		}
		case "WALL": return trade ? [
			{
				id: "ftg",
				text: "12x24 concrete footing",
				code: "R403.1",
				honesty: "APPLIES"
			},
			{
				id: "drain",
				text: "4\" HDPE drain + fabric + gravel",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "block",
				text: "12\" brick-ledge block + 8\" top",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "stud",
				text: "2x4 wall @ 10' · conventional table path",
				code: "Table R602.3(5)",
				honesty: "APPLIES"
			},
			{
				id: "r13",
				text: "R-13 min. recorded — not a REScheck",
				code: "N1102 / Ch. 11",
				honesty: "CHECK"
			},
			{
				id: "ties",
				text: "Tyvek · 1\" air gap · brick ties 16\" V/H",
				code: "R703.8",
				honesty: "APPLIES"
			},
			{
				id: "joist",
				text: "2x12 joists @ 16\" · R-19 min.",
				code: "Table R502.3.1(2)",
				honesty: "APPLIES"
			},
			{
				id: "rafter",
				text: "2x8 rafters @ 16\" · 8/12 · R-38 min.",
				code: "Table R802.5.1(1)",
				honesty: "APPLIES"
			},
			{
				id: "typex",
				text: "5/8\" Type X on garage ceiling (habitable above)",
				code: "R302.6",
				honesty: "APPLIES"
			}
		] : [{
			id: "need",
			text: "Enter a wall assembly — Howler will not invent R-values",
			code: "N1102",
			honesty: "UNKNOWN"
		}];
		case "JOIST": return trade ? [
			{
				id: "lvl",
				text: "LVL to support joists (A07)",
				code: "R502.6",
				honesty: "APPLIES"
			},
			{
				id: "b1",
				text: "B1 4-ply 1.75×20 ~24' PASSED (Murphy 8/17/2026)",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "post",
				text: "Post in stairwell wall — place it",
				code: null,
				honesty: "CHECK"
			},
			{
				id: "outer",
				text: `Framing outer ${formatFtIn(TRADEWALK.framingOuterWidthIn)} × ${formatFtIn(TRADEWALK.framingOuterDepthIn)}`,
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "table",
				text: `${bp.joistSize ?? "Joists"} @ ${bp.joistSpacingIn ?? "—"}" O.C. — each line is a member`,
				code: "Table R502.3.1(2)",
				honesty: "APPLIES"
			},
			{
				id: "b23",
				text: "B2 3-ply ~20'-1½\" · B3 4-ply ~8'-3½\"",
				code: null,
				honesty: "APPLIES"
			},
			{
				id: "stamp",
				text: "Murphy calcs are separate — not this stamp",
				code: "KRS 322",
				honesty: "APPLIES"
			}
		] : [{
			id: "table",
			text: `${bp.joistSize ?? "Joists"} @ ${bp.joistSpacingIn ?? "—"}" O.C.`,
			code: "Table R502.3.1(2)",
			honesty: bp.joistSize ? "CHECK" : "UNKNOWN"
		}];
		case "ROOF": return [
			{
				id: "rafter",
				text: `${bp.rafterSize ?? "Rafters"} @ ${bp.rafterSpacingIn ?? "—"}" O.C.`,
				code: "Table R802.5.1(1)",
				honesty: bp.rafterSize ? "APPLIES" : "UNKNOWN"
			},
			{
				id: "truss",
				text: "If trusses: sealed placement drawings required by AHJ",
				code: "R802.10",
				honesty: "CHECK"
			},
			{
				id: "grade",
				text: trade ? "A04: adjust shed height for drop in grade" : "Confirm eave at grade",
				code: null,
				honesty: "CHECK"
			}
		];
		case "ELEC": return garage ? [
			{
				id: "opener",
				text: trade ? "Two openers — leaf widths Unknown. Listed UL 325" : "Openers if provided: listed UL 325",
				code: "R309.4",
				honesty: trade ? "CHECK" : "CHECK"
			},
			{
				id: "gfci",
				text: "GFCI all 125V 15/20A garage receptacles",
				code: "E3902.2",
				honesty: "APPLIES"
			},
			{
				id: "bay",
				text: "≥1 receptacle in each vehicle bay",
				code: "E3901.9",
				honesty: "APPLIES"
			},
			{
				id: "ckt",
				text: "20A garage receptacle circuit; no other outlets",
				code: "NEC 210.11(C)(4)",
				honesty: "APPLIES"
			},
			{
				id: "ev",
				text: trade ? "EV charger option — not placed" : "EV not recorded",
				code: null,
				honesty: "UNKNOWN"
			},
			{
				id: "panel",
				text: "Panel location and amps Unknown — not invented",
				code: "E3701",
				honesty: "UNKNOWN"
			},
			{
				id: "co",
				text: "Attached garage: CO alarm in the dwelling",
				code: "R315.2.1",
				honesty: habitableAbove || trade ? "APPLIES" : "CHECK"
			}
		] : [{
			id: "need",
			text: "Occupancy Unknown — electrical callouts wait",
			code: "E3901",
			honesty: "UNKNOWN"
		}];
		case "ELEC2": return [
			{
				id: "lights",
				text: trade ? "Attic lighting (A10) — layout not dimensioned" : "Attic lighting Unknown",
				code: "E3903",
				honesty: trade ? "CHECK" : "UNKNOWN"
			},
			{
				id: "stair-lt",
				text: "Stair lighting with switch at each floor / 3-way",
				code: "E3903.3",
				honesty: "APPLIES"
			},
			{
				id: "ms",
				text: trade ? "Mini-split electric (A10) — head location not placed" : "HVAC electric Unknown",
				code: null,
				honesty: "UNKNOWN"
			},
			{
				id: "sleep",
				text: "Unfinished ≠ sleeping. Smoke / EERO wait",
				code: "R314 / R310",
				honesty: "CHECK"
			}
		];
		case "PLUMB": return trade ? [
			{
				id: "opt",
				text: "Half bath is an option for pool access — not placed",
				code: null,
				honesty: "UNKNOWN"
			},
			{
				id: "gfci",
				text: "If a lav goes in: GFCI within 6 ft of the sink",
				code: "E3902.1",
				honesty: "CHECK"
			},
			{
				id: "cl",
				text: "A11 CLs recorded — confirm what they measure",
				code: null,
				honesty: "CHECK"
			},
			{
				id: "fix",
				text: "No fixture schedule on the set — not invented",
				code: "P2708",
				honesty: "UNKNOWN"
			}
		] : [{
			id: "need",
			text: "No plumbing recorded",
			code: null,
			honesty: "UNKNOWN"
		}];
		case "STUD": return [
			{
				id: "oc",
				text: `${bp.studSize ?? "Studs"} @ ${bp.studSpacingIn ?? "—"}" O.C. — each tick is a stud`,
				code: "Table R602.3(5)",
				honesty: bp.studSpacingIn ? "APPLIES" : "UNKNOWN"
			},
			{
				id: "corner",
				text: "Corner: 3-stud typical. Count once in the field",
				code: null,
				honesty: "CHECK"
			},
			{
				id: "kings",
				text: trade ? "King/jacks at 2868 / 2840DH" : "King/jacks at recorded openings",
				code: "R602.7",
				honesty: "CHECK"
			},
			{
				id: "ohd",
				text: "OHD kings/jacks wait — leaf widths Unknown",
				code: "R602.7",
				honesty: "UNKNOWN"
			}
		];
		default: return [];
	}
}
function submittalChecklist(bp) {
	const trade = citesTradewalk(bp);
	const openings = bp.openings ?? [];
	const hasMan = openings.some((item) => item.kind === "MAN");
	const hasWin = openings.some((item) => item.kind === "WINDOW");
	const hasOhd = openings.some((item) => item.kind === "OHD") || bp.overheadDoorWidthIn != null;
	const bathNamed = Object.values(bp.rooms).some((room) => /bath/i.test(room.name));
	return [
		{
			id: "clarity",
			code: "R106.1.1",
			title: "Location, nature, and extent of work",
			status: envelopeComplete(bp) ? trade ? "ON_SET" : "PARTIAL" : "MISSING",
			note: envelopeComplete(bp) ? "Envelope is on A01. Unresolved items stay on the register." : "Width and depth are not recorded."
		},
		{
			id: "site",
			code: "R106.2",
			title: "Site plan / survey",
			status: "MISSING",
			note: "Not on A01–A15. Additions typically need distances to lot lines. Howler will not invent a survey."
		},
		{
			id: "floor",
			code: "R106.1.1",
			title: "Floor plans",
			status: envelopeComplete(bp) ? "ON_SET" : "MISSING",
			note: "A01 first floor · A02 attic."
		},
		{
			id: "sched",
			code: "R106.1.1",
			title: "Door / window schedule",
			status: hasMan && hasWin && hasOhd ? "ON_SET" : hasMan || hasWin ? "PARTIAL" : "MISSING",
			note: hasOhd ? "Opening schedule on A01." : "OHD leaf widths Unknown — schedule has a missing row, not a 16' door."
		},
		{
			id: "fdn",
			code: "R106.1.1",
			title: "Foundation plan and details",
			status: envelopeComplete(bp) ? "ON_SET" : "MISSING",
			note: "A03 + A06. Frost stays Unknown until the AHJ value is entered (R403.1.4)."
		},
		{
			id: "elev",
			code: "R106.1.1",
			title: "Elevations",
			status: bp.eaveHeightIn && bp.roofRise ? "ON_SET" : "PARTIAL",
			note: "A04 four faces."
		},
		{
			id: "sec",
			code: "R106.1.1",
			title: "Building / wall sections",
			status: envelopeComplete(bp) ? "ON_SET" : "MISSING",
			note: "A05 building · A06 wall assembly."
		},
		{
			id: "elec",
			code: "Ch. 34–43",
			title: "Electrical plan",
			status: trade ? "PARTIAL" : "MISSING",
			note: "A09/A10 devices. Panel location and amps Unknown — not invented."
		},
		{
			id: "plumb",
			code: "Ch. 25–33",
			title: "Plumbing plan",
			status: trade || bathNamed ? "PARTIAL" : "NA",
			note: "A11 is an option. No fixture schedule. Confirm in or out."
		},
		{
			id: "energy",
			code: "N1102 / Ch. 11",
			title: "Energy compliance",
			status: trade ? "PARTIAL" : "MISSING",
			note: trade ? "R-13 / R-19 / R-38 min. recorded on A06. That is not a REScheck or IECC compliance report." : "R-values not recorded."
		},
		{
			id: "seal",
			code: "R106.1 / KRS 322",
			title: "Design professional seal",
			status: "MISSING",
			note: "Howler does not seal. Murphy LVL calcs (8/17/2026) are a separate document, not this set."
		}
	];
}
function sharePacketLines(project) {
	const bp = project.blueprint;
	const blocking = unresolvedRegister(bp).filter((item) => item.blocking);
	return [
		`Project: ${project.name} — ${project.address || "address Unknown"}`,
		`Scope: ${bp.occupancy ?? "occupancy Unknown"} · ${project.projectType}`,
		`Code basis: ${CODE_BASIS} (${CODE_ADOPTION}). Do not assume the reader knows the edition.`,
		`Callouts cite the section (example: GFCI · E3902.2, not “GFCI here”).`,
		`Status: ${bp.drawingStatus ?? "DRAFT"} · rev ${project.revision}${bp.issuedRevision ? ` · last issued rev ${bp.issuedRevision}` : " · not issued"}`,
		`Prepared by: Howler working drawings — not a licensed design professional. Kentucky does not require a GC license; electrical / plumbing / HVAC trades do.`,
		blocking.length ? `Still open before layout: ${blocking.map((item) => item.title).join("; ")}.` : "No blocking unresolved items on the register."
	];
}
var STORAGE_KEY$1 = "howler-memory-v1";
var EMPTY = {
	lastCounty: null,
	typicalStudSize: null,
	typicalStudSpacingIn: null,
	typicalJoistSize: null,
	typicalJoistSpacingIn: null,
	typicalRafterSize: null,
	typicalRafterSpacingIn: null,
	typicalPitchRise: null,
	typicalPitchRun: null,
	typicalOccupancy: null,
	typicalScale: null,
	lastUtterances: []
};
function canStore() {
	return typeof window !== "undefined";
}
function readMemory() {
	if (!canStore()) return {
		...EMPTY,
		lastUtterances: []
	};
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY$1);
		if (!raw) return {
			...EMPTY,
			lastUtterances: []
		};
		return {
			...EMPTY,
			...JSON.parse(raw)
		};
	} catch {
		return {
			...EMPTY,
			lastUtterances: []
		};
	}
}
function writeMemory(next) {
	if (!canStore()) return;
	window.localStorage.setItem(STORAGE_KEY$1, JSON.stringify(next));
}
function rememberFromPreview(preview, project) {
	const memory = readMemory();
	const bp = ensureBlueprint(project);
	if (preview.eventType.startsWith("BLUEPRINT") || preview.eventType === "BLUEPRINT_UPDATED") {
		if (bp.county) memory.lastCounty = bp.county;
		if (bp.studSize) memory.typicalStudSize = bp.studSize;
		if (bp.studSpacingIn) memory.typicalStudSpacingIn = bp.studSpacingIn;
		if (bp.joistSize) memory.typicalJoistSize = bp.joistSize;
		if (bp.joistSpacingIn) memory.typicalJoistSpacingIn = bp.joistSpacingIn;
		if (bp.rafterSize) memory.typicalRafterSize = bp.rafterSize;
		if (bp.rafterSpacingIn) memory.typicalRafterSpacingIn = bp.rafterSpacingIn;
		if (bp.roofRise) memory.typicalPitchRise = bp.roofRise;
		if (bp.roofRun) memory.typicalPitchRun = bp.roofRun;
		if (bp.occupancy) memory.typicalOccupancy = bp.occupancy;
		if (bp.drawingScale) memory.typicalScale = bp.drawingScale;
	}
	memory.lastUtterances = [{
		at: (/* @__PURE__ */ new Date()).toISOString(),
		understood: preview.understood,
		eventType: preview.eventType
	}, ...memory.lastUtterances].slice(0, 24);
	writeMemory(memory);
	return memory;
}
function memoryFramingPatch(memory = readMemory()) {
	const patch = {};
	if (memory.typicalStudSize) patch.studSize = memory.typicalStudSize;
	if (memory.typicalStudSpacingIn) patch.studSpacingIn = memory.typicalStudSpacingIn;
	if (memory.typicalJoistSize) patch.joistSize = memory.typicalJoistSize;
	if (memory.typicalJoistSpacingIn) patch.joistSpacingIn = memory.typicalJoistSpacingIn;
	if (memory.typicalRafterSize) patch.rafterSize = memory.typicalRafterSize;
	if (memory.typicalRafterSpacingIn) patch.rafterSpacingIn = memory.typicalRafterSpacingIn;
	if (memory.lastCounty) patch.county = memory.lastCounty;
	if (memory.typicalPitchRise && memory.typicalPitchRun) {
		patch.roofRise = memory.typicalPitchRise;
		patch.roofRun = memory.typicalPitchRun;
	}
	if (memory.typicalOccupancy) patch.occupancy = memory.typicalOccupancy;
	if (memory.typicalScale) patch.drawingScale = memory.typicalScale;
	return patch;
}
function memorySummary(memory = readMemory()) {
	const bits = [];
	if (memory.lastCounty) bits.push(`${memory.lastCounty} County`);
	if (memory.typicalStudSize && memory.typicalStudSpacingIn) bits.push(`${memory.typicalStudSize} @ ${memory.typicalStudSpacingIn}"`);
	if (memory.typicalPitchRise && memory.typicalPitchRun) bits.push(`${memory.typicalPitchRise}/${memory.typicalPitchRun}`);
	if (bits.length === 0) return "No personal framing habits recorded yet. Confirm a drawing and Howler will remember how you build.";
	return `Howler remembers: ${bits.join(" · ")}. Say “same as last time” to reuse. Dimensions are never guessed.`;
}
function nextSaturday(from = /* @__PURE__ */ new Date()) {
	const date = new Date(from);
	const delta = (6 - date.getDay() + 7) % 7 || 7;
	date.setDate(date.getDate() + delta);
	return date.toISOString().slice(0, 10);
}
function scoreName(text, name) {
	const t = text.toLowerCase();
	const n = name.toLowerCase().trim();
	if (!n) return 0;
	if (t.includes(n)) return n.length + 12;
	const parts = n.split(/[^a-z0-9]+/).filter((part) => part.length >= 3);
	let score = 0;
	for (const part of parts) if (t.includes(part)) score += part.length;
	return score;
}
function pickNamed(items, text, label) {
	const ranked = items.map((item) => ({
		item,
		score: scoreName(text, label(item)),
		name: label(item)
	})).filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
	const names = ranked.map((row) => row.name);
	if (ranked.length === 0) return {
		hit: null,
		names
	};
	if (ranked.length === 1) return {
		hit: ranked[0].item,
		names
	};
	if (ranked[0].score >= ranked[1].score + 4) return {
		hit: ranked[0].item,
		names
	};
	return {
		hit: null,
		names
	};
}
function extractMoney(text, currency) {
	const dollar = /\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(text);
	if (dollar) return parseMoneyDecimal(dollar[1].replace(/,/g, ""), currency);
	if (!/\b(price|priced|cost|invoice|invoiced|spent|paid|budget|allowance|commit(?:ment|ted)?|change order|\bco\b)\b/i.test(text)) return null;
	const match = /(?:^|[^\d])([\d,]+(?:\.\d{1,2})?)(?:\b)/.exec(text);
	if (!match) return null;
	return parseMoneyDecimal(match[1].replace(/,/g, ""), currency);
}
function extractDate(text) {
	const iso = /\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
	if (iso) return iso;
	const named = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/i.exec(text);
	if (named) {
		const month = {
			jan: "01",
			feb: "02",
			mar: "03",
			apr: "04",
			may: "05",
			jun: "06",
			jul: "07",
			aug: "08",
			sep: "09",
			oct: "10",
			nov: "11",
			dec: "12"
		}[named[1].slice(0, 3).toLowerCase()];
		const day = named[2].padStart(2, "0");
		if (month) return `${named[3]}-${month}-${day}`;
	}
	if (/\bsaturday\b/i.test(text)) return nextSaturday();
	return null;
}
function clarify(message) {
	return {
		outcome: "CLARIFICATION",
		message
	};
}
function whichOf(kind, names) {
	if (names.length === 0) return clarify(`Which ${kind}? Name it exactly. I will not guess.`);
	return clarify(`Which ${kind}: ${names.slice(0, 5).join("; ")}?`);
}
function parseFeet(raw) {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return null;
	return feetToInches(value);
}
function extractEnvelope(text) {
	const stripped = text.replace(/\b2\s*[x×]\s*(?:4|6|8|10|12)\b/gi, " ");
	const match = /(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?/i.exec(stripped);
	if (!match || match.index == null) return null;
	const around = stripped.slice(Math.max(0, match.index - 16), match.index + match[0].length + 28);
	if (/\b(door|ohd|overhead)\b/i.test(around) && !/\b(building|envelope|footprint|garage(?!\s+door)|shop|barn)\b/i.test(text)) return null;
	if (/\b(room|office|bath|flex|storage)\b/i.test(around) && !/\b(building|envelope|garage|shop|barn)\b/i.test(text)) return null;
	const widthIn = parseFeet(match[1]);
	const depthIn = parseFeet(match[2]);
	if (!widthIn || !depthIn) return null;
	if (widthIn < 96 || depthIn < 96) return null;
	return {
		widthIn,
		depthIn
	};
}
function extractPitch(text) {
	const match = /(\d+(?:\.\d+)?)\s*(?:\/|over|:|-|on)\s*(12)\b|\b(\d+(?:\.\d+)?)\s+and\s+(12)\b|\bpitch\s+(\d+(?:\.\d+)?)\b/i.exec(text);
	if (!match) return null;
	const rise = Number(match[1] ?? match[3] ?? match[5]);
	const run = Number(match[2] ?? match[4] ?? 12);
	if (!Number.isFinite(rise) || rise <= 0) return null;
	return {
		roofRise: rise,
		roofRun: run
	};
}
function extractSpacing(text, kind) {
	const kindRe = kind === "any" ? "" : kind === "stud" ? "(?:studs?|wall)[^.]{0,24}" : kind === "joist" ? "(?:joists?|floor)[^.]{0,24}" : "(?:rafters?|roof)[^.]{0,24}";
	const match = new RegExp(`${kindRe}(\\d+)\\s*(?:\"|in(?:ch(?:es)?)?)?\\s*(?:o\\.?c\\.?|on\\s*center)|(\\d+)\\s*(?:\"|in(?:ch(?:es)?)?)?\\s*(?:o\\.?c\\.?|on\\s*center)[^.]{0,18}${kind === "any" ? "" : kindRe}`, "i").exec(text);
	if (match) {
		const value = Number(match[1] ?? match[2]);
		if (value === 19) return 19.2;
		if (![
			12,
			16,
			19.2,
			24
		].includes(value)) return null;
		return value;
	}
	if (kind !== "any") {
		const generic = /(\d+)\s*(?:"|in(?:ch(?:es)?)?)?\s*(?:o\.?c\.?|on\s*center)/i.exec(text);
		if (generic && new RegExp(kind, "i").test(text)) return Number(generic[1]);
	}
	return null;
}
function extractLumber(text, kind) {
	const window = kind === "any" ? text : new RegExp(`(.{0,28}${kind}s?.{0,28}|${kind}s?.{0,40})`, "i").exec(text)?.[0] ?? "";
	const match = /2\s*[x×by]\s*(4|6|8|10|12)/i.exec(window || text);
	if (!match) return null;
	const size = `2x${match[1]}`;
	return LUMBER_SIZES.includes(size) ? size : null;
}
function extractHeight(text) {
	const match = /(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*(?:walls?|eaves?|plate|wall height|eave height)|(?:walls?|eaves?|plate|height)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i.exec(text);
	if (!match) return null;
	return parseFeet(match[1] ?? match[2]);
}
function extractWall(text) {
	const lower = text.toLowerCase();
	if (/\b(front|street|approach|south)\b/.test(lower)) return "FRONT";
	if (/\b(back|rear|north)\b/.test(lower)) return "BACK";
	if (/\b(left|west)\b/.test(lower)) return "LEFT";
	if (/\b(right|east)\b/.test(lower)) return "RIGHT";
	return null;
}
function extractDoor(text) {
	const labeled = /(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*(?:garage door|overhead(?:\s+door)?|\bohd\b)/i.exec(text) ?? /(?:garage door|overhead(?:\s+door)?|\bohd\b)\s*(?:is\s*|at\s*)?(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?(?:\s*(?:x|by|×)\s*(\d+(?:\.\d+)?))?/i.exec(text);
	if (!labeled) return null;
	return {
		widthIn: parseFeet(labeled[1]) ?? void 0,
		heightIn: labeled[2] ? parseFeet(labeled[2]) ?? void 0 : void 0
	};
}
function extractOccupancy(text) {
	const lower = text.toLowerCase();
	if (/\b(post[-\s]?and[-\s]?frame|pole barn|post frame)\b/.test(lower)) return "POST_AND_FRAME";
	if (/\b(office|flex|habitable|second floor|2nd floor|living)\b/.test(lower) && /\bgarage\b/.test(lower)) return "GARAGE_WITH_HABITABLE";
	if (/\b(house|dwelling|residence)\b/.test(lower) && !/\bgarage\b/.test(lower)) return "DWELLING";
	if (/\bdetached garage\b/.test(lower) || /\bgarage\b/.test(lower) && !/\b(office|flex|second|habitable)\b/.test(lower)) return "DETACHED_GARAGE";
	return null;
}
function extractStories(text) {
	if (/\b(two|2)[-\s]?stor(?:y|ies)|second floor|2nd floor\b/i.test(text)) return 2;
	if (/\b(one|1)[-\s]?stor(?:y|ies)|single stor/i.test(text)) return 1;
	if (/\b(three|3)[-\s]?stor/i.test(text)) return 3;
	return null;
}
function extractOverhang(text) {
	const match = /(\d+(?:\.\d+)?)\s*(?:\"|in|inch|inches|'|ft|foot|feet)?\s*overhang/i.exec(text);
	if (!match) return null;
	const value = Number(match[1]);
	if (/"|in|inch/.test(match[0]) && !/ft|feet|foot|'/.test(match[0])) return Math.round(value);
	return parseFeet(match[1]);
}
function extractFrost(text) {
	const match = /frost(?:\s*depth)?\s*(?:of\s*)?(\d+)/i.exec(text);
	if (!match) return null;
	const value = Number(match[1]);
	return value <= 48 ? value : feetToInches(value);
}
function isBlueprintTalk(lower) {
	return /\b(blueprint|plans?|drawing|envelope|dimension|studs?|joists?|rafters?|pitch|rise over run|roof run|on center|o\.?c\.?|eave|gable|span|building code|truss|overhang|frost|occupancy|drawing scale|tradewalk|working set)\b/.test(lower) || /\b\d+\s*(x|by|×)\s*\d+\b/.test(lower) || /\b\d+\s*\/\s*12\b/.test(lower) || /\b2\s*[x×]\s*(4|6|8|10|12)\b/.test(lower);
}
function isFieldUpdate(lower) {
	if (/\b(blueprint|width by depth|studs?|joists?|rafters?|tradewalk|working set)\b/.test(lower)) return false;
	return /\b(update|done|complete|completed|finished|closed|awaiting|waiting on|waiting for|on site|lined up|mobilized|punch|light pole|estimate|approval|jason bonham|john marr|stanfield|concrete|framing|electrical|next call)\b/.test(lower);
}
function interpretBlueprint(project, text, lower) {
	if (/\b(code basis|what(?:'s| is) the code|which code|cite the code|kentucky residential code|krc 2018|2018 krc)\b/.test(lower) && !/\bstair/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: codeBasisSummary(ensureBlueprint(project))
	};
	if (/\b(stair code|kentucky stair|krc stair|stair (?:limits?|geometry|riser|tread)|what(?:'s| is) the stair)\b/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: stairCodeSummary(ensureBlueprint(project))
	};
	if (/\bsb3621\b/.test(lower) && !extractWall(text) && !/\b(place|put|on the)\b/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: sb3621Summary()
	};
	if (/\b(issue (the |this )?(drawings?|set|plans|working set)|issue for layout|mark (the )?(set|drawings?) issued)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewIssueDrawingSet(project)
	};
	if (/\b(mark (the )?(drawings?|set) reviewed|reviewed for issue)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingStatus("REVIEWED")
	};
	if (/\b(return (the )?(set|drawings?) to draft|mark (the )?draft)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingStatus("DRAFT")
	};
	if (/\b(mark (the )?envelope verified|verified (field )?measurement|measured in the field|envelope is verified)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetEnvelopeProvenance("VERIFIED")
	};
	if (/\b(face of framing|to framing|to studs|to outside of framing)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingDatum("FACE_FRAMING")
	};
	if (/\b(finished face|to brick|face of brick|to veneer|to finished face)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingDatum("FACE_FINISH")
	};
	if (/\b(to centerline|on (the )?centerline|centerline datum)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetDrawingDatum("CENTERLINE")
	};
	if (/\b(export (the )?(pdf|set|drawings?|plans)|download (the )?(pdf|set)|print (the )?(set|drawings?|plans|pdf))\b/.test(lower)) return {
		outcome: "ACTION",
		action: /\bprint\b/.test(lower) && !/\bpdf\b/.test(lower) ? "PRINT" : "EXPORT_PDF",
		message: "Same as the Plans export button. Print dialog first, then Howler will queue Issue so the revision matches what the contractor holds."
	};
	if (/\b(produce|generate|draw|make|lay out|layout)\b/.test(lower) && /\b(working set|documents?|sheets?|construction (docs?|documents)|drawing set)\b/.test(lower)) {
		const live = ensureBlueprint(project);
		if (citesTradewalk(live) || envelopeComplete(live)) return {
			outcome: "RESOLVED",
			preview: previewDrawWorkingSet(project)
		};
		return clarify("No envelope yet. Drop the Tradewalk PDF, say “use the Tradewalk plans”, or give width by depth. I will not invent a building.");
	}
	if (/\b(tradewalk|from the plans|use the plans|adopt the plans|deboard plans|sheet a0|from a01|google drive|from (?:my )?drive|deboard tradewalk|look at the plans)\b/.test(lower) || /\b(read|load|use|adopt|pull|review)\b/.test(lower) && /\b(drive|plans?|drawings?|tradewalk|deboard)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewAdoptTradewalkSet()
	};
	if (/\b(this (file|upload|pdf) is (the )?tradewalk|that (file|upload) is (the )?tradewalk)\b/.test(lower)) {
		const last = ensureBlueprint(project).evidence?.at(-1)?.name;
		return {
			outcome: "RESOLVED",
			preview: previewAdoptTradewalkSet(last)
		};
	}
	const bp = ensureBlueprint(project);
	const envelope = extractEnvelope(text);
	const pitch = extractPitch(text);
	const height = extractHeight(text);
	const county = matchCounty(text);
	const occupancy = extractOccupancy(text);
	const stories = extractStories(text);
	const door = extractDoor(text);
	const overhang = extractOverhang(text);
	const frost = extractFrost(text);
	const drawingScale = parseDrawingScale(text);
	const studSize = extractLumber(text, "stud") ?? (/\bstuds?\b/.test(lower) ? extractLumber(text, "any") : null);
	const joistSize = extractLumber(text, "joist") ?? (/\bjoists?\b/.test(lower) ? extractLumber(text, "any") : null);
	const rafterSize = extractLumber(text, "rafter") ?? (/\brafters?\b/.test(lower) ? extractLumber(text, "any") : null);
	const studSpacing = extractSpacing(text, "stud") ?? (/\bstuds?\b/.test(lower) ? extractSpacing(text, "any") : null);
	const joistSpacing = extractSpacing(text, "joist") ?? (/\bjoists?\b/.test(lower) ? extractSpacing(text, "any") : null);
	const rafterSpacing = extractSpacing(text, "rafter") ?? (/\brafters?\b/.test(lower) ? extractSpacing(text, "any") : null);
	const roomHit = /(?:room|office|bath(?:room)?|flex|shop|storage|stair(?:well)?)\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)/i.exec(text);
	if (roomHit) {
		const nameMatch = /((?:half\s+)?(?:bath(?:room)?|office(?:\s*\/\s*flex)?|flex|shop|storage|garage|stair(?:well)?))/i.exec(text);
		const widthIn = parseFeet(roomHit[1]);
		const depthIn = parseFeet(roomHit[2]);
		const level = /\b(second|2nd|upper|l2)\b/i.test(text) ? 2 : 1;
		const existing = pickNamed(Object.values(bp.rooms), text, (room) => room.name);
		return {
			outcome: "RESOLVED",
			preview: previewUpsertRoom({
				id: existing.hit?.id,
				name: existing.hit?.name ?? nameMatch?.[1] ?? "Room",
				level,
				widthIn,
				depthIn,
				originXIn: existing.hit?.originXIn ?? null,
				originYIn: existing.hit?.originYIn ?? null,
				scopeItemIds: existing.hit?.scopeItemIds ?? [],
				notes: existing.hit?.notes ?? null
			})
		};
	}
	if (/\b(rooms? from scope|place rooms|name rooms from scope)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewRoomsFromScope(project)
	};
	if (/\b(remove|delete|clear)\b/.test(lower) && /\b(opening|door|window|ohd)\b/.test(lower)) {
		const openings = bp.openings ?? [];
		const named = pickNamed(openings, text, (item) => `${item.tag ?? ""} ${item.kind} ${item.wall}`);
		if (named.hit) return {
			outcome: "RESOLVED",
			preview: previewRemoveOpening(named.hit.id)
		};
		if (openings.length === 1) return {
			outcome: "RESOLVED",
			preview: previewRemoveOpening(openings[0].id)
		};
		return whichOf("opening", openings.map((item) => item.tag ?? `${item.kind} ${item.wall}`));
	}
	const tag = /\b((?:SB|SH|AW|HO|FX|SL)?\d{4}(?:DH|SH|AW|HO)?)\b/i.exec(text)?.[1]?.toUpperCase() ?? null;
	const taggedSize = tag ? sizeFromDoorTag(tag) : null;
	const manTalk = /\b(man door|walk door|entry door|service door|personnel door)\b/.test(lower);
	const windowTalk = /\bwindows?\b/.test(lower) || /^SB/i.test(tag ?? "");
	const ohdTalk = /\b(overhead(?:\s+door)?|garage door|\bohd\b)\b/.test(lower);
	if (manTalk || windowTalk && !ohdTalk || ohdTalk) {
		const kind = ohdTalk ? "OHD" : manTalk ? "MAN" : "WINDOW";
		if (kind === "OHD" && !door) return clarify("Overhead leaf width is Unknown. Say the size (16 by 7 overhead on the front) or leave it Unknown. I will not invent 16 feet.");
		if ((kind === "MAN" || kind === "WINDOW") && !door && !taggedSize) return clarify(kind === "MAN" ? "Man door size? Say a tag (2868) or a width by height. I will not invent a leaf." : "Window size? Say a tag (2840DH) or a width by height. I will not invent a unit.");
		const wall = extractWall(text) ?? (kind === "OHD" ? "FRONT" : kind === "MAN" ? "LEFT" : "RIGHT");
		const existing = (bp.openings ?? []).find((item) => item.kind === kind && item.wall === wall);
		const widthIn = door?.widthIn ?? taggedSize?.widthIn ?? existing?.widthIn ?? null;
		const heightIn = door?.heightIn ?? taggedSize?.heightIn ?? existing?.heightIn ?? null;
		if (widthIn == null) return clarify("Opening width is Unknown. I will not invent it.");
		const wallLen = wall === "FRONT" || wall === "BACK" ? bp.widthIn : bp.depthIn;
		const offsetIn = existing?.offsetIn ?? (kind === "OHD" && wallLen ? Math.max(0, (wallLen - widthIn) / 2) : 48);
		return {
			outcome: "RESOLVED",
			preview: previewUpsertOpening({
				id: existing?.id ?? "",
				kind,
				wall,
				widthIn,
				heightIn,
				offsetIn,
				sillIn: kind === "WINDOW" ? 36 : 0,
				headerSize: kind === "OHD" ? "2x12" : "2x10",
				tag: tag ?? existing?.tag ?? null,
				provenance: taggedSize ? "INFERRED" : door ? "PROPOSED" : "INFERRED",
				offsetProvenance: existing?.offsetProvenance ?? "PROPOSED",
				datum: bp.dimDatum ?? "FACE_FRAMING",
				notes: taggedSize ? `Tag ${tag}` : existing?.notes ?? "Confirm size"
			})
		};
	}
	if (/\b(same as last time|same as usual|how we always frame|usual county|usual framing)\b/.test(lower)) {
		const remembered = memoryFramingPatch();
		const patch = {};
		const wantCounty = /\bcounty\b/.test(lower) || /\bsame as last time\b/.test(lower) || /\bsame as usual\b/.test(lower);
		const wantFraming = /\b(fram|stud|joist|rafter|same as last time|same as usual|how we always)\b/.test(lower);
		if (wantCounty && remembered.county) patch.county = remembered.county;
		if (wantFraming) {
			if (remembered.studSize) patch.studSize = remembered.studSize;
			if (remembered.studSpacingIn) patch.studSpacingIn = remembered.studSpacingIn;
			if (remembered.joistSize) patch.joistSize = remembered.joistSize;
			if (remembered.joistSpacingIn) patch.joistSpacingIn = remembered.joistSpacingIn;
			if (remembered.rafterSize) patch.rafterSize = remembered.rafterSize;
			if (remembered.rafterSpacingIn) patch.rafterSpacingIn = remembered.rafterSpacingIn;
		}
		if (Object.keys(patch).length === 0) return clarify("I have not learned a usual framing or county from you yet. Confirm a drawing once, then “same as last time” will reuse it. I still will not invent a building size.");
		return {
			outcome: "RESOLVED",
			preview: previewPatchBlueprint(patch)
		};
	}
	if (/\b(conventional framing|typical framing|fill framing|suggest framing)\b/.test(lower)) {
		if (!envelopeComplete(bp) && !envelope) return clarify("Envelope is Unknown. Give width by depth, then I can suggest conventional stud/joist/rafter layout. I will not invent a building size.");
		return {
			outcome: "RESOLVED",
			preview: previewSuggestConventionalFraming()
		};
	}
	const patch = {};
	if (envelope) {
		patch.widthIn = envelope.widthIn;
		patch.depthIn = envelope.depthIn;
		patch.envelopeProvenance = /\b(measured|verified|field)\b/.test(lower) ? "VERIFIED" : "PROPOSED";
	}
	if (pitch) {
		patch.roofRise = pitch.roofRise;
		patch.roofRun = pitch.roofRun;
	}
	if (height) patch.eaveHeightIn = height;
	if (county) patch.county = county;
	if (occupancy && !bp.occupancy) patch.occupancy = occupancy;
	else if (occupancy && /\b(occupancy|use|classified|this is)\b/.test(lower)) patch.occupancy = occupancy;
	if (stories) patch.stories = stories;
	if (studSize) patch.studSize = studSize;
	if (studSpacing) patch.studSpacingIn = studSpacing;
	if (joistSize) patch.joistSize = joistSize;
	if (joistSpacing) patch.joistSpacingIn = joistSpacing;
	if (rafterSize) patch.rafterSize = rafterSize;
	if (rafterSpacing) patch.rafterSpacingIn = rafterSpacing;
	if (door?.widthIn) patch.overheadDoorWidthIn = door.widthIn;
	if (door?.heightIn) patch.overheadDoorHeightIn = door.heightIn;
	if (overhang != null) patch.overhangIn = overhang;
	if (frost != null) patch.frostDepthIn = frost;
	if (drawingScale) patch.drawingScale = drawingScale;
	if (/\bjoists?\s+(span|run|along)\s+(the\s+)?depth\b/.test(lower)) patch.joistDirection = "DEPTH";
	if (/\bjoists?\s+(span|run|along)\s+(the\s+)?width\b/.test(lower)) patch.joistDirection = "WIDTH";
	if (/\bhip\s+roof\b/.test(lower)) patch.roofStyle = "HIP";
	if (/\bshed\s+roof\b/.test(lower)) patch.roofStyle = "SHED";
	if (/\bgable\b/.test(lower)) patch.roofStyle = "GABLE";
	if (/\b(draw|generate|render|make|show|lay out|layout)\b/.test(lower) && /\b(plan|blueprint|drawing|sheet|garage|typical)\b/.test(lower)) {
		if (!envelopeComplete(bp) && !envelope) return clarify("Envelope is Unknown. Give width by depth in feet, wall height, and roof pitch as rise over run (example: 24 by 32 garage, 9 foot walls, 8/12). I will not invent dimensions.");
		return {
			outcome: "RESOLVED",
			preview: previewDrawWorkingSet(project, patch)
		};
	}
	const garageTalk = /\bgarage\b/.test(lower) || occupancy === "DETACHED_GARAGE" || occupancy === "GARAGE_WITH_HABITABLE";
	if (Object.keys(patch).length > 0 && envelope && garageTalk) return {
		outcome: "RESOLVED",
		preview: previewDrawWorkingSet(project, patch)
	};
	if (Object.keys(patch).length > 0) return {
		outcome: "RESOLVED",
		preview: previewPatchBlueprint(patch)
	};
	if (isBlueprintTalk(lower) && !/\b(budget|change order|\bco\b|invoice|commit)/.test(lower)) return clarify("For Plans I need a named fact: width by depth (24 by 32), rise over run (8/12), wall height, county, lumber (2x10 joists 16 on center), or a door (16 foot overhead door). I will not invent a size.");
	if (/\b(make it bigger|make it smaller|bigger|smaller)\b/.test(lower)) return clarify("Give the size in feet. I will not guess bigger.");
	return null;
}
function interpretJob(project, text, lower) {
	if (!/\b(inspection|permit|contact|vendor|\bsub\b|photo|pics?|selection|match existing brick)\b/.test(lower)) return null;
	const job = ensureJob(project);
	const date = extractDate(text);
	if (/\bpermit\b/.test(lower) && /\b(issued|submitted|filed|not filed)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetPermit(/\bissued\b/.test(lower) ? "ISSUED" : /\bsubmitted|filed\b/.test(lower) ? "SUBMITTED" : "NOT_FILED", /\b(?:#|no\.?|number)\s*([A-Z0-9-]+)\b/i.exec(text)?.[1] ?? null)
	};
	const inspMatch = /\b(footing|footer|foundation|slab|framing|rough electric|rough plumbing|insulation|final)\s+inspection\b/i.exec(lower);
	if (inspMatch) {
		const token = inspMatch[1];
		const found = Object.values(job.inspections).find((item) => {
			const n = item.name.toLowerCase();
			if (token === "footer" || token === "footing") return /footing/.test(n);
			if (token === "slab" || token === "foundation") return /foundation|slab/.test(n);
			if (token === "rough electric") return /electrical/.test(n);
			if (token === "rough plumbing") return /plumbing/.test(n);
			return n.includes(token);
		});
		if (!found) return clarify("Which inspection: footing, slab, framing, rough electric, rough plumbing, insulation, or final?");
		let status = found.status;
		if (/\bpass(ed)?\b/.test(lower)) status = "PASSED";
		else if (/\bfail(ed)?\b/.test(lower)) status = "FAILED";
		else if (/\bschedule/.test(lower)) status = "SCHEDULED";
		else if (/\bready\b/.test(lower)) status = "READY";
		else return clarify(`Say what happened to the ${found.name} inspection: passed, failed, scheduled, or ready.`);
		return {
			outcome: "RESOLVED",
			preview: previewSetInspection(found.id, {
				status,
				date: date ?? found.date,
				notes: found.notes
			})
		};
	}
	const contact = /(?:add |new )?(?:contact|vendor|sub)\s+([A-Za-z][A-Za-z .'-]+?)(?:\s*[,·-]\s*|\s+)(framing|plumbing|electrical|concrete|masonry|roofing|hvac|follow-up)/i.exec(text);
	if (contact) return {
		outcome: "RESOLVED",
		preview: previewUpsertContact({
			name: contact[1].trim(),
			trade: contact[2]
		})
	};
	if (/^(photo|pics?)[:\s]/i.test(text) || /\bphoto note\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewAddPhoto(text.replace(/^(photo|pics?)[:\s]+/i, "").trim() || text, ensureBlueprint(project).evidence?.at(-1)?.name ?? null)
	};
	if (/\b(brick (?:to )?match existing|match existing brick)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewUpsertSelection({
			id: "sel-brick",
			name: "Brick veneer",
			value: "Match existing house",
			status: "MATCH_EXISTING"
		})
	};
	return null;
}
function interpretFinancial(project, raw) {
	const text = raw.trim();
	if (!text) return clarify("Say what happened on this project.");
	const currency = project.financials?.currency ?? "USD";
	const lower = text.toLowerCase();
	const job = interpretJob(project, text, lower);
	if (job) return job;
	if (!isFieldUpdate(lower)) {
		const blueprint = interpretBlueprint(project, text, lower);
		if (blueprint) return blueprint;
	}
	if (/\b(how'?s (?:this |the )?job|status|what'?s going on|brief me|where are we)\b/.test(lower) && !/\b(budget|change order|scope|finish|start)\b/.test(lower)) return {
		outcome: "CLARIFICATION",
		message: spokenBrief(project)
	};
	if (/\bclos(?:e|ing)\s*out\b/.test(lower)) {
		const closeout = Object.values(project.activities).filter((item) => {
			if (item.state === "COMPLETE") return false;
			const hay = `${item.phase} ${item.name}`;
			return /closeout|exterior|porch|concrete|sidewalk|punch|column|ceiling/i.test(hay);
		});
		if (closeout.length === 0) return clarify("Which activity is closing out? Name it. I will not guess.");
		return {
			outcome: "RESOLVED",
			preview: previewCloseout(closeout.map((item) => item.id), text)
		};
	}
	if (/\b(hold|pause)\b/.test(lower) && /\binterior\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetJobMeta({
			paused: false,
			heldPhases: Array.from(/* @__PURE__ */ new Set([...project.heldPhases ?? [], "Interior"])),
			dashboardNote: `${project.dashboardNote ?? project.projectType} Interior held. Live work continues.`.slice(0, 280)
		})
	};
	if (/\b(release|unpause|resume)\b/.test(lower) && /\binterior\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewSetJobMeta({
			paused: false,
			heldPhases: (project.heldPhases ?? []).filter((phase) => !/interior/i.test(phase)),
			dashboardNote: "Interior released. Confirm the comparison is done before issuing interior work."
		})
	};
	const calendarDate = extractDate(text);
	if (/\bofficial start\b/.test(lower)) {
		if (!calendarDate) return clarify("Name the official start date. I will not guess it from the first trade.");
		return {
			outcome: "RESOLVED",
			preview: previewSetJobMeta({ officialStart: calendarDate })
		};
	}
	if (/\bintended finish\b/.test(lower)) {
		if (!calendarDate) return clarify("Name the intended finish date. A trade target is not the job finish.");
		return {
			outcome: "RESOLVED",
			preview: previewSetJobMeta({ intendedFinish: calendarDate })
		};
	}
	const amount = extractMoney(text, currency);
	const date = extractDate(text);
	const last = project.events[0];
	const activities = Object.values(project.activities);
	const scopeItems = Object.values(project.scopeItems);
	const lines = Object.values(project.financials?.lines ?? {}).filter((line) => line.active);
	const orders = Object.values(project.financials?.changeOrders ?? {});
	const activityPick = pickNamed(activities, text, (item) => item.name);
	const scopePick = pickNamed(scopeItems, text, (item) => item.description);
	const linePick = pickNamed(lines, text, (item) => `${item.description} ${item.trade ?? ""}`);
	const coPick = pickNamed(orders, text, (item) => `${item.number} ${item.title}`);
	if (last?.recordId) {
		const lastCo = project.financials?.changeOrders[last.recordId];
		const lastActivity = project.activities[last.recordId];
		const lastScope = project.scopeItems[last.recordId];
		const pronoun = /\b(it|that|this|the draft|the change order)\b/.test(lower);
		if (lastCo && (pronoun || coPick.hit?.id === lastCo.id)) {
			if (/\b(approve|approved)\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "APPROVE")
			};
			if (/\bpropose\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "PROPOSE")
			};
			if (/\bsubmit\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "SUBMIT_FOR_APPROVAL")
			};
			if (/\breject\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "REJECT")
			};
			if (/\bvoid\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewCoLifecycle(lastCo.id, "VOID")
			};
			if (amount && /\b(price|priced|cost|set)\b/.test(lower) && !/\b(add|create|draft|new)\b/.test(lower)) return {
				outcome: "RESOLVED",
				preview: previewPatchChangeOrder(lastCo.id, { cost: amount })
			};
		}
		if (lastActivity && pronoun && /\b(start|started|begin)\b/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewPatchActivity(lastActivity.id, {
				state: "IN_PROGRESS",
				actualStart: date ?? lastActivity.actualStart ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
			})
		};
		if (lastScope && pronoun && /\b(complete|completed|done)\b/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewPatchScope(lastScope.id, { complete: true })
		};
	}
	if (/\b(init|initialize|open)\b/.test(lower) && /\b(budget|financial)/.test(lower)) {
		if (project.financials) return clarify("Budget is already initialized. Set the original amount, or edit a line.");
		return {
			outcome: "RESOLVED",
			preview: previewInitialize("USD")
		};
	}
	if (/\b(original|baseline)\b/.test(lower) && /\bbudget\b/.test(lower)) {
		if (!amount) return clarify("What original budget amount should I record?");
		if (!project.financials) return clarify("Initialize Budget on this project first.");
		return {
			outcome: "RESOLVED",
			preview: previewSetBaseline(amount)
		};
	}
	if (/\b(approve|approved|propose|submit|reject|void)\b/.test(lower) && /\b(co|change order)\b/.test(lower)) {
		const target = coPick.hit ?? (orders.length === 1 ? orders[0] : null);
		if (!target) return whichOf("Change Order", coPick.names.length ? coPick.names : orders.map((co) => `${co.number} ${co.title}`));
		if (/\bapprove/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "APPROVE")
		};
		if (/\bpropose/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "PROPOSE")
		};
		if (/\bsubmit/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "SUBMIT_FOR_APPROVAL")
		};
		if (/\bvoid/.test(lower)) return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "VOID")
		};
		return {
			outcome: "RESOLVED",
			preview: previewCoLifecycle(target.id, "REJECT")
		};
	}
	if (/\b(price|priced|cost)\b/.test(lower) && /\b(co|change order|draft)\b/.test(lower) && amount) {
		const target = coPick.hit;
		if (!target) return whichOf("Change Order to price", coPick.names);
		return {
			outcome: "RESOLVED",
			preview: previewPatchChangeOrder(target.id, { cost: amount })
		};
	}
	if (/\b(add|create|draft|new|originate)\b/.test(lower) && /\b(change order|\bco\b)/.test(lower)) {
		const daysMatch = /(\+?\d+)\s*days?/.exec(lower);
		const titleMatch = /(?:for|titled|called)\s+([^.$]+)/i.exec(text);
		const title = scopePick.hit ? `Scope change: ${scopePick.hit.description}` : titleMatch?.[1]?.trim() ?? null;
		if (!title) return clarify("Which Scope item is this Change Order for? Unknown price is allowed. I will not invent a cost.");
		return {
			outcome: "RESOLVED",
			preview: previewCreateChangeOrder({
				title,
				description: text,
				reason: "PM-reported change",
				cost: amount ?? {
					amountMinor: 0,
					currency
				},
				declaredScheduleDays: daysMatch ? Number(daysMatch[1]) : null,
				scopeItemIds: scopePick.hit ? [scopePick.hit.id] : [],
				activityIds: scopePick.hit?.activityId ? [scopePick.hit.activityId] : []
			})
		};
	}
	if (/\b(po|purchase order|commitment|contract awarded)\b/.test(lower) || /\bcommit(ment|ted)\b/.test(lower) && amount) {
		if (!amount) return clarify("What commitment amount, and which Budget line?");
		const line = linePick.hit;
		if (!line) return whichOf("Budget line for the commitment", linePick.names);
		return {
			outcome: "RESOLVED",
			preview: previewAddCommitment({
				amount,
				vendorRef: /(?:from|with|to)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/.exec(text)?.[1] ?? "Unknown vendor",
				budgetLineId: line.id,
				notes: text
			})
		};
	}
	if (/\b(actual|invoice|invoiced|spent|paid)\b/.test(lower)) {
		if (!amount) return clarify("What actual amount, and which Budget line?");
		const line = linePick.hit;
		if (!line) return whichOf("Budget line for this actual", linePick.names);
		return {
			outcome: "RESOLVED",
			preview: previewAddActual({
				amount,
				date: date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
				description: text.slice(0, 80),
				budgetLineId: line.id
			})
		};
	}
	if (/\b(add|new)\b/.test(lower) && /\b(budget line|line item)\b/.test(lower)) {
		if (!project.financials) return clarify("Initialize Budget first.");
		const category = Object.values(project.financials.categories).find((item) => lower.includes(item.name.toLowerCase()));
		if (!category) return clarify("Which category should the new line live in?");
		return {
			outcome: "RESOLVED",
			preview: previewAddLine({
				categoryId: category.id,
				description: text.slice(0, 80),
				baselineAmount: amount,
				isAllowance: /\ballowance\b/.test(lower),
				scopeItemIds: scopePick.hit ? [scopePick.hit.id] : []
			})
		};
	}
	if (/\b(start|started|begin|began|in progress)\b/.test(lower) && activityPick.hit) return {
		outcome: "RESOLVED",
		preview: previewPatchActivity(activityPick.hit.id, {
			state: "IN_PROGRESS",
			actualStart: date ?? activityPick.hit.actualStart ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
		})
	};
	if (/\b(finish|finished|complete|completed|done|closed)\b/.test(lower) && !amount) {
		const split = splitUpdate(text);
		const work = matchClosedWork(project, split.body);
		if (work.activityIds.length || work.scopeIds.length || split.nextSaid) return {
			outcome: "RESOLVED",
			preview: previewProgressUpdate(split.body, {
				...work,
				nextSaid: split.nextSaid
			})
		};
	}
	if (/\b(add|new)\b/.test(lower) && /\bscope\b/.test(lower)) {
		const description = /scope(?: item)?(?: for| called| titled)?\s+(.+)$/i.exec(text)?.[1]?.trim() ?? text.replace(/^.*scope(?: item)?\s+/i, "").trim();
		if (!description || description.length < 3) return clarify("What Scope item should I add? Give a short description.");
		return {
			outcome: "RESOLVED",
			preview: previewAddScope({
				description,
				phase: /phase\s+([A-Za-z]+)/i.exec(text)?.[1] ?? "General"
			}, project)
		};
	}
	if (scopePick.hit && /\b(complete|completed|done)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewPatchScope(scopePick.hit.id, { complete: true })
	};
	if (scopePick.hit && /\b(exclude|excluded|not included)\b/.test(lower)) return {
		outcome: "RESOLVED",
		preview: previewPatchScope(scopePick.hit.id, { included: false })
	};
	if (activityPick.hit && (/\b(note|follow up|follow-up|lined up|lining up)\b/.test(lower) || /\b(john marr|jason bonham)\b/.test(lower))) return {
		outcome: "RESOLVED",
		preview: previewPatchActivity(activityPick.hit.id, { notes: text })
	};
	[
		activityPick.names[0] ? `activity “${activityPick.names[0]}”` : null,
		scopePick.names[0] ? `scope “${scopePick.names[0]}”` : null,
		coPick.names[0] ? `change order ${coPick.names[0]}` : null,
		linePick.names[0] ? `budget line “${linePick.names[0]}”` : null
	].filter(Boolean);
	if (/\b(change order|\bco\b)\b/.test(lower) && !amount) return clarify("If this is a change order, name it and the amount. If this is just a progress update, say what is happening on site — budget stays put.");
	const leftover = splitUpdate(text);
	return {
		outcome: "RESOLVED",
		preview: previewProgressUpdate(leftover.body, { nextSaid: leftover.nextSaid })
	};
}
function interpretUpload(project, file) {
	return {
		outcome: "RESOLVED",
		preview: previewRecordEvidence({
			name: file.name,
			kind: recognizeEvidence(file.name)
		})
	};
}
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/router-BiflSdL7.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: errorMessage(error)
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var HOWLER_MIC_CHANNEL = "howler-mic";
var peer = null;
function setMicPeer(win) {
	peer = win;
}
function tellMic(kind) {
	try {
		peer?.postMessage({
			source: "howler-board",
			kind
		}, window.location.origin);
	} catch {}
}
function subscribeMic(handler) {
	let bus = null;
	try {
		bus = new BroadcastChannel(HOWLER_MIC_CHANNEL);
		bus.onmessage = (event) => {
			const data = event.data;
			if (data && data.kind) handler(data);
		};
	} catch {}
	const onWindow = (event) => {
		if (event.origin !== window.location.origin) return;
		const data = event.data;
		if (!data || data.source !== "howler-mic" || !data.kind) return;
		if (event.source instanceof Window) setMicPeer(event.source);
		handler(data);
	};
	window.addEventListener("message", onWindow);
	return () => {
		bus?.close();
		window.removeEventListener("message", onWindow);
	};
}
/**
* Howler is the product. Users buy Howler. They never buy Grok, ChatGPT, or Whisper.
*
* Cloud models are rented engines behind Howler’s own APIs — same as Twilio for SMS.
* Howler holds the vendor key (or a firm BYOK later). If the vendor is down or unpaid,
* Howler still runs: jobs, interpret, confirm, dashboard, browser mic, local spoken copy.
*
* Swap a vendor by changing these routes. Do not put a vendor name in the UI.
*/
var HOWLER_CLOUD = {
	hear: "/api/transcribe",
	speak: "/api/howler-speak",
	intent: "/api/howler-intent"
};
/** Hey Howler / Howler / Howler we’re updating — only at the start, like Siri. */
var WAKE_PREFIX = /(?:(?:hey|hi|okay|ok|yo)[,.\s]+)?\bhowler\b(?:[,.\s]+(?:we(?:'re| are) (?:gonna |going to )?updat(?:e|ing)|we have an update|i(?:'ve| have)(?: got)? an update|take this(?: update)?|field update|\bupdate\b))?[.!,]*/i;
function matchWake(text) {
	const t = text.trim();
	if (!t) return {
		woke: false,
		rest: ""
	};
	const start = new RegExp(`^${WAKE_PREFIX.source}`, "i").exec(t);
	if (!start) return {
		woke: false,
		rest: t
	};
	return {
		woke: true,
		rest: t.slice(start[0].length).trim()
	};
}
var HOWLER_ACKS = [
	"Ready.",
	"On it.",
	"Yes, boss."
];
function pickHowlerAck() {
	return HOWLER_ACKS[Math.floor(Math.random() * HOWLER_ACKS.length)] ?? HOWLER_ACKS[0];
}
function isHardSleep(text) {
	return /^(go to sleep|goodbye|good ?night|disarm)[.!?]?$/i.test(text.trim());
}
function isUtteranceEnd(text) {
	return /^(end(?:\s+(?:the\s+)?(?:update|it))?|end of (?:the )?update|that'?s the update|that'?s it|that'?s all|over|stop|stop listening)[.!?]?$/i.test(text.trim());
}
function isSleepCommand(text) {
	if (isHardSleep(text) || isUtteranceEnd(text)) return true;
	return /^(i'?m done|we'?re done|done|close|finished)[.!?]?$/i.test(text.trim());
}
function isSelfTalk(text) {
	const said = text.trim();
	if (/^(ready|on it|yes,? boss|go ahead|applied|cancelled|which job|i'?m here|alright)[.!?]?$/i.test(said)) return true;
	return /howler is armed|howler is listening|say hey howler|listening for(?: the command)?|say confirm or cancel|ready to apply|say confirm|confirm and i'?ll|going to sleep|name the job|which job|i'?m listening|speak now|speak the job|go ahead|what can i do for you|keep this (tab|window) open|allow the microphone|click allow|recorded\b|applied\b|card only|budget unchanged|what finish date|pinned on|i'?m here/i.test(said);
}
var JOB_NAME_RE = /\b(mcmillan|deboard|de board|ciurlizza|carver|pratt|stewart|swiderski|julian)\b/gi;
function isJobNameDump(text) {
	const hits = text.toLowerCase().match(JOB_NAME_RE);
	if (!hits || hits.length < 2) return false;
	return !/\b(is|are|was|finish|start|hold|held|pour|inspect|confirm|approve|open|status|how's|schedule|close)\b/i.test(text) || hits.length >= 3;
}
/**
* Siri model: ARMED listens only for Hey Howler / Howler.
* After wake, LISTENING/AWAKE takes the next sentence as the command.
*/
function decideHeardAction(text, ctx) {
	const said = text.trim();
	if (!said) return {
		kind: "ignore",
		reason: "empty"
	};
	if (isSelfTalk(said) || isJobNameDump(said)) return {
		kind: "ignore",
		reason: "echo"
	};
	if (ctx.hasPreview) {
		if (isVoiceConfirm(said)) return { kind: "confirm" };
		if (isVoiceCancel(said)) return { kind: "cancel" };
		if (isUtteranceEnd(said) || isSleepCommand(said)) return {
			kind: "ignore",
			reason: "awaiting-confirm"
		};
		return {
			kind: "ignore",
			reason: "awaiting-confirm"
		};
	}
	if (isUtteranceEnd(said) || isSleepCommand(said)) return { kind: "sleep" };
	const { woke, rest } = matchWake(said);
	const listening = ctx.state === "AWAKE" || ctx.state === "LISTENING";
	if (ctx.state === "ARMED") {
		if (woke && rest) return {
			kind: "command",
			text: rest
		};
		if (woke) return { kind: "wake-only" };
		return {
			kind: "ignore",
			reason: "waiting-for-wake"
		};
	}
	if (!listening) {
		if (woke && rest) return {
			kind: "command",
			text: rest
		};
		if (woke) return { kind: "wake-only" };
		return {
			kind: "ignore",
			reason: "not-listening"
		};
	}
	if (woke && !rest) {
		if (ctx.state === "AWAKE" || ctx.state === "LISTENING") return {
			kind: "ignore",
			reason: "already-awake"
		};
		return { kind: "wake-only" };
	}
	return {
		kind: "command",
		text: rest || said
	};
}
var muted = false;
function isEarMuted() {
	return muted;
}
function muteEar(next) {
	muted = next;
}
function unlockSpeech() {
	if (typeof window === "undefined" || !window.speechSynthesis) return;
	try {
		window.speechSynthesis.getVoices();
		window.speechSynthesis.resume();
	} catch {}
}
function voiceScore(voice) {
	const n = `${voice.name} ${voice.lang}`.toLowerCase();
	let score = 0;
	if (/google uk english female/.test(n)) score += 100;
	if (/en-gb|en_gb|uk english|united kingdom/.test(n)) score += 50;
	if (/\b(libby|sonia|hazel|serena|martha|kate)\b/.test(n)) score += 40;
	if (/female|woman/.test(n)) score += 25;
	if (/natural|neural|premium|online/.test(n)) score += 15;
	if (/^en-gb/i.test(voice.lang)) score += 20;
	if (/male|david|daniel|george|ravi|mark|arthur|thomas|ryan|fred|alex\b/.test(n)) score -= 80;
	if (/female|samantha|karen|moira|fiona|zira|susan/.test(n)) score += 6;
	return score;
}
function pickHowlerVoice(list) {
	if (!list.length) return null;
	return [...list].sort((a, b) => voiceScore(b) - voiceScore(a))[0] ?? null;
}
async function speakHowler(text, opts = {}) {
	if (typeof window === "undefined") return;
	const clean = text.replace(/\s+/g, " ").trim().slice(0, 600);
	if (!clean) return;
	if (opts.mute !== false) {
		muted = true;
		tellMic("mute");
	}
	const done = () => {
		muted = false;
		tellMic("unmute");
	};
	if (opts.cloud) try {
		const res = await fetch(HOWLER_CLOUD.speak, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: clean })
		});
		if (res.ok) {
			const buf = await res.arrayBuffer();
			if (buf.byteLength > 800) {
				const url = URL.createObjectURL(new Blob([buf], { type: res.headers.get("content-type") || "audio/mpeg" }));
				await new Promise((resolve) => {
					const audio = new Audio(url);
					const finish = () => {
						URL.revokeObjectURL(url);
						done();
						resolve();
					};
					audio.onended = finish;
					audio.onerror = finish;
					audio.play().catch(finish);
				});
				return;
			}
		}
	} catch {}
	if (!window.speechSynthesis) {
		done();
		return;
	}
	unlockSpeech();
	window.speechSynthesis.cancel();
	const chosen = pickHowlerVoice(window.speechSynthesis.getVoices());
	await new Promise((resolve) => {
		const utter = new SpeechSynthesisUtterance(clean);
		utter.lang = chosen?.lang || "en-GB";
		utter.rate = 1.08;
		utter.pitch = 1.05;
		utter.volume = 1;
		if (chosen) utter.voice = chosen;
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			done();
			resolve();
		};
		utter.onend = finish;
		utter.onerror = finish;
		window.setTimeout(finish, Math.min(8e3, 700 + clean.length * 55));
		window.speechSynthesis.speak(utter);
	});
}
function howlerChime() {
	if (typeof window === "undefined" || !window.AudioContext) return;
	muteEar(true);
	try {
		const ctx = new AudioContext();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(784, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + .12);
		gain.gain.setValueAtTime(1e-4, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(.07, ctx.currentTime + .02);
		gain.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + .18);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + .2);
		window.setTimeout(() => {
			muteEar(false);
			ctx.close();
		}, 240);
	} catch {
		muteEar(false);
	}
}
function isVoiceConfirm(text) {
	return /^(yes|yeah|yep|confirm|do it|apply(?: it)?|send it|record it|that'?s right|thats right)[.!?]?$/i.test(text.trim());
}
function isVoiceCancel(text) {
	return /^(no|nope|cancel|never ?mind|scratch that|don'?t|do not)[.!?]?$/i.test(text.trim());
}
var ALIASES = [
	{
		alias: "deboard",
		projectId: "deboard-v091"
	},
	{
		alias: "de board",
		projectId: "deboard-v091"
	},
	{
		alias: "debord",
		projectId: "deboard-v091"
	},
	{
		alias: "garage",
		projectId: "deboard-v091"
	},
	{
		alias: "mcmillan",
		projectId: "mcmillan-v1"
	},
	{
		alias: "macmillan",
		projectId: "mcmillan-v1"
	},
	{
		alias: "caveson",
		projectId: "mcmillan-v1"
	},
	{
		alias: "ciurlizza",
		projectId: "ciurlizza-v1"
	},
	{
		alias: "cher liza",
		projectId: "ciurlizza-v1"
	},
	{
		alias: "andover",
		projectId: "ciurlizza-v1"
	},
	{
		alias: "carver",
		projectId: "carver"
	},
	{
		alias: "julian",
		projectId: "carver"
	},
	{
		alias: "wil rose",
		projectId: "carver"
	},
	{
		alias: "pratt",
		projectId: "pratt-v1"
	},
	{
		alias: "stewart",
		projectId: "stewart-v1"
	},
	{
		alias: "swiderski",
		projectId: "swiderski-v1"
	},
	{
		alias: "swidersky",
		projectId: "swiderski-v1"
	}
];
function resolveProjectMention(text, projects) {
	const lower = text.toLowerCase();
	const hits = /* @__PURE__ */ new Set();
	for (const project of Object.values(projects)) {
		if (lower.includes(project.name.toLowerCase()) || lower.includes(project.clientName.toLowerCase())) hits.add(project.id);
		if (project.address !== "Unknown" && lower.includes(project.address.toLowerCase().split(",")[0].toLowerCase())) hits.add(project.id);
	}
	for (const alias of ALIASES) if (lower.includes(alias.alias) && projects[alias.projectId]) hits.add(alias.projectId);
	const ids = [...hits];
	const names = ids.map((id) => projects[id]?.name ?? id);
	if (ids.length === 1) return {
		projectId: ids[0],
		names
	};
	return {
		projectId: null,
		names
	};
}
function isStatusQuery(text) {
	return /^(how'?s|how is|status|what'?s going on|what'?s the status|give me a status|brief me)\b/i.test(text.trim()) || /\b(status|how'?s it going|where (?:are|is) (?:we|it))\b/i.test(text);
}
function isOpenCommand(text) {
	return /^(open|go to|show|take me to|pull up)\b/i.test(text.trim());
}
function interpretUtterance(projects, raw, activeProjectId) {
	const { woke, rest } = matchWake(raw);
	const text = (rest || (!woke ? raw : "")).trim();
	if (!text) return {
		projectId: activeProjectId,
		woke,
		result: {
			outcome: "CLARIFICATION",
			message: pickHowlerAck()
		}
	};
	const mention = resolveProjectMention(text, projects);
	const projectId = mention.projectId ?? activeProjectId;
	const project = projectId ? projects[projectId] : null;
	if (isOpenCommand(text)) {
		if (!project) return {
			projectId: null,
			woke,
			result: {
				outcome: "CLARIFICATION",
				message: mention.names.length ? `Which job: ${mention.names.join("; ")}?` : "Which job should I open?"
			}
		};
		return {
			projectId: project.id,
			woke,
			result: {
				outcome: "ACTION",
				action: "OPEN",
				projectId: project.id,
				message: `Opening ${project.name}.`
			}
		};
	}
	if (!project) return {
		projectId: null,
		woke,
		result: {
			outcome: "CLARIFICATION",
			message: mention.names.length ? `Which job: ${mention.names.join("; ")}?` : "Name the job — McMillan, DeBoard, Ciurlizza, Carver, Pratt, Stewart, or Swiderski — then what happened."
		}
	};
	if (isStatusQuery(text) || /^(how'?s|status)\b/i.test(text)) return {
		projectId: project.id,
		woke,
		result: {
			outcome: "CLARIFICATION",
			message: spokenBrief(project)
		}
	};
	return {
		projectId: project.id,
		woke,
		result: interpretFinancial(project, text)
	};
}
function isPhoneHowler() {
	if (typeof navigator === "undefined") return false;
	return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry/i.test(navigator.userAgent);
}
function talkReadback(job, picture) {
	const next = /Next call:\s*(.+)$/i.exec(picture)?.[1]?.trim();
	const status = picture.replace(/Next call:\s*.+$/i, "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
	const head = status ? `${job}. ${status}.` : `${job}.`;
	if (next) return `${head} Next, ${next.replace(/^Next call:\s*/i, "")}. Confirm?`;
	return `${head} Confirm?`;
}
function talkClarify(message) {
	if (/which job|name the job/i.test(message)) return "Which job is this — McMillan, DeBoard, Ciurlizza?";
	const first = message.split(". ").filter(Boolean)[0];
	return first ? `${first.replace(/\.$/, "")}?` : "Say that again for me?";
}
function talkWake() {
	return "I'm here.";
}
async function transcribeBlob(blob) {
	const form = new FormData();
	const ext = blob.type.includes("ogg") ? "ogg" : "webm";
	form.append("file", new File([blob], `speech.${ext}`, { type: blob.type || "audio/webm" }));
	const json = await (await fetch("/api/transcribe", {
		method: "POST",
		body: form
	})).json().catch(() => null);
	if (!json) return {
		ok: false,
		error: "Could not transcribe. Type the command."
	};
	if (json.ok && json.text) return {
		ok: true,
		text: json.text
	};
	return {
		ok: false,
		error: json.error || "Could not transcribe. Type the command."
	};
}
function howlerTrace(kind, detail) {
	if (typeof window === "undefined") return;
	const text = typeof detail === "string" ? detail : detail == null ? void 0 : JSON.stringify(detail).slice(0, 500);
	fetch("/api/howler-trace", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			kind,
			detail: text
		}),
		keepalive: true
	}).catch(() => void 0);
}
function howlerTraceEnv() {
	if (typeof window === "undefined") return "ssr";
	let frame = "top";
	try {
		frame = window.self === window.top ? "top" : "iframe";
	} catch {
		frame = "iframe";
	}
	return `${frame} ${window.location.origin}`;
}
function howlerIsFramed() {
	if (typeof window === "undefined") return false;
	try {
		return window.self !== window.top;
	} catch {
		return true;
	}
}
function openHowlerTab() {
	if (typeof window === "undefined") return null;
	return window.open(window.location.href, "_blank");
}
function micPlatform() {
	if (typeof navigator === "undefined") return "other";
	const ua = navigator.userAgent;
	if (/iPhone|iPod/.test(ua) || /iPad/.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios";
	if (/Windows/i.test(ua)) return "windows";
	if (/Mac OS X/i.test(ua)) return "mac";
	return "other";
}
function micNeedsTap() {
	return micPlatform() === "ios";
}
function micAskingCopy() {
	const platform = micPlatform();
	if (platform === "windows") return "Asking Chrome/Edge for the microphone. Click Allow on the prompt or the padlock by the URL. If nothing appears: Windows Settings → Privacy & security → Microphone → on, then allow this browser.";
	if (platform === "ios") return "Tap Allow on the iPhone/iPad prompt. If it never appears: Settings → Safari (or Chrome) → Microphone → Allow, then come back and tap Allow microphone.";
	if (platform === "mac") return "Click Allow on the prompt. If none: System Settings → Privacy & Security → Microphone → this browser on.";
	return "Click Allow on the browser prompt. If none, turn on microphone access for this browser in the computer’s privacy settings.";
}
function micBlockedCopy() {
	const platform = micPlatform();
	if (platform === "windows") return "Microphone is blocked. Windows Settings → Privacy & security → Microphone → turn access on, then allow Chrome or Edge. Then padlock by this URL → Site settings → Microphone → Allow. Click Try microphone again.";
	if (platform === "ios") return "iPhone/iPad blocked the mic. Settings → Safari or Chrome → Microphone → Allow. Open Howler again and tap Allow microphone. Then tap the orb and speak — a website cannot listen like Siri when the phone is locked.";
	if (platform === "mac") return "Microphone is blocked. System Settings → Privacy & Security → Microphone → this browser on. Then the padlock by the URL → Microphone → Allow.";
	return "Microphone is blocked for this site. Allow it in the browser site settings and in the computer’s privacy settings.";
}
function micIdleCopy() {
	if (micNeedsTap()) return "On iPhone and iPad: tap Allow microphone once, then tap the orb and talk. Confirm. She goes silent. A website cannot be Hey Siri in the background.";
	if (micPlatform() === "windows") return "Windows + Chrome or Edge: Allow microphone once (Windows privacy + this site). Then Hey Howler, the update, Confirm. She goes silent.";
	return "Allow microphone once. Then Hey Howler, the update, Confirm. She goes silent.";
}
function micReadyCopy() {
	return micNeedsTap() ? "Tap the orb, then speak. Confirm. She goes silent." : "Say Hey Howler anytime. Confirm. She goes silent.";
}
var TICK = 80;
var END_MS = 400;
var MAX_MS = 12e3;
function looksComplete(text) {
	return /\b(done|complete|completed|finished|closed|awaiting|waiting|update|confirm|cancel)\b/i.test(text) && text.split(/\s+/).length >= 4;
}
function rms(data) {
	let sum = 0;
	for (let i = 0; i < data.length; i += 1) {
		const v = (data[i] - 128) / 128;
		sum += v * v;
	}
	return Math.sqrt(sum / data.length);
}
function SpeechCtor() {
	if (typeof window === "undefined") return null;
	const w = window;
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
function joinUtterance(parts) {
	return parts.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function startFieldEar(handlers) {
	let stopped = false;
	let stream = null;
	let audioCtx = null;
	let analyser = null;
	let timer = null;
	let watchdog = null;
	let mode = "wake";
	let commandUntil = 0;
	let parts = [];
	let interim = "";
	let quiet = null;
	let recog = null;
	let wantRecog = true;
	let live = false;
	let restarting = false;
	let recorder = null;
	let chunks = [];
	let recording = false;
	let speechMs = 0;
	let silenceMs = 0;
	let coolUntil = 0;
	const cool = (ms = 900) => {
		coolUntil = Date.now() + ms;
	};
	const inCommand = () => mode === "command" && Date.now() < commandUntil;
	const openCommand = () => {
		mode = "command";
		commandUntil = Date.now() + 2e4;
		handlers.onWake();
	};
	const openConfirm = () => {
		mode = "confirm";
		commandUntil = Date.now() + 25e3;
		stopRecorder(false);
	};
	const endCommand = () => {
		mode = "wake";
		commandUntil = 0;
		parts = [];
		interim = "";
		stopRecorder(false);
		cool(600);
	};
	const handleText = (raw) => {
		const said = raw.trim();
		if (!said || isEarMuted() || isSelfTalk(said) || Date.now() < coolUntil) return;
		if (mode === "confirm") {
			if (isVoiceConfirm(said) || isVoiceCancel(said) || isUtteranceEnd(said)) {
				endCommand();
				handlers.onUtterance(said);
			}
			return;
		}
		const { woke, rest } = matchWake(said);
		if (mode === "wake" && !inCommand()) {
			if (!woke) return;
			if (rest) {
				openConfirm();
				handlers.onUtterance(rest);
				return;
			}
			openCommand();
			return;
		}
		if (isUtteranceEnd(said)) {
			const buffered = joinUtterance(parts);
			parts = [];
			if (buffered) {
				openConfirm();
				handlers.onUtterance(buffered);
				return;
			}
			endCommand();
			handlers.onUtterance(said);
			return;
		}
		const payload = woke ? rest : said;
		if (!payload) {
			endCommand();
			return;
		}
		openConfirm();
		handlers.onUtterance(payload);
	};
	const bump = () => {
		if (quiet) window.clearTimeout(quiet);
		quiet = window.setTimeout(() => {
			const said = joinUtterance(parts);
			parts = [];
			interim = "";
			if (said) handleText(said);
		}, END_MS);
	};
	const stopRecorder = (useClip) => {
		if (!recording || !recorder) return;
		recording = false;
		const rec = recorder;
		recorder = null;
		rec.onstop = () => {
			const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
			chunks = [];
			if (!useClip || blob.size < 800 || isEarMuted() || recog) return;
			handlers.onPartial("Transcribing…");
			transcribeBlob(blob).then((result) => {
				if (result.ok) handleText(result.text);
				else handlers.onPartial(result.error);
			});
		};
		try {
			rec.stop();
		} catch {
			recording = false;
		}
	};
	const beginRecorder = () => {
		if (!stream || recording || isEarMuted()) return;
		chunks = [];
		speechMs = 0;
		silenceMs = 0;
		try {
			recorder = new MediaRecorder(stream);
		} catch {
			return;
		}
		recorder.ondataavailable = (event) => {
			if (event.data.size) chunks.push(event.data);
		};
		recorder.start(250);
		recording = true;
	};
	const tick = () => {
		if (stopped || !analyser) return;
		const data = new Uint8Array(analyser.fftSize);
		analyser.getByteTimeDomainData(data);
		const level = rms(data);
		if (isEarMuted()) {
			if (recording) stopRecorder(false);
			return;
		}
		if (!inCommand()) {
			if (recording) stopRecorder(false);
			return;
		}
		if (!recording) {
			if (level >= .012) beginRecorder();
			return;
		}
		speechMs += TICK;
		if (level >= .01) silenceMs = 0;
		else silenceMs += TICK;
		if (silenceMs >= END_MS && speechMs >= 350 || speechMs >= MAX_MS) stopRecorder(true);
	};
	const attachRecog = () => {
		const Ctor = SpeechCtor();
		if (!Ctor) return;
		const next = new Ctor();
		next.continuous = true;
		next.interimResults = true;
		next.lang = "en-US";
		next.onstart = () => {
			live = true;
		};
		next.onresult = (event) => {
			if (isEarMuted()) return;
			const start = event.resultIndex ?? 0;
			for (let i = start; i < event.results.length; i += 1) {
				const row = event.results[i];
				const said = row?.[0]?.transcript ?? "";
				if (!said) continue;
				if (mode === "wake" || mode === "confirm") {
					if (row.isFinal === false) continue;
					handleText(said);
					continue;
				}
				if (row.isFinal === false) {
					interim = said;
					handlers.onPartial(joinUtterance([...parts, interim]));
					continue;
				}
				parts.push(said);
				interim = "";
				const joined = joinUtterance(parts);
				handlers.onPartial(joined);
				if (looksComplete(joined)) {
					if (quiet) window.clearTimeout(quiet);
					parts = [];
					handleText(joined);
				} else bump();
			}
		};
		next.onerror = (event) => {
			live = false;
			if (event.error === "not-allowed" || event.error === "service-not-allowed") {
				howlerTrace("sr-denied", { error: event.error });
				wantRecog = false;
				handlers.onState("denied", "Click Allow on the browser prompt. Turn on Always allow.");
			} else howlerTrace("sr-error", { error: event.error });
		};
		next.onend = () => {
			live = false;
			if (restarting || !wantRecog || stopped) return;
			window.setTimeout(() => {
				if (!live && wantRecog && !stopped) attachRecog();
			}, 80);
		};
		recog = next;
		try {
			next.start();
		} catch {}
	};
	wantRecog = true;
	attachRecog();
	watchdog = window.setInterval(() => {
		if (!stopped && wantRecog && !live && !restarting) attachRecog();
	}, 1500);
	if (navigator.mediaDevices?.getUserMedia) {
		let settled = false;
		const fail = (detail) => {
			if (settled || stopped) return;
			settled = true;
			handlers.onState("denied", detail);
		};
		const timerId = window.setTimeout(() => {
			fail(micAskingCopy());
		}, 8e3);
		navigator.mediaDevices.getUserMedia({ audio: true }).then((held) => {
			window.clearTimeout(timerId);
			if (stopped) {
				held.getTracks().forEach((track) => track.stop());
				return;
			}
			settled = true;
			stream = held;
			howlerTrace("gum-ok", { tracks: held.getAudioTracks().map((track) => track.label) });
			audioCtx = new AudioContext();
			audioCtx.resume();
			const source = audioCtx.createMediaStreamSource(held);
			analyser = audioCtx.createAnalyser();
			analyser.fftSize = 2048;
			source.connect(analyser);
			timer = window.setInterval(tick, TICK);
			handlers.onState("armed");
			if (!recog) attachRecog();
		}).catch((err) => {
			window.clearTimeout(timerId);
			const name = err instanceof Error ? err.name : "";
			const message = err instanceof Error ? err.message : String(err);
			howlerTrace("gum-fail", {
				name,
				error: message
			});
			if (name === "NotFoundError") {
				fail("This computer has no microphone Howler can use.");
				return;
			}
			if (name === "NotAllowedError" || /denied|permission/i.test(message)) {
				fail(micBlockedCopy());
				return;
			}
			fail(`Microphone failed (${name || "error"}). Click Allow microphone again.`);
		});
	} else handlers.onState("denied", "This browser has no microphone API. Use Chrome.");
	return {
		stop: () => {
			stopped = true;
			wantRecog = false;
			if (quiet) window.clearTimeout(quiet);
			if (timer) window.clearInterval(timer);
			if (watchdog) window.clearInterval(watchdog);
			try {
				recog?.abort();
			} catch {}
			stopRecorder(false);
			stream?.getTracks().forEach((track) => track.stop());
			audioCtx?.close();
		},
		restart: () => {
			if (stopped) return;
			endCommand();
			restarting = true;
			live = false;
			try {
				recog?.abort();
			} catch {}
			restarting = false;
			if (wantRecog) attachRecog();
		},
		listen: () => {
			if (stopped) return;
			openCommand();
		}
	};
}
async function rewriteHowlerIntent(input) {
	try {
		const json = await (await fetch(HOWLER_CLOUD.intent, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input)
		})).json();
		if (!json.ok || !json.rewrite) return null;
		return {
			rewrite: json.rewrite,
			projectId: json.projectId ?? null,
			kind: json.kind ?? "progress",
			say: json.say ?? null
		};
	} catch {
		return null;
	}
}
var CODE_TRADE = [
	{
		prefix: "01",
		trade: "General"
	},
	{
		prefix: "02",
		trade: "Sitework"
	},
	{
		prefix: "03",
		trade: "Concrete"
	},
	{
		prefix: "04.21",
		trade: "Masonry"
	},
	{
		prefix: "04.22",
		trade: "Concrete"
	},
	{
		prefix: "04",
		trade: "Masonry"
	},
	{
		prefix: "06",
		trade: "Framing"
	},
	{
		prefix: "07.21",
		trade: "Insulation"
	},
	{
		prefix: "07.3",
		trade: "Roofing"
	},
	{
		prefix: "07.6",
		trade: "Gutters"
	},
	{
		prefix: "07",
		trade: "Roofing"
	},
	{
		prefix: "08.3",
		trade: "Overhead doors"
	},
	{
		prefix: "08",
		trade: "Openings"
	},
	{
		prefix: "09.25",
		trade: "Drywall"
	},
	{
		prefix: "09.5",
		trade: "Flooring"
	},
	{
		prefix: "09.9",
		trade: "Painting"
	},
	{
		prefix: "09",
		trade: "Finishes"
	},
	{
		prefix: "12",
		trade: "Cabinetry"
	},
	{
		prefix: "15.4",
		trade: "Plumbing"
	},
	{
		prefix: "15.5",
		trade: "HVAC"
	},
	{
		prefix: "15",
		trade: "MEP"
	},
	{
		prefix: "16",
		trade: "Electrical"
	}
];
var VENDOR_ALIASES = {
	"john mar": "John Marr",
	"john mars": "John Marr",
	"john mahr": "John Marr",
	"sam": "Sam the Concrete Man",
	"sam the concrete man": "Sam the Concrete Man",
	"estudio llc": "Estudillo Masonry",
	"antle drywll": "Antle Drywall",
	"antle drywal": "Antle Drywall",
	"builiders choice": "Builders First Choice",
	"builders choice": "Builders First Choice",
	"builder choice": "Builders First Choice",
	"builders first": "Builders First Choice",
	"medyna": "Medyna Plumbing",
	"anthony p": "Anthony Parker",
	"anthony parker": "Anthony Parker",
	"bill moore": "Bill Moore",
	"carpet one": "Carpet One",
	"gatsby glass": "Gatsby Glass",
	"whalen": "Whalen Electrical",
	"elliot": "Elliot / DHEC",
	"31w": "31-W",
	"31-w": "31-W",
	"mike g": "Mike Gonzalez"
};
function tradeFromCostCode(code) {
	if (!code) return null;
	return CODE_TRADE.find((row) => code.startsWith(row.prefix))?.trade ?? null;
}
function canonicalVendor(name) {
	if (!name) return null;
	return VENDOR_ALIASES[name.trim().toLowerCase()] ?? name.trim();
}
function activityForBudgetTrade(project, trade) {
	if (!trade) return null;
	const needle = trade.toLowerCase();
	const rows = Object.values(project.activities);
	return rows.find((item) => item.trade && item.trade.toLowerCase() === needle) ?? rows.find((item) => item.name.toLowerCase().includes(needle)) ?? null;
}
function placeLine(project, line) {
	const trade = line.trade ?? tradeFromCostCode(line.costCode);
	const vendor = canonicalVendor(line.vendorRef);
	const activity = line.activityId ? project.activities[line.activityId] ?? null : activityForBudgetTrade(project, trade);
	let conflict = null;
	if (vendor && activity?.notes && /john marr/i.test(activity.notes) && /stanfield/i.test(vendor)) conflict = "Tracker SELECTED David Stanfield for framing labor. Field schedule is John Marr. Howler will not pick a winner.";
	if (vendor && /sam/i.test(vendor) && /22,?500|25500|26,?200/.test(line.notes ?? "")) conflict = "Sam’s number disagrees across sheets. Tracker package $26,200 is the selected comparison.";
	return {
		trade,
		vendor,
		activityId: activity?.id ?? null,
		activityName: activity?.name ?? null,
		conflict
	};
}
/**
* Real client money. Transcribed from:
* - Deboard Trade Budget & Estimate Tracker (Drive, Aug 14, 2026)
* - Project Deposit & Expense Forecast (Drive, Sep 9, 2026)
*
* Howler will not invent a missing client budget. Pratt / Carver / Swiderski /
* Stewart stay Unknown. Package rows are not added to component rows.
*/
function usd(dollars) {
	return money(Math.round(dollars * 100));
}
function catFromCode(code) {
	if (code.startsWith("01")) return "cat-gc";
	if (code.startsWith("02")) return "cat-site";
	if (code.startsWith("03") || code.startsWith("04.22")) return "cat-concrete";
	if (code.startsWith("04")) return "cat-masonry";
	if (code.startsWith("06")) return "cat-framing";
	if (code.startsWith("07")) return "cat-roof";
	if (code.startsWith("08")) return "cat-openings";
	if (code.startsWith("09.25")) return "cat-drywall";
	if (code.startsWith("09.5")) return "cat-floor";
	if (code.startsWith("09.9")) return "cat-paint";
	if (code.startsWith("12")) return "cat-cabinets";
	if (code.startsWith("15.4")) return "cat-plumb";
	if (code.startsWith("15.5")) return "cat-hvac";
	if (code.startsWith("16")) return "cat-elec";
	return "cat-gc";
}
var DEBOARD_CATS = {
	"cat-gc": {
		id: "cat-gc",
		name: "General Conditions",
		isDefault: true,
		active: true,
		sortOrder: 1,
		notes: null
	},
	"cat-site": {
		id: "cat-site",
		name: "Sitework",
		isDefault: true,
		active: true,
		sortOrder: 2,
		notes: null
	},
	"cat-concrete": {
		id: "cat-concrete",
		name: "Concrete",
		isDefault: true,
		active: true,
		sortOrder: 3,
		notes: null
	},
	"cat-masonry": {
		id: "cat-masonry",
		name: "Masonry",
		isDefault: true,
		active: true,
		sortOrder: 4,
		notes: null
	},
	"cat-framing": {
		id: "cat-framing",
		name: "Framing / millwork",
		isDefault: true,
		active: true,
		sortOrder: 5,
		notes: null
	},
	"cat-roof": {
		id: "cat-roof",
		name: "Roof / insulation / gutters",
		isDefault: true,
		active: true,
		sortOrder: 6,
		notes: null
	},
	"cat-openings": {
		id: "cat-openings",
		name: "Doors / windows / OHD",
		isDefault: true,
		active: true,
		sortOrder: 7,
		notes: null
	},
	"cat-drywall": {
		id: "cat-drywall",
		name: "Drywall",
		isDefault: true,
		active: true,
		sortOrder: 8,
		notes: null
	},
	"cat-floor": {
		id: "cat-floor",
		name: "Flooring",
		isDefault: true,
		active: true,
		sortOrder: 9,
		notes: null
	},
	"cat-paint": {
		id: "cat-paint",
		name: "Paint",
		isDefault: true,
		active: true,
		sortOrder: 10,
		notes: null
	},
	"cat-cabinets": {
		id: "cat-cabinets",
		name: "Cabinets / tops",
		isDefault: true,
		active: true,
		sortOrder: 11,
		notes: null
	},
	"cat-plumb": {
		id: "cat-plumb",
		name: "Plumbing",
		isDefault: true,
		active: true,
		sortOrder: 12,
		notes: null
	},
	"cat-hvac": {
		id: "cat-hvac",
		name: "HVAC",
		isDefault: true,
		active: true,
		sortOrder: 13,
		notes: null
	},
	"cat-elec": {
		id: "cat-elec",
		name: "Electrical",
		isDefault: true,
		active: true,
		sortOrder: 14,
		notes: null
	}
};
var DEBOARD_LINES = [
	{
		code: "01.040",
		scope: "Design services",
		budget: 2150,
		vendor: "Posted actual",
		result: "OVER",
		notes: "Actual $2,846.76 posted in workbook. $696.76 over."
	},
	{
		code: "01.060",
		scope: "Permits",
		budget: 500,
		result: "OVER",
		notes: "Reference $750. No current estimate."
	},
	{
		code: "01.300",
		scope: "Outsourced design / photo",
		budget: 50,
		result: "NONE",
		notes: "No estimate."
	},
	{
		code: "01.400",
		scope: "Production wages",
		budget: 8600,
		result: "NONE",
		notes: "No separate estimate."
	},
	{
		code: "01.500",
		scope: "Rental equipment",
		budget: 1334,
		result: "NONE",
		notes: "Dumpster $750; porta john $584. No vendor quote."
	},
	{
		code: "01.700",
		scope: "Completion materials",
		budget: 2120,
		result: "NONE",
		notes: "Closeout list / cleaning / management. No estimate."
	},
	{
		code: "02.050",
		scope: "Demolition / setup materials",
		budget: 200,
		result: "WITHIN",
		notes: "Reference $0."
	},
	{
		code: "02.201",
		scope: "Earthwork labor",
		budget: 4150,
		vendor: "Sam the Concrete Man",
		activity: "act-concrete",
		result: "AT",
		notes: "Component of Sam $26,200 package. Do not add to package."
	},
	{
		code: "02.281",
		scope: "Termite treatment",
		budget: 750,
		result: "NONE",
		notes: "No estimate."
	},
	{
		code: "02.900",
		scope: "Landscape materials",
		budget: 4350,
		result: "NONE",
		notes: "Excavation allowance $3,000 + sod $1,350. Keep off Sam package until exclusions confirmed."
	},
	{
		code: "03.111",
		scope: "Flatwork material and labor",
		budget: 12e3,
		vendor: "Sam the Concrete Man",
		activity: "act-concrete",
		result: "AT",
		notes: "Component of Sam package. Do not add to package."
	},
	{
		code: "04.210",
		scope: "Brick materials",
		budget: 9e3,
		vendor: "Lee Building Products",
		activity: "act-block",
		result: "OVER",
		notes: "Quote #148635 $12,409.21 incl. tax. Expired. Refresh before award."
	},
	{
		code: "04.211",
		scope: "Brick labor",
		budget: 12e3,
		vendor: "Estudillo Masonry",
		activity: "act-block",
		result: "NONE",
		notes: "Tracker: no masonry labor allocation in Sam package. Forecast lists Estudio LLC $12,000."
	},
	{
		code: "04.220",
		scope: "Concrete materials",
		budget: 4500,
		vendor: "Builders First Choice",
		activity: "act-concrete",
		result: "WITHIN",
		notes: "Slab pack $953.89 with tax. Reference-only unless Sam exclusions confirmed."
	},
	{
		code: "04.221",
		scope: "Concrete labor",
		budget: 1800,
		vendor: "Sam the Concrete Man",
		activity: "act-concrete",
		result: "OVER",
		notes: "Component reference $2,200. Package $26,200 controls."
	},
	{
		code: "06.050",
		scope: "Fasteners & adhesives",
		budget: 150,
		vendor: "Builders First Choice",
		activity: "act-framing",
		result: "OVER",
		notes: "$1,119.08 with tax. $969.08 over allowance."
	},
	{
		code: "06.101",
		scope: "Framing labor",
		budget: 13900,
		vendor: "David Stanfield",
		activity: "act-framing",
		result: "OVER",
		notes: "Tracker SELECTED Stanfield $13,500.72. John Marr alternate $14,000. Field schedule is John Marr — conflict stands."
	},
	{
		code: "06.110",
		scope: "Lumber package",
		budget: 12264.72,
		vendor: "Builders First Choice",
		activity: "act-framing",
		result: "WITHIN",
		notes: "$10,139.82 with tax. $2,124.90 within. Quote expired."
	},
	{
		code: "06.210",
		scope: "Finish trim materials",
		budget: 1e3,
		vendor: "Builders First Choice",
		result: "WITHIN",
		notes: "Base and shoe $441.64 with tax. Partial."
	},
	{
		code: "06.221",
		scope: "Finish carpentry labor",
		budget: 1500,
		vendor: "John Marr",
		result: "WITHIN",
		notes: "John Marr interior trim $1,200. Excludes stair, shelving, paint, caulk."
	},
	{
		code: "06.301",
		scope: "Trim labor",
		budget: 3500,
		vendor: "John Marr",
		result: "NONE",
		notes: "John Marr openings/doors $1,375 provisionally mapped. Confirm coding."
	},
	{
		code: "07.211",
		scope: "Insulation",
		budget: 4500,
		vendor: "31-W",
		result: "NONE",
		notes: "31-W response pending."
	},
	{
		code: "07.310",
		scope: "Shingle material",
		budget: 2796.56,
		vendor: "Builders First Choice",
		activity: "act-roof",
		result: "OVER",
		notes: "$2,936.45 with tax. $139.89 over. Quote expired."
	},
	{
		code: "07.311",
		scope: "Shingle labor",
		budget: 1750,
		vendor: "Jonny / The Gutterist",
		activity: "act-roof",
		result: "AT",
		notes: "Jonny. At budget."
	},
	{
		code: "07.611",
		scope: "Gutters",
		budget: 1547,
		vendor: "Jonny / The Gutterist",
		activity: "act-roof",
		result: "AT",
		notes: "Jonny. At budget."
	},
	{
		code: "08.200",
		scope: "Door materials",
		budget: 950,
		vendor: "Builders First Choice",
		result: "OVER",
		notes: "$1,064.22 with tax. Locksets excluded."
	},
	{
		code: "08.300",
		scope: "Overhead doors / openers",
		budget: 4e3,
		activity: "act-framing",
		result: "NONE",
		notes: "No estimate. John Marr excludes OHD."
	},
	{
		code: "08.610",
		scope: "Window materials",
		budget: 1750,
		vendor: "Builders First Choice",
		result: "WITHIN",
		notes: "Two windows + flashing $878.73. Verify opening counts vs Tradewalk SB3621."
	},
	{
		code: "08.710",
		scope: "Finish hardware",
		budget: 135,
		result: "NONE",
		notes: "Cabinet pulls $30; interior locksets $105."
	},
	{
		code: "08.810",
		scope: "Bathroom mirror",
		budget: 450,
		result: "NONE",
		notes: "No estimate."
	},
	{
		code: "09.251",
		scope: "Drywall labor",
		budget: 7500,
		vendor: "Antle Drywall",
		result: "WITHIN",
		notes: "Tracker $6,800. Forecast $7,500. Howler keeps both visible."
	},
	{
		code: "09.500",
		scope: "LVT/LVP material allowance",
		budget: 3600,
		allowance: true,
		result: "NONE",
		notes: "No material quote."
	},
	{
		code: "09.501",
		scope: "Flooring labor",
		budget: 1350,
		vendor: "John Marr",
		result: "OVER",
		notes: "John Marr 900 SF at $3/SF = $2,700. $1,350 over. Verify area."
	},
	{
		code: "09.900",
		scope: "Paint material allowance",
		budget: 1260,
		allowance: true,
		result: "NONE",
		notes: "Source mixes labor and material."
	},
	{
		code: "09.901",
		scope: "Painting labor",
		budget: 3845,
		vendor: "Dylan Jasper",
		result: "OVER",
		notes: "Agreed labor $4,000. $155 over."
	},
	{
		code: "12.300",
		scope: "Custom cabinets",
		budget: 750,
		activity: "act-cabinetry",
		allowance: true,
		result: "NONE",
		notes: "No estimate."
	},
	{
		code: "12.400",
		scope: "Bathroom countertop allowance",
		budget: 900,
		allowance: true,
		result: "NONE",
		notes: "No estimate."
	},
	{
		code: "15.400",
		scope: "Plumbing fixtures",
		budget: 1400,
		activity: "act-mech",
		allowance: true,
		result: "NONE",
		notes: "Medyna excludes finishing fixtures."
	},
	{
		code: "15.401",
		scope: "Plumbing labor",
		budget: 7800,
		vendor: "Medyna Plumbing",
		activity: "act-mech",
		result: "AT",
		notes: "Estimate #230 at budget. Includes 6-gal WH. Excludes fixtures/valves."
	},
	{
		code: "15.501",
		scope: "HVAC labor",
		budget: 5250,
		vendor: "Anthony Parker",
		activity: "act-mech",
		result: "NONE",
		notes: "Tracker: Elliot pending. Forecast: Anthony Parker $7,366. Conflict stands."
	},
	{
		code: "16.010",
		scope: "Electrical labor",
		budget: 15380,
		vendor: "Jason Bonham",
		activity: "act-mech",
		result: "NONE",
		notes: "Tracker: Elliot pending. Forecast: Jason Bonham $15,000."
	},
	{
		code: "16.020",
		scope: "Electrical materials",
		budget: 2820,
		activity: "act-mech",
		result: "NONE",
		notes: "Can-lights $520; fan $1,000; exhaust $300; sconces $1,000."
	}
];
function lineFromRaw(row) {
	return {
		id: `line-${row.code.replace(".", "-")}`,
		categoryId: catFromCode(row.code),
		description: `${row.code} ${row.scope}`,
		costCode: row.code,
		trade: tradeFromCostCode(row.code),
		baselineAmount: usd(row.budget),
		isAllowance: row.allowance === true,
		vendorRef: canonicalVendor(row.vendor ?? null),
		activityId: row.activity ?? null,
		scopeItemIds: [],
		notes: `${row.result}: ${row.notes}`,
		active: true
	};
}
function commitment(id, dollars, lineId, vendor, activityId, notes) {
	const amount = usd(dollars);
	return {
		id,
		amount,
		allocations: [{
			budgetLineId: lineId,
			amount
		}],
		vendorRef: vendor,
		activityId,
		scopeItemIds: [],
		reference: null,
		status: "ACTIVE",
		notes
	};
}
function deboardFinancials() {
	const lines = Object.fromEntries(DEBOARD_LINES.map((row) => {
		const line = lineFromRaw(row);
		return [line.id, line];
	}));
	const actuals = { "actc-design": {
		id: "actc-design",
		amount: usd(2846.76),
		date: "2026-08-06",
		description: "Design time posted in budget workbook",
		budgetLineId: "line-01-040",
		commitmentId: null,
		reference: "Workbook actual",
		status: "RECORDED",
		notes: "Tracker: actual posted, not a vendor estimate."
	} };
	return {
		currency: "USD",
		baseline: usd(165552.28),
		categories: DEBOARD_CATS,
		lines,
		commitments: {
			"cmt-sam": commitment("cmt-sam", 26200, "line-03-111", "Sam the Concrete Man", "act-concrete", "SELECTED package $26,200 vs $26,800 applicable ($600 favorable). Do not add to 02.201 / 03.111 / 04.221. Forecast lists $22,500. Financial tracker $25,500. Tracker package governs the comparison."),
			"cmt-stanfield": commitment("cmt-stanfield", 13500.72, "line-06-101", "David Stanfield", "act-framing", "Tracker SELECTED $13,500.72. Field is John Marr. Both remain."),
			"cmt-medyna": commitment("cmt-medyna", 7800, "line-15-401", "Medyna Plumbing", "act-mech", "Estimate #230. At budget."),
			"cmt-antle": commitment("cmt-antle", 6800, "line-09-251", "Antle Drywall", null, "Tracker $6,800. Forecast $7,500."),
			"cmt-jasper": commitment("cmt-jasper", 4e3, "line-09-901", "Dylan Jasper", null, "Agreed painting labor $4,000."),
			"cmt-floors": commitment("cmt-floors", 2700, "line-09-501", "John Marr", null, "900 SF at $3/SF. Over the $1,350 labor budget."),
			"cmt-lee": commitment("cmt-lee", 12409.21, "line-04-210", "Lee Building Products", "act-block", "Quote expired. Refresh before award."),
			"cmt-shingles": commitment("cmt-shingles", 2936.45, "line-07-310", "Builders First Choice", "act-roof", "Expired quote. $139.89 over.")
		},
		actualCosts: actuals,
		changeOrders: {}
	};
}
usd(256606.04);
function forecastFinancials(baseline, rows) {
	const categories = {};
	const lines = {};
	const commitments = {};
	rows.forEach((row, index) => {
		const catId = `cat-${row.trade.toLowerCase().replace(/[^a-z]+/g, "-")}`;
		if (!categories[catId]) categories[catId] = {
			id: catId,
			name: row.trade,
			isDefault: true,
			active: true,
			sortOrder: index + 1,
			notes: "From deposit forecast — not a CoConstruct cost-code budget."
		};
		lines[row.id] = {
			id: row.id,
			categoryId: catId,
			description: row.scope,
			costCode: null,
			trade: row.trade,
			baselineAmount: row.dollars == null ? null : usd(row.dollars),
			isAllowance: false,
			vendorRef: canonicalVendor(row.vendor),
			activityId: row.activityId ?? null,
			scopeItemIds: [],
			notes: row.notes,
			active: true
		};
		if (row.dollars != null && row.deposit && row.deposit > 0) commitments[`cmt-${row.id}`] = commitment(`cmt-${row.id}`, row.dollars, row.id, canonicalVendor(row.vendor) ?? row.vendor, row.activityId ?? null, `Forecast total. Deposit listed $${row.deposit.toLocaleString("en-US")} — deposit is not spend.`);
	});
	return {
		currency: "USD",
		baseline: usd(baseline),
		categories,
		lines,
		commitments,
		actualCosts: {},
		changeOrders: {}
	};
}
function ciurlizzaFinancials() {
	return forecastFinancials(81887, [
		{
			id: "line-floor",
			scope: "Flooring",
			vendor: "Bill Moore",
			dollars: 15140,
			trade: "Flooring",
			deposit: 4542,
			notes: "Deposit $4,542 on forecast."
		},
		{
			id: "line-drywall",
			scope: "Drywall",
			vendor: "Antle Drywall",
			dollars: 6800,
			trade: "Drywall",
			activityId: "act-antle",
			deposit: 3400,
			notes: "Install Mon Sep 21 if county clears."
		},
		{
			id: "line-elec",
			scope: "Electrical",
			vendor: "Whalen Electrical",
			dollars: 24846,
			trade: "Electrical",
			notes: "No deposit listed."
		},
		{
			id: "line-plumb",
			scope: "Plumbing",
			vendor: "Medyna Plumbing",
			dollars: 17900,
			trade: "Plumbing",
			notes: "No deposit listed."
		},
		{
			id: "line-hvac",
			scope: "HVAC",
			vendor: "Anthony Parker",
			dollars: 5620,
			trade: "HVAC",
			notes: "No deposit listed."
		},
		{
			id: "line-carpet",
			scope: "Carpet",
			vendor: "Carpet One",
			dollars: 8829,
			trade: "Flooring",
			notes: "No deposit listed."
		},
		{
			id: "line-insul",
			scope: "Insulation",
			vendor: "31-W",
			dollars: 1830,
			trade: "Insulation",
			activityId: "act-firestop",
			notes: "Fire stop Tue Sep 15."
		},
		{
			id: "line-paint",
			scope: "Paint",
			vendor: "Client",
			dollars: null,
			trade: "Painting",
			notes: "Forecast wrote a dash. Amount Unknown, not $0."
		},
		{
			id: "line-frame",
			scope: "Framing",
			vendor: "Mike Gonzalez",
			dollars: null,
			trade: "Framing",
			notes: "Mike G named. Amount blank on the forecast."
		},
		{
			id: "line-spindles",
			scope: "Stair spindles",
			vendor: "Unknown",
			dollars: 922,
			trade: "Finish carpentry",
			notes: "Vendor blank on forecast."
		}
	]);
}
function mcmillanFinancials() {
	const fin = forecastFinancials(20805, [
		{
			id: "line-elec",
			scope: "Electrical",
			vendor: "Elliot / DHEC",
			dollars: 4800,
			trade: "Electrical",
			notes: "Forecast contractor total."
		},
		{
			id: "line-plumb",
			scope: "Plumbing",
			vendor: "Elliot / DHEC",
			dollars: 4800,
			trade: "Plumbing",
			notes: "Forecast contractor total."
		},
		{
			id: "line-fixtures",
			scope: "Plumbing fixtures",
			vendor: "Winnelson",
			dollars: 1056,
			trade: "Plumbing",
			notes: "Vendor sheet."
		},
		{
			id: "line-granite",
			scope: "Granite",
			vendor: "Artistic",
			dollars: 3324,
			trade: "Surfaces",
			notes: "Vendor sheet."
		},
		{
			id: "line-tile",
			scope: "Tile / waterproofing",
			vendor: "Floor & Decor",
			dollars: 5450,
			trade: "Tile",
			notes: "Vendor sheet."
		},
		{
			id: "line-glass",
			scope: "Glass",
			vendor: "Gatsby Glass",
			dollars: 1375,
			trade: "Glass",
			notes: "Vendor sheet."
		}
	]);
	fin.changeOrders["co-bonham"] = {
		id: "co-bonham",
		number: "CO-001",
		title: "Bonham Electric circuit separation",
		description: "Light-pole and water-heater shared-circuit correction — code compliance.",
		reason: "KF Live PM dashboard commercial signal. Exterior closeout.",
		status: "PROPOSED",
		cost: usd(600),
		allocations: [{
			budgetLineId: "line-elec",
			amount: usd(600)
		}],
		declaredScheduleDays: null,
		scopeItemIds: ["scp-elec"],
		activityIds: ["act-elec"],
		categoryId: null,
		clientApproval: null,
		requestedAt: "2026-09-03",
		proposedAt: "2026-09-03",
		approvedAt: null,
		rejectedAt: null,
		notes: "Proposed, not approved. Revised stays $20,805.00 until you approve."
	};
	return fin;
}
var KF_SOURCE = "KF Live PM Intelligence Dashboard — New Model v2 · observed 2026-09-11";
function activity(input) {
	return {
		trade: null,
		durationLikely: 3,
		committedStart: null,
		committedFinish: null,
		actualStart: null,
		actualFinish: null,
		predecessorId: null,
		locked: false,
		notes: null,
		...input
	};
}
function scope(input) {
	return {
		trade: null,
		included: true,
		complete: false,
		activityId: null,
		allowanceLineId: null,
		notes: null,
		fromBaseline: true,
		...input
	};
}
function contact(id, name, trade, notes = null) {
	return {
		id,
		name,
		trade,
		phone: null,
		notes
	};
}
function selection(id, name, value, status, notes = null) {
	return {
		id,
		name,
		value,
		status,
		notes
	};
}
function job(patch) {
	return {
		...emptyJob(),
		...patch,
		inspections: {
			...emptyJob().inspections,
			...patch.inspections
		},
		contacts: patch.contacts ?? {},
		selections: patch.selections ?? {}
	};
}
function event(id, revision, note) {
	return {
		id,
		revision,
		type: "DASHBOARD_INGESTED",
		occurredAt: "2026-09-11T15:04:15.000Z",
		note,
		clerical: true
	};
}
function base(input) {
	return {
		id: input.id,
		name: input.name,
		clientName: input.clientName,
		address: input.address ?? "Unknown",
		projectType: input.projectType,
		timezone: "America/New_York",
		revision: input.revision ?? 1,
		healthBand: input.healthBand,
		paused: input.paused ?? false,
		heldPhases: input.heldPhases ?? [],
		dashboardNote: input.dashboardNote,
		officialStart: input.officialStart ?? null,
		intendedFinish: input.intendedFinish ?? null,
		sourceLabel: KF_SOURCE,
		activities: input.activities,
		scopeItems: input.scopeItems,
		financials: input.financials ?? null,
		blueprint: input.blueprint ?? emptyBlueprint(),
		job: input.job ?? emptyJob(),
		events: input.events ?? [event(`evt-${input.id}-kf`, input.revision ?? 1, `Ingested from KF Live PM Intelligence Dashboard — New Model v2 · observed 2026-09-11.`)]
	};
}
function stewart() {
	return base({
		id: "stewart-v1",
		name: "Stewart",
		clientName: "Stewart",
		address: "110 Creek Ridge Dr",
		projectType: "Final punch closeout",
		healthBand: "YELLOW",
		dashboardNote: "Bill Moore flooring estimate and cabinetry repair estimate pending. Cabinetry repairs block Artistic side-splash reinstall.",
		blueprint: emptyEvidenceBlueprint(STEWART_REFS, "Stewart Tile.pdf is in Drive. No floor-plan or tradewalk PDF named Stewart was found. Geometry stays Unknown."),
		activities: {
			"act-pollock": activity({
				id: "act-pollock",
				name: "Tom Pollock tile and handrail",
				phase: "Closeout",
				state: "COMPLETE",
				trade: "Tile",
				actualStart: "2026-09-03",
				actualFinish: "2026-09-03",
				notes: "Complete in CoConstruct and approved by Miss Stewart."
			}),
			"act-dax": activity({
				id: "act-dax",
				name: "Dax Painting",
				phase: "Painting",
				state: "IN_PROGRESS",
				trade: "Painting",
				notes: "Remains active. Finish date Unknown."
			}),
			"act-flooring": activity({
				id: "act-flooring",
				name: "Bill Moore flooring repair",
				phase: "Closeout",
				state: "IN_PROGRESS",
				trade: "Flooring",
				committedStart: "2026-09-08",
				notes: "Visited Sep 8. Estimate pending. Follow-up targeted Sep 10 — not confirmed received."
			}),
			"act-cabinetry": activity({
				id: "act-cabinetry",
				name: "Cabinetry repairs",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Cabinetry",
				committedStart: "2026-09-09",
				predecessorId: "act-flooring",
				notes: "Site visit scheduled Sep 9. Estimate pending. Howler will not mark the visit complete from the schedule."
			}),
			"act-splashes": activity({
				id: "act-splashes",
				name: "Artistic upstairs kitchen side splashes",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Surfaces",
				predecessorId: "act-cabinetry",
				notes: "Blocked on cabinetry repairs. Do not release Artistic until repairs are verified complete."
			})
		},
		scopeItems: {
			"scp-punch": scope({
				id: "scp-punch",
				description: "Final punch closeout",
				phase: "Closeout",
				activityId: "act-dax"
			}),
			"scp-floor": scope({
				id: "scp-floor",
				description: "Flooring repair (Bill Moore)",
				phase: "Closeout",
				activityId: "act-flooring"
			}),
			"scp-cab": scope({
				id: "scp-cab",
				description: "Cabinetry repairs",
				phase: "Closeout",
				activityId: "act-cabinetry"
			}),
			"scp-splash": scope({
				id: "scp-splash",
				description: "Artistic side-splash reinstall",
				phase: "Closeout",
				activityId: "act-splashes"
			})
		},
		job: job({ contacts: {
			"ct-moore": contact("ct-moore", "Bill Moore", "Flooring", "Visited Sep 8. Estimate pending."),
			"ct-artistic": contact("ct-artistic", "Artistic", "Surfaces", "Side splashes after cabinetry repairs."),
			"ct-pollock": contact("ct-pollock", "Tom Pollock", "Tile", "Tile and handrail complete / approved."),
			"ct-dax": contact("ct-dax", "Dax Painting", "Painting", "Ongoing.")
		} })
	});
}
function swiderski() {
	return base({
		id: "swiderski-v1",
		name: "Swiderski",
		clientName: "Swiderski",
		address: "1138 Payne Depot Rd",
		blueprint: emptyEvidenceBlueprint(SWIDERSKI_REFS, "Stanfield tile quote is in Drive. No floor-plan or tradewalk PDF named Swiderski was found. Geometry stays Unknown."),
		projectType: "Interior remodel — paint handoff",
		healthBand: "YELLOW",
		dashboardNote: "Meet Dylan Jasper: deliver selected paint, review Antle drywall, bathroom mirror removal, painting scope. Electrical finals wait on paint.",
		activities: {
			"act-tile": activity({
				id: "act-tile",
				name: "Bathroom tile",
				phase: "Finishes",
				state: "COMPLETE",
				trade: "Tile",
				notes: "Complete per dashboard."
			}),
			"act-drywall": activity({
				id: "act-drywall",
				name: "Antle drywall — bath, living, foyer",
				phase: "Finishes",
				state: "COMPLETE",
				trade: "Drywall",
				notes: "Complete. Contract via email Jeffrey / Paul. Quality review with Dylan still due."
			}),
			"act-paint": activity({
				id: "act-paint",
				name: "Dylan Jasper painting",
				phase: "Painting",
				state: "NOT_STARTED",
				trade: "Painting",
				predecessorId: "act-drywall",
				notes: "Selections confirmed (Paul Swiderski + Brittany). Do not start until drywall quality and mirror plan are resolved."
			}),
			"act-elec-final": activity({
				id: "act-elec-final",
				name: "Electrical finals — bath, living, foyer",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Electrical",
				predecessorId: "act-paint",
				notes: "Dependent on completed paint."
			})
		},
		scopeItems: {
			"scp-drywall": scope({
				id: "scp-drywall",
				description: "Drywall bath / living / foyer",
				phase: "Finishes",
				activityId: "act-drywall",
				complete: true
			}),
			"scp-paint": scope({
				id: "scp-paint",
				description: "Painting",
				phase: "Painting",
				activityId: "act-paint"
			}),
			"scp-mirrors": scope({
				id: "scp-mirrors",
				description: "Bathroom mirror removal / reinstall",
				phase: "Painting",
				notes: "Feasibility Unknown until Dylan review."
			})
		},
		job: job({
			contacts: {
				"ct-dylan": contact("ct-dylan", "Dylan Jasper", "Painting", "On-site paint delivery and scope review."),
				"ct-antle": contact("ct-antle", "Tim Antle / Antle Drywall", "Drywall", "Bath, living, foyer complete. Quality review due."),
				"ct-paul": contact("ct-paul", "Paul Swiderski", "Owner", "Paint selections confirmed with Brittany.")
			},
			selections: { "sel-paint": selection("sel-paint", "Paint", "Confirmed — Paul Swiderski and Brittany", "SELECTED", "Colors not listed on the dashboard. Unknown until named.") }
		})
	});
}
function pratt() {
	return base({
		id: "pratt-v1",
		name: "Pratt",
		clientName: "Pratt",
		projectType: "Final closeout — paint before carpet and closets",
		healthBand: "YELLOW",
		dashboardNote: "Painting controls the sequence. Carpet One install date Unknown. Kenny closets after carpet. Gatsby Glass Wed Sep 16 1:00 p.m.",
		blueprint: emptyEvidenceBlueprint(PRATT_REFS, "No floor-plan or tradewalk PDF named Pratt was in Drive. Geometry stays Unknown."),
		activities: {
			"act-paint": activity({
				id: "act-paint",
				name: "Complete remaining painting",
				phase: "Painting",
				state: "IN_PROGRESS",
				trade: "Painting",
				notes: "Ms. Pratt requires all painting before carpet and closets. Completion date not committed."
			}),
			"act-carpet": activity({
				id: "act-carpet",
				name: "Carpet One installation",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Flooring",
				predecessorId: "act-paint",
				notes: "Selected. Lindsay sent install price. Date Unknown — Howler will not invent one."
			}),
			"act-closets": activity({
				id: "act-closets",
				name: "Kenny / Custom Closets Design",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Closets",
				predecessorId: "act-carpet",
				notes: "Materials expected that week. Initial install target the following week, after carpet."
			}),
			"act-glass": activity({
				id: "act-glass",
				name: "Gatsby Glass shower-door template",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Glass",
				committedStart: "2026-09-16",
				committedFinish: "2026-09-16",
				notes: "Rescheduled Wednesday Sep 16 at 1:00 p.m."
			})
		},
		scopeItems: {
			"scp-paint": scope({
				id: "scp-paint",
				description: "Remaining painting",
				phase: "Painting",
				activityId: "act-paint"
			}),
			"scp-carpet": scope({
				id: "scp-carpet",
				description: "Carpet installation",
				phase: "Closeout",
				activityId: "act-carpet"
			}),
			"scp-closets": scope({
				id: "scp-closets",
				description: "Custom closets",
				phase: "Closeout",
				activityId: "act-closets"
			}),
			"scp-glass": scope({
				id: "scp-glass",
				description: "Shower door glass",
				phase: "Closeout",
				activityId: "act-glass"
			})
		},
		job: job({
			permitStatus: "ISSUED",
			inspections: { "insp-final": {
				id: "insp-final",
				name: "Final",
				code: "R110",
				status: "READY",
				date: null,
				notes: "Fayette County final result still requires closeout documentation. Howler will not mark passed from that sentence."
			} },
			contacts: {
				"ct-lindsay": contact("ct-lindsay", "Lindsay", "Carpet One", "Selection and install price confirmed. Date Unknown."),
				"ct-kenny": contact("ct-kenny", "Kenny", "Custom Closets Design", "Materials expected; install after paint + carpet."),
				"ct-gatsby": contact("ct-gatsby", "Gatsby Glass", "Glass", "Wed Sep 16 1:00 p.m. template.")
			},
			selections: {
				"sel-carpet": selection("sel-carpet", "Carpet", "Selected via Lindsay / Carpet One", "SELECTED", "Product name not on the dashboard."),
				"sel-walls": selection("sel-walls", "Walls", "Sherwin-Williams Balanced Beige SW 7037 eggshell; mildew-resistant bath", "SELECTED"),
				"sel-trim": selection("sel-trim", "Doors / trim", "Porter/PPG Velvet White semi-gloss", "SELECTED"),
				"sel-ceiling": selection("sel-ceiling", "Ceiling", "Velvet White flat", "SELECTED"),
				"sel-grout-w": selection("sel-grout-w", "Shower wall grout", "Bostik Mobe Pearl H145", "SELECTED"),
				"sel-grout-f": selection("sel-grout-f", "Shower floor / tub backsplash grout", "TEC Warm Taupe 973", "SELECTED")
			}
		})
	});
}
function carver() {
	return base({
		id: "carver",
		name: "Carver / Julian",
		clientName: "Carver, Craig & Julian, Augusta",
		address: "1035 Wil Rose Ln, Versailles KY 40383",
		projectType: "Two-bath remodel — final closeout",
		healthBand: "YELLOW",
		dashboardNote: "SOW work is in. Remaining closeout: Waylon Electric finals and Artistic vanities were scheduled Wed Sep 9 — not field-confirmed. Gatsby Glass templates Wed Sep 16 8:00–9:00 a.m.",
		revision: 5,
		blueprint: carverBlueprint(),
		activities: {
			"act-demo": activity({
				id: "act-demo",
				name: "Bath demolition",
				phase: "Demo",
				state: "COMPLETE",
				trade: "Demo",
				durationLikely: 5,
				notes: "Master: keep tub surround. Upstairs: full demo + expand into closet. Per SOW and hall/master design A02."
			}),
			"act-frame": activity({
				id: "act-frame",
				name: "Framing / blocking / niche headers",
				phase: "Framing",
				state: "COMPLETE",
				trade: "Framing",
				durationLikely: 8,
				predecessorId: "act-demo",
				notes: "12×28 Schluter niche headers, grab-bar and glass blocking. A04 both sets."
			}),
			"act-mech-rough": activity({
				id: "act-mech-rough",
				name: "Plumbing + electrical rough",
				phase: "Systems",
				state: "COMPLETE",
				trade: "MEP",
				durationLikely: 8,
				predecessorId: "act-frame",
				notes: "Rough is in. Electrical finals are a separate closeout card."
			}),
			"act-drywall": activity({
				id: "act-drywall",
				name: "Drywall",
				phase: "Finishes",
				state: "COMPLETE",
				trade: "Drywall",
				durationLikely: 5,
				predecessorId: "act-mech-rough",
				notes: "Moisture-resistant in wet areas. Glue and screw."
			}),
			"act-tile": activity({
				id: "act-tile",
				name: "Schluter + tile",
				phase: "Finishes",
				state: "COMPLETE",
				trade: "Tile",
				durationLikely: 10,
				predecessorId: "act-drywall",
				notes: "Look-ahead week of Aug 3 was tile finals. KF Sep 11 is closeout — tile is behind that."
			}),
			"act-paint": activity({
				id: "act-paint",
				name: "Painting",
				phase: "Painting",
				state: "COMPLETE",
				trade: "Painting",
				durationLikely: 5,
				predecessorId: "act-tile",
				notes: "SOW paint for both baths. Vanity paint rides with Artistic."
			}),
			"act-elec": activity({
				id: "act-elec",
				name: "Waylon Electric electrical finals",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Electrical",
				committedStart: "2026-09-09",
				committedFinish: "2026-09-09",
				predecessorId: "act-paint",
				notes: "Scheduled Sep 9. Dashboard did not confirm completion. Howler will not mark it done."
			}),
			"act-vanity": activity({
				id: "act-vanity",
				name: "Artistic vanity installation",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Cabinetry",
				committedStart: "2026-09-09",
				committedFinish: "2026-09-09",
				predecessorId: "act-paint",
				notes: "Scheduled Sep 9. Completion Unknown."
			}),
			"act-glass": activity({
				id: "act-glass",
				name: "Gatsby Glass shower-door template",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Glass",
				committedStart: "2026-09-16",
				committedFinish: "2026-09-16",
				notes: "Wednesday Sep 16, 8:00–9:00 a.m. Master and upstairs."
			})
		},
		scopeItems: carverSowScope(),
		job: job({
			permitStatus: "ISSUED",
			contacts: {
				"ct-waylon": contact("ct-waylon", "Waylon Electric", "Electrical", "Finals scheduled Sep 9."),
				"ct-artistic": contact("ct-artistic", "Artistic", "Cabinetry", "Vanities scheduled Sep 9."),
				"ct-gatsby": contact("ct-gatsby", "Gatsby Glass", "Glass", "Template Sep 16 8:00–9:00 a.m.")
			},
			rules: CARVER_RULES
		})
	});
}
function ciurlizza() {
	return base({
		id: "ciurlizza-v1",
		name: "Ciurlizza",
		clientName: "Ciurlizza",
		address: "740 Andover Village Dr",
		financials: ciurlizzaFinancials(),
		blueprint: ciurlizzaBlueprint(),
		projectType: "Inspection recovery — Fayette County",
		healthBand: "RED",
		dashboardNote: "Fayette County inspection FAILED. 31-W fire stop Tue Sep 15. LVL docs (Marcus / 84 Lumber) and 2x4 strapping before reinspection Thu Sep 17. Drywall blocked.",
		activities: {
			"act-firestop": activity({
				id: "act-firestop",
				name: "31-W fire stop",
				phase: "Corrections",
				state: "NOT_STARTED",
				trade: "Firestopping",
				committedStart: "2026-09-15",
				committedFinish: "2026-09-15",
				notes: "Scheduled Tuesday Sep 15."
			}),
			"act-lvl": activity({
				id: "act-lvl",
				name: "LVL specifications from Marcus / 84 Lumber",
				phase: "Corrections",
				state: "NOT_STARTED",
				trade: "Lumber",
				notes: "Documentation not received. Howler will not invent sizes."
			}),
			"act-strap": activity({
				id: "act-strap",
				name: "2x4 wall strapping",
				phase: "Corrections",
				state: "NOT_STARTED",
				trade: "Framing",
				notes: "Required for reinspection. Completion Unknown."
			}),
			"act-reinspect": activity({
				id: "act-reinspect",
				name: "Fayette County reinspection",
				phase: "Inspections",
				state: "NOT_STARTED",
				trade: null,
				committedStart: "2026-09-17",
				committedFinish: "2026-09-17",
				predecessorId: "act-firestop",
				notes: "Thursday Sep 17. Contingent on fire stop, LVL docs, and strapping."
			}),
			"act-drywall-mat": activity({
				id: "act-drywall-mat",
				name: "Drywall material delivery",
				phase: "Finishes",
				state: "NOT_STARTED",
				trade: "Drywall",
				committedStart: "2026-09-18",
				predecessorId: "act-reinspect",
				notes: "Friday Sep 18. Held until passing reinspection."
			}),
			"act-antle": activity({
				id: "act-antle",
				name: "Antle Drywall installation",
				phase: "Finishes",
				state: "NOT_STARTED",
				trade: "Drywall",
				committedStart: "2026-09-21",
				predecessorId: "act-drywall-mat",
				notes: "Monday Sep 21, contingent on county clearance."
			})
		},
		scopeItems: ciurlizzaSowScope(),
		job: job({
			permitStatus: "ISSUED",
			inspections: { "insp-framing": {
				id: "insp-framing",
				name: "Framing",
				code: "R602 / R502 / R802",
				status: "FAILED",
				date: null,
				notes: "Fayette County failed. Fire stop Sep 15. Reinspection Sep 17. Fail date not on the dashboard."
			} },
			contacts: {
				"ct-yeiser": contact("ct-yeiser", "Yeiser Structural", "Engineering", "Dave Mills. Markup set Feb 26, 2026. Field-verify existing steel."),
				"ct-31w": contact("ct-31w", "31-W", "Firestopping", "On site Tue Sep 15."),
				"ct-marcus": contact("ct-marcus", "Marcus", "84 Lumber", "LVL specifications / documentation."),
				"ct-colin": contact("ct-colin", "Colin", "Builders First Choice", "Bay and egress windows — confirm ordered."),
				"ct-cox": contact("ct-cox", "Cox Interiors", "Doors", "Approved frosted pocket-door order."),
				"ct-antle": contact("ct-antle", "Antle Drywall", "Drywall", "Install Mon Sep 21 if county clears.")
			},
			rules: CIURLIZZA_RULES
		})
	});
}
function mcmillan() {
	return base({
		id: "mcmillan-v1",
		name: "McMillan",
		clientName: "McMillan",
		address: "109 Caveson Way",
		financials: mcmillanFinancials(),
		blueprint: mcmillanBlueprint(),
		projectType: "Exterior closeout — interior held",
		healthBand: "GREEN",
		paused: false,
		heldPhases: ["Interior"],
		revision: 3,
		dashboardNote: "Exterior is closing out (Phase 1 porch). Concrete platform/sidewalk and Bonham circuit correction are still live — not marked complete from a target. Porch ceiling and column paint wait on approval. Interior remains held pending Stanfield vs Saul. Do not release interior work.",
		activities: {
			"act-concrete": activity({
				id: "act-concrete",
				name: "Concrete platform and sidewalk pour/stamp/color",
				phase: "Closeout",
				state: "IN_PROGRESS",
				trade: "Concrete",
				durationLikely: 2,
				notes: "KF Sep 3 IN_PROGRESS. Owner Sep 12: exterior is closing out. Field-confirm before marking complete."
			}),
			"act-elec": activity({
				id: "act-elec",
				name: "Bonham Electric circuit correction",
				phase: "Electrical",
				state: "IN_PROGRESS",
				trade: "Electrical",
				durationLikely: 1,
				notes: "Light-pole / water-heater shared circuit. KF commercial signal $600. Proposed CO, not approved."
			}),
			"act-porch": activity({
				id: "act-porch",
				name: "Phase 1 front porch closeout",
				phase: "Closeout",
				state: "IN_PROGRESS",
				trade: "Masonry",
				durationLikely: 4,
				notes: "SOW §2 + McMillanPorchsheet2.pdf A03 proposed 51'-7\" × 8'-6\". Owner: exterior portion is closing out."
			}),
			"act-ceiling": activity({
				id: "act-ceiling",
				name: "Porch-ceiling renovation",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Carpentry",
				durationLikely: 3,
				notes: "Approval / committed dates not yet given. Howler will not invent them."
			}),
			"act-columns": activity({
				id: "act-columns",
				name: "Column painting / columns to match rear",
				phase: "Closeout",
				state: "NOT_STARTED",
				trade: "Painting",
				durationLikely: 2,
				notes: "Material and size to confirm. Approval not yet given."
			}),
			"act-compare": activity({
				id: "act-compare",
				name: "Stanfield vs Saul interior estimate comparison",
				phase: "Interior",
				state: "NOT_STARTED",
				durationLikely: 1,
				notes: "Stanfield estimate is in Drive Sep 10. Still compare vs Saul. Do not release interior work."
			})
		},
		scopeItems: mcmillanScope(),
		job: job({
			contacts: {
				"ct-stanfield": contact("ct-stanfield", "David Stanfield", "Estimating", "Interior estimate in Drive Sep 10 (prepared for J&R). Compare vs Saul before releasing interior. Dollar total not extracted."),
				"ct-saul": contact("ct-saul", "Saul", "Estimating", "Compare against Stanfield."),
				"ct-bonham": contact("ct-bonham", "Bonham Electric", "Electrical", "Circuit separation CO $600 proposed. Live closeout item.")
			},
			rules: JR_SITE_RULES
		}),
		events: [{
			id: "evt-mcmillan-closeout",
			revision: 3,
			type: "DASHBOARD_CORRECTED",
			occurredAt: "2026-09-12T21:20:00.000Z",
			note: "Exterior is closing out. Whole-job pause lifted. Interior stays held. Progress reads released porch work, not the paused interior.",
			clerical: true
		}, event("evt-mcmillan-kf", 1, `Ingested from ${KF_SOURCE}.`)]
	});
}
function kfProjects() {
	return {
		"stewart-v1": stewart(),
		"swiderski-v1": swiderski(),
		"pratt-v1": pratt(),
		carver: carver(),
		"ciurlizza-v1": ciurlizza(),
		"mcmillan-v1": mcmillan()
	};
}
function deboard() {
	return {
		id: "deboard-v091",
		name: "DeBoard Residence",
		clientName: "DeBoard",
		address: "227 Marengo Dr",
		projectType: "Detached garage + mower storage + conditioned second-floor office/flex + half bath",
		timezone: "America/New_York",
		revision: 21,
		healthBand: "YELLOW",
		paused: false,
		heldPhases: [],
		dashboardNote: "Sam concrete/site-prep expected complete Sat Sep 12. John Marr framing and Jason Bonham electrical are unconfirmed after pads.",
		officialStart: "2026-08-18",
		intendedFinish: null,
		sourceLabel: "KF Live PM Intelligence Dashboard — New Model v2 · observed 2026-09-11",
		activities: {
			"act-footer": {
				id: "act-footer",
				name: "Footer",
				phase: "Foundation",
				state: "COMPLETE",
				trade: "Concrete",
				durationLikely: 3,
				committedStart: "2026-08-18",
				committedFinish: "2026-08-20",
				actualStart: "2026-08-18",
				actualFinish: "2026-08-20",
				predecessorId: null,
				locked: true,
				notes: null
			},
			"act-block": {
				id: "act-block",
				name: "Block walls",
				phase: "Foundation",
				state: "COMPLETE",
				trade: "Masonry",
				durationLikely: 5,
				committedStart: "2026-08-21",
				committedFinish: "2026-08-27",
				actualStart: "2026-08-21",
				actualFinish: "2026-08-27",
				predecessorId: "act-footer",
				locked: true,
				notes: null
			},
			"act-concrete": {
				id: "act-concrete",
				name: "Concrete slab",
				phase: "Foundation",
				state: "IN_PROGRESS",
				trade: "Concrete",
				durationLikely: 4,
				committedStart: "2026-09-09",
				committedFinish: "2026-09-12",
				actualStart: "2026-09-09",
				actualFinish: null,
				predecessorId: "act-block",
				locked: false,
				notes: "KF working sequence: Sam mobilized Sep 9, expected complete Sat Sep 12. Confirm in the field — Howler will not mark complete from a target date."
			},
			"act-framing": {
				id: "act-framing",
				name: "Framing / dry-in",
				phase: "Structure",
				state: "NOT_STARTED",
				trade: "Framing",
				durationLikely: 12,
				committedStart: "2026-09-14",
				committedFinish: null,
				actualStart: null,
				actualFinish: null,
				predecessorId: "act-concrete",
				locked: false,
				notes: "KF target Mon Sep 14 with John Marr. Confirmation pending. Jason Bonham electrical follow-on also unconfirmed."
			},
			"act-roof": {
				id: "act-roof",
				name: "Roof",
				phase: "Envelope",
				state: "NOT_STARTED",
				trade: "Roofing",
				durationLikely: 5,
				committedStart: null,
				committedFinish: null,
				actualStart: null,
				actualFinish: null,
				predecessorId: "act-framing",
				locked: false,
				notes: null
			},
			"act-mech": {
				id: "act-mech",
				name: "MEP rough-in",
				phase: "Systems",
				state: "NOT_STARTED",
				trade: "MEP",
				durationLikely: 8,
				committedStart: null,
				committedFinish: null,
				actualStart: null,
				actualFinish: null,
				predecessorId: "act-framing",
				locked: false,
				notes: null
			},
			"act-cabinetry": {
				id: "act-cabinetry",
				name: "Cabinetry",
				phase: "Finishes",
				state: "NOT_STARTED",
				trade: "Cabinetry",
				durationLikely: 6,
				committedStart: null,
				committedFinish: null,
				actualStart: null,
				actualFinish: null,
				predecessorId: "act-mech",
				locked: false,
				notes: null
			}
		},
		scopeItems: deboardSowScope(),
		financials: deboardFinancials(),
		blueprint: tradewalkBlueprint(),
		events: [
			{
				id: "evt-seed-19",
				revision: 19,
				type: "BUDGET_INGESTED",
				occurredAt: "2026-09-12T20:00:00.000Z",
				note: "Ingested Deboard Trade Budget & Estimate Tracker. Cost budget $165,552.28. Sell price $256,606.04 is not the trade baseline. Synthetic $400k retired.",
				clerical: true
			},
			{
				id: "evt-seed-20",
				revision: 20,
				type: "DRAWING_LIBRARY_INGESTED",
				occurredAt: "2026-09-12T20:45:00.000Z",
				note: "Copied Drive originals into Howler (plans + SOW + rules) without deleting Drive. Carver progress now reads the full SOW, not leftover punch.",
				clerical: true
			},
			{
				id: "evt-seed-21",
				revision: 21,
				type: "SOW_INGESTED",
				occurredAt: "2026-09-12T21:10:00.000Z",
				note: "Deboard / Carver / Ciurlizza / McMillan SOW and drawing copies stored in Howler. Drive originals untouched.",
				clerical: true
			}
		],
		job: deboardJob()
	};
}
var SEED_VERSION = "howler-pilot-v14-card-dates-2026-09-12";
function createSeedState() {
	return { projects: {
		"deboard-v091": deboard(),
		...kfProjects()
	} };
}
var STORAGE_KEY = "howler-canonical-v1";
function withBlueprint(project) {
	if (project.blueprint && project.job && project.heldPhases && "officialStart" in project && "intendedFinish" in project) return project;
	return {
		...project,
		heldPhases: project.heldPhases ?? [],
		officialStart: project.officialStart ?? null,
		intendedFinish: project.intendedFinish ?? null,
		blueprint: project.blueprint ?? emptyBlueprint(),
		job: project.job ?? emptyJob()
	};
}
function readPersisted() {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed.seedVersion !== "howler-pilot-v14-card-dates-2026-09-12" || !parsed.projects) return null;
		return {
			projects: Object.fromEntries(Object.entries(parsed.projects).map(([id, project]) => [id, withBlueprint(project)])),
			seedVersion: parsed.seedVersion,
			updatedAt: parsed.updatedAt
		};
	} catch {
		return null;
	}
}
function persist(projects, updatedAt) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
		projects,
		seedVersion: SEED_VERSION,
		updatedAt
	}));
	fetch("/api/howler-state", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			projects,
			seedVersion: SEED_VERSION,
			updatedAt
		})
	}).catch(() => void 0);
}
var useHowlerStore = create((set, get) => ({
	...createSeedState(),
	seedVersion: SEED_VERSION,
	updatedAt: 0,
	applyPreview: (projectId, preview) => {
		const project = get().projects[projectId];
		if (!project) throw new Error("Unknown project.");
		const next = preview.apply(withBlueprint(project));
		const projects = {
			...get().projects,
			[projectId]: next
		};
		const updatedAt = Date.now();
		set({
			projects,
			updatedAt
		});
		rememberFromPreview(preview, next);
		persist(projects, updatedAt);
	},
	restoreSeed: () => {
		const seed = createSeedState();
		const updatedAt = Date.now();
		set({
			...seed,
			seedVersion: SEED_VERSION,
			updatedAt
		});
		persist(seed.projects, updatedAt);
	},
	hydrateFromStorage: () => {
		if (typeof window === "undefined") return;
		if (window.sessionStorage.getItem("howler-hydrated") === "1") return;
		window.sessionStorage.setItem("howler-hydrated", "1");
		const persisted = readPersisted();
		if (persisted) set({
			projects: persisted.projects,
			seedVersion: persisted.seedVersion,
			updatedAt: persisted.updatedAt ?? Date.now()
		});
	},
	pullRemote: async () => {
		if (typeof window === "undefined") return;
		try {
			const res = await fetch("/api/howler-state", { headers: { "If-None-Match": `"${get().updatedAt}"` } });
			if (res.status === 204 || res.status === 304 || !res.ok) return;
			const remote = await res.json();
			if (!remote.projects || remote.seedVersion !== "howler-pilot-v14-card-dates-2026-09-12") return;
			if (remote.updatedAt <= get().updatedAt) return;
			const projects = Object.fromEntries(Object.entries(remote.projects).map(([id, project]) => [id, withBlueprint(project)]));
			set({
				projects,
				updatedAt: remote.updatedAt,
				seedVersion: remote.seedVersion
			});
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
				projects,
				seedVersion: remote.seedVersion,
				updatedAt: remote.updatedAt
			}));
		} catch {}
	}
}));
function useProject(projectId) {
	return useHowlerStore((state) => state.projects[projectId]);
}
var EarContext = (0, import_react.createContext)(null);
var ARM_KEY = "howler-listen-enabled";
var GRANT_KEY = "howler-mic-granted";
function HowlerEarProvider({ children }) {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const projects = useHowlerStore((state) => state.projects);
	const applyPreview = useHowlerStore((state) => state.applyPreview);
	const activeProjectId = pathname.startsWith("/projects/") ? pathname.split("/")[2] ?? null : null;
	const activeProject = activeProjectId ? projects[activeProjectId] ?? null : null;
	const [voice, setVoice] = (0, import_react.useState)("READY");
	const [heard, setHeard] = (0, import_react.useState)(null);
	const [message, setMessage] = (0, import_react.useState)(null);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [targetId, setTargetId] = (0, import_react.useState)(activeProjectId);
	const targetRef = (0, import_react.useRef)(activeProjectId);
	const previewRef = (0, import_react.useRef)(null);
	const voiceRef = (0, import_react.useRef)(voice);
	const projectsRef = (0, import_react.useRef)(projects);
	const activeRef = (0, import_react.useRef)(activeProjectId);
	const awakeTimer = (0, import_react.useRef)(null);
	const fieldRef = (0, import_react.useRef)(null);
	previewRef.current = preview;
	voiceRef.current = voice;
	projectsRef.current = projects;
	activeRef.current = activeProjectId;
	const take = (0, import_react.useCallback)((result, spoken = false, projectId = activeRef.current) => {
		if (result.outcome === "CLARIFICATION") {
			setPreview(null);
			const parts = result.message.split(". ").filter(Boolean);
			const short = parts[0] ? `${parts[0].replace(/\.$/, "")}.` : "Howler.";
			setMessage(short);
			setHeard(result.message);
			howlerTrace("clarification", result.message.slice(0, 240));
			setVoice("ARMED");
			if (spoken) speakHowler(talkClarify(result.message), { mute: true }).then(() => fieldRef.current?.restart());
			else fieldRef.current?.restart();
			return;
		}
		if (result.outcome === "ACTION") {
			setPreview(null);
			if (result.action === "OPEN" && result.projectId) navigate({
				to: "/projects/$projectId/$moduleId",
				params: {
					projectId: result.projectId,
					moduleId: "overview"
				}
			});
			else window.dispatchEvent(new Event(result.action === "PRINT" ? "howler-print-sheet" : "howler-export-set"));
			setMessage(result.message);
			if (spoken) speakHowler(result.message, { mute: true }).then(() => fieldRef.current?.restart());
			return;
		}
		const pid = projectId ?? activeRef.current;
		const project = pid ? projectsRef.current[pid] : null;
		setTargetId(pid);
		targetRef.current = pid;
		const annotated = project ? annotatePreview(project, result.preview) : result.preview;
		setPreview(annotated);
		setVoice("AWAKE");
		const job = project?.name ?? "This job";
		let picture = annotated.understood;
		if (project) try {
			const brief = jobBrief(annotated.apply(project));
			picture = [brief.now, brief.next[0]].filter(Boolean).join(" ");
		} catch {
			picture = annotated.understood;
		}
		const readback = talkReadback(job, picture);
		setMessage(readback);
		howlerTrace("preview", readback.slice(0, 240));
		unlockSpeech();
		if (spoken) speakHowler(readback, { mute: true }).then(() => {
			muteEar(false);
			fieldRef.current?.restart();
		});
		else muteEar(false);
	}, [navigate]);
	const takeRef = (0, import_react.useRef)(take);
	takeRef.current = take;
	const sleep = (0, import_react.useCallback)(() => {
		if (awakeTimer.current) window.clearTimeout(awakeTimer.current);
		try {
			window.speechSynthesis.cancel();
		} catch {}
		muteEar(false);
		fieldRef.current?.stop();
		fieldRef.current = null;
		setVoice("READY");
		setHeard(null);
		setMessage(null);
		if (typeof window !== "undefined") window.sessionStorage.removeItem(ARM_KEY);
	}, []);
	const confirmPreview = (0, import_react.useCallback)(() => {
		const current = previewRef.current;
		const pid = targetRef.current ?? targetId ?? activeRef.current;
		if (!current || !pid) return;
		applyPreview(pid, current);
		const project = useHowlerStore.getState().projects[pid];
		const brief = project ? jobBrief(project) : null;
		howlerTrace("confirm", `${pid} ${current.understood}`);
		setPreview(null);
		const line = brief ? `${brief.now} ${brief.next[0] ?? ""}`.trim() : `Applied: ${current.understood}`;
		setMessage(line);
		setHeard(null);
		setVoice("ARMED");
		try {
			window.speechSynthesis.cancel();
		} catch {}
		muteEar(false);
		howlerChime();
		fieldRef.current?.restart();
		navigate({
			to: "/projects/$projectId/$moduleId",
			params: {
				projectId: pid,
				moduleId: "overview"
			}
		});
	}, [
		applyPreview,
		navigate,
		targetId
	]);
	const cancelPreview = (0, import_react.useCallback)(() => {
		try {
			window.speechSynthesis.cancel();
		} catch {}
		setPreview(null);
		setMessage(null);
		setVoice("ARMED");
		muteEar(false);
		fieldRef.current?.restart();
	}, []);
	const restArm = (0, import_react.useCallback)(() => {
		if (awakeTimer.current) window.clearTimeout(awakeTimer.current);
		awakeTimer.current = window.setTimeout(() => {
			if (voiceRef.current === "AWAKE" || voiceRef.current === "LISTENING") {
				if (!previewRef.current) {
					setVoice("ARMED");
					setMessage("Listening for Hey Howler.");
				}
			}
		}, 45e3);
	}, []);
	const submitText = (0, import_react.useCallback)((text, spoken = false, alreadyCommand = false) => {
		const said = text.trim();
		if (!said) return;
		setHeard(said);
		howlerTrace("submit", said.slice(0, 240));
		const action = decideHeardAction(said, {
			state: alreadyCommand ? "LISTENING" : spoken ? voiceRef.current : "AWAKE",
			hasPreview: previewRef.current != null
		});
		if (action.kind === "ignore") {
			howlerTrace("submit-ignore", action.kind);
			return;
		}
		if (action.kind === "sleep") {
			howlerTrace("command-end", said.slice(0, 80));
			if (isHardSleep(said)) {
				sleep();
				return;
			}
			setVoice("ARMED");
			setMessage("Say Hey Howler anytime.");
			fieldRef.current?.restart();
			return;
		}
		if (action.kind === "confirm") {
			confirmPreview();
			return;
		}
		if (action.kind === "cancel") {
			cancelPreview();
			return;
		}
		if (action.kind === "wake-only") {
			if (voiceRef.current === "AWAKE" || voiceRef.current === "LISTENING") return;
			setVoice("LISTENING");
			setMessage(talkWake());
			howlerChime();
			restArm();
			return;
		}
		if (action.kind !== "command") return;
		setVoice("AWAKE");
		let command = action.text;
		let pid = activeRef.current;
		if (!spoken) {
			(async () => {
				const jobs = Object.values(projectsRef.current).map((project) => ({
					id: project.id,
					name: project.name,
					clientName: project.clientName,
					note: project.dashboardNote ?? project.projectType
				}));
				const ai = await rewriteHowlerIntent({
					text: command,
					activeProjectId: pid,
					jobs
				});
				if (ai?.projectId) pid = ai.projectId;
				if (ai?.rewrite && (ai.kind === "plans" || ai.kind === "money")) command = ai.rewrite;
				howlerTrace("intent", command.slice(0, 240));
				const resolved = interpretUtterance(projectsRef.current, command, pid);
				if (resolved.projectId) {
					setTargetId(resolved.projectId);
					targetRef.current = resolved.projectId;
				}
				takeRef.current(resolved.result, false, resolved.projectId);
				restArm();
			})();
			return;
		}
		howlerTrace("intent", command.slice(0, 240));
		const resolved = interpretUtterance(projectsRef.current, command, pid);
		if (resolved.projectId) {
			setTargetId(resolved.projectId);
			targetRef.current = resolved.projectId;
		}
		takeRef.current(resolved.result, true, resolved.projectId);
		restArm();
	}, [
		cancelPreview,
		confirmPreview,
		restArm,
		sleep
	]);
	const submitRef = (0, import_react.useRef)(submitText);
	submitRef.current = submitText;
	const enable = (0, import_react.useCallback)(() => {
		howlerTrace("enable-click", `${voiceRef.current} framed=${howlerIsFramed()} secure=${window.isSecureContext}`);
		if (howlerIsFramed()) {
			const opened = openHowlerTab();
			howlerTrace("open-howler", opened ? "opened" : "blocked");
			if (!opened) {
				setVoice("DENIED");
				setMessage("The browser blocked the Howler window. Allow popups, then click Open Howler.");
				return;
			}
			setVoice("DENIED");
			setMessage("A Howler tab just opened. Click Allow microphone in THAT tab — this preview cannot hear.");
			return;
		}
		unlockSpeech();
		setVoice("READY");
		setMessage(micAskingCopy());
		setHeard("Waiting on the browser…");
		fieldRef.current?.stop();
		fieldRef.current = startFieldEar({
			onPartial: (text) => {
				if (voiceRef.current === "ARMED") return;
				setHeard(text || "Listening.");
			},
			onWake: () => {
				howlerTrace("wake");
				setVoice("LISTENING");
				setMessage("Go ahead.");
				setHeard("Listening.");
				howlerChime();
			},
			onUtterance: (text) => {
				const said = text.trim();
				howlerTrace("utterance", said.slice(0, 240));
				if (!said || isSelfTalk(said) || isJobNameDump(said)) {
					howlerTrace("utterance-dropped", said.slice(0, 120));
					return;
				}
				setHeard(said);
				submitRef.current(said, true, true);
			},
			onState: (state, detail) => {
				howlerTrace("ear-state", `${state} ${detail ?? ""}`);
				if (state === "armed") {
					setVoice("ARMED");
					setMessage(micReadyCopy());
					setHeard(micNeedsTap() ? "Tap the orb, then speak." : "Listening for Hey Howler.");
					window.sessionStorage.setItem(ARM_KEY, "1");
					window.localStorage.setItem(GRANT_KEY, "1");
					if (micNeedsTap()) {
						fieldRef.current?.listen();
						setVoice("LISTENING");
						setMessage("Go ahead.");
						howlerChime();
						return;
					}
					speakHowler("Ready.", { mute: true }).then(() => fieldRef.current?.restart());
					return;
				}
				if (state === "denied" || state === "failed") {
					setVoice("DENIED");
					setMessage(detail ?? "Click Allow on the browser prompt. Turn on Always allow.");
					setHeard("Howler cannot hear until the browser allows the microphone.");
				}
			}
		});
	}, []);
	const listenNow = (0, import_react.useCallback)(() => {
		if (howlerIsFramed() || voiceRef.current === "READY" || voiceRef.current === "DENIED" || voiceRef.current === "FAILED") {
			enable();
			return;
		}
		fieldRef.current?.listen();
		setVoice("LISTENING");
		setMessage("Go ahead.");
		setHeard("Listening.");
		howlerChime();
	}, [enable]);
	(0, import_react.useEffect)(() => {
		howlerTrace("boot", howlerTraceEnv());
		if (isPhoneHowler()) return;
		const onClick = (event) => {
			const node = event.target;
			if (!node) return;
			const hit = node.closest("button, a, input, label, [role='button']") ?? node;
			const label = (hit.getAttribute("aria-label") || hit.textContent || String(hit.className) || "").replace(/\s+/g, " ").trim().slice(0, 160);
			howlerTrace("click", `${hit.tagName} ${label}`);
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, []);
	(0, import_react.useEffect)(() => {
		return subscribeMic((data) => {
			if (data.kind === "final") {
				setHeard(data.text);
				submitRef.current(data.text, true);
			}
			if (data.kind === "interim") setHeard(data.text);
			if (data.kind === "state" && data.state === "armed") {
				setVoice("ARMED");
				setMessage("Say Hey Howler anytime.");
				window.localStorage.setItem(GRANT_KEY, "1");
			}
		});
	}, []);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		(async () => {
			if (typeof window === "undefined") return;
			if (isPhoneHowler()) return;
			if (voiceRef.current === "ARMED" || voiceRef.current === "AWAKE") return;
			let granted = window.localStorage.getItem(GRANT_KEY) === "1";
			try {
				granted = (await navigator.permissions.query({ name: "microphone" })).state === "granted";
			} catch {}
			if (cancelled || !granted) return;
			enable();
		})();
		return () => {
			cancelled = true;
		};
	}, [enable]);
	const value = (0, import_react.useMemo)(() => ({
		voice,
		heard,
		message,
		preview,
		project: targetId && projects[targetId] || activeProject,
		armed: voice === "ARMED" || voice === "AWAKE" || voice === "LISTENING",
		enable,
		listenNow,
		sleep,
		confirmPreview,
		cancelPreview,
		submitText: (text) => submitText(text, false),
		setPreview,
		setMessage,
		take
	}), [
		activeProject,
		cancelPreview,
		confirmPreview,
		enable,
		listenNow,
		heard,
		message,
		preview,
		projects,
		sleep,
		submitText,
		take,
		targetId,
		voice
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EarContext.Provider, {
		value,
		children
	});
}
function useHowlerEar() {
	const ctx = (0, import_react.useContext)(EarContext);
	if (!ctx) throw new Error("HowlerEarProvider is required.");
	return ctx;
}
function HowlerMic({ label = true }) {
	const { voice, enable, listenNow, sleep, armed } = useHowlerEar();
	if (!armed) {
		const framed = howlerIsFramed();
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "howler-enable",
			onClick: enable,
			children: voice === "DENIED" || voice === "FAILED" ? "Try microphone again" : framed ? "Open Howler" : "Allow microphone"
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "howler-voice",
				"data-state": voice,
				"aria-label": micNeedsTap() ? "Tap to talk to Howler" : "Howler is listening for Hey Howler",
				onClick: listenNow,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "howler-voice-ring",
					"aria-hidden": "true"
				})
			}),
			label ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[11px] uppercase tracking-[0.14em] text-subtle",
				children: voice === "LISTENING" || voice === "AWAKE" ? "Go ahead" : micNeedsTap() ? "Tap to talk" : "Say Hey Howler"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "text-[11px] uppercase tracking-[0.12em] text-subtle",
				onClick: sleep,
				children: "Sleep"
			})
		]
	});
}
function HowlerSpeakPad() {
	const ear = useHowlerEar();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "howler-pad print-hide",
		role: "status",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] font-medium uppercase tracking-[0.18em] text-accent",
				children: ear.voice === "AWAKE" ? "Howler" : ear.voice === "ARMED" || ear.voice === "LISTENING" ? "Listening" : "Microphone"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-display text-[22px] leading-tight",
				children: ear.message || (howlerIsFramed() ? "This preview cannot use a microphone. Click Open Howler." : micIdleCopy())
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-h-48 max-w-3xl overflow-auto whitespace-pre-wrap text-sm text-muted",
				children: ear.heard || micIdleCopy()
			})
		]
	});
}
var styles_default = "/assets/styles-CRkTzlfX.css";
var APP_NAME = "Howler";
var Route$11 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover"
			},
			{ title: APP_NAME },
			{
				name: "apple-mobile-web-app-capable",
				content: "yes"
			},
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent"
			},
			{
				name: "mobile-web-app-capable",
				content: "yes"
			},
			{
				name: "description",
				content: "Howler is a construction project-management intelligence platform. Enter what happened, review the consequence, update the project."
			},
			{
				name: "theme-color",
				content: "#0a0b0d"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		className: "antialiased",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", {
			className: "bg-bg text-fg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowlerEarProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
			]
		})]
	})
});
var $$splitComponentImporter$3 = () => import("./routes-bF4kO6x9.mjs");
var Route$10 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter$3, "component") });
var Route$9 = createFileRoute("/howler-mic")({ beforeLoad: () => {
	throw redirect({ to: "/" });
} });
var KINDS = /* @__PURE__ */ new Set([
	"progress",
	"status",
	"close",
	"money",
	"plans"
]);
async function intent({ request }) {
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	if (rateLimited(`intent:${clientKey(request)}`, 30, 6e4)) return Response.json({ ok: false }, { status: 429 });
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return Response.json({ ok: false });
	const body = await request.json();
	const text = (body.text ?? "").trim().slice(0, 1200);
	if (!text) return Response.json({ ok: false });
	const jobs = (body.jobs ?? []).slice(0, 12).map((job) => ({
		id: String(job.id ?? "").slice(0, 64),
		name: String(job.name ?? "").slice(0, 80),
		clientName: String(job.clientName ?? "").slice(0, 80),
		note: String(job.note ?? "").slice(0, 160)
	}));
	const ids = new Set(jobs.map((job) => job.id));
	const roster = jobs.map((job) => `${job.id}: ${job.name}`).join("\n");
	const picture = (body.picture ?? "").slice(0, 400);
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			temperature: 0,
			max_tokens: 220,
			messages: [{
				role: "system",
				content: "You are Howler. Fix speech-to-text for Kentucky Fine Homes jobs only. Return JSON only: {\"rewrite\": string, \"projectId\": string|null, \"kind\": \"progress\"|\"status\"|\"close\"|\"money\"|\"plans\", \"say\": string}. kind=progress is the default. Never rewrite a progress update into plans, envelope, width, depth, garage size, studs, or drawings. Do not invent a change order, SOP, budget move, or dollar amount. kind=money only if they named dollars, invoice, budget, or a change order. kind=plans only if they are talking about drawings, studs, joists, or a building size. rewrite: keep THEIR words. Only fix names. Do not add new topics. say: 1-2 spoken sentences, conversational. Do not mention budget unless they did."
			}, {
				role: "user",
				content: `JOBS:\n${roster}\nACTIVE: ${body.activeProjectId ?? "none"}\n` + (picture ? `PARSED:\n${picture}\n` : "") + `COMMAND:\n${text}`
			}]
		})
	});
	if (!res.ok) return Response.json({ ok: false });
	const match = ((await res.json()).choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
	if (!match) return Response.json({ ok: false });
	try {
		const parsed = JSON.parse(match[0]);
		const rewrite = (parsed.rewrite ?? "").trim().slice(0, 1200);
		if (!rewrite) return Response.json({ ok: false });
		const projectId = parsed.projectId && ids.has(parsed.projectId) ? parsed.projectId : null;
		const kind = parsed.kind && KINDS.has(parsed.kind) ? parsed.kind : "progress";
		return Response.json({
			ok: true,
			rewrite,
			projectId,
			kind,
			say: (parsed.say ?? "").trim().slice(0, 400) || null
		});
	} catch {
		return Response.json({ ok: false });
	}
}
var Route$8 = createFileRoute("/api/howler-intent")({ server: { handlers: { POST: intent } } });
/** Howler voice. Optional rented engine. Client only talks to Howler. */
async function speak({ request }) {
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	if (rateLimited(`speak:${clientKey(request)}`, 20, 6e4)) return new Response("Slow down", { status: 429 });
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return new Response("Voice offline", { status: 503 });
	const text = ((await request.json()).text ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
	if (!text) return new Response("Empty", { status: 400 });
	const res = await fetch("https://api.x.ai/v1/tts", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			text,
			voice_id: "eve",
			language: "en"
		})
	});
	if (!res.ok) {
		const fallback = await fetch("https://api.x.ai/v1/audio/speech", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "grok-voice-latest",
				voice: "eve",
				input: text
			})
		});
		if (!fallback.ok) return new Response("TTS failed", { status: 502 });
		return new Response(fallback.body, { headers: { "Content-Type": fallback.headers.get("Content-Type") || "audio/mpeg" } });
	}
	return new Response(res.body, { headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mpeg" } });
}
var Route$7 = createFileRoute("/api/howler-speak")({ server: { handlers: { POST: speak } } });
var snapshot = null;
var MAX_BYTES$1 = 15e5;
async function handle$2({ request }) {
	if (request.method === "GET") {
		if (!snapshot) return new Response(null, { status: 204 });
		const tag = `"${snapshot.updatedAt}"`;
		if (request.headers.get("If-None-Match") === tag) return new Response(null, {
			status: 304,
			headers: { ETag: tag }
		});
		return Response.json(snapshot, { headers: {
			ETag: tag,
			"Cache-Control": "private, no-store"
		} });
	}
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	const raw = await request.text();
	if (raw.length > MAX_BYTES$1) return new Response("Too large", { status: 413 });
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		return Response.json({ ok: false }, { status: 400 });
	}
	if (!body?.projects || typeof body.seedVersion !== "string") return Response.json({ ok: false }, { status: 400 });
	const updatedAt = clampUpdatedAt(body.updatedAt, snapshot?.updatedAt);
	if (snapshot && updatedAt < snapshot.updatedAt) return Response.json({
		ok: true,
		updatedAt: snapshot.updatedAt
	});
	snapshot = {
		projects: body.projects,
		seedVersion: body.seedVersion,
		updatedAt
	};
	return Response.json({
		ok: true,
		updatedAt: snapshot.updatedAt
	});
}
var Route$6 = createFileRoute("/api/howler-state")({ server: { handlers: {
	GET: handle$2,
	POST: handle$2
} } });
var events = [];
var MAX = 200;
async function handle$1({ request }) {
	if (request.method === "GET") return Response.json({ events: events.slice(-40).map((event) => ({
		t: event.t,
		kind: event.kind,
		detail: (event.detail ?? "").slice(0, 160)
	})) });
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	const body = await request.json().catch(() => null);
	if (!body?.kind) return Response.json({ ok: false }, { status: 400 });
	events.push({
		t: Date.now(),
		kind: body.kind,
		detail: (body.detail ?? "").slice(0, 500)
	});
	if (events.length > MAX) events.splice(0, events.length - MAX);
	return Response.json({ ok: true });
}
var Route$5 = createFileRoute("/api/howler-trace")({ server: { handlers: {
	GET: handle$1,
	POST: handle$1
} } });
/**
* WebRTC signaling over the app database (Neon deployed, PGLite in preview).
* Only rendezvous traffic passes through here — roster + SDP/ICE relay while a
* mesh forms; game data then flows peer-to-peer.
*/
var ID = string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
var signalSchema = object({
	op: literal("signal"),
	room: ID,
	from: ID,
	to: ID,
	kind: _enum([
		"offer",
		"answer",
		"ice"
	]),
	payload: unknown().refine((v) => v !== void 0 && JSON.stringify(v).length <= 32768, { message: "payload too large" })
});
var leaveSchema = object({
	op: literal("leave"),
	room: ID,
	peer: ID
});
var postSchema = discriminatedUnion("op", [signalSchema, leaveSchema]);
var PEER_TTL_SECONDS = 30;
var SIGNAL_TTL_SECONDS = 60;
async function db() {
	const { getSql } = await import("./db-BLt1fCfV.mjs");
	return getSql();
}
var globalRef = globalThis;
function ensureSchema(sql) {
	globalRef.__rtcSchemaPromise__ ??= (async () => {
		await sql.query(`CREATE TABLE IF NOT EXISTS webrtc_peers (
         room TEXT NOT NULL,
         peer_id TEXT NOT NULL,
         name TEXT NOT NULL DEFAULT '',
         last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (room, peer_id)
       )`);
		await sql.query(`CREATE TABLE IF NOT EXISTS webrtc_signals (
         id BIGSERIAL PRIMARY KEY,
         room TEXT NOT NULL,
         to_peer TEXT NOT NULL,
         from_peer TEXT NOT NULL,
         kind TEXT NOT NULL,
         payload JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`);
		await sql.query(`CREATE INDEX IF NOT EXISTS webrtc_signals_inbox
         ON webrtc_signals (room, to_peer, id)`);
	})().catch((err) => {
		globalRef.__rtcSchemaPromise__ = void 0;
		throw err;
	});
	return globalRef.__rtcSchemaPromise__;
}
async function roster(sql, room) {
	return (await sql.query(`SELECT peer_id, name FROM webrtc_peers
     WHERE room = $1 AND last_seen > now() - make_interval(secs => $2)
     ORDER BY peer_id LIMIT 32`, [room, PEER_TTL_SECONDS])).map((r) => ({
		id: r.peer_id,
		name: r.name
	}));
}
async function touchPeer(sql, room, peer, name) {
	await sql.query(`INSERT INTO webrtc_peers (room, peer_id, name, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (room, peer_id)
     DO UPDATE SET last_seen = now(), name = EXCLUDED.name`, [
		room,
		peer,
		name
	]);
}
async function prune(sql) {
	await Promise.all([sql.query(`DELETE FROM webrtc_signals WHERE created_at < now() - make_interval(secs => $1)`, [SIGNAL_TTL_SECONDS]), sql.query(`DELETE FROM webrtc_peers WHERE last_seen < now() - make_interval(secs => $1)`, [PEER_TTL_SECONDS])]);
}
function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store"
		}
	});
}
async function handleGet(url) {
	const parsed = object({
		room: ID,
		peer: ID,
		name: string().max(64).default(""),
		since: number$1().int().min(0).default(0)
	}).safeParse({
		room: url.searchParams.get("room"),
		peer: url.searchParams.get("peer"),
		name: url.searchParams.get("name") ?? "",
		since: url.searchParams.get("since") ?? 0
	});
	if (!parsed.success) return json({ error: "invalid query" }, 400);
	const { room, peer, name, since } = parsed.data;
	const sql = await db();
	await ensureSchema(sql);
	if (since === 0 || Math.random() < .02) await prune(sql);
	await touchPeer(sql, room, peer, name);
	const rows = await sql.query(`SELECT id, from_peer, kind, payload FROM webrtc_signals
     WHERE room = $1 AND to_peer = $2 AND id > $3
     ORDER BY id LIMIT 200`, [
		room,
		peer,
		since
	]);
	return json({
		peers: await roster(sql, room),
		signals: rows.map((r) => ({
			id: r.id,
			from: r.from_peer,
			kind: r.kind,
			payload: r.payload
		}))
	});
}
async function handlePost(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "invalid JSON" }, 400);
	}
	const parsed = postSchema.safeParse(body);
	if (!parsed.success) return json({ error: "invalid request" }, 400);
	const msg = parsed.data;
	const sql = await db();
	await ensureSchema(sql);
	if (msg.op === "signal") await sql.query(`INSERT INTO webrtc_signals (room, to_peer, from_peer, kind, payload)
       VALUES ($1, $2, $3, $4, $5)`, [
		msg.room,
		msg.to,
		msg.from,
		msg.kind,
		JSON.stringify(msg.payload)
	]);
	else await sql.query(`DELETE FROM webrtc_peers WHERE room = $1 AND peer_id = $2`, [msg.room, msg.peer]);
	return json({ ok: true });
}
async function handleSignaling(request) {
	try {
		if (request.method === "GET") return await handleGet(new URL(request.url));
		if (request.method === "POST") return await handlePost(request);
		return json({ error: "method not allowed" }, 405);
	} catch (error) {
		console.error("[rtc] signaling error:", error);
		return json({ error: "signaling failed" }, 500);
	}
}
var handle = ({ request }) => handleSignaling(request);
var Route$4 = createFileRoute("/api/rtc")({ server: { handlers: {
	GET: handle,
	POST: handle
} } });
var MAX_BYTES = 35e5;
async function transcribe({ request }) {
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	if (rateLimited(`stt:${clientKey(request)}`, 20, 6e4)) return Response.json({
		ok: false,
		error: "Slow down."
	}, { status: 429 });
	if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return Response.json({
		ok: false,
		error: "Clip too long."
	}, { status: 413 });
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return Response.json({
		ok: false,
		error: "Voice is not available. Type the command."
	}, { status: 503 });
	const file = (await request.formData()).get("file");
	if (!(file instanceof Blob) || file.size < 800) return Response.json({
		ok: false,
		error: "No speech captured."
	});
	if (file.size > MAX_BYTES) return Response.json({
		ok: false,
		error: "Clip too long."
	});
	const name = file instanceof File && file.name ? file.name : "speech.webm";
	const type = file.type || "audio/webm";
	if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|mp3)|video\/webm/i.test(type) && !/\.(webm|ogg|wav|mp3|m4a)$/i.test(name)) return Response.json({
		ok: false,
		error: "That file is not speech audio."
	});
	const body = new FormData();
	body.append("language", "en");
	body.append("format", "true");
	body.append("keyterm", "Hey Howler McMillan DeBoard Ciurlizza Carver Pratt Stewart Swiderski");
	body.append("file", new File([file], "speech.webm", { type }));
	const res = await fetch("https://api.x.ai/v1/stt", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}` },
		body
	});
	if (!res.ok) return Response.json({
		ok: false,
		error: "Could not transcribe. Type the command."
	});
	const text = ((await res.json()).text ?? "").trim();
	if (!text) return Response.json({
		ok: false,
		error: "No words in that clip."
	});
	return Response.json({
		ok: true,
		text
	});
}
var Route$3 = createFileRoute("/api/transcribe")({ server: { handlers: { POST: transcribe } } });
var $$splitComponentImporter$2 = () => import("./draw._token-CcXej79b.mjs");
var Route$2 = createFileRoute("/draw/$token")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
var $$splitComponentImporter$1 = () => import("./projects._projectId.index-CsrE7qxa.mjs");
var Route$1 = createFileRoute("/projects/$projectId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/projects/$projectId/$moduleId",
			params: {
				projectId: params.projectId,
				moduleId: "overview"
			}
		});
	},
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
var $$splitComponentImporter = () => import("./projects._projectId._moduleId-K738oaoP.mjs");
var Route = createFileRoute("/projects/$projectId/$moduleId")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
var IndexRoute = Route$10.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$11
});
var HowlerMicRoute = Route$9.update({
	id: "/howler-mic",
	path: "/howler-mic",
	getParentRoute: () => Route$11
});
var ApiHowlerIntentRoute = Route$8.update({
	id: "/api/howler-intent",
	path: "/api/howler-intent",
	getParentRoute: () => Route$11
});
var ApiHowlerSpeakRoute = Route$7.update({
	id: "/api/howler-speak",
	path: "/api/howler-speak",
	getParentRoute: () => Route$11
});
var ApiHowlerStateRoute = Route$6.update({
	id: "/api/howler-state",
	path: "/api/howler-state",
	getParentRoute: () => Route$11
});
var ApiHowlerTraceRoute = Route$5.update({
	id: "/api/howler-trace",
	path: "/api/howler-trace",
	getParentRoute: () => Route$11
});
var ApiRtcRoute = Route$4.update({
	id: "/api/rtc",
	path: "/api/rtc",
	getParentRoute: () => Route$11
});
var ApiTranscribeRoute = Route$3.update({
	id: "/api/transcribe",
	path: "/api/transcribe",
	getParentRoute: () => Route$11
});
var DrawTokenRoute = Route$2.update({
	id: "/draw/$token",
	path: "/draw/$token",
	getParentRoute: () => Route$11
});
var ProjectsProjectIdIndexRoute = Route$1.update({
	id: "/projects/$projectId/",
	path: "/projects/$projectId/",
	getParentRoute: () => Route$11
});
var rootRouteChildren = {
	IndexRoute,
	HowlerMicRoute,
	ApiHowlerIntentRoute,
	ApiHowlerSpeakRoute,
	ApiHowlerStateRoute,
	ApiHowlerTraceRoute,
	ApiRtcRoute,
	ApiTranscribeRoute,
	DrawTokenRoute,
	ProjectsProjectIdModuleIdRoute: Route.update({
		id: "/projects/$projectId/$moduleId",
		path: "/projects/$projectId/$moduleId",
		getParentRoute: () => Route$11
	}),
	ProjectsProjectIdIndexRoute
};
var routeTree = Route$11._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { isLFootprint as $, provenanceSuffix as $t, cardGlance as A, previewIssueDrawingSet as At, ensureJob as B, previewSetBaseline as Bt, LIFECYCLE as C, previewAddPhoto as Ct, TRADEWALK as D, previewCreateChangeOrder as Dt, STATUS_LABEL as E, previewCoLifecycle as Et, describeEnvelope as F, previewPatchScope as Ft, formatCodeNote as G, previewSetPermit as Gt, financialSummary as H, previewSetDrawingStatus as Ht, designCriteria as I, previewRemoveOpening as It, framingTakeoff as J, previewUpsertOpening as Jt, formatFtIn as K, previewSuggestConventionalFraming as Kt, driveFileUrl as L, previewRemoveRoom as Lt, computeFindings as M, previewPatchBlueprint as Mt, computePlanFindings as N, previewPatchChangeOrder as Nt, UNMATCHED_DRIVE_PLANS as O, previewDrawWorkingSet as Ot, contractDates as P, previewPatchLine as Pt, interpretUpload as Q, proposedStairFromWalls as Qt, emptyJob as R, previewReplaceBlueprint as Rt, KY_STAIR as S, previewAddLine as St, PROVENANCE_LABEL as T, previewAdoptTradewalkSet as Tt, findingNextAction as U, previewSetEnvelopeProvenance as Ut, envelopeComplete as V, previewSetDrawingDatum as Vt, forecastActivity as W, previewSetInspection as Wt, integrity as X, priorityActions as Xt, heldPhasesOf as Y, previewUpsertRoom as Yt, interpretFinancial as Z, progressPercent as Zt, DATUM_LABEL as _, planParts as _t, HowlerSpeakPad as a, scopeStatus as an, liveFacts as at, JR_PROCESS_REFS as b, previewAddCategory as bt, useProject as c, stairLimitRows as cn, materialTakeoff as ct, isPhoneHowler as d, tabulatedJoistSpanIn as dn, nextMovement as dt, rafterLengthIn as en, jobBrief as et, CARVER_WORKING_PREVIEWS as f, unresolvedRegister as fn, openingLabel as ft, COMMAND_EXAMPLES as g, planLayout as gt, CODE_SHORT as h, pitchDegrees as ht, HowlerMic as i, scaleLabel as in, lineRevised as it, citesTradewalk as j, previewPatchActivity as jt, annotatePreview as k, previewInitialize as kt, KF_SOURCE as l, stations as ln, memberCount as lt, CODE_BASIS as m, zero as mn, parseMoneyDecimal as mt, Route as n, ridgeHeightIn as nn, lineActual as nt, useHowlerEar as o, sharePacketLines as on, livesIn as ot, CODE_ADOPTION as p, wallThicknessIn as pn, openingSchedule as pt, formatMoney as q, previewUpsertContact as qt, Route$2 as r, ridgeRiseIn as rn, lineCommitted as rt, useHowlerStore as s, sheetKeynotes as sn, lumberThicknessIn as st, router_exports as t, resolveOpenings as tn, joistSpanIn as tt, placeLine as u, submittalChecklist as un, memorySummary as ut, DEBOARD_WORKING_PREVIEWS as v, plansStatusLine as vt, PERMIT_LABEL as w, previewAddScope as wt, KY_COUNTIES as x, previewAddCommitment as xt, INSPECTION_STATUSES as y, previewAddActual as yt, engineerRequired as z, previewRoomsFromScope as zt };
