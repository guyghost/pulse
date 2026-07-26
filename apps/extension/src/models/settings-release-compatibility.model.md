# Settings Release Compatibility Model

Status: **approved on 2026-07-16** following the independent PASS of the exact
first-release catalogue candidate and empty-predecessor receipt described
below. Approval is limited to those exact canonical forms and digests.

Commit `6400c8ce093a858bb31ab6a1735bb18cab29bd6f` described
`9aceac90e02c09da73bb4f3e146da5fb13d250df41d1021a51059d614846c705`
as a historical registry content hash, but that commit contains no registry
blob that materializes the claim; the model blob itself has SHA-256
`fe6594112529da4bbfd44f7aa8d899cf3e0ba24f9b9bef35f147e4f6943864ad`.
The `9ace...` value is therefore an unverified legacy claim. It is neither
requalified nor used as an authorizing digest, review receipt or ancestry
proof. The independent PASS did not review or authorize `9ace...`.

The approved first-release inputs are source-controlled independently from the
runtime registry:

- the exact empty predecessor object is in
  `tests/fixtures/settings-release/connector-catalogue-history.predecessor.v1.json`
  with
  `predecessorJcsSha256=1033ecb4dd9e23ca70a0ebae009663ab2196397526b6a7cce8333653f80be0b9`;
- the exact candidate snapshot is in
  `tests/fixtures/settings-release/connector-catalogue-history.candidate.v1.json`
  with
  `registryJcsSha256=9a81cff62e4d3f270e64e0fa98934535c49da6689a64a395dddf8d9191670334`;

These hashes prove only the exact forms and self-consistency of the empty
first-release predecessor and current candidate. An empty predecessor cannot
prove approved ancestry. Extra keys invalidate either receipt. Independent
review of this exact model and candidate returned PASS on 2026-07-16 and
authorizes this exact first-release pair only; it does not create, infer or
retroactively approve any predecessor ancestry.

Source of truth for the bounded Settings and onboarding-consent workflow shipped
while Dataset DB6/data3 and the Settings V2 global-writer cutover remain
unavailable. This actor is a release boundary, not a substitute proof for the
future protocol in `settings-persistence.model.md`.

The service worker owns one XState v5 actor for this workflow. The side panel
uses the typed bridge. No LLM output, UI text, toast, storage event, or free-form
error decides a transition.

## Release boundary

The actor is the only release reader and writer for:

- the strict nine-field `AppSettings` value;
- the explicit onboarding-completed consent bit;
- the exact `auto-scan` alarm;
- the compatibility journal and bounded outcome ledger.

It stores those values atomically in one strict envelope at
`chrome.storage.local.missionpulse_settings_release_v1`. After a proved
migration, the legacy `settings` and `onboarding_completed` keys are neither
read nor written by release code. All scanner, notification, digest, theme,
connector and UI consumers obtain an immutable confirmed snapshot from this
actor. A build gate rejects any other release reader/writer for the envelope,
either legacy key or `auto-scan`.

The dormant V2 repositories, global reservation proofs and DatasetEpoch gate
must not be instantiated until every local and IndexedDB writer participates in
that authority. A missing global cutover is never normalized into
`allLocalWritersFenced:true`.

Backup import/restore and Local Data Reset are not shipped mutation entry
points. Export remains read-only. Their UI entry points stay hidden until their
own multi-resource transaction models are executable.

## Canonical envelope

```ts
interface SettingsReleaseEnvelopeV1 {
  version: 1;
  installId: string; // lower-case RFC 4122 UUID, created once
  nextIdentity: number; // safe integer in [1, Number.MAX_SAFE_INTEGER]
  revision: number; // durable terminal-settlement version
  generation: number; // every proved envelope replacement
  scanAckThrough: number; // greatest retired scan identity, starts at zero
  catalogFingerprint: string; // admitted historical/current digest during boot; current in ready
  legacyRetirement: 'pending_removal' | 'retired';
  confirmed: {
    settings: AppSettings;
    onboardingCompleted: boolean;
  };
  pending: null | {
    commandId: string; // `settings-release:${installId}:${identity}:command`
    requestId: string; // strict lower-case RFC 4122 UUID from the caller
    intentDigest: string; // lower-case SHA-256 of the canonical mutation intent
    kind: 'save_settings' | 'set_consent' | 'clear_consent';
    baseRevision: number;
    previous: ConfirmedSettingsReleaseState;
    candidate: ConfirmedSettingsReleaseState;
    previousAlarm: AutoScanExpectation;
    candidateAlarm: AutoScanExpectation;
    phase: 'reserved' | 'prepared' | 'effect_proved' | 'compensating';
    compensationReason: null | 'effect_compensated' | 'permission_lost' | 'recovered_previous';
  };
  outcomes: SettingsReleaseOutcome[]; // oldest-first, maximum 64
  outbox: null | {
    broadcastId: string;
    commandId: string;
    reason: 'mutation_settlement' | 'catalog_migration';
    snapshot: SettingsReleaseSnapshot;
  };
  scanAdmission: null | {
    identity: number;
    token: string; // `settings-release:${installId}:${identity}:scan`
    snapshot: SettingsReleaseSnapshot;
    snapshotDigest: string;
    phase: 'reserved' | 'accepted';
    result: null | { status: 'accepted'; operationId: `missionpulse-scan:${string}:${number}` };
  };
}
```

