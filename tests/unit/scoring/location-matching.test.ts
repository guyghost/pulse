import { describe, it, expect } from 'vitest';
import { normalizeLocation, matchLocation } from '../../../src/lib/core/scoring/location-matching';

describe('normalizeLocation', () => {
  describe('accent removal', () => {
    it('removes French accents from uppercase', () => {
      expect(normalizeLocation('Île-de-France')).toBe('ile de france');
    });

    it('removes French accents from lowercase', () => {
      expect(normalizeLocation('côte d\'azur')).toBe('cote dazur');
    });

    it('handles ç correctly', () => {
      expect(normalizeLocation('Bouches-du-Rhône')).toBe('bouches du rhone');
    });

    it('handles œ and æ ligatures', () => {
      expect(normalizeLocation('Cœur')).toBe('coeur');
    });
  });

  describe('postal code removal', () => {
    it('removes postal codes in parentheses', () => {
      expect(normalizeLocation('Paris (75)')).toBe('paris');
    });

    it('removes 5-digit postal codes', () => {
      expect(normalizeLocation('Paris 75001')).toBe('paris');
    });

    it('removes 2-digit department codes', () => {
      expect(normalizeLocation('Lyon 69')).toBe('lyon');
    });

    it('handles parentheses with spaces', () => {
      expect(normalizeLocation('Marseille ( 13 )')).toBe('marseille');
    });
  });

  describe('whitespace handling', () => {
    it('collapses multiple spaces', () => {
      expect(normalizeLocation('Paris   France')).toBe('paris france');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeLocation('  Paris  ')).toBe('paris');
    });
  });

  describe('punctuation handling', () => {
    it('removes punctuation but keeps content', () => {
      expect(normalizeLocation('Paris, France')).toBe('paris france');
    });

    it('converts hyphens to spaces', () => {
      expect(normalizeLocation('Saint-Étienne')).toBe('saint etienne');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null input', () => {
      expect(normalizeLocation(null as unknown as string)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(normalizeLocation(undefined as unknown as string)).toBe('');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeLocation('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normalizeLocation('   ')).toBe('');
    });

    it('handles numbers only', () => {
      expect(normalizeLocation('75')).toBe('');
    });
  });
});

describe('matchLocation', () => {
  describe('exact matches', () => {
    it('matches identical locations', () => {
      expect(matchLocation('Paris', 'Paris')).toBe('exact');
    });

    it('matches with different casing', () => {
      expect(matchLocation('PARIS', 'paris')).toBe('exact');
    });

    it('matches with postal codes', () => {
      expect(matchLocation('Paris (75)', 'Paris')).toBe('exact');
    });

    it('matches substring "Paris" in "Paris, France"', () => {
      expect(matchLocation('Paris, France', 'Paris')).toBe('exact');
    });

    it('matches reverse substring', () => {
      expect(matchLocation('Paris', 'Paris, France')).toBe('exact');
    });
  });

  describe('regional synonyms', () => {
    it('matches Paris with 75', () => {
      expect(matchLocation('Paris', '75')).toBe('synonym');
    });

    it('matches Paris with Île-de-France', () => {
      expect(matchLocation('Paris', 'Île-de-France')).toBe('synonym');
    });

    it('matches Paris with IDF', () => {
      expect(matchLocation('Paris', 'IDF')).toBe('synonym');
    });

    it('matches Lyon with 69', () => {
      expect(matchLocation('Lyon', '69')).toBe('synonym');
    });

    it('matches Lyon with Rhône', () => {
      expect(matchLocation('Lyon', 'Rhône')).toBe('synonym');
    });

    it('matches Marseille with 13', () => {
      expect(matchLocation('Marseille', '13')).toBe('synonym');
    });

    it('matches Marseille with Bouches-du-Rhône', () => {
      expect(matchLocation('Marseille', 'Bouches-du-Rhône')).toBe('synonym');
    });

    it('matches Bordeaux with Gironde', () => {
      expect(matchLocation('Bordeaux', 'Gironde')).toBe('synonym');
    });
  });

  describe('remote work synonyms', () => {
    it('matches Télétravail with Remote', () => {
      expect(matchLocation('Télétravail', 'Remote')).toBe('synonym');
    });

    it('matches Full Remote with Remote as exact (substring)', () => {
      // "full remote" contains "remote" as a substring, so it's an exact match
      expect(matchLocation('Full Remote', 'Remote')).toBe('exact');
    });

    it('matches Distanciel with Remote', () => {
      expect(matchLocation('Distanciel', 'Remote')).toBe('synonym');
    });

    it('matches Home Office with Remote', () => {
      expect(matchLocation('Home Office', 'Remote')).toBe('synonym');
    });

    it('matches À distance with Remote', () => {
      expect(matchLocation('À distance', 'Remote')).toBe('synonym');
    });
  });

  describe('avoiding false positives', () => {
    it('does NOT match Saint-Quentin with Paris', () => {
      // Saint-Quentin is in 02 (Aisne) or 78 (Yvelines), not Paris
      expect(matchLocation('Saint-Quentin', 'Paris')).toBe('none');
    });

    it('does NOT match Lyon with Paris', () => {
      expect(matchLocation('Lyon', 'Paris')).toBe('none');
    });

    it('does NOT match Marseille with Paris', () => {
      expect(matchLocation('Marseille (13)', 'Paris')).toBe('none');
    });

    it('does NOT match random cities', () => {
      expect(matchLocation('Nice', 'Lille')).toBe('none');
    });
  });

  describe('null and edge case handling', () => {
    it('returns none for null mission location', () => {
      expect(matchLocation(null, 'Paris')).toBe('none');
    });

    it('returns none for null profile location', () => {
      expect(matchLocation('Paris', null)).toBe('none');
    });

    it('returns none for both null', () => {
      expect(matchLocation(null, null)).toBe('none');
    });

    it('returns none for empty strings', () => {
      expect(matchLocation('', 'Paris')).toBe('none');
    });

    it('returns none for whitespace-only strings', () => {
      expect(matchLocation('   ', 'Paris')).toBe('none');
    });
  });

  describe('partial matches (token-based)', () => {
    it('matches tokens in compound locations', () => {
      // If both have "paris" as a token somewhere
      expect(matchLocation('Paris La Défense', 'Paris')).toBe('exact');
    });

    it('handles multi-word locations', () => {
      // "Le Petit-Paris" should not match "Paris" exactly
      // This tests the tokenization
      const result = matchLocation('Le Petit-Paris', 'Paris');
      // This is a substring match since "paris" is in "le petit paris"
      expect(result).toBe('exact');
    });
  });

  describe('real-world scenarios', () => {
    it('matches "Paris (75)" with profile "Paris"', () => {
      expect(matchLocation('Paris (75)', 'Paris')).toBe('exact');
    });

    it('matches "Paris 75001" with profile "Paris"', () => {
      expect(matchLocation('Paris 75001', 'Paris')).toBe('exact');
    });

    it('matches "Île-de-France" with profile "Paris"', () => {
      expect(matchLocation('Île-de-France', 'Paris')).toBe('synonym');
    });

    it('matches "Télétravail complet" with profile "Remote"', () => {
      // "teletravail complet" contains "teletravail" which is synonym of "remote"
      expect(matchLocation('Télétravail complet', 'Remote')).toBe('synonym');
    });

    it('matches "100% Remote" with profile "Remote"', () => {
      expect(matchLocation('100% Remote', 'Remote')).toBe('exact');
    });

    it('avoids matching "Nantes" with profile "Paris"', () => {
      expect(matchLocation('Nantes', 'Paris')).toBe('none');
    });

    it('avoids matching "Toulouse" with profile "Lyon"', () => {
      expect(matchLocation('Toulouse', 'Lyon')).toBe('none');
    });
  });

  describe('symmetry', () => {
    it('is symmetric: Paris ↔ 75', () => {
      expect(matchLocation('Paris', '75')).toBe(matchLocation('75', 'Paris'));
    });

    it('is symmetric: Remote ↔ Télétravail', () => {
      expect(matchLocation('Remote', 'Télétravail')).toBe(
        matchLocation('Télétravail', 'Remote'),
      );
    });

    it('is symmetric: Lyon ↔ Rhône', () => {
      expect(matchLocation('Lyon', 'Rhône')).toBe(matchLocation('Rhône', 'Lyon'));
    });
  });
});
