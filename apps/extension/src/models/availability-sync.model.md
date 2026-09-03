# Availability Sync Model

Source of truth for the "Disponibilité" block shown in the **Suivi** tab
(`ApplicationsPage`): the freelancer declares when they are next available, the
value is persisted on `UserProfile`, and a cross-platform **push** copies a
formatted availability message to the clipboard then opens each mission
connector so the user can paste it manually.

Modeled as two cooperating state machines in a Svelte 5 runes module
(`src/lib/state/availability.svelte.ts`), per the project standard (runes over
XState — see `profile-state.model.md`). Availability owns this guided-paste
transport independently: the CV manual synchronization workflow has been
retired. No backend, no stored credentials — local-first.

The LLM never decides a transition here. **Le LLM produit des signaux ; le
modèle décide.** (No LLM is involved in this feature at all.)

## Why not auto-write?

The extension cannot mutate platform state directly: it has no stored
credentials and no backend. The availability "push" is a **guided paste**:
copy the formatted payload, open the platform's profile page, let the user
paste. This is the only transport compatible with the architecture.

## Domain entities

### Availability (canonical, persisted on `UserProfile.availability`)

```ts
type AvailabilityStatus = 'immediate' | 'from-date' | 'in-mission-until' | 'unavailable';

interface Availability {
  status: AvailabilityStatus;
  /**
   * ISO date "YYYY-MM-DD". Semantics depend on status:
   * - 'from-date'        → first available day
   * - 'in-mission-until' → last day of the current mission
   * - 'immediate'        → must be null
   * - 'unavailable'      → must be null
   */
  date: string | null;
  note: string; // free text, trimmed, ≤ 280 chars
  updatedAt: number; // epoch ms (injected by shell)
}
```

`UserProfile` is extended with `availability: Availability | null` (default
`null` = never set). Scoring ignores it. The schema declares it with
`.default(null)` so any stored record created before this field existed is
backfilled to `null` on read (idempotent — no structural/data migration needed;
reads always parse through `UserProfileSchema`). `withProfileDefaults` also
seeds it.

### AvailabilityStatus labels (copy + a11y)

```ts
const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  immediate: 'Disponible immédiatement',
  'from-date': 'Disponible à partir du',
  'in-mission-until': 'En mission jusqu'au',
  unavailable: 'Non disponible',
};
```

### PushTarget (reuse the CV sync target shape)

```ts
interface PlatformSyncTarget {
  id: string;
  name: string;
  profileUrl: string;
}
```

Targets = the 6 mission connectors (`getConnectorsMeta()`). LinkedIn is **not**
included (user choice). `profileUrl` defaults to `connector.url`; per-platform
availability-edit URLs can replace it later without touching the machine.

## Machines

The store composes two machines. The edit/load machine and the push machine are
independent: editing does not block a running push, and a running push does not
block editing (edits persist on the next save and participate in the next push).

### 1. Load/Edit machine — `editStatus`

```
loading ──LOAD_RESULT(ok)──► ready
loading ──LOAD_ERROR──►      error
error   ──RETRY──►           loading
ready   ──RELOAD──►          loading
ready   ──EDIT────────► dirty (draft = copy of availability, or blank when null)
dirty   ──CANCEL──►    ready (draft discarded)
dirty   ──SUBMIT──►    saving
saving  ──SAVE_RESULT(ok)──► ready  (draft committed)
saving  ──SAVE_ERROR──►     dirty   (draft retained for RETRY)
dirty   ──SAVE_RESULT──► (n/a — saving gates this)
*       ──PROFILE_UPDATED──► ready (availability replaced when not in saving)
```

`EditStatus = 'loading' | 'ready' | 'dirty' | 'saving' | 'error'`.

`ready` with `availability === null` renders the empty state
("Renseignez votre disponibilité pour la pousser sur vos plateformes").

`dirty` holds a `draft: Availability` (a deep copy of the current availability,
or a blank `{ status: 'immediate', date: null, note: '', updatedAt: 0 }` when
starting from null). The form binds directly to `draft`; nothing is persisted
until `SUBMIT`.

### 2. Push machine — `pushStatus`

```
idle      ──PUSH_START──►        preparing
preparing ──PREPARE_DONE──►      pushing  (per-platform: pending)
preparing ──PREPARE_ERROR──►     error    (no availability set)
pushing   ──PLATFORM_START(id)──► pushing  (platform → copying)
pushing   ──PLATFORM_DONE(id)──►  pushing  (platform → done)
pushing   ──PLATFORM_ERROR(id)──► pushing  (platform → error)
pushing   ──PUSH_CANCEL──►       cancelled (remaining platforms → skipped)
pushing   ──ALL_SETTLED──►       pushed | partial | error
cancelled ──PUSH_START──►        preparing
pushed|partial|error ──PUSH_START──► preparing
```

`PushStatus = 'idle' | 'preparing' | 'pushing' | 'cancelled' | 'pushed' | 'partial' | 'error'`.

Per-platform status lives in `Map<platformId, PlatformSyncStatus>` and is only
meaningful while `pushStatus` is `pushing`/terminal. It resets on `PUSH_START`.

