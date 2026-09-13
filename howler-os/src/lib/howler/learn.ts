/**
 * Howler learns where a budget line lives: trade, vendor, selection, schedule.
 * It does not invent a vendor or a date. Conflicts stay visible.
 */
import type { BudgetLine, Project } from "./types";

const CODE_TRADE: { prefix: string; trade: string }[] = [
  { prefix: "01", trade: "General" },
  { prefix: "02", trade: "Sitework" },
  { prefix: "03", trade: "Concrete" },
  { prefix: "04.21", trade: "Masonry" },
  { prefix: "04.22", trade: "Concrete" },
  { prefix: "04", trade: "Masonry" },
  { prefix: "06", trade: "Framing" },
  { prefix: "07.21", trade: "Insulation" },
  { prefix: "07.3", trade: "Roofing" },
  { prefix: "07.6", trade: "Gutters" },
  { prefix: "07", trade: "Roofing" },
  { prefix: "08.3", trade: "Overhead doors" },
  { prefix: "08", trade: "Openings" },
  { prefix: "09.25", trade: "Drywall" },
  { prefix: "09.5", trade: "Flooring" },
  { prefix: "09.9", trade: "Painting" },
  { prefix: "09", trade: "Finishes" },
  { prefix: "12", trade: "Cabinetry" },
  { prefix: "15.4", trade: "Plumbing" },
  { prefix: "15.5", trade: "HVAC" },
  { prefix: "15", trade: "MEP" },
  { prefix: "16", trade: "Electrical" },
];

const VENDOR_ALIASES: Record<string, string> = {
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
  "mike g": "Mike Gonzalez",
};

export function tradeFromCostCode(code: string | null): string | null {
  if (!code) return null;
  const hit = CODE_TRADE.find((row) => code.startsWith(row.prefix));
  return hit?.trade ?? null;
}

export function canonicalVendor(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return VENDOR_ALIASES[key] ?? name.trim();
}

export function activityForBudgetTrade(project: Project, trade: string | null) {
  if (!trade) return null;
  const needle = trade.toLowerCase();
  const rows = Object.values(project.activities);
  return (
    rows.find((item) => item.trade && item.trade.toLowerCase() === needle) ??
    rows.find((item) => item.name.toLowerCase().includes(needle)) ??
    null
  );
}

export interface LinePlacement {
  trade: string | null;
  vendor: string | null;
  activityId: string | null;
  activityName: string | null;
  conflict: string | null;
}

export function placeLine(project: Project, line: BudgetLine): LinePlacement {
  const trade = line.trade ?? tradeFromCostCode(line.costCode);
  const vendor = canonicalVendor(line.vendorRef);
  const activity = line.activityId
    ? project.activities[line.activityId] ?? null
    : activityForBudgetTrade(project, trade);
  let conflict: string | null = null;
  if (vendor && activity?.notes && /john marr/i.test(activity.notes) && /stanfield/i.test(vendor)) {
    conflict = "Tracker SELECTED David Stanfield for framing labor. Field schedule is John Marr. Howler will not pick a winner.";
  }
  if (vendor && /sam/i.test(vendor) && /22,?500|25500|26,?200/.test(line.notes ?? "")) {
    conflict = "Sam’s number disagrees across sheets. Tracker package $26,200 is the selected comparison.";
  }
  return {
    trade,
    vendor,
    activityId: activity?.id ?? null,
    activityName: activity?.name ?? null,
    conflict,
  };
}

export function placementIndex(project: Project): LinePlacement[] {
  if (!project.financials) return [];
  return Object.values(project.financials.lines)
    .filter((line) => line.active)
    .map((line) => placeLine(project, line));
}
