import { describe, expect, it } from "vitest";
import {
  fieldDashboardClientScript,
  fieldDashboardHtml,
} from "../../src/worker/admin";
import type {
  FieldDashboardDocument,
  FieldDashboardElement,
  FieldDashboardTestHooks,
  OperatorPanelFetch,
} from "../../src/worker/admin";

// Same "minimal fake DOM, no jsdom" philosophy as test/unit/admin-ui.test.ts, extended with a
// container whose innerHTML setter auto-registers ids it finds — enough to faithfully model how
// a real browser's innerHTML setter + getElementById interact, without a full HTML parser.

interface FakeElement extends FieldDashboardElement {
  trigger(type: string, event?: unknown): void;
}

// A single shared registry backs every element (static and dynamically-rendered alike). Every
// element's own innerHTML setter can register/prune ids into this same registry -- a real
// browser's innerHTML setter discards the previous subtree and builds fresh nodes, and this needs
// to hold for *any* element that gets one (a project card's own root, and nested sub-containers
// like its "active workflows" list, which re-render independently of the outer card).
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
        // Group 2 is the whole attribute string of the opening tag -- besides pulling the id out
        // of it, this also lets a rendered `disabled` attribute (e.g. a busy Resume button) be
        // reflected on the created fake element's own `.disabled`, which real innerHTML parsing
        // would do too.
        for (const match of value.matchAll(
          /<([a-zA-Z0-9]+)\b([^>]*)>([^<]*)/g,
        )) {
          const tagName = (match[1] ?? "").toLowerCase();
          const attrs = match[2] ?? "";
          const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
          if (!id) continue;
          const text = match[3] ?? "";
          const disabled = /\bdisabled\b/.test(attrs);
          // A real <textarea>'s initial .value reflects its rendered inner text (unlike other
          // elements, which have no such quirk) -- Genesis review's own scope textarea is
          // rendered pre-filled this way, so a caller that reads .value without first explicitly
          // setting it (i.e. approving the review unedited) must see the same text a real browser
          // would show, not an empty default.
          const initialValue = tagName === "textarea" ? text : "";
          elements.set(
            id,
            createElement({
              textContent: text,
              disabled,
              value: initialValue,
            }),
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

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  hasKey(key: string): boolean;
}

function makeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    hasKey: (key) => store.has(key),
  };
}

interface FakeFetchCall {
  path: string;
  method: string;
  headers: Headers;
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

interface DeferredResponse {
  ok: boolean;
  status: number;
  bodyText: string;
}

interface DeferredCall {
  call: FakeFetchCall;
  resolve: (response: {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }) => void;
}

/** A controllable fetch for tests that need to hold a response open (simulate an in-flight
 * request) while other actions happen, then resolve it later on demand. */
function makeDeferredFetch(): {
  fetchFn: OperatorPanelFetch;
  calls: FakeFetchCall[];
  pending: DeferredCall[];
} {
  const calls: FakeFetchCall[] = [];
  const pending: DeferredCall[] = [];
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
    return new Promise((resolve) => {
      pending.push({ call, resolve });
    });
  };
  return { fetchFn, calls, pending };
}

function resolvePending(
  pending: DeferredCall[],
  predicate: (call: FakeFetchCall) => boolean,
  response: DeferredResponse,
): void {
  const index = pending.findIndex((entry) => predicate(entry.call));
  if (index === -1) throw new Error("no matching pending fetch call");
  const [entry] = pending.splice(index, 1);
  entry?.resolve({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.bodyText),
  });
}

function byProjectAndKind(projectId: string, kind: string) {
  return (call: FakeFetchCall): boolean => {
    const body = callBody(call);
    return body.projectId === projectId && body.kind === kind;
  };
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

function json(body: unknown): string {
  return JSON.stringify(body);
}

function callBody(call: FakeFetchCall | undefined): Record<string, unknown> {
  if (!call) throw new Error("expected a fetch call, got none");
  return JSON.parse(call.body ?? "{}") as Record<string, unknown>;
}

function runBlock(
  overrides: {
    workflowId?: string;
    state?: string;
    attempt?: number;
    maxAttempts?: number;
    currentStep?: string;
  } = {},
): Record<string, unknown> {
  return {
    workflowId: overrides.workflowId ?? "wf-1",
    state: overrides.state ?? "SUCCEEDED",
    attempt: overrides.attempt ?? 1,
    maxAttempts: overrides.maxAttempts ?? 3,
    currentStep: overrides.currentStep ?? "DONE",
    intentId: "intent-x",
  };
}

/** A definitive Task 15 IntentSubmissionResponseV1 body carrying an optional result.output. */
function submissionBody(overrides: {
  run?: Record<string, unknown>;
  resultStatus?: string;
  persisted?: boolean;
  problem?: unknown;
  output?: unknown;
  omitResult?: boolean;
}): Record<string, unknown> {
  const run = overrides.run ?? runBlock();
  if (overrides.omitResult || run.state === "INTERRUPTED") {
    return { schemaVersion: "1", replayed: false, run };
  }
  return {
    schemaVersion: "1",
    replayed: false,
    run,
    result: {
      resultId: "result-1",
      status: overrides.resultStatus ?? "SUCCEEDED",
      persisted: overrides.persisted ?? true,
      ...(overrides.problem ? { problem: overrides.problem } : {}),
      ...(overrides.output ? { output: overrides.output } : {}),
    },
  };
}

const HEALTH_OUTPUT = {
  type: "FORECAST_HEALTH",
  data: {
    completion: {
      optimistic: "2026-09-01",
      likely: "2026-09-10",
      conservative: "2026-09-20",
    },
    meanForecastConfidence: 0.82,
    blockedConstraints: [{ id: "c1", label: "Permit approval" }],
    unverifiedHardConstraints: [],
    openConflicts: [
      { id: "cf1", severity: "HIGH", description: "Crew overlap" },
    ],
    lowCoverage: [],
  },
};

const RECOVERY_OUTPUT = {
  type: "RECOVERY",
  data: {
    recoveryLayer: {
      status: "AT_RISK",
      nextRiskDate: "2026-09-05",
      criticalExposureCount: 2,
      blockedProtectionCount: 1,
      standbyRecoveryCapacityWorkdays: 4,
    },
  },
};

interface Harness {
  document: FieldDashboardDocument;
  elements: Map<string, FakeElement>;
  storage: FakeStorage;
  fetchCalls: FakeFetchCall[];
  testHooks: Required<FieldDashboardTestHooks>;
}

const DEFAULT_RANDOM_IDS = [
  "intent-a",
  "idem-a",
  "intent-b",
  "idem-b",
  "intent-c",
  "idem-c",
  "intent-d",
  "idem-d",
  "intent-e",
  "idem-e",
  "intent-f",
  "idem-f",
  "intent-g",
  "idem-g",
  "intent-h",
  "idem-h",
];

function mountWithFetch(
  fetchFn: OperatorPanelFetch,
  options: { randomIds?: string[]; trackedProjects?: string[] } = {},
): Omit<Harness, "fetchCalls"> {
  const { document, elements } = makeFakeDocument([
    "admin-key",
    "new-project-id",
    "add-project",
    "refresh-all",
    "projects-container",
    "ph-portfolio-rows",
    "ph-priorities-section",
    "ph-priority-count",
    "ph-priority-word",
    "ph-priority-caption",
    "ph-priorities-list",
    "ph-movement-band",
    "ph-intelligence-text",
    "new-project-open",
    "genesis-panel",
    "genesis-text",
    "genesis-analyze",
    "genesis-review",
    "genesis-cancel",
    "genesis-status",
    "index-card-container",
  ]);
  const storage = makeStorage();
  if (options.trackedProjects) {
    storage.setItem(
      "howler_field_tracked_projects",
      JSON.stringify(options.trackedProjects),
    );
  }
  const crypto = makeCrypto(options.randomIds ?? DEFAULT_RANDOM_IDS);
  const testHooks: FieldDashboardTestHooks = {};
  fieldDashboardClientScript(document, storage, fetchFn, crypto, testHooks);
  return {
    document,
    elements,
    storage,
    testHooks: testHooks as Required<FieldDashboardTestHooks>,
  };
}

function mount(
  respond: Respond,
  options: { randomIds?: string[]; trackedProjects?: string[] } = {},
): Harness {
  const { fetchFn, calls } = makeFetch(respond);
  const rest = mountWithFetch(fetchFn, options);
  return { ...rest, fetchCalls: calls };
}

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function el(h: { document: FieldDashboardDocument }, id: string): FakeElement {
  return h.document.getElementById(id) as FakeElement;
}

describe("project card layout", () => {
  it("renders one card per tracked project, each with its own title", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    expect(el(h, "fp-0-title").textContent).toBe("proj-a");
    expect(el(h, "fp-1-title").textContent).toBe("proj-b");
  });

  // Pilot activation: the default roster is now the full 7-project pilot ("KF Live PM
  // Intelligence Dashboard -- New Model v2": DeBoard plus Stewart/Swiderski/Pratt/Carver/
  // Ciurlizza/McMillan), not DeBoard alone -- see DEFAULT_TRACKED_PROJECTS in admin.ts.
  it("defaults to the 7-project pilot roster when nothing is stored", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    const expected = [
      "deboard-v091",
      "stewart-v1",
      "swiderski-v1",
      "pratt-v1",
      "carver-v1",
      "ciurlizza-v1",
      "mcmillan-v1",
    ];
    expected.forEach((projectId, index) => {
      expect(el(h, `fp-${String(index)}-title`).textContent).toBe(projectId);
    });
    expect(() => el(h, `fp-${String(expected.length)}-title`)).toThrow();
  });

  it("keeps each project's priority-actions/risks/status independent -- updating one never touches another", async () => {
    const h = mount(
      (call) => {
        const body = callBody(call);
        if (
          body.projectId === "proj-a" &&
          body.kind === "FORECAST_HEALTH_QUERY"
        ) {
          return {
            ok: true,
            status: 200,
            bodyText: json(submissionBody({ output: HEALTH_OUTPUT })),
          };
        }
        return { ok: true, status: 200, bodyText: json(submissionBody({})) };
      },
      { trackedProjects: ["proj-a", "proj-b"] },
    );
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-priority-actions").textContent).toContain(
      "Permit approval",
    );
    expect(el(h, "fp-1-priority-actions").textContent).toBe("None.");
  });
});

