/**
 * Associative code notes for contractor layout.
 * Citations are 2018 Kentucky Residential Code (815 KAR 7:125), which adopts
 * the 2015 IRC with Kentucky amendments. Howler cites the section a callout
 * satisfies — it does not stamp the set (KRS 322 / R106.1).
 *
 * Unknown stays Unknown. A typical value is not a field measurement.
 */
import type { Blueprint, Project, SheetId } from "./types";
import { countyCriteria } from "./ky-code";
import { envelopeComplete, formatFtIn, unresolvedRegister } from "./layout";
import { citesTradewalk, TRADEWALK } from "./tradewalk";
import { proposedStairFromWalls } from "./ky-stairs";

export const CODE_BASIS = "2018 Kentucky Residential Code (based on 2015 IRC)";
export const CODE_ADOPTION = "815 KAR 7:125";
export const CODE_SHORT = "2018 KRC (2015 IRC)";

export type NoteHonesty = "APPLIES" | "CHECK" | "UNKNOWN";
export type SubmittalStatus = "ON_SET" | "PARTIAL" | "MISSING" | "NA";

export interface CodeNote {
  id: string;
  text: string;
  code: string | null;
  honesty: NoteHonesty;
}

export interface CriteriaRow {
  label: string;
  value: string;
  code: string;
}

export interface SubmittalItem {
  id: string;
  code: string;
  title: string;
  status: SubmittalStatus;
  note: string;
}

export function formatCodeNote(note: CodeNote): string {
  return note.code ? `${note.text} · ${note.code}` : note.text;
}

export function designCriteria(bp: Blueprint): CriteriaRow[] {
  const county = bp.county ? countyCriteria(bp.county) : null;
  const snow =
    bp.groundSnowLoadPsf != null
      ? `${bp.groundSnowLoadPsf} psf${county ? ` (${county.name} Co.)` : ""}`
      : "Unknown — county not recorded";
  const frost =
    bp.frostDepthIn != null ? `${bp.frostDepthIn}"` : "Unknown — not assumed";
  const occupancy = bp.occupancy
    ? bp.occupancy === "GARAGE_WITH_HABITABLE"
      ? "Garage + habitable above"
      : bp.occupancy === "DETACHED_GARAGE"
        ? "Detached garage"
        : bp.occupancy
    : "Unknown";
  return [
    { label: "CODE", value: CODE_SHORT, code: CODE_ADOPTION },
    {
      label: "AHJ",
      value: bp.county ? `${bp.county} Co., KY` : "KY — county Unknown",
      code: "KRS 198B.060",
    },
    { label: "SNOW", value: snow, code: "Table R301.2(1)" },
    { label: "WIND", value: `${bp.windSpeedMph} mph Vult`, code: "Table R301.2(1)" },
    { label: "WEATH", value: "Severe — air-entrain", code: "Table R402.2" },
    { label: "FROST", value: frost, code: "R403.1.4" },
    { label: "OCC", value: occupancy, code: "R101 / R309" },
    {
      label: "PREP",
      value: "Working drawings — not sealed",
      code: "R106.1 / KRS 322",
    },
  ];
}

export function codeBasisSummary(bp: Blueprint): string {
  const county = bp.county ? countyCriteria(bp.county) : null;
  const snow =
    bp.groundSnowLoadPsf != null
      ? `${bp.groundSnowLoadPsf} psf ground snow`
      : "snow Unknown until a county is entered";
  const where = county ? `${county.name} County` : "Kentucky (county Unknown)";
  return [
    `Code basis: ${CODE_BASIS}, adopted by ${CODE_ADOPTION}.`,
    `${where}: ${snow}; wind ${bp.windSpeedMph} mph Vult; weathering Severe (Table R301.2(1)).`,
    "Callouts on A01–A11 cite the section they satisfy — GFCI is E3902.2, garage/habitable ceiling is R302.6, stairs are KRC R311.7 (8¼\" max riser / 9\" min tread — not vanilla IRC 7¾ / 10).",
    "This is not a PE-stamped permit package (KRS 322 / R106.1). The AHJ decides what must be engineered.",
    bp.frostDepthIn == null
      ? "Frost depth stays Unknown (R403.1.4). Howler will not assume 24 in."
      : `Frost depth recorded as ${bp.frostDepthIn} in (R403.1.4).`,
  ].join(" ");
}

