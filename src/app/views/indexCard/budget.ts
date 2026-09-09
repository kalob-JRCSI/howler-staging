// Phase 4 (Howler Recovery Directive, Budget + Change Orders): Budget answers "what did we plan
// to spend, what have we committed, what have we actually spent." Reads GET .../budget
// (src/operator/budget.ts's buildBudgetView) and writes through the exact same
// preview -> apply save model Schedule/Scope established. A clerical edit (pure text/metadata)
// applies immediately once previewed; every other command (init, baseline, add, money changes,
// void) shows the full preview -> consequence -> confirm flow, since it can plausibly affect the
// project's financial picture. The backend's own preview response decides which is which
// (`clerical`), so this file never keeps a second copy of that list in sync.

import {
  ApiRequestError,
  applyScheduleEvent as applyBudgetEvent,
  fetchProjectBudget,
  previewBudgetCommand,
  UnauthorizedError,
} from "../../api";
import { escapeHtml, formatMoneyMinor } from "../../format";
import type {
  ActualCostViewLike,
  BudgetCategoryViewLike,
  BudgetCommandLike,
  BudgetCommandPreviewLike,
  BudgetLineViewLike,
  CommitmentViewLike,
  MoneyLike,
  ProjectBudgetWorkspaceLike,
} from "../../types";

function dash(value: string | null | undefined): string {
  return value ? escapeHtml(value) : "—";
}

function moneyOrUnknown(money: MoneyLike | null): string {
  return money ? formatMoneyMinor(money) : "Unknown";
}

function formString(data: FormData, key: string, fallback = ""): string {
  const value = data.get(key);
  return typeof value === "string" ? value : fallback;
}

function parseMoneyInput(
  data: FormData,
  amountKey: string,
  currencyKey: string,
  fallbackCurrency: string,
): MoneyLike | null {
  const raw = data.get(amountKey);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  const currency =
    formString(data, currencyKey, fallbackCurrency) || fallbackCurrency;
  return { amountMinor: Math.round(amount * 100), currency };
}

