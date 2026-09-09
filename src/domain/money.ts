// Phase 4 (Howler Recovery Directive, Budget + Change Orders): deterministic, currency-explicit
// money arithmetic. No floating-point financial calculations anywhere in this file -- every
// amount is a safe-integer count of the currency's own minor unit (cents for USD, etc.), and
// every parse goes through a decimal-string algorithm, never `parseFloat(x) * 100` (which
// silently produces artifacts like 10000.10 -> 1000009.999999999 for real inputs).
//
// SUPPORTED_CURRENCIES is a deliberate, honest allowlist -- not "any ISO 4217 string is assumed
// to work with two decimal places." Extending it is a one-line addition with its own test, never
// an implicit fallback. `projectProfile.budget.currency` (the pre-Phase-4 legacy field) is a
// separate, unvalidated `LegacyCurrencyLabel` -- this module never parses or does arithmetic on
// it; it is only ever displayed verbatim.

import type { MoneyV097 } from "./types";

export type SupportedCurrencyCode =
  "USD" | "CAD" | "EUR" | "GBP" | "AUD" | "NZD";

interface SupportedCurrencyDefinition {
  minorUnits: number;
}

// `minorUnits` is deliberately typed `number`, not a literal -- every currency in today's
// allowlist happens to use 2, but that is allowlist data, not a structural guarantee, and a
// future non-decimal currency (e.g. a 0-minor-unit code) must not require touching the type.
export const SUPPORTED_CURRENCIES: Record<
  SupportedCurrencyCode,
  SupportedCurrencyDefinition
> = {
  USD: { minorUnits: 2 },
  CAD: { minorUnits: 2 },
  EUR: { minorUnits: 2 },
  GBP: { minorUnits: 2 },
  AUD: { minorUnits: 2 },
  NZD: { minorUnits: 2 },
};

/** Legacy `projectProfile.budget.currency` predates this contract and is never parsed,
 *  validated, or used in arithmetic here -- only ever displayed as-is. */
export type LegacyCurrencyLabel = string;

export class MoneyError extends Error {}

export function isSupportedCurrency(
  code: string,
): code is SupportedCurrencyCode {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCIES, code);
}

function requireSupportedCurrency(currency: string): SupportedCurrencyCode {
  if (!isSupportedCurrency(currency)) {
    const supported = Object.keys(SUPPORTED_CURRENCIES).join(", ");
    throw new MoneyError(
      `Currency "${currency}" is not yet supported. Supported currencies: ${supported}.`,
    );
  }
  return currency;
}

const DECIMAL_INPUT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Parses a PM/AI-supplied decimal string into checked integer minor units. Never
 * `parseFloat(value) * 100`. Rejects exponent notation, non-finite/non-numeric input, excess
 * fractional digits beyond the currency's own minor-unit count, and unsafe-integer overflow.
 */
export function parseMoneyInput(
  decimalString: string,
  currency: string,
): MoneyV097 {
  const supported = requireSupportedCurrency(currency);
  const trimmed = decimalString.trim();
  const match = DECIMAL_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    throw new MoneyError(
      `"${decimalString}" is not a valid plain decimal amount (no exponents, no currency symbols).`,
    );
  }
  const [, sign, wholePart, fractionalPartRaw] = match;
  if (wholePart === undefined) {
    // Unreachable given DECIMAL_INPUT_PATTERN's mandatory `(\d+)` group; guarded because the
    // compiler cannot see that guarantee through RegExpExecArray's indexed-element typing.
    throw new MoneyError(
      `"${decimalString}" is not a valid plain decimal amount.`,
    );
  }
  const minorUnits = SUPPORTED_CURRENCIES[supported].minorUnits;
  const fractionalPart = fractionalPartRaw ?? "";
  if (fractionalPart.length > minorUnits) {
    throw new MoneyError(
      `"${decimalString}" has more fractional digits than ${supported} supports (${String(minorUnits)}).`,
    );
  }
  const paddedFractional = fractionalPart.padEnd(minorUnits, "0");
  const combinedDigits = `${wholePart}${paddedFractional}`;
  // BigInt avoids any float precision loss while combining whole+fractional digit strings;
  // only converted to Number once, after confirming it fits a safe integer.
  const magnitude = BigInt(combinedDigits);
  const signedMagnitude = sign === "-" ? -magnitude : magnitude;
  if (
    signedMagnitude > BigInt(Number.MAX_SAFE_INTEGER) ||
    signedMagnitude < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new MoneyError(
      `"${decimalString}" is too large to represent as safe-integer minor units.`,
    );
  }
  return { amountMinor: Number(signedMagnitude), currency: supported };
}

/** True only if amountMinor is a safe integer and currency is in the supported allowlist. Does
 *  not throw -- used by validation.ts as a plain predicate. */
export function isValidMoney(money: MoneyV097): boolean {
  return (
    isSupportedCurrency(money.currency) &&
    Number.isSafeInteger(money.amountMinor)
  );
}

function requireSameCurrency(a: MoneyV097, b: MoneyV097): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot combine ${a.currency} and ${b.currency} -- Howler never converts currencies.`,
    );
  }
}

function requireSafeResult(amountMinor: number, currency: string): MoneyV097 {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(
      `Result ${String(amountMinor)} ${currency} exceeds safe-integer minor-unit bounds.`,
    );
  }
  return { amountMinor, currency: requireSupportedCurrency(currency) };
}

export function addMoney(a: MoneyV097, b: MoneyV097): MoneyV097 {
  requireSameCurrency(a, b);
  return requireSafeResult(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: MoneyV097, b: MoneyV097): MoneyV097 {
  requireSameCurrency(a, b);
  return requireSafeResult(a.amountMinor - b.amountMinor, a.currency);
}

/** Order-independent sum. Throws if any entry doesn't match `currency`. */
export function sumMoney(
  currency: SupportedCurrencyCode,
  amounts: MoneyV097[],
): MoneyV097 {
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== currency) {
      throw new MoneyError(
        `Cannot sum ${amount.currency} into a ${currency} total -- Howler never converts currencies.`,
      );
    }
    total += amount.amountMinor;
  }
  return requireSafeResult(total, currency);
}

const CURRENCY_SYMBOLS: Record<SupportedCurrencyCode, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  EUR: "€",
  GBP: "£",
};

/** Currency-aware, minor-unit-aware display formatting -- never assumes two decimal places. */
export function formatMoneyMinor(money: MoneyV097): string {
  const supported = requireSupportedCurrency(money.currency);
  const minorUnits = SUPPORTED_CURRENCIES[supported].minorUnits;
  const symbol = CURRENCY_SYMBOLS[supported];
  const negative = money.amountMinor < 0;
  const absoluteMinor = Math.abs(money.amountMinor);
  const divisor = 10 ** minorUnits;
  const wholePart = Math.trunc(absoluteMinor / divisor);
  const fractionalPart = absoluteMinor % divisor;
  const groupedWhole = wholePart.toLocaleString("en-US");
  const decimalSuffix =
    minorUnits > 0
      ? `.${String(fractionalPart).padStart(minorUnits, "0")}`
      : "";
  return `${negative ? "-" : ""}${symbol}${groupedWhole}${decimalSuffix}`;
}
