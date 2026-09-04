---
name: howler-task-handoff
description: Pick up or hand off the current in-progress Howler task without re-deriving prior tasks.
---

# Howler task handoff

## When applicable

You are starting, continuing, or closing out the task recorded in
`context/handoff/current-task.json` — including when a user asks you to
"continue where the last session left off" on Howler.

## Inputs

- `context/handoff/current-task.json` — status, base SHA, what it blocks.
- `context/receipts/accepted/` — accepted baseline the handoff builds on.

## Authority/context rules

- The handoff record is authority tier 3 (accepted receipts/derived
  context) — it points at git-controlled evidence; when in doubt, read the
  actual files it names under `relevantPaths`, not just the summary.
- `baseSha` in the handoff must be an ancestor of the branch you are working
  from. If it is not, the handoff is stale — say so before proceeding.
- If `status` is `BLOCKED`, do not start the work it blocks (check `blocks`)
  without explicit authorization.

## Minimal referenced sources

- The plan doc named by the handoff (if any), read only the sections
  relevant to the immediate next step, not the whole document up front.
- The accepted receipt(s) covering the base — for pointers only, not
  re-verification, unless you find contradictory evidence.

## Exit criteria

- On completing the task, update `context/handoff/current-task.json`
  (`status`, `summary`) and, if the task itself becomes accepted history,
  add or extend the relevant receipt under `context/receipts/accepted/` —
  do not leave a stale in-progress handoff pointing at finished work.
