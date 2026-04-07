import { describe, it, expect } from 'vitest';
import {
  parseHiwayJSON,
  parseHiwayMissionRow,
  parseBudgetToTJM,
  parseSkillsString,
  normalizeDuration,
  type HiwayMissionRow,
} from '../../../src/lib/core/connectors/hiway-json-parser';
import {
  getConnectorIds,
  getConnectorsMeta,
  getConnector,
} from '../../../src/lib/shell/connectors/index';

const NOW = new Date('2026-03-15T12:00:00Z');
const BASE_URL = 'https://hiway-missions.fr';

/**
 * Creates a realistic HiwayMissionRow matching the real Supabase
 * `freelance_posted_missions` table schema.
 */
function makeRow(overrides: Partial<HiwayMissionRow> = {}): HiwayMissionRow {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Dev React Senior',
    description: 'Mission de développement React',
    company: 'Acme Corp',
    budget: '600',
    skills: 'React, TypeScript, Node.js',
    start_date: '2026-04-01',
    posted_date: '2026-03-15',
    mission_location: 'Paris',
    location: 'Télétravail 2j/semaine',
    duration: '6-12',
    status: 'En attente',
    posted_by: 'freelance',
    business_fee_type: 'fixed',
    business_fee_amount: '30',
    created_at: '2026-03-15T10:00:00Z',
    updated_at: null,
    ...overrides,
  };
}

// ============================================================================
// Pure helpers
// ============================================================================

