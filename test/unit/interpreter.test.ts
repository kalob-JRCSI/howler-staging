import { describe, expect, it } from "vitest";
import { interpretTurn } from "../../src/operator/interpreter";
import { createSession } from "../../src/operator/conversation";
import { assertNoForbiddenClaimFields } from "../../src/operator/conversation";

function fakeCallModel(response: unknown): (prompt: string) => Promise<string> {
  return () => Promise.resolve(JSON.stringify(response));
}

describe("interpretTurn", () => {
  it("interpret_single_claim: one simple semantic claim", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
        },
      ],
    });
    const result = await interpretTurn(
      "masonry started Friday",
      session,
      callModel,
    );
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.claimType).toBe("ACTIVITY_STARTED");
    expect(result.clarifications).toHaveLength(0);
  });

  it("interpret_two_claims: two independent facts in one utterance", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "block",
          subjectText: "second block",
          claimType: "DELIVERY_RECEIVED",
          effectiveDate: "2026-09-01",
          certainty: "STATED",
        },
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "jason",
          subjectText: "Jason's rough-in",
          claimType: "SCHEDULE_CHANGED",
          effectiveDate: "2026-09-03",
          certainty: "STATED",
        },
      ],
    });
    const result = await interpretTurn(
      "second block came Monday and Jason moved to Wednesday",
      session,
      callModel,
    );
    expect(result.claims).toHaveLength(2);
    expect(result.clarifications).toHaveLength(0);
    expect(result.claims.map((c) => c.claimType)).toEqual([
      "DELIVERY_RECEIVED",
      "SCHEDULE_CHANGED",
    ]);
  });

  it("interpret_mixed_ambiguity: one valid + one ambiguous fact in the same utterance yields one claim and one Clarification, independently", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "block",
          subjectText: "second block",
          claimType: "DELIVERY_RECEIVED",
          effectiveDate: "2026-09-01",
          certainty: "STATED",
        },
        {
          type: "CLARIFICATION",
          message: "Did Jason's work happen, or is that when it's now planned?",
        },
      ],
    });
    const result = await interpretTurn(
      "second block came Monday and Jason moved to Wednesday",
      session,
      callModel,
    );
    expect(result.claims).toHaveLength(1);
    expect(result.clarifications).toHaveLength(1);
  });

  it("ambiguous_tense_clarifies_not_fact: ambiguous 'Jason moved Wednesday' with no disambiguating context clarifies, never defaults to FACT", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLARIFICATION",
          message: "Did that happen, or is that when it's now planned?",
        },
      ],
    });
    const result = await interpretTurn("Jason moved Wednesday", session, callModel);
    expect(result.claims).toHaveLength(0);
    expect(result.clarifications).toHaveLength(1);
  });

  it("interpreter_output_has_no_mutation_op: a forbidden mutationOp key never survives into the returned claims", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
          mutationOp: "SET_ACTUAL_START",
        },
      ],
    });
    const result = await interpretTurn("masonry started Friday", session, callModel);
    expect(result.claims).toHaveLength(1);
    expect("mutationOp" in (result.claims[0] as unknown as Record<string, unknown>)).toBe(
      false,
    );
    expect(() => {
      assertNoForbiddenClaimFields(result.claims[0]);
    }).not.toThrow();
  });

  it("interpreter_output_has_no_verification: a forbidden verification key never survives into the returned claims", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "ACTIVITY_STARTED",
          effectiveDate: "2026-08-28",
          certainty: "STATED",
          verification: "PM_CONFIRMED",
        },
      ],
    });
    const result = await interpretTurn("masonry started Friday", session, callModel);
    expect(
      "verification" in (result.claims[0] as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it("interpreter_output_has_no_mutation_class: a forbidden mutationClass key never survives into the returned claims", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({
      spans: [
        {
          type: "CLAIM",
          projectRef: "deboard",
          subjectRef: "masonry",
          subjectText: "masonry",
          claimType: "SCHEDULE_CHANGED",
          effectiveDate: "2026-09-02",
          certainty: "STATED",
          mutationClass: "FACT",
        },
      ],
    });
    const result = await interpretTurn("masonry moved Wednesday", session, callModel);
    expect(
      "mutationClass" in (result.claims[0] as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it("a totally unparseable model response fails closed to a single Clarification, never a fabricated claim", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = () => Promise.resolve("not json at all {{{");
    const result = await interpretTurn("garbled input", session, callModel);
    expect(result.claims).toHaveLength(0);
    expect(result.clarifications.length).toBeGreaterThan(0);
  });
});

describe("interpretTurn timing", () => {
  it("reports exactly one timing sample per call when recordTiming is provided", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({ spans: [] });
    const samples: { stage: string; durationMs: number }[] = [];
    let tick = 1000;
    const clock = () => (tick += 25);
    await interpretTurn(
      "masonry started Friday",
      session,
      callModel,
      { projectIds: [], aliases: [] },
      "2026-09-03T08:00:00.000Z",
      (sample) => samples.push(sample),
      clock,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.stage).toBe("interpretTurn");
    expect(samples[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports no samples when recordTiming is omitted (the default, every existing call site)", async () => {
    const session = createSession("2026-09-03T08:00:00.000Z");
    const callModel = fakeCallModel({ spans: [] });
    // No recordTiming argument at all — must behave exactly as before, no throw, no timing.
    const result = await interpretTurn("masonry started Friday", session, callModel);
    expect(result.claims).toEqual([]);
  });
});
