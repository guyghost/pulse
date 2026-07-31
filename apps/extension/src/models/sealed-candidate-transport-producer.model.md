# Sealed Candidate Transport Producer Model

Status: **PENDING INDEPENDENT REVIEW — REVISION 11; IMPLEMENTATION FORBIDDEN**.
Model revision: `11`
Pending content SHA-256: `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`

The pending content hash is SHA-256 of the complete raw UTF-8/LF bytes of this
file after replacing only the value on the `Pending content SHA-256` line with
the literal `__PENDING_SHA256__`. Any semantic edit requires a new hash and an
independent review.

Revision 6 supersedes the independently rejected pending producer model hash
0fdd63f0d800cddd9ffa300ae6ec8945c571fc7c7f6e67a6f420c972b3aee8db,
which superseded rejected pending model hash
42aaebcfd22b1bd3c33ffca7fc85ed33a695ef7a425e4f9f2b7c85832c4cf649,
which superseded rejected hash
ac02d4d6b804af7b7f5b3613e124d35af1ba19cca6929d120e55bbcb58ae2183
and earlier rejected hashes
f0334ce24460b184d83eaa7e8e5a12cdb976bd2f1ed9e25e4cb631184687926a and
7e192fbd2ea866c4be0fc788f074e964464cef45f9fd5d70fdaeb2b719bfa012.
The rejected producer still selected `scenarios.v1.json` while its parent had
cut over exclusively to the thirteen-entry V2 inventory. Revision 6 removes
that split authority and imports the exact parent V2 path, schema, ordered IDs
and both hashes. No approval transfers from any prior hash. Formatting,
independent review, and a new accepted content hash are required before any
producer, workflow, policy, or test code may be implemented.

Revision 6 was independently rejected at normalized UTF-8/LF content hash
`ab29a6e08e4d074ddbeeb7271a1634d7b39fbb314a4d71f20c64ff7c4bfb2029`
because its parent exposed no complete model authority tuple, its fixed Git
object port did not read the MV3-harness and packaged-tab model blobs, and its
V2 cutover participated in a parent/child implementation cycle. Revision 7
imports clarification 7's exact tuple and joint-activation contracts, reads and
recomputes both committed model blobs, propagates both tuples through candidate,
audit and packaged gate, and remains non-authoritative until the one joint
activation CAS commits. No approval transfers from revision 6.

Revision 7 was independently rejected at normalized UTF-8/LF content hash
`4a50bdd112538e6c27a1bdd2dee9199afb4ac8cb93d0991b659ee69baeb1560d`.
It gave the verification sandbox an already verified authority, so verification
receipt production was circular. Its Git port authenticated selected blobs but
still executed tools against the ambient checkout, and activation recomputed
only the MV3 and packaged-tab model blobs. Revision 8 consumes the staged
ordered sets from clarification 8, materializes and executes a complete clean
workspace from commit/tree Git objects, and makes six-blob recomputation an
activation precondition. No approval transfers from revision 7.

Revision 8 was independently rejected at normalized UTF-8/LF content hash
`9230fb822573972143a077fa5f2d7936775268553ead12c7524b246b7f344799`.
Its pre/post Git recapture detected lasting drift, but every materialized source
file and parent remained owner-writable while commands ran. A child could
temporarily change, chmod, replace or shadow authoritative bytes, derive
`dist`, then restore the expected Git projection before the completion receipt.
Revision 9 executes every child from an OS-enforced recursively read-only Git
source view, exposes only closed separately mounted output roots, drops all
mount/capability escape authority, and binds per-command pre/post
mount/capability receipts. No approval transfers from revision 8.

Revision 9 was withdrawn at normalized UTF-8/LF content hash
`5c37fe07586b830b188fb0b6bf128e3955ae4ac103d16e32f56a1dea2c617872`.
It imported withdrawn release-readiness clarification 9 and packaged-tab
revision 6, so it could not bind the corrected CV/package semantics. It also
did not make the three observed CI failures explicit activation blockers:
content-authorized CPython `3.14.5`, the closed producer-owned ten-command host
gate behind a real controller entrypoint, and the exact separate
`diagnostic_only` `test-mv3` uploader policy. A provisional revision 10 author
draft imported clarification 10 candidate hash
`371f1fd8d9ef83b3840aaecb860808b0ba54a44b66508153a566e35042588425`
and packaged-tab revision 8 at hash
`4933b559dc9fca2977d7f3d7371eed69a4f72ca8f687979cb1ebee8716693155`,
but that chain was withdrawn when CV revision 4 omitted live transition rows
for stale, unknown and mismatched callback settlements. The next revision 10
candidate must bind the final clarification 10 and packaged-tab revision 9,
preserve the full immutable-source execution boundary, and close the three
workflow responsibilities without granting raw YAML text or diagnostic
artifacts candidate authority. No approval transfers from revision 9 or the
provisional revision 10 draft.

Revision 10 was withdrawn at normalized UTF-8/LF content hash
`1d8116c0a4bb905b34e536df425d0282290735ee55ca9015ccebebb0e26d9dba`.
Its heading targeted clarification 10, CV revision 5 and packaged tabs revision
9, while normative imports, packaged-gate assertions and final obligations
still selected clarification 9 and packaged tabs revision 6. Revision 11
preserves the complete immutable-source producer, the thirteen-ID V2 inventory,
the six-slot activation and all three fail-closed CI responsibilities, and
imports clarification 11 plus packaged tabs revision 11 at their exact hashes.
The packaged-tabs revision-11 source was independently approved and committed
as `ff9164c4`. No approval transfers from revision 10, any withdrawn
packaged-tabs candidate or any CV predecessor.

An earlier revision-11 candidate was independently rejected at normalized
UTF-8/LF content hash
`8769aa6fea28d0e1c37e416db27c30a7735bc8ec62cf2f38cbda16945e9fb1ab`.
It imported rejected release-readiness clarification-11 hash
`c684d808d1827f5cc7d5f688547c7da0feca30935956dcb16dc197301a461287`,
whose 262,144-byte per-slot bound could not admit the parent model's own
267,797-byte blob. The revised producer imports the corrected clarification-11
authority with its independent 512 KiB bound for every joint-model slot. No
approval transfers from the rejected revision-11 candidate or parent hash.

This document is a strict producer-side refinement of
`release-readiness.model.md` clarification 11 at normalized behavior hash
`9afa97e0848b6c5c6540d33f38e29a409112a531f9ff2cd7124e50ef96511080`.
Types such as
`CandidateIdentityV1`, `AuditReceiptV1`, `ReleaseExecutionAuthorityV1`,
`SealedCandidatePayloadInventoryV1`, `TestedDistSealV1`, the canonical
transport contract, the three staged model-authority types and their ordered
sets,
`JointReleaseModelActivationV1`, `REQUIRED_MV3_HARNESS_MODEL_V26`,
`REQUIRED_PACKAGED_TAB_MODEL_V11`, `ImmutableGitSourceExecutionAuthorityV1`,
`ImmutableGitSourceCommandReceiptV1`, `JOINT_MODEL_BLOB_RULES_V1` and
`PACKAGED_MV3_SCENARIO_INVENTORY_V2`,
`SealCandidateWorkflowClosurePolicyV1` and
`Mv3DiagnosticArtifactPolicyV1` retain their
normative definitions there and are imported, never redeclared. If the two
models disagree, implementation remains blocked pending a new parent and
producer model review; a locally stricter reinterpretation cannot repair a
cross-model authority mismatch.

Implementation remains forbidden until independent review approves the exact
pending hashes of this producer, release-readiness clarification 11, MV3
packaged-harness revision 26 at
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`,
packaged-tab revision 11 at
`30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`,
and CV accessible-anchor revision 6 at
`d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`.
Those approvals permit only the parent-owned closed joint implementation phase;
a green producer test or prior revision cannot substitute for the three
role-distinct receipts or joint activation.

The producer's sole scenario-authority import is:

```ts
import {
  PACKAGED_MV3_SCENARIO_INVENTORY_V2,
  JOINT_MODEL_BLOB_RULES_V1,
  REQUIRED_MV3_HARNESS_MODEL_V26,
  REQUIRED_PACKAGED_TAB_MODEL_V11,
  type ImmutableGitSourceCommandReceiptV1,
  type ImmutableGitSourceExecutionAuthorityV1,
  type JointImplementationVerificationSandboxV1,
  type JointModelVerificationEvidenceV1,
  type OrderedReviewedImplementedModelAuthoritySetV1,
  type OrderedReviewedImplementedVerifiedModelAuthoritySetV1,
  type JointReleaseModelActivationV1,
  type Mv3DiagnosticArtifactPolicyV1,
  type ReviewedImplementedVerifiedModelAuthorityV1,
  type SealCandidateWorkflowClosurePolicyV1,
} from 'missionpulse-release-readiness-clarification-11-authority';
```

No producer-local scenario object, V1 compatibility alias or fallback pathname
is permitted.

### Clarification-11 CI closure carried by this producer

The three failing release-workflow contracts are RED implementation evidence,
not permission to patch YAML until a textual assertion becomes green. This
producer owns their closed implementation boundary:

1. CPython `3.14.5` authority comes only from the exact archive, reviewed
   `release/Dockerfile`, closed two-file BuildKit context, runtime-tree digest
   and executable digest already defined in section 5. The resulting material/
   image receipt must validate before execution-image or Python-dependent
   effects. Runner `PATH`, `setup-python`, `PULSE_RELEASE_PYTHON`, a YAML version
   string and the legacy `3.14.6` release path are forbidden fallbacks; the
   legacy path must be migrated or made non-invocable, not retained as a second
   release authority.
2. The workflow invokes one content-authorized producer controller and one
   `commandPlanSha256`; it never mirrors the ten business commands as free-form
   YAML authority. The producer's pure host-gate plan owns their exact ordered
   argv/cwd/environment/output declarations and the immutable-source launcher
   owns their receipts. The currently referenced
   `scripts/build-sealed-candidate-transport.ts` is absent, so no production
   seal may be claimed until that controller and its source-inventory proof
   exist and the exact ten-command plan executes once with one extension build.
3. The existing `test-mv3` `upload-mv3-evidence` step is a separate
   `diagnostic_only` projection. The parent policy decoder, candidate factory
   and workflow inspector must accept only its exact pinned action, read-only
   job, condition, bounded report path and retention while rejecting every
   second/mutable/candidate-shaped uploader. It never enters this producer's
   local actor, privileged job plan, candidate, seal, handoff, attestation
   subject, transport, terminal prefix or release-transition authority.

Producer START rejects a missing/mismatched clarification-11 CI-closure policy
before materialization. Handoff and terminal construction independently
revalidate the Python material/image receipt, exact ten-command receipt set and
diagnostic/candidate disjointness. A green unrelated suite, absent diagnostic
upload or raw-command substring match has no authority.

## 1. Scope and explicit non-claims

The producer has two different stateful systems:

1. one **local XState actor** builds, exercises, seals, and captures one exact
   transport; its only positive terminal state is transport_captured;
2. one **intra-job GitHub Actions saga** validates the local handoff, asks
   pinned actions to attest and upload, and records a crash-consistent
   RUNNER_TEMP chain while that exact job is alive; its local positive terminal
   state is uploaded_digest_verified, and its cross-job positive authority is
   only the externally durable signed terminal publication defined in section
   9.1.

The local actor never remains alive across YAML steps. GitHub action outputs are
untrusted observations, not transition authority. The YAML workflow engine,
not the local actor, invokes the attestation and upload actions.

No RUNNER_TEMP file is claimed to survive runner loss. Cross-job transport
durability is provided by the authenticated GitHub attestation and artifact
stores; cross-job producer-state durability is separately provided by the
no-replace `ProducerTerminalEnvelopeV1` plus signed catalog publication receipt.
The separately authorized consumer verifies all of them. Actor, reservation,
seal-ingestion and terminal durability are provided by the concrete
authenticated ExternalReleaseCatalogPortV1 in section 3.2, never by a runner
file or process-local adapter. Any active reservation without a successful
durable producer terminal conservatively requires reconciliation. If the
runner disappears before that external terminal publication commits, this
producer emits no cross-job terminal claim; consumers reject the absent signed
terminal instead of reconstructing one from GitHub step text or lost local
files.

The producer:

- consumes clarification 11 only after its exact hash and policy set are
  independently approved;
- may be implemented and tested only inside the parent-owned inactive joint
  phase; its `verification_only` path consumes only the ordered
  review-plus-implementation set and emits producer-slot verification evidence.
  It cannot consume a verification receipt, verified set or activation on that
  path, and cannot construct a production readiness actor until the exact
  activation CAS is already committed;
- derives CandidateIdentityV1 and AuditReceiptV1 through the factory below;
- consumes, but never mints, release-readiness capabilities;
- constructs the release-readiness actor and catalog reservation atomically;
- submits the immutable TestedDistSealV1 through the controller-mediated
  RC_SEAL_INGESTED CAS and proves durable state rc_built before handoff or
  upload;
- captures one direct-upload transport file named exactly
  missionpulse-sealed-candidate;
- creates one GitHub SLSA provenance attestation for that file;
- directly uploads exactly those bytes without a wrapping archive;
- never submits to Chrome Web Store, promotes, rolls back, deletes an
  attestation, deletes an artifact, or overwrites an artifact.

Command exit, a GITHUB_OUTPUT value, an action outcome, a file path, a URL, a
workflow log, or an LLM statement cannot advance either machine by itself.

## 2. Frozen constants, paths, and limits

```ts
type Sha256 = string; // exactly 64 lowercase hexadecimal ASCII characters
type CanonicalUtcTimestamp = string; // release-readiness timestamp contract

const PRODUCER_LIMITS = {
  jobTimeoutMs: 2_700_000,
  localActorTimeoutMs: 2_100_000,
  reservedSagaTimeoutMs: 600_000,
  childValidationTimeoutMs: 60_000,
  maxHandoffBytes: 4_194_304,
  maxSagaSnapshotBytes: 1_048_576,
  maxSagaSnapshots: 8,
  maxArtifactPublicationJoinBytes: 1_048_576,
  maxDispositionReceiptBytes: 1_048_576,
  maxTerminalPublicationReceiptBytes: 1_048_576,
  maxProducerTerminalStructuralBytes: 1_048_576,
  maxActionOutputAsciiBytes: 2_048,
  maxAttestationBundleBytes: 16_777_216,
  maxControllerEnvelopeBytes: 4_194_304,
  maxControllerStdoutBytes: 4_194_305,
  maxControllerStderrBytes: 1_048_576,
  maxFinalizerAuthorityBundleBytes: 100_663_296,
  maxFinalizerLocalGateJcsBytes: 1_048_576,
  maxFinalizerBuildReceiptJcsBytes: 25_165_824,
  maxFinalizerMv3GateReceiptJcsBytes: 50_331_648,
  finalizerTimeoutMs: 120_000,
  finalizerTerminateGraceMs: 5_000,
  maxPlaywrightJsonBytes: 67_108_864,
  maxPlaywrightOutputBytes: 536_870_912,
  maxPlaywrightOutputEntries: 20_000,
  maxBuildkitMetadataBytes: 16_777_216,
  maxOciArchiveBytes: 536_870_912,
  maxAuditEvidenceEnvelopeBytes: 4_194_304,
  maxCatalogRequestBytes: 5_242_880,
  maxCatalogResponseBytes: 4_194_304,
  maxProducerTerminalEnvelopeBytes: 16_777_216,
  maxProducerTerminalRequestBytes: 25_165_824,
  maxProducerTerminalRecordBytes: 25_165_824,
  maxCatalogClockSkewMs: 30_000,
  maxOidcTokenBytes: 16_384,
  producerProbeTimeoutMs: 60_000,
  maxProducerProbeStdoutBytes: 1_048_577,
  maxProducerProbeStderrBytes: 65_536,
} as const;

const PRODUCER_PATHS = {
  gitBackingRoot: '${RUNNER_TEMP}/missionpulse-git-execution-workspace/backing',
  executionRoot: '${RUNNER_TEMP}/missionpulse-git-execution',
  executionSourceRoot: '${RUNNER_TEMP}/missionpulse-git-execution/source',
  dependencyBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/dependencies',
  cacheBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/cache',
  distBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/dist',
  browserProfileBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/browser-profile',
  reportBackingRoot: '${RUNNER_TEMP}/missionpulse-git-outputs/reports',
  stateRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state',
  sagaRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/saga',
  localRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local',
  admissionRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/admission',
  auditReceipt:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/admission/release-audit-receipt.json',
  auditReport:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/admission/release-audit-report.json',
  handoff: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/producer-handoff.json',
  transport: '${RUNNER_TEMP}/missionpulse-sealed-candidate',
  localCancellationReceipt:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/local-cancellation-receipt.json',
  finalizerCwd: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-cwd',
  finalizerHome: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-home',
  finalizerStaging: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-staging',
  finalizerAuthorityBundle:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/finalizer-authority-bundle.json',
  playwrightRaw:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/reports/playwright-mv3.raw.json',
  playwrightOutput:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/reports/playwright-mv3-results',
  packagedMv3Receipt:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/reports/packaged-mv3-gate.json',
  ownedToolRoot: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools',
  ownedNode: '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools/node/bin/node',
  ownedPnpmCli:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools/pnpm/node_modules/.bin/bin/pnpm',
  immutableSourceLauncher:
    '${RUNNER_TEMP}/missionpulse-sealed-candidate-state/local/tools/immutable-source-exec',
} as const;
```

Every runtime substitution is performed once from the trusted runner
environment. The expanded paths must be absolute descendants of RUNNER_TEMP,
must round-trip through the committed POSIX path validator, and must not already
exist except where an exact prior saga snapshot is required.

The state, admission, local, saga, reports, build-context, and staging
directories are created descriptor-relatively with mode 0700. Every authoritative
file is a regular file opened with O_NOFOLLOW and bounded before allocation.
Publication uses O_CREAT | O_EXCL, mode 0600, fsync(file), fsync(parent), a
descriptor-relative recapture, and byte-for-byte revalidation. Symlinks, hard
links, special files, mount substitutions, duplicate names, unexpected entries,
and pathname reopen as authority reject.

The transport path is a **single regular file** whose basename is exactly
missionpulse-sealed-candidate. Its contents are the canonical non-ZIP64
seven-component ZIP defined by release-readiness.model.md. It has no filename
extension because actions/upload-artifact with archive:false derives the
artifact name from the filename and ignores its name input.

## 3. Exact START factory

CandidateIdentityV1 and AuditReceiptV1 are not public inputs. The only public
start value is:

```ts
interface ProducerStartRequestV2 {
  schema: 'missionpulse.sealed-candidate-producer-start';
  version: 2;
  actorId: string;
  releaseId: string;
  expectedCatalogRevision: number;
  repository: string;
  workflowPath: '.github/workflows/ci.yml';
  eventName: 'workflow_dispatch';
  sourceRef: 'refs/heads/main';
  headSha: string;
  runId: string; // canonical positive decimal ASCII, no leading zero
  runAttempt: number; // positive safe integer
  attemptStartedAt: CanonicalUtcTimestamp;
  attemptDeadlineAt: CanonicalUtcTimestamp;
  auditEvidence: {
    envelopeSha256: Sha256;
    envelopeBytes: number;
  };
}

interface ExternalAuditEvidenceChannelPolicyV1 {
  schema: 'missionpulse.external-audit-evidence-channel-policy';
  version: 1;
  policySha256: Sha256;
  origin: 'https://release-evidence.missionpulse.app';
  pathTemplate: '/v1/envelopes/sha256/{envelopeSha256}';
  method: 'GET';
  redirects: 'forbidden';
  credentials: 'omit';
  responseMediaType: 'application/vnd.missionpulse.producer-audit-evidence.v1+json';
  tlsSpkiSha256: readonly [Sha256, ...Sha256[]];
  maxResponseBytes: 4_194_304;
}

interface ExternalAuditEvidencePortV1 {
  kind: 'missionpulse.external-audit-evidence-port';
  policySha256: Sha256;
  fetchByDigest(input: { envelopeSha256: Sha256; envelopeBytes: number }): Promise<Uint8Array>;
}

interface ExternalReleaseCatalogPortPolicyV1 {
  schema: 'missionpulse.external-release-catalog-port-policy';
  version: 1;
  policySha256: Sha256;
  origin: 'https://release-control.missionpulse.app';
  oidcIssuer: 'https://token.actions.githubusercontent.com';
  catalogBrokerOidcAudience: 'missionpulse-release-catalog';
  repository: string;
  ref: 'refs/heads/main';
  workflowRef: string; // exactly {repository}/.github/workflows/ci.yml@refs/heads/main
  jobWorkflowPath: '.github/workflows/ci.yml';
  allowedJobId: 'seal-candidate';
  producerTerminalReadPathTemplate: '/v1/catalog/producer-terminals/{actorId}/{runId}/{runAttempt}';
  producerTerminalReadPathEncoding: 'rfc3986-uppercase-percent-v1';
  producerTerminalReadMethod: 'GET';
  producerTerminalReadCredentials: 'omit';
  producerTerminalReadRedirects: 'forbidden';
  producerTerminalResponseMediaType: 'application/vnd.missionpulse.producer-terminal.v1+json';
  producerTerminalMaxResponseBytes: 25_165_824;
  tlsSpkiSha256: readonly [Sha256, ...Sha256[]];
  receiptKeys: readonly [
    {
      issuer: 'missionpulse-release-catalog';
      keyId: string;
      algorithm: 'ed25519';
      publicKeyBase64: string;
    },
    ...{
      issuer: 'missionpulse-release-catalog';
      keyId: string;
      algorithm: 'ed25519';
      publicKeyBase64: string;
    }[],
  ];
  maxRequestBytes: 25_165_824;
  maxResponseBytes: 25_165_824;
}

interface ExternalReleaseCatalogPortV1 {
  kind: 'missionpulse.external-release-catalog-port';
  policySha256: Sha256;
  createReadinessActor(
    request: CreateReleaseReadinessActorRequestV1
  ): Promise<ReleaseReadinessActorConstructionReceiptV1>;
  ingestRcSeal(
    request: IngestReleaseCandidateSealRequestV1
  ): Promise<ReleaseReadinessRcSealIngestionReceiptV1>;
  publishProducerTerminal(
    request: PublishProducerTerminalRequestV1
  ): Promise<ProducerTerminalRecordV1>;
  recordDisposition(
    request: ProducerReservationDispositionRequestV1
  ): Promise<ProducerReservationDispositionReceiptV1>;
  readReservation(
    request: ProducerReservationReadRequestV1
  ): Promise<ProducerReservationDispositionReceiptV1>;
}

interface ProducerAdmissionV1 {
  sourceWorkspaceMaterialization: GitExecutionWorkspaceMaterializationV1;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  candidate: CandidateIdentityV1;
  candidateJcsSha256: Sha256;
  audit: AuditReceiptV1;
  auditReceiptJcsSha256: Sha256;
  auditReportSha256: Sha256;
  admittedAt: CanonicalUtcTimestamp; // derived from the trusted clock
  readinessActor: {
    actorId: string;
    releaseId: string;
    state: 'audited';
    expectedCatalogRevision: number;
    reservedCatalogRevision: number;
    reservationRecordSha256: Sha256;
    constructionReceiptSha256: Sha256;
    constructionReceipt: ReleaseReadinessActorConstructionReceiptV1;
    auditedContextSha256: Sha256;
  };
  correlation: ProducerRunCorrelationV1;
}

interface ProducerAuditEvidenceEnvelopeV1 {
  schema: 'missionpulse.producer-audit-evidence-envelope';
  version: 1;
  envelopeSha256: Sha256;
  repository: string;
  sourceCommit: string;
  releaseId: string;
  candidateJcsSha256: Sha256;
  issuer: string;
  keyId: string;
  authorizationPolicySha256: Sha256;
  auditReceiptJcsBase64: string;
  auditReceiptJcsSha256: Sha256;
  auditReportBase64: string;
  auditReportSha256: Sha256;
  issuedAt: CanonicalUtcTimestamp;
  expiresAt: CanonicalUtcTimestamp;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}
