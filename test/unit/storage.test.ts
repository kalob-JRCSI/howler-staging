import { describe, expect, it } from "vitest";
import { RevisionConflictError } from "../../src/engine/storage";

describe("RevisionConflictError", () => {
  it("is an Error subclass with a stable name and message", () => {
    const error = new RevisionConflictError("stale revision");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RevisionConflictError");
    expect(error.message).toBe("stale revision");
  });
});
