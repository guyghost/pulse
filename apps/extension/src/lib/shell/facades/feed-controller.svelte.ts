/**
 * Feed Controller — Orchestration layer for feed business logic.
 *
 * Extracted from FeedPage.svelte to keep UI thin.
 * Manages scan lifecycle, data loading, source session checking, and bridge messaging.
 *
 * Uses Svelte 5 runes for reactive state.
 */
import type { Mission, MissionSource, RemoteType } from '$lib/core/types/mission';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { SeniorityLevel } from '$lib/core/types/profile';
import type { ConnectorHealthSnapshot } from '$lib/core/types/health';
import type { ConnectorHealthRecord } from '$lib/core/connectors/parser-health-logic';
import type { ConnectorStatus, PersistedConnectorStatus } from '$lib/core/types/connector-status';
import type { AppError } from '$lib/core/errors/app-error';
import { deduplicateMissions } from '$lib/core/scoring/dedup';
import { sendMessage, subscribeMessages } from '../messaging/bridge';
import { getMissions, getConnectorStatuses } from './feed-data.facade';
import { getSettings, setSettings } from './settings.facade';

/**
 * Converts scan error codes into user-friendly French messages.
 * Falls back to the raw error message if code is unknown.
 */
const humanizeScanError = (message: string, code: string): string => {
  switch (code) {
    case 'OFFLINE':
      return 'Aucune connexion internet. Vérifiez votre réseau et réessayez.';
    case 'MUTEX':
      return 'Un scan est déjà en cours. Veuillez patienter.';
    case 'CANCELLED':
      return 'Scan annulé.';
    case 'NETWORK_ERROR':
      return 'Erreur réseau lors du scan. Réessayez dans quelques instants.';
    default:
      return message || 'Erreur inattendue lors du scan.';
  }
};

function deduplicateEnabledSources(missions: Mission[], enabledSources: Set<string>): Mission[] {
  if (missions.length <= 1) {
    return missions;
  }

  if (enabledSources.size === 0) {
    return deduplicateMissions(missions);
  }

  const enabledMissions: Mission[] = [];
  const disabledMissions: Mission[] = [];

  for (const mission of missions) {
    if (enabledSources.has(mission.source)) {
      enabledMissions.push(mission);
    } else {
      disabledMissions.push(mission);
    }
  }

  return [...deduplicateMissions(enabledMissions), ...disabledMissions];
}

const missionSources = new Set<MissionSource>([
  'free-work',
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
  'malt',
]);
const remoteTypes = new Set<RemoteType>(['full', 'hybrid', 'onsite']);
const seniorityLevels = new Set<SeniorityLevel>(['junior', 'confirmed', 'senior']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null;
  }
  return value;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isMissionSource(value: unknown): value is MissionSource {
  return typeof value === 'string' && missionSources.has(value as MissionSource);
}

function isRemoteType(value: unknown): value is RemoteType {
  return typeof value === 'string' && remoteTypes.has(value as RemoteType);
}

function isSeniorityLevel(value: unknown): value is SeniorityLevel {
  return typeof value === 'string' && seniorityLevels.has(value as SeniorityLevel);
}

function normalizeBridgeMission(value: unknown): Mission | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, title, description, stack, url, source, scrapedAt } = value;
  const normalizedStack = readStringArray(stack);
  const normalizedScrapedAt = readDate(scrapedAt);

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof url !== 'string' ||
    !isMissionSource(source) ||
    normalizedStack === null ||
    normalizedScrapedAt === null
  ) {
    return null;
  }

  return {
    id,
    title,
    client: readNullableString(value.client),
    description,
    stack: normalizedStack,
    tjm: readNullableNumber(value.tjm),
    location: readNullableString(value.location),
    remote: isRemoteType(value.remote) ? value.remote : null,
    duration: readNullableString(value.duration),
    startDate: readNullableString(value.startDate),
    publishedAt: readNullableString(value.publishedAt),
    url,
    source,
    scrapedAt: normalizedScrapedAt,
    seniority: isSeniorityLevel(value.seniority) ? value.seniority : null,
    scoreBreakdown: isRecord(value.scoreBreakdown)
      ? (value.scoreBreakdown as unknown as Mission['scoreBreakdown'])
      : null,
    score: readNullableNumber(value.score),
    semanticScore: readNullableNumber(value.semanticScore),
    semanticReason: readNullableString(value.semanticReason),
  };
}

