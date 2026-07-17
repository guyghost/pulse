# Sealed Candidate Transport Consumer Model

Status: **PENDING INDEPENDENT REVIEW — REVISION 12; IMPLEMENTATION FORBIDDEN**

Model version: `12`

Pending content SHA-256: `a70f1f6b410f82c45e4bd3acfedbef8bb2a2bb51b417038c1911f6633d5cfd2e`

The pending hash is SHA-256 of the complete UTF-8/LF bytes of this file after
replacing only the value on the `Pending content SHA-256` line with the literal
`__PENDING_SHA256__`. Any semantic edit requires a new hash and review.

Revision 7 pending content hash
`b0f66e80b73c2d9b7028c902945f8cd84a04c2fd917ca7c8c5647e859ce99aea`
was independently rejected because it redeclared stale parent snapshot limits
and types, treated the transient byte snapshot as if it could be loaded from
durable readiness storage, and retained clarification-3/4 dependencies after
the parent V2 cutover. Revision 8 imports the clarification-6 authority
directly, retains only the stable three-ID tuple plus complete V-event hash
after commit, and accepts only the thirteen-entry V2 scenario inventory. No
approval transfers from revision 7.

This revision also supersedes rejected revision-6 pending hash
`e47a72c8f1f9c17365e830e3644dbd2dc755a77aaccd59ac1471eada62548c8e`,
rejected pending hashes
`aca997648e6072311ed69a4c544db1606fc4513534d9e4cd3b2524fc860c4820` and
`b38f91143ce37c126c2a34c15ef390bd391cf9238149dbe276b2d4642b54d3e5`,
rejected revision-3 hash
`2f84cd4ac81c005a1437e7f475c119f9e84ae7a87095abff4ee05c89d89a331a`, and
rejected revision-4 hash
`e9d9b288c194049ec3346f08671538acb773f65f4a57b7fa9b55ad95687fd466`, and
rejected revision-5 hash
`b55daa5e9b8a5e3c4cbabd2c60a6b18bdfa3e342168137c96f3a7b823ede1cef`;
no approval transfers from any prior hash. Revision 4 left the global deadline
watcher unidentifiable after retry, left two provider subphases outside their
persistent stage budget, and supplied no authenticated source for the dynamic
uploader output digest. Revision 5 failed to distinguish ETag-bearing initial
`200` requests from the valid non-ETag artifact-download `302` response.
Revision 6 named a runner-local producer chain as if it were cross-job durable,
referenced an undefined publication-join type, and represented GitHub run IDs
as lossy numbers. Revision 7 consumes only the signed immutable producer
terminal record and the producer model's exact common join type. Revision 8
preserves those corrections.

Revision 8 was independently rejected at normalized UTF-8/LF content hash
`0b45a13f2616dc31261a9e42f944f9b48f9ca138ab7dd29b7a1f40ded3078d30`
because clarification 6 exposed neither complete MV3/package model authority
tuples nor an atomic activation, and the consumer could therefore accept
reviewed V2 evidence without proving its implementation and verification
receipts. Revision 9 imports clarification 7 at behavior hash
`68fcad275f84b07f050cef96e01d4dc8402be06123d4509ad792e3dd5cd7d9df`,
requires producer revision 7 at content hash
`4a50bdd112538e6c27a1bdd2dee9199afb4ac8cb93d0991b659ee69baeb1560d`,
and admits only the committed joint activation carrying the complete authority
tuple for MV3 revision 26 at behavior hash
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`
and the complete tuple for packaged-tab revision 4 at behavior hash
`24dd339609de659497eb6e958319fe244149184137360c2dc9ca464d049486b0`
complete authority tuples. No approval transfers from revision 8.

Revision 9 was independently rejected at normalized UTF-8/LF content hash
`c44b2923cb3ce2a0ba91e4946258b97610a6531180a43c8387158cebb2ad5d10`.
It allowed the pre-activation sandbox to depend on already verified model
authority, preserving the review/implementation/verification bootstrap cycle,
and relied on a producer that executed ambient-checkout bytes while activation
proved only two model blobs. Revision 10 consumes the implemented set only for
private verification evidence, consumes the complete verified set only through
final activation, and requires producer revision 8's Git-object execution
workspace proof. No approval transfers from revision 9.

Revision 10 imports clarification 8 at behavior hash
`59291b22722dbf67117f32a5ff6153da9d3885aa13e4e3574cad6898c238624f`,
requires producer revision 8 at content hash
`9230fb822573972143a077fa5f2d7936775268553ead12c7524b246b7f344799`, and
admits production only through the complete
ordered verified set containing MV3 revision 26 at behavior hash
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`
and packaged-tab revision 5 at behavior hash
`2e8e56fd119d8fccf08f1463cc12aca7dd9ff21af3d18118212ccbad6d911cc5`.
The pre-activation path consumes the implemented set only and emits evidence;
no receipt or activation authority is inferred from that evidence.

Revision 10 was independently rejected at normalized UTF-8/LF content hash
`afb672e8c1fa794d3deef7c4e436b68a515499d4ae5a77c40dadea86c4338d05`.
It accepted producer pre/post Git recapture even though the materialized source
and its parents stayed writable while commands ran. A producer child could
temporarily mutate, chmod, replace or shadow source, derive the transported
candidate, and restore expected bytes before the terminal receipt. Revision 11
requires clarification 9 and producer revision 9's full OS-enforced
immutable-source authority plus every ordered pre/post mount/capability command
receipt before the first provider request. No approval transfers from revision 10.

Revision 11 imports clarification 9 at behavior hash
`8df2c60e71c02c279a167b78a4fb3b24931f069327d0137d26d461451418a9a5`,
requires producer revision 9 at content hash
`5c37fe07586b830b188fb0b6bf128e3955ae4ac103d16e32f56a1dea2c617872`,
and admits production only through the complete ordered verified set containing
MV3 revision 26 at behavior hash
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`
and packaged-tab revision 6 at behavior hash
`9b73affd0e6096ec8b2b60a1e5cffaa93633c0a5fea4cbf4d2ba91ae2c56b044`.

Revision 11 was withdrawn at normalized UTF-8/LF content hash
`b71a879cbdccde9b2780588a302c2674f8ba1982e8619768beb87ad47b82676c`.
It imported withdrawn clarification 9 and producer revision 9, and its current
admission contract still selected packaged tabs revision 6. Revision 12
preserves the complete consumer state topology, transient-byte lifetime,
immutable-source proof, thirteen-ID V2 authority and durable three-ID/event-hash
projection. It imports clarification 11 at normalized behavior hash
`9afa97e0848b6c5c6540d33f38e29a409112a531f9ff2cd7124e50ef96511080`
and producer revision 11 at normalized content hash
`bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`,
and admits only the six-slot verified activation containing MV3 revision 26,
packaged tabs revision 11 and CV accessible-anchor revision 6 at their exact
hashes. Packaged tabs revision 11 was independently approved and committed as
`ff9164c4`. No approval transfers from revision 11, either withdrawn upstream
model or any superseded package/CV dependency.

An earlier revision-12 candidate was independently rejected at normalized
UTF-8/LF content hash
`2375eccc6c193db297f9d948a70d3b7d93a9be1fa5bbca95eeffd61e9c754107`.
It imported rejected release-readiness clarification-11 hash
`c684d808d1827f5cc7d5f688547c7da0feca30935956dcb16dc197301a461287`
and dependent producer revision-11 hash
`8769aa6fea28d0e1c37e416db27c30a7735bc8ec62cf2f38cbda16945e9fb1ab`,
so its six-slot activation could not authenticate its own parent model. The
revised consumer imports the corrected parent and producer authorities. No
approval transfers from the rejected revision-12 candidate or either rejected
upstream hash.

## 1. Objective and boundary

This model defines the only legal package-validation consumer for an already
uploaded `missionpulse-sealed-candidate` artifact. Success means:

1. one exact GitHub artifact observation and downloaded blob are authenticated;
2. its canonical seven-component transport and six-entry payload authority are
   verified from captured bytes;
3. one opaque verified-payload capability admits one `linux/x64` host;
4. the proved `linux/amd64` OCI runtime emits one exact payload-verification
   receipt; and
5. the package-only protocol publishes one exact `ValidatedZipArtifactV1`.

This model consumes only `release-readiness.model.md` clarification 11 and the
producer revision-11 refinement aligned to it. It directly imports the parent-owned
snapshot limits, snapshot type, verified projection type, verifier and durable
accepted-V-event record. It declares no compatibility copy, fallback limit or
local verifier. Clarification-11 schemas, digest preimages, canonical ZIP rules,
package journal, chronology, transient-byte lifetime and durable three-ID/hash
projection remain normative. Approval of this consumer hash alone cannot
satisfy any upstream model dependency.

The candidate admitted at G0 must carry only the exact parent V2 inventory:
`apps/extension/tests/mv3/scenarios.v2.json`, schema version `2`, the ordered
thirteen IDs, blob SHA-256
`b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef`
and array JCS SHA-256
`2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a`.
V1 or mixed evidence has no consumer authority.

Out of scope and still blocking release:

- creating the seal, execution image, controller bundle or transport; those are
  specified by `sealed-candidate-transport-producer.model.md`, whose status is
  pending independent review and implementation forbidden;
- implementing before independent approval of exact clarification 11, producer
  revision 11, MV3 packaged-harness revision 26, packaged-tab revision 11 and
  CV accessible-anchor revision 6;
- consuming any release candidate before the parent-owned joint phase has
  committed its one atomic activation;
- uploading/deleting/overwriting an artifact or changing its retention;
- Chrome Web Store submission, promotion or rollback;
- generic download, unzip or OCI-runner APIs.

The consumer performs read-only provider operations. Credentials grant access,
never release authority. No log, exit code, free text, dashboard state or LLM
output decides a transition.

Pre-activation verification is limited to clarification 11's phase-scoped
`JointImplementationVerificationSandboxV1`. It consumes exactly one
`OrderedReviewedImplementedModelAuthoritySetV1`, never a verified set or
verification receipt. Its full immutable-source authority, closed command plan
and resulting ordered mount/capability receipts are mandatory evidence. Pure
guards, machines, parsers and hermetic adapters may
be exercised against the frozen tree, but no global catalog, production
readiness actor, provider request, consumer endpoint or artifact mutation is
permitted. The only positive output is consumer-slot
`JointModelVerificationEvidenceV1`, later consumed by the independent
verification-receipt signer. Real provider/runtime/package proof occurs only
after atomic activation and remains a separate release gate; it is not forged
to break the model-review cycle.

Every pre-activation child that loads repository code runs from the sandbox's
recursively read-only Git source view under its closed output mounts and
mount/capability receipt protocol. The post-activation production consumer does
not mount Git source, the producer backing tree or the ambient checkout at all;
it executes only the content-authorized controller/runtime bytes and captured
sealed inputs, with package staging/report roots as explicit outputs. A
production child that can resolve a repository source path is invalid before
spawn.

## 2. Input, output and private authority contracts

The public start input contains only an authoritative readiness-actor reference,
provider selectors and the fixed-window deadline timestamps. A caller-supplied
`CandidateIdentityV1` or seal is forbidden:

```ts
interface SealedCandidateConsumeRequestV6 {
  schema: 'missionpulse.sealed-candidate-consume-request';
  version: 6;
  consumerId: string;
  attemptId: string;
  readinessActor: {
    actorId: string;
    expectedContextSha256: Sha256;
  };
  runId: string; // canonical positive decimal ASCII, 1..32 bytes, no leading zero
  runAttempt: number;
  requestedAt: CanonicalUtcTimestamp;
  attemptDeadlineAt: CanonicalUtcTimestamp;
}

`runId` and every provider/attestation/workflow-run projection of it are the
same 1..32-byte ASCII string matching `/^(?:[1-9]\d*)$/`; comparison is
byte-for-byte. The lossless duplicate-key-rejecting provider parser maps a raw
canonical JSON integer lexeme directly to this string without ever constructing
a JavaScript number; an API string must round-trip to the same grammar.
Fractions, exponents, signs, zero and leading zeros reject. This preserves IDs
beyond JavaScript's safe-integer range. `runAttempt` remains a positive safe
integer. This is the exact `CanonicalPositiveDecimalString` contract in
release-readiness clarification 11.

