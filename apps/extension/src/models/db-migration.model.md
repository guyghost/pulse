# DB Migration Model

Source of truth for the IndexedDB lifecycle and the applicative data migration
of MissionPulse. This model is the Task 5b contract. It supersedes the former
DB4/data1 description and must be reviewed before implementation.

The migration subsystem is Shell code. It may call pure parsers and canonical
builders from Core; Core never imports IndexedDB, Chrome APIs, clocks or UUID
generation. No LLM output can choose a migration transition or repair.

## Scope and release boundary

| Axis               | Persisted by                  | Implemented baseline | Task 5b target |
| ------------------ | ----------------------------- | -------------------- | -------------- |
| `DB_VERSION`       | IndexedDB native schema       | 5                    | 6              |
| `APP_DATA_VERSION` | `chrome.storage.local` marker | 2                    | 3              |

`DB_VERSION` changes only for object stores or indexes. `APP_DATA_VERSION`
changes only for persisted record shape. Both are monotonically increasing.
The marker for data 3 is written only after the data-v3 transaction completes.

Task 5b must support these entry points:

- a new profile with no database and no data marker;
- the implemented DB5/data2 baseline;
- a structurally upgraded DB6 whose data marker is still 2 after a crash;
- a fully current DB6/data3 no-op start;
- a retry after an open, migration, validation or recovery failure;
- reset preemption through `local-data-reset.model.md`.

Downgrade (`stored DB > 6` or `stored data > 3`) is fail-closed and
non-destructive. It never opens with a lower requested version.

## Structural registry

The ordered registry is append-only. Every migration receives the one active
version-change transaction created by `indexedDB.open`:

```ts
type StructuralMigration = (db: IDBDatabase, tx: IDBTransaction) => void;

request.onupgradeneeded = (event) => {
  const tx = request.transaction;
  if (!tx) throw new Error('Missing IndexedDB upgrade transaction');

  for (const migration of structuralMigrationsFor(event.oldVersion)) {
    migration(request.result, tx);
  }
};
```

A structural migration must use `tx.objectStore(name)` for an existing store.
It must not open a second transaction. Any throw aborts the whole version
change, so DB version 6 and its stores/indexes are committed together or not at
all.

### Exact schema after DB6

| Store                | Added | keyPath       | Index name -> keyPath                                  |
| -------------------- | ----- | ------------- | ------------------------------------------------------ |
| `missions`           | 1     | `id`          | `source` -> `source`; `scrapedAt` -> `scrapedAt`       |
| `profile`            | 1     | `id`          | —                                                      |
| `connector_status`   | 2     | `connectorId` | —                                                      |
| `generated_assets`   | 3     | `id`          | `missionId` -> `missionId`                             |
| `mission_tracking`   | 4     | `missionId`   | `currentStatus` -> `tracking.currentStatus`            |
| `quarantine`         | 5     | `id`          | `originalStore` -> `originalStore`                     |
| `tracking_meta`      | 6     | `key`         | —                                                      |
| `tracking_mutations` | 6     | `mutationId`  | `missionId` -> `missionId`; `phase` -> `phase`         |
| `tracking_outbox`    | 6     | `mutationId`  | `missionId` -> `missionId`; `dataEpoch` -> `dataEpoch` |

All indexes are non-unique. V6 deletes the v4 `currentStatus` index and creates
it again with nested keyPath `tracking.currentStatus`. A tombstone has null
`tracking` and is therefore absent from that index. V6 creates the three new
stores but writes no outbox row: production connected-dashboard capability is
disabled in Task 5b.

The single metadata record is:

```ts
interface TrackingMetaV1 {
  key: 'tracking_meta';
  schemaVersion: 1;
  dataEpoch: string; // injected UUID v4
  collectionRevision: number; // safe integer, starts at 0
}
```

`tracking_meta` contains exactly this one row. Its epoch identifies the whole
local dataset, not a service-worker lifetime. Envelopes, ledgers, outbox rows,
requests and responses repeat it. Worker lifetime uses a separate
`workerEpoch`.

## Central dataset-generation authority

`dataEpoch` is the generation of the complete local dataset, not a
tracking-only token. The strict `tracking_meta` singleton is its canonical
durable authority. Settings, profile, missions, scan checkpoints, generated
assets, semantic/TJM caches, seen/favorite state and every other local writer
are consumers of that authority even when their data lives outside IndexedDB.

Startup publishes one correlated bootstrap only after migration and recovery:

