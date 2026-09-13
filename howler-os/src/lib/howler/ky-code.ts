import { ensureBlueprint, type Blueprint, type LumberSize, type PlanFinding, type Project } from "./types";
import { envelopeComplete, formatFtIn, joistSpanIn, rafterHorizontalSpanIn, unresolvedRegister } from "./layout";
import { citesTradewalk } from "./tradewalk";
import { KY_STAIR, proposedStairFromWalls } from "./ky-stairs";

/** KRC 2018 Table R301.2(1) — 20 psf counties. All others 15 psf. */
const SNOW_20 = new Set([
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
  "Trimble",
]);

const HIGH_ELEVATION: Record<string, string> = {
  Bell: "Footnote b: above 2,600 ft use a site-specific snow study.",
  Harlan: "Footnote b: above 2,600 ft use a site-specific snow study.",
  Letcher: "Footnote c: above 2,500 ft use a site-specific snow study.",
};

export const KY_COUNTIES = [
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
  "Woodford",
];

export type KyCounty = (typeof KY_COUNTIES)[number];

export function matchCounty(text: string): KyCounty | null {
  const lower = text.toLowerCase();
  const ranked = KY_COUNTIES.filter((county) => lower.includes(county.toLowerCase())).sort(
    (a, b) => b.length - a.length,
  );
  return ranked[0] ?? null;
}

export function countyCriteria(county: string): {
  name: string;
  snowPsf: number;
  footnote: string | null;
} | null {
  const name = KY_COUNTIES.find((item) => item.toLowerCase() === county.toLowerCase());
  if (!name) return null;
  return {
    name,
    snowPsf: SNOW_20.has(name) ? 20 : 15,
    footnote: HIGH_ELEVATION[name] ?? null,
  };
}

/**
 * Conservative SPF No.2 tabulated floor-joist spans, inches.
 * Source: IRC 2015 Table R502.3.1(2) / KRC 2018 Ch. 5 — 40 psf LL / 10 psf DL, L/360.
 * Values rounded down from published feet-inches so Howler never overstates span.
 */
const JOIST_SPF2: Record<string, Record<number, number>> = {
  "2x6": { 12: 123, 16: 112, 19.2: 105, 24: 97 },
  "2x8": { 12: 162, 16: 147, 19.2: 138, 24: 123 },
  "2x10": { 12: 207, 16: 185, 19.2: 174, 24: 153 },
  "2x12": { 12: 251, 16: 222, 19.2: 209, 24: 180 },
};

/**
 * Conservative SPF No.2 rafter horizontal spans, inches.
 * Source: IRC 2015 Table R802.5.1(1) family — 20 psf ground snow / 10 psf DL,
 * ceiling not attached to rafters. Covers both 15 and 20 psf KY counties.
 */
const RAFTER_SPF2_20: Record<string, Record<number, number>> = {
  "2x6": { 12: 138, 16: 125, 19.2: 117, 24: 102 },
  "2x8": { 12: 182, 16: 165, 19.2: 155, 24: 135 },
  "2x10": { 12: 232, 16: 193, 19.2: 181, 24: 157 },
  "2x12": { 12: 269, 16: 232, 19.2: 218, 24: 190 },
};

const SPECIES_LABEL: Record<Blueprint["joistSpecies"], string> = {
  SPF_2: "SPF No.2",
  DF_LARCH_2: "Douglas Fir-Larch No.2",
  SYP_2: "Southern Pine No.2",
};

export function tabulatedJoistSpanIn(size: LumberSize, spacingIn: number): number | null {
  const row = JOIST_SPF2[size];
  if (!row) return null;
  const key = nearestSpacing(spacingIn);
  return row[key] ?? null;
}

export function tabulatedRafterSpanIn(size: LumberSize, spacingIn: number): number | null {
  const row = RAFTER_SPF2_20[size];
  if (!row) return null;
  const key = nearestSpacing(spacingIn);
  return row[key] ?? null;
}

function nearestSpacing(spacingIn: number): number {
  if (spacingIn <= 12) return 12;
  if (spacingIn <= 16) return 16;
  if (spacingIn <= 19.2) return 19.2;
  return 24;
}

export function speciesLabel(species: Blueprint["joistSpecies"]): string {
  return SPECIES_LABEL[species];
}

