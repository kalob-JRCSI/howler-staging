import type {
  Blueprint,
  DimDatum,
  DimProvenance,
  DrawingScaleId,
  LumberSize,
  OccupancyClass,
  Opening,
  OpeningKind,
  WallFace,
} from "./types";
import { DRAWING_SCALES } from "./types";
import { citesTradewalk, SB3621 } from "./tradewalk";

export function formatFtIn(inches: number | null | undefined): string {
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

export function feetToInches(feet: number): number {
  return Math.round(feet * 12);
}

export function parseFeetToken(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const feetInches = /^(\d+)\s*(?:'|ft|feet|foot)?\s*[-–]?\s*(\d+)\s*(?:"|in|inch|inches)?$/i.exec(trimmed);
  if (feetInches) return Number(feetInches[1]) * 12 + Number(feetInches[2]);
  const decimal = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?$/i.exec(trimmed);
  if (decimal) return Math.round(Number(decimal[1]) * 12);
  return null;
}

export function envelopeComplete(bp: Blueprint): boolean {
  return bp.widthIn != null && bp.depthIn != null && bp.widthIn > 0 && bp.depthIn > 0;
}

export function pitchRatio(bp: Blueprint): number | null {
  if (!bp.roofRise || !bp.roofRun) return null;
  return bp.roofRise / bp.roofRun;
}

export function pitchDegrees(bp: Blueprint): number | null {
  const ratio = pitchRatio(bp);
  if (ratio == null) return null;
  return (Math.atan(ratio) * 180) / Math.PI;
}

export function gableSpanIn(bp: Blueprint): number | null {
  if (!envelopeComplete(bp) || bp.widthIn == null) return null;
  return bp.widthIn;
}

export function ridgeRiseIn(bp: Blueprint): number | null {
  const span = gableSpanIn(bp);
  const ratio = pitchRatio(bp);
  if (span == null || ratio == null) return null;
  if (bp.roofStyle === "SHED") return span * ratio;
  return (span / 2) * ratio;
}

export function ridgeHeightIn(bp: Blueprint): number | null {
  if (bp.eaveHeightIn == null) return null;
  const rise = ridgeRiseIn(bp);
  if (rise == null) return null;
  return bp.eaveHeightIn + rise;
}

export function rafterLengthIn(bp: Blueprint): number | null {
  const span = gableSpanIn(bp);
  const ratio = pitchRatio(bp);
  if (span == null || ratio == null) return null;
  const run = bp.roofStyle === "SHED" ? span : span / 2;
  const rise = run * ratio;
  const overhang = bp.overhangIn ?? 0;
  return Math.hypot(run, rise) + overhang * Math.hypot(1, ratio);
}

export function roofAreaSf(bp: Blueprint): number | null {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return null;
  const ratio = pitchRatio(bp);
  const slope = ratio == null ? 1 : Math.hypot(1, ratio);
  const overhang = bp.overhangIn ?? 0;
  const planW = bp.widthIn + 2 * overhang;
  const planD = bp.depthIn + 2 * overhang;
  return (planW * planD * slope) / 144;
}

export function joistSpanIn(bp: Blueprint): number | null {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) return null;
  return bp.joistDirection === "DEPTH" ? bp.depthIn : bp.widthIn;
}

export function rafterHorizontalSpanIn(bp: Blueprint): number | null {
  const span = gableSpanIn(bp);
  if (span == null) return null;
  if (bp.roofStyle === "SHED") return span;
  return span / 2;
}

export function stations(lengthIn: number, spacingIn: number): number[] {
  if (lengthIn <= 0 || spacingIn <= 0) return [0];
  const result: number[] = [];
  for (let x = 0; x < lengthIn - 0.25; x += spacingIn) {
    result.push(Math.round(x * 100) / 100);
  }
  if (result[result.length - 1] !== lengthIn) result.push(lengthIn);
  return result;
}

export function memberCount(lengthIn: number, spacingIn: number): number {
  return stations(lengthIn, spacingIn).length;
}

export interface TakeoffLine {
  id: string;
  label: string;
  count: number | null;
  size: string;
  lengthEach: string;
  notes: string;
}

export function framingTakeoff(bp: Blueprint): TakeoffLine[] {
  const lines: TakeoffLine[] = [];
  const width = bp.widthIn;
  const depth = bp.depthIn;
  const height = bp.eaveHeightIn;
  const spacing = bp.studSpacingIn;
  const size = bp.studSize ?? ("2x4" as LumberSize);

  if (width && depth && spacing) {
    const long = memberCount(width, spacing);
    const short = memberCount(depth, spacing);
    const corners = 8;
    const door = bp.overheadDoorWidthIn
      ? Math.max(0, Math.round(bp.overheadDoorWidthIn / spacing) - 1)
      : 0;
    const kingJacks = bp.overheadDoorWidthIn ? 6 : 0;
    const count = long * 2 + short * 2 + corners + kingJacks - door;
    lines.push({
      id: "studs",
      label: "Studs, typical bearing (count includes corners; deducts door cavity)",
      count,
      size,
      lengthEach: height ? formatFtIn(height) : "Unknown wall height",
      notes: `${spacing}" O.C. · ${long} on each ${formatFtIn(width)} wall · ${short} on each ${formatFtIn(depth)} wall`,
    });
    const plateEach = 2 * width + 2 * depth;
    lines.push({
      id: "plates",
      label: "Plates (1 bottom + 2 top, linear)",
      count: 3,
      size,
      lengthEach: formatFtIn(plateEach),
      notes: "Double top plate typical. Corners overlap — add 10% waste in the field.",
    });
  } else {
    lines.push({
      id: "studs",
      label: "Studs",
      count: null,
      size: size,
      lengthEach: "Unknown",
      notes: "Need envelope and stud spacing.",
    });
  }

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
      notes: `${bp.joistSpacingIn}" O.C. spanning ${bp.joistDirection === "DEPTH" ? "depth" : "width"} · plus rim / band each side`,
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
      notes: `${bp.rafterSpacingIn}" O.C. · ridge / beam extra · trusses replace this count if used`,
    });
  }

  const roof = roofAreaSf(bp);
  lines.push({
    id: "roof",
    label: "Roof covering (plan × slope factor)",
    count: roof == null ? null : Math.ceil(roof / 100),
    size: "square",
    lengthEach: roof == null ? "Unknown" : `${Math.ceil(roof)} sf`,
    notes: roof == null ? "Need envelope and pitch." : "Add waste. Ice barrier per AHJ where required.",
  });

  return lines;
}

