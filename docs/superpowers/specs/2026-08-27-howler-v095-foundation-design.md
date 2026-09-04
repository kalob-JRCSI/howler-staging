# Howler v0.9.5 Foundation Recovery + One-Intent Operator Layer

**Status:** Proposed design for implementation approval

**Date:** 2026-08-27

**Target:** `howler-staging`, branch `v0.9.5-dashboard-bridge`

**Baseline:** Last functional v0.9.4 Worker at Git commit `d851357bd08a795df3508ff610da9eaa1c386a43`

**Deployment target:** `jarvis-voice-staging` only

## 1. Purpose

Howler v0.9.5 restores the last functional v0.9.4 scheduling engine from its generated `worker.js` bundle into maintainable TypeScript source, protects its established behavior with characterization and regression tests, and adds a staging-only operator layer with one canonical flow:

> one intent -> one workflow run -> one result

The build also replaces manual Worker-file transfer with a source-controlled, tested CI/CD path. It does not connect Howler to a live Dashboard, Calendar, production Worker, or other live business system.

This document is the architecture contract for the foundation build. It is not an implementation plan and does not authorize deployment or remote resource changes.

## 2. Non-negotiable invariants

The implementation and its automated tests MUST enforce all of the following:

1. `HOWLER_MODE` is exactly `shadow` in committed staging configuration and at runtime.
2. Every health and operator result reports `liveSystemsConnected: false`.
3. No code reads from or writes to a live Dashboard.
4. No code reads from or writes to a live Calendar.
5. No production deployment job, production Wrangler environment, production route, or production credential is introduced.
6. `jarvis-voice` remains untouched and MUST NOT be a deploy target.
7. The only deploy target is the existing `jarvis-voice-staging` Worker.
8. The existing D1 binding and resource remain unchanged:
   - binding: `HOWLER_DB`
   - database: `howler-intelligence-staging`
   - database ID: `b1049979-11cc-4faa-9a94-a0f42f9f4f23`
9. `HOWLER_ADMIN_KEY` remains the authentication secret and retains the existing `Authorization: Bearer <key>` contract.
10. Existing v0.9.4 API routes and response contracts remain available. New operator routes are additive.
11. Shadow mode never creates a `PUBLISHED` forecast and never calls the existing publication transition.
12. Existing project events, forecast snapshots, oversight reviews, learning records, and prediction outcomes remain append-only.
13. No migration deletes, renames, rewrites, or changes the semantics of an existing table, column, trigger, index, project revision, event, forecast, or review.
14. Manual copying, uploading, renaming, decompressing, or shuttling `worker.js` is not a supported development or deployment method.

Any implementation that violates an invariant is out of scope even if it otherwise passes functional tests.

## 3. Scope and non-goals

### 3.1 In scope

- Mechanical recovery of the v0.9.4 engine into focused TypeScript modules.
- Preservation and regression protection of v0.9.4 behavior.
- Generated Cloudflare binding types and source-first Wrangler bundling.
- A canonical structured `Intent` contract.
- A single application-level workflow definition, `OPERATOR_INTENT_V1`.
- Durable workflow/run, step, and result records in the existing staging D1 database.
- Idempotency, duplicate replay, optimistic revision checks, retry classification, blocked and failed outcomes, and safe resumability.
- A one-submission operator UI.
- Branch/PR CI and test-gated deployment to `jarvis-voice-staging`.
- Additive D1 migrations and a code/deployment rollback procedure.

### 3.2 Explicit non-goals

- Natural-language or LLM-based intent interpretation.
- Cloudflare Workflows, Queues, Durable Objects, service bindings, Workers AI, or new external bindings.
- Live Dashboard or Calendar connectors, polling, webhooks, credentials, or synchronization.
- Production configuration or deployment.
- Redesigning scheduling algorithms, confidence weights, recovery policy, oversight rules, or D1 domain schemas.
- General multi-tenant identity or authorization. v0.9.5 preserves the existing staging admin-key boundary.
- Automatic publication. The existing publication route remains present but unreachable while `HOWLER_MODE=shadow`.
- Destructive D1 rollback. Foundation migrations are expand-only so code rollback does not require schema rollback.

Cloudflare Workflows can be reconsidered only after the in-Worker/D1 foundation demonstrates a verified need for execution beyond a Worker request or platform-managed waits. It is deliberately excluded now to avoid a new binding and architecture before the recovered engine is stable.

