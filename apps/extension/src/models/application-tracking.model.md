# Application Tracking Workflow Model

Source of truth for the local application pipeline, truthful persistence,
revisioned mutations, compare-and-swap Undo, worker-restart reconciliation and
the disabled connected-dashboard persistence seam.

The executable statechart is `application-tracking.machine.ts`; strict types and
pure correlation/settlement validators live in
`application-tracking.machine.contract.ts`, while typed XState guards/actions
live in `application-tracking.machine.logic.ts`. These model files emit effect
commands but perform no I/O. Core owns domain validation and candidate/CAS/digest
decisions. Shell owns IndexedDB, clocks, UUIDs, runtime messaging, actor
registration and effect execution.

## Delivery boundary

Two delivery levels must never be conflated:

- **Implemented and verified at commit `d32d76b8`: Task 5 / wire v1.** Storage
  failures are truthful, responses are strict, UI state remains confirmed, and
  success/Undo is downstream of a persistence acknowledgement.
- **Reviewed target, not implementation evidence: Task 5b / wire v2.** The
  envelopes, ledger, per-mission actors, CAS, checkpoints, reconciliation,
  migration v3 and disabled outbox seam described below remain unimplemented until their RED
  tests and Shell integration exist.

Creating the machine file makes behavior executable as a model; it does not
prove that background, storage, bridge, scan or UI consume it.

## Domain pipeline

The canonical statuses and transitions come only from `@pulse/domain`:

```ts
type ApplicationStatus =
  | 'detected'
  | 'selected'
  | 'application_prepared'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'archived';
```

| From                   | Allowed targets                               |
| ---------------------- | --------------------------------------------- |
| `detected`             | `selected`, `archived`                        |
| `selected`             | `application_prepared`, `applied`, `archived` |
| `application_prepared` | `applied`, `archived`                         |
| `applied`              | `interview`, `offer`, `rejected`, `archived`  |
| `interview`            | `offer`, `rejected`, `archived`               |
| `offer`                | `accepted`, `rejected`, `archived`            |
| `accepted`             | `archived`                                    |
| `rejected`             | `archived`                                    |
| `archived`             | `detected`                                    |

`accepted`, `rejected` and `archived` end follow-up scheduling and force
`nextActionAt = null` in the same commit. They are settled outcomes but not all
absorbing states: only the table above permits re-entry.

An LLM may generate content or signals. It never chooses a status, mutation ID,
revision, CAS result or state transition.

## Task 5 wire v1 — current contract

Wire v1 stays exact. Task 5b must not widen its schemas.

```ts
type ApplicationTrackingIntentV1 = 'load' | 'transition' | 'details' | 'restore';

type Task5ApplicationTrackingErrorCode =
  | 'LOAD_FAILED'
  | 'PERSIST_FAILED'
  | 'INVALID_TRANSITION'
  | 'INVALID_DETAILS'
  | 'INVALID_RESTORE'
  | 'TRANSPORT_ERROR'
  | 'PROTOCOL_ERROR';

interface SerializedApplicationTrackingErrorV1 {
  version: 1;
  code: Task5ApplicationTrackingErrorCode;
  intent: ApplicationTrackingIntentV1;
  missionId: string | null;
  mutationId: null;
  message: string;
  recoverable: boolean;
}
```

The only v1 failure response is `TRACKING_FAILED`. The four Task 5b codes
`STALE_UNDO`, `APPLICATION_BUSY`, `CANCELLED` and `WORKER_RESTARTED` remain
invalid in v1. A non-null v1 mutation ID is invalid. Code/intent/message/
recoverable/identity mismatches become a UI-local `PROTOCOL_ERROR`.

V1 settlement remains:

```text
GET_TRACKINGS
  success -> TRACKINGS_RESULT(real normalized records, including real [])
  failure -> TRACKING_FAILED(LOAD_FAILED)

UPDATE_TRACKING / UPDATE_TRACKING_DETAILS
  invalid -> TRACKING_FAILED(INVALID_*)
  committed -> TRACKING_UPDATED(exact confirmed record)
  storage failure -> TRACKING_FAILED(PERSIST_FAILED)

RESTORE_TRACKING
  invalid -> TRACKING_FAILED(INVALID_RESTORE)
  committed -> TRACKING_RESTORED({ missionId, exact record or null })
  storage failure -> TRACKING_FAILED(PERSIST_FAILED)
```

After the v3 envelope migration, stale v1 contexts are compatibility adapters:

- v1 GET projects only active v2 envelopes into `MissionTracking[]`;
- **every v1 write** (`UPDATE_TRACKING`, `UPDATE_TRACKING_DETAILS` and
  `RESTORE_TRACKING`) fails closed as v1 `PROTOCOL_ERROR`, because v1 carries
  neither `dataEpoch` nor a caller mutation token. A pre-reset v1 panel must
  never be allowed to create revision 1 in a fresh dataset;
- install/update invalidates and reloads stale extension contexts. Inferring an
  Undo token from current storage is forbidden.

## Task 5b identifiers and dataset epoch

```ts
type MutationId = string; // canonical lowercase UUID v4
type TrackingDataEpoch = MutationId;
```

The exact accepted UUID regex is:

```text
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

- Shell injects IDs via `crypto.randomUUID()`; Core and machine never generate
  them.
- One explicit intent gets one mutation ID.
- Retry after a certain failure is a new intent with a new ID.
- Transport/worker uncertainty keeps the same ID and reconciles; it never
  replays the mutation.
- `dataEpoch` identifies the lifetime of the entire local dataset. It is stored
  in `tracking_meta`, repeated by envelopes/ledger and carried by every
  v2 mutation, response, reconcile and cancel message.
- A response or request from an old data epoch is invalid and cannot alter UI or
  storage. Worker lifetime uses a separate `workerEpoch` UUID.

```ts
interface TrackingMetaV1 {
  key: 'tracking_meta';
  schemaVersion: 1;
  dataEpoch: TrackingDataEpoch;
  collectionRevision: number; // safe integer, starts at 0
}
```

The metadata row is created in the same data-v3 migration transaction as legacy
envelopes. A fresh post-reset database creates a new epoch before admission.

## Additive wire v2

V2 uses distinct discriminants; v1 discriminants and schemas remain unchanged.

```ts
type PublicTrackingMutationIntentV2 = 'transition' | 'details' | 'restore';
type TrackingMutationIntentV2 = PublicTrackingMutationIntentV2;

