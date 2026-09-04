import { impactCone } from "./graph";
import { runOversightReview } from "./oversight";
import type { OversightReviewV094 } from "./oversight";
import { generateForecast } from "./solver";
import type { ForecastSnapshotV094 } from "./solver";
import { validateProjectModel } from "../domain/validation";
import { applyEventMutations } from "./reducer";
import type {
  ISODateTime,
  ProjectEventV094,
  ProjectModelV094,
} from "../domain/types";

export interface PublicationGateV094 {
  forecastAllowed: true;
  commitmentEligible: boolean;
  oversightDecision: "PASS" | "PASS_WITH_WARNINGS" | "BLOCK";
}

export interface ProposedForecastV094 extends ForecastSnapshotV094 {
  oversightReviewId: string;
  publicationGate: PublicationGateV094;
}

export interface ForecastRunV094 {
  modelAfterEvent: ProjectModelV094;
  candidate: ProposedForecastV094;
  oversight: OversightReviewV094;
  forecastable: true;
  commitmentEligible: boolean;
  publishable: boolean;
}

export function appendEvent(
  model: ProjectModelV094,
  event: ProjectEventV094,
): ProjectModelV094 {
  if (model.eventLedger.some((e) => e.id === event.id))
    throw new Error(`Duplicate event ID: ${event.id}`);
  if (event.projectId !== model.projectId)
    throw new Error(`Event ${event.id} belongs to a different project`);
  if (event.baseRevision !== model.revision) {
    throw new Error(
      `Stale event ${event.id}: expected baseRevision ${String(model.revision)}, got ${String(event.baseRevision)}`,
    );
  }
  // Append-only with optimistic concurrency. Caller receives a new model revision.
  return {
    ...model,
    revision: model.revision + 1,
    eventLedger: [...model.eventLedger, Object.freeze({ ...event })],
  };
}

export function forecastInitial(
  model: ProjectModelV094,
  generatedAt: ISODateTime,
  version = 1,
): ForecastRunV094 {
  if (!Number.isInteger(version) || version < 1)
    throw new Error("Initial forecast version must be an integer >= 1");
  validateProjectModel(model);
  const candidate = generateForecast(model, generatedAt, version);
  const oversight = runOversightReview(
    model,
    candidate,
    undefined,
    generatedAt,
  );
  const proposed: ProposedForecastV094 = {
    ...candidate,
    status: oversight.decision === "BLOCK" ? "WORKING" : "PROPOSED",
    oversightReviewId: oversight.id,
    publicationGate: {
      forecastAllowed: true,
      commitmentEligible: oversight.decision !== "BLOCK",
      oversightDecision: oversight.decision,
    },
  };
  return {
    modelAfterEvent: model,
    candidate: proposed,
    oversight,
    forecastable: true,
    commitmentEligible: oversight.decision !== "BLOCK",
    publishable: oversight.decision !== "BLOCK",
  };
}

export function forecastAfterEvent(
  model: ProjectModelV094,
  event: ProjectEventV094,
  generatedAt: ISODateTime,
  nextVersion: number,
  baseline?: ForecastSnapshotV094,
): ForecastRunV094 {
  if (!Number.isInteger(nextVersion) || nextVersion < 1)
    throw new Error("Forecast version must be an integer >= 1");
  if (baseline && nextVersion <= baseline.version)
    throw new Error(
      `Forecast version must increase beyond baseline version ${String(baseline.version)}`,
    );
  const mutated = applyEventMutations(model, event);
  const withEvent = appendEvent(mutated, event);
  validateProjectModel(withEvent);
  const cone = new Set(impactCone(withEvent, event.impactSeedActivityIds));
  const candidate = generateForecast(
    withEvent,
    generatedAt,
    nextVersion,
    baseline,
    cone,
  );
  const oversight = runOversightReview(
    withEvent,
    candidate,
    event,
    generatedAt,
  );
  const proposed: ProposedForecastV094 = {
    ...candidate,
    status: oversight.decision === "BLOCK" ? "WORKING" : "PROPOSED",
    oversightReviewId: oversight.id,
    publicationGate: {
      forecastAllowed: true,
      commitmentEligible: oversight.decision !== "BLOCK",
      oversightDecision: oversight.decision,
    },
  };
  return {
    modelAfterEvent: withEvent,
    candidate: proposed,
    oversight,
    forecastable: true,
    commitmentEligible: oversight.decision !== "BLOCK",
    publishable: oversight.decision !== "BLOCK",
  };
}

export function publishForecast(run: ForecastRunV094): ProposedForecastV094 {
  if (!run.publishable || run.oversight.decision === "BLOCK") {
    throw new Error(
      "Forecast cannot be published because oversight review blocked it",
    );
  }
  return { ...run.candidate, status: "PUBLISHED" };
}
