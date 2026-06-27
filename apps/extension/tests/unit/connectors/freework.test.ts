import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  parseFreeWorkAPI,
  mapExperienceLevel,
  type FreeWorkApiResponse,
  type FreeWorkJobPosting,
} from '../../../src/lib/core/connectors/freework-parser';
import {
  buildFreeWorkApiUrl,
  FREEWORK_ITEMS_PER_PAGE,
  FreeWorkConnector,
} from '../../../src/lib/shell/connectors/freework.connector';

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
    expect(missions.find((m) => m.id === 'fw-99999')).toBeUndefined();
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

// ---------------------------------------------------------------------------
// mapExperienceLevel — exported pure mapping (covers null/junior/unknown branches).
// ---------------------------------------------------------------------------
describe('mapExperienceLevel', () => {
  it('maps null to null', () => {
    expect(mapExperienceLevel(null)).toBeNull();
  });

  it('maps "junior" to "junior"', () => {
    expect(mapExperienceLevel('junior')).toBe('junior');
  });

  it('maps "intermediate" to "confirmed"', () => {
    expect(mapExperienceLevel('intermediate')).toBe('confirmed');
  });

  it('maps "senior" to "senior"', () => {
    expect(mapExperienceLevel('senior')).toBe('senior');
  });

  it('maps unknown level to null', () => {
    expect(mapExperienceLevel('expert')).toBeNull();
    expect(mapExperienceLevel('lead')).toBeNull();
  });

  it('maps empty string to null (falsy guard)', () => {
    expect(mapExperienceLevel('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseFreeWorkAPI — field extraction edge cases (covers private helpers:
// mapRemoteMode, formatDuration, buildJobUrl, isFreelanceContract).
// ---------------------------------------------------------------------------
/**
 * Minimal valid freelance posting. Overrides applied per-case to hit
 * specific branches in the private helpers.
 */
function makePosting(overrides: Partial<FreeWorkJobPosting> = {}): FreeWorkJobPosting {
  return {
    '@id': '/job_postings/test',
    id: 1,
    title: 'Dev Test',
    slug: 'dev-test',
    description: 'Description test',
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
      label: 'Paris',
      shortLabel: 'Paris (75)',
    },
    company: { name: 'Client', slug: 'client' },
    job: { name: 'Dev', slug: 'developpeur' },
    skills: [{ name: 'React', slug: 'react' }],
    publishedAt: '2026-03-11T10:00:00+01:00',
    startsAt: null,
    experienceLevel: 'senior',
    ...overrides,
  };
}

function wrap(postings: FreeWorkJobPosting[]): FreeWorkApiResponse {
  return { 'hydra:totalItems': postings.length, 'hydra:member': postings };
}

describe('parseFreeWorkAPI (field extraction edge cases)', () => {
  // --- remoteMode mapping ---
  it('maps remoteMode "none" to onsite', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ remoteMode: 'none' })]), NOW);
    expect(m[0].remote).toBe('onsite');
  });

  it('maps null remoteMode to null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ remoteMode: null })]), NOW);
    expect(m[0].remote).toBeNull();
  });

  it('maps unknown remoteMode to null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ remoteMode: 'telework' })]), NOW);
    expect(m[0].remote).toBeNull();
  });

  // --- duration formatting ---
  it('formats duration with "year" period as "X an"', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ durationValue: 1, durationPeriod: 'year' })]),
      NOW
    );
    expect(m[0].duration).toBe('1 an');
  });

  it('passes through unknown duration period unchanged', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ durationValue: 2, durationPeriod: 'week' })]),
      NOW
    );
    expect(m[0].duration).toBe('2 week');
  });

  it('returns null duration when durationValue is null', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ durationValue: null, durationPeriod: 'month' })]),
      NOW
    );
    expect(m[0].duration).toBeNull();
  });

  it('returns null duration when durationPeriod is null', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ durationValue: 6, durationPeriod: null })]),
      NOW
    );
    expect(m[0].duration).toBeNull();
  });

  // --- URL building fallback ---
  it('falls back to "autre" job slug when job is null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ job: null })]), NOW);
    expect(m[0].url).toBe('https://www.free-work.com/fr/tech-it/autre/job-mission/dev-test');
  });

  it('falls back to "autre" job slug when job.slug is empty (regression: no double slash)', () => {
    // Regression: buildJobUrl previously used `??`, so an empty-string slug
    // produced a malformed URL with a double slash ("/fr/tech-it//job-mission/").
    const m = parseFreeWorkAPI(wrap([makePosting({ job: { name: 'Dev', slug: '' } })]), NOW);
    expect(m[0].url).toBe('https://www.free-work.com/fr/tech-it/autre/job-mission/dev-test');
    expect(m[0].url).not.toContain('//job-mission');
  });

  // --- freelance contract filtering ---
  it('keeps postings with empty contracts (no info → treated as freelance)', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ contracts: [] })]), NOW);
    expect(m).toHaveLength(1);
  });

  it('keeps postings when contracts contains mixed-case freelance variants', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ contracts: ['Freelance'] })]), NOW);
    expect(m).toHaveLength(1);
  });

  it('keeps postings with "portage" contract', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ contracts: ['portage'] })]), NOW);
    expect(m).toHaveLength(1);
  });

  it('filters out postings whose contracts are only non-freelance', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ contracts: ['permanent', 'internship'] })]),
      NOW
    );
    expect(m).toHaveLength(0);
  });

  it('treats missing contracts array as freelance (defensive ?? [])', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ contracts: undefined as unknown as string[] })]),
      NOW
    );
    expect(m).toHaveLength(1);
  });

  // --- TJM fallback chain ---
  it('falls back to maxDailySalary when minDailySalary is null', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ minDailySalary: null, maxDailySalary: 700 })]),
      NOW
    );
    expect(m[0].tjm).toBe(700);
  });

  it('returns null tjm when both min and max daily salary are null', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ minDailySalary: null, maxDailySalary: null })]),
      NOW
    );
    expect(m[0].tjm).toBeNull();
  });

  // --- location fallback chain ---
  it('falls back to shortLabel when location.label is null', () => {
    const m = parseFreeWorkAPI(
      wrap([
        makePosting({
          location: { locality: 'Lyon', adminLevel1: 'ARA', label: null, shortLabel: 'Lyon (69)' },
        }),
      ]),
      NOW
    );
    expect(m[0].location).toBe('Lyon (69)');
  });

  it('returns null location when the location object is null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ location: null })]), NOW);
    expect(m[0].location).toBeNull();
  });

  // --- nullable fields ---
  it('falls back to empty description when description is null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ description: null })]), NOW);
    expect(m[0].description).toBe('');
  });

  it('returns empty stack when skills is null/missing', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ skills: undefined as unknown as FreeWorkJobPosting['skills'] })]),
      NOW
    );
    expect(m[0].stack).toEqual([]);
  });

  it('returns null publishedAt when publishedAt is null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ publishedAt: null })]), NOW);
    expect(m[0].publishedAt).toBeNull();
  });

  it('maps experienceLevel "junior" to "junior" through the parser', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ experienceLevel: 'junior' })]), NOW);
    expect(m[0].seniority).toBe('junior');
  });

  it('maps unknown experienceLevel to null through the parser', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ experienceLevel: 'expert' })]), NOW);
    expect(m[0].seniority).toBeNull();
  });

  it('maps null experienceLevel to null through the parser', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ experienceLevel: null })]), NOW);
    expect(m[0].seniority).toBeNull();
  });

  it('falls back to null client when company is null', () => {
    const m = parseFreeWorkAPI(wrap([makePosting({ company: null })]), NOW);
    expect(m[0].client).toBeNull();
  });

  it('returns null duration when both durationValue and durationPeriod are null', () => {
    const m = parseFreeWorkAPI(
      wrap([makePosting({ durationValue: null, durationPeriod: null })]),
      NOW
    );
    expect(m[0].duration).toBeNull();
  });
});

