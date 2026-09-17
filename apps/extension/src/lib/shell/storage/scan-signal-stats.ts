/**
 * Scan Signal Stats — Persistence of the last scan's deduplication statistics.
 *
 * Shell only: I/O, async, chrome.storage. Core never imports this module.
 * Written by the service worker at the end of a scan (`persistPostCommitEffects`),
 * read by the side panel for the "Doublons" signal of the Source Health card.
 * The computation (current month, counter merge) is delegated to the pure core
 * `buildDedupStatsUpdate`. See `src/models/source-health-signals.model.md`.
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
// Zod schema (validation of data read from storage)
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
 * Loads the last scan's stats. Returns null when absent or corrupt
 * (the "Doublons" signal then reads 0 — silent degradation planned by the model).
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
 * Saves the dedup stats of a freshly completed scan.
 * `prev` is the current persisted state (getScanSignalStats), `now` the scan date.
 * Fault-tolerant: a quota/IO error is swallowed (non-critical statistic).
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
