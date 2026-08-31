import { describe, expect, it } from "vitest";
import { buildExecutionTrace } from "../../src/operator/observability";
import type {
  WorkflowProblem,
  WorkflowRunV1,
  WorkflowStepV1,
} from "../../src/operator/workflow";
import type { ResultV1 } from "../../src/operator/result";
import { OPERATOR_SAFETY } from "../../src/operator/policy";

function makeRun(overrides: Partial<WorkflowRunV1> = {}): WorkflowRunV1 {
  return {
    schemaVersion: "1",
    workflowId: "wf-1",
    workflowType: "OPERATOR_INTENT_V1",
    workflowVersion: 1,
    intentId: "intent-1",
    intentHash: "hash-1",
    projectId: "proj-a",
    state: "RUNNING",
    currentStep: "EXECUTE_ENGINE",
    attempt: 1,
    maxAttempts: 3,
    resumable: false,
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:01.000Z",
    ...overrides,
  };
}

function makeStep(overrides: Partial<WorkflowStepV1> = {}): WorkflowStepV1 {
  return {
    schemaVersion: "1",
    workflowId: "wf-1",
    stepName: "RECEIVE",
    ordinal: 0,
    state: "SUCCEEDED",
    attempt: 1,
    inputHash: "in-hash",
    ...overrides,
  };
}

function makeResult(overrides: Partial<ResultV1> = {}): ResultV1 {
  return {
    schemaVersion: "1",
    resultId: "result-1",
    intentId: "intent-1",
    workflowId: "wf-1",
    projectId: "proj-a",
    intentKind: "FORECAST_HEALTH_QUERY",
    status: "SUCCEEDED",
    persisted: false,
    projectRevisionBefore: null,
    projectRevisionAfter: null,
    forecastVersion: null,
    warnings: [],
    safety: OPERATOR_SAFETY,
    createdAt: "2026-08-31T10:00:02.000Z",
    ...overrides,
  };
}

const problemFixture: WorkflowProblem = {
  code: "REVISION_CONFLICT",
  category: "REVISION",
  message: "Expected revision 3, got 4",
  retryable: false,
  details: { secretLooking: "sk-fake-admin-key-should-never-appear" },
};

describe("correlation identity", () => {
  it("surfaces intentId/workflowId/resultId directly from the run/result", () => {
    const trace = buildExecutionTrace(
      makeRun({ resultId: "result-1" }),
      [],
      makeResult(),
    );
    expect(trace.intentId).toBe("intent-1");
    expect(trace.workflowId).toBe("wf-1");
    expect(trace.resultId).toBe("result-1");
  });

  it("intentKind falls back to the result's intentKind when not explicitly supplied", () => {
    const trace = buildExecutionTrace(
      makeRun(),
      [],
      makeResult({ intentKind: "RECOVERY_QUERY" }),
    );
    expect(trace.intentKind).toBe("RECOVERY_QUERY");
  });

  it("intentKind is explicitly supplied when no result exists yet (e.g. still RUNNING)", () => {
    const trace = buildExecutionTrace(
      makeRun(),
      [],
      undefined,
      "EVIDENCE_APPLY_SHADOW",
    );
    expect(trace.intentKind).toBe("EVIDENCE_APPLY_SHADOW");
  });

  it("intentKind is null, never guessed, when neither a result nor an explicit kind is given", () => {
    const trace = buildExecutionTrace(makeRun(), []);
    expect(trace.intentKind).toBeNull();
  });

  it("throws when a supplied result's workflowId does not correlate to the run", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun(),
        [],
        makeResult({ workflowId: "wf-OTHER" }),
      ),
    ).toThrow(/workflowId/);
  });

  it("throws when a supplied result's intentId does not correlate to the run", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun(),
        [],
        makeResult({ intentId: "intent-OTHER" }),
      ),
    ).toThrow(/intentId/);
  });
});