type ConsumerBoundedStage =
  | 'readiness-load'
  | 'provider-observation'
  | 'transport-download'
  | 'attestation-verification'
  | 'transport-verification'
  | 'payload-authority-verification'
  | 'host-admission'
  | 'oci-runtime'
  | 'readiness-commit'
  | 'package-validation'
  | 'package-recovery'
  | 'cleanup';

interface ConsumerDeadlineAuthorityV1 {
  deadlineAuthorityId: Sha256;
  initialAttemptId: string;
  requestedAt: CanonicalUtcTimestamp;
  attemptDeadlineAt: CanonicalUtcTimestamp;
  workDeadlineAt: CanonicalUtcTimestamp;
  admittedWallAt: CanonicalUtcTimestamp;
  maxObservedWallAt: CanonicalUtcTimestamp;
  admittedMonotonicNs: string;
  workMonotonicDeadlineNs: string;
  hardMonotonicDeadlineNs: string;
  requestDeadlineWatcher: {
    generation: number;
    attemptId: string;
    invocationId: Sha256;
    startedMonotonicNs: string;
  };
  stageConsumedMs: Readonly<Record<ConsumerBoundedStage, number>>;
  activeInvocation: null | {
    stage: ConsumerBoundedStage;
    invocationId: Sha256;
    allocatedBudgetMs: number;
    startedWallAt: CanonicalUtcTimestamp;
    startedMonotonicNs: string;
  };
}

const CONSUMER_DEADLINES = Object.freeze({
  attemptMs: 2_700_000,
  cleanupReserveMs: 120_000,
  stageMs: Object.freeze({
    'readiness-load': 30_000,
    'provider-observation': 120_000,
    'transport-download': 600_000,
    'attestation-verification': 120_000,
    'transport-verification': 300_000,
    'payload-authority-verification': 300_000,
    'host-admission': 60_000,
    'oci-runtime': 600_000,
    'readiness-commit': 60_000,
    'package-validation': 600_000,
    'package-recovery': 600_000,
    cleanup: 120_000,
  }),
});

interface ConsumerDeadlineExceededV1 {
  schema: 'missionpulse.sealed-candidate-consumer-deadline-exceeded';
  version: 1;
  consumerId: string;
  attemptId: string;
  deadlineAuthorityId: Sha256;
  stage: ConsumerBoundedStage | 'request';
  invocationId: Sha256;
  attemptDeadlineAt: CanonicalUtcTimestamp;
  observedAt: CanonicalUtcTimestamp;
  observedMonotonicNs: string;
}

interface AdmittedReadinessActorSnapshotV1 {
  actorId: string;
  contextSha256: Sha256;
  state: 'rc_built';
  candidate: CandidateIdentityV1;
  jointModelActivation: JointReleaseModelActivationV1;
  seal: TestedDistSealV1;
  transportObservation: null;
  payloadVerification: null;
  packageJournal: null;
  artifact: null;
  pendingRestart: null;
}

interface ConsumerProducerSourceExecutionProofV1 {
  schema: 'missionpulse.consumer-producer-source-execution-proof';
  version: 1;
  proofSha256: Sha256;
  sourceCommit: string;
  gitTreeObjectId: string;
  sourceWorkspaceMaterializationSha256: Sha256;
  immutableSourceExecutionAuthority: ImmutableGitSourceExecutionAuthorityV1;
  sealCommandReceiptSetSha256: Sha256;
  sealCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  handoffCommandReceiptSetSha256: Sha256;
  handoffCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  terminalCommandReceiptSetSha256: Sha256;
  terminalCommandReceipts: readonly [
    ImmutableGitSourceCommandReceiptV1,
    ...ImmutableGitSourceCommandReceiptV1[],
  ];
  verifiedAt: CanonicalUtcTimestamp;
}

interface ReleaseRuntimeHostAdmissionReceiptV1 {
  schema: 'missionpulse.release-runtime-host-admission-receipt';
  version: 1;
  consumerId: string;
  attemptId: string;
  readinessActorId: string;
  controllerExecutionAuthoritySha256: Sha256;
  producerSourceExecutionProofSha256: Sha256;
  admittedAt: CanonicalUtcTimestamp;
}

// Normative parent imports. This consumer declares none of these symbols.
import {
  PACKAGED_MV3_SCENARIO_INVENTORY_V2,
  JOINT_MODEL_BLOB_RULES_V1,
  REQUIRED_CV_ACCESSIBLE_ANCHOR_MODEL_V6,
  REQUIRED_MV3_HARNESS_MODEL_V26,
  REQUIRED_PACKAGED_TAB_MODEL_V11,
  RELEASE_PAYLOAD_SNAPSHOT_AGGREGATE_WITNESS,
  RELEASE_PAYLOAD_SNAPSHOT_FIELD_LIMIT_SUM,
  RELEASE_PAYLOAD_SNAPSHOT_LIMITS,
  verifyPayloadByteSnapshot,
  type AcceptedPayloadVerificationLocalEventV1,
  type ImmutableGitSourceCommandReceiptV1,
  type ImmutableGitSourceExecutionAuthorityV1,
  type JointImplementationVerificationSandboxV1,
  type JointModelVerificationEvidenceV1,
  type JointReleaseModelActivationV1,
  type OrderedReviewedImplementedModelAuthoritySetV1,
  type OrderedReviewedImplementedVerifiedModelAuthoritySetV1,
  type ReleasePayloadByteSnapshotV1,
  type ReleasePayloadVerifiedIngestedV1,
  type ReviewedImplementedVerifiedModelAuthorityV1,
  type VerifiedReleasePayloadProjectionV1,
} from 'missionpulse-release-readiness-clarification-11-authority';
```

The import is nominal and single-source: source/AST contract checks reject any
consumer declaration named like an imported symbol, copied sixteen/twenty-key
shape, copied field-limit map, copied aggregate number, wrapper that reimplements
the verifier, or runtime fallback when the parent export is unavailable. The
parent aggregate limit is exactly `1_610_612_736`, its thirteen field ceilings
sum to `1_707_081_728`, and the consumer reads those numbers only through the
three imported limit/witness exports.

`ConsumerProducerSourceExecutionProofV1.proofSha256` is SHA-256 of RFC 8785 JCS
of the complete proof with only `proofSha256` omitted. It is constructed and
frozen during G0, before any GitHub request. The consumer independently
recomputes the parent `ImmutableGitSourceExecutionAuthorityV1` self-digest and
requires the signed producer terminal, its complete handoff, the readiness
seal and both workspace-completion receipts to contain the exact same production
authority and Git commit/tree/materialization.

The authority passes only when the complete source view and every addressable
ancestor are recursively `ro,nodev,nosuid,noexec`, the backing tree/path and its
descriptors were unavailable to children, `overlayMountCount` is zero, and the
only writable roots are dependencies, cache, dist, browser profile and reports.
Every writable backing root is outside source; an in-source target has an exact
complete-tree absence proof, no tracked descendant and an empty pre-mount
observation. A writable ancestor, extra/late/nested/overlapping mount, bind or
overlay on any source/module/test/fixture/harness/script/model/policy/manifest/
lock/config path, package-manager shadow or implicit output is terminal.

Every effective, permitted, inheritable, ambient and bounding capability set is
empty; `CAP_SYS_ADMIN` is absent, `no_new_privs` is true, and the reviewed
seccomp/filesystem policy denies mount/remount, namespace/chroot escape and
source write/truncate/chmod/chown/hard-link/symlink/rename/replacement. Every
project child must also have zero privileged-service sockets or FUSE devices and
no sudo, setuid, file-capability or helper-broker gain; any controller-owned
Buildx adapter is validated as a separate fixed-request port that never receives
source/backing paths or exposes its Docker capability to a child. Every
ordered command receipt independently validates its self-digest, executable,
argv/environment/cwd/output plan, full descendant join, and matching pre/post
mount, capability and descriptor observations. Seal receipts are an exact
prefix of handoff receipts, and handoff receipts are an exact prefix of terminal
receipts. The build-producing receipt is unique and writes only the separate
dist mount.

Pre/post clean Git projections are defense in depth only. A temporary
rewrite-and-restore, same-byte rewrite, chmod-and-restore, link, symlink,
rename, bind/overlay shadow, remount, namespace escape, backing-path access,
missing receipt or unjoined child rejects even if the final source digest is
identical. G0 persists only the immutable proof digest after admission; the
complete signed terminal remains its reload authority. Without this proof the
consumer performs no provider read, download, runtime execution or readiness
mutation.

The consumer loads only the durable release-readiness actor context by exact
`actorId` before any GitHub request, recomputes `releaseContextSha256` over the
returned canonical context and requires equality with
`expectedContextSha256`. At G0 the context contains candidate and seal but no
snapshot, no verified projection and no accepted V event. After V it may contain
the accepted observation and verification plus exactly one imported
`AcceptedPayloadVerificationLocalEventV1`; that durable record contains only
`[attestationId, verificationId, snapshotId]` and the complete `eventSha256`.
The sixteen-field snapshot and twenty-field projection are never loadable from
durable storage. There is no actor revision or actor-registry revision in this
CAS contract. The loaded actor, not the public request, supplies the immutable
candidate, seal, source commit, repository, main ref, workflow and policies.
Positive run ID/attempt remain untrusted filters. Artifact name and transport
format are constants:

```text
missionpulse-sealed-candidate
missionpulse-canonical-zip-v1
```

### 2.1 Absolute request deadline and non-resetting child budgets

Before parsing `CONSUME_REQUESTED`, the fixed clock port captures one trusted
wall-clock value and one process-monotonic nanosecond value. The request passes
only when both timestamps are canonical, `attemptDeadlineAt - requestedAt` is
exactly 2,700,000 ms, and the trusted wall observation is within that half-open
interval. `workDeadlineAt` is exactly 120,000 ms before
`attemptDeadlineAt`. The actor derives both private monotonic deadlines by
adding only the remaining trusted-wall duration to the captured monotonic
sample; a caller cannot supply either monotonic value.

`deadlineAuthorityId` is SHA-256 JCS of
`{domain:"missionpulse.consumer-deadline-authority.v1", consumerId,
initialAttemptId, requestedAt, attemptDeadlineAt}`. The complete
`ConsumerDeadlineAuthorityV1` is frozen in serializable actor context. Every
trusted wall sample updates `maxObservedWallAt = max(previous, sample)`. A
sample below the persisted maximum on restart is rollback ambiguity and enters
deadline cleanup without starting fresh work; it is never used to derive a
longer deadline. Inside one process, elapsed time and deadline decisions use
only the monotonic clock.

Accepted request entry persists `requestDeadlineWatcher` before invoking the
fixed `watchConsumerRequestDeadline` actor. Its `invocationId` is SHA-256 JCS of
the deadline-authority ID, exact current attempt ID, generation and unchanged
`workDeadlineAt`. Its receipt uses stage `request` and the same
`deadlineAuthorityId`. The watcher remains active through ordinary states and
`retry_wait`. An accepted retry atomically stops and joins generation N,
updates the attempt ID, increments the safe-integer generation, persists the
new invocation ID and starts generation N+1 against the same absolute
`workDeadlineAt`; that replacement grants no time. After restart, the same
persisted generation is recreated without extension. A request timeout is
accepted only from that exact private watcher; a child timeout is accepted only
from the exact `activeInvocation`. A stage `request` receipt can therefore be
authenticated even when no child is active. The watcher is stopped in a
terminal state. Per-child timers use their exact `ConsumerBoundedStage`.

After `SERVICE_RESTARTED`, an unknown active child is conservatively charged
its complete persisted `allocatedBudgetMs`, not an unprovable wall-clock
estimate, then cleared. Only then may a process-local monotonic deadline be
derived from the unchanged remaining absolute duration. Restart, retry, a new
child, CAS conflict, cancellation or recovery can shorten but never replace
either absolute deadline.

All twelve `stageConsumedMs` keys are present exactly once, initialize to safe
integer zero and can only increase by bounded safe-integer milliseconds.
`activeInvocation` is single-assignment while a child is live; a second child
cannot reserve a budget concurrently.

Before invoking a child, the actor persists `activeInvocation`, including its
exact `allocatedBudgetMs`, and assigns the smaller of:

1. the stage's exact remaining cumulative budget
   `CONSUMER_DEADLINES.stageMs[stage] - stageConsumedMs[stage]`; and
2. the remaining work-deadline duration for ordinary stages, or remaining hard
   attempt duration for `cleanup`.

On an ordinary result, failure or cancellation it atomically charges
`min(allocatedBudgetMs, ceil(monotonicElapsedNs / 1_000_000))` to that stage and
clears `activeInvocation` before another child can start. Any positive elapsed
interval costs at least one millisecond. Restart charges the full allocation as
specified above. Budgets are cumulative for the complete request: retrying a
provider read, restarting Docker, re-entering package recovery or handling a
CAS conflict does not reset a stage counter. Initial API reads, the
credentialed download-redirect response, every response body and every ETag
revalidation are included in `provider-observation`; only the credentialless
redirected transport body is included in `transport-download`; process startup,
stdin, stdout/stderr and join are included in `oci-runtime`; every journal
scan/CAS/recovery action is included in its package stage. No unbounded helper
or detached child exists outside a named budget.

Ordinary work may never consume the 120,000 ms cleanup reserve. Expiry of a
stage budget or the work deadline produces the exact private
`DEADLINE_EXCEEDED` event below and enters the same one-shot cleanup protocol as
operator cancellation. Cleanup itself is capped by both its remaining
cumulative 120,000 ms budget and the hard attempt deadline. If cleanup cannot
prove a terminal disposition before either bound, the actor rejects with
`CLEANUP_AMBIGUOUS`; it never claims `cancelled`. A process kill at the hard
deadline is classified only by the restart matrix, never as a fabricated
timeout result.

Cancellation-time readiness CAS work is a nested non-child operation whose
same monotonic interval is atomically charged to both `cleanup` and
`readiness-commit`; cancellation-time journal observation/recovery is charged
the same way to both `cleanup` and `package-recovery`. Before either operation,
its allowance is the smallest remaining value across both counters and the hard
deadline. The single `activeInvocation` remains the cleanup actor; no second
child or timer is created. Moving work under cleanup therefore cannot recover a
spent stage allowance.

If the initial trusted observation is already at or after `workDeadlineAt`, the
request is rejected directly as `DEADLINE_EXCEEDED`: no child, workspace,
capability or cleanup actor exists yet. Malformed chronology is
`INVALID_REQUEST`, not a timeout.

The only successful terminal output is:

```ts
interface SealedCandidateConsumerSuccessV1 {
  schema: 'missionpulse.sealed-candidate-consumer-success';
  version: 1;
  consumerId: string;
  attemptId: string;
  readinessActorId: string;
  readinessContextSha256: Sha256; // final context after artifact publication
  transportObservation: SealedCandidateTransportObservationV1;
  payloadVerification: ReleaseExecutionPayloadVerificationV1;
  packageJournal: PackageJournalV1; // terminal phase `published`
  artifact: ValidatedZipArtifactV1;
  completedAt: CanonicalUtcTimestamp;
}
```

Serializable consumer context stores identities and receipts only. Captured
bytes, open descriptors, the byte snapshot and capabilities live only in an
actor-owned private record. The snapshot is assembled once from those exact
captured bytes for V ingestion; it is never reconstructed from paths or stored
as resumable consumer authority. The private record exists only from final
postflight assembly through reducer/CAS acknowledgement and is synchronously
cleared on success, rejection, cancellation, timeout or cleanup. It is never
serialized into a saga snapshot, readiness context, journal, diagnostic,
handoff or success result.

```ts
interface TransientPayloadVerificationRecordV1 {
  readonly payloadByteSnapshot: ReleasePayloadByteSnapshotV1;
  readonly verifiedProjection: VerifiedReleasePayloadProjectionV1;
  readonly acceptedEvent: AcceptedPayloadVerificationLocalEventV1;
}

