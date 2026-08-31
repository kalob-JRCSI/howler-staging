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
