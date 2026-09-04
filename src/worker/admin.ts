import type {
  ConversationalTurnResultSummary,
  FieldVoiceBridge,
  PendingVoiceConfirmation,
} from "./voice-transport";
import {
  classifyConfirmationResponse,
  classifyWorkflowStateForVoice,
  commandKind,
  createCaptureController,
  createPendingVoiceConfirmation,
  createVoicePresentation,
  describeConversationalTurn,
  fingerprint,
  normalizeProjectId,
  projectAliasesFromIds,
  projectMention,
  resolveVoiceCommand,
  respondToVoiceConfirmation,
  speakVoicePresentation,
  stableSerialize,
  voiceBrowserClient,
} from "./voice-transport";

/**
 * Task 19 "Howler Penthouse" shared design tokens and base component styles. Presentation only --
 * no execution/business logic lives here or anywhere in this file's markup changes. Interpolated
 * into each page's own <style> block so /admin, /admin/operator, and /admin/field share one
 * coherent visual language: obsidian/charcoal surfaces, warm ivory text, brushed-metal neutrals,
 * and a single restrained amber/gold accent reserved for consequential (mutating) actions --
 * routine and read-only actions stay neutral. System fonts and CSS only: no external fonts, icon
 * CDNs, animation libraries, or network requests exist solely for appearance.
 */
