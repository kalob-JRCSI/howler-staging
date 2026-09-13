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
  const href = howlerPublicHref("/");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    applyTabTitle(href);
  }, [href]);

  async function copy() {
    const ok = await copyHttpsAddress(href);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-4">
      <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle" htmlFor="howler-board-https">
        Howler
      </label>
      <p className="mt-1 max-w-[52ch] text-sm text-fg">
        Live Howler is independent of Grok. Copy the https line — never the word Howler.
      </p>
      <p className="mt-2 select-all break-all font-mono text-xs text-fg">{href}</p>
      <div className="mt-2">
        <Button type="button" variant="primary" onClick={() => void copy()}>
          {copied ? "Address copied" : "Copy address"}
        </Button>
      </div>
    </div>
  );
}

export function IphoneActionSetup() {
  const board = howlerPublicHref("/");
  const command = howlerPublicHref("/api/howler-command");
  const [copied, setCopied] = useState<"link" | "command" | null>(null);

  async function copy(kind: "link" | "command") {
    const href = kind === "command" ? command : board;
    const ok = await copyHttpsAddress(href);
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <details className="mt-5 rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
        Hey Siri, Howler
      </summary>
      <p className="mt-2 text-sm text-fg">
        A website cannot hear a locked iPhone. Siri can. Paste the https command URL — not the word Howler.
      </p>
      <input
        readOnly
        value={command}
        onFocus={(event) => event.currentTarget.select()}
        className={`${inputClass} mt-3 font-mono text-xs`}
      />
      <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm text-muted">
        <li>Shortcuts → New Shortcut → name it Howler</li>
        <li>Add Dictate Text</li>
        <li>Add Get Contents of URL → POST the https command URL → JSON body command = Dictated Text</li>
        <li>Add Speak Text → Dictionary Value say</li>
        <li>Shortcut ⓘ → Ask Before Running off. Then: Hey Siri, Howler</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => void copy("command")}>
          {copied === "command" ? "https copied" : "Copy https command"}
        </Button>
        <Button variant="ghost" onClick={() => void copy("link")}>
          {copied === "link" ? "https copied" : "Copy https board"}
        </Button>
      </div>
    </details>
  );
}
