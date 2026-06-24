import { describe, expect, it } from 'vitest';
import { exportMissionsToMarkdown } from '../../../src/lib/core/export/mission-export';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Mission Svelte senior',
    client: 'Acme',
    description: 'Construire un cockpit Svelte.',
    stack: ['Svelte', 'TypeScript'],
    tjm: 750,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: 'https://example.com/mission-1',
    source: 'free-work',
    scrapedAt: new Date('2026-06-20T08:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: {
      criteria: {
        stack: 40,
        location: 20,
        tjm: 20,
        remote: 10,
        seniorityBonus: 5,
        startDateBonus: 0,
      },
      deterministic: 90,
      semantic: 86,
      semanticReason: 'Très bon alignement Svelte et TJM.',
      total: 88,
      grade: 'A',
    },
    score: 88,
    semanticScore: 86,
    semanticReason: 'Très bon alignement Svelte et TJM.',
    ...overrides,
  };
}

describe('mission markdown export', () => {
  it('generates a decision-oriented shortlist report', () => {
    const markdown = exportMissionsToMarkdown(
      [
        makeMission(),
        makeMission({
          id: 'mission-2',
          title: 'Mission React',
          client: null,
          stack: ['React', 'TypeScript'],
          tjm: 650,
          source: 'lehibou',
          scoreBreakdown: null,
          score: 72,
          semanticScore: null,
          semanticReason: null,
        }),
      ],
      { format: 'markdown', includeDescription: true },
      new Date('2026-06-24T12:00:00.000Z')
    );

    expect(markdown).toContain('# Shortlist MissionPulse');
    expect(markdown).toContain('## Synthèse shortlist');
    expect(markdown).toContain('**Volume:** 2 missions retenues');
    expect(markdown).toContain('**TJM observé:** 650-750 EUR/jour');
    expect(markdown).toContain('**Stacks dominantes:** TypeScript');
    expect(markdown).toContain('**Confidentialité:** rapport local généré depuis vos favoris');
    expect(markdown).toContain('## Missions retenues');
    expect(markdown).toContain('### 1. Mission Svelte senior');
    expect(markdown).toContain('**Signal score:** Très bon alignement Svelte et TJM.');
    expect(markdown).toContain('[Lien vers la mission](https://example.com/mission-1)');
  });
});
