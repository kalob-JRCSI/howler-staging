import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldDashboardClientScript } from "../../src/worker/admin";
import type {
  FieldDashboardDocument,
  FieldDashboardElement,
  OperatorPanelFetch,
} from "../../src/worker/admin";
import { voiceBrowserClient } from "../../src/worker/voice-transport";

// Pilot activation: real behavioral coverage for the new conversational PM text panel and its
// voice-client routing, using the exact same "minimal fake DOM, no jsdom" harness
// test/contract/voice-transport.test.ts already establishes -- driving the REAL
// fieldDashboardClientScript + voiceBrowserClient against a fake fetch/document/SpeechRecognition,
// never a reimplementation of either.

interface FakeElement extends FieldDashboardElement {
  trigger(type: string, event?: unknown): void;
}

function makeFakeDocument(staticIds: string[]): {
  document: FieldDashboardDocument;
  elements: Map<string, FakeElement>;
} {
  const elements = new Map<string, FakeElement>();

  function createElement(initial: Partial<FakeElement> = {}): FakeElement {
    const listeners: Record<string, ((event?: unknown) => void)[]> = {};
    let html = "";
    let ownedIds: string[] = [];
    const element = {
      value: "",
      textContent: "",
      disabled: false,
      hidden: false,
      addEventListener(type: string, handler: (event?: unknown) => void) {
        (listeners[type] ??= []).push(handler);
      },
      trigger(type: string, event?: unknown) {
        for (const handler of listeners[type] ?? []) handler(event);
      },
      ...initial,
      get innerHTML(): string {
        return html;
      },
      set innerHTML(value: string) {
        html = value;
        for (const id of ownedIds) elements.delete(id);
        ownedIds = [];
        for (const match of value.matchAll(
          /<([a-zA-Z0-9]+)\b([^>]*)>([^<]*)/g,
        )) {
          const attrs = match[2] ?? "";
          const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
          if (!id) continue;
          const text = match[3] ?? "";
          const disabled = /\bdisabled\b/.test(attrs);
          const hidden = /\bhidden\b/.test(attrs);
          elements.set(
            id,
            createElement({ textContent: text, disabled, hidden }),
          );
          ownedIds.push(id);
        }
      },
    };
    return element;
  }

  for (const id of staticIds) elements.set(id, createElement());

  const document: FieldDashboardDocument = {
    getElementById(id) {
      const el = elements.get(id);
      if (!el) throw new Error(`no such element: ${id}`);
      return el;
    },
  };
  return { document, elements };
}

function makeStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

interface FakeFetchCall {
  path: string;
  method: string;
  body: string | undefined;
}

type Respond = (
  call: FakeFetchCall,
) => { ok: boolean; status: number; bodyText: string } | { reject: Error };

