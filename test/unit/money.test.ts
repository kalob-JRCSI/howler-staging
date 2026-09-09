import { describe, expect, it } from "vitest";
import {
  addMoney,
  formatMoneyMinor,
  isSupportedCurrency,
  isValidMoney,
  MoneyError,
  parseMoneyInput,
  subtractMoney,
  sumMoney,
} from "../../src/domain/money";

describe("isSupportedCurrency", () => {
  it("accepts every currency in the deliberate allowlist", () => {
    for (const code of ["USD", "CAD", "EUR", "GBP", "AUD", "NZD"]) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it("rejects anything not explicitly listed -- no silent two-decimal fallback", () => {
    expect(isSupportedCurrency("JPY")).toBe(false);
    expect(isSupportedCurrency("KWD")).toBe(false);
    expect(isSupportedCurrency("usd")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
    expect(isSupportedCurrency("US DOLLARS")).toBe(false);
  });
});

describe("parseMoneyInput", () => {
  it("parses an exact two-decimal USD amount into minor units", () => {
    expect(parseMoneyInput("14500.00", "USD")).toEqual({
      amountMinor: 1450000,
      currency: "USD",
    });
  });

  it("parses a whole-dollar amount with no decimal point", () => {
    expect(parseMoneyInput("18750", "USD")).toEqual({
      amountMinor: 1875000,
      currency: "USD",
    });
  });

  it("parses a negative amount (legal for CO credits)", () => {
    expect(parseMoneyInput("-175.00", "USD")).toEqual({
      amountMinor: -17500,
      currency: "USD",
    });
  });

  it("parses zero explicitly", () => {
    expect(parseMoneyInput("0", "USD")).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
  });

  it("rejects an unsupported currency before even looking at the amount", () => {
    expect(() => parseMoneyInput("100.00", "JPY")).toThrow(MoneyError);
  });

  it("rejects exponent notation", () => {
    expect(() => parseMoneyInput("1e3", "USD")).toThrow(MoneyError);
  });

  it("rejects non-finite / non-numeric input", () => {
    expect(() => parseMoneyInput("NaN", "USD")).toThrow(MoneyError);
    expect(() => parseMoneyInput("Infinity", "USD")).toThrow(MoneyError);
    expect(() => parseMoneyInput("abc", "USD")).toThrow(MoneyError);
    expect(() => parseMoneyInput("", "USD")).toThrow(MoneyError);
    expect(() => parseMoneyInput("  ", "USD")).toThrow(MoneyError);
  });

  it("rejects excess fractional precision beyond the currency's minor-unit count", () => {
    expect(() => parseMoneyInput("100.001", "USD")).toThrow(MoneyError);
  });

  it("rejects a value that would overflow safe-integer minor units", () => {
    expect(() => parseMoneyInput("99999999999999.00", "USD")).toThrow(
      MoneyError,
    );
  });

  it("never uses parseFloat(x) * 100 rounding artifacts (0.1 + 0.2 style cases)", () => {
    // A float-multiplication implementation would produce 1000000.0000000001-style
    // artifacts for values like this; a correct decimal-string parser does not.
    expect(parseMoneyInput("10000.10", "USD").amountMinor).toBe(1000010);
    expect(parseMoneyInput("10000.20", "USD").amountMinor).toBe(1000020);
  });
});

describe("isValidMoney", () => {
  it("accepts a well-formed money value", () => {
    expect(isValidMoney({ amountMinor: 100, currency: "USD" })).toBe(true);
  });

  it("rejects an unsupported currency", () => {
    expect(isValidMoney({ amountMinor: 100, currency: "JPY" })).toBe(false);
  });

  it("rejects a non-safe-integer amount", () => {
    expect(isValidMoney({ amountMinor: 1.5, currency: "USD" })).toBe(false);
    expect(
      isValidMoney({
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        currency: "USD",
      }),
    ).toBe(false);
  });

  it("rejects non-finite amounts", () => {
    expect(isValidMoney({ amountMinor: NaN, currency: "USD" })).toBe(false);
    expect(isValidMoney({ amountMinor: Infinity, currency: "USD" })).toBe(
      false,
    );
  });
});

describe("addMoney / subtractMoney", () => {
  it("adds two same-currency amounts", () => {
    expect(
      addMoney(
        { amountMinor: 100, currency: "USD" },
        { amountMinor: 250, currency: "USD" },
      ),
    ).toEqual({ amountMinor: 350, currency: "USD" });
  });

  it("subtracts two same-currency amounts, allowing a negative result", () => {
    expect(
      subtractMoney(
        { amountMinor: 100000, currency: "USD" },
        { amountMinor: 117500, currency: "USD" },
      ),
    ).toEqual({ amountMinor: -17500, currency: "USD" });
  });

  it("throws on mixed currencies -- never silently converts", () => {
    expect(() =>
      addMoney(
        { amountMinor: 100, currency: "USD" },
        { amountMinor: 100, currency: "EUR" },
      ),
    ).toThrow(MoneyError);
  });

  it("throws on overflow past safe-integer bounds", () => {
    expect(() =>
      addMoney(
        { amountMinor: Number.MAX_SAFE_INTEGER, currency: "USD" },
        { amountMinor: 1, currency: "USD" },
      ),
    ).toThrow(MoneyError);
  });
});

describe("sumMoney", () => {
  it("sums an order-independent list of same-currency amounts", () => {
    const amounts = [
      { amountMinor: 100, currency: "USD" as const },
      { amountMinor: 250, currency: "USD" as const },
      { amountMinor: -50, currency: "USD" as const },
    ];
    expect(sumMoney("USD", amounts)).toEqual({
      amountMinor: 300,
      currency: "USD",
    });
    expect(sumMoney("USD", [...amounts].reverse())).toEqual({
      amountMinor: 300,
      currency: "USD",
    });
  });

  it("returns zero for an empty list", () => {
    expect(sumMoney("USD", [])).toEqual({ amountMinor: 0, currency: "USD" });
  });

  it("throws if any amount doesn't match the declared currency", () => {
    expect(() =>
      sumMoney("USD", [{ amountMinor: 100, currency: "EUR" }]),
    ).toThrow(MoneyError);
  });
});

describe("formatMoneyMinor", () => {
  it("formats a two-decimal currency with grouping", () => {
    expect(formatMoneyMinor({ amountMinor: 145000000, currency: "USD" })).toBe(
      "$1,450,000.00",
    );
  });

  it("formats a negative amount with a leading minus", () => {
    expect(formatMoneyMinor({ amountMinor: -17500, currency: "USD" })).toBe(
      "-$175.00",
    );
  });

  it("formats exactly zero", () => {
    expect(formatMoneyMinor({ amountMinor: 0, currency: "USD" })).toBe("$0.00");
  });
});
