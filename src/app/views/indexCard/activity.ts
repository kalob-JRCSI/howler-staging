// Phase 1 recovery: the Index Card's Activity/History module -- "what changed on this project and
// when," reading the existing, already-tested GET .../events route (the append-only canonical
// event ledger). No new backend route; this module is purely a UI gap fix.

import { fetchProjectEvents, UnauthorizedError } from "../../api";
import { escapeHtml, formatDateTime } from "../../format";

export async function renderActivity(
  body: HTMLElement,
  projectId: string,
): Promise<void> {
  body.innerHTML = `<p>Loading activity&hellip;</p>`;
  try {
    const { events } = await fetchProjectEvents(projectId, 50);
    if (events.length === 0) {
      body.innerHTML = `<p class="ic-empty">No project activity recorded yet.</p>`;
      return;
    }
    const sorted = [...events].sort((a, b) => b.baseRevision - a.baseRevision);
    body.innerHTML = `<ul class="ic-activity-list">${sorted
      .map(
        (event) =>
          `<li><span class="ic-activity-date">${escapeHtml(formatDateTime(event.occurredAt))}</span><span class="ic-activity-note">${escapeHtml(event.note ?? event.type)}</span></li>`,
      )
      .join("")}</ul>`;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      window.location.assign("/");
      return;
    }
    body.innerHTML = `<p class="ic-empty">Could not load project activity.</p>`;
  }
}
