/**
 * Recorded facts from the owner's Drive set — not invented.
 * Source: Deboard Tradewalk Plans.pdf (June 12, 2025) + Deboard Calcs.pdf
 * (Murphy LVL, 8/17/2026) + David Stanfield framing (Jul 21, 2026, cites A01).
 */
import type { Blueprint, BlueprintRoom, Opening } from "./types";
import { emptyBlueprint } from "./types";
import { DEBOARD_REFS } from "./plan-library";

export const TRADEWALK = {
  source: "Deboard Tradewalk Plans.pdf",
  issued: "June 12, 2025",
  job: "DEBOARD RESIDENCE",
  addressLine: "227 MARENGO DR.",
  cityLine: "RICHMOND, KY 40475",
  county: "Madison",
  occupancy: "GARAGE_WITH_HABITABLE" as const,
  stories: 2,
  /** A01 overall — 37'-4 7/8" */
  overallWidthIn: 37 * 12 + 4 + 7 / 8,
  /** A01 / A03 — 30'-0 1/16" */
  overallDepthIn: 30 * 12 + 1 / 16,
  /** Garage bay = overall − mower shed = 26'-0" */
  garageWidthIn: 26 * 12,
  garageDepthIn: 30 * 12 + 1 / 16,
  /** A01 + Stanfield citing A01 — 11'-4 7/8" × 10'-8 1/2" */
  shedWidthIn: 11 * 12 + 4 + 7 / 8,
  shedDepthIn: 10 * 12 + 8.5,
  /** A05 callout + Stanfield first-floor walls */
  eaveHeightIn: 10 * 12,
  roofRise: 8,
  roofRun: 12,
  roofStyle: "GABLE" as const,
  /** A06 wall section */
  studSize: "2x4" as const,
  studSpacingIn: 16,
  joistSize: "2x12" as const,
  joistSpacingIn: 16,
  rafterSize: "2x8" as const,
  rafterSpacingIn: 16,
  joistDirection: "WIDTH" as const,
  overhangIn: 12,
  drawingScale: "1/8" as const,
  insulation: {
    wall: "R-13 min.",
    floor: "R-19 min. in floor joists",
    roof: "R-38 min. at rafters",
    slab: "R-10 2\" rigid",
  },
  foundation: {
    footing: "12x24 concrete footing",
    block: "12\" block brick ledge + 8\" top block",
    sill: "Treated sill plate, cast-in-place anchor bolts",
    drain: "4\" HDPE drain, filter fabric, coarse gravel",
    slab: "Concrete slab, vapor barrier, 4\" gravel",
    pier: "2'×2'×2' pier to support LVL beam (A03)",
    thicken: "Thicken pad for wall supporting floor joists (A03)",
  },
  matchExisting: [
    "Soldier course to match existing house (A04)",
    "Quoins on corners to match existing house (A04)",
    "Eave return to match existing house (A04)",
    "Adjust shed height as needed for drop in grade (A04)",
    "Slope ground away 5% for 10' (A06)",
    "Brick veneer, metal ties 16\" vertically and 16\" horizontally (A06)",
    "1\" air gap, Tyvek house wrap (A06)",
  ],
  lvls: [
    "B1 Murphy 2.0E 1.75×20 4-ply LVL — ~24' girder, PASSED (Calcs 8/17/2026)",
    "B2 Murphy 2.0E 1.75×20 3-ply LVL — ~20'-1 1/2\", PASSED",
    "B3 Murphy 2.0E 1.75×20 4-ply LVL — ~8'-3 1/2\", PASSED",
    "Floor live 40 psf / dead 12 psf, IRC 2018, second floor. ASD. Valid until 4/2/2029.",
    "Add LVL beam to support floor joists (A07)",
    "Add post to support LVL in stairwell wall (A07)",
  ],
  /** A07 overall to outside of framing (brick veneer is outside this). */
  framingOuterWidthIn: 36 * 12 + 8,
  framingOuterDepthIn: 29 * 12 + 3 + 3 / 16,
  openingsUnknown:
    "A09 shows two garage-door openers (double + single per Scope). Leaf widths are not dimensioned on A01 — enter them. Man doors tagged 2868 (2'-8\"×6'-8\"). Windows tagged 2840DH. A01 also tags SB3621 twice — 3'-6\"×2'-1\" by the same cipher as 2868. Type (SB) and wall stay Unknown. Not an OHD. Not a Simpson SSTB36 holdown bolt.",
  electric: {
    garage: [
      "Two garage-door openers (A09) — leaf widths Unknown",
      "Add outlets per code (A09) — count not dimensioned",
      "Option for electric car charger (A09)",
    ],
    attic: [
      "Add lighting in unfinished attic space (A10)",
      "Dimmer on can-light switch (A10)",
      "Switch at bottom of stairs for stairwell lighting (A10)",
      "Electric for HVAC mini-split (A10)",
      "3-way switching at stair (A10)",
    ],
  },
  plumbing: [
    "Option: half bath in garage for pool access (A11)",
    "CL 17'-3\", CL 1'-6\", CL 1'-7\" recorded on A11 — confirm what they measure",
    "No fixture schedule on the set — not invented",
  ],
  sheetIndex: [
    { number: "A01", title: "PROPOSED 1ST FLOOR PLAN", drawn: true },
    { number: "A02", title: "PROPOSED ATTIC PLAN", drawn: true },
    { number: "A03", title: "FOUNDATION PLAN", drawn: true },
    { number: "A04", title: "ELEVATIONS", drawn: true },
    { number: "A05", title: "BUILDING SECTION", drawn: true },
    { number: "A06", title: "WALL SECTION DETAIL", drawn: true },
    { number: "A07", title: "ATTIC FLOOR FRAMING", drawn: true },
    { number: "A08", title: "ROOF FRAMING PLAN", drawn: true },
    { number: "A09", title: "ELECTRIC PLAN (GARAGE)", drawn: true },
    { number: "A10", title: "ELECTRIC PLAN (ATTIC)", drawn: true },
    { number: "A11", title: "PLUMBING PLAN", drawn: true },
    { number: "A12–A14", title: "3D CAPTURE", drawn: false },
    { number: "A15", title: "WALL FRAMING", drawn: true },
  ],
  sheets: [
    { id: "L1", number: "A01", title: "PROPOSED 1ST FLOOR PLAN" },
    { id: "L2", number: "A02", title: "PROPOSED ATTIC PLAN" },
    { id: "FDN", number: "A03", title: "FOUNDATION PLAN" },
    { id: "EL", number: "A04", title: "ELEVATIONS" },
    { id: "SEC", number: "A05", title: "BUILDING SECTION" },
    { id: "WALL", number: "A06", title: "WALL SECTION DETAIL" },
    { id: "JOIST", number: "A07", title: "ATTIC FLOOR FRAMING" },
    { id: "ROOF", number: "A08", title: "ROOF FRAMING PLAN" },
  ],
} as const;

