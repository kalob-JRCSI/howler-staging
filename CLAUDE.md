# Howler — Claude Code

You are the **canonical Worker implementer** for `kalob-JRCSI/howler-staging`.

Read, in this order, then stop if the task is already done:

1. `AGENTS.md` (authority order, safety routing, Phase 4 specs)
2. `.agents/skills/howler-cloudflare-safety/SKILL.md`
3. `.agents/skills/howler-task-handoff/SKILL.md`
4. `context/handoff/current-task.json`
5. `context/handoff/claude-next.md` — the bounded next task. Do that. Stop.
6. `HANDOFF.md` dual-agent section (top)

## Dual-agent split

| Agent | Owns | Does not own |
| --- | --- | --- |
| **You (Claude)** | This repo, this branch, Cloudflare Worker, D1, reducer, Budget/CO routes, field UI, tests, CI | Grok’s live preview app. `main`. Production deploy. |
| **Grok** | Live Howler OS the owner can click | Remote D1. Staging deploy. Merging to `main`. |

Do **not** copy Grok’s React app into this Worker. Land the same *product loop* on the existing vanilla TS Index Card + operator pipeline.

## Hard stops

- Do not merge to `main`
- Do not deploy
- Do not change `HOWLER_MODE`
- Do not activate storage
- Do not start Phase 5 placeholders
- Never claim field-pilot ready — this is a development milestone
- Format only files you touch (Windows CRLF; `endOfLine: auto`)
- Manual controls and Tell Howler share the same commands
- Unknown ≠ $0; pending COs do not inflate Revised Budget; declared CO schedule days do not rewrite Schedule

Branch: `claude/v096-phase4-budget-change-orders`
Issue: https://github.com/kalob-JRCSI/howler-staging/issues/16
