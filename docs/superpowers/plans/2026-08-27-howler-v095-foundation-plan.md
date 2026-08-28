# Howler v0.9.5 Foundation Recovery + One-Intent Operator Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the known-good v0.9.4 Howler engine as maintainable TypeScript, prove behavioral parity, then add a staging-only one-intent -> one-workflow -> one-result operator layer and a test-gated GitHub-to-Cloudflare deployment bridge.

**Architecture:** Wrangler bundles source from `src/worker/index.ts`. Recovered pure engine modules retain v0.9.4 behavior, a D1 repository owns persistence, and one deterministic application state machine (`OPERATOR_INTENT_V1`) coordinates authenticated intents without Cloudflare Workflows or external connectors. Existing routes remain compatibility adapters; new operator routes and the one-action UI call the same application services directly.

**Tech Stack:** Node.js `24.20.0` LTS, npm lockfile, TypeScript `6.0.3`, Vitest `4.1.1`, `@cloudflare/vitest-plugin` `1.1.0`, Wrangler `4.126.0`, ESLint `10.8.0`, `typescript-eslint` `8.68.0`, Prettier `3.9.6`, Cloudflare Workers, and the existing Cloudflare D1 database.

**Spec:** `docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md`

## Global constraints

- Treat commit `d851357bd08a795df3508ff610da9eaa1c386a43` as the sole v0.9.4 behavioral baseline.
- Recover v0.9.4 mechanically and pass the complete parity gate before adding `src/operator`, operator tables, operator routes, or the new UI.
- Keep `jarvis-voice` untouched. The only Worker deploy target is `jarvis-voice-staging`.
- Preserve binding `HOWLER_DB`, database `howler-intelligence-staging`, database ID `b1049979-11cc-4faa-9a94-a0f42f9f4f23`, and secret name `HOWLER_ADMIN_KEY`.
- Keep committed `HOWLER_MODE="shadow"`; keep `liveSystemsConnected=false`; add no Dashboard or Calendar integration, outbound domain/operator fetch, production environment, production credential, or production deployment.
- Preserve every existing v0.9.4 route, status, authentication rule, response field, D1 table, trigger, revision rule, append-only guarantee, publication gate, forecasting behavior, evidence behavior, oversight behavior, learning behavior, and recovery/protection behavior.
- Never mix a discovered v0.9.4 bug fix or algorithm change into recovery. Record it as a compatibility issue for separate approval.
- Make TypeScript, SQL migrations, tests, package lock, and Wrangler configuration the source of truth. Never commit, edit, upload, or document manual handling of a generated `worker.js` as a supported workflow.
- Use red-green-refactor for every behavior task: add one focused failing test, run it and record the expected failure, implement the minimum change, rerun the focused test, then run the relevant regression group.
- Keep commits narrow. Use the commit named at the end of each task and do not combine tasks across review checkpoints.
- Do not deploy while executing Tasks 1-17. Task 18 builds and validates the deployment workflow locally; an actual staging migration/deployment requires a separate explicit approval after this plan is implemented and reviewed.

## Target file map and boundaries

```text
.github/workflows/
  ci.yml                         # credential-free branch/PR validation
  deploy.yml                     # main-only, test-dependent staging deployment
.nvmrc                           # Node 24.20.0
.prettierignore
.prettierrc.json
eslint.config.mjs
package.json
package-lock.json
tsconfig.json
vitest.config.ts
worker-configuration.d.ts        # committed Wrangler-generated binding types
wrangler.jsonc                   # staging identifiers, TS entrypoint, shadow mode
migrations/
  0001_v094_baseline.sql         # byte-for-behavior v0.9.4 schema/trigger statements
  0002_operator_runs.sql         # additive operator tables only
src/
  domain/
    types.ts
    validation.ts
  engine/
    confidence.ts
    coverage.ts
    date.ts
    engine.ts
    graph.ts
    learning.ts
    metrics.ts
    oversight.ts
    reducer.ts
    solver.ts
    storage.ts
  operator/
    intent.ts                    # canonical public schemas and validation
    policy.ts                    # effect and staging safety assertions
    result.ts                    # immutable result construction
    workflow.ts                  # OPERATOR_INTENT_V1 state machine
  worker/
    admin.ts
    deboard-seed.ts
    hash.ts
    health.ts
    http.ts
    index.ts
    repository.ts
    understanding.ts
test/
  fixtures/v094/
    README.md                    # baseline commit/blob provenance and normalization rules
    deboard-seed.json
    initial-forecast.json
    masonry-preview.json
    masonry-apply-shadow.json
    recovery.json
    route-contracts.json
    schema.sql
  helpers/
    clock.ts
    d1.ts
    ids.ts
    requests.ts
  unit/
  integration/
  contract/
  safety/
docs/runbooks/
  staging-deploy-and-rollback.md
```

Boundary rules:

- `src/engine` and `src/domain` are deterministic and never import Worker environment types, D1, `fetch`, or operator modules.
- `src/operator` may call recovered engine/domain functions and repository interfaces, but never raw SQL, outbound `fetch`, or the publication transition.
- `src/worker/repository.ts` is the only application module that issues D1 SQL.
- `src/worker/index.ts` authenticates `/v1` before parsing or persistence and only maps HTTP to application services.
- Existing HTTP handlers call the same recovered services directly; they do not call the Worker over HTTP.
- All time, UUID, request-ID, and retry decisions enter through injected interfaces in tests.

Preserved route matrix (the compatibility contract for Tasks 8-9 and 15):

| Route | Authentication | Required preservation |
|---|---|---|
| `GET /`, `GET /admin` | Existing page access behavior | Same routes/security headers; body changes only in Task 16 |
| `GET /health` | Public | Existing fields/status plus additive v0.9.5 readiness/safety fields |
| `POST /v1/admin/init-db` | Bearer `HOWLER_ADMIN_KEY` | Existing response fields; idempotent migration readiness is additive |
| `POST /v1/projects/deboard-v091/seed` | Bearer `HOWLER_ADMIN_KEY` | Existing seed behavior and response |
| `GET /v1/projects/:projectId/forecast` | Bearer `HOWLER_ADMIN_KEY` | Existing latest/published/model-revision contract |
| `GET /v1/projects/:projectId/forecast/health` | Bearer `HOWLER_ADMIN_KEY` | Existing health calculation/contract |
| `GET /v1/projects/:projectId/forecast/recovery` | Bearer `HOWLER_ADMIN_KEY` | Existing recovery/protection contract |
| `GET /v1/projects/:projectId/events` | Bearer `HOWLER_ADMIN_KEY` | Existing ordering/contract |
| `GET /v1/projects/:projectId/learning` | Bearer `HOWLER_ADMIN_KEY` | Existing learning/outcomes contract |
| `POST /v1/projects/:projectId/understanding/preview` | Bearer `HOWLER_ADMIN_KEY` | Existing validation/preview contract |
| `POST /v1/projects/:projectId/events/preview` | Bearer `HOWLER_ADMIN_KEY` | Existing preview/oversight contract |
| `POST /v1/projects/:projectId/events/apply-shadow` | Bearer `HOWLER_ADMIN_KEY` | Existing revision-safe shadow transition |
| `POST /v1/projects/:projectId/events/publish` | Bearer `HOWLER_ADMIN_KEY` | Always `403` while mode is shadow |

New route matrix (additive in Task 15):

| Route | Success/conflict contract |
|---|---|
| `POST /v1/intents` | `201` new terminal success, `200` completed replay, `202` interrupted/resumable, `409` idempotency/revision conflict |
| `GET /v1/workflows/:workflowId` | Authenticated run plus ordered step status; `404` when absent |
| `GET /v1/results/:resultId` | Authenticated immutable result; `404` when absent |
| `POST /v1/workflows/:workflowId/resume` | Advance only an eligible interrupted run; never override a business block/revision |

## Required verification commands

These scripts are established in Task 1 and remain the canonical local/CI interface:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:parity
npm run test:safety
npm test
npm run cf-typegen
git diff --exit-code -- worker-configuration.d.ts
npm run build:dry
```

`npm test` must run every test group. No script may suppress a failing exit code. The dry build must write only to an ignored `dist/` directory and must not contact or deploy to Cloudflare.

---

## Task 1: Establish the pinned, source-first development harness

**Files:**

- Create: `.nvmrc`
- Create: `.prettierignore`
- Create: `.prettierrc.json`
- Create: `eslint.config.mjs`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `test/helpers/clock.ts`
- Create: `test/helpers/ids.ts`
- Create: `test/unit/harness.test.ts`
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `wrangler.jsonc`
- Create: `worker-configuration.d.ts`

- [ ] Add `test/unit/harness.test.ts` with a fixed clock (`2026-08-27T12:00:00.000Z`) and deterministic ID sequence; assert both helpers return stable values.
- [ ] Run `npm test -- test/unit/harness.test.ts`. Expected result: failure because Vitest/config/helpers do not exist.
- [ ] Pin the versions in the header exactly, add `engines.node="24.20.0"`, and add scripts for `format:check`, `lint`, `typecheck`, each test group, aggregate `test`, `cf-typegen`, and `build:dry`.
- [ ] Configure TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noEmit`, and Worker library types. Configure Vitest through `@cloudflare/vitest-plugin` in an isolated local Workers runtime.
- [ ] Set `wrangler.jsonc.main` to `src/worker/index.ts`, preserve the current compatibility date unless a tested API requires a later date, retain the exact Worker/D1 identifiers, set that binding's `migrations_dir` to `migrations`, and add only `[vars].HOWLER_MODE="shadow"`. Do not add a production environment, route, auto-provisioned resource, or compatibility flag.
- [ ] Generate and commit `worker-configuration.d.ts`; make CI regenerate it and fail on drift.
- [ ] Implement the two deterministic helpers and make the harness test pass.
- [ ] Run `npm ci`, all static checks, the focused test, type generation plus drift check, and `npm run build:dry`. The dry build may fail only because the source entrypoint does not yet exist; record that expected condition and do not weaken the script.
- [ ] Commit: `build: establish pinned TypeScript worker toolchain`