```ts
interface LocalDatasetBootstrapV1 {
  version: 1;
  requestId: string; // UUID v4 supplied by caller
  workerEpoch: string; // current worker UUID v4
  dataEpoch: string; // canonical tracking_meta epoch
}

interface DatasetMutationScopeV2 {
  version: 2;
  operationId: string; // immutable intent/operation identity
  dataEpoch: string;
}
```

Every bootstrap/load response echoes its request ID and `dataEpoch`. The panel
must discard mixed-request or mixed-epoch loads. Every mutative bridge command
after cutover carries `DatasetMutationScopeV2`; this includes tracking,
settings, profile save/import/sync, scan start/cancel/finalization and any dev
mutation path. A read may retain a compatibility projection, but **every v1
write without an epoch fails closed after data-v3 cutover**. The worker never
adds its current epoch to an old caller command on the caller's behalf.

Internal work uses a revocable lease:

```ts
interface DatasetWriteLeaseV1 {
  version: 1;
  leaseId: string; // injected UUID v4
  operationId: string;
  dataEpoch: string;
  authorityRevision: number; // worker-local safe integer
}
```

The service worker owns one `DatasetEpochAuthority` and one serialized commit
gate. Admission requires the requested epoch to equal canonical metadata and
binds a lease to the immutable operation. Immediately before every durable
commit, the writer enters that gate and revalidates lease ID, operation ID,
epoch and authority revision. It holds the gate until the IDB transaction or
Chrome-storage Promise settles. There is no async gap between revalidation and
commit admission.

Every unknown dependency bag, scope, opening proof, Reset request and
failure-fence command is captured once from exact own enumerable data
descriptors into a detached DTO. The dependency bag admits exactly the required
`workerEpoch`/`allocateLeaseId` keys and the optional
`initialAuthorityRevision` test seam; accessors, symbols and every other key are
invalid configuration. Every inspection that can invoke a Proxy internal
method, including `Array.isArray`, prototype lookup, key enumeration and
descriptor lookup, stays inside that fail-closed capture boundary. A revoked
Proxy therefore becomes the command's typed Authority validation error —
`INVALID_CONFIGURATION` for the dependency bag — and never leaks a raw
`TypeError` or changes authority state. The authority never rereads the raw
source after capture. Its validated `workerEpoch` and allocator are likewise
captured once at factory creation without executing a dependency getter.

`allocateLeaseId` is an injected but reentrant seam. Lease issuance captures the
exact open admission epoch and revision before calling it. After the allocator
returns, a valid fresh UUID is retained permanently for worker-lifetime
uniqueness, then admission status, epoch and revision are revalidated before
any lease or operation binding is created. The operation binding is then
revalidated too: if an exact active binding appeared through reentrance, the
outer fresh UUID stays burned and the already-issued canonical lease is
returned by identity; the outer call never replaces that binding. A rebound or
revoked binding follows the existing typed `OPERATION_REBOUND` or
`LEASE_REVOKED` result. If the allocator synchronously queues Reset or otherwise
changes any captured admission identity, issuance fails with typed
`ADMISSION_CLOSED`: no outer lease or binding is created, while the allocated
lease ID stays burned. Allocator collision also fails closed before an outer
operation binding and no retained ID is ever recycled, including after
revocation. If the allocator throws any JavaScript value, including a non-Error,
the outer issuance fails with typed `INVALID_LEASE_ID`; no raw value escapes and
no outer lease ID or binding is retained. Any separately completed reentrant
authority command keeps its own modeled result.

Reset acquires the same gate first, closes admission, increments authority
revision and revokes every lease before quiescence. A queued old callback can
therefore neither commit with its old lease nor obtain a fresh lease for its old
operation. This applies to scan mission transactions, session checkpoints,
terminal cleanup, profile/settings writes, runtime-effect compensation, cache
writes and background/alarm work.

A valid Reset request binds exactly `resetId`/`previousDataEpoch`/
`nextDataEpoch`. As soon as it takes a FIFO position, the authority enters
`reset_pending`: no new lease may be issued, while commits already queued before
that position retain FIFO eligibility against the still-current revision. The
eventual token repeats the three exact identities plus `workerEpoch` and the new
authority revision. Installation consumes that exact one-shot token and has no
free epoch argument. A collision with `workerEpoch`, the reset ID or a non-null
previous epoch is invalid before queuing.

Before a new reset journals or acquires that gate, its model performs a
read-only admission preflight. The central authority provides one atomic view of
reserved-reset-journal absence, the latest-only reset receipt and canonical
`tracking_meta.dataEpoch`. A fresh reset is admissible only when that epoch
equals the request's previous epoch and differs from its supplied next epoch. If
the canonical epoch already equals the same request's next epoch, preflight may
recognize clear-before-response only when the exact receipt matches every
original ID/epoch, `requestedAt` and committed phase, plus current DB6/data3
authority. It performs no second gate acquisition or destruction.

