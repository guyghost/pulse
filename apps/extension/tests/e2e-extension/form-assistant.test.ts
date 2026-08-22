import { expect, expectNoRuntimeErrors, test } from './fixtures';

/**
 * Machine D contract gate (src/models/form-assistant.model.md) — packaged build.
 *
 * Dynamic import() is disallowed in service workers by the HTML specification
 * (w3c/ServiceWorker#1356), and Vite's __vitePreload wrapper additionally
 * references document/window to inject modulepreload links — neither global
 * exists in ServiceWorkerGlobalScope. Before the fix (static imports in the
 * worker), every packaged enable/disable answered
 * { success: false, error: "document/window is not defined" } instead of the
 * FORM_ASSIST_ENABLED transition the model mandates. Dev was unaffected
 * (native imports), which is why only the packaged gate catches this.
 */
test(
  'packaged service worker honors FORM_ASSIST_ENABLE and persists the flag',
  { annotation: { type: 'scenario-id', description: 'form-assistant.enable-contract' } },
  async ({ extension }) => {
    // Machine D requires an explicit user action on an already-bootstrapped
    // panel; seeding the bootstrap flags keeps the toggle reachable without
    // driving the full onboarding wizard.
    await extension.seedStorage({
      feed_tour_seen: true,
      first_scan_done: true,
      kbd_cheatsheet_tip_seen: true,
      onboarding_completed: true,
      premium_enabled: true,
      profile_banner_dismissed: true,
    });

    const page = await extension.openSidePanel();

    const enableResult = await page.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'FORM_ASSIST_ENABLE',
        payload: { enabled: true },
      });
      const stored = await chrome.storage.local.get('formAssist');
      return { response, stored };
    });
    expect(enableResult.response).toMatchObject({
      type: 'FORM_ASSIST_ENABLED',
      payload: { enabled: true, engine: 'local' },
    });
    expect(enableResult.stored).toMatchObject({
      formAssist: { enabled: true, engine: 'local' },
    });

    // Machine D invariant: the flag is user-owned and reversible — the disable
    // transition must persist enabled:false and not carry stale state.
    const disableResult = await page.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'FORM_ASSIST_ENABLE',
        payload: { enabled: false },
      });
      const stored = await chrome.storage.local.get('formAssist');
      return { response, stored };
    });
    expect(disableResult.response).toMatchObject({
      type: 'FORM_ASSIST_ENABLED',
      payload: { enabled: false, engine: 'local' },
    });
    expect(disableResult.stored).toMatchObject({
      formAssist: { enabled: false, engine: 'local' },
    });

    // The worker must survive between transitions (Machine D liveness).
    const activeWorker = await extension.waitForServiceWorker(page);
    expect(new URL(activeWorker.url()).hostname).toBe(extension.extensionId);
    expectNoRuntimeErrors(extension.diagnostics);
  }
);
