import type { UserProfile } from '../types/profile';
import { appendUniqueNormalized, withProfileDefaults } from '../profile/normalize-profile';
import type { CanonicalCandidateProfileDraft } from './types';

/**
 * Merge a canonical candidate profile draft (e.g. extracted from LinkedIn) into
 * the user's current profile, producing a complete {@link UserProfile}.
 *
 * Merge semantics:
 * - jobTitle ← draft.title (overwrite — importing LinkedIn is an explicit
 *   "use as reference" action).
 * - stack ← union of the current stack and the draft's skills, deduplicated
 *   case-insensitively while keeping the first-seen display casing.
 * - location ← the current location when it is non-empty; otherwise the first
 *   experience that carries a non-empty location; otherwise ''.
 * - All other fields (firstName, tjmMin/Max, remote, seniority, searchKeywords,
 *   scoringWeights) are carried over from the current profile via defaults.
 *
 * STRICTLY PURE: no Date, no async, no I/O, no side effects, no chrome.*.
 */
export function mergeCandidateProfileIntoUserProfile(
  current: UserProfile | null,
  draft: CanonicalCandidateProfileDraft
): UserProfile {
  const base = withProfileDefaults({ ...current });

  const stack = draft.skills.reduce<string[]>(
    (acc, skill) => appendUniqueNormalized(acc, skill.skill),
    [...(current?.stack ?? [])]
  );

  const currentLocation = current?.location ?? '';
  const draftLocation =
    draft.experiences.find((experience) => {
      const value = experience.location;
      return typeof value === 'string' && value.trim().length > 0;
    })?.location ?? '';
  const location = currentLocation.trim().length > 0 ? currentLocation : draftLocation;

  return {
    ...base,
    jobTitle: draft.title,
    stack,
    location,
  };
}
