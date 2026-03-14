import type { SeniorityLevel } from './tjm';
import type { RemoteType } from './mission';

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
}
