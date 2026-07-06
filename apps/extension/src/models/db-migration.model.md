# DB Migration Model

Source of truth for IndexedDB lifecycle and schema/data migrations across
MissionPulse releases. Replaces the ad-hoc dual-opener approach
(`db.ts` + `tracking.ts::openDBWithTracking`) with a single migration
orchestrator that runs on `chrome.runtime.onInstalled` (reason `update`) and
on every service-worker cold start.

## Goals

1. **Never block the app on a version bump.** Every `openDB()` call must
   resolve, either with a healthy DB or a freshly recreated one.
2. **Never lose user data silently.** A breaking entity-shape change must
   run a _data migration_ (transform records) before the new code reads them.
3. **Detect and self-heal corruption.** If `openDB()` rejects repeatedly or
   records fail validation past a threshold, the orchestrator repairs the DB
   (after a backup) instead of leaving the user stranded.
4. **Serialize upgrades.** Only one opener. Long-lived connections close on
   `onversionchange`; new connections wait on `onblocked` with a timeout.

## Two independent version axes

| Axis               | Where it lives         | Bumped when                               | Current                               |
| ------------------ | ---------------------- | ----------------------------------------- | ------------------------------------- |
| `DB_VERSION`       | `db.ts` constant       | An object store or index is added/removed | 4 (after merge of `mission_tracking`) |
| `APP_DATA_VERSION` | `chrome.storage.local` | An entity Zod schema changes shape        | 1                                     |

`DB_VERSION` is structural (IndexedDB native). `APP_DATA_VERSION` is
applicative: bumping it triggers a record-rewriting data migration. Both
versions are **forward-only integers** and never reset.

## Stores and ownership

| Store              | Added at `DB_VERSION` | keyPath       | Indexes               |
| ------------------ | --------------------- | ------------- | --------------------- |
| `missions`         | 1                     | `id`          | `source`, `scrapedAt` |
| `profile`          | 1                     | `id`          | —                     |
| `connector_status` | 2                     | `connectorId` | —                     |
| `generated_assets` | 3                     | `id`          | `missionId`           |
| `mission_tracking` | 4 (was: ad-hoc)       | `missionId`   | `currentStatus`       |
| `quarantine`       | 4 (on-demand)         | `id`          | `originalStore`       |

The `quarantine` store is created inside the v4 `onupgradeneeded` block so it
exists before any `verifying` pass can route to the `quarantine` state. It is
out of scope for normal reads — only the dev panel and a future recovery UI
touch it.

`mission_tracking` is **absorbed** into the central cascade. The standalone
`openDBWithTracking()` is removed; its callsite (`tracking.ts`) uses `openDB()`.

## Migration registry

A pure, ordered, append-only array. Each entry is a function
`(db, event) => void` for structural migrations and
`(deps) => Promise<void>` for data migrations. Structural entries run inside
`onupgradeneeded`; data entries run after a successful open. The orchestrator
is the **only** caller; LLMs never decide transitions.

```ts
// Structural — runs in onupgradeneeded, keyed by oldVersion < N
type StructuralMigration = (db: IDBDatabase, tx: IDBTransaction) => void;

// Data — runs after open, keyed by stored APP_DATA_VERSION < N
interface DataMigrationDeps {
  openDB: () => Promise<IDBDatabase>;
}
type DataMigration = (deps: DataMigrationDeps) => Promise<void>;
```

## State graph

