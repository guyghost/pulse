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
  /** Minimum desired daily rate (TJM) */
  tjmMin: number | null;
  /** Maximum desired daily rate (TJM) */
  tjmMax: number | null;
  /** Last sync timestamp for incremental scanning (only fetch missions newer than this) */
  lastSync: Date | null;
}

/**
 * Build a ConnectorSearchContext from user profile and last sync date.
 * PURE FUNCTION — no I/O, no async, no side effects.
 *
 * Strategy:
 * - query: derived from the unified `keywords` list (same terms used for local
 *   scoring vs `mission.stack`). jobTitle is NOT used as fallback because it's
 *   too restrictive for API keyword search (e.g., "Développeur Fullstack"
 *   returns 0 results on most platforms). Local scoring (scoreMission) handles
 *   relevance matching much better.
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
  // Build the free-text query from the unified keywords list. These are the
  // same terms scored locally against mission.stack; here they drive the
  // server-side search. Do NOT fallback to jobTitle — it's too restrictive
  // (e.g., "Développeur Fullstack Senior" matches almost nothing on
  // Free-Work/Hiway/Collective). Relevance is refined locally by scoreMission().
  const query = profile.keywords
    .map((keyword) => keyword.trim().replace(/\s+/g, ' '))
    .filter((keyword) => keyword.length > 0)
    .join(' ');

  return {
    query,
    skills: [], // Skills handled by local scoring, not server-side filtering
    location: profile.location || null,
    remote: profile.remote || null,
    tjmMin: profile.tjmMin > 0 ? profile.tjmMin : null,
    tjmMax: profile.tjmMax > 0 ? profile.tjmMax : null,
    lastSync,
  };
};
