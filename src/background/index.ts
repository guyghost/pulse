import { getProfile, saveProfile, saveConnectorStatuses } from '../lib/shell/storage/db';
import type {
  BridgeMessage,
  ScanProgressPayload,
  ConnectorProgress,
} from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';
import type { PersistedConnectorStatus } from '../lib/core/types/connector-status';
import { getSettings } from '../lib/shell/storage/chrome-storage';
import {
  runScan,
  cancelCurrentScan,
  isScanRunning,
  ScanError,
  type ConnectorScanState,
} from '../lib/shell/scan/scanner';
import { getSeenIds, saveSeenIds } from '../lib/shell/storage/seen-missions';
import { setNewMissionCount } from '../lib/shell/storage/session-storage';
import { filterNotifiableMissions } from '../lib/core/scoring/notification-filter';
import { markAsSeen } from '../lib/core/seen/mark-seen';
import {
  notifyHighScoreMissions,
  setupNotificationClickHandler,
} from '../lib/shell/notifications/notify-missions';
import { clearExpiredSemanticCache } from '../lib/shell/storage/semantic-cache';

if (import.meta.env.DEV) {
  console.log('[MissionPulse] Service worker started');
}

// Trigger expired semantic cache cleanup on startup
clearExpiredSemanticCache().catch((err) => {
  console.warn('[MissionPulse] Failed to cleanup expired semantic cache:', err);
});

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
      console.log('[MissionPulse] SCAN_START ignored — scan already in progress');
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
  await persistScanResults(result.missions, result.errors);

  return result.missions;
}

/**
 * Persiste les résultats de scan: statuts connecteurs, badge, notifications.
 * Partagé entre l'alarm handler et le SCAN_START handler.
 */
async function persistScanResults(
  missions: import('../lib/core/types/mission').Mission[],
  errors: { connectorId: string; message: string }[]
): Promise<void> {
  const now = Date.now();

  // Persist last sync timestamp
  try {
    await chrome.storage.local.set({ lastGlobalSync: now });
  } catch {
    /* Non-critical: sync timestamp */
  }

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

  if (missions.length === 0) return;

  // Update badge with new mission count
  const seenIds = await getSeenIds();
  const seenSet = new Set(seenIds);
  const newMissions = missions.filter((m) => !seenSet.has(m.id));
  const newCount = newMissions.length;

  await setNewMissionCount(newCount);
  if (newCount > 0) {
    await chrome.action.setBadgeText({ text: String(newCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }

  // Send notifications for high-score missions if enabled
  const settings = await getSettings();
  if (settings.notifications && newCount > 0) {
    const notifiableMissions = filterNotifiableMissions(
      newMissions,
      seenIds,
      settings.notificationScoreThreshold
    );
    if (notifiableMissions.length > 0) {
      const didNotify = await notifyHighScoreMissions(notifiableMissions);
      if (didNotify) {
        await saveSeenIds(
          markAsSeen(
            seenIds,
            notifiableMissions.map((m) => m.id)
          )
        );
      }
    }
  }
}

// Message handler — profile management + scan orchestration
chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    getProfile().then((profile) => {
      sendResponse({ type: 'PROFILE_RESULT', payload: profile });
    });
    return true;
  }

  if (message.type === 'SAVE_PROFILE') {
    // Profile is now saved directly from the side panel via IndexedDB.
    // Keep handler for backwards compatibility with queued messages.
    saveProfile(message.payload as UserProfile)
      .then(() => {
        sendResponse({ type: 'PROFILE_RESULT', payload: message.payload as UserProfile });
      })
      .catch((err) => {
        console.warn('[MissionPulse] SAVE_PROFILE via bridge (legacy):', err.message);
        sendResponse({ type: 'PROFILE_RESULT', payload: null });
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
      console.log(`[MissionPulse] Auto-scan alarm set: every ${settings.scanIntervalMinutes}min`);
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  if (import.meta.env.DEV) {
    console.log('[MissionPulse] Auto-scan triggered');
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
    await persistScanResults(result.missions, result.errors);

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

chrome.action.onUserSettingsChanged.addListener(async (change) => {
  if (change.isOnToolbar) {
    if (import.meta.env.DEV) {
      console.log('[MissionPulse] Extension pinned to toolbar');
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
