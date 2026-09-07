# Howler Pilot Auth + Live Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the developer-style admin-key dashboard flow with a real pilot login/session boundary and an automatically hydrated, continuously fresh portfolio sized for 12-16 active projects per PM/owner.

**Architecture:** The Worker gains a reusable auth/session boundary and a server-derived portfolio endpoint. The Penthouse becomes session-authenticated, removes the admin-key input and fixed seven-project/browser roster assumptions, hydrates from current canonical server state immediately after login, and background-syncs while visible. Existing admin/script Bearer-key routes remain separate and backward compatible.

**Tech Stack:** Cloudflare Worker, TypeScript, D1, Web Crypto, signed HttpOnly cookies, existing HTML/JS field dashboard, Vitest, Wrangler.

**Spec:** `docs/superpowers/specs/2026-09-07-howler-pilot-auth-live-dashboard-design.md`

## Global Constraints

- The current seven projects are data, not an architectural limit.
- Design target: 12-16 active projects per PM/owner without dashboard redesign.
- Product portfolio membership is server-derived, never a hardcoded array or browser roster.
- No normal product flow may require `HOWLER_ADMIN_KEY`, raw JSON, or manual Refresh.
- Product sessions and admin/service Bearer access remain separate authorization mechanisms.
- `HOWLER_MODE` remains `shadow`.
- D1 remains `howler-intelligence-staging`.
- Do not weaken append-only project/event/forecast/workflow protections.
- Do not change forecasting math or DeBoard lineage behavior.
- TDD for every implementation task.

---

### Task 1: Auth/session primitive and login contract

**Files:**
- Create: `src/worker/auth.ts`
- Modify: `src/worker/index.ts`
- Modify: `worker-configuration.d.ts`
- Test: `test/unit/auth.test.ts`
- Test: `test/contract/auth-routes.test.ts`

**Interfaces:**
- Produces `AuthenticatedUser`, `authenticatePilotUser`, `createSessionCookie`, `readSession`, `clearSessionCookie`, and `requireProductSession`.
- Consumes Worker secret bindings for pilot credential verification and a dedicated session-signing secret.

- [ ] **Step 1: Write failing unit tests for signed sessions**

Cover: valid session, tampered session, expired session, Secure/HttpOnly/SameSite=Strict/Path cookie flags, and logout expiration.

- [ ] **Step 2: Run auth unit tests and confirm RED**

Run: `npx vitest run test/unit/auth.test.ts`
Expected: failures because `src/worker/auth.ts` does not exist.

- [ ] **Step 3: Implement the minimal session/auth module**

Use Web Crypto HMAC signing with an independent session secret. Keep the session payload limited to `userId`, `displayName`, `role`, `issuedAt`, and `expiresAt`. Keep credential comparison timing-safe. Do not reuse `HOWLER_ADMIN_KEY` as the product password.

- [ ] **Step 4: Write failing route tests**

Prove:
- unauthenticated `GET /` returns login HTML and no project names
- valid login sets the secure session cookie
- invalid login returns 401 and no cookie
- authenticated `GET /` returns Penthouse
- logout clears session
- PM session cannot call admin-only schema/seed/import controls
- existing admin Bearer behavior remains valid where intended

- [ ] **Step 5: Implement login/logout/session route handling in `index.ts`**

Add minimal product routes such as `POST /auth/login`, `POST /auth/logout`, and session-aware `GET /` without changing `/admin` engineering behavior.

- [ ] **Step 6: Run targeted tests and typecheck**

Run:
`npx vitest run test/unit/auth.test.ts test/contract/auth-routes.test.ts`
`npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat(auth): add pilot login and signed product sessions`

---

### Task 2: Dynamic server-derived portfolio endpoint

**Files:**
- Modify: `src/worker/repository.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/operator/project-summary.ts`
- Test: `test/integration/portfolio.test.ts`
- Test: `test/contract/v096-portfolio-routes.test.ts`

**Interfaces:**
- Produces `GET /v1/portfolio` for authenticated product sessions.
- Produces repository method to list active visible project IDs/models dynamically.
- Reuses existing `buildProjectSummary` for each canonical project; does not duplicate summary logic.

- [ ] **Step 1: Write failing portfolio tests for 0, 1, 7, 12, and 16 projects**

Assert response count and identities are derived from repository contents, not a literal array. Include a Genesis-created project to prove no browser registration is required.

- [ ] **Step 2: Run targeted portfolio tests and confirm RED**

