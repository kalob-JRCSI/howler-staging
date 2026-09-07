# Howler Pilot Authentication + Live Portfolio Design

Date: 2026-09-07
Status: Approved design, revised for scalable PM portfolio
Branch: `claude/v096-contractor-hub`

## Purpose

Make Howler v0.9.6 behave like a real pilot platform rather than an engineering console.

A normal PM user must never paste `HOWLER_ADMIN_KEY` into the product dashboard or manually refresh project intelligence. The product flow is:

`login -> authenticated session -> automatically hydrated Penthouse -> continuously fresh portfolio`

The existing admin key remains an infrastructure/admin credential for scripts, staging administration, diagnostics, and emergency tooling.

## Portfolio scale requirement

The current seven projects are only the present pilot dataset. They are not an architectural limit and must not be hardcoded as the normal product portfolio.

Howler is designed for a PM or owner to comfortably operate **12-16 active projects concurrently per user**, with reasonable headroom beyond that without redesigning the dashboard or data model.

The normal product must therefore derive portfolio membership from server-side project ownership/visibility, not from:

- a seven-project constant
- browser `sessionStorage`
- manual add-project tracking
- seed scripts
- a fixed list embedded in the UI

A user's active portfolio is dynamic. When projects are created, completed, archived, assigned, or removed from that user's visibility, the portfolio returned by the server changes automatically.

## Pilot-readiness standard

Howler is not pilot-ready merely because endpoints, D1, or forecast reads work. A pilot build is ready only when a clean browser can complete the normal product journey without developer knowledge:

1. Open Howler.
2. See a branded login screen, not project data.
3. Sign in with the pilot account.
4. Land directly on an already-hydrated Penthouse.
5. See the current active portfolio without clicking Refresh.
6. Open an Index Card.
7. Create a project through Genesis.
8. Submit a natural-language project update.
9. See the selected project and portfolio update automatically.
10. Confirm unrelated projects remain unchanged.
11. Log out.
12. Reopening the protected app requires authentication again.

No admin key, raw JSON, manual refresh step, or developer instruction is allowed in the normal PM workflow.

## Authentication architecture

### Auth provider boundary

Introduce an authentication abstraction independent of the Penthouse UI:

```ts
interface AuthProvider {
  authenticate(username: string, password: string): Promise<AuthenticatedUser | null>;
}

interface AuthenticatedUser {
  id: string;
  displayName: string;
  role: string;
}
```

For v0.9.6 pilot, implement a single controlled pilot account. The dashboard consumes only `AuthenticatedUser`; it does not know whether authentication came from a pilot secret, D1 users, Microsoft, Google, Supabase, or another future provider.

Future named-user authentication replaces the provider, not the dashboard/session architecture.

### Session contract

Successful login creates a signed Howler user session cookie.

Cookie requirements:

- `HttpOnly`
- `Secure`
- `SameSite=Strict`
- `Path=/`
- finite expiration suitable for a workday pilot session

The signed session payload contains only non-secret identity/session claims such as:

```text
userId
displayName
role
issuedAt
expiresAt
```

Session signing uses a dedicated Worker secret, independent of `HOWLER_ADMIN_KEY` and `HOWLER_CONFIRMATION_SIGNING_SECRET`.

### Route behavior

```text
GET /
  valid Howler session -> Penthouse
  no/invalid session   -> Login
```

Product APIs use the authenticated user session. Existing controlled admin/script access remains available through `HOWLER_ADMIN_KEY` where backward compatibility is required.

The existing `/admin` engineering console remains separate from normal product use.

## Remove admin-key UX from Penthouse

The Penthouse must not render a `HOWLER_ADMIN_KEY` input.

Product fetches use same-origin session cookies automatically. Browser product code must not read, persist, reconstruct, or transmit the admin key.

## Dynamic portfolio architecture

### Server-derived active portfolio

Add a read-only server portfolio endpoint such as:

```text
GET /v1/portfolio
```

It returns the authenticated user's currently visible active projects, each represented by the existing derived project-summary machinery.

For the pilot, one user sees all active pilot projects. Later, named-user/org authorization can filter the same endpoint without changing the Penthouse contract.

The endpoint must not create a second source of project truth. It reads canonical project state and existing project-summary derivation.

### Scale target

The primary design target is 12-16 active projects per user.

To make that efficient, one background synchronization cycle should be portfolio-oriented, not 16 independent browser workflows. Prefer a single aggregate portfolio read that returns the compact summary required for the portfolio screen.

The response should remain compact enough for fast initial load and recurring synchronization. Full diagnostics and heavy detail remain lazy/on-demand per selected project.

The UI should support more than seven projects without layout changes through responsive cards/listing, sorting, and future filtering/search. No code path should assume a fixed count.

### Active versus archived/completed projects

The default Penthouse should represent the user's active working portfolio. Completed/archived projects should not permanently crowd the active dashboard. Their future archive/history surface can query them separately.

This keeps 12-16 concurrent projects operationally usable without conflating that with a user's lifetime project count.

## Automatic initial hydration

After successful login, the browser immediately requests the current portfolio from the server.

The authenticated Penthouse may render its shell immediately, but project cards must show an explicit loading state until current server data arrives. The product must never instruct the user to click Refresh to obtain initial intelligence.