export function sheetKeynotes(bp: Blueprint, sheet: SheetId): CodeNote[] {
  const trade = citesTradewalk(bp);
  const garage = bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE";
  const habitableAbove = bp.occupancy === "GARAGE_WITH_HABITABLE";
  const stairUnknown = Object.values(bp.rooms).some(
    (room) => /stair/i.test(room.name) && (room.widthIn == null || room.depthIn == null),
  );

  switch (sheet) {
    case "L1":
      return trade
        ? [
            { id: "l-shape", text: "L-shape from A01 — not a 24×32 box", code: null, honesty: "APPLIES" },
            {
              id: "shed",
              text: `Shed ${formatFtIn(TRADEWALK.shedWidthIn)} × ${formatFtIn(TRADEWALK.shedDepthIn)}`,
              code: null,
              honesty: "APPLIES",
            },
            {
              id: "ohd",
              text: "Two OHD (A09) — leaf widths Unknown. Header waits",
              code: "R602.7",
              honesty: "UNKNOWN",
            },
            { id: "man", text: "Man doors tagged 2868 — see schedule", code: null, honesty: "APPLIES" },
            {
              id: "r3025",
              text: "Door to dwelling: 1-3/8\" solid or 20-min",
              code: "R302.5.1",
              honesty: "CHECK",
            },
            { id: "win", text: "Windows tagged 2840DH — see schedule", code: null, honesty: "APPLIES" },
            {
              id: "sb3621",
              text: "SB3621 ×2 = 3'-6\"×2'-1\" window. Wall Unknown. Not Simpson",
              code: "A01 tag",
              honesty: "CHECK",
            },
            {
              id: "stair",
              text: stairUnknown
                ? "STAIRWELL named — run Unknown. KY 36\" / 8¼\" / 9\""
                : "Stair layout recorded",
              code: "R311.7 KY",
              honesty: stairUnknown ? "UNKNOWN" : "CHECK",
            },
            {
              id: "r3026",
              text: habitableAbove
                ? "5/8\" Type X on garage ceiling (habitable above)"
                : "Garage/habitable separation",
              code: "R302.6",
              honesty: habitableAbove ? "APPLIES" : "CHECK",
            },
          ]
        : [
            {
              id: "env",
              text: envelopeComplete(bp)
                ? `Envelope ${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}`
                : "Envelope Unknown — Howler will not invent a size",
              code: "R106.1.1",
              honesty: envelopeComplete(bp) ? "CHECK" : "UNKNOWN",
            },
            {
              id: "r3026",
              text: habitableAbove
                ? "5/8\" Type X on garage ceiling (habitable above)"
                : "Confirm occupancy before fire-separation callouts",
              code: habitableAbove ? "R302.6" : "R309",
              honesty: habitableAbove ? "APPLIES" : "UNKNOWN",
            },
          ];
    case "L2":
      return [
        {
          id: "attic",
          text: trade
            ? "A10 calls unfinished attic — not assumed sleeping"
            : "Attic occupancy Unknown",
          code: "R310 / R314",
          honesty: "CHECK",
        },
        {
          id: "stair-up",
          text: stairUnknown ? "Stair run Unknown — KY 8¼\" riser / 9\" tread" : "Stair from A01",
          code: "R311.7 KY",
          honesty: stairUnknown ? "UNKNOWN" : "CHECK",
        },
        {
          id: "sep",
          text: habitableAbove ? "Garage ceiling below is 5/8\" Type X" : "Confirm assembly",
          code: "R302.6",
          honesty: habitableAbove ? "APPLIES" : "CHECK",
        },
      ];
    case "FDN":
      return trade
        ? [
            { id: "ftg", text: "12x24 footing dashed around slab (A03)", code: "R403.1", honesty: "APPLIES" },
            { id: "pier", text: "2'×2'×2' pier to support LVL (A03)", code: null, honesty: "APPLIES" },
            { id: "pad", text: "Thicken pad for joist-bearing wall (A03)", code: null, honesty: "APPLIES" },
            {
              id: "frost",
              text: bp.frostDepthIn == null ? "Frost Unknown — enter the AHJ value" : `Frost ${bp.frostDepthIn}"`,
              code: "R403.1.4",
              honesty: bp.frostDepthIn == null ? "UNKNOWN" : "APPLIES",
            },
            { id: "air", text: "Air-entrain concrete (Severe weathering)", code: "Table R402.2", honesty: "APPLIES" },
            {
              id: "slab",
              text: "Garage floor noncombustible; slope to door or drain",
              code: "R309.1",
              honesty: "APPLIES",
            },
          ]
        : [
            {
              id: "frost",
              text: bp.frostDepthIn == null ? "Frost Unknown — enter the AHJ value" : `Frost ${bp.frostDepthIn}"`,
              code: "R403.1.4",
              honesty: bp.frostDepthIn == null ? "UNKNOWN" : "APPLIES",
            },
            { id: "air", text: "Air-entrain concrete (Severe weathering)", code: "Table R402.2", honesty: "APPLIES" },
          ];
    case "EL":
      return [
        {
          id: "veneer",
          text: trade ? "Brick veneer, soldier, quoins to match existing" : "Exterior finish as recorded",
          code: "R703.8",
          honesty: trade ? "APPLIES" : "CHECK",
        },
        {
          id: "grade",
          text: trade ? "Slope ground away 5% for 10' (A06)" : "Grade away from foundation",
          code: "R401.3",
          honesty: "CHECK",
        },
        {
          id: "shed-ht",
          text: trade ? "Adjust shed height for drop in grade (A04)" : "Grade at shed Unknown",
          code: null,
          honesty: trade ? "CHECK" : "UNKNOWN",
        },
      ];
    case "SEC": {
      const proposal = proposedStairFromWalls(bp);
      return [
        {
          id: "eave",
          text: bp.eaveHeightIn != null ? `First-floor walls ${formatFtIn(bp.eaveHeightIn)}` : "Wall height Unknown",
          code: "Table R602.3(5)",
          honesty: bp.eaveHeightIn != null ? "APPLIES" : "UNKNOWN",
        },
        {
          id: "typex",
          text: habitableAbove ? "5/8\" Type X garage ceiling" : "Confirm ceiling assembly",
          code: "R302.6",
          honesty: habitableAbove ? "APPLIES" : "CHECK",
        },
        {
          id: "riser",
          text: "KY riser 8¼\" max — not IRC 7¾\"",
          code: "R311.7.5.1",
          honesty: "APPLIES",
        },
        {
          id: "tread",
          text: "KY tread 9\" min — not IRC 10\"",
          code: "R311.7.5.2",
          honesty: "APPLIES",
        },
        {
          id: "width",
          text: "36\" clear · headroom 6'-8\"",
          code: "R311.7.1 / .2",
          honesty: "APPLIES",
        },
        {
          id: "cut",
          text: proposal
            ? `${proposal.minRisers} risers · going ≥ ${formatFtIn(proposal.minGoingIn)} PROP`
            : "Stair run Unknown — not invented",
          code: "R311.7",
          honesty: proposal ? "CHECK" : "UNKNOWN",
        },
        {
          id: "stamp",
          text: "Working section — not a PE stamp",
          code: "R106.1 / KRS 322",
          honesty: "APPLIES",
        },
      ];
    }
    case "WALL":
      return trade
        ? [
            { id: "ftg", text: "12x24 concrete footing", code: "R403.1", honesty: "APPLIES" },
            { id: "drain", text: "4\" HDPE drain + fabric + gravel", code: null, honesty: "APPLIES" },
            { id: "block", text: "12\" brick-ledge block + 8\" top", code: null, honesty: "APPLIES" },
            {
              id: "stud",
              text: "2x4 wall @ 10' · conventional table path",
              code: "Table R602.3(5)",
              honesty: "APPLIES",
            },
            {
              id: "r13",
              text: "R-13 min. recorded — not a REScheck",
              code: "N1102 / Ch. 11",
              honesty: "CHECK",
            },
            { id: "ties", text: "Tyvek · 1\" air gap · brick ties 16\" V/H", code: "R703.8", honesty: "APPLIES" },
            {
              id: "joist",
              text: "2x12 joists @ 16\" · R-19 min.",
              code: "Table R502.3.1(2)",
              honesty: "APPLIES",
            },
            {
              id: "rafter",
              text: "2x8 rafters @ 16\" · 8/12 · R-38 min.",
              code: "Table R802.5.1(1)",
              honesty: "APPLIES",
            },
            {
              id: "typex",
              text: "5/8\" Type X on garage ceiling (habitable above)",
              code: "R302.6",
              honesty: "APPLIES",
            },
          ]
        : [{ id: "need", text: "Enter a wall assembly — Howler will not invent R-values", code: "N1102", honesty: "UNKNOWN" }];
    case "JOIST":
      return trade
        ? [
            { id: "lvl", text: "LVL to support joists (A07)", code: "R502.6", honesty: "APPLIES" },
            { id: "b1", text: "B1 4-ply 1.75×20 ~24' PASSED (Murphy 8/17/2026)", code: null, honesty: "APPLIES" },
            { id: "post", text: "Post in stairwell wall — place it", code: null, honesty: "CHECK" },
            {
              id: "outer",
              text: `Framing outer ${formatFtIn(TRADEWALK.framingOuterWidthIn)} × ${formatFtIn(TRADEWALK.framingOuterDepthIn)}`,
              code: null,
              honesty: "APPLIES",
            },
            {
              id: "table",
              text: `${bp.joistSize ?? "Joists"} @ ${bp.joistSpacingIn ?? "—"}" O.C. — each line is a member`,
              code: "Table R502.3.1(2)",
              honesty: "APPLIES",
            },
            { id: "b23", text: "B2 3-ply ~20'-1½\" · B3 4-ply ~8'-3½\"", code: null, honesty: "APPLIES" },
            { id: "stamp", text: "Murphy calcs are separate — not this stamp", code: "KRS 322", honesty: "APPLIES" },
          ]
        : [
            {
              id: "table",
              text: `${bp.joistSize ?? "Joists"} @ ${bp.joistSpacingIn ?? "—"}" O.C.`,
              code: "Table R502.3.1(2)",
              honesty: bp.joistSize ? "CHECK" : "UNKNOWN",
            },
          ];
    case "ROOF":
      return [
        {
          id: "rafter",
          text: `${bp.rafterSize ?? "Rafters"} @ ${bp.rafterSpacingIn ?? "—"}" O.C.`,
          code: "Table R802.5.1(1)",
          honesty: bp.rafterSize ? "APPLIES" : "UNKNOWN",
        },
        {
          id: "truss",
          text: "If trusses: sealed placement drawings required by AHJ",
          code: "R802.10",
          honesty: "CHECK",
        },
        {
          id: "grade",
          text: trade ? "A04: adjust shed height for drop in grade" : "Confirm eave at grade",
          code: null,
          honesty: "CHECK",
        },
      ];
    case "ELEC":
      return garage
        ? [
            {
              id: "opener",
              text: trade ? "Two openers — leaf widths Unknown. Listed UL 325" : "Openers if provided: listed UL 325",
              code: "R309.4",
              honesty: trade ? "CHECK" : "CHECK",
            },
            {
              id: "gfci",
              text: "GFCI all 125V 15/20A garage receptacles",
              code: "E3902.2",
              honesty: "APPLIES",
            },
            {
              id: "bay",
              text: "≥1 receptacle in each vehicle bay",
              code: "E3901.9",
              honesty: "APPLIES",
            },
            {
              id: "ckt",
              text: "20A garage receptacle circuit; no other outlets",
              code: "NEC 210.11(C)(4)",
              honesty: "APPLIES",
            },
            {
              id: "ev",
              text: trade ? "EV charger option — not placed" : "EV not recorded",
              code: null,
              honesty: "UNKNOWN",
            },
            {
              id: "panel",
              text: "Panel location and amps Unknown — not invented",
              code: "E3701",
              honesty: "UNKNOWN",
            },
            {
              id: "co",
              text: "Attached garage: CO alarm in the dwelling",
              code: "R315.2.1",
              honesty: habitableAbove || trade ? "APPLIES" : "CHECK",
            },
          ]
        : [{ id: "need", text: "Occupancy Unknown — electrical callouts wait", code: "E3901", honesty: "UNKNOWN" }];
    case "ELEC2":
      return [
        {
          id: "lights",
          text: trade ? "Attic lighting (A10) — layout not dimensioned" : "Attic lighting Unknown",
          code: "E3903",
          honesty: trade ? "CHECK" : "UNKNOWN",
        },
        {
          id: "stair-lt",
          text: "Stair lighting with switch at each floor / 3-way",
          code: "E3903.3",
          honesty: "APPLIES",
        },
        {
          id: "ms",
          text: trade ? "Mini-split electric (A10) — head location not placed" : "HVAC electric Unknown",
          code: null,
          honesty: "UNKNOWN",
        },
        {
          id: "sleep",
          text: "Unfinished ≠ sleeping. Smoke / EERO wait",
          code: "R314 / R310",
          honesty: "CHECK",
        },
      ];
    case "PLUMB":
      return trade
        ? [
            { id: "opt", text: "Half bath is an option for pool access — not placed", code: null, honesty: "UNKNOWN" },
            {
              id: "gfci",
              text: "If a lav goes in: GFCI within 6 ft of the sink",
              code: "E3902.1",
              honesty: "CHECK",
            },
            { id: "cl", text: "A11 CLs recorded — confirm what they measure", code: null, honesty: "CHECK" },
            { id: "fix", text: "No fixture schedule on the set — not invented", code: "P2708", honesty: "UNKNOWN" },
          ]
        : [{ id: "need", text: "No plumbing recorded", code: null, honesty: "UNKNOWN" }];
    case "STUD":
      return [
        {
          id: "oc",
          text: `${bp.studSize ?? "Studs"} @ ${bp.studSpacingIn ?? "—"}" O.C. — each tick is a stud`,
          code: "Table R602.3(5)",
          honesty: bp.studSpacingIn ? "APPLIES" : "UNKNOWN",
        },
        { id: "corner", text: "Corner: 3-stud typical. Count once in the field", code: null, honesty: "CHECK" },
        {
          id: "kings",
          text: trade ? "King/jacks at 2868 / 2840DH" : "King/jacks at recorded openings",
          code: "R602.7",
          honesty: "CHECK",
        },
        {
          id: "ohd",
          text: "OHD kings/jacks wait — leaf widths Unknown",
          code: "R602.7",
          honesty: "UNKNOWN",
        },
      ];
    default:
      return [];
  }
}

