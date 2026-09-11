/**
 * Scan Signal Stats — Persistance des statistiques de déduplication du dernier scan.
 *
 * Shell only : I/O, async, chrome.storage. Core n'importe jamais ce module.
 * Écrit par le service worker à la fin d'un scan (`persistPostCommitEffects`),
 * lu par le side panel pour le signal « Doublons » de la carte Santé des sources.
 * Le calcul (mois courant, fusion des compteurs) est délégué au core pur
 * `buildDedupStatsUpdate`. Voir `src/models/source-health-signals.model.md`.
 */

import { z } from 'zod';
import {
  buildDedupStatsUpdate,
  type DedupStats,
} from '../../core/connectors/source-health-signals';

// ============================================================================
// Storage key
// ============================================================================

const STORAGE_KEY = 'scan_signal_stats';

// ============================================================================
// Zod schema (validation des données lues depuis le storage)
// ============================================================================

const DedupStatsSchema = z.object({
  lastScanAt: z.number(),
  rawCount: z.number().int().min(0),
  mergedCount: z.number().int().min(0),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/),
  monthMergedCount: z.number().int().min(0),
});

// ============================================================================
// Read
// ============================================================================

/**
 * Charge les stats du dernier scan. Retourne null si absentes ou corrompues
 * (le signal « Doublons » vaut alors 0 — dégradation silencieuse prévue par le modèle).
 */
export async function getScanSignalStats(): Promise<DedupStats | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const parsed = DedupStatsSchema.safeParse(raw);
    return parsed.success ? (parsed.data as DedupStats) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Write
// ============================================================================

/**
 * Enregistre les stats de déduplication d'un scan fraîchement terminé.
 * `prev` est l'état persisté courant (getScanSignalStats), `now` la date du scan.
 * Tolérant aux pannes : une erreur de quota/IO est avalée (statistique non critique).
 */
export async function saveScanSignalStats(
  prev: DedupStats | null,
  next: { rawCount: number; mergedCount: number },
  now: Date
): Promise<void> {
  const stats = buildDedupStatsUpdate(prev, next, now);
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: stats });
  } catch {
    // Non-critical: stats de signaux
  }
}
