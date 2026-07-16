# Local Data Reset Model

Source of truth for the destructive local-data reset workflow. Reset coordinates
scan, migration, application tracking, IndexedDB handles,
`chrome.storage.session` and `chrome.storage.local`. It is not a convenience
`Promise.all(clear, deleteDatabase)` helper.

The pure executable statechart is `local-data-reset.machine.ts`. Strict reset
types, proof parsers, error matrix, restart classification and readiness
correlation live in the separately testable `local-data-reset.contract.ts`.
The exact epoch-broadcast wire schema and UUID-v4 parser have one neutral source
of truth, `local-data-reset-epoch.contract.ts`, which both Reset and Settings
import. Shell observes machine state and performs effects; none of these pure
files calls Chrome, IndexedDB, timers, clocks, UUID generation or a LLM.

Every Reset-owned durable Dataset write composes with
`dataset-write-capability.model.md`. Reset does not receive an ordinary
business lease and does not own a second lock; its claims, one-shot writes,
fence acquisition and epoch installation all linearize on the single
`DatasetEpochAuthority` FIFO.

## Objective

A successful reset leaves exactly one fresh, internally consistent local
dataset:

- no pre-reset scan/session state;
- no pre-reset local-storage settings, caches or migration diagnostics;
- a newly created DB6/data3 database;
- one strict `tracking_meta` row with a new `dataEpoch` and
  `collectionRevision: 0`;
- one settled shared-contract `SettingsEnvelopeV2` with the same epoch,
  revision 0, exact generation, `journal: null` and `outcomes: []`, plus the
  matching auto-scan alarm proof;
- one latest-only terminal receipt for the exact reset request, retained after
  journal clear;
- no tracking envelopes, mutation ledgers or outbox rows;
- every pre-reset actor, request, response and broadcast permanently unable to
  mutate the new dataset.

Reset success is durable fact, not UI optimism. On the executing path,
`reset:true` is forbidden until the journal has been removed after every
prerequisite succeeds. A replay after clear may return success only through the
strict post-clear recognition proof below.

## Identities and injected inputs

Shell injects all unpredictable values before `RESET_REQUESTED`:

```ts
interface LocalDataResetRequestV1 {
  resetId: string; // UUID v4
  previousDataEpoch: string | null; // null when metadata is absent/corrupt
  nextDataEpoch: string; // fresh UUID v4, different from previous
  settingsRecoveryRequestId: string; // stable reset-owned recovery ID
  settingsBootstrapRequestId: string; // stable post-commit Load ID
  requestedAt: number; // non-negative safe-integer epoch milliseconds
}
```

The machine rejects malformed non-null UUIDs, equal epochs, reused identities
and invalid time. Both Settings IDs are allocated once, persisted before any
mutating effect and retained unchanged by every retry/restart. The reset-owned command
ID is deterministically
`settings/reset-recover/<settingsRecoveryRequestId>`; it is never regenerated
from panel state, free text or a clock.
`previousDataEpoch: null` is required when fail-closed startup cannot read a
strict metadata epoch; it authorizes reset, not normal tracking admission. In
that case the fence invalidates every pre-reset actor/request globally rather
than matching one readable epoch. Retry after a partial reset retains the same
`resetId` and `nextDataEpoch`; it never creates a second dataset identity. A
completely new reset intent creates new IDs.

The trusted Shell additionally injects a capability-only execution
`attemptId` and uses the authority's captured `workerEpoch`. They are not new
journal fields. Every explicit retry and worker restart receives a fresh
attempt ID; every durable reset identity above remains unchanged. The exact
capability command ID is
`local-data-reset/<active-state>/<resetId>/<attemptId>`.

The dataset authority fence request repeats the exact `resetId`,
`previousDataEpoch` and `nextDataEpoch` from this intent. Taking its FIFO
position immediately closes new lease issuance (`reset_pending`) without
overtaking durable commits already queued before it. The returned one-shot token
binds those same three values; epoch installation consumes the token without a
second caller-supplied epoch choice.

`resetId`, `nextDataEpoch`, `settingsRecoveryRequestId` and
`settingsBootstrapRequestId` are pairwise-distinct canonical lowercase UUID
v4s. A non-null `previousDataEpoch` is also distinct from all four. The recovery
ID deliberately remains outside the neutral epoch-broadcast payload; it belongs
to the reset request/journal and reset-owned Settings command only.

## Read-only preflight and post-clear recognition

Every valid `RESET_REQUESTED` first enters `preflightingCompletion`, before the
ten-phase journal and before any fence, clear, close, delete or write. Shell
performs one read-only, exact-key proof under the serialized dataset authority.
The reset actor accepts exactly one of two outcomes:

- `fresh`: reserved reset journal absent, canonical current epoch exactly
  `previousDataEpoch` (including `null`), and `nextDataEpoch` different from the
  current epoch. Only this result may enter `journaling`.
- `already_completed`: reserved reset journal absent, canonical current epoch
  exactly `nextDataEpoch`, and the latest-only terminal receipt exactly matches
  the original reset ID, previous/next epochs, both Settings IDs, `requestedAt`
  and `phase:'committed'`. The current authority proof additionally requires
  DB6/data3, exact verified schema and strict
  `tracking_meta(dataEpoch:nextDataEpoch)` with any safe non-negative current
  collection revision.

Recognition deliberately does not require stores still empty, Settings still at
defaults or the alarm still at its reset-time value: legitimate E2 writes may
have occurred after journal clear. Those reset-time facts are causally captured
by the ordered receipt write described below. A malformed/mismatched receipt,
wrong epoch, divergent DB/schema authority, hidden/extra key or non-canonical
identity never falls through to journaling.

The durable receipt lives at
`missionpulse.localDataResetReceipt.v1` in `chrome.storage.local`. It is bounded
to the latest reset only, remains after the response, and is removed by the next
reset's selective local clear before that reset writes its own receipt.
Recognition performs zero second destruction, zero fence acquisition and zero
journal write, and completes with diagnostic
`completionDisposition:'recognized'`. The receipt adds one bounded
Chrome-storage system key but no DB store, `tracking_meta` field, DB-version or
data-version change.

## Durable journal

Before admission closes or any destructive effect begins, Shell writes this
strict record to reserved key `missionpulse.localDataReset.v1` in
`chrome.storage.local`:

```ts
type LocalDataResetPhase =
  | 'journaled'
  | 'fenced'
  | 'quiesced'
  | 'handles_closed'
  | 'database_deleted'
  | 'session_cleared'
  | 'local_cleared'
  | 'database_reinitialized'
  | 'settings_aligned'
  | 'committed';

interface LocalDataResetJournalV1 {
  schemaVersion: 1;
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  phase: LocalDataResetPhase;
  requestedAt: number;
  retryCount: number;
  lastError: {
    code: LocalDataResetErrorCode;
    step: LocalDataResetStep;
    origin: 'workflow_step' | 'boot_fence_reacquisition';
    message: string;
    retryable: boolean;
  } | null;
}
```

Each durable phase-changing effect is followed by a journal checkpoint before
the machine advances past that phase. Readiness and terminal-receipt read-back
are ordered prerequisites of the single `committed` checkpoint and repeat
together if that checkpoint is not durable. If an effect succeeds and its
checkpoint write fails, the previous phase remains authoritative; retry repeats
the effect idempotently. The journal is never put in `chrome.storage.session`
because that store is deliberately cleared mid-workflow.