## 4. Baseline recovery strategy

### 4.1 Authoritative baseline

The functional baseline is `worker.js` from commit `d851357bd08a795df3508ff610da9eaa1c386a43`, which identifies itself as Howler Scheduling Intelligence v0.9.4. The v0.9.5 branch tip is not a functional baseline because its entrypoint was deleted in preparation for a later upload.

The recovered source MUST preserve the behavior represented by the bundled module boundaries:

- `confidence`
- `coverage`
- `date`
- `engine`
- `graph`
- `learning`
- `metrics`
- `oversight`
- `reducer`
- `solver`
- `storage`
- `types`
- `validation`
- `worker/admin`
- `worker/deboard-seed`
- `worker/hash`
- `worker/health`
- `worker/http`
- `worker/index`
- `worker/repository`
- `worker/understanding`

### 4.2 Recovery order

Recovery is deliberately mechanical before it is architectural:

1. Freeze v0.9.4 characterization fixtures and expected outputs.
2. Extract modules without changing algorithms, weights, rules, strings, status semantics, route behavior, D1 statements, or ordering.
3. Introduce explicit TypeScript types at module boundaries without changing runtime behavior.
4. Run parity tests against fixed inputs and clocks.
5. Only after parity is green, add the v0.9.5 operator layer through new modules and additive routes.

Refactoring and new behavior MUST NOT be mixed into initial extraction. If a v0.9.4 behavior appears defective, the implementation records it as a compatibility issue rather than silently correcting it. Any behavior change requires a separate decision and regression test.

### 4.3 Behavior that must survive recovery

- Project-model validation and graph cycle/dependency validation.
- Working-day and date calculations.
- Scenario scheduling and likely critical-path calculations.
- Forecast creation, versioning, deltas, confidence, coverage, warnings, and completion ranges.
- Source supersession and evidence lineage.
- Typed event reduction and impact-cone calculation.
- Understanding-proposal validation.
- Oversight decisions and publication eligibility.
- Recovery analysis, protection actions, and standby recovery levers.
- Initial seed behavior for `deboard-v091`.
- D1 optimistic revision controls and atomic batches.
- Append-only guards.
- Constant-time admin-token verification.
- Bounded JSON request parsing.
- Structured error handling and request IDs.
- Shadow apply behavior and controlled-only publication gate.

The service version becomes `0.9.5`; the recovered engine exposes an internal compatibility marker of `0.9.4` for diagnostics and regression evidence.

## 5. Source-first architecture

Wrangler will bundle TypeScript from source. A generated bundle may be produced in CI for inspection or retained as a build artifact, but it is never edited or used as the source of truth.

```text
howler-staging/
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
      intent.ts
      workflow.ts
      result.ts
      policy.ts
    worker/
      admin.ts
      deboard-seed.ts
      hash.ts
      health.ts
      http.ts
      index.ts
      repository.ts
      understanding.ts
  migrations/
    0001_v094_baseline.sql
    0002_operator_runs.sql
  test/
    fixtures/v094/
    unit/
    integration/
    contract/
    safety/
  docs/
  package.json
  package-lock.json
  tsconfig.json
  vitest.config.ts
  worker-configuration.d.ts
  wrangler.jsonc
```

`wrangler.jsonc` points directly to `src/worker/index.ts`. The package lockfile, compiler settings, tests, migrations, and generated binding declarations are committed. `worker.js`, versioned upload text files, compressed source blobs in package scripts, and Dashboard-editor copy/paste are prohibited.

## 6. Preserved v0.9.4 interfaces

The following routes remain present with their existing authentication and JSON contract semantics:

- `GET /`
- `GET /admin`
- `GET /health`
- `POST /v1/admin/init-db`
- `POST /v1/projects/deboard-v091/seed`
- `GET /v1/projects/:projectId/forecast`
- `GET /v1/projects/:projectId/forecast/health`
- `GET /v1/projects/:projectId/forecast/recovery`
- `GET /v1/projects/:projectId/events`
- `GET /v1/projects/:projectId/learning`
- `POST /v1/projects/:projectId/understanding/preview`
- `POST /v1/projects/:projectId/events/preview`
- `POST /v1/projects/:projectId/events/apply-shadow`
- `POST /v1/projects/:projectId/events/publish`

