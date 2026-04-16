/**
 * Feed Controller — Orchestration layer for feed business logic.
 *
 * Extracted from FeedPage.svelte to keep UI thin.
 * Manages scan lifecycle, data loading, source session checking, and bridge messaging.
 *
 * Uses Svelte 5 runes for reactive state.
 */
import type { Mission, MissionSource } from '$lib/core/types/mission';
import type { ConnectorHealthSnapshot } from '$lib/core/types/health';
import type { ConnectorStatus, PersistedConnectorStatus } from '$lib/core/types/connector-status';
import type { ScanProgressPayload, BridgeMessage } from '../messaging/bridge';
import type { AppError } from '$lib/core/errors/app-error';
import { sendMessage } from '../messaging/bridge';
import {
  getMissions,
  getConnectorStatuses,
  getConnectorsMeta,
  detectAllConnectorSessions,
} from './feed-data.facade';
import { getSettings, setSettings } from './settings.facade';
import { getConnectors } from '../connectors/index';

/**
 * Converts scan error codes into user-friendly French messages.
 * Falls back to the raw error message if code is unknown.
 */
const humanizeScanError = (message: string, code: string): string => {
  switch (code) {
    case 'OFFLINE':
      return 'Aucune connexion internet. Verifiez votre reseau et reessayez.';
    case 'MUTEX':
      return 'Un scan est deja en cours. Veuillez patienter.';
    case 'CANCELLED':
      return 'Scan annule.';
    case 'NETWORK_ERROR':
      return 'Erreur reseau lors du scan. Reessayez dans quelques instants.';
    default:
      return message || 'Erreur inattendue lors du scan.';
  }
};

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
  get connectorStatuses(): Map<string, ConnectorStatus>;
  get scanResultCounts(): Map<string, number>;
  get persistedStatuses(): PersistedConnectorStatus[];
  get lastScanAt(): number | null;
  get lastScanMissionCount(): number;
  get scanProgress(): ScanProgress;
  /** Santé des connecteurs (circuit breaker snapshots) */
  get healthSnapshots(): Map<string, ConnectorHealthSnapshot>;

  // Source session state
  get sourceStatuses(): SourceStatus[];
  get isCheckingSources(): boolean;

  // Connector management
  get enabledConnectorIds(): Set<string>;

  // Methods
  startScan(): Promise<void>;
  stopScan(): void;
  handleScanComplete(missions: Mission[]): Promise<void>;
  smartLoad(): Promise<void>;
  checkSourceSessions(): Promise<void>;
  handleToggleConnector(id: string): Promise<void>;

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
  load(): void;
  setMissions(missions: Mission[]): void;
  setError(msg: string): void;
}): FeedController {
  // ============================================================
  // Reactive state
  // ============================================================
  let isScanning = $state(false);
  let scanCompleted = $state(false);
  let connectorStatuses = $state<Map<string, ConnectorStatus>>(new Map());
  let scanResultCounts = $state<Map<string, number>>(new Map());
  let persistedStatuses = $state<PersistedConnectorStatus[]>([]);
  let lastScanAt = $state<number | null>(null);
  let lastScanMissionCount = $state<number>(0);
  let sourceStatuses = $state<SourceStatus[]>([]);
  let isCheckingSources = $state(false);
  let enabledConnectorIds = $state<Set<string>>(new Set());
  let healthSnapshots = $state<Map<string, ConnectorHealthSnapshot>>(new Map());

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
    connectorStatuses = new Map();
    feedStore.load();

    try {
      // Envoyer SCAN_START au service worker — il gère toute l'orchestration
      const response = await sendMessage({ type: 'SCAN_START' });
      // Le SW renvoie SCAN_COMPLETE avec les missions traitées
      if (response.type === 'SCAN_COMPLETE' && Array.isArray(response.payload)) {
        await handleScanComplete(response.payload);
      } else if (response.type === 'SCAN_ERROR' && response.payload) {
        const { message, code } = response.payload as { message: string; code: string };
        feedStore.setError(humanizeScanError(message, code));
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[FeedController] startScan error:', err);
      }
      feedStore.setError(err instanceof Error ? err.message : 'Erreur inattendue lors du scan');
    } finally {
      isScanning = false;
      connectorStatuses = new Map();
    }
  }

  function stopScan(): void {
    sendMessage({ type: 'SCAN_CANCEL' }).catch(() => {
      // Service worker might not be available
    });
    isScanning = false;
    connectorStatuses = new Map();
  }

  /**
   * Reçoit les missions finalisées du service worker (déjà scored, deduped, semantic).
   * Plus de post-processing local — le SW fait tout.
   */
  async function handleScanComplete(missions: Mission[]): Promise<void> {
    if (import.meta.env.DEV) {
      console.log(
        '[FeedController] handleScanComplete received',
        missions.length,
        'missions from SW'
      );
    }

    // Merge avec cache pour résilience — les missions du scan frais ont priorité
    let cached: Mission[] = [];
    try {
      cached = await getMissions();
    } catch {
      /* Non-critical */
    }

    // Dedup: scan frais prioritaire sur le cache (scores à jour si profil changé)
    const unique = new Map<string, Mission>();
    // Cache d'abord (sera écrasé par le scan frais)
    for (const m of cached) {
      unique.set(m.id, m);
    }
    // Scan frais écrase le cache (scores recalculés)
    for (const m of missions) {
      unique.set(m.id, m);
    }
    const finalMissions = [...unique.values()];

    if (finalMissions.length > 0) {
      feedStore.setMissions(finalMissions);
      scanCompleted = true;

      // Compter par source pour l'affichage
      const counts = new Map<string, number>();
      for (const m of missions) {
        counts.set(m.source, (counts.get(m.source) ?? 0) + 1);
      }
      scanResultCounts = counts;
      lastScanAt = Date.now();
      lastScanMissionCount = missions.length;
    } else {
      feedStore.setError('Aucune mission trouvee');
    }

    // Recharger les statuts persistés pour le panneau SourceHealthPanel
    try {
      persistedStatuses = await getConnectorStatuses();
    } catch {
      /* Non-critical */
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
      const [stored, settings] = await Promise.all([getMissions(), getSettings()]);
      if (stored.length > 0) {
        feedStore.setMissions(stored);
        const result = await chrome.storage.local.get('lastGlobalSync');
        const lastSync = result.lastGlobalSync as number | undefined;
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
      const settings = await getSettings();
      const enabledIds = settings.enabledConnectors;
      const meta = getConnectorsMeta();
      const now = Date.now();

      // Build initial source statuses with "checking" state
      sourceStatuses = enabledIds.map((id) => {
        const m = meta.find((x) => x.id === id);
        return {
          connectorId: id,
          name: m?.name ?? id,
          icon: m?.icon ?? '',
          url: m?.url ?? '',
          sessionStatus: 'checking' as SourceSessionStatus,
          lastSyncAt: null,
        };
      });

      // Load connectors and detect sessions in parallel
      const connectors = await getConnectors(enabledIds);
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
      const lastSyncMap = new Map(lastSyncResults.map((r) => [r.id, r.lastSyncAt]));
      const resultMap = new Map(results.map((r) => [r.connectorId, r]));

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
    const updated = new Set(enabledConnectorIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    enabledConnectorIds = updated;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, enabledConnectors: [...updated] });
    } catch {
      /* Non-critical: settings persistence */
    }
  }

  // ============================================================
  // Bridge message listener setup
  // ============================================================

  function setupBridgeListener(): void {
    try {
      const listener = (message: BridgeMessage) => {
        // Progression détaillée pendant le scan
        if (message?.type === 'SCAN_PROGRESS' && message.payload) {
          const payload = message.payload;
          // Mettre à jour les états de connecteurs pour l'UI
          const updated = new Map<string, ConnectorStatus>();
          for (const cp of payload.connectorProgress) {
            updated.set(cp.connectorId, {
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
          connectorStatuses = updated;
        }

        if (message?.type === 'CONNECTOR_HEALTH_UPDATED' && message.payload?.snapshot) {
          const snap = message.payload.snapshot as ConnectorHealthSnapshot;
          healthSnapshots = new Map(healthSnapshots).set(snap.connectorId, snap);
        }

        // Résultat final du scan (auto-scan du background)
        if (message?.type === 'SCAN_COMPLETE' && Array.isArray(message.payload)) {
          handleScanComplete(message.payload).catch(() => {});
        }

        // Erreur du scan (auto-scan du background)
        if (message?.type === 'SCAN_ERROR' && message.payload) {
          const { message: errorMsg, code } = message.payload as { message: string; code: string };
          feedStore.setError(humanizeScanError(errorMsg, code));
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      bridgeListenerCleanup = () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
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
      enabledConnectorIds = new Set(settings.enabledConnectors);
    } catch {
      /* Non-critical */
    }

    // Load last scan timestamp
    try {
      const result = await chrome.storage.local.get('lastGlobalSync');
      if (result.lastGlobalSync) {
        lastScanAt = result.lastGlobalSync as number;
      }
    } catch {
      /* Non-critical */
    }

    // Setup bridge listener
    setupBridgeListener();

    // Check source sessions on mount
    checkSourceSessions();

    // Smart load initial data
    smartLoad();
  }

  // Run initialization
  init();

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

    // Methods
    startScan,
    stopScan,
    handleScanComplete,
    smartLoad,
    checkSourceSessions,
    handleToggleConnector,

    // Cleanup
    dispose,
  };
}
