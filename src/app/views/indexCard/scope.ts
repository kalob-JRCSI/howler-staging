// Phase 3 (Howler Recovery Directive, Functional Project Scope Workspace): Scope answers WHAT are
// we building; Schedule (schedule.ts) answers WHEN. Reads GET .../scope (src/operator/scope.ts's
// buildScopeView) and writes through the same preview -> apply save model Schedule established.
// A clerical edit (rename/re-phase/re-trade/vendor/notes) applies immediately once previewed --
// per the recovery directive, minor text corrections should not be overburdened with ceremony.
// Every other command (add, include/exclude, allowance, status, activity associations,
// deactivation) shows the full preview -> consequence -> confirm flow, since it can plausibly
// affect budget, schedule, trades, or client approvals. The backend's own preview response
// decides which is which (`clerical`), so this file never has to keep a second copy of that list
// in sync.

import {
  ApiRequestError,
  applyScheduleEvent as applyScopeEvent,
  fetchProjectScope,
  previewScopeCommand,
  UnauthorizedError,
} from "../../api";
import { escapeHtml } from "../../format";
import type {
  ProjectScopeLike,
  ScopeCommandLike,
  ScopeCommandPreviewLike,
  ScopeItemViewLike,
} from "../../types";

function dash(value: string | null | undefined): string {
  return value ? escapeHtml(value) : "—";
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function formString(data: FormData, key: string, fallback = ""): string {
  const value = data.get(key);
  return typeof value === "string" ? value : fallback;
}

const ALL_PHASES = "__all_phases__";
const ALL_TRADES = "__all_trades__";

export async function renderScope(
  body: HTMLElement,
  projectId: string,
): Promise<void> {
  body.innerHTML = `<p>Loading scope&hellip;</p>`;

  let scope: ProjectScopeLike;
  try {
    scope = await fetchProjectScope(projectId);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    body.innerHTML = `<p class="ic-empty">Could not load project scope.</p>`;
    return;
  }

  let expandedScopeItemId: string | null = null;
  let phaseFilter = ALL_PHASES;
  let tradeFilter = ALL_TRADES;

  async function reload(): Promise<void> {
    try {
      scope = await fetchProjectScope(projectId);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/");
        return;
      }
      throw error;
    }
    render();
  }

  function activityOptions(selectedIds: string[]): string {
    return scope.allActivities
      .map(
        (activity) =>
          `<option value="${escapeHtml(activity.activityId)}" ${selectedIds.includes(activity.activityId) ? "selected" : ""}>${escapeHtml(activity.activityName)}</option>`,
      )
      .join("");
  }

  /**
   * The one place a scope command goes from "PM submitted a form" to "canonical event applied".
   * A clerical command previews then applies immediately, no confirmation pause; every other
   * command shows the consequence panel and waits for an explicit Confirm.
   */
  async function runCommand(
    command: ScopeCommandLike,
    panel: HTMLElement,
  ): Promise<void> {
    let preview: ScopeCommandPreviewLike;
    try {
      preview = await previewScopeCommand(projectId, command);
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

    if (preview.clerical) {
      panel.innerHTML = `<p>Saving&hellip;</p>`;
      try {
        await applyScopeEvent(projectId, preview.event, preview.reviewToken);
        await reload();
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          window.location.assign("/");
          return;
        }
        const message =
          error instanceof ApiRequestError
            ? error.message
            : "This project changed since you loaded it. Reload to see the latest state.";
        panel.innerHTML = `<p class="sched-error">${escapeHtml(message)}</p>`;
      }
      return;
    }

    const delta = preview.delta;
    const consequenceHtml = `
      <div class="sched-consequence">
        <p class="sched-consequence-note">${escapeHtml(preview.historyNote)}</p>
        ${
          delta
            ? `<p>Projected completion: ${escapeHtml(delta.completionLikely.from)} &rarr; ${escapeHtml(delta.completionLikely.to)}</p>`
            : `<p class="ic-empty">No forecast delta from this change.</p>`
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
        applyScopeEvent(projectId, preview.event, preview.reviewToken)
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

  function filteredItems(): ScopeItemViewLike[] {
    return scope.items.filter(
      (item) =>
        (phaseFilter === ALL_PHASES || item.phase === phaseFilter) &&
        (tradeFilter === ALL_TRADES || (item.trade ?? "") === tradeFilter),
    );
  }

  function distinctValues(
    pick: (item: ScopeItemViewLike) => string | null,
  ): string[] {
    return Array.from(
      new Set(scope.items.map(pick).filter((v): v is string => Boolean(v))),
    ).sort((a, b) => a.localeCompare(b));
  }

  function renderInsights(): string {
    if (scope.insights.length === 0) return "";
    return `
      <div class="sched-consequence" style="border-color: var(--border);">
        <p class="sched-consequence-note">Observations</p>
        <ul>${scope.insights.map((i) => `<li>${escapeHtml(i.message)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function renderActionForm(item: ScopeItemViewLike): string {
    const associatedActivityIds = item.activities.map((a) => a.activityId);
    return `
      <div class="sched-detail-forms">
        <details>
          <summary>Edit description</summary>
          <form data-action="SET_DESCRIPTION">
            <input type="text" name="description" value="${escapeHtml(item.description)}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Change phase</summary>
          <form data-action="SET_PHASE">
            <input type="text" name="phase" value="${escapeHtml(item.phase)}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Change trade/category</summary>
          <form data-action="SET_TRADE">
            <input type="text" name="trade" value="${escapeHtml(item.trade ?? "")}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Responsible vendor</summary>
          <form data-action="SET_RESPONSIBLE_VENDOR">
            <input type="text" name="vendor" value="${escapeHtml(item.responsibleVendor ?? "")}" required />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Notes</summary>
          <form data-action="SET_NOTES">
            <input type="text" name="notes" value="${escapeHtml(item.notes ?? "")}" />
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Allowance</summary>
          <form data-action="SET_ALLOWANCE">
            <label>Amount <input type="number" name="amount" min="0" step="0.01" value="${item.allowance ? String(item.allowance.amount) : ""}" /></label>
            <input type="text" name="currency" placeholder="USD" value="${escapeHtml(item.allowance?.currency ?? "USD")}" />
            <input type="text" name="note" placeholder="Note" value="${escapeHtml(item.allowance?.note ?? "")}" />
            <button type="submit">Save</button>
          </form>
          ${
            item.allowance
              ? `<button type="button" class="sched-clear-allowance" data-scope-item="${escapeHtml(item.id)}">Clear allowance</button>`
              : ""
          }
        </details>
        <details>
          <summary>Status</summary>
          <form data-action="SET_STATUS">
            <select name="status">
              ${[
                "NOT_STARTED",
                "IN_PROGRESS",
                "COMPLETE",
                "BLOCKED",
                "NOT_APPLICABLE",
              ]
                .map(
                  (s) =>
                    `<option value="${s}" ${item.status === s ? "selected" : ""}>${statusLabel(s)}</option>`,
                )
                .join("")}
            </select>
            <button type="submit">Save</button>
          </form>
        </details>
        <details>
          <summary>Included / excluded</summary>
          <button type="button" class="sched-toggle-included" data-scope-item="${escapeHtml(item.id)}" data-included="${item.included ? "true" : "false"}">
            Mark as ${item.included ? "excluded" : "included"}
          </button>
        </details>
        <details>
          <summary>Associate schedule activities</summary>
          <form data-action="ASSOCIATE_ACTIVITIES">
            <select name="activityIds" multiple size="4">${activityOptions(associatedActivityIds)}</select>
            <p class="ic-empty">Select one or more; replaces the current association list.</p>
            <button type="submit">Save</button>
          </form>
          ${
            item.activities.length > 0
              ? `<p>Currently: ${item.activities.map((a) => escapeHtml(a.activityName)).join(", ")}</p>`
              : ""
          }
        </details>
        <details>
          <summary>Remove scope item</summary>
          <button type="button" class="sched-deactivate" data-scope-item="${escapeHtml(item.id)}">Remove (non-destructive)</button>
        </details>
      </div>
    `;
  }

  function renderDetail(item: ScopeItemViewLike): string {
    const baselineHtml = item.addedAfterBaseline
      ? `<p class="ic-empty">Added after baseline.</p>`
      : item.baselineDescription !== null
        ? `<p class="ic-empty">Baseline: "${escapeHtml(item.baselineDescription)}" (${escapeHtml(item.baselinePhase ?? "")})</p>`
        : "";
    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(item.id)}">
        <td colspan="7">
          <div class="sched-action-panel"></div>
          ${baselineHtml}
          ${renderActionForm(item)}
        </td>
      </tr>
    `;
  }

  function rowHtml(item: ScopeItemViewLike): string {
    const activityNames = item.activities.map((a) => a.activityName).join(", ");
    const allowanceCell = item.allowance
      ? `${String(item.allowance.amount)} ${escapeHtml(item.allowance.currency)}`
      : "—";
    return `
      <tr class="sched-row" data-scope-item="${escapeHtml(item.id)}">
        <td>${escapeHtml(item.description)}${item.addedAfterBaseline ? ' <span class="ic-empty">(new)</span>' : ""}</td>
        <td>${escapeHtml(item.phase)}</td>
        <td>${dash(item.trade)}</td>
        <td>${statusLabel(item.status)}</td>
        <td>${item.included ? "Included" : "Excluded"}</td>
        <td>${allowanceCell}</td>
        <td>${activityNames ? escapeHtml(activityNames) : "—"}</td>
      </tr>
    `;
  }

  function render(): void {
    const phases = distinctValues((i) => i.phase);
    const trades = distinctValues((i) => i.trade);
    const items = filteredItems();

    body.innerHTML = `
      <div class="sched-toolbar">
        <button type="button" id="scope-add-item">+ Add scope item</button>
        <label>Phase
          <select id="scope-phase-filter">
            <option value="${ALL_PHASES}">All phases</option>
            ${phases.map((p) => `<option value="${escapeHtml(p)}" ${phaseFilter === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
          </select>
        </label>
        <label>Trade
          <select id="scope-trade-filter">
            <option value="${ALL_TRADES}">All trades</option>
            ${trades.map((t) => `<option value="${escapeHtml(t)}" ${tradeFilter === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
          </select>
        </label>
      </div>
      ${renderInsights()}
      <div class="sched-action-panel" id="scope-top-panel"></div>
      <table class="sched-table">
        <thead>
          <tr>
            <th>Description</th><th>Phase</th><th>Trade</th><th>Status</th>
            <th>Included</th><th>Allowance</th><th>Schedule activities</th>
          </tr>
        </thead>
        <tbody>
          ${
            items.length === 0
              ? `<tr><td colspan="7" class="ic-empty">No scope items recorded yet.</td></tr>`
              : items
                  .map((item) =>
                    item.id === expandedScopeItemId
                      ? rowHtml(item) + renderDetail(item)
                      : rowHtml(item),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;

    body
      .querySelector<HTMLButtonElement>("#scope-add-item")
      ?.addEventListener("click", () => {
        showAddForm();
      });
    body
      .querySelector<HTMLSelectElement>("#scope-phase-filter")
      ?.addEventListener("change", (event) => {
        phaseFilter = (event.target as HTMLSelectElement).value;
        render();
      });
    body
      .querySelector<HTMLSelectElement>("#scope-trade-filter")
      ?.addEventListener("change", (event) => {
        tradeFilter = (event.target as HTMLSelectElement).value;
        render();
      });

    body.querySelectorAll<HTMLTableRowElement>(".sched-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.scopeItem ?? null;
        expandedScopeItemId = expandedScopeItemId === id ? null : id;
        render();
      });
    });

    const detailRow = body.querySelector<HTMLElement>(".sched-detail-row");
    if (detailRow && expandedScopeItemId) {
      const item = scope.items.find((i) => i.id === expandedScopeItemId);
      if (item) wireDetail(detailRow, item);
    }
  }

  function showAddForm(): void {
    const panel = body.querySelector<HTMLElement>("#scope-top-panel");
    if (!panel) return;
    panel.innerHTML = `
      <form data-action="ADD_SCOPE_ITEM" class="sched-add-activity-form">
        <input type="text" name="description" placeholder="Scope description" required />
        <input type="text" name="phase" placeholder="Phase" required />
        <input type="text" name="trade" placeholder="Trade/category (optional)" />
        <button type="submit">Continue</button>
      </form>
    `;
    const form = panel.querySelector<HTMLFormElement>(
      'form[data-action="ADD_SCOPE_ITEM"]',
    );
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const trade = formString(data, "trade").trim();
      void runCommand(
        {
          kind: "ADD_SCOPE_ITEM",
          description: formString(data, "description"),
          phase: formString(data, "phase"),
          ...(trade ? { trade } : {}),
        },
        panel,
      );
    });
  }

  function wireDetail(detailRow: HTMLElement, item: ScopeItemViewLike): void {
    const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
    if (!panel) return;

    detailRow
      .querySelector<HTMLButtonElement>(".sched-toggle-included")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        void runCommand(
          {
            kind: "SET_INCLUDED",
            scopeItemId: item.id,
            included: !item.included,
          },
          panel,
        );
      });
    detailRow
      .querySelector<HTMLButtonElement>(".sched-clear-allowance")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        void runCommand(
          { kind: "SET_ALLOWANCE", scopeItemId: item.id, allowance: null },
          panel,
        );
      });
    detailRow
      .querySelector<HTMLButtonElement>(".sched-deactivate")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        void runCommand(
          { kind: "DEACTIVATE_SCOPE_ITEM", scopeItemId: item.id },
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
        const command = buildCommand(action, item, data);
        if (command) void runCommand(command, panel);
      });
    });
  }

  function buildCommand(
    action: string | undefined,
    item: ScopeItemViewLike,
    data: FormData,
  ): ScopeCommandLike | null {
    const scopeItemId = item.id;
    switch (action) {
      case "SET_DESCRIPTION":
        return {
          kind: "SET_DESCRIPTION",
          scopeItemId,
          description: formString(data, "description"),
        };
      case "SET_PHASE":
        return {
          kind: "SET_PHASE",
          scopeItemId,
          phase: formString(data, "phase"),
        };
      case "SET_TRADE":
        return {
          kind: "SET_TRADE",
          scopeItemId,
          trade: formString(data, "trade"),
        };
      case "SET_RESPONSIBLE_VENDOR":
        return {
          kind: "SET_RESPONSIBLE_VENDOR",
          scopeItemId,
          vendor: formString(data, "vendor"),
        };
      case "SET_NOTES":
        return {
          kind: "SET_NOTES",
          scopeItemId,
          notes: formString(data, "notes"),
        };
      case "SET_ALLOWANCE": {
        const amountRaw = data.get("amount");
        const amount =
          typeof amountRaw === "string" && amountRaw !== ""
            ? Number(amountRaw)
            : null;
        if (amount === null)
          return { kind: "SET_ALLOWANCE", scopeItemId, allowance: null };
        const note = formString(data, "note").trim();
        return {
          kind: "SET_ALLOWANCE",
          scopeItemId,
          allowance: {
            amount,
            currency: formString(data, "currency", "USD"),
            ...(note ? { note } : {}),
          },
        };
      }
      case "SET_STATUS":
        return {
          kind: "SET_STATUS",
          scopeItemId,
          status: formString(
            data,
            "status",
            "NOT_STARTED",
          ) as ScopeItemViewLike["status"],
        };
      case "ASSOCIATE_ACTIVITIES": {
        const select = data
          .getAll("activityIds")
          .filter((v): v is string => typeof v === "string");
        return {
          kind: "ASSOCIATE_ACTIVITIES",
          scopeItemId,
          activityIds: select,
        };
      }
      default:
        return null;
    }
  }

  render();
}