The value is an ordinary, detached object with exactly these keys: no unknown
keys, holes, symbols, accessors, custom prototype, `NaN`, infinities or unsafe
integers. Nested values have the same constraint. `revision` and `generation`
start at zero and never decrease. `scanAckThrough` is a safe integer, never
exceeds the greatest allocated identity, advances only while atomically clearing
that scan record, and never decreases. A command that lacks the complete
branch-specific counter budget defined below is rejected as
`identity_exhausted` before an effect and the actor blocks; no random fallback
loop exists.

Every intended full-envelope replacement requires the exact previous
generation and increments `generation` by exactly one, including reserve,
prepare, phase proof, compensation, outbox clearing and scan-admission changes.
At most one of `pending`, `outbox` and `scanAdmission` is non-null. A rejected
write continues only when read-back equals the complete intended next
generation. It returns to the prior state only when read-back equals the
complete previous generation; any other value blocks.

`compensationReason` is non-null exactly in phase `compensating`; every other
phase requires `null`. This makes restart settlement independent of error text.
For a scan admission, `result` is null exactly in phase `reserved`; phase
`accepted` stores the exact accepted operation ID returned by the port. A
skipped result is never persisted as `accepted` and clears the lease directly.

The actor reserves one `commandId` by atomically incrementing `nextIdentity`
and `generation`, installing `pending.phase:'reserved'`, then reading the
complete envelope back. Command IDs therefore cannot be reused within an
installation, including after ledger eviction or a service-worker restart.
`requestId` is correlation and idempotency input; it is never transition
authority by itself. Every retained identity across pending and outcomes must
be globally disjoint. Reusing a retained `requestId` with a different canonical
intent digest is `request_identity_conflict` and blocks before any effect.

An outcome contains exactly:

```ts
type SettingsReleaseOutcomeBase = {
  commandId: string;
  requestId: string;
  intentDigest: string;
  kind: SettingsReleaseMutationKind;
  settledRevision: number;
  settledGeneration: number;
  snapshot: SettingsReleaseSnapshot;
};

type SettingsReleaseOutcome = SettingsReleaseOutcomeBase &
  (
    | { status: 'committed'; reason: 'committed' | 'recovered_candidate' }
    | {
        status: 'not_committed';
        reason:
          'permission_missing' | 'permission_unknown' | 'storage_failed' | 'recovered_previous';
      }
    | {
        status: 'compensated';
        reason: 'permission_lost' | 'effect_compensated';
      }
  );
```

Settlement appends the outcome and evicts only the oldest settled outcome above
64 entries. Every durable terminal settlement, including compensation and
recovered-previous, increments `revision` exactly once even when confirmed
business values are unchanged. The stored outcome snapshot is therefore exact,
not reconstructed from current state. A repeated retained `requestId` returns
that outcome without allocating an identity or repeating an effect. After
eviction, the original `baseRevision` is necessarily older than the settlement
revision, so the request returns conflict and cannot replay.

## Canonical settings and migration

```ts
type ConnectorCatalogueTupleV1 = readonly [
  connectorId: string,
  included: boolean,
  sortedHostPermissions: readonly string[],
];

interface ConnectorCatalogueHistoryV1 {
  schema: 'missionpulse.connector-catalogue-history';
  version: 1;
  catalogues: readonly {
    catalogFingerprint: string; // exact lower-case SHA-256 derived below
    tuples: readonly ConnectorCatalogueTupleV1[];
  }[];
}

declare function decodeCatalogueSettings(
  raw: unknown,
  tuples: readonly ConnectorCatalogueTupleV1[]
): AppSettings | null;
```

The committed, versioned `ConnectorCatalogueHistoryV1` registry is the only
authority for decoding a non-current envelope fingerprint. Its catalogue
entries are nonempty, unique by fingerprint, immutable and append-only across
released versions; the current catalogue is present exactly once. Each tuple
array is unique and ordered by strictly increasing connector ID using raw
UTF-8/ASCII lexical comparison (`left < right`), so the present order is
`cherry-pick, collective, free-work, hiway, lehibou, malt`. Each permission
array is unique and sorted by the same comparison, and every fingerprint is
independently recomputed from its exact tuples by the formula below. A duplicate,
malformed, mismatched or unknown
fingerprint blocks before legacy-key normalization, pending/outbox recovery,
scan query/admission, alarm mutation or broadcast. Environment, storage and
runtime input cannot add a history entry.

The release gate compares the candidate registry to the exact registry blob in
the immediately preceding released source. If the previous array has length
`N`, the candidate length is at least `N` and, for every index below `N`, JCS of
the complete candidate entry must equal JCS of the complete previous entry
byte-for-byte at the same index. No old entry or tuple may be removed, rewritten
or reordered; new entries may be appended only at indices `N...`. A first
release requires an explicit empty predecessor receipt. Runtime storage cannot
satisfy or bypass this source-history gate.