declare const verifiedTransportPayloadBrand: unique symbol; // module-private
declare const runtimeHostAdmissionBrand: unique symbol; // module-private

interface VerifiedTransportPayloadCapabilityV1 {
  readonly [verifiedTransportPayloadBrand]: true;
}

interface ReleaseRuntimeHostAdmissionCapabilityV1 {
  readonly [runtimeHostAdmissionBrand]: true;
}

declare function authorizeReleaseRuntimeHostAdmission(
  verifiedPayload: VerifiedTransportPayloadCapabilityV1
): Promise<ReleaseRuntimeHostAdmissionCapabilityV1>;

declare function executeVerifiedOciRuntime(
  admission: ReleaseRuntimeHostAdmissionCapabilityV1
): Promise<ReleaseExecutionPayloadVerificationV1>;
```

Those are the only runtime boundary signatures. Neither accepts raw DTOs,
paths, byte buffers, Docker ports, callbacks, options, overloads, optional
arguments, environment fallbacks or test hooks. No exported constructor,
issuer, `mint`, registrar, brand or registry accessor may exist.

Each boundary is implemented as an ordinary non-`async` wrapper with a
synchronous admission prologue; only after the required host check and private
registry deletion may it construct/return the Promise for later asynchronous
verification or Docker work. Moving either consumption below an `await` is a
model violation.

Capability registration is a private machine effect in the same authority
module that owns its `WeakSet`/`WeakMap`. It is reachable only after the full
transport and payload-authority guards pass; it is not a callable API.

## 3. Exact states and events

The implementation must be one XState v5 machine with these exact states:

```ts
type SealedCandidateConsumerState =
  | 'created'
  | 'loading_readiness_actor'
  | 'observing_provider'
  | 'downloading_transport'
  | 'revalidating_provider'
  | 'verifying_attestation'
  | 'verifying_transport'
  | 'verifying_payload_authority'
  | 'capability_ready'
  | 'admitting_host'
  | 'runtime_executing'
  | 'payload_verified'
  | 'package_validating'
  | 'package_recovering'
  | 'retry_wait'
  | 'cancelling'
  | 'package_validated'
  | 'rejected'
  | 'cancelled';
```

Terminal states are exactly `package_validated`, `rejected` and `cancelled`.

External callers may send only:

```ts
type PublicConsumerEvent =
  | { type: 'CONSUME_REQUESTED'; request: SealedCandidateConsumeRequestV6 }
  | {
      type: 'RETRY_REQUESTED';
      priorAttemptId: string;
      nextAttemptId: string;
      requestedAt: CanonicalUtcTimestamp;
    }
  | {
      type: 'CANCEL_REQUESTED';
      cancelId: string;
      requestedAt: CanonicalUtcTimestamp;
    }
  | { type: 'SERVICE_RESTARTED'; restartId: string; restartedAt: CanonicalUtcTimestamp };

interface ConsumerCancellationV1 {
  cancelId: string;
  requestedAt: CanonicalUtcTimestamp;
  cleanupInvocationId: Sha256;
}

type ConsumerCleanupPlan = 'private-only' | 'invalidate-post-v' | 'reconcile-journal';

type ConsumerCleanupTriggerV1 =
  | {
      kind: 'operator';
      cancellation: ConsumerCancellationV1;
    }
  | {
      kind: 'deadline';
      deadline: ConsumerDeadlineExceededV1;
    };

interface ConsumerCleanupInvocationV1 {
  cleanupInvocationId: Sha256;
  trigger: ConsumerCleanupTriggerV1;
  plan: ConsumerCleanupPlan;
  readinessActorId: string | null;
  expectedContextSha256: Sha256 | null;
}

type ConsumerCleanupDispositionV1 =
  | {
      kind: 'private-clean';
      finalReadinessContextSha256: Sha256 | null;
    }
  | {
      kind: 'post-v-blocked';
      finalReadinessContextSha256: Sha256;
      state: 'blocked';
      packageJournal: null;
    }
  | {
      kind: 'journal-cleaned-blocked';
      finalReadinessContextSha256: Sha256;
      state: 'blocked';
      packageJournalPhase: 'cleaned';
    }
  | {
      kind: 'publication-completed';
      finalReadinessContextSha256: Sha256;
      packageJournal: PackageJournalV1;
      artifact: ValidatedZipArtifactV1;
    };
```

`cancelId` matches `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. On the first accepted
cancel, `cleanupInvocationId` is frozen as SHA-256 JCS of
`{domain:"missionpulse.consumer-cleanup-invocation.v1", consumerId, attemptId,
cancelId, requestedAt}`. An exact duplicate means byte-identical canonical JCS
for the complete `CANCEL_REQUESTED` event; matching only `cancelId` is
insufficient. A deadline cleanup ID instead hashes the same domain plus
`consumerId`, `attemptId`, the complete deadline receipt and literal trigger
`deadline`. Exactly one frozen `ConsumerCleanupInvocationV1` binds that ID to
the state-derived plan and current readiness context hash; neither trigger may
replace the plan after entry.

Private child actors alone may emit:

```ts
type PrivateConsumerEvent =
  | { type: 'READINESS_ACTOR_LOADED'; snapshot: AdmittedReadinessActorSnapshotV1 }
  | {
      type: 'PROVIDER_OBSERVATION_CAPTURED';
      envelopeSha256: Sha256;
      producerSagaSnapshotSha256: Sha256;
    }
  | { type: 'TRANSPORT_DOWNLOAD_CAPTURED'; bytes: number; sha256: Sha256 }
  | { type: 'PROVIDER_EPOCH_REVALIDATED'; envelopeSha256: Sha256 }
  | { type: 'ATTESTATION_VERIFIED'; observation: SealedCandidateTransportObservationV1 }
  | { type: 'TRANSPORT_VERIFIED'; transportZipReceiptSha256: Sha256 }
  | {
      type: 'PAYLOAD_AUTHORITY_VERIFIED';
      payloadInventorySha256: Sha256;
      controllerExecutionAuthoritySha256: Sha256;
    }
  | { type: 'HOST_ADMITTED'; receipt: ReleaseRuntimeHostAdmissionReceiptV1 }
  | { type: 'RUNTIME_VERIFIED'; receipt: ReleaseExecutionPayloadVerificationV1 }
  | { type: 'PACKAGE_VALIDATED'; artifact: ValidatedZipArtifactV1 }
  | { type: 'PACKAGE_RECOVERY_REQUIRED'; journal: PackageJournalV1 }
  | { type: 'PACKAGE_RECOVERED'; artifact: ValidatedZipArtifactV1 }
  | { type: 'STAGE_FAILED'; error: SealedCandidateConsumerErrorV1 }
  | { type: 'DEADLINE_EXCEEDED'; receipt: ConsumerDeadlineExceededV1 }
  | {
      type: 'CLEANUP_SUCCEEDED';
      cleanupInvocationId: Sha256;
      disposition: ConsumerCleanupDispositionV1;
      completedAt: CanonicalUtcTimestamp;
    }
  | {
      type: 'CLEANUP_FAILED';
      cleanupInvocationId: Sha256;
      error: SealedCandidateConsumerErrorV1;
    };
```

A structurally identical private event from a caller is rejected as
`UNAUTHORIZED_INTERNAL_EVENT` with no mutation.

## 4. Normative transition table

