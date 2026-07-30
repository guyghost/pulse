# Dataset Pre-Admission Write Capability Model

Source of truth for durable Dataset writes that must happen while ordinary
business admission is still closed, or while Reset owns the dataset fence. This
model composes, without replacing:

- `DatasetEpochAuthority` from `db-migration.model.md`;
- the exact startup commands and stages from `dataset-startup.model.md`;
- the exact Reset states and phases from `local-data-reset.model.md`.

This file is a model gate only. It defines the contract that the authority and
Shell adapters must implement after review. It does not authorize a second
mutex, a permissive test adapter or a no-op production implementation.

## Problem and decision

`DatasetEpochAuthority.issueLease()` is intentionally unavailable before
`OPEN_EPOCH_ADMISSION`. Startup nevertheless has to commit DB6/data3 migration,
the Settings V2 wrap and marker 3 before that opening proof exists. Reset also
has to journal, destroy and rebuild the dataset while business leases are
closed or revoked.

Those writes use a separate authority path with these properties:

1. exactly one startup/Reset command claim is active at a time;
2. the claim declares an exact, ordered and bounded write plan;
3. every durable write receives a distinct one-shot capability;
4. claim, issuance, consumption, completion, Reset and failure fencing share
   the existing authority FIFO (`runWithGate`), with no secondary lock;
5. the capability is consumed before its registered durable leaf adapter is
   invoked or awaited; callers never supply an async callback;
6. command/stage/attempt/epoch/revision drift revokes the claim; worker
   mismatch rejects, and worker termination destroys its whole registry;
7. an ordinary lease remains impossible before admission opens.

For a fresh Reset, preflight and reservation are one outer-gate operation. The
authority changes to `reset_pending` for that exact reset before returning the
fresh proof. Journal creation then uses put-if-absent under that reservation.
There is no unowned interval between Reset A's fresh preflight, journal and
fence where Reset B can reserve or overwrite the dataset.

For a restored journal, `rehydrateResetPreAdmission` is the only operation that
may create a replacement reservation. Under one FIFO position it rereads the
strict journal with an allowlisted read-only opener, proves phase-compatible
physical authority, installs `reset_pending` for that same durable reset and
returns a **new exact-object reservation bound to the current worker**. The old
worker's token is never cloned or accepted. `acquireResetFence` then upgrades
that replacement reservation to `reset_owned` before any resumed effect.

The capability proves admission of one durable effect. It does not prove that
the effect succeeded. Only the strict effect read-back and the owning workflow
event may do that.

## Exact vocabulary

```ts
type DatasetPreAdmissionOwner = 'startup' | 'reset';

type DatasetPreAdmissionStage =
  | `startup:${DatasetStartupStage}`
  | 'reset:journaling'
  | 'reset:resolvingInitialJournal'
  | 'reset:acquiringFence'
  | 'reset:checkpointingFence'
  | 'reset:checkpointingQuiescence'
  | 'reset:closingDatabase'
  | 'reset:deletingDatabase'
  | 'reset:clearingSession'
  | 'reset:clearingLocal'
  | 'reset:reinitializing'
  | 'reset:aligningSettings'
  | 'reset:writingReceipt'
  | 'reset:checkpointingCommit'
  | 'reset:adoptingBackgroundHandoff'
  | 'reset:clearingBackgroundHandoff'
  | 'reset:clearingJournal'
  | 'reset:checkpointingFailure'
  | 'reset:checkpointingRetry'
  | 'reset:openingEpochAdmission'
  | 'reset:postClearAdmissionFailed';

type DatasetPreAdmissionWriteKind =
  | 'startup.structure.db6_upgrade_transaction'
  | 'startup.data.tracking_v3_transaction'
  | 'startup.data.settings_v2_wrap'
  | 'startup.data.marker3_write'
  | 'startup.prepared_ledgers.recovery_transaction'
  | 'startup.settings_recovery.envelope_write'
  | 'reset.journal.initial_put'
  | 'reset.journal.initial_resolve'
  | 'reset.journal.checkpoint_fenced'
  | 'reset.journal.checkpoint_quiesced'
  | 'reset.journal.checkpoint_handles_closed'
  | 'reset.database.delete'
  | 'reset.journal.checkpoint_database_deleted'
  | 'reset.session.clear'
  | 'reset.journal.checkpoint_session_cleared'
  | 'reset.local.selective_remove'
  | 'reset.journal.checkpoint_local_cleared'
  | 'reset.reinitialize.db6_transaction'
  | 'reset.reinitialize.settings_v2_generation_zero'
  | 'reset.reinitialize.marker3_write'
  | 'reset.journal.checkpoint_database_reinitialized'
  | 'reset.settings_recovery.envelope_write'
  | 'reset.journal.checkpoint_settings_aligned'
  | 'reset.receipt.put'
  | 'reset.journal.checkpoint_committed'
  | 'reset.journal.checkpoint_handoff_adopted'
  | 'reset.journal.checkpoint_handoff_cleared'
  | 'reset.journal.remove'
  | 'reset.journal.checkpoint_failure'
  | 'reset.journal.checkpoint_retry';

interface DatasetPreAdmissionWriteClaimV1 {
  version: 1;
  writeId: string; // injected canonical UUID v4
  writeKind: DatasetPreAdmissionWriteKind;
}

interface DatasetPreAdmissionCommandKeyV1 {
  version: 1;
  owner: DatasetPreAdmissionOwner;
  workflowId: string; // startup attemptId or durable resetId
  stage: DatasetPreAdmissionStage;
  commandId: string;
  attemptId: string; // execution attempt, never reused across restart/retry
  workerEpoch: string;
}

interface ResetPreAdmissionReservationV1 {
  version: 1;
  kind: 'RESET_PRE_ADMISSION_RESERVED';
  origin: 'fresh_preflight' | 'journal_rehydration';
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  workerEpoch: string;
  authorityRevision: number;
  fenceRevision: number;
  status: 'reset_pending';
  journalStatus: 'absent_proven' | 'outcome_unknown' | 'durable_proven';
}

interface DatasetPreAdmissionCommandClaimV1 extends DatasetPreAdmissionCommandKeyV1 {
  claimId: string; // injected canonical UUID v4
  dataEpoch: string | null;
  authorityRevision: number;
  fenceRevision: number;
  resetReservation: ResetPreAdmissionReservationV1 | null;
  writes: DatasetPreAdmissionWriteClaimV1[];
}

interface DatasetPreAdmissionCommandScopeV1 extends DatasetPreAdmissionCommandClaimV1 {}

interface DatasetPreAdmissionWriteCapabilityV1 {
  version: 1;
  capabilityId: string; // authority-allocated canonical UUID v4
  claimId: string;
  owner: DatasetPreAdmissionOwner;
  workflowId: string;
  stage: DatasetPreAdmissionStage;
  commandId: string;
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string | null;
  authorityRevision: number;
  fenceRevision: number;
  resetReservation: ResetPreAdmissionReservationV1 | null;
  writeId: string;
  writeKind: DatasetPreAdmissionWriteKind;
  ordinal: number;
}

type DatasetPreAdmissionLeafAdapterId =
  | `dataset-pre-admission/${DatasetPreAdmissionWriteKind}/v1`
  | 'dataset-reset/preflight-authority-read/v1'
  | 'dataset-reset/rehydration-authority-read/v1';

interface DatasetPreAdmissionDurableLeafTokenV1 {
  version: 1;
  leafOperationId: string; // adapter-allocated canonical UUID v4
  adapterId: `dataset-pre-admission/${DatasetPreAdmissionWriteKind}/v1`;
  claimId: string;
  writeId: string;
  writeKind: DatasetPreAdmissionWriteKind;
  workerEpoch: string;
}

interface ResetAuthorityReadLeafTokenV1 {
  version: 1;
  leafOperationId: string; // adapter-allocated canonical UUID v4
  adapterId:
    'dataset-reset/preflight-authority-read/v1' | 'dataset-reset/rehydration-authority-read/v1';
  resetId: string;
  workerEpoch: string;
}

interface DatasetPreAdmissionCommandTerminalV1 extends DatasetPreAdmissionCommandKeyV1 {
  disposition: 'completed' | 'revoked';
  terminalFenceRevision: number;
}

type BackgroundSchedulingHandoffCapabilityKind =
  | 'reset.background_handoff.sidecar_initialize'
  | 'reset.background_handoff.slot_materialize'
  | 'reset.background_handoff.sidecar_cleanup';

type BackgroundSchedulingHandoffLeafAdapterId =
  | 'dataset-reset/background-handoff/sidecar-initialize/v1'
  | 'dataset-reset/background-handoff/slot-materialize/v1'
  | 'dataset-reset/background-handoff/sidecar-cleanup/v1';

interface BackgroundSchedulingHandoffCapabilityV1 {
  version: 1;
  capabilityId: string;
  kind: BackgroundSchedulingHandoffCapabilityKind;
  adapterId: BackgroundSchedulingHandoffLeafAdapterId;
  storageKey: 'missionpulse.backgroundSchedulingHandoff.v1';
  resetId: string;
  handoffId: string;
  sidecarId: string;
  workerEpoch: string;
  laneId: string;
  controlAttemptIndex: 0 | 1 | 2 | 3 | null;
  transitionIndex: number; // init=0, slots=1..131, cleanup=132
  casAttempt: 0 | 1 | 2;
  expectedCheckpointRevision: number | null;
  expectedPayloadDigest: string | null;
}
```