For a recognized historical fingerprint, all values retained in that envelope
and any still-present legacy settings key are decoded and normalized against
that exact historical tuple array first. Only the later catalogue-migration
transition may project the historically valid confirmed value into the current
catalogue. `RECOGNIZED_CONNECTOR_IDS` is therefore the union of IDs in this
committed registry, never an unversioned hand-maintained allowlist; recognition
alone does not authorize an unknown fingerprint.

`decodeCatalogueSettings` is a pure strict decoder parameterized by exactly one
registry tuple array. It accepts the nine `AppSettings` keys and their documented
bounds only when `enabledConnectors` is unique, ordered by that tuple array and
contains only its `included:true` connector IDs. It never consults the current
build catalogue implicitly. An envelope may therefore hold a valid historical
settings value while boot/recovery is in `catalog_migration_mode`; its pending,
confirmed, outcome, outbox and scan values must all decode under the same
fingerprint. The invariant “connectors shipped in this build” begins only after
the catalogue-projection transition. Every public `ready` snapshot and every
new mutation then uses the current catalogue fingerprint and current tuple
decoder; a historical fingerprint or value can never reach `ready`.

The current build computes
`catalogFingerprint` from the versioned ordered tuples
`[connectorId,included,sortedHostPermissions]`. Unknown IDs never enter a
migration. The fingerprint is the lower-case SHA-256 of the UTF-8 bytes of
`JSON.stringify(['missionpulse-connector-catalog',1,tuples])`; tuple and
permission order are fixed before serialization. An envelope with an older
fingerprint is parsed only as migration input against the historical registry;
it is never exposed as a canonical current-build snapshot.

Boot follows one unambiguous branch:

1. a valid release envelope is authoritative only when its
   `legacyRetirement` proof is consistent with the exact absence/presence of the
   legacy keys;
2. when the envelope is absent, read both legacy keys exactly once;
3. absent legacy settings produce strict build defaults; an exact legacy
   eight-field value may add only `theme:'system'`; a strict nine-field value is
   copied unchanged;
4. only catalogue-known but build-excluded connector IDs may be removed during
   this one migration, in catalogue order; an unknown ID or any other malformed
   non-null legacy value blocks boot;
5. absent legacy consent means `false`; only exact booleans are accepted;
6. create/read back the envelope with `legacyRetirement:'pending_removal'`,
   reconcile/read back the exact alarm, then remove both legacy keys and prove
   their exact absence;
7. replace/read back the envelope with `legacyRetirement:'retired'` and a new
   generation only after that absence proof;
8. after a restart in `pending_removal`, each legacy key is checked
   independently: absence is accepted because it proves either historical
   absence or completed removal, while every still-present value must normalize
   exactly to the envelope's corresponding confirmed value under the one
   permitted transform. Thus zero, one or two present keys resume safely;
   drift, an unreadable present value or a reappearing key after `retired`
   blocks;
9. when a valid envelope has an older catalogue fingerprint, boot permits one
   deterministic transform: remove enabled IDs that are recognized historically
   but not shipped now, preserve the catalogue order of the rest, increment
   revision/generation, and read the whole envelope back. The alarm expectation
   is unchanged. An unrecognized ID or any other change blocks. Only then store
   the current fingerprint and continue reconciliation.

Catalogue migration is ordered before any old-catalogue value can be published
or admitted. Boot marks an old fingerprint as `catalog_migration_mode` before
choosing recovery:

- an old `pending` transaction is recovered against its historical recognized
  catalogue, but its settlement outbox is suppressed from publication;
- an old `scanAdmission` is handled only by the query-only scan port. For phase
  `reserved`, an accepted/skipped result is retired and `not_found` proves it
  was never bound, retiring it as `catalog_changed`. For phase `accepted`, only
  the exact stored accepted operation ID may retire it; skipped, `not_found`,
  `retired` or a different operation ID is contradictory and blocks. The
  admission-capable port is never called with an old snapshot;
- an old outbox is superseded without publication;
- after those records are absent, the transform intersects only `confirmed`,
  increments revision, allocates one internal catalogue command identity,
  clears the historical outcome ledger, installs the current fingerprint and
  creates one current-catalogue outbox. Exact retries from the cleared ledger
  carry the old base revision and therefore return conflict at the new revision;
  they cannot replay an effect.

The catalogue transform has no other legal input and never rewrites a pending,
historical outcome, outbox or scan snapshot in place. It proves the unchanged
alarm expectation before its new outbox may publish. No old-catalogue snapshot
is returned to a panel, notification, digest or scan consumer.

Migration never broadcasts or exposes defaults before the envelope, alarm and
legacy-key retirement are all proved. Invalid non-null state is never silently
repaired. Every bridge object is detached and validated again.

## Machine

