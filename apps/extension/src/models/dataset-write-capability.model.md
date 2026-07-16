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
5. the capability is consumed before its durable callback is invoked or
   awaited;
6. command/stage/attempt/epoch/revision drift revokes the claim; worker
   mismatch rejects, and worker termination destroys its whole registry;
7. an ordinary lease remains impossible before admission opens.

For a fresh Reset, preflight and reservation are one outer-gate operation. The
authority changes to `reset_pending` for that exact reset before returning the
fresh proof. Journal creation then uses put-if-absent under that reservation.
There is no unowned interval between Reset A's fresh preflight, journal and
fence where Reset B can reserve or overwrite the dataset.

The capability proves admission of one durable effect. It does not prove that
the effect succeeded. Only the strict effect read-back and the owning workflow
event may do that.

## Exact vocabulary

```ts
type DatasetPreAdmissionOwner = 'startup' | 'reset';

type DatasetPreAdmissionStage =
  | `startup:${DatasetStartupStage}`
  | 'reset:journaling'
  | 'reset:fencing'
  | 'reset:checkpointingQuiescence'
  | 'reset:closingDatabase'
  | 'reset:deletingDatabase'
  | 'reset:clearingSession'
  | 'reset:clearingLocal'
  | 'reset:reinitializing'
  | 'reset:aligningSettings'
  | 'reset:writingReceipt'
  | 'reset:checkpointingCommit'
  | 'reset:clearingJournal';

type DatasetPreAdmissionWriteKind =
  | 'startup.structure.db6_upgrade_transaction'
  | 'startup.data.tracking_v3_transaction'
  | 'startup.data.settings_v2_wrap'
  | 'startup.data.marker3_write'
  | 'startup.prepared_ledgers.recovery_transaction'
  | 'startup.settings_recovery.envelope_write'
  | 'reset.journal.initial_put'
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
  | 'reset.journal.remove';

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

interface DatasetPreAdmissionCommandTerminalV1 extends DatasetPreAdmissionCommandKeyV1 {
  disposition: 'completed' | 'revoked';
  terminalFenceRevision: number;
}
```

All IDs are exact own enumerable data fields. UUID fields are canonical
lowercase UUID v4s. `claimId`, `attemptId`, `workerEpoch` and every `writeId`
are pairwise distinct inside one scope; every allocated `capabilityId` is also
distinct from them and from all retained IDs. For Startup, `workflowId`
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

The returned scope and capability are registered exact-object tokens. A spread
clone, structured clone, Proxy, accessor-bearing object, custom prototype,
hidden or Symbol key is invalid even when its visible values look equal. The
authority never rereads a raw input after strict capture.

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

| Authority/owner position                                               | Exact claim `dataEpoch`                             |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| Startup `closed_startup`, authority has not retained a canonical epoch | `null`                                              |
| Startup `closed_startup` after Reset installed a pending next epoch    | that exact pending next epoch                       |
| Reset `journaling` under its exact `reset_pending` reservation         | exact reserved `previousDataEpoch`, including `null` |
| Reset cleanup through `clearingLocal` under `reset_owned`              | exact `previousDataEpoch`, including literal `null` |
| Reset `reinitializing` through `clearingJournal`                       | exact `nextDataEpoch`                               |

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
advanced fence and invokes zero durable callback.

## Bounded registries, with no eviction

The worker retains these registries:

```text
MAX_PRE_ADMISSION_WRITES_PER_COMMAND = 256
MAX_RETAINED_PRE_ADMISSION_CLAIMS_PER_WORKER = 4096
MAX_RETAINED_PRE_ADMISSION_TERMINAL_KEYS_PER_WORKER = 4096
MAX_RETAINED_PRE_ADMISSION_WRITE_IDS_PER_WORKER = 16384
MAX_RETAINED_PRE_ADMISSION_CAPABILITIES_PER_WORKER = 16384
MAX_RETAINED_RESET_RESERVATIONS_PER_WORKER = 256
```