The handoff family is closed and preallocated with the Reset control lane before
ordinary background work admission: 1,584 CAS capabilities (four control
attempts, each with three CAS for initialization and each of 131 slots) and
three cleanup capabilities. The lane
also preallocates one fresh canonical `sidecarId`, distinct from lane, handoff,
worker, attempt, binding and every capability/leaf ID. Every CAS and cleanup
capability carries that same sidecar ID; the initialize adapter may not invent
or substitute it. Every
exact `(kind,controlAttemptIndex,transitionIndex,casAttempt)` has a distinct UUID and matching
registered leaf adapter from the three-literal union; kind/adapter substitutions
are rejected before invocation. The only key is the literal sidecar key above. No
runtime adapter registration, caller callback, raw Chrome fallback or transfer
of a work-registry capability is allowed.

The sidecar materialization machine durably stores the frozen target, digest and
cursor before its first CAS. A read finding the cursor already advanced returns
its canonical read-back without consuming or issuing
a capability; duplicates therefore use zero IDs and perform zero writes. A CAS
conflict with the bit still absent may consume only the next preallocated fresh
attempt. The 131-slot target is frozen by a total mailbox marker before the
checkpoint/reference is exposed. That marker closes the **external mailbox and
allocation surface**: no callback may mutate the frozen target, request another
capability or enter a sidecar adapter, and every late callback receives the
exact reset-in-progress terminal with zero ID/write. It does not cancel the
internal checkpoint executor. While the reference is not yet exposed, that
executor may consume only the already-reserved manifest entry for
initialization or for a slot that is present in the immutable target and still
absent in the sidecar. It cannot allocate, substitute a lane/manifest entry or
write a non-target slot. Once the exact frozen target is fully materialized and
read back, no slot transition remains admissible. Failure or exhaustion before
`chrome.storage.session.clear()` leaves Reset before clear and erases nothing.
Cleanup is a different kind and is unavailable until the exact adoption proof;
it removes only the sidecar, proves strict absence, and cannot cover the
following reset-journal checkpoint.

All IDs are exact own enumerable data fields. UUID fields are canonical
lowercase UUID v4s. `claimId`, `attemptId`, `workerEpoch` and every `writeId`
are pairwise distinct inside one scope; every allocated `capabilityId` and
`leafOperationId` is also distinct from them and from all retained IDs. For Startup, `workflowId`
intentionally aliases `attemptId`. For Reset, `workflowId` is the distinct
durable reset ID. `commandId`, `stage`, `owner`, ordinals and write kinds are
not free text: they are derived from the owning model tables below. Arrays are
dense, exact-key, frozen copies and bounded before enumeration.

`resetReservation` is literally `null` for Startup. Every Reset claim and
capability carries the one exact-object reservation registered for its
`workflowId`; a clone or a reservation for another reset is invalid.

The terminal command key is exactly
`{owner, workflowId, stage, commandId, attemptId, workerEpoch}`. Completion and
revocation retain that full key as a tombstone. A new `claimId`, write plan or
capability ID cannot reopen it.

The returned scope, capability, reservation and both leaf-token variants are
registered exact-object tokens. A spread clone, structured clone, Proxy,
accessor-bearing object, custom prototype, hidden or Symbol key is invalid even
when its visible values look equal. A leaf token contains data only: it exposes
no callable and no persistence dependency. Its private executor is found only
through the module-private allowlisted adapter registry. The authority never
rereads a raw input after strict capture.

## Attempt and command identity

For Startup:

- `workflowId === attemptId === DatasetStartupContext.attemptId`;
- `workerEpoch` equals the authority factory's captured worker epoch;
- `stage` is `startup:${command.stage}`;
- `commandId` is the exact active command ID: for `settings_recovery`,
  `settings/recover/<settingsRecoveryRequestId>`; for every other mutating
  Startup stage, `dataset-startup/<command.stage>/<attemptId>`.

For Reset:

- `workflowId === LocalDataResetJournalV1.resetId`;
- `attemptId` is an ephemeral Reset execution UUID injected by the trusted
  Shell for one actor execution interval;
- every explicit Reset retry and every worker restart allocates a fresh
  `attemptId`, while `resetId`, both data epochs and both Settings IDs remain
  unchanged;
- `workerEpoch` is the same value captured by the authority;
- `stage` is the exact active Reset state from the union above;
- `commandId` is exactly
  `local-data-reset/<state>/<resetId>/<attemptId>`.

The Reset execution attempt is capability correlation, not an additional
durable journal field. A new worker reconstructs durable facts, allocates a new
worker/attempt pair and cannot accept a token from the dead worker.

## Nullable epoch rule

`dataEpoch` is the authority's stage-specific observed dataset epoch at claim
linearization, not an epoch silently copied from a payload:

| Authority/owner position                                               | Exact claim `dataEpoch`                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Startup `closed_startup`, authority has not retained a canonical epoch | `null`                                               |
| Startup `closed_startup` after Reset installed a pending next epoch    | that exact pending next epoch                        |
| Reset `journaling` under its exact `reset_pending` reservation         | exact reserved `previousDataEpoch`, including `null` |
| Reset cleanup through `clearingLocal` under `reset_owned`              | exact `previousDataEpoch`, including literal `null`  |
| Reset `reinitializing` through `clearingJournal`                       | exact `nextDataEpoch`                                |

When the authority has no epoch, only literal `null` is valid. Supplying the
command's target epoch instead is `DATA_EPOCH_MISMATCH`. Conversely, once the
authority has retained an exact pending/current epoch, `null` is invalid. The
durable effect still validates its own payload epoch through the DB, Settings
or Reset proof; a nullable authority field is never permission to write an
arbitrary epoch.

## Authority and fence revisions

`authorityRevision` is the existing safe non-negative authority revision. The
capability extension adds a worker-local safe non-negative `fenceRevision` to
detect invalidations that do not necessarily change the dataset epoch. The
authority snapshot exposes that revision so a trusted workflow can form an
exact claim; the authority still rereads it at linearization.

`fenceRevision` advances under the shared FIFO when any of these linearizes:

- active command completion or explicit revocation;
- trusted stage, command, workflow or attempt change;
- Reset fence ownership;
- Reset epoch installation;
- startup failure fencing;
- authority revision or observed epoch change.

Every scope captures both revisions. Every issue and commit rereads both inside
the FIFO. Revision overflow permanently fail-closes the authority; it never
wraps to zero. Successful fresh Reset preflight installs the exact
`reset_pending` reservation at that same FIFO linearization point. New
claims/capabilities for another reset are then refused. Full lease/capability
revocation linearizes when that reservation advances to `reset_owned`; a commit
already ahead of that fence may settle, while one behind it observes the
advanced fence and invokes zero durable adapter.

## Bounded registries, with no eviction

The worker retains these registries:

```text
MAX_PRE_ADMISSION_WRITES_PER_COMMAND = 256
MAX_RETAINED_PRE_ADMISSION_CLAIMS_PER_WORKER = 4096
MAX_RETAINED_PRE_ADMISSION_TERMINAL_KEYS_PER_WORKER = 4096
MAX_RETAINED_PRE_ADMISSION_WRITE_IDS_PER_WORKER = 16384
MAX_RETAINED_PRE_ADMISSION_CAPABILITIES_PER_WORKER = 16384
MAX_RETAINED_PRE_ADMISSION_LEAF_OPERATIONS_PER_WORKER = 32768
MAX_RETAINED_RESET_RESERVATIONS_PER_WORKER = 256
```

- one active scope, or none;
- every claim ID ever accepted in this worker;
- every terminal command key and its completion disposition;
- every capability ID and its terminal state (`consumed`, `settled` or
  `revoked`);
- every declared write ID, including writes revoked before issuance, and its
  claim binding;
- every registered leaf operation ID, exact-object token, adapter binding and
  terminal state (`prepared`, `entered`, `settled` or `revoked`);
- every Reset reservation and its exact-object token.

Completed/revoked entries are never evicted or reused. Reaching a limit returns
`PRE_ADMISSION_REGISTRY_EXHAUSTED` before allocator invocation or leaf-token
preparation and performs no authority/physical state change. Recovery requires a
new worker epoch, not deletion of replay evidence inside the worker. Old tokens
remain invalid because they bind the old worker epoch and exact-object registry.

No terminal command key is evicted. Once
`{owner,workflowId,stage,commandId,attemptId,workerEpoch}` is terminal, `BEGIN`
with the same key is always `PRE_ADMISSION_COMMAND_TERMINAL`, even with fresh
claim/write IDs. Only a new attempt authorized by the owning state machine may
form a non-terminal key. A next stage in the same Startup attempt becomes
current only after the prior result event is synchronously accepted by that
private controller.

## Write-plan rule

A claim contains between 1 and 256 ordered writes. `writeId` is fresh for that
execution attempt. `writeKind` comes from the tables below. A read-only command
must not create an empty claim.

Only the next unsettled ordinal may be issued. The same exact unconsumed write
requested reentrantly returns the one canonical registered capability by
identity. A consumed, settled or revoked write can never receive another
capability. Retry/recovery must use a fresh attempt, claim and write ID and
determine idempotence from strict durable read-back.

One capability cannot cover a whole port, transaction saga or loop. When a
Chrome API call is split into multiple awaited writes, the plan contains one
entry per call. A port may first perform read-only discovery, build the exact
bounded plan, then begin its claim; it may not write during discovery.

## Closed leaf-adapter boundary

`commitPreAdmission` and both Reset authority-read operations accept an opaque
registered leaf token, never a caller-provided function. Dedicated Shell leaf
modules prepare these tokens from strictly captured data and retain the private
executor in a module-private `WeakMap`. The public token has only the exact data
fields above. The authority requires exact token identity and exact binding to
the current claim/write or Reset request before it looks up the executor.

The adapter registry is a closed build-time table:

- every `DatasetPreAdmissionWriteKind` maps to exactly one matching
  `dataset-pre-admission/<writeKind>/v1` adapter;
- fresh/recognition preflight maps only to
  `dataset-reset/preflight-authority-read/v1`;
- journal restoration maps only to
  `dataset-reset/rehydration-authority-read/v1`;
- no runtime dependency bag can add, replace or decorate an adapter;
- an adapter module may import physical Chrome/IndexedDB leaf ports and strict
  Core parsers, but may not import `DatasetEpochAuthority`, a workflow
  controller, public Settings orchestration, messaging or another gate;
- its executor receives a detached deeply frozen DTO, never the authority,
  scope, capability, controller or adapter registry;
- one executor starts exactly the physical effect declared by its adapter ID and
  returns its Promise. It contains no user callback, message dispatch, timer or
  continuation that can request authority work.

Static dependency tests enforce that import graph. Runtime exact-object lookup
rejects forged/cloned/cross-write tokens with `INVALID_PRE_ADMISSION_LEAF`
before invocation. Because an invoked executor has no authority path, it cannot
enqueue behind the FIFO position whose settlement it controls. A legitimate
external Reset, completion or failure fence arriving while the leaf Promise is
pending still calls the public authority normally: it obtains the next FIFO
ticket, waits for the current leaf to settle, then wins in that order. No global
"leaf executing" boolean rejects unrelated external work.

Only the synchronous capability-ID allocator uses the dispatch-depth sentinel.
That sentinel exists for the allocator's JavaScript call stack only, because the
allocator must return a string and may not return or await a Promise. Reentrant
public authority calls from that stack are rejected before enqueue and latch the
outer allocation failure. The sentinel is cleared before control returns to the
event loop, so it cannot reject an unrelated external ticket.

## Exact Startup write kinds

| Startup stage       | Ordered capability writes                                                                                                                       | Notes                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`         | `startup.structure.db6_upgrade_transaction`                                                                                                     | One IndexedDB version-change transaction; completion is the durable boundary.                                                                                    |
| `data`              | 1. `startup.data.tracking_v3_transaction`; 2. `startup.data.settings_v2_wrap`; 3. `startup.data.marker3_write`                                  | The three crash-consistent boundaries are mandatory and distinct. Settings is strictly read back before marker 3; marker 3 is strictly read back before success. |
| `prepared_ledgers`  | `startup.prepared_ledgers.recovery_transaction` only when a recovery write is required                                                          | The read-only zero-ledger path has no claim. All recovered rows belong to the one modeled atomic transaction.                                                    |
| `settings_recovery` | one `startup.settings_recovery.envelope_write` entry for each exact Settings journal/outcome/clear write discovered by the shared recovery plan | No port-wide token. The Chrome alarm call is an external effect proven by Settings, not a Dataset storage write.                                                 |

`reset_gate`, `reset_preflight`, `versions`, `verification`,
`settings_envelope`, `admission`, `bootstrap` and `failure_fence` perform no
Dataset write through this capability. In particular, after the `data` saga,
`WRAP_SETTINGS_ENVELOPE` is the additional strict read-back specified by the
startup model; it cannot repeat the wrap write. `OPEN_EPOCH_ADMISSION`, Reset
fencing and failure fencing call their dedicated authority methods on the same
FIFO, never a capability adapter.

## Exact Reset write kinds

| Reset state                 | Ordered capability writes                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journaling`                | `reset.journal.initial_put` as exact put-if-absent plus strict read-back under the same Reset reservation                                                                                 |
| `resolvingInitialJournal`   | `reset.journal.initial_resolve`; only for the same reservation in `journalStatus:'outcome_unknown'`                                                                                       |
| `acquiringFence`            | none; dedicated `acquireResetFence` authority operation                                                                                                                                   |
| `checkpointingFence`        | `reset.journal.checkpoint_fenced`, only after the same-worker live fence proof                                                                                                            |
| `checkpointingQuiescence`   | `reset.journal.checkpoint_quiesced`, only after exact sidecar/reference CAS read-back                                                                                                     |
| `closingDatabase`           | `reset.journal.checkpoint_handles_closed`; closing handles itself is not a durable Dataset write                                                                                          |
| `deletingDatabase`          | 1. `reset.database.delete`; 2. `reset.journal.checkpoint_database_deleted`                                                                                                                |
| `clearingSession`           | 1. `reset.session.clear`; 2. `reset.journal.checkpoint_session_cleared`                                                                                                                   |
| `clearingLocal`             | 1. `reset.local.selective_remove`; 2. `reset.journal.checkpoint_local_cleared`                                                                                                            |
| `reinitializing`            | 1. `reset.reinitialize.db6_transaction`; 2. `reset.reinitialize.settings_v2_generation_zero`; 3. `reset.reinitialize.marker3_write`; 4. `reset.journal.checkpoint_database_reinitialized` |
| `aligningSettings`          | one `reset.settings_recovery.envelope_write` per exact shared Settings write, then `reset.journal.checkpoint_settings_aligned`                                                            |
| `writingReceipt`            | `reset.receipt.put`; the strict read-back is read-only                                                                                                                                    |
| `checkpointingCommit`       | `reset.journal.checkpoint_committed`                                                                                                                                                      |
| `adoptingBackgroundHandoff` | `reset.journal.checkpoint_handoff_adopted`; adoption/read-back is read-only and retains the sidecar                                                                                       |
| `clearingBackgroundHandoff` | dedicated handoff cleanup capability removes/proves sidecar absence, then `reset.journal.checkpoint_handoff_cleared` with a distinct Dataset capability                                   |
| `clearingJournal`           | `reset.journal.remove`                                                                                                                                                                    |
| `checkpointingFailure`      | `reset.journal.checkpoint_failure`; exact unchanged phase/retry count plus exact pending `lastError`                                                                                      |
| `checkpointingRetry`        | `reset.journal.checkpoint_retry`; exact unchanged phase, `retryCount + 1` and `lastError:null`                                                                                            |
| `openingEpochAdmission`     | none; dedicated `installResetEpochAndOpen` authority operation                                                                                                                            |
| `postClearAdmissionFailed`  | none; journal is absent, so the failure is volatile and retry only reissues `installResetEpochAndOpen`                                                                                    |

