import { createSeedState, SEED_VERSION } from "./seed";
import type { Project } from "./types";

export type JobSnapshot = {
  updatedAt: number;
  seedVersion: string;
  projects: Record<string, Project>;
};

let snapshot: JobSnapshot | null = null;

export function getJobSnapshot(): JobSnapshot {
  if (snapshot && snapshot.seedVersion === SEED_VERSION) return snapshot;
  const seed = createSeedState();
  snapshot = {
    projects: seed.projects,
    seedVersion: SEED_VERSION,
    updatedAt: snapshot?.updatedAt ?? 0,
  };
  return snapshot;
}

export function setJobSnapshot(next: JobSnapshot) {
  snapshot = next;
}
