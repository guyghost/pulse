import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { AppError } from '../../core/errors/app-error';
import { buildSearchContext } from '../../core/connectors/search-context';
import { getConnectors, getConnector } from '../connectors/index';
import { getSettings } from '../storage/chrome-storage';
import { getProfile, saveMissions, purgeOldMissions } from '../storage/db';
import { deduplicateMissions } from '../../core/scoring/dedup';
import { filterSalariedMissions } from '../../core/scoring/contract-filter';
import { scoreMission } from '../../core/scoring/relevance';
import { setScanState } from '../storage/session-storage';
import { scoreMissionsSemantic } from '../ai/semantic-scorer';
import { metricsCollector } from '../metrics/collector';
import { calculateDedupRatio } from '../../core/metrics/types';
import type { ScanMetrics } from '../../core/metrics/types';
import { recordTJMFromMissions } from '../storage/tjm-history';
import { isOnline } from '../utils/connection-monitor';
import { withResultRetry } from '../utils/retry-strategy';
import { trackParserHealth } from './parser-health';

/** Mutex pour empêcher les scans concurrents */
let scanInProgress = false;

/** AbortController global pour permettre la cancellation depuis le service worker */
let currentAbortController: AbortController | null = null;

/**
 * Annule le scan en cours (si existant).
 * Utilisé par le handler SCAN_CANCEL dans le service worker.
 */