`preflightingCompletion`, `reacquiringFence`, `routingRestart`,
`acquiringFence`, `quiescing`, `broadcastingReadiness`,
`broadcastingCommitted`, `openingEpochAdmission` and
`postClearAdmissionFailed` contain no capability write. Reset's DB6 transaction,
Settings generation-zero write and marker-3 write are three separate
capabilities in that order. The journal checkpoint is a fourth boundary. Marker
3 can never precede the strict Settings V2 read-back.

`reset.local.selective_remove` is exactly one bounded
`chrome.storage.local.remove(keys)` call that excludes exactly the active reset
journal and `missionpulse.backgroundSchedulingHandoff.v1`. Its strict success
proof rereads the same journal reference and exact sidecar. It
is never `chrome.storage.local.clear()`. If a future API forces chunking, the
model and write plan must be reviewed first; a token may not be reused across
chunks.

### Closed failure and retry checkpoints

No active state writes `lastError` directly and neither `blocked` nor `failed`
owns a writer. A correlated `STEP_FAILED` while a strict journal exists first
captures a frozen `pendingFailure` in actor memory and enters
`checkpointingFailure`. That state alone may claim
`reset.journal.checkpoint_failure`:

- authority is the same Reset A in `reset_pending` when live-fence acquisition
  failed, or `reset_owned` after the fence was acquired;
- journal identity, phase and `retryCount` are unchanged;
- `lastError` is exactly `pendingFailure`, including origin, step, retryability
  and bounded message;
- the success event carries strict same-record read-back and only then routes to
  `blocked` or `failed`.

Failure of that checkpoint enters `failureCheckpointBlocked`. It performs no
recursive journal write, preserves the older durable journal, exposes only a
volatile diagnostic and allows only an explicit same-reset retry of the same
checkpoint with fresh claim/write/capability/leaf IDs. A preflight failure before
any journal is context-only and never uses this capability.

Likewise, `RETRY` in `blocked` or `failed` does not increment memory first. It
enters `checkpointingRetry`, whose sole write is
`reset.journal.checkpoint_retry`: same identity and phase, exact
`retryCount + 1`, exact `lastError:null`. Only strict read-back emits
`RETRY_CHECKPOINTED` and permits recovery or fence reacquisition. A checkpoint
failure enters `retryCheckpointBlocked`, performs no recursive write and cannot
resume a destructive effect. Thus every durable `lastError`/`retryCount` change
appears in this closed table and no terminal presentation state secretly owns
storage authority.

### Post-clear admission boundary

`reset.journal.remove` proves strict absence but does not itself complete Reset.
It yields an exact `ResetJournalRemovalProofV1` bound to A, its receipt, next
epoch, authority/fence revisions and current worker. The actor then enters
`openingEpochAdmission` and calls the dedicated FIFO operation
`installResetEpochAndOpen(removalProof)`.

For the executing worker, that operation requires the exact `reset_owned`
reservation/token, strict journal absence, matching latest receipt and exact
DB6/data3 next-epoch proof. For cold post-clear recognition it requires the
same durable receipt/DB proof while authority is closed startup, or accepts an
already-open authority only when epoch and revision match exactly. In one FIFO
position it installs the next epoch if required and returns an immutable
`ResetEpochAdmissionOpenedProofV1`; an exact duplicate returns the same
canonical proof. No capability is used for this authority transition.

If installation/opening fails or its outcome cannot be proven, authority stays
closed, the receipt and removal proof remain intact and the actor enters
`postClearAdmissionFailed`. Because the journal is absent, this diagnostic is
volatile; explicit same-reset retry re-runs only
`installResetEpochAndOpen`, never deletion, clearing, rebuild, receipt or
journal removal. `completed` and `reset:true` require the exact opened proof.

## Atomic Reset reservation and journal ownership

`reserveResetPreAdmission(request, authorityReadLeafToken)` is a dedicated
operation on the outer DatasetEpoch FIFO. The token must be the exact registered
`dataset-reset/preflight-authority-read/v1` object bound to that request and
worker. At one uninterrupted gate position the authority:

1. strictly captures the full Reset request;
2. reads the reserved journal, latest receipt and canonical DB6/data3 epoch;
3. returns recognized completion without a reservation only for the exact
   terminal proof;
4. for a fresh proof, verifies journal absence and exact previous/next epoch;
5. installs `reset_pending` for that exact Reset and returns one frozen
   `ResetPreAdmissionReservationV1` with `origin:'fresh_preflight'` before
   releasing the gate. Its initial `journalStatus` is exactly
   `absent_proven`.

Another Reset cannot obtain a fresh proof after step 5. An exact duplicate of
the same full request joins and receives the canonical reservation object; a
different Reset is `RESET_PRE_ADMISSION_OWNED`. Physical/protocol preflight
failure installs no reservation.

The `journaling` claim requires that exact reservation. Its leaf operation is
put-if-absent, not `set`/overwrite:

- absent journal -> put the exact phase-`journaled` record and strictly read it
  back;
- byte/contract-equivalent same-Reset journal -> perform no overwrite, strictly
  read it back and return the same idempotent proof;
- malformed or foreign journal, including another reset ID or any differing
  epoch/Settings ID/time -> `RESET_JOURNAL_CONFLICT`, zero write.

The capability is consumed in both the absent and exact-idempotent paths. A
same-looking no-op without strict read-back is forbidden. Before the gate
position settles, the closed adapter returns exactly one authority-owned
outcome:

| Initial outcome                | Required proof                                          | Reservation result                 |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------- |
| `durable_proven`               | exact same-reset journal strict read-back               | `journalStatus:'durable_proven'`   |
| `not_committed_absence_proven` | strict journal absence read-back after the failed write | `journalStatus:'absent_proven'`    |
| `durable_outcome_unknown`      | neither exact journal nor absence can be proven         | `journalStatus:'outcome_unknown'`  |
| `conflict`                     | malformed/foreign/different same-ID journal             | unchanged, typed terminal conflict |

The authority itself applies that result while still holding the FIFO; callers
cannot assert a status. `acquireResetFence` accepts only the exact reservation
object in `journalStatus:'durable_proven'` plus the exact journal proof. It
rejects `absent_proven` and `outcome_unknown` before changing authority state.

`durable_outcome_unknown` enters `resolvingInitialJournal`, not `failed` or
`blocked`: there may be no durable journal in which to store `lastError`.
`resolveInitialResetJournalOutcome(reservation, leafToken)` accepts only the
same current-worker exact reservation and the registered
`reset.journal.initial_resolve` adapter. Under one FIFO position it:

1. strictly reads the reserved key;
2. if the exact initial journal is already durable, performs no write, reads it
   back and changes the reservation to `durable_proven`;
3. if strict absence is proven, performs the same put-if-absent plus read-back;
4. if the outcome is still unprovable, keeps `outcome_unknown` and emits no
   workflow transition;
5. if a malformed or foreign value exists, returns terminal conflict and keeps
   admission closed.

Only A may run this resolver. Reset B remains `RESET_PRE_ADMISSION_OWNED` in all
three statuses. A later worker never trusts the dead worker's volatile status:
strict journal presence rehydrates A as `durable_proven`; strict absence proves
that no durable Reset exists and requires a completely fresh preflight. There
is no path from unknown to absence by timeout or exception.

