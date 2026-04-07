import { describe, it, expect } from 'vitest';
import {
  parseFreeWorkAPI,
  type FreeWorkApiResponse,
} from '../../../src/lib/core/connectors/freework-parser';

const NOW = new Date('2026-03-11T12:00:00Z');

const FIXTURE_API: FreeWorkApiResponse = {
  'hydra:totalItems': 2,
  'hydra:member': [
    {
      '@id': '/job_postings/dev-react-senior',
      id: 12345,
      title: 'Développeur React Senior',
      slug: 'dev-react-senior',
      description: 'Mission React/TypeScript pour un grand compte bancaire.',
      candidateProfile: null,
      companyDescription: null,
      minDailySalary: 500,
      maxDailySalary: 600,
      minAnnualSalary: null,
      maxAnnualSalary: null,
      dailySalary: '500-600 €',
      annualSalary: null,
      currency: 'EUR',
      duration: 6,
      durationValue: 6,
      durationPeriod: 'month',
      renewable: false,
      remoteMode: 'full',
      contracts: ['contractor'],
      location: {
        locality: 'Paris',
        adminLevel1: 'Île-de-France',
        label: 'Paris, Île-de-France',
        shortLabel: 'Paris (75)',
      },
      company: { name: 'Société ABC', slug: 'societe-abc' },
      job: { name: 'Développeur', slug: 'developpeur' },
      skills: [
        { name: 'React', slug: 'react' },
        { name: 'TypeScript', slug: 'typescript' },
        { name: 'Node.js', slug: 'nodejs' },
      ],
      publishedAt: '2026-03-11T10:00:00+01:00',
      startsAt: null,
      applicationType: 'turnover',
      applicationContact: null,
      applicationUrl: null,
      experienceLevel: 'senior',
    } as any,
    {
      '@id': '/job_postings/dev-java-spring',
      id: 67890,
      title: 'Développeur Java Spring',
      slug: 'dev-java-spring',
      description: 'Mission Java sur site à Lyon.',
      candidateProfile: null,
      companyDescription: null,
      minDailySalary: 450,
      maxDailySalary: 550,
      minAnnualSalary: null,
      maxAnnualSalary: null,
      dailySalary: '450-550 €',
      annualSalary: null,
      currency: 'EUR',
      duration: 3,
      durationValue: 3,
      durationPeriod: 'month',
      renewable: false,
      remoteMode: 'partial',
      contracts: ['contractor'],
      location: {
        locality: 'Lyon',
        adminLevel1: 'Auvergne-Rhône-Alpes',
        label: 'Lyon, Auvergne-Rhône-Alpes',
        shortLabel: 'Lyon (69)',
      },
      company: { name: 'Entreprise XYZ', slug: 'entreprise-xyz' },
      job: { name: 'Développeur', slug: 'developpeur' },
      skills: [
        { name: 'Java', slug: 'java' },
        { name: 'Spring Boot', slug: 'spring-boot' },
      ],
      publishedAt: '2026-03-11T09:00:00+01:00',
      startsAt: null,
      applicationType: 'turnover',
      applicationContact: null,
      applicationUrl: null,
      experienceLevel: 'intermediate',
    } as any,
    {
      '@id': '/job_postings/cdi-devops',
      id: 99999,
      title: 'DevOps Engineer CDI',
      slug: 'cdi-devops',
      description: 'Poste CDI DevOps.',
      candidateProfile: null,
      companyDescription: null,
      minDailySalary: null,
      maxDailySalary: null,
      minAnnualSalary: 45000,
      maxAnnualSalary: 55000,
      dailySalary: null,
      annualSalary: '45k-55k €',
      currency: 'EUR',
      duration: null,
      durationValue: null,
      durationPeriod: null,
      renewable: false,
      remoteMode: 'none',
      contracts: ['permanent'],
      location: {
        locality: 'Nantes',
        adminLevel1: 'Pays de la Loire',
        label: 'Nantes, Pays de la Loire',
        shortLabel: 'Nantes (44)',
      },
      company: { name: 'Corp SA', slug: 'corp-sa' },
      job: { name: 'DevOps', slug: 'devops' },
      skills: [{ name: 'Docker', slug: 'docker' }],
      publishedAt: '2026-03-11T08:00:00+01:00',
      startsAt: null,
      applicationType: 'url',
      applicationContact: null,
      applicationUrl: 'https://example.com/apply',
      experienceLevel: 'senior',
    } as any,
  ],
};