const PENTHOUSE_TOKENS = `
    :root {
      color-scheme: dark;
      --hw-bg: #0a0b0d;
      --hw-surface: #16181d;
      --hw-surface-raised: #1c1f26;
      --hw-border: rgba(214, 219, 230, 0.09);
      --hw-border-strong: rgba(214, 219, 230, 0.18);
      --hw-ink: #f2ede2;
      --hw-ink-muted: #a3a6ad;
      --hw-ink-faint: #6d7078;
      --hw-accent: #c6a15b;
      --hw-accent-strong: #d8b876;
      --hw-accent-ink: #1a1300;
      --hw-ok: #7fa889;
      --hw-ok-bg: #10201a;
      --hw-warn: #c6a15b;
      --hw-warn-bg: #241d0e;
      --hw-danger: #b3604a;
      --hw-danger-bg: #241511;
      --hw-focus: #d8b876;
      --hw-radius-sm: 6px;
      --hw-radius: 10px;
      --hw-radius-lg: 16px;
      --hw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --hw-font-serif: ui-serif, Georgia, "Times New Roman", serif;
      --hw-font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: max(18px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom));
      background:
        radial-gradient(1100px 460px at 50% -14%, rgba(198, 161, 91, 0.05), transparent 60%),
        var(--hw-bg);
      color: var(--hw-ink);
      font-family: var(--hw-font);
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3 { font-weight: 600; letter-spacing: -0.01em; }
    h1 { font-size: 19px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 0; }
    h3 {
      font-size: 11px; margin: 0 0 4px; color: var(--hw-ink-faint);
      text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
    }
    .hw-sub { color: var(--hw-ink-muted); margin: 0 0 16px; line-height: 1.5; font-size: 13px; }
    .hw-banner, #env-banner {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      border: 1px solid var(--hw-border-strong);
      background: var(--hw-surface);
      color: var(--hw-ink-muted);
      padding: 9px 12px; border-radius: var(--hw-radius);
      margin-bottom: 16px; font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase; text-align: center;
    }
    .hw-banner::before, #env-banner::before {
      content: ""; width: 6px; height: 6px; border-radius: 50%;
      background: var(--hw-ok); flex-shrink: 0;
      box-shadow: 0 0 0 3px var(--hw-ok-bg);
    }
    .card {
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-lg);
      padding: 16px;
      margin: 12px 0;
    }
    label {
      display: block; font-weight: 600; margin-bottom: 7px; font-size: 12px;
      color: var(--hw-ink-muted); letter-spacing: 0.02em;
    }
    input, select, textarea {
      box-sizing: border-box; width: 100%; font-size: 15px; padding: 11px 12px;
      border-radius: var(--hw-radius-sm); border: 1px solid var(--hw-border-strong);
      background: var(--hw-bg); color: var(--hw-ink); font-family: inherit;
    }
    input::placeholder, textarea::placeholder { color: var(--hw-ink-faint); }
    textarea { font-family: var(--hw-font-mono); font-size: 13px; }
    input:focus-visible, select:focus-visible, textarea:focus-visible,
    button:focus-visible, a:focus-visible {
      outline: 2px solid var(--hw-focus); outline-offset: 2px;
    }
    button {
      min-height: 44px; border: 1px solid var(--hw-border-strong); border-radius: var(--hw-radius-sm);
      padding: 10px 14px; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
      background: var(--hw-surface-raised); color: var(--hw-ink); cursor: pointer;
    }
    button:hover:not(:disabled) { border-color: var(--hw-border-strong); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button.secondary { background: transparent; border-color: var(--hw-border); color: var(--hw-ink-muted); }
    button.danger,
    button.btn-consequential {
      background: var(--hw-accent); border-color: var(--hw-accent-strong); color: var(--hw-accent-ink);
      font-weight: 700;
    }
    button.danger:hover:not(:disabled),
    button.btn-consequential:hover:not(:disabled) { background: var(--hw-accent-strong); }
    pre {
      white-space: pre-wrap; overflow-wrap: anywhere;
      background: var(--hw-bg); border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius); padding: 14px;
      font-family: var(--hw-font-mono); font-size: 12px; line-height: 1.5; color: var(--hw-ink);
    }
    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
    }
`;

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
  /** Optional: only used for a purely cosmetic class toggle (see updateConditionalFields), never
   * for behavior. Optional so existing minimal test fakes that omit it remain valid. */
  classList?: { toggle(name: string, force?: boolean): void };
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
  mapForecastToDisplay: (body: unknown) => Record<string, unknown>;
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
      problemCode: (problem && asString(problem.code)) ?? null,
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
   * Maps an IntentSubmissionResponseV1 body carrying a FORECAST result output to a Facts /
   * Commitments / Unknowns breakdown, purely by grouping the forecast engine's own already-
   * computed per-activity `truthState` (src/engine/solver.ts) -- no new analysis, no invented
   * schedule content. SATISFIED activities (an actual start/finish is already recorded) are
   * facts; COMMITTED activities (schedule-locked) are commitments; everything else is still only
   * FORECASTED, i.e. an unknown -- not yet either. `available: false` when this response is not a
   * forecast result (query hasn't run yet, or failed) or carries no snapshot to read.
   */
  function mapForecastToDisplay(body: unknown): Record<string, unknown> {
    const record = (body ?? {}) as Record<string, unknown>;
    const result = record.result as Record<string, unknown> | undefined;
    const output = result?.output as Record<string, unknown> | undefined;
    if (!output || output.type !== "FORECAST") {
      return { available: false };
    }
    const data = (output.data ?? {}) as Record<string, unknown>;
    const latest = data.latest as Record<string, unknown> | null | undefined;
    if (!latest) {
      return { available: false };
    }
    const activityForecasts = (latest.activityForecasts ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const facts: string[] = [];
    const commitments: string[] = [];
    const unknowns: string[] = [];
    for (const forecast of Object.values(activityForecasts)) {
      const name =
        asString(forecast.activityName) ??
        asString(forecast.activityId) ??
        "activity";
      if (forecast.truthState === "SATISFIED") facts.push(name);
      else if (forecast.truthState === "COMMITTED") commitments.push(name);
      else unknowns.push(name);
    }
    return {
      available: true,
      factsCount: facts.length,
      factsSample: facts.slice(0, 3),
      commitmentsCount: commitments.length,
      commitmentsSample: commitments.slice(0, 3),
      unknownsCount: unknowns.length,
      unknownsSample: unknowns.slice(0, 3),
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
    // Phase 2 (product integration): the admin key is never persisted to sessionStorage/
    // localStorage any more -- this parameter is kept only so callApi's signature (and every one
    // of its many existing call sites across both the operator panel and Penthouse) does not need
    // to change; it is genuinely unused now.
    _sessionStorage: OperatorPanelStorage,
    adminKey: string,
    path: string,
    options: { method: string; body?: string },
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
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
    mapForecastToDisplay,
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

  // Phase 2 (product integration): the admin key is never persisted to sessionStorage/
  // localStorage, and so is never preloaded on mount either -- the operator re-enters it fresh
  // each page load, kept in memory (the input field's own value) only for the life of the tab.

  let currentWorkflowId: string | null = null;
  let requestInFlight = false;

  function updateConditionalFields(): void {
    const isEvidence = EVIDENCE_KINDS.has(els.intentKind.value);
    els.revisionField.hidden = !isEvidence;
    els.evidenceField.hidden = !isEvidence;
    // Presentation only: visually distinguishes the one consequential (mutating) intent kind from
    // every routine/read-only one. Never affects which intent is actually submitted.
    els.runButton.classList?.toggle(
      "btn-consequential",
      els.intentKind.value === "EVIDENCE_APPLY_SHADOW",
    );
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
${PENTHOUSE_TOKENS}
    body { font-size: 15px; }
    main { max-width: 640px; margin: 0 auto; }
    dl { margin: 0; display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px 12px; font-size: 13px; }
    dt { color: var(--hw-ink-faint); }
    dd { margin: 0; word-break: break-word; color: var(--hw-ink); }
    #status { font-size: 12px; color: var(--hw-ink-muted); margin-top: 10px; }
    @media (max-width: 480px) { dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
  </style>
</head>
<body>
<main>
  <div id="env-banner" role="status">STAGING &middot; SHADOW &middot; NO LIVE SYSTEMS</div>
  <h1>Howler Operator Panel</h1>
  <p class="hw-sub">One canonical intent per action. This page submits requests only; all forecasting, revision, retry, and mutation logic runs server-side.</p>

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
      <div id="evidence-help" class="hw-sub">Paste the full ProjectEventInput JSON body.</div>
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
  /** Optional: real DOM elements have this natively. Used only to bring a selected portfolio
   * project's Index Card into view (openProjectWorkspace) -- purely cosmetic, never load-bearing,
   * so existing minimal test fakes that omit it remain valid. */
  scrollIntoView?: (options?: { behavior?: string; block?: string }) => void;
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
): FieldVoiceBridge {
  const EM_DASH = String.fromCharCode(8212);
  const TRACKED_PROJECTS_KEY = "howler_field_tracked_projects";
  // Pilot activation: the initial 7-project pilot roster ("KF Live PM Intelligence Dashboard --
  // New Model v2"). Must stay a literal array, not an imported constant -- this whole function is
  // `.toString()`-embedded into the browser <script> tag (see fieldDashboardHtml below), which
  // carries only this function's own source text, never a module-level import. scripts/
  // pilot-seed.ts (deliberately outside src/worker/ -- see
  // test/integration/project-import.test.ts's "no new *-seed.ts files exist on disk" guard) holds
  // the matching placeholder fixture data for these same 6 ids, seeded once through the existing
  // POST /v1/projects/:id/import route -- never re-declared here.
  const DEFAULT_TRACKED_PROJECTS = [
    "deboard-v091",
    "stewart-v1",
    "swiderski-v1",
    "pratt-v1",
    "carver-v1",
    "ciurlizza-v1",
    "mcmillan-v1",
  ];
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
    mapForecastToDisplay,
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
      <div id="fp-${String(index)}-unavailable" class="project-unavailable" hidden>Not activated in this environment ${EM_DASH} this project has not yet been created in staging D1.</div>
      <div class="project-grid">
        <div><h3>Current status</h3><p id="fp-${String(index)}-status">${EM_DASH}</p></div>
        <div><h3>Priority actions / next actions</h3><p id="fp-${String(index)}-priority-actions">${EM_DASH}</p></div>
        <div class="cell-risk"><h3>Top risks / blockers</h3><p id="fp-${String(index)}-risks">${EM_DASH}</p></div>
        <div><h3>Upcoming forecast / movement</h3><p id="fp-${String(index)}-forecast">${EM_DASH}</p></div>
        <div><h3>Facts (actual known state)</h3><p id="fp-${String(index)}-facts">${EM_DASH}</p></div>
        <div><h3>Commitments (expected work)</h3><p id="fp-${String(index)}-commitments">${EM_DASH}</p></div>
        <div><h3>Unknowns</h3><p id="fp-${String(index)}-unknowns">${EM_DASH}</p></div>
      </div>
      <p><strong>Recommended next move:</strong> <span id="fp-${String(index)}-recommendation">Run Refresh to load project intelligence.</span></p>
      <section class="active-workflows">
        <h3>Active workflows / Needs attention</h3>
        <div id="fp-${String(index)}-active-workflows"><p class="none">No active or blocked workflows.</p></div>
      </section>
      <button type="button" id="fp-${String(index)}-refresh">Refresh</button>
      <section class="conversation-block">
        <label for="fp-${String(index)}-conv-input">Tell Howler what happened</label>
        <input id="fp-${String(index)}-conv-input" type="text" placeholder="e.g. Foundation walls started today">
        <button type="button" id="fp-${String(index)}-conv-send">Send</button>
        <div id="fp-${String(index)}-conv-response" aria-live="polite"></div>
        <div id="fp-${String(index)}-conv-confirm" hidden>
          <p id="fp-${String(index)}-conv-confirm-text"></p>
          <button type="button" id="fp-${String(index)}-conv-confirm-yes">Confirm</button>
          <button type="button" id="fp-${String(index)}-conv-confirm-no">Reject</button>
        </div>
      </section>
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

  // Phase 2 (product integration): the admin key is never persisted to sessionStorage/
  // localStorage, and so is never preloaded on mount either -- the pilot user re-enters it fresh
  // each page load, kept in memory (the input field's own value) only for the life of the tab.

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
  const forecastByProject = new Map<string, Record<string, unknown> | null>();
  /** Pilot activation (missing-project honesty): projects for which the most recent canonical
   * read came back PROJECT_NOT_FOUND -- the browser's tracked-project roster is never proof a
   * project exists in D1, so this is shown as an explicit unavailable state rather than left as
   * stale placeholder dashes. Cleared the moment any read for that project succeeds again. */
  const notActivatedByProject = new Set<string>();
  const actionStateByKey = new Map<string, ActionState>();
  const inFlight = new Set<string>();
  /** Pilot activation: one ConversationSession per project, opaque to this client -- it only ever
   * round-trips whatever the server last returned, never inspects or mutates its fields. A
   * project's dialogue never blocks another project's card or any manual query/evidence action:
   * this owns its own busy lock (`conversationInFlight`, keyed by projectId only, separate from
   * `inFlight`'s `${projectId}:${kind}` keys) so a reasoning/clarification problem for one project
   * can never disable another project's controls. */
  const conversationByProject = new Map<string, unknown>();
  const conversationInFlight = new Set<string>();
  /** The single conversational PM confirmation currently awaiting a yes/no per project, if any. */
  const pendingConversationalConfirmation = new Map<
    string,
    PendingVoiceConfirmation
  >();

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
    forecastByProject.delete(projectId);
    notActivatedByProject.delete(projectId);
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

    const forecast = forecastByProject.get(projectId) ?? null;
    const forecastAvailable = forecast ? forecast.available === true : false;
    document.getElementById(`fp-${String(index)}-facts`).textContent =
      forecastAvailable
        ? `${String(forecast?.factsCount)} ${EM_DASH} ${((forecast?.factsSample as string[] | undefined) ?? []).join(", ") || "none"}`
        : EM_DASH;
    document.getElementById(`fp-${String(index)}-commitments`).textContent =
      forecastAvailable
        ? `${String(forecast?.commitmentsCount)} ${EM_DASH} ${((forecast?.commitmentsSample as string[] | undefined) ?? []).join(", ") || "none"}`
        : EM_DASH;
    document.getElementById(`fp-${String(index)}-unknowns`).textContent =
      forecastAvailable
        ? `${String(forecast?.unknownsCount)} ${EM_DASH} ${((forecast?.unknownsSample as string[] | undefined) ?? []).join(", ") || "none"}`
        : EM_DASH;

    document.getElementById(`fp-${String(index)}-unavailable`).hidden =
      !notActivatedByProject.has(projectId);
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
    if (kind === "FORECAST_QUERY") {
      forecastByProject.set(projectId, mapForecastToDisplay(result.body));
    }
    if (QUERY_KINDS.includes(kind)) {
      if (display.problemCode === "PROJECT_NOT_FOUND") {
        notActivatedByProject.add(projectId);
      } else if (display.workflowState === "SUCCEEDED") {
        notActivatedByProject.delete(projectId);
      }
    }

    const index = indexOfProject(projectId);
    if (index === -1) return;

    document.getElementById(`fp-${String(index)}-raw`).textContent =
      JSON.stringify(result.body, null, 2);
    updateProjectSummary(projectId);
    renderActiveWorkflows(projectId);
    renderPortfolioOverview();

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

  /**
   * The one place that actually builds identity, submits, and settles bookkeeping for a fresh
   * `/v1/intents` submission -- shared by the manual query/evidence buttons and (via the returned
   * `FieldVoiceBridge`, see the bottom of this function) the voice transport, so neither can ever
   * diverge from the other's identity/idempotency/busy-state handling. Always returns a promise:
   * callers that don't care about the outcome (the manual buttons) attach a no-op `.catch`; the
   * voice bridge attaches its own `.then`/`.catch` to speak the safe outcome.
   */
  function submitAction(
    projectId: string,
    kind: string,
    expectedRevision: number | null,
    evidenceEvent: unknown,
  ): Promise<{ workflowState: string }> {
    const key = `${projectId}:${kind}`;
    if (inFlight.has(key))
      return Promise.reject(new Error(`${key} is already in flight`));
    const fields: FormFields = {
      kind,
      projectId,
      expectedRevision,
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
    return callApi(fetch, sessionStorage, adminKeyValue(), "/v1/intents", {
      method: "POST",
      body: JSON.stringify(intent),
    })
      .then((result) => {
        handleActionResult(projectId, kind, storageKey, result);
        return {
          workflowState: String(mapOutcomeToDisplay(result.body).workflowState),
        };
      })
      .catch((error: unknown) => {
        setCardStatus(projectId, `Error: ${describeError(error)}`);
        throw error;
      })
      .finally(() => {
        inFlight.delete(key);
        refreshBusyIndicators(projectId);
        maybePurgeUntrackedProject(projectId);
      });
  }

  /**
   * Pilot activation: the one real call the manual text panel AND the voice client both use for a
   * conversational PM turn -- POST the exact same /v1/projects/:id/conversation/turn route every
   * other entry point (test/integration/conversation-http.test.ts) already proves end to end.
   * `conversationByProject` round-trips whatever session the server last returned; this client
   * never inspects or advances it itself. Busy state is scoped to this project's own conversation
   * panel (`conversationInFlight`), never the shared `inFlight` set the manual query/evidence/
   * Resume actions use -- a conversational turn in flight for one project must never disable
   * another project's Refresh/evidence controls, or this project's own Refresh/evidence controls.
   */
  function submitConversationalTurn(
    projectId: string,
    text: string,
  ): Promise<{ result: ConversationalTurnResultSummary }> {
    if (conversationInFlight.has(projectId)) {
      return Promise.reject(
        new Error(`conversation turn already in flight for ${projectId}`),
      );
    }
    conversationInFlight.add(projectId);
    return callApi(
      fetch,
      sessionStorage,
      adminKeyValue(),
      `/v1/projects/${encodeURIComponent(projectId)}/conversation/turn`,
      {
        method: "POST",
        body: JSON.stringify({
          text,
          session: conversationByProject.get(projectId) ?? null,
        }),
      },
    )
      .then((response) => {
        const body = response.body as
          | {
              session?: unknown;
              turn?: ConversationalTurnResultSummary;
              error?: string;
            }
          | undefined;
        if (!response.ok || !body?.turn) {
          throw new Error(body?.error ?? `HTTP ${String(response.status)}`);
        }
        conversationByProject.set(projectId, body.session ?? null);
        return { result: body.turn };
      })
      .finally(() => {
        conversationInFlight.delete(projectId);
      });
  }

  /** Pilot activation: resolves a conversational PM confirmation via the same route's `confirm`
   * branch -- the one real Apply path, exactly matching the already-proven HTTP contract (a
   * confirmation only ever consumes once; a duplicate or expired confirmation NOOPs server-side,
   * never re-applies). */
  function submitConversationalConfirm(
    projectId: string,
    confirmation: PendingVoiceConfirmation,
    affirmative: boolean,
  ): Promise<{
    outcome:
      "APPLIED" | "BLOCKED" | "FAILED" | "INTERRUPTED" | "CANCELLED" | "NOOP";
    workflowState?: string;
  }> {
    if (conversationInFlight.has(projectId)) {
      return Promise.reject(
        new Error(`conversation turn already in flight for ${projectId}`),
      );
    }
    conversationInFlight.add(projectId);
    return callApi(
      fetch,
      sessionStorage,
      adminKeyValue(),
      `/v1/projects/${encodeURIComponent(projectId)}/conversation/turn`,
      {
        method: "POST",
        body: JSON.stringify({
          session: conversationByProject.get(projectId) ?? null,
          confirm: { confirmation, affirmative },
        }),
      },
    )
      .then((response) => {
        const body = response.body as
          | {
              session?: unknown;
              confirm?: {
                outcome?: string;
                result?: { workflowState?: string };
              };
              error?: string;
            }
          | undefined;
        if (!response.ok || !body?.confirm) {
          throw new Error(body?.error ?? `HTTP ${String(response.status)}`);
        }
        conversationByProject.set(projectId, body.session ?? null);
        const outcome = body.confirm.outcome;
        const workflowState = body.confirm.result?.workflowState;
        // Safety repair (blocker 3 — Apply result truth): BLOCKED/FAILED/INTERRUPTED are their
        // own distinct outcomes, never silently folded into NOOP (which would misleadingly read
        // as "already resolved/nothing to see" instead of "this Apply did not succeed"). Only a
        // real, recognized outcome value is trusted; anything else falls back to NOOP.
        const resolvedOutcome:
          | "APPLIED"
          | "BLOCKED"
          | "FAILED"
          | "INTERRUPTED"
          | "CANCELLED"
          | "NOOP" =
          outcome === "APPLIED" ||
          outcome === "BLOCKED" ||
          outcome === "FAILED" ||
          outcome === "INTERRUPTED" ||
          outcome === "CANCELLED"
            ? outcome
            : "NOOP";
        return workflowState !== undefined
          ? { outcome: resolvedOutcome, workflowState }
          : { outcome: resolvedOutcome };
      })
      .finally(() => {
        conversationInFlight.delete(projectId);
      });
  }

  /** Renders one conversational turn's safe summary into a project's card -- clarification,
   * awaiting-confirmation (shows the Confirm/Reject controls), or a plain result line. Never
   * throws: an unrecognized/errored outcome falls back to a short honest status line rather than
   * ever freezing this or any other project's card. */
  function renderConversationTurn(
    projectId: string,
    index: number,
    result: ConversationalTurnResultSummary,
  ): void {
    const described = describeConversationalTurn(result);
    document.getElementById(`fp-${String(index)}-conv-response`).textContent =
      described.message;
    const confirmBlock = document.getElementById(
      `fp-${String(index)}-conv-confirm`,
    );
    if (described.pendingConfirmation) {
      pendingConversationalConfirmation.set(
        projectId,
        described.pendingConfirmation,
      );
      document.getElementById(
        `fp-${String(index)}-conv-confirm-text`,
      ).textContent = described.message;
      confirmBlock.hidden = false;
    } else {
      pendingConversationalConfirmation.delete(projectId);
      confirmBlock.hidden = true;
    }
  }

  function runConversationalTurn(projectId: string, index: number): void {
    const inputEl = document.getElementById(`fp-${String(index)}-conv-input`);
    const text = inputEl.value.trim();
    if (!text) return;
    document.getElementById(`fp-${String(index)}-conv-response`).textContent =
      "Working…";
    submitConversationalTurn(projectId, text)
      .then((response) => {
        inputEl.value = "";
        renderConversationTurn(projectId, index, response.result);
      })
      .catch((error: unknown) => {
        document.getElementById(
          `fp-${String(index)}-conv-response`,
        ).textContent = `Error: ${describeError(error)}`;
      });
  }

  function runConversationalConfirm(
    projectId: string,
    index: number,
    affirmative: boolean,
  ): void {
    const confirmation = pendingConversationalConfirmation.get(projectId);
    if (!confirmation) return;
    document.getElementById(`fp-${String(index)}-conv-response`).textContent =
      "Working…";
    submitConversationalConfirm(projectId, confirmation, affirmative)
      .then((outcome) => {
        pendingConversationalConfirmation.delete(projectId);
        document.getElementById(`fp-${String(index)}-conv-confirm`).hidden =
          true;
        // Safety repair (blocker 3 — Apply result truth): "Recorded." is shown for a genuine
        // APPLIED outcome only. BLOCKED/FAILED/INTERRUPTED each get their own honest message --
        // never "Recorded.", and never folded into the generic "no longer pending" line (which
        // would misleadingly suggest nothing needs attention).
        let message: string;
        switch (outcome.outcome) {
          case "APPLIED":
            message = "Recorded.";
            break;
          case "CANCELLED":
            message = "Cancelled.";
            break;
          case "BLOCKED":
            message = "Not recorded — it touches an unresolved block.";
            break;
          case "FAILED":
            message = "Not recorded — the apply failed.";
            break;
          case "INTERRUPTED":
            message = "Not recorded — the apply was interrupted.";
            break;
          default:
            message = "That update is no longer pending.";
        }
        document.getElementById(
          `fp-${String(index)}-conv-response`,
        ).textContent = message;
        renderActiveWorkflows(projectId);
      })
      .catch((error: unknown) => {
        document.getElementById(
          `fp-${String(index)}-conv-response`,
        ).textContent = `Error: ${describeError(error)}`;
      });
  }

  function runQuery(projectId: string, kind: string): void {
    void submitAction(projectId, kind, null, null).catch(() => undefined);
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
    let evidenceEvent: unknown = null;
    try {
      evidenceEvent = JSON.parse(jsonEl.value || "null");
    } catch {
      evidenceEvent = null;
    }
    void submitAction(
      projectId,
      kind,
      Number(revisionEl.value),
      evidenceEvent,
    ).catch(() => undefined);
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
  function submitResume(
    projectId: string,
    kind: string,
  ): Promise<{ workflowState: string }> {
    const actionKey = `${projectId}:${kind}`;
    const state = actionStateByKey.get(actionKey);
    if (!state?.workflowId || inFlight.has(actionKey))
      return Promise.reject(
        new Error(`no resumable workflow for ${actionKey}`),
      );
    inFlight.add(actionKey);
    refreshBusyIndicators(projectId);
    return callApi(
      fetch,
      sessionStorage,
      adminKeyValue(),
      `/v1/workflows/${encodeURIComponent(state.workflowId)}/resume`,
      { method: "POST" },
    )
      .then((result) => {
        handleActionResult(projectId, kind, state.storageKey, result);
        return {
          workflowState: String(mapOutcomeToDisplay(result.body).workflowState),
        };
      })
      .catch((error: unknown) => {
        setCardStatus(projectId, `Error: ${describeError(error)}`);
        throw error;
      })
      .finally(() => {
        inFlight.delete(actionKey);
        refreshBusyIndicators(projectId);
        maybePurgeUntrackedProject(projectId);
      });
  }

  function resumeAction(projectId: string, kind: string): void {
    void submitResume(projectId, kind).catch(() => undefined);
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
      .getElementById(`fp-${String(index)}-conv-send`)
      .addEventListener("click", () => {
        runConversationalTurn(projectId, index);
      });
    document
      .getElementById(`fp-${String(index)}-conv-confirm-yes`)
      .addEventListener("click", () => {
        runConversationalConfirm(projectId, index, true);
      });
    document
      .getElementById(`fp-${String(index)}-conv-confirm-no`)
      .addEventListener("click", () => {
        runConversationalConfirm(projectId, index, false);
      });
    const evidenceKindEl = document.getElementById(
      `fp-${String(index)}-evidence-kind`,
    );
    const evidenceRunEl = document.getElementById(
      `fp-${String(index)}-evidence-run`,
    );
    function updateEvidenceRunEmphasis(): void {
      // Presentation only: visually distinguishes the one consequential (mutating) evidence
      // action from the routine preview. Never affects which kind is actually submitted.
      evidenceRunEl.classList?.toggle(
        "btn-consequential",
        evidenceKindEl.value === "EVIDENCE_APPLY_SHADOW",
      );
    }
    evidenceKindEl.addEventListener("change", () => {
      refreshBusyIndicators(projectId);
      updateEvidenceRunEmphasis();
    });
    updateEvidenceRunEmphasis();
  }

  /** Highest-severity signal any of a project's tracked actions is currently carrying, reusing
   * exactly `isNoteworthy`'s classification (never a second definition of "noteworthy"). Used to
   * drive the Penthouse portfolio row and priorities panel -- both read this instead of
   * re-deriving urgency from raw workflow state. */
  function projectSignal(
    projectId: string,
  ): "critical" | "attention" | "ok" | "unknown" {
    let sawAttention = false;
    for (const kind of ACTION_KINDS) {
      const state = actionStateByKey.get(`${projectId}:${kind}`);
      if (!isNoteworthy(state)) continue;
      if (
        state?.workflowState === "INTERRUPTED" ||
        state?.workflowState === "BLOCKED"
      ) {
        return "critical";
      }
      sawAttention = true;
    }
    if (sawAttention) return "attention";
    const health = healthByProject.get(projectId) ?? null;
    return health && health.available === true ? "ok" : "unknown";
  }

  function projectFinishLine(projectId: string): string {
    const health = healthByProject.get(projectId) ?? null;
    if (!health || health.available !== true) return EM_DASH;
    const completion = health.completionLikely;
    return typeof completion === "string" ? completion : EM_DASH;
  }

  function projectHealthScore(projectId: string): string {
    const health = healthByProject.get(projectId) ?? null;
    if (!health || health.available !== true) return EM_DASH;
    const confidence = health.meanForecastConfidence;
    return typeof confidence === "number" ? String(confidence) : EM_DASH;
  }

  /** One compact portfolio row (signal / PROJECT / STATUS / FINISH / HEALTH) -- deliberately not
   * the full project card: that detail still lives in the admin drawer below, unchanged. */
  function portfolioRowHtml(projectId: string, index: number): string {
    const safeId = escapeHtml(projectId);
    const signal = projectSignal(projectId);
    const statusLabel =
      signal === "critical"
        ? "Critical"
        : signal === "attention"
          ? "Attention"
          : signal === "ok"
            ? "On track"
            : "Awaiting refresh";
    return `<button type="button" id="ph-row-${String(index)}" class="ph-row" data-signal="${signal}" data-project-id="${safeId}" aria-label="Open ${safeId} workspace">
      <span class="ph-row-signal" aria-hidden="true"></span>
      <span class="ph-row-name">${safeId}</span>
      <span class="ph-row-status">${statusLabel}</span>
      <span class="ph-row-finish">${escapeHtml(projectFinishLine(projectId))}</span>
      <span class="ph-row-health">${escapeHtml(projectHealthScore(projectId))}</span>
    </button>`;
  }

  /** Selecting a visible portfolio row opens that project's already-rendered Index Card by
   * scrolling it into view (every card renders unconditionally in the always-visible
   * "Project workspace" section now -- see requirement #2 -- so "opening" a project never needs a
   * separate route or a hidden-until-clicked drawer). A no-op for a project that somehow is not
   * (or is no longer) tracked. */
  function openProjectWorkspace(projectId: string): void {
    const index = indexOfProject(projectId);
    if (index === -1) return;
    document
      .getElementById(`fp-${String(index)}-title`)
      .scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  /** Count of currently noteworthy project+action items -- the same underlying signal
   * `renderActiveWorkflows` uses per project (isNoteworthy), just tallied at portfolio level. */
  function priorityCount(): number {
    let count = 0;
    for (const projectId of trackedProjects) {
      for (const kind of ACTION_KINDS) {
        if (isNoteworthy(actionStateByKey.get(`${projectId}:${kind}`))) {
          count += 1;
        }
      }
    }
    return count;
  }

  function prioritySeverityOverall(): "critical" | "attention" | "none" {
    let sawAttention = false;
    for (const projectId of trackedProjects) {
      for (const kind of ACTION_KINDS) {
        const state = actionStateByKey.get(`${projectId}:${kind}`);
        if (!isNoteworthy(state)) continue;
        if (
          state?.workflowState === "INTERRUPTED" ||
          state?.workflowState === "BLOCKED"
        ) {
          return "critical";
        }
        sawAttention = true;
      }
    }
    return sawAttention ? "attention" : "none";
  }

  /** The Alerts list under the Priorities count: one line per noteworthy project+action --
   * exactly the same items renderActiveWorkflows already lists per project, surfaced once more
   * at portfolio level. No new severity logic, no per-item card chrome (plain hairline rows). */
  function prioritiesListHtml(): string {
    const rows: string[] = [];
    for (const projectId of trackedProjects) {
      for (const kind of ACTION_KINDS) {
        const state = actionStateByKey.get(`${projectId}:${kind}`);
        if (!isNoteworthy(state)) continue;
        const label = ACTION_LABELS[kind] ?? kind;
        const detail = state?.problemText
          ? state.problemText
          : (state?.workflowState ?? "");
        rows.push(
          `<li class="ph-alert-row"><span class="ph-alert-project">${escapeHtml(projectId)}</span><span class="ph-alert-detail">${escapeHtml(label)}: ${escapeHtml(detail)}</span></li>`,
        );
      }
    }
    return rows.length
      ? `<ul class="ph-alert-list">${rows.join("")}</ul>`
      : `<p class="ph-empty">Nothing needs you right now.</p>`;
  }

  /** The next 14 real calendar days (today first), using the browser's own clock -- never a
   * fabricated/hardcoded date range. Each entry's `key` is a local-date string (YYYY-MM-DD) used
   * to align a project's real `nextRiskDate` to a column; `day`/`dow` are display-only. */
  function next14Days(): { key: string; day: string; dow: string }[] {
    const now = new Date();
    const days: { key: string; day: string; dow: string }[] = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      days.push({
        key: dateKey(d),
        day: String(d.getDate()),
        dow: d
          .toLocaleDateString(undefined, { weekday: "short" })
          .toUpperCase(),
      });
    }
    return days;
  }

  function dateKey(d: Date): string {
    return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** Normalizes a real recovery `nextRiskDate` value (plain date or full ISO datetime) to the
   * same local-date key `next14Days` uses, so a real date can be matched to its column. Returns
   * "" for anything unparseable rather than guessing -- an unmatched date is treated as outside
   * the visible window, never silently misplaced. */
  function dateKeyFromValue(value: unknown): string {
    if (typeof value !== "string") return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
  }

  /** One project's row in the 14-day movement timeline: a single real marker (from
   * `recovery.nextRiskDate`) placed on the matching day column when it falls in the window, or
   * an honest "Awaiting refresh" / "beyond 14 days" state when it doesn't -- never a fabricated
   * multi-phase schedule, since no per-phase task data exists in this system. */
  function movementRowHtml(projectId: string, days: { key: string }[]): string {
    const recovery = recoveryByProject.get(projectId) ?? null;
    const recoveryAvailable = recovery ? recovery.available === true : false;
    const signal = projectSignal(projectId);
    const riskKey = recoveryAvailable
      ? dateKeyFromValue(recovery?.nextRiskDate)
      : "";
    const dayIndex = riskKey ? days.findIndex((d) => d.key === riskKey) : -1;
    const marker =
      dayIndex === -1
        ? ""
        : `<span class="ph-gantt-marker" data-signal="${signal}" style="grid-column: ${String(dayIndex + 1)}"></span>`;
    const stateLabel = !recoveryAvailable
      ? "Awaiting refresh"
      : riskKey && dayIndex === -1
        ? `Next risk ${riskKey} (beyond 14 days)`
        : riskKey
          ? `Next risk ${riskKey}`
          : "No forecast yet";
    return `<div class="ph-gantt-row-grid ph-gantt-row" data-signal="${signal}">
      <span class="ph-gantt-project">${escapeHtml(projectId)}</span>
      <div class="ph-gantt-track">${marker}</div>
      <span class="ph-gantt-state">${escapeHtml(stateLabel)}</span>
    </div>`;
  }

  /** The Movement timeline: a real 14-day date grid with one honest marker row per tracked
   * project -- portfolio movement awareness only, not a scheduling tool. No phase names, no
   * dependencies, no editing -- that detail belongs to the future project Index Card. */
  function movementGanttHtml(): string {
    if (trackedProjects.length === 0) {
      return `<p class="ph-empty">No tracked projects yet.</p>`;
    }
    const days = next14Days();
    const header = `<div class="ph-gantt-row-grid ph-gantt-header">
      <span class="ph-gantt-header-label">Project</span>
      <div class="ph-gantt-track">${days
        .map(
          (d, i) =>
            `<span class="ph-gantt-day${i === 0 ? " ph-gantt-today" : ""}"><span class="ph-gantt-day-dow">${escapeHtml(d.dow)}</span>${escapeHtml(d.day)}</span>`,
        )
        .join("")}</div>
      <span class="ph-gantt-header-label">Next risk</span>
    </div>`;
    const rows = trackedProjects
      .map((projectId) => movementRowHtml(projectId, days))
      .join("");
    return `<div class="ph-gantt-scroll">${header}${rows}</div>`;
  }

  /** The single quiet "Howler notice" line: the first available top risk across tracked
   * projects, or an honest idle/empty summary. Deliberately one line, never a second competing
   * insight element -- see Task 19 brief. Plain text only (assigned via textContent below), so
   * this never HTML-escapes its own output. */
  function intelligenceNoticeText(): string {
    for (const projectId of trackedProjects) {
      const health = healthByProject.get(projectId) ?? null;
      if (health && health.available === true) {
        const risks = (health.topRisks as string[] | undefined) ?? [];
        const topRisk = risks[0];
        if (topRisk) return `${projectId}: ${topRisk}`;
      }
    }
    const count = trackedProjects.length;
    return count > 0
      ? `Monitoring ${String(count)} tracked project${count === 1 ? "" : "s"}. Nothing urgent right now.`
      : "Add a project to begin monitoring.";
  }

  /** Refreshes every portfolio-level Penthouse section from already-tracked state. Called
   * whenever that state can have changed: after any action result settles (handleActionResult)
   * and whenever the tracked-project list itself changes (renderProjects). Never introduces new
   * business logic -- purely re-reads trackedProjects/healthByProject/recoveryByProject/
   * actionStateByKey, the same maps the per-project card rendering already reads. */
  function renderPortfolioOverview(): void {
    document.getElementById("ph-portfolio-rows").innerHTML =
      trackedProjects.length
        ? trackedProjects.map((id, i) => portfolioRowHtml(id, i)).join("")
        : `<p class="ph-empty">No tracked projects yet ${EM_DASH} add one in Admin &amp; diagnostics below.</p>`;
    trackedProjects.forEach((id, i) => {
      document
        .getElementById(`ph-row-${String(i)}`)
        .addEventListener("click", () => {
          openProjectWorkspace(id);
        });
    });

    const severity = prioritySeverityOverall();
    const prioritiesSection = document.getElementById("ph-priorities-section");
    prioritiesSection.classList?.toggle(
      "ph-severity-critical",
      severity === "critical",
    );
    prioritiesSection.classList?.toggle(
      "ph-severity-attention",
      severity === "attention",
    );
    document.getElementById("ph-priority-count").textContent =
      String(priorityCount());
    document.getElementById("ph-priority-word").textContent =
      severity === "critical"
        ? "Critical"
        : severity === "attention"
          ? "Attention"
          : "";
    document.getElementById("ph-priority-caption").textContent =
      severity === "critical"
        ? "Critical items need you now."
        : severity === "attention"
          ? "Items need your attention."
          : "Nothing needs you right now.";
    document.getElementById("ph-priorities-list").innerHTML =
      prioritiesListHtml();

    document.getElementById("ph-movement-band").innerHTML = movementGanttHtml();
    document.getElementById("ph-intelligence-text").textContent =
      intelligenceNoticeText();
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
    renderPortfolioOverview();
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

  /** Requirement #3 (automatic canonical reads): opening Penthouse must load real canonical
   * project data without the pilot user ever visiting Admin & diagnostics -- but a Worker route
   * genuinely cannot be read before an admin key exists, so "automatic" means "the moment a key is
   * available", not "before". Fires once per distinct non-empty key value (not on every keystroke,
   * and not repeatedly for the same key), on the input's `change` event (fires on blur/Enter,
   * exactly like a real browser commits a credential field) -- never on `input`, which would fire
   * mid-paste/mid-type against a key that isn't finished yet. */
  let lastAutoLoadedAdminKey = "";
  els.adminKey.addEventListener("change", () => {
    const key = adminKeyValue();
    if (!key || key === lastAutoLoadedAdminKey) return;
    lastAutoLoadedAdminKey = key;
    trackedProjects.forEach((id) => {
      runProjectQueries(id);
    });
  });

  renderProjects();

  /**
   * The minimal, real integration surface the voice transport uses instead of ever
   * reimplementing its own project/evidence/resume state or its own submission mechanics --
   * every submit* method here delegates straight to the exact same submitAction/submitResume
   * core the manual buttons above call. See `FieldVoiceBridge` in voice-transport.ts.
   */
  const voiceBridge: FieldVoiceBridge = {
    listProjectIds: () => trackedProjects.slice(),
    listResumableWorkflows: () => {
      const resumable: {
        workflowId: string;
        projectId: string;
        kind: string;
      }[] = [];
      for (const projectId of trackedProjects) {
        for (const kind of ACTION_KINDS) {
          const state = actionStateByKey.get(`${projectId}:${kind}`);
          if (state?.workflowState === "INTERRUPTED" && state.workflowId) {
            resumable.push({ workflowId: state.workflowId, projectId, kind });
          }
        }
      }
      return resumable;
    },
    getEvidenceFields: (projectId: string) => {
      const index = indexOfProject(projectId);
      if (index === -1) return null;
      const revisionEl = document.getElementById(
        `fp-${String(index)}-evidence-revision`,
      );
      const jsonEl = document.getElementById(
        `fp-${String(index)}-evidence-json`,
      );
      let evidenceEvent: unknown = null;
      try {
        evidenceEvent = JSON.parse(jsonEl.value || "null");
      } catch {
        evidenceEvent = null;
      }
      const revisionRaw = revisionEl.value;
      return {
        evidenceSnapshot: evidenceEvent,
        expectedProjectRevision:
          revisionRaw === "" ? undefined : Number(revisionRaw),
      };
    },
    submitQuery: (projectId, kind) => submitAction(projectId, kind, null, null),
    submitPreview: (projectId, evidenceSnapshot, expectedProjectRevision) =>
      submitAction(
        projectId,
        "EVIDENCE_PREVIEW",
        expectedProjectRevision ?? null,
        evidenceSnapshot ?? null,
      ),
    submitApply: (confirmation) =>
      submitAction(
        confirmation.projectId,
        "EVIDENCE_APPLY_SHADOW",
        confirmation.expectedProjectRevision ?? null,
        confirmation.immutableSnapshot,
      ),
    resumeWorkflow: (projectId, kind) => submitResume(projectId, kind),
    submitConversationalTurn: (projectId, text) =>
      submitConversationalTurn(projectId, text),
    submitConversationalConfirm: (projectId, confirmation, affirmative) =>
      submitConversationalConfirm(projectId, confirmation, affirmative),
  };
  return voiceBridge;
}

/**
 * Task 19: purely presentational voice-state indicator. Watches #voice-status's existing
 * textContent (set entirely by voiceBrowserClient in voice-transport.ts, which this function
 * never imports, calls, or modifies) and reflects it as a `data-voice-state` attribute on the
 * voice section for CSS styling only -- READY/LISTENING/PROCESSING/CONFIRMATION/COMPLETED/FAILED.
 * Read-only observer: it never writes to #voice-status, never touches the capture/resolver/
 * confirmation/identity path, and has no effect if #voice-status or #voice-section are absent.
 * `.toString()`-embedded the same way as every other field-dashboard script piece, so it must stay
 * fully self-contained (no module-scope references).
 */
export function wireVoicePresentationState(document: {
  getElementById(id: string): {
    textContent: string | null;
    setAttribute(name: string, value: string): void;
  } | null;
}): void {
  const status = document.getElementById("voice-status");
  const section = document.getElementById("voice-section");
  if (!status || !section) return;

  function classify(text: string): string {
    const value = text.trim().toUpperCase();
    if (
      value.startsWith("LISTENING") ||
      value.startsWith("REQUESTING_PERMISSION")
    )
      return "LISTENING";
    if (value.startsWith("RESOLVING") || value.startsWith("SUBMITTING"))
      return "PROCESSING";
    if (value.startsWith("CONFIRMATION_REQUIRED")) return "CONFIRMATION";
    if (value.startsWith("RESULT")) return "COMPLETED";
    if (
      value.startsWith("ERROR") ||
      value.startsWith("CLARIFICATION") ||
      value.startsWith("CANCELLED")
    )
      return "FAILED";
    return "READY";
  }

  function apply(): void {
    section?.setAttribute(
      "data-voice-state",
      classify(status?.textContent ?? ""),
    );
  }

  apply();

  const ObserverCtor = (
    globalThis as unknown as {
      MutationObserver?: new (callback: () => void) => {
        observe(target: unknown, options: unknown): void;
      };
    }
  ).MutationObserver;
  if (ObserverCtor) {
    const observer = new ObserverCtor(apply);
    observer.observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

export function fieldDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Howler Field Dashboard</title>
  <style>
${PENTHOUSE_TOKENS}
    body {
      font-size: 15px;
      background:
        radial-gradient(1100px 620px at 82% -8%, rgba(196, 143, 80, 0.14), transparent 60%),
        radial-gradient(900px 520px at -10% 12%, rgba(120, 150, 190, 0.08), transparent 55%),
        var(--hw-bg);
    }
    .ph-layout { display: flex; max-width: 1480px; margin: 0 auto; align-items: flex-start; }
    .ph-nav {
      flex: 0 0 190px; display: flex; flex-direction: column; gap: 2px;
      padding: 28px 14px; border-right: 1px solid var(--hw-border); position: sticky; top: 0;
    }
    .ph-nav-mark {
      margin: 0 6px 18px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--hw-ink-faint);
    }
    .ph-nav-mark span { display: block; font-size: 9px; letter-spacing: 0.18em; opacity: 0.75; }
    .ph-nav-item {
      text-align: left; background: none; border: none; padding: 9px 10px; cursor: pointer;
      border-radius: var(--hw-radius-sm); font-size: 12px; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--hw-ink-faint); font-family: var(--hw-font);
    }
    .ph-nav-item:hover { color: var(--hw-ink-muted); }
    .ph-nav-item:focus-visible { outline: 2px solid var(--hw-focus); outline-offset: 2px; }
    .ph-nav-item[aria-disabled="true"] { opacity: 0.55; }
    .ph-nav-active {
      color: var(--hw-accent-strong); background: var(--hw-surface); font-weight: 600;
    }
    .ph-shell { flex: 1 1 auto; min-width: 0; padding: 28px 24px 48px; }
    h1 { font-size: 20px; }
    .project-card { padding: 18px; }

    /* Arrival: atmosphere + hero copy (left) beside portfolio + priorities (right) */
    .ph-arrival {
      position: relative; display: grid; grid-template-columns: 1fr;
      border: 1px solid var(--hw-border); border-radius: var(--hw-radius-lg);
      overflow: hidden; margin-bottom: 22px; background: var(--hw-surface);
    }
    .ph-atmosphere {
      position: relative; display: flex; flex-direction: column; justify-content: flex-end;
      padding: 22px 24px 26px; min-height: 360px;
      background:
        linear-gradient(180deg, rgba(8,9,11,0.12) 0%, rgba(8,9,11,0.6) 55%, rgba(8,9,11,0.92) 100%),
        url("/assets/penthouse-atmosphere.24b1cb4d39.webp");
      background-repeat: no-repeat, no-repeat;
      background-size: cover, cover;
      background-position: center, 32% 45%;
    }
    .ph-env-banner { position: absolute; top: 16px; right: 16px; font-size: 11px; }
    .ph-lockup { margin-bottom: auto; display: flex; align-items: baseline; gap: 8px; }
    .ph-lockup-word { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--hw-ink); }
    .ph-lockup-sub { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--hw-ink-faint); }
    .ph-greeting { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--hw-ink-faint); }
    .ph-command {
      margin: 0 0 10px; font-family: var(--hw-font-serif); font-weight: 400; font-size: 38px;
      line-height: 1.08; color: var(--hw-ink);
    }
    .ph-statement { margin: 0 0 20px; max-width: 34ch; font-size: 13px; color: var(--hw-ink-muted); }
    .ph-voice-inline { display: flex; align-items: center; gap: 12px; }
    .ph-voice-btn {
      flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; padding: 0;
      border: 1px solid var(--hw-border-strong); background: rgba(20, 18, 15, 0.4);
      display: flex; align-items: center; justify-content: center;
    }
    .ph-voice-ring { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--hw-ink-muted); }
    .ph-voice-caption { margin: 0; font-size: 12px; font-weight: 400; color: var(--hw-ink-muted); }
    #voice-status {
      font-family: var(--hw-font-mono); font-size: 11px; letter-spacing: 0.03em;
      color: var(--hw-ink-faint); margin-top: 2px;
    }
    #voice-section[data-voice-state="LISTENING"] .ph-voice-btn {
      border-color: var(--hw-accent); box-shadow: 0 0 0 4px var(--hw-accent-ink);
    }
    #voice-section[data-voice-state="LISTENING"] .ph-voice-ring { border-color: var(--hw-accent); }
    #voice-section[data-voice-state="LISTENING"] #voice-status { color: var(--hw-accent-strong); }
    #voice-section[data-voice-state="PROCESSING"] .ph-voice-btn { border-style: dashed; }
    #voice-section[data-voice-state="CONFIRMATION"] .ph-voice-btn { border-color: var(--hw-warn); }
    #voice-section[data-voice-state="CONFIRMATION"] #voice-status { color: var(--hw-warn); }
    #voice-section[data-voice-state="COMPLETED"] #voice-status { color: var(--hw-ok); }
    #voice-section[data-voice-state="FAILED"] #voice-status { color: var(--hw-danger); }

    .ph-data-grid { display: grid; grid-template-columns: 1fr; }
    .ph-priorities { order: 1; padding: 18px 22px 22px; border-bottom: 1px solid var(--hw-border); }
    .ph-portfolio { order: 2; padding: 18px 22px 22px; }
    .ph-eyebrow-label {
      margin: 0 0 4px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--hw-ink-faint);
    }
    .ph-portfolio h2 { margin: 0 0 14px; font-size: 17px; font-weight: 500; color: var(--hw-ink); }
    .ph-empty { color: var(--hw-ink-faint); font-size: 13px; margin: 0; }

    .ph-row {
      display: grid; grid-template-columns: 8px 1.3fr 1fr 0.8fr 0.6fr; align-items: center;
      gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--hw-border); font-size: 13px;
    }
    button.ph-row { cursor: pointer; width: 100%; background: none; border: none; border-bottom: 1px solid var(--hw-border); text-align: left; font-family: inherit; color: inherit; min-height: 0; }
    button.ph-row:hover { background: var(--hw-surface); }
    button.ph-row:focus-visible { outline: 2px solid var(--hw-focus); outline-offset: -2px; }
    .ph-row-labels {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--hw-ink-faint);
    }
    .ph-row-signal { width: 6px; height: 6px; border-radius: 50%; background: var(--hw-border-strong); justify-self: center; }
    .ph-row[data-signal="critical"] .ph-row-signal { background: var(--hw-danger); }
    .ph-row[data-signal="attention"] .ph-row-signal { background: var(--hw-warn); }
    .ph-row[data-signal="ok"] .ph-row-signal { background: var(--hw-ok); }
    .ph-row-name { font-weight: 500; }
    .ph-row-status, .ph-row-finish, .ph-row-health { color: var(--hw-ink-muted); }

    .ph-priority-summary { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
    .ph-priority-count { font-family: var(--hw-font-serif); font-size: 38px; line-height: 1; color: var(--hw-ink); }
    .ph-priority-word { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--hw-ink-muted); }
    .ph-priorities.ph-severity-critical .ph-priority-count,
    .ph-priorities.ph-severity-critical .ph-priority-word { color: var(--hw-danger); }
    .ph-priorities.ph-severity-attention .ph-priority-count,
    .ph-priorities.ph-severity-attention .ph-priority-word { color: var(--hw-warn); }
    .ph-priority-caption { margin: 0 0 16px; font-size: 12px; color: var(--hw-ink-faint); }
    .ph-alerts-label {
      margin: 0 0 8px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--hw-ink-faint); border-top: 1px solid var(--hw-border); padding-top: 14px;
    }
    .ph-alert-list { list-style: none; margin: 0; padding: 0; }
    .ph-alert-row { padding: 8px 0; border-bottom: 1px solid var(--hw-border); font-size: 12px; }
    .ph-alert-row:last-child { border-bottom: none; }
    .ph-alert-project { display: block; font-weight: 600; color: var(--hw-ink); margin-bottom: 2px; }
    .ph-alert-detail { color: var(--hw-ink-muted); word-break: break-word; }

    .ph-connect { margin-bottom: 20px; }
    .ph-connect input { max-width: 420px; }
    .ph-connect .hw-sub { margin: 8px 0 0; }
    .ph-workspace { margin-bottom: 22px; }
    .ph-workspace .hw-sub { margin-bottom: 10px; }
    .project-unavailable {
      background: var(--hw-warn-bg); border: 1px solid var(--hw-warn); border-radius: var(--hw-radius-sm);
      padding: 10px 12px; margin-bottom: 12px; font-size: 13px; color: var(--hw-warn);
    }
    .ph-bottom-band { display: grid; grid-template-columns: 1fr; gap: 20px; margin-bottom: 22px; }
    .ph-movement, .ph-intelligence {
      min-width: 0; border: 1px solid var(--hw-border); border-radius: var(--hw-radius);
      padding: 16px 18px;
    }
    .ph-movement h2 {
      margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--hw-ink-muted);
    }
    .ph-gantt-scroll { overflow-x: auto; }
    .ph-gantt-row-grid {
      display: grid; grid-template-columns: 96px minmax(320px, 1fr) 130px; gap: 10px;
      align-items: center; min-width: 480px;
    }
    .ph-gantt-header {
      padding-bottom: 8px; border-bottom: 1px solid var(--hw-border-strong); margin-bottom: 4px;
    }
    .ph-gantt-header-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--hw-ink-faint);
    }
    .ph-gantt-header-label:last-child { text-align: right; }
    .ph-gantt-track {
      display: grid; grid-template-columns: repeat(14, 1fr); align-items: center; height: 18px;
      position: relative;
    }
    .ph-gantt-track::before {
      content: ""; position: absolute; inset: 0; pointer-events: none;
      background-image: repeating-linear-gradient(
        to right, var(--hw-border) 0, var(--hw-border) 1px, transparent 1px, transparent calc(100% / 14)
      );
    }
    .ph-gantt-day {
      text-align: center; font-size: 9px; line-height: 1.3; color: var(--hw-ink-faint); z-index: 1;
    }
    .ph-gantt-day-dow { display: block; letter-spacing: 0.04em; }
    .ph-gantt-day.ph-gantt-today { color: var(--hw-accent-strong); font-weight: 600; }
    .ph-gantt-row { padding: 7px 0; border-bottom: 1px solid var(--hw-border); font-size: 12px; }
    .ph-gantt-row:last-child { border-bottom: none; }
    .ph-gantt-project { font-weight: 500; }
    .ph-gantt-marker {
      width: 7px; height: 7px; border-radius: 50%; justify-self: center; z-index: 1;
      background: var(--hw-border-strong);
    }
    .ph-gantt-row[data-signal="critical"] .ph-gantt-marker { background: var(--hw-danger); }
    .ph-gantt-row[data-signal="attention"] .ph-gantt-marker { background: var(--hw-warn); }
    .ph-gantt-row[data-signal="ok"] .ph-gantt-marker { background: var(--hw-ok); }
    .ph-gantt-state { color: var(--hw-ink-muted); text-align: right; }
    .ph-intelligence-label {
      margin: 0 0 6px; font-family: var(--hw-font-serif); font-size: 12px; letter-spacing: 0.06em;
      color: var(--hw-accent-strong); text-transform: uppercase;
    }
    .ph-intelligence p:last-child { margin: 0; font-size: 13px; color: var(--hw-ink-muted); }

    .ph-admin-drawer { border-top: 1px solid var(--hw-border); padding-top: 12px; }
    .ph-admin-drawer summary {
      font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--hw-ink-muted);
    }
    .ph-admin-drawer > *:not(summary) { margin-top: 14px; }

    @media (min-width: 861px) {
      .ph-arrival { grid-template-columns: minmax(300px, 38%) 1fr; }
      .ph-atmosphere { min-height: 520px; }
      .ph-data-grid { grid-template-columns: 1.5fr 1fr; }
      .ph-priorities { order: 2; border-bottom: none; border-left: 1px solid var(--hw-border); }
      .ph-portfolio { order: 1; }
      .ph-bottom-band { grid-template-columns: 1.6fr 1fr; }
    }
    @media (max-width: 760px) {
      .ph-layout { flex-direction: column; align-items: stretch; }
      .ph-atmosphere {
        background-image:
          linear-gradient(180deg, rgba(8,9,11,0.12) 0%, rgba(8,9,11,0.6) 55%, rgba(8,9,11,0.92) 100%),
          url("/assets/penthouse-atmosphere-mobile.24a2efed46.webp");
      }
      .ph-nav {
        flex-direction: row; flex-wrap: nowrap; overflow-x: auto; position: static; min-width: 0;
        border-right: none; border-bottom: 1px solid var(--hw-border); padding: 10px 12px; gap: 4px;
      }
      .ph-nav-mark { display: none; }
      .ph-nav-item { flex: 0 0 auto; padding: 7px 10px; font-size: 11px; }
      .ph-row {
        grid-template-columns: 8px 1fr; row-gap: 3px;
        grid-template-areas: "signal name" "status finish" ". health";
      }
      .ph-row-signal { grid-area: signal; }
      .ph-row-name { grid-area: name; }
      .ph-row-status { grid-area: status; }
      .ph-row-finish { grid-area: finish; }
      .ph-row-health { grid-area: health; }
      .ph-row-labels { display: none; }
    }
    .project-head {
      display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
      margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--hw-border);
    }
    .project-head h2 { font-size: 15px; letter-spacing: 0.01em; }
    .project-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px 16px; margin-bottom: 12px;
    }
    .project-grid p { margin: 0; font-size: 13px; word-break: break-word; color: var(--hw-ink); }
    .cell-risk h3 { color: var(--hw-danger); }
    .active-workflows { margin: 12px 0; }
    .active-workflows h3 { margin-bottom: 6px; }
    .workflow-row {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 8px 10px; font-size: 13px;
      border-left: 2px solid var(--hw-danger); background: var(--hw-danger-bg);
      border-radius: 0 var(--hw-radius-sm) var(--hw-radius-sm) 0;
    }
    .workflow-row + .workflow-row { margin-top: 6px; }
    .none { color: var(--hw-ink-faint); font-size: 13px; margin: 0; }
    .evidence-block { border-top: 1px solid var(--hw-border); margin-top: 12px; padding-top: 12px; }
    details { margin-top: 10px; }
    details summary { cursor: pointer; font-size: 12px; color: var(--hw-ink-muted); }
    [id$="-card-status"] { font-size: 12px; color: var(--hw-ink-muted); margin-top: 10px; }
  </style>