`GET /health` remains unauthenticated. Every `/v1` route remains protected by `HOWLER_ADMIN_KEY`. Authentication occurs before an intent is parsed or persisted, so an unauthorized request cannot create audit state. The publication route continues returning `403` while the mode is `shadow`.

Existing JSON fields, status codes, and safety/publication meanings are not removed, renamed, or narrowed. v0.9.5 may add fields such as engine compatibility and operator-schema readiness. The HTML body at `/` and `/admin` is the intentional exception: the routes and security headers remain, while the page body changes to the one-action UI required by this design. The init-db route preserves its existing response fields while adding operator-table readiness additively.

The schema-init route remains an idempotent compatibility and recovery endpoint, but migration files become the schema source of truth. Its implementation applies/checks the same statements used by local and CI migration tests; it does not delete data.

## 7. One-intent orchestration model

### 7.1 Architectural choice

Every authenticated, schema-valid intent accepted by `POST /v1/intents` creates or reuses exactly one `OPERATOR_INTENT_V1` workflow run. Malformed or unauthorized HTTP requests are not accepted intents and create no run. The workflow calls recovered engine functions directly; it does not make HTTP calls back into its own Worker. One workflow run produces exactly one durable terminal result. A duplicate submission returns the existing run/result rather than creating a second workflow.

The foundation supports structured intent kinds only:

- `FORECAST_QUERY`
- `FORECAST_HEALTH_QUERY`
- `RECOVERY_QUERY`
- `EVIDENCE_PREVIEW`
- `EVIDENCE_APPLY_SHADOW`

Bootstrap schema initialization, project seeding, publication, and live-system operations are not operator intents. Existing admin routes remain available for controlled recovery and compatibility.

### 7.2 Canonical workflow

All kinds use the same ordered workflow with conditional steps:

1. `RECEIVE` - canonicalize the request, calculate its hash, and claim the idempotency key.
2. `VALIDATE` - validate schema, supported kind, timestamps, evidence structure, and conditional requirements.
3. `AUTHORIZE_POLICY` - record that route-level admin authentication succeeded, then assert shadow mode, staging target, and permitted effect. The secret itself is never persisted.
4. `LOAD_PROJECT` - load the project, latest forecast, and published baseline where required.
5. `CHECK_REVISION` - compare the expected and current project revisions for evidence intents.
6. `PREPARE` - validate or construct the typed event/understanding proposal without external calls.
7. `EXECUTE_ENGINE` - invoke the recovered query, forecast, event, oversight, or recovery functions.
8. `COMMIT_SHADOW` - only for `EVIDENCE_APPLY_SHADOW`; atomically persist the event, non-published candidate, and oversight review.
9. `BUILD_RESULT` - create the canonical result envelope.
10. `FINALIZE` - atomically record the terminal run state and result reference.

Pure completed steps may be replayed. A durable step is skipped only when its persisted output hash proves the same step for the same request already completed.

### 7.3 New additive routes

- `POST /v1/intents` - submit one intent; returns `200` for an existing completed duplicate, `201` for a newly completed run, `202` if safely resumable work remains, `409` for idempotency/revision conflicts, or a structured terminal failure.
- `GET /v1/workflows/:workflowId` - retrieve run and step status.
- `GET /v1/results/:resultId` - retrieve the canonical result.
- `POST /v1/workflows/:workflowId/resume` - resume only an eligible interrupted run; it does not override business blocks or revisions.

All new routes use the existing bearer-key authentication.

## 8. Canonical schemas

The TypeScript below is normative for field names and semantics. Implementation may add internal database columns, but public fields may change only through a new `schemaVersion`.

### 8.1 Intent

