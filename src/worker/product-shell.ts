const TRACKED_PROJECTS_KEY = "howler_field_tracked_projects";
const PRODUCT_SESSION_SENTINEL = "product-session";
const PORTFOLIO_SYNC_INTERVAL_MS = 15_000;

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function replaceAdminKeyPrompt(html: string): string {
  const sectionPattern =
    /<section class="ph-connect card"[\s\S]*?<input id="admin-key"[\s\S]*?<\/section>/;
  const hiddenInput = `<input id="admin-key" type="hidden" value="${PRODUCT_SESSION_SENTINEL}">`;
  return sectionPattern.test(html)
    ? html.replace(sectionPattern, hiddenInput)
    : html.replace(/<input id="admin-key"[^>]*>/, hiddenInput);
}

function productBootstrap(projectIds: string[]): string {
  const initialProjectIds = safeJson(projectIds);
  return `<script>
(() => {
  const trackedProjectsKey = ${JSON.stringify(TRACKED_PROJECTS_KEY)};
  const initialProjectIds = ${initialProjectIds};
  sessionStorage.setItem(trackedProjectsKey, JSON.stringify(initialProjectIds));

  const adminKey = document.getElementById("admin-key");
  if (adminKey) {
    adminKey.value = ${JSON.stringify(PRODUCT_SESSION_SENTINEL)};
    if (typeof adminKey.dispatchEvent === "function") {
      const changeEvent = typeof Event === "function" ? new Event("change") : { type: "change" };
      adminKey.dispatchEvent(changeEvent);
    }
  }

  async function syncPortfolio() {
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
      if (!response.ok) return;
      const body = await response.json();
      if (!body || !Array.isArray(body.projects)) return;
      const nextProjectIds = body.projects
        .map((project) => project && project.projectId)
        .filter((projectId) => typeof projectId === "string");
      const current = sessionStorage.getItem(trackedProjectsKey);
      const next = JSON.stringify(nextProjectIds);
      if (current !== next) {
        sessionStorage.setItem(trackedProjectsKey, next);
        location.reload();
      }
    } catch {
      // Keep the last known product view if a background sync is temporarily unavailable.
    }
  }

  if (typeof setInterval === "function") {
    setInterval(() => void syncPortfolio(), ${String(PORTFOLIO_SYNC_INTERVAL_MS)});
  }
  if (window && typeof window.addEventListener === "function") {
    window.addEventListener("focus", () => void syncPortfolio());
  }
})();
</script>`;
}

export function decorateProductDashboard(
  legacyHtml: string,
  projectIds: string[],
): string {
  const withoutPrompt = replaceAdminKeyPrompt(legacyHtml);
  const bootstrap = productBootstrap(projectIds);
  return withoutPrompt.includes("</body>")
    ? withoutPrompt.replace("</body>", `${bootstrap}\n</body>`)
    : `${withoutPrompt}${bootstrap}`;
}
