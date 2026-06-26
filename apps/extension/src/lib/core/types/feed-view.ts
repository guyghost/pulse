import type { MissionSource, RemoteType } from './mission';
import type { SeniorityLevel } from './profile';

export type FeedSortBy = 'score' | 'date' | 'tjm';
export type FeedScoreBucket = 'strong' | 'good' | 'weak';
export type FeedDecisionPresetId = 'priority' | 'remote-compatible' | 'tjm-negotiation' | 'new';

export interface FeedViewFilters {
  searchQuery: string;
  selectedStacks: string[];
  selectedSource: MissionSource | null;
  selectedRemote: RemoteType | null;
  selectedSeniority: SeniorityLevel | null;
  selectedScoreBucket: FeedScoreBucket | null;
  decisionPreset: FeedDecisionPresetId | null;
  showNewOnly: boolean;
  showFavoritesOnly: boolean;
  showHidden: boolean;
  sortBy: FeedSortBy;
}

export interface SavedFeedView {
  id: string;
  name: string;
  filters: FeedViewFilters;
  createdAt: number;
  updatedAt: number;
}
