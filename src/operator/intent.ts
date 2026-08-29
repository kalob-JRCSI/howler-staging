// Canonical v1 intent contract and validation, transcribed from
// docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md §8.1. Pure schema/business
// validation only — no persistence, no HTTP, no D1, no external calls.

import type { EventMutationV094 } from "../domain/types";
import type { WorkflowProblem } from "./workflow";

export type IntentKind =
  | "FORECAST_QUERY"
  | "FORECAST_HEALTH_QUERY"
  | "RECOVERY_QUERY"
  | "EVIDENCE_PREVIEW"
  | "EVIDENCE_APPLY_SHADOW";

export type RequestedEffect = "READ_ONLY" | "PREVIEW" | "APPLY_SHADOW";

export interface ProjectEventInput {
  id: string;
  baseRevision: number;
  projectId: string;
  type: string; // validated v0.9.4 event type
  occurredAt: string;
  receivedAt: string;
  sourceIds: string[];
  verification: string; // validated v0.9.4 verification state
  impactSeedActivityIds: string[];
  mutations: EventMutationV094[];
  payload: Record<string, unknown>;
  note?: string;
  causeCode?: string;
  causeVerification?: string;
}

export interface IntentV1 {
  schemaVersion: "1";
  intentId: string; // required UUID generated once by the client/UI
  idempotencyKey: string; // 1..128 visible ASCII chars
  projectId: string;
  kind: IntentKind;
  requestedEffect: RequestedEffect;
  expectedProjectRevision: number | null;
  submittedAt: string; // ISO-8601 timestamp
  source: {
    channel: "OPERATOR_UI" | "API";
    operatorLabel?: string; // audit label, not an authorization identity
  };
  payload: { type: "QUERY" } | { type: "EVIDENCE"; event: ProjectEventInput };
}

const QUERY_KINDS: readonly IntentKind[] = [
  "FORECAST_QUERY",
  "FORECAST_HEALTH_QUERY",
  "RECOVERY_QUERY",
];

export const REQUIRED_EFFECT_BY_KIND: Record<IntentKind, RequestedEffect> = {
  FORECAST_QUERY: "READ_ONLY",
  FORECAST_HEALTH_QUERY: "READ_ONLY",
  RECOVERY_QUERY: "READ_ONLY",
  EVIDENCE_PREVIEW: "PREVIEW",
  EVIDENCE_APPLY_SHADOW: "APPLY_SHADOW",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "1..128 visible ASCII chars" — printable, non-whitespace, non-control (0x21-0x7E).
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7E]{1,128}$/;

