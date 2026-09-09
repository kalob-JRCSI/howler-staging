// Phase 4 (Howler Recovery Directive, Budget + Change Orders, Correction 8): a generic,
// cross-module fix for the shared `/events/apply-shadow` and `/events/publish` routes, which
// every module's command builder (Schedule, Scope, Budget, Change Orders) ultimately POSTs to.
//
// The bug this closes: `reviewedRun` in src/worker/index.ts compares the incoming event's
// `baseRevision` against the project's CURRENT revision. After a first successful apply
// (revision 42 -> 43), a byte-identical retry of the exact same request -- still carrying
// `baseRevision: 42`, because the client resent the same already-built event rather than
// rebuilding a new one -- fails that check with a generic 409, indistinguishable from a real
// conflict. The client cannot tell "someone else changed the project" apart from "my own prior
// attempt actually succeeded and I just never saw the response."
//
// An event id is the caller's own idempotency key -- ProjectEventV094's stable `id`
// (`project_events.PRIMARY KEY (project_id, event_id)`), which a genuine retry resends unchanged
// because it is resending the identical already-built event, never a freshly re-built one. Given
// only that id, this resolver reconstructs the exact forecast/oversight evidence the original
// commit produced, purely from what is already persisted -- it never recomputes
// forecastAfterEvent against the (by now advanced) current model, which would not reproduce the
// original attempt's result. The lookup chain is: event -> its resulting revision
// (baseRevision + 1, since a committed event always advances the ledger by exactly one) ->
// the forecast snapshot committed at that revision -> the oversight review that gated it.

import type { ProjectEventV094 } from "../domain/types";
import type { ForecastSnapshotV094 } from "./solver";
import type { OversightReviewV094 } from "./oversight";

export interface IdempotentApplyRepo {
  loadEventById(
    projectId: string,
    eventId: string,
  ): Promise<ProjectEventV094 | undefined>;
  loadForecastByModelRevision(
    projectId: string,
    modelRevision: number,
  ): Promise<ForecastSnapshotV094 | undefined>;
  loadOversightReviewByCandidateSnapshotId(
    candidateSnapshotId: string,
  ): Promise<OversightReviewV094 | undefined>;
}

export type IdempotentApplyResolution =
  | { outcome: "PROCEED" }
  | {
      outcome: "REPLAYED";
      existingEvent: ProjectEventV094;
      candidate: ForecastSnapshotV094;
      oversight: OversightReviewV094;
    }
  | { outcome: "AMBIGUOUS"; reason: string };

/**
 * Resolves whether an incoming apply attempt is genuinely new (PROCEED, safe to run the normal
 * preview -> confirm -> commit pipeline), a safe replay of an already-succeeded attempt
 * (REPLAYED -- the caller should return a response reconstructed from the persisted evidence
 * rather than recommitting), or an unresolvable mismatch (AMBIGUOUS -- the event id already
 * exists but its forecast/oversight evidence is missing, so this function refuses to guess).
 * Never blindly retries a commit, and never fabricates evidence it cannot find.
 */
export async function resolveIdempotentApply(
  repo: IdempotentApplyRepo,
  projectId: string,
  eventId: string,
): Promise<IdempotentApplyResolution> {
  const existingEvent = await repo.loadEventById(projectId, eventId);
  if (!existingEvent) return { outcome: "PROCEED" };

  const resultingRevision = existingEvent.baseRevision + 1;
  const candidate = await repo.loadForecastByModelRevision(
    projectId,
    resultingRevision,
  );
  if (!candidate) {
    return {
      outcome: "AMBIGUOUS",
      reason: `Event ${eventId} already exists but its forecast evidence at revision ${String(resultingRevision)} is missing`,
    };
  }
  const oversight = await repo.loadOversightReviewByCandidateSnapshotId(
    candidate.id,
  );
  if (!oversight) {
    return {
      outcome: "AMBIGUOUS",
      reason: `Event ${eventId} already exists but its oversight evidence for candidate ${candidate.id} is missing`,
    };
  }
  return { outcome: "REPLAYED", existingEvent, candidate, oversight };
}
