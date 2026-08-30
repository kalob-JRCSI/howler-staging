import { describe, expect, it } from "vitest";
import { operatorPanelClientScript } from "../../src/worker/admin";
import type {
  OperatorPanelDocument,
  OperatorPanelElement,
  OperatorPanelFetch,
  OperatorPanelTestHooks,
} from "../../src/worker/admin";

// The inline client script is a real, directly-callable, directly-importable function — the
// exact same function is `.toString()`-embedded into the page's <script> tag in production.
// Calling it here with a minimal, hand-built fake DOM/storage/fetch/crypto — no jsdom dependency
// needed for a page this small — is exactly what the accepted plan calls "a minimal test DOM".

interface FakeElement extends OperatorPanelElement {
  trigger(type: string, event?: unknown): void;
}

function makeElement(overrides: Partial<FakeElement> = {}): FakeElement {
  const listeners: Record<string, ((event?: unknown) => void)[]> = {};
  return {
    value: "",
    textContent: "",
    disabled: false,
    hidden: false,
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler);
    },
    trigger(type, event) {
      for (const handler of listeners[type] ?? []) handler(event);
    },
    ...overrides,
  };
}

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function makeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

interface FakeFetchCall {
  path: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

function makeFetch(
  respond: (
    call: FakeFetchCall,
  ) => { ok: boolean; status: number; bodyText: string } | { reject: Error },
): { fetchFn: OperatorPanelFetch; calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = [];
  const fetchFn: OperatorPanelFetch = (path, options) => {
    const headers = new Headers(
      (options?.headers as HeadersInit | undefined) ?? {},
    );
    const call: FakeFetchCall = {
      path,
      method: options?.method ?? "GET",
      headers,
      body: options?.body,
    };
    calls.push(call);
    const result = respond(call);
    if ("reject" in result) return Promise.reject(result.reject);
    return Promise.resolve({
      ok: result.ok,
      status: result.status,
      text: () => Promise.resolve(result.bodyText),
    });
  };
  return { fetchFn, calls };
}

function makeCrypto(ids: string[]) {
  let index = 0;
  return {
    randomUUID: () => {
      const id = ids[index];
      index += 1;
      return id ?? `fallback-id-${String(index)}`;
    },
  };
}

interface Harness {
  els: {
    form: FakeElement;
    adminKey: FakeElement;
    projectId: FakeElement;
    intentKind: FakeElement;
    revisionField: FakeElement;
    expectedRevision: FakeElement;
    evidenceField: FakeElement;
    evidenceEventJson: FakeElement;
    runButton: FakeElement;
    resumeButton: FakeElement;
    status: FakeElement;
    outIntentId: FakeElement;
    outWorkflowId: FakeElement;
    outWorkflowState: FakeElement;
    outAttempt: FakeElement;
    outCurrentStep: FakeElement;
    outResultId: FakeElement;
    outResultStatus: FakeElement;
    outPersisted: FakeElement;
    outProblem: FakeElement;
    outRevisionConflict: FakeElement;
  };
  storage: FakeStorage;
  fetchCalls: FakeFetchCall[];
  testHooks: Required<OperatorPanelTestHooks>;
}

function mount(
  respond: (
    call: FakeFetchCall,
  ) => { ok: boolean; status: number; bodyText: string } | { reject: Error },
  randomIds: string[] = ["intent-a", "idem-a", "intent-b", "idem-b"],
): Harness {
  const els: Harness["els"] = {
    form: makeElement(),
    adminKey: makeElement(),
    projectId: makeElement({ value: "deboard-v091" }),
    intentKind: makeElement({ value: "FORECAST_QUERY" }),
    revisionField: makeElement({ hidden: true }),
    expectedRevision: makeElement(),
    evidenceField: makeElement({ hidden: true }),
    evidenceEventJson: makeElement(),
    runButton: makeElement(),
    resumeButton: makeElement({ hidden: true }),
    status: makeElement({ textContent: "Ready." }),
    outIntentId: makeElement(),
    outWorkflowId: makeElement(),
    outWorkflowState: makeElement(),
    outAttempt: makeElement(),
    outCurrentStep: makeElement(),
    outResultId: makeElement(),
    outResultStatus: makeElement(),
    outPersisted: makeElement(),
    outProblem: makeElement(),
    outRevisionConflict: makeElement(),
  };
  const byId: Record<string, FakeElement> = {
    "intent-form": els.form,
    "admin-key": els.adminKey,
    "project-id": els.projectId,
    "intent-kind": els.intentKind,
    "revision-field": els.revisionField,
    "expected-revision": els.expectedRevision,
    "evidence-field": els.evidenceField,
    "evidence-event-json": els.evidenceEventJson,
    "run-intent": els.runButton,
    "resume-button": els.resumeButton,
    status: els.status,
    "out-intent-id": els.outIntentId,
    "out-workflow-id": els.outWorkflowId,
    "out-workflow-state": els.outWorkflowState,
    "out-attempt": els.outAttempt,
    "out-current-step": els.outCurrentStep,
    "out-result-id": els.outResultId,
    "out-result-status": els.outResultStatus,
    "out-persisted": els.outPersisted,
    "out-problem": els.outProblem,
    "out-revision-conflict": els.outRevisionConflict,
  };
  const fakeDocument: OperatorPanelDocument = {
    getElementById: (id: string) => byId[id] as FakeElement,
  };
  const storage = makeStorage();
  const { fetchFn, calls } = makeFetch(respond);
  const crypto = makeCrypto(randomIds);
  const testHooks: OperatorPanelTestHooks = {};

  operatorPanelClientScript(fakeDocument, storage, fetchFn, crypto, testHooks);

  return {
    els,
    storage,
    fetchCalls: calls,
    testHooks: testHooks as Required<OperatorPanelTestHooks>,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, bodyText: JSON.stringify(body) };
}

/** Real `fetch()` never throws synchronously; a network failure is always a rejected Promise. */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function formFields(
  overrides: Partial<{
    kind: string;
    projectId: string;
    expectedRevision: number | null;
    evidenceEvent: unknown;
  }> = {},
) {
  return {
    kind: "FORECAST_QUERY",
    projectId: "deboard-v091",
    expectedRevision: null,
    evidenceEvent: null,
    ...overrides,
  };
}

describe("pure logic: computeFormSignature / resolveSubmissionIdentity", () => {
  it("mints a fresh identity on the very first call for a given signature", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const signature = testHooks.computeFormSignature(formFields());
    const identity = testHooks.resolveSubmissionIdentity(
      signature,
      makeStorage(),
      () => "2026-08-30T13:00:00.000Z",
      (() => {
        let n = 0;
        return () => {
          n += 1;
          return `id-${String(n)}`;
        };
      })(),
    );
    expect(identity.intentId).toBe("id-1");
    expect(identity.idempotencyKey).toBe("id-2");
    expect(identity.submittedAt).toBe("2026-08-30T13:00:00.000Z");
  });

  it("mints a new identity when the form signature changes", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const storage = makeStorage();
    let counter = 0;
    const makeId = () => {
      counter += 1;
      return `id-${String(counter)}`;
    };
    const a = testHooks.resolveSubmissionIdentity(
      testHooks.computeFormSignature(formFields({ kind: "FORECAST_QUERY" })),
      storage,
      () => "t1",
      makeId,
    );
    const b = testHooks.resolveSubmissionIdentity(
      testHooks.computeFormSignature(formFields({ kind: "RECOVERY_QUERY" })),
      storage,
      () => "t2",
      makeId,
    );
    expect(a.intentId).not.toBe(b.intentId);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it("reuses the exact stored intentId/idempotencyKey/submittedAt across repeated calls with the same signature", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const storage = makeStorage();
    let counter = 0;
    const makeId = () => {
      counter += 1;
      return `id-${String(counter)}`;
    };
    const signature = testHooks.computeFormSignature(formFields());
    const first = testHooks.resolveSubmissionIdentity(
      signature,
      storage,
      () => "2026-08-30T13:00:00.000Z",
      makeId,
    );
    const second = testHooks.resolveSubmissionIdentity(
      signature,
      storage,
      () => "a-different-timestamp-must-not-win",
      () => "a-different-id-must-not-win",
    );
    expect(second).toEqual(first);
    expect(first.intentId).toBe("id-1");
    expect(first.idempotencyKey).toBe("id-2");
    expect(first.submittedAt).toBe("2026-08-30T13:00:00.000Z");
  });
});

