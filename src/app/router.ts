// Phase 1 recovery: a minimal History-API router. This is the structural fix for the rejected
// pilot's core Failure 1 -- selecting a project is now a real navigation event (a URL change,
// working back/forward, a bookmarkable/deep-linkable path), never a same-page section swap.

export type RouteHandler = (
  params: Record<string, string>,
  root: HTMLElement,
) => void | Promise<void>;

interface CompiledRoute {
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      keys.push(segment.slice(1));
      return "([^/]+)";
    })
    .join("/");
  return { pattern: new RegExp(`^${source}$`), keys };
}

export class Router {
  private readonly routes: CompiledRoute[] = [];
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener("popstate", () => void this.render());
  }

  add(path: string, handler: RouteHandler): void {
    const { pattern, keys } = compile(path);
    this.routes.push({ pattern, keys, handler });
  }

  navigate(path: string): void {
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    void this.render();
  }

  // Known Phase 1 simplification: if the PM navigates again before a slower view finishes its own
  // fetch, that first view's async continuation can still resolve afterward and repaint over the
  // new one. None of the current views' fetches are slow enough for this to matter in practice,
  // but it should be revisited (e.g. an AbortController per navigation) if that changes.
  async render(): Promise<void> {
    const path = window.location.pathname;
    for (const route of this.routes) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] ?? "");
      });
      await route.handler(params, this.root);
      return;
    }
    this.root.textContent = "Not found.";
  }
}
