/**
 * Feed Data Facade — Single entry point for feed-related data operations.
 *
 * Groups missions, seen, favorites, hidden, and connector status access
 * behind a clean API. UI pages import this instead of individual storage modules.
 */
export {
  getMissions,
  getProfile,
  getConnectorStatuses,
  saveConnectorStatuses,
} from '../storage/db';
export { getSeenIds, saveSeenIds } from '../storage/seen-missions';
export { getFavorites, saveFavorites, getHidden, saveHidden } from '../storage/favorites';
export { resetNewMissionCount } from '../storage/session-storage';
export { getConnectorsMeta, detectAllConnectorSessions } from '../connectors/index';
export { markAsSeen } from '../../core/seen/mark-seen';
export {
  toggleFavorite,
  toggleHidden,
  filterHidden,
  filterFavoritesOnly,
} from '../../core/favorites/favorites';