export function citesTradewalk(bp: { notes?: string | null }): boolean {
  return Boolean(bp.notes && /tradewalk/i.test(bp.notes));
}

/** A01 tag SB3621 ×2. Same 4-digit cipher as 2868 / 2840DH. Not a Simpson connector. */
export const SB3621 = {
  tag: "SB3621",
  count: 2,
  widthIn: 3 * 12 + 6,
  heightIn: 2 * 12 + 1,
  kind: "WINDOW" as const,
  notes:
    "A01 tag. Size inferred from 2868 cipher (3'-6\" × 2'-1\"). Operation SB and wall Unknown. Not an OHD. Not Simpson SSTB36 (36-7/8\" holdown bolt).",
} as const;

export function sb3621Summary(): string {
  return [
    "SB3621 is an A01 opening tag, not a structural connector.",
    "Same cipher as 2868 and 2840DH: 36 21 → 3'-6\" wide × 2'-1\" high (42\" × 25\").",
    "Height 2'-1\" reads as a short window (transom / awning / hopper / utility) — not a man door and not an overhead door.",
    "Prefix SB is the operation code. It is not confirmed (slider vs single-hung vs catalog name). Howler will not invent the type.",
    "Tagged twice. Walls and offsets were not dimensioned — not placed on the plan.",
    "Not Simpson SSTB36 (that's a 36-7/8\" cast-in-place holdown bolt, ESR-2611) and not an HDB holdown.",
    "Say “SB3621 on the left” (or front / back / right / shed) to place one. Size stays INFERRED from the tag until you verify.",
  ].join(" ");
}

function room(partial: BlueprintRoom): BlueprintRoom {
  return partial;
}

export function tradewalkBlueprint(): Blueprint {
  const t = TRADEWALK;
  const openings: Opening[] = [
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
      notes: "A01 tag 2868 — 2'-8\" × 6'-8\". Offset is a placeholder — confirm.",
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
      notes: "Second A01 tag 2868. Wall/offset not dimensioned — confirm.",
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
      notes: "A01 tag 2840DH — 2'-8\" × 4'-0\" double-hung. Wall is typical — confirm.",
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
      notes: "Second A01 tag 2840DH. Wall/offset not dimensioned — confirm.",
    },
  ];
  const rooms: Record<string, BlueprintRoom> = {
    "rm-garage": room({
      id: "rm-garage",
      name: "GARAGE",
      level: 1,
      widthIn: t.garageWidthIn,
      depthIn: t.garageDepthIn,
      originXIn: 0,
      originYIn: 0,
      scopeItemIds: [],
      notes: "Tradewalk A01 — two-car garage.",
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
      notes: "Tradewalk A01 + Stanfield citing A01: 11'-4 7/8\" × 10'-8 1/2\".",
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
      notes: "Named on A01. Place size — Howler will not invent the stair run.",
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
      notes: "A02 attic over the garage. Sized from the L footprint until rooms are split.",
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
      notes: "A02 — attic follows the L. Size from A01 shed.",
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
      notes: "A11 option for garage-level bath for pool access. Size Unknown.",
    }),
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
    notes: `From ${t.source}, ${t.issued}. ${t.openingsUnknown}`,
  };
}
