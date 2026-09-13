/**
 * Real client money. Transcribed from:
 * - Deboard Trade Budget & Estimate Tracker (Drive, Aug 14, 2026)
 * - Project Deposit & Expense Forecast (Drive, Sep 9, 2026)
 *
 * Howler will not invent a missing client budget. Pratt / Carver / Swiderski /
 * Stewart stay Unknown. Package rows are not added to component rows.
 */
import { money, type Money } from "./money";
import { canonicalVendor, tradeFromCostCode } from "./learn";
import type { ActualCost, BudgetLine, Commitment, Financials } from "./types";

function usd(dollars: number): Money {
  return money(Math.round(dollars * 100));
}

function catFromCode(code: string) {
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

const DEBOARD_CATS: Financials["categories"] = {
  "cat-gc": { id: "cat-gc", name: "General Conditions", isDefault: true, active: true, sortOrder: 1, notes: null },
  "cat-site": { id: "cat-site", name: "Sitework", isDefault: true, active: true, sortOrder: 2, notes: null },
  "cat-concrete": { id: "cat-concrete", name: "Concrete", isDefault: true, active: true, sortOrder: 3, notes: null },
  "cat-masonry": { id: "cat-masonry", name: "Masonry", isDefault: true, active: true, sortOrder: 4, notes: null },
  "cat-framing": { id: "cat-framing", name: "Framing / millwork", isDefault: true, active: true, sortOrder: 5, notes: null },
  "cat-roof": { id: "cat-roof", name: "Roof / insulation / gutters", isDefault: true, active: true, sortOrder: 6, notes: null },
  "cat-openings": { id: "cat-openings", name: "Doors / windows / OHD", isDefault: true, active: true, sortOrder: 7, notes: null },
  "cat-drywall": { id: "cat-drywall", name: "Drywall", isDefault: true, active: true, sortOrder: 8, notes: null },
  "cat-floor": { id: "cat-floor", name: "Flooring", isDefault: true, active: true, sortOrder: 9, notes: null },
  "cat-paint": { id: "cat-paint", name: "Paint", isDefault: true, active: true, sortOrder: 10, notes: null },
  "cat-cabinets": { id: "cat-cabinets", name: "Cabinets / tops", isDefault: true, active: true, sortOrder: 11, notes: null },
  "cat-plumb": { id: "cat-plumb", name: "Plumbing", isDefault: true, active: true, sortOrder: 12, notes: null },
  "cat-hvac": { id: "cat-hvac", name: "HVAC", isDefault: true, active: true, sortOrder: 13, notes: null },
  "cat-elec": { id: "cat-elec", name: "Electrical", isDefault: true, active: true, sortOrder: 14, notes: null },
};

type Raw = {
  code: string;
  scope: string;
  budget: number;
  vendor?: string | null;
  activity?: string | null;
  result: string;
  notes: string;
  allowance?: boolean;
};

const DEBOARD_LINES: Raw[] = [
  { code: "01.040", scope: "Design services", budget: 2150, vendor: "Posted actual", result: "OVER", notes: "Actual $2,846.76 posted in workbook. $696.76 over." },
  { code: "01.060", scope: "Permits", budget: 500, result: "OVER", notes: "Reference $750. No current estimate." },
  { code: "01.300", scope: "Outsourced design / photo", budget: 50, result: "NONE", notes: "No estimate." },
  { code: "01.400", scope: "Production wages", budget: 8600, result: "NONE", notes: "No separate estimate." },
  { code: "01.500", scope: "Rental equipment", budget: 1334, result: "NONE", notes: "Dumpster $750; porta john $584. No vendor quote." },
  { code: "01.700", scope: "Completion materials", budget: 2120, result: "NONE", notes: "Closeout list / cleaning / management. No estimate." },
  { code: "02.050", scope: "Demolition / setup materials", budget: 200, result: "WITHIN", notes: "Reference $0." },
  { code: "02.201", scope: "Earthwork labor", budget: 4150, vendor: "Sam the Concrete Man", activity: "act-concrete", result: "AT", notes: "Component of Sam $26,200 package. Do not add to package." },
  { code: "02.281", scope: "Termite treatment", budget: 750, result: "NONE", notes: "No estimate." },
  { code: "02.900", scope: "Landscape materials", budget: 4350, result: "NONE", notes: "Excavation allowance $3,000 + sod $1,350. Keep off Sam package until exclusions confirmed." },
  { code: "03.111", scope: "Flatwork material and labor", budget: 12000, vendor: "Sam the Concrete Man", activity: "act-concrete", result: "AT", notes: "Component of Sam package. Do not add to package." },
  { code: "04.210", scope: "Brick materials", budget: 9000, vendor: "Lee Building Products", activity: "act-block", result: "OVER", notes: "Quote #148635 $12,409.21 incl. tax. Expired. Refresh before award." },
  { code: "04.211", scope: "Brick labor", budget: 12000, vendor: "Estudillo Masonry", activity: "act-block", result: "NONE", notes: "Tracker: no masonry labor allocation in Sam package. Forecast lists Estudio LLC $12,000." },
  { code: "04.220", scope: "Concrete materials", budget: 4500, vendor: "Builders First Choice", activity: "act-concrete", result: "WITHIN", notes: "Slab pack $953.89 with tax. Reference-only unless Sam exclusions confirmed." },
  { code: "04.221", scope: "Concrete labor", budget: 1800, vendor: "Sam the Concrete Man", activity: "act-concrete", result: "OVER", notes: "Component reference $2,200. Package $26,200 controls." },
  { code: "06.050", scope: "Fasteners & adhesives", budget: 150, vendor: "Builders First Choice", activity: "act-framing", result: "OVER", notes: "$1,119.08 with tax. $969.08 over allowance." },
  { code: "06.101", scope: "Framing labor", budget: 13900, vendor: "David Stanfield", activity: "act-framing", result: "OVER", notes: "Tracker SELECTED Stanfield $13,500.72. John Marr alternate $14,000. Field schedule is John Marr — conflict stands." },
  { code: "06.110", scope: "Lumber package", budget: 12264.72, vendor: "Builders First Choice", activity: "act-framing", result: "WITHIN", notes: "$10,139.82 with tax. $2,124.90 within. Quote expired." },
  { code: "06.210", scope: "Finish trim materials", budget: 1000, vendor: "Builders First Choice", result: "WITHIN", notes: "Base and shoe $441.64 with tax. Partial." },
  { code: "06.221", scope: "Finish carpentry labor", budget: 1500, vendor: "John Marr", result: "WITHIN", notes: "John Marr interior trim $1,200. Excludes stair, shelving, paint, caulk." },
  { code: "06.301", scope: "Trim labor", budget: 3500, vendor: "John Marr", result: "NONE", notes: "John Marr openings/doors $1,375 provisionally mapped. Confirm coding." },
  { code: "07.211", scope: "Insulation", budget: 4500, vendor: "31-W", result: "NONE", notes: "31-W response pending." },
  { code: "07.310", scope: "Shingle material", budget: 2796.56, vendor: "Builders First Choice", activity: "act-roof", result: "OVER", notes: "$2,936.45 with tax. $139.89 over. Quote expired." },
  { code: "07.311", scope: "Shingle labor", budget: 1750, vendor: "Jonny / The Gutterist", activity: "act-roof", result: "AT", notes: "Jonny. At budget." },
  { code: "07.611", scope: "Gutters", budget: 1547, vendor: "Jonny / The Gutterist", activity: "act-roof", result: "AT", notes: "Jonny. At budget." },
  { code: "08.200", scope: "Door materials", budget: 950, vendor: "Builders First Choice", result: "OVER", notes: "$1,064.22 with tax. Locksets excluded." },
  { code: "08.300", scope: "Overhead doors / openers", budget: 4000, activity: "act-framing", result: "NONE", notes: "No estimate. John Marr excludes OHD." },
  { code: "08.610", scope: "Window materials", budget: 1750, vendor: "Builders First Choice", result: "WITHIN", notes: "Two windows + flashing $878.73. Verify opening counts vs Tradewalk SB3621." },
  { code: "08.710", scope: "Finish hardware", budget: 135, result: "NONE", notes: "Cabinet pulls $30; interior locksets $105." },
  { code: "08.810", scope: "Bathroom mirror", budget: 450, result: "NONE", notes: "No estimate." },
  { code: "09.251", scope: "Drywall labor", budget: 7500, vendor: "Antle Drywall", result: "WITHIN", notes: "Tracker $6,800. Forecast $7,500. Howler keeps both visible." },
  { code: "09.500", scope: "LVT/LVP material allowance", budget: 3600, allowance: true, result: "NONE", notes: "No material quote." },
  { code: "09.501", scope: "Flooring labor", budget: 1350, vendor: "John Marr", result: "OVER", notes: "John Marr 900 SF at $3/SF = $2,700. $1,350 over. Verify area." },
  { code: "09.900", scope: "Paint material allowance", budget: 1260, allowance: true, result: "NONE", notes: "Source mixes labor and material." },
  { code: "09.901", scope: "Painting labor", budget: 3845, vendor: "Dylan Jasper", result: "OVER", notes: "Agreed labor $4,000. $155 over." },
  { code: "12.300", scope: "Custom cabinets", budget: 750, activity: "act-cabinetry", allowance: true, result: "NONE", notes: "No estimate." },
  { code: "12.400", scope: "Bathroom countertop allowance", budget: 900, allowance: true, result: "NONE", notes: "No estimate." },
  { code: "15.400", scope: "Plumbing fixtures", budget: 1400, activity: "act-mech", allowance: true, result: "NONE", notes: "Medyna excludes finishing fixtures." },
  { code: "15.401", scope: "Plumbing labor", budget: 7800, vendor: "Medyna Plumbing", activity: "act-mech", result: "AT", notes: "Estimate #230 at budget. Includes 6-gal WH. Excludes fixtures/valves." },
  { code: "15.501", scope: "HVAC labor", budget: 5250, vendor: "Anthony Parker", activity: "act-mech", result: "NONE", notes: "Tracker: Elliot pending. Forecast: Anthony Parker $7,366. Conflict stands." },
  { code: "16.010", scope: "Electrical labor", budget: 15380, vendor: "Jason Bonham", activity: "act-mech", result: "NONE", notes: "Tracker: Elliot pending. Forecast: Jason Bonham $15,000." },
  { code: "16.020", scope: "Electrical materials", budget: 2820, activity: "act-mech", result: "NONE", notes: "Can-lights $520; fan $1,000; exhaust $300; sconces $1,000." },
];

function lineFromRaw(row: Raw): BudgetLine {
  const id = `line-${row.code.replace(".", "-")}`;
  return {
    id,
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
    active: true,
  };
}

function commitment(id: string, dollars: number, lineId: string, vendor: string, activityId: string | null, notes: string): Commitment {
  const amount = usd(dollars);
  return {
    id,
    amount,
    allocations: [{ budgetLineId: lineId, amount }],
    vendorRef: vendor,
    activityId,
    scopeItemIds: [],
    reference: null,
    status: "ACTIVE",
    notes,
  };
}

export function deboardFinancials(): Financials {
  const lines = Object.fromEntries(DEBOARD_LINES.map((row) => {
    const line = lineFromRaw(row);
    return [line.id, line];
  }));
  const actuals: Record<string, ActualCost> = {
    "actc-design": {
      id: "actc-design",
      amount: usd(2846.76),
      date: "2026-08-06",
      description: "Design time posted in budget workbook",
      budgetLineId: "line-01-040",
      commitmentId: null,
      reference: "Workbook actual",
      status: "RECORDED",
      notes: "Tracker: actual posted, not a vendor estimate.",
    },
  };
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
      "cmt-jasper": commitment("cmt-jasper", 4000, "line-09-901", "Dylan Jasper", null, "Agreed painting labor $4,000."),
      "cmt-floors": commitment("cmt-floors", 2700, "line-09-501", "John Marr", null, "900 SF at $3/SF. Over the $1,350 labor budget."),
      "cmt-lee": commitment("cmt-lee", 12409.21, "line-04-210", "Lee Building Products", "act-block", "Quote expired. Refresh before award."),
      "cmt-shingles": commitment("cmt-shingles", 2936.45, "line-07-310", "Builders First Choice", "act-roof", "Expired quote. $139.89 over."),
    },
    actualCosts: actuals,
    changeOrders: {},
  };
}

