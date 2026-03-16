/**
 * Wrapper avec cache autour de db.ts
 * Drop-in replacement pour les fonctions de db.ts avec cache mémoire.
 */

import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import {
  getMissions,
  saveMissions,
  clearMissions,
  getProfile,
  saveProfile,
} from './db';
import {
  getCached,
  setCached,
  invalidateCache,
  getCacheStats,
  resetCacheStats,
  clearCache,
} from './db-cache';

// Re-export du cache pour usage avancé
export {
  getCached,
  setCached,
  invalidateCache,
  getCacheStats,
  resetCacheStats,
  clearCache,
};

// TTL configurables pour différentes données
const MISSIONS_TTL_MS = 5000; // 5s - données fréquemment mises à jour
const PROFILE_TTL_MS = 30000; // 30s - profil change peu fréquemment

/**
 * Récupère les missions avec cache.
 * Check cache first, fallback sur IndexedDB si miss ou expiré.
 */
export async function getMissionsCached(): Promise<Mission[]> {
  const cached = getCached<Mission[]>('missions');
  if (cached) {
    return cached;
  }

  const missions = await getMissions();
  setCached('missions', missions, MISSIONS_TTL_MS);
  return missions;
}

/**
 * Récupère le profil avec cache.
 * Check cache first, fallback sur IndexedDB si miss ou expiré.
 */
export async function getProfileCached(): Promise<UserProfile | null> {
  const cached = getCached<UserProfile>('profile');
  if (cached) {
    return cached;
  }

  const profile = await getProfile();
  if (profile) {
    setCached('profile', profile, PROFILE_TTL_MS);
  }
  return profile;
}

/**
 * Sauvegarde les missions et invalide le cache.
 * Assure la cohérence entre cache et persistence.
 */
export async function saveMissionsWithCacheInvalidation(missions: Mission[]): Promise<void> {
  await saveMissions(missions);
  invalidateCache('missions');
}

/**
 * Sauvegarde le profil et invalide le cache.
 * Assure la cohérence entre cache et persistence.
 */
export async function saveProfileWithCacheInvalidation(profile: UserProfile): Promise<void> {
  await saveProfile(profile);
  invalidateCache('profile');
}

/**
 * Vide les missions et invalide le cache.
 */
export async function clearMissionsWithCacheInvalidation(): Promise<void> {
  await clearMissions();
  invalidateCache('missions');
}

// Re-exports pour compatibilité drop-in
export {
  saveMissions,
  clearMissions,
  saveProfile,
};