describe("canonical action-kind mapping: refresh fires exactly the three read-only query kinds, one POST each", () => {
  it("Refresh on one card submits FORECAST_QUERY, FORECAST_HEALTH_QUERY, and RECOVERY_QUERY -- and nothing else", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    const kinds = h.fetchCalls.map((c) => callBody(c).kind).sort();
    expect(kinds).toEqual(
      ["FORECAST_HEALTH_QUERY", "FORECAST_QUERY", "RECOVERY_QUERY"].sort(),
    );
    for (const call of h.fetchCalls) {
      expect(call.path).toBe("/v1/intents");
      expect(call.method).toBe("POST");
    }
  });

  it("Refresh all fires the same three queries for every tracked project", async () => {
    const h = mount(
      () => ({ ok: true, status: 200, bodyText: json(submissionBody({})) }),
      {
        trackedProjects: ["proj-a", "proj-b"],
      },
    );
    el(h, "refresh-all").trigger("click");
    await flush();
    // v0.9.6 Task 5: Refresh all now *also* fires one portfolio-summary GET per tracked project
    // (additive, unrelated to this pre-existing /v1/intents query-workflow behavior) -- scoped to
    // /v1/intents calls only, same as the admin-key auto-load test above.
    const intentCalls = h.fetchCalls.filter((c) => c.path === "/v1/intents");
    expect(intentCalls).toHaveLength(6);
    expect(
      intentCalls.filter((c) => callBody(c).projectId === "proj-a"),
    ).toHaveLength(3);
    expect(
      intentCalls.filter((c) => callBody(c).projectId === "proj-b"),
    ).toHaveLength(3);
  });

  it("the explicit evidence action is never auto-fired by Refresh", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(
      h.fetchCalls.some((c) => callBody(c).kind === "EVIDENCE_APPLY_SHADOW"),
    ).toBe(false);
    expect(
      h.fetchCalls.some((c) => callBody(c).kind === "EVIDENCE_PREVIEW"),
    ).toBe(false);
  });

  it("EVIDENCE_APPLY_SHADOW is only submitted when the evidence sub-section is explicitly run", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    expect(h.fetchCalls).toHaveLength(1);
    expect(callBody(h.fetchCalls[0]).kind).toBe("EVIDENCE_APPLY_SHADOW");
    expect(callBody(h.fetchCalls[0]).requestedEffect).toBe("APPLY_SHADOW");
  });
});

describe("PM intelligence display, mapped from already-accepted engine/operator outputs only", () => {
  it("shows blocked-constraint priority actions and open-conflict top risks from a FORECAST_HEALTH_QUERY result", async () => {
    const h = mount((call) => {
      const body = callBody(call);
      if (body.kind === "FORECAST_HEALTH_QUERY") {
        return {
          ok: true,
          status: 200,
          bodyText: json(submissionBody({ output: HEALTH_OUTPUT })),
        };
      }
      return { ok: true, status: 200, bodyText: json(submissionBody({})) };
    });
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-priority-actions").textContent).toContain(
      "Permit approval",
    );
    expect(el(h, "fp-0-risks").textContent).toContain("Crew overlap");
    expect(el(h, "fp-0-status").textContent).toContain("2026-09-10");
  });

  it("shows recovery exposure/next-risk-date from a RECOVERY_QUERY result", async () => {
    const h = mount((call) => {
      const body = callBody(call);
      if (body.kind === "RECOVERY_QUERY") {
        return {
          ok: true,
          status: 200,
          bodyText: json(submissionBody({ output: RECOVERY_OUTPUT })),
        };
      }
      return { ok: true, status: 200, bodyText: json(submissionBody({})) };
    });
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-forecast").textContent).toContain("2026-09-05");
    expect(el(h, "fp-0-risks").textContent).toContain(
      "Critical recovery exposure: 2",
    );
  });

  it("recommends resolving blocked constraints ahead of open conflicts (deterministic priority order, no new algorithm)", async () => {
    const h = mount((call) => {
      const body = callBody(call);
      if (body.kind === "FORECAST_HEALTH_QUERY") {
        return {
          ok: true,
          status: 200,
          bodyText: json(submissionBody({ output: HEALTH_OUTPUT })),
        };
      }
      return { ok: true, status: 200, bodyText: json(submissionBody({})) };
    });
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-recommendation").textContent).toMatch(
      /Resolve 1 blocked constraint/,
    );
  });

  it("shows a neutral placeholder recommendation before any Refresh has run", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    expect(el(h, "fp-0-recommendation").textContent).toBe(
      "Run Refresh to load project intelligence.",
    );
  });
});

describe("workflow-state awareness", () => {
  it("INTERRUPTED shows Resume; clicking Resume calls /v1/workflows/:id/resume with the exact workflowId from the run", async () => {
    const h = mount((call) => {
      if (call.path.includes("/resume")) {
        return {
          ok: true,
          status: 200,
          bodyText: json(
            submissionBody({
              run: runBlock({ workflowId: "wf-xyz", state: "SUCCEEDED" }),
            }),
          ),
        };
      }
      return {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-xyz", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      };
    });
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    // Refresh fires all 3 read-only kinds; FORECAST_QUERY's own row exposes Resume.
    expect(() => el(h, "fp-0-resume-FORECAST_QUERY")).not.toThrow();
    el(h, "fp-0-resume-FORECAST_QUERY").trigger("click");
    await flush();
    const resumeCall = h.fetchCalls.find((c) => c.path.includes("/resume"));
    expect(resumeCall?.path).toBe("/v1/workflows/wf-xyz/resume");
  });

  it("shows a structured problem for a BLOCKED/revision-conflict result in the active-workflows list", async () => {
    const h = mount(() => ({
      ok: true,
      status: 409,
      bodyText: json(
        submissionBody({
          run: runBlock({ state: "BLOCKED" }),
          resultStatus: "BLOCKED",
          problem: {
            code: "REVISION_CONFLICT",
            details: { expected: 3, actual: 4 },
          },
        }),
      ),
    }));
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    expect(el(h, "fp-0-active-workflows").innerHTML).toContain(
      "REVISION_CONFLICT",
    );
    // BLOCKED is not resumable -- no Resume control for it.
    expect(() => el(h, "fp-0-resume-EVIDENCE_PREVIEW")).toThrow();
  });

  it("a SUCCEEDED result does not appear in the active-workflows/needs-attention list, but raw JSON is still populated", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-active-workflows").innerHTML).toContain(
      "No active or blocked workflows.",
    );
    expect(el(h, "fp-0-raw").textContent.length).toBeGreaterThan(0);
  });
});

describe("double-submit protection", () => {
  it("a second Refresh click while the first is still in flight does not fire a second round of queries", async () => {
    let resolveFirst: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const h = mount((call) => {
      void call;
      return { ok: true, status: 200, bodyText: json(submissionBody({})) };
    });
    el(h, "fp-0-refresh").trigger("click");
    expect(el(h, "fp-0-refresh").disabled).toBe(true);
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    resolveFirst?.();
    void pending;
    expect(h.fetchCalls).toHaveLength(3);
  });
});

describe("Task 16A uncertain-delivery identity semantics, reused via the shared kernel", () => {
  it("an arbitrary 500 leaves the identity PENDING; a retry of the same action reuses the same intentId", async () => {
    let call = 0;
    const h = mount((c) => {
      void c;
      call += 1;
      if (call === 1)
        return { ok: false, status: 500, bodyText: "server error" };
      return { ok: true, status: 200, bodyText: json(submissionBody({})) };
    });
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstIntentId = callBody(h.fetchCalls[0]).intentId;
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const secondIntentId = callBody(h.fetchCalls[1]).intentId;
    expect(secondIntentId).toBe(firstIntentId);
  });

  it("a definitive SUCCEEDED result resolves the identity; a later deliberate identical action mints a new one", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstIntentId = callBody(h.fetchCalls[0]).intentId;
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const secondIntentId = callBody(h.fetchCalls[1]).intentId;
    expect(secondIntentId).not.toBe(firstIntentId);
  });

  it("two different projects' identical query kinds get independent identity slots (never stomp each other)", async () => {
    const h = mount(() => ({ ok: false, status: 500, bodyText: "err" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    el(h, "fp-1-refresh").trigger("click");
    await flush();
    const projAHealthIntent = callBody(
      h.fetchCalls.find(
        (c) =>
          callBody(c).projectId === "proj-a" &&
          callBody(c).kind === "FORECAST_HEALTH_QUERY",
      ),
    ).intentId;
    const projBHealthIntent = callBody(
      h.fetchCalls.find(
        (c) =>
          callBody(c).projectId === "proj-b" &&
          callBody(c).kind === "FORECAST_HEALTH_QUERY",
      ),
    ).intentId;
    expect(projAHealthIntent).not.toBe(projBHealthIntent);
  });
});

describe("no browser-side forecasting or mutation logic", () => {
  it("mapHealthToDisplay/mapRecoveryToDisplay/recommendNextMove are pure field extraction, not exposed via mutation-capable hooks", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    expect(typeof h.testHooks.escapeHtml).toBe("function");
    expect(typeof h.testHooks.loadTrackedProjects).toBe("function");
    expect(typeof h.testHooks.projectCardHtml).toBe("function");
  });

  it("escapeHtml neutralizes HTML-significant characters in a project id before it reaches innerHTML", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    expect(
      h.testHooks.escapeHtml("<img src=x onerror=alert(1)>"),
    ).not.toContain("<img");
  });
});

describe("add / remove tracked projects (client-side, session-scoped list; no new server capability)", () => {
  it("Add project appends a new card without firing any request", () => {
    // Pinned to an explicit single-project starting list -- independent of the pilot default
    // roster's own exact contents (covered separately above).
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["deboard-v091"],
    });
    el(h, "new-project-id").value = "proj-c";
    el(h, "add-project").trigger("click");
    expect(el(h, "fp-1-title").textContent).toBe("proj-c");
    expect(h.fetchCalls).toHaveLength(0);
    expect(
      JSON.parse(h.storage.getItem("howler_field_tracked_projects") ?? "[]"),
    ).toEqual(["deboard-v091", "proj-c"]);
  });

  it("Remove drops a project's card and persists the shrunk tracked list", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "fp-0-remove").trigger("click");
    expect(el(h, "fp-0-title").textContent).toBe("proj-b");
    expect(
      JSON.parse(h.storage.getItem("howler_field_tracked_projects") ?? "[]"),
    ).toEqual(["proj-b"]);
  });
});

describe("accessibility semantics", () => {
  it("every evidence input/select/textarea is labeled via a matching for/id pair in the generated card HTML", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    const cardHtml = h.testHooks.projectCardHtml("deboard-v091", 0);
    for (const id of [
      "fp-0-evidence-kind",
      "fp-0-evidence-revision",
      "fp-0-evidence-json",
    ]) {
      expect(cardHtml).toContain(`for="${id}"`);
      expect(cardHtml).toContain(`id="${id}"`);
    }
  });

  it("each card exposes an aria-live status region", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    const cardHtml = h.testHooks.projectCardHtml("deboard-v091", 0);
    expect(cardHtml).toMatch(/id="fp-0-card-status" aria-live="polite"/);
  });
});