```ts
type IntentKind =
  | "FORECAST_QUERY"
  | "FORECAST_HEALTH_QUERY"
  | "RECOVERY_QUERY"
  | "EVIDENCE_PREVIEW"
  | "EVIDENCE_APPLY_SHADOW";

type RequestedEffect = "READ_ONLY" | "PREVIEW" | "APPLY_SHADOW";

interface ProjectEventInput {
  id: string;
  baseRevision: number;
  projectId: string;
  type: string;                  // validated v0.9.4 event type
  occurredAt: string;
  receivedAt: string;
  sourceIds: string[];
  verification: string;          // validated v0.9.4 verification state
  impactSeedActivityIds: string[];
  mutations: EventMutationV094[];
  payload: Record<string, unknown>;
  note?: string;
  causeCode?: string;
  causeVerification?: string;
}

interface IntentV1 {
  schemaVersion: "1";
  intentId: string;              // required UUID generated once by the client/UI
  idempotencyKey: string;        // 1..128 visible ASCII chars
  projectId: string;
  kind: IntentKind;
  requestedEffect: RequestedEffect;
  expectedProjectRevision: number | null;
  submittedAt: string;           // ISO-8601 timestamp
  source: {
    channel: "OPERATOR_UI" | "API";
    operatorLabel?: string;      // audit label, not an authorization identity
  };
  payload:
    | { type: "QUERY" }
    | { type: "EVIDENCE"; event: ProjectEventInput };
}
```

Validation rules:

- Query kinds require `requestedEffect="READ_ONLY"`, `payload.type="QUERY"`, and permit `expectedProjectRevision=null`.
- `EVIDENCE_PREVIEW` requires `requestedEffect="PREVIEW"`, an evidence payload, and a non-null revision.
- `EVIDENCE_APPLY_SHADOW` requires `requestedEffect="APPLY_SHADOW"`, an evidence payload, and a non-null revision.
- The event project ID and base revision must equal the intent project ID and expected revision.
- Intent IDs, event IDs, source IDs, and timestamps are stable across retries.
- The operator UI generates `intentId`, `idempotencyKey`, and `submittedAt` once per submission and retains them for every retry/resume of that submission.
- No intent kind can request publication or an external-system side effect.

### 8.2 Workflow run and step

```ts
type WorkflowState =
  | "RECEIVED"
  | "VALIDATING"
  | "READY"
  | "RUNNING"
  | "INTERRUPTED"
  | "BLOCKED"
  | "FAILED"
  | "SUCCEEDED";

type StepState = "PENDING" | "RUNNING" | "SUCCEEDED" | "BLOCKED" | "FAILED" | "SKIPPED";

interface WorkflowRunV1 {
  schemaVersion: "1";
  workflowId: string;
  workflowType: "OPERATOR_INTENT_V1";
  workflowVersion: 1;
  intentId: string;
  intentHash: string;            // SHA-256 of canonical intent JSON
  projectId: string;
  state: WorkflowState;
  currentStep: string | null;
  attempt: number;
  maxAttempts: number;
  resumable: boolean;
  interruption?: WorkflowProblem;
  blockedReason?: WorkflowProblem;
  failure?: WorkflowProblem;
  resultId?: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
}

interface WorkflowStepV1 {
  schemaVersion: "1";
  workflowId: string;
  stepName: string;
  ordinal: number;
  state: StepState;
  attempt: number;
  inputHash: string;
  output?: unknown;              // JSON-serializable only
  outputHash?: string;
  problem?: WorkflowProblem;
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowProblem {
  code: string;
  category: "VALIDATION" | "AUTHORIZATION" | "POLICY" | "REVISION" | "TRANSIENT" | "INTERNAL";
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

`INTERRUPTED` means a retryable technical problem stopped the current attempt and no terminal result exists yet. `BLOCKED` means the system executed correctly but a business/safety prerequisite prevents continuation, such as a stale project revision or oversight block. `FAILED` means attempts are exhausted or a non-retryable technical/invariant failure prevented a trustworthy success result. `BLOCKED`, `FAILED`, and `SUCCEEDED` are terminal and each has exactly one result. A blocked or failed run is not automatically resumed.

### 8.3 Result

```ts
type ResultStatus = "SUCCEEDED" | "BLOCKED" | "FAILED";

type ResultOutput =
  | { type: "FORECAST"; data: { modelRevision: number; latest: ForecastSnapshotV094 | null; published: ForecastSnapshotV094 | null } }
  | { type: "FORECAST_HEALTH"; data: ProjectHealthV094 }
  | { type: "RECOVERY"; data: RecoveryResponseV094 }
  | { type: "EVIDENCE_PREVIEW"; data: EvidencePreviewResponseV094 }
  | { type: "SHADOW_TRANSITION"; data: ShadowTransitionResponseV094 };

