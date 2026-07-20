import { expect, expectNoRuntimeErrors, test } from './fixtures';
import { assertPackagedManifestPermissionContract } from '../mv3/manifest-contract';

test(
  'packaged manifest, bridge persistence, alarms, and worker survive a real worker restart',
  { annotation: { type: 'scenario-id', description: 'runtime.service-worker-reload' } },
  async ({ extension }) => {
    expect(extension.manifest.manifest_version).toBe(3);
    expect(extension.manifest.background).toEqual({
      service_worker: 'service-worker-loader.js',
      type: 'module',
    });
    expect(extension.manifest.side_panel?.default_path).toBe('src/sidepanel/index.html');
    assertPackagedManifestPermissionContract(extension.manifest);

    const page = await extension.openSidePanel();
    const expectedSettings = {
      autoScan: true,
      customDelayMs: 0,
      enabledConnectors: [],
      maxSemanticPerScan: 4,
      notificationScoreThreshold: 75,
      notifications: false,
      respectRateLimits: true,
      scanIntervalMinutes: 42,
      theme: 'light',
    };
    const saveResult = await page.evaluate(async (settings) => {
      const readConfirmedSnapshot = async () => {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS_RELEASE' });
        if (
          response?.type !== 'SETTINGS_RELEASE_RESULT' ||
          response.payload?.status !== 'confirmed'
        ) {
          throw new Error('Settings release snapshot is unavailable.');
        }
        return response.payload.snapshot;
      };

      let snapshot = await readConfirmedSnapshot();
      if (!snapshot.onboardingCompleted) {
        const consent = await chrome.runtime.sendMessage({
          type: 'MUTATE_SETTINGS_RELEASE',
          payload: {
            kind: 'set_consent',
            requestId: crypto.randomUUID(),
            baseRevision: snapshot.revision,
            targetConsent: true,
          },
        });
        if (
          consent?.type !== 'SETTINGS_RELEASE_MUTATION_RESULT' ||
          (consent.payload?.status !== 'settled' && consent.payload?.status !== 'not_admitted')
        ) {
          throw new Error('Onboarding consent was not settled.');
        }
        snapshot = await readConfirmedSnapshot();
      }

      return chrome.runtime.sendMessage({
        type: 'MUTATE_SETTINGS_RELEASE',
        payload: {
          kind: 'save_settings',
          requestId: crypto.randomUUID(),
          baseRevision: snapshot.revision,
          settings,
        },
      });
    }, expectedSettings);
    expect(saveResult).toMatchObject({
      type: 'SETTINGS_RELEASE_MUTATION_RESULT',
      payload: {
        status: 'settled',
        outcome: {
          kind: 'save_settings',
          status: 'committed',
          snapshot: {
            onboardingCompleted: true,
            settings: expectedSettings,
          },
        },
      },
    });

    let activePage = page;
    const readConfirmedSnapshot = async () =>
      activePage.evaluate(async () => {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS_RELEASE' });
        if (
          response?.type !== 'SETTINGS_RELEASE_RESULT' ||
          response.payload?.status !== 'confirmed'
        ) {
          throw new Error('Settings release snapshot is unavailable.');
        }
        return response.payload.snapshot;
      });
    const snapshotBeforeRestart = await readConfirmedSnapshot();
    expect(Object.keys(snapshotBeforeRestart.settings).sort()).toEqual(
      Object.keys(expectedSettings).sort()
    );
    expect(snapshotBeforeRestart.settings).toEqual(expectedSettings);
    expect(snapshotBeforeRestart.onboardingCompleted).toBe(true);

    await expect
      .poll(
        () =>
          extension.evaluateInServiceWorker<number | null>(`
            chrome.alarms.get('auto-scan').then((alarm) => alarm?.periodInMinutes ?? null)
          `),
        { timeout: 10_000 }
      )
      .toBe(42);

    const restartReceipt = await extension.restartServiceWorkerForProbe();
    expect(page.isClosed()).toBe(true);
    activePage = await extension.openSidePanel();
    await expect(
      extension.evaluateInRestartedServiceWorker<number | null>(
        restartReceipt,
        `
        chrome.alarms.get('auto-scan').then((alarm) => alarm?.periodInMinutes ?? null)
      `
      )
    ).resolves.toBe(42);
    await expect
      .poll(async () => {
        try {
          return await readConfirmedSnapshot();
        } catch {
          return null;
        }
      })
      .toEqual(snapshotBeforeRestart);

    const snapshotAfterRestart = await readConfirmedSnapshot();
    expect(snapshotAfterRestart).toEqual(snapshotBeforeRestart);
    expect(snapshotAfterRestart.settings).toEqual(expectedSettings);
    expect(snapshotAfterRestart.onboardingCompleted).toBe(true);
    expect(snapshotAfterRestart.revision).toBe(snapshotBeforeRestart.revision);
    expect(snapshotAfterRestart.generation).toBe(snapshotBeforeRestart.generation);

    expect(new URL(restartReceipt.workerUrl).hostname).toBe(extension.extensionId);
    expect(await activePage.evaluate(() => '__devPanelReady' in window)).toBe(false);
    expectNoRuntimeErrors(extension.diagnostics);
  }
);
