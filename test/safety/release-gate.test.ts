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
  operatorPanelClientScript,
  operatorPanelHtml,
} from "../../src/worker/admin";
import {
  checkCanonicalResumeOwnership,
  checkEvidenceApplyShadowExplicit,
  checkLiveSystemActivation,
  checkNoBrowserBusinessLogic,
  checkNoLegacyMutationRoute,
  checkNoLiveConnectorReferences,
  checkProductionConfig,
  checkStagingShadowCompliance,
} from "../../tools/release-gate/src/gates";
import { extractMutationRoutes } from "../../tools/release-gate/src/extract-routes";
import {
  extractExportedValueNames,
  KNOWN_HARMLESS_NAME_COLLISIONS,
} from "../../tools/release-gate/src/forbidden-symbols";
import { scanSourcesForLiveConnectorReferences } from "../../tools/release-gate/src/scan-sources";

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

const voiceTransportSources = import.meta.glob<string>(
  "../../src/worker/voice-transport.ts",
  { eager: true, import: "default", query: "?raw" },
);
const voiceTransportSource = readSource(
  voiceTransportSources,
  "src/worker/voice-transport.ts",
);

// The sandboxed Workers test runtime has no Node `fs` (nodejs_compat is deliberately not
// enabled), so real source text is read the same way repository-policy.test.ts reads ci.yml --
// via Vite's `?raw` glob import at build time, not readFileSync.
const workerIndexSources = import.meta.glob<string>(
  "../../src/worker/index.ts",
  { eager: true, import: "default", query: "?raw" },
);
const workerIndexSource = readSource(workerIndexSources, "src/worker/index.ts");

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
  // Task 15's three literal canonical entry points, plus the five segment-index-guarded v0.9.4
  // compatibility mutation routes accepted history already covers (resume, understanding/preview,
  // events/preview, events/apply-shadow, events/publish) -- rendered the same way
  // extractMutationRoutes canonicalizes a segment-index guard. This list is still hand-maintained
  // (update it deliberately when a route is added), but unlike before, what it's compared AGAINST
  // is now the actual route guards extracted from src/worker/index.ts's own source, not a second
  // copy of this same list standing in for "reality".
  const ACCEPTED_MUTATION_ROUTES = [
    "/v1/admin/init-db",
    "/v1/projects/deboard-v091/seed",
    "/v1/intents",
    "SEGMENTS(len=4){1=workflows,3=resume}",
    "SEGMENTS(len=5){3=understanding,4=preview}",
    "SEGMENTS(len=5){3=events,4=preview}",
    "SEGMENTS(len=5){3=events,4=apply-shadow}",
    "SEGMENTS(len=5){3=events,4=publish}",
  ];

  it("extracts exactly the accepted mutation route set from the real source, nothing more, nothing less", () => {
    const observed = extractMutationRoutes(workerIndexSource);
    const observedPaths = observed.map((r) => `${r.method} ${r.path}`).sort();
    const acceptedPaths = ACCEPTED_MUTATION_ROUTES.map(
      (p) => `POST ${p}`,
    ).sort();
    expect(observedPaths).toEqual(acceptedPaths);
  });

  it("the real repo's actual mutation routes pass checkNoLegacyMutationRoute", () => {
    const observed = extractMutationRoutes(workerIndexSource);
    const result = checkNoLegacyMutationRoute(
      observed,
      ACCEPTED_MUTATION_ROUTES,
    );
    expect(result.pass).toBe(true);
  });
});