The receipt is the bounded Chrome-local system key
`missionpulse.localDataResetReceipt.v1`. Reset writes and strictly reads it back
under the same gate after Settings/alarm alignment and readiness but before the
journal's committed checkpoint. Journal clear therefore proves that the ordered
terminal path passed that exact receipt, even if legitimate same-epoch writes
later make stores non-empty or change Settings/alarm state. The next reset's
selective clear removes the old receipt before writing its own latest-only value.

This adds one bounded Chrome-storage key, accounted for by the Settings global
system quota reserve. It adds no IndexedDB object store, `tracking_meta` field,
`DB_VERSION` or `APP_DATA_VERSION`; DB/meta remain DB6/data3/schemaVersion 1.

Chrome-local settings repeat the epoch to close revision ABA across reset. The
single normative authority is `SettingsEnvelopeV2` exported by
`settings-persistence.contract.ts`; DB/reset code must import that contract and
must not define or copy a smaller storage variant:

```ts
import type { SettingsEnvelopeV2, SettingsSnapshotV1 } from './settings-persistence.contract';
```

The imported V2 envelope includes `version`, `dataEpoch`, `revision`,
`generation`, `settings`, `journal` and `outcomes`. Both revision and generation
are safe non-negative integers: revision tracks user-visible value commits;
generation also advances for journal/ledger-only changes.

During data-v3 startup, a valid settings V1 record retains its revision while a
valid unwrapped legacy record is wrapped at revision 0; both receive the
canonical epoch and initialize `generation: 0, journal: null, outcomes: []`.
Missing settings become validated defaults in that same complete form at
revision/generation 0. A strict
Settings V2 envelope is a retry no-op only when its epoch equals canonical
metadata and the shared validator accepts its settings, journal, outcome ledger
and causal relations; a mismatched/malformed V2 record fails closed. A settings
CAS requires epoch, revision and generation equality, and
compensation/reconciliation keep the same epoch. On reset, selective clear
removes settings and reinitialization writes defaults as the complete
`SettingsEnvelopeV2` with `nextDataEpoch`, revision/generation 0,
`journal: null` and `outcomes: []`, then reset-owned recovery settles the shared
journal and proves the alarm before readiness. Revision alone is never
cross-reset identity.
Only the fenced data-v3 startup path invokes the shared decoder with legacy
migration allowed. After marker 3, every handler uses its V2-only policy, so a
late legacy/missing-epoch write cannot be normalized into the fresh dataset.

`application-tracking.model.md` already carries the epoch on v2 mutations and
rejects v1 writes; its implementation must consume the central authority's
lease rather than inventing a tracking-local generation or gate.
The Task 6 settings machine/contract already consume `SettingsEnvelopeV2`;
`settings-persistence.model.md` must name that same authority before
implementation begins. This DB/reset revision does not edit the separate model.

The exact reset epoch broadcast payload is likewise defined only by
`local-data-reset-epoch.contract.ts`. Reset and Settings import its strict
parser. Settings-specific trusted-bootstrap/fence proof may wrap that payload,
but must not add fields to or redefine the neutral schema.

## Data-v3 migration

The applicative registry uses explicit target versions rather than array-index
arithmetic: its entries target data 2 (profile keywords) and data 3 (tracking
envelopes). Pending migrations are those with `targetVersion > storedVersion`,
in ascending order. An absent marker is treated as 0, so both idempotent entries
may run against a new empty database. The registry's greatest target must equal
`APP_DATA_VERSION`.

### Injected inputs

Shell injects one `now: number` and one UUID-v4 `dataEpoch` only if a valid
metadata row does not already exist. Re-running data v3 reuses the persisted
epoch. Core receives these values; it never calls `Date.now()`, `new Date()`,
`crypto.randomUUID()` or IndexedDB.

### One atomic tracking transaction

Data v3 runs one `readwrite` transaction spanning:

```text
mission_tracking + tracking_meta + quarantine
```

Within that transaction it:

1. reads `tracking_meta['tracking_meta']`;
2. creates the valid singleton with `collectionRevision: 0` when absent, or
   requires the existing row to be strictly valid;
3. opens a cursor over `mission_tracking` and classifies each row;
4. writes every canonical envelope or quarantine row through that same
   transaction;
5. completes only when the cursor and all writes complete.

The classification order is exact:

