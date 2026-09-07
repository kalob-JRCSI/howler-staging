/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../../src/worker/entry";
import { sha256Hex } from "../../src/worker/hash";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";

const ADMIN_KEY = "portfolio-integration-admin-key";
const PILOT_PASSWORD = "portfolio-integration-password";

async function testEnv(): Promise<Env> {
  return {
    ...env,
    HOWLER_ADMIN_KEY: ADMIN_KEY,
    HOWLER_PILOT_USERNAME: "kalob",
    HOWLER_PILOT_PASSWORD_HASH: await sha256Hex(PILOT_PASSWORD),
    HOWLER_SESSION_SIGNING_SECRET: "portfolio-integration-session-secret",
  };
}

function importFixture(projectId: string, index: number): {
  project: Record<string, unknown>;
  provenance: Record<string, { sourceId: string; section: string }>;
} {
  const sourceId = `src-portfolio-${String(index)}`;
  const activityId = `activity-${String(index)}`;
  return {
    project: {
      projectId,
      revision: 0,
      name: `Portfolio Project ${String(index + 1).padStart(2, "0")}`,
      projectType: "RESIDENTIAL",
      timezone: "America/New_York",
      forecastAnchorDate: "2026-09-07",
      calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
      sources: {
        [sourceId]: {
          id: sourceId,
          type: "FIELD_REPORT",
          label: "Portfolio integration fixture",
          observedAt: "2026-09-07T12:00:00-04:00",
          authority: 0.9,
          reliability: 0.9,
        },
      },
      activities: {
        [activityId]: {
          id: activityId,
          name: `Work package ${String(index + 1)}`,
          phase: "Construction",
          state: "NOT_STARTED",
          duration: {
            optimistic: 2,
            likely: 3,
            conservative: 5,
            sourceIds: [sourceId],
          },
          constraintIds: [],
          sourceIds: [sourceId],
        },
      },
      constraints: {},
      dependencies: {},
      eventLedger: [],
      projectProfile: {
        budget: { baseline: 100000 + index * 1000, spent: index * 500 },
        baselineScope: [
          {
            id: `scope-${String(index)}`,
            label: `Scope ${String(index + 1)}`,
            phase: "Construction",
          },
        ],
      },
    },
    provenance: {
      [activityId]: {
        sourceId,
        section: "Portfolio scale fixture",
      },
    },
  };
}

function adminImportRequest(projectId: string, fixture: unknown): Request {
  return new Request(
    `https://example.test/v1/projects/${encodeURIComponent(projectId)}/import`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify(fixture),
    },
  );
}

async function seedProjects(count: number, productEnv: Env): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const projectId = `portfolio-${String(index + 1).padStart(2, "0")}`;
    const response = await worker.fetch(
      adminImportRequest(projectId, importFixture(projectId, index)),
      productEnv,
    );
    expect(response.status, `import ${projectId}`).toBe(201);
    ids.push(projectId);
  }
  return ids;
}

async function loginCookie(productEnv: Env): Promise<string> {
  const response = await worker.fetch(
    new Request("https://example.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "kalob", password: PILOT_PASSWORD }),
    }),
    productEnv,
  );
  expect(response.status).toBe(204);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
  expect(cookie).toMatch(/^howler_session=.+/);
  return cookie ?? "";
}

async function readPortfolio(productEnv: Env): Promise<{
  projects: { projectId: string; projectName: string }[];
}> {
  const cookie = await loginCookie(productEnv);
  const response = await worker.fetch(
    new Request("https://example.test/v1/portfolio", {
      headers: { cookie },
    }),
    productEnv,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    projects: { projectId: string; projectName: string }[];
  };
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

describe("dynamic authenticated portfolio", () => {
  for (const count of [0, 1, 7, 12, 16]) {
    it(
      `derives a ${String(count)}-project portfolio from canonical D1 contents`,
      async () => {
        const productEnv = await testEnv();
        const expectedIds = await seedProjects(count, productEnv);
        const portfolio = await readPortfolio(productEnv);

        expect(portfolio.projects).toHaveLength(count);
        expect(
          portfolio.projects.map((project) => project.projectId).sort(),
        ).toEqual(expectedIds.sort());
      },
    );
  }

  it(
    "discovers a project created after the original portfolio without browser registration",
    async () => {
      const productEnv = await testEnv();
      await seedProjects(7, productEnv);
      const before = await readPortfolio(productEnv);
      expect(before.projects).toHaveLength(7);

      const newProjectId = "portfolio-newly-created";
      const createResponse = await worker.fetch(
        adminImportRequest(newProjectId, importFixture(newProjectId, 99)),
        productEnv,
      );
      expect(createResponse.status).toBe(201);

      const after = await readPortfolio(productEnv);
      expect(after.projects).toHaveLength(8);
      expect(after.projects.map((project) => project.projectId)).toContain(
        newProjectId,
      );
    },
  );
});
