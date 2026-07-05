/**
 * M3 — Batch selection state machine (source of truth).
 *
 * Pure transition table (FC&IS core): zero I/O, zero async, fully testable
 * without mocks. Consumed by the feed UI to drive multi-select + bulk actions.
 *
 * A typed reducer is used instead of xstate to match the dashboard's existing
 * pure-core pattern (lib/core/dashboard.ts) and avoid a new runtime dependency
 * (xstate currently lives only in apps/extension).
 *
 * Invariants (asserted in tests/unit/models/batch-selection.machine.test.ts):
 *  - `APPLY_BULK` is rejected unless `selectedIds.size > 0` (guard).
 *  - `applying` / `done` / `error` disable checkbox toggling and the action bar.
 *  - `EXIT_SELECT_MODE` and `DISMISS` clear the selection and return to idle.
 *  - Selection persists across `selecting → applying → error → applying` so a
 *    failed bulk action can be retried without re-selecting.
 *  - `selectedIds` never contains duplicate ids.
 *
 * The LLM never decides a transition; the model does. Server actions produce
 * `APPLY_SUCCESS` / `APPLY_ERROR` events; the model decides the next state.
 */

export type BulkAction = 'archive' | 'select';

export interface BulkSummary {
  action: BulkAction;
  /** Original selection size the user submitted (before the server cap). */
  requestedCount: number;
  appliedCount: number;
  skippedCount: number;
  /** IDs dropped because the submission exceeded the server-side cap. */
  truncatedCount: number;
}

export interface BatchSelectionState {
  status: 'idle' | 'selecting' | 'applying' | 'done' | 'error';
  selectedIds: ReadonlySet<string>;
  action: BulkAction | null;
  summary: BulkSummary | null;
  errorMessage: string | null;
}

export type BatchSelectionEvent =
  | { type: 'ENTER_SELECT_MODE' }
  | { type: 'EXIT_SELECT_MODE' }
  | { type: 'TOGGLE_ITEM'; id: string }
  | { type: 'SELECT_VISIBLE'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'APPLY_BULK'; action: BulkAction }
  | { type: 'APPLY_SUCCESS'; summary: BulkSummary }
  | { type: 'APPLY_ERROR'; message: string }
  | { type: 'DISMISS' };

export const initialBatchSelectionState: BatchSelectionState = {
  status: 'idle',
  selectedIds: new Set<string>(),
  action: null,
  summary: null,
  errorMessage: null,
};

const EMPTY: ReadonlySet<string> = new Set<string>();

function withSelection(
  state: BatchSelectionState,
  selectedIds: ReadonlySet<string>
): BatchSelectionState {
  return { ...state, selectedIds, errorMessage: null };
}

function addId(set: Set<string>, id: string): Set<string> {
  if (set.has(id)) {
    const next = new Set(set);
    next.delete(id);
    return next;
  }
  const next = new Set(set);
  next.add(id);
  return next;
}

/**
 * Pure transition. Returns the next state for a given (state, event) pair.
 * Rejects events that violate guards by returning the state unchanged.
 */
export function transition(
  state: BatchSelectionState,
  event: BatchSelectionEvent
): BatchSelectionState {
  switch (event.type) {
    case 'ENTER_SELECT_MODE': {
      if (state.status !== 'idle') return state;
      return {
        status: 'selecting',
        selectedIds: state.selectedIds.size > 0 ? state.selectedIds : EMPTY,
        action: null,
        summary: null,
        errorMessage: null,
      };
    }

    case 'EXIT_SELECT_MODE': {
      return { ...initialBatchSelectionState };
    }

    case 'TOGGLE_ITEM': {
      if (state.status !== 'selecting') return state;
      return withSelection(state, addId(new Set(state.selectedIds), event.id));
    }

    case 'SELECT_VISIBLE': {
      if (state.status !== 'selecting') return state;
      // Replace selection with the visible set (union would surprise users).
      const next = new Set<string>();
      for (const id of event.ids) next.add(id);
      return withSelection(state, next);
    }

    case 'CLEAR_SELECTION': {
      if (state.status !== 'selecting') return state;
      return withSelection(state, EMPTY);
    }

    case 'APPLY_BULK': {
      // Retry is allowed from `error` so the user can re-apply without dismissing
      // (which would clear the selection). All other statuses reject.
      if (state.status !== 'selecting' && state.status !== 'error') return state;
      if (state.selectedIds.size === 0) return state; // guard: nothing to apply
      return {
        status: 'applying',
        selectedIds: state.selectedIds,
        action: event.action,
        summary: null,
        errorMessage: null,
      };
    }

    case 'APPLY_SUCCESS': {
      if (state.status !== 'applying') return state;
      return {
        status: 'done',
        selectedIds: state.selectedIds,
        action: state.action,
        summary: event.summary,
        errorMessage: null,
      };
    }

    case 'APPLY_ERROR': {
      if (state.status !== 'applying') return state;
      // Selection persists so the user can retry via APPLY_BULK (handled above).
      return {
        status: 'error',
        selectedIds: state.selectedIds,
        action: state.action,
        summary: null,
        errorMessage: event.message,
      };
    }

    case 'DISMISS': {
      if (state.status === 'done' || state.status === 'error') {
        return { ...initialBatchSelectionState };
      }
      return state;
    }

    default: {
      // Exhaustiveness check — if a new event is added without a case, TS errors.
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Helper: is the UI currently locked (bulk applying or showing a terminal result)? */
export function isInteractionLocked(state: BatchSelectionState): boolean {
  return state.status === 'applying' || state.status === 'done' || state.status === 'error';
}

/** Helper: count of currently selected missions. */
export function selectedCount(state: BatchSelectionState): number {
  return state.selectedIds.size;
}