function problem(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): WorkflowProblem {
  return {
    code,
    category: "VALIDATION",
    message,
    retryable: false,
    ...(details ? { details } : {}),
  };
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RawEventShape {
  id?: unknown;
  baseRevision?: unknown;
  projectId?: unknown;
  type?: unknown;
  occurredAt?: unknown;
  receivedAt?: unknown;
  sourceIds?: unknown;
  verification?: unknown;
  impactSeedActivityIds?: unknown;
  mutations?: unknown;
  payload?: unknown;
  note?: unknown;
  causeCode?: unknown;
  causeVerification?: unknown;
}

function validateEvent(
  raw: unknown,
  intentProjectId: string,
  expectedProjectRevision: number | null,
  problems: WorkflowProblem[],
): void {
  if (!isRecord(raw)) {
    problems.push(
      problem("EVENT_NOT_OBJECT", "Evidence event must be an object"),
    );
    return;
  }
  const event = raw as RawEventShape;

  if (typeof event.id !== "string" || event.id.length === 0) {
    problems.push(
      problem(
        "EVENT_ID_INVALID",
        "Evidence event id must be a non-empty string",
      ),
    );
  }
  if (!Number.isInteger(event.baseRevision)) {
    problems.push(
      problem(
        "EVENT_BASE_REVISION_INVALID",
        "Evidence event baseRevision must be an integer",
      ),
    );
  } else if (event.baseRevision !== expectedProjectRevision) {
    problems.push(
      problem(
        "EVENT_REVISION_MISMATCH",
        "Evidence event baseRevision must equal the intent's expectedProjectRevision",
        { baseRevision: event.baseRevision, expectedProjectRevision },
      ),
    );
  }
  if (typeof event.projectId !== "string" || event.projectId.length === 0) {
    problems.push(
      problem(
        "EVENT_PROJECT_ID_INVALID",
        "Evidence event projectId must be a non-empty string",
      ),
    );
  } else if (event.projectId !== intentProjectId) {
    problems.push(
      problem(
        "EVENT_PROJECT_ID_MISMATCH",
        "Evidence event projectId must equal the intent's projectId",
        { eventProjectId: event.projectId, intentProjectId },
      ),
    );
  }
  if (typeof event.type !== "string" || event.type.length === 0) {
    problems.push(
      problem(
        "EVENT_TYPE_INVALID",
        "Evidence event type must be a non-empty string",
      ),
    );
  }
  if (!isValidTimestamp(event.occurredAt)) {
    problems.push(
      problem(
        "EVENT_OCCURRED_AT_INVALID",
        "Evidence event occurredAt must be an ISO-8601 timestamp",
      ),
    );
  }
  if (!isValidTimestamp(event.receivedAt)) {
    problems.push(
      problem(
        "EVENT_RECEIVED_AT_INVALID",
        "Evidence event receivedAt must be an ISO-8601 timestamp",
      ),
    );
  }
  if (!Array.isArray(event.sourceIds)) {
    problems.push(
      problem(
        "EVENT_SOURCE_IDS_INVALID",
        "Evidence event sourceIds must be an array",
      ),
    );
  }
  if (
    typeof event.verification !== "string" ||
    event.verification.length === 0
  ) {
    problems.push(
      problem(
        "EVENT_VERIFICATION_INVALID",
        "Evidence event verification must be a non-empty string",
      ),
    );
  }
  if (!Array.isArray(event.impactSeedActivityIds)) {
    problems.push(
      problem(
        "EVENT_IMPACT_SEED_ACTIVITY_IDS_INVALID",
        "Evidence event impactSeedActivityIds must be an array",
      ),
    );
  }
  if (!Array.isArray(event.mutations)) {
    problems.push(
      problem(
        "EVENT_MUTATIONS_INVALID",
        "Evidence event mutations must be an array",
      ),
    );
  }
  if (!isRecord(event.payload)) {
    problems.push(
      problem(
        "EVENT_PAYLOAD_INVALID",
        "Evidence event payload must be an object",
      ),
    );
  }
}

export type IntentValidationResult =
  | { valid: true; intent: IntentV1 }
  | { valid: false; problems: WorkflowProblem[] };

interface RawIntentShape {
  schemaVersion?: unknown;
  intentId?: unknown;
  idempotencyKey?: unknown;
  projectId?: unknown;
  kind?: unknown;
  requestedEffect?: unknown;
  expectedProjectRevision?: unknown;
  submittedAt?: unknown;
  source?: unknown;
  payload?: unknown;
}

export function validateIntent(input: unknown): IntentValidationResult {
  const problems: WorkflowProblem[] = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      problems: [problem("INTENT_NOT_OBJECT", "Intent must be an object")],
    };
  }
  const raw = input as RawIntentShape;

  if (raw.schemaVersion !== "1") {
    problems.push(
      problem("INTENT_SCHEMA_VERSION_INVALID", 'schemaVersion must be "1"'),
    );
  }

  if (typeof raw.intentId !== "string" || !UUID_PATTERN.test(raw.intentId)) {
    problems.push(
      problem("INTENT_ID_INVALID_UUID", "intentId must be a valid UUID"),
    );
  }

  if (
    typeof raw.idempotencyKey !== "string" ||
    !VISIBLE_ASCII_PATTERN.test(raw.idempotencyKey)
  ) {
    problems.push(
      problem(
        "IDEMPOTENCY_KEY_INVALID",
        "idempotencyKey must be 1..128 visible ASCII characters",
      ),
    );
  }

  if (typeof raw.projectId !== "string" || raw.projectId.length === 0) {
    problems.push(
      problem(
        "INTENT_PROJECT_ID_INVALID",
        "projectId must be a non-empty string",
      ),
    );
  }

  const kind = raw.kind;
  const kindIsKnown =
    typeof kind === "string" &&
    (Object.keys(REQUIRED_EFFECT_BY_KIND) as IntentKind[]).includes(
      kind as IntentKind,
    );
  if (!kindIsKnown) {
    problems.push(
      problem("INTENT_KIND_UNSUPPORTED", "kind must be a supported IntentKind"),
    );
  }

  const requestedEffect = raw.requestedEffect;
  const effectIsKnown =
    requestedEffect === "READ_ONLY" ||
    requestedEffect === "PREVIEW" ||
    requestedEffect === "APPLY_SHADOW";
  if (!effectIsKnown) {
    problems.push(
      problem(
        "INTENT_REQUESTED_EFFECT_UNSUPPORTED",
        "requestedEffect must be READ_ONLY, PREVIEW, or APPLY_SHADOW",
      ),
    );
  }

  if (kindIsKnown && effectIsKnown) {
    const required = REQUIRED_EFFECT_BY_KIND[kind as IntentKind];
    if (requestedEffect !== required) {
      problems.push(
        problem(
          "INTENT_REQUESTED_EFFECT_MISMATCH",
          `kind ${kind} requires requestedEffect ${required}`,
          { kind, requestedEffect, required },
        ),
      );
    }
  }

  if (!isValidTimestamp(raw.submittedAt)) {
    problems.push(
      problem(
        "INTENT_SUBMITTED_AT_INVALID",
        "submittedAt must be an ISO-8601 timestamp",
      ),
    );
  }

  if (
    !isRecord(raw.source) ||
    (raw.source.channel !== "OPERATOR_UI" && raw.source.channel !== "API")
  ) {
    problems.push(
      problem(
        "INTENT_SOURCE_CHANNEL_INVALID",
        'source.channel must be "OPERATOR_UI" or "API"',
      ),
    );
  }

  const isQueryKind = kindIsKnown && QUERY_KINDS.includes(kind as IntentKind);
  const isEvidenceKind =
    kindIsKnown &&
    (kind === "EVIDENCE_PREVIEW" || kind === "EVIDENCE_APPLY_SHADOW");

  const payloadType = isRecord(raw.payload) ? raw.payload.type : undefined;

  if (isQueryKind) {
    if (payloadType !== "QUERY") {
      problems.push(
        problem(
          "INTENT_PAYLOAD_TYPE_MISMATCH",
          'Query intent kinds require payload.type="QUERY"',
        ),
      );
    }
    if (
      raw.expectedProjectRevision !== null &&
      !Number.isInteger(raw.expectedProjectRevision)
    ) {
      problems.push(
        problem(
          "INTENT_EXPECTED_REVISION_INVALID",
          "expectedProjectRevision must be null or an integer for query intents",
        ),
      );
    }
  } else if (isEvidenceKind) {
    if (payloadType !== "EVIDENCE") {
      problems.push(
        problem(
          "INTENT_PAYLOAD_TYPE_MISMATCH",
          'Evidence intent kinds require payload.type="EVIDENCE"',
        ),
      );
    }
    if (
      !Number.isInteger(raw.expectedProjectRevision) ||
      (raw.expectedProjectRevision as number) < 0
    ) {
      problems.push(
        problem(
          "INTENT_EXPECTED_REVISION_INVALID",
          "expectedProjectRevision must be a non-negative integer for evidence intents",
        ),
      );
    }
    if (
      payloadType === "EVIDENCE" &&
      isRecord(raw.payload) &&
      typeof raw.projectId === "string" &&
      Number.isInteger(raw.expectedProjectRevision)
    ) {
      validateEvent(
        raw.payload.event,
        raw.projectId,
        raw.expectedProjectRevision as number,
        problems,
      );
    }
  }

  if (problems.length > 0) {
    return { valid: false, problems };
  }
  return { valid: true, intent: input as unknown as IntentV1 };
}
