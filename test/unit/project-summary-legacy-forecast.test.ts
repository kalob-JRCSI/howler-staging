import { describe, expect, it } from "vitest";
import { buildProjectSummary } from "../../src/operator/project-summary";
import type { ProjectModelV094 } from "../../src/domain/types";
import type { ProjectHealthV094 } from "../../src/worker/health";
import type { ForecastSnapshotV094 } from "../../src/engine/solver";

const model: ProjectModelV094 = {
  projectId: "legacy-deboard",
  revision: 0,
  name: "Legacy DeBoard",
  projectType: "RESIDENTIAL",
  timezone: "America/New_York",
  forecastAnchorDate: "2026-08-26",
  calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
  sources: {},
  activities: {
    foundation: {
      id: "foundation",
      name: "Foundation",
      phase: "Foundation",
      state: "IN_PROGRESS",
      duration: { optimistic: 2, likely: 3, conservative: 5, sourceIds: [] },
      constraintIds: [],
      sourceIds: [],
    },
  },
  constraints: {},
  dependencies: {},
  eventLedger: [],
};

const health: ProjectHealthV094 = {
  projectId: model.projectId,
  revision: model.revision,
  forecastVersion: 1,
  completion: null,
  meanForecastConfidence: 0.5,
  openConflicts: [],
  blockedConstraints: [],
  unverifiedHardConstraints: [],
  lowCoverage: [],
  accuracyByHorizon: [],
};

// Staging contains pre-v0.9.5 forecast snapshots that legitimately lack the later
// recoveryAnalysis field. They remain readable historical/canonical rows and must never make the
// aggregate v0.9.6 portfolio endpoint fail for every newer project.
const legacyForecast = {
  id: "legacy-f1",
  modelRevision: 0,
  projectId: model.projectId,
  version: 1,
  status: "WORKING",
  generatedAt: "2026-08-26T00:00:00.000Z",
  basedOnEventIds: [],
  basedOnSourceIds: [],
  evidenceRevision: 0,
  impactActivityIds: [],
  activityForecasts: {},
  pmActions: [],
  completion: {
    optimistic: "2026-09-01",
    likely: "2026-09-03",
    conservative: "2026-09-08",
  },
  supersededSources: [],
} as unknown as ForecastSnapshotV094;

describe("buildProjectSummary legacy forecast compatibility", () => {
  it("does not throw when an older persisted forecast has no recoveryAnalysis", () => {
    expect(() =>
      buildProjectSummary(model, legacyForecast, health),
    ).not.toThrow();

    const summary = buildProjectSummary(model, legacyForecast, health);
    expect(summary.projectId).toBe("legacy-deboard");
    expect(summary.projectName).toBe("Legacy DeBoard");
    expect(summary.projectedCompletion).toBe("2026-09-03");
  });
});
