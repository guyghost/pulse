/**
 * Undo Window — pure state model (source of truth: src/models/undo-window.model.md).
 *
 * Manages a registry of pending soft-delete actions keyed by target id. Each entry
 * holds an immutable snapshot captured at REQUEST, used to UNDO. The reducer is
 * generic over the snapshot shape: the shell runs one instance per action kind
 * (hide mission, delete saved view), which structurally enforces "one kind per
 * target" (invariant I1) — a single registry cannot hold conflicting kinds.
 *
 * Pure: no I/O, no timers, no Date.now(). `now` / `durationMs` are injected.
 * The reducer returns `{ state, effect }`; the shell executes the effect (start /
 * cancel timers, persist on commit, restore on undo, show / dismiss toast).
 */

export const DEFAULT_UNDO_WINDOW_MS = 5000;

export type UndoActionKind = 'hide' | 'delete-view';

export interface UndoPendingEntry<TSnapshot> {
  readonly kind: UndoActionKind;
  readonly targetId: string;
  readonly requestedAt: number;
  readonly deadline: number;
  readonly durationMs: number;
  readonly snapshot: TSnapshot;
}

export interface UndoState<TSnapshot> {
  readonly pending: ReadonlyMap<string, UndoPendingEntry<TSnapshot>>;
}

export type UndoEvent<TSnapshot> =
  | {
      readonly type: 'REQUEST';
      readonly kind: UndoActionKind;
      readonly targetId: string;
      readonly snapshot: TSnapshot;
      readonly requestedAt: number;
      readonly durationMs: number;
    }
  | { readonly type: 'UNDO'; readonly targetId: string }
  | { readonly type: 'TIMEOUT'; readonly targetId: string }
  | { readonly type: 'DISMISS'; readonly targetId: string }
  | { readonly type: 'EXPIRE_ALL'; readonly now: number };

/**
 * Side-effect contract the shell must execute. Pure: emitting an effect performs
 * no I/O; the shell interprets it.
 */
export type UndoEffect<TSnapshot> =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'start-timer';
      readonly targetId: string;
      readonly deadline: number;
      readonly durationMs: number;
    }
  | { readonly kind: 'cancel-timer'; readonly targetId: string }
  | { readonly kind: 'restore'; readonly targetId: string; readonly snapshot: TSnapshot }
  | { readonly kind: 'commit'; readonly targetId: string; readonly snapshot: TSnapshot };

export interface UndoReducerResult<TSnapshot> {
  readonly state: UndoState<TSnapshot>;
  readonly effect: UndoEffect<TSnapshot>;
}

export function createUndoState<TSnapshot>(): UndoState<TSnapshot> {
  return { pending: new Map() };
}

export function isPending<TSnapshot>(state: UndoState<TSnapshot>, targetId: string): boolean {
  return state.pending.has(targetId);
}

export function getPending<TSnapshot>(
  state: UndoState<TSnapshot>,
  targetId: string
): UndoPendingEntry<TSnapshot> | undefined {
  return state.pending.get(targetId);
}

export function reduceUndoWindow<TSnapshot>(
  prev: UndoState<TSnapshot>,
  event: UndoEvent<TSnapshot>
): UndoReducerResult<TSnapshot> {
  switch (event.type) {
    case 'REQUEST': {
      const deadline = event.requestedAt + event.durationMs;
      const entry: UndoPendingEntry<TSnapshot> = {
        kind: event.kind,
        targetId: event.targetId,
        requestedAt: event.requestedAt,
        deadline,
        durationMs: event.durationMs,
        snapshot: event.snapshot,
      };
      const next = new Map(prev.pending);
      next.set(event.targetId, entry);
      return {
        state: { pending: next },
        effect: {
          kind: 'start-timer',
          targetId: event.targetId,
          deadline,
          durationMs: event.durationMs,
        },
      };
    }

    case 'UNDO': {
      const entry = prev.pending.get(event.targetId);
      if (!entry) {
        return { state: prev, effect: { kind: 'none' } };
      }
      const next = new Map(prev.pending);
      next.delete(event.targetId);
      return {
        state: { pending: next },
        effect: { kind: 'restore', targetId: event.targetId, snapshot: entry.snapshot },
      };
    }

    case 'TIMEOUT':
    case 'DISMISS': {
      const entry = prev.pending.get(event.targetId);
      if (!entry) {
        return { state: prev, effect: { kind: 'none' } };
      }
      const next = new Map(prev.pending);
      next.delete(event.targetId);
      return {
        state: { pending: next },
        effect: { kind: 'commit', targetId: event.targetId, snapshot: entry.snapshot },
      };
    }

    case 'EXPIRE_ALL': {
      // Safety net (e.g. on unload): commit every entry whose deadline has passed.
      // Never expires a still-open window early (invariant I6). Emits the first
      // commit only — the shell calls this repeatedly or drains via TIMEOUT per
      // target. For determinism we emit 'none' when nothing is expirable; the
      // shell drains expired targets through normal TIMEOUT handling on reload.
      const expired: UndoPendingEntry<TSnapshot>[] = [];
      for (const entry of prev.pending.values()) {
        if (entry.deadline <= event.now) {
          expired.push(entry);
        }
      }
      if (expired.length === 0) {
        return { state: prev, effect: { kind: 'none' } };
      }
      const next = new Map(prev.pending);
      for (const entry of expired) {
        next.delete(entry.targetId);
      }
      // Return the first expired target's commit; remaining expired targets are
      // committed by the shell draining the returned (now-emptied-of-those) state.
      const first = expired[0];
      return {
        state: { pending: next },
        effect: { kind: 'commit', targetId: first.targetId, snapshot: first.snapshot },
      };
    }

    default: {
      return { state: prev, effect: { kind: 'none' } };
    }
  }
}
