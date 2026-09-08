// Phase 1 recovery: the honest placeholder every not-yet-built module category uses. Never
// fabricates data and never pretends to be finished functionality -- a module category appearing
// in navigation is not itself a claim that the module is usable.
export function renderPlaceholder(body: HTMLElement): void {
  body.innerHTML = `<p class="ic-placeholder">This module is not built yet. It will let the PM directly manage this part of the project once implemented.</p>`;
}
