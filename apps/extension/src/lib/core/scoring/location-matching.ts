/**
 * Location fuzzy matching for MissionPulse scoring.
 *
 * Pure functions for normalizing and matching location strings without
 * external dependencies. Handles French accents, postal codes, regional
 * synonyms, and common variations.
 *
 * @module location-matching
 */

import { REGION_SYNONYMS, METRO_AREAS } from '../locations/derive-location-tables';

/**
 * Result of a location match comparison.
 * - 'exact': Perfect match after normalization or substring match
 * - 'synonym': Regional synonym match (e.g., Paris ↔ 75 ↔ Île-de-France)
 * - 'nearby': Same metropolitan area (e.g., Nanterre → Paris, Villeurbanne → Lyon)
 * - 'partial': Token-based partial match
 * - 'none': No match found
 */
export type LocationMatchResult = 'exact' | 'synonym' | 'nearby' | 'partial' | 'none';

/**
 * Regional synonym and metro-area tables are derived from the single source
 * of truth in `core/locations/location-catalog.ts` (see
 * `models/location-tables-derivation.model.md`). The derivation lives in
 * `core/locations/derive-location-tables.ts`; only the resulting tables are
 * imported here. The matching algorithm below is unchanged.
 */

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
 * Build a lookup cache for fast city → metro area resolution.
 * Each city in a metro area maps to its canonical metro name.
 * Also maps the metro name itself to itself (e.g., "paris" → "paris").
 */
const buildMetroAreaCache = (): Map<string, string> => {
  const cache = new Map<string, string>();
  for (const [metroName, data] of Object.entries(METRO_AREAS)) {
    // The metro name itself maps to itself
    cache.set(metroName, metroName);
    // Each city maps to the metro name
    for (const city of data.cities) {
      cache.set(city, metroName);
    }
  }
  return cache;
};

/**
 * Cache for fast city → metro area resolution.
 * Built once from METRO_AREAS.
 */
const METRO_AREA_CACHE: Map<string, string> = buildMetroAreaCache();

/**
 * Build a lookup cache for department → metro area resolution.
 */
const buildMetroDepartmentCache = (): Map<string, string> => {
  const cache = new Map<string, string>();
  for (const [metroName, data] of Object.entries(METRO_AREAS)) {
    for (const dept of data.departments) {
      cache.set(dept, metroName);
    }
  }
  return cache;
};

/**
 * Cache for fast department → metro area resolution.
 * Built once from METRO_AREAS.
 */
const METRO_DEPARTMENT_CACHE: Map<string, string> = buildMetroDepartmentCache();

/**
 * Extract 2-digit department codes from a location string.
 * Looks for standalone 2-digit numbers or codes in parentheses.
 *
 * @param location - Location string to extract from
 * @returns Array of 2-digit department codes found
 */
const extractDepartmentCodes = (location: string): string[] => {
  const codes: string[] = [];
  // Match standalone 2-digit codes
  const standaloneMatch = location.match(/\b(\d{2})\b/g);
  if (standaloneMatch) {
    codes.push(...standaloneMatch);
  }
  // Match codes in parentheses like (92) or (75)
  const parenMatch = location.match(/\((\d{2})\)/g);
  if (parenMatch) {
    codes.push(...parenMatch.map((m) => m.slice(1, 3)));
  }
  return [...new Set(codes)]; // Deduplicate
};

/**
 * Generate all n-gram phrases from a list of tokens.
 * Used for matching multi-word city names and synonyms.
 *
 * @param tokens - Array of individual tokens
 * @param maxN - Maximum phrase length (default: 4)
 * @returns Array of phrases (consecutive token combinations)
 */
const generatePhrases = (tokens: string[], maxN = 4): string[] => {
  const phrases: string[] = [];
  const limit = Math.min(maxN, tokens.length);

  for (let n = 2; n <= limit; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      phrases.push(tokens.slice(i, i + n).join(' '));
    }
  }

  return phrases;
};

/**
 * Find the metropolitan area a location belongs to.
 * Checks city names, tokens, multi-word phrases, and department codes.
 *
 * @param location - Lightly normalized location string
 * @returns The canonical metro name if found, null otherwise
 */
const findMetroArea = (location: string): string | null => {
  if (!location) {
    return null;
  }

  // 1. Check if the full string matches a city in any metro area
  const directMatch = METRO_AREA_CACHE.get(location);
  if (directMatch) {
    return directMatch;
  }

  // 2. Check if any token matches a city name (for compound locations like "Nanterre La Défense")
  const tokens = tokenizeLocation(location);
  for (const token of tokens) {
    const tokenMatch = METRO_AREA_CACHE.get(token);
    if (tokenMatch) {
      return tokenMatch;
    }
  }

  // 3. Check multi-word phrases (for cities like "boulogne billancourt")
  const phrases = generatePhrases(tokens);
  for (const phrase of phrases) {
    const phraseMatch = METRO_AREA_CACHE.get(phrase);
    if (phraseMatch) {
      return phraseMatch;
    }
  }

  // 4. Check if any department code matches a metro department
  const deptCodes = extractDepartmentCodes(location);
  for (const code of deptCodes) {
    const deptMatch = METRO_DEPARTMENT_CACHE.get(code);
    if (deptMatch) {
      return deptMatch;
    }
  }

  return null;
};

