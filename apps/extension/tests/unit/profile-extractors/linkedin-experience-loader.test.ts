import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinkedInExperienceDomSnapshot } from '../../../src/lib/shell/profile-extractors/linkedin-experience-dom';
import { extractLinkedInExperiencesFromDom } from '../../../src/lib/shell/profile-extractors/linkedin-experience-dom';
import {
  DETAIL_LIST_OBSERVATION_MS,
  DETAIL_LIST_STABILIZE_TIMEOUT_MS,
  DETAIL_PAGE_LOAD_TIMEOUT_MS,
  buildLinkedInExperienceDetailUrl,
  loadCompleteLinkedInExperiences,
  type LinkedInExperienceChromeApi,
} from '../../../src/lib/shell/profile-extractors/linkedin-experience-loader';
import { createProfileExtractorError } from '../../../src/lib/shell/profile-extractors/profile-extractor-errors';
import { normalizeProfileExtractorHealthCode } from '../../../src/lib/core/sync/connected-dashboard';

const NOW = 1_789_142_400_000;
const PROFILE_URL = 'https://www.linkedin.com/in/guyghost/';
const DETAIL_URL = 'https://www.linkedin.com/in/guyghost/details/experience/';
const ROW = {
  title: 'Staff Engineer',
  company: 'Acme',
  dateRange: '2024 – aujourd’hui',
  skills: ['TypeScript'],
  externalId: 'urn:li:position:1',
};

type UpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];
type RemovedListener = Parameters<typeof chrome.tabs.onRemoved.addListener>[0];

interface ChromeDoubleOptions {
  createdTab?: chrome.tabs.Tab;
  createError?: Error;
  readyTab?: chrome.tabs.Tab;
  getError?: Error;
  snapshot?: LinkedInExperienceDomSnapshot | undefined;
  executeError?: Error;
  removeError?: Error;
  executeGate?: Promise<void>;
  removeGate?: Promise<void>;
}

function createChromeDouble(options: ChromeDoubleOptions = {}) {
  const updatedListeners = new Set<UpdatedListener>();
  const removedListeners = new Set<RemovedListener>();
  const createdTab =
    options.createdTab ?? ({ id: 99, url: DETAIL_URL, status: 'complete' } as chrome.tabs.Tab);
  const readyTab = options.readyTab ?? createdTab;
  const snapshot =
    'snapshot' in options
      ? options.snapshot
      : ({ kind: 'ready', experiences: [ROW] } satisfies LinkedInExperienceDomSnapshot);

  const api = {
    tabs: {
      create: vi.fn(async () => {
        if (options.createError) {
          throw options.createError;
        }
        return createdTab;
      }),
      get: vi.fn(async () => {
        if (options.getError) {
          throw options.getError;
        }
        return readyTab;
      }),
      remove: vi.fn(async () => {
        await options.removeGate;
        if (options.removeError) {
          throw options.removeError;
        }
      }),
      onUpdated: {
        addListener: vi.fn((listener: UpdatedListener) => updatedListeners.add(listener)),
        removeListener: vi.fn((listener: UpdatedListener) => updatedListeners.delete(listener)),
      },
      onRemoved: {
        addListener: vi.fn((listener: RemovedListener) => removedListeners.add(listener)),
        removeListener: vi.fn((listener: RemovedListener) => removedListeners.delete(listener)),
      },
    },
    scripting: {
      executeScript: vi.fn(async () => {
        await options.executeGate;
        if (options.executeError) {
          throw options.executeError;
        }
        return [{ frameId: 0, result: snapshot }];
      }),
    },
  } as unknown as LinkedInExperienceChromeApi;

  return {
    api,
    emitUpdated(tab: chrome.tabs.Tab = readyTab) {
      for (const listener of [...updatedListeners]) {
        listener(99, { status: 'complete' }, tab);
      }
    },
    emitRemoved() {
      for (const listener of [...removedListeners]) {
        listener(99, { windowId: 1, isWindowClosing: false });
      }
    },
    listenerCounts() {
      return { updated: updatedListeners.size, removed: removedListeners.size };
    },
  };
}

function extractorCode(
  result: Awaited<ReturnType<typeof loadCompleteLinkedInExperiences>>
): unknown {
  return result.ok ? null : result.error.context?.profileExtractorCode;
}

