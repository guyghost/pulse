/**
 * Connector Health Storage — Persistence of health snapshots in chrome.storage.local.
 *
 * Shell only: I/O, async, chrome.storage. Core never imports this module.
 */

import { z } from 'zod';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import { createInitialHealthSnapshot, DEFAULT_HEALTH_THRESHOLDS } from '../../core/types/health';

// ============================================================================
// Storage key
// ============================================================================

const STORAGE_KEY = 'connector_health_snapshots';

// ============================================================================
// Zod schema (validation of data read from storage)
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

const StrictConnectorHealthSnapshotSchema = ConnectorHealthSnapshotSchema.strict();

type StoredSnapshots = Record<string, ConnectorHealthSnapshot>;

export type ProbeHealthSnapshotsRead =
  | {
      readonly status: 'available';
      readonly source: 'absent' | 'stored';
      readonly snapshots: ReadonlyMap<string, ConnectorHealthSnapshot>;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'corrupt' | 'io_error';
    };

/** Detects chrome.storage quota errors */
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
 * Loads all snapshots from chrome.storage.local.
 * Returns an empty object when there is no data or the data is corrupt.
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
      // Silently ignore corrupt entries
    }
    return snapshots;
  } catch {
    return {};
  }
}

function parseStoredSnapshotsStrict(raw: unknown): StoredSnapshots | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const snapshots: StoredSnapshots = Object.create(null) as StoredSnapshots;
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== 'string') {
      return null;
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return null;
    }
    const parsed = StrictConnectorHealthSnapshotSchema.safeParse(descriptor.value);
    if (!parsed.success || parsed.data.connectorId !== key) {
      return null;
    }
    snapshots[key] = parsed.data;
  }

  return snapshots;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Reads a connector's health snapshot.
 * Creates and returns an initial snapshot when none exists.
 *
 * @param connectorId  Connector ID
 * @param now          Current timestamp in ms (injected by the caller)
 */
export async function getHealthSnapshot(
  connectorId: string,
  now: number
): Promise<ConnectorHealthSnapshot> {
  const all = await loadAll();
  return all[connectorId] ?? createInitialHealthSnapshot(connectorId, now);
}

/**
 * Persists an updated health snapshot.
 * On quota exceeded, retries once after pruning latencies.
 *
 * @param snapshot  Snapshot to save
 */
export async function saveHealthSnapshot(snapshot: ConnectorHealthSnapshot): Promise<void> {
  try {
    const all = await loadAll();
    all[snapshot.connectorId] = snapshot;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  } catch (err) {
    // On QUOTA_BYTES exceeded: prune latencies and retry once
    if (isQuotaError(err)) {
      try {
        const all = await loadAll();
        // Prune latencies of all snapshots to max 10 entries
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
 * Reads the snapshots of all given connectors.
 * Connectors without a snapshot receive an initial one.
 *
 * @param connectorIds  List of connector IDs
 * @param now           Current timestamp in ms
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
 * Reads the complete health proof used to reconcile probe alarms.
 *
 * Unlike the user-facing lenient reads above, this boundary never projects a
 * corrupt row or an I/O failure as a valid absence. A genuinely missing key is
 * the only case allowed to synthesize correlated initial snapshots.
 */
export async function readHealthSnapshotsForProbeReconciliation(
  connectorIds: readonly string[],
  now: number
): Promise<ProbeHealthSnapshotsRead> {
  let raw: unknown;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    raw = result[STORAGE_KEY];
  } catch {
    return { status: 'unavailable', reason: 'io_error' };
  }

  const source = raw === undefined ? 'absent' : 'stored';
  const stored = raw === undefined ? {} : parseStoredSnapshotsStrict(raw);
  if (stored === null) {
    return { status: 'unavailable', reason: 'corrupt' };
  }

  const snapshots = new Map<string, ConnectorHealthSnapshot>();
  for (const connectorId of connectorIds) {
    snapshots.set(
      connectorId,
      stored[connectorId] ?? createInitialHealthSnapshot(connectorId, now)
    );
  }

  return { status: 'available', source, snapshots };
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
 * Deletes all health snapshots (e.g. during a global reset).
 */
export async function clearAllHealthSnapshots(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // Non-critical
  }
}
