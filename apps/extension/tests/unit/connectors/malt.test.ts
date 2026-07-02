import { describe, it, expect } from 'vitest';
import {
  parseMaltJSON,
  parseMaltProjectRow,
  extractTitle,
  extractClient,
  extractSkills,
  extractTJM,
  extractLocation,
  detectMaltRemote,
  extractDuration,
  buildMaltUrl,
  type MaltProjectRow,
} from '../../../src/lib/core/connectors/malt-parser';
import {
  getConnectorIds,
  getConnectorsMeta,
  getConnector,
} from '../../../src/lib/shell/connectors/index';

const NOW = new Date('2026-07-01T12:00:00Z');
const BASE_URL = 'https://www.malt.fr';

/**
 * Creates a realistic MaltProjectRow matching the expected Malt API shape.
 */
function makeRow(overrides: Partial<MaltProjectRow> = {}): MaltProjectRow {
  return {
    id: 'proj-abc123',
    title: 'Développeur React Senior',
    name: null,
    description: 'Mission de développement frontend en React/TypeScript',
    company: { name: 'Acme Corp' },
    client: null,
    clientName: null,
    skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Node.js' }],
    dailyRate: 650,
    averageDailyRate: null,
    budget: null,
    location: 'Paris',
    city: null,
    workingMode: 'remote',
    remote: null,
    duration: '6 months',
    missionLength: null,
    startDate: '2026-08-01',
    publishedAt: '2026-06-28T10:00:00Z',
    createdAt: null,
    slug: 'developpeur-react-senior-paris',
    url: null,
    ...overrides,
  };
}

// ============================================================================
// Pure helpers
// ============================================================================

describe('extractTitle', () => {
  it('extracts from title field', () => {
    expect(extractTitle(makeRow({ title: 'Dev React' }))).toBe('Dev React');
  });
  it('falls back to name when title is null', () => {
    expect(extractTitle(makeRow({ title: null, name: 'Fallback Title' }))).toBe('Fallback Title');
  });
  it('returns null when both are null', () => {
    expect(extractTitle(makeRow({ title: null, name: null }))).toBeNull();
  });
  it('returns null for whitespace-only values', () => {
    expect(extractTitle(makeRow({ title: '   ', name: '  ' }))).toBeNull();
  });
});

describe('extractClient', () => {
  it('extracts from company.name', () => {
    expect(extractClient(makeRow({ company: { name: 'Acme' } }))).toBe('Acme');
  });
  it('falls back to client.name', () => {
    expect(extractClient(makeRow({ company: null, client: { name: 'Beta Inc' } }))).toBe(
      'Beta Inc'
    );
  });
  it('falls back to clientName', () => {
    expect(extractClient(makeRow({ company: null, client: null, clientName: 'Gamma SA' }))).toBe(
      'Gamma SA'
    );
  });
  it('returns null when all sources are null', () => {
    expect(extractClient(makeRow({ company: null, client: null, clientName: null }))).toBeNull();
  });
});

describe('extractSkills', () => {
  it('extracts names from skill objects', () => {
    expect(extractSkills([{ name: 'React' }, { name: 'TypeScript' }])).toEqual([
      'React',
      'TypeScript',
    ]);
  });
  it('handles label field as fallback', () => {
    expect(extractSkills([{ label: 'Docker' }])).toEqual(['Docker']);
  });
  it('handles plain strings', () => {
    expect(extractSkills(['Python', 'Django'])).toEqual(['Python', 'Django']);
  });
  it('handles mixed objects and strings', () => {
    expect(extractSkills([{ name: 'React' }, 'TypeScript', { label: 'AWS' }])).toEqual([
      'React',
      'TypeScript',
      'AWS',
    ]);
  });
  it('filters empty and null entries', () => {
    expect(extractSkills([{ name: '' }, { name: 'React' }, '', null as unknown as string])).toEqual(
      ['React']
    );
  });
  it('returns empty array for null', () => {
    expect(extractSkills(null)).toEqual([]);
  });
  it('returns empty array for non-array', () => {
    expect(extractSkills(undefined)).toEqual([]);
  });
});

