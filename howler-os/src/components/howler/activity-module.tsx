import type { Project } from "@/lib/howler/types";
import { Empty, Panel, StatusChip } from "./primitives";

export function ActivityModule({ project }: { project: Project }) {
  return (
    <Panel>
      <h3 className="font-display text-xl">History</h3>
      <p className="mt-1 text-sm text-muted">
        Append-only. Approved evidence is not rewritten. Clerical edits still leave a
        record.
      </p>
      <ol className="mt-5 space-y-4">
        {project.events.length === 0 ? <Empty>No events yet.</Empty> : null}
        {project.events.map((event) => (
          <li key={event.id} className="border-b border-border pb-4 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={event.clerical ? "neutral" : "warn"}>
                {event.clerical ? "Clerical" : "Consequential"}
              </StatusChip>
              <span className="font-mono text-xs text-muted">rev {event.revision}</span>
              <span className="text-xs text-subtle">
                {new Date(event.occurredAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium">{event.type.replaceAll("_", " ")}</p>
            <p className="mt-1 text-sm text-muted">{event.note}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