| Cursor value                                                                | Result                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| valid `PersistedTrackingEnvelopeV2`, same epoch, key equals `missionId`     | no-op                                          |
| envelope-shaped/schema-v2 value that is invalid, wrong-keyed or wrong-epoch | abort as critical corruption                   |
| valid legacy `MissionTracking`, key equals canonical `missionId`            | update to revision-1 record envelope           |
| anything else that is not envelope-shaped                                   | add one quarantine row, then `cursor.delete()` |

Legacy conversion writes:

```ts
{
  schemaVersion: 2,
  dataEpoch,
  missionId: legacy.missionId,
  kind: 'record',
  tracking: canonicalLegacyTracking,
  revision: 1,
  lastMutationId: null,
  lastMutationIntent: null,
  committedAt: lastHistoryTimestamp,
  undoBase: null,
}
```

The legacy parser requires a non-empty, contiguous, transition-valid,
time-nondecreasing history ending at `currentStatus`, bounded note and follow-up
fields, and exact equality between `cursor.primaryKey` and `missionId`.
`committedAt` is the final canonical history timestamp. There is no permissive
normalization of invalid history.

### Primary-key quarantine

An invalid legacy row is identified from the cursor primary key, never from an
untrusted `value.missionId`:

```ts
interface TrackingMigrationQuarantineV1 {
  id: ['data-v3', 'mission_tracking', IDBValidKey];
  originalStore: 'mission_tracking';
  originalPrimaryKey: IDBValidKey;
  sourceDataVersion: 2;
  targetDataVersion: 3;
  reasonCode: 'INVALID_LEGACY_TRACKING';
  raw: unknown;
  quarantinedAt: number;
}
```

The tuple ID preserves the typed primary key and avoids collisions from string
coercion. The migration uses `quarantine.add(row)`, never `put`. Only
`add.onsuccess` may queue `cursor.delete()` and continue the cursor. A
`ConstraintError` is never prevented or normalized: identical and different
tuple collisions both abort the entire data-v3 transaction. Existing
quarantine evidence and every source/meta/envelope row therefore remain byte
unchanged. Collision diagnostics keep admission fenced for explicit recovery;
the migration never stringifies, changes the key or overwrites proof. Every
non-colliding invalid legacy row is quarantined regardless of the generic 10%
reject-ratio policy.

### Crash and retry proof

| Crash point                               | Durable result                                 | Retry behavior                                                      |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| before/inside data-v3 transaction         | data-v2 tracking set and marker 2              | full transaction reruns                                             |
| transaction abort                         | no metadata/envelope/quarantine partial commit | full transaction reruns                                             |
| after transaction, before settings/marker | canonical rows + metadata, marker still 2      | rows no-op; complete settings envelope/marker retry with same epoch |
| after marker write                        | DB6/data3                                      | no-op verification/startup recovery                                 |

The `APP_DATA_VERSION = 3` marker is written only after `tx.oncomplete` and
successful shared-contract validation/read-back of the complete
`SettingsEnvelopeV2` with the same epoch, never from inside the cursor callback.
The read-back proves exact keys, valid settings, journal/ledger validity and
their causal consistency. A settings or marker-write failure leaves marker 2
and is a retryable migration failure; the completed IDB conversion is an
idempotent no-op on retry.

## Validation and corruption policy

Validation is domain-sensitive; a global ratio cannot erase idempotency proof.

| Domain/record                                | Invalid action                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| legacy tracking during data v3               | atomic primary-key quarantine and delete                                         |
| v2 envelope                                  | abort/fence tracking; preserve exact bytes                                       |
| `tracking_meta`                              | abort/fence tracking; preserve exact bytes                                       |
| mutation ledger                              | abort/fence tracking; preserve exact bytes                                       |
| disabled outbox seam                         | isolate row in quarantine; do not alter envelope/ledger or claim remote delivery |
| unrelated `missions` / `profile` legacy rows | existing bounded parse-on-read and generic reject-ratio quarantine policy        |

Envelope/meta/ledger corruption is fail-closed because those records are
current state, revision and at-most-once evidence. It is forbidden to delete,
quarantine, synthesize, normalize or replay them automatically. The startup
barrier stays fenced, diagnostics surface the exact store/key without raw user
content, and the UI may offer the explicit coordinated local reset. That reset
uses `previousDataEpoch: null` when strict metadata is absent or unreadable and
still installs a global old-dataset fence before destruction.

The generic `rejects > 10%` path applies only to non-critical stores. It never
authorizes `deleteDatabase`. Structural/open corruption and downgrade also fail
closed; destructive recovery belongs exclusively to a user-confirmed reset.

Post-migration verification checks at minimum:

- all DB6 stores, keyPaths and exact index keyPaths;
- exactly one strict `tracking_meta` row;
- every envelope and ledger has the metadata epoch and a matching primary key;
- `SettingsEnvelopeV2` has that same epoch, valid non-negative revision and
  generation, and a shared-contract-valid journal/outcome ledger;
- no `prepared` ledger owned by an older worker remains after startup recovery;
- the disabled outbox is empty for Task 5b production writes;
- the data-version marker is exactly 3 and the epoch authority is initialized
  before admission opens.

Reset-time reinitialization strictly verifies DB6/data3, metadata collection
revision zero and exactly zero rows in `connector_status`, `generated_assets`,
`mission_tracking`, `missions`, `profile`, `quarantine`,
`tracking_mutations` and `tracking_outbox`, followed by settled default Settings
and exact alarm proof before the receipt can be written. Post-clear recognition
does not repeat those mutable zero/default assertions: it validates the exact
terminal receipt plus current DB6/data3 metadata authority at the same next
epoch, allowing a later non-negative collection revision and legitimate E2
writes. Missing/mismatched receipt, schema/version drift or wrong epoch is a
protocol conflict, never permission to journal another destructive reset.

## Startup barrier

All mutative bridge handlers and all internal writers await one barrier. This
includes tracking actors/storage, scan orchestration/checkpoints, settings,
profile, caches and background/alarm work. Side-panel code reaches the barrier
through the service-worker bridge; it never opens IndexedDB directly.

```text
checking reset journal
  -> if absent, service a pending reset request's read-only preflight
       -> recognize exact post-clear completion, or
       -> admit only exact fresh request to reset journaling, or
       -> continue normal startup when no reset request is pending
  -> probing versions
  -> structural upgrade DB6 (if needed)
  -> data migration v3 (if needed)
  -> critical verification + dataEpoch load
  -> complete SettingsEnvelopeV2 wrap/read-back
  -> settle older-worker prepared ledgers atomically
  -> recover Settings journal + align/prove auto-scan alarm
  -> atomically open epoch authority
  -> publish correlated bootstrap
  -> ready
  -> on a fresh late caller, publish only its newly correlated bootstrap
```

Reset journal detection preempts every other stage and transfers ownership to
the reset workflow. No opener, actor, scan, settings/profile mutation or cache
writer can enter between migration success and prepared-ledger settlement,
settings verification/recovery and epoch-authority publication.

Journal absence is not completion by itself. On replay of an original reset
request after clear, the barrier exposes a read-only proof to the reset actor and
does not begin ordinary migration/admission concurrently. Exact next epoch,
matching latest receipt and DB6/data3 authority return recognized completion;
exact previous-epoch proof returns fresh admission; every third epoch,
mismatched receipt or malformed proof fails closed. A physical read failure is
explicitly retryable, with no automatic loop and no journal written.

`wrappingSettingsEnvelope` chooses the legacy decoder policy from the stored
marker: pre-v3 uses `allow_migration`; marker 3 uses `v2_only`. For a migration,
the complete shared envelope is read back before marker 3 is written. Thus a
crash after marker write restarts from strict V2 shape and still executes
Settings recovery. Marker 3 proves shape only; it never proves runtime-effect
alignment or admission.

### Normative Settings recovery stage

`recoveringSettings` invokes the shared Settings recovery barrier in startup
mode. It requires reset-journal absence; every valid reset phase, including
`committed`, transfers ownership to `resetOwned` before any migration/Load
effect. It then strictly decodes under the marker-selected policy, recovers any
Settings journal, installs a system `effects_pending` journal if `auto-scan`
differs, applies and reads the effect, clears that journal, and rereads the
settled envelope plus alarm under the same
`(attemptId, workerEpoch, dataEpoch)` fence.

The only success event is exact-key and fully correlated:

```ts
interface StartupSettingsRecoveredV1 {
  type: 'SETTINGS_RECOVERY_PASSED';
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  snapshot: SettingsSnapshotV1;
}
```

All five identities must equal the active attempt/command, and the shared
snapshot validator must prove `resetJournalAbsent:true`, a settled envelope
with the same epoch/generation and exact alarm proof. A self-correlated or stale
event is ignored. `openingAdmission` atomically opens the epoch authority only
after DB verification, prepared-ledger recovery and this proof are all retained
in attempt context. No lease, bootstrap or `ready` exists beforehand.

Startup failures carry a strict `attemptId` and stage. The stage union includes
`settings_recovery` and `failure_fence`; physical Settings/alarm failures are retryable but leave
admission closed, while malformed matching-ID proof is fail-closed and
non-destructive. `SETTINGS_RESET_IN_PROGRESS` is not an ordinary migration
failure: it routes to `resetOwned`. A later explicit caller/`RETRY` creates the
next serialized attempt; no automatic retry loop is authorized.