Successful initial hydration populates current server-derived values including:

- project identity/name
- Project Integrity
- Progress
- budget state
- primary exposure
- next movement
- projected completion
- schedule/forecast information

No stale browser cache may masquerade as current project state.

## Continuous freshness

For the pilot, use automatic background synchronization rather than prematurely adding WebSocket/SSE infrastructure.

Required behavior:

- immediate portfolio fetch after authentication
- automatic background portfolio refresh approximately every 15 seconds while the tab is visible
- immediate refresh when the tab/window returns to focus
- immediate affected-project + portfolio refresh after every successful mutation
- immediate portfolio refresh after Genesis creates a project
- no overlapping refresh storms

This provides live operational behavior for 12-16 active projects without requiring manual refresh.

A later upgrade to SSE/WebSocket/server-push must be possible without changing the portfolio UI/data contract.

## Freshness honesty

The UI exposes a small synchronization indicator such as `Live` / `Last synced <time>`.

If a background refresh fails:

- keep the last successfully loaded data visible
- visibly mark it as temporarily stale/offline
- show the last successful sync time
- retry automatically
- never silently present stale data as live
- never require a manual Refresh click to recover

An authentication failure during synchronization returns the user to login.

## Mutation consistency

A successful natural-language update or confirmation triggers a fresh canonical summary read for the affected project and refreshes its portfolio representation immediately.

The browser must not locally patch Project Integrity, Progress, forecast, budget, or schedule values. Server-derived summary state remains authoritative.

Unrelated projects do not change unless their own canonical state changed.

## Genesis

After Genesis commit succeeds:

1. refresh the server-derived portfolio immediately
2. select/open the newly created project
3. render its Index Card from fresh server-derived summary state

The new project remains discoverable on later authenticated sessions because portfolio membership is server-derived, not browser-derived.

## Security boundaries

- `HOWLER_ADMIN_KEY` remains an admin/service secret and is not repurposed as a user password
- session signing uses an independent secret
- product sessions cannot call admin-only initialization/import/seed controls
- admin bearer access remains available to existing scripts where required
- session cookies are same-origin, secure, HTTP-only, and finite-lived
- login comparisons are timing-safe at the verifier boundary
- protected HTML and API responses remain `no-store`
- logout expires the browser session cookie

## Implementation boundaries

Expected responsibility areas:

- new auth/session module under `src/worker/`
- Worker route handling in `src/worker/index.ts`
- login page/client separate from normal Penthouse behavior
- Penthouse/field client in `src/worker/admin.ts` to remove admin-key dependency and primary manual-refresh behavior
- dynamic server portfolio endpoint using existing project-summary computation
- repository query for visible/active project IDs instead of a hardcoded seven-project roster
- Cloudflare env typings/config/preflight for new auth/session secret bindings
- unit/contract/integration/browser tests

Do not change forecasting math, project-event immutability, DeBoard lineage, canonical project history, or seven-project activation machinery as part of this task. The activation script may still seed today's seven pilot projects; that is operational setup, not product architecture.

## Testing requirements

Implementation is TDD.

Minimum coverage:

### Authentication

- unauthenticated `GET /` renders login, not Penthouse/project data
- valid pilot credentials create a secure signed session cookie
- invalid credentials do not create a session
- valid session renders Penthouse
- expired/tampered session is rejected
- logout expires the session
- product session cannot access admin-only routes
- existing admin bearer/script access remains valid where intended

### Dynamic portfolio

- no normal product test assumes exactly seven projects
- server portfolio result is derived dynamically from active visible projects
- 0, 1, 7, 12, and 16-project portfolios render correctly
- Genesis-created project appears without browser tracking
- completed/archived projects can be excluded from the default active portfolio

### Automatic hydration

- after login, portfolio fetch occurs automatically with zero Refresh click
- all visible active projects render from current server summaries
- empty/loading/error states do not misrepresent stale values as current

### Continuous freshness

- visible dashboard refreshes automatically on the configured interval
- focus/visibility return triggers immediate refresh
- successful mutation refreshes the affected project and portfolio automatically
- successful Genesis commit refreshes portfolio and opens the new Index Card
- refresh failure preserves last known data but marks it stale and retries
- auth expiry during synchronization returns to login
- no duplicate/overlapping refresh storm

### Isolation

- updating one project does not alter another project's summary unless server state changed
- diagnostics remain available separately
- admin key is absent from primary Penthouse markup/client state

## Pilot acceptance gate

Do not label the build pilot-ready until the deployed staging Worker passes, in a clean browser:

`login -> automatically hydrated dynamic portfolio -> Index Card -> Genesis -> natural update -> automatic selected-project/portfolio refresh -> control project unchanged -> logout -> protected re-entry`

Additionally verify:

- no admin key visible or requested in normal product use
- no normal-flow manual Refresh requirement
- synchronization indicator truthfully reflects current/stale state
- today's seven pilot projects load because they are the currently active portfolio, not because seven is hardcoded
- a 12-16-project test portfolio remains usable and automatically synchronized
- new projects survive a new browser session because portfolio membership is server-derived
- staging remains `HOWLER_MODE=shadow`
- D1 remains `howler-intelligence-staging`
- append-only/immutable history protections remain intact