export function conventionalFramingPatch(bp: Blueprint): Partial<Blueprint> {
  const habitable =
    bp.occupancy === "GARAGE_WITH_HABITABLE" ||
    bp.occupancy === "DWELLING" ||
    (bp.stories ?? 0) >= 2;
  const patch: Partial<Blueprint> = {};
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

export function nominalDepthIn(size: LumberSize | null | undefined): number {
  switch (size) {
    case "2x4":
      return 3.5;
    case "2x6":
      return 5.5;
    case "2x8":
      return 7.25;
    case "2x10":
      return 9.25;
    case "2x12":
      return 11.25;
    default:
      return 5.5;
  }
}

export function wallThicknessIn(bp: Blueprint): number {
  return nominalDepthIn(bp.studSize) + 1;
}

export function lumberThicknessIn(): number {
  return 1.5;
}

export function wallLengthIn(bp: Blueprint, wall: WallFace): number | null {
  if (wall === "FRONT" || wall === "BACK") return bp.widthIn;
  return bp.depthIn;
}

export function typicalOhdWidthIn(widthIn: number): number {
  if (widthIn >= 22 * 12) return 16 * 12;
  if (widthIn >= 18 * 12) return 10 * 12;
  if (widthIn >= 14 * 12) return 9 * 12;
  return 8 * 12;
}

export function conventionalOpenings(bp: Blueprint): Opening[] {
  if (!bp.widthIn || !bp.depthIn) return [];
  const ohdW = typicalOhdWidthIn(bp.widthIn);
  const ohdH = 7 * 12;
  const ohdOffset = Math.max(0, (bp.widthIn - ohdW) / 2);
  const manW = 36;
  const manH = 80;
  const manOffset = 48;
  return [
    {
      id: "op-ohd",
      kind: "OHD",
      wall: "FRONT",
      widthIn: ohdW,
      heightIn: ohdH,
      offsetIn: ohdOffset,
      sillIn: 0,
      headerSize: "2x12",
      provenance: "INFERRED",
      offsetProvenance: "INFERRED",
      datum: "FACE_FRAMING",
      notes: "Typical double-bay overhead door — confirm size",
    },
    {
      id: "op-man",
      kind: "MAN",
      wall: "LEFT",
      widthIn: manW,
      heightIn: manH,
      offsetIn: manOffset,
      sillIn: 0,
      headerSize: "2x10",
      provenance: "INFERRED",
      offsetProvenance: "INFERRED",
      datum: "FACE_FRAMING",
      notes: "Typical 3'-0\" man door on left wall — confirm",
    },
  ];
}

export function resolveOpenings(bp: Blueprint): Opening[] {
  if (bp.openings && bp.openings.length > 0) return bp.openings;
  if (bp.overheadDoorWidthIn && bp.widthIn) {
    return [
      {
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
        notes: null,
      },
    ];
  }
  return [];
}

export function syncOhdFromOpenings(bp: Blueprint): Blueprint {
  const ohd = resolveOpenings(bp).find((item) => item.kind === "OHD");
  if (!ohd) return bp;
  return {
    ...bp,
    overheadDoorWidthIn: ohd.widthIn,
    overheadDoorHeightIn: ohd.heightIn,
  };
}

export function typicalGarageLayoutPatch(bp: Blueprint): Partial<Blueprint> {
  const patch: Partial<Blueprint> = { ...conventionalFramingPatch(bp) };
  const garage =
    bp.occupancy === "DETACHED_GARAGE" ||
    bp.occupancy === "GARAGE_WITH_HABITABLE" ||
    bp.occupancy === "POST_AND_FRAME";
  if (garage && resolveOpenings(bp).length === 0 && bp.widthIn && bp.depthIn) {
    const openings = conventionalOpenings({ ...bp, ...patch });
    patch.openings = openings;
    const ohd = openings.find((item) => item.kind === "OHD");
    if (ohd) {
      patch.overheadDoorWidthIn = ohd.widthIn;
      patch.overheadDoorHeightIn = ohd.heightIn;
    }
  }
  return patch;
}

export function openingLabel(opening: Opening): string {
  if (opening.tag) return opening.tag;
  const kind = opening.kind === "OHD" ? "OHD" : opening.kind === "MAN" ? "MAN DOOR" : "WINDOW";
  const size = opening.heightIn
    ? `${formatFtIn(opening.widthIn)} × ${formatFtIn(opening.heightIn)}`
    : formatFtIn(opening.widthIn);
  return `${kind} ${size}`;
}

export function describeEnvelope(bp: Blueprint): string {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return "Envelope Unknown";
  }
  const pitch = bp.roofRise && bp.roofRun ? ` · ${bp.roofRise}/${bp.roofRun}` : " · pitch Unknown";
  const walls = bp.eaveHeightIn ? ` · walls ${formatFtIn(bp.eaveHeightIn)}` : " · wall height Unknown";
  return `${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}${walls}${pitch}`;
}

