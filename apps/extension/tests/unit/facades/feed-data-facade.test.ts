import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

import { getProfile } from '../../../src/lib/shell/facades/feed-data.facade';

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['Svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
  searchKeywords: ['mission svelte'],
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
});
