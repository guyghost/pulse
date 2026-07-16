# Release Readiness Evidence Model

Status: model-only source of truth for Task 12. Review is required before any
tooling or workflow implementation.

## Scope and non-claims

This model separates deterministic local release work from external Chrome Web
Store facts.

- Local work may advance `audited -> rc_built -> package_validated ->
store_ready` by validating immutable structured receipts.
- This repository never submits, cancels, retries, promotes, or rolls back a
  provider operation. There are no provider command events in this model.
- `submission`, canary, production, and rollback are facts ingested after an
  operator/provider performed them elsewhere. Only the structured signed
  receipts defined here have authority; a generic `EvidenceRef`, dashboard
  label, free text, or LLM assessment has none.
- Task 12's maximum claim is `store_ready`, and only after a valid Store bundle
  plus a valid authorization receipt are ingested. Local Task 12 output alone
  normally stops at `package_validated`. `canary`, `production`, and
  `rolled_back` remain external gates and are not claimed by this task.
- The current candidate version is `0.2.2`, read from committed source rather
  than embedded in the reducer. Every candidate has one canonical SemVer and
  one derived immutable release namespace. After an artifact is published, a
  later candidate requires a strictly greater committed version, a new clean
  build, the complete packaged MV3 gate, a new seal, and a new namespace;
  published bytes are never reused or overwritten.
- Actor construction is itself a controller-global compare-and-swap admission:
  it reserves the release ID and namespace against the durable release catalog,
  derives the version and packaged-MV3 inventory from the named clean commit,
  and publishes neither an actor nor a reservation on conflict.

If a fact cannot be represented by these values and guards, it cannot advance
release readiness.

## Exact states

```ts
type ReleaseReadinessState =
  | 'audited'
  | 'blocked'
  | 'rc_built'
  | 'package_validated'
  | 'store_ready'
  | 'canary'
  | 'production'
  | 'rolled_back';
```

`canary` means the submitted candidate has a valid metrics-and-pass receipt,
not merely that an upload started. `production` requires a promotion receipt.
`rolled_back` requires a rollback receipt with healthy restoration and is
reachable only from `canary` or `production`.

There is no public uninitialized context. The factory validates and atomically
persists `CandidateIdentityV1 + AuditReceiptV1 + candidate_reserved` under the
expected global catalog revision, then publishes the actor directly in
`audited`. Constructor failure publishes neither actor nor catalog record and
introduces no ninth state.

## Canonical primitives and bounds

```ts
type Sha256 = string; // exactly 64 lowercase hexadecimal ASCII characters
type CanonicalUtcTimestamp = string;
type CanonicalSemVer = string;

const RELEASE_LIMITS = {
  maxIdAsciiBytes: 128,
  maxImmutableUriBytes: 2048,
  maxFiles: 20_000,
  maxDirectories: 20_000,
  maxFileBytes: 536_870_912,
  maxZipBytes: 2_147_483_648,
  maxPathUtf8Bytes: 65_535,
  maxTotalPathUtf8Bytes: 16_777_216,
  maxScenarioIds: 512,
  maxSemVerAsciiBytes: 64,
  maxPermissionEntries: 128,
  maxPermissionAsciiBytes: 512,
  maxJournalEntries: 16,
  maxAuthorizationReceipts: 8,
  maxSigningKeysPerPolicy: 16,
  maxGlobalReplayTuples: 16,
  maxGlobalReplayRecordsPerTuple: 64,
  maxReleaseCatalogEntries: 256,
  maxPackageObservationEntries: 40_032,
} as const;

const CANONICAL_UTC =
  /^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const MIN_RELEASE_INSTANT_MS = 946_684_800_000;
const MAX_RELEASE_INSTANT_MS = 253_402_300_799_999;
const CANONICAL_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
```

IDs are 1..128 bytes of canonical ASCII
`[A-Za-z0-9][A-Za-z0-9._:-]*`. Nonces are exactly 32 bytes encoded as 43
unpadded base64url characters. Ed25519 signatures are exactly 64 bytes encoded
as canonical padded base64; Ed25519 public keys are exactly 32 bytes encoded as
canonical padded base64. Counts, byte sizes, and issuer sequences are
non-negative safe integers within the bounds above. Validators reject before
allocation; they never truncate.

A `CanonicalSemVer` is 1..64 ASCII bytes, matches `CANONICAL_SEMVER`, parses as
SemVer 2.0.0, and round-trips byte-for-byte through the committed SemVer
serializer. Numeric identifiers have no leading zero, and every numeric
component fits a safe integer. The release namespace is exactly
`"v" + committedVersion`; the grammar makes it one safe path segment. Version
precedence uses SemVer precedence, so a build-metadata-only change is not a
version bump.

Permission names and Chrome match patterns are canonical ASCII within their
declared bound; patterns must parse and reserialize byte-for-byte through the
committed manifest validator. Arrays are bounded, duplicate-free, and sorted by
unsigned bytes.

Every canonical tree or ZIP path is 1..65,535 UTF-8 bytes, contains no NUL,
backslash, empty segment, `.` segment, `..` segment, absolute prefix, or trailing
slash, and round-trips byte-for-byte through the committed UTF-8/POSIX path
validator. This is the exact unsigned 16-bit ZIP filename bound; a longer path
is rejected before ZIP construction, so the non-ZIP64 contract is executable.
The derived set of unique parent directories is bounded by `maxDirectories` and
is validated before snapshot allocation. The sum of UTF-8 bytes across file,
derived-directory, ZIP-receipt and observation paths is at most
`maxTotalPathUtf8Bytes` per value.

Git commit/tree IDs are exactly 40 lowercase hex characters for `sha1` and 64
for `sha256`; both values are read from the clean checked-out candidate, never
relabeled as content SHA-256.

A timestamp is valid only when it is exactly 24 ASCII bytes, matches
`CANONICAL_UTC`, parses to a safe integer inside the inclusive bounds, and
round-trips through `new Date(ms).toISOString()`. Temporal comparisons use
parsed epoch milliseconds only, never lexical comparison. Every field ending
in `At` uses this contract.

Canonical serialization means RFC 8785 JCS UTF-8 bytes. For both
`AuthorizationReceiptV1` and `ExternalReceiptEnvelopeV1`:

```text
canonicalPayloadSha256 = SHA256(JCS(receipt with exactly
  canonicalPayloadSha256 and detachedSignatureBase64 omitted))

authorizationSignedBytes =
  ASCII("missionpulse.release-authorization.v1") || 0x00 ||
  hexDecode(canonicalPayloadSha256)

externalSignedBytes =
  ASCII("missionpulse.external-release-receipt.v1") || 0x00 ||
  hexDecode(canonicalPayloadSha256)
```

`hexDecode` yields exactly 32 bytes. Ed25519 signs the applicable byte string
directly; there is no extra hash, newline, length prefix, BOM, or stringified
hex. The canonical envelope digest used for duplicate/replay checks is
SHA-256 over JCS of the complete descriptor-snapshotted receipt, including
`canonicalPayloadSha256`, the signature, and every nested reference.

## Candidate, manifest, permissions, and local evidence

```ts
interface ImmutableBlobRefV1 {
  schema: 'missionpulse.immutable-blob';
  version: 1;
  kind: string;
  immutableUri: string;
  sha256: Sha256;
  bytes: number;
}

interface SignaturePolicyV1 {
  schema: 'missionpulse.signature-policy';
  version: 1;
  purpose: 'authorization' | 'external_receipt';
  policySha256: Sha256;
  allowedProvider: 'missionpulse_release_authority' | 'chrome_web_store_api';
  keys: readonly {
    issuerId: string;
    issuerKeyId: string;
    signatureAlgorithm: 'ed25519';
    publicKeyBase64: string;
  }[];
}

interface ManifestAuthorityV1 {
  schema: 'missionpulse.manifest-authority';
  version: 1;
  manifestVersion: 3;
  extensionVersion: CanonicalSemVer;
  minimumChromeVersion: string;
  manifestSha256: Sha256;
  permissions: readonly string[];
  hostPermissions: readonly string[];
  optionalHostPermissions: readonly string[];
  permissionSetSha256: Sha256;
}

interface CommittedMv3ScenarioInventoryV1 {
  schema: 'missionpulse.packaged-mv3-scenario-inventory';
  version: 1;
  scenarioIds: readonly string[];
}

interface CandidateIdentityV1 {
  schema: 'missionpulse.candidate-identity';
  version: 1;
  releaseId: string;
  sourceCommit: string;
  gitObjectFormat: 'sha1' | 'sha256';
  gitTreeObjectId: string;
  committedVersion: CanonicalSemVer;
  releaseNamespace: string;
  lockfileSha256: Sha256;
  connectorConfigSha256: Sha256;
  includedConnectorIds: readonly string[];
  manifest: ManifestAuthorityV1;
  mv3ScenarioInventoryPath: 'apps/extension/tests/mv3/scenarios.v1.json';
  mv3ScenarioInventoryBlobSha256: Sha256;
  expectedMv3ScenarioIds: readonly string[];
  expectedMv3ScenarioInventorySha256: Sha256;
  authorizationPolicy: SignaturePolicyV1 & { purpose: 'authorization' };
  externalReceiptPolicy: SignaturePolicyV1 & { purpose: 'external_receipt' };
}

type ReleaseCatalogRecordKind = 'candidate_reserved' | 'candidate_abandoned' | 'artifact_published';

interface GlobalReleaseCatalogRecordV1 {
  catalogSequence: number;
  kind: ReleaseCatalogRecordKind;
  actorId: string;
  releaseId: string;
  sourceCommit: string;
  committedVersion: CanonicalSemVer;
  releaseNamespace: string;
  artifactId: string | null;
  artifactSha256: Sha256 | null;
  recordedAt: CanonicalUtcTimestamp;
}

interface GlobalReleaseCatalogV1 {
  schema: 'missionpulse.global-release-catalog';
  version: 1;
  revision: number;
  catalogSha256: Sha256;
  records: readonly GlobalReleaseCatalogRecordV1[];
}

interface AuditReceiptV1 {
  schema: 'missionpulse.release-audit';
  version: 1;
  receiptId: string;
  releaseId: string;
  sourceCommit: string;
  committedVersion: CanonicalSemVer;
  releaseNamespace: string;
  mv3ScenarioInventoryBlobSha256: Sha256;
  expectedMv3ScenarioInventorySha256: Sha256;
  coveredDomains: readonly (
    | 'workflows'
    | 'security'
    | 'permissions'
    | 'metadata'
    | 'ci'
    | 'runtime'
    | 'artifact'
    | 'store'
    | 'canary'
    | 'rollback'
  )[];
  openP0Count: 0;
  openP1Count: 0;
  recordedAt: CanonicalUtcTimestamp;
  report: ImmutableBlobRefV1;
}

interface LocalGateReceiptV1 {
  schema: 'missionpulse.local-gate';
  version: 1;
  receiptId: string;
  releaseId: string;
  sourceCommit: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
  format: 'passed';
  lint: 'passed';
  typecheck: 'passed';
  unit: 'passed';
  sourceManifest: 'passed';
  report: ImmutableBlobRefV1;
}

interface CanonicalFileEntryV2 {
  path: string;
  bytes: number;
  sha256: Sha256;
  mode: '0644';
}

interface CanonicalTreeReceiptV2 {
  algorithm: 'missionpulse-tree-sha256-v2';
  fileCount: number;
  treeSha256: Sha256;
  manifestSha256: Sha256;
  entries: readonly CanonicalFileEntryV2[];
}

interface BuildReceiptV1 {
  schema: 'missionpulse.candidate-build';
  version: 1;
  receiptId: string;
  buildId: string;
  releaseId: string;
  sourceCommit: string;
  nodeVersion: string;
  pnpmVersion: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
  distTree: CanonicalTreeReceiptV2;
  manifest: ManifestAuthorityV1;
  report: ImmutableBlobRefV1;
}

interface PackagedMv3GateReceiptV1 {
  schema: 'missionpulse.packaged-mv3-gate';
  version: 1;
  receiptId: string;
  releaseId: string;
  sourceCommit: string;
  buildId: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
  expectedScenarioInventorySha256: Sha256;
  executedScenarioIds: readonly string[];
  passedScenarioCount: number;
  skippedScenarioCount: 0;
  failedScenarioCount: 0;
  runtimeDiagnosticFindingCount: 0;
  treeBeforeSuite: CanonicalTreeReceiptV2;
  treeAfterSuite: CanonicalTreeReceiptV2;
  report: ImmutableBlobRefV1;
}

interface TestedDistSealV1 {
  schema: 'missionpulse.tested-dist-seal';
  version: 1;
  sealId: string;
  sealSha256: Sha256;
  releaseId: string;
  sourceCommit: string;
  committedVersion: CanonicalSemVer;
  buildId: string;
  localGate: LocalGateReceiptV1;
  build: BuildReceiptV1;
  mv3Gate: PackagedMv3GateReceiptV1;
  testedTree: CanonicalTreeReceiptV2;
  manifest: ManifestAuthorityV1;
  worktreeCleanBeforeGate: true;
  worktreeCleanAfterGate: true;
  sealedAt: CanonicalUtcTimestamp;
}
```

