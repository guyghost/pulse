import { describe, it, expect } from 'vitest';
import { parseFreeWorkAPI, type FreeWorkApiResponse } from '../../../src/lib/core/connectors/freework-parser';

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
  it('parses contractor missions from API response', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'free-work',
      title: 'Développeur React Senior',
      client: 'Société ABC',
      id: 'fw-12345',
      scrapedAt: NOW,
    });
  });

  it('filters out non-contractor postings (CDI)', () => {
    const missions = parseFreeWorkAPI(FIXTURE_API, NOW);
    const titles = missions.map(m => m.title);
    expect(titles).not.toContain('DevOps Engineer CDI');
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
    expect(missions[0].url).toBe('https://www.free-work.com/fr/tech-it/developpeur/job-mission/dev-react-senior');
  });

  it('returns empty array for empty response', () => {
    const empty: FreeWorkApiResponse = { 'hydra:totalItems': 0, 'hydra:member': [] };
    expect(parseFreeWorkAPI(empty, NOW)).toEqual([]);
  });

  it('returns empty array for malformed response', () => {
    expect(parseFreeWorkAPI({} as any, NOW)).toEqual([]);
  });
});