interface ResultV1 {
  schemaVersion: "1";
  resultId: string;
  intentId: string;
  workflowId: string;
  projectId: string;
  intentKind: IntentKind;
  status: ResultStatus;
  persisted: boolean;            // domain transition persisted, not audit rows
  projectRevisionBefore: number | null;
  projectRevisionAfter: number | null;
  forecastVersion: number | null;
  output?: ResultOutput;
  oversight?: unknown;
  warnings: Array<{ code: string; message: string }>;
  problem?: WorkflowProblem;
  safety: {
    mode: "shadow";
    stagingOnly: true;
    liveSystemsConnected: false;
    dashboardConnected: false;
    calendarConnected: false;
    productionDeployment: false;
  };
  createdAt: string;
}

interface IntentSubmissionResponseV1 {
  schemaVersion: "1";
  replayed: boolean;             // delivery metadata, never persisted into ResultV1
  run: WorkflowRunV1;
  result?: ResultV1;             // absent only while run.state is INTERRUPTED
}
```

The `*V094` names above are recovered, strongly typed v0.9.4 contracts; their fields and semantics are preserved rather than widened to arbitrary JSON. `EventMutationV094` is the recovered discriminated union of supported v0.9.4 mutations.

Duplicate delivery never creates a second result. The immutable existing result is returned inside `IntentSubmissionResponseV1` with delivery metadata `replayed=true`.

## 9. Persistence model

The existing six v0.9.4 tables and their triggers remain unchanged. Migration `0002_operator_runs.sql` adds:

- `operator_intents` - immutable canonical request JSON, hash, project, kind, and timestamps; unique `(project_id, idempotency_key)` and unique `intent_id`.
- `workflow_runs` - one row per intent with state, attempt, current step, problem JSON, result reference, and timestamps.
- `workflow_steps` - one row per `(workflow_id, step_name)` with attempt, input/output hashes, serializable checkpoint JSON, and state.
- `workflow_results` - immutable canonical result JSON with unique `result_id`, `workflow_id`, and `intent_id`.

Run/step rows are operational state and may be updated through guarded repository methods. Intent and result rows are immutable. Domain records remain append-only. Foreign keys and uniqueness constraints enforce one intent, one run, and one result.

The repository owns all SQL. Route handlers and engine modules do not issue SQL directly. Domain transition and orchestration finalization are separate batches so a committed domain transition can be detected and finalized after an interrupted response.

## 10. Idempotency, conflicts, retries, and recovery

### 10.1 Idempotency and duplicates

The idempotency scope is `(projectId, idempotencyKey)`.

- New key: insert intent and run, then execute.
- Same key and same canonical SHA-256 hash: return or resume the original run; never execute a second domain transition.
- Same key and different hash: return `409 IDEMPOTENCY_KEY_REUSE` without executing.
- Same intent ID with a different hash: return `409 INTENT_ID_REUSE`.
- Concurrent claims rely on D1 uniqueness; the loser loads and returns the winning run.

Canonical hashing sorts object keys and preserves array order, matching the existing stable-hash approach.

### 10.2 Revision conflicts

Evidence intents require `expectedProjectRevision` and the embedded event `baseRevision` to equal the currently loaded project revision.

A mismatch produces:

- run state `BLOCKED`
- problem code `REVISION_CONFLICT`
- HTTP `409`
- current revision in problem details
- no event, forecast, or oversight persistence

The operator must submit a new intent with a new idempotency key after reviewing current state. Resume cannot rewrite an intent's expected revision.

The existing D1 revision trigger remains the final concurrency guard. A race at commit is normalized to the same blocked result.

### 10.3 Retry policy

- Validation, authorization, policy, revision, and oversight blocks are not retryable.
- Pure engine steps may be rerun from their persisted input.
- Transient D1 read failures may be retried up to two times within the run, with a bounded attempt count and no unbounded sleep.
- A domain commit is never blindly retried. Resume first checks the stable event ID, project revision, forecast ID/version, and oversight record to determine whether the atomic batch committed.
- Invalid request parsing is rejected before a run is created. An internal invariant failure after a valid intent is claimed is terminal `FAILED` and exposes a request/workflow ID, not stack traces.
- `maxAttempts` defaults to three total workflow attempts, including the first. Reaching it produces non-resumable `FAILED` with `RETRY_EXHAUSTED`.

### 10.4 Resumability

A run enters `INTERRUPTED` and is resumable only when its problem is marked retryable and its persisted checkpoints prove that replay is safe. Re-submitting the identical intent or calling the resume route claims a short D1 lease/version guard so only one request advances it. The allowed run transitions are `RECEIVED -> VALIDATING -> READY -> RUNNING`, `RUNNING -> INTERRUPTED`, `INTERRUPTED -> RUNNING`, and `RUNNING -> SUCCEEDED|BLOCKED|FAILED`; retry exhaustion transitions `INTERRUPTED -> FAILED`.

If the domain batch committed but result finalization did not, resume reconstructs the result from the committed event/forecast/review and completes the same workflow. It must not create another revision. If commit state is ambiguous, the run becomes non-resumable `FAILED` with `COMMIT_STATE_AMBIGUOUS`; an operator investigates through the recovery runbook rather than risking a duplicate mutation.

## 11. Staging-only mutation policy

All intents persist orchestration audit rows. Domain mutation is narrower:

- Query and preview intents set `persisted=false` and never modify project/domain state.
- Only `EVIDENCE_APPLY_SHADOW` can invoke `commitShadowTransition`.
- It requires valid admin authentication, `HOWLER_MODE=shadow`, a current revision, valid evidence, and a completed oversight review inside the same workflow.
- It persists only to `HOWLER_DB` in `howler-intelligence-staging`.
- Its forecast candidate remains `WORKING` or `PROPOSED`, never `PUBLISHED`.
- An oversight `BLOCK` yields a blocked result and no domain mutation.
- No `IntentKind` maps to `commitForecastTransition`, a live connector, or public HTTP side effect.

The safety object is generated by server constants and policy checks, not copied from client input. `liveSystemsConnected` is never configurable by an intent.

## 12. One-action operator UI

`GET /` and `GET /admin` continue serving the same-origin staging control surface, redesigned around one intent submission rather than operational buttons.

The page contains:

- Persistent, prominent `STAGING / SHADOW / NO LIVE SYSTEMS` status.
- Existing `HOWLER_ADMIN_KEY` field, retained only in the browser tab/session as today.
- Project ID.
- Intent-kind selector.
- Fields appropriate to the selected structured intent, including evidence JSON/form fields and expected revision when required.
- A single `Run intent` submit action.
- One workflow status/result panel showing IDs, status, safety, output, warnings, oversight, and retry eligibility.

The UI performs one `POST /v1/intents`. It does not ask the operator to call preview, copy a token, and call apply. For `EVIDENCE_APPLY_SHADOW`, preview, oversight, and conditional shadow commit are internal steps of the one workflow. Choosing an apply-shadow intent is explicit before submission; there is no hidden escalation from preview to mutation.

Schema initialization and seeding are removed from the routine operator UI but their existing routes remain for the recovery runbook. The UI contains no live Dashboard/Calendar controls or connector placeholders.

## 13. Testing and regression protection

### 13.1 v0.9.4 characterization suite

Fixtures are derived from the v0.9.4 baseline and use fixed clocks/IDs. Golden comparisons cover:

- DeBoard seed validation and initial forecast.
- Forecast versions, activity dates/ranges, critical flags, confidence, warnings, and completion.
- Masonry evidence supersession preview and shadow apply.
- Impact activity IDs and forecast deltas.
- Oversight decisions, findings, and publication eligibility.
- Recovery status, protection actions, standby levers, risk dates, and capacity.
- Append-only and revision-conflict behavior.
- Existing HTTP statuses and response shapes.

Golden JSON excludes only explicitly nondeterministic request IDs or generated timestamps, which are injected in tests. Ordering that was observable in v0.9.4 remains asserted.

### 13.2 Unit and integration coverage

- Unit tests for every recovered engine module.
- D1 integration tests in the Workers runtime using local isolated databases.
- Migration tests from an empty database and a frozen v0.9.4 schema/data fixture.
- Contract tests for every preserved and new route.
- State-machine tests for every allowed and rejected transition.
- Duplicate/concurrent idempotency tests.
- Revision race and already-committed resume tests.
- Retry exhaustion, blocked, failed, and ambiguous-commit tests.
- UI tests proving one submit creates one request and renders one result.

### 13.3 Mandatory safety tests

CI fails unless static and runtime tests prove:

- `HOWLER_MODE` resolves to `shadow`.
- `liveSystemsConnected` is always `false`.
- Dashboard and Calendar connection flags are always `false`.
- No operator path calls `commitForecastTransition`.
- No outbound `fetch` exists in domain/operator execution paths; same-origin browser API calls are the only allowed UI fetches.
- Wrangler name is exactly `jarvis-voice-staging`.
- D1 binding/name/ID equal the preserved values.
- No workflow references a production environment, production secret, `jarvis-voice` as a target, or a production deployment command.
- The v0.9.4 route inventory remains registered.

Coverage percentages are secondary to these behavioral gates; no line-coverage threshold may substitute for them.

## 14. CI and staging deployment

### 14.1 Branch and pull-request CI

CI runs on every pull request and every branch push without Cloudflare credentials:

1. Check out the exact commit.
2. Install the pinned Node version and dependencies with `npm ci`.
3. Verify the lockfile is unchanged.
4. Generate/check Worker binding types.
5. Run formatting/lint checks.
6. Run TypeScript type-checking.
7. Run unit, integration, contract, migration, UI, parity, and safety tests.
8. Run Wrangler deploy dry-run against committed configuration.
9. Produce the bundled Worker and manifest as CI artifacts with SHA-256 hashes.

No branch or PR job deploys or contacts Cloudflare resources.

### 14.2 Deployment gate

The existing GitHub Actions deployment is reworked so a push to `main` can deploy only after the full CI job succeeds. Manual dispatch, if retained, invokes the same tests and cannot bypass them.

The deployment job:

- uses a GitHub environment named `staging`;
- uses only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` scoped for staging;
- has an explicit concurrency group so two staging deployments cannot overlap;
- checks that the configured Worker name is `jarvis-voice-staging` and rejects `jarvis-voice`;
- applies only pending, committed, expand-only migrations to the preserved staging D1 database;
- deploys the exact tested commit with the pinned Wrangler version;
- records Git commit, artifact hash, migration set, Cloudflare version ID, and staging URL as job metadata;
- performs a post-deploy staging health check asserting version `0.9.5`, mode `shadow`, database readiness, and `liveSystemsConnected=false`.

