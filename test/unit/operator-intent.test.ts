import { describe, expect, it } from "vitest";
import {
  REQUIRED_EFFECT_BY_KIND,
  validateIntent,
} from "../../src/operator/intent";
import type {
  IntentKind,
  IntentV1,
  ProjectEventInput,
} from "../../src/operator/intent";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const SUBMITTED_AT = "2026-08-29T12:00:00.000Z";

const QUERY_KINDS: IntentKind[] = [
  "FORECAST_QUERY",
  "FORECAST_HEALTH_QUERY",
  "RECOVERY_QUERY",
];

function validEvent(
  overrides: Partial<ProjectEventInput> = {},
): ProjectEventInput {
  return {
    id: "event-1",
    baseRevision: 1,
    projectId: "deboard-v091",
    type: "FIELD_UPDATE",
    occurredAt: SUBMITTED_AT,
    receivedAt: SUBMITTED_AT,
    sourceIds: ["src-1"],
    verification: "PM_CONFIRMED",
    impactSeedActivityIds: ["masonry"],
    mutations: [],
    payload: {},
    ...overrides,
  };
}

function validQueryIntent(
  kind: IntentKind,
  overrides: Partial<IntentV1> = {},
): unknown {
  return {
    schemaVersion: "1",
    intentId: VALID_UUID,
    idempotencyKey: "key-1",
    projectId: "deboard-v091",
    kind,
    requestedEffect: "READ_ONLY",
    expectedProjectRevision: null,
    submittedAt: SUBMITTED_AT,
    source: { channel: "OPERATOR_UI" },
    payload: { type: "QUERY" },
    ...overrides,
  };
}

function validEvidenceIntent(
  kind: "EVIDENCE_PREVIEW" | "EVIDENCE_APPLY_SHADOW",
  overrides: Partial<IntentV1> = {},
  eventOverrides: Partial<ProjectEventInput> = {},
): unknown {
  return {
    schemaVersion: "1",
    intentId: VALID_UUID,
    idempotencyKey: "key-1",
    projectId: "deboard-v091",
    kind,
    requestedEffect: kind === "EVIDENCE_PREVIEW" ? "PREVIEW" : "APPLY_SHADOW",
    expectedProjectRevision: 1,
    submittedAt: SUBMITTED_AT,
    source: { channel: "API" },
    payload: { type: "EVIDENCE", event: validEvent(eventOverrides) },
    ...overrides,
  };
}

describe("REQUIRED_EFFECT_BY_KIND", () => {
  it("maps every intent kind to exactly its required effect", () => {
    expect(REQUIRED_EFFECT_BY_KIND).toEqual({
      FORECAST_QUERY: "READ_ONLY",
      FORECAST_HEALTH_QUERY: "READ_ONLY",
      RECOVERY_QUERY: "READ_ONLY",
      EVIDENCE_PREVIEW: "PREVIEW",
      EVIDENCE_APPLY_SHADOW: "APPLY_SHADOW",
    });
  });
});

describe("validateIntent: every supported intent kind, valid form", () => {
  it.each(QUERY_KINDS)("accepts a well-formed %s intent", (kind) => {
    const result = validateIntent(validQueryIntent(kind));
    expect(result.valid).toBe(true);
  });

  it("accepts a well-formed EVIDENCE_PREVIEW intent", () => {
    const result = validateIntent(validEvidenceIntent("EVIDENCE_PREVIEW"));
    expect(result.valid).toBe(true);
  });

  it("accepts a well-formed EVIDENCE_APPLY_SHADOW intent", () => {
    const result = validateIntent(validEvidenceIntent("EVIDENCE_APPLY_SHADOW"));
    expect(result.valid).toBe(true);
  });
});

describe("validateIntent: requestedEffect/kind/payload coherence", () => {
  it.each(QUERY_KINDS)("rejects %s with requestedEffect=PREVIEW", (kind) => {
    const result = validateIntent(
      validQueryIntent(kind, { requestedEffect: "PREVIEW" }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects EVIDENCE_PREVIEW with requestedEffect=APPLY_SHADOW", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_PREVIEW", {
        requestedEffect: "APPLY_SHADOW",
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects EVIDENCE_APPLY_SHADOW with requestedEffect=PREVIEW", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_APPLY_SHADOW", {
        requestedEffect: "PREVIEW",
      }),
    );
    expect(result.valid).toBe(false);
  });

  it.each(QUERY_KINDS)(
    "rejects %s with an EVIDENCE payload instead of QUERY",
    (kind) => {
      const result = validateIntent(
        validQueryIntent(kind, {
          payload: { type: "EVIDENCE", event: validEvent() },
        }),
      );
      expect(result.valid).toBe(false);
    },
  );

  it("rejects EVIDENCE_PREVIEW with a QUERY payload instead of EVIDENCE", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_PREVIEW", {
        payload: { type: "QUERY" },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it.each(QUERY_KINDS)(
    "rejects %s with a non-null expectedProjectRevision of the wrong type",
    (kind) => {
      const result = validateIntent(
        validQueryIntent(kind, {
          expectedProjectRevision: "1" as unknown as number,
        }),
      );
      expect(result.valid).toBe(false);
    },
  );

  it("rejects EVIDENCE_PREVIEW with a null expectedProjectRevision", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_PREVIEW", {
        expectedProjectRevision: null,
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects EVIDENCE_APPLY_SHADOW with a null expectedProjectRevision", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_APPLY_SHADOW", {
        expectedProjectRevision: null,
      }),
    );
    expect(result.valid).toBe(false);
  });
});

