import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fieldDashboardClientScript,
  fieldDashboardHtml,
} from "../../src/worker/admin";
import type {
  FieldDashboardDocument,
  FieldDashboardElement,
  OperatorPanelFetch,
} from "../../src/worker/admin";
import { voiceBrowserClient } from "../../src/worker/voice-transport";

describe("Task 18 field voice contract", () => {
  it("renders an accessible push-to-talk control and live status region", () => {
    const html = fieldDashboardHtml();
    expect(html).toContain('id="voice-push-to-talk"');
    expect(html).toContain('aria-label="Push to talk"');
    expect(html).toContain('id="voice-status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("embeds the shared voice transport and uses no legacy mutation endpoint", () => {
    const html = fieldDashboardHtml();
    expect(html).toContain("SpeechRecognition");
    expect(html).not.toContain("events/apply-shadow");
    expect(html).not.toContain('sessionStorage.setItem("voice');
  });

  // Pilot activation: fieldDashboardClientScript's submitConversationalTurn/
  // submitConversationalConfirm now legitimately reference `/v1/projects/${...}` -- the already
  // release-gate-allowlisted POST /v1/projects/:id/conversation/turn route (see
  // ACCEPTED_MUTATION_ROUTES in test/safety/release-gate.test.ts), not the pre-Task-15 legacy
  // per-project mutation pattern the test above guards against (which always ended in
  // "events/apply-shadow", still asserted absent above). This test replaces the old blanket
  // "no /v1/projects/ at all" assertion with a precise one: every /v1/projects/ reference in the
  // embedded script must be this one approved route, never anything else.
  it("every /v1/projects/ URL literal in the embedded script is the approved conversation/turn route", () => {
    const html = fieldDashboardHtml();
    // Only code occurrences (a template literal starting with a backtick immediately before
    // "/v1/projects/") count -- explanatory comments elsewhere in this same source (e.g.
    // referencing the unrelated POST /v1/projects/:id/import route) legitimately mention the
    // substring too and must not be mistaken for a second endpoint reference.
    const literalStarts = [
      ...html.matchAll(
        /`\/v1\/projects\/\$\{encodeURIComponent\(projectId\)\}([^`]*)`/g,
      ),
    ];
    expect(literalStarts.length).toBeGreaterThan(0);
    for (const match of literalStarts) {
      expect(match[1]?.startsWith("/conversation/turn")).toBe(true);
    }
  });
});

// ==================================================================================================
// Task 18 shipped-path correction: behavioral harness driving the REAL voiceBrowserClient (embedded
// verbatim into fieldDashboardHtml) against a REAL fieldDashboardClientScript bridge, a fake
// SpeechRecognition, and a fake fetch -- proving Resume/Apply-confirmation/idempotency behavior on
// the actual shipped code path, not just on the disconnected pure resolver/capture/confirmation
// functions (already covered in test/unit/voice-transport.test.ts). Reuses the same "minimal fake
// DOM, no jsdom" approach as test/unit/field-dashboard.test.ts.
// ==================================================================================================

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
          elements.set(id, createElement({ textContent: text, disabled }));
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

function callBody(call: FakeFetchCall | undefined): Record<string, unknown> {
  if (!call) throw new Error("expected a fetch call, got none");
  return JSON.parse(call.body ?? "{}") as Record<string, unknown>;
}

function runBlock(overrides: {
  workflowId?: string;
  state?: string;
}): Record<string, unknown> {
  return {
    workflowId: overrides.workflowId ?? "wf-1",
    state: overrides.state ?? "SUCCEEDED",
    attempt: 1,
    maxAttempts: 3,
    currentStep: "DONE",
    intentId: "intent-x",
  };
}

function submissionBody(overrides: {
  run?: Record<string, unknown>;
  resultStatus?: string;
}): Record<string, unknown> {
  const run = overrides.run ?? runBlock({});
  if (run.state === "INTERRUPTED") {
    return { schemaVersion: "1", replayed: false, run };
  }
  return {
    schemaVersion: "1",
    replayed: false,
    run,
    result: {
      resultId: "result-1",
      status: overrides.resultStatus ?? "SUCCEEDED",
      persisted: true,
    },
  };
}

class FakeSpeechRecognition {
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  aborted = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    /* not exercised by push-to-talk toggle in these tests */
  }
  abort(): void {
    this.aborted = true;
  }
  emitFinal(transcript: string): void {
    this.onresult?.({ results: [{ isFinal: true, 0: { transcript } }] });
  }
  emitInterim(transcript: string): void {
    this.onresult?.({ results: [{ isFinal: false, 0: { transcript } }] });
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

/** Wires a real fieldDashboardClientScript bridge + the real voiceBrowserClient against one shared
 * fake document/fetch, and returns everything a test needs to drive a full push-to-talk cycle. */
function setUpVoiceHarness(respond: Respond, ids: string[] = []) {
  const { document, elements } = makeFakeDocument(STATIC_FIELD_IDS);
  const storage = makeStorage();
  const { fetchFn, calls } = makeFetch(respond);
  const crypto = makeCrypto(ids);
  const bridge = fieldDashboardClientScript(document, storage, fetchFn, crypto);

  const recognitionInstances: FakeSpeechRecognition[] = [];
  const globalAny = globalThis as unknown as {
    SpeechRecognition?: new () => FakeSpeechRecognition;
    webkitSpeechRecognition?: new () => FakeSpeechRecognition;
  };
  globalAny.SpeechRecognition = class extends FakeSpeechRecognition {
    constructor() {
      super();
      recognitionInstances.push(this);
    }
  };

  voiceBrowserClient(document, bridge, () => crypto.randomUUID(), {});

  const foundButton = elements.get("voice-push-to-talk");
  if (!foundButton) throw new Error("missing voice-push-to-talk element");
  const button = foundButton;
  const foundStatus = elements.get("voice-status");
  if (!foundStatus) throw new Error("missing voice-status element");
  const status = foundStatus;

  function startCapture(): FakeSpeechRecognition {
    button.trigger("click");
    const recognition = recognitionInstances.at(-1);
    if (!recognition) throw new Error("recognition was not started");
    return recognition;
  }

  function speak(transcript: string): FakeSpeechRecognition {
    const recognition = startCapture();
    recognition.emitFinal(transcript);
    return recognition;
  }

  return {
    document,
    elements,
    storage,
    calls,
    crypto,
    button,
    status,
    speak,
    startCapture,
    recognitionInstances,
  };
}

afterEach(() => {
  const globalAny = globalThis as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  delete globalAny.SpeechRecognition;
  delete globalAny.webkitSpeechRecognition;
  vi.useRealTimers();
});

// The real chain (fetch -> response.text() -> submitAction's own .then/.catch/.finally) crosses
// several microtask boundaries; a generous tick count keeps this robust to that chain's exact
// depth without resorting to fake timers/wall-clock sleeps.
async function flush(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("Task 18 shipped voice client: Resume never creates a fresh intent", () => {
  it("1: exactly one known interrupted workflow -- Resume calls the exact endpoint, zero extra /v1/intents", async () => {
    const harness = setUpVoiceHarness((call) => {
      if (call.path.includes("/resume")) {
        return {
          ok: true,
          status: 200,
          bodyText: JSON.stringify(
            submissionBody({ run: runBlock({ workflowId: "wf-123" }) }),
          ),
        };
      }
      return {
        ok: true,
        status: 202,
        bodyText: JSON.stringify(
          submissionBody({
            run: runBlock({ workflowId: "wf-123", state: "INTERRUPTED" }),
          }),
        ),
      };
    });

    // Seed exactly one INTERRUPTED workflow the same way the manual UI would (a normal query
    // whose response happens to be INTERRUPTED).
    harness.speak("forecast deboard-v091");
    await flush();
    expect(harness.calls.filter((c) => c.path === "/v1/intents")).toHaveLength(
      1,
    );

    harness.speak("resume");
    await flush();

    const resumeCalls = harness.calls.filter((c) => c.path.includes("/resume"));
    expect(resumeCalls).toHaveLength(1);
    expect(resumeCalls[0]?.path).toBe("/v1/workflows/wf-123/resume");
    expect(resumeCalls[0]?.method).toBe("POST");
    // No fresh intent was created for the Resume itself.
    expect(harness.calls.filter((c) => c.path === "/v1/intents")).toHaveLength(
      1,
    );
  });

  it("2: zero resumable workflows -- clarifies, no fetch call at all", () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    harness.speak("resume");
    expect(harness.status.textContent).toMatch(/^CLARIFICATION/);
    expect(harness.calls).toHaveLength(0);
  });

  it("3: two resumable workflows on the same project -- clarifies, no fetch call at all", async () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 202,
      bodyText: JSON.stringify(
        submissionBody({
          run: runBlock({ workflowId: "wf-123", state: "INTERRUPTED" }),
        }),
      ),
    }));
    harness.speak("forecast deboard-v091");
    await flush();
    harness.speak("recovery plan for deboard-v091");
    await flush();

    const callsBefore = harness.calls.length;
    harness.speak("resume");
    expect(harness.status.textContent).toMatch(/^CLARIFICATION/);
    expect(harness.calls).toHaveLength(callsBefore);
  });
});

describe("Task 18 shipped voice client: Apply confirmation is real", () => {
  function applyHarness() {
    return setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(
        submissionBody({ run: runBlock({ workflowId: "wf-apply" }) }),
      ),
    }));
  }

  function seedEvidence(harness: ReturnType<typeof setUpVoiceHarness>): void {
    const revisionEl = harness.elements.get("fp-0-evidence-revision");
    const jsonEl = harness.elements.get("fp-0-evidence-json");
    if (!revisionEl || !jsonEl)
      throw new Error("evidence fields not rendered for default project");
    revisionEl.value = "4";
    jsonEl.value = JSON.stringify({ eventId: "evt-1" });
  }

  it("initial spoken Apply creates a pending confirmation and posts nothing", () => {
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("apply evidence to deboard-v091");
    expect(harness.status.textContent).toMatch(/^CONFIRMATION_REQUIRED/);
    expect(harness.calls).toHaveLength(0);
  });

  it("affirmative response consumes the confirmation before exactly one POST /v1/intents with the immutable snapshot", async () => {
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("apply evidence to deboard-v091");
    expect(harness.calls).toHaveLength(0);

    // Mutate the live evidence fields AFTER the confirmation was created -- the eventual POST
    // must still use the snapshot bound at confirmation time, never this later value.
    const jsonEl = harness.elements.get("fp-0-evidence-json");
    if (!jsonEl) throw new Error("missing evidence json field");
    jsonEl.value = JSON.stringify({ eventId: "evt-MUTATED" });

    harness.speak("yes");
    await flush();

    const applyCalls = harness.calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        callBody(c).kind === "EVIDENCE_APPLY_SHADOW",
    );
    expect(applyCalls).toHaveLength(1);
    const body = callBody(applyCalls[0]);
    expect(body.expectedProjectRevision).toBe(4);
    const payload = body.payload as {
      type?: string;
      event?: { eventId?: string };
    };
    expect(payload.event?.eventId).toBe("evt-1");
  });

  it("a second affirmative response after consumption produces no second POST", async () => {
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("apply evidence to deboard-v091");
    harness.speak("yes");
    await flush();
    const afterFirst = harness.calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        callBody(c).kind === "EVIDENCE_APPLY_SHADOW",
    ).length;
    expect(afterFirst).toBe(1);

    harness.speak("yes");
    await flush();
    const afterSecond = harness.calls.filter(
      (c) =>
        c.path === "/v1/intents" &&
        callBody(c).kind === "EVIDENCE_APPLY_SHADOW",
    ).length;
    expect(afterSecond).toBe(1);
  });

  it("a late affirmative response after expiry produces no POST", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("apply evidence to deboard-v091");

    vi.setSystemTime(30_001);
    harness.speak("yes");
    await flush();

    expect(
      harness.calls.filter(
        (c) =>
          c.path === "/v1/intents" &&
          callBody(c).kind === "EVIDENCE_APPLY_SHADOW",
      ),
    ).toHaveLength(0);
  });

  it("a negative response cancels and produces no POST", () => {
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("apply evidence to deboard-v091");
    harness.speak("no");
    expect(harness.status.textContent).toBe("CANCELLED");
    expect(harness.calls).toHaveLength(0);
  });

  it("an unrelated standalone yes with no pending confirmation is a no-op", () => {
    const harness = applyHarness();
    harness.speak("yes");
    expect(harness.calls).toHaveLength(0);
  });

  it("a new incompatible command invalidates the pending confirmation and executes instead", async () => {
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("apply evidence to deboard-v091");
    harness.speak("forecast deboard-v091");
    await flush();

    expect(
      harness.calls.filter(
        (c) =>
          c.path === "/v1/intents" && callBody(c).kind === "FORECAST_QUERY",
      ),
    ).toHaveLength(1);

    // The old confirmation is dead: a later "yes" must never resurrect it into an Apply POST.
    harness.speak("yes");
    await flush();
    expect(
      harness.calls.filter(
        (c) =>
          c.path === "/v1/intents" &&
          callBody(c).kind === "EVIDENCE_APPLY_SHADOW",
      ),
    ).toHaveLength(0);
  });

  it("Preview never escalates to Apply -- no confirmation is created and no Apply POST occurs", async () => {
    const harness = applyHarness();
    seedEvidence(harness);
    harness.speak("preview evidence for deboard-v091");
    await flush();
    expect(harness.status.textContent).not.toMatch(/^CONFIRMATION_REQUIRED/);
    harness.speak("yes");
    await flush();
    expect(
      harness.calls.filter(
        (c) =>
          c.path === "/v1/intents" &&
          callBody(c).kind === "EVIDENCE_APPLY_SHADOW",
      ),
    ).toHaveLength(0);
    expect(
      harness.calls.filter(
        (c) =>
          c.path === "/v1/intents" && callBody(c).kind === "EVIDENCE_PREVIEW",
      ),
    ).toHaveLength(1);
  });
});

describe("Task 18 shipped voice client: submission identity reuses the accepted kernel", () => {
  it("a definitive successful outcome resolves identity -- a later deliberate identical command gets a fresh one", async () => {
    const harness = setUpVoiceHarness(
      () => ({
        ok: true,
        status: 200,
        bodyText: JSON.stringify(submissionBody({})),
      }),
      ["intent-a", "key-a", "intent-b", "key-b"],
    );
    harness.speak("forecast deboard-v091");
    await flush();
    const first = callBody(harness.calls.find((c) => c.path === "/v1/intents"));

    harness.speak("forecast deboard-v091");
    await flush();
    const secondCalls = harness.calls.filter((c) => c.path === "/v1/intents");
    expect(secondCalls).toHaveLength(2);
    const second = callBody(secondCalls[1]);

    expect(second.intentId).not.toBe(first.intentId);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("an uncertain (unrecognized 5xx) outcome keeps the identity pending -- a retry reuses it", async () => {
    let call = 0;
    const harness = setUpVoiceHarness(() => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 599, bodyText: "gateway weirdness" };
      }
      return {
        ok: true,
        status: 200,
        bodyText: JSON.stringify(submissionBody({})),
      };
    });
    harness.speak("forecast deboard-v091");
    await flush();
    const first = callBody(harness.calls[0]);

    harness.speak("forecast deboard-v091");
    await flush();
    expect(harness.calls).toHaveLength(2);
    const second = callBody(harness.calls[1]);

    expect(second.intentId).toBe(first.intentId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });
});

describe("Task 18 shipped voice client: project resolution uses the real resolver, not a hardcoded literal", () => {
  it("resolves the exact tracked project id and submits for it", async () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    harness.speak("forecast deboard-v091");
    await flush();
    const body = callBody(harness.calls.find((c) => c.path === "/v1/intents"));
    expect(body.projectId).toBe("deboard-v091");
  });

  it("an unknown project clarifies instead of guessing", () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    harness.speak("forecast some-other-project-9000");
    expect(harness.status.textContent).toMatch(/^CLARIFICATION/);
    expect(harness.calls).toHaveLength(0);
  });

  it("an unrecognized command clarifies rather than defaulting to a forecast query", () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    harness.speak("please water the plants");
    expect(harness.status.textContent).toMatch(/^CLARIFICATION/);
    expect(harness.calls).toHaveLength(0);
  });
});

describe("Task 18 shipped voice client: capture ownership on the real recognition wiring", () => {
  it("an interim result never resolves or submits", () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    const recognition = harness.startCapture();
    recognition.emitInterim("forecast deboard-v091");
    expect(harness.calls).toHaveLength(0);
    expect(harness.status.textContent).toBe("LISTENING");
  });

  it("a duplicate final callback on the same capture resolves only once", async () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    const recognition = harness.startCapture();
    recognition.emitFinal("forecast deboard-v091");
    recognition.emitFinal("forecast deboard-v091");
    await flush();
    expect(harness.calls.filter((c) => c.path === "/v1/intents")).toHaveLength(
      1,
    );
  });

  it("a stale capture's late final callback is ignored once a new deliberate capture has begun, and the new one remains authoritative", async () => {
    const harness = setUpVoiceHarness(() => ({
      ok: true,
      status: 200,
      bodyText: JSON.stringify(submissionBody({})),
    }));
    const first = harness.startCapture(); // click starts A
    harness.button.trigger("click"); // click aborts A
    const second = harness.startCapture(); // click starts B

    // A's callback firing after being superseded must never resolve or submit.
    first.emitFinal("forecast deboard-v091");
    await flush();
    expect(harness.calls).toHaveLength(0);

    // B is still fully functional.
    second.emitFinal("recovery plan for deboard-v091");
    await flush();
    const body = callBody(harness.calls.find((c) => c.path === "/v1/intents"));
    expect(body.kind).toBe("RECOVERY_QUERY");
  });

  it("a later deliberate capture with the exact same spoken text as an earlier one is still a valid new action", async () => {
    const harness = setUpVoiceHarness(
      () => ({
        ok: true,
        status: 200,
        bodyText: JSON.stringify(submissionBody({})),
      }),
      ["intent-1", "key-1", "intent-2", "key-2"],
    );
    harness.speak("forecast deboard-v091");
    await flush();
    harness.speak("forecast deboard-v091");
    await flush();
    expect(harness.calls.filter((c) => c.path === "/v1/intents")).toHaveLength(
      2,
    );
  });
});