- one active scope, or none;
- every claim ID ever accepted in this worker;
- every terminal command key and its completion disposition;
- every capability ID and its terminal state (`consumed`, `settled` or
  `revoked`);
- every declared write ID, including writes revoked before issuance, and its
  claim binding;
- every Reset reservation and its exact-object token.

Completed/revoked entries are never evicted or reused. Reaching a limit returns
`PRE_ADMISSION_REGISTRY_EXHAUSTED` before allocator invocation and performs no
state change. Recovery requires a new worker epoch, not deletion of replay
evidence inside the worker. Old tokens remain invalid because they bind the old
worker epoch and exact-object registry.

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
FIFO, never a capability callback.

## Exact Reset write kinds

| Reset state               | Ordered capability writes                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journaling`              | `reset.journal.initial_put` as exact put-if-absent plus strict read-back under the same Reset reservation                                                                                |
| `fencing`                 | `reset.journal.checkpoint_fenced` after `acquireResetFence` resolves                                                                                                                      |
| `checkpointingQuiescence` | `reset.journal.checkpoint_quiesced`                                                                                                                                                       |
| `closingDatabase`         | `reset.journal.checkpoint_handles_closed`; closing handles itself is not a durable Dataset write                                                                                          |
| `deletingDatabase`        | 1. `reset.database.delete`; 2. `reset.journal.checkpoint_database_deleted`                                                                                                                |
| `clearingSession`         | 1. `reset.session.clear`; 2. `reset.journal.checkpoint_session_cleared`                                                                                                                   |
| `clearingLocal`           | 1. `reset.local.selective_remove`; 2. `reset.journal.checkpoint_local_cleared`                                                                                                            |
| `reinitializing`          | 1. `reset.reinitialize.db6_transaction`; 2. `reset.reinitialize.settings_v2_generation_zero`; 3. `reset.reinitialize.marker3_write`; 4. `reset.journal.checkpoint_database_reinitialized` |
| `aligningSettings`        | one `reset.settings_recovery.envelope_write` per exact shared Settings write, then `reset.journal.checkpoint_settings_aligned`                                                            |
| `writingReceipt`          | `reset.receipt.put`; the strict read-back is read-only                                                                                                                                    |
| `checkpointingCommit`     | `reset.journal.checkpoint_committed`                                                                                                                                                      |
| `clearingJournal`         | `reset.journal.remove`                                                                                                                                                                    |

`preflightingCompletion`, `reacquiringFence`, `routingRestart`, `quiescing`,
`broadcastingReadiness` and `broadcastingCommitted` contain no capability
write. Reset's DB6 transaction, Settings generation-zero write and marker-3
write are three separate capabilities in that order. The journal checkpoint is
a fourth boundary. Marker 3 can never precede the strict Settings V2 read-back.

`reset.local.selective_remove` is exactly one bounded
`chrome.storage.local.remove(keys)` call that excludes the active journal. It
is never `chrome.storage.local.clear()`. If a future API forces chunking, the
model and write plan must be reviewed first; a token may not be reused across
chunks.

## Atomic Reset reservation and journal ownership

`reserveResetPreAdmission(request, preflightLeaf)` is a dedicated operation on
the outer DatasetEpoch FIFO. `preflightLeaf` is a read-only leaf port obeying
the lock hierarchy below. At one uninterrupted gate position the authority:

1. strictly captures the full Reset request;
2. reads the reserved journal, latest receipt and canonical DB6/data3 epoch;
3. returns recognized completion without a reservation only for the exact
   terminal proof;
4. for a fresh proof, verifies journal absence and exact previous/next epoch;
5. installs `reset_pending` for that exact Reset and returns one frozen
   `ResetPreAdmissionReservationV1` before releasing the gate.

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
same-looking no-op without strict read-back is forbidden. Put/read-back failure
keeps the reservation `reset_pending`; only the same durable Reset with a new
modeled execution attempt may retry. Reset B remains rejected.

After the journal scope becomes terminal, `acquireResetFence` accepts only the
exact reservation object and exact journal proof, then changes that same owner
from `reset_pending` to `reset_owned`. It never releases ownership between the
two states. A crash after the journal but before ownership is reconstructed by
the journal's exact Reset on the next worker; a foreign live request never
inherits it.

## State and transition model

```text
resetUnreserved
  -- RESERVE_RESET_PREFLIGHT(fresh exact proof) --> resetPending(A)
