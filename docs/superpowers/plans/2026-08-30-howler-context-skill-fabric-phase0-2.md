# Howler Context + Skill Fabric — Phase 0–2

Base: `2ffc939a94d97d7f19b6f9f5885d1f407df9eb1e` (Tasks 1–13 accepted, merged into `v0.9.5-dashboard-bridge`).

This is **development infrastructure only** — it does not touch Howler runtime
(`src/`, `migrations/`, `test/{unit,integration,contract,parity,safety}`,
`wrangler.jsonc`). It does not start Task 14.

## 1. Purpose

Reduce how much of the accepted history (Tasks 1–13, and later 14+) an agent
must re-read to safely continue work, by adapting two ideas without adopting
either external runtime:

- from ICM: scoped/selective context, compact context packs, provenance,
  accepted-history references (not full re-derivation), staleness/dedup.
- from Hermes: procedural skills, progressive disclosure, repo-local reusable
  procedures, references loaded only when relevant.

Authority order (highest to lowest), never invertible:

1. Git-controlled code/policy/tests/specs
2. Canonical runtime truth where applicable (e.g. wrangler.jsonc, migrations)
3. Accepted receipts / derived context (`context/receipts`, catalog)
4. Agent/model memory

A context pack can *point at* higher authority; it never substitutes agent
memory for it, and a catalog entry can never claim an authority higher than
what it actually is (a receipt is never tagged `GIT_CANONICAL`).

## 2. Layout

```
AGENTS.md                              universal bootstrap/router (lean)
context/
  receipts/accepted/through-task-013.json   compact accepted-baseline receipt
  handoff/current-task.json                 current in-progress task
  catalog/index.json                        catalog entries (routable units)
  catalog/tags.json                         tag -> entry id index
.agents/skills/
  howler-task-handoff/SKILL.md
  howler-accepted-history/SKILL.md
  howler-parity-review/SKILL.md
  howler-cloudflare-safety/SKILL.md
tools/context-pack/
  src/schemas.ts      typed schemas (AuthorityRef, AcceptedReceipt, HandoffRecord,
                      CatalogEntry, PackInput, SelectedFile, PackMeasurement, PackOutput)
  src/hash.ts         canonical stable-stringify + sha256 (independent of src/worker/hash.ts —
                      tools/ stays fully decoupled from Howler runtime code)
  src/catalog.ts      loads/validates context/catalog/*.json
  src/select.ts       deterministic routing/selection + budget pruning
  src/measure.ts      char/approx-token counts, precision helper
  src/pack.ts         orchestrates PackInput -> PackOutput
  test/fixtures/      representative PackInput fixtures + expected selections
  test/*.test.ts
  tsconfig.json
  vitest.config.ts    plain-Node vitest project (no Cloudflare/Miniflare pool)
```

`.agents/skills/` (not `.claude/skills/`) is canonical — this infra serves
Claude, Codex, and future agents. `AGENTS.md` is the one router every agent
reads first.

## 3. Schemas (tools/context-pack/src/schemas.ts)

`AuthorityRef`, `AcceptedReceipt`, `HandoffRecord`, `CatalogEntry`, `PackInput`,
`SelectedFile`, `PackMeasurement`, `PackOutput` — no runtime/D1 schemas.

`PackOutput.hash` is computed over a canonical struct that explicitly
**excludes** `generatedAt`/any timestamp; `generatedAt` is attached to
`PackOutput` outside the hashed representation, so two packs built from an
identical `PackInput` against an identical catalog/receipt/handoff state
always hash identically regardless of when they were built.

## 4. Routing priority (tools/context-pack/src/select.ts)

1. mandatory safety/invariant catalog entries (`mandatory: true`) — never
   pruned by budget.
2. current handoff (`context/handoff/current-task.json`) — always included.
3. accepted receipts whose `taskTypes`/`tags` intersect the request.
4. specs/contracts whose `taskTypes`/`tags` intersect the request.
5. development skills (`.agents/skills/*/SKILL.md`) whose `taskTypes`/`tags`
   intersect the request.
6. skill *reference* files — only pulled in if the matched SKILL.md itself
   lists them as needed for this request (progressive disclosure: catalog
   metadata → SKILL.md → references, never references without their skill).

No embeddings, no vector search — selection is deterministic set-intersection
over explicit `tags`/`taskTypes`, then a fixed tie-break sort (priority tier,
then `id` ascending) so output order never depends on catalog file order.

Budget (`PackInput.budgetChars`) prunes lowest-priority-tier entries first;
mandatory entries are structurally exempt from pruning (they are added to the
selection before the budget loop ever runs, and never revisited by it).

## 5. Measurement (tools/context-pack/src/measure.ts)

Forward-only — no historical token-usage claims. Per pack: selected file
count, selected char count, a deterministic approximate token count
(`ceil(chars / 4)`, documented as an approximation, not a real tokenizer),
accepted-history references selected, mandatory-inclusion flag.

A separate **baseline vs routed** comparison (`test/fixtures/*/expected.json`
+ a small report script) states, per fixture, what a naive "read everything
plausibly relevant" baseline would include vs. what the packer actually
selects, and reports the measured reduction — no 25–40% claim is made from
this phase; only what these fixtures actually show.

Only a curated fixture baseline/report is committed; ad hoc per-run pack
output is written under `tools/context-pack/.local/` (gitignored) so runs
don't accumulate as diff noise.

## 6. TDD plan

Fixtures (`tools/context-pack/test/fixtures/`): implementation-handoff,
parity-review, cloudflare-safety, accepted-history-lookup, stale-source,
missing-source.

Tests cover: deterministic routing, deterministic ordering, stable hash
across repeated identical requests, hash unaffected by `generatedAt`,
mandatory-invariant inclusion (100% recall across all fixtures), unrelated
accepted-history exclusion, relevant accepted-history selection, authority
ordering (a lower-authority entry can never be selected in place of/labelled
above a higher-authority one), progressive skill disclosure (a skill's own
reference files are absent unless the skill itself is selected), stale/missing
source handling (flagged, not silently dropped or silently trusted), budget
pruning (lowest tier pruned first, mandatory survives).

Precision is measured as: (selected entries actually relevant to the
fixture's declared task) / (total selected entries), across the full fixture
set, target >90%.

## 7. Package scripts

New, additive only: `typecheck` gains a third leg
(`tsc --noEmit -p tools/context-pack/tsconfig.json`) so the tool is covered by
the existing `npm run typecheck` gate. A new `test:context-pack` script runs
the tool's own vitest project; the existing `test`/`verify` scripts are
otherwise untouched. No new dependencies.

## 8. Explicitly out of scope

No `src/context/`, `src/skills/`, D1 tables, runtime skill loading,
self-learning logic, voice code, Task 14 implementation, ICM/Hermes/MCP
installs, embeddings/vector DB, deployment.