`ManifestAuthorityV1` contains the exact effective built-manifest permission
arrays after connector build filtering. Arrays are duplicate-free and sorted by
unsigned UTF-8 bytes. `permissionSetSha256` is the SHA-256 of JCS serialization
of the three arrays. Source manifest, built manifest, tree manifest, seal,
package, and every external receipt must agree on version, manifest digest, and
permission-set digest.

`candidate.committedVersion` is read from the exact clean committed extension
package source, byte-equals `candidate.manifest.extensionVersion`, passes the
canonical SemVer round-trip, and derives
`candidate.releaseNamespace = "v" + candidate.committedVersion`. Audit, seal,
artifact, Store receipt and every external envelope must carry that same value;
no runtime input or environment override can choose it.

`GlobalReleaseCatalogV1` is controller-global durable state, separate from
release actors. Its digest is SHA-256 of JCS with only `catalogSha256` omitted.
Records are append-only in exact `catalogSequence` order, start at one, never
fork, truncate, rewrite, evict, or reuse a `releaseId`, and are bounded by
`maxReleaseCatalogEntries`. A reservation is active after
`candidate_reserved` until the same actor/release has exactly one subsequent
`candidate_abandoned` or `artifact_published` record. Published namespaces are
permanently occupied. An abandoned namespace may be reserved again only because
the abandonment guard already proved that no accepted final path or live
package journal remains.

Actor construction receives `actorId`, `expectedCatalogRevision`, a candidate,
its audit, and canonical `admittedAt`. In one durable CAS it validates the exact
clean Git commit/tree,
derives committed version, manifest and scenario inventory, checks the catalog
revision/capacity, rejects a reused release ID or an active/published namespace,
and appends `candidate_reserved`. If any artifact has previously been published,
the candidate SemVer precedence must be strictly greater than the greatest
published SemVer; equality through build metadata is insufficient. It then
persists actor context and audit in the same transaction. A conflict or any
validation failure publishes neither actor nor reservation;
`audit.recordedAt <= admittedAt`. Artifact
publication repeats the version/namespace check against the current catalog and
atomically appends `artifact_published`; a lower candidate that lost a race to a
higher published version fails closed and cannot publish.

Every successful catalog CAS compares one expected revision, appends one or
more consecutive records, increments the catalog revision exactly once, and
recomputes its digest. Factory reservation uses `recordedAt=admittedAt`;
publication uses `recordedAt=artifact.validatedAt`; candidate replacement uses
its single `catalogedAt` for any required abandonment and the new reservation,
after `audit.recordedAt <= catalogedAt`. A conflict/capacity error mutates neither
actor nor catalog. An already accepted exact local duplicate is detected before
CAS and does not consume another revision.

`candidate_reserved` and `candidate_abandoned` have null artifact fields;
`artifact_published` has the exact validated `artifactId` and ZIP SHA-256. Only
an active reservation can be abandoned or published, and those two terminal
record kinds are mutually exclusive for one release.

Each signature policy is frozen in the candidate, has at most 16 unique
issuer/key pairs, and hashes the JCS policy with only `policySha256` omitted.
The reducer therefore has the exact allowlisted public keys needed for pure
signature verification; it never fetches key material.

The only authority for `candidate.expectedMv3ScenarioIds` is the Git blob at
`candidate.mv3ScenarioInventoryPath` in `candidate.sourceCommit` and
`candidate.gitTreeObjectId`. Its bytes are exactly JCS of
`CommittedMv3ScenarioInventoryV1`, with no BOM or trailing newline, and their
SHA-256 equals `candidate.mv3ScenarioInventoryBlobSha256`. The factory parses
that blob, rejects any worktree/environment/runtime override, and copies its
`scenarioIds` byte-for-byte into the candidate. The array is nonempty, contains
at most 512 unique canonical ASCII IDs, and is sorted by unsigned ASCII bytes.
Its binding is exactly:

```text
candidate.expectedMv3ScenarioInventorySha256 =
  SHA256(JCS(candidate.expectedMv3ScenarioIds))
```

The packaged gate is complete only when its expected inventory digest equals
the candidate digest, `executedScenarioIds` is byte-for-byte equal to the
candidate array (same values and order), `passedScenarioCount` equals that
array's length, and skipped, failed, and runtime-diagnostic counts are all zero.
Missing, extra, duplicate, reordered, or silently skipped scenarios fail
closed.

`sealSha256` hashes the JCS serialization of the complete seal with only the
`sealSha256` property omitted. It is not an exit-code claim. The local report,
build report, complete aggregated MV3 report, expected scenario inventory, and
pre/post suite trees are mandatory. Per-test output cannot substitute for the
aggregated gate.

The exact local chronology is:

```text
audit.recordedAt
<= localGate.startedAt <= localGate.completedAt
<= build.startedAt <= build.completedAt
<= mv3Gate.startedAt <= mv3Gate.completedAt
<= seal.sealedAt
```

All receipts name the same release, source commit, build where applicable,
canonical version and namespace, manifest, permission set, configuration, and
scenario inventory.
`build.distTree == mv3.treeBeforeSuite == mv3.treeAfterSuite == seal.testedTree`.

## Package-only artifact and journal

After `sealedAt`, the runner is package-only. Install, build, version bump,
manifest edit, connector resolution, `dist` deletion, and any command capable
of rewriting tested bytes are forbidden.

