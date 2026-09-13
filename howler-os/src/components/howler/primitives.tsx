import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 font-mono text-[15px] tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle transition-[box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-smooth)] focus-visible:shadow-[var(--shadow-border-hover)]";

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function StatusChip({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const map = {
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    neutral: "text-muted",
  };
  return (
    <span className={cn("text-xs font-medium uppercase tracking-[0.12em]", map[tone])}>
      {children}
    </span>
  );
}

export function Expandable({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-surface-2">
      <button
        type="button"
        className="flex min-h-11 w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-quick)] hover:bg-surface"
        onClick={onToggle}
      >
        <div className="min-w-0">
          {title}
          {meta}
        </div>
        <span className="shrink-0 pt-0.5 text-xs uppercase tracking-[0.12em] text-muted">
          {open ? "Close" : "Edit"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
      ) : null}
    </div>
  );
}
