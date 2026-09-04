import { describe, expect, it } from "vitest";
import {
  assertPermittedEffect,
  assertShadowCommitPermitted,
  assertStagingShadowPolicy,
  isSafetyCompliant,
  OPERATOR_SAFETY,
} from "../../src/operator/policy";
import type { IntentKind, RequestedEffect } from "../../src/operator/intent";

describe("OPERATOR_SAFETY: fixed staging/shadow/no-live/no-production invariants", () => {
  it("carries the exact required literal values", () => {
    expect(OPERATOR_SAFETY).toEqual({
      mode: "shadow",
      stagingOnly: true,
      liveSystemsConnected: false,
      dashboardConnected: false,
      calendarConnected: false,
      productionDeployment: false,
    });
  });
});

describe("isSafetyCompliant", () => {
  it("accepts the canonical OPERATOR_SAFETY object", () => {
    expect(isSafetyCompliant(OPERATOR_SAFETY)).toBe(true);
  });

  it("rejects a safety object with mode !== shadow", () => {
    expect(isSafetyCompliant({ ...OPERATOR_SAFETY, mode: "controlled" })).toBe(
      false,
    );
  });

  it("rejects a safety object with liveSystemsConnected=true", () => {
    expect(
      isSafetyCompliant({ ...OPERATOR_SAFETY, liveSystemsConnected: true }),
    ).toBe(false);
  });

  it("rejects a safety object with stagingOnly=false", () => {
    expect(isSafetyCompliant({ ...OPERATOR_SAFETY, stagingOnly: false })).toBe(
      false,
    );
  });

  it("rejects a safety object with dashboardConnected=true", () => {
    expect(
      isSafetyCompliant({ ...OPERATOR_SAFETY, dashboardConnected: true }),
    ).toBe(false);
  });

  it("rejects a safety object with calendarConnected=true", () => {
    expect(
      isSafetyCompliant({ ...OPERATOR_SAFETY, calendarConnected: true }),
    ).toBe(false);
  });

  it("rejects a safety object with productionDeployment=true", () => {
    expect(
      isSafetyCompliant({ ...OPERATOR_SAFETY, productionDeployment: true }),
    ).toBe(false);
  });
});

describe("assertStagingShadowPolicy", () => {
  it("returns undefined (no problem) for the staging/shadow target", () => {
    const problem = assertStagingShadowPolicy({
      mode: "shadow",
      workerName: "jarvis-voice-staging",
    });
    expect(problem).toBeUndefined();
  });

  it("returns a POLICY problem when the worker name is not jarvis-voice-staging", () => {
    const problem = assertStagingShadowPolicy({
      mode: "shadow",
      workerName: "jarvis-voice",
    });
    expect(problem).toMatchObject({ category: "POLICY", retryable: false });
  });

  it("returns a POLICY problem when the worker name is a production-sounding variant", () => {
    const problem = assertStagingShadowPolicy({
      mode: "shadow",
      workerName: "jarvis-voice-production",
    });
    expect(problem).toMatchObject({ category: "POLICY" });
  });

  it("returns a POLICY problem when mode is not shadow", () => {
    const problem = assertStagingShadowPolicy({
      mode: "controlled",
      workerName: "jarvis-voice-staging",
    });
    expect(problem).toMatchObject({ category: "POLICY", retryable: false });
  });

  it("rejects the staging worker check before accepting any other mode value", () => {
    const problem = assertStagingShadowPolicy({
      mode: "shadow",
      workerName: "some-other-worker",
    });
    expect(problem?.category).toBe("POLICY");
  });
});

describe("assertPermittedEffect: defense-in-depth against publication/external effects", () => {
  const cases: [IntentKind, RequestedEffect][] = [
    ["FORECAST_QUERY", "READ_ONLY"],
    ["FORECAST_HEALTH_QUERY", "READ_ONLY"],
    ["RECOVERY_QUERY", "READ_ONLY"],
    ["EVIDENCE_PREVIEW", "PREVIEW"],
    ["EVIDENCE_APPLY_SHADOW", "APPLY_SHADOW"],
  ];

  it.each(cases)(
    "permits %s with its own required effect %s",
    (kind, effect) => {
      expect(assertPermittedEffect(kind, effect)).toBeUndefined();
    },
  );

  it("rejects a query kind requesting APPLY_SHADOW", () => {
    const problem = assertPermittedEffect("FORECAST_QUERY", "APPLY_SHADOW");
    expect(problem).toMatchObject({ category: "POLICY", retryable: false });
  });

  it("rejects EVIDENCE_APPLY_SHADOW requesting READ_ONLY", () => {
    const problem = assertPermittedEffect("EVIDENCE_APPLY_SHADOW", "READ_ONLY");
    expect(problem).toMatchObject({ category: "POLICY" });
  });

  it("rejects a hypothetical PUBLISH effect for every intent kind", () => {
    for (const kind of cases.map(([k]) => k)) {
      const problem = assertPermittedEffect(kind, "PUBLISH" as never);
      expect(problem, kind).toMatchObject({
        category: "POLICY",
        retryable: false,
      });
    }
  });

  it("rejects a hypothetical EXTERNAL_SYNC effect for every intent kind", () => {
    for (const kind of cases.map(([k]) => k)) {
      const problem = assertPermittedEffect(kind, "EXTERNAL_SYNC" as never);
      expect(problem, kind).toMatchObject({ category: "POLICY" });
    }
  });
});

describe("assertShadowCommitPermitted: only EVIDENCE_APPLY_SHADOW may invoke a shadow commit", () => {
  it("permits EVIDENCE_APPLY_SHADOW", () => {
    expect(
      assertShadowCommitPermitted("EVIDENCE_APPLY_SHADOW"),
    ).toBeUndefined();
  });

  it.each([
    "FORECAST_QUERY",
    "FORECAST_HEALTH_QUERY",
    "RECOVERY_QUERY",
    "EVIDENCE_PREVIEW",
  ] as const)("rejects %s", (kind) => {
    const problem = assertShadowCommitPermitted(kind);
    expect(problem).toMatchObject({
      code: "POLICY_SHADOW_COMMIT_NOT_PERMITTED",
      category: "POLICY",
      retryable: false,
    });
  });
});