```ts
type PackagePhase =
  | 'reserved'
  | 'staging_created'
  | 'snapshot_verified'
  | 'archive_built'
  | 'archive_verified'
  | 'bundle_renamed'
  | 'published'
  | 'cleaned';

interface PackageJournalEntryV1 {
  phase: PackagePhase;
  at: CanonicalUtcTimestamp;
  renameIntentAt: CanonicalUtcTimestamp | null;
  ownedDirectoryIdentitySha256: Sha256 | null;
  ownershipMarkerSha256: Sha256 | null;
  treeSha256: Sha256 | null;
  archiveSha256: Sha256 | null;
  bundleInventorySha256: Sha256 | null;
}

interface PackageJournalV1 {
  schema: 'missionpulse.package-journal';
  version: 1;
  journalId: string;
  releaseId: string;
  sealId: string;
  artifactId: string;
  releaseNamespace: string;
  ownershipTokenSha256: Sha256;
  stagingBundlePath: string;
  finalBundlePath: string;
  ownershipMarkerRelativePath: '.missionpulse-owner.json';
  workRelativePath: '.missionpulse-work';
  zipRelativePath: 'missionpulse.zip';
  sidecarRelativePath: 'missionpulse.zip.sha256';
  validationRelativePath: 'validation.json';
  verifiedZipReceipt: CanonicalZipReceiptV1 | null;
  history: readonly PackageJournalEntryV1[];
}

interface CanonicalZipEntryReceiptV1 {
  path: string;
  utf8NameSha256: Sha256;
  crc32Hex: string;
  uncompressedBytes: number;
  compressedBytes: number;
  compressionMethod: 0;
  generalPurposeBitFlag: 0x0800;
  versionNeeded: 20;
  versionMadeBy: 0x031e;
  dosTime: 0x0000;
  dosDate: 0x0021;
  internalFileAttributes: 0;
  externalFileAttributes: 0x81a40000;
  localExtraFieldBytes: 0;
  centralExtraFieldBytes: 0;
  entryCommentBytes: 0;
  localHeaderOffset: number;
}

interface CanonicalZipReceiptV1 {
  schema: 'missionpulse.canonical-zip';
  version: 1;
  zipSha256: Sha256;
  zipBytes: number;
  entryCount: number;
  compression: 'store';
  normalizedTimestamp: '1980-01-01T00:00:00.000Z';
  zip64: false;
  dataDescriptor: false;
  archiveCommentBytes: 0;
  diskNumber: 0;
  centralDirectoryStartDisk: 0;
  entriesOnDisk: number;
  entries: readonly CanonicalZipEntryReceiptV1[];
  entryInventorySha256: Sha256;
  localHeaderOrderSha256: Sha256;
  centralDirectoryOrderSha256: Sha256;
  twinBuildSha256: Sha256;
  twinReceiptSha256: Sha256;
}

interface ChecksumSidecarReceiptV1 {
  filename: 'missionpulse.zip.sha256';
  bytes: 83;
  sha256: Sha256;
}

interface PackageValidationRecordV1 {
  schema: 'missionpulse.package-validation';
  version: 1;
  artifactId: string;
  releaseId: string;
  sealId: string;
  sealSha256: Sha256;
  committedVersion: CanonicalSemVer;
  releaseNamespace: string;
  sourceTreeSha256: Sha256;
  extractedTreeSha256: Sha256;
  ownershipMarkerSha256: Sha256;
  zipSha256: Sha256;
  sidecarSha256: Sha256;
  entryInventorySha256: Sha256;
  canonicalZipReceiptSha256: Sha256;
  validatedAt: CanonicalUtcTimestamp;
}

interface ValidatedZipArtifactV1 {
  schema: 'missionpulse.validated-zip-artifact';
  version: 1;
  artifactId: string;
  releaseId: string;
  sealId: string;
  sealSha256: Sha256;
  sourceCommit: string;
  committedVersion: CanonicalSemVer;
  releaseNamespace: string;
  manifest: ManifestAuthorityV1;
  sourceTree: CanonicalTreeReceiptV2;
  snapshotTree: CanonicalTreeReceiptV2;
  extractedTree: CanonicalTreeReceiptV2;
  zip: CanonicalZipReceiptV1;
  checksumSidecar: ChecksumSidecarReceiptV1;
  bundleDirectoryPath: string;
  zipPath: string;
  sidecarPath: string;
  validationPath: string;
  validationRecord: PackageValidationRecordV1;
  validationJsonSha256: Sha256;
  bundleInventorySha256: Sha256;
  journalId: string;
  publishedAt: CanonicalUtcTimestamp;
  validatedAt: CanonicalUtcTimestamp;
}

interface ObservedPackageEntryV1 {
  path: string;
  kind: 'regular' | 'directory' | 'symlink' | 'other';
  bytes: number | null;
  sha256: Sha256 | null;
}

interface ObservedPackagePathV1 {
  kind: 'absent' | 'directory' | 'non_directory';
  directoryIdentitySha256: Sha256 | null;
  ownershipMarkerSha256: Sha256 | null;
  entries: readonly ObservedPackageEntryV1[];
  completeInventorySha256: Sha256 | null;
}

interface LocalReleaseObservationV1 {
  schema: 'missionpulse.local-release-observation';
  version: 1;
  observationId: string;
  restartId: string;
  releaseId: string;
  journalId: string | null;
  observedAt: CanonicalUtcTimestamp;
  sourceTree: CanonicalTreeReceiptV2 | null;
  staging: ObservedPackagePathV1;
  final: ObservedPackagePathV1;
  observationSha256: Sha256;
}
```

The canonical tree accepts regular files only, with no-follow reads. Paths are
relative POSIX UTF-8, unique under byte/case/Unicode comparison, and sorted by
unsigned UTF-8 bytes (`LC_ALL=C`). Symlinks, hard-link aliases, traversal,
backslashes, special files, sparse surprises, and changing file identities are
rejected.

For each sorted entry, tree v2 hashes the exact ASCII/UTF-8 bytes
`path + NUL + decimalByteLength + NUL + lowercaseFileSha256 + LF`; `treeSha256`
is SHA-256 of the concatenation. Decimal length has no sign or leading zero
except the value zero. The complete entry list is always retained.

Package observations are produced only by the no-follow local scanner in
response to a correlated restart request. For a directory, entries are a
complete recursive inventory sorted by unsigned UTF-8 path bytes and bounded by
`maxPackageObservationEntries`; regular files carry exact bytes/SHA-256,
directories carry both nulls, and any symlink or other object makes the
observation non-adoptable. Repeated device/inode pairs or link counts above one
are classified non-adoptable rather than ordinary regular files.
`completeInventorySha256` is SHA-256 of JCS of the
entries. For `absent`, both identity/digests are null and entries are empty; for
`non_directory`, directory identity is null and the observation always fails
closed. The marker digest is null unless the exact marker is one regular entry.
`observationSha256` is SHA-256 of JCS of the complete observation with only that
field omitted; the complete descriptor-snapshotted entries are therefore
directly available to the pure reducer without dereferencing a report.

`completeInventorySha256` is the observation digest and is not confused with
the four-consumer `bundleInventorySha256`. When an exact bundle is expected, the
reducer additionally projects the four observed regular-file entries to the
ordered `{path,bytes,sha256}` array declared below, recomputes
`bundleInventorySha256`, and requires both complete-inventory equality (no extra
object) and bundle-inventory equality.

The path-independent top-directory identity is exactly SHA-256 of JCS of
`{deviceDecimal,inodeDecimal,kind:"directory"}` obtained from `fstat` on an open
directory descriptor acquired with no-follow semantics. Decimal device/inode
strings are canonical non-negative base-10 integers with no leading zero except
zero and at most 32 ASCII bytes. The descriptor stays open across every live
verification/mutation; after restart, the stored digest, exact marker digest and
complete inventory must all match before any owned path can be resumed or
cleaned.

One exclusive lock covers source verification, no-follow copy into a private
snapshot, normalization, twin archive construction, safe extraction, final
verification, and publication. Snapshot files are `0644`, directories `0755`,
and timestamps fixed as above. The snapshot path is exactly the owned
`.missionpulse-work/snapshot`; there are no package temporary paths outside the
identity-bound staging directory.

The ZIP contract is byte-for-byte, not merely extraction-equivalent. There is
exactly one ZIP entry for every canonical tree file and no directory entry.
Local headers and central-directory records have the same order as
`sourceTree.entries`. For every entry, filename bytes are exactly the canonical
path's 1..65,535 UTF-8 bytes, both unsigned 16-bit filename-length fields equal
that byte length, the name digest and CRC-32 are recomputed, compressed size
equals uncompressed size, the local offset is exact, and the following values
are literal: STORE method `0`, UTF-8 flag `0x0800` with no other flag,
version-needed `20`, version-made-by `0x031e`, DOS time/date `0x0000/0x0021`,
internal attributes `0`, Unix regular-file `0644` external attributes
`0x81a40000`, and zero local extra, central extra, and entry comment bytes.
The archive has zero comment bytes, disk numbers zero, one-disk entry counts,
canonical central-directory offsets/sizes, no ZIP64 structures, no data
descriptor, no prepended/trailing bytes, and no ambient UID/GID. Backslashes,
NUL, invalid UTF-8, traversal and names not byte-equal to the tree are rejected.
`crc32Hex` is exactly eight lowercase hexadecimal ASCII characters;
`localHeaderOffset` is a non-negative safe integer. `entryCount`,
`entriesOnDisk`, the entries array length, and the canonical tree file count are
exactly equal and nonzero.

The inventory and order bindings are exact:

```text
entryInventorySha256 = SHA256(JCS(zip.entries))
framedNames = concat(for each canonical path:
  uint32be(utf8(path).byteLength) || utf8(path))
localHeaderOrderSha256 = SHA256(framedNames)
centralDirectoryOrderSha256 = SHA256(framedNames)
```

Both archives are constructed independently from the sealed snapshot in the
fresh, previously absent owned directories
`.missionpulse-work/zip-a` and `.missionpulse-work/zip-b`; safe extraction uses
`.missionpulse-work/extracted`. No package work path exists outside the
identity-bound staging directory. The complete observation therefore covers
every crash residue. The work root is removed before `archive_verified`, whose
staging inventory contains exactly the marker and three consumer files. Let
`firstZipSha256` be `zip.zipSha256` and `secondZipSha256` be the second build:

```text
zip.twinBuildSha256 = secondZipSha256 = firstZipSha256
zip.twinReceiptSha256 = SHA256(JCS({
  firstZipSha256,
  secondZipSha256,
  entryInventorySha256: zip.entryInventorySha256
}))
validationRecord.canonicalZipReceiptSha256 = SHA256(JCS(zip))
```

Any header, order, offset, CRC, size, inventory, or twin mismatch is
`ZIP_NON_CANONICAL`.

Safe extraction uses the newly created empty owned
`.missionpulse-work/extracted` directory and the same canonical inspector.
Advancement requires:

```text
seal.testedTree == source-before-copy == snapshotTree
== extractedTree == source-after-archive
```

File counts, entry lists, manifest bytes, version, permissions, and SHA-256
must all match. The sidecar bytes are exactly lowercase
`<zipSha256>  missionpulse.zip\n`: two ASCII spaces, one LF, no CR, BOM, or
extra byte; their length is exactly 83 and their SHA-256 is recomputed. The
validation bytes are exactly `JCS(artifact.validationRecord)`, with no BOM or
trailing newline, and `validationJsonSha256` is their SHA-256. The validation
record does not contain its own digest or the bundle inventory digest.

The final bundle contains exactly the immutable ownership marker plus the three
consumer files. Its complete inventory is bound in this order:

```text
bundleInventorySha256 = SHA256(JCS([
  { path: ".missionpulse-owner.json", bytes: byteLength(markerBytes),
    sha256: ownershipMarkerSha256 },
  { path: "missionpulse.zip", bytes: zip.zipBytes, sha256: zip.zipSha256 },
  { path: "missionpulse.zip.sha256", bytes: 83, sha256: checksumSidecar.sha256 },
  { path: "validation.json", bytes: byteLength(JCS(validationRecord)),
    sha256: validationJsonSha256 }
]))
```

