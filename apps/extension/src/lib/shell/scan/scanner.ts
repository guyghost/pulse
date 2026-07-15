import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { AppError } from '../../core/errors/app-error';
import { buildSearchContext } from '../../core/connectors/search-context';
import { getConnectors, getConnector } from '../connectors/index';
import { getSettings } from '../storage/chrome-storage';
import { getProfile } from '../storage/db';
import {
  deduplicateMissionsDetailed,
  type MissionDuplicateRelation,
} from '../../core/scoring/dedup';
import { filterSalariedMissions } from '../../core/scoring/contract-filter';
import { filterStaleMissions } from '../../core/scoring/mission-freshness';
import { scoreMission } from '../../core/scoring/relevance';
import { computeFinalBreakdown, buildScoreBreakdown } from '../../core/scoring/final-score';
import { createDefaultProfile, isDefaultProfile } from '../../core/profile/defaults';
import { setScanState } from '../storage/session-storage';
import { scoreMissionsSemantic } from '../ai/semantic-scorer';
import { metricsCollector } from '../metrics/collector';
import { calculateDedupRatio } from '../../core/metrics/types';
import type { ScanMetrics } from '../../core/metrics/types';
import { isOnline } from '../utils/connection-monitor';
import { trackParserHealth } from './parser-health';
import { runWithCircuitBreaker } from '../health/circuit-breaker-runner';
import { syncProbeAlarm } from '../health/probe-scheduler';

/** Mutex pour empêcher les scans concurrents */
let scanInProgress = false;

/**
 * Retourne true si un scan est actuellement en cours.
 */
export function isScanRunning(): boolean {
  return scanInProgress;
}

/**
 * Erreur de scan avec code typé
 */