```text
booting
  -> migrating                 ENVELOPE_ABSENT
  -> recovering                PENDING_FOUND
  -> retiringScanAdmission     OLD_CATALOG_SCAN_ADMISSION_FOUND
  -> recoveringScan            SCAN_ADMISSION_FOUND
  -> catalogMigrating          OLD_CATALOG_OUTBOX_OR_CONFIRMED_FOUND
  -> broadcasting              OUTBOX_FOUND
  -> reconciling               CONFIRMED_FOUND
  -> blocked                   BOOT_PROOF_FAILED

migrating
  -> reconciling               MIGRATION_PROVED
  -> blocked                   MIGRATION_FAILED

recovering
  -> broadcasting              RECOVERY_SETTLED
  -> catalogMigrating          OLD_CATALOG_RECOVERY_SETTLED
  -> blocked                   RECOVERY_AMBIGUOUS

recoveringScan
  -> reconciling               SCAN_RECOVERY_SETTLED
  -> blocked                   SCAN_RECOVERY_UNKNOWN

retiringScanAdmission
  -> catalogMigrating          OLD_SCAN_RESULT_RETIRED_OR_NOT_FOUND
  -> blocked                   OLD_SCAN_RESULT_UNKNOWN

catalogMigrating
  -> reconciling               CURRENT_CATALOG_OUTBOX_PROVED
  -> blocked                   CATALOG_MIGRATION_AMBIGUOUS

reconciling
  -> ready                     ALARM_AND_STORAGE_PROVED
  -> broadcasting              ALARM_PROVED_WITH_OUTBOX
  -> blocked                   RECONCILIATION_FAILED

ready
  -> reserving                 MUTATION_ADMITTED
  -> admittingScan             AUTO_SCAN_FIRED
  -> ready                     READ_REQUESTED | DUPLICATE_REQUEST

reserving
  -> preparing                 IDENTITY_RESERVED
  -> ready                     RESERVATION_NOT_COMMITTED
  -> blocked                   RESERVATION_AMBIGUOUS | IDENTITY_EXHAUSTED

preparing
  -> applyingEffect            PREPARE_PROVED
  -> broadcasting              POST_RESERVATION_SETTLEMENT_PROVED
  -> blocked                   PREPARE_AMBIGUOUS

applyingEffect
  -> settling                  EFFECT_AND_PERMISSION_PROVED
  -> compensating              EFFECT_OR_PERMISSION_FAILED

settling
  -> broadcasting              COMMIT_PROVED
  -> recovering                COMMIT_REJECTED_WITH_PENDING_READBACK
  -> blocked                   COMMIT_AMBIGUOUS

compensating
  -> broadcasting              COMPENSATION_PROVED
  -> blocked                   COMPENSATION_AMBIGUOUS

broadcasting
  -> reconciling               OUTBOX_ATTEMPT_PROVED_AND_CLEARED
  -> blocked                   OUTBOX_TRANSPORT_OR_CLEAR_AMBIGUOUS

admittingScan
  -> ready                     SCAN_ADMITTED | SCAN_SKIPPED | ALARM_REPAIRED
  -> blocked                   SCAN_PROOF_AMBIGUOUS | SCAN_ADMISSION_TIMEOUT

blocked
  -> booting                   EXPLICIT_RETRY_REQUESTED
```

One FIFO owned by the actor orders bridge commands, consent commands, alarm
fires and internal snapshot reads. It holds at most 32 in-memory entries,
including a maximum of 8 buffered startup entries. Only the head becomes
durably admitted when its `pending` or `scanAdmission` record is proved. Entries
behind the head are transport work, not durable business claims.

Capacity rejection is transport state, never a business outcome and never a
canonical snapshot. It is exactly:

```ts
type SettingsReleaseQueueRejection = {
  status: 'transport_rejected';
  reason: 'queue_full';
  commandType: 'mutation' | 'read' | 'auto_scan_fire';
  correlationId: string | null;
  snapshot: null;
};
```

An excess mutation or read receives that typed response. An excess
`AUTO_SCAN_FIRED` produces the same internal disposition with `correlationId`
equal to `auto-scan:${scheduledTimeMs}`, where `scheduledTimeMs` is the exact
non-negative safe integer carried by the validated Chrome alarm event, and no
scan effect; the recurring alarm remains unchanged. `EXPLICIT_RETRY_REQUESTED`
does not use the business FIFO: one separate blocked-state control latch is
always reserved. Its result is exactly
`{status:'retry_accepted'|'retry_already_queued'|'retry_not_applicable',snapshot:null}`.
The first request is accepted, concurrent duplicates are coalesced, and a
request outside `blocked` is not applicable; none mutates business state.

If the actor enters `blocked`, every still-connected queued caller receives
`blocked/actor_blocked`. If the worker dies first, Chrome closes their message
ports: the facade treats that as transport loss, retains the exact request
payload and retries once with the same `requestId` after a fresh successful
boot. It never invents a business result. There is no parallel Settings
mutation and two actors cannot coexist in one worker lifetime. Startup installs
listeners immediately but no read, message or alarm fire bypasses recovery.