describe("pending/resolved submission identity lifecycle", () => {
  function makeIdSequence(): () => string {
    let counter = 0;
    return () => {
      counter += 1;
      return `id-${String(counter)}`;
    };
  }

  it("an unresolved (PENDING) identity is reused across repeated calls with the same signature", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const storage = makeStorage();
    const signature = testHooks.computeFormSignature(formFields());
    const first = testHooks.resolveSubmissionIdentity(
      signature,
      storage,
      () => "t1",
      makeIdSequence(),
    );
    // Never resolved -- a genuine retry of the same unresolved submission.
    const retry = testHooks.resolveSubmissionIdentity(
      signature,
      storage,
      () => "t2-must-not-win",
      makeIdSequence(),
    );
    expect(retry).toEqual(first);
  });

  it("marking the identity resolved makes the next call with the SAME signature mint a brand-new identity", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const storage = makeStorage();
    const signature = testHooks.computeFormSignature(formFields());
    const makeId = makeIdSequence(); // one shared sequence across both mints
    const first = testHooks.resolveSubmissionIdentity(
      signature,
      storage,
      () => "t1",
      makeId,
    );
    testHooks.markSubmissionResolved(storage);
    const second = testHooks.resolveSubmissionIdentity(
      signature,
      storage,
      () => "t2",
      makeId,
    );
    expect(second.intentId).not.toBe(first.intentId);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second).not.toEqual(first);
  });

  it("markSubmissionResolved is a harmless no-op when nothing is pending", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const storage = makeStorage();
    expect(() => {
      testHooks.markSubmissionResolved(storage);
    }).not.toThrow();
  });
});

