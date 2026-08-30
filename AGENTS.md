# AGENTS.md — Howler router

Read this first. It routes you to the right context; it is not the context
itself.

## Authority order (highest wins; never invert)

1. Git-controlled code, policy, tests, and specs in this repository.
2. Canonical runtime truth where applicable (`wrangler.jsonc`, `migrations/`,
   deployed schema).
3. Accepted receipts and derived context under `context/` (compact pointers
   to #1/#2 — never a substitute for reading the thing they point at when it
   actually matters to your task).
4. Agent/model memory.

A lower authority never overrides a higher one. If a receipt or a skill
appears to contradict the code, tests, or specs, the code/tests/specs win —
treat the receipt as stale and say so.

## Accepted-history rule

Tasks recorded as accepted in `context/receipts/accepted/` are settled
history. Do not re-audit or re-derive them from scratch. Reopen a specific
prior task only when your _current_ task turns up concrete, contradictory
evidence against it (a failing test, a contradicted invariant, code that
doesn't match the receipt) — then say what the evidence is before touching
anything.

A task is accepted history only once it has its own receipt file here. The
absence of a receipt for a task means it is not yet accepted — do not infer
acceptance from a merge alone.

## Where the current context lives

- `context/handoff/current-task.json` — what is in progress right now, and
  what it is blocked on.
- `context/receipts/accepted/` — compact, accepted-baseline receipts.
- `context/catalog/index.json` (+ `tags.json`) — the routable catalog of
  skills, receipts, specs, and other context units, tagged by authority and
  task type.
- `.agents/skills/` — canonical, repo-local procedural skills (Claude,
  Codex, and future agents all read from here; do not fork
  Claude-specific copies).

## Progressive disclosure

Don't bulk-load context. Go: catalog metadata → the one relevant
`SKILL.md` → that skill's own referenced support files, and only the ones it
actually names as needed for your task. A skill's reference material is never
loaded on its own, without the skill that names it.

## Safety/invariant routing

Any task touching Cloudflare Workers, D1, deployment, or the operator
surface must load the `howler-cloudflare-safety` skill
(`.agents/skills/howler-cloudflare-safety/SKILL.md`) before making changes.
Its invariants (staging-only, `HOWLER_MODE=shadow`, no live systems, no
unauthorized deploy) are mandatory context — a context pack must never prune
them for budget reasons.

## Tooling

`tools/context-pack/` builds a deterministic, authority-tagged context pack
from a task description — see its own README/tests before reimplementing
selection logic by hand.
