import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import BackupRestoreModal from '../../../src/ui/molecules/BackupRestoreModal.svelte';
import { createBackup, type BackupData } from '../../../src/lib/core/backup/backup';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type { AppSettings } from '../../../src/lib/core/types/app-settings';

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['Svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
};

const settings: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

function makeBackup(): BackupData {
  return createBackup(profile, settings, { m1: 1 }, {}, Date.now());
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountModal(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(BackupRestoreModal, {
    target,
    props: {
      backup: makeBackup(),
      error: null,
      onConfirm: () => Promise.resolve(),
      onCancel: () => {},
      ...props,
    },
  });
  return target;
}

async function typeConfirmation(target: HTMLElement): Promise<void> {
  void target;
  const input = document.querySelector('#backup-restore-confirm') as HTMLInputElement;
  expect(input).not.toBeNull();
  input.value = 'RESTAURER';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}

function getPrimaryButton(target: HTMLElement): HTMLButtonElement {
  void target;
  const buttons = Array.from(document.querySelectorAll('button'));
  // Matches both the idle label ("Restaurer ce point") and the in-flight
  // label ("Restauration...") so the assertion can distinguish the two states.
  return buttons.find((btn) => /Restaur/.test(btn.textContent ?? '')) as HTMLButtonElement;
}

describe('BackupRestoreModal — SET-01 isRestoring reset', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clears the restoring state when onConfirm rejects (spinner not stuck)', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('Échec persisté en base')));
    const target = mountModal({ onConfirm });
    await tick();
    await typeConfirmation(target);

    const primary = getPrimaryButton(target);
    expect(primary).not.toBeNull();
    expect(primary.disabled).toBe(false);

    primary.click();

    // Let the rejected promise settle through await onConfirm() -> catch -> finally
    await flushMicrotasks();
    await tick();

    // isRestoring must be back to false: the button is re-enabled and no longer
    // shows the "Restauration..." spinner label.
    const primaryAfter = getPrimaryButton(target);
    expect(primaryAfter.disabled).toBe(false);
    expect(primaryAfter.textContent).toContain('Restaurer ce point');
    expect(primaryAfter.textContent).not.toContain('Restauration');

    // An inline error must be surfaced so the user can retry.
    expect(document.body.textContent).toContain('Échec persisté en base');
  });

  it('keeps the modal actionable for retry after a failure', async () => {
    let attempts = 0;
    const onConfirm = vi.fn(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('Premier échec')) : Promise.resolve();
    });
    const target = mountModal({ onConfirm });
    await tick();
    await typeConfirmation(target);

    const primary = getPrimaryButton(target);
    primary.click();
    await flushMicrotasks();
    await tick();

    // Retry must be possible: button re-enabled and onConfirm callable again.
    const primaryAfter = getPrimaryButton(target);
    expect(primaryAfter.disabled).toBe(false);
    primaryAfter.click();
    await flushMicrotasks();
    await tick();

    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});

describe('BackupRestoreModal — modal focus contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses confirmation, traps Tab, closes on Escape and restores the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Importer un backup';
    document.body.appendChild(trigger);
    trigger.focus();

    const target = document.createElement('div');
    document.body.appendChild(target);
    let component: ReturnType<typeof mount> | null = null;
    const onCancel = vi.fn(() => {
      if (component) {
        void unmount(component);
      }
    });
    component = mount(BackupRestoreModal, {
      target,
      props: {
        backup: makeBackup(),
        error: null,
        onConfirm: () => Promise.resolve(),
        onCancel,
      },
    });
    await tick();
    await Promise.resolve();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const confirmation = document.querySelector<HTMLInputElement>('#backup-restore-confirm');
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Annuler')
    );
    expect(dialog).not.toBeNull();
    expect(confirmation).not.toBeNull();
    expect(cancel).toBeDefined();
    expect(document.activeElement).toBe(confirmation);
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    confirmation!.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(cancel);

    cancel!.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(confirmation);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await tick();
    await Promise.resolve();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('focuses the close action for an invalid backup', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(BackupRestoreModal, {
      target,
      props: {
        backup: null,
        error: { type: 'INVALID_JSON', message: 'invalid' },
        onConfirm: () => Promise.resolve(),
        onCancel: () => {},
      },
    });
    await tick();
    await Promise.resolve();

    expect((document.activeElement as HTMLButtonElement).textContent).toContain('Fermer');
    await unmount(component);
  });

  it('consumes Escape without closing while the restore operation is busy', async () => {
    let settleRestore: (() => void) | null = null;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settleRestore = resolve;
        })
    );
    const onCancel = vi.fn();
    const target = mountModal({ onConfirm, onCancel });
    await tick();
    await Promise.resolve();
    await typeConfirmation(target);

    getPrimaryButton(target).click();
    await tick();
    document
      .querySelector<HTMLElement>('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    settleRestore?.();
    await flushMicrotasks();
  });
});
