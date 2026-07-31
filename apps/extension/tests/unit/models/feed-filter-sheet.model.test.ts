import { describe, expect, it } from 'vitest';
import {
  createFeedFilterSheetState,
  emptyFeedFilterDraft,
  transitionFeedFilterSheet,
  type FeedFilterDraft,
  type FeedFilterSheetState,
} from '../../../src/models/feed-filter-sheet.model';

function open(filters: FeedFilterDraft = emptyFeedFilterDraft()): FeedFilterSheetState {
  return transitionFeedFilterSheet(createFeedFilterSheetState(), {
    type: 'OPEN',
    committed: filters,
  }).state;
}

describe('feed filter grid model', () => {
  it('copies committed filters into an isolated open snapshot', () => {
    const committed = { ...emptyFeedFilterDraft(), selectedStacks: ['Svelte'] };
    const state = open(committed);

    expect(state.value).toBe('open');
    if (state.value !== 'open') {
      return;
    }

    expect(state.filters).toEqual(committed);
    expect(state.filters).not.toBe(committed);
    expect(state.filters.selectedStacks).not.toBe(committed.selectedStacks);
  });

  it('emits one copied live sync for every accepted filter edit', () => {
    const sourceTransition = transitionFeedFilterSheet(open(), {
      type: 'SET_SOURCE',
      source: 'free-work',
    });

    expect(sourceTransition.state).toEqual({
      value: 'open',
      filters: { ...emptyFeedFilterDraft(), selectedSource: 'free-work' },
    });
    expect(sourceTransition.command).toEqual({
      type: 'SYNC_FILTERS',
      filters: { ...emptyFeedFilterDraft(), selectedSource: 'free-work' },
    });

    if (
      sourceTransition.state.value === 'open' &&
      sourceTransition.command.type === 'SYNC_FILTERS'
    ) {
      expect(sourceTransition.command.filters).not.toBe(sourceTransition.state.filters);
      expect(sourceTransition.command.filters.selectedStacks).not.toBe(
        sourceTransition.state.filters.selectedStacks
      );
    }
  });

  it.each(['button', 'scrim', 'escape', 'page-hidden'] as const)(
    'closes without a duplicate sync when dismissed by %s',
    (reason) => {
      const edited = transitionFeedFilterSheet(open(), {
        type: 'SET_REMOTE',
        remote: 'full',
      }).state;
      const dismissed = transitionFeedFilterSheet(edited, { type: 'DISMISS', reason });

      expect(dismissed.state).toEqual({ value: 'closed' });
      expect(dismissed.command).toEqual({ type: 'NONE' });
    }
  );

  it('normalizes conflicting preset and explicit filter authorities', () => {
    let state = transitionFeedFilterSheet(open(), {
      type: 'TOGGLE_PRESET',
      preset: 'priority',
    }).state;
    state = transitionFeedFilterSheet(state, {
      type: 'SET_SCORE_BUCKET',
      bucket: 'strong',
    }).state;

    expect(state.value === 'open' ? state.filters.decisionPreset : 'closed').toBeNull();

    state = transitionFeedFilterSheet(state, {
      type: 'TOGGLE_PRESET',
      preset: 'remote-compatible',
    }).state;
    state = transitionFeedFilterSheet(state, { type: 'SET_REMOTE', remote: 'hybrid' }).state;

    if (state.value !== 'open') {
      throw new Error('expected open');
    }
    expect(state.filters.decisionPreset).toBeNull();
    expect(state.filters.selectedRemote).toBe('hybrid');

    state = transitionFeedFilterSheet(state, {
      type: 'TOGGLE_PRESET',
      preset: 'tjm-negotiation',
    }).state;
    state = transitionFeedFilterSheet(state, { type: 'SET_TJM_MIN', tjmMin: 500 }).state;

    if (state.value !== 'open') {
      throw new Error('expected open');
    }
    expect(state.filters.decisionPreset).toBeNull();
    expect(state.filters.selectedTjmMin).toBe(500);
  });

  it('rejects invalid TJM minimum values and rounds accepted values', () => {
    const invalid = transitionFeedFilterSheet(open(), { type: 'SET_TJM_MIN', tjmMin: -1 });
    const accepted = transitionFeedFilterSheet(invalid.state, {
      type: 'SET_TJM_MIN',
      tjmMin: 499.6,
    });

    expect(invalid.command).toEqual({ type: 'NONE' });
    expect(accepted.state.value === 'open' ? accepted.state.filters.selectedTjmMin : null).toBe(
      500
    );
    expect(accepted.command).toEqual({
      type: 'SYNC_FILTERS',
      filters: { ...emptyFeedFilterDraft(), selectedTjmMin: 500 },
    });
  });

  it('keeps stacks unique, ignores blank values, and syncs reset', () => {
    let state = open({ ...emptyFeedFilterDraft(), selectedSource: 'free-work' });
    state = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: ' Java ' }).state;
    state = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: 'Java' }).state;
    const blank = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: '   ' });
    const reset = transitionFeedFilterSheet(blank.state, { type: 'RESET_FILTERS' });

    expect(blank.command).toEqual({ type: 'NONE' });
    expect(reset.state).toEqual({ value: 'open', filters: emptyFeedFilterDraft() });
    expect(reset.command).toEqual({ type: 'SYNC_FILTERS', filters: emptyFeedFilterDraft() });
  });

  it('ignores edits while closed, ignores duplicate opens, and becomes terminal after disposal', () => {
    const closedEdit = transitionFeedFilterSheet(createFeedFilterSheetState(), {
      type: 'SET_SOURCE',
      source: 'free-work',
    });
    expect(closedEdit.state).toEqual({ value: 'closed' });
    expect(closedEdit.command).toEqual({ type: 'NONE' });

    const opened = open({ ...emptyFeedFilterDraft(), selectedSource: 'free-work' });
    const duplicate = transitionFeedFilterSheet(opened, {
      type: 'OPEN',
      committed: { ...emptyFeedFilterDraft(), selectedSource: 'malt' },
    });
    expect(duplicate.state).toEqual(opened);

    const disposed = transitionFeedFilterSheet(opened, { type: 'DISPOSE' });
    expect(disposed.state).toEqual({ value: 'disposed' });
    expect(
      transitionFeedFilterSheet(disposed.state, {
        type: 'OPEN',
        committed: emptyFeedFilterDraft(),
      }).state
    ).toEqual({ value: 'disposed' });
  });
});
