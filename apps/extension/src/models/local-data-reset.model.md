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
- no residual `missionpulse.backgroundSchedulingHandoff.v1` after its exact
  adoption, cleanup read-back and reset-journal checkpoint;
- no tracking envelopes, mutation ledgers or outbox rows;
- every pre-reset actor, request, response and broadcast permanently unable to
  mutate the new dataset.

Reset success is durable fact, not UI optimism. On the executing path,
`reset:true` is forbidden until the journal has been removed **and** exact
next-epoch admission has been installed/opened after every prerequisite
succeeds. A replay after clear may return success only after strict post-clear
recognition and the same idempotent admission-open proof below.

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
twelve-phase journal and before any fence, clear, close, delete or write. Shell
performs one read-only, exact-key proof under the serialized dataset authority
through the registered
`dataset-reset/preflight-authority-read/v1` leaf token. The closed adapter is the
only pre-version opener: it inventories first, never opens an absent DB, opens a
present DB without a target version, uses only `readonly` transactions, aborts
`onupgradeneeded`, and closes/unregisters its temporary handle in `finally`
before settling. It performs zero schema creation, upgrade, migration, repair or
durable mutation.

The reset actor accepts exactly one of two outcomes:

- `fresh`: reserved reset journal and handoff sidecar both absent, canonical current epoch exactly
  `previousDataEpoch` (including `null`), and `nextDataEpoch` different from the
  current epoch. Only this result may enter `journaling`.
- `already_completed`: reserved reset journal and handoff sidecar both absent, canonical current epoch
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
journal write. It sets `completionDisposition:'recognized'` and enters
`openingEpochAdmission`; it does not complete until exact next-epoch admission
is proven open. The receipt adds one bounded
Chrome-storage system key but no DB store, `tracking_meta` field, DB-version or
data-version change.

## Durable journal

Fresh preflight first reserves A as `reset_pending`, which closes **new lease
issuance only** and preserves FIFO order for commits already ahead of it. Under
that exact reservation, and before live fence ownership or any destructive
effect, Shell writes this strict record to reserved key
`missionpulse.localDataReset.v1` in `chrome.storage.local`:

