import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { envelopeComplete } from "@/lib/howler/layout";
import { ensureBlueprint, type CommandPreview, type Project } from "@/lib/howler/types";
import { DrawingSheet } from "./drawings";
import { Panel } from "./primitives";

export function PreviewConfirm({
  preview,
  project,
  onConfirm,
  onCancel,
}: {
  preview: CommandPreview;
  project?: Project;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [preview.understood]);

  const drawn = useMemo(() => {
    if (!project || !preview.eventType.startsWith("BLUEPRINT")) return null;
    try {
      const next = preview.apply(project);
      const bp = ensureBlueprint(next);
      if (!envelopeComplete(bp)) return null;
      return next;
    } catch {
      return null;
    }
  }, [preview, project]);

  return (
    <div ref={ref} id="howler-preview">
      <Panel className="mt-4 space-y-4 rounded-lg bg-surface-2 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            What I understood
          </p>
          <p className="mt-1 text-sm">{preview.understood}</p>
        </div>
        {preview.ripple && preview.ripple.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
              How this lands on the job
            </p>
            <ul className="mt-2 divide-y divide-border">
              {preview.ripple
                .filter((hop) => hop.status === "WILL_WRITE" || hop.status === "NEEDS_YOU")
                .map((hop) => (
                <li key={hop.ledger} className="grid grid-cols-[88px_72px_1fr] gap-2 py-2 text-xs sm:grid-cols-[110px_88px_1fr]">
                  <span className="font-medium text-fg">{hop.ledger}</span>
                  <span
                    className={
                      hop.status === "WILL_WRITE"
                        ? "text-accent"
                        : hop.status === "UNCHANGED"
                          ? "text-ok"
                          : hop.status === "NEEDS_YOU"
                            ? "text-warn"
                            : "text-muted"
                    }
                  >
                    {hop.status.replaceAll("_", " ")}
                  </span>
                  <span className="text-muted">{hop.fact}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                What this changes
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">
                {preview.changes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Consequences
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">
                {preview.consequences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </>
        )}
        {drawn ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Drawing that will be recorded
            </p>
            <div className="mt-2 overflow-hidden rounded-md">
              <DrawingSheet project={drawn} bp={ensureBlueprint(drawn)} sheet="L1" compact />
            </div>
            <p className="mt-2 text-xs text-subtle">
              A01–A08 update from the Tradewalk facts. Confirm, then open A03 foundation, A04 elevations, A06 wall section, A07 joists. A09–A14 stay cited, not invented.
            </p>
          </div>
        ) : null}
        <p className="text-sm text-fg">{preview.nextAction}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onConfirm}>
            Confirm
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  );
}
