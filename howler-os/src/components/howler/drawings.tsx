import { useRef, useState } from "react";
import {
  DATUM_LABEL,
  envelopeComplete,
  formatFtIn,
  isLFootprint,
  joistSpanIn,
  lumberThicknessIn,
  memberCount,
  openingLabel,
  openingSchedule,
  pitchDegrees,
  planLayout,
  planParts,
  type PlanPart,
  PROVENANCE_LABEL,
  provenanceSuffix,
  rafterHorizontalSpanIn,
  rafterLengthIn,
  resolveOpenings,
  ridgeHeightIn,
  ridgeRiseIn,
  scaleLabel,
  STATUS_LABEL,
  stations,
  unresolvedRegister,
  wallThicknessIn,
} from "@/lib/howler/layout";
import { tabulatedJoistSpanIn } from "@/lib/howler/ky-code";
import { CODE_ADOPTION, CODE_SHORT, designCriteria, formatCodeNote, sheetKeynotes } from "@/lib/howler/code-notes";
import { KY_STAIR, proposedStairFromWalls, stairLimitRows } from "@/lib/howler/ky-stairs";
import type { Blueprint, DimProvenance, DrawingScaleId, Opening, Project, SheetId, WallFace } from "@/lib/howler/types";
import { OCCUPANCY_LABEL, SHEETS } from "@/lib/howler/types";
import { TRADEWALK, citesTradewalk } from "@/lib/howler/tradewalk";

export type { SheetId };

export type DimTarget =
  | { kind: "width" }
  | { kind: "depth" }
  | { kind: "eave" }
  | { kind: "room"; roomId: string; field: "width" | "depth" | "name" };

export interface RoomDrag {
  roomId: string;
  originXIn: number;
  originYIn: number;
  widthIn?: number;
  depthIn?: number;
}

function sheetMeta(sheet: SheetId) {
  return SHEETS.find((item) => item.id === sheet) ?? { id: sheet, label: sheet, number: sheet };
}