describe('FreeWork URL building with search context', () => {
  it('builds base URL with pagination (no context)', () => {
    const url = buildFreeWorkApiUrl(1);
    expect(url).toContain('page=1');
    expect(url).toContain(`itemsPerPage=${FREEWORK_ITEMS_PER_PAGE}`);
    expect(url).toContain('contracts=contractor');
    expect(url).not.toContain('order');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('properties');
    expect(url).not.toContain('createdAt');
  });

  it('adds minDailySalary when tjmMin is provided', () => {
    const url = buildFreeWorkApiUrl(2, {
      query: 'React',
      skills: ['React', 'TypeScript'],
      location: 'Paris',
      remote: 'hybrid',
      tjmMin: 650,
      tjmMax: null,
      lastSync: null,
    });

    expect(url).toContain('page=2');
    expect(url).toContain('minDailySalary=650');
  });

  it('does not send ignored filters', () => {
    const url = buildFreeWorkApiUrl(1, {
      query: 'Développeur Frontend',
      skills: ['React', 'TypeScript'],
      location: 'Paris',
      remote: 'full',
      tjmMin: null,
      tjmMax: null,
      lastSync: new Date('2026-03-01T00:00:00Z'),
    });

    expect(url).not.toContain('q=');
    expect(url).not.toContain('properties');
    expect(url).not.toContain('createdAt');
    expect(url).not.toContain('remote');
  });
});

