/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

// Reads raw source text at build time via Vite's `?raw` glob import, since the sandboxed Workers
// test runtime has no Node `fs` (nodejs_compat is deliberately not enabled).
function readSource(sources: Record<string, string>, suffix: string): string {
  const entry = Object.entries(sources).find(([modulePath]) =>
    modulePath.endsWith(suffix),
  );
  if (!entry) throw new Error(`missing source file ending in ${suffix}`);
  return entry[1];
}

const workflowSources = import.meta.glob<string>(
  "../../.github/workflows/*.yml",
  { eager: true, import: "default", query: "?raw" },
);

const packageJsonSources = import.meta.glob<string>("../../package.json", {
  eager: true,
  import: "default",
  query: "?raw",
});

const ciWorkflow = readSource(workflowSources, "ci.yml");

describe("repository policy: CI never receives Cloudflare credentials", () => {
  it("ci.yml contains no Cloudflare secret references", () => {
    expect(ciWorkflow).not.toMatch(/secrets\.CLOUDFLARE/);
    expect(ciWorkflow).not.toMatch(/CLOUDFLARE_API_TOKEN/);
    expect(ciWorkflow).not.toMatch(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("ci.yml runs on every branch push and every pull request", () => {
    expect(ciWorkflow).toMatch(/pull_request/);
    expect(ciWorkflow).toMatch(/push:/);
  });
});

describe("repository policy: no production or bare jarvis-voice deploy target", () => {
  it("no committed workflow references a 'production' environment/target", () => {
    for (const [path, source] of Object.entries(workflowSources)) {
      expect(source.toLowerCase(), path).not.toMatch(/\bproduction\b/);
    }
  });

  it("no committed workflow targets bare jarvis-voice (only jarvis-voice-staging is allowed)", () => {
    for (const [path, source] of Object.entries(workflowSources)) {
      const bareMatches = source.match(/jarvis-voice(?!-staging)/g);
      expect(
        bareMatches,
        `${path} must not reference jarvis-voice outside of jarvis-voice-staging`,
      ).toBeNull();
    }
  });
});

describe("repository policy: no non-dry deploy command outside the deployment workflow", () => {
  it("only .github/workflows/deploy.yml may contain a non-dry `wrangler deploy` command", () => {
    for (const [path, source] of Object.entries(workflowSources)) {
      const isDeployWorkflow = path.endsWith("/deploy.yml");
      const nonDryDeploy = /wrangler deploy(?!\s+--dry-run)\b/.test(source);
      if (!isDeployWorkflow) {
        expect(
          nonDryDeploy,
          `${path} must not run a non-dry wrangler deploy`,
        ).toBe(false);
      }
    }
  });

  it("no package.json script runs a non-dry wrangler deploy", () => {
    const pkg = JSON.parse(readSource(packageJsonSources, "package.json")) as {
      scripts: Record<string, string>;
    };
    for (const [name, command] of Object.entries(pkg.scripts)) {
      const nonDryDeploy = /wrangler deploy(?!\s+--dry-run)\b/.test(command);
      expect(
        nonDryDeploy,
        `script "${name}" must not run a non-dry wrangler deploy`,
      ).toBe(false);
    }
  });
});

describe("repository policy: no checked-in generated worker.js bundle", () => {
  const suspectPaths = import.meta.glob(
    [
      "../../worker.js",
      "../../src/worker.js",
      "../../src/worker/worker.js",
      "../../dist/worker.js",
    ],
    { eager: true },
  );

  it("has no worker.js at any of the historically dangerous locations", () => {
    expect(Object.keys(suspectPaths)).toHaveLength(0);
  });
});

describe("repository policy: no manual bundle-shuttle scripts", () => {
  it("no package.json script writes/copies a file literally named worker.js", () => {
    const pkg = JSON.parse(readSource(packageJsonSources, "package.json")) as {
      scripts: Record<string, string>;
    };
    for (const [name, command] of Object.entries(pkg.scripts)) {
      expect(command, `script "${name}"`).not.toMatch(/worker\.js/);
    }
  });

  it("no committed workflow writes/copies a file literally named worker.js", () => {
    for (const [path, source] of Object.entries(workflowSources)) {
      expect(source, path).not.toMatch(/worker\.js/);
    }
  });
});

describe("repository policy: CI concurrency is isolated from deployment", () => {
  it("ci.yml declares its own concurrency group distinct from deploy.yml", () => {
    expect(ciWorkflow).toMatch(/concurrency:/);
    expect(ciWorkflow).not.toMatch(/group:\s*deploy/);
  });
});