Once `ADMISSION_OPENED` has been retained, any publication failure first emits
the pure correlated `FENCE_STARTUP_FAILURE` command. Its future Shell port calls
`DatasetEpochAuthority.fenceFailure` under the central gate. `failed` and
`RETRY` remain unreachable until `FAILURE_FENCED` strictly proves the same
attempt/worker/epoch/open-proof, a higher authority revision, closed admission,
all leases revoked and zero active lease. A physical or ambiguous fence failure
stays in `failureFenceBlocked`, has no retry transition and may only transfer a
strictly correlated Reset owner.

The authority consumes the exact `FENCE_STARTUP_FAILURE` command, including its
bounded typed `failure`, and returns the exact deeply frozen
`DatasetStartupFailureFenceProofV1`; a free-form string is never an authority
cause. It retains the opening correlation privately until Reset or failure
fencing closes it. `fenceFailure` is forbidden in `reset_pending` and
`reset_owned` and cannot clear or replace a Reset token; Reset preemption owns
that fence path.

The barrier is serialized per attempt and retryable across attempts:

1. concurrent callers join exactly one in-flight attempt;
2. `MigrationResult { ok: false, ... }` is failure, not a resolved-ready value;
3. any failure settles all current waiters with typed load/persist failure and
   keeps admission fenced; if admission was already open, settlement waits for
   the exact closure/revocation proof;
4. the in-flight reference is cleared in `finally`;
5. the next explicit bootstrap, load or mutation command (including scan,
   settings and profile) starts one fresh attempt;
6. only `openingAdmission` after exact `SETTINGS_RECOVERY_PASSED` opens lease
   admission; the correlated bootstrap and `ready(dataEpoch, workerEpoch)` are
   published afterward;
7. reset request cancels/preempts retry scheduling and owns the fence until its
   durable journal is removed.
8. `ready` remains an active modeled service state: a duplicate request ID is
   idempotent, while a fresh late request returns only through a new exact
   bootstrap publication containing that request ID; no migration, recovery or
   admission step is replayed.
9. each pending/publication batch is capped at 64. Overflow is a typed,
   non-mutating backpressure result. A successful publication clears pending
   IDs and retains only the bounded last batch; an older duplicate is
   deterministically republished instead of requiring an unbounded history.

A failed promise is never cached as permanent startup state. Automatic retry
loops are forbidden: a retry is triggered by an explicit caller or reset resume
and remains serialized.

## State model

```text
idle
  -> resetGate
  -> probing -> upgradingStructure? -> migratingData?
  -> verifyingCriticalAndEpoch
  -> wrappingSettingsEnvelope
  -> recoveringPreparedTracking
  -> recoveringSettings
  -> openingAdmission
  -> publishingBootstrap
  -> ready -- fresh START --> publishingBootstrap --> ready

probing -> downgradeBlocked
active before admission -> failed
active after admission -> fencingFailure -> failed (only after fence proof)
fencingFailure -> failureFenceBlocked (ambiguous close; no retry)
failed -- explicit RETRY --> resetGate
active/ready/failed/failureFenceBlocked -- RESET_PREEMPTED --> resetOwned
```

### Executable startup statechart

The executable Model-gate for this workflow is split across:

- `dataset-startup.model.md` for reviewed behavior, crash semantics and
  invariants;
- `dataset-startup.contract.ts` for strict events, shared proof reuse and pure
  commands;
- `dataset-startup.logic.ts` for guards/actions;
- `dataset-startup.machine.ts` for the private XState v5 machine/actor and the
  safe `dispatch(unknown)` facade.

This statechart is not a runtime cutover. It imports the canonical Reset and
Settings contracts, performs no I/O, exposes no actor `send`, and has no
automatic retry. `startup-barrier.ts` will be the Shell adapter that executes
its commands after the Model and Review gates pass. Its read API projects a
deeply copied/frozen DTO; the native XState snapshot, context, machine and nodes
never cross the façade.

`ready` is non-terminal and serves late callers through the publication state
only. `downgradeBlocked` and `resetOwned` are terminal for one attempt.
`failed` is non-terminal at subsystem level because a later explicit caller can
create a new attempt after any required fence proof. `failureFenceBlocked`
forbids retry and remains fail-closed.

