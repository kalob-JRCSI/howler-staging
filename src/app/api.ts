// Phase 1 recovery: typed fetch wrappers for the exact existing, session-gated routes this app
// consumes (see src/worker/entry.ts's isProductOperatorRoute for the matching allowlist). No new
// backend routes were introduced for Phase 1 -- every one of these already existed and is already
// tested at the contract/integration level.

import type {
  BudgetCommandLike,
  BudgetCommandPreviewLike,
  ChangeOrderCommandLike,
  ChangeOrderCommandPreviewLike,
  FinancialConversationTurnLike,
  ForecastSnapshotLike,
  ProjectBudgetWorkspaceLike,
  ProjectChangeOrdersWorkspaceLike,
  ProjectEventLike,
  ProjectScheduleLike,
  ProjectScopeLike,
  ProjectSummaryLike,
  ScheduleCommandLike,
  ScheduleCommandPreviewLike,
  ScopeCommandLike,
  ScopeCommandPreviewLike,
} from "./types";

export class UnauthorizedError extends Error {}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) {
    throw new UnauthorizedError(`unauthorized: ${path}`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      details?: unknown;
    } | null;
    throw new ApiRequestError(
      body?.error ?? `request failed: ${path} (${String(response.status)})`,
      response.status,
      body?.details,
    );
  }
  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

// Phase 2 (Editable Project Schedule): the Schedule module's read view, plus the two-step
// preview -> apply save model already used by every canonical event in this codebase (see
// src/worker/entry.ts's isProductOperatorRoute and src/operator/schedule.ts). Applying an event
// goes through the *existing* /events/apply-shadow route -- no second mutation endpoint.

export function fetchProjectSchedule(
  projectId: string,
): Promise<ProjectScheduleLike> {
  return apiFetch<ProjectScheduleLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/schedule`,
  );
}

export function previewScheduleCommand(
  projectId: string,
  command: ScheduleCommandLike,
): Promise<ScheduleCommandPreviewLike> {
  return postJson<ScheduleCommandPreviewLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/schedule/commands/preview`,
    { command },
  );
}

export interface ApplyScheduleEventResult {
  applied: boolean;
  projectRevision: number;
}

export function applyScheduleEvent(
  projectId: string,
  event: unknown,
  reviewToken: string,
): Promise<ApplyScheduleEventResult> {
  return postJson<ApplyScheduleEventResult>(
    `/v1/projects/${encodeURIComponent(projectId)}/events/apply-shadow`,
    { event, reviewToken },
  );
}

// Phase 3 (Functional Project Scope Workspace): the same read view + preview -> apply pattern as
// Schedule immediately above (see src/operator/scope.ts). Applying a scope event goes through the
// exact same /events/apply-shadow route as Schedule -- applyScheduleEvent is reused verbatim
// rather than duplicated, since it is already a generic "apply this event" call.

export function fetchProjectScope(
  projectId: string,
): Promise<ProjectScopeLike> {
  return apiFetch<ProjectScopeLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/scope`,
  );
}

export function previewScopeCommand(
  projectId: string,
  command: ScopeCommandLike,
): Promise<ScopeCommandPreviewLike> {
  return postJson<ScopeCommandPreviewLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/scope/commands/preview`,
    { command },
  );
}

// Phase 4 (Budget + Change Orders): the same read view + preview -> apply pattern as
// Schedule/Scope above (see src/operator/budget.ts / src/operator/change-orders.ts). Applying
// either kind of event goes through the exact same /events/apply-shadow route --
// applyScheduleEvent is reused verbatim rather than duplicated.

export function fetchProjectBudget(
  projectId: string,
): Promise<ProjectBudgetWorkspaceLike> {
  return apiFetch<ProjectBudgetWorkspaceLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/budget`,
  );
}

export function previewBudgetCommand(
  projectId: string,
  command: BudgetCommandLike,
): Promise<BudgetCommandPreviewLike> {
  return postJson<BudgetCommandPreviewLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/budget/commands/preview`,
    { command },
  );
}

export function fetchProjectChangeOrders(
  projectId: string,
): Promise<ProjectChangeOrdersWorkspaceLike> {
  return apiFetch<ProjectChangeOrdersWorkspaceLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/change-orders`,
  );
}

export function previewChangeOrderCommand(
  projectId: string,
  command: ChangeOrderCommandLike,
): Promise<ChangeOrderCommandPreviewLike> {
  return postJson<ChangeOrderCommandPreviewLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/change-orders/commands/preview`,
    { command },
  );
}

export function postFinancialConversationTurn(
  projectId: string,
  text: string,
): Promise<FinancialConversationTurnLike> {
  return postJson<FinancialConversationTurnLike>(
    `/v1/projects/${encodeURIComponent(projectId)}/financial-conversation/turn`,
    { text },
  );
}