export function cancelCurrentScan(): void {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

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

export interface ScanResult {
  missions: Mission[];
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

export interface ScanOptions {
  /** Délai entre les pages d'un même connecteur en ms (défaut: 500) */
  pageDelayMs?: number;
  /** Callback de progression détaillé (pour bridge SCAN_PROGRESS) */
  onDetailedProgress?: DetailedProgressCallback;
}

export async function runScan(
  signal?: AbortSignal,
  onProgress?: (info: ScanProgressInfo) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  // Mutex : empêcher les scans concurrents
  if (scanInProgress) {
    throw new ScanError('Un scan est déjà en cours. Veuillez patienter.', 'MUTEX');
  }
  scanInProgress = true;
  currentAbortController = new AbortController();

  // Combiner le signal externe avec le AbortController global
  const combinedSignal = signal
    ? AbortSignal.any([signal, currentAbortController.signal])
    : currentAbortController.signal;

  try {
    return await _runScanInternal(combinedSignal, onProgress, options);
  } finally {
    scanInProgress = false;
    currentAbortController = null;
  }
}

async function _runScanInternal(
  signal?: AbortSignal,
  onProgress?: (info: ScanProgressInfo) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  const scanStartTime = performance.now();
  const detailedProgress = options?.onDetailedProgress;
  const connectorStates: ConnectorScanState[] = [];

  function emitDetailed(
    phase: 'connecting' | 'scanning' | 'post-processing' | 'done',
    current = 0,
    total = 0
  ) {
    detailedProgress?.({ phase, current, total, connectorStates: [...connectorStates] });
  }

  // Vérifier la connexion avant de scanner
  if (!isOnline()) {
    throw new ScanError(
      'Aucune connexion internet. Le scan sera automatiquement relancé quand la connexion reviendra.',
      'OFFLINE'
    );
  }

  const settings = await getSettings();
  const enabledIds = settings.enabledConnectors;
  const errors: ScanResult['errors'] = [];

  try {
    await setScanState('scanning');
  } catch {
    /* Non-critical: scan state is UI-only */
  }

  if (enabledIds.length === 0) {
    try {
      await setScanState('idle');
    } catch {
      /* Non-critical: scan state is UI-only */
    }
    return { missions: [], errors: [{ connectorId: '*', message: 'Aucun connecteur actif' }] };
  }

  // Validate connector IDs and report unknown ones as errors
  const validConnectorIds: string[] = [];
  for (const id of enabledIds) {
    const connector = await getConnector(id);
    if (!connector) {
      errors.push({ connectorId: id, message: 'Connecteur introuvable' });
    } else {
      validConnectorIds.push(id);
    }
  }

  if (signal?.aborted) {
    try {
      await setScanState('idle');
    } catch {
      /* Non-critical: scan state is UI-only */
    }
    return { missions: [], errors };
  }

  // Load all connectors in parallel (they're lazy-loaded, so this loads only enabled ones)
  const connectors = await getConnectors(validConnectorIds);

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

  if (signal?.aborted) {
    try {
      await setScanState('idle');
    } catch {
      /* Non-critical: scan state is UI-only */
    }
    return { missions: [], errors };
  }

  // Load profile early for connector search filtering + scoring
  let profile: UserProfile | null = null;
  try {
    profile = await getProfile();
  } catch {
    // No profile available — connectors will fetch without filters
  }

  // Build base search context from profile (lastSync is always null — see comment below)
  const baseSearchContext = profile ? buildSearchContext(profile, null) : null;

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
    if (signal?.aborted) {
      return;
    }

    const stateIdx = connectorStates.findIndex((s) => s.connectorId === connector.id);
    onProgress?.({ current: index, total: connectors.length, connectorName: connector.name });

    // État: detecting
    if (stateIdx >= 0) {
      connectorStates[stateIdx] = { ...connectorStates[stateIdx], state: 'detecting' };
    }
    emitDetailed('scanning', index, connectors.length);

    const connectorStartTime = performance.now();
    const now = Date.now();

    const connectorContext: ConnectorSearchContext | undefined = baseSearchContext
      ? { ...baseSearchContext, lastSync: null }
      : undefined;

    // État: fetching
    if (stateIdx >= 0) {
      connectorStates[stateIdx] = { ...connectorStates[stateIdx], state: 'fetching' };
    }
    emitDetailed('scanning', index, connectors.length);

    // Retry automatique pour les erreurs réseau avec backoff (Result-aware)
    const result = await withResultRetry(
      () => connector.fetchMissions(now, connectorContext, signal),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
      }
    );

    const connectorDuration = Math.round(performance.now() - connectorStartTime);

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
    if (signal?.aborted) {
      break;
    }

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
    }
  }

  // Wait for all remaining
  await Promise.all(pending);
  onProgress?.({ current: connectors.length, total: connectors.length, connectorName: '' });

  const allMissions: Mission[] = [];
  for (const result of connectorResults) {
    allMissions.push(...result.missions);
  }

  // Post-processing: emit progress
  emitDetailed('post-processing', 0, 3);

  // Deduplicate
  const missionsBeforeDedup = allMissions.length;
  const deduped = deduplicateMissions(allMissions);
  const dedupRatio = calculateDedupRatio(missionsBeforeDedup, deduped.length);

  // Filter out salaried positions (CDD/CDI) — safety net after connector filters
  const freelanceOnly = filterSalariedMissions(deduped);
  emitDetailed('post-processing', 1, 3);

  // Score against profile (already loaded above for connector filtering)
  const scored = profile
    ? freelanceOnly.map((m) => ({ ...m, score: scoreMission(m, profile, new Date()) }))
    : freelanceOnly;

  // Semantic scoring (async enrichment, non-blocking)
  if (profile && !signal?.aborted) {
    try {
      const semanticResults = await scoreMissionsSemantic(
        scored,
        profile,
        settings.maxSemanticPerScan
      );
      for (const mission of scored) {
        const semantic = semanticResults.get(mission.id);
        if (semantic) {
          mission.semanticScore = semantic.score;
          mission.semanticReason = semantic.reason;
        }
      }
    } catch {
      // Gemini Nano unavailable, continue with basic scoring
    }
  }
  emitDetailed('post-processing', 2, 3);

  // Persist
  if (scored.length > 0) {
    try {
      await saveMissions(scored);
    } catch {
      // Storage not available
    }

    // Record TJM data from this scan into history
    try {
      const today = new Date().toISOString().slice(0, 10);
      await recordTJMFromMissions(scored, today);
    } catch {
      // TJM recording is non-critical
    }
  }

  // Purge old missions (older than 90 days) - non-blocking, silent failure
  try {
    const purged = await purgeOldMissions(90);
    if (purged > 0 && import.meta.env.DEV) {
      console.log(`[Scanner] Purged ${purged} old missions`);
    }
  } catch {
    // Purge failure is non-critical
  }

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
    console.log(
      `[Scanner] Completed in ${scanDuration}ms, ${scored.length} missions, ${errors.length} errors`
    );
  }

  try {
    await setScanState('idle');
  } catch {
    /* Non-critical: scan state is UI-only */
  }
  emitDetailed('done', connectors.length, connectors.length);
  return { missions: scored, errors };
}
