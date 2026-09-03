import { describe, expect, it } from "vitest";
import {
  PILOT_PROJECTS,
  buildPilotSeedProject,
} from "../../scripts/pilot-seed";
import { validateProjectModel } from "../../src/domain/validation";
import { forecastInitial } from "../../src/engine/engine";

describe("pilot seed: minimum deterministic 6-project pilot fixture", () => {
  it("names exactly the 6 non-DeBoard pilot projects, deboard-v091 excluded (it has its own real seed)", () => {
    const ids = PILOT_PROJECTS.map((p) => p.projectId);
    expect(ids).toHaveLength(6);
    expect(ids).not.toContain("deboard-v091");
    expect(new Set(ids).size).toBe(6);
  });

  it.each(PILOT_PROJECTS)(
    "$displayName: builds a project model that passes validateProjectModel and forecastInitial",
    (def) => {
      const model = buildPilotSeedProject(def);
      expect(model.projectId).toBe(def.projectId);
      expect(() => {
        validateProjectModel(model);
      }).not.toThrow();
      const run = forecastInitial(model, "2026-09-03T12:00:00.000Z", 1);
      expect(run.candidate).toBeDefined();
      expect(run.oversight).toBeDefined();
    },
  );

  it.each(PILOT_PROJECTS)(
    "$displayName: preserves FACT vs COMMITMENT/EXPECTED vs UNKNOWN vs BLOCKER/RISK as distinct, never conflated",
    (def) => {
      const model = buildPilotSeedProject(def);

      // FACT: a real completed, verified observation.
      const fact = model.activities.mobilization;
      expect(fact?.state).toBe("COMPLETE");
      expect(fact?.actualFinishVerification).toBe("PM_CONFIRMED");

      // COMMITMENT/EXPECTED: a real readiness window, never an actual.
      const committed = model.constraints["committed-readiness"];
      expect(committed?.readiness).toBeDefined();
      expect(model.activities["committed-phase"]?.state).toBe("NOT_STARTED");

      // UNKNOWN: no readiness window at all -- genuinely unresolved, not guessed.
      const unresolved = model.constraints["unresolved-readiness"];
      expect(unresolved?.readiness).toBeUndefined();
      expect(unresolved?.verification).toBe("UNVERIFIED");

      // BLOCKER/RISK + NEXT ACTION: an open conflict naming the concrete next step.
      const risk = model.conflicts?.["pilot-onboarding-gap"];
      expect(risk?.status).toBe("OPEN");
      expect(risk?.description).toContain("Next action");
    },
  );

  it("each project's placeholder conflict names its own import route as the next action, never another project's", () => {
    for (const def of PILOT_PROJECTS) {
      const model = buildPilotSeedProject(def);
      const risk = model.conflicts?.["pilot-onboarding-gap"];
      expect(risk?.description).toContain(
        `/v1/projects/${def.projectId}/import`,
      );
    }
  });
});
