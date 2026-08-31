import { describe, expect, it } from "vitest";
import { computeChangedFiles } from "../src/changed-files.mjs";

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
