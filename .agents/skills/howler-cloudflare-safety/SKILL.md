---
name: howler-cloudflare-safety
description: Mandatory invariants for any change touching Cloudflare Workers, D1, or deployment.
---

# Howler Cloudflare safety

## When applicable

Any task touching `wrangler.jsonc`, `migrations/`, `src/worker/`, CI/deploy
workflows, or anything that could run against a real Cloudflare account —
including tasks that only read this material to decide whether it's safe to
proceed. Load this skill before making the change, not after.

## Inputs

- `wrangler.jsonc` — canonical deploy config: worker name, `HOWLER_MODE`,
  D1 binding/database name.
- `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`.
- `src/operator/policy.ts` (`OPERATOR_SAFETY`, `assertStagingShadowPolicy`).

## Authority/context rules — mandatory invariants (never pruned)

- `HOWLER_MODE` must remain `"shadow"`. No task in this line of work
  changes it to `"controlled"`.
- The D1 binding must remain the staging database
  (`howler-intelligence-staging`); never point at a production database.
- `liveSystemsConnected`, `dashboardConnected`, `calendarConnected`,
  `productionDeployment` in `OPERATOR_SAFETY` stay `false`. No intent kind
  may set them from client input.
- Never deploy, migrate a remote D1 database, or merge without the explicit,
  separate authorization each of those actions requires — this skill covers
  deciding whether an action is _safe_, not authorizing you to take it.
- These four points are authority tier 2 (canonical runtime truth) —
  they override anything a receipt, skill reference, or memory says to the
  contrary.

## Minimal referenced sources

- Only the specific workflow file or policy function relevant to the
  change (e.g. `deploy.yml` only if the change touches CI/deploy).

## Exit criteria

- You can state explicitly that the change preserves all four invariants
  above, or you have stopped and flagged a concrete conflict before
  proceeding.