describe("admin key handling", () => {
  it("never preloads a previously saved admin key from sessionStorage", () => {
    const { document, elements } = makeFakeDocument([
      "admin-key",
      "new-project-id",
      "add-project",
      "refresh-all",
      "projects-container",
      "ph-portfolio-rows",
      "ph-priorities-section",
      "ph-priority-count",
      "ph-priority-word",
      "ph-priority-caption",
      "ph-priorities-list",
      "ph-movement-band",
      "ph-intelligence-text",
    ]);
    const storage = makeStorage();
    storage.setItem("howler_admin_key", "saved-key");
    const { fetchFn } = makeFetch(() => ({
      ok: true,
      status: 200,
      bodyText: "{}",
    }));
    fieldDashboardClientScript(document, storage, fetchFn, makeCrypto([]));
    expect(elements.get("admin-key")?.value).not.toBe("saved-key");
  });

  it("sends the admin key as an Authorization Bearer header on every request", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "admin-key").value = "my-key";
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(h.fetchCalls[0]?.headers.get("Authorization")).toBe("Bearer my-key");
  });

  it("never writes the admin key to sessionStorage/localStorage after use", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "admin-key").value = "my-secret-key";
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(h.storage.getItem("howler_admin_key")).toBeNull();
  });
});

// Phase 2 (product integration), requirement #3: opening Penthouse must load real canonical
// project data automatically -- a Worker route genuinely cannot be read before an admin key
// exists, so "automatic" means the moment a key is entered, never requiring a manual visit to
// Admin & diagnostics or a manual Refresh-all click first.
describe("automatic canonical reads once an admin key is entered", () => {
  it("entering the admin key (change event) automatically loads a summary for every tracked project, without clicking Refresh all", async () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    expect(h.fetchCalls).toHaveLength(0);
    el(h, "admin-key").value = "my-key";
    el(h, "admin-key").trigger("change");
    await flush();
    // Interim review correction (post-Task 5): the primary Penthouse load is explicitly
    // summary-only -- one GET /v1/projects/:id/summary per tracked project -- and never the old
    // FORECAST_QUERY/FORECAST_HEALTH_QUERY/RECOVERY_QUERY /v1/intents workflows. Those remain
    // diagnostics-only, reachable exclusively via an individual card's own Refresh button or the
    // Admin & diagnostics "Refresh all" button (see the still-passing tests below and in the
    // Refresh-all describe block, unaffected by this fix).
    const summaryCalls = h.fetchCalls.filter((c) => /\/summary$/.test(c.path));
    expect(summaryCalls.map((c) => c.path).sort()).toEqual([
      "/v1/projects/proj-a/summary",
      "/v1/projects/proj-b/summary",
    ]);
    const intentCalls = h.fetchCalls.filter((c) => c.path === "/v1/intents");
    expect(intentCalls).toHaveLength(0);
  });

  it("does not re-fire for the same admin key value on a second change event", async () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a"],
    });
    el(h, "admin-key").value = "my-key";
    el(h, "admin-key").trigger("change");
    await flush();
    const firstCount = h.fetchCalls.length;
    el(h, "admin-key").trigger("change");
    await flush();
    expect(h.fetchCalls).toHaveLength(firstCount);
  });

  it("an empty admin key never triggers a query", async () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a"],
    });
    el(h, "admin-key").trigger("change");
    await flush();
    expect(h.fetchCalls).toHaveLength(0);
  });
});

// Phase 2 (product integration), requirement #3: the browser's tracked-project roster is never
// proof a project exists in D1 -- a PROJECT_NOT_FOUND read must render an explicit, honest
// unavailable state, never stale placeholder dashes or fabricated data.
describe("missing-project honesty (PROJECT_NOT_FOUND)", () => {
  const PROJECT_NOT_FOUND_PROBLEM = {
    code: "PROJECT_NOT_FOUND",
    category: "INTERNAL",
    message: "no such project",
    retryable: false,
  };

  it("shows the explicit unavailable banner when a canonical read comes back PROJECT_NOT_FOUND", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ state: "FAILED" }),
          resultStatus: "FAILED",
          problem: PROJECT_NOT_FOUND_PROBLEM,
        }),
      ),
    }));
    expect(el(h, "fp-0-unavailable").hidden).toBe(true);
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-unavailable").hidden).toBe(false);
  });

  it("clears the unavailable banner once a later read for the same project succeeds", async () => {
    let shouldFail = true;
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(
        shouldFail
          ? submissionBody({
              run: runBlock({ state: "FAILED" }),
              resultStatus: "FAILED",
              problem: PROJECT_NOT_FOUND_PROBLEM,
            })
          : submissionBody({}),
      ),
    }));
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-unavailable").hidden).toBe(false);
    shouldFail = false;
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-unavailable").hidden).toBe(true);
  });
});

// Phase 2 (product integration), requirement #2: Facts (actual known state) / Commitments
// (expected work) / Unknowns, derived only from the forecast engine's own already-computed
// per-activity truthState (src/engine/solver.ts) -- never invented schedule content.
describe("Facts / Commitments / Unknowns, derived from the real FORECAST_QUERY response", () => {
  const FORECAST_OUTPUT = {
    type: "FORECAST",
    data: {
      modelRevision: 3,
      latest: {
        activityForecasts: {
          "act-1": {
            activityId: "act-1",
            activityName: "Foundation",
            truthState: "SATISFIED",
          },
          "act-2": {
            activityId: "act-2",
            activityName: "Framing",
            truthState: "COMMITTED",
          },
          "act-3": {
            activityId: "act-3",
            activityName: "Roofing",
            truthState: "FORECASTED",
          },
        },
      },
    },
  };

  it("groups activities by truthState into Facts/Commitments/Unknowns counts and names", async () => {
    const h = mount((call) => ({
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          output:
            callBody(call).kind === "FORECAST_QUERY"
              ? FORECAST_OUTPUT
              : undefined,
        }),
      ),
    }));
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-facts").textContent).toContain("1");
    expect(el(h, "fp-0-facts").textContent).toContain("Foundation");
    expect(el(h, "fp-0-commitments").textContent).toContain("1");
    expect(el(h, "fp-0-commitments").textContent).toContain("Framing");
    expect(el(h, "fp-0-unknowns").textContent).toContain("1");
    expect(el(h, "fp-0-unknowns").textContent).toContain("Roofing");
  });

  it("never fabricates a breakdown before any forecast has been read", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    expect(el(h, "fp-0-facts").textContent).toBe(String.fromCharCode(8212));
    expect(el(h, "fp-0-commitments").textContent).toBe(
      String.fromCharCode(8212),
    );
    expect(el(h, "fp-0-unknowns").textContent).toBe(String.fromCharCode(8212));
  });
});

// v0.9.6 Task 5: a portfolio card is now the compact, summary-derived Penthouse map entry (see
// "portfolio summary cards" below) -- selecting one renders that one project's compact Index Card
// shell into #index-card-container. Never all tracked projects' cards at once.
describe("selecting a portfolio row opens that project's Index Card", () => {
  it("clicking a portfolio row selects that project and renders its Index Card container", async () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "ph-row-1").trigger("click");
    await flush();
    expect(el(h, "index-card-container").innerHTML).toContain("proj-b");
  });

  it("does nothing for a row whose project is no longer tracked", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a"],
    });
    expect(() => {
      el(h, "ph-row-0").trigger("click");
    }).not.toThrow();
  });

  it("shows only one project's Index Card at a time, replacing the previous selection", async () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "ph-row-0").trigger("click");
    await flush();
    expect(el(h, "index-card-container").innerHTML).toContain("proj-a");
    el(h, "ph-row-1").trigger("click");
    await flush();
    const html = el(h, "index-card-container").innerHTML;
    expect(html).toContain("proj-b");
    expect(html).not.toContain("proj-a");
  });
});

// Phase 2 (product integration), requirement #8 (board resilience): a reasoning/clarification
// problem or a stuck request for one project must never freeze another project's workspace.
// conversationInFlight and the query/evidence inFlight set are both keyed strictly by projectId
// (see submitConversationalTurn/submitAction above) -- this proves that in practice, at the DOM
// level a pilot user actually interacts with.
describe("board resilience: one project's stuck conversation never blocks another project's reads", () => {
  it("proj-b's Refresh completes normally while proj-a's conversational turn is still in flight", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const rest = mountWithFetch(fetchFn, {
      trackedProjects: ["proj-a", "proj-b"],
    });
    const h = { ...rest, fetchCalls: calls };

    el(h, "fp-0-conv-input").value = "Foundation walls started today";
    el(h, "fp-0-conv-send").trigger("click");
    await flush();
    expect(el(h, "fp-0-conv-response").textContent).toBe("Working…");
    expect(pending.some((entry) => entry.call.path.includes("proj-a"))).toBe(
      true,
    );

    el(h, "fp-1-refresh").trigger("click");
    await flush();

    for (const kind of [
      "FORECAST_QUERY",
      "FORECAST_HEALTH_QUERY",
      "RECOVERY_QUERY",
    ]) {
      resolvePending(pending, byProjectAndKind("proj-b", kind), {
        ok: true,
        status: 200,
        bodyText: json(
          submissionBody({
            output:
              kind === "FORECAST_HEALTH_QUERY" ? HEALTH_OUTPUT : undefined,
          }),
        ),
      });
    }
    await flush();

    expect(el(h, "fp-1-status").textContent).toContain("2026-09-10");
    expect(el(h, "fp-1-card-status").textContent).toBe("Ready.");
    // proj-a's conversation is still genuinely unresolved throughout -- it never errored out and
    // never blocked proj-b's own reads from completing.
    expect(el(h, "fp-0-conv-response").textContent).toBe("Working…");
    expect(pending.some((entry) => entry.call.path.includes("proj-a"))).toBe(
      true,
    );
  });
});

// -----------------------------------------------------------------------------------------------
// TASK 16B CORRECTION: state and workflow ownership must be keyed by stable projectId (+ action
// kind), never by mutable render index -- a card's index shifts whenever an earlier project is
// removed, and a shared per-card workflow slot lets one action's response hide another's.
// -----------------------------------------------------------------------------------------------