## Confirmed snapshots and broadcasts

The public immutable snapshot is:

```ts
interface SettingsReleaseSnapshot {
  settings: AppSettings;
  onboardingCompleted: boolean;
  revision: number;
  generation: number;
}
```

`GET_SETTINGS` and `GET_ONBOARDING_COMPLETED` return data from the same snapshot
or a typed failure; neither substitutes defaults. Scan, notification and digest
reads use the same actor port.

Every mutation command contains exact `{requestId, baseRevision, ...intent}`.
Settings intent contains a whole strict candidate. Consent intent contains only
the exact target boolean. Its union is discriminated before digesting:
`{kind:'set_consent',targetConsent:true}` or
`{kind:'clear_consent',targetConsent:false}`; either mismatched pair is a
malformed bridge request and never enters the FIFO. The current confirmed
revision must equal `baseRevision`; otherwise the terminal result is
`not_admitted/conflict` and includes the current canonical snapshot. A no-op returns
`not_admitted/already_confirmed` without alarm or storage effects.

Every durable settlement atomically stores its outcome and one outbox record.
The outbox broadcasts exactly:

```ts
{
  type: 'SETTINGS_RELEASE_UPDATED',
  payload: {
    snapshot: SettingsReleaseSnapshot;
    commandId: string;
    broadcastId: string; // `${commandId}:broadcast`
  }
}
```

Each panel remembers the greatest `(revision, generation)` it accepted. It
compares revision first and generation second, accepts only a lexicographically
greater tuple, treats an equal tuple with identical content as a duplicate, and
rejects a lesser tuple or equal tuple with different content. The same merge
function handles GET, broadcast and correlated results: every command promise
still reaches its terminal result, but an older correlated snapshot never
replaces a newer accepted snapshot.

`BroadcastPort.publish` returns exactly `delivered` or `no_receiver` after the
Chrome send attempt, or throws on a transport failure. Both exact results allow
the actor to clear/read back the outbox; `no_receiver` is safe because every new
or reconnected panel must GET and merge the canonical snapshot before rendering.
A transport failure or ambiguous outbox clear blocks with the outbox retained.
A crash before publish replays it at boot; a crash after publish but before
clear may duplicate it, which panel tuple/broadcast-ID deduplication handles.
Thus a commit cannot fall into an unmodelled commit-to-broadcast gap.

The correlated mutation result is an exact discriminated union:

```ts
type SettingsReleaseMutationResult =
  | {
      status: 'settled';
      outcome: SettingsReleaseOutcome;
    }
  | {
      status: 'not_admitted';
      requestId: string;
      commandId: null;
      reason:
        | 'already_confirmed'
        | 'conflict'
        | 'permission_missing'
        | 'permission_unknown'
        | 'storage_failed';
      snapshot: SettingsReleaseSnapshot;
    }
  | {
      status: 'blocked';
      requestId: string;
      commandId: string | null;
      reason:
        | 'identity_exhausted'
        | 'request_identity_conflict'
        | 'actor_blocked'
        | 'storage_ambiguous'
        | 'effect_ambiguous'
        | 'broadcast_ambiguous'
        | 'scan_admission_unknown';
      snapshot: null;
    };
```

The bridge schema rejects every missing/extra field or inconsistent
status/reason/identity combination. A typed failure never carries a fabricated
snapshot. Recovered outcomes use the same `settled` branch, so
`recovered_previous`, `recovered_candidate` and compensation are representable
without translation. Reads use a separate exact union of
`{status:'confirmed',snapshot}` or
`{status:'unavailable',reason:'actor_blocked'|'storage_ambiguous',snapshot:null}`;
FIFO overflow uses `SettingsReleaseQueueRejection` instead. Alarm fires and the
retry control latch have the exact dispositions defined above and are never
translated into mutation outcomes.

## Exact alarm expectation

```ts
effectiveAutoScan = confirmed.onboardingCompleted === true && confirmed.settings.autoScan === true;

effectiveAutoScan
  ? { name: 'auto-scan', periodInMinutes: confirmed.settings.scanIntervalMinutes }
  : { name: 'auto-scan', absent: true };
```

The actor may create/replace or clear only `auto-scan`. Every operation is
followed by `chrome.alarms.get('auto-scan')`; success requires exact presence,
name and period, or exact absence. It never calls `clearAll` and never treats a
resolved Chrome Promise as proof without read-back.

## Mutation transaction

The intent digest is versioned and byte-exact. After strict validation, build
one JSON array with no optional values:

```ts
[
  'missionpulse-settings-release-intent',
  1,
  kind,
  baseRevision,
  kind === 'save_settings'
    ? [
        scanIntervalMinutes,
        enabledConnectors, // already catalogue-ordered
        notifications,
        autoScan,
        maxSemanticPerScan,
        notificationScoreThreshold,
        respectRateLimits,
        customDelayMs,
        theme,
      ]
    : targetConsent,
];
```

