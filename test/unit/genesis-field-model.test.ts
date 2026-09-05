import { describe, expect, it, vi } from "vitest";
import { synthesizeGenesisField } from "../../src/worker/genesis-field-model";
import {
  validateGenesisProposal,
  buildProjectFromGenesis,
} from "../../src/operator/genesis";

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

describe("synthesizeGenesisField: hedged/forecast/planning language never becomes a commitment", () => {
  const HEDGE_SENTENCES = [
    "Demo may start September 14.",
    "Demo might start September 14.",
    "Demo could start September 14.",
    "Demo should start September 14.",
    "Demo is forecast for September 14.",
    "Demo is expected to start September 14.",
    "We hope to start Demo September 14.",
    "We plan to start Demo September 14.",
    "Demo could potentially start September 14.",
  ];

  it.each(HEDGE_SENTENCES)(
    "creates no knownDate and fabricates no scope item for: %s",
    (sentence) => {
      const result = synthesizeGenesisField(
        `Create X. Scope is flooring. ${sentence}`,
        NOW,
      );
      expect(result.knownDates).toEqual([]);
      expect(result.baselineScope).toHaveLength(1);
      expect(result.baselineScope[0]?.id).toBe("flooring");
    },
  );

  it.each(HEDGE_SENTENCES)(
    "preserves the hedged statement as an assumption rather than discarding it: %s",
    (sentence) => {
      const result = synthesizeGenesisField(
        `Create X. Scope is flooring. ${sentence}`,
        NOW,
      );
      expect(result.assumptions.some((a) => a.includes("not committed"))).toBe(
        true,
      );
    },
  );

  it("still creates a COMMITTED_START for an explicit direct start statement", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts September 14.",
      NOW,
    );
    expect(result.knownDates).toContainEqual(
      expect.objectContaining({
        subjectId: "demolition",
        kind: "COMMITTED_START",
        date: "2026-09-14",
      }),
    );
  });

  it("still creates a COMMITTED_START when the canonical activity name is used directly", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demolition starts September 14.",
      NOW,
    );
    expect(result.knownDates).toContainEqual(
      expect.objectContaining({
        subjectId: "demolition",
        kind: "COMMITTED_START",
        date: "2026-09-14",
      }),
    );
  });
});

describe("synthesizeGenesisField: uncertainty words swallowed into the subject are rejected structurally (Codex bypass)", () => {
  const CODEX_BYPASS_SENTENCES = [
    "Demo probably starts September 14.",
    "Demo maybe starts September 14.",
    "Demo tentatively starts September 14.",
    "Demo likely starts September 14.",
    "Demo is supposed to start September 14.",
    "Demo was discussed to start September 14.",
  ];

  it.each(CODEX_BYPASS_SENTENCES)(
    "creates no knownDate and no phantom scope item for: %s",
    (sentence) => {
      const result = synthesizeGenesisField(
        `Create X. Scope is flooring. ${sentence}`,
        NOW,
      );
      expect(result.knownDates).toEqual([]);
      expect(result.baselineScope).toHaveLength(1);
      expect(result.baselineScope[0]?.id).toBe("flooring");
    },
  );

  it.each(CODEX_BYPASS_SENTENCES)(
    "preserves the statement as an assumption rather than discarding it: %s",
    (sentence) => {
      const result = synthesizeGenesisField(
        `Create X. Scope is flooring. ${sentence}`,
        NOW,
      );
      expect(result.assumptions.some((a) => a.includes("not committed"))).toBe(
        true,
      );
    },
  );

  it("never produces a phantom subjectId such as demo-probably", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo probably starts September 14.",
      NOW,
    );
    expect(
      result.baselineScope.some((item) => item.id.startsWith("demo-")),
    ).toBe(false);
  });
});

describe("synthesizeGenesisField: month May must never be mistaken for modal may", () => {
  it("accepts an explicit direct start statement dated in May", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts May 14.",
      NOW,
    );
    expect(result.knownDates).toContainEqual(
      expect.objectContaining({
        subjectId: "demolition",
        kind: "COMMITTED_START",
        date: "2026-05-14",
      }),
    );
  });

  it("still rejects modal 'may' even when the date itself falls in May", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo may start May 14.",
      NOW,
    );
    expect(result.knownDates).toEqual([]);
    expect(result.baselineScope).toHaveLength(1);
    expect(result.assumptions.some((a) => a.includes("not committed"))).toBe(
      true,
    );
  });
});