describe('extractTJM', () => {
  it('extracts from dailyRate', () => {
    expect(extractTJM(makeRow({ dailyRate: 600 }))).toBe(600);
  });
  it('falls back to averageDailyRate', () => {
    expect(extractTJM(makeRow({ dailyRate: null, averageDailyRate: 550 }))).toBe(550);
  });
  it('falls back to budget', () => {
    expect(extractTJM(makeRow({ dailyRate: null, averageDailyRate: null, budget: 700 }))).toBe(700);
  });
  it('returns null when all are null', () => {
    expect(
      extractTJM(makeRow({ dailyRate: null, averageDailyRate: null, budget: null }))
    ).toBeNull();
  });
  it('rejects unreasonably low values (< 50)', () => {
    expect(extractTJM(makeRow({ dailyRate: 10 }))).toBeNull();
  });
  it('rejects unreasonably high values (> 9999)', () => {
    expect(extractTJM(makeRow({ dailyRate: 50000 }))).toBeNull();
  });
  it('rejects NaN', () => {
    expect(extractTJM(makeRow({ dailyRate: NaN }))).toBeNull();
  });
});

describe('extractLocation', () => {
  it('extracts from location', () => {
    expect(extractLocation(makeRow({ location: 'Lyon' }))).toBe('Lyon');
  });
  it('falls back to city', () => {
    expect(extractLocation(makeRow({ location: null, city: 'Bordeaux' }))).toBe('Bordeaux');
  });
  it('returns null when both are null', () => {
    expect(extractLocation(makeRow({ location: null, city: null }))).toBeNull();
  });
});

describe('detectMaltRemote', () => {
  it('detects full from "remote"', () => {
    expect(detectMaltRemote(makeRow({ workingMode: 'remote' }))).toBe('full');
  });
  it('detects full from "full remote"', () => {
    expect(detectMaltRemote(makeRow({ workingMode: 'full remote' }))).toBe('full');
  });
  it('detects hybrid from "hybrid"', () => {
    expect(detectMaltRemote(makeRow({ workingMode: 'hybrid' }))).toBe('hybrid');
  });
  it('detects hybrid from "mixed"', () => {
    expect(detectMaltRemote(makeRow({ workingMode: 'mixed' }))).toBe('hybrid');
  });
  it('detects onsite from "on-site"', () => {
    expect(detectMaltRemote(makeRow({ workingMode: 'on-site' }))).toBe('onsite');
  });
  it('falls back to remote field when workingMode is null', () => {
    expect(detectMaltRemote(makeRow({ workingMode: null, remote: 'hybrid' }))).toBe('hybrid');
  });
  it('returns null when both are null', () => {
    expect(detectMaltRemote(makeRow({ workingMode: null, remote: null }))).toBeNull();
  });
  it('falls back to generic French detector', () => {
    expect(detectMaltRemote(makeRow({ workingMode: 'Télétravail complet' }))).toBe('full');
  });
});

describe('extractDuration', () => {
  it('extracts from duration', () => {
    expect(extractDuration(makeRow({ duration: '6 months' }))).toBe('6 months');
  });
  it('falls back to missionLength', () => {
    expect(extractDuration(makeRow({ duration: null, missionLength: '3-6 mois' }))).toBe(
      '3-6 mois'
    );
  });
  it('returns null when both are null', () => {
    expect(extractDuration(makeRow({ duration: null, missionLength: null }))).toBeNull();
  });
});

describe('buildMaltUrl', () => {
  it('uses explicit url when present', () => {
    expect(buildMaltUrl(makeRow({ url: 'https://custom.com/mission' }), BASE_URL)).toBe(
      'https://custom.com/mission'
    );
  });
  it('builds from slug', () => {
    expect(buildMaltUrl(makeRow({ slug: 'dev-react-paris' }), BASE_URL)).toBe(
      'https://www.malt.fr/fr/mission/dev-react-paris'
    );
  });
  it('builds from id when no slug', () => {
    expect(buildMaltUrl(makeRow({ slug: null }), BASE_URL)).toBe(
      'https://www.malt.fr/fr/mission/proj-abc123'
    );
  });
});

// ============================================================================
// parseMaltProjectRow — main parser
// ============================================================================