There is no production job. Deployment approval for implementation remains separate from approval of this design.

## 15. Rollback and recovery

### 15.1 Failed pre-deploy validation

If any test, type, migration, dry-run, safety, or artifact check fails, deployment does not start. Fixes occur through a new commit; CI artifacts are not manually edited.

### 15.2 Failed migration

Foundation migrations are additive and transactional where D1 permits. A migration failure stops deployment before Worker activation. Existing tables/data remain authoritative. The migration is repaired forward in source control; no destructive reverse migration is run.

### 15.3 Failed Worker deployment or smoke test

1. Stop subsequent deployments through the staging concurrency/environment gate.
2. Identify the last known-good `jarvis-voice-staging` version recorded by CI.
3. Roll back only `jarvis-voice-staging` to that version using Wrangler/Cloudflare version rollback.
4. Do not modify `jarvis-voice`.
5. Leave additive operator tables in place; the prior Worker ignores them.
6. Re-run the staging health assertion.
7. Record the failed commit/version and incident reason.

### 15.4 Bad operator transition

Existing domain history is never deleted or rewritten. A duplicate transition is prevented by event IDs, revision guards, and idempotency. If semantically incorrect evidence was validly applied, recovery uses a separately reviewed compensating evidence event in staging. Direct SQL deletion or editing of append-only records is prohibited.