describe("validateIntent: UUID requirement", () => {
  it.each(["not-a-uuid", "", "11111111-1111-1111-1111", "  ", "123"])(
    "rejects intentId %j",
    (intentId) => {
      const result = validateIntent(
        validQueryIntent("FORECAST_QUERY", { intentId }),
      );
      expect(result.valid).toBe(false);
    },
  );

  it("accepts a well-formed UUID", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { intentId: VALID_UUID }),
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateIntent: idempotency key requirement (1..128 visible ASCII chars)", () => {
  it("rejects an empty idempotency key", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { idempotencyKey: "" }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an idempotency key over 128 characters", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { idempotencyKey: "x".repeat(129) }),
    );
    expect(result.valid).toBe(false);
  });

  it("accepts an idempotency key of exactly 128 characters", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { idempotencyKey: "x".repeat(128) }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an idempotency key containing a space (not visible ASCII)", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { idempotencyKey: "has space" }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an idempotency key containing a newline", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { idempotencyKey: "line1\nline2" }),
    );
    expect(result.valid).toBe(false);
  });
});

describe("validateIntent: timestamp requirement", () => {
  it("rejects a non-ISO submittedAt", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { submittedAt: "not-a-date" }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an evidence event with a non-ISO occurredAt", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_PREVIEW", {}, { occurredAt: "not-a-date" }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an evidence event with a non-ISO receivedAt", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_PREVIEW", {}, { receivedAt: "not-a-date" }),
    );
    expect(result.valid).toBe(false);
  });
});

describe("validateIntent: revision requirement and event/intent equality", () => {
  it("rejects an evidence event whose projectId does not match the intent's projectId", () => {
    const result = validateIntent(
      validEvidenceIntent(
        "EVIDENCE_PREVIEW",
        { projectId: "deboard-v091" },
        { projectId: "some-other-project" },
      ),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an evidence event whose baseRevision does not match expectedProjectRevision", () => {
    const result = validateIntent(
      validEvidenceIntent(
        "EVIDENCE_APPLY_SHADOW",
        { expectedProjectRevision: 1 },
        { baseRevision: 2 },
      ),
    );
    expect(result.valid).toBe(false);
  });

  it("accepts when the event's projectId and baseRevision equal the intent's projectId and expectedProjectRevision", () => {
    const result = validateIntent(
      validEvidenceIntent(
        "EVIDENCE_APPLY_SHADOW",
        { projectId: "deboard-v091", expectedProjectRevision: 3 },
        { projectId: "deboard-v091", baseRevision: 3 },
      ),
    );
    expect(result.valid).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN])(
    "rejects a non-integer/negative expectedProjectRevision (%p) on an evidence intent",
    (expectedProjectRevision) => {
      const result = validateIntent(
        validEvidenceIntent("EVIDENCE_PREVIEW", {
          expectedProjectRevision,
        }),
      );
      expect(result.valid).toBe(false);
    },
  );
});

describe("validateIntent: rejects publication and external/live effects outright", () => {
  it("rejects an unrecognized intent kind (e.g. a hypothetical publish kind)", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", {
        kind: "PUBLISH_FORECAST" as unknown as IntentKind,
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an unrecognized requestedEffect (e.g. a hypothetical publish/external effect)", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", {
        requestedEffect: "PUBLISH" as never,
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an unrecognized requestedEffect on an evidence intent", () => {
    const result = validateIntent(
      validEvidenceIntent("EVIDENCE_APPLY_SHADOW", {
        requestedEffect: "EXTERNAL_SYNC" as never,
      }),
    );
    expect(result.valid).toBe(false);
  });
});

describe("validateIntent: malformed top-level shape", () => {
  it.each([null, undefined, "string", 42, [], true])(
    "rejects non-object input %p",
    (input) => {
      const result = validateIntent(input);
      expect(result.valid).toBe(false);
    },
  );

  it("rejects a missing projectId", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", { projectId: "" }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid source.channel", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", {
        source: { channel: "WEBHOOK" as never },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("accumulates every problem found, not just the first", () => {
    const result = validateIntent(
      validQueryIntent("FORECAST_QUERY", {
        intentId: "not-a-uuid",
        idempotencyKey: "",
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});
