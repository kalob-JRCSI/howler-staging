// Task 17 correction: pure parsing/combination logic for the release gate's dynamic
// changed-file discovery. Kept separate from run.mjs's actual `git` invocations so the
// combination logic itself (parse, dedupe, merge tracked-diff + untracked-file lists) is
// unit-testable without spawning a real process.

/**
 * @param {string} output raw newline-separated `git diff --name-only`/`git ls-files` stdout
 * @returns {string[]}
 */
function parseGitFileList(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Resolve a comparison base from explicit input, CI pull-request metadata, or a caller-provided
 * local remote ref. No historical commit is safe as an implicit fallback.
 *
 * @param {{ explicitSha?: string; explicitShaValid: boolean; ciBaseRef?: string; ciBaseSha?: string; ciBaseShaValid: boolean; localBaseRef?: string; localBaseRefSha?: string }} input
 * @returns {{ ok: true; base: string } | { ok: false; reason: string }}
 */
export function resolveComparisonBase(input) {
  if (input.explicitSha && !input.explicitShaValid) {
    return {
      ok: false,
      reason: "explicit comparison base is not a valid revision",
    };
  }
  if (input.explicitSha && input.explicitShaValid) {
    return { ok: true, base: input.explicitSha };
  }
  if (input.ciBaseSha && input.ciBaseShaValid) {
    return { ok: true, base: input.ciBaseSha };
  }
  if (input.localBaseRef && input.localBaseRefSha) {
    return { ok: true, base: input.localBaseRefSha };
  }
  return { ok: false, reason: "no valid comparison base could be resolved" };
}

/**
 * Resolves the actual point of divergence between the comparison base and HEAD, so the caller can
 * diff strictly from there -- a plain two-dot `git diff --name-only <base>` compares the base
 * ref's CURRENT tip against HEAD, so if the base has advanced with unrelated commits since this
 * branch diverged, those files would enter the changed-file scope even though this candidate never
 * touched them. Fails closed (never silently diffs from "nothing", i.e. an empty/missing sha) on
 * any git failure -- unrelated histories, an invalid base, or a spawn error alike.
 *
 * @param {{ status: number | null; stdout?: string; stderr?: string }} mergeBaseResult
 * @returns {{ ok: true; sha: string } | { ok: false; reason: string }}
 */
export function resolveMergeBaseSha(mergeBaseResult) {
  if (mergeBaseResult.status !== 0) {
    return {
      ok: false,
      reason: `git merge-base failed (exit ${String(mergeBaseResult.status)})${
        mergeBaseResult.stderr ? `: ${mergeBaseResult.stderr.trim()}` : ""
      }`,
    };
  }
  const sha = (mergeBaseResult.stdout ?? "").trim();
  if (!sha) {
    return { ok: false, reason: "git merge-base produced no output" };
  }
  return { ok: true, sha };
}

/**
 * @param {{ diffOutput: string; untrackedOutput: string }} input
 * @returns {string[]}
 */
export function computeChangedFiles({ diffOutput, untrackedOutput }) {
  const seen = new Set();
  for (const file of parseGitFileList(diffOutput)) seen.add(file);
  for (const file of parseGitFileList(untrackedOutput)) seen.add(file);
  return [...seen];
}

/**
 * Resolves the actual changed-file list from raw `spawnSync`-shaped Git command results, or
 * fails closed with a reason -- never silently degrades a failed Git invocation (an invalid
 * base SHA, a nonexistent commit, a spawn error, an untracked-file discovery failure) into an
 * empty file list. An empty list is only ever returned when both commands genuinely succeeded
 * and found no changes. Existence-filtering a deleted file out of the result (once discovery
 * itself succeeded) remains the caller's job, not this function's.
 *
 * @param {{ diffResult: { status: number | null; stdout?: string; stderr?: string }; untrackedResult: { status: number | null; stdout?: string; stderr?: string } }} input
 * @returns {{ ok: true; files: string[] } | { ok: false; reason: string }}
 */
export function resolveChangedFiles({ diffResult, untrackedResult }) {
  if (diffResult.status !== 0) {
    return {
      ok: false,
      reason: `git diff failed (exit ${String(diffResult.status)})${
        diffResult.stderr ? `: ${diffResult.stderr.trim()}` : ""
      }`,
    };
  }
  if (untrackedResult.status !== 0) {
    return {
      ok: false,
      reason: `git ls-files failed (exit ${String(untrackedResult.status)})${
        untrackedResult.stderr ? `: ${untrackedResult.stderr.trim()}` : ""
      }`,
    };
  }
  return {
    ok: true,
    files: computeChangedFiles({
      diffOutput: diffResult.stdout ?? "",
      untrackedOutput: untrackedResult.stdout ?? "",
    }),
  };
}