type TrackingV2Request =
  | {
      type: 'GET_TRACKING_ENVELOPES_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch | null;
        requestId: MutationId;
        cursor: string | null;
        snapshotRevision: number | null;
      };
    }
  | {
      type: 'UPDATE_TRACKING_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        status: ApplicationStatus;
        note?: string;
      };
    }
  | {
      type: 'UPDATE_TRACKING_DETAILS_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        nextActionAt: string | null;
      };
    }
  | {
      type: 'RESTORE_TRACKING_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        previousTracking: MissionTracking | null;
        expectedCurrentRevision: number;
        expectedCurrentMutationId: MutationId;
      };
    }
  | {
      type: 'RECONCILE_TRACKING_MUTATION_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        intent: PublicTrackingMutationIntentV2;
        commandDigest: string;
      };
    }
  | {
      type: 'CANCEL_TRACKING_MUTATION_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        mutationId: MutationId;
        missionId: string;
        intent: PublicTrackingMutationIntentV2;
        commandDigest: string;
      };
    };
```

```ts
type TrackingV2Response =
  | {
      type: 'TRACKING_ENVELOPES_RESULT_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        requestId: MutationId;
        snapshotRevision: number;
        cursor: string | null;
        nextCursor: string | null;
        complete: boolean;
        envelopes: PersistedTrackingEnvelopeV2[];
      };
    }
  | {
      type: 'TRACKING_LOAD_RESTART_REQUIRED_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        requestId: MutationId;
        currentSnapshotRevision: number;
      };
    }
  | {
      type: 'TRACKING_EPOCH_CHANGED_V2';
      payload: {
        version: 2;
        requestId: MutationId;
        requestedDataEpoch: TrackingDataEpoch;
        currentDataEpoch: TrackingDataEpoch;
        action: 'restart_bootstrap';
      };
    }
  | {
      type: 'TRACKING_COMMITTED_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        intent: PublicTrackingMutationIntentV2;
        missionId: string;
        mutationId: MutationId;
        commandDigest: string;
        envelope: PersistedTrackingEnvelopeV2;
        undo: TrackingUndoTokenV2;
        deduplicated: boolean;
      };
    }
  | { type: 'TRACKING_RECONCILED_V2'; payload: TrackingReconciliationV2 }
  | { type: 'TRACKING_FAILED_V2'; payload: SerializedApplicationTrackingErrorV2 }
  | {
      type: 'TRACKING_ENVELOPE_BROADCAST_V2';
      payload: {
        version: 2;
        dataEpoch: TrackingDataEpoch;
        envelope: PersistedTrackingEnvelopeV2;
      };
    };
```

Schemas are strict and bounded. `GET_TRACKING_ENVELOPES_V2.dataEpoch` is null
only for the first bootstrap or immediately after a correlated
`TRACKING_EPOCH_CHANGED_V2`; every continuation/restart sends the epoch returned
by page one. If a panel presents an old non-null epoch, the worker returns only
`TRACKING_EPOCH_CHANGED_V2`: no envelope, cursor or old-epoch data. The panel
accepts it only when `requestId` and `requestedDataEpoch` exactly match its Load,
discards staging/pending effects, then starts one new request with epoch null and
cursor null. Every other success/failure must match version, epoch, request ID,
mutation ID, mission, intent and digest exactly.

### Normative limits and paginated Load

The same exported Core constants must drive wire schemas, storage validation and
migration:

```ts
const TRACKING_MISSION_ID_MAX_CHARS = 256;
const TRACKING_NOTE_MAX_CHARS = 2_048;
const TRACKING_NOTES_MAX_CHARS = 10_000;
const TRACKING_HISTORY_MAX_ITEMS = 200;
const TRACKING_ASSET_IDS_MAX_ITEMS = 100;
const TRACKING_RECORD_MAX_BYTES = 40_000;
const TRACKING_ENVELOPE_MAX_BYTES = 85_000;
const TRACKING_LEDGER_MAX_BYTES = 2_048;
const TRACKING_OUTBOX_MAX_BYTES = 45_000;
const TRACKING_LOAD_PAGE_MAX_ITEMS = 50;
const TRACKING_LOAD_PAGE_MAX_BYTES = 512_000;
const TRACKING_CURSOR_MAX_CHARS = 512;
const TRACKING_EFFECT_IDS_MAX_ITEMS = 256;
const TRACKING_DIAGNOSTIC_WARNING_BYTES = 64 * 1024 * 1024;
const TRACKING_MIN_QUOTA_HEADROOM_BYTES = 1024 * 1024;
```

There is no filtered v2 GET. A complete load includes records and tombstones.
The cursor is an opaque, worker-validated encoding of `dataEpoch`,
`snapshotRevision` and the last missionId, and is used with an exclusive key
range; clients never construct it.

`tracking_meta.collectionRevision` is incremented in every envelope Tx B. The
first page fixes `snapshotRevision`; every later page must present it. If the
meta revision changed, the worker returns `TRACKING_LOAD_RESTART_REQUIRED_V2`
and the panel discards its staging snapshot and restarts from cursor null. Two
automatic read restarts are allowed; continued churn surfaces `LOAD_FAILED`.

The panel subscribes to broadcasts before page one, stages pages without
replacing the confirmed collection, and publishes the complete staged map only
after `complete:true`. A failed/restarted load preserves the prior confirmed
map. Broadcasts received during pagination are merged by revision into staging
and confirmed maps. Tombstones mean absence from a page is never interpreted as
deletion.

### Canonical command digest

Core produces an RFC 8785/JCS UTF-8 representation of one ordered tuple; Shell
computes lowercase SHA-256 hex once and the machine/storage compare that digest:

```text
^[0-9a-f]{64}$
```

```text
transition = [2,dataEpoch,"transition",missionId,to,noteOrNull]
details    = [2,dataEpoch,"details",missionId,canonicalIsoOrNull]
restore    = [2,dataEpoch,"restore",missionId,expectedRevision,
              expectedMutationId,canonicalPreviousTrackingOrNull]
