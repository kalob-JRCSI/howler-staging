import { describe, expect, it } from "vitest";
import { classifySourceFreshness } from "../../src/operator/debrief";

describe("classifySourceFreshness", () => {
  it("classifies a past-tense claim as OBSERVED_CONFIRMED regardless of now", () => {
    const result = classifySourceFreshness(
      { tense: "PAST", effectiveDate: "2026-08-27" },
      "2026-09-04T00:00:00Z",
    );
    expect(result).toBe("OBSERVED_CONFIRMED");
  });

  it("classifies a DELIVERY_RECEIVED-style past-tense claim as OBSERVED_CONFIRMED regardless of now", () => {
    const before = classifySourceFreshness(
      { tense: "PAST", effectiveDate: "2026-08-27" },
      "2026-08-28T00:00:00Z",
    );
    const after = classifySourceFreshness(
      { tense: "PAST", effectiveDate: "2026-08-27" },
      "2026-12-01T00:00:00Z",
    );
    expect(before).toBe("OBSERVED_CONFIRMED");
    expect(after).toBe("OBSERVED_CONFIRMED");
  });

  it("freshness_planned_not_observed: a future-tense claim whose date has not yet passed classifies PLANNED_SCHEDULED", () => {
    const result = classifySourceFreshness(
      { tense: "FUTURE", effectiveDate: "2026-09-03" },
      "2026-09-02T00:00:00Z",
    );
    expect(result).toBe("PLANNED_SCHEDULED");
  });

  it("freshness_planned_becomes_unknown: the real Aug 31 KF dashboard Sep 3 site-meeting claim classifies UNKNOWN_OUTCOME once now passes Sep 3", () => {
    const result = classifySourceFreshness(
      { tense: "FUTURE", effectiveDate: "2026-09-03" },
      "2026-09-04T00:00:00Z",
    );
    expect(result).toBe("UNKNOWN_OUTCOME");
  });

  it("the same Sep 3 site-meeting claim classifies PLANNED_SCHEDULED before its date", () => {
    const result = classifySourceFreshness(
      { tense: "FUTURE", effectiveDate: "2026-09-03" },
      "2026-09-02T00:00:00Z",
    );
    expect(result).toBe("PLANNED_SCHEDULED");
  });

  it("a supersededBy observed claim overrides an expired planned claim regardless of the original claim's own dates", () => {
    const result = classifySourceFreshness(
      { tense: "FUTURE", effectiveDate: "2026-09-03" },
      "2026-09-04T00:00:00Z",
      { tense: "PAST", effectiveDate: "2026-09-03" },
    );
    expect(result).toBe("OBSERVED_CONFIRMED");
  });

  it("a supersededBy observed claim overrides even before the planned date has passed", () => {
    const result = classifySourceFreshness(
      { tense: "FUTURE", effectiveDate: "2026-09-03" },
      "2026-09-01T00:00:00Z",
      { tense: "PAST", effectiveDate: "2026-08-31" },
    );
    expect(result).toBe("OBSERVED_CONFIRMED");
  });
});