describe('FreeWorkConnector.fetchMissions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function makePosting(id: number, publishedAt: string): FreeWorkJobPosting {
    return {
      '@id': `/job_postings/mission-${id}`,
      id,
      title: `Mission ${id}`,
      slug: `mission-${id}`,
      description: `Description ${id}`,
      candidateProfile: null,
      companyDescription: null,
      minDailySalary: 500,
      maxDailySalary: 650,
      minAnnualSalary: null,
      maxAnnualSalary: null,
      dailySalary: '500-650 €',
      annualSalary: null,
      currency: 'EUR',
      duration: 6,
      durationValue: 6,
      durationPeriod: 'month',
      renewable: false,
      remoteMode: 'partial',
      contracts: ['contractor'],
      location: {
        locality: 'Paris',
        adminLevel1: 'Île-de-France',
        label: 'Paris, Île-de-France',
        shortLabel: 'Paris',
      },
      company: { name: 'Client', slug: 'client' },
      job: { name: 'Developpeur', slug: 'developpeur' },
      skills: [{ name: 'TypeScript', slug: 'typescript' }],
      publishedAt,
      startsAt: null,
      experienceLevel: 'senior',
    };
  }

  beforeEach(() => {
    const responses = new Map<number, FreeWorkApiResponse>([
      [
        1,
        {
          'hydra:totalItems': 250,
          'hydra:member': [makePosting(1, '2026-03-11T10:00:00+01:00')],
        },
      ],
      [
        2,
        {
          'hydra:totalItems': 250,
          'hydra:member': [makePosting(2, '2026-03-10T10:00:00+01:00')],
        },
      ],
      [
        3,
        {
          'hydra:totalItems': 250,
          'hydra:member': [makePosting(3, '2026-01-01T10:00:00+01:00')],
        },
      ],
    ]);

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      const page = Number(url.searchParams.get('page') ?? '1');
      const response = responses.get(page) ?? { 'hydra:totalItems': 250, 'hydra:member': [] };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/ld+json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
      declarativeNetRequest: {
        updateDynamicRules: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches computed pages and stops when the freshness cutoff is reached', async () => {
    const connector = new FreeWorkConnector();
    const result = await connector.fetchMissions(NOW.getTime());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.map((mission) => mission.id)).toEqual(['fw-1', 'fw-2']);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const fetchedPages = fetchMock.mock.calls.map(([input]) =>
      new URL(input.toString()).searchParams.get('page')
    );
    expect(fetchedPages).toEqual(['1', '2', '3']);

    const firstUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(firstUrl.searchParams.get('itemsPerPage')).toBe(String(FREEWORK_ITEMS_PER_PAGE));
  });
});