```

All strings are Unicode NFC; `undefined` normalizes to `null`; valid dates use
UTC `toISOString()`; tracking object keys and nested arrays use the canonical
wire order. Test vectors must pin Unicode, key order, undefined/null, date
offsets and restore snapshots. A digest mismatch for an existing mutation ID is
never recoverable by recomputing the command.

The first immutable SHA-256/JCS vectors are:

| Case                                       | Canonical UTF-8 JSON                                                                          | Lowercase SHA-256                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| transition/null                            | `[2,"11111111-1111-4111-8111-111111111111","transition","mission-1","selected",null]`         | `3859a05e023fd89e6eb8c42bf2069c950a45bb5f86f872948491abca2b61912c` |
| decomposed Unicode input normalized to NFC | `[2,"11111111-1111-4111-8111-111111111111","transition","mission-é","selected","café"]`       | `0d2f3269f4b3d70a1d37d32eafb87c245625c50a39f281d146159604f38c4069` |
| details `2026-07-15T10:30:00+02:00`        | `[2,"11111111-1111-4111-8111-111111111111","details","mission-1","2026-07-15T08:30:00.000Z"]` | `0ef55b59988a854410a60082ff6d4bcda4e8746165742395f5b3660534e39e17` |
| details undefined or null                  | `[2,"11111111-1111-4111-8111-111111111111","details","mission-1",null]`                       | `b2d12bf5d004e0fa98a0fb72ebc5b34c23198a26eb150fcdc57273120531484d` |

A restore fixture with deliberately permuted object keys must hash identically
to its canonical-key-order fixture; that fixture is generated from the shared
bounded `MissionTracking` schema rather than maintained as a second hand-written
serializer.

## Canonical envelope, tombstone and Undo

```ts
interface TrackingRevisionTokenV2 {
  dataEpoch: TrackingDataEpoch;
  revision: number; // safe integer >= 0; zero means no envelope yet
  lastMutationId: MutationId | null;
}

interface PersistedTrackingEnvelopeV2 {
  schemaVersion: 2;
  dataEpoch: TrackingDataEpoch;
  missionId: string;
  kind: 'record' | 'tombstone';
  tracking: MissionTracking | null;
  revision: number; // safe integer >= 1
  lastMutationId: MutationId | null;
  lastMutationIntent: TrackingMutationIntentV2 | null;
  committedAt: number;
  undoBase: {
    previousTracking: MissionTracking | null;
    expectedCurrentRevision: number;
    expectedCurrentMutationId: MutationId;
  } | null;
}

interface TrackingUndoTokenV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch;
  missionId: string;
  previousTracking: MissionTracking | null;
  expectedCurrentRevision: number;
  expectedCurrentMutationId: MutationId;
}
```

Envelope invariants:

1. `record` iff tracking is non-null; `tombstone` iff tracking is null.
2. A non-null tracking repeats mission identity and is fully canonical.
3. Revision is monotonic per mission across write, tombstone and recreate.
4. Normal deletion writes a tombstone; it never removes the key.
5. Legacy migration creates revision 1 with null last mutation/intent/Undo.
6. `undoBase`, when present, repeats this envelope's revision/mutation exactly.
7. Only the latest envelope retains an Undo snapshot, bounding storage to one
   extra tracking snapshot per mission.
8. A first public transition/details command may materialize `detected` as part
   of its pure candidate; it still produces one atomic revision and exact Undo.
9. Revision overflow fails before write.
10. A newly identified, valid details/restore intent commits one revision even
    when its candidate tracking is byte-equal to the base. The UI may suppress
    redundant commands, but storage semantics never depend on that projection.

The UI stores confirmed envelopes. Its public active map excludes tombstones;
its internal envelope map keeps tombstones for revision safety. A loaded
`undoBase` never creates a toast/Undo spontaneously after panel reload.

After every completed envelope commit, the worker broadcasts
`TRACKING_ENVELOPE_BROADCAST_V2`. Every open panel applies it by this exact
rule:

1. different `dataEpoch` -> ignore and require a fresh Load;
2. no local envelope or greater revision -> apply envelope projection;
3. equal revision and byte-equivalent canonical envelope -> no-op;
4. equal revision with different content -> protocol incident and fresh Load;
5. lower revision -> ignore as stale.

A broadcast updates confirmed state only. It never creates a success toast or
Undo. The request response or same-ID reconciliation remains the sole source of
success/Undo for the panel that originated the intent. This keeps other side
panels current without attributing the mutation to them.

## Durable mutation ledger

```ts
type TrackingMutationPhaseV2 =
  'prepared' | 'committed' | 'rejected' | 'failed' | 'cancelled' | 'worker_restarted';

