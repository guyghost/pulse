# CV Experience Model

Source of truth for the CV tab behavior: a canonical, editable feed of
professional experiences. The former manual cross-platform synchronization
workflow (copy the CV to the clipboard, then open every platform) is retired.

Users keep MissionPulse open while visiting a target platform themselves. A
future in-page form assistant may propose field values from the canonical CV,
in the style of Grammarly, but that assistant is a separate workflow and MUST
be modeled before implementation. The CV page does not claim that this future
assistant is already available.

The LLM never decides a transition. It may propose field content inside a
dedicated AI worker; the model decides whether the user can accept it and how
it affects persisted state. **Le LLM produit des signaux ; le modèle décide.**

## Domain entity

### Experience (canonical, persisted on `UserProfile.experiences`)

```ts
interface Experience {
  id: string;
  title: string;
  company: string | null;
  employmentType: string | null;
  location: string | null;
  startDate: string | null; // ISO month "YYYY-MM" or null
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
  source: 'linkedin' | 'manual' | 'connector-import';
  sourceExternalId: string | null;
  positionIndex: number; // gapless, stable ordering (0 = most recent)
  updatedAt: number; // epoch ms injected by the shell
}
```

`employmentType` is persisted independently from `company`. Legacy values are
normalized to `null`; no IndexedDB migration is required because the profile
normalization boundary supplies the field.

## Machines

The Svelte 5 runes store composes two machines sharing the canonical
experiences list.

### 1. Feed machine — `feedStatus`

```text
loading ──LOAD_RESULT(ok)──► ready
loading ──LOAD_ERROR───────► error
error   ──RETRY────────────► loading
ready   ──RELOAD───────────► loading
idle/ready/error ──PROFILE_UPDATED──► ready
```

`FeedStatus = 'loading' | 'ready' | 'error'`. `ready` with zero experiences
renders the empty state. A load failure is terminal until the user retries or
the page is remounted.

### 2. Edit machine — `editStatus`

```text
idle    ──NEW──────────────► adding
idle    ──EDIT(id)─────────► editing
adding ──CANCEL────────────► idle
editing──CANCEL────────────► idle
adding/editing/error ──SUBMIT(valid draft)──► saving
saving ──SAVE_RESULT(ok)───► idle
saving ──SAVE_ERROR────────► error  (draft retained)
idle/error ──DELETE(id)────► deleting
deleting ──DELETE_RESULT───► idle
deleting ──DELETE_ERROR────► error
```

`EditStatus = 'idle' | 'adding' | 'editing' | 'saving' | 'deleting' | 'error'`.
Only one edit/delete operation may exist at a time.

## Context

```ts
interface CvExperienceContext {
  experiences: Experience[];
  feedStatus: FeedStatus;
  editStatus: EditStatus;
  draft: Experience | null;
  editingId: string | null;
  feedError: string | null;
  editError: string | null;
}
```

There is no `syncStatus`, per-platform status map, last-sync timestamp, or sync
error slot in the CV store.

## Events

```ts
type CvEvent =
  | { type: 'LOAD' }
  | { type: 'RELOAD' }
  | { type: 'RETRY' }
  | { type: 'PROFILE_UPDATED'; experiences: Experience[] }
  | { type: 'NEW' }
  | { type: 'EDIT'; id: string }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT'; draft: Experience }
  | { type: 'DELETE'; id: string }
  | { type: 'SAVE_RESULT'; experience: Experience }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'DELETE_RESULT'; id: string }
  | { type: 'DELETE_ERROR'; message: string };
```

`SYNC_START`, `SYNC_CANCEL`, `PREPARE_DONE`, `PLATFORM_*`, and `ALL_SETTLED`
are not valid CV events.

## Transition review