```
type PlatformSyncStatus =
  | 'pending' | 'copying' | 'done'
  | 'error' | 'auth-required' | 'blocked' | 'skipped';
```

(Reused verbatim from the CV sync — same semantics, same UI chips.)

## Context

```ts
interface AvailabilityContext {
  availability: Availability | null; // canonical, persisted
  editStatus: EditStatus;
  draft: Availability | null; // non-null in dirty/saving
  pushStatus: PushStatus;
  platformStatuses: Map<string, PlatformSyncStatus>;
  lastPushedAt: number | null; // epoch ms
  loadError: string | null;
  editError: string | null;
  pushError: string | null;
}
```

## Events

```ts
type AvailabilityEvent =
  // Load
  | { type: 'LOAD' }
  | { type: 'RELOAD' }
  | { type: 'RETRY' }
  | { type: 'PROFILE_UPDATED'; availability: Availability | null }
  // Edit
  | { type: 'EDIT' }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT'; draft: Availability }
  | { type: 'SAVE_RESULT'; availability: Availability }
  | { type: 'SAVE_ERROR'; message: string }
  // Push
  | { type: 'PUSH_START' }
  | { type: 'PREPARE_DONE'; payloads: Map<string, string> }
  | { type: 'PREPARE_ERROR'; message: string }
  | { type: 'PLATFORM_START'; id: string }
  | { type: 'PLATFORM_DONE'; id: string }
  | { type: 'PLATFORM_ERROR'; id: string; status: 'error' | 'auth-required' | 'blocked' }
  | { type: 'PUSH_CANCEL' }
  | { type: 'ALL_SETTLED' };
```

## Transition table (edit + push; load is trivial above)

| From \ Event   | EDIT    | CANCEL  | SUBMIT  | SAVE_RESULT | SAVE_ERROR | PUSH_START | PROFILE_UPDATED |
| -------------- | ------- | ------- | ------- | ----------- | ---------- | ---------- | --------------- |
| `loading`      | -       | -       | -       | -           | -          | (push)     | dropped         |
| `ready`        | dirty   | -       | -       | -           | -          | allowed    | ready (replace) |
| `dirty`        | -       | ready   | saving  | -           | -          | allowed\*  | dropped         |
| `saving`       | ignored | ignored | ignored | ready       | dirty      | ignored    | dropped         |
| `error` (edit) | dirty   | ready   | saving  | -           | -          | allowed\*  | ready (replace) |

\* `PUSH_START` is allowed while a draft is open (draft is preserved; push
operates on the **committed** availability, not the draft). The two machines
are independent.

| From \ Event (push) | PUSH_START | PREPARE_DONE | PLATFORM\_\* | PUSH_CANCEL | ALL_SETTLED | PROFILE_UPDATED |
| ------------------- | ---------- | ------------ | ------------ | ----------- | ----------- | --------------- |
| `idle`              | preparing  | -            | -            | -           | -           | idle (replace)  |
| `preparing`         | ignored    | pushing      | -            | idle        | -           | dropped         |
| `pushing`           | ignored    | -            | updates pm   | cancelled   | terminal    | dropped         |
| `cancelled`         | preparing  | -            | -            | -           | -           | idle (replace)  |
| `pushed/partial/er` | preparing  | -            | -            | -           | -           | idle (replace)  |

## Side effects (shell — `deps`)

- **Enter `loading`** (LOAD/RELOAD/RETRY): `deps.loadAvailability()` reads
  `UserProfile.availability` via the profile bridge. Resolves → `ready`;
  rejects → `error`.
- **Enter `saving`** (SUBMIT): `normalizeAvailability(draft, now)` (pure, core)
  enforces the status↔date invariant and trims/caps the note, then
  `deps.saveAvailability(normalized)` merges it into the persisted profile.
  Resolves → `SAVE_RESULT(availability)`; rejects → `SAVE_ERROR`, `draft`
  retained.
- **Enter `preparing`** (PUSH_START): if `availability === null` →
  `PREPARE_ERROR`. Else pure `buildAvailabilityPayloads(availability, targets)`
  in core → `PREPARE_DONE(payloads)`.
- **Enter `pushing`** (PREPARE_DONE): `deps.pushAll(payloads)` iterates targets.
  Clipboard write is attempted **once globally** before any platform opens:
  - Clipboard denied → every platform → `error`, `ALL_SETTLED` → `error`.
  - Else, per platform: `PLATFORM_START` → `deps.open(url)` → `PLATFORM_DONE`
    (or `PLATFORM_ERROR` if open rejects). Platforms run sequentially so the
    user can paste in each opened tab before the next. The payload stays on the
    clipboard from the global probe (re-copying would fail once the first tab
    steals focus — no `clipboardWrite` permission; `navigator.clipboard` needs
    transient activation).
- **`PROFILE_UPDATED`** (external save / re-import): replaces `availability`
  when the load/edit machine is `ready`/`error` and the push machine is not
  busy. Applied from terminal push states too (resets the push machine to
  `idle`). Dropped during `saving`/`preparing`/`pushing` (invariant 3).

## Invariants