## Task 2: Freeze the v0.9.4 characterization corpus

**Files:**

- Create: `test/fixtures/v094/README.md`
- Create: `test/fixtures/v094/deboard-seed.json`
- Create: `test/fixtures/v094/initial-forecast.json`
- Create: `test/fixtures/v094/masonry-preview.json`
- Create: `test/fixtures/v094/masonry-apply-shadow.json`
- Create: `test/fixtures/v094/recovery.json`
- Create: `test/fixtures/v094/route-contracts.json`
- Create: `test/fixtures/v094/schema.sql`
- Create: `test/parity/fixture-integrity.test.ts`

- [ ] Inspect `worker.js` directly from Git commit `d851357bd08a795df3508ff610da9eaa1c386a43`; do not copy it into the v0.9.5 tree or deploy it. Record the baseline commit, Git blob ID, bundle SHA-256, fixed clock, fixed IDs, and the exact nondeterministic-field normalization rules in the fixture README.
- [ ] Derive the DeBoard seed, initial forecast, masonry supersession preview/apply, recovery/protection, route contract, and v0.9.4 schema/trigger fixtures from that immutable baseline. Preserve observable array ordering and values; normalize only request IDs and injected timestamps named in the README.
- [ ] Add an integrity test that checks every required fixture exists, parses, declares `engineCompatibilityVersion: "0.9.4"`, and has the recorded content SHA-256.
- [ ] Run `npm run test:parity -- test/parity/fixture-integrity.test.ts`. Expected result: failure until every fixture and hash is present.
- [ ] Complete the corpus, rerun the integrity test, and independently compare the route inventory and SQL trigger names against the historical bundle.
- [ ] Commit: `test: freeze v0.9.4 characterization fixtures`

## Task 3: Recover domain types, validation, dates, and graph behavior

**Files:**

- Create: `src/domain/types.ts`
- Create: `src/domain/validation.ts`
- Create: `src/engine/date.ts`
- Create: `src/engine/graph.ts`
- Create: `test/unit/validation.test.ts`
- Create: `test/unit/date.test.ts`
- Create: `test/unit/graph.test.ts`

- [ ] Write failing tests for project validation, event mutation discriminants, duplicate IDs, dependency-cycle detection, working-day addition/subtraction, invalid dates, and v0.9.4 ordering.
- [ ] Assert the public `*V094` interfaces are specific discriminated types, not `unknown` or arbitrary JSON. Cover every event mutation found in the baseline bundle.
- [ ] Run the three focused test files. Expected result: unresolved imports.
- [ ] Transcribe types and logic mechanically from the baseline modules. Preserve error/warning text, validation order, default values, and graph traversal order.
- [ ] Run focused tests, then `npm run test:unit` and `npm run typecheck`.
- [ ] Commit: `feat: recover v0.9.4 domain validation and graph primitives`

## Task 4: Recover confidence, coverage, metrics, and learning

**Files:**

- Create: `src/engine/confidence.ts`
- Create: `src/engine/coverage.ts`
- Create: `src/engine/metrics.ts`
- Create: `src/engine/learning.ts`
- Create: `test/unit/confidence.test.ts`
- Create: `test/unit/coverage.test.ts`
- Create: `test/unit/metrics.test.ts`
- Create: `test/unit/learning.test.ts`

- [ ] Add table-driven failing tests for every score threshold, fallback, freshness band, superseded-source rule, truth-state mapping, warning boundary, metric aggregation, and learning/prediction outcome represented in v0.9.4.
- [ ] Include exact boundary inputs so accidental `<`/`<=`, rounding, or default changes fail clearly.
- [ ] Run the focused files. Expected result: unresolved module imports.
- [ ] Recover the four modules without changing constants, numeric precision, array ordering, or warning text.
- [ ] Run focused tests, the fixture integrity test, all unit tests, and typecheck.
- [ ] Commit: `feat: recover v0.9.4 confidence coverage metrics and learning`

## Task 5: Recover reducer, storage helpers, and forecast engine

**Files:**

- Create: `src/engine/reducer.ts`
- Create: `src/engine/storage.ts`
- Create: `src/engine/engine.ts`
- Create: `test/unit/reducer.test.ts`
- Create: `test/unit/storage.test.ts`
- Create: `test/parity/forecast.test.ts`

- [ ] Add failing reducer tests for every v0.9.4 event type/mutation, source supersession, evidence lineage, impact-cone calculation, append ordering, and no-op/error behavior.
- [ ] Add a failing golden test that runs the fixed DeBoard model through the forecast engine and deep-compares versions, dates/ranges, critical flags, confidence, coverage, warnings, deltas, and completion to `initial-forecast.json`.
- [ ] Run focused tests. Expected result: missing recovered modules.
- [ ] Recover reducer/storage/engine code mechanically; pass clocks and IDs as dependencies where the bundle previously read ambient state.
- [ ] Run focused tests and all parity/unit tests. Any golden difference is a recovery defect unless the approved fixture itself is proven wrong against the baseline.
- [ ] Commit: `feat: recover v0.9.4 reducer and forecast engine`

## Task 6: Recover oversight, solver, and recovery/protection behavior

