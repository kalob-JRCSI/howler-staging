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

describe("GET /admin/operator: coexists with, and never modifies, the existing PM dashboard", () => {
  it("is public and returns its own HTML page", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/admin/operator"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
  });

  it("carries the same security headers as the existing /admin page", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/admin/operator"),
      env,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("leaves GET /admin byte-for-byte unchanged (frozen v0.9.4 fixture hash)", async () => {
    const response = await worker.fetch(plainRequest("GET", "/admin"), env);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(await sha256Hex(body)).toBe(FROZEN_ADMIN_BODY_SHA256);
  });

  it("leaves GET / byte-for-byte unchanged too", async () => {
    const response = await worker.fetch(plainRequest("GET", "/"), env);
    const body = await response.text();
    expect(await sha256Hex(body)).toBe(FROZEN_ADMIN_BODY_SHA256);
  });
});

describe("required operator experience", () => {
  it("shows the persistent STAGING / SHADOW / NO LIVE SYSTEMS banner", async () => {
    const response = await worker.fetch(
      plainRequest("GET", "/admin/operator"),
      env,
    );
    const html = await response.text();
    expect(html).toMatch(/STAGING/);
    expect(html).toMatch(/SHADOW/);
    expect(html).toMatch(/NO LIVE SYSTEMS/);
  });

  it("has an admin key field, a project ID field, and an intent selector", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).toMatch(/id="admin-key"[^>]*type="password"/);
    expect(html).toMatch(/id="project-id"/);
    expect(html).toMatch(/<select id="intent-kind">/);
    for (const kind of [
      "FORECAST_QUERY",
      "FORECAST_HEALTH_QUERY",
      "RECOVERY_QUERY",
      "EVIDENCE_PREVIEW",
      "EVIDENCE_APPLY_SHADOW",
    ]) {
      expect(html).toContain(`value="${kind}"`);
    }
  });

  it("EVIDENCE_APPLY_SHADOW is never the default/selected option", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    const optionsBlock = /<select id="intent-kind">([\s\S]*?)<\/select>/.exec(
      html,
    )?.[1];
    expect(optionsBlock).toBeDefined();
    expect(optionsBlock).not.toMatch(
      /value="EVIDENCE_APPLY_SHADOW"[^>]*selected/,
    );
    expect(optionsBlock).not.toMatch(
      /selected[^>]*value="EVIDENCE_APPLY_SHADOW"/,
    );
  });

  it("has the conditional revision/evidence fields, hidden by default", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).toMatch(/<section class="card" id="revision-field" hidden>/);
    expect(html).toMatch(/<section class="card" id="evidence-field" hidden>/);
    expect(html).toMatch(/id="expected-revision"/);
    expect(html).toMatch(/id="evidence-event-json"/);
  });

  it("has exactly one primary submit control labeled 'Run intent'", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    const submitButtons = [
      ...html.matchAll(/<button[^>]*type="submit"[^>]*>([^<]*)<\/button>/g),
    ];
    expect(submitButtons).toHaveLength(1);
    expect(submitButtons[0]?.[1]).toBe("Run intent");
    // Not disabled by default.
    expect(submitButtons[0]?.[0]).not.toMatch(/disabled/);
  });

  it("has a Resume workflow control, hidden by default", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).toMatch(
      /<button id="resume-button" type="button" hidden>Resume workflow<\/button>/,
    );
  });

  it("has structured output fields for workflow/result state, problem, and revision conflict", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    for (const id of [
      "out-intent-id",
      "out-workflow-id",
      "out-workflow-state",
      "out-attempt",
      "out-current-step",
      "out-result-id",
      "out-result-status",
      "out-persisted",
      "out-problem",
      "out-revision-conflict",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});

describe("strictly forbidden controls are absent from the operator panel", () => {
  it("has no routine init-db or seed buttons", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).not.toMatch(/Initialize Database/);
    expect(html).not.toMatch(/Seed DeBoard/);
    expect(html).not.toContain('id="initDb"');
    expect(html).not.toContain('id="seed"');
  });

  it("has no preview/apply/publish chain, Dashboard/Calendar, or connector controls", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).not.toMatch(/Preview v0\.9\.4/);
    expect(html).not.toMatch(/Apply v0\.9\.4/);
    expect(html).not.toMatch(/\bPublish\b/);
    expect(html).not.toMatch(/Dashboard/);
    expect(html).not.toMatch(/Calendar/);
    expect(html).not.toMatch(/connector/i);
  });

  it("makes no calls to legacy v0.9.4 mutation routes", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).not.toContain("/events/preview");
    expect(html).not.toContain("/events/apply-shadow");
    expect(html).not.toContain("/events/publish");
    expect(html).not.toContain("/v1/admin/init-db");
    expect(html).not.toContain("/v1/projects/deboard-v091/seed");
  });

  it("submits only to the Task 15 operator routes", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).toContain("/v1/intents");
    expect(html).toContain("/resume");
  });
});

describe("accessibility semantics", () => {
  it("labels every input/select/textarea via a matching for/id pair", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    const labelTargets = [...html.matchAll(/<label for="([^"]+)">/g)]
      .map((m) => m[1])
      .filter((id): id is string => id !== undefined);
    expect(labelTargets).toEqual(
      expect.arrayContaining([
        "admin-key",
        "project-id",
        "intent-kind",
        "expected-revision",
        "evidence-event-json",
      ]),
    );
    for (const id of labelTargets) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("has an aria-live status region and a lang attribute", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/id="status" aria-live="polite"/);
    expect(html).toMatch(/id="env-banner" role="status"/);
  });

  it("declares a responsive viewport", async () => {
    const html = await (
      await worker.fetch(plainRequest("GET", "/admin/operator"), env)
    ).text();
    expect(html).toMatch(/name="viewport" content="width=device-width/);
  });
});
