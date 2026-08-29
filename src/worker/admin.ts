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