**Files:**

- Create: `src/engine/oversight.ts`
- Create: `src/engine/solver.ts`
- Create: `test/unit/oversight.test.ts`
- Create: `test/unit/solver.test.ts`
- Create: `test/parity/recovery.test.ts`

- [ ] Add failing tests for oversight decisions/findings/publication eligibility, working/proposed/published gates, recovery status, protection actions, standby levers, risk dates, capacity, and critical-path alternatives.
- [ ] Add a fixed-input golden test against `recovery.json`.
- [ ] Run focused tests. Expected result: unresolved imports.
- [ ] Recover oversight and solver code without tuning rules, weights, strings, sort order, or publication semantics.
- [ ] Run focused tests, all unit/parity tests, and typecheck.
- [ ] Commit: `feat: recover v0.9.4 oversight and recovery solver`

## Task 7: Recover D1 schema and repository semantics

**Files:**

- Create: `migrations/0001_v094_baseline.sql`
- Create: `src/worker/repository.ts`
- Create: `test/helpers/d1.ts`
- Create: `test/integration/migrations-v094.test.ts`
- Create: `test/integration/repository-v094.test.ts`
- Create: `test/integration/revision-guards.test.ts`

- [ ] Write failing migration tests that apply `0001_v094_baseline.sql` to an empty isolated D1 database and compare tables, columns, indexes, triggers, and trigger SQL to `test/fixtures/v094/schema.sql`. Give every test a unique temporary local D1 persistence directory and delete it after the test; never reuse a developer's default `.wrangler/state`.
- [ ] Write failing repository tests for seed idempotency, latest/published snapshots, events, learning records, prediction outcomes, append-only rejection, atomic shadow batches, optimistic revisions, and concurrent stale revisions.
- [ ] Run the three focused integration files. Expected result: missing migration/repository.
- [ ] Extract the v0.9.4 schema statements without renaming or semantic cleanup. Recover repository SQL exactly, then wrap it in typed methods. Route handlers must not receive raw D1 handles after this task.
- [ ] Verify an upgrade test that starts with the frozen v0.9.4 schema/data and reapplies `0001` without deletion or mutation.
- [ ] Run all integration/parity/unit tests and typecheck.
- [ ] Commit: `feat: recover v0.9.4 D1 schema and repository`

## Task 8: Recover HTTP, authentication, seed, understanding, and health

**Files:**

- Create: `src/worker/hash.ts`
- Create: `src/worker/http.ts`
- Create: `src/worker/deboard-seed.ts`
- Create: `src/worker/understanding.ts`
- Create: `src/worker/health.ts`
- Create: `test/unit/hash.test.ts`
- Create: `test/unit/http.test.ts`
- Create: `test/parity/seed-and-understanding.test.ts`
- Create: `test/contract/health.test.ts`

- [ ] Add failing tests for stable canonical hash ordering, constant-time bearer comparison, bounded JSON parsing, content types, CORS/security headers, structured errors/request IDs, DeBoard seed outputs, understanding proposal validation, and health readiness.
- [ ] Assert health reports service `0.9.5`, engine compatibility `0.9.4`, `HOWLER_MODE="shadow"`, `liveSystemsConnected=false`, Dashboard disconnected, Calendar disconnected, and only whether the admin secret is configured.
- [ ] Run focused tests. Expected result: missing modules.
- [ ] Recover the v0.9.4 modules and add only the approved diagnostic fields. Never log the bearer token or complete evidence payload.
- [ ] Run focused tests and all unit/parity/contract tests.
- [ ] Commit: `feat: recover v0.9.4 worker primitives and health`

## Task 9: Restore all v0.9.4 routes and reach the parity gate

**Files:**

- Create: `src/worker/admin.ts`
- Create: `src/worker/index.ts`
- Create: `test/contract/v094-routes.test.ts`
- Create: `test/parity/masonry-transition.test.ts`
- Create: `test/safety/v094-safety.test.ts`

- [ ] Add a failing route-inventory test for all 14 preserved routes, including public `GET /health`, authenticated `/v1`, unauthorized no-persistence, bounded body rejection, and shadow publication `403`.
- [ ] Deep-compare the fixed masonry preview and apply-shadow responses to their golden fixtures, including supersession, impact activities, delta, oversight, forecast version, revision, and publication eligibility.
- [ ] Add safety tests proving domain code has no `fetch`, no route can publish in shadow mode, append-only guards remain active, and the exact Worker/D1 identifiers remain committed.
- [ ] Run contract/parity/safety tests. Expected result: missing router/admin or unregistered routes.
- [ ] Recover the v0.9.4 router and compatibility admin page without operator features. Keep existing route response fields and status codes; add only approved health/init readiness fields.
- [ ] Run every required verification command from this plan. `npm run build:dry` must now succeed and create a TypeScript-built artifact without a checked-in `worker.js`.
- [ ] Compare normalized outputs against all frozen fixtures and record the parity command/output in the commit message body.
- [ ] Commit: `feat: restore v0.9.4 worker from maintainable TypeScript`

### Review checkpoint A: recovered foundation