resetPending(A)
  -- BEGIN journaling(A) --> active
  -- RESERVE exact duplicate A --> resetPending(A) (same reservation object)
  -- RESERVE different B --> rejected (A remains owner)
  -- journal proof + ACQUIRE_RESET_FENCE(A) --> resetOwned(A)

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
durable Promise settles. There is no cancellation fiction for an already
entered transaction. Reset/failure fence queued first revokes before a later
commit and the callback is never invoked; a commit queued first settles before
the fence.

## Authority operations

### `reserveResetPreAdmission(request, preflightLeaf)`

This operation implements the atomic Reset protocol above. It holds the outer
DatasetEpoch gate through the read-only preflight leaf and registration of the
exact `reset_pending` owner. It returns neither `fresh` nor a reservation if a
foreign reservation/journal exists. A reservation clone is never accepted by
later journaling/fence operations.

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

### `commitPreAdmission(capability, writeId, durableEffect)`

`durableEffect` is a structurally branded leaf port. It has no
`DatasetEpochAuthority`, workflow controller or general Settings orchestrator
reference. The callable/brand is validated before enqueue. At its FIFO position
the authority:

1. verifies exact token identity and every field;
2. verifies active scope, next ordinal, nullable epoch and both revisions;
3. rejects consumed/revoked/foreign/cross-command tokens;
4. marks the capability `consumed` **before invoking the callback**;
5. invokes exactly once and holds the FIFO until its Promise settles;
6. records `settled` only on fulfillment; rejection leaves it consumed.

A synchronous throw, malformed returned value or rejected Promise is a durable
effect failure, never permission to replay the token. A callback cannot queue a
second write with the same capability. Any late continuation must acquire the
next declared capability or performs zero write.

While the leaf or allocator is executing, the authority sets a synchronous
dispatch-depth sentinel. Every mutative authority entrypoint checks that
sentinel before constructing a queue ticket or Promise. Reentrant
issue/commit/complete, ordinary lease/commit, Reset reservation/fence,
install/open admission and failure fence therefore fail immediately with
`AUTHORITY_REENTRANCY_FORBIDDEN`. `await authority.*` inside the leaf receives
that immediate rejection; it can never wait on work queued behind itself. The
outer capability remains consumed and the violation is latched, so hostile
callback code cannot catch the inner rejection and turn the outer result into a
valid workflow proof.

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
- A callback under DatasetEpoch cannot call a general Settings recovery/save
  API that might reacquire DatasetEpoch. It may call only the inner leaf that
  performs the already-authorized physical operation.
- IDB-only leaves use no inner Settings gate. They still cannot call back into
  DatasetEpoch or a workflow controller.
- Neither gate callback awaits arbitrary user code, message delivery or another
  operation capable of acquiring an equal/lower-ranked gate.

The lock-rank check is synchronous and shared by both gates. A violation is
latched on the outer operation even when hostile callback code catches the
inner error. Static architecture checks additionally prove that leaf modules do
not import the authority, controller or public Settings orchestration. Runtime
rejection prevents deadlock; static structure prevents a caught violation from
performing an unmodeled write afterward.

## Allowed authority states

| Owner/stage                                               | Required authority state                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Startup mutating stage                                    | `closed_startup`; never `open`, `reset_pending`, `reset_owned` or `fenced_failure`                          |
| Reset `journaling`                                        | `reset_pending` with the exact canonical reservation returned by atomic fresh preflight |
| Reset after `acquireResetFence` through `clearingJournal` | `reset_owned` for that same reservation/reset ID/epochs                                |

