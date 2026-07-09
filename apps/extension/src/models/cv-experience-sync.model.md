# CV Experience & Sync Model

Source of truth for the CV tab behavior: an editable feed of professional
experiences and a cross-platform sync that pushes them to LinkedIn and the
mission connectors. Modeled as three cooperating state machines in a Svelte 5
runes module (`src/lib/state/cv-experience.svelte.ts`), per the project standard
(runnes over XState — see `profile-state.model.md`).

The LLM never decides a transition. It may propose adapted summary copy inside a
dedicated AI worker; the model decides whether that copy is accepted and when
sync runs. **Le LLM produit des signaux ; le modèle décide.**

## Domain entities

### Experience (canonical, persisted on `UserProfile.experiences`)

```ts
interface Experience {
  id: string; // `${idPrefix}-${positionIndex}` or generated UUID
  title: string; // e.g. "Lead Frontend"
  company: string | null; // e.g. "Acme"
  location: string | null;
  startDate: string | null; // ISO month "YYYY-MM" or null
  endDate: string | null; // null when isCurrent
  isCurrent: boolean;
  description: string;
  skills: string[];
  source: 'linkedin' | 'manual' | 'connector-import';
  sourceExternalId: string | null;
  positionIndex: number; // gapless, stable ordering (0 = most recent)
  updatedAt: number; // epoch ms (injected by shell)
}
```

`UserProfile` is extended with `experiences: Experience[]` (default `[]`). The
existing flat fields (jobTitle, stack, tjm, location, …) are unchanged; scoring
ignores `experiences`.

### PlatformSyncTarget

LinkedIn + the 6 mission connectors (`getConnectorsMeta()`). Each target has an
independent status during a sync run.

```ts
type PlatformSyncStatus =
  | 'pending'
  | 'copying' // clipboard write in flight
  | 'done' // copied + URL opened
  | 'error' // clipboard denied or open failed
  | 'auth-required' // platform page returned a login wall (verify path)
  | 'blocked' // platform page unreadable
  | 'skipped'; // user cancelled before this platform started
```

## Machines

The store composes three machines. They share the experiences list but their
statuses are independent: editing an experience does not block sync, and a
running sync does not block editing (edits queue on the next save).

### 1. Feed machine — `feedStatus`

```
loading ──LOAD_RESULT(ok)──► ready
loading ──LOAD_ERROR──►      error
error   ──RETRY──►           loading
ready   ──RELOAD──►          loading
*       ──PROFILE_UPDATED──► ready (experiences replaced, see Merge)
```

`FeedStatus = 'loading' | 'ready' | 'error'`. `ready` with 0 experiences renders
the empty state (first-run: "Importez LinkedIn ou ajoutez une expérience").

### 2. Edit machine — `editStatus` (one session at a time)

```
idle    ──NEW────────► adding   (draft = blank Experience)
idle    ──EDIT(id)───► editing  (draft = copy of experience)
adding  ──CANCEL──►    idle
editing ──CANCEL──►    idle
adding  ──SUBMIT──►    saving
editing ──SUBMIT──►    saving
saving  ──SAVE_RESULT(ok)──► ready  (draft committed, positionIndex recomputed)
saving  ──SAVE_ERROR──►     error  (draft retained for RETRY)
error   ──RETRY──►          saving  (guard: hasDraft)
error   ──CANCEL──►         idle
idle    ──DELETE(id)──► deleting
deleting──DELETE_RESULT(ok)──► ready
deleting──DELETE_ERROR──►     error
```

`EditStatus = 'idle' | 'adding' | 'editing' | 'saving' | 'deleting' | 'error'`.

### 3. Sync machine — `syncStatus`

```
idle      ──SYNC_START──►        preparing
preparing ──PREPARE_DONE──►      syncing  (per-platform: pending)
preparing ──PREPARE_ERROR──►     error    (e.g. no experiences to push)
syncing   ──PLATFORM_START(id)──► syncing  (platform → copying)
syncing   ──PLATFORM_DONE(id)──►  syncing  (platform → done)
syncing   ──PLATFORM_ERROR(id)──► syncing  (platform → error|auth-required|blocked)
syncing   ──SYNC_CANCEL──►        cancelled (remaining platforms → skipped)
syncing   ──ALL_SETTLED──►        synced | partial | error
                                       (synced: all done; partial: ≥1 done, ≥1 error;
                                        error: 0 done)
cancelled ──SYNC_START──►        preparing
synced|partial|error ──SYNC_START──► preparing
```

