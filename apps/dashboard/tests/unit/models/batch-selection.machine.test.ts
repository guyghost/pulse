import { describe, expect, it } from 'vitest';
import {
  initialBatchSelectionState,
  isInteractionLocked,
  selectedCount,
  transition,
  type BatchSelectionState,
  type BulkSummary,
} from '../../../src/models/batch-selection.machine';

function selecting(ids: string[]): BatchSelectionState {
  return {
    status: 'selecting',
    selectedIds: new Set(ids),
    action: null,
    summary: null,
    errorMessage: null,
  };
}

const summary = (action: 'archive' | 'select', requestedCount: number): BulkSummary => ({
  action,
  requestedCount,
  appliedCount: requestedCount,
  skippedCount: 0,
  failedCount: 0,
  truncatedCount: 0,
});

describe('batch selection transition — authorized transitions', () => {
  it('idle → selecting via ENTER_SELECT_MODE', () => {
    const next = transition(initialBatchSelectionState, { type: 'ENTER_SELECT_MODE' });
    expect(next.status).toBe('selecting');
    expect(next.selectedIds.size).toBe(0);
  });

  it('TOGGLE_ITEM adds then removes an id (toggle semantics)', () => {
    const s1 = transition(initialBatchSelectionState, { type: 'ENTER_SELECT_MODE' });
    const s2 = transition(s1, { type: 'TOGGLE_ITEM', id: 'm1' });
    expect([...s2.selectedIds]).toEqual(['m1']);
    const s3 = transition(s2, { type: 'TOGGLE_ITEM', id: 'm1' });
    expect(s3.selectedIds.size).toBe(0);
  });

  it('TOGGLE_ITEM never produces duplicate ids', () => {
    let s = transition(initialBatchSelectionState, { type: 'ENTER_SELECT_MODE' });
    s = transition(s, { type: 'TOGGLE_ITEM', id: 'm1' });
    s = transition(s, { type: 'TOGGLE_ITEM', id: 'm1' });
    s = transition(s, { type: 'TOGGLE_ITEM', id: 'm1' });
    expect(s.selectedIds.size).toBe(1);
  });

  it('SELECT_VISIBLE replaces the selection', () => {
    let s = selecting(['m1', 'm2']);
    s = transition(s, { type: 'SELECT_VISIBLE', ids: ['m3', 'm4', 'm5'] });
    expect([...s.selectedIds].sort()).toEqual(['m3', 'm4', 'm5']);
  });

  it('CLEAR_SELECTION empties the set', () => {
    const s = transition(selecting(['m1', 'm2']), { type: 'CLEAR_SELECTION' });
    expect(s.selectedIds.size).toBe(0);
    expect(s.status).toBe('selecting');
  });

  it('selecting → applying via APPLY_BULK with a non-empty selection', () => {
    const next = transition(selecting(['m1']), { type: 'APPLY_BULK', action: 'archive' });
    expect(next.status).toBe('applying');
    expect(next.action).toBe('archive');
  });

  it('applying → done via APPLY_SUCCESS (keeps selection + summary)', () => {
    const applying: BatchSelectionState = {
      status: 'applying',
      selectedIds: new Set(['m1', 'm2']),
      action: 'archive',
      summary: null,
      errorMessage: null,
    };
    const next = transition(applying, {
      type: 'APPLY_SUCCESS',
      summary: summary('archive', 2),
    });
    expect(next.status).toBe('done');
    expect(next.summary?.appliedCount).toBe(2);
    expect(next.selectedIds.size).toBe(2);
  });

  it('applying → error via APPLY_ERROR (selection persists for retry)', () => {
    const applying: BatchSelectionState = {
      status: 'applying',
      selectedIds: new Set(['m1']),
      action: 'select',
      summary: null,
      errorMessage: null,
    };
    const next = transition(applying, { type: 'APPLY_ERROR', message: 'boom' });
    expect(next.status).toBe('error');
    expect(next.errorMessage).toBe('boom');
    expect(next.selectedIds.size).toBe(1);
  });

  it('done → idle via DISMISS (clears selection)', () => {
    const done: BatchSelectionState = {
      status: 'done',
      selectedIds: new Set(['m1']),
      action: 'archive',
      summary: summary('archive', 1),
      errorMessage: null,
    };
    const next = transition(done, { type: 'DISMISS' });
    expect(next.status).toBe('idle');
    expect(next.selectedIds.size).toBe(0);
  });

  it('error → idle via DISMISS (clears selection)', () => {
    const errored: BatchSelectionState = {
      status: 'error',
      selectedIds: new Set(['m1']),
      action: 'archive',
      summary: null,
      errorMessage: 'boom',
    };
    const next = transition(errored, { type: 'DISMISS' });
    expect(next.status).toBe('idle');
    expect(next.selectedIds.size).toBe(0);
  });

  it('selecting → idle via EXIT_SELECT_MODE (clears selection)', () => {
    const next = transition(selecting(['m1']), { type: 'EXIT_SELECT_MODE' });
    expect(next.status).toBe('idle');
    expect(next.selectedIds.size).toBe(0);
  });
});