1. `dirty`/`saving` are gated by `editStatus`: `EDIT` is accepted only from
   `ready` or `error`. `loading`/`saving` ignore it.
2. `saving` ignores all edit events until settled (no re-entrancy).
3. `PROFILE_UPDATED` during `saving`/`preparing`/`pushing` is **dropped** (never
   clobbers an in-flight op). Applied only from `ready`/`error`/terminal push.
4. During `pushing`, one platform's failure never aborts the others (except a
   global clipboard denial, which fails all before any tab opens).
5. **status↔date invariant** (enforced by `normalizeAvailability`):
   - `immediate` / `unavailable` ⇒ `date === null`
   - `from-date` / `in-mission-until` ⇒ `date` is a valid `YYYY-MM-DD`
6. `note` is trimmed and capped at 280 characters by the normalizer; the form
   also enforces the cap, but the normalizer is the source of truth.
7. `pushStatus` terminal state (`pushed`/`partial`/`error`) is **derived** from
   the per-platform statuses at `ALL_SETTLED`, not stored independently.
8. The push operates on the **committed** `availability`, never on an unsaved
   `draft`. An open draft does not participate in the push.
9. Error slots are per-machine (`loadError`/`editError`/`pushError`): a failure
   in one never overwrites another machine's terminal error copy.
10. `canPush === availability !== null && editStatus !== 'saving' && !isPushBusy`.

## Public API (consumed by ApplicationsPage via an organism)

```ts
createAvailabilityStore(deps): {
  // reactive snapshot
  availability: Availability | null;
  editStatus: EditStatus;
  draft: Availability | null;
  pushStatus: PushStatus;
  platformStatuses: Map<string, PlatformSyncStatus>;
  lastPushedAt: number | null;
  loadError: string | null;
  editError: string | null;
  pushError: string | null;
  canPush: boolean;
  isPushing: boolean;
  // load
  load(): void;
  // edit
  startEdit(): void;
  cancelEdit(): void;
  saveAvailability(draft: Availability): void;
  // push
  startPush(): void;
  cancelPush(): void;
  // external merge
  applyProfileUpdate(availability: Availability | null): void;
}
```

`deps` (shell-injected, mockable in tests):

```ts
interface AvailabilityDeps {
  loadAvailability(): Promise<Availability | null>;
  saveAvailability(availability: Availability): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  platforms: PlatformSyncTarget[];
  now(): number;
}
```

## Pure helpers (core, unit-tested without mocks)

Location: `src/lib/core/availability/availability-helpers.ts`.

- `normalizeAvailability(draft, now): Availability` — enforces status↔date,
  trims/caps note (280), validates `YYYY-MM-DD`. Throws nothing; clamps.
- `formatAvailabilityPayload(availability): string` — the copy-pasteable block:
  - `immediate` → "Disponible immédiatement"
  - `from-date` → "Disponible à partir du DD/MM/YYYY"
  - `in-mission-until` → "En mission jusqu'au DD/MM/YYYY"
  - `unavailable` → "Non disponible"
  - - note on a new line when non-empty.
- `buildAvailabilityPayloads(availability, targets): Map<id, string>` — same
  payload string for every target (platforms format availability identically).
- `AVAILABILITY_STATUS_LABELS` + `AVAILABILITY_STATUS_ORDER` (select order).

## UI placement

A new organism `AvailabilityPanel.svelte` (edit form + push list in a standalone
status card) is inserted at the **top** of `ApplicationsPage.svelte`
(before the existing pipeline section), so availability is the first action in
the Suivi tab. It receives the store + the platform targets from the facade.

## Persistence & migration

- `UserProfile.availability: Availability | null` (type, required — always
  present via `withProfileDefaults`).
- `UserProfileSchema`: `availability` field with `.default(null)` and a nullable
  object sub-schema. Reads of pre-existing records backfill to `null` on parse.
- `withProfileDefaults`: `availability: profile.availability ?? null`.
- **No data migration needed.** The schema default is idempotent and runs on
  every read. (Documented here so the next contributor doesn't add a redundant
  v2→v3 migration.)

## Review checklist (Model → Review)

- [x] Nominal: set availability → save → push → all platforms `done` → `pushed`.
- [x] Empty: `availability === null` → `PUSH_START` → `PREPARE_ERROR`, no tab
      opens.
- [x] Cancel mid-push: `PUSH_CANCEL` during `pushing` → remaining platforms
      `skipped`, terminal `cancelled` (not `pushed`).
- [x] Clipboard denied globally: every platform → `error`, terminal `error`,
      no tab opens.
- [x] Per-platform `openUrl` reject → that platform `error`, others continue,
      terminal `partial` if ≥1 done.
- [x] Edit during push: allowed; draft preserved; push uses committed value.
- [x] Push during dirty draft: allowed; uses committed availability, not draft.
- [x] `PROFILE_UPDATED` during `saving`/`pushing`: dropped (invariant 3).
- [x] status↔date invariant enforced by normalizer (form + model + tests).
- [x] Terminal push state derived from per-platform statuses (invariant 7).
- [x] No LLM in the loop; no transition depends on free text. **Le LLM produit
      des signaux ; le modèle décide.** (Here: no LLM at all.)
