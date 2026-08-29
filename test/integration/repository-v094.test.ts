import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { D1HowlerRepository } from "../../src/worker/repository";
import { forecastInitial } from "../../src/engine/engine";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import type { ProjectModelV094 } from "../../src/domain/types";
import type {
  LearningRecordV094,
  PredictionOutcomeV094,
} from "../../src/engine/learning";

const GENERATED_AT = "2026-08-26T12:00:00.000Z";

function seedModel(
  overrides: Partial<ProjectModelV094> = {},
): ProjectModelV094 {
  return {
    projectId: "p1",
    revision: 0,
    name: "Test Project",
    projectType: "TEST",
    timezone: "UTC",
    forecastAnchorDate: "2026-08-26",
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    sources: {},
    activities: {
      a1: {
        id: "a1",
        name: "Activity One",
        phase: "Phase",
        state: "NOT_STARTED",
        duration: { optimistic: 1, likely: 2, conservative: 3, sourceIds: [] },
        constraintIds: [],
        sourceIds: [],
      },
    },
    constraints: {},
    dependencies: {},
    eventLedger: [],
    ...overrides,
  };
}

beforeEach(async () => {
  // D1 storage is fresh per test FILE but shared across `it()` blocks within one file, so each
  // test must reset to a genuinely empty schema rather than relying on `CREATE ... IF NOT EXISTS`.
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

describe("D1HowlerRepository: projectExists / createProject / loadProject", () => {
  it("reports a project as not existing before it is created", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    expect(await repo.projectExists("p1")).toBe(false);
  });

  it("creates a project and makes it discoverable", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    expect(await repo.projectExists("p1")).toBe(true);
  });

  it("round-trips the persisted project model at revision 0 after seeding", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    const loaded = await repo.loadProject("p1");
    expect(loaded?.revision).toBe(0);
    expect(loaded?.projectId).toBe("p1");
    expect(loaded?.activities.a1?.name).toBe("Activity One");
  });

  it("returns undefined for an unknown project", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    expect(await repo.loadProject("missing")).toBeUndefined();
  });

  it("rejects a second createProject call for the same project ID (no silent overwrite)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    await expect(
      repo.createProject(model, run.candidate, run.oversight),
    ).rejects.toThrow();
  });

  it("rejects a seed project whose revision does not match its event ledger length", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel({ revision: 1, eventLedger: [] });
    const run = forecastInitial(seedModel(), GENERATED_AT, 1);
    await expect(
      repo.createProject(model, run.candidate, run.oversight),
    ).rejects.toThrow(
      "Seed project supports zero or one bootstrap evidence event and revision must match the ledger",
    );
  });

  it("rejects an initial forecast that does not match the seed project", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const otherRun = forecastInitial(
      seedModel({ projectId: "other" }),
      GENERATED_AT,
      1,
    );
    await expect(
      repo.createProject(model, otherRun.candidate, otherRun.oversight),
    ).rejects.toThrow("Initial forecast does not match seed project revision");
  });

  it("detects a persisted-project revision mismatch (defends against a corrupted row)", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    // Directly corrupt the stored JSON's revision without updating the `revision` column, simulating drift.
    await env.HOWLER_DB.prepare(
      "UPDATE projects SET current_model_json = ? WHERE project_id = ?",
    )
      .bind(JSON.stringify({ ...model, revision: 5 }), "p1")
      .run();
    await expect(repo.loadProject("p1")).rejects.toThrow(
      "Persisted project p1 revision mismatch",
    );
  });
});

describe("D1HowlerRepository: forecast snapshots", () => {
  it("has no latest/published forecast before a project is seeded", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    expect(await repo.loadLatestForecast("p1")).toBeUndefined();
    expect(await repo.loadLatestPublishedForecast("p1")).toBeUndefined();
  });

  it("loads the seeded forecast as the latest, but not as published", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    const latest = await repo.loadLatestForecast("p1");
    expect(latest?.version).toBe(1);
    expect(latest?.status).toBe(run.candidate.status);
    expect(await repo.loadLatestPublishedForecast("p1")).toBeUndefined();
  });

  it("loads a forecast snapshot by its exact ID", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    const byId = await repo.loadForecastById("p1", run.candidate.id);
    expect(byId?.id).toBe(run.candidate.id);
    expect(
      await repo.loadForecastById("p1", "missing-snapshot"),
    ).toBeUndefined();
  });
});