</head>
<body>
<div class="ph-layout">
  <nav class="ph-nav" aria-label="Penthouse">
    <p class="ph-nav-mark">Howler<span>Penthouse</span></p>
    <button type="button" class="ph-nav-item ph-nav-active" aria-current="page">Portfolio</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Forecast</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Trades</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Materials</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Inspections</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Decisions</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Risks</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Documents</button>
    <button type="button" class="ph-nav-item" aria-disabled="true" title="Coming soon">Activity</button>
  </nav>
<main class="ph-shell">
  <section class="ph-connect card" aria-labelledby="ph-connect-heading">
    <label id="ph-connect-heading" for="admin-key">HOWLER_ADMIN_KEY</label>
    <input id="admin-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste the staging admin key to load the portfolio">
    <p class="hw-sub">Kept in memory for this tab only -- never written to sessionStorage/localStorage. Entering it automatically loads every tracked project below.</p>
  </section>
  <div class="ph-arrival">
    <div class="ph-atmosphere">
      <div id="env-banner" role="status" class="ph-env-banner">STAGING &middot; SHADOW &middot; NO LIVE SYSTEMS</div>
      <p class="ph-lockup"><span class="ph-lockup-word">Howler</span><span class="ph-lockup-sub">Penthouse</span></p>
      <div>
        <p class="ph-greeting">Portfolio command</p>
        <h1 class="ph-command">Command<br>the work.</h1>
        <p class="ph-statement">Real-time oversight of every tracked project, one voice away.</p>
        <div class="ph-voice-inline" id="voice-section" aria-labelledby="voice-heading" data-voice-state="READY">
          <button id="voice-push-to-talk" type="button" class="ph-voice-btn" aria-label="Push to talk">
            <span class="ph-voice-ring" aria-hidden="true"></span>
          </button>
          <div>
            <h2 id="voice-heading" class="ph-voice-caption">Press to speak with Howler</h2>
            <div id="voice-status" role="status" aria-live="polite">IDLE</div>
          </div>
        </div>
      </div>
    </div>

    <div class="ph-data-grid">
      <section class="ph-priorities" id="ph-priorities-section" aria-labelledby="ph-priorities-heading">
        <p class="ph-eyebrow-label" id="ph-priorities-heading">Priorities</p>
        <div class="ph-priority-summary">
          <span class="ph-priority-count" id="ph-priority-count">0</span>
          <span class="ph-priority-word" id="ph-priority-word"></span>
        </div>
        <p class="ph-priority-caption" id="ph-priority-caption">Nothing needs you right now.</p>
        <p class="ph-alerts-label">Alerts</p>
        <div id="ph-priorities-list"><p class="ph-empty">Nothing needs you right now.</p></div>
      </section>

      <section class="ph-portfolio" aria-labelledby="ph-portfolio-heading">
        <p class="ph-eyebrow-label">Portfolio overview</p>
        <h2 id="ph-portfolio-heading">Active projects</h2>
        <div class="ph-row ph-row-labels" aria-hidden="true">
          <span class="ph-row-signal"></span>
          <span class="ph-row-name">Project</span>
          <span class="ph-row-status">Status</span>
          <span class="ph-row-finish">Finish</span>
          <span class="ph-row-health">Health</span>
        </div>
        <div id="ph-portfolio-rows"><p class="ph-empty">No tracked projects yet.</p></div>
      </section>
    </div>
  </div>

  <div class="ph-bottom-band">
    <section class="ph-movement" aria-labelledby="ph-movement-heading">
      <h2 id="ph-movement-heading">Movement</h2>
      <div id="ph-movement-band"><p class="ph-empty">No portfolio movement yet.</p></div>
    </section>

    <section class="ph-intelligence" aria-labelledby="ph-intelligence-heading">
      <p class="ph-intelligence-label" id="ph-intelligence-heading">Howler notice</p>
      <p id="ph-intelligence-text">Add a project to begin monitoring.</p>
    </section>
  </div>

  <section class="ph-workspace" aria-labelledby="ph-workspace-heading">
    <p class="ph-eyebrow-label" id="ph-workspace-heading">Project workspace</p>
    <p class="hw-sub">Read-only forecast/health/recovery intelligence and explicit staging-only evidence actions, one project at a time. This page submits requests only; all forecasting, revision, retry, and mutation logic runs server-side.</p>
    <div id="projects-container"></div>
  </section>

  <details class="ph-admin-drawer">
    <summary>Admin &amp; diagnostics</summary>

    <section class="card">
      <label for="new-project-id">Add project</label>
      <input id="new-project-id" type="text" autocapitalize="none" spellcheck="false" placeholder="Project ID">
      <button id="add-project" type="button">Add project</button>
      <button id="refresh-all" type="button">Refresh all</button>
    </section>
  </details>
