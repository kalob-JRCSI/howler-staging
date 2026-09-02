import { describe, expect, it } from "vitest";
import {
  computeChangedFiles,
  resolveComparisonBase,
  resolveChangedFiles,
  resolveMergeBaseSha,
} from "../src/changed-files.mjs";

type ComparisonBaseInput = {
  explicitSha?: string | undefined;
  explicitShaValid: boolean;
  ciBaseRef?: string | undefined;
  ciBaseSha?: string | undefined;
  ciBaseShaValid: boolean;
  localBaseRef?: string | undefined;
  localBaseRefSha?: string | undefined;
};
type ComparisonBaseResult =
  { ok: true; base: string } | { ok: false; reason: string };
const resolveComparisonBaseTyped = resolveComparisonBase as (
  input: ComparisonBaseInput,
) => ComparisonBaseResult;

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
  it("keeps previously accepted files out when the resolved base is the later accepted parent", () => {
    const result = resolveChangedFiles({
      diffResult: ok(
        "src/worker/voice-transport.ts\ntest/unit/voice-transport.test.ts\n",
      ),
      untrackedResult: ok("test/contract/voice-transport.test.ts\n"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toEqual([
        "src/worker/voice-transport.ts",
        "test/unit/voice-transport.test.ts",
        "test/contract/voice-transport.test.ts",
      ]);
      expect(result.files).not.toContain("tools/release-gate/src/gates.ts");
    }
  });

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

describe("resolveComparisonBase: durable base selection", () => {
  it("prefers an explicit valid SHA", () => {
    expect(
      resolveComparisonBaseTyped({
        explicitSha: "6697435e0efd14da5c1addf635c0353fadee0355",
        explicitShaValid: true,
        ciBaseRef: undefined,
        ciBaseSha: undefined,
        ciBaseShaValid: false,
        localBaseRef: undefined,
        localBaseRefSha: undefined,
      }),
    ).toEqual({ ok: true, base: "6697435e0efd14da5c1addf635c0353fadee0355" });
  });

  it("uses the CI pull-request base SHA when supplied", () => {
    expect(
      resolveComparisonBaseTyped({
        explicitSha: undefined,
        explicitShaValid: false,
        ciBaseRef: "v0.9.5-dashboard-bridge",
        ciBaseSha: "6697435e0efd14da5c1addf635c0353fadee0355",
        ciBaseShaValid: true,
        localBaseRef: undefined,
        localBaseRefSha: undefined,
      }),
    ).toEqual({ ok: true, base: "6697435e0efd14da5c1addf635c0353fadee0355" });
  });

  it("uses an explicit local remote base ref without embedding a historical SHA", () => {
    expect(
      resolveComparisonBaseTyped({
        explicitSha: undefined,
        explicitShaValid: false,
        ciBaseRef: undefined,
        ciBaseSha: undefined,
        ciBaseShaValid: false,
        localBaseRef: "origin/v0.9.5-dashboard-bridge",
        localBaseRefSha: "6697435e0efd14da5c1addf635c0353fadee0355",
      }),
    ).toEqual({ ok: true, base: "6697435e0efd14da5c1addf635c0353fadee0355" });
  });

  it("fails closed for an explicitly invalid SHA instead of silently falling back", () => {
    expect(
      resolveComparisonBaseTyped({
        explicitSha: "definitely-invalid-sha",
        explicitShaValid: false,
        ciBaseRef: undefined,
        ciBaseSha: undefined,
        ciBaseShaValid: false,
        localBaseRef: "origin/v0.9.5-dashboard-bridge",
        localBaseRefSha: "6697435e0efd14da5c1addf635c0353fadee0355",
      }),
    ).toEqual({
      ok: false,
      reason: "explicit comparison base is not a valid revision",
    });
  });

  it("fails closed when no valid explicit, CI, or local base exists", () => {
    expect(
      resolveComparisonBaseTyped({
        explicitSha: undefined,
        explicitShaValid: false,
        ciBaseRef: undefined,
        ciBaseSha: undefined,
        ciBaseShaValid: false,
        localBaseRef: undefined,
        localBaseRefSha: undefined,
      }),
    ).toEqual({
      ok: false,
      reason: "no valid comparison base could be resolved",
    });
  });
});

// Task 18 shipped-path correction, Medium finding: a plain two-dot `git diff --name-only <base>`
// compares the base ref's CURRENT tip against HEAD -- if the base ref has advanced with unrelated
// commits since this branch diverged, those files enter the changed-file scope even though this
// candidate never touched them (empirically reproduced against a scratch repo: a file added only
// to the base branch after divergence appeared in the two-dot diff, but not in a merge-base diff).
// resolveMergeBaseSha resolves the actual point of divergence so the caller can diff from there
// instead, scoping strictly to this candidate's own changes regardless of how far the base has
// since moved.
function mergeBaseResult(overrides: {
  status?: number | null;
  stdout?: string;
  stderr?: string;
}) {
  return {
    status: overrides.status ?? 0,
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
  };
}

describe("resolveMergeBaseSha: divergence-point resolution for the changed-file diff", () => {
  it("1: a successful git merge-base resolves to its trimmed sha", () => {
    const result = resolveMergeBaseSha(
      mergeBaseResult({ stdout: "abc123def456\n" }),
    );
    expect(result).toEqual({ ok: true, sha: "abc123def456" });
  });

  it("2: a nonzero exit (e.g. unrelated histories, invalid base) fails closed", () => {
    const result = resolveMergeBaseSha(
      mergeBaseResult({
        status: 1,
        stderr: "fatal: Not a valid commit name definitely-invalid-sha",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/merge-base/i);
  });

  it("3: a spawn error (status null) fails closed", () => {
    const result = resolveMergeBaseSha(mergeBaseResult({ status: null }));
    expect(result.ok).toBe(false);
  });

  it("4: empty stdout despite a zero exit fails closed rather than diffing from nothing", () => {
    const result = resolveMergeBaseSha(mergeBaseResult({ stdout: "" }));
    expect(result.ok).toBe(false);
  });
});
