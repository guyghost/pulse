import {
  getProfile,
  saveProfile,
  saveConnectorStatuses,
  getConnectorStatuses,
  getMissionById,
  getMissions,
} from '../lib/shell/storage/db';
import type {
  BridgeMessage,
  ScanProgressPayload,
  ConnectorProgress,
} from '../lib/shell/messaging/bridge';
import type { PersistedConnectorStatus } from '../lib/core/types/connector-status';
import type { AuthUser } from '../lib/core/types/auth';
import type { Mission } from '../lib/core/types/mission';
import type { MissionDuplicateRelation } from '../lib/core/scoring/dedup';
import { analyzeTJMHistory } from '../lib/core/tjm-history';
import type { TJMHistory, TJMRegion } from '../lib/core/types/tjm';
import {
  DEFAULT_SETTINGS,
  getFeedSortBy,
  getSettings,
  setFeedSortBy,
  setSettings,
} from '../lib/shell/storage/chrome-storage';
import {
  runScan,
  cancelCurrentScan,
  isScanRunning,
  ScanError,
  type ScanResult,
  type ConnectorScanState,
} from '../lib/shell/scan/scanner';
import { rescoreStoredMissions } from '../lib/shell/scan/rescore';
import { getConnectorIds, getConnectors } from '../lib/shell/connectors/index';
import { getSeenIds, saveSeenIds } from '../lib/shell/storage/seen-missions';
import { getFavorites, saveFavorites, getHidden, saveHidden } from '../lib/shell/storage/favorites';
import { setNewMissionCount, resetNewMissionCount } from '../lib/shell/storage/session-storage';
import { markAsSeen } from '../lib/core/seen/mark-seen';
import {
  notifyHighScoreMissions,
  setupNotificationClickHandler,
} from '../lib/shell/notifications/notify-missions';
import { clearExpiredSemanticCache } from '../lib/shell/storage/semantic-cache';
import { getAllHealthSnapshots, resetHealthSnapshot } from '../lib/shell/storage/connector-health';
import {
  clearFeedTourSeen,
  clearOnboardingCompleted,
  getFeedTourSeen,
  getFirstScanDone,
  getOnboardingCompleted,
  getProfileBannerDismissed,
  setFeedTourSeen,
  setFirstScanDone,
  setOnboardingCompleted,
  setProfileBannerDismissed,
} from '../lib/shell/storage/first-scan';
import { createDefaultProfile } from '../lib/core/profile/defaults';
import {
  getTracking,
  saveTracking,
  getAllTrackings,
  getTrackingsByStatus,
} from '../lib/shell/storage/tracking';
import {
  createTracking,
  transitionStatus,
  setTrackingNextActionAt,
  addGeneratedAssetAndMarkPrepared,
} from '../lib/core/tracking/transitions';
import {
  saveGeneratedAsset,
  getGeneratedAssetsForMission,
} from '../lib/shell/storage/generated-assets';
import { getSupabaseClient } from '../lib/shell/auth/supabase-client';
import { saveAuthUser, loadAuthUser, clearAuthUser } from '../lib/shell/auth/auth-storage';
import type { GeneratedAsset } from '../lib/core/types/generation';
import type { MissionTracking } from '../lib/core/types/tracking';
import type { CanonicalCandidateProfileDraft } from '../lib/core/profile-extractors/types';
import { generatePremium } from '../lib/shell/auth/premium-api';
import { validateMessage } from '../lib/shell/messaging/schemas';
import { classifyError } from '../lib/shell/messaging/error-boundary';
import { syncFavoriteMissionChange } from '../lib/shell/sync/favorite-missions';
import {
  getConnectedDashboardSyncStatus,
  syncConnectedDashboardScan,
  syncConnectedDashboardSnapshot,
  syncConnectedDashboardProfileExtractorHealth,
  syncConnectedDashboardProfileImport,
  syncConnectedDashboardTracking,
} from '../lib/shell/sync/connected-dashboard';
import { getProfileExtractor } from '../lib/shell/profile-extractors';
import { verifyProfilePage } from '../lib/shell/profile/profile-page-verification';
import { resetLocalData } from '../lib/shell/storage/local-data-reset';
import { loadTJMHistory } from '../lib/shell/storage/tjm-history';

if (import.meta.env.DEV) {
  console.debug('[MissionPulse] Service worker started');
}

type LinkedInProfilePreviewMessage = Extract<BridgeMessage, { type: 'LINKEDIN_PROFILE_PREVIEWED' }>;
type LinkedInProfileImportMessage = Extract<BridgeMessage, { type: 'LINKEDIN_PROFILE_IMPORTED' }>;

const CONNECTED_DASHBOARD_RETRY_SNAPSHOT_KEY = 'connectedDashboardRetrySnapshot';

type StoredMission = Omit<Mission, 'scrapedAt'> & { scrapedAt: string };

type ConnectedDashboardRetrySnapshot = {
  sourceMissions: StoredMission[];
  duplicateRelations: MissionDuplicateRelation[];
};

function serializeMissionForRetry(mission: Mission): StoredMission {
  return {
    ...mission,
    scrapedAt: mission.scrapedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStoredMission(value: unknown): Mission | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    !Array.isArray(value.stack) ||
    typeof value.url !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.scrapedAt !== 'string'
  ) {
    return null;
  }

  const scrapedAtMs = Date.parse(value.scrapedAt);
  if (!Number.isFinite(scrapedAtMs)) {
    return null;
  }

  return {
    ...(value as unknown as StoredMission),
    scrapedAt: new Date(scrapedAtMs),
  };
}

function buildTJMAnalysis(
  history: TJMHistory,
  profileStacks: string[] | undefined,
  region: TJMRegion | undefined
) {
  const hasStackFilter = profileStacks !== undefined && profileStacks.length > 0;
  const hasRegionFilter = region !== undefined;

  if (!hasStackFilter && !hasRegionFilter) {
    return analyzeTJMHistory(history);
  }

  const normalizedStacks = hasStackFilter
    ? new Set(profileStacks.map((stack) => stack.toLowerCase().trim()).filter(Boolean))
    : null;

  return analyzeTJMHistory({
    records: history.records.filter((record) => {
      if (normalizedStacks && !normalizedStacks.has(record.stack)) {
        return false;
      }
      if (hasRegionFilter && record.region !== region) {
        return false;
      }
      return true;
    }),
  });
}

