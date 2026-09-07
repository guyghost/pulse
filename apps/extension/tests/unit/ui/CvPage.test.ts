/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import CvPage from '../../../src/ui/pages/CvPage.svelte';

describe('CvPage without manual cross-platform synchronization', () => {
  let originalClipboardDescriptor: PropertyDescriptor | undefined;
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    installChromeStubs();

    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText,
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

  it('does not render or start the retired clipboard synchronization flow', async () => {
    const target = await mountAndLoad();

    const syncButton = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Synchroniser')
    );
    expect(target.textContent).not.toContain('Synchronisation du CV');
    expect(syncButton).toBeUndefined();
    expect(writeText).not.toHaveBeenCalled();
  });
});
