# Task 18 Voice Transport Pilot Implementation Plan

No runtime implementation is included in this plan correction. The single production module is `src/worker/voice-transport.ts`; `src/worker/admin.ts` receives only thin field-dashboard wiring. Existing Task 15-17 interfaces are consumed, not recreated.

## Task 1: Resolver and project resolution

**Files**
- Create: `src/worker/voice-transport.ts`
- Modify: none
- Test: `test/unit/voice-transport.test.ts`

**Interfaces:** consume `ProjectContext`, `ResumableWorkflowContext`, and accepted intent-kind literals; produce `VoiceCommandResolution` and `VoiceIntentCandidate`.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "resolver"`
**EXPECTED RED:** module exports and resolver behavior are absent; forecast, health, recovery, preview, apply, unknown, missing, ambiguous, exact-ID, alias, and Resume tests fail.
**Minimum implementation:** add deterministic trim/case-fold/whitespace normalization, exact project ID/explicit alias matching, accepted command mapping, and Resume cardinality handling.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "resolver"`
**EXPECTED GREEN:** resolver tests pass; no fuzzy target, invented project, evidence construction, or Resume intent exists.
**Checkpoint/review:** inspect the resolver for the exact five intent kinds and zero legacy endpoint references. Commit: `feat: add voice command resolver`.

## Task 2: Capture adapter and event ownership

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/unit/voice-transport.test.ts`

**Interfaces:** consume `SpeechRecognition`/`webkitSpeechRecognition` factory and injected scheduler; produce `VoiceCaptureState`, `VoiceTranscript`, and capture session callbacks.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "capture|recognition|stale"`
**EXPECTED RED:** capture lifecycle, unsupported browser, required error, interim, duplicate-final, and stale-session tests fail.
**Minimum implementation:** add lazy feature detection, explicit-gesture start, `captureSessionId`, `finalClaimed`, stop/abort distinction, state transitions, and stale callback rejection.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "capture|recognition|stale"`
**EXPECTED GREEN:** capture tests pass; interim/duplicate/stale callbacks cause zero resolution and a new session remains authoritative.
**Checkpoint/review:** verify no idle/background capture and no transcript-only permanent dedupe. Commit: `feat: add voice capture ownership`.

## Task 3: Immutable confirmation state machine

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/unit/voice-transport.test.ts`

**Interfaces:** consume existing field-control canonical evidence snapshot, expected revision, capture session, injected `Clock` and `Timer`; produce `PendingVoiceConfirmation`.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "confirmation"`
**EXPECTED RED:** immutable snapshot, fingerprint, 30-second expiry, state transitions, and consume-before-submit tests fail.
**Minimum implementation:** deep-copy/freeze the existing evidence snapshot, deterministically fingerprint it, bind project/kind/revision/session, inject clock/timer, and transition PENDING/CONSUMED/CANCELLED/EXPIRED.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "confirmation"`
**EXPECTED GREEN:** confirmation tests pass; affirmative verification marks CONSUMED synchronously before one submission, while duplicate/late/unrelated responses no-op.
**Checkpoint/review:** confirm speech cannot construct evidence and preview cannot escalate. Commit: `feat: add voice confirmation state machine`.

## Task 4: Submission bridge

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/unit/voice-transport.test.ts`

**Interfaces:** consume accepted Task 16A/16B submission-kernel interface and `IntentV1`; produce one `/v1/intents` request and identity outcome.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "submission|identity|legacy"`
**EXPECTED RED:** one-final-event, five-kind mapping, uncertain reuse, definitive resolution, later-new-identity, and no-legacy-route tests fail.
**Minimum implementation:** delegate to the accepted identity kernel and `POST /v1/intents`; add no retry or idempotency implementation.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "submission|identity|legacy"`
**EXPECTED GREEN:** one canonical request is made, uncertain identity is reused, definitive identity resolves, later deliberate action is new, and legacy mutation calls remain zero.
**Checkpoint/review:** inspect request construction for accepted kinds only. Commit: `feat: bridge voice to operator intents`.

## Task 5: Resume bridge

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/unit/voice-transport.test.ts`

