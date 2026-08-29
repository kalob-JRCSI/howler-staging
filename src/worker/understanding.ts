import type {
  EventMutationV094,
  ProjectEventV094,
  VerificationState,
} from "../domain/types";

export interface UnderstandingProposalInputV094 {
  eventId: string;
  baseRevision: number;
  projectId: string;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  sourceIds: string[];
  verification: VerificationState;
  impactSeedActivityIds: string[];
  mutations: EventMutationV094[];
  extractedFacts?: Record<string, unknown>;
  note?: string;
  causeCode?: string;
  causeVerification?: string;
}

export type UnderstandingProposalResultV094 =
  | { valid: false; errors: string[]; warnings: string[] }
  | {
      valid: true;
      errors: string[];
      warnings: string[];
      event: ProjectEventV094;
    };

export function validateUnderstandingProposal(
  input: UnderstandingProposalInputV094,
): UnderstandingProposalResultV094 {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.eventId) errors.push("eventId is required");
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0)
    errors.push("baseRevision must be an integer >= 0");
  if (!input.projectId) errors.push("projectId is required");
  if (!Number.isFinite(Date.parse(input.occurredAt)))
    errors.push("occurredAt must be an ISO timestamp");
  if (!Number.isFinite(Date.parse(input.receivedAt)))
    errors.push("receivedAt must be an ISO timestamp");
  if (!input.sourceIds.length)
    warnings.push(
      "No evidence source IDs were supplied; confidence should be low until evidence is attached",
    );
  if (!input.mutations.length)
    warnings.push(
      "Proposal contains no typed mutations; it will be audit-only and cannot alter the forecast",
    );
  if (
    (input.eventType === "ACTUAL_START" ||
      input.eventType === "ACTUAL_FINISH") &&
    input.verification !== "VERIFIED_ACTUAL"
  ) {
    errors.push(
      "Actual start/finish events require VERIFIED_ACTUAL verification",
    );
  }
  if (input.causeVerification === "VERIFIED" && !input.causeCode)
    errors.push("Verified cause requires a causeCode");
  if (errors.length) return { valid: false, errors, warnings };
  const event: ProjectEventV094 = {
    id: input.eventId,
    baseRevision: input.baseRevision,
    projectId: input.projectId,
    type: input.eventType,
    occurredAt: input.occurredAt,
    receivedAt: input.receivedAt,
    sourceIds: input.sourceIds,
    verification: input.verification,
    impactSeedActivityIds: input.impactSeedActivityIds,
    mutations: input.mutations,
    payload: input.extractedFacts ?? {},
    ...(input.note ? { note: input.note } : {}),
    ...(input.causeCode ? { causeCode: input.causeCode } : {}),
    ...(input.causeVerification
      ? { causeVerification: input.causeVerification }
      : {}),
  };
  return { valid: true, errors, warnings, event };
}