function parseDuplicateRelation(value: unknown): MissionDuplicateRelation | null {
  if (
    !isRecord(value) ||
    typeof value.canonicalMissionId !== 'string' ||
    typeof value.duplicateMissionId !== 'string' ||
    typeof value.confidence !== 'number' ||
    typeof value.reason !== 'string'
  ) {
    return null;
  }

  return {
    canonicalMissionId: value.canonicalMissionId,
    duplicateMissionId: value.duplicateMissionId,
    confidence: value.confidence,
    reason: value.reason,
  };
}

async function saveConnectedDashboardRetrySnapshot(input: {
  sourceMissions: Mission[];
  duplicateRelations: MissionDuplicateRelation[];
}): Promise<void> {
  const snapshot: ConnectedDashboardRetrySnapshot = {
    sourceMissions: input.sourceMissions.map(serializeMissionForRetry),
    duplicateRelations: [...input.duplicateRelations],
  };
  await chrome.storage.local.set({ [CONNECTED_DASHBOARD_RETRY_SNAPSHOT_KEY]: snapshot });
}

async function loadConnectedDashboardRetrySnapshot(): Promise<{
  sourceMissions: Mission[];
  duplicateRelations: MissionDuplicateRelation[];
}> {
  const stored = await chrome.storage.local.get(CONNECTED_DASHBOARD_RETRY_SNAPSHOT_KEY);
  const snapshot = stored[CONNECTED_DASHBOARD_RETRY_SNAPSHOT_KEY];
  if (!isRecord(snapshot)) {
    return { sourceMissions: [], duplicateRelations: [] };
  }

  return {
    sourceMissions: Array.isArray(snapshot.sourceMissions)
      ? snapshot.sourceMissions.flatMap((mission) => {
          const parsed = parseStoredMission(mission);
          return parsed ? [parsed] : [];
        })
      : [],
    duplicateRelations: Array.isArray(snapshot.duplicateRelations)
      ? snapshot.duplicateRelations.flatMap((relation) => {
          const parsed = parseDuplicateRelation(relation);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

function buildAuthUserFromProfile(
  user: { id: string; email?: string | null },
  fallbackEmail: string,
  profile?: {
    subscription_status?: string | null;
    subscription_period_end?: string | null;
    credit_balance?: number | null;
  } | null
): AuthUser {
  const now = Date.now();
  let premiumStatus: AuthUser['premiumStatus'] = 'free';
  let premiumExpiresAt: number | null = null;

  if (profile?.subscription_status === 'premium') {
    const expiresAt = profile.subscription_period_end
      ? new Date(profile.subscription_period_end).getTime()
      : null;
    if (expiresAt && expiresAt > now) {
      premiumStatus = 'premium';
      premiumExpiresAt = expiresAt;
    } else if (expiresAt && expiresAt <= now) {
      premiumStatus = 'expired';
      premiumExpiresAt = expiresAt;
    } else {
      premiumStatus = 'premium';
    }
  }

  return {
    id: user.id,
    email: user.email ?? fallbackEmail,
    premiumStatus,
    premiumExpiresAt,
    creditBalance: profile?.credit_balance ?? 0,
  };
}

function getBridgeErrorCode(error: import('../lib/core/errors/app-error').AppError): string {
  const code = error.context?.profileExtractorCode;
  return typeof code === 'string' ? code : error.type;
}

function recordLinkedInExtractorHealth(input: {
  ok: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  occurredAt: Date;
}): void {
  syncConnectedDashboardProfileExtractorHealth({
    source: 'linkedin',
    ...input,
  }).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn('[MissionPulse] LinkedIn extractor health sync failed:', error);
    }
  });
}

async function previewLinkedInProfile(
  startedAt: number,
  tabId?: number
): Promise<LinkedInProfilePreviewMessage> {
  const extractor = getProfileExtractor('linkedin');
  const result = await extractor.extractProfile(startedAt, tabId);

  if (!result.ok) {
    const errorCode = getBridgeErrorCode(result.error);
    recordLinkedInExtractorHealth({
      ok: false,
      errorCode,
      errorMessage: result.error.message,
      occurredAt: new Date(startedAt),
    });
    return {
      type: 'LINKEDIN_PROFILE_PREVIEWED',
      payload: {
        extracted: false,
        errorCode,
        errorMessage: result.error.message,
      },
    };
  }

  return {
    type: 'LINKEDIN_PROFILE_PREVIEWED',
    payload: { extracted: true, profile: result.value },
  };
}

async function syncLinkedInProfileImport(
  profile: CanonicalCandidateProfileDraft,
  startedAt: number
): Promise<LinkedInProfileImportMessage> {
  const synced = await syncConnectedDashboardProfileImport(profile);
  if (!synced.ok) {
    recordLinkedInExtractorHealth({
      ok: false,
      errorCode: 'sync_failed',
      errorMessage: synced.error.message,
      occurredAt: new Date(startedAt),
    });
    return {
      type: 'LINKEDIN_PROFILE_IMPORTED',
      payload: {
        imported: false,
        errorCode: 'sync_failed',
        errorMessage: synced.error.message,
      },
    };
  }

  recordLinkedInExtractorHealth({
    ok: true,
    occurredAt: new Date(startedAt),
  });
  return {
    type: 'LINKEDIN_PROFILE_IMPORTED',
    payload: { imported: true, profile },
  };
}

// Trigger expired semantic cache cleanup on startup
clearExpiredSemanticCache().catch((err) => {
  console.warn('[MissionPulse] Failed to cleanup expired semantic cache:', err);
});

// Health snapshots are persisted across service worker wake-ups so the side panel
// can show the latest known connector state even when the worker hibernates.

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Rewrite Origin header for APIs that block chrome-extension:// origin
chrome.declarativeNetRequest
  .updateDynamicRules({
    removeRuleIds: [1, 2, 3],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.lehibou.com',
            },
            {
              header: 'Referer',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.lehibou.com/',
            },
          ],
        },
        condition: {
          urlFilter: 'api.lehibou.com',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
      {
        id: 2,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://app.collective.work',
            },
            {
              header: 'Referer',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://app.collective.work/',
            },
          ],
        },
        condition: {
          urlFilter: 'api.collective.work',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
      {
        id: 3,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.free-work.com',
            },
            {
              header: 'Referer',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: 'https://www.free-work.com/',
            },
          ],
        },
        condition: {
          urlFilter: 'free-work.com/api',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
    ],
  })
  .catch((err) => {
    console.warn('[MissionPulse] Failed to set header rewrite rules:', err);
  });

