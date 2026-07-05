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
*       ──PROFILE_UPDATED──► ready (external sync)
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
| `editing`    | -       | -               | ready (draft) | saving\*       | ready (ext)          | -                       |
| `ready`      | loading | editing (draft) | -             | saving\*       | ready (ext, no move) | -                       |
| `error`      | loading | editing (clear) | -             | saving\*       | ready (ext)          | saving (guard hasDraft) |
| `saving`     | ignored | ignored         | ignored       | ignored        | ignored              | ignored                 |

\* `SUBMIT_PROFILE` sets `draft = event.profile`, clears `error`, enters
`saving`, and invokes `deps.saveProfile(profile)`.

`(ext)` = `setExternalProfile`: `current = draft = event.profile; error = null`.

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

## Invariants

1. `error` is non-null iff `status === 'error'`.
2. `saving` always has a non-null `draft` (RETRY is guarded by `hasDraft`).
3. `saving` ignores all events until the save settles (no re-entrancy).
4. `PROFILE_UPDATED` from `saving` is dropped (never clobbers an in-flight save).

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
