import { describe, expect, it } from "vitest";
import { decorateProductDashboard } from "../../src/worker/product-shell";

const LEGACY_HTML = `<!doctype html>
<html>
<body>
  <section class="ph-connect card" aria-labelledby="ph-connect-heading">
    <label id="ph-connect-heading" for="admin-key">HOWLER_ADMIN_KEY</label>
    <input id="admin-key" type="password" placeholder="Paste the staging admin key to load the portfolio">
  </section>
  <div id="projects-container"></div>
  <script>window.__legacyFieldDashboard = true;</script>
</body>
</html>`;

const PROJECT_IDS = [
  "portfolio-01",
  "portfolio-02",
  "portfolio-03",
  "portfolio-04",
  "portfolio-05",
  "portfolio-06",
  "portfolio-07",
  "portfolio-08",
  "portfolio-09",
  "portfolio-10",
  "portfolio-11",
  "portfolio-12",
];

describe("authenticated product dashboard decoration", () => {
  it("hydrates the legacy dashboard from the canonical server roster instead of a seven-project constant", () => {
    const html = decorateProductDashboard(LEGACY_HTML, PROJECT_IDS);

    expect(html).toContain(JSON.stringify(PROJECT_IDS));
    expect(html).toContain("howler_field_tracked_projects");
    expect(html).toContain("portfolio-12");
    expect(html).not.toContain("deboard-v091");
  });

  it("removes the visible admin-key prompt without embedding the real admin secret", () => {
    const html = decorateProductDashboard(LEGACY_HTML, PROJECT_IDS);

    expect(html).not.toContain(
      "Paste the staging admin key to load the portfolio",
    );
    expect(html).not.toContain("HOWLER_ADMIN_KEY</label>");
    expect(html).toContain('id="admin-key"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value="product-session"');
  });

  it("starts one aggregate portfolio sync immediately, repeats every 15 seconds, and refreshes on focus/visibility return", () => {
    const html = decorateProductDashboard(LEGACY_HTML, PROJECT_IDS);

    expect(html).toContain("/v1/portfolio");
    expect(html).toContain("15000");
    expect(html).toContain("void syncPortfolio()");
    expect(html).toContain('addEventListener("focus"');
    expect(html).toContain('addEventListener("visibilitychange"');
    expect(html).toContain('document.visibilityState === "visible"');
  });

  it("feeds aggregate summaries into the field-dashboard renderer instead of triggering N per-project summary loads", () => {
    const html = decorateProductDashboard(LEGACY_HTML, PROJECT_IDS);

    expect(html).toContain("__howlerApplyPortfolio");
    expect(html).not.toContain('new Event("change")');
    expect(html).not.toContain("if (current !== next)");
  });

  it("prevents overlapping syncs and surfaces live/stale last-sync state while retaining the last good view", () => {
    const html = decorateProductDashboard(LEGACY_HTML, PROJECT_IDS);

    expect(html).toContain("syncInFlight");
    expect(html).toContain('id="howler-live-status"');
    expect(html).toContain("Last synced");
    expect(html).toContain("Live");
    expect(html).toContain("Stale");
  });

  it("returns to the login boundary when the product session expires", () => {
    const html = decorateProductDashboard(LEGACY_HTML, PROJECT_IDS);

    expect(html).toContain("response.status === 401");
    expect(html).toContain("location.reload()");
  });
});
