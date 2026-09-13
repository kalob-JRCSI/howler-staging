export type Money = { amountMinor: number; currency: string };

export function parseMoneyDecimal(
  decimalString: string,
  currency: string,
): Money | null {
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

export function formatMoney(money: Money | null | undefined): string {
  if (!money) return "Unknown";
  const negative = money.amountMinor < 0;
  const abs = Math.abs(money.amountMinor);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const symbol = money.currency === "USD" ? "$" : `${money.currency} `;
  return `${negative ? "-" : ""}${symbol}${whole.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}

export function money(amountMinor: number, currency = "USD"): Money {
  return { amountMinor, currency };
}

export function zero(currency: string): Money {
  return { amountMinor: 0, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error("Currency mismatch");
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function sum(currency: string, amounts: Money[]): Money {
  return {
    amountMinor: amounts.reduce((total, item) => total + item.amountMinor, 0),
    currency,
  };
}
