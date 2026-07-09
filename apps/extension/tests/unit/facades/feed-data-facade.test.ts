import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

import {
  clearExtensionBadge,
  getConnectorStatuses,
  getFavorites,
  getFeedSortBy,
  getHidden,
  getMissions,
  getProfile,
  getSeenIds,
  openExternalUrl,
  resetNewMissionCount,
  saveFavorites,
  setFeedSortBy,
  saveHidden,
  saveSeenIds,
} from '../../../src/lib/shell/facades/feed-data.facade';

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['Svelte', 'mission svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
};

describe('feed data facade profile bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the profile through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({ type: 'PROFILE_RESULT', payload: profile });

    await expect(getProfile()).resolves.toEqual(profile);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'GET_PROFILE' });
  });

  it('loads missions through the service worker bridge', async () => {
    const missions = [{ id: 'mission-1', title: 'Mission Svelte', source: 'free-work' }];
    bridgeMock.sendMessage.mockResolvedValue({ type: 'FEED_MISSIONS_RESULT', payload: missions });

    await expect(getMissions()).resolves.toEqual(missions);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'GET_FEED_MISSIONS' });
  });

  it('loads persisted connector statuses through the service worker bridge', async () => {
    const statuses = [
      {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        lastState: 'done',
        missionsCount: 3,
        error: null,
        lastSyncAt: 1779436800000,
        lastSuccessAt: 1779436800000,
      },
    ];
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'PERSISTED_CONNECTOR_STATUSES_RESULT',
      payload: statuses,
    });

    await expect(getConnectorStatuses()).resolves.toEqual(statuses);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'GET_PERSISTED_CONNECTOR_STATUSES',
    });
  });

  it('loads and saves favorites through the service worker bridge', async () => {
    const favorites = { 'mission-1': 1779436800000 };
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'FEED_FAVORITES_RESULT', payload: favorites })
      .mockResolvedValueOnce({ type: 'FEED_FAVORITES_SAVED', payload: { saved: true } });

    await expect(getFavorites()).resolves.toEqual(favorites);
    await expect(saveFavorites(favorites)).resolves.toBeUndefined();

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, { type: 'GET_FEED_FAVORITES' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'SAVE_FEED_FAVORITES',
      payload: favorites,
    });
  });

  it('loads and saves hidden missions through the service worker bridge', async () => {
    const hidden = { 'mission-2': 1779436800000 };
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'FEED_HIDDEN_RESULT', payload: hidden })
      .mockResolvedValueOnce({ type: 'FEED_HIDDEN_SAVED', payload: { saved: true } });

    await expect(getHidden()).resolves.toEqual(hidden);
    await expect(saveHidden(hidden)).resolves.toBeUndefined();

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, { type: 'GET_FEED_HIDDEN' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'SAVE_FEED_HIDDEN',
      payload: hidden,
    });
  });

  it('surfaces failed feed save bridge responses', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'FEED_FAVORITES_SAVED',
      payload: { saved: false },
    });

    await expect(saveFavorites({ 'mission-1': 1779436800000 })).rejects.toThrow(
      'Favorite mission save failed.'
    );
  });

  it('loads and saves seen missions through the service worker bridge', async () => {
    const seenIds = ['mission-1', 'mission-2'];
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'SEEN_MISSIONS_RESULT', payload: seenIds })
      .mockResolvedValueOnce({ type: 'SEEN_MISSIONS_SAVED', payload: { saved: true } });

    await expect(getSeenIds()).resolves.toEqual(seenIds);
    await expect(saveSeenIds(seenIds)).resolves.toBeUndefined();

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, { type: 'GET_SEEN_MISSIONS' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'SAVE_SEEN_MISSIONS',
      payload: seenIds,
    });
  });

  it('resets the new mission count through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'NEW_MISSION_COUNT_RESET',
      payload: { reset: true },
    });

    await expect(resetNewMissionCount()).resolves.toBeUndefined();
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'RESET_NEW_MISSION_COUNT' });
  });

  it('loads and saves feed sort through the service worker bridge', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'FEED_SORT_RESULT', payload: 'date' })
      .mockResolvedValueOnce({ type: 'FEED_SORT_SAVED', payload: { saved: true } });

    await expect(getFeedSortBy()).resolves.toBe('date');
    await expect(setFeedSortBy('tjm')).resolves.toBeUndefined();

    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(1, { type: 'GET_FEED_SORT' });
    expect(bridgeMock.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'SAVE_FEED_SORT',
      payload: 'tjm',
    });
  });

  it('clears the extension badge through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'EXTENSION_BADGE_CLEARED',
      payload: { cleared: true },
    });

    await expect(clearExtensionBadge()).resolves.toBeUndefined();
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_EXTENSION_BADGE' });
  });

  it('opens external URLs through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'EXTERNAL_URL_OPENED',
      payload: { opened: true },
    });

    await expect(openExternalUrl('https://www.free-work.com/')).resolves.toBeUndefined();
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'OPEN_EXTERNAL_URL',
      payload: { url: 'https://www.free-work.com/' },
    });
  });
});