`finalBundlePath` is exactly
`apps/extension/releases/${candidate.releaseNamespace}` and must be absent.
`stagingBundlePath` is exactly
`apps/extension/releases/.${candidate.releaseNamespace}.${artifactId}.staging`.
The artifact's bundle path equals the journal final path, and its three consumer
paths are exactly that path joined with the three declared relative filenames.
Publication fsyncs all four files and the staging directory, then performs one
same-filesystem atomic **no-replace** directory rename from the staging bundle
to the final bundle and fsyncs the parent. The syscall must atomically fail when
the destination exists at commit time (`RENAME_EXCL`/`RENAME_NOREPLACE`
semantics); a preceding existence check plus ordinary replacing rename is
forbidden, and lack of this capability fails closed before packaging. It never
installs three independent files.
Accepted namespace directories and their contents are immutable and never
cleanup targets.

Package journal entries are append-only, consecutive, identity-bound, and
strictly ordered:

```text
seal.sealedAt
<= reserved.at <= staging_created.at <= snapshot_verified.at <= archive_built.at
<= validationRecord.validatedAt <= archive_verified.at
= archive_verified.renameIntentAt = bundle_renamed.at = artifact.publishedAt
<= artifact.validatedAt = published.at
```

`renameIntentAt` is null through `archive_built`. The `archive_verified` append
durably chooses it as exactly that entry's `at`; every later non-cleaned entry
carries the same value. Therefore crash adoption after the rename reuses the
already durable intent timestamp and never samples or invents a wall-clock
value. `artifact.publishedAt` is this durable protocol instant, not an inferred
filesystem timestamp.

The `reserved` entry has null directory identity and marker digest. It durably
reserves the exact paths and ownership token before an exclusive, no-follow
staging-directory creation. The runner then writes and fsyncs an ownership
marker whose bytes are exactly JCS of
`{schema:"missionpulse.package-owner",version:1,journalId,releaseId,sealId,artifactId,releaseNamespace,ownershipTokenSha256}`.
It computes the marker digest and the path-independent no-follow directory
object identity, and durably appends `staging_created` with both values **before
the first source-byte copy or any other bundle content mutation**. Every later
non-cleaned entry has those exact values. Cleanup requires them.
If the process dies after mkdir/marker but before that append, `reserved` still
contains null identity/marker fields; restart must treat every present staging
path as ambiguous and cannot adopt or delete it.

The `archive_verified` entry also durably binds the exact four-file
`bundleInventorySha256`, archive digest and non-null `renameIntentAt` before it
authorizes publication. At that same append, `journal.verifiedZipReceipt`
changes exactly once from null to the complete validated receipt, whose JCS
digest equals `validationRecord.canonicalZipReceiptSha256`; every later journal
value preserves it byte-for-byte. Earlier phases have a null receipt and bundle
inventory. A
`bundle_renamed` recovery append is valid only with the identical intent and
inventory.

Allowed progression is `reserved -> staging_created -> snapshot_verified ->
archive_built -> archive_verified -> bundle_renamed -> published`; any phase
from `staging_created` through `archive_verified` may instead terminate at
`cleaned`. `reserved` can become `cleaned` only when the staging path is absent.
No other branch, repetition, or phase skip is valid. `archive_verified`
authorizes only the one directory rename; `bundle_renamed` records that rename;
`published` records post-rename identity and bundle verification.

`cleaned` is allowed only before a rename and accepted artifact. From
`reserved`, a correlated observation must prove both paths absent and all
identity/digest fields remain null. From every later eligible phase, the
journal, marker, ownership token, and no-follow object identity must prove that
the runner owns the temporary output, followed by a second observation proving
both paths absent. Foreign or ambiguous paths are never adopted, mutated, or
deleted.
Its entry preserves every non-null identity/tree/archive/inventory/intent value
from the preceding phase; cleanup never rewrites historical evidence.

## Store and authorization receipts

```ts
type AuthorizedAction =
  | 'mark_store_ready'
  | 'ingest_submission'
  | 'ingest_canary_pass'
  | 'ingest_production_promotion'
  | 'ingest_rollback';

interface AuthorizationReceiptV1 {
  schema: 'missionpulse.release-authorization';
  version: 1;
  receiptId: string;
  provider: 'missionpulse_release_authority';
  releaseId: string;
  artifactId: string;
  actorId: string;
  scope: 'release_readiness';
  action: AuthorizedAction;
  nonce: string;
  issuerId: string;
  issuerKeyId: string;
  issuerSequence: number;
  signatureAlgorithm: 'ed25519';
  policySha256: Sha256;
  authorizedPayloadSha256: Sha256;
  issuedAt: CanonicalUtcTimestamp;
  expiresAt: CanonicalUtcTimestamp;
  canonicalPayloadSha256: Sha256;
  detachedSignatureBase64: string;
}

interface KnownGoodRollbackTargetV1 {
  targetId: string;
  extensionVersion: CanonicalSemVer;
  artifactSha256: Sha256;
  manifestSha256: Sha256;
  permissionSetSha256: Sha256;
  validationReceipt: ImmutableBlobRefV1;
  lastKnownHealthyAt: CanonicalUtcTimestamp;
}

interface StoreReadinessReceiptV1 {
  schema: 'missionpulse.store-readiness';
  version: 1;
  receiptId: string;
  releaseId: string;
  artifactId: string;
  artifactSha256: Sha256;
  sourceCommit: string;
  committedVersion: CanonicalSemVer;
  manifestSha256: Sha256;
  permissionSetSha256: Sha256;
  listingComplete: true;
  privacyDisclosureComplete: true;
  permissionJustificationComplete: true;
  credentialPresence: {
    chromeExtensionId: true;
    chromeClientId: true;
    chromeClientSecret: true;
    chromeRefreshToken: true;
  };
  rollbackTarget: KnownGoodRollbackTargetV1;
  completedAt: CanonicalUtcTimestamp;
  record: ImmutableBlobRefV1;
}
```

An authorization is accepted only when its signature and committed policy
verify, identities match the candidate/artifact, actor and action are allowed,
its exact target digest matches, its global nonce/receipt identity is fresh,
its issuer/key sequence strictly exceeds the controller-global high-water, the
global registry has capacity, and `issuedAt <= ingestedAt < expiresAt`. It and
its replay record are appended atomically with the event it authorizes. It is
required before marking `store_ready` and before accepting each external
receipt. Presence booleans never expose credential values.

`STORE_READINESS_INGESTED` additionally requires
`artifact.validatedAt <= store.completedAt <= event.ingestedAt`. The structured
Store receipt, rollback target, and `mark_store_ready` authorization are all
persisted atomically.

## Structured external receipts

```ts
type ExternalReceiptAction = 'submission' | 'canary_pass' | 'production_promotion' | 'rollback';

interface ExternalReceiptEnvelopeV1<Action extends ExternalReceiptAction, Payload> {
  schema: 'missionpulse.external-release-receipt';
  version: 1;
  receiptId: string;
  provider: 'chrome_web_store_api';
  providerOperationId: string;
  action: Action;
  releaseId: string;
  artifactId: string;
  artifactSha256: Sha256;
  sourceCommit: string;
  extensionVersion: CanonicalSemVer;
  manifestSha256: Sha256;
  permissionSetSha256: Sha256;
  requestNonce: string;
  issuerId: string;
  issuerKeyId: string;
  issuerSequence: number;
  signatureAlgorithm: 'ed25519';
  policySha256: Sha256;
  occurredAt: CanonicalUtcTimestamp;
  issuedAt: CanonicalUtcTimestamp;
  verifiedAt: CanonicalUtcTimestamp;
  canonicalPayloadSha256: Sha256;
  detachedSignatureBase64: string;
  providerRecord: ImmutableBlobRefV1;
  payload: Payload;
}

interface SubmissionPayloadV1 {
  extensionId: string;
  channel: 'trusted_testers';
  uploadedZipSha256: Sha256;
  submittedAt: CanonicalUtcTimestamp;
  acceptedAt: CanonicalUtcTimestamp;
}

interface CanaryPassPayloadV1 {
  submissionReceiptId: string;
  windowStartedAt: CanonicalUtcTimestamp;
  windowEndedAt: CanonicalUtcTimestamp;
  sampleSize: number;
  crashRate: number;
  errorRate: number;
  criticalFindingCount: 0;
  thresholdPolicySha256: Sha256;
  metricsSha256: Sha256;
  passed: true;
  passedAt: CanonicalUtcTimestamp;
}

interface ProductionPromotionPayloadV1 {
  canaryReceiptId: string;
  extensionId: string;
  promotedArtifactSha256: Sha256;
  promotedAt: CanonicalUtcTimestamp;
}

interface RollbackPayloadV1 {
  deploymentReceiptId: string;
  rollbackTargetId: string;
  rollbackTargetArtifactSha256: Sha256;
  rolledBackAt: CanonicalUtcTimestamp;
  restorationHealth: {
    checkedAt: CanonicalUtcTimestamp;
    healthy: true;
    criticalFindingCount: 0;
    metricsSha256: Sha256;
  };
}

type SubmissionReceiptV1 = ExternalReceiptEnvelopeV1<'submission', SubmissionPayloadV1>;
type CanaryPassReceiptV1 = ExternalReceiptEnvelopeV1<'canary_pass', CanaryPassPayloadV1>;
type ProductionPromotionReceiptV1 = ExternalReceiptEnvelopeV1<
  'production_promotion',
  ProductionPromotionPayloadV1
>;
type RollbackReceiptV1 = ExternalReceiptEnvelopeV1<'rollback', RollbackPayloadV1>;

type ReplayProtectedProvider = 'missionpulse_release_authority' | 'chrome_web_store_api';

interface GlobalReplayRecordV1 {
  kind: 'authorization' | 'external_receipt';
  provider: ReplayProtectedProvider;
  issuerId: string;
  issuerKeyId: string;
  providerOperationId: string | null;
  nonceSha256: Sha256;
  receiptId: string;
  action: AuthorizedAction | ExternalReceiptAction;
  issuerSequence: number;
  canonicalEnvelopeSha256: Sha256;
  authorizedPayloadSha256: Sha256;
  releaseId: string;
  artifactId: string;
}

interface GlobalReplayHighWaterTupleV1 {
  provider: ReplayProtectedProvider;
  issuerId: string;
  issuerKeyId: string;
  highestConsumedSequence: number;
  consumed: readonly GlobalReplayRecordV1[];
}

interface GlobalReplayRegistryV1 {
  schema: 'missionpulse.global-replay-registry';
  version: 1;
  revision: number;
  registrySha256: Sha256;
  tuples: readonly GlobalReplayHighWaterTupleV1[];
}
```