describe("HIGH 1: state is keyed by stable projectId, not mutable render index", () => {
  it("a delayed response for a removed project never writes into the project that shifted into its old slot", async () => {
    const { fetchFn, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "fp-0-refresh").trigger("click"); // proj-a's 3 queries, held open
    await flush();
    expect(el(h, "fp-1-title").textContent).toBe("proj-b");

    el(h, "fp-0-remove").trigger("click"); // proj-b now occupies index 0
    expect(el(h, "fp-0-title").textContent).toBe("proj-b");

    resolvePending(
      pending,
      byProjectAndKind("proj-a", "FORECAST_HEALTH_QUERY"),
      {
        ok: true,
        status: 200,
        bodyText: json(submissionBody({ output: HEALTH_OUTPUT })),
      },
    );
    await flush();

    // proj-b, now at index 0, must show none of proj-a's data.
    expect(el(h, "fp-0-priority-actions").textContent).toBe("None.");
    expect(el(h, "fp-0-risks").textContent).toBe("None.");
    expect(el(h, "fp-0-recommendation").textContent).toBe(
      "Run Refresh to load project intelligence.",
    );
  });

  it("an uncertain-delivery identity survives project removal and re-add, and a retry reuses it", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstBody = callBody(calls[0]);
    resolvePending(pending, byProjectAndKind("proj-a", "EVIDENCE_PREVIEW"), {
      ok: false,
      status: 500,
      bodyText: "server error",
    });
    await flush();

    el(h, "fp-0-remove").trigger("click");
    expect(() => el(h, "fp-0-title")).toThrow();

    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    expect(el(h, "fp-0-title").textContent).toBe("proj-a");

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const secondBody = callBody(calls[1]);

    expect(secondBody.intentId).toBe(firstBody.intentId);
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
    expect(secondBody.submittedAt).toBe(firstBody.submittedAt);
  });

  it("removing a middle project leaves a newly added project with none of its cached state", async () => {
    const h = mount(
      (call) => {
        const body = callBody(call);
        if (
          body.projectId === "proj-b" &&
          body.kind === "FORECAST_HEALTH_QUERY"
        ) {
          return {
            ok: true,
            status: 200,
            bodyText: json(submissionBody({ output: HEALTH_OUTPUT })),
          };
        }
        return { ok: true, status: 200, bodyText: json(submissionBody({})) };
      },
      { trackedProjects: ["proj-a", "proj-b", "proj-c"] },
    );
    el(h, "fp-1-refresh").trigger("click"); // proj-b
    await flush();
    expect(el(h, "fp-1-priority-actions").textContent).toContain(
      "Permit approval",
    );

    el(h, "fp-1-remove").trigger("click"); // tracked: [proj-a, proj-c]
    expect(el(h, "fp-1-title").textContent).toBe("proj-c");

    el(h, "new-project-id").value = "proj-d";
    el(h, "add-project").trigger("click"); // tracked: [proj-a, proj-c, proj-d]
    expect(el(h, "fp-2-title").textContent).toBe("proj-d");
    expect(el(h, "fp-2-priority-actions").textContent).toBe("None.");
    expect(el(h, "fp-2-risks").textContent).toBe("None.");
    expect(el(h, "fp-2-recommendation").textContent).toBe(
      "Run Refresh to load project intelligence.",
    );
  });
});

describe("HIGH 2: each action kind owns its own workflow state -- one kind's success cannot hide another kind's INTERRUPTED/Resume", () => {
  it("FORECAST_HEALTH_QUERY going INTERRUPTED stays visible with Resume even after FORECAST_QUERY and RECOVERY_QUERY succeed", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });
    el(h, "fp-0-refresh").trigger("click");
    await flush();

    resolvePending(
      pending,
      byProjectAndKind("proj-a", "FORECAST_HEALTH_QUERY"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-health", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    resolvePending(pending, byProjectAndKind("proj-a", "FORECAST_QUERY"), {
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ workflowId: "wf-forecast", state: "SUCCEEDED" }),
        }),
      ),
    });
    await flush();
    resolvePending(pending, byProjectAndKind("proj-a", "RECOVERY_QUERY"), {
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ workflowId: "wf-recovery", state: "SUCCEEDED" }),
          output: RECOVERY_OUTPUT,
        }),
      ),
    });
    await flush();

    // The INTERRUPTED health workflow is still represented with its own Resume control.
    expect(() => el(h, "fp-0-resume-FORECAST_HEALTH_QUERY")).not.toThrow();
    expect(el(h, "fp-0-active-workflows").innerHTML).toContain("INTERRUPTED");

    // Its Resume calls exactly the stored workflowId via the resume endpoint, not a new intent.
    const callsBeforeResume = calls.length;
    el(h, "fp-0-resume-FORECAST_HEALTH_QUERY").trigger("click");
    await flush();
    expect(calls).toHaveLength(callsBeforeResume + 1);
    const resumeCall = calls[callsBeforeResume];
    expect(resumeCall?.path).toBe("/v1/workflows/wf-health/resume");
    expect(resumeCall?.method).toBe("POST");

    // Forecast/recovery's own successful results are still reflected, undisturbed by the resume.
    expect(el(h, "fp-0-forecast").textContent).toContain("2026-09-05");
  });
});

// -----------------------------------------------------------------------------------------------
// TASK 16B FINAL SAFETY CORRECTION
// -----------------------------------------------------------------------------------------------

describe("HIGH: Resume and a fresh submission share the same project+kind ownership lock", () => {
  it("a fresh EVIDENCE_APPLY_SHADOW submission is blocked while its own Resume is in flight; unrelated kinds are unaffected; a later Apply after resolution gets a fresh identity", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstIntentId = callBody(calls[0]).intentId;
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-apply", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();

    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    const callsBeforeRetry = calls.length;
    expect(el(h, "fp-0-evidence-run").disabled).toBe(true);

    // A fresh EVIDENCE_APPLY_SHADOW submission while Resume is pending must not fire.
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    expect(calls).toHaveLength(callsBeforeRetry);

    const resumeCall = calls.find((c) => c.path.includes("/resume"));
    expect(resumeCall?.path).toBe("/v1/workflows/wf-apply/resume");
    expect(resumeCall?.method).toBe("POST");

    // An unrelated kind for the same project is not blocked.
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(calls.some((c) => callBody(c).kind === "FORECAST_QUERY")).toBe(true);

    // Resolve Resume definitively.
    resolvePending(pending, (c) => c.path === "/v1/workflows/wf-apply/resume", {
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ workflowId: "wf-apply", state: "SUCCEEDED" }),
        }),
      ),
    });
    await flush();
    expect(el(h, "fp-0-evidence-run").disabled).toBe(false);

    // A later deliberate Apply now runs, and mints a fresh logical identity.
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const lastCall = calls[calls.length - 1];
    expect(callBody(lastCall).intentId).not.toBe(firstIntentId);
  });
});

describe("MEDIUM: resolved/inactive project state is cleaned up on removal; active/uncertain/resumable state is preserved", () => {
  it("A: resolved, inactive project state (health/recovery/pending identity) is cleared on removal; re-add starts fresh", async () => {
    const h = mount(
      (call) => {
        const body = callBody(call);
        if (
          body.projectId === "proj-a" &&
          body.kind === "FORECAST_HEALTH_QUERY"
        ) {
          return {
            ok: true,
            status: 200,
            bodyText: json(submissionBody({ output: HEALTH_OUTPUT })),
          };
        }
        return { ok: true, status: 200, bodyText: json(submissionBody({})) };
      },
      { trackedProjects: ["proj-a"] },
    );
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-priority-actions").textContent).toContain(
      "Permit approval",
    );
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_FORECAST_HEALTH_QUERY"),
    ).toBe(true);

    el(h, "fp-0-remove").trigger("click");
    expect(() => el(h, "fp-0-title")).toThrow();
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_FORECAST_HEALTH_QUERY"),
    ).toBe(false);
    expect(h.storage.hasKey("howler_field_pending_proj-a_FORECAST_QUERY")).toBe(
      false,
    );
    expect(h.storage.hasKey("howler_field_pending_proj-a_RECOVERY_QUERY")).toBe(
      false,
    );

    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    expect(el(h, "fp-0-title").textContent).toBe("proj-a");
    expect(el(h, "fp-0-priority-actions").textContent).toBe("None.");
    expect(el(h, "fp-0-recommendation").textContent).toBe(
      "Run Refresh to load project intelligence.",
    );
  });

  it("B: an uncertain (PENDING) submission's identity is preserved on removal and reused on re-add + retry", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstBody = callBody(calls[0]);
    resolvePending(pending, byProjectAndKind("proj-a", "EVIDENCE_PREVIEW"), {
      ok: false,
      status: 500,
      bodyText: "server error",
    });
    await flush();
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_PREVIEW"),
    ).toBe(true);

    el(h, "fp-0-remove").trigger("click");
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_PREVIEW"),
    ).toBe(true);

    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const secondBody = callBody(calls[1]);
    expect(secondBody.intentId).toBe(firstBody.intentId);
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
    expect(secondBody.submittedAt).toBe(firstBody.submittedAt);
  });

  it("C: an INTERRUPTED workflow is preserved on removal and can still Resume the exact workflowId after re-add", async () => {
    const h = mount(
      () => ({
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-c", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      }),
      { trackedProjects: ["proj-a"] },
    );
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();

    el(h, "fp-0-remove").trigger("click");
    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");

    expect(() => el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW")).not.toThrow();
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    const resumeCall = h.fetchCalls.find((c) => c.path.includes("/resume"));
    expect(resumeCall?.path).toBe("/v1/workflows/wf-c/resume");
  });

  it("D: state required for an in-flight Resume is not destroyed by removing the project mid-flight", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstIntentId = callBody(calls[0]).intentId;
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-d", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();

    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();

    // Remove the project while its Resume is still in flight.
    el(h, "fp-0-remove").trigger("click");
    expect(() => el(h, "fp-0-title")).toThrow();

    // The deferred Resume resolves after removal -- must not throw, and must reach the
    // preserved (not destroyed) state.
    expect(() => {
      resolvePending(pending, (c) => c.path === "/v1/workflows/wf-d/resume", {
        ok: true,
        status: 200,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-d", state: "SUCCEEDED" }),
          }),
        ),
      });
    }).not.toThrow();
    await flush();

    // Re-adding shows the resolved outcome was correctly applied to preserved state, not lost.
    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    expect(el(h, "fp-0-active-workflows").innerHTML).toContain(
      "No active or blocked workflows.",
    );

    // The definitive SUCCEEDED resolution reached the actual persisted identity record (not a
    // copy that got silently dropped) -- a later deliberate Apply mints a fresh logical identity.
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const lastCallD = calls[calls.length - 1];
    expect(callBody(lastCallD).intentId).not.toBe(firstIntentId);
  });
});

// -----------------------------------------------------------------------------------------------
// TASK 16B FINAL MEDIUM CORRECTION
// -----------------------------------------------------------------------------------------------

