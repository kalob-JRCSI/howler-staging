import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { previewReplaceBlueprint } from "@/lib/howler/engine";
import {
  formatRemaining,
  localListLive,
  newShareToken,
  shareUrl,
  snapshotFromProject,
} from "@/lib/howler/drawing-share";
import { useDrawingSession } from "@/lib/howler/use-drawing-session";
import { useHowlerStore } from "@/lib/howler/store";
import type { Project } from "@/lib/howler/types";
import { sharePacketLines } from "@/lib/howler/code-notes";
import { copyHttpsAddress, isHowlerHttps } from "@/lib/howler/board-address";
import { Field, inputClass, Panel, StatusChip } from "./primitives";

export function ShareDrawing({ project }: { project: Project }) {
  const applyPreview = useHowlerStore((state) => state.applyPreview);
  const [hours, setHours] = useState(4);
  const [token, setToken] = useState<string | null>(() => localListLive(project.id)[0]?.token ?? null);
  const [copied, setCopied] = useState(false);
  const lastBp = useRef("");
  const session = useDrawingSession({
    token,
    name: "host",
    enabled: Boolean(token),
    onRemote: (snapshot) => {
      if (snapshot.hostProjectId !== project.id) return;
      const encoded = JSON.stringify(snapshot.blueprint);
      if (encoded === JSON.stringify(project.blueprint)) return;
      lastBp.current = encoded;
      applyPreview(project.id, previewReplaceBlueprint(snapshot.blueprint, "Drawing session updated the sheets."));
    },
  });

  useEffect(() => {
    if (!token) return;
    const snap = snapshotFromProject(project);
    const encoded = JSON.stringify(snap.blueprint);
    if (encoded === lastBp.current) return;
    lastBp.current = encoded;
    void session.publish(snap);
    // Guest writes arrive via onRemote; host writes follow project.blueprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.blueprint, token]);

  const url = token ? shareUrl(token) : "";
  const mail = useMemo(() => {
    if (!url) return "";
    const subject = encodeURIComponent(`Working drawing — ${project.name}`);
    const body = encodeURIComponent(
      `Working drawing session (not Howler — access ends when the host closes it):\n${url}\n\n${sharePacketLines(project).join("\n")}\n`,
    );
    return `mailto:?subject=${subject}&body=${body}`;
  }, [url, project]);
  const sms = useMemo(() => {
    if (!url) return "";
    return `sms:?&body=${encodeURIComponent(`Drawing session (not Howler): ${url}`)}`;
  }, [url]);

  async function openSession() {
    const next = newShareToken();
    setToken(next);
    await session.open({ token: next, hours, snapshot: snapshotFromProject(project) });
  }

  async function copyLink() {
    if (!url) return;
    if (isHowlerHttps(url)) {
      const ok = await copyHttpsAddress(url);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel className="print-hide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-lg">Drawing session</h4>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Invite edits the sheets only — never Howler, never money. When you end
            the session the link dies. PDF is how the set leaves the job for good.
          </p>
        </div>
        {token && session.view?.status === "LIVE" ? <StatusChip tone="ok">Live · {session.remainingLabel}</StatusChip> : null}
      </div>

      {token && session.view?.status === "LIVE" ? (
        <div className="mt-4 space-y-3">
          <p className="break-all font-mono text-xs text-muted">{url}</p>
          <p className="text-xs text-subtle">
            {session.peers.length
              ? `${session.peers.length} guest${session.peers.length === 1 ? "" : "s"} on the sheet.`
              : "Waiting for a guest. Same-phone preview works in another tab."}
            {session.view.expiresAt ? ` · ends ${formatRemaining(session.view.remainingMs)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" type="button" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => window.open(mail)}>
              Email
            </Button>
            <Button variant="secondary" type="button" onClick={() => window.open(sms)}>
              Text
            </Button>
            <Button variant="ghost" type="button" onClick={() => void session.end().then(() => setToken(null))}>
              End session
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void openSession();
          }}
        >
          <Field label="Session length">
            <select
              className={inputClass}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            >
              <option value={1}>1 hour</option>
              <option value={4}>4 hours</option>
              <option value={8}>8 hours</option>
              <option value={24}>Until I end it (24h cap)</option>
            </select>
          </Field>
          <Button variant="primary" type="submit">
            Open drawing session
          </Button>
        </form>
      )}
    </Panel>
  );
}