```ts
interface BackgroundSchedulingHandoffCapabilityManifestEntryV1 {
  kind: 'sidecar_initialize' | 'slot_materialize' | 'sidecar_cleanup';
  controlAttemptIndex: 0 | 1 | 2 | 3 | null;
  transitionIndex: number;
  casAttempt: 0 | 1 | 2;
  commandId: string;
  resultId: string;
  capabilityId: string;
  bundleDigest: string;
}

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
  | 'committed'
  | 'handoff_adopted'
  | 'handoff_cleared';

interface LocalDataResetJournalV1 {
  schemaVersion: 1;
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  phase: LocalDataResetPhase;
  backgroundSchedulingHandoff: {
    schemaVersion: 1;
    storageKey: 'missionpulse.backgroundSchedulingHandoff.v1';
    sidecarId: string;
    handoffId: string;
    resetId: string;
    checkpointRevision: number;
    slotCount: number;
    payloadDigest: string;
    sourceControlLaneId: string;
    sourceControlLaneAttemptIndex: 0 | 1 | 2 | 3;
    sourceWorkerEpoch: string;
    capabilityManifestDigest: string;
    cleanupRecovery: {
      version: 1;
      manifestDigest: string;
      bundles: readonly [
        BackgroundSchedulingHandoffCapabilityManifestEntryV1,
        BackgroundSchedulingHandoffCapabilityManifestEntryV1,
        BackgroundSchedulingHandoffCapabilityManifestEntryV1,
      ];
    };
    sidecarEncodedBytes: number;
  } | null;
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

`backgroundSchedulingHandoff` est strictement null aux phases
`journaled|fenced`, puis non-null de `quiesced` à `handoff_cleared`. Le payload
ne vit jamais dans le journal : sa référence id/digest pointe vers le sidecar
local exact, fermé avant checkpoint, borné à 131 slots et 1 048 576 octets UTF-8
pour sa forme canonique complète. Le contrat sidecar est
défini sans import circulaire dans `local-data-reset.contract.ts` et le modèle
scheduling produit exactement cette forme.
La référence conserve aussi la provenance lane/attempt/worker, le digest du manifest
canonique 1 584+3 et les trois entrées cleanup exactes nécessaires à une reprise
après suppression du sidecar. Ces bundles sont une preuve durable, pas des
tokens objets transférables entre workers.

Each durable phase-changing effect is followed by a journal checkpoint before
the machine advances past that phase. Readiness and terminal-receipt read-back
are ordered prerequisites of the single `committed` checkpoint and repeat
together if that checkpoint is not durable. If an effect succeeds and its
checkpoint write fails, the previous phase remains authoritative; retry repeats
the effect idempotently. The journal is never put in `chrome.storage.session`
because that store is deliberately cleared mid-workflow.

The journal and handoff-sidecar keys are the only two keys excluded from
selective local clearing. The sidecar is removed with strict absence read-back
only after adoption and checkpoint `handoff_cleared`; the journal is removed
next, before the separate admission-open authority boundary. A
corrupt journal is fail-closed: reset and normal
startup stay fenced, the bytes are preserved, and diagnostics require explicit
support/recovery. Code must not guess a phase or generate another epoch.
Journal and nested-error objects reject unknown or missing keys. Error messages
must contain 1..500 UTF-16 code units, which bounds persisted diagnostics.

### Background scheduling handoff sidecar

The only durable handoff payload key is
`missionpulse.backgroundSchedulingHandoff.v1` in `chrome.storage.local`. Its
outer record is exact: schema/key/payload-schema literals, canonical
sidecar/handoff/reset/worker identities, previous epoch, safe checkpoint
revision, a 131-bit bitmap and matching popcount, three lowercase SHA-256
digests, exact canonical payload byte count and one closed JSON payload object.
That payload contains the preallocated `sidecarId`, reset/handoff/worker/epoch,
the control lane and Reset attempt, the canonical 1,587-entry capability manifest
and its digest, the irreversible mailbox-close sequence and policy, a sorted
0..64 connector order, an exact dense array of 131 closed alarm slots and the
strict writer plus journal-at-quiescence proof. Every present slot has a unique mailbox sequence
strictly below the close sequence; a late terminal is at or above it. Unknown
keys, non-JSON values, sparse arrays,
accessors, custom prototypes, oversized bytes, digest drift, bitmap drift,
cross-swapped nested content or a reference that does not match every sidecar
identity/bound fails closed. The parser reconstructs canonical key order and
recalculates SHA-256 for payload, writer transfer and journal proof; it derives
bitmap/popcount from slots instead of trusting outer fields.

Scheduling first closes the handoff at one total mailbox marker. Callbacks
ordered before it are coalesced into the immutable 131-slot target; callbacks
after it receive an exact `RESET_HANDOFF_CLOSED` terminal with zero ID/write and
their next schedule belongs to E2 reconciliation. Scheduling initializes the
sidecar with the complete target, its digest, `materializationCursor:0` and the
exact next one-shot
`casCursor { controlAttemptIndex, transitionIndex, casAttempt }`, then advances
only that durable target prefix. A definitive failure persists and rereads the
next CAS cursor before retry; an unknown result is resolved by the current
bundle IDs and never causes reuse or skip. Its dedicated
Reset control lane preallocates a fresh `sidecarId`, propagated unchanged to the
lane, all CAS/cleanup bundles, capabilities, sidecar and reference, plus three fresh
capability bundles for initialization and every one of the 131 slots across all
four control attempts: 1,584 CAS bundles total, plus three cleanup bundles.
Mailbox closure ends external
allocation and target mutation, but the internal checkpoint executor may still
consume only those already-reserved entries needed to materialize the immutable
target before exposing the reference. It cannot allocate, substitute the
lane/attempt/manifest or write a non-target slot. Once a bit is present, a duplicate is
coalesced to that canonical slot with zero sidecar write and zero ID consumed.
Initialization has revision 0; each present slot materialized from the frozen target
increments exactly once. Every accepted checkpoint therefore satisfies
`checkpointRevision === popcount(slotBitmap) === slotCount`, including the
0-slot, 1-slot and 131-slot cases.
If capacity, CAS or read-back fails before session clear, Reset remains before
clear and erases nothing. The handoff never reopens and no post-checkpoint slot
mutation is admissible, so the Reset reference cannot become stale. After
session clear, the sidecar is durable and stays preserved through restart,
local clear and adoption.

`payloadEncodedBytes` is the exact UTF-8 length of canonical payload JSON and is
bounded to 786 432. `sidecarEncodedBytes` lives in the Reset reference and is the
exact UTF-8 length of the complete canonical sidecar object; it is recomputed
and bounded to 1 048 576 before any proof is accepted. These names are not aliases
and neither limit can substitute for the other.

The reset journal references the sidecar only by the exact
`BackgroundSchedulingHandoffReferenceV1`; it never embeds or owns the payload.
The checkpoint event additionally carries frozen lane/attempt/worker,
sidecar/handoff, the full ordered 1,584+3 manifest and frozen-target digest. Its parser
recalculates every bundle digest and both aggregate digests, then rejects a
cross-lane/cross-attempt/cross-worker swap against the expectation retained from
the exact fence authority, even when the foreign proof is internally coherent.
`SESSION_CLEARED` proves the same sidecar after `chrome.storage.session.clear()`.
`LOCAL_CLEARED` proves the closed preserved-key tuple
`[missionpulse.localDataReset.v1,
missionpulse.backgroundSchedulingHandoff.v1]` and rereads both authorities.
After committed broadcast, the scheduler restores/adopts the exact sidecar and
checkpoints `handoff_adopted`; adoption does not delete it. A distinct cleanup
capability removes only that key, proves strict absence, checkpoints
`handoff_cleared`, and only then permits reset-journal removal.
If the worker restarts in `handoff_adopted` or `handoff_cleared`, its current
worker epoch must differ from the durable source worker epoch or rehydration is
rejected before fence acquisition. In `handoff_adopted`, the authority returns one exact
command/result-correlated replacement-lane receipt. It carries three fresh
cleanup token objects bound to that receipt, lane and current worker, using the
same sidecar/handoff/manifest IDs and digests; every old-worker token object and
every DTO copy are invalid. Cleanup attempt 0, 1 or 2 may return `removed` or
`already_absent`. If the durable phase is already `handoff_cleared`, recovery
does not issue tokens or repeat deletion and proceeds directly to journal clear.

The `reset_pending` reservation carries a total journal status:
`absent_proven | outcome_unknown | durable_proven`. Initial put/read-back may
acquire the live fence only after exact same-reset read-back changes it to
`durable_proven`. Exact absence after a failed put remains `absent_proven` and A
may retry with fresh execution IDs. If neither durability nor absence can be
read back, A enters `resolvingInitialJournal`; only the same-A registered
resolver may reread, idempotently put-if-absent and prove one outcome. Reset B
remains rejected. Timeout, thrown error or worker death never means absent: a
new worker either finds a strict journal and rehydrates A, or proves strict
absence and requires fresh preflight.

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
`reacquiringFence`. The Shell first calls
`rehydrateResetPreAdmission(strictJournalIdentity,
exactRehydrationAuthorityReadLeafToken)` under the DatasetEpoch FIFO. That
operation rereads the journal and phase-compatible physical authority, rejects
a third epoch/foreign receipt/Reset B, installs `reset_pending`, and returns a
new exact-object reservation bound to the current `workerEpoch`. It never clones
the dead worker's reservation. Shell then calls `acquireResetFence` with that
replacement and the same journal proof; this advances revisions, revokes old
leases/capabilities and installs `reset_owned`. Shell may emit correlated
`BOOT_FENCE_ACQUIRED { resetId, proof }` only with the exact registered proof
returned by both operations and after handlers
and openers of this worker are fenced. Only then may the machine route by durable
phase or expose `blocked`/`failed`. Therefore no destructive resume effect can
start between crash recovery and live-fence proof.

The rehydration phase matrix accepts only the exact physical effect that may be
one boundary ahead of its durable checkpoint: old/null authority through early
phases, possible absence after handle close, absence after deletion/session
clear, one exact ordered prefix of DB6/next-empty -> generation-zero Settings ->
marker 3 at `local_cleared`, exact next DB6/data3 after reinitialization, and the
exact receipt at `committed`. La matrice est totale : `handoff_adopted` exige
DB6/data3 au next epoch, le receipt terminal exact, la référence/sidecar encore
présents et le checkpoint d'adoption exact ; `handoff_cleared` exige les mêmes
autorités DB/receipt, la référence exacte, l'absence du sidecar relue et le
checkpoint de clear. Every other physical fact fails closed without
authority mutation.

If that live reacquisition fails, correlated `STEP_FAILED` first enters
`checkpointingFailure` while the same current-worker A reservation remains
`reset_pending`. Only the exact
`reset.journal.checkpoint_failure` capability may persist the unchanged phase
and retry count with `lastError = { code:'FENCE_FAILED', step:'fence',
origin:'boot_fence_reacquisition', retryable:true, ... }`. Strict read-back then
emits `FAILURE_CHECKPOINTED` and enters `failed`. Failure of this checkpoint
enters `failureCheckpointBlocked`, performs no recursive error write and keeps
the boot gate closed. This journal reparses for all twelve phases, so another
worker wakeup again reacquires the outer live deny-gate, routes to `failed` and
waits for a same-reset `RETRY`; it never becomes corrupt or resumes a phase
effect automatically.

Fresh execution separates the authority transition from its journal
checkpoint: `acquiringFence` calls `acquireResetFence`, then
`checkpointingFence` writes phase `fenced`. A restored phase `journaled` has
already acquired the current worker's live fence before
`BOOT_FENCE_ACQUIRED`; it routes directly to `checkpointingFence` and never
calls `acquireResetFence` a second time. Exact duplicate acquisition may return
the canonical current-worker proof, but the statechart does not rely on a
duplicate call.

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
   recognized completion routes to step 15 only; a fresh proof atomically
   installs same-A `reset_pending`. This step is read-only and is not an
   eleventh durable phase.
1. **Journal.** Put/read back phase `journaled` with stable IDs and epochs. An
   unknown write/read-back outcome remains `reset_pending` in
   `resolvingInitialJournal` until the same-A resolver proves exact durability
   or exact absence; it never falls through to failure or fence acquisition.
2. **Acquire fence.** From `durable_proven`, acquire reset ownership, invalidate
   old epoch ownership and stop startup-barrier retry.
3. **Checkpoint fence.** With that live proof, checkpoint `fenced`. A restored
   `journaled` phase whose boot fence is already acquired starts here, not at
   step 2.
4. **Quiesce and checkpoint handoff.** Cancel or settle the active scan; stop
   tracking actors; await any active migration transaction; stop outbox work.
   Scheduling first processes one total mailbox-close marker: callbacks before
   it are in the frozen target, callbacks after it receive the closed terminal.
   It must then CAS/read back the exact immutable local sidecar, recompute all
   canonical facts and return the reference carrying the lane-preallocated
   `sidecarId`. Checkpoint `quiesced` only when all five proofs are true.
5. **Close handles.** Close every connection in the central DB-handle registry,
   prevent new non-reset openers, then checkpoint `handles_closed`.
6. **Delete database.** Await `indexedDB.deleteDatabase('missionpulse')` success,
   then checkpoint `database_deleted`.
7. **Clear session.** Run `chrome.storage.session.clear()` after all sanctioned
   session writers are quiescent, reread the exact local sidecar, then checkpoint
   `session_cleared`. Missing/crossed sidecar proof is not success.
8. **Clear local selectively.** Snapshot all local keys and remove every key
   except exactly `missionpulse.localDataReset.v1` and
   `missionpulse.backgroundSchedulingHandoff.v1`. No writer may create a
   concurrent key while fenced. Reread the same journal/sidecar reference and
   sidecar; this removes any previous latest-only terminal receipt. Checkpoint
   `local_cleared` in the preserved journal.
9. **Reinitialize.** Reset-owned open creates/verifies exact DB6 schema, creates
   strict metadata with the journal's `nextDataEpoch`, verifies empty tracking,
   ledger and outbox stores, writes the shared-contract `SettingsEnvelopeV2`
   with validated defaults, the same epoch, revision 0, generation 0,
   `journal: null` and `outcomes: []`, then reads both authorities through their
   strict validators and writes `APP_DATA_VERSION = 3`. Re-running is a no-op
   only for the exact epoch/envelope/empty-store proof. Normal lease admission
   remains closed. Checkpoint `database_reinitialized`.
10. **Align Settings.** Execute the reset-owned recovery above, prove the exact
    alarm and settled envelope, then checkpoint `settings_aligned`.
11. **Broadcast readiness.** Dispatch exact stage `ready_to_commit`; it is a
    pre-commit invalidation, never reset success and never a Load trigger.
12. **Write and read back terminal receipt.** Under the same global fence and
    system storage gate, put the exact latest-only
    `missionpulse.localDataResetReceipt.v1`, then reread and strictly parse every
    ID, epoch, `requestedAt` and `phase:'committed'`. Receipt storage is included
    in the bounded Settings/system quota reserve. A matching existing receipt is
    an idempotent success; a different receipt is a protocol conflict.
13. **Checkpoint commit.** Persist phase `committed` only after exact readiness
    acceptance and receipt read-back. This durable cutover implies the Settings
    proof; the journal remains solely to replay final notification.
14. **Broadcast committed.** Dispatch the same generation body with stage
    `committed`. A panel may now issue its single correlated, joining Load.
15. **Adopt handoff.** Restore the sidecar after restart when needed, atomically
    move its exact 0..131 slots into the new scheduling ingress, reread adoption
    and checkpoint `handoff_adopted`. The sidecar remains present.
16. **Clear handoff sidecar.** On the original worker, consume the next exact
    cleanup capability. After restart, first create a fresh replacement
    lane/worker, invalidate old-worker token objects and reissue all three exact
    cleanup entries from the journal reference. Consume attempt 0, 1 or 2,
    remove only `missionpulse.backgroundSchedulingHandoff.v1` or accept its
    exact prior absence, strictly prove absence and checkpoint
    `handoff_cleared` in the reset journal.
17. **Clear journal.** Remove `missionpulse.localDataReset.v1`, strictly prove
    absence and retain the exact removal/receipt/DB proof. This does not
    complete Reset.
18. **Install and open epoch admission.** In `openingEpochAdmission`, call the
    dedicated FIFO `installResetEpochAndOpen` operation. Exact success or an
    exact already-open duplicate yields `RESET_EPOCH_ADMISSION_OPENED` and only
    then transitions to `completed`. Failure enters
    `postClearAdmissionFailed` with admission closed; retry repeats only this
    authority operation. Only after the opened proof may Shell return
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
key, while the journal retains exactly twelve phases.

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
write plan. Each write also receives one exact data-only leaf token from the
closed adapter mapped to its `writeKind`; `commitPreAdmission` accepts that token
and no caller callback. The scope is completed before the machine receives the
event that can leave that state.

The stage-to-write mapping is closed:

| Exact Reset state           | Ordered Dataset writes, each with a fresh one-shot capability                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journaling`                | initial exact journal put                                                                                                                                                                          |
| `resolvingInitialJournal`   | same-A exact outcome resolver put/read-back; only from `journalStatus:'outcome_unknown'`                                                                                                           |
| `acquiringFence`            | none; dedicated `acquireResetFence` authority operation                                                                                                                                            |
| `checkpointingFence`        | checkpoint journal phase `fenced`, after the current-worker live fence proof                                                                                                                       |
| `checkpointingQuiescence`   | checkpoint journal phase `quiesced` with exact sidecar reference after closed CAS/read-back                                                                                                        |
| `closingDatabase`           | checkpoint journal phase `handles_closed`; handle close itself is not a durable Dataset write                                                                                                      |
| `deletingDatabase`          | delete `missionpulse`, then checkpoint `database_deleted` with a second capability                                                                                                                 |
| `clearingSession`           | one `chrome.storage.session.clear()`, then checkpoint `session_cleared` with a second capability                                                                                                   |
| `clearingLocal`             | one bounded selective remove excluding exactly journal+sidecar, then checkpoint `local_cleared` with a second capability                                                                           |
| `reinitializing`            | DB6/metadata/empty-store transaction, generation-zero `SettingsEnvelopeV2` write/read-back, marker-3 write/read-back, then journal checkpoint `database_reinitialized`: four distinct capabilities |
| `aligningSettings`          | one capability for every exact Settings envelope/journal/outcome write in the shared recovery plan, then a distinct journal checkpoint `settings_aligned`                                          |
| `writingReceipt`            | latest-only receipt put; its strict read-back is read-only                                                                                                                                         |
| `checkpointingCommit`       | checkpoint journal phase `committed`                                                                                                                                                               |
| `adoptingBackgroundHandoff` | read/restore/adopt sidecar, then checkpoint `handoff_adopted`; adoption itself is read-only and retains the sidecar                                                                                |
| `clearingBackgroundHandoff` | original lane or replacement lane reissues/uses exact cleanup tuple; remove/prove exact sidecar absent, then distinct journal checkpoint `handoff_cleared`                                         |
| `clearingJournal`           | remove the exact reserved journal; strict absence read-back precedes scope completion                                                                                                              |
| `checkpointingFailure`      | persist exact unchanged phase/retry count and exact pending `lastError`; strict read-back precedes `blocked`/`failed`                                                                              |
| `checkpointingRetry`        | persist exact unchanged phase, `retryCount + 1`, `lastError:null`; strict read-back precedes recovery                                                                                              |
| `openingEpochAdmission`     | none; dedicated `installResetEpochAndOpen` authority operation                                                                                                                                     |
| `postClearAdmissionFailed`  | none; journal absent, volatile diagnostic only                                                                                                                                                     |

