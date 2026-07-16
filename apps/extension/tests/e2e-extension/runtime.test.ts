import { expect, expectNoRuntimeErrors, test } from './fixtures';
import { assertPackagedManifestPermissionContract } from '../mv3/manifest-contract';

test('packaged manifest, bridge persistence, alarms, and worker survive reload', async ({
  extension,
}) => {
  expect(extension.manifest.manifest_version).toBe(3);
  expect(extension.manifest.background).toEqual({
    service_worker: 'service-worker-loader.js',
    type: 'module',
  });
  expect(extension.manifest.side_panel?.default_path).toBe('src/sidepanel/index.html');
  assertPackagedManifestPermissionContract(extension.manifest);

  const page = await extension.openSidePanel();
  const saveResult = await page.evaluate(async () =>
    chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: {
        autoScan: true,
        customDelayMs: 0,
        enabledConnectors: [],
        maxSemanticPerScan: 4,
        notificationScoreThreshold: 75,
        notifications: false,
        respectRateLimits: true,
        scanIntervalMinutes: 42,
        theme: 'light',
      },
    })
  );
  expect(saveResult).toMatchObject({
    type: 'SETTINGS_SAVED',
    payload: { saved: true },
  });

  const workerBeforeReload = await extension.waitForServiceWorker(page);
  await expect
    .poll(
      () =>
        workerBeforeReload.evaluate(async () => {
          const alarm = await chrome.alarms.get('auto-scan');
          return alarm?.periodInMinutes ?? null;
        }),
      { timeout: 10_000 }
    )
    .toBe(42);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const settingsAfterReload = await page.evaluate(async () =>
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
  );
  expect(settingsAfterReload).toMatchObject({
    type: 'SETTINGS_RESULT',
    payload: {
      autoScan: true,
      scanIntervalMinutes: 42,
      theme: 'light',
    },
  });

  const workerAfterReload = await extension.waitForServiceWorker(page);
  expect(new URL(workerAfterReload.url()).hostname).toBe(extension.extensionId);
  expect(await page.evaluate(() => '__devPanelReady' in window)).toBe(false);
  expectNoRuntimeErrors(extension.diagnostics);
});