function normalizeBridgeMissions(payload: unknown[]): Mission[] {
  const missions: Mission[] = [];

  for (const rawMission of payload) {
    const mission = normalizeBridgeMission(rawMission);
    if (mission) {
      missions.push(mission);
    }
  }

  return missions;
}

function isScanCompleteResponse(
  response: unknown
): response is { type: 'SCAN_COMPLETE'; payload: unknown[] } {
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { type?: unknown }).type === 'SCAN_COMPLETE' &&
    Array.isArray((response as { payload?: unknown }).payload)
  );
}

function isScanErrorResponse(
  response: unknown
): response is { type: 'SCAN_ERROR'; payload: { message: string; code: string } } {
  if (
    typeof response !== 'object' ||
    response === null ||
    (response as { type?: unknown }).type !== 'SCAN_ERROR'
  ) {
    return false;
  }

  const payload = (response as { payload?: unknown }).payload;
  return typeof payload === 'object' && payload !== null;
}

// Re-export SourceStatus types for consumers
export type SourceSessionStatus = 'checking' | 'connected' | 'not-connected' | 'error';

export interface SourceStatus {
  connectorId: string;
  name: string;
  icon: string;
  url: string;
  sessionStatus: SourceSessionStatus;
  lastSyncAt: number | null;
  error?: AppError;
}

export interface ScanProgress {
  current: number;
  total: number;
  percent: number;
  connectorName: string;
}

export interface FeedController {
  // Scan state (reactive getters)
  get isScanning(): boolean;
  get scanCompleted(): boolean;
  get hasPendingMissions(): boolean;
  get pendingMissionCount(): number;
  get pendingConnectorCount(): number;
  get isApplyingPendingMissions(): boolean;
  get connectorStatuses(): Map<string, ConnectorStatus>;
  get scanResultCounts(): Map<string, number>;
  get persistedStatuses(): PersistedConnectorStatus[];
  get lastScanAt(): number | null;
  get lastScanMissionCount(): number;
  get scanProgress(): ScanProgress;
  /** Santé des connecteurs (circuit breaker snapshots) */
  get healthSnapshots(): Map<string, ConnectorHealthSnapshot>;
  /** Anomalies parser (zéros consécutifs, chute soudaine) */
  get parserHealthRecords(): Map<string, ConnectorHealthRecord>;

  // Source session state
  get sourceStatuses(): SourceStatus[];
  get isCheckingSources(): boolean;

  // Connector management
  get enabledConnectorIds(): Set<string>;

  // Methods
  startScan(): Promise<void>;
  stopScan(): void;
  handleScanComplete(missions: Mission[]): Promise<void>;
  applyPendingMissions(): Promise<void>;
  smartLoad(): Promise<void>;
  checkSourceSessions(): Promise<void>;
  handleToggleConnector(id: string): Promise<void>;
  refreshHealthSnapshots(): Promise<void>;
  refreshParserHealth(): Promise<void>;
  recheckConnector(id: string, enable?: boolean): Promise<void>;

  // Cleanup
  dispose(): void;
}

/**
 * Creates a feed controller that manages scan orchestration and data loading.
 *
 * @param feedStore - The feed store to update with missions
 * @returns FeedController API with reactive state and methods
 */
