/**
 * Module d'analytics d'erreurs - Shell
 *
 * Ring buffer en mémoire (max 50 entrées) + persistance dans chrome.storage.local.
 * Aucun service externe : toutes les données restent en local (privacy-first).
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
// Ring buffer en mémoire
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
    // Fire-and-forget, on ne bloque pas l'appelant
    persistErrors().catch(() => {
      // Silencieux : éviter les erreurs infinies
    });
  }
}

/** Persiste le buffer dans chrome.storage.local */
export async function persistErrors(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: buffer });
}

/** Récupère le log d'erreurs persisté */
export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ErrorLogEntry[] | undefined) ?? [];
}

/** Efface le log d'erreurs persisté et le buffer en mémoire */
export async function clearErrorLog(): Promise<void> {
  buffer = [];
  recordsSinceLastPersist = 0;
  await chrome.storage.local.remove(STORAGE_KEY);
}

/** Retourne un résumé des erreurs en mémoire */
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

/** Retourne une copie du buffer en mémoire (utile pour les tests) */
export function _getBuffer(): readonly ErrorLogEntry[] {
  return [...buffer];
}

/** Réinitialise le buffer (utile pour les tests) */
export function _resetBuffer(): void {
  buffer = [];
  recordsSinceLastPersist = 0;
}
