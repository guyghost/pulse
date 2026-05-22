/**
 * Feed Data Facade — Single entry point for feed-related data operations.
 *
 * Groups missions, seen, favorites, hidden, and connector status access
 * behind a clean API. UI pages import this instead of individual storage modules.
 */
import { sendMessage } from '../messaging/bridge';
import type { UserProfile } from '../../core/types/profile';
import type { Mission } from '../../core/types/mission';
import type { PersistedConnectorStatus } from '../../core/types/connector-status';

export type FeedSortBy = 'score' | 'date' | 'tjm';

export { getConnectorsMeta, detectAllConnectorSessions } from '../connectors/index';
export { markAsSeen } from '../../core/seen/mark-seen';
export {
  toggleFavorite,
  toggleHidden,
  filterHidden,
  filterFavoritesOnly,
} from '../../core/favorites/favorites';

export async function getMissions(): Promise<Mission[]> {
  const response = await sendMessage({ type: 'GET_FEED_MISSIONS' });
  return response.type === 'FEED_MISSIONS_RESULT' ? response.payload : [];
}

export async function getConnectorStatuses(): Promise<PersistedConnectorStatus[]> {
  const response = await sendMessage({ type: 'GET_PERSISTED_CONNECTOR_STATUSES' });
  return response.type === 'PERSISTED_CONNECTOR_STATUSES_RESULT' ? response.payload : [];
}

export async function getFavorites(): Promise<Record<string, number>> {
  const response = await sendMessage({ type: 'GET_FEED_FAVORITES' });
  return response.type === 'FEED_FAVORITES_RESULT' ? response.payload : {};
}

export async function saveFavorites(favorites: Record<string, number>): Promise<void> {
  const response = await sendMessage({ type: 'SAVE_FEED_FAVORITES', payload: favorites });
  if (response.type !== 'FEED_FAVORITES_SAVED' || !response.payload.saved) {
    throw new Error('Favorite mission save failed.');
  }
}

export async function getHidden(): Promise<Record<string, number>> {
  const response = await sendMessage({ type: 'GET_FEED_HIDDEN' });
  return response.type === 'FEED_HIDDEN_RESULT' ? response.payload : {};
}

export async function saveHidden(hidden: Record<string, number>): Promise<void> {
  const response = await sendMessage({ type: 'SAVE_FEED_HIDDEN', payload: hidden });
  if (response.type !== 'FEED_HIDDEN_SAVED' || !response.payload.saved) {
    throw new Error('Hidden mission save failed.');
  }
}

export async function getFeedSortBy(): Promise<FeedSortBy> {
  const response = await sendMessage({ type: 'GET_FEED_SORT' });
  return response.type === 'FEED_SORT_RESULT' ? response.payload : 'score';
}

export async function setFeedSortBy(sortBy: FeedSortBy): Promise<void> {
  const response = await sendMessage({ type: 'SAVE_FEED_SORT', payload: sortBy });
  if (response.type !== 'FEED_SORT_SAVED' || !response.payload.saved) {
    throw new Error('Feed sort save failed.');
  }
}

export async function getSeenIds(): Promise<string[]> {
  const response = await sendMessage({ type: 'GET_SEEN_MISSIONS' });
  return response.type === 'SEEN_MISSIONS_RESULT' ? response.payload : [];
}

export async function saveSeenIds(seenIds: string[]): Promise<void> {
  const response = await sendMessage({ type: 'SAVE_SEEN_MISSIONS', payload: seenIds });
  if (response.type !== 'SEEN_MISSIONS_SAVED' || !response.payload.saved) {
    throw new Error('Seen mission save failed.');
  }
}

export async function resetNewMissionCount(): Promise<void> {
  const response = await sendMessage({ type: 'RESET_NEW_MISSION_COUNT' });
  if (response.type !== 'NEW_MISSION_COUNT_RESET' || !response.payload.reset) {
    throw new Error('New mission count reset failed.');
  }
}

export async function clearExtensionBadge(): Promise<void> {
  const response = await sendMessage({ type: 'CLEAR_EXTENSION_BADGE' });
  if (response.type !== 'EXTENSION_BADGE_CLEARED' || !response.payload.cleared) {
    throw new Error('Extension badge clear failed.');
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  const response = await sendMessage({ type: 'OPEN_EXTERNAL_URL', payload: { url } });
  if (response.type !== 'EXTERNAL_URL_OPENED' || !response.payload.opened) {
    throw new Error('External URL open failed.');
  }
}

export async function getProfile(): Promise<UserProfile | null> {
  const response = await sendMessage({ type: 'GET_PROFILE' });
  return response.type === 'PROFILE_RESULT' ? response.payload : null;
}

export async function syncFavoriteMission(
  missionId: string,
  favoritedAt: number | null
): Promise<void> {
  try {
    await sendMessage({
      type: 'SYNC_FAVORITE_MISSION',
      payload: { missionId, favoritedAt },
    });
  } catch {
    // Account sync is best-effort. Local favorites remain the source for the extension.
  }
}