**Interfaces:** consume known current interrupted workflow records; produce exact `POST /v1/workflows/:workflowId/resume` request/result.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "resume"`
**EXPECTED RED:** zero/one/multiple workflow selection and exact-ID/no-intent tests fail.
**Minimum implementation:** allow execution only for one matching resumable workflow and use its stored workflow ID.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "resume"`
**EXPECTED GREEN:** Resume tests pass; zero/multiple clarify, one uses exact ID, and `POST /v1/intents` count is zero.
**Checkpoint/review:** verify interrupted state is preserved until canonical result. Commit: `feat: add voice workflow resume bridge`.

## Task 6: Safe presenter and synthesis

**Files**
- Create: none (extend `src/worker/voice-transport.ts`)
- Modify: `src/worker/voice-transport.ts`
- Test: `test/unit/voice-transport.test.ts`

**Interfaces:** consume safe result classifications; produce allowlisted `VoicePresentation` and optional synthesis utterance.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "presenter|speech|secret|json"`
**EXPECTED RED:** concise safe templates, raw-data exclusion, and synthesis fallback tests fail.
**Minimum implementation:** add fixed safe mappings, independent synthesis detection, and visual-only fallback; pass only `safeSummary` to speech.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts -t "presenter|speech|secret|json"`
**EXPECTED GREEN:** success/blocked summaries are concise; raw JSON, problem text, secrets, headers, evidence, exceptions, and stack traces never reach speech.
**Checkpoint/review:** structural review of the allowlist. Commit: `feat: add safe voice presentation`.

## Task 7: Field dashboard wiring

**Files**
- Create: none
- Modify: `src/worker/admin.ts`
- Test: `test/contract/voice-transport.test.ts`

**Interfaces:** consume the transport interfaces from `src/worker/voice-transport.ts`; produce accessible `/admin/field` microphone/status/live-region wiring.

**RED COMMAND:** `npm.cmd exec vitest -- run test/contract/voice-transport.test.ts -t "field|accessibility|responsive"`
**EXPECTED RED:** microphone control, keyboard operation, visible states, confirmation, current transcript/result, and responsive field integration tests fail.
**Minimum implementation:** add thin wiring only; retain field cards and `/`, `/admin`, `/admin/operator` behavior.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/contract/voice-transport.test.ts -t "field|accessibility|responsive"`
**EXPECTED GREEN:** UI contract tests pass; manual dashboard remains functional and no persistence or second dashboard is introduced.
**Checkpoint/review:** compare legacy/operator route fixtures and scan for legacy mutation endpoints. Commit: `feat: wire voice into field dashboard`.

## Task 8: Task 17 safety-gate integration

**Files**
- Create: none
- Modify: `tools/release-gate/src/scan-sources.ts`, `tools/release-gate/src/gates.ts`, `test/safety/release-gate.test.ts`
- Test: `tools/release-gate/test/scan-sources.test.ts`, `tools/release-gate/test/gates.test.ts`, `test/safety/release-gate.test.ts`

**Interfaces:** consume `src/worker/voice-transport.ts` as a browser source; produce browser-boundary, explicit-APPLY, and live-connector findings.

**RED COMMAND A (root safety test):** `npm.cmd exec vitest -- run test/safety/release-gate.test.ts`
**RED COMMAND B (release-gate tool tests):** `npm.cmd exec vitest -- run tools/release-gate/test/gates.test.ts tools/release-gate/test/scan-sources.test.ts --config tools/release-gate/vitest.config.ts`
**EXPECTED RED:** root safety tests fail to prove real-repo voice source inclusion, while the release-gate tool tests fail to cover the voice source's browser-boundary, explicit-APPLY, and live-connector protections.
**Minimum implementation:** extend source discovery/tests explicitly or automatically without weakening any gate.
**GREEN COMMAND A (real-repo voice source inclusion):** `npm.cmd exec vitest -- run test/safety/release-gate.test.ts`
**GREEN COMMAND B (browser boundary, explicit APPLY, and live connector protection):** `npm.cmd exec vitest -- run tools/release-gate/test/gates.test.ts tools/release-gate/test/scan-sources.test.ts --config tools/release-gate/vitest.config.ts`
**EXPECTED GREEN:** root safety tests prove the real repository includes `src/worker/voice-transport.ts`; tool tests prove browser-boundary, explicit-APPLY, and live-connector violations are detected, with no bypass or suppression.
**Checkpoint/review:** run `npm.cmd run gate:release`; require PASS with exactly the two accepted baseline defects visible. Commit: `test: cover voice transport release gates`.

## Task 9: Full regression and release verification

**Files**
- Create: none
- Modify: none unless a prior focused test exposes a defect
- Test: `test/unit/voice-transport.test.ts`, `test/contract/voice-transport.test.ts`, `test/unit/field-dashboard.test.ts`, `test/contract/field-dashboard.test.ts`, `test/unit/admin-ui.test.ts`, `test/contract/admin-ui.test.ts`, `test/contract/operator-routes.test.ts`, `test/safety/release-gate.test.ts`, `tools/release-gate/test/changed-files.test.ts`, `tools/release-gate/test/classify.test.ts`, `tools/release-gate/test/extract-routes.test.ts`, `tools/release-gate/test/forbidden-symbols.test.ts`, `tools/release-gate/test/gates.test.ts`, `tools/release-gate/test/scan-sources.test.ts`

**Interfaces:** consume all Task 1-8 outputs; produce classified test, gate, and scope results.

**RED COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts test/contract/voice-transport.test.ts`
**EXPECTED RED:** any incomplete voice behavior fails before final integration.
**GREEN COMMAND:** `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts test/contract/voice-transport.test.ts`
**EXPECTED GREEN:** all focused voice tests pass.