The authorization target is exact. For the Store event, `target` is the
complete descriptor-snapshotted `StoreReadinessReceiptV1`; for an external
event, it is the complete descriptor-snapshotted signed external receipt. The
event type is the literal event discriminant shown below:

```text
authorization.authorizedPayloadSha256 = SHA256(JCS({
  eventType,
  releaseId: target.releaseId,
  artifactId: target.artifactId,
  payload: target
}))
```

`authorization`, `ingestedAt`, and `expectedRegistryRevision` are not part of
that target. `mark_store_ready` binds only `STORE_READINESS_INGESTED`; each
other authorization action binds only its correspondingly named external
event. A valid authorization for any other target digest or event type is
powerless.

External validation is pure: schema, bounds, JCS digest, Ed25519 signature,
allowlisted provider/issuer/key policy, exact candidate/artifact/manifest/
permissions identity, nonce, sequence, predecessor, and chronology are checked
without network I/O. A generic local reference cannot fill any external field.

All external receipts require:

```text
artifact.validatedAt <= receipt.occurredAt
receipt.occurredAt <= receipt.issuedAt <= receipt.verifiedAt <= event.ingestedAt
authorization.issuedAt <= event.ingestedAt < authorization.expiresAt
```

Action-specific chronology is:

```text
submission.submittedAt <= submission.acceptedAt
submission.acceptedAt <= canary.windowStartedAt <= canary.windowEndedAt <= canary.passedAt
canary.passedAt <= production.promotedAt
(state == canary ? stored canaryPass.occurredAt : stored productionPromotion.occurredAt)
<= rollback.rolledBackAt <= rollback.restorationHealth.checkedAt
```

The action timestamp is single-source: envelope `occurredAt` must equal
`submission.acceptedAt`, `canary.passedAt`, `production.promotedAt`, or
`rollback.rolledBackAt` respectively. A crossed timestamp is rejected.

The envelope artifact digest always remains the candidate ZIP digest. Rollback
target identity lives only in the rollback payload and must equal the stored
`KnownGoodRollbackTargetV1` exactly.

`GlobalReplayRegistryV1` is durable controller state, separate from every
release actor. Its digest is SHA-256 of JCS with only `registrySha256` omitted;
tuples are sorted by unsigned UTF-8 bytes of
`provider + NUL + issuerId + NUL + issuerKeyId`, and records within each tuple
are sorted by ascending `issuerSequence` (which is unique there). A fresh
authorization or external receipt requires a strictly increasing safe sequence
for its provider/issuer/key tuple. Except during exact-duplicate detection,
across the entire registry provider plus operation ID (when non-null), nonce
digest, receipt ID, canonical envelope digest, and authorization-target digest
must each be unused. An authorization record uses
`providerOperationId=null`, hashes `authorization.nonce`, and records the full
authorization envelope digest. An external record hashes `requestNonce` and
records its provider operation and full external envelope digest. Both record
the exact authorization target digest.

Every protected event carries `expectedRegistryRevision`. Acceptance is one
durable compare-and-swap transaction: compare that revision, append the
authorization record and, for external ingestion, the external record, update
the tuple high-water, mutate actor receipts/state, increment the registry
revision exactly once, and recompute its digest. A CAS conflict mutates nothing
and returns `GLOBAL_REPLAY_CAS_CONFLICT`; the caller may re-read and re-submit
the ingestion event, but the repository never retries a provider operation.
Tuple or record capacity exhaustion returns
`GLOBAL_REPLAY_CAPACITY_EXHAUSTED`. The registry never evicts, truncates,
recycles, or resets records, including across candidates and terminal actors.

An exact external duplicate has the same event type and byte-identical JCS
bytes for the complete external receipt and its complete authorization, and
both exact envelope digests already exist in the global registry and actor. An
exact Store duplicate applies the same rule to the complete Store receipt and
authorization, with its authorization replay record and actor Store value
already present. Only then is the protected event a no-op in every state,
independent of a stale expected revision. It never consumes replay state twice.
Reuse of nonce, sequence, provider operation, receipt ID, or authorization
target with different bytes is crossed/divergent and is rejected with no
advancement. A valid receipt for another candidate, artifact, manifest,
permission set, predecessor, or state is also rejected.

## Context and events

```ts
interface ReleaseReadinessContextV1 {
  state: ReleaseReadinessState;
  actorId: string;
  candidate: CandidateIdentityV1;
  audit: AuditReceiptV1;
  seal: TestedDistSealV1 | null;
  packageJournal: PackageJournalV1 | null;
  artifact: ValidatedZipArtifactV1 | null;
  store: StoreReadinessReceiptV1 | null;
  authorizations: readonly AuthorizationReceiptV1[];
  submission: SubmissionReceiptV1 | null;
  canaryPass: CanaryPassReceiptV1 | null;
  productionPromotion: ProductionPromotionReceiptV1 | null;
  rollback: RollbackReceiptV1 | null;
  pendingRestart: {
    restartId: string;
    restartedAt: CanonicalUtcTimestamp;
  } | null;
  lastLocalObservation: LocalReleaseObservationV1 | null;
  lastError: ReleaseReadinessError | null;
}

type ReleaseReadinessEvent =
  | { type: 'BLOCKERS_INGESTED'; releaseId: string; error: ReleaseReadinessError }
  | { type: 'RC_SEAL_INGESTED'; seal: TestedDistSealV1 }
  | {
      type: 'PACKAGE_JOURNAL_INGESTED';
      journal: PackageJournalV1;
      recoveryObservationId: string | null;
    }
  | {
      type: 'PACKAGE_VALIDATED_INGESTED';
      artifact: ValidatedZipArtifactV1;
      expectedCatalogRevision: number;
      recoveryObservationId: string | null;
    }
  | {
      type: 'STORE_READINESS_INGESTED';
      store: StoreReadinessReceiptV1;
      authorization: AuthorizationReceiptV1;
      ingestedAt: CanonicalUtcTimestamp;
      expectedRegistryRevision: number;
    }
  | {
      type: 'SUBMISSION_RECEIPT_INGESTED';
      receipt: SubmissionReceiptV1;
      authorization: AuthorizationReceiptV1;
      ingestedAt: CanonicalUtcTimestamp;
      expectedRegistryRevision: number;
    }
  | {
      type: 'CANARY_PASS_RECEIPT_INGESTED';
      receipt: CanaryPassReceiptV1;
      authorization: AuthorizationReceiptV1;
      ingestedAt: CanonicalUtcTimestamp;
      expectedRegistryRevision: number;
    }
  | {
      type: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED';
      receipt: ProductionPromotionReceiptV1;
      authorization: AuthorizationReceiptV1;
      ingestedAt: CanonicalUtcTimestamp;
      expectedRegistryRevision: number;
    }
  | {
      type: 'ROLLBACK_RECEIPT_INGESTED';
      receipt: RollbackReceiptV1;
      authorization: AuthorizationReceiptV1;
      ingestedAt: CanonicalUtcTimestamp;
      expectedRegistryRevision: number;
    }
  | { type: 'LOCAL_EVIDENCE_INVALIDATED'; error: ReleaseReadinessError }
  | {
      type: 'SERVICE_RESTARTED';
      releaseId: string;
      restartId: string;
      restartedAt: CanonicalUtcTimestamp;
    }
  | { type: 'LOCAL_RELEASE_OBSERVATION_INGESTED'; observation: LocalReleaseObservationV1 }
  | {
      type: 'NEW_CANDIDATE_INGESTED';
      candidate: CandidateIdentityV1;
      audit: AuditReceiptV1;
      catalogedAt: CanonicalUtcTimestamp;
      expectedCatalogRevision: number;
    };

type ReleaseReadinessErrorCode =
  | 'BLOCKERS_OPEN'
  | 'IDENTITY_MISMATCH'
  | 'TIMESTAMP_INVALID'
  | 'TIMESTAMP_ORDER_INVALID'
  | 'LOCAL_GATE_INVALID'
  | 'BUILD_RECEIPT_INVALID'
  | 'MV3_GATE_INVALID'
  | 'SEAL_INVALID'
  | 'PACKAGE_ONLY_VIOLATION'
  | 'ATOMIC_NO_REPLACE_UNAVAILABLE'
  | 'VERSION_NAMESPACE_REUSED'
  | 'RELEASE_CATALOG_CAS_CONFLICT'
  | 'RELEASE_CATALOG_CAPACITY_EXHAUSTED'
  | 'JOURNAL_INVALID'
  | 'JOURNAL_OWNERSHIP_AMBIGUOUS'
  | 'TREE_MISMATCH'
  | 'ZIP_NON_CANONICAL'
  | 'CHECKSUM_MISMATCH'
  | 'RESTART_OBSERVATION_INVALID'
  | 'STORE_RECEIPT_INVALID'
  | 'AUTHORIZATION_INVALID'
  | 'AUTHORIZATION_EXPIRED'
  | 'GLOBAL_REPLAY_CAS_CONFLICT'
  | 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED'
  | 'EXTERNAL_RECEIPT_INVALID'
  | 'EXTERNAL_RECEIPT_REPLAY'
  | 'EXTERNAL_RECEIPT_DIVERGENT'
  | 'LOCAL_RECEIPT_DIVERGENT'
  | 'SUBMISSION_ALREADY_SET'
  | 'EVENT_NOT_PERMITTED_FROM_STATE';

interface ReleaseReadinessError {
  code: ReleaseReadinessErrorCode;
  releaseId: string;
  stage: string;
  occurredAt: CanonicalUtcTimestamp;
  expectedSha256: Sha256 | null;
  observedSha256: Sha256 | null;
}
```

The atomic constructor sets `state='audited'`, stores `actorId` and the validated
candidate/audit, initializes every later receipt/journal to null and the actor's
authorization audit collection to empty, initializes restart/observation state
to null, and appends the exact catalog reservation in the same CAS. The
controller supplies the current durable
`GlobalReplayRegistryV1` to protected-event validation and commits it in the
same transaction; neither global registry/catalog is copied into actor context.
The replay registry may be empty only on first installation and is never reset
by actor creation, candidate replacement, or terminal-state archival.

All payloads are bounded, schema-validated, descriptor-snapshotted, and frozen
before reduction.