The journal key is excluded from selective local clearing and is removed as the
last durable prerequisite. A corrupt journal is fail-closed: reset and normal
startup stay fenced, the bytes are preserved, and diagnostics require explicit
support/recovery. Code must not guess a phase or generate another epoch.
Journal and nested-error objects reject unknown or missing keys. Error messages
must contain 1..500 UTF-16 code units, which bounds persisted diagnostics.

`origin: 'workflow_step'` follows the strict phase matrix: `lastError.step`
must match the next step implied by `phase`, except the cross-cutting
`JOURNAL_FAILED` and the exact receipt errors attached to
`settings_aligned`; this also applies to non-retryable `PROTOCOL_ERROR`. There
is no `PROTOCOL_ERROR/journal` exception. The sole phase-independent mapping is
`origin: 'boot_fence_reacquisition'`, which requires exactly retryable
`FENCE_FAILED/fence`. That discriminant proves that failure occurred while
recreating the live fence, rather than while executing the phase-implied next
effect. Any other origin/code/step combination makes the journal corrupt and
produces `JOURNAL_CORRUPT/journal` without rewriting the corrupt bytes.

## Terminal receipt

The latest-only receipt is a separate exact-key system record:

```ts
interface LocalDataResetReceiptV1 {
  schemaVersion: 1;
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  phase: 'committed';
}
```

It uses the same canonical UUID and structural-uniqueness matrix as the reset
request/journal, and exact `requestedAt`. Unknown/missing/hidden/Symbol/accessor
keys or a custom prototype are invalid. Shell may write it only in
`writingReceipt`, after exact Settings/alarm alignment and accepted readiness,
while the journal and live fence remain present. The put and strict read-back
are one modeled effect. Only after the matching event may the journal checkpoint
phase `committed`. This ordering makes `{ journal absent + exact receipt }`
terminal evidence without cross-key atomicity.

The bounded receipt is a global system writer under the same storage gate as
Settings; its maximum footprint is included in
`SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES` and cannot consume a user mutation's
transactional reservation.

## Admission fence and ownership

The reset coordinator is the exclusive owner of global local-data admission
from live fence acquisition until `completed`. The fence is the central
dataset-epoch commit gate defined by `db-migration.model.md`, not a
tracking-local boolean:

- scan start, persistence and retry are rejected or cancelled;
- the tracking startup barrier cannot start/retry migration or recovery;
- per-mission tracking actors accept no new commands and ignore late events;
- the disabled outbox remains stopped;
- all openers refuse new DB handles except the reset-owned fresh reinitializer;
- settings and other local-storage writers pause behind the same fence.

Acquiring the fence atomically closes admission, increments the worker-local
epoch-authority revision and revokes every outstanding dataset-write lease.
Every internal writer — scan mission persistence, scan/session checkpoints,
profile/settings saves and compensation, generated assets, semantic/TJM cache,
seen/favorite state and background callbacks — must revalidate its epoch lease
inside the same gate immediately before commit. Reset holds the gate until all
older commits settle, so no queued pre-reset work can write after release.

Service-worker startup reads the journal before opening IndexedDB or registering
business handlers. Journal presence installs an outer boot deny-gate, but a
durable phase never proves that the new worker owns a live fence. The machine
restores every valid journal with `fenceAcquired:false` and enters
`reacquiringFence`. Shell may emit correlated
`BOOT_FENCE_ACQUIRED { resetId }` only after the epoch authority, handlers and
openers of this worker are fenced. Only then may the machine route by durable
phase or expose `blocked`/`failed`. Therefore no destructive resume effect can
start between crash recovery and live-fence proof.

If that live reacquisition fails, Shell first checkpoints the unchanged durable
phase with `lastError = { code:'FENCE_FAILED', step:'fence',
origin:'boot_fence_reacquisition', retryable:true, ... }`, then emits the same
strict `STEP_FAILED`. The machine enters `failed`. This journal reparses for all
ten phases, so another worker wakeup again reacquires the outer live deny-gate,
routes to `failed` and waits for a same-reset `RETRY`; it never becomes corrupt
or resumes a phase effect automatically.

Closing a side panel or losing the initiating message port does not cancel a
journaled reset. There is no cancellation transition after `RESET_JOURNALED`.
Before the journal exists, a transport loss merely means no destructive reset
has started.

## Canonical settings authority

Reset imports `SettingsEnvelopeV2` and its strict validator from
`settings-persistence.contract.ts`, the single Task 6 storage authority. It
never writes a reset-specific or reduced settings record. A fresh envelope is
exactly `{ version:2, dataEpoch:nextDataEpoch, revision:0, generation:0,
settings:defaults, journal:null, outcomes:[] }`. The reset machine receives the
validated defaults and sorted build connector catalogue as immutable input;
`DATABASE_REINITIALIZED` carries the physical read-back, and its guard invokes
the shared validator before accepting revision/generation zero, exact defaults,
empty outcomes and null Settings journal. Unexpected keys, wrong epoch,
malformed settings/journal/outcomes, or a nonzero initial generation fail
reinitialization closed and preserve the reset journal.

The same `DATABASE_REINITIALIZED` event also carries a strict physical proof of
DB6/data3, exact schema, `tracking_meta(nextDataEpoch, collectionRevision:0)`
and the ordered zero-row vector `connector_status`, `generated_assets`,
`mission_tracking`, `missions`, `profile`, `quarantine`,
`tracking_mutations`, `tracking_outbox`. The guard parses both proofs before
marking `database_reinitialized`; this is the immutable reset-time fact later
captured by the terminal receipt ordering.

## Reset-owned Settings recovery and proof

The new database is not ready to broadcast merely because its initial envelope
is valid. In `aligningSettings`, reset alone may call the shared Settings
recovery engine while its own journal is present:

```ts
interface AlignSettingsForResetV1 {
  version: 1;
  resetId: string;
  dataEpoch: string;
  requestId: string; // settingsRecoveryRequestId
  commandId: string; // settings/reset-recover/<requestId>
  expectedResetPhase: 'database_reinitialized';
}
```

Admission requires the same live reset fence, exact reset ID/phase/next epoch,
and no concurrent Settings writer. The idempotent effect strictly reads the
fresh envelope, recovers any Settings journal, and, when `auto-scan` differs,
atomically installs a system `effects_pending` journal before changing only the
MissionPulse `auto-scan` alarm. It then reads the effect, clears the system
journal, and rereads envelope plus alarm under the same fence/lease. No panel or
UI Load participates.

Success returns a reset-owned proof rather than weakening the UI snapshot
contract (`SettingsSnapshotV1` still requires reset-journal absence):

```ts
interface ResetOwnedSettingsAlignmentProofV1 {
  version: 1;
  resetId: string;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  resetPhase: 'database_reinitialized';
  envelope: SettingsEnvelopeV2;
  alarmProof: AutoScanAlarmProofV1;
}
```