describe('batch selection transition — guards (rejected transitions)', () => {
  it('APPLY_BULK is rejected when selection is empty', () => {
    const next = transition(selecting([]), { type: 'APPLY_BULK', action: 'archive' });
    expect(next.status).toBe('selecting');
  });

  it('ENTER_SELECT_MODE is rejected outside idle', () => {
    const next = transition(selecting(['m1']), { type: 'ENTER_SELECT_MODE' });
    expect(next.status).toBe('selecting');
  });

  it('TOGGLE_ITEM is rejected outside selecting (locks during applying/done/error)', () => {
    const applying: BatchSelectionState = {
      status: 'applying',
      selectedIds: new Set(['m1']),
      action: 'archive',
      summary: null,
      errorMessage: null,
    };
    const next = transition(applying, { type: 'TOGGLE_ITEM', id: 'm2' });
    expect(next.selectedIds.size).toBe(1);
  });

  it('APPLY_SUCCESS is rejected outside applying', () => {
    const next = transition(selecting(['m1']), {
      type: 'APPLY_SUCCESS',
      summary: summary('archive', 1),
    });
    expect(next.status).toBe('selecting');
  });

  it('APPLY_ERROR is rejected outside applying', () => {
    const next = transition(selecting(['m1']), { type: 'APPLY_ERROR', message: 'x' });
    expect(next.status).toBe('selecting');
  });

  it('DISMISS is rejected outside done/error', () => {
    const next = transition(selecting(['m1']), { type: 'DISMISS' });
    expect(next.status).toBe('selecting');
  });
});

describe('batch selection transition — invariants', () => {
  it('selection persists across applying → error → applying (retry keeps selection + clears error)', () => {
    let s = selecting(['m1', 'm2']);
    s = transition(s, { type: 'APPLY_BULK', action: 'select' });
    expect(s.status).toBe('applying');
    s = transition(s, { type: 'APPLY_ERROR', message: 'transient' });
    expect(s.status).toBe('error');
    expect(s.selectedIds.size).toBe(2);
    // Retry from error: APPLY_BULK is accepted again, selection preserved, error cleared.
    s = transition(s, { type: 'APPLY_BULK', action: 'select' });
    expect(s.status).toBe('applying');
    expect(s.selectedIds.size).toBe(2);
    expect(s.errorMessage).toBeNull();
  });

  it('APPLY_BULK from error with an empty selection is still rejected', () => {
    // An error state always carries the selection that failed, but guard anyway:
    // if selection were empty, retry is rejected rather than entering applying.
    const errored: BatchSelectionState = {
      status: 'error',
      selectedIds: new Set<string>(),
      action: 'archive',
      summary: null,
      errorMessage: 'transient',
    };
    const next = transition(errored, { type: 'APPLY_BULK', action: 'archive' });
    expect(next.status).toBe('error');
  });

  it('isInteractionLocked is true for applying/done/error only', () => {
    expect(isInteractionLocked(initialBatchSelectionState)).toBe(false);
    expect(isInteractionLocked(selecting(['m1']))).toBe(false);
    expect(
      isInteractionLocked({
        status: 'applying',
        selectedIds: new Set(['m1']),
        action: 'archive',
        summary: null,
        errorMessage: null,
      })
    ).toBe(true);
  });

  it('selectedCount reflects the set size', () => {
    expect(selectedCount(selecting(['m1', 'm2', 'm3']))).toBe(3);
    expect(selectedCount(initialBatchSelectionState)).toBe(0);
  });

  it('BulkSummary carries failedCount so partial failures are not folded into skipped', () => {
    // 3 requested, 1 truncated by the cap, 1 applied, 0 skipped, 1 failed.
    // Invariant: applied + skipped + failed === requested - truncated (1 + 0 + 1 === 3 - 1).
    const partial: BulkSummary = {
      action: 'archive',
      requestedCount: 3,
      appliedCount: 1,
      skippedCount: 0,
      failedCount: 1,
      truncatedCount: 1,
    };
    const applying: BatchSelectionState = {
      status: 'applying',
      selectedIds: new Set(['m1', 'm2']),
      action: 'archive',
      summary: null,
      errorMessage: null,
    };
    const next = transition(applying, { type: 'APPLY_SUCCESS', summary: partial });
    expect(next.status).toBe('done');
    expect(next.summary?.failedCount).toBe(1);
    expect(next.summary?.skippedCount).toBe(0);
  });
});
