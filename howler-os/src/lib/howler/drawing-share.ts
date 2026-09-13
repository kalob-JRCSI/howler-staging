import type { Blueprint, DrawingScaleId, Project } from "./types";
import { ensureBlueprint } from "./types";

export const SHARE_LOCAL_KEY = "howler-drawing-shares-v1";
export const SHARE_PAYLOAD_PREFIX = "howler-drawing-share:";

export interface DrawingSnapshot {
  rev: number;
  updatedAt: string;
  jobTitle: string;
  siteLine: string;
  clientLabel: string;
  projectRevision: number;
  scale: DrawingScaleId;
  blueprint: Blueprint;
  hostProjectId: string;
}

export interface DrawingShareRecord {
  token: string;
  expiresAt: string;
  endedAt: string | null;
  snapshot: DrawingSnapshot;
}

export type ShareStatus = "LIVE" | "ENDED" | "EXPIRED" | "MISSING";

export interface DrawingShareView {
  status: ShareStatus;
  token: string;
  expiresAt: string | null;
  remainingMs: number;
  snapshot: DrawingSnapshot | null;
}

export function newShareToken(): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
  return `d${raw}`;
}

export function snapshotFromProject(project: Project): DrawingSnapshot {
  const blueprint = ensureBlueprint(project);
  return {
    rev: Date.now(),
    updatedAt: new Date().toISOString(),
    jobTitle: project.name,
    siteLine: project.address,
    clientLabel: project.clientName,
    projectRevision: project.revision,
    scale: blueprint.drawingScale ?? "FIT",
    blueprint,
    hostProjectId: project.id,
  };
}

export function shareChannelName(token: string): string {
  return `howler-draw-${token}`;
}

interface LocalBag {
  shares: Record<string, DrawingShareRecord>;
}

function readBag(): LocalBag {
  if (typeof window === "undefined") return { shares: {} };
  try {
    const raw = window.localStorage.getItem(SHARE_LOCAL_KEY);
    if (!raw) return { shares: {} };
    return JSON.parse(raw) as LocalBag;
  } catch {
    return { shares: {} };
  }
}

function writeBag(bag: LocalBag): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHARE_LOCAL_KEY, JSON.stringify(bag));
}

export function localPutShare(record: DrawingShareRecord): void {
  const bag = readBag();
  bag.shares[record.token] = record;
  writeBag(bag);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SHARE_PAYLOAD_PREFIX + record.token, JSON.stringify(record));
  }
}

export function localGetShare(token: string): DrawingShareRecord | null {
  const bag = readBag();
  if (bag.shares[token]) return bag.shares[token];
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHARE_PAYLOAD_PREFIX + token);
    return raw ? (JSON.parse(raw) as DrawingShareRecord) : null;
  } catch {
    return null;
  }
}

export function localEndShare(token: string): void {
  const bag = readBag();
  const existing = bag.shares[token];
  if (existing) {
    bag.shares[token] = { ...existing, endedAt: new Date().toISOString() };
    writeBag(bag);
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SHARE_PAYLOAD_PREFIX + token);
  }
}

export function localListLive(projectId: string): DrawingShareRecord[] {
  const now = Date.now();
  return Object.values(readBag().shares).filter((share) => {
    if (share.snapshot.hostProjectId !== projectId) return false;
    if (share.endedAt) return false;
    return new Date(share.expiresAt).getTime() > now;
  });
}

export function viewFromRecord(token: string, record: DrawingShareRecord | null): DrawingShareView {
  if (!record) return { status: "MISSING", token, expiresAt: null, remainingMs: 0, snapshot: null };
  const now = Date.now();
  const expires = new Date(record.expiresAt).getTime();
  if (record.endedAt) {
    return { status: "ENDED", token, expiresAt: record.expiresAt, remainingMs: 0, snapshot: null };
  }
  if (expires <= now) {
    return { status: "EXPIRED", token, expiresAt: record.expiresAt, remainingMs: 0, snapshot: null };
  }
  return {
    status: "LIVE",
    token,
    expiresAt: record.expiresAt,
    remainingMs: expires - now,
    snapshot: record.snapshot,
  };
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "ended";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function shareUrl(token: string): string {
  if (typeof window === "undefined") return `/draw/${token}`;
  return `${window.location.origin}/draw/${token}`;
}