| From                                                           | Event                                                                     | Guard and atomic effect                                                                                                                        | To                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `created`                                                      | valid but work-expired `CONSUME_REQUESTED`                                | persist exact deadline error; create no child/workspace/capability                                                                             | `rejected`                    |
| `created`                                                      | `CONSUME_REQUESTED`                                                       | validate/freeze actor reference and selectors; invoke exact durable actor load                                                                 | `loading_readiness_actor`     |
| `loading_readiness_actor`                                      | `READINESS_ACTOR_LOADED`                                                  | require exact context SHA-256/state and G0 snapshot; freeze actor-owned candidate+seal authority; create absent workspace                      | `observing_provider`          |
| `observing_provider`                                           | `PROVIDER_OBSERVATION_CAPTURED`                                           | validate one terminal producer publication join, initial provider epoch and credentialed redirect response under the provider budget           | `downloading_transport`       |
| `downloading_transport`                                        | `TRANSPORT_DOWNLOAD_CAPTURED`                                             | retain one complete bounded credentialless buffer and recomputed digest                                                                        | `revalidating_provider`       |
| `revalidating_provider`                                        | `PROVIDER_EPOCH_REVALIDATED`                                              | reissue exactly the frozen ETag-bearing status-200 request set under a second cumulative provider-budget invocation; exclude the 302 redirect  | `verifying_attestation`       |
| `verifying_attestation`                                        | `ATTESTATION_VERIFIED`                                                    | verify Sigstore and workflow; freeze exact transport observation                                                                               | `verifying_transport`         |
| `verifying_transport`                                          | `TRANSPORT_VERIFIED`                                                      | verify canonical ZIP; safe-extract; retain open descriptors/snapshots                                                                          | `verifying_payload_authority` |
| `verifying_payload_authority`                                  | `PAYLOAD_AUTHORITY_VERIFIED`                                              | cross-bind all payload bytes; derive/recapture controller authority; atomically register one frozen opaque payload token and private record    | `capability_ready`            |
| `capability_ready`                                             | XState guarded `always`                                                   | require private payload registration only                                                                                                      | `admitting_host`              |
| `admitting_host`                                               | `HOST_ADMITTED`                                                           | validate exact invocation result and persist bounded host-admission receipt only                                                               | `runtime_executing`           |
| `runtime_executing`                                            | `RUNTIME_VERIFIED`                                                        | validate/cross-bind result; assemble exact byte snapshot; CAS-ingest exact `RELEASE_PAYLOAD_VERIFIED_INGESTED` into the same readiness actor   | `payload_verified`            |
| `payload_verified`                                             | XState guarded `always`                                                   | require durable exact receipts; reserve journal strictly after verification; invoke package-only actor                                         | `package_validating`          |
| `package_validating`                                           | `PACKAGE_VALIDATED`                                                       | require published journal plus artifact/catalog CAS                                                                                            | `package_validated`           |
| `package_validating`                                           | `PACKAGE_RECOVERY_REQUIRED`                                               | stop ordinary work; capture exact local recovery observation                                                                                   | `package_recovering`          |
| `package_recovering`                                           | `PACKAGE_RECOVERED`                                                       | apply the unique observed package recovery transition                                                                                          | `package_validated`           |
| `loading_readiness_actor`, provider/download/attestation state | retryable `STAGE_FAILED`                                                  | close/discard every partial resource; persist typed error                                                                                      | `retry_wait`                  |
| `retry_wait`                                                   | `RETRY_REQUESTED`                                                         | same actor/run; fresh attempt ID; no live resource/effect; rotate the persisted watcher generation without changing its deadline; reload actor | `loading_readiness_actor`     |
| any active nonterminal state except `created`/`cancelling`     | first `CANCEL_REQUESTED`                                                  | persist immutable cancel identity; derive/freeze section 6 cleanup plan; enter the one bounded cleanup invocation exactly once                 | `cancelling`                  |
| any active nonterminal state except `created`/`cancelling`     | `DEADLINE_EXCEEDED`                                                       | validate exact current invocation/stage/deadline; persist typed error; derive/freeze the same one-shot cleanup plan                            | `cancelling`                  |
| `cancelling`                                                   | exact duplicate `CANCEL_REQUESTED`                                        | internal no-op; preserve state/context; do not reenter and do not invoke cleanup again                                                         | `cancelling`                  |
| `cancelling`                                                   | different `CANCEL_REQUESTED`                                              | reject `CANCELLATION_ALREADY_STARTED`; preserve state/context; no cleanup effect                                                               | `cancelling`                  |
| `cancelling`                                                   | `CLEANUP_SUCCEEDED(private-clean/post-v-blocked/journal-cleaned-blocked)` | prove the exact section 6 durable disposition plus no live authority or ambiguous owned output                                                 | `cancelled`                   |
| `cancelling`                                                   | `CLEANUP_SUCCEEDED(publication-completed)`                                | validate already-durable published journal/artifact; cancellation cannot override publication                                                  | `package_validated`           |
| any nonterminal state except `cancelling`                      | nonretryable `STAGE_FAILED`                                               | revoke authority, close descriptors, persist typed failure                                                                                     | `rejected`                    |
| `cancelling`                                                   | `CLEANUP_FAILED`                                                          | persist cleanup ambiguity; never claim cancellation                                                                                            | `rejected`                    |
| any state                                                      | `SERVICE_RESTARTED`                                                       | apply the exhaustive restart matrix in section 6                                                                                               | state-specific                |

Every state/event pair not listed rejects with no mutation. There is no wildcard
success transition. Private success events must match the exact invoked child
actor and attempt ID.

State-entry invocation order is normative and not an event effect:

- every child-owning work-state entry first persists its cumulative stage
  allocation and starts exactly one actor-owned monotonic deadline timer
  correlated to the child invocation ID. `observing_provider` and
  `revalidating_provider` are separate invocations charging the same cumulative
  `provider-observation` counter. Timer expiry aborts/joins that child and alone
  may emit the private `DEADLINE_EXCEEDED`; a stale, public or wrong-stage
  receipt rejects;
- entering `admitting_host` invokes the fixed admission actor; its synchronous
  prologue performs host check and payload-token deletion before any Promise;
- entering `runtime_executing` invokes the fixed runtime actor; its synchronous
  prologue deletes admission before any Promise or Docker access;
- entering `cancelling` from the first accepted cancel invokes exactly one
  cleanup actor bound to the frozen `ConsumerCleanupInvocationV1`; a deadline
  invokes that same actor shape. Entry stops the work-deadline watcher; the
  cleanup timer alone enforces the hard deadline. An internal duplicate transition has
  `reenter: false`, schedules no action and cannot spawn it again;
- `HOST_ADMITTED` and `RUNTIME_VERIFIED` validate and persist only completed
  invocation results. They cannot perform or replay either prologue;
- `CLEANUP_SUCCEEDED` and `CLEANUP_FAILED` validate the exact current trigger,
  plan, context hash, `cleanupInvocationId`, attempt and invoked child. Their
  handlers consume a result only; they cannot start, repeat or broaden cleanup.

## 5. Guards and ordered verification

### G0 — authoritative readiness actor and S-before-V order

- Load one durable release-readiness actor by the exact public `actorId`; require
  `readActor(actorId)` to return one context. Recompute
  `releaseContextSha256(context)` and require exact equality with the public
  `expectedContextSha256` before accepting it. This is the real actor CAS
  identity; no registry revision, actor revision or separately supplied actor
  digest participates.
- Require state `rc_built`, `pendingRestart === null`, one valid immutable
  candidate and one valid final seal. Transport observation, payload
  verification, package journal and artifact must still be null.
- Require the candidate, audit, seal and packaged-MV3 receipt to name only the
  parent-imported V2 inventory path/schema, both exact hashes and the exact
  ordered thirteen IDs, executed and passed once each with zero skip, failure,
  retry or diagnostic. V1/mixed evidence rejects before the producer-terminal
  or GitHub request.
- Require candidate, audit and packaged-MV3 receipt to repeat byte-identical
  fixed-index `mv3HarnessModelAuthority` and
  `packagedTabScenariosModelAuthority` projections plus
  `jointModelActivationSha256`. The identities must exactly equal
  `REQUIRED_MV3_HARNESS_MODEL_V26`, `REQUIRED_PACKAGED_TAB_MODEL_V11` and the
  CV slot must exactly equal `REQUIRED_CV_ACCESSIBLE_ANCHOR_MODEL_V6`.
- Load the complete joint activation from the controller-global catalog, verify
  its self-digest/CAS revision/source commit/tree, and require its embedded
  `OrderedReviewedImplementedVerifiedModelAuthoritySetV1` to validate its exact
  JCS preimage, six-slot order and reviewed/implemented projections. The
  candidate/audit/gate values must equal fixed-index projections from that set;
  they cannot replace it. The activation loads all eighteen receipt blobs and
  recomputes all six raw and normalized model blobs using
  `JOINT_MODEL_BLOB_RULES_V1`. It must bind clarification 11 at exact behavior
  hash
  `9afa97e0848b6c5c6540d33f38e29a409112a531f9ff2cd7124e50ef96511080`,
  producer revision 11 at exact content hash
  `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`,
  consumer revision-12 authority and both V2 inventory digests. Its complete
  verification command-receipt array and set
  digest must validate against its immutable-source verification authority;
  writable source/ancestor or mount/capability drift blocks activation. Receipt signatures are verified only under the
  activation's controller-global external-receipt policy digest; tuple/caller
  keys are forbidden. Review, implementation, evidence or verification without
  final atomic activation is terminal before any provider request.
- Require the signed producer terminal to contain producer revision 11 at
  content hash
  `bf681ebf0a2714f77bf48bfa0e121461ce69639814c5b60fbb6dffbadab43792`,
  its exact Git execution-workspace materialization, full production immutable-source
  authority, local-handoff completion receipt and terminal completion receipt.
  Recompute their exact JCS digests and construct one
  `ConsumerProducerSourceExecutionProofV1`. Seal, handoff and terminal command
  arrays must form exact prefix extensions and every command must bind the same
  read-only source/ancestors, zero-overlay topology, five-root output allowlist,
  empty capability sets, inherited seccomp/filesystem policy and matching
  pre/post mount/capability observations. Reject ambient checkout/backing bytes,
  writable source/ancestor, tracked-path shadow, chmod/link/symlink/rename,
  mount/remount/namespace escape, modified/untracked source, missing receipt or
  detached descendant before the first GitHub request. A green build, clean
  post-run projection, seal or provider upload without this OS execution proof
  is terminal.
- Any source-execution proof failure yields
  `PRODUCER_SOURCE_EXECUTION_INVALID` with retry class `never`, preserves the
  loaded readiness actor byte-for-byte and starts no GitHub/provider child.
- The loaded candidate and seal are the only downstream identity authority. The
  request cannot supply, replace or narrow either value.
- Event ownership and order are exact:

```text
producer emits immutable TestedDistSealV1
  -> release-readiness controller CAS-ingests RC_SEAL_INGESTED into audited actor
  -> reducer validates the seal and commits actor state rc_built
  -> producer completes transport attestation/upload
  -> consumer loads that exact rc_built actor/context SHA-256
  -> consumer verifies downloaded transport and runtime
  -> consumer readiness adapter CAS-ingests RELEASE_PAYLOAD_VERIFIED_INGESTED
     with the exact observation+verification+byte snapshot into the same actor
  -> reducer remains rc_built with both values single-assigned
  -> package journal reservation may begin
```

The producer never directly mutates readiness state, and the consumer never
emits `RC_SEAL_INGESTED`. Both reducer events are submitted through the
release-readiness controller. `RELEASE_PAYLOAD_VERIFIED_INGESTED` is illegal
until the durable `RC_SEAL_INGESTED` result has been loaded and matched.

### Closed signed-handoff and policy projection

The consumer introduces no new producer receipt. It reuses the producer model's
exact `ProducerTerminalRecordV1`, its signed
`ProducerTerminalPublicationReceiptV1`, complete `ProducerTerminalEnvelopeV1`
and common `ArtifactPublicationJoinV1`, then constructs this
release-readiness-compatible private projection:

```ts
interface ProviderArtifactFactsV1 {
  artifactId: string;
  name: 'missionpulse-sealed-candidate';
  bytes: number;
  digest: Sha256;
  expired: false;
  createdAt: CanonicalUtcTimestamp;
  expiresAt: CanonicalUtcTimestamp;
  workflowRunId: string;
  headSha: string;
}

interface ClosedTransportHandoffV1 {
  signedAttestation: GitHubTransportAttestationV1;
  producerTerminalRecordSha256: Sha256;
  producerTerminalPublicationReceiptSha256: Sha256;
  producerTerminalEnvelopeSha256: Sha256;
  producerSagaTerminalSnapshotSha256: Sha256;
  producerPublicationJoin: ArtifactPublicationJoinV1;
  transportAttestationPolicySha256: Sha256;
  workflowBlobSha256: Sha256;
  privilegedJobProjectionSha256: Sha256;
  providerArtifact: ProviderArtifactFactsV1;
  downloadedTransportSha256: Sha256;
}
```

