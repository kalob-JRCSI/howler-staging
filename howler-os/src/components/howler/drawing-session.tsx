import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DrawingSheet, type DimTarget, type RoomDrag } from "./drawings";
import { Field, inputClass, Panel, StatusChip } from "./primitives";
import {
  previewPatchBlueprint,
  previewUpsertRoom,
} from "@/lib/howler/engine";
import { DRAWING_SCALES, emptyBlueprint, SHEETS, type Blueprint, type DrawingScaleId, type Project, type SheetId } from "@/lib/howler/types";
import { emptyJob } from "@/lib/howler/job";
import { formatFtIn } from "@/lib/howler/layout";
import { useDrawingSession } from "@/lib/howler/use-drawing-session";
import type { DrawingSnapshot } from "@/lib/howler/drawing-share";
import { interpretFinancial } from "@/lib/howler/interpret";

function stubProject(snapshot: DrawingSnapshot, token: string): Project {
  return {
    id: `draw-${token}`,
    name: snapshot.jobTitle,
    clientName: snapshot.clientLabel,
    address: snapshot.siteLine,
    projectType: "Working drawing session",
    timezone: "America/New_York",
    revision: snapshot.projectRevision,
    healthBand: "YELLOW",
    paused: false,
    heldPhases: [],
    dashboardNote: null,
    officialStart: null,
    intendedFinish: null,
    sourceLabel: "Shared drawing session",
    activities: {},
    scopeItems: {},
    financials: null,
    blueprint: snapshot.blueprint,
    job: emptyJob(),
    events: [],
  };
}

function feetToInches(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 12);
}