- [ ] Stop operator-layer work until a reviewer confirms: all frozen v0.9.4 parity/contract tests pass; no existing contract or identifier changed; no baseline algorithm was “improved”; the generated artifact comes only from TypeScript; and safety assertions pass.
- [ ] If parity cannot be proven, fix recovery in Tasks 3-9 with focused commits. Do not weaken fixtures or proceed by documenting a known failure.

## Task 10: Establish credential-free deterministic CI

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `test/safety/repository-policy.test.ts`

- [ ] Add a failing repository-policy test that inspects committed workflow/config text and rejects Cloudflare secrets in branch/PR jobs, production terms/targets, `jarvis-voice` as a deploy target, checked-in `worker.js`, non-dry deploy commands outside the deployment job, and manual bundle shuttle instructions/scripts.
- [ ] Create CI triggers for every branch push and every pull request. Pin `actions/checkout@v6.0.2`, `actions/setup-node@v6.0.0` with Node `24.20.0` and npm cache, and `actions/upload-artifact@v4.6.2`; then run `npm ci`, lockfile cleanliness, binding type drift, format, lint, typecheck, all tests, and `build:dry`.
- [ ] Upload the dry bundle/manifest and a SHA-256 manifest with the pinned artifact action; no CI validation step may receive Cloudflare credentials or contact a remote D1/Worker.
- [ ] Add concurrency that cancels older validation for the same branch/PR, without sharing concurrency with deployment.
- [ ] Run a local action syntax check where available, all required verification commands, and the repository-policy test.
- [ ] Commit: `ci: validate source tests safety and dry build`

### Review checkpoint B: CI foundation

- [ ] Require the CI job as the branch-protection check before proceeding. If repository settings cannot yet be changed, record that external precondition and still require a green workflow run on the implementation branch.

## Task 11: Define canonical intent, workflow, result, and policy types

**Files:**

- Create: `src/operator/intent.ts`
- Create: `src/operator/policy.ts`
- Create: `src/operator/result.ts`
- Create: `src/operator/workflow.ts`
- Create: `test/unit/operator-intent.test.ts`
- Create: `test/unit/operator-policy.test.ts`
- Create: `test/unit/operator-result.test.ts`
- Create: `test/unit/workflow-transitions.test.ts`

- [ ] Transcribe the normative `IntentV1`, `WorkflowRunV1`, `WorkflowStepV1`, `WorkflowProblem`, `ResultV1`, and `IntentSubmissionResponseV1` interfaces from the spec without renaming or widening fields.
- [ ] Add failing tests for every intent kind/effect/payload combination, UUID/key/timestamp/revision rule, event/intent project-revision equality, and rejection of publication/external effects.
- [ ] Add failing state-machine tests for exactly the allowed transitions and rejection of every invalid transition. Assert terminal `BLOCKED`, `FAILED`, and `SUCCEEDED` each require one result; `INTERRUPTED` requires no result and a retryable problem.
- [ ] Add failing result tests proving the safety object is server-created and always equals shadow/staging/no-live/no-production values.
- [ ] Implement pure validation, transition, policy, and result-construction functions only; do not add SQL or routes.
- [ ] Run focused tests, all unit/parity/safety tests, and typecheck.
- [ ] Commit: `feat: define v1 operator contracts and safety policy`

## Task 12: Add expand-only operator persistence and idempotent claims

**Files:**

- Create: `migrations/0002_operator_runs.sql`
- Modify: `src/worker/repository.ts`
- Modify: `src/worker/index.ts`
- Create: `test/integration/migrations-operator.test.ts`
- Create: `test/integration/operator-idempotency.test.ts`
- Create: `test/integration/operator-immutability.test.ts`
- Modify: `test/contract/v094-routes.test.ts`

- [ ] Add a failing migration test that upgrades both an empty database after `0001` and a populated frozen v0.9.4 database. Assert all existing schema SQL is byte-for-semantic equivalent and all existing data remains unchanged.
- [ ] Assert `operator_intents` has unique `intent_id` and `(project_id,idempotency_key)`; `workflow_runs` is one-to-one with intent; `workflow_steps` is unique by `(workflow_id,step_name)`; `workflow_results` has unique result/workflow/intent IDs; intent/result rows are immutable.
- [ ] Add concurrent failing tests: a new claim wins once; same key/hash reuses; same key/different hash gives `IDEMPOTENCY_KEY_REUSE`; same intent ID/different hash gives `INTENT_ID_REUSE`; the losing concurrent request loads the winning run.
- [ ] Implement additive SQL and typed repository methods. Hash canonical JSON with sorted object keys and preserved array order. Never persist the admin key.
- [ ] Make the compatibility init-db handler apply/check the committed migration statements idempotently, preserve every existing response field, and add operator-table readiness only as a new field. Test the runtime statements against `0001` and `0002` so the route cannot drift from migration source.
- [ ] Run focused integration tests, the v0.9.4 migration/repository tests, all parity tests, and typecheck.
- [ ] Commit: `feat: add additive operator run persistence`

## Task 13: Implement read-only and preview workflow execution

**Files:**

