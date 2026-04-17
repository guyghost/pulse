import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

vi.mock('../../../src/lib/shell/storage/db', () => ({
  getMissions: vi.fn(),
  saveMissions: vi.fn(),
}));

vi.mock('../../../src/lib/shell/storage/chrome-storage', () => ({
  getSettings: vi.fn(),
}));

vi.mock('../../../src/lib/core/scoring/relevance', () => ({
  scoreMission: vi.fn(() => ({
    total: 61,
    breakdown: {
      stack: 20,
      location: 15,
      tjm: 16,
      remote: 10,
      seniorityBonus: 0,
      startDateBonus: 0,
    },
  })),
}));

vi.mock('../../../src/lib/shell/ai/semantic-scorer', () => ({
  scoreMissionsSemantic: vi.fn().mockResolvedValue(new Map()),
}));

import { getMissions, saveMissions } from '../../../src/lib/shell/storage/db';
import { getSettings } from '../../../src/lib/shell/storage/chrome-storage';
import { rescoreStoredMissions } from '../../../src/lib/shell/scan/rescore';

const profile: UserProfile = {
  firstName: 'Guy',
  jobTitle: 'Dev',
  stack: ['TypeScript'],
  tjmMin: 500,
  tjmMax: 900,
  location: 'Paris',
  remote: 'any',
  seniority: 'senior',
  searchKeywords: [],
  scoringWeights: {
    stack: 40,
    location: 20,
    tjm: 25,
    remote: 15,
  },
};

const mission: Mission = {
  id: 'mission-1',
  title: 'Mission test',
  client: null,
  description: 'Description',
  stack: ['TypeScript'],
  tjm: 700,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  startDate: null,
  seniority: 'senior',
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2026-01-01'),
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
};

describe('rescoreStoredMissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSettings as Mock).mockResolvedValue({ maxSemanticPerScan: 10 });
    (saveMissions as Mock).mockResolvedValue(undefined);
  });

  it('rescored stored missions and persists updated scores', async () => {
    (getMissions as Mock).mockResolvedValue([mission]);

    const result = await rescoreStoredMissions(profile);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(61);
    expect(result[0].scoreBreakdown).not.toBeNull();
    expect(saveMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mission-1', score: 61 }),
    ]);
  });

  it('returns early when no missions are stored', async () => {
    (getMissions as Mock).mockResolvedValue([]);

    const result = await rescoreStoredMissions(profile);

    expect(result).toEqual([]);
    expect(saveMissions).not.toHaveBeenCalled();
  });
});
