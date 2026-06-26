import { describe, expect, it } from 'vitest';
import {
  parseIsoDateTimeToEpochMs,
  parseIsoDateToEpochMs,
} from '../../../src/lib/core/utils/iso-time';

describe('iso-time core parser', () => {
  it('parses date-only strings as UTC midnight', () => {
    expect(parseIsoDateToEpochMs('2026-04-07')).toBe(
      new Date('2026-04-07T00:00:00.000Z').getTime()
    );
  });

  it('parses ISO datetimes with UTC and offsets', () => {
    expect(parseIsoDateTimeToEpochMs('2026-04-07T12:30:15.250Z')).toBe(
      new Date('2026-04-07T12:30:15.250Z').getTime()
    );
    expect(parseIsoDateTimeToEpochMs('2026-04-07T14:30:15+02:00')).toBe(
      new Date('2026-04-07T12:30:15.000Z').getTime()
    );
  });

  it('rejects invalid calendar dates', () => {
    expect(parseIsoDateToEpochMs('2026-02-30')).toBeNull();
    expect(parseIsoDateTimeToEpochMs('2026-13-01T00:00:00Z')).toBeNull();
    expect(parseIsoDateTimeToEpochMs('not-a-date')).toBeNull();
  });
});
