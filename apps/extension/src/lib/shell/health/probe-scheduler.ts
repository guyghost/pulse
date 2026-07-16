/**
 * Probe Scheduler — Gestion des alarms chrome pour les probes de récupération.
 *
 * Quand un connecteur entre en état `open`, on enregistre une alarme chrome
 * qui se déclenchera après `probeIntervalMs`. L'alarme est nommée de façon
 * unique par connecteur : `probe:{connectorId}`.
 *
 * Shell only : I/O, chrome.alarms. Core n'importe jamais ce module.
 */

import type { ConnectorHealthSnapshot, HealthThresholds } from '../../core/types/health';
import { DEFAULT_HEALTH_THRESHOLDS } from '../../core/types/health';
import { INCLUDED_CONNECTOR_IDS } from '../connectors/build-config';

// ============================================================================
// Alarm naming convention
// ============================================================================

const PROBE_ALARM_PREFIX = 'probe:';
const MAX_DISCOVERED_PROBE_ALARMS_PER_RECONCILIATION = 256;

export type ProbeAlarmReconciliationErrorCode =
  'PROBE_ALARM_READBACK_MISMATCH' | 'PROBE_HEALTH_PROOF_UNAVAILABLE';

export class ProbeAlarmReconciliationError extends Error {
  constructor(
    message: string,
    readonly code: ProbeAlarmReconciliationErrorCode = 'PROBE_ALARM_READBACK_MISMATCH'
  ) {
    super(message);
    this.name = 'ProbeAlarmReconciliationError';
  }
}

const BUILD_INCLUDED_CONNECTOR_IDS = new Set<string>(INCLUDED_CONNECTOR_IDS);

export function probeAlarmName(connectorId: string): string {
  return `${PROBE_ALARM_PREFIX}${connectorId}`;
}

export function isProbeAlarm(alarmName: string): boolean {
  return alarmName.startsWith(PROBE_ALARM_PREFIX);
}

export function connectorIdFromAlarm(alarmName: string): string | null {
  if (!isProbeAlarm(alarmName)) {
    return null;
  }
  const connectorId = alarmName.slice(PROBE_ALARM_PREFIX.length);
  return connectorId.length > 0 ? connectorId : null;
}

// ============================================================================
// Schedule / Cancel
// ============================================================================

/**
 * Enregistre une alarme de sonde pour un connecteur en état `open`.
 * Idempotent : si une alarme existe déjà pour ce connecteur, elle est remplacée.
 *
 * @param connectorId  ID du connecteur
 * @param thresholds   Seuils de configuration (pour `probeIntervalMs`)
 */
export async function scheduleProbe(
  connectorId: string,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  nowMs: number = Date.now()
): Promise<void> {
  const name = probeAlarmName(connectorId);
  const expectedWhenMs = nowMs + thresholds.probeIntervalMs;

  // Supprimer l'ancienne alarme si elle existe (idempotence), puis prouver
  // localement la création one-shot exacte. Le ledger/actor durable reste un
  // contrat séparé documenté dans background-scheduling.model.md.
  await chrome.alarms.clear(name);
  await chrome.alarms.create(name, { when: expectedWhenMs });
  const readBack = await chrome.alarms.get(name);
  if (
    readBack?.name !== name ||
    readBack.scheduledTime !== expectedWhenMs ||
    readBack.periodInMinutes !== undefined
  ) {
    await chrome.alarms.clear(name).catch(() => false);
    throw new ProbeAlarmReconciliationError(
      `Probe alarm ${name} could not be verified after creation.`
    );
  }

  if (import.meta.env.DEV) {
    console.debug(`[ProbeScheduler] Probe scheduled for ${connectorId} at ${expectedWhenMs}`);
  }
}

/**
 * Annule l'alarme de sonde pour un connecteur (ex: quand il revient en `closed`).
 *
 * @param connectorId  ID du connecteur
 */
export async function cancelProbe(connectorId: string): Promise<void> {
  const name = probeAlarmName(connectorId);
  await chrome.alarms.clear(name);
  const readBack = await chrome.alarms.get(name);
  if (readBack !== undefined) {
    throw new ProbeAlarmReconciliationError(
      `Probe alarm ${name} is still present after cancellation.`
    );
  }

  if (import.meta.env.DEV) {
    console.debug(`[ProbeScheduler] Probe cancelled for ${connectorId}`);
  }
}

