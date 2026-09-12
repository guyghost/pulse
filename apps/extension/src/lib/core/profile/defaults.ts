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
  keywords: [],
  tjmMin: 0,
  tjmMax: null,
  location: '',
  remote: 'any',
  seniority: 'senior',
  jobTitle: '',
  experiences: [],
  availability: null,
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
    keywords: [...DEFAULT_PROFILE.keywords],
    experiences: [],
    availability: null,
    scoringWeights: { ...DEFAULT_PROFILE.scoringWeights },
  };
}

export function isDefaultProfile(profile: UserProfile): boolean {
  return (
    profile.firstName === DEFAULT_PROFILE.firstName &&
    profile.keywords.length === 0 &&
    profile.tjmMin === DEFAULT_PROFILE.tjmMin &&
    profile.tjmMax === DEFAULT_PROFILE.tjmMax &&
    profile.location === DEFAULT_PROFILE.location &&
    profile.remote === DEFAULT_PROFILE.remote &&
    profile.seniority === DEFAULT_PROFILE.seniority &&
    profile.jobTitle === DEFAULT_PROFILE.jobTitle &&
    (profile.experiences ?? []).length === 0 &&
    (profile.scoringWeights?.stack ?? 0) === DEFAULT_PROFILE.scoringWeights.stack &&
    (profile.scoringWeights?.location ?? 0) === DEFAULT_PROFILE.scoringWeights.location &&
    (profile.scoringWeights?.tjm ?? 0) === DEFAULT_PROFILE.scoringWeights.tjm &&
    (profile.scoringWeights?.remote ?? 0) === DEFAULT_PROFILE.scoringWeights.remote
  );
}

/**
 * Champs de draft pris en compte par {@link mergeDraftOntoDefault}.
 * Structurellement compatible avec `OnboardingProfileDraft` (models/)
 * sans importer la couche models depuis le core.
 */
export interface ProfileDraftOverlay {
  firstName?: string;
  jobTitle?: string;
  location?: string;
  remote?: UserProfile['remote'];
  keywords?: readonly string[];
  tjmMin?: number;
  tjmMax?: number | null;
}

function nonEmpty(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : '';
}

/**
 * P0-A1 (docs/plans/2026-09-07-activation-first-scan-p0.md): overlay of
 * non-empty draft fields onto a base profile (existing or default).
 * The base always wins: an empty draft never degrades a durable profile.
 * Pure — zero I/O, testable without mocks.
 */
export function mergeDraftOntoDefault(draft: ProfileDraftOverlay, base: UserProfile): UserProfile {
  const firstName = nonEmpty(draft.firstName);
  const jobTitle = nonEmpty(draft.jobTitle);
  const location = nonEmpty(draft.location);
  const keywords = draft.keywords ?? [];
  const tjmMin = typeof draft.tjmMin === 'number' && draft.tjmMin > 0 ? draft.tjmMin : 0;
  const tjmMax = draft.tjmMax ?? null;
  const remote = draft.remote && draft.remote !== 'any' ? draft.remote : null;

  return {
    ...base,
    firstName: firstName || base.firstName,
    jobTitle: jobTitle || base.jobTitle,
    location: location || base.location,
    keywords: keywords.length > 0 ? [...keywords] : [...(base.keywords ?? [])],
    tjmMin: tjmMin > 0 ? tjmMin : base.tjmMin,
    tjmMax: tjmMax !== null ? tjmMax : (base.tjmMax ?? null),
    remote: remote ?? base.remote,
  };
}
