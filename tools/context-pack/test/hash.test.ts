import { describe, expect, it } from "vitest";
import { sha256Hex, stableStringify } from "../src/hash.js";

describe("stableStringify", () => {
  it("is insensitive to object key insertion order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(
      stableStringify({ a: 2, b: 1 }),
    );
  });

  it("preserves array order", () => {
    expect(stableStringify({ a: [1, 2, 3] })).not.toBe(
      stableStringify({ a: [3, 2, 1] }),
    );
  });
});

describe("sha256Hex", () => {
  it("is deterministic for identical canonical input", async () => {
    const a = await sha256Hex({ x: 1, y: [1, 2] });
    const b = await sha256Hex({ y: [1, 2], x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for genuinely different content", async () => {
    const a = await sha256Hex({ x: 1 });
    const b = await sha256Hex({ x: 2 });
    expect(a).not.toBe(b);
  });
});
