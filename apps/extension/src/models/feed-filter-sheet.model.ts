import type { MissionSource, RemoteType } from '$lib/core/types/mission';
import type { SeniorityLevel } from '$lib/core/types/profile';
import type { FeedDecisionPresetId, FeedScoreBucket } from '$lib/core/types/feed-view';

export interface FeedFilterDraft {
  decisionPreset: FeedDecisionPresetId | null;
  selectedScoreBucket: FeedScoreBucket | null;
  selectedSource: MissionSource | null;
  selectedRemote: RemoteType | null;
  selectedSeniority: SeniorityLevel | null;
  selectedStacks: string[];
}

export type FeedFilterSheetState =
  | { value: 'closed' }
  | { value: 'editing'; baseline: FeedFilterDraft; draft: FeedFilterDraft }
  | { value: 'disposed' };

export type FeedFilterSheetDismissReason = 'button' | 'scrim' | 'escape' | 'page-hidden';

export type FeedFilterSheetEvent =
  | { type: 'OPEN'; committed: FeedFilterDraft }
  | { type: 'TOGGLE_PRESET'; preset: FeedDecisionPresetId }
  | { type: 'SET_SCORE_BUCKET'; bucket: FeedScoreBucket | null }
  | { type: 'SET_SOURCE'; source: MissionSource | null }
  | { type: 'SET_REMOTE'; remote: RemoteType | null }
  | { type: 'SET_SENIORITY'; seniority: SeniorityLevel | null }
  | { type: 'TOGGLE_STACK'; stack: string }
  | { type: 'RESET_DRAFT' }
  | { type: 'DISMISS'; reason: FeedFilterSheetDismissReason }
  | { type: 'APPLY' }
  | { type: 'DISPOSE' };

export type FeedFilterSheetCommand =
  { type: 'NONE' } | { type: 'COMMIT_FILTERS'; filters: FeedFilterDraft };

export interface FeedFilterSheetTransition {
  state: FeedFilterSheetState;
  command: FeedFilterSheetCommand;
}

const NONE: FeedFilterSheetCommand = { type: 'NONE' };

export function emptyFeedFilterDraft(): FeedFilterDraft {
  return {
    decisionPreset: null,
    selectedScoreBucket: null,
    selectedSource: null,
    selectedRemote: null,
    selectedSeniority: null,
    selectedStacks: [],
  };
}

export function cloneFeedFilterDraft(draft: FeedFilterDraft): FeedFilterDraft {
  return { ...draft, selectedStacks: [...draft.selectedStacks] };
}

export function createFeedFilterSheetState(): FeedFilterSheetState {
  return { value: 'closed' };
}

function stay(state: FeedFilterSheetState): FeedFilterSheetTransition {
  return { state, command: NONE };
}

function updateDraft(
  state: Extract<FeedFilterSheetState, { value: 'editing' }>,
  draft: FeedFilterDraft
): FeedFilterSheetTransition {
  return {
    state: { ...state, draft: cloneFeedFilterDraft(draft) },
    command: NONE,
  };
}

export function transitionFeedFilterSheet(
  state: FeedFilterSheetState,
  event: FeedFilterSheetEvent
): FeedFilterSheetTransition {
  if (state.value === 'disposed') {
    return stay(state);
  }

  if (event.type === 'DISPOSE') {
    return { state: { value: 'disposed' }, command: NONE };
  }

  if (state.value === 'closed') {
    if (event.type !== 'OPEN') {
      return stay(state);
    }

    const baseline = cloneFeedFilterDraft(event.committed);
    return {
      state: { value: 'editing', baseline, draft: cloneFeedFilterDraft(baseline) },
      command: NONE,
    };
  }

  switch (event.type) {
    case 'OPEN':
      return stay(state);
    case 'TOGGLE_PRESET': {
      const decisionPreset = state.draft.decisionPreset === event.preset ? null : event.preset;
      const draft: FeedFilterDraft = { ...state.draft, decisionPreset };
      if (decisionPreset === 'priority') {
        draft.selectedScoreBucket = null;
      }
      if (decisionPreset === 'remote-compatible') {
        draft.selectedRemote = null;
      }
      return updateDraft(state, draft);
    }
    case 'SET_SCORE_BUCKET':
      return updateDraft(state, {
        ...state.draft,
        selectedScoreBucket: event.bucket,
        decisionPreset:
          event.bucket !== null && state.draft.decisionPreset === 'priority'
            ? null
            : state.draft.decisionPreset,
      });
    case 'SET_SOURCE':
      return updateDraft(state, { ...state.draft, selectedSource: event.source });
    case 'SET_REMOTE':
      return updateDraft(state, {
        ...state.draft,
        selectedRemote: event.remote,
        decisionPreset:
          event.remote !== null && state.draft.decisionPreset === 'remote-compatible'
            ? null
            : state.draft.decisionPreset,
      });
    case 'SET_SENIORITY':
      return updateDraft(state, { ...state.draft, selectedSeniority: event.seniority });
    case 'TOGGLE_STACK': {
      const stack = event.stack.trim();
      if (!stack) {
        return stay(state);
      }
      const selectedStacks = state.draft.selectedStacks.includes(stack)
        ? state.draft.selectedStacks.filter((candidate) => candidate !== stack)
        : [...state.draft.selectedStacks, stack];
      return updateDraft(state, { ...state.draft, selectedStacks });
    }
    case 'RESET_DRAFT':
      return updateDraft(state, emptyFeedFilterDraft());
    case 'DISMISS':
      return { state: { value: 'closed' }, command: NONE };
    case 'APPLY':
      return {
        state: { value: 'closed' },
        command: { type: 'COMMIT_FILTERS', filters: cloneFeedFilterDraft(state.draft) },
      };
  }
}