export const DEBOARD_SELL_PRICE = usd(256606.04);

function forecastFinancials(
  baseline: number,
  rows: { id: string; scope: string; vendor: string; dollars: number | null; trade: string; activityId?: string | null; deposit?: number; notes: string }[],
): Financials {
  const categories: Financials["categories"] = {};
  const lines: Financials["lines"] = {};
  const commitments: Financials["commitments"] = {};
  rows.forEach((row, index) => {
    const catId = `cat-${row.trade.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    if (!categories[catId]) {
      categories[catId] = { id: catId, name: row.trade, isDefault: true, active: true, sortOrder: index + 1, notes: "From deposit forecast — not a CoConstruct cost-code budget." };
    }
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
      active: true,
    };
    if (row.dollars != null && row.deposit && row.deposit > 0) {
      commitments[`cmt-${row.id}`] = commitment(`cmt-${row.id}`, row.dollars, row.id, canonicalVendor(row.vendor) ?? row.vendor, row.activityId ?? null, `Forecast total. Deposit listed $${row.deposit.toLocaleString("en-US")} — deposit is not spend.`);
    }
  });
  return {
    currency: "USD",
    baseline: usd(baseline),
    categories,
    lines,
    commitments,
    actualCosts: {},
    changeOrders: {},
  };
}

export function ciurlizzaFinancials(): Financials {
  return forecastFinancials(81887, [
    { id: "line-floor", scope: "Flooring", vendor: "Bill Moore", dollars: 15140, trade: "Flooring", deposit: 4542, notes: "Deposit $4,542 on forecast." },
    { id: "line-drywall", scope: "Drywall", vendor: "Antle Drywall", dollars: 6800, trade: "Drywall", activityId: "act-antle", deposit: 3400, notes: "Install Mon Sep 21 if county clears." },
    { id: "line-elec", scope: "Electrical", vendor: "Whalen Electrical", dollars: 24846, trade: "Electrical", notes: "No deposit listed." },
    { id: "line-plumb", scope: "Plumbing", vendor: "Medyna Plumbing", dollars: 17900, trade: "Plumbing", notes: "No deposit listed." },
    { id: "line-hvac", scope: "HVAC", vendor: "Anthony Parker", dollars: 5620, trade: "HVAC", notes: "No deposit listed." },
    { id: "line-carpet", scope: "Carpet", vendor: "Carpet One", dollars: 8829, trade: "Flooring", notes: "No deposit listed." },
    { id: "line-insul", scope: "Insulation", vendor: "31-W", dollars: 1830, trade: "Insulation", activityId: "act-firestop", notes: "Fire stop Tue Sep 15." },
    { id: "line-paint", scope: "Paint", vendor: "Client", dollars: null, trade: "Painting", notes: "Forecast wrote a dash. Amount Unknown, not $0." },
    { id: "line-frame", scope: "Framing", vendor: "Mike Gonzalez", dollars: null, trade: "Framing", notes: "Mike G named. Amount blank on the forecast." },
    { id: "line-spindles", scope: "Stair spindles", vendor: "Unknown", dollars: 922, trade: "Finish carpentry", notes: "Vendor blank on forecast." },
  ]);
}

export function mcmillanFinancials(): Financials {
  const fin = forecastFinancials(20805, [
    { id: "line-elec", scope: "Electrical", vendor: "Elliot / DHEC", dollars: 4800, trade: "Electrical", notes: "Forecast contractor total." },
    { id: "line-plumb", scope: "Plumbing", vendor: "Elliot / DHEC", dollars: 4800, trade: "Plumbing", notes: "Forecast contractor total." },
    { id: "line-fixtures", scope: "Plumbing fixtures", vendor: "Winnelson", dollars: 1056, trade: "Plumbing", notes: "Vendor sheet." },
    { id: "line-granite", scope: "Granite", vendor: "Artistic", dollars: 3324, trade: "Surfaces", notes: "Vendor sheet." },
    { id: "line-tile", scope: "Tile / waterproofing", vendor: "Floor & Decor", dollars: 5450, trade: "Tile", notes: "Vendor sheet." },
    { id: "line-glass", scope: "Glass", vendor: "Gatsby Glass", dollars: 1375, trade: "Glass", notes: "Vendor sheet." },
  ]);
  fin.changeOrders["co-bonham"] = {
    id: "co-bonham",
    number: "CO-001",
    title: "Bonham Electric circuit separation",
    description: "Light-pole and water-heater shared-circuit correction — code compliance.",
    reason: "KF Live PM dashboard commercial signal. Exterior closeout.",
    status: "PROPOSED",
    cost: usd(600),
    allocations: [{ budgetLineId: "line-elec", amount: usd(600) }],
    declaredScheduleDays: null,
    scopeItemIds: ["scp-elec"],
    activityIds: ["act-elec"],
    categoryId: null,
    clientApproval: null,
    requestedAt: "2026-09-03",
    proposedAt: "2026-09-03",
    approvedAt: null,
    rejectedAt: null,
    notes: "Proposed, not approved. Revised stays $20,805.00 until you approve.",
  };
  return fin;
}