describe("MEDIUM 1: evidence busy state reflects only the currently-selected intent kind", () => {
  it("1: Apply Resume pending disables Apply but not Preview; switching selection recomputes immediately; Preview still submits independently", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-apply", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();

    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();

    expect(el(h, "fp-0-evidence-kind").value).toBe("EVIDENCE_APPLY_SHADOW");
    expect(el(h, "fp-0-evidence-run").disabled).toBe(true);

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-kind").trigger("change");
    expect(el(h, "fp-0-evidence-run").disabled).toBe(false);

    const callsBeforePreview = calls.length;
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    expect(calls).toHaveLength(callsBeforePreview + 1);
    expect(callBody(calls[calls.length - 1]).kind).toBe("EVIDENCE_PREVIEW");
    // Apply's Resume is still pending, independently of Preview.
    expect(el(h, "fp-0-active-workflows").innerHTML).toContain("INTERRUPTED");

    // 2: while Preview is pending, switching back to Apply must still show disabled -- Apply's
    // own Resume still owns that kind.
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-kind").trigger("change");
    expect(el(h, "fp-0-evidence-run").disabled).toBe(true);
  });

  it("3: project B's evidence controls are unaffected by project A's busy Apply Resume", async () => {
    const { fetchFn, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, {
      trackedProjects: ["proj-a", "proj-b"],
    });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-apply", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    expect(el(h, "fp-0-evidence-run").disabled).toBe(true);

    el(h, "fp-1-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    expect(el(h, "fp-1-evidence-run").disabled).toBe(false);
  });

  it("project B's Apply submission is actually accepted while project A's Apply Resume is pending", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, {
      trackedProjects: ["proj-a", "proj-b"],
    });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-apply", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();

    const callsBeforeB = calls.length;
    el(h, "fp-1-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-1-evidence-json").value = "{}";
    el(h, "fp-1-evidence-run").trigger("click");
    await flush();
    expect(calls).toHaveLength(callsBeforeB + 1);
    const bCall = calls[calls.length - 1];
    expect(callBody(bCall).projectId).toBe("proj-b");
    expect(callBody(bCall).kind).toBe("EVIDENCE_APPLY_SHADOW");
  });

  it("4: a second Resume attempt is blocked while the first is already in flight", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-apply", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    const callsAfterFirstResume = calls.length;
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    expect(calls).toHaveLength(callsAfterFirstResume);
  });

  it("the Resume button itself shows a visual disabled state while its own request is in flight, and re-enables after it settles", async () => {
    const { fetchFn, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-vis", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    expect(el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").disabled).toBe(false);

    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    expect(el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").disabled).toBe(true);

    resolvePending(pending, (c) => c.path === "/v1/workflows/wf-vis/resume", {
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ workflowId: "wf-vis", state: "SUCCEEDED" }),
        }),
      ),
    });
    await flush();
    expect(el(h, "fp-0-active-workflows").innerHTML).toContain(
      "No active or blocked workflows.",
    );
  });
});

describe("MEDIUM 2: untracked project state is purged automatically once the last active action for it settles", () => {
  it("A: active Resume then remove -- preserved while pending, purged after terminal settlement, other projects unaffected", async () => {
    const { fetchFn, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, {
      trackedProjects: ["proj-a", "proj-b"],
    });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-a", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();

    el(h, "fp-0-remove").trigger("click");
    expect(el(h, "fp-0-title").textContent).toBe("proj-b");
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_APPLY_SHADOW"),
    ).toBe(true);

    resolvePending(pending, (c) => c.path === "/v1/workflows/wf-a/resume", {
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ workflowId: "wf-a", state: "SUCCEEDED" }),
        }),
      ),
    });
    await flush();

    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_APPLY_SHADOW"),
    ).toBe(false);
    expect(el(h, "fp-0-title").textContent).toBe("proj-b");

    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    expect(el(h, "fp-1-title").textContent).toBe("proj-a");
    expect(el(h, "fp-1-recommendation").textContent).toBe(
      "Run Refresh to load project intelligence.",
    );
  });

  it("B: with two active action kinds, purge waits for both to settle", async () => {
    const { fetchFn, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-kind").trigger("change");
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();

    el(h, "fp-0-remove").trigger("click");
    expect(() => el(h, "fp-0-title")).toThrow();

    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 200,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-b1", state: "SUCCEEDED" }),
          }),
        ),
      },
    );
    await flush();
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_APPLY_SHADOW"),
    ).toBe(true); // Preview is still active -- must not purge yet.

    resolvePending(pending, byProjectAndKind("proj-a", "EVIDENCE_PREVIEW"), {
      ok: true,
      status: 200,
      bodyText: json(
        submissionBody({
          run: runBlock({ workflowId: "wf-b2", state: "SUCCEEDED" }),
        }),
      ),
    });
    await flush();
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_APPLY_SHADOW"),
    ).toBe(false);
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_PREVIEW"),
    ).toBe(false);
  });

  it("C: an action that settles UNCERTAIN after removal keeps its identity for a later retry", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const firstBody = callBody(calls[0]);

    el(h, "fp-0-remove").trigger("click");

    resolvePending(pending, byProjectAndKind("proj-a", "EVIDENCE_PREVIEW"), {
      ok: false,
      status: 500,
      bodyText: "server error",
    });
    await flush();
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_PREVIEW"),
    ).toBe(true);

    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    el(h, "fp-0-evidence-kind").value = "EVIDENCE_PREVIEW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    const secondBody = callBody(calls[calls.length - 1]);
    expect(secondBody.intentId).toBe(firstBody.intentId);
  });

  it("D: an action that settles INTERRUPTED after removal keeps its resumable workflow; re-add can Resume the exact workflowId", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const h = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });

    el(h, "fp-0-evidence-kind").value = "EVIDENCE_APPLY_SHADOW";
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();

    el(h, "fp-0-remove").trigger("click");

    resolvePending(
      pending,
      byProjectAndKind("proj-a", "EVIDENCE_APPLY_SHADOW"),
      {
        ok: true,
        status: 202,
        bodyText: json(
          submissionBody({
            run: runBlock({ workflowId: "wf-d2", state: "INTERRUPTED" }),
            omitResult: true,
          }),
        ),
      },
    );
    await flush();
    expect(
      h.storage.hasKey("howler_field_pending_proj-a_EVIDENCE_APPLY_SHADOW"),
    ).toBe(true);

    el(h, "new-project-id").value = "proj-a";
    el(h, "add-project").trigger("click");
    expect(() => el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW")).not.toThrow();
    el(h, "fp-0-resume-EVIDENCE_APPLY_SHADOW").trigger("click");
    await flush();
    const resumeCall = calls.find((c) => c.path.includes("/resume"));
    expect(resumeCall?.path).toBe("/v1/workflows/wf-d2/resume");
  });
});

// ==================================================================================================
// v0.9.6 Task 5: Penthouse as the sharp portfolio map + Project Genesis UX.
// ==================================================================================================

const SAMPLE_PROPOSAL = {
  schemaVersion: "0.9.6",
  proposalId: "genesis-smith-residence-2026-09-04T20-00-00-000Z",
  projectId: "smith-residence",
  projectName: "Smith Residence",
  projectType: "RESIDENTIAL_REMODEL",
  timezone: "America/New_York",
  forecastAnchorDate: "2026-09-04",
  sourceText: "Create Smith Residence. Budget is $310k.",
  baselineScope: [
    { id: "demolition", label: "Demolition", phase: "Demolition" },
    { id: "kitchen", label: "Kitchen", phase: "General" },
  ],
  knownDates: [
    {
      subjectId: "demolition",
      kind: "COMMITTED_START",
      date: "2026-09-14",
      label: "Demolition start",
    },
  ],
  budget: { baseline: 310000, currency: "USD" },
  assumptions: [
    "Timezone defaulted to America/New_York for the pilot and needs PM confirmation.",
  ],
  risks: [],
  missingCritical: ["Activity durations need PM validation"],
};

const SAMPLE_SUMMARY = {
  projectId: "proj-a",
  projectName: "proj-a",
  progressPercent: 40,
  integrity: {
    score: 82,
    condition: "Stable, exposed",
    primaryDriver: "Stable.",
  },
  budget: {
    baseline: 310000,
    spent: 100000,
    remaining: 210000,
    spentPercent: 32,
  },
  primaryExposure: "No critical exposure identified.",
  nextMovement: "Committed: Demolition starts 2026-09-14.",
  projectedCompletion: "2026-10-18",
  schedule: { committed: [], forecast: [] },
  scope: [{ id: "demolition", label: "Demolition", phase: "Demolition" }],
};

interface RespondOverrides {
  preview?: { ok: boolean; status: number; bodyText: string };
  commit?: { ok: boolean; status: number; bodyText: string };
  summary?: { ok: boolean; status: number; bodyText: string };
}

function genesisRespond(overrides: RespondOverrides = {}): Respond {
  return (call) => {
    if (call.path === "/v1/projects/genesis/preview") {
      return (
        overrides.preview ?? {
          ok: true,
          status: 200,
          bodyText: json({
            schemaVersion: "0.9.6",
            preview: true,
            proposal: SAMPLE_PROPOSAL,
          }),
        }
      );
    }
    if (call.path === "/v1/projects/genesis/commit") {
      return (
        overrides.commit ?? {
          ok: true,
          status: 201,
          bodyText: json({
            schemaVersion: "0.9.6",
            projectId: "smith-residence",
            revision: 0,
            forecastVersion: 1,
            oversightDecision: "PASS",
            publishable: false,
            stagingOnly: true,
          }),
        }
      );
    }
    if (/\/summary$/.test(call.path)) {
      const projectId = call.path.split("/")[3];
      return (
        overrides.summary ?? {
          ok: true,
          status: 200,
          bodyText: json({
            ...SAMPLE_SUMMARY,
            projectId,
            projectName:
              projectId === SAMPLE_PROPOSAL.projectId
                ? SAMPLE_PROPOSAL.projectName
                : projectId,
          }),
        }
      );
    }
    return { ok: true, status: 200, bodyText: "{}" };
  };
}

describe("Project Genesis: opening and closing the panel", () => {
  it("New project opens the Genesis panel", () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    expect(el(h, "genesis-panel").hidden).toBe(true);
    el(h, "new-project-open").trigger("click");
    expect(el(h, "genesis-panel").hidden).toBe(false);
  });

  it("Cancel closes the panel and clears the intake text cleanly", () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-cancel").trigger("click");
    expect(el(h, "genesis-panel").hidden).toBe(true);
    expect(el(h, "genesis-text").value).toBe("");
  });
});

describe("Project Genesis: preview", () => {
  it("Analyze posts the intake text to /v1/projects/genesis/preview", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence. Budget is $310k.";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/preview",
    );
    expect(call).toBeDefined();
    expect(callBody(call).text).toBe(
      "Create Smith Residence. Budget is $310k.",
    );
  });

  it("renders the preview as readable fields, never as raw JSON", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    const html = el(h, "genesis-review").innerHTML;
    expect(html).toContain("Smith Residence");
    expect(html).toContain("Demolition");
    expect(html).toContain("310,000");
    expect(html).toContain("Activity durations need PM validation");
    expect(html).not.toMatch(/"schemaVersion"/);
    expect(html).not.toContain("proposalId");
  });

  it("shows a concise error and preserves the original intake when preview fails", async () => {
    const h = mount(
      genesisRespond({
        preview: {
          ok: false,
          status: 400,
          bodyText: json({ message: "Invalid Genesis proposal" }),
        },
      }),
      { trackedProjects: [] },
    );
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "garbled intake";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    expect(el(h, "genesis-status").textContent.length).toBeGreaterThan(0);
    expect(el(h, "genesis-text").value).toBe("garbled intake");
    expect(el(h, "genesis-review").hidden).toBe(true);
  });
});