The exact event union is exported by `dataset-startup.contract.ts`. It includes
the Reset-gate clear/pending/journal outcomes, migration proofs, correlated
Settings recovery, admission, bootstrap publication, `STEP_FAILED`, explicit
`FAILURE_FENCED`, `RETRY` and `RESET_PREEMPTED`. Every async event carries
attempt, worker and command identity; Settings recovery also carries
epoch/request identity. Stale, foreign or shape-invalid events are rejected by
the private actor facade. Unknown arrays are captured only through exact own
descriptors, including `length`; source getters and `get` traps are never read.

Cancellation is owned only by coordinated reset. A normal migration cannot be
cancelled halfway and reported ready; IndexedDB transaction abort or completion
decides its durable result.

## Invariants

1. `DB_VERSION === STRUCTURAL_MIGRATIONS.length === 6`.
2. Data-migration targets are exactly `[2, 3]`, and their greatest target equals
   `APP_DATA_VERSION === 3`; registry length is not used as a version.
3. The v6 structural function receives `(db, tx)` and uses that exact upgrade
   transaction for existing-store index replacement.
4. A structural throw leaves no partial DB6 schema.
5. Data-v3 tracking conversion, metadata creation and legacy quarantine are one
   atomic transaction.
6. Quarantine identity comes from `cursor.primaryKey`, never corrupt payload;
   insertion uses `add`, and any tuple collision aborts the transaction rather
   than overwriting evidence.
7. Invalid legacy tracking is quarantined; invalid v2 envelope/meta/ledger is
   preserved and fences admission.
8. The data marker advances only after its migration transaction completes.
9. A DB6/data2 retry reuses the metadata epoch and performs no second semantic
   conversion.
10. One central opener owns every IndexedDB handle and closes it on
    `versionchange` and reset.
11. Startup readiness means migration, validation, epoch load, old prepared
    settlement, Settings journal recovery and exact alarm proof all succeeded.
12. `{ ok: false }`, blocked open and downgrade can never become readiness.
13. Failure does not poison future explicit retry. It cannot open admission;
    after admission was opened, retry requires strict closure and lease-revocation
    proof, while ambiguous fence outcome remains blocked.
14. No LLM participates in schema, validation, quarantine or recovery choices.
15. `dataEpoch` scopes the complete local dataset; every mutative message and
    internal writer proves it through a revocable lease.
16. The commit gate revalidates a lease immediately before commit and remains
    held until the durable boundary settles.
17. Settings persistence uses the sole shared `SettingsEnvelopeV2`, including
    its generation, atomic journal and outcome ledger; revision alone never
    authorizes a cross-reset write.
18. Reset revokes all leases before quiescence, so an old scan/checkpoint/cache/
    profile/settings callback performs zero post-reset write.
19. Marker 3 proves persisted shape only; no lease/bootstrap/ready is exposed
    before `SETTINGS_RECOVERY_PASSED` and `openingAdmission`.
20. Every reset journal phase, including `committed`, routes to reset ownership;
    startup never clears it or treats it as an ordinary migration failure.
21. A journal-absent reset request is preflighted before migration/admission and
    before reset journaling; only canonical previous-epoch proof admits a fresh
    reset.
22. Clear-before-response recognition requires canonical next epoch plus exact
    latest-only receipt and current DB6/data3 metadata authority, and executes
    zero second destructive effect even after legitimate E2 writes.
23. Journal absence, current request UUIDs, timestamps or mutable current store/
    Settings state alone never prove old completion; the strict original-request
    receipt is mandatory.
24. The receipt is written/read after Settings/alarm/readiness and before the
    journal committed checkpoint; the checkpoint and committed broadcast precede
    journal clear.
25. `ready` serves every fresh late request ID through modeled bootstrap
    publication only; duplicate IDs are idempotent and no earlier startup stage
    is replayed.
26. Strict unknown-array parsing reads the own `length` data descriptor and
    rejects values above the explicit maximum before allocation, `ownKeys` or a
    loop, then reads dense index descriptors without invoking a source getter or
    `get` trap.
27. Completion recognition adds one bounded Chrome-local system key but no
    DB/meta schema and cannot change `DB_VERSION === 6` or
    `APP_DATA_VERSION === 3`.
28. Startup pending IDs and retained bootstraps are each bounded to 64; every
    successful publication purges pending IDs and replaces, rather than appends
    to, the last published batch.
29. Lease allocation is reentrant-safe: a Reset queued from the allocator can
    burn the returned fresh UUID but creates no lease or operation binding, and
    that operation may bind only to a different lease ID after the next epoch is
    installed and admitted.
30. Same-operation allocation reentrance never overwrites a binding: the outer
    fresh UUID is burned and the exact active inner lease remains the sole
    canonical lease returned to both callers.
