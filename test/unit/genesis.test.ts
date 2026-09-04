import { describe, expect, it } from "vitest";
import {
  buildProjectFromGenesis,
  validateGenesisProposal,
  type GenesisProposalV096,
} from "../../src/operator/genesis";
import { validateProjectModel } from "../../src/domain/validation";

function proposal(): GenesisProposalV096 {
  return {
    schemaVersion: "0.9.6",
    proposalId: "genesis-smith-1",
    projectId: "smith-residence",
    projectName: "Smith Residence",
    projectType: "RESIDENTIAL_REMODEL",
    timezone: "America/New_York",
    forecastAnchorDate: "2026-09-14",
    sourceText:
      "Smith Residence remodel. Budget $310,000. Kitchen, primary bath, flooring and windows. Demo starts September 14.",
    baselineScope: [
      { id: "demo", label: "Demolition", phase: "Demolition" },
      { id: "kitchen", label: "Kitchen", phase: "Interior" },
      { id: "primary-bath", label: "Primary bath", phase: "Interior" },
      { id: "flooring", label: "Flooring", phase: "Finishes" },
      { id: "windows", label: "Windows", phase: "Envelope" },
    ],
    knownDates: [
      {
        subjectId: "demo",
        kind: "COMMITTED_START",
        date: "2026-09-14",
        label: "Demo start",
      },
    ],
    budget: { baseline: 310000, currency: "USD" },
    assumptions: [
      "Unspecified activity durations use pilot baseline estimates and require PM review.",
    ],
    risks: [],
    missingCritical: [],
  };
}

describe("Project Genesis canonical builder", () => {
  it("builds a valid canonical project without hand-authored ProjectModel JSON", () => {
    const model = buildProjectFromGenesis(
      proposal(),
      "2026-09-04T20:00:00.000Z",
    );
    expect(() => {
      validateProjectModel(model);
    }).not.toThrow();
    expect(model.projectProfile?.baselineScope.map((x) => x.label)).toContain(
      "Kitchen",
    );
    expect(model.projectProfile?.budget?.baseline).toBe(310000);
    expect(model.activities.demo?.scheduleLock?.startDate).toBe("2026-09-14");
  });

  it("keeps baseline scope in the canonical profile and activities instead of replacing it with free-form notes", () => {
    const model = buildProjectFromGenesis(
      proposal(),
      "2026-09-04T20:00:00.000Z",
    );
    expect(model.projectProfile?.baselineScope).toHaveLength(5);
    expect(Object.keys(model.activities)).toEqual(
      expect.arrayContaining([
        "demo",
        "kitchen",
        "primary-bath",
        "flooring",
        "windows",
      ]),
    );
  });

  it("returns validation errors instead of building when project identity or scope is missing", () => {
    const broken = { ...proposal(), projectName: "", baselineScope: [] };
    expect(validateGenesisProposal(broken)).toEqual(
      expect.arrayContaining([
        "projectName is required",
        "baselineScope must contain at least one work item",
      ]),
    );
  });
});
