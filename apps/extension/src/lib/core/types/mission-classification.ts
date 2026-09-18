/**
 * Mission classification — pure domain types.
 *
 * A classification attaches a coarse category and a remote-compatibility
 * signal to a mission. Produced by the Jev decision model (TypeSafe AI)
 * through Vercel AI Gateway, it is profile-independent: the same mission
 * always yields the same classification.
 */

export const MISSION_CATEGORIES = [
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'data',
  'devops',
  'product',
  'design',
  'other',
] as const;

export type MissionCategory = (typeof MISSION_CATEGORIES)[number];

export interface MissionClassification {
  /** Coarse technology / discipline category of the mission. */
  category: MissionCategory;
  /**
   * True when the mission can plausibly be performed remotely, even when the
   * source platform does not expose a remote policy. Never overwrites the
   * scraped `remote` field — it complements it when that field is null.
   */
  remoteCompatible: boolean;
  /**
   * Overall confidence in [0, 1]: the lowest per-question outcome confidence
   * (choice distribution for the category; probability of the selected
   * outcome for the boolean). Classifications below the configured threshold
   * are discarded by the parser, never persisted.
   */
  confidence: number;
  /** Epoch milliseconds at classification time. */
  classifiedAt: number;
}