`signedAttestation` is the sole **GitHub/Sigstore-signed** handoff component; it
is derived only after Sigstore verification from the existing
`GitHubTransportAttestationV1`. After G0 loads the actor and before any GitHub
request, the consumer's fixed producer-terminal adapter derives the sole URI
from `candidate.producerTerminalReadAuthority`, the actor ID and the request's
canonical run ID/attempt. It performs exactly one direct credentialless GET,
follows no redirect, validates the candidate-frozen origin/TLS SPKI/media type,
streams no more than 25,165,824 bytes, and requires exact Content-Length, ETag
`"sha256:{recordSha256}"` and immutable cache control. No caller URI, path,
record, snapshot, receipt or join is accepted.

URI construction substitutes the actor ID using the authority's exact
`rfc3986-uppercase-percent-v1` rule, substitutes run ID as its unchanged
canonical positive-decimal bytes, and substitutes run attempt as canonical
positive decimal ASCII. It rejects slash injection, lowercase percent hex,
double encoding, normalization, query, fragment, userinfo, alternate port or
any non-template path before the request is sent.

The adapter rejects duplicate JSON keys and requires the response bytes to be
exact RFC 8785 JCS of one `ProducerTerminalRecordV1`. It recomputes the record
self-digest; verifies the publication receipt self-digest, domain-separated
Ed25519 signature and immutable URI under the exact candidate-bound receipt
key; requires its catalog-port policy digest to equal the candidate-bound read
authority; decodes and byte-recomputes the complete terminal envelope; and validates
its complete gapless immutable snapshot sequence/hash chain. The unique last
snapshot must be `uploaded_digest_verified`; its sole artifact and the
envelope's common `ArtifactPublicationJoinV1` must be exact-JCS-equal. Actor,
release, source commit, repository, workflow, job, canonical run ID, attempt,
rc-built context digest, seal-ingestion receipt and every correlation field
must equal G0/request authority. The envelope's complete `ProducerHandoffV1`
must pass its self-digest and controller/transport/readiness guards, equal every
chain handoff digest, and equal the publication join's handoff digest. Its
candidate, audit and seal digest fields must equal the complete exact values
already loaded from the G0 readiness actor; no handoff-carried duplicate bytes
exist. Its complete constructor and rc-seal receipts must verify under the
candidate-frozen catalog keys and form the exact audited-context to
rc-built-context CAS chain loaded by G0. The complete terminal disposition
receipt must verify under the same keys, equal the terminal snapshot's digest,
prove active_for_consumer/producer-upload-joined with both remote effects
confirmed, and contain no readiness mutation. A runner-local saga directory,
GitHub step output, terminal snapshot without this signed record, partial chain or
independently supplied join has zero consumer authority.

The join's `actionOutput.artifactDigest` is the only authority for the dynamic
uploader output digest; its equality with local transport, signed subject and
the producer's captured bytes was already closed by the producer guard, and the
consumer revalidates the complete join rather than trusting that field.

The policy and workflow hashes come only from the G0 candidate. Fresh provider
artifact facts come only from the authenticated REST response, and the
downloaded digest comes only from captured bytes. The tuple is frozen only
after the signed attestation, signed durable producer terminal record/join,
policy, fresh provider facts and downloaded bytes agree on subject digest,
canonical run ID/attempt and head SHA.
It is private, non-persisted transition authority and adds no field to
`SealedCandidateTransportObservationV1`. That observation's
`uploaderOutputDigest` is projected exactly from the validated producer join,
never from REST or from policy.

The authority boundary is explicit: GitHub's artifact REST representation does
not expose uploader job ID, run attempt, direct-upload mode or requested
retention input. The consumer neither reads nor infers those fields from that
representation. Run attempt and signer workflow come from the verified signed
attestation plus independently authenticated run-attempt metadata. The
`archive:false`, `overwrite:false`, `retention-days:30`, pinned uploader and
ordered producing job topology come from the exact candidate-bound workflow
policy. API `created_at`/`expires_at` remain observed provider facts and are
never reverse-translated into requested retention. No job-ID claim is inferred,
and dynamic action output is never synthesized from policy, matching
release-readiness clarification 11.

### G1 — exact GitHub observation

- The first `provider-observation` invocation performs the one exact
  candidate-authorized producer-terminal GET and validates the complete signed
  record/envelope/chain/join above. That immutable release-control response is
  not a GitHub provider-epoch member and is never re-fetched or ETag-revalidated
  inside this attempt. Only then does the same cumulative invocation perform
  every initial GitHub first-party read, including the credentialed
  artifact-download request and its single redirect response. Only after all
  bounded operations pass may `PROVIDER_OBSERVATION_CAPTURED` enter
  `downloading_transport`.
- Every first-party request uses exactly origin `https://api.github.com`, HTTPS
  default port, `Accept: application/vnd.github+json`,
  `X-GitHub-Api-Version: 2026-03-10`, `redirect: manual`, and no cookies or
  ambient proxy. Owner/repository/path segments are canonical percent-encoded;
  userinfo, fragments, alternate ports/origins and GraphQL are forbidden.
- The read-only token is captured once from the fixed CI secret channel and may
  have only repository `actions:read`, `attestations:read` and `contents:read`.
  `Authorization: Bearer <token>` is sent only to exact origin
  `https://api.github.com`; the token is never placed in a URL, redirect,
  context, receipt, log or download-origin request. `Set-Cookie` rejects and no
  cookie jar exists.
- Fetch run-attempt metadata only from
  `/repos/{owner}/{repo}/actions/runs/{runId}/attempts/{runAttempt}` and workflow
  bytes only from
  `/repos/{owner}/{repo}/contents/.github/workflows/ci.yml?ref={headSha}`;
  require the returned regular blob bytes and Git blob identity to match the G0
  candidate's embedded workflow blob/digest. Fetch exactly page 1 of
  `/repos/{owner}/{repo}/actions/runs/{runId}/artifacts?name=missionpulse-sealed-candidate&per_page=100&page=1&direction=asc`.
  Require `total_count === 1`, one array entry and no `Link rel="next"`; a second
  page is ambiguity, not a continuation.
- Fetch exactly page 1 of
  `/repos/{owner}/{repo}/attestations/sha256:{transportDigest}?predicate_type=provenance&per_page=100`
  with no `before`/`after` cursor. Require no next link and exactly one bundle
  that later passes G3; zero, multiple or cursor-bearing responses reject.
- Every status-`200` provider JSON/blob response must carry one bounded
  syntactically valid `ETag`. Capture the exact ETag bytes and freeze the exact
  ordered set of those ETag-bearing request descriptors. After download,
  `revalidating_provider` starts a new persisted invocation charged to the same
  cumulative `provider-observation` counter, reissues exactly that frozen set
  with each descriptor's exact `If-None-Match`, and requires `304` with no
  representation body. The credentialed artifact-download request whose
  required initial result is `302` is not in that set, is never assigned an
  ETag, and is not reissued. Only the exact
  `PROVIDER_EPOCH_REVALIDATED` result may enter G3. A missing/extra/reordered
  descriptor, 200, changed/missing ETag, endpoint/query drift or mixed
  initial/revalidation result rejects the whole observation epoch.
- Independently require run-attempt metadata for the requested repository,
  workflow path, `runId`, `runAttempt`, head SHA, main ref and successful
  conclusion. This authenticates the requested run attempt; it is not treated
  as an artifact field.
- Select exactly one REST artifact whose exposed fields match literal name,
  `workflow_run.id == runId`, `workflow_run.head_sha == headSha`, repository
  IDs, nonexpired status, exact canonical artifact ID/digest/byte count and
  creation/expiry chronology. Zero/multiple matches reject; order is never a
  tie-break. No artifact-job or artifact-attempt predicate exists.
- Select exactly one applicable attestation by authenticated subject name and
  digest. Zero/multiple applicable bundles reject.

### G2 — exact downloaded blob

- During the first `provider-observation` invocation, request exactly
  `https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{artifactId}/zip`
  with the first-party headers above and manual redirects. Require exactly one
  `302` with one `Location` and no body used as authority.
- `downloading_transport` then canonicalizes that captured single `Location`
  once. Require HTTPS, port 443/default, no
  userinfo/fragment, a DNS hostname rather than an IP literal, and no loopback,
  link-local, private, multicast or metadata-address resolution. Pin the public
  resolution for the connection and require TLS hostname plus connected remote
  address to match. Record the exact full URL and exact origin; patterns,
  suffixes and caller allowlists are not origin authority.
- Perform exactly one credentialless `GET` to that exact full URL with
  `redirect: manual`. Send no Authorization, Cookie, Proxy-Authorization,
  GitHub token or first-party ETag. Require status `200`; any second Location,
  redirect or origin change rejects.
- Read one response body to EOF into one buffer bounded by
  `maxSealedCandidateTransportBytes`; declared length, if present, must agree.
- No range concatenation, resume, transparent repack, pathname reopen or second
  download may replace captured bytes.
- Recomputed SHA-256 must equal the single normalized GitHub
  `sha256:<64 lowercase hex>` digest.

### G3 — attestation and workflow authority

- Strictly parse the complete bounded Sigstore bundle; recompute RFC 8785 JCS
  and its digest.
- Verify DSSE signature, certificate chain, pinned trusted root, transparency
  proof and inclusion material through the candidate's exact policy.
- Derive repository, main ref, workflow path/ref/SHA, run, attempt and head SHA
  from authenticated claims, never unverified projections.
- Require SLSA predicate type `https://slsa.dev/provenance/v1`; infer no absent
  job ID and attribute no run-attempt field to REST artifact metadata.
- Revalidate the producer publication join and require exact equality of
  attested subject, its handoff/controller/captured pre-upload digest,
  `producerPublicationJoin.actionOutput.artifactDigest`, fresh GitHub artifact
  digest and downloaded digest. Policy proves upload inputs but cannot supply or
  synthesize that dynamic action output.
- Re-read the complete workflow blob at `headSha`; strictly rederive exact job
  permissions, step order/inputs/env and exhaustive literal SHA40 `uses`
  inventory. Reject tags, branches, short SHAs, expressions, local actions,
  Docker/services, reusable workflows, matrices or extra privileged steps.
- From that policy projection alone, require the pinned upload action and exact
  `archive:false`, `overwrite:false`, `retention-days:30`, single literal path
  and `if-no-files-found:error` inputs. Provider creation/expiry times cannot
  substitute for this proof.
- Construct `ClosedTransportHandoffV1` only after signed subject digest,
  terminal producer publication join/action output, fresh provider artifact
  digest, downloaded digest, source commit, run ID and the independently
  authenticated signed run-attempt projection all cross-bind.

No ZIP parsing or extraction occurs before G3 passes.

### G4 — canonical transport and seal

- Verify the complete canonical non-ZIP64 ZIP contract from the captured buffer:
  exact headers, offsets, UTF-8 names, STORE method, order, timestamp, modes,
  CRCs/sizes and no extras, comments, descriptors or trailing bytes.
- Require exactly these seven logical top-level components:

```text
tested-dist-seal.json
dist/
release-controller.bundle.mjs
release-execution-authority.json
build-metadata.json
build-provenance.json
release-execution-image.oci.tar
```

- Safe-extract into a fresh private root with descriptor-relative no-follow
  operations. Reject traversal, duplicate/colliding paths, aliases, hard links,
  symlinks, special objects and extra roots.
- Verify exact bounded JCS seal bytes, self-digest, identity, chronology and
  complete prior gates. The JCS bytes and all candidate/seal fields must equal
  the G0 readiness snapshot's exact seal and candidate; internally consistent
  alternate candidate/seal bytes reject.
- Require the seal's exact six-entry non-self inventory to match metadata,
  provenance, `dist`, controller bundle, execution authority and OCI archive
  byte-for-byte; bind the same bytes in the transport ZIP receipt.

