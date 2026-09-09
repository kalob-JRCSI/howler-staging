// Phase 4 (Howler Recovery Directive, Budget + Change Orders): Change Orders answers "what
// changed since baseline." Reads GET .../change-orders (src/operator/change-orders.ts's
// buildChangeOrdersView) and writes through the exact same preview -> apply save model
// Schedule/Scope/Budget established. Lifecycle actions (Propose, Submit for approval, Approve,
// Reject, Reopen, Void) are always full preview -> consequence -> confirm, never clerical --
// they change the project's approved-budget exposure. Only pure text-field edits
// (title/description/reason/number/notes) can auto-apply, exactly as the backend's own
// `clerical` flag decides.

import {
  ApiRequestError,
  applyScheduleEvent as applyChangeOrderEvent,
  fetchProjectBudget,
  fetchProjectChangeOrders,
  previewChangeOrderCommand,
  UnauthorizedError,
} from "../../api";
import { escapeHtml, formatMoneyMinor } from "../../format";
import type {
  ChangeOrderCommandLike,
  ChangeOrderCommandPreviewLike,
  ChangeOrderViewLike,
  MoneyLike,
  ProjectBudgetWorkspaceLike,
  ProjectChangeOrdersWorkspaceLike,
} from "../../types";

function dash(value: string | null | undefined): string {
  return value ? escapeHtml(value) : "—";
}

function formString(data: FormData, key: string, fallback = ""): string {
  const value = data.get(key);
  return typeof value === "string" ? value : fallback;
}

function parseMoneyInput(
  data: FormData,
  amountKey: string,
  currency: string,
): MoneyLike | null {
  const raw = data.get(amountKey);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  return { amountMinor: Math.round(amount * 100), currency };
}

const NEXT_LIFECYCLE_ACTION: Partial<
  Record<ChangeOrderViewLike["status"], { kind: string; label: string }>
> = {
  DRAFT: { kind: "PROPOSE", label: "Propose" },
  PROPOSED: { kind: "SUBMIT_FOR_APPROVAL", label: "Submit for approval" },
  PENDING_APPROVAL: { kind: "APPROVE", label: "Approve" },
};

