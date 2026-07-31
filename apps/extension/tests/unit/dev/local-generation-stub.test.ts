/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import {
  DEV_PREMIUM_ENABLED_STORAGE_KEY,
  DEV_PREMIUM_FEATURE_STORAGE_KEY,
} from '../../../src/lib/state/features.svelte';

describe('dev chrome stub — free local generation', () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).chrome;
    window.localStorage.clear();
    window.localStorage.setItem(DEV_PREMIUM_ENABLED_STORAGE_KEY, 'false');
    window.localStorage.setItem(DEV_PREMIUM_FEATURE_STORAGE_KEY, 'true');
    installChromeStubs();
  });

  it('never applies the legacy premium gate to GENERATE_ASSET', async () => {
    const response = (await chrome.runtime.sendMessage({
      type: 'GENERATE_ASSET',
      payload: { missionId: 'mock-0', generationType: 'pitch' },
    })) as { type: string; payload: { asset: unknown; error?: string } };

    expect(response.type).toBe('GENERATION_RESULT');
    expect(response.payload.error).toBeUndefined();
    expect(response.payload.asset).toMatchObject({ missionId: 'mock-0', type: 'pitch' });
  });
});
