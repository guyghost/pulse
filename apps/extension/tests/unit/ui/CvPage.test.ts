/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import CvPage from '../../../src/ui/pages/CvPage.svelte';

/**
 * Regression for the CV clipboard bug: navigator.clipboard.writeText can reject
 * (no permission, non-secure context, etc.). The sync flow must surface the
 * failure in the panel and mark every platform as errored — no platform should
 * be marked as synced.
 */
describe('CvPage clipboard resilience', () => {
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    installChromeStubs();

    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard not allowed')),
      },
      configurable: true,
    });

    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    }
  });

  async function mountAndLoad() {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(CvPage, { target });
    // Resolve the on-mount profile load.
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    return target;
  }

  async function flush() {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
  }

  it('surfaces a sync error in the panel when clipboard write fails', async () => {
    const target = await mountAndLoad();

    const syncBtn = [...target.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Synchroniser')
    );
    expect(syncBtn).toBeTruthy();
    syncBtn!.click();
    await flush();

    // The global clipboard probe fails → every platform errored → error headline.
    expect(target.textContent).toContain('refusé');
  });

  it('does not mark any platform as synced when clipboard fails', async () => {
    const target = await mountAndLoad();

    const syncBtn = [...target.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Synchroniser')
    );
    expect(syncBtn).toBeTruthy();
    syncBtn!.click();
    await flush();

    expect(target.textContent).not.toContain('Synchronisé');
    // Each platform should surface the failure instead.
    expect(target.textContent).toContain('Échec');
  });
});
