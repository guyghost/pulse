import { describe, it, expect } from 'vitest';
import { parseCherryPickMissions } from '../../../src/lib/core/connectors/cherrypick-parser';

const NOW = new Date('2026-03-15T12:00:00Z');

const FIXTURE_MISSIONS = [
  {
    id: 1234,
    name: 'Dev React Senior',
    slug: 'dev-react-senior-1234',
    minimum_rate: 500,
    maximum_rate: 700,
    start_date: '2026-04-01',
    duration: '6 mois',
    city: 'Paris',
    country: 'France',
    displacement: 'partially_remote_3',
    work_time: 'full_time',
    company: { name: 'Acme Corp' },
    skills: [{ name: 'React' }, { name: 'TypeScript' }],
    description: 'Mission React pour projet e-commerce',
  },
  {
    id: 5678,
    name: 'Lead Java Spring',
    slug: 'lead-java-spring-5678',
    minimum_rate: null,
    maximum_rate: 650,
    start_date: null,
    duration: '3 mois',
    city: 'Lyon',
    country: 'France',
    displacement: 'remote',
    work_time: 'full_time',
    company: { name: 'Tech SA' },
    skills: [{ name: 'Java' }, { name: 'Spring' }],
    description: null,
  },
];

describe('parseCherryPickMissions', () => {
  it('parse les missions depuis la reponse API', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'cherry-pick',
      title: 'Dev React Senior',
      id: 'cp-1234',
      scrapedAt: NOW,
    });
  });

  it('extrait un ID stable depuis l ID numerique', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].id).toBe('cp-1234');
    expect(missions[1].id).toBe('cp-5678');
  });

  it('extrait les tags de stack', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].stack).toEqual(['React', 'TypeScript']);
  });

  it('mappe displacement vers RemoteType', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].remote).toBe('hybrid');
    expect(missions[1].remote).toBe('full');
  });

  it('calcule le TJM moyen depuis min/max rates', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].tjm).toBe(600);
  });

  it('utilise max rate si min est null', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[1].tjm).toBe(650);
  });

  it('extrait le client depuis company.name', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].client).toBe('Acme Corp');
  });

  it('construit l URL depuis le slug', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].url).toBe('https://app.cherry-pick.io/mission/dev-react-senior-1234');
  });

  it('retourne un tableau vide pour un tableau vide', () => {
    expect(parseCherryPickMissions([], NOW)).toEqual([]);
  });

  it('gere company null', () => {
    const missions = parseCherryPickMissions([{
      ...FIXTURE_MISSIONS[0],
      company: null,
    }], NOW);
    expect(missions[0].client).toBeNull();
  });

  it('mappe no_remote vers onsite', () => {
    const missions = parseCherryPickMissions([{
      ...FIXTURE_MISSIONS[0],
      displacement: 'no_remote',
    }], NOW);
    expect(missions[0].remote).toBe('onsite');
  });
});