```
                onInstalled(update) | service-worker cold start
                                      ▼
                              ┌──────────────┐
                              │   checking   │
                              └──────┬───────┘
        openDB() VersionError (downgrade)            openDB() rejects (UnknownError)
              │                                            │  (1st attempt)
              ▼                                            ▼
        ┌──────────┐                                ┌───────────────┐
        │ downgrade│                                │ corruptRepair │──┐
        └────┬─────┘                                └──────┬────────┘  │ retry once
             │ notify + toast (no data loss)               │           │
             ▼                                       success?│        │
        ┌─────────┐                              ┌─────┴──────┴────┐  │
        │ blocked │◄── yes                       │ yes        no   │  │
        └─────────┘                              ▼                ▼  │
                                          ┌──────────────┐   ┌─────────┐
              openDB() resolves ─────────►│  idle (via   │   │ failed  │
                                           │  full path)  │   └─────────┘
                                           └──────┬───────┘
                                                  │
                          ┌───────────────────────┴──────────────────────────┐
                          ▼                                                  ▼
                  struct < DB_VERSION                              struct = DB_VERSION
                  AND/OR data < APP_DATA_VERSION                    AND data = APP_DATA_VERSION
                          │                                                  │
                          ▼                                                  ▼
                ┌─────────────────┐                                   ┌───────────┐
                │ migratingStruct │ throws ──► corruptRepair           │ verifying │
                └────────┬────────┘                                   └─────┬─────┘
                         │ success                                          │
              ┌──────────┴───────────┐                              invariants OK
              ▼                      ▼                                    │
   data pending? yes         data pending? no                             ▼
        ┌───────────────┐         ┌──────────┐                       ┌─────────┐
        │ migratingData │ throws  │ verifying│◄──────────────────────│  idle   │
        └───────┬───────┘─►failed └────┬─────┘                        └─────────┘
                │ success              │
                └──────────────────────┘

                verifying: rejects ≤ 10%   ──► idle (warn, keep data)
                verifying: rejects > 10%   ──► quarantine (move bad records
                                             to `quarantine` store, KEEP good)
                quarantine throws           ──► failed (no destruction)
```

### States

`MigrationState = 'checking' | 'readVersions' | 'downgrade' | 'migratingStruct' | 'migratingData' | 'verifying' | 'quarantine' | 'corruptRepair' | 'idle' | 'failed'`

Two terminal states: `idle` (success) and `failed` (surface toast, persistence
features degraded but app still runs). `downgrade` is a quasi-terminal
non-destructive state: the DB is left untouched, the orchestrator refuses to
migrate, and the UI tells the user to reinstall the latest version.

### Events and transition table

| From \ Event      | OPEN_OK      | OPEN_REJECT (UnknownError) | OPEN_REJECT (VersionError) | VERSIONS_READ                        | STRUCT_DONE              | DATA_DONE | VERIFY_OK | VERIFY_QUARANTINE | REPAIR_OK      | REPAIR_FAIL/MIGRATION_THROW |
| ----------------- | ------------ | -------------------------- | -------------------------- | ------------------------------------ | ------------------------ | --------- | --------- | ----------------- | -------------- | --------------------------- |
| `checking`        | readVersions | corruptRepair              | downgrade                  | —                                    | —                        | —         | —         | —                 | —              | —                           |
| `readVersions`    | —            | —                          | —                          | migratingStruct\|migratingData\|idle | —                        | —         | —         | —                 | —              | —                           |
| `downgrade`       | —            | —                          | —                          | —                                    | —                        | —         | —         | —                 | —              | —                           |
| `migratingStruct` | —            | —                          | —                          | —                                    | migratingData\|verifying | —         | —         | —                 | —              | corruptRepair               |
| `migratingData`   | —            | —                          | —                          | —                                    | —                        | verifying | —         | —                 | —              | failed                      |
| `verifying`       | —            | —                          | —                          | —                                    | —                        | —         | idle      | quarantine        | —              | —                           |
| `quarantine`      | —            | —                          | —                          | —                                    | —                        | —         | idle      | —                 | —              | failed                      |
| `corruptRepair`   | readVersions | —                          | —                          | —                                    | —                        | —         | —         | —                 | readVersions\* | failed                      |
| `idle`            | —            | —                          | —                          | —                                    | —                        | —         | —         | —                 | —              | —                           |
| `failed`          | —            | —                          | —                          | —                                    | —                        | —         | —         | —                 | —              | —                           |

\* `corruptRepair → readVersions` re-runs the full path (structural cascade
from v0 + data + verifying). This is **explicit** in the graph, not implicit.

Notes:

- `readVersions` dispatches to `migratingStruct` (struct pending),
  `migratingData` (data pending only), or `idle` (nothing pending).
- `migratingStruct → migratingData` skipped if no data migration pending.
- `corruptRepair` runs at most **once** (bounds `repairAttempts`). A second
  failure goes to `failed`.

### Context