For local delivery, the canonical event digest is
`SHA256(JCS({eventType, payload}))`, where `payload` is the entire frozen event
with `type` removed; no field is omitted. Self-digests inside a seal, journal or
artifact are first independently verified, then remain part of these bytes. An
exact local duplicate has the same event type, the same stable release/build/
seal/journal/artifact/receipt IDs that apply, and byte-identical JCS payload to
an already accepted event; it is a no-op. Reusing any stable local ID with a
different event digest returns `LOCAL_RECEIPT_DIVERGENT`. For
`PACKAGE_JOURNAL_INGESTED`, byte-identical redelivery is a duplicate, while only
the single valid next append is progress; a fork, rewrite, truncation, phase
skip, or changed prior entry is divergent. For `SERVICE_RESTARTED`, `restartId`
is the stable single-flight identity: exact redelivery is a no-op in every
state, reuse with different bytes is divergent, and a different new restart is
rejected while one is pending. A local observation uses
`observationId` as its stable identity and is accepted only for the exact
pending `restartId` with `restartedAt <= observedAt`.

## Statechart

```mermaid
stateDiagram-v2
  [*] --> audited: atomic constructor(candidate + audit + catalog reservation) [auditClear]
  audited --> blocked: BLOCKERS_INGESTED
  audited --> rc_built: RC_SEAL_INGESTED [validFinalSeal]
  rc_built --> rc_built: PACKAGE_JOURNAL_INGESTED [validJournalProgress]
  rc_built --> package_validated: PACKAGE_VALIDATED_INGESTED [validPackage]
  blocked --> blocked: PACKAGE_JOURNAL_INGESTED [validObservedRecovery]
  blocked --> blocked: PACKAGE_VALIDATED_INGESTED [validObservedRecovery]
  package_validated --> store_ready: STORE_READINESS_INGESTED [validStoreReadiness && validAuthorization(mark_store_ready)]

  store_ready --> store_ready: SUBMISSION_RECEIPT_INGESTED [validFirstSubmission && validAuthorization(ingest_submission)]
  store_ready --> canary: CANARY_PASS_RECEIPT_INGESTED [submission != null && validCanaryPass && validAuthorization(ingest_canary_pass)]
  canary --> production: PRODUCTION_PROMOTION_RECEIPT_INGESTED [validProductionPromotion && validAuthorization(ingest_production_promotion)]
  canary --> rolled_back: ROLLBACK_RECEIPT_INGESTED [validRollback && validAuthorization(ingest_rollback)]
  production --> rolled_back: ROLLBACK_RECEIPT_INGESTED [validRollback && validAuthorization(ingest_rollback)]

  audited --> blocked: LOCAL_EVIDENCE_INVALIDATED
  rc_built --> blocked: BLOCKERS_INGESTED
  rc_built --> blocked: LOCAL_EVIDENCE_INVALIDATED
  package_validated --> blocked: BLOCKERS_INGESTED
  package_validated --> blocked: LOCAL_EVIDENCE_INVALIDATED
  store_ready --> blocked: BLOCKERS_INGESTED
  store_ready --> blocked: LOCAL_EVIDENCE_INVALIDATED
  canary --> canary: BLOCKERS_INGESTED [recordDiagnosticOnly]
  canary --> canary: LOCAL_EVIDENCE_INVALIDATED [recordDiagnosticOnly]
  production --> production: BLOCKERS_INGESTED [recordDiagnosticOnly]
  production --> production: LOCAL_EVIDENCE_INVALIDATED [recordDiagnosticOnly]
  audited --> audited: SERVICE_RESTARTED [requestObservationOnly]
  blocked --> blocked: SERVICE_RESTARTED [requestObservationOnly]
  rc_built --> rc_built: SERVICE_RESTARTED [requestObservationOnly]
  package_validated --> package_validated: SERVICE_RESTARTED [requestObservationOnly]
  store_ready --> store_ready: SERVICE_RESTARTED [requestObservationOnly]
  canary --> canary: SERVICE_RESTARTED [requestObservationOnly]
  production --> production: SERVICE_RESTARTED [requestObservationOnly]
  rolled_back --> rolled_back: SERVICE_RESTARTED [requestObservationOnly]
  audited --> audited: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  audited --> blocked: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation]
  rc_built --> rc_built: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  rc_built --> blocked: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation]
  blocked --> blocked: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  blocked --> blocked: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation; recordDiagnostic]
  package_validated --> package_validated: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  package_validated --> blocked: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation]
  store_ready --> store_ready: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  store_ready --> blocked: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation]
  canary --> canary: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  canary --> canary: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation; recordDiagnostic]
  production --> production: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  production --> production: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation; recordDiagnostic]
  rolled_back --> rolled_back: LOCAL_RELEASE_OBSERVATION_INGESTED [validObservation]
  rolled_back --> rolled_back: LOCAL_RELEASE_OBSERVATION_INGESTED [invalidObservation; recordDiagnostic]
  blocked --> audited: NEW_CANDIDATE_INGESTED [freshCandidate && auditClear]
```

The following state x event matrices are normative and exhaustive for fresh,
nonduplicate events. Legend: `B`=`BLOCKERS_INGESTED`, `S`=`RC_SEAL_INGESTED`,
`J`=`PACKAGE_JOURNAL_INGESTED`, `P`=`PACKAGE_VALIDATED_INGESTED`,
`R`=`STORE_READINESS_INGESTED`, `U`=`SUBMISSION_RECEIPT_INGESTED`,
`C`=`CANARY_PASS_RECEIPT_INGESTED`,
`D`=`PRODUCTION_PROMOTION_RECEIPT_INGESTED`,
`K`=`ROLLBACK_RECEIPT_INGESTED`, `I`=`LOCAL_EVIDENCE_INVALIDATED`, and
`N`=`NEW_CANDIDATE_INGESTED`. “Reject” means
`EVENT_NOT_PERMITTED_FROM_STATE` with no actor, catalog, or replay-registry
mutation.

| State               | B                       | S          | J                            | P                                | R             | U                 | C        | D            | K             | I                       | N                         |
| ------------------- | ----------------------- | ---------- | ---------------------------- | -------------------------------- | ------------- | ----------------- | -------- | ------------ | ------------- | ----------------------- | ------------------------- |
| `audited`           | `blocked`               | `rc_built` | reject                       | reject                           | reject        | reject            | reject   | reject       | reject        | `blocked`               | reject                    |
| `blocked`           | stay; replace error     | reject     | stay; observed recovery only | stay; recovered artifact/catalog | reject        | reject            | reject   | reject       | reject        | stay; replace error     | `audited` if fresh/closed |
| `rc_built`          | `blocked`               | reject     | stay; next only              | `package_validated`              | reject        | reject            | reject   | reject       | reject        | `blocked`               | reject                    |
| `package_validated` | `blocked`               | reject     | reject                       | reject                           | `store_ready` | reject            | reject   | reject       | reject        | `blocked`               | reject                    |
| `store_ready`       | `blocked`               | reject     | reject                       | reject                           | reject        | stay; assign once | `canary` | reject       | reject        | `blocked`               | reject                    |
| `canary`            | stay; record diagnostic | reject     | reject                       | reject                           | reject        | reject            | reject   | `production` | `rolled_back` | stay; record diagnostic | reject                    |
| `production`        | stay; record diagnostic | reject     | reject                       | reject                           | reject        | reject            | reject   | reject       | `rolled_back` | stay; record diagnostic | reject                    |
| `rolled_back`       | reject                  | reject     | reject                       | reject                           | reject        | reject            | reject   | reject       | reject        | reject                  | reject                    |

Restart is an explicit two-event protocol: `X`=`SERVICE_RESTARTED` and
`O`=`LOCAL_RELEASE_OBSERVATION_INGESTED`.

| State               | X                                               | O: exact valid observation                          | O: invalid/ambiguous observation |
| ------------------- | ----------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| `audited`           | stay; register request and emit scanner command | stay; persist observation                           | `blocked`; typed error           |
| `blocked`           | stay; register request and emit scanner command | stay; authorize only enumerated recovery J/P events | stay; replace typed error        |
| `rc_built`          | stay; register request and emit scanner command | stay; authorize only enumerated recovery/progress   | `blocked`; typed error           |
| `package_validated` | stay; register request and emit scanner command | stay; verify exact immutable bundle                 | `blocked`; typed error           |
| `store_ready`       | stay; register request and emit scanner command | stay; verify exact immutable bundle                 | `blocked`; typed error           |
| `canary`            | stay; register request and emit scanner command | stay; verify exact immutable bundle                 | stay; record diagnostic          |
| `production`        | stay; register request and emit scanner command | stay; verify exact immutable bundle                 | stay; record diagnostic          |
| `rolled_back`       | stay; register request and emit scanner command | stay; verify exact immutable bundle                 | stay; record diagnostic          |

`X` never reads the filesystem and never changes release readiness. An exact
accepted `restartId` replay is a no-op; a competing ID while pending fails
closed. `O` must
match the pending ID, journal/release identities, numeric chronology, self
digest and no-follow inventory contract. It atomically clears `pendingRestart`;
only an exact valid observation becomes `lastLocalObservation`. Invalid or
ambiguous evidence is retained only in the append-only event/diagnostic history
and cannot authorize recovery. `O` cannot itself invent a journal/artifact.
Every structurally valid, correctly correlated `O` consumes and clears
`pendingRestart` in the same transaction, on both the valid and invalid-content
branches, in all eight states. A malformed or wrongly correlated delivery is
rejected as not being that pending observation.
Any recovery `J` or `P` must name that observation and be derivable
byte-for-byte from it. A blocked recovery `P` persists the exact artifact and
catalog publication but deliberately remains `blocked`; it never claims local
readiness.

The business-event matrix assumes `pendingRestart == null`. While a restart is
pending, only exact duplicates and its correlated `O` are accepted; every other
fresh event fails with `RESTART_OBSERVATION_INVALID` and mutates nothing. This
prevents journal, artifact, catalog, or external-state drift between observation
request and snapshot.

Before this matrix, exact local or protected-event duplicate detection runs.
An exact duplicate is a success/no-op in every state; a reused identity with
different bytes is rejected as divergent and never falls through to the
matrix. Every named target above still requires its guard; guard failure rejects
without taking the displayed transition. Restart is therefore coherent even in
`production`: `X` requests only a local scan and `O` verifies already durable
immutable facts; neither polls, commands, retries, or changes provider state.

`rolled_back` is terminal for the candidate. A later candidate is created as a
new actor by the controller; it never mutates this terminal record. The
in-actor `NEW_CANDIDATE_INGESTED` path exists only for a locally blocked actor.

