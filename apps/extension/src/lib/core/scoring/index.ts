export { scoreMission, type DeterministicScoreResult } from './relevance';
export { deduplicateMissions } from './dedup';
export { computeFinalScore, computeFinalBreakdown, buildScoreBreakdown } from './final-score';
export { sortMissions, type MissionSortBy } from './sort-missions';
export { filterSalariedMissions } from './contract-filter';
export { filterStaleMissions, isMissionFresh, DEFAULT_MAX_AGE_DAYS } from './mission-freshness';
export { filterNotifiableMissions } from './notification-filter';
export { matchLocation, type LocationMatchResult } from './location-matching';
export { scoreSeniorityBonus, scoreStartDateBonus } from './bonus-scoring';