- `storedDbVersion: number | null` — read via `idb.databases()` fallback chain.
- `storedDataVersion: number | null` — read from `chrome.storage.local`.
- `lastError: { code, message } | null` — non-null only in `failed`.
- `repairAttempts: 0 | 1` — bounds corruptRepair retries.
- `rejectedRecordsCount: number` — populated during `verifying`.

## Side effects

- **Enter `checking`**: open without a requested version first
  (`indexedDB.open('missionpulse')`) to read the _actual_ stored version. If
  `stored > DB_VERSION`, route to `downgrade` **without** attempting a
  versioned open (avoids `VersionError`). Otherwise proceed with a versioned
  `openDB()` carrying `onblocked` (15 s timeout, 250 ms backoff, max 3
  retries) and `onerror`. `db.onversionchange = () => db.close()` is set on
  every returned connection.
- **Enter `downgrade`**: terminal-ish. Persist
  `chrome.storage.local['missionpulse.downgrade'] = { stored, expected }`.
  Emit `MIGRATION_DOWNGRADE_DETECTED` on the bridge. UI surfaces a non-blocking
  toast: "Version plus ancienne détectée — réinstallez la dernière version pour
  éviter la perte de données." The DB is **not** deleted.
- **Enter `readVersions`**: read `chrome.storage.local['appDataVersion']`;
  structural version was captured during the unversioned probe in `checking`.
- **Enter `migratingStruct`**: structural migrations run **inside**
  `onupgradeneeded` (IndexedDB constraint — atomic per request). A thrown
  migration aborts the transaction; the open rejects and routes to
  `corruptRepair` (the DB is untouched thanks to IDB atomicity, but the
  upgrade is incomplete so we repair).
- **Enter `migratingData`** (after a successful open): run each pending data
  migration in order, each in its own `readwrite` transaction. Commit
  `appDataVersion = APP_DATA_VERSION` last in a final transaction. A
  `QuotaExceededError` on any write fails the migration → `failed` (no
  destruction — the previous transactions already committed are recoverable
  on next run thanks to idempotency).
- **Enter `verifying`**: validate the `missions` and `profile` stores through
  their parse functions; count rejects. Three outcomes:
  - 0 rejects → `idle`.
  - `0 < rejects ≤ 10%` → `idle` with a dev warning; rejects are left in place
    (the runtime readers already filter them).
  - `rejects > 10%` → `quarantine` (non-destructive).
- **Enter `quarantine`**: move (not copy) invalid records from their store to
  a dedicated `quarantine` store (created on demand, keyPath `id`, plus an
  index `originalStore`). Valid records stay. On any write error → `failed`
  (we never `deleteDatabase` based on validation stats). Emits
  `MIGRATION_QUARANTINED` with a count.
- **Enter `corruptRepair`**:
  1. **Backup, whole-records-only.** Export each store as a JSON array. If the
     serialized size would exceed **4 MB** (leaving headroom under the 10 MB
     `chrome.storage.local` quota shared with other keys), abort the backup
     per-store and record `missionpulse.backup = { partial: true, stores:
{ missions: { truncated: true, savedCount } } }`. Never write invalid
     JSON — truncation always lands on a complete record boundary. Records
     that cannot be serialized (e.g. circular references) are silently skipped;
     the resulting `stores[name].count` reflects only the records that were
     kept.
  2. `indexedDB.deleteDatabase('missionpulse')`.
  3. Re-open → triggers full structural cascade from v0, then `readVersions`
     re-runs (explicit transition in the graph).
- **Enter `idle`**: emit `MIGRATION_DONE` on the bridge.
- **Enter `failed`**: persist `chrome.storage.local['missionpulse.migrationError']`;
  emit `MIGRATION_FAILED` with `lastError`; UI surfaces a non-blocking toast
  with a "Réinitialiser les données locales" CTA (reuses `resetLocalData()`).

## Concurrency model

- **Single opener.** All storage modules import `openDB()` from `db.ts`.
  `tracking.ts::openDBWithTracking()` is deleted.
- **Upgrade serialization.** Every long-lived connection sets
  `db.onversionchange = () => db.close()` so a version bump from another
  context is not blocked. The opener sets `request.onblocked` to retry the
  open after a 250 ms backoff (max 3 retries, then reject → `corruptRepair`).
- **Cold-start guard.** The orchestrator runs once per service-worker
  lifecycle, gated by an in-memory `migrationInProgress` flag. Concurrent
  callers `await` the same promise.

