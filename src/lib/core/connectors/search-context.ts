import type { UserProfile } from '../types/profile';
import type { RemoteType } from '../types/mission';

/**
 * Structured search context built from user profile.
 * Each connector interprets these fields according to its API capabilities.
 * This is a PURE value object — no I/O, no async.
 */
export interface ConnectorSearchContext {
  /** Main search text (e.g., "React Developer" or "Développeur Frontend") */
  query: string;
  /** Skills/technologies for API-side filtering */
  skills: string[];
  /** User location for location-based filtering */
  location: string | null;
  /** Remote preference */
  remote: RemoteType | 'any' | null;
  /** Last sync timestamp for incremental scanning (only fetch missions newer than this) */
  lastSync: Date | null;
}

/**
 * Build a ConnectorSearchContext from user profile and last sync date.
 * PURE FUNCTION — no I/O, no async, no side effects.
 *
 * Strategy:
 * - query: derived from searchKeywords (if any), fallback to jobTitle
 * - skills: EMPTY — skills are NOT sent as server-side filters because:
 *   1. APIs use AND logic (each additional skill further narrows results)
 *   2. Skill names don't match across platforms (e.g. "React.js" vs "React" vs "ReactJS")
 *   3. Local scoring (scoreMission) handles skill matching much better with fuzzy logic
 * - location: from profile.location
 * - remote: from profile.remote
 * - lastSync: passed as parameter (from Shell)
 */
export const buildSearchContext = (
  profile: UserProfile,
  lastSync: Date | null
): ConnectorSearchContext => {
  // Build query: prefer searchKeywords, fallback to jobTitle
  let query = '';
  if (profile.searchKeywords.length > 0) {
    query = profile.searchKeywords.join(' ');
  } else if (profile.jobTitle) {
    query = profile.jobTitle;
  }

  return {
    query: query.trim(),
    skills: [], // Skills handled by local scoring, not server-side filtering
    location: profile.location || null,
    remote: profile.remote || null,
    lastSync,
  };
};
