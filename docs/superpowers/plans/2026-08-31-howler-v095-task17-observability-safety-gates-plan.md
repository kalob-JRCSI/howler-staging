# Howler v0.9.5 Task 17 — Observability + Safety + Release Regression Gates

**Goal:** Prove what canonical operator execution actually did (intent -> workflow -> permission/risk decision -> execution -> result -> verification), detect a regression against the invariants Tasks 1-16B already established, and compose one deterministic PASS/FAIL release gate — without building a second execution path, a dashboard, or any deployment/production surface.

**Accepted base:** `1a9f03e03ee0f476febc9740311283162f6882d1` (PR #10, Task 16B).

**Spec:** `docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md` (workflow state machine, §7.2/§8/§10/§11).

## Architectural principle

The canonical pipeline (`src/operator/intent.ts` -> `workflow.ts` -> `result.ts` -> `policy.ts`) already persists everything the observability requirement asks for: `WorkflowRunV1` (state, attempt, timestamps, interruption/blockedReason/failure problems, resultId), a per-step `WorkflowStepV1` ledger (`RECEIVE .. FINALIZE`, each with state/attempt/timestamps/problem), and `ResultV1` (status, oversight, problem). Task 17 does not add a second write path. It adds:

1. A **pure, read-only mapping function** that reshapes already-persisted rows into one structured, secret-free record (observability).
2. **Parameterized, pure gate-check functions** (not hardcoded to real files) that can be proven to fail against a deliberately-broken fixture, plus one suite that runs them against the real accepted repo (safety gates).
3. A **thin orchestrator** that composes existing package scripts plus the new gate suite into one clear PASS/FAIL result (release gate).

## Proposed files

| Path | Responsibility |
|---|---|
| `src/operator/observability.ts` | `buildExecutionTrace(run, steps, result?)`: pure mapping from already-loaded `WorkflowRunV1` + `WorkflowStepV1[]` + optional `ResultV1` to one `ExecutionTraceV1` record. No persistence, no HTTP, no env access — same convention as `intent.ts`/`workflow.ts`/`policy.ts`. |
| `test/unit/operator-observability.test.ts` | Pure-logic coverage: correlation, per-outcome shape (BLOCKED/INTERRUPTED/SUCCEEDED/FAILED/RUNNING), verification (oversight) surfacing, redaction, determinism. Naming matches `operator-intent.test.ts`/`operator-policy.test.ts`/`operator-result.test.ts`. |
| `tools/release-gate/src/schemas.ts` | `GateResult`/`GateReport` types — mirrors `tools/context-pack/src/schemas.ts`'s pattern. |
| `tools/release-gate/src/gates.ts` | Parameterized, pure safety-invariant gate functions (each `(input) => GateResult`), reusing `isSafetyCompliant`/`OPERATOR_SAFETY` from `src/operator/policy.ts` for the safety-object checks; new checks take a route list / file text as input rather than reading real files themselves. |
| `tools/release-gate/src/run.mjs` | Thin orchestrator (plain Node ESM, no new dependency): runs the existing authoritative npm scripts plus `test:release-gate`, prints one clear PASS/FAIL summary naming the failed gate(s) and their reason, exits non-zero on any real failure. |
| `tools/release-gate/tsconfig.json`, `tools/release-gate/vitest.config.ts` | Mirrors `tools/context-pack/`'s existing pattern exactly. |
| `tools/release-gate/test/gates.test.ts` | Unit tests for each gate function: PASS on a compliant fixture, FAIL (with the exact reason) on a deliberately-broken fixture. This is where "prove the gate detects a violation" lives — against fixtures, not the real repo. |
| `test/safety/release-gate.test.ts` | Runs the same gate functions against the **real** accepted repo (real `wrangler.jsonc`, real `OPERATOR_SAFETY`, the real route table extracted from `src/worker/index.ts`'s raw source — same raw-source-regex technique `test/safety/repository-policy.test.ts` already uses). Proves the current candidate actually passes every gate. Picked up automatically by the existing `test`/`verify` scripts (no new script needed for this file). |
| `package.json` | Adds `"test:release-gate": "vitest run --config tools/release-gate/vitest.config.ts"` and `"gate:release": "node tools/release-gate/src/run.mjs"`; extends `"typecheck"` with `tsc --noEmit -p tools/release-gate/tsconfig.json`; extends `"verify"` to include `test:release-gate`. |
| `docs/superpowers/plans/2026-08-31-howler-v095-task17-observability-safety-gates-plan.md` | This document. |

No new HTTP route. Surfacing `buildExecutionTrace` as a callable, tested module satisfies "provide structured, deterministic observability" without adding route/auth/contract-test surface a dashboard redesign would need — open question below if that judgment is wrong.

## Observability design

```ts
export interface ExecutionTraceV1 {
  schemaVersion: "1";
  intentId: string;
  workflowId: string;
  intentKind: IntentKind;
  projectId: string;
  workflowState: WorkflowState;
  currentStep: string | null;
  attempt: number;
  maxAttempts: number;
  resultId: string | null;
  resultStatus: ResultStatus | null;          // SUCCEEDED | BLOCKED | FAILED, when present
  problem: RedactedProblem | null;             // whichever of interruption/blockedReason/failure applies
  verification: { decision: OversightDecision; findingsCount: number } | null;
  steps: {
    stepName: WorkflowStepName;
    state: StepState;
    attempt: number;
    startedAt?: string;
    completedAt?: string;
    problem: RedactedProblem | null;
  }[];                                          // no raw step output/inputHash/outputHash content
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  durationMs: number | null;                    // completedAt - createdAt, when both present
}

type RedactedProblem = { code: string; category: WorkflowProblem["category"]; message: string; retryable: boolean };
// deliberately omits `problem.details` — may carry raw revision/diff data; not needed for observability
```

`buildExecutionTrace` also asserts (throws, since this would be an existing-invariant violation, not a normal outcome) that `result.workflowId === run.workflowId` and `result.intentId === run.intentId` when a result is present — correlation is verified, not merely asserted by construction.

Redaction: never includes admin keys/headers (the pipeline already never persists them — `AuthorizationAttestation` only carries `mode`/`workerName`/`authenticated: true`), never includes `WorkflowStepV1.output`/`inputHash`/`outputHash`, never includes `WorkflowProblem.details`, never includes raw `oversight.findings` (count only).

## Safety-gate design

Each gate is a pure function over an explicit input, not a hardcoded read of a real file — this is what makes "introduce a deliberate fixture violation and prove the gate fails" possible without touching the real repo:

```ts
interface GateResult { id: string; pass: boolean; reason: string; location?: string; }

checkStagingShadowSafety(safety: SafetyCandidate): GateResult;        // reuses isSafetyCompliant
checkNoLegacyMutationRoute(routes: RouteDescriptor[]): GateResult;     // no route outside the accepted Task 15 set touches a v0.9.4 mutation path
checkOperatorEntryPathOnly(routes: RouteDescriptor[]): GateResult;     // POST /v1/intents is the only mutation entry point
checkEvidenceApplyShadowExplicit(html: string): GateResult;            // reused pattern from admin-ui/field-dashboard contract tests, parameterized over page HTML
checkNoLiveConnectors(sourceText: string): GateResult;                 // no Calendar/Drive/connector reference
checkNoProductionDeployConfig(wranglerJsonc: string): GateResult;       // reuses the v094-safety.test.ts identifiers check, parameterized
```

`test/safety/release-gate.test.ts` feeds these the real `wrangler.jsonc` text, the real `OPERATOR_SAFETY` constant, and the real route table (extracted from `src/worker/index.ts` via the same raw-source technique `repository-policy.test.ts` already uses) and asserts every gate currently passes. `tools/release-gate/test/gates.test.ts` feeds each function both a compliant fixture (PASS) and a deliberately-broken one (FAIL, with the exact `reason`) — e.g. a fixture `SafetyCandidate` with `liveSystemsConnected: true`, a fixture route list containing `/events/publish` reachable outside the shadow block, a fixture HTML string with `EVIDENCE_APPLY_SHADOW` marked `selected`.

Several invariants in the review's list are **already** covered by existing tests (`test/safety/v094-safety.test.ts`, `test/safety/repository-policy.test.ts`, `test/contract/operator-routes.test.ts`, `test/contract/admin-ui.test.ts`, `test/contract/field-dashboard.test.ts`, `test/unit/field-dashboard.test.ts`'s stable-ownership/purge-lifecycle coverage) — those are **composed into the release gate by running the existing scripts**, not re-implemented. Task 17 only adds new gate functions for invariants that were previously only true "because the code happens to do that," not because a test would catch a regression in it as a named, reusable, fixture-provable check.

## Release-gate design

`npm run gate:release` runs, in order, naming each as a gate: `format:check`, `lint`, `typecheck`, `test:unit`, `test:contract`, `test:parity`, `test:safety` (includes the new `release-gate.test.ts`), `test:integration`, `test:context-pack`, `test:release-gate` (the new fixture-based unit tests), `cf-typegen:check`, `build:dry`. Each gate's pass/fail and duration is recorded; on any failure the summary names the failing gate, prints its reason (last output lines / assertion message), and exits 1. A clean run prints one PASS line and exits 0. This is a thin composition (`spawnSync` per script), not a reimplementation of any check — the fail-closed guarantee comes entirely from the underlying scripts already existing and being authoritative.

## Test plan

**Observability (`test/unit/operator-observability.test.ts`):** correlation identity present; per-outcome shape for BLOCKED/INTERRUPTED/SUCCEEDED/FAILED/RUNNING; step ledger ordered and redacted; verification (oversight) surfaced as decision + count only; throws on intentId/workflowId mismatch between result and run; no secret/header/raw-payload substring in `JSON.stringify(trace)` across every fixture; two calls with identical input produce byte-identical output (determinism).

**Safety gates (`tools/release-gate/test/gates.test.ts`):** each gate — PASS on the compliant fixture; FAIL with a specific, correct `reason` on one deliberately-broken fixture per invariant (live-system activation, production config, legacy mutation route, implicit-apply-shadow, canonical-Resume violation, one deterministically-detectable browser-business-logic violation such as a hardcoded forecast number in page HTML).

**Release gate (`tools/release-gate/test/run.test.ts` or a thin manual check, TBD at implementation time):** clean accepted candidate composition succeeds; one injected required-invariant failure is identified by name; multiple simultaneous failures remain individually listed and readable; process exit code is 0/1 appropriately for CI.

**Regression:** focused Task 17 tests; Task 16B tests (`test/unit/field-dashboard.test.ts`, `test/contract/field-dashboard.test.ts`); Task 16A tests (`test/unit/admin-ui.test.ts`, `test/contract/admin-ui.test.ts`); Task 15 contract tests (`test/contract/operator-routes.test.ts`); `test/safety/*`, `test/parity/*`, `test/contract/*`; Context Fabric (`npm run test:context-pack`); then full runtime suite, typecheck, lint, format:check on touched files, `cf-typegen:check`, `build:dry`, `git diff --check`, existing `npm run verify`, and the new `npm run gate:release`.

## Known baseline defect handling

Reproduced fresh on this accepted-base worktree (`1a9f03e0`), unmodified:

1. `test/safety/repository-policy.test.ts` > `ci.yml's pull_request trigger has no branch restriction` — fails because the regex `/pull_request:([ \t]*\n(?:[ \t]+.*\n)*)/` assumes LF line endings, but this worktree's `core.autocrlf=true` checks `.github/workflows/ci.yml` out as CRLF; the committed content itself is compliant. 811/812 on `npm test`.
2. `tools/context-pack/test/select.test.ts` > budget-pruning test — same CRLF-checkout root cause against a committed-LF fixture; 39/40 on `npm run test:context-pack`.
3. Repo-wide `npm run format:check` flags ~119 files, none touched by any accepted task, for the same CRLF-checkout reason.

None of these are fixed here (out of scope; not caused by Task 17). But they create a real conflict for `npm run gate:release`'s determinism: composing `npm run verify` unmodified would report **FAIL on every candidate, including a fully clean one**, for reasons that have nothing to do with that candidate's actual safety. **This is exactly the "stop and report" condition the task called out — flagging it now rather than deciding unilaterally.** My recommendation, pending confirmation: the release-gate orchestrator maintains a short, explicit, visible allowlist of exactly these known pre-existing failures (by file + test name), reports them in its output as `KNOWN BASELINE DEFECT (pre-existing, not evaluated by this gate)` rather than hiding them, and does not let them affect the overall PASS/FAIL verdict; any other failure in those same files still fails the gate normally. This changes no historical test or file — only how the new orchestrator interprets already-existing, already-classified output.

## Scope check

In scope: `src/operator/observability.ts` (read-only mapping), `tools/release-gate/*` (new tool, mirrors `tools/context-pack/`), new focused tests, minimal `package.json` script additions, this plan doc, the Task 16B receipt/context updates already completed in Phase 1.

Not touched: `src/operator/intent.ts`/`workflow.ts`/`result.ts`/`policy.ts` execution logic, any HTTP route, `wrangler.jsonc`, any deployment/CI workflow file, `/admin/*` pages, Calendar/Drive, voice, Task 18/19 work.

## Risks / open questions

1. **Baseline-defect allowlist** (above) — needs explicit sign-off before implementation, since it's a judgment call about how the gate should treat pre-existing, unrelated failures rather than a pure technical decision.
2. **No new HTTP route for observability** — `buildExecutionTrace` is a callable module, not an endpoint. If a route (e.g. `GET /v1/workflows/:workflowId/trace`) is actually wanted for Task 18's tooling to consume, that's additional HTTP/auth/contract-test surface not currently planned; flagging rather than assuming.
3. **`details` redaction is a blanket omission** — some `WorkflowProblem.details` values are harmless (e.g. `{ workerName }`), but the pipeline doesn't distinguish safe vs. sensitive details today, so the simplest deterministic rule is omit all of it. Open to a narrower allowlist later if a real consumer needs specific fields.
4. **`gate:release`'s output format** is deliberately plain-text/console for now (matching the existing scripts' style) rather than a structured JSON report; can add `--json` later if Task 18's CI wiring wants to parse it.

**READY TO IMPLEMENT:** Pending confirmation on risk #1 (baseline-defect allowlist) and risk #2 (no new HTTP route) — the rest of the plan is ready to build test-first once those are confirmed or the plan is adjusted.