## Invariants

1. **One opener.** No code outside `db.ts` calls `indexedDB.open(...)`.
2. **Version monotonicity.** `storedDbVersion` and `storedDataVersion` never
   decrease via the orchestrator. A user-initiated **downgrade** is detected
   before any versioned open and routed to `downgrade` (no destruction).
3. **Structural atomicity.** If `onupgradeneeded` throws, the version is NOT
   bumped and the DB is left untouched (IndexedDB guarantees this); we then
   `corruptRepair` because the upgrade is incomplete.
4. **Repair is bounded.** `repairAttempts ≤ 1`. A failed repair is terminal
   (`failed`).
5. **Backup is honest.** `corruptRepair` writes a backup that is always valid
   JSON. If it cannot fit, it marks `partial: true` and keeps whole records
   only. It never claims success while writing truncated JSON.
6. **Validation is non-destructive.** Rejects above threshold route to
   `quarantine`, never to `deleteDatabase`. The `quarantine` store preserves
   bad records for inspection/recovery. `deleteDatabase` only happens via
   `corruptRepair` (open errors), never via `verifying`.
7. **Telemetry on reject.** Every record dropped during `verifying` or
   filtered at runtime by a Zod-guarded reader is counted into
   `chrome.storage.local['missionpulse.rejectedCount']` (capped counter).
8. **LLM-free.** No data migration decision is delegated to an AI worker.
   The migration registry is hand-authored code.
9. **Idempotency.** Every data migration is safe to re-run on
   already-migrated records (so a partial run that crashed mid-way is
   recoverable). The orchestrator re-runs from `storedDataVersion`, and each
   migration must tolerate records already in the target shape.
10. **Runtime readers surface rejects.** The four runtime readers
    (`getMissionsBySource`, `getRecentMissions`, `getMissionsPaginated`,
    `getMissionById`) increment `rejectedCount` on each `parseMission → null`.
    The count is surfaced in the dev panel and triggers a one-time toast when
    it crosses a threshold (configurable, default 50).

## Triggers

| Trigger                               | When                                  | Effect                                      |
| ------------------------------------- | ------------------------------------- | ------------------------------------------- |
| `chrome.runtime.onInstalled` (update) | New version deployed to users         | Orchestrator runs end-to-end                |
| Service-worker cold start             | Browser restart / SW eviction         | Orchestrator runs (no-op if `idle` already) |
| Manual                                | `chrome.runtime.sendMessage(MIGRATE)` | Reserved for dev panel                      |

## Public API (consumed by background SW + storage modules)

All types and functions below live in **Shell** (`src/lib/shell/storage/db.ts`
and a new `src/lib/shell/storage/migration.svelte.ts` for the reactive
snapshot). They must NOT be imported from `src/lib/core/`. The migration
registry itself is plain `.ts` (no runes) so it can run in the service worker.

```ts
// db.ts (Shell)
export const DB_VERSION = 4;
export const APP_DATA_VERSION = 1;
export function openDB(): Promise<IDBDatabase>; // closes on versionchange
export function runMigrations(): Promise<MigrationResult>;

// migration.svelte.ts (Shell, runes — for UI/dev panel reactivity)
export function getMigrationStatus(): MigrationSnapshot; // reactive reads

// storage modules
import { openDB } from './db'; // the ONLY opener
```

`MigrationState` and `MigrationSnapshot` are exported from
`src/lib/shell/storage/migration-types.ts` (Shell).

`MigrationSnapshot = { state: MigrationState; storedDbVersion: number | null;
storedDataVersion: number | null; lastError: {...} | null; rejectedCount:
number }`

`MigrationResult = { ok: true; from: { db: number; data: number }; to: {
db: number; data: number } } | { ok: false; code: MigrationErrorCode; message:
string }`

`MigrationErrorCode = 'downgrade' | 'corrupt' | 'quota' | 'structural_throw'
| 'data_throw' | 'unknown'`

## Out of scope

- Cross-device sync (handled by the connected dashboard path).
- Backup export UI beyond the auto-backup blob (separate feature).
- Migrating `chrome.storage.local` keys (each module keeps its own
  defensive `safeParse` + ad-hoc migration like `tjm-history.ts`).