describe("per-outcome shape", () => {
  it("RUNNING: no problem, no result fields", () => {
    const trace = buildExecutionTrace(makeRun({ state: "RUNNING" }), []);
    expect(trace.workflowState).toBe("RUNNING");
    expect(trace.problem).toBeNull();
    expect(trace.resultId).toBeNull();
    expect(trace.resultStatus).toBeNull();
  });

  it("INTERRUPTED: problem comes from run.interruption; no result present", () => {
    const trace = buildExecutionTrace(
      makeRun({ state: "INTERRUPTED", interruption: problemFixture }),
      [],
    );
    expect(trace.workflowState).toBe("INTERRUPTED");
    expect(trace.problem).toEqual({
      code: "REVISION_CONFLICT",
      category: "REVISION",
      message: "Expected revision 3, got 4",
      retryable: false,
    });
    expect(trace.resultId).toBeNull();
  });

  it("BLOCKED: problem comes from run.blockedReason; result present with status BLOCKED", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "BLOCKED",
        blockedReason: problemFixture,
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "BLOCKED" }),
    );
    expect(trace.workflowState).toBe("BLOCKED");
    expect(trace.problem?.code).toBe("REVISION_CONFLICT");
    expect(trace.resultStatus).toBe("BLOCKED");
  });

  it("FAILED: problem comes from run.failure", () => {
    const failure: WorkflowProblem = {
      code: "COMMIT_STATE_AMBIGUOUS",
      category: "INTERNAL",
      message: "ambiguous commit state",
      retryable: false,
    };
    const trace = buildExecutionTrace(
      makeRun({ state: "FAILED", failure, resultId: "result-1" }),
      [],
      makeResult({ status: "FAILED" }),
    );
    expect(trace.workflowState).toBe("FAILED");
    expect(trace.problem?.code).toBe("COMMIT_STATE_AMBIGUOUS");
  });

  it("SUCCEEDED: no problem; resultStatus SUCCEEDED", () => {
    const trace = buildExecutionTrace(
      makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
      [],
      makeResult({ status: "SUCCEEDED" }),
    );
    expect(trace.workflowState).toBe("SUCCEEDED");
    expect(trace.problem).toBeNull();
    expect(trace.resultStatus).toBe("SUCCEEDED");
  });
});

describe("step ledger", () => {
  it("is ordered by the canonical step sequence regardless of input order", () => {
    const trace = buildExecutionTrace(makeRun(), [
      makeStep({ stepName: "VALIDATE", ordinal: 1 }),
      makeStep({ stepName: "RECEIVE", ordinal: 0 }),
      makeStep({ stepName: "AUTHORIZE_POLICY", ordinal: 2 }),
    ]);
    expect(trace.steps.map((s) => s.stepName)).toEqual([
      "RECEIVE",
      "VALIDATE",
      "AUTHORIZE_POLICY",
    ]);
  });

  it("a step not yet reached is simply absent, never a placeholder entry", () => {
    const trace = buildExecutionTrace(makeRun(), [
      makeStep({ stepName: "RECEIVE" }),
    ]);
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]?.stepName).toBe("RECEIVE");
  });

  it("carries a step's own problem, redacted the same way as the run-level problem", () => {
    const trace = buildExecutionTrace(makeRun(), [
      makeStep({
        stepName: "AUTHORIZE_POLICY",
        state: "BLOCKED",
        problem: problemFixture,
      }),
    ]);
    expect(trace.steps[0]?.problem).toEqual({
      code: "REVISION_CONFLICT",
      category: "REVISION",
      message: "Expected revision 3, got 4",
      retryable: false,
    });
  });

  it("never includes raw step output, inputHash, or outputHash", () => {
    const trace = buildExecutionTrace(makeRun(), [
      makeStep({
        stepName: "EXECUTE_ENGINE",
        output: { secretLookingField: "should-not-appear" },
        outputHash: "out-hash-value",
        inputHash: "in-hash-value",
      }),
    ]);
    const json = JSON.stringify(trace);
    expect(json).not.toContain("secretLookingField");
    expect(json).not.toContain("out-hash-value");
    expect(json).not.toContain("in-hash-value");
  });
});