describe("pure logic: buildIntentPayload", () => {
  it("builds a QUERY payload with expectedProjectRevision null for a read-only kind", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const payload = testHooks.buildIntentPayload(
      {
        kind: "FORECAST_QUERY",
        projectId: "deboard-v091",
        expectedRevision: null,
        evidenceEvent: null,
      },
      { intentId: "i1", idempotencyKey: "k1", submittedAt: "t1" },
    ) as Record<string, unknown>;
    expect(payload.kind).toBe("FORECAST_QUERY");
    expect(payload.requestedEffect).toBe("READ_ONLY");
    expect(payload.expectedProjectRevision).toBeNull();
    expect(payload.payload).toEqual({ type: "QUERY" });
    expect(payload.source).toEqual({ channel: "OPERATOR_UI" });
  });

  it("builds an EVIDENCE payload with the revision and event for EVIDENCE_APPLY_SHADOW", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const event = { id: "evt-1", baseRevision: 0 };
    const payload = testHooks.buildIntentPayload(
      {
        kind: "EVIDENCE_APPLY_SHADOW",
        projectId: "deboard-v091",
        expectedRevision: 0,
        evidenceEvent: event,
      },
      { intentId: "i1", idempotencyKey: "k1", submittedAt: "t1" },
    ) as Record<string, unknown>;
    expect(payload.kind).toBe("EVIDENCE_APPLY_SHADOW");
    expect(payload.requestedEffect).toBe("APPLY_SHADOW");
    expect(payload.expectedProjectRevision).toBe(0);
    expect(payload.payload).toEqual({ type: "EVIDENCE", event });
  });
});

