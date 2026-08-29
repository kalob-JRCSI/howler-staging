import { describe, expect, it } from "vitest";
import {
  buildIntentSubmissionResponse,
  buildResult,
} from "../../src/operator/result";
import type { BuildResultInput, ResultOutput } from "../../src/operator/result";
import { OPERATOR_SAFETY } from "../../src/operator/policy";
import type { WorkflowRunV1 } from "../../src/operator/workflow";

const CREATED_AT = "2026-08-29T12:00:00.000Z";

function baseInput(
  overrides: Partial<BuildResultInput> = {},
): BuildResultInput {
  return {
    resultId: "result-1",
    intentId: "intent-1",
    workflowId: "wf-1",
    projectId: "deboard-v091",
    intentKind: "FORECAST_QUERY",
    status: "SUCCEEDED",
    persisted: false,
    projectRevisionBefore: 1,
    projectRevisionAfter: 1,
    forecastVersion: 1,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("buildResult: server-created safety object", () => {
  it("always carries the exact OPERATOR_SAFETY values", () => {
    const result = buildResult(baseInput());
    expect(result.safety).toEqual(OPERATOR_SAFETY);
    expect(result.safety.mode).toBe("shadow");
    expect(result.safety.stagingOnly).toBe(true);
    expect(result.safety.liveSystemsConnected).toBe(false);
    expect(result.safety.dashboardConnected).toBe(false);
    expect(result.safety.calendarConnected).toBe(false);
    expect(result.safety.productionDeployment).toBe(false);
  });

  it("ignores any safety object smuggled into the input rather than accepting it", () => {
    const evilInput = {
      ...baseInput(),
      safety: {
        mode: "controlled",
        stagingOnly: false,
        liveSystemsConnected: true,
        dashboardConnected: true,
        calendarConnected: true,
        productionDeployment: true,
      },
    } as unknown as BuildResultInput;
    const result = buildResult(evilInput);
    expect(result.safety).toEqual(OPERATOR_SAFETY);
  });

  it("carries the same fixed safety object for BLOCKED and FAILED statuses too", () => {
    const blocked = buildResult(baseInput({ status: "BLOCKED" }));
    const failed = buildResult(baseInput({ status: "FAILED" }));
    expect(blocked.safety).toEqual(OPERATOR_SAFETY);
    expect(failed.safety).toEqual(OPERATOR_SAFETY);
  });
});

describe("buildResult: schema and field passthrough", () => {
  it("sets schemaVersion to '1'", () => {
    expect(buildResult(baseInput()).schemaVersion).toBe("1");
  });

  it("passes through identity, revision, and status fields exactly", () => {
    const result = buildResult(
      baseInput({
        resultId: "r-9",
        intentId: "i-9",
        workflowId: "w-9",
        projectId: "deboard-v091",
        intentKind: "EVIDENCE_APPLY_SHADOW",
        status: "SUCCEEDED",
        persisted: true,
        projectRevisionBefore: 1,
        projectRevisionAfter: 2,
        forecastVersion: 2,
      }),
    );
    expect(result.resultId).toBe("r-9");
    expect(result.intentId).toBe("i-9");
    expect(result.workflowId).toBe("w-9");
    expect(result.projectId).toBe("deboard-v091");
    expect(result.intentKind).toBe("EVIDENCE_APPLY_SHADOW");
    expect(result.status).toBe("SUCCEEDED");
    expect(result.persisted).toBe(true);
    expect(result.projectRevisionBefore).toBe(1);
    expect(result.projectRevisionAfter).toBe(2);
    expect(result.forecastVersion).toBe(2);
    expect(result.createdAt).toBe(CREATED_AT);
  });

  it("defaults warnings to an empty array when omitted", () => {
    expect(buildResult(baseInput()).warnings).toEqual([]);
  });

  it("passes through supplied warnings", () => {
    const warnings = [{ code: "LOW_CONFIDENCE", message: "confidence is low" }];
    expect(buildResult(baseInput({ warnings })).warnings).toEqual(warnings);
  });

  it("omits output/oversight/problem when not supplied", () => {
    const result = buildResult(baseInput());
    expect(result.output).toBeUndefined();
    expect(result.oversight).toBeUndefined();
    expect(result.problem).toBeUndefined();
  });

  it("passes through a BLOCKED result's problem", () => {
    const problem = {
      code: "REVISION_CONFLICT",
      category: "REVISION" as const,
      message: "stale revision",
      retryable: false,
    };
    const result = buildResult(
      baseInput({ status: "BLOCKED", problem, persisted: false }),
    );
    expect(result.problem).toEqual(problem);
    expect(result.status).toBe("BLOCKED");
  });
});

describe("buildResult: every ResultOutput variant", () => {
  it("accepts a FORECAST output", () => {
    const output: ResultOutput = {
      type: "FORECAST",
      data: { modelRevision: 1, latest: null, published: null },
    };
    expect(buildResult(baseInput({ output })).output).toEqual(output);
  });

  it("accepts a FORECAST_HEALTH output", () => {
    const output: ResultOutput = {
      type: "FORECAST_HEALTH",
      data: {
        projectId: "deboard-v091",
        revision: 1,
        forecastVersion: null,
        completion: null,
        meanForecastConfidence: 0,
        openConflicts: [],
        blockedConstraints: [],
        unverifiedHardConstraints: [],
        lowCoverage: [],
        accuracyByHorizon: [],
      },
    };
    expect(
      buildResult(baseInput({ intentKind: "FORECAST_HEALTH_QUERY", output }))
        .output,
    ).toEqual(output);
  });

  it("accepts a RECOVERY output", () => {
    const output: ResultOutput = {
      type: "RECOVERY",
      data: {
        projectId: "deboard-v091",
        projectRevision: 1,
        latestVersion: 1,
        baselineVersion: null,
        recovery: {
          status: "NO_FORECAST",
          recoveryAvailable: false,
          recoveryStandbyAvailable: false,
          advisoryOnly: true,
          levers: [],
          protectionActions: [],
        },
        recoveryLayer: {
          version: "0.9.4",
          status: "NO_FORECAST",
          nextRiskDate: null,
          criticalExposureCount: 0,
          blockedProtectionCount: 0,
          standbyRecoveryCapacityWorkdays: 0,
        },
        publicationGate: {
          forecastAllowed: true,
          commitmentEligible: false,
          publishable: false,
          mode: "shadow",
        },
        stagingOnly: true,
      },
    };
    expect(
      buildResult(baseInput({ intentKind: "RECOVERY_QUERY", output })).output,
    ).toEqual(output);
  });

  it("accepts an EVIDENCE_PREVIEW output", () => {
    const output: ResultOutput = {
      type: "EVIDENCE_PREVIEW",
      data: {
        projectRevision: 1,
        baselineVersion: null,
        latestVersion: 1,
        comparisonVersion: 1,
        candidate: { placeholder: true } as never,
        delta: null,
        recoveryAnalysis: {
          status: "NO_FORECAST",
          recoveryAvailable: false,
          recoveryStandbyAvailable: false,
          advisoryOnly: true,
          levers: [],
          protectionActions: [],
        },
        supersededSources: [],
        impactActivityIds: [],
        oversight: { placeholder: true } as never,
        forecastable: true,
        commitmentEligible: false,
        oversightPublishable: false,
        publishable: false,
        reviewToken: "token-1",
        persisted: false,
        mode: "shadow",
        stagingOnly: true,
      },
    };
    expect(
      buildResult(baseInput({ intentKind: "EVIDENCE_PREVIEW", output })).output,
    ).toEqual(output);
  });

  it("accepts a SHADOW_TRANSITION output", () => {
    const output: ResultOutput = {
      type: "SHADOW_TRANSITION",
      data: {
        applied: true,
        stagingOnly: true,
        projectRevision: 2,
        candidate: { placeholder: true } as never,
        delta: null,
        recoveryAnalysis: {
          status: "NO_FORECAST",
          recoveryAvailable: false,
          recoveryStandbyAvailable: false,
          advisoryOnly: true,
          levers: [],
          protectionActions: [],
        },
        supersededSources: [],
        impactActivityIds: [],
        oversight: { placeholder: true } as never,
        publicationGate: {
          forecastAllowed: true,
          commitmentEligible: false,
          publishable: false,
          mode: "shadow",
        },
      },
    };
    expect(
      buildResult(baseInput({ intentKind: "EVIDENCE_APPLY_SHADOW", output }))
        .output,
    ).toEqual(output);
  });
});

describe("buildIntentSubmissionResponse", () => {
  function terminalRunBase(): WorkflowRunV1 {
    return {
      schemaVersion: "1",
      workflowId: "wf-1",
      workflowType: "OPERATOR_INTENT_V1",
      workflowVersion: 1,
      intentId: "intent-1",
      intentHash: "hash-1",
      projectId: "deboard-v091",
      state: "SUCCEEDED",
      currentStep: null,
      attempt: 1,
      maxAttempts: 3,
      resumable: false,
      resultId: "result-1",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      completedAt: CREATED_AT,
    };
  }

  function interruptedRunBase(): WorkflowRunV1 {
    return {
      schemaVersion: "1",
      workflowId: "wf-1",
      workflowType: "OPERATOR_INTENT_V1",
      workflowVersion: 1,
      intentId: "intent-1",
      intentHash: "hash-1",
      projectId: "deboard-v091",
      state: "INTERRUPTED",
      currentStep: "EXECUTE_ENGINE",
      attempt: 1,
      maxAttempts: 3,
      resumable: true,
      interruption: {
        code: "TRANSIENT_D1_READ_FAILURE",
        category: "TRANSIENT",
        message: "transient",
        retryable: true,
      },
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }

  it("includes the result for a terminal (non-INTERRUPTED) run", () => {
    const run = terminalRunBase();
    const result = buildResult(baseInput());
    const response = buildIntentSubmissionResponse(false, run, result);
    expect(response.schemaVersion).toBe("1");
    expect(response.replayed).toBe(false);
    expect(response.run).toBe(run);
    expect(response.result).toBe(result);
  });

  it("omits the result for an INTERRUPTED run", () => {
    const run = interruptedRunBase();
    const response = buildIntentSubmissionResponse(false, run, undefined);
    expect(response.result).toBeUndefined();
  });

  it("throws if a result is supplied for an INTERRUPTED run", () => {
    const run = interruptedRunBase();
    const result = buildResult(baseInput());
    expect(() => buildIntentSubmissionResponse(false, run, result)).toThrow();
  });

  it("throws if no result is supplied for a non-INTERRUPTED run", () => {
    const run = terminalRunBase();
    expect(() =>
      buildIntentSubmissionResponse(false, run, undefined),
    ).toThrow();
  });

  it("sets replayed=true when passed", () => {
    const run = terminalRunBase();
    const result = buildResult(baseInput());
    const response = buildIntentSubmissionResponse(true, run, result);
    expect(response.replayed).toBe(true);
  });
});
