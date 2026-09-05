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

// Independent review (Codex) findings on f2cc751 -- every case below reproduces a proposal that
// previously passed validateGenesisProposal despite building (or being able to build) a project
// that violates a canonical invariant validateProjectModel enforces separately.
describe("Project Genesis canonical builder: adversarial review findings", () => {
  it("rejects a zero-day duration instead of silently building an invalid activity", () => {
    const broken = proposal();
    broken.baselineScope = [
      {
        id: "demo",
        label: "Demolition",
        phase: "Demolition",
        optimisticDays: 0,
      },
    ];
    broken.knownDates = [];
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining("optimistic duration must be an integer >= 1"),
    );
    expect(() =>
      buildProjectFromGenesis(broken, "2026-09-04T20:00:00.000Z"),
    ).toThrow();
  });

  it("rejects out-of-order duration estimates (conservative less than optimistic)", () => {
    const broken = proposal();
    broken.baselineScope = [
      {
        id: "demo",
        label: "Demolition",
        phase: "Demolition",
        optimisticDays: 7,
        likelyDays: 4,
        conservativeDays: 2,
      },
    ];
    broken.knownDates = [];
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining(
        "duration estimates must satisfy optimistic <= likely <= conservative",
      ),
    );
    expect(() =>
      buildProjectFromGenesis(broken, "2026-09-04T20:00:00.000Z"),
    ).toThrow();
  });

  it("rejects a human-readable forecastAnchorDate instead of accepting it via loose Date.parse", () => {
    const broken = { ...proposal(), forecastAnchorDate: "September 14, 2026" };
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining("forecastAnchorDate must be a valid date"),
    );
  });

  it("rejects an invalid calendar date (2026-02-30) for forecastAnchorDate", () => {
    const broken = { ...proposal(), forecastAnchorDate: "2026-02-30" };
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining("forecastAnchorDate must be a valid date"),
    );
  });

  it("rejects an invalid calendar date on a knownDates entry", () => {
    const broken = proposal();
    broken.knownDates = [
      {
        subjectId: "demo",
        kind: "COMMITTED_START",
        date: "2026-02-30",
        label: "Demo start",
      },
    ];
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining("has an invalid date"),
    );
  });

  it("rejects a duplicate COMMITTED_START for the same subject instead of letting the last one silently win", () => {
    const broken = proposal();
    broken.knownDates = [
      {
        subjectId: "demo",
        kind: "COMMITTED_START",
        date: "2026-09-14",
        label: "Demo start",
      },
      {
        subjectId: "demo",
        kind: "COMMITTED_START",
        date: "2026-09-20",
        label: "Demo start (revised)",
      },
    ];
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining("more than one COMMITTED_START for demo"),
    );
  });

  it("rejects a committed finish before its committed start for the same subject", () => {
    const broken = proposal();
    broken.knownDates = [
      {
        subjectId: "demo",
        kind: "COMMITTED_START",
        date: "2026-10-01",
        label: "Demo start",
      },
      {
        subjectId: "demo",
        kind: "COMMITTED_FINISH",
        date: "2026-09-01",
        label: "Demo finish",
      },
    ];
    expect(validateGenesisProposal(broken)).toContainEqual(
      expect.stringContaining("committed finish before its committed start"),
    );
    expect(() =>
      buildProjectFromGenesis(broken, "2026-09-04T20:00:00.000Z"),
    ).toThrow();
  });

  it("rejects a __proto__ scope item id rather than silently corrupting the built activities object", () => {
    const broken = proposal();
    broken.baselineScope = [
      { id: "__proto__", label: "Demolition", phase: "Demolition" },
    ];
    broken.knownDates = [];
    const errors = validateGenesisProposal(broken);
    expect(errors).toContainEqual(
      expect.stringContaining(
        "baselineScope item id is not allowed: __proto__",
      ),
    );
    expect(() =>
      buildProjectFromGenesis(broken, "2026-09-04T20:00:00.000Z"),
    ).toThrow();
  });

  it("rejects a mismatched schemaVersion at the runtime boundary", () => {
    const broken = {
      ...proposal(),
      schemaVersion: "0.9.5",
    } as unknown as GenesisProposalV096;
    expect(validateGenesisProposal(broken)).toContainEqual(
      'schemaVersion must be "0.9.6"',
    );
  });

  it("rejects a human-readable genesisApprovedAt at the canonical model layer", () => {
    const model = buildProjectFromGenesis(
      proposal(),
      "2026-09-04T20:00:00.000Z",
    );
    if (model.projectProfile) {
      model.projectProfile.genesisApprovedAt = "September 4, 2026";
    }
    expect(() => {
      validateProjectModel(model);
    }).toThrow(/genesisApprovedAt must be a valid ISO date-time/);
  });
});
