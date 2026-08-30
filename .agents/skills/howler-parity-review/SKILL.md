---
name: howler-parity-review
description: Verify a change preserves recovered v0.9.4 engine/domain behavior byte-for-byte.
---

# Howler parity review

## When applicable

You are changing anything under `src/engine/`, `src/domain/`, or
`src/worker/` that could affect a recovered v0.9.4 behavior (forecast
generation, oversight review, recovery analysis, coverage/metrics,
learning), or reviewing such a change.

## Inputs

- `test/parity/*.test.ts` and `test/fixtures/v094/*.json` — the golden
  fixtures recorded during the v0.9.4 characterization work; these are the
  authoritative comparison target.
- The specific engine/domain source file(s) the change touches.

## Authority/context rules

- Golden fixtures are git-controlled (tier 1). A parity test failing means
  behavior changed — that is the finding, not something to work around by
  updating the fixture unless the change is an intentional, approved
  behavior change.
- Never weaken a parity assertion (loosen equality, drop a field
  comparison) to make a change pass. If a fixture is genuinely wrong,
  that's a separate, explicit decision, not a side effect of an unrelated
  change.
- `docs/superpowers/specs/2026-08-27-howler-v095-foundation-design.md` §13.1
  states which behaviors are covered (DeBoard seed/initial forecast,
  forecast versions/dates/confidence/warnings, masonry supersession
  preview/apply, impact IDs/deltas) — read only the subsection relevant to
  what you changed.

## Minimal referenced sources

- Only the parity test file(s) and fixture(s) that exercise the code path
  you touched — not the entire `test/parity/` directory.

## Exit criteria

- `npm run test:parity` passes unchanged (or, for an intentional behavior
  change, the fixture update is called out explicitly as such, not silently
  folded into an unrelated diff).
