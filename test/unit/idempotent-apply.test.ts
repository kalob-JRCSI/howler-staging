import { describe, expect, it } from "vitest";
import {
  resolveIdempotentApply,
  type IdempotentApplyRepo,
} from "../../src/engine/idempotent-apply";
import type { ProjectEventV094 } from "../../src/domain/types";
import type { ForecastSnapshotV094 } from "../../src/engine/solver";
import type { OversightReviewV094 } from "../../src/engine/oversight";

function event(overrides: Partial<ProjectEventV094> = {}): ProjectEventV094 {
  return {
    id: "e1",
    baseRevision: 42,
    projectId: "p1",
    type: "FIELD_UPDATE",
    occurredAt: "2026-08-26T12:00:00Z",
    receivedAt: "2026-08-26T12:00:00Z",
    sourceIds: [],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: [],
    mutations: [],
    payload: {},
    ...overrides,
  };
}

function candidate(
  overrides: Partial<ForecastSnapshotV094> = {},
): ForecastSnapshotV094 {
  return {
    id: "candidate1",
    modelRevision: 43,
    projectId: "p1",
    version: 5,
    status: "WORKING",
    generatedAt: "2026-08-26T12:00:00Z",
    basedOnEventIds: [],
    basedOnSourceIds: [],
    evidenceRevision: 43,
    impactActivityIds: [],
    activityForecasts: {},
    pmActions: [],
    completion: {
      optimistic: "2026-09-01",
      likely: "2026-09-05",
      conservative: "2026-09-10",
    },
    supersededSources: [],
    recoveryAnalysis: {
      status: "ON_TRACK",
      recoveryAvailable: false,
      recoveryStandbyAvailable: false,
      advisoryOnly: false,
      levers: [],
      protectionActions: [],
    },
    ...overrides,
  };
}

function oversight(
  overrides: Partial<OversightReviewV094> = {},
): OversightReviewV094 {
  return {
    id: "oversight1",
    projectId: "p1",
    candidateSnapshotId: "candidate1",
    decision: "PASS",
    findings: [],
    createdAt: "2026-08-26T12:00:00Z",
    ...overrides,
  };
}

function fakeRepo(
  overrides: Partial<IdempotentApplyRepo> = {},
): IdempotentApplyRepo {
  return {
    loadEventById: () => Promise.resolve(undefined),
    loadForecastByModelRevision: () => Promise.resolve(undefined),
    loadOversightReviewByCandidateSnapshotId: () => Promise.resolve(undefined),
    ...overrides,
  };
}

describe("resolveIdempotentApply", () => {
  it("returns PROCEED when no event with this id has ever been committed", async () => {
    const repo = fakeRepo();
    const result = await resolveIdempotentApply(repo, "p1", "e1");
    expect(result).toEqual({ outcome: "PROCEED" });
  });

  it("returns REPLAYED with the reconstructed evidence when the event, its forecast, and its oversight are all found and consistent", async () => {
    const repo = fakeRepo({
      loadEventById: () => Promise.resolve(event()),
      loadForecastByModelRevision: (_projectId, modelRevision) =>
        Promise.resolve(modelRevision === 43 ? candidate() : undefined),
      loadOversightReviewByCandidateSnapshotId: (candidateId) =>
        Promise.resolve(candidateId === "candidate1" ? oversight() : undefined),
    });
    const result = await resolveIdempotentApply(repo, "p1", "e1");
    expect(result.outcome).toBe("REPLAYED");
    if (result.outcome === "REPLAYED") {
      expect(result.existingEvent.id).toBe("e1");
      expect(result.candidate.id).toBe("candidate1");
      expect(result.oversight.id).toBe("oversight1");
    }
  });

  it("looks up the forecast at baseRevision + 1, never the incoming event's own baseRevision", async () => {
    let lookedUpRevision: number | undefined;
    const repo = fakeRepo({
      loadEventById: () => Promise.resolve(event({ baseRevision: 42 })),
      loadForecastByModelRevision: (_projectId, modelRevision) => {
        lookedUpRevision = modelRevision;
        return Promise.resolve(candidate({ modelRevision }));
      },
      loadOversightReviewByCandidateSnapshotId: () =>
        Promise.resolve(oversight()),
    });
    await resolveIdempotentApply(repo, "p1", "e1");
    expect(lookedUpRevision).toBe(43);
  });

  it("returns AMBIGUOUS when the event exists but its forecast evidence is missing", async () => {
    const repo = fakeRepo({
      loadEventById: () => Promise.resolve(event()),
      loadForecastByModelRevision: () => Promise.resolve(undefined),
    });
    const result = await resolveIdempotentApply(repo, "p1", "e1");
    expect(result.outcome).toBe("AMBIGUOUS");
    if (result.outcome === "AMBIGUOUS") {
      expect(result.reason).toContain("forecast evidence");
      expect(result.reason).toContain("e1");
    }
  });

  it("returns AMBIGUOUS when the event exists but its oversight evidence is missing -- never guesses", async () => {
    const repo = fakeRepo({
      loadEventById: () => Promise.resolve(event()),
      loadForecastByModelRevision: () => Promise.resolve(candidate()),
      loadOversightReviewByCandidateSnapshotId: () =>
        Promise.resolve(undefined),
    });
    const result = await resolveIdempotentApply(repo, "p1", "e1");
    expect(result.outcome).toBe("AMBIGUOUS");
    if (result.outcome === "AMBIGUOUS") {
      expect(result.reason).toContain("oversight evidence");
    }
  });

  it("never recomputes or fabricates evidence -- REPLAYED evidence is always exactly what the repo returned", async () => {
    const storedCandidate = candidate({ id: "stored-candidate" });
    const storedOversight = oversight({
      id: "stored-oversight",
      candidateSnapshotId: "stored-candidate",
    });
    const repo = fakeRepo({
      loadEventById: () => Promise.resolve(event()),
      loadForecastByModelRevision: () => Promise.resolve(storedCandidate),
      loadOversightReviewByCandidateSnapshotId: () =>
        Promise.resolve(storedOversight),
    });
    const result = await resolveIdempotentApply(repo, "p1", "e1");
    expect(result.outcome).toBe("REPLAYED");
    if (result.outcome === "REPLAYED") {
      expect(result.candidate).toBe(storedCandidate);
      expect(result.oversight).toBe(storedOversight);
    }
  });
});