31. Factory and allocator boundaries are fail-closed: revoked/accessor
    dependency bags produce `INVALID_CONFIGURATION`, and every value thrown by
    `allocateLeaseId` produces `INVALID_LEASE_ID`; neither boundary leaks a raw
    JavaScript exception or creates an outer binding.

## Review checklist before implementation

- nominal: new DB and DB5/data2 both reach DB6/data3 with one fresh epoch;
- no-op: DB6/data3 changes no persisted row;
- malformed legacy: each primary key is quarantined atomically;
- quarantine tuple absent succeeds; identical/different collisions and
  `ConstraintError` abort with source/meta/envelopes/quarantine unchanged;
- critical corruption: exact envelope/meta/ledger bytes remain and admission is
  fenced;
- crash: every point in the crash table converges without a second revision;
- blocked/versionchange: handles close, timeout surfaces failure, retry is fresh;
- reset: every journal phase, including `committed`, preempts migration and no
  old/new epoch is admitted until reset finalization;
- reset replay after journal clear: same original next epoch plus exact
  terminal receipt and DB6/data3 authority returns recognized success with no
  gate, journal, delete, clear, reinitialize or broadcast, including after
  same-epoch data/Settings/alarm writes; foreign epoch or mismatched receipt
  fails closed;
- receipt ordering: bounded system quota covers latest-only put/read-back;
  failure is retryable, conflict is fail-closed, crash before checkpoint repeats
  receipt idempotently, and journal clear never precedes the exact receipt;
- fresh reset admission: canonical epoch must equal previous and differ from
  next; physical preflight failure is explicit-retry only and writes no journal;
- permission/quota/marker failure: no false `ready` result;
- concurrent callers: one attempt, one prepared recovery and one Settings
  recovery pass, same epoch result;
- outbox: schema exists but production writes remain exactly zero;
- old tracking v1/v2, settings revision-0 save, scan terminal/checkpoint,
  profile write and cache callback all perform zero writes after epoch change;
- a writer whose lease is revoked between computation and commit fails the
  final in-gate revalidation without opening its durable transaction;
- an allocator that synchronously queues Reset during `issueLease` leaves the
  authority `reset_pending`, returns no lease, creates no operation binding and
  permanently retains the allocated UUID; after installing/admitting the next
  epoch, the same operation ID can bind only through a different fresh UUID;
- an allocator that synchronously issues the same operation returns one exact
  canonical lease to both callers, never overwrites the inner binding and burns
  the unused outer UUID for worker lifetime;
- an allocator that throws `Error`, `undefined` or another primitive yields
  typed `INVALID_LEASE_ID`, while a revoked/accessor dependency bag yields typed
  `INVALID_CONFIGURATION` without executing a getter; no raw exception escapes;
- revoked Proxies at the scope, opening-proof, lease, Reset-request,
  failure-command and nested-failure boundaries yield their exact typed
  Authority validation errors, never a raw exception or state change;
- settings V1/bare/missing input becomes the exact shared envelope with
  `generation:0`, `journal:null` and `outcomes:[]`; malformed
  generation/journal/outcomes or a wrong epoch fail closed, and v1 writes
  without epoch fail closed after cutover;
- no `ADMISSION_OPENED`, lease, bootstrap or `ready` is accepted before an exact
  same-attempt/worker/epoch/request/command Settings snapshot and alarm proof;
- a `settings_recovery` physical failure is typed/retryable but never automatic;
  malformed matching-ID proof fails closed, while `SETTINGS_RESET_IN_PROGRESS`
  transfers to `resetOwned`.

### Cross-model trace R6 — startup migration without a panel

For new install, DB5/data2, DB6/data2 crash and DB6/data3, remove or corrupt the
auto-scan alarm and start two concurrent callers. They must join one attempt.
Assert no lease/admission/bootstrap before `SETTINGS_RECOVERY_PASSED`; crash and
explicitly retry at every system Settings-journal phase; require settled shared
envelope plus exact alarm proof before `openingAdmission` and `ready`. A reset
journal at every phase, especially `committed`, must route `resetOwned` without
starting a concurrent migration or returning ordinary failure. After a crash
between journal clear and response, replay the original reset request and prove
recognized completion from canonical next epoch plus exact latest-only receipt
and DB6/data3 authority, after injecting legitimate E2 writes; assert zero
second migration, deletion or schema write.

## Out of scope

- remote dashboard delivery, acknowledgement, leases and conflict policy;
- selective recovery UI for critical tracking corruption;
- cross-device backup/restore;
- changes to the application-tracking state machine beyond consuming the
  barrier and epoch contract.
