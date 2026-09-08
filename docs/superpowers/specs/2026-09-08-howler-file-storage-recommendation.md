# Howler file storage: Drive, R2, or hybrid

Date: 2026-09-08. Status: recommendation for owner review; not an approved implementation spec.

## Decision

Recommend **hybrid by lifecycle**, introduced incrementally. Keep project metadata and approvals authoritative in the existing canonical project model/event pipeline. Store file bytes outside D1. Do not introduce a parallel project database or a general-purpose sync platform.

| Option | Strength | Cost / risk | Verdict |
| --- | --- | --- | --- |
| Drive only | Existing collaboration and familiar externally supplied files | External permissions, mutable references, unsuitable as Howler's only retained record | Use selectively |
| R2 only | Howler-controlled field uploads and explicit retained versions | Would duplicate collaborative files; would require replacing Drive editing/sharing workflows | Use selectively |
| Hybrid | Fits both field capture and collaborative authoring | Two provider failure modes and explicit version ownership | Recommended, staged rather than built all at once |

This is a qualitative comparison, not a pricing estimate. Before implementation, estimate upload volume, retained versions, exports, and read frequency against current provider pricing; impose upload and storage budgets.

## Module policy

| Module | Default | What Howler treats as evidence |
| --- | --- | --- |
| Photos | Private R2 upload for new field captures; existing external photos may remain references | Verified uploaded bytes with uploader, project association, capture metadata marked as reported/unverified where appropriate |
| Plans | Drive reference for working sets | An explicit PM-selected issued revision, preferably a retained PDF snapshot; never silently replace the approved revision with the live file |
| Documents | Drive reference while drafting; retained snapshot when explicitly marked executed/final | The exact retained version and its approval/provenance event, not an inference that a file is signed |

An R2 copy is not automatically available offline. Offline caching is separate, unapproved work. A stored signed document does not itself verify signature validity or legal enforceability.

## Canonical metadata, not another source of truth

The existing `ProjectModelV094` and canonical reducer/event pipeline remain authoritative. `ScopeItemV096.planDocumentRefs` already provides string associations; future file IDs should resolve within the same project. Do not populate those references with fabricated or unresolved records.

Proposed future model shape, not a new contract in this change:

- One logical file ID, project association, category, display name, scope/activity associations, and lifecycle state.
- Explicit version records with version ID, source/uploader identity, recorded time, media type, size, checksum for retained bytes, and approval provenance.
- A version can carry a Drive source locator **and** an R2 snapshot locator. A mutually exclusive `DRIVE | R2` flag cannot represent that relationship adequately.
- Drive locators record file identity, observed revision/version metadata and observation time. Google-native exports record their format and actual exported checksum. Do not label an unpinned live reference immutable.
- R2 object keys are server-generated and version-specific; replacing content creates a new version/event. Historical references keep pointing to their original bytes.
- Provider credentials and signed URLs never belong in the project model, event ledger, logs, or browser storage. Cache metadata is labeled as observed, not canonical business truth.

Keep these optional additions backward compatible. All associations, revision checks, and approvals use existing project isolation and mutation gates. No new D1 table is proposed.

## Version and delivery integrity

A live Drive file can change after approval. Drive's binary revision retention is not an unconditional permanent archive: unpinned revisions are purgeable and `keepForever` has limits. Use provider revision history for authoring, but retain the exact approved artifact when durable evidence is required. [Google revision management](https://developers.google.com/workspace/drive/api/guides/manage-revisions).

