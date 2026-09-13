import { useState } from "react";
import { Button } from "@/components/ui/button";
import { previewAddScope, previewCreateChangeOrder, previewPatchScope } from "@/lib/howler/engine";
import { livesIn } from "@/lib/howler/ripple";
import { zero } from "@/lib/howler/money";
import { useHowlerStore } from "@/lib/howler/store";
import type { CommandPreview, Project } from "@/lib/howler/types";
import { PreviewConfirm } from "./preview-confirm";
import { Expandable, Field, inputClass, Panel, StatusChip } from "./primitives";


export function ScopeModule({ project }: { project: Project }) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const lines = Object.values(project.financials?.lines ?? {}).filter((line) => line.active);

  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Scope</h3>
        <p className="mt-1 text-sm text-muted">
          Every item is editable. Baseline items stay marked. Open a row to change
          it; Draft Change Order starts unpriced.
        </p>
        <ul className="mt-4 space-y-3">
          {Object.values(project.scopeItems).map((item) => (
            <li key={item.id}>
              <Expandable
                open={openId === item.id}
                onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.description}</p>
                    <StatusChip tone={item.fromBaseline ? "neutral" : "warn"}>
                      {item.fromBaseline ? "Baseline" : "Added after baseline"}
                    </StatusChip>
                    {item.complete ? <StatusChip tone="ok">Complete</StatusChip> : null}
                    {!item.included ? <StatusChip tone="danger">Excluded</StatusChip> : null}
                  </div>
                }
                meta={
                  <p className="mt-1 text-xs text-muted">
                    {item.phase}
                    {item.trade ? ` · ${item.trade}` : ""}
                    {livesIn(project, "scope", item.id).length
                      ? ` · ${livesIn(project, "scope", item.id).join(" · ")}`
                      : " · no linked ledger"}
                  </p>
                }
              >
                <form
                  className="grid gap-3 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const next = previewPatchScope(item.id, {
                      description: String(data.get("description")),
                      phase: String(data.get("phase")),
                      trade: String(data.get("trade") || "") || null,
                      notes: String(data.get("notes") || "") || null,
                      complete: data.get("complete") === "on",
                      included: data.get("included") === "on",
                      activityId: String(data.get("activityId") || "") || null,
                      allowanceLineId: String(data.get("allowanceLineId") || "") || null,
                    });
                    if (next.clerical) applyPreview(project.id, next);
                    else setPreview(next);
                  }}
                >
                  <Field label="Description">
                    <input
                      name="description"
                      className={inputClass}
                      defaultValue={item.description}
                      required
                    />
                  </Field>
                  <Field label="Phase">
                    <input name="phase" className={inputClass} defaultValue={item.phase} />
                  </Field>
                  <Field label="Trade">
                    <input name="trade" className={inputClass} defaultValue={item.trade ?? ""} />
                  </Field>
                  <Field label="Schedule activity">
                    <select
                      name="activityId"
                      className={inputClass}
                      defaultValue={item.activityId ?? ""}
                    >
                      <option value="">None</option>
                      {Object.values(project.activities).map((activity) => (
                        <option key={activity.id} value={activity.id}>
                          {activity.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Allowance / budget line">
                    <select
                      name="allowanceLineId"
                      className={inputClass}
                      defaultValue={item.allowanceLineId ?? ""}
                    >
                      <option value="">None (coverage unknown)</option>
                      {lines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.description}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Notes">
                    <input name="notes" className={inputClass} defaultValue={item.notes ?? ""} />
                  </Field>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="included" defaultChecked={item.included} />
                    Included in current scope
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="complete" defaultChecked={item.complete} />
                    Complete
                  </label>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button variant="secondary" type="submit">
                      Review
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (!project.financials) return;
                        setPreview(
                          previewCreateChangeOrder({
                            title: `Scope change: ${item.description}`,
                            description: `DRAFT originated from Scope "${item.description}". Price unknown.`,
                            reason: "Scope-originated",
                            cost: zero(project.financials.currency),
                            declaredScheduleDays: null,
                            scopeItemIds: [item.id],
                            activityIds: item.activityId ? [item.activityId] : [],
                          }),
                        );
                      }}
                    >
                      Draft Change Order
                    </Button>
                  </div>
                </form>
              </Expandable>
            </li>
          ))}
        </ul>

        <form
          className="mt-6 grid gap-3 border-t border-border pt-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const next = previewAddScope({
              description: String(data.get("description")),
              phase: String(data.get("phase") || "General"),
              trade: String(data.get("trade") || "") || undefined,
            }, project);
            setPreview(next);
          }}
        >
          <h4 className="md:col-span-2 text-sm font-medium">Add scope item</h4>
          <Field label="Description">
            <input name="description" className={inputClass} required />
          </Field>
          <Field label="Phase">
            <input name="phase" className={inputClass} defaultValue="General" />
          </Field>
          <Field label="Trade">
            <input name="trade" className={inputClass} />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" type="submit">
              Add
            </Button>
          </div>
        </form>
        {preview ? (
          <PreviewConfirm
            preview={preview}
            onConfirm={() => {
              applyPreview(project.id, preview);
              setPreview(null);
            }}
            onCancel={() => setPreview(null)}
          />
        ) : null}
      </Panel>

    </div>
  );
}
