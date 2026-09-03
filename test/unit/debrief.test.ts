import { describe, expect, it } from "vitest";
import {
  buildDebriefItems,
  classifySourceFreshness,
  prioritizeDebriefItems,
} from "../../src/operator/debrief";
import { forecastInitial } from "../../src/engine/engine";
import type { ProjectModelV094 } from "../../src/domain/types";

const fixtureSources = import.meta.glob<string>("../fixtures/v094/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
});
function fixture(fileName: string): unknown {
  const entry = Object.entries(fixtureSources).find(([modulePath]) =>
    modulePath.endsWith(`/${fileName}`),
  );
  if (!entry) throw new Error(`missing fixture ${fileName}`);
  return JSON.parse(entry[1]);
}

const GENERATED_AT = "2026-08-27T12:00:00.000Z";

function deboardModel(): ProjectModelV094 {
  const seedFixture = fixture("deboard-seed.json") as {
    response: { body: { project: ProjectModelV094 } };
  };
  return seedFixture.response.body.project;
}

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

describe("buildDebriefItems", () => {
  it("derives DebriefItems from the real DeBoard seed's actual oversight findings, no new fetch/D1 read", () => {
    const model = deboardModel();
    const initial = forecastInitial(model, GENERATED_AT, 1);

    const items = buildDebriefItems(
      [model],
      [initial.oversight],
      [],
      [],
      "2026-08-30T00:00:00.000Z",
    );

    const bySubject = new Map(items.map((item) => [item.subject, item]));
    const material = bySubject.get(
      "Correct CMU/block package on site and verified",
    );
    const trade = bySubject.get(
      "Masonry crew mobilization after stale Aug 24 target",
    );
    expect(material).toBeDefined();
    expect(trade).toBeDefined();
    expect(material?.category).toBe("MATERIAL_MOVEMENT");
    expect(trade?.category).toBe("TRADE_MOVEMENT");
    expect(material?.projectId).toBe("deboard-v091");
    expect(material?.supportingRefs).toContain("masonry");
    expect(material?.status).toBe("OPEN");
  });

  it("masonry-material and masonry-trade land in the same inner priority group (same project, same activity)", () => {
    const model = deboardModel();
    const initial = forecastInitial(model, GENERATED_AT, 1);
    const items = buildDebriefItems(
      [model],
      [initial.oversight],
      [],
      [],
      "2026-08-30T00:00:00.000Z",
    );
    const groups = prioritizeDebriefItems(items);
    const groupWithBoth = groups.find(
      (group) =>
        group.some((i) => i.subject.includes("CMU/block package")) &&
        group.some((i) => i.subject.includes("crew mobilization")),
    );
    expect(groupWithBoth).toBeDefined();
  });

  it("prioritizes items into the required 8-category priority order", () => {
    const items = [
      makeItem({ category: "HOUSEKEEPING" }),
      makeItem({ category: "BLOCKING_TODAY" }),
      makeItem({ category: "STALE_DATE" }),
      makeItem({ category: "CLIENT_DECISION" }),
    ];
    const groups = prioritizeDebriefItems(items);
    const flatCategories = groups.flat().map((i) => i.category);
    expect(flatCategories).toEqual([
      "BLOCKING_TODAY",
      "CLIENT_DECISION",
      "STALE_DATE",
      "HOUSEKEEPING",
    ]);
  });

  it("is pure — same input, same output, no side effects", () => {
    const model = deboardModel();
    const initial = forecastInitial(model, GENERATED_AT, 1);
    const first = buildDebriefItems(
      [model],
      [initial.oversight],
      [],
      [],
      "2026-08-30T00:00:00.000Z",
    );
    const second = buildDebriefItems(
      [model],
      [initial.oversight],
      [],
      [],
      "2026-08-30T00:00:00.000Z",
    );
    expect(second).toEqual(first);
  });

  it("expired_decision_expected_is_unknown_outcome: an applied DECISION_EXPECTED commitment whose readiness.likely date has passed with no superseding claim surfaces as CLIENT_DECISION/UNKNOWN", () => {
    const model = deboardModel();
    const withDecision: ProjectModelV094 = {
      ...model,
      sources: {
        ...model.sources,
        "src-voice-decision-expected": {
          id: "src-voice-decision-expected",
          type: "VOICE_CONVERSATION",
          label: 'Voice conversation: "the carpet decision is due Sep 4"',
          observedAt: GENERATED_AT,
          authority: 0.9,
          reliability: 0.9,
        },
      },
      activities: {
        ...model.activities,
        flooring: model.activities.flooring ?? {
          id: "flooring",
          name: "Flooring install",
          phase: "Finishes",
          state: "NOT_STARTED",
          duration: {
            optimistic: 1,
            likely: 2,
            conservative: 3,
            sourceIds: [],
          },
          constraintIds: ["carpet-decision"],
          sourceIds: [],
        },
      },
      constraints: {
        ...model.constraints,
        "carpet-decision": {
          id: "carpet-decision",
          activityId: "flooring",
          type: "DECISION",
          label: "Client carpet selection decision",
          state: "UNVERIFIED",
          hard: false,
          readiness: {
            optimistic: "2026-09-04",
            likely: "2026-09-04",
            conservative: "2026-09-04",
          },
          sourceIds: ["src-voice-decision-expected"],
          verification: "PM_CONFIRMED",
        },
      },
    };
    const initial = forecastInitial(withDecision, GENERATED_AT, 1);
    const items = buildDebriefItems(
      [withDecision],
      [initial.oversight],
      [],
      [],
      "2026-09-05T00:00:00.000Z", // after the Sep 4 due date
    );
    const decisionItem = items.find((i) => i.subject.includes("carpet"));
    expect(decisionItem).toBeDefined();
    expect(decisionItem?.category).toBe("CLIENT_DECISION");
    expect(decisionItem?.status).toBe("UNKNOWN");
  });
});

function makeItem(
  overrides: Partial<import("../../src/operator/debrief").DebriefItem> = {},
): import("../../src/operator/debrief").DebriefItem {
  return {
    itemId: "item-1",
    projectId: "p1",
    category: "HOUSEKEEPING",
    subject: "subject",
    source: "src-1",
    severity: "INFO",
    status: "OPEN",
    question: "?",
    supportingRefs: [],
    ...overrides,
  };
}
