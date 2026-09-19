import { beforeEach, describe, expect, it, vi } from 'vitest';
import { experimental_evaluate as evaluate } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import {
  classifyMissions,
  enrichMissionsWithClassification,
  type ClassificationSettings,
} from '$lib/shell/ai/mission-classifier';
import { getAiGatewayApiKey } from '$lib/shell/storage/chrome-storage';
import { cacheClassifications, buildCacheInput } from '$lib/shell/storage/classification-cache';
import { buildMissionContentFingerprint } from '$lib/core/classification/fingerprint';
import type { Mission } from '$lib/core/types/mission';
import type { MissionClassification } from '$lib/core/types/mission-classification';

// ---------------------------------------------------------------------------
// Mocks — SDK, gateway, settings storage. The classification cache stays REAL
// and runs on a stubbed chrome.storage.local so the classifier is exercised
// end to end (key gate → cache lookup → gateway call → parse → cache write).
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({ apiKey: 'test-gateway-key' }));

vi.mock('$lib/shell/storage/chrome-storage', () => ({
  getAiGatewayApiKey: vi.fn(async () => hoisted.apiKey),
  setAiGatewayApiKey: vi.fn(async () => undefined),
}));

vi.mock('ai', () => ({
  experimental_evaluate: vi.fn(),
}));

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() => ({
    evaluationModel: vi.fn((modelId: string) => ({ provider: 'gateway', modelId })),
  })),
}));

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | null) => {
        if (keys === null) {
          throw new Error('global storage scans are not allowed in classifier tests');
        }
        if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] };
        }
        return Object.fromEntries(keys.map((key) => [key, mockStorage[key]]));
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          delete mockStorage[key];
        }
      }),
    },
  },
});

const evaluateMock = vi.mocked(evaluate);
const createGatewayMock = vi.mocked(createGateway);
const apiKeyMock = vi.mocked(getAiGatewayApiKey);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  title: 'Développeur Front-end React',
  client: null,
  description: 'Mission de développement front-end pour un client bancaire.',
  stack: ['React', 'TypeScript'],
  tjm: null,
  location: null,
  remote: null,
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

const confidentAnswers = {
  category: { type: 'choice', choice: 'frontend', probabilities: { frontend: 0.92 } },
  remoteCompatible: { type: 'boolean', probability: 0.95 },
};

const settings = (overrides: Partial<ClassificationSettings> = {}): ClassificationSettings => ({
  enabled: true,
  maxPerScan: 25,
  confidenceThreshold: 0.7,
  ...overrides,
});

/** Configure the gateway mock to return the given answers for every call. */
const mockEvaluate = (
  answers: Record<string, unknown>,
  options: { failFor?: (state: { title: string }) => boolean } = {}
): void => {
  evaluateMock.mockImplementation(async (input: { state: { title?: string } }) => {
    if (options.failFor?.({ title: input.state.title ?? '' })) {
      throw new Error('gateway unavailable');
    }
    return {
      answers,
      usage: { inputTokens: 10, outputTokens: 1, totalTokens: 11 },
      warnings: [],
    } as Awaited<ReturnType<typeof evaluate>>;
  });
};

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  hoisted.apiKey = 'test-gateway-key';
  evaluateMock.mockReset();
  createGatewayMock.mockClear();
  apiKeyMock.mockClear();
  apiKeyMock.mockImplementation(async () => hoisted.apiKey);
});

