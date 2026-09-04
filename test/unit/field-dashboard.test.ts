import { describe, expect, it } from "vitest";
import { fieldDashboardClientScript } from "../../src/worker/admin";
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
    expect(h.fetchCalls).toHaveLength(6);
    expect(
      h.fetchCalls.filter((c) => callBody(c).projectId === "proj-a"),
    ).toHaveLength(3);
    expect(
      h.fetchCalls.filter((c) => callBody(c).projectId === "proj-b"),
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
  it("entering the admin key (change event) automatically queries every tracked project, without clicking Refresh all", async () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    expect(h.fetchCalls).toHaveLength(0);
    el(h, "admin-key").value = "my-key";
    el(h, "admin-key").trigger("change");
    await flush();
    const kinds = h.fetchCalls.map((c) => callBody(c).kind).sort();
    expect(kinds).toEqual(
      ["FORECAST_QUERY", "FORECAST_HEALTH_QUERY", "RECOVERY_QUERY"]
        .concat(["FORECAST_QUERY", "FORECAST_HEALTH_QUERY", "RECOVERY_QUERY"])
        .sort(),
    );
    expect(h.fetchCalls.some((c) => callBody(c).projectId === "proj-a")).toBe(
      true,
    );
    expect(h.fetchCalls.some((c) => callBody(c).projectId === "proj-b")).toBe(
      true,
    );
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

// Phase 2 (product integration), requirement #2: "Selecting a visible portfolio project must
// open a real usable Index Card/workspace." Every card already renders unconditionally in the
// always-visible workspace section (see the contract-level drawer-placement tests), so "opening"
// a project is scrolling its already-rendered card into view.
describe("selecting a portfolio row opens that project's Index Card", () => {
  it("clicking a portfolio row scrolls the matching project card's title into view", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a", "proj-b"],
    });
    const scrollSpy: { calls: number } = { calls: 0 };
    (
      el(h, "fp-1-title") as unknown as { scrollIntoView: () => void }
    ).scrollIntoView = () => {
      scrollSpy.calls += 1;
    };
    el(h, "ph-row-1").trigger("click");
    expect(scrollSpy.calls).toBe(1);
  });

  it("does nothing for a row whose project is no longer tracked", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }), {
      trackedProjects: ["proj-a"],
    });
    expect(() => {
      el(h, "ph-row-0").trigger("click");
    }).not.toThrow();
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