- Modify: `src/operator/workflow.ts`
- Modify: `src/operator/result.ts`
- Modify: `src/worker/repository.ts`
- Create: `test/integration/workflow-readonly.test.ts`
- Create: `test/integration/workflow-preview.test.ts`
- Create: `test/integration/workflow-interruption.test.ts`

- [ ] Add failing end-to-end application tests for `FORECAST_QUERY`, `FORECAST_HEALTH_QUERY`, `RECOVERY_QUERY`, and `EVIDENCE_PREVIEW`. Each valid intent must create exactly one intent, one run, the ordered applicable steps, and one immutable successful result with `persisted=false`.
- [ ] Assert the canonical step order: `RECEIVE`, `VALIDATE`, `AUTHORIZE_POLICY`, `LOAD_PROJECT`, `CHECK_REVISION`, `PREPARE`, `EXECUTE_ENGINE`, `COMMIT_SHADOW`, `BUILD_RESULT`, `FINALIZE`; conditional steps must be explicit `SKIPPED`, not absent.
- [ ] Inject two transient D1 read failures and assert bounded retry success; inject a third total workflow-attempt failure and assert terminal `RETRY_EXHAUSTED`. Assert no unbounded sleep.
- [ ] Implement the application state machine with injected clock/IDs/repository, input/output hashes, serializable checkpoints, and `maxAttempts=3`. Use direct recovered engine calls, never self-HTTP.
- [ ] Run focused tests, then all integration/parity/safety tests.
- [ ] Commit: `feat: execute resumable read and preview workflows`

## Task 14: Implement revision-safe shadow mutation and resumability

**Files:**

- Modify: `src/operator/workflow.ts`
- Modify: `src/operator/policy.ts`
- Modify: `src/worker/repository.ts`
- Create: `test/integration/workflow-apply-shadow.test.ts`
- Create: `test/integration/workflow-revision-conflict.test.ts`
- Create: `test/integration/workflow-resume.test.ts`
- Create: `test/integration/workflow-ambiguous-commit.test.ts`

- [ ] Add failing tests that a valid `EVIDENCE_APPLY_SHADOW` runs internal preview and oversight, commits the event/non-published forecast/review atomically, advances one revision, and returns one `SHADOW_TRANSITION` result with `persisted=true`.
- [ ] Assert oversight `BLOCK` creates terminal `BLOCKED`, one immutable result, and no domain mutation.
- [ ] Assert stale or racing revisions produce terminal `BLOCKED`, HTTP-mappable `REVISION_CONFLICT`, current revision details, and no domain mutation. Resume may not alter the immutable expected revision.
- [ ] Assert a duplicate/retry after committed-domain-before-finalize reconstructs the same result from stable event/revision/forecast/review IDs and never advances a second revision. Keep write and reconciliation reads on the existing primary `HOWLER_DB` binding; do not add a replica binding, cache, or eventually consistent store.
- [ ] Assert ambiguous commit evidence yields terminal, non-resumable `FAILED/COMMIT_STATE_AMBIGUOUS`; assert a short guarded D1 lease/version permits only one concurrent resumer.
- [ ] Implement `COMMIT_SHADOW` as the only operator domain mutation and prohibit `commitForecastTransition` at the type boundary and in a safety source scan.
- [ ] Run focused tests, all v0.9.4 parity tests, all integration/safety tests, and typecheck.
- [ ] Commit: `feat: add revision-safe shadow workflow commit and resume`

## Task 15: Expose additive operator HTTP contracts

**Files:**

- Modify: `src/worker/index.ts`
- Modify: `src/worker/http.ts`
- Create: `test/contract/operator-routes.test.ts`
- Modify: `test/contract/v094-routes.test.ts`

- [ ] Add failing contract tests for `POST /v1/intents`, `GET /v1/workflows/:workflowId`, `GET /v1/results/:resultId`, and `POST /v1/workflows/:workflowId/resume`.
- [ ] Cover `201` new completed, `200` completed duplicate with `replayed=true`, `202` interrupted/resumable, deterministic `409` idempotency/revision conflicts, structured terminal failure, `404`, malformed request before run creation, and unauthorized request before parsing/persistence.
- [ ] Assert existing route inventory and exact v0.9.4 response fixture shapes still pass unchanged.
- [ ] Implement thin route adapters and error/status mapping; return no stack traces or secrets.
- [ ] Run all contract, integration, parity, safety, and type checks.
- [ ] Commit: `feat: expose authenticated operator workflow routes`

### Review checkpoint C: operator backend

- [ ] Stop UI work until review confirms one accepted intent maps to exactly one run/result, duplicates cannot mutate twice, blocked/failed/interrupted semantics match the spec, all v0.9.4 parity tests remain green, and no live/publication path exists.

## Task 16: Replace the admin workflow with one action

**Files:**

- Modify: `src/worker/admin.ts`
- Create: `test/unit/admin-ui.test.ts`
- Create: `test/contract/admin-ui.test.ts`