`SyncStatus = 'idle' | 'preparing' | 'syncing' | 'cancelled' | 'synced' | 'partial' | 'error'`.

Per-platform status lives in `Map<platformId, PlatformSyncStatus>` and is only
meaningful while `syncStatus` is `syncing`/terminal. It resets on `SYNC_START`.

## Context

```ts
interface CvExperienceContext {
  experiences: Experience[]; // canonical, persisted
  feedStatus: FeedStatus;
  editStatus: EditStatus;
  draft: Experience | null; // non-null in adding/editing/saving/error
  editingId: string | null; // which experience is open (null for adding)
  syncStatus: SyncStatus;
  platformStatuses: Map<string, PlatformSyncStatus>;
  lastSyncedAt: number | null; // epoch ms
  error: string | null; // feed/edit/sync error copy
}
```

## Events

```ts
type CvEvent =
  // Feed
  | { type: 'LOAD' }
  | { type: 'RELOAD' }
  | { type: 'RETRY' }
  | { type: 'PROFILE_UPDATED'; experiences: Experience[] }
  // Edit
  | { type: 'NEW' }
  | { type: 'EDIT'; id: string }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT'; draft: Experience }
  | { type: 'DELETE'; id: string }
  | { type: 'SAVE_RESULT'; experience: Experience }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'DELETE_RESULT'; id: string }
  | { type: 'DELETE_ERROR'; message: string }
  // Sync
  | { type: 'SYNC_START' }
  | { type: 'PREPARE_DONE'; payloads: Map<string, string> }
  | { type: 'PREPARE_ERROR'; message: string }
  | { type: 'PLATFORM_START'; id: string }
  | { type: 'PLATFORM_DONE'; id: string }
  | { type: 'PLATFORM_ERROR'; id: string; status: 'error' | 'auth-required' | 'blocked' }
  | { type: 'SYNC_CANCEL' }
  | { type: 'ALL_SETTLED' };
```

## Transition table (edit + sync; feed is trivial above)

| From \ Event   | NEW     | EDIT    | CANCEL  | SUBMIT     | SAVE_RESULT | SAVE_ERROR | DELETE   | DELETE_RESULT | DELETE_ERROR | SYNC_START | PROFILE_UPDATED |
| -------------- | ------- | ------- | ------- | ---------- | ----------- | ---------- | -------- | ------------- | ------------ | ---------- | --------------- |
| `idle`         | adding  | editing | -       | -          | -           | -          | deleting | -             | -            | (sync)     | ready (merge)   |
| `adding`       | -       | -       | idle    | saving     | -           | -          | -        | -             | -            | allowed\*  | dropped         |
| `editing`      | -       | -       | idle    | saving     | -           | -          | -        | -             | -            | allowed\*  | dropped         |
| `saving`       | ignored | ignored | ignored | ignored    | ready       | error      | ignored  | -             | -            | ignored    | dropped         |
| `deleting`     | ignored | ignored | ignored | ignored    | -           | -          | ignored  | ready         | error        | ignored    | dropped         |
| `error` (edit) | adding  | editing | idle    | saving\*\* | -           | -          | deleting | -             | -            | allowed\*  | ready (merge)   |

\* `SYNC_START` is allowed while an edit session is open (edit draft is
preserved; sync operates on the committed experiences list, not the draft). The
two machines are independent.

\*\* `SUBMIT` from `error` re-enters `saving` with the retained `draft`
(equivalent to RETRY for the edit machine).

| From \ Event (sync) | SYNC_START | PREPARE_DONE | PLATFORM\_\* | SYNC_CANCEL | ALL_SETTLED | PROFILE_UPDATED |
| ------------------- | ---------- | ------------ | ------------ | ----------- | ----------- | --------------- |
| `idle`              | preparing  | -            | -            | -           | -           | idle (merge)    |
| `preparing`         | ignored    | syncing      | -            | idle        | -           | dropped         |
| `syncing`           | ignored    | -            | updates pm   | cancelled   | terminal    | dropped         |
| `cancelled`         | preparing  | -            | -            | -           | -           | idle (merge)    |
| `synced/partial/er` | preparing  | -            | -            | -           | -           | idle (merge)    |

## Side effects (shell — `deps`)

- **Enter `loading`**: `deps.loadExperiences()` → reads `UserProfile.experiences`
  via the profile bridge. Resolves → `ready`; rejects → `error`.
