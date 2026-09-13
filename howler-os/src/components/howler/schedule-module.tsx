import { useState } from "react";
import { Button } from "@/components/ui/button";
import { previewPatchActivity } from "@/lib/howler/engine";
import { forecastActivity } from "@/lib/howler/derive";
import { useHowlerStore } from "@/lib/howler/store";
import { annotatePreview, livesIn } from "@/lib/howler/ripple";
import type { Activity, CommandPreview, Project } from "@/lib/howler/types";
import { PreviewConfirm } from "./preview-confirm";
import { Empty, Field, inputClass, Panel, StatusChip } from "./primitives";


export function ScheduleModule({ project }: { project: Project }) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(activity: Activity, data: FormData) {
    try {
      const next = previewPatchActivity(activity.id, {
        name: String(data.get("name")),
        phase: String(data.get("phase")),
        trade: String(data.get("trade") || "") || null,
        state: String(data.get("state")) as Activity["state"],
        committedStart: String(data.get("committedStart") || "") || null,
        committedFinish: String(data.get("committedFinish") || "") || null,
        actualStart: String(data.get("actualStart") || "") || null,
        actualFinish: String(data.get("actualFinish") || "") || null,
        notes: String(data.get("notes") || "") || null,
        durationLikely: Number(data.get("durationLikely") || activity.durationLikely),
        predecessorId: String(data.get("predecessorId") || "") || null,
        locked: data.get("locked") === "on",
      });
      setError(null);
      if (next.clerical) applyPreview(project.id, next);
      else setPreview(annotatePreview(project, next));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update.");
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <h3 className="font-display text-xl">Schedule</h3>
        <p className="mt-1 text-sm text-muted">
          Select a row to edit every field. Forecast is derived. Declared Change
          Order days do not rewrite these dates.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="py-2">Activity</th>
                <th>State</th>
                <th>Committed</th>
                <th>Forecast</th>
                <th>Pred</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(project.activities).map((activity) => {
                const forecast = forecastActivity(project, activity);
                const pred = activity.predecessorId
                  ? project.activities[activity.predecessorId]?.name
                  : "—";
                const selected = openId === activity.id;
                return (
                  <tr
                    key={activity.id}
                    className={`border-t border-border align-top ${selected ? "bg-surface-2" : ""}`}
                  >
                    <td className="py-2">
                      <button
                        type="button"
                        className="min-h-11 w-full py-2 text-left text-fg"
                        onClick={() => setOpenId(selected ? null : activity.id)}
                      >
                        {activity.name}
                        <p className="text-xs text-muted">
                          {activity.phase}
                          {activity.trade ? ` · ${activity.trade}` : ""}
                          {activity.locked ? " · locked" : ""}
                        </p>
                      </button>
                    </td>
                    <td className="py-3">
                      <StatusChip
                        tone={
                          activity.state === "COMPLETE"
                            ? "ok"
                            : activity.state === "IN_PROGRESS"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {activity.state.replace("_", " ")}
                      </StatusChip>
                    </td>
                    <td className="py-3 font-mono text-xs tabular-nums">
                      {activity.committedStart ?? "—"} → {activity.committedFinish ?? "—"}
                    </td>
                    <td className="py-3 font-mono text-xs tabular-nums">
                      {forecast.start ?? "—"} → {forecast.finish ?? "—"}
                    </td>
                    <td className="py-3 text-muted">{pred}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {openId && project.activities[openId] ? (
          <form
            className="mt-4 grid gap-3 rounded-lg bg-surface-2 p-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit(project.activities[openId], new FormData(event.currentTarget));
            }}
          >
            <Field label="Name">
              <input
                name="name"
                className={inputClass}
                defaultValue={project.activities[openId].name}
                required
              />
            </Field>
            <Field label="Phase">
              <input
                name="phase"
                className={inputClass}
                defaultValue={project.activities[openId].phase}
              />
            </Field>
            <Field label="Trade">
              <input
                name="trade"
                className={inputClass}
                defaultValue={project.activities[openId].trade ?? ""}
              />
            </Field>
            <Field label="State">
              <select
                name="state"
                className={inputClass}
                defaultValue={project.activities[openId].state}
              >
                <option value="NOT_STARTED">Not started</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETE">Complete</option>
              </select>
            </Field>
            <Field label="Likely duration (workdays)">
              <input
                name="durationLikely"
                className={inputClass}
                type="number"
                min={1}
                defaultValue={project.activities[openId].durationLikely}
              />
            </Field>
            <Field label="Predecessor">
              <select
                name="predecessorId"
                className={inputClass}
                defaultValue={project.activities[openId].predecessorId ?? ""}
              >
                <option value="">None</option>
                {Object.values(project.activities)
                  .filter((activity) => activity.id !== openId)
                  .map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Committed start">
              <input
                name="committedStart"
                type="date"
                className={inputClass}
                defaultValue={project.activities[openId].committedStart ?? ""}
              />
            </Field>
            <Field label="Committed finish">
              <input
                name="committedFinish"
                type="date"
                className={inputClass}
                defaultValue={project.activities[openId].committedFinish ?? ""}
              />
            </Field>
            <Field label="Actual start">
              <input
                name="actualStart"
                type="date"
                className={inputClass}
                defaultValue={project.activities[openId].actualStart ?? ""}
              />
            </Field>
            <Field label="Actual finish">
              <input
                name="actualFinish"
                type="date"
                className={inputClass}
                defaultValue={project.activities[openId].actualFinish ?? ""}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notes">
                <input
                  name="notes"
                  className={inputClass}
                  defaultValue={project.activities[openId].notes ?? ""}
                />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                name="locked"
                defaultChecked={project.activities[openId].locked}
              />
              Lock committed dates
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button variant="primary" type="submit">
                Review
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpenId(null)}>
                Close
              </Button>
            </div>
          </form>
        ) : (
          <Empty>Select an activity to edit.</Empty>
        )}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {preview ? (
          <PreviewConfirm
            preview={preview}
            onConfirm={() => {
              try {
                applyPreview(project.id, preview);
                setPreview(null);
                setError(null);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Apply failed.");
              }
            }}
            onCancel={() => setPreview(null)}
          />
        ) : null}
      </Panel>

    </div>
  );
}
