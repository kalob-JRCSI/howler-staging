import { describe, expect, it } from "vitest";
import {
  buildFieldTestCallModel,
  fieldTestAliasesFor,
} from "../../src/worker/conversation-field-model";

function promptFor(utterance: string): string {
  return [
    "You are extracting semantic PM claims from a spoken debrief turn.",
    "Return ONLY JSON of the shape: {...}",
    "Known projects: deboard-v091",
    "Active project: (none)",
    `Utterance: ${utterance}`,
  ].join("\n");
}

describe("buildFieldTestCallModel", () => {
  it("'DeBoard masonry started today' parses to an ACTIVITY_STARTED claim with today's date", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z");
    const raw = await callModel(promptFor("DeBoard masonry started today"));
    const parsed = JSON.parse(raw) as {
      spans: {
        type: string;
        claimType?: string;
        effectiveDate?: string;
        subjectText?: string;
      }[];
    };
    expect(parsed.spans).toHaveLength(1);
    expect(parsed.spans[0]?.type).toBe("CLAIM");
    expect(parsed.spans[0]?.claimType).toBe("ACTIVITY_STARTED");
    expect(parsed.spans[0]?.effectiveDate).toBe("2026-09-03");
    expect(parsed.spans[0]?.subjectText?.toLowerCase()).toContain("masonry");
  });

  it("a literal ISO date in the utterance is used verbatim over 'today'", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z");
    const raw = await callModel(promptFor("masonry started 2026-08-28"));
    const parsed = JSON.parse(raw) as { spans: { effectiveDate?: string }[] };
    expect(parsed.spans[0]?.effectiveDate).toBe("2026-08-28");
  });

  it("an utterance with no recognized verb clarifies rather than guessing a claim", async () => {
    const callModel = buildFieldTestCallModel();
    const raw = await callModel(promptFor("the weather is nice today"));
    const parsed = JSON.parse(raw) as { spans: { type: string }[] };
    expect(parsed.spans).toHaveLength(1);
    expect(parsed.spans[0]?.type).toBe("CLARIFICATION");
  });

  it("a blank utterance clarifies rather than fabricating a claim", async () => {
    const callModel = buildFieldTestCallModel();
    const raw = await callModel(promptFor(""));
    const parsed = JSON.parse(raw) as { spans: { type: string }[] };
    expect(parsed.spans[0]?.type).toBe("CLARIFICATION");
  });
});

// Safety repair blocker 5: conservative expansion of the deterministic field interpreter --
// FACT (already covered above), COMMITMENT, UNKNOWN/UNCERTAIN, and CORRECTION (already handled
// entirely upstream by routeConversationalTurn's own regex pre-routing, untouched here) must stay
// distinct. A scheduled/expected utterance must never be classified as a FACT claim type
// (ACTIVITY_STARTED/ACTIVITY_COMPLETED/etc.) -- CLASSIFY in claim-compiler.ts is the single place
// that turns a claimType into FACT vs COMMITMENT vs null, so the interpreter's only job is to pick
// the *correct* claimType; these tests pin that choice.
describe("buildFieldTestCallModel: COMMITMENT language never becomes a FACT claim type", () => {
  const FACT_CLAIM_TYPES = new Set([
    "ACTIVITY_STARTED",
    "ACTIVITY_COMPLETED",
    "ITEM_COMPLETED",
    "DELIVERY_RECEIVED",
    "INSPECTION_COMPLETED",
    "CONDITION_OBSERVED",
  ]);
  const COMMITMENT_CLAIM_TYPES = new Set([
    "SCHEDULE_CHANGED",
    "DELIVERY_EXPECTED",
    "TRADE_ATTENDANCE_PLANNED",
    "WORK_REQUESTED",
    "DECISION_EXPECTED",
  ]);

  it("'Jason is coming Monday.' is a COMMITMENT claim, never a FACT, with a real future date", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z"); // a Thursday
    const raw = await callModel(promptFor("Jason is coming Monday."));
    const parsed = JSON.parse(raw) as {
      spans: {
        type: string;
        claimType?: string;
        effectiveDate?: string;
        subjectText?: string;
      }[];
    };
    expect(parsed.spans).toHaveLength(1);
    const span = parsed.spans[0];
    expect(span?.type).toBe("CLAIM");
    expect(span?.claimType).toBeDefined();
    expect(FACT_CLAIM_TYPES.has(span?.claimType ?? "")).toBe(false);
    expect(COMMITMENT_CLAIM_TYPES.has(span?.claimType ?? "")).toBe(true);
    // 2026-09-03 is a Thursday; the next Monday is 2026-09-07 -- never today, never in the past.
    expect(span?.effectiveDate).toBe("2026-09-07");
  });

  it("'Sam expects to backfill Friday.' is a COMMITMENT claim naming the real scope item, never a completed fact", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z"); // a Thursday
    const raw = await callModel(promptFor("Sam expects to backfill Friday."));
    const parsed = JSON.parse(raw) as {
      spans: {
        type: string;
        claimType?: string;
        effectiveDate?: string;
        subjectText?: string;
      }[];
    };
    expect(parsed.spans).toHaveLength(1);
    const span = parsed.spans[0];
    expect(FACT_CLAIM_TYPES.has(span?.claimType ?? "")).toBe(false);
    expect(COMMITMENT_CLAIM_TYPES.has(span?.claimType ?? "")).toBe(true);
    expect(span?.subjectText?.toLowerCase()).toContain("backfill");
    // 2026-09-03 is a Thursday; the next Friday is 2026-09-04 -- never today, never in the past.
    expect(span?.effectiveDate).toBe("2026-09-04");
  });
});

