/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { createDeboardSeed } from "../../src/worker/deboard-seed";
import { validateUnderstandingProposal } from "../../src/worker/understanding";
import type { UnderstandingProposalInputV094 } from "../../src/worker/understanding";
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
  if (!entry) {
    throw new Error(`missing fixture ${fileName}`);
  }
  return JSON.parse(entry[1]);
}

describe("createDeboardSeed: golden parity", () => {
  it("matches the golden seed project exactly", () => {
    const seedFixture = fixture("deboard-seed.json") as {
      response: { body: { project: ProjectModelV094 } };
    };
    expect(createDeboardSeed()).toEqual(seedFixture.response.body.project);
  });
});

describe("validateUnderstandingProposal", () => {
  function proposal(
    overrides: Partial<UnderstandingProposalInputV094> = {},
  ): UnderstandingProposalInputV094 {
    return {
      eventId: "e1",
      baseRevision: 0,
      projectId: "p1",
      eventType: "FIELD_UPDATE",
      occurredAt: "2026-08-26T12:00:00Z",
      receivedAt: "2026-08-26T12:00:00Z",
      sourceIds: ["s1"],
      verification: "PM_CONFIRMED",
      impactSeedActivityIds: ["a1"],
      mutations: [{ op: "CLEAR_SCHEDULE_LOCK", activityId: "a1" }],
      ...overrides,
    };
  }

  it("accepts a well-formed proposal and returns the constructed event", () => {
    const result = validateUnderstandingProposal(proposal());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    if (result.valid) {
      expect(result.event).toEqual({
        id: "e1",
        baseRevision: 0,
        projectId: "p1",
        type: "FIELD_UPDATE",
        occurredAt: "2026-08-26T12:00:00Z",
        receivedAt: "2026-08-26T12:00:00Z",
        sourceIds: ["s1"],
        verification: "PM_CONFIRMED",
        impactSeedActivityIds: ["a1"],
        mutations: [{ op: "CLEAR_SCHEDULE_LOCK", activityId: "a1" }],
        payload: {},
      });
    }
  });

  it("requires eventId", () => {
    const result = validateUnderstandingProposal(proposal({ eventId: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("eventId is required");
  });

  it("requires an integer baseRevision >= 0", () => {
    const result = validateUnderstandingProposal(
      proposal({ baseRevision: -1 }),
    );
    expect(result.errors).toContain("baseRevision must be an integer >= 0");
  });

  it("requires projectId", () => {
    const result = validateUnderstandingProposal(proposal({ projectId: "" }));
    expect(result.errors).toContain("projectId is required");
  });

  it("requires a valid occurredAt timestamp", () => {
    const result = validateUnderstandingProposal(
      proposal({ occurredAt: "not-a-timestamp" }),
    );
    expect(result.errors).toContain("occurredAt must be an ISO timestamp");
  });

  it("requires a valid receivedAt timestamp", () => {
    const result = validateUnderstandingProposal(
      proposal({ receivedAt: "not-a-timestamp" }),
    );
    expect(result.errors).toContain("receivedAt must be an ISO timestamp");
  });

  it("warns (but does not error) when no source IDs are supplied", () => {
    const result = validateUnderstandingProposal(proposal({ sourceIds: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      "No evidence source IDs were supplied; confidence should be low until evidence is attached",
    );
  });

  it("warns (but does not error) when no mutations are supplied", () => {
    const result = validateUnderstandingProposal(proposal({ mutations: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      "Proposal contains no typed mutations; it will be audit-only and cannot alter the forecast",
    );
  });

  it("requires VERIFIED_ACTUAL verification for ACTUAL_START events", () => {
    const result = validateUnderstandingProposal(
      proposal({ eventType: "ACTUAL_START", verification: "PM_CONFIRMED" }),
    );
    expect(result.errors).toContain(
      "Actual start/finish events require VERIFIED_ACTUAL verification",
    );
  });

  it("requires VERIFIED_ACTUAL verification for ACTUAL_FINISH events", () => {
    const result = validateUnderstandingProposal(
      proposal({ eventType: "ACTUAL_FINISH", verification: "PM_CONFIRMED" }),
    );
    expect(result.errors).toContain(
      "Actual start/finish events require VERIFIED_ACTUAL verification",
    );
  });

  it("accepts an ACTUAL_START event with VERIFIED_ACTUAL verification", () => {
    const result = validateUnderstandingProposal(
      proposal({ eventType: "ACTUAL_START", verification: "VERIFIED_ACTUAL" }),
    );
    expect(result.valid).toBe(true);
  });

  it("does not apply the VERIFIED_ACTUAL rule to other event types", () => {
    const result = validateUnderstandingProposal(
      proposal({ eventType: "FIELD_UPDATE", verification: "UNVERIFIED" }),
    );
    expect(result.errors).not.toContain(
      "Actual start/finish events require VERIFIED_ACTUAL verification",
    );
  });

  it("requires a causeCode when causeVerification is VERIFIED", () => {
    const result = validateUnderstandingProposal(
      proposal({ causeVerification: "VERIFIED" }),
    );
    expect(result.errors).toContain("Verified cause requires a causeCode");
  });

  it("accepts a VERIFIED cause when causeCode is present, and carries both through to the event", () => {
    const result = validateUnderstandingProposal(
      proposal({ causeVerification: "VERIFIED", causeCode: "root-cause-1" }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.event.causeCode).toBe("root-cause-1");
      expect(result.event.causeVerification).toBe("VERIFIED");
    }
  });

  it("carries extractedFacts through as the event payload", () => {
    const result = validateUnderstandingProposal(
      proposal({ extractedFacts: { key: "value" } }),
    );
    if (result.valid) {
      expect(result.event.payload).toEqual({ key: "value" });
    } else {
      expect.fail("expected a valid result");
    }
  });

  it("omits the note field entirely when not supplied", () => {
    const result = validateUnderstandingProposal(proposal());
    if (result.valid) {
      expect(result.event.note).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(result.event, "note")).toBe(
        false,
      );
    } else {
      expect.fail("expected a valid result");
    }
  });

  it("accumulates multiple errors at once rather than stopping at the first", () => {
    const result = validateUnderstandingProposal(
      proposal({ eventId: "", projectId: "", baseRevision: -1 }),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "eventId is required",
        "baseRevision must be an integer >= 0",
        "projectId is required",
      ]),
    );
    expect(result.errors).toHaveLength(3);
  });
});