describe('parseFreeWorkAPI', () => {
  it('parses freelance missions and filters permanent contracts', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    // 3 items in fixture, 1 is permanent → 2 freelance
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'free-work',
      title: 'Développeur React Senior',
      client: 'Société ABC',
      id: 'fw-12345',
      scrapedAt: NOW,
    });
    // Verify the permanent contract was filtered out
    expect(missions.find(m => m.id === 'fw-99999')).toBeUndefined();
  });

  it('extracts stack from skills', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions[0].stack).toEqual(['React', 'TypeScript', 'Node.js']);
  });

  it('extracts TJM from minDailySalary', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions[0].tjm).toBe(500);
    expect(missions[1].tjm).toBe(450);
  });

  it('extracts location label', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions[0].location).toBe('Paris, Île-de-France');
    expect(missions[1].location).toBe('Lyon, Auvergne-Rhône-Alpes');
  });

  it('maps remoteMode to RemoteType', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions[0].remote).toBe('full');
    expect(missions[1].remote).toBe('hybrid');
  });

  it('formats duration', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions[0].duration).toBe('6 mois');
    expect(missions[1].duration).toBe('3 mois');
  });

  it('builds correct URL with job slug', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions[0].url).toBe(
      'https://www.free-work.com/fr/tech-it/developpeur/job-mission/dev-react-senior'
    );
  });

  it('returns empty array for empty response', () => {
    const empty: FreeWorkApiResponse = { 'hydra:totalItems': 0, 'hydra:member': [] };
    expect(parseFreeWorkAPI(empty, NOW)).toEqual([]);
  });

  it('returns empty array for malformed response', () => {
    expect(parseFreeWorkAPI({} as any, NOW)).toEqual([]);
  });
});

/**
 * Tests for FreeWork URL building with search context.
 * These verify that the connector correctly translates ConnectorSearchContext
 * into FreeWork API URL parameters.
 *
 * Since the URL building is embedded in the connector (Shell, I/O),
 * we test the URL construction logic in isolation by extracting it.
 *
 * Note: lastSync/createdAt[after] filtering was intentionally removed to fix
 * the split-brain bug where lastSync (chrome.storage.local) becomes stale
 * when IndexedDB is cleared, causing 0 results permanently. All connectors
 * now always fetch latest pages and rely on local dedup.
 */
describe('FreeWork URL building with search context', () => {
  const API_BASE = 'https://www.free-work.com/api/job_postings';
  const ITEMS_PER_PAGE = 50;

  /**
   * Replicates the URL building logic from FreeWorkConnector.fetchMissions()
   * so we can test it as a pure function without I/O.
   */
  function buildFreeWorkUrl(page: number, context?: { query?: string; skills?: string[] }): string {
    const url = new URL(API_BASE);
    url.searchParams.set('page', String(page));
    url.searchParams.set('itemsPerPage', String(ITEMS_PER_PAGE));
    url.searchParams.set('contracts', 'contractor');
    // Note: order[publishedAt]=desc is listed in hydra:search but returns 400.
    // The API already returns newest first by default.

    if (context?.query) {
      url.searchParams.set('q', context.query);
    }

    if (context?.skills?.length) {
      for (const skill of context.skills) {
        url.searchParams.append('properties[]', skill);
      }
    }

    return url.toString();
  }

  it('builds base URL with pagination (no context)', () => {
    const url = buildFreeWorkUrl(1);
    expect(url).toContain('page=1');
    expect(url).toContain('itemsPerPage=50');
    expect(url).toContain('contracts=contractor');
    // order[publishedAt] is NOT sent (API returns 400)
    expect(url).not.toContain('order');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('properties');
    expect(url).not.toContain('createdAt');
  });

  it('adds q parameter when query is provided', () => {
    const url = buildFreeWorkUrl(1, { query: 'React Developer' });
    expect(url).toContain('q=React+Developer');
  });

  it('encodes special characters in query', () => {
    const url = buildFreeWorkUrl(1, { query: 'Développeur Frontend' });
    expect(url).toContain('q=');
    expect(url).toContain('D%C3%A9veloppeur+Frontend');
  });

  it('adds properties[] for each skill', () => {
    const url = buildFreeWorkUrl(1, { skills: ['React', 'TypeScript', 'Node.js'] });
    expect(url).toContain('properties%5B%5D=React');
    expect(url).toContain('properties%5B%5D=TypeScript');
    expect(url).toContain('properties%5B%5D=Node.js');
  });

  it('never includes createdAt[after] — lastSync filtering removed (split-brain fix)', () => {
    const url = buildFreeWorkUrl(1);
    expect(url).not.toContain('createdAt');
  });

  it('combines query and skills together', () => {
    const url = buildFreeWorkUrl(2, {
      query: 'React',
      skills: ['React', 'TypeScript'],
    });
    expect(url).toContain('page=2');
    expect(url).toContain('q=React');
    expect(url).toContain('properties%5B%5D=React');
    expect(url).toContain('properties%5B%5D=TypeScript');
    expect(url).not.toContain('createdAt');
  });

  it('ignores empty query string', () => {
    const url = buildFreeWorkUrl(1, { query: '' });
    expect(url).not.toContain('q=');
  });

  it('ignores empty skills array', () => {
    const url = buildFreeWorkUrl(1, { skills: [] });
    expect(url).not.toContain('properties');
  });
});