### G5 — payload and controller execution authority

- Verify canonical BuildKit metadata and SLSA provenance against exact recipe,
  context, materials and proved OCI manifest.
- Cross-bind `ReleaseExecutionAuthorityV1` to candidate/source, controller source
  inventory, invocation policy, Python runtime/effective objects and full OCI
  graph.
- Open the OCI tar no-follow, capture it once and verify unique index, manifest,
  config, ordered layers/diff IDs, root inventory, annotations and
  `linux/amd64` platform from that buffer.
- Authenticate exactly five evidence files: metadata, provenance, transported
  execution authority, seal and transport ZIP receipt.
- Derive clarification-3 `verificationId`, then controller authority JCS and
  `authoritySha256` without a digest cycle. Exclusively create/recapture the
  derived sixth evidence file and require exactly six regular evidence files.
- Retain every source descriptor and exact identity/byte/tree snapshot through
  host admission, Docker child completion and postflight.

Only after G1–G5 pass may the private state transition register one
`VerifiedTransportPayloadCapabilityV1`.

### G6 — host admission and one-shot capability

- Entering `admitting_host` invokes only the fixed production admission actor.
  Its non-async synchronous prologue checks
  `process.platform === "linux"` and `process.arch === "x64"` before inspecting
  token identity, proxy, getter, private record or candidate bytes.
- After that host check, the same synchronous prologue requires the exact live
  token in both private registries and deletes it from both before constructing
  or awaiting any Promise and before any success/failure return.
- Re-derive/reverify controller authority and all descriptor snapshots during
  admission; a raw record transfer is forbidden.
- Register exactly one frozen one-shot host admission in a second private
  `WeakSet`/`WeakMap` pair.
- `HOST_ADMITTED` is only the invocation's private completion result. Its
  handler validates actor/attempt, authority digest and registered-admission
  identity and persists the bounded host-admission receipt only. Entry into the
  resulting `runtime_executing` state invokes runtime; this event does not
  perform host check, payload-token lookup/consumption, admission creation or
  runtime work.

### G7 — OCI runtime and receipt

- Entering `runtime_executing` invokes only the fixed production runtime actor.
  Its non-async synchronous prologue requires and deletes the exact admission
  from both private registries before constructing/awaiting any Promise and
  before inspection, load or other Docker access.
- Feed captured OCI bytes to `docker load` over stdin; never pass/reopen its path
  and never pull.
- Require exact local tag `missionpulse-release-runtime:sealed-candidate`, then
  re-inspect `linux/amd64` and execute only
  `missionpulse-release-runtime@sha256:<manifestSha256>` with `--pull=never`.
- Enforce read-only root, no network, all capabilities dropped, no new
  privileges, UID/GID 65532, bounded PIDs, bounded hardened tmpfs mounts and
  only three descriptor-derived read-only inputs.
- Derive mount sources only from retained `/proc/<hostPid>/fd/<fd>` handles;
  revalidate descriptor identities and full snapshots immediately before child
  start and after completion.
- Accept one strict bounded `ReleaseExecutionPayloadVerificationV1` only if its
  self-digest, clarification-3 ID, `controllerExecutionAuthoritySha256` and every
  payload/runtime digest equal captured authority. Extra stdout/stderr,
  wrong exit/signal or drift rejects.
- `RUNTIME_VERIFIED` is only the invocation's private completion result. Its
  handler validates/cross-binds and persists the receipt; it never consumes an
  admission or starts Docker.

### G8 — durable ingestion and package-only validation

- Before V, assemble exactly one `ReleasePayloadByteSnapshotV1` from the
  still-open, postflight-revalidated private byte record. No path reopen,
  alternate serialization or receipt synthesis is permitted. Parse with the
  imported parent limits and call only the imported
  `verifyPayloadByteSnapshot`; the result must be the imported exact
  `VerifiedReleasePayloadProjectionV1`. Freeze the snapshot, projection and
  imported accepted-event record in one private
  `TransientPayloadVerificationRecordV1`. The exact snapshot is carried with
  the observation and verification as one event:

```ts
interface CommitActorRequestV1 {
  readonly actorId: string;
  readonly expectedContextSha256: string;
  readonly nextContext: ReleaseReadinessContextV1;
}
```

- Submit that exact event to the G0 actor. The readiness reducer validates the
  snapshot plus both receipts through the same imported parent verifier,
  derives the next context, and commits through the existing
  `CommitActorRequestV1` CAS with the exact
  `actorId + expectedContextSha256`. Only a successful durable commit may enter
  `payload_verified`. The returned context is rehashed as
  `readinessContextSha256`; it must retain observation, verification and exactly
  the imported `AcceptedPayloadVerificationLocalEventV1` whose stable tuple is
  `[attestationId, verificationId, snapshotId]` and whose `eventSha256` covers
  the complete canonical V event including every transient snapshot byte. It
  must retain neither snapshot nor verified projection. The consumer then
  clears its private transient record. No actor/registry revision exists in
  this protocol.
- On `ACTOR_CAS_CONFLICT`, re-read only the same `actorId` and recompute its
  context SHA-256. Accept only (a) the same candidate, seal and `rc_built` state
  with both V fields still null and no pending restart, then resubmit the
  byte-identical event under that fresh `expectedContextSha256`, or (b) the
  byte-identical already-accepted event/receipts, treated by the reducer as an
  idempotent acknowledgement. Any other context, state or bytes reject as
  `READINESS_CAS_CONFLICT`; provider and Docker effects are never replayed.
- On exact already-accepted acknowledgement after CAS conflict, the durable
  observation, verification, stable three-ID tuple and full event hash must
  match the private event byte-for-byte; neither missing durable IDs/hash nor a
  durable snapshot/projection can be accepted. The private transient record is
  then cleared without rerunning provider, OCI or byte-verification effects.
- Require `observedAt <= verifiedAt < packageJournal.reserved.at` and artifact
  expiry after verification.
- Run only the existing exclusive-lock, no-follow snapshot, normalization, twin
  canonical ZIP, safe extraction, sidecar/JCS, no-replace publication, journal
  and catalog-CAS protocol.
- Never install, build, bump version, edit manifest, resolve connectors or
  mutate tested `dist`.
- Success requires journal phase `published` and one exact
  `ValidatedZipArtifactV1`; after every journal/artifact CAS, the consumer
  replaces its current context SHA-256 with the returned context hash. The
  success value carries the final published context hash. Command exit alone
  has no authority.

## 6. Errors, retries, cancellation and restart

```ts
type SealedCandidateConsumerErrorCode =
  | 'INVALID_REQUEST'
  | 'READINESS_STORE_UNAVAILABLE'
  | 'READINESS_ACTOR_NOT_ADMITTED'
  | 'READINESS_CAS_CONFLICT'
  | 'PRODUCER_SOURCE_EXECUTION_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_OBSERVATION_AMBIGUOUS'
  | 'GITHUB_PROTOCOL_INVALID'
  | 'DOWNLOAD_INTERRUPTED'
  | 'TRANSPORT_DIGEST_DIVERGENT'
  | 'ATTESTATION_INVALID'
  | 'ATTESTATION_AMBIGUOUS'
  | 'WORKFLOW_AUTHORITY_DIVERGENT'
  | 'TRANSPORT_INVALID'
  | 'PAYLOAD_AUTHORITY_INVALID'
  | 'CAPABILITY_INVALID_OR_REPLAYED'
  | 'HOST_UNSUPPORTED'
  | 'OCI_RUNTIME_INVALID'
  | 'RECEIPT_INGESTION_FAILED'
  | 'PACKAGE_VALIDATION_FAILED'
  | 'PACKAGE_RECOVERY_AMBIGUOUS'
  | 'EPHEMERAL_AUTHORITY_LOST'
  | 'POST_V_PRE_JOURNAL_CRASH'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLATION_ALREADY_STARTED'
  | 'CLEANUP_AMBIGUOUS'
  | 'UNAUTHORIZED_INTERNAL_EVENT';

interface SealedCandidateConsumerErrorV1 {
  schema: 'missionpulse.sealed-candidate-consumer-error';
  version: 1;
  consumerId: string;
  attemptId: string;
  code: SealedCandidateConsumerErrorCode;
  retryClass: 'never' | 'fresh-read-attempt';
  observedAt: CanonicalUtcTimestamp;
  evidenceSha256: Sha256 | null;
}
```

Only `READINESS_STORE_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`,
`DOWNLOAD_INTERRUPTED`, or `EPHEMERAL_AUTHORITY_LOST` in one of the explicit
pre-authority restart rows below may derive `fresh-read-attempt`. Retry is never
automatic and requires: same actor/run, new attempt ID, no capability, Docker,
receipt or package effect, and proven cleanup of every partial resource. It
restarts at `loading_readiness_actor`; candidate, seal, bytes and provider
projections are all reloaded rather than reused.

Every ambiguity, digest/signature/canonical failure, unsupported host,
capability replay, runtime failure or package failure is nonretryable in the
actor. `DEADLINE_EXCEEDED` and `POST_V_PRE_JOURNAL_CRASH` are always
nonretryable for that request/candidate. Package journal recovery is not retry
and never reruns provider or Docker effects.

### One-shot cancellation and deadline cleanup matrix

The first valid cancel in any nonterminal state except `cancelling`, or the
first exact deadline event, atomically freezes one cleanup trigger and plan,
then enters `cancelling`. The state-to-plan mapping is closed:

| Consumer state when trigger commits                                                                                  | Frozen plan         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `loading_readiness_actor` through `runtime_executing`, before the `RUNTIME_VERIFIED` handler commits V; `retry_wait` | `private-only`      |
| `payload_verified`                                                                                                   | `invalidate-post-v` |
| `package_validating` or `package_recovering`, regardless of the actor's last locally cached J projection             | `reconcile-journal` |

No trigger is accepted from `created` or a terminal state because no request
identity/deadline authority exists there. The single cleanup actor first
stops and joins the current child, charges its final elapsed budget, revokes
both capability registries, closes descriptors and rereads the exact readiness
actor before any path deletion or readiness mutation. The child itself is one
closed invoked XState actor with the following finite transition matrix; it
does not reenter parent `cancelling`, recursively invoke itself or start
provider/Docker work:

| Plan / durable actor observation                                                 | Mandatory effect and proof before result                               | Disposition                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `private-only`; no actor loaded                                                  | prove no V, J, package path or local child effect                      | `private-clean`                 |
| `private-only`; exact G0 actor still has V/J/artifact null                       | same context hash, close/remove only private pre-V resources           | `private-clean`                 |
| `private-only`; any V, J or artifact appears                                     | no mutation; durable effect boundary is unexplained                    | `CLEANUP_FAILED`                |
| `invalidate-post-v`; exact V is durable and J/artifact are null                  | CAS-ingest the exact invalidation below and reread blocked actor       | `post-v-blocked`                |
| `reconcile-journal`; exact V is durable and J is null                            | same exact post-V invalidation CAS                                     | `post-v-blocked`                |
| `reconcile-journal`; J is nonterminal                                            | run only the existing observed journal-recovery protocol to one end    | continue inside this invocation |
| `reconcile-journal`; J is `cleaned`, artifact null                               | CAS-ingest exact invalidation; reread blocked actor preserving clean J | `journal-cleaned-blocked`       |
| `reconcile-journal`; J is `published` with exact durable artifact/catalog CAS    | revalidate complete published context; perform no cleanup mutation     | `publication-completed`         |
| any plan; foreign/divergent actor, V, J, artifact, context or catalog projection | no mutation or deletion                                                | `CLEANUP_FAILED`                |

Journal recovery is bounded by the existing maximum journal history and permits
only the unique next transition already authorized by
`SERVICE_RESTARTED -> LOCAL_RELEASE_OBSERVATION_INGESTED`. It may observe or
complete cleanup, or recognize an already completed publication. It may not
resume ordinary package construction. If recovery observes publication, the
parent enters `package_validated`: a late cancel or deadline cannot relabel an
already durable artifact as cancelled. If recovery reaches `cleaned`, the
candidate is blocked before `cancelled`; no live nonterminal journal remains.

