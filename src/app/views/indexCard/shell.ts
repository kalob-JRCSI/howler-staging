// Phase 1 recovery: the Index Card shell -- the dedicated project workspace real navigation now
// leads to (Failure 1's fix). Owns the project identity header and the required module
// navigation; each module renders into its own body region. Categories per the frozen product
// contract: Overview, Schedule, Scope, Plans, Photos, Budget, Documents, Change Orders,
// Selections, Trades/Vendors/Contacts, Materials/Procurement, Inspections/Permits,
// Activity/History. Only Overview and Activity are implemented this phase -- every other category
// renders the same honest "not built yet" placeholder (see placeholder.ts), never fake data.

import { fetchProjectSummary, logout, UnauthorizedError } from "../../api";
import { escapeHtml, formatDate } from "../../format";
import type { Router } from "../../router";
import type { ProjectSummaryLike } from "../../types";
import { renderOverview } from "./overview";
import { renderActivity } from "./activity";
import { renderPlaceholder } from "./placeholder";

type ModuleRenderer = (
  body: HTMLElement,
  projectId: string,
  summary: ProjectSummaryLike,
) => void | Promise<void>;

interface ModuleDefinition {
  id: string;
  label: string;
  render: ModuleRenderer;
}

export const INDEX_CARD_MODULES: ModuleDefinition[] = [
  { id: "overview", label: "Overview", render: renderOverview },
  { id: "schedule", label: "Schedule", render: renderPlaceholder },
  { id: "scope", label: "Scope", render: renderPlaceholder },
  { id: "plans", label: "Plans", render: renderPlaceholder },
  { id: "photos", label: "Photos", render: renderPlaceholder },
  { id: "budget", label: "Budget", render: renderPlaceholder },
  { id: "documents", label: "Documents", render: renderPlaceholder },
  { id: "change-orders", label: "Change Orders", render: renderPlaceholder },
  { id: "selections", label: "Selections", render: renderPlaceholder },
  {
    id: "trades",
    label: "Trades / Vendors / Contacts",
    render: renderPlaceholder,
  },
  {
    id: "materials",
    label: "Materials / Procurement",
    render: renderPlaceholder,
  },
  {
    id: "inspections",
    label: "Inspections / Permits",
    render: renderPlaceholder,
  },
  { id: "activity", label: "Activity / History", render: renderActivity },
];

const DEFAULT_MODULE_ID = "overview";

export async function renderIndexCard(
  root: HTMLElement,
  router: Router,
  projectId: string,
  moduleId: string,
): Promise<void> {
  root.innerHTML = `
    <header class="app-header">
      <a href="/" class="app-back-link">&larr; Portfolio</a>
      <button id="logout-button" type="button">Log out</button>
    </header>
    <div id="ic-shell"><p>Loading project&hellip;</p></div>
  `;
  wireLogout(root);
  wireInternalLinks(root, router);

  const shell = root.querySelector<HTMLElement>("#ic-shell");
  if (!shell) return;

  try {
    const summary = await fetchProjectSummary(projectId);
    const activeModule =
      INDEX_CARD_MODULES.find((candidate) => candidate.id === moduleId) ??
      INDEX_CARD_MODULES.find(
        (candidate) => candidate.id === DEFAULT_MODULE_ID,
      );
    if (!activeModule) return;

    shell.innerHTML = `
      <div class="ic-header">
        <h1>${escapeHtml(summary.projectName || summary.projectId)}</h1>
        <div class="ic-header-metrics">
          <span>Integrity ${String(summary.integrity.score)}/100 &mdash; ${escapeHtml(summary.integrity.condition)}</span>
          <span>Progress ${String(summary.progressPercent)}%</span>
          <span>Next: ${escapeHtml(summary.nextMovement)}</span>
          <span>Forecast completion: ${escapeHtml(formatDate(summary.projectedCompletion))}</span>
        </div>
      </div>
      <nav class="ic-module-nav">
        ${INDEX_CARD_MODULES.map(
          (module) =>
            `<a href="/projects/${encodeURIComponent(projectId)}/${module.id}" class="ic-module-link${module.id === activeModule.id ? " active" : ""}">${escapeHtml(module.label)}</a>`,
        ).join("")}
      </nav>
      <div id="ic-module-body" class="ic-module-body"></div>
    `;

    const body = shell.querySelector<HTMLElement>("#ic-module-body");
    if (body) await activeModule.render(body, projectId, summary);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    shell.innerHTML = `<p class="ic-empty">Could not load this project. <a href="/" class="app-back-link">Return to portfolio</a>.</p>`;
  }
}

function wireLogout(root: HTMLElement): void {
  root
    .querySelector<HTMLButtonElement>("#logout-button")
    ?.addEventListener("click", () => {
      void logout().then(() => {
        window.location.assign("/");
      });
    });
}

/** Intercepts same-origin, unmodified left-clicks on internal `<a>` links (module nav, the back
 * link) so they become real Router.navigate calls rather than full page reloads -- keeping the
 * app-shell mounted, exactly like a normal SPA. External links (e.g. the diagnostics link's
 * target="_blank") are left completely alone. */
function wireInternalLinks(container: HTMLElement, router: Router): void {
  container.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const anchor = (event.target as Element | null)?.closest("a");
    if (!anchor || anchor.target === "_blank") return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    event.preventDefault();
    router.navigate(href);
  });
}