Hash the UTF-8 bytes of ECMAScript `JSON.stringify` for that array with SHA-256
and encode 64 lower-case hexadecimal characters. A serialization or digest
failure blocks before reservation. No object-key order, locale or whitespace is
implementation-defined.

Before the first external effect or envelope replacement, the actor proves the
maximum remaining counter budget for the selected branch. A generation budget
includes all phase writes, terminal settlement and durable outbox/lease clear;
the actor may consume fewer increments but never relies on that after an effect.

| Branch at admission/recovery                  | Generation room | Revision room | Identity room |
| --------------------------------------------- | --------------- | ------------- | ------------- |
| New mutation, including compensation          | 5               | 1             | 1             |
| New scan admission, accepted path             | 3               | 0             | 1             |
| Recover `reserved`/`prepared`/`effect_proved` | 3               | 1             | 0             |
| Recover `compensating`                        | 2               | 1             | 0             |
| Publish and clear an existing outbox          | 1               | 0             | 0             |
| Recover current-catalogue reserved scan       | 2               | 0             | 0             |
| Retire old scan then catalogue-migrate        | 3               | 1             | 1             |
| Catalogue-migrate without a scan record       | 2               | 1             | 1             |

“Room N” means the current value is at most
`Number.MAX_SAFE_INTEGER - N`; identity room one additionally requires
`nextIdentity <= Number.MAX_SAFE_INTEGER - 1`. If several boot actions remain,
their budgets are summed before the first one. Failure enters `blocked` before
an alarm mutation, permission-capable scan call, broadcast or
candidate-specific storage write. In particular a scan can never be accepted
unless both its `accepted` phase write and atomic clear/`scanAckThrough` advance
remain representable.

For one FIFO head:

1. strictly reread the envelope and require the in-memory snapshot to match it;
2. validate the complete intent, compute its canonical digest, and return an
   existing outcome only for an exact retained `(requestId,intentDigest)`;
3. require `baseRevision` to equal the confirmed revision; a mismatch returns
   conflict with the canonical snapshot, and an exact no-op returns
   already-confirmed, both before reservation;
4. for newly enabled connectors, compute the exact sorted host-origin union and
   require `chrome.permissions.contains` to return `true`; never request a
   permission;
5. reserve a unique command identity and `pending.phase:'reserved'` by a
   full-envelope write/read-back; the pending record includes the immutable
   previous/candidate states and exact caller `baseRevision`;
6. immediately reread the envelope and permission result; envelope drift
   blocks, while a newly false/unknown permission durably settles the
   corresponding `not_committed/permission_missing` or `permission_unknown`
   outcome with confirmed data unchanged, creates an outbox and proceeds
   through `broadcasting` with no alarm mutation;
7. write/read back `pending.phase:'prepared'` while leaving `confirmed`
   unchanged;
8. apply/read back the exact candidate alarm;
9. repeat the exact permission check for newly enabled connectors and reread
   the complete pending envelope plus alarm;
10. write/read back `pending.phase:'effect_proved'`; a rejected phase write is
    interpreted only by exact full-envelope read-back;
11. atomically replace `confirmed` with the candidate, increment `revision` and
    `generation`, append the outcome with its exact snapshot, clear `pending`,
    create the matching outbox, then read the complete envelope and alarm back;
12. publish/clear the durable outbox, then return the exact settled result.

The initial permission `false` is `not_admitted/permission_missing`; a throw or
malformed result is `not_admitted/permission_unknown`. Neither writes a pending
record or alarm. After reservation, a lost/unknown permission clears pending by
a proved terminal settlement, increments revision, records the corresponding
exact reason, and broadcasts the unchanged confirmed values at the new tuple.
The same durable settlement path is used when prepare storage is proved not to
have committed: `not_committed/storage_failed` is broadcast before `ready`;
there is no `preparing -> ready` shortcut while a pending record exists.
After prepare, the same failure must compensate and records
`compensated/permission_lost`. A storage
rejection is interpreted only by exact full-envelope read-back: proved previous
state is not committed, proved intended state continues, and any third or
unreadable value blocks.

If the alarm or final permission proof fails after prepare, set
`pending.phase:'compensating'`, restore/read back the exact previous alarm, then
clear pending while confirmed data remains previous. An alarm failure settles
`compensated/effect_compensated`; a final permission failure settles
`compensated/permission_lost`. That settlement increments revision and creates
an outbox. Any ambiguous compensation blocks. The candidate is never projected
as confirmed before settlement.

Consent grant and revocation use this same transaction. A
`SET_ONBOARDING_COMPLETED` or `CLEAR_ONBOARDING_COMPLETED` storage event is not
an input: only the correlated FIFO command may change consent. Revocation cannot
race a settings save because both are serialized and every candidate includes
the current consent value.

## Restart recovery

When `pending` exists, boot reads the exact envelope and alarm before admitting
anything:

- `reserved`: prove or restore the previous alarm, using compensating reason
  `recovered_previous` when restoration is needed, then settle
  `not_committed/recovered_previous`;
