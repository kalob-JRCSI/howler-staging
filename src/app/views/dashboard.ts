// Phase 1 recovery: the Portfolio Dashboard. Reads the existing GET /v1/portfolio aggregate (no
// new backend route) and renders real project cards -- clicking one is a real navigation to that
// project's Index Card (Router.navigate), never a same-page section swap.

import { fetchPortfolio, logout, UnauthorizedError } from "../api";
import { escapeHtml } from "../format";
import type { Router } from "../router";
import type { ProjectSummaryLike } from "../types";

function projectCardHtml(project: ProjectSummaryLike): string {
  return `<button type="button" class="dashboard-card" data-project-id="${escapeHtml(project.projectId)}">
    <span class="dashboard-card-name">${escapeHtml(project.projectName || project.projectId)}</span>
    <span class="dashboard-card-row"><span class="dashboard-card-label">Integrity</span><span>${String(project.integrity.score)} / 100 &mdash; ${escapeHtml(project.integrity.condition)}</span></span>
    <span class="dashboard-card-row"><span class="dashboard-card-label">Progress</span><span>${String(project.progressPercent)}%</span></span>
    <span class="dashboard-card-row"><span class="dashboard-card-label">Next</span><span>${escapeHtml(project.nextMovement)}</span></span>
    <span class="dashboard-card-row"><span class="dashboard-card-label">Exposure</span><span>${escapeHtml(project.primaryExposure)}</span></span>
  </button>`;
}

export async function renderDashboard(
  root: HTMLElement,
  router: Router,
): Promise<void> {
  root.innerHTML = `
    <header class="app-header">
      <h1>Howler</h1>
      <nav class="app-header-nav">
        <a href="/admin/diagnostics" target="_blank" rel="noopener">Admin &amp; diagnostics</a>
        <button id="logout-button" type="button">Log out</button>
      </nav>
    </header>
    <main>
      <h2>Portfolio</h2>
      <p id="dashboard-status">Loading portfolio&hellip;</p>
      <div id="dashboard-grid" class="dashboard-grid"></div>
    </main>
  `;
  wireLogout(root);

  const status = root.querySelector<HTMLElement>("#dashboard-status");
  const grid = root.querySelector<HTMLElement>("#dashboard-grid");
  if (!grid) return;

  try {
    const { projects } = await fetchPortfolio();
    if (projects.length === 0) {
      if (status) status.textContent = "No tracked projects yet.";
      return;
    }
    status?.remove();
    grid.innerHTML = projects
      .map((project) => projectCardHtml(project))
      .join("");
    grid
      .querySelectorAll<HTMLButtonElement>("[data-project-id]")
      .forEach((card) => {
        card.addEventListener("click", () => {
          const projectId = card.dataset.projectId;
          if (projectId)
            router.navigate(`/projects/${encodeURIComponent(projectId)}`);
        });
      });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    if (status)
      status.textContent = "Could not load the portfolio. Try reloading.";
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
