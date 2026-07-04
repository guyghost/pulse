# Undo Window — State Model (source of truth)

This document is the **authoritative spec** for the soft-delete undo window used by
destructive side-panel actions: **hide mission** and **delete saved view**.

Rule: _"Si le comportement ne peut pas être modélisé, il n'est pas prêt à être
implémenté. Si une transition d'état dépend d'un LLM, l'architecture est
incorrecte."_ There is **no LLM** anywhere in this flow. The reducer is pure; the
shell executes the effects it emits.

## Why a model

Before this model, `handleHide` / `deleteSavedView` used an **optimistic hard-delete +
restore-on-click** pattern: the deletion was persisted to `chrome.storage` the
instant the user clicked, and the "Annuler" toast only re-persisted the previous
state if clicked within ~6s. If the toast expired **or** the side panel closed
during the window, the data was already committed and **unrecoverable**.

The fix is a **soft-delete window**: while the window is open the action lives only
in memory (storage still holds the pre-action state); the action commits to storage
only when the window closes without an undo. Closing the panel mid-window is
safe-by-default — storage still has the data, so it reappears on next load.

## Scope

Applies to two actions (both initiated from the side panel):

| Action       | Target id    | Snapshot captured at REQUEST                | Restore on UNDO             | Commit on TIMEOUT/DISMISS         |
| ------------ | ------------ | ------------------------------------------- | --------------------------- | --------------------------------- |
| Hide mission | `mission.id` | previous `hidden: Record<id, ts>`           | `hidden` reverted in memory | persist final `hidden` to storage |
| Delete view  | `view.id`    | previous `savedViews` + `activeSavedViewId` | both reverted in memory     | persist final `savedViews`        |

## Per-target state machine

One instance per target id. The reducer (`core/undo/undo-window.ts`) manages a
**registry** of pending entries keyed by target id.

```
States:   idle · pending-undo · committed
Events:   REQUEST · UNDO · TIMEOUT · DISMISS
```

```
                       REQUEST(kind, targetId, snapshot, now, durationMs)
  idle ───────────────────────────────────────────────────────────► pending-undo
                                                                      │
                                          UNDO                        │
   idle ◄─────────────────────────────────────────── (restore) ◄──────┤
                                                                      │
                                          TIMEOUT / DISMISS           │
   committed ◄───────────────────────────────────── (commit) ◄────────┘
                                  terminal
```

### Transition table

| from         | event                            | to           | Effect emitted to the shell                                  |
| ------------ | -------------------------------- | ------------ | ------------------------------------------------------------ |
| idle         | REQUEST                          | pending-undo | `start-timer` (deadline = now + durationMs); show undo toast |
| pending-undo | UNDO                             | idle         | `restore(snapshot)`; cancel-timer; dismiss toast             |
| pending-undo | TIMEOUT (shell timer fired)      | committed    | `commit(snapshot)`; dismiss toast                            |
| pending-undo | REQUEST (same target, same kind) | pending-undo | `cancel-timer` + `start-timer` (re-arm; snapshot replaced)   |
| committed    | \*                               | committed    | terminal — no-op                                             |

**Timer ownership (shell):** the shell owns exactly one `setTimeout` per pending
target, started on `start-timer` and cleared on `cancel-timer` / panel destroy. The
undo toast is a **non-authoritative visual**: its internal auto-dismiss timer and its
close button are cosmetic — clicking the toast's `×` does **not** commit early; the
undo window simply runs its full duration unless the user clicks **Annuler**. This
keeps a single source of timing truth (the shell timer) and avoids double-timer bugs.

`EXPIRE_ALL(now)` is a bulk safety primitive the shell may call on unload: for every
pending entry whose `deadline <= now`, emit `commit`. In practice the shell clears its
timers on unload and commits nothing (safe-by-default, invariant I5), so `EXPIRE_ALL`
is a documented escape hatch rather than part of the happy path.

## Invariants

- **I1 — One entry per target.** At most one pending entry per `targetId`. A second
  REQUEST for the same `(targetId, kind)` re-arms the timer and replaces the
  snapshot. A REQUEST for the same `targetId` with a _different_ `kind` is rejected
  (returns `none`); the shell must never issue conflicting kinds for one target.
- **I2 — Storage is the commit step, never the request step.** While any entry is
  `pending-undo`, `chrome.storage` MUST still contain the pre-action collection.
  `REQUEST` emits only `start-timer`, never `commit`. Persistence happens solely on
  `TIMEOUT` / `DISMISS` / `EXPIRE_ALL`.
- **I3 — Snapshots are immutable.** `UNDO` restores the exact object captured at
  REQUEST. The reducer never mutates a snapshot.
- **I4 — Deadlines are deterministic.** `deadline === requestedAt + durationMs`.
  `now` and `durationMs` are injected (no `Date.now()` in core).
- **I5 — Safe-by-default on unload.** If the panel closes while `pending-undo`,
  in-memory state is lost but storage holds the pre-action state → the mission/view
  reappears on next load. No silent data loss.
- **I6 — Timers are cancellable.** `UNDO`, a re-arm, and panel destroy all cancel
  the active shell timer so no late `TIMEOUT` fires against a restored target.

## Constants

- `DEFAULT_UNDO_WINDOW_MS = 5000` (PRODUCT.md: 5s undo window).

## Executable model

`apps/extension/src/core/undo/undo-window.ts` — pure reducer returning
`{ state, effect }`. Fully unit-tested with no I/O, no timers, no `Date.now`.
The shell (`lib/state/feed-page.svelte.ts`) owns: timers, `chrome.storage`
persistence, toast display, and in-memory collection mutation.
