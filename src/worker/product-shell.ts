const TRACKED_PROJECTS_KEY = "howler_field_tracked_projects";
const PRODUCT_SESSION_SENTINEL = "product-session";
const PORTFOLIO_SYNC_INTERVAL_MS = 15_000;

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function replaceAdminKeyPrompt(html: string): string {
  const sectionPattern =
    /<section class="ph-connect card"[\s\S]*?<input id="admin-key"[\s\S]*?<\/section>/;
  const productStatus = `<div id="howler-live-status" role="status" aria-live="polite">Stale · Last synced never</div>`;
  const hiddenInput = `<input id="admin-key" type="hidden" value="${PRODUCT_SESSION_SENTINEL}">${productStatus}`;
  return sectionPattern.test(html)
    ? html.replace(sectionPattern, hiddenInput)
    : html.replace(/<input id="admin-key"[^>]*>/, hiddenInput);
}

/**
 * The legacy field dashboard already owns the single summaryByProject map plus the Penthouse and
 * Index Card renderers. The authenticated product shell injects this tiny adapter into that same
 * runtime closure rather than duplicating presentation logic. It accepts the aggregate canonical
 * ProjectSummaryV096 payload, mirrors membership to sessionStorage only for compatibility with
 * the legacy diagnostics drawer, and re-renders in place without any additional network reads.
 */
function installPortfolioApplyHook(html: string): string {
  const marker = "  function renderProjects() {";
  if (!html.includes(marker)) return html;
  const hook = `  globalThis.__howlerApplyPortfolio = (projects) => {
    if (!Array.isArray(projects)) return;
    const summaries = projects.filter((project) => looksLikeProjectSummary(project));
    const nextProjectIds = summaries.map((summary) => summary.projectId);
    const membershipChanged = JSON.stringify(nextProjectIds) !== JSON.stringify(trackedProjects);
    trackedProjects = nextProjectIds;
    saveTrackedProjects(sessionStorage, trackedProjects);
    summaryByProject.clear();
    for (const summary of summaries) {
      summaryByProject.set(summary.projectId, summary);
    }
    if (selectedProjectId && !trackedProjects.includes(selectedProjectId)) {
      selectedProjectId = null;
    }
    if (membershipChanged) {
      renderProjects();
    } else {
      renderPortfolioOverview();
      renderIndexCard();
    }
  };

`;
  return html.replace(marker, `${hook}${marker}`);
}

function productBootstrapBody(projectIds: string[]): string {
  const initialProjectIds = safeJson(projectIds);
  return `
(() => {
  const trackedProjectsKey = ${JSON.stringify(TRACKED_PROJECTS_KEY)};
  const initialProjectIds = ${initialProjectIds};
  sessionStorage.setItem(trackedProjectsKey, JSON.stringify(initialProjectIds));

  const adminKey = document.getElementById("admin-key");
  if (adminKey) {
    adminKey.value = ${JSON.stringify(PRODUCT_SESSION_SENTINEL)};
  }

  let syncInFlight = false;
  let lastSuccessfulSync = null;

  function setSyncStatus(state) {
    let status = null;
    try {
      status = document.getElementById("howler-live-status");
    } catch {
      return;
    }
    if (!status) return;
    const when = lastSuccessfulSync || "never";
    status.textContent = state + " · Last synced " + when;
  }

  async function syncPortfolio() {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      const response = await fetch("/v1/portfolio", {
        headers: { accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) {
        location.reload();
        return;
      }
      if (!response.ok) {
        setSyncStatus("Stale");
        return;
      }
      const body = await response.json();
      if (!body || !Array.isArray(body.projects)) {
        setSyncStatus("Stale");
        return;
      }
      const applyPortfolio = globalThis.__howlerApplyPortfolio;
      if (typeof applyPortfolio !== "function") {
        setSyncStatus("Stale");
        return;
      }
      applyPortfolio(body.projects);
      lastSuccessfulSync =
        typeof body.generatedAt === "string" ? body.generatedAt : new Date().toISOString();
      setSyncStatus("Live");
    } catch {
      // Preserve the last successfully-rendered canonical summaries and mark them stale until the
      // next automatic retry succeeds.
      setSyncStatus("Stale");
    } finally {
      syncInFlight = false;
    }
  }

  void syncPortfolio();
  if (typeof setInterval === "function") {
    setInterval(() => void syncPortfolio(), ${String(PORTFOLIO_SYNC_INTERVAL_MS)});
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", () => void syncPortfolio());
  }
  if (typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void syncPortfolio();
    });
  }
})();`;
}

function appendBootstrapToLastScript(
  html: string,
  bootstrapBody: string,
): string {
  const lastScriptClose = html.lastIndexOf("</script>");
  if (lastScriptClose === -1) {
    const standalone = `<script>${bootstrapBody}\n</script>`;
    return html.includes("</body>")
      ? html.replace("</body>", `${standalone}\n</body>`)
      : `${html}${standalone}`;
  }
  return `${html.slice(0, lastScriptClose)}${bootstrapBody}\n${html.slice(
    lastScriptClose,
  )}`;
}

export function decorateProductDashboard(
  legacyHtml: string,
  projectIds: string[],
): string {
  const withoutPrompt = replaceAdminKeyPrompt(legacyHtml);
  const withPortfolioHook = installPortfolioApplyHook(withoutPrompt);
  return appendBootstrapToLastScript(
    withPortfolioHook,
    productBootstrapBody(projectIds),
  );
}
