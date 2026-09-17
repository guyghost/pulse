/**
 * P0-A1 (docs/plans/2026-09-07-activation-first-scan-p0.md) — "never block
 * first value" safety net: a durable profile must exist before any first
 * scan, including on the SKIP/partial path where the machine doesn't emit a
 * PERSIST_PROFILE effect.
 *
 * Shell (injected I/O, testable without chrome.* mocks): the core decides
 * (isDefaultProfile / mergeDraftOntoDefault), this function orchestrates.
 * A persistence failure never cancels the scan — it is reported and the
 * "profile to complete" banner (A2) takes over on the feed side.
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

/** Persists a durable profile before scan if needed. true = write performed. */
export async function ensureDurableProfileBeforeScan(
  deps: EnsureDurableProfileDeps
): Promise<boolean> {
  const { getProfile, saveProfile, getDraft, warn = () => {} } = deps;
  try {
    const existing = await getProfile();
    if (existing && !isDefaultProfile(existing)) {
      // Durable profile already in place (completed wizard, returning user…).
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