function TitleBlock({
  project,
  bp,
  sheet,
  scale,
}: {
  project: Project;
  bp: Blueprint;
  sheet: SheetId;
  scale: string;
}) {
  const meta = sheetMeta(sheet);
  const trade = citesTradewalk(bp);
  const job = trade ? TRADEWALK.job : project.name.toUpperCase();
  const street = trade ? TRADEWALK.addressLine : project.address.toUpperCase();
  const city = trade ? TRADEWALK.cityLine : bp.county ? `${bp.county.toUpperCase()} COUNTY, KY` : "KENTUCKY";
  const issued = trade ? TRADEWALK.issued.toUpperCase() : "WORKING SET";
  const status = bp.drawingStatus ?? "DRAFT";
  const statusText =
    status === "ISSUED"
      ? `ISSUED FOR LAYOUT · REV ${bp.issuedRevision ?? project.revision}`
      : STATUS_LABEL[status] ?? "DRAFT — NOT ISSUED";
  const unresolved = unresolvedRegister(bp);
  const blocking = unresolved.filter((item) => item.blocking).length;
  return (
    <g className="text-muted">
      <rect x="708" y="16" width="176" height="608" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.25" />
      <line x1="708" y1="16" x2="708" y2="624" stroke="currentColor" strokeWidth="1.25" />
      <text x="796" y="40" textAnchor="middle" className="fill-fg" fontSize="11" fontFamily="var(--font-display)">
        {job}
      </text>
      <text x="796" y="56" textAnchor="middle" fontSize="8">
        {street}
      </text>
      <text x="796" y="70" textAnchor="middle" fontSize="8">
        {city}
      </text>
      <text x="796" y="86" textAnchor="middle" fontSize="8" className="fill-fg">
        {issued}
      </text>
      <line x1="720" y1="96" x2="872" y2="96" stroke="currentColor" strokeWidth="0.8" />
      <text x="720" y="112" fontSize="7">
        SHEET #
      </text>
      <text x="796" y="112" fontSize="7">
        DATE
      </text>
      <text x="720" y="136" className="fill-fg" fontSize="22" fontFamily="var(--font-display)">
        {meta.number}
      </text>
      <text x="796" y="128" fontSize="8">
        {issued}
      </text>
      <line x1="720" y1="148" x2="872" y2="148" stroke="currentColor" strokeWidth="0.8" />
      <text x="796" y="168" textAnchor="middle" className="fill-fg" fontSize="9" fontFamily="var(--font-display)">
        {meta.label.toUpperCase()}
      </text>
      <text x="796" y="184" textAnchor="middle" fontSize="8">
        {trade ? "FROM TRADEWALK SET" : project.projectType}
      </text>
      <line x1="720" y1="196" x2="872" y2="196" stroke="currentColor" strokeWidth="0.8" />
      <text x="720" y="214" fontSize="8" className="fill-fg">
        Scale {scale}
      </text>
      <text x="720" y="228" fontSize="8">
        Rev {project.revision} · {bp.county ? `${bp.county} Co.` : "County Unknown"}
      </text>
      <text x="720" y="242" fontSize="8">
        Snow {bp.groundSnowLoadPsf ?? "—"} psf · Vult {bp.windSpeedMph}
      </text>
      <text x="720" y="256" fontSize="8">
        {bp.occupancy ? OCCUPANCY_LABEL[bp.occupancy] : "Occupancy Unknown"}
      </text>
      <line x1="720" y1="268" x2="872" y2="268" stroke="currentColor" strokeWidth="0.8" />
      {trade ? (
        <>
          <text x="720" y="286" fontSize="8" className="fill-fg">
            THIS SET
          </text>
          <text x="720" y="300" fontSize="7">
            A01–A11 drawn · A15 wall framing
          </text>
          <text x="720" y="314" fontSize="7">
            A12–A14 3D — see Tradewalk PDF
          </text>
          <text x="720" y="336" fontSize="8" className="fill-fg">
            {bp.studSize} @ {bp.studSpacingIn}" OC studs
          </text>
          <text x="720" y="350" fontSize="8">
            {bp.joistSize} @ {bp.joistSpacingIn}" joists
          </text>
          <text x="720" y="364" fontSize="8">
            {bp.rafterSize} @ {bp.rafterSpacingIn}" rafters
          </text>
          <text x="720" y="378" fontSize="8">
            Pitch {bp.roofRise}/{bp.roofRun} · eave {formatFtIn(bp.eaveHeightIn)}
          </text>
          <line x1="720" y1="392" x2="872" y2="392" stroke="currentColor" strokeWidth="0.8" />
          <text x="720" y="412" fontSize="8" className={status === "ISSUED" ? "fill-fg" : "fill-warn"}>
            {statusText}
          </text>
          <text x="720" y="426" fontSize="8" className="fill-warn">
            NOT A SEALED SET
          </text>
          <text x="720" y="444" fontSize="7">
            {CODE_SHORT} · {CODE_ADOPTION}
          </text>
          <text x="720" y="458" fontSize="7">
            DIM {DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"]}
          </text>
          <text x="720" y="472" fontSize="7">
            ENVELOPE {PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"]}
          </text>
          <text x="720" y="486" fontSize="7" className={blocking ? "fill-warn" : undefined}>
            {blocking ? `${blocking} BLOCKING UNRESOLVED` : `${unresolved.length} ON REGISTER`}
          </text>
          <text x="720" y="504" fontSize="7">
            {unresolved[0] ? `${unresolved[0].title.slice(0, 28)}${unresolved[0].title.length > 28 ? "…" : ""}` : "Murphy LVL B1–B3 PASSED"}
          </text>
          <text x="720" y="518" fontSize="7">
            Tags resolve to A01 schedule
          </text>
        </>
      ) : (
        <>
          <text x="720" y="286" fontSize="8">
            {bp.studSize ? `${bp.studSize} @ ${bp.studSpacingIn ?? "—"}" OC` : "Framing Unknown"}
          </text>
          <text x="720" y="300" fontSize="8">
            Joists {bp.joistSize ?? "—"} {bp.joistSpacingIn ? `@ ${bp.joistSpacingIn}"` : ""}
          </text>
          <text x="720" y="314" fontSize="8">
            Rafters {bp.rafterSize ?? "—"} {bp.rafterSpacingIn ? `@ ${bp.rafterSpacingIn}"` : ""}
          </text>
          <text x="720" y="328" fontSize="8">
            Pitch {bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "Unknown"}
          </text>
          <line x1="720" y1="340" x2="872" y2="340" stroke="currentColor" strokeWidth="0.8" />
          <text x="720" y="360" fontSize="8" className={status === "ISSUED" ? "fill-fg" : "fill-warn"}>
            {statusText}
          </text>
          <text x="720" y="374" fontSize="8" className="fill-warn">
            NOT A SEALED
          </text>
          <text x="720" y="388" fontSize="8" className="fill-warn">
            ENGINEERING SET
          </text>
          <text x="720" y="408" fontSize="8">
            DIM {DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"]}
          </text>
          <text x="720" y="422" fontSize="8">
            ENVELOPE {PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"]}
          </text>
          <text x="720" y="436" fontSize="8">
            {CODE_SHORT}. Confirm every size.
          </text>
        </>
      )}
      <line x1="720" y1="520" x2="872" y2="520" stroke="currentColor" strokeWidth="0.8" />
      <text x="796" y="548" textAnchor="middle" className="fill-fg" fontSize="12" fontFamily="var(--font-display)">
        HOWLER
      </text>
      <text x="796" y="564" textAnchor="middle" fontSize="8">
        Construction documents
      </text>
    </g>
  );
}

function GraphicScaleBar({ s, x, y, maxFeet }: { s: number; x: number; y: number; maxFeet: number }) {
  const perFoot = s * 12;
  const ticks = [0, 4, 8];
  if (maxFeet >= 16) ticks.push(16);
  if (maxFeet >= 24) ticks.push(24);
  const end = ticks[ticks.length - 1] ?? 8;
  const width = end * perFoot;
  return (
    <g className="text-muted" aria-label={`Graphic scale, ${end} feet`}>
      <line x1={x} y1={y} x2={x + width} y2={y} stroke="currentColor" strokeWidth="1.25" />
      {ticks.map((feet, index) => {
        const tx = x + feet * perFoot;
        const filled = index % 2 === 1;
        const prev = ticks[index - 1] ?? 0;
        const seg = (feet - prev) * perFoot;
        return (
          <g key={feet}>
            {index > 0 ? (
              <rect
                x={x + prev * perFoot}
                y={y - 6}
                width={seg}
                height={6}
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="0.75"
              />
            ) : null}
            <line x1={tx} y1={y - 8} x2={tx} y2={y + 4} stroke="currentColor" strokeWidth="0.75" />
            <text x={tx} y={y + 14} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" className="fill-fg">
              {feet === 0 ? "0" : `${feet}'`}
            </text>
          </g>
        );
      })}
      <text x={x} y={y - 12} fontSize="8" className="fill-fg">
        GRAPHIC SCALE
      </text>
    </g>
  );
}

function NorthArrow({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} className="text-muted">
      <circle cx="0" cy="8" r="16" fill="none" stroke="currentColor" strokeWidth="1" />
      <polygon points="0,-10 6,14 -6,14" className="fill-fg" />
      <text x="0" y="-16" textAnchor="middle" fontSize="10" className="fill-fg">
        N
      </text>
    </g>
  );
}

function HatchDefs({ sheet }: { sheet: string }) {
  return (
    <defs>
      <pattern id={`slab-${sheet}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      </pattern>
      <pattern id={`siding-${sheet}`} width="6" height="6" patternUnits="userSpaceOnUse">
        <line x1="0" y1="6" x2="6" y2="6" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
      </pattern>
      <pattern id={`earth-${sheet}`} width="10" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 3 Q 2.5 0 5 3 T 10 3" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
      </pattern>
      <pattern id={`brick-${sheet}`} width="10" height="6" patternUnits="userSpaceOnUse">
        <rect width="10" height="6" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
        <line x1="5" y1="0" x2="5" y2="6" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      </pattern>
      <pattern id={`cmu-${sheet}`} width="12" height="8" patternUnits="userSpaceOnUse">
        <rect width="12" height="8" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />
      </pattern>
      <pattern id={`gravel-${sheet}`} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.7" fill="currentColor" opacity="0.45" />
        <circle cx="5" cy="4" r="0.6" fill="currentColor" opacity="0.4" />
      </pattern>
      <pattern id={`batt-${sheet}`} width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 4 Q 2 1 4 4 T 8 4" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      </pattern>
    </defs>
  );
}

function KeyBubble({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="7" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.15" />
      <text x={x} y={y + 3} textAnchor="middle" fontSize="8" className="fill-fg" fontFamily="var(--font-mono)">
        {n}
      </text>
    </g>
  );
}

function Leader({
  n,
  ax,
  ay,
  lx,
  ly,
}: {
  n: number;
  ax: number;
  ay: number;
  lx: number;
  ly: number;
}) {
  return (
    <g className="text-muted">
      <line x1={ax} y1={ay} x2={lx} y2={ly} stroke="currentColor" strokeWidth="0.75" />
      <KeyBubble n={n} x={lx} y={ly} />
    </g>
  );
}

function wrapNote(text: string, width = 44): string[] {
  if (text.length <= width) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function KeynoteLegend({
  items,
  x,
  y,
  title = "KEYNOTES — 2018 KRC / 2015 IRC",
}: {
  items: string[];
  x: number;
  y: number;
  title?: string;
}) {
  let cursor = y + 16;
  return (
    <g className="text-muted">
      <text x={x} y={y} fontSize="8" className="fill-fg">
        {title}
      </text>
      {items.map((item, index) => {
        const lines = wrapNote(item);
        const top = cursor;
        cursor += 4 + lines.length * 10;
        return (
          <g key={`${index}-${item}`}>
            <KeyBubble n={index + 1} x={x + 8} y={top} />
            {lines.map((line, lineIndex) => (
              <text key={lineIndex} x={x + 20} y={top + 3 + lineIndex * 10} fontSize="6.5">
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function StairLimitsBlock({ bp, x, y }: { bp: Blueprint; x: number; y: number }) {
  const rows = stairLimitRows(bp);
  const proposal = proposedStairFromWalls(bp);
  const s = 2.15;
  const riser = KY_STAIR.maxRiserIn * s;
  const tread = KY_STAIR.minTreadIn * s;
  const steps = 6;
  const ox = x + 10;
  const oy = 430;
  const points: string[] = [`${ox},${oy}`];
  let px = ox;
  let py = oy;
  for (let i = 0; i < steps; i++) {
    py -= riser;
    points.push(`${px},${py}`);
    px += tread;
    points.push(`${px},${py}`);
  }
  return (
    <g className="text-muted" aria-label="Kentucky stair limits R311.7">
      <text x={x} y={y} fontSize="8" className="fill-fg">
        KY STAIR — 2018 KRC, NOT VANILLA IRC
      </text>
      {rows.map((row, index) => (
        <text key={row.label} x={x} y={y + 12 + index * 11} fontSize="6.5">
          {row.label}  {row.value}  · {row.code}
        </text>
      ))}
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.4" />
      <text x={ox + 4} y={oy - riser * 2 - 4} fontSize="6.5" className="fill-fg">
        8¼" MAX R
      </text>
      <text x={ox + tread * 2} y={oy + 12} fontSize="6.5" className="fill-fg">
        9" MIN T
      </text>
      <text x={x} y={oy + 26} fontSize="6.5">
        Limit diagram — not this job's stringer
      </text>
      <text x={x} y={oy + 38} fontSize="6.5">
        {proposal
          ? `${proposal.note}. Going ≥ ${formatFtIn(proposal.minGoingIn)} PROP.`
          : "Floor-to-floor Unknown. Howler will not invent a run."}
      </text>
      <text x={x} y={oy + 50} fontSize="6.5">
        Garage top landing not required if door does not swing over stairs · R311.7.6
      </text>
    </g>
  );
}

function DesignCriteriaBlock({ bp, x, y }: { bp: Blueprint; x: number; y: number }) {
  const rows = designCriteria(bp);
  return (
    <g className="text-muted" aria-label="Design criteria Table R301.2(1)">
      <text x={x} y={y} fontSize="8" className="fill-fg">
        DESIGN CRITERIA — TABLE R301.2(1)
      </text>
      {rows.map((row, index) => (
        <text key={row.label} x={x} y={y + 12 + index * 11} fontSize="6.5">
          {row.label}  {row.value}  · {row.code}
        </text>
      ))}
    </g>
  );
}

function sheetNotes(bp: Blueprint, sheet: SheetId): string[] {
  return sheetKeynotes(bp, sheet).map(formatCodeNote);
}

const SHEET_HOWTO: Record<SheetId, string> = {
  L1: "HOW TO READ A01 — overall to stated datum, schedule, markers. Callouts cite 2018 KRC. Solid = verified. PROP/UNK stay unresolved.",
  L2: "HOW TO READ A02 — attic follows the L. Stairwell is named; run stays Unknown. KY stairs: 8¼\" max riser / 9\" min tread (R311.7).",
  FDN: "HOW TO READ A03 — slab, 12x24 footing (dashed), LVL pier. Frost Unknown unless entered (R403.1.4).",
  EL: "HOW TO READ A04 — four faces. Brick veneer R703.8. Match existing. Shed height for grade.",
  SEC: "HOW TO READ A05 — 10' walls. KY stair: 8¼\" max riser / 9\" min tread (not IRC 7¾ / 10). Run Unknown. Not a PE stamp.",
  WALL: "HOW TO READ A06 — evidence sheet. Follow numbered layers. Each layer cites the code it satisfies.",
  JOIST: "HOW TO READ A07 — each line is a joist at recorded O.C. Table R502.3.1(2). LVL is separate calc, not this stamp.",
  ROOF: "HOW TO READ A08 — rafters at recorded O.C. Table R802.5.1(1). Truss package R802.10 if used.",
  ELEC: "HOW TO READ A09 — GFCI E3902.2, bay receptacle E3901.9. No panel invented. Openers R309.4 / UL 325.",
  ELEC2: "HOW TO READ A10 — attic lighting E3903. Stair 3-way E3903.3. Unfinished ≠ sleeping (R314 / R310).",
  PLUMB: "HOW TO READ A11 — half bath is an option. No fixture schedule. If a lav: GFCI E3902.1.",
  STUD: "HOW TO READ A15 — Table R602.3(5). Each tick is a stud. King/jacks wait on OHD leaf width (R602.7).",
};

function HowToBanner({ sheet }: { sheet: SheetId }) {
  return (
    <text x="24" y="28" fontSize="8" className="fill-fg">
      {SHEET_HOWTO[sheet]}
    </text>
  );
}

function NextSheetHint({ sheet }: { sheet: SheetId }) {
  const index = SHEETS.findIndex((item) => item.id === sheet);
  const next = SHEETS[index + 1];
  if (!next) {
    return (
      <text x="24" y="618" fontSize="8" className="text-muted">
        END OF SET · A12–A14 3D stay on the Tradewalk PDF
      </text>
    );
  }
  return (
    <text x="24" y="618" fontSize="8" className="text-muted">
      NEXT {next.number} {next.label.toUpperCase()} →
    </text>
  );
}

function TagBubble({ mark, x, y }: { mark: string; x: number; y: number }) {
  const w = Math.max(28, mark.length * 5.2 + 8);
  return (
    <g className="text-muted">
      <rect x={x - w / 2} y={y - 7} width={w} height="14" rx="2" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1" />
      <text x={x} y={y + 3} textAnchor="middle" fontSize="7" className="fill-fg" fontFamily="var(--font-mono)">
        {mark}
      </text>
    </g>
  );
}

function SectionMarker({
  x,
  y1,
  y2,
  mark,
  sheet,
}: {
  x: number;
  y1: number;
  y2: number;
  mark: string;
  sheet: string;
}) {
  return (
    <g className="text-muted">
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="currentColor" strokeWidth="1.1" strokeDasharray="5 3" />
      <polygon points={`${x - 8},${y1} ${x + 8},${y1} ${x},${y1 + 12}`} className="fill-fg" />
      <polygon points={`${x - 8},${y2} ${x + 8},${y2} ${x},${y2 - 12}`} className="fill-fg" />
      <circle cx={x} cy={y1 - 12} r="9" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.1" />
      <text x={x} y={y1 - 9} textAnchor="middle" fontSize="8" className="fill-fg" fontFamily="var(--font-mono)">
        {mark}
      </text>
      <text x={x + 14} y={y1 - 8} fontSize="7" className="fill-fg">
        {sheet}
      </text>
    </g>
  );
}

function ElevMarker({ x, y, face, sheet }: { x: number; y: number; face: string; sheet: string }) {
  return (
    <g className="text-muted">
      <rect x={x - 12} y={y - 10} width="24" height="16" fill="var(--color-bg)" stroke="currentColor" />
      <polygon points={`${x - 6},${y + 6} ${x + 6},${y + 6} ${x},${y + 14}`} className="fill-fg" />
      <text x={x} y={y + 2} textAnchor="middle" fontSize="7" className="fill-fg" fontFamily="var(--font-mono)">
        {face}
      </text>
      <text x={x} y={y - 14} textAnchor="middle" fontSize="6" className="fill-fg">
        {sheet}
      </text>
    </g>
  );
}

function OpeningScheduleTable({ bp, x, y }: { bp: Blueprint; x: number; y: number }) {
  const rows = openingSchedule(bp);
  const header = ["MK", "TYPE", "W", "H", "WALL", "OFFSET", "SRC"];
  return (
    <g className="text-muted">
      <text x={x} y={y} fontSize="8" className="fill-fg">
        OPENING SCHEDULE — TAGS ON THIS SHEET RESOLVE HERE
      </text>
      {header.map((col, index) => (
        <text key={col} x={x + [0, 52, 108, 150, 196, 250, 318][index]!} y={y + 14} fontSize="6" className="fill-fg">
          {col}
        </text>
      ))}
      <line x1={x} y1={y + 18} x2={x + 380} y2={y + 18} stroke="currentColor" strokeWidth="0.6" />
      {rows.map((row, index) => {
        const yy = y + 30 + index * 12;
        const cells = [
          row.mark,
          row.kind,
          row.size,
          row.height,
          row.wall,
          `${row.offset}${provenanceSuffix(row.offsetProvenance)}`,
          row.missing ? "UNKNOWN" : PROVENANCE_LABEL[row.provenance],
        ];
        return (
          <g key={row.id}>
            {cells.map((cell, ci) => (
              <text
                key={`${row.id}-${ci}`}
                x={x + [0, 52, 108, 150, 196, 250, 318][ci]!}
                y={yy}
                fontSize="6.5"
                className={row.missing || row.provenance === "UNKNOWN" ? "fill-warn" : undefined}
                fontFamily="var(--font-mono)"
              >
                {cell}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function Receptacle({ x, y, gfi }: { x: number; y: number; gfi?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`} className="text-muted">
      <circle r="5.5" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.1" />
      <line x1="-2.4" y1="-2.2" x2="-2.4" y2="2.2" stroke="currentColor" strokeWidth="1.1" />
      <line x1="2.4" y1="-2.2" x2="2.4" y2="2.2" stroke="currentColor" strokeWidth="1.1" />
      {gfi ? (
        <text x="0" y="14" textAnchor="middle" fontSize="6" className="fill-fg">
          GFI
        </text>
      ) : null}
    </g>
  );
}

function CeilingLight({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} className="text-muted">
      <circle r="6" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth="0.8" />
      <line x1="0" y1="-9" x2="0" y2="9" stroke="currentColor" strokeWidth="0.8" />
    </g>
  );
}

function OpenerMark({ x, y }: { x: number; y: number }) {
  return (
    <g className="text-muted">
      <rect x={x - 11} y={y - 7} width="22" height="14" fill="var(--color-bg)" stroke="currentColor" />
      <text x={x} y={y + 3} textAnchor="middle" fontSize="7" className="fill-fg">
        GO
      </text>
    </g>
  );
}

function SwitchMark({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <text x={x} y={y} fontSize="9" className="fill-fg" fontFamily="var(--font-mono)">
      {label}
    </text>
  );
}

function pointerSvg(event: PointerEvent | React.PointerEvent, node: Element): { x: number; y: number } {
  const svg = "ownerSVGElement" in node ? (node as SVGGraphicsElement).ownerSVGElement : null;
  if (!svg) return { x: event.clientX, y: event.clientY };
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: event.clientX, y: event.clientY };
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const mapped = pt.matrixTransform(ctm.inverse());
  return { x: mapped.x, y: mapped.y };
}

function EmptySheet({ label }: { label: string }) {
  return (
    <g className="text-muted">
      <rect x="48" y="48" width="620" height="500" fill="none" stroke="currentColor" strokeDasharray="6 4" />
      <text x="358" y="250" textAnchor="middle" fontSize="16" className="fill-fg" fontFamily="var(--font-display)">
        {label}
      </text>
      <text x="358" y="276" textAnchor="middle" fontSize="12">
        Howler will not invent a size. Tell it the envelope, or enter width × depth.
      </text>
      <text x="358" y="298" textAnchor="middle" fontSize="11">
        Or: Use the Tradewalk plans
      </text>
    </g>
  );
}

function dimTone(provenance?: DimProvenance | null): { dash?: string; warn: boolean; suffix: string } {
  if (provenance === "UNKNOWN") return { dash: "4 2", warn: true, suffix: provenanceSuffix(provenance) };
  if (provenance === "PROPOSED") return { dash: "3 2", warn: false, suffix: provenanceSuffix(provenance) };
  if (provenance === "INFERRED") return { suffix: provenanceSuffix(provenance), warn: false };
  return { suffix: "", warn: false };
}

function dimHorizontal(
  x1: number,
  x2: number,
  y: number,
  fromY: number,
  label: string,
  onClick?: () => void,
  provenance?: DimProvenance | null,
) {
  const mid = (x1 + x2) / 2;
  const tone = dimTone(provenance);
  const text = `${label}${tone.suffix}`;
  return (
    <g className={onClick ? "text-muted cursor-pointer" : "text-muted"} onClick={onClick} role={onClick ? "button" : undefined}>
      <line x1={x1} y1={fromY} x2={x1} y2={y} stroke="currentColor" strokeWidth="0.6" strokeDasharray={tone.dash} />
      <line x1={x2} y1={fromY} x2={x2} y2={y} stroke="currentColor" strokeWidth="0.6" strokeDasharray={tone.dash} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="currentColor" strokeWidth="0.9" strokeDasharray={tone.dash} />
      <line x1={x1 - 3} y1={y - 3} x2={x1 + 3} y2={y + 3} stroke="currentColor" strokeWidth="0.9" />
      <line x1={x2 - 3} y1={y - 3} x2={x2 + 3} y2={y + 3} stroke="currentColor" strokeWidth="0.9" />
      <rect x={mid - 42} y={y - 9} width="84" height="12" fill="var(--color-bg)" />
      <text
        x={mid}
        y={y + 3}
        textAnchor="middle"
        fontSize="10"
        className={tone.warn ? "fill-warn" : "fill-fg"}
        fontFamily="var(--font-mono)"
      >
        {text}
      </text>
    </g>
  );
}

function dimVertical(
  x: number,
  y1: number,
  y2: number,
  fromX: number,
  label: string,
  onClick?: () => void,
  provenance?: DimProvenance | null,
) {
  const mid = (y1 + y2) / 2;
  const tone = dimTone(provenance);
  const text = `${label}${tone.suffix}`;
  return (
    <g className={onClick ? "text-muted cursor-pointer" : "text-muted"} onClick={onClick} role={onClick ? "button" : undefined}>
      <line x1={fromX} y1={y1} x2={x} y2={y1} stroke="currentColor" strokeWidth="0.6" strokeDasharray={tone.dash} />
      <line x1={fromX} y1={y2} x2={x} y2={y2} stroke="currentColor" strokeWidth="0.6" strokeDasharray={tone.dash} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="currentColor" strokeWidth="0.9" strokeDasharray={tone.dash} />
      <line x1={x - 3} y1={y1 - 3} x2={x + 3} y2={y1 + 3} stroke="currentColor" strokeWidth="0.9" />
      <line x1={x - 3} y1={y2 - 3} x2={x + 3} y2={y2 + 3} stroke="currentColor" strokeWidth="0.9" />
      <text
        x={x - 8}
        y={mid}
        textAnchor="middle"
        fontSize="10"
        className={tone.warn ? "fill-warn" : "fill-fg"}
        fontFamily="var(--font-mono)"
        transform={`rotate(-90 ${x - 8} ${mid})`}
      >
        {text}
      </text>
    </g>
  );
}

function openingOnWall(
  wall: WallFace,
  opening: Opening,
  box: { x: number; y: number; w: number; d: number },
  s: number,
  t: number,
) {
  const { x, y, w, d } = box;
  if (wall === "FRONT") {
    const ox = x + opening.offsetIn * s;
    const ow = opening.widthIn * s;
    return { x1: ox, y1: y + d - t, x2: ox + ow, y2: y + d, cx: ox + ow / 2, cy: y + d };
  }
  if (wall === "BACK") {
    const ox = x + opening.offsetIn * s;
    const ow = opening.widthIn * s;
    return { x1: ox, y1: y, x2: ox + ow, y2: y + t, cx: ox + ow / 2, cy: y };
  }
  if (wall === "LEFT") {
    const oy = y + opening.offsetIn * s;
    const oh = opening.widthIn * s;
    return { x1: x, y1: oy, x2: x + t, y2: oy + oh, cx: x, cy: oy + oh / 2 };
  }
  const oy = y + opening.offsetIn * s;
  const oh = opening.widthIn * s;
  return { x1: x + w - t, y1: oy, x2: x + w, y2: oy + oh, cx: x + w, cy: oy + oh / 2 };
}

function OpeningMark({
  opening,
  box,
  s,
  t,
  mark,
}: {
  opening: Opening;
  box: { x: number; y: number; w: number; d: number };
  s: number;
  t: number;
  mark?: string;
}) {
  const geom = openingOnWall(opening.wall, opening, box, s, t);
  const isHoriz = opening.wall === "FRONT" || opening.wall === "BACK";
  const bg = "var(--color-bg)";
  const tag = mark ?? opening.tag ?? openingLabel(opening);
  const tagX = geom.cx;
  const tagY = isHoriz
    ? opening.wall === "FRONT"
      ? geom.cy + 22
      : geom.cy - 16
    : geom.cy + (opening.wall === "LEFT" ? 0 : 0);
  const tagShiftX = isHoriz ? 0 : opening.wall === "LEFT" ? -18 : 18;
  if (opening.kind === "OHD") {
    const track =
      opening.wall === "FRONT"
        ? `M ${geom.x1} ${geom.y1} L ${geom.x1} ${geom.y1 - 18} L ${geom.x2} ${geom.y1 - 18} L ${geom.x2} ${geom.y1}`
        : opening.wall === "BACK"
          ? `M ${geom.x1} ${geom.y2} L ${geom.x1} ${geom.y2 + 18} L ${geom.x2} ${geom.y2 + 18} L ${geom.x2} ${geom.y2}`
          : "";
    return (
      <g className="text-muted">
        <rect x={geom.x1} y={geom.y1} width={geom.x2 - geom.x1} height={geom.y2 - geom.y1} fill={bg} />
        {track ? <path d={track} fill="none" stroke="currentColor" strokeDasharray="3 2" strokeWidth="1" /> : null}
        <text
          x={geom.cx}
          y={opening.wall === "FRONT" ? geom.cy + 14 : geom.cy - 8}
          textAnchor="middle"
          fontSize="9"
          className="fill-fg"
          fontFamily="var(--font-mono)"
        >
          {openingLabel(opening)}
        </text>
        <TagBubble mark={tag} x={tagX + tagShiftX} y={tagY} />
      </g>
    );
  }
  if (opening.kind === "MAN") {
    const swing = isHoriz
      ? `M ${geom.x1} ${opening.wall === "FRONT" ? geom.y1 : geom.y2} A ${opening.widthIn * s} ${opening.widthIn * s} 0 0 ${opening.wall === "FRONT" ? 0 : 1} ${geom.x1} ${opening.wall === "FRONT" ? geom.y1 - opening.widthIn * s : geom.y2 + opening.widthIn * s}`
      : `M ${opening.wall === "LEFT" ? geom.x2 : geom.x1} ${geom.y1} A ${opening.widthIn * s} ${opening.widthIn * s} 0 0 ${opening.wall === "LEFT" ? 1 : 0} ${opening.wall === "LEFT" ? geom.x2 + opening.widthIn * s : geom.x1 - opening.widthIn * s} ${geom.y1}`;
    return (
      <g className="text-muted">
        <rect x={geom.x1} y={geom.y1} width={Math.max(2, geom.x2 - geom.x1)} height={Math.max(2, geom.y2 - geom.y1)} fill={bg} />
        <path d={swing} fill="none" stroke="currentColor" strokeWidth="0.9" />
        <TagBubble mark={tag} x={tagX + tagShiftX} y={tagY} />
      </g>
    );
  }
  return (
    <g className="text-muted">
      <rect x={geom.x1} y={geom.y1} width={Math.max(2, geom.x2 - geom.x1)} height={Math.max(2, geom.y2 - geom.y1)} fill={bg} />
      <rect
        x={geom.x1 + 1}
        y={geom.y1 + 1}
        width={Math.max(1, geom.x2 - geom.x1 - 2)}
        height={Math.max(1, geom.y2 - geom.y1 - 2)}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
      />
      <TagBubble mark={tag} x={tagX + tagShiftX} y={isHoriz ? tagY : geom.cy} />
    </g>
  );
}

function NotesColumn({ bp, x, y }: { bp: Blueprint; x: number; y: number }) {
  const trade = citesTradewalk(bp);
  const openings = resolveOpenings(bp);
  const ohd = openings.filter((item) => item.kind === "OHD");
  const lines = trade
    ? [
        "GENERAL NOTES — TRADEWALK",
        "1. Working drawing citing A01–A08. Not PE-sealed.",
        "2. Dimensions govern. Do not scale the sheet.",
        `3. L-shape ${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)} (A01).`,
        `4. Mower shed ${formatFtIn(TRADEWALK.shedWidthIn)} × ${formatFtIn(TRADEWALK.shedDepthIn)}.`,
        "5. 2x4 walls, brick veneer, 1\" air, Tyvek (A06).",
        "6. 2x12 joists @ 16\" O.C. — LVL splits span (A07).",
        "7. 2x8 rafters @ 16\" O.C., 8/12 (A08).",
        "8. 12x24 footing, brick-ledge CMU (A03/A06).",
        "9. Murphy 1.75×20 LVL B1/B2/B3 PASSED.",
        ohd.length ? `10. ${ohd.length} OHD recorded.` : "10. Two OHD on A09 — leaf widths Unknown.",
        "11. A09 EV charger option · outlets per code.",
        "12. A11 half bath is an option — size Unknown.",
        "13. A01 tags SB3621 twice — 3'-6\"×2'-1\" window, wall Unknown. Not Simpson SSTB36.",
      ]
    : [
        "GENERAL NOTES",
        "1. Working drawing for field layout. Not PE-sealed.",
        "2. Dimensions govern. Do not scale the sheet.",
        `3. Walls drawn ${bp.studSize ? bp.studSize : "2x6 conven."} + sheathing.`,
        `4. Studs ${bp.studSize ?? "size Unknown"} @ ${bp.studSpacingIn ?? "—"}" O.C.`,
        `5. Joists ${bp.joistSize ?? "Unknown"} @ ${bp.joistSpacingIn ?? "—"}" O.C.`,
        `6. Roof ${bp.roofStyle ?? "gable"} ${bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "pitch Unknown"}.`,
        `7. Overhang ${formatFtIn(bp.overhangIn)}.`,
        "8. Frost / footing per AHJ. Do not guess.",
        openings.length ? `9. ${openings.length} opening(s) recorded.` : "9. No openings recorded yet.",
      ];
  return (
    <g className="text-muted">
      {lines.map((line, index) => (
        <text key={line} x={x} y={y + index * 12} fontSize={index === 0 ? 9 : 7.5} className={index === 0 ? "fill-fg" : undefined}>
          {line}
        </text>
      ))}
    </g>
  );
}

function partBox(originX: number, originY: number, s: number, part: PlanPart) {
  return {
    x: originX + part.xIn * s,
    y: originY + part.yIn * s,
    w: part.wIn * s,
    d: part.dIn * s,
  };
}

function wallHost(parts: PlanPart[], wall: WallFace): PlanPart {
  if (parts.length === 0) {
    return { id: "envelope", name: "", xIn: 0, yIn: 0, wIn: 0, dIn: 0 };
  }
  if (wall === "FRONT") return parts.reduce((a, b) => (a.yIn + a.dIn >= b.yIn + b.dIn ? a : b));
  if (wall === "BACK") return parts.reduce((a, b) => (a.yIn <= b.yIn ? a : b));
  if (wall === "LEFT") return parts.reduce((a, b) => (a.xIn <= b.xIn ? a : b));
  return parts.reduce((a, b) => (a.xIn + a.wIn >= b.xIn + b.wIn ? a : b));
}

function DoubleRect({
  x,
  y,
  w,
  d,
  t,
  hatch,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  t: number;
  hatch?: string;
}) {
  return (
    <g>
      <path
        d={`M ${x} ${y} h ${w} v ${d} h ${-w} z M ${x + t} ${y + t} h ${w - 2 * t} v ${d - 2 * t} h ${-(w - 2 * t)} z`}
        fill="currentColor"
        fillOpacity="0.16"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {hatch ? (
        <rect
          x={x + t}
          y={y + t}
          width={Math.max(0, w - 2 * t)}
          height={Math.max(0, d - 2 * t)}
          fill={hatch}
          className="text-subtle"
        />
      ) : null}
    </g>
  );
}

function PlanView({
  bp,
  level,
  scaleId,
  editable,
  onSelectDim,
  onRoomDrag,
  compact,
}: {
  bp: Blueprint;
  level: number;
  scaleId: DrawingScaleId;
  editable?: boolean;
  onSelectDim?: (target: DimTarget) => void;
  onRoomDrag?: (drag: RoomDrag) => void;
  compact?: boolean;
}) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label={`Level ${level} — envelope Unknown`} />;
  }
  const width = bp.widthIn;
  const depth = bp.depthIn;
  const layout = planLayout(width, depth, scaleId, { x: 56, y: 36, w: compact ? 600 : 430, h: compact ? 460 : 400 });
  const { x, y, w, d, s, fits } = layout;
  const t = wallThicknessIn(bp) * s;
  const parts = planParts(bp, level);
  const lShape = isLFootprint(bp, level);
  const rooms = Object.values(bp.rooms).filter((room) => room.level === level);
  const openings = resolveOpenings(bp).filter((item) => (level === 1 ? true : item.kind === "WINDOW"));
  const trade = citesTradewalk(bp);
  const hasOhd = openings.some((item) => item.kind === "OHD");
  const schedule = openingSchedule(bp);
  const markById = new Map(schedule.filter((row) => !row.missing).map((row) => [row.id, row.mark]));
  const envelopeProv = bp.envelopeProvenance ?? "UNKNOWN";

  return (
    <g>
      {!fits ? (
        <text x="56" y="24" fontSize="10" className="fill-warn">
          Envelope does not fit at {scaleLabel(scaleId)}. Switch scale or use Fit to sheet.
        </text>
      ) : null}
      {lShape
        ? parts.map((part) => {
            const box = partBox(x, y, s, part);
            return (
              <g key={part.id}>
                <DoubleRect x={box.x} y={box.y} w={box.w} d={box.d} t={t} hatch={`url(#slab-L${level})`} />
                <text
                  x={box.x + box.w / 2}
                  y={box.y + box.d / 2 - 6}
                  textAnchor="middle"
                  fontSize="12"
                  className="fill-fg"
                  fontFamily="var(--font-display)"
                >
                  {part.name.toUpperCase()}
                </text>
                <text
                  x={box.x + box.w / 2}
                  y={box.y + box.d / 2 + 10}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  className="text-muted"
                >
                  {formatFtIn(part.wIn)} × {formatFtIn(part.dIn)}
                </text>
              </g>
            );
          })
        : (
          <DoubleRect x={x} y={y} w={w} d={d} t={t} hatch={`url(#slab-L${level})`} />
        )}
      {openings.map((opening) => {
        const host = wallHost(parts, opening.wall);
        const box = partBox(x, y, s, host);
        return <OpeningMark key={opening.id} opening={opening} box={box} s={s} t={t} mark={markById.get(opening.id)} />;
      })}
      {lShape
        ? null
        : rooms.map((room) => {
            if (room.widthIn && room.depthIn && room.originXIn != null && room.originYIn != null) {
              const full = room.originXIn === 0 && room.originYIn === 0 && room.widthIn === width && room.depthIn === depth;
              if (full) return null;
              return (
                <RoomShape
                  key={room.id}
                  roomId={room.id}
                  name={room.name}
                  x={x + room.originXIn * s}
                  y={y + room.originYIn * s}
                  w={room.widthIn * s}
                  d={room.depthIn * s}
                  s={s}
                  originXIn={room.originXIn}
                  originYIn={room.originYIn}
                  widthIn={room.widthIn}
                  depthIn={room.depthIn}
                  envelope={{ x, y, w, d, widthIn: width, depthIn: depth }}
                  editable={editable}
                  onSelectDim={onSelectDim}
                  onRoomDrag={onRoomDrag}
                />
              );
            }
            return null;
          })}
      {!lShape ? (
        <text x={x + w / 2} y={y + d / 2 - 6} textAnchor="middle" fontSize="13" className="fill-fg" fontFamily="var(--font-display)">
          {rooms.find((room) => room.widthIn && room.depthIn)?.name ?? (level === 1 ? "GARAGE" : "LEVEL 2")}
        </text>
      ) : null}
      {rooms.filter((room) => !(room.widthIn && room.depthIn)).length > 0 ? (
        <text x={x + t + 8} y={y + d - t - 8} fontSize="9" className="fill-warn">
          Size Unknown:{" "}
          {rooms
            .filter((room) => !(room.widthIn && room.depthIn))
            .map((room) => room.name)
            .join(" · ")}
        </text>
      ) : null}
      {trade && !hasOhd && level === 1 ? (
        <g className="text-muted">
          <text x={x + w * 0.35} y={y + d - 10} textAnchor="middle" fontSize="7" className="fill-warn">
            2 GARAGE DOOR OPENERS (A09) — leaf widths Unknown
          </text>
        </g>
      ) : null}
      {trade && level === 1 ? (
        <g className="text-muted">
          <rect x={x - 70} y={y + 8} width="62" height={d * 0.42} fill="none" stroke="currentColor" strokeDasharray="5 3" />
          <text x={x - 39} y={y + d * 0.22} textAnchor="middle" fontSize="7">
            EXISTING
          </text>
          <text x={x - 39} y={y + d * 0.22 + 10} textAnchor="middle" fontSize="7">
            HOUSE
          </text>
          <text x={x - 39} y={y + d * 0.22 + 20} textAnchor="middle" fontSize="6">
            size not on set
          </text>
          <rect x={x - 70} y={y + d * 0.52} width="62" height={d * 0.28} fill="none" stroke="currentColor" strokeDasharray="5 3" />
          <text x={x - 39} y={y + d * 0.64} textAnchor="middle" fontSize="7">
            EXISTING
          </text>
          <text x={x - 39} y={y + d * 0.64 + 10} textAnchor="middle" fontSize="7">
            GARAGE
          </text>
          <text x={x + 14} y={y + 18} fontSize="8" className="fill-warn">
            STAIRWELL DN — run Unknown
          </text>
        </g>
      ) : null}
      {dimHorizontal(
        x,
        x + w,
        y + d + 28,
        y + d,
        formatFtIn(width),
        editable ? () => onSelectDim?.({ kind: "width" }) : undefined,
        envelopeProv,
      )}
      {dimVertical(
        x - 28,
        y,
        y + d,
        x,
        formatFtIn(depth),
        editable ? () => onSelectDim?.({ kind: "depth" }) : undefined,
        envelopeProv,
      )}
      {lShape
        ? parts.map((part) => {
            if (part.xIn === 0 && part.yIn === 0) return null;
            const box = partBox(x, y, s, part);
            return (
              <g key={`dim-${part.id}`}>
                {dimHorizontal(box.x, box.x + box.w, box.y - 16, box.y, formatFtIn(part.wIn), undefined, "VERIFIED")}
                {dimVertical(box.x + box.w + 16, box.y, box.y + box.d, box.x + box.w, formatFtIn(part.dIn), undefined, "VERIFIED")}
              </g>
            );
          })
        : null}
      <text x={x} y={y + d + 42} fontSize="7" className="fill-fg">
        OVERALL {DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"]} · {PROVENANCE_LABEL[envelopeProv]}
      </text>
      {trade ? (
        <text x={x} y={y + d + 54} fontSize="6.5" className="text-muted">
          FRAMING {formatFtIn(TRADEWALK.framingOuterWidthIn)} × {formatFtIn(TRADEWALK.framingOuterDepthIn)} TO FACE OF
          FRAMING (A07)
        </text>
      ) : null}
      {!compact && level === 1 ? (
        <g>
          <SectionMarker x={x + w * 0.38} y1={y - 6} y2={y + d + 6} mark="A" sheet="A05" />
          <ElevMarker x={x + w * 0.72} y={y + d + 6} face="S" sheet="A04" />
          <ElevMarker x={x + w * 0.72} y={y - 6} face="N" sheet="A04" />
          <ElevMarker x={x - 20} y={y + d * 0.22} face="W" sheet="A04" />
          <ElevMarker x={x + w + 22} y={y + d * 0.22} face="E" sheet="A04" />
          <Leader n={8} ax={x + 10} ay={y + 20} lx={x + 36} ly={y - 18} />
          <text x={x + 44} y={y - 16} fontSize="6.5" className="fill-fg">
            TYP WALL A06
          </text>
        </g>
      ) : null}
      <NorthArrow x={Math.min(x + w + 22, 470)} y={y + 14} />
      <GraphicScaleBar s={s} x={x} y={Math.min(y + d + 66, 548)} maxFeet={Math.max(8, Math.round(width / 12))} />
      {compact || trade ? null : <NotesColumn bp={bp} x={520} y={40} />}
      {!compact && trade && lShape && parts[0] && parts[1] && level === 1 ? (
        <g>
          <Leader n={1} ax={partBox(x, y, s, parts[0]).x + partBox(x, y, s, parts[0]).w / 2} ay={partBox(x, y, s, parts[0]).y + 24} lx={500} ly={58} />
          <Leader n={2} ax={partBox(x, y, s, parts[1]).x + partBox(x, y, s, parts[1]).w / 2} ay={partBox(x, y, s, parts[1]).y + 18} lx={500} ly={72} />
          <Leader n={3} ax={x + w * 0.35} ay={y + d} lx={500} ly={86} />
          <Leader n={6} ax={x + 28} ay={y + d * 0.4} lx={500} ly={128} />
          <KeynoteLegend x={488} y={44} items={sheetNotes(bp, "L1")} />
          <DesignCriteriaBlock bp={bp} x={488} y={260} />
        </g>
      ) : null}
      {!compact && trade && level === 2 ? (
        <KeynoteLegend x={488} y={44} items={sheetNotes(bp, "L2")} />
      ) : null}
      {!compact && level === 1 ? (
        <OpeningScheduleTable bp={bp} x={24} y={Math.min(y + d + 82, 500)} />
      ) : null}
    </g>
  );
}

