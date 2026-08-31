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
      makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
      [],
      makeResult(),
    );
    expect(trace.intentId).toBe("intent-1");
    expect(trace.workflowId).toBe("wf-1");
    expect(trace.resultId).toBe("result-1");
  });

  it("intentKind falls back to the result's intentKind when not explicitly supplied", () => {
    const trace = buildExecutionTrace(
      makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
      [],
      makeResult({ intentKind: "RECOVERY_QUERY" }),
    );
    expect(trace.intentKind).toBe("RECOVERY_QUERY");
  });

  it("intentKind is explicitly supplied when no result exists yet (e.g. still RUNNING)", () => {
    const trace = buildExecutionTrace(
      makeRun({ state: "RUNNING" }),
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
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [],
        makeResult({ workflowId: "wf-OTHER" }),
      ),
    ).toThrow(/workflowId/);
  });

  it("throws when a supplied result's intentId does not correlate to the run", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
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
      makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
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
    const trace = buildExecutionTrace(
      makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
      [],
      makeResult(),
    );
    expect(trace.verification).toBeNull();
  });

  it("is null when oversight is present but not a recognizable review shape", () => {
    const trace = buildExecutionTrace(
      makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
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

// -----------------------------------------------------------------------------------------------
// TASK 17 CORRECTION
// -----------------------------------------------------------------------------------------------

describe("HIGH 4: WorkflowProblem.message is never exposed verbatim", () => {
  const messageWithSecretLooking: WorkflowProblem = {
    code: "REVISION_CONFLICT",
    category: "REVISION",
    message: "Authorization: Bearer sk-fake-admin-key-should-never-appear",
    retryable: false,
  };

  it("a Bearer token embedded in a problem message never appears in the trace", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "BLOCKED",
        blockedReason: messageWithSecretLooking,
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "BLOCKED" }),
    );
    const json = JSON.stringify(trace);
    expect(json).not.toContain("sk-fake-admin-key-should-never-appear");
    expect(json.toLowerCase()).not.toContain("bearer");
  });

  it("a HOWLER_ADMIN_KEY-like value embedded in a message never appears", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "FAILED",
        failure: {
          code: "INTERNAL_ERROR",
          category: "INTERNAL",
          message: "HOWLER_ADMIN_KEY=abc123 leaked into an exception string",
          retryable: false,
        },
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "FAILED" }),
    );
    expect(JSON.stringify(trace).toLowerCase()).not.toContain(
      "howler_admin_key",
    );
  });

  it("internal exception text embedded in a message never appears verbatim", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "FAILED",
        failure: {
          code: "INTERNAL_ERROR",
          category: "INTERNAL",
          message:
            "TypeError: Cannot read properties of undefined (reading 'foo') at D1HowlerRepository.commitShadowTransition",
          retryable: false,
        },
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "FAILED" }),
    );
    const json = JSON.stringify(trace);
    expect(json).not.toContain("Cannot read properties of undefined");
    expect(json).not.toContain("D1HowlerRepository");
  });

  it("the message field itself is never present on the redacted problem", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "BLOCKED",
        blockedReason: messageWithSecretLooking,
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "BLOCKED" }),
    );
    expect(trace.problem).not.toHaveProperty("message");
  });

  it("known problem code still observable, and classification remains useful", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "BLOCKED",
        blockedReason: messageWithSecretLooking,
        resultId: "result-1",
      }),
      [],
      makeResult({ status: "BLOCKED" }),
    );
    expect(trace.problem).toEqual({
      code: "REVISION_CONFLICT",
      category: "REVISION",
      retryable: false,
    });
  });
});

describe("HIGH 5: execution trace correlation is fully validated, not partially assumed", () => {
  it("throws when a step's workflowId does not belong to this run", () => {
    expect(() =>
      buildExecutionTrace(makeRun(), [
        makeStep({ stepName: "RECEIVE", workflowId: "wf-FOREIGN" }),
      ]),
    ).toThrow(/workflowId/);
  });

  it("throws when result.projectId does not correlate to run.projectId", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [],
        makeResult({ projectId: "proj-OTHER" }),
      ),
    ).toThrow(/projectId/);
  });

  it("throws when result.resultId does not match run.resultId, when the run already points to a result", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [],
        makeResult({ resultId: "result-DIFFERENT" }),
      ),
    ).toThrow(/resultId/);
  });

  it("throws when result.status is inconsistent with a terminal run.state", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [],
        makeResult({ status: "FAILED" }),
      ),
    ).toThrow(/status/);
  });

  it("throws when a result is supplied for a non-terminal run state", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "RUNNING" }),
        [],
        makeResult({ status: "SUCCEEDED" }),
      ),
    ).toThrow(/non-terminal/);
  });

  it("throws when the caller-supplied intentKind contradicts the result's own intentKind", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [],
        makeResult({ intentKind: "RECOVERY_QUERY" }),
        "EVIDENCE_APPLY_SHADOW",
      ),
    ).toThrow(/intentKind/);
  });

  it("does not throw when the caller-supplied intentKind agrees with the result's intentKind", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [],
        makeResult({ intentKind: "RECOVERY_QUERY" }),
        "RECOVERY_QUERY",
      ),
    ).not.toThrow();
  });

  it("a valid INTERRUPTED/no-result trace still works (no result to correlate)", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "INTERRUPTED", interruption: problemFixture }),
        [makeStep({ stepName: "RECEIVE" })],
      ),
    ).not.toThrow();
  });

  it("a valid terminal trace with fully-correlated steps and result still works", () => {
    expect(() =>
      buildExecutionTrace(
        makeRun({ state: "SUCCEEDED", resultId: "result-1" }),
        [makeStep({ stepName: "RECEIVE" }), makeStep({ stepName: "FINALIZE" })],
        makeResult({ status: "SUCCEEDED" }),
      ),
    ).not.toThrow();
  });
});

describe("MEDIUM 1: duration is always finite, nonnegative, and deterministic", () => {
  it("a normal forward duration", () => {
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

  it("equal timestamps produce 0, not null", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "SUCCEEDED",
        resultId: "result-1",
        createdAt: "2026-08-31T10:00:00.000Z",
        completedAt: "2026-08-31T10:00:00.000Z",
      }),
      [],
      makeResult({ status: "SUCCEEDED" }),
    );
    expect(trace.durationMs).toBe(0);
  });

  it("reversed timestamps (completedAt before createdAt) produce null, never a negative number", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "SUCCEEDED",
        resultId: "result-1",
        createdAt: "2026-08-31T10:00:05.000Z",
        completedAt: "2026-08-31T10:00:00.000Z",
      }),
      [],
      makeResult({ status: "SUCCEEDED" }),
    );
    expect(trace.durationMs).toBeNull();
  });

  it("an invalid completedAt timestamp produces null, never NaN", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "SUCCEEDED",
        resultId: "result-1",
        createdAt: "2026-08-31T10:00:00.000Z",
        completedAt: "not-a-real-timestamp",
      }),
      [],
      makeResult({ status: "SUCCEEDED" }),
    );
    expect(trace.durationMs).toBeNull();
    expect(Number.isNaN(trace.durationMs)).toBe(false);
  });

  it("an invalid createdAt timestamp produces null, never NaN", () => {
    const trace = buildExecutionTrace(
      makeRun({
        state: "SUCCEEDED",
        resultId: "result-1",
        createdAt: "not-a-real-timestamp",
        completedAt: "2026-08-31T10:00:05.000Z",
      }),
      [],
      makeResult({ status: "SUCCEEDED" }),
    );
    expect(trace.durationMs).toBeNull();
  });
});