The post-V invalidation is one exact `LOCAL_EVIDENCE_INVALIDATED` event with
existing code `LOCAL_GATE_INVALID`, stage
`consumer-cancelled-post-v` or `consumer-deadline-post-v`, the current release
ID and `cleanupInvocationId` as its correlated evidence digest. It is submitted
through the readiness controller using the exact current
`actorId + expectedContextSha256`. Success requires a reread proving state
`blocked`, byte-identical candidate/seal/V receipts, unchanged null or cleaned
J as applicable, null artifact and the accepted invalidation event digest. An
actor CAS conflict permits only a reread of the same actor and either the exact
already-accepted invalidation or one byte-identical resubmission while the same
precondition still holds. A newly appeared J, publication, replacement,
different error or receipt is ambiguity, not authority to broaden the plan.

Only `private-clean`, `post-v-blocked`, or `journal-cleaned-blocked` may enter
`cancelled`. Thus neither a single-assigned V nor a nonterminal J is orphaned in
an apparently cancellable `rc_built` actor. The later fresh-candidate protocols
remain those in the post-V section below; cleanup never invents a candidate or
catalog abandonment.

A byte-identical operator cancel redelivery in `cancelling` is an internal
no-op without state reentry. Any other cancel is rejected as
`CANCELLATION_ALREADY_STARTED` without changing context, stopping another child
or emitting another cleanup effect. Generic `STAGE_FAILED` handling excludes
`cancelling`; only the correlated cleanup result can leave it. Deadline expiry,
restart, ambiguous cleanup or exhaustion of the reserved cleanup budget yields
`rejected/CLEANUP_AMBIGUOUS`, never `cancelled`.

Before applying a restart row, the actor charges the persisted active
invocation's full allocation, advances `maxObservedWallAt`, and recomputes only
the remaining non-extending process-monotonic budget. A wall sample below the
persisted maximum is deadline ambiguity and cannot start fresh work. The five
`retry_wait` targets below are legal only while both the work deadline and
corresponding cumulative stage budget remain. Otherwise restart enters the same
deadline cleanup plan; an already expired hard deadline can only yield the
row's fail-closed durable classification, never fresh work or `cancelled`.

Restart handling is exhaustive:

| Persisted state               | Target               | Exact restart effect                                                                                                                  |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `created`                     | `created`            | exact no-op; no request or authority exists                                                                                           |
| `loading_readiness_actor`     | `retry_wait`         | cancel lost read actor; record retryable `EPHEMERAL_AUTHORITY_LOST`; retain actor/run selectors only                                  |
| `observing_provider`          | `retry_wait`         | cancel API actor; discard envelope/ETags; record retryable `EPHEMERAL_AUTHORITY_LOST`                                                 |
| `downloading_transport`       | `retry_wait`         | abort stream; discard all partial bytes/redirect facts; record retryable `EPHEMERAL_AUTHORITY_LOST`                                   |
| `revalidating_provider`       | `retry_wait`         | cancel revalidation; discard downloaded buffer and complete observation epoch; record retryable `EPHEMERAL_AUTHORITY_LOST`            |
| `verifying_attestation`       | `retry_wait`         | cancel verifier; discard unaccepted buffer/envelope; record retryable `EPHEMERAL_AUTHORITY_LOST`                                      |
| `verifying_transport`         | `rejected`           | close/discard extraction descriptors/root; record nonretryable `EPHEMERAL_AUTHORITY_LOST`                                             |
| `verifying_payload_authority` | `rejected`           | close all retained descriptors and derived temporary authority; record nonretryable `EPHEMERAL_AUTHORITY_LOST`                        |
| `capability_ready`            | `rejected`           | revoke payload token/record; close descriptors; never reconstruct capability                                                          |
| `admitting_host`              | `rejected`           | revoke any surviving payload/admission record; admission outcome is unknown and never replayed                                        |
| `runtime_executing`           | `rejected`           | treat Docker outcome as unknown; if V is already durable while J is null, record `POST_V_PRE_JOURNAL_CRASH`; otherwise never ingest V |
| `payload_verified`            | `rejected`           | V is durable but J is null; record `POST_V_PRE_JOURNAL_CRASH`, abandon this candidate and never resume or rerun runtime               |
| `package_validating`, J null  | `rejected`           | V is durable but first journal reservation was not; record `POST_V_PRE_JOURNAL_CRASH` and abandon this candidate                      |
| `package_validating`, J set   | `package_recovering` | do not rerun provider/runtime; invoke exact readiness `SERVICE_RESTARTED -> LOCAL_RELEASE_OBSERVATION_INGESTED` journal protocol      |
| `package_recovering`, J null  | `rejected`           | impossible under a valid entry; fail closed as `POST_V_PRE_JOURNAL_CRASH` rather than synthesize recovery authority                   |
| `package_recovering`, J set   | `package_recovering` | renew only the correlated local observation protocol; apply no package effect before observed unique recovery                         |
| `retry_wait`                  | `retry_wait`         | exact no-op; user must request a fresh attempt                                                                                        |
| `cancelling`                  | `rejected`           | cancellation outcome/cleanup is unknown; record `CLEANUP_AMBIGUOUS`, never infer cancelled                                            |
| `package_validated`           | `package_validated`  | exact terminal no-op                                                                                                                  |
| `rejected`                    | `rejected`           | exact terminal no-op                                                                                                                  |
| `cancelled`                   | `cancelled`          | exact terminal no-op                                                                                                                  |

No restart row reconstructs downloaded bytes, descriptors, a capability or an
admission. The paired guarded `package_validating` and `package_recovering` rows
are mutually exclusive and exhaustive on the durable readiness actor's
`packageJournal` value. A valid `PACKAGE_RECOVERY_REQUIRED` entry already
implies nonnull J; the null row is the fail-closed persistence-corruption case.

### Post-V/pre-journal crash abandonment and replacement

A crash after the V actor CAS commits and before the first
`PACKAGE_JOURNAL_INGESTED` commit is an irrevocable boundary for that candidate,
including the subwindow where the consumer still persisted
`runtime_executing`, already persisted `payload_verified`, or entered
`package_validating` without a journal. After restart, the durable readiness
residue is exactly:

```ts
interface PostVPreJournalReadinessResidueV1 {
  state: 'rc_built';
  actorId: string;
  candidate: CandidateIdentityV1; // unchanged
  seal: TestedDistSealV1; // unchanged
  transportObservation: SealedCandidateTransportObservationV1; // V, assigned once
  payloadVerification: ReleaseExecutionPayloadVerificationV1; // V, assigned once
  packageJournal: null;
  packageJournalIdentity: null;
  artifact: null;
  pendingRestart: null;
  // acceptedLocalEvents contains exactly one
  // AcceptedPayloadVerificationLocalEventV1 with
  // [attestationId, verificationId, snapshotId] plus eventSha256.
  // payloadByteSnapshot and verifiedProjection are not present.
}
```

The consumer durably enters `rejected/POST_V_PRE_JOURNAL_CRASH`, cleans only its
unambiguous private paths, and never reopens provider bytes, reruns Docker,
re-emits V, creates J for the old candidate or treats the event digest as byte
authority. The readiness residue remains `rc_built` until the controller
explicitly applies one of the following existing release-readiness protocols:

1. **In-actor replacement.** Ingest `LOCAL_EVIDENCE_INVALIDATED` with a typed
   `ReleaseReadinessError` using existing code `LOCAL_GATE_INVALID`, stage
   `consumer-post-v-pre-journal-crash`, the old `releaseId` and the correlated
   evidence hash. This moves `rc_built -> blocked` while preserving the old V
   receipts. Then submit `NEW_CANDIDATE_INGESTED` only with a fresh candidate,
   complete audit and catalog revision. With J null and a different namespace,
   the replacement closure is `no_journal`; reusing the unpublished old
   namespace additionally requires the exact correlated restart observation
   proving both staging and final paths absent. The actor-context CAS uses
   `actorId + expectedContextSha256`, and the same transaction performs the
   catalog CAS, archives the complete old context, abandons its active
   reservation, reserves the new identity, clears current seal/V/J/artifact and
   returns to `audited`.
2. **Distinct new actor.** First ingest the same
   `LOCAL_EVIDENCE_INVALIDATED` so the old actor is durably blocked, then reserve
   a genuinely new release ID and different globally available namespace
   through the ordinary atomic actor factory/catalog CAS. The old actor and its
   reservation remain immutable evidence; no field or receipt is copied into
   the new actor.

Either path requires a new clean candidate/audit, final seal, transport and
consumer pass. Neither path resumes the abandoned candidate. Any attempt to
replace directly from `rc_built`, discard the single-assigned V receipts, reuse
a published namespace, bypass closure proof or mutate the old actor is rejected.

## 7. Fail-closed hostile matrix

| Hostile or ambiguous case                                                          | Must reject before                  |
| ---------------------------------------------------------------------------------- | ----------------------------------- |
| caller-supplied candidate/seal or readiness context SHA-256/state mismatch         | first GitHub request                |
| `RELEASE_PAYLOAD_VERIFIED_INGESTED` before durable `RC_SEAL_INGESTED`/`rc_built`   | readiness mutation                  |
| missing/extra/noncanonical/bounds-breaking payload byte snapshot field             | readiness mutation                  |
| second nonidentical cancel or exact duplicate that reenters/spawns cleanup         | second cleanup effect               |
| extended/replaced deadline, stale watcher generation, reset/undercharged stage     | child invocation                    |
| cancel/deadline after V that skips durable invalidation or J recovery              | `cancelled`                         |
| REST artifact projection invents job, run-attempt, direct mode or requested TTL    | handoff authority                   |
| missing/divergent producer terminal join or uploader digest inferred from REST     | handoff authority                   |
| zero/multiple artifacts or attestations; changing pagination                       | download authority                  |
| redirect API call or ETag revalidation outside cumulative provider budget          | download authority                  |
| page 2/cursor, missing/changing ETag, mixed observation epoch                      | attestation verification            |
| alternate API origin/version/path/query, automatic redirect or ambient proxy       | provider response use               |
| API credential on redirect target, cookie, second redirect/origin or private IP    | download body read                  |
| forged API projection with valid repository/run tuple                              | ZIP parsing                         |
| invalid DSSE/chain/root/transparency proof                                         | ZIP parsing                         |
| alternate workflow/ref/blob; mutable/unlisted action; injected privileged step     | ZIP parsing                         |
| artifact/uploader/attestation/download digest divergence                           | ZIP parsing                         |
| partial/resumed/repacked/second download                                           | ZIP parsing                         |
| duplicate, traversal, Unicode/case collision, link, special or extra ZIP object    | extraction completion               |
| byte-different “equivalent” JSON/JCS                                               | capability registration             |
| changed seal or any of six payload entries                                         | capability registration             |
| alternate metadata/provenance/controller/authority with recomputed local digests   | capability registration             |
| extra/missing OCI object, multiple manifest, wrong platform/annotation/layer graph | capability registration             |
| raw DTO, cast, forged brand, proxy, getter or environment bypass                   | token record access                 |
| non-Linux or non-x64 host                                                          | token/proxy/getter/candidate access |
| forged `HOST_ADMITTED` used to trigger host check/token consume/admission creation | token record access                 |
| second token/admission use                                                         | Docker access                       |
| forged `RUNTIME_VERIFIED` used to consume admission/start Docker                   | Docker access                       |
| caller Docker port/callback/options/second argument/test hook                      | Docker access                       |
| OCI path reopen, tag-only/config-digest reference, pull or different local graph   | controller start                    |
| descriptor close/reuse/swap, symlink retarget, same-size mutation                  | controller start or success         |
| Python/env/loader injection, writable root/mount, Docker socket, excess privilege  | controller start                    |
| extra stdout/stderr, wrong exit/signal or forged receipt                           | receipt ingestion                   |
| package start before durable runtime proof                                         | first package write                 |
| restart after durable V but before first J tries to resume the abandoned candidate | first resumed provider/package work |
| rebuild/install/bump/edit or ambiguous journal recovery                            | artifact publication                |