The exact parser imports both shared validators. It requires the stable reset,
epoch, request and deterministic command identities; revision zero; exact
defaults; empty outcomes; null Settings journal; and an alarm proof whose
digest, revision, **settled generation**, request and command equal the final
envelope. Initialization proves generation zero; system recovery may advance
that generation without changing revision, so the reset does not invent a
local generation delta. The final alignment parser therefore accepts the exact
safe non-negative settled generation carried by the envelope and alarm proof;
this does not weaken `DATABASE_REINITIALIZED`, whose separate physical proof
still requires generation zero. Shell checkpoints phase `settings_aligned` before
emitting `SETTINGS_ALIGNED`; an uncheckpointed proof cannot advance the actor.

## Epoch notifications and Load join

Both broadcasts use the one exact-key payload exported by
`local-data-reset-epoch.contract.ts`; Reset re-exports its type and parser but
does not redefine either. The neutral parser requires `version:1`, one of the
two exact stages, canonical lowercase UUID v4s, no extra/missing keys, and
structural uniqueness: reset, next epoch and bootstrap IDs are distinct; a
non-null previous epoch is distinct from all three. `settingsRecoveryRequestId`
is intentionally not part of this wire payload and remains separately strict in
the reset request/journal. Strict object admission accepts only
`Object.prototype`/null prototypes, exact `Reflect.ownKeys`, and own enumerable
data descriptors; accessors, symbols, inherited/custom prototypes and hidden
extras fail closed before any property getter can run. Delivery is a separate
adapter fact.

Settings may wrap the neutral payload as `{ type, payload,
resetFenceProof? }`. It must parse `payload` only through the shared parser; any
trusted-bootstrap/fence authority needed for a Settings-only
`previousDataEpoch:null` path stays in `resetFenceProof`, outside the neutral
payload and outside Reset's wire schema.

For the direct `committed`/null-previous Settings path, the trusted dataset
epoch/bootstrap boundary may attach this Settings-specific ephemeral proof:

```ts
interface ResetFenceProofV1 {
  version: 1;
  kind: 'DATASET_EPOCH_RESET_FENCE';
  issuedTo: 'settings-bootstrap';
  resetId: string;
  nextDataEpoch: string;
  settingsBootstrapRequestId: string;
  resetPhase: 'committed';
  authorityFenceHeld: true;
  gateLeaseId: string;
  proofId: string;
}
```

The three payload identities must equal the parsed neutral payload;
`gateLeaseId` and `proofId` are canonical UUID v4s pairwise distinct from each
other and from reset/next/bootstrap. Only the trusted boundary may construct the
proof while the exact committed journal and live authority fence are both held;
accepting the same-shaped object from an untrusted message is forbidden. Reset
itself still broadcasts only the neutral payload. This fence proof is ephemeral
and distinct from the required durable terminal reset receipt; it adds no
DB/storage schema.

`ready_to_commit` invalidates old panel projections, moves Settings to
`resetPending`, disables mutations, clears its command and emits **zero Load**.
After that dispatch is accepted, reset checkpoints phase `committed`; only then
may the exact `committed` payload be sent. The reset journal remains present so
the post-commit event can be replayed after a crash. A Settings consumer emits
one `RECOVER_AND_LOAD_SETTINGS` using `settingsBootstrapRequestId` and
`resetCorrelation={resetId,nextDataEpoch}`; duplicate committed events do not
emit another command.

The executor applies this join matrix before normal Settings recovery:

| Reset journal            | Non-correlated Load                            | Load correlated to same reset/epoch |
| ------------------------ | ---------------------------------------------- | ----------------------------------- |
| absent                   | normal recovery                                | normal recovery                     |
| phase before `committed` | `SETTINGS_RESET_IN_PROGRESS`                   | `SETTINGS_RESET_IN_PROGRESS`        |
| phase `committed`        | join finalizer or `SETTINGS_RESET_IN_PROGRESS` | mandatory join; no error            |
| different reset/epoch    | reset/protocol error                           | protocol error                      |

The mandatory join waits for `JOURNAL_CLEARED` and opening of the new epoch
authority, then performs ordinary recovery and returns only a settled snapshot
with `resetJournalAbsent:true`. Broadcast dispatch never awaits that Load, so
reset can clear the journal and unblock it without deadlock.

## Ordered effect protocol

The only successful order is:

0. **Preflight.** Read and strictly validate the reserved-journal absence,
   canonical epoch and either fresh-admission or post-clear terminal proof. A
   recognized completion ends here; a fresh proof alone may continue. This
   step is read-only and is not an eleventh durable phase.
1. **Journal.** Persist phase `journaled` with stable IDs and epochs.
2. **Fence.** Acquire reset admission, invalidate old epoch ownership, stop
   startup-barrier retry, then checkpoint `fenced`.
3. **Quiesce.** Cancel or settle the active scan; stop tracking actors; await any
   active migration transaction; stop outbox work. Checkpoint `quiesced` only
   when all four proofs are true.
4. **Close handles.** Close every connection in the central DB-handle registry,
   prevent new non-reset openers, then checkpoint `handles_closed`.
5. **Delete database.** Await `indexedDB.deleteDatabase('missionpulse')` success,
   then checkpoint `database_deleted`.
6. **Clear session.** Run `chrome.storage.session.clear()` after all sanctioned
   session writers are quiescent, then checkpoint `session_cleared`.
7. **Clear local selectively.** Snapshot all local keys and remove every key
   except `missionpulse.localDataReset.v1`. No writer may create a concurrent
   key while fenced. This removes any previous latest-only terminal receipt.
   Checkpoint `local_cleared` in the preserved journal.
8. **Reinitialize.** Reset-owned open creates/verifies exact DB6 schema, creates
   strict metadata with the journal's `nextDataEpoch`, verifies empty tracking,
   ledger and outbox stores, writes the shared-contract `SettingsEnvelopeV2`
   with validated defaults, the same epoch, revision 0, generation 0,
   `journal: null` and `outcomes: []`, then reads both authorities through their
   strict validators and writes `APP_DATA_VERSION = 3`. Re-running is a no-op
   only for the exact epoch/envelope/empty-store proof. Normal lease admission
   remains closed. Checkpoint `database_reinitialized`.
9. **Align Settings.** Execute the reset-owned recovery above, prove the exact
   alarm and settled envelope, then checkpoint `settings_aligned`.
10. **Broadcast readiness.** Dispatch exact stage `ready_to_commit`; it is a
    pre-commit invalidation, never reset success and never a Load trigger.
11. **Write and read back terminal receipt.** Under the same global fence and
    system storage gate, put the exact latest-only
    `missionpulse.localDataResetReceipt.v1`, then reread and strictly parse every
    ID, epoch, `requestedAt` and `phase:'committed'`. Receipt storage is included
    in the bounded Settings/system quota reserve. A matching existing receipt is
    an idempotent success; a different receipt is a protocol conflict.
12. **Checkpoint commit.** Persist phase `committed` only after exact readiness
    acceptance and receipt read-back. This durable cutover implies the Settings
    proof; the journal remains solely to replay final notification.
13. **Broadcast committed.** Dispatch the same generation body with stage
    `committed`. A panel may now issue its single correlated, joining Load.
14. **Clear journal.** Remove `missionpulse.localDataReset.v1`; open the new
    epoch authority and transition to `completed` only after removal succeeds.
    Only then may Shell return
    `LOCAL_DATA_RESET_RESULT { reset: true, dataEpoch: nextDataEpoch }`.

