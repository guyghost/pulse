/**
 * Connector Health Storage — Persistence des snapshots de santé dans chrome.storage.local.
 *
 * Shell only : I/O, async, chrome.storage. Core n'importe jamais ce module.
 */

import { z } from 'zod';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import { createInitialHealthSnapshot, DEFAULT_HEALTH_THRESHOLDS } from '../../core/types/health';

// ============================================================================
// Storage key
// ============================================================================

const STORAGE_KEY = 'connector_health_snapshots';

// ============================================================================
// Zod schema (validation des données lues depuis le storage)
// ============================================================================

const CircuitStateSchema = z.enum(['closed', 'open', 'half-open']);

const ConnectorHealthSnapshotSchema = z.object({
  connectorId: z.string(),
  circuitState: CircuitStateSchema,
  consecutiveFailures: z.number().int().min(0),
  totalFailures: z.number().int().min(0),
  totalSuccesses: z.number().int().min(0),
  lastSuccessAt: z.number().nullable(),
  lastFailureAt: z.number().nullable(),
  lastStateChangeAt: z.number(),
  recentLatenciesMs: z.array(z.number()).max(DEFAULT_HEALTH_THRESHOLDS.latencyWindowSize * 2),
});

type StoredSnapshots = Record<string, ConnectorHealthSnapshot>;

/** Détecte les erreurs de quota chrome.storage */
function isQuotaError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('QUOTA_BYTES') || err.message.includes('quota');
  }
  return false;
}

// ============================================================================
// Read
// ============================================================================

/**
 * Charge tous les snapshots depuis chrome.storage.local.
 * Retourne un objet vide si aucune donnée ou données corrompues.
 */
async function loadAll(): Promise<StoredSnapshots> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const snapshots: StoredSnapshots = {};
    for (const [id, value] of Object.entries(raw)) {
      const parsed = ConnectorHealthSnapshotSchema.safeParse(value);
      if (parsed.success) {
        snapshots[id] = parsed.data as ConnectorHealthSnapshot;
      }
      // On ignore silencieusement les entrées corrompues
    }
    return snapshots;
  } catch {
    return {};
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Lit le health snapshot d'un connecteur.
 * Crée et retourne un snapshot initial si aucune donnée n'existe.
 *
 * @param connectorId  ID du connecteur
 * @param now          Timestamp courant en ms (injecté depuis le caller)
 */
export async function getHealthSnapshot(
  connectorId: string,
  now: number
): Promise<ConnectorHealthSnapshot> {
  const all = await loadAll();
  return all[connectorId] ?? createInitialHealthSnapshot(connectorId, now);
}

/**
 * Persiste un health snapshot mis à jour.
 * En cas de quota dépassé, tente de réessayer après avoir élagué les latences.
 *
 * @param snapshot  Snapshot à sauvegarder
 */
export async function saveHealthSnapshot(snapshot: ConnectorHealthSnapshot): Promise<void> {
  try {
    const all = await loadAll();
    all[snapshot.connectorId] = snapshot;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  } catch (err) {
    // En cas de QUOTA_BYTES dépassé : élaguer les latences et réessayer une fois
    if (isQuotaError(err)) {
      try {
        const all = await loadAll();
        // Élaguer les latences de tous les snapshots à max 10 entrées
        for (const [id, snap] of Object.entries(all)) {
          all[id] = { ...snap, recentLatenciesMs: snap.recentLatenciesMs.slice(-10) };
        }
        all[snapshot.connectorId] = {
          ...snapshot,
          recentLatenciesMs: snapshot.recentLatenciesMs.slice(-10),
        };
        await chrome.storage.local.set({ [STORAGE_KEY]: all });
        return;
      } catch {
        // Échec du fallback — non-critique, on ignore
      }
    }
    if (import.meta.env.DEV) {
      console.warn('[HealthStorage] Failed to save snapshot for', snapshot.connectorId, err);
    }
  }
}

/**
 * Lit les snapshots de tous les connecteurs donnés.
 * Les connecteurs sans snapshot reçoivent un snapshot initial.
 *
 * @param connectorIds  Liste des IDs de connecteurs
 * @param now           Timestamp courant en ms
 */
export async function getAllHealthSnapshots(
  connectorIds: string[],
  now: number
): Promise<Map<string, ConnectorHealthSnapshot>> {
  const all = await loadAll();
  const result = new Map<string, ConnectorHealthSnapshot>();
  for (const id of connectorIds) {
    result.set(id, all[id] ?? createInitialHealthSnapshot(id, now));
  }
  return result;
}

/**
 * Supprime le snapshot d'un connecteur (reset de l'historique).
 */
export async function resetHealthSnapshot(connectorId: string): Promise<void> {
  try {
    const all = await loadAll();
    delete all[connectorId];
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  } catch {
    // Non-critical
  }
}

/**
 * Supprime tous les snapshots de santé (ex: lors d'un reset global).
 */
export async function clearAllHealthSnapshots(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // Non-critical
  }
}
