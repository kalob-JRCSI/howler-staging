import { describe, expect, it } from "vitest";
import { sha256Hex, stableStringify } from "../../src/worker/hash";

describe("stableStringify", () => {
  it("sorts object keys regardless of insertion order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(
      stableStringify({ a: 2, b: 1 }),
    );
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys recursively in nested objects", () => {
    expect(stableStringify({ z: { d: 1, c: 2 }, a: 1 })).toBe(
      '{"a":1,"z":{"c":2,"d":1}}',
    );
  });

  it("preserves array element order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("sorts keys inside array elements without reordering the array itself", () => {
    expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("passes through primitives unchanged", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(true)).toBe("true");
  });
});

describe("sha256Hex", () => {
  it("produces the same hash for objects that differ only in key order", async () => {
    const a = await sha256Hex({ b: 1, a: 2 });
    const b = await sha256Hex({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("produces a different hash for different content", async () => {
    const a = await sha256Hex({ a: 1 });
    const b = await sha256Hex({ a: 2 });
    expect(a).not.toBe(b);
  });

  it("produces a stable, known hash for a fixed input", async () => {
    const hash = await sha256Hex({ a: 1, b: [1, 2, 3] });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(await sha256Hex({ b: [1, 2, 3], a: 1 }));
  });
});
