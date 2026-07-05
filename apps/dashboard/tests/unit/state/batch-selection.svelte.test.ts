/**
 * Contract test for the batch-selection Svelte store.
 *
 * The store is a thin Svelte 5 runes wrapper over the M3 `transition()` table.
 * These tests pin the delegation contract: getters reflect the current state,
 * methods dispatch the matching event, and no transition logic leaks into the
 * store. The reducer's correctness is covered by batch-selection.machine.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { BatchSelectionStore } from '$lib/state/batch-selection.svelte';

describe('BatchSelectionStore (M3 wrapper)', () => {
  it('starts idle with an empty selection', () => {
    const store = new BatchSelectionStore();
    expect(store.status).toBe('idle');
    expect(store.count).toBe(0);
    expect(store.isSelecting).toBe(false);
    expect(store.isLocked).toBe(false);
    expect(store.summary).toBeNull();
    expect(store.errorMessage).toBeNull();
    expect(store.action).toBeNull();
    expect([...store.selectedIds]).toEqual([]);
  });

  it('enters selecting mode and toggles items through the model', () => {
    const store = new BatchSelectionStore();
    store.enterSelectMode();
    expect(store.isSelecting).toBe(true);

    store.toggle('m1');
    store.toggle('m2');
    expect(store.count).toBe(2);
    expect(store.isSelected('m1')).toBe(true);
    expect(store.isSelected('m3')).toBe(false);

    // Toggle off
    store.toggle('m1');
    expect(store.count).toBe(1);
    expect(store.isSelected('m1')).toBe(false);
  });

  it('selectVisible replaces the selection; clear empties it', () => {
    const store = new BatchSelectionStore();
    store.enterSelectMode();
    store.toggle('stale');
    store.selectVisible(['v1', 'v2', 'v3']);
    expect([...store.selectedIds].sort()).toEqual(['v1', 'v2', 'v3']);
    expect(store.count).toBe(3);

    store.clear();
    expect(store.count).toBe(0);
  });

  it('locks interaction while applying and through done/error', () => {
    const store = new BatchSelectionStore();
    store.enterSelectMode();
    store.toggle('m1');
    store.apply('archive');
    expect(store.status).toBe('applying');
    expect(store.action).toBe('archive');
    expect(store.isLocked).toBe(true);

    store.reportSuccess({
      action: 'archive',
      requestedCount: 1,
      appliedCount: 1,
      skippedCount: 0,
    });
    expect(store.status).toBe('done');
    expect(store.isLocked).toBe(true);
    expect(store.summary).toEqual({
      action: 'archive',
      requestedCount: 1,
      appliedCount: 1,
      skippedCount: 0,
    });

    store.dismiss();
    expect(store.status).toBe('idle');
    expect(store.count).toBe(0);
  });

  it('preserves selection across an error so the user can retry', () => {
    const store = new BatchSelectionStore();
    store.enterSelectMode();
    store.toggle('m1');
    store.apply('select');
    store.reportError('rate limited');
    expect(store.status).toBe('error');
    expect(store.errorMessage).toBe('rate limited');
    expect(store.count).toBe(1); // selection retained
    expect(store.isLocked).toBe(true);
  });

  it('exitSelectMode resets to idle and clears the selection', () => {
    const store = new BatchSelectionStore();
    store.enterSelectMode();
    store.toggle('m1');
    store.exitSelectMode();
    expect(store.status).toBe('idle');
    expect(store.count).toBe(0);
  });
});
