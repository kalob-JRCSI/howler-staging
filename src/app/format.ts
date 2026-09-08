// Phase 1 recovery: small display helpers shared across views. Deliberately independent of
// src/worker/admin.ts's own copies (escapeHtml, formatMoney, formatDate) -- this is a separate
// client bundle with its own build step, not a shared runtime with the legacy diagnostics page.

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const parts = value.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
