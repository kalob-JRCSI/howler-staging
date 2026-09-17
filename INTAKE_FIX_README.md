# Howler create-client intake fix (2026-09-17)

## Status
- Local audit: `node scripts/audit-intake.mjs` → 107 passed, 0 failed
- Pure functions: `scripts/intake-lib.js`
- Wire into the Windows `howler-worker/worker.js` that already has parseIntakeLocal/digestIntake/makeIntakeProject, then wrangler deploy ONLY after audit green.
- Do NOT deploy this repo's old v0.6.1 worker.js over jarvis-voice-staging (that would wipe howler-os).

## Required product behavior
1. Full first+last name on card
2. Address when spoken (never Unknown if spoken; Address TBD if missing)
3. Brief visit dashboardNote (not full speech)
4. scopeItems: room remodel lines + demo/flooring/drywall/fixtures/shower detail with phase
5. Follow-up speech ADDS scope lines without wiping name/address
6. Pratt/Stewart updates must not create clients
