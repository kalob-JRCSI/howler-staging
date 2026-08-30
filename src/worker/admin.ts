export function adminHtml(version: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Staging Control</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: max(18px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom)); background: #111318; color: #f4f6f8; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .sub { color: #b8c0cc; margin: 0 0 20px; line-height: 1.45; }
    .notice { border: 1px solid #805f00; background: #2d250d; padding: 13px; border-radius: 12px; margin-bottom: 18px; line-height: 1.4; }
    .card { background: #1b1f27; border: 1px solid #303744; border-radius: 14px; padding: 16px; margin: 14px 0; }
    label { display: block; font-weight: 700; margin-bottom: 8px; }
    input { box-sizing: border-box; width: 100%; font-size: 17px; padding: 12px; border-radius: 10px; border: 1px solid #4b5565; background: #0f1217; color: #fff; }
    .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    button { min-height: 48px; border: 0; border-radius: 10px; padding: 11px 12px; font-size: 16px; font-weight: 700; background: #315efb; color: #fff; }
    button.secondary { background: #3a4250; }
    button.danger { background: #8f2c2c; }
    button:disabled { opacity: 0.55; }
    .status { font-size: 14px; color: #b8c0cc; margin-top: 10px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; min-height: 160px; max-height: 55vh; overflow: auto; background: #090b0e; border: 1px solid #303744; border-radius: 12px; padding: 14px; font-size: 13px; line-height: 1.45; }
    @media (max-width: 520px) { .buttons { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>Howler Staging Control</h1>
  <p class="sub">Scheduling Intelligence v${version}. Live-evidence reforecast loop is enabled only inside this staging Worker.</p>
  <div class="notice"><strong>Shadow mode safety:</strong> forecast publishing remains disabled. This screen cannot change the live calendar, live dashboard, or the live jarvis-voice Worker.</div>

  <section class="card">
    <label for="key">HOWLER_ADMIN_KEY</label>
    <input id="key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste the staging admin key">
    <div class="status">The key stays in this browser tab only and is never placed in the URL.</div>
  </section>

  <section class="card">
    <div class="buttons">
      <button id="health">Check Setup</button>
      <button id="initDb" class="danger">Initialize Database</button>
      <button id="seed" class="danger">Seed DeBoard v0.9.1</button>
      <button id="forecast" class="secondary">View Current Forecast</button>
      <button id="forecastHealth" class="secondary">Forecast Health</button>
      <button id="recovery" class="secondary">v0.9.4 Recovery / Protection Review</button>
      <button id="previewEvidence">Preview v0.9.4 Supersession</button>
      <button id="applyEvidence" class="danger">Apply v0.9.4 Shadow Reforecast</button>
      <button id="events" class="secondary">View Evidence Events</button>
      <button id="baseline" class="secondary">View v0.8 Baseline</button>
      <button id="copy" class="secondary">Copy Result</button>
    </div>
  </section>

  <pre id="output">Tap Check Setup.</pre>
</main>
<script>
(() => {
  const keyInput = document.getElementById('key');
  const output = document.getElementById('output');
  const buttons = Array.from(document.querySelectorAll('button'));
  const saved = sessionStorage.getItem('howler_admin_key');
  if (saved) keyInput.value = saved;

  function show(value) {
    output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  async function api(path, options = {}, needsKey = true) {
    const key = keyInput.value.trim();
    if (needsKey && !key) {
      show('Paste HOWLER_ADMIN_KEY first.');
      return;
    }
    if (key) sessionStorage.setItem('howler_admin_key', key);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (needsKey) headers.set('Authorization', 'Bearer ' + key);
    if (options.body) headers.set('Content-Type', 'application/json');
    buttons.forEach((button) => button.disabled = true);
    show('Working...');
    try {
      const response = await fetch(path, { ...options, headers });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      show({ httpStatus: response.status, ok: response.ok, response: body });
    } catch (error) {
      show({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      buttons.forEach((button) => button.disabled = false);
    }
  }

  let lastEvidencePreview = null;

  async function requestJson(path, options = {}, needsKey = true) {
    const key = keyInput.value.trim();
    if (needsKey && !key) throw new Error('Paste HOWLER_ADMIN_KEY first.');
    if (key) sessionStorage.setItem('howler_admin_key', key);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (needsKey) headers.set('Authorization', 'Bearer ' + key);
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!response.ok) throw new Error(typeof body === 'string' ? body : JSON.stringify(body));
    return body;
  }

  async function buildMasonryEvidenceSimulation() {
    const current = await requestJson('/v1/projects/deboard-v091/forecast');
    const now = new Date().toISOString();
    const sourceId = 'src-v093-field-sim-' + Date.now();
    return {
      id: 'deboard-v093-field-sim-' + Date.now(),
      baseRevision: current.modelRevision,
      projectId: 'deboard-v091',
      type: 'FIELD_UPDATE',
      occurredAt: now,
      receivedAt: now,
      sourceIds: [sourceId],
      verification: 'PM_CONFIRMED',
      impactSeedActivityIds: ['masonry'],
      mutations: [
        { op: 'UPSERT_SOURCE', source: { id: sourceId, type: 'FIELD_REPORT', label: 'v0.9.3 current masonry commitment - CMU verified and Aug 27 mobilization committed', observedAt: now, effectiveDate: '2026-08-27', authority: 0.95, reliability: 0.95 } },
        { op: 'SUPERSEDE_SOURCE', sourceId: 'src-masonry-calendar', supersededBySourceId: sourceId },
        { op: 'SET_CONSTRAINT_STATE', constraintId: 'masonry-material', state: 'SATISFIED', verification: 'PM_CONFIRMED' },
        { op: 'SET_CONSTRAINT_READINESS', constraintId: 'masonry-material', readiness: { optimistic: '2026-08-26', likely: '2026-08-26', conservative: '2026-08-26' }, verification: 'PM_CONFIRMED' },
        { op: 'SET_CONSTRAINT_STATE', constraintId: 'masonry-trade', state: 'COMMITTED', verification: 'PM_CONFIRMED' },
        { op: 'SET_CONSTRAINT_READINESS', constraintId: 'masonry-trade', readiness: { optimistic: '2026-08-27', likely: '2026-08-27', conservative: '2026-08-27' }, verification: 'PM_CONFIRMED' }
      ],
      payload: { simulation: true, supersedesSourceId: 'src-masonry-calendar', materialVerified: true, masonryStartCommitment: '2026-08-27' },
      note: 'Staging-only v0.9.4 supersession test. Retains the Aug 24 source in history, marks it superseded, and keeps the Aug 27 commitment current. Does not touch live systems.'
    };
  }

  document.getElementById('health').addEventListener('click', () => api('/health', {}, false));
  document.getElementById('initDb').addEventListener('click', () => {
    if (!confirm('Initialize/repair the Howler staging database schema? Existing data will not be deleted.')) return;
    api('/v1/admin/init-db', { method: 'POST' });
  });
  document.getElementById('seed').addEventListener('click', () => {
    if (!confirm('Seed the DeBoard v0.9.1 truth-semantics model? The v0.9 and v0.8 baselines will remain untouched.')) return;
    api('/v1/projects/deboard-v091/seed', { method: 'POST' });
  });
  document.getElementById('forecast').addEventListener('click', () => api('/v1/projects/deboard-v091/forecast'));
  document.getElementById('forecastHealth').addEventListener('click', () => api('/v1/projects/deboard-v091/forecast/health'));
  document.getElementById('recovery').addEventListener('click', () => api('/v1/projects/deboard-v091/forecast/recovery'));
  document.getElementById('previewEvidence').addEventListener('click', async () => {
    buttons.forEach((button) => button.disabled = true);
    show('Building v0.9.4 supersession preview...');
    try {
      const event = await buildMasonryEvidenceSimulation();
      const preview = await requestJson('/v1/projects/deboard-v091/events/preview', { method: 'POST', body: JSON.stringify(event) });
      lastEvidencePreview = { event, reviewToken: preview.reviewToken };
      show({ simulation: true, persisted: false, instructions: 'Review supersededSources, PM action dates, recoveryAnalysis, protectionActions, standby recovery levers, delta, and oversight. Tap Apply v0.9.4 Shadow Reforecast to persist only to staging.', preview });
    } catch (error) {
      show({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      buttons.forEach((button) => button.disabled = false);
    }
  });
  document.getElementById('applyEvidence').addEventListener('click', async () => {
    if (!lastEvidencePreview) { show('Preview the v0.9.2 Evidence Loop first.'); return; }
    if (!confirm('Persist this v0.9.4 supersession event and reforecast to the staging D1 database? The old Aug 24 source remains in history and no live calendar/dashboard/system will be changed.')) return;
    api('/v1/projects/deboard-v091/events/apply-shadow', { method: 'POST', body: JSON.stringify(lastEvidencePreview) });
    lastEvidencePreview = null;
  });
  document.getElementById('events').addEventListener('click', () => api('/v1/projects/deboard-v091/events?limit=100'));
  document.getElementById('baseline').addEventListener('click', () => api('/v1/projects/deboard/forecast'));
  document.getElementById('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.textContent || ''); show('Result copied.'); }
    catch { show('Copy was blocked by the browser. Touch and hold the result to copy it.'); }
  });

  api('/health', {}, false);
})();
</script>
</body>
</html>`;
}

export function adminPage(version: string): Response {
  return new Response(adminHtml(version), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Task 16A: one-action staging operator panel. A second, independent same-origin page
// (`/admin/operator`) — the existing `/admin` PM dashboard above is untouched, so both coexist
// (design: 16A is side-by-side and reversible, not a replacement of 16A/16B are separate reviews).
// This page is a transport adapter only: it submits one canonical IntentV1 to POST /v1/intents (or
// POST /v1/workflows/:id/resume) and renders whatever the server returns — no forecasting,
// revision, retry, or mutation logic lives in the browser.
// ---------------------------------------------------------------------------------------------

/** The minimal element surface this page's client script actually uses — deliberately not the
 * real DOM lib (not in this project's tsconfig), and deliberately small enough that a test can
 * provide a faithful hand-built fake without a jsdom dependency. */
export interface OperatorPanelElement {
  value: string;
  textContent: string;
  disabled: boolean;
  hidden: boolean;
  addEventListener(type: string, handler: (event?: unknown) => void): void;
}

export interface OperatorPanelDocument {
  getElementById(id: string): OperatorPanelElement;
}

export interface OperatorPanelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OperatorPanelResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type OperatorPanelFetch = (
  path: string,
  options?: { method?: string; headers?: unknown; body?: string },
) => Promise<OperatorPanelResponse>;

export interface OperatorPanelCrypto {
  randomUUID(): string;
}

interface SubmissionIdentity {
  intentId: string;
  idempotencyKey: string;
  submittedAt: string;
}

interface FormFields {
  kind: string;
  projectId: string;
  expectedRevision: number | null;
  evidenceEvent: unknown;
}

export interface OperatorPanelTestHooks {
  computeFormSignature?: (fields: FormFields) => string;
  resolveSubmissionIdentity?: (
    formSignature: string,
    storage: OperatorPanelStorage,
    nowIso: () => string,
    makeId: () => string,
  ) => SubmissionIdentity;
  buildIntentPayload?: (
    fields: FormFields,
    identity: SubmissionIdentity,
  ) => unknown;
  mapOutcomeToDisplay?: (body: unknown) => Record<string, unknown>;
}

const PENDING_KEY = "howler_operator_pending_submission";
const ADMIN_KEY_STORAGE_KEY = "howler_admin_key";
const EM_DASH = String.fromCharCode(8212);
const EVIDENCE_KINDS = new Set(["EVIDENCE_PREVIEW", "EVIDENCE_APPLY_SHADOW"]);
const REQUIRED_EFFECT_BY_KIND: Record<string, string> = {
  FORECAST_QUERY: "READ_ONLY",
  FORECAST_HEALTH_QUERY: "READ_ONLY",
  RECOVERY_QUERY: "READ_ONLY",
  EVIDENCE_PREVIEW: "PREVIEW",
  EVIDENCE_APPLY_SHADOW: "APPLY_SHADOW",
};

/**
 * The entire client-side script, as a real, directly-callable, directly-testable function —
 * `.toString()`-embedded verbatim into the page's <script> tag (called there with the four real
 * globals) and imported/called directly in a test with fake globals. One source of truth for
 * both; no `new Function`/`eval` needed on either side. The optional 5th parameter is a test-only
 * hook: production always calls this with 4 arguments, so `testHooks` is always `undefined` on
 * the page itself and every `if (testHooks)` branch is dead code in production.
 */
export function operatorPanelClientScript(
  document: OperatorPanelDocument,
  sessionStorage: OperatorPanelStorage,
  fetch: OperatorPanelFetch,
  crypto: OperatorPanelCrypto,
  testHooks?: OperatorPanelTestHooks,
): void {
  function computeFormSignature(fields: FormFields): string {
    return JSON.stringify(fields);
  }

  /**
   * Design: "Do NOT generate a new logical intent merely because fetch failed / response was
   * lost / user presses retry for the same submission. A NEW deliberate user action may create
   * new identifiers." Keyed purely by whether the form's own content changed since the last
   * submission attempt -- unchanged content always reuses the stored identity, regardless of why
   * the operator is submitting again.
   */
  function resolveSubmissionIdentity(
    formSignature: string,
    storage: OperatorPanelStorage,
    nowIso: () => string,
    makeId: () => string,
  ): SubmissionIdentity {
    const storedRaw = storage.getItem(PENDING_KEY);
    if (storedRaw) {
      let stored: (SubmissionIdentity & { formSignature: string }) | null =
        null;
      try {
        stored = JSON.parse(storedRaw) as SubmissionIdentity & {
          formSignature: string;
        };
      } catch {
        stored = null;
      }
      if (stored && stored.formSignature === formSignature) {
        return {
          intentId: stored.intentId,
          idempotencyKey: stored.idempotencyKey,
          submittedAt: stored.submittedAt,
        };
      }
    }
    const fresh = {
      formSignature,
      intentId: makeId(),
      idempotencyKey: makeId(),
      submittedAt: nowIso(),
    };
    storage.setItem(PENDING_KEY, JSON.stringify(fresh));
    return {
      intentId: fresh.intentId,
      idempotencyKey: fresh.idempotencyKey,
      submittedAt: fresh.submittedAt,
    };
  }

  function buildIntentPayload(
    fields: FormFields,
    identity: SubmissionIdentity,
  ): unknown {
    const isEvidence = EVIDENCE_KINDS.has(fields.kind);
    return {
      schemaVersion: "1",
      intentId: identity.intentId,
      idempotencyKey: identity.idempotencyKey,
      projectId: fields.projectId,
      kind: fields.kind,
      requestedEffect: REQUIRED_EFFECT_BY_KIND[fields.kind],
      expectedProjectRevision: isEvidence ? fields.expectedRevision : null,
      submittedAt: identity.submittedAt,
      source: { channel: "OPERATOR_UI" },
      payload: isEvidence
        ? { type: "EVIDENCE", event: fields.evidenceEvent }
        : { type: "QUERY" },
    };
  }

  function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  function asNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
  }

  /** Maps one IntentSubmissionResponseV1-shaped body to plain display strings. Never includes the
   * admin key or any raw error stack -- only the structured run/result fields the server sent. */
  function mapOutcomeToDisplay(body: unknown): Record<string, unknown> {
    const record = (body ?? {}) as Record<string, unknown>;
    const run = (record.run ?? {}) as Record<string, unknown>;
    const result = record.result as Record<string, unknown> | undefined;
    const problem = result?.problem as Record<string, unknown> | undefined;
    const isRevisionConflict = problem?.code === "REVISION_CONFLICT";
    const attempt = asNumber(run.attempt);
    const maxAttempts = asNumber(run.maxAttempts);
    return {
      intentId: asString(run.intentId) ?? EM_DASH,
      workflowId: asString(run.workflowId) ?? EM_DASH,
      workflowState: asString(run.state) ?? EM_DASH,
      attempt:
        attempt !== undefined && maxAttempts !== undefined
          ? `${String(attempt)} / ${String(maxAttempts)}`
          : EM_DASH,
      currentStep: asString(run.currentStep) ?? EM_DASH,
      resultId: (result && asString(result.resultId)) ?? EM_DASH,
      resultStatus: (result && asString(result.status)) ?? EM_DASH,
      persisted: result ? String(result.persisted) : EM_DASH,
      problem: problem ? JSON.stringify(problem) : EM_DASH,
      revisionConflict: isRevisionConflict
        ? JSON.stringify(problem.details ?? {})
        : EM_DASH,
      showResume: run.state === "INTERRUPTED",
    };
  }

  if (testHooks) {
    testHooks.computeFormSignature = computeFormSignature;
    testHooks.resolveSubmissionIdentity = resolveSubmissionIdentity;
    testHooks.buildIntentPayload = buildIntentPayload;
    testHooks.mapOutcomeToDisplay = mapOutcomeToDisplay;
  }

  const els = {
    form: document.getElementById("intent-form"),
    adminKey: document.getElementById("admin-key"),
    projectId: document.getElementById("project-id"),
    intentKind: document.getElementById("intent-kind"),
    revisionField: document.getElementById("revision-field"),
    expectedRevision: document.getElementById("expected-revision"),
    evidenceField: document.getElementById("evidence-field"),
    evidenceEventJson: document.getElementById("evidence-event-json"),
    runButton: document.getElementById("run-intent"),
    resumeButton: document.getElementById("resume-button"),
    status: document.getElementById("status"),
    outIntentId: document.getElementById("out-intent-id"),
    outWorkflowId: document.getElementById("out-workflow-id"),
    outWorkflowState: document.getElementById("out-workflow-state"),
    outAttempt: document.getElementById("out-attempt"),
    outCurrentStep: document.getElementById("out-current-step"),
    outResultId: document.getElementById("out-result-id"),
    outResultStatus: document.getElementById("out-result-status"),
    outPersisted: document.getElementById("out-persisted"),
    outProblem: document.getElementById("out-problem"),
    outRevisionConflict: document.getElementById("out-revision-conflict"),
  };

  const savedKey = sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY);
  if (savedKey) els.adminKey.value = savedKey;

  let currentWorkflowId: string | null = null;
  let requestInFlight = false;

  function updateConditionalFields(): void {
    const isEvidence = EVIDENCE_KINDS.has(els.intentKind.value);
    els.revisionField.hidden = !isEvidence;
    els.evidenceField.hidden = !isEvidence;
  }
  els.intentKind.addEventListener("change", updateConditionalFields);
  updateConditionalFields();

  function currentFields(): FormFields {
    const isEvidence = EVIDENCE_KINDS.has(els.intentKind.value);
    let evidenceEvent: unknown = null;
    if (isEvidence) {
      try {
        evidenceEvent = JSON.parse(els.evidenceEventJson.value || "null");
      } catch {
        evidenceEvent = null;
      }
    }
    return {
      kind: els.intentKind.value,
      projectId: els.projectId.value.trim(),
      expectedRevision: isEvidence ? Number(els.expectedRevision.value) : null,
      evidenceEvent,
    };
  }

  function renderDisplay(display: Record<string, unknown>): void {
    els.outIntentId.textContent = String(display.intentId);
    els.outWorkflowId.textContent = String(display.workflowId);
    els.outWorkflowState.textContent = String(display.workflowState);
    els.outAttempt.textContent = String(display.attempt);
    els.outCurrentStep.textContent = String(display.currentStep);
    els.outResultId.textContent = String(display.resultId);
    els.outResultStatus.textContent = String(display.resultStatus);
    els.outPersisted.textContent = String(display.persisted);
    els.outProblem.textContent = String(display.problem);
    els.outRevisionConflict.textContent = String(display.revisionConflict);
    const workflowId = display.workflowId;
    if (typeof workflowId === "string" && workflowId !== EM_DASH) {
      currentWorkflowId = workflowId;
    }
    els.resumeButton.hidden = !display.showResume;
  }

  function setBusy(busy: boolean): void {
    requestInFlight = busy;
    els.runButton.disabled = busy;
    els.resumeButton.disabled = busy || els.resumeButton.hidden;
    els.status.textContent = busy
      ? `Working${String.fromCharCode(8230)}`
      : "Ready.";
  }

  function callApi(
    path: string,
    options: { method: string; body?: string },
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const key = els.adminKey.value.trim();
    if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
    const headers = new Headers();
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${key}`);
    if (options.body) headers.set("Content-Type", "application/json");
    return fetch(path, { ...options, headers }).then((response) =>
      response.text().then((text) => {
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = { error: text };
        }
        return { ok: response.ok, status: response.status, body };
      }),
    );
  }

  function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function handleOutcome(
    promise: Promise<{ ok: boolean; status: number; body: unknown }>,
  ): Promise<void> {
    return promise
      .then((result) => {
        const body = result.body as
          { run?: unknown; result?: unknown; error?: string } | undefined;
        if (body && (body.run ?? body.result)) {
          renderDisplay(mapOutcomeToDisplay(result.body));
          els.status.textContent = "Ready.";
        } else {
          els.status.textContent = `Error: ${body?.error ?? `HTTP ${String(result.status)}`}`;
        }
      })
      .catch((error: unknown) => {
        els.status.textContent = `Error: ${describeError(error)}`;
      })
      .then(() => {
        setBusy(false);
      });
  }

  els.form.addEventListener("submit", (event) => {
    (event as { preventDefault(): void }).preventDefault();
    if (requestInFlight) return;
    const fields = currentFields();
    const identity = resolveSubmissionIdentity(
      computeFormSignature(fields),
      sessionStorage,
      () => new Date().toISOString(),
      () => crypto.randomUUID(),
    );
    const intent = buildIntentPayload(fields, identity);
    setBusy(true);
    void handleOutcome(
      callApi("/v1/intents", { method: "POST", body: JSON.stringify(intent) }),
    );
  });

  els.resumeButton.addEventListener("click", () => {
    if (requestInFlight || !currentWorkflowId) return;
    setBusy(true);
    void handleOutcome(
      callApi(`/v1/workflows/${encodeURIComponent(currentWorkflowId)}/resume`, {
        method: "POST",
      }),
    );
  });
}

export function operatorPanelHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Operator Panel</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); background: #111318; color: #f4f6f8; font-size: 15px; }
    main { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 0 0 10px; }
    .sub { color: #b8c0cc; margin: 0 0 14px; line-height: 1.4; font-size: 13px; }
    #env-banner { border: 1px solid #1f7a3d; background: #0d2416; color: #7be3a3; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px; font-weight: 700; letter-spacing: 0.02em; text-align: center; }
    .card { background: #1b1f27; border: 1px solid #303744; border-radius: 12px; padding: 14px; margin: 10px 0; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px; }
    input, select, textarea { box-sizing: border-box; width: 100%; font-size: 15px; padding: 10px; border-radius: 8px; border: 1px solid #4b5565; background: #0f1217; color: #fff; font-family: inherit; }
    textarea { font-family: ui-monospace, monospace; font-size: 13px; }
    button { min-height: 44px; border: 0; border-radius: 8px; padding: 10px 14px; font-size: 15px; font-weight: 700; background: #315efb; color: #fff; cursor: pointer; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    dl { margin: 0; display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 6px 12px; font-size: 13px; }
    dt { color: #b8c0cc; }
    dd { margin: 0; word-break: break-word; }
    #status { font-size: 13px; color: #b8c0cc; margin-top: 10px; }
    @media (max-width: 480px) { dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
  </style>
</head>
<body>
<main>
  <div id="env-banner" role="status">STAGING &middot; SHADOW &middot; NO LIVE SYSTEMS</div>
  <h1>Howler Operator Panel</h1>
  <p class="sub">One canonical intent per action. This page submits requests only; all forecasting, revision, retry, and mutation logic runs server-side.</p>

  <form id="intent-form">
    <section class="card">
      <label for="admin-key">HOWLER_ADMIN_KEY</label>
      <input id="admin-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste the staging admin key">
    </section>

    <section class="card">
      <label for="project-id">Project ID</label>
      <input id="project-id" type="text" value="deboard-v091" autocapitalize="none" spellcheck="false">
    </section>

    <section class="card">
      <label for="intent-kind">Intent</label>
      <select id="intent-kind">
        <option value="FORECAST_QUERY">Forecast query (read-only)</option>
        <option value="FORECAST_HEALTH_QUERY">Forecast health (read-only)</option>
        <option value="RECOVERY_QUERY">Recovery / protection review (read-only)</option>
        <option value="EVIDENCE_PREVIEW">Evidence preview</option>
        <option value="EVIDENCE_APPLY_SHADOW">Apply shadow evidence (mutates staging only)</option>
      </select>
    </section>

    <section class="card" id="revision-field" hidden>
      <label for="expected-revision">Expected project revision</label>
      <input id="expected-revision" type="number" min="0" step="1" inputmode="numeric">
    </section>

    <section class="card" id="evidence-field" hidden>
      <label for="evidence-event-json">Evidence event (JSON)</label>
      <textarea id="evidence-event-json" rows="8" spellcheck="false" aria-describedby="evidence-help"></textarea>
      <div id="evidence-help" class="sub">Paste the full ProjectEventInput JSON body.</div>
    </section>

    <button id="run-intent" type="submit">Run intent</button>
  </form>

  <section class="card" id="result-panel">
    <h2>Workflow</h2>
    <dl>
      <dt>Intent ID</dt><dd id="out-intent-id">&mdash;</dd>
      <dt>Workflow ID</dt><dd id="out-workflow-id">&mdash;</dd>
      <dt>Workflow state</dt><dd id="out-workflow-state">&mdash;</dd>
      <dt>Attempt</dt><dd id="out-attempt">&mdash;</dd>
      <dt>Current step</dt><dd id="out-current-step">&mdash;</dd>
      <dt>Result ID</dt><dd id="out-result-id">&mdash;</dd>
      <dt>Result status</dt><dd id="out-result-status">&mdash;</dd>
      <dt>Persisted</dt><dd id="out-persisted">&mdash;</dd>
      <dt>Problem</dt><dd id="out-problem">&mdash;</dd>
      <dt>Revision conflict</dt><dd id="out-revision-conflict">&mdash;</dd>
    </dl>
    <p style="margin: 12px 0 8px;">
      <button id="resume-button" type="button" hidden>Resume workflow</button>
    </p>
    <div id="status" aria-live="polite">Ready.</div>
  </section>
</main>
<script>
(${operatorPanelClientScript.toString()})(document, sessionStorage, fetch, crypto);
</script>
</body>
</html>`;
}

export function operatorPanelPage(): Response {
  return new Response(operatorPanelHtml(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
