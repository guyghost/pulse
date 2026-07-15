# Settings Persistence Workflow Model

Authoritative transactional model for every user-visible persistent setting,
including auto-scan, interval, notifications, theme, and enabled connectors.

## Scope and decisions

The UI may optimistically project a candidate while showing `saving`, but the
canonical setting and success copy change only after the service worker
confirms persistence and any required browser effect. Failure restores the
exact `previous` value and remains visible/retryable.

All mutations use one helper and one compare/write contract. This prevents
field-specific fire-and-forget behavior and whole-object lost updates.

## State vocabulary and context

```ts
type PersistentSettingKey =
  'autoScan' | 'scanIntervalMinutes' | 'notifications' | 'theme' | 'enabledConnectors';

type SaveStatus = 'saved' | 'saving' | 'failed';
type SettingsLoadStatus = 'loading' | 'ready' | 'error';

interface SettingMutation<T> {
  key: PersistentSettingKey;
  previous: T;
  candidate: T;
  status: SaveStatus;
  mutationId: string;
  baseRevision: number;
  error: SettingsPersistenceError | null;
}

interface SettingsPersistenceContext {
  loadStatus: SettingsLoadStatus;
  confirmed: AppSettings;
  projected: AppSettings;
  revision: number;
  mutation: SettingMutation<unknown> | null;
  loadError: SettingsPersistenceError | null;
  online: boolean;
}
```

When no mutation exists, every field is `saved` and
`projected === confirmed`. During `saving`, only the mutated projected field
may differ. During `failed`, projection has already rolled back to `previous`,
while `candidate` and error remain for Retry.

The page-facing `saveStatus` is derived as
`mutation?.status ?? 'saved'`. A single typed
`mutateSetting(key, candidate): Promise<AppSettings>` helper drives every
field; it resolves only with the confirmed full settings snapshot and rejects
with `SettingsPersistenceError`.

## Events

```ts
type SettingsPersistenceEvent =
  | { type: 'LOAD'; requestId: string }
  | { type: 'LOAD_SUCCEEDED'; requestId: string; settings: AppSettings; revision: number }
  | { type: 'LOAD_FAILED'; requestId: string; error: SettingsPersistenceError }
  | { type: 'MUTATE'; key: PersistentSettingKey; candidate: unknown; mutationId: string }
  | { type: 'PERMISSION_GRANTED'; mutationId: string }
  | { type: 'PERMISSION_REFUSED'; mutationId: string }
  | { type: 'SAVE_SUCCEEDED'; mutationId: string; settings: AppSettings; revision: number }
  | { type: 'SAVE_FAILED'; mutationId: string; error: SettingsPersistenceError }
  | { type: 'RETRY'; mutationId: string }
  | { type: 'CANCEL'; mutationId: string }
  | { type: 'DISMISS_ERROR'; mutationId: string }
  | { type: 'NETWORK_CHANGED'; online: boolean }
  | { type: 'SERVICE_WORKER_RESTARTED' }
  | { type: 'RECONCILED'; requestId: string; settings: AppSettings; revision: number };
```

## Statechart for one mutation

```mermaid
stateDiagram-v2
  [*] --> saved
  saved --> saving: MUTATE [validCandidate && noActiveMutation]
  saving --> saved: SAVE_SUCCEEDED [matchingMutation && nextRevision]
  saving --> failed: SAVE_FAILED [matchingMutation]
  saving --> failed: PERMISSION_REFUSED [matchingMutation]
  failed --> saving: RETRY [candidateStillValid]
  failed --> saved: DISMISS_ERROR / discardCandidate
  saving --> saved: CANCEL [matchingMutation && abortWins]
```

Load state (`loading | ready | error`) is orthogonal. Mutation events are
accepted only while load status is `ready`.

## Guards

| Guard                 | Rule                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `validCandidate`      | Pure schema validates key/value and cross-field invariants.                 |
| `noActiveMutation`    | No global settings write is saving; otherwise return typed `SETTINGS_BUSY`. |
| `matchingMutation`    | Event mutation ID equals active mutation ID.                                |
| `nextRevision`        | Response revision is exactly the committed successor of `baseRevision`.     |
| `candidateStillValid` | Candidate validates against the latest confirmed settings/catalogue.        |
| `permissionSatisfied` | Required optional Chrome permission is granted before persistence.          |
| `abortWins`           | Cancel event is reduced before the storage/effect commit acknowledgement.   |

Cross-field invariants include a valid scan interval, notification threshold,
and `enabledConnectors` limited to build-included connector IDs. A connector
enable mutation requests only that connector's declared host patterns.

## Transition table

