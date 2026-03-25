import { getProfile, saveProfile, saveConnectorStatuses } from '../lib/shell/storage/db';
import type { BridgeMessage } from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';
import type { PersistedConnectorStatus } from '../lib/core/types/connector-status';
import { getSettings } from '../lib/shell/storage/chrome-storage';
import { runScan } from '../lib/shell/scan/scanner';
import { getSeenIds, saveSeenIds } from '../lib/shell/storage/seen-missions';
import { setNewMissionCount } from '../lib/shell/storage/session-storage';
import { filterNotifiableMissions } from '../lib/core/scoring/notification-filter';
import { markAsSeen } from '../lib/core/seen/mark-seen';
import { notifyHighScoreMissions, setupNotificationClickHandler } from '../lib/shell/notifications/notify-missions';
import { clearExpiredSemanticCache } from '../lib/shell/storage/semantic-cache';

console.log('[MissionPulse] Service worker started');

// Trigger expired semantic cache cleanup on startup
clearExpiredSemanticCache().catch((err) => {
  console.warn('[MissionPulse] Failed to cleanup expired semantic cache:', err);
});

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Rewrite Origin header for APIs that block chrome-extension:// origin
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2, 3],
  addRules: [
    {
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://www.lehibou.com' },
          { header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://www.lehibou.com/' },
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
          { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://app.collective.work' },
          { header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://app.collective.work/' },
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
          { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://www.free-work.com' },
          { header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://www.free-work.com/' },
        ],
      },
      condition: {
        urlFilter: 'free-work.com/api',
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
      },
    },
  ],
}).catch((err) => {
  console.warn('[MissionPulse] Failed to set header rewrite rules:', err);
});

// Setup notification click handler
setupNotificationClickHandler();

// Message handler — profile management only (scan is now handled in side panel)
chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    getProfile().then(profile => {
      sendResponse({ type: 'PROFILE_RESULT', payload: profile });
    });
    return true;
  }

  if (message.type === 'SAVE_PROFILE') {
    // Profile is now saved directly from the side panel via IndexedDB.
    // Keep handler for backwards compatibility with queued messages.
    saveProfile(message.payload as UserProfile).then(() => {
      sendResponse({ type: 'PROFILE_RESULT', payload: message.payload as UserProfile });
    }).catch((err) => {
      console.warn('[MissionPulse] SAVE_PROFILE via bridge (legacy):', err.message);
      sendResponse({ type: 'PROFILE_RESULT', payload: null });
    });
    return true;
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
    console.log(`[MissionPulse] Auto-scan alarm set: every ${settings.scanIntervalMinutes}min`);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[MissionPulse] Auto-scan triggered');
  try {
    const settings = await getSettings();
    const result = await runScan();
    try { await chrome.storage.local.set({ lastGlobalSync: Date.now() }); } catch {}
    if (result.missions.length > 0) {
      try {
        await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
      } catch {
        // Side panel not open, ignore
      }
    }
    // Persist connector statuses (simplified — no XState in service worker)
    const now = Date.now();
    const statusMap = new Map<string, { missions: number; error: string | null }>();

    // Count missions per source
    for (const mission of result.missions) {
      const entry = statusMap.get(mission.source) ?? { missions: 0, error: null };
      entry.missions++;
      statusMap.set(mission.source, entry);
    }

    // Record errors
    for (const err of result.errors) {
      const entry = statusMap.get(err.connectorId) ?? { missions: 0, error: null };
      entry.error = err.message;
      statusMap.set(err.connectorId, entry);
    }

    const persistedStatuses: PersistedConnectorStatus[] = [...statusMap.entries()].map(([id, data]) => ({
      connectorId: id,
      connectorName: id,
      lastState: data.error && data.missions === 0 ? 'error' : 'done',
      missionsCount: data.missions,
      error: data.error ? { type: 'connector', message: data.error } : null,
      lastSyncAt: now,
      lastSuccessAt: data.missions > 0 ? now : null,
    }));

    try {
      await saveConnectorStatuses(persistedStatuses);
    } catch {
      // Storage non-critical
    }

    if (result.missions.length === 0) return;

    const seenIds = await getSeenIds();
    const seenSet = new Set(seenIds);
    const newMissions = result.missions.filter(m => !seenSet.has(m.id));
    const newCount = newMissions.length;
    
    await setNewMissionCount(newCount);
    if (newCount > 0) {
      await chrome.action.setBadgeText({ text: String(newCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }

    // Send notifications for high-score missions if enabled
    if (settings.notifications && newCount > 0) {
      const notifiableMissions = filterNotifiableMissions(
        newMissions,
        seenIds,
        settings.notificationScoreThreshold,
      );
      
      if (notifiableMissions.length > 0) {
        console.log(`[MissionPulse] Notifying about ${notifiableMissions.length} high-score missions`);
        const didNotify = await notifyHighScoreMissions(notifiableMissions);
        if (didNotify) {
          await saveSeenIds(markAsSeen(seenIds, notifiableMissions.map((mission) => mission.id)));
        }
      }
    }
  } catch (err) {
    console.error('[MissionPulse] Auto-scan error:', err);
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
    console.log('[MissionPulse] Extension pinned to toolbar');
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
