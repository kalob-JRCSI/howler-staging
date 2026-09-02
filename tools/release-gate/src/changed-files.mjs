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