`preflightingCompletion`, `reacquiringFence`, `routingRestart`,
`acquiringFence`, `quiescing`, `broadcastingReadiness`,
`broadcastingCommitted`, the read/adopt half of `adoptingBackgroundHandoff`,
`openingEpochAdmission` and
`postClearAdmissionFailed` perform no Dataset write and create no empty/dummy
claim. Broadcast and alarm operations retain their own strict delivery/effect
proofs; they cannot be smuggled into a storage token.

The authority epoch bound to a Reset claim is exact:

- `journaling` observes the current admitted epoch when normal admission is
  open, or the authority's nullable/pending epoch while startup is closed;
- after fence ownership and through `clearingLocal`, it equals the reset
  request's `previousDataEpoch`, including literal `null`;
- from `reinitializing` through `clearingJournal`, it equals `nextDataEpoch`.

The initial journal or outcome-resolution scope is completed with
`journalStatus:'durable_proven'` before `acquireResetFence` is enqueued.
Fence acquisition is the dedicated authority method, not a capability write.
Once it linearizes, it increments authority/fence revisions, revokes every old
lease/capability and admits only same-reset `reset_owned` claims. A commit ahead
of the fence settles first; a commit behind it invokes zero adapter. A Reset or
failure fence arriving externally while a durable adapter Promise is pending
receives the next FIFO ticket and waits; it is not rejected by an async-global
reentrancy flag.

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
completed as revoked before correlated `STEP_FAILED`. If a strict journal
exists, that event captures `pendingFailure` and enters
`checkpointingFailure`; the actor cannot expose `blocked`/`failed` until the
exact `lastError` checkpoint is strictly read back. Failure of this checkpoint
enters `failureCheckpointBlocked`, writes no recursive error, and may only retry
the same checkpoint with fresh execution IDs. Before the journal exists,
preflight diagnostics are context-only.