- [ ] Add a failing rendered-HTML test for persistent `STAGING / SHADOW / NO LIVE SYSTEMS`, admin key, project ID, supported intent selector, conditional evidence/revision fields, exactly one enabled workflow submit control labeled `Run intent`, and one workflow/result panel.
- [ ] Execute the inline client script in a minimal test DOM with stubbed `sessionStorage`, `crypto.randomUUID`, and `fetch`; dispatch one form submit and assert exactly one `POST /v1/intents`, stable client-generated intent/idempotency/timestamp across a simulated retry, and one rendered result.
- [ ] Assert the admin key remains session-only and is sent only as `Authorization: Bearer`; assert there are no routine init/seed buttons, preview/apply chains, Dashboard/Calendar controls, connector placeholders, or calls to legacy mutation routes.
- [ ] Implement the accessible same-origin page. Intent kind selection is explicit; `EVIDENCE_APPLY_SHADOW` never arises by escalation from preview.
- [ ] Run focused UI tests, all contract/parity/safety tests, format, lint, and typecheck.
- [ ] Commit: `feat: replace staging admin flow with one-intent action`

## Task 17: Complete observability, safety, and release regression gates

**Files:**

- Modify: `src/worker/index.ts`
- Modify: `src/worker/health.ts`
- Modify: `wrangler.jsonc`
- Create: `test/safety/staging-invariants.test.ts`
- Create: `test/safety/no-live-integrations.test.ts`
- Create: `test/integration/operator-audit.test.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] Add failing static/runtime tests asserting exact staging identifiers, `HOWLER_MODE="shadow"`, `liveSystemsConnected=false`, Dashboard/Calendar disconnected, no production env/job/route/credential, no outbound execution-path fetch, no operator publication call, and all v0.9.4 routes registered.
- [ ] Add audit tests for structured `requestId`, `intentId`, `workflowId`, `resultId`, project, step, state, attempt, duration, and problem code; assert admin key and full sensitive payloads never appear.
- [ ] Enable committed staging Worker logs at a `1.0` head-sampling rate. Do not add traces or external log sinks in this foundation; reduce sampling later only through a reviewed config change backed by observed staging volume.
- [ ] Ensure CI executes every parity, migration, UI, contract, workflow, and safety test explicitly before dry build/artifact hashing.
- [ ] Run the full required verification command set twice from clean `npm ci` state and compare bundle hashes for deterministic output. If hashes differ, identify and remove nondeterministic build input before continuing.
- [ ] Commit: `test: enforce v095 staging safety and release gates`

## Task 18: Build the test-gated staging deployment bridge and rollback runbook

**Files:**

- Modify: `.github/workflows/deploy.yml`
- Create: `docs/runbooks/staging-deploy-and-rollback.md`
- Modify: `package.json`
- Modify: `test/safety/repository-policy.test.ts`

- [ ] Add failing policy tests that require deployment only on `main` after the full validation job, GitHub environment `staging`, staging concurrency, exact target rejection of `jarvis-voice`, migration-before-deploy, exact tested commit/artifact metadata, and post-deploy safety smoke assertions. Reject every production target or bypass path.
- [ ] Rework `deploy.yml` so push-to-`main` is the only automatic trigger. Define a credential-free `validate` job that runs the same canonical commands as `ci.yml`, then a `deploy-staging` job with `needs: validate`, `environment: staging`, and a staging-only concurrency group. If `workflow_dispatch` remains, it must enter those same jobs and cannot skip tests, migrations, target checks, or smoke checks.
- [ ] Use the lockfile-installed Wrangler `4.126.0` through npm scripts; do not use an unpinned global Wrangler or manually upload a bundle. Pass only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the deployment job.
- [ ] Add a preflight script/step that parses `wrangler.jsonc` and fails unless Worker, binding, database name/ID, and mode exactly match the global constraints and no production environment exists.
- [ ] Before the first authorized staging run, list remote migration history and compare the live schema fingerprint to the frozen v0.9.4 schema. Because `0001` uses idempotent `IF NOT EXISTS` statements, allow Wrangler to record it only after the fingerprint matches; stop on any drift instead of editing live schema or migration history manually.
- [ ] Apply only pending committed migrations with `wrangler d1 migrations apply HOWLER_DB --remote`; retain Wrangler's automatic pre-migration backup evidence in the job summary. Then deploy the exact checked-out/tested `main` commit. Do not run either command while implementing this plan.
- [ ] Require repository/environment secret `HOWLER_STAGING_URL` for a post-deploy `GET /health`; assert HTTP success, service `0.9.5`, engine compatibility `0.9.4`, D1 readiness, mode shadow, and all no-live flags. The workflow must fail closed if the URL is unset or points outside the reviewed staging host.
- [ ] Record commit SHA, artifact SHA-256, migration filenames, Cloudflare version ID, and staging URL in the GitHub job summary.
- [ ] Document rollback: halt the staging concurrency gate; identify the exact previous recorded `jarvis-voice-staging` version ID; verify the preserved D1 binding/resource still exists unchanged; run Wrangler rollback with that version ID and explicit `--name jarvis-voice-staging`; leave additive D1 tables; rerun health; record incident. Document migration failure as repair-forward and bad evidence as a reviewed compensating staging event. Prohibit destructive SQL and local `worker.js` restoration.
- [ ] Run policy tests, workflow syntax validation, all required verification commands, and `npm run build:dry`. Do not authenticate, migrate remote D1, deploy, smoke-test a live endpoint, or inspect production.
- [ ] Commit: `ci: add test-gated staging deploy and rollback runbook`

### Review checkpoint D: deployment readiness

- [ ] Review the complete diff and CI evidence before requesting live staging authorization.
- [ ] Verify outside the checkout, with explicit permission: the `staging` GitHub environment protection settings; the existing token's least-privilege Worker/D1 scope; and the exact existing staging URL to store as `HOWLER_STAGING_URL`. Do not broaden permissions or change routes without approval.
- [ ] Obtain separate explicit approval before applying `0002` to remote staging D1 or deploying `jarvis-voice-staging`.

## Task 19: Final clean-room acceptance (no deployment)

**Files:**

- Modify only files required to correct a failed acceptance test; use a separate focused commit for each correction.

- [ ] Start from a clean checkout of the implementation branch with no `node_modules`, `dist`, generated untracked files, or Cloudflare credentials in the job environment.
- [ ] Run `npm ci` and the complete required verification command set.
- [ ] Apply `0001` + `0002` to an empty local D1 database and to a frozen populated v0.9.4 local fixture; prove existing rows/schema semantics survive.
- [ ] Replay all golden v0.9.4 scenarios and every operator scenario: new, duplicate, key reuse, intent-ID reuse, stale revision, oversight block, transient interruption, retry exhaustion, committed-before-finalize resume, and ambiguous commit.
- [ ] Inspect the dry artifact/manifest and confirm no `worker.js` is tracked, no production target exists, and no live Dashboard/Calendar code or secrets are present.
- [ ] Confirm `git status --short` is empty and CI is green. Produce a release-readiness report containing exact command outputs, commit SHA, artifact hash, migration set, and the three still-unexecuted live steps: environment verification, remote staging migration, and staging deployment/smoke.
- [ ] Commit only if an acceptance defect required a fix; otherwise do not create an empty commit.

## Requirement-to-task traceability

| Approved requirement | Planned proof |
|---|---|
| Recover v0.9.4 before new functionality | Tasks 2-9; hard Checkpoint A before Task 11 |
| Preserve forecasting/evidence/oversight/recovery/protection | Tasks 3-9 golden/unit/integration tests |
| Preserve D1/revisions/publication gates | Tasks 7, 9, 12, 14, 17 |
| Canonical intent/workflow/result schemas | Task 11 |
| One intent -> one run -> one result | Tasks 12-15 |
| Idempotency/duplicates/conflicts/retries/states/resume | Tasks 12-15 and Task 19 |
| Staging-only mutation | Tasks 11, 14, 17 |
| One-action UI | Task 16 |
| TypeScript source of truth; no manual `worker.js` | Tasks 1, 9, 10, 18, 19 |
| Automated regression protection | Tasks 2-10 and Task 19 |
| Branch/PR CI | Task 10 |
| Test-gated `jarvis-voice-staging` deployment only | Task 18; live execution separately approved |
| Rollback/recovery | Task 18 |
| Preserve identifiers/contracts | Global constraints; Tasks 7, 9, 15, 17, 18 |
| Shadow/no live/no production safety | Tasks 8, 9, 11, 14, 17-19 |
| No Cloudflare Workflows/live integrations/unrelated refactor | Boundary rules and safety scans in Tasks 9, 17, 19 |

## Conservatively resolved implementation decisions

1. Pin Node `24.20.0` LTS and exact npm dependency versions listed in the header; update only through reviewed lockfile commits after CI proves compatibility.
2. Keep the current Wrangler compatibility date `2026-08-26` unless a focused, tested source API requires a later date.
3. Commit `worker-configuration.d.ts`; regenerate it in CI and fail if Git differs.
4. Use the existing Worker plus D1 application state machine; do not introduce Cloudflare Workflows, Queues, Durable Objects, or a new binding.
5. Use additive `0002_operator_runs.sql`; do not alter the six historical tables/triggers or create reverse/destructive migrations.
6. Use full (`1.0`) staging log head sampling initially and no external sink/tracing. This maximizes recovery evidence at low staging volume without adding a system connection.
7. Use the lockfile-installed Wrangler directly in GitHub Actions instead of a second Wrangler action/version surface.
8. Test the inline one-action UI with a minimal deterministic DOM/fetch harness rather than adding a browser automation dependency.
9. Treat GitHub environment settings, token scope, and staging URL as deployment preconditions to verify with permission, never values inferred or changed by repository code.

## Decisions still requiring explicit approval

No application architecture decision remains open. Three live/environment actions require separate approval after Tasks 1-19 are complete and green:

1. Inspect and, only if requested, adjust GitHub environment protection and existing staging token scope.
2. Register the verified existing staging host as `HOWLER_STAGING_URL` without creating or changing a route.
3. Apply the additive migration and deploy/smoke-test `jarvis-voice-staging`.

None of these approvals may authorize production, `jarvis-voice`, live Dashboard/Calendar connections, identifier changes, destructive D1 operations, or `liveSystemsConnected=true`.
