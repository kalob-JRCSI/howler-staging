import { createServerFn } from "@tanstack/react-start";
import {
  type DrawingShareRecord,
  type DrawingShareView,
  type DrawingSnapshot,
  viewFromRecord,
} from "./drawing-share";
import { goodShareToken } from "./guard";

function asSnapshot(value: unknown): DrawingSnapshot {
  return value as DrawingSnapshot;
}

function tokenOrThrow(token: string): string {
  const next = token.trim();
  if (!goodShareToken(next)) throw new Error("Invalid share.");
  return next;
}

function snapshotSizeOk(snapshot: DrawingSnapshot): boolean {
  try {
    return JSON.stringify(snapshot).length < 400_000;
  } catch {
    return false;
  }
}

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export const upsertDrawingShare = createServerFn({ method: "POST" })
  .validator((input: { token: string; expiresAt: string; snapshot: DrawingSnapshot; endedAt?: string | null }) => input)
  .handler(async ({ data }): Promise<DrawingShareView> => {
    const token = tokenOrThrow(data.token);
    if (!snapshotSizeOk(data.snapshot)) throw new Error("Share too large.");
    const db = await sql();
    await db.query(
      `insert into drawing_shares (token, snapshot, expires_at, ended_at)
       values ($1, $2, $3, $4)
       on conflict (token) do update
         set snapshot = excluded.snapshot,
             expires_at = excluded.expires_at,
             ended_at = excluded.ended_at`,
      [token, JSON.stringify(data.snapshot), data.expiresAt, data.endedAt ?? null],
    );
    return viewFromRecord(token, {
      token,
      expiresAt: data.expiresAt,
      endedAt: data.endedAt ?? null,
      snapshot: data.snapshot,
    });
  });

export const readDrawingShare = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<DrawingShareView> => {
    const token = tokenOrThrow(data.token);
    const db = await sql();
    const rows = await db.query<{
      token: string;
      snapshot: unknown;
      expires_at: string;
      ended_at: string | null;
    }>(
      `select token, snapshot, expires_at, ended_at from drawing_shares where token = $1`,
      [token],
    );
    const row = rows[0];
    if (!row) return viewFromRecord(token, null);
    const record: DrawingShareRecord = {
      token: row.token,
      expiresAt: row.expires_at,
      endedAt: row.ended_at,
      snapshot: asSnapshot(row.snapshot),
    };
    return viewFromRecord(token, record);
  });

export const pushDrawingSnapshot = createServerFn({ method: "POST" })
  .validator((input: { token: string; snapshot: DrawingSnapshot }) => input)
  .handler(async ({ data }): Promise<DrawingShareView> => {
    const token = tokenOrThrow(data.token);
    if (!snapshotSizeOk(data.snapshot)) throw new Error("Share too large.");
    const db = await sql();
    const rows = await db.query<{
      token: string;
      snapshot: unknown;
      expires_at: string;
      ended_at: string | null;
    }>(
      `select token, snapshot, expires_at, ended_at from drawing_shares where token = $1`,
      [token],
    );
    const row = rows[0];
    if (!row) return viewFromRecord(token, null);
    const current = viewFromRecord(token, {
      token: row.token,
      expiresAt: row.expires_at,
      endedAt: row.ended_at,
      snapshot: asSnapshot(row.snapshot),
    });
    if (current.status !== "LIVE") return current;
    await db.query(`update drawing_shares set snapshot = $2 where token = $1`, [
      token,
      JSON.stringify(data.snapshot),
    ]);
    return {
      ...current,
      snapshot: data.snapshot,
    };
  });

export const endDrawingShare = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<DrawingShareView> => {
    const token = tokenOrThrow(data.token);
    const db = await sql();
    const endedAt = new Date().toISOString();
    await db.query(`update drawing_shares set ended_at = $2 where token = $1 and ended_at is null`, [
      token,
      endedAt,
    ]);
    const rows = await db.query<{
      token: string;
      snapshot: unknown;
      expires_at: string;
      ended_at: string | null;
    }>(
      `select token, snapshot, expires_at, ended_at from drawing_shares where token = $1`,
      [token],
    );
    const row = rows[0];
    if (!row) return viewFromRecord(token, null);
    return viewFromRecord(token, {
      token: row.token,
      expiresAt: row.expires_at,
      endedAt: row.ended_at ?? endedAt,
      snapshot: asSnapshot(row.snapshot),
    });
  });
