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
 * Precomputed matching parts for one normalized location string.
 *
 * Tokens, multi-word phrases, department codes, and the metro-area resolution
 * are computed once per input string per `matchLocation` invocation and reused
 * by every downstream check (synonym token matching, metro proximity) instead
 * of being regenerated inside each comparison (audit point #9).
 */
interface LocationParts {
  readonly tokens: readonly string[];
  readonly phrases: readonly string[];
  readonly deptCodes: readonly string[];
  readonly metro: string | null;
}

/**
 * Resolve the metropolitan area a location belongs to from precomputed parts.
 * Checks city names, tokens, multi-word phrases, and department codes.
 * Lookup priority is unchanged: full string → tokens → phrases → department codes.
 *
 * @param full - The normalized location string itself
 * @param tokens - Tokenized form of `full`
 * @param phrases - Multi-word n-gram phrases built from `tokens`
 * @param deptCodes - Department codes extracted from `full`
 * @returns The canonical metro name if found, null otherwise
 */
const resolveMetroArea = (
  full: string,
  tokens: readonly string[],
  phrases: readonly string[],
  deptCodes: readonly string[]
): string | null => {
  // 1. Check if the full string matches a city in any metro area
  const directMatch = METRO_AREA_CACHE.get(full);
  if (directMatch) {
    return directMatch;
  }

  // 2. Check if any token matches a city name (for compound locations like "Nanterre La Défense")
  for (const token of tokens) {
    const tokenMatch = METRO_AREA_CACHE.get(token);
    if (tokenMatch) {
      return tokenMatch;
    }
  }

  // 3. Check multi-word phrases (for cities like "boulogne billancourt")
  for (const phrase of phrases) {
    const phraseMatch = METRO_AREA_CACHE.get(phrase);
    if (phraseMatch) {
      return phraseMatch;
    }
  }

  // 4. Check if any department code matches a metro department
  for (const code of deptCodes) {
    const deptMatch = METRO_DEPARTMENT_CACHE.get(code);
    if (deptMatch) {
      return deptMatch;
    }
  }

  return null;
};

/**
 * Tokenize, generate phrases, extract department codes, and resolve the metro
 * area for one normalized location string — computed once and reused within
 * the current invocation. Pure: nothing is cached between invocations.
 *
 * @param normalized - Normalized location string (non-empty)
 * @returns The location's precomputed matching parts
 */
const analyzeLocation = (normalized: string): LocationParts => {
  const tokens = tokenizeLocation(normalized);
  const phrases = generatePhrases(tokens);
  const deptCodes = extractDepartmentCodes(normalized);
  return {
    tokens,
    phrases,
    deptCodes,
    metro: resolveMetroArea(normalized, tokens, phrases, deptCodes),
  };
};

/** Shared empty phrase list: a single token can never form an n>=2 phrase. */
const NO_PHRASES: readonly string[] = [];

/**
 * Resolve the metro area for a single standalone token (used by the token-pair
 * proximity check in `matchLocation`). Mirrors what resolving the token as a
 * standalone location string would produce, with the token's own department
 * code still taken into account (e.g. "92").
 *
 * @param token - Single token (non-empty)
 * @returns The canonical metro name if found, null otherwise
 */
const resolveTokenMetroArea = (token: string): string | null =>
  resolveMetroArea(token, [token], NO_PHRASES, extractDepartmentCodes(token));

/**
 * Check if two pre-analyzed locations are in the same metropolitan area.
 *
 * @param parts1 - Precomputed parts of the first location
 * @param parts2 - Precomputed parts of the second location
 * @returns true if both locations resolve to the same metro area
 */
const areInSameMetroArea = (parts1: LocationParts, parts2: LocationParts): boolean =>
  parts1.metro !== null && parts1.metro === parts2.metro;

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

/** Matches a pure-numeric token (department code, arrondissement number, …). */
const NUMERIC_TOKEN = /^\d+$/;

/**
 * Check if any token from one location matches any token from another.
 *
 * @param tokens1 - First set of tokens
 * @param tokens2 - Second set of tokens
 * @returns true if any exact token match exists
 */
const hasTokenMatch = (tokens1: readonly string[], tokens2: readonly string[]): boolean => {
  const candidates = new Set(tokens2);
  for (const token1 of tokens1) {
    if (candidates.has(token1)) {
      return true;
    }
  }
  return false;
};

/**
 * Collect the synonym-group ids (canonical forms) for every matchable string
 * of one location: non-numeric tokens plus multi-word phrases.
 *
 * `areRegionalSynonyms(a, b)` is true exactly when both `a` and `b` are keys
 * of `SYNONYM_CACHE` mapping to the same canonical form: if either string is
 * absent from the cache it cannot appear in any `REGION_SYNONYMS` list either
 * (every listed synonym is a cache key), so the list-scan fallbacks in
 * `areRegionalSynonyms` always see a non-member and return false. Synonym
 * matching is therefore an equivalence-class check, which this collector
 * turns into O(n) set construction instead of pairwise scans (audit point #5).
 *
 * Pure-numeric single tokens (department codes such as `"17"` or `"75"`) are
 * skipped: they collide with arrondissement numbers and other numeric
 * fragments (e.g. mission `"Paris 17"` must not match profile `"La Rochelle"`
 * whose department code is `17`). Whole-string numeric matching (`"75"` vs
 * `"Paris"`) is still handled earlier by the whole-string `areRegionalSynonyms`
 * check, and numeric codes inside a multi-word phrase are unaffected here
 * because phrases are n>=2.
 *
 * @param parts - Precomputed parts of the location
 * @returns Set of canonical forms this location's tokens/phrases belong to
 */
const collectSynonymGroupIds = (parts: LocationParts): Set<string> => {
  const ids = new Set<string>();
  for (const token of parts.tokens) {
    if (NUMERIC_TOKEN.test(token)) {
      continue;
    }
    const canonical = SYNONYM_CACHE.get(token);
    if (canonical) {
      ids.add(canonical);
    }
  }
  for (const phrase of parts.phrases) {
    const canonical = SYNONYM_CACHE.get(phrase);
    if (canonical) {
      ids.add(canonical);
    }
  }
  return ids;
};

/**
 * Check if any token pair or phrase pair from two locations are regional
 * synonyms (e.g. "ile de france" vs "paris").
 *
 * Equivalent to the previous pairwise scans (token×token, phrase×phrase,
 * phrase×token, token×phrase) because two strings are regional synonyms iff
 * they share the same canonical form in `SYNONYM_CACHE` (see
 * `collectSynonymGroupIds`). Two O(n) set constructions plus one intersection
 * replace the previous O(n·m) nested loops over tokens and phrases.
 *
 * @param parts1 - Precomputed parts of the first location
 * @param parts2 - Precomputed parts of the second location
 * @returns true if any token pair or phrase pair are synonyms
 */
const hasSynonymTokenMatch = (parts1: LocationParts, parts2: LocationParts): boolean => {
  const ids1 = collectSynonymGroupIds(parts1);
  if (ids1.size === 0) {
    return false;
  }
  const ids2 = collectSynonymGroupIds(parts2);
  for (const id of ids1) {
    if (ids2.has(id)) {
      return true;
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

  // Analyze each lightly normalized input once and reuse the tokens, phrases,
  // and metro resolution across all checks below (audit point #9).
  const lightMissionParts = analyzeLocation(lightMission);
  const lightProfileParts = analyzeLocation(lightProfile);

  // 4. Check token-based synonyms (handles multi-word cases)
  if (lightMissionParts.tokens.length > 0 && lightProfileParts.tokens.length > 0) {
    if (hasSynonymTokenMatch(lightMissionParts, lightProfileParts)) {
      return 'synonym';
    }
  }

  // 4b. Check metropolitan area proximity (nearby)
  // This handles: Nanterre → Paris, Villeurbanne → Lyon, etc.
  if (areInSameMetroArea(lightMissionParts, lightProfileParts)) {
    return 'nearby';
  }

  // 5. Full normalization for remaining exact/partial matching
  const normMission = normalizeLocation(missionLoc);
  const normProfile = normalizeLocation(profileLoc);

  // Empty after full normalization
  if (!normMission || !normProfile) {
    return 'none';
  }

  // Analyze fully normalized inputs once as well
  const normMissionParts = analyzeLocation(normMission);
  const normProfileParts = analyzeLocation(normProfile);

  // 5b. Fallback nearby check with fully normalized values
  if (areInSameMetroArea(normMissionParts, normProfileParts)) {
    return 'nearby';
  }

  // 6. Fallback nearby check with tokenized normalized values.
  // Each token's metro area is resolved once, then the two sides are
  // intersected — the previous form re-resolved both tokens of every pair.
  const profileTokenMetros = new Set<string>();
  for (const token of normProfileParts.tokens) {
    const metro = resolveTokenMetroArea(token);
    if (metro) {
      profileTokenMetros.add(metro);
    }
  }
  if (profileTokenMetros.size > 0) {
    for (const token of normMissionParts.tokens) {
      const metro = resolveTokenMetroArea(token);
      if (metro && profileTokenMetros.has(metro)) {
        return 'nearby';
      }
    }
  }

  // 7. Token-based matching with full normalization (for partial matches)
  // Handle case where tokenization produces empty arrays
  if (normMissionParts.tokens.length === 0 || normProfileParts.tokens.length === 0) {
    return 'none';
  }

  // Check for exact token match (partial because not full string match)
  if (hasTokenMatch(normMissionParts.tokens, normProfileParts.tokens)) {
    return 'partial';
  }

  return 'none';
};