After the journal scope becomes terminal with `durable_proven`,
`acquireResetFence` changes that same owner from `reset_pending` to
`reset_owned`. It never releases ownership between the two states.

### Read-only IndexedDB preflight opener

The authority-read adapter is the only preflight path allowed to inspect
IndexedDB before ordinary startup openers are admitted. It runs while the outer
FIFO position is held and follows this closed protocol:

1. read `indexedDB.databases()` and the exact reserved Chrome-local journal,
   receipt and data marker keys;
2. if `missionpulse` is absent, return the strict absent-database authority fact
   without calling `indexedDB.open`;
3. if present, call `indexedDB.open('missionpulse')` **without a version
   argument**; `onupgradeneeded` aborts its transaction and fails with
   `RESET_PREFLIGHT_OPEN_WOULD_UPGRADE`, never creates schema or continues;
4. register the temporary handle as `reset_preflight_read`, use only `readonly`
   transactions to inspect DB version, exact stores/indexes and
   `tracking_meta`, and perform zero `add`, `put`, `delete`, `clear`, cursor
   mutation, migration or repair;
5. close and unregister the handle in `finally`, including blocked, abort,
   versionchange, parse and Chrome-storage failure paths; the adapter Promise
   cannot settle until closure is proven;
6. return a detached strict proof. No `IDBDatabase`, transaction, request,
   function or mutable source object escapes the adapter.

The inventory/read/open interval is protected from every sanctioned MissionPulse
opener and writer by the same outer FIFO. An unexpected `onupgradeneeded`,
database disappearance or versionchange is a typed physical conflict and
installs no reservation. Recognition requires exact DB6/data3 schema and the
next epoch. Fresh reset may accept the exact previous epoch or literal `null`
only under the existing missing/unreadable-authority rule; a readable third
epoch never becomes null.

### Journal rehydration in a new worker

`rehydrateResetPreAdmission(journalIdentity, authorityReadLeafToken)` is a
distinct FIFO operation. It accepts only the registered
`dataset-reset/rehydration-authority-read/v1` token for the current worker. At
one uninterrupted FIFO position it:

1. strictly captures the expected complete `LocalDataResetJournalV1` identity;
2. rereads and strictly parses the reserved journal with the read-only opener;
3. requires byte/contract equality for reset ID, both epochs, both Settings IDs,
   `requestedAt`, phase, retry count and `lastError`;
4. rejects every foreign live reservation, journal or readable third epoch;
5. applies the phase-compatibility matrix below;
6. installs `reset_pending` and allocates one new frozen exact-object
   reservation with `origin:'journal_rehydration'`, the current `workerEpoch`
   and current authority/fence revisions plus
   `journalStatus:'durable_proven'` before releasing the gate.

For durable phases `handoff_adopted` and `handoff_cleared`, that current
`workerEpoch` must differ from the handoff reference's `sourceWorkerEpoch`.
Equality is a rehydration conflict. `handoff_adopted` additionally requires the
exact authority-issued replacement receipt and its worker-bound cleanup tuple;
`handoff_cleared` requires no replacement delete/token because absence is
already durable.

| Durable journal phase                 | Physical authority accepted during rehydration                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `journaled`, `fenced`, `quiesced`     | exact previous epoch, including the modeled literal-null unreadable authority                                                                                                                    |
| `handles_closed`                      | exact previous/null authority, or database absent when delete completed before its checkpoint                                                                                                    |
| `database_deleted`, `session_cleared` | database absent                                                                                                                                                                                  |
| `local_cleared`                       | one exact reinitialization prefix: database absent; DB6/next-epoch/empty-store transaction only; then exact generation-zero Settings V2; then marker 3. No later/foreign combination is accepted |
| `database_reinitialized`              | exact verified DB6/data3 next epoch, an exact shared Settings-alignment recovery prefix (including already settled), and no terminal receipt                                                     |
| `settings_aligned`                    | exact verified DB6/data3 next epoch, exact settled Settings/alarm proof, and terminal receipt either absent or exact same-reset                                                                  |
| `committed`                           | exact verified DB6/data3 next epoch plus the exact terminal receipt required by the committed checkpoint                                                                                         |
| `handoff_adopted`                     | exact verified DB6/data3 next epoch, exact terminal receipt, exact referenced sidecar still present, and exact adoption checkpoint                                                               |
| `handoff_cleared`                     | exact verified DB6/data3 next epoch, exact terminal receipt, exact referenced sidecar absence read-back, and exact clear checkpoint                                                              |

The matrix represents an effect that may be durable just ahead of its journal
checkpoint, never an arbitrary later phase. A malformed proof, foreign receipt,
third epoch or physical state outside the row is
`RESET_PRE_ADMISSION_REHYDRATION_CONFLICT` and performs no authority change.
For `local_cleared`, the prefix is checked against the four-write
`reinitializing` plan: no DB; or exact DB6/metadata-next/empty stores with no
generation-zero envelope/marker 3 yet; or that DB plus the exact generation-zero
envelope with marker 3 absent; or those facts plus marker 3. Settings-before-DB,
marker-before-Settings, non-empty stores and any partial/foreign value are
conflicts. The fourth write is the journal checkpoint that changes the durable
phase and therefore is not part of the `local_cleared` row.

An exact duplicate rehydration in the current worker returns the one canonical
replacement reservation by identity. A different Reset is
`RESET_PRE_ADMISSION_OWNED`. The replacement never copies the dead worker's
object or revisions. `acquireResetFence` accepts this exact replacement plus the
same strict journal proof, advances revisions, revokes old leases/capabilities
and changes it to `reset_owned`. Its exact proof retains the trusted
lane/attempt/source-worker handoff expectation and, when replacement cleanup is
required, the authority-issued command/result receipt plus its worker-bound
tokens. Only then may `BOOT_FENCE_ACQUIRED` be emitted
or any durable phase resume. Thus a crash after every journal/checkpoint has a
closed recovery path, while Reset B can neither inherit nor overwrite Reset A.

## State and transition model

```text
resetUnreserved
  -- RESERVE_RESET_PREFLIGHT(fresh exact proof) --> resetPending(A, absent_proven)
resetPending(A, absent_proven)
  -- BEGIN journaling(A) --> active
  -- RESERVE exact duplicate A --> resetPending(A) (same reservation object)
  -- RESERVE different B --> rejected (A remains owner)
  -- exact journal read-back --> resetPending(A, durable_proven)
  -- unprovable put/read-back --> resetPending(A, outcome_unknown)
resetPending(A, outcome_unknown)
  -- RESOLVE exact journal --> resetPending(A, durable_proven)
  -- RESOLVE exact absence + put/read-back --> resetPending(A, durable_proven)
  -- RESOLVE still unknown --> resetPending(A, outcome_unknown)
  -- RESERVE different B --> rejected (A remains owner)
resetPending(A, durable_proven)
  -- journal proof + ACQUIRE_RESET_FENCE(A) --> resetOwned(A)

newWorker + strictJournal(A)
  -- REHYDRATE_RESET_PRE_ADMISSION(A, phase-compatible read proof)
       --> resetPending(A, new exact-object reservation/current worker)
  -- ACQUIRE_RESET_FENCE(A, replacement reservation) --> resetOwned(A)
  -- REHYDRATE/RESERVE different B -------------------> rejected

resetOwned(A) + exact journal-removal/receipt/DB proof
  -- INSTALL_RESET_EPOCH_AND_OPEN(A) --> open(nextDataEpoch)
  -- failure/unknown ----------------> resetOwned(A), admission closed

vacant
  -- BEGIN_PRE_ADMISSION_COMMAND(exact claim) --> active

active
  -- ISSUE_PRE_ADMISSION_CAPABILITY(next write) --> active
  -- COMMIT_PRE_ADMISSION(exact token/write) --> executing
  -- COMPLETE_PRE_ADMISSION_COMMAND ------------> vacant + terminal key
  -- REVOKE / stage drift / Reset / failure fence -> vacant + terminal key

executing
  -- durable Promise fulfilled --> active (capability settled; next ordinal)
  -- durable Promise rejected  --> active (capability consumed; command must fail/revoke)
  -- Reset/fence queued later  --> stays executing until Promise settles, then fence wins

any
  -- revision overflow --> failClosed
```

