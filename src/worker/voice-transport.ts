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

function commandKind(text: string): VoiceIntentKind | "RESUME" | null {
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

function projectMention(
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

let captureSequence = 0;
export function createCaptureController(options: {
  createRecognition: () => VoiceCaptureRecognition;
  onFinal: (transcript: string, captureSessionId: string) => void;
}): VoiceCaptureController {
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

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function fingerprint(value: unknown): string {
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

export function createVoicePresentation(input: {
  status: "SUCCEEDED" | "BLOCKED" | "FAILED" | "INTERRUPTED";
  projectId: string;
  actionKind: string;
}): {
  status: "RESULT" | "ERROR";
  projectId: string;
  actionKind: string;
  summaryCode: string;
  safeSummary: string;
  requiresConfirmation: boolean;
} {
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

export interface VoiceSpeechPresentation {
  status: "RESULT" | "ERROR";
  projectId: string;
  actionKind: string;
  summaryCode: string;
  safeSummary: string;
  requiresConfirmation: boolean;
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

export function voiceBrowserClient(
  document: {
    getElementById(id: string): {
      textContent: string | null;
      disabled: boolean;
      addEventListener(type: string, handler: () => void): void;
    };
  },
  sessionStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  },
  kernel: {
    computeFormSignature(fields: unknown): string;
    resolveSubmissionIdentity(
      signature: string,
      storage: unknown,
      now: () => string,
      makeId: () => string,
      storageKey?: string,
    ): unknown;
    buildIntentPayload(fields: unknown, identity: unknown): unknown;
    callApi(
      fetcher: unknown,
      storage: unknown,
      adminKey: string,
      path: string,
      options: { method: string; body?: string },
    ): Promise<unknown>;
  },
  fetcher: unknown,
  makeId: () => string,
): void {
  function normalize(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  }

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
  const Recognition =
    browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  if (!Recognition) {
    button.disabled = true;
    status.textContent =
      "Voice input is unavailable in this browser. Manual controls remain available.";
    return;
  }
  let recognition: InstanceType<NonNullable<typeof Recognition>> | null = null;
  let session = 0;
  let finalClaimed = false;
  button.addEventListener("click", () => {
    if (recognition) {
      recognition.abort();
      recognition = null;
      status.textContent = "IDLE";
      return;
    }
    const currentSession = ++session;
    finalClaimed = false;
    recognition = new Recognition();
    recognition.onresult = (event: unknown) => {
      if (!recognition || currentSession !== session || finalClaimed) return;
      const result = event as {
        results?: { isFinal?: boolean; 0?: { transcript?: string } }[];
      };
      const first = result.results?.[0];
      if (!first?.isFinal || typeof first[0]?.transcript !== "string") return;
      finalClaimed = true;
      const transcript = first[0].transcript.trim();
      status.textContent = `RESOLVING: ${transcript}`;
      const normalized = normalize(transcript);
      const projectId = normalized.includes("deboard") ? "deboard-v091" : null;
      if (!projectId) {
        status.textContent = "ERROR: specify a known project ID";
        return;
      }
      if (normalized.includes("apply")) {
        status.textContent = `CONFIRMATION_REQUIRED: Apply evidence to ${projectId} in shadow mode?`;
        return;
      }
      const kind = normalized.includes("recover")
        ? "RECOVERY_QUERY"
        : normalized.includes("health") || normalized.includes("block")
          ? "FORECAST_HEALTH_QUERY"
          : normalized.includes("preview")
            ? "EVIDENCE_PREVIEW"
            : "FORECAST_QUERY";
      const fields = {
        kind,
        projectId,
        expectedRevision: null,
        evidenceEvent: null,
      };
      const storageKey = `howler_voice_pending_${projectId}_${kind}`;
      const identity = kernel.resolveSubmissionIdentity(
        kernel.computeFormSignature(fields),
        sessionStorage,
        () => new Date().toISOString(),
        makeId,
        storageKey,
      );
      status.textContent = "SUBMITTING";
      void kernel
        .callApi(
          fetcher,
          sessionStorage,
          sessionStorage.getItem("howler_admin_key") ?? "",
          "/v1/intents",
          {
            method: "POST",
            body: JSON.stringify(kernel.buildIntentPayload(fields, identity)),
          },
        )
        .then(() => {
          status.textContent = "RESULT";
          speakVoicePresentation({
            status: "RESULT",
            projectId,
            actionKind: kind,
            summaryCode: "completed",
            safeSummary: `${projectId} ${kind} completed.`,
            requiresConfirmation: false,
          });
        })
        .catch(() => {
          status.textContent = "ERROR";
        });
    };
    recognition.onerror = (event: unknown) => {
      const error = event as { error?: string };
      status.textContent = `ERROR: ${error.error ?? "recognition"}`;
      recognition = null;
    };
    recognition.onend = () => {
      if (currentSession === session && recognition) {
        recognition = null;
        status.textContent = finalClaimed ? "RESULT" : "IDLE";
      }
    };
    status.textContent = "REQUESTING_PERMISSION";
    try {
      recognition.start();
      status.textContent = "LISTENING";
    } catch {
      status.textContent = "ERROR: recognition could not start";
      recognition = null;
    }
  });
}
