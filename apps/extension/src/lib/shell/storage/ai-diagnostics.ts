/**
 * AI diagnostics persistence — chrome.storage.local, bounded window.
 *
 * Shell only: I/O, async. Pure pruning/aggregation lives in
 * `core/metrics/ai-diagnostics.ts`. Mirrors the scan-signal-stats pattern:
 * a single storage key, Zod validation on read, silent degradation on error.
 */

import { z } from 'zod';
import {
  buildAiDiagnosticsUpdate,
  type AiScanDiagnosticsEntry,
} from '../../core/metrics/ai-diagnostics';

const STORAGE_KEY = 'ai_diagnostics';

const EntrySchema = z.object({
  scanAt: z.number().int().min(0),
  candidates: z.number().int().min(0),
  classified: z.number().int().min(0),
  rejectedLowConfidence: z.number().int().min(0),
  failures: z.number().int().min(0),
  evaluations: z.number().int().min(0),
  averageConfidence: z.number().min(0).max(1).nullable(),
});

const AiDiagnosticsSchema = z.array(EntrySchema).max(200);

/**
 * Load the retained diagnostics window. Corrupt or invalid storage content
 * degrades silently to an empty window (display-only surface).
 */
export async function getAiDiagnostics(): Promise<AiScanDiagnosticsEntry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (!Array.isArray(raw)) {
      return [];
    }
    const parsed = AiDiagnosticsSchema.safeParse(raw);
    return parsed.success ? (parsed.data as AiScanDiagnosticsEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Append one scan entry (pure pruning happens in the core) and persist the
 * window. Fault-tolerant: quota/IO errors are swallowed.
 */
export async function appendAiDiagnosticsEntry(entry: AiScanDiagnosticsEntry): Promise<void> {
  try {
    const prev = await getAiDiagnostics();
    const next = buildAiDiagnosticsUpdate(prev, entry);
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch {
    // Non-critical: diagnostics surface.
  }
}

/** Remove all retained entries (local data reset support). */
export async function clearAiDiagnostics(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // Non-critical: diagnostics surface.
  }
}