The shared FIFO is the linearization order. `executing` holds it until the
allowlisted leaf Promise settles. There is no cancellation fiction for an
already entered transaction. Reset/failure fence queued first revokes before a
later commit and the adapter is never invoked; a commit queued first settles
before the fence. An external fence called while an adapter is pending always
receives a later FIFO ticket; it is never mistaken for adapter reentrance.

## Authority operations

### `reserveResetPreAdmission(request, authorityReadLeafToken)`

This operation implements the atomic Reset protocol above. It holds the outer
DatasetEpoch gate through the registered read-only adapter and registration of
the exact `reset_pending` owner. It returns neither `fresh` nor a reservation if
a foreign reservation/journal exists. A reservation clone is never accepted by
later journaling/fence operations. The adapter must prove its temporary IDB
handle closed before this operation resolves or rejects.

### `rehydrateResetPreAdmission(journalIdentity, authorityReadLeafToken)`

This operation is available only in Reset `reacquiringFence` after a strict
journal was found at worker boot. It performs the rehydration protocol and
phase-compatibility matrix above, then returns the one canonical replacement
reservation for this worker. It never returns a fresh-preflight or completion
result, never writes the journal, never resumes the phase and never accepts the
old worker's reservation. Its successful result must be consumed by
`acquireResetFence` before the Reset controller can accept
`BOOT_FENCE_ACQUIRED`.

### `resolveInitialResetJournalOutcome(reservation, authorityReadLeafToken)`

This operation exists only for the exact current-worker A reservation in
`journalStatus:'outcome_unknown'`. It uses the closed resolver adapter under one
FIFO position, returns only the total outcomes specified above and updates the
canonical reservation before settlement. It never accepts B, guesses absence,
opens admission, exposes `failed`/`blocked` or acquires the fence.

### `installResetEpochAndOpen(proof)`

This dedicated authority operation is the only transition after strict journal
removal. It accepts the exact executing A removal/receipt/DB proof, or the exact
cold-recognition equivalent while startup is closed. It atomically installs and
opens `nextDataEpoch`, or returns the canonical already-open exact proof. Any
failure/unknown outcome leaves admission closed and preserves retry authority;
it never repeats a Dataset effect or returns success.

### `beginPreAdmissionCommand(claim)`

Under the existing gate it:

1. strictly captures the exact claim and write plan;
2. rejects an ordinary/business owner, unsupported stage or empty plan;
3. verifies owner state, command identity, worker, nullable epoch and both
   revisions;
4. verifies the private controller's exact current command proof; this proof is
   updated only after the previous workflow event is accepted;
5. rejects a retained terminal command key before accepting a new `claimId`;
6. for Reset, verifies the canonical exact-object reservation;
7. rejects admission/fence states not allowed by the owner-stage matrix;
8. reserves the claim ID and scope object identity, then returns that frozen
   exact scope.

An exact duplicate active claim returns the same scope object. A different
active claim is `PRE_ADMISSION_COMMAND_ACTIVE`; it neither replaces nor
completes the old claim. After completion/revocation, the same command key is
terminal and every new `BEGIN` for it is rejected. An untrusted mismatched
`BEGIN` is not evidence that the workflow changed stage. A trusted stage
transition first completes the old scope, synchronously publishes/accepts the
workflow event through the private controller, and only then exposes the next
current command proof. Consequently neither the old nor the next command can be
reopened in the completion-before-event interval.

### `issuePreAdmissionCapability(scope, writeId)`

Under the same gate it verifies the exact active scope, next ordinal, all
correlations and registry capacity before calling the injected allocator. It
captures claim/epoch/revisions before allocation and revalidates them after
allocation. Admission eligibility is the eligibility at this operation's FIFO
position; a `reset_pending` reservation with a later ticket cannot overtake it,
while one that existed before entry rejects it before allocation.

Allocator behavior is fail-closed:

- invalid UUID or any thrown JavaScript value -> `INVALID_CAPABILITY_ID`, no
  raw exception;
- collision with any retained capability/claim/write ID or any UUID identity
  in the active scope -> `CAPABILITY_ID_COLLISION`;
- the allocator is a synchronous leaf and receives no authority reference;
- any allocator attempt to call issue/commit/complete, ordinary lease/commit,
  Reset reservation/fence, epoch installation, admission or failure fencing is
  rejected **before enqueue** with `AUTHORITY_REENTRANCY_FORBIDDEN`;
- the authority latches that violation for the allocator invocation. Even if
  hostile allocator code catches the inner error and returns a valid UUID, the
  outer issuance fails and burns that fresh UUID;
- no reentrant Promise is ever appended behind the gate operation that would
  await it.

Every valid fresh allocator result is retained before returning the capability,
so it is never recycled. `reset_pending` established before issuance enters the
FIFO rejects allocation without calling the allocator.

### `commitPreAdmission(capability, writeId, durableLeafToken)`

`durableLeafToken` is the exact registered data-only token prepared by the one
allowlisted adapter for this `writeKind`. There is no callback parameter. The
authority validates token identity/binding and obtains the private executor from
the closed registry before enqueue. At its FIFO position the authority:

1. verifies exact token identity and every field;
2. verifies active scope, next ordinal, nullable epoch and both revisions;
3. rejects consumed/revoked/foreign/cross-command capability or leaf tokens;
4. marks the capability `consumed` **before invoking the private adapter**;
5. invokes that adapter exactly once and holds the FIFO until its Promise
   settles;
6. records `settled` only on fulfillment; rejection leaves it consumed.

A synchronous adapter throw, malformed strict read-back or rejected Promise is
a durable-effect failure, never permission to replay either token. The private
executor cannot queue another write because its module has no authority or
controller path. External public authority calls remain enqueueable and follow
FIFO after the pending adapter. Only capability allocation uses the synchronous
reentrancy sentinel described above; durable and authority-read adapters rely on
closed exact-object registration plus the forbidden-import architecture gate,
not on an async-global sentinel.

### `completePreAdmissionCommand(scope)`

Under the same gate it verifies the exact active scope, revokes every issued but
unconsumed capability, marks every unissued write unavailable, advances
`fenceRevision`, writes the bounded no-eviction terminal tombstone for the full
command key and clears the active scope. If every planned write settled, the
completion disposition is `completed`; otherwise it is `revoked`. Repeating
completion with the exact old scope returns only its retained terminal receipt;
it cannot clear or reopen the tombstone. Completion does not fabricate a
workflow success event.

The owning adapter must complete the scope before it publishes the success or
failure event that can change the model stage. If the model stage/command is
observed to change first, the authority revokes the old scope and rejects the
new operation; it never silently retargets it.

## Global gate hierarchy and leaf ports

The global lock order is strict:

```text
DatasetEpoch gate (outer)
  -> Settings/system quota-write gate (inner, when required)
    -> one Chrome Storage / IndexedDB / alarm leaf Promise
```

- DatasetEpoch may enter the inner Settings/system gate only through an
  allowlisted leaf port whose dependency type has no authority/controller
  access.
- Code holding the Settings/system gate may never request, await or call the
  DatasetEpoch gate. That inversion is `LOCK_ORDER_VIOLATION` before enqueue.
- A Settings write, whether pre- or post-admission, acquires DatasetEpoch first
  and the Settings/system gate second. It releases the inner gate before the
  outer commit resolves.
- A DatasetEpoch durable adapter cannot call a general Settings recovery/save
  API that might reacquire DatasetEpoch. The closed adapter mapping may call
  only the inner leaf that performs the already-authorized physical operation.
- IDB-only leaves use no inner Settings gate. They still cannot call back into
  DatasetEpoch or a workflow controller.
- Neither gate adapter awaits arbitrary user code, message delivery or another
  operation capable of acquiring an equal/lower-ranked gate.

The lock-rank check is synchronous and shared by both gates. A violation is
latched on the outer operation. Static architecture checks additionally prove
that leaf modules do not import the authority, controller or public Settings
orchestration. Runtime rank rejection prevents inversion at public gate
boundaries; the closed leaf registry prevents an adapter from creating the
self-dependency that would otherwise deadlock the FIFO.

## Allowed authority states