### 15.5 Lost or ambiguous response

The operator resubmits the same intent/idempotency key. Howler returns the existing result or resumes from checkpoints. If commit state is ambiguous, automated mutation stops and the recovery runbook compares project revision, event ID, snapshot, and oversight records before any new intent is accepted.

## 16. Observability and audit

Structured logs include `requestId`, `intentId`, `workflowId`, `resultId`, project ID, step, state, attempt, duration, and problem code. They never include the admin key or entire sensitive request payload.

Health reports:

- service and v0.9.5 version;
- recovered engine compatibility version v0.9.4;
- D1 binding/schema readiness;
- admin-secret configuration status, not its value;
- `HOWLER_MODE=shadow`;
- `liveSystemsConnected=false`;
- Dashboard/Calendar disconnected status.

Committed Wrangler configuration enables staging observability with an explicitly chosen sampling rate. Logs supplement, but do not replace, the D1 audit trail.

## 17. Acceptance criteria

The foundation is complete only when:

1. Maintainable TypeScript source reproduces the frozen v0.9.4 fixtures and API behavior.
2. All preserved routes pass contract tests.
3. One valid intent produces one workflow and one result.
4. Identical duplicates return the same run/result without a second domain mutation.
5. Idempotency-key reuse with different content and stale revisions return deterministic `409` results.
6. Retryable interruptions resume safely; ambiguous mutations stop rather than repeat.
7. Only explicit apply-shadow intents can alter staging domain state.
8. The operator UI completes the former preview/oversight/apply sequence with one submission.
9. CI validates every branch/PR without remote credentials.
10. Staging deployment cannot run until all validation succeeds.
11. The deploy target and D1 identifiers remain exactly preserved.
12. Safety tests prove shadow mode, no live connections, and no production deployment.
13. A documented rollback restores the prior staging Worker without destructive D1 changes.
14. No supported instruction or script requires manual `worker.js` shuttling.

