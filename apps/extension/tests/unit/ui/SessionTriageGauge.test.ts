import { beforeEach, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import SessionTriageGauge from '../../../src/ui/atoms/SessionTriageGauge.svelte';
import type { SessionTriageProgress } from '../../../src/lib/core/feed/session-triage';

describe('SessionTriageGauge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when totalCount is 0', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const progress: SessionTriageProgress = {
      totalCount: 0,
      qualifiedCount: 0,
      unseenCount: 0,
      percent: 100,
      isInboxZero: false,
      favoritesCount: 0,
      label: '0/0 qualifiée',
    };

    mount(SessionTriageGauge, { target, props: { progress } });
    await tick();

    expect(target.querySelector('[data-testid="session-triage-gauge"]')).toBeNull();
  });

  it('renders progress bar and label when in progress', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const progress: SessionTriageProgress = {
      totalCount: 10,
      qualifiedCount: 4,
      unseenCount: 6,
      percent: 40,
      isInboxZero: false,
      favoritesCount: 1,
      label: '4/10 qualifiées',
    };

    mount(SessionTriageGauge, { target, props: { progress } });
    await tick();

    const gauge = target.querySelector('[data-testid="session-triage-gauge"]');
    expect(gauge).not.toBeNull();
    expect(gauge?.textContent).toContain('4/10 qualifiées');
  });

  it('renders "Veille à jour" badge when isInboxZero is true', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const progress: SessionTriageProgress = {
      totalCount: 10,
      qualifiedCount: 10,
      unseenCount: 0,
      percent: 100,
      isInboxZero: true,
      favoritesCount: 3,
      label: '10/10 qualifiées',
    };

    mount(SessionTriageGauge, { target, props: { progress } });
    await tick();

    const gauge = target.querySelector('[data-testid="session-triage-gauge"]');
    expect(gauge).not.toBeNull();
    expect(gauge?.textContent).toContain('Veille à jour');
  });
});
