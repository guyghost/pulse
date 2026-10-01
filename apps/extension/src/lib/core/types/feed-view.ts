import type { MissionCategory } from './mission-classification';
import type { MissionSource, RemoteType } from './mission';
import type { SeniorityLevel } from './profile';

export type FeedSortBy = 'score' | 'date' | 'tjm' | 'personalized';
export type FeedScoreBucket = 'strong' | 'good' | 'weak';
export type FeedDecisionPresetId = 'priority' | 'remote-compatible' | 'tjm-negotiation' | 'new';

export interface FeedViewFilters {
  /** Missing in legacy saved views: preserve their exact groups. */
  scoreFilterMode?: 'minimum' | 'exact';
  selectedTjmMin?: number | null;
  searchQuery: string;
  selectedStacks: string[];
  selectedSource: MissionSource | null;
  selectedRemote: RemoteType | null;
  selectedCategory: MissionCategory | null;
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
