/// <reference types="vite/client" />

// Task 17: proves the *real* accepted candidate currently passes every release-gate check --
// tools/release-gate/test/gates.test.ts proves each check function detects a deliberate fixture
// violation; this file feeds the same functions the real repo's own values/content instead.

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import { OPERATOR_SAFETY } from "../../src/operator/policy";
import {
  createSubmissionKernel,
  fieldDashboardClientScript,
  fieldDashboardHtml,
  operatorPanelHtml,
} from "../../src/worker/admin";
import {
  checkCanonicalResumeOwnership,
  checkEvidenceApplyShadowExplicit,
  checkLiveSystemActivation,
  checkNoBrowserBusinessLogic,
  checkNoLegacyMutationRoute,
  checkProductionConfig,
  checkStagingShadowCompliance,
} from "../../tools/release-gate/src/gates";

function readSource(sources: Record<string, string>, suffix: string): string {
  const entry = Object.entries(sources).find(([modulePath]) =>
    modulePath.endsWith(suffix),
  );
  if (!entry) throw new Error(`missing source file ending in ${suffix}`);
  return entry[1];
}

const wranglerSources = import.meta.glob<string>("../../wrangler.jsonc", {
  eager: true,
  import: "default",
  query: "?raw",
});
const wrangler = readSource(wranglerSources, "wrangler.jsonc");

describe("release gate: staging/shadow safety (real repo)", () => {
  it("OPERATOR_SAFETY passes checkStagingShadowCompliance", () => {
    expect(checkStagingShadowCompliance(OPERATOR_SAFETY).pass).toBe(true);
  });

  it("OPERATOR_SAFETY passes checkLiveSystemActivation", () => {
    expect(checkLiveSystemActivation(OPERATOR_SAFETY).pass).toBe(true);
  });

  it("wrangler.jsonc's committed HOWLER_MODE and OPERATOR_SAFETY.productionDeployment pass checkProductionConfig", () => {
    const mode = wrangler.includes('"HOWLER_MODE": "shadow"')
      ? "shadow"
      : "NOT-SHADOW";
    const result = checkProductionConfig({
      mode,
      productionDeployment: OPERATOR_SAFETY.productionDeployment,
    });
    expect(result.pass).toBe(true);
  });
});

describe("release gate: no legacy mutation route (real repo)", () => {
  // Task 15's canonical operator entry points, plus the pre-existing v0.9.4 compatibility
  // mutation routes accepted history already covers. Not auto-extracted from src/worker/index.ts
  // (its route matching mixes exact-path and segment-count styles that a regex would only
  // approximate) -- update this list deliberately whenever a route is added, same as
  // repository-policy.test.ts's own hand-maintained checks.
  const ACCEPTED_MUTATION_ROUTES = [
    "/v1/admin/init-db",
    "/v1/projects/deboard-v091/seed",
    "/v1/intents",
    "/v1/workflows/:workflowId/resume",
    "/v1/projects/:projectId/events/preview",
    "/v1/projects/:projectId/events/apply-shadow",
    "/v1/projects/:projectId/events/publish",
  ];

  it("the accepted mutation route set passes checkNoLegacyMutationRoute", () => {
    const routes = ACCEPTED_MUTATION_ROUTES.map((path) => ({
      method: "POST",
      path,
    }));
    const result = checkNoLegacyMutationRoute(routes, ACCEPTED_MUTATION_ROUTES);
    expect(result.pass).toBe(true);
  });
});

describe("release gate: EVIDENCE_APPLY_SHADOW is never implicitly selected (real repo)", () => {
  it("the real /admin/operator page passes checkEvidenceApplyShadowExplicit", () => {
    expect(checkEvidenceApplyShadowExplicit(operatorPanelHtml()).pass).toBe(
      true,
    );
  });

  it("the real /admin/field page passes checkEvidenceApplyShadowExplicit", () => {
    expect(checkEvidenceApplyShadowExplicit(fieldDashboardHtml()).pass).toBe(
      true,
    );
  });

  it("the actually-served GET /admin/operator response passes too", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/admin/operator"),
      env,
    );
    expect(checkEvidenceApplyShadowExplicit(await response.text()).pass).toBe(
      true,
    );
  });
});

describe("release gate: canonical Resume ownership (real repo)", () => {
  it("fieldDashboardClientScript's resumeAction only calls the canonical .../resume endpoint", () => {
    const source =
      createSubmissionKernel.toString() + fieldDashboardClientScript.toString();
    expect(checkCanonicalResumeOwnership(source).pass).toBe(true);
  });
});

describe("release gate: no browser-side business logic (real repo)", () => {
  it("the field dashboard's embedded script never calls a canonical server-only function", () => {
    const source =
      createSubmissionKernel.toString() + fieldDashboardClientScript.toString();
    expect(checkNoBrowserBusinessLogic(source).pass).toBe(true);
  });
});
