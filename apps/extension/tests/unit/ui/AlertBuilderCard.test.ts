import { beforeEach, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import AlertBuilderCard from '../../../src/ui/molecules/AlertBuilderCard.svelte';
import type { ConnectedAlertPreferences } from '../../../src/lib/core/types/alert-preferences';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Mission Svelte',
    client: null,
    description: '',
    stack: ['Svelte', 'TypeScript'],
    tjm: 750,
    location: 'Paris',
    remote: 'hybrid',
    duration: null,
    startDate: null,
    url: 'https://example.com/mission-1',
    source: 'free-work',
    scrapedAt: new Date('2026-06-24T10:00:00.000Z'),
    seniority: null,
    score: 85,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makePreferences(
  overrides: Partial<ConnectedAlertPreferences> = {}
): ConnectedAlertPreferences {
  return {
    enabled: true,
    scoreThreshold: 70,
    minDailyRate: 650,
    requiredStacks: ['Svelte'],
    maxResults: 1,
    revision: 1,
    updatedAt: '2026-06-24T10:00:00.000Z',
    ...overrides,
  };
}

function mountCard(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(AlertBuilderCard, {
    target,
    props: {
      preferences: makePreferences(),
      previewMissions: [
        makeMission({ id: 'a', score: 92, tjm: 800 }),
        makeMission({ id: 'b', score: 84, tjm: 700 }),
        makeMission({ id: 'seen', score: 96, tjm: 900 }),
      ],
      seenMissionIds: ['seen'],
      ...props,
    },
  });
  return target;
}

describe('AlertBuilderCard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the current alert volume before saving preferences', async () => {
    const target = mountCard();
    await tick();
    const text = target.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    expect(text).toContain('Aperçu avec vos données actuelles');
    expect(text).toContain('cette alerte notifierait 1 mission');
    expect(text).toContain('1 autre resterait hors notification');
    expect(text).toContain('3');
    expect(text).toContain('Locales');
    expect(text).toContain('2');
    expect(text).toContain('Éligibles');
    expect(text).toContain('Notifiées');
    expect(text).toContain('1 mission déjà vue exclue du volume');
  });
});