describe("pure logic: mapOutcomeToDisplay", () => {
  it("renders a successful terminal result", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const display = testHooks.mapOutcomeToDisplay({
      run: {
        intentId: "i1",
        workflowId: "w1",
        state: "SUCCEEDED",
        attempt: 1,
        maxAttempts: 3,
        currentStep: "FINALIZE",
      },
      result: { resultId: "r1", status: "SUCCEEDED", persisted: true },
    });
    expect(display.workflowId).toBe("w1");
    expect(display.workflowState).toBe("SUCCEEDED");
    expect(display.attempt).toBe("1 / 3");
    expect(display.resultId).toBe("r1");
    expect(display.persisted).toBe("true");
    expect(display.showResume).toBe(false);
  });

  it("renders a BLOCKED/REVISION_CONFLICT result with revision-conflict details", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const display = testHooks.mapOutcomeToDisplay({
      run: { workflowId: "w1", state: "BLOCKED" },
      result: {
        status: "BLOCKED",
        problem: {
          code: "REVISION_CONFLICT",
          category: "REVISION",
          message: "stale",
          details: { currentRevision: 3, expectedRevision: 1 },
        },
      },
    });
    expect(display.resultStatus).toBe("BLOCKED");
    expect(String(display.problem)).toContain("REVISION_CONFLICT");
    expect(String(display.revisionConflict)).toContain("currentRevision");
  });

  it("marks showResume true only for an INTERRUPTED run", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const interrupted = testHooks.mapOutcomeToDisplay({
      run: { workflowId: "w1", state: "INTERRUPTED" },
    });
    expect(interrupted.showResume).toBe(true);
    const succeeded = testHooks.mapOutcomeToDisplay({
      run: { workflowId: "w1", state: "SUCCEEDED" },
      result: { status: "SUCCEEDED" },
    });
    expect(succeeded.showResume).toBe(false);
  });

  it("never echoes any field beyond run/result — no secret/stack leakage even if the body carries one", () => {
    const { testHooks } = mount(() => jsonResponse(202, {}));
    const display = testHooks.mapOutcomeToDisplay({
      run: { workflowId: "w1", state: "SUCCEEDED" },
      result: { status: "SUCCEEDED" },
      secret: "HOWLER_ADMIN_KEY=super-secret",
      stack: "Error: boom\\n    at somewhere.js:1:1",
    });
    const serialized = JSON.stringify(display);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("at somewhere.js");
  });
});

describe("DOM wiring: submit", () => {
  it("dispatches exactly one POST /v1/intents with the Authorization header and the built intent body", async () => {
    const { els, fetchCalls } = mount(() =>
      jsonResponse(201, {
        replayed: false,
        run: {
          intentId: "i1",
          workflowId: "w1",
          state: "SUCCEEDED",
          attempt: 1,
          maxAttempts: 3,
        },
        result: { resultId: "r1", status: "SUCCEEDED", persisted: false },
      }),
    );
    els.adminKey.value = "test-key-123";
    els.form.trigger("submit", { preventDefault: () => undefined });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.path).toBe("/v1/intents");
    expect(fetchCalls[0]?.method).toBe("POST");
    expect(fetchCalls[0]?.headers.get("authorization")).toBe(
      "Bearer test-key-123",
    );
    const body = JSON.parse(fetchCalls[0]?.body ?? "{}") as Record<
      string,
      unknown
    >;
    expect(body.kind).toBe("FORECAST_QUERY");
    expect(body.projectId).toBe("deboard-v091");
  });

  it("retrying after a failed fetch reuses the same intentId/idempotencyKey/submittedAt", async () => {
    let call = 0;
    const { els, fetchCalls } = mount(() => {
      call += 1;
      if (call === 1) return { reject: new Error("network error") };
      return jsonResponse(201, {
        run: { intentId: "i1", workflowId: "w1", state: "SUCCEEDED" },
        result: { resultId: "r1", status: "SUCCEEDED", persisted: false },
      });
    });
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    expect(els.runButton.disabled).toBe(false); // settled back to idle after the failure

    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();

    const bodies = fetchCalls
      .filter((c) => c.path === "/v1/intents")
      .map((c) => JSON.parse(c.body ?? "{}") as Record<string, unknown>);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.intentId).toBe(bodies[0]?.intentId);
    expect(bodies[1]?.idempotencyKey).toBe(bodies[0]?.idempotencyKey);
    expect(bodies[1]?.submittedAt).toBe(bodies[0]?.submittedAt);
  });

  it("does not submit a second request while one is already in flight (double-submit protection)", () => {
    const { els, fetchCalls } = mount(() => jsonResponse(202, {}));
    els.form.trigger("submit", { preventDefault: () => undefined });
    els.form.trigger("submit", { preventDefault: () => undefined });
    els.form.trigger("submit", { preventDefault: () => undefined });
    expect(fetchCalls).toHaveLength(1);
    expect(els.runButton.disabled).toBe(true);
  });

  it("a repeated network failure keeps reusing the same identity indefinitely (never resolved)", async () => {
    const { els, fetchCalls } = mount(() => ({
      reject: new Error("network error"),
    }));
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();

    const bodies = fetchCalls.map(
      (c) => JSON.parse(c.body ?? "{}") as Record<string, unknown>,
    );
    expect(bodies).toHaveLength(3);
    expect(bodies[1]?.intentId).toBe(bodies[0]?.intentId);
    expect(bodies[2]?.intentId).toBe(bodies[0]?.intentId);
  });

  it("a deliberate second Run with IDENTICAL form values after a completed (terminal) response mints a brand-new intent -- it is never treated as a replay", async () => {
    const { els, fetchCalls } = mount(() =>
      jsonResponse(201, {
        run: { intentId: "i1", workflowId: "w1", state: "SUCCEEDED" },
        result: { resultId: "r1", status: "SUCCEEDED", persisted: false },
      }),
    );
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    // Deliberate second click, form completely unchanged.
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();

    const bodies = fetchCalls.map(
      (c) => JSON.parse(c.body ?? "{}") as Record<string, unknown>,
    );
    expect(bodies).toHaveLength(2);
    // Identity is proven distinct by the (test-controlled, monotonically distinct) intentId and
    // idempotencyKey; submittedAt uses the real system clock in this DOM-wired path and can
    // legitimately collide at millisecond resolution between two synchronous test steps.
    expect(bodies[1]?.intentId).not.toBe(bodies[0]?.intentId);
    expect(bodies[1]?.idempotencyKey).not.toBe(bodies[0]?.idempotencyKey);
  });

  it("a BLOCKED/409 terminal response also resolves the identity (not just SUCCEEDED)", async () => {
    const { els, fetchCalls } = mount(() =>
      jsonResponse(409, {
        run: { intentId: "i1", workflowId: "w1", state: "BLOCKED" },
        result: {
          resultId: "r1",
          status: "BLOCKED",
          persisted: false,
          problem: { code: "REVISION_CONFLICT" },
        },
      }),
    );
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();

    const bodies = fetchCalls.map(
      (c) => JSON.parse(c.body ?? "{}") as Record<string, unknown>,
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.intentId).not.toBe(bodies[0]?.intentId);
  });
});

