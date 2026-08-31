import { describe, expect, it } from "vitest";
import {
  checkCanonicalResumeOwnership,
  checkEvidenceApplyShadowExplicit,
  checkLiveSystemActivation,
  checkNoBrowserBusinessLogic,
  checkNoLegacyMutationRoute,
  checkNoLiveConnectorReferences,
  checkProductionConfig,
  checkStagingShadowCompliance,
} from "../src/gates";

const COMPLIANT_SAFETY = {
  mode: "shadow",
  stagingOnly: true,
  liveSystemsConnected: false,
  dashboardConnected: false,
  calendarConnected: false,
  productionDeployment: false,
};

describe("checkStagingShadowCompliance (reuses isSafetyCompliant)", () => {
  it("PASS: the canonical compliant safety object", () => {
    const result = checkStagingShadowCompliance(COMPLIANT_SAFETY);
    expect(result.pass).toBe(true);
    expect(result.id).toBe("staging-shadow-compliance");
  });

  it("FAIL: liveSystemsConnected true", () => {
    const result = checkStagingShadowCompliance({
      ...COMPLIANT_SAFETY,
      liveSystemsConnected: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not staging\/shadow compliant/);
  });
});

describe("checkLiveSystemActivation", () => {
  it("PASS: no live-system flags active", () => {
    const result = checkLiveSystemActivation({
      liveSystemsConnected: false,
      dashboardConnected: false,
      calendarConnected: false,
    });
    expect(result.pass).toBe(true);
  });

  it("FAIL: calendarConnected true, names the exact flag", () => {
    const result = checkLiveSystemActivation({
      liveSystemsConnected: false,
      dashboardConnected: false,
      calendarConnected: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("calendarConnected");
  });
});

describe("checkProductionConfig", () => {
  it("PASS: mode=shadow, productionDeployment=false", () => {
    const result = checkProductionConfig({
      mode: "shadow",
      productionDeployment: false,
    });
    expect(result.pass).toBe(true);
  });

  it("FAIL: mode is not shadow", () => {
    const result = checkProductionConfig({
      mode: "production",
      productionDeployment: false,
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("shadow");
  });

  it("FAIL: productionDeployment true", () => {
    const result = checkProductionConfig({
      mode: "shadow",
      productionDeployment: true,
    });
    expect(result.pass).toBe(false);
    expect(result.location).toBe("productionDeployment");
  });
});

describe("checkNoLegacyMutationRoute", () => {
  const ACCEPTED_MUTATION_ROUTES = [
    "/v1/intents",
    "/v1/workflows/:workflowId/resume",
    "/v1/admin/init-db",
    "/v1/projects/:projectId/seed",
  ];
  const CLEAN_ROUTES = [
    { method: "GET", path: "/admin/field" },
    { method: "GET", path: "/health" },
    { method: "POST", path: "/v1/intents" },
    { method: "POST", path: "/v1/workflows/:workflowId/resume" },
  ];

  it("PASS: every mutation route is in the accepted set", () => {
    const result = checkNoLegacyMutationRoute(
      CLEAN_ROUTES,
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(true);
  });

  it("FAIL: a mutation route outside the accepted set is introduced", () => {
    const result = checkNoLegacyMutationRoute(
      [
        ...CLEAN_ROUTES,
        { method: "POST", path: "/v1/projects/:id/secret-mutate" },
      ],
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("/v1/projects/:id/secret-mutate");
    expect(result.location).toBe("/v1/projects/:id/secret-mutate");
  });

  it("PASS: read-only routes outside the accepted mutation set are fine", () => {
    const result = checkNoLegacyMutationRoute(
      [...CLEAN_ROUTES, { method: "GET", path: "/v1/results/:resultId" }],
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(true);
  });
});

describe("checkEvidenceApplyShadowExplicit (unsafe implicit apply)", () => {
  const NO_SCRIPT = "";

  it("PASS: current explicit-only behavior (double-quoted HTML, no JS shortcuts)", () => {
    const html = `<select id="intent-kind"><option value="FORECAST_QUERY" selected>Forecast</option><option value="EVIDENCE_APPLY_SHADOW">Apply</option></select>`;
    const result = checkEvidenceApplyShadowExplicit(html, NO_SCRIPT);
    expect(result.pass).toBe(true);
  });

  it("FAIL: EVIDENCE_APPLY_SHADOW marked selected (double-quoted)", () => {
    const html = `<select id="intent-kind"><option value="EVIDENCE_APPLY_SHADOW" selected>Apply</option></select>`;
    const result = checkEvidenceApplyShadowExplicit(html, NO_SCRIPT);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/default-selected/);
  });

  it("FAIL: EVIDENCE_APPLY_SHADOW marked selected (single-quoted -- a real HTML string variant the old regex missed)", () => {
    const html = `<select id='intent-kind'><option value='EVIDENCE_APPLY_SHADOW' selected>Apply</option></select>`;
    const result = checkEvidenceApplyShadowExplicit(html, NO_SCRIPT);
    expect(result.pass).toBe(false);
  });

  it("FAIL: JS forces a control's value to EVIDENCE_APPLY_SHADOW as an initialization/default", () => {
    const html = `<select id="intent-kind"><option value="EVIDENCE_APPLY_SHADOW">Apply</option></select>`;
    const script = `els.intentKind.value = "EVIDENCE_APPLY_SHADOW";`;
    const result = checkEvidenceApplyShadowExplicit(html, script);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/value/i);
  });

  it("FAIL: a default/initial constant is declared as EVIDENCE_APPLY_SHADOW", () => {
    const html = `<select id="intent-kind"></select>`;
    const script = `const DEFAULT_INTENT_KIND = "EVIDENCE_APPLY_SHADOW";`;
    const result = checkEvidenceApplyShadowExplicit(html, script);
    expect(result.pass).toBe(false);
  });

  it("FAIL: a preview handler automatically invokes an apply action", () => {
    const html = `<select id="intent-kind"></select>`;
    const script = `
      function runPreviewAction(projectId) {
        submitPreview(projectId);
        runApplyAction(projectId);
      }
    `;
    const result = checkEvidenceApplyShadowExplicit(html, script);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/preview/i);
  });

  it("does not false-fail a user explicitly choosing Apply at runtime (reading .value, not assigning it)", () => {
    const html = `<select id="intent-kind"><option value="EVIDENCE_APPLY_SHADOW">Apply</option></select>`;
    const script = `
      function currentFields() {
        return { kind: els.intentKind.value, projectId: els.projectId.value };
      }
      function runEvidenceAction(projectId, index) {
        const kind = kindEl.value;
        if (kind === "EVIDENCE_APPLY_SHADOW") { /* user chose it */ }
      }
    `;
    const result = checkEvidenceApplyShadowExplicit(html, script);
    expect(result.pass).toBe(true);
  });
});

describe("checkCanonicalResumeOwnership (canonical Resume violation)", () => {
  it("PASS: a resume-related function only calls the canonical .../resume endpoint", () => {
    const source = `
      function resumeAction(projectId, kind) {
        void callApi(fetch, sessionStorage, adminKeyValue(), \`/v1/workflows/\${workflowId}/resume\`, { method: "POST" });
      }
    `;
    const result = checkCanonicalResumeOwnership(source);
    expect(result.pass).toBe(true);
  });

  it("FAIL: a resume-related function submits to /v1/intents instead", () => {
    const source = `
      function resumeAction(projectId, kind) {
        void callApi(fetch, sessionStorage, adminKeyValue(), "/v1/intents", { method: "POST", body: JSON.stringify(intent) });
      }
    `;
    const result = checkCanonicalResumeOwnership(source);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/\/v1\/intents/);
  });

  it("FAIL: no resume-related function found at all", () => {
    const result = checkCanonicalResumeOwnership("function runQuery() {}");
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no resume-related function/i);
  });
});

describe("checkNoBrowserBusinessLogic", () => {
  // A stronger, mechanically-derived denylist is exercised in
  // tools/release-gate/test/forbidden-symbols.test.ts; these keep the basic PASS/FAIL contract
  // covered here alongside the gate's other unit tests.
  const FORBIDDEN = [
    "analyzeRecovery",
    "forecastAfterEvent",
    "commitShadowTransition",
  ];

  it("PASS: client source contains no canonical server-only function call", () => {
    const source = `
      function runQuery(projectId, kind) {
        void callApi(fetch, sessionStorage, adminKeyValue(), "/v1/intents", { method: "POST" });
      }
    `;
    const result = checkNoBrowserBusinessLogic(source, FORBIDDEN);
    expect(result.pass).toBe(true);
  });

  it("FAIL: client source calls a canonical server-only forecasting function", () => {
    const source = `
      function computeForecastLocally(model) {
        return forecastAfterEvent(model, event);
      }
    `;
    const result = checkNoBrowserBusinessLogic(source, FORBIDDEN);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("forecastAfterEvent");
  });

  it("FAIL: client source calls the canonical shadow-commit mutation directly", () => {
    const source = `function applyLocally() { return commitShadowTransition(transition); }`;
    const result = checkNoBrowserBusinessLogic(source, FORBIDDEN);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("commitShadowTransition");
  });
});

describe("checkNoLiveConnectorReferences", () => {
  it("PASS: normal same-origin fetches to Howler's own API never trigger a violation", () => {
    const source = `
      function runQuery() {
        return fetch("/v1/intents", { method: "POST" });
      }
      function resume(id) {
        return fetch(\`/v1/workflows/\${id}/resume\`, { method: "POST" });
      }
    `;
    expect(checkNoLiveConnectorReferences(source).pass).toBe(true);
  });

  it("FAIL: a Google Calendar host reference", () => {
    const source = `fetch("https://www.googleapis.com/calendar/v3/events");`;
    const result = checkNoLiveConnectorReferences(source);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/calendar/i);
  });

  it("FAIL: a Google Drive host reference", () => {
    const source = `fetch("https://www.googleapis.com/drive/v3/files");`;
    const result = checkNoLiveConnectorReferences(source);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/drive/i);
  });

  it("FAIL: a live connector client class name reference even without a URL", () => {
    const source = `const client = new GoogleCalendarClient(credentials);`;
    const result = checkNoLiveConnectorReferences(source);
    expect(result.pass).toBe(false);
  });

  it("FAIL: an OAuth account host reference", () => {
    const source = `window.location = "https://accounts.google.com/o/oauth2/auth";`;
    const result = checkNoLiveConnectorReferences(source);
    expect(result.pass).toBe(false);
  });
});
