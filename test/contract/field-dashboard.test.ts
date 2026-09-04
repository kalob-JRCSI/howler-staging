/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";

function plainRequest(method: string, path: string): Request {
  return new Request(`https://example.test${path}`, { method });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const FROZEN_ADMIN_BODY_SHA256 =
  "6681c69ea24b578287cda750c268c2f499664da036367b7ece1b7c082f6d42d0";

// 1
describe("GET /admin/field: additive route, existing routes unchanged", () => {
  it("is public and returns its own HTML page", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/admin/field"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
  });

  // 2
  it("carries the same security headers as the other admin pages", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/admin/field"),
      env,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  // 3
  it("leaves GET /admin and GET / byte-for-byte unchanged (frozen v0.9.4 fixture hash)", async () => {
    for (const path of ["/admin", "/"]) {
      const response = await worker.fetch(plainRequest("GET", path), env);
      const body = await response.text();
      expect(await sha256Hex(body)).toBe(FROZEN_ADMIN_BODY_SHA256);
    }
  });

  // 4
  it("leaves GET /admin/operator intact (Task 16A page still present and functional)", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/admin/operator"),
      env,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/id="run-intent"/);
  });
});

// 5
describe("required field experience", () => {
  it("shows the persistent STAGING / SHADOW / NO LIVE SYSTEMS banner", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    expect(html).toMatch(/STAGING/);
    expect(html).toMatch(/SHADOW/);
    expect(html).toMatch(/NO LIVE SYSTEMS/);
    expect(html).toMatch(/id="env-banner" role="status"/);
  });

  // 6
  it("has an admin key field and project-tracking controls", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    expect(html).toMatch(/id="admin-key"[^>]*type="password"/);
    expect(html).toContain('id="new-project-id"');
    expect(html).toContain('id="add-project"');
    expect(html).toContain('id="refresh-all"');
  });

  // 7
  it("renders one project card per default tracked project via the embedded client script, not hardcoded per-project HTML", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    // The shell ships with an empty container; the script renders cards at runtime.
    expect(html).toMatch(/<div id="projects-container"><\/div>/);
    expect(html).toContain("fieldDashboardClientScript");
  });

  // 8
  it("embeds createSubmissionKernel ahead of the field dashboard's own client script (shared identity/PM logic, not duplicated)", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    const kernelIndex = html.indexOf("function createSubmissionKernel");
    const scriptIndex = html.indexOf("function fieldDashboardClientScript");
    expect(kernelIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(kernelIndex).toBeLessThan(scriptIndex);
  });

  // 9
  it("submits only to the Task 15 operator routes, never legacy v0.9.4 mutation routes", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    expect(html).toContain("/v1/intents");
    expect(html).toContain("/resume");
    expect(html).not.toContain("/events/preview");
    expect(html).not.toContain("/events/apply-shadow");
    expect(html).not.toContain("/events/publish");
    expect(html).not.toContain("/v1/admin/init-db");
  });

  // 10
  it("has no Dashboard/Calendar/Drive/connector controls, and EVIDENCE_APPLY_SHADOW is never a default-selected option", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    expect(html).not.toMatch(/Google Calendar/i);
    expect(html).not.toMatch(/Google Drive/i);
    expect(html).not.toMatch(/connector/i);
    expect(html).not.toMatch(/selected[^>]*value="EVIDENCE_APPLY_SHADOW"/);
    expect(html).not.toMatch(/value="EVIDENCE_APPLY_SHADOW"[^>]*selected/);
  });

  // 11
  it("declares a responsive viewport and an html lang attribute", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(
      /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/,
    );
  });
});

// 12
describe("embedded client script closure safety", () => {
  it("every module-level constant createSubmissionKernel needs is declared inside its own embedded text", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/field"), env)
    ).text();
    const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(scriptMatch).toBeDefined();
    const script = scriptMatch?.[1] ?? "";
    for (const name of [
      "PENDING_KEY",
      "ADMIN_KEY_STORAGE_KEY",
      "EM_DASH",
      "EVIDENCE_KINDS",
      "REUSE_OR_CONFLICT_CODES",
      "REQUIRED_EFFECT_BY_KIND",
      "TRACKED_PROJECTS_KEY",
      "DEFAULT_TRACKED_PROJECTS",
      "QUERY_KINDS",
    ]) {
      expect(script).toContain(`const ${name}`);
    }
  });
});