/**
 * Annule toutes les alarmes de sonde actives (ex: lors d'un reset global).
 */
export async function cancelAllProbes(): Promise<void> {
  try {
    const alarms = await chrome.alarms.getAll();
    const probeAlarms = alarms.filter((a) => isProbeAlarm(a.name));
    await Promise.all(
      probeAlarms.map((alarm) => {
        const connectorId = connectorIdFromAlarm(alarm.name);
        return connectorId === null
          ? chrome.alarms.clear(alarm.name).then(() => undefined)
          : cancelProbe(connectorId);
      })
    );
  } catch {
    // Non-critical
  }
}

/**
 * Converges the Chrome-local probe alarms from the last persisted health
 * snapshots. This closes the ordinary service-worker start/settings gap, but
 * deliberately does not claim the durable actor/ledger crash guarantees of the
 * full background scheduling model.
 */
export async function reconcileProbeAlarmsLocally(
  includedConnectorIds: readonly string[],
  snapshots: ReadonlyMap<string, ConnectorHealthSnapshot>,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  nowMs: number = Date.now()
): Promise<void> {
  const included = new Set(includedConnectorIds);

  // A health snapshot is authority for exactly one build-included connector.
  // Validate the complete proof before discovering or mutating any alarm so a
  // corrupt/misaligned map cannot be projected as a healthy closed circuit.
  if (snapshots.size !== included.size) {
    throw new ProbeAlarmReconciliationError(
      'Probe health proof does not cover the included connector set exactly.',
      'PROBE_HEALTH_PROOF_UNAVAILABLE'
    );
  }
  for (const connectorId of included) {
    const snapshot = snapshots.get(connectorId);
    if (
      !BUILD_INCLUDED_CONNECTOR_IDS.has(connectorId) ||
      snapshot === undefined ||
      snapshot.connectorId !== connectorId
    ) {
      throw new ProbeAlarmReconciliationError(
        `Probe health proof is unavailable for build connector ${connectorId}.`,
        'PROBE_HEALTH_PROOF_UNAVAILABLE'
      );
    }
  }

  const alarms = await chrome.alarms.getAll();
  const probeAlarms = alarms.filter((alarm) => isProbeAlarm(alarm.name));
  if (probeAlarms.length > MAX_DISCOVERED_PROBE_ALARMS_PER_RECONCILIATION) {
    throw new ProbeAlarmReconciliationError(
      'Probe alarm discovery capacity is exhausted; no partial reconciliation was applied.'
    );
  }

  for (const alarm of probeAlarms) {
    const connectorId = connectorIdFromAlarm(alarm.name);
    if (connectorId === null || !included.has(connectorId)) {
      await chrome.alarms.clear(alarm.name);
      const readBack = await chrome.alarms.get(alarm.name);
      if (readBack !== undefined) {
        throw new ProbeAlarmReconciliationError(
          `Excluded probe alarm ${alarm.name} is still present after cleanup.`
        );
      }
    }
  }

  for (const connectorId of [...included].sort()) {
    const snapshot = snapshots.get(connectorId);
    if (snapshot?.circuitState === 'open') {
      await scheduleProbe(connectorId, thresholds, nowMs);
    } else {
      await cancelProbe(connectorId);
    }
  }
}

// ============================================================================
// State sync helper
// ============================================================================

/**
 * Synchronise les alarmes de sonde avec l'état de santé d'un connecteur.
 *
 * - Si le snapshot est `open` → schedule une probe
 * - Si le snapshot est `closed` ou `half-open` → annule l'alarme
 *
 * À appeler après chaque `saveHealthSnapshot` pour maintenir la cohérence.
 *
 * @param snapshot   Snapshot mis à jour
 * @param thresholds Seuils de configuration
 */
export async function syncProbeAlarm(
  snapshot: ConnectorHealthSnapshot,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  nowMs: number = Date.now()
): Promise<void> {
  if (!BUILD_INCLUDED_CONNECTOR_IDS.has(snapshot.connectorId)) {
    throw new ProbeAlarmReconciliationError(
      `Probe health proof references connector ${snapshot.connectorId}, which is not shipped in this build.`,
      'PROBE_HEALTH_PROOF_UNAVAILABLE'
    );
  }

  if (snapshot.circuitState === 'open') {
    await scheduleProbe(snapshot.connectorId, thresholds, nowMs);
  } else {
    await cancelProbe(snapshot.connectorId);
  }
}
