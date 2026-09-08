// Phase 2 (Howler Recovery Directive, Editable Project Schedule): the first real manual PM
// control surface in the product app. Reads GET .../schedule (src/operator/schedule.ts's
// buildScheduleView) and writes through the existing preview -> confirm -> apply save model
// (POST .../schedule/commands/preview, then the *existing* POST .../events/apply-shadow) --
// never a second mutation path. Every edit shows its forecast consequence before the PM
// confirms; nothing is silently applied.

import {
  ApiRequestError,
  applyScheduleEvent,
  fetchProjectSchedule,
  previewScheduleCommand,
  UnauthorizedError,
} from "../../api";
import { escapeHtml, formatDate } from "../../format";
import type {
  ProjectScheduleLike,
  ScheduleActivityLike,
  ScheduleCommandLike,
  ScheduleCommandPreviewLike,
} from "../../types";

function dash(value: string | null | undefined): string {
  return value ? escapeHtml(value) : "—";
}

function stateLabel(state: string): string {
  return state.replaceAll("_", " ");
}

// FormData.get() returns FormDataEntryValue | null (string | File | null). None of this module's
// forms include a file input, but the type doesn't know that -- this narrows explicitly rather
// than stringifying a possible File with String() (@typescript-eslint/no-base-to-string).
function formString(data: FormData, key: string, fallback = ""): string {
  const value = data.get(key);
  return typeof value === "string" ? value : fallback;
}

/**
 * Renders the Schedule module. Owns its own re-fetch/re-render cycle rather than the module
 * signature's `summary` param (that snapshot is Overview's; a schedule edit must always act on
 * the freshest canonical revision, fetched fresh from GET .../schedule).
 */
