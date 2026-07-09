export type SeniorityLevel = 'junior' | 'confirmed' | 'senior';

import type { RemoteType } from './mission';

/**
 * Origin of a professional experience entry.
 * - 'linkedin': imported from a LinkedIn profile extraction.
 * - 'manual': created by hand in the CV tab.
 * - 'connector-import': ingested from a mission platform profile.
 */
export type ExperienceSource = 'linkedin' | 'manual' | 'connector-import';

/**
 * A single professional experience, persisted on {@link UserProfile.experiences}.
 *
 * Pure data: no methods, no I/O. Non-deterministic values (id, updatedAt) are
 * injected by the shell when normalizing/merging.
 */
export interface Experience {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  /** ISO month "YYYY-MM" or null when unknown. */
  startDate: string | null;
  /** ISO month "YYYY-MM" or null when {@link isCurrent} is true. */
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
  source: ExperienceSource;
  sourceExternalId: string | null;
  /** Gapless stable ordering (0 = most recent). Recomputed on every save. */
  positionIndex: number;
  /** Epoch ms of the last edit. Injected by the shell. */
  updatedAt: number;
}

/**
 * Configurable weights for mission scoring.
 * Each weight is a number 0-100 representing the portion of the total score.
 * The weights should sum to 100, but the scoring function will normalize if they don't.
 */
export interface ScoringWeights {
  stack: number;
  location: number;
  tjm: number;
  remote: number;
}

/**
 * Default scoring weights for mission relevance.
 * Stack matching is most important, followed by TJM, location, and remote type.
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  stack: 40,
  location: 20,
  tjm: 25,
  remote: 15,
};

export interface UserProfile {
  firstName: string;
  stack: string[];
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  jobTitle: string;
  /** Optional custom scoring weights. Defaults to DEFAULT_SCORING_WEIGHTS if not provided. */
  scoringWeights?: ScoringWeights;
  /** User-defined search keywords sent to connector APIs for server-side filtering */
  searchKeywords: string[];
  /**
   * Professional experiences, edited in the CV tab and pushed to LinkedIn and
   * the mission connectors. Optional for backward compatibility with stored
   * profiles; treat as `[]` when absent.
   */
  experiences?: Experience[];
}
