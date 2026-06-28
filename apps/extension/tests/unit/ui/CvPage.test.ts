/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import {
  initToastService,
  getToastActor,
  stopToastService,
} from '../../../src/lib/shell/notifications/toast-service';
import CvPage from '../../../src/ui/pages/CvPage.svelte';

/**
 * Regression for the CV clipboard bug: navigator.clipboard.writeText can reject
 * (no permission, non-secure context, etc.). Previously the rejection was
 * unhandled and no feedback was given. After the fix, an error toast is shown
 * and pushedPlatformIds is not flipped.
 */
describe('CvPage clipboard resilience', () => {
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    installChromeStubs();
    initToastService();

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
    stopToastService();
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    }
  });

  async function mountAndLoad() {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(CvPage, { target });
    // Resolve the on-mount getProfile() IIFE.
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    return target;
  }

  it('shows an error toast when copyPayload clipboard write fails', async () => {
    const target = await mountAndLoad();

    const copyBtn = [...target.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Copier')
    );
    expect(copyBtn).toBeTruthy();
    copyBtn!.click();
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();

    const actor = getToastActor();
    const errorToasts = (actor?.toasts ?? []).filter((t) => t.toastType === 'error');
    expect(errorToasts.length).toBeGreaterThan(0);
  });

  it('does not mark a platform as pushed when clipboard fails', async () => {
    const target = await mountAndLoad();

    const pushBtn = [...target.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Copier et ouvrir')
    );
    expect(pushBtn).toBeTruthy();
    pushBtn!.click();
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();

    expect(target.textContent).not.toContain('Prêt');
  });
});