function RoomShape({
  roomId,
  name,
  x,
  y,
  w,
  d,
  s,
  originXIn,
  originYIn,
  widthIn,
  depthIn,
  envelope,
  editable,
  onSelectDim,
  onRoomDrag,
}: {
  roomId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  s: number;
  originXIn: number;
  originYIn: number;
  widthIn: number;
  depthIn: number;
  envelope: { x: number; y: number; w: number; d: number; widthIn: number; depthIn: number };
  editable?: boolean;
  onSelectDim?: (target: DimTarget) => void;
  onRoomDrag?: (drag: RoomDrag) => void;
}) {
  const [live, setLive] = useState<{ x: number; y: number; w: number; d: number } | null>(null);
  const draw = live ?? { x, y, w, d };

  function start(kind: "move" | "resize", event: React.PointerEvent<SVGElement>) {
    if (!editable || !onRoomDrag) return;
    const commit = onRoomDrag;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = pointerSvg(event, event.currentTarget);

    function move(ev: PointerEvent) {
      const now = pointerSvg(ev, event.currentTarget);
      const dInX = (now.x - origin.x) / s;
      const dInY = (now.y - origin.y) / s;
      if (kind === "move") {
        const ox = Math.max(0, Math.min(envelope.widthIn - widthIn, originXIn + dInX));
        const oy = Math.max(0, Math.min(envelope.depthIn - depthIn, originYIn + dInY));
        setLive({ x: envelope.x + ox * s, y: envelope.y + oy * s, w, d });
      } else {
        const nw = Math.max(24, Math.min(envelope.widthIn - originXIn, widthIn + dInX));
        const nd = Math.max(24, Math.min(envelope.depthIn - originYIn, depthIn + dInY));
        setLive({ x, y, w: nw * s, d: nd * s });
      }
    }

    function up(ev: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const now = pointerSvg(ev, event.currentTarget);
      const dInX = (now.x - origin.x) / s;
      const dInY = (now.y - origin.y) / s;
      if (Math.hypot(dInX, dInY) < 0.75) {
        setLive(null);
        return;
      }
      if (kind === "move") {
        const ox = Math.round(Math.max(0, Math.min(envelope.widthIn - widthIn, originXIn + dInX)));
        const oy = Math.round(Math.max(0, Math.min(envelope.depthIn - depthIn, originYIn + dInY)));
        commit({ roomId, originXIn: ox, originYIn: oy });
      } else {
        const nw = Math.round(Math.max(24, Math.min(envelope.widthIn - originXIn, widthIn + dInX)));
        const nd = Math.round(Math.max(24, Math.min(envelope.depthIn - originYIn, depthIn + dInY)));
        commit({ roomId, originXIn, originYIn, widthIn: nw, depthIn: nd });
      }
      setLive(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <g className="text-muted">
      <rect
        x={draw.x}
        y={draw.y}
        width={draw.w}
        height={draw.d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 3"
        className={editable ? "cursor-grab" : undefined}
        onPointerDown={(event) => start("move", event)}
      />
      <text
        x={draw.x + draw.w / 2}
        y={draw.y + draw.d / 2}
        textAnchor="middle"
        fontSize="11"
        className="fill-fg cursor-pointer"
        onClick={() => onSelectDim?.({ kind: "room", roomId, field: "name" })}
      >
        {name}
      </text>
      <text
        x={draw.x + draw.w / 2}
        y={draw.y + draw.d / 2 + 14}
        textAnchor="middle"
        fontSize="9"
        className={editable ? "cursor-pointer fill-fg" : undefined}
        onClick={() => onSelectDim?.({ kind: "room", roomId, field: "width" })}
      >
        {formatFtIn(widthIn)} × {formatFtIn(depthIn)}
      </text>
      {editable ? (
        <rect
          x={draw.x + draw.w - 8}
          y={draw.y + draw.d - 8}
          width="10"
          height="10"
          className="fill-fg cursor-nwse-resize"
          onPointerDown={(event) => start("resize", event)}
        />
      ) : null}
    </g>
  );
}

function MiniElevation({
  bp,
  face,
  x,
  y,
  w,
  h,
}: {
  bp: Blueprint;
  face: WallFace;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  if (!bp.widthIn || !bp.depthIn || !bp.eaveHeightIn || !bp.roofRise || !bp.roofRun) return null;
  const span = face === "FRONT" || face === "BACK" ? bp.widthIn : bp.depthIn;
  const eave = bp.eaveHeightIn;
  const rise = ridgeRiseIn(bp) ?? 0;
  const ridge = eave + rise;
  const overhang = bp.overhangIn ?? 0;
  const used = Math.min(w / (span + 2 * overhang), (h - 28) / (ridge + 24));
  const wallW = span * used;
  const wall = eave * used;
  const peak = ridge * used;
  const oh = overhang * used;
  const gx = x + (w - wallW) / 2;
  const ground = y + h - 18;
  const eaveY = ground - wall;
  const peakY = ground - peak;
  const mid = gx + wallW / 2;
  const openings = resolveOpenings(bp).filter((item) => item.wall === face);
  const labels: Record<WallFace, string> = { FRONT: "FRONT", BACK: "BACK", LEFT: "LEFT SIDE", RIGHT: "RIGHT SIDE" };
  const trade = citesTradewalk(bp);
  const matchNote =
    trade && (face === "FRONT" || face === "RIGHT" || face === "BACK" || face === "LEFT")
      ? face === "FRONT" || face === "RIGHT"
        ? "SOLDIER COURSE · QUOINS · EAVE RETURN TO MATCH EXISTING"
        : "SOLDIER COURSE · QUOINS TO MATCH EXISTING HOUSE"
      : null;
  return (
    <g>
      <text x={x + w / 2} y={y + 12} textAnchor="middle" fontSize="9" className="fill-fg">
        {labels[face]}
      </text>
      <line x1={x + 8} y1={ground} x2={x + w - 8} y2={ground} stroke="currentColor" strokeWidth="1.2" />
      <polygon
        points={`${gx - oh},${eaveY} ${mid},${peakY} ${gx + wallW + oh},${eaveY} ${gx + wallW},${eaveY} ${gx + wallW},${ground} ${gx},${ground} ${gx},${eaveY}`}
        fill="color-mix(in oklab, var(--color-accent) 8%, transparent)"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect x={gx} y={eaveY} width={wallW} height={wall} fill={trade ? `url(#brick-EL)` : `url(#siding-EL)`} className="text-subtle" />
      {trade ? (
        <g className="text-muted">
          <rect x={gx} y={eaveY} width={wallW} height={Math.max(3, 8 * used)} fill="currentColor" fillOpacity="0.35" />
          <rect x={gx} y={eaveY} width={Math.max(4, 6 * used)} height={wall} fill="none" stroke="currentColor" strokeWidth="0.7" />
          <rect x={gx + wallW - Math.max(4, 6 * used)} y={eaveY} width={Math.max(4, 6 * used)} height={wall} fill="none" stroke="currentColor" strokeWidth="0.7" />
        </g>
      ) : null}
      {openings.map((opening) => {
        const ox = gx + opening.offsetIn * used;
        const ow = opening.widthIn * used;
        const ohgt = (opening.heightIn ?? 84) * used;
        const sill = (opening.sillIn ?? 0) * used;
        return (
          <rect
            key={opening.id}
            x={ox}
            y={ground - sill - ohgt}
            width={ow}
            height={ohgt}
            fill="var(--color-bg)"
            stroke="currentColor"
            strokeWidth="1"
          />
        );
      })}
      <text x={x + 10} y={eaveY + 12} fontSize="7" className="text-muted">
        {formatFtIn(eave)}
      </text>
      {matchNote ? (
        <text x={x + w / 2} y={ground + 12} textAnchor="middle" fontSize="6" className="text-muted">
          {matchNote}
        </text>
      ) : null}
    </g>
  );
}

function ElevationView({
  bp,
  scaleId,
  editable,
  onSelectDim,
}: {
  bp: Blueprint;
  scaleId: DrawingScaleId;
  editable?: boolean;
  onSelectDim?: (target: DimTarget) => void;
}) {
  if (!envelopeComplete(bp) || bp.widthIn == null || !bp.eaveHeightIn || !bp.roofRise || !bp.roofRun) {
    return (
      <EmptySheet
        label={
          !bp.widthIn
            ? "Elevation — envelope Unknown"
            : !bp.eaveHeightIn
              ? "Wall height Unknown"
              : "Roof pitch Unknown — enter rise over run (8/12)"
        }
      />
    );
  }
  const trade = citesTradewalk(bp);
  return (
    <g>
      <MiniElevation bp={bp} face="FRONT" x={40} y={24} w={320} h={250} />
      <MiniElevation bp={bp} face="RIGHT" x={360} y={24} w={320} h={250} />
      <MiniElevation bp={bp} face="BACK" x={40} y={280} w={320} h={250} />
      <MiniElevation bp={bp} face="LEFT" x={360} y={280} w={320} h={250} />
      <g className="text-muted">
        <text x="40" y="548" fontSize="8">
          {trade
            ? "A04: soldier course, quoins, eave return to match existing. Brick veneer R703.8. Adjust shed height for grade."
            : `Scale ${scaleLabel(scaleId)} · click eave on Plans to edit ${formatFtIn(bp.eaveHeightIn)}.`}
        </text>
        {editable ? (
          <text
            x="40"
            y="562"
            fontSize="8"
            className="fill-fg cursor-pointer"
            onClick={() => onSelectDim?.({ kind: "eave" })}
          >
            EAVE {formatFtIn(bp.eaveHeightIn)} — click to edit
          </text>
        ) : null}
      </g>
    </g>
  );
}

function FoundationView({ bp, scaleId }: { bp: Blueprint; scaleId: DrawingScaleId }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label="Foundation — envelope Unknown" />;
  }
  const width = bp.widthIn;
  const depth = bp.depthIn;
  const layout = planLayout(width, depth, scaleId, { x: 56, y: 40, w: 430, h: 400 });
  const { x, y, w, d, s } = layout;
  const parts = planParts(bp, 1);
  const lShape = isLFootprint(bp, 1);
  const trade = citesTradewalk(bp);
  return (
    <g>
      {(lShape ? parts : [{ id: "env", name: "SLAB", xIn: 0, yIn: 0, wIn: width, dIn: depth }]).map((part) => {
        const box = partBox(x, y, s, part);
        return (
          <g key={part.id}>
            <rect
              x={box.x - 6}
              y={box.y - 6}
              width={box.w + 12}
              height={box.d + 12}
              fill="none"
              stroke="currentColor"
              strokeDasharray="4 3"
              strokeWidth="1"
            />
            <rect x={box.x} y={box.y} width={box.w} height={box.d} fill={`url(#slab-FDN)`} className="text-subtle" stroke="currentColor" strokeWidth="1.4" />
            <text x={box.x + box.w / 2} y={box.y + box.d / 2} textAnchor="middle" fontSize="11" className="fill-fg">
              SLAB
            </text>
          </g>
        );
      })}
      {trade ? (
        <g className="text-muted">
          <rect x={x + w * 0.42} y={y + d * 0.38} width={24 * s} height={24 * s} fill="none" stroke="currentColor" strokeWidth="1.4" />
          <text x={x + w * 0.42 + 12 * s} y={y + d * 0.38 - 6} textAnchor="middle" fontSize="8" className="fill-fg">
            2'×2'×2' PIER TO SUPPORT LVL (A03)
          </text>
          <rect x={x + 8} y={y + d * 0.55} width={w * 0.18} height="10" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
          <text x={x + 12} y={y + d * 0.55 + 22} fontSize="8">
            THICKEN PAD FOR WALL SUPPORTING FLOOR JOISTS (A03)
          </text>
        </g>
      ) : null}
      {dimHorizontal(x, x + w, y + d + 28, y + d, formatFtIn(width))}
      {dimVertical(x - 28, y, y + d, x, formatFtIn(depth))}
      {trade ? (
        <KeynoteLegend x={488} y={48} items={sheetNotes(bp, "FDN")} />
      ) : (
        <NotesColumn bp={bp} x={520} y={40} />
      )}
      <text x="56" y="24" fontSize="10" className="fill-fg">
        {trade ? "A03 FOUNDATION — 12x24 footing (dashed), slab, LVL pier. Place the pier on the recorded CL." : "Foundation — footing dashed. Frost Unknown unless entered."}
      </text>
      <GraphicScaleBar s={s} x={x} y={Math.min(y + d + 50, 540)} maxFeet={Math.max(8, Math.round(width / 12))} />
    </g>
  );
}

function BuildingSectionView({ bp }: { bp: Blueprint }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || !bp.eaveHeightIn || !bp.roofRise || !bp.roofRun) {
    return <EmptySheet label="Building section — envelope or pitch Unknown" />;
  }
  const span = bp.widthIn;
  const eave = bp.eaveHeightIn;
  const rise = ridgeRiseIn(bp) ?? 0;
  const ridge = eave + rise;
  const used = Math.min(560 / span, 360 / (ridge + 48));
  const x = 70;
  const ground = 500;
  const w = span * used;
  const wall = eave * used;
  const peak = ridge * used;
  const eaveY = ground - wall;
  const peakY = ground - peak;
  const mid = x + w / 2;
  return (
    <g>
      <rect x="40" y={ground} width="620" height="40" fill={`url(#earth-SEC)`} className="text-subtle" />
      <line x1="40" y1={ground} x2="660" y2={ground} stroke="currentColor" strokeWidth="1.5" />
      <rect x={x} y={eaveY} width="10" height={wall} fill={`url(#cmu-SEC)`} stroke="currentColor" />
      <rect x={x + w - 10} y={eaveY} width="10" height={wall} fill={`url(#cmu-SEC)`} stroke="currentColor" />
      <rect x={x} y={ground - 8} width={w} height="8" fill="currentColor" fillOpacity="0.2" />
      <line x1={x} y1={eaveY} x2={mid} y2={peakY} stroke="currentColor" strokeWidth="1.6" />
      <line x1={x + w} y1={eaveY} x2={mid} y2={peakY} stroke="currentColor" strokeWidth="1.6" />
      <line x1={x + 10} y1={eaveY + 8} x2={x + w - 10} y2={eaveY + 8} stroke="currentColor" strokeWidth="2.2" />
      <text x={mid} y={eaveY + 22} textAnchor="middle" fontSize="9" className="fill-fg">
        {bp.joistSize ?? "JOISTS"} @ {bp.joistSpacingIn ?? "—"}" O.C.
      </text>
      {dimVertical(x - 24, ground, eaveY, x, `EAVE ${formatFtIn(eave)}`)}
      {dimVertical(x - 48, ground, peakY, x, `RIDGE ${formatFtIn(ridge)}`)}
      {dimHorizontal(x, x + w, ground + 22, ground, formatFtIn(span))}
      <text x="70" y="36" fontSize="11" className="fill-fg">
        BUILDING SECTION — {bp.roofRise}/{bp.roofRun} · {bp.studSize ?? "studs Unknown"} · working drawing
      </text>
      <text x="70" y="52" fontSize="9" className="text-muted">
        {citesTradewalk(bp)
          ? "A05: 10'-0\" first-floor walls (Stanfield + A05). 2x12 floor, 2x8 rafters. Not a PE stamp."
          : "Cut through the envelope. AHJ governs frost and footing."}
      </text>
      <StairLimitsBlock bp={bp} x={488} y={48} />
    </g>
  );
}

function WallSectionView({ bp }: { bp: Blueprint }) {
  const trade = citesTradewalk(bp);
  const ground = 430;
  const eave = 430 - 180;
  const ridge = eave - 90;
  return (
    <g>
      <text x="48" y="32" fontSize="12" className="fill-fg" fontFamily="var(--font-display)">
        WALL SECTION DETAIL {trade ? "— A06 RECORDED ASSEMBLY" : ""}
      </text>
      <text x="48" y="48" fontSize="9" className="text-muted">
        NTS (detail). Layers from the Tradewalk wall section — not guessed.
      </text>
      <rect x="40" y={ground} width="280" height="90" fill={`url(#earth-WALL)`} className="text-subtle" />
      <line x1="40" y1={ground} x2="360" y2={ground} stroke="currentColor" strokeWidth="1.4" />
      <rect x="110" y={ground + 8} width="72" height="36" fill="currentColor" fillOpacity="0.18" stroke="currentColor" />
      <text x="146" y={ground + 30} textAnchor="middle" fontSize="8" className="fill-fg">
        12x24 FTNG
      </text>
      <rect x="122" y={ground - 52} width="36" height="60" fill={`url(#cmu-WALL)`} stroke="currentColor" />
      <rect x="158" y={ground - 52} width="16" height="22" fill={`url(#cmu-WALL)`} stroke="currentColor" />
      <text x="190" y={ground - 30} fontSize="8">
        12" BLOCK BRICK LEDGE + 8" TOP
      </text>
      <rect x="70" y={ground - 8} width="52" height="8" fill="currentColor" fillOpacity="0.25" />
      <rect x="70" y={ground} width="52" height="10" fill={`url(#gravel-WALL)`} />
      <text x="48" y={ground + 28} fontSize="7">
        4" GRAVEL · VAPOR · SLAB
      </text>
      <circle cx="96" cy={ground + 18} r="5" fill="none" stroke="currentColor" />
      <text x="48" y={ground + 48} fontSize="7">
        4" HDPE DRAIN + FABRIC
      </text>
      <rect x="148" y={eave} width="8" height={ground - 52 - eave} fill={`url(#brick-WALL)`} stroke="currentColor" />
      <rect x="140" y={eave} width="8" height={ground - 52 - eave} fill="none" stroke="currentColor" strokeDasharray="2 2" />
      <rect x="132" y={eave} width="8" height={ground - 52 - eave} fill={`url(#batt-WALL)`} stroke="currentColor" />
      <rect x="118" y={eave} width="14" height={ground - 52 - eave} fill="currentColor" fillOpacity="0.12" stroke="currentColor" />
      <rect x="118" y={eave} width="38" height="8" fill="currentColor" fillOpacity="0.35" />
      <text x="190" y={eave + 20} fontSize="8">
        DBL TOP PLATE
      </text>
      <text x="190" y={eave + 36} fontSize="8">
        2x4 EXTERIOR WALL · R-13 MIN.
      </text>
      <text x="190" y={eave + 50} fontSize="8">
        SHEATHING · TYVEK · 1" AIR GAP
      </text>
      <text x="190" y={eave + 64} fontSize="8">
        BRICK + METAL TIES 16" V / 16" H
      </text>
      <line x1="80" y1={eave + 10} x2="250" y2={eave + 10} stroke="currentColor" strokeWidth="2" />
      <text x="190" y={eave} fontSize="8" className="fill-fg">
        2x12 FLOOR JOISTS 16" O.C. · R-19 MIN.
      </text>
      <line x1="118" y1={eave} x2="210" y2={ridge} stroke="currentColor" strokeWidth="1.5" />
      <text x="220" y={ridge + 16} fontSize="8">
        2x8 RAFTERS 16" O.C. · 8/12 · R-38 MIN.
      </text>
      <text x="190" y={ground - 60} fontSize="8">
        TREATED SILL · CAST-IN-PLACE AB
      </text>
      <text x="190" y={ground - 46} fontSize="8">
        VERT. REBAR IN GROUT-FILLED CORE
      </text>
      <Leader n={1} ax={146} ay={ground + 20} lx={400} ly={86} />
      <Leader n={2} ax={96} ay={ground + 18} lx={400} ly={100} />
      <Leader n={3} ax={140} ay={ground - 40} lx={400} ly={114} />
      <Leader n={4} ax={125} ay={(eave + ground - 52) / 2} lx={400} ly={128} />
      <Leader n={5} ax={144} ay={(eave + ground - 52) / 2} lx={400} ly={142} />
      <Leader n={6} ax={152} ay={eave + 20} lx={400} ly={156} />
      <Leader n={7} ax={160} ay={eave + 8} lx={400} ly={170} />
      <Leader n={8} ax={200} ay={ridge + 8} lx={400} ly={184} />
      <KeynoteLegend
        x={388}
        y={72}
        title="A06 ASSEMBLY — FOLLOW THE LAYERS"
        items={sheetNotes(bp, "WALL")}
      />
    </g>
  );
}

function RoofView({ bp, scaleId }: { bp: Blueprint; scaleId: DrawingScaleId }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label="Roof plan — envelope Unknown" />;
  }
  if (!bp.roofRise || !bp.roofRun) {
    return <EmptySheet label="Roof plan — pitch Unknown. Enter rise over run (8/12)." />;
  }
  const width = bp.widthIn;
  const depth = bp.depthIn;
  const oh = bp.overhangIn ?? 0;
  const layout = planLayout(width + 2 * oh, depth + 2 * oh, scaleId, { x: 56, y: 40, w: 430, h: 360 });
  const { x, y, w, d, s } = layout;
  const inner = { x: x + oh * s, y: y + oh * s, w: width * s, d: depth * s };
  const spacing = bp.rafterSpacingIn ?? 24;
  const marks = stations(depth, spacing);
  const ridgeY = inner.y + inner.d / 2;
  const parts = planParts(bp, 1);
  const lShape = isLFootprint(bp, 1);
  return (
    <g>
      <rect x={x} y={y} width={w} height={d} fill="none" stroke="currentColor" strokeDasharray="4 3" strokeWidth="1" />
      {lShape
        ? parts.map((part) => {
            const box = partBox(inner.x, inner.y, s, part);
            return <rect key={part.id} x={box.x} y={box.y} width={box.w} height={box.d} fill="none" stroke="currentColor" strokeWidth="1.5" />;
          })
        : <rect x={inner.x} y={inner.y} width={inner.w} height={inner.d} fill="none" stroke="currentColor" strokeWidth="1.5" />}
      <line x1={inner.x} y1={ridgeY} x2={inner.x + inner.w} y2={ridgeY} stroke="currentColor" strokeWidth="2" />
      <text x={inner.x + inner.w / 2} y={ridgeY - 6} textAnchor="middle" fontSize="10" className="fill-fg">
        RIDGE · rise {formatFtIn(ridgeRiseIn(bp))} · {bp.roofRise}/{bp.roofRun}
      </text>
      {marks.map((station, index) => (
        <line key={index} x1={inner.x} y1={inner.y + station * s} x2={inner.x + inner.w} y2={inner.y + station * s} stroke="currentColor" strokeWidth="0.7" className="text-muted" />
      ))}
      <text x={inner.x + 8} y={inner.y + 16} fontSize="9" className="fill-fg">
        Rafters {bp.rafterSize ?? "size Unknown"} @ {spacing}" O.C. · {memberCount(depth, spacing)} each slope
      </text>
      <text x={inner.x + 8} y={inner.y + inner.d - 10} fontSize="9" className="text-muted">
        Overhang {formatFtIn(oh)} (dashed) · slope length {formatFtIn(rafterLengthIn(bp))}
        {citesTradewalk(bp) ? " · A04: adjust shed height for grade" : ""}
      </text>
      {dimHorizontal(inner.x, inner.x + inner.w, inner.y + inner.d + 36, inner.y + inner.d, formatFtIn(width))}
      {dimVertical(inner.x - 28, inner.y, inner.y + inner.d, inner.x, formatFtIn(depth))}
      {citesTradewalk(bp) ? (
        <KeynoteLegend x={488} y={48} items={sheetNotes(bp, "ROOF")} />
      ) : (
        <NotesColumn bp={bp} x={520} y={40} />
      )}
      <GraphicScaleBar s={s} x={56} y={520} maxFeet={Math.max(8, Math.round(width / 12))} />
    </g>
  );
}

function JoistView({ bp, scaleId }: { bp: Blueprint; scaleId: DrawingScaleId }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label="Joist layout — envelope Unknown" />;
  }
  const span = joistSpanIn(bp);
  const spacing = bp.joistSpacingIn;
  const layout = planLayout(bp.widthIn, bp.depthIn, scaleId, { x: 40, y: 52, w: 420, h: 360 });
  const { x, y, w, d, s } = layout;
  const allowedJoist = bp.joistSize && bp.joistSpacingIn ? tabulatedJoistSpanIn(bp.joistSize, bp.joistSpacingIn) : null;
  const over = span != null && allowedJoist != null && span > allowedJoist;
  const thick = Math.max(1.3, lumberThicknessIn() * s);
  const parts = planParts(bp, 1);
  const lShape = isLFootprint(bp, 1);
  const trade = citesTradewalk(bp);
  const alongDepth = bp.joistDirection !== "DEPTH";
  const bodies = lShape ? parts : [{ id: "env", name: "JOISTS", xIn: 0, yIn: 0, wIn: bp.widthIn, dIn: bp.depthIn }];
  const first = bodies[0];
  const firstBox = first ? partBox(x, y, s, first) : null;
  const firstMarks = first && spacing ? stations(alongDepth ? first.dIn : first.wIn, spacing) : [];

  return (
    <g>
      {bodies.map((part) => {
        const box = partBox(x, y, s, part);
        const run = alongDepth ? part.dIn : part.wIn;
        const marks = spacing ? stations(run, spacing) : [];
        return (
          <g key={part.id}>
            <rect x={box.x} y={box.y} width={box.w} height={box.d} fill="none" stroke="currentColor" strokeWidth="2" />
            {marks.map((station, index) =>
              alongDepth ? (
                <rect key={index} x={box.x} y={box.y + station * s - thick / 2} width={box.w} height={thick} fill="currentColor" fillOpacity="0.82" />
              ) : (
                <rect key={index} x={box.x + station * s - thick / 2} y={box.y} width={thick} height={box.d} fill="currentColor" fillOpacity="0.82" />
              ),
            )}
            <text x={box.x + 8} y={box.y + 14} fontSize="8" className="fill-fg">
              {part.name.toUpperCase()} · {marks.length} {bp.joistSize ?? "joists"}
            </text>
          </g>
        );
      })}
      {spacing && firstBox && firstMarks.length >= 2 ? (
        dimVertical(
          firstBox.x - 22,
          firstBox.y + firstMarks[0] * s,
          firstBox.y + firstMarks[1] * s,
          firstBox.x,
          `${spacing}" O.C. TYP.`,
        )
      ) : (
        <text x={x + w / 2} y={y + d / 2} textAnchor="middle" fontSize="12" className="fill-warn">
          Joist spacing Unknown — enter 16 on center
        </text>
      )}
      {trade && firstBox ? (
        <g className="text-muted">
          <line x1={firstBox.x + firstBox.w * 0.42} y1={firstBox.y} x2={firstBox.x + firstBox.w * 0.42} y2={firstBox.y + firstBox.d} stroke="currentColor" strokeWidth="3.2" />
          <Leader n={1} ax={firstBox.x + firstBox.w * 0.42} ay={firstBox.y + 24} lx={500} ly={70} />
          <Leader n={2} ax={firstBox.x + firstBox.w * 0.42} ay={firstBox.y + firstBox.d * 0.55} lx={500} ly={84} />
          <circle cx={firstBox.x + firstBox.w * 0.42} cy={firstBox.y + firstBox.d * 0.72} r="7" fill="none" stroke="currentColor" strokeDasharray="3 2" />
          <Leader n={3} ax={firstBox.x + firstBox.w * 0.42} ay={firstBox.y + firstBox.d * 0.72} lx={500} ly={98} />
        </g>
      ) : null}
      <KeynoteLegend
        x={488}
        y={56}
        items={[
          ...sheetNotes(bp, "JOIST"),
          over
            ? `Unsplit ${formatFtIn(span)} exceeds table ${formatFtIn(allowedJoist)} · Table R502.3.1(2)`
            : `Unsplit ${formatFtIn(span)} vs table ${formatFtIn(allowedJoist)} · Table R502.3.1(2)`,
        ]}
      />
      {dimHorizontal(x, x + w, y + d + 28, y + d, formatFtIn(bp.widthIn))}
      {dimVertical(x - 36, y, y + d, x, formatFtIn(bp.depthIn))}
      <GraphicScaleBar s={s} x={x} y={Math.min(y + d + 50, 560)} maxFeet={Math.max(8, Math.round(bp.widthIn / 12))} />
    </g>
  );
}

