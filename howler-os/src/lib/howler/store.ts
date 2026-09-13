import { create } from "zustand";
import type { CommandPreview, PortfolioState, Project } from "./types";
import { emptyBlueprint } from "./types";
import { createSeedState, SEED_VERSION } from "./seed";
import { rememberFromPreview } from "./memory";
import { emptyJob } from "./job";

const STORAGE_KEY = "howler-canonical-v1";

interface Persisted {
  projects: PortfolioState["projects"];
  seedVersion: string;
  updatedAt?: number;
}

function withBlueprint(project: Project): Project {
  if (
    project.blueprint &&
    project.job &&
    project.heldPhases &&
    "officialStart" in project &&
    "intendedFinish" in project
  ) {
    return project;
  }
  return {
    ...project,
    heldPhases: project.heldPhases ?? [],
    officialStart: project.officialStart ?? null,
    intendedFinish: project.intendedFinish ?? null,
    blueprint: project.blueprint ?? emptyBlueprint(),
    job: project.job ?? emptyJob(),
  };
}

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.seedVersion !== SEED_VERSION || !parsed.projects) return null;
    const projects = Object.fromEntries(
      Object.entries(parsed.projects).map(([id, project]) => [id, withBlueprint(project)]),
    );
    return { projects, seedVersion: parsed.seedVersion, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function persist(projects: PortfolioState["projects"], updatedAt: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ projects, seedVersion: SEED_VERSION, updatedAt }),
  );
  void fetch("/api/howler-state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projects, seedVersion: SEED_VERSION, updatedAt }),
  }).catch(() => undefined);
}

interface HowlerStore extends PortfolioState {
  seedVersion: string;
  updatedAt: number;
  applyPreview: (projectId: string, preview: CommandPreview) => void;
  restoreSeed: () => void;
  hydrateFromStorage: () => void;
  pullRemote: () => Promise<void>;
}

export function ensureProjectShape(project: Project): Project {
  return withBlueprint(project);
}

export const useHowlerStore = create<HowlerStore>((set, get) => ({
  ...createSeedState(),
  seedVersion: SEED_VERSION,
  updatedAt: 0,
  applyPreview: (projectId, preview) => {
    const project = get().projects[projectId];
    if (!project) throw new Error("Unknown project.");
    const next = preview.apply(withBlueprint(project));
    const projects = { ...get().projects, [projectId]: next };
    const updatedAt = Date.now();
    set({ projects, updatedAt });
    rememberFromPreview(preview, next);
    persist(projects, updatedAt);
  },
  restoreSeed: () => {
    const seed = createSeedState();
    const updatedAt = Date.now();
    set({ ...seed, seedVersion: SEED_VERSION, updatedAt });
    persist(seed.projects, updatedAt);
  },
  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("howler-hydrated") === "1") return;
    window.sessionStorage.setItem("howler-hydrated", "1");
    const persisted = readPersisted();
    if (persisted) {
      set({
        projects: persisted.projects,
        seedVersion: persisted.seedVersion,
        updatedAt: persisted.updatedAt ?? Date.now(),
      });
    }
  },
  pullRemote: async () => {
    if (typeof window === "undefined") return;
    try {
      const res = await fetch("/api/howler-state", {
        headers: { "If-None-Match": `"${get().updatedAt}"` },
      });
      if (res.status === 204 || res.status === 304 || !res.ok) return;
      const remote = (await res.json()) as Persisted & { updatedAt: number };
      if (!remote.projects || remote.seedVersion !== SEED_VERSION) return;
      if (remote.updatedAt <= get().updatedAt) return;
      const projects = Object.fromEntries(
        Object.entries(remote.projects).map(([id, project]) => [id, withBlueprint(project as Project)]),
      );
      set({ projects, updatedAt: remote.updatedAt, seedVersion: remote.seedVersion });
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ projects, seedVersion: remote.seedVersion, updatedAt: remote.updatedAt }),
      );
    } catch {
      /* offline */
    }
  },
}));

export function useProject(projectId: string): Project | undefined {
  return useHowlerStore((state) => state.projects[projectId]);
}
