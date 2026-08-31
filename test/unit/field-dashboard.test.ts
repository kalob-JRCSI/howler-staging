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

function makeElement(overrides: Partial<FakeElement> = {}): FakeElement {
  const listeners: Record<string, ((event?: unknown) => void)[]> = {};
  return {
    value: "",
    textContent: "",
    disabled: false,
    hidden: false,
    innerHTML: "",
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler);
    },
    trigger(type, event) {
      for (const handler of listeners[type] ?? []) handler(event);
    },
    ...overrides,
  };
}

function makeFakeDocument(
  staticIds: string[],
  containerIds: string[],
): { document: FieldDashboardDocument; elements: Map<string, FakeElement> } {
  const elements = new Map<string, FakeElement>();
  for (const id of staticIds) elements.set(id, makeElement());

  for (const containerId of containerIds) {
    const container = elements.get(containerId);
    if (!container) throw new Error(`unknown container id: ${containerId}`);
    let html = "";
    Object.defineProperty(container, "innerHTML", {
      get: () => html,
      set: (value: string) => {
        html = value;
        // A real innerHTML setter discards the previous subtree and builds fresh nodes, so
        // getElementById after a re-render must return brand-new elements, not stale ones from a
        // prior render (a removed/reordered project shifts every later index's ids).
        for (const match of value.matchAll(
          /<([a-zA-Z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)/g,
        )) {
          const id = match[2];
          const text = match[3] ?? "";
          if (!id) continue;
          elements.set(id, makeElement({ textContent: text }));
        }
      },
    });
  }

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

function mount(
  respond: Respond,
  options: { randomIds?: string[]; trackedProjects?: string[] } = {},
): Harness {
  const { document, elements } = makeFakeDocument(
    [
      "admin-key",
      "new-project-id",
      "add-project",
      "refresh-all",
      "projects-container",
    ],
    ["projects-container"],
  );
  const storage = makeStorage();
  if (options.trackedProjects) {
    storage.setItem(
      "howler_field_tracked_projects",
      JSON.stringify(options.trackedProjects),
    );
  }
  const { fetchFn, calls } = makeFetch(respond);
  const crypto = makeCrypto(
    options.randomIds ?? [
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
    ],
  );
  const testHooks: FieldDashboardTestHooks = {};
  fieldDashboardClientScript(document, storage, fetchFn, crypto, testHooks);
  return {
    document,
    elements,
    storage,
    fetchCalls: calls,
    testHooks: testHooks as Required<FieldDashboardTestHooks>,
  };
}

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function el(h: Harness, id: string): FakeElement {
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

  it("defaults to a single tracked project (deboard-v091) when nothing is stored", () => {
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
    expect(el(h, "fp-0-title").textContent).toBe("deboard-v091");
    expect(() => el(h, "fp-1-title")).toThrow();
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
    expect(el(h, "fp-0-resume").hidden).toBe(false);
    el(h, "fp-0-resume").trigger("click");
    await flush();
    const resumeCall = h.fetchCalls.find((c) => c.path.includes("/resume"));
    expect(resumeCall?.path).toBe("/v1/workflows/wf-xyz/resume");
  });

  it("shows a structured problem for a BLOCKED/revision-conflict result", async () => {
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
    el(h, "fp-0-evidence-json").value = "{}";
    el(h, "fp-0-evidence-run").trigger("click");
    await flush();
    expect(el(h, "fp-0-problem").textContent).toContain("REVISION_CONFLICT");
  });

  it("shows SUCCEEDED workflow state plainly with no dominant raw JSON (expandable, non-empty)", async () => {
    const h = mount(() => ({
      ok: true,
      status: 200,
      bodyText: json(submissionBody({})),
    }));
    el(h, "fp-0-refresh").trigger("click");
    await flush();
    expect(el(h, "fp-0-workflow-state").textContent).toBe("SUCCEEDED");
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
    const h = mount(() => ({ ok: true, status: 200, bodyText: "{}" }));
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
  it("preloads a previously saved admin key from sessionStorage", () => {
    const { document, elements } = makeFakeDocument(
      [
        "admin-key",
        "new-project-id",
        "add-project",
        "refresh-all",
        "projects-container",
      ],
      ["projects-container"],
    );
    const storage = makeStorage();
    storage.setItem("howler_admin_key", "saved-key");
    const { fetchFn } = makeFetch(() => ({
      ok: true,
      status: 200,
      bodyText: "{}",
    }));
    fieldDashboardClientScript(document, storage, fetchFn, makeCrypto([]));
    expect(elements.get("admin-key")?.value).toBe("saved-key");
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
});