export const SVG_UNITS_PER_PAPER_INCH = 72;

export function scaleInchesPerFoot(scaleId: DrawingScaleId): number | null {
  return DRAWING_SCALES.find((item) => item.id === scaleId)?.inchesPerFoot ?? null;
}

export function scaleLabel(scaleId: DrawingScaleId): string {
  return DRAWING_SCALES.find((item) => item.id === scaleId)?.label ?? "Scale Unknown";
}

export function svgPerBuildingInch(scaleId: DrawingScaleId, fitPxPerInch: number): number {
  const ipf = scaleInchesPerFoot(scaleId);
  if (ipf == null) return fitPxPerInch;
  return (ipf / 12) * SVG_UNITS_PER_PAPER_INCH;
}

export function planLayout(
  widthIn: number,
  depthIn: number,
  scaleId: DrawingScaleId,
  box = { x: 140, y: 56, w: 620, h: 400 },
): { x: number; y: number; w: number; d: number; s: number; fits: boolean; fitS: number } {
  const fitS = Math.min(box.w / widthIn, box.h / depthIn);
  const s = svgPerBuildingInch(scaleId, fitS);
  const w = widthIn * s;
  const d = depthIn * s;
  const fits = w <= box.w + 0.5 && d <= box.h + 0.5;
  const x = box.x + Math.max(0, (box.w - w) / 2);
  const y = box.y + Math.max(0, (box.h - d) / 2);
  return { x, y, w, d, s, fits, fitS };
}

