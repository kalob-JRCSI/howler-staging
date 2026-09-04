# Howler v0.9.5 Task 18 Voice Transport Pilot

## Status and scope

Design for review. No voice runtime is implemented by this document.

Task 18 adds persistent-page-session push-to-talk to `/admin/field`. Voice is only a transport into the accepted Task 15-17 operator system. It adds no forecasting, recovery, mutation, retry, revision, or idempotency engine. The legacy `/` and `/admin` dashboard and `/admin/operator` remain unchanged.

The earlier foundation-plan Task 18 deployment section is deferred/renamed and is not authority for this voice-transport Task 18. There is no wake word, background listener, native client, paid speech vendor, live connector, or raw audio persistence.

## Architecture and browser feasibility

Use a focused shared client transport module with thin field-dashboard wiring:

- `VoiceCaptureAdapter` owns browser recognition lifecycle and emits text.
- `VoiceTranscript` carries text and capture-session ownership metadata.
- `VoiceCommandResolver` maps text to an accepted IntentV1 candidate, confirmation request, clarification, or exact Resume action.
- `VoiceResponsePresenter` consumes only a strict allowlisted presentation model.

The adapter feature-detects recognition independently as `window.SpeechRecognition || window.webkitSpeechRecognition` and synthesis as `window.speechSynthesis && window.SpeechSynthesisUtterance`. Web Speech may be browser/vendor-backed; the pilot makes no local/offline guarantee. Recognition is started only from the explicit microphone gesture. If unavailable, voice input is disabled while the manual field dashboard remains functional. If synthesis is unavailable, the visual result remains and workflow execution is never blocked.

`Persistent session` means state persists while the page is open. It does not mean continuous capture, background listening, or permanent permission.

Recognition errors `not-allowed`, `service-not-allowed`, `audio-capture`, `no-speech`, `aborted`, `network`, and synchronous `start()` throws map to safe visual error states. `stop()` finishes the current capture where the browser allows a final result; `abort()` cancels it and rejects late callbacks.

## Capture ownership

States are `IDLE`, `REQUESTING_PERMISSION`, `LISTENING`, `TRANSCRIBING`, `RESOLVING`, `CONFIRMATION_REQUIRED`, `SUBMITTING`, `RESULT`, and `ERROR`.

Every deliberate push-to-talk capture creates a unique `captureSessionId` and starts with `finalClaimed = false`. Interim results never resolve or submit. When the first accepted final result arrives, the adapter synchronously sets `finalClaimed = true` before resolution. Later final callbacks for that session are no-ops. A new deliberate capture gets a new ID and may repeat the same spoken text as a new action. Callbacks from stopped, aborted, or superseded sessions are ignored by session ID.

## Command and project resolution

Supported commands map only to `FORECAST_QUERY`, `FORECAST_HEALTH_QUERY`, `RECOVERY_QUERY`, `EVIDENCE_PREVIEW`, `EVIDENCE_APPLY_SHADOW`, or exact Resume. The browser never constructs evidence business data from speech.

The field dashboard tracks project IDs, not an authoritative name directory. Normalize only by trimming, case-folding, and collapsing whitespace. Mutation targeting requires an exact normalized `projectId`. The pilot has no fuzzy matching. Read-only commands may use an exact explicit alias already present in current UI/session state; aliases use the same normalization, must resolve to one project, and are displayed visibly. Missing or ambiguous matches clarify; there is no hidden tie-break and no invented project.

Resume considers only known `INTERRUPTED`/resumable workflows in current field/session state: zero matches clarifies, one match uses its exact stored `workflowId`, and more than one asks which workflow. Resume calls `POST /v1/workflows/:workflowId/resume` and never `POST /v1/intents`.

## Immutable Apply confirmation

The spoken Apply request does not create evidence data. It asks the existing field control model for its current canonical evidence snapshot. The resulting session-local record is:

```ts
type PendingVoiceConfirmation = {
  confirmationId: string;
  createdAt: number;
  expiresAt: number;
  projectId: string;
  intentKind: "EVIDENCE_APPLY_SHADOW";
  expectedProjectRevision?: number;
  canonicalEvidence: unknown;
  immutableSnapshot: unknown;
  snapshotFingerprint: string;
  captureSessionId: string;
  state: "PENDING" | "CONSUMED" | "CANCELLED" | "EXPIRED";
};
```

`canonicalEvidence` is copied from existing accepted field-control state, deep-copied, frozen/treated as immutable, and fingerprinted deterministically. The pilot expiry is 30 seconds. An injected clock and injected timer/scheduler make expiry deterministic; tests advance the clock and invoke the scheduled expiry callback without wall-clock sleeps.

Apply transitions to `PENDING`. An affirmative response verifies PENDING, non-expiry, the same confirmation/context, and the fingerprint, then synchronously marks `CONSUMED` before exactly one network submission. Duplicate or late affirmations no-op. Negative confirmation marks `CANCELLED`; timeout marks `EXPIRED`. A new incompatible command or replaced project context invalidates the old record. Preview never escalates to Apply.

## Submission identity and safety

Reuse the accepted Task 16A/16B submission kernel. Uncertain delivery keeps the same pending identity; a definitive outcome resolves it; a later deliberate identical command gets a new identity. Recognition event ownership prevents duplicate callbacks from making duplicate logical actions.

Fresh actions call only `POST /v1/intents` with accepted IntentV1 payloads. Apply confirmation submits the immutable snapshot and expected revision from the existing control state. No legacy event preview/apply endpoint is called.

Define the spoken-safe allowlist:

```ts
type VoicePresentation = {
  status: "RESULT" | "ERROR" | "CLARIFICATION";
  projectId?: string;
  actionKind?: string;
  summaryCode: string;
  safeSummary: string;
  workflowState?: string;
  requiresConfirmation: boolean;
};
```

Only `VoicePresentation.safeSummary` from fixed result-classification templates may reach `speak()`. Raw response bodies, ResultV1 JSON, WorkflowProblem messages/details, authorization, headers, admin keys, evidence payloads, exception text, and stack traces are structurally excluded. Missing templates produce a visual-only generic failure. Current transcript/result state stays in memory on the active page only; no transcript is written to sessionStorage, localStorage, D1, or another history store. Raw audio is never stored.

## Field integration and gates

Add one accessible push-to-talk control and a live region to `/admin/field` for current transcript, resolved project/action, workflow state, confirmation, safe result, and clarification/error. Existing project cards remain the authoritative detail view.

Task 17 release-gate source discovery must include the new voice client source in the browser architectural-boundary, explicit-APPLY, and live-connector checks, automatically or through an explicit source list. Gates must not be weakened. Final validation runs both `npm run verify` and `npm run gate:release`; the latter must pass with exactly the two already accepted baseline defects visible and independently classified.

## Test strategy

Use fake recognition, fake clock/timer, fake field-control snapshot, fake transport, fake speech synthesis, and fake workflow context. Cover the 51-scenario acceptance matrix in the implementation plan before runtime wiring is merged.