describe("D1HowlerRepository: events", () => {
  it("returns an empty list for a project with no events beyond the bootstrap", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    expect(await repo.loadEvents("p1")).toEqual([]);
  });

  it("returns events in ascending (chronological) order despite the descending internal query", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    // Insert two shadow-committed events directly through the repository to build ledger history.
    let current = { model, candidate: run.candidate, oversight: run.oversight };
    for (let i = 0; i < 2; i += 1) {
      const event = {
        id: `e${String(i)}`,
        baseRevision: i,
        projectId: "p1",
        type: "FIELD_UPDATE",
        occurredAt: GENERATED_AT,
        receivedAt: GENERATED_AT,
        sourceIds: [],
        verification: "PM_CONFIRMED" as const,
        impactSeedActivityIds: [],
        mutations: [],
        payload: {},
      };
      const modelAfterEvent: ProjectModelV094 = {
        ...current.model,
        revision: i + 1,
        eventLedger: [...current.model.eventLedger, event],
      };
      const candidate = {
        ...current.candidate,
        id: `snap-${String(i)}`,
        version: i + 2,
        modelRevision: modelAfterEvent.revision,
        status: "WORKING" as const,
      };
      const oversight = {
        ...current.oversight,
        id: `oversight-${String(i)}`,
        candidateSnapshotId: candidate.id,
      };
      await repo.commitShadowTransition({
        expectedRevision: i,
        modelAfterEvent,
        event,
        candidate,
        oversight,
      });
      current = { model: modelAfterEvent, candidate, oversight };
    }
    const events = await repo.loadEvents("p1");
    expect(events.map((e) => e.id)).toEqual(["e0", "e1"]);
  });

  it("clamps the limit parameter to between 1 and 500", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    // A limit of 0 or negative must not throw and must still return an array.
    await expect(repo.loadEvents("p1", 0)).resolves.toEqual([]);
    await expect(repo.loadEvents("p1", -5)).resolves.toEqual([]);
  });
});

describe("D1HowlerRepository: learning records", () => {
  function record(
    overrides: Partial<LearningRecordV094> = {},
  ): LearningRecordV094 {
    return {
      id: "rec-1",
      layer: "PROJECT",
      hypothesisType: "OUTCOME",
      subjectKey: "subject-1",
      hypothesis: "test hypothesis",
      evidenceEventIds: [],
      evidenceProjectIds: [],
      observationCount: 1,
      verifiedOutcomeCount: 1,
      contradictingOutcomeCount: 0,
      confidence: 0.6,
      stage: "OBSERVATION",
      lastObservedAt: GENERATED_AT,
      ...overrides,
    };
  }

  it("saves and loads a learning record", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await repo.saveLearningRecord(record());
    const [loaded] = await repo.loadLearningRecords();
    expect(loaded?.id).toBe("rec-1");
  });

  it("upserts (ON CONFLICT) rather than duplicating a record with the same ID", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await repo.saveLearningRecord(record({ confidence: 0.6 }));
    await repo.saveLearningRecord(record({ confidence: 0.9 }));
    const all = await repo.loadLearningRecords();
    expect(all).toHaveLength(1);
    expect(all[0]?.confidence).toBe(0.9);
  });

  it("filters learning records by subjectKey when provided", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await repo.saveLearningRecord(
      record({ id: "rec-1", subjectKey: "subject-1" }),
    );
    await repo.saveLearningRecord(
      record({ id: "rec-2", subjectKey: "subject-2" }),
    );
    const filtered = await repo.loadLearningRecords("subject-2");
    expect(filtered.map((r) => r.id)).toEqual(["rec-2"]);
  });
});

