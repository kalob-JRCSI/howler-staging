import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  previewAdoptTradewalkSet,
  previewDrawWorkingSet,
  previewIssueDrawingSet,
  previewPatchBlueprint,
  previewRemoveOpening,
  previewRemoveRoom,
  previewRoomsFromScope,
  previewSetDrawingDatum,
  previewSetDrawingStatus,
  previewSetEnvelopeProvenance,
  previewSuggestConventionalFraming,
  previewUpsertOpening,
  previewUpsertRoom,
} from "@/lib/howler/engine";
import { annotatePreview } from "@/lib/howler/ripple";
import { computePlanFindings, KY_COUNTIES, plansStatusLine } from "@/lib/howler/ky-code";
import {
  CODE_BASIS,
  CODE_ADOPTION,
  CODE_SHORT,
  designCriteria,
  sharePacketLines,
  submittalChecklist,
} from "@/lib/howler/code-notes";
import {
  DATUM_LABEL,
  describeEnvelope,
  formatFtIn,
  framingTakeoff,
  openingLabel,
  openingSchedule,
  pitchDegrees,
  PROVENANCE_LABEL,
  resolveOpenings,
  ridgeHeightIn,
  scaleLabel,
  STATUS_LABEL,
  unresolvedRegister,
} from "@/lib/howler/layout";
import { useHowlerStore } from "@/lib/howler/store";
import type {
  Blueprint,
  CommandPreview,
  DrawingScaleId,
  LumberSize,
  OccupancyClass,
  OpeningKind,
  Project,
  SheetId,
  WallFace,
} from "@/lib/howler/types";
import {
  DIM_DATUMS,
  DRAWING_SCALES,
  ensureBlueprint,
  LUMBER_SIZES,
  OCCUPANCY_LABEL,
  OPENING_KINDS,
  SHEETS,
  WALL_FACES,
} from "@/lib/howler/types";
import { DrawingSheet, type DimTarget, type RoomDrag } from "./drawings";
import { DocsWizard } from "./docs-wizard";
import { PreviewConfirm } from "./preview-confirm";
import { Empty, Expandable, Field, inputClass, Panel, Stat, StatusChip } from "./primitives";
import { ShareDrawing } from "./share-drawing";
import { SourceDrawings } from "./documents-module";


function inchesToFeetInput(inches: number | null): string {
  if (inches == null) return "";
  const feet = inches / 12;
  return Number.isInteger(feet) ? String(feet) : String(Math.round(feet * 100) / 100);
}

function feetInput(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 12);
}