// Setup notification click handler
setupNotificationClickHandler();

// ── Scan orchestration helpers ──

/**
 * Convertit les ConnectorScanState du scanner en ConnectorProgress pour le bridge.
 */
function toConnectorProgress(states: ConnectorScanState[]): ConnectorProgress[] {
  return states.map((s) => ({
    connectorId: s.connectorId,
    connectorName: s.connectorName,
    state: s.state,
    missionsCount: s.missionsCount,
    error: s.error,
    retryCount: s.retryCount,
  }));
}

/**
 * Envoie un message SCAN_PROGRESS au side panel (si ouvert).
 * Les erreurs de messaging sont ignorées (panel peut être fermé).
 */
function sendScanProgress(payload: ScanProgressPayload): void {
  chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS', payload }).catch(() => {
    // Side panel not open, ignore
  });
}

/**
 * Gère un SCAN_START initié par le side panel.
 * Lance runScan() avec un callback de progression qui envoie SCAN_PROGRESS au panel.
 * Retourne les missions scannées.
 */
async function handleScanStartFromPanel(): Promise<import('../lib/core/types/mission').Mission[]> {
  // Si un scan est déjà en cours, retourner vide (mutex du scanner)
  if (isScanRunning()) {
    if (import.meta.env.DEV) {
      console.debug('[MissionPulse] SCAN_START ignored — scan already in progress');
    }
    return [];
  }

  const result = await runScan(
    undefined, // signal (panel can use SCAN_CANCEL instead)
    undefined, // onProgress (legacy)
    {
      pageDelayMs: 500,
      onDetailedProgress: (info) => {
        sendScanProgress({
          phase: info.phase,
          current: info.current,
          total: info.total,
          connectorProgress: toConnectorProgress(info.connectorStates),
        });
      },
    }
  );

  // Persist connector statuses + update badge (same as alarm handler)
  await persistScanResults(result);

  return result.missions;
}

/**
 * Persiste les résultats de scan: statuts connecteurs, badge, notifications.
 * Partagé entre l'alarm handler et le SCAN_START handler.
 */
async function clearNewMissionBadge(): Promise<void> {
  await setNewMissionCount(0);
  await chrome.action.setBadgeText({ text: '' });
}

async function loadConnectorHealthSnapshots() {
  const now = Date.now();
  const connectorIds = getConnectorIds();
  const snapshots = await getAllHealthSnapshots(connectorIds, now);
  return [...snapshots.values()];
}

async function loadGeneratedAssetsByMissionId(
  trackings: MissionTracking[]
): Promise<Map<string, GeneratedAsset[]>> {
  const entries = await Promise.all(
    trackings.map(async (tracking) => {
      const assets = await getGeneratedAssetsForMission(tracking.missionId);
      return [tracking.missionId, assets] as const;
    })
  );

  return new Map(entries.filter(([, assets]) => assets.length > 0));
}

async function recheckConnectorHealth(
  connectorId: string,
  enable = false
): Promise<import('../lib/core/types/mission').Mission[]> {
  const settings = await getSettings();
  const persistedEnabled = enable
    ? Array.from(new Set([...settings.enabledConnectors, connectorId]))
    : settings.enabledConnectors;

  await resetHealthSnapshot(connectorId);
  await setSettings({ ...settings, enabledConnectors: [connectorId] });

  try {
    const result = await runScan(undefined, undefined, { pageDelayMs: 300 });
    await persistScanResults(result);

    try {
      await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
    } catch {
      // Side panel not open, ignore
    }

    return result.missions;
  } finally {
    await setSettings({ ...settings, enabledConnectors: persistedEnabled });
  }
}

async function syncConnectedDashboardFromLocalState() {
  const [missions, trackings, healthSnapshots] = await Promise.all([
    getMissions(),
    getAllTrackings(),
    loadConnectorHealthSnapshots(),
  ]);
  const retrySnapshot = await loadConnectedDashboardRetrySnapshot();
  const generatedAssetsByMissionId = await loadGeneratedAssetsByMissionId(trackings);
  return syncConnectedDashboardSnapshot({
    missions,
    sourceMissions: retrySnapshot.sourceMissions,
    duplicateRelations: retrySnapshot.duplicateRelations,
    trackings,
    generatedAssetsByMissionId,
    healthSnapshots,
  });
}

