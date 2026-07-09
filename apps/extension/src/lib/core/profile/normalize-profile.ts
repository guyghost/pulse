import type { UserProfile } from '../types/profile';

export interface ProfileDraftInput {
  firstName?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  remote?: UserProfile['remote'] | null;
  seniority?: UserProfile['seniority'] | null;
  tjmMin?: number | string | null;
  tjmMax?: number | string | null;
  keywords?: readonly string[] | null;
  keywordInput?: string | null;
  scoringWeights?: UserProfile['scoringWeights'];
}

export interface NormalizeProfileResult {
  ok: boolean;
  profile?: UserProfile;
  error?: string;
}

export const PROFILE_TJM_RANGE_ERROR = 'Le TJM maximum doit être supérieur ou égal au TJM minimum';

export const normalizeTextInput = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, ' ');

export const normalizeDailyRate = (value: number | string | null | undefined): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.round(numeric);
};

export function appendUniqueNormalized(
  items: readonly string[] | null | undefined,
  pendingItem?: string | null
): string[] {
  const normalizedItems = (items ?? []).map(normalizeTextInput).filter(Boolean);
  const normalizedPending = normalizeTextInput(pendingItem);
  const nextItems = normalizedPending ? [...normalizedItems, normalizedPending] : normalizedItems;
  // Dedupe case-insensitively (so "React" and "react" collapse) while keeping
  // the first-seen display casing. Mirrors the LinkedIn normalizer's behavior.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of nextItems) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

export const withProfileDefaults = (profile: Partial<UserProfile>): UserProfile => ({
  firstName: profile.firstName ?? '',
  keywords: [...(profile.keywords ?? [])],
  tjmMin: profile.tjmMin ?? 0,
  tjmMax: profile.tjmMax ?? 0,
  location: profile.location ?? '',
  remote: profile.remote ?? 'any',
  seniority: profile.seniority ?? 'senior',
  jobTitle: profile.jobTitle ?? '',
  scoringWeights: profile.scoringWeights,
});

export function normalizeProfileDraft(input: ProfileDraftInput): NormalizeProfileResult {
  const tjmMin = normalizeDailyRate(input.tjmMin);
  const tjmMax = normalizeDailyRate(input.tjmMax);

  if (tjmMax > 0 && tjmMin > tjmMax) {
    return { ok: false, error: PROFILE_TJM_RANGE_ERROR };
  }

  return {
    ok: true,
    profile: withProfileDefaults({
      firstName: normalizeTextInput(input.firstName),
      jobTitle: normalizeTextInput(input.jobTitle),
      location: normalizeTextInput(input.location),
      remote: input.remote ?? 'any',
      seniority: input.seniority ?? 'senior',
      tjmMin,
      tjmMax,
      keywords: appendUniqueNormalized(input.keywords, input.keywordInput),
      scoringWeights: input.scoringWeights,
    }),
  };
}