export function parseDrawingScale(text: string): DrawingScaleId | null {
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

export interface PlanPart {
  id: string;
  name: string;
  xIn: number;
  yIn: number;
  wIn: number;
  dIn: number;
}

/** Sized rooms that are not the full envelope — garage + shed make the L. */
export function planParts(bp: Blueprint, level: number): PlanPart[] {
  if (!bp.widthIn || !bp.depthIn) return [];
  const rooms = Object.values(bp.rooms).filter(
    (room) =>
      room.level === level &&
      room.widthIn &&
      room.depthIn &&
      room.originXIn != null &&
      room.originYIn != null,
  );
  const sized = rooms
    .filter(
      (room) =>
        !(
          room.originXIn === 0 &&
          room.originYIn === 0 &&
          room.widthIn === bp.widthIn &&
          room.depthIn === bp.depthIn
        ),
    )
    .map((room) => ({
      id: room.id,
      name: room.name,
      xIn: room.originXIn as number,
      yIn: room.originYIn as number,
      wIn: room.widthIn as number,
      dIn: room.depthIn as number,
    }));
  if (sized.length >= 2) return sized;
  return [
    {
      id: "envelope",
      name: level === 1 ? "GARAGE" : "LEVEL 2",
      xIn: 0,
      yIn: 0,
      wIn: bp.widthIn,
      dIn: bp.depthIn,
    },
  ];
}

export function isLFootprint(bp: Blueprint, level = 1): boolean {
  const parts = planParts(bp, level);
  if (parts.length < 2 || !bp.widthIn || !bp.depthIn) return false;
  const area = parts.reduce((sum, part) => sum + part.wIn * part.dIn, 0);
  return area < bp.widthIn * bp.depthIn - 12;
}

export const DATUM_LABEL: Record<DimDatum, string> = {
  FACE_FRAMING: "TO FACE OF FRAMING",
  FACE_FINISH: "TO FINISHED FACE (BRICK)",
  CENTERLINE: "TO CENTERLINE",
};

export const PROVENANCE_LABEL: Record<DimProvenance, string> = {
  VERIFIED: "VERIFIED",
  INFERRED: "INFERRED",
  PROPOSED: "PROPOSED",
  UNKNOWN: "UNKNOWN",
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "DRAFT — NOT ISSUED",
  REVIEWED: "REVIEWED — NOT ISSUED",
  ISSUED: "ISSUED FOR LAYOUT",
};

export function provenanceSuffix(provenance?: DimProvenance | null): string {
  if (!provenance || provenance === "VERIFIED") return "";
  if (provenance === "INFERRED") return " INF";
  if (provenance === "PROPOSED") return " PROP";
  return " UNK";
}

export interface ScheduleRow {
  id: string;
  mark: string;
  kind: OpeningKind;
  size: string;
  height: string;
  wall: string;
  offset: string;
  header: string;
  provenance: DimProvenance;
  offsetProvenance: DimProvenance;
  datum: DimDatum;
  notes: string;
  missing: boolean;
}

function uniqueMarks(openings: Opening[]): string[] {
  const counts = new Map<string, number>();
  const bases = openings.map((opening, index) => {
    const base =
      opening.tag?.trim() ||
      (opening.kind === "OHD" ? `OHD${index + 1}` : opening.kind === "MAN" ? `D${index + 1}` : `W${index + 1}`);
    counts.set(base, (counts.get(base) ?? 0) + 1);
    return base;
  });
  const seen = new Map<string, number>();
  return bases.map((base) => {
    const total = counts.get(base) ?? 1;
    if (total === 1) return base;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}${String.fromCharCode(64 + n)}`;
  });
}

export function openingSchedule(bp: Blueprint): ScheduleRow[] {
  const openings = resolveOpenings(bp);
  const marks = uniqueMarks(openings);
  const rows: ScheduleRow[] = openings.map((opening, index) => ({
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
    missing: false,
  }));
  const garage: OccupancyClass[] = ["DETACHED_GARAGE", "GARAGE_WITH_HABITABLE"];
  if (garage.includes(bp.occupancy as OccupancyClass) && !openings.some((item) => item.kind === "OHD")) {
    rows.push({
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
      notes: citesTradewalk(bp)
        ? "A09 two openers (double + single). Leaf widths not on A01."
        : "Overhead door width not recorded.",
      missing: true,
    });
  }
  if (citesTradewalk(bp) && !openings.some((item) => /^SB3621/i.test(item.tag ?? ""))) {
    for (const mark of ["SB3621A", "SB3621B"] as const) {
      rows.push({
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
        missing: true,
      });
    }
  }
  return rows;
}

export interface UnresolvedItem {
  id: string;
  title: string;
  message: string;
  sheet: string;
  blocking: boolean;
}

export function unresolvedRegister(bp: Blueprint): UnresolvedItem[] {
  const items: UnresolvedItem[] = [];
  const trade = citesTradewalk(bp);
  if (!envelopeComplete(bp)) {
    items.push({
      id: "env-unknown",
      title: "Envelope is Unknown",
      message: "Width and depth are not recorded. Howler will not invent a building size.",
      sheet: "A01",
      blocking: true,
    });
  } else if ((bp.envelopeProvenance ?? "PROPOSED") !== "VERIFIED") {
    items.push({
      id: "env-unverified",
      title: "Envelope is not a verified field measurement",
      message: `Overall ${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)} is ${PROVENANCE_LABEL[bp.envelopeProvenance ?? "PROPOSED"]}. Scaling a PDF is not a field measurement. Mark verified after you measure, or keep it as design intent.`,
      sheet: "A01",
      blocking: false,
    });
  }

  const openings = resolveOpenings(bp);
  const garage = bp.occupancy === "DETACHED_GARAGE" || bp.occupancy === "GARAGE_WITH_HABITABLE";
  if (garage && !openings.some((item) => item.kind === "OHD") && bp.overheadDoorWidthIn == null) {
    items.push({
      id: "ohd-leaf",
      title: "Overhead-door leaf widths are Unknown",
      message: trade
        ? "A09 shows two garage-door openers. Enter the double and the single. Howler will not invent 16'-0\"."
        : "Header, king, and jack studs cannot be laid out until the door width is entered.",
      sheet: "A01",
      blocking: true,
    });
  }

  for (const opening of openings) {
    if ((opening.offsetProvenance ?? "PROPOSED") === "PROPOSED" || opening.offsetProvenance === "UNKNOWN") {
      items.push({
        id: `off-${opening.id}`,
        title: `${opening.tag ?? openingLabel(opening)} offset is ${opening.offsetProvenance ?? "PROPOSED"}`,
        message: `Offset ${formatFtIn(opening.offsetIn)} from the ${opening.wall.toLowerCase()} wall start is not a verified field measurement. Confirm before issuing for layout.`,
        sheet: "A01",
        blocking: false,
      });
    }
  }

  for (const room of Object.values(bp.rooms)) {
    if (room.widthIn == null || room.depthIn == null) {
      const stair = /stair/i.test(room.name);
      const bath = /bath/i.test(room.name);
      items.push({
        id: `rm-${room.id}`,
        title: `${room.name} size is Unknown`,
        message: stair
          ? "Stairwell is named. Run, width, and direction stay Unknown until you place them. Kentucky: 36 in clear, 8¼ in max riser, 9 in min tread (KRC R311.7 — not IRC 7¾ / 10)."
          : bath
            ? "Half bath is an option. In or out, and which corner, stay Unknown. If a lav goes in, GFCI within 6 ft of the sink (E3902.1)."
            : `${room.name} is named. Size stays Unknown — Howler will not invent it.`,
        sheet: stair ? "A01" : bath ? "A11" : "A01",
        blocking: stair,
      });
    }
  }

  if (trade) {
    const placed = openings.filter((item) => /^SB3621/i.test(item.tag ?? "")).length;
    items.push({
      id: "sb3621",
      title: placed >= SB3621.count ? "SB3621 walls still need a field check" : "SB3621 tagged twice — wall Unknown",
      message:
        placed >= SB3621.count
          ? "SB3621 is a 3'-6\" × 2'-1\" window (same cipher as 2868). Operation SB is unconfirmed. Not a Simpson SSTB36 holdown."
          : "A01 tags SB3621 twice. Same cipher as 2868 → 3'-6\" × 2'-1\" window. Type SB and wall stay Unknown — not drawn. Not an OHD. Not Simpson SSTB36 (36-7/8\" holdown bolt).",
      sheet: "A01",
      blocking: false,
    });
    items.push({
      id: "panel",
      title: "Electrical panel location is Unknown",
      message: "A09/A10 record devices. Panel location and amps are not on the set — not invented (E3701).",
      sheet: "A09",
      blocking: false,
    });
    items.push({
      id: "existing-house",
      title: "Existing house / garage size is not on the set",
      message: "Dashed existing footprints are place-holders. Size is not on Tradewalk — not invented.",
      sheet: "A01",
      blocking: false,
    });
  }

  if (bp.frostDepthIn == null) {
    items.push({
      id: "frost",
      title: "Frost depth is Unknown",
      message: "Typical Kentucky AHJ value is 24 in. Enter the official’s number. Howler will not assume it.",
      sheet: "A03",
      blocking: false,
    });
  }

  return items;
}

export function blockingUnresolved(bp: Blueprint): UnresolvedItem[] {
  return unresolvedRegister(bp).filter((item) => item.blocking);
}