async function persistScanResults(
  result: Pick<ScanResult, 'missions' | 'sourceMissions' | 'duplicateRelations' | 'errors'>
): Promise<void> {
  const { missions, errors } = result;
  const now = Date.now();

  // Persist connector statuses
  const statusMap = new Map<string, { missions: number; error: string | null }>();
  for (const mission of missions) {
    const entry = statusMap.get(mission.source) ?? { missions: 0, error: null };
    entry.missions++;
    statusMap.set(mission.source, entry);
  }
  for (const err of errors) {
    const entry = statusMap.get(err.connectorId) ?? { missions: 0, error: null };
    entry.error = err.message;
    statusMap.set(err.connectorId, entry);
  }
  const persistedStatuses: PersistedConnectorStatus[] = [...statusMap.entries()].map(
    ([id, data]) => ({
      connectorId: id,
      connectorName: id,
      lastState: data.error && data.missions === 0 ? 'error' : 'done',
      missionsCount: data.missions,
      error: data.error ? { type: 'connector', message: data.error } : null,
      lastSyncAt: now,
      lastSuccessAt: data.missions > 0 ? now : null,
    })
  );
  try {
    await saveConnectorStatuses(persistedStatuses);
  } catch {
    /* Non-critical: status persistence */
  }

  try {
    await saveConnectedDashboardRetrySnapshot({
      sourceMissions: result.sourceMissions ?? missions,
      duplicateRelations: result.duplicateRelations ?? [],
    });
  } catch {
    /* Non-critical: retry snapshot */
  }

  try {
    const healthSnapshots = await loadConnectorHealthSnapshots();
    await syncConnectedDashboardScan(missions, healthSnapshots, {
      sourceMissions: result.sourceMissions,
      duplicateRelations: result.duplicateRelations,
    });
  } catch {
    /* Non-critical: connected dashboard sync */
  }

  if (missions.length === 0) {
    await clearNewMissionBadge();
    return;
  }

  // Update badge with new mission count
  const seenIds = await getSeenIds();
  const seenSet = new Set(seenIds);
  const newMissions = missions.filter((m) => !seenSet.has(m.id));
  const newCount = newMissions.length;

  if (newCount > 0) {
    await setNewMissionCount(newCount);
    await chrome.action.setBadgeText({ text: String(newCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } else {
    await clearNewMissionBadge();
  }

  // Send notifications for high-score missions if enabled
  if (newCount > 0) {
    const notification = await notifyHighScoreMissions(newMissions);
    if (notification.shown && notification.notifiedMissionIds.length > 0) {
      await saveSeenIds(markAsSeen(seenIds, notification.notifiedMissionIds));
    }
  }
}

// Message handler — profile management + scan orchestration
chrome.runtime.onMessage.addListener((rawMessage: unknown, _sender, sendResponse) => {
  // ── Input validation ──────────────────────────────────────────────────────
  const validation = validateMessage(rawMessage);
  if (!validation.valid) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Bridge] Validation failed for "${validation.messageType ?? 'unknown'}":`,
        validation.errors,
        { sender: _sender.id ?? _sender.tab?.id }
      );
    }
    sendResponse({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: validation.errors.join('; ') },
    });
    return false;
  }

  // Cast validé — le message a passé les schémas Zod
  const message = rawMessage as BridgeMessage;

  // ── Error boundary global ─────────────────────────────────────────────────
  // Chaque branche a son propre try/catch mais cette enveloppe protège contre
  // toute exception imprévue qui sinon crasherait le service worker.
  try {
    if (message.type === 'GET_PROFILE') {
      getProfile().then((profile) => {
        sendResponse({ type: 'PROFILE_RESULT', payload: profile });
      });
      return true;
    }

    if (message.type === 'SAVE_PROFILE') {
      (async () => {
        try {
          await saveProfile(message.payload);

          try {
            const rescored = await rescoreStoredMissions(message.payload);
            await chrome.runtime.sendMessage({ type: 'MISSIONS_UPDATED', payload: rescored });
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[MissionPulse] Profile saved but mission rescore failed:', err);
            }
          }

          sendResponse({ type: 'PROFILE_RESULT', payload: message.payload });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[MissionPulse] SAVE_PROFILE via bridge (legacy):', message);
          sendResponse({ type: 'PROFILE_RESULT', payload: null });
        }
      })();
      return true;
    }

    if (message.type === 'GET_SETTINGS') {
      getSettings()
        .then((settings) => {
          sendResponse({ type: 'SETTINGS_RESULT', payload: settings });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_SETTINGS error:', err);
          sendResponse({ type: 'SETTINGS_RESULT', payload: DEFAULT_SETTINGS });
        });
      return true;
    }

    if (message.type === 'SAVE_SETTINGS') {
      setSettings(message.payload)
        .then(() => {
          chrome.runtime
            .sendMessage({ type: 'SETTINGS_UPDATED', payload: message.payload })
            .catch(() => {
              // Side panel may be closed.
            });
          sendResponse({
            type: 'SETTINGS_SAVED',
            payload: { saved: true, settings: message.payload },
          });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_SETTINGS error:', err);
          sendResponse({ type: 'SETTINGS_SAVED', payload: { saved: false, settings: null } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_MISSIONS') {
      getMissions()
        .then((missions) => {
          sendResponse({ type: 'FEED_MISSIONS_RESULT', payload: missions });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_MISSIONS error:', err);
          sendResponse({ type: 'FEED_MISSIONS_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'GET_TJM_ANALYSIS') {
      loadTJMHistory()
        .then((history) => {
          sendResponse({
            type: 'TJM_ANALYSIS_RESULT',
            payload: {
              analysis: buildTJMAnalysis(
                history,
                message.payload?.profileStacks,
                message.payload?.region
              ),
            },
          });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_TJM_ANALYSIS error:', err);
          sendResponse({ type: 'TJM_ANALYSIS_RESULT', payload: { analysis: null } });
        });
      return true;
    }

    if (message.type === 'GET_PERSISTED_CONNECTOR_STATUSES') {
      getConnectorStatuses()
        .then((statuses) => {
          sendResponse({ type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: statuses });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PERSISTED_CONNECTOR_STATUSES error:', err);
          sendResponse({ type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'GET_FEED_FAVORITES') {
      getFavorites()
        .then((favorites) => {
          sendResponse({ type: 'FEED_FAVORITES_RESULT', payload: favorites });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_FAVORITES error:', err);
          sendResponse({ type: 'FEED_FAVORITES_RESULT', payload: {} });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_FAVORITES') {
      saveFavorites(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_FAVORITES_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_FAVORITES error:', err);
          sendResponse({ type: 'FEED_FAVORITES_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_HIDDEN') {
      getHidden()
        .then((hidden) => {
          sendResponse({ type: 'FEED_HIDDEN_RESULT', payload: hidden });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_HIDDEN error:', err);
          sendResponse({ type: 'FEED_HIDDEN_RESULT', payload: {} });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_HIDDEN') {
      saveHidden(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_HIDDEN_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_HIDDEN error:', err);
          sendResponse({ type: 'FEED_HIDDEN_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_SORT') {
      getFeedSortBy()
        .then((sortBy) => {
          sendResponse({ type: 'FEED_SORT_RESULT', payload: sortBy });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_SORT error:', err);
          sendResponse({ type: 'FEED_SORT_RESULT', payload: 'score' });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_SORT') {
      setFeedSortBy(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_SORT_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_SORT error:', err);
          sendResponse({ type: 'FEED_SORT_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_SEEN_MISSIONS') {
      getSeenIds()
        .then((seenIds) => {
          sendResponse({ type: 'SEEN_MISSIONS_RESULT', payload: seenIds });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_SEEN_MISSIONS error:', err);
          sendResponse({ type: 'SEEN_MISSIONS_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'SAVE_SEEN_MISSIONS') {
      saveSeenIds(message.payload)
        .then(() => {
          sendResponse({ type: 'SEEN_MISSIONS_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_SEEN_MISSIONS error:', err);
          sendResponse({ type: 'SEEN_MISSIONS_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'RESET_NEW_MISSION_COUNT') {
      resetNewMissionCount()
        .then(() => {
          sendResponse({ type: 'NEW_MISSION_COUNT_RESET', payload: { reset: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] RESET_NEW_MISSION_COUNT error:', err);
          sendResponse({ type: 'NEW_MISSION_COUNT_RESET', payload: { reset: false } });
        });
      return true;
    }

    if (message.type === 'CLEAR_EXTENSION_BADGE') {
      chrome.action
        .setBadgeText({ text: '' })
        .then(() => {
          sendResponse({ type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CLEAR_EXTENSION_BADGE error:', err);
          sendResponse({ type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: false } });
        });
      return true;
    }

    if (message.type === 'OPEN_EXTERNAL_URL') {
      chrome.tabs
        .create({ url: message.payload.url })
        .then(() => {
          sendResponse({ type: 'EXTERNAL_URL_OPENED', payload: { opened: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] OPEN_EXTERNAL_URL error:', err);
          sendResponse({ type: 'EXTERNAL_URL_OPENED', payload: { opened: false } });
        });
      return true;
    }

    if (message.type === 'GET_FIRST_SCAN_DONE') {
      getFirstScanDone()
        .then((done) => {
          sendResponse({ type: 'FIRST_SCAN_DONE_RESULT', payload: done });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FIRST_SCAN_DONE error:', err);
          sendResponse({ type: 'FIRST_SCAN_DONE_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'GET_PROFILE_BANNER_DISMISSED') {
      getProfileBannerDismissed()
        .then((dismissed) => {
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_RESULT', payload: dismissed });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PROFILE_BANNER_DISMISSED error:', err);
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_PROFILE_BANNER_DISMISSED') {
      setProfileBannerDismissed()
        .then(() => {
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_PROFILE_BANNER_DISMISSED error:', err);
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_ONBOARDING_COMPLETED') {
      getOnboardingCompleted()
        .then((completed) => {
          sendResponse({ type: 'ONBOARDING_COMPLETED_RESULT', payload: completed });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_ONBOARDING_COMPLETED error:', err);
          sendResponse({ type: 'ONBOARDING_COMPLETED_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_ONBOARDING_COMPLETED') {
      setOnboardingCompleted()
        .then(() => {
          sendResponse({ type: 'ONBOARDING_COMPLETED_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_ONBOARDING_COMPLETED error:', err);
          sendResponse({ type: 'ONBOARDING_COMPLETED_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'CLEAR_ONBOARDING_COMPLETED') {
      clearOnboardingCompleted()
        .then(() => {
          sendResponse({ type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CLEAR_ONBOARDING_COMPLETED error:', err);
          sendResponse({ type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_TOUR_SEEN') {
      getFeedTourSeen()
        .then((seen) => {
          sendResponse({ type: 'FEED_TOUR_SEEN_RESULT', payload: seen });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_TOUR_SEEN error:', err);
          sendResponse({ type: 'FEED_TOUR_SEEN_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_FEED_TOUR_SEEN') {
      setFeedTourSeen()
        .then(() => {
          sendResponse({ type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_FEED_TOUR_SEEN error:', err);
          sendResponse({ type: 'FEED_TOUR_SEEN_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'CLEAR_FEED_TOUR_SEEN') {
      clearFeedTourSeen()
        .then(() => {
          sendResponse({ type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CLEAR_FEED_TOUR_SEEN error:', err);
          sendResponse({ type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: false } });
        });
      return true;
    }

    if (message.type === 'VERIFY_PROFILE_PAGE') {
      verifyProfilePage(message.payload.url, message.payload.fields)
        .then((result) => {
          sendResponse({ type: 'PROFILE_PAGE_VERIFIED', payload: result });
        })
        .catch((err) => {
          sendResponse({
            type: 'PROFILE_PAGE_VERIFIED',
            payload: {
              read: {
                status: 'blocked',
                finalUrl: message.payload.url,
                reason: err instanceof Error ? err.message : 'Erreur inconnue',
              },
              comparisons: [],
              summary: { matches: 0, mismatches: 0, missing: 0 },
            },
          });
        });
      return true;
    }

    if (message.type === 'PREVIEW_LINKEDIN_PROFILE') {
      const startedAt = Date.now();
      previewLinkedInProfile(startedAt, message.payload?.tabId)
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          recordLinkedInExtractorHealth({
            ok: false,
            errorCode: 'dom_changed',
            errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            occurredAt: new Date(startedAt),
          });
          sendResponse({
            type: 'LINKEDIN_PROFILE_PREVIEWED',
            payload: {
              extracted: false,
              errorCode: 'dom_changed',
              errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            },
          });
        });
      return true;
    }

    if (message.type === 'SYNC_LINKEDIN_PROFILE_IMPORT') {
      const startedAt = Date.now();
      syncLinkedInProfileImport(message.payload.profile, startedAt)
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          recordLinkedInExtractorHealth({
            ok: false,
            errorCode: 'sync_failed',
            errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            occurredAt: new Date(startedAt),
          });
          sendResponse({
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: {
              imported: false,
              errorCode: 'sync_failed',
              errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            },
          });
        });
      return true;
    }

    if (message.type === 'IMPORT_LINKEDIN_PROFILE') {
      const startedAt = Date.now();
      previewLinkedInProfile(startedAt, message.payload?.tabId)
        .then(async (preview) => {
          if (!preview.payload.extracted) {
            sendResponse({
              type: 'LINKEDIN_PROFILE_IMPORTED',
              payload: {
                imported: false,
                errorCode: preview.payload.errorCode,
                errorMessage: preview.payload.errorMessage,
              },
            });
            return;
          }

          const response = await syncLinkedInProfileImport(preview.payload.profile, startedAt);
          sendResponse(response);
        })
        .catch((error) => {
          recordLinkedInExtractorHealth({
            ok: false,
            errorCode: 'dom_changed',
            errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            occurredAt: new Date(startedAt),
          });
          sendResponse({
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: {
              imported: false,
              errorCode: 'dom_changed',
              errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            },
          });
        });
      return true;
    }

    // ── Scan orchestration (panel → service worker) ──

    if (message.type === 'SCAN_START') {
      handleScanStartFromPanel()
        .then((missions) => {
          sendResponse({ type: 'SCAN_COMPLETE', payload: missions });
        })
        .catch((err) => {
          console.error('[MissionPulse] SCAN_START error:', err);
          const code = err instanceof ScanError ? err.code : 'UNKNOWN';
          const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue lors du scan';
          sendResponse({ type: 'SCAN_ERROR', payload: { message: errorMessage, code } });
        });
      return true; // async response
    }

    if (message.type === 'SCAN_CANCEL') {
      cancelCurrentScan();
      sendResponse({ type: 'SCAN_CANCEL' });
      return false;
    }

    if (message.type === 'GET_CONNECTOR_HEALTH') {
      loadConnectorHealthSnapshots()
        .then((snapshots) => {
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: snapshots });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_CONNECTOR_HEALTH error:', err);
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'RECHECK_CONNECTOR_HEALTH') {
      const { connectorId, enable = false } = message.payload;
      recheckConnectorHealth(connectorId, enable)
        .then(async () => {
          const snapshots = await loadConnectorHealthSnapshots();
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: snapshots });
        })
        .catch(async (err) => {
          console.warn('[MissionPulse] RECHECK_CONNECTOR_HEALTH error:', err);
          const snapshots = await loadConnectorHealthSnapshots();
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: snapshots });
        });
      return true;
    }

    // ── Tracking handlers ──

    if (message.type === 'UPDATE_TRACKING') {
      const { missionId, status, note } = message.payload;
      const now = Date.now();

      (async () => {
        try {
          let tracking = await getTracking(missionId);
          if (!tracking) {
            tracking = createTracking(missionId, now);
          }

          const updated = transitionStatus(tracking, status, now, note ?? null);
          if (!updated) {
            sendResponse({
              type: 'TRACKING_UPDATED',
              payload: tracking,
            });
            return;
          }

          await saveTracking(updated);
          syncConnectedDashboardTracking(missionId).catch(() => {
            /* Non-critical: connected dashboard sync */
          });
          sendResponse({ type: 'TRACKING_UPDATED', payload: updated });
        } catch (err) {
          console.error('[MissionPulse] UPDATE_TRACKING error:', err);
          sendResponse({
            type: 'TRACKING_UPDATED',
            payload: {
              missionId,
              currentStatus: status,
              history: [],
              generatedAssetIds: [],
              userRating: null,
              notes: '',
              nextActionAt: null,
            },
          });
        }
      })();
      return true;
    }

    if (message.type === 'UPDATE_TRACKING_DETAILS') {
      const { missionId, nextActionAt } = message.payload;

      (async () => {
        try {
          const tracking = (await getTracking(missionId)) ?? createTracking(missionId, Date.now());
          const updated =
            nextActionAt === undefined ? tracking : setTrackingNextActionAt(tracking, nextActionAt);

          await saveTracking(updated);
          syncConnectedDashboardTracking(missionId).catch(() => {
            /* Non-critical: connected dashboard sync */
          });
          sendResponse({ type: 'TRACKING_UPDATED', payload: updated });
        } catch (err) {
          console.error('[MissionPulse] UPDATE_TRACKING_DETAILS error:', err);
          sendResponse({
            type: 'TRACKING_UPDATED',
            payload: {
              missionId,
              currentStatus: 'detected',
              history: [],
              generatedAssetIds: [],
              userRating: null,
              notes: '',
              nextActionAt: nextActionAt ?? null,
            },
          });
        }
      })();
      return true;
    }

    if (message.type === 'GET_TRACKINGS') {
      const { status } = message.payload ?? {};
      const query = status ? getTrackingsByStatus(status) : getAllTrackings();

      query
        .then((trackings) => {
          sendResponse({ type: 'TRACKINGS_RESULT', payload: trackings });
        })
        .catch((err) => {
          console.error('[MissionPulse] GET_TRACKINGS error:', err);
          sendResponse({ type: 'TRACKINGS_RESULT', payload: [] });
        });
      return true;
    }

    // ── Generation handlers ──

    if (message.type === 'GENERATE_ASSET') {
      const { missionId, generationType } = message.payload;

      (async () => {
        try {
          const mission = await getMissionById(missionId);
          if (!mission) {
            sendResponse({ type: 'GENERATION_RESULT', payload: { asset: null } });
            return;
          }

          const profile = await getProfile();
          if (!profile) {
            sendResponse({ type: 'GENERATION_RESULT', payload: { asset: null } });
            return;
          }

          let asset: GeneratedAsset | null = null;
          let creditBalance: number | undefined;
          let creditsConsumed: number | undefined;

          const authUser = await loadAuthUser();
          if (!authUser) {
            sendResponse({
              type: 'GENERATION_RESULT',
              payload: { asset: null, error: 'INSUFFICIENT_CREDITS', creditBalance: 0 },
            });
            return;
          }

          const premiumResult = await generatePremium(missionId, generationType, mission, profile);
          if (premiumResult.error === 'INSUFFICIENT_CREDITS') {
            sendResponse({
              type: 'GENERATION_RESULT',
              payload: {
                asset: null,
                error: 'INSUFFICIENT_CREDITS',
                creditBalance: premiumResult.creditBalance ?? 0,
                creditsConsumed: premiumResult.creditsConsumed ?? 0,
              },
            });
            return;
          }
          asset = premiumResult.asset;
          creditBalance = premiumResult.creditBalance;
          creditsConsumed = premiumResult.creditsConsumed;

          if (!asset) {
            sendResponse({
              type: 'GENERATION_RESULT',
              payload: { asset: null, error: 'GENERATION_FAILED' },
            });
            return;
          }

          // Persist the generated asset
          await saveGeneratedAsset(asset);

          // Update tracking to reference the new asset
          let tracking = await getTracking(missionId);
          if (!tracking) {
            tracking = createTracking(missionId, Date.now());
          }
          const updatedTracking = addGeneratedAssetAndMarkPrepared(tracking, asset.id, Date.now());
          await saveTracking(updatedTracking);
          syncConnectedDashboardTracking(missionId).catch(() => {
            /* Non-critical: connected dashboard sync */
          });

          if (typeof creditBalance === 'number' && authUser) {
            await saveAuthUser({ ...authUser, creditBalance });
          }

          sendResponse({
            type: 'GENERATION_RESULT',
            payload: { asset, creditBalance, creditsConsumed },
          });
        } catch (err) {
          console.error('[MissionPulse] GENERATE_ASSET error:', err);
          sendResponse({
            type: 'GENERATION_RESULT',
            payload: { asset: null, error: 'GENERATION_FAILED' },
          });
        }
      })();
      return true;
    }

    if (message.type === 'GET_GENERATED_ASSETS') {
      const { missionId } = message.payload;

      getGeneratedAssetsForMission(missionId)
        .then((assets) => {
          sendResponse({ type: 'GENERATED_ASSETS_RESULT', payload: assets });
        })
        .catch((err) => {
          console.error('[MissionPulse] GET_GENERATED_ASSETS error:', err);
          sendResponse({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
        });
      return true;
    }

    // ── Auth handlers ──

    if (message.type === 'AUTH_LOGIN') {
      const { email, password } = message.payload;
      const supabase = getSupabaseClient();

      (async () => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error || !data.user) {
            sendResponse({
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: error?.message ?? 'Login failed',
              },
            });
            return;
          }

          // Query profiles table for premium and credit status
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_status, subscription_period_end, credit_balance')
            .eq('id', data.user.id)
            .single();

          const authUser = buildAuthUserFromProfile(data.user, email, profile);

          await saveAuthUser(authUser);
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'authenticated', user: authUser },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Login failed';
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'unauthenticated', user: null, error: msg },
          });
        }
      })();
      return true;
    }

    if (message.type === 'AUTH_SIGNUP') {
      const { email, password } = message.payload;
      const supabase = getSupabaseClient();

      (async () => {
        try {
          const { data, error } = await supabase.auth.signUp({ email, password });
          if (error || !data.user) {
            sendResponse({
              type: 'AUTH_RESULT',
              payload: {
                status: 'unauthenticated',
                user: null,
                error: error?.message ?? 'Signup failed',
              },
            });
            return;
          }

          // New users start as free — the trigger creates the profile row
          const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email ?? email,
            premiumStatus: 'free',
            premiumExpiresAt: null,
            creditBalance: 0,
          };

          await saveAuthUser(authUser);
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'authenticated', user: authUser },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Signup failed';
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'unauthenticated', user: null, error: msg },
          });
        }
      })();
      return true;
    }

    if (message.type === 'AUTH_LOGOUT') {
      const supabase = getSupabaseClient();

      (async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Session may already be gone — ignore
        }
        await clearAuthUser();
        sendResponse({ type: 'AUTH_RESULT', payload: { status: 'unauthenticated', user: null } });
      })();
      return true;
    }

    if (message.type === 'AUTH_STATUS') {
      const supabase = getSupabaseClient();

      (async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.user) {
            // No active session — try cached user
            const cached = await loadAuthUser();
            if (cached) {
              sendResponse({
                type: 'AUTH_RESULT',
                payload: { status: 'authenticated', user: cached },
              });
            } else {
              sendResponse({
                type: 'AUTH_RESULT',
                payload: { status: 'unauthenticated', user: null },
              });
            }
            return;
          }

          // Active session — refresh premium and credit status from profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_status, subscription_period_end, credit_balance')
            .eq('id', session.user.id)
            .single();

          const authUser = buildAuthUserFromProfile(session.user, '', profile);

          await saveAuthUser(authUser);
          sendResponse({
            type: 'AUTH_RESULT',
            payload: { status: 'authenticated', user: authUser },
          });
        } catch {
          // On any error, fall back to cache
          const cached = await loadAuthUser();
          sendResponse({
            type: 'AUTH_RESULT',
            payload: cached
              ? { status: 'authenticated', user: cached }
              : { status: 'unknown', user: null },
          });
        }
      })();
      return true;
    }

    // ── Account sync handlers ──

    if (message.type === 'SYNC_FAVORITE_MISSION') {
      const { missionId, favoritedAt } = message.payload;

      syncFavoriteMissionChange(missionId, favoritedAt)
        .then((result) => {
          sendResponse({
            type: 'FAVORITE_MISSION_SYNCED',
            payload: {
              missionId,
              synced: result.synced,
              ...(!result.synced ? { reason: result.reason } : {}),
            },
          });
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[MissionPulse] SYNC_FAVORITE_MISSION error:', err);
          }
          sendResponse({
            type: 'FAVORITE_MISSION_SYNCED',
            payload: { missionId, synced: false, reason: 'remote-error' },
          });
        });
      return true;
    }

    if (message.type === 'GET_CONNECTED_SYNC_STATUS') {
      getConnectedDashboardSyncStatus()
        .then((status) => {
          sendResponse({ type: 'CONNECTED_SYNC_STATUS_RESULT', payload: status });
        })
        .catch(() => {
          sendResponse({
            type: 'CONNECTED_SYNC_STATUS_RESULT',
            payload: { authenticated: false, installId: null, lastGlobalSync: null, entities: [] },
          });
        });
      return true;
    }

    if (message.type === 'SYNC_CONNECTED_DASHBOARD' || message.type === 'RETRY_CONNECTED_SYNC') {
      syncConnectedDashboardFromLocalState()
        .then((result) => {
          if (!result.ok) {
            sendResponse({
              type: 'CONNECTED_DASHBOARD_SYNCED',
              payload: { synced: false, reason: result.error.code },
            });
            return;
          }
          sendResponse({
            type: 'CONNECTED_DASHBOARD_SYNCED',
            payload: {
              synced: true,
              missions: result.value.missions,
              applications: result.value.applications,
              skippedApplications: result.value.skippedApplications,
              connectorHealth: result.value.connectorHealth,
            },
          });
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.warn(`[MissionPulse] ${message.type} error:`, err);
          }
          sendResponse({
            type: 'CONNECTED_DASHBOARD_SYNCED',
            payload: { synced: false, reason: 'remote-error' },
          });
        });
      return true;
    }

    // ── Toast handler (forward to side panel) ──

    if (message.type === 'SHOW_TOAST') {
      chrome.runtime.sendMessage(message).catch(() => {
        // Side panel not open, ignore
      });
      sendResponse({ type: 'TOAST_SHOWN' });
      return false;
    }

    // ── Profile broadcast ──

    if (message.type === 'PROFILE_UPDATED') {
      chrome.runtime.sendMessage(message).catch(() => {
        // No listeners, ignore
      });
      return false;
    }

    if (message.type === 'RESET_LOCAL_DATA') {
      resetLocalData()
        .then(() => {
          sendResponse({ type: 'LOCAL_DATA_RESET', payload: { reset: true } });
        })
        .catch((err) => {
          sendResponse({
            type: 'LOCAL_DATA_RESET',
            payload: {
              reset: false,
              reason: err instanceof Error ? err.message : 'Erreur inconnue',
            },
          });
        });
      return true;
    }
  } catch (err: unknown) {
    // Error boundary — protège le service worker contre les crashes inattendus
    const category = classifyError(err);
    const errMessage = err instanceof Error ? err.message : String(err);

    if (import.meta.env.DEV) {
      console.error('[Bridge] Unhandled error in message handler:', {
        category,
        message: errMessage,
        messageType: (rawMessage as Record<string, unknown>)?.type,
      });
    }

    try {
      sendResponse({ success: false, error: { code: category, message: errMessage } });
    } catch {
      // sendResponse peut échouer si le canal est déjà fermé
    }
    return false;
  }
});

const ALARM_NAME = 'auto-scan';

async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clearAll();
  if (settings.autoScan) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.scanIntervalMinutes,
    });
    if (import.meta.env.DEV) {
      console.debug(`[MissionPulse] Auto-scan alarm set: every ${settings.scanIntervalMinutes}min`);
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) {
    return;
  }
  if (import.meta.env.DEV) {
    console.debug('[MissionPulse] Auto-scan triggered');
  }
  try {
    const result = await runScan(undefined, undefined, {
      pageDelayMs: 500,
      onDetailedProgress: (info) => {
        // Envoyer la progression au panel (si ouvert)
        sendScanProgress({
          phase: info.phase,
          current: info.current,
          total: info.total,
          connectorProgress: toConnectorProgress(info.connectorStates),
        });
      },
    });

    // Persist results + badge + notifications (shared logic)
    await persistScanResults(result);

    // Notify side panel with final missions (for immediate UI update)
    if (result.missions.length > 0) {
      try {
        await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
      } catch {
        // Side panel not open, ignore
      }
    }
  } catch (err) {
    console.error('[MissionPulse] Auto-scan error:', err);
    const code = err instanceof ScanError ? err.code : 'UNKNOWN';
    const errorMessage =
      err instanceof Error ? err.message : 'Erreur inconnue lors du scan automatique';
    try {
      await chrome.runtime.sendMessage({
        type: 'SCAN_ERROR',
        payload: { message: errorMessage, code },
      });
    } catch {
      // Side panel not open, ignore
    }
  }
});

// Re-setup alarm when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    setupAlarm();
  }
});

// Initial setup
setupAlarm();

// ── First-install silent scan ──────────────────────────────────────────────────
// On fresh install: detect active platform sessions in parallel.
// If any found, run a silent scan with a default profile so the user
// lands directly on a populated feed — no wizard required.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') {
    return;
  }

  if (import.meta.env.DEV) {
    console.debug('[MissionPulse] Fresh install — starting zero-config first scan');
  }

  try {
    // Already done? (shouldn't happen on fresh install, but guard anyway)
    const alreadyDone = await getFirstScanDone();
    if (alreadyDone) {
      return;
    }

    // Detect active sessions across all connectors in parallel
    const settings = await getSettings();
    const allConnectors = await getConnectors(settings.enabledConnectors);
    const now = Date.now();
    const sessionResults = await Promise.allSettled(allConnectors.map((c) => c.detectSession(now)));

    const activeConnectorIds: string[] = allConnectors
      .filter((_c, i) => {
        const r = sessionResults[i];
        return r.status === 'fulfilled' && r.value.ok && r.value.value === true;
      })
      .map((c) => c.id);

    if (activeConnectorIds.length === 0) {
      // No sessions — user will go through normal onboarding
      if (import.meta.env.DEV) {
        console.debug('[MissionPulse] No active sessions found on install, skipping first scan');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.debug(
        `[MissionPulse] Found ${activeConnectorIds.length} active session(s):`,
        activeConnectorIds
      );
    }

    // Temporarily restrict scan to only connectors with active sessions
    const previousEnabled = settings.enabledConnectors;
    await setSettings({ ...settings, enabledConnectors: activeConnectorIds });

    // Run silent scan with an explicit default profile so missions are scored
    // even before the user completes onboarding.
    const result = await runScan(undefined, undefined, {
      pageDelayMs: 300,
      profileOverride: createDefaultProfile(),
    });

    // Restore previous connector list
    await setSettings({
      ...settings,
      enabledConnectors: previousEnabled.length > 0 ? previousEnabled : activeConnectorIds,
    });

    if (result.missions.length > 0) {
      await setFirstScanDone();

      // Notify side panel if it’s open
      try {
        await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
      } catch {
        // Panel not open yet — missions are in IndexedDB, will load on next open
      }

      if (import.meta.env.DEV) {
        console.debug(`[MissionPulse] First scan complete: ${result.missions.length} missions`);
      }
    }
  } catch (err) {
    // First scan failure is non-critical — user sees normal onboarding
    console.warn('[MissionPulse] First scan on install failed:', err);
  }
});

chrome.action.onUserSettingsChanged.addListener(async (change) => {
  if (change.isOnToolbar) {
    if (import.meta.env.DEV) {
      console.debug('[MissionPulse] Extension pinned to toolbar');
    }
    const settings = await getSettings();
    if (!settings.autoScan && settings.notifications) {
      try {
        await chrome.notifications.create('suggest-auto-scan', {
          type: 'basic',
          iconUrl: 'static/icons/icon-128.svg',
          title: 'MissionPulse',
          message: 'Activez le scan automatique dans les parametres pour ne rater aucune mission.',
        });
      } catch {
        // Notifications permission not available
      }
    }
  }
});

export {};
