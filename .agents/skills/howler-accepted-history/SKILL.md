---
name: howler-accepted-history
description: Look up what is already accepted history in Howler without re-auditing it.
---

# Howler accepted history

## When applicable

You need to know whether prior Howler work (a task, a component, a
behavior) is already settled, or you're tempted to re-derive/re-review
something that may already be accepted.

## Inputs

- `context/receipts/accepted/*.json` — one compact receipt per accepted
  baseline (currently `through-task-013.json`).
- The `evidence` array inside the matching receipt — pointers into git
  (paths, commit SHAs), not duplicated content.

## Authority/context rules

- A receipt is authority tier 3. It is a pointer, not a substitute for the
  git-controlled evidence (tier 1) it names — read the actual file/commit
  when the specific content matters to your current task, not just the
  receipt's summary.
- Do not treat an unmerged branch, an open PR, or a task with no receipt as
  accepted. Absence of a receipt means "not yet accepted," never "assume
  accepted."
- Reopen something a receipt covers only on concrete contradictory
  evidence (a failing test, code that no longer matches the receipt's
  evidence list) — cite the evidence before changing anything.

## Minimal referenced sources

- Only the receipt(s) whose `throughTask`/`evidence` actually overlaps your
  current task's affected files or tags. Do not load every receipt for
  every task.

## Exit criteria

- You can state, with a specific evidence pointer, whether the thing you
  needed is accepted, and you have not re-derived or re-reviewed anything
  the receipt already covers without a stated, concrete reason.
