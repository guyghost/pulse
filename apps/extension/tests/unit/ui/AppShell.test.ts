import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

const getProfile = vi.hoisted(() => vi.fn());
const getFirstScanDone = vi.hoisted(() => vi.fn());
const getOnboardingCompleted = vi.hoisted(() => vi.fn());
const subscribeMessages = vi.hoisted(() => vi.fn());
const unsubscribeMessages = vi.hoisted(() => vi.fn());
const markImportStart = vi.hoisted(() => vi.fn());
const markPageLoaded = vi.hoisted(() => vi.fn());
const premiumState = vi.hoisted(() => ({
  isPremium: false,
  load: vi.fn(),
  setPremium: vi.fn(),
}));
const featureState = vi.hoisted(() => ({ premiumFeatureActive: false }));

vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getProfile,
  saveProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/shell/facades/app-flags.facade', () => ({
  getFirstScanDone,
  getOnboardingCompleted,
  setOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
  clearOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: vi.fn().mockResolvedValue({ type: 'NOOP' }),
  subscribeMessages,
}));

vi.mock('../../../src/lib/shell/metrics/launch-marks', () => ({
  launchMarks: {
    markImportStart,
    markPageLoaded,
  },
}));

vi.mock('../../../src/lib/state/theme.svelte', () => ({
  createThemeStore: () => ({ init: vi.fn() }),
}));

vi.mock('../../../src/lib/state/premium.svelte', () => ({ premium: premiumState }));
vi.mock('../../../src/lib/state/features.svelte', () => ({ features: featureState }));

vi.mock('../../../src/lib/state/connection-singleton.svelte', () => ({
  getConnectionStore: () => ({
    status: 'online',
    lastOnlineTime: null,
    lastOfflineTime: null,
    downlink: undefined,
    rtt: undefined,
    effectiveType: undefined,
    destroy: vi.fn(),
  }),
}));

vi.mock('../../../src/lib/shell/facades/feed-data.facade', () => ({
  subscribeToNotificationClicked: () => () => {},
}));

import ConnectionIndicator from '../../../src/ui/atoms/ConnectionIndicator.svelte';
import App from '../../../src/sidepanel/App.svelte';

type MountedApp = ReturnType<typeof mount>;
type PageModule = { default: typeof ConnectionIndicator };
type TestPageImporter = () => Promise<PageModule>;

const mountedApps: MountedApp[] = [];
let timeoutSpy: ReturnType<typeof vi.spyOn>;
let scheduledTimers: Array<() => void> = [];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resolvedImporter(): TestPageImporter {
  return vi.fn().mockResolvedValue({ default: ConnectionIndicator });
}

function createImporters(feed: TestPageImporter = resolvedImporter()) {
  return {
    feed,
    profile: resolvedImporter(),
    cv: resolvedImporter(),
    applications: resolvedImporter(),
    tjm: resolvedImporter(),
    settings: resolvedImporter(),
    onboarding: resolvedImporter(),
  };
}

function mountApp(pageImporters: ReturnType<typeof createImporters>): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mountedApps.push(mount(App, { target, props: { pageImporters } }));
  return target;
}

async function unmountLatestApp(): Promise<void> {
  const component = mountedApps.pop();
  expect(component, 'a mounted app should exist').toBeDefined();
  await unmount(component!);
}

async function flushShell(): Promise<void> {
  for (let step = 0; step < 6; step += 1) {
    await Promise.resolve();
    await tick();
  }
}

function clickButton(target: HTMLElement, label: string): void {
  const button = [...target.querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').replace(/\s+/g, ' ').trim().includes(label)
  ) as HTMLButtonElement | undefined;
  expect(button, `button ${label} should exist`).toBeTruthy();
  button!.click();
}

