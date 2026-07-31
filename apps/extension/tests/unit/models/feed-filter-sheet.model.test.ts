import { describe, expect, it } from 'vitest';
import {
  createFeedFilterSheetState,
  emptyFeedFilterDraft,
  transitionFeedFilterSheet,
  type FeedFilterDraft,
  type FeedFilterSheetState,
} from '../../../src/models/feed-filter-sheet.model';

function open(draft: FeedFilterDraft = emptyFeedFilterDraft()): FeedFilterSheetState {
  return transitionFeedFilterSheet(createFeedFilterSheetState(), {
    type: 'OPEN',
    committed: draft,
  }).state;
}

describe('feed filter sheet model', () => {
  it('copies committed filters into an isolated draft', () => {
    const committed = { ...emptyFeedFilterDraft(), selectedStacks: ['Svelte'] };
    const state = open(committed);

    expect(state.value).toBe('editing');
    if (state.value !== 'editing') {
      return;
    }

    expect(state.draft).toEqual(committed);
    expect(state.draft).not.toBe(committed);
    expect(state.draft.selectedStacks).not.toBe(committed.selectedStacks);
    expect(state.baseline.selectedStacks).not.toBe(state.draft.selectedStacks);
  });

  it('edits locally and emits exactly one copied commit on apply', () => {
    let state = open();
    state = transitionFeedFilterSheet(state, {
      type: 'SET_SOURCE',
      source: 'free-work',
    }).state;
    state = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: 'Java' }).state;

    const applied = transitionFeedFilterSheet(state, { type: 'APPLY' });
    expect(applied.state).toEqual({ value: 'closed' });
    expect(applied.command).toEqual({
      type: 'COMMIT_FILTERS',
      filters: {
        ...emptyFeedFilterDraft(),
        selectedSource: 'free-work',
        selectedStacks: ['Java'],
      },
    });
    if (applied.command.type === 'COMMIT_FILTERS' && state.value === 'editing') {
      expect(applied.command.filters.selectedStacks).not.toBe(state.draft.selectedStacks);
    }

    expect(transitionFeedFilterSheet(applied.state, { type: 'APPLY' }).command).toEqual({
      type: 'NONE',
    });
  });

  it.each(['button', 'scrim', 'escape', 'page-hidden'] as const)(
    'discards the draft when dismissed by %s',
    (reason) => {
      const editing = transitionFeedFilterSheet(open(), {
        type: 'SET_REMOTE',
        remote: 'full',
      }).state;
      const dismissed = transitionFeedFilterSheet(editing, { type: 'DISMISS', reason });

      expect(dismissed.state).toEqual({ value: 'closed' });
      expect(dismissed.command).toEqual({ type: 'NONE' });
    }
  );

  it('normalizes conflicting preset and explicit filter authorities', () => {
    let state = open();
    state = transitionFeedFilterSheet(state, {
      type: 'TOGGLE_PRESET',
      preset: 'priority',
    }).state;
    state = transitionFeedFilterSheet(state, {
      type: 'SET_SCORE_BUCKET',
      bucket: 'strong',
    }).state;

    expect(state.value === 'editing' ? state.draft.decisionPreset : 'closed').toBeNull();

    state = transitionFeedFilterSheet(state, {
      type: 'TOGGLE_PRESET',
      preset: 'remote-compatible',
    }).state;
    state = transitionFeedFilterSheet(state, { type: 'SET_REMOTE', remote: 'hybrid' }).state;

    if (state.value !== 'editing') {
      throw new Error('expected editing');
    }
    expect(state.draft.decisionPreset).toBeNull();
    expect(state.draft.selectedRemote).toBe('hybrid');
  });

  it('keeps stacks unique, ignores blank values, and resets only the draft', () => {
    let state = open({ ...emptyFeedFilterDraft(), selectedSource: 'free-work' });
    state = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: ' Java ' }).state;
    state = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: 'Java' }).state;
    state = transitionFeedFilterSheet(state, { type: 'TOGGLE_STACK', stack: '   ' }).state;
    state = transitionFeedFilterSheet(state, { type: 'RESET_DRAFT' }).state;

    if (state.value !== 'editing') {
      throw new Error('expected editing');
    }
    expect(state.draft).toEqual(emptyFeedFilterDraft());
    expect(state.baseline.selectedSource).toBe('free-work');
  });

  it('ignores duplicate opens and becomes terminal after disposal', () => {
    const editing = open({ ...emptyFeedFilterDraft(), selectedSource: 'free-work' });
    const duplicate = transitionFeedFilterSheet(editing, {
      type: 'OPEN',
      committed: { ...emptyFeedFilterDraft(), selectedSource: 'malt' },
    });
    expect(duplicate.state).toEqual(editing);

    const disposed = transitionFeedFilterSheet(editing, { type: 'DISPOSE' });
    expect(disposed.state).toEqual({ value: 'disposed' });
    expect(
      transitionFeedFilterSheet(disposed.state, {
        type: 'OPEN',
        committed: emptyFeedFilterDraft(),
      }).state
    ).toEqual({ value: 'disposed' });
  });
});