function intInput(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function lumberInput(raw: FormDataEntryValue | null): LumberSize | null {
  const text = String(raw ?? "");
  return LUMBER_SIZES.includes(text as LumberSize) ? (text as LumberSize) : null;
}

function downloadSvg(filename: string) {
  const svg = document.querySelector(".howler-sheet") as SVGSVGElement | null;
  if (!svg) return;
  const blob = new Blob(
    [`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`],
    { type: "image/svg+xml;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlansModule({ project }: { project: Project }) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const bp = ensureBlueprint(project);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [sheet, setSheet] = useState<SheetId>("L1");
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [printAll, setPrintAll] = useState(false);
  const [dim, setDim] = useState<DimTarget | null>(null);
  const printArmed = useRef(false);
  const findings = useMemo(() => computePlanFindings(project), [project]);
  const takeoff = useMemo(() => framingTakeoff(bp), [bp]);
  const rooms = Object.values(bp.rooms);
  const openings = resolveOpenings(bp);
  const schedule = openingSchedule(bp);
  const unresolved = unresolvedRegister(bp);
  const blocking = unresolved.filter((item) => item.blocking);
  const criteria = useMemo(() => designCriteria(bp), [bp]);
  const submittal = useMemo(() => submittalChecklist(bp), [bp]);
  const packet = useMemo(() => sharePacketLines(project), [project]);
  const status = bp.drawingStatus ?? "DRAFT";

  function queue(next: CommandPreview) {
    const annotated = annotatePreview(project, next);
    if (annotated.clerical) applyPreview(project.id, annotated);
    else setPreview(annotated);
  }

  function exportPdf() {
    printArmed.current = true;
    setPrintAll(true);
    window.setTimeout(() => {
      window.print();
      printArmed.current = false;
      setPrintAll(false);
      queue(previewIssueDrawingSet(project));
    }, 80);
  }

  useEffect(() => {
    const onExport = () => exportPdf();
    const onPrint = () => window.print();
    window.addEventListener("howler-export-set", onExport);
    window.addEventListener("howler-print-sheet", onPrint);
    return () => {
      window.removeEventListener("howler-export-set", onExport);
      window.removeEventListener("howler-print-sheet", onPrint);
    };
  });

  function onRoomDrag(drag: RoomDrag) {
    const room = bp.rooms[drag.roomId];
    if (!room) return;
    queue(
      previewUpsertRoom({
        id: room.id,
        name: room.name,
        level: room.level,
        widthIn: drag.widthIn ?? room.widthIn,
        depthIn: drag.depthIn ?? room.depthIn,
        originXIn: drag.originXIn,
        originYIn: drag.originYIn,
        scopeItemIds: room.scopeItemIds,
        notes: room.notes,
      }),
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl">Plans</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Coordinated construction documents from one building model. Callouts
              cite {CODE_SHORT} — the section, not just the instruction. Tags
              resolve to the opening schedule. Dimensions state what they are to.
              Unresolved items stay visible — Howler will not invent a size. Not a
              PE-stamped permit set.
            </p>
          </div>
          <StatusChip tone={status === "ISSUED" ? "ok" : "warn"}>
            {STATUS_LABEL[status] ?? "Draft — not issued"}
          </StatusChip>
        </div>
        <p className="mt-3 text-xs text-subtle">{plansStatusLine(project)}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Stat label="Envelope" value={bp.widthIn && bp.depthIn ? `${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}` : "Unknown"} />
          <Stat
            label="Pitch"
            value={bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "Unknown"}
            hint={pitchDegrees(bp) != null ? `${pitchDegrees(bp)?.toFixed(1)}° · ridge ${formatFtIn(ridgeHeightIn(bp))}` : "Enter rise over run"}
          />
          <Stat
            label="County / snow"
            value={bp.county ? bp.county : "Unknown"}
            hint={bp.groundSnowLoadPsf != null ? `${bp.groundSnowLoadPsf} psf · 115 mph` : "Do not guess from the street"}
          />
          <Stat
            label="Plotted scale"
            value={scaleLabel(bp.drawingScale ?? "FIT")}
            hint={bp.studSize && bp.studSpacingIn ? `${bp.studSize} @ ${bp.studSpacingIn}"` : "Framing Unknown"}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          {DATUM_LABEL[bp.dimDatum ?? "FACE_FRAMING"]} · envelope{" "}
          {PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"]}
          {blocking.length ? ` · ${blocking.length} blocking unresolved` : ` · ${unresolved.length} on the register`}
        </p>
      </Panel>

      <div className="print-hide">
        <SourceDrawings project={project} previews />
      </div>

      <div className="print-hide grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <h4 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Envelope</h4>
          <p className="mt-1 text-sm text-muted">{describeEnvelope(bp)}</p>
          <form
            key={`env-${project.revision}`}
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              queue(
                previewPatchBlueprint({
                  widthIn: feetInput(data.get("widthFt")),
                  depthIn: feetInput(data.get("depthFt")),
                  eaveHeightIn: feetInput(data.get("eaveFt")),
                  roofRise: intInput(data.get("rise")),
                  roofRun: intInput(data.get("rise")) ? (intInput(data.get("run")) ?? 12) : undefined,
                  overhangIn: feetInput(data.get("overhangFt")),
                  occupancy: (String(data.get("occupancy") || "") || null) as OccupancyClass | null,
                  stories: intInput(data.get("stories")),
                  county: String(data.get("county") || "") || null,
                  frostDepthIn: intInput(data.get("frostIn")),
                  overheadDoorWidthIn: feetInput(data.get("doorW")),
                  overheadDoorHeightIn: feetInput(data.get("doorH")),
                  drawingScale: (String(data.get("scale") || "") || undefined) as DrawingScaleId | undefined,
                  notes: String(data.get("notes") || "") || null,
                }),
              );
            }}
          >
            <Field label="Width (ft)">
              <input name="widthFt" className={inputClass} inputMode="decimal" placeholder="Unknown" defaultValue={inchesToFeetInput(bp.widthIn)} />
            </Field>
            <Field label="Depth (ft)">
              <input name="depthFt" className={inputClass} inputMode="decimal" placeholder="Unknown" defaultValue={inchesToFeetInput(bp.depthIn)} />
            </Field>
            <Field label="Wall / eave height (ft)">
              <input name="eaveFt" className={inputClass} inputMode="decimal" placeholder="Unknown" defaultValue={inchesToFeetInput(bp.eaveHeightIn)} />
            </Field>
            <Field label="Stories">
              <input name="stories" className={inputClass} inputMode="numeric" placeholder="Unknown" defaultValue={bp.stories ?? ""} />
            </Field>
            <Field label="Roof rise">
              <input name="rise" className={inputClass} inputMode="numeric" placeholder="8" defaultValue={bp.roofRise ?? ""} />
            </Field>
            <Field label="Roof run">
              <input name="run" className={inputClass} inputMode="numeric" placeholder="12" defaultValue={bp.roofRun ?? ""} />
            </Field>
            <Field label="Overhang (ft)">
              <input name="overhangFt" className={inputClass} inputMode="decimal" placeholder="Unknown" defaultValue={inchesToFeetInput(bp.overhangIn)} />
            </Field>
            <Field label="Occupancy">
              <select name="occupancy" className={inputClass} defaultValue={bp.occupancy ?? ""}>
                <option value="">Unknown</option>
                {(Object.keys(OCCUPANCY_LABEL) as OccupancyClass[]).map((key) => (
                  <option key={key} value={key}>
                    {OCCUPANCY_LABEL[key]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kentucky county">
              <select name="county" className={inputClass} defaultValue={bp.county ?? ""}>
                <option value="">Unknown — do not guess</option>
                {KY_COUNTIES.map((county) => (
                  <option key={county} value={county}>
                    {county}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Frost depth (in)">
              <input name="frostIn" className={inputClass} inputMode="numeric" placeholder="Unknown" defaultValue={bp.frostDepthIn ?? ""} />
            </Field>
            <Field label="Overhead door width (ft)">
              <input name="doorW" className={inputClass} inputMode="decimal" placeholder="Unknown" defaultValue={inchesToFeetInput(bp.overheadDoorWidthIn)} />
            </Field>
            <Field label="Overhead door height (ft)">
              <input name="doorH" className={inputClass} inputMode="decimal" placeholder="Unknown" defaultValue={inchesToFeetInput(bp.overheadDoorHeightIn)} />
            </Field>
            <Field label="Plotted scale">
              <select name="scale" className={inputClass} defaultValue={bp.drawingScale ?? "FIT"}>
                {DRAWING_SCALES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <input name="notes" className={inputClass} defaultValue={bp.notes ?? ""} />
            </Field>
            <div className="sm:col-span-2">
              <Button variant="primary" type="submit">
                Review envelope
              </Button>
            </div>
          </form>
        </Panel>

        <Panel>
          <h4 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Framing</h4>
          <p className="mt-1 text-sm text-muted">
            Empty fields stay Unknown. Conventional fill only writes blanks.
          </p>
          <form
            key={`frm-${project.revision}`}
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              queue(
                previewPatchBlueprint({
                  studSize: lumberInput(data.get("studSize")),
                  studSpacingIn: intInput(data.get("studOc")),
                  joistSize: lumberInput(data.get("joistSize")),
                  joistSpacingIn: intInput(data.get("joistOc")),
                  joistDirection: String(data.get("joistDir")) === "DEPTH" ? "DEPTH" : "WIDTH",
                  rafterSize: lumberInput(data.get("rafterSize")),
                  rafterSpacingIn: intInput(data.get("rafterOc")),
                  roofStyle: (String(data.get("roofStyle") || "GABLE") as Blueprint["roofStyle"]) || "GABLE",
                }),
              );
            }}
          >
            <Field label="Studs">
              <div className="grid grid-cols-2 gap-2">
                <select name="studSize" className={inputClass} defaultValue={bp.studSize ?? ""}>
                  <option value="">Unknown</option>
                  {LUMBER_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <select name="studOc" className={inputClass} defaultValue={bp.studSpacingIn ?? ""}>
                  <option value="">O.C. Unknown</option>
                  <option value="12">12" O.C.</option>
                  <option value="16">16" O.C.</option>
                  <option value="24">24" O.C.</option>
                </select>
              </div>
            </Field>
            <Field label="Floor joists">
              <div className="grid grid-cols-2 gap-2">
                <select name="joistSize" className={inputClass} defaultValue={bp.joistSize ?? ""}>
                  <option value="">Unknown</option>
                  {LUMBER_SIZES.filter((size) => size !== "2x4").map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <select name="joistOc" className={inputClass} defaultValue={bp.joistSpacingIn ?? ""}>
                  <option value="">O.C. Unknown</option>
                  <option value="12">12" O.C.</option>
                  <option value="16">16" O.C.</option>
                  <option value="19.2">19.2" O.C.</option>
                  <option value="24">24" O.C.</option>
                </select>
              </div>
            </Field>
            <Field label="Joists span">
              <select name="joistDir" className={inputClass} defaultValue={bp.joistDirection}>
                <option value="WIDTH">The width</option>
                <option value="DEPTH">The depth</option>
              </select>
            </Field>
            <Field label="Rafters">
              <div className="grid grid-cols-2 gap-2">
                <select name="rafterSize" className={inputClass} defaultValue={bp.rafterSize ?? ""}>
                  <option value="">Unknown / trusses</option>
                  {LUMBER_SIZES.filter((size) => size !== "2x4").map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <select name="rafterOc" className={inputClass} defaultValue={bp.rafterSpacingIn ?? ""}>
                  <option value="">O.C. Unknown</option>
                  <option value="12">12" O.C.</option>
                  <option value="16">16" O.C.</option>
                  <option value="24">24" O.C.</option>
                </select>
              </div>
            </Field>
            <Field label="Roof style">
              <select name="roofStyle" className={inputClass} defaultValue={bp.roofStyle ?? "GABLE"}>
                <option value="GABLE">Gable</option>
                <option value="HIP">Hip</option>
                <option value="SHED">Shed</option>
              </select>
            </Field>
            <Button variant="primary" type="submit">
              Review framing
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => queue(previewSuggestConventionalFraming())}
            >
              Fill empty with conventional
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => queue(previewAdoptTradewalkSet())}
            >
              Adopt Tradewalk set
            </Button>
            <Button variant="secondary" type="button" onClick={() => queue(previewDrawWorkingSet(project))}>
              Lay out typical garage
            </Button>
          </form>
        </Panel>
      </div>

      <Panel className="print-hide">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Issue / coordination</h4>
            <p className="mt-1 text-sm text-muted">
              Validate before a contractor works from this revision. Issue lists
              unresolved items on the title block. It does not become a PE stamp.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {status !== "ISSUED" ? (
              <Button variant="secondary" type="button" onClick={() => queue(previewSetDrawingStatus("REVIEWED"))}>
                Mark reviewed
              </Button>
            ) : null}
            <Button variant="secondary" type="button" onClick={() => queue(previewSetEnvelopeProvenance("VERIFIED"))}>
              Mark envelope verified
            </Button>
            <Button variant="primary" type="button" onClick={() => queue(previewIssueDrawingSet(project))}>
              Issue for layout
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Dimension datum">
            <select
              className={inputClass}
              value={bp.dimDatum ?? "FACE_FRAMING"}
              onChange={(event) => queue(previewSetDrawingDatum(event.target.value as (typeof DIM_DATUMS)[number]["id"]))}
            >
              {DIM_DATUMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Stat
            label="Envelope source"
            value={PROVENANCE_LABEL[bp.envelopeProvenance ?? "UNKNOWN"]}
            hint={bp.issuedRevision ? `Last issued rev ${bp.issuedRevision}` : "Not issued"}
          />
          <Stat
            label="Unresolved"
            value={String(unresolved.length)}
            hint={blocking.length ? `${blocking.length} blocking` : "None blocking"}
          />
        </div>
        <ul className="mt-4 space-y-2">
          {unresolved.length === 0 ? <Empty>Nothing on the register.</Empty> : null}
          {unresolved.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
              <div>
                <p className="text-sm">
                  {item.title}
                  <span className="ml-2 text-xs uppercase tracking-[0.12em] text-muted">{item.sheet}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{item.message}</p>
              </div>
              <StatusChip tone={item.blocking ? "danger" : "warn"}>{item.blocking ? "Blocking" : "Open"}</StatusChip>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="print-hide">
        <h4 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Code basis / AHJ packet</h4>
        <p className="mt-1 text-sm text-muted">
          {CODE_BASIS}, adopted by {CODE_ADOPTION}. Every callout on the sheets cites
          the section it satisfies. Passing a check is not a stamp.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {criteria.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">{row.label}</p>
                <p className="mt-0.5 text-sm">{row.value}</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted">{row.code}</span>
            </div>
          ))}
        </div>
        <h5 className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-muted">R106 construction documents</h5>
        <p className="mt-1 text-sm text-muted">
          DHBC / IRC R106.1.1 — sufficient clarity to show location, nature, and
          extent. Missing stays missing. Site survey is not invented.
        </p>
        <ul className="mt-3 space-y-2">
          {submittal.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
              <div>
                <p className="text-sm">
                  {item.title}
                  <span className="ml-2 font-mono text-xs text-muted">{item.code}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{item.note}</p>
              </div>
              <StatusChip
                tone={
                  item.status === "ON_SET" ? "ok" : item.status === "PARTIAL" ? "warn" : item.status === "NA" ? "neutral" : "danger"
                }
              >
                {item.status === "ON_SET"
                  ? "On set"
                  : item.status === "PARTIAL"
                    ? "Partial"
                    : item.status === "NA"
                      ? "n/a"
                      : "Missing"}
              </StatusChip>
            </li>
          ))}
        </ul>
        <h5 className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-muted">When you share this set</h5>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          {packet.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </Panel>

      <div id="howler-sheet">
      <Panel className="howler-print-root">
        <div className="print-hide flex flex-wrap items-center gap-2">
          {SHEETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSheet(item.id)}
              className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-[var(--motion-quick)] ${
                sheet === item.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {item.number}
            </button>
          ))}
          <span className="px-2 text-sm text-muted">
            {SHEETS.find((item) => item.id === sheet)?.label}
          </span>
          <Button variant="ghost" type="button" onClick={() => downloadSvg(`${project.name}-${sheet}.svg`)}>
            Download SVG
          </Button>
          <Button variant="ghost" type="button" className="ml-auto" onClick={() => window.print()}>
            Print this sheet
          </Button>
          <Button variant="primary" type="button" onClick={exportPdf}>
            Export set (PDF)
          </Button>
        </div>
        {printAll ? (
          <div className="howler-print-set mt-4 space-y-6">
            {SHEETS.map((item) => (
              <DrawingSheet
                key={item.id}
                project={project}
                bp={bp}
                sheet={item.id}
                scaleId={bp.drawingScale}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <DrawingSheet
              project={project}
              bp={bp}
              sheet={sheet}
              scaleId={bp.drawingScale}
              editable
              onSelectDim={setDim}
              onRoomDrag={onRoomDrag}
            />
          </div>
        )}
        {dim ? (
          <form
            className="print-hide mt-4 grid gap-3 rounded-lg bg-surface-2 p-4 sm:grid-cols-[1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const inches = feetInput(data.get("feet"));
              const name = String(data.get("name") ?? "").trim();
              if (dim.kind === "width" && inches) queue(previewPatchBlueprint({ widthIn: inches }));
              if (dim.kind === "depth" && inches) queue(previewPatchBlueprint({ depthIn: inches }));
              if (dim.kind === "eave" && inches) queue(previewPatchBlueprint({ eaveHeightIn: inches }));
              if (dim.kind === "room") {
                const room = bp.rooms[dim.roomId];
                if (room) {
                  queue(
                    previewUpsertRoom({
                      id: room.id,
                      name: name || room.name,
                      level: room.level,
                      widthIn: dim.field === "width" && inches ? inches : room.widthIn,
                      depthIn: dim.field === "depth" && inches ? inches : room.depthIn,
                      originXIn: room.originXIn,
                      originYIn: room.originYIn,
                      scopeItemIds: room.scopeItemIds,
                      notes: room.notes,
                    }),
                  );
                }
              }
              setDim(null);
            }}
          >
            <Field
              label={
                dim.kind === "room"
                  ? dim.field === "name"
                    ? "Room name"
                    : `Room ${dim.field} (ft)`
                  : `Edit ${dim.kind} (ft)`
              }
            >
              {dim.kind === "room" && dim.field === "name" ? (
                <input name="name" className={inputClass} defaultValue={bp.rooms[dim.roomId]?.name ?? ""} required />
              ) : (
                <input
                  name="feet"
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="feet"
                  defaultValue={
                    dim.kind === "width"
                      ? inchesToFeetInput(bp.widthIn)
                      : dim.kind === "depth"
                        ? inchesToFeetInput(bp.depthIn)
                        : dim.kind === "eave"
                          ? inchesToFeetInput(bp.eaveHeightIn)
                          : dim.kind === "room"
                            ? inchesToFeetInput(
                                dim.field === "width"
                                  ? bp.rooms[dim.roomId]?.widthIn ?? null
                                  : bp.rooms[dim.roomId]?.depthIn ?? null,
                              )
                            : ""
                  }
                  required
                />
              )}
            </Field>
            <div className="flex items-end gap-2">
              <Button variant="primary" type="submit">
                Review
              </Button>
              <Button variant="ghost" type="button" onClick={() => setDim(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="print-hide mt-3 text-xs text-subtle">
            Click a dimension, drag a room, or pull the corner handle. Review still runs before sizes save.
          </p>
        )}
      </Panel>
      </div>

      <ShareDrawing project={project} />

      <div className="print-hide grid gap-5 lg:grid-cols-2">
        <Panel>
          <h4 className="font-display text-lg">Opening schedule</h4>
          <p className="mt-1 text-sm text-muted">
            Tags on A01 resolve here. Size source and offset source stay visible.
            Typical sizes are suggestions — change any of them.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2 font-medium">Mark</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">W × H</th>
                  <th className="pb-2 font-medium">Wall</th>
                  <th className="pb-2 font-medium">Offset</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Offset src</th>
                </tr>
              </thead>
              <tbody>
                {schedule.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-2 text-muted">
                      No openings recorded.
                    </td>
                  </tr>
                ) : null}
                {schedule.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2 font-mono">{row.mark}</td>
                    <td className="py-2">{row.kind}</td>
                    <td className="py-2 font-mono">
                      {row.size} × {row.height}
                    </td>
                    <td className="py-2">{row.wall.toLowerCase()}</td>
                    <td className="py-2 font-mono">{row.offset}</td>
                    <td className="py-2">{PROVENANCE_LABEL[row.provenance]}</td>
                    <td className="py-2">{PROVENANCE_LABEL[row.offsetProvenance]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 space-y-3">
            {openings.length === 0 ? <Empty>No openings recorded.</Empty> : null}
            {openings.map((opening) => (
              <li key={opening.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
                <div>
                  <p className="text-sm font-medium">{openingLabel(opening)}</p>
                  <p className="text-xs text-muted">
                    {opening.wall.toLowerCase()} wall · offset {formatFtIn(opening.offsetIn)}
                    {opening.headerSize ? ` · header ${opening.headerSize}` : ""}
                  </p>
                </div>
                <Button variant="ghost" type="button" onClick={() => queue(previewRemoveOpening(opening.id))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const kind = String(data.get("kind") || "OHD") as OpeningKind;
              const wall = String(data.get("wall") || "FRONT") as WallFace;
              const widthIn = feetInput(data.get("widthFt"));
              const heightIn = feetInput(data.get("heightFt"));
              if (widthIn == null) return;
              queue(
                previewUpsertOpening({
                  id: "",
                  kind,
                  wall,
                  widthIn,
                  heightIn,
                  offsetIn: feetInput(data.get("offsetFt")) ?? 0,
                  sillIn: kind === "WINDOW" ? 36 : 0,
                  headerSize: null,
                  tag: String(data.get("tag") || "") || null,
                  provenance: "PROPOSED",
                  offsetProvenance: "PROPOSED",
                  datum: bp.dimDatum ?? "FACE_FRAMING",
                  notes: String(data.get("notes") || "") || null,
                }),
              );
              event.currentTarget.reset();
            }}
          >
            <Field label="Kind">
              <select name="kind" className={inputClass} defaultValue="OHD">
                {OPENING_KINDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Wall">
              <select name="wall" className={inputClass} defaultValue="FRONT">
                {WALL_FACES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Width (ft)">
              <input name="widthFt" className={inputClass} inputMode="decimal" placeholder="16" />
            </Field>
            <Field label="Height (ft)">
              <input name="heightFt" className={inputClass} inputMode="decimal" placeholder="7" />
            </Field>
            <Field label="Offset from wall start (ft)">
              <input name="offsetFt" className={inputClass} inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Schedule tag">
              <input name="tag" className={inputClass} placeholder="2868" />
            </Field>
            <Field label="Notes">
              <input name="notes" className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button variant="primary" type="submit">
                Review opening
              </Button>
            </div>
          </form>
        </Panel>
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-lg">Rooms from Scope</h4>
            <Button variant="secondary" type="button" onClick={() => queue(previewRoomsFromScope(project))}>
              Name from Scope
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted">
            A named room without size stays Unknown. Howler will not invent a 6×8 bath.
          </p>
          <ul className="mt-4 space-y-3">
            {rooms.length === 0 ? <Empty>No rooms recorded.</Empty> : null}
            {rooms.map((room) => (
              <li key={room.id}>
                <Expandable
                  open={openRoom === room.id}
                  onToggle={() => setOpenRoom(openRoom === room.id ? null : room.id)}
                  title={<p className="font-medium">{room.name}</p>}
                  meta={
                    <p className="mt-1 text-xs text-muted">
                      L{room.level}
                      {room.widthIn && room.depthIn
                        ? ` · ${formatFtIn(room.widthIn)} × ${formatFtIn(room.depthIn)}`
                        : " · size Unknown"}
                    </p>
                  }
                >
                  <form
                    key={`${room.id}-${project.revision}`}
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      queue(
                        previewUpsertRoom({
                          id: room.id,
                          name: String(data.get("name")),
                          level: intInput(data.get("level")) ?? 1,
                          widthIn: feetInput(data.get("widthFt")),
                          depthIn: feetInput(data.get("depthFt")),
                          originXIn: feetInput(data.get("xFt")),
                          originYIn: feetInput(data.get("yFt")),
                          scopeItemIds: room.scopeItemIds,
                          notes: String(data.get("notes") || "") || null,
                        }),
                      );
                    }}
                  >
                    <Field label="Name">
                      <input name="name" className={inputClass} defaultValue={room.name} required />
                    </Field>
                    <Field label="Level">
                      <input name="level" className={inputClass} defaultValue={room.level} />
                    </Field>
                    <Field label="Width (ft)">
                      <input name="widthFt" className={inputClass} defaultValue={inchesToFeetInput(room.widthIn)} />
                    </Field>
                    <Field label="Depth (ft)">
                      <input name="depthFt" className={inputClass} defaultValue={inchesToFeetInput(room.depthIn)} />
                    </Field>
                    <Field label="Origin X (ft from corner)">
                      <input name="xFt" className={inputClass} defaultValue={inchesToFeetInput(room.originXIn)} />
                    </Field>
                    <Field label="Origin Y (ft)">
                      <input name="yFt" className={inputClass} defaultValue={inchesToFeetInput(room.originYIn)} />
                    </Field>
                    <Field label="Notes">
                      <input name="notes" className={inputClass} defaultValue={room.notes ?? ""} />
                    </Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button variant="primary" type="submit">
                        Review room
                      </Button>
                      <Button variant="ghost" type="button" onClick={() => queue(previewRemoveRoom(room.id))}>
                        Remove
                      </Button>
                    </div>
                  </form>
                </Expandable>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <h4 className="font-display text-lg">Cut list (derived)</h4>
          <p className="mt-1 text-sm text-muted">
            Field count from the envelope. Add waste. Trusses replace rafters when used.
          </p>
          <ul className="mt-4 space-y-3">
            {takeoff.map((line) => (
              <li key={line.id} className="border-b border-border pb-3 last:border-0">
                <p className="text-sm">
                  {line.label}
                  <span className="ml-2 font-mono text-muted">
                    {line.count == null ? "Unknown" : `× ${line.count}`} · {line.size} · {line.lengthEach}
                  </span>
                </p>
                <p className="mt-1 text-xs text-subtle">{line.notes}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="print-hide">
        <h4 className="font-display text-lg">Kentucky code / engineer-plan needs</h4>
        <p className="mt-1 text-sm text-muted">
          Checks against {CODE_SHORT} conventional construction. Each finding cites
          the section. Passing a check is not a stamp.
        </p>
        <ul className="mt-4 space-y-3">
          {findings.map((finding) => (
            <li key={finding.id} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  tone={
                    finding.severity === "REQUIRED" ? "danger" : finding.severity === "WATCH" ? "warn" : "neutral"
                  }
                >
                  {finding.engineerLikely ? "Engineer likely" : finding.severity}
                </StatusChip>
                <span className="text-xs uppercase tracking-[0.12em] text-muted">{finding.code}</span>
              </div>
              <p className="mt-1 text-sm">{finding.title}</p>
              <p className="mt-1 text-xs text-muted">{finding.message}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="print-hide">
        <DocsWizard project={project} compact />
      </div>

      {preview ? (
        <div className="print-hide">
          <PreviewConfirm
            preview={preview}
            project={project}
            onConfirm={() => {
              applyPreview(project.id, preview);
              setPreview(null);
              window.setTimeout(() => {
                document.getElementById("howler-sheet")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            }}
            onCancel={() => setPreview(null)}
          />
        </div>
      ) : null}

      <div className="print-hide">

      </div>
    </div>
  );
}