export async function renderSchedule(
  body: HTMLElement,
  projectId: string,
): Promise<void> {
  body.innerHTML = `<p>Loading schedule&hellip;</p>`;

  let schedule: ProjectScheduleLike;
  try {
    schedule = await fetchProjectSchedule(projectId);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    body.innerHTML = `<p class="ic-empty">Could not load the schedule.</p>`;
    return;
  }

  let expandedActivityId: string | null = null;

  async function reload(): Promise<void> {
    try {
      schedule = await fetchProjectSchedule(projectId);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/");
        return;
      }
      throw error;
    }
    render();
  }

  function activityOptions(excludeId?: string): string {
    return schedule.activities
      .filter((a) => a.activityId !== excludeId)
      .map(
        (a) =>
          `<option value="${escapeHtml(a.activityId)}">${escapeHtml(a.name)}</option>`,
      )
      .join("");
  }

  /**
   * The one place a command goes from "PM submitted a form" to "canonical event applied". Always
   * previews first and requires an explicit Confirm click before ever calling apply -- the save/
   * confirmation model the recovery directive requires is enforced here, once, for every action
   * below, rather than re-implemented per form.
   */
  async function runCommand(
    command: ScheduleCommandLike,
    panel: HTMLElement,
  ): Promise<void> {
    let preview: ScheduleCommandPreviewLike;
    try {
      preview = await previewScheduleCommand(projectId, command);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/");
        return;
      }
      const message =
        error instanceof ApiRequestError
          ? error.message
          : "Could not preview this change.";
      panel.innerHTML = `<p class="sched-error">${escapeHtml(message)}</p>`;
      return;
    }

    const delta = preview.delta;
    const shifted = delta?.shiftedActivities ?? [];
    const consequenceHtml = `
      <div class="sched-consequence">
        <p class="sched-consequence-note">${escapeHtml(preview.historyNote)}</p>
        ${
          delta
            ? `<p>Projected completion: ${escapeHtml(delta.completionLikely.from)} &rarr; ${escapeHtml(delta.completionLikely.to)}
               (${String(delta.completionLikely.deltaWorkdays)} workday${Math.abs(delta.completionLikely.deltaWorkdays) === 1 ? "" : "s"})</p>`
            : `<p class="ic-empty">No forecast delta available yet.</p>`
        }
        ${
          shifted.length > 0
            ? `<p>${String(shifted.length)} downstream activit${shifted.length === 1 ? "y" : "ies"} shift${shifted.length === 1 ? "s" : ""} (${String(delta?.criticalShiftCount ?? 0)} on the critical path):</p>
               <ul>${shifted
                 .map(
                   (s) =>
                     `<li>${escapeHtml(s.activityName)}${s.critical ? " (critical)" : ""}: start ${escapeHtml(s.startLikely.from)} &rarr; ${escapeHtml(s.startLikely.to)}</li>`,
                 )
                 .join("")}</ul>`
            : `<p class="ic-empty">No downstream activities are affected.</p>`
        }
        <p>Recovery status: ${escapeHtml(preview.recoveryAnalysis.status)}</p>
        <div class="sched-actions">
          <button type="button" class="sched-confirm">Confirm</button>
          <button type="button" class="sched-cancel">Cancel</button>
        </div>
      </div>
    `;
    panel.innerHTML = consequenceHtml;

    panel
      .querySelector<HTMLButtonElement>(".sched-cancel")
      ?.addEventListener("click", () => {
        render();
      });
    panel
      .querySelector<HTMLButtonElement>(".sched-confirm")
      ?.addEventListener("click", () => {
        panel.innerHTML = `<p>Applying&hellip;</p>`;
        applyScheduleEvent(projectId, preview.event, preview.reviewToken)
          .then(() => reload())
          .catch((error: unknown) => {
            if (error instanceof UnauthorizedError) {
              window.location.assign("/");
              return;
            }
            const message =
              error instanceof ApiRequestError
                ? error.message
                : "This project changed since you loaded it. Reload to see the latest state.";
            panel.innerHTML = `<p class="sched-error">${escapeHtml(message)}</p>`;
          });
      });
  }

  function renderActionForm(activity: ScheduleActivityLike): string {
    return `
      <div class="sched-detail-forms">
        <details>
          <summary>Rename</summary>
          <form data-action="RENAME_ACTIVITY">
            <input type="text" name="name" value="${escapeHtml(activity.name)}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Change phase</summary>
          <form data-action="SET_PHASE">
            <input type="text" name="phase" value="${escapeHtml(activity.phase)}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Change duration (days)</summary>
          <form data-action="SET_DURATION">
            <label>Optimistic <input type="number" name="optimistic" min="1" value="${String(activity.duration.optimistic)}" required /></label>
            <label>Likely <input type="number" name="likely" min="1" value="${String(activity.duration.likely)}" required /></label>
            <label>Conservative <input type="number" name="conservative" min="1" value="${String(activity.duration.conservative)}" required /></label>
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Committed start / finish</summary>
          <form data-action="SET_COMMITTED_DATES">
            <label>Start <input type="date" name="startDate" value="${activity.committedStart ?? ""}" /></label>
            <label>Finish <input type="date" name="finishDate" value="${activity.committedFinish ?? ""}" /></label>
            <button type="submit">Save</button>
          </form>
          ${
            activity.isLocked
              ? `<button type="button" class="sched-clear-lock" data-activity="${escapeHtml(activity.activityId)}">Clear commitment</button>`
              : ""
          }
        </details>
        <details>
          <summary>Record actual start</summary>
          <form data-action="SET_ACTUAL_START">
            <input type="date" name="date" value="${activity.actualStart ?? ""}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details ${activity.actualStart ? "" : 'class="sched-disabled"'}>
          <summary>Record actual finish</summary>
          <form data-action="SET_ACTUAL_FINISH">
            <input type="date" name="date" value="${activity.actualFinish ?? ""}" required ${activity.actualStart ? "" : "disabled"} />
            <button type="submit" ${activity.actualStart ? "" : "disabled"}>Save</button>
          </form>
          ${activity.actualStart ? "" : '<p class="ic-empty">Record an actual start first.</p>'}
        </details>
        <details>
          <summary>Change state</summary>
          <form data-action="SET_ACTIVITY_STATE">
            <select name="state">
              <option value="NOT_STARTED" ${activity.state === "NOT_STARTED" ? "selected" : ""}>Not started</option>
              <option value="IN_PROGRESS" ${activity.state === "IN_PROGRESS" ? "selected" : ""}>In progress</option>
              <option value="COMPLETE" ${activity.state === "COMPLETE" ? "selected" : ""}>Complete</option>
            </select>
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Add dependency (this activity depends on&hellip;)</summary>
          <form data-action="ADD_DEPENDENCY">
            <select name="predecessorId" required>${activityOptions(activity.activityId)}</select>
            <input type="text" name="type" value="FINISH_TO_START" required />
            <label>Lag (workdays) <input type="number" name="lagWorkdays" value="0" required /></label>
            <label><input type="checkbox" name="hard" checked /> Hard dependency</label>
            <input type="text" name="reason" placeholder="Reason" required />
            <button type="submit">Add</button>
          </form>
        </details>
      </div>
    `;
  }

  function renderDependencyList(activity: ScheduleActivityLike): string {
    if (activity.predecessors.length === 0) {
      return `<p class="ic-empty">No predecessors.</p>`;
    }
    return `<ul>${activity.predecessors
      .map(
        (dep) => `
        <li>
          Depends on <strong>${escapeHtml(dep.activityName)}</strong> (${escapeHtml(dep.type)}, lag ${String(dep.lagWorkdays)}d${dep.hard ? ", hard" : ""})
          <button type="button" class="sched-remove-dep" data-dependency="${escapeHtml(dep.dependencyId)}">Remove</button>
          <details>
            <summary>Edit</summary>
            <form data-action="EDIT_DEPENDENCY" data-dependency="${escapeHtml(dep.dependencyId)}">
              <input type="text" name="type" value="${escapeHtml(dep.type)}" />
              <label>Lag <input type="number" name="lagWorkdays" value="${String(dep.lagWorkdays)}" /></label>
              <label><input type="checkbox" name="hard" ${dep.hard ? "checked" : ""} /> Hard</label>
              <input type="text" name="reason" value="${escapeHtml(dep.reason)}" />
              <button type="submit">Save</button>
            </form>
          </details>
        </li>`,
      )
      .join("")}</ul>`;
  }

  function renderDetail(activity: ScheduleActivityLike): string {
    const constraintsHtml =
      activity.constraints.length > 0
        ? `<ul>${activity.constraints
            .map(
              (c) =>
                `<li>${escapeHtml(c.label)} &mdash; ${escapeHtml(c.state)}${c.hard ? " (hard)" : ""}</li>`,
            )
            .join("")}</ul>`
        : `<p class="ic-empty">No blockers or constraints recorded.</p>`;
    const successorsHtml =
      activity.successors.length > 0
        ? `<ul>${activity.successors.map((s) => `<li>${escapeHtml(s.activityName)}</li>`).join("")}</ul>`
        : `<p class="ic-empty">Nothing depends on this activity.</p>`;

    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(activity.activityId)}">
        <td colspan="8">
          <div class="sched-action-panel"></div>
          <div class="sched-detail-grid">
            <div>
              <h4>Predecessors</h4>
              ${renderDependencyList(activity)}
            </div>
            <div>
              <h4>Successors (depend on this)</h4>
              ${successorsHtml}
            </div>
            <div>
              <h4>Blockers / constraints</h4>
              ${constraintsHtml}
            </div>
          </div>
          ${renderActionForm(activity)}
        </td>
      </tr>
    `;
  }

  function activityRowHtml(activity: ScheduleActivityLike): string {
    const forecastCell =
      activity.forecastStart || activity.forecastFinish
        ? `${dash(formatDate(activity.forecastStart))} &rarr; ${dash(formatDate(activity.forecastFinish))}`
        : "—";
    const committedCell = activity.isLocked
      ? `${dash(formatDate(activity.committedStart))} &rarr; ${dash(formatDate(activity.committedFinish))}`
      : "—";
    const actualCell =
      activity.actualStart || activity.actualFinish
        ? `${dash(formatDate(activity.actualStart))} &rarr; ${dash(formatDate(activity.actualFinish))}`
        : "—";
    const exposure =
      activity.critical === null
        ? "—"
        : activity.critical
          ? "Critical"
          : `${String(activity.floatWorkdays ?? 0)}d float`;
    return `
      <tr class="sched-row" data-activity="${escapeHtml(activity.activityId)}">
        <td>${escapeHtml(activity.name)}</td>
        <td>${escapeHtml(activity.phase)}</td>
        <td>${escapeHtml(stateLabel(activity.state))}</td>
        <td>${dash(activity.trade)}</td>
        <td>${committedCell}</td>
        <td>${forecastCell}</td>
        <td>${actualCell}</td>
        <td>${exposure}</td>
      </tr>
    `;
  }

  function render(): void {
    body.innerHTML = `
      <div class="sched-toolbar">
        <button type="button" id="sched-add-activity">+ Add activity</button>
      </div>
      <div class="sched-action-panel" id="sched-top-panel"></div>
      <table class="sched-table">
        <thead>
          <tr>
            <th>Activity</th><th>Phase</th><th>State</th><th>Trade</th>
            <th>Committed</th><th>Forecast</th><th>Actual</th><th>Exposure</th>
          </tr>
        </thead>
        <tbody>
          ${
            schedule.activities.length === 0
              ? `<tr><td colspan="8" class="ic-empty">No activities recorded yet.</td></tr>`
              : schedule.activities
                  .map((activity) =>
                    activity.activityId === expandedActivityId
                      ? activityRowHtml(activity) + renderDetail(activity)
                      : activityRowHtml(activity),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;

    body
      .querySelector<HTMLButtonElement>("#sched-add-activity")
      ?.addEventListener("click", () => {
        showAddActivityForm();
      });

    body.querySelectorAll<HTMLTableRowElement>(".sched-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.activity ?? null;
        expandedActivityId = expandedActivityId === id ? null : id;
        render();
      });
    });

    const detailRow = body.querySelector<HTMLElement>(".sched-detail-row");
    if (detailRow && expandedActivityId) {
      const activity = schedule.activities.find(
        (a) => a.activityId === expandedActivityId,
      );
      if (activity) wireDetail(detailRow, activity);
    }
  }

  function showAddActivityForm(): void {
    const panel = body.querySelector<HTMLElement>("#sched-top-panel");
    if (!panel) return;
    panel.innerHTML = `
      <form data-action="ADD_ACTIVITY" class="sched-add-activity-form">
        <input type="text" name="name" placeholder="Activity name" required />
        <input type="text" name="phase" placeholder="Phase" required />
        <label>Optimistic <input type="number" name="optimistic" min="1" value="2" required /></label>
        <label>Likely <input type="number" name="likely" min="1" value="3" required /></label>
        <label>Conservative <input type="number" name="conservative" min="1" value="5" required /></label>
        <button type="submit">Continue</button>
      </form>
    `;
    const form = panel.querySelector<HTMLFormElement>(
      'form[data-action="ADD_ACTIVITY"]',
    );
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      void runCommand(
        {
          kind: "ADD_ACTIVITY",
          name: formString(data, "name"),
          phase: formString(data, "phase"),
          duration: {
            optimistic: Number(data.get("optimistic")),
            likely: Number(data.get("likely")),
            conservative: Number(data.get("conservative")),
          },
        },
        panel,
      );
    });
  }

  function wireDetail(
    detailRow: HTMLElement,
    activity: ScheduleActivityLike,
  ): void {
    const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
    if (!panel) return;

    detailRow
      .querySelectorAll<HTMLButtonElement>(".sched-remove-dep")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const dependencyId = button.dataset.dependency;
          if (!dependencyId) return;
          void runCommand({ kind: "REMOVE_DEPENDENCY", dependencyId }, panel);
        });
      });

    const clearLockButton =
      detailRow.querySelector<HTMLButtonElement>(".sched-clear-lock");
    clearLockButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      void runCommand(
        { kind: "CLEAR_COMMITTED_DATES", activityId: activity.activityId },
        panel,
      );
    });

    detailRow.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
      form.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const action = form.dataset.action;
        const command = buildCommand(action, activity, form.dataset, data);
        if (command) void runCommand(command, panel);
      });
    });
  }

  function buildCommand(
    action: string | undefined,
    activity: ScheduleActivityLike,
    formDataset: DOMStringMap,
    data: FormData,
  ): ScheduleCommandLike | null {
    const activityId = activity.activityId;
    switch (action) {
      case "RENAME_ACTIVITY":
        return {
          kind: "RENAME_ACTIVITY",
          activityId,
          name: formString(data, "name"),
        };
      case "SET_PHASE":
        return {
          kind: "SET_PHASE",
          activityId,
          phase: formString(data, "phase"),
        };
      case "SET_DURATION":
        return {
          kind: "SET_DURATION",
          activityId,
          duration: {
            optimistic: Number(data.get("optimistic")),
            likely: Number(data.get("likely")),
            conservative: Number(data.get("conservative")),
          },
        };
      case "SET_COMMITTED_DATES": {
        const startDate = formString(data, "startDate").trim();
        const finishDate = formString(data, "finishDate").trim();
        return {
          kind: "SET_COMMITTED_DATES",
          activityId,
          ...(startDate ? { startDate } : {}),
          ...(finishDate ? { finishDate } : {}),
        };
      }
      case "SET_ACTUAL_START":
        return {
          kind: "SET_ACTUAL_START",
          activityId,
          date: formString(data, "date"),
        };
      case "SET_ACTUAL_FINISH":
        return {
          kind: "SET_ACTUAL_FINISH",
          activityId,
          date: formString(data, "date"),
        };
      case "SET_ACTIVITY_STATE":
        return {
          kind: "SET_ACTIVITY_STATE",
          activityId,
          state: formString(
            data,
            "state",
            "NOT_STARTED",
          ) as ScheduleActivityLike["state"],
        };
      case "ADD_DEPENDENCY":
        return {
          kind: "ADD_DEPENDENCY",
          predecessorId: formString(data, "predecessorId"),
          successorId: activityId,
          type: formString(data, "type", "FINISH_TO_START"),
          lagWorkdays: Number(data.get("lagWorkdays") ?? 0),
          hard: data.get("hard") !== null,
          reason: formString(data, "reason"),
        };
      case "EDIT_DEPENDENCY": {
        const dependencyId = formDataset.dependency;
        if (!dependencyId) return null;
        return {
          kind: "EDIT_DEPENDENCY",
          dependencyId,
          type: formString(data, "type"),
          lagWorkdays: Number(data.get("lagWorkdays") ?? 0),
          hard: data.get("hard") !== null,
          reason: formString(data, "reason"),
        };
      }
      default:
        return null;
    }
  }

  render();
}
