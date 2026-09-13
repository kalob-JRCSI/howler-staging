import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  previewAddPhoto,
  previewSetInspection,
  previewSetPermit,
  previewUpsertContact,
} from "@/lib/howler/engine";
import {
  INSPECTION_STATUSES,
  PERMIT_LABEL,
  ensureJob,
  materialTakeoff,
} from "@/lib/howler/job";
import { EVIDENCE_LABEL, ensureBlueprint } from "@/lib/howler/types";
import type { CommandPreview, InspectionStatus, PermitStatus, Project } from "@/lib/howler/types";
import { useHowlerStore } from "@/lib/howler/store";
import { annotatePreview } from "@/lib/howler/ripple";
import { PreviewConfirm } from "./preview-confirm";
import { Empty, Field, inputClass, Panel, Stat, StatusChip } from "./primitives";


function useQueue(project: Project) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  return {
    preview,
    queue: (next: CommandPreview) => setPreview(annotatePreview(project, next)),
    confirm: preview ? (
      <PreviewConfirm
        preview={preview}
        project={project}
        onConfirm={() => {
          applyPreview(project.id, preview);
          setPreview(null);
        }}
        onCancel={() => setPreview(null)}
      />
    ) : null,
  };
}

function toneForInspection(status: InspectionStatus) {
  if (status === "PASSED") return "ok" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "SCHEDULED" || status === "READY") return "warn" as const;
  return "neutral" as const;
}

export function InspectionsModule({ project }: { project: Project }) {
  const job = ensureJob(project);
  const { queue, confirm } = useQueue(project);
  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Inspections / Permits</h3>
        <p className="mt-1 text-sm text-muted">
          Madison County / 2018 KRC sequence. A pass is only recorded when you say it
          passed. This is not a PE stamp.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Permit">
            <select
              className={inputClass}
              value={job.permitStatus}
              onChange={(event) =>
                queue(previewSetPermit(event.target.value as PermitStatus, job.permitNumber))
              }
            >
              {(Object.keys(PERMIT_LABEL) as PermitStatus[]).map((id) => (
                <option key={id} value={id}>
                  {PERMIT_LABEL[id]}
                </option>
              ))}
            </select>
          </Field>
          <Stat label="Permit number" value={job.permitNumber ?? "Unknown"} />
        </div>
        <ol className="mt-5 space-y-3">
          {Object.values(job.inspections).map((item) => (
            <li key={item.id} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={toneForInspection(item.status)}>{item.status.replace("_", " ")}</StatusChip>
                <p className="text-sm font-medium">{item.name}</p>
                {item.code ? <span className="text-xs text-subtle">{item.code}</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted">{item.notes}</p>
              <select
                className={`${inputClass} mt-2 max-w-xs`}
                value={item.status}
                onChange={(event) =>
                  queue(previewSetInspection(item.id, { status: event.target.value as InspectionStatus }))
                }
              >
                {INSPECTION_STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        {confirm}
      </Panel>

    </div>
  );
}

export function TradesModule({ project }: { project: Project }) {
  const job = ensureJob(project);
  const { confirm, queue } = useQueue(project);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("Framing");
  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Trades / Vendors / Contacts</h3>
        <p className="mt-1 text-sm text-muted">
          A name is not a contract. Kentucky trades (electrical, plumbing, HVAC) are
          licensed; Howler does not track licenses.
        </p>
        <ul className="mt-4 space-y-3">
          {Object.values(job.contacts).length === 0 ? <Empty>No contacts recorded.</Empty> : null}
          {Object.values(job.contacts).map((item) => (
            <li key={item.id} className="border-b border-border pb-3 last:border-0">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted">
                {item.trade}
                {item.phone ? ` · ${item.phone}` : ""}
              </p>
              {item.notes ? <p className="mt-1 text-xs text-subtle">{item.notes}</p> : null}
            </li>
          ))}
        </ul>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            queue(previewUpsertContact({ name: name.trim(), trade }));
            setName("");
          }}
        >
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Trade">
            <input className={inputClass} value={trade} onChange={(event) => setTrade(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">
              Review contact
            </Button>
          </div>
        </form>
        {confirm}
      </Panel>

    </div>
  );
}

export function MaterialsModule({ project }: { project: Project }) {
  const lines = materialTakeoff(project);
  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Materials / Procurement</h3>
        <p className="mt-1 text-sm text-muted">
          Takeoff from the live model. Unknown stays Unknown. LVL sizes are from
          Deboard Calcs, not a Howler stamp.
        </p>
        <ul className="mt-4 space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={line.status === "UNKNOWN" ? "warn" : "ok"}>{line.status === "UNKNOWN" ? "Unknown" : "From model"}</StatusChip>
                <span className="text-xs text-subtle">{line.trade}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{line.item}</p>
              <p className="font-mono text-sm">{line.qty}</p>
              <p className="mt-1 text-xs text-muted">{line.notes}</p>
            </li>
          ))}
        </ul>
      </Panel>

    </div>
  );
}