describe('parseMaltProjectRow', () => {
  it('parses a complete row', () => {
    const mission = parseMaltProjectRow(makeRow(), NOW, BASE_URL);
    expect(mission).not.toBeNull();
    expect(mission).toMatchObject({
      id: 'malt-proj-abc123',
      title: 'Développeur React Senior',
      client: 'Acme Corp',
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 650,
      location: 'Paris',
      remote: 'full',
      duration: '6 months',
      startDate: '2026-08-01',
      publishedAt: '2026-06-28T10:00:00Z',
      source: 'malt',
      scrapedAt: NOW,
    });
  });

  it('returns null for row without id', () => {
    expect(parseMaltProjectRow(makeRow({ id: '' }), NOW, BASE_URL)).toBeNull();
  });

  it('returns null for row without title or name', () => {
    expect(parseMaltProjectRow(makeRow({ title: null, name: null }), NOW, BASE_URL)).toBeNull();
  });

  it('strips HTML from description', () => {
    const mission = parseMaltProjectRow(
      makeRow({ description: '<p>Bold <b>text</b></p>' }),
      NOW,
      BASE_URL
    );
    expect(mission?.description).toBe('Bold text');
  });

  it('handles all null optional fields gracefully', () => {
    const mission = parseMaltProjectRow(
      makeRow({
        name: null,
        description: null,
        company: null,
        client: null,
        clientName: null,
        skills: null,
        dailyRate: null,
        averageDailyRate: null,
        budget: null,
        location: null,
        city: null,
        workingMode: null,
        remote: null,
        duration: null,
        missionLength: null,
        startDate: null,
        publishedAt: null,
        createdAt: null,
        slug: null,
        url: null,
      }),
      NOW,
      BASE_URL
    );
    expect(mission).not.toBeNull();
    expect(mission?.client).toBeNull();
    expect(mission?.description).toBe('');
    expect(mission?.stack).toEqual([]);
    expect(mission?.tjm).toBeNull();
    expect(mission?.location).toBeNull();
    expect(mission?.remote).toBeNull();
    expect(mission?.duration).toBeNull();
    expect(mission?.startDate).toBeNull();
  });

  it('falls back to createdAt for publishedAt', () => {
    const mission = parseMaltProjectRow(
      makeRow({ publishedAt: null, createdAt: '2026-06-20T08:00:00Z' }),
      NOW,
      BASE_URL
    );
    expect(mission?.publishedAt).toBe('2026-06-20T08:00:00Z');
  });
});

// ============================================================================
// parseMaltJSON — batch parser
// ============================================================================

describe('parseMaltJSON', () => {
  it('parses an array of rows', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Mission A' }),
      makeRow({ id: 'b', title: 'Mission B' }),
    ];
    const missions = parseMaltJSON(rows, NOW, BASE_URL);
    expect(missions).toHaveLength(2);
    expect(missions[0].title).toBe('Mission A');
  });

  it('filters out invalid rows', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Mission A' }),
      { id: '' },
      null,
      'string',
      makeRow({ id: 'b', title: 'Mission B' }),
    ];
    const missions = parseMaltJSON(rows as unknown[], NOW, BASE_URL);
    expect(missions).toHaveLength(2);
  });

  it('returns empty array for non-array input', () => {
    expect(parseMaltJSON(null as unknown[], NOW, BASE_URL)).toEqual([]);
    expect(parseMaltJSON({} as unknown[], NOW, BASE_URL)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseMaltJSON([], NOW, BASE_URL)).toEqual([]);
  });
});

// ============================================================================
// Connector enabled state
// ============================================================================

describe('Malt connector enabled state', () => {
  it('is in the active connector registry', () => {
    const ids = getConnectorIds();
    expect(ids).toContain('malt');
  });

  it('is in the connectors metadata for UI display', () => {
    const meta = getConnectorsMeta();
    const maltMeta = meta.find((m) => (m.id as string) === 'malt');
    expect(maltMeta).toBeDefined();
    expect(maltMeta).toMatchObject({
      id: 'malt',
      name: 'Malt',
      url: 'https://www.malt.fr',
    });
  });

  it('connector can be instantiated via registry', async () => {
    const connector = await getConnector('malt');
    expect(connector).not.toBeNull();
    expect(connector?.id).toBe('malt');
    expect(connector?.name).toBe('Malt');
    expect(connector?.baseUrl).toBe('https://www.malt.fr');
  });
});