**REGRESSION COMMANDS:**
- Task 18 focused voice tests: `npm.cmd exec vitest -- run test/unit/voice-transport.test.ts test/contract/voice-transport.test.ts`
- Task 17 release-gate tests: `npm.cmd run test:release-gate`; `npm.cmd run gate:release`
- Task 16B field-dashboard tests: `npm.cmd exec vitest -- run test/unit/field-dashboard.test.ts test/contract/field-dashboard.test.ts`
- Task 16A operator/admin UI tests: `npm.cmd exec vitest -- run test/unit/admin-ui.test.ts test/contract/admin-ui.test.ts`
- Task 15 operator contract tests: `npm.cmd exec vitest -- run test/contract/operator-routes.test.ts`
- Broader runtime suite: `npm.cmd test`
- Context suite: `npm.cmd run test:context-pack`
- Full verification: `npm.cmd run verify`
- Release gate: `npm.cmd run gate:release`
- Cloudflare type generation: `npm.cmd run cf-typegen:check`
- Dry build: `npm.cmd run build:dry`
- Whitespace: `git diff --check`

**EXPECTED RED:** a regression command identifies any changed accepted behavior or release-gate violation; baseline defects remain separately classified.
**Minimum implementation:** repair only local Task 18 defects; do not weaken gates or modify unrelated baseline fixtures.
**EXPECTED GREEN:** focused voice, Task 16A, Task 16B, Task 15, release-gate, and broader checks pass, with exactly the two accepted baseline defects reported where applicable.
**Checkpoint/review:** final changed-file audit, then local commit `feat: add voice transport pilot`. Do not push, merge, deploy, or start Task 19.

## Acceptance matrix

The 52 scenarios below map to exact test paths, names/categories, fakes, RED expectations, and GREEN assertions.

