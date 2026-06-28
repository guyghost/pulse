import { beforeEach, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import ConnectorStatus from '../../../src/ui/molecules/ConnectorStatus.svelte';
import type { PersistedConnectorStatus } from '../../../src/lib/core/types/connector-status';

function makePersisted(
  overrides: Partial<PersistedConnectorStatus> = {}
): PersistedConnectorStatus {
  return {
    connectorId: 'free-work',
    connectorName: 'Free-Work',
    lastState: 'error',
    missionsCount: 0,
    error: null,
    lastSyncAt: Date.now(),
    lastSuccessAt: null,
    ...overrides,
  };
}

function mountStatus(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ConnectorStatus, {
    target,
    props: {
      name: 'Free-Work',
      icon: '',
      url: 'https://www.freelance.com',
      status: null,
      persisted: makePersisted(),
      ...props,
    },
  });
  return target;
}

describe('ConnectorStatus — SET-04 sub-minute relative time', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows "à l\'instant" for sub-minute deltas (matches SourceHealthPanel)', async () => {
    const target = mountStatus();
    await tick();

    const text = target.textContent ?? '';
    expect(text).toContain("à l'instant");
    expect(text).not.toContain('il y a 0min');
  });

  it('still renders minute/hour/day buckets correctly', async () => {
    const target = mountStatus({
      persisted: makePersisted({ lastSyncAt: Date.now() - 5 * 60_000 }),
    });
    await tick();

    expect(target.textContent).toContain('il y a 5min');
  });
});
