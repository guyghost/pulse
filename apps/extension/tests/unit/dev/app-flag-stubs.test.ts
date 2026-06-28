/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';

type FlagResponse = { type: string; payload: { saved?: boolean; cleared?: boolean } | boolean };

async function send(message: unknown): Promise<FlagResponse> {
  return (await chrome.runtime.sendMessage(message)) as FlagResponse;
}

async function readOnboarding(): Promise<boolean> {
  const r = await send({ type: 'GET_ONBOARDING_COMPLETED' });
  return r.payload as boolean;
}

async function readFirstScan(): Promise<boolean> {
  const r = await send({ type: 'GET_FIRST_SCAN_DONE' });
  return r.payload as boolean;
}

/**
 * Regression test for the Onboarding domain dev-stub improvement (b):
 * onboarding_completed / first_scan_done must persist to localStorage so dev
 * toggles survive a reload (re-install of the stubs), while keeping the
 * default `true` on fresh storage.
 */
describe('dev chrome stub — app flag persistence', () => {
  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    try {
      window.localStorage?.clear();
    } catch {
      // ignore
    }
    installChromeStubs();
  });

  it('defaults onboarding_completed and first_scan_done to true on fresh storage', async () => {
    expect(await readOnboarding()).toBe(true);
    expect(await readFirstScan()).toBe(true);
  });

  it('persists CLEAR_ONBOARDING_COMPLETED across a reload', async () => {
    const cleared = await send({ type: 'CLEAR_ONBOARDING_COMPLETED' });
    expect(cleared.payload).toEqual({ cleared: true });
    expect(await readOnboarding()).toBe(false);

    // Simulate a reload: wipe the in-memory stub and re-install from storage.
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    installChromeStubs();

    expect(await readOnboarding()).toBe(false);
  });

  it('persists SET_ONBOARDING_COMPLETED across a reload', async () => {
    await send({ type: 'CLEAR_ONBOARDING_COMPLETED' });
    expect(await readOnboarding()).toBe(false);

    await send({ type: 'SET_ONBOARDING_COMPLETED' });
    expect(await readOnboarding()).toBe(true);

    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    installChromeStubs();

    expect(await readOnboarding()).toBe(true);
  });

  it('persists SET_FIRST_SCAN_DONE across a reload', async () => {
    const set = await send({ type: 'SET_FIRST_SCAN_DONE' });
    expect(set.payload).toEqual({ saved: true });

    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    installChromeStubs();

    expect(await readFirstScan()).toBe(true);
  });
});