describe("DOM wiring: resume", () => {
  it("exposes Resume workflow only after an INTERRUPTED response, and resume calls the exact existing workflow ID with no new /v1/intents call", async () => {
    const { els, fetchCalls } = mount((call) => {
      if (call.path === "/v1/intents") {
        return jsonResponse(202, {
          run: { intentId: "i1", workflowId: "wf-123", state: "INTERRUPTED" },
        });
      }
      return jsonResponse(201, {
        run: { workflowId: "wf-123", state: "SUCCEEDED" },
        result: { resultId: "r1", status: "SUCCEEDED", persisted: false },
      });
    });

    expect(els.resumeButton.hidden).toBe(true);
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    expect(els.resumeButton.hidden).toBe(false);

    els.resumeButton.trigger("click");
    await flushMicrotasks();

    const intentCalls = fetchCalls.filter((c) => c.path === "/v1/intents");
    const resumeCalls = fetchCalls.filter((c) => c.path.endsWith("/resume"));
    expect(intentCalls).toHaveLength(1);
    expect(resumeCalls).toHaveLength(1);
    expect(resumeCalls[0]?.path).toBe("/v1/workflows/wf-123/resume");
    expect(resumeCalls[0]?.method).toBe("POST");
  });

  it("does nothing if resume is clicked with no known workflow yet", () => {
    const { els, fetchCalls } = mount(() => jsonResponse(202, {}));
    els.resumeButton.trigger("click");
    expect(fetchCalls).toHaveLength(0);
  });

  it("202 INTERRUPTED is known server acceptance: it resolves the identity too, so a subsequent deliberate Run (not Resume) with identical form values mints a new intent rather than silently reusing the interrupted one", async () => {
    const { els, fetchCalls } = mount(() =>
      jsonResponse(202, {
        run: { intentId: "i1", workflowId: "wf-123", state: "INTERRUPTED" },
      }),
    );
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();
    // Deliberate second Run (not Resume), identical form values.
    els.form.trigger("submit", { preventDefault: () => undefined });
    await flushMicrotasks();

    const intentCalls = fetchCalls.filter((c) => c.path === "/v1/intents");
    expect(intentCalls).toHaveLength(2);
    const bodies = intentCalls.map(
      (c) => JSON.parse(c.body ?? "{}") as Record<string, unknown>,
    );
    expect(bodies[1]?.intentId).not.toBe(bodies[0]?.intentId);
  });
});

