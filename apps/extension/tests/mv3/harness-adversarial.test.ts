import { expect, test } from './fixtures';

test.describe('packaged MV3 harness diagnostic gate', () => {
  test('instruments a restarted service worker before its bootstrap executes', async ({
    extension,
  }) => {
    const warningMarker = '__MV3_BOOTSTRAP_WARNING_PROBE__';
    const rejectionMarker = '__MV3_BOOTSTRAP_REJECTION_PROBE__';

    await extension.restartServiceWorkerForProbe(`
      console.warn('[MissionPulse] bootstrap failed: ${warningMarker}');
      Promise.reject(new Error('${rejectionMarker}'));
    `);

    await expect
      .poll(() => extension.diagnostics.serviceWorkerConsoleFailures.join('\n'), {
        timeout: 5_000,
      })
      .toContain(warningMarker);
    await expect
      .poll(() => extension.diagnostics.serviceWorkerExceptions.join('\n'), {
        timeout: 5_000,
      })
      .toContain(rejectionMarker);
    test.fail(true, 'The fixture teardown must reject both captured bootstrap diagnostics.');
  });

  test('fails the test when the bootstrapping worker rejects a promise', async ({ extension }) => {
    const marker = '__MV3_WORKER_REJECTION_GATE_PROBE__';
    await extension.restartServiceWorkerForProbe(`Promise.reject(new Error('${marker}'));`);
    await expect
      .poll(() => extension.diagnostics.serviceWorkerExceptions.join('\n'), {
        timeout: 5_000,
      })
      .toContain(marker);
    test.fail(true, 'The fixture teardown must reject the worker bootstrap exception.');
  });

  test('fails the test when the side panel raises an uncaught page error', async ({
    extension,
  }) => {
    const marker = '__MV3_PAGEERROR_PROBE__';
    const page = await extension.openSidePanel();
    await page.evaluate((message) => {
      setTimeout(() => {
        throw new Error(message);
      }, 0);
    }, marker);

    await expect
      .poll(() => JSON.stringify(extension.diagnostics), { timeout: 5_000 })
      .toContain(marker);
    test.fail(true, 'The fixture teardown must reject the injected pageerror.');
  });

  test('fails the test when the side panel logs a console error', async ({ extension }) => {
    const marker = '__MV3_PAGE_CONSOLE_PROBE__';
    const page = await extension.openSidePanel();
    await page.evaluate((message) => console.error(message), marker);

    await expect
      .poll(() => JSON.stringify(extension.diagnostics), { timeout: 5_000 })
      .toContain(marker);
    test.fail(true, 'The fixture teardown must reject the injected console.error.');
  });

  test('settles diagnostics before teardown so a late error cannot pass green', async ({
    extension,
  }) => {
    const marker = '__MV3_LATE_ERROR_PROBE__';
    const page = await extension.openSidePanel();
    await page.evaluate((message) => {
      setTimeout(() => console.error(message), 25);
    }, marker);
    await expect
      .poll(() => JSON.stringify(extension.diagnostics), { timeout: 5_000 })
      .toContain(marker);
    test.fail(true, 'The fixture teardown must wait for and reject the late console.error.');
  });
});
