import {
  getProfile,
  saveProfile,
  saveConnectorStatuses,
  getConnectorStatuses,
  getMissions,
} from '../lib/shell/storage/db';
import type {
  BridgeMessage,
  ScanProgressPayload,
  ConnectorProgress,
} from '../lib/shell/messaging/bridge';
import type { PersistedConnectorStatus } from '../lib/core/types/connector-status';
import type { Mission } from '../lib/core/types/mission';
import { analyzeTJMHistory } from '../lib/core/tjm-history';
import type { TJMHistory, TJMRegion } from '../lib/core/types/tjm';
import {
  DEFAULT_SETTINGS,
  getFeedSavedViews,
  getFeedSortBy,
  getSettings,
  setFeedSavedViews,
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
import {
  getConnectedAlertPreferences,
  saveConnectedAlertPreferences,
} from '../lib/shell/storage/connected-alert-preferences';
import { getAlertHistory } from '../lib/shell/storage/alert-history';
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
  deleteTracking,
  getAllTrackings,
  getTrackingsByStatus,
} from '../lib/shell/storage/tracking';
import { createTracking, transitionStatus } from '../lib/core/tracking/transitions';
import { getGeneratedAssetsForMission } from '../lib/shell/storage/generated-assets';
import { validateMessage } from '../lib/shell/messaging/schemas';
import { classifyError } from '../lib/shell/messaging/error-boundary';
import { getProfileExtractor } from '../lib/shell/profile-extractors';
import { verifyProfilePage } from '../lib/shell/profile/profile-page-verification';
import { resetLocalData } from '../lib/shell/storage/local-data-reset';
import { loadTJMHistory } from '../lib/shell/storage/tjm-history';
import { clearConnectorDynamicRules } from '../lib/shell/connectors/cookie-rules';

if (import.meta.env.DEV) {
  console.debug('[MissionPulse] Service worker started');
}

type LinkedInProfilePreviewMessage = Extract<BridgeMessage, { type: 'LINKEDIN_PROFILE_PREVIEWED' }>;

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

function getBridgeErrorCode(error: import('../lib/core/errors/app-error').AppError): string {
  const code = error.context?.profileExtractorCode;
  return typeof code === 'string' ? code : error.type;
}

async function previewLinkedInProfile(
  startedAt: number,
  tabId?: number
): Promise<LinkedInProfilePreviewMessage> {
  const extractor = getProfileExtractor('linkedin');
  const result = await extractor.extractProfile(startedAt, tabId);

  if (!result.ok) {
    const errorCode = getBridgeErrorCode(result.error);
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

// Trigger expired semantic cache cleanup on startup
clearExpiredSemanticCache().catch((err) => {
  console.warn('[MissionPulse] Failed to cleanup expired semantic cache:', err);
});

// Health snapshots are persisted across service worker wake-ups so the side panel
// can show the latest known connector state even when the worker hibernates.

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Remove stale connector DNR rules from previous versions. Connectors now install
// short-lived, domain-scoped rules only around the network calls that need them.
clearConnectorDynamicRules().catch((err) => {
  console.warn('[MissionPulse] Failed to clear connector header rules:', err);
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

function sendScanPartialResult(payload: {
  connectorId: string;
  connectorName: string;
  missions: Mission[];
}): void {
  chrome.runtime.sendMessage({ type: 'SCAN_PARTIAL_RESULT', payload }).catch(() => {
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
      onConnectorResult: (info) => {
        sendScanPartialResult(info);
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
          chrome.runtime
            .sendMessage({ type: 'PROFILE_UPDATED', payload: message.payload })
            .catch(() => {
              // Side panel not open, ignore
            });
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

    if (message.type === 'GET_FEED_SAVED_VIEWS') {
      getFeedSavedViews()
        .then((views) => {
          sendResponse({ type: 'FEED_SAVED_VIEWS_RESULT', payload: views });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_SAVED_VIEWS error:', err);
          sendResponse({ type: 'FEED_SAVED_VIEWS_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_SAVED_VIEWS') {
      setFeedSavedViews(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_SAVED_VIEWS error:', err);
          sendResponse({ type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_CONNECTED_ALERT_PREFERENCES') {
      getConnectedAlertPreferences()
        .then((preferences) => {
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_RESULT', payload: preferences });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_CONNECTED_ALERT_PREFERENCES error:', err);
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_RESULT', payload: null });
        });
      return true;
    }

    if (message.type === 'SAVE_CONNECTED_ALERT_PREFERENCES') {
      saveConnectedAlertPreferences(message.payload)
        .then(() => {
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_CONNECTED_ALERT_PREFERENCES error:', err);
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_ALERT_HISTORY') {
      getAlertHistory()
        .then((history) => {
          sendResponse({ type: 'ALERT_HISTORY_RESULT', payload: history });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_ALERT_HISTORY error:', err);
          sendResponse({ type: 'ALERT_HISTORY_RESULT', payload: [] });
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
      sendResponse({
        type: 'LINKEDIN_PROFILE_IMPORTED',
        payload: {
          imported: false,
          errorCode: 'sync_unavailable',
          errorMessage: 'Sync not available',
        },
      });
      return false;
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

          const response = await previewLinkedInProfile(startedAt, message.payload?.tabId);
          if (response.payload.extracted) {
            sendResponse({
              type: 'LINKEDIN_PROFILE_IMPORTED',
              payload: { imported: true, profile: response.payload.profile },
            });
          } else {
            sendResponse({
              type: 'LINKEDIN_PROFILE_IMPORTED',
              payload: {
                imported: false,
                errorCode: response.payload.errorCode,
                errorMessage: response.payload.errorMessage,
              },
            });
          }
        })
        .catch((error) => {
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
          sendResponse({ type: 'TRACKING_UPDATED', payload: updated });
        } catch (err) {
          console.error('[MissionPulse] UPDATE_TRACKING error:', err);
          sendResponse({
            type: 'TRACKING_UPDATED',
            payload: {
              missionId,
              currentStatus: 'detected',
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

    if (message.type === 'RESTORE_TRACKING') {
      const { missionId, tracking } = message.payload;

      (async () => {
        try {
          if (tracking) {
            await saveTracking(tracking);
            sendResponse({ type: 'TRACKING_RESTORED', payload: tracking });
            return;
          }

          await deleteTracking(missionId);
          sendResponse({ type: 'TRACKING_RESTORED', payload: null });
        } catch (err) {
          console.error('[MissionPulse] RESTORE_TRACKING error:', err);
          const current = await getTracking(missionId).catch(() => null);
          sendResponse({ type: 'TRACKING_RESTORED', payload: current });
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
      sendResponse({
        type: 'GENERATION_RESULT',
        payload: { asset: null, error: 'GENERATION_UNAVAILABLE' },
      });
      return false;
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

    if (message.type === 'GET_PREMIUM_STATUS') {
      chrome.storage.local
        .get('premium_enabled')
        .then((result) => {
          sendResponse({
            type: 'PREMIUM_STATUS_RESULT',
            payload: result.premium_enabled === true,
          });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PREMIUM_STATUS error:', err);
          sendResponse({ type: 'PREMIUM_STATUS_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_PREMIUM') {
      chrome.storage.local
        .set({ premium_enabled: message.payload })
        .then(() => {
          sendResponse({ type: 'PREMIUM_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_PREMIUM error:', err);
          sendResponse({ type: 'PREMIUM_SET', payload: { saved: false } });
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

chrome.action.onUserSettingsChanged?.addListener(async (change) => {
  if (!change.isOnToolbar) {
    return;
  }

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
});

export {};
