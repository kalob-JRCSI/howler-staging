import { useCallback, useEffect, useRef, useState } from "react";
import { useP2PRoom } from "@/lib/multiplayer";
import {
  endDrawingShare,
  pushDrawingSnapshot,
  readDrawingShare,
  upsertDrawingShare,
} from "./drawing-share-fns";
import {
  type DrawingShareRecord,
  type DrawingShareView,
  type DrawingSnapshot,
  formatRemaining,
  localEndShare,
  localGetShare,
  localPutShare,
  shareChannelName,
  viewFromRecord,
} from "./drawing-share";

interface Options {
  token: string | null;
  name: string;
  enabled?: boolean;
  onRemote?: (snapshot: DrawingSnapshot) => void;
}

export function useDrawingSession({ token, name, enabled = true, onRemote }: Options) {
  const [view, setView] = useState<DrawingShareView | null>(null);
  const lastRev = useRef(0);
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  const live = Boolean(token) && enabled && view?.status === "LIVE";
  const p2p = useP2PRoom({
    room: token ?? "idle",
    name,
    enabled: Boolean(token) && enabled,
  });

  const applyView = useCallback((next: DrawingShareView) => {
    setView(next);
    if (next.status === "LIVE" && next.snapshot && next.snapshot.rev > lastRev.current) {
      lastRev.current = next.snapshot.rev;
      onRemoteRef.current?.(next.snapshot);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const local = localGetShare(token);
    try {
      const remote = await readDrawingShare({ data: { token } });
      if (remote.status === "MISSING" && local) {
        applyView(viewFromRecord(token, local));
        return;
      }
      applyView(remote);
    } catch {
      applyView(viewFromRecord(token, local));
    }
  }, [token, applyView]);

  useEffect(() => {
    if (!token || !enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [token, enabled, refresh]);

  useEffect(() => {
    if (!token || !enabled || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(shareChannelName(token));
    channel.onmessage = (event: MessageEvent<{ type: string; snapshot?: DrawingSnapshot; ended?: boolean }>) => {
      if (event.data?.ended) {
        applyView({ status: "ENDED", token, expiresAt: view?.expiresAt ?? null, remainingMs: 0, snapshot: null });
        return;
      }
      if (event.data?.snapshot) {
        applyView({
          status: "LIVE",
          token,
          expiresAt: view?.expiresAt ?? null,
          remainingMs: view?.remainingMs ?? 0,
          snapshot: event.data.snapshot,
        });
      }
    };
    return () => channel.close();
  }, [token, enabled, applyView, view?.expiresAt, view?.remainingMs]);

  useEffect(() => {
    if (!live) return;
    return p2p.onMessage((_from, data) => {
      const payload = data as { type?: string; snapshot?: DrawingSnapshot };
      if (payload?.type === "snapshot" && payload.snapshot) {
        applyView({
          status: "LIVE",
          token: token!,
          expiresAt: view?.expiresAt ?? null,
          remainingMs: view?.remainingMs ?? 0,
          snapshot: payload.snapshot,
        });
      }
    });
  }, [live, p2p, applyView, token, view?.expiresAt, view?.remainingMs]);

  const publish = useCallback(
    async (snapshot: DrawingSnapshot) => {
      if (!token) return;
      lastRev.current = snapshot.rev;
      const existing = localGetShare(token);
      const record: DrawingShareRecord = {
        token,
        expiresAt: existing?.expiresAt ?? view?.expiresAt ?? new Date(Date.now() + 3600000).toISOString(),
        endedAt: null,
        snapshot,
      };
      localPutShare(record);
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(shareChannelName(token));
        channel.postMessage({ type: "snapshot", snapshot });
        channel.close();
      }
      p2p.send({ type: "snapshot", snapshot });
      try {
        await pushDrawingSnapshot({ data: { token, snapshot } });
      } catch {
        /* local + channel still hold the drawing */
      }
    },
    [token, view?.expiresAt, p2p],
  );

  const open = useCallback(
    async (input: { token: string; hours: number; snapshot: DrawingSnapshot }) => {
      const expiresAt = new Date(Date.now() + input.hours * 3600000).toISOString();
      const record: DrawingShareRecord = {
        token: input.token,
        expiresAt,
        endedAt: null,
        snapshot: input.snapshot,
      };
      localPutShare(record);
      lastRev.current = input.snapshot.rev;
      try {
        const next = await upsertDrawingShare({
          data: { token: input.token, expiresAt, snapshot: input.snapshot },
        });
        applyView(next);
      } catch {
        applyView(viewFromRecord(input.token, record));
      }
    },
    [applyView],
  );

  const end = useCallback(async () => {
    if (!token) return;
    localEndShare(token);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(shareChannelName(token));
      channel.postMessage({ type: "end", ended: true });
      channel.close();
    }
    try {
      applyView(await endDrawingShare({ data: { token } }));
    } catch {
      applyView({ status: "ENDED", token, expiresAt: view?.expiresAt ?? null, remainingMs: 0, snapshot: null });
    }
  }, [token, applyView, view?.expiresAt]);

  return {
    view,
    remainingLabel: view?.status === "LIVE" ? formatRemaining(view.remainingMs) : view?.status?.toLowerCase() ?? "",
    peers: p2p.peers,
    joined: p2p.joined,
    publish,
    open,
    end,
    refresh,
  };
}
