import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { D1HowlerRepository } from "../../src/worker/repository";
import { RevisionConflictError } from "../../src/engine/storage";
import { forecastInitial } from "../../src/engine/engine";
import {
  applySchema,
  baselineMigrationSql,
  dropAllTables,
} from "../helpers/d1";
import type {
  ProjectEventV094,
  ProjectModelV094,
} from "../../src/domain/types";
import type { ForecastSnapshotV094 } from "../../src/engine/solver";
import type { OversightReviewV094 } from "../../src/engine/oversight";

const GENERATED_AT = "2026-08-26T12:00:00.000Z";

function seedModel(): ProjectModelV094 {
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
  };
}

function shadowEvent(baseRevision: number, id = "e0"): ProjectEventV094 {
  return {
    id,
    baseRevision,
    projectId: "p1",
    type: "FIELD_UPDATE",
    occurredAt: GENERATED_AT,
    receivedAt: GENERATED_AT,
    sourceIds: [],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: [],
    mutations: [],
    payload: {},
  };
}

beforeEach(async () => {
  await dropAllTables(env.HOWLER_DB);
  await applySchema(env.HOWLER_DB, baselineMigrationSql());
});

async function seedProject(): Promise<{
  repo: D1HowlerRepository;
  model: ProjectModelV094;
  candidate: ForecastSnapshotV094;
  oversight: OversightReviewV094;
}> {
  const repo = new D1HowlerRepository(env.HOWLER_DB);
  const model = seedModel();
  const run = forecastInitial(model, GENERATED_AT, 1);
  await repo.createProject(model, run.candidate, run.oversight);
  return { repo, model, candidate: run.candidate, oversight: run.oversight };
}

describe("project_events_revision_guard trigger (direct SQL)", () => {
  it("raises HOWLER_PROJECT_NOT_FOUND for an event on an unknown project", async () => {
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO project_events (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "missing-project",
          "e0",
          0,
          1,
          "FIELD_UPDATE",
          GENERATED_AT,
          GENERATED_AT,
          "{}",
          "{}",
        )
        .run(),
    ).rejects.toThrow("HOWLER_PROJECT_NOT_FOUND");
  });

  it("raises HOWLER_REVISION_CONFLICT when base_revision does not match the project's current revision", async () => {
    await seedProject();
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO project_events (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "p1",
          "e0",
          5,
          6,
          "FIELD_UPDATE",
          GENERATED_AT,
          GENERATED_AT,
          "{}",
          "{}",
        )
        .run(),
    ).rejects.toThrow("HOWLER_REVISION_CONFLICT");
  });

  it("raises HOWLER_INVALID_REVISION_INCREMENT when new_revision does not equal base_revision + 1", async () => {
    await seedProject();
    await expect(
      env.HOWLER_DB.prepare(
        `INSERT INTO project_events (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "p1",
          "e0",
          0,
          2,
          "FIELD_UPDATE",
          GENERATED_AT,
          GENERATED_AT,
          "{}",
          "{}",
        )
        .run(),
    ).rejects.toThrow("HOWLER_INVALID_REVISION_INCREMENT");
  });

  it("accepts a correctly-incrementing event and applies it to the project via the AFTER INSERT trigger", async () => {
    await seedProject();
    await env.HOWLER_DB.prepare(
      `INSERT INTO project_events (project_id, event_id, base_revision, new_revision, event_type, occurred_at, received_at, event_json, model_after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "p1",
        "e0",
        0,
        1,
        "FIELD_UPDATE",
        GENERATED_AT,
        GENERATED_AT,
        "{}",
        JSON.stringify({ revision: 1 }),
      )
      .run();
    const row = await env.HOWLER_DB.prepare(
      "SELECT revision, current_model_json FROM projects WHERE project_id = ?",
    )
      .bind("p1")
      .first<{
        revision: number;
        current_model_json: string;
      }>();
    expect(row?.revision).toBe(1);
    expect(row?.current_model_json).toBe(JSON.stringify({ revision: 1 }));
  });
});

