/**
 * Field job book — inspections, trades, materials, photos, selections.
 * Derived from the same project truth as Plans. Howler will not invent a pass.
 */
import { framingTakeoff } from "./layout";
import { DEBOARD_RULES } from "./sow";
import { citesTradewalk, TRADEWALK } from "./tradewalk";
import type {
  Contact,
  Inspection,
  InspectionStatus,
  JobBook,
  PermitStatus,
  Project,
  SelectionItem,
} from "./types";
import { ensureBlueprint } from "./types";

export const INSPECTION_STATUSES: { id: InspectionStatus; label: string }[] = [
  { id: "NOT_READY", label: "Not ready" },
  { id: "READY", label: "Ready to call" },
  { id: "SCHEDULED", label: "Scheduled" },
  { id: "PASSED", label: "Passed" },
  { id: "FAILED", label: "Failed" },
];

export function emptyJob(): JobBook {
  return {
    permitStatus: "NOT_FILED",
    permitNumber: null,
    inspections: Object.fromEntries(defaultInspections().map((item) => [item.id, item])),
    contacts: {},
    selections: {},
    photos: {},
    rules: [],
  };
}

export function defaultInspections(): Inspection[] {
  return [
    { id: "insp-footing", name: "Footing", code: "R403", status: "NOT_READY", date: null, notes: "Before placing concrete." },
    { id: "insp-foundation", name: "Foundation / slab", code: "R506 / R309.1", status: "NOT_READY", date: null, notes: "Slope to door or drain. Air-entrain (Severe)." },
    { id: "insp-framing", name: "Framing", code: "R602 / R502 / R802", status: "NOT_READY", date: null, notes: "OHD headers wait on leaf width. Stair run Unknown." },
    { id: "insp-rough-e", name: "Rough electrical", code: "E3901 / E3902", status: "NOT_READY", date: null, notes: "GFCI, 20A garage circuit. Panel location Unknown." },
    { id: "insp-rough-p", name: "Rough plumbing", code: "P2601", status: "NOT_READY", date: null, notes: "Half bath is an option — skip if out." },
    { id: "insp-insulation", name: "Insulation / energy", code: "N1102", status: "NOT_READY", date: null, notes: "R-values on A06 are mins, not a REScheck." },
    { id: "insp-final", name: "Final", code: "R110", status: "NOT_READY", date: null, notes: "AHJ card. Not a PE stamp." },
  ];
}

export function ensureJob(project: Project): JobBook {
  const base = project.job ?? emptyJob();
  const inspections = { ...Object.fromEntries(defaultInspections().map((item) => [item.id, item])), ...base.inspections };
  return {
    permitStatus: base.permitStatus ?? "NOT_FILED",
    permitNumber: base.permitNumber ?? null,
    inspections,
    contacts: base.contacts ?? {},
    selections: base.selections ?? {},
    photos: base.photos ?? {},
    rules: base.rules ?? [],
  };
}

