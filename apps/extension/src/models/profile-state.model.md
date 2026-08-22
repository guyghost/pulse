# Profile State Model

Source of truth for the profile lifecycle state. Replaces the former XState
`profile.machine.ts` with an idiomatic Svelte 5 runes module. The state graph,
transitions, side effects, and invariants are preserved 1:1 from the machine.

## Why runes instead of XState

XState added a 42.88 kB (gzip 13.79 kB) lazy chunk on the OnboardingPage and
SettingsPage routes for a 6-state CRUD machine. The project standard is Svelte 5
runes in `.svelte.ts` modules (see AGENTS.md). The machine's behavior is simple
enough to model directly with `$state` + an explicit transition function, so the
dependency is removed.

## States

```
loading ──load()──► ready   (profile found)
loading ──load()──► missing (no profile)
loading ──load()──► error   (load threw)
missing ──SUBMIT──► saving ──save()──► ready | error
ready   ──EDIT───► editing
editing ──CANCEL──► ready
editing ──SUBMIT──► saving
error   ──RETRY (hasDraft)──► saving
error   ──EDIT───► editing
ready   ──PROFILE_UPDATED──► ready (external sync)
editing ──PROFILE_UPDATED──► editing (external sync, draft preserved)
saving  ──PROFILE_UPDATED──► saving (external sync deferred, applied on settle)
*       ──LOAD──► loading (except from `saving`)
```

`ProfileStatus = 'loading' | 'missing' | 'editing' | 'saving' | 'ready' | 'error'`

## Context

- `current: UserProfile | null` — last loaded / saved profile.
- `draft: UserProfile | null` — in-progress edit or submitted profile.
- `error: string | null` — non-null only in the `error` state.

## Events and transition table

| From \ Event | LOAD    | EDIT            | CANCEL        | SUBMIT_PROFILE | PROFILE_UPDATED      | RETRY                   |
| ------------ | ------- | --------------- | ------------- | -------------- | -------------------- | ----------------------- |
| `loading`    | -       | -               | -             | saving\*       | ready (ext)          | -                       |
| `missing`    | loading | -               | -             | saving\*       | ready (ext)          | -                       |
| `editing`    | -       | -               | ready (draft) | saving\*       | editing (ext, draft) | -                       |
| `ready`      | loading | editing (draft) | -             | saving\*       | ready (ext, no move) | -                       |
| `error`      | loading | editing (clear) | -             | saving\*       | ready (ext)          | saving (guard hasDraft) |
| `saving`     | ignored | ignored         | ignored       | ignored        | saving (ext def.)    | ignored                 |

\* `SUBMIT_PROFILE` sets `draft = event.profile`, clears `error`, enters
`saving`, and invokes `deps.saveProfile(profile)`.

`(ext)` = `setExternalProfile`: `current = draft = event.profile; error = null`.

`(ext, draft)` = external sync while editing: `current = event.profile` only.
The user's unsaved `draft` is **preserved** — an external writer (LinkedIn
import, availability sync, another panel saving) must never silently revert
fields the user is typing (e.g. `jobTitle`). A later CANCEL returns to the
freshest external truth.

`(ext def.)` = external sync while saving: the payload is parked as
`pendingExternal` and the state stays `saving` (no re-entrancy). When the
in-flight `runSave` settles — success or failure — the deferred payload is
applied with the `(ext)` semantics of the settled state (`current = draft =
payload`, `error` cleared). The store's own `PROFILE_UPDATED` echo lands here
too and is idempotent (same payload `runSave` just persisted). This keeps
`current` — the merge base consumers use for the next save — fresh through
the whole save window.

## Side effects

- **Enter `loading`**: invoke `deps.loadProfile()`.
  - Resolves with profile → `ready`, `current = draft = profile`.
  - Resolves null → `missing`, `current = draft = null`.
  - Rejects → `error`, `error = message`.