describe("Project Genesis: editing the proposal before approval", () => {
  it("lets the user correct project name, budget, and scope through form inputs, then commits the corrected proposal", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-name").value = "Smith Family Residence";
    el(h, "genesis-budget").value = "325000";
    el(h, "genesis-scope").value = "Demolition\nKitchen\nNew Sunroom";

    el(h, "genesis-approve").trigger("click");
    await flush();

    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    expect(call).toBeDefined();
    const body = callBody(call);
    const proposal = body.proposal as Record<string, unknown>;
    expect(proposal.projectName).toBe("Smith Family Residence");
    expect((proposal.budget as Record<string, unknown>).baseline).toBe(325000);
    const scope = proposal.baselineScope as { id: string; label: string }[];
    expect(scope.map((s) => s.label)).toEqual([
      "Demolition",
      "Kitchen",
      "New Sunroom",
    ]);
    expect(new Set(scope.map((s) => s.id)).size).toBe(3);
  });

  // Interim review gap: an invalid, non-blank budget correction must never silently commit the
  // old value under a misleading "Approving..." status -- it must block approval entirely so the
  // user is never told something was approved when it wasn't what they actually corrected.
  it("blocks approval and keeps the review open when the corrected budget is invalid, never committing a different value than the user believes they entered", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-budget").value = "not a number";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const commitCalls = h.fetchCalls.filter(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    expect(commitCalls).toHaveLength(0);
    const tracked = JSON.parse(
      h.storage.getItem("howler_field_tracked_projects") ?? "[]",
    ) as string[];
    expect(tracked).not.toContain("smith-residence");
    expect(el(h, "genesis-review").hidden).toBe(false);
    expect(el(h, "genesis-budget").value).toBe("not a number");
    expect(el(h, "genesis-status").textContent.length).toBeGreaterThan(0);
  });

  it("preserves existing spent/currency when only the baseline is corrected to a new value", async () => {
    const h = mount(
      genesisRespond({
        preview: {
          ok: true,
          status: 200,
          bodyText: json({
            schemaVersion: "0.9.6",
            preview: true,
            proposal: {
              ...SAMPLE_PROPOSAL,
              budget: { baseline: 310000, spent: 100000, currency: "USD" },
            },
          }),
        },
      }),
      { trackedProjects: [] },
    );
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-budget").value = "350000";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    const proposal = callBody(call).proposal as Record<string, unknown>;
    expect(proposal.budget).toEqual({
      baseline: 350000,
      spent: 100000,
      currency: "USD",
    });
  });

  it("preserves spent/currency when baseline is cleared, never fabricating a zero baseline", async () => {
    const h = mount(
      genesisRespond({
        preview: {
          ok: true,
          status: 200,
          bodyText: json({
            schemaVersion: "0.9.6",
            preview: true,
            proposal: {
              ...SAMPLE_PROPOSAL,
              budget: { baseline: 310000, spent: 100000, currency: "USD" },
            },
          }),
        },
      }),
      { trackedProjects: [] },
    );
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-budget").value = "";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    const proposal = callBody(call).proposal as Record<string, unknown>;
    const budget = proposal.budget as Record<string, unknown>;
    expect(budget.baseline).toBeUndefined();
    expect(budget.spent).toBe(100000);
    expect(budget.currency).toBe("USD");
  });

  it("leaves budget unknown when the field is left blank, never silently zero", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-budget").value = "";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    const proposal = callBody(call).proposal as Record<string, unknown>;
    expect(proposal.budget).toBeUndefined();
  });

  it("does not silently discard a visible scope entry that no longer matches an original label", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-scope").value = "Demolition\nDemolition\nKitchen";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    const proposal = callBody(call).proposal as Record<string, unknown>;
    const scope = proposal.baselineScope as { id: string; label: string }[];
    expect(scope).toHaveLength(3);
    expect(new Set(scope.map((s) => s.id)).size).toBe(3);
  });

  // Breaker review P1-3: renaming an existing scope row's VISIBLE LABEL must never mint an
  // unrelated new id for it -- the old label-text-matching approach broke exactly this case, since
  // the edited text no longer equals any original label. SAMPLE_PROPOSAL's own "demolition" row is
  // bound to a real committed knownDate, so this also proves that date is never silently stranded.
  it("preserves the stable identity of an edited existing scope row, so its committed date remains valid", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-scope").value = "Selective demolition\nKitchen";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const call = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    expect(call).toBeDefined();
    const proposal = callBody(call).proposal as Record<string, unknown>;
    const scope = proposal.baselineScope as { id: string; label: string }[];
    const renamed = scope.find((s) => s.label === "Selective demolition");
    expect(renamed?.id).toBe("demolition");
    const knownDates = proposal.knownDates as { subjectId: string }[];
    expect(knownDates.some((d) => d.subjectId === "demolition")).toBe(true);
  });

  // Breaker review P1-3: removing a scope row that a knownDate still references must fail
  // locally with a clear message rather than silently posting a proposal whose knownDates points
  // at a scope item that no longer exists.
  it("blocks approval locally when a scope row bound to a committed date is removed, rather than posting an internally inconsistent proposal", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();

    el(h, "genesis-scope").value = "Kitchen";
    el(h, "genesis-approve").trigger("click");
    await flush();

    const commitCalls = h.fetchCalls.filter(
      (c) => c.path === "/v1/projects/genesis/commit",
    );
    expect(commitCalls).toHaveLength(0);
    expect(el(h, "genesis-review").hidden).toBe(false);
    expect(el(h, "genesis-status").textContent).toContain("Demolition");
    const tracked = JSON.parse(
      h.storage.getItem("howler_field_tracked_projects") ?? "[]",
    ) as string[];
    expect(tracked).not.toContain("smith-residence");
  });
});

describe("Project Genesis: successful commit", () => {
  it("adds the new project to the tracked list, fetches its summary, selects it, and opens its Index Card", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    el(h, "genesis-approve").trigger("click");
    await flush();
    await flush(); // the post-commit summary refresh + select is a further nested fetch chain

    const tracked = JSON.parse(
      h.storage.getItem("howler_field_tracked_projects") ?? "[]",
    ) as string[];
    expect(tracked).toContain("smith-residence");
    const summaryCall = h.fetchCalls.find(
      (c) =>
        c.method === "GET" && c.path === "/v1/projects/smith-residence/summary",
    );
    expect(summaryCall).toBeDefined();
    expect(el(h, "index-card-container").innerHTML).toContain(
      "Smith Residence",
    );
    expect(el(h, "genesis-panel").hidden).toBe(true);
  });

  it("dedupes when the committed projectId is already tracked, never creating a duplicate card", async () => {
    const h = mount(genesisRespond(), {
      trackedProjects: ["smith-residence"],
    });
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    el(h, "genesis-approve").trigger("click");
    await flush();
    const tracked = JSON.parse(
      h.storage.getItem("howler_field_tracked_projects") ?? "[]",
    ) as string[];
    expect(tracked.filter((id) => id === "smith-residence")).toHaveLength(1);
  });

  it("shows a concise error and does not add a fake project when commit fails", async () => {
    const h = mount(
      genesisRespond({
        commit: {
          ok: false,
          status: 409,
          bodyText: json({ message: "Project already exists" }),
        },
      }),
      { trackedProjects: [] },
    );
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    el(h, "genesis-approve").trigger("click");
    await flush();
    const tracked = JSON.parse(
      h.storage.getItem("howler_field_tracked_projects") ?? "[]",
    ) as string[];
    expect(tracked).not.toContain("smith-residence");
    expect(el(h, "genesis-status").textContent.length).toBeGreaterThan(0);
    expect(el(h, "genesis-review").hidden).toBe(false);
  });
});

describe("Project Genesis: HTML escaping", () => {
  it("never renders HTML-like project data as executable markup", async () => {
    const dangerousProposal = {
      ...SAMPLE_PROPOSAL,
      projectName: '<img src=x onerror="window.__pwned=true">',
      assumptions: ["<script>window.__pwned2=true<" + "/script>"],
    };
    const h = mount(
      genesisRespond({
        preview: {
          ok: true,
          status: 200,
          bodyText: json({
            schemaVersion: "0.9.6",
            preview: true,
            proposal: dangerousProposal,
          }),
        },
      }),
      { trackedProjects: [] },
    );
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "anything";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    const html = el(h, "genesis-review").innerHTML;
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>window.__pwned2");
    expect(html).toContain("&lt;img");
  });
});

describe("Project Genesis: admin key handling", () => {
  it("sends the live admin-key value as a Bearer token and never persists it", async () => {
    const h = mount(genesisRespond(), { trackedProjects: [] });
    el(h, "admin-key").value = "secret-key-1";
    el(h, "new-project-open").trigger("click");
    el(h, "genesis-text").value = "Create Smith Residence.";
    el(h, "genesis-analyze").trigger("click");
    await flush();
    const previewCall = h.fetchCalls.find(
      (c) => c.path === "/v1/projects/genesis/preview",
    );
    expect(previewCall?.headers.get("authorization")).toBe(
      "Bearer secret-key-1",
    );
    expect(h.storage.hasKey("secret-key-1")).toBe(false);
  });
});

