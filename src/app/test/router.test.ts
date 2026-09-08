import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "../router";

function setPath(path: string): void {
  window.history.pushState(null, "", path);
}

beforeEach(() => {
  setPath("/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Router", () => {
  it("matches the exact root path", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const handler = vi.fn();
    router.add("/", handler);
    await router.render();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({}, root);
  });

  it("extracts a single dynamic param", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const handler = vi.fn();
    router.add("/projects/:id", handler);
    setPath("/projects/carver");
    await router.render();
    expect(handler).toHaveBeenCalledWith({ id: "carver" }, root);
  });

  it("extracts multiple dynamic params in order", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const handler = vi.fn();
    router.add("/projects/:id/:moduleId", handler);
    setPath("/projects/carver/schedule");
    await router.render();
    expect(handler).toHaveBeenCalledWith(
      { id: "carver", moduleId: "schedule" },
      root,
    );
  });

  it("decodes URL-encoded param values", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const handler = vi.fn();
    router.add("/projects/:id", handler);
    setPath("/projects/smith%20residence");
    await router.render();
    expect(handler).toHaveBeenCalledWith({ id: "smith residence" }, root);
  });

  it("never matches a route with extra trailing path segments", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const rootHandler = vi.fn();
    router.add("/projects/:id", rootHandler);
    setPath("/projects/carver/schedule");
    await router.render();
    expect(rootHandler).not.toHaveBeenCalled();
    expect(root.textContent).toBe("Not found.");
  });

  it("navigate() pushes a new history entry and re-renders for the new path", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const dashboardHandler = vi.fn();
    const projectHandler = vi.fn();
    router.add("/", dashboardHandler);
    router.add("/projects/:id", projectHandler);
    await router.render();
    expect(dashboardHandler).toHaveBeenCalledTimes(1);

    router.navigate("/projects/carver");
    await Promise.resolve();
    expect(window.location.pathname).toBe("/projects/carver");
    expect(projectHandler).toHaveBeenCalledTimes(1);
  });

  it("navigate() to the current path re-renders without pushing a duplicate history entry", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const handler = vi.fn();
    router.add("/", handler);
    setPath("/");
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    router.navigate("/");
    await Promise.resolve();
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("re-renders on popstate (browser back/forward)", async () => {
    const root = document.createElement("div");
    const router = new Router(root);
    const dashboardHandler = vi.fn();
    const projectHandler = vi.fn();
    router.add("/", dashboardHandler);
    router.add("/projects/:id", projectHandler);
    router.navigate("/projects/carver");
    await Promise.resolve();
    expect(projectHandler).toHaveBeenCalledTimes(1);

    setPath("/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
    expect(dashboardHandler).toHaveBeenCalledTimes(1);
  });
});
