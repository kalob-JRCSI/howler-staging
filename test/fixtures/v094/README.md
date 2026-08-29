# HOWLER v0.9.4 characterization corpus

These fixtures freeze the observable staging behavior of engine compatibility version `0.9.4`. They are recovery evidence, not examples to simplify, repair, or reinterpret.

## Immutable baseline provenance

- Sole baseline commit: `d851357bd08a795df3508ff610da9eaa1c386a43`
- Git path: `worker.js`
- Git blob ID: `63095d4febc161cf535f58cc5fbb0bdaaf1617f7`
- Bundle byte length: `170485`
- Bundle SHA-256: `83ccdc44707944b41c2e2590f68ef0d222e22658ee2f02f7f559712f4915b5f9`
- Bundle banner: `HOWLER Scheduling Intelligence staging bundle v0.9.4`

The bundle was read once from the Git object database into ignored recovery scratch under the v0.9.5 foundation plan. `git hash-object` reproduced the recorded blob ID before execution. This was a one-time characterization procedure only: the legacy bundle is not tracked in the recovery tree, is not a deployable input, and is not a supported build or bundle-transfer workflow.

## Extraction and execution

The unchanged blob was loaded as an ES module behind an ignored fixed-clock wrapper and executed with the plan-local Node `v24.20.0` runtime and the lockfile-resolved Miniflare `5.20260825.0-alpha`. The runtime used an in-memory D1 database bound as `HOWLER_DB`, `HOWLER_MODE="shadow"`, and the fixture-only bearer key `fixture-admin-key`. No remote binding, Dashboard, Calendar, production system, or Cloudflare deployment was contacted.

The execution sequence initialized all 19 baseline schema statements, seeded `deboard-v091`, read its initial forecast/health/recovery/events/learning routes, replayed the admin bundle's masonry evidence simulation through understanding preview and event preview, confirmed publishing is rejected in shadow mode, applied the reviewed event through `apply-shadow`, and then read recovery and ordered events. Route contracts contain direct authenticated and unauthenticated probes. The schema fixture contains the 19 SQL strings extracted from `SCHEMA_STATEMENTS` in their original order, with only compatibility-provenance comments and terminating semicolons added.

## Fixed clock and IDs

- Fixed clock and injected event timestamp: `2026-08-27T12:00:00.000Z`
- Fixed `Date.now()`: `1787832000000`
- Masonry evidence source ID: `src-v093-field-sim-1787832000000`
- Masonry event ID: `deboard-v093-field-sim-1787832000000`
- Initial snapshot/review IDs: `deboard-v091-forecast-v1` and `deboard-v091-forecast-v1-oversight`
- Masonry snapshot/review IDs: `deboard-v091-forecast-v2` and `deboard-v091-forecast-v2-oversight`
- Masonry preview review token: `e66030ad8d1bc640bfea572e04fa806f31766f721348fd92ceb2b5e0fd2c9e02`

The masonry request is the exact object constructed by the v0.9.4 admin bundle's `buildMasonryEvidenceSimulation`, evaluated under the fixed clock. This preserves its original `v093` ID/label text as observable v0.9.4 behavior.

## Normalization rules

1. The wrapper replaces only zero-argument `new Date()` and `Date.now()` with the fixed clock above. The injected timestamp is retained literally in initial forecast/review creation times, the masonry event's `occurredAt` and `receivedAt`, the new source's `observedAt`, and the derived preview/apply candidate and oversight times.
2. A top-level `requestId` emitted by the bundle's unexpected-500 handler would be normalized to `<request-id>`. None of the selected responses entered that handler, so no request ID replacement occurs in this corpus.
3. No other response field is normalized. Dates, IDs, review tokens, numeric precision, nulls, omitted undefined fields, response field order, and every observable array order/value are retained from baseline execution.
4. JSON response bodies were parsed and serialized with two-space indentation plus a final newline. Each JSON file adds only the fixture envelope (`engineCompatibilityVersion`, request metadata, and response metadata). `deboard-seed.json` holds the seed response's `project`; `initial-forecast.json` holds the remaining seed response fields so the two files jointly preserve that response without inventing a second call.
5. `schema.sql` remains SQL text. It is deliberately not wrapped in JSON and records compatibility provenance in SQL comments. This README likewise remains Markdown.

## Content SHA-256

Hashes cover the exact UTF-8 bytes of each machine-consumed fixture, including the final LF newline. The repository's scoped `.gitattributes` rule keeps these corpus files LF-stable on every checkout. This README is excluded to avoid a self-referential hash.

| File | SHA-256 |
| --- | --- |
| `deboard-seed.json` | `eaad625784ab780774d07fd8c7760b5508b4a13988bd4d7d7a0f61d4f272f080` |
| `initial-forecast.json` | `578754b6d1be90a09f689f3e4eb7eba1179820f2e9ebb778db17fde9a5236c54` |
| `masonry-apply-shadow.json` | `93482879d9c5b10c06f1ed9205d643559d7287197f7fe9561680ad03eb5986ee` |
| `masonry-preview.json` | `2bbb5ca11f7dbe045899159230977161519ce1d784bec94f64956587026879c2` |
| `recovery.json` | `7d3e1932582b6dd9fe2e1bc93e030c43d0a0c035b60d717e675784efd067b3eb` |
| `route-contracts.json` | `bfac639ede0b90d54a90e7584e25a63d98c524509cdc79710165a66d6817b2b4` |
| `schema.sql` | `28aefd8a5728282d2bed5649acaeec63dc40fc007c17806d5ca14093002b05bc` |
