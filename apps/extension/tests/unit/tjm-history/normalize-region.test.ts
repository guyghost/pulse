import { describe, expect, it } from 'vitest';
import { normalizeRegion } from '$lib/core/tjm-history/normalize-region';

describe('normalizeRegion', () => {
  // --- Île-de-France ---
  it.each([
    'Paris',
    'Paris (75)',
    'Paris, France',
    'Île-de-France',
    'ile-de-france',
    'IDF',
    'La Défense',
    'la defense',
    'Boulogne-Billancourt',
    'Levallois-Perret',
    'Neuilly-sur-Seine',
    'Nanterre (92)',
    'Courbevoie',
    'Issy-les-Moulineaux',
    'Puteaux',
    'Rueil-Malmaison',
    'Massy',
  ])('maps "%s" to ile-de-france', (location) => {
    expect(normalizeRegion(location)).toBe('ile-de-france');
  });

  // --- Lyon ---
  it.each(['Lyon', 'lyon', 'Lyon (69)', 'Villeurbanne', 'Écully'])(
    'maps "%s" to lyon',
    (location) => {
      expect(normalizeRegion(location)).toBe('lyon');
    }
  );

  // --- Other cities ---
  it('maps Marseille variants', () => {
    expect(normalizeRegion('Marseille')).toBe('marseille');
    expect(normalizeRegion('Aix-en-Provence')).toBe('marseille');
  });

  it('maps Toulouse variants', () => {
    expect(normalizeRegion('Toulouse')).toBe('toulouse');
    expect(normalizeRegion('Blagnac')).toBe('toulouse');
  });

  it('maps Bordeaux variants', () => {
    expect(normalizeRegion('Bordeaux')).toBe('bordeaux');
    expect(normalizeRegion('Mérignac')).toBe('bordeaux');
  });

  it('maps Nantes variants', () => {
    expect(normalizeRegion('Nantes')).toBe('nantes');
    expect(normalizeRegion('Saint-Herblain')).toBe('nantes');
  });

  it('maps Lille variants', () => {
    expect(normalizeRegion('Lille')).toBe('lille');
    expect(normalizeRegion("Villeneuve-d'Ascq")).toBe('lille');
  });

  it('maps Strasbourg', () => {
    expect(normalizeRegion('Strasbourg')).toBe('strasbourg');
  });

  it('maps Rennes variants', () => {
    expect(normalizeRegion('Rennes')).toBe('rennes');
    expect(normalizeRegion('Cesson-Sévigné')).toBe('rennes');
  });

  it('maps Grenoble variants', () => {
    expect(normalizeRegion('Grenoble')).toBe('grenoble');
    expect(normalizeRegion('Meylan')).toBe('grenoble');
  });

  it('maps Montpellier', () => {
    expect(normalizeRegion('Montpellier')).toBe('montpellier');
  });

  it('maps Nice / Sophia Antipolis', () => {
    expect(normalizeRegion('Nice')).toBe('nice');
    expect(normalizeRegion('Sophia Antipolis')).toBe('nice');
    expect(normalizeRegion('Sophia-Antipolis')).toBe('nice');
  });

  // --- Remote ---
  it('maps remote keywords to remote', () => {
    expect(normalizeRegion('Full remote')).toBe('remote');
    expect(normalizeRegion('100% remote')).toBe('remote');
    expect(normalizeRegion('Télétravail complet')).toBe('remote');
  });

  it('maps full remote via remote param regardless of location', () => {
    expect(normalizeRegion('Toulouse', 'full')).toBe('remote');
    expect(normalizeRegion(null, 'full')).toBe('remote');
  });

  it('uses location when remote is hybrid or onsite', () => {
    expect(normalizeRegion('Lyon', 'hybrid')).toBe('lyon');
    expect(normalizeRegion('Paris', 'onsite')).toBe('ile-de-france');
  });

  // --- Fallbacks ---
  it('returns other for null location', () => {
    expect(normalizeRegion(null)).toBe('other');
  });

  it('returns other for empty string', () => {
    expect(normalizeRegion('')).toBe('other');
    expect(normalizeRegion('   ')).toBe('other');
  });

  it('returns other for unknown locations', () => {
    expect(normalizeRegion('Clermont-Ferrand')).toBe('other');
    expect(normalizeRegion('Dijon')).toBe('other');
  });
});
