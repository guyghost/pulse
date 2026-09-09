/**
 * P0-A1 (docs/plans/2026-09-07-activation-first-scan-p0.md) — filet de
 * sécurité « never block first value » : un profil durable doit exister
 * avant tout premier scan, y compris sur le chemin SKIP/partiel où la
 * machine n'émet pas d'effet PERSIST_PROFILE.
 *
 * Shell (I/O injectées, testable sans mocks de chrome.*) : le core décide
 * (isDefaultProfile / mergeDraftOntoDefault), cette fonction orchestre.
 * Un échec de persistance n'annule jamais le scan — il est signalé et la
 * bannière « profil à compléter » (A2) prend le relais côté feed.
 */

import {
  createDefaultProfile,
  isDefaultProfile,
  mergeDraftOntoDefault,
  type ProfileDraftOverlay,
} from '$lib/core/profile/defaults';
import type { UserProfile } from '$lib/core/types/profile';

export interface EnsureDurableProfileDeps {
  getProfile: () => Promise<UserProfile | null>;
  saveProfile: (profile: UserProfile) => Promise<void>;
  /** Draft courant de la machine onboarding (champs non vides gagnent). */
  getDraft: () => ProfileDraftOverlay;
  warn?: (message: string, err: unknown) => void;
}

/** Persiste un profil durable avant scan si nécessaire. true = écrit effectué. */
export async function ensureDurableProfileBeforeScan(
  deps: EnsureDurableProfileDeps
): Promise<boolean> {
  const { getProfile, saveProfile, getDraft, warn = () => {} } = deps;
  try {
    const existing = await getProfile();
    if (existing && !isDefaultProfile(existing)) {
      // Profil durable déjà en place (wizard complété, retour utilisateur…).
      return false;
    }
    const base = existing ?? createDefaultProfile();
    await saveProfile(mergeDraftOntoDefault(getDraft(), base));
    return true;
  } catch (err) {
    warn('Persistance du profil par défaut avant scan échouée (non bloquant).', err);
    return false;
  }
}