```

The candidate's `ProducerTerminalReadAuthorityV1` is a pure closed projection
of `ExternalReleaseCatalogPortPolicyV1`: it copies the exact origin, terminal
GET path template and uppercase RFC 3986 encoding rule, catalog-port policy
digest, TLS SPKI set, receipt keys and
25,165,824-byte response bound; fixes method GET, credentials omit, redirects
forbidden and the terminal media type; then computes its own parent-model
self-digest. It deliberately
omits the write-only OIDC audience and mutation methods. The factory requires
this projection byte-for-byte before constructing the candidate, so neither a
producer terminal nor consumer response can choose its verifier.

The factory is one named invoked actor, constructProducerAdmissionV2. Before it
reads the request, its trusted clock port captures factoryObservedAt. Its
synchronous prologue validates all scalar grammar, bounds, chronology, and the
following equalities:

- repository equals the repository authenticated by the runner;
- workflowPath, eventName, and sourceRef equal the literals above;
- headSha equals authenticated `GITHUB_SHA`; the Git object port independently
  proves that object is the exact commit, without consulting checkout state;
- runId and runAttempt equal GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT;
- actorId equals the internally derived literal `producer:{runId}:{runAttempt}`;
- attemptDeadlineAt - attemptStartedAt is exactly 2,700,000 ms;
- factoryObservedAt is not before attemptStartedAt and is at most 5,000 ms
  after it;
- expectedCatalogRevision is non-negative and safe.

Every run ID in request, correlation, handoff, saga, catalog, terminal envelope,
attestation projection, action URL and consumer selector is the same 1..32-byte
canonical positive decimal string matching `/^(?:[1-9]\d*)$/`. It is never
parsed through a JavaScript number. GitHub context text and authenticated API or
attestation projections must round-trip to those exact bytes. `runAttempt`
remains a positive safe integer.

The factory then uses one fixed `GitObjectExecutionWorkspacePortV1`:

```ts
interface GitExecutionTreeEntryV1 {
  path: string;
  mode: '100644' | '100755';
  objectId: string;
  byteLength: number;
  blobSha256: Sha256;
}

interface GitExecutionWorkspaceMaterializationV1 {
  schema: 'missionpulse.git-execution-workspace-materialization';
  version: 1;
  materializationSha256: Sha256;
  sourceCommit: string;
  gitTreeObjectId: string;
  gitObjectFormat: 'sha1' | 'sha256';
  controllerOnlyBackingRootIdentitySha256: Sha256;
  executionMountpointPlanSha256: Sha256;
  orderedTreeEntriesSha256: Sha256;
  treeEntryCount: number;
  treeByteCount: number;
  entries: readonly GitExecutionTreeEntryV1[];
  protectedSourceProjectionSha256: Sha256;
  materializedAt: CanonicalUtcTimestamp;
}

