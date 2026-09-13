import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { applyTabTitle, copyHttpsAddress, howlerPublicHref } from "@/lib/howler/board-address";
import { inputClass } from "./primitives";

export function HowlerTabTitle() {
  useEffect(() => {
    applyTabTitle();
  }, []);
  return null;
}

export function HowlerLockup({
  to = "/",
  sub = "KF Live",
}: {
  to?: string;
  sub?: string;
}) {
  return (
    <Link to={to} className="howler-lockup">
      <span className="howler-lockup-word">Howler</span>
      <span className="howler-lockup-sub">{sub}</span>
    </Link>
  );
}

export function Atmosphere({
  greeting,
  command,
  statement,
}: {
  greeting: string;
  command: string;
  statement: string;
}) {
  return (
    <section className="howler-atmosphere" aria-label={greeting}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">{greeting}</p>
      <h1 className="mt-1 font-display text-[28px] font-normal leading-[1.08] tracking-[-0.02em] text-fg">
        {command}
      </h1>
      <p className="mt-2 max-w-[42ch] text-xs text-muted">{statement}</p>
    </section>
  );
}

export function AppFrame({
  rail,
  children,
}: {
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="howler-app">
      <aside className="howler-rail print-hide">{rail}</aside>
      <main className="howler-main">{children}</main>
    </div>
  );
}

export function BoardAddress() {
  const [href, setHref] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const next = howlerPublicHref("/");
    setHref(next);
    applyTabTitle(next);
  }, []);

  async function copy() {
    if (!href) return;
    const ok = await copyHttpsAddress(href);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (!href) {
      await copy();
      return;
    }
    if (typeof navigator.share !== "function") {
      await copy();
      return;
    }
    try {
      await navigator.share({ url: href, text: href, title: href });
    } catch {
      await copy();
    }
  }

  return (
    <div className="mt-4">
      <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
        Howler vs this window
      </label>
      <p className="mt-1 max-w-[52ch] text-sm text-fg">
        This chat is Howler. Grok is only the workshop. The Cloudflare login at
        jarvis-voice-staging is an older Worker — not this board.
      </p>
      {href ? (
        <>
          <p className="mt-2 select-all break-all font-mono text-xs text-fg">{href}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="primary" onClick={() => void copy()}>
              {copied ? "Address copied" : "Copy this window"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void share()}>
              Share
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          This Grok window has no Howler https yet. Independent Howler is this exact board, shipped out — not the old login page.
        </p>
      )}
    </div>
  );
}

export function IphoneActionSetup() {
  return (
    <details className="mt-5 rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
        Howler is not Grok
      </summary>
      <p className="mt-2 text-sm text-fg">
        We build Howler here, then ship this exact board to its own https. The Cloudflare
        sign-in page is not this Howler. This board has no login wall.
      </p>
    </details>
  );
}
