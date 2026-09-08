// Phase 1 recovery: application entry point. Bundled by esbuild to public/app.js and loaded from
// src/worker/app-shell.ts's minimal HTML shell -- only ever served to an authenticated product
// session (see src/worker/entry.ts). This file owns nothing but wiring the router to the two real
// top-level views.

import { Router } from "./router";
import { renderDashboard } from "./views/dashboard";
import { renderIndexCard } from "./views/indexCard/shell";

function boot(): void {
  const root = document.getElementById("app-root");
  if (!root) return;

  const router = new Router(root);
  router.add("/", (_params, container) => renderDashboard(container, router));
  router.add("/projects/:id", (params, container) =>
    renderIndexCard(container, router, params.id ?? "", "overview"),
  );
  router.add("/projects/:id/:moduleId", (params, container) =>
    renderIndexCard(
      container,
      router,
      params.id ?? "",
      params.moduleId ?? "overview",
    ),
  );

  void router.render();
}

document.addEventListener("DOMContentLoaded", boot);