No event in this vocabulary requests or controls a provider operation.

## Guards

| Guard                        | Deterministic rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auditClear`                 | Audit covers every declared domain, matches candidate release/commit/version/namespace and committed scenario inventory, has zero P0/P1, and is accepted only inside the corresponding factory/replacement catalog CAS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `validFinalSeal`             | Local/build/MV3 receipts, SHA-256 seal, exact identity, trees, manifest and permissions pass. The candidate scenario array is derived from the exact committed inventory blob, is nonempty/canonical, and its JCS digest equals both expected digests; executed IDs equal it byte-for-byte; passed count equals its length; skip/failure/diagnostic counts are zero. Worktree and chronology checks pass.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `validJournalProgress`       | Journal identity/marker/ownership matches seal, namespace and artifact; history is one exact bounded append; every root field is immutable except the single null-to-complete `verifiedZipReceipt` assignment at `archive_verified`. `staging_created` precedes copy; `archive_verified` durably binds ZIP receipt, bundle inventory and `renameIntentAt`; timestamps are exact after `sealedAt`; rename is no-replace and namespace is single-use. Recovery must name the stored observation; in `blocked`, no ordinary unobserved progress is accepted.                                                                                                                                                                                                                                                                                     |
| `validPackage`               | Journal is `published`; its verified ZIP receipt equals `artifact.zip` byte-for-byte; artifact matches seal/candidate; source/snapshot/extracted trees, counts, manifest/version/permissions match; every ZIP header/order/offset/inventory/twin rule passes; sidecar and exact JCS validation bytes pass; bundle has the exact four-file inventory/path binding; chronology is exact. Catalog CAS still sees this active reservation, absent published namespace, capacity, and a version strictly above the current published maximum.                                                                                                                                                                                                                                                                                                      |
| `validLocalObservation`      | Pending restart ID/release/journal and numeric chronology match; observation self-digest, path bounds, source tree and complete no-follow staging/final inventories validate. Phase-specific expected absence, directory identity, marker, tree/archive/bundle digests all match. `reserved + staging present`, any non-directory/symlink/special/foreign object, or unexplained bytes fail closed.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `validObservedRecovery`      | State is `blocked`; event `recoveryObservationId` names the stored exact valid observation; proposed J/P is the unique deterministic next value from the recovery table and changes no provider receipt. It cannot start/resume copy, archive, or rename. J may only reconstruct an already observed effect or clean; `cleaned` requires a post-cleanup observation proving both paths absent rather than the observation that merely authorized deletion. P requires a `published` journal, valid package and catalog CAS. State remains `blocked`.                                                                                                                                                                                                                                                                                          |
| `validAuthorization(action)` | Signed authorization matches candidate/artifact, committed policy, actor/scope/action and exact event target digest; issue/ingestion/expiry order passes. Unless it is an exact protected duplicate, global nonce/receipt/sequence checks and expected-revision CAS must pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `validStoreReadiness`        | Structured Store receipt matches the artifact and includes listing, privacy, permission justification, four credential-presence booleans, exact rollback target, immutable record, chronology, and an authorization whose target is exactly this Store event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `validExternalEnvelope`      | Pure validation of schema, bounds, canonical payload digest, exact signature domain bytes, provider operation, policy allowlist, candidate/artifact/manifest/permission identity, timestamp order, and immutable provider record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `freshExternalReceipt`       | `validExternalEnvelope` passes; all registry identities are unused; sequence strictly increases; capacity exists; exact authorization target matches; the expected registry revision and atomic CAS can commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `exactProtectedDuplicate`    | Event type and full JCS bytes of receipt plus authorization equal an already accepted actor event, and both matching global replay records exist. Stale expected revision is ignored; no mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `exactLocalDuplicate`        | Event type, applicable stable IDs, and full frozen JCS payload bytes equal an already accepted local event. Journal redelivery is exact, not a competing append. No mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `crossedOrDivergent`         | Any stable local ID or protected nonce/sequence/receipt/provider-operation/target identity is reused with different canonical content, or external candidate/artifact/predecessor/state differs. Reject without actor or registry mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `validFirstSubmission`       | Context submission is null; fresh envelope action is `submission`; uploaded SHA equals artifact ZIP; trusted-testers channel and exact chronology pass. If submission is non-null, only `exactProtectedDuplicate` succeeds; every other fresh valid submission returns `SUBMISSION_ALREADY_SET` without consuming authorization or registry state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `validCanaryPass`            | Exact single assigned submission is stored; receipt names it; metrics are bounded, immutable, threshold-policy bound, zero critical findings, `passed=true`, and chronology passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `validProductionPromotion`   | Exact canary pass is stored; promotion names it and the same extension/artifact; chronology passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `validRollback`              | Current state is `canary` or `production`. From `canary`, `deploymentReceiptId` equals stored `canaryPass.receiptId`; from `production`, it equals stored `productionPromotion.receiptId`. Target equals stored known-good target; restoration is healthy with zero critical findings; chronology passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `freshCandidate`             | New release/source identity/audit and committed scenario blob are complete. Namespace equals `v` plus canonical committed version. No replacement is allowed while the old journal is nonterminal: it must be null, or `cleaned` with a correlated exact observation proving both paths absent, or `published` with artifact/catalog already persisted. Reusing the old namespace when the journal is null additionally requires a correlated observation proving its final path absent; no owned staging path exists without a journal. In one catalog CAS, abandon the old reservation only when still active, then reserve the new one; a published record is never abandoned. If any artifact was published globally, version precedence is strictly greater than the greatest published version. Published namespaces are never rebound. |

Signature verification, SHA-256, JCS, set comparison, bounds, and time parsing
are pure injected primitives. The reducer performs no fetch, provider lookup,
filesystem operation, or LLM call.

## Effects

| Accepted event                                     | Atomic effect                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKERS_INGESTED` / `LOCAL_EVIDENCE_INVALIDATED` | Preserve all identities and receipts needed for diagnosis and store the typed error. Enter `blocked` only from the four local states through `store_ready`; in `canary` or `production`, preserve the externally proven state and record only the diagnostic as the matrix requires. Never synthesize a retry.                                                             |
| `RC_SEAL_INGESTED`                                 | Persist exact seal and local-event digest, then enter `rc_built`; no ZIP authority exists yet.                                                                                                                                                                                                                                                                             |
| `PACKAGE_JOURNAL_INGESTED`                         | Replace only with the single next exact append-only journal value and persist its local-event digest. Normal progress remains `rc_built`; correlated recovery in `blocked` remains `blocked`.                                                                                                                                                                              |
| `PACKAGE_VALIDATED_INGESTED`                       | In one catalog CAS persist one immutable artifact, append `artifact_published`, bind terminal journal/local-event digest, and enter `package_validated`. Correlated recovery from `blocked` performs the same persistence but remains `blocked`.                                                                                                                           |
| `STORE_READINESS_INGESTED`                         | In one CAS, persist Store and authorization receipts, authorization replay record, registry revision/digest and actor state; enter `store_ready`; infer no submission.                                                                                                                                                                                                     |
| `SUBMISSION_RECEIPT_INGESTED`                      | Only when unassigned, one CAS persists the single submission, authorization, both replay records, registry revision/digest and actor state; remain `store_ready`.                                                                                                                                                                                                          |
| `CANARY_PASS_RECEIPT_INGESTED`                     | One CAS persists receipt, authorization, both replay records, registry revision/digest and actor state; enter `canary`.                                                                                                                                                                                                                                                    |
| `PRODUCTION_PROMOTION_RECEIPT_INGESTED`            | One CAS persists receipt, authorization, both replay records, registry revision/digest and actor state; enter `production`.                                                                                                                                                                                                                                                |
| `ROLLBACK_RECEIPT_INGESTED`                        | One CAS persists receipt, authorization, both replay records, registry revision/digest and actor state; enter terminal `rolled_back`.                                                                                                                                                                                                                                      |
| exact duplicate                                    | Return success/no-op; do not change state, receipts, authorization, journal, artifact catalog, replay registry revision, or replay digest.                                                                                                                                                                                                                                 |
| crossed/divergent receipt                          | Return typed rejection and no mutation. An authenticated contradiction may additionally trigger a separate explicit local-evidence review event, never a transition from the rejected event itself.                                                                                                                                                                        |
| `SERVICE_RESTARTED`                                | Persist one pending restart correlation and emit only `SCAN_LOCAL_RELEASE_FILES(restartId)`; perform no filesystem read and no release/provider transition. Exact accepted replay emits nothing twice.                                                                                                                                                                     |
| `LOCAL_RELEASE_OBSERVATION_INGESTED`               | Validate the correlated complete observation and clear the pending request. Persist it as `lastLocalObservation` only when exact/valid; otherwise clear that field and retain only typed diagnostics/event history. Valid evidence authorizes only enumerated recovery; invalid evidence never mutates provider facts.                                                     |
| `NEW_CANDIDATE_INGESTED`                           | Only after the closed-journal guard, atomically retain the complete old actor snapshot in append-only history, append `candidate_abandoned` only for an active unpublished reservation, derive/freeze the new candidate/audit, append its reservation under catalog CAS, and clear current candidate-local receipts. Global replay and published records remain unchanged. |

## Crash and restart

`SERVICE_RESTARTED` only emits the correlated scanner command. Every row below
is evaluated after a descriptor-snapshotted
`LOCAL_RELEASE_OBSERVATION_INGESTED`; filesystem classifications are never
invented inside the reducer. In `blocked`, only a `J` or `P` naming the stored
observation may perform the listed recovery, and state remains `blocked`.
In `blocked`, recovery never starts or resumes copy/archive/rename side effects:
it may only clean an exactly owned pre-rename staging path, reconstruct a journal
entry for an effect already proven to have happened, and persist an already
published artifact/catalog record. Forward-resume wording in the table applies
only to `rc_built`.