Both broadcast success events echo the complete attempted payload plus
`delivery: 'delivered' | 'no_receiver'`. Strict guards compare stage, reset ID,
nullable previous epoch, next epoch and bootstrap request ID. Wrong/extra
fields cannot checkpoint commit or clear the journal. A crash after readiness
but before receipt repeats readiness; a crash after receipt read-back but before
the commit checkpoint still has journal phase `settings_aligned`, repeats
readiness and rewrites/rereads the identical receipt idempotently; a crash at
phase `committed` repeats the committed event before clear. There is
deliberately no `readiness_broadcasted` journal phase and no additional
`receipt_written` journal phase: the receipt is durable in its separate bounded
key, while the journal retains exactly ten phases.

Broadcast success means that Chrome accepted that exact dispatch attempt. The
adapter separately normalizes only Chrome's canonical "receiving end does not
exist" outcome to `no_receiver`; no open panel is nominal and requires no
acknowledgement or recipient count. Any other API rejection is
`BROADCAST_FAILED/readiness_broadcast` or
`BROADCAST_FAILED/postcommit_broadcast`. The adapter may not classify arbitrary
errors as no-receiver by substring fallback.

## Pre-admission capability composition

Reset claims only the exact active write-bearing state. A claim repeats the
durable `resetId` as `workflowId`, the ephemeral execution `attemptId`, the
authority `workerEpoch`, the exact state-derived command ID, the stage-specific
nullable epoch, `authorityRevision`, `fenceRevision` and an ordered bounded
write plan. The scope is completed before the machine receives the event that
can leave that state.

The stage-to-write mapping is closed:

| Exact Reset state         | Ordered Dataset writes, each with a fresh one-shot capability                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journaling`              | initial exact journal put                                                                                                                                                                          |
| `fencing`                 | checkpoint journal phase `fenced`, after the dedicated `acquireResetFence` resolves                                                                                                                |
| `checkpointingQuiescence` | checkpoint journal phase `quiesced`                                                                                                                                                                |
| `closingDatabase`         | checkpoint journal phase `handles_closed`; handle close itself is not a durable Dataset write                                                                                                      |
| `deletingDatabase`        | delete `missionpulse`, then checkpoint `database_deleted` with a second capability                                                                                                                 |
| `clearingSession`         | one `chrome.storage.session.clear()`, then checkpoint `session_cleared` with a second capability                                                                                                   |
| `clearingLocal`           | one bounded selective `chrome.storage.local.remove(keys)` excluding the journal, then checkpoint `local_cleared` with a second capability                                                          |
| `reinitializing`          | DB6/metadata/empty-store transaction, generation-zero `SettingsEnvelopeV2` write/read-back, marker-3 write/read-back, then journal checkpoint `database_reinitialized`: four distinct capabilities |
| `aligningSettings`        | one capability for every exact Settings envelope/journal/outcome write in the shared recovery plan, then a distinct journal checkpoint `settings_aligned`                                          |
| `writingReceipt`          | latest-only receipt put; its strict read-back is read-only                                                                                                                                         |
| `checkpointingCommit`     | checkpoint journal phase `committed`                                                                                                                                                               |
| `clearingJournal`         | remove the exact reserved journal; strict absence read-back precedes scope completion                                                                                                              |

`preflightingCompletion`, `reacquiringFence`, `routingRestart`, `quiescing`,
`broadcastingReadiness` and `broadcastingCommitted` perform no Dataset write
and create no empty/dummy claim. Broadcast and alarm operations retain their
own strict delivery/effect proofs; they cannot be smuggled into a storage token.

The authority epoch bound to a Reset claim is exact:

- `journaling` observes the current admitted epoch when normal admission is
  open, or the authority's nullable/pending epoch while startup is closed;
- after fence ownership and through `clearingLocal`, it equals the reset
  request's `previousDataEpoch`, including literal `null`;
- from `reinitializing` through `clearingJournal`, it equals `nextDataEpoch`.

The initial journal scope is completed before `acquireResetFence` is enqueued.
Fence acquisition is the dedicated authority method, not a capability write.
Once it linearizes, it increments authority/fence revisions, revokes every old
lease/capability and admits only same-reset `reset_owned` claims. A commit ahead
of the fence settles first; a commit behind it invokes zero callback.

The `reinitializing` plan has four non-collapsible durable boundaries. In
particular, marker 3 cannot be written before the complete generation-zero
Settings V2 envelope has been strictly read back. A port-wide Reset token, one
token shared by DB/Settings/marker, or one token shared by a physical effect and
its journal checkpoint is forbidden.

`clearingJournal` consumes its one-shot capability before calling remove,
strictly proves absence, completes its scope, and only then lets the dedicated
authority epoch-install/opening sequence proceed. Neither the capability nor
the reset fence token is a success receipt. `reset:true` still requires the
workflow's complete terminal proof.

On any effect rejection, the capability stays consumed and the scope is
completed as revoked before `STEP_FAILED`. Retry uses the same durable Reset
identities but a fresh attempt, claim, write and capability IDs. On worker
restart, a fresh worker/attempt pair rebuilds the plan from the journal. Old
exact-object tokens are absent from the new bounded registries and cannot be
accepted.

Reset, startup failure fencing, command/state/attempt/epoch drift, scope
completion and authority/fence revision change revoke every outstanding token.
A worker mismatch rejects, and a new worker does not possess the old
exact-object registry. A late callback therefore performs zero write. Registry
exhaustion, allocator throw/reentrancy/collision, token clone/substitution or a
second mutex is a typed fail-closed error; none falls back to ordinary leases,
raw Chrome/IndexedDB calls or a production no-op gate.

## Quiescence contract

`quiesced` requires all of these independent facts:

| Dependency | Required proof                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------- |
| scan       | no lifecycle lease, retry timer, connector persistence or scan checkpoint able to write             |
| tracking   | no active Tx A/Tx B/Tx C; actor registry stopped; pending callers settled as reset/worker-restarted |
| migration  | no active upgrade/data/recovery transaction and retry gate cancelled                                |
| outbox     | no sender/lease/network work; Task 5b capability remains disabled                                   |

Cancellation is not proof until the underlying writer has settled. A timeout is
`QUIESCENCE_FAILED`, retains the journal and fence, and reports `reset:false`.

## Statechart

```text
idle -> preflightingCompletion
preflightingCompletion -- post-clear exact proof --> completed (recognized)
preflightingCompletion -- fresh exact proof ------> journaling
journaling
  -> fencing
  -> quiescing
  -> checkpointingQuiescence
  -> closingDatabase
  -> deletingDatabase
  -> clearingSession
  -> clearingLocal
  -> reinitializing
  -> aligningSettings
  -> broadcastingReadiness
  -> writingReceipt
  -> checkpointingCommit
  -> broadcastingCommitted
  -> clearingJournal
  -> completed

any active state -- retryable BLOCKED failure --> blocked
any active state -- other effect failure ------> failed
blocked|failed -- RETRY [live fence] -----------> recovering
blocked|failed -- RETRY [fence lost] -----------> reacquiringFence

