import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  availability: 'available' as 'available' | 'after-download' | 'no',
  cache: new Map<string, { score: number; reason: string }>(),
}));

vi.mock('$lib/shell/ai/capabilities', () => ({
  isPromptApiAvailable: vi.fn(async () => hoisted.availability),
  createPromptSession: vi.fn(),
}));

vi.mock('$lib/shell/storage/semantic-cache', () => ({
  getCachedSemanticScores: vi.fn(async (missionIds: string[]) => {
    const results = new Map<string, { score: number; reason: string }>();
    for (const id of missionIds) {
      const cached = hoisted.cache.get(id);
      if (cached) {
        results.set(id, cached);
      }
    }
    return results;
  }),
  cacheSemanticScores: vi.fn(async (results: Map<string, { score: number; reason: string }>) => {
    for (const [id, result] of results) {
      hoisted.cache.set(id, result);
    }
  }),
}));

import { createPromptSession, isPromptApiAvailable } from '$lib/shell/ai/capabilities';
import { scoreMissionsSemantic } from '$lib/shell/ai/semantic-scorer';
import type { Mission } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['TypeScript', 'React'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Développeur Fullstack',
};

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  title: 'Développeur Front-end React',
  client: null,
  description: 'Mission front-end.',
  stack: ['React'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/mission',
  source: 'free-work',
  scrapedAt: new Date('2026-09-18T12:00:00.000Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

const validResponse = (score = 85) =>
  JSON.stringify({ score, reason: 'Bon match TypeScript et React pour le profil.' });

const sessionFactory = (promptResponses: string[]) => {
  let callIndex = 0;
  const session = {
    prompt: vi.fn(async () => {
      const response = promptResponses[Math.min(callIndex, promptResponses.length - 1)];
      callIndex += 1;
      return response;
    }),
    destroy: vi.fn(),
  };
  return { session, prompt: session.prompt, destroy: session.destroy };
};

beforeEach(() => {
  hoisted.availability = 'available';
  hoisted.cache.clear();
  vi.mocked(createPromptSession).mockReset();
  vi.mocked(isPromptApiAvailable).mockClear();
});

describe('semantic scorer — scenario replay', () => {
  it('S1 — returns nothing without touching the model when Gemini Nano is unavailable', async () => {
    hoisted.availability = 'no';
    const sessionFactoryResult = sessionFactory([validResponse()]);
    vi.mocked(createPromptSession).mockResolvedValue(sessionFactoryResult.session as never);

    const results = await scoreMissionsSemantic([makeMission()], profile);

    expect(results.size).toBe(0);
    expect(createPromptSession).not.toHaveBeenCalled();
  });

  it('S2 — scores an uncached batch with a single reused session and caches the results', async () => {
    const { session, prompt, destroy } = sessionFactory([validResponse(85), validResponse(60)]);
    vi.mocked(createPromptSession).mockResolvedValue(session as never);

    const results = await scoreMissionsSemantic(
      [makeMission(), makeMission({ id: 'mission-2', title: 'Backend Node' })],
      profile
    );

    expect(results.get('mission-1')).toMatchObject({ score: 85 });
    expect(results.get('mission-2')).toMatchObject({ score: 60 });
    // One session for the whole batch — created once, destroyed once.
    expect(createPromptSession).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
    // Scores land in the cache for the next scan.
    expect(hoisted.cache.get('mission-1')).toBeDefined();
    expect(hoisted.cache.get('mission-2')).toBeDefined();
  });

  it('S3 — serves cached missions without creating a session', async () => {
    hoisted.cache.set('mission-1', { score: 77, reason: 'Déjà scorée' });

    const results = await scoreMissionsSemantic([makeMission()], profile);

    expect(results.get('mission-1')).toMatchObject({ score: 77 });
    expect(createPromptSession).not.toHaveBeenCalled();
  });

  it('S4 — caps new evaluations to maxPerScan', async () => {
    const { session, prompt } = sessionFactory([validResponse(80)]);
    vi.mocked(createPromptSession).mockResolvedValue(session as never);
    const missions = Array.from({ length: 4 }, (_, index) =>
      makeMission({ id: `mission-${index}` })
    );

    const results = await scoreMissionsSemantic(missions, profile, 2);

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(results.size).toBe(2);
  });

  it('S5 — drops missions whose answer is not parseable JSON without failing the batch', async () => {
    const { session, prompt: _prompt } = sessionFactory([
      'Je ne peux pas répondre à cela.',
      validResponse(72),
    ]);
    vi.mocked(createPromptSession).mockResolvedValue(session as never);

    const results = await scoreMissionsSemantic(
      [makeMission(), makeMission({ id: 'mission-2', title: 'Dev Python' })],
      profile
    );

    expect(results.has('mission-1')).toBe(false);
    expect(results.get('mission-2')).toMatchObject({ score: 72 });
  });

  it('S6 — aborts promptly when the caller signal fires', async () => {
    const { session, prompt } = sessionFactory([validResponse()]);
    vi.mocked(createPromptSession).mockResolvedValue(session as never);
    const controller = new AbortController();
    controller.abort();

    await expect(
      scoreMissionsSemantic([makeMission()], profile, 10, controller.signal)
    ).rejects.toThrow();

    expect(prompt).not.toHaveBeenCalled();
  });
});