- `prepared`: first persist compensating reason `recovered_previous`, compensate
  to the previous alarm even when candidate and previous alarm expectations
  happen to be equal, then settle `not_committed/recovered_previous`;
- `effect_proved`: repeat the final permission and candidate-alarm proofs, then
  settle `committed/recovered_candidate`; a failed proof enters compensation;
- `compensating`: finish restoration and settle from the stored reason:
  `recovered_previous` maps to `not_committed`; the other two map to
  `compensated`;
- any unreadable, third or contradictory value: block.

Recovery preserves the original `requestId` and `commandId`, writes a terminal
outcome, and never silently adopts a candidate. A caller that lost its response
may retry the same `requestId` and receive the recovered outcome. After recovery
the actor publishes/clears the settlement outbox and reconciles the alarm to
confirmed state once more before `ready`.

## Alarm fire and scan-admission lease

`AUTO_SCAN_FIRED` is a FIFO command, not an independent callback. While the actor
is in `admittingScan`, Settings and consent mutations remain queued.

The scan snapshot digest is lower-case SHA-256 over the UTF-8 bytes of
`JSON.stringify` of this exact array, after the snapshot and settings have
passed the same strict detached-object decoder used by GET:

```ts
[
  'missionpulse-settings-release-scan-snapshot',
  1,
  revision,
  generation,
  onboardingCompleted,
  [
    scanIntervalMinutes,
    enabledConnectors,
    notifications,
    autoScan,
    maxSemanticPerScan,
    notificationScoreThreshold,
    respectRateLimits,
    customDelayMs,
    theme,
  ],
];
```

The exact port result union is:

```ts
type ScanAdmissionResult =
  | {
      status: 'accepted';
      operationId: `missionpulse-scan:${string}:${number}`;
    }
  | {
      status: 'skipped';
      reason: 'permission_missing' | 'already_running';
    };

type ScanAdmissionQueryResult =
  ScanAdmissionResult | { status: 'not_found' } | { status: 'retired' };

type SettingsScanDisposition =
  | ScanAdmissionResult
  | { status: 'skipped'; reason: 'catalog_changed' }
  | { status: 'transport_rejected'; reason: 'queue_full' }
  | { status: 'blocked'; reason: 'protocol_unknown' | 'timeout' | 'identity_error' };
```

The operation ID must contain the exact lower-case install UUID and a positive
safe monotonic scan identity; it is parsed and reserialized byte-for-byte.
Unknown keys, other reasons, malformed operation IDs, throws and timeouts are
protocol-unknown, not skipped.

`ScanAdmissionPort.tryAdmit` accepts exactly
`{token,identity,snapshot,snapshotDigest,scanAckThrough}`. The scan coordinator
durably binds token, identity and digest before returning a result. As its final
pre-bind step it repeats `permissions.contains` for the snapshot's exact sorted
origin union; false returns `skipped/permission_missing`, while an unknown proof
returns protocol-unknown and leaves recovery blocked. Repeating the same token
and bytes returns the same result; presenting different bytes is a terminal
identity error. `query` is read-only and can return `not_found`; it never binds
or starts a scan. Each call has an injected 10,000 ms deadline. A timeout or
unknown result leaves `scanAdmission` durable and moves the Settings actor to
`blocked`.

The scan coordinator retains a bounded ledger plus a durable per-install
retirement watermark. Atomically clearing a scan record advances
`scanAckThrough` to that record's identity. The next `tryAdmit` or `query` sends
that watermark; the coordinator then compacts older detailed rows while
retaining the watermark, and returns `retired` for a token at or below it.
Because at most one record can be unacknowledged, the detailed ledger is bounded
to two rows per installation and cannot grow without limit. Boot or explicit
retry uses the same token and query/admission mode required by the catalogue
state; it never allocates a replacement.

The actor:

1. rereads the exact envelope and `auto-scan` alarm;
2. proves consent, auto-scan, interval, shipped connector IDs and current host
   permissions from one immutable snapshot;
3. reserves/read backs a unique monotonic token and
   its exact snapshot digest in `scanAdmission.phase:'reserved'`;
4. calls `tryAdmit` while holding the FIFO lease;
5. on an accepted result, writes/read backs `phase:'accepted'` together with
   that exact operation ID, then clears/read backs the record while advancing
   `scanAckThrough`; on an exact skipped result, clears/read backs it and
   advances the same watermark directly;
6. releases the lease only after one of those exact proofs.

The scan uses the admitted immutable snapshot even if Settings later change. A
stale, missing, malformed, disabled or wrong-period fire never starts a scan;
the actor reconciles and reads back the alarm to the canonical expectation.
Missing connector permission also skips admission, but does **not** clear a
canonically present alarm: the alarm remains aligned with consent/settings and
a later fire may succeed after permission is restored. A storage event, alarm
name string or text cannot manufacture admission.

On a current-catalogue restart, a durable `reserved` record replays `tryAdmit`
with the same token; an `accepted` record queries and requires the exact stored
accepted operation ID before clearing. Under an old catalogue both phases use
only `query`: `reserved` may retire an accepted/skipped result or `not_found`,
but `accepted` requires the exact stored accepted result. Every contradictory
or unknown response blocks. A crash after scan acceptance therefore cannot
cause a second admission, and a suspended port cannot retain an in-memory FIFO
forever because the deadline transitions to a durable blocked recovery state.

