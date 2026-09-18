/**
 * Error analytics module - Shell
 *
 * In-memory ring buffer (max 50 entries) + persistence in chrome.storage.local.
 * No external service: all data stays local (privacy-first).
 */

import type { AppError } from '$lib/core/errors';

// ============================================================================
// Types
// ============================================================================

export interface ErrorLogEntry {
  type: string;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  connectorId?: string;
}

export interface ErrorSummary {
  total: number;
  byType: Record<string, number>;
  last24h: number;
}

// ============================================================================
// In-memory ring buffer
// ============================================================================

const MAX_BUFFER_SIZE = 50;
const PERSIST_EVERY = 10;
const STORAGE_KEY = 'errorLog';

let buffer: ErrorLogEntry[] = [];
let recordsSinceLastPersist = 0;

// ============================================================================
// API publique
// ============================================================================

/**
 * Enregistre une erreur dans le ring buffer.
 * Auto-persist dans chrome.storage.local toutes les 10 erreurs.
 */
export function recordError(error: AppError): void {
  const entry: ErrorLogEntry = {
    type: error.type,
    message: error.message,
    timestamp: error.timestamp,
    context: error.context,
    ...(error.type === 'connector' ? { connectorId: error.connectorId } : {}),
  };

  buffer.push(entry);

  // Eviction ring buffer : on garde uniquement les MAX_BUFFER_SIZE derniers
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
  }

  recordsSinceLastPersist++;

  if (recordsSinceLastPersist >= PERSIST_EVERY) {
    recordsSinceLastPersist = 0;
    // Fire-and-forget, the caller is never blocked
    persistErrors().catch(() => {
      // Silent: avoid infinite error loops
    });
  }
}

/** Persists the buffer to chrome.storage.local */
export async function persistErrors(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: buffer });
}

/** Retrieves the persisted error log */
export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ErrorLogEntry[] | undefined) ?? [];
}

/** Clears the persisted error log and the in-memory buffer */
export async function clearErrorLog(): Promise<void> {
  buffer = [];
  recordsSinceLastPersist = 0;
  await chrome.storage.local.remove(STORAGE_KEY);
}

/** Returns a summary of in-memory errors */
export function getErrorSummary(): ErrorSummary {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const byType: Record<string, number> = {};
  let last24h = 0;

  for (const entry of buffer) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    if (now - entry.timestamp <= oneDayMs) {
      last24h++;
    }
  }

  return {
    total: buffer.length,
    byType,
    last24h,
  };
}

// ============================================================================
// Helpers (tests)
// ============================================================================

/** Returns a copy of the in-memory buffer (useful for tests) */
export function _getBuffer(): readonly ErrorLogEntry[] {
  return [...buffer];
}

/** Resets the buffer (useful for tests) */
export function _resetBuffer(): void {
  buffer = [];
  recordsSinceLastPersist = 0;
}
