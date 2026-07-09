import { describe, it, expect } from 'vitest';
import {
  LOCATION_CATALOG,
  LOCATION_LABELS,
  resolveLocationLabel,
  normalizeLocationAlias,
  type LocationEntry,
} from '../../../src/lib/core/locations/location-catalog';

describe('LOCATION_CATALOG — structural invariants', () => {
  it('is non-empty', () => {
    expect(LOCATION_CATALOG.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty label and at least one alias', () => {
    for (const e of LOCATION_CATALOG) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.aliases.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has unique labels (display parity)', () => {
    const labels = LOCATION_CATALOG.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('each entry has its own canonical name as an alias (normalized)', () => {
    for (const e of LOCATION_CATALOG) {
      expect(e.aliases).toContain(normalizeLocationAlias(e.label));
    }
  });

  it('aliases are normalized (lowercase, no accents, no hyphens)', () => {
    for (const e of LOCATION_CATALOG) {
      for (const a of e.aliases) {
        expect(a).toBe(a.toLowerCase());
        expect(a).not.toMatch(/[àâäéèêëîïôöùûüçœæ-]/);
      }
    }
  });

  it('aliases within a single entry are unique', () => {
    for (const e of LOCATION_CATALOG) {
      expect(new Set(e.aliases).size).toBe(e.aliases.length);
    }
  });
});

describe('LOCATION_CATALOG — coverage vs location-matching vocabulary', () => {
  // These canonical names / synonyms come from REGION_SYNONYMS in
  // core/scoring/location-matching.ts. The catalog must cover them so the
  // datalist suggests the same vocabulary the scorer recognizes.
  const REQUIRED_CANONICAL: readonly string[] = [
    'paris',
    'lyon',
    'marseille',
    'bordeaux',
    'toulouse',
    'nantes',
    'lille',
    'nice',
    'strasbourg',
    'ile de france',
    'rhone',
    'gironde',
    'remote',
    'teletravail',
  ];

  const allAliases = LOCATION_CATALOG.flatMap((e) => e.aliases);

  it('covers every required canonical form as an alias', () => {
    for (const canon of REQUIRED_CANONICAL) {
      expect(allAliases).toContain(canon);
    }
  });

  // Metro suburbs from METRO_AREAS in location-matching.ts must be suggestible.
  const REQUIRED_SUBURBS: readonly string[] = [
    'nanterre',
    'boulogne billancourt',
    'villeurbanne',
    'aix en provence',
    'merignac',
    'pessac',
    'blagnac',
    'colomiers',
  ];

  it('covers key metro suburbs as aliases', () => {
    for (const sub of REQUIRED_SUBURBS) {
      expect(allAliases).toContain(sub);
    }
  });

  const REQUIRED_REGIONAL_CAPITALS: readonly string[] = [
    'rennes',
    'montpellier',
    'grenoble',
    'clermont ferrand',
    'dijon',
    'tours',
    'saint etienne',
    'le mans',
    'amiens',
    'rouen',
    'caen',
    'metz',
    'nancy',
    'limoges',
    'annecy',
    'brest',
    'reims',
    'orleans',
    'toulon',
    'perpignan',
    'besancon',
    'angers',
    'poitiers',
    'la rochelle',
    'nimes',
  ];

  it('covers French regional capitals as aliases', () => {
    for (const cap of REQUIRED_REGIONAL_CAPITALS) {
      expect(allAliases).toContain(cap);
    }
  });
});

describe('LOCATION_LABELS', () => {
  it('matches catalog labels in order', () => {
    expect(LOCATION_LABELS).toEqual(LOCATION_CATALOG.map((e: LocationEntry) => e.label));
  });

  it('is unique', () => {
    expect(new Set(LOCATION_LABELS).size).toBe(LOCATION_LABELS.length);
  });
});

describe('resolveLocationLabel', () => {
  it('returns null for empty input', () => {
    expect(resolveLocationLabel('')).toBeNull();
    expect(resolveLocationLabel('   ')).toBeNull();
  });

  it('resolves an exact label (accented)', () => {
    expect(resolveLocationLabel('Aix-en-Provence')).toBe('Aix-en-Provence');
  });

  it('resolves case-insensitively', () => {
    expect(resolveLocationLabel('paris')).toBe('Paris');
    expect(resolveLocationLabel('PARIS')).toBe('Paris');
  });

  it('resolves accented typing to the canonical label', () => {
    expect(resolveLocationLabel('parïs')).toBe('Paris');
  });

  it('resolves a department code alias', () => {
    expect(resolveLocationLabel('75')).toBe('Paris');
    expect(resolveLocationLabel('69')).toBe('Lyon');
  });

  it('resolves a regional synonym alias', () => {
    expect(resolveLocationLabel('ile de france')).toBe('Paris');
    expect(resolveLocationLabel('idf')).toBe('Paris');
  });

  it('resolves a remote synonym', () => {
    expect(resolveLocationLabel('teletravail')).toBe('Remote');
    expect(resolveLocationLabel('full remote')).toBe('Remote');
  });

  it('returns null for an unknown place', () => {
    expect(resolveLocationLabel('Atlantis')).toBeNull();
  });

  it('prefers an exact label over an alias match when normalized forms collide', () => {
    // "Paris" is both a label and appears as its own alias; label resolution wins.
    expect(resolveLocationLabel('Paris')).toBe('Paris');
  });
});
