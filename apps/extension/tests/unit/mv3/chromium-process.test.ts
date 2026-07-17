import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import {
  admitPinnedChromiumRuntime,
  buildChromiumLaunchArgs,
  launchOwnedChromiumProcess,
  type SpawnedProcessLike,
} from '../../mv3/harness/chromium-process';

const profilePath = '/tmp/missionpulse-profile';
const distPath = '/tmp/missionpulse-dist';

class FakeProcess extends EventEmitter implements SpawnedProcessLike {
  readonly pid = 42_424;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly killSignals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.killSignals.push(signal);
    if (signal === 'SIGTERM') {
      queueMicrotask(() => this.emit('exit', 0, signal));
    }
    return true;
  }
}

const commonArgs = [
  '--disable-field-trial-config',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-back-forward-cache',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--no-default-browser-check',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-edgeupdater',
  '--disable-extensions',
  '--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion',
  '--enable-features=CDPScreenshotNewSurface',
  '--allow-pre-commit-input',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--force-color-profile=srgb',
  '--metrics-recording-only',
  '--no-first-run',
  '--password-store=basic',
  '--use-mock-keychain',
  '--no-service-autorun',
  '--export-tagged-pdf',
  '--disable-search-engine-choice-screen',
  '--unsafely-disable-devtools-self-xss-warnings',
  '--edge-skip-compat-layer-relaunch',
  '--disable-infobars',
  '--disable-sync',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',
  `--user-data-dir=${profilePath}`,
  `--disable-extensions-except=${distPath}`,
  `--load-extension=${distPath}`,
  '--window-size=420,900',
] as const;

describe('manually owned Chromium launch contract', () => {
  it('admits the exact installed Playwright 1.61.1 / Chromium 1228 runtime', async () => {
    const receipt = await admitPinnedChromiumRuntime();

    expect(receipt).toMatchObject({
      browserTitle: 'Chrome for Testing',
      browserVersion: '149.0.7827.55',
      executableSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      executableVersion: 'Google Chrome for Testing 149.0.7827.55',
      playwrightVersion: '1.61.1',
      revision: '1228',
      schemaVersion: 1,
    });
    expect(receipt.executableRealPath).toContain('/chromium-1228/');
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('builds the exact headed allowlist with one final sentinel', () => {
    expect(buildChromiumLaunchArgs({ distPath, headless: false, profilePath })).toEqual([
      ...commonArgs,
      'about:blank',
    ]);
  });

  it('adds only the four reviewed headless arguments before the sentinel', () => {
    expect(buildChromiumLaunchArgs({ distPath, headless: true, profilePath })).toEqual([
      ...commonArgs,
      '--headless',
      '--hide-scrollbars',
      '--mute-audio',
      '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      'about:blank',
    ]);
  });

  it.each([
    { distPath: 'relative/dist', headless: true, profilePath },
    { distPath, headless: true, profilePath: 'relative/profile' },
    { distPath: `${distPath}\n--remote-debugging-port=9222`, headless: true, profilePath },
    { distPath, headless: true, profilePath: `${profilePath}\u0000suffix` },
  ])('rejects unsealed or control-bearing path input %#', (input) => {
    expect(() => buildChromiumLaunchArgs(input)).toThrow();
  });

  it('spawns without a shell, redacts endpoint output and freezes exact exit identity', async () => {
    const fake = new FakeProcess();
    let spawnCall: readonly unknown[] | undefined;
    const launched = launchOwnedChromiumProcess({
      distPath,
      headless: true,
      processGeneration: 9,
      profilePath,
      profileRealPath: profilePath,
      runtime: {
        browserTitle: 'Chrome for Testing',
        browserVersion: '149.0.7827.55',
        executableRealPath: '/tmp/chromium-1228/chrome',
        executableSha256: 'a'.repeat(64),
        executableVersion: 'Google Chrome for Testing 149.0.7827.55',
        playwrightVersion: '1.61.1',
        revision: '1228',
        schemaVersion: 1,
      },
      spawnProcess: (executable, args, options) => {
        spawnCall = [executable, args, options];
        queueMicrotask(() => fake.emit('spawn'));
        return fake;
      },
    });
    const owned = await launched;
    expect(owned.pid).toBe(42_424);
    fake.stderr.emit(
      'data',
      Buffer.from(
        'DevTools listening on ws://127.0.0.1:9222/devtools/browser/8d2f0c65-4e3b-4b88-8dc4-0fdf90d3195e\n'
      )
    );

    expect(spawnCall?.[0]).toBe('/tmp/chromium-1228/chrome');
    expect(spawnCall?.[2]).toMatchObject({ shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(owned.outputSnapshot().stderr).toContain('[REDACTED_DEVTOOLS_ENDPOINT]');
    expect(owned.outputSnapshot().stderr).not.toContain('9222');
    expect(owned.outputSnapshot().stderr).not.toContain('8d2f0c65');

    fake.emit('exit', 0, null);
    await expect(owned.exited).resolves.toEqual({
      code: 0,
      pid: 42_424,
      processGeneration: 9,
      schemaVersion: 1,
      signal: null,
      terminationMode: 'natural',
    });
    expect(Object.isFrozen(await owned.exited)).toBe(true);
  });

  it('uses bounded SIGTERM cleanup and records that forced cleanup cannot prove pass', async () => {
    const fake = new FakeProcess();
    const launched = launchOwnedChromiumProcess({
      distPath,
      headless: false,
      processGeneration: 2,
      profilePath,
      profileRealPath: profilePath,
      runtime: {
        browserTitle: 'Chrome for Testing',
        browserVersion: '149.0.7827.55',
        executableRealPath: '/tmp/chromium-1228/chrome',
        executableSha256: 'a'.repeat(64),
        executableVersion: 'Google Chrome for Testing 149.0.7827.55',
        playwrightVersion: '1.61.1',
        revision: '1228',
        schemaVersion: 1,
      },
      spawnProcess: () => {
        queueMicrotask(() => fake.emit('spawn'));
        return fake;
      },
    });
    const owned = await launched;

    const receipt = await owned.terminate({ killGraceMs: 20, termGraceMs: 20 });

    expect(fake.killSignals).toEqual(['SIGTERM']);
    expect(receipt).toMatchObject({
      pid: 42_424,
      processGeneration: 2,
      signal: 'SIGTERM',
      terminationMode: 'sigterm',
    });
  });
});