| Owner/stage                                                               | Required authority state                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Startup mutating stage                                                    | `closed_startup`; never `open`, `reset_pending`, `reset_owned` or `fenced_failure`                           |
| Reset `journaling` / `resolvingInitialJournal`                            | `reset_pending` with the exact canonical current-worker reservation and its exact journal status             |
| Reset `reacquiringFence` after worker restart                             | `closed_startup` before rehydration, then `reset_pending` with the current worker's replacement reservation  |
| Reset failure/retry checkpoint before live fence                          | same A `reset_pending`, strict durable journal, exact replacement reservation                                |
| Reset after `acquireResetFence` through `clearingJournal`                 | `reset_owned` for that same current-worker reservation/reset ID/epochs                                       |
| Reset failure/retry checkpoint after live fence                           | same A `reset_owned`; exact journal phase determines the capability epoch                                    |
| Reset `openingEpochAdmission` / `postClearAdmissionFailed` executing path | same A `reset_owned`, strict journal absence and exact removal/receipt/DB proof                              |
| Reset `openingEpochAdmission` recognized cold path                        | `closed_startup`, or exact already-open next epoch for idempotent proof; no stale reservation is synthesized |

Once `OPEN_EPOCH_ADMISSION` succeeds, startup pre-admission claims are
forbidden and business writes use only `issueLease/commit`. A fresh Reset first
atomically changes that authority to `reset_pending`; only then can its exact
journaling claim begin. The reservation stays owned while journal outcome is
resolved and while `acquireResetFence` upgrades a `durable_proven` reservation
to `reset_owned`. A new worker never
uses the dead worker's object: its strict journal rehydration installs a current-
worker `reset_pending` replacement before reacquiring the fence.

## Typed errors

The API reports typed authority errors and invokes zero rejected adapter:

- `INVALID_PRE_ADMISSION_CLAIM`;
- `INVALID_PRE_ADMISSION_SCOPE`;
- `INVALID_PRE_ADMISSION_CAPABILITY`;
- `INVALID_PRE_ADMISSION_WRITE_ID`;
- `INVALID_CAPABILITY_ID`;
- `CAPABILITY_ID_COLLISION`;
- `PRE_ADMISSION_COMMAND_ACTIVE`;
- `PRE_ADMISSION_COMMAND_NOT_CURRENT`;
- `PRE_ADMISSION_COMMAND_TERMINAL`;
- `PRE_ADMISSION_COMMAND_MISMATCH`;
- `PRE_ADMISSION_STAGE_MISMATCH`;
- `PRE_ADMISSION_ATTEMPT_MISMATCH`;
- `PRE_ADMISSION_WORKER_MISMATCH`;
- `DATA_EPOCH_MISMATCH`;
- `AUTHORITY_REVISION_MISMATCH`;
- `FENCE_REVISION_MISMATCH`;
- `CAPABILITY_ALREADY_CONSUMED`;
- `CAPABILITY_REVOKED`;
- `WRITE_ORDER_MISMATCH`;
- `INVALID_PRE_ADMISSION_LEAF`;
- `PRE_ADMISSION_LEAF_MISMATCH`;
- `RESET_PREFLIGHT_OPEN_WOULD_UPGRADE`;
- `RESET_PREFLIGHT_HANDLE_CLOSE_FAILED`;
- `INVALID_RESET_PRE_ADMISSION_REHYDRATION`;
- `RESET_PRE_ADMISSION_REHYDRATION_CONFLICT`;
- `AUTHORITY_REENTRANCY_FORBIDDEN`;
- `LOCK_ORDER_VIOLATION`;
- `INVALID_RESET_PRE_ADMISSION_RESERVATION`;
- `RESET_PRE_ADMISSION_OWNED`;
- `RESET_JOURNAL_CONFLICT`;
- `PRE_ADMISSION_REGISTRY_EXHAUSTED`;
- `ADMISSION_CLOSED`, `RESET_ALREADY_OWNED`, `FENCED_FAILURE` or
  `REVISION_OVERFLOW` from the central authority.

Wrong exact data is not normalized to an empty effect, retryable success or
ordinary lease. Errors are bounded diagnostics; their text never selects a
transition.

## No fallback rule

The production gate has exactly two paths:

```text
business write after OPEN_EPOCH_ADMISSION
  -> issueLease(scope)
  -> commit(lease, operationId, durableEffect)

startup/reset write declared above
  -> for fresh Reset only: reserveResetPreAdmission(exact request, exact read-leaf token)
     then journal; if its outcome is unknown, resolveInitialResetJournalOutcome(exact reservation, exact leaf)
  -> for restored Reset only: rehydrateResetPreAdmission(exact journal, exact read-leaf token)
     then acquireResetFence(exact current-worker reservation, exact journal proof)
  -> beginPreAdmissionCommand(claim)
  -> one issuePreAdmissionCapability + commitPreAdmission(exact durable leaf token) per write
  -> completePreAdmissionCommand(scope)
  -> for background handoff only: consume exact preallocated sidecar capability
     for init/slot 0->1 or post-adoption cleanup; present-slot duplicate is read-only
  -> after strict journal removal: installResetEpochAndOpen(exact removal/receipt/DB proof)
```

Missing capability methods, a different mutex, a permissive optional callback,
runtime adapter injection,
`try capability then raw write`, `try ordinary lease then capability`, a
production no-op adapter and direct raw persistence are invalid configuration.
An already-durable idempotent retry still consumes a fresh capability and must
return a strict read-back proof; the gate itself never returns synthetic
success.

## Invariants

1. Ordinary lease issuance fails while authority admission is not `open`.
2. At most one exact pre-admission command scope is active.
3. Reset reservation, claim/issue/commit/complete, ordinary commit, Reset and
   failure fence share one outer FIFO and one authority object.
4. Every durable write has one distinct declared write ID and one distinct
   one-shot capability.
5. Capability consumption precedes registered adapter invocation and every
   `await`.
6. A consumed/revoked capability can never be reissued or replayed.
7. Every issue and commit revalidates command, stage, attempt, worker, nullable
   epoch, authority revision and fence revision inside the FIFO.
8. Reset/failure fence/stage/command/attempt/epoch drift revokes all
   outstanding capabilities of the old scope; worker mismatch rejects and a
   new worker cannot possess the old exact-object registry.
9. FIFO order alone decides whether a commit or fence wins; a losing adapter is
   never invoked, while an external fence arriving during an active adapter is
   enqueued behind it rather than rejected as reentrant.
10. Allocator throw, invalid ID and collision never leak raw errors, overwrite a
    canonical token or recycle an ID; every authority call made synchronously
    from the allocator stack is rejected before enqueue.
11. Registries are bounded and never evict replay evidence within a worker.
12. Startup data-v3 transaction, Settings wrap and marker 3 are three ordered
    capabilities; marker 3 follows strict Settings read-back.
13. Reset DB6 transaction, generation-zero Settings envelope and marker 3 are
    three ordered capabilities, followed by a distinct journal checkpoint.
14. A command/stage success is not published while its scope is active.
15. There is no raw/no-op/fallback writer behind the capability boundary.
16. Fresh Reset preflight and exact `reset_pending` reservation are one FIFO
    linearization; Reset B cannot become owner after Reset A receives `fresh`.
17. Initial Reset journal creation is put-if-absent: only absence or the exact
    same Reset journal can succeed, always with strict read-back.
18. Completion/revocation retains the full terminal command key without
    eviction; the same command/attempt can never `BEGIN` again.
19. Durable and authority-read operations are exact registered data-only tokens
    backed by a closed adapter table. Adapter modules cannot import or receive
    the authority/controller, so no adapter Promise can queue behind itself.
20. Gate order is only DatasetEpoch outer -> Settings/system inner -> physical
    leaf. Holding Settings/system while requesting DatasetEpoch is forbidden.
21. A next command claim is impossible until the private workflow controller
    has accepted the prior event and exposed that exact current command proof.
22. Every preflight IDB opener runs under the outer FIFO, opens without a target
    version, aborts `onupgradeneeded`, uses readonly transactions only and proves
    handle closure before its operation settles.
23. Every journal-restored worker installs a new exact-object reservation through
    strict phase-compatible FIFO rehydration before fence reacquisition; old-
    worker reservation clones remain invalid.