describe('mission classifier — scenario replay', () => {
  it('S1 — stays fully inert without an AI Gateway key', async () => {
    hoisted.apiKey = '';

    const missions = [makeMission(), makeMission({ id: 'mission-2' })];
    const results = await classifyMissions(missions, settings());

    expect(results.size).toBe(0);
    expect(evaluateMock).not.toHaveBeenCalled();
    expect(createGatewayMock).not.toHaveBeenCalled();
  });

  it('S2 — classifies confident missions and hard-codes privacy + model contract', async () => {
    mockEvaluate(confidentAnswers);
    const missions = [makeMission(), makeMission({ id: 'mission-2', title: 'Data engineer' })];

    const results = await classifyMissions(missions, settings());

    expect(results.size).toBe(2);
    expect(results.get('mission-1')).toMatchObject({
      category: 'frontend',
      remoteCompatible: true,
    });

    // Gateway contract: Jev model id + zero data retention on every call.
    expect(evaluateMock).toHaveBeenCalledTimes(2);
    const firstCall = evaluateMock.mock.calls[0][0];
    expect(firstCall.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
    });
    expect(firstCall.model).toMatchObject({ modelId: 'typesafe-ai/jev' });
    expect(createGatewayMock).toHaveBeenCalledWith({ apiKey: 'test-gateway-key' });

    // Classifications are cached for the next scan.
    const cachedKeys = Object.keys(mockStorage).filter((key) => key.startsWith('classification-'));
    expect(cachedKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('S3 — serves cached missions without spending budget on the gateway', async () => {
    const cached = makeMission({ id: 'mission-1' });
    await cacheClassifications([
      {
        ...buildCacheInput(cached),
        classification: {
          category: 'mobile',
          remoteCompatible: false,
          confidence: 0.88,
          classifiedAt: Date.now(),
        },
      },
    ]);
    mockEvaluate(confidentAnswers);

    const results = await classifyMissions(
      [cached, makeMission({ id: 'mission-2', title: 'Backend Node' })],
      settings()
    );

    expect(results.get('mission-1')).toMatchObject({ category: 'mobile' });
    expect(results.get('mission-2')).toMatchObject({ category: 'frontend' });
    // Only the uncached mission hit the gateway.
    expect(evaluateMock).toHaveBeenCalledTimes(1);
    expect(evaluateMock.mock.calls[0][0].state).toMatchObject({
      title: 'Backend Node',
    });
  });

  it('S4 — caps gateway evaluations to the per-scan budget', async () => {
    mockEvaluate(confidentAnswers);
    const missions = Array.from({ length: 5 }, (_, index) =>
      makeMission({ id: `mission-${index}`, title: `Mission ${index}` })
    );

    const results = await classifyMissions(missions, settings({ maxPerScan: 2 }));

    expect(evaluateMock).toHaveBeenCalledTimes(2);
    expect(results.size).toBe(2);
  });

  it('S5 — drops low-confidence answers without caching them', async () => {
    mockEvaluate({
      category: { type: 'choice', choice: 'frontend', probabilities: { frontend: 0.3 } },
      remoteCompatible: { type: 'boolean', probability: 0.95 },
    });

    const results = await classifyMissions([makeMission()], settings());

    expect(results.size).toBe(0);
    const cachedKeys = Object.keys(mockStorage).filter((key) =>
      key.startsWith('classification-mission')
    );
    expect(cachedKeys).toEqual([]);
  });

  it('S6 — retries a failing mission then keeps the batch resilient', async () => {
    mockEvaluate(confidentAnswers, {
      failFor: ({ title }) => title.includes('Mission 0'),
    });
    const missions = [
      makeMission({ id: 'mission-0', title: 'Mission 0' }),
      makeMission({ id: 'mission-1', title: 'Mission 1' }),
    ];

    const results = await classifyMissions(missions, settings());

    // mission-0 attempted twice (initial + retry) then abandoned.
    expect(evaluateMock).toHaveBeenCalledTimes(3);
    expect(results.has('mission-0')).toBe(false);
    expect(results.get('mission-1')).toMatchObject({ category: 'frontend' });
  });

  it('S7 — re-classifies when the mission content changes', async () => {
    const original = makeMission({ id: 'mission-1' });
    await cacheClassifications([
      {
        ...buildCacheInput(original),
        classification: {
          category: 'other',
          remoteCompatible: false,
          confidence: 0.8,
          classifiedAt: Date.now(),
        },
      },
    ]);

    const updated = makeMission({
      id: 'mission-1',
      description: 'Description entièrement réécrite côté plateforme.',
    });
    expect(buildMissionContentFingerprint(updated)).not.toBe(
      buildMissionContentFingerprint(original)
    );
    mockEvaluate({
      category: { type: 'choice', choice: 'fullstack', probabilities: { fullstack: 0.85 } },
      remoteCompatible: { type: 'boolean', probability: 0.9 },
    });

    const results = await classifyMissions([updated], settings());

    expect(results.get('mission-1')).toMatchObject({ category: 'fullstack' });
    expect(evaluateMock).toHaveBeenCalledTimes(1);
  });

  it('S8 — does nothing when the feature flag is off', async () => {
    mockEvaluate(confidentAnswers);
    const missions = [makeMission()];

    const results = await classifyMissions(missions, settings({ enabled: false }));

    expect(results.size).toBe(0);
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it('S9 — enrichment mutates missions in place and reports the change', async () => {
    mockEvaluate(confidentAnswers);
    const missions = [makeMission(), makeMission({ id: 'mission-2', title: 'Dev Python' })];

    const { changed } = await enrichMissionsWithClassification(missions, settings());

    expect(changed).toBe(true);
    expect(missions[0].classification).toMatchObject({
      category: 'frontend',
      confidence: 0.92,
    });
    expect(missions[1].classification).toMatchObject({ category: 'frontend' });
  });

  it('S10 — reports no change when every mission is already classified', async () => {
    const alreadyClassified = makeMission();
    alreadyClassified.classification = {
      category: 'frontend',
      remoteCompatible: true,
      confidence: 0.9,
      classifiedAt: Date.now(),
    } satisfies MissionClassification;

    const { changed } = await enrichMissionsWithClassification(
      [alreadyClassified],
      settings({ maxPerScan: 0 })
    );

    expect(changed).toBe(false);
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it('S11 — stops before the gateway when the caller aborts', async () => {
    mockEvaluate(confidentAnswers);
    const controller = new AbortController();
    controller.abort();

    const results = await classifyMissions([makeMission()], settings(), controller.signal);

    expect(results.size).toBe(0);
    expect(evaluateMock).not.toHaveBeenCalled();
  });
});
