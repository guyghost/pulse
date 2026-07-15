import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfile = vi.hoisted(() => vi.fn());
const saveProfile = vi.hoisted(() => vi.fn());
const getFirstScanDone = vi.hoisted(() => vi.fn());
const getOnboardingCompleted = vi.hoisted(() => vi.fn());
const setOnboardingCompleted = vi.hoisted(() => vi.fn());
const clearOnboardingCompleted = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getProfile,
  saveProfile,
}));

vi.mock('../../../src/lib/shell/facades/app-flags.facade', () => ({
  getFirstScanDone,
  getOnboardingCompleted,
  setOnboardingCompleted,
  clearOnboardingCompleted,
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  subscribeMessages: () => () => {},
}));

import { createAppNavigation } from '../../../src/lib/state/app-navigation.svelte';
import type { UserProfile } from '../../../src/lib/core/types/profile';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushBootstrap(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createAppNavigation bootstrap recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProfile.mockResolvedValue(null);
    saveProfile.mockResolvedValue(undefined);
    getFirstScanDone.mockResolvedValue(true);
    getOnboardingCompleted.mockResolvedValue(false);
    setOnboardingCompleted.mockResolvedValue(undefined);
    clearOnboardingCompleted.mockResolvedValue(undefined);
  });

  it('exposes a visible error state and reaches ready after one explicit retry', async () => {
    getProfile.mockRejectedValueOnce(new Error('bootstrap unavailable'));
    const navigation = createAppNavigation();

    await flushBootstrap();
    expect(navigation.bootStatus).toBe('error');
    expect(navigation.bootError).toBe('bootstrap unavailable');

    await navigation.retryBootstrap();

    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(navigation.bootStatus).toBe('ready');
    expect(navigation.bootError).toBeNull();
    expect(navigation.currentPage).toBe('feed');
  });

  it('ignores a rejection from an obsolete bootstrap revision', async () => {
    const firstBootstrap = deferred<UserProfile | null>();
    getProfile.mockReset();
    getProfile.mockReturnValueOnce(firstBootstrap.promise).mockResolvedValueOnce(null);
    const navigation = createAppNavigation();

    await navigation.retryBootstrap();
    expect(navigation.bootStatus).toBe('ready');

    firstBootstrap.reject(new Error('stale bootstrap failure'));
    await flushBootstrap();

    expect(navigation.bootStatus).toBe('ready');
    expect(navigation.bootError).toBeNull();
  });
});