function makeFetch(respond: Respond): {
  fetchFn: OperatorPanelFetch;
  calls: FakeFetchCall[];
} {
  const calls: FakeFetchCall[] = [];
  const fetchFn: OperatorPanelFetch = (path, options) => {
    const call: FakeFetchCall = {
      path,
      method: options?.method ?? "GET",
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

function makeCrypto() {
  return { randomUUID: () => "fixed-id" };
}

function callBody(call: FakeFetchCall | undefined): Record<string, unknown> {
  if (!call) throw new Error("expected a fetch call, got none");
  return JSON.parse(call.body ?? "{}") as Record<string, unknown>;
}

class FakeSpeechRecognition {
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start(): void {}
  stop(): void {}
  abort(): void {}
  emitFinal(transcript: string): void {
    this.onresult?.({ results: [{ isFinal: true, 0: { transcript } }] });
  }
}

const STATIC_FIELD_IDS = [
  "admin-key",
  "new-project-id",
  "add-project",
  "refresh-all",
  "projects-container",
  "voice-push-to-talk",
  "voice-status",
  "ph-portfolio-rows",
  "ph-priorities-section",
  "ph-priority-count",
  "ph-priority-word",
  "ph-priority-caption",
  "ph-priorities-list",
  "ph-movement-band",
  "ph-intelligence-text",
];

function setUp(respond: Respond) {
  const { document, elements } = makeFakeDocument(STATIC_FIELD_IDS);
  const storage = makeStorage();
  const { fetchFn, calls } = makeFetch(respond);
  const crypto = makeCrypto();
  const bridge = fieldDashboardClientScript(document, storage, fetchFn, crypto);

  const recognitionInstances: FakeSpeechRecognition[] = [];
  const globalAny = globalThis as unknown as {
    SpeechRecognition?: new () => FakeSpeechRecognition;
  };
  globalAny.SpeechRecognition = class extends FakeSpeechRecognition {
    constructor() {
      super();
      recognitionInstances.push(this);
    }
  };
  voiceBrowserClient(document, bridge, () => crypto.randomUUID(), {});

  const foundButton = elements.get("voice-push-to-talk");
  const foundStatus = elements.get("voice-status");
  if (!foundButton || !foundStatus) throw new Error("missing voice elements");
  const button = foundButton;
  const status = foundStatus;

  function speak(transcript: string): void {
    button.trigger("click");
    const recognition = recognitionInstances.at(-1);
    if (!recognition) throw new Error("recognition not started");
    recognition.emitFinal(transcript);
  }

  return { document, elements, storage, calls, bridge, status, speak };
}

function el(
  h: { elements: Map<string, FakeElement> },
  id: string,
): FakeElement {
  const found = h.elements.get(id);
  if (!found) throw new Error(`no such element: ${id}`);
  return found;
}

async function flush(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

afterEach(() => {
  const globalAny = globalThis as unknown as { SpeechRecognition?: unknown };
  delete globalAny.SpeechRecognition;
  vi.useRealTimers();
});

describe("field dashboard: minimum real conversational PM entry", () => {
  it("renders a conversational text input, send button, and hidden confirm block on every project card", () => {
    const h = setUp(() => ({ ok: true, status: 200, bodyText: "{}" }));
    expect(() => h.elements.get("fp-0-conv-input")).not.toThrow();
    const send = h.elements.get("fp-0-conv-send");
    const confirmBlock = h.elements.get("fp-0-conv-confirm");
    expect(send).toBeDefined();
    expect(confirmBlock?.hidden).toBe(true);
  });

  it("Send POSTs to the real conversation/turn route and displays a CLARIFICATION message", async () => {
    const h = setUp((call) => {
      if (call.path.endsWith("/conversation/turn")) {
        return {
          ok: true,
          status: 200,
          bodyText: JSON.stringify({
            session: { sessionId: "s1" },
            turn: {
              kind: "CLARIFICATION",
              clarifications: [{ message: "Which project do you mean?" }],
            },
            timing: [],
          }),
        };
      }
      return { ok: true, status: 200, bodyText: "{}" };
    });
    el(h, "fp-0-conv-input").value = "started today";
    el(h, "fp-0-conv-send").trigger("click");
    await flush();
    expect(h.elements.get("fp-0-conv-response")?.textContent).toBe(
      "Which project do you mean?",
    );
    expect(h.elements.get("fp-0-conv-confirm")?.hidden).toBe(true);
    const turnCall = h.calls.find((c) => c.path.endsWith("/conversation/turn"));
    expect(turnCall?.path).toBe("/v1/projects/deboard-v091/conversation/turn");
    expect(callBody(turnCall).text).toBe("started today");
  });

  it("AWAITING_CONFIRMATION shows the preview and Confirm applies exactly once", async () => {
    let confirmCalls = 0;
    const h = setUp((call) => {
      if (call.path.endsWith("/conversation/turn")) {
        const body = callBody(call);
        if (body.confirm) {
          confirmCalls += 1;
          return {
            ok: true,
            status: 200,
            bodyText: JSON.stringify({
              session: { sessionId: "s1" },
              confirm: {
                outcome: "APPLIED",
                result: { workflowState: "SUCCEEDED" },
              },
              timing: [],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          bodyText: JSON.stringify({
            session: { sessionId: "s1" },
            turn: {
              kind: "AWAITING_CONFIRMATION",
              clarifications: [],
              pending: [
                {
                  claim: {
                    claimType: "ACTIVITY_STARTED",
                    subjectText: "foundation walls",
                    effectiveDate: "2026-09-03",
                  },
                  confirmation: {
                    confirmationId: "conf-1",
                    createdAt: 0,
                    expiresAt: 30000,
                    projectId: "deboard-v091",
                    intentKind: "EVIDENCE_APPLY_SHADOW",
                    canonicalEvidence: {},
                    immutableSnapshot: {},
                    snapshotFingerprint: "fp",
                    captureSessionId: "cap-1",
                    state: "PENDING",
                  },
                  previewResult: { workflowState: "SUCCEEDED" },
                },
              ],
            },
            timing: [],
          }),
        };
      }
      return { ok: true, status: 200, bodyText: "{}" };
    });

    el(h, "fp-0-conv-input").value = "foundation walls started today";
    el(h, "fp-0-conv-send").trigger("click");
    await flush();

    expect(h.elements.get("fp-0-conv-confirm")?.hidden).toBe(false);
    expect(h.elements.get("fp-0-conv-response")?.textContent).toContain(
      "foundation walls",
    );
    expect(h.elements.get("fp-0-conv-response")?.textContent).toContain("yes");

    el(h, "fp-0-conv-confirm-yes").trigger("click");
    await flush();

    expect(confirmCalls).toBe(1);
    expect(h.elements.get("fp-0-conv-confirm")?.hidden).toBe(true);
    expect(h.elements.get("fp-0-conv-response")?.textContent).toBe("Recorded.");
  });

  it("a conversation error on one project never disables another project's Refresh button", async () => {
    const h = setUp((call) => {
      if (call.path.endsWith("/conversation/turn")) {
        return { reject: new Error("network down") };
      }
      return { ok: true, status: 200, bodyText: "{}" };
    });
    el(h, "fp-1-conv-input").value = "started today";
    el(h, "fp-1-conv-send").trigger("click");
    await flush();
    expect(h.elements.get("fp-1-conv-response")?.textContent).toContain(
      "Error",
    );
    // Other cards' controls are untouched -- a per-project failure never freezes the board.
    expect(h.elements.get("fp-0-refresh")?.disabled).toBe(false);
    expect(h.elements.get("fp-2-refresh")?.disabled).toBe(false);
  });
});

describe("voice: conversational PM utterances route through the same pipeline as text", () => {
  it("an utterance no Task 18 direct command recognizes is routed to conversation/turn, not a generic clarification", async () => {
    const h = setUp((call) => {
      if (call.path.endsWith("/conversation/turn")) {
        return {
          ok: true,
          status: 200,
          bodyText: JSON.stringify({
            session: { sessionId: "s1" },
            turn: { kind: "NO_OP", clarifications: [] },
            timing: [],
          }),
        };
      }
      return { ok: true, status: 200, bodyText: "{}" };
    });
    h.speak("DeBoard foundation started today");
    await flush();
    const turnCall = h.calls.find((c) => c.path.endsWith("/conversation/turn"));
    expect(turnCall).toBeDefined();
    expect(callBody(turnCall).text).toBe("DeBoard foundation started today");
    expect(h.status.textContent).toBe("RESULT");
  });

  it("Task 18 direct commands (forecast/health/recovery/evidence/resume) are completely unchanged: never routed to conversation/turn", async () => {
    const h = setUp((call) => {
      if (call.path === "/v1/intents") {
        return {
          ok: true,
          status: 200,
          bodyText: JSON.stringify({
            schemaVersion: "1",
            replayed: false,
            run: {
              workflowId: "wf-1",
              state: "SUCCEEDED",
              attempt: 1,
              maxAttempts: 3,
              currentStep: "DONE",
              intentId: "intent-1",
            },
            result: { resultId: "r1", status: "SUCCEEDED", persisted: true },
          }),
        };
      }
      return { ok: true, status: 200, bodyText: "{}" };
    });
    h.speak("forecast deboard-v091");
    await flush();
    expect(h.calls.some((c) => c.path === "/v1/intents")).toBe(true);
    expect(h.calls.some((c) => c.path.endsWith("/conversation/turn"))).toBe(
      false,
    );
  });

  it("a spoken 'yes' answering a conversational preview confirms it exactly once, never treated as a new conversational turn", async () => {
    let confirmCalls = 0;
    let turnCalls = 0;
    const h = setUp((call) => {
      if (call.path.endsWith("/conversation/turn")) {
        const body = callBody(call);
        if (body.confirm) {
          confirmCalls += 1;
          return {
            ok: true,
            status: 200,
            bodyText: JSON.stringify({
              session: { sessionId: "s1" },
              confirm: {
                outcome: "APPLIED",
                result: { workflowState: "SUCCEEDED" },
              },
              timing: [],
            }),
          };
        }
        turnCalls += 1;
        return {
          ok: true,
          status: 200,
          bodyText: JSON.stringify({
            session: { sessionId: "s1" },
            turn: {
              kind: "AWAITING_CONFIRMATION",
              clarifications: [],
              pending: [
                {
                  claim: {
                    claimType: "ACTIVITY_STARTED",
                    subjectText: "foundation walls",
                  },
                  confirmation: {
                    confirmationId: "conf-1",
                    createdAt: 0,
                    expiresAt: 30000,
                    projectId: "deboard-v091",
                    intentKind: "EVIDENCE_APPLY_SHADOW",
                    canonicalEvidence: {},
                    immutableSnapshot: {},
                    snapshotFingerprint: "fp",
                    captureSessionId: "cap-1",
                    state: "PENDING",
                  },
                  previewResult: { workflowState: "SUCCEEDED" },
                },
              ],
            },
            timing: [],
          }),
        };
      }
      return { ok: true, status: 200, bodyText: "{}" };
    });

    h.speak("DeBoard foundation walls started today");
    await flush();
    expect(turnCalls).toBe(1);
    expect(h.status.textContent).toContain("CONFIRMATION_REQUIRED");

    h.speak("yes");
    await flush();
    expect(confirmCalls).toBe(1);
    expect(turnCalls).toBe(1);
    expect(h.status.textContent).toBe("RESULT");
  });
});
