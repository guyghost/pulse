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

// ============================================================================
// Alarm naming convention
// ============================================================================

const PROBE_ALARM_PREFIX = 'probe:';

export function probeAlarmName(connectorId: string): string {
  return `${PROBE_ALARM_PREFIX}${connectorId}`;
}

export function isProbeAlarm(alarmName: string): boolean {
  return alarmName.startsWith(PROBE_ALARM_PREFIX);
}

export function connectorIdFromAlarm(alarmName: string): string {
  return alarmName.slice(PROBE_ALARM_PREFIX.length);
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
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Promise<void> {
  const name = probeAlarmName(connectorId);
  const delayInMinutes = thresholds.probeIntervalMs / (60 * 1000);

  try {
    // Supprimer l'ancienne alarme si elle existe (idempotence)
    await chrome.alarms.clear(name);
    // Créer une alarme one-shot (pas périodique)
    chrome.alarms.create(name, { delayInMinutes });

    if (import.meta.env.DEV) {
      console.log(
        `[ProbeScheduler] Probe scheduled for ${connectorId} in ${delayInMinutes}min`
      );
    }
  } catch {
    // Non-critical — le circuit breaker fonctionne sans l'alarme
    // (shouldAttemptProbe vérifie les timestamps, ce qui sert de fallback)
    if (import.meta.env.DEV) {
      console.warn(`[ProbeScheduler] Failed to schedule probe for ${connectorId}`);
    }
  }
}

/**
 * Annule l'alarme de sonde pour un connecteur (ex: quand il revient en `closed`).
 *
 * @param connectorId  ID du connecteur
 */
export async function cancelProbe(connectorId: string): Promise<void> {
  try {
    await chrome.alarms.clear(probeAlarmName(connectorId));

    if (import.meta.env.DEV) {
      console.log(`[ProbeScheduler] Probe cancelled for ${connectorId}`);
    }
  } catch {
    // Non-critical
  }
}

/**
 * Annule toutes les alarmes de sonde actives (ex: lors d'un reset global).
 */
export async function cancelAllProbes(): Promise<void> {
  try {
    const alarms = await chrome.alarms.getAll();
    const probeAlarms = alarms.filter((a) => isProbeAlarm(a.name));
    await Promise.all(probeAlarms.map((a) => chrome.alarms.clear(a.name)));
  } catch {
    // Non-critical
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
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Promise<void> {
  if (snapshot.circuitState === 'open') {
    await scheduleProbe(snapshot.connectorId, thresholds);
  } else {
    await cancelProbe(snapshot.connectorId);
  }
}
