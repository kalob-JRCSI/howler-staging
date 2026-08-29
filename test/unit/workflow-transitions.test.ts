import { describe, expect, it } from "vitest";
import {
  ALL_WORKFLOW_STATES,
  isTerminalWorkflowState,
  isValidTransition,
  TERMINAL_WORKFLOW_STATES,
  validateTerminalInvariants,
} from "../../src/operator/workflow";
import type {
  WorkflowProblem,
  WorkflowRunV1,
  WorkflowState,
} from "../../src/operator/workflow";

const ALLOWED_TRANSITIONS: [WorkflowState, WorkflowState][] = [
  ["RECEIVED", "VALIDATING"],
  ["VALIDATING", "READY"],
  ["READY", "RUNNING"],
  ["RUNNING", "INTERRUPTED"],
  ["INTERRUPTED", "RUNNING"],
  ["RUNNING", "SUCCEEDED"],
  ["RUNNING", "BLOCKED"],
  ["RUNNING", "FAILED"],
  ["INTERRUPTED", "FAILED"],
];

describe("WorkflowState universe", () => {
  it("defines exactly the 8 states from the design", () => {
    expect([...ALL_WORKFLOW_STATES].sort()).toEqual(
      [
        "RECEIVED",
        "VALIDATING",
        "READY",
        "RUNNING",
        "INTERRUPTED",
        "BLOCKED",
        "FAILED",
        "SUCCEEDED",
      ].sort(),
    );
  });
});

describe("isValidTransition: exactly the allowed transitions from §10.4", () => {
  it.each(ALLOWED_TRANSITIONS)("allows %s -> %s", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  it("rejects every transition not in the allowed set (full matrix)", () => {
    const allowedSet = new Set(
      ALLOWED_TRANSITIONS.map(([f, t]) => `${f}->${t}`),
    );
    let rejectedCount = 0;
    for (const from of ALL_WORKFLOW_STATES) {
      for (const to of ALL_WORKFLOW_STATES) {
        const key = `${from}->${to}`;
        if (allowedSet.has(key)) continue;
        expect(isValidTransition(from, to), key).toBe(false);
        rejectedCount += 1;
      }
    }
    // 8 states * 8 states = 64 pairs; 9 are allowed, so 55 must be rejected.
    expect(rejectedCount).toBe(64 - ALLOWED_TRANSITIONS.length);
  });

  it("rejects self-transitions for every state (not in the allowed set)", () => {
    for (const state of ALL_WORKFLOW_STATES) {
      expect(isValidTransition(state, state)).toBe(false);
    }
  });

  it("rejects transitions out of every terminal state", () => {
    for (const from of TERMINAL_WORKFLOW_STATES) {
      for (const to of ALL_WORKFLOW_STATES) {
        expect(isValidTransition(from, to)).toBe(false);
      }
    }
  });

  it("rejects retry-exhaustion transitions skipping INTERRUPTED (RUNNING cannot jump straight past FAILED via READY)", () => {
    expect(isValidTransition("READY", "FAILED")).toBe(false);
    expect(isValidTransition("VALIDATING", "RUNNING")).toBe(false);
    expect(isValidTransition("RECEIVED", "READY")).toBe(false);
  });
});

describe("isTerminalWorkflowState", () => {
  it("marks SUCCEEDED, BLOCKED, FAILED as terminal", () => {
    expect(isTerminalWorkflowState("SUCCEEDED")).toBe(true);
    expect(isTerminalWorkflowState("BLOCKED")).toBe(true);
    expect(isTerminalWorkflowState("FAILED")).toBe(true);
  });

  it("marks every non-terminal state as not terminal", () => {
    for (const state of [
      "RECEIVED",
      "VALIDATING",
      "READY",
      "RUNNING",
      "INTERRUPTED",
    ] as const) {
      expect(isTerminalWorkflowState(state)).toBe(false);
    }
  });
});

function baseRun(overrides: Partial<WorkflowRunV1> = {}): WorkflowRunV1 {
  return {
    schemaVersion: "1",
    workflowId: "wf-1",
    workflowType: "OPERATOR_INTENT_V1",
    workflowVersion: 1,
    intentId: "intent-1",
    intentHash: "hash-1",
    projectId: "deboard-v091",
    state: "RUNNING",
    currentStep: "EXECUTE_ENGINE",
    attempt: 1,
    maxAttempts: 3,
    resumable: false,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

const retryableProblem: WorkflowProblem = {
  code: "TRANSIENT_D1_READ_FAILURE",
  category: "TRANSIENT",
  message: "transient failure",
  retryable: true,
};

const nonRetryableProblem: WorkflowProblem = {
  code: "VALIDATION_FAILED",
  category: "VALIDATION",
  message: "invalid",
  retryable: false,
};

describe("validateTerminalInvariants: SUCCEEDED/BLOCKED/FAILED require exactly one result", () => {
  it.each(["SUCCEEDED", "BLOCKED", "FAILED"] as const)(
    "%s with a resultId has no violations",
    (state) => {
      const run = baseRun({ state, resultId: "result-1" });
      expect(validateTerminalInvariants(run)).toEqual([]);
    },
  );

  it.each(["SUCCEEDED", "BLOCKED", "FAILED"] as const)(
    "%s without a resultId is a violation",
    (state) => {
      const run = baseRun({ state });
      const violations = validateTerminalInvariants(run);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.code).toBe("TERMINAL_RESULT_MISSING");
    },
  );
});

describe("validateTerminalInvariants: INTERRUPTED requires no result and a retryable problem", () => {
  it("no violations when there is no result and a retryable interruption problem", () => {
    const run = baseRun({
      state: "INTERRUPTED",
      interruption: retryableProblem,
    });
    expect(validateTerminalInvariants(run)).toEqual([]);
  });

  it("is a violation when a result is present on an INTERRUPTED run", () => {
    const run = baseRun({
      state: "INTERRUPTED",
      interruption: retryableProblem,
      resultId: "result-1",
    });
    const violations = validateTerminalInvariants(run);
    expect(
      violations.some((v) => v.code === "INTERRUPTED_RESULT_PRESENT"),
    ).toBe(true);
  });

  it("is a violation when INTERRUPTED has no interruption problem at all", () => {
    const run = baseRun({ state: "INTERRUPTED" });
    const violations = validateTerminalInvariants(run);
    expect(
      violations.some((v) => v.code === "INTERRUPTED_PROBLEM_MISSING"),
    ).toBe(true);
  });

  it("is a violation when INTERRUPTED's problem is not retryable", () => {
    const run = baseRun({
      state: "INTERRUPTED",
      interruption: nonRetryableProblem,
    });
    const violations = validateTerminalInvariants(run);
    expect(
      violations.some((v) => v.code === "INTERRUPTED_PROBLEM_NOT_RETRYABLE"),
    ).toBe(true);
  });
});

describe("validateTerminalInvariants: non-terminal, non-interrupted states are unconstrained", () => {
  it.each(["RECEIVED", "VALIDATING", "READY", "RUNNING"] as const)(
    "%s has no terminal-invariant violations regardless of resultId",
    (state) => {
      expect(validateTerminalInvariants(baseRun({ state }))).toEqual([]);
    },
  );
});
