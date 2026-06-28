import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import ScanSettings from '../../../src/ui/organisms/ScanSettings.svelte';

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    autoScan: true,
    scanInterval: 30,
    notifications: true,
    lastScanLabel: 'Aucun scan enregistré',
    scanHistoryLabel: 'Aucun historique par source',
    nextScanLabel: 'Prochain déclenchement',
    scanHistoryTone: 'neutral' as const,
    onToggleAutoScan: vi.fn(),
    onToggleNotifications: vi.fn(),
    onScanIntervalChange: vi.fn(),
    ...overrides,
  };
}

function mountScan(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ScanSettings, { target, props: baseProps(props) });
  return target;
}

function getRangeInput(target: HTMLElement): HTMLInputElement {
  return target.querySelector('input[type="range"]') as HTMLInputElement;
}

describe('ScanSettings — SET-03 range disabled when autoScan off', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('truly disables the range input (keyboard-operable) when autoScan is off', async () => {
    const target = mountScan({ autoScan: false });
    await tick();

    const range = getRangeInput(target);
    expect(range).not.toBeNull();
    // Keyboard / assistive-tech must not be able to operate the range.
    expect(range.disabled).toBe(true);
    expect(range.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the range input enabled when autoScan is on', async () => {
    const target = mountScan({ autoScan: true });
    await tick();

    const range = getRangeInput(target);
    expect(range.disabled).toBe(false);
    expect(range.getAttribute('aria-disabled')).toBeFalsy();
  });
});