- **Enter `saving`** (SUBMIT): `deps.saveExperience(draft)`.
  - New (`editingId === null`): append, assign `positionIndex = 0`, shift others
    +1, persist. Resolves → `SAVE_RESULT(experience)`.
  - Existing: replace in place, keep `positionIndex`, bump `updatedAt`. Resolves
    → `SAVE_RESULT(experience)`.
  - Rejects → `SAVE_ERROR(message)`, `draft` retained.
- **Enter `deleting`** (DELETE): `deps.deleteExperience(id)`. Removes, recomputes
  gapless `positionIndex`, persists. Resolves → `DELETE_RESULT(id)`; rejects →
  `DELETE_ERROR`.
- **Enter `preparing`** (SYNC_START): pure `buildPlatformPayloads(experiences,
targets)` in core. If `experiences.length === 0` → `PREPARE_ERROR`. Else →
  `PREPARE_DONE(payloads)`.
- **Enter `syncing`** (PREPARE_DONE): `deps.pushAll(payloads)` iterates targets.
  Clipboard write is attempted **once globally** before any platform opens:
  - Clipboard denied → every platform → `error`, `ALL_SETTLED` → `error`.
  - Else, per platform: `PLATFORM_START` → `deps.copy(payload)` + `deps.open(url)`
    → `PLATFORM_DONE` (or `PLATFORM_ERROR` if open rejects). Platforms run
    sequentially (one clipboard write at a time) so the user can paste in each
    opened tab before the next.
- **`PROFILE_UPDATED`** (LinkedIn re-import or external profile save):
  `mergeExperiences(current, incoming)` (pure, core) dedups by
  `(company, title, startDate)` case-insensitively, keeping the local copy's
  `id`/`positionIndex`/`description` edits and unioning `skills`. Manual entries
  (`source: 'manual'`) are never overwritten by an import, only supplemented.

## Invariants

1. At most one edit session: `NEW`/`EDIT` are accepted only from `idle` or
   `error`. `adding`/`editing`/`saving`/`deleting` ignore them.
2. `saving`/`deleting` ignore all events until settled (no re-entrancy).
3. `PROFILE_UPDATED` during `saving`/`deleting`/`syncing` is **dropped** (never
   clobbers an in-flight op). It is applied only from `idle`/`ready`/terminal.
4. During `syncing`, one platform's failure never aborts the others (except a
   global clipboard denial, which fails all before any tab opens).
5. `positionIndex` is gapless and unique after every save/delete (recomputed).
6. An experience with `isCurrent: true` has `endDate === null`. The form enforces
   this; `SAVE_RESULT` normalizes it.
7. `syncStatus` terminal state (`synced`/`partial`/`error`) is derived from the
   per-platform statuses at `ALL_SETTLED`, not stored independently of them.
8. The sync operates on the **committed** experiences list, never on an unsaved
   `draft`. An open edit draft does not participate in sync.

## Public API (consumed by CvPage)

```ts
createCvExperienceStore(deps): {
  // reactive snapshot
  experiences: Experience[];
  feedStatus: FeedStatus;
  editStatus: EditStatus;
  draft: Experience | null;
  editingId: string | null;
  syncStatus: SyncStatus;
  platformStatuses: Map<string, PlatformSyncStatus>;
  lastSyncedAt: number | null;
  error: string | null;
  // feed
  load(): void;
  // edit
  newExperience(): void;
  editExperience(id: string): void;
  cancelEdit(): void;
  saveExperience(draft: Experience): void;
  deleteExperience(id: string): void;
  // sync
  startSync(): void;
  cancelSync(): void;
}
```

`deps` (shell-injected, mockable in tests):

```ts
interface CvExperienceDeps {
  loadExperiences(): Promise<Experience[]>;
  saveExperience(draft: Experience, isNew: boolean): Promise<Experience>;
  deleteExperience(id: string): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  platforms: PlatformSyncTarget[];
  now(): number;
  idPrefix: string;
}
```

## Pure helpers (core, unit-tested without mocks)

- `buildPlatformPayloads(experiences, targets): Map<id, string>` — formats the
  experiences into a per-platform text block.
- `mergeExperiences(current, incoming): Experience[]` — dedup + supplement.
- `recomputePositionIndex(experiences): Experience[]` — gapless ordering.
- `normalizeExperience(draft): Experience` — enforces isCurrent↔endDate, trims.
