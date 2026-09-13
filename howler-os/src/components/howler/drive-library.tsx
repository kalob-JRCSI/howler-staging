import { JR_PROCESS_REFS, UNMATCHED_DRIVE_PLANS, driveFileUrl } from "@/lib/howler/plan-library";
import { EVIDENCE_LABEL } from "@/lib/howler/types";
import { Panel, StatusChip } from "./primitives";

export function DriveLibrary() {
  return (
    <div className="mt-6 space-y-5">
      <Panel>
        <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Drive drawing library</p>
        <h2 className="mt-1 font-display text-[22px] font-normal">Named sets, other addresses</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Visual Tradewalk and builder sets found in Drive that are not one of the
          seven live jobs. Recorded so they are findable. Howler will not hang them
          on Pratt, DeBoard, or any other live card.
        </p>
        <ul className="mt-4 space-y-4">
          {UNMATCHED_DRIVE_PLANS.map((item) => (
            <li key={item.fileId} className="border-b border-border pb-4 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={item.kind === "TRADEWALK" ? "ok" : "neutral"}>{EVIDENCE_LABEL[item.kind]}</StatusChip>
                {item.issued ? <span className="text-[11px] text-subtle">{item.issued}</span> : null}
              </div>
              <p className="mt-1 text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted">{item.address}</p>
              <p className="mt-1 text-xs text-subtle">{item.note}</p>
              {item.sheets?.length ? (
                <p className="mt-2 font-mono text-[11px] text-subtle">
                  {item.sheets.map((sheet) => sheet.number).join(" · ")}
                </p>
              ) : null}
              <a
                href={driveFileUrl(item.fileId)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center text-xs text-accent"
              >
                Open in Drive
              </a>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">J&R</p>
        <h2 className="mt-1 font-display text-xl font-normal">Planning process</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Company visual planning docs from Drive. Process, not a job drawing.
        </p>
        <ul className="mt-4 space-y-4">
          {JR_PROCESS_REFS.map((item) => (
            <li key={item.id} className="border-b border-border pb-4 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone="neutral">{EVIDENCE_LABEL[item.kind]}</StatusChip>
                {item.issued ? <span className="text-[11px] text-subtle">{item.issued}</span> : null}
              </div>
              <p className="mt-1 text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-muted">{item.note}</p>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center text-xs text-accent"
                >
                  Open in Drive
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