</main>
</div>
<script>
${createSubmissionKernel.toString()}
${normalizeProjectId.toString()}
${commandKind.toString()}
${projectMention.toString()}
${projectAliasesFromIds.toString()}
${resolveVoiceCommand.toString()}
${createCaptureController.toString()}
${stableSerialize.toString()}
${fingerprint.toString()}
${createPendingVoiceConfirmation.toString()}
${classifyConfirmationResponse.toString()}
${respondToVoiceConfirmation.toString()}
${createVoicePresentation.toString()}
${classifyWorkflowStateForVoice.toString()}
${speakVoicePresentation.toString()}
${describeConversationalTurn.toString()}
const __howlerFieldVoiceBridge = (${fieldDashboardClientScript.toString()})(document, sessionStorage, fetch, crypto);
(${voiceBrowserClient.toString()})(document, __howlerFieldVoiceBridge, () => crypto.randomUUID());
(${wireVoicePresentationState.toString()})(document);
</script>
</body>
</html>`;
}

export function fieldDashboardPage(): Response {
  return new Response(fieldDashboardHtml(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // img-src 'self' is the one deliberate deviation from the shared CSP baseline (see
      // operatorPanelPage/adminPage) -- required so the atmosphere background (public/assets/*.webp,
      // served by Cloudflare's Asset Worker, same-origin, never a third-party host) can render at
      // all; `default-src 'none'` blocks images just like any other resource unless img-src
      // explicitly allows them. 'self' only -- no data:, no external host -- so this cannot be
      // used to load a remote or inline-encoded image.
      "content-security-policy":
        "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
