/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/index";
import { forecastInitial } from "../../src/engine/engine";
import { D1HowlerRepository } from "../../src/worker/repository";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import type {
  ProjectEventV094,
  ProjectModelV094,
} from "../../src/domain/types";

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
});

function fixture(fileName: string): unknown {
  const entry = Object.entries(fixtureSources).find(([modulePath]) =>
    modulePath.endsWith(`/${fileName}`),
  );
  if (!entry) throw new Error(`missing fixture ${fileName}`);
  return JSON.parse(entry[1]);
}

const GENERATED_AT = "2026-08-27T12:00:00.000Z";
const ADMIN_KEY = "test-admin-key-masonry-transition";

function adminEnv(): Env {
  return { ...env, HOWLER_ADMIN_KEY: ADMIN_KEY };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function get(path: string): Request {
  return new Request(`https://example.test${path}`, {
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
  });
}

const seedFixture = fixture("deboard-seed.json") as {
  response: { body: { project: ProjectModelV094 } };
};
const previewFixture = fixture("masonry-preview.json") as {
  request: { body: ProjectEventV094 };
  response: { body: Record<string, unknown> };
};
const applyShadowFixture = fixture("masonry-apply-shadow.json") as {
  request: { body: { event: ProjectEventV094; reviewToken: string } };
  response: { body: Record<string, unknown> };
};
const recoveryFixture = fixture("recovery.json") as {
  response: { body: Record<string, unknown> };
};

/**
 * The real `/v1/projects/deboard-v091/seed` route always uses wall-clock `new Date().toISOString()`
 * for its initial forecast (mechanically preserved from baseline), so it cannot reproduce the
 * fixed-timestamp golden fixtures byte-for-byte. This seeds the exact same DB state the fixtures
 * were captured from directly through the repository with the fixed GENERATED_AT instead — the
 * same approach test/parity/recovery.test.ts already uses at the engine layer — so that the
 * *router* itself (not a re-derivation) is what gets exercised for the preview/apply-shadow calls
 * being golden-compared.
 */
async function seedFixedProject(): Promise<void> {
  const model = seedFixture.response.body.project;
  const initial = forecastInitial(model, GENERATED_AT, 1);
  const repo = new D1HowlerRepository(env.HOWLER_DB);
  await repo.createProject(model, initial.candidate, initial.oversight);
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
  await seedFixedProject();
});

describe("POST /v1/projects/:projectId/events/preview — masonry golden parity", () => {
  it("matches the frozen masonry-preview.json response body exactly", async () => {
    const response = await worker.fetch(
      post(
        "/v1/projects/deboard-v091/events/preview",
        previewFixture.request.body,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(previewFixture.response.body);
  });
});

describe("POST /v1/projects/:projectId/events/apply-shadow — masonry golden parity", () => {
  it("matches the frozen masonry-apply-shadow.json response body exactly", async () => {
    const response = await worker.fetch(
      post(
        "/v1/projects/deboard-v091/events/apply-shadow",
        applyShadowFixture.request.body,
      ),
      adminEnv(),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual(applyShadowFixture.response.body);
  });

  it("requires the reviewToken to match the current preview state (409 on mismatch)", async () => {
    const response = await worker.fetch(
      post("/v1/projects/deboard-v091/events/apply-shadow", {
        event: applyShadowFixture.request.body.event,
        reviewToken: "stale-token-does-not-match",
      }),
      adminEnv(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "Preview no longer matches the current project state. Re-preview before applying shadow evidence.",
    });
  });

  it("persists the transition so a subsequent forecast/recovery call reflects it", async () => {
    const applied = await worker.fetch(
      post(
        "/v1/projects/deboard-v091/events/apply-shadow",
        applyShadowFixture.request.body,
      ),
      adminEnv(),
    );
    expect(applied.status).toBe(201);
    const recovery = await worker.fetch(
      get("/v1/projects/deboard-v091/forecast/recovery"),
      adminEnv(),
    );
    expect(recovery.status).toBe(200);
    const body = await recovery.json();
    expect(body).toEqual(recoveryFixture.response.body);
  });
});

describe("apply-shadow after publish attempts", () => {
  it("still applies to staging even though publish is unavailable in shadow mode", async () => {
    const publishAttempt = await worker.fetch(
      post("/v1/projects/deboard-v091/events/publish", {
        event: applyShadowFixture.request.body.event,
        reviewToken: applyShadowFixture.request.body.reviewToken,
      }),
      adminEnv(),
    );
    expect(publishAttempt.status).toBe(403);

    const applied = await worker.fetch(
      post(
        "/v1/projects/deboard-v091/events/apply-shadow",
        applyShadowFixture.request.body,
      ),
      adminEnv(),
    );
    expect(applied.status).toBe(201);
    expect(await applied.json()).toEqual(applyShadowFixture.response.body);
  });
});