export class ScanError extends Error {
  constructor(
    message: string,
    public readonly code: 'OFFLINE' | 'NETWORK_ERROR' | 'CANCELLED' | 'MUTEX' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

function throwIfScanCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ScanError('Scan annulé.', 'CANCELLED');
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export interface ScanResult {
  missions: Mission[];
  sourceMissions: Mission[];
  duplicateRelations: MissionDuplicateRelation[];
  errors: { connectorId: string; message: string }[];
}

export interface ScanProgressInfo {
  current: number;
  total: number;
  connectorName: string;
}

/**
 * Progression détaillée d'un connecteur individuel pendant le scan.
 * Utilisé pour les messages bridge SCAN_PROGRESS.
 */
export interface ConnectorScanState {
  connectorId: string;
  connectorName: string;
  state: 'pending' | 'detecting' | 'fetching' | 'retrying' | 'done' | 'error';
  missionsCount: number;
  error: AppError | null;
  retryCount: number;
}

/**
 * Callback de progression détaillé avec état par connecteur.
 */
export type DetailedProgressCallback = (info: {
  phase: 'connecting' | 'scanning' | 'post-processing' | 'done';
  current: number;
  total: number;
  connectorStates: ConnectorScanState[];
}) => void;

export type ConnectorResultCallback = (info: {
  connectorId: string;
  connectorName: string;
  missions: Mission[];
}) => void;

export interface ScanOptions {
  /** Délai entre les pages d'un même connecteur en ms (défaut: 500) */
  pageDelayMs?: number;
  /** Callback de progression détaillé (pour bridge SCAN_PROGRESS) */
  onDetailedProgress?: DetailedProgressCallback;
  /** Callback appelé quand un connecteur réussit, avant le résultat final global */
  onConnectorResult?: ConnectorResultCallback;
  /** Override explicite du profil utilisé pour le scan */
  profileOverride?: UserProfile;
}

export async function runScan(
  signal?: AbortSignal,
  onProgress?: (info: ScanProgressInfo) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  throwIfScanCancelled(signal);

  // Mutex : empêcher les scans concurrents
  if (scanInProgress) {
    throw new ScanError('Un scan est déjà en cours. Veuillez patienter.', 'MUTEX');
  }
  scanInProgress = true;

  try {
    const result = await _runScanInternal(signal, onProgress, options);
    throwIfScanCancelled(signal);
    return result;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new ScanError('Scan annulé.', 'CANCELLED');
    }
    throw error;
  } finally {
    scanInProgress = false;
  }
}

async function _runScanInternal(
  signal?: AbortSignal,
  onProgress?: (info: ScanProgressInfo) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  throwIfScanCancelled(signal);
  const scanStartTime = performance.now();
  const detailedProgress = options?.onDetailedProgress;
  const connectorStates: ConnectorScanState[] = [];

  function emitDetailed(
    phase: 'connecting' | 'scanning' | 'post-processing' | 'done',
    current = 0,
    total = 0
  ) {
    detailedProgress?.({ phase, current, total, connectorStates: [...connectorStates] });
    throwIfScanCancelled(signal);
  }

  // Vérifier la connexion avant de scanner
  if (!isOnline()) {
    throw new ScanError(
      'Aucune connexion internet. Le scan sera automatiquement relancé quand la connexion reviendra.',
      'OFFLINE'
    );
  }

  const settings = await getSettings();
  throwIfScanCancelled(signal);
  const enabledIds = settings.enabledConnectors;
  const errors: ScanResult['errors'] = [];

  try {
    await setScanState('scanning');
  } catch {
    /* Non-critical: scan state is UI-only */
  }
  throwIfScanCancelled(signal);

  if (enabledIds.length === 0) {
    try {
      await setScanState('idle');
    } catch {
      /* Non-critical: scan state is UI-only */
    }
    return {
      missions: [],
      sourceMissions: [],
      duplicateRelations: [],
      errors: [{ connectorId: '*', message: 'Aucun connecteur actif' }],
    };
  }

  // Validate connector IDs and report unknown ones as errors
  const validConnectorIds: string[] = [];
  for (const id of enabledIds) {
    const connector = await getConnector(id);
    throwIfScanCancelled(signal);
    if (!connector) {
      errors.push({ connectorId: id, message: 'Connecteur introuvable' });
    } else {
      validConnectorIds.push(id);
    }
  }

  throwIfScanCancelled(signal);

  // Load all connectors in parallel (they're lazy-loaded, so this loads only enabled ones)
  const connectors = await getConnectors(validConnectorIds);
  throwIfScanCancelled(signal);

  // Check for connectors that failed to load
  const loadedIds = new Set(connectors.map((c) => c.id));
  for (const id of validConnectorIds) {
    if (!loadedIds.has(id)) {
      errors.push({ connectorId: id, message: 'Échec du chargement du connecteur' });
    }
  }

  // Initialiser les états par connecteur pour le progress détaillé
  for (const connector of connectors) {
    connectorStates.push({
      connectorId: connector.id,
      connectorName: connector.name,
      state: 'pending',
      missionsCount: 0,
      error: null,
      retryCount: 0,
    });
  }
  emitDetailed('connecting', 0, connectors.length);

  throwIfScanCancelled(signal);

  // Load profile early for connector search filtering + scoring
  let profile = options?.profileOverride ?? null;
  if (!profile) {
    try {
      profile = await getProfile();
      throwIfScanCancelled(signal);
    } catch {
      // No saved profile available
    }
  }
  profile ??= createDefaultProfile();
  const scanProfile = profile;
  const usingDefaultProfile = isDefaultProfile(scanProfile);

  function buildDeterministicMissions(rawMissions: Mission[], now: Date): Mission[] {
    const freelanceOnly = filterSalariedMissions(rawMissions);
    const freshOnly = filterStaleMissions(freelanceOnly, now);

    return freshOnly.map((mission) => {
      const score = scoreMission(mission, scanProfile, now);
      return {
        ...mission,
        scoreBreakdown: buildScoreBreakdown(score.total, score.breakdown),
        score: score.total,
      };
    });
  }

  // Build base search context from profile (lastSync is always null — see comment below)
  // Keep connector fetching broad for the default profile.
  const baseSearchContext = usingDefaultProfile ? null : buildSearchContext(scanProfile, null);

  // Note: No connector uses server-side lastSync filtering anymore. This avoids the
  // split-brain bug where lastSync (chrome.storage.local) becomes stale when IndexedDB
  // is cleared separately, causing connectors to return 0 results permanently.
  // All connectors now always fetch latest N missions and rely on local dedup.

  // Fetch connectors in parallel with concurrency pool (max 3 simultaneous)
  // This reduces total scan time significantly compared to sequential fetching.
  const CONCURRENCY = 3;
  const connectorResults: { connectorId: string; missions: Mission[] }[] = [];

  /**
   * Fetch a single connector with progress tracking and retry.
   */
  async function fetchOneConnector(
    connector: (typeof connectors)[number],
    index: number
  ): Promise<void> {
    throwIfScanCancelled(signal);

    const stateIdx = connectorStates.findIndex((s) => s.connectorId === connector.id);
    onProgress?.({ current: index, total: connectors.length, connectorName: connector.name });

    // État: detecting
    if (stateIdx >= 0) {
      connectorStates[stateIdx] = { ...connectorStates[stateIdx], state: 'detecting' };
    }
    emitDetailed('scanning', index, connectors.length);

    const now = Date.now();

    const connectorContext: ConnectorSearchContext | undefined = baseSearchContext
      ? { ...baseSearchContext, lastSync: null }
      : undefined;

    // État: fetching
    if (stateIdx >= 0) {
      connectorStates[stateIdx] = { ...connectorStates[stateIdx], state: 'fetching' };
    }
    emitDetailed('scanning', index, connectors.length);

    // --- Circuit Breaker ---
    // runWithCircuitBreaker gère : open → skip, half-open → probe, closed → execute
    const circuitRun = await runWithCircuitBreaker(connector, now, connectorContext, signal);
    throwIfScanCancelled(signal);

    // Sync alarme de sonde (schedule si open, cancel si closed/half-open)
    syncProbeAlarm(circuitRun.snapshot).catch(() => {});

    // Émissions bridge health (best-effort — panel peut être fermé)
    chrome.runtime
      .sendMessage({
        type: 'CONNECTOR_HEALTH_UPDATED',
        payload: {
          snapshot: circuitRun.snapshot,
          stateChanged:
            circuitRun.snapshot.circuitState !== 'closed' ||
            circuitRun.snapshot.consecutiveFailures === 0,
        },
      })
      .catch(() => {});

    if (circuitRun.status === 'skipped') {
      // Circuit ouvert — skip ce connecteur pour ce cycle
      errors.push({
        connectorId: connector.id,
        message: `Circuit ouvert — connecteur ${connector.name} temporairement désactivé`,
      });
      chrome.runtime
        .sendMessage({
          type: 'CONNECTOR_SKIPPED',
          payload: {
            connectorId: connector.id,
            connectorName: connector.name,
            reason: 'circuit-open',
          },
        })
        .catch(() => {});
      // Toast — circuit ouvert
      chrome.runtime
        .sendMessage({
          type: 'SHOW_TOAST',
          payload: {
            message: `⚠️ ${connector.name} suspendu — trop d'erreurs répétées`,
            toastType: 'warning',
            duration: 5000,
          },
        })
        .catch(() => {});
      if (stateIdx >= 0) {
        connectorStates[stateIdx] = { ...connectorStates[stateIdx], state: 'error', error: null };
      }
      emitDetailed('scanning', index + 1, connectors.length);
      return;
    }

    // circuitRun.status === 'executed'
    const result = circuitRun.result;
    const connectorDuration = circuitRun.snapshot.recentLatenciesMs.at(-1) ?? 0;

    // Enregistrer le timing du connecteur
    metricsCollector.recordTiming('connector.fetch', connectorDuration, {
      connectorId: connector.id,
      status: result.ok ? 'success' : 'error',
    });

    if (!result.ok) {
      errors.push({ connectorId: connector.id, message: result.error.message });
      trackParserHealth(connector.id, 0, now).catch(() => {});
      if (stateIdx >= 0) {
        connectorStates[stateIdx] = {
          ...connectorStates[stateIdx],
          state: 'error',
          error: result.error,
        };
      }
    } else {
      trackParserHealth(connector.id, result.value.length, now).catch(() => {});
      connectorResults.push({ connectorId: connector.id, missions: result.value });
      try {
        options?.onConnectorResult?.({
          connectorId: connector.id,
          connectorName: connector.name,
          missions: buildDeterministicMissions(result.value, new Date(now)),
        });
      } catch {
        // Partial UI updates are best-effort; the final scan result remains canonical.
      }
      // Toast de récupération si le circuit revient à closed depuis open/half-open
      if (
        circuitRun.snapshot.circuitState === 'closed' &&
        circuitRun.snapshot.consecutiveFailures === 0 &&
        circuitRun.snapshot.totalFailures > 0
      ) {
        chrome.runtime
          .sendMessage({
            type: 'SHOW_TOAST',
            payload: {
              message: `✅ ${connector.name} récupéré et opérationnel`,
              toastType: 'success',
              duration: 4000,
            },
          })
          .catch(() => {});
      }
      if (stateIdx >= 0) {
        connectorStates[stateIdx] = {
          ...connectorStates[stateIdx],
          state: 'done',
          missionsCount: result.value.length,
        };
      }
    }
    emitDetailed('scanning', index + 1, connectors.length);
  }

  // Execute with concurrency pool
  const pending: Promise<void>[] = [];
  let nextIndex = 0;

  while (nextIndex < connectors.length) {
    throwIfScanCancelled(signal);

    // Fill up to CONCURRENCY slots
    while (pending.length < CONCURRENCY && nextIndex < connectors.length) {
      const idx = nextIndex++;
      const promise = fetchOneConnector(connectors[idx], idx).then(() => {
        // Remove from pending when done
        const pIdx = pending.indexOf(promise);
        if (pIdx >= 0) {
          pending.splice(pIdx, 1);
        }
      });
      pending.push(promise);
    }

    // Wait for at least one to finish before filling more
    if (pending.length >= CONCURRENCY) {
      await Promise.race(pending);
      throwIfScanCancelled(signal);
    }
  }

  // Wait for all remaining
  await Promise.all(pending);
  throwIfScanCancelled(signal);
  onProgress?.({ current: connectors.length, total: connectors.length, connectorName: '' });
  throwIfScanCancelled(signal);

  const allMissions: Mission[] = [];
  for (const result of connectorResults) {
    allMissions.push(...result.missions);
  }

  // Post-processing: emit progress
  emitDetailed('post-processing', 0, 3);

  // Deduplicate
  const missionsBeforeDedup = allMissions.length;
  const dedupedResult = deduplicateMissionsDetailed(allMissions);
  const deduped = dedupedResult.missions;
  const dedupRatio = calculateDedupRatio(missionsBeforeDedup, deduped.length);

  // Filter out salaried positions (CDD/CDI) — safety net after connector filters
  const freelanceOnly = filterSalariedMissions(deduped);

  // Filter out stale missions (too old — likely filled or cancelled)
  const freshOnly = filterStaleMissions(freelanceOnly, new Date());
  const eligibleSourceMissions = filterStaleMissions(
    filterSalariedMissions(allMissions),
    new Date()
  );
  emitDetailed('post-processing', 1, 3);

  // Score against profile (already loaded above for connector filtering)
  // Now returns structured breakdown
  const scored = freshOnly.map((m) => {
    const now = new Date();
    const result = scoreMission(m, scanProfile, now);
    return {
      ...m,
      scoreBreakdown: buildScoreBreakdown(result.total, result.breakdown),
      score: result.total,
    };
  });

  // Semantic scoring (async enrichment, non-blocking)
  if (!usingDefaultProfile && !signal?.aborted) {
    try {
      const semanticResults = await scoreMissionsSemantic(
        scored,
        scanProfile,
        settings.maxSemanticPerScan,
        signal
      );
      throwIfScanCancelled(signal);
      for (const mission of scored) {
        const semantic = semanticResults.get(mission.id);
        if (semantic && mission.scoreBreakdown) {
          // Rebuild breakdown with semantic fusion
          mission.scoreBreakdown = computeFinalBreakdown(
            mission.scoreBreakdown.deterministic,
            mission.scoreBreakdown.criteria,
            semantic.score,
            semantic.reason
          );
          mission.semanticScore = semantic.score;
          mission.semanticReason = semantic.reason;
          // Keep legacy score in sync
          mission.score = mission.scoreBreakdown.total;
        }
      }
    } catch {
      throwIfScanCancelled(signal);
      // Gemini Nano unavailable, continue with basic scoring
    }
  }
  throwIfScanCancelled(signal);
  emitDetailed('post-processing', 2, 3);

  const scoredIds = new Set(scored.map((mission) => mission.id));
  const eligibleSourceMissionsById = new Map(
    eligibleSourceMissions.map((mission) => [mission.id, mission])
  );
  const duplicateRelations = dedupedResult.duplicateRelations.filter(
    (relation) =>
      scoredIds.has(relation.canonicalMissionId) &&
      eligibleSourceMissionsById.has(relation.duplicateMissionId)
  );
  const sourceMissions = [
    ...scored,
    ...duplicateRelations.flatMap((relation) => {
      const mission = eligibleSourceMissionsById.get(relation.duplicateMissionId);
      return mission ? [mission] : [];
    }),
  ];

  // Calculer et enregistrer les métriques du scan
  const scanDuration = Math.round(performance.now() - scanStartTime);
  const missionsPerConnector: Record<string, number> = {};
  for (const result of connectorResults) {
    missionsPerConnector[result.connectorId] = result.missions.length;
  }

  const scanMetrics: ScanMetrics = {
    durationMs: scanDuration,
    totalMissions: scored.length,
    missionsPerConnector,
    errors: errors.map((e) => ({
      connectorId: e.connectorId,
      errorType: e.message.includes('timeout')
        ? 'timeout'
        : e.message.includes('auth')
          ? 'auth'
          : e.message.includes('network')
            ? 'network'
            : 'unknown',
    })),
    dedupRatio,
  };
  metricsCollector.recordScanMetrics(scanMetrics);

  // Enregistrer le temps total de scan
  metricsCollector.recordTiming('scan.total', scanDuration, {
    connectorsCount: String(connectors.length),
    errorsCount: String(errors.length),
  });

  if (import.meta.env.DEV) {
    console.debug(
      `[Scanner] Completed in ${scanDuration}ms, ${scored.length} missions, ${errors.length} errors`
    );
  }

  try {
    throwIfScanCancelled(signal);
    await setScanState('idle');
  } catch {
    /* Non-critical: scan state is UI-only */
  }
  throwIfScanCancelled(signal);
  emitDetailed('done', connectors.length, connectors.length);
  return { missions: scored, sourceMissions, duplicateRelations, errors };
}