interface PersistedTrackingMutationV2 {
  schemaVersion: 2;
  dataEpoch: TrackingDataEpoch;
  mutationId: MutationId;
  missionId: string;
  intent: TrackingMutationIntentV2;
  commandDigest: string;
  phase: TrackingMutationPhaseV2;
  ownerWorkerEpoch: MutationId;
  baseRevision: number;
  baseLastMutationId: MutationId | null;
  committedRevision: number | null;
  failureCode: ApplicationTrackingErrorCodeV2 | null;
  createdAt: number;
  settledAt: number | null;
}
```

The keyPath is globally unique `mutationId`. The pure Core canonicalizes the
bounded command and derives `commandDigest`; the machine only compares the
provided digest. Same ID + different epoch/mission/digest is `PROTOCOL_ERROR`
and writes no business record.

The ledger is retained until coordinated local reset. This makes old duplicate
delivery deterministic even after newer writes.

Storage diagnostics track envelope, tombstone, ledger and outbox row counts plus
estimated serialized bytes. The exact soft warning is crossed when either
estimated tracking bytes reach 64 MiB or `navigator.storage.estimate()` reports
`usage / quota >= 0.80`. Before Tx A and again before Tx B, Shell rejects a
write predicted to leave less than 1 MiB headroom. That rejection and every
`QuotaExceededError` settle as `PERSIST_FAILED`; neither compacts ledgers nor
tombstones. Unknown quota is not permission to compact: the attempted observed
transaction remains the truth source. No retention cleanup may make an old
mutation ID admissible again.

Steady-state validation is fail-closed by domain:

- an invalid v2 envelope, tracking-meta row or ledger row fences all tracking
  admission and surfaces `LOAD_FAILED`/`PERSIST_FAILED` plus diagnostics; it is
  never quarantined, deleted or silently normalized because it may be current
  idempotency evidence;
- an invalid disabled-outbox row is isolated in `quarantine` without changing
  the already committed local envelope/ledger or claiming remote delivery;
- unrelated invalid mission/profile records keep the existing migration/runtime
  quarantine policy and cannot authorize tracking repair.

The unused `trackStage`/default pipeline path is not part of the live scan
runtime and must not be turned into a new business mutation. Task 5b removes its
raw writer or makes the dead stage pure, then adds an architecture test proving
that no scan path writes tracking. Missing tracking remains logical `detected`
until an explicit public transition/details command materializes it. A tombstone
is never reopened by scan discovery.

## Transaction protocol

Validation order is mandatory:

1. Await the global tracking startup barrier: migration, epoch load and orphan
   checkpoint recovery.
2. Validate wire shape and derive the exact command digest without I/O.
3. Run a pure preflight against the actor's hydrated canonical. An already
   invalid domain/input/restore intent is rejected without any ledger row.
4. **Tx A** spans `mission_tracking` + `tracking_mutations`: reread the envelope,
   verify the actor base token, resolve an existing ledger, then insert
   `prepared` with the revision/lastMutation actually read. Tx A returns that
   immutable snapshot.
5. Core builds the candidate from the Tx A snapshot, outside IndexedDB and with
   injected time. Candidate construction performs no I/O.
6. **Tx B** atomically requires the same prepared owner/digest/mission/epoch,
   requires the envelope to equal the Tx A base token, reruns the pure domain/
   CAS guard, then writes envelope revision + 1 and ledger `committed`. The
   Task 5b production capability is disabled, so the outbox store is untouched.
7. Respond and broadcast only after `tx.oncomplete`.

If Tx A sees base drift, it writes one terminal ledger settlement in that same
transaction and returns the canonical reread:

- restore settles directly `rejected/STALE_UNDO` with fresh canonical;
- transition/details settle directly `rejected/APPLICATION_BUSY` with fresh
  canonical;
- no command is recomputed or replayed against the new base.

Tx B repeats the same comparison. A drift between A and B settles the existing
ledger as rejected in Tx B, writes no envelope and leaves the outbox store
untouched. If Tx B aborts, envelope/ledger atomicity holds and the outbox store
is still untouched; a best-effort Tx C moves `prepared` to `failed`. If Tx C
also fails, cold-start recovery classifies the orphan as `worker_restarted`.

Invalid commands never create `prepared`, and base drift never causes implicit
replay. A candidate is never computed from the stale preflight copy: only the
snapshot committed by Tx A may feed candidate construction.

### Pre-Tx-A technical failures

Pure shape/domain rejection is deterministic and creates no ledger. Technical
failure before Tx A (quota preflight, opener/gate/storage failure) follows a
different contract:

1. A failure may be announced as certain only after
   `RECORD_TERMINAL_SETTLEMENT` durably records the exact epoch, mission,
   mutation, intent, digest and failure.
2. Its result carries the effect `commandId`, current generation and
   `record_terminal` phase. Only that result can publish `not_committed`.
3. If the terminal row cannot be observed as committed, Core produces an
   `uncertain` settlement; the actor and tracking gate remain fenced. The UI may
   reconcile the same ID or reset, but neither bridge nor actor may replay it.
4. A later new explicit attempt uses a new mutation ID only after canonical
   Load/reconciliation. Delivery uncertainty keeps the original ID for control
   reads only, never for a second UPDATE.

Thus a certain `PERSIST_FAILED` cannot be followed by a late commit of the same
mutation ID. An unrecordable failure never pretends certainty.

## Per-mission actor and effect ownership

One XState actor represents one mission. Shell registers it synchronously before
the first await. Actor registry, dynamic creation, joining active promises and
stopping actors belong to Shell.

Machine states:

```text
unhydrated -> hydrating -> ready
ready -> recordingTerminal|preparing|reconciling|settling
preparing -> committing|cancelling|reconciling|settling
committing -> cancelling|reconciling|settling
cancelling -> cancelled|reconciling|settling
recordingTerminal|reconciling -> settling
settling|cancelled -> ready|failed after a local publication attempt
any non-final state -> invalidating -> invalidated on RESET
```

The executable machine defines discriminated SCREAMING_SNAKE_CASE events,
named pure guards and immutable `assign()` updates. It emits only these effect
commands for Shell:

- `READ_CANONICAL`;
- `RECORD_TERMINAL_SETTLEMENT`;
- `WRITE_PREPARED_CHECKPOINT`;
- `COMMIT_TRANSACTION`;
- `READ_SETTLEMENT`;
- `RECORD_CANCELLATION`;
- `ABORT_TRANSACTION`;
- `JOIN_ACTIVE`;
- `PUBLISH_SETTLEMENT`;
- `BROADCAST_ENVELOPE`;
- `INVALIDATE_ACTOR`.

No IndexedDB, runtime messaging, clock, UUID, crypto, toast or network call
lives in the machine.

Every effect command carries a monotonically increasing actor-local `commandId`
and the current operation `generation`. Shell must send `COMMAND_STARTED` before
I/O. That event atomically removes the command from the pending queue and records
its exact phase (`hydrate`, `tx_a`, `tx_b`, `record_terminal`, `record_cancel`,
`abort_tx_b`, `reconcile`, `publish`, `broadcast` or `invalidate`). Every async
result repeats command ID and generation and is accepted only for that running
phase. An early result, late result, wrong phase, wrong generation or already
completed command is ignored and cannot assign canonical state.

Completion atomically removes the running effect before enqueuing its successor:
Tx-A result -> candidate/Tx B, or terminal settlement; Tx-B result -> terminal
settlement. A terminal result also removes every pending/running write, abort or
cancellation command for the operation before publication. Entering
reconciliation increments generation, clears all obsolete operation commands
and running effects, then emits the sole `READ_SETTLEMENT` in the new generation.
Shell rechecks generation immediately before each effect; a removed/old command
must never execute.

Same-mission concurrency:

- same active ID + exact epoch/mission/intent/digest/base joins the active
  promise/effect;
- same ID with different scope, intent or digest returns `PROTOCOL_ERROR`; it is
  never downgraded to Busy and never writes;
- distinct ID while settling/preparing/committing/cancelling receives
  `APPLICATION_BUSY`, with no hidden queue;
- separate mission actors progress independently; short IndexedDB store locking
  is not a global application busy state;
- a Reconcile for the active exact identity joins; a distinct/unknown valid
  control identity performs a non-perturbative ledger read and receives exactly
  one settlement;
- late events with stale mutation ID, command ID, generation or epoch are
  ignored.

### Cancellation winner

Cancel and Reconcile carry and validate dataEpoch + missionId + mutationId +
intent + command digest and settle through `TRACKING_RECONCILED_V2`; there is no
optimistic cancel acknowledgement and the worker never invents a missing
intent/digest.

A cancel can win before Tx A only when the worker already owns the matching
active command context (same epoch, mission, mutation ID, intent and digest).
An unknown/preemptive cancel has no command to authenticate, creates no ledger
row and reads using the caller-supplied intent/digest. Absence settles as
`not_committed/TRANSPORT_ERROR`; it cannot reserve a mutation ID for a future
command. A different unknown control ID never perturbs the active mutation.

1. Before Tx A starts, Cancel wins immediately: no prepared row exists, so a
   durable `cancelled` ledger row is written and both original and Cancel calls
   settle `not_committed/CANCELLED` only after that transaction completes.
2. During Tx A, the actor records `cancelRequested`. When Tx A completes it
   must not launch candidate construction or Tx B; it moves the prepared row to
   `cancelled` in an observed transaction.
3. Between Tx A and Tx B, the same durable cancel settlement applies.
4. During Tx B, Shell calls `IDBTransaction.abort()` and waits for the terminal
   transaction event. `onabort` lets Cancel win, after which a separate observed
   transaction records `cancelled`. `oncomplete` or `InvalidStateError` means
   commit won and forces reconciliation; Cancel must return
   `committed_current` or `committed_superseded`.
5. After commit/ack, Cancel only reconciles the committed result.
6. A duplicate Cancel joins/reads the same settlement. If persisting
   `cancelled` fails, the mission remains fenced and reconciles; it never emits
   a false `CANCELLED`.

The original mutation caller and Cancel caller may receive separate envelopes,
but both derive from one durable settlement. No code may announce cancellation
before the ledger phase is committed.

## CAS Undo

Restore is valid only if all conditions pass in Core and again inside Tx B:

1. snapshot null or complete canonical record for the same mission;
2. current envelope exists in the same data epoch;
3. expected revision equals current revision;
4. expected mutation ID equals current last mutation ID;
5. requested previous snapshot equals current `undoBase.previousTracking`;
6. `undoBase` repeats the expected token.

Shape failure is `INVALID_RESTORE`. Token/snapshot drift is `STALE_UNDO`, writes
no envelope, leaves the outbox store untouched, refreshes canonical, removes
stale Undo and creates no success effect. A successful restore is a new
mutation/revision and may itself produce a redo token.

## Reconciliation and restart truth table

```ts
type TrackingReconciliationOutcomeV2 =
  'committed_current' | 'committed_superseded' | 'not_committed' | 'inconsistent' | 'uncertain';