function wallStudTicks(
  box: { x: number; y: number; w: number; d: number },
  s: number,
  spacing: number,
  t: number,
) {
  const top = stations(box.w / s, spacing);
  const side = stations(box.d / s, spacing);
  return (
    <g className="text-muted">
      {top.map((st, index) => (
        <line key={`t${index}`} x1={box.x + st * s} y1={box.y} x2={box.x + st * s} y2={box.y + t} stroke="currentColor" strokeWidth="1.15" />
      ))}
      {top.map((st, index) => (
        <line key={`b${index}`} x1={box.x + st * s} y1={box.y + box.d} x2={box.x + st * s} y2={box.y + box.d - t} stroke="currentColor" strokeWidth="1.15" />
      ))}
      {side.map((st, index) => (
        <line key={`l${index}`} x1={box.x} y1={box.y + st * s} x2={box.x + t} y2={box.y + st * s} stroke="currentColor" strokeWidth="1.15" />
      ))}
      {side.map((st, index) => (
        <line key={`r${index}`} x1={box.x + box.w} y1={box.y + st * s} x2={box.x + box.w - t} y2={box.y + st * s} stroke="currentColor" strokeWidth="1.15" />
      ))}
    </g>
  );
}

function StudView({ bp, scaleId }: { bp: Blueprint; scaleId: DrawingScaleId }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label="Wall framing — envelope Unknown" />;
  }
  if (!bp.studSpacingIn) {
    return <EmptySheet label="Stud spacing Unknown — enter 16 on center" />;
  }
  const spacing = bp.studSpacingIn;
  const layout = planLayout(bp.widthIn, bp.depthIn, scaleId, { x: 40, y: 52, w: 420, h: 360 });
  const { x, y, s } = layout;
  const parts = planParts(bp, 1);
  const t = Math.max(6, wallThicknessIn(bp) * s);
  const first = parts[0];
  const firstBox = first ? partBox(x, y, s, first) : null;
  const firstMarks = first ? stations(first.wIn, spacing) : [];
  const schedule = parts.map((part) => {
    const long = memberCount(part.wIn, spacing);
    const short = memberCount(part.dIn, spacing);
    return `${part.name.toUpperCase()}  ${formatFtIn(part.wIn)} × ${formatFtIn(part.dIn)}  ${bp.studSize ?? "studs"} @ ${spacing}"  ${long} / ${short}`;
  });
  return (
    <g>
      {parts.map((part) => {
        const box = partBox(x, y, s, part);
        return (
          <g key={part.id}>
            <DoubleRect x={box.x} y={box.y} w={box.w} d={box.d} t={t} />
            {wallStudTicks(box, s, spacing, t)}
            <text x={box.x + box.w / 2} y={box.y + box.d / 2} textAnchor="middle" fontSize="10" className="fill-fg">
              {part.name.toUpperCase()}
            </text>
          </g>
        );
      })}
      {firstBox && firstMarks.length >= 2
        ? dimHorizontal(firstBox.x + firstMarks[0] * s, firstBox.x + firstMarks[1] * s, firstBox.y - 14, firstBox.y, `${spacing}" O.C. TYP.`)
        : null}
      {firstBox ? <Leader n={1} ax={firstBox.x + 8} ay={firstBox.y + 8} lx={500} ly={70} /> : null}
      <KeynoteLegend x={488} y={56} items={[...sheetNotes(bp, "STUD"), ...schedule]} />
      {dimHorizontal(x, x + (bp.widthIn * s), y + (bp.depthIn * s) + 28, y + bp.depthIn * s, formatFtIn(bp.widthIn))}
    </g>
  );
}