| From       | NEW     | EDIT    | CANCEL  | SUBMIT  | DELETE   | PROFILE_UPDATED |
| ---------- | ------- | ------- | ------- | ------- | -------- | --------------- |
| `idle`     | adding  | editing | -       | -       | deleting | ready           |
| `adding`   | ignored | ignored | idle    | saving  | ignored  | dropped         |
| `editing`  | ignored | ignored | idle    | saving  | ignored  | dropped         |
| `saving`   | ignored | ignored | ignored | ignored | ignored  | dropped         |
| `deleting` | ignored | ignored | ignored | ignored | ignored  | dropped         |
| `error`    | adding  | editing | idle    | saving  | deleting | ready           |

- Nominal: load, add, edit, save, delete, LinkedIn re-import.
- Errors: load/save/delete failures populate only their machine's error slot.
- Cancellation: only a local add/edit session is cancellable; persistence
  already in flight is not cancelled.
- Retry: load uses `reload`; a retained failed draft may be submitted again;
  delete may be requested again from `error`.
- Permissions: LinkedIn import permissions belong to the LinkedIn import model,
  not to the CV store. The CV store requests no host or clipboard permission.
- Terminal states: `ready`/`idle` are successful terminals; `error` is a stable
  recoverable terminal. No background platform-opening operation survives the
  page.

## Side effects

- `loadExperiences()` reads `UserProfile.experiences` through the profile bridge.
- `saveExperiences(experiences)` persists the complete normalized list through
  the profile bridge.
- The store never calls `navigator.clipboard`, never opens an external URL, and
  never enumerates connector targets.
- LinkedIn import remains owned by `linkedin-import.model.md`; its
  `PROFILE_UPDATED` message is applied only when no edit/save/delete is active.

## Public API

```ts
createCvExperienceStore(deps): {
  readonly experiences: Experience[];
  readonly feedStatus: FeedStatus;
  readonly editStatus: EditStatus;
  readonly draft: Experience | null;
  readonly editingId: string | null;
  readonly feedError: string | null;
  readonly editError: string | null;
  load(): void;
  reload(): void;
  applyProfileUpdate(experiences: Experience[]): void;
  newExperience(): void;
  editExperience(id: string): void;
  cancelEdit(): void;
  saveExperience(draft: Experience): void;
  deleteExperience(id: string): void;
}
```

```ts
interface CvExperienceDeps {
  loadExperiences(): Promise<Experience[]>;
  saveExperiences(experiences: Experience[]): Promise<void>;
  now(): number;
  generateId(): string;
}
```

## UI projection

- `CvPage` renders the page header, LinkedIn import action, optional profile
  navigation, offline notice, and `ExperienceFeed`.
- The manual "Synchronisation du CV" card and its "Synchroniser" button are
  absent in every feed/edit/network state.
- Adding or editing an experience is disabled only by the edit machine, never by
  a removed synchronization state.
- Copy must describe the CV as the canonical local source without promising
  automatic propagation to connected platforms.

## Invariants

1. At most one edit session exists.
2. `saving` and `deleting` reject re-entrant events until they settle.
3. `PROFILE_UPDATED` is dropped during adding/editing/saving/deleting and is
   accepted only from idle/error.
4. `positionIndex` is gapless and unique after every save/delete.
5. An experience with `isCurrent: true` has `endDate === null`.
6. `employmentType` never mutates `company` and does not affect deduplication.
7. The CV page and store have no manual clipboard/platform synchronization
   capability, hidden or visible.
8. The CV facade exposes profile load/save only; it has no connector catalogue,
   clipboard writer, or external-tab opener.
9. Future in-page assistance cannot be implemented as an implicit replacement:
   its states, permissions, page injection, user acceptance, errors, retries,
   and terminal states require their own model first.

## Pure helpers retained

- `mergeExperiences(current, incoming)` — dedup + controlled supplement.
- `recomputePositionIndex(experiences)` — gapless ordering.
- `normalizeExperience(draft)` — trims and enforces `isCurrent ↔ endDate`.

The retired `buildPlatformPayloads` helper is not part of the CV domain API.