/**
 * Check if two locations are in the same metropolitan area.
 *
 * @param loc1 - First location string (lightly normalized)
 * @param loc2 - Second location string (lightly normalized)
 * @returns true if both locations resolve to the same metro area
 */
const areInSameMetroArea = (loc1: string, loc2: string): boolean => {
  const metro1 = findMetroArea(loc1);
  const metro2 = findMetroArea(loc2);

  // Both must resolve to the same metro area
  if (metro1 && metro2 && metro1 === metro2) {
    return true;
  }

  return false;
};

/**
 * Accent → plain char mapping (lowercase). Hoisted to module scope so the map
 * and its compiled character class are built once, not on every call.
 *
 * Includes ligatures (œ → oe, æ → ae): String.prototype.normalize('NFD') does
 * NOT decompose these, so a plain NFD-based approach would silently change
 * behavior (e.g. "Cœur" → "cur" instead of "coeur").
 */
const ACCENT_MAP: Record<string, string> = {
  à: 'a',
  â: 'a',
  ä: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  î: 'i',
  ï: 'i',
  ô: 'o',
  ö: 'o',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ç: 'c',
  œ: 'oe',
  æ: 'ae',
};

// Matches any accented/ligature char. Compiled once at module load.
const ACCENT_CHAR_CLASS = new RegExp(`[${Object.keys(ACCENT_MAP).join('')}]`, 'g');

/**
 * Remove French accents from a string.
 * Pure function - no side effects.
 *
 * Uses a single-pass regex replace over the precompiled character class instead
 * of one `.split().join()` allocation per accent char (previously 17 passes +
 * an object literal rebuilt on every call). This is a scoring hot path: it runs
 * via normalizeLight/normalizeLocation on every mission during relevance scoring.
 */
const removeAccents = (str: string): string =>
  str.toLowerCase().replace(ACCENT_CHAR_CLASS, (ch) => ACCENT_MAP[ch] ?? ch);

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
  if (!loc1 || !loc2) {
    return false;
  }

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
 * Also checks multi-word phrases for synonyms like "ile de france".
 *
 * @param tokens1 - First set of tokens
 * @param tokens2 - Second set of tokens
 * @returns true if any token pair or phrase pair are synonyms
 */
const hasSynonymTokenMatch = (tokens1: string[], tokens2: string[]): boolean => {
  // Check individual tokens
  for (const token1 of tokens1) {
    for (const token2 of tokens2) {
      if (areRegionalSynonyms(token1, token2)) {
        return true;
      }
    }
  }

  // Check multi-word phrases (for synonyms like "ile de france")
  const phrases1 = generatePhrases(tokens1);
  const phrases2 = generatePhrases(tokens2);

  for (const phrase1 of phrases1) {
    for (const phrase2 of phrases2) {
      if (areRegionalSynonyms(phrase1, phrase2)) {
        return true;
      }
    }
  }

  // Also check phrases against individual tokens (e.g., "ile de france" vs "paris")
  for (const phrase1 of phrases1) {
    for (const token2 of tokens2) {
      if (areRegionalSynonyms(phrase1, token2)) {
        return true;
      }
    }
  }

  for (const token1 of tokens1) {
    for (const phrase2 of phrases2) {
      if (areRegionalSynonyms(token1, phrase2)) {
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
 * 5. Metropolitan area proximity match (nearby) on lightly normalized strings
 * 6. Metropolitan area proximity match on fully normalized strings/tokens
 * 7. Token-based exact match (partial)
 * 8. No match
 *
 * @param missionLoc - Mission location string (may be null)
 * @param profileLoc - Profile location string (may be null)
 * @returns Match result indicating the quality of the match
 */
export const matchLocation = (
  missionLoc: string | null,
  profileLoc: string | null
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

  // 4b. Check metropolitan area proximity (nearby)
  // This handles: Nanterre → Paris, Villeurbanne → Lyon, etc.
  if (areInSameMetroArea(lightMission, lightProfile)) {
    return 'nearby';
  }

  // 5. Full normalization for remaining exact/partial matching
  const normMission = normalizeLocation(missionLoc);
  const normProfile = normalizeLocation(profileLoc);

  // Empty after full normalization
  if (!normMission || !normProfile) {
    return 'none';
  }

  // 5b. Fallback nearby check with fully normalized values
  if (areInSameMetroArea(normMission, normProfile)) {
    return 'nearby';
  }

  // 6. Fallback nearby check with tokenized normalized values
  const missionTokens = tokenizeLocation(normMission);
  const profileTokens = tokenizeLocation(normProfile);

  // Check if any token pair are in the same metro area
  for (const token1 of missionTokens) {
    for (const token2 of profileTokens) {
      if (areInSameMetroArea(token1, token2)) {
        return 'nearby';
      }
    }
  }

  // 7. Token-based matching with full normalization (for partial matches)
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