function ElectricView({ bp, scaleId, level }: { bp: Blueprint; scaleId: DrawingScaleId; level: "garage" | "attic" }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label="Electric — envelope Unknown" />;
  }
  const layout = planLayout(bp.widthIn, bp.depthIn, scaleId, { x: 40, y: 52, w: 420, h: 360 });
  const { x, y, s } = layout;
  const parts = planParts(bp, level === "garage" ? 1 : 2);
  const garage = parts[0] ? partBox(x, y, s, parts[0]) : { x, y, w: 100, d: 100 };
  const shed = parts[1] ? partBox(x, y, s, parts[1]) : null;
  return (
    <g>
      {parts.map((part) => {
        const box = partBox(x, y, s, part);
        return (
          <g key={part.id}>
            <rect x={box.x} y={box.y} width={box.w} height={box.d} fill="none" stroke="currentColor" strokeWidth="1.6" />
            <text x={box.x + 8} y={box.y + 14} fontSize="8" className="fill-fg">
              {part.name.toUpperCase()}
            </text>
          </g>
        );
      })}
      {level === "garage" ? (
        <g>
          <Receptacle x={garage.x + 16} y={garage.y + garage.d * 0.3} gfi />
          <Receptacle x={garage.x + 16} y={garage.y + garage.d * 0.7} gfi />
          <Receptacle x={garage.x + garage.w - 16} y={garage.y + garage.d * 0.45} gfi />
          {shed ? <Receptacle x={shed.x + shed.w - 14} y={shed.y + shed.d * 0.5} gfi /> : null}
          <OpenerMark x={garage.x + garage.w * 0.32} y={garage.y + garage.d - 14} />
          <OpenerMark x={garage.x + garage.w * 0.68} y={garage.y + garage.d - 14} />
          <rect x={garage.x + garage.w - 36} y={garage.y + 10} width="24" height="16" fill="none" stroke="currentColor" strokeDasharray="3 2" />
          <text x={garage.x + garage.w - 24} y={garage.y + 21} textAnchor="middle" fontSize="6">
            EV
          </text>
          <SwitchMark x={garage.x + 20} y={garage.y + 18} label="S" />
          <Leader n={1} ax={garage.x + garage.w * 0.32} ay={garage.y + garage.d - 14} lx={500} ly={70} />
          <Leader n={2} ax={garage.x + 16} ay={garage.y + garage.d * 0.3} lx={500} ly={84} />
          <Leader n={3} ax={garage.x + garage.w - 24} ay={garage.y + 18} lx={500} ly={98} />
        </g>
      ) : (
        <g>
          {[0.25, 0.5, 0.75].flatMap((fx) =>
            [0.28, 0.55, 0.78].map((fy) => (
              <CeilingLight key={`${fx}-${fy}`} x={garage.x + garage.w * fx} y={garage.y + garage.d * fy} />
            )),
          )}
          <SwitchMark x={garage.x + 18} y={garage.y + garage.d - 16} label="S3" />
          <SwitchMark x={garage.x + 48} y={garage.y + garage.d - 16} label="S3" />
          <rect x={garage.x + garage.w - 40} y={garage.y + 12} width="28" height="18" fill="none" stroke="currentColor" strokeDasharray="3 2" />
          <text x={garage.x + garage.w - 26} y={garage.y + 24} textAnchor="middle" fontSize="6">
            MS
          </text>
          <Leader n={1} ax={garage.x + garage.w * 0.5} ay={garage.y + garage.d * 0.28} lx={500} ly={70} />
          <Leader n={2} ax={garage.x + 18} ay={garage.y + garage.d - 16} lx={500} ly={84} />
          <Leader n={3} ax={garage.x + garage.w - 26} ay={garage.y + 21} lx={500} ly={98} />
        </g>
      )}
      <g className="text-muted">
        <Receptacle x={56} y={530} gfi />
        <text x="70" y="534" fontSize="7">
          GFI · E3902.2
        </text>
        <OpenerMark x={67} y={552} />
        <text x="84" y="556" fontSize="7">
          Garage-door opener
        </text>
        <CeilingLight x={62} y={574} />
        <text x="74" y="578" fontSize="7">
          Can / ceiling light · S / S3 3-way · dashed = not placed
        </text>
      </g>
      <KeynoteLegend x={488} y={56} items={sheetNotes(bp, level === "garage" ? "ELEC" : "ELEC2")} />
    </g>
  );
}