Every mutation test asserts that a unique malicious sentinel was never created,
not merely that postflight later noticed the attack.

## 8. Invariants

1. One exact readiness actor `rc_built` context, admitted by
   `actorId + expectedContextSha256`, supplies the immutable candidate and seal;
   public input cannot supply either and no actor/registry revision substitutes.
2. The readiness controller durably accepts `RC_SEAL_INGESTED` before the
   consumer can load `rc_built`, and accepts the exact
   observation+verification+byte-snapshot V event only afterward into that same
   actor.
3. Snapshot limits, shape, verifier and verified projection are imported only
   from release-readiness clarification 11; the consumer contains no mirror,
   alternate parser, copied numeric limit or fallback verifier.
4. One actor binds one requested run attempt and readiness actor identity.
5. Every downstream digest names the same single captured artifact buffer.
6. The closed GitHub protocol uses one exact API origin/version, credential
   scope, one-page/ETag epoch and one credentialless exact redirect URL.
7. Attestation/workflow authority passes before ZIP parsing or extraction.
8. Transport has exactly seven components; payload has six non-self entries;
   evidence has five authenticated files plus one derived authority.
9. Clarification-3 `verificationId`, authority self-digest and receipt
   self-digest remain acyclic.
10. Capabilities are private, opaque, frozen, identity-based and one-shot.
11. Host check then payload-token consumption occurs synchronously inside the
    admission invocation before its first async boundary; `HOST_ADMITTED` only
    validates/persists the result.
12. Admission consumption occurs synchronously inside the runtime invocation
    before its first async boundary or Docker access; `RUNTIME_VERIFIED` only
    validates/persists the result.
13. Runtime accepts no raw DTO/path/bytes/port/options/callback/overload/hook.
14. No exported capability issuer/mint/registrar/brand/registry/test hook exists.
15. Candidate descriptors remain open and are fully revalidated around Docker.
16. Only the captured `linux/amd64` manifest digest may execute; no pull/rebuild.
17. Package reservation occurs only after durable runtime-proof ingestion.
18. Packaging is package-only and cannot modify tested candidate bytes.
19. Only listed typed events and guards transition; text and LLMs never decide.
20. Consumer provider access is read-only; it performs no external mutation.
21. First cancellation starts exactly one cleanup; exact redelivery is a no-op
    and a different second cancel has no cleanup or state effect.
22. Restart follows the exhaustive matrix and never reconstructs ephemeral
    authority.
23. Durable V with null J permanently abandons that candidate; neither V nor the
    accepted-event digest can resume provider, runtime or package work.
24. Replacement requires the explicit blocked/fresh-candidate/catalog-CAS
    protocol or a distinct actor/namespace; old V evidence is never rewritten.
25. Terminal states never start fresh work; exact duplicate observations are
    no-ops and divergent duplicates reject.
26. One persisted watcher identity enforces the 45-minute absolute request
    deadline through retry generations. Per-stage budgets, including both
    provider invocations, survive retries/restarts without reset or
    undercharging; ordinary work cannot consume the cleanup reserve.
27. `cancelled` is impossible after durable V/J until the same readiness actor
    is durably blocked with V preserved and J null/cleaned; observed publication
    instead yields `package_validated`.
28. REST contributes only its documented artifact fields. Signed attempt facts
    come from `GitHubTransportAttestationV1`; uploader mode/retention/topology
    come from the candidate's closed workflow policy; the dynamic uploader
    digest comes only from the validated terminal `ArtifactPublicationJoinV1`;
    no job ID is inferred.
29. The snapshot and verified projection are transient private authority only.
    Durable V retention is exactly observation, verification,
    `[attestationId, verificationId, snapshotId]` and the complete V-event
    SHA-256; durable snapshot/projection bytes are forbidden.
30. The consumer accepts only the parent V2 path/schema, exact ordered thirteen
    IDs and both exact hashes, and implementation remains blocked until exact
    clarification-11, producer-revision-11, MV3-revision-26,
    packaged-tab-revision-11 and CV-accessible-anchor-revision-6 model approvals.
31. Pre-activation verification consumes the ordered implemented set and emits
    only consumer-slot evidence. It cannot consume verification receipts, a
    verified set or activation, perform a provider request, or publish package
    authority.
32. No provider read occurs until candidate, audit, gate and controller-global
    activation agree on fixed-index projections from one complete ordered
    verified set, all eighteen role-distinct receipts and one final joint
    activation digest. Review, evidence or verification without activation has
    no consumer authority.
33. The signed producer terminal proves every executed project byte came from
    the candidate commit/tree's recursively read-only execution view with every
    addressable source ancestor read-only, zero overlays/tracked-path shadows,
    only the five closed output mounts, empty capability sets and the inherited
    seccomp/filesystem policy.
34. The seal, handoff and terminal contain exact prefix-extending ordered
    command receipts with matching pre/post mount/capability state. Git
    recapture is defense in depth only; temporary restoration, chmod, link,
    symlink, rename, remount, namespace escape, implicit output or detached
    descendant prevents the first provider read.

## 9. Verification and review gate

Required future tests:

- every allowed/forbidden transition, every restart row and all 34 invariants;
- real actor-context CAS conflict/idempotence tests using only
  `actorId + expectedContextSha256`;
- direct-import contract tests for the parent snapshot keys, Base64 field and
  reachable aggregate bounds, verifier and projection; source/AST scans must
  reject every local mirror/redeclaration/fallback;
- V2-only dependency tests for `scenarios.v2.json`, schema 2, the exact ordered
  thirteen IDs and both hashes, plus wrong model path/revision/behavior hash,
  missing/cross-role review/implementation/verification receipt, any of the six
  model-blob normalization failures, set reorder/projection drift across
  candidate/audit/gate and reviewed-but-unactivated joint authority;
- authority-set tests reproduce the reviewed, implemented, evidence and verified
  JCS preimages, reject every omission/extra/reorder/duplicate/cross-phase field,
  and prove verification receipts can be issued only from accepted evidence;
- phase-sandbox tests prove pre-activation verification accepts the implemented
  set only, rejects a verification receipt/verified set, emits consumer-slot
  evidence and performs no catalog, actor, provider, endpoint or artifact
  effect; the production consumer rejects until activation and real
  provider/runtime proof remains post-activation;
- producer-source tests mutate every materialization, immutable-source authority,
  command and pre/post receipt field, tracked source category, unexpected
  untracked path, cwd, loaded script/config origin and commit/tree join; the
  consumer rejects the signed terminal before its first GitHub request;
- hostile producer terminals with writable source/ancestor, backing-path/FD
  exposure, overlay or tracked-path bind shadow, unknown/late/nonempty output
  mount, Docker/containerd/buildkit/systemd socket, FUSE/helper broker,
  sudo/setuid/file-capability gain, `CAP_SYS_ADMIN` or any nonempty capability
  set, absent `no_new_privs`, widened seccomp, mount topology drift,
  missing/reordered prefix receipt or unjoined descendant reject before provider
  access;
- temporary byte rewrite-and-restore, same-byte rewrite, chmod-and-restore,
  hard-link, symlink, rename, mount/remount, namespace/chroot escape and an
  attacker-derived dist sentinel are exercised explicitly. A matching final Git
  projection cannot authorize any case;
- transient-lifetime tests proving the private snapshot/projection are cleared
  after CAS acknowledgement/failure and durable context retains only
  observation, verification, the three stable IDs and full V-event hash;
- first cancel, exact duplicate cancel, divergent second cancel and one-shot
  cleanup invocation/result correlation;
- initial/work/hard deadline boundaries, watcher generation/attempt
  correlation, every cumulative child budget, full-allocation restart charge,
  rollback/stale timeout, retry/restart/CAS non-reset and cleanup-reserve
  exhaustion;
- cancellation/deadline before V, after V with J null, across every J phase,
  cleaned invalidation, publication race and every ambiguous durable residue;
- every post-V/pre-J crash subwindow plus blocked replacement, same-namespace
  observed absence and distinct new-actor protocols;
- pure GitHub envelope, Sigstore, workflow, ZIP, seal, payload, provenance,
  authority, OCI and receipt guards with all hostile matrix mutations;
- provider schema tests proving job/run-attempt/direct-mode/requested-retention
  cannot be sourced from REST; separate persisted-budget tests for redirect and
  ETag phases; terminal producer-chain/publication-join/action-output mutations;
  exact signed handoff/policy/fresh-provider/download cross-binding;
- public export/source scan plus raw/cast/brand/proxy/getter/replay/env/port/hook
  capability attacks;
- real production consumer on `linux/x64`, exact OCI build/load/run,
  descriptor/runtime mutations and package-only validation with zero skips.

Acceptance targets inside the inactive joint phase after all required
independent reviews; this command list alone is not implementation authority:

```bash
cd apps/extension
../../node_modules/.bin/vitest run tests/unit/scripts/sealed-candidate-transport-consumer.test.ts --pool=forks --maxWorkers=1
../../node_modules/.bin/vitest run tests/integration/release/sealed-candidate-consumer-linux.test.ts --pool=forks --maxWorkers=1
../../node_modules/.bin/tsc --noEmit --pretty false --incremental false
../../node_modules/.bin/eslint scripts/release-consumer tests/unit/scripts/sealed-candidate-transport-consumer.test.ts
../../node_modules/.bin/prettier --check src/models/sealed-candidate-transport-consumer.model.md
```

Structured self-review:

| Check                                                   | Result      |
| ------------------------------------------------------- | ----------- |
| explicit inputs, output and non-claims                  | PASS        |
| authoritative readiness actor and S-before-V order      | PASS        |
| real actor CAS uses actor ID plus expected context hash | PASS        |
| direct parent snapshot authority import, no mirror      | PASS        |
| transient snapshot versus durable three-ID/event hash   | PASS        |
| exclusive thirteen-entry V2 inventory dependency        | PASS        |
| staged ordered model sets and atomic joint activation   | PASS        |
| release 11, producer 11 and consumer 12 slot alignment  | PASS        |
| exact MV3 26, packaged-tabs 11 and CV 6 hash binding    | PASS        |
| packaged-tabs 11 approved source commit `ff9164c4`      | PASS        |
| finite states, typed events and terminal states         | PASS        |
| nominal transitions with guards/effects                 | PASS        |
| GitHub/Sigstore/transport/payload/runtime/package chain | PASS        |
| signed immutable Git-source OS execution protocol       | PASS        |
| source/output mounts and pre/post capability receipts   | PASS        |
| common ArtifactPublicationJoinV1 producer/consumer type | PASS        |
| canonical decimal-string run ID end to end              | PASS        |
| fatal ambiguity and hostile cases                       | PASS        |
| retries, cancellation and restart                       | PASS        |
| cancellation duplicate handling and one-shot cleanup    | PASS        |
| post-V/J cancellation durable CAS disposition           | PASS        |
| absolute deadline and non-resetting child budgets       | PASS        |
| REST fact boundary and closed signed-handoff policy     | PASS        |
| post-V abandonment and fresh-candidate replacement      | PASS        |
| invocation-before-async token/admission chronology      | PASS        |
| exact GitHub origins/credentials/pages/ETag epoch       | PASS        |
| opaque one-shot capability and forbidden API paths      | PASS        |
| package chronology and package-only invariant           | PASS        |
| independent approval of exact pending hash              | **PENDING** |

Implementation remains forbidden until independent reviewers recompute and
approve this exact pending hash, release-readiness clarification 11, aligned
producer revision 11, MV3 harness revision 26, packaged-tab revision 11 and CV
accessible-anchor revision 6, all
without a blocking finding. Those reviews permit only the inactive joint
implementation phase; consumer release work additionally requires distinct
implementation/verification receipts and the final atomic activation. Current
release blockers remain:

1. the six exact model hashes are not all independently approved or
   jointly activated;
2. no production consumer yet owns the verified-payload private registry;
3. real Linux/x64 consumer/runtime/package proof has not passed with zero skips;
4. no green test may substitute for a missing model approval.

If behavior cannot be represented by this machine, it is not ready to
implement. If a transition depends on an LLM, the architecture is incorrect.