export function deboardJob(): JobBook {
  const inspections = Object.fromEntries(defaultInspections().map((item) => [item.id, item]));
  inspections["insp-footing"] = {
    ...inspections["insp-footing"]!,
    status: "READY",
    notes: "Footer activity is complete. Card not recorded — not marked passed.",
  };
  const contacts: Record<string, Contact> = {
    "ct-marr": {
      id: "ct-marr",
      name: "John Marr",
      trade: "Framing",
      phone: "813-477-7007",
      notes: "Custom Home Expert LLC. Field schedule after Sam. Tracker also lists David Stanfield as SELECTED framing labor.",
    },
    "ct-bonham": {
      id: "ct-bonham",
      name: "Jason Bonham",
      trade: "Electrical",
      phone: null,
      notes: "Forecast $15,000 electrical. Tracker 16.010 still says Elliot pending.",
    },
    "ct-sam": {
      id: "ct-sam",
      name: "Sam the Concrete Man",
      trade: "Concrete",
      phone: "859-539-6809",
      notes: "Samuel Haralu. Selected package $26,200.",
    },
    "ct-medyna": {
      id: "ct-medyna",
      name: "Medyna Plumbing",
      trade: "Plumbing",
      phone: "859-576-8680",
      notes: "Estimate #230 at $7,800. Alex Medyna.",
    },
    "ct-antle": {
      id: "ct-antle",
      name: "Antle Drywall",
      trade: "Drywall",
      phone: "859-326-1183",
      notes: "Timothy Antle. Tracker $6,800 / forecast $7,500.",
    },
    "ct-jasper": {
      id: "ct-jasper",
      name: "Dylan Jasper",
      trade: "Painting",
      phone: null,
      notes: "Agreed labor $4,000.",
    },
    "ct-parker": {
      id: "ct-parker",
      name: "Anthony Parker",
      trade: "HVAC",
      phone: "859-771-4613",
      notes: "Parkers Heating and Cooling. Forecast $7,366 vs tracker $5,250.",
    },
    "ct-stanfield": {
      id: "ct-stanfield",
      name: "David Stanfield",
      trade: "Framing",
      phone: "859-241-7059",
      notes: "Tracker SELECTED $13,500.72 framing labor. Field is John Marr.",
    },
    "ct-bldr": {
      id: "ct-bldr",
      name: "Builders First Choice",
      trade: "Materials",
      phone: "502-735-5703",
      notes: "Collin Veley. Quote SO 88750150 expired.",
    },
  };
  const selections: Record<string, SelectionItem> = {
    "sel-brick": {
      id: "sel-brick",
      name: "Brick veneer",
      value: "Match existing house",
      status: "MATCH_EXISTING",
      notes: "Soldier course, quoins, eave return — A04.",
    },
    "sel-ohd": {
      id: "sel-ohd",
      name: "Overhead doors",
      value: null,
      status: "UNKNOWN",
      notes: "Two openers on A09. Leaf widths Unknown.",
    },
    "sel-bath": {
      id: "sel-bath",
      name: "Half bath",
      value: null,
      status: "UNKNOWN",
      notes: "Option on A11. In or out not decided.",
    },
    "sel-sb3621": {
      id: "sel-sb3621",
      name: "SB3621 windows",
      value: "3'-6\" × 2'-1\" (tag)",
      status: "UNKNOWN",
      notes: "Operation SB and wall Unknown. Not Simpson SSTB36.",
    },
  };
  return {
    permitStatus: "NOT_FILED",
    permitNumber: null,
    inspections,
    contacts,
    selections,
    photos: {},
    rules: DEBOARD_RULES,
  };
}

export interface MaterialLine {
  id: string;
  trade: string;
  item: string;
  qty: string;
  status: "FROM_MODEL" | "UNKNOWN";
  notes: string;
}

export function materialTakeoff(project: Project): MaterialLine[] {
  const bp = ensureBlueprint(project);
  const lines: MaterialLine[] = framingTakeoff(bp).map((line) => ({
    id: line.id,
    trade: "Framing",
    item: line.label,
    qty: line.count == null ? "Unknown" : `${line.count} × ${line.size} @ ${line.lengthEach}`,
    status: line.count == null ? "UNKNOWN" : "FROM_MODEL",
    notes: line.notes,
  }));
  if (citesTradewalk(bp)) {
    for (const lvl of TRADEWALK.lvls.slice(0, 3)) {
      lines.push({
        id: `lvl-${lvl.slice(0, 2)}`,
        trade: "Framing",
        item: lvl.split("—")[0]?.trim() ?? lvl,
        qty: "See Deboard Calcs",
        status: "FROM_MODEL",
        notes: "Murphy LVL PASSED. Not a Howler stamp.",
      });
    }
  }
  if (!bp.openings.some((item) => item.kind === "OHD") && bp.overheadDoorWidthIn == null) {
    lines.push({
      id: "mat-ohd",
      trade: "Doors",
      item: "Overhead door leaves",
      qty: "Unknown",
      status: "UNKNOWN",
      notes: "Double + single. Howler will not invent 16'-0\".",
    });
  }
  lines.push({
    id: "mat-stair",
    trade: "Framing",
    item: "Stair stringers",
    qty: "Unknown",
    status: "UNKNOWN",
    notes: "KY 8¼\" max riser / 9\" min tread. Run not placed.",
  });
  return lines;
}

export const PERMIT_LABEL: Record<PermitStatus, string> = {
  NOT_FILED: "Not filed",
  SUBMITTED: "Submitted",
  ISSUED: "Issued",
};