describe("D1HowlerRepository: prediction outcomes", () => {
  function outcome(
    overrides: Partial<PredictionOutcomeV094> = {},
  ): PredictionOutcomeV094 {
    return {
      predictionId: "pred-1",
      activityId: "a1",
      horizonDays: 3,
      predicted: {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      actual: "2026-08-26",
      pointErrorWorkdays: 0,
      rangeHit: true,
      confidenceAtPrediction: 0.7,
      sourceSnapshotId: "snap-missing",
      ...overrides,
    };
  }

  it("rejects a prediction outcome referencing an unknown source snapshot", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    await expect(repo.savePredictionOutcome(outcome())).rejects.toThrow(
      "Unknown source snapshot snap-missing",
    );
  });

  it("saves and loads a prediction outcome referencing a real snapshot", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    await repo.savePredictionOutcome(
      outcome({ sourceSnapshotId: run.candidate.id }),
    );
    const [loaded] = await repo.loadPredictionOutcomes("p1");
    expect(loaded?.predictionId).toBe("pred-1");
  });

  it("filters prediction outcomes by projectId when provided", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    await repo.savePredictionOutcome(
      outcome({ sourceSnapshotId: run.candidate.id }),
    );
    expect(await repo.loadPredictionOutcomes("other-project")).toEqual([]);
  });
});

describe("D1HowlerRepository: append-only enforcement", () => {
  it("rejects an UPDATE on project_events", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    const event = {
      id: "e0",
      baseRevision: 0,
      projectId: "p1",
      type: "FIELD_UPDATE",
      occurredAt: GENERATED_AT,
      receivedAt: GENERATED_AT,
      sourceIds: [],
      verification: "PM_CONFIRMED" as const,
      impactSeedActivityIds: [],
      mutations: [],
      payload: {},
    };
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const candidate = {
      ...run.candidate,
      id: "snap-1",
      version: 2,
      modelRevision: 1,
      status: "WORKING" as const,
    };
    const oversight = {
      ...run.oversight,
      id: "oversight-1",
      candidateSnapshotId: candidate.id,
    };
    await repo.commitShadowTransition({
      expectedRevision: 0,
      modelAfterEvent,
      event,
      candidate,
      oversight,
    });
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE project_events SET event_type = 'X' WHERE event_id = ?",
      )
        .bind("e0")
        .run(),
    ).rejects.toThrow("project_events is append-only");
  });

  it("rejects a DELETE on forecast_snapshots", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM forecast_snapshots WHERE snapshot_id = ?",
      )
        .bind(run.candidate.id)
        .run(),
    ).rejects.toThrow("forecast_snapshots is append-only");
  });

  it("rejects an UPDATE on oversight_reviews", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    await expect(
      env.HOWLER_DB.prepare(
        "UPDATE oversight_reviews SET decision = 'BLOCK' WHERE review_id = ?",
      )
        .bind(run.oversight.id)
        .run(),
    ).rejects.toThrow("oversight_reviews is append-only");
  });

  it("rejects a DELETE on prediction_outcomes", async () => {
    const repo = new D1HowlerRepository(env.HOWLER_DB);
    const model = seedModel();
    const run = forecastInitial(model, GENERATED_AT, 1);
    await repo.createProject(model, run.candidate, run.oversight);
    await repo.savePredictionOutcome({
      predictionId: "pred-1",
      activityId: "a1",
      horizonDays: 1,
      predicted: {
        optimistic: "2026-08-24",
        likely: "2026-08-26",
        conservative: "2026-08-28",
      },
      actual: "2026-08-26",
      pointErrorWorkdays: 0,
      rangeHit: true,
      confidenceAtPrediction: 0.7,
      sourceSnapshotId: run.candidate.id,
    });
    await expect(
      env.HOWLER_DB.prepare(
        "DELETE FROM prediction_outcomes WHERE prediction_id = ?",
      )
        .bind("pred-1")
        .run(),
    ).rejects.toThrow("prediction_outcomes is append-only");
  });
});