idle -- SERVICE_WORKER_RESTARTED(valid journal) --> reacquiringFence
reacquiringFence -- BOOT_FENCE_ACQUIRED ----------> routingRestart
routingRestart -- lastError null -----------------> recovering
routingRestart -- lastError BLOCKED --------------> blocked
routingRestart -- other lastError ----------------> failed
recovering -- journal.phase ----------------------> exact idempotent resume state
```

`completed` is terminal for one reset actor. `blocked` and `failed` are
non-terminal and never imply admission reopening when a journal exists.

### States and Shell commands

| State                     | Shell effect allowed                                                                            | Success event                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `preflightingCompletion`  | read-only journal/receipt/canonical epoch/DB6-data3 authority proof; no write or fence          | `RESET_PREFLIGHT_FRESH` \| `RESET_COMPLETION_RECOGNIZED` |
| `reacquiringFence`        | acquire live boot/epoch fence; no resume effect                                                 | `BOOT_FENCE_ACQUIRED`                                    |
| `routingRestart`          | none; pure route by parsed journal classification                                               | automatic                                                |
| `journaling`              | write initial journal                                                                           | `RESET_JOURNALED`                                        |
| `fencing`                 | install admission fence and checkpoint                                                          | `FENCE_ACQUIRED`                                         |
| `quiescing`               | coordinate four dependencies                                                                    | four `*_QUIESCED` events                                 |
| `checkpointingQuiescence` | persist phase `quiesced`                                                                        | `QUIESCENCE_CHECKPOINTED`                                |
| `closingDatabase`         | close central handle registry, checkpoint                                                       | `DB_HANDLES_CLOSED`                                      |
| `deletingDatabase`        | delete DB, checkpoint                                                                           | `DATABASE_DELETED`                                       |
| `clearingSession`         | clear session, checkpoint                                                                       | `SESSION_CLEARED`                                        |
| `clearingLocal`           | remove every non-journal local key, checkpoint                                                  | `LOCAL_CLEARED`                                          |
| `reinitializing`          | create/verify exact DB6/data3, epoch authority and initial generation-zero envelope; checkpoint | `DATABASE_REINITIALIZED`                                 |
| `aligningSettings`        | run reset-owned Settings recovery; checkpoint proof as `settings_aligned`                       | `SETTINGS_ALIGNED`                                       |
| `broadcastingReadiness`   | emit exact non-success `ready_to_commit` event                                                  | `RESET_READY_BROADCASTED`                                |
| `writingReceipt`          | put and strictly read back exact latest-only receipt under fence/system quota gate              | `RESET_RECEIPT_WRITTEN`                                  |
| `checkpointingCommit`     | persist phase `committed` after readiness plus exact receipt read-back                          | `RESET_COMMIT_CHECKPOINTED`                              |
| `broadcastingCommitted`   | emit exact replayable `committed` event while journal remains                                   | `RESET_COMMITTED_BROADCASTED`                            |
| `clearingJournal`         | remove reserved journal and open epoch authority                                                | `JOURNAL_CLEARED`                                        |

Every success event is emitted only after its effect and required checkpoint
complete. Async events include the current reset identity where they cross an
external boundary; stale identity/epoch events are ignored.

### Recovery routing

| Last durable phase           | Resume state                                  | Why repeat is safe                                    |
| ---------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| no journal / preflight error | `preflightingCompletion` after explicit retry | proof is reread; no destructive effect was admitted   |
| `journaled`                  | `fencing`                                     | installing the same reset fence is idempotent         |
| `fenced`                     | `quiescing`                                   | cancel/stop/await operations are idempotent           |
| `quiesced`                   | `closingDatabase`                             | closing an already-closed handle is a no-op           |
| `handles_closed`             | `deletingDatabase`                            | deleting a missing DB succeeds                        |
| `database_deleted`           | `clearingSession`                             | clearing session repeatedly succeeds                  |
| `session_cleared`            | `clearingLocal`                               | journal is excluded; removing missing keys succeeds   |
| `local_cleared`              | `reinitializing`                              | exact matching fresh DB/epoch is verified as no-op    |
| `database_reinitialized`     | `aligningSettings`                            | shared recovery resumes its durable Settings journal  |
| `settings_aligned`           | `broadcastingReadiness`                       | readiness and receipt write/read may repeat safely    |
| `committed`                  | `broadcastingCommitted`                       | exact committed event may repeat before journal clear |

On worker restart, every strict phase waits in `reacquiringFence`; neither the
phase nor `SERVICE_WORKER_RESTARTED` proves a live JavaScript fence.
`BOOT_FENCE_ACQUIRED` from another reset ID is ignored. A fence failure enters
`failed` and preserves the journal and outer boot deny-gate. Every cold start
still attempts this safety-fence acquisition automatically; that attempt may
only restore the live admission barrier and route back to `failed`. It is not
retry authority and cannot resume a workflow effect. Only an explicit
same-reset `RETRY`, after the fence is live, authorizes recovery of the durable
workflow phase.

The persisted failure carries `origin:'boot_fence_reacquisition'`; this is the
only reason `FENCE_FAILED/fence` may coexist with a phase whose next durable
step is not `fence`. Its second restart still routes through
`reacquiringFence -> routingRestart -> failed`, never directly to `recovering`.

Only a journal with `lastError:null` represents an interrupted/crashed attempt
and automatically routes from the acquired boot fence to `recovering`.
`lastError.code === 'BLOCKED'` routes to `blocked`; every other retryable or
non-retryable error routes to `failed`. No effect restarts from either state
until a same-reset `RETRY`; non-retryable errors have no retry transition.

A restart after successful journal clear has no journal to restore and returns
to `idle`. Replaying the original request then runs the same read-only preflight;
the canonical next epoch plus exact latest-only receipt and DB6/data3 authority
recognize completion even if legitimate E2 writes followed the reset. Journal
absence alone never resumes destruction and never proves success.

## Failure and retry contract

```ts
type LocalDataResetErrorCode =
  | 'PREFLIGHT_FAILED'
  | 'BLOCKED'
  | 'JOURNAL_CORRUPT'
  | 'JOURNAL_FAILED'
  | 'FENCE_FAILED'
  | 'QUIESCENCE_FAILED'
  | 'HANDLE_CLOSE_FAILED'
  | 'DATABASE_FAILED'
  | 'SESSION_CLEAR_FAILED'
  | 'LOCAL_CLEAR_FAILED'
  | 'REINITIALIZE_FAILED'
  | 'SETTINGS_ALIGNMENT_FAILED'
  | 'BROADCAST_FAILED'
  | 'RECEIPT_FAILED'
  | 'PROTOCOL_ERROR';
