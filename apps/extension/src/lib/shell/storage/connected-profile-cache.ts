import type { UserProfile } from '../../core/types/profile';
import { UserProfileSchema } from '../../core/types/schemas';

const CONNECTED_PROFILE_CACHE_KEY = 'missionpulse.connectedSync.candidateProfile.localCopy';

export async function saveConnectedCandidateProfileCache(profile: UserProfile): Promise<void> {
  const parsed = UserProfileSchema.parse(profile);
  await chrome.storage.local.set({ [CONNECTED_PROFILE_CACHE_KEY]: parsed });
}

export async function getConnectedCandidateProfileCache(): Promise<UserProfile | null> {
  const stored = await chrome.storage.local.get(CONNECTED_PROFILE_CACHE_KEY);
  const result = UserProfileSchema.safeParse(stored[CONNECTED_PROFILE_CACHE_KEY]);
  return result.success ? result.data : null;
}

export async function clearConnectedCandidateProfileCache(): Promise<void> {
  await chrome.storage.local.remove(CONNECTED_PROFILE_CACHE_KEY);
}