describe("D1HowlerRepository.commitShadowTransition", () => {
  it("commits the event, forecast snapshot, and oversight review atomically", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const nextCandidate: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2",
      version: 2,
      modelRevision: 1,
      status: "WORKING",
    };
    const nextOversight: OversightReviewV094 = {
      ...oversight,
      id: "oversight-2",
      candidateSnapshotId: nextCandidate.id,
    };
    await repo.commitShadowTransition({
      expectedRevision: 0,
      modelAfterEvent,
      event,
      candidate: nextCandidate,
      oversight: nextOversight,
    });

    const loaded = await repo.loadProject("p1");
    expect(loaded?.revision).toBe(1);
    const latest = await repo.loadLatestForecast("p1");
    expect(latest?.id).toBe("snap-2");
    const events = await repo.loadEvents("p1");
    expect(events.map((e) => e.id)).toEqual(["e0"]);
  });

  it("rejects a published candidate as a shadow transition", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const publishedCandidate: ForecastSnapshotV094 = {
      ...candidate,
      status: "PUBLISHED",
    };
    await expect(
      repo.commitShadowTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: publishedCandidate,
        oversight,
      }),
    ).rejects.toThrow(
      "Shadow transition requires a non-published forecast candidate",
    );
  });

  it("rejects a modelAfterEvent revision that is not exactly expectedRevision + 1", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 2,
      eventLedger: [event],
    };
    await expect(
      repo.commitShadowTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: { ...candidate, modelRevision: 2 },
        oversight,
      }),
    ).rejects.toThrow("Shadow transition revision increment is invalid");
  });

  it("rejects an event baseRevision that does not match expectedRevision", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(5);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    await expect(
      repo.commitShadowTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: { ...candidate, modelRevision: 1 },
        oversight,
      }),
    ).rejects.toThrow(
      "Shadow event baseRevision does not match expectedRevision",
    );
  });

  it("rejects a candidate modelRevision that does not match the event-applied project revision", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    await expect(
      repo.commitShadowTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: { ...candidate, modelRevision: 99 },
        oversight,
      }),
    ).rejects.toThrow(
      "Shadow candidate modelRevision does not match event-applied project revision",
    );
  });

  it("rejects an oversight review that does not reference the candidate snapshot", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    await expect(
      repo.commitShadowTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: { ...candidate, modelRevision: 1 },
        oversight: { ...oversight, candidateSnapshotId: "different-snapshot" },
      }),
    ).rejects.toThrow(
      "Shadow oversight review does not reference candidate snapshot",
    );
  });

  it("translates a concurrent stale-revision race into RevisionConflictError, not a raw D1 error", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0, "e0");
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const nextCandidate: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2",
      version: 2,
      modelRevision: 1,
      status: "WORKING",
    };
    const nextOversight: OversightReviewV094 = {
      ...oversight,
      id: "oversight-2",
      candidateSnapshotId: nextCandidate.id,
    };
    // First commit wins and advances the project to revision 1.
    await repo.commitShadowTransition({
      expectedRevision: 0,
      modelAfterEvent,
      event,
      candidate: nextCandidate,
      oversight: nextOversight,
    });

    // A second, concurrently-prepared commit still targets expectedRevision 0 / baseRevision 0 -
    // simulating two requests that both read the project before either one wrote.
    const raceEvent = shadowEvent(0, "e0-race");
    const raceModelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [raceEvent],
    };
    const raceCandidate: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2-race",
      version: 2,
      modelRevision: 1,
      status: "WORKING",
    };
    const raceOversight: OversightReviewV094 = {
      ...oversight,
      id: "oversight-2-race",
      candidateSnapshotId: raceCandidate.id,
    };

    await expect(
      repo.commitShadowTransition({
        expectedRevision: 0,
        modelAfterEvent: raceModelAfterEvent,
        event: raceEvent,
        candidate: raceCandidate,
        oversight: raceOversight,
      }),
    ).rejects.toThrow(RevisionConflictError);
  });
});

describe("D1HowlerRepository.commitForecastTransition", () => {
  it("commits the event, published snapshot, and oversight review atomically", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const published: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2",
      version: 2,
      modelRevision: 1,
      status: "PUBLISHED",
    };
    const nextOversight: OversightReviewV094 = {
      ...oversight,
      id: "oversight-2",
      candidateSnapshotId: published.id,
    };
    await repo.commitForecastTransition({
      expectedRevision: 0,
      modelAfterEvent,
      event,
      candidate: published,
      oversight: nextOversight,
      published,
    });

    const publishedLoaded = await repo.loadLatestPublishedForecast("p1");
    expect(publishedLoaded?.id).toBe("snap-2");
  });

  it("rejects a non-published snapshot", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const notPublished: ForecastSnapshotV094 = {
      ...candidate,
      status: "PROPOSED",
    };
    await expect(
      repo.commitForecastTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: notPublished,
        oversight,
        published: notPublished,
      }),
    ).rejects.toThrow("Production transition requires a published snapshot");
  });

  it("rejects a published snapshot whose id/version does not match the reviewed candidate", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0);
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const published: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2",
      version: 2,
      modelRevision: 1,
      status: "PUBLISHED",
    };
    const mismatchedCandidate: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-other",
      version: 2,
      modelRevision: 1,
    };
    await expect(
      repo.commitForecastTransition({
        expectedRevision: 0,
        modelAfterEvent,
        event,
        candidate: mismatchedCandidate,
        oversight,
        published,
      }),
    ).rejects.toThrow(
      "Published snapshot must be the reviewed candidate version",
    );
  });

  it("translates a concurrent stale-revision race into RevisionConflictError", async () => {
    const { repo, model, candidate, oversight } = await seedProject();
    const event = shadowEvent(0, "e0");
    const modelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [event],
    };
    const published: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2",
      version: 2,
      modelRevision: 1,
      status: "PUBLISHED",
    };
    const nextOversight: OversightReviewV094 = {
      ...oversight,
      id: "oversight-2",
      candidateSnapshotId: published.id,
    };
    await repo.commitForecastTransition({
      expectedRevision: 0,
      modelAfterEvent,
      event,
      candidate: published,
      oversight: nextOversight,
      published,
    });

    const raceEvent = shadowEvent(0, "e0-race");
    const raceModelAfterEvent: ProjectModelV094 = {
      ...model,
      revision: 1,
      eventLedger: [raceEvent],
    };
    const racePublished: ForecastSnapshotV094 = {
      ...candidate,
      id: "snap-2-race",
      version: 2,
      modelRevision: 1,
      status: "PUBLISHED",
    };
    const raceOversight: OversightReviewV094 = {
      ...oversight,
      id: "oversight-2-race",
      candidateSnapshotId: racePublished.id,
    };
    await expect(
      repo.commitForecastTransition({
        expectedRevision: 0,
        modelAfterEvent: raceModelAfterEvent,
        event: raceEvent,
        candidate: racePublished,
        oversight: raceOversight,
        published: racePublished,
      }),
    ).rejects.toThrow(RevisionConflictError);
  });
});