`RETRY` from `blocked`/`failed` similarly enters `checkpointingRetry`; only the
exact journal read-back with unchanged phase, `retryCount + 1` and
`lastError:null` permits recovery/fence reacquisition. A retry-checkpoint failure
enters `retryCheckpointBlocked` and starts no effect. Retry otherwise uses the
same durable Reset identities but fresh attempt, claim, write, capability and
leaf-operation IDs. On worker restart, a fresh worker/attempt pair rehydrates a
current-worker Reset reservation from the strict journal before rebuilding the
plan. Old reservation, capability and leaf exact-object tokens are absent from
the new bounded registries and cannot be accepted.

Reset, startup failure fencing, command/state/attempt/epoch drift, scope
completion and authority/fence revision change revoke every outstanding token.
A worker mismatch rejects, and a new worker does not possess the old
exact-object registry. A late commit therefore performs zero write. Registry
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
preflightingCompletion -- post-clear exact proof --> openingEpochAdmission (recognized)
preflightingCompletion -- fresh exact proof ------> journaling
journaling -- durable outcome unknown ------------> resolvingInitialJournal
journaling|resolvingInitialJournal -- exact durable journal --> acquiringFence
acquiringFence -- RESET_FENCE_AUTHORITY_ACQUIRED --> checkpointingFence
checkpointingFence
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
  -> adoptingBackgroundHandoff
  -> clearingBackgroundHandoff
  -> clearingJournal
  -> openingEpochAdmission
  -> completed [RESET_EPOCH_ADMISSION_OPENED]

any journaled active state -- valid failure ----> checkpointingFailure
checkpointingFailure -- exact read-back --------> blocked|failed
checkpointingFailure -- checkpoint failure -----> failureCheckpointBlocked
blocked|failed -- RETRY -------------------------> checkpointingRetry
checkpointingRetry -- exact read-back [live fence] --> recovering
checkpointingRetry -- exact read-back [fence lost] --> reacquiringFence
checkpointingRetry -- checkpoint failure ---------> retryCheckpointBlocked
openingEpochAdmission -- open failure ------------> postClearAdmissionFailed
postClearAdmissionFailed -- RETRY -----------------> openingEpochAdmission