## 18. Risks and controls

| Risk | Control |
|---|---|
| Extraction accidentally changes v0.9.4 behavior | Mechanical recovery first; fixed-clock characterization and contract tests before operator work |
| One-action apply hides safety review | Explicit apply-shadow intent kind; internal oversight remains mandatory; blocked oversight never commits |
| Duplicate request creates two revisions | D1 unique idempotency claim, stable event IDs, revision trigger, commit-state reconciliation |
| Deployment overwrites staging settings | Wrangler configuration becomes reviewed source of truth; preserved identifiers and required-secret checks are CI assertions |
| Migration harms existing D1 data | Expand-only tables/indexes; migration tests from v0.9.4 fixture; stop-before-deploy on failure |
| Rollback code cannot understand new schema | Old code ignores additive tables; no existing table changes |
| Foundation grows into an integration platform | Structured intents only; no Workflows/Queues/AI/connectors/live systems |
| Production is affected accidentally | No production environment/job/credential; exact-name deployment assertion rejects `jarvis-voice` |

## 19. Resolved architecture decisions

1. **Execution host:** the existing staging Worker, not a new Worker.
2. **Workflow engine:** application-level state machine persisted in existing D1, not Cloudflare Workflows in v0.9.5.
3. **Intent interpretation:** typed deterministic input, not natural language or AI.
4. **Mutation:** explicit shadow-only intent; no publication intent.
5. **Source of truth:** TypeScript plus migrations and lockfile in Git, not generated `worker.js` or Dashboard editor state.
6. **Compatibility:** existing routes remain; new routes are additive.
7. **Schema evolution:** expand-only and forward-repaired; code rollback does not roll back D1 schema.
8. **Deployment:** GitHub CI/CD to `jarvis-voice-staging` after tests only; no production path.

## 20. Unresolved implementation decisions

These items require verification during implementation planning but do not change the architecture:

1. Confirm the Node and exact Wrangler versions to pin after inspecting current supported releases and the checked-in schema.
2. Confirm that the existing staging Cloudflare token has only the permissions needed for Worker deployment and D1 migrations; do not broaden it without approval.
3. Confirm GitHub environment protection settings for `staging`, which are repository settings and are not visible in the current checkout.
4. Decide the observability sampling rate based on expected staging volume; logging remains enabled either way.
5. Decide whether CI commits generated `worker-configuration.d.ts` or verifies it as a generated artifact. It must be reproducible in either case.
6. Confirm the exact post-deploy staging URL from existing configuration/account state before enabling a smoke check. Do not add or change routes to discover it.

None of these decisions authorizes a live connection, identifier change, production configuration, or deployment.

## 21. Manual Worker shuttling prohibition

Effective with v0.9.5 foundation implementation:

- `worker.js` is not manually uploaded, copied between systems, renamed from `.txt`, reconstructed from package-script blobs, or edited in the Cloudflare Dashboard.
- Developers change TypeScript, tests, migrations, and configuration in Git.
- CI builds and validates the deployable artifact.
- The staging deployment job deploys the exact tested commit to `jarvis-voice-staging`.
- Emergency rollback selects a recorded prior Worker version; it does not restore a locally saved `worker.js` by hand.

Source control plus CI/CD is the only supported deployment bridge.
