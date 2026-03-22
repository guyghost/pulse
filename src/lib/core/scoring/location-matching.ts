/**
 * Location fuzzy matching for MissionPulse scoring.
 *
 * Pure functions for normalizing and matching location strings without
 * external dependencies. Handles French accents, postal codes, regional
 * synonyms, and common variations.
 *
 * @module location-matching
 */

/**
 * Result of a location match comparison.
 * - 'exact': Perfect match after normalization or substring match
 * - 'synonym': Regional synonym match (e.g., Paris ↔ 75 ↔ Île-de-France)
 * - 'partial': Token-based partial match
 * - 'none': No match found
 */
export type LocationMatchResult = 'exact' | 'synonym' | 'partial' | 'none';

/**
 * Mapping of canonical location names to their regional synonyms.
 * Each key maps to an array of strings that should be considered equivalent.
 */
const REGION_SYNONYMS: Record<string, string[]> = {
  // Île-de-France / Paris
  paris: ['paris', '75', 'ile de france', 'idf', 'paris 75', 'paris 1er'],
  'ile de france': ['ile de france', 'idf', 'paris', '75', 'region parisienne'],

  // Lyon / Rhône
  lyon: ['lyon', '69', 'rhone', 'metropole lyonnaise'],
  rhone: ['rhone', '69', 'lyon'],

  // Marseille / Bouches-du-Rhône
  marseille: ['marseille', '13', 'bouche du rhone', 'bouches du rhone'],
  'bouche du rhone': ['bouche du rhone', 'bouches du rhone', '13', 'marseille'],

  // Bordeaux / Gironde
  bordeaux: ['bordeaux', '33', 'gironde'],
  gironde: ['gironde', '33', 'bordeaux'],

  // Toulouse / Haute-Garonne
  toulouse: ['toulouse', '31', 'haute garonne'],
  'haute garonne': ['haute garonne', '31', 'toulouse'],

  // Nantes / Loire-Atlantique
  nantes: ['nantes', '44', 'loire atlantique'],
  'loire atlantique': ['loire atlantique', '44', 'nantes'],

  // Lille / Nord
  lille: ['lille', '59', 'nord'],
  nord: ['nord', '59', 'lille'],

  // Nice / Alpes-Maritimes
  nice: ['nice', '06', 'alpes maritimes'],
  'alpes maritimes': ['alpes maritimes', '06', 'nice'],

  // Strasbourg / Bas-Rhin
  strasbourg: ['strasbourg', '67', 'bas rhin'],
  'bas rhin': ['bas rhin', '67', 'strasbourg'],

  // Remote work synonyms
  remote: ['remote', 'teletravail', 'full remote', 'distanciel', 'home office', 'a distance', '100 remote'],
};

/**
 * Build a lookup cache where each synonym maps to its canonical form.
 */
const buildSynonymCache = (): Map<string, string> => {
  const cache = new Map<string, string>();
  for (const [canonical, synonyms] of Object.entries(REGION_SYNONYMS)) {
    for (const synonym of synonyms) {
      cache.set(synonym, canonical);
    }
  }
  return cache;
};

/**
 * Cache of all synonyms for fast lookup.
 * Built once from REGION_SYNONYMS.
 */
const SYNONYM_CACHE: Map<string, string> = buildSynonymCache();

/**
 * Remove French accents from a string.
 * Pure function - no side effects.
 */
const removeAccents = (str: string): string => {
  const accentMap: Record<string, string> = {
    à: 'a', â: 'a', ä: 'a',
    é: 'e', è: 'e', ê: 'e', ë: 'e',
    î: 'i', ï: 'i',
    ô: 'o', ö: 'o',
    ù: 'u', û: 'u', ü: 'u',
    ç: 'c',
    œ: 'oe', æ: 'ae',
  };

  let result = str.toLowerCase();
  for (const [accent, plain] of Object.entries(accentMap)) {
    result = result.split(accent).join(plain);
  }
  return result;
};

/**
 * Light normalization for synonym matching.
 * Only removes accents, lowercases, and normalizes hyphens/spaces.
 * Preserves numbers (department codes) for synonym lookup.
 *
 * @param location - Raw location string
 * @returns Lightly normalized location string
 */
const normalizeLight = (location: string): string => {
  if (!location || typeof location !== 'string') {
    return '';
  }

  let normalized = location;

  // Remove accents
  normalized = removeAccents(normalized);

  // Replace hyphens with spaces
  normalized = normalized.replace(/-/g, ' ');

  // Collapse multiple whitespace to single space
  normalized = normalized.replace(/\s+/g, ' ');

  // Trim
  normalized = normalized.trim();

  return normalized;
};

/**
 * Normalize a location string for comparison.
 *
 * Operations performed:
 * 1. Remove accents (Île → ile)
 * 2. Remove postal codes in parentheses: (75), (69001)
 * 3. Remove standalone postal codes (5-digit numbers)
 * 4. Remove extra whitespace
 * 5. Lowercase
 * 6. Remove punctuation except hyphens (replace hyphens with spaces)
 *
 * @param location - Raw location string
 * @returns Normalized location string
 */