- **Enter `saving`** (via `SUBMIT_PROFILE` or `RETRY`): invoke
  `deps.saveProfile(draft)`.
  - Resolves → `ready`, `current = draft = output`.
  - Rejects → `error`, `error = message`.

The store auto-loads on creation (mirrors the machine's `initial: 'loading'`
with an invoked `loadProfile` actor).

## Service worker SAVE_PROFILE ordering

The save contract spans the bridge. The service worker handler MUST order its
side effects so the ack never waits on post-commit projections:

1. `saveProfile(payload)` — persist to IndexedDB (clears the semantic cache).
2. `sendResponse(PROFILE_RESULT)` — **ack immediately**. The side panel's
   save button and the actor's `saving → ready` transition depend on it.
3. Broadcast `PROFILE_UPDATED` — depends only on persistence success.
4. Post-commit projection: `rescoreStoredMissions` (full-mission rescore,
   Gemini Nano semantic scoring) → broadcast `MISSIONS_UPDATED`. Failures are
   logged and non-blocking: scores simply refresh on the next scan.

This mirrors the scan-flow precedent (ack before suspendable projections).
The reverse order blocks the UI for the whole rescore and, combined with
broadcasts from other writers, races the editor.

### Post-save rescore orchestration

Because the ack no longer holds the message channel open, the rescore must
not rely on it to keep the service worker alive, and rapid saves must not
run concurrent read-modify-write cycles over the mission store:

- **Keepalive**: the rescore runs wrapped in a keepalive ping (cheap
  `chrome.runtime` call every < 30 s) so a long Gemini Nano pass cannot be
  killed mid-projection by the MV3 idle timeout.
- **Serialization + coalescing**: at most one rescore is in flight. Saves
  arriving while a rescore runs park their profile; when the current rescore
  finishes, the latest parked profile runs next (intermediate ones are
  coalesced away). Final persisted scores therefore always match the latest
  saved profile, in save order.

## Invariants

1. `error` is non-null iff `status === 'error'`.
2. `saving` always has a non-null `draft` (RETRY is guarded by `hasDraft`).
3. `saving` ignores all events until the save settles (no re-entrancy) —
   except `PROFILE_UPDATED`, which is deferred (see `(ext def.)`) and applied
   when the save settles.
4. A deferred or live `PROFILE_UPDATED` never clobbers an in-flight save's
   persistence: it only refreshes `current` (+ `draft` once not editing).
5. An external `PROFILE_UPDATED` never discards unsaved edits: from `editing`
   it refreshes `current` only, and consumers (SettingsPage) must not mirror
   an external payload into form fields while `editingProfile` or a save is
   in flight. On CANCEL, consumers MUST re-seed the form fields from
   `current` (seed-only, without re-sending `PROFILE_UPDATED` to the actor)
   so the read-only view reflects the freshest persisted truth, not the
   abandoned draft.
6. The save ack (`PROFILE_RESULT`) is sent as soon as persistence succeeds —
   never after the post-commit rescore.
7. Merge-base freshness: `SettingsPage.saveProfile` merges editable fields
   onto the actor's `current` (no re-read roundtrip). `current` is therefore
   authoritative — every persisted write must be reflected in it, including
   external writes that land during the `saving` window (invariant 4's
   deferral).

## Public API (consumed by OnboardingPage + SettingsPage)

```ts
createProfileStore(deps): {
  snapshot: {
    value: ProfileStatus;
    context: { current, draft, error };
    matches(state: ProfileStatus): boolean;
  };
  send(event: ProfileEvent): void;
  subscribe(listener: (snapshot) => void): () => void;
}
```

- `snapshot` is reactive: reads of `value` / `context.*` / `matches()` inside a
  `$derived` or template track the underlying `$state`.
- `subscribe` fires the listener on every transition or context change. Used by
  the `submitProfile` promise pattern (subscribe → send SUBMIT → await
  ready/error).
- The same surface the XState actor exposed, so consumers swap the constructor
  with a one-line import change.