describe('parseBudgetToTJM', () => {
  it('parses a simple number string', () => {
    expect(parseBudgetToTJM('600')).toBe(600);
  });

  it('parses with whitespace', () => {
    expect(parseBudgetToTJM(' 550 ')).toBe(550);
  });

  it('parses with currency symbol', () => {
    expect(parseBudgetToTJM('600€')).toBe(600);
  });

  it('returns null for empty string', () => {
    expect(parseBudgetToTJM('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseBudgetToTJM(null)).toBeNull();
  });

  it('returns null for unreasonably low value (< 50)', () => {
    expect(parseBudgetToTJM('10')).toBeNull();
  });

  it('returns null for unreasonably high value (> 9999)', () => {
    expect(parseBudgetToTJM('10000')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parseBudgetToTJM('abc')).toBeNull();
  });
});

describe('parseSkillsString', () => {
  it('splits comma-separated skills', () => {
    expect(parseSkillsString('React, TypeScript, Node.js')).toEqual([
      'React',
      'TypeScript',
      'Node.js',
    ]);
  });

  it('trims whitespace', () => {
    expect(parseSkillsString('  scrum ,  agile , safe  ')).toEqual(['scrum', 'agile', 'safe']);
  });

  it('filters empty segments', () => {
    expect(parseSkillsString('React,,TypeScript,')).toEqual(['React', 'TypeScript']);
  });

  it('returns empty array for null', () => {
    expect(parseSkillsString(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseSkillsString('')).toEqual([]);
  });
});

describe('normalizeDuration', () => {
  it('normalizes range "6-12" to "6-12 mois"', () => {
    expect(normalizeDuration('6-12')).toBe('6-12 mois');
  });

  it('normalizes "12+" to "12+ mois"', () => {
    expect(normalizeDuration('12+')).toBe('12+ mois');
  });

  it('normalizes "3" to "3 mois"', () => {
    expect(normalizeDuration('3')).toBe('3 mois');
  });

  it('normalizes "3-6" to "3-6 mois"', () => {
    expect(normalizeDuration('3-6')).toBe('3-6 mois');
  });

  it('keeps string that already has "mois"', () => {
    expect(normalizeDuration('6 mois')).toBe('6 mois');
  });

  it('returns null for null', () => {
    expect(normalizeDuration(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeDuration('')).toBeNull();
  });
});

// ============================================================================
// parseHiwayMissionRow — main parser
// ============================================================================

describe('parseHiwayMissionRow', () => {
  it('parses a complete row from real Supabase schema', () => {
    const row = makeRow();
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);

    expect(mission).not.toBeNull();
    expect(mission).toMatchObject({
      id: 'hw-550e8400-e29b-41d4-a716-446655440000',
      title: 'Dev React Senior',
      client: 'Acme Corp',
      description: 'Mission de développement React',
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 600,
      location: 'Paris',
      remote: 'hybrid',
      duration: '6-12 mois',
      startDate: '2026-04-01',
      source: 'hiway',
      scrapedAt: NOW,
    });
  });

  it('extracts stable ID from row.id', () => {
    const row = makeRow({ id: 'abc12345-e29b-41d4-a716-446655440000' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.id).toBe('hw-abc12345-e29b-41d4-a716-446655440000');
  });

  it('maps company to client', () => {
    const row = makeRow({ company: 'Tech SA' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.client).toBe('Tech SA');
  });

  it('parses budget string to TJM number', () => {
    const row = makeRow({ budget: '550' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.tjm).toBe(550);
  });

  it('handles null budget → tjm null', () => {
    const row = makeRow({ budget: null });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.tjm).toBeNull();
  });

  it('splits comma-separated skills into stack array', () => {
    const row = makeRow({ skills: 'scrum, agile, safe' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.stack).toEqual(['scrum', 'agile', 'safe']);
  });

  it('handles null skills → empty stack', () => {
    const row = makeRow({ skills: null });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.stack).toEqual([]);
  });

  it('uses mission_location as city/location', () => {
    const row = makeRow({ mission_location: 'Lyon' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.location).toBe('Lyon');
  });

  it('detects hybrid remote from "Télétravail 2j/semaine"', () => {
    const row = makeRow({ location: 'Télétravail 2j/semaine' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.remote).toBe('hybrid');
  });

  it('detects full remote from "Télétravail"', () => {
    const row = makeRow({ location: 'Télétravail' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.remote).toBe('full');
  });

  it('detects onsite from "Présentiel"', () => {
    const row = makeRow({ location: 'Présentiel' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.remote).toBe('onsite');
  });

  it('normalizes duration "12+" to "12+ mois"', () => {
    const row = makeRow({ duration: '12+' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.duration).toBe('12+ mois');
  });

  it('extracts start_date as startDate', () => {
    const row = makeRow({ start_date: '2026-06-01' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.startDate).toBe('2026-06-01');
  });

  it('handles null start_date', () => {
    const row = makeRow({ start_date: null });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.startDate).toBeNull();
  });

  it('builds URL from id', () => {
    const row = makeRow();
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.url).toBe(
      'https://hiway-missions.fr/admin/freelance/mission/550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('returns null for row without id', () => {
    const row = makeRow({ id: '' });
    expect(parseHiwayMissionRow(row, NOW, BASE_URL)).toBeNull();
  });

  it('returns null for row without title', () => {
    const row = makeRow({ title: null });
    expect(parseHiwayMissionRow(row, NOW, BASE_URL)).toBeNull();
  });

  it('returns null for row with empty title', () => {
    const row = makeRow({ title: '   ' });
    expect(parseHiwayMissionRow(row, NOW, BASE_URL)).toBeNull();
  });

  it('strips HTML from description', () => {
    const row = makeRow({ description: '<p>Hello <b>World</b></p>' });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
    expect(mission?.description).toBe('Hello World');
  });

  it('handles all null optional fields gracefully', () => {
    const row = makeRow({
      company: null,
      description: null,
      budget: null,
      skills: null,
      start_date: null,
      mission_location: null,
      location: null,
      duration: null,
    });
    const mission = parseHiwayMissionRow(row, NOW, BASE_URL);

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
});

// ============================================================================
// parseHiwayJSON — batch parser
// ============================================================================

describe('parseHiwayJSON', () => {
  it('parses an array of rows', () => {
    const rows = [
      makeRow({ id: 'id-1', title: 'Mission A' }),
      makeRow({ id: 'id-2', title: 'Mission B' }),
    ];
    const missions = parseHiwayJSON(rows, NOW, BASE_URL);

    expect(missions).toHaveLength(2);
    expect(missions[0].title).toBe('Mission A');
    expect(missions[1].title).toBe('Mission B');
  });

  it('filters out invalid rows', () => {
    const rows = [
      makeRow({ id: 'id-1', title: 'Mission A' }),
      { id: '' }, // No title
      null, // Null row
      'string', // Not an object
      makeRow({ id: 'id-2', title: 'Mission B' }),
    ];
    const missions = parseHiwayJSON(rows as unknown[], NOW, BASE_URL);

    expect(missions).toHaveLength(2);
  });

  it('returns empty array for non-array input', () => {
    expect(parseHiwayJSON(null as unknown as unknown[], NOW, BASE_URL)).toEqual([]);
    expect(parseHiwayJSON({} as unknown as unknown[], NOW, BASE_URL)).toEqual([]);
    expect(parseHiwayJSON('string' as unknown as unknown[], NOW, BASE_URL)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseHiwayJSON([], NOW, BASE_URL)).toEqual([]);
  });
});

// ============================================================================
// Enabled State Tests
// ============================================================================

describe('Hiway connector enabled state', () => {
  it('is in the active connector registry', () => {
    const activeIds = getConnectorIds();
    expect(activeIds).toContain('hiway');
    expect(activeIds).toEqual(['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick']);
  });

  it('is in the connectors metadata for UI display', () => {
    const meta = getConnectorsMeta();
    const hiwayMeta = meta.find((m) => (m.id as string) === 'hiway');
    expect(hiwayMeta).toBeDefined();
    expect(hiwayMeta).toMatchObject({
      id: 'hiway',
      name: 'Hiway',
      url: 'https://hiway-missions.fr',
    });
  });

  it('JSON parser is available for Supabase row parsing', () => {
    expect(typeof parseHiwayJSON).toBe('function');
    expect(typeof parseHiwayMissionRow).toBe('function');
  });

  it('connector can be instantiated via registry', async () => {
    const connector = await getConnector('hiway');
    expect(connector).not.toBeNull();
    expect(connector?.id).toBe('hiway');
    expect(connector?.name).toBe('Hiway');
    expect(connector?.baseUrl).toBe('https://hiway-missions.fr');
  });
});