export function computePlanFindings(project: Project): PlanFinding[] {
  const bp = ensureBlueprint(project);
  const findings: PlanFinding[] = [];
  const trade = citesTradewalk(bp);

  findings.push({
    id: "disclaimer",
    severity: "INFO",
    code: "R106.1 / KRS 322",
    title: "Working drawings, not a sealed set",
    message:
      "These are design-intent / field-layout drawings. They are not sealed by a licensed design professional. The authority having jurisdiction (AHJ) decides what must be engineered. Do not submit this set as a PE-stamped permit package. Code basis is the 2018 Kentucky Residential Code (2015 IRC), 815 KAR 7:125.",
    engineerLikely: false,
  });

  if (!bp.widthIn || !bp.depthIn) {
    findings.push({
      id: "envelope",
      severity: "WATCH",
      code: "Envelope",
      title: "Envelope is Unknown",
      message:
        "Width and depth are not recorded. Howler will not invent a building size. Enter feet (example: 24 by 32) to generate plan, stud, and joist layouts.",
      engineerLikely: false,
    });
  }

  if (!bp.county) {
    findings.push({
      id: "county",
      severity: "WATCH",
      code: "Table R301.2(1)",
      title: "County is Unknown",
      message:
        "Ground snow load stays Unknown until a Kentucky county is entered. Wind is 115 mph Vult statewide. Weathering is Severe statewide. Howler will not guess the county from the street address.",
      engineerLikely: false,
    });
  } else {
    const criteria = countyCriteria(bp.county);
    if (criteria?.footnote) {
      findings.push({
        id: "snow-elev",
        severity: "WATCH",
        code: "Table R301.2(1)",
        title: `${criteria.name} County high-elevation snow`,
        message: criteria.footnote,
        engineerLikely: true,
      });
    }
  }

  if (bp.frostDepthIn == null) {
    findings.push({
      id: "frost",
      severity: "INFO",
      code: "R403.1.4",
      title: "Frost depth is Unknown",
      message:
        "Typical Kentucky AHJ value is 24 in. Enter the frost depth the building official uses. Howler will not assume it.",
      engineerLikely: false,
    });
  }

  const habitableAbove =
    bp.occupancy === "GARAGE_WITH_HABITABLE" ||
    ((bp.stories ?? 0) >= 2 && bp.occupancy !== "DETACHED_GARAGE" && bp.occupancy !== "POST_AND_FRAME");

  if (habitableAbove) {
    findings.push({
      id: "r302-6",
      severity: "REQUIRED",
      code: "R302.6",
      title: "Garage / habitable separation",
      message:
        "Habitable rooms above a garage require not less than 5/8 in Type X gypsum (or equivalent) on the garage ceiling. Supporting structure for that assembly needs not less than 1/2 in gypsum or equivalent. Call this out on the L1 ceiling.",
      engineerLikely: false,
    });
    const stair = proposedStairFromWalls(bp);
    findings.push({
      id: "r311-ky",
      severity: "WATCH",
      code: "R311.7 (KY)",
      title: "Stair geometry is Kentucky-amended",
      message: stair
        ? `KRC 2018 max riser is 8¼ in and min tread is 9 in — not IRC 7¾ / 10. Richmond Building Inspection publishes the same. From recorded ${stair.note}: proposed floor-to-floor ${formatFtIn(stair.proposedRiseIn)} needs ≥ ${stair.minRisers} risers at ${stair.riserHeightIn.toFixed(2)}" and ≥ ${formatFtIn(stair.minGoingIn)} of going. Run, width, and direction stay Unknown. Howler will not cut a stringer from this.`
        : `KRC 2018 max riser is ${KY_STAIR.maxRiserIn}" and min tread is ${KY_STAIR.minTreadIn}" (R311.7.5). Vanilla IRC 7¾ / 10 does not apply. Width 36 in, headroom 6'-8". Enter floor-to-floor before layout.`,
      engineerLikely: false,
    });
  }

  if (bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE") {
    findings.push({
      id: "r302-6-walls",
      severity: "INFO",
      code: "R302.6",
      title: "Garage wall separation (if attached or < 3 ft)",
      message:
        "From a dwelling and attics: 1/2 in gypsum on the garage side. Garages less than 3 ft from a dwelling on the same lot: 1/2 in gypsum on the interior of those exterior walls. Detached buildings farther than 3 ft do not pick up that wall rule.",
      engineerLikely: false,
    });
    findings.push({
      id: "r302-5",
      severity: "INFO",
      code: "R302.5.1",
      title: "Opening from garage into dwelling",
      message:
        "No opening from a private garage directly into a sleeping room. Other openings shall be a solid wood or honeycomb-core steel door not less than 1-3/8 in thick, or a 20-minute fire-rated door.",
      engineerLikely: false,
    });
    findings.push({
      id: "r309-1",
      severity: "INFO",
      code: "R309.1",
      title: "Garage floor surface",
      message:
        "Garage floor shall be an approved noncombustible material. The parking area shall slope to a drain or toward the main vehicle doorway. Howler will not invent a drain if none is recorded.",
      engineerLikely: false,
    });
    findings.push({
      id: "e3902",
      severity: "INFO",
      code: "E3902.2 / E3901.9",
      title: "Garage receptacles",
      message:
        "All 125-volt, single-phase, 15- and 20-ampere receptacles in garages shall have GFCI protection (E3902.2). At least one receptacle in each vehicle bay (E3901.9). A 20-ampere garage receptacle circuit with no other outlets is required (2015 IRC Ch. 37 / NEC 210.11(C)(4)). Device count on A09 is typical, not a circuit schedule.",
      engineerLikely: false,
    });
    findings.push({
      id: "r309-4",
      severity: "INFO",
      code: "R309.4",
      title: "Garage-door openers",
      message:
        "Automatic garage door openers, if provided, shall be listed and labeled in accordance with UL 325. Leaf widths stay Unknown until entered.",
      engineerLikely: false,
    });
    findings.push({
      id: "r315",
      severity: "INFO",
      code: "R315.2.1",
      title: "Carbon monoxide alarm (attached garage)",
      message:
        "New dwelling units with an attached garage require a carbon monoxide alarm. Howler will not invent detector locations on A09 — they belong in the dwelling, not as a guessed garage device.",
      engineerLikely: false,
    });
  }

  const heightIn = bp.eaveHeightIn;
  const studSpacing = bp.studSpacingIn;
  const studSize = bp.studSize;
  const stories = bp.stories ?? (habitableAbove ? 2 : null);

  if (studSize === "2x4" && heightIn != null && heightIn > 120) {
    findings.push({
      id: "stud-height",
      severity: "REQUIRED",
      code: "R602.3(5)",
      title: "2x4 bearing height exceeds conventional 10 ft",
      message: `Unsupported 2x4 bearing height is ${formatFtIn(heightIn)}. IRC/KRC Table R602.3(5) caps conventional 2x4 bearing walls at 10'-0". Taller walls need 2x6, engineered design, or an accepted alternative.`,
      engineerLikely: true,
    });
  }

  if (habitableAbove && studSpacing != null && studSpacing > 16) {
    findings.push({
      id: "stud-oc",
      severity: "REQUIRED",
      code: "R602.3(5)",
      title: "Stud spacing is not conventional with a floor above",
      message: `Studs at ${studSpacing}" O.C. with a floor + roof-ceiling above. Table R602.3(5) allows 24" O.C. 2x4 only when the wall supports a roof-ceiling assembly and no floor. Use 16" O.C. or engineered wall design.`,
      engineerLikely: true,
    });
  }

  if (!habitableAbove && stories === 1 && studSpacing != null && studSpacing > 24) {
    findings.push({
      id: "stud-oc-roof",
      severity: "REQUIRED",
      code: "R602.3(5)",
      title: "Stud spacing exceeds 24 in O.C.",
      message: `Studs at ${studSpacing}" O.C. exceed the conventional 24" maximum even for roof-ceiling only.`,
      engineerLikely: true,
    });
  }

  if (habitableAbove && (stories ?? 0) >= 3 && studSize === "2x4") {
    findings.push({
      id: "stud-stories",
      severity: "REQUIRED",
      code: "R602.3(5)",
      title: "2x4 supporting two floors is outside this table path",
      message:
        "A 2x4 wall supporting two floors plus a roof-ceiling is outside the simple Table R602.3(5) path Howler checks. Have a design professional size the wall, or change the stud size.",
      engineerLikely: true,
    });
  }

  if (habitableAbove && bp.joistSize && bp.joistSpacingIn && bp.widthIn && bp.depthIn) {
    const span = joistSpanIn(bp);
    const allowed = tabulatedJoistSpanIn(bp.joistSize, bp.joistSpacingIn);
    if (span != null && allowed != null && span > allowed) {
      findings.push({
        id: "joist-span",
        severity: "REQUIRED",
        code: "R502.3 / Table R502.3.1(2)",
        title: "Floor joist span exceeds tabulated",
        message: `Joists span ${formatFtIn(span)} at ${bp.joistSize} ${bp.joistSpacingIn}" O.C. (${speciesLabel(bp.joistSpecies)}, 40 psf LL / 10 psf DL). Tabulated max is ${formatFtIn(allowed)}. Add a bearing beam, tighten spacing, step up the joist, or engineer the floor.${
          trade
            ? " Tradewalk A07 calls for an LVL to support the joists; Murphy 1.75×20 B1/B2/B3 PASSED (8/17/2026, IRC 2018, 40/12). The unsplit envelope is not the joist span — place the bearings. That is not a new PE stamp."
            : ""
        }`,
        engineerLikely: true,
      });
    }
  } else if (habitableAbove && (!bp.joistSize || !bp.joistSpacingIn)) {
    findings.push({
      id: "joist-unknown",
      severity: "WATCH",
      code: "R502.3",
      title: "Floor joists are Unknown",
      message:
        "A floor above the garage is in scope, but joist size and spacing are not recorded. Enter them (example: 2x10 at 16 on center) so Howler can check Table R502.3.1(2).",
      engineerLikely: false,
    });
  }

  if (bp.rafterSize && bp.rafterSpacingIn) {
    const span = rafterHorizontalSpanIn(bp);
    const allowed = tabulatedRafterSpanIn(bp.rafterSize, bp.rafterSpacingIn);
    if (span != null && allowed != null && span > allowed) {
      findings.push({
        id: "rafter-span",
        severity: "REQUIRED",
        code: "R802.5 / Table R802.5.1(1)",
        title: "Rafter span exceeds tabulated (sawn lumber)",
        message: `Rafters run ${formatFtIn(span)} horizontally at ${bp.rafterSize} ${bp.rafterSpacingIn}" O.C. Conservative 20 psf snow tabulated max is ${formatFtIn(allowed)}. Use a ridge beam, closer spacing, larger rafters, or engineered trusses.`,
        engineerLikely: true,
      });
    }
  } else if (bp.widthIn && bp.roofRise && bp.roofRun && !bp.rafterSize) {
    findings.push({
      id: "rafter-unknown",
      severity: "INFO",
      code: "R802.5",
      title: "Rafters / trusses are Unknown",
      message:
        "Roof pitch is recorded but rafter size is not. Common path on this occupancy is engineered roof trusses (AHJ typically requires the sealed truss package) or sawn rafters checked to Table R802.5.1(1).",
      engineerLikely: false,
    });
  }

  if (bp.overheadDoorWidthIn != null && bp.overheadDoorWidthIn >= 192 && habitableAbove) {
    findings.push({
      id: "header",
      severity: "REQUIRED",
      code: "R602.7",
      title: "Wide overhead-door header",
      message: `Overhead door is ${formatFtIn(bp.overheadDoorWidthIn)} with a floor above. Sawn-lumber headers in Table R602.7 typically do not cover this opening. Specify an engineered header / LVL and have it sized.`,
      engineerLikely: true,
    });
  } else if (
    (bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE") &&
    bp.overheadDoorWidthIn == null
  ) {
    findings.push({
      id: "door-unknown",
      severity: "INFO",
      code: "R602.7",
      title: "Overhead door size is Unknown",
      message: trade
        ? "A09 shows two garage-door openers (double + single per Scope). Leaf widths are not dimensioned on A01. Enter them — Howler will not invent a 16-foot door."
        : "Header and king/jack studs cannot be laid out until the door width is entered.",
      engineerLikely: false,
    });
  }

  if (bp.occupancy === "POST_AND_FRAME") {
    const widthFt = bp.widthIn ? (bp.widthIn + 2 * (bp.overhangIn ?? 0)) / 12 : null;
    const wallFt = bp.eaveHeightIn ? bp.eaveHeightIn / 12 : null;
    const over = [
      widthFt != null && widthFt > 48 ? `width including overhang ${widthFt.toFixed(1)} ft > 48 ft` : null,
      wallFt != null && wallFt > 16 ? `wall height ${wallFt.toFixed(1)} ft > 16 ft` : null,
      (bp.stories ?? 1) > 1 ? "more than one story" : null,
    ].filter(Boolean);
    if (over.length) {
      findings.push({
        id: "r327",
        severity: "REQUIRED",
        code: "R327",
        title: "Post-and-frame outside KRC R327 limits",
        message: `R327 conventional post-and-frame is single-story, 48 ft max width including overhang, 16 ft max wall, 20 ft mean roof, 8 ft max post spacing. This envelope is outside: ${over.join("; ")}. Structural calculations or R106.1 design professional required.`,
        engineerLikely: true,
      });
    } else {
      findings.push({
        id: "r327-ok",
        severity: "INFO",
        code: "R327",
        title: "Post-and-frame appears inside R327 limits",
        message:
          "Stay inside: 6x6 min posts, 8 ft max spacing, poured piers 48 in below grade, 2x4 girts 24 in O.C., knee braces, metal roof on purlins. Confirm soil 2,000 psf assumption with the AHJ.",
        engineerLikely: false,
      });
    }
  }

  if ((bp.stories ?? 0) > 3) {
    findings.push({
      id: "stories",
      severity: "REQUIRED",
      code: "R101 / KBC",
      title: "More than three stories",
      message:
        "Buildings over three stories are outside the Kentucky Residential Code. Use the Kentucky Building Code with a registered design professional.",
      engineerLikely: true,
    });
  }

  findings.push({
    id: "truss-package",
    severity: "INFO",
    code: "R802.10",
    title: "Truss placement package",
    message:
      "If the roof is engineered trusses, the manufacturer’s sealed placement drawings and bracing details are typically required by the AHJ even when the rest of the building is conventional construction.",
    engineerLikely: false,
  });

  findings.push({
    id: "wind",
    severity: "INFO",
    code: "Table R301.2(1)",
    title: "Wind and weathering (statewide)",
    message:
      "Kentucky Vult = 115 mph all counties. Concrete weathering = Severe. Investigate topographic effects per R301.2.1. Air-entrain concrete per Table R402.2.",
    engineerLikely: false,
  });

  const skipUnresolved = new Set(["env-unknown", "ohd-leaf", "frost"]);
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
      engineerLikely: false,
    });
  }
  if (offsetCount) {
    findings.push({
      id: "offsets-proposed",
      severity: "INFO",
      code: "Coordination",
      title: `${offsetCount} opening offset${offsetCount === 1 ? "" : "s"} not verified`,
      message:
        "Door and window offsets from corners are proposed until confirmed. Tags and sizes stay as recorded. Howler will not treat a placeholder offset as a field measurement.",
      engineerLikely: false,
    });
  }

  if ((bp.drawingStatus ?? "DRAFT") !== "ISSUED" && envelopeComplete(bp)) {
    findings.push({
      id: "not-issued",
      severity: "INFO",
      code: "Issue",
      title: `${bp.drawingStatus ?? "DRAFT"} — not issued for layout`,
      message:
        "Issue the set when a contractor should work from this revision. Issue lists unresolved items on the title block. It is still not a PE stamp.",
      engineerLikely: false,
    });
  }

  return findings;
}

export function engineerRequired(project: Project): PlanFinding[] {
  return computePlanFindings(project).filter((finding) => finding.engineerLikely);
}

export function plansStatusLine(project: Project): string {
  const bp = ensureBlueprint(project);
  const bits: string[] = [];
  if (bp.widthIn && bp.depthIn) bits.push(`${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}`);
  else bits.push("envelope Unknown");
  if (bp.roofRise && bp.roofRun) bits.push(`${bp.roofRise}/${bp.roofRun} pitch`);
  if (bp.county) bits.push(`${bp.county} Co`);
  const needed = engineerRequired(project);
  if (needed.length) bits.push("engineer review likely");
  return bits.join(" · ");
}