export function DrawingSessionPage({ token }: { token: string }) {
  const [sheet, setSheet] = useState<SheetId>("L1");
  const [local, setLocal] = useState<DrawingSnapshot | null>(null);
  const [dim, setDim] = useState<DimTarget | null>(null);
  const [talk, setTalk] = useState("");
  const [talkMsg, setTalkMsg] = useState<string | null>(null);
  const session = useDrawingSession({
    token,
    name: "guest",
    onRemote: (snapshot) => {
      setLocal((current) => {
        if (current && snapshot.rev <= current.rev) return current;
        return snapshot;
      });
    },
  });

  const snapshot = local ?? session.view?.snapshot ?? null;
  const status = session.view?.status ?? "MISSING";

  function commitBlueprint(blueprint: Blueprint, note: string) {
    if (!snapshot) return;
    const next: DrawingSnapshot = {
      ...snapshot,
      rev: Date.now(),
      updatedAt: new Date().toISOString(),
      blueprint,
      scale: blueprint.drawingScale ?? snapshot.scale,
    };
    setLocal(next);
    void session.publish(next);
    void note;
  }

  function applyPatch(patch: Partial<Blueprint>) {
    if (!snapshot) return;
    const preview = previewPatchBlueprint(patch);
    const fake = stubProject(snapshot, token);
    commitBlueprint(preview.apply(fake).blueprint, preview.understood);
  }

  if (status === "ENDED" || status === "EXPIRED" || (status === "MISSING" && !snapshot)) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Drawing session</p>
        <h1 className="mt-2 font-display text-3xl">This session is closed.</h1>
        <p className="mt-3 text-sm text-muted">
          The host ended access, the timer ran out, or this link is not live.
          It does not open Howler, and it will not open the drawing again.
          Ask the host to issue a PDF or start a new session.
        </p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <p className="text-sm text-muted">Opening drawing session…</p>
      </div>
    );
  }

  const project = stubProject(snapshot, token);
  const bp = snapshot.blueprint ?? emptyBlueprint();

  function onRoomDrag(drag: RoomDrag) {
    const room = bp.rooms[drag.roomId];
    if (!room) return;
    const preview = previewUpsertRoom({
      id: room.id,
      name: room.name,
      level: room.level,
      widthIn: drag.widthIn ?? room.widthIn,
      depthIn: drag.depthIn ?? room.depthIn,
      originXIn: drag.originXIn,
      originYIn: drag.originYIn,
      scopeItemIds: room.scopeItemIds,
      notes: room.notes,
    });
    commitBlueprint(preview.apply(project).blueprint, preview.understood);
  }

  function submitDim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dim) return;
    const data = new FormData(event.currentTarget);
    const inches = feetToInches(String(data.get("feet") ?? ""));
    const name = String(data.get("name") ?? "").trim();
    if (dim.kind === "width" && inches) applyPatch({ widthIn: inches });
    if (dim.kind === "depth" && inches) applyPatch({ depthIn: inches });
    if (dim.kind === "eave" && inches) applyPatch({ eaveHeightIn: inches });
    if (dim.kind === "room") {
      const room = bp.rooms[dim.roomId];
      if (room) {
        const preview = previewUpsertRoom({
          id: room.id,
          name: name || room.name,
          level: room.level,
          widthIn: dim.field === "width" && inches ? inches : room.widthIn,
          depthIn: dim.field === "depth" && inches ? inches : room.depthIn,
          originXIn: room.originXIn,
          originYIn: room.originYIn,
          scopeItemIds: room.scopeItemIds,
          notes: room.notes,
        });
        commitBlueprint(preview.apply(project).blueprint, preview.understood);
      }
    }
    setDim(null);
  }

  function describeBuilding(event: React.FormEvent) {
    event.preventDefault();
    const result = interpretFinancial(project, talk);
    if (result.outcome === "CLARIFICATION") {
      setTalkMsg(result.message);
      return;
    }
    if (result.outcome === "ACTION") {
      if (result.action === "PRINT") window.print();
      setTalkMsg(result.message);
      setTalk("");
      return;
    }
    const next = result.preview.apply(project);
    commitBlueprint(next.blueprint, result.preview.understood);
    setTalkMsg(`Recorded: ${result.preview.understood}`);
    setTalk("");
  }

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="howler-lockup mb-3">
            <span className="howler-lockup-word">Howler</span>
            <span className="howler-lockup-sub">Drawing</span>
          </p>
          <h1 className="font-display text-[28px] font-normal tracking-[-0.03em]">{snapshot.jobTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            {snapshot.siteLine} · {snapshot.clientLabel}
          </p>
        </div>
        <StatusChip tone="warn">Not Howler · access {session.remainingLabel}</StatusChip>
      </header>
      <p className="mt-4 max-w-2xl text-sm text-muted">
        You can edit this drawing. You cannot see budget, schedule, or the rest of the
        job. When the host ends the session, this link dies.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2 print-hide">
        {SHEETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSheet(item.id)}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm ${
              sheet === item.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {item.number}
          </button>
        ))}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-xs text-muted">
          Scale
          <select
            className={`${inputClass} w-auto min-w-40`}
            value={bp.drawingScale ?? "FIT"}
            onChange={(event) => applyPatch({ drawingScale: event.target.value as DrawingScaleId })}
          >
            {DRAWING_SCALES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

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

      {dim ? (
        <form className="print-hide mt-4 grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-[1fr_auto]" onSubmit={submitDim}>
          <Field
            label={
              dim.kind === "room"
                ? dim.field === "name"
                  ? "Room name"
                  : `Room ${dim.field} (ft)`
                : `${dim.kind} (ft)`
            }
          >
            {dim.kind === "room" && dim.field === "name" ? (
              <input name="name" className={inputClass} defaultValue={bp.rooms[dim.roomId]?.name ?? ""} required />
            ) : (
              <input name="feet" className={inputClass} inputMode="decimal" placeholder="feet" required />
            )}
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="primary" type="submit">
              Save on drawing
            </Button>
            <Button variant="ghost" type="button" onClick={() => setDim(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <form className="print-hide mt-5 space-y-3 rounded-xl bg-surface p-4" onSubmit={describeBuilding}>
        <Field label="Describe the building">
          <textarea
            className={`${inputClass} min-h-20 py-2`}
            value={talk}
            onChange={(event) => setTalk(event.target.value)}
            placeholder="24 by 32, 9 foot walls, 8/12 roof"
          />
        </Field>
        {talkMsg ? <p className="text-sm text-muted">{talkMsg}</p> : null}
        <Button variant="secondary" type="submit">
          Update drawing
        </Button>
      </form>

      <div className="print-hide mt-5 grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Envelope</p>
          <p className="mt-1 font-mono">
            {bp.widthIn && bp.depthIn ? `${formatFtIn(bp.widthIn)} × ${formatFtIn(bp.depthIn)}` : "Unknown"}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Pitch</p>
          <p className="mt-1 font-mono">{bp.roofRise && bp.roofRun ? `${bp.roofRise}/${bp.roofRun}` : "Unknown"}</p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Guests</p>
          <p className="mt-1 text-sm">{session.peers.length} connected</p>
        </Panel>
      </div>
    </div>
  );
}
