// Phase 4: the one "Tell Howler" control Budget and Change Orders both mount. The browser
// never chooses a model; POST .../financial-conversation/turn interprets the utterance,
// then the same preview -> confirm -> apply-shadow path every other financial command uses.
// A clerical RESOLVED turn still shows the preview note and still writes History; it just
// auto-applies instead of waiting for Confirm. Non-clerical turns always require Confirm.

import {
  ApiRequestError,
  applyScheduleEvent,
  postFinancialConversationTurn,
  UnauthorizedError,
} from "../../api";
import { escapeHtml } from "../../format";

export function financialConversationHtml(): string {
  return `
    <div class="howler-ask">
      <h3>Tell Howler</h3>
      <p class="ic-empty">Howler will interpret this against this project's Budget and Change Orders, then show a preview before anything is saved. Ambiguous statements are clarified, never guessed.</p>
      <form data-action="FINANCIAL_CONVERSATION" class="sched-add-activity-form">
        <textarea name="text" rows="3" required placeholder="e.g. Medina's approved plumbing proposal is $18,750."></textarea>
        <button type="submit">Analyze</button>
      </form>
      <div class="sched-action-panel" id="howler-ask-panel"></div>
    </div>
  `;
}

function applyTurn(
  projectId: string,
  event: unknown,
  reviewToken: string,
  panel: HTMLElement,
  onApplied: () => Promise<void>,
): void {
  applyScheduleEvent(projectId, event, reviewToken)
    .then(() => onApplied())
    .catch((error: unknown) => {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/");
        return;
      }
      const message =
        error instanceof ApiRequestError
          ? error.message
          : "This project changed since you loaded it. Reload to see the latest state.";
      panel.innerHTML = `<p class="sched-error">${escapeHtml(message)}</p>`;
    });
}

export function wireFinancialConversation(
  body: HTMLElement,
  projectId: string,
  onApplied: () => Promise<void>,
  onRedraw: () => void,
): void {
  const form = body.querySelector<HTMLFormElement>(
    'form[data-action="FINANCIAL_CONVERSATION"]',
  );
  const panel = body.querySelector<HTMLElement>("#howler-ask-panel");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!panel) return;
    const text = String(new FormData(form).get("text") ?? "").trim();
    if (!text) return;
    panel.innerHTML = `<p>Analyzing&hellip;</p>`;
    void postFinancialConversationTurn(projectId, text)
      .then((turn) => {
        if (turn.outcome === "CLARIFICATION") {
          panel.innerHTML = `<p class="sched-error">${escapeHtml(turn.message)}</p>`;
          return;
        }
        // Preview note is always shown so the operator's historyNote is visible before
        // persist. Clerical turns then auto-apply (still via apply-shadow / History);
        // everything else waits for an explicit Confirm.
        panel.innerHTML = `
          <div class="sched-consequence">
            <p class="sched-consequence-note">${escapeHtml(turn.historyNote)}</p>
            ${
              turn.clerical
                ? `<p>Saving&hellip;</p>`
                : `<div class="sched-actions">
              <button type="button" class="sched-confirm">Confirm</button>
              <button type="button" class="sched-cancel">Cancel</button>
            </div>`
            }
          </div>
        `;
        if (turn.clerical) {
          applyTurn(projectId, turn.event, turn.reviewToken, panel, onApplied);
          return;
        }
        panel
          .querySelector<HTMLButtonElement>(".sched-cancel")
          ?.addEventListener("click", () => {
            onRedraw();
          });
        panel
          .querySelector<HTMLButtonElement>(".sched-confirm")
          ?.addEventListener("click", () => {
            panel.innerHTML = `<p>Applying&hellip;</p>`;
            applyTurn(
              projectId,
              turn.event,
              turn.reviewToken,
              panel,
              onApplied,
            );
          });
      })
      .catch((error: unknown) => {
        if (error instanceof UnauthorizedError) {
          window.location.assign("/");
          return;
        }
        const message =
          error instanceof ApiRequestError
            ? error.message
            : "Could not interpret that update.";
        panel.innerHTML = `<p class="sched-error">${escapeHtml(message)}</p>`;
      });
  });
}