export async function renderBudget(
  body: HTMLElement,
  projectId: string,
): Promise<void> {
  body.innerHTML = `<p>Loading budget&hellip;</p>`;

  let workspace: ProjectBudgetWorkspaceLike;
  try {
    workspace = await fetchProjectBudget(projectId);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    body.innerHTML = `<p class="ic-empty">Could not load project budget.</p>`;
    return;
  }

  let expandedCategoryId: string | null = null;
  let expandedLineId: string | null = null;
  let expandedCommitmentId: string | null = null;
  let expandedActualCostId: string | null = null;

  async function reload(): Promise<void> {
    try {
      workspace = await fetchProjectBudget(projectId);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/");
        return;
      }
      throw error;
    }
    render();
  }

  /** Mirrors scope.ts's own runCommand exactly: clerical previews apply immediately, everything
   * else shows the consequence panel and waits for an explicit Confirm. */
  async function runCommand(
    command: BudgetCommandLike,
    panel: HTMLElement,
  ): Promise<void> {
    let preview: BudgetCommandPreviewLike;
    try {
      preview = await previewBudgetCommand(projectId, command);
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
        await applyBudgetEvent(projectId, preview.event, preview.reviewToken);
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
        applyBudgetEvent(projectId, preview.event, preview.reviewToken)
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

  // ---------------------------------------------------------------------
  // Uninitialized state
  // ---------------------------------------------------------------------

  function renderUninitialized(): void {
    body.innerHTML = `
      <p class="ic-empty">This project's financials have not been set up yet. No budget, categories, or costs exist until you initialize it with a tracked currency.</p>
      <div class="sched-action-panel" id="budget-init-panel"></div>
      <form data-action="INITIALIZE_FINANCIALS" class="sched-add-activity-form">
        <label>Currency
          <select name="currency">
            <option value="USD" selected>USD</option>
            <option value="CAD">CAD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
            <option value="NZD">NZD</option>
          </select>
        </label>
        <button type="submit">Set up Budget</button>
      </form>
    `;
    const panel = body.querySelector<HTMLElement>("#budget-init-panel");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="INITIALIZE_FINANCIALS"]',
    );
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!panel) return;
      const data = new FormData(form);
      void runCommand(
        {
          kind: "INITIALIZE_FINANCIALS",
          currency: formString(data, "currency", "USD"),
        },
        panel,
      );
    });
  }

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------

  function renderSummary(): string {
    const summary = workspace.summary;
    if (!summary) return "";
    return `
      <div class="ic-overview-section">
        <h3>Financial summary (${escapeHtml(summary.currency)})</h3>
        <p>Baseline: ${moneyOrUnknown(summary.baseline)}</p>
        <p>Approved change orders: ${formatMoneyMinor(summary.approvedChangeOrderTotal)}</p>
        <p>Pending change orders: ${formatMoneyMinor(summary.pendingChangeOrderTotal)}</p>
        <p>Revised budget: ${moneyOrUnknown(summary.revisedBudget)}</p>
        <p>Committed: ${formatMoneyMinor(summary.committedTotal)}</p>
        <p>Actual recorded: ${formatMoneyMinor(summary.actualTotal)}</p>
        <p>Remaining/uncommitted: ${moneyOrUnknown(summary.remaining)}</p>
      </div>
      <div class="sched-action-panel" id="budget-baseline-panel"></div>
      <details>
        <summary>${summary.baseline ? "Update" : "Set"} financial baseline</summary>
        <form data-action="SET_FINANCIAL_BASELINE" class="sched-add-activity-form">
          <input type="number" name="amount" step="0.01" placeholder="Baseline amount" required
            value="${summary.baseline ? String(summary.baseline.amountMinor / 100) : ""}" />
          <input type="text" name="currency" value="${escapeHtml(summary.currency)}" readonly />
          <button type="submit">Save</button>
        </form>
      </details>
    `;
  }

  function wireSummary(): void {
    const panel = body.querySelector<HTMLElement>("#budget-baseline-panel");
    const form = body.querySelector<HTMLFormElement>(
      'form[data-action="SET_FINANCIAL_BASELINE"]',
    );
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!panel || !workspace.currency) return;
      const data = new FormData(form);
      const baseline = parseMoneyInput(
        data,
        "amount",
        "currency",
        workspace.currency,
      );
      if (!baseline) return;
      void runCommand({ kind: "SET_FINANCIAL_BASELINE", baseline }, panel);
    });
  }

  // ---------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------

  function categoryOptions(selectedId?: string): string {
    return workspace.categories
      .filter((c) => c.active)
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
      )
      .join("");
  }

  function categoryDetailHtml(category: BudgetCategoryViewLike): string {
    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(category.id)}">
        <td colspan="4">
          <div class="sched-action-panel"></div>
          <div class="sched-detail-forms">
            <details>
              <summary>Rename</summary>
              <form data-action="SET_CATEGORY_NAME">
                <input type="text" name="name" value="${escapeHtml(category.name)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Sort order</summary>
              <form data-action="SET_CATEGORY_SORT_ORDER">
                <input type="number" name="sortOrder" value="${String(category.sortOrder ?? 0)}" />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Notes</summary>
              <form data-action="SET_CATEGORY_NOTES">
                <input type="text" name="notes" value="${escapeHtml(category.notes ?? "")}" />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Remove category</summary>
              <button type="button" class="sched-deactivate" data-category="${escapeHtml(category.id)}">Remove (non-destructive)</button>
            </details>
          </div>
        </td>
      </tr>
    `;
  }

  function renderCategories(): string {
    const categories = workspace.categories.filter((c) => c.active);
    return `
      <h3>Budget categories</h3>
      <div class="sched-action-panel" id="budget-add-category-panel"></div>
      <details>
        <summary>+ Add category</summary>
        <form data-action="ADD_CATEGORY" class="sched-add-activity-form">
          <input type="text" name="name" placeholder="Category name" required />
          <button type="submit">Add</button>
        </form>
      </details>
      <table class="sched-table">
        <thead><tr><th>Name</th><th>Default</th><th>Sort</th><th>Notes</th></tr></thead>
        <tbody>
          ${
            categories.length === 0
              ? `<tr><td colspan="4" class="ic-empty">No budget categories yet.</td></tr>`
              : categories
                  .map(
                    (c) =>
                      `<tr class="sched-row" data-category="${escapeHtml(c.id)}">
                        <td>${escapeHtml(c.name)}</td>
                        <td>${c.isDefault ? "Yes" : "No"}</td>
                        <td>${c.sortOrder === null ? "—" : String(c.sortOrder)}</td>
                        <td>${dash(c.notes)}</td>
                      </tr>` +
                      (c.id === expandedCategoryId
                        ? categoryDetailHtml(c)
                        : ""),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;
  }

  function wireCategories(): void {
    const addPanel = body.querySelector<HTMLElement>(
      "#budget-add-category-panel",
    );
    const addForm = body.querySelector<HTMLFormElement>(
      'form[data-action="ADD_CATEGORY"]',
    );
    addForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!addPanel) return;
      const data = new FormData(addForm);
      void runCommand(
        { kind: "ADD_CATEGORY", name: formString(data, "name") },
        addPanel,
      );
    });

    body
      .querySelectorAll<HTMLTableRowElement>("tr[data-category].sched-row")
      .forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.category ?? null;
          expandedCategoryId = expandedCategoryId === id ? null : id;
          render();
        });
      });

    const detailRow = body.querySelector<HTMLElement>(
      `.sched-detail-row[data-detail-for="${expandedCategoryId ?? ""}"]`,
    );
    const category = workspace.categories.find(
      (c) => c.id === expandedCategoryId,
    );
    if (detailRow && category) {
      const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
      if (!panel) return;
      detailRow
        .querySelector<HTMLButtonElement>(".sched-deactivate")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          void runCommand(
            { kind: "DEACTIVATE_CATEGORY", categoryId: category.id },
            panel,
          );
        });
      detailRow.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
        form.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const data = new FormData(form);
          const action = form.dataset.action;
          if (action === "SET_CATEGORY_NAME") {
            void runCommand(
              {
                kind: "SET_CATEGORY_NAME",
                categoryId: category.id,
                name: formString(data, "name"),
              },
              panel,
            );
          } else if (action === "SET_CATEGORY_SORT_ORDER") {
            void runCommand(
              {
                kind: "SET_CATEGORY_SORT_ORDER",
                categoryId: category.id,
                sortOrder: Number(formString(data, "sortOrder", "0")),
              },
              panel,
            );
          } else if (action === "SET_CATEGORY_NOTES") {
            void runCommand(
              {
                kind: "SET_CATEGORY_NOTES",
                categoryId: category.id,
                notes: formString(data, "notes"),
              },
              panel,
            );
          }
        });
      });
    }
  }

  // ---------------------------------------------------------------------
  // Budget lines
  // ---------------------------------------------------------------------

  function lineDetailHtml(line: BudgetLineViewLike): string {
    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(line.id)}">
        <td colspan="8">
          <div class="sched-action-panel"></div>
          <div class="sched-detail-forms">
            <details>
              <summary>Description</summary>
              <form data-action="SET_LINE_DESCRIPTION">
                <input type="text" name="description" value="${escapeHtml(line.description)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Category</summary>
              <form data-action="SET_LINE_CATEGORY">
                <select name="categoryId">${categoryOptions(line.categoryId)}</select>
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Cost code</summary>
              <form data-action="SET_LINE_COST_CODE">
                <input type="text" name="costCode" value="${escapeHtml(line.costCode ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Trade</summary>
              <form data-action="SET_LINE_TRADE">
                <input type="text" name="trade" value="${escapeHtml(line.trade ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Baseline amount</summary>
              <form data-action="SET_LINE_BASELINE_AMOUNT">
                <input type="number" name="amount" step="0.01" placeholder="Unknown"
                  value="${line.baselineAmount ? String(line.baselineAmount.amountMinor / 100) : ""}" />
                <button type="submit">Save</button>
              </form>
              ${
                line.baselineAmount
                  ? `<button type="button" class="sched-clear-baseline" data-line="${escapeHtml(line.id)}">Clear (mark Unknown)</button>`
                  : ""
              }
            </details>
            <details>
              <summary>Allowance designation</summary>
              <button type="button" class="sched-toggle-allowance" data-line="${escapeHtml(line.id)}" data-is-allowance="${line.isAllowance ? "true" : "false"}">
                Mark as ${line.isAllowance ? "not an allowance" : "an allowance"}
              </button>
            </details>
            <details>
              <summary>Vendor</summary>
              <form data-action="SET_LINE_VENDOR">
                <input type="text" name="vendorRef" value="${escapeHtml(line.vendorRef ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Notes</summary>
              <form data-action="SET_LINE_NOTES">
                <input type="text" name="notes" value="${escapeHtml(line.notes ?? "")}" />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Remove line</summary>
              <button type="button" class="sched-deactivate" data-line="${escapeHtml(line.id)}">Remove (non-destructive)</button>
            </details>
          </div>
        </td>
      </tr>
    `;
  }

  function lineRowHtml(line: BudgetLineViewLike): string {
    return `
      <tr class="sched-row" data-line="${escapeHtml(line.id)}">
        <td>${escapeHtml(line.description)}${line.isAllowance ? ' <span class="ic-empty">(allowance)</span>' : ""}</td>
        <td>${escapeHtml(line.categoryName)}</td>
        <td>${moneyOrUnknown(line.baselineAmount)}</td>
        <td>${moneyOrUnknown(line.revisedAmount)}</td>
        <td>${formatMoneyMinor(line.committedTotal)}</td>
        <td>${formatMoneyMinor(line.actualTotal)}</td>
        <td>${moneyOrUnknown(line.remaining)}</td>
        <td>${dash(line.trade)}</td>
      </tr>
    `;
  }

  function renderLines(): string {
    const lines = workspace.lines.filter((l) => l.active);
    return `
      <h3>Budget lines</h3>
      <div class="sched-action-panel" id="budget-add-line-panel"></div>
      <details>
        <summary>+ Add budget line</summary>
        <form data-action="ADD_LINE" class="sched-add-activity-form">
          <select name="categoryId" required>${categoryOptions()}</select>
          <input type="text" name="description" placeholder="Description" required />
          <input type="number" name="amount" step="0.01" placeholder="Baseline amount (optional)" />
          <button type="submit">Add</button>
        </form>
      </details>
      <table class="sched-table">
        <thead>
          <tr><th>Description</th><th>Category</th><th>Baseline</th><th>Revised</th><th>Committed</th><th>Actual</th><th>Remaining</th><th>Trade</th></tr>
        </thead>
        <tbody>
          ${
            lines.length === 0
              ? `<tr><td colspan="8" class="ic-empty">No budget lines recorded yet.</td></tr>`
              : lines
                  .map(
                    (line) =>
                      lineRowHtml(line) +
                      (line.id === expandedLineId ? lineDetailHtml(line) : ""),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;
  }

  function wireLines(): void {
    const addPanel = body.querySelector<HTMLElement>("#budget-add-line-panel");
    const addForm = body.querySelector<HTMLFormElement>(
      'form[data-action="ADD_LINE"]',
    );
    addForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!addPanel || !workspace.currency) return;
      const data = new FormData(addForm);
      const baselineAmount =
        parseMoneyInput(data, "amount", "currency", workspace.currency) ??
        undefined;
      void runCommand(
        {
          kind: "ADD_LINE",
          categoryId: formString(data, "categoryId"),
          description: formString(data, "description"),
          ...(baselineAmount ? { baselineAmount } : {}),
        },
        addPanel,
      );
    });

    body
      .querySelectorAll<HTMLTableRowElement>("tr[data-line].sched-row")
      .forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.line ?? null;
          expandedLineId = expandedLineId === id ? null : id;
          render();
        });
      });

    const detailRow = body.querySelector<HTMLElement>(
      `.sched-detail-row[data-detail-for="${expandedLineId ?? ""}"]`,
    );
    const line = workspace.lines.find((l) => l.id === expandedLineId);
    if (detailRow && line && workspace.currency) {
      const currency = workspace.currency;
      const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
      if (!panel) return;
      detailRow
        .querySelector<HTMLButtonElement>(".sched-deactivate")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          void runCommand(
            { kind: "DEACTIVATE_LINE", budgetLineId: line.id },
            panel,
          );
        });
      detailRow
        .querySelector<HTMLButtonElement>(".sched-clear-baseline")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          void runCommand(
            {
              kind: "SET_LINE_BASELINE_AMOUNT",
              budgetLineId: line.id,
              baselineAmount: null,
            },
            panel,
          );
        });
      detailRow
        .querySelector<HTMLButtonElement>(".sched-toggle-allowance")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          void runCommand(
            {
              kind: "SET_LINE_IS_ALLOWANCE",
              budgetLineId: line.id,
              isAllowance: !line.isAllowance,
            },
            panel,
          );
        });
      detailRow.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
        form.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const data = new FormData(form);
          const action = form.dataset.action;
          if (action === "SET_LINE_DESCRIPTION") {
            void runCommand(
              {
                kind: "SET_LINE_DESCRIPTION",
                budgetLineId: line.id,
                description: formString(data, "description"),
              },
              panel,
            );
          } else if (action === "SET_LINE_CATEGORY") {
            void runCommand(
              {
                kind: "SET_LINE_CATEGORY",
                budgetLineId: line.id,
                categoryId: formString(data, "categoryId"),
              },
              panel,
            );
          } else if (action === "SET_LINE_COST_CODE") {
            void runCommand(
              {
                kind: "SET_LINE_COST_CODE",
                budgetLineId: line.id,
                costCode: formString(data, "costCode"),
              },
              panel,
            );
          } else if (action === "SET_LINE_TRADE") {
            void runCommand(
              {
                kind: "SET_LINE_TRADE",
                budgetLineId: line.id,
                trade: formString(data, "trade"),
              },
              panel,
            );
          } else if (action === "SET_LINE_BASELINE_AMOUNT") {
            const amount = parseMoneyInput(
              data,
              "amount",
              "currency",
              currency,
            );
            void runCommand(
              {
                kind: "SET_LINE_BASELINE_AMOUNT",
                budgetLineId: line.id,
                baselineAmount: amount,
              },
              panel,
            );
          } else if (action === "SET_LINE_VENDOR") {
            void runCommand(
              {
                kind: "SET_LINE_VENDOR",
                budgetLineId: line.id,
                vendorRef: formString(data, "vendorRef"),
              },
              panel,
            );
          } else if (action === "SET_LINE_NOTES") {
            void runCommand(
              {
                kind: "SET_LINE_NOTES",
                budgetLineId: line.id,
                notes: formString(data, "notes"),
              },
              panel,
            );
          }
        });
      });
    }
  }

  // ---------------------------------------------------------------------
  // Commitments
  // ---------------------------------------------------------------------

  function commitmentDetailHtml(commitment: CommitmentViewLike): string {
    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(commitment.id)}">
        <td colspan="6">
          <div class="sched-action-panel"></div>
          <div class="sched-detail-forms">
            <details>
              <summary>Amount</summary>
              <form data-action="SET_COMMITMENT_AMOUNT">
                <input type="number" name="amount" step="0.01" value="${String(commitment.amount.amountMinor / 100)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Allocate to a budget line</summary>
              <form data-action="ADD_ALLOCATION">
                <select name="budgetLineId">${categoryLineOptions()}</select>
                <input type="number" name="amount" step="0.01" placeholder="Allocation amount" required />
                <button type="submit">Add allocation</button>
              </form>
              ${
                commitment.allocations.length > 0
                  ? `<ul>${commitment.allocations
                      .map(
                        (a) =>
                          `<li>${escapeHtml(workspace.lines.find((l) => l.id === a.budgetLineId)?.description ?? a.budgetLineId)}: ${formatMoneyMinor(a.amount)}</li>`,
                      )
                      .join("")}</ul>`
                  : `<p class="ic-empty">Unallocated: ${formatMoneyMinor(commitment.unallocatedAmount)}</p>`
              }
            </details>
            <details>
              <summary>Vendor</summary>
              <form data-action="SET_COMMITMENT_VENDOR">
                <input type="text" name="vendorRef" value="${escapeHtml(commitment.vendorRef ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Reference</summary>
              <form data-action="SET_COMMITMENT_REFERENCE">
                <input type="text" name="reference" value="${escapeHtml(commitment.reference ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Notes</summary>
              <form data-action="SET_COMMITMENT_NOTES">
                <input type="text" name="notes" value="${escapeHtml(commitment.notes ?? "")}" />
                <button type="submit">Save</button>
              </form>
            </details>
            ${
              commitment.status === "ACTIVE"
                ? `<details><summary>Void commitment</summary><button type="button" class="sched-void-commitment" data-commitment="${escapeHtml(commitment.id)}">Void</button></details>`
                : ""
            }
          </div>
        </td>
      </tr>
    `;
  }

  function categoryLineOptions(): string {
    return workspace.lines
      .filter((l) => l.active)
      .map(
        (l) =>
          `<option value="${escapeHtml(l.id)}">${escapeHtml(l.description)}</option>`,
      )
      .join("");
  }

  function renderCommitments(): string {
    const commitments = workspace.commitments;
    return `
      <h3>Commitments</h3>
      <div class="sched-action-panel" id="budget-add-commitment-panel"></div>
      <details>
        <summary>+ Add commitment</summary>
        <form data-action="ADD_COMMITMENT" class="sched-add-activity-form">
          <input type="number" name="amount" step="0.01" placeholder="Total amount" required />
          <input type="text" name="vendorRef" placeholder="Vendor (optional)" />
          <input type="text" name="reference" placeholder="PO / reference (optional)" />
          <button type="submit">Add</button>
        </form>
      </details>
      <table class="sched-table">
        <thead><tr><th>Amount</th><th>Allocated</th><th>Unallocated</th><th>Vendor</th><th>Reference</th><th>Status</th></tr></thead>
        <tbody>
          ${
            commitments.length === 0
              ? `<tr><td colspan="6" class="ic-empty">No commitments recorded yet.</td></tr>`
              : commitments
                  .map(
                    (c) =>
                      `<tr class="sched-row" data-commitment="${escapeHtml(c.id)}">
                        <td>${formatMoneyMinor(c.amount)}</td>
                        <td>${formatMoneyMinor(c.allocatedTotal)}</td>
                        <td>${formatMoneyMinor(c.unallocatedAmount)}</td>
                        <td>${dash(c.vendorRef)}</td>
                        <td>${dash(c.reference)}</td>
                        <td>${c.status}</td>
                      </tr>` +
                      (c.id === expandedCommitmentId
                        ? commitmentDetailHtml(c)
                        : ""),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;
  }

  function wireCommitments(): void {
    const addPanel = body.querySelector<HTMLElement>(
      "#budget-add-commitment-panel",
    );
    const addForm = body.querySelector<HTMLFormElement>(
      'form[data-action="ADD_COMMITMENT"]',
    );
    addForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!addPanel || !workspace.currency) return;
      const data = new FormData(addForm);
      const amount = parseMoneyInput(
        data,
        "amount",
        "currency",
        workspace.currency,
      );
      if (!amount) return;
      const vendorRef = formString(data, "vendorRef").trim();
      const reference = formString(data, "reference").trim();
      void runCommand(
        {
          kind: "ADD_COMMITMENT",
          amount,
          ...(vendorRef ? { vendorRef } : {}),
          ...(reference ? { reference } : {}),
        },
        addPanel,
      );
    });

    body
      .querySelectorAll<HTMLTableRowElement>("tr[data-commitment].sched-row")
      .forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.commitment ?? null;
          expandedCommitmentId = expandedCommitmentId === id ? null : id;
          render();
        });
      });

    const detailRow = body.querySelector<HTMLElement>(
      `.sched-detail-row[data-detail-for="${expandedCommitmentId ?? ""}"]`,
    );
    const commitment = workspace.commitments.find(
      (c) => c.id === expandedCommitmentId,
    );
    if (detailRow && commitment && workspace.currency) {
      const currency = workspace.currency;
      const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
      if (!panel) return;
      detailRow
        .querySelector<HTMLButtonElement>(".sched-void-commitment")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          void runCommand(
            { kind: "VOID_COMMITMENT", commitmentId: commitment.id },
            panel,
          );
        });
      detailRow.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
        form.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const data = new FormData(form);
          const action = form.dataset.action;
          if (action === "SET_COMMITMENT_AMOUNT") {
            const amount = parseMoneyInput(
              data,
              "amount",
              "currency",
              currency,
            );
            if (!amount) return;
            void runCommand(
              {
                kind: "SET_COMMITMENT_AMOUNT",
                commitmentId: commitment.id,
                amount,
              },
              panel,
            );
          } else if (action === "SET_COMMITMENT_VENDOR") {
            void runCommand(
              {
                kind: "SET_COMMITMENT_VENDOR",
                commitmentId: commitment.id,
                vendorRef: formString(data, "vendorRef"),
              },
              panel,
            );
          } else if (action === "SET_COMMITMENT_REFERENCE") {
            void runCommand(
              {
                kind: "SET_COMMITMENT_REFERENCE",
                commitmentId: commitment.id,
                reference: formString(data, "reference"),
              },
              panel,
            );
          } else if (action === "SET_COMMITMENT_NOTES") {
            void runCommand(
              {
                kind: "SET_COMMITMENT_NOTES",
                commitmentId: commitment.id,
                notes: formString(data, "notes"),
              },
              panel,
            );
          } else if (action === "ADD_ALLOCATION") {
            const budgetLineId = formString(data, "budgetLineId");
            const amount = parseMoneyInput(
              data,
              "amount",
              "currency",
              currency,
            );
            if (!budgetLineId || !amount) return;
            const allocations = [
              ...commitment.allocations.filter(
                (a) => a.budgetLineId !== budgetLineId,
              ),
              { budgetLineId, amount },
            ];
            void runCommand(
              {
                kind: "SET_COMMITMENT_ALLOCATIONS",
                commitmentId: commitment.id,
                allocations,
              },
              panel,
            );
          }
        });
      });
    }
  }

  // ---------------------------------------------------------------------
  // Actual costs
  // ---------------------------------------------------------------------

  function actualCostDetailHtml(actualCost: ActualCostViewLike): string {
    return `
      <tr class="sched-detail-row" data-detail-for="${escapeHtml(actualCost.id)}">
        <td colspan="6">
          <div class="sched-action-panel"></div>
          <div class="sched-detail-forms">
            <details>
              <summary>Amount</summary>
              <form data-action="SET_ACTUAL_COST_AMOUNT">
                <input type="number" name="amount" step="0.01" value="${String(actualCost.amount.amountMinor / 100)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Date</summary>
              <form data-action="SET_ACTUAL_COST_DATE">
                <input type="date" name="date" value="${escapeHtml(actualCost.date)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Description</summary>
              <form data-action="SET_ACTUAL_COST_DESCRIPTION">
                <input type="text" name="description" value="${escapeHtml(actualCost.description)}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Budget line</summary>
              <form data-action="SET_ACTUAL_COST_BUDGET_LINE">
                <select name="budgetLineId">
                  <option value="">Unallocated</option>
                  ${workspace.lines
                    .filter((l) => l.active)
                    .map(
                      (l) =>
                        `<option value="${escapeHtml(l.id)}" ${l.id === actualCost.budgetLineId ? "selected" : ""}>${escapeHtml(l.description)}</option>`,
                    )
                    .join("")}
                </select>
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Reference</summary>
              <form data-action="SET_ACTUAL_COST_REFERENCE">
                <input type="text" name="reference" value="${escapeHtml(actualCost.reference ?? "")}" required />
                <button type="submit">Save</button>
              </form>
            </details>
            <details>
              <summary>Notes</summary>
              <form data-action="SET_ACTUAL_COST_NOTES">
                <input type="text" name="notes" value="${escapeHtml(actualCost.notes ?? "")}" />
                <button type="submit">Save</button>
              </form>
            </details>
            ${
              actualCost.status === "RECORDED"
                ? `<details><summary>Void actual cost</summary><button type="button" class="sched-void-actual-cost" data-actual-cost="${escapeHtml(actualCost.id)}">Void</button></details>`
                : ""
            }
          </div>
        </td>
      </tr>
    `;
  }

  function renderActualCosts(): string {
    const actualCosts = workspace.actualCosts;
    return `
      <h3>Actual costs</h3>
      <div class="sched-action-panel" id="budget-add-actual-cost-panel"></div>
      <details>
        <summary>+ Record actual cost</summary>
        <form data-action="ADD_ACTUAL_COST" class="sched-add-activity-form">
          <input type="number" name="amount" step="0.01" placeholder="Amount" required />
          <input type="date" name="date" required />
          <input type="text" name="description" placeholder="Description" required />
          <select name="budgetLineId">
            <option value="">Unallocated</option>
            ${categoryLineOptions()}
          </select>
          <button type="submit">Record</button>
        </form>
      </details>
      <table class="sched-table">
        <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Budget line</th><th>Reference</th><th>Status</th></tr></thead>
        <tbody>
          ${
            actualCosts.length === 0
              ? `<tr><td colspan="6" class="ic-empty">No actual costs recorded yet.</td></tr>`
              : actualCosts
                  .map(
                    (a) =>
                      `<tr class="sched-row" data-actual-cost="${escapeHtml(a.id)}">
                        <td>${escapeHtml(a.date)}</td>
                        <td>${escapeHtml(a.description)}</td>
                        <td>${formatMoneyMinor(a.amount)}</td>
                        <td>${dash(workspace.lines.find((l) => l.id === a.budgetLineId)?.description ?? null)}</td>
                        <td>${dash(a.reference)}</td>
                        <td>${a.status}</td>
                      </tr>` +
                      (a.id === expandedActualCostId
                        ? actualCostDetailHtml(a)
                        : ""),
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;
  }

  function wireActualCosts(): void {
    const addPanel = body.querySelector<HTMLElement>(
      "#budget-add-actual-cost-panel",
    );
    const addForm = body.querySelector<HTMLFormElement>(
      'form[data-action="ADD_ACTUAL_COST"]',
    );
    addForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!addPanel || !workspace.currency) return;
      const data = new FormData(addForm);
      const amount = parseMoneyInput(
        data,
        "amount",
        "currency",
        workspace.currency,
      );
      if (!amount) return;
      const budgetLineId = formString(data, "budgetLineId").trim();
      void runCommand(
        {
          kind: "ADD_ACTUAL_COST",
          amount,
          date: formString(data, "date"),
          description: formString(data, "description"),
          ...(budgetLineId ? { budgetLineId } : {}),
        },
        addPanel,
      );
    });

    body
      .querySelectorAll<HTMLTableRowElement>("tr[data-actual-cost].sched-row")
      .forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.actualCost ?? null;
          expandedActualCostId = expandedActualCostId === id ? null : id;
          render();
        });
      });

    const detailRow = body.querySelector<HTMLElement>(
      `.sched-detail-row[data-detail-for="${expandedActualCostId ?? ""}"]`,
    );
    const actualCost = workspace.actualCosts.find(
      (a) => a.id === expandedActualCostId,
    );
    if (detailRow && actualCost && workspace.currency) {
      const currency = workspace.currency;
      const panel = detailRow.querySelector<HTMLElement>(".sched-action-panel");
      if (!panel) return;
      detailRow
        .querySelector<HTMLButtonElement>(".sched-void-actual-cost")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          void runCommand(
            { kind: "VOID_ACTUAL_COST", actualCostId: actualCost.id },
            panel,
          );
        });
      detailRow.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
        form.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const data = new FormData(form);
          const action = form.dataset.action;
          if (action === "SET_ACTUAL_COST_AMOUNT") {
            const amount = parseMoneyInput(
              data,
              "amount",
              "currency",
              currency,
            );
            if (!amount) return;
            void runCommand(
              {
                kind: "SET_ACTUAL_COST_AMOUNT",
                actualCostId: actualCost.id,
                amount,
              },
              panel,
            );
          } else if (action === "SET_ACTUAL_COST_DATE") {
            void runCommand(
              {
                kind: "SET_ACTUAL_COST_DATE",
                actualCostId: actualCost.id,
                date: formString(data, "date"),
              },
              panel,
            );
          } else if (action === "SET_ACTUAL_COST_DESCRIPTION") {
            void runCommand(
              {
                kind: "SET_ACTUAL_COST_DESCRIPTION",
                actualCostId: actualCost.id,
                description: formString(data, "description"),
              },
              panel,
            );
          } else if (action === "SET_ACTUAL_COST_BUDGET_LINE") {
            const budgetLineId = formString(data, "budgetLineId").trim();
            void runCommand(
              {
                kind: "SET_ACTUAL_COST_BUDGET_LINE",
                actualCostId: actualCost.id,
                budgetLineId: budgetLineId || null,
              },
              panel,
            );
          } else if (action === "SET_ACTUAL_COST_REFERENCE") {
            void runCommand(
              {
                kind: "SET_ACTUAL_COST_REFERENCE",
                actualCostId: actualCost.id,
                reference: formString(data, "reference"),
              },
              panel,
            );
          } else if (action === "SET_ACTUAL_COST_NOTES") {
            void runCommand(
              {
                kind: "SET_ACTUAL_COST_NOTES",
                actualCostId: actualCost.id,
                notes: formString(data, "notes"),
              },
              panel,
            );
          }
        });
      });
    }
  }

  // ---------------------------------------------------------------------
  // Root render
  // ---------------------------------------------------------------------

  function render(): void {
    if (!workspace.initialized) {
      renderUninitialized();
      return;
    }
    body.innerHTML = `
      ${renderSummary()}
      ${renderCategories()}
      ${renderLines()}
      ${renderCommitments()}
      ${renderActualCosts()}
    `;
    wireSummary();
    wireCategories();
    wireLines();
    wireCommitments();
    wireActualCosts();
  }

  render();
}