idle -- SERVICE_WORKER_RESTARTED(valid journal) --> reacquiringFence
reacquiringFence -- BOOT_FENCE_ACQUIRED ----------> routingRestart
routingRestart -- journaled + lastError null -----> checkpointingFence
routingRestart -- later phase + lastError null ---> recovering
routingRestart -- lastError BLOCKED --------------> blocked
routingRestart -- other lastError ----------------> failed
recovering -- journal.phase ----------------------> exact idempotent resume state
```

`completed` is terminal for one reset actor. `blocked`, `failed`, both
checkpoint-blocked states and `postClearAdmissionFailed` are non-terminal.
Only `openingEpochAdmission` may reopen admission, and only after journal
absence plus exact receipt/DB/authority proof.

### States and Shell commands

| State                       | Shell effect allowed                                                                                                    | Success event                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `preflightingCompletion`    | read-only journal/receipt/canonical epoch/DB6-data3 authority proof; no write or fence                                  | `RESET_PREFLIGHT_FRESH` \| `RESET_COMPLETION_RECOGNIZED` |
| `reacquiringFence`          | rehydrate current-worker reservation with readonly authority leaf, then acquire live boot/epoch fence; no resume effect | `BOOT_FENCE_ACQUIRED`                                    |
| `routingRestart`            | none; pure route by parsed journal classification                                                                       | automatic                                                |
| `journaling`                | write initial journal                                                                                                   | `RESET_JOURNALED`                                        |
| `resolvingInitialJournal`   | same-A total resolution of an unknown initial put/read-back outcome                                                     | `RESET_JOURNAL_OUTCOME_RESOLVED`                         |
| `acquiringFence`            | dedicated authority acquisition; no Dataset capability write                                                            | `RESET_FENCE_AUTHORITY_ACQUIRED`                         |
| `checkpointingFence`        | persist exact phase `fenced` after live authority proof                                                                 | `FENCE_CHECKPOINTED`                                     |
| `quiescing`                 | coordinate four dependencies                                                                                            | four `*_QUIESCED` events                                 |
| `checkpointingQuiescence`   | persist phase `quiesced` plus exact handoff sidecar reference after its CAS/read-back                                   | `QUIESCENCE_CHECKPOINTED`                                |
| `closingDatabase`           | close central handle registry, checkpoint                                                                               | `DB_HANDLES_CLOSED`                                      |
| `deletingDatabase`          | delete DB, checkpoint                                                                                                   | `DATABASE_DELETED`                                       |
| `clearingSession`           | clear session, reread exact local sidecar, checkpoint                                                                   | `SESSION_CLEARED`                                        |
| `clearingLocal`             | remove every key outside exact journal+sidecar allowlist, reread both, checkpoint                                       | `LOCAL_CLEARED`                                          |
| `reinitializing`            | create/verify exact DB6/data3, epoch authority and initial generation-zero envelope; checkpoint                         | `DATABASE_REINITIALIZED`                                 |
| `aligningSettings`          | run reset-owned Settings recovery; checkpoint proof as `settings_aligned`                                               | `SETTINGS_ALIGNED`                                       |
| `broadcastingReadiness`     | emit exact non-success `ready_to_commit` event                                                                          | `RESET_READY_BROADCASTED`                                |
| `writingReceipt`            | put and strictly read back exact latest-only receipt under fence/system quota gate                                      | `RESET_RECEIPT_WRITTEN`                                  |
| `checkpointingCommit`       | persist phase `committed` after readiness plus exact receipt read-back                                                  | `RESET_COMMIT_CHECKPOINTED`                              |
| `broadcastingCommitted`     | emit exact replayable `committed` event while journal remains                                                           | `RESET_COMMITTED_BROADCASTED`                            |
| `adoptingBackgroundHandoff` | restore/adopt exact referenced sidecar, retain it and checkpoint `handoff_adopted`                                      | `BACKGROUND_SCHEDULING_HANDOFF_ADOPTED`                  |
| `clearingBackgroundHandoff` | original or replacement lane uses exact durable cleanup tuple, proves absence and checkpoints `handoff_cleared`         | `BACKGROUND_SCHEDULING_HANDOFF_CLEARED`                  |
| `clearingJournal`           | remove reserved journal, strict absence read-back and retain exact removal proof                                        | `JOURNAL_CLEARED`                                        |
| `checkpointingFailure`      | persist/read back exact pending error with unchanged phase/retry count                                                  | `FAILURE_CHECKPOINTED`                                   |
| `failureCheckpointBlocked`  | none; volatile diagnostic, journal unchanged; explicit retry only                                                       | `RETRY_FAILURE_CHECKPOINT`                               |
| `checkpointingRetry`        | persist/read back unchanged phase, incremented retry count and cleared error                                            | `RETRY_CHECKPOINTED`                                     |
| `retryCheckpointBlocked`    | none; volatile diagnostic, journal unchanged; explicit retry only                                                       | `RETRY_RETRY_CHECKPOINT`                                 |
| `openingEpochAdmission`     | idempotently install next epoch and open admission from exact removal/recognition proof                                 | `RESET_EPOCH_ADMISSION_OPENED`                           |
| `postClearAdmissionFailed`  | none; volatile post-clear diagnostic; explicit same-reset retry only                                                    | `RETRY`                                                  |

Every success event is emitted only after its effect and required checkpoint
complete. Async events include the current reset identity where they cross an
external boundary; stale identity/epoch events are ignored.

### Recovery routing

| Last durable phase           | Resume state                                  | Why repeat is safe                                                              |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| no journal / preflight error | `preflightingCompletion` after explicit retry | proof is reread; no destructive effect was admitted                             |
| `journaled`                  | `checkpointingFence`                          | boot already acquired this worker's live fence                                  |
| `fenced`                     | `quiescing`                                   | cancel/stop/await operations are idempotent                                     |
| `quiesced`                   | `closingDatabase`                             | closing an already-closed handle is a no-op                                     |
| `handles_closed`             | `deletingDatabase`                            | deleting a missing DB succeeds                                                  |
| `database_deleted`           | `clearingSession`                             | clearing session repeatedly succeeds                                            |
| `session_cleared`            | `clearingLocal`                               | journal is excluded; removing missing keys succeeds                             |
| `local_cleared`              | `reinitializing`                              | exact matching fresh DB/epoch is verified as no-op                              |
| `database_reinitialized`     | `aligningSettings`                            | shared recovery resumes its durable Settings journal                            |
| `settings_aligned`           | `broadcastingReadiness`                       | readiness and receipt write/read may repeat safely                              |
| `committed`                  | `broadcastingCommitted`                       | exact committed event may repeat before journal clear                           |
| `handoff_adopted`            | `clearingBackgroundHandoff`                   | authority receipt issues three current-worker cleanup tokens; old/copy invalid  |
| `handoff_cleared`            | `clearingJournal`                             | absence checkpoint skips token issuance/delete and resumes journal idempotently |

For `handoff_adopted`, rehydration first rejects equality between the current
and source worker epochs, then validates the source lane/worker,
sidecar/handoff and manifest digest held by the reference. The authority returns
one registered command/result receipt for the replacement lane and current
worker, with three fresh tokens bound to that receipt and to the durable source
bundles. The clear proof selects exactly one matching attempt. A DTO copy, a
manifest/sidecar swap, another worker or an old-worker token is invalid. For
`handoff_cleared`, the current worker must still be fresh, but the
durable absence checkpoint is sufficient: recovery emits neither a replacement
lane nor a delete and routes directly to `clearingJournal`.
The volatile context flag
`backgroundSchedulingCleanupReplacementRequired` is `false` on the original
adoption path, becomes `true` only when a new worker restores durable phase
`handoff_adopted`, and returns to `false` at `handoff_cleared`. The clear guard
passes it to the strict parser: an original-lane proof is therefore rejected
after restart, while a fabricated replacement receipt/token is rejected on the
non-restarted path. `LocalDataResetMachineInput.workerEpoch` is copied into the
context and the clear parser requires both `executingWorkerEpoch` and the
replacement receipt/token worker epoch to equal that current worker exactly; naming a
different fresh worker is not sufficient.

On worker restart, every strict phase waits in `reacquiringFence`; neither the
phase nor `SERVICE_WORKER_RESTARTED` proves a live JavaScript fence.
Rehydration must first return the exact current-worker reservation for the
journal's Reset A; a duplicate returns that same object, while Reset B, a clone,
foreign receipt or phase-incompatible physical authority performs no state
change. `BOOT_FENCE_ACQUIRED` from another reset ID is ignored. A fence failure
enters `checkpointingFailure`, and only an exact failure-checkpoint read-back
may enter `failed`; checkpoint failure remains fail-closed with the journal and
outer boot deny-gate preserved. Every cold start
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

A restart after successful journal clear has no journal to restore. Admission
remains closed unless an exact prior opened proof is already canonical.
Replaying the original request then runs the same read-only preflight; the
canonical next epoch plus exact latest-only receipt and DB6/data3 authority
recognize the post-clear boundary even if legitimate E2 writes followed the
reset, then `installResetEpochAndOpen` proves/open admission idempotently.
Journal absence alone never resumes destruction, opens admission or proves
success.

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
  | 'HANDOFF_ADOPTION_FAILED'
  | 'HANDOFF_CLEANUP_FAILED'
  | 'ADMISSION_OPEN_FAILED'
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
| `HANDOFF_ADOPTION_FAILED`   | `handoff_adoption`                        | `committed`              | `workflow_step`            | `true`      |
| `HANDOFF_CLEANUP_FAILED`    | `handoff_cleanup`                         | `handoff_adopted`        | `workflow_step`            | `true`      |
| `ADMISSION_OPEN_FAILED`     | `post_clear_admission`                    | journal absent + receipt | context-only               | `true`      |
| `PROTOCOL_ERROR`            | current expected non-journal step         | unchanged                | `workflow_step`            | `false`     |

The machine records both `expectedStep` and `expectedErrorOrigin` on entry to
each active state. A `STEP_FAILED` with the wrong reset ID, code/step/origin
pair, retryability, extra error key, empty/oversized message or non-current
contract is ignored and cannot drive a transition. `JOURNAL_FAILED` is the sole
cross-cutting workflow-step error because every checkpointing state writes the
journal; the machine records that capability separately, so `JOURNAL_FAILED`
is rejected in non-checkpointing states such as `quiescing` and either broadcast.
Boot-fence origin is accepted only while `reacquiringFence` expects it. For a
valid journal, accepted `STEP_FAILED` never writes or enters a presentation
state directly: it enters `checkpointingFailure`, and strict same-journal
read-back is the sole transition to `blocked`/`failed`.

`PREFLIGHT_FAILED` and `PROTOCOL_ERROR/preflight` are context-only because no
journal exists yet; neither may be encoded into a twelve-phase journal. They retain
the request identities in actor context for diagnostic projection and, only for
the retryable physical failure, explicit retry.

`ADMISSION_OPEN_FAILED/post_clear_admission` is also context-only because the
journal has already been strictly removed. It retains exact receipt/removal/DB
proof in actor context, keeps authority closed and permits only an explicit
retry of `installResetEpochAndOpen`. It is never persisted by recreating the
journal.

`RECEIPT_FAILED/receipt` and `PROTOCOL_ERROR/receipt` are the only additional
errors consistent with durable phase `settings_aligned`: readiness has no
durable phase, so retry/restart repeats readiness before the receipt operation.
The former covers bounded-quota/storage/read-back failure and is retryable; an
exact-key or correlation conflict is non-retryable.

- `deleteDatabase.onblocked`, an unclosed handle or a reset-owned open blocked by
  another context uses `BLOCKED` and state `blocked`.
- Quota, permission/API, transaction, validation and journal checkpoint errors
  use the exact step-specific code and state `failed`.
- `RETRY` is explicit. With a valid journal it first enters
  `checkpointingRetry`; strict read-back of unchanged phase,
  `retryCount + 1` and `lastError:null` is required before recovery. There is no
  automatic destructive retry loop.
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
   effect; `completionDisposition` distinguishes it from normal execution, but
   both paths still require exact admission-open proof before completion.
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
12. Session clears before local; local clearing preserves exactly the reset
    journal and background handoff sidecar, and removes the previous receipt.
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
18. On the executing path, the journal remains until the exact committed event,
    sidecar adoption, sidecar absence read-back and `handoff_cleared` checkpoint
    are accepted; removal yields a durable recovery proof, then a separate
    idempotent authority operation must install/open the next epoch before
    `completed`, while the bounded receipt remains for replay.
19. A correlated Load seeing the same `committed` journal joins finalization and
    never returns `SETTINGS_RESET_IN_PROGRESS` for that journal.
20. `reset:true` implies database deleted, session/local cleared, DB6/data3
    reinitialized, exact Settings/alarm proof, readiness, terminal receipt,
    committed checkpoint, committed broadcast, journal removal and exact
    next-epoch admission-open proof, either executed now or proven by the strict
    post-clear recognition path.
21. Any partial or blocked outcome implies `reset:false` and is retryable only as
    declared by its error.
22. Retry and worker restart retain all IDs/epochs and never resurrect old data.
23. No LLM decides admission, phase, deletion, retry or success.
24. Every mutative message carries the bootstrap epoch; every internal writer
    revalidates its revocable lease inside the commit gate.
25. Reset revokes every old lease before quiescence and does not open new-epoch
    admission until strict journal removal plus receipt/DB/authority proof.
26. A restored durable phase always has `fenceAcquired:false` until correlated
    `BOOT_FENCE_ACQUIRED`; before that event, strict FIFO rehydration has created
    a current-worker replacement reservation and `acquireResetFence` has consumed
    it.
27. Every Reset Dataset write in the closed mapping has one fresh capability;
    it also has one exact matching leaf token from the closed adapter table, and
    no capability/leaf covers a whole state, port or multi-write effect.
28. Reset claims, capability issuance/commit/completion, ordinary commits,
    reset fence and epoch installation share the authority's one FIFO.
29. Each capability is consumed before registered adapter invocation/await and
    can never be replayed after rejection, completion or restart.
30. Reset cleanup capabilities bind exact nullable `previousDataEpoch`; rebuild
    and terminal capabilities bind exact `nextDataEpoch`.
31. Reinitialization uses four ordered capabilities: DB6 transaction, complete
    Settings V2 generation-zero write/read-back, marker-3 write/read-back and
    `database_reinitialized` checkpoint.
32. A state-success or `STEP_FAILED` event is not sent while that state's scope
    remains active; completion/révocation precedes the event.
33. Reset/failure fence and command/state/attempt/epoch/revision drift make
    every losing late commit execute zero durable effect; a new worker does
    not possess the old exact-object registry.
34. Capability registries are bounded without eviction, and no exhaustion,
    allocator or validation error enables a lease/raw/no-op fallback.
35. Fresh/recognition preflight is the only pre-version IDB opener: absent DB
    means no open, present DB uses no target version and readonly transactions,
    `onupgradeneeded` aborts, and all outcomes prove temporary-handle closure.
36. Journal restoration never clones an old reservation. The phase-compatible
    reread and `reset_pending` replacement creation are one FIFO operation bound
    to the current worker; Reset B and every third epoch/foreign receipt fail
    without authority mutation.
37. Durable/read adapters are a closed build-time mapping with data-only exact
    tokens and no authority/controller/public Settings import. External Reset or
    failure-fence calls remain enqueueable while an adapter Promise is pending.
38. `reset_pending` has one total journal status. `outcome_unknown` permits only
    same-A resolution; Reset B and fence acquisition are rejected.
39. Fresh and restored phase-`journaled` paths acquire one live fence per worker:
    boot acquisition routes directly to `checkpointingFence`, never back through
    `acquiringFence`.
40. Every durable `lastError`/`retryCount` mutation uses the exact failure/retry
    capability and strict journal read-back. Checkpoint failure cannot recurse or
    resume an effect.
41. Journal removal never completes Reset. Admission-open failure preserves the
    receipt/removal/DB proof, keeps admission closed and retries only the
    idempotent authority operation.
42. The only handoff payload key is
    `missionpulse.backgroundSchedulingHandoff.v1`; the reset journal carries
    only its exact id/digest reference and never the payload.
43. The handoff closes irreversibly at one mailbox sequence before checkpoint.
    Callbacks before it are in the 131-slot target; callbacks after it receive
    `RESET_HANDOFF_CLOSED`, allocate no ID, write nothing and cannot stale the
    journal reference. Internal checkpointing may still consume only the exact
    preallocated entries needed to materialize that frozen target.
44. CAS/capacity/read-back failure before session clear erases nothing. After
    session clear the sidecar survives restart and exact local clear.
45. Adoption retains the sidecar. Only a distinct cleanup capability plus
    strict absence read-back and journal checkpoint permits journal removal.
46. A fresh or recognized preflight requires both reset journal and handoff
    sidecar absent; orphan sidecar bytes fail closed.
47. The lane preallocates one fresh distinct `sidecarId` before ordinary work;
    all 1 584 CAS bundles, three cleanup bundles, capabilities, sidecar, payload
    and reference carry that exact identity.
48. The closed payload parser recalculates payload/writer/journal SHA-256,
    verifies the durable frozen target/cursor prefix and derives bitmap/count
    from its dense 131 slots. Non-JSON, corruption,
    cross-swap or outer-field drift fails closed.
49. Canonical payload bytes are independently bounded to 786432; complete
    canonical sidecar bytes are recomputed, bounded to 1048576 and repeated as
    `reference.sidecarEncodedBytes`.
50. `BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED` freezes lane, attempt, worker,
    sidecar, handoff, manifest 1 584+3 and frozen-target digest. All 1 587 bundle digests
    and aggregate digests are recalculated; the trusted fence expectation rejects
    even an internally coherent same-reset/same-epoch foreign lane.
51. Sidecar initialization durably stores target/digest/cursor at revision 0.
    Every present slot materialized increments once, so revision, bitmap popcount and slot count are identical
    for every accepted 0..131-slot sidecar.
52. The journal reference retains the exact three cleanup entries. A replacement
    worker uses an authority-issued command/result receipt and three worker-bound
    tokens; old objects, copied DTOs and foreign-worker receipts are invalid.
53. Recovery from `handoff_adopted` performs replacement cleanup and the absence
    checkpoint idempotently; recovery from `handoff_cleared` emits no delete or
    token and proceeds directly to journal removal.

## Forbidden transitions

- `idle -> journaling` without exact fresh preflight.
- treating `reset_pending + outcome_unknown` as absent, durable, failed or
  available to Reset B; acquiring the fence before `durable_proven`.
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
- local clear with any preserved-key set other than the exact reset-journal +
  handoff-sidecar tuple, or treating an orphan/mismatched sidecar as absent.
- session clear before exact sidecar CAS/read-back/reference checkpoint, or
  after CAS capacity/write failure.
- allocating an ID or writing the sidecar for a slot already present, exceeding
  three CAS bundles for one transition, or using a non-allowlisted capability.
- accepting a checkpoint while the handoff is still open, mutating the frozen
  target or admitting an external slot after its mailbox-close marker, consuming
  an internal bundle for a non-target slot, silently dropping a late callback,
  or recheckpointing a different reference after `quiesced`.
- allocating `sidecarId` on first write, omitting it from any CAS/cleanup
  capability, or cross-swapping a lane/bundle/sidecar/reference identity.
- trusting serialized text, caller-provided digest/bitmap/count/byte length, or
  accepting non-JSON/sparse/custom payload content without canonical reparse.
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
- sidecar deletion before exact adoption, deletion without the original exact
  cleanup capability or a fully proven replacement tuple/absence read-back,
  old-worker token reuse, or journal clear before `handoff_cleared`.
- completing or returning `reset:true` after journal removal but before exact
  `RESET_EPOCH_ADMISSION_OPENED`; repeating destruction after a post-clear open
  failure.
- deleting the latest receipt after success instead of retaining it until the
  next reset's selective local clear.
- returning `SETTINGS_RESET_IN_PROGRESS` to the same-reset correlated Load in
  phase `committed` instead of joining finalization.
- reopening admission from `blocked` or `failed` while the journal exists.
- routing a restored phase or emitting a resume effect before
  `BOOT_FENCE_ACQUIRED` for the same reset ID.
- routing restored phase `journaled` back through `acquiringFence` after the
  boot operation already acquired the current-worker live fence.
- reacquiring a restored fence from a cloned/dead-worker reservation or directly
  from journal fields without strict FIFO rehydration into a current-worker
  exact-object reservation.
- automatically retrying a persisted non-null `lastError` on worker wakeup.
- entering `blocked`/`failed` before exact failure-checkpoint read-back, or
  resuming after `RETRY` before exact retry-checkpoint read-back; writing a
  recursive error when either checkpoint fails.
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
- caller-provided async durable/preflight callback, runtime adapter injection,
  adapter import/reference to authority/controller/public Settings, or treating
  an external FIFO caller as adapter reentrance.
- preflight opening an absent DB, supplying a target version, accepting
  `onupgradeneeded`, using a readwrite transaction, leaking its temporary handle
  or settling before close/unregister proof.
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
  recognized `openingEpochAdmission` with no journal/fence/destructive command;
- post-clear recognition rejects a foreign canonical epoch, wrong DB/data/schema
  authority, missing/mismatched/latest receipt, wrong requestedAt/ID/epoch/
  phase, missing/extra key and non-canonical/colliding UUID; it still recognizes
  after valid same-epoch mission/settings/alarm writes;
- fresh preflight rejects `canonicalDataEpoch !== previousDataEpoch` and
  `nextDataEpoch === canonicalDataEpoch`; physical read failure is retryable at
  `PREFLIGHT_FAILED/preflight`, while a protocol conflict is non-retryable and
  neither path writes a journal;
- absent-DB preflight performs no `indexedDB.open`; present-DB preflight uses no
  target version and readonly transactions, aborts `onupgradeneeded`, and proves
  handle close/unregister on success, blocked, versionchange, parse and storage
  failure with zero schema/migration/marker write;
- shared wire differential matrix accepts exact `ready_to_commit` and
  `committed`, including nullable previous epoch, and identically rejects
  uppercase UUIDs, reset/next/bootstrap/previous collisions, wrong stage,
  missing key and extra key from both Reset and Settings consumers;
- adversarial wire/proof objects with a custom/inherited prototype, accessor,
  Symbol, non-enumerable extra/required key or throwing Proxy fail closed; a
  rejected accessor is never invoked, while frozen and null-prototype exact
  data records remain valid;
- journal write failure performs no destruction;
- initial journal adapter returns exact durable, exact absence and unknown
  outcome: only durable proceeds to fence, absence retries A with fresh IDs,
  unknown remains in same-A resolution, and B is rejected in every case;
- every accepted code/step/retryability pair transitions as specified and every
  malformed/wrong-state error is ignored;
- for `reset_pending` and `reset_owned`, every accepted failure first enters
  `checkpointingFailure`; exact read-back alone exposes `blocked`/`failed`.
  Failure of that checkpoint writes nothing recursively. Every explicit retry
  similarly waits for exact `retryCount + 1`/`lastError:null` read-back;
- scan/tracking/migration/outbox quiescence must all be proven;
- the fifth quiescence proof is the exact sidecar/reference read-back; four
  dependency proofs alone stay in `quiescing` and cannot clear session;
- exact sidecar parser accepts canonical 0/1/131 slots and rejects foreign
  key/schema, non-JSON, payload/writer/journal digest drift,
  bitmap/count/payload-size/full-sidecar-size drift, cross-swaps, unknown fields
  and oversized payload/sidecar;
- exact checkpoint provenance carries lane, attempt, source worker,
  sidecar/handoff, ordered 1 584+3 manifest and frozen-target digest; each bundle and both
  aggregate digests are recalculated, and a same-reset/same-epoch cross-lane
  provenance swap is rejected;
- initialize then fill all 131 slots with at most three fresh bundles per
  transition; persist the exact full CAS cursor before consumption and its
  successor after a definitive failure, crash after `0:37:0`, and prove the
  restored next bundle is exactly `0:37:1` without reuse or skip; revisions are
  exactly 0/1/131 for 0/1/131 present slots; repeated
  present-slot callbacks consume zero ID/write; capacity or twelfth CAS failure
  keeps Reset before clear with session/local untouched;
- mailbox-close race in both orders: preceding callback is in the frozen digest,
  following callback receives exact `RESET_HANDOFF_CLOSED` with zero allocation;
  internal checkpointing may consume only preallocated entries for the frozen
  target, and neither path can mutate the reference after `quiesced`;
- lane allocates one unique sidecar ID before work admission; every CAS and
  cleanup bundle/proof carries it, and any substituted or first-write ID fails;
- blocked DB deletion retains journal, fence and `reset:false`, then explicit
  retry resumes at deletion;
- crash after every durable phase resumes at the table's exact state;
- crash independently in `handoff_adopted` before cleanup attempts 0, 1 and 2:
  a fresh lane/worker reissues the exact durable three-entry tuple, every old
  worker token and tuple/manifest/sidecar substitution is rejected, and exact
  removed/already-absent proceeds through `handoff_cleared` to journal clear;
  crash in `handoff_cleared` performs no further token issuance or delete;
- every restored phase remains in `reacquiringFence` until matching
  `BOOT_FENCE_ACQUIRED`; first rehydrate a new exact-object reservation for A in
  the current worker, prove exact duplicate identity, reject B/clone/old worker/
  third epoch/foreign receipt and every phase-incompatible physical fact, then
  acquire the live fence; failure produces no resume effect;
- restored `journaled` observes exactly one current-worker fence acquisition and
  routes from `BOOT_FENCE_ACQUIRED` directly to `checkpointingFence`;
- for each of the twelve phases, boot-fence failure persists with its explicit
  origin, reparses strictly, survives a second restart as `failed`, ignores a
  foreign reset ID and permits only automatic safety-fence reacquisition before
  same-reset `RETRY`; no durable workflow effect resumes before that retry;
- restart with `lastError:null` resumes after the boot fence; restart with every
  retryable family waits in `failed`, `BLOCKED` waits in `blocked`, and no effect
  restarts before correlated `RETRY`; non-retryable has no retry transition;
- restart with non-retryable journal error remains fenced/failed, while a
  phase/error mismatch is classified as a corrupt journal;
- crash after local clear but before reinitialize preserves journal/epoch;
- crash after session clear and after local clear restores the same sidecar by
  id/digest; exact local allowlist preserves only reset journal + sidecar;
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
  exact committed payload before adoption;
- adoption mismatch/failed read-back leaves sidecar present and journal phase
  committed; exact adoption checkpoints `handoff_adopted` but still preserves
  the key; cleanup failure retains it; only absence read-back checkpoints
  `handoff_cleared` and allows journal removal;
- fail and crash after strict journal removal but before admission-open proof:
  authority stays closed, no success response is emitted, and retry/cold
  recognition opens idempotently from receipt/removal/DB proof without repeating
  any destructive effect;
- only completed returns `reset:true` and the next epoch;
- two panels discard old effects and converge through fresh bridge bootstrap;
- late old-epoch messages and stale reset events perform zero writes;
- old tracking v1/v2, settings base-revision-0 save, scan terminal/checkpoint,
  profile callback and cache writer all perform zero post-reset write;
- lease revocation between calculation and commit fails final in-gate
  revalidation and performs zero durable write;
- ordinary lease before admission is rejected, while an exact same-reset claim
  and exact next write capability/leaf token are admitted only in the modeled
  state;
- substitute claim/reset/stage/command/attempt/worker/nullable epoch,
  authority/fence revision, write ID, capability ID, leaf operation ID or
  adapter ID independently and assert zero adapter invocation;
- every two-write Reset state receives two distinct one-shot capabilities;
  double consume, cross-write/cross-state reuse, completion-before-commit and
  old-worker leaf replay all perform zero write;
- execute commit/Reset and commit/failure-fence in both FIFO orders; only the
  operation ahead of the fence may enter its durable adapter; enqueue an
  external Reset during a pending adapter Promise and prove it waits behind the
  effect without `AUTHORITY_REENTRANCY_FORBIDDEN` or deadlock;
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

## Runtime availability projection

The destructive UI projects an explicit runtime capability, never an optimistic
button. Until the executable Reset actor has all model-owned ports wired — the
Dataset authority, Startup Barrier join, writer quiescence, journal/receipt,
Settings recovery and background handoff — the only valid projection is:

```ts
{
  status: 'unavailable',
  reason: 'Réinitialisation indisponible : coordination de sécurité en cours de finalisation.'
}
```

In that state the production UI does not render the destructive entry point and
emits no `RESET_LOCAL_DATA` command. An unavailable capability is a release-scope
fact, not a disabled feature teaser: the Settings tab must not advertise an
unfinished destructive workflow. Development diagnostics may expose the reason
outside the user-facing Settings surface, but they still cannot emit the reset
command. If capability becomes unavailable after a confirmation has already
opened, the confirmation controls disappear and the same unavailable projection
wins. A failed command that was legitimately started while available remains
visible as an inline alert; it never closes the confirmation, navigates to
onboarding or presents success. Only installation of the complete executable
port set may change this contract to `available` and make the entry point
renderable.

The executable source of this current projection is
`local-data-reset-availability.contract.ts`. UI wording may evolve, but the
unavailable/hidden/no-command and truthful-error invariants may not.

| Runtime capability | Existing confirmation                    | Production Settings surface                | Admitted effect                  |
| ------------------ | ---------------------------------------- | ------------------------------------------ | -------------------------------- |
| `unavailable`      | no                                       | no Reset entry point                       | none                             |
| `unavailable`      | yes, from a prior `available` projection | confirmation is removed immediately        | none                             |
| `available`        | no                                       | Reset entry point may render               | none until explicit confirmation |
| `available`        | yes and exact confirmation satisfied     | confirmation remains visible while pending | model-owned Reset command only   |

Review result: nominal availability, capability revocation, stale confirmation,
retry/error display, and command admission are explicit. No text, disabled
button state, or stale UI boolean authorizes a destructive transition. The
background handler remains fail-closed even when an untrusted caller fabricates
`RESET_LOCAL_DATA` while the capability is unavailable.

## Out of scope

- selective export/restore of reset data;
- remote/cross-device erasure;
- automatic repair of a corrupt reset journal;
- remote connected-dashboard deletion;
- UI wording and visual design beyond truthful pending/blocked/failure/success
  projection.
- implementation of the pre-admission capability contracts, authority methods
  or Shell adapter before their independent model review.