interface GitExecutionWorkspaceCompletionReceiptV1 {
  schema: 'missionpulse.git-execution-workspace-completion-receipt';
  version: 1;
  receiptSha256: Sha256;
  phase: 'local_handoff' | 'terminal_publication';
  materializationSha256: Sha256;
  immutableSourceExecutionAuthoritySha256: Sha256;
  sourceCommit: string;
  gitTreeObjectId: string;
  commandPlanSha256: Sha256;
  commandReceiptSetSha256: Sha256;
  commandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  preExecutionProtectedSourceProjectionSha256: Sha256;
  postExecutionProtectedSourceProjectionSha256: Sha256;
  generatedOutputInventorySha256: Sha256;
  result: 'passed';
  completedAt: CanonicalUtcTimestamp;
}
```

It invokes only the literal executable `/usr/bin/git` as argument arrays, with
no shell, aliases, pager, replace objects, alternates, hooks, text conversion,
filters, submodules, network protocol, sparse checkout or worktree content
authority. The port:

1. reads the object format with `/usr/bin/git rev-parse --show-object-format`;
2. proves `headSha` is exactly one commit object and resolves exactly
   `headSha^{tree}`;
3. executes `/usr/bin/git ls-tree -rz --full-tree {gitTreeObjectId}` and parses
   every NUL-delimited `<mode> <type> <object>\t<path>` record without quoting or
   newline splitting;
4. accepts only `type=blob` and modes `100644` or `100755`; symlink mode
   `120000`, submodule mode `160000`, tree entries in the recursive result and
   every unknown mode/type reject;
5. requires each raw path to be valid bounded UTF-8, relative and canonical,
   with no empty, `.` or `..` segment, backslash, control byte, duplicate,
   prefix conflict or case-fold collision;
6. requires strict unsigned-byte path order and exact object-ID width, bounds
   total records/path bytes/blob bytes before allocation, and reads every listed
   blob through one bounded `/usr/bin/git cat-file --batch-command --buffer`
   session while verifying returned object ID, type and length;
7. creates exactly the controller-only backing path
   `${RUNNER_TEMP}/missionpulse-git-execution-workspace/backing` beneath one new
   owned mode-`0700` parent, proves both were absent, opens the backing-root
   descriptor once, and materializes every listed directory/file
   descriptor-relatively with `O_NOFOLLOW | O_CREAT | O_EXCL`;
8. writes exactly the `cat-file` bytes, assigns mode `0644` or `0755`, fsyncs
   every file and created directory, then descriptor-relatively recaptures every
   mode, byte count and SHA-256 before exposing the workspace capability; and
9. proves the recaptured ordered entry array is byte-for-byte equal to the
   complete `ls-tree` inventory, closes all child-inheritable backing
   descriptors and keeps the backing pathname outside the later child mount
   namespace. It never overlays, copies or substitutes a caller-checkout file.

The fixed Git environment contains only LANG=C.UTF-8, LC_ALL=C.UTF-8, TZ=UTC,
GIT_CONFIG_NOSYSTEM=1, GIT_TERMINAL_PROMPT=0, GIT_OPTIONAL_LOCKS=0,
GIT_PAGER=cat, and an owned empty HOME. PATH is absent and cannot affect the
literal executable. Every command also supplies
-c core.hooksPath=/dev/null and -c protocol.file.allow=never. The observed
object format must equal the repository's committed format and determines the
accepted object-ID width; no command-line override changes it.

`materializationSha256` is SHA-256 of JCS of the complete materialization with
only `materializationSha256` omitted. `orderedTreeEntriesSha256` is SHA-256 of
JCS of the complete ordered `entries` array. The source tree starts with every
commit entry and no other path: by construction it has no modified, deleted or
untracked input. Only after that equality is frozen may the controller create
the fixed empty output-mountpoint directories named by
`executionMountpointPlanSha256`; each remains non-authoritative, absent from Git
and is covered by its empty pre-mount observation. No package or project child
can create one. `protectedSourceProjectionSha256` is an independently rescanned
JCS projection of **all** tracked entries, those exact declared empty
mountpoints, and absence of every other untracked path under the protected
source namespaces. Those namespaces cover the repository
root files, `.github`, every `apps/*` and `packages/*` source, test, fixture,
harness, Playwright config, script, model, policy, manifest, package manifest,
lockfile, workspace/Turbo/Vite/TypeScript config and release Dockerfile. There
is no hand-maintained subset.

The following paths remain mandatory subprojections of that exhaustive tree,
along with every bounded path named by the committed reviewed controller-source
inventory:

- package.json, pnpm-lock.yaml, pnpm-workspace.yaml, and turbo.json;
- apps/extension/package.json and apps/extension/src/manifest.json;
- apps/extension/connectors.config.json;
- apps/extension/tests/mv3/scenarios.v2.json;
- apps/extension/src/models/release-readiness.model.md;
- apps/extension/src/models/mv3-packaged-harness.model.md;
- apps/extension/src/models/packaged-tab-scenarios.model.md;
- apps/extension/src/models/cv-experience-card-accessibility.model.md;
- apps/extension/src/models/sealed-candidate-transport-producer.model.md;
- apps/extension/src/models/sealed-candidate-transport-consumer.model.md;
- apps/extension/release/Dockerfile;
- every committed controller source selected by the reviewed source inventory;
- .github/workflows/ci.yml;
- apps/extension/scripts/release-readiness/policies/connector-authorities.v1.json;
- apps/extension/scripts/release-readiness/policies/transport-attestation-policy.v1.json;
- apps/extension/scripts/release-readiness/policies/github-trusted-root.v1.json;
- apps/extension/scripts/release-readiness/policies/authorization-policy.v1.json;
- apps/extension/scripts/release-readiness/policies/external-receipt-policy.v1.json;
- apps/extension/scripts/release-readiness/policies/external-audit-evidence-channel-policy.v1.json;
- apps/extension/scripts/release-readiness/policies/release-catalog-port-policy.v1.json;
- apps/extension/scripts/release-readiness/policies/producer-host-tool-materials.v1.json;
- apps/extension/scripts/release-readiness/policies/playwright-runtime-materials.v1.json.

Before any project child exists, the controller creates a fresh private Linux
mount namespace and constructs the parent-exported
`ImmutableGitSourceExecutionAuthorityV1`. A new read-only execution root
contains exactly one recursive bind of the complete backing materialization at
`${RUNNER_TEMP}/missionpulse-git-execution/source`. The controller applies
recursive `ro,nodev,nosuid,noexec` semantics atomically to that source mount;
the execution root and every mount ancestor by which a child can address the
source are also read-only. The controller-only backing path is not mounted,
addressable or inherited by the child. `overlayfs` and every other union,
copy-up or stacked source filesystem are forbidden; `overlayMountCount` is
exactly zero.

The execution plan has only five writable-root kinds: `dependencies`, `cache`,
`dist`, `browser_profile` and `report`. Each is a fresh controller-owned backing
directory outside the source materialization and a separate `rw,nodev,nosuid`
mount. Its target is either outside the source view or one exact mountpoint that
the complete `ls-tree` inventory proves absent, with no tracked descendant, and
that a descriptor-relative observation proves empty immediately before attach.
The dependency target covers the only authorized `node_modules`/pnpm virtual
store; it is not copied over a committed module. No writable mount may be a
source ancestor, tracked path, prefix of a tracked path, module/test/fixture/
harness/script/model/policy/manifest/lock/config path, or an overlay/bind shadow
of one. Nested, overlapping, duplicate, late or unknown mounts reject.

Every install, build, unit, contract, release-readiness and Playwright command
runs with its `cwd` resolved descriptor-relatively beneath the read-only source
view and with every project script/config/module path resolved from that view.
Every permitted output, cache, browser profile, report and `dist` path is an
explicit command-plan value beneath one of the five mounted roots. The caller
checkout and controller backing tree are not mounted or readable by the command
sandbox; `PWD`, `OLDPWD`, `INIT_CWD`, `NODE_PATH`, package-manager prefixes,
caches and temporary directories are closed explicit values and cannot name
either. A command whose cwd, loaded script, config, test, fixture, harness,
source or output resolves outside its declared view/root is rejected before
spawn.

The controller drops the effective, permitted, inheritable, ambient and
bounding capability sets, including `CAP_SYS_ADMIN`, sets `no_new_privs`, and
installs the parent-reviewed seccomp/filesystem-write policy for every child and
descendant. It denies `mount`, `umount2`, `move_mount`, `open_tree`,
`mount_setattr`, `fsopen`, `fsmount`, `fspick`, `pivot_root`, `chroot`,
`unshare`, `setns` and user-namespace escape. Source-targeted write/truncate,
chmod/chown, hard-link, symlink, rename and replacement attempts fail at the OS
boundary. A pidfd/cgroup boundary joins the full descendant tree and forbids a
detached helper from surviving receipt capture.

No project/scenario child can resolve or inherit a
Docker/containerd/buildkit/systemd socket, FUSE device, sudo credential, setuid
gain, file-capability gain or privileged mutation broker. The later fixed
Buildx/BuildKit host adapter alone receives its one Docker capability outside
the project-child namespace. It accepts only the closed argv/environment and
the separately captured two-file build context described below; it receives no
source/backing path, mount callback or child-selected option, and returns only
typed metadata/OCI receipts into declared output roots. The socket and raw
adapter never enter PATH, environment, filesystem or descriptors of a source
command.

Every child starts stopped before `exec`. While stopped, the trusted controller
validates its exact mount-namespace identity, `/proc/{pid}/mountinfo`, source and
ancestor read-only flags, five-root mount list, `/proc/{pid}/status` capability
sets, `no_new_privs`, seccomp state, cwd and inherited descriptor inventory.
Only a matching process is released. After the full descendant tree exits, the
same observations are repeated. The resulting parent-exported
`ImmutableGitSourceCommandReceiptV1` binds executable, argv, environment, cwd,
process tree, pre/post mount topology, pre/post capability state and the closed
output inventory. Its self-digest omits only `receiptSha256`; the ordered
nonempty receipt-array digest is `commandReceiptSetSha256`.

Before the first command and after the last joined child, the port also
exhaustively recaptures all tracked entries and protected namespaces. Every
tracked mode/byte/digest equals the materialization and every unexpected
untracked path outside the declared mountpoint inventory is terminal, but this
is defense in depth rather than the source
immutability mechanism. A child cannot temporarily mutate, chmod, link,
symlink, rename, mount, remount or shadow source and restore it later: the OS
boundary makes those operations impossible while it runs. Generated-output
roots are separately inventoried and cannot appear elsewhere.
`ImmutableGitSourceExecutionAuthorityV1.authoritySha256` omits only itself from
the complete RFC 8785 JCS preimage. Completion `receiptSha256` likewise omits
only itself; it embeds the complete ordered command receipts, and its pre/post
protected-source projections must be equal. A changed source byte, writable
ancestor, overlay, shadow, unexpected mount/output, capability drift, missing
entry, escaped path or incomplete command receipt produces
`producer.admission.executed-source-invalid` and no actor, seal or activation.

No policy has a generated default. A missing blob, wrong schema, self-digest
mismatch, workflow-policy projection mismatch, connector-authority mismatch, or
unapproved extra policy is producer.admission.policy-missing or
producer.admission.policy-invalid and publishes no actor.

The scenario and model blobs are not producer-local contracts. The producer
imports `PACKAGED_MV3_SCENARIO_INVENTORY_V2`,
`REQUIRED_MV3_HARNESS_MODEL_V26`, `REQUIRED_PACKAGED_TAB_MODEL_V11` and
`JOINT_MODEL_BLOB_RULES_V1` from release-readiness clarification 11 and
requires its literal path `apps/extension/tests/mv3/scenarios.v2.json`, schema
`missionpulse.packaged-mv3-scenario-inventory`, version `2`, exact ordered
thirteen IDs, blob SHA-256
`b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef`
and scenario-array JCS SHA-256
`2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a`.
The committed blob is byte-checked against that authority before actor
construction. A V1 path, V1 schema, V1 bytes at the V2 path, V1/V2 union or
intersection, missing/extra/reordered/duplicate ID, or locally copied inventory
constant is terminal before catalog reservation.

The same Git-object materialization contains exactly the six model paths in
`JOINT_MODEL_BLOB_RULES_V1`. The strict decoder reads them only through the
read-only execution-root descriptor, requires UTF-8/LF without BOM, exactly one
slot-specific hash line and the exact revision, then replaces only the recorded
64-hex value with that slot's fixed placeholder. Every raw Git blob SHA-256 must
equal its review receipt and every recomputed normalized digest must equal the
corresponding ordered authority identity. MV3 revision 26 must additionally
equal
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`;
packaged-tab revision 11 must equal
`30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`;
the parent and CV revision-6 frozen identities must also match. A worktree read,
missing/extra model authority slot, BOM/CRLF, ambiguous hash line, placeholder,
older revision, alternate convention or byte drift is terminal before catalog
reservation or activation.

The producer has two disjoint authority entrypoints. The private
`verification_only` entrypoint requires the exact parent
`JointImplementationVerificationSandboxV1` embedding one
`OrderedReviewedImplementedModelAuthoritySetV1`. It validates the set's JCS
digest and reviewed projection, requires the sandbox's full immutable-source
authority/command plan to match the freshly constructed OS boundary,
materializes/executes the common clean tree, and emits exactly one producer-slot
`JointModelVerificationEvidenceV1` plus the complete ordered command-receipt
set. It
cannot load a verification receipt, construct a verified set, reserve a release
actor, publish transport or mint activation. The production entrypoint rejects
that sandbox and accepts only a final `JointReleaseModelActivationV1` embedding
one valid `OrderedReviewedImplementedVerifiedModelAuthoritySetV1`.

For production, the factory loads all eighteen immutable receipt blobs named by
the six verified entries, verifies their role-specific schemas/signatures,
accepted evidence and exact path/revision/behavior/commit/tree joins, and
requires candidate, audit and packaged gate to use fixed-index MV3/package
projections from that same set. The activation must be final, name this exact
source commit/tree, both V2 digests, the validated immutable-source authority
and complete command-receipt-set digest, and have an activation catalog revision
already committed before candidate construction. A reviewed, implemented or
verified but unactivated phase has no producer authority. Receipt signatures use
only the controller-global external-receipt policy whose digest is retained by
the set and activation; neither the producer nor any tuple supplies verifier
keys.

The current repository does not yet contain authorization-policy.v1.json,
external-receipt-policy.v1.json,
external-audit-evidence-channel-policy.v1.json,
release-catalog-port-policy.v1.json,
producer-host-tool-materials.v1.json, or
playwright-runtime-materials.v1.json. The two named HTTPS services and the
current seal-candidate workflow also do not yet implement the ports and saga in
sections 3.2 and 9. Those are explicit admission blockers, not values the
implementation may synthesize or replace with a runner-local file.

The factory derives, in order:

1. committed SemVer and release namespace;
2. lockfile and connector-config SHA-256 values;
3. the included connector set from the committed connector resolver contract;
4. expected ManifestAuthorityV1 from the committed manifest template,
   connector configuration, and connector authority set;
5. the exact committed MV3 scenario inventory;
6. all six exact committed model identities, their ordered complete verified
   authority set and the committed joint activation;
7. GitHubTransportAttestationPolicyV1 from the exact committed workflow bytes,
   trusted root, privileged job projection, pinned uses, permissions, ordered
   steps, inputs, expressions, and environment;
8. both signature policies and the exact independently reviewed evidence,
   catalog-port, host-tool, and Playwright material policies;
9. CandidateIdentityV1, including fixed-index MV3/package projections from the
   ordered verified set, the joint activation digest, the exact
   producer-terminal read-authority projection of the catalog policy, and its
   JCS digest.

The later built manifest must be byte-identical to that expected manifest.
Actual dist bytes can confirm the expectation but cannot redefine it.

### 3.1 Immutable authenticated audit-evidence channel

Audit evidence is deliberately not a blob in headSha: a commit cannot contain
an envelope whose signed payload recursively authenticates that same commit.
The factory does not trust pre-existing runtime audit paths. Both
PRODUCER_PATHS.auditReceipt and PRODUCER_PATHS.auditReport must be absent. The
request's envelope digest and size are hostile selectors only. The factory
constructs the sole permitted URI by substituting envelopeSha256 into the exact
committed ExternalAuditEvidenceChannelPolicyV1 path template; no caller supplies
an origin, path, query, fragment, port, credential, redirect, or mirror.

The fixed ExternalAuditEvidencePortV1 performs exactly one direct HTTPS GET. It
uses no ambient proxy, cookie, credential, DNS override, or retry; accepts only
a public-address TLS connection whose leaf chain and SPKI match the committed
policy; follows no redirect; and requires status 200, the exact media type,
Content-Length equal to request.envelopeBytes, an ETag exactly
`"sha256:{envelopeSha256}"`, and `Cache-Control: public, max-age=31536000,
immutable`. It streams at most 4,194,304 bytes, requires the exact requested byte
count and SHA-256, and consumes no second response as authority. URI
content-addressing plus no-replace service storage supplies immutability; TLS
SPKI pinning and the envelope signature supply authentication.

The returned bytes must already be RFC 8785 JCS of exactly one
ProducerAuditEvidenceEnvelopeV1. envelopeSha256 is exactly SHA-256 over JCS of
the complete envelope with **only** envelopeSha256 omitted; this preimage
includes the two base64 evidence values, signedPayloadSha256, signatureAlgorithm,
and signatureBase64. The factory also verifies the exact authorization-policy
digest, the authorized issuer/key pair, every candidate correlation field,
audit.recordedAt <= issuedAt <= factoryObservedAt < expiresAt, an expiry window
of at most 24 hours, and requires signedPayloadSha256 to equal the SHA-256 of
the exact bytes below. It verifies the Ed25519 signature over those same
domain-separated bytes:

```text
missionpulse.producer-audit-evidence.v1\x00 ||
JCS({
  schema,
  version,
  repository,
  sourceCommit,
  releaseId,
  candidateJcsSha256,
  issuer,
  keyId,
  authorizationPolicySha256,
  auditReceiptJcsSha256,
  auditReportSha256,
  issuedAt,
  expiresAt
})
```

The factory strictly base64-decodes the two bounded embedded byte strings,
requires their independent SHA-256 values to equal the signed digests, requires
the receipt bytes to already be RFC 8785 JCS of exactly one AuditReceiptV1, and
requires the report bytes and byte count to equal that receipt's nested report
reference. The report immutable URI is exactly
`https://release-evidence.missionpulse.app/v1/reports/sha256/{auditReportSha256}`;
the embedded bytes make a second fetch unnecessary. It cross-binds release ID,
source commit, version, namespace, scenario inventory, zero open P0/P1 counts,
covered domains, the fixed-index MV3/package projections from the ordered
verified model authority set, the joint activation digest, and chronology to
the derived candidate. The audit cannot replace one
receipt role with another or name a reviewed-but-unactivated phase.

Only after this complete authenticated validation, the factory materializes
the exact decoded receipt and report bytes at the two fixed runtime paths using
O_CREAT | O_EXCL, fsync(file), fsync(parent), and descriptor-relative
recapture. It then revalidates both runtime descriptors byte-for-byte against
the externally fetched signed envelope. No workflow input, previous step,
worktree file, environment variable, Git self-reference, or unsigned report can
produce either proof.
Missing, stale, unsigned, wrongly signed, or mismatched evidence is
producer.admission.audit-missing or producer.admission.audit-invalid.

### 3.2 Concrete durable authenticated release-catalog port

ExternalReleaseCatalogPortV1 is the only catalog authority available to this
producer. It is a nonserializable adapter to the exact origin in the committed
ExternalReleaseCatalogPortPolicyV1; it is not an in-memory implementation, a Git
blob, a RUNNER_TEMP database, a workflow artifact, or a pathname. The external
service durably fsyncs its append-only GlobalReleaseCatalogV1 and operation
receipt before returning success. A later authorized run can retrieve the same
record and receipt after total runner loss.

For each operation, the port's credential broker reads only the
runner-provided ACTIONS_ID_TOKEN_REQUEST_URL and
ACTIONS_ID_TOKEN_REQUEST_TOKEN descriptors, bounds them, requests one GitHub
OIDC JWT for the literal catalog broker audience
`missionpulse-release-catalog`, and retains it only in memory until the one
HTTPS request completes. The JWT must validate issuer,
audience, repository, ref, head SHA, workflow_ref, workflow_sha, event_name,
run_id, and run_attempt against the request and committed policy; it expires in
at most five minutes. Neither token nor request URL is written to output,
snapshot, receipt, log, child environment, or disk.

This broker use is disjoint from the pinned `actions/attest` OIDC protocol. The
attestation action alone may request GitHub tokens with the literal audiences
`nobody` and `sigstore`, in that action's reviewed internal order and only for
its Sigstore/Fulcio exchange. Catalog broker modules reject those two audiences;
the pinned action is given no catalog origin, catalog audience, bearer token or
catalog request method and cannot request `missionpulse-release-catalog` through
a workflow input. The workflow-policy projection admits exactly these two OIDC
consumers: the pinned action for `{nobody,sigstore}` and the named catalog
broker modules for `{missionpulse-release-catalog}`. A shared token, audience
substitution, generic OIDC helper, or token forwarded between them fails closed.

The port supports only these fixed operations:

| Method and path                                  | Typed request                           | Effect                                                                                                      |
| ------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| POST /v1/readiness/actors:construct              | CreateReleaseReadinessActorRequestV1    | atomically persists the audited actor and CAS-appends exactly one candidate_reserved record                 |
| POST /v1/readiness/actors:ingest-rc-seal         | IngestReleaseCandidateSealRequestV1     | context-CAS applies exactly RC_SEAL_INGESTED and durably commits rc_built without changing catalog revision |
| POST /v1/catalog/producer-terminals:publish      | PublishProducerTerminalRequestV1        | no-replace stores one complete terminal saga envelope and its signed publication receipt                    |
| POST /v1/catalog/reservations:record-disposition | ProducerReservationDispositionRequestV1 | CAS-appends candidate_abandoned, or signs an exact nonmutating active/unreserved observation                |
| POST /v1/catalog/reservations:read               | ProducerReservationReadRequestV1        | signs one exact nonmutating reservation observation                                                         |

The policy additionally freezes the credentialless terminal GET route and its
encoding/media/TLS/receipt-key limits so the factory can project
`ProducerTerminalReadAuthorityV1` into the candidate. That read is deliberately
absent from `ExternalReleaseCatalogPortV1`: producer code cannot fetch or
reinterpret its own terminal as mutation authority, while the consumer uses
only the candidate projection.

Every request is bounded RFC 8785 JCS with media type
application/vnd.missionpulse.release-catalog.v1+json. It uses Authorization:
Bearer with that one OIDC JWT and Idempotency-Key:
sha256:{requestSha256}. Actor construction and catalog disposition/read use
`If-Match: "revision-{expectedCatalogRevision}"`; seal ingestion instead uses
`If-Match: "context-sha256-{expectedContextSha256}"`; terminal publication uses
`If-None-Match: *` against its immutable actor/run/attempt key. HTTPS is direct,
uses the policy's exact origin and TLS SPKI set, follows no redirect, uses no
ambient proxy or cookie, and has one 60,000 ms deadline with no automatic
retry. An identical idempotency key returns byte-identical signed receipt
bytes; a key reuse with different request bytes, HTTP conflict, unknown response
field, wrong media type, oversized body, context/catalog divergence, or
terminal-key collision fails closed. Construction, seal and disposition/read
requests remain bounded by `maxCatalogRequestBytes` and their responses by
`maxCatalogResponseBytes`; only the Base64-bearing terminal-publication request
may use `maxProducerTerminalRequestBytes`, and only its signed record may use
`maxProducerTerminalRecordBytes`. The decoded terminal envelope is independently
bounded by `maxProducerTerminalEnvelopeBytes` before allocation.

For every catalog request, requestSha256 is SHA-256 over JCS with exactly
requestSha256 and idempotencyKey omitted; idempotencyKey is then
`sha256:{requestSha256}`. This two-field omission is the only request preimage
rule and removes the otherwise recursive idempotency dependency.

Every response is signed by an exact catalog receipt key in the committed
policy and its `receiptSha256` omits only itself. The two release-readiness
receipts use the parent model's exact
`missionpulse.release-readiness-controller-receipt.v1` signed domain. A
`ProducerTerminalPublicationReceiptV1` uses the exact domain defined with that
type in section 9.1. Disposition/read receipts use the ASCII domain
`missionpulse.release-catalog-receipt.v1\x00` followed by JCS of the complete
receipt with receiptSha256, signedPayloadSha256, signatureAlgorithm, and
signatureBase64 omitted; Ed25519 signs those domain-separated bytes directly.
The response is authority only after its exact domain, signature, self-digest,
request digest, idempotency key, correlation, candidate/audit/seal/envelope
digests, revisions, record sequence, chronology, and requested effect all join
as applicable to that closed response type.

Only after all derivations pass does the factory take a second trusted-clock
sample as admittedAt, require factoryObservedAt <= admittedAt strictly before
the local deadline, construct one `CreateReleaseReadinessActorRequestV1`, and
invoke this port once against expectedCatalogRevision. Its correlation is the
exact `ReleaseReadinessProducerCorrelationV1` projection of the richer producer
correlation; no field is silently dropped except the producer-only event name.
The request carries the exact bounded Base64/JCS candidate and audit bytes. The
private SOURCE_ACCEPTED event carries the complete ProducerAdmissionV1 derived
from the validated `ReleaseReadinessActorConstructionReceiptV1`, including the
durable audited-context digest. A validation failure before CAS publishes
neither actor nor reservation. Once the atomic actor-plus-reservation CAS
commits, its external record exists even if the runner dies before
SOURCE_ACCEPTED; interpreting that active record as
reconciliation_required after the deadline, as specified in section 11,
prevents an orphan from being silently reused. No caller-provided candidate,
audit, admission time, policy, manifest, reservation, receipt, endpoint, key, or
free-form override is accepted.

## 4. Local producer actor

### 4.1 States and events

```ts
type LocalProducerState =
  | 'created'
  | 'admitting_source'
  | 'capturing_tool_materials'
  | 'running_local_gates'
  | 'building_candidate'
  | 'testing_packaged_mv3'
  | 'freezing_dist'
  | 'bundling_controller'
  | 'building_execution_image'
  | 'proving_execution_image'
  | 'controller_invoking'
  | 'ingesting_rc_seal'
  | 'capturing_handoff'
  | 'transport_captured'
  | 'cleaning_failure'
  | 'cancelling'
  | 'cancelled'
  | 'failed';

type LocalProducerEvent =
  | { type: 'START'; request: ProducerStartRequestV2 }
  | { type: 'SOURCE_ACCEPTED'; admission: ProducerAdmissionV1 }
  | { type: 'TOOL_MATERIALS_CAPTURED'; receipt: ToolMaterialsReceiptV1 }
  | { type: 'LOCAL_GATES_PASSED'; receipt: LocalGateReceiptV1 }
  | { type: 'CANDIDATE_BUILT'; receipt: BuildReceiptV1 }
  | { type: 'MV3_GATE_PASSED'; receipt: PackagedMv3GateReceiptV1 }
  | { type: 'DIST_FROZEN'; receipt: FrozenDistObservationV1 }
  | { type: 'CONTROLLER_BUNDLED'; receipt: ControllerBundleReceiptV1 }
  | { type: 'EXECUTION_IMAGE_BUILT'; result: BuildkitProducerResultV1 }
  | {
      type: 'EXECUTION_IMAGE_PROVED';
      authority: ReleaseExecutionAuthorityV1;
      producerPort: ProducerExecutionImagePortV1;
    }
  | { type: 'CONTROLLER_COMPLETED'; result: ControllerProducerResultV1 }
  | {
      type: 'RC_SEAL_COMMITTED';
      receipt: ReleaseReadinessRcSealIngestionReceiptV1;
    }
  | { type: 'HANDOFF_CAPTURED'; handoff: ProducerHandoffV1 }
  | { type: 'LOCAL_STAGE_FAILED'; error: LocalProducerErrorV1 }
  | { type: 'CANCEL_REQUESTED'; reason: 'operator' | 'runner_sigterm' }
  | { type: 'LOCAL_FAILURE_CLEANUP_SUCCEEDED'; receipt: LocalCleanupReceiptV1 }
  | { type: 'LOCAL_CANCELLATION_CLEANUP_SUCCEEDED'; receipt: LocalCleanupReceiptV1 }
  | { type: 'LOCAL_CLEANUP_FAILED'; error: LocalProducerErrorV1 };

interface LocalProducerErrorV1 {
  schema: 'missionpulse.sealed-candidate-local-error';
  version: 1;
  errorSha256: Sha256;
  code: ProducerSagaErrorCode;
  correlation: ProducerRunCorrelationV1;
  stateAtFailure: Exclude<LocalProducerState, 'transport_captured' | 'cancelled' | 'failed'>;
  invocationId: string | null;
  causeSha256: Sha256 | null;
  retryable: false;
  observedAt: CanonicalUtcTimestamp;
}

interface CapturedDescriptorIdentityV1 {
  relativePath: string;
  kind: 'directory' | 'regular-file';
  mode: string;
  bytes: number;
  sha256: Sha256 | null; // null only for a directory
  device: string;
  inode: string;
  ctimeNs: string;
  mtimeNs: string;
}

interface FrozenDistObservationV1 {
  schema: 'missionpulse.frozen-dist-observation';
  version: 1;
  observationSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  buildReceiptJcsSha256: Sha256;
  packagedMv3ReceiptSha256: Sha256;
  rootAbsolutePath: string;
  descriptorSetId: string; // private registry key, not a path reopening authority
  entries: readonly CapturedDescriptorIdentityV1[];
  descriptorInventorySha256: Sha256;
  treeBeforeSuite: CanonicalTreeReceiptV2;
  treeAfterSuite: CanonicalTreeReceiptV2;
  frozenTree: CanonicalTreeReceiptV2;
  manifestBytesSha256: Sha256;
  manifestAuthoritySha256: Sha256;
  frozenAt: CanonicalUtcTimestamp;
}

interface ControllerBundleReceiptV1 {
  schema: 'missionpulse.controller-bundle-receipt';
  version: 1;
  receiptSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  sourceCommit: string;
  sourceInventory: readonly {
    repositoryPath: string;
    gitBlobObjectId: string;
    bytes: number;
    sha256: Sha256;
  }[];
  sourceInventorySha256: Sha256;
  sourceCount: number;
  bundleAlgorithm: 'esbuild-node-esm-single-file-v1';
  bundlerPackageTreeSha256: Sha256;
  outputRelativePath: 'release-controller.bundle.mjs';
  outputBytes: number;
  outputSha256: Sha256;
  outputMode: '0444';
  descriptorSetId: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface BuildkitProducerResultV1 {
  schema: 'missionpulse.buildkit-producer-result';
  version: 1;
  resultSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  invocationId: string;
  toolMaterialsReceiptSha256: Sha256;
  frozenDistObservationSha256: Sha256;
  controllerBundleReceiptSha256: Sha256;
  builderName: string;
  buildxVersion: 'v0.34.1';
  buildxRevision: 'e0b0e77d18d3379bc1e0d55f3b37de288d36fe47';
  buildkitVersion: 'v0.30.0';
  createArgvSha256: Sha256;
  inspectArgvSha256: Sha256;
  buildArgvSha256: Sha256;
  removeArgvSha256: Sha256;
  rawMetadata: {
    bytes: number;
    sha256: Sha256;
    keySet: readonly [
      'buildx.build.provenance',
      'buildx.build.ref',
      'containerimage.descriptor',
      'containerimage.digest',
      'image.name',
    ];
    buildxSlsa02PredicateJcsSha256: Sha256;
  };
  rawOci: {
    bytes: number;
    sha256: Sha256;
    indexSha256: Sha256;
    imageManifestSha256: Sha256;
    imageConfigSha256: Sha256;
    attestationManifestSha256: Sha256;
    attestationConfigSha256: Sha256;
    rawStatementV01JcsSha256: Sha256;
    rawSlsaV1PredicateJcsSha256: Sha256;
  };
  projection: {
    algorithm: 'missionpulse.buildx-0.34.1-slsa1-to-slsa02-semantic-join.v1';
    joinSha256: Sha256;
    completenessEqual: true;
  };
  normalized: {
    buildMetadata: ImmutableBlobRefV1 & {
      kind: 'release-execution-buildkit-metadata';
    };
    buildProvenance: ImmutableBlobRefV1 & {
      kind: 'release-execution-slsa-provenance';
    };
    ociArchive: ImmutableBlobRefV1 & { kind: 'release-execution-image-oci' };
    indexSha256: Sha256;
    manifestSha256: Sha256;
    configSha256: Sha256;
    imageConfigEnvironmentJcsSha256: Sha256;
    layerSha256: readonly Sha256[];
    diffIdSha256: readonly Sha256[];
    finalRootInventorySha256: Sha256;
  };
  descriptorSetId: string;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface LocalCleanupReceiptV1 {
  schema: 'missionpulse.sealed-candidate-local-cleanup';
  version: 1;
  receiptSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  reason: 'stage_failure' | 'operator' | 'runner_sigterm';
  cleanupStartedAt: CanonicalUtcTimestamp;
  everyChildStopped: true;
  buildxBuilderRemoved: true;
  liveDescriptorCount: 0;
  ambiguousStagingObjectCount: 0;
  publishedTransportBeforeCleanup: boolean;
  publishedHandoffBeforeCleanup: boolean;
  removedPublishedTransport: boolean;
  removedPublishedHandoff: boolean;
  publishedTransportAfterCleanup: false;
  publishedHandoffAfterCleanup: false;
  transportPathAbsent: true;
  handoffPathAbsent: true;
  reservationDisposition: 'unreserved' | 'abandoned';
  reservationDispositionReceiptSha256: Sha256;
  completedAt: CanonicalUtcTimestamp;
}
```

observationSha256, receiptSha256, resultSha256, and errorSha256 are SHA-256 over RFC 8785 JCS
of their complete containing value with only their corresponding self-digest
field omitted. Source inventory and descriptor inventory are sorted by unsigned
UTF-8 path bytes, contain no duplicate or implicit root entry, and their digest
is over the exact JCS array. `descriptorSetId` indexes one private, frozen,
nonserializable descriptor registry owned by the current actor; possession of
the string alone grants no read authority. The retained descriptors must still
byte-equal every serialized identity before each later success event.

### 4.2 Transition table

| State                    | Event                                | Guard and effect                                                                                                                                                                                                                                      | Next state               |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| created                  | START                                | validate request; invoke constructProducerAdmissionV2                                                                                                                                                                                                 | admitting_source         |
| admitting_source         | SOURCE_ACCEPTED                      | retain private admission; invoke fixed tool-material capture                                                                                                                                                                                          | capturing_tool_materials |
| capturing_tool_materials | TOOL_MATERIALS_CAPTURED              | validate exact Node, pnpm, Python, Buildx, BuildKit, Playwright, Chromium and FFmpeg                                                                                                                                                                  | running_local_gates      |
| running_local_gates      | LOCAL_GATES_PASSED                   | validate exact local gate receipt                                                                                                                                                                                                                     | building_candidate       |
| building_candidate       | CANDIDATE_BUILT                      | validate the sole production build and expected manifest                                                                                                                                                                                              | testing_packaged_mv3     |
| testing_packaged_mv3     | MV3_GATE_PASSED                      | validate complete same-dist scenario receipt                                                                                                                                                                                                          | freezing_dist            |
| freezing_dist            | DIST_FROZEN                          | retain every dist descriptor and immutable pre/post observation                                                                                                                                                                                       | bundling_controller      |
| bundling_controller      | CONTROLLER_BUNDLED                   | validate committed source inventory and one bounded bundle                                                                                                                                                                                            | building_execution_image |
| building_execution_image | EXECUTION_IMAGE_BUILT                | validate raw metadata, provenance, normalized single-manifest OCI                                                                                                                                                                                     | proving_execution_image  |
| proving_execution_image  | EXECUTION_IMAGE_PROVED               | freeze ReleaseExecutionAuthorityV1 plus its producer-only image port; invoke exactly one finalizer controller                                                                                                                                         | controller_invoking      |
| controller_invoking      | CONTROLLER_COMPLETED                 | validate the one atomic result and retained transport descriptor; invoke the exact RC seal controller CAS                                                                                                                                             | ingesting_rc_seal        |
| ingesting_rc_seal        | RC_SEAL_COMMITTED                    | validate signed audited->rc_built receipt, seal/event/context digests, unchanged catalog revision and durable recapture                                                                                                                               | capturing_handoff        |
| capturing_handoff        | HANDOFF_CAPTURED                     | require durable rc_built; validate local-handoff materialization, immutable-source authority, complete command receipts and unchanged exhaustive source projection; recapture transport; publish only handoff no-replace; emit four untrusted outputs | transport_captured       |
| created                  | LOCAL_STAGE_FAILED                   | prove START was not accepted and no reservation, child, descriptor, or staging object exists                                                                                                                                                          | failed                   |
| cleanup-required state   | LOCAL_STAGE_FAILED                   | revoke local capabilities; begin bounded failure cleanup                                                                                                                                                                                              | cleaning_failure         |
| any cancellable          | CANCEL_REQUESTED                     | cooperative signal only; begin bounded cleanup                                                                                                                                                                                                        | cancelling               |
| cleaning_failure         | LOCAL_FAILURE_CLEANUP_SUCCEEDED      | require reason=stage_failure; prove no child, builder, descriptor ambiguity, published local transport/handoff or partial output remains                                                                                                              | failed                   |
| cancelling               | LOCAL_CANCELLATION_CLEANUP_SUCCEEDED | require reason=operator or runner_sigterm; prove no child, builder, descriptor ambiguity, published local transport/handoff or partial output remains                                                                                                 | cancelled                |
| cleaning_failure         | LOCAL_CLEANUP_FAILED                 | preserve typed failure and cleanup ambiguity                                                                                                                                                                                                          | failed                   |
| cancelling               | LOCAL_CLEANUP_FAILED                 | preserve typed ambiguity; claim neither cancellation nor capture                                                                                                                                                                                      | failed                   |

Every unlisted state/event pair rejects without mutation. Private success events
must carry the exact invocation ID, actor ID, run ID, run attempt, candidate
digest, and child result registered by the state-entry actor. Event handlers
validate completed results; they do not perform the work.

transport_captured, cancelled, and failed are local terminal states.
transport_captured means only that exact local bytes and a handoff exist. It
does not mean attested, uploaded, or production-ready.

The transition classes above are closed and disjoint. cleanup-required state
means exactly admitting_source, capturing_tool_materials, running_local_gates,
building_candidate, testing_packaged_mv3, freezing_dist, bundling_controller,
building_execution_image, proving_execution_image, controller_invoking,
ingesting_rc_seal, or capturing_handoff. any cancellable means exactly that
same set. created can
fail directly only under the negative proof in its row. cleaning_failure
accepts only LOCAL_FAILURE_CLEANUP_SUCCEEDED or LOCAL_CLEANUP_FAILED;
cancelling accepts only LOCAL_CANCELLATION_CLEANUP_SUCCEEDED or
LOCAL_CLEANUP_FAILED. No state, guard outcome, or error can choose between two
next states.

The local chronology is exact and uses parsed epoch milliseconds:

```text
audit.recordedAt
<= localGate.startedAt <= localGate.completedAt
<= build.startedAt <= build.completedAt
<= mv3Gate.startedAt <= mv3Gate.completedAt
<= executionAuthority.startedAt <= executionAuthority.completedAt
<= controllerReceipt.startedAt <= seal.sealedAt <= controllerReceipt.completedAt
<= rcSealReceipt.committedAt
<= handoff.localCapturedAt
```

The corresponding receipt is already complete before its success event is
accepted. No later stage may backdate, redefine, or rebuild an earlier value.

Entry into `ingesting_rc_seal` constructs exactly one
`IngestReleaseCandidateSealRequestV1` from the retained constructor receipt and
the exact finalizer-produced seal. `expectedContextSha256` is the audited
context digest from that constructor receipt; the seal Base64 is its exact JCS;
and `eventSha256` is the parent model's canonical local digest of
`RC_SEAL_INGESTED`. The fixed `ingestProducerRcSeal` actor invokes only
`ExternalReleaseCatalogPortV1.ingestRcSeal`. `RC_SEAL_COMMITTED` is accepted
only when the signed receipt proves the same actor/release/candidate/seal/event,
prior state `audited`, resulting state `rc_built`, an unchanged catalog
revision, and a resulting context digest whose separately loaded actor
byte-recomputes exactly. An exact idempotent retry may return the same receipt;
no different event is retried. The local handoff and every remote-effect saga
step are unreachable until this guard passes.

Before either cleanup-success event is emitted, the local actor calls the
ExternalReleaseCatalogPortV1 disposition operation. Because the local actor has no
attestation/upload capability, both remote effects are provably none: the port
either authenticates that no reservation was created or CAS-abandons the exact
known reservation. Cleanup before transport publication requires all four
before/removal booleans to be false. Cleanup after the finalizer's publication
step, including failures in `controller_invoking`, `ingesting_rc_seal`, or
`capturing_handoff`, must use the retained captured root and object identities:
it proves the current transport and any handoff are the exact actor-owned
regular files, each has link count one and unchanged device/inode/mode/size/
timestamps/digest, unlinks only those entries descriptor-relatively, fsyncs
each parent, recaptures both literal names as absent, and sets each
`removedPublished*` flag exactly equal to its corresponding
`published*BeforeCleanup` flag. An identity mismatch, foreign or hard-linked
object, pathname reopen, missing retained identity, unremovable completed file,
unexpected staging entry, or ambiguous partial handoff makes cleanup fail and
cannot emit either cleanup-success event. No remote attestation or artifact is
deleted. The same actor removes only its identity-matched private finalizer
authority-bundle and staging entries, fsyncs their parents, and proves the
private staging tree empty before closing all descriptors. The local actor then
exclusively writes, fsyncs, and
recaptures the exact JCS LocalCleanupReceiptV1 at
PRODUCER_PATHS.localCancellationReceipt. receiptSha256 omits only itself. A
failure or signal without this durable receipt can enter neither local failed
through failure cleanup nor local cancelled, and cannot support saga cancelled.

The XState setup has the following closed invoked-actor IDs:
constructProducerAdmissionV2, captureProducerToolMaterials,
runProducerLocalGates, buildSingleCandidate, runSameDistMv3Gate,
freezeTestedDist, bundleReleaseController, buildPinnedExecutionImage,
provePinnedExecutionImage, finalizeSealedCandidateTransport,
ingestProducerRcSeal, captureProducerHandoff, cleanupProducerFailure, and
cleanupProducerCancellation. Each is invoked only on entry to its matching
state, receives one frozen typed input, and returns only the matching private
success event. The machine has no generic command actor, wildcard transition,
public send-to-child handle, or string-selected actor.

## 5. Content-authorized tool materials

The exact release toolchain inherited from release-readiness.model.md remains:

- Node 22.23.1;
- pnpm 10.32.1 with integrity
  sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg==;
- CPython standalone 3.14.5 release 20260510;
- Python archive
  cpython-3.14.5+20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz;
- Python archive URL
  https://github.com/astral-sh/python-build-standalone/releases/download/20260510/cpython-3.14.5%2B20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz;
- Python archive size 35,955,046 and SHA-256
  dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6;
- Python runtime tree SHA-256
  82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8;
- executable /opt/missionpulse-python/python/bin/python3.14 with SHA-256
  a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da;
- Node base image linux/amd64 manifest SHA-256
  8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27.

The Python invocation is only that executable with -I, -E, -S, and -B. It uses
the fixed environment and descriptor-scanner bytes from release-readiness. The
scanner is passed by bytes through -c; host Python, setup-python,
PULSE_RELEASE_PYTHON, site packages, user packages, PYTHONPATH, and pathname
fallback are forbidden.

Buildx is content-authorized independently:

```ts
const BUILDX_AUTHORITY = {
  version: 'v0.34.1',
  platform: 'linux/amd64',
  url: 'https://github.com/docker/buildx/releases/download/v0.34.1/buildx-v0.34.1.linux-amd64',
  bytes: 65_138_850,
  sha256: 'f1332ddb9010bd0b72628266c3a906d9a6979848033df4c8d9bd2cd113bae12b',
  installedPath: '${OWNED_DOCKER_CONFIG}/cli-plugins/docker-buildx',
  installedMode: '0555',
} as const;

const BUILDKIT_AUTHORITY = {
  version: 'v0.30.0',
  imageIndexSha256: '0168606be2315b7c807a03b3d8aa79beefdb31c98740cebdffdfeebf31190c9f',
  linuxAmd64ManifestSha256: '57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc',
  driverImage:
    'moby/buildkit@sha256:57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc',
} as const;

interface ReadOnlyToolTreeAuthorityV1 {
  sourceRoot: string; // absolute, exact policy-expanded path
  ownedRoot: string; // absolute descendant of PRODUCER_PATHS.ownedToolRoot
  entryCount: number;
  regularFileBytes: number;
  treeSha256: Sha256;
  entrypointRelativePath: string;
  entrypointBytes: number;
  entrypointSha256: Sha256;
  entrypointMode: '0444' | '0555';
  sourceDevice: string;
  sourceInode: string;
  ownedDevice: string;
  ownedInode: string;
}

interface ProducerHostToolMaterialsPolicyV1 {
  schema: 'missionpulse.producer-host-tool-materials-policy';
  version: 1;
  policySha256: Sha256;
  runner: 'ubuntu-24.04';
  architecture: 'x64';
  setupNodeAction: 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e';
  setupPnpmAction: 'pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093';
  node: {
    version: '22.23.1';
    sourceRoot: '/opt/hostedtoolcache/node/22.23.1/x64';
    executableRelativePath: 'bin/node';
    entryCount: number;
    regularFileBytes: number;
    treeSha256: Sha256;
    executableBytes: number;
    executableSha256: Sha256;
  };
  pnpm: {
    version: '10.32.1';
    integrity: 'sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg==';
    setupDestination: '${RUNNER_TEMP}/missionpulse-bootstrap-pnpm';
    sourceRoot: '${RUNNER_TEMP}/missionpulse-bootstrap-pnpm';
    actionBinDestination: '${RUNNER_TEMP}/missionpulse-bootstrap-pnpm/node_modules/.bin/bin';
    cliRelativePath: 'node_modules/.bin/bin/pnpm';
    resolvedCliRelativePath: string; // exact reviewed in-root target, never discovered via PATH
    entryCount: number;
    regularFileBytes: number;
    treeSha256: Sha256;
    cliBytes: number;
    cliSha256: Sha256;
  };
  immutableSourceLauncher: {
    sourceRoot: string;
    entrypointRelativePath: 'immutable-source-exec';
    entrypointBytes: number;
    entrypointSha256: Sha256;
    seccompPolicySha256: Sha256;
    filesystemWritePolicySha256: Sha256;
  };
}

interface ToolMaterialsReceiptV1 {
  schema: 'missionpulse.producer-tool-materials-receipt';
  version: 1;
  receiptSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  hostPolicySha256: Sha256;
  playwrightPolicySha256: Sha256;
  node: ReadOnlyToolTreeAuthorityV1 & {
    ownedRoot: string; // exact expansion of the owned Node root
    entrypointRelativePath: 'bin/node';
    entrypointMode: '0555';
    versionStdoutSha256: Sha256;
  };
  pnpm: ReadOnlyToolTreeAuthorityV1 & {
    ownedRoot: string; // exact expansion of the owned pnpm root
    entrypointRelativePath: 'node_modules/.bin/bin/pnpm';
    entrypointMode: '0555';
    versionStdoutSha256: Sha256;
    packageIntegrity: 'sha512-pwaTjw6JrBRWtlY+q07fHR+vM2jRGR/FxZeQ6W3JGORFarLmfWE94QQ9LoyB+HMD5rQNT/7KnfFe8a1Wc0jyvg==';
  };
  immutableSourceLauncher: ReadOnlyToolTreeAuthorityV1 & {
    ownedRoot: string;
    entrypointRelativePath: 'immutable-source-exec';
    entrypointMode: '0555';
    seccompPolicySha256: Sha256;
    filesystemWritePolicySha256: Sha256;
  };
  python: {
    archiveBytes: 35_955_046;
    archiveSha256: 'dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6';
    runtimeTreeSha256: '82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8';
    executableAbsolutePath: '/opt/missionpulse-python/python/bin/python3.14';
    executableSha256: 'a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da';
  };
  buildx: {
    executableAbsolutePath: string;
    bytes: 65_138_850;
    sha256: 'f1332ddb9010bd0b72628266c3a906d9a6979848033df4c8d9bd2cd113bae12b';
    versionStdoutSha256: Sha256;
  };
  buildkit: {
    driverImageManifestSha256: '57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc';
    reportedVersion: 'v0.30.0';
  };
  playwright: readonly [
    {
      kind: 'chromium';
      archiveBytes: 185_646_494;
      archiveSha256: '13113b963ac22fffdad898a677591028e4397c46c1daa9e61811258eed6e35b5';
      executableAbsolutePath: string;
      executableBytes: 278_568_152;
      executableSha256: '2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801';
    },
    {
      kind: 'ffmpeg';
      archiveBytes: 2_376_500;
      archiveSha256: 'ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc';
      executableAbsolutePath: string;
      executableBytes: 5_101_056;
      executableSha256: '460d44f3416005662f528d4b92e7b94ace924e8a0288106d3803b73c56eaadc8';
    },
  ];
  capturedAt: CanonicalUtcTimestamp;
}

interface PlaywrightRuntimeMaterialsPolicyV1 {
  schema: 'missionpulse.playwright-runtime-materials-policy';
  version: 1;
  policySha256: Sha256;
  runner: 'ubuntu-24.04';
  architecture: 'x64';
  playwrightVersion: '1.61.1';
  materials: readonly [
    {
      kind: 'chromium';
      revision: '1228';
      browserVersion: '149.0.7827.55';
      initialUrl: 'https://cdn.playwright.dev/builds/cft/149.0.7827.55/linux64/chrome-linux64.zip';
      finalUrl: 'https://storage.googleapis.com/chrome-for-testing-public/149.0.7827.55/linux64/chrome-linux64.zip';
      archiveBytes: 185_646_494;
      archiveSha256: '13113b963ac22fffdad898a677591028e4397c46c1daa9e61811258eed6e35b5';
      executableRelativePath: 'chrome-linux64/chrome';
      executableBytes: 278_568_152;
      executableSha256: '2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801';
      executableMode: '0755';
    },
    {
      kind: 'ffmpeg';
      revision: '1011';
      initialUrl: 'https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip';
      finalUrl: 'https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip';
      archiveBytes: 2_376_500;
      archiveSha256: 'ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc';
      executableRelativePath: 'ffmpeg-linux';
      executableBytes: 5_101_056;
      executableSha256: '460d44f3416005662f528d4b92e7b94ace924e8a0288106d3803b73c56eaadc8';
      executableMode: '0755';
    },
  ];
}
```

Each GitHub release download uses an exact initial HTTPS URL, manual redirects,
no credentials or ambient proxy, exactly one 302 to an
release-assets.githubusercontent.com HTTPS URL, and exactly one final 200.
Canonical URL, DNS/TLS/public-address checks, declared length, streamed bounded
length, and SHA-256 must all match. There is no resume, mirror, tag resolution,
alternate architecture, or second response as authority.

Node and pnpm are not authorized by setup-action success, PATH, a version
string, Corepack, or packageManager metadata. The factory validates the exact
committed ProducerHostToolMaterialsPolicyV1 self-digest and requires its
versions, pnpm integrity, setup action pins, source path templates, byte counts,
and SHA-256 values. The future workflow configures pnpm/action-setup with the
exact destination `${{ runner.temp }}/missionpulse-bootstrap-pnpm`; setup-node's
only accepted source tree is
`/opt/hostedtoolcache/node/22.23.1/x64`. Any other runner layout is a hard
tool-material failure, not a discoverable alternative.

At the pinned pnpm/action-setup commit, Node 22.23.1 selects the non-standalone
self-installer and a target version different from its bootstrap version; its
closed expected bin_dest is therefore exactly
`${RUNNER_TEMP}/missionpulse-bootstrap-pnpm/node_modules/.bin/bin`, and the
target entry is exactly `pnpm` below that directory. The action output is only
checked against this literal; it cannot select a path. The committed host-tool
policy additionally freezes the entry's fully resolved in-root target, byte
count, SHA-256, and complete setup-tree digest. Missing self-update output,
fallback to the bootstrap `.bin`, an escaping link, a standalone binary, or a
different target layout rejects.

captureProducerToolMaterials opens all policy-selected source trees descriptor-relatively,
rejects absolute/escaping links, hard links, special files, mutation, unexpected entry counts or modes, and
verifies the policy's complete tree, entrypoint byte count, and entrypoint
SHA-256. It then copies the exact trees to the two owned roots, makes them
read-only, recaptures them, and repeats the complete proof. Every top-level
Node/pnpm gate invocation uses executable PRODUCER_PATHS.ownedNode and first
argument PRODUCER_PATHS.ownedPnpmCli as absolute paths. It never executes a
pnpm launcher or a node selected by a shebang/PATH.

The same capture validates the launcher's complete policy-selected source tree,
entrypoint bytes and SHA-256, copies it to the exact owned path with mode 0555,
retains its descriptor and binds the reviewed seccomp and filesystem-write
policy digests. The launcher is the only process allowed to create the private
mount namespace and release a stopped child. A shell, Node process, package
script, pinned action or workflow step cannot invoke a project command outside
it; direct execution is `producer.admission.executed-source-invalid`.

The parent environment for every Node/pnpm local gate is the following closed
map; values in braces are already validated absolute paths. No inherited value
survives:

```text
CI=1
HOME={owned empty host-gate home}
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
PATH={ownedNodeBin}:{executionSourceRoot}/node_modules/.bin:/usr/bin:/bin
```

PATH exists only for reviewed package lifecycle descendants. The top-level
process is always the absolute captured Node executable. Every descendant
executable selected from node_modules/.bin is opened from the frozen lockfile
installation, descriptor-captured before and after the command, and recorded in
the local-gate receipt. NODE_OPTIONS, NODE_PATH, PNPM_HOME, COREPACK_HOME,
npm_config_*, proxy variables, preload hooks, user configuration, and every
undeclared variable are absent. The fixed child shell, where a committed script
requires one, is `/bin/sh`; package preinstall/postinstall hooks and a second
dependency install are forbidden during gates.

ToolMaterialsReceiptV1 is complete before TOOL_MATERIALS_CAPTURED. Its
receiptSha256 is SHA-256 of RFC 8785 JCS with only receiptSha256 omitted. Every
expanded source/owned path is absolute even though its type comment shows its
template. The receipt cross-binds the current correlation, both committed
policy digests, retained descriptor identities, full tree digests, exact
entrypoint bytes, version-output digests, downloaded archive authorities, and
capture time. Node version stdout must be exactly `v22.23.1\n`; pnpm version
stdout must be exactly `10.32.1\n`, with exit 0, empty stderr, and at most 64
stdout bytes, but those self-reports only confirm already content-authorized
bytes.

Chromium and FFmpeg are equally content-authorized. The factory reads the
committed playwright-runtime-materials.v1.json from the fixed Git object port,
validates its self-digest and exact tuple above, and rejects empty, duplicate,
relative, redirect-expanded, or unbounded fields. captureProducerToolMaterials
downloads each archive independently from its literal initial URL with manual
redirect and public-address checks, enforces the policy's exact final URL,
streamed byte count, and SHA-256, extracts into one owned no-follow root with
the reviewed safe-archive extractor, and proves the exact executable byte
count and SHA-256. It records both complete archive and executable authorities
in ToolMaterialsReceiptV1. Neither playwright-core/browsers.json, an install
script, an on-runner cache, a preinstalled browser, PATH, nor version
self-reporting can authorize bytes. The current missing policy keeps START
blocked until a committed, independently reviewed policy byte-equals every
literal URL, size, digest, path, and mode frozen above.

## 6. Frozen Buildx/BuildKit topology and provenance

### 6.1 Owned environment

The local actor delegates to the controller-owned fixed Buildx host adapter,
which installs the Buildx binary at the exact owned plugin path above and
invokes only /usr/bin/docker. This adapter is not a project child, exposes no
Docker socket/callback to one and receives only the captured two-file build
context plus the closed request. The builder name is exactly
missionpulse-{runId}-{runAttempt}; runId and runAttempt use their canonical
validated forms. One run has one builder name, one node, one
docker-container driver, one linux/amd64 platform, no QEMU, no remote endpoint,
and no second builder.

The environment passed to every Buildx command is a closed map:

```text
BUILDX_METADATA_PROVENANCE=max
DOCKER_CONFIG={owned absolute docker config}
DOCKER_HOST=unix:///var/run/docker.sock
HOME={owned empty home}
TMPDIR={owned temporary directory}
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
SOURCE_DATE_EPOCH=0
```

PATH is not consulted because the executable path is absolute. Proxy variables,
SSH agents, registries, credentials, DOCKER_CONTEXT, BUILDKIT_HOST,
BUILDX_BUILDER, BUILDX_CONFIG, BUILDX_BAKE_FILE, BUILDX_DEFAULT_POLICY,
SOURCE_POLICY, experimental feature flags, and all undeclared variables are
absent.

The build context is a descriptor-captured directory with exactly two regular
files:

1. Dockerfile, byte-identical to
   headSha:apps/extension/release/Dockerfile;
2. the exact authorized Python archive under its literal archive name.

No .dockerignore, VCS metadata, source tree, socket, link, secret, SSH mount,
cache mount, bind context, named context, frontend override, build argument, or
extra byte is present.

### 6.2 Exact commands

Commands are fixed argv tuples. The values in braces are already validated
absolute paths or the canonical builder name; no shell performs interpolation.

```text
CREATE =
  /usr/bin/docker
  buildx
  create
  --name {builderName}
  --driver docker-container
  --driver-opt image=moby/buildkit@sha256:57269d1784e49b46228c45a1a1b870fbe40e0a639ab60b37b032d83af5bccdfc
  --driver-opt network=bridge
  --buildkitd-flags --oci-worker-gc=false
  --platform linux/amd64
  --use
  unix:///var/run/docker.sock

INSPECT =
  /usr/bin/docker
  buildx
  inspect
  --builder {builderName}
  --bootstrap
  --format {{json .}}

BUILD =
  /usr/bin/docker
  buildx
  build
  --builder {builderName}
  --platform linux/amd64
  --progress plain
  --file {contextRoot}/Dockerfile
  --network none
  --pull
  --no-cache
  --provenance=mode=max,version=v1
  --sbom=false
  --metadata-file {rawMetadataPath}
  --output type=oci,dest={rawOciPath},tar=true,oci-mediatypes=true,oci-artifact=true,name=docker.io/library/missionpulse-release-runtime:sealed-candidate
  {contextRoot}

REMOVE =
  /usr/bin/docker
  buildx
  rm
  --force
  {builderName}
```

Order, spelling, equals placement, and value count are normative. Extra or
missing flags reject. Before CREATE, the exact argv `/usr/bin/docker buildx
version` must exit 0, write no stderr, and write exactly these 74 UTF-8 bytes to
stdout, including the one final LF and no CR:

```text
github.com/docker/buildx v0.34.1 e0b0e77d18d3379bc1e0d55f3b37de288d36fe47
```

The parser splits exactly three ASCII tokens and independently requires package,
version, and revision to equal those literals; a prefix match, omitted revision,
extra whitespace/line, truncated hash, or other self-report rejects. INSPECT
must strictly decode one JSON object and prove builder name, docker-container
driver, one node, BuildKit v0.30.0, the exact driver image manifest,
linux/amd64, and no additional endpoint or platform. A textual human summary is
not authority.

CREATE and BUILD are each invoked exactly once. REMOVE is invoked exactly once
after BUILD completion or during observed cleanup. The actor never retries in
place. Pulling the BuildKit driver and the base image is allowed only by their
exact manifest digests. Any mutable tag resolution or different manifest
rejects.

### 6.3 Exact Buildx metadata projection and raw BuildKit SLSA v1

The explicit --provenance=mode=max,version=v1 flag is the executable request
for a raw SLSA Build Provenance v1 predicate. --sbom=false prohibits an SBOM
attestation; no environment default or implicit Buildx provenance version is
accepted. `BUILDX_METADATA_PROVENANCE=max` does **not** make the metadata value
byte-equal to the raw OCI attestation: Buildx v0.34.1 converts the BuildKit SLSA
v1 predicate to a lossy SLSA v0.2 compatibility predicate before writing
`buildx.build.provenance`.

The raw metadata file is private and never transported unchanged. A strict
duplicate-key-rejecting parser accepts one bounded JSON object with exactly five
keys:

- buildx.build.provenance;
- buildx.build.ref;
- containerimage.descriptor;
- containerimage.digest;
- image.name.

`image.name` must be the exact JSON string
`docker.io/library/missionpulse-release-runtime:sealed-candidate`.
`containerimage.digest` and `containerimage.descriptor.digest` must both equal
the **raw top-level OCI index** digest. `containerimage.descriptor` must be
byte-for-semantic-field equal to the raw index descriptor emitted for that
index: media type `application/vnd.oci.image.index.v1+json`, digest, byte size
and exact annotations; it is not an image-manifest descriptor. Platform is
proved only by traversing that captured index. There is no
`containerimage.config.digest` metadata key. The unique image-manifest digest
and its unique config digest are derived exclusively by validating the raw OCI
descriptor graph and matching every referenced blob, never from Buildx
metadata or a copied scalar.
`buildx.build.ref` must be one bounded
Buildx reference correlated to the unique builder invocation and is recorded,
never treated as content authority.

`buildx.build.provenance` must be exactly one SLSA provenance v0.2 **predicate
object**, not an in-toto statement and not a SLSA v1 predicate. It must have the
closed v0.2 shape emitted by Buildx v0.34.1's
`build/provenance.go` SLSA1-to-SLSA02 conversion: exact builder, buildType,
invocation, metadata, and ordered materials; there are no `_type`,
`predicateType`, `subject`, or unknown top-level fields. Its
`metadata.completeness.materials` is a boolean observation, not a host claim.

Independently, the unique raw OCI predicate layer must be exactly one in-toto
Statement whose `_type` is `https://in-toto.io/Statement/v0.1`, whose
`predicateType` is `https://slsa.dev/provenance/v1`, whose sole subject is the
proved image-manifest name/digest, and whose predicate is the closed BuildKit
v0.30.0 SLSA v1 shape. In that predicate the completeness observation lives at
`runDetails.metadata.buildkit_completeness.resolvedDependencies`; it is not
read from a v0.2 path.

The frozen `validateBuildx0341Projection` guard compares the two representations
semantically rather than bytewise. It requires exact equality after the known
Buildx v0.34.1 projection of: builder identity; build type; external/internal
parameters and source entry point; invocation environment fields preserved by
the converter; every ordered resolved dependency/material URI and digest; build
start/finish chronology; reproducibility flag; and
`raw.runDetails.metadata.buildkit_completeness.resolvedDependencies ===
metadata.metadata.completeness.materials`. A field discarded by the converter
is validated only in raw v1 and must be absent from v0.2; a field preserved by
the converter must compare exactly. Unknown semantic keys, lossy numbers,
duplicate JSON keys, noncanonical digest strings, invented dependencies,
completeness divergence, an undeclared network material, or a subject unequal
to the proved OCI image manifest rejects.

```ts
interface ProducerMaterialProjectionV1 {
  schema: 'missionpulse.producer-material-projection';
  version: 1;
  materials: readonly [
    { kind: 'base-manifest'; authority: 'buildkit-and-host'; sha256: Sha256 },
    { kind: 'recipe'; authority: 'git-object-source'; sha256: Sha256 },
    { kind: 'python-archive'; authority: 'download-capture'; sha256: Sha256 },
    { kind: 'build-context'; authority: 'host-descriptor-scan'; sha256: Sha256 },
  ];
  rawBuildkitResolvedDependenciesComplete: boolean;
  hostProjectionAddsLocalMaterials: true;
}
```

The ordered material projection required by release-readiness.model.md is this
controller-produced cross-authority value. Its
provenanceMaterialsSha256 is the SHA-256 of its RFC 8785 JCS bytes. It is not a
claim that BuildKit emitted all four entries in resolvedDependencies.

The normalizer emits:

- build-metadata.json as RFC 8785 JCS of exactly
  `{schema:"missionpulse.normalized-buildx-metadata",version:1,buildxMetadata,producerMaterialProjection}`,
  where `buildxMetadata` is byte-for-semantic-value equal to the validated exact
  five-key Buildx object (including its SLSA v0.2 predicate) and
  `producerMaterialProjection` is the exact
  `ProducerMaterialProjectionV1`; neither derived manifest/config scalar is
  inserted into `buildxMetadata`;
- build-provenance.json as a reviewed normalization of the validated **raw OCI
  layer**, never of the lossy metadata value: it copies subject, predicateType,
  and the SLSA v1 predicate byte-for-semantic-value, changes only `_type` from
  `https://in-toto.io/Statement/v0.1` to
  `https://in-toto.io/Statement/v1`, then emits one RFC 8785 JCS object;
- ReleaseExecutionAuthorityV1 cross-binding both files, recipe, context,
  materials, Buildx/BuildKit authorities, controller bundle, Python runtime,
  and normalized OCI graph.

The raw OCI layout must contain exactly two index descriptors: one linux/amd64
image manifest and one BuildKit provenance attestation descriptor with
unknown/unknown platform. The attestation manifest must contain exactly one
predicate layer of media type application/vnd.in-toto+json whose payload is the
validated Statement/v0.1 plus SLSA v1 predicate above. Because BUILD includes
`oci-artifact=true`, the attestation manifest must also have
`artifactType=application/vnd.docker.attestation.manifest.v1+json`, exactly one
`subject` descriptor byte-for-field equal to the image-manifest media type,
digest, and size with no platform or annotations, and exactly one config
descriptor of media type application/vnd.oci.empty.v1+json whose blob bytes are
the canonical empty JSON object `{}`. The index attestation descriptor has
exactly the BuildKit reference-type and reference-digest annotations that bind
it to the image manifest. There is no SBOM, second attestation, unknown
artifact, referrer, or nested index.
The deterministic normalizer:

1. captures the raw tar once and validates every header and blob digest;
2. verifies the unique manifest, config, ordered layers, diff IDs, history, and
   root inventory;
3. removes exactly the already validated provenance attestation manifest,
   config, predicate blob, and raw-index descriptor; any nonmatching or shared
   blob rejects rather than being dropped;
4. retains only the two reviewed OCI annotations with exact values:
   io.containerd.image.name =
   docker.io/library/missionpulse-release-runtime:sealed-candidate and
   org.opencontainers.image.ref.name = sealed-candidate;
5. reconstructs canonical oci-layout, index.json, and blobs with fixed path
   order, mode, uid/gid, uname/gname, mtime, PAX, and tar termination;
6. reopens the normalized archive no-follow and repeats the complete graph
   proof.

The normalized transported index has exactly one image manifest as required by
release-readiness.model.md. Normalization can remove only the one exact
previously validated provenance descriptor set; it cannot erase an unknown or
malformed descriptor to make a hostile raw index pass.

## 7. Frozen host gate and one closed finalizer invocation

The local host gate in section 7.2 completes and freezes dist before the
execution image is built. provePinnedExecutionImage returns the immutable
authority together with exactly one private producer-only capability:

```ts
interface FrozenProducerProbeInputV1 {
  schema: 'missionpulse.frozen-producer-probe-input';
  version: 1;
  inputSha256: Sha256;
  invocationId: string;
  candidateJcsSha256: Sha256;
  auditReceiptJcsSha256: Sha256;
  packagedMv3ReceiptSha256: Sha256;
  frozenDistTreeSha256: Sha256;
  controllerBundleSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  imageManifestSha256: Sha256;
  imageRootInventorySha256: Sha256;
  effectiveContainerEnvironmentJcsSha256: Sha256;
  network: 'none';
  rootFilesystem: 'read-only';
  writableTmpfs: '/tmp/missionpulse-producer-probe';
  deadlineAt: CanonicalUtcTimestamp;
}

interface FrozenProducerProbeOutputV1 {
  schema: 'missionpulse.frozen-producer-probe-output';
  version: 1;
  outputSha256: Sha256;
  invocationId: string;
  inputSha256: Sha256;
  candidateJcsSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  imageManifestSha256: Sha256;
  imageRootInventorySha256: Sha256;
  effectiveContainerEnvironmentJcsSha256: Sha256;
  controllerBundleSha256: Sha256;
  pythonRuntimeTreeSha256: Sha256;
  pythonExecutableSha256: Sha256;
  descriptorScannerSha256: Sha256;
  probeProgramSha256: Sha256;
  network: 'none';
  rootFilesystem: 'read-only';
  writableTmpfs: '/tmp/missionpulse-producer-probe';
  status: 'passed';
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerProbeReceiptV1 {
  schema: 'missionpulse.producer-probe-receipt';
  version: 1;
  receiptSha256: Sha256;
  portId: string;
  invocationId: string;
  inputSha256: Sha256;
  authorityJcsSha256: Sha256;
  manifestSha256: Sha256;
  imageReference: string; // exactly missionpulse-release-runtime@sha256:{manifestSha256}
  executable: '/usr/bin/docker';
  argvSha256: Sha256;
  entrypoint: '/opt/missionpulse/producer-probe.mjs';
  network: 'none';
  rootFilesystem: 'read-only';
  stdinJcsSha256: Sha256;
  stdinBytes: number;
  output: FrozenProducerProbeOutputV1;
  exitCode: 0;
  stdoutJcsSha256: Sha256;
  stdoutBytes: number;
  stderrBytes: 0;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface ProducerExecutionImagePortV1 {
  kind: 'missionpulse.producer-execution-image-port';
  portId: string;
  authorityJcsSha256: Sha256;
  manifestSha256: Sha256;
  invocationBudget: 1;
  invokeProducerProbe(input: FrozenProducerProbeInputV1): Promise<ProducerProbeReceiptV1>;
}

type ProducerFinalizerDescriptorBindingV1 =
  | {
      logicalName: 'dist-root';
      fd: 3;
      procPath: '/proc/self/fd/3';
      kind: 'directory';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'audit-receipt';
      fd: 4;
      procPath: '/proc/self/fd/4';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'audit-report';
      fd: 5;
      procPath: '/proc/self/fd/5';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'controller-bundle';
      fd: 6;
      procPath: '/proc/self/fd/6';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'build-metadata';
      fd: 7;
      procPath: '/proc/self/fd/7';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'build-provenance';
      fd: 8;
      procPath: '/proc/self/fd/8';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'normalized-oci';
      fd: 9;
      procPath: '/proc/self/fd/9';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'execution-authority';
      fd: 10;
      procPath: '/proc/self/fd/10';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'producer-probe-receipt';
      fd: 11;
      procPath: '/proc/self/fd/11';
      kind: 'regular-file';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'staging-root';
      fd: 12;
      procPath: '/proc/self/fd/12';
      kind: 'directory';
      identitySha256: Sha256;
    }
  | {
      logicalName: 'finalizer-authority-bundle';
      fd: 13;
      procPath: '/proc/self/fd/13';
      kind: 'regular-file';
      identitySha256: Sha256;
    };

interface ProducerFinalizerAuthorityBundleV1 {
  schema: 'missionpulse.producer-finalizer-authority-bundle';
  version: 1;
  bundleSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  candidate: CandidateIdentityV1;
  candidateJcsSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  releaseCommandReceiptSetSha256: Sha256;
  releaseCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  localGate: LocalGateReceiptV1;
  localGateJcsSha256: Sha256;
  buildReceipt: BuildReceiptV1;
  buildReceiptJcsSha256: Sha256;
  mv3GateReceipt: PackagedMv3GateReceiptV1;
  mv3GateReceiptJcsSha256: Sha256;
}

interface ProducerFinalizerInputEnvelopeV1 {
  schema: 'missionpulse.producer-finalizer-input';
  version: 1;
  inputSha256: Sha256;
  invocationId: string;
  correlation: ProducerRunCorrelationV1;
  candidateJcsSha256: Sha256;
  immutableSourceExecutionAuthoritySha256: Sha256;
  releaseCommandReceiptSetSha256: Sha256;
  localGateJcsSha256: Sha256;
  buildReceiptJcsSha256: Sha256;
  mv3GateReceiptJcsSha256: Sha256;
  finalizerAuthorityBundleBytes: number;
  finalizerAuthorityBundleSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  frozenDistObservationSha256: Sha256;
  controllerBundleReceiptSha256: Sha256;
  buildkitProducerResultSha256: Sha256;
  producerProbeReceiptSha256: Sha256;
  descriptorBindings: readonly [
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 3 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 4 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 5 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 6 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 7 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 8 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 9 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 10 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 11 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 12 }>,
    Extract<ProducerFinalizerDescriptorBindingV1, { fd: 13 }>,
  ];
  stagingMustBeEmpty: true;
  deadlineAt: CanonicalUtcTimestamp;
}

interface ProducerFinalizerOutputEnvelopeV1 {
  schema: 'missionpulse.producer-finalizer-output';
  version: 1;
  outputSha256: Sha256;
  inputSha256: Sha256;
  invocationId: string;
  authorityJcsSha256: Sha256;
  payloadInventoryJcsSha256: Sha256;
  testedDistSealJcsSha256: Sha256;
  transportZipReceiptJcsSha256: Sha256;
  stagedTransport: {
    relativePath: 'missionpulse-sealed-candidate';
    bytes: number;
    sha256: Sha256;
    mode: '0600';
  };
  producerReceipt: ControllerProducerReceiptV1;
  completedAt: CanonicalUtcTimestamp;
}
```

Separately, for `FrozenProducerProbeInputV1` and
`FrozenProducerProbeOutputV1`, inputSha256 and outputSha256 omit only their
corresponding self-digest field; `ProducerProbeReceiptV1.receiptSha256` likewise
omits only itself. That probe invocation writes exact RFC 8785 JCS input bytes
plus one LF to stdin, then closes stdin. The input plus LF is at most 65,536
bytes. The probe child must write exact RFC 8785 JCS of one
FrozenProducerProbeOutputV1 plus one LF to stdout, at most 1,048,577 bytes, and
zero bytes to stderr. The host requires strict UTF-8, no BOM/CR/duplicate key,
the exact LF, self-digest, all input/output equalities, exit 0, and completion
before the earlier of input.deadlineAt and the fixed 60,000 ms timeout.
stdinJcsSha256 and stdoutJcsSha256 hash the respective JCS bytes without the LF;
stdinBytes and stdoutBytes include that one LF.

The sole process executable and argv are:

```text
/usr/bin/docker
run
--interactive
--rm
--pull=never
--platform=linux/amd64
--read-only
--network=none
--cap-drop=ALL
--security-opt=no-new-privileges:true
--hostname=missionpulse-producer-probe
--user=65532:65532
--pids-limit=64
--tmpfs
/tmp/missionpulse-producer-probe:rw,noexec,nosuid,nodev,size=16777216,mode=0700,uid=65532,gid=65532
--entrypoint
/opt/missionpulse/producer-probe.mjs
missionpulse-release-runtime@sha256:{manifestSha256}
```

The host Docker-client environment is exactly
DOCKER_HOST=unix:///var/run/docker.sock, HOME={owned empty probe home},
TMPDIR={owned probe tmp}, LANG=C.UTF-8, LC_ALL=C.UTF-8, and TZ=UTC. PATH, proxy,
Docker context, credential, socket override, and every other host variable are
absent. No `--env`, `--env-file`, or shell is used. The effective container
environment is the exact closed ordered Env array already parsed from the proved
OCI config plus only Docker's exact
`HOSTNAME=missionpulse-producer-probe` runtime entry; its JCS digest is
effectiveContainerEnvironmentJcsSha256 and the probe independently reports the
same digest. Unknown, duplicate, or other runtime-added container variables
reject. The image was previously loaded and re-inspected under the retained
BuildkitProducerResultV1;
the local reference must resolve without pulling to the exact manifest digest
and proved config/layers. The invocation has no bind mount, volume, device,
secret, capability, host namespace, writable root, or network. Its only writable
storage is the bounded tmpfs above; its only input is stdin and its only output
is stdout.

The port exposes no consumer validation, promotion, upload, shell, arbitrary
argv, alternate entrypoint, mount, network, or second-call method. It is not
serializable and is not the later consumer-side
`ReleaseRuntimeHostAdmissionCapabilityV1` / `executeVerifiedOciRuntime`
capability path from release-readiness.model.md. Its sole call consumes the
one-shot budget before process creation and can never be reissued, including
after failure.

Entry into controller_invoking invokes one closed host orchestration actor. That
actor consumes the one-shot port and calls invokeProducerProbe exactly once
before it starts exactly one fixed producer-finalizer process. The port starts
the proved image by exact manifest digest and fixed entrypoint with the closed
FrozenProducerProbeInputV1, owns and joins the child, and returns one typed
ProducerProbeReceiptV1. Only after the host validates that receipt does it pass
the receipt's exact JCS bytes and retained frozen-dist, report,
controller-bundle, BuildKit/SLSA, execution-authority, and normalized-OCI
descriptors into the one finalizer process. The process receives no live port
or callback. The finalizer cannot return success without byte-equal probe
evidence; zero, two, optional, simulated, host-native, alternate Docker
argv/env, mount-bearing, networked, or consumer-port invocations reject.

The finalizer process contract is closed. The host exclusively creates empty
`PRODUCER_PATHS.finalizerCwd`, `PRODUCER_PATHS.finalizerHome`, and
`PRODUCER_PATHS.finalizerStaging` directories with mode 0700, fsyncs their
parents, opens them descriptor-relatively, and proves the staging tree has zero
entries. Before process creation it also serializes exactly one
`ProducerFinalizerAuthorityBundleV1` to
`PRODUCER_PATHS.finalizerAuthorityBundle` with O_CREAT | O_EXCL, mode 0400,
fsync(file), fsync(parent), and no-follow recapture. `bundleSha256` omits only
itself. The immutable-source authority and complete ordered pre-finalizer
source-derived command receipts
are the same validated values retained by admission; their authority/set
digests equal every local-gate, build and packaged-MV3 subvalue. The candidate
and those three receipts are the already validated complete values; their
standalone RFC 8785 JCS byte digests
equal their adjacent fields and their byte lengths are respectively bounded by
`RELEASE_LIMITS.maxCandidateIdentityJcsBytes`,
`maxFinalizerLocalGateJcsBytes`, `maxFinalizerBuildReceiptJcsBytes`, and
`maxFinalizerMv3GateReceiptJcsBytes`. The complete bundle is at most
`maxFinalizerAuthorityBundleBytes`, and its correlation is exact. A blob
reference, omitted command/source receipt, alternate serializer, or digest-only
substitute is invalid. The host retains this file's descriptor. The finalizer
spawn is itself one ordered immutable-source command receipt; its only writable
staging/output descriptors resolve beneath declared output mounts. To avoid a
self-digest cycle, that post-exit receipt is appended to the handoff completion
set after the finalizer output and seal validate; the seal and controller
receipt bind the complete pre-finalizer set. It executes exactly
`PRODUCER_PATHS.ownedNode`, without a shell, with this three-token argv:

```text
{expanded PRODUCER_PATHS.ownedNode}
/proc/self/fd/6
produce-sealed-candidate-v1
```

The current working directory is exactly expanded
`PRODUCER_PATHS.finalizerCwd`. The complete environment is exactly:

```text
HOME={expanded PRODUCER_PATHS.finalizerHome}
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
```

`PATH`, `NODE_OPTIONS`, `NODE_PATH`, package-manager variables, proxy values,
credentials, GitHub variables, Docker variables and every undeclared variable
are absent. stdin, stdout and stderr are three owned pipes at descriptors 0, 1
and 2. Immediately before `execve`, the parent duplicates the already retained
no-follow source/staging/authority descriptors to exactly FDs 3 through 13 in the tuple
order of `ProducerFinalizerInputEnvelopeV1`. It revalidates every descriptor
identity after duplication, deliberately clears `FD_CLOEXEC` on exactly 3..13,
and closes or leaves `FD_CLOEXEC` set on every other inherited FD above 2.
The child is a new process-group leader. There is no pathname reopen, ambient
descriptor, inherited socket, callback or alternate FD number.

The parent serializes one exact `ProducerFinalizerInputEnvelopeV1` as RFC 8785
JCS. `inputSha256` omits only itself. Its authority-bundle byte count and
`finalizerAuthorityBundleSha256` equal the complete retained FD 13 file bytes;
that raw file digest is distinct from the bundle's validated one-field-omission
`bundleSha256`. Its four component digests equal the validated values inside
that bundle. Each descriptor binding's
`identitySha256` hashes the full captured
device/inode/type/mode/size/timestamps/content-or-tree identity, and the ordered
tuple is exact. `deadlineAt` is the earlier of the producer attempt deadline
and the trusted-wall projection of 120,000 ms from finalizer start. The parent
writes the JCS bytes plus exactly one LF to stdin, at most
`maxControllerEnvelopeBytes`, handles partial writes, then closes stdin; EOF
before/after those exact bytes, a second value, BOM, CR or extra whitespace is
invalid. The finalizer reads source inputs only descriptor-relatively from
3..11 and 13. FD 13 must parse as the exact bundle bound by stdin before any
candidate byte is consumed. It may create only the one literal
`/proc/self/fd/12/missionpulse-sealed-candidate` with `O_CREAT|O_EXCL`, mode 0600. It cannot create a sibling, subdirectory, link or special object.

stdout must be exactly RFC 8785 JCS of one
`ProducerFinalizerOutputEnvelopeV1` plus one LF and at most
`maxControllerStdoutBytes`; stderr must be empty on success and is drained and
bounded by `maxControllerStderrBytes` on every outcome. `outputSha256` omits
only itself. The host validates the schema/version, exact input/invocation
identity, all scalar digests, the complete `ControllerProducerReceiptV1`, and
the sole staged file before accepting an output. The output intentionally does
not repeat authority, inventory, seal, or ZIP-receipt bytes: the host derives
those complete values from the captured transport and the canonical ZIP
validator below, then requires their JCS digests to equal the envelope and
controller receipt. A syntactically valid envelope does not authorize a
transition without that descriptor and cross-digest proof.

One non-resetting monotonic timer enforces that fixed deadline. On deadline,
stdout/stderr overflow, pipe/protocol failure, or parent cancellation, the host
closes stdin, sends SIGTERM to the entire finalizer process group, waits at most
5,000 ms, sends SIGKILL to the group if any member remains, drains both bounded
pipes, and `waitpid`-joins the leader. On ordinary exit it likewise drains,
waitpid-joins and proves no group member remains. No success event exists until
exit code 0, complete output validation and that join all hold. A signal,
timeout, unjoined descendant, unknown process disposition or cleanup failure
produces no controller result and leaves staging private for the local cleanup
actor; it is never inferred as cancellation or success.

There is no start/continue/finalize protocol, daemon, externally reachable
socket, second finalizer exec, callback, or assumption that a controller
survives. The local XState actor receives either one complete private result
after process exit or one failure.

```ts
interface CapturedTransportV1 {
  path: string; // exactly expanded PRODUCER_PATHS.transport
  basename: 'missionpulse-sealed-candidate';
  bytes: number;
  sha256: Sha256;
  mode: '0600';
  device: string;
  inode: string;
  ctimeNs: string;
  mtimeNs: string;
  descriptorToken: object; // private, frozen, nonserializable authority
}

interface ControllerProducerReceiptV1 {
  schema: 'missionpulse.controller-producer-receipt';
  version: 1;
  receiptSha256: Sha256;
  invocationId: string;
  actorId: string;
  releaseId: string;
  sourceCommit: string;
  runId: string;
  runAttempt: number;
  candidateJcsSha256: Sha256;
  immutableSourceExecutionAuthoritySha256: Sha256;
  releaseCommandReceiptSetSha256: Sha256;
  auditReceiptJcsSha256: Sha256;
  executionAuthorityJcsSha256: Sha256;
  payloadInventoryJcsSha256: Sha256;
  testedDistSealJcsSha256: Sha256;
  transportZipReceiptJcsSha256: Sha256;
  transportSha256: Sha256;
  transportBytes: number;
  packagedMv3ReceiptSha256: Sha256;
  producerProbeReceiptSha256: Sha256;
  startedAt: CanonicalUtcTimestamp;
  completedAt: CanonicalUtcTimestamp;
}

interface ControllerProducerResultV1 {
  authority: ReleaseExecutionAuthorityV1;
  inventory: SealedCandidatePayloadInventoryV1;
  seal: TestedDistSealV1;
  transport: CapturedTransportV1;
  receipt: ControllerProducerReceiptV1;
}
```

`ProducerFinalizerInputEnvelopeV1.inputSha256`,
`ProducerFinalizerOutputEnvelopeV1.outputSha256`, and
`ControllerProducerReceiptV1.receiptSha256` are SHA-256 over JCS of their
complete containing values with exactly their respective self-digest omitted.
`ProducerFinalizerAuthorityBundleV1.bundleSha256` follows the same one-field
omission rule. Every other JCS digest is over the complete validated value. This
construction is acyclic: the receipt binds the final transport receipt and
bytes; neither transport nor seal embeds ControllerProducerReceiptV1.

The finalizer writes only into the exact fresh private staging directory opened
as FD 12. The prior
producer-port image child can write only to its private tmpfs and stdout under
the probe contract above. The finalizer's stdout is exactly the closed
`ProducerFinalizerOutputEnvelopeV1` plus one LF; successful stderr is empty.
Transport bytes remain in a retained staging-file descriptor and are
represented in the envelope only by relative name, size, digest, and transport
ZIP receipt digest. After the finalizer
exits 0 and its child is joined, the host:

1. captures the complete staging tree no-follow and requires exactly the one
   regular file `missionpulse-sealed-candidate` with mode 0600 and no extra
   entry;
2. parses the authority, six-entry inventory and seal from the sole captured
   transport, recomputes the complete canonical transport ZIP receipt from
   those bytes, and validates all seven transport components and every
   cross-digest against the output and controller receipt;
3. requires the complete transport-extracted authority to byte-equal the FD 10
   authority passed into the invocation and validates the mandatory
   ProducerProbeReceiptV1 against the consumed port ID, manifest digest, fixed
   entrypoint, invocation ID, input, output, chronology, and child exit;
4. proves the producer port's invocation budget is exhausted exactly once;
5. publishes the transport no-replace to PRODUCER_PATHS.transport and retains
   the recaptured final descriptor;
6. constructs the private CapturedTransportV1 from that final descriptor;
7. constructs ControllerProducerResultV1 only after all validation passes.

Step 5 is the sole transport publication in the entire producer. It uses one
O_CREAT | O_EXCL write from the retained staging descriptor, fsync(file),
fsync(parent), and a no-follow descriptor recapture. captureProducerHandoff is
not permitted to create, rename, copy, truncate, or replace transport. It only
revalidates the already published descriptor against CapturedTransportV1 and
then exclusively publishes PRODUCER_PATHS.handoff and the four untrusted output
leads. An existing transport before publication step 5, or an attempted second
publication at handoff capture, rejects.

An exit, signal, timeout, extra stdout/stderr, partial result, missing file,
extra file, changed descriptor, or invalid component yields no
ControllerProducerResultV1. Partial staging output is never a candidate and is
never exposed to the saga.

### 7.2 Same-dist packaged MV3 host gate

Before the first command, captureProducerToolMaterials has already installed
the content-authorized Chromium and FFmpeg archives into the owned Playwright
root and retained their receipts. There is no `playwright install`,
`--with-deps`, apt invocation, browser download, or mutable cache access in the
gate. The ubuntu-24.04 runner image is an explicit TCB for shared libraries; a
read-only `ldd` closure check rejects a missing or not-found dependency but
cannot install one.

Before the finalizer invocation and before execution-image construction, the
local host-gate actors perform all release-relevant gates and builds in the
following exact relative order from the repository root:

```text
1. {ownedNode} {ownedPnpmCli} format:check
2. {ownedNode} {ownedPnpmCli} lint
3. {ownedNode} {ownedPnpmCli} typecheck
4. {ownedNode} {ownedPnpmCli} test
5. {ownedNode} {ownedPnpmCli} --filter @pulse/extension verify-manifest src/manifest.json
6. {ownedNode} {ownedPnpmCli} --filter @pulse/ui build
7. {ownedNode} {ownedPnpmCli} --filter @pulse/extension build
8. {ownedNode} {ownedPnpmCli} --filter @pulse/extension verify-manifest dist/manifest.json --post-build
9. {ownedNode} {ownedPnpmCli} --filter @pulse/extension exec playwright test --config=playwright.mv3.config.ts --reporter=json --output={playwrightOutput}
10. {ownedNode} {ownedPnpmCli} --filter @pulse/extension verify-manifest dist/manifest.json --post-build
```

Each brace expands before argv construction to the two absolute,
descriptor-retained, digest-authorized paths in ToolMaterialsReceiptV1; no shell
tokenizes the tuple. All ten commands use the closed host-gate environment in
section 5. Each command has exactly one parent-exported
`ImmutableGitSourceCommandReceiptV1` captured through the stop-before-exec and
full-descendant-join protocol. Commands 1-5 read source and write only declared
dependency/cache/report mounts; command 6 writes only its explicit dependency/
report outputs; command 7 is the sole producer of the separate dist mount;
commands 8-10 cannot write source or dist and write only report/profile roots.
The local, build and packaged-MV3 receipts bind the same immutable-source
authority and their exact ordered receipt subsets. The build receipt's
`producingCommandReceiptSha256` is command 7 and no other receipt may name a
dist-producing output. For command 9 only, that map is extended by exactly these three
variables:

```text
PLAYWRIGHT_JSON_OUTPUT_FILE={playwrightRaw}
PLAYWRIGHT_BROWSERS_PATH={ownedPlaywrightRoot}
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

The lockfile must resolve @playwright/test and playwright-core exactly 1.61.1.
The installed Chromium authority is exactly revision 1228 and browser version
149.0.7827.55; the installed FFmpeg authority is exactly revision 1011. These
identifiers are expectations joined to the committed runtime-material policy,
not authority obtained from playwright-core/browsers.json. The provisioning
receipt captures, for both archives and executables, the policy digest, literal
initial/final URL, retained descriptor, absolute owned path, byte count,
SHA-256, executable mode, revision, and safe extraction inventory. Chromium's
descriptor and digest are revalidated immediately before browser launch and
after the suite; FFmpeg's are revalidated before and after the suite whether or
not a scenario invokes it.

The extension production build count is exactly one: command 7. The UI package
build is a prerequisite and does not increment that extension count. Commands
test:mv3, test:e2e:extension, pnpm build, package lifecycle aliases, hooks, or
any command capable of rebuilding the extension are forbidden after command 7.
The Playwright-only command must not have a webServer, global setup, project
dependency, fixture, or child process that invokes a build.

Immediately after command 8, the host-gate actor opens apps/extension/dist
descriptor-relatively without following links. It retains a descriptor for the
root and every entry and records, for every directory and regular file, device,
inode, type, mode, size, ctime nanoseconds, mtime nanoseconds, and file SHA-256.
It also records the canonical tree receipt and exact manifest bytes. The MV3
harness loads only that exact absolute dist path.

After Playwright exits, every retained descriptor is fstat'd, the full path tree
is recaptured, and all identities, metadata, bytes, hashes, manifest bytes, and
the canonical tree must equal the pre-suite observation. Deletion/recreation,
same-byte rewrite, chmod-and-restore, new entry, missing entry, symlink, or root
replacement therefore rejects. Command 10 is read-only and its result must
match command 8.

The JSON report is exactly PRODUCER_PATHS.playwrightRaw, a regular no-follow
file at most 67,108,864 bytes. Playwright auxiliary output is exactly
PRODUCER_PATHS.playwrightOutput, at most 20,000 entries and 536,870,912 total
regular-file bytes, with no link or special object. The derived bounded JCS
receipt is exactly PRODUCER_PATHS.packagedMv3Receipt. It requires the
parent-imported exact ordered thirteen V2 expected scenario IDs to equal the
executed IDs byte-for-byte, passed count `13`, and zero skipped, failed,
retried or runtime-diagnostic findings. It also requires the approved
MV3-revision-26 and packaged-tab-revision-11 authority projections, including their
six distinct review/implementation/verification receipt digests, and the exact
candidate/audit joint activation digest. Those three values are copied
byte-for-byte into `PackagedMv3GateReceiptV1`; its expected blob and array
digests equal the candidate and parent constants. It additionally binds the
Playwright/Chromium/FFmpeg authorities, all ten exact commands and outcomes,
extension build count 1, and exact pre/post dist observations.

That paragraph is the post-activation production path. Inside the joint phase,
the same derived assertions emit only
`JointPackagedMv3VerificationEvidenceV1` with
`authorityMode:'verification_only'`, phase ID, frozen tree and exact
`implementedModelAuthoritySetSha256`. Its scenarios terminate `verified_only`;
it contains no verification receipt digest, verified set, candidate ID,
activation digest or `PackagedMv3GateReceiptV1` schema and cannot be passed to
the readiness controller. Its digest is one input to the producer-slot
`JointModelVerificationEvidenceV1`; only the independent parent verifier may
consume that evidence and issue the later verification receipt. After
activation the producer reruns the complete suite and creates fresh release
evidence; it never converts or copies the sandbox receipt.

## 8. Local handoff

```ts
interface ProducerRunCorrelationV1 {
  repository: string;
  workflowPath: '.github/workflows/ci.yml';
  workflowJobId: 'seal-candidate';
  eventName: 'workflow_dispatch';
  sourceRef: 'refs/heads/main';
  headSha: string;
  runId: string;
  runAttempt: number;
  actorId: string;
  releaseId: string;
}

interface ProducerHandoffV1 {
  schema: 'missionpulse.sealed-candidate-producer-handoff';
  version: 1;
  handoffSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  sourceWorkspaceMaterializationSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  sourceWorkspaceCompletionReceipt: GitExecutionWorkspaceCompletionReceiptV1 & {
    phase: 'local_handoff';
  };
  candidateJcsSha256: Sha256;
  readinessActor: {
    actorId: string;
    state: 'rc_built';
    expectedCatalogRevision: number;
    reservedCatalogRevision: number;
    reservationRecordSha256: Sha256;
    constructionReceiptSha256: Sha256;
    constructionReceipt: ReleaseReadinessActorConstructionReceiptV1;
    auditedContextSha256: Sha256;
    rcSealIngestionReceiptSha256: Sha256;
    rcSealIngestionReceipt: ReleaseReadinessRcSealIngestionReceiptV1;
    rcBuiltContextSha256: Sha256;
  };
  auditReceiptJcsSha256: Sha256;
  testedDistSealJcsSha256: Sha256;
  controllerReceipt: ControllerProducerReceiptV1;
  transport: {
    path: string;
    basename: 'missionpulse-sealed-candidate';
    bytes: number;
    sha256: Sha256;
    mode: '0600';
    device: string;
    inode: string;
    ctimeNs: string;
    mtimeNs: string;
  };
  localCapturedAt: CanonicalUtcTimestamp;
}
```

handoffSha256 is SHA-256 over JCS with exactly handoffSha256 omitted. The
handoff deliberately does not duplicate the potentially large candidate,
audit, or seal JCS bytes. Their three digests must equal the complete values in
the exact durable readiness actor named by the two embedded receipts; the
controller receipt must bind the same candidate, audit, and seal digests.
The full immutable-source authority validates independently and is byte-equal
to admission and the tested-dist seal. Its digest equals the completion receipt
and every nested local/build/MV3 receipt. The completion receipt embeds the
exact ordered nonempty command receipts through local capture; each pre/post
mount and capability observation matches that authority and the set digest is
recomputed rather than trusted.
Both embedded readiness receipts must pass their self-digests,
domain-separated catalog signatures, request/idempotency correlation, state
transition and context/catalog CAS guards. Their receipt digests equal the
adjacent scalar fields; construction yields the audited context, and seal
ingestion consumes that exact context and yields the handoff's rc-built context.

The builder writes exactly four GITHUB_OUTPUT fields:

```text
producer-handoff-path={expanded PRODUCER_PATHS.handoff}
producer-handoff-sha256={handoffSha256}
transport-path={expanded PRODUCER_PATHS.transport}
transport-sha256={transport.sha256}
```

These fields are convenience leads only. No later step trusts them. Every later
validator independently requires the literal expanded path, opens handoff and
transport no-follow, recomputes both digests, validates all correlation fields,
and compares descriptor metadata to the handoff. A malicious, truncated,
duplicated, multiline, escaped, or alternate GITHUB_OUTPUT value rejects.

## 9. Crash-consistent intra-job GitHub Actions saga

### 9.1 Snapshots and states

```ts
type ProducerSagaState =
  | 'awaiting_local_handoff'
  | 'local_handoff_verified'
  | 'attestation_in_flight'
  | 'attestation_verified'
  | 'upload_in_flight'
  | 'uploaded_digest_verified'
  | 'failed'
  | 'cancelled';

type RemoteEffectKnowledge = 'none' | 'possible' | 'confirmed';
type SagaStepOutcome = 'success' | 'failure' | 'cancelled' | 'skipped';
type ProducerReservationDisposition =
  | 'unreserved'
  | 'active_producer'
  | 'active_for_consumer'
  | 'abandoned'
  | 'reconciliation_required';

interface ValidatedAttestationActionV1 {
  schema: 'missionpulse.validated-attestation-action';
  version: 1;
  evidenceSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  handoffSha256: Sha256;
  transportSha256: Sha256;
  transportBytes: number;
  actionUsesLiteral: 'actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6';
  actionOutcome: 'success';
  actionOutput: {
    attestationId: string;
    attestationUrl: string;
    storageRecordIds: null | '';
  };
  sigstoreBundleJcsBase64: string;
  sigstoreBundleJcsSha256: Sha256;
  sigstoreBundleJcsBytes: number;
  signedAttestation: GitHubTransportAttestationV1;
  validatedAt: CanonicalUtcTimestamp;
}

interface ProducerSagaErrorV1 {
  schema: 'missionpulse.sealed-candidate-producer-saga-error';
  version: 1;
  errorSha256: Sha256;
  code: ProducerSagaErrorCode;
  correlation: ProducerRunCorrelationV1;
  stateAtFailure: Exclude<ProducerSagaState, 'failed' | 'cancelled'>;
  priorSagaSnapshotSha256: Sha256;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  causeSha256: Sha256 | null;
  retryable: false;
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerReservationDispositionRequestV1 {
  schema: 'missionpulse.producer-reservation-disposition-request';
  version: 1;
  requestSha256: Sha256;
  idempotencyKey: string; // exactly `sha256:${requestSha256}`
  operation: 'record-disposition';
  expectedCatalogRevision: number;
  reservationRecordSha256: Sha256;
  candidateJcsSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  priorSagaSnapshotSha256: Sha256 | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  requestedDisposition: 'active_for_consumer' | 'abandoned' | 'reconciliation_required';
  requestedReason:
    'producer-upload-joined' | 'proved-no-remote-effect' | 'remote-effect-possible-or-confirmed';
  readinessMutation:
    | {
        kind: 'none';
        expectedContextSha256: Sha256;
      }
    | {
        kind: 'block-and-abandon';
        expectedContextSha256: Sha256;
        blockerEventSha256: Sha256;
        error: ReleaseReadinessError;
      };
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerReservationReadRequestV1 {
  schema: 'missionpulse.producer-reservation-read-request';
  version: 1;
  requestSha256: Sha256;
  idempotencyKey: string; // exactly `sha256:${requestSha256}`
  operation: 'read';
  expectedCatalogRevision: number;
  candidateJcsSha256: Sha256 | null;
  correlation: ProducerRunCorrelationV1;
  priorSagaSnapshotSha256: Sha256 | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  requestedDisposition: 'unreserved' | 'active_producer' | 'reconciliation_required';
  requestedReason: 'no-reservation-created' | 'producer-terminal-missing-after-deadline';
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerReservationDispositionReceiptV1 {
  schema: 'missionpulse.producer-reservation-disposition';
  version: 1;
  receiptSha256: Sha256;
  catalogPortPolicySha256: Sha256;
  requestSha256: Sha256;
  idempotencyKey: string;
  operation: 'record-disposition' | 'read';
  reservationRecordSha256: Sha256 | null;
  candidateJcsSha256: Sha256 | null;
  correlation: ProducerRunCorrelationV1;
  priorCatalogRevision: number;
  resultingCatalogRevision: number;
  catalogJcsSha256: Sha256;
  terminalCatalogSequence: number | null;
  disposition: ProducerReservationDisposition;
  priorSagaSnapshotSha256: Sha256 | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  reason:
    | 'no-reservation-created'
    | 'producer-upload-joined'
    | 'proved-no-remote-effect'
    | 'remote-effect-possible-or-confirmed'
    | 'producer-terminal-missing-after-deadline';
  readinessMutation:
    | {
        kind: 'none';
        contextSha256: Sha256 | null;
      }
    | {
        kind: 'block-and-abandon';
        priorContextSha256: Sha256;
        resultingContextSha256: Sha256;
        priorState: 'audited' | 'rc_built';
        resultingState: 'blocked';
        blockerEventSha256: Sha256;
      };
  recordedAt: CanonicalUtcTimestamp;
  issuer: 'missionpulse-release-catalog';
  keyId: string;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}

interface ReservationReconciliationReceiptV1 {
  schema: 'missionpulse.reservation-reconciliation-receipt';
  version: 1;
  receiptSha256: Sha256;
  issuer: string;
  keyId: string;
  externalReceiptPolicySha256: Sha256;
  reservationRecordSha256: Sha256;
  candidateJcsSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  workflowRunConclusion: 'success' | 'failure' | 'cancelled' | 'timed_out';
  attestationObservation:
    | { status: 'absent'; queryReceiptSha256: Sha256 }
    | { status: 'present'; id: string; subjectSha256: Sha256; queryReceiptSha256: Sha256 };
  artifactObservation:
    | { status: 'absent'; queryReceiptSha256: Sha256 }
    | {
        status: 'present';
        id: string;
        artifactSha256: Sha256;
        artifactBytes: number;
        queryReceiptSha256: Sha256;
      };
  conclusiveAbsenceHorizonAt: CanonicalUtcTimestamp;
  decision: 'artifact_matches' | 'both_conclusively_absent' | 'partial_or_ambiguous';
  expectedCatalogRevision: number;
  observedAt: CanonicalUtcTimestamp;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}

interface DerivedDirectUploadAuthorityV1 {
  schema: 'missionpulse.derived-direct-upload-authority';
  version: 1;
  authoritySha256: Sha256;
  handoffSha256: Sha256;
  transportAttestationPolicySha256: Sha256;
  workflowBlobSha256: Sha256;
  privilegedJobProjectionSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  stepId: 'upload';
  actionUsesLiteral: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
  inputs: {
    name: 'missionpulse-sealed-candidate';
    pathExpression: '${{ steps.verify-attestation.outputs.transport-path }}';
    archive: false;
    overwrite: false;
    retentionDays: 30;
    ifNoFilesFound: 'error';
  };
  directUpload: true;
  requestedRetentionDays: 30;
}

interface ArtifactPublicationJoinV1 {
  schema: 'missionpulse.sealed-candidate-artifact-publication-join';
  version: 1;
  joinSha256: Sha256;
  priorSagaSnapshotSha256: Sha256;
  handoffSha256: Sha256;
  attestationId: string;
  attestationBundleSha256: Sha256;
  actionOutput: {
    artifactId: string;
    artifactUiUrl: string;
    artifactDigest: Sha256;
  };
  derived: DerivedDirectUploadAuthorityV1;
  transportSha256: Sha256;
  transportBytes: number;
  joinedAt: CanonicalUtcTimestamp;
}

type DirectUploadActionJoinV1 = ArtifactPublicationJoinV1;

interface SagaCancellationReceiptV1 {
  schema: 'missionpulse.sealed-candidate-saga-cancellation';
  version: 1;
  receiptSha256: Sha256;
  cancellationActorId: 'recordProducerSagaCancellation';
  correlation: ProducerRunCorrelationV1;
  priorSagaSnapshotSha256: Sha256;
  githubCancelledPredicate: true;
  localDisposition:
    | {
        kind: 'never_started';
        buildOutcome: 'skipped';
        localCleanupReceiptSha256: null;
      }
    | {
        kind: 'cooperatively_cleaned';
        buildOutcome: 'cancelled' | 'failure';
        localCleanupReceiptSha256: Sha256;
      }
    | {
        kind: 'transport_captured';
        buildOutcome: 'success';
        localCleanupReceiptSha256: null;
        handoffSha256: Sha256;
      };
  stepOutcomes: {
    initializeSaga: 'success';
    build: SagaStepOutcome;
    prepareAttestation: SagaStepOutcome;
    attest: SagaStepOutcome;
    verifyAttestation: SagaStepOutcome;
    upload: SagaStepOutcome;
    verifyUpload: SagaStepOutcome;
  };
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  observedAt: CanonicalUtcTimestamp;
}

interface ProducerSagaSnapshotV1 {
  schema: 'missionpulse.sealed-candidate-producer-saga-snapshot';
  version: 1;
  snapshotSha256: Sha256;
  sequence: number;
  previousSnapshotSha256: Sha256 | null;
  state: ProducerSagaState;
  correlation: ProducerRunCorrelationV1;
  handoffSha256: Sha256 | null;
  transportSha256: Sha256 | null;
  transportBytes: number | null;
  remoteAttestation: RemoteEffectKnowledge;
  remoteArtifact: RemoteEffectKnowledge;
  attestation: null | {
    id: string;
    url: string;
    bundleSha256: Sha256;
    bundleBytes: number;
    subjectName: 'missionpulse-sealed-candidate';
    subjectSha256: Sha256;
  };
  artifact: ArtifactPublicationJoinV1 | null;
  reservationDisposition: ProducerReservationDisposition;
  reservationDispositionReceiptSha256: Sha256 | null;
  observedAt: CanonicalUtcTimestamp;
  failureCode: ProducerSagaErrorCode | null;
}

interface ProducerTerminalEnvelopeV1 {
  schema: 'missionpulse.sealed-candidate-producer-terminal-envelope';
  version: 1;
  envelopeSha256: Sha256;
  correlation: ProducerRunCorrelationV1;
  sourceWorkspaceMaterializationSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  terminalSourceWorkspaceCompletionReceipt: GitExecutionWorkspaceCompletionReceiptV1 & {
    phase: 'terminal_publication';
  };
  readinessActor: {
    actorId: string;
    state: 'rc_built';
    rcBuiltContextSha256: Sha256;
    rcSealIngestionReceiptSha256: Sha256;
  };
  handoff: ProducerHandoffV1;
  snapshots: readonly [ProducerSagaSnapshotV1, ...ProducerSagaSnapshotV1[]];
  terminalSnapshotSha256: Sha256;
  terminalDispositionReceipt: ProducerReservationDispositionReceiptV1;
  publicationJoin: ArtifactPublicationJoinV1;
  completedAt: CanonicalUtcTimestamp;
}

interface PublishProducerTerminalRequestV1 {
  schema: 'missionpulse.publish-producer-terminal-request';
  version: 1;
  requestSha256: Sha256;
  idempotencyKey: string; // exactly `sha256:${requestSha256}`
  envelopeJcsBase64: string;
  envelopeSha256: Sha256;
  envelopeBytes: number;
  correlation: ProducerRunCorrelationV1;
  publishedAt: CanonicalUtcTimestamp;
}

interface ProducerTerminalPublicationReceiptV1 {
  schema: 'missionpulse.producer-terminal-publication-receipt';
  version: 1;
  receiptSha256: Sha256;
  catalogPortPolicySha256: Sha256;
  requestSha256: Sha256;
  idempotencyKey: string;
  envelopeSha256: Sha256;
  envelopeBytes: number;
  terminalSnapshotSha256: Sha256;
  publicationJoinSha256: Sha256;
  immutableUri: string;
  correlation: ProducerRunCorrelationV1;
  recordedAt: CanonicalUtcTimestamp;
  issuer: 'missionpulse-release-catalog';
  keyId: string;
  signedPayloadSha256: Sha256;
  signatureAlgorithm: 'ed25519';
  signatureBase64: string;
}

interface ProducerTerminalRecordV1 {
  schema: 'missionpulse.producer-terminal-record';
  version: 1;
  recordSha256: Sha256;
  envelopeJcsBase64: string;
  envelopeSha256: Sha256;
  envelopeBytes: number;
  publicationReceipt: ProducerTerminalPublicationReceiptV1;
}
```

The terminal bounds are constructive rather than aspirational. A terminal
envelope admits at most one 4,194,304-byte handoff, eight 1,048,576-byte
snapshots, one 1,048,576-byte publication join, one 1,048,576-byte disposition
receipt, and 1,048,576 bytes for all remaining JCS structure; its independent
hard cap is 16,777,216 bytes. The request/record caps of 25,165,824 bytes cover
canonical Base64 expansion of that maximum envelope plus at most one
1,048,576-byte publication receipt and 1,048,576 bytes of wrapper structure.
Every component and the complete containing value must pass both its component
cap and containing cap before allocation or signing.

authoritySha256, joinSha256, evidenceSha256, errorSha256, and every
receiptSha256 are each SHA-256 over RFC 8785 JCS of their complete containing
value with only the corresponding self-digest field omitted. The validated
attestation evidence's Base64 is canonical padded RFC 4648, decodes to exactly
`sigstoreBundleJcsBytes` bounded by `maxAttestationBundleBytes`, reproduces the
bundle digest, and its complete signed-attestation projection is re-derived
from those bytes rather than trusted. Every catalog requestSha256 is SHA-256 over JCS with
requestSha256 and idempotencyKey omitted; idempotencyKey is then exactly
`sha256:{requestSha256}`. For each catalog disposition/read
receipt, signedPayloadSha256 and its Ed25519 signature use the exact catalog
receipt domain and omission set defined in section 3.2; its signature key and
catalogPortPolicySha256 must match the committed port policy.

`ProducerTerminalEnvelopeV1.envelopeSha256` omits only itself. Its snapshots
are the complete bounded saga directory, not a filtered projection: sequence
starts at zero, is gapless, each previous digest links exactly, every snapshot
correlation is identical, and the last unique snapshot is
`uploaded_digest_verified`. `terminalSnapshotSha256` equals that last
snapshot's digest; `publicationJoin` is byte-for-byte equal to its sole non-null
artifact; the join's prior snapshot digest names the immediately preceding
`upload_in_flight` snapshot. `handoff` is the complete exact JCS handoff already
validated by `LOCAL_HANDOFF_VALIDATED`; its self-digest equals every non-null
snapshot handoff digest and the join's handoff digest. Its candidate, audit,
seal and readiness actor are reloaded through the signed receipt chain and
their digests are compared with the handoff and controller receipt; its
controller receipt and transport are revalidated rather than projected. The
envelope's readiness actor values equal that handoff and
the signed rc-seal receipt. Both workspace completion receipts reproduce the
same source materialization, immutable-source execution authority, commit/tree,
equal pre/post protected-source projection and matching mount/capability
observations. The terminal receipt's ordered command-receipt set is an exact
prefix-preserving extension of the handoff receipt through every subsequently
executed saga command; it contains no command whose cwd or loaded project byte
came from the ambient checkout. Its `completedAt` equals the last snapshot's
`observedAt`. `terminalDispositionReceipt` is the complete signed
active_for_consumer/producer-upload-joined receipt whose self-digest equals the
terminal snapshot's disposition digest; it has remote effects confirmed and no
readiness mutation. Zero/extra snapshots, a fork, a nonterminal last state,
another terminal, a partial handoff, a projected join, or a RUNNER_TEMP path as
consumer authority rejects before publication.

`PublishProducerTerminalRequestV1` contains canonical padded Base64 of those
exact envelope JCS bytes. Its byte count and digest are independently
recomputed; its request digest/idempotency use the two-field omission rule in
section 3.2. The terminal key is exactly the tuple
`{actorId,runId,runAttempt}` from the envelope correlation. The service stores
one immutable `ProducerTerminalRecordV1` under that key with exclusive
no-replace semantics, durably commits both record and signed receipt before
returning, and rejects any divergent replay forever. Before signing, it loads
the exact durable rc-built actor and re-runs the closed envelope, handoff,
chain, join, correlation and self-digest guards above; authenticated producer
OIDC identity alone cannot make hostile bytes authoritative. The exact
immutable URI is the committed origin plus
`/v1/catalog/producer-terminals/{percentEncode(actorId)}/{runId}/{runAttempt}`;
percent encoding uses uppercase RFC 3986 hex and is required only for bytes
outside the unreserved set. No producer or consumer supplies a URI.

`ProducerTerminalPublicationReceiptV1.receiptSha256` omits only itself.
`signedPayloadSha256` is SHA-256 over
`ASCII("missionpulse.producer-terminal-publication.v1") || 0x00 ||
JCS(receipt with receiptSha256, signedPayloadSha256, signatureAlgorithm and
signatureBase64 omitted)`, and Ed25519 signs those same domain-separated bytes.
`ProducerTerminalRecordV1.recordSha256` omits only itself; its decoded envelope
must byte-equal the published JCS and its receipt must revalidate under the
candidate-bound catalog key. A public read returns exactly this record as RFC
8785 JCS with media type
`application/vnd.missionpulse.producer-terminal.v1+json`, content length within
25,165,824 bytes, ETag `"sha256:{recordSha256}"`, immutable cache control, no
credential and no redirect. TLS SPKI, origin, path, keys and response bound come
only from `candidate.producerTerminalReadAuthority`.

For ReservationReconciliationReceiptV1, signedPayloadSha256 is the SHA-256 of
`missionpulse.reservation-reconciliation.v1\x00` followed by RFC 8785 JCS of
the receipt with receiptSha256, signedPayloadSha256, signatureAlgorithm, and
signatureBase64 omitted. The Ed25519 signature covers those exact
domain-separated bytes and must validate under externalReceiptPolicySha256.

The pure deriveDirectUploadAuthority guard derives
DerivedDirectUploadAuthorityV1 only from the exact handoff correlation,
CandidateIdentityV1 transport policy, committed workflow bytes, closed
privileged-job projection, pinned upload action, and the six literal action
inputs. No producer provider API observation supplies directUpload or
requestedRetentionDays. Both are authorized workflow-input facts only. The
consumer later observes provider retention, expiry, and bytes under its own
authority.

`ArtifactPublicationJoinV1` above is the one common producer/consumer wire
type. `DirectUploadActionJoinV1` is only an exact alias for older producer prose
and cannot add, remove or reinterpret a field. The pure joinDirectUploadAction
guard creates `ArtifactPublicationJoinV1` only
when all of these independent authorities join:

1. handoff and prior saga snapshot have identical repository, workflow path,
   job ID seal-candidate, run ID, run attempt, head SHA, actor, release, and
   transport digest;
2. the candidate policy's exact workflow blob and privileged-job projection
   contain the upload step, its pinned action, literal inputs, and step order;
3. the already validated Sigstore attestation binds repository, main ref,
   signer workflow ref/SHA, run ID, run attempt, head SHA, subject name, and
   transport digest to that handoff; it does not infer a GitHub job ID;
4. the action-output artifact ID, UI URL, and digest pass their own strict
   grammars but remain observations;
5. action-output, attestation-subject, freshly recaptured transport, controller
   receipt, handoff, and saga transport digests are all equal.

The workflow path and job ID therefore come from the handoff plus committed
policy; run attempt comes from handoff plus authenticated attestation; direct
upload and requested retention come from committed action inputs and pinned
action semantics; artifact ID, UI URL, and digest are hostile action outputs
accepted only by their grammars and cross-digest join. Provider-side artifact
bytes, expiry, timestamps, and API identity are explicit consumer obligations,
not producer claims.

The crash-consistent intra-job saga is a second XState machine with only these
typed events:

```ts
type ProducerSagaEvent =
  | { type: 'LOCAL_HANDOFF_VALIDATED'; handoff: ProducerHandoffV1 }
  | { type: 'ATTESTATION_AUTHORIZED'; transportSha256: Sha256 }
  | { type: 'ATTESTATION_VALIDATED'; evidence: ValidatedAttestationActionV1 }
  | { type: 'UPLOAD_AUTHORIZED'; evidence: ValidatedAttestationActionV1 }
  | {
      type: 'UPLOAD_VALIDATED';
      evidence: ArtifactPublicationJoinV1;
      reservation: ProducerReservationDispositionReceiptV1;
    }
  | {
      type: 'SAGA_FAILED';
      error: ProducerSagaErrorV1;
      reservation: ProducerReservationDispositionReceiptV1;
    }
  | {
      type: 'SAGA_CANCELLED';
      receipt: SagaCancellationReceiptV1;
      reservation: ProducerReservationDispositionReceiptV1;
    };
```

| State                  | Event                   | Required durable effect                                                                                                         | Next state               |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| awaiting_local_handoff | LOCAL_HANDOFF_VALIDATED | append exact handoff/transport correlation                                                                                      | local_handoff_verified   |
| local_handoff_verified | ATTESTATION_AUTHORIZED  | append conservative remoteAttestation=possible                                                                                  | attestation_in_flight    |
| attestation_in_flight  | ATTESTATION_VALIDATED   | append validated local Sigstore-bundle evidence                                                                                 | attestation_verified     |
| attestation_verified   | UPLOAD_AUTHORIZED       | append conservative remoteArtifact=possible                                                                                     | upload_in_flight         |
| upload_in_flight       | UPLOAD_VALIDATED        | require active_for_consumer catalog receipt; append exact action-output/attestation/local digest equality                       | uploaded_digest_verified |
| any nonterminal        | SAGA_FAILED             | require unreserved, abandoned, or reconciliation_required catalog receipt; append typed failure and conservative remote effects | failed                   |
| any nonterminal        | SAGA_CANCELLED          | require unreserved, abandoned, or reconciliation_required catalog receipt; append exact validated cancellation receipt          | cancelled                |

Every unlisted pair rejects without mutation. Each transition action appends
and recaptures its immutable snapshot before XState accepts the resulting
private event. The setup has fixed invoked-actor IDs initializeProducerSaga,
prepareTransportAttestation, verifyTransportAttestation, prepareDirectUpload,
verifyDirectUpload, recordProducerSagaCancellation, and
reconcileProducerSaga. SAGA_CANCELLED is accepted only from the registered
recordProducerSagaCancellation invocation for the current actor/run/attempt and
prior snapshot.

The initial awaiting_local_handoff snapshot uses
reservationDisposition=unreserved and a null receipt digest because the build
has not yet invoked admission. LOCAL_HANDOFF_VALIDATED requires the handoff's
exact `readinessActor` block, independently reloads that actor at the bound
`rcBuiltContextSha256`, and moves subsequent snapshots to active_producer with
reservationDispositionReceiptSha256 equal to
handoff.readinessActor.constructionReceiptSha256.
Before a terminal event is emitted, the registered validator obtains exactly
one catalog disposition receipt. It recaptures and revalidates the receipt
already named by LocalCleanupReceiptV1 when local cleanup closed the
reservation; otherwise it invokes ExternalReleaseCatalogPortV1 exactly once
with the known reservation or exact run
correlation, last nonterminal snapshot digest, conservative remote-effect
values, and terminal intent. The returned receipt must be authenticated,
self-digested, CAS-monotonic, and cross-bound to all inputs:

- uploaded_digest_verified requires active_for_consumer and reason
  producer-upload-joined;
- failed or cancelled with both remote effects none requires abandoned and
  reason proved-no-remote-effect;
- failed or cancelled with either remote effect possible or confirmed requires
  reconciliation_required and reason remote-effect-possible-or-confirmed;
- failed or cancelled before reservation requires unreserved, a null
  reservationRecordSha256, and reason no-reservation-created; the catalog port
  must prove no matching reservation exists for actor/run/attempt.

For active_for_consumer and reconciliation_required, `readinessMutation.kind`
is `none` and its context digest must equal the still-current audited or
rc-built actor; neither classification mutates readiness state. For abandoned,
it is exactly `block-and-abandon`: `error` is the typed producer failure,
`blockerEventSha256` is the canonical `BLOCKERS_INGESTED` local-event digest,
and one combined controller transaction context-CASes the actor from audited or
rc_built to blocked **and** catalog-CAS-appends candidate_abandoned. The receipt
binds both prior/resulting context digests and the catalog revision/sequence.
Neither half may commit alone. An unreserved read receipt has
`readinessMutation={kind:"none",contextSha256:null}` because no actor was
published. Thus local cleanup can never leave an audited/rc-built actor backed
by an abandoned reservation.

The terminal snapshot embeds only that receipt's digest, avoiding a digest
cycle. The complete signed receipt remains durable and retrievable at the
external catalog service. A catalog conflict, OIDC/TLS/signature failure, or
unavailable disposition port emits no terminal event and leaves the externally
durable reservation active. No local file can abandon, replace, or silently
expire a reservation.

snapshotSha256 is SHA-256 over JCS with exactly snapshotSha256 omitted.
Sequence starts at zero, increments by one, and binds the prior digest. Snapshot
filenames are exactly four decimal sequence digits, a hyphen, the state, and
.json. The saga directory contains no mutable current pointer. A reader lists,
bounds, sorts, opens, and validates the entire chain.

Each snapshot is at most 1,048,576 bytes; the chain has at most eight snapshots.
Snapshots use exclusive no-follow creation and file plus directory fsync. A
state transition is committed only after recapture proves the exact bytes.
State is reconstructed from the last valid snapshot only while the same job
and RUNNER_TEMP filesystem remain available, never from step outcome text or
output variables. Runner loss destroys this reconstruction source and yields
no cross-job producer classification by itself.

Immediately after the `uploaded_digest_verified` snapshot is fsynced and the
entire chain is recaptured, the still-registered `verifyDirectUpload` actor
constructs the one `ProducerTerminalEnvelopeV1` and calls
`publishProducerTerminal`. It returns success to the workflow step only after
the no-replace `ProducerTerminalRecordV1` and signed publication receipt are
retrievable byte-for-byte and revalidated. The receipt is deliberately not
inserted into another saga snapshot, avoiding an envelope/receipt digest cycle.
If publication times out, conflicts, or cannot be authenticated, the local
terminal snapshot may exist but `verify-upload` fails and no consumer may use
it. The ordinary `reconcile-saga` step then validates that exact local terminal,
records a signed conservative `reconciliation_required` disposition with both
remote effects confirmed, writes no later snapshot and keeps the workflow
failed. This covers both absent publication and commit/response ambiguity; a
record that actually committed remains independently discoverable and can be
validated by the consumer, but no producer success is inferred from an
unvalidated response. A cross-job producer success therefore means the signed
terminal record exists and was revalidated, not merely that a local XState
terminal or GitHub action output existed.

### 9.2 Exact workflow topology

The future workflow_dispatch interface has exactly four required string inputs:
release-id, expected-catalog-revision, audit-evidence-sha256, and
audit-evidence-bytes. The latter three numeric/digest forms must be canonical;
release-id uses the fixed ID grammar. They are hostile leads and cannot bypass
the signed audit envelope or catalog CAS. actorId is derived internally as
`producer:{runId}:{runAttempt}` and is never an input.

The future seal-candidate job remains runs-on ubuntu-24.04,
timeout-minutes 45, with exactly:

```yaml
permissions:
  attestations: write
  contents: read
  id-token: write
```

This exactly matches the parent clarification-11 authority once that exact hash
is independently approved. actions:read and every
other implicit or explicit permission are absent. id-token:write authorizes the
pinned attestation action and the exact audience-restricted external catalog
credential broker; it grants neither a reusable token nor an unmodelled
endpoint. The producer does not call a GitHub artifact or attestation REST API.
Provider-side observation belongs to the separately authorized consumer;
adding it here would require a new parent model review before START.

The same committed workflow may contain the parent model's separately projected
read-only `test-mv3` diagnostic job. It grants only `contents: read`; its
`upload-mv3-evidence` step uses
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, exact
condition `always()`, name
`missionpulse-mv3-evidence-${{ github.run_id }}-${{ github.run_attempt }}`,
path `output/playwright/`, `if-no-files-found:error`, `overwrite:false`, and
`retention-days:14`. That ordinary archived diagnostic output is never direct
upload, candidate transport, handoff, signed subject or saga input. The
privileged-job projection explicitly excludes it while the complete workflow
policy separately requires it; its existence grants no additional permission,
step or artifact name to `seal-candidate`.

The full privileged job projection is closed and ordered. It contains the
existing SHA-pinned checkout only to expose the repository object database; no
later command reads its working-tree bytes. It then performs Node setup and
pnpm setup in that exact order. Node setup has only
`node-version: ${{ env.NODE_VERSION }}` with exact
value 22.23.1; its cache input is absent. pnpm setup then observes that exact
Node, and has exact inputs version `${{ env.PNPM_VERSION }}` and dest
`${{ runner.temp }}/missionpulse-bootstrap-pnpm`. The projection then contains the
committed run steps below, then exactly these two remote-effect actions:

```text
actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6
actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
```

No reusable workflow, matrix, service, container action, local action, tag,
branch, shortened SHA, expression-based uses, extra privileged action, or
unmodelled step is allowed.

Before materialization, setup actions have no source/backing mount at all. The
controller then makes the outer job execution namespace expose only the same
recursively read-only source view while hiding the backing tree. Attestation and
upload action children inherit that outer read-only mount, empty capability
sets and `no_new_privs`; they receive only their modeled writable
state/transport roots. Project run blocks additionally enter the command-scoped
launcher/seccomp boundary and produce the ordered receipts. Neither a pinned
action nor a cancellation/finalizer path can remount, chmod, link, symlink,
replace or shadow a tracked path.

After exact toolchain verification, the fixed Git-object port materializes the
complete commit in its controller-only backing tree and constructs the separate
recursively read-only execution source at
`${RUNNER_TEMP}/missionpulse-git-execution/source`. The frozen install and every
build/test/saga command run inside that immutable source view with only the five
declared output mounts, empty capabilities and the inherited namespace/seccomp
boundary; the ambient checkout and backing tree are inaccessible. The saga
steps are:

1. initialize-saga: a committed validator creates sequence 0000 in
   awaiting_local_handoff;
2. build: invokes the local actor once and stops permanently at
   transport_captured;
3. prepare-attestation: validates all four builder outputs, handoff, transport,
   candidate, audit, seal, workflow correlation, and appends
   local_handoff_verified followed by attestation_in_flight; it emits only
   validated subject-name, subject-digest, handoff digest, and transport digest;
4. attest: the pinned action creates the remote attestation;
5. verify-attestation: runs with
   always() && !cancelled() && steps.prepare-attestation.outcome == 'success';
   validates action outcome and outputs, appends attestation_verified followed
   by upload_in_flight, and re-emits the recaptured transport path/digest;
6. upload: runs only when verify-attestation emitted upload-authorized=true;
7. verify-upload: runs with
   always() && !cancelled() && steps.upload.outcome != 'skipped', validates
   action outcome and all outputs, appends uploaded_digest_verified, then
   publishes and revalidates the complete externally durable producer terminal
   record before the step may succeed;
8. record-cancellation: runs only under the exact GitHub cancelled() predicate
   below, invokes recordProducerSagaCancellation, and appends cancelled only
   after its receipt passes the closed guard in section 9.4;
9. reconcile-saga: runs with always() && !cancelled(), validates the chain and,
   when a prior ordinary failure has no terminal snapshot, appends failed with
   the conservative remote-effect knowledge implied by the last state; when the
   local terminal exists but its external terminal publication was not
   revalidated, it performs only the signed reconciliation-required disposition
   above and cannot relabel or extend that local terminal.

The six conditional expressions are exact workflow bytes:

```yaml
attest:
  if: ${{ steps.prepare-attestation.outputs.attest-authorized == 'true' }}
verify-attestation:
  if: ${{ always() && !cancelled() && steps.prepare-attestation.outcome == 'success' }}
upload:
  if: ${{ steps.verify-attestation.outputs.upload-authorized == 'true' }}
verify-upload:
  if: ${{ always() && !cancelled() && steps.upload.outcome != 'skipped' }}
record-cancellation:
  if: ${{ cancelled() && steps.initialize-saga.outcome == 'success' }}
  timeout-minutes: 1
  continue-on-error: false
reconcile-saga:
  if: ${{ always() && !cancelled() }}
```

Each committed project run block uses the exact content-authorized
`PRODUCER_PATHS.immutableSourceLauncher` as its GitHub Actions `shell`, with the
generated script pathname passed only through the launcher's fixed `{0}` slot,
and exact
`working-directory: ${{ runner.temp }}/missionpulse-git-execution/source`.
The launcher opens that bounded generated script no-follow before entering the
namespace, requires its exact bytes/SHA-256 to equal the single committed
workflow-policy run-block selected by `commandPlanSha256`, retains the
descriptor, creates/validates the private namespace and stop-before-exec
receipt, then executes `/bin/bash --noprofile --norc -euo pipefail` against that
descriptor inside the closed boundary. A pathname, later rewrite or
GitHub-provided script without this byte equality has no command authority.
There is no unconfined project shell. Each block contains exactly one quoted
invocation. The
materialization/bootstrap step alone runs before that root exists and is a
separately content-authorized fixed controller invocation over Git objects. No
step-derived value is interpolated into shell source:

```text
initialize-saga:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" initialize --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"

build:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/build-sealed-candidate-transport.ts" --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state" --output "$RUNNER_TEMP/missionpulse-sealed-candidate" --handoff "$RUNNER_TEMP/missionpulse-sealed-candidate-state/producer-handoff.json" --release-id "$RELEASE_ID" --expected-catalog-revision "$EXPECTED_CATALOG_REVISION" --audit-evidence-sha256 "$AUDIT_EVIDENCE_SHA256" --audit-evidence-bytes "$AUDIT_EVIDENCE_BYTES" --github-output "$GITHUB_OUTPUT"

prepare-attestation:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" prepare-attestation --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state" --github-output "$GITHUB_OUTPUT"

verify-attestation:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" verify-attestation --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state" --github-output "$GITHUB_OUTPUT"

verify-upload:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" verify-upload --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"

record-cancellation:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" record-cancellation --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"

reconcile-saga:
"$RUNNER_TEMP/missionpulse-git-execution/source/node_modules/.bin/tsx" "$RUNNER_TEMP/missionpulse-git-execution/source/apps/extension/scripts/sealed-candidate-saga.ts" reconcile --state-root "$RUNNER_TEMP/missionpulse-sealed-candidate-state"
```

The only dynamic workflow-context environment projections are:

```yaml
build:
  env:
    RELEASE_ID: ${{ inputs.release-id }}
    EXPECTED_CATALOG_REVISION: ${{ inputs.expected-catalog-revision }}
    AUDIT_EVIDENCE_SHA256: ${{ inputs.audit-evidence-sha256 }}
    AUDIT_EVIDENCE_BYTES: ${{ inputs.audit-evidence-bytes }}
prepare-attestation:
  env:
    BUILDER_HANDOFF_PATH: ${{ steps.build.outputs.producer-handoff-path }}
    BUILDER_HANDOFF_SHA256: ${{ steps.build.outputs.producer-handoff-sha256 }}
    BUILDER_TRANSPORT_PATH: ${{ steps.build.outputs.transport-path }}
    BUILDER_TRANSPORT_SHA256: ${{ steps.build.outputs.transport-sha256 }}
verify-attestation:
  env:
    ATTEST_STEP_OUTCOME: ${{ steps.attest.outcome }}
    ATTESTATION_ID: ${{ steps.attest.outputs.attestation-id }}
    ATTESTATION_URL: ${{ steps.attest.outputs.attestation-url }}
    ATTESTATION_BUNDLE_PATH: ${{ steps.attest.outputs.bundle-path }}
    ATTESTATION_STORAGE_RECORD_IDS: ${{ steps.attest.outputs.storage-record-ids }}
verify-upload:
  env:
    UPLOAD_STEP_OUTCOME: ${{ steps.upload.outcome }}
    UPLOAD_ARTIFACT_ID: ${{ steps.upload.outputs.artifact-id }}
    UPLOAD_ARTIFACT_URL: ${{ steps.upload.outputs.artifact-url }}
    UPLOAD_ARTIFACT_DIGEST: ${{ steps.upload.outputs.artifact-digest }}
record-cancellation:
  env:
    GITHUB_CANCELLED_PREDICATE: ${{ cancelled() }}
    INITIALIZE_SAGA_STEP_OUTCOME: ${{ steps.initialize-saga.outcome }}
    BUILD_STEP_OUTCOME: ${{ steps.build.outcome }}
    PREPARE_ATTESTATION_STEP_OUTCOME: ${{ steps.prepare-attestation.outcome }}
    ATTEST_STEP_OUTCOME: ${{ steps.attest.outcome }}
    VERIFY_ATTESTATION_STEP_OUTCOME: ${{ steps.verify-attestation.outcome }}
    UPLOAD_STEP_OUTCOME: ${{ steps.upload.outcome }}
    VERIFY_UPLOAD_STEP_OUTCOME: ${{ steps.verify-upload.outcome }}
reconcile-saga:
  env:
    BUILD_STEP_OUTCOME: ${{ steps.build.outcome }}
    PREPARE_ATTESTATION_STEP_OUTCOME: ${{ steps.prepare-attestation.outcome }}
    ATTEST_STEP_OUTCOME: ${{ steps.attest.outcome }}
    VERIFY_ATTESTATION_STEP_OUTCOME: ${{ steps.verify-attestation.outcome }}
    UPLOAD_STEP_OUTCOME: ${{ steps.upload.outcome }}
    VERIFY_UPLOAD_STEP_OUTCOME: ${{ steps.verify-upload.outcome }}
```

Every such value is bounded and parsed as hostile input before filesystem or
network use. GITHUB_OUTPUT is the runner-provided file-command descriptor and
is used only by build, prepare-attestation, and verify-attestation as shown.

That `GITHUB_OUTPUT` assertion is scoped exactly to committed `run` steps in the
projected workflow. The inspector requires every project-authored shell/Node
command that opens or names `$GITHUB_OUTPUT` to be one of those three steps and
to emit only its closed output key set. It does not pretend that a pinned
JavaScript `uses` action lacks GitHub's internal file-command channel. The
reviewed `actions/attest` and `actions/upload-artifact` capabilities may expose
only their documented action outputs; the exact
`steps.attest.outputs.{attestation-id,attestation-url,bundle-path,storage-record-ids}`
and `steps.upload.outputs.{artifact-id,artifact-url,artifact-digest}` expressions
listed above are permitted as bounded hostile observations. They cannot be
treated as project run-step writes, omitted from the privileged projection, or
accepted as transition authority without their corresponding validator. Any
additional project-run output key or additional action-output expression is a
workflow-policy divergence.

GitHub also injects ACTIONS_ID_TOKEN_REQUEST_URL and
ACTIONS_ID_TOKEN_REQUEST_TOKEN when and only when id-token:write is effective.
Those two sensitive runner-service variables are not workflow-context
projections and never enter a YAML env block. Among project-authored `run`
commands, only the catalog credential-broker modules inside build,
verify-upload, record-cancellation, and reconcile-saga may read them; they
immediately enforce the bounded one-use `missionpulse-release-catalog` behavior
in section 3.2 and remove both variables from every Node/pnpm, Buildx, browser,
Docker probe, finalizer, and controller child environment. Separately, the
reviewed pinned `actions/attest` JavaScript action may use the runner's internal
OIDC descriptors only for its exact `nobody` and `sigstore` audiences. It is not
a project catalog broker, cannot receive or forward a catalog token, and shares
no token response with project commands. The committed workflow-policy
projection binds these disjoint capability consumers, the exact catalog
origin/audience in the committed policy, the four dispatch inputs, and the four
build env expressions. Any other project command, action, audience, request URL
forwarding, or bearer reuse fails closed.

initialize-saga, prepare-attestation, verify-attestation, verify-upload,
record-cancellation, and reconcile-saga are separate committed commands with a
60,000 ms internal deadline. They do not import builder process memory. A
validator may append two snapshots in one process only in the exact order
above, fsyncing and recapturing the first before creating the second.

The attestation action inputs are exactly:

```yaml
subject-name: missionpulse-sealed-candidate
subject-digest: sha256:${{ steps.prepare-attestation.outputs.transport-sha256 }}
show-summary: false
```

No subject-path, subject-checksums, SBOM, custom predicate, registry push,
storage record, or alternate token input is present. With no custom predicate
input, the pinned action's provenance mode must produce predicate type
https://slsa.dev/provenance/v1.

The upload action inputs are exactly:

```yaml
name: missionpulse-sealed-candidate
path: ${{ steps.verify-attestation.outputs.transport-path }}
archive: false
overwrite: false
retention-days: 30
if-no-files-found: error
```

archive:false requires exactly one regular file, uploads it directly, derives
the artifact name from its basename, and makes artifact-digest the digest of
those exact bytes. The explicit name remains required by workflow policy even
though the pinned action ignores it in direct-upload mode.

transport-attestation-policy.v1.json, the embedded workflow blob and SHA-256,
the privileged-job projection SHA-256, and workflow-policy.ts must all be
regenerated from this exact future YAML. The policy parser must require every
step ID, order, if expression, shell, env key, run argv, permission, action SHA,
action input, and output expression above. Unknown input defaults are not
accepted as equivalent. Until the YAML and all policy hashes agree, START fails
with producer.admission.workflow-policy-divergent.

### 9.3 Validation of untrusted action outputs

prepare-attestation reopens the handoff and transport no-follow, recomputes
their bytes and digests, and retains descriptors through completion. It emits
attest-authorized=true only after appending attestation_in_flight.

verify-attestation treats steps.attest.outcome, attestation-id,
attestation-url, and bundle-path as untrusted strings. Success requires:

- action outcome success and no empty, multiline, overlong, or malformed output;
- attestation-id is one positive canonical decimal ASCII value;
- attestation-url is exactly
  https://github.com/{owner}/{repository}/attestations/{attestation-id};
- bundle-path expands to one absolute RUNNER_TEMP descendant, but the validator
  opens it no-follow and accepts only the captured descriptor bytes;
- the bundle is at most 16,777,216 bytes and strictly parses as one Sigstore
  bundle;
- DSSE, Fulcio chain, Rekor inclusion material, trusted root, OIDC issuer,
  repository, main ref, signer workflow ref/SHA, run, attempt, head SHA, subject
  name, subject digest, and SLSA v1 predicate all validate against the
  CandidateIdentityV1 transport policy; the GitHub job ID is not inferred from
  this bundle.

The action output URL and ID are recorded only after local Sigstore-bundle
validation and exact output correlation. Storage-record-ids must be absent or
empty. The producer makes no GitHub REST request and does not claim external
discoverability; that is the consumer's independent obligation. The transport
is reopened and rehashed again before upload-in-flight is appended. The step
emits upload-authorized=true, transport-path, and transport-sha256 only from
this recapture.

verify-upload treats steps.upload.outcome, artifact-id, artifact-url, and
artifact-digest as untrusted. Success requires:

- action outcome success;
- one canonical positive decimal artifact ID;
- action-output artifact UI URL exactly
  https://github.com/{owner}/{repository}/actions/runs/{runId}/artifacts/{id};
- artifact digest exactly 64 lowercase hex;
- deriveDirectUploadAuthority independently proves workflow path, job ID, run
  attempt, archive:false, requested retention 30, overwrite:false, path
  expression, if-no-files-found:error, and exact action pin from the handoff and
  committed policy;
- joinDirectUploadAction requires the upload output, freshly recomputed
  transport, handoff, attested subject, controller receipt, and captured
  pre-action digests all to be exactly equal.

Only the complete ArtifactPublicationJoinV1 may be placed in the terminal
snapshot and only then may uploaded_digest_verified be appended. That terminal
means the pinned action reported success and its digest joined to the exact
local bytes; it does not claim provider-side re-download, expiry, retention, or
API visibility. An action success without that validator is a failure. An
action failure after invocation is classified with a possible remote effect;
it is never silently retried.

### 9.4 Reachable cancellation and runner loss

GitHub's cancelled() expression is only the workflow scheduler predicate that
makes the record-cancellation step eligible. It is not a saga event, cleanup
receipt, terminal state, or proof that a running process stopped.

When that exact step starts, recordProducerSagaCancellation:

1. requires GITHUB_CANCELLED_PREDICATE=true,
   INITIALIZE_SAGA_STEP_OUTCOME=success, exact run correlation, and the
   candidate's committed workflow policy containing this step and condition;
2. loads and recaptures the complete immutable saga chain, requires its last
   state to be nonterminal, and acquires the single exclusive saga-writer lock;
3. strictly parses all seven prior step outcomes as terminal SagaStepOutcome
   values and accepts exactly one local disposition:
   - never_started: build is skipped, the saga is awaiting_local_handoff, and
     no local lease, handoff, transport, staging object, or cleanup receipt
     exists;
   - cooperatively_cleaned: build is cancelled or failure, the exact
     no-follow LocalCleanupReceiptV1 exists at
     PRODUCER_PATHS.localCancellationReceipt, names this run/attempt, and proves
     the local actor reached its own cancelled terminal after every child and
     Buildx resource stopped;
   - transport_captured: build is success, the exact handoff and transport
     recapture, the local actor already terminated at transport_captured, and
     no local child or writer lease remains;
4. derives remoteAttestation and remoteArtifact from the last fsynced intra-job
   state and
   prior action outcomes without ever downgrading none/possible/confirmed or
   treating an unvalidated action output as confirmed;
5. constructs the self-digested SagaCancellationReceiptV1, emits the private
   SAGA_CANCELLED event, appends the cancelled snapshot, fsyncs it, and
   recaptures the complete chain before releasing the writer lock.

If the saga is already uploaded_digest_verified, failed, or cancelled, the
actor validates that terminal snapshot and performs no transition. If any local
disposition is ambiguous, a writer may still be alive, a cleanup receipt is
missing, or the actor itself is stopped, it emits no event and writes no
terminal snapshot.

For `uploaded_digest_verified`, "no transition" does not suppress the separate
reconcile-saga catalog disposition required after an unvalidated terminal-store
publication. That branch writes no saga snapshot and never turns publication
ambiguity into producer success.

The three cancellation notions are therefore distinct:

- **GitHub cancelled()** only schedules the exact bounded cancellation actor;
- **cooperative cancellation** is an observed local CANCEL_REQUESTED plus a
  durable cleanup receipt, or an already terminated/never-started local actor
  proven by the other two closed dispositions;
- **runner kill, force-cancel, machine loss, or job timeout** may prevent the
  record-cancellation step or its fsync from completing. RUNNER_TEMP is then
  unavailable and the producer emits no terminal state or later reconstructed
  classification. Consumers reject the absence of the signed external
  `ProducerTerminalRecordV1` plus their own authenticated provider evidence,
  even if GitHub later reports a successful action.

reconcile-saga is mutually exclusive with record-cancellation because its exact
condition contains !cancelled(). Neither actor deletes or overwrites a possible
or confirmed remote attestation or artifact.

## 10. Authority graph and invariants

The normative graph is:

```text
exact commit + required policies + externally fetched authenticated audit envelope
  -> constructProducerAdmissionV2
  -> atomic audited readiness actor + CandidateIdentityV1 + AuditReceiptV1 + catalog reservation
  -> content-authorized Node, pnpm, Playwright, Chromium and FFmpeg
  -> exact local gates
  -> one exact UI prerequisite build + one exact extension production build
  -> same-dist packaged MV3 receipt + frozen dist descriptors
  -> content-authorized Python and Buildx materials
  -> one controller source bundle
  -> exact Buildx v0.34.1 / BuildKit v0.30.0 build
  -> raw bounded SLSA v0.2 metadata projection + attached Statement/v0.1/SLSA v1
  -> semantic projection join + honest host material projection
  -> normalized one-manifest OCI
  -> ReleaseExecutionAuthorityV1
  -> one closed finalizer-controller invocation + mandatory producer image-port probe
  -> six-entry SealedCandidatePayloadInventoryV1
  -> TestedDistSealV1
  -> canonical seven-component transport
  -> ControllerProducerReceiptV1
  -> controller CAS-ingested RC_SEAL_INGESTED + durable state rc_built
  -> ProducerHandoffV1
  -> local terminal transport_captured
  -> crash-consistent intra-job saga attestation verification
  -> direct upload verification
  -> local saga terminal uploaded_digest_verified
  -> immutable ProducerTerminalEnvelopeV1 + signed external ProducerTerminalRecordV1
```

The six non-self payload entries are exactly, in canonical order:

```text
build-metadata.json
build-provenance.json
dist
release-controller.bundle.mjs
release-execution-authority.json
release-execution-image.oci.tar
```

The transport adds tested-dist-seal.json as its seventh logical component. It
does not contain the local handoff, controller producer receipt as an extra
file, saga snapshot, GitHub action output, attestation bundle, artifact receipt,
wrapper archive, sidecar, mutable journal, credential, or provider metadata.
The controller producer receipt is carried by the private handoff and binds the
transport; it does not alter the established transport inventory.

Always-valid invariants:

1. one source commit, one candidate, one catalog reservation, one controller
   bundle, one Buildx builder, one execution image, one controller invocation,
   one extension build, one dist, one seal, one transport;
2. Core purity and Shell ownership from AGENTS.md remain intact;
3. every model transition is driven by a typed event and pure guard;
4. no LLM emits a transition event or decides a guard;
5. local success stops at transport_captured;
6. local saga success is only uploaded_digest_verified; cross-job success also
   requires the signed immutable producer terminal record;
7. every intra-job cross-step authority is fsynced JCS plus recaptured bytes,
   never process liveness, and makes no runner-loss durability claim;
8. action outputs are observations validated by committed code;
9. the upload action digest equals the attested, handoff, controller, and
   transport digests; provider bytes remain a consumer proof;
10. exactly one actor performs exactly one no-replace transport publication;
    handoff capture cannot publish transport;
11. every catalog mutation or nonmutating disposition is authorized by one
    audience-restricted OIDC request and one externally durable signed receipt;
12. producer authority never grants Chrome Web Store submission authority.

## 11. Failure, cancellation, interruption, and retry

```ts
type ProducerSagaErrorCode =
  | 'producer.admission.invalid-request'
  | 'producer.admission.source-invalid'
  | 'producer.admission.audit-missing'
  | 'producer.admission.audit-invalid'
  | 'producer.admission.evidence-channel-invalid'
  | 'producer.admission.policy-missing'
  | 'producer.admission.policy-invalid'
  | 'producer.admission.workflow-policy-divergent'
  | 'producer.admission.catalog-conflict'
  | 'producer.admission.catalog-port-invalid'
  | 'producer.tool-material-invalid'
  | 'producer.buildx-topology-invalid'
  | 'producer.build-metadata-invalid'
  | 'producer.oci-invalid'
  | 'producer.controller-invalid'
  | 'producer.execution-probe-invalid'
  | 'producer.rc-seal-ingestion-invalid'
  | 'producer.mv3-dist-drift'
  | 'producer.transport-invalid'
  | 'producer.handoff-invalid'
  | 'producer.attestation-failed'
  | 'producer.attestation-invalid'
  | 'producer.upload-failed'
  | 'producer.upload-invalid'
  | 'producer.terminal-publication-invalid'
  | 'producer.digest-divergent'
  | 'producer.deadline-exceeded'
  | 'producer.cleanup-ambiguous';
```

The GitHub job hard deadline is 45 minutes. The local actor deadline is exactly
attemptStartedAt + 2,100,000 ms and must be no later than
attemptDeadlineAt - 600,000 ms. Every local child receives the smaller of its
fixed stage budget and the remaining local budget. Saga validators each receive
60,000 ms but never extend the fixed job deadline. The request's logical
attemptDeadlineAt cannot extend the runner's independently enforced earlier
hard stop. If runner setup already consumed part of the job budget, an earlier
kill yields no producer terminal state, never a fabricated success,
cancellation, or reconstructed interruption state.

Local CANCEL_REQUESTED is cooperative only while the local process can observe
it. An observed SIGTERM may be translated to runner_sigterm, but local
cancelled is reachable only after all children stop, Buildx cleanup completes,
descriptors close, no ambiguous staging or published transport remains, and
LocalCleanupReceiptV1 is durable. Saga cancelled is separately reachable only
through the exact record-cancellation step and SagaCancellationReceiptV1 guard
in section 9.4. GitHub cancelled() merely makes that step eligible. A process
kill, force-cancel, machine loss, runner loss, or job timeout can prevent either
receipt or snapshot from being written; this producer then emits no terminal
classification rather than inventing cancelled.

Remote effects are tracked separately:

| Last fsynced intra-job state | remoteAttestation | remoteArtifact |
| ---------------------------- | ----------------- | -------------- |
| awaiting_local_handoff       | none              | none           |
| local_handoff_verified       | none              | none           |
| attestation_in_flight        | possible          | none           |
| attestation_verified         | confirmed         | none           |
| upload_in_flight             | confirmed         | possible       |
| uploaded_digest_verified     | confirmed         | confirmed      |

failed and cancelled preserve the conservative values implied by the last
fsynced state. The attestation is a remote side effect even before any artifact
exists. No value is reconstructed after runner loss.

No failure path deletes, overwrites, replaces, hides, or cleans up a remote
attestation or artifact.

The producer does not add a fourth catalog record kind or mutate the approved
parent catalog model. The externally durable controller-global catalog exposed
only through ExternalReleaseCatalogPortV1 still permits only:

```text
candidate_reserved -> candidate_abandoned
candidate_reserved -> artifact_published
```

ProducerReservationDisposition is a typed view over those records, not a new
catalog state. active_producer, active_for_consumer, and
reconciliation_required all retain the same active candidate_reserved record:
the first two differ only by a validated local terminal intent, but
active_for_consumer grants no consumer authority until the matching signed
external producer terminal record exists;
reconciliation_required is the fail-closed interpretation of an active record
after failure, cancellation, runner loss, attemptDeadlineAt, or any possible or
confirmed remote effect. For these nonmutating observations,
priorCatalogRevision equals resultingCatalogRevision. Only abandoned appends
candidate_abandoned, advances the catalog revision by one, and carries that
record's exact non-null terminalCatalogSequence. Every unreserved,
active_producer, active_for_consumer, or reconciliation_required receipt has a
null terminalCatalogSequence. No deadline transition infers remote absence or
abandons automatically.

Closing reconciliation requires one signed external-receipt-policy.v1.json
compatible ReservationReconciliationReceiptV1 produced outside this job by the
consumer authority. It binds reservation, candidate, run/attempt, exact
authenticated attestation and artifact queries, all discovered IDs/digests,
the policy's conclusive-absence horizon, and a CAS catalog revision. Matching
artifact evidence with its matching attestation lets the existing consumer
append artifact_published; conclusive policy-authorized absence of both lets
the controller append candidate_abandoned. A present attestation with an
absent artifact, any partial_or_ambiguous decision, or an unsigned, stale,
pre-deadline, or ambiguous absence receipt leaves the active reservation
blocked and cannot close reconciliation.

A retry uses a new runAttempt, actor ID, state root, builder name, and saga. It
may reserve the same version/release namespace only after the prior reservation
is durably abandoned; active_producer, reconciliation_required,
active_for_consumer, or consumed blocks it. Otherwise the retry must use a new
independently authorized greater version/release namespace. It never silently
mints a fresh reservation or reuses a prior handoff, snapshot, attestation
output, artifact output, local builder, controller result, or published path.

## 12. Required hostile verification

Implementation remains forbidden until tests prove at least:

- START rejects caller-supplied candidate/audit values, wrong commit, worktree
  substitution, pre-existing runtime audit files, missing/unsigned audit
  envelope, wrong Ed25519 issuer/key/signature, receipt/report digest drift,
  missing signature policies, stale connector authority, workflow drift, and
  catalog conflict;
- audit evidence rejects a Git-committed/self-referential envelope, alternate
  origin/path, redirect, private address, TLS-SPKI drift, bad media type,
  ETag/cache-control/size/hash mismatch, wrong self-digest omission set, stale
  expiry, or candidate/release/source divergence;
- the local machine has no attesting or uploading state and cannot transition
  after transport_captured;
- LOCAL_STAGE_FAILED can reach only cleaning_failure/failed, CANCEL_REQUESTED
  can reach only cancelling/cancelled, and cross-kind cleanup receipts reject;
- no controller process liveness or cross-step IPC is required;
- zero, duplicate, retried, arbitrary-entrypoint, host-native, or consumer-port
  image probes reject, and only one mandatory producer-port probe can complete;
- partial, duplicate, replayed, or second ControllerProducerResultV1 values
  reject;
- Node or pnpm source/owned tree, entrypoint size/digest, absolute path, policy
  digest, version output, closed parent environment, PATH order, or descendant
  executable drift rejects before the first local gate;
- Python archive/Dockerfile/two-file context/runtime-tree/executable drift,
  runner `PATH`, `setup-python`, `PULSE_RELEASE_PYTHON`, YAML version-only proof
  or any still-invocable legacy `3.14.6` release path rejects before execution-
  image or Python-dependent effects;
- Buildx binary size/digest/exact three-token version-and-revision output,
  BuildKit manifest/version, builder name,
  node count, driver, platform, create/build/remove argv, flag order, env, and
  context mutations reject;
- missing, extra, malformed, or truncated BuildKit metadata, a missing or wrong
  image.name, metadata that is not the exact SLSA v0.2 predicate projection,
  raw `_type` other than Statement/v0.1, raw predicate other than SLSA v1,
  semantic-projection drift, dishonest completeness, fabricated raw materials,
  and every subject/recipe mutation reject;
- missing or altered expected provenance attestation, SBOM, third OCI
  descriptor, nested index, alternate platform, missing/wrong artifactType or
  subject, nonempty/wrong-media-type attestation config, annotation drift, and a
  normalizer that drops anything except the already validated provenance
  descriptor set reject;
- Playwright 1.61.1, Chromium revision 1228/version 149.0.7827.55, FFmpeg
  revision 1011, archive URL/size/digest, executable path/size/digest, owned
  browser root, reporter path, bounds, scenario inventory, and browser
  executable mutations reject;
- `scenarios.v1.json`, schema/version 1, V1 bytes under the V2 path, a mixed
  inventory, any change to the exact thirteen-ID order/count/blob/array hash,
  missing/drifted committed model blob, wrong tuple or receipt role, or absent
  joint activation rejects before actor construction and before any catalog
  mutation;
- omission, reordering, aliasing, environment drift, or nonzero outcome of any
  of the ten local-gate commands rejects, including source-manifest authority
  at apps/extension/src/manifest.json before the sole extension build;
- a missing/non-authorized producer-controller entrypoint, raw-command YAML
  mirror, command-plan hash mismatch or terminal receipt set not produced by
  that exact controller attempt rejects; the current absent
  `scripts/build-sealed-candidate-transport.ts` remains an explicit RED case;
- every command fails before exec when the source mount or any addressable
  ancestor is writable, recursive read-only is absent, the backing path/FD is
  exposed, an overlay exists, or a writable mount is unknown, late, nested,
  overlapping, nonempty, tracked, or shadows a source/module/test/config path;
- a project child that can resolve/inherit a Docker/containerd/buildkit/systemd
  socket, FUSE device, sudo credential, setuid/file-capability gain or helper
  broker rejects; the fixed Buildx adapter rejects any source/backing path,
  child callback, extra Docker option or non-two-file build context;
- hostile children cannot temporarily rewrite-and-restore or same-byte rewrite
  source, chmod-and-restore, hard-link, symlink, rename, bind-shadow, overlay,
  mount/remount, `unshare`, `setns`, `chroot` or detach a helper. Each operation
  fails at the OS boundary and cannot create an attacker-derived dist sentinel;
- missing/mutated/reordered pre-exec or post-exit mount/capability/descriptor
  receipt, nonempty capability/bounding set, `CAP_SYS_ADMIN`, absent
  `no_new_privs`, widened seccomp policy, changed namespace topology, unjoined
  descendant, implicit output or output outside the five declared roots rejects
  before local, build, packaged-gate, seal, handoff or terminal authority;
- test:mv3 or any second extension build rejects;
- a same-byte dist rewrite, inode replacement, mode restoration, manifest
  rewrite, new file, missing file, link, or alternate loaded extension path
  rejects;
- handoff/GITHUB_OUTPUT path, digest, correlation, descriptor, base64, JCS, and
  chronology mutations reject; handoff/terminal authority or command-receipt
  drift, a terminal receipt set that is not an exact prefix extension, and any
  nested local/build/MV3/seal authority mismatch reject;
- the finalizer is the only no-replace transport publisher; pre-existence,
  handoff-stage creation/copy/rename, replacement, or a second publish rejects;
- saga snapshots reject gaps, forks, overwritten files, wrong previous digest,
  wrong run attempt, extra files, and illegal state/effect combinations;
- addition of actions:read, omission of attestations:write, contents:read, or
  id-token:write, escalation of any permission, or any unmodelled job
  permission rejects before the first privileged step;
- the exact separate `diagnostic_only` `test-mv3` uploader is accepted only by
  the parent policy/contracts/factory projection; blanket rejection, a second
  uploader, changed pin/inputs, candidate-shaped bytes or any diagnostic value
  in this producer's authority graph rejects;
- forged attest/upload success outputs, wrong action outcome, empty or hostile
  bundle path, bad Sigstore bundle, wrong ID/URL, missing
  if-no-files-found:error, archive:true, overwrite:true, alternate path, and
  every digest mismatch reject;
- producer attempts to query provider APIs, fabricate provider retention or
  bytes, change the pinned input derivation, or break any
  ArtifactPublicationJoinV1 equality reject;
- record-cancellation reaches saga cancelled for each of never_started,
  cooperatively_cleaned, and transport_captured, while missing cleanup,
  ambiguous writer/process state, forced runner kill,
  cancellation-step timeout, or absent fsync emits no terminal claim;
- no-effect failure/cancellation abandons the reservation, possible/confirmed
  remote effects and missing terminal require reconciliation, and hostile,
  stale, or partial attestation-only reconciliation receipts cannot unblock the
  namespace;
- catalog/evidence endpoint, OIDC audience/claims/TTL, TLS SPKI, request digest,
  idempotency key, CAS revision, receipt key/signature, durable readback, or
  operation-path drift rejects; runner files can never substitute for either
  external service;
- retries never reuse an actor, attempt root, builder, handoff, attestation, or
  artifact and cannot reserve a blocked prior namespace.

The final verification gate must also run the repository's release-readiness
model tests, workflow-policy tests, canonical transport tests, consumer
adversarial tests, formatting check, typecheck, and git diff --check. A green
test suite cannot override a missing reviewed model hash or any explicit
admission blocker in this document. In particular it cannot override missing
independent approvals for release-readiness clarification 11, MV3 harness
revision 26, packaged-tab revision 11, CV revision 6 or this producer model, nor can it override
a missing role-specific receipt or joint activation.

## 13. Review checklist

- [ ] Local terminal is transport_captured; saga terminal is
      uploaded_digest_verified.
- [ ] The saga reconstructs only inside the same job and claims no RUNNER_TEMP
      durability after runner loss.
- [ ] Actor construction and candidate reservation are one durable CAS;
      RC_SEAL_INGESTED durably commits rc_built before handoff/upload.
- [ ] Cross-job producer authority is the complete signed immutable terminal
      record containing the full chain and exact ArtifactPublicationJoinV1.
- [ ] Action outputs are validated and correlated before transitions.
- [ ] Controller execution is one closed atomic invocation with exact
      executable, argv, cwd, environment, stdin, FDs/CLOEXEC, staging,
      envelope schemas, absolute deadline and kill/join behavior.
- [ ] Controller success consumes exactly one producer-only execution-image
      port invocation distinct from every consumer port.
- [ ] Probe argv, stdin/stdout, image digest, environment, timeout, tmpfs,
      network, mount set, one-shot consumption, and receipt preimages are closed.
- [ ] Buildx v0.34.1 and BuildKit v0.30.0 topology is exact.
- [ ] Raw Buildx metadata has exactly five real keys; digest/descriptor bind the
      raw OCI index and manifest/config come only from graph traversal.
- [ ] SLSA v1 is explicitly requested, its raw materials stay honest, and the
      separate host projection binds the local context.
- [ ] Raw OCI has exactly one image and one validated provenance attestation;
      normalized OCI has exactly one image and no attestation.
- [ ] Upload has exact path and if-no-files-found:error with archive:false.
- [ ] The finalizer publishes transport exactly once; handoff capture can only
      recapture it and publish the handoff.
- [ ] The job has exactly attestations:write, contents:read, and id-token:write.
- [ ] Attestation OIDC audiences nobody/sigstore and the catalog broker audience
      missionpulse-release-catalog are disjoint one-use capabilities.
- [ ] Workflow policy covers every permission, step, expression, input, output,
      env key, and action pin.
- [ ] GITHUB_OUTPUT restrictions apply to project run steps while exact pinned
      action outputs remain bounded hostile observations.
- [ ] The read-only test-mv3 evidence upload is separately projected and can
      never be candidate transport authority.
- [ ] Every run ID is one canonical decimal string end-to-end and is never
      coerced through a JavaScript number.
- [ ] The producer makes no provider API claim; provider observation remains a
      consumer responsibility.
- [ ] Scenario authority is imported exclusively from the parent V2 constant:
      `scenarios.v2.json`, schema 2, thirteen ordered IDs and both exact hashes;
      V1 and mixed evidence fail before reservation.
- [ ] The fixed Git-object port exhaustively materializes the complete clean
      commit/tree in a controller-only backing tree; every child executes from
      the recursively read-only source view with read-only ancestors, zero
      overlays/shadows, only five closed output mounts, no capabilities,
      inherited seccomp and matching pre/post command receipts.
- [ ] Temporary rewrite/restore, same-byte rewrite, chmod, hard-link, symlink,
      rename, bind/overlay shadow, remount, namespace escape and detached-child
      attacks fail at the OS boundary; a clean post-run Git projection alone
      has no authority.
- [ ] Activation recomputes all six model blobs under their distinct hash
      conventions; candidate, audit and packaged gate repeat byte-identical
      fixed-index MV3-revision-26 and packaged-tab-revision-11 projections plus
      the same committed joint activation digest.
- [x] Packaged-tabs revision 11 is bound at normalized hash
      `30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`
      and approved source commit `ff9164c4`.
- [ ] Independent approvals of parent clarification 11, MV3 revision 26, CV
      revision 6 and this exact producer revision-11 pending hash permit only the inactive joint
      implementation phase; actor construction additionally requires the final
      atomic activation.
- [ ] Pre-activation nominal verification uses only the phase-scoped
      `verification_only` sandbox with the ordered implemented set, emits only
      producer-slot evidence, and proves it cannot consume verification receipts,
      mutate the global catalog, publish an actor/transport or mint activation
      authority.
- [ ] Content-authorized Chromium and FFmpeg are provisioned before the sole
      extension build.
- [ ] Content-authorized Node and pnpm use absolute retained entrypoints and a
      closed gate environment, with complete ToolMaterialsReceiptV1 binding.
- [ ] Playwright exercises the exact frozen dist without rebuilding it.
- [ ] START derives candidate from Git objects and audit from the immutable,
      TLS-pinned, signed external evidence channel without Git self-reference.
- [ ] Missing required policies are explicit blockers.
- [ ] record-cancellation makes SAGA_CANCELLED reachable without conflating
      GitHub cancelled(), cooperative cleanup, or unobserved runner death.
- [ ] Attestation and artifact remote effects are represented independently.
- [ ] Reservation success, abandonment, reconciliation, deadline loss, and
      retry guards use signed receipts from the OIDC-authenticated external
      catalog and remain durable after runner loss.

If any item cannot be proven by typed values, pure guards, retained descriptors,
fsynced intra-job snapshots, signed externally durable catalog records, signed
reconciliation receipts, and exact byte comparisons, the producer is not ready
to be implemented.
