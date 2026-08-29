import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { buildHealthReport, projectHealth } from "../../src/worker/health";
import { createDeboardSeed } from "../../src/worker/deboard-seed";
import { forecastInitial } from "../../src/engine/engine";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import type { PredictionOutcomeV094 } from "../../src/engine/learning";

const GENERATED_AT = "2026-08-27T12:00:00.000Z";

describe("projectHealth", () => {
  function fakeRepo(outcomes: PredictionOutcomeV094[] = []): {
    loadPredictionOutcomes: () => Promise<PredictionOutcomeV094[]>;
  } {
    return { loadPredictionOutcomes: () => Promise.resolve(outcomes) };
  }

  it("summarizes the real DeBoard model with no forecast supplied", async () => {
    const model = createDeboardSeed();
    const health = await projectHealth(fakeRepo(), model, undefined);
    expect(health.projectId).toBe("deboard-v091");
    expect(health.revision).toBe(1);
    expect(health.forecastVersion).toBeNull();
    expect(health.completion).toBeNull();
    expect(health.meanForecastConfidence).toBe(0);
  });

  it("reports the open HIGH-severity conflicts from the DeBoard model", async () => {
    const model = createDeboardSeed();
    const health = await projectHealth(fakeRepo(), model, undefined);
    expect(health.openConflicts.map((c) => c.id).sort()).toEqual([
      "conf-brick-match",
      "conf-plan-engineering",
    ]);
  });

  it("reports the blocked constraint (brick-match) from the DeBoard model", async () => {
    const model = createDeboardSeed();
    const health = await projectHealth(fakeRepo(), model, undefined);
    expect(health.blockedConstraints.map((c) => c.id)).toContain("brick-match");
  });

  it("computes mean forecast confidence and forecast version/completion when a forecast is supplied", async () => {
    const model = createDeboardSeed();
    const run = forecastInitial(model, GENERATED_AT, 1);
    const health = await projectHealth(fakeRepo(), model, run.candidate);
    expect(health.forecastVersion).toBe(1);
    expect(health.completion).toEqual(run.candidate.completion);
    expect(health.meanForecastConfidence).toBeGreaterThan(0);
    expect(health.meanForecastConfidence).toBeLessThanOrEqual(1);
  });

  it("sorts low-coverage activities ascending by overall coverage", async () => {
    const model = createDeboardSeed();
    const health = await projectHealth(fakeRepo(), model, undefined);
    for (let i = 1; i < health.lowCoverage.length; i += 1) {
      expect(health.lowCoverage[i]?.overall ?? 0).toBeGreaterThanOrEqual(
        health.lowCoverage[i - 1]?.overall ?? 0,
      );
    }
    expect(health.lowCoverage.every((c) => c.overall < 0.6)).toBe(true);
  });

  it("summarizes prediction outcome accuracy by horizon bucket", async () => {
    const model = createDeboardSeed();
    const outcomes: PredictionOutcomeV094[] = [
      {
        predictionId: "p1",
        activityId: "masonry",
        horizonDays: 2,
        predicted: {
          optimistic: "2026-08-24",
          likely: "2026-08-26",
          conservative: "2026-08-28",
        },
        actual: "2026-08-26",
        pointErrorWorkdays: 0,
        rangeHit: true,
        confidenceAtPrediction: 0.7,
        sourceSnapshotId: "snap-1",
      },
    ];
    const health = await projectHealth(fakeRepo(outcomes), model, undefined);
    expect(health.accuracyByHorizon).toHaveLength(1);
    expect(health.accuracyByHorizon[0]?.bucket).toBe("0-3");
    expect(health.accuracyByHorizon[0]?.count).toBe(1);
  });
});

describe("buildHealthReport", () => {
  beforeEach(async () => {
    await dropAllTables(env.HOWLER_DB);
  });

  it("reports ok=false with schemaReady=false before the migration is applied", async () => {
    const report = await buildHealthReport(env.HOWLER_DB, "shadow", true);
    expect(report.database).toEqual({ bound: true, schemaReady: false });
    expect(report.ok).toBe(false);
  });

  it("reports ok=true only once bound, schemaReady, and adminConfigured are all true", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const report = await buildHealthReport(env.HOWLER_DB, "shadow", true);
    expect(report.database).toEqual({ bound: true, schemaReady: true });
    expect(report.ok).toBe(true);
  });

  it("reports ok=false when the admin key is not configured, even with a ready schema", async () => {
    await applySchema(env.HOWLER_DB, baselineMigrationSql());
    const report = await buildHealthReport(env.HOWLER_DB, "shadow", false);
    expect(report.adminConfigured).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("reports bound=false and schemaReady=false when no database binding is provided", async () => {
    const report = await buildHealthReport(undefined, "shadow", true);
    expect(report.database).toEqual({ bound: false, schemaReady: false });
    expect(report.ok).toBe(false);
  });

  it("captures a database error message without throwing", async () => {
    const throwing: D1Database = {
      prepare() {
        throw new Error("simulated D1 failure");
      },
    } as unknown as D1Database;
    const report = await buildHealthReport(throwing, "shadow", true);
    expect(report.database).toEqual({
      bound: true,
      schemaReady: false,
      error: "simulated D1 failure",
    });
    expect(report.ok).toBe(false);
  });

  it("defaults mode to shadow when undefined", async () => {
    const report = await buildHealthReport(undefined, undefined, false);
    expect(report.mode).toBe("shadow");
  });

  it("reports the approved v0.9.5 diagnostic fields: version, engine compatibility, and no live connections", async () => {
    const report = await buildHealthReport(undefined, "shadow", false);
    expect(report.service).toBe("howler-scheduling-staging");
    expect(report.version).toBe("0.9.5");
    expect(report.engineCompatibilityVersion).toBe("0.9.4");
    expect(report.liveSystemsConnected).toBe(false);
    expect(report.dashboardConnected).toBe(false);
    expect(report.calendarConnected).toBe(false);
  });
});