function expectSingleCleanup(double: ReturnType<typeof createChromeDouble>) {
  expect(double.api.tabs.remove).toHaveBeenCalledTimes(1);
  expect(double.api.tabs.remove).toHaveBeenCalledWith(99);
  expect(double.listenerCounts()).toEqual({ updated: 0, removed: 0 });
}

function expectSingleCreate(double: ReturnType<typeof createChromeDouble>) {
  expect(double.api.tabs.create).toHaveBeenCalledTimes(1);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildLinkedInExperienceDetailUrl', () => {
  it('builds the dedicated experience URL from one strict profile slug', () => {
    expect(buildLinkedInExperienceDetailUrl(PROFILE_URL)).toBe(DETAIL_URL);
    expect(buildLinkedInExperienceDetailUrl('https://www.linkedin.com/in/guyghost')).toBe(
      DETAIL_URL
    );
  });

  it.each([
    'https://www.linkedin.com/feed/',
    'https://linkedin.com/in/guyghost/',
    'https://www.linkedin.com/in/guyghost/details/',
    'https://www.linkedin.com/in/guyghost/extra/',
    'not a url',
  ])('rejects non-profile URL %s', (url) => {
    expect(buildLinkedInExperienceDetailUrl(url)).toBeNull();
  });
});

describe('loadCompleteLinkedInExperiences', () => {
  it('shares one tab, extraction, cleanup, result, and leader clock across concurrent callers', async () => {
    let releaseExecution = (): void => undefined;
    const executeGate = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    const double = createChromeDouble({
      snapshot: { kind: 'unreadable', experiences: [] },
      executeGate,
    });

    const leader = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);
    const follower = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW + 1_000);
    await vi.waitFor(() => expect(double.api.scripting.executeScript).toHaveBeenCalledTimes(1));
    releaseExecution();
    const [leaderResult, followerResult] = await Promise.all([leader, follower]);

    expect(followerResult).toBe(leaderResult);
    expect(leaderResult.ok ? null : leaderResult.error.timestamp).toBe(NOW);
    expectSingleCreate(double);
    expect(double.api.scripting.executeScript).toHaveBeenCalledTimes(1);
    expectSingleCleanup(double);
  });

  it('keeps the single flight locked through cleanup and starts a new cycle after terminal cleanup', async () => {
    let releaseCleanup = (): void => undefined;
    const removeGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const double = createChromeDouble({ removeGate });

    const leader = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);
    await vi.waitFor(() => expect(double.api.tabs.remove).toHaveBeenCalledTimes(1));
    const duringCleanup = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW + 1_000);
    expect(double.api.tabs.create).toHaveBeenCalledTimes(1);
    releaseCleanup();
    const [leaderResult, cleanupFollowerResult] = await Promise.all([leader, duringCleanup]);
    expect(cleanupFollowerResult).toBe(leaderResult);

    const nextResult = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW + 2_000);

    expect(nextResult).toEqual({ ok: true, value: [ROW] });
    expect(double.api.tabs.create).toHaveBeenCalledTimes(2);
    expect(double.api.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(double.api.tabs.remove).toHaveBeenCalledTimes(2);
  });

  it('opens one inactive tab, injects the bounded DOM extractor, and cleans up ready rows', async () => {
    const double = createChromeDouble();

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(result).toEqual({ ok: true, value: [ROW] });
    expect(double.api.tabs.create).toHaveBeenCalledWith({ url: DETAIL_URL, active: false });
    expect(double.api.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 99 },
      func: extractLinkedInExperiencesFromDom,
      args: [
        {
          stabilizationTimeoutMs: DETAIL_LIST_STABILIZE_TIMEOUT_MS,
          observationMs: DETAIL_LIST_OBSERVATION_MS,
          stableCycles: 2,
        },
      ],
    });
    expect(double.api.tabs.onUpdated.addListener).not.toHaveBeenCalled();
    expect(double.api.tabs.onRemoved.addListener).not.toHaveBeenCalled();
    expectSingleCleanup(double);
  });

  it('cleans up after a recognized empty experience page', async () => {
    const double = createChromeDouble({ snapshot: { kind: 'empty', experiences: [] } });

    await expect(loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW)).resolves.toEqual({
      ok: true,
      value: [],
    });
    expectSingleCleanup(double);
  });

  it.each(['challenge-consulting', 'checkpoint-engineer', 'login'])(
    'accepts reserved words inside the legitimate detail profile slug %s',
    async (slug) => {
      const detailUrl = `https://www.linkedin.com/in/${slug}/details/experience/`;
      const double = createChromeDouble({
        createdTab: { id: 99, url: detailUrl, status: 'complete' } as chrome.tabs.Tab,
      });

      const result = await loadCompleteLinkedInExperiences(
        double.api,
        `https://www.linkedin.com/in/${slug}/`,
        NOW
      );

      expect(result).toEqual({ ok: true, value: [ROW] });
      expect(double.api.scripting.executeScript).toHaveBeenCalledTimes(1);
      expectSingleCleanup(double);
    }
  );

  it('maps a challenge snapshot and cleans up without retrying', async () => {
    const double = createChromeDouble({
      snapshot: {
        kind: 'blocked',
        experiences: [],
        blockedReason: 'security verification required',
      },
    });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('rate_limited_or_blocked');
    expect(result.ok ? null : result.error.message).toBe(
      'LinkedIn demande une vérification de sécurité. Terminez cette vérification dans LinkedIn puis relancez l’import.'
    );
    expectSingleCreate(double);
    expectSingleCleanup(double);
  });

  it('maps an unreadable DOM to dom_changed and cleans up without retrying', async () => {
    const double = createChromeDouble({ snapshot: { kind: 'unreadable', experiences: [] } });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('dom_changed');
    expect(result.ok ? null : result.error.message).toBe(
      'La page LinkedIn est chargée, mais sa section Expérience n’est plus reconnue. Rechargez la page puis réessayez.'
    );
    expectSingleCreate(double);
    expectSingleCleanup(double);
  });

  it('maps DOM stabilization timeout to detail_page_unavailable and cleans up without retrying', async () => {
    const double = createChromeDouble({ snapshot: { kind: 'timeout', experiences: [] } });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expect(result.ok ? null : result.error.message).toBe(
      'La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.'
    );
    expectSingleCreate(double);
    expectSingleCleanup(double);
  });

  it('times out tab loading, removes listeners and the tab, and does not retry', async () => {
    vi.useFakeTimers();
    const double = createChromeDouble({
      createdTab: { id: 99, url: DETAIL_URL, status: 'loading' } as chrome.tabs.Tab,
    });

    const pending = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);
    await vi.advanceTimersByTimeAsync(DETAIL_PAGE_LOAD_TIMEOUT_MS);
    const result = await pending;

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expect(double.api.scripting.executeScript).not.toHaveBeenCalled();
    expectSingleCreate(double);
    expectSingleCleanup(double);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps executeScript rejection, cleans up, and does not retry', async () => {
    const double = createChromeDouble({ executeError: new Error('Cannot access contents') });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expect(result.ok ? null : result.error.context?.cause).toBe('Cannot access contents');
    expectSingleCreate(double);
    expectSingleCleanup(double);
  });

  it('treats manual tab removal as unavailable, removes listeners, and attempts cleanup once', async () => {
    vi.useFakeTimers();
    const double = createChromeDouble({
      createdTab: { id: 99, url: DETAIL_URL, status: 'loading' } as chrome.tabs.Tab,
    });

    const pending = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);
    await Promise.resolve();
    double.emitRemoved();
    const result = await pending;

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expect(double.api.scripting.executeScript).not.toHaveBeenCalled();
    expectSingleCreate(double);
    expectSingleCleanup(double);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for a loading tab, re-reads it, and removes readiness listeners before injection', async () => {
    vi.useFakeTimers();
    const double = createChromeDouble({
      createdTab: { id: 99, url: DETAIL_URL, status: 'loading' } as chrome.tabs.Tab,
      readyTab: { id: 99, url: DETAIL_URL, status: 'complete' } as chrome.tabs.Tab,
    });

    const pending = loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);
    await Promise.resolve();
    double.emitUpdated();
    const result = await pending;

    expect(result).toEqual({ ok: true, value: [ROW] });
    expect(double.api.tabs.get).toHaveBeenCalledWith(99);
    expectSingleCleanup(double);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-reads a loading tab immediately after subscribing so a lost complete event cannot time out', async () => {
    vi.useFakeTimers();
    const double = createChromeDouble({
      createdTab: { id: 99, url: DETAIL_URL, status: 'loading' } as chrome.tabs.Tab,
      readyTab: { id: 99, url: DETAIL_URL, status: 'complete' } as chrome.tabs.Tab,
    });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(result).toEqual({ ok: true, value: [ROW] });
    expect(double.api.tabs.get).toHaveBeenCalledTimes(1);
    expect(double.api.tabs.get).toHaveBeenCalledWith(99);
    expectSingleCleanup(double);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up listeners once when the immediate tab re-read rejects', async () => {
    vi.useFakeTimers();
    const double = createChromeDouble({
      createdTab: { id: 99, url: DETAIL_URL, status: 'loading' } as chrome.tabs.Tab,
      getError: new Error('No tab with id 99'),
    });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);
    double.emitRemoved();

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expect(result.ok ? null : result.error.context?.cause).toBe('No tab with id 99');
    expect(double.api.scripting.executeScript).not.toHaveBeenCalled();
    expectSingleCleanup(double);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [
      'https://www.linkedin.com/login',
      'session_required',
      'Votre session LinkedIn a expiré. Reconnectez-vous à LinkedIn puis relancez l’import.',
    ],
    [
      'https://www.linkedin.com/uas/login',
      'session_required',
      'Votre session LinkedIn a expiré. Reconnectez-vous à LinkedIn puis relancez l’import.',
    ],
    [
      'https://www.linkedin.com/checkpoint/challenge/',
      'rate_limited_or_blocked',
      'LinkedIn demande une vérification de sécurité. Terminez cette vérification dans LinkedIn puis relancez l’import.',
    ],
    [
      'https://www.linkedin.com/challenge/security/',
      'rate_limited_or_blocked',
      'LinkedIn demande une vérification de sécurité. Terminez cette vérification dans LinkedIn puis relancez l’import.',
    ],
    [
      'https://www.linkedin.com/feed/',
      'detail_page_unavailable',
      'La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.',
    ],
  ])('reclassifies ready redirect %s as %s', async (url, expectedCode, expectedMessage) => {
    const double = createChromeDouble({
      createdTab: { id: 99, url, status: 'complete' } as chrome.tabs.Tab,
    });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe(expectedCode);
    expect(result.ok ? null : result.error.message).toBe(expectedMessage);
    expect(double.api.scripting.executeScript).not.toHaveBeenCalled();
    expectSingleCreate(double);
    expectSingleCleanup(double);
  });

  it('does not attempt cleanup when tab creation fails', async () => {
    const double = createChromeDouble({ createError: new Error('No tab') });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expectSingleCreate(double);
    expect(double.api.tabs.remove).not.toHaveBeenCalled();
  });

  it('does not attempt cleanup when Chrome creates no tab id', async () => {
    const double = createChromeDouble({
      createdTab: { url: DETAIL_URL, status: 'complete' } as chrome.tabs.Tab,
    });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('detail_page_unavailable');
    expectSingleCreate(double);
    expect(double.api.tabs.remove).not.toHaveBeenCalled();
  });

  it('preserves successful rows when cleanup fails', async () => {
    const double = createChromeDouble({ removeError: new Error('Already gone') });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(result).toEqual({ ok: true, value: [ROW] });
    expect(warning).toHaveBeenCalledWith('[MissionPulse][LinkedInExperienceImport]', {
      event: 'detail_tab_cleanup_failed',
      tabId: 99,
      cause: 'Already gone',
    });
    expectSingleCleanup(double);
  });

  it('preserves the original DOM failure when cleanup fails', async () => {
    const double = createChromeDouble({
      snapshot: { kind: 'unreadable', experiences: [] },
      removeError: new Error('Already gone'),
    });

    const result = await loadCompleteLinkedInExperiences(double.api, PROFILE_URL, NOW);

    expect(extractorCode(result)).toBe('dom_changed');
    expectSingleCreate(double);
    expectSingleCleanup(double);
  });

  it('rejects an invalid source profile without opening a tab', async () => {
    const double = createChromeDouble();

    const result = await loadCompleteLinkedInExperiences(
      double.api,
      'https://www.linkedin.com/feed/',
      NOW
    );

    expect(extractorCode(result)).toBe('profile_not_found');
    expect(double.api.tabs.create).not.toHaveBeenCalled();
    expect(double.api.tabs.remove).not.toHaveBeenCalled();
  });
});

describe('detail_page_unavailable error contract', () => {
  it('is recoverable and normalized as a profile extractor health code', () => {
    const error = createProfileExtractorError('detail_page_unavailable', 'retry', NOW);

    expect(error.recoverable).toBe(true);
    expect(error.context?.profileExtractorCode).toBe('detail_page_unavailable');
    expect(normalizeProfileExtractorHealthCode('detail_page_unavailable')).toBe(
      'detail_page_unavailable'
    );
  });
});