Run: `npx vitest run test/integration/portfolio.test.ts test/contract/v096-portfolio-routes.test.ts`
Expected: FAIL because the route/repository method does not exist.

- [ ] **Step 3: Add repository portfolio query**

Implement a compact canonical project listing method suitable for the active portfolio. Do not issue one browser workflow per project. Keep heavy diagnostics out of this aggregate response.

- [ ] **Step 4: Implement authenticated `GET /v1/portfolio`**

Return compact project summaries built from current canonical state. The pilot user sees all active pilot projects. Leave the interface ready for future per-user/org filtering.

- [ ] **Step 5: Verify scale target**

Run the 12- and 16-project cases and assert one portfolio request returns all compact summaries without any fixed-count assumption.

- [ ] **Step 6: Run typecheck and integration suite subset**

Run:
`npm run typecheck`
`npx vitest run test/integration/portfolio.test.ts test/contract/v096-portfolio-routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat(portfolio): derive active projects from canonical server state`

---

### Task 3: Login page and removal of admin-key product UX

**Files:**
- Modify: `src/worker/admin.ts`
- Test: `test/contract/admin-ui.test.ts`
- Test: `test/unit/field-dashboard.test.ts`

**Interfaces:**
- Produces a branded unauthenticated login page.
- Product/Penthouse client uses same-origin cookies and no longer reads or sends `HOWLER_ADMIN_KEY`.
- `/admin` engineering console remains unchanged unless a test explicitly requires compatible styling only.

- [ ] **Step 1: Write failing UI contract tests**

Assert unauthenticated root contains username/password/sign-in controls and does not contain portfolio data or `HOWLER_ADMIN_KEY`. Assert authenticated Penthouse markup also contains no product admin-key field.

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `npx vitest run test/contract/admin-ui.test.ts test/unit/field-dashboard.test.ts`
Expected: FAIL on current admin-key field behavior.

- [ ] **Step 3: Implement the login shell**

Keep it visually aligned with Penthouse but intentionally minimal: Howler identity, username, password, sign in, error/status region.

- [ ] **Step 4: Remove primary Penthouse admin-key dependency**

Refactor product fetch helpers so same-origin session cookies authenticate product API requests. Do not persist any product password or admin key in session/local storage.

- [ ] **Step 5: Keep diagnostics separated**

Ensure advanced admin/diagnostic Bearer tooling remains under engineering/admin surfaces, not the normal PM dashboard.

- [ ] **Step 6: Run targeted tests and typecheck**

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat(ui): gate Penthouse behind product login`

---

### Task 4: Automatic hydration and 12-16 project rendering

**Files:**
- Modify: `src/worker/admin.ts`
- Test: `test/unit/field-dashboard.test.ts`
- Test: `test/integration/penthouse-hydration.test.ts`

**Interfaces:**
- On mount, authenticated Penthouse calls `GET /v1/portfolio` automatically.
- Removes `DEFAULT_TRACKED_PROJECTS` as portfolio authority.
- Portfolio cards are rendered from server response and can display 12-16 active projects without code changes.

- [ ] **Step 1: Write failing hydration tests**

Assert:
- mount triggers portfolio fetch with zero button clicks
- no text says `Run Refresh to load project intelligence`
- no fixed seven-project literal controls portfolio membership
- 12 and 16 returned projects all render
- newly created server project appears after next hydration

- [ ] **Step 2: Run hydration tests and confirm RED**

Run: `npx vitest run test/unit/field-dashboard.test.ts test/integration/penthouse-hydration.test.ts`
Expected: FAIL against current tracked-project/sessionStorage behavior.

- [ ] **Step 3: Replace browser roster authority with server portfolio state**

Keep browser-only selected-project UI state if useful, but never use browser storage to decide which projects exist.

- [ ] **Step 4: Add explicit loading and hydrated states**

Penthouse shell may render immediately; project values appear only after the current portfolio response arrives.

- [ ] **Step 5: Keep full diagnostics lazy/on-demand**

Do not make 12-16 projects trigger heavy forecast/health/recovery workflows merely to populate the portfolio.

- [ ] **Step 6: Run targeted tests and commit**

Commit message: `feat(penthouse): auto-hydrate dynamic project portfolio`

---

### Task 5: Continuous freshness without manual refresh

**Files:**
- Modify: `src/worker/admin.ts`
- Test: `test/unit/field-dashboard.test.ts`
- Test: `test/integration/penthouse-live-sync.test.ts`

**Interfaces:**
- Background portfolio sync approximately every 15 seconds while visible.
- Immediate sync on focus/visibility return.
- Immediate sync after successful Genesis or natural-language mutation.
- Exposes truthful `Live` / `Last synced` / stale state.

- [ ] **Step 1: Write failing fake-timer tests**

Cover automatic interval refresh, focus refresh, no overlapping request storm, stale indicator on failure, automatic retry, and auth-expiry redirect/login behavior.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run test/integration/penthouse-live-sync.test.ts`
Expected: FAIL because no automatic synchronization loop exists.

