// Phase 1 recovery: the Index Card's Overview module -- the PM's morning briefing for this one
// project. Reads the existing GET .../summary (already fetched by shell.ts) and GET .../forecast
// (this module's own call) -- no new backend routes. Priority actions and top risks are read
// directly from the solver's real output (ForecastSnapshotLike.pmActions /
// .recoveryAnalysis.protectionActions), never invented text.

import { fetchProjectForecast, UnauthorizedError } from "../../api";
import { escapeHtml, formatDate, formatMoney } from "../../format";
import type { ProjectSummaryLike } from "../../types";

function budgetLineHtml(budget: ProjectSummaryLike["budget"]): string {
  if (budget.baseline === null) return "Budget not recorded";
  const baselineStr = formatMoney(budget.baseline);
  if (budget.spent === null)
    return `Baseline ${baselineStr} &mdash; spend not recorded`;
  const spentStr = formatMoney(budget.spent);
  if (budget.remaining === null) return `${spentStr} spent`;
  return `${spentStr} spent / ${formatMoney(budget.remaining)} remaining`;
}

export async function renderOverview(
  body: HTMLElement,
  projectId: string,
  summary: ProjectSummaryLike,
): Promise<void> {
  body.innerHTML = `<p>Loading forecast&hellip;</p>`;

  let priorityActionsHtml = `<p class="ic-empty">No priority actions identified.</p>`;
  let risksHtml = "";

  try {
    const { latest } = await fetchProjectForecast(projectId);
    if (latest && latest.pmActions.length > 0) {
      priorityActionsHtml = `<ul>${latest.pmActions
        .map(
          (action) =>
            `<li><strong>${escapeHtml(action.priority)}</strong> &mdash; ${escapeHtml(action.action)} (required by ${escapeHtml(formatDate(action.requiredBy))})</li>`,
        )
        .join("")}</ul>`;
    }
    const protectionActions = latest?.recoveryAnalysis.protectionActions ?? [];
    // Phase 3 (Functional Project Scope Workspace): a BLOCKED scope item is a real risk signal,
    // not schedule-derived -- surfaced here alongside forecast-derived risks, never blended into
    // one invented combined score.
    const riskItems = [
      ...protectionActions.map((a) => a.action),
      ...summary.blockedScopeItems.map(
        (description) => `Scope blocked: "${description}".`,
      ),
    ];
    if (riskItems.length > 0) {
      risksHtml = `<ul>${riskItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    // The forecast is supplementary to this briefing -- the summary-derived sections below still
    // render honestly even if this particular read fails.
  }

  body.innerHTML = `
    <section class="ic-overview-section">
      <h3>Priority actions</h3>
      ${priorityActionsHtml}
    </section>
    <section class="ic-overview-section">
      <h3>Top risks</h3>
      ${risksHtml}
      <p class="ic-exposure">${escapeHtml(summary.primaryExposure)}</p>
    </section>
    <section class="ic-overview-section">
      <h3>Budget</h3>
      <p>${budgetLineHtml(summary.budget)}</p>
    </section>
    <section class="ic-overview-section">
      <h3>Baseline scope</h3>
      ${
        summary.scope.length
          ? `<ul>${summary.scope.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ul>`
          : `<p class="ic-empty">No baseline scope recorded.</p>`
      }
      ${
        summary.scopeAddedAfterBaselineCount > 0
          ? `<p class="ic-exposure">${String(summary.scopeAddedAfterBaselineCount)} scope item${summary.scopeAddedAfterBaselineCount === 1 ? "" : "s"} added after baseline.</p>`
          : ""
      }
    </section>
  `;
}