describe("synthesizeGenesisField: explicit-year date-shaped statements are never silently dropped", () => {
  it("leaves an unresolved review note for a start statement with a trailing explicit year", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts February 29, 2026.",
      NOW,
    );
    expect(result.knownDates).toEqual([]);
    expect(
      result.assumptions.some((a) => /could not be accepted/i.test(a)),
    ).toBe(true);
  });

  it("leaves an unresolved review note for a valid-looking date with a trailing explicit year", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts September 14, 2026.",
      NOW,
    );
    expect(result.knownDates).toEqual([]);
    expect(
      result.assumptions.some((a) => /could not be accepted/i.test(a)),
    ).toBe(true);
  });
});

describe("synthesizeGenesisField: preferredProjectId is normalized", () => {
  it.each([
    ["Smith Proj", "smith-proj"],
    ["SMITH", "smith"],
    ["a/b/c", "a-b-c"],
  ])("normalizes preferredProjectId %s to %s", (input, expected) => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      input,
    );
    expect(result.projectId).toBe(expected);
  });

  it("normalizes a path-traversal-shaped id to a plain lowercase/hyphen slug", () => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      "smith/../etc",
    );
    expect(result.projectId).toMatch(/^[a-z0-9-]+$/);
    expect(result.projectId).not.toContain("/");
    expect(result.projectId).not.toContain(".");
  });

  it("normalizes __proto__ to a safe form, never the raw reserved string", () => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      "__proto__",
    );
    expect(result.projectId).not.toBe("__proto__");
    expect(result.projectId).toMatch(/^[a-z0-9-]+$/);
  });

  it("falls back to the name-derived slug when preferredProjectId normalizes to empty", () => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      "!!!",
    );
    expect(result.projectId).toBe("smith-residence");
  });

  it("leaves identity unresolved with a missingCritical note when neither preferredProjectId nor name resolve", () => {
    const result = synthesizeGenesisField("Scope is flooring.", NOW, "!!!");
    expect(result.projectId).toBe("");
    expect(
      result.missingCritical.some((m) => /project identifier/i.test(m)),
    ).toBe(true);
  });
});

describe("synthesizeGenesisField: now must be a valid timestamp", () => {
  it("throws a clear error for a malformed now instead of returning a malformed proposal", () => {
    expect(() =>
      synthesizeGenesisField("Create X. Scope is flooring.", "not-a-date"),
    ).toThrow();
  });

  it("never emits a NaN-prefixed date because invalid now fails closed first", () => {
    expect(() =>
      synthesizeGenesisField(
        "Create X. Scope is flooring. Demo starts September 14.",
        "not-a-date",
      ),
    ).toThrow();
  });

  it("derives forecastAnchorDate from the parsed now, not raw string slicing", () => {
    const result = synthesizeGenesisField("Create X. Scope is flooring.", NOW);
    expect(result.forecastAnchorDate).toBe("2026-09-04");
  });
});

describe("synthesizeGenesisField: calendar-invalid dates are never emitted", () => {
  it("does not emit February 29 in a non-leap year, and notes it instead of discarding it", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts February 29.",
      NOW,
    );
    expect(result.knownDates).toEqual([]);
    expect(result.assumptions.some((a) => /could not/i.test(a))).toBe(true);
  });

  it("accepts February 29 in a leap year", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts February 29.",
      "2028-01-01T00:00:00.000Z",
    );
    expect(result.knownDates).toContainEqual(
      expect.objectContaining({ date: "2028-02-29" }),
    );
  });

  it("does not emit February 30", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts February 30.",
      NOW,
    );
    expect(result.knownDates).toEqual([]);
  });

  it("does not emit December 32", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is flooring. Demo starts December 32.",
      NOW,
    );
    expect(result.knownDates).toEqual([]);
  });
});