function PlumbingView({ bp, scaleId }: { bp: Blueprint; scaleId: DrawingScaleId }) {
  if (!envelopeComplete(bp) || bp.widthIn == null || bp.depthIn == null) {
    return <EmptySheet label="Plumbing — envelope Unknown" />;
  }
  const layout = planLayout(bp.widthIn, bp.depthIn, scaleId, { x: 40, y: 52, w: 420, h: 360 });
  const { x, y, s } = layout;
  const parts = planParts(bp, 1);
  const garage = parts[0] ? partBox(x, y, s, parts[0]) : { x, y, w: 120, d: 120 };
  const opt = { x: garage.x + garage.w - 90, y: garage.y + garage.d - 80, w: 70, d: 54 };
  return (
    <g>
      {parts.map((part) => {
        const box = partBox(x, y, s, part);
        return (
          <g key={part.id}>
            <rect x={box.x} y={box.y} width={box.w} height={box.d} fill={`url(#slab-PLUMB)`} className="text-subtle" stroke="currentColor" strokeWidth="1.6" />
            <text x={box.x + box.w / 2} y={box.y + 16} textAnchor="middle" fontSize="10" className="fill-fg">
              {part.name.toUpperCase()}
            </text>
          </g>
        );
      })}
      <rect x={opt.x} y={opt.y} width={opt.w} height={opt.d} fill="none" stroke="currentColor" strokeDasharray="4 3" />
      <text x={opt.x + opt.w / 2} y={opt.y + 14} textAnchor="middle" fontSize="7" className="fill-warn">
        HALF BATH OPTION
      </text>
      <ellipse cx={opt.x + 18} cy={opt.y + 34} rx="8" ry="10" fill="none" stroke="currentColor" />
      <text x={opt.x + 18} y={opt.y + 38} textAnchor="middle" fontSize="6">
        WC
      </text>
      <rect x={opt.x + 38} y={opt.y + 26} width="22" height="12" fill="none" stroke="currentColor" />
      <text x={opt.x + 49} y={opt.y + 35} textAnchor="middle" fontSize="6">
        LAV
      </text>
      <Leader n={1} ax={opt.x + opt.w / 2} ay={opt.y} lx={500} ly={70} />
      <Leader n={2} ax={garage.x + garage.w * 0.4} ay={garage.y + 40} lx={500} ly={84} />
      <KeynoteLegend x={488} y={56} items={sheetNotes(bp, "PLUMB")} />
    </g>
  );
}

