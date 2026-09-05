import { describe, expect, it, vi } from "vitest";
import { synthesizeGenesisField } from "../../src/worker/genesis-field-model";

const NOW = "2026-09-04T20:00:00.000Z";

const SMITH_INTAKE =
  "Create Smith Residence. 2,800sf remodel. Budget is $310k. Scope is kitchen, primary bath, flooring, windows, electrical service upgrade and HVAC modifications. Demo starts September 14. We already selected Wayland for electrical. Cabinets are still being priced.";

describe("synthesizeGenesisField: the exact pilot Smith Residence intake", () => {
  const result = synthesizeGenesisField(SMITH_INTAKE, NOW);

  it("extracts the explicit project name", () => {
    expect(result.projectName).toBe("Smith Residence");
  });

  it("recognizes the remodel project type", () => {
    expect(result.projectType).toBe("RESIDENTIAL_REMODEL");
  });

  it("normalizes the $310k budget", () => {
    expect(result.budget?.baseline).toBe(310000);
  });

  it("captures every named scope item as a baseline scope label", () => {
    expect(result.baselineScope.map((x) => x.label)).toEqual(
      expect.arrayContaining([
        "Demolition",
        "Kitchen",
        "Primary bath",
        "Flooring",
        "Windows",
        "Electrical service upgrade",
        "HVAC modifications",
      ]),
    );
  });

  it("recognizes the committed demolition start date", () => {
    expect(result.knownDates).toContainEqual(
      expect.objectContaining({
        subjectId: "demolition",
        kind: "COMMITTED_START",
        date: "2026-09-14",
      }),
    );
  });

  it("records at least one assumption", () => {
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it("flags that activity durations need PM validation", () => {
    expect(result.missingCritical).toContain(
      "Activity durations need PM validation",
    );
  });

  it("never fabricates explicit duration estimates", () => {
    for (const item of result.baselineScope) {
      expect(item.optimisticDays).toBeUndefined();
      expect(item.likelyDays).toBeUndefined();
      expect(item.conservativeDays).toBeUndefined();
    }
  });

  it("preserves the full original source text verbatim", () => {
    expect(result.sourceText).toBe(SMITH_INTAKE);
  });

  it("is a pure function with no external side effects (no fetch, no I/O)", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("synthesizeGenesisField must never perform I/O");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      synthesizeGenesisField(SMITH_INTAKE, NOW);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("synthesizeGenesisField: missing project name", () => {
  it("never invents a name and adds a clear missingCritical item instead", () => {
    const result = synthesizeGenesisField(
      "2,800sf remodel. Budget is $310k. Scope is kitchen and flooring.",
      NOW,
    );
    expect(result.projectName).toBe("");
    expect(result.missingCritical.some((m) => /project name/i.test(m))).toBe(
      true,
    );
  });
});

describe("synthesizeGenesisField: money normalization", () => {
  it.each([
    ["Create Test Project. Budget is $400,000.", 400000],
    ["Create Test Project. Budget is $400k.", 400000],
    ["Create Test Project. 400k budget.", 400000],
  ])("normalizes %s to %d", (text, expected) => {
    const result = synthesizeGenesisField(text, NOW);
    expect(result.budget?.baseline).toBe(expected);
  });
});

describe("synthesizeGenesisField: unknown scope terms", () => {
  it("preserves an unrecognized scope phrase verbatim as its own scope label instead of discarding it", () => {
    const result = synthesizeGenesisField(
      "Create Test Project. Scope is she-shed conversion and flooring.",
      NOW,
    );
    expect(result.baselineScope.map((x) => x.label)).toContain(
      "She-shed conversion",
    );
    expect(result.baselineScope.map((x) => x.label)).toContain("Flooring");
  });
});

describe("synthesizeGenesisField: trade/vendor and uncertainty statements never become commitments", () => {
  it("keeps a vendor-selection statement as an assumption, never a new subsystem/action", () => {
    const result = synthesizeGenesisField(
      "Create Test Project. Scope is electrical. We already selected Wayland for electrical.",
      NOW,
    );
    expect(result.assumptions.some((a) => /Wayland/.test(a))).toBe(true);
  });

  it("keeps an uncertain pricing statement as an assumption rather than a verified fact", () => {
    const result = synthesizeGenesisField(
      "Create Test Project. Scope is cabinet. Cabinets are still being priced.",
      NOW,
    );
    expect(result.assumptions.some((a) => /still being priced/.test(a))).toBe(
      true,
    );
    expect(result.baselineScope.every((item) => item.label !== "priced")).toBe(
      true,
    );
  });
});

describe("synthesizeGenesisField: never fabricates identity/date/budget when absent", () => {
  it("leaves projectName, budget, and knownDates empty for vague intake with none of those stated", () => {
    const result = synthesizeGenesisField(
      "We started some work on site this week.",
      NOW,
    );
    expect(result.projectName).toBe("");
    expect(result.budget).toBeUndefined();
    expect(result.knownDates).toEqual([]);
  });
});

describe("synthesizeGenesisField: preferredProjectId", () => {
  it("uses the caller-supplied preferredProjectId over a slug of the parsed name", () => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      "smith-v2",
    );
    expect(result.projectId).toBe("smith-v2");
  });
});