describe('App shell recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    getProfile.mockResolvedValue(null);
    getFirstScanDone.mockResolvedValue(true);
    getOnboardingCompleted.mockResolvedValue(false);
    premiumState.isPremium = false;
    featureState.premiumFeatureActive = false;
    scheduledTimers = [];
    subscribeMessages.mockImplementation(() => unsubscribeMessages);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    timeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        scheduledTimers.push(handler);
      }
      return scheduledTimers.length;
    });
  });

  afterEach(async () => {
    for (const component of mountedApps.splice(0)) {
      await unmount(component);
    }
    timeoutSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('shows bootstrap failure and retries the persisted reads once', async () => {
    getProfile.mockRejectedValueOnce(new Error('storage unavailable'));
    const importers = createImporters();
    const target = mountApp(importers);

    await flushShell();
    expect(target.textContent).toContain('L’application n’a pas pu démarrer');
    expect(target.querySelector('[data-testid="bootstrap-error"]')?.getAttribute('role')).toBe(
      'alert'
    );

    clickButton(target, 'Réessayer');
    await flushShell();

    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(target.textContent).not.toContain('L’application n’a pas pu démarrer');
    expect(importers.feed).toHaveBeenCalledOnce();
  });

  it('shows a page-load error and retries that import exactly once per click', async () => {
    const feedImporter = vi
      .fn<TestPageImporter>()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValue({ default: ConnectionIndicator });
    const importers = createImporters(feedImporter);
    const target = mountApp(importers);

    await flushShell();
    expect(target.textContent).toContain('Cette vue ne peut pas être chargée');
    expect(feedImporter).toHaveBeenCalledOnce();
    const errorSurface = target.querySelector('[data-testid="page-load-error-feed"]');
    expect(errorSurface?.getAttribute('role')).toBe('alert');
    expect(errorSurface?.getAttribute('aria-live')).toBe('assertive');

    clickButton(target, 'Réessayer');
    await flushShell();

    expect(feedImporter).toHaveBeenCalledTimes(2);
    expect(target.textContent).not.toContain('Cette vue ne peut pas être chargée');
  });

  it('coalesces a navigation import with the delayed preload for the same page', async () => {
    const profileModule = deferred<PageModule>();
    const profileImporter = vi.fn<TestPageImporter>(() => profileModule.promise);
    const importers = createImporters();
    importers.profile = profileImporter;
    const target = mountApp(importers);
    await flushShell();

    clickButton(target, 'Profil');
    await flushShell();
    expect(profileImporter).toHaveBeenCalledOnce();

    for (const runTimer of scheduledTimers.splice(0)) {
      runTimer();
    }
    await flushShell();

    expect(profileImporter).toHaveBeenCalledOnce();
    profileModule.resolve({ default: ConnectionIndicator });
    await flushShell();
  });

  it('does not import a protected page while its Premium route is locked', async () => {
    featureState.premiumFeatureActive = true;
    const importers = createImporters();
    const target = mountApp(importers);
    await flushShell();

    const cvButton = target.querySelector('button[aria-label="CV inclus dans Premium"]');
    expect(cvButton).not.toBeNull();
    (cvButton as HTMLButtonElement).click();
    await flushShell();

    expect(target.textContent).toContain('Premium verrouillé');
    expect(importers.cv).not.toHaveBeenCalled();
  });

  it('cancels and ignores the deferred initial frame after unmount', async () => {
    let deferredFrame: FrameRequestCallback | null = null;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      deferredFrame = callback;
      return 41;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const importers = createImporters();
    mountApp(importers);
    await flushShell();

    expect(requestFrame).toHaveBeenCalledOnce();
    await unmountLatestApp();
    expect(cancelFrame).toHaveBeenCalledWith(41);

    (deferredFrame as FrameRequestCallback | null)?.(0);
    await flushShell();

    expect(importers.feed).not.toHaveBeenCalled();
    expect(markImportStart).not.toHaveBeenCalled();
  });

  it('ignores the deferred initial frame when a newer navigation wins', async () => {
    let deferredFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrame = callback;
      return 42;
    });
    const importers = createImporters();
    const target = mountApp(importers);
    await flushShell();

    clickButton(target, 'Profil');
    await flushShell();
    expect(importers.profile).toHaveBeenCalledOnce();

    (deferredFrame as FrameRequestCallback | null)?.(0);
    await flushShell();

    expect(importers.feed).not.toHaveBeenCalled();
    expect(markImportStart).not.toHaveBeenCalledWith('feed');
  });

  it('disposes a pending bootstrap and its bridge subscription on unmount', async () => {
    const pendingBootstrap = deferred<null>();
    getProfile.mockReset().mockReturnValueOnce(pendingBootstrap.promise);
    const importers = createImporters();
    mountApp(importers);
    await flushShell();

    await unmountLatestApp();
    expect(unsubscribeMessages).toHaveBeenCalledOnce();

    pendingBootstrap.resolve(null);
    await flushShell();

    expect(getFirstScanDone).not.toHaveBeenCalled();
    expect(getOnboardingCompleted).not.toHaveBeenCalled();
    expect(importers.feed).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a page import %s after unmount',
    async (settlement) => {
      const pendingPage = deferred<PageModule>();
      const feedImporter = vi.fn<TestPageImporter>(() => pendingPage.promise);
      const importers = createImporters(feedImporter);
      mountApp(importers);
      await flushShell();
      expect(feedImporter).toHaveBeenCalledOnce();

      await unmountLatestApp();
      if (settlement === 'resolve') {
        pendingPage.resolve({ default: ConnectionIndicator });
      } else {
        pendingPage.reject(new Error('late page failure'));
      }
      await flushShell();

      expect(markPageLoaded).not.toHaveBeenCalled();
    }
  );
});