export function createFeedController(feedStore: {
  readonly missions?: Mission[];
  load(): void;
  setMissions(missions: Mission[]): void;
  setError(msg: string): void;
}): FeedController {
  // ============================================================
  // Reactive state
  // ============================================================
  let isScanning = $state(false);
  let scanCompleted = $state(false);
  let hasPendingMissions = $state(false);
  let pendingMissionCount = $state(0);
  let pendingConnectorCount = $state(0);
  let isApplyingPendingMissions = $state(false);
  const connectorStatuses = new SvelteMap<string, ConnectorStatus>();
  const scanResultCounts = new SvelteMap<string, number>();
  let persistedStatuses = $state<PersistedConnectorStatus[]>([]);
  let lastScanAt = $state<number | null>(null);
  let lastScanMissionCount = $state<number>(0);
  let sourceStatuses = $state<SourceStatus[]>([]);
  let isCheckingSources = $state(false);
  let enabledConnectorIds = new SvelteSet<string>();
  let healthSnapshots = new SvelteMap<string, ConnectorHealthSnapshot>();
  let parserHealthRecords = new SvelteMap<string, ConnectorHealthRecord>();
  let partialScanBaseMissions: Mission[] = [];
  let partialScanConnectorMissions = new SvelteMap<string, Mission[]>();
  let partialScanCompletedSources = new SvelteSet<string>();
  let pendingScanMissions: Mission[] | null = null;
  let pendingScanKind: 'partial' | 'final' | null = null;

  // Bridge message listener cleanup
  let bridgeListenerCleanup: (() => void) | null = null;

  // ============================================================
  // Derived state
  // ============================================================
  const scanProgress = $derived.by((): ScanProgress => {
    if (connectorStatuses.size === 0) {
      return { current: 0, total: 0, percent: 0, connectorName: '' };
    }
    const statuses = [...connectorStatuses.values()];
    const total = statuses.length;
    const completed = statuses.filter((s) => s.state === 'done' || s.state === 'error').length;
    const active = statuses.find(
      (s) => s.state === 'detecting' || s.state === 'fetching' || s.state === 'retrying'
    );
    return {
      current: completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      connectorName: active?.connectorName ?? '',
    };
  });

  // ============================================================
  // Scan orchestration
  // ============================================================

  async function startScan(): Promise<void> {
    if (isScanning) {
      return;
    }
    scanCompleted = false;
    isScanning = true;
    connectorStatuses.clear();
    beginPartialScan();
    feedStore.load();

    try {
      // Envoyer SCAN_START au service worker — il gère toute l'orchestration
      const response = (await sendMessage({ type: 'SCAN_START' })) as unknown;
      // Le SW renvoie SCAN_COMPLETE avec les missions traitées
      if (isScanCompleteResponse(response)) {
        await handleScanComplete(normalizeBridgeMissions(response.payload));
      } else if (isScanErrorResponse(response)) {
        const message =
          typeof response.payload.message === 'string'
            ? response.payload.message
            : 'Erreur inattendue lors du scan.';
        const code = typeof response.payload.code === 'string' ? response.payload.code : 'UNKNOWN';
        feedStore.setError(humanizeScanError(message, code));
      } else {
        await recoverFromUnsettledScanResponse(response);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[FeedController] startScan error:', err);
      }
      feedStore.setError(err instanceof Error ? err.message : 'Erreur inattendue lors du scan');
    } finally {
      finishScanLifecycle();
    }
  }

  function stopScan(): void {
    sendMessage({ type: 'SCAN_CANCEL' }).catch(() => {
      // Service worker might not be available
    });
    isScanning = false;
    connectorStatuses.clear();
    resetPartialScan();
    clearPendingScanUpdate();
  }

  function finishScanLifecycle(): void {
    isScanning = false;
    connectorStatuses.clear();
    resetPartialScan();
  }

  function readFeedMissionsSnapshot(): Mission[] {
    return Array.isArray(feedStore.missions) ? [...feedStore.missions] : [];
  }

  function beginPartialScan(): void {
    partialScanBaseMissions = readFeedMissionsSnapshot();
    partialScanConnectorMissions = new SvelteMap();
    partialScanCompletedSources = new SvelteSet();
    clearPendingScanUpdate();
  }

  function resetPartialScan(): void {
    partialScanBaseMissions = [];
    partialScanConnectorMissions = new SvelteMap();
    partialScanCompletedSources = new SvelteSet();
  }

  function clearPendingScanUpdate(): void {
    pendingScanMissions = null;
    pendingScanKind = null;
    hasPendingMissions = false;
    pendingMissionCount = 0;
    pendingConnectorCount = 0;
    isApplyingPendingMissions = false;
  }

  function markPendingPartialScanUpdate(): void {
    pendingScanKind = 'partial';
    pendingScanMissions = null;
    hasPendingMissions = true;
    pendingConnectorCount = partialScanCompletedSources.size;
    pendingMissionCount = [...partialScanConnectorMissions.values()].reduce(
      (total, missions) => total + missions.length,
      0
    );
  }

  function setPendingFinalScanUpdate(missions: Mission[]): void {
    pendingScanKind = 'final';
    pendingScanMissions = missions;
    hasPendingMissions = missions.length > 0;
    pendingMissionCount = missions.length;
    pendingConnectorCount = 0;
  }

  function buildPendingPartialMissions(): Mission[] {
    const retainedBaseMissions = partialScanBaseMissions.filter(
      (mission) => !partialScanCompletedSources.has(mission.source)
    );
    const partialMissions = [...partialScanConnectorMissions.values()].flat();

    return deduplicateEnabledSources(
      [...retainedBaseMissions, ...partialMissions],
      enabledConnectorIds
    );
  }

  function handleScanPartialResult(connectorId: string, missions: Mission[]): void {
    if (!isScanning) {
      return;
    }

    partialScanConnectorMissions = new SvelteMap(partialScanConnectorMissions).set(
      connectorId,
      missions
    );
    partialScanCompletedSources = new SvelteSet(partialScanCompletedSources).add(connectorId);
    markPendingPartialScanUpdate();
  }

  async function recoverFromUnsettledScanResponse(response: unknown): Promise<void> {
    if (import.meta.env.DEV) {
      console.warn('[FeedController] Unexpected scan response:', response);
    }

    try {
      const stored = await getMissions();
      feedStore.setMissions(deduplicateEnabledSources(stored, enabledConnectorIds));
    } catch {
      feedStore.setError('Scan terminé sans réponse exploitable.');
    }
  }

  /**
   * Reçoit les missions finalisées du service worker (déjà scored, deduped, semantic).
   * Plus de post-processing local — le SW fait tout.
   */
  async function handleScanComplete(missions: Mission[]): Promise<void> {
    if (import.meta.env.DEV) {
      console.debug(
        '[FeedController] handleScanComplete received',
        missions.length,
        'missions from SW'
      );
    }

    const shouldApplyImmediately = !isScanning || readFeedMissionsSnapshot().length === 0;
    if (shouldApplyImmediately) {
      feedStore.setMissions(missions);
      clearPendingScanUpdate();
    } else {
      setPendingFinalScanUpdate(missions);
    }
    scanCompleted = true;
    resetPartialScan();

    // Compter par source pour l'affichage
    scanResultCounts.clear();
    for (const m of missions) {
      scanResultCounts.set(m.source, (scanResultCounts.get(m.source) ?? 0) + 1);
    }
    lastScanAt = Date.now();
    lastScanMissionCount = missions.length;

    // Recharger les statuts persistés pour le panneau SourceHealthPanel
    try {
      persistedStatuses = await getConnectorStatuses();
    } catch {
      /* Non-critical */
    }
  }

  async function applyPendingMissions(): Promise<void> {
    if (!hasPendingMissions || isApplyingPendingMissions) {
      return;
    }

    isApplyingPendingMissions = true;
    try {
      const missions =
        pendingScanKind === 'partial' ? buildPendingPartialMissions() : (pendingScanMissions ?? []);

      feedStore.setMissions(missions);
      clearPendingScanUpdate();
    } finally {
      isApplyingPendingMissions = false;
    }
  }

  // ============================================================
  // Smart loading
  // ============================================================

  /**
   * Smart load: use persisted data if fresh, scan only if stale
   */
  async function smartLoad(): Promise<void> {
    try {
      const [stored, statuses, settings] = await Promise.all([
        getMissions(),
        getConnectorStatuses(),
        getSettings(),
      ]);
      if (stored.length > 0) {
        feedStore.setMissions(
          deduplicateEnabledSources(stored, new SvelteSet(settings.enabledConnectors))
        );
        // Use connector statuses to determine freshness
        const lastSync = statuses.reduce<number | null>((max, s) => {
          if (s.lastSyncAt && (max === null || s.lastSyncAt > max)) {
            return s.lastSyncAt;
          }
          return max;
        }, null);
        const intervalMs = settings.scanIntervalMinutes * 60 * 1000;
        if (lastSync && Date.now() - lastSync < intervalMs) {
          return;
        }
      }
      startScan();
    } catch {
      startScan();
    }
  }

  // ============================================================
  // Source session checking
  // ============================================================

  async function checkSourceSessions(): Promise<void> {
    if (isCheckingSources) {
      return;
    }
    isCheckingSources = true;

    try {
      const { getConnectorsMeta, getConnectors, detectAllConnectorSessions } =
        await import('../connectors/index');
      const meta = getConnectorsMeta();
      const allIds = meta.map((item) => item.id);
      const now = Date.now();

      // Build initial source statuses with "checking" state
      sourceStatuses = meta.map((item) => ({
        connectorId: item.id,
        name: item.name,
        icon: item.icon,
        url: item.url,
        sessionStatus: 'checking' as SourceSessionStatus,
        lastSyncAt: null,
      }));

      // Load connectors and detect sessions in parallel
      const connectors = await getConnectors(allIds);
      const results = await detectAllConnectorSessions(connectors, now);

      // Load last sync times in parallel
      const lastSyncResults = await Promise.all(
        connectors.map(async (c) => {
          const result = await c.getLastSync(now);
          return {
            id: c.id,
            lastSyncAt: result.ok ? result.value : null,
          };
        })
      );

      // Merge results into source statuses
      const lastSyncMap = new SvelteMap(lastSyncResults.map((r) => [r.id, r.lastSyncAt]));
      const resultMap = new SvelteMap(results.map((r) => [r.connectorId, r]));

      sourceStatuses = sourceStatuses.map((s) => {
        const result = resultMap.get(s.connectorId);
        const lastSync = lastSyncMap.get(s.connectorId);

        let sessionStatus: SourceSessionStatus = 'checking';
        if (result) {
          if (result.error) {
            sessionStatus = 'error';
          } else if (result.hasSession) {
            sessionStatus = 'connected';
          } else {
            sessionStatus = 'not-connected';
          }
        }

        return {
          ...s,
          sessionStatus,
          lastSyncAt: lastSync?.getTime() ?? null,
          error: result?.error,
        };
      });
    } catch {
      // Outside extension context or connector load failed
      sourceStatuses = sourceStatuses.map((s) => ({
        ...s,
        sessionStatus: 'error' as SourceSessionStatus,
      }));
    } finally {
      isCheckingSources = false;
    }
  }

  // ============================================================
  // Connector toggle
  // ============================================================

  async function handleToggleConnector(id: string): Promise<void> {
    if (enabledConnectorIds.has(id)) {
      enabledConnectorIds.delete(id);
    } else {
      enabledConnectorIds.add(id);
    }
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, enabledConnectors: [...enabledConnectorIds] });
    } catch {
      /* Non-critical: settings persistence */
    }
  }

  async function refreshParserHealth(): Promise<void> {
    try {
      const response = await sendMessage({ type: 'GET_PARSER_HEALTH' });
      if (response.type === 'PARSER_HEALTH_RESULT' && Array.isArray(response.payload)) {
        parserHealthRecords = new SvelteMap(
          response.payload.map((record) => [record.connectorId, record])
        );
      }
    } catch {
      // Outside extension context
    }
  }

  async function refreshHealthSnapshots(): Promise<void> {
    try {
      const response = await sendMessage({ type: 'GET_CONNECTOR_HEALTH' });
      if (response.type === 'CONNECTOR_HEALTH_RESULT' && Array.isArray(response.payload)) {
        healthSnapshots = new SvelteMap(
          response.payload.map((snapshot) => [snapshot.connectorId, snapshot])
        );
      }
    } catch {
      // Outside extension context
    }
  }

  async function recheckConnector(id: string, enable = false): Promise<void> {
    try {
      const response = await sendMessage({
        type: 'RECHECK_CONNECTOR_HEALTH',
        payload: { connectorId: id, enable },
      });
      if (response.type === 'CONNECTOR_HEALTH_RESULT' && Array.isArray(response.payload)) {
        healthSnapshots = new SvelteMap(
          response.payload.map((snapshot) => [snapshot.connectorId, snapshot])
        );
      }
      if (enable) {
        enabledConnectorIds.add(id);
      }
    } catch (err) {
      feedStore.setError(
        err instanceof Error ? err.message : 'Impossible de revérifier le connecteur'
      );
    }
  }

  // ============================================================
  // Bridge message listener setup
  // ============================================================

  function setupBridgeListener(): void {
    try {
      bridgeListenerCleanup = subscribeMessages((message) => {
        // Progression détaillée pendant le scan
        if (message?.type === 'SCAN_PROGRESS' && message.payload) {
          const payload = message.payload;
          // Mettre à jour les états de connecteurs pour l'UI
          connectorStatuses.clear();
          for (const cp of payload.connectorProgress) {
            connectorStatuses.set(cp.connectorId, {
              connectorId: cp.connectorId,
              connectorName: cp.connectorName,
              state: cp.state,
              missionsCount: cp.missionsCount,
              error: cp.error,
              retryCount: cp.retryCount,
              startedAt: null,
              completedAt: null,
            });
          }
        }

        if (message?.type === 'CONNECTOR_HEALTH_UPDATED' && message.payload?.snapshot) {
          const snap = message.payload.snapshot as ConnectorHealthSnapshot;
          healthSnapshots.set(snap.connectorId, snap);
        }

        if (message?.type === 'SCAN_PARTIAL_RESULT' && message.payload) {
          const payload = message.payload;
          handleScanPartialResult(
            payload.connectorId,
            normalizeBridgeMissions(payload.missions ?? [])
          );
        }

        // Résultat final du scan (auto-scan du background)
        if (message?.type === 'SCAN_COMPLETE' && Array.isArray(message.payload)) {
          handleScanComplete(normalizeBridgeMissions(message.payload))
            .catch((err) => {
              feedStore.setError(
                err instanceof Error ? err.message : 'Impossible de finaliser le scan'
              );
            })
            .finally(() => {
              void refreshParserHealth();
              finishScanLifecycle();
            });
        }

        if (message?.type === 'MISSIONS_UPDATED' && Array.isArray(message.payload)) {
          feedStore.setMissions(
            deduplicateEnabledSources(normalizeBridgeMissions(message.payload), enabledConnectorIds)
          );
        }

        // Erreur du scan (auto-scan du background)
        if (message?.type === 'SCAN_ERROR' && message.payload) {
          const { message: errorMsg, code } = message.payload as { message: string; code: string };
          clearPendingScanUpdate();
          feedStore.setError(humanizeScanError(errorMsg, code));
          finishScanLifecycle();
        }
      });
    } catch {
      // Outside extension context
    }
  }

  // ============================================================
  // Initialization
  // ============================================================

  async function init(): Promise<void> {
    // Load persisted statuses and enabled connectors on mount
    try {
      const [statuses, settings] = await Promise.all([getConnectorStatuses(), getSettings()]);
      persistedStatuses = statuses;
      enabledConnectorIds = new SvelteSet(settings.enabledConnectors);
    } catch {
      /* Non-critical */
    }

    // Load last scan timestamp from persisted connector statuses
    if (persistedStatuses.length > 0) {
      const latestSync = persistedStatuses.reduce<number | null>((max, s) => {
        if (s.lastSyncAt && (max === null || s.lastSyncAt > max)) {
          return s.lastSyncAt;
        }
        return max;
      }, null);
      if (latestSync) {
        lastScanAt = latestSync;
      }
    }

    // Setup bridge listener
    setupBridgeListener();

    await refreshHealthSnapshots();
    await refreshParserHealth();

    // Check source sessions on mount
    checkSourceSessions();

    // Smart load initial data
    smartLoad();
  }

  // Run initialization — surface errors instead of swallowing them.
  // Unhandled rejections here are invisible to svelte:boundary and lead to
  // silent feed failures (isScanning never resets, missions never load).
  init().catch((err) => {
    console.error('[FeedController] init failed:', err);
    feedStore.setError(err instanceof Error ? err.message : 'Initialisation du feed échouée');
  });

  // ============================================================
  // Cleanup
  // ============================================================

  function dispose(): void {
    if (bridgeListenerCleanup) {
      bridgeListenerCleanup();
      bridgeListenerCleanup = null;
    }
  }

  // ============================================================
  // Return public API
  // ============================================================

  return {
    // Scan state getters
    get isScanning() {
      return isScanning;
    },
    get scanCompleted() {
      return scanCompleted;
    },
    get hasPendingMissions() {
      return hasPendingMissions;
    },
    get pendingMissionCount() {
      return pendingMissionCount;
    },
    get pendingConnectorCount() {
      return pendingConnectorCount;
    },
    get isApplyingPendingMissions() {
      return isApplyingPendingMissions;
    },
    get connectorStatuses() {
      return connectorStatuses;
    },
    get scanResultCounts() {
      return scanResultCounts;
    },
    get persistedStatuses() {
      return persistedStatuses;
    },
    get lastScanAt() {
      return lastScanAt;
    },
    get lastScanMissionCount() {
      return lastScanMissionCount;
    },
    get scanProgress() {
      return scanProgress;
    },

    // Source session state getters
    get sourceStatuses() {
      return sourceStatuses;
    },
    get isCheckingSources() {
      return isCheckingSources;
    },

    // Connector management getters
    get enabledConnectorIds() {
      return enabledConnectorIds;
    },
    get healthSnapshots() {
      return healthSnapshots;
    },
    get parserHealthRecords() {
      return parserHealthRecords;
    },

    // Methods
    startScan,
    stopScan,
    handleScanComplete,
    applyPendingMissions,
    smartLoad,
    checkSourceSessions,
    handleToggleConnector,
    refreshHealthSnapshots,
    refreshParserHealth,
    recheckConnector,

    // Cleanup
    dispose,
  };
}