describe("admin key handling", () => {
  it("persists the admin key to sessionStorage on submit, never to a URL", async () => {
    const { els, storage, fetchCalls } = mount(() => jsonResponse(202, {}));
    els.adminKey.value = "my-secret-key";
    els.form.trigger("submit", { preventDefault: () => undefined });
    await Promise.resolve();
    expect(storage.getItem("howler_admin_key")).toBe("my-secret-key");
    expect(fetchCalls[0]?.path).not.toContain("my-secret-key");
  });

  it("preloads a previously-stored session admin key into the input on mount", () => {
    const storage = makeStorage();
    storage.setItem("howler_admin_key", "restored-key");
    const els = {
      form: makeElement(),
      adminKey: makeElement(),
      projectId: makeElement({ value: "deboard-v091" }),
      intentKind: makeElement({ value: "FORECAST_QUERY" }),
      revisionField: makeElement({ hidden: true }),
      expectedRevision: makeElement(),
      evidenceField: makeElement({ hidden: true }),
      evidenceEventJson: makeElement(),
      runButton: makeElement(),
      resumeButton: makeElement({ hidden: true }),
      status: makeElement(),
      outIntentId: makeElement(),
      outWorkflowId: makeElement(),
      outWorkflowState: makeElement(),
      outAttempt: makeElement(),
      outCurrentStep: makeElement(),
      outResultId: makeElement(),
      outResultStatus: makeElement(),
      outPersisted: makeElement(),
      outProblem: makeElement(),
      outRevisionConflict: makeElement(),
    };
    const byId: Record<string, FakeElement> = {
      "intent-form": els.form,
      "admin-key": els.adminKey,
      "project-id": els.projectId,
      "intent-kind": els.intentKind,
      "revision-field": els.revisionField,
      "expected-revision": els.expectedRevision,
      "evidence-field": els.evidenceField,
      "evidence-event-json": els.evidenceEventJson,
      "run-intent": els.runButton,
      "resume-button": els.resumeButton,
      status: els.status,
      "out-intent-id": els.outIntentId,
      "out-workflow-id": els.outWorkflowId,
      "out-workflow-state": els.outWorkflowState,
      "out-attempt": els.outAttempt,
      "out-current-step": els.outCurrentStep,
      "out-result-id": els.outResultId,
      "out-result-status": els.outResultStatus,
      "out-persisted": els.outPersisted,
      "out-problem": els.outProblem,
      "out-revision-conflict": els.outRevisionConflict,
    };
    const fakeDocument: OperatorPanelDocument = {
      getElementById: (id: string) => byId[id] as FakeElement,
    };
    operatorPanelClientScript(
      fakeDocument,
      storage,
      () => Promise.reject(new Error("unused")),
      makeCrypto([]),
      undefined,
    );
    expect(els.adminKey.value).toBe("restored-key");
  });
});

describe("conditional evidence/revision fields", () => {
  it("shows the evidence/revision fields only for evidence kinds", () => {
    const { els } = mount(() => jsonResponse(202, {}));
    expect(els.revisionField.hidden).toBe(true);
    expect(els.evidenceField.hidden).toBe(true);
    els.intentKind.value = "EVIDENCE_APPLY_SHADOW";
    els.intentKind.trigger("change");
    expect(els.revisionField.hidden).toBe(false);
    expect(els.evidenceField.hidden).toBe(false);
    els.intentKind.value = "FORECAST_QUERY";
    els.intentKind.trigger("change");
    expect(els.revisionField.hidden).toBe(true);
    expect(els.evidenceField.hidden).toBe(true);
  });
});
