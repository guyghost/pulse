import { describe, it, expect } from 'vitest';
import {
  REGION_SYNONYMS,
  METRO_AREAS,
} from '../../../src/lib/core/locations/derive-location-tables';
import {
  normalizeLocationAlias,
  LOCATION_CATALOG,
} from '../../../src/lib/core/locations/location-catalog';

/**
 * Tests for the derived scoring tables. These lock the contract described in
 * `models/location-tables-derivation.model.md`:
 *  - one canonical synonym group per standalone / metro-canonical entry only,
 *  - department codes are never rebound away from the metro canonical,
 *  - metro areas aggregate petite + grande couronne department codes.
 *
 * The behavioral parity of the matcher is locked separately in
 * `tests/unit/scoring/location-matching.test.ts`; these tests target the
 * derivation structure itself.
 */

describe('REGION_SYNONYMS — derivation', () => {
  it('exposes the canonical French metros as keys', () => {
    for (const key of ['paris', 'lyon', 'marseille', 'bordeaux', 'toulouse', 'remote']) {
      expect(REGION_SYNONYMS[key]).toBeDefined();
    }
  });

  it('every key and alias is already normalized', () => {
    for (const [canonical, aliases] of Object.entries(REGION_SYNONYMS)) {
      expect(canonical).toBe(normalizeLocationAlias(canonical));
      for (const alias of aliases) {
        expect(alias).toBe(normalizeLocationAlias(alias));
      }
    }
  });

  it('each group contains its own canonical name', () => {
    for (const [canonical, aliases] of Object.entries(REGION_SYNONYMS)) {
      expect(aliases).toContain(canonical);
    }
  });

  it('preserves the load-bearing Paris synonym contract', () => {
    const paris = REGION_SYNONYMS['paris'];
    expect(paris).toContain('paris');
    expect(paris).toContain('75');
    expect(paris).toContain('ile de france');
    expect(paris).toContain('idf');
    expect(paris).toContain('region parisienne');
    expect(paris).toContain('paris 75');
    expect(paris).toContain('paris 1er');
  });

  it('preserves the Lyon / Rhône / 69 synonym contract', () => {
    const lyon = REGION_SYNONYMS['lyon'];
    expect(lyon).toContain('lyon');
    expect(lyon).toContain('69');
    expect(lyon).toContain('rhone');
    expect(lyon).toContain('metropole lyonnaise');
  });

  it('preserves the Marseille / Bouches-du-Rhône / 13 contract', () => {
    const marseille = REGION_SYNONYMS['marseille'];
    expect(marseille).toContain('marseille');
    expect(marseille).toContain('13');
    expect(marseille).toContain('bouches du rhone');
  });

  it('preserves the Remote / Télétravail synonym contract', () => {
    const remote = REGION_SYNONYMS['remote'];
    expect(remote).toContain('remote');
    expect(remote).toContain('teletravail');
    expect(remote).toContain('full remote');
    expect(remote).toContain('distanciel');
    expect(remote).toContain('a distance');
    expect(remote).toContain('home office');
    // normalizeLocationAlias mirrors normalizeLight (keeps non-hyphen punctuation),
    // so the '%' in '100% Remote' is preserved — same form the scorer sees.
    expect(remote).toContain('100% remote');
  });

  it('standalone regional capitals mint their own group', () => {
    // Nantes has no `metro`; it must still appear as a synonym canonical.
    const nantes = REGION_SYNONYMS['nantes'];
    expect(nantes).toContain('nantes');
    expect(nantes).toContain('44');
    expect(nantes).toContain('loire atlantique');
  });

  it('suburbs (metro member, label ≠ metro) do NOT mint a synonym group', () => {
    // Anti-collision invariant: these Paris / Lyon / Marseille suburbs share
    // a department code with the metro canonical, so they must not rebind it.
    expect(REGION_SYNONYMS['villeurbanne']).toBeUndefined();
    expect(REGION_SYNONYMS['venissieux']).toBeUndefined();
    expect(REGION_SYNONYMS['nanterre']).toBeUndefined();
    expect(REGION_SYNONYMS['aix en provence']).toBeUndefined();
    expect(REGION_SYNONYMS['merignac']).toBeUndefined();
    expect(REGION_SYNONYMS['blagnac']).toBeUndefined();
  });

  it('every department code is owned by exactly ONE synonym group', () => {
    // The core anti-collision guarantee: a shared department code (e.g. '69',
    // used by Lyon and all its suburbs) must resolve to a single canonical.
    const owners = new Map<string, string[]>();
    const isDept = /^\d{2,3}$/;
    for (const [canonical, aliases] of Object.entries(REGION_SYNONYMS)) {
      for (const alias of aliases) {
        if (!isDept.test(alias)) {
          continue;
        }
        const list = owners.get(alias) ?? [];
        list.push(canonical);
        owners.set(alias, list);
      }
    }
    for (const [dept, canonicals] of owners) {
      expect({ dept, canonicals }).toEqual({ dept, canonicals: [canonicals[0]] });
      expect(canonicals).toHaveLength(1);
    }
  });
});

describe('METRO_AREAS — derivation', () => {
  it('exposes the major French metros', () => {
    for (const key of ['paris', 'lyon', 'marseille', 'bordeaux', 'toulouse']) {
      expect(METRO_AREAS[key]).toBeDefined();
      expect(METRO_AREAS[key].departments.length).toBeGreaterThan(0);
    }
  });

  it('every metro key is a normalized form present as a catalog metro', () => {
    const catalogMetros = new Set(
      LOCATION_CATALOG.map((e) => e.metro).filter((m): m is string => Boolean(m))
    );
    for (const metro of Object.keys(METRO_AREAS)) {
      expect(metro).toBe(normalizeLocationAlias(metro));
      expect(catalogMetros.has(metro)).toBe(true);
    }
  });

  it('department codes match /^\\d{2,3}$/', () => {
    const isDept = /^\d{2,3}$/;
    for (const data of Object.values(METRO_AREAS)) {
      for (const code of data.departments) {
        expect(isDept.test(code)).toBe(true);
      }
    }
  });

  it('Paris aggregates petite + grande couronne department codes', () => {
    const paris = METRO_AREAS['paris'].departments;
    // Petite couronne (75 + 92/93/94) plus grande couronne (78/91/77/95).
    for (const code of ['75', '92', '93', '94', '78', '91', '77', '95']) {
      expect(paris).toContain(code);
    }
  });

  it('Lyon owns department 69 and includes Villeurbanne as a city', () => {
    expect(METRO_AREAS['lyon'].departments).toContain('69');
    expect(METRO_AREAS['lyon'].cities).toContain('villeurbanne');
    expect(METRO_AREAS['lyon'].cities).not.toContain('lyon');
  });

  it('Marseille / Bordeaux / Toulouse own their department code', () => {
    expect(METRO_AREAS['marseille'].departments).toContain('13');
    expect(METRO_AREAS['bordeaux'].departments).toContain('33');
    expect(METRO_AREAS['toulouse'].departments).toContain('31');
  });

  it('suburb cities never equal their metro canonical name', () => {
    for (const [metro, data] of Object.entries(METRO_AREAS)) {
      expect(data.cities).not.toContain(metro);
    }
  });

  it('standalone places and remote variants are not metro areas', () => {
    // Nantes has no `metro`; Remote is a standalone place. Neither should
    // appear as a metro area key.
    expect(METRO_AREAS['nantes']).toBeUndefined();
    expect(METRO_AREAS['remote']).toBeUndefined();
  });
});
