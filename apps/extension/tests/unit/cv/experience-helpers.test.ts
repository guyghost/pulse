import { beforeEach, describe, expect, it } from 'vitest';
import type { Experience } from '../../../src/lib/core/types/profile';
import type { CandidateExperienceDraft } from '../../../src/lib/core/profile-extractors/types';
import {
  buildPlatformPayloads,
  countNewlyAddedExperiences,
  formatExperienceDateRange,
  formatExperiencePayload,
  mergeExperiences,
  normalizeDateToMonth,
  normalizeExperience,
  recomputePositionIndex,
} from '../../../src/lib/core/cv/experience-helpers';

const NOW = 1_700_000_000_000;
let idCounter = 0;
const generateId = () => `id-${NOW}-${idCounter++}`;

beforeEach(() => {
  idCounter = 0;
});

function baseExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: 'exp-1',
    title: 'Lead Frontend',
    company: 'Acme',
    location: 'Paris',
    startDate: '2023-01',
    endDate: null,
    isCurrent: true,
    description: 'Plateforme Svelte.',
    skills: ['Svelte', 'TypeScript'],
    source: 'manual',
    sourceExternalId: null,
    positionIndex: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

function draft(overrides: Partial<CandidateExperienceDraft> = {}): CandidateExperienceDraft {
  return {
    title: 'Lead Frontend',
    company: 'Acme',
    location: 'Paris',
    startDate: '2023-01',
    endDate: null,
    isCurrent: true,
    description: 'Plateforme Svelte.',
    skills: ['Svelte'],
    source: 'linkedin',
    sourceExternalId: null,
    positionIndex: 0,
    ...overrides,
  };
}

describe('normalizeExperience', () => {
  it('trims text and enforces isCurrent ↔ endDate === null', () => {
    const result = normalizeExperience(
      {
        title: '  Lead  ',
        company: '  Acme  ',
        location: '  Paris  ',
        startDate: '  2023-01  ',
        endDate: '2024-01',
        isCurrent: true,
        description: '  Text  ',
        skills: ['  Svelte  ', 'TypeScript'],
        source: 'manual',
      },
      NOW,
      generateId
    );

    expect(result.title).toBe('Lead');
    expect(result.company).toBe('Acme');
    expect(result.location).toBe('Paris');
    expect(result.startDate).toBe('2023-01');
    expect(result.endDate).toBeNull();
    expect(result.isCurrent).toBe(true);
    expect(result.description).toBe('Text');
    expect(result.skills).toEqual(['Svelte', 'TypeScript']);
  });

  it('keeps endDate when isCurrent is false', () => {
    const result = normalizeExperience(
      { title: 'Dev', company: 'Co', startDate: '2020-01', endDate: '2021-01', isCurrent: false },
      NOW,
      generateId
    );
    expect(result.endDate).toBe('2021-01');
  });

  it('generates an id when none is provided', () => {
    const result = normalizeExperience({ title: 'Dev', company: 'Co' }, NOW, generateId);
    expect(result.id).toBe(`id-${NOW}-0`);
  });

  it('preserves an existing id and defaults source to manual', () => {
    const result = normalizeExperience(
      { id: 'keep-1', title: 'Dev', company: 'Co' },
      NOW,
      generateId
    );
    expect(result.id).toBe('keep-1');
    expect(result.source).toBe('manual');
  });

  it('coerces empty strings to null for nullable fields', () => {
    const result = normalizeExperience(
      { title: 'Dev', company: '   ', location: '', startDate: '' },
      NOW,
      generateId
    );
    expect(result.company).toBeNull();
    expect(result.location).toBeNull();
    expect(result.startDate).toBeNull();
  });
});