describe("portfolio summary cards: one GET per tracked project", () => {
  it("fetches exactly one /summary per tracked project when the admin key is entered", async () => {
    const h = mount(genesisRespond(), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const summaryCalls = h.fetchCalls.filter((c) => /\/summary$/.test(c.path));
    expect(summaryCalls).toHaveLength(2);
    expect(summaryCalls.map((c) => c.path).sort()).toEqual([
      "/v1/projects/proj-a/summary",
      "/v1/projects/proj-b/summary",
    ]);
  });

  // Interim review gap: automatic primary-portfolio loading must never also fire the old
  // FORECAST_QUERY/FORECAST_HEALTH_QUERY/RECOVERY_QUERY workflows -- those remain diagnostics-
  // only, triggered exclusively by an explicit individual-card Refresh or the Admin & diagnostics
  // "Refresh all" button (see the still-passing tests in the automatic-canonical-reads and
  // Refresh-all describe blocks above, which are unaffected by this fix).
  it("never fires the old /v1/intents query workflows for automatic primary-portfolio loading", async () => {
    const h = mount(genesisRespond(), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const intentCalls = h.fetchCalls.filter((c) => c.path === "/v1/intents");
    expect(intentCalls).toHaveLength(0);
  });

  it("renders Project Integrity, Progress, Budget, Primary exposure, Next movement, and Projected completion for each card", async () => {
    const h = mount(genesisRespond(), { trackedProjects: ["proj-a"] });
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-portfolio-rows").innerHTML;
    expect(html).toContain("Project Integrity");
    expect(html).toContain("Progress");
    expect(html).toContain("Budget");
    expect(html).toContain("Primary exposure");
    expect(html).toContain("Next movement");
    expect(html).toContain("Projected completion");
    expect(html).toContain("82 / 100");
    expect(html).toContain("Stable, exposed");
  });
});

describe("portfolio summary cards: budget honesty", () => {
  it("shows spent/remaining when both are known", async () => {
    const h = mount(genesisRespond(), { trackedProjects: ["proj-a"] });
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-portfolio-rows").innerHTML;
    expect(html).toMatch(/\$100,000 spent[\s\S]*\$210,000 remaining/);
  });

  it("discloses spend not recorded when baseline is known but spent is unknown, and never fabricates remaining", async () => {
    const h = mount(
      genesisRespond({
        summary: {
          ok: true,
          status: 200,
          bodyText: json({
            ...SAMPLE_SUMMARY,
            budget: {
              baseline: 310000,
              spent: null,
              remaining: null,
              spentPercent: null,
            },
          }),
        },
      }),
      { trackedProjects: ["proj-a"] },
    );
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-portfolio-rows").innerHTML;
    expect(html).toContain("Baseline $310,000");
    expect(html).toContain("spend not recorded");
    expect(html).not.toContain("remaining");
  });

  it("shows Budget not recorded when baseline is unknown", async () => {
    const h = mount(
      genesisRespond({
        summary: {
          ok: true,
          status: 200,
          bodyText: json({
            ...SAMPLE_SUMMARY,
            budget: {
              baseline: null,
              spent: null,
              remaining: null,
              spentPercent: null,
            },
          }),
        },
      }),
      { trackedProjects: ["proj-a"] },
    );
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-portfolio-rows").innerHTML;
    expect(html).toContain("Budget not recorded");
  });
});

describe("portfolio: Project Integrity and Progress are visually and semantically distinct", () => {
  it("uses separate labeled containers, never merging the two metrics", async () => {
    const h = mount(genesisRespond(), { trackedProjects: ["proj-a"] });
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-portfolio-rows").innerHTML;
    const integrityIndex = html.indexOf("Project Integrity");
    const progressIndex = html.indexOf("Progress");
    expect(integrityIndex).toBeGreaterThan(-1);
    expect(progressIndex).toBeGreaterThan(-1);
    expect(integrityIndex).not.toBe(progressIndex);
  });
});

describe("Needs attention", () => {
  it("lists a project whose integrity is At risk or worse, with a concise one-line exposure", async () => {
    const h = mount(
      genesisRespond({
        summary: {
          ok: true,
          status: 200,
          bodyText: json({
            ...SAMPLE_SUMMARY,
            integrity: {
              score: 45,
              condition: "Critical",
              primaryDriver: "Blocked constraint.",
            },
            primaryExposure: "Blocked: Permit approval.",
          }),
        },
      }),
      { trackedProjects: ["proj-a"] },
    );
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-priorities-list").innerHTML;
    expect(html).toContain("Blocked: Permit approval.");
  });

  it("does not list a project whose integrity is Stable or Stable, exposed", async () => {
    const h = mount(genesisRespond(), { trackedProjects: ["proj-a"] });
    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    const html = el(h, "ph-priorities-list").innerHTML;
    expect(html).toContain("Nothing needs you right now.");
  });
});

describe("Penthouse static shell: portfolio map requirements", () => {
  const html = fieldDashboardHtml();

  it("has no portfolio-level 14-day Movement Gantt", () => {
    expect(html).not.toContain("ph-gantt");
    expect(html).not.toContain("ph-movement-band");
  });

  it("has no dead/fake nav buttons for modules that do not route anywhere", () => {
    for (const label of [
      "Forecast",
      "Trades",
      "Materials",
      "Inspections",
      "Decisions",
      "Risks",
      "Documents",
      "Activity",
    ]) {
      expect(html).not.toMatch(new RegExp(`>${label}<`));
    }
  });

  it("contains a visible New project anchor and the portfolio card container", () => {
    expect(html).toContain('id="new-project-open"');
    expect(html).toMatch(/New project/);
    expect(html).toContain('id="ph-portfolio-rows"');
  });

  it('"Command the work." remains brand copy', () => {
    expect(html).toContain("Command");
    expect(html).toContain("the work.");
  });

  it("the desktop hero/atmosphere area is compact: no 520px+ hero, command heading <= 32px desktop and <= 28px mobile", () => {
    expect(html).not.toMatch(/min-height:\s*520px/);
    const desktopSizeMatch = /\.ph-command\s*\{[^}]*font-size:\s*(\d+)px/.exec(
      html,
    );
    expect(desktopSizeMatch).not.toBeNull();
    expect(Number(desktopSizeMatch?.[1])).toBeLessThanOrEqual(32);
    const mobileBlockMatch =
      /@media \(max-width:\s*760px\)[\s\S]*?\.ph-command\s*\{[^}]*font-size:\s*(\d+)px/.exec(
        html,
      );
    expect(mobileBlockMatch).not.toBeNull();
    expect(Number(mobileBlockMatch?.[1])).toBeLessThanOrEqual(28);
    const atmosphereHeightMatches = [
      ...html.matchAll(/\.ph-atmosphere\s*\{[^}]*min-height:\s*(\d+)px/g),
    ];
    expect(atmosphereHeightMatches.length).toBeGreaterThan(0);
    for (const m of atmosphereHeightMatches) {
      expect(Number(m[1])).toBeLessThanOrEqual(220);
    }
  });

  it("Project Genesis is natural-language first: a textarea for intake, never a raw JSON textarea", () => {
    const genesisTextareaMatch = /<textarea[^>]*id="genesis-text"[^>]*>/.exec(
      html,
    );
    expect(genesisTextareaMatch).not.toBeNull();
    expect(genesisTextareaMatch?.[0].toLowerCase()).not.toContain("json");
  });

  // Task 6: the Index Card is now the product-facing project experience, so the legacy detailed
  // diagnostic cards (projectCardHtml/projects-container) move fully inside Admin & diagnostics --
  // reachable, but no longer sitting as primary page content. admin-key stays outside the drawer
  // (the selected Index Card and the automatic portfolio-summary load both still need it).
  it("legacy evidence/admin controls remain available only under Admin & diagnostics, with the legacy detailed cards now inside it too", () => {
    const match = /<details class="ph-admin-drawer">([\s\S]*?)<\/details>/.exec(
      html,
    );
    expect(match).not.toBeNull();
    const drawer = match?.[1] ?? "";
    expect(drawer).toContain('id="new-project-id"');
    expect(drawer).toContain('id="add-project"');
    expect(drawer).toContain('id="refresh-all"');
    expect(drawer).toContain('id="projects-container"');
    expect(drawer).not.toContain('id="admin-key"');
  });

  it("the selected Index Card container stays outside the collapsed Admin & diagnostics drawer", () => {
    const match = /<details class="ph-admin-drawer">([\s\S]*?)<\/details>/.exec(
      html,
    );
    const drawer = match?.[1] ?? "";
    expect(drawer).not.toContain('id="index-card-container"');
    expect(html).toContain('id="index-card-container"');
  });

  it("the staging/shadow banner remains", () => {
    expect(html).toMatch(/id="env-banner" role="status"/);
    expect(html).toContain("STAGING");
    expect(html).toContain("SHADOW");
  });

  it("voice control remains", () => {
    expect(html).toContain('id="voice-push-to-talk"');
    expect(html).toContain('id="voice-status"');
  });

  it("has a selected Index Card container, ready for one selected project rather than all-project rendering", () => {
    expect(html).toContain('id="index-card-container"');
  });
});

// ==================================================================================================
// v0.9.6 Task 6: the selected Index Card becomes the project operating environment -- overview,
// budget, schedule/forecast, baseline scope, and a natural-language update surface that reuses the
// exact existing submitConversationalTurn/submitConversationalConfirm path (never a second
// mutation implementation).
// ==================================================================================================

const RICH_INDEX_CARD_SUMMARY = {
  projectId: "proj-a",
  projectName: "Carver Residence",
  progressPercent: 72,
  integrity: {
    score: 82,
    condition: "Stable, exposed",
    primaryDriver: "Schedule exposure from an unresolved permit.",
  },
  budget: {
    baseline: 400000,
    spent: 284000,
    remaining: 116000,
    spentPercent: 71,
  },
  primaryExposure: "Electrical final not confirmed.",
  nextMovement: "Granite install then Electrical finals.",
  projectedCompletion: "2026-09-20",
  schedule: {
    committed: [
      {
        activityId: "granite",
        activityName: "Granite install",
        phase: "Finishes",
        startDate: "2026-09-09",
        finishDate: null,
        basis: "COMMITTED",
      },
    ],
    forecast: [
      {
        activityId: "electrical",
        activityName: "Electrical finals",
        phase: "MEP Finals",
        startDate: "2026-09-10",
        finishDate: null,
        basis: "FORECAST",
      },
      {
        activityId: "glass",
        activityName: "Glass template",
        phase: "Envelope",
        startDate: "2026-09-12",
        finishDate: null,
        basis: "FORECAST",
      },
    ],
  },
  scope: [
    { id: "kitchen", label: "Kitchen", phase: "Interior" },
    { id: "primary-bath", label: "Primary bath", phase: "Interior" },
  ],
};

function richIndexCardRespond(): Respond {
  return genesisRespond({
    summary: { ok: true, status: 200, bodyText: json(RICH_INDEX_CARD_SUMMARY) },
  });
}

function loadAndSelect(h: Harness, rowId = "ph-row-0"): Promise<void> {
  el(h, "admin-key").value = "key-1";
  el(h, "admin-key").trigger("change");
  return flush().then(() => {
    el(h, rowId).trigger("click");
    return flush();
  });
}

describe("Index Card structure (Task 6): the selected project's operating environment", () => {
  it("renders every required Index Card anchor for the selected project, from Task 4's summary literally", async () => {
    const h = mount(richIndexCardRespond(), { trackedProjects: ["proj-a"] });
    await loadAndSelect(h);

    expect(el(h, "ic-project-name").textContent).toBe("Carver Residence");
    expect(el(h, "ic-integrity").textContent).toContain("82");
    expect(el(h, "ic-integrity").textContent).toContain("Stable, exposed");
    expect(el(h, "ic-integrity-driver").textContent).toContain("permit");
    expect(el(h, "ic-progress").textContent).toContain("72%");
    expect(el(h, "ic-budget").textContent).toContain("284,000");
    expect(el(h, "ic-budget").textContent).toContain("116,000");
    expect(el(h, "ic-exposure").textContent).toContain("Electrical final");
    expect(el(h, "ic-next-movement").textContent).toContain("Granite install");
    expect(el(h, "ic-completion").textContent.length).toBeGreaterThan(0);
    const scheduleHtml = el(h, "ic-schedule").innerHTML;
    expect(scheduleHtml).toContain("Granite install");
    expect(scheduleHtml).toContain("Committed");
    expect(scheduleHtml).toContain("Electrical finals");
    expect(scheduleHtml).toContain("Glass template");
    expect(scheduleHtml).toContain("Forecast");
    const scopeHtml = el(h, "ic-scope").innerHTML;
    expect(scopeHtml).toContain("Kitchen");
    expect(scopeHtml).toContain("Primary bath");
    expect(() => el(h, "ic-update-input")).not.toThrow();
    expect(() => el(h, "ic-update-send")).not.toThrow();
    expect(el(h, "ic-update-result").textContent).toBe("");
    expect(el(h, "ic-confirm").hidden).toBe(true);
    expect(() => el(h, "ic-confirm-text")).not.toThrow();
    expect(() => el(h, "ic-confirm-yes")).not.toThrow();
    expect(() => el(h, "ic-confirm-no")).not.toThrow();
  });

  it("never labels a committed-only activity as Forecast, or a forecast-only activity as Committed", async () => {
    const h = mount(richIndexCardRespond(), { trackedProjects: ["proj-a"] });
    await loadAndSelect(h);
    const html = el(h, "ic-schedule").innerHTML;
    const graniteRow = /Granite install[\s\S]*?<\/li>/.exec(html)?.[0] ?? "";
    expect(graniteRow).toContain("Committed");
    expect(graniteRow).not.toContain("Forecast");
    const electricalRow =
      /Electrical finals[\s\S]*?<\/li>/.exec(html)?.[0] ?? "";
    expect(electricalRow).toContain("Forecast");
    expect(electricalRow).not.toContain("Committed");
  });

  it("renders a truthful empty state when no schedule/forecast activity exists", async () => {
    const h = mount(genesisRespond(), { trackedProjects: ["proj-a"] });
    await loadAndSelect(h);
    expect(el(h, "ic-schedule").innerHTML.toLowerCase()).toContain(
      "no schedule",
    );
  });

  it("escapes HTML-like content in every rendered Index Card field (XSS regression)", async () => {
    const XSS_SUMMARY = {
      projectId: "proj-a",
      projectName: "<img src=x onerror=alert(1)>",
      progressPercent: 10,
      integrity: {
        score: 50,
        condition: "<b>At risk</b>",
        primaryDriver: "<script>alert(2)</script>",
      },
      budget: { baseline: 100, spent: 10, remaining: 90, spentPercent: 10 },
      primaryExposure: "<svg onload=alert(3)>",
      nextMovement: "<img src=x onerror=alert(4)>",
      projectedCompletion: null,
      schedule: {
        committed: [
          {
            activityId: "a1",
            activityName: "<img src=x onerror=alert(5)>",
            phase: "<b>Demolition</b>",
            startDate: "2026-09-09",
            finishDate: null,
            basis: "COMMITTED",
          },
        ],
        forecast: [],
      },
      scope: [
        { id: "s1", label: "<img src=x onerror=alert(6)>", phase: "General" },
      ],
    };
    const h = mount(
      genesisRespond({
        summary: { ok: true, status: 200, bodyText: json(XSS_SUMMARY) },
      }),
      { trackedProjects: ["proj-a"] },
    );
    await loadAndSelect(h);
    const html = el(h, "index-card-container").innerHTML;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img");
  });
});

describe("Index Card natural-language update: reuses the existing conversation/turn path only", () => {
  function respondWithTurn(
    turnResult: unknown,
    confirmResult?: unknown,
    base: Respond = genesisRespond(),
  ): Respond {
    return (call) => {
      if (call.path.endsWith("/conversation/turn")) {
        const body = callBody(call);
        if (body.confirm && confirmResult !== undefined) {
          return {
            ok: true,
            status: 200,
            bodyText: json({
              session: { sessionId: "s1" },
              confirm: confirmResult,
              timing: [],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          bodyText: json({
            session: { sessionId: "s1" },
            turn: turnResult,
            timing: [],
          }),
        };
      }
      return base(call);
    };
  }

  it("Update posts to the exact existing /v1/projects/:id/conversation/turn route with the entered text", async () => {
    const h = mount(respondWithTurn({ kind: "NO_OP", clarifications: [] }), {
      trackedProjects: ["proj-a"],
    });
    await loadAndSelect(h);
    el(h, "ic-update-input").value = "Demolition started today";
    el(h, "ic-update-send").trigger("click");
    await flush();
    const turnCall = h.fetchCalls.find((c) =>
      c.path.endsWith("/conversation/turn"),
    );
    expect(turnCall?.path).toBe("/v1/projects/proj-a/conversation/turn");
    expect(callBody(turnCall).text).toBe("Demolition started today");
  });

  it("CLARIFICATION shows the concise question and never implies a mutation happened", async () => {
    const h = mount(
      respondWithTurn({
        kind: "CLARIFICATION",
        clarifications: [{ message: "Which activity do you mean?" }],
      }),
      { trackedProjects: ["proj-a"] },
    );
    await loadAndSelect(h);
    el(h, "ic-update-input").value = "started today";
    el(h, "ic-update-send").trigger("click");
    await flush();
    expect(el(h, "ic-update-result").textContent).toBe(
      "Which activity do you mean?",
    );
    expect(el(h, "ic-confirm").hidden).toBe(true);
  });

  it("AWAITING_CONFIRMATION reveals the confirm controls; Confirm(yes) applies and refreshes only that project's summary", async () => {
    let summaryCalls = 0;
    const h = mount(
      respondWithTurn(
        {
          kind: "AWAITING_CONFIRMATION",
          clarifications: [],
          pending: [
            {
              claim: {
                claimType: "ACTIVITY_STARTED",
                subjectText: "demolition",
                effectiveDate: "2026-09-09",
              },
              confirmation: {
                confirmationId: "conf-1",
                createdAt: 0,
                expiresAt: 30000,
                projectId: "proj-a",
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
        { outcome: "APPLIED", result: { workflowState: "SUCCEEDED" } },
        (call) => {
          if (/\/summary$/.test(call.path)) summaryCalls += 1;
          return genesisRespond()(call);
        },
      ),
      { trackedProjects: ["proj-a"] },
    );
    await loadAndSelect(h);
    const summaryCallsBeforeUpdate = summaryCalls;

    el(h, "ic-update-input").value = "demolition started today";
    el(h, "ic-update-send").trigger("click");
    await flush();
    expect(el(h, "ic-confirm").hidden).toBe(false);
    expect(el(h, "ic-confirm-text").textContent).toContain("demolition");
    expect(el(h, "ic-update-result").textContent).toContain("demolition");

    el(h, "ic-confirm-yes").trigger("click");
    await flush();
    expect(el(h, "ic-confirm").hidden).toBe(true);
    expect(el(h, "ic-update-result").textContent).toBe("Recorded.");
    expect(summaryCalls).toBeGreaterThan(summaryCallsBeforeUpdate);
  });

  it("a CANCELLED confirmation shows Cancelled and never refreshes the summary", async () => {
    let summaryCalls = 0;
    const h = mount(
      respondWithTurn(
        {
          kind: "AWAITING_CONFIRMATION",
          clarifications: [],
          pending: [
            {
              claim: {
                claimType: "ACTIVITY_STARTED",
                subjectText: "demolition",
                effectiveDate: "2026-09-09",
              },
              confirmation: {
                confirmationId: "conf-2",
                createdAt: 0,
                expiresAt: 30000,
                projectId: "proj-a",
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
        { outcome: "CANCELLED" },
        (call) => {
          if (/\/summary$/.test(call.path)) summaryCalls += 1;
          return genesisRespond()(call);
        },
      ),
      { trackedProjects: ["proj-a"] },
    );
    await loadAndSelect(h);
    const summaryCallsBeforeUpdate = summaryCalls;

    el(h, "ic-update-input").value = "demolition started today";
    el(h, "ic-update-send").trigger("click");
    await flush();
    el(h, "ic-confirm-no").trigger("click");
    await flush();
    expect(el(h, "ic-update-result").textContent).toBe("Cancelled.");
    expect(el(h, "ic-confirm").hidden).toBe(true);
    expect(summaryCalls).toBe(summaryCallsBeforeUpdate);
  });

  it("does not send a duplicate update while the same project's conversation is already in flight", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const rest = mountWithFetch(fetchFn, { trackedProjects: ["proj-a"] });
    const h = { ...rest, fetchCalls: calls };

    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    resolvePending(pending, (c) => /\/proj-a\/summary$/.test(c.path), {
      ok: true,
      status: 200,
      bodyText: json({ ...SAMPLE_SUMMARY, projectId: "proj-a" }),
    });
    await flush();
    el(h, "ph-row-0").trigger("click");
    await flush();

    el(h, "ic-update-input").value = "Demolition started today";
    el(h, "ic-update-send").trigger("click");
    await flush();
    el(h, "ic-update-send").trigger("click");
    await flush();

    const turnCalls = calls.filter(
      (c) => c.path === "/v1/projects/proj-a/conversation/turn",
    );
    expect(turnCalls).toHaveLength(1);
  });
});

describe("Index Card wrong-project safety: an in-flight update never bleeds into a different selected project", () => {
  it("selecting B before A's response resolves keeps B selected and untouched by A's result", async () => {
    const { fetchFn, calls, pending } = makeDeferredFetch();
    const rest = mountWithFetch(fetchFn, {
      trackedProjects: ["proj-a", "proj-b"],
    });
    const h = { ...rest, fetchCalls: calls };

    el(h, "admin-key").value = "key-1";
    el(h, "admin-key").trigger("change");
    await flush();
    resolvePending(pending, (c) => /\/proj-a\/summary$/.test(c.path), {
      ok: true,
      status: 200,
      bodyText: json({
        ...SAMPLE_SUMMARY,
        projectId: "proj-a",
        projectName: "Proj A",
      }),
    });
    resolvePending(pending, (c) => /\/proj-b\/summary$/.test(c.path), {
      ok: true,
      status: 200,
      bodyText: json({
        ...SAMPLE_SUMMARY,
        projectId: "proj-b",
        projectName: "Proj B",
      }),
    });
    await flush();

    el(h, "ph-row-0").trigger("click");
    await flush();
    expect(el(h, "ic-project-name").textContent).toBe("Proj A");

    el(h, "ic-update-input").value = "Demolition started today";
    el(h, "ic-update-send").trigger("click");
    await flush();
    expect(el(h, "ic-update-result").textContent).toBe("Working…");

    // Before A's conversation/turn response resolves, select B.
    el(h, "ph-row-1").trigger("click");
    await flush();
    expect(el(h, "ic-project-name").textContent).toBe("Proj B");
    expect(el(h, "ic-update-result").textContent).toBe("");

    // Now resolve A's turn -- a clarification, so it must never claim a mutation happened.
    resolvePending(
      pending,
      (c) => c.path === "/v1/projects/proj-a/conversation/turn",
      {
        ok: true,
        status: 200,
        bodyText: json({
          session: { sessionId: "s1" },
          turn: {
            kind: "CLARIFICATION",
            clarifications: [{ message: "Which activity for A?" }],
          },
          timing: [],
        }),
      },
    );
    await flush();

    // B must remain selected, and B's own result area must be untouched by A's response.
    expect(el(h, "ic-project-name").textContent).toBe("Proj B");
    expect(el(h, "ic-update-result").textContent).toBe("");
    expect(
      calls.some((c) => c.path === "/v1/projects/proj-b/conversation/turn"),
    ).toBe(false);

    // Switching back to A shows A's own persisted message -- proving it was kept, just never
    // painted over B's visible card while B was selected.
    el(h, "ph-row-0").trigger("click");
    await flush();
    expect(el(h, "ic-update-result").textContent).toBe("Which activity for A?");
  });
});
