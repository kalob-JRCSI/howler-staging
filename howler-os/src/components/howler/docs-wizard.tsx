import { Link } from "@tanstack/react-router";
import { closeoutLine, documentationNeeds } from "@/lib/howler/docs-wizard";
import { memorySummary } from "@/lib/howler/memory";
import type { Project } from "@/lib/howler/types";
import { Empty, Panel, StatusChip } from "./primitives";

export function DocsWizard({ project, compact = false }: { project: Project; compact?: boolean }) {
  const items = documentationNeeds(project);
  const line = closeoutLine(project);
  const memory = memorySummary();

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl">{compact ? "Closeout documents" : "Documentation wizard"}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">{line}</p>
        </div>
        <StatusChip tone={items.some((item) => item.status === "MISSING") ? "warn" : "ok"}>
          {items.filter((item) => item.status === "READY").length}/{items.length} ready
        </StatusChip>
      </div>
      <p className="mt-3 text-xs text-subtle">{memory}</p>
      <ul className="mt-4 space-y-3">
        {items.length === 0 ? <Empty>Nothing to document.</Empty> : null}
        {items.map((item) => (
          <li key={item.id} className="border-b border-border pb-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={item.status === "READY" ? "ok" : item.status === "WATCH" ? "warn" : "danger"}
              >
                {item.status}
              </StatusChip>
              <p className="text-sm font-medium">{item.title}</p>
            </div>
            {compact ? null : <p className="mt-1 text-xs text-muted">{item.why}</p>}
            <p className="mt-1 text-sm">{item.next}</p>
            <Link
              to="/projects/$projectId/$moduleId"
              params={{ projectId: project.id, moduleId: item.moduleId }}
              className="mt-2 inline-flex min-h-11 items-center text-xs text-accent"
            >
              Open {item.moduleId.replace("-", " ")}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