| Durable local observation                                              | Total recovery                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No journal                                                             | No package output is owned; remain `rc_built`.                                                                                                                                                                       |
| `reserved`, staging absent                                             | Final path must also be absent. The runner may perform the exclusive creation, marker write/fsync, identity capture, and `staging_created` commit.                                                                   |
| `reserved`, staging exists in any form                                 | Crash may have occurred after mkdir/marker but before durable identity. Ownership is unprovable: block, adopt nothing, append nothing, and delete nothing even if the marker bytes look exact.                       |
| `staging_created`                                                      | Re-open only the exact no-follow directory/marker identity, then start or resume copy; any unjournaled unexpected content blocks.                                                                                    |
| `snapshot_verified`                                                    | Revalidate seal/source/snapshot and resume independent canonical archive construction; drift blocks.                                                                                                                 |
| `archive_built`                                                        | Validate both twin archives, exact ZIP structure and safe extraction before bundle validation; invalid owned temporary output may be cleaned.                                                                        |
| `archive_verified`, exact staging present and final absent             | Revalidate the exact four files, ownership and durable bundle inventory, perform the atomic no-replace directory rename, then append `bundle_renamed` with `at=renameIntentAt`.                                      |
| `archive_verified`, staging absent and exact final identity present    | Crash occurred after rename but before journal append. Verify marker, directory object identity, all four files and inventory, then append reconstructed `bundle_renamed` with the already durable `renameIntentAt`. |
| `archive_verified`, both paths present/absent or final is inconsistent | Ambiguous/foreign observation: block and delete nothing.                                                                                                                                                             |
| `bundle_renamed`                                                       | Revalidate final marker/object identity, exact consumer paths and complete bundle inventory, then append `published`; never mutate final bytes.                                                                      |
| `published` with exact artifact                                        | Replay exact `PACKAGE_VALIDATED_INGESTED` with catalog CAS/observation correlation; identical accepted replay is a no-op.                                                                                            |
| `published` without reconstructible exact artifact                     | Block; do not invent fields, repackage, overwrite, or delete output.                                                                                                                                                 |
| `cleaned`                                                              | Proves no accepted final output exists; final namespace must be absent; remain `rc_built`.                                                                                                                           |
| Any foreign/ambiguous path, marker, identity, namespace or inventory   | Block and delete nothing.                                                                                                                                                                                            |

Each filesystem side effect is authorized by the preceding durable phase:
`reserved` authorizes only exclusive mkdir/marker creation, `staging_created`
authorizes copy, and `archive_verified` authorizes only the atomic no-replace
rename bound to its durable inventory and `renameIntentAt`. The
post-side-effect journal entry is then durably appended. Because filesystem and
actor storage need not share a transaction, restart reconstructs a missing
post-side-effect entry only from exact marker, no-follow object identity and
immutable bytes as enumerated above. Accepted bundles are never removed.

`NEW_CANDIDATE_INGESTED` is rejected throughout `reserved` through
`bundle_renamed`. It becomes eligible only after `cleaned` plus a correlated
observation proving both paths absent, or after `published` plus durable artifact
and catalog publication. Consequently replacement cannot orphan a staging
directory, lose ownership proof, or hide a renamed bundle.

Protected ingestion is one compare-and-swap transaction containing receipt,
authorization, global replay records/high-water/revision/digest, and actor
state. A crash before commit leaves all absent and replay against a refreshed
revision is fresh. A crash after commit leaves all present and exact replay is a
no-op. Partial acceptance is unrepresentable. Restart performs no provider
query, retry, cancellation, or emission.

## Invariants

1. State vocabulary is exactly the eight values declared above.
2. Local automation cannot advance beyond `store_ready`; Task 12 cannot claim
   canary, production, or rollback from local evidence.
3. Every value is bound to one release, source commit, canonical committed
   SemVer, derived namespace, build, seal, manifest digest, effective
   permission-set digest, and artifact SHA. The current value is `0.2.2`, not a
   type-level constant.
4. `rc_built` requires a fresh complete local/build/MV3 chain and SHA-256 seal
   from unchanged tested bytes. The nonempty expected scenario array is derived
   from the exact committed inventory blob, canonical, and exactly equal to the
   executed array with every scenario passed and zero skips/failures/diagnostics.
   It carries no ZIP authority.
5. Task 12 is package-only after sealing. Any rebuild, install, manifest edit,
   connector re-resolution, version bump, or `dist` mutation invalidates it.
6. `package_validated` requires canonical regular-file inventory, private
   snapshot, the exact byte-level twin ZIP contract, safe extraction, exact
   tree/manifest/version/permissions equality, exact sidecar and JCS validation
   bytes, bounded UTF-8 names, and one atomic no-replace rename of a previously
   absent versioned bundle namespace.
7. All local receipt and journal timestamps satisfy the declared numeric UTC
   order. `renameIntentAt` is durable before rename and is the only recovered
   publication timestamp. All external action chronologies and authorization
   expiry do too.
8. `store_ready` requires both structured Store readiness and a signed,
   unexpired, action-specific authorization. It implies no provider submission.
9. External states advance by ingestion only. No action/cancel/retry/reconcile/
   fence/tombstone provider workflow exists in this model.
10. No free-form or generic evidence reference can substitute for submission,
    canary metrics/pass, production promotion, rollback, restoration health, or
    authorization.
11. Every authorization and external receipt is signed over the exact declared
    domain bytes and exact event target, artifact-bound, nonce/sequence
    protected, timestamped, purely validated, and atomically consumed in the
    controller-global replay registry by revision CAS.
12. The global replay registry is separate from actors, survives every
    candidate/terminal state, records provider operation, nonce, receipt,
    sequence, envelope and target digests, and never evicts. Conflict or
    capacity exhaustion fails closed.
13. Submission is single-assignment per candidate. Only byte-identical replay
    of the accepted submission plus authorization is a no-op; another fresh
    submission is rejected without consuming replay state.
14. Exact local and protected duplicate delivery is a no-op under the explicit
    byte definitions. Crossed or divergent identity is rejected and never
    advances state or consumes replay state twice.
15. `rolled_back` is reachable only from `canary` or `production` and only when
    the exact stored known-good target and healthy restoration are proven.
16. Journal recovery is total and ownership-safe. `staging_created` with an
    exact marker/identity is durable before copy; the marker-before-append crash
    window fails closed; crash after rename is adopted only by exact proof.
    Ambiguous/foreign output is never adopted or deleted.
17. Actor factory, publication, and candidate replacement use the durable
    global release-catalog CAS. Namespace reservation is global, published
    records never disappear, and a post-publication candidate/version is
    strictly greater than the greatest published SemVer.
18. `NEW_CANDIDATE_INGESTED` cannot discard a live journal. It requires no
    journal, observed terminal cleanup with both paths absent, or durable
    artifact/catalog publication.
19. Restart is the exact `X -> correlated O` protocol. The pure reducer performs
    no filesystem/provider I/O and `X` never changes readiness state; its
    prescribed Shell effects may atomically persist the pending correlation and
    emit exactly one local `SCAN_LOCAL_RELEASE_FILES(restartId)` command. Only
    bounded no-follow observation data can authorize recovery, including in
    `blocked`, and neither event drives a provider operation.
20. An LLM never determines a transition. It may not create, repair, classify,
    or authorize release receipts.

## Task 12 mapping

| Task 12 responsibility                | Model gate/result                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approve model before code             | This file is reviewed first; implementation stops on unresolved model findings.                                                                                                        |
| Fresh candidate gate after Tasks 1-11 | Factory/catalog CAS plus `LocalGateReceiptV1 + BuildReceiptV1 + PackagedMv3GateReceiptV1`; expected scenarios come only from the exact committed inventory blob.                       |
| Seal tested `dist`                    | `TestedDistSealV1` with exact SHA-256, committed nonempty expected/executed MV3 scenario equality, pre/post tree, manifest, permissions, clean commit, and ordered time.               |
| Package without rebuild               | Package-only protocol and `PackageJournalV1`; `staging_created` ownership proof precedes copy; no install/build/bump/edit/delete capability.                                           |
| Canonical artifact tests              | Regular-file/no-follow tree, exact local/central ZIP headers and order, independent twin build, hostile-entry rejection, safe extraction, exact sidecar/JCS, equality and drift cases. |
| Produce verified bundle               | One atomic no-replace rename publishes the immutable version namespace containing ZIP, sidecar and validation JSON; catalog CAS records the validated artifact.                        |
| Gate Store readiness                  | Ingest `StoreReadinessReceiptV1` plus `AuthorizationReceiptV1(mark_store_ready)`; maximum Task 12 state is `store_ready`.                                                              |
| Record evidence                       | Report exact immutable local receipts without claiming submission/canary/production/rollback. Later evidence commit never replaces `sourceCommit`.                                     |
| External lifecycle                    | Operator/provider later supplies signed structured receipts; repository only validates and ingests them.                                                                               |

## Model review matrix

- [x] Local deterministic scope ends at `store_ready`; external states are
      ingestion-only and explicitly unclaimed by Task 12.
- [x] There are no provider request, cancel, retry, reconciliation, fence, or
      tombstone events/effects.
- [x] Candidate commit, canonical SemVer/namespace, manifest, effective
      permissions, build, seal, committed scenario blob/array/hash, tree, and
      artifact digests are exact and cross-bound through factory/catalog CAS.
- [x] LocalGate, build, packaged MV3, seal, package journal, publication, and
      validation have one canonical numeric UTC order.
- [x] Package-only MV3 authority, exact byte-level ZIP, safe extraction,
      bounded path bytes, sidecar/JCS bytes, atomic no-replace version-directory
      rename, durable rename intent, and ownership-safe journal recovery are
      explicit; the pre-identity marker crash window fails closed.
- [x] Store readiness and every external ingestion require structured,
      action-specific, signed, unexpired authorization.
- [x] Submission, canary metrics/pass, promotion, rollback, and restoration
      health have structured signed receipts; generic evidence is powerless.
- [x] Provider operation, exact signature domain/target, global replay CAS,
      nonce, timestamp, predecessor, and artifact digest checks are pure and
      fail closed without eviction.
- [x] Local and protected exact duplicates are byte-defined no-ops;
      crossed/divergent receipts are rejected; submission is single-assignment.
- [x] `rolled_back` has exactly two source states and requires exact healthy
      restoration.
- [x] The exhaustive state/event matrix makes restart coherent in every state,
      including blocked/production, through one correlated local observation
      and never drives a provider.
- [x] Global factory/publication CAS makes a published namespace force a fresh
      strictly greater committed version; accepted bundles are never replaced.
- [x] Candidate replacement is rejected while any package journal is live, so
      ownership evidence and renamed bundles cannot be orphaned.
- [x] Task 12 implementation/test/documentation responsibilities map to named
      model values and guards.
