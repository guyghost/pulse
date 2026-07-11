import { describe, expect, it } from 'vitest';
import type { Availability } from '../../../src/lib/core/types/availability';
import { AVAILABILITY_NOTE_MAX_LENGTH } from '../../../src/lib/core/types/availability';
import {
  blankAvailabilityDraft,
  buildAvailabilityPayloads,
  formatAvailabilityDate,
  formatAvailabilityPayload,
  isValidAvailabilityDate,
  normalizeAvailability,
} from '../../../src/lib/core/availability/availability-helpers';

const NOW = 1_700_000_000_000;

function baseAvailability(overrides: Partial<Availability> = {}): Availability {
  return {
    status: 'immediate',
    date: null,
    note: '',
    updatedAt: NOW,
    ...overrides,
  };
}

describe('isValidAvailabilityDate', () => {
  it('accepts a valid calendar date', () => {
    expect(isValidAvailabilityDate('2026-08-01')).toBe(true);
  });

  it('rejects an invalid calendar date that rolls over', () => {
    expect(isValidAvailabilityDate('2026-02-31')).toBe(false);
  });

  it('accepts Feb 29 on a leap year and rejects it otherwise (pure calendar math)', () => {
    expect(isValidAvailabilityDate('2024-02-29')).toBe(true);
    expect(isValidAvailabilityDate('2025-02-29')).toBe(false);
    expect(isValidAvailabilityDate('2100-02-29')).toBe(false);
    expect(isValidAvailabilityDate('2000-02-29')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isValidAvailabilityDate('')).toBe(false);
    expect(isValidAvailabilityDate(null)).toBe(false);
    expect(isValidAvailabilityDate('2026/08/01')).toBe(false);
    expect(isValidAvailabilityDate('2026-13-01')).toBe(false);
  });
});

describe('normalizeAvailability', () => {
  it('forces date to null for status that does not carry a date', () => {
    const out = normalizeAvailability({ status: 'immediate', date: '2026-08-01', note: '' }, NOW);
    expect(out.date).toBeNull();
    expect(out.status).toBe('immediate');
  });

  it('keeps a valid date for date-bearing statuses', () => {
    const out = normalizeAvailability({ status: 'from-date', date: '2026-08-01', note: '' }, NOW);
    expect(out.date).toBe('2026-08-01');
  });

  it('nulls an invalid date for date-bearing statuses', () => {
    const out = normalizeAvailability(
      { status: 'in-mission-until', date: 'not-a-date', note: '' },
      NOW
    );
    expect(out.date).toBeNull();
  });

  it('trims and caps the note to the max length', () => {
    const long = 'a'.repeat(AVAILABILITY_NOTE_MAX_LENGTH + 50);
    const out = normalizeAvailability({ status: 'unavailable', note: long }, NOW);
    expect(out.note.length).toBe(AVAILABILITY_NOTE_MAX_LENGTH);
  });

  it('trims surrounding whitespace from the note', () => {
    const out = normalizeAvailability({ status: 'immediate', note: '  hello  ' }, NOW);
    expect(out.note).toBe('hello');
  });

  it('injects the provided `now` as updatedAt', () => {
    const out = normalizeAvailability({ status: 'immediate' }, NOW);
    expect(out.updatedAt).toBe(NOW);
  });
});

describe('formatAvailabilityDate', () => {
  it('formats ISO to dd/mm/YYYY', () => {
    expect(formatAvailabilityDate('2026-08-01')).toBe('01/08/2026');
  });

  it('returns empty string for invalid input', () => {
    expect(formatAvailabilityDate(null)).toBe('');
    expect(formatAvailabilityDate('nope')).toBe('');
  });
});

describe('formatAvailabilityPayload', () => {
  it('renders an immediate status without a date', () => {
    expect(formatAvailabilityPayload(baseAvailability({ status: 'immediate' }))).toBe(
      'Disponible immédiatement'
    );
  });

  it('renders a from-date status with the formatted date', () => {
    const out = formatAvailabilityPayload(
      baseAvailability({ status: 'from-date', date: '2026-08-01' })
    );
    expect(out).toBe('Disponible à partir du 01/08/2026');
  });

  it('renders an in-mission-until status', () => {
    const out = formatAvailabilityPayload(
      baseAvailability({ status: 'in-mission-until', date: '2026-12-15' })
    );
    expect(out).toBe("En mission jusqu'au 15/12/2026");
  });

  it('falls back gracefully when a date-bearing status has a null date', () => {
    const from = formatAvailabilityPayload(baseAvailability({ status: 'from-date', date: null }));
    const until = formatAvailabilityPayload(
      baseAvailability({ status: 'in-mission-until', date: null })
    );
    expect(from).toBe('Disponible prochainement');
    expect(until).toBe('En mission');
  });

  it('appends a non-empty note on a new line', () => {
    const out = formatAvailabilityPayload(
      baseAvailability({ status: 'immediate', note: 'Remote only' })
    );
    expect(out).toBe('Disponible immédiatement\nRemote only');
  });
});

describe('buildAvailabilityPayloads', () => {
  const targets = [
    { id: 'free-work', name: 'Free-Work', profileUrl: 'https://www.free-work.com' },
    { id: 'malt', name: 'Malt', profileUrl: 'https://www.malt.fr' },
  ];

  it('builds one identical payload per target', () => {
    const map = buildAvailabilityPayloads(baseAvailability(), targets);
    expect(map.size).toBe(2);
    expect(map.get('free-work')).toBe('Disponible immédiatement');
    expect(map.get('malt')).toBe('Disponible immédiatement');
  });

  it('returns an empty map when there are no targets', () => {
    const map = buildAvailabilityPayloads(baseAvailability(), []);
    expect(map.size).toBe(0);
  });
});

describe('blankAvailabilityDraft', () => {
  it('defaults to immediate with no date and an empty note', () => {
    const draft = blankAvailabilityDraft();
    expect(draft.status).toBe('immediate');
    expect(draft.date).toBeNull();
    expect(draft.note).toBe('');
    expect(draft.updatedAt).toBe(0);
  });
});