describe("synthesizeGenesisField: negative budget never flips to positive", () => {
  it("leaves budget unresolved for a negative amount instead of flipping the sign", () => {
    const result = synthesizeGenesisField(
      "Create X. Budget is -$50,000. Scope is flooring.",
      NOW,
    );
    expect(result.budget).toBeUndefined();
  });

  it("still normalizes a valid positive dollar budget", () => {
    const result = synthesizeGenesisField(
      "Create X. Budget is $50,000. Scope is flooring.",
      NOW,
    );
    expect(result.budget?.baseline).toBe(50000);
  });

  it("still normalizes a valid $400k budget", () => {
    const result = synthesizeGenesisField(
      "Create X. Budget is $400k. Scope is flooring.",
      NOW,
    );
    expect(result.budget?.baseline).toBe(400000);
  });
});

describe("synthesizeGenesisField: scope slug collisions never drop work", () => {
  it("preserves two distinct phrases that collide after slugification with unique ids", () => {
    const result = synthesizeGenesisField("Create X. Scope is a-b, a b.", NOW);
    expect(result.baselineScope).toHaveLength(2);
    const ids = result.baselineScope.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    expect(result.baselineScope.map((item) => item.label)).toEqual(
      expect.arrayContaining(["A-b", "A b"]),
    );
  });

  it("still deduplicates an exactly-repeated phrase", () => {
    const result = synthesizeGenesisField(
      "Create X. Scope is kitchen, kitchen, flooring.",
      NOW,
    );
    expect(result.baselineScope).toHaveLength(2);
  });

  it("produces a proposal that still passes validateGenesisProposal", () => {
    const result = synthesizeGenesisField("Create X. Scope is a-b, a b.", NOW);
    expect(validateGenesisProposal(result)).toEqual([]);
  });
});

describe("synthesizeGenesisField: default timezone is disclosed, never silently assumed", () => {
  it("adds an assumption naming America/New_York as a pilot default", () => {
    const result = synthesizeGenesisField("Create X. Scope is flooring.", NOW);
    expect(result.timezone).toBe("America/New_York");
    expect(
      result.assumptions.some(
        (a) => /timezone/i.test(a) && a.includes("America/New_York"),
      ),
    ).toBe(true);
  });
});

describe("synthesizeGenesisField: project type avoids substring false positives", () => {
  it("does not classify 'in addition to' idiomatic text as an addition project", () => {
    const result = synthesizeGenesisField(
      "Create X. In addition to the kitchen, we will redo flooring. Scope is flooring.",
      NOW,
    );
    expect(result.projectType).toBe("RESIDENTIAL");
  });

  it("still classifies an explicit addition project", () => {
    const result = synthesizeGenesisField(
      "Create X. This is an addition. Scope is flooring.",
      NOW,
    );
    expect(result.projectType).toBe("RESIDENTIAL_ADDITION");
  });
});

describe("synthesizeGenesisField: proposalId stays a safe, deterministic string", () => {
  it("never contains NaN or raw whitespace/colons", () => {
    const result = synthesizeGenesisField("Create X. Scope is flooring.", NOW);
    expect(result.proposalId).not.toMatch(/NaN/);
    expect(result.proposalId).not.toMatch(/\s/);
    expect(result.proposalId).not.toContain(":");
  });
});

describe("synthesizeGenesisField: full Task 1 compatibility for the Smith Residence intake", () => {
  it("passes validateGenesisProposal with zero errors and builds a canonical project", () => {
    const proposal = synthesizeGenesisField(SMITH_INTAKE, NOW);
    const errors = validateGenesisProposal(proposal);
    expect(errors).toEqual([]);
    const model = buildProjectFromGenesis(proposal, NOW);
    expect(model.name).toBe("Smith Residence");
    expect(model.projectType).toBe("RESIDENTIAL_REMODEL");
    expect(model.projectProfile?.budget?.baseline).toBe(310000);
    expect(Object.keys(model.activities)).toHaveLength(7);
    expect(model.activities.demolition).toBeDefined();
  });

  it("discloses the timezone default as an assumption for the Smith Residence intake", () => {
    const result = synthesizeGenesisField(SMITH_INTAKE, NOW);
    expect(
      result.assumptions.some(
        (a) => /timezone/i.test(a) && a.includes("America/New_York"),
      ),
    ).toBe(true);
  });
});