```

The accepted error matrix is exact:

| Code                        | Step                                      | Durable phase            | Origin                     | `retryable` |
| --------------------------- | ----------------------------------------- | ------------------------ | -------------------------- | ----------- |
| `PREFLIGHT_FAILED`          | `preflight`                               | none                     | `workflow_step`            | `true`      |
| `BLOCKED`                   | `handles` \| `database` \| `reinitialize` | unchanged                | `workflow_step`            | `true`      |
| `JOURNAL_CORRUPT`           | `journal`                                 | preserved bytes          | `workflow_step`            | `false`     |
| `JOURNAL_FAILED`            | `journal` from any checkpoint             | unchanged                | `workflow_step`            | `true`      |
| `FENCE_FAILED`              | `fence` in normal fencing                 | unchanged                | `workflow_step`            | `true`      |
| `FENCE_FAILED`              | `fence` for any restored phase            | unchanged                | `boot_fence_reacquisition` | `true`      |
| `QUIESCENCE_FAILED`         | `quiescence`                              | `fenced`                 | `workflow_step`            | `true`      |
| `HANDLE_CLOSE_FAILED`       | `handles`                                 | `quiesced`               | `workflow_step`            | `true`      |
| `DATABASE_FAILED`           | `database`                                | `handles_closed`         | `workflow_step`            | `true`      |
| `SESSION_CLEAR_FAILED`      | `session`                                 | `database_deleted`       | `workflow_step`            | `true`      |
| `LOCAL_CLEAR_FAILED`        | `local`                                   | `session_cleared`        | `workflow_step`            | `true`      |
| `REINITIALIZE_FAILED`       | `reinitialize`                            | `local_cleared`          | `workflow_step`            | `true`      |
| `SETTINGS_ALIGNMENT_FAILED` | `settings_recovery`                       | `database_reinitialized` | `workflow_step`            | `true`      |
| `BROADCAST_FAILED`          | `readiness_broadcast`                     | `settings_aligned`       | `workflow_step`            | `true`      |
| `RECEIPT_FAILED`            | `receipt`                                 | `settings_aligned`       | `workflow_step`            | `true`      |
| `BROADCAST_FAILED`          | `postcommit_broadcast`                    | `committed`              | `workflow_step`            | `true`      |
| `PROTOCOL_ERROR`            | current expected non-journal step         | unchanged                | `workflow_step`            | `false`     |

The machine records both `expectedStep` and `expectedErrorOrigin` on entry to
each active state. A `STEP_FAILED` with the wrong reset ID, code/step/origin
pair, retryability, extra error key, empty/oversized message or non-current
contract is ignored and cannot drive a transition. `JOURNAL_FAILED` is the sole
cross-cutting workflow-step error because every checkpointing state writes the
journal; the machine records that capability separately, so `JOURNAL_FAILED`
is rejected in non-checkpointing states such as `quiescing` and either broadcast.
Boot-fence origin is accepted only while `reacquiringFence` expects it.

`PREFLIGHT_FAILED` and `PROTOCOL_ERROR/preflight` are context-only because no
journal exists yet; neither may be encoded into a ten-phase journal. They retain
the request identities in actor context for diagnostic projection and, only for
the retryable physical failure, explicit retry.

`RECEIPT_FAILED/receipt` and `PROTOCOL_ERROR/receipt` are the only additional
errors consistent with durable phase `settings_aligned`: readiness has no
durable phase, so retry/restart repeats readiness before the receipt operation.
The former covers bounded-quota/storage/read-back failure and is retryable; an
exact-key or correlation conflict is non-retryable.

- `deleteDatabase.onblocked`, an unclosed handle or a reset-owned open blocked by
  another context uses `BLOCKED` and state `blocked`.
- Quota, permission/API, transaction, validation and journal checkpoint errors
  use the exact step-specific code and state `failed`.
- `RETRY` is explicit, increments diagnostics and resumes from the last durable
  phase. There is no automatic destructive retry loop.
- A clear-journal failure keeps phase `committed`; explicit retry first
  rebroadcasts the exact committed payload and then retries clear.
- A receipt failure keeps phase `settings_aligned`; explicit retry repeats
  readiness, then put/read-back. A matching receipt is an idempotent no-op,
  while a different existing receipt fails closed.
- A worker restart with any non-null `lastError` reacquires the live fence and
  then waits in `blocked`/`failed`; restart itself is never retry authority.
- While a valid journal exists, both failure states preserve the fence. They may
  return `reset:false`, exact phase, code and `retryable`, never `reset:true`.
- A physical preflight read failure is retryable
  `PREFLIGHT_FAILED/preflight`; it leaves normal admission untouched and an
  explicit same-reset retry rereads preflight with the same intent identity.
- A syntactically valid proof that conflicts with the requested epochs or
  terminal physical invariants is non-retryable
  `PROTOCOL_ERROR/preflight`; malformed/mismatched proof events are ignored and
  never default to fresh admission.
- Invalid/mismatched fresh epoch or non-empty fresh tracking stores are
  step-correlated `PROTOCOL_ERROR`, non-repairing and fail-closed. An invalid
  journal is the distinct `JOURNAL_CORRUPT/journal` path; its bytes are retained.

## Multi-panel and old-epoch behavior

When the fence is acquired, worker-owned pending calls settle without success.
The two epoch broadcasts carry the nullable previous epoch, new epoch and one
stable bootstrap request ID. Every open panel must:

1. discard pending effect ownership, Undo tokens and staged loads for the old
   epoch;
2. disable tracking/scan/settings mutation while reset status is pending;
3. on readiness, retain the complete pending payload with `command:null` and
   issue no Load;
4. on the exact committed payload, issue one correlated joining Load;
5. accept data only when the worker reports no reset journal, exact new epoch,
   settled Settings envelope and matching alarm proof.

Every late old-epoch request, response, actor event or broadcast is rejected or
ignored. It cannot reopen a tombstone, recreate a tracking row, restore old UI
state or produce a success toast. Equal-revision rules never cross epochs.

This rule is global. Every post-cutover mutative bridge message carries the
bootstrap `dataEpoch`; v1 tracking/settings/profile/scan writes that cannot carry
it fail closed. Internal operations carry a revocable lease bound to epoch and
operation ID. In particular:

- an old settings save with base revision/generation 0 cannot match fresh
  `SettingsEnvelopeV2(nextEpoch, revision 0, generation >= 0,
journal:null, outcomes:[])` without exact epoch and generation;
- an old scan terminal or checkpoint cannot recreate session state or persist
  missions after reset;
- old profile/import callbacks cannot repopulate the fresh profile store;
- old semantic/TJM/cache/seen/favorite callbacks cannot recreate cleared local
  keys;
- no coordinator may obtain `nextDataEpoch` for an operation originally admitted
  under the previous/unknown epoch.

The new epoch authority opens normal leases only after journal removal; the
correlated joining Load/bootstrap can then complete against that authority.
`previousDataEpoch:null` still revokes all leases globally; it never weakens the
comparison to “unknown means allowed”.

## Invariants

1. Every valid new request runs read-only preflight before journal creation.
2. Fresh admission requires `canonicalDataEpoch === previousDataEpoch` and
   `nextDataEpoch !== canonicalDataEpoch`; no other proof enters journaling.
3. Post-clear recognition requires journal absence,
   `canonicalDataEpoch === nextDataEpoch`, a different previous epoch, the exact
   original-request terminal receipt and current DB6/data3 authority proof.
4. Recognition writes no journal, acquires no fence and repeats no destructive
   effect; `completionDisposition` distinguishes it from normal execution.
5. The latest-only receipt is written/read under the live fence after exact
   Settings/alarm proof and readiness, but before the journal's committed
   checkpoint; journal absence plus matching receipt therefore proves the prior
   result even after later E2 writes.
6. Destruction cannot start before the durable journal exists.
7. One reset ID owns the global epoch-admission fence and one next epoch.
8. No new scan, tracking, migration, outbox or settings write begins while the
   fence is held.
9. `quiesced` means all four dependency proofs, not merely cancellation requests.
10. Every known DB handle closes before deletion; no non-reset opener races it.
11. A blocked delete preserves the old phase, journal and fence.
12. Session clears before local; local clearing preserves only the journal and
    removes the previous latest-only receipt.
13. Fresh DB metadata and initial shared `SettingsEnvelopeV2` use the journal's
    next epoch; tracking stores are empty, Settings revision/generation are both
    0, `journal` is null and `outcomes` is empty.
14. `APP_DATA_VERSION = 3` and the fresh epoch authority are persisted/verified
    before Settings alignment, while normal admission remains closed.
15. Phase `settings_aligned` implies exact defaults, settled shared envelope and
    exact auto-scan alarm proof for the next epoch; no panel is required.
16. Readiness is pre-commit invalidation only and emits no Load.
17. Phase `committed` implies Settings alignment, accepted exact readiness and
    strict terminal-receipt read-back under the bounded system quota reserve; no
    committed event is emitted before this checkpoint.
18. On the executing path, the journal remains until the exact committed event
    is accepted; its removal is that path's final durable prerequisite to
    `completed`, while the bounded receipt remains for replay.
19. A correlated Load seeing the same `committed` journal joins finalization and
    never returns `SETTINGS_RESET_IN_PROGRESS` for that journal.
20. `reset:true` implies database deleted, session/local cleared, DB6/data3
    reinitialized, exact Settings/alarm proof, readiness, terminal receipt,
    committed checkpoint, committed broadcast and journal removal, either
    executed now or proven by the strict post-clear recognition preflight.
21. Any partial or blocked outcome implies `reset:false` and is retryable only as
    declared by its error.
22. Retry and worker restart retain all IDs/epochs and never resurrect old data.
23. No LLM decides admission, phase, deletion, retry or success.
24. Every mutative message carries the bootstrap epoch; every internal writer
    revalidates its revocable lease inside the commit gate.
25. Reset revokes every old lease before quiescence and does not open new-epoch
    admission until journal removal.
26. A restored durable phase always has `fenceAcquired:false` until correlated
    `BOOT_FENCE_ACQUIRED`.
27. Every Reset Dataset write in the closed mapping has one fresh capability;
    no capability covers a whole state, port or multi-write effect.
28. Reset claims, capability issuance/commit/completion, ordinary commits,
    reset fence and epoch installation share the authority's one FIFO.
29. Each capability is consumed before callback invocation/await and can never
    be replayed after rejection, completion or restart.
30. Reset cleanup capabilities bind exact nullable `previousDataEpoch`; rebuild
    and terminal capabilities bind exact `nextDataEpoch`.
31. Reinitialization uses four ordered capabilities: DB6 transaction, complete
    Settings V2 generation-zero write/read-back, marker-3 write/read-back and
    `database_reinitialized` checkpoint.
32. A state-success or `STEP_FAILED` event is not sent while that state's scope
    remains active; completion/révocation precedes the event.
33. Reset/failure fence and command/state/attempt/epoch/revision drift make
    every losing late callback execute zero durable effect; a new worker does
    not possess the old exact-object registry.
34. Capability registries are bounded without eviction, and no exhaustion,
    allocator or validation error enables a lease/raw/no-op fallback.

## Forbidden transitions

- `idle -> journaling` without exact fresh preflight.
- treating a malformed/conflicting preflight, a different canonical epoch,
  missing/mismatched receipt, divergent DB6/data3 authority or extra key as
  either fresh admission or recognized completion; current E2 data is not
  evidence against a matching prior receipt.
- recognized completion performing journal, fence, close, delete or clear.
- `idle -> deletingDatabase` or any destructive state without journaling/fence.
- fence acquisition -> DB close before all quiescence proofs.
- delete success inferred from `onblocked`, timeout, request dispatch or absence
  of an immediate error.
- clearing the journal via bulk `chrome.storage.local.clear()`.
- generating a new next epoch during retry/recovery.
- reinitialization no-op when metadata epoch differs or tracking stores are not
  empty.
- accepting `DATABASE_REINITIALIZED` without exact initial Settings generation 0.
- readiness before reset-owned Settings/alarm proof or readiness starting Load.
- terminal receipt write before exact readiness acceptance, outside the global
  gate/system quota reserve, or without strict read-back.
- checkpointing `committed` before matching terminal receipt read-back.
- committed broadcast before durable phase `committed`.
- journal clear before exact committed broadcast acceptance.
- deleting the latest receipt after success instead of retaining it until the
  next reset's selective local clear.
- returning `SETTINGS_RESET_IN_PROGRESS` to the same-reset correlated Load in
  phase `committed` instead of joining finalization.
- reopening admission from `blocked` or `failed` while the journal exists.
- routing a restored phase or emitting a resume effect before
  `BOOT_FENCE_ACQUIRED` for the same reset ID.
- automatically retrying a persisted non-null `lastError` on worker wakeup.
- persisting boot reacquisition failure as a phase-step error without exact
  `origin:'boot_fence_reacquisition'`, or accepting that origin for any error
  other than retryable `FENCE_FAILED/fence`.
- success response or `reset:true` on the executing path before
  `JOURNAL_CLEARED`, or on the recognition path without exact journal-absent
  receipt plus canonical DB6/data3 authority proof.
- either broadcast acceptance without strict stage/version/resetId/previous+next
  epoch/bootstrap-request echo,
  or treating a true API rejection as no-receiver.
- old-epoch event changing new-epoch state.
- refreshing an old operation with a new epoch/lease instead of rejecting it.
- reset coordinator calling a raw tracking writer or remote dashboard path.
- one Reset capability reused for two writes, a port-wide Reset capability, or
  a physical-effect capability reused for its journal checkpoint.
- marker 3 before strict generation-zero Settings V2 read-back, or any of the
  four reinitialization boundaries sharing a token.
- ordinary lease, raw Chrome/IDB writer, second mutex or production no-op gate
  used because a pre-admission capability is missing/rejected.
- state/command transition published before its active scope is completed or
  revoked.
- malformed or wrong-step `STEP_FAILED` changing state.
- redefining or weakening `LocalDataResetEpochEventV1` in Reset, Settings or an
  adapter instead of using the neutral shared parser; Settings-specific fence
  proof must not be inserted into the neutral payload.

## Required RED verification before implementation

- exact nominal state sequence and every forbidden event/state pair;
- malformed request is ignored without a journal or fence;
- every valid request enters `preflightingCompletion`; an exact fresh proof is
  the only route to `journaling`, while an exact post-clear proof reaches
  recognized completion with no journal/fence/destructive command;
- post-clear recognition rejects a foreign canonical epoch, wrong DB/data/schema
  authority, missing/mismatched/latest receipt, wrong requestedAt/ID/epoch/
  phase, missing/extra key and non-canonical/colliding UUID; it still recognizes
  after valid same-epoch mission/settings/alarm writes;
- fresh preflight rejects `canonicalDataEpoch !== previousDataEpoch` and
  `nextDataEpoch === canonicalDataEpoch`; physical read failure is retryable at
  `PREFLIGHT_FAILED/preflight`, while a protocol conflict is non-retryable and
  neither path writes a journal;
- shared wire differential matrix accepts exact `ready_to_commit` and
  `committed`, including nullable previous epoch, and identically rejects
  uppercase UUIDs, reset/next/bootstrap/previous collisions, wrong stage,
  missing key and extra key from both Reset and Settings consumers;
- adversarial wire/proof objects with a custom/inherited prototype, accessor,
  Symbol, non-enumerable extra/required key or throwing Proxy fail closed; a
  rejected accessor is never invoked, while frozen and null-prototype exact
  data records remain valid;
- journal write failure performs no destruction;
- every accepted code/step/retryability pair transitions as specified and every
  malformed/wrong-state error is ignored;
- scan/tracking/migration/outbox quiescence must all be proven;
- blocked DB deletion retains journal, fence and `reset:false`, then explicit
  retry resumes at deletion;
- crash after every durable phase resumes at the table's exact state;
- every restored phase remains in `reacquiringFence` until matching
  `BOOT_FENCE_ACQUIRED`; another reset ID and fence failure produce no resume
  effect;
- for each of the ten phases, boot-fence failure persists with its explicit
  origin, reparses strictly, survives a second restart as `failed`, ignores a
  foreign reset ID and permits only automatic safety-fence reacquisition before
  same-reset `RETRY`; no durable workflow effect resumes before that retry;
- restart with `lastError:null` resumes after the boot fence; restart with every
  retryable family waits in `failed`, `BLOCKED` waits in `blocked`, and no effect
  restarts before correlated `RETRY`; non-retryable has no retry transition;
- restart with non-retryable journal error remains fenced/failed, while a
  phase/error mismatch is classified as a corrupt journal;
- crash after local clear but before reinitialize preserves journal/epoch;
- reinitialize retry accepts exact matching empty DB and rejects wrong epoch or
  non-empty tracking stores;
- legacy, missing/new-install and reset settings all produce the exact shared
  `SettingsEnvelopeV2`; retry is a no-op only for its canonical epoch, while a
  malformed journal, malformed outcome ledger or wrong epoch fails closed;
- readiness and committed UUID/null-previous echoes are accepted only with
  exact stage/version/reset/epochs/bootstrap ID; wrong/extra fields cannot
  checkpoint commit or clear the journal;
- delivered and normalized no-receiver outcomes advance each broadcast; true
  API failure remains failed and retryable at its distinct step;
- commit checkpoint is ignored before exact receipt put/read-back; receipt
  quota/API failure is retryable `RECEIPT_FAILED/receipt`, a different existing
  receipt is non-retryable protocol failure, and matching rewrite is idempotent;
- crash after receipt but before checkpoint restores phase `settings_aligned`,
  repeats readiness and the exact receipt operation, then checkpoints once;
- journal removal failure remains phase `committed`; retry rebroadcasts the
  exact committed payload before clear;
- only completed returns `reset:true` and the next epoch;
- two panels discard old effects and converge through fresh bridge bootstrap;
- late old-epoch messages and stale reset events perform zero writes;
- old tracking v1/v2, settings base-revision-0 save, scan terminal/checkpoint,
  profile callback and cache writer all perform zero post-reset write;
- lease revocation between calculation and commit fails final in-gate
  revalidation and performs zero durable write;
- ordinary lease before admission is rejected, while an exact same-reset claim
  and exact next write capability are admitted only in the modeled state;
- substitute claim/reset/stage/command/attempt/worker/nullable epoch,
  authority/fence revision, write ID or capability ID independently and assert
  zero callback;
- every two-write Reset state receives two distinct one-shot capabilities;
  double consume, cross-write/cross-state reuse, completion-before-callback and
  old-worker replay all perform zero write;
- execute commit/Reset and commit/failure-fence in both FIFO orders; only the
  operation ahead of the fence may enter its durable callback;
- allocator reentrance into same write, another write, completion, Reset and
  failure fence; allocator throw/invalid UUID/collision; exact bounded registry
  exhaustion with no eviction or fallback;
- crash after DB6 transaction, generation-zero Settings read-back, marker-3
  read-back and reinitialization checkpoint; recover with fresh capability IDs
  and no early admission;
- exhaustive phase/error contracts accept cross-cutting `JOURNAL_FAILED`, accept
  exact `RECEIPT_FAILED/receipt` and `PROTOCOL_ERROR/receipt` only at
  `settings_aligned`, otherwise accept `PROTOCOL_ERROR` only at the current
  expected non-journal step, and reject `PROTOCOL_ERROR/journal`;
- pure contract parsers/matrix can be tested without instantiating XState, while
  the machine contains orchestration only;
- static architecture checks prove the machine has no I/O and all writers honor
  the reset admission fence.

### Cross-model traces R1-R5

- **R1 — no panel, alarm absent:** initialize exact generation 0 with defaults
  (`autoScan=true`, period 30); prove neither readiness nor commit is accepted
  before reset-owned recovery installs/executes/clears the system Settings
  journal and checkpoints `settings_aligned`; accept both broadcasts as
  `no_receiver`; write/read the exact receipt before the committed checkpoint;
  clear reset journal; assert exact alarm and receipt precede `committed`,
  admission and `reset:true`.
- **R2 — open panel at readiness:** `ready_to_commit(E1,E2)` yields
  `resetPending`, `command:null`, zero Load/mutation; late E1 Load/Save results
  are ignored and no synthetic `SETTINGS_RESET_IN_PROGRESS` is created.
- **R3 — committed while journal exists:** write/read exact receipt, checkpoint
  `committed`, accept exact event, emit one correlated Load, join finalizer,
  clear journal/open E2, then return settled E2 snapshot; duplicate committed
  emits no second command.
- **R4 — crash/retry matrix:** crash after system journal install, alarm effect,
  alarm proof, readiness, receipt write/read, commit checkpoint, committed
  broadcast, and journal clear-before-response. A crash after receipt but before
  checkpoint resumes from `settings_aligned` and idempotently repeats readiness
  plus receipt. Every journal-present route keeps all IDs, reacquires the live
  fence, resumes from the durable phase and never opens admission or succeeds
  before proof. For clear-before-response, allow legitimate E2 mission,
  Settings and alarm writes, then replay the same original request: preflight
  sees journal absent, canonical current epoch equal to that request's next
  epoch, exact latest-only receipt and current DB6/data3 authority. It completes
  as `recognized` with zero second journal, fence, deletion, clearing,
  reinitialization or broadcast.
- **R5 — exact failures:** alarm failure is retryable
  `SETTINGS_ALIGNMENT_FAILED/settings_recovery` at
  `database_reinitialized`; malformed matching-ID proof is non-retryable
  `PROTOCOL_ERROR/settings_recovery`; broadcast failures retain respectively
  `settings_aligned` and `committed`; receipt storage/read-back failure is
  retryable `RECEIPT_FAILED/receipt` at `settings_aligned`, a receipt conflict is
  non-retryable `PROTOCOL_ERROR/receipt`; clear failure is
  `JOURNAL_FAILED/journal` at `committed`; wrong/extra payload changes neither
  reset phase nor Settings actor.

## Out of scope

- selective export/restore of reset data;
- remote/cross-device erasure;
- automatic repair of a corrupt reset journal;
- remote connected-dashboard deletion;
- UI wording and visual design beyond truthful pending/blocked/failure/success
  projection.
- implementation of the pre-admission capability contracts, authority methods
  or Shell adapter before their independent model review.
