import { CARVER_WORKING_PREVIEWS, DEBOARD_WORKING_PREVIEWS, driveFileUrl } from "@/lib/howler/plan-library";
import { EVIDENCE_LABEL, ensureBlueprint, type EvidenceKind, type EvidenceRecord, type Project } from "@/lib/howler/types";
import { DocsWizard } from "./docs-wizard";
import { Empty, Panel, StatusChip } from "./primitives";

const KIND_TONE: Record<EvidenceKind, "ok" | "warn" | "danger" | "neutral"> = {
  TRADEWALK: "ok",
  STRUCTURAL: "warn",
  CALCS: "ok",
  FRAMING: "ok",
  SCOPE: "neutral",
  SITE: "warn",
  ESTIMATE: "neutral",
  QUOTE: "neutral",
  PROCESS: "neutral",
  UPLOAD: "neutral",
};

export function EvidenceCard({ item, showPreview = true }: { item: EvidenceRecord; showPreview?: boolean }) {
  const href = item.url ?? (item.fileId ? driveFileUrl(item.fileId) : null);
  return (
    <li className="howler-doc-card">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={KIND_TONE[item.kind]}>{EVIDENCE_LABEL[item.kind]}</StatusChip>
          {item.issued ? <span className="text-[11px] text-subtle">{item.issued}</span> : null}
        </div>
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        <p className="text-xs text-muted">{item.note}</p>
        {item.sheets?.length ? (
          <ol className="mt-2 grid gap-1 text-[11px] text-subtle sm:grid-cols-2">
            {item.sheets.map((sheet) => (
              <li key={`${item.id}-${sheet.number}`}>
                <span className="font-mono text-fg">{sheet.number}</span> {sheet.title}
              </li>
            ))}
          </ol>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-xs text-accent"
          >
            Drive original
          </a>
        ) : null}
        {item.storedSrc ? (
          <a
            href={item.storedSrc}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-h-11 items-center text-xs text-accent"
          >
            Howler copy
          </a>
        ) : null}
      </div>
      {showPreview && item.previewSrc ? (
        <a href={href ?? item.previewSrc} target="_blank" rel="noreferrer" className="howler-doc-thumb">
          <img src={item.previewSrc} alt={`${item.name} preview`} className="h-full w-full object-cover object-top" />
        </a>
      ) : null}
    </li>
  );
}

export function SourceDrawings({
  project,
  previews = false,
}: {
  project: Project;
  previews?: boolean;
}) {
  const evidence = ensureBlueprint(project).evidence ?? [];
  const drawings = evidence.filter((item) =>
    item.kind === "TRADEWALK" || item.kind === "STRUCTURAL" || item.kind === "SITE" || item.kind === "FRAMING" || item.kind === "CALCS",
  );
  const files = evidence.filter((item) => !drawings.includes(item));
  const isDeboard = project.id === "deboard";
  const isCarver = project.id === "carver";
  const working = isDeboard ? DEBOARD_WORKING_PREVIEWS : isCarver ? CARVER_WORKING_PREVIEWS : [];

  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Source drawings</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Named files copied from Drive into Howler. The Drive original stays
          where it is — Howler keeps a working copy. A visual Tradewalk is a
          reference. Howler will not invent a size from it. Working drawings
          are not PE-stamped.
        </p>
        {drawings.length === 0 ? (
          <div className="mt-4">
            <Empty>No drawing files named for this job were in Drive.</Empty>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {drawings.map((item) => (
              <EvidenceCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Panel>

      {working.length > 0 && previews ? (
        <Panel>
          <h3 className="font-display text-xl">Working sheets</h3>
          <p className="mt-1 text-sm text-muted">
            {isDeboard
              ? "Howler sheets drawn from Deboard Tradewalk Plans.pdf. Open Plans to print the live set. Design 2 34×36 / 10:12 ADU is not governing."
              : "Copied from hall design.pdf and master design.pdf. Existing house — envelope not adopted."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {working.map((sheet) => (
              <figure key={sheet.number} className="overflow-hidden rounded-md bg-surface-2 shadow-[var(--shadow-border)]">
                <img src={sheet.src} alt={`${sheet.number} ${sheet.title}`} className="aspect-[4/3] w-full object-cover object-top" />
                <figcaption className="px-2 py-2 text-[11px] text-muted">
                  <span className="font-mono text-fg">{sheet.number}</span> {sheet.title}
                </figcaption>
              </figure>
            ))}
          </div>
        </Panel>
      ) : null}

      {files.length ? (
        <Panel>
          <h3 className="font-display text-xl">Other Drive files</h3>
          <p className="mt-1 text-sm text-muted">Estimates, quotes, and scope. Not drawings.</p>
          <ul className="mt-4 space-y-4">
            {files.map((item) => (
              <EvidenceCard key={item.id} item={item} showPreview={false} />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

export function DocumentsModule({ project }: { project: Project }) {
  return (
    <div className="space-y-5">
      <SourceDrawings project={project} previews />
      <DocsWizard project={project} />
    </div>
  );
}