export function PhotosModule({ project }: { project: Project }) {
  const job = ensureJob(project);
  const evidence = ensureBlueprint(project).evidence ?? [];
  const { confirm, queue } = useQueue(project);
  const [caption, setCaption] = useState("");
  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Photos</h3>
        <p className="mt-1 text-sm text-muted">
          Field notes. Images stay on your device or Drive — Howler records the
          caption, not the pixels. Drawing PDFs live on Documents.
        </p>
        <h4 className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted">Drive files on this job</h4>
        <ul className="mt-2 space-y-2 text-sm">
          {evidence.length === 0 ? <Empty>No files recorded. Drop a PDF on Tell Howler.</Empty> : null}
          {evidence.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs text-subtle">{EVIDENCE_LABEL[item.kind]}</span>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-accent">
                  {item.name}
                </a>
              ) : (
                <span>{item.name}</span>
              )}
            </li>
          ))}
        </ul>
        <h4 className="mt-5 text-xs font-medium uppercase tracking-[0.14em] text-muted">Field notes</h4>
        <ul className="mt-2 space-y-3">
          {Object.values(job.photos).length === 0 ? <Empty>No photo notes yet.</Empty> : null}
          {Object.values(job.photos).map((item) => (
            <li key={item.id} className="border-b border-border pb-3 last:border-0">
              <p className="text-sm">{item.caption}</p>
              <p className="text-xs text-subtle">{item.takenAt}{item.evidenceName ? ` · ${item.evidenceName}` : ""}</p>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!caption.trim()) return;
            queue(previewAddPhoto(caption.trim(), evidence.at(-1)?.name ?? null));
            setCaption("");
          }}
        >
          <Field label="Caption">
            <input
              className={inputClass}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Photo: footing rebar before pour"
              required
            />
          </Field>
          <Button type="submit" variant="secondary">
            Review note
          </Button>
        </form>
        {confirm}
      </Panel>

    </div>
  );
}

export function SelectionsModule({ project }: { project: Project }) {
  const job = ensureJob(project);
  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Selections</h3>
        <p className="mt-1 text-sm text-muted">
          Match-existing is a field fact. Unknown stays Unknown. Tell Howler
          “brick to match existing.”
        </p>
        <ul className="mt-4 space-y-3">
          {Object.values(job.selections).length === 0 ? <Empty>No selections recorded.</Empty> : null}
          {Object.values(job.selections).map((item) => (
            <li key={item.id} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={item.status === "UNKNOWN" ? "warn" : "ok"}>{item.status.replace("_", " ")}</StatusChip>
                <p className="text-sm font-medium">{item.name}</p>
              </div>
              <p className="mt-1 text-sm">{item.value ?? "Unknown"}</p>
              {item.notes ? <p className="mt-1 text-xs text-muted">{item.notes}</p> : null}
            </li>
          ))}
        </ul>
      </Panel>

    </div>
  );
}
