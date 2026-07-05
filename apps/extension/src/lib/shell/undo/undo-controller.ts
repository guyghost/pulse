/**
 * Undo Controller — shell-side orchestration over the pure undo-window reducer.
 *
 * Owns the things the core model must not: `Date.now()` (timer base), `setTimeout`
 * (the single source of timing truth), and the undo toast. The reducer decides
 * every transition; this controller only executes the effects it emits.
 *
 * Soft-delete contract (src/models/undo-window.model.md): while a target is
 * pending, the shell must NOT have persisted the destructive change. `onCommit`
 * is the only place persistence happens. `onRestore` reverts in-memory state only
 * (storage was never written). On `dispose`, pending timers are cancelled and
 * nothing is committed — safe-by-default (storage still holds pre-action state).
 */

import {
  createUndoState,
  reduceUndoWindow,
  DEFAULT_UNDO_WINDOW_MS,
  type UndoActionKind,
  type UndoEffect,
  type UndoState,
} from '$lib/core/undo/undo-window';
import { dismissToast, showToastAction } from '$lib/shell/notifications/toast-service';

export interface UndoControllerOptions<TSnapshot> {
  readonly kind: UndoActionKind;
  readonly durationMs?: number;
  /**
   * Persist the post-action state for one target. Called exactly once when that
   * target's window commits. `stillPending` lists OTHER targets whose windows are
   * still open (snapshots included) so the committer can exclude them — e.g. hide
   * must not persist another mission whose undo window is still open.
   */
  readonly onCommit: (
    targetId: string,
    snapshot: TSnapshot,
    context: {
      readonly stillPending: ReadonlyArray<{
        readonly targetId: string;
        readonly snapshot: TSnapshot;
      }>;
    }
  ) => void;
  /** Revert in-memory state to the captured snapshot. Storage was never written. */
  readonly onRestore: (targetId: string, snapshot: TSnapshot) => void;
  /** Toast message shown when the window opens. */
  readonly toastMessage: (targetId: string, snapshot: TSnapshot) => string;
}

export interface UndoController<TSnapshot> {
  /** Open (or re-arm) the undo window for a target. Captures an immutable snapshot. */
  request(targetId: string, snapshot: TSnapshot): void;
  /** True while the window is open for this target. */
  isPending(targetId: string): boolean;
  /** Cancel all pending timers without committing (safe-by-default on unload). */
  dispose(): void;
}

export function createUndoController<TSnapshot>(
  opts: UndoControllerOptions<TSnapshot>
): UndoController<TSnapshot> {
  const durationMs = opts.durationMs ?? DEFAULT_UNDO_WINDOW_MS;
  let state: UndoState<TSnapshot> = createUndoState();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const toastIds = new Map<string, number>();

  function pendingSnapshotsExcept(exclude: string): { targetId: string; snapshot: TSnapshot }[] {
    const out: { targetId: string; snapshot: TSnapshot }[] = [];
    for (const entry of state.pending.values()) {
      if (entry.targetId !== exclude) {
        out.push({ targetId: entry.targetId, snapshot: entry.snapshot });
      }
    }
    return out;
  }

  function clearToast(targetId: string): void {
    const id = toastIds.get(targetId);
    if (id !== undefined) {
      dismissToast(id);
      toastIds.delete(targetId);
    }
  }

  function clearTimer(targetId: string): void {
    const existing = timers.get(targetId);
    if (existing !== undefined) {
      clearTimeout(existing);
      timers.delete(targetId);
    }
  }

  function applyEffect(effect: UndoEffect<TSnapshot>): void {
    switch (effect.kind) {
      case 'start-timer': {
        clearTimer(effect.targetId);
        // Re-arm clears any lingering toast from a previous window for this target.
        clearToast(effect.targetId);
        const entry = state.pending.get(effect.targetId);
        if (entry) {
          const toastId = showToastAction(
            opts.toastMessage(effect.targetId, entry.snapshot),
            'info',
            {
              label: 'Annuler',
              onClick: () => undo(effect.targetId),
            },
            durationMs
          );
          if (toastId !== undefined) {
            toastIds.set(effect.targetId, toastId);
          }
        }
        const timer = setTimeout(() => {
          timers.delete(effect.targetId);
          timeout(effect.targetId);
        }, durationMs);
        timers.set(effect.targetId, timer);
        break;
      }
      case 'restore': {
        clearTimer(effect.targetId);
        clearToast(effect.targetId);
        opts.onRestore(effect.targetId, effect.snapshot);
        break;
      }
      case 'commit': {
        clearTimer(effect.targetId);
        clearToast(effect.targetId);
        const stillPending = pendingSnapshotsExcept(effect.targetId);
        opts.onCommit(effect.targetId, effect.snapshot, { stillPending });
        break;
      }
      case 'commit-all': {
        for (const entry of effect.entries) {
          clearTimer(entry.targetId);
          clearToast(entry.targetId);
        }
        // After EXPIRE_ALL, the reducer removed every expired entry; `state.pending`
        // holds only GENUINELY still-open windows. A batch sibling is committing too,
        // so it is NOT "still pending" — it must be finalized alongside this target
        // (persisted), never excluded. Excluding it would silently drop a just-committed
        // sibling from the persisted map. So stillPending = only the open windows.
        const remaining = [...state.pending.values()].map((e) => ({
          targetId: e.targetId,
          snapshot: e.snapshot,
        }));
        for (const entry of effect.entries) {
          opts.onCommit(entry.targetId, entry.snapshot, { stillPending: remaining });
        }
        break;
      }
      case 'cancel-timer':
        clearTimer(effect.targetId);
        break;
      case 'none':
        break;
    }
  }

  function request(targetId: string, snapshot: TSnapshot): void {
    const { state: next, effect } = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: opts.kind,
      targetId,
      snapshot,
      requestedAt: Date.now(),
      durationMs,
    });
    state = next;
    applyEffect(effect);
  }

  function undo(targetId: string): void {
    const { state: next, effect } = reduceUndoWindow(state, { type: 'UNDO', targetId });
    state = next;
    applyEffect(effect);
  }

  function timeout(targetId: string): void {
    const { state: next, effect } = reduceUndoWindow(state, { type: 'TIMEOUT', targetId });
    state = next;
    applyEffect(effect);
  }

  function isPending(targetId: string): boolean {
    return state.pending.has(targetId);
  }

  function dispose(): void {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    for (const id of toastIds.values()) {
      dismissToast(id);
    }
    toastIds.clear();
    // Safe-by-default: do NOT commit. In-memory pending state is dropped; storage
    // still holds the pre-action state (invariant I5).
    state = createUndoState();
  }

  return { request, isPending, dispose };
}