describe("release gate: EVIDENCE_APPLY_SHADOW is never implicitly selected (real repo)", () => {
  const operatorScript =
    createSubmissionKernel.toString() + operatorPanelClientScript.toString();
  const fieldScript =
    createSubmissionKernel.toString() + fieldDashboardClientScript.toString();

  it("the real /admin/operator page + client script passes checkEvidenceApplyShadowExplicit", () => {
    expect(
      checkEvidenceApplyShadowExplicit(operatorPanelHtml(), operatorScript)
        .pass,
    ).toBe(true);
  });

  it("the real /admin/field page + client script passes checkEvidenceApplyShadowExplicit", () => {
    expect(
      checkEvidenceApplyShadowExplicit(fieldDashboardHtml(), fieldScript).pass,
    ).toBe(true);
  });

  it("the shared voice transport source passes checkEvidenceApplyShadowExplicit", () => {
    expect(
      checkEvidenceApplyShadowExplicit("", voiceTransportSource).pass,
    ).toBe(true);
  });

  it("the actually-served GET /admin/operator response passes too", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/admin/operator"),
      env,
    );
    expect(
      checkEvidenceApplyShadowExplicit(await response.text(), operatorScript)
        .pass,
    ).toBe(true);
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
  // Mechanically derived from the real engine/domain/operator exports -- see
  // tools/release-gate/test/forbidden-symbols.test.ts for the fixture-level proof this catches a
  // renamed/inline copy, not just a call to one of a small hand-picked sample of names.
  const engineDomainOperatorSources = import.meta.glob<string>(
    [
      "../../src/engine/*.ts",
      "../../src/domain/validation.ts",
      "../../src/operator/intent.ts",
      "../../src/operator/workflow.ts",
      "../../src/operator/result.ts",
      "../../src/operator/policy.ts",
      "../../src/operator/observability.ts",
    ],
    { eager: true, import: "default", query: "?raw" },
  );

  function forbiddenSymbols(): string[] {
    const names = new Set<string>();
    for (const source of Object.values(engineDomainOperatorSources)) {
      for (const name of extractExportedValueNames(source)) names.add(name);
    }
    for (const known of KNOWN_HARMLESS_NAME_COLLISIONS) names.delete(known);
    return [...names];
  }

  it("neither Task 16A's nor Task 16B's embedded client script references a canonical engine/domain/operator symbol", () => {
    const forbidden = forbiddenSymbols();
    expect(forbidden.length).toBeGreaterThan(20);
    const operatorSource =
      createSubmissionKernel.toString() + operatorPanelClientScript.toString();
    const fieldSource =
      createSubmissionKernel.toString() + fieldDashboardClientScript.toString();
    expect(checkNoBrowserBusinessLogic(operatorSource, forbidden).pass).toBe(
      true,
    );
    expect(checkNoBrowserBusinessLogic(fieldSource, forbidden).pass).toBe(true);
    expect(
      checkNoBrowserBusinessLogic(voiceTransportSource, forbidden).pass,
    ).toBe(true);
  });
});

// BLOCKER 4: previously this describe block only ever fed checkNoLiveConnectorReferences the two
// client-embedded scripts plus src/worker/index.ts -- a live connector added to any *other* file
// under src/worker, src/operator, src/engine, or src/domain (a new file, or an existing file
// gaining a new import) would never be scanned at all, so the release gate would falsely PASS.
// This now discovers every source file under those four directories dynamically (Vite's
// `import.meta.glob`, the same real-source-text mechanism repository-policy.test.ts and the
// mutation-route/browser-boundary checks above already use in this sandboxed Workers runtime) and
// scans all of them via scanSourcesForLiveConnectorReferences, which itself excludes tests/docs/
// fixtures so asserting a token is forbidden never counts as a violation. See
// tools/release-gate/test/scan-sources.test.ts for the fixture-level proof (new Calendar/Drive/
// OAuth module -> FAIL; same tokens in a test/doc -> ignored; same-origin fetch -> PASS).
const liveConnectorScanSources = import.meta.glob<string>(
  [
    "../../src/worker/**/*.ts",
    "../../src/operator/**/*.ts",
    "../../src/engine/**/*.ts",
    "../../src/domain/**/*.ts",
  ],
  { eager: true, import: "default", query: "?raw" },
);

function toRepoRelativePaths(
  sources: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [path, content] of Object.entries(sources)) {
    normalized[path.replace(/^\.\.\/\.\.\//, "")] = content;
  }
  return normalized;
}

describe("release gate: no source-level live connector references (real repo)", () => {
  it("neither client-embedded script references a live connector integration point", () => {
    const operatorSource =
      createSubmissionKernel.toString() + operatorPanelClientScript.toString();
    const fieldSource =
      createSubmissionKernel.toString() + fieldDashboardClientScript.toString();
    expect(checkNoLiveConnectorReferences(operatorSource).pass).toBe(true);
    expect(checkNoLiveConnectorReferences(fieldSource).pass).toBe(true);
    expect(checkNoLiveConnectorReferences(voiceTransportSource).pass).toBe(
      true,
    );
  });

  it("every real source file under src/worker, src/operator, src/engine, and src/domain passes -- not just index.ts", () => {
    const sources = toRepoRelativePaths(liveConnectorScanSources);
    // Sanity check that discovery actually found the real tree and isn't vacuously scanning zero
    // files (which would make this test trivially, falsely PASS).
    expect(Object.keys(sources).length).toBeGreaterThan(15);
    expect(Object.keys(sources)).toContain("src/worker/index.ts");
    const result = scanSourcesForLiveConnectorReferences(sources);
    expect(result.pass).toBe(true);
  });
});
