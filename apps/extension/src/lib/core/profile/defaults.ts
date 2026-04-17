/**
 * Default profile for zero-config first scan.
 *
 * Used when no user profile exists yet (fresh install).
 * Deliberately permissive: no keyword filters, broad TJM range,
 * any remote type, any location — maximises mission coverage.
 *
 * Core rule: pure function, zero I/O.
 */

import type { UserProfile } from '../types/profile';

const DEFAULT_PROFILE = {
  firstName: '',
  stack: [],
  tjmMin: 0,
  tjmMax: 9999,
  location: '',
  remote: 'any',
  seniority: 'senior',
  jobTitle: '',
  searchKeywords: [],
  scoringWeights: {
    stack: 0,
    location: 10,
    tjm: 20,
    remote: 10,
  },
} satisfies UserProfile;

/**
 * Creates a permissive default profile for the first scan.
 * Results will be broad and unfiltered — the user refines later.
 */
export function createDefaultProfile(): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    stack: [...DEFAULT_PROFILE.stack],
    searchKeywords: [...DEFAULT_PROFILE.searchKeywords],
    scoringWeights: { ...DEFAULT_PROFILE.scoringWeights },
  };
}

export function isDefaultProfile(profile: UserProfile): boolean {
  return (
    profile.firstName === DEFAULT_PROFILE.firstName &&
    profile.stack.length === 0 &&
    profile.tjmMin === DEFAULT_PROFILE.tjmMin &&
    profile.tjmMax === DEFAULT_PROFILE.tjmMax &&
    profile.location === DEFAULT_PROFILE.location &&
    profile.remote === DEFAULT_PROFILE.remote &&
    profile.seniority === DEFAULT_PROFILE.seniority &&
    profile.jobTitle === DEFAULT_PROFILE.jobTitle &&
    profile.searchKeywords.length === 0 &&
    (profile.scoringWeights?.stack ?? 0) === DEFAULT_PROFILE.scoringWeights.stack &&
    (profile.scoringWeights?.location ?? 0) === DEFAULT_PROFILE.scoringWeights.location &&
    (profile.scoringWeights?.tjm ?? 0) === DEFAULT_PROFILE.scoringWeights.tjm &&
    (profile.scoringWeights?.remote ?? 0) === DEFAULT_PROFILE.scoringWeights.remote
  );
}
