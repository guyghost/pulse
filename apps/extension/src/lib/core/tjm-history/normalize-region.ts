/**
 * Normalize free-text mission locations into canonical French regions.
 *
 * Pure function: no I/O, no async, deterministic.
 */
import type { TJMRegion } from '../types/tjm';

/** Human-readable label for each region */
export const REGION_LABELS: Record<TJMRegion, string> = {
  'ile-de-france': 'Île-de-France',
  lyon: 'Lyon',
  marseille: 'Marseille',
  toulouse: 'Toulouse',
  bordeaux: 'Bordeaux',
  nantes: 'Nantes',
  lille: 'Lille',
  strasbourg: 'Strasbourg',
  rennes: 'Rennes',
  grenoble: 'Grenoble',
  montpellier: 'Montpellier',
  nice: 'Nice',
  remote: 'Full remote',
  other: 'Autre',
};

/**
 * Keyword → region mapping.
 * Order matters: more specific keywords first to avoid false positives.
 * All keywords are lowercase and accent-stripped for matching.
 */
const REGION_KEYWORDS: Array<[string[], TJMRegion]> = [
  // Île-de-France variants
  [
    [
      'paris',
      'ile-de-france',
      'île-de-france',
      'ile de france',
      'île de france',
      'idf',
      'la defense',
      'la défense',
      'boulogne-billancourt',
      'boulogne billancourt',
      'levallois',
      'neuilly',
      'nanterre',
      'courbevoie',
      'saint-denis',
      'montreuil',
      'creteil',
      'créteil',
      'versailles',
      'issy-les-moulineaux',
      'issy les moulineaux',
      'puteaux',
      'rueil',
      'massy',
      'noisy',
      'cergy',
      'evry',
      'ivry',
      'vitry',
    ],
    'ile-de-france',
  ],
  // Lyon / Rhône
  [['lyon', 'villeurbanne', 'rhône', 'rhone', 'ecully', 'écully'], 'lyon'],
  // Marseille / PACA
  [['marseille', 'aix-en-provence', 'aix en provence'], 'marseille'],
  // Toulouse
  [['toulouse', 'blagnac', 'labège', 'labege'], 'toulouse'],
  // Bordeaux
  [['bordeaux', 'mérignac', 'merignac', 'pessac', 'talence'], 'bordeaux'],
  // Nantes
  [['nantes', 'saint-herblain', 'saint herblain', 'rezé', 'reze'], 'nantes'],
  // Lille
  [['lille', "villeneuve-d'ascq", "villeneuve d'ascq", 'roubaix', 'tourcoing', 'marcq'], 'lille'],
  // Strasbourg
  [['strasbourg', 'illkirch', 'schiltigheim'], 'strasbourg'],
  // Rennes
  [['rennes', 'cesson-sévigné', 'cesson sevigne', 'cesson-sevigne'], 'rennes'],
  // Grenoble
  [['grenoble', 'meylan', 'echirolles'], 'grenoble'],
  // Montpellier
  [['montpellier', 'castelnau'], 'montpellier'],
  // Nice / Côte d'Azur
  [['nice', 'sophia antipolis', 'sophia-antipolis', 'antibes', 'cannes'], 'nice'],
  // Remote
  [
    [
      'full remote',
      'remote',
      'télétravail complet',
      'teletravail complet',
      '100% remote',
      '100% télétravail',
    ],
    'remote',
  ],
];

/**
 * Normalize a free-text location string to a canonical TJMRegion.
 *
 * @param location - Raw location from mission (e.g. "Paris (75)", "Lyon, France")
 * @param remote - Remote type from mission, used to detect full remote
 * @returns Normalized region, or 'other' if unrecognized
 */
export const normalizeRegion = (
  location: string | null,
  remote?: 'full' | 'hybrid' | 'onsite' | null
): TJMRegion => {
  // Full remote missions get the 'remote' region
  if (remote === 'full') {
    return 'remote';
  }

  if (!location) {
    return 'other';
  }

  const lower = location.toLowerCase().trim();

  if (!lower) {
    return 'other';
  }

  for (const [keywords, region] of REGION_KEYWORDS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return region;
      }
    }
  }

  return 'other';
};
