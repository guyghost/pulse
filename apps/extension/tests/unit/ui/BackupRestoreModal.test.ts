import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import BackupRestoreModal from '../../../src/ui/molecules/BackupRestoreModal.svelte';
import { createBackup, type BackupData } from '../../../src/lib/core/backup/backup';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type { AppSettings } from '../../../src/lib/core/types/app-settings';

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['Svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
  searchKeywords: [],
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
  const input = target.querySelector('#backup-restore-confirm') as HTMLInputElement;
  expect(input).not.toBeNull();
  input.value = 'RESTAURER';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}

function getPrimaryButton(target: HTMLElement): HTMLButtonElement {
  const buttons = Array.from(target.querySelectorAll('button'));
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
    expect(target.textContent).toContain('Échec persisté en base');
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