describe("buildFieldTestCallModel: uncertainty stays unresolved, never a fabricated date or fact", () => {
  const NON_MUTATING_CLAIM_TYPES = new Set([
    "DECISION_UNRESOLVED",
    "CONSTRAINT_UNRESOLVED",
  ]);

  it("'I'm not sure when Medina will be there.' produces a non-mutating unresolved claim, not a clarification-by-failure and not a fact", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z");
    const raw = await callModel(
      promptFor("I'm not sure when Medina will be there."),
    );
    const parsed = JSON.parse(raw) as {
      spans: { type: string; claimType?: string; effectiveDate?: string }[];
    };
    expect(parsed.spans).toHaveLength(1);
    const span = parsed.spans[0];
    expect(span?.type).toBe("CLAIM");
    expect(NON_MUTATING_CLAIM_TYPES.has(span?.claimType ?? "")).toBe(true);
    expect(span?.effectiveDate).toBeUndefined();
  });

  it("'We don't have that date yet.' produces a non-mutating unresolved claim, never a fabricated date", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z");
    const raw = await callModel(promptFor("We don't have that date yet."));
    const parsed = JSON.parse(raw) as {
      spans: { type: string; claimType?: string; effectiveDate?: string }[];
    };
    expect(parsed.spans).toHaveLength(1);
    const span = parsed.spans[0];
    expect(NON_MUTATING_CLAIM_TYPES.has(span?.claimType ?? "")).toBe(true);
    expect(span?.effectiveDate).toBeUndefined();
  });
});

describe("buildFieldTestCallModel: existing FACT recognition is unchanged by the expansion", () => {
  it("'Foundation walls started today.' is still ACTIVITY_STARTED with today's date", async () => {
    const callModel = buildFieldTestCallModel(() => "2026-09-03T12:00:00.000Z");
    const raw = await callModel(promptFor("Foundation walls started today."));
    const parsed = JSON.parse(raw) as {
      spans: { claimType?: string; effectiveDate?: string }[];
    };
    expect(parsed.spans[0]?.claimType).toBe("ACTIVITY_STARTED");
    expect(parsed.spans[0]?.effectiveDate).toBe("2026-09-03");
  });
});

describe("fieldTestAliasesFor", () => {
  it("derives a short alias from a versioned project id", () => {
    const aliases = fieldTestAliasesFor(["deboard-v091"]);
    expect(aliases).toEqual([{ alias: "deboard", projectId: "deboard-v091" }]);
  });

  it("omits an alias identical to the id itself", () => {
    const aliases = fieldTestAliasesFor(["carver"]);
    expect(aliases).toEqual([]);
  });
});