export function submittalChecklist(bp: Blueprint): SubmittalItem[] {
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
      status: envelopeComplete(bp) ? (trade ? "ON_SET" : "PARTIAL") : "MISSING",
      note: envelopeComplete(bp)
        ? "Envelope is on A01. Unresolved items stay on the register."
        : "Width and depth are not recorded.",
    },
    {
      id: "site",
      code: "R106.2",
      title: "Site plan / survey",
      status: "MISSING",
      note: "Not on A01–A15. Additions typically need distances to lot lines. Howler will not invent a survey.",
    },
    {
      id: "floor",
      code: "R106.1.1",
      title: "Floor plans",
      status: envelopeComplete(bp) ? "ON_SET" : "MISSING",
      note: "A01 first floor · A02 attic.",
    },
    {
      id: "sched",
      code: "R106.1.1",
      title: "Door / window schedule",
      status: hasMan && hasWin && hasOhd ? "ON_SET" : hasMan || hasWin ? "PARTIAL" : "MISSING",
      note: hasOhd ? "Opening schedule on A01." : "OHD leaf widths Unknown — schedule has a missing row, not a 16' door.",
    },
    {
      id: "fdn",
      code: "R106.1.1",
      title: "Foundation plan and details",
      status: envelopeComplete(bp) ? "ON_SET" : "MISSING",
      note: "A03 + A06. Frost stays Unknown until the AHJ value is entered (R403.1.4).",
    },
    {
      id: "elev",
      code: "R106.1.1",
      title: "Elevations",
      status: bp.eaveHeightIn && bp.roofRise ? "ON_SET" : "PARTIAL",
      note: "A04 four faces.",
    },
    {
      id: "sec",
      code: "R106.1.1",
      title: "Building / wall sections",
      status: envelopeComplete(bp) ? "ON_SET" : "MISSING",
      note: "A05 building · A06 wall assembly.",
    },
    {
      id: "elec",
      code: "Ch. 34–43",
      title: "Electrical plan",
      status: trade ? "PARTIAL" : "MISSING",
      note: "A09/A10 devices. Panel location and amps Unknown — not invented.",
    },
    {
      id: "plumb",
      code: "Ch. 25–33",
      title: "Plumbing plan",
      status: trade || bathNamed ? "PARTIAL" : "NA",
      note: "A11 is an option. No fixture schedule. Confirm in or out.",
    },
    {
      id: "energy",
      code: "N1102 / Ch. 11",
      title: "Energy compliance",
      status: trade ? "PARTIAL" : "MISSING",
      note: trade
        ? "R-13 / R-19 / R-38 min. recorded on A06. That is not a REScheck or IECC compliance report."
        : "R-values not recorded.",
    },
    {
      id: "seal",
      code: "R106.1 / KRS 322",
      title: "Design professional seal",
      status: "MISSING",
      note: "Howler does not seal. Murphy LVL calcs (8/17/2026) are a separate document, not this set.",
    },
  ];
}

export function sharePacketLines(project: Project): string[] {
  const bp = project.blueprint;
  const unresolved = unresolvedRegister(bp);
  const blocking = unresolved.filter((item) => item.blocking);
  return [
    `Project: ${project.name} — ${project.address || "address Unknown"}`,
    `Scope: ${bp.occupancy ?? "occupancy Unknown"} · ${project.projectType}`,
    `Code basis: ${CODE_BASIS} (${CODE_ADOPTION}). Do not assume the reader knows the edition.`,
    `Callouts cite the section (example: GFCI · E3902.2, not “GFCI here”).`,
    `Status: ${bp.drawingStatus ?? "DRAFT"} · rev ${project.revision}${bp.issuedRevision ? ` · last issued rev ${bp.issuedRevision}` : " · not issued"}`,
    `Prepared by: Howler working drawings — not a licensed design professional. Kentucky does not require a GC license; electrical / plumbing / HVAC trades do.`,
    blocking.length
      ? `Still open before layout: ${blocking.map((item) => item.title).join("; ")}.`
      : "No blocking unresolved items on the register.",
  ];
}