interface TrackingSettlementIdentityV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch;
  missionId: string;
  mutationId: MutationId;
  intent: PublicTrackingMutationIntentV2;
  commandDigest: string;
  deduplicated: boolean;
}

interface CommittedCurrentSettlementV2 extends TrackingSettlementIdentityV2 {
  outcome: 'committed_current';
  canonical: PersistedTrackingEnvelopeV2;
  committedRevision: number;
  undo: TrackingUndoTokenV2;
  failure: null;
  broadcastRequired: boolean;
}

interface CommittedSupersededSettlementV2 extends TrackingSettlementIdentityV2 {
  outcome: 'committed_superseded';
  canonical: PersistedTrackingEnvelopeV2;
  committedRevision: number;
  undo: null;
  failure: null;
  broadcastRequired: false;
}

interface FailedTrackingSettlementV2 extends TrackingSettlementIdentityV2 {
  outcome: 'not_committed' | 'inconsistent' | 'uncertain';
  canonical: PersistedTrackingEnvelopeV2 | null;
  committedRevision: null;
  undo: null;
  failure: SerializedApplicationTrackingErrorV2;
  broadcastRequired: false;
}

type TrackingReconciliationV2 =
  CommittedCurrentSettlementV2 | CommittedSupersededSettlementV2 | FailedTrackingSettlementV2;
