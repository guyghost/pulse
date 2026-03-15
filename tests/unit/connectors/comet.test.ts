import { describe, it, expect } from 'vitest';
import { parseCometMissions } from '../../../src/lib/core/connectors/comet-parser';

const NOW = new Date('2026-03-13T12:00:00Z');

const FIXTURE_MISSIONS = [
  {
    id: 41715,
    title: 'Architecte Cloud AWS',
    status: 'seeking',
    durationInDays: 182,
    startDate: '2026-03-02T00:00:00.000Z',
    prefWorkplace: 'remote',
    experienceLevel: 'experienced',
    createdAt: '2026-02-17T13:45:43.730Z',
    address: { city: 'Paris' },
    skills: [{ name: 'AWS' }, { name: 'Terraform' }, { name: 'Docker' }],
  },
  {
    id: 41758,
    title: 'Developpeur Python Data',
    status: 'seeking',
    durationInDays: 90,
    startDate: '2026-04-01T00:00:00.000Z',
    prefWorkplace: 'hybrid',
    experienceLevel: 'senior',
    createdAt: '2026-02-20T16:34:04.321Z',
    address: { city: 'La Defense' },
    skills: [{ name: 'Python' }, { name: 'Pandas' }],
  },
];

describe('parseCometMissions', () => {
  it('parse les missions depuis la reponse GraphQL', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'comet',
      title: 'Architecte Cloud AWS',
      id: 'comet-41715',
      scrapedAt: NOW,
    });
  });

  it('extrait un ID stable depuis l ID numerique', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].id).toBe('comet-41715');
    expect(missions[1].id).toBe('comet-41758');
  });

  it('extrait les tags de stack', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].stack).toEqual(['AWS', 'Terraform', 'Docker']);
  });

  it('mappe prefWorkplace vers RemoteType', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].remote).toBe('full');
    expect(missions[1].remote).toBe('hybrid');
  });

  it('formate la duree en mois', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].duration).toBe('6 mois');
    expect(missions[1].duration).toBe('3 mois');
  });

  it('extrait la localisation depuis address.city', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].location).toBe('Paris');
    expect(missions[1].location).toBe('La Defense');
  });

  it('tjm est null (pas disponible dans l API Comet)', () => {
    const missions = parseCometMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].tjm).toBeNull();
  });

  it('retourne un tableau vide pour un tableau vide', () => {
    expect(parseCometMissions([], NOW)).toEqual([]);
  });

  it('mappe onSite vers onsite', () => {
    const missions = parseCometMissions([{
      ...FIXTURE_MISSIONS[0],
      prefWorkplace: 'onSite',
    }], NOW);
    expect(missions[0].remote).toBe('onsite');
  });

  it('mappe partialRemote vers hybrid', () => {
    const missions = parseCometMissions([{
      ...FIXTURE_MISSIONS[0],
      prefWorkplace: 'partialRemote',
    }], NOW);
    expect(missions[0].remote).toBe('hybrid');
  });
});
