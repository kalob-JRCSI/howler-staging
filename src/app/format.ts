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

// Phase 4 (Budget + Change Orders): a small, independent copy of
// src/domain/money.ts's own formatMoneyMinor, for the same "separate client bundle" reason as
// this file's header comment above. Every currency in the server's SUPPORTED_CURRENCIES allowlist
// (USD/CAD/EUR/GBP/AUD/NZD) uses 2 minor units; this intentionally does not guess for anything
// else, since the server never sends a currency this table doesn't cover.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatMoneyMinor(money: {
  amountMinor: number;
  currency: string;
}): string {
  const symbol = CURRENCY_SYMBOLS[money.currency] ?? `${money.currency} `;
  const negative = money.amountMinor < 0;
  const absoluteMinor = Math.abs(money.amountMinor);
  const whole = Math.trunc(absoluteMinor / 100);
  const cents = absoluteMinor % 100;
  return `${negative ? "-" : ""}${symbol}${whole.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}

/**
 * Client-side copy of src/domain/money.ts parseMoneyInput for the 2-minor-unit currencies
 * this app actually displays. Digit-string assembly, never parseFloat(value) * 100.
 * Returns null for empty or invalid input so forms can refuse to submit.
 */
export function parseMoneyDecimal(
  decimalString: string,
  currency: string,
): { amountMinor: number; currency: string } | null {
  const trimmed = decimalString.trim();
  if (!trimmed) return null;
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;
  const fractional = match[3] ?? "";
  if (fractional.length > 2) return null;
  const combined = `${match[2] ?? "0"}${fractional.padEnd(2, "0")}`;
  const magnitude = BigInt(combined);
  const signed = match[1] === "-" ? -magnitude : magnitude;
  if (
    signed > BigInt(Number.MAX_SAFE_INTEGER) ||
    signed < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return null;
  }
  return { amountMinor: Number(signed), currency };
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
