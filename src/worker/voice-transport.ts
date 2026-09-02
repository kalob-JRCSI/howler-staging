// Task 18 shipped-path correction: every function below that the browser needs at runtime is a
// standalone, self-contained, directly-testable top-level export -- exactly the
// `createSubmissionKernel`/`speakVoicePresentation` pattern already used elsewhere in this file's
// sibling `admin.ts`. Each is `.toString()`-embedded verbatim into the field dashboard's
// `<script>` tag (see `fieldDashboardHtml`), so none may reference module-level `let`/`const`
// state or another module's import -- only its own parameters, locals, and (by name, since
// function declarations in one `<script>` are visible to all following statements in that same
// script) other functions embedded the same way. `voiceBrowserClient` at the bottom is the ONLY
// thing actually served to the browser; it calls these functions directly rather than
// reimplementing any of their logic, so there is exactly one tested voice behavior path, not two.

export type VoiceIntentKind =
  | "FORECAST_QUERY"
  | "FORECAST_HEALTH_QUERY"
  | "RECOVERY_QUERY"
  | "EVIDENCE_PREVIEW"
  | "EVIDENCE_APPLY_SHADOW";

export interface VoiceProjectContext {
  projectIds: string[];
  aliases: { alias: string; projectId: string }[];
  evidenceSnapshot?: unknown;
  expectedProjectRevision?: number;
  resumableWorkflows?: { workflowId: string; projectId: string }[];
}

export type VoiceCommandResolution =
  | { kind: "INTENT"; intentKind: VoiceIntentKind; projectId: string }
  | {
      kind: "CONFIRMATION_REQUIRED";
      projectId: string;
      evidenceSnapshot: unknown;
      expectedProjectRevision?: number;
    }
  | { kind: "RESUME"; projectId: string; workflowId: string }
  | { kind: "CLARIFICATION"; message: string };