```

Strict coherence is mandatory before Core lets the machine assign a settlement:

- identity includes exact epoch, mission, mutation, intent and digest;
- every canonical envelope has the same scope and cannot regress the actor's
  revision; equal revision requires byte-equivalent canonical content;
- `committed_current` requires canonical revision/last mutation/intent, Undo and
  committed revision to agree exactly;
- `committed_superseded` requires a canonical revision strictly greater than the
  committed revision and has no Undo/failure/broadcast;
- `not_committed` has a typed failure and no committed revision/Undo;
- `inconsistent` has `PROTOCOL_ERROR`, fences the actor and never broadcasts;
- `uncertain` has `PERSIST_FAILED`, `TRANSPORT_ERROR` or `WORKER_RESTARTED`,
  fences the actor and never authorizes replay.

| Durable observation                                                            | Outcome                                                                | UI/effect                                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| ledger committed; canonical same revision and last mutation                    | `committed_current`                                                    | apply canonical; exact Undo; success once                |
| ledger committed; canonical newer                                              | `committed_superseded`                                                 | apply latest; no old success/Undo                        |
| old-epoch prepared; no commit                                                  | `not_committed` + `WORKER_RESTARTED`                                   | settle orphan; apply canonical; reject                   |
| current-worker prepared + registered active actor                              | join                                                                   | join active promise; caller-specific `deduplicated` flag |
| current-worker prepared without registered actor                               | `inconsistent` + `PROTOCOL_ERROR`                                      | fence mission; no wait/replay                            |
| ledger failed/rejected/cancelled                                               | `not_committed` + stored failure                                       | apply canonical; reject                                  |
| no ledger; canonical does not reference ID                                     | `not_committed` + `TRANSPORT_ERROR`                                    | apply canonical; reject; never replay                    |
| ledger/canonical cannot be read or terminal failure cannot be durably recorded | `uncertain` + typed technical failure                                  | preserve canonical; fence; reconcile/reset; never replay |
| committed revision lower than canonical                                        | `committed_superseded` only when canonical is valid and strictly newer | latest canonical; no Undo/success                        |
| committed revision greater than canonical                                      | `inconsistent` + `PROTOCOL_ERROR`                                      | fence mission                                            |
| equal revision but different lastMutationId                                    | `inconsistent` + `PROTOCOL_ERROR`                                      | fence mission                                            |
| committed ledger but envelope absent                                           | `inconsistent` + `PROTOCOL_ERROR`                                      | fence mission                                            |
| envelope references ID but ledger absent, epoch/kind/tracking impossible       | `inconsistent` + `PROTOCOL_ERROR`                                      | fence mission and domain diagnostics                     |

`committed_current` additionally requires exact mission, epoch, intent and
command digest. A current duplicate may receive `TRACKING_COMMITTED_V2` with
`deduplicated:true`; the admitted first caller receives `false`. Shell wraps
each joined caller separately instead of sharing one already-labelled response.
Every superseded or inconsistent duplicate uses `TRACKING_RECONCILED_V2`, never
an old committed envelope.

Crash proof:

| Crash point                | Durable state                                       | Deterministic recovery           |
| -------------------------- | --------------------------------------------------- | -------------------------------- |
| before Tx A                | no ledger, no commit                                | not observed / not committed     |
| after Tx A, before Tx B    | prepared only                                       | worker restarted / not committed |
| during Tx B                | IDB atomic choice                                   | prepared only or complete commit |
| after Tx B, before ack     | envelope + committed ledger; outbox store untouched | committed current                |
| ack lost, then newer write | committed ledger + newer canonical                  | committed superseded             |

Each worker lifetime has a `workerEpoch`. The startup barrier awaits migrations,
loads `dataEpoch`, then atomically settles `prepared` ledgers owned by older
workers before any tracking handler runs. Restart never replays a
candidate.

The barrier is observed and retryable, not a cached rejected promise:

- callers in one attempt share exactly one migration/recovery promise;
- `{ok:false}` is failure, never readiness;
- migration failure rejects current Loads as `LOAD_FAILED` and current mutation
  intents as their `PERSIST_FAILED`, before admission or ledger creation;
- failure while recovering ledgers rejects Loads as `LOAD_FAILED` and mutations
  as `WORKER_RESTARTED`, with the tracking domain still fenced;
- the next explicit command starts one new serialized attempt; success opens
  admission, another failure remains fenced;
- reset preempts/cancels gate retry and owns admission until its journal
  completes;
- no actor or tracking storage call can slip between migration success and
  recovery settlement.

On transport rejection, UI reconciles the same ID once. It never resends UPDATE.
The panel keeps only origin calls in a pending-effect map, capped at
`TRACKING_EFFECT_IDS_MAX_ITEMS`. It never evicts a pending ID: while 256 calls
are unsettled, a 257th is rejected locally before sending. Settlement removes
the pending entry only after its single caller promise has consumed the local
success/Undo; any late duplicate has no pending caller and can merge canonical
state but cannot emit an effect. Reload has no pending IDs and therefore does
not replay effects from persisted `undoBase`.

`PUBLISH_SETTLEMENT` waits only for one local runtime-send attempt, not for a
receiver acknowledgement. Shell reports `PUBLICATION_ATTEMPTED` with exact
command/generation/identity and `delivered:true|false`; either value is terminal
for the actor and releases it to `ready` or `failed`. A closed panel therefore
cannot block a mission. A worker restart invalidates the old publication
generation and releases the recovered actor; the original caller observes
transport loss and reconciles the same ID. Reconciliation read failure itself
returns an `uncertain` caller settlement and fences the actor instead of leaving
the promise silent.

## Error contract v2

```ts
type ApplicationTrackingErrorCodeV2 =
  | Task5ApplicationTrackingErrorCode
  | 'STALE_UNDO'
  | 'APPLICATION_BUSY'
  | 'CANCELLED'
  | 'WORKER_RESTARTED'
  | 'EPOCH_CHANGED';

