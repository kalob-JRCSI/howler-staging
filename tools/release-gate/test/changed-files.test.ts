import { describe, expect, it } from "vitest";
import {
  computeChangedFiles,
  resolveChangedFiles,
} from "../src/changed-files.mjs";

describe("computeChangedFiles: pure parsing/combination logic", () => {
  it("combines diff-against-base output and untracked-file output, deduplicated", () => {
    const result = computeChangedFiles({
      diffOutput: "src/a.ts\nsrc/b.ts\n",
      untrackedOutput: "src/c.ts\n",
    });
    expect(result.sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("deduplicates a file appearing in both lists", () => {
    const result = computeChangedFiles({
      diffOutput: "src/a.ts\n",
      untrackedOutput: "src/a.ts\n",
    });
    expect(result).toEqual(["src/a.ts"]);
  });

  it("ignores blank lines and trailing whitespace", () => {
    const result = computeChangedFiles({
      diffOutput: "src/a.ts\n\n  \n",
      untrackedOutput: "",
    });
    expect(result).toEqual(["src/a.ts"]);
  });

  it("empty inputs produce an empty list", () => {
    expect(
      computeChangedFiles({ diffOutput: "", untrackedOutput: "" }),
    ).toEqual([]);
  });
});

function ok(stdout: string) {
  return { status: 0, stdout, stderr: "" };
}

describe("resolveChangedFiles: fail-closed Git discovery", () => {
  it("1: a valid base with real Git output resolves to the expected changed files", () => {
    const result = resolveChangedFiles({
      diffResult: ok("src/a.ts\n"),
      untrackedResult: ok("src/b.ts\n"),
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("2: an invalid base (git diff exits nonzero, e.g. bad revision) -> ok:false, never []", () => {
    const result = resolveChangedFiles({
      diffResult: {
        status: 128,
        stdout: "",
        stderr: "fatal: bad revision 'definitely-invalid-sha'",
      },
      untrackedResult: ok(""),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/git diff/i);
  });

  it("3: a nonexistent commit produces the same fail-closed shape as any other bad revision", () => {
    const result = resolveChangedFiles({
      diffResult: {
        status: 128,
        stdout: "",
        stderr: "fatal: bad object 0000000000000000000000000000000000000000",
      },
      untrackedResult: ok(""),
    });
    expect(result.ok).toBe(false);
  });

  it("4: a Git command failure (spawn error, status null) -> ok:false", () => {
    const result = resolveChangedFiles({
      diffResult: { status: null, stdout: "", stderr: "" },
      untrackedResult: ok(""),
    });
    expect(result.ok).toBe(false);
  });

  it("5: a genuinely clean diff ([] result) is allowed ONLY when both Git commands actually succeeded", () => {
    const result = resolveChangedFiles({
      diffResult: ok(""),
      untrackedResult: ok(""),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.files).toEqual([]);
  });

  it("6: the diff succeeds but untracked-file discovery fails -> ok:false", () => {
    const result = resolveChangedFiles({
      diffResult: ok("src/a.ts\n"),
      untrackedResult: { status: 1, stdout: "", stderr: "some git error" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ls-files/i);
  });

  it("7: deleted-file entries from a successful diff pass through unfiltered (existence filtering is the caller's job, downstream of a successful discovery)", () => {
    const result = resolveChangedFiles({
      diffResult: ok("src/deleted-file.ts\n"),
      untrackedResult: ok(""),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.files).toContain("src/deleted-file.ts");
  });
});