export async function renderChangeOrders(
  body: HTMLElement,
  projectId: string,
): Promise<void> {
  body.innerHTML = `<p>Loading change orders&hellip;</p>`;

  let workspace: ProjectChangeOrdersWorkspaceLike;
  let budget: ProjectBudgetWorkspaceLike | null = null;
  try {
    workspace = await fetchProjectChangeOrders(projectId);
    if (workspace.initialized) {
      budget = await fetchProjectBudget(projectId);
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    body.innerHTML = `<p class="ic-empty">Could not load change orders.</p>`;
    return;
  }

  let expandedChangeOrderId: string | null = null;

  async function reload(): Promise<void> {
    try {
      workspace = await fetchProjectChangeOrders(projectId);
      budget = workspace.initialized
        ? await fetchProjectBudget(projectId)
        : null;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/");
        return;
      }
      throw error;
    }
    render();
  }

  async function runCommand(
    command: ChangeOrderCommandLike,
    panel: HTMLElement,
  ): Promise<void> {
    let preview: ChangeOrderCommandPreviewLike;
    try {
      preview = await previewChangeOrderCommand(projectId, command);
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
        await applyChangeOrderEvent(
          projectId,
          preview.event,
          preview.reviewToken,
        );
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

    panel.innerHTML = `
      <div class="sched-consequence">
        <p class="sched-consequence-note">${escapeHtml(preview.historyNote)}</p>
        <div class="sched-actions">
          <button type="button" class="sched-confirm">Confirm</button>
          <button type="button" class="sched-cancel">Cancel</button>
        </div>
      </div>
    `;
    panel
      .querySelector<HTMLButtonElement>(".sched-cancel")
      ?.addEventListener("click", () => {
        render();
      });
    panel
      .querySelector<HTMLButtonElement>(".sched-confirm")
      ?.addEventListener("click", () => {
        panel.innerHTML = `<p>Applying&hellip;</p>`;
        applyChangeOrderEvent(projectId, preview.event, preview.reviewToken)
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

  function renderUninitialized(): void {
    body.innerHTML = `<p class="ic-empty">This project's financials have not been set up yet. Set up Budget first before creating change orders.</p>`;
  }

  function renderSummary(): string {
    if (!workspace.approvedTotal || !workspace.pendingTotal) return "";
    return `
      <div class="ic-overview-section">
        <h3>Change order exposure (${escapeHtml(workspace.currency ?? "")})</h3>
        <p>Approved: ${formatMoneyMinor(workspace.approvedTotal)}</p>
        <p>Pending decision: ${formatMoneyMinor(workspace.pendingTotal)}</p>
      </div>
    `;
  }

  function statusLabel(status: string): string {
    return status.replaceAll("_", " ");
  }

  function categoryOptions(): string {
    return (budget?.categories ?? [])
      .filter((c) => c.active)
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`,
      )
      .join("");
  }

  function detailHtml(co: ChangeOrderViewLike): string {
    const next = NEXT_LIFECYCLE_ACTION[co.status];
    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(co.id)}">
        <td colspan="6">
          <div class="sched-action-panel"></div>
          <div class="sched-detail-forms">
            ${
              next
                ? `<button type="button" class="sched-lifecycle-action" data-co="${escapeHtml(co.id)}" data-action="${next.kind}">${escapeHtml(next.label)}</button>`
                : ""
            }
            ${
              co.status === "PENDING_APPROVAL"
                ? `<button type="button" class="sched-lifecycle-action" data-co="${escapeHtml(co.id)}" data-action="REJECT">Reject</button>`
                : ""
            }
            ${
              co.status === "PROPOSED" || co.status === "REJECTED"
                ? `<button type="button" class="sched-lifecycle-action" data-co="${escapeHtml(co.id)}" data-action="REOPEN_TO_DRAFT">Reopen to draft</button>`
                : ""
            }
            ${
              co.status !== "VOID"
                ? `<button type="button" class="sched-lifecycle-action" data-co="${escapeHtml(co.id)}" data-action="VOID">Void</button>`
                : ""
            }
            <details>
              <summary>Title</summary>
              <form data-action="SET_TITLE">
                <input type="text" name="title" value="${escapeHtml(co.title)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Description</summary>
              <form data-action="SET_DESCRIPTION">
                <input type="text" name="description" value="${escapeHtml(co.description ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Reason</summary>
              <form data-action="SET_REASON">
                <input type="text" name="reason" value="${escapeHtml(co.reason ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Number</summary>
              <form data-action="SET_NUMBER">
                <input type="text" name="number" value="${escapeHtml(co.number ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Cost</summary>
              <form data-action="SET_COST">
                <input type="number" name="amount" step="0.01" value="${String(co.cost.amountMinor / 100)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Declared schedule impact (days)</summary>
              <form data-action="SET_DECLARED_SCHEDULE_IMPACT">
                <input type="number" name="days" value="${co.declaredScheduleImpactDays === null ? "" : String(co.declaredScheduleImpactDays)}" placeholder="e.g. 14" />
                <p class="ic-empty">A declared fact only -- Schedule itself is never changed by this.</p>
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Budget category</summary>
              <form data-action="SET_CATEGORY">
                <select name="categoryId">
                  <option value="">None</option>
                  ${categoryOptions()}
                </select>
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Client approved</summary>
              <button type="button" class="sched-toggle-client-approved" data-co="${escapeHtml(co.id)}" data-client-approved="${co.clientApproved ? "true" : "false"}">
                Mark client ${co.clientApproved ? "not approved" : "approved"}
              </button>
            </details>
            <details>
              <summary>Notes</summary>
              <form data-action="SET_NOTES">
                <input type="text" name="notes" value="${escapeHtml(co.notes ?? "")}" />
                <button type="submit">Save</button>
              </form>
            </details>
          </div>
        </td>
      </tr>
    `;
  }

  function rowHtml(co: ChangeOrderViewLike): string {
    return `
      <tr class="sched-row" data-co="${escapeHtml(co.id)}">
        <td>${escapeHtml(co.title)}${co.number ? ` (${escapeHtml(co.number)})` : ""}</td>
        <td>${statusLabel(co.status)}</td>
        <td>${formatMoneyMinor(co.cost)}</td>
        <td>${co.declaredScheduleImpactDays !== null ? `${String(co.declaredScheduleImpactDays)} days` : "—"}</td>
        <td>${dash(co.categoryName)}</td>
        <td>${co.clientApproved ? "Yes" : "No"}</td>
      </tr>
    `;
  }

  function showAddForm(): void {
    const panel = body.querySelector<HTMLElement>("#co-add-panel");
    if (!panel) return;
    panel.innerHTML = `
      <form data-action="ADD_CHANGE_ORDER" class="sched-add-activity-form">
        <input type="text" name="title" placeholder="Title" required />
        <input type="number" name="amount" step="0.01" placeholder="Cost" required />
        <input type="text" name="reason" placeholder="Reason (optional)" />
        <select name="categoryId">
          <option value="">No category</option>
          ${categoryOptions()}
        </select>
        <button type="submit">Create draft</button>
      </form>
    `;
    const form = panel.querySelector<HTMLFormElement>(
      'form[data-action="ADD_CHANGE_ORDER"]',
    );
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!workspace.currency) return;
      const data = new FormData(form);
      const cost = parseMoneyInput(data, "amount", workspace.currency);
      if (!cost) return;
      const reason = formString(data, "reason").trim();
      const categoryId = formString(data, "categoryId").trim();
      void runCommand(
        {
          kind: "ADD_CHANGE_ORDER",
          title: formString(data, "title"),
          cost,
          ...(reason ? { reason } : {}),
          ...(categoryId ? { categoryId } : {}),
        },
        panel,
      );
    });
  }

  function wireDetail(detailRow: HTMLElement, co: ChangeOrderViewLike): void {
    const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
    if (!panel || !workspace.currency) return;
    const currency = workspace.currency;

    detailRow
      .querySelectorAll<HTMLButtonElement>(".sched-lifecycle-action")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const action = button.dataset.action;
          if (!action) return;
          void runCommand(
            { kind: action, changeOrderId: co.id } as ChangeOrderCommandLike,
            panel,
          );
        });
      });

    detailRow
      .querySelector<HTMLButtonElement>(".sched-toggle-client-approved")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        void runCommand(
          {
            kind: "SET_CLIENT_APPROVED",
            changeOrderId: co.id,
            clientApproved: !co.clientApproved,
          },
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
        if (action === "SET_TITLE") {
          void runCommand(
            {
              kind: "SET_TITLE",
              changeOrderId: co.id,
              title: formString(data, "title"),
            },
            panel,
          );
        } else if (action === "SET_DESCRIPTION") {
          void runCommand(
            {
              kind: "SET_DESCRIPTION",
              changeOrderId: co.id,
              description: formString(data, "description"),
            },
            panel,
          );
        } else if (action === "SET_REASON") {
          void runCommand(
            {
              kind: "SET_REASON",
              changeOrderId: co.id,
              reason: formString(data, "reason"),
            },
            panel,
          );
        } else if (action === "SET_NUMBER") {
          void runCommand(
            {
              kind: "SET_NUMBER",
              changeOrderId: co.id,
              number: formString(data, "number"),
            },
            panel,
          );
        } else if (action === "SET_COST") {
          const cost = parseMoneyInput(data, "amount", currency);
          if (!cost) return;
          void runCommand(
            { kind: "SET_COST", changeOrderId: co.id, cost },
            panel,
          );
        } else if (action === "SET_DECLARED_SCHEDULE_IMPACT") {
          const raw = formString(data, "days").trim();
          const declaredScheduleImpactDays = raw === "" ? null : Number(raw);
          void runCommand(
            {
              kind: "SET_DECLARED_SCHEDULE_IMPACT",
              changeOrderId: co.id,
              declaredScheduleImpactDays,
            },
            panel,
          );
        } else if (action === "SET_CATEGORY") {
          const categoryId = formString(data, "categoryId").trim();
          void runCommand(
            {
              kind: "SET_CATEGORY",
              changeOrderId: co.id,
              categoryId: categoryId || null,
            },
            panel,
          );
        } else if (action === "SET_NOTES") {
          void runCommand(
            {
              kind: "SET_NOTES",
              changeOrderId: co.id,
              notes: formString(data, "notes"),
            },
            panel,
          );
        }
      });
    });
  }

  function render(): void {
    if (!workspace.initialized) {
      renderUninitialized();
      return;
    }
    const changeOrders = workspace.changeOrders;
    body.innerHTML = `
      ${renderSummary()}
      <h3>+ New change order (starts as DRAFT)</h3>
      <div class="sched-action-panel" id="co-add-panel"></div>
      <table class="sched-table">
        <thead>
          <tr><th>Title</th><th>Status</th><th>Cost</th><th>Schedule impact</th><th>Category</th><th>Client approved</th></tr>
        </thead>
        <tbody>
          ${
            changeOrders.length === 0
              ? `<tr><td colspan="6" class="ic-empty">No change orders recorded yet.</td></tr>`
              : changeOrders
                  .map(
                    (co) =>
                      rowHtml(co) +
                      (co.id === expandedChangeOrderId ? detailHtml(co) : ""),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;
    showAddForm();

    body
      .querySelectorAll<HTMLTableRowElement>("tr[data-co].sched-row")
      .forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.co ?? null;
          expandedChangeOrderId = expandedChangeOrderId === id ? null : id;
          render();
        });
      });

    const detailRow = body.querySelector<HTMLElement>(
      `.sched-detail-row[data-detail-for="${expandedChangeOrderId ?? ""}"]`,
    );
    const co = workspace.changeOrders.find(
      (c) => c.id === expandedChangeOrderId,
    );
    if (detailRow && co) wireDetail(detailRow, co);
  }

  render();
}