export function normalizeProjectId(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function commandKind(text: string): VoiceIntentKind | "RESUME" | null {
  const value = normalizeProjectId(text);
  if (/\bresume\b/.test(value)) return "RESUME";
  if (/\bapply\b/.test(value)) return "EVIDENCE_APPLY_SHADOW";
  if (/\bpreview\b/.test(value) && /\bevidence\b/.test(value))
    return "EVIDENCE_PREVIEW";
  if (/\brecover(y|ing)?\b/.test(value)) return "RECOVERY_QUERY";
  if (/\b(block|blocking|health|healthy)\b/.test(value))
    return "FORECAST_HEALTH_QUERY";
  if (/\bforecast\b/.test(value)) return "FORECAST_QUERY";
  return null;
}

export function projectMention(
  text: string,
  context: VoiceProjectContext,
): string | null {
  const normalizedText = normalizeProjectId(text);
  const matches = context.projectIds.filter((id) =>
    normalizedText.includes(normalizeProjectId(id)),
  );
  if (matches.length === 1) return matches[0] ?? null;
  const aliases = context.aliases.filter((alias) =>
    normalizedText.includes(normalizeProjectId(alias.alias)),
  );
  const aliasIds = aliases
    .map((alias) => alias.projectId)
    .filter((id, index, all) => all.indexOf(id) === index);
  return aliasIds.length === 1 ? (aliasIds[0] ?? null) : null;
}

export function resolveVoiceCommand(
  text: string,
  context: VoiceProjectContext,
): VoiceCommandResolution {
  const kind = commandKind(text);
  if (!kind)
    return {
      kind: "CLARIFICATION",
      message: "I could not confidently resolve that command.",
    };
  if (kind === "RESUME") {
    const workflows = context.resumableWorkflows ?? [];
    if (workflows.length !== 1)
      return {
        kind: "CLARIFICATION",
        message: "Which interrupted workflow should I resume?",
      };
    const workflow = workflows[0];
    return workflow
      ? {
          kind: "RESUME",
          workflowId: workflow.workflowId,
          projectId: workflow.projectId,
        }
      : {
          kind: "CLARIFICATION",
          message: "No resumable workflow is available.",
        };
  }
  const projectId = projectMention(text, context);
  if (!projectId)
    return { kind: "CLARIFICATION", message: "Which project do you mean?" };
  if (kind === "EVIDENCE_APPLY_SHADOW") {
    if (context.evidenceSnapshot === undefined)
      return {
        kind: "CLARIFICATION",
        message: "I need the existing evidence selection before applying it.",
      };
    return context.expectedProjectRevision === undefined
      ? {
          kind: "CONFIRMATION_REQUIRED",
          projectId,
          evidenceSnapshot: context.evidenceSnapshot,
        }
      : {
          kind: "CONFIRMATION_REQUIRED",
          projectId,
          evidenceSnapshot: context.evidenceSnapshot,
          expectedProjectRevision: context.expectedProjectRevision,
        };
  }
  return { kind: "INTENT", intentKind: kind, projectId };
}

export interface VoiceCaptureRecognition {
  start(): void;
  stop(): void;
  abort(): void;
  on(event: string, handler: (value?: unknown) => void): void;
}

export interface VoiceCaptureController {
  start(): void;
  stop(): void;
  abort(): void;
  currentSessionId(): string | null;
}

/**
 * `captureSequence` is deliberately a local inside the function body (not module scope): a
 * `.toString()`-embedded function only carries its own source text, so any module-level state it
 * referenced by name would be a `ReferenceError` the first time the real page ran it -- invisible
 * to every test here, which all call this function directly within the module. Each call gets its
 * own fresh counter; nothing anywhere compares session ids across two different controllers.
 */
export function createCaptureController(options: {
  createRecognition: () => VoiceCaptureRecognition;
  onFinal: (transcript: string, captureSessionId: string) => void;
}): VoiceCaptureController {
  let captureSequence = 0;
  let active: {
    id: string;
    recognition: VoiceCaptureRecognition;
    finalClaimed: boolean;
  } | null = null;
  function start(): void {
    active?.recognition.abort();
    const current = {
      id: `capture-${String(++captureSequence)}`,
      recognition: options.createRecognition(),
      finalClaimed: false,
    };
    active = current;
    current.recognition.on("result", (value) => {
      if (
        active !== current ||
        current.finalClaimed ||
        !value ||
        typeof value !== "object"
      )
        return;
      const event = value as { isFinal?: boolean; transcript?: string };
      if (!event.isFinal || typeof event.transcript !== "string") return;
      current.finalClaimed = true;
      // A claimed final ends this capture -- the controller is no longer "in progress", so the
      // next deliberate start (a fresh push-to-talk press) begins a genuinely new session rather
      // than the caller's next press being misread as "abort the one that already finished".
      if (active === current) active = null;
      options.onFinal(event.transcript, current.id);
    });
    current.recognition.start();
  }
  return {
    start,
    stop: () => active?.recognition.stop(),
    abort: () => {
      active?.recognition.abort();
      active = null;
    },
    currentSessionId: () => active?.id ?? null,
  };
}

export interface PendingVoiceConfirmation {
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
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

export function fingerprint(value: unknown): string {
  const text = stableSerialize(value);
  let hash = 2166136261;
  for (const char of text)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex.repeat(8);
}

export function createPendingVoiceConfirmation(input: {
  confirmationId: string;
  projectId: string;
  evidenceSnapshot: unknown;
  captureSessionId: string;
  createdAt: number;
  expectedProjectRevision?: number;
}): PendingVoiceConfirmation {
  const snapshot = JSON.parse(
    JSON.stringify(input.evidenceSnapshot),
  ) as unknown;
  const confirmation: PendingVoiceConfirmation = {
    confirmationId: input.confirmationId,
    createdAt: input.createdAt,
    expiresAt: input.createdAt + 30_000,
    projectId: input.projectId,
    intentKind: "EVIDENCE_APPLY_SHADOW",
    canonicalEvidence: snapshot,
    immutableSnapshot: snapshot,
    snapshotFingerprint: fingerprint(snapshot),
    captureSessionId: input.captureSessionId,
    state: "PENDING",
  };
  if (input.expectedProjectRevision !== undefined)
    confirmation.expectedProjectRevision = input.expectedProjectRevision;
  return confirmation;
}

export type VoiceConfirmationResponseKind =
  "AFFIRMATIVE" | "NEGATIVE" | "OTHER";

/** Classifies a spoken response as a yes/no answer to a pending confirmation, or as an unrelated
 * utterance (which invalidates the pending confirmation rather than being misread as an answer to
 * it -- see `resolveAndDispatch` in `voiceBrowserClient`). */
export function classifyConfirmationResponse(
  text: string,
): VoiceConfirmationResponseKind {
  const value = normalizeProjectId(text);
  if (/\b(yes|yeah|yep|affirmative|confirm|correct)\b/.test(value))
    return "AFFIRMATIVE";
  if (/\b(no|nope|negative|cancel|stop)\b/.test(value)) return "NEGATIVE";
  return "OTHER";
}

export type VoiceConfirmationOutcome =
  | { outcome: "CONSUMED"; confirmation: PendingVoiceConfirmation }
  | { outcome: "CANCELLED"; confirmation: PendingVoiceConfirmation }
  | { outcome: "NOOP"; confirmation: PendingVoiceConfirmation; reason: string };

/**
 * The critical invariant: an affirmative response against a genuinely PENDING, non-expired
 * confirmation is transitioned to CONSUMED and returned synchronously -- the caller submits only
 * after seeing `outcome: "CONSUMED"`, never before, and never a second time for the same
 * confirmation object (it is no longer PENDING once this returns). Never mutates its input;
 * returns a new confirmation value so a caller cannot accidentally observe a half-updated state.
 */
export function respondToVoiceConfirmation(
  confirmation: PendingVoiceConfirmation,
  response: { affirmative: boolean },
  now: number,
): VoiceConfirmationOutcome {
  if (confirmation.state !== "PENDING") {
    return {
      outcome: "NOOP",
      confirmation,
      reason: `confirmation is ${confirmation.state}`,
    };
  }
  if (now >= confirmation.expiresAt) {
    return {
      outcome: "NOOP",
      confirmation: { ...confirmation, state: "EXPIRED" },
      reason: "confirmation expired",
    };
  }
  if (!response.affirmative) {
    return {
      outcome: "CANCELLED",
      confirmation: { ...confirmation, state: "CANCELLED" },
    };
  }
  return {
    outcome: "CONSUMED",
    confirmation: { ...confirmation, state: "CONSUMED" },
  };
}

export interface VoiceSpeechPresentation {
  status: "RESULT" | "ERROR";
  projectId: string;
  actionKind: string;
  summaryCode: string;
  safeSummary: string;
  requiresConfirmation: boolean;
}

export function createVoicePresentation(input: {
  status: "SUCCEEDED" | "BLOCKED" | "FAILED" | "INTERRUPTED";
  projectId: string;
  actionKind: string;
}): VoiceSpeechPresentation {
  const status = input.status === "SUCCEEDED" ? "RESULT" : "ERROR";
  const summaryCode = input.status.toLowerCase();
  return {
    status,
    projectId: input.projectId,
    actionKind: input.actionKind,
    summaryCode,
    safeSummary:
      input.status === "SUCCEEDED"
        ? `${input.projectId} ${input.actionKind} completed.`
        : `${input.projectId} ${input.actionKind} needs attention.`,
    requiresConfirmation: false,
  };
}

/** A Task 15 `run.state`/`workflowState` string that falls outside the four recognized terminal
 * states (an unexpected shape, mid-flight state, or anything else not yet classifiable) is always
 * treated as a safe generic failure for voice purposes -- never spoken as success, never thrown. */
export function classifyWorkflowStateForVoice(
  workflowState: string,
): "SUCCEEDED" | "BLOCKED" | "FAILED" | "INTERRUPTED" {
  if (
    workflowState === "SUCCEEDED" ||
    workflowState === "BLOCKED" ||
    workflowState === "FAILED" ||
    workflowState === "INTERRUPTED"
  )
    return workflowState;
  return "FAILED";
}

export function speakVoicePresentation(
  presentation: VoiceSpeechPresentation,
  platform: {
    speechSynthesis?: { speak(utterance: unknown): void };
    SpeechSynthesisUtterance?: new (text: string) => unknown;
  } = globalThis as unknown as {
    speechSynthesis?: { speak(utterance: unknown): void };
    SpeechSynthesisUtterance?: new (text: string) => unknown;
  },
): boolean {
  if (!platform.speechSynthesis || !platform.SpeechSynthesisUtterance)
    return false;
  try {
    const utterance = new platform.SpeechSynthesisUtterance(
      presentation.safeSummary,
    );
    platform.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * The minimal integration surface the shipped voice client needs from the field dashboard's own
 * closure (`fieldDashboardClientScript`'s return value) -- real tracked projects, real resumable
 * workflows, real per-project evidence form state, and the exact same submission functions the
 * manual UI buttons call, so voice can never diverge from the manual path's identity/idempotency
 * behavior. Voice never re-implements a query/apply/resume call of its own.
 */
export interface FieldVoiceBridge {
  listProjectIds(): string[];
  listResumableWorkflows(): {
    workflowId: string;
    projectId: string;
    kind: string;
  }[];
  getEvidenceFields(projectId: string): {
    evidenceSnapshot: unknown;
    expectedProjectRevision: number | undefined;
  } | null;
  submitQuery(
    projectId: string,
    kind: string,
  ): Promise<{ workflowState: string }>;
  submitPreview(
    projectId: string,
    evidenceSnapshot: unknown,
    expectedProjectRevision: number | undefined,
  ): Promise<{ workflowState: string }>;
  submitApply(
    confirmation: PendingVoiceConfirmation,
  ): Promise<{ workflowState: string }>;
  resumeWorkflow(
    projectId: string,
    kind: string,
  ): Promise<{ workflowState: string }>;
}

export function voiceBrowserClient(
  document: {
    getElementById(id: string): {
      textContent: string | null;
      disabled: boolean;
      addEventListener(type: string, handler: () => void): void;
    };
  },
  bridge: FieldVoiceBridge,
  makeId: () => string,
  platform: {
    speechSynthesis?: { speak(utterance: unknown): void };
    SpeechSynthesisUtterance?: new (text: string) => unknown;
  } = globalThis as unknown as {
    speechSynthesis?: { speak(utterance: unknown): void };
    SpeechSynthesisUtterance?: new (text: string) => unknown;
  },
): void {
  const button = document.getElementById("voice-push-to-talk");
  const status = document.getElementById("voice-status");
  const browser = globalThis as unknown as {
    SpeechRecognition?: new () => {
      onresult: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      start(): void;
      stop(): void;
      abort(): void;
    };
    webkitSpeechRecognition?: new () => {
      onresult: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      start(): void;
      stop(): void;
      abort(): void;
    };
  };
  const detectedRecognition =
    browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  if (!detectedRecognition) {
    button.disabled = true;
    status.textContent =
      "Voice input is unavailable in this browser. Manual controls remain available.";
    return;
  }
  const Recognition = detectedRecognition;

  let activeConfirmation: PendingVoiceConfirmation | null = null;

  function speakOutcome(
    workflowState: string,
    projectId: string,
    actionKind: string,
  ): void {
    const presentation = createVoicePresentation({
      status: classifyWorkflowStateForVoice(workflowState),
      projectId,
      actionKind,
    });
    speakVoicePresentation(presentation, platform);
  }

  function resolveAndDispatch(
    rawTranscript: string,
    captureSessionId: string,
  ): void {
    const transcript = rawTranscript.trim();
    status.textContent = `RESOLVING: ${transcript}`;
    const now = Date.now();

    if (activeConfirmation && activeConfirmation.state === "PENDING") {
      const responseKind = classifyConfirmationResponse(transcript);
      if (responseKind !== "OTHER") {
        const outcome = respondToVoiceConfirmation(
          activeConfirmation,
          { affirmative: responseKind === "AFFIRMATIVE" },
          now,
        );
        activeConfirmation = outcome.confirmation;
        if (outcome.outcome === "CONSUMED") {
          const confirmed = outcome.confirmation;
          status.textContent = "SUBMITTING";
          bridge
            .submitApply(confirmed)
            .then((result) => {
              status.textContent = "RESULT";
              speakOutcome(
                result.workflowState,
                confirmed.projectId,
                "EVIDENCE_APPLY_SHADOW",
              );
            })
            .catch(() => {
              status.textContent = "ERROR";
            });
        } else if (outcome.outcome === "CANCELLED") {
          status.textContent = "CANCELLED";
        } else {
          status.textContent = `CLARIFICATION: ${outcome.reason}`;
        }
        return;
      }
      // A new, unrelated utterance while a confirmation is pending invalidates it rather than
      // ever being misread as a stale "yes" later.
      activeConfirmation = { ...activeConfirmation, state: "CANCELLED" };
    }

    const projectIds = bridge.listProjectIds();
    const resumable = bridge.listResumableWorkflows();
    const mentionedProjectId = projectMention(transcript, {
      projectIds,
      aliases: [],
    });
    const evidenceFields = mentionedProjectId
      ? bridge.getEvidenceFields(mentionedProjectId)
      : null;

    const context: VoiceProjectContext = {
      projectIds,
      aliases: [],
      resumableWorkflows: resumable.map(({ workflowId, projectId }) => ({
        workflowId,
        projectId,
      })),
    };
    if (evidenceFields && evidenceFields.evidenceSnapshot !== undefined) {
      context.evidenceSnapshot = evidenceFields.evidenceSnapshot;
    }
    if (
      evidenceFields &&
      evidenceFields.expectedProjectRevision !== undefined
    ) {
      context.expectedProjectRevision = evidenceFields.expectedProjectRevision;
    }

    const resolution = resolveVoiceCommand(transcript, context);
    if (resolution.kind === "CLARIFICATION") {
      status.textContent = `CLARIFICATION: ${resolution.message}`;
      return;
    }
    if (resolution.kind === "RESUME") {
      const match = resumable.find(
        (workflow) => workflow.workflowId === resolution.workflowId,
      );
      if (!match) {
        status.textContent =
          "CLARIFICATION: that workflow is no longer available.";
        return;
      }
      status.textContent = "SUBMITTING";
      bridge
        .resumeWorkflow(match.projectId, match.kind)
        .then((result) => {
          status.textContent = "RESULT";
          speakOutcome(result.workflowState, match.projectId, match.kind);
        })
        .catch(() => {
          status.textContent = "ERROR";
        });
      return;
    }
    if (resolution.kind === "CONFIRMATION_REQUIRED") {
      activeConfirmation = createPendingVoiceConfirmation({
        confirmationId: makeId(),
        projectId: resolution.projectId,
        evidenceSnapshot: resolution.evidenceSnapshot,
        captureSessionId,
        createdAt: now,
        ...(resolution.expectedProjectRevision !== undefined
          ? { expectedProjectRevision: resolution.expectedProjectRevision }
          : {}),
      });
      status.textContent = `CONFIRMATION_REQUIRED: Apply evidence to ${resolution.projectId} in shadow mode? Say yes or no.`;
      return;
    }
    // resolution.kind === "INTENT"
    status.textContent = "SUBMITTING";
    const submission =
      resolution.intentKind === "EVIDENCE_PREVIEW"
        ? bridge.submitPreview(
            resolution.projectId,
            evidenceFields?.evidenceSnapshot,
            evidenceFields?.expectedProjectRevision,
          )
        : bridge.submitQuery(resolution.projectId, resolution.intentKind);
    submission
      .then((result) => {
        status.textContent = "RESULT";
        speakOutcome(
          result.workflowState,
          resolution.projectId,
          resolution.intentKind,
        );
      })
      .catch(() => {
        status.textContent = "ERROR";
      });
  }

  function createRecognition(): VoiceCaptureRecognition {
    const instance = new Recognition();
    const handlers = new Map<string, (value?: unknown) => void>();
    let sawFinal = false;
    instance.onresult = (event: unknown) => {
      const result = event as {
        results?: { isFinal?: boolean; 0?: { transcript?: string } }[];
      };
      const first = result.results?.[0];
      if (!first) return;
      if (first.isFinal) sawFinal = true;
      handlers.get("result")?.({
        isFinal: Boolean(first.isFinal),
        transcript: first[0]?.transcript,
      });
    };
    instance.onerror = (event: unknown) => {
      const error = event as { error?: string };
      status.textContent = `ERROR: ${error.error ?? "recognition"}`;
    };
    instance.onend = () => {
      status.textContent = sawFinal ? "RESULT" : "IDLE";
    };
    return {
      start: () => {
        instance.start();
      },
      stop: () => {
        instance.stop();
      },
      abort: () => {
        instance.abort();
      },
      on: (event, handler) => handlers.set(event, handler),
    };
  }

  const controller = createCaptureController({
    createRecognition,
    onFinal: (transcript, captureSessionId) => {
      resolveAndDispatch(transcript, captureSessionId);
    },
  });

  button.addEventListener("click", () => {
    if (controller.currentSessionId() !== null) {
      controller.abort();
      status.textContent = "IDLE";
      return;
    }
    status.textContent = "REQUESTING_PERMISSION";
    try {
      controller.start();
      status.textContent = "LISTENING";
    } catch {
      status.textContent = "ERROR: recognition could not start";
    }
  });
}