Once `OPEN_EPOCH_ADMISSION` succeeds, startup pre-admission claims are
forbidden and business writes use only `issueLease/commit`. A fresh Reset first
atomically changes that authority to `reset_pending`; only then can its exact
journaling claim begin. The reservation stays owned while journaling completes
and while `acquireResetFence` upgrades it to `reset_owned`.

## Typed errors

The API reports typed authority errors and invokes zero rejected callback:

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
- `INVALID_DURABLE_EFFECT`;
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
  -> for fresh Reset only: reserveResetPreAdmission(exact request, preflight leaf)
  -> beginPreAdmissionCommand(claim)
  -> one issuePreAdmissionCapability + commitPreAdmission per write
  -> completePreAdmissionCommand(scope)
```

Missing capability methods, a different mutex, a permissive optional callback,
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
5. Capability consumption precedes callback invocation and every `await`.
6. A consumed/revoked capability can never be reissued or replayed.
7. Every issue and commit revalidates command, stage, attempt, worker, nullable
   epoch, authority revision and fence revision inside the FIFO.
8. Reset/failure fence/stage/command/attempt/epoch drift revokes all
   outstanding capabilities of the old scope; worker mismatch rejects and a
   new worker cannot possess the old exact-object registry.
9. FIFO order alone decides whether a commit or fence wins; a losing callback
   is never invoked.
10. Allocator throw, invalid ID and collision never leak raw errors, overwrite a
    canonical token or recycle an ID; every reentrant authority call is rejected
    before enqueue.
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
19. Allocator and durable callbacks are structurally leaf and cannot access the
    authority/controller; runtime reentrancy is rejected before a Promise can
    queue behind itself.
20. Gate order is only DatasetEpoch outer -> Settings/system inner -> physical
    leaf. Holding Settings/system while requesting DatasetEpoch is forbidden.
21. A next command claim is impossible until the private workflow controller
    has accepted the prior event and exposed that exact current command proof.

## Required hostile review scenarios

- ordinary lease before admission is `ADMISSION_CLOSED` with zero allocation;
- exact claim succeeds; substitution of every claim/scope/capability field
  fails independently;
- null epoch accepted only while the authority has no exact epoch, and rejected
  in every known-epoch state; foreign/non-null substitution is rejected;
- a two-write command receives two distinct capabilities; reuse of the first
  for the second fails before callback;
- double consumption, clone, stale worker, stale attempt, cross-command,
  cross-stage, cross-epoch and cross-revision replay produce zero write;
- complete command before a queued late callback revokes it; late callback is
  never entered;
- commit-before-Reset settles before Reset; Reset-before-commit revokes and
  executes zero callback; repeat for failure fence;
- allocator reenters same write, different write, complete, Reset and failure
  fence; canonical token/revision/FIFO results remain deterministic;
- allocator throws `Error`, `undefined` and primitives; returns invalid UUID or
  every retained-ID collision; no raw value escapes;
- capability/claim registries reach their exact bounds and refuse the next
  item without eviction or allocator call;
- startup crash after IDB transaction, Settings read-back and marker write;
  each restart uses fresh IDs and never opens admission early;
- Reset crash after every write in the table; recovery uses fresh execution
  IDs, strict durable read-back and no old token;
- hostile descriptors, accessors, sparse/oversized arrays, Symbols, inherited
  fields and revoked Proxies fail closed without getter execution;
- an injected second mutex or raw writer is rejected by architecture tests;
- missing capability implementation cannot be replaced by a no-op adapter.

## Out of scope

- implementation of the authority methods or executable contracts/machines;
- changing DB5/data2 production activation before the coordinated cutover;
- ordinary post-admission write leases and quota reservation policy;
- UI status or error wording;
- any LLM-driven admission, retry or state transition.
