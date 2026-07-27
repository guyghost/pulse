import { describe, expect, it } from 'vitest';
import {
  formatAbsoluteDate,
  formatMissionCount,
  formatRelativeTime,
  formatTJM,
  formatTJMRange,
  formatTJMValue,
  formatTimestamp,
} from '../../../src/lib/core/utils/format';

const NOW = new Date('2026-04-07T12:00:00.000Z').getTime();
// Intl.NumberFormat('fr-FR') groups thousands with a narrow/no-break space
// (U+202F on modern ICU, U+00A0 elsewhere). Assert structure, not the exact
// separator code point.
const SEP = '[\\s\\u00a0\\u202f]';

describe('formatTJM', () => {
  it('groups thousands with the fr-FR separator and appends the daily suffix', () => {
    expect(formatTJM(1200)).toMatch(new RegExp(`1${SEP}200\\s*€/j`));
    expect(formatTJM(650)).toBe('650 €/j');
  });

  it('returns the fallback for missing or invalid values', () => {
    expect(formatTJM(null)).toBe('Non précisé');
    expect(formatTJM(undefined)).toBe('Non précisé');
    expect(formatTJM(Number.NaN)).toBe('Non précisé');
    expect(formatTJM(-1)).toBe('Non précisé');
  });

  it('honors a custom fallback and suffix', () => {
    expect(formatTJM(null, { fallback: '—', suffix: '/jour' })).toBe('—');
    expect(formatTJM(900, { suffix: '/jour' })).toBe('900 €/jour');
  });
});

describe('formatTJMRange', () => {
  it('renders an en-dash range', () => {
    expect(formatTJMRange(600, 900)).toBe('600–900 €/j');
  });

  it('collapses equal bounds to a single value', () => {
    expect(formatTJMRange(700, 700)).toBe('700 €/j');
  });

  it('falls back only when both bounds are missing', () => {
    expect(formatTJMRange(null, null)).toBe('Non précisé');
    expect(formatTJMRange(null, 800)).toBe('—–800 €/j');
    expect(formatTJMRange(500, null)).toBe('500–— €/j');
  });

  it('treats negative bounds as absent (consistency with formatTJM)', () => {
    expect(formatTJMRange(-200, 800)).toBe('—–800 €/j');
    expect(formatTJMRange(-200, -100)).toBe('Non précisé');
  });

  it('groups thousands inside the range', () => {
    expect(formatTJMRange(1000, 1500)).toMatch(new RegExp(`1${SEP}000–1${SEP}500\\s*€/j`));
  });
});

describe('formatRelativeTime', () => {
  it('returns null when either timestamp is missing', () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime(NOW, null)).toBeNull();
    expect(formatRelativeTime(undefined, NOW)).toBeNull();
  });

  it('renders sub-minute deltas as "à l\'instant"', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("à l'instant");
    // Future timestamps are also treated as instantaneous (feed is past-facing).
    expect(formatRelativeTime(NOW + 30_000, NOW)).toBe("à l'instant");
  });

  // ICU short unit abbreviations render "il y a" phrasing for past timestamps.
  // We assert the phrasing and numeric magnitude, without pinning exact spacing
  // variations across ICU builds.
  it('renders minutes with the right magnitude and "il y a" phrasing', () => {
    const out = formatRelativeTime(NOW - 10 * 60_000, NOW);
    expect(out).toContain('il y a');
    expect(out).toContain('10');
  });

  it('renders hours with the right magnitude', () => {
    expect(formatRelativeTime(NOW - 2 * 3_600_000, NOW)).toContain('2');
  });

  it('renders days with the right magnitude', () => {
    expect(formatRelativeTime(NOW - 3 * 86_400_000, NOW)).toContain('3');
  });

  it('escalates to months and years for old timestamps', () => {
    const twoMonthsAgo = NOW - 60 * 86_400_000;
    const twoYearsAgo = NOW - 800 * 86_400_000;
    const months = formatRelativeTime(twoMonthsAgo, NOW);
    const years = formatRelativeTime(twoYearsAgo, NOW);
    expect(months).not.toBeNull();
    expect(years).not.toBeNull();
    // Month and year buckets never reuse the day/hour/minute magnitudes.
    expect(months).not.toContain('h');
    expect(years).toMatch(/2|3/);
  });
});

describe('formatAbsoluteDate', () => {
  it('returns null for missing input', () => {
    expect(formatAbsoluteDate(null)).toBeNull();
  });

  it('formats short numeric dates by default', () => {
    const out = formatAbsoluteDate(new Date('2026-04-07T00:00:00.000Z'));
    expect(out).toMatch(/07.*04.*2026/);
  });

  it('supports a medium abbreviated style', () => {
    const out = formatAbsoluteDate(new Date('2026-04-07T00:00:00.000Z'), { style: 'medium' });
    expect(out).toContain('avr.');
  });
});

describe('formatTimestamp', () => {
  it('returns null for missing input', () => {
    expect(formatTimestamp(null)).toBeNull();
  });

  it('formats date and time together with year', () => {
    const out = formatTimestamp(new Date('2026-04-07T14:30:00.000Z'));
    expect(out).toContain('avr.');
    expect(out).toContain('2026');
    expect(out).toMatch(/\d{2}:\d{2}/); // HH:MM, TZ-dependent in the runner
  });
});

describe('formatMissionCount', () => {
  it('pluralizes for counts greater than one', () => {
    expect(formatMissionCount(0)).toBe('0 mission');
    expect(formatMissionCount(1)).toBe('1 mission');
    expect(formatMissionCount(3)).toBe('3 missions');
  });

  it('coerces non-finite or negative input to zero', () => {
    expect(formatMissionCount(Number.NaN)).toBe('0 mission');
    expect(formatMissionCount(-5)).toBe('0 mission');
  });
});

describe('formatTJMValue', () => {
  it('groups thousands and appends the EUR symbol', () => {
    expect(formatTJMValue(1200)).toMatch(new RegExp(`1${SEP}200\\s*€`));
    expect(formatTJMValue(650)).toBe('650 €');
  });

  it('returns null for missing, invalid, or negative values', () => {
    expect(formatTJMValue(null)).toBeNull();
    expect(formatTJMValue(undefined)).toBeNull();
    expect(formatTJMValue(Number.NaN)).toBeNull();
    expect(formatTJMValue(-100)).toBeNull();
  });
});
