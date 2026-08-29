import { describe, expect, it } from "vitest";

import { createFixedClock } from "../helpers/clock";
import { createDeterministicIds } from "../helpers/ids";

describe("development harness", () => {
  it("returns a stable fixed clock value", () => {
    const clock = createFixedClock("2026-08-27T12:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-08-27T12:00:00.000Z");
  });

  it("returns a deterministic ID sequence", () => {
    const ids = createDeterministicIds("harness");

    expect(ids.next()).toBe("harness-1");
    expect(ids.next()).toBe("harness-2");
  });
});