- [ ] **Step 3: Implement one coalesced portfolio synchronization loop**

Use a single aggregate portfolio fetch per cycle. Skip/merge a tick if one is already in flight.

- [ ] **Step 4: Add immediate post-mutation synchronization**

After successful conversational confirm/update or Genesis commit, refresh canonical server state immediately rather than locally patching metrics.

- [ ] **Step 5: Add freshness honesty**

Keep last good values visible on transient error but mark them stale and retain the last-success timestamp. Recover automatically.

- [ ] **Step 6: Run targeted tests and commit**

Commit message: `feat(penthouse): keep active portfolio automatically synchronized`

---

### Task 6: Cloudflare bindings, safety gates, and full verification

**Files:**
- Modify: `wrangler.jsonc` only if non-secret metadata is required
- Modify: `worker-configuration.d.ts`
- Modify: `scripts/preflight-worker-secrets.ts`
- Modify: `.github/workflows/deploy.yml` if preflight secret list is sourced there
- Test: `test/safety/release-gate.test.ts`
- Test: `test/contract/v094-routes.test.ts` or the closest existing route-security suite

**Interfaces:**
- Deployment preflight verifies the dedicated session/auth secret bindings.
- Safety tests prove `HOWLER_MODE=shadow`, staging D1, admin/product auth separation, and no weakening of immutable history.

- [ ] **Step 1: Write failing preflight/safety tests**

Require the new session-signing and pilot credential verifier secrets while preserving existing confirmation/admin secrets.

- [ ] **Step 2: Implement minimal preflight/binding updates**

Do not put secret values in source or config.

- [ ] **Step 3: Run targeted safety tests**

Run: `npm run test:safety`
Expected: PASS.

- [ ] **Step 4: Run the canonical repository verification**

Run: `npm run verify`
Expected: PASS in canonical CI environment.

- [ ] **Step 5: Review diff for forbidden architectural regressions**

Confirm:
- no hardcoded seven-project authority remains in primary product path
- no browser admin-key dependency remains in Penthouse
- no forecasting math changed
- no immutable trigger/history weakening
- D1/staging/shadow bindings unchanged except new auth secret typings/preflight

- [ ] **Step 6: Commit**

Commit message: `chore(pilot): gate auth and live portfolio for staging release`

---

### Task 7: Controlled staging deployment and pilot acceptance smoke

**Files:**
- No code changes unless smoke exposes a defect.
- Evidence: GitHub Actions deploy run and browser smoke notes.

**Interfaces:**
- Deploy exact reviewed SHA through existing `Deploy Howler Staging` workflow only.

- [ ] **Step 1: Verify exact candidate SHA has green CI**

- [ ] **Step 2: Dispatch staging deploy for that exact branch/SHA**

- [ ] **Step 3: Verify deployment preflight and `jarvis-voice-staging` deployment both succeed**

- [ ] **Step 4: In a clean browser, verify login gate**

Unauthenticated root must show login only.

- [ ] **Step 5: Verify automatic live portfolio**

Login and confirm the current active portfolio appears without any Refresh click. Today's seven should appear because they are active server-side records, not because seven is encoded in the client.

- [ ] **Step 6: Verify scale behavior**

Exercise a controlled 12-16 project test dataset/environment path and confirm the same portfolio experience remains usable and automatically synchronized.

- [ ] **Step 7: Verify Genesis + natural update**

Create a fresh staging-only project, open its Index Card, submit a natural-language update, confirm the selected project and portfolio automatically refresh, and confirm a control project remains unchanged.

- [ ] **Step 8: Verify logout/re-entry**

Logout must clear access; reopening protected root requires login.

- [ ] **Step 9: Final gate**

Only after all checks pass use the release statement: `Cleared the safety gate and ready for controlled field testing.`