describe("synthesizeGenesisField: budget binds to the authoritative project-budget phrase, not the first number", () => {
  it("prefers 'total project budget is' over an unrelated allowance figure in the same sentence", () => {
    const result = synthesizeGenesisField(
      "Budget allowance is $20k, total project budget is $400k.",
      NOW,
    );
    expect(result.budget?.baseline).toBe(400000);
  });

  it("prefers 'total budget is' over an unrelated invoice figure in the same sentence", () => {
    const result = synthesizeGenesisField(
      "Invoice is $15k, total budget is $400k.",
      NOW,
    );
    expect(result.budget?.baseline).toBe(400000);
  });

  it.each([
    ["Create X. Budget is $400,000. Scope is flooring.", 400000],
    ["Create X. Budget is $400k. Scope is flooring.", 400000],
    ["Create X. 400k budget. Scope is flooring.", 400000],
    ["Create X. Budget: $310,000.50. Scope is flooring.", 310000.5],
  ])("still normalizes %s to %d", (text, expected) => {
    const result = synthesizeGenesisField(text, NOW);
    expect(result.budget?.baseline).toBe(expected);
  });

  it.each([
    "Create X. Allowance is $20k for cabinets. Scope is flooring.",
    "Create X. Invoice is $15k. Scope is flooring.",
    "Create X. 2,800sf remodel. Scope is flooring.",
  ])("never treats an unrelated dollar figure as baseline: %s", (text) => {
    const result = synthesizeGenesisField(text, NOW);
    expect(result.budget).toBeUndefined();
  });
});

describe("synthesizeGenesisField: explicit zero budget is preserved, not silently dropped", () => {
  it("preserves baseline 0 for an explicitly stated zero budget", () => {
    const result = synthesizeGenesisField(
      "Create X. Budget is $0. Scope is flooring.",
      NOW,
    );
    expect(result.budget).toEqual({ baseline: 0, currency: "USD" });
  });
});

describe("synthesizeGenesisField: Unicode scope phrases are never silently discarded", () => {
  it("preserves an unmatched Unicode phrase alongside a recognized ASCII phrase, with a safe fallback id", () => {
    const result = synthesizeGenesisField("Create X. Scope is 東京, flooring.", NOW);
    expect(result.baselineScope).toHaveLength(2);
    const labels = result.baselineScope.map((item) => item.label);
    expect(labels).toContain("東京");
    expect(labels).toContain("Flooring");
    const ids = result.baselineScope.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    expect(validateGenesisProposal(result)).toEqual([]);
  });

  it("gives distinct fallback ids to multiple Unicode-only phrases so they cannot collide", () => {
    const result = synthesizeGenesisField("Create X. Scope is 東京, 大阪.", NOW);
    expect(result.baselineScope).toHaveLength(2);
    const ids = result.baselineScope.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    const labels = result.baselineScope.map((item) => item.label);
    expect(labels).toContain("東京");
    expect(labels).toContain("大阪");
    expect(validateGenesisProposal(result)).toEqual([]);
  });

  it("builds one activity per preserved scope item via the full Task 1 pipeline", () => {
    const proposal = synthesizeGenesisField(
      "Create Unicode Test. Scope is 東京, flooring.",
      NOW,
    );
    expect(validateGenesisProposal(proposal)).toEqual([]);
    const model = buildProjectFromGenesis(proposal, NOW);
    expect(Object.keys(model.activities)).toHaveLength(2);
  });
});

describe("synthesizeGenesisField: reserved preferredProjectId values are treated as unusable", () => {
  it("falls back to the name-derived slug when preferredProjectId normalizes to 'constructor'", () => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      "constructor",
    );
    expect(result.projectId).toBe("smith-residence");
  });

  it("falls back to the name-derived slug when preferredProjectId normalizes to 'prototype'", () => {
    const result = synthesizeGenesisField(
      "Create Smith Residence. Scope is flooring.",
      NOW,
      "prototype",
    );
    expect(result.projectId).toBe("smith-residence");
  });

  it("leaves identity unresolved with a missingCritical note when a reserved id has no usable name to fall back to", () => {
    const result = synthesizeGenesisField("Scope is flooring.", NOW, "constructor");
    expect(result.projectId).toBe("");
    expect(
      result.missingCritical.some((m) => /project identifier/i.test(m)),
    ).toBe(true);
  });
});
