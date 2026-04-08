import { describe, it, expect } from 'vitest';
import { isFreelanceMission, filterSalariedMissions } from '$lib/core/scoring/contract-filter';
import type { Mission } from '$lib/core/types/mission';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'test-1',
  title: 'Développeur React Senior',
  client: null,
  description: 'Mission freelance',
  stack: ['React'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  startDate: null,
  url: 'https://example.com/mission/1',
  source: 'free-work',
  scrapedAt: new Date('2026-04-01'),
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('isFreelanceMission', () => {
  it('returns true for a regular freelance mission', () => {
    expect(isFreelanceMission(makeMission())).toBe(true);
  });

  it('returns false when title contains CDI', () => {
    expect(isFreelanceMission(makeMission({ title: 'Développeur React - CDI' }))).toBe(false);
  });

  it('returns false when title contains CDD', () => {
    expect(isFreelanceMission(makeMission({ title: 'Dev Java CDD 12 mois' }))).toBe(false);
  });

  it('returns false when title contains "en CDI"', () => {
    expect(isFreelanceMission(makeMission({ title: 'Lead Dev en CDI' }))).toBe(false);
  });

  it('returns false when description mentions CDI', () => {
    expect(
      isFreelanceMission(makeMission({ description: 'Poste en CDI avec avantages salariés' }))
    ).toBe(false);
  });

  it('returns false for "contrat salarié"', () => {
    expect(isFreelanceMission(makeMission({ description: 'Contrat salarié temps plein' }))).toBe(
      false
    );
  });

  it('returns true when CDI appears inside another word (e.g. CREDIT)', () => {
    expect(isFreelanceMission(makeMission({ title: 'Mission CREDIT Agricole' }))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isFreelanceMission(makeMission({ title: 'Dev React cdi' }))).toBe(false);
    expect(isFreelanceMission(makeMission({ title: 'Dev React Cdi' }))).toBe(false);
  });

  it('returns true for null description', () => {
    expect(isFreelanceMission(makeMission({ description: '' }))).toBe(true);
  });
});

describe('filterSalariedMissions', () => {
  it('removes salaried missions from array', () => {
    const missions = [
      makeMission({ id: '1', title: 'Freelance React' }),
      makeMission({ id: '2', title: 'Dev Java CDI' }),
      makeMission({ id: '3', title: 'Mission Svelte' }),
      makeMission({ id: '4', title: 'Lead CDD 6 mois' }),
    ];
    const result = filterSalariedMissions(missions);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['1', '3']);
  });

  it('returns all missions when none are salaried', () => {
    const missions = [makeMission({ id: '1' }), makeMission({ id: '2' })];
    expect(filterSalariedMissions(missions)).toHaveLength(2);
  });

  it('returns empty array when all are salaried', () => {
    const missions = [
      makeMission({ id: '1', title: 'CDI React' }),
      makeMission({ id: '2', title: 'CDD Java' }),
    ];
    expect(filterSalariedMissions(missions)).toHaveLength(0);
  });
});
