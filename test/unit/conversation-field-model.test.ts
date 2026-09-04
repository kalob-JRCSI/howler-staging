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