R2 version-specific keys and application no-overwrite rules provide application-level immutability, not a legal WORM guarantee. Consider bucket locks only after the owner chooses retention and deletion policy; locks prevent overwrite/deletion while configured, but privileged configuration changes remain a separate control. [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

There is no atomic transaction spanning provider bytes and canonical D1 state. The future attach flow must be:

1. Authorize the project and create a bounded upload/snapshot operation identity.
2. Transfer to a private, unreferenced object; validate actual size, allowed content type, checksum, and source version consistency.
3. Commit the canonical attachment event with the expected project revision and stable operation identity.
4. On uncertain delivery, read/reuse the committed outcome. Never attach twice or overwrite newer project state. On failed commit, leave no visible attachment and reclaim unreferenced objects only after a grace period and reference check.

Do not claim an upload is attached before canonical commit. If Drive changes during snapshot/export and the selected version cannot be established, fail visibly and require a new selection. Provider outages, permission loss, or deleted sources show unavailable/stale status, not invented metadata or success.

## Permissions and security

Use existing Howler session and project authorization checks on every metadata and byte operation. Shared provider access is not permission for every Howler user to read every project.

For Drive, choose one initial access model before coding:

- Company-controlled Shared Drive: a dedicated identity with explicitly granted, minimal access may be appropriate, if company policy permits. Domain sharing alone does not grant service accounts access. Do not introduce domain-wide delegation. [Shared Drive guidance](https://developers.google.com/workspace/drive/api/guides/manage-shareddrives).
- Individually owned/external files: prefer user-selected per-file OAuth access rather than broad Drive access. `drive.file` is designed for selected files; credentials still require secure server-side storage. Do not pretend a service account reproduces user permissions. [Drive authorization scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Start with R2 server-mediated access through the existing authenticated surface. If direct uploads/downloads later need presigned URLs, keep them short-lived, object/operation-specific and out of logs. They are bearer capabilities reusable until expiry, not an ongoing session authorization check. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

Keep buckets private. Validate file size and content independently of client headers; serve untrusted active formats as downloads, not executable same-origin content. Restrict provider identifiers instead of fetching arbitrary user URLs. Before accepting broad document formats, specify quarantine/scanning and retention rules. Preserve originals; treat thumbnails, extracted text and AI summaries as disposable derivatives. Capture timestamps/EXIF are not verified field facts.

## Intelligence and transport

Index only explicitly attached, authorized versions. Begin with on-demand extraction; no folder-wide crawl or nightly synchronization is necessary for the first slice. A derived answer must cite file/version and report extraction freshness. File contents are untrusted data, never instructions or authorization to mutate project state. No automatic schedule, scope, or commitment changes.

File selection/upload is adapter-specific, but attachment identities and canonical operations remain transport-independent. Future voice may refer to an existing attachment through the same policy and confirmation path; this recommendation introduces no voice work.

## Smallest implementation sequence, after approval

1. R2-native Photos: optional canonical references and version provenance, manual upload/view/associate controls, isolated staging storage, idempotent attachment and unavailable/error states. No AI indexing required.
2. Drive references for Plans/Documents: one approved credential model, explicit file selection, permission/error handling, clear working-versus-issued labeling. No two-way sync.
3. Explicit issued/executed snapshot action: version-consistent export/download, retained checksum, existing preview/confirm/revision gates, recovery and retention tests.

Each slice needs its own audit and approved implementation plan. Test cross-project denial, duplicate/uncertain attachment, upload success plus D1 failure, revision conflict, source changed during copy, revoked Drive access, unsupported/oversized content, and historical-version stability. Browser tests must prove manual controls work outside diagnostics and failures cannot appear as successful attachments. Preserve all current regression gates.

Measure attach success rate, time to find a current issued document, wrong/stale-version incidents, duplicate/orphan objects, storage per project, and failed authorization checks. Compare against a small recorded manual baseline; do not promise numerical savings before measurement.

## Owner decisions before implementation

1. Approve R2-native Photos as the first file-module slice, or choose a different next module.
2. Identify whether plan/document sources are a company Shared Drive or individually owned/external files; approve the matching access model.
3. Approve retention/deletion requirements and whether every issued plan/executed document must have a retained snapshot. Recommended: require a snapshot for Howler's durable approved record, while clearly labeling unsnapshotted references as live.

## Scope and safety

This recommendation creates no bucket, Drive credentials, dependency, migration, connector, or file-storage implementation. Existing external identifiers, bindings, `HOWLER_MODE=shadow`, and `liveSystemsConnected=false` remain unchanged. No deployment or production access was performed. Any future provider activation requires separate authorization; the current no-live-system boundary is not relaxed by this document.