24. Rehydration preserves Reset A ownership and rejects Reset B, a foreign
    journal/receipt, a third epoch and every physical fact outside the phase
    matrix without mutating authority state.
25. `reset_pending` always records one total journal status. Unknown write/read-
    back outcome can only use the same-A resolver; it is never treated as absent,
    durable, failed or available to Reset B by default.
26. `acquireResetFence` requires `durable_proven`. Fresh acquisition and
    `checkpoint_fenced` are separate boundaries; a restored `journaled` phase
    that already acquired the boot fence proceeds directly to its checkpoint
    and never acquires a second fence.
27. Durable `lastError` and `retryCount` changes occur only through
    `checkpointingFailure` and `checkpointingRetry`; their strict journal
    read-back precedes presentation-state or recovery transitions.
28. Journal removal precedes a dedicated, idempotent
    `installResetEpochAndOpen` proof. Failure after removal stays recoverable
    with admission closed and cannot yield `completed`/`reset:true`.
29. The handoff capability table is closed to one literal local key and exactly
    1 584 CAS + 3 cleanup tokens preallocated outside work registries.
30. Initialization and durable cursor materialization consume CAS capabilities;
    the strict payload carries the exact next
    `{controlAttemptIndex,transitionIndex,casAttempt}`. A definitive result
    durably advances and rereads that cursor before another bundle may run; an
    already-advanced cursor consumes zero ID and invokes zero adapter. Three
    failures move to the same transition in the next of four control attempts,
    and restart after `0:37:0` resumes only `0:37:1`.
31. Sidecar cleanup is unavailable before exact adoption, uses an exact unused
    capability bound to the current worker (original or durably reissued), and
    cannot share the distinct `handoff_cleared` journal token.
32. Local selective clear preserves exactly reset journal + handoff sidecar;
    omission, extra allowlist key or cross-reference invokes zero adapter.
33. One fresh `sidecarId` is allocated with the Reset lane before work admission
    and is immutable across all 1 587 handoff capabilities, the canonical payload,
    sidecar and reference; initialization cannot choose an ID.
34. The mailbox-close marker freezes the target and closes external allocation
    before any checkpoint reference is exposed. Later callbacks use the
    terminal no-write path. Internal checkpointing may still consume only the
    exact 1 584 already-reserved manifest entries needed to materialize that
    frozen target; it cannot allocate or mutate the target.
35. The checkpoint provenance repeats lane, Reset attempt, worker, sidecar,
    handoff, frozen-target digest and the canonical 1 584+3 manifest. Every entry
    and both digests are recalculated against the fence-retained trusted
    expectation; a self-consistent foreign lane is invalid.
36. Sidecar initialization durably stores target/digest/cursor at revision 0.
    Exactly one present slot materialization increments it, so every accepted payload
    satisfies `checkpointRevision === popcount(slotBitmap) === slotCount`.
37. A replacement worker receives one registered command/result receipt and
    exactly three cleanup token objects bound to its lane/worker and the durable
    source bundles. Old tokens, copied DTOs and foreign-worker receipts remain
    invalid; cleanup absence is idempotent.

## Required hostile review scenarios

- ordinary lease before admission is `ADMISSION_CLOSED` with zero allocation;
- exact claim succeeds; substitution of every claim/scope/capability field
  fails independently;
- null epoch accepted only while the authority has no exact epoch, and rejected
  in every known-epoch state; foreign/non-null substitution is rejected;
- a two-write command receives two distinct capabilities and two exact matching
  durable leaf tokens; reuse of either first token for the second fails before
  adapter invocation;
- double consumption, clone, stale worker, stale attempt, cross-command,
  cross-stage, cross-epoch and cross-revision replay produce zero write;
- complete command before a queued late commit revokes it; its adapter is never
  entered;
- commit-before-Reset settles before Reset; Reset-before-commit revokes and
  executes zero adapter; an external Reset arriving while an adapter Promise is
  pending waits behind it and is not `AUTHORITY_REENTRANCY_FORBIDDEN`; repeat for
  failure fence;
- allocator reenters same write, different write, complete, Reset and failure
  fence; every inner call rejects synchronously before enqueue, the outer
  allocation is latched failed, no operation binding/fence/reset ticket is
  created and the returned UUID remains burned;
- allocator throws `Error`, `undefined` and primitives; returns invalid UUID or
  every retained-ID collision; no raw value escapes;
- capability/claim registries reach their exact bounds and refuse the next
  item without eviction or allocator call;
- startup crash after IDB transaction, Settings read-back and marker write;
  each restart uses fresh IDs and never opens admission early;
- Reset crash after every write in the table; recovery uses fresh execution
  IDs, strict durable read-back, a current-worker rehydrated reservation and no
  old token;
- initial journal write/read-back returns exact durable, exact absence and
  outcome-unknown in turn; only the first may acquire a fence, the second may
  retry A with fresh IDs, the third remains in same-A resolution, and B is
  rejected throughout;
- fail every workflow step while `reset_pending` and `reset_owned`: exact
  failure checkpoint precedes `blocked`/`failed`; then fail that checkpoint and
  prove no recursive write. Explicit retry checkpoints `retryCount + 1` and
  `lastError:null` before any resumed effect;
- restart phase `journaled`: `BOOT_FENCE_ACQUIRED` routes directly to
  `checkpointingFence`, and an instrumented authority observes exactly one live
  fence acquisition for that worker;
- fail/crash after strict journal removal but before epoch installation/open:
  authority remains closed, exact receipt/removal/DB proof survives, retry or
  cold recognition opens idempotently without repeating destructive effects,
  and no response reports success before the opened proof;
- Reset A crashes after journal write and after every later checkpoint; the new
  worker rehydrates A, rejects B, reacquires the fence and resumes only after
  `BOOT_FENCE_ACQUIRED`; phase-compatible effect-ahead facts are accepted and a
  third epoch/foreign receipt is rejected without state change;
- absent DB preflight performs no open; existing DB preflight uses one readonly
  temporary handle and proves close on success, blocked, parse failure,
  versionchange and abort; `onupgradeneeded` aborts with zero schema/migration/
  marker write;
- forge/clone/cross-write every durable/read leaf token and attempt runtime
  adapter injection; no private executor runs. Static imports prove every
  allowlisted adapter lacks authority/controller/public Settings/messaging;
- hostile descriptors, accessors, sparse/oversized arrays, Symbols, inherited
  fields and revoked Proxies fail closed without getter execution;
- an injected second mutex or raw writer is rejected by architecture tests;
- missing capability implementation cannot be replaced by a no-op adapter.
- fill 0/1/131 handoff slots, replay duplicates and exhaust each third CAS
  attempt; prove the fourth control attempt uses fresh bundles from the exact
  1 584 capacity, duplicates consume zero ID and
  failure before clear invokes neither session nor local clear;
- close the mailbox in both race orders, prove pre-marker input belongs to the
  immutable target and post-marker input receives the closed terminal; attempt
  every slot operation from an external callback after close and observe zero
  allocation/adapter invocation, while the internal executor consumes only the
  already-reserved entries for frozen target slots;
- substitute the preallocated sidecar ID independently in lane, every CAS,
  every cleanup, capability, sidecar, payload and reference; no leaf runs and
  initialization cannot repair or allocate a replacement;
- clear session, restart, selective local clear, adopt and crash before cleanup;
  prove the sidecar survives each point, cleanup requires one of three fresh
  closed tokens, absence read-back precedes a distinct journal checkpoint, and
  journal removal cannot overtake it;
- restart independently before cleanup attempts 0, 1 and 2; reissue the exact
  durable three-entry cleanup tuple on a fresh worker/lane, reject every old
  worker token and any tuple/manifest/sidecar substitution, and accept exact
  `removed` or `already_absent` idempotently;
- substitute sidecar key/id/digest/revision/slot/attempt/capability and the exact
  two-key local-clear allowlist independently; every mismatch invokes zero leaf.

## Out of scope

- implementation of the authority methods or executable contracts/machines;
- changing DB5/data2 production activation before the coordinated cutover;
- consumer quota reservation policy beyond the hard ordinary-authority bounds
  defined by `db-migration.model.md`;
- UI status or error wording;
- any LLM-driven admission, retry or state transition.