export const normalizeLocation = (location: string): string => {
  if (!location || typeof location !== 'string') {
    return '';
  }

  let normalized = location;

  // Remove accents
  normalized = removeAccents(normalized);

  // Remove postal codes in parentheses: (75), (69001)
  normalized = normalized.replace(/\(\s*\d{2,5}\s*\)/gi, '');

  // Remove standalone 5-digit postal codes
  normalized = normalized.replace(/\b\d{5}\b/g, '');

  // Remove standalone 2-digit department codes
  normalized = normalized.replace(/\b\d{2}\b/g, '');

  // Remove punctuation except hyphens, then replace hyphens with spaces
  normalized = normalized.replace(/[^\w\s-]/g, '');
  normalized = normalized.replace(/-/g, ' ');

  // Collapse multiple whitespace to single space
  normalized = normalized.replace(/\s+/g, ' ');

  // Trim and lowercase
  normalized = normalized.trim().toLowerCase();

  return normalized;
};

/**
 * Check if two normalized locations belong to the same synonym group.
 *
 * @param loc1 - First normalized location
 * @param loc2 - Second normalized location
 * @returns true if both locations are synonyms of each other
 */
const areRegionalSynonyms = (loc1: string, loc2: string): boolean => {
  if (!loc1 || !loc2) return false;

  const canonical1 = SYNONYM_CACHE.get(loc1);
  const canonical2 = SYNONYM_CACHE.get(loc2);

  // Both must be in the synonym cache and map to the same canonical form
  if (canonical1 && canonical2) {
    return canonical1 === canonical2;
  }

  // Check if one is in the synonyms list of the other's canonical form
  if (canonical1) {
    const synonyms = REGION_SYNONYMS[canonical1];
    return synonyms ? synonyms.includes(loc2) : false;
  }

  if (canonical2) {
    const synonyms = REGION_SYNONYMS[canonical2];
    return synonyms ? synonyms.includes(loc1) : false;
  }

  return false;
};

/**
 * Split a location string into meaningful tokens for matching.
 * Preserves short tokens like department codes (75, 69, etc.).
 *
 * @param location - Normalized location string
 * @returns Array of meaningful tokens
 */
const tokenizeLocation = (location: string): string[] => {
  return location
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
};

/**
 * Check if any token from one location matches any token from another.
 *
 * @param tokens1 - First set of tokens
 * @param tokens2 - Second set of tokens
 * @returns true if any exact token match exists
 */
const hasTokenMatch = (tokens1: string[], tokens2: string[]): boolean => {
  for (const token1 of tokens1) {
    if (tokens2.includes(token1)) {
      return true;
    }
  }
  return false;
};

/**
 * Check if any token pair from two locations are regional synonyms.
 *
 * @param tokens1 - First set of tokens
 * @param tokens2 - Second set of tokens
 * @returns true if any token pair are synonyms
 */
const hasSynonymTokenMatch = (tokens1: string[], tokens2: string[]): boolean => {
  for (const token1 of tokens1) {
    for (const token2 of tokens2) {
      if (areRegionalSynonyms(token1, token2)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Match two location strings and return the match quality.
 *
 * Matching algorithm (in order of priority):
 * 1. Exact match after light normalization (identical strings)
 * 2. Substring match (one contains the other)
 * 3. Regional synonym match on lightly normalized strings (preserves department codes)
 * 4. Token-based synonym match
 * 5. Token-based exact match (partial)
 * 6. No match
 *
 * @param missionLoc - Mission location string (may be null)
 * @param profileLoc - Profile location string (may be null)
 * @returns Match result indicating the quality of the match
 */
export const matchLocation = (
  missionLoc: string | null,
  profileLoc: string | null,
): LocationMatchResult => {
  // Handle null/undefined cases
  if (!missionLoc || !profileLoc) {
    return 'none';
  }

  // Light normalization preserves department codes for synonym matching
  const lightMission = normalizeLight(missionLoc);
  const lightProfile = normalizeLight(profileLoc);

  // Empty after light normalization
  if (!lightMission || !lightProfile) {
    return 'none';
  }

  // 1. Exact match after light normalization (identical strings = exact)
  if (lightMission === lightProfile) {
    return 'exact';
  }

  // 2. Substring match (e.g., "paris" in "paris france")
  if (lightMission.includes(lightProfile) || lightProfile.includes(lightMission)) {
    return 'exact';
  }

  // 3. Check regional synonyms with lightly normalized values
  // This handles: Paris ↔ 75, Lyon ↔ 69, etc.
  if (areRegionalSynonyms(lightMission, lightProfile)) {
    return 'synonym';
  }

  // 4. Check token-based synonyms (handles multi-word cases)
  const lightMissionTokens = tokenizeLocation(lightMission);
  const lightProfileTokens = tokenizeLocation(lightProfile);

  if (lightMissionTokens.length > 0 && lightProfileTokens.length > 0) {
    if (hasSynonymTokenMatch(lightMissionTokens, lightProfileTokens)) {
      return 'synonym';
    }
  }

  // 5. Full normalization for remaining exact/partial matching
  const normMission = normalizeLocation(missionLoc);
  const normProfile = normalizeLocation(profileLoc);

  // Empty after full normalization
  if (!normMission || !normProfile) {
    return 'none';
  }

  // 6. Token-based matching with full normalization (for partial matches)
  const missionTokens = tokenizeLocation(normMission);
  const profileTokens = tokenizeLocation(normProfile);

  // Handle case where tokenization produces empty arrays
  if (missionTokens.length === 0 || profileTokens.length === 0) {
    return 'none';
  }

  // Check for exact token match (partial because not full string match)
  if (hasTokenMatch(missionTokens, profileTokens)) {
    return 'partial';
  }

  return 'none';
};
