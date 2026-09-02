import { speakVoicePresentation, voiceBrowserClient } from "./voice-transport";

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
  /** Optional: real sessionStorage has this natively. Task 16A never needs it (its single
   * identity slot is simply overwritten). Task 16B's field dashboard uses it to release a
   * resolved, no-longer-active project's pending-identity record on removal, so a long field
   * session doesn't grow sessionStorage without bound. */
  removeItem?(key: string): void;
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

export interface SubmissionIdentity {
  intentId: string;
  idempotencyKey: string;
  submittedAt: string;
}

/**
 * The sessionStorage-persisted record backing one submission's identity lifecycle. PENDING means
 * no definitive server response has arrived yet for this identity (safe to retry-reuse);
 * RESOLVED means one has (a later Run with the same form content mints a new identity instead).
 */
interface StoredSubmission extends SubmissionIdentity {
  formSignature: string;
  state: "PENDING" | "RESOLVED";
}

export interface FormFields {
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
    storageKey?: string,
  ) => SubmissionIdentity;
  markSubmissionResolved?: (
    storage: OperatorPanelStorage,
    storageKey?: string,
  ) => void;
  isDefinitiveOutcome?: (result: { status: number; body: unknown }) => boolean;
  buildIntentPayload?: (
    fields: FormFields,
    identity: SubmissionIdentity,
  ) => unknown;
  mapOutcomeToDisplay?: (body: unknown) => Record<string, unknown>;
  mapHealthToDisplay?: (body: unknown) => Record<string, unknown>;
  mapRecoveryToDisplay?: (body: unknown) => Record<string, unknown>;
  recommendNextMove?: (
    health: Record<string, unknown> | null,
    recovery: Record<string, unknown> | null,
  ) => string;
}

export interface SubmissionKernel {
  computeFormSignature: (fields: FormFields) => string;
  resolveSubmissionIdentity: (
    formSignature: string,
    storage: OperatorPanelStorage,
    nowIso: () => string,
    makeId: () => string,
    storageKey?: string,
  ) => SubmissionIdentity;
  markSubmissionResolved: (
    storage: OperatorPanelStorage,
    storageKey?: string,
  ) => void;
  isDefinitiveOutcome: (result: { status: number; body: unknown }) => boolean;
  buildIntentPayload: (
    fields: FormFields,
    identity: SubmissionIdentity,
  ) => unknown;
  mapOutcomeToDisplay: (body: unknown) => Record<string, unknown>;
  mapHealthToDisplay: (body: unknown) => Record<string, unknown>;
  mapRecoveryToDisplay: (body: unknown) => Record<string, unknown>;
  recommendNextMove: (
    health: Record<string, unknown> | null,
    recovery: Record<string, unknown> | null,
  ) => string;
  callApi: (
    fetch: OperatorPanelFetch,
    sessionStorage: OperatorPanelStorage,
    adminKey: string,
    path: string,
    options: { method: string; body?: string },
  ) => Promise<{ ok: boolean; status: number; body: unknown }>;
  describeError: (error: unknown) => string;
}

/**
 * The client submission identity/outcome logic shared by every operator-core client page --
 * Task 16A's one-action panel and Task 16B's field dashboard alike. One canonical, DOM-independent
 * implementation, `.toString()`-embedded verbatim into each page's own <script> tag ahead of that
 * page's own DOM wiring (so it becomes a real top-level function in that page's script scope), and
 * imported/called directly here and in tests -- never duplicated as a second implementation.
 *
 * All constants this function needs are declared *inside* it (rather than at module scope) on
 * purpose: `.toString()` on a function captures only that function's own source text, not the
 * enclosing module's other top-level declarations. A page embeds this text into a real
 * `<script>` tag in a browser realm that never sees the rest of admin.ts, so any module-level
 * const this body referenced by name would be a `ReferenceError` the first time the page actually
 * ran -- invisible to every test here, since they all call this function directly within the
 * module, where such a reference would resolve fine.
 */