| # | Requirement | Exact test file/name | Fake/adapter | RED expectation | GREEN assertion |
|---:|---|---|---|---|---|
| 1 | microphone idle | `test/unit/voice-transport.test.ts` / `capture_idle` | fake recognition | no state model | IDLE, no capture |
| 2 | permission request | `test/unit/voice-transport.test.ts` / `capture_permission` | fake recognition | no lazy start | gesture requests permission |
| 3 | listening | `test/unit/voice-transport.test.ts` / `capture_listening` | fake recognition | no transition | LISTENING visible |
| 4 | stop/cancel | `test/unit/voice-transport.test.ts` / `capture_stop_cancel` | fake recognition | callbacks leak | returns IDLE |
| 5 | unsupported browser | `test/unit/voice-transport.test.ts` / `capture_unsupported` | absent constructors | control active | input disabled, manual UI works |
| 6 | recognition errors | `test/unit/voice-transport.test.ts` / `capture_errors` | error injector | errors throw | safe states |
| 7 | interim suppression | `test/unit/voice-transport.test.ts` / `interim_never_submits` | fake recognition/HTTP | interim submits | zero POST |
| 8 | one final action | `test/unit/voice-transport.test.ts` / `one_final_event` | fake recognition | no claim | one resolution |
| 9 | duplicate final | `test/unit/voice-transport.test.ts` / `duplicate_final_callback` | fake recognition | double call | one resolution |
| 10 | stale capture callback after new session | `test/unit/voice-transport.test.ts` / `stale_capture_callback_after_new_session` | two fake sessions, fake resolver/HTTP/UI/confirmation state | A late callback resolves, posts, confirms, or overwrites B | after A starts and B deliberately starts, A resolver count remains 0, A POST count remains 0, A pending confirmation remains 0/unchanged, UI result is not overwritten, B remains current `captureSessionId`; B final resolves exactly once and may continue through normal canonical action flow |
| 11 | forecast phrase | `test/unit/voice-transport.test.ts` / `resolve_forecast` | resolver context | no mapping | FORECAST_QUERY |
| 12 | health phrase | `test/unit/voice-transport.test.ts` / `resolve_health` | resolver context | no mapping | FORECAST_HEALTH_QUERY |
| 13 | recovery phrase | `test/unit/voice-transport.test.ts` / `resolve_recovery` | resolver context | no mapping | RECOVERY_QUERY |
| 14 | preview phrase | `test/unit/voice-transport.test.ts` / `resolve_preview` | resolver context | no mapping | EVIDENCE_PREVIEW |
| 15 | apply confirmation | `test/unit/voice-transport.test.ts` / `apply_requires_confirmation` | field snapshot | immediate POST | PENDING, zero POST |
| 16 | unknown command | `test/unit/voice-transport.test.ts` / `unknown_clarifies` | resolver context | executes | clarification |
| 17 | missing project | `test/unit/voice-transport.test.ts` / `missing_project_clarifies` | project context | guesses | clarification |
| 18 | ambiguous project | `test/unit/voice-transport.test.ts` / `ambiguous_project_clarifies` | project context | tie-breaks | clarification |
| 19 | exact project | `test/unit/voice-transport.test.ts` / `exact_project_id` | project context | no match | exact ID |
| 20 | pending record | `test/unit/voice-transport.test.ts` / `apply_pending_record` | fake clock/snapshot | absent record | immutable PENDING |
| 21 | yes exact action | `test/unit/voice-transport.test.ts` / `yes_consumes_exact` | fake clock/HTTP | late action | CONSUMED before POST |
| 22 | no cancels | `test/unit/voice-transport.test.ts` / `no_cancels` | fake clock | no cancel | CANCELLED |
| 23 | unrelated yes | `test/unit/voice-transport.test.ts` / `unrelated_yes_noop` | confirmation context | revives | zero POST |
| 24 | stale confirmation | `test/unit/voice-transport.test.ts` / `expired_confirmation_noop` | fake clock | stale submits | EXPIRED |
| 25 | new context invalidates | `test/unit/voice-transport.test.ts` / `new_context_invalidates` | context | old remains | invalidated |
| 26 | preview never applies | `test/unit/voice-transport.test.ts` / `preview_never_applies` | fake HTTP | Apply generated | preview only |
| 27 | repeated callback one POST | `test/unit/voice-transport.test.ts` / `callback_one_post` | fake recognition/HTTP | duplicate POST | one POST |
| 28 | uncertain identity | `test/unit/voice-transport.test.ts` / `uncertain_reuses_identity` | fake HTTP | new identity | same identity |
| 29 | definitive identity | `test/unit/voice-transport.test.ts` / `definitive_resolves_identity` | fake HTTP | pending remains | resolved |
| 30 | later identical new identity | `test/unit/voice-transport.test.ts` / `later_identical_new_identity` | fake HTTP | old replayed | new identity |
| 31 | interrupted visible | `test/unit/voice-transport.test.ts` / `interrupted_visible` | workflow context | hidden | visible |
| 32 | exact Resume | `test/unit/voice-transport.test.ts` / `resume_exact_workflow` | workflow/HTTP fake | wrong ID | exact ID |
| 33 | Resume no intent | `test/unit/voice-transport.test.ts` / `resume_never_posts_intent` | fake HTTP | intent POST | zero intent POST |
| 34 | ambiguous Resume | `test/unit/voice-transport.test.ts` / `resume_ambiguous_clarifies` | workflow context | guesses | clarification |
| 35 | concise success | `test/unit/voice-transport.test.ts` / `safe_success_summary` | fake synthesis | raw output | fixed summary |
| 36 | safe blocked | `test/unit/voice-transport.test.ts` / `safe_blocked_summary` | fake synthesis | problem text | safe classification |
| 37 | raw JSON excluded | `test/unit/voice-transport.test.ts` / `raw_json_not_spoken` | fake synthesis | JSON spoken | absent |
| 38 | secret/problem excluded | `test/unit/voice-transport.test.ts` / `secret_problem_not_spoken` | fake synthesis | secret spoken | absent |
| 39 | synthesis fallback | `test/unit/voice-transport.test.ts` / `synthesis_unavailable_visual` | absent synthesis | execution blocked | visual only |
| 40 | admin key excluded | `test/unit/voice-transport.test.ts` / `admin_key_not_history` | memory spy | key retained | absent |
| 41 | Authorization excluded | `test/unit/voice-transport.test.ts` / `authorization_not_spoken` | fake synthesis | header spoken | absent |
| 42 | raw audio absent | `test/unit/voice-transport.test.ts` / `raw_audio_not_persisted` | storage spy | audio stored | zero writes |
| 43 | no live connector | `test/contract/voice-transport.test.ts` / `no_live_connector` | release-gate source scan | connector accepted | no connector |
| 44 | no legacy mutation | `test/contract/voice-transport.test.ts` / `no_legacy_mutation_endpoint` | fake HTTP | legacy call | zero calls |
| 45 | accessible PTT | `test/contract/voice-transport.test.ts` / `push_to_talk_accessible` | DOM harness | missing control | accessible control |
| 46 | keyboard operable | `test/contract/voice-transport.test.ts` / `push_to_talk_keyboard` | DOM harness | pointer-only | keyboard works |
| 47 | listening visible | `test/contract/voice-transport.test.ts` / `listening_state_visible` | DOM harness | hidden | visible |
| 48 | confirmation visible | `test/contract/voice-transport.test.ts` / `confirmation_state_visible` | DOM harness | hidden | prompt visible |
| 49 | responsive integration | `test/contract/voice-transport.test.ts` / `field_voice_responsive` | DOM/CSS harness | layout failure | responsive |
| 50 | Task 16A preserved | `test/contract/admin-ui.test.ts` / `operator_panel_regression` | route fixture | hash changed | unchanged |
| 51 | Task 16B preserved | `test/contract/field-dashboard.test.ts` / `field_dashboard_regression` | route fixture | behavior changed | preserved |
| 52 | Task 17 gate | `test/safety/release-gate.test.ts` / `release_gate_voice_source` | release gate | source missed | voice checked and gate passes |

Every matrix row is implemented by Tasks 1-8; Task 9 executes the complete matrix and regression commands.
