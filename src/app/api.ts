// Phase 1 recovery: typed fetch wrappers for the exact existing, session-gated routes this app
// consumes (see src/worker/entry.ts's isProductOperatorRoute for the matching allowlist). No new
// backend routes were introduced for Phase 1 -- every one of these already existed and is already
// tested at the contract/integration level.

import type {
  ForecastSnapshotLike,
  ProjectEventLike,
  ProjectSummaryLike,
} from "./types";

export class UnauthorizedError extends Error {}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) {
    throw new UnauthorizedError(`unauthorized: ${path}`);
  }
  if (!response.ok) {
    throw new Error(`request failed: ${path} (${String(response.status)})`);
  }
  return (await response.json()) as T;
}

export interface PortfolioResponse {
  schemaVersion: string;
  generatedAt: string;
  projects: ProjectSummaryLike[];
}

export function fetchPortfolio(): Promise<PortfolioResponse> {
  return apiFetch<PortfolioResponse>("/v1/portfolio");
}

export function fetchProjectSummary(
  projectId: string,
): Promise<ProjectSummaryLike> {
  return apiFetch<ProjectSummaryLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/summary`,
  );
}

export interface ForecastResponse {
  modelRevision: number;
  latest: ForecastSnapshotLike | null;
  published: ForecastSnapshotLike | null;
}

export function fetchProjectForecast(
  projectId: string,
): Promise<ForecastResponse> {
  return apiFetch<ForecastResponse>(
    `/v1/projects/${encodeURIComponent(projectId)}/forecast`,
  );
}

export interface EventsResponse {
  events: ProjectEventLike[];
}

export function fetchProjectEvents(
  projectId: string,
  limit = 50,
): Promise<EventsResponse> {
  return apiFetch<EventsResponse>(
    `/v1/projects/${encodeURIComponent(projectId)}/events?limit=${String(limit)}`,
  );
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
}