## Review matrix

| Case                                 | Required terminal result                              | Forbidden effect               |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------ |
| Fresh install before onboarding      | envelope proved, `ready`, alarm absent                | automatic scan                 |
| Valid legacy migration               | exact envelope + alarm + legacy retirement proved     | partial migration              |
| Crash after legacy-key removal       | absent pair completes retirement                      | false corruption block         |
| Crash after removing one legacy key  | remaining exact key retires independently             | false corruption block         |
| Build catalogue changed              | recognized IDs intersected before `ready`             | projecting retired connector   |
| Catalogue change with pending/outbox | recover then supersede without old publication        | old snapshot broadcast         |
| Catalogue change with scan lease     | query-only retirement before migration                | old snapshot admission         |
| Invalid legacy/envelope state        | `blocked`                                             | default fallback or repair     |
| Whole-object edit                    | committed after envelope, permission and alarm proofs | optimistic UI                  |
| Consent grant/revocation             | same mutation transaction                             | uncorrelated storage write     |
| Concurrent panels                    | FIFO commit or conflict with canonical snapshot       | lost update                    |
| Delayed older broadcast              | panel rejects older tuple                             | UI regression                  |
| Duplicate retained request           | exact prior outcome                                   | repeated effect                |
| Evicted compensated request          | stale revision conflict                               | replaying transition           |
| Initial missing/unknown permission   | not admitted                                          | prompt, pending or alarm write |
| Permission lost after reservation    | durable unchanged-state outcome                       | orphan pending                 |
| Permission lost after prepare        | proved compensation or `blocked`                      | candidate settlement           |
| Rejection with intended read-back    | continue from proved phase                            | blind rollback                 |
| Third/unreadable read-back           | `blocked`                                             | blind retry                    |
| Alarm failure                        | proved compensation or `blocked`                      | success broadcast              |
| Crash before/after broadcast         | durable outbox replay/dedup                           | stale surviving panel          |
| Worker crash with queued commands    | transport retry with same request ID                  | invented terminal result       |
| FIFO full during boot/runtime        | typed transport rejection with null snapshot          | fabricated business result     |
| Retry while FIFO full                | reserved control latch                                | permanent blocked state        |
| Restart with pending candidate alarm | recovered candidate outcome                           | silent adoption                |
| Restart with previous alarm          | recovered previous outcome                            | candidate projection           |
| Revocation racing save               | serialized later revision wins                        | alarm after revocation         |
| Alarm fire racing revocation         | lease orders admission or revocation                  | mixed snapshot scan            |
| Crash after scan acceptance          | same durable token returns same admission             | duplicate scan                 |
| Scan ledger cleanup                  | monotonic retirement watermark                        | unbounded result ledger        |
| Scan port timeout                    | durable `blocked` recovery record                     | unbounded in-memory FIFO hold  |
| Identity/counter exhaustion          | reject then `blocked`                                 | random/unbounded fallback      |
| Backup restore or local reset        | no visible entry point                                | partial multi-store write      |

Review result: nominal, migration, consent, permissions, concurrent panels,
out-of-order broadcasts, rejected/ambiguous writes, compensation, crash
recovery, retries, idempotency, counter exhaustion and fenced scan admission are
explicit. No transition depends on an LLM or free text.

## Verification obligations

- XState transition tests for every row, including forbidden transitions and
  terminal blocking;
- hostile descriptors, proxies, unknown keys/connectors, unsafe counters and
  content mismatch at equal revision/generation;
- cold restart after identity reservation, prepare, alarm application,
  compensation, commit, outbox publish and legacy-key removal;
- independent absence/presence combinations for both legacy keys during
  `pending_removal`;
- two panels, delayed broadcasts, duplicate request IDs and evicted-outcome
  stale retries;
- FIFO/startup capacity, blocked fan-out and transport retry with the same
  request payload, plus exact overflow results for mutations, reads, alarm
  fires and the reserved retry-control latch;
- exact create/get/clear/get alarm order, permission rechecks, idempotent scan
  token replay and the 10-second admission deadline;
- current and historical catalogue fingerprint migration, including exact
  registry self-hashes, exact last-release prefix preservation, an unknown
  fingerprint, an unknown retired ID, a valid removed-connector legacy key
  during `pending_removal`, rejection of any historical fingerprint in `ready`,
  old pending/outbox suppression and query-only retirement of old scan leases;
- every branch-specific counter boundary at exactly sufficient and one-short
  capacity before any external effect;
- static proof of no `permissions.request`, `alarms.clearAll`, permissive
  fallback, legacy reader/writer, second coordinator or direct `auto-scan`
  writer;
- packaged MV3 cold/warm worker restart, multi-panel conflict, onboarding skip,
  consent grant/revoke, settings edit and alarm-fire scenarios.