describe('recomputePositionIndex', () => {
  it('assigns gapless 0-based indices sorted by descending start date', () => {
    const experiences = [
      baseExperience({ id: 'a', startDate: '2020-01', positionIndex: 5 }),
      baseExperience({ id: 'b', startDate: '2023-01', positionIndex: 2 }),
      baseExperience({ id: 'c', startDate: '2022-01', positionIndex: 9 }),
    ];

    const result = recomputePositionIndex(experiences);
    expect(result.map((e) => [e.id, e.positionIndex])).toEqual([
      ['b', 0],
      ['c', 1],
      ['a', 2],
    ]);
  });

  it('stably orders entries with the same start date', () => {
    const experiences = [
      baseExperience({ id: 'a', startDate: '2023-01' }),
      baseExperience({ id: 'b', startDate: '2023-01' }),
    ];
    const result = recomputePositionIndex(experiences);
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
    expect(result.map((e) => e.positionIndex)).toEqual([0, 1]);
  });

  it('places null start dates last', () => {
    const experiences = [
      baseExperience({ id: 'a', startDate: null }),
      baseExperience({ id: 'b', startDate: '2023-01' }),
    ];
    const result = recomputePositionIndex(experiences);
    expect(result.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('mergeExperiences', () => {
  it('adds new draft experiences as linkedin-sourced entries', () => {
    const result = mergeExperiences(
      [],
      [draft({ title: 'Dev', company: 'Co', startDate: '2020-01' })],
      NOW
    );
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('linkedin');
    expect(result[0].title).toBe('Dev');
    expect(result[0].id).toBe(`exp-${NOW}-0`);
    expect(result[0].updatedAt).toBe(NOW);
  });

  it('dedups by (company, title, startDate) case-insensitively', () => {
    const current = [
      baseExperience({
        id: 'local-1',
        title: 'Lead Frontend',
        company: 'Acme',
        startDate: '2023-01',
      }),
    ];
    const incoming = [draft({ title: 'LEAD frontend', company: 'acme', startDate: '2023-01' })];

    const result = mergeExperiences(current, incoming, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('local-1');
  });

  it('unions skills on match and keeps local description when manual', () => {
    const current = [
      baseExperience({
        id: 'local-1',
        title: 'Lead',
        company: 'Acme',
        startDate: '2023-01',
        skills: ['Svelte'],
        description: 'Local desc.',
        source: 'manual',
      }),
    ];
    const incoming = [
      draft({
        title: 'Lead',
        company: 'Acme',
        startDate: '2023-01',
        skills: ['Svelte', 'React'],
        description: 'Draft desc.',
      }),
    ];

    const result = mergeExperiences(current, incoming, NOW);
    expect(result[0].skills).toEqual(['Svelte', 'React']);
    expect(result[0].description).toBe('Local desc.');
  });

  it('overwrites description with draft when local source is not manual', () => {
    const current = [
      baseExperience({
        id: 'local-1',
        title: 'Lead',
        company: 'Acme',
        startDate: '2023-01',
        description: 'Local desc.',
        source: 'linkedin',
      }),
    ];
    const incoming = [
      draft({ title: 'Lead', company: 'Acme', startDate: '2023-01', description: 'New desc.' }),
    ];

    const result = mergeExperiences(current, incoming, NOW);
    expect(result[0].description).toBe('New desc.');
  });

  it('recomputes gapless position indices after merge', () => {
    const current = [baseExperience({ id: 'a', startDate: '2020-01' })];
    const incoming = [draft({ title: 'Dev', company: 'Co', startDate: '2023-01' })];

    const result = mergeExperiences(current, incoming, NOW);
    expect(result.map((e) => [e.id, e.positionIndex])).toEqual([
      [expect.stringContaining(`exp-${NOW}`), 0],
      ['a', 1],
    ]);
  });

  it('normalizes YYYY-MM-DD imported dates to YYYY-MM', () => {
    const result = mergeExperiences(
      [],
      [
        draft({
          title: 'Dev',
          company: 'Co',
          startDate: '2023-01-15',
          endDate: '2024-06-30',
          isCurrent: false,
        }),
      ],
      NOW
    );
    expect(result[0].startDate).toBe('2023-01');
    expect(result[0].endDate).toBe('2024-06');
  });

  it('clears endDate when a merged entry becomes current', () => {
    const current = [
      baseExperience({
        id: 'local-1',
        title: 'Lead',
        company: 'Acme',
        startDate: '2023-01',
        endDate: '2024-01',
        isCurrent: false,
      }),
    ];
    const incoming = [
      draft({ title: 'Lead', company: 'Acme', startDate: '2023-01', isCurrent: true }),
    ];

    const result = mergeExperiences(current, incoming, NOW);
    expect(result[0].isCurrent).toBe(true);
    expect(result[0].endDate).toBeNull();
  });
});

describe('countNewlyAddedExperiences', () => {
  it('returns 0 when the incoming draft is empty', () => {
    expect(countNewlyAddedExperiences([baseExperience()], [])).toBe(0);
  });

  it('counts every draft as new when current is empty', () => {
    const incoming = [
      draft({ title: 'A', company: 'Acme', startDate: '2023-01' }),
      draft({ title: 'B', company: 'Globex', startDate: '2022-01' }),
    ];
    expect(countNewlyAddedExperiences([], incoming)).toBe(2);
  });

  it('returns 0 when every draft already exists by dedup key', () => {
    const current = [
      baseExperience({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01' }),
    ];
    const incoming = [draft({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01' })];
    expect(countNewlyAddedExperiences(current, incoming)).toBe(0);
  });

  it('counts only the drafts that do not match an existing entry', () => {
    const current = [
      baseExperience({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01' }),
    ];
    const incoming = [
      draft({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01' }), // dup
      draft({ title: 'Staff Engineer', company: 'Globex', startDate: '2021-01' }), // new
    ];
    expect(countNewlyAddedExperiences(current, incoming)).toBe(1);
  });

  it('treats YYYY-MM-DD draft start dates the same as the normalized YYYY-MM current key', () => {
    const current = [
      baseExperience({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01' }),
    ];
    const incoming = [draft({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01-15' })];
    // Normalized to 2023-01 → matches → 0 added (mirrors mergeExperiences).
    expect(countNewlyAddedExperiences(current, incoming)).toBe(0);
  });

  it('is case-insensitive on company and title (matches mergeExperiences dedup)', () => {
    const current = [
      baseExperience({ title: 'Lead Frontend', company: 'Acme', startDate: '2023-01' }),
    ];
    const incoming = [draft({ title: 'LEAD FRONTEND', company: 'ACME', startDate: '2023-01' })];
    expect(countNewlyAddedExperiences(current, incoming)).toBe(0);
  });
});

describe('normalizeDateToMonth', () => {
  it('normalizes YYYY-MM-DD to YYYY-MM', () => {
    expect(normalizeDateToMonth('2023-01-15')).toBe('2023-01');
  });

  it('pads single-digit months', () => {
    expect(normalizeDateToMonth('2023-6-5')).toBe('2023-06');
  });

  it('leaves already-canonical YYYY-MM unchanged', () => {
    expect(normalizeDateToMonth('2023-01')).toBe('2023-01');
  });

  it('returns null for empty or whitespace input', () => {
    expect(normalizeDateToMonth('')).toBeNull();
    expect(normalizeDateToMonth('   ')).toBeNull();
    expect(normalizeDateToMonth(null)).toBeNull();
    expect(normalizeDateToMonth(undefined)).toBeNull();
  });

  it('returns unknown formats trimmed rather than corrupting them', () => {
    expect(normalizeDateToMonth('Jan 2023')).toBe('Jan 2023');
  });
});

describe('formatExperienceDateRange', () => {
  it('returns empty when no start date', () => {
    expect(formatExperienceDateRange({ startDate: null, endDate: null, isCurrent: false })).toBe(
      ''
    );
  });

  it('appends présent when isCurrent', () => {
    expect(
      formatExperienceDateRange({ startDate: '2023-01', endDate: null, isCurrent: true })
    ).toBe('2023-01 — présent');
  });

  it('shows start — end when not current and end is present', () => {
    expect(
      formatExperienceDateRange({ startDate: '2023-01', endDate: '2025-01', isCurrent: false })
    ).toBe('2023-01 — 2025-01');
  });

  it('shows only start when not current and no end', () => {
    expect(
      formatExperienceDateRange({ startDate: '2023-01', endDate: null, isCurrent: false })
    ).toBe('2023-01');
  });
});

describe('formatExperiencePayload', () => {
  it('returns empty string for no experiences', () => {
    expect(formatExperiencePayload([])).toBe('');
  });

  it('formats title, company, range, location, description and stack', () => {
    const result = formatExperiencePayload([
      baseExperience({
        title: 'Lead Frontend',
        company: 'Acme',
        startDate: '2023-01',
        isCurrent: true,
        location: 'Paris',
        description: 'Plateforme Svelte.',
        skills: ['Svelte', 'TypeScript'],
      }),
    ]);

    expect(result).toContain('Lead Frontend — Acme · 2023-01 — présent');
    expect(result).toContain('Paris');
    expect(result).toContain('Plateforme Svelte.');
    expect(result).toContain('Stack: Svelte, TypeScript');
  });

  it('separates multiple experiences with a blank line', () => {
    const result = formatExperiencePayload([
      baseExperience({ id: 'a', title: 'A', company: 'Ca', startDate: '2023-01' }),
      baseExperience({ id: 'b', title: 'B', company: 'Cb', startDate: '2020-01' }),
    ]);
    expect(result).toContain('\n\n');
    expect(result.split('\n\n')).toHaveLength(2);
  });
});

describe('buildPlatformPayloads', () => {
  it('returns the same payload for every target', () => {
    const targets = [
      { id: 'linkedin', name: 'LinkedIn', profileUrl: 'https://linkedin.com/in' },
      { id: 'freework', name: 'Free-Work', profileUrl: 'https://freework.com' },
    ];
    const map = buildPlatformPayloads([baseExperience()], targets);
    expect(map.size).toBe(2);
    const first = map.get('linkedin');
    expect(first).toBe(map.get('freework'));
    expect(first).toContain('Lead Frontend — Acme');
  });

  it('returns empty map for no targets', () => {
    const map = buildPlatformPayloads([baseExperience()], []);
    expect(map.size).toBe(0);
  });
});