export function createSubmissionKernel(): SubmissionKernel {
  const PENDING_KEY = "howler_operator_pending_submission";
  const ADMIN_KEY_STORAGE_KEY = "howler_admin_key";
  const EM_DASH = String.fromCharCode(8212);
  const EVIDENCE_KINDS = new Set(["EVIDENCE_PREVIEW", "EVIDENCE_APPLY_SHADOW"]);
  /** The Task 15 structured 409 outcomes that carry no `run` object of their own. */
  const REUSE_OR_CONFLICT_CODES = new Set([
    "IDEMPOTENCY_KEY_REUSE",
    "INTENT_ID_REUSE",
    "CONCURRENT_RESUME_LOST",
  ]);
  const REQUIRED_EFFECT_BY_KIND: Record<string, string> = {
    FORECAST_QUERY: "READ_ONLY",
    FORECAST_HEALTH_QUERY: "READ_ONLY",
    RECOVERY_QUERY: "READ_ONLY",
    EVIDENCE_PREVIEW: "PREVIEW",
    EVIDENCE_APPLY_SHADOW: "APPLY_SHADOW",
  };

  function computeFormSignature(fields: FormFields): string {
    return JSON.stringify(fields);
  }

  function readStoredSubmission(
    storage: OperatorPanelStorage,
    storageKey: string,
  ): StoredSubmission | null {
    const storedRaw = storage.getItem(storageKey);
    if (!storedRaw) return null;
    try {
      return JSON.parse(storedRaw) as StoredSubmission;
    } catch {
      return null;
    }
  }

  /**
   * Design: two distinct states. While PENDING (no definitive server response has been received
   * yet for this identity), "Do NOT generate a new logical intent merely because fetch failed /
   * response was lost / user presses retry for the same submission" -- unchanged form content
   * always reuses the stored identity, regardless of why the operator is submitting again. Once
   * `markSubmissionResolved` has run (a definitive server response arrived), the identity is
   * RESOLVED: a later deliberate Run with the identical form content is a NEW logical action, not
   * a replay of the resolved one, and mints a fresh identity even though the signature matches.
   *
   * `storageKey` defaults to the single-slot Task 16A key (one form, one action at a time). A page
   * with multiple independent concurrent actions -- Task 16B's field dashboard, one per
   * project/intent-kind pair -- passes its own distinct key per action so each has its own
   * independent pending/resolved slot instead of stomping a shared one.
   */
  function resolveSubmissionIdentity(
    formSignature: string,
    storage: OperatorPanelStorage,
    nowIso: () => string,
    makeId: () => string,
    storageKey: string = PENDING_KEY,
  ): SubmissionIdentity {
    const stored = readStoredSubmission(storage, storageKey);
    if (
      stored &&
      stored.state === "PENDING" &&
      stored.formSignature === formSignature
    ) {
      return {
        intentId: stored.intentId,
        idempotencyKey: stored.idempotencyKey,
        submittedAt: stored.submittedAt,
      };
    }
    const fresh: StoredSubmission = {
      formSignature,
      intentId: makeId(),
      idempotencyKey: makeId(),
      submittedAt: nowIso(),
      state: "PENDING",
    };
    storage.setItem(storageKey, JSON.stringify(fresh));
    return {
      intentId: fresh.intentId,
      idempotencyKey: fresh.idempotencyKey,
      submittedAt: fresh.submittedAt,
    };
  }

  /**
   * A fetch settling (as opposed to rejecting) is not by itself proof of the logical intent's
   * server-side fate -- an arbitrary 5xx can happen after the server already did real work, and a
   * malformed/unparseable body proves nothing either way. Only a response shape the Task 15
   * contract actually documents counts as DEFINITIVE:
   *
   *  - a recognized `run` object (workflowId + state) -- present on 200/201 (SUCCEEDED),
   *    202 (INTERRUPTED), 409 (BLOCKED), and 500 (FAILED) alike, since all of them carry the
   *    authoritative run/result Task 15 already persisted;
   *  - 401/403 -- Task 15 authenticates before parsing or persisting anything, so rejection here
   *    proves no workflow was ever created;
   *  - a structured 409 reuse/conflict outcome (IDEMPOTENCY_KEY_REUSE, INTENT_ID_REUSE,
   *    CONCURRENT_RESUME_LOST) -- these have no `run` object of their own, but are still a
   *    recognized, documented Task 15 shape;
   *  - a structured 400 validation rejection (a `details.problems` array) -- proven
   *    pre-`claimIntent`, so no workflow was created.
   *
   * Anything else -- an unrecognized 5xx, an unparseable body, a response with none of the above
   * shapes -- is UNCERTAIN: the identity must stay PENDING so the next retry reuses it rather than
   * risking a second logical intent for work whose fate is not actually known.
   */
  function isDefinitiveOutcome(result: {
    status: number;
    body: unknown;
  }): boolean {
    const body = result.body as
      | {
          run?: { workflowId?: unknown; state?: unknown };
          details?: { code?: unknown; problems?: unknown };
        }
      | undefined;
    if (!body) return false;

    const run = body.run;
    if (
      run &&
      typeof run.workflowId === "string" &&
      typeof run.state === "string"
    ) {
      return true;
    }

    if (result.status === 401 || result.status === 403) return true;

    const code = body.details?.code;
    if (
      result.status === 409 &&
      typeof code === "string" &&
      REUSE_OR_CONFLICT_CODES.has(code)
    ) {
      return true;
    }

    if (result.status === 400 && Array.isArray(body.details?.problems)) {
      return true;
    }

    return false;
  }

  /**
   * Marks whatever identity is currently pending as RESOLVED: called only when
   * `isDefinitiveOutcome` proves the submission's fate is actually known. A 202 INTERRUPTED
   * response counts as definitive: it is known server acceptance of the intent/workflow, and the
   * correct way to continue it is the explicit Resume workflow action, not a coincidental identity
   * match on a later Run click. A network exception never reaches this function at all, and an
   * uncertain (not-definitive) response deliberately does not call it either, so both leave the
   * identity PENDING and still retryable. A no-op if nothing is pending. `storageKey` defaults to
   * the Task 16A single-slot key; see `resolveSubmissionIdentity` for why callers with multiple
   * independent concurrent actions pass their own key instead.
   */
  function markSubmissionResolved(
    storage: OperatorPanelStorage,
    storageKey: string = PENDING_KEY,
  ): void {
    const stored = readStoredSubmission(storage, storageKey);
    if (!stored) return;
    storage.setItem(
      storageKey,
      JSON.stringify({ ...stored, state: "RESOLVED" }),
    );
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

  /**
   * Maps an IntentSubmissionResponseV1 body carrying a FORECAST_HEALTH result output to plain
   * display fields, purely by reading fields the already-accepted health engine
   * (src/worker/health.ts's ProjectHealthV094) already computed -- no new analysis. `available:
   * false` when this response is not a health result (e.g. the query hasn't been run yet, or
   * failed) so the field dashboard can show a neutral placeholder instead of stale data.
   */
  function mapHealthToDisplay(body: unknown): Record<string, unknown> {
    const record = (body ?? {}) as Record<string, unknown>;
    const result = record.result as Record<string, unknown> | undefined;
    const output = result?.output as Record<string, unknown> | undefined;
    if (!output || output.type !== "FORECAST_HEALTH") {
      return { available: false };
    }
    const data = (output.data ?? {}) as Record<string, unknown>;
    const completion = data.completion as Record<string, unknown> | null;
    const blockedConstraints = Array.isArray(data.blockedConstraints)
      ? (data.blockedConstraints as Record<string, unknown>[])
      : [];
    const unverifiedHardConstraints = Array.isArray(
      data.unverifiedHardConstraints,
    )
      ? (data.unverifiedHardConstraints as Record<string, unknown>[])
      : [];
    const openConflicts = Array.isArray(data.openConflicts)
      ? (data.openConflicts as Record<string, unknown>[])
      : [];
    const lowCoverage = Array.isArray(data.lowCoverage) ? data.lowCoverage : [];
    return {
      available: true,
      completionLikely: completion
        ? (asString(completion.likely) ?? EM_DASH)
        : EM_DASH,
      meanForecastConfidence: asNumber(data.meanForecastConfidence) ?? null,
      blockedConstraintCount: blockedConstraints.length,
      unverifiedHardConstraintCount: unverifiedHardConstraints.length,
      openConflictCount: openConflicts.length,
      lowCoverageCount: lowCoverage.length,
      priorityActions: blockedConstraints
        .map(
          (c) =>
            `Unblock: ${asString(c.label) ?? asString(c.id) ?? "constraint"}`,
        )
        .concat(
          unverifiedHardConstraints.map(
            (c) =>
              `Verify: ${asString(c.label) ?? asString(c.id) ?? "constraint"}`,
          ),
        ),
      topRisks: openConflicts.map(
        (c) =>
          `${asString(c.severity) ?? "conflict"}: ${asString(c.description) ?? asString(c.id) ?? "open conflict"}`,
      ),
    };
  }

  /**
   * Maps an IntentSubmissionResponseV1 body carrying a RECOVERY result output to plain display
   * fields, purely by reading the already-accepted recoveryLayer summary
   * (src/operator/result.ts's RecoveryResponseV094) -- no new analysis.
   */
  function mapRecoveryToDisplay(body: unknown): Record<string, unknown> {
    const record = (body ?? {}) as Record<string, unknown>;
    const result = record.result as Record<string, unknown> | undefined;
    const output = result?.output as Record<string, unknown> | undefined;
    if (!output || output.type !== "RECOVERY") {
      return { available: false };
    }
    const data = (output.data ?? {}) as Record<string, unknown>;
    const layer = (data.recoveryLayer ?? {}) as Record<string, unknown>;
    return {
      available: true,
      recoveryStatus: asString(layer.status) ?? EM_DASH,
      nextRiskDate: asString(layer.nextRiskDate) ?? EM_DASH,
      criticalExposureCount: asNumber(layer.criticalExposureCount) ?? 0,
      blockedProtectionCount: asNumber(layer.blockedProtectionCount) ?? 0,
      standbyRecoveryCapacityWorkdays:
        asNumber(layer.standbyRecoveryCapacityWorkdays) ?? 0,
    };
  }

  /**
   * A deterministic, rule-based "what should the PM do next" derived only from counts already
   * surfaced by `mapHealthToDisplay`/`mapRecoveryToDisplay` -- not a new forecasting or predictive
   * algorithm. Checked in a fixed priority order: blocked constraints (hard-blocking) outrank
   * critical recovery exposure, which outranks open conflicts, which outranks blocked protection
   * actions, which outranks unverified hard constraints.
   */
  function recommendNextMove(
    health: Record<string, unknown> | null,
    recovery: Record<string, unknown> | null,
  ): string {
    if (!health && !recovery)
      return "Run Refresh to load project intelligence.";
    const blocked = (health?.blockedConstraintCount as number | undefined) ?? 0;
    const conflicts = (health?.openConflictCount as number | undefined) ?? 0;
    const unverified =
      (health?.unverifiedHardConstraintCount as number | undefined) ?? 0;
    const criticalExposure =
      (recovery?.criticalExposureCount as number | undefined) ?? 0;
    const blockedProtection =
      (recovery?.blockedProtectionCount as number | undefined) ?? 0;
    if (blocked > 0) {
      return `Resolve ${String(blocked)} blocked constraint${blocked === 1 ? "" : "s"}.`;
    }
    if (criticalExposure > 0) {
      return `Address ${String(criticalExposure)} critical recovery exposure${criticalExposure === 1 ? "" : "s"}.`;
    }
    if (conflicts > 0) {
      return `Review ${String(conflicts)} open conflict${conflicts === 1 ? "" : "s"}.`;
    }
    if (blockedProtection > 0) {
      return `Unblock ${String(blockedProtection)} recovery protection action${blockedProtection === 1 ? "" : "s"}.`;
    }
    if (unverified > 0) {
      return `Verify ${String(unverified)} hard constraint${unverified === 1 ? "" : "s"}.`;
    }
    return `No urgent action ${EM_DASH} monitor forecast.`;
  }

  function callApi(
    fetch: OperatorPanelFetch,
    sessionStorage: OperatorPanelStorage,
    adminKey: string,
    path: string,
    options: { method: string; body?: string },
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    if (adminKey) sessionStorage.setItem(ADMIN_KEY_STORAGE_KEY, adminKey);
    const headers = new Headers();
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${adminKey}`);
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

  return {
    computeFormSignature,
    resolveSubmissionIdentity,
    markSubmissionResolved,
    isDefinitiveOutcome,
    buildIntentPayload,
    mapOutcomeToDisplay,
    mapHealthToDisplay,
    mapRecoveryToDisplay,
    recommendNextMove,
    callApi,
    describeError,
  };
}

/**
 * The entire client-side script, as a real, directly-callable, directly-testable function --
 * `.toString()`-embedded verbatim into the page's <script> tag (called there, immediately after
 * `createSubmissionKernel`'s own `.toString()`, with the four real globals) and imported/called
 * directly in a test with fake globals. One source of truth for both; no `new Function`/`eval`
 * needed on either side. The optional 5th parameter is a test-only hook: production always calls
 * this with 4 arguments, so `testHooks` is always `undefined` on the page itself and every
 * `if (testHooks)` branch is dead code in production.
 */
export function operatorPanelClientScript(
  document: OperatorPanelDocument,
  sessionStorage: OperatorPanelStorage,
  fetch: OperatorPanelFetch,
  crypto: OperatorPanelCrypto,
  testHooks?: OperatorPanelTestHooks,
): void {
  // Local, not module-level: see the note on createSubmissionKernel -- `.toString()`-embedding
  // only captures this function's own source text, so any identifier it needs must be declared
  // inside it.
  const ADMIN_KEY_STORAGE_KEY = "howler_admin_key";
  const EM_DASH = String.fromCharCode(8212);
  const EVIDENCE_KINDS = new Set(["EVIDENCE_PREVIEW", "EVIDENCE_APPLY_SHADOW"]);

  const {
    computeFormSignature,
    resolveSubmissionIdentity,
    markSubmissionResolved,
    isDefinitiveOutcome,
    buildIntentPayload,
    mapOutcomeToDisplay,
    callApi,
    describeError,
  } = createSubmissionKernel();

  if (testHooks) {
    testHooks.computeFormSignature = computeFormSignature;
    testHooks.resolveSubmissionIdentity = resolveSubmissionIdentity;
    testHooks.markSubmissionResolved = markSubmissionResolved;
    testHooks.isDefinitiveOutcome = isDefinitiveOutcome;
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

  function handleOutcome(
    promise: Promise<{ ok: boolean; status: number; body: unknown }>,
  ): Promise<void> {
    return promise
      .then((result) => {
        // The fetch settled (as opposed to rejecting), but that alone does not prove the logical
        // intent's fate is known -- an arbitrary 5xx or an unparseable body must leave the
        // identity PENDING (see isDefinitiveOutcome). A network exception never reaches this
        // branch either way (the `.catch` below).
        if (isDefinitiveOutcome(result)) {
          markSubmissionResolved(sessionStorage);
        }
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
      callApi(fetch, sessionStorage, els.adminKey.value.trim(), "/v1/intents", {
        method: "POST",
        body: JSON.stringify(intent),
      }),
    );
  });

  els.resumeButton.addEventListener("click", () => {
    if (requestInFlight || !currentWorkflowId) return;
    setBusy(true);
    void handleOutcome(
      callApi(
        fetch,
        sessionStorage,
        els.adminKey.value.trim(),
        `/v1/workflows/${encodeURIComponent(currentWorkflowId)}/resume`,
        { method: "POST" },
      ),
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
${createSubmissionKernel.toString()}
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

// Task 16B: field PM dashboard pilot. GET /admin/field is additive; it does not replace or alter
// GET /, GET /admin, or GET /admin/operator. It reuses createSubmissionKernel (identity lifecycle
// and Task 15 response classification) and the same PM-intelligence field-mapping functions --
// no second identity implementation, no new forecasting/predictive logic. Project tracking is a
// client-side, session-scoped list (no new server-side "list projects" capability); each tracked
// project renders as its own section, never compounded with another.

/** The minimal element surface fieldDashboardClientScript uses. Adds `innerHTML` on top of
 * OperatorPanelElement's surface because, unlike Task 16A's static form, the number of projects
 * is only known at runtime -- each project's card is rendered by setting one container's
 * `innerHTML` to a generated HTML string, then looking its per-project controls back up by id
 * (exactly what a real browser's `innerHTML` setter enables). No `createElement`/`appendChild`
 * tree-building is needed. */
export interface FieldDashboardElement extends OperatorPanelElement {
  innerHTML: string;
}

export interface FieldDashboardDocument {
  getElementById(id: string): FieldDashboardElement;
}

export interface FieldDashboardTestHooks {
  escapeHtml?: (value: string) => string;
  loadTrackedProjects?: (storage: OperatorPanelStorage) => string[];
  projectCardHtml?: (projectId: string, index: number) => string;
}

/**
 * The entire field-dashboard client script, following the exact same pattern as
 * `operatorPanelClientScript`: a real, directly-callable, directly-testable function,
 * `.toString()`-embedded verbatim into the page's `<script>` tag (immediately after
 * `createSubmissionKernel`'s own `.toString()`) and imported/called directly in tests. All
 * constants and helpers this function needs are declared *inside* it for the same closure-safety
 * reason documented on `createSubmissionKernel`.
 */
export function fieldDashboardClientScript(
  document: FieldDashboardDocument,
  sessionStorage: OperatorPanelStorage,
  fetch: OperatorPanelFetch,
  crypto: OperatorPanelCrypto,
  testHooks?: FieldDashboardTestHooks,
): void {
  const ADMIN_KEY_STORAGE_KEY = "howler_admin_key";
  const EM_DASH = String.fromCharCode(8212);
  const TRACKED_PROJECTS_KEY = "howler_field_tracked_projects";
  const DEFAULT_TRACKED_PROJECTS = ["deboard-v091"];
  const QUERY_KINDS = [
    "FORECAST_QUERY",
    "FORECAST_HEALTH_QUERY",
    "RECOVERY_QUERY",
  ];

  const {
    computeFormSignature,
    resolveSubmissionIdentity,
    markSubmissionResolved,
    isDefinitiveOutcome,
    buildIntentPayload,
    mapOutcomeToDisplay,
    mapHealthToDisplay,
    mapRecoveryToDisplay,
    recommendNextMove,
    callApi,
    describeError,
  } = createSubmissionKernel();

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (ch) => {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === '"') return "&quot;";
      return "&#39;";
    });
  }

  function loadTrackedProjects(storage: OperatorPanelStorage): string[] {
    const raw = storage.getItem(TRACKED_PROJECTS_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((p) => typeof p === "string")
        ) {
          return parsed;
        }
      } catch {
        // fall through to default
      }
    }
    return DEFAULT_TRACKED_PROJECTS.slice();
  }

  function saveTrackedProjects(
    storage: OperatorPanelStorage,
    list: string[],
  ): void {
    storage.setItem(TRACKED_PROJECTS_KEY, JSON.stringify(list));
  }

  function projectCardHtml(projectId: string, index: number): string {
    const safeId = escapeHtml(projectId);
    return `<section class="card project-card" aria-label="Project ${safeId}">
      <div class="project-head">
        <h2 id="fp-${String(index)}-title">${safeId}</h2>
        <button type="button" id="fp-${String(index)}-remove">Remove</button>
      </div>
      <div class="project-grid">
        <div><h3>Current status</h3><p id="fp-${String(index)}-status">${EM_DASH}</p></div>
        <div><h3>Priority actions</h3><p id="fp-${String(index)}-priority-actions">${EM_DASH}</p></div>
        <div><h3>Top risks / blockers</h3><p id="fp-${String(index)}-risks">${EM_DASH}</p></div>
        <div><h3>Upcoming forecast</h3><p id="fp-${String(index)}-forecast">${EM_DASH}</p></div>
      </div>
      <p><strong>Recommended next move:</strong> <span id="fp-${String(index)}-recommendation">Run Refresh to load project intelligence.</span></p>
      <section class="active-workflows">
        <h3>Active workflows / Needs attention</h3>
        <div id="fp-${String(index)}-active-workflows"><p class="none">No active or blocked workflows.</p></div>
      </section>
      <button type="button" id="fp-${String(index)}-refresh">Refresh</button>
      <section class="evidence-block">
        <label for="fp-${String(index)}-evidence-kind">Evidence action</label>
        <select id="fp-${String(index)}-evidence-kind">
          <option value="EVIDENCE_PREVIEW">Evidence preview</option>
          <option value="EVIDENCE_APPLY_SHADOW">Apply shadow evidence (mutates staging only)</option>
        </select>
        <label for="fp-${String(index)}-evidence-revision">Expected project revision</label>
        <input id="fp-${String(index)}-evidence-revision" type="number" min="0" step="1" inputmode="numeric">
        <label for="fp-${String(index)}-evidence-json">Evidence event (JSON)</label>
        <textarea id="fp-${String(index)}-evidence-json" rows="6" spellcheck="false"></textarea>
        <button type="button" id="fp-${String(index)}-evidence-run">Run evidence action</button>
      </section>
      <details>
        <summary>Raw response</summary>
        <pre id="fp-${String(index)}-raw"></pre>
      </details>
      <div id="fp-${String(index)}-card-status" aria-live="polite">Ready.</div>
    </section>`;
  }

  if (testHooks) {
    testHooks.escapeHtml = escapeHtml;
    testHooks.loadTrackedProjects = loadTrackedProjects;
    testHooks.projectCardHtml = projectCardHtml;
  }

  const els = {
    adminKey: document.getElementById("admin-key"),
    newProjectId: document.getElementById("new-project-id"),
    addProjectButton: document.getElementById("add-project"),
    refreshAllButton: document.getElementById("refresh-all"),
    projectsContainer: document.getElementById("projects-container"),
  };

  const savedKey = sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY);
  if (savedKey) els.adminKey.value = savedKey;

  function adminKeyValue(): string {
    return els.adminKey.value.trim();
  }

  let trackedProjects = loadTrackedProjects(sessionStorage);

  // All state below is keyed by *stable* identity -- a projectId, or `${projectId}:${kind}` for
  // per-action state -- never by render index. A project's index shifts the moment an earlier
  // project is removed, so an index-keyed slot would let a response meant for one project's
  // request land in whatever project now occupies its old position. DOM element ids (`fp-N-*`)
  // remain index-based purely for addressing the current render; they never carry logical
  // ownership of state.
  const ACTION_KINDS = [
    "FORECAST_QUERY",
    "FORECAST_HEALTH_QUERY",
    "RECOVERY_QUERY",
    "EVIDENCE_PREVIEW",
    "EVIDENCE_APPLY_SHADOW",
  ];
  const ACTION_LABELS: Record<string, string> = {
    FORECAST_QUERY: "Forecast",
    FORECAST_HEALTH_QUERY: "Forecast health",
    RECOVERY_QUERY: "Recovery",
    EVIDENCE_PREVIEW: "Evidence preview",
    EVIDENCE_APPLY_SHADOW: "Apply shadow evidence",
  };
  interface ActionState {
    workflowId: string | null;
    workflowState: string;
    problemText: string;
    storageKey: string;
  }
  const healthByProject = new Map<string, Record<string, unknown> | null>();
  const recoveryByProject = new Map<string, Record<string, unknown> | null>();
  const actionStateByKey = new Map<string, ActionState>();
  const inFlight = new Set<string>();

  function indexOfProject(projectId: string): number {
    return trackedProjects.indexOf(projectId);
  }

  function isProjectQueryBusy(projectId: string): boolean {
    return QUERY_KINDS.some((kind) => inFlight.has(`${projectId}:${kind}`));
  }

  /**
   * EVIDENCE_PREVIEW and EVIDENCE_APPLY_SHADOW are separate logical action slots (own
   * `${projectId}:${kind}` ownership), so one being busy must not disable the other. The single
   * evidence-run control is shared between them, so its busy state reflects only whichever kind
   * is *currently selected* in the dropdown -- not "either evidence kind".
   */
  function isProjectEvidenceBusy(projectId: string, index: number): boolean {
    const kindEl = document.getElementById(`fp-${String(index)}-evidence-kind`);
    return inFlight.has(`${projectId}:${kindEl.value}`);
  }

  function isActionPending(storageKey: string): boolean {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return false;
    try {
      const stored = JSON.parse(raw) as { state?: string };
      return stored.state === "PENDING";
    } catch {
      return false;
    }
  }

  /**
   * A project is safe to fully forget once none of its per-kind action state is still active:
   * no in-flight request (including an in-flight Resume, which shares its kind's key), no
   * uncertain (PENDING) delivery still awaiting a definitive outcome, and no INTERRUPTED workflow
   * still waiting on an explicit Resume. Anything else (SUCCEEDED/BLOCKED/FAILED/never-run, with
   * a RESOLVED-or-absent identity record) is a resolved, inactive result that removal may forget.
   */
  function isProjectSafeToPurge(projectId: string): boolean {
    for (const kind of ACTION_KINDS) {
      const key = `${projectId}:${kind}`;
      if (inFlight.has(key)) return false;
      if (isActionPending(`howler_field_pending_${projectId}_${kind}`)) {
        return false;
      }
      const state = actionStateByKey.get(key);
      if (state?.workflowState === "INTERRUPTED") return false;
    }
    return true;
  }

  /**
   * The single place that actually forgets a project's state, used by every caller that might
   * newly make a project purge-safe: `removeProject` itself (the project might already have no
   * active work), and every action/Resume's own settlement (an action that was the *last* reason
   * an already-untracked project was being preserved just resolved). A no-op if the project is
   * still tracked (removal is the only thing that starts this lifecycle) or still unsafe to
   * purge. Centralizing this avoids re-implementing the same purge rules at each of those call
   * sites.
   */
  function maybePurgeUntrackedProject(projectId: string): void {
    if (indexOfProject(projectId) !== -1) return;
    if (!isProjectSafeToPurge(projectId)) return;
    healthByProject.delete(projectId);
    recoveryByProject.delete(projectId);
    for (const kind of ACTION_KINDS) {
      actionStateByKey.delete(`${projectId}:${kind}`);
      sessionStorage.removeItem?.(`howler_field_pending_${projectId}_${kind}`);
    }
  }

  function setCardStatus(projectId: string, text: string): void {
    const index = indexOfProject(projectId);
    if (index === -1) return;
    document.getElementById(`fp-${String(index)}-card-status`).textContent =
      text;
  }

  /** Recomputes a project's busy indicators from the current `inFlight` set -- never a single
   * boolean captured at one action's start, since several independent actions can be in flight
   * for the same project at once. A no-op if the project is no longer tracked. */
  function refreshBusyIndicators(projectId: string): void {
    const index = indexOfProject(projectId);
    if (index === -1) return;
    const queryBusy = isProjectQueryBusy(projectId);
    const evidenceBusy = isProjectEvidenceBusy(projectId, index);
    document.getElementById(`fp-${String(index)}-refresh`).disabled = queryBusy;
    document.getElementById(`fp-${String(index)}-evidence-run`).disabled =
      evidenceBusy;
    setCardStatus(
      projectId,
      queryBusy || evidenceBusy
        ? `Working${String.fromCharCode(8230)}`
        : "Ready.",
    );
    // Resume shares its in-flight key with a fresh submission for the same project+kind (see
    // resumeAction) -- re-render the active-workflows list so its Resume buttons visually reflect
    // that shared busy state too, not just the Refresh/Run-evidence-action controls above.
    renderActiveWorkflows(projectId);
  }

  function updateProjectSummary(projectId: string): void {
    const index = indexOfProject(projectId);
    if (index === -1) return;
    const health = healthByProject.get(projectId) ?? null;
    const recovery = recoveryByProject.get(projectId) ?? null;
    const healthAvailable = health ? health.available === true : false;
    const recoveryAvailable = recovery ? recovery.available === true : false;

    const confidence = health?.meanForecastConfidence;
    const statusEl = document.getElementById(`fp-${String(index)}-status`);
    statusEl.textContent = healthAvailable
      ? `Completion (likely): ${String(health?.completionLikely)} ${EM_DASH} Confidence: ${
          typeof confidence === "number" ? String(confidence) : EM_DASH
        }`
      : EM_DASH;

    const actions = healthAvailable
      ? ((health?.priorityActions as string[] | undefined) ?? [])
      : [];
    document.getElementById(
      `fp-${String(index)}-priority-actions`,
    ).textContent = actions.length ? actions.join("; ") : "None.";

    const risks = healthAvailable
      ? ((health?.topRisks as string[] | undefined) ?? [])
      : [];
    const recoveryRisks =
      recoveryAvailable && (recovery?.criticalExposureCount as number) > 0
        ? [
            `Critical recovery exposure: ${String(recovery?.criticalExposureCount)} (next risk ${String(recovery?.nextRiskDate)})`,
          ]
        : [];
    const allRisks = risks.concat(recoveryRisks);
    document.getElementById(`fp-${String(index)}-risks`).textContent =
      allRisks.length ? allRisks.join("; ") : "None.";

    document.getElementById(`fp-${String(index)}-forecast`).textContent =
      recoveryAvailable
        ? `Next risk date: ${String(recovery?.nextRiskDate)} ${EM_DASH} Standby capacity: ${String(recovery?.standbyRecoveryCapacityWorkdays)} workdays`
        : EM_DASH;

    document.getElementById(`fp-${String(index)}-recommendation`).textContent =
      recommendNextMove(
        healthAvailable ? health : null,
        recoveryAvailable ? recovery : null,
      );
  }

  function isNoteworthy(state: ActionState | undefined): boolean {
    if (!state) return false;
    return (
      state.workflowState === "INTERRUPTED" ||
      state.workflowState === "BLOCKED" ||
      state.workflowState === "FAILED" ||
      state.problemText !== ""
    );
  }

  /** Renders the compact "Active workflows / Needs attention" list for one project -- one row
   * per action kind that is currently INTERRUPTED/BLOCKED/FAILED/has a problem, each with its own
   * Resume where applicable. A successful background read never removes another action kind's
   * row: each kind owns its own slot in `actionStateByKey`, so one kind's SUCCEEDED response
   * cannot overwrite another kind's still-unresolved INTERRUPTED workflow. */
  function renderActiveWorkflows(projectId: string): void {
    const index = indexOfProject(projectId);
    if (index === -1) return;
    const rows = ACTION_KINDS.map((kind) => ({
      kind,
      state: actionStateByKey.get(`${projectId}:${kind}`),
    })).filter((entry) => isNoteworthy(entry.state));

    const container = document.getElementById(
      `fp-${String(index)}-active-workflows`,
    );
    if (rows.length === 0) {
      container.innerHTML = `<p class="none">No active or blocked workflows.</p>`;
      return;
    }
    container.innerHTML = rows
      .map(({ kind, state }) => {
        const label = ACTION_LABELS[kind] ?? kind;
        const showResume = state?.workflowState === "INTERRUPTED";
        // Resume shares its in-flight ownership lock with a fresh submission for the same
        // project+kind -- reflect that shared busy state on the button itself.
        const busy = inFlight.has(`${projectId}:${kind}`);
        const problemSuffix = state?.problemText
          ? ` ${EM_DASH} ${escapeHtml(state.problemText)}`
          : "";
        return `<div class="workflow-row">
          <span>${escapeHtml(label)}: ${escapeHtml(state?.workflowState ?? EM_DASH)}${problemSuffix}</span>
          ${showResume ? `<button type="button" id="fp-${String(index)}-resume-${kind}"${busy ? " disabled" : ""}>Resume</button>` : ""}
        </div>`;
      })
      .join("");
    for (const { kind, state } of rows) {
      if (state?.workflowState === "INTERRUPTED") {
        document
          .getElementById(`fp-${String(index)}-resume-${kind}`)
          .addEventListener("click", () => {
            resumeAction(projectId, kind);
          });
      }
    }
  }

  /**
   * Applies one action kind's response for one project. Always keyed by the stable `projectId` +
   * `kind` that *initiated* the request, never by the render index the project happened to be at
   * when the request started -- a response only ever mutates the state slot it logically owns.
   * If the project is no longer tracked (removed while this request was in flight), the identity
   * lifecycle and in-memory intelligence maps are still updated (so a later re-add can pick up
   * where an unresolved action left off), but no DOM is touched.
   */
  function handleActionResult(
    projectId: string,
    kind: string,
    storageKey: string,
    result: { ok: boolean; status: number; body: unknown },
  ): void {
    if (isDefinitiveOutcome(result)) {
      markSubmissionResolved(sessionStorage, storageKey);
    }
    const display = mapOutcomeToDisplay(result.body);
    const actionKey = `${projectId}:${kind}`;
    const previous = actionStateByKey.get(actionKey);
    const workflowId =
      typeof display.workflowId === "string" && display.workflowId !== EM_DASH
        ? display.workflowId
        : (previous?.workflowId ?? null);
    const problemText =
      display.problem !== EM_DASH
        ? String(display.problem)
        : display.revisionConflict !== EM_DASH
          ? String(display.revisionConflict)
          : "";
    actionStateByKey.set(actionKey, {
      workflowId,
      workflowState: String(display.workflowState),
      problemText,
      storageKey,
    });

    if (kind === "FORECAST_HEALTH_QUERY") {
      healthByProject.set(projectId, mapHealthToDisplay(result.body));
    }
    if (kind === "RECOVERY_QUERY") {
      recoveryByProject.set(projectId, mapRecoveryToDisplay(result.body));
    }

    const index = indexOfProject(projectId);
    if (index === -1) return;

    document.getElementById(`fp-${String(index)}-raw`).textContent =
      JSON.stringify(result.body, null, 2);
    updateProjectSummary(projectId);
    renderActiveWorkflows(projectId);

    const body = result.body as
      { run?: unknown; result?: unknown; error?: string } | undefined;
    if (body && (body.run ?? body.result)) {
      setCardStatus(projectId, "Ready.");
    } else {
      setCardStatus(
        projectId,
        `Error: ${body?.error ?? `HTTP ${String(result.status)}`}`,
      );
    }
  }

  function runQuery(projectId: string, kind: string): void {
    const key = `${projectId}:${kind}`;
    if (inFlight.has(key)) return;
    const fields: FormFields = {
      kind,
      projectId,
      expectedRevision: null,
      evidenceEvent: null,
    };
    const storageKey = `howler_field_pending_${projectId}_${kind}`;
    const identity = resolveSubmissionIdentity(
      computeFormSignature(fields),
      sessionStorage,
      () => new Date().toISOString(),
      () => crypto.randomUUID(),
      storageKey,
    );
    const intent = buildIntentPayload(fields, identity);
    inFlight.add(key);
    refreshBusyIndicators(projectId);
    void callApi(fetch, sessionStorage, adminKeyValue(), "/v1/intents", {
      method: "POST",
      body: JSON.stringify(intent),
    })
      .then((result) => {
        handleActionResult(projectId, kind, storageKey, result);
      })
      .catch((error: unknown) => {
        setCardStatus(projectId, `Error: ${describeError(error)}`);
      })
      .then(() => {
        inFlight.delete(key);
        refreshBusyIndicators(projectId);
        maybePurgeUntrackedProject(projectId);
      });
  }

  function runProjectQueries(projectId: string): void {
    for (const kind of QUERY_KINDS) runQuery(projectId, kind);
  }

  function runEvidenceAction(projectId: string, index: number): void {
    const kindEl = document.getElementById(`fp-${String(index)}-evidence-kind`);
    const revisionEl = document.getElementById(
      `fp-${String(index)}-evidence-revision`,
    );
    const jsonEl = document.getElementById(`fp-${String(index)}-evidence-json`);
    const kind = kindEl.value;
    const key = `${projectId}:${kind}`;
    if (inFlight.has(key)) return;
    let evidenceEvent: unknown = null;
    try {
      evidenceEvent = JSON.parse(jsonEl.value || "null");
    } catch {
      evidenceEvent = null;
    }
    const fields: FormFields = {
      kind,
      projectId,
      expectedRevision: Number(revisionEl.value),
      evidenceEvent,
    };
    const storageKey = `howler_field_pending_${projectId}_${kind}`;
    const identity = resolveSubmissionIdentity(
      computeFormSignature(fields),
      sessionStorage,
      () => new Date().toISOString(),
      () => crypto.randomUUID(),
      storageKey,
    );
    const intent = buildIntentPayload(fields, identity);
    inFlight.add(key);
    refreshBusyIndicators(projectId);
    void callApi(fetch, sessionStorage, adminKeyValue(), "/v1/intents", {
      method: "POST",
      body: JSON.stringify(intent),
    })
      .then((result) => {
        handleActionResult(projectId, kind, storageKey, result);
      })
      .catch((error: unknown) => {
        setCardStatus(projectId, `Error: ${describeError(error)}`);
      })
      .then(() => {
        inFlight.delete(key);
        refreshBusyIndicators(projectId);
        maybePurgeUntrackedProject(projectId);
      });
  }

  /**
   * Resume shares the exact same `${projectId}:${kind}` in-flight ownership lock as a fresh
   * submission for that project/kind (runQuery/runEvidenceAction) -- not a separate `:RESUME`
   * key. A mutation workflow (e.g. EVIDENCE_APPLY_SHADOW) has exactly one logical action in
   * flight for a given project+kind at a time, whether that's a first submission or its Resume;
   * two different keys would let a fresh submission race a Resume that is still operating on the
   * interrupted workflow. Sharing the key means runEvidenceAction/runQuery's own
   * `if (inFlight.has(key)) return;` guard, and their busy-indicator disabling, apply to Resume
   * for free -- and Resume's own guard below refuses to start if a fresh submission somehow got
   * there first.
   */
  function resumeAction(projectId: string, kind: string): void {
    const actionKey = `${projectId}:${kind}`;
    const state = actionStateByKey.get(actionKey);
    if (!state?.workflowId || inFlight.has(actionKey)) return;
    inFlight.add(actionKey);
    refreshBusyIndicators(projectId);
    void callApi(
      fetch,
      sessionStorage,
      adminKeyValue(),
      `/v1/workflows/${encodeURIComponent(state.workflowId)}/resume`,
      { method: "POST" },
    )
      .then((result) => {
        handleActionResult(projectId, kind, state.storageKey, result);
      })
      .catch((error: unknown) => {
        setCardStatus(projectId, `Error: ${describeError(error)}`);
      })
      .then(() => {
        inFlight.delete(actionKey);
        refreshBusyIndicators(projectId);
        maybePurgeUntrackedProject(projectId);
      });
  }

  /**
   * Removing a project always takes it out of the tracked list and off the page. Whether its
   * backing state is also forgotten depends on whether any of that state is still active or
   * uncertain (see `isProjectSafeToPurge`): a still-in-flight request, an unresolved (PENDING)
   * delivery, or an unresumed INTERRUPTED workflow must survive removal so a later re-add under
   * the same projectId can still resolve/reuse/resume it correctly. Once every kind's state is a
   * resolved, inactive result, removal releases it -- otherwise a long field session that
   * repeatedly adds and removes projects would grow these maps and sessionStorage without bound.
   */
  function removeProject(projectId: string): void {
    const index = indexOfProject(projectId);
    if (index === -1) return;
    trackedProjects.splice(index, 1);
    saveTrackedProjects(sessionStorage, trackedProjects);
    maybePurgeUntrackedProject(projectId);
    renderProjects();
  }

  function wireProjectCard(projectId: string, index: number): void {
    document
      .getElementById(`fp-${String(index)}-refresh`)
      .addEventListener("click", () => {
        runProjectQueries(projectId);
      });
    document
      .getElementById(`fp-${String(index)}-remove`)
      .addEventListener("click", () => {
        removeProject(projectId);
      });
    document
      .getElementById(`fp-${String(index)}-evidence-run`)
      .addEventListener("click", () => {
        runEvidenceAction(projectId, index);
      });
    document
      .getElementById(`fp-${String(index)}-evidence-kind`)
      .addEventListener("change", () => {
        refreshBusyIndicators(projectId);
      });
  }

  function renderProjects(): void {
    els.projectsContainer.innerHTML = trackedProjects
      .map((id, i) => projectCardHtml(id, i))
      .join("");
    trackedProjects.forEach((id) => {
      const index = indexOfProject(id);
      wireProjectCard(id, index);
      updateProjectSummary(id);
      renderActiveWorkflows(id);
    });
  }

  els.addProjectButton.addEventListener("click", () => {
    const id = els.newProjectId.value.trim();
    if (!id || trackedProjects.includes(id)) return;
    trackedProjects = trackedProjects.concat([id]);
    saveTrackedProjects(sessionStorage, trackedProjects);
    els.newProjectId.value = "";
    renderProjects();
  });

  els.refreshAllButton.addEventListener("click", () => {
    trackedProjects.forEach((id) => {
      runProjectQueries(id);
    });
  });

  renderProjects();
}

export function fieldDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Field Dashboard</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); background: #111318; color: #f4f6f8; font-size: 15px; }
    main { max-width: 920px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 0; }
    h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #8891a0; margin: 0 0 4px; }
    .sub { color: #b8c0cc; margin: 0 0 14px; line-height: 1.4; font-size: 13px; }
    #env-banner { border: 1px solid #1f7a3d; background: #0d2416; color: #7be3a3; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px; font-weight: 700; letter-spacing: 0.02em; text-align: center; }
    .card { background: #1b1f27; border: 1px solid #303744; border-radius: 12px; padding: 14px; margin: 10px 0; }
    .project-card { padding: 16px; }
    .project-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .project-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 10px; }
    .project-grid p { margin: 0; font-size: 13px; word-break: break-word; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px; }
    input, select, textarea { box-sizing: border-box; width: 100%; font-size: 15px; padding: 10px; border-radius: 8px; border: 1px solid #4b5565; background: #0f1217; color: #fff; font-family: inherit; margin-bottom: 8px; }
    textarea { font-family: ui-monospace, monospace; font-size: 13px; }
    button { min-height: 40px; border: 0; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-weight: 700; background: #315efb; color: #fff; cursor: pointer; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .evidence-block { border-top: 1px solid #303744; margin-top: 10px; padding-top: 10px; }
    details { margin-top: 10px; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; max-height: 220px; overflow: auto; }
    [id$="-card-status"] { font-size: 12px; color: #b8c0cc; margin-top: 8px; }
  </style>
</head>
<body>
<main>
  <div id="env-banner" role="status">STAGING &middot; SHADOW &middot; NO LIVE SYSTEMS</div>
  <h1>Howler Field Dashboard (Pilot)</h1>
  <p class="sub">Read-only forecast/health/recovery intelligence and explicit staging-only evidence actions, one project at a time. This page submits requests only; all forecasting, revision, retry, and mutation logic runs server-side.</p>

  <section class="card" aria-labelledby="voice-heading">
    <h2 id="voice-heading">Voice transport</h2>
    <button id="voice-push-to-talk" type="button" aria-label="Push to talk">Push to talk</button>
    <div id="voice-status" role="status" aria-live="polite">IDLE</div>
  </section>

  <section class="card">
    <label for="admin-key">HOWLER_ADMIN_KEY</label>
    <input id="admin-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste the staging admin key">
  </section>

  <section class="card">
    <label for="new-project-id">Add project</label>
    <input id="new-project-id" type="text" autocapitalize="none" spellcheck="false" placeholder="Project ID">
    <button id="add-project" type="button">Add project</button>
    <button id="refresh-all" type="button">Refresh all</button>
  </section>

  <div id="projects-container"></div>
</main>
<script>
${createSubmissionKernel.toString()}
${speakVoicePresentation.toString()}
(${fieldDashboardClientScript.toString()})(document, sessionStorage, fetch, crypto);
(${voiceBrowserClient.toString()})(document, sessionStorage, createSubmissionKernel(), fetch, crypto.randomUUID);
</script>
</body>
</html>`;
}

export function fieldDashboardPage(): Response {
  return new Response(fieldDashboardHtml(), {
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