interface SerializedApplicationTrackingErrorV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch | null;
  requestId: MutationId | null;
  code: ApplicationTrackingErrorCodeV2;
  intent: 'load' | PublicTrackingMutationIntentV2;
  missionId: string | null;
  mutationId: MutationId | null;
  message: string;
  recoverable: boolean;
}
```

Load has the exact `requestId` and null mission/mutation. Its epoch is exact
when startup reached metadata, and may be null only when migration/metadata
startup failed before an epoch could be established. Public mutation failures
have `requestId:null` and carry the exact epoch, mission and mutation identity.

| Code                 | Allowed intent                             | Recoverable | Stable message                                                                                           |
| -------------------- | ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| `LOAD_FAILED`        | load                                       | yes         | `Impossible de charger le suivi des candidatures.`                                                       |
| `PERSIST_FAILED`     | transition                                 | yes         | `Impossible d’enregistrer le nouveau statut.`                                                            |
| `PERSIST_FAILED`     | details                                    | yes         | `Impossible d’enregistrer les détails de suivi.`                                                         |
| `PERSIST_FAILED`     | restore                                    | yes         | `Impossible d’annuler la modification.`                                                                  |
| `INVALID_TRANSITION` | transition                                 | no          | `Ce changement de statut n’est pas autorisé.`                                                            |
| `INVALID_DETAILS`    | details                                    | no          | `Les détails de suivi sont invalides.`                                                                   |
| `INVALID_RESTORE`    | restore                                    | no          | `Cette annulation n’est pas valide.`                                                                     |
| `TRANSPORT_ERROR`    | `load`, `transition`, `details`, `restore` | yes         | `La confirmation du suivi n’a pas été reçue. Rechargez le suivi avant de réessayer.`                     |
| `PROTOCOL_ERROR`     | `load`, `transition`, `details`, `restore` | yes         | `La réponse du suivi est invalide. Rechargez le suivi avant de réessayer.`                               |
| `STALE_UNDO`         | restore                                    | no          | `Cette annulation n’est plus applicable car la candidature a changé.`                                    |
| `APPLICATION_BUSY`   | `transition`, `details`, `restore`         | yes         | `Une autre modification de cette candidature est en cours. Réessayez après son règlement.`               |
| `CANCELLED`          | `transition`, `details`, `restore`         | yes         | `La modification a été annulée avant son enregistrement.`                                                |
| `WORKER_RESTARTED`   | `transition`, `details`, `restore`         | yes         | `Le service de l’extension a redémarré avant de confirmer la modification. L’état local a été rechargé.` |
| `EPOCH_CHANGED`      | `transition`, `details`, `restore`         | yes         | `Les données locales ont été réinitialisées. Rechargez le suivi avant de continuer.`                     |

Recoverable means only that the listed explicit recovery may succeed. It never
authorizes automatic replay. `STALE_UNDO` is permanently non-recoverable for
that token.

## Connected dashboard seam — disabled in Task 5b

The reviewed production capability for Task 5b is exactly:

```ts
const PRODUCTION_CONNECTED_DASHBOARD_SYNC_CAPABILITY = { enabled: false } as const;
```

Premium state, dev mode and Supabase host permission are not activation proof.
No production outbox entry, enqueue attempt, sender, scheduler or network call
is permitted while this capability is false. Task 5b creates only a local
schema/store seam so the disabled boundary is explicit:

```ts
interface TrackingOutboxEntryV1 {
  schemaVersion: 1;
  dataEpoch: TrackingDataEpoch;
  mutationId: MutationId;
  missionId: string;
  localRevision: number;
  payload: MissionTracking | null;
  createdAt: number;
}
```

No Task 5b code instantiates this interface: Tx B proves zero outbox writes and
the extension proves zero dashboard fetches. Authentication, trusted account
identity, enqueue activation, remote payload, acknowledgements, leases, retry,
disable/resume and conflict policy belong to a separate future model and RED
suite. The existence of this store is not dashboard-delivery readiness.

## Migration and scan ownership

The DB transition is defined in `db-migration.model.md`:

- current implementation: DB 5 / data 2;
- Task 5b target: DB 6 / data 3;
- v6 adds tracking metadata, mutation ledger, outbox and moves the status index
  to `tracking.currentStatus`;
- data v3 wraps valid legacy trackings as revision 1 and quarantines every
  invalid tracking atomically, independently of the global reject-ratio policy.

All tracking writers must consume the actor transaction use case. Public raw
`saveTracking`/`deleteTracking` are removed or made private. The dead
`trackStage` raw writer is removed/made pure; future dashboard imports and
test/dev paths may not introduce a parallel writer.

## Coordinated reset

Reset is the separate critical workflow in `local-data-reset.model.md` and
`local-data-reset.machine.ts`. Tracking admission closes before quiescence;
actors receive epoch invalidation and no success is possible until DB deletion,
selective storage clearing, DB recreation and persistence of a fresh data epoch
have all completed. Its durable journal is written before destruction and
removed last. A blocked delete or partial post-delete recovery remains gated
and retryable; it never reports `reset:true`. Every late old-epoch request,
response, actor event and broadcast is ignored or rejected.

For each unique active, joined, reconciling or publication-pending command
identity, Core supplies one exact `not_committed/EPOCH_CHANGED` settlement with
the old command identity. `RESET_INVALIDATED` is accepted only if this list
covers every unique pending identity exactly once, `resetId` and `nextDataEpoch`
are canonical lowercase UUID v4 values, and `nextDataEpoch` differs from the
actor's current epoch. Shell's registry must fan that one identity settlement
out to every registered caller/promise for the identity and exhaust each caller
exactly once before reporting invalidation attempted. The actor increments
generation, removes every command/running effect, enters `invalidating`, and
emits `INVALIDATE_ACTOR` carrying those settlements plus `resetId` and the new
epoch. Shell attempts every caller settlement and removes the registry entry;
`INVALIDATION_ATTEMPTED` then moves the old actor to terminal `invalidated`. It
can never hydrate against the new dataset. A new-epoch actor is a distinct
instance.

## Forbidden transitions

- Any status edge absent from `APPLICATION_TRANSITIONS`.
- Candidate/UI success before a completed Tx B or deterministic reconciliation.
- `prepared` ledger for a command already known invalid.
- Recompute/replay after base drift, transport uncertainty or worker restart.
- Same-mission hidden queue for distinct intents.
- Restore without exact revision/mutation/snapshot CAS.
- Physical tombstone delete outside coordinated reset.
- Old duplicate response projecting an older envelope.
- Scan discovery materializing or reopening tracking without a user command.
- Outbox enqueue/network while production capability is disabled.
- Raw tracking writer outside the transaction use case.
- Result without an exact started command ID/generation/phase.
- Executable mutation command left pending/running after settlement or entry to
  reconciliation.
- Same mutation ID/different digest classified as Busy.
- Waiting for a panel/receiver acknowledgement to release the actor.
- Reset success when database deletion is blocked or any late old epoch remains
  able to mutate state.

## Invariants

1. Domain transitions equal `APPLICATION_TRANSITIONS`.
2. Every envelope write and committed ledger settlement is atomic; the disabled
   outbox store remains untouched.
3. Revision is strictly monotonic across tombstone/recreate.
4. A mutation ID commits business state at most once for a data epoch.
5. Same ID + different command/identity/epoch never writes business state.
6. Invalid command has no prepared checkpoint.
7. Base drift settles without candidate replay.
8. Confirmed UI never gets ahead of IndexedDB.
9. Undo follows exact CAS and is itself a revisioned mutation.
10. Worker restart reconciles; it never replays.
11. Superseded settlement never regresses UI or creates stale Undo.
12. Terminal status and null follow-up commit atomically.
13. History is non-empty, contiguous, transition-valid, time non-decreasing and
    ends at current status.
14. Core is pure; machine only emits effect commands; Shell owns all I/O.
15. Production dashboard capability false means zero outbox writes/network.
16. Data epoch invalidates every pre-reset actor/request/response.
17. Multi-panel broadcast is monotonic projection only; it never emits local
    success/Undo.
18. LLM output never decides a transition.
19. No async result can settle or advance an effect that was not started with
    the same command ID, generation and phase.
20. Reconciliation invalidates all obsolete mutation effects before reading
    durable truth; it cannot run beside a replayable write command.
21. Every valid Cancel/Reconcile caller supplies intent+digest and receives one
    join, protocol failure or durable/uncertain read settlement.
22. Publication completion means one local attempt, never receiver availability.
23. Reset settles every pending caller and permanently invalidates the old actor
    before the registry stops it.

## Required RED verification before implementation

### Machine and Core

- valid plans traverse ready -> preparing -> committing -> ready;
- invalid preflight publishes its typed failure without any ledger row or
  `prepared` checkpoint;
- same active ID joins; distinct same-mission ID is busy; other mission proceeds;
- same ID/different intent or digest returns Protocol, never Busy;
- every result before `COMMAND_STARTED`, with wrong command/phase/generation, or
  after completion is ignored and leaves the pending command/state unchanged;
- a valid Tx-A/Tx-B result removes its running effect atomically before the next
  command or settlement appears;
- after complete operation/publication, a new operation with the same mutation
  identity cannot authenticate any old command ID;
- entering reconciliation invalidates queued/running mutation effects before
  the new-generation read exists;
- active exact Reconcile joins; distinct/unknown Cancel or Reconcile reads and
  receives a settlement without perturbing the active mutation;
- stale async ID/epoch/command/generation event is ignored;
- cancel before commit aborts; cancel after commit reconciles;
- delivered and undelivered publication attempts both release the actor; restart
  during publication does not replay or block;
- reset attempts `EPOCH_CHANGED` for every caller before terminal invalidation;
- reset rejects a malformed/uppercase reset ID, malformed/uppercase next epoch,
  or a next epoch equal to the actor's current epoch;
- one reset settlement per unique joined identity is fanned out exactly once to
  every registered Shell caller for that identity;
- committed-current rejects Undo snapshots different from canonical undoBase in
  both null-to-record and record-to-null directions;
- durable pre-Tx-A `PERSIST_FAILED` rejects a substituted `CANCELLED` settlement;
- every forbidden event/state pair preserves context.

### Transaction storage

- revisions 1 -> 2; tombstone -> recreate remains monotonic;
- duplicate same ID/digest writes history once;
- old duplicate returns superseded/latest, never old envelope;
- same ID/different payload is protocol failure;
- stale Undo after write and after delete/recreate performs zero write;
- Tx B fault preserves envelope/ledger atomicity and leaves outbox untouched;
- Tx A and Tx B drift settle without replay;
- invalid command never leaves prepared;
- certain pre-Tx-A technical failure has a terminal ledger; unrecordable failure
  is uncertain/fenced and cannot replay;

### Restart and messaging

- crashes before Tx A, after Tx A, during Tx B, after Tx B and lost ack match the
  truth table;
- startup handlers and scan wait for migration/recovery barrier;
- v1 remains strict and every v1 write fails closed after migration;
- v2 schemas enforce UUID, epoch, identity, exact error matrix and sizes;
- old-epoch Load receives only correlated `TRACKING_EPOCH_CHANGED_V2`, then
  restarts with null epoch/cursor and no old data;
- UI transport failure reconciles once and never resends mutation;
- current, superseded and not-committed settlements project correctly;
- two panels converge through a higher-revision broadcast while only the
  originator receives success/Undo; stale/equal-conflicting broadcasts do not
  regress state;
- panel reload does not replay persisted success/Undo;
- settlement guards reject foreign canonical scope, lower revision,
  equal-revision conflict and incoherent outcome/error/Undo.

### Migration, scan, outbox and reset

- DB5/data2 legacy -> DB6/data3 envelope migration is idempotent;
- every invalid legacy tracking is quarantined in the migration transaction,
  regardless of reject ratio;
- nested status index, meta, ledger and outbox stores exist;
- dead `trackStage` no longer performs I/O and a static guard forbids raw
  tracking writers from every scan path;
- production disabled capability produces no outbox row or fetch;
- reset blocked delete preserves its journal and old epoch, reports failure;
- successful reset orders journal -> admission close -> quiesce -> close -> DB
  delete -> session clear -> selective local clear -> new DB/epoch -> broadcast
  -> journal removal;
- partial post-delete failure never reports success; late old-epoch events are
  rejected.

## Release evidence gate

Task 5b may be claimed implemented only when:

1. this model and machine receive independent approval;
2. RED tests fail for the intended missing behavior;
3. storage, bridge, background, scan and UI consume the machine/effects;
4. migration and reset safety tests pass;
5. targeted and full extension suites, typecheck, lint, formatting and build
   pass;
6. runtime extension evidence proves lost-ack reconciliation, stale Undo,
   same-mission concurrency, worker restart and all user-visible tabs.

Until then, only Task 5 wire-v1 truthfulness is current implementation evidence.