export function DrawingSheet({
  project,
  bp,
  sheet,
  scaleId,
  editable,
  compact,
  onSelectDim,
  onRoomDrag,
}: {
  project: Project;
  bp: Blueprint;
  sheet: SheetId;
  scaleId?: DrawingScaleId;
  editable?: boolean;
  compact?: boolean;
  onSelectDim?: (target: DimTarget) => void;
  onRoomDrag?: (drag: RoomDrag) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scale = scaleId ?? bp.drawingScale ?? "FIT";
  const scaleText =
    scale === "FIT" ? (bp.widthIn && bp.depthIn ? "FIT to sheet (not plotted)" : "n/a") : scaleLabel(scale);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 900 640"
      className="howler-sheet h-auto w-full rounded-lg bg-bg text-fg shadow-[var(--shadow-border)]"
      role="img"
      aria-label={`${sheetMeta(sheet).number} ${sheetMeta(sheet).label} ${bp.drawingStatus ?? "DRAFT"} drawing`}
    >
      <HatchDefs sheet={sheet} />
      <rect x="8" y="8" width="884" height="624" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="12" y="12" width="876" height="616" fill="none" stroke="currentColor" strokeWidth="0.6" />
      {compact ? null : <HowToBanner sheet={sheet} />}
      {sheet === "L1" ? (
        <PlanView bp={bp} level={1} scaleId={scale} editable={editable} compact={compact} onSelectDim={onSelectDim} onRoomDrag={onRoomDrag} />
      ) : null}
      {sheet === "L2" ? (
        <PlanView bp={bp} level={2} scaleId={scale} editable={editable} compact={compact} onSelectDim={onSelectDim} onRoomDrag={onRoomDrag} />
      ) : null}
      {sheet === "FDN" ? <FoundationView bp={bp} scaleId={scale} /> : null}
      {sheet === "EL" ? <ElevationView bp={bp} scaleId={scale} editable={editable} onSelectDim={onSelectDim} /> : null}
      {sheet === "SEC" ? <BuildingSectionView bp={bp} /> : null}
      {sheet === "WALL" ? <WallSectionView bp={bp} /> : null}
      {sheet === "ROOF" ? <RoofView bp={bp} scaleId={scale} /> : null}
      {sheet === "JOIST" ? <JoistView bp={bp} scaleId={scale} /> : null}
      {sheet === "ELEC" ? <ElectricView bp={bp} scaleId={scale} level="garage" /> : null}
      {sheet === "ELEC2" ? <ElectricView bp={bp} scaleId={scale} level="attic" /> : null}
      {sheet === "PLUMB" ? <PlumbingView bp={bp} scaleId={scale} /> : null}
      {sheet === "STUD" ? <StudView bp={bp} scaleId={scale} /> : null}
      {compact ? null : <NextSheetHint sheet={sheet} />}
      <TitleBlock project={project} bp={bp} sheet={sheet} scale={scaleText} />
    </svg>
  );
}

export function svgMarkup(svg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`;
}
