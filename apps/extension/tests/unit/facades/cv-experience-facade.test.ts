import { describe, expect, it, vi } from 'vitest';

const feedDataMock = vi.hoisted(() => ({
  getConnectorsMeta: vi.fn(() => []),
  openExternalUrl: vi.fn(),
}));

vi.mock('../../../src/lib/shell/facades/feed-data.facade', () => feedDataMock);

vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
}));

import { getCvSyncTargets } from '../../../src/lib/shell/facades/cv-experience.facade';

describe('cv experience facade', () => {
  it('uses LinkedIn self-profile redirect as the sync target', () => {
    const targets = getCvSyncTargets();

    expect(targets[0]).toEqual({
      id: 'linkedin',
      name: 'LinkedIn',
      profileUrl: 'https://www.linkedin.com/in/me/',
    });
  });
});