| From           | Event                | Guard                   | To       | Effects                                                                                              |
| -------------- | -------------------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| load `loading` | `LOAD_SUCCEEDED`     | matching request        | `ready`  | Validate, set confirmed/projected/revision, clear errors.                                            |
| load `loading` | `LOAD_FAILED`        | matching request        | `error`  | Keep safe previous/default projection and expose Retry.                                              |
| `saved`        | `MUTATE`             | valid, no active write  | `saving` | Snapshot `previous`, project candidate, request permission if needed, then compare/write via facade. |
| `saving`       | `PERMISSION_GRANTED` | matching                | `saving` | Continue persistence; do not show success.                                                           |
| `saving`       | `PERMISSION_REFUSED` | matching                | `failed` | Roll back projected field to `previous`; keep candidate/error.                                       |
| `saving`       | `SAVE_SUCCEEDED`     | matching, next revision | `saved`  | Replace full confirmed/projected snapshot; clear mutation; show success.                             |
| `saving`       | `SAVE_FAILED`        | matching                | `failed` | Roll back to `previous`; retain candidate and typed error.                                           |
| `failed`       | `RETRY`              | candidate valid         | `saving` | Rebase on latest revision, reapply candidate, retry required phases.                                 |
| `failed`       | `DISMISS_ERROR`      | matching                | `saved`  | Discard candidate/error; retain confirmed settings.                                                  |
| `saving`       | `CANCEL`             | abort wins              | `saved`  | Abort worker operation and roll back projection; ignore late response.                               |
| any            | `NETWORK_CHANGED`    | —                       | same     | Update availability; local persistence remains usable.                                               |

If a compare/write reports a revision conflict, it is `SAVE_FAILED` with
`SETTINGS_CONFLICT`. Retry first reloads/rebases; it never overwrites newer
settings blindly.

## Side effects and ownership

- **Core:** candidate validation, build-catalogue filtering, immutable patch,
  revision comparison, and rollback derivation.
- **Side-panel state/UI:** holds projected value and mutation status, renders
  saving/failure/retry, and applies/rolls back theme presentation.
- **Service worker Shell:** owns `chrome.storage.local`, optional permission
  requests, and settings-derived alarms/notifications. It returns success only
  after required effects are confirmed.
- **Facades/bridge:** transport the full typed result/error. No UI component
  accesses Chrome storage, permissions, cookies, or alarms directly.

For `autoScan`/`scanIntervalMinutes`, the worker persists the new settings and
reconciles only MissionPulse-owned alarm names. If alarm reconciliation fails,
it compensates to `previous` before returning failure. For theme, rollback
restores both canonical storage and the projected DOM theme.

## Persistence boundary

The validated `AppSettings` object and monotonically increasing revision are
written atomically under the settings key in `chrome.storage.local`. Browser
permissions remain Chrome-owned. Alarm state is derived from the confirmed
settings and reconciled idempotently; it is not a second settings database.

`previous`, candidate, mutation ID, error, and saving projection are ephemeral.
After panel reload or service-worker restart, a facade read restores the
canonical persisted object. Defaults are used only when no valid record exists,
never to hide a failed write.

## Permissions and offline behavior

Most settings require no optional permission. Enabling a connector or feature
that does require one must obtain it from a direct user gesture before writing
the enabled value. Refusal becomes visible `failed` and restores `previous`.

Local settings remain writable offline. A network-dependent connector/session
check may separately show offline/failed status, but cannot turn a confirmed
local settings write into fabricated runtime readiness. Auto-scan may be
configured offline and will execute only when its modeled scan preconditions
later pass.

## Retry, cancellation, concurrency, and restart

- Retry retains the failed candidate but rebases it onto freshly confirmed
  settings and repeats permission/effect checks as needed.
- Cancel before commit restores `previous`; after commit acknowledgement it is
  rejected and a new mutation is required to change the value back.
- All settings writes are globally serialized because they replace one object.
  Concurrent `MUTATE` returns `SETTINGS_BUSY`; it is not silently dropped.
- Stale success/failure IDs and non-successor revisions are ignored and trigger
  reconciliation.
- On service-worker restart, an unacknowledged mutation becomes failed/unknown
  until a canonical read. No success toast is emitted from a guessed outcome.

## Terminal states and re-entry

`saved` is the stable successful state; `failed` is terminal for that attempt
until Retry, Dismiss, or a new mutation. Cancel is terminal for its mutation ID
and returns the field to stable `saved(previous)`. A new mutation always gets a
new ID/revision base.

## Forbidden transitions

- `saving` to `saved` without confirmed storage and required browser effects.
- Persistence of invalid settings or a connector excluded from the build.
- UI success toast while projection differs from confirmed storage.
- Swallowing a facade/storage/permission error or leaving the optimistic value.
- Concurrent whole-object writes without revision/serialization guards.
- Applying a stale mutation response or revision.
- Any implicit transition from toggle appearance, toast copy, or generated text.

## Invariants

1. Every mutation records `previous`, candidate, mutation ID, and base revision.
2. Status vocabulary is exactly `saving`, `saved`, or `failed` per mutation.
3. Failure restores the exact previous field and keeps a retryable error.
4. Confirmed settings are always schema-valid and build-catalogue-valid.
5. Success follows persistence/effect acknowledgement, never optimistic UI.
6. Side-panel components use facade/messaging, not direct browser persistence.
7. Settings-derived alarms cannot clear unrelated or probe alarms.
8. An LLM never decides a transition; settings events and guards are deterministic.
9. Core is pure; storage, permissions, alarms, and DOM projection live in Shell/UI.

## Review checklist

- [x] Load and nominal writes for auto-scan, interval, notifications, theme, and connectors are explicit.
- [x] Schema, storage, permission, alarm, quota, and revision failures roll back visibly.
- [x] Offline local writes and network-dependent readiness are separated.
- [x] Retry, cancellation race, stale response, and global write concurrency are defined.
- [x] Service-worker/panel restart reloads canonical state without false success.
- [x] Failed/saved re-entry requires a named event and new mutation ID where applicable.