describe("verification (oversight)", () => {
  it("surfaces only decision + a findings count, never raw findings", () => {
    const trace = buildExecutionTrace(
      makeRun(),
      [],
      makeResult({
        oversight: {
          id: "review-1",
          projectId: "proj-a",
          candidateSnapshotId: "snap-1",
          createdAt: "2026-08-31T10:00:00.000Z",
          decision: "PASS_WITH_WARNINGS",
          findings: [
            { code: "LOW_COVERAGE", message: "activity X has low coverage" },
            { code: "STALE_SOURCE", message: "source Y is stale" },
          ],
        },
      }),
    );
    expect(trace.verification).toEqual({
      decision: "PASS_WITH_WARNINGS",
      findingsCount: 2,
    });
    expect(JSON.stringify(trace)).not.toContain("LOW_COVERAGE");
    expect(JSON.stringify(trace)).not.toContain("activity X");
  });

  it("is null when the result has no oversight", () => {
    const trace = buildExecutionTrace(makeRun(), [], makeResult());
    expect(trace.verification).toBeNull();
  });

  it("is null when oversight is present but not a recognizable review shape", () => {
    const trace = buildExecutionTrace(
      makeRun(),
      [],
      makeResult({ oversight: { unexpected: true } }),
    );
    expect(trace.verification).toBeNull();
  });

  it("is null when there is no result at all", () => {
    const trace = buildExecutionTrace(makeRun(), []);
    expect(trace.verification).toBeNull();
  });
});

describe("redaction: no secret/admin-key/header leakage", () => {
  it("never includes WorkflowProblem.details, even when it looks secret-shaped", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "BLOCKED",
        blockedReason: problemFixture,
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "BLOCKED" }),
    );
    const json = JSON.stringify(trace);
    expect(json).not.toContain("sk-fake-admin-key-should-never-appear");
    expect(json).not.toContain("details");
  });

  it("never includes an admin key, Authorization header, or Bearer token substring across every fixture in this file", () => {
    const traces = [
      buildExecutionTrace(makeRun(), []),
      buildExecutionTrace(
        makeRun({ state: "INTERRUPTED", interruption: problemFixture }),
        [],
      ),
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [makeStep({ stepName: "AUTHORIZE_POLICY" })],
        makeResult({ status: "SUCCEEDED" }),
      ),
    ];
    const json = JSON.stringify(traces);
    expect(json.toLowerCase()).not.toContain("bearer");
    expect(json.toLowerCase()).not.toContain("authorization");
    expect(json.toLowerCase()).not.toContain("admin_key");
    expect(json.toLowerCase()).not.toContain("howler_admin_key");
  });
});

describe("determinism", () => {
  it("two calls with identical input produce structurally identical output", () => {
    const run = makeRun({ state: "SUCCEEDED", resultId: "result-1" });
    const steps = [
      makeStep({ stepName: "RECEIVE" }),
      makeStep({ stepName: "VALIDATE" }),
    ];
    const result = makeResult({ status: "SUCCEEDED" });
    const traceA = buildExecutionTrace(run, steps, result);
    const traceB = buildExecutionTrace(run, steps, result);
    expect(traceA).toEqual(traceB);
    expect(JSON.stringify(traceA)).toBe(JSON.stringify(traceB));
  });
});

describe("duration", () => {
  it("is computed from completedAt - createdAt when both are present", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "SUCCEEDED",
        resultId: "result-1",
        createdAt: "2026-08-31T10:00:00.000Z",
        completedAt: "2026-08-31T10:00:05.000Z",
      }),
      [],
      makeResult({ status: "SUCCEEDED" }),
    );
    expect(trace.durationMs).toBe(5000);
  });

  it("is null when the run has not completed", () => {
    const trace = buildExecutionTrace(makeRun({ state: "RUNNING" }), []);
    expect(trace.durationMs).toBeNull();
  });
});
