export type SeniorityLevel = 'junior' | 'confirmed' | 'senior';

import type { RemoteType } from './mission';
import type { Availability } from './availability';

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
  employmentType: string | null;
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
  /**
   * Unified keyword list — feeds BOTH local scoring (matched against
   * `mission.stack`) and the connector API free-text `query`. Replaces the
   * former split between `stack` (scoring) and `searchKeywords` (query).
   * See `models/keywords-unification.model.md`.
   */
  keywords: string[];
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  jobTitle: string;
  /** Optional custom scoring weights. Defaults to DEFAULT_SCORING_WEIGHTS if not provided. */
  scoringWeights?: ScoringWeights;
  /**
   * Professional experiences, edited in the CV tab and pushed to LinkedIn and
   * the mission connectors. The schema's `.default([])` and
   * {@link withProfileDefaults} guarantee this is always present on parsed or
   * constructed profiles; legacy stored records without it are normalized to
   * `[]` by the migration registry and profile preprocessor.
   */
  experiences: Experience[];
  /**
   * Freelancer availability, edited in the Suivi tab and pushed to the mission
   * connectors. `null` = never set. The schema's `.default(null)` and
   * {@link withProfileDefaults} guarantee this is always present on parsed or
   * constructed profiles; legacy stored records without it are normalized to
   * `null` on read by `UserProfileSchema`. See
   * `models/availability-sync.model.md`.
   */
  availability: Availability | null;
}
