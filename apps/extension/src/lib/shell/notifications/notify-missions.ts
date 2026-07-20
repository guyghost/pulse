import type { Mission } from '../../core/types/mission';
import type { AppSettings } from '../../core/types/app-settings';
import { filterNotifiableMissions } from '../../core/scoring/notification-filter';
import { filterSmartNotifications } from '../../core/scoring/smart-notification';
import { canNotify } from '../../core/scoring/notification-rate-limit';
import { getConnectedAlertPreferences } from '../storage/connected-alert-preferences';
import { getSeenIds } from '../storage/seen-missions';
import { recordAlertHistoryEntry } from '../storage/alert-history';
import { createDeepLinkIntent } from '../../core/deep-link/deep-link-intent';
import { setDeepLinkIntent, clearDeepLinkIntent } from '../storage/session-storage';
import type { SettingsReleaseSnapshot } from '../settings-release/settings-release.contract';
import { readSettingsReleaseSnapshot } from '../settings-release/settings-release-reader';

// ---------------------------------------------------------------------------
// Rate limit state (in-memory, reset on service worker restart)
// ---------------------------------------------------------------------------

let lastNotificationTime: number | null = null;

const LAST_NOTIFICATION_KEY = 'last_notification_time';

function buildAlertHistoryId(triggeredAt: number, missions: Mission[]): string {
  const missionKey = missions
    .slice(0, 4)
    .map((mission) => mission.id)
    .join('-')
    .slice(0, 90);

  return `alert-${triggeredAt}-${missionKey || 'empty'}`;
}

export function isMutedUntilActive(mutedUntil: string | null, now: number): boolean {
  if (!mutedUntil) {
    return false;
  }

  const mutedUntilMs = Date.parse(mutedUntil);
  return Number.isFinite(mutedUntilMs) && mutedUntilMs > now;
}

/**
 * Persist the last notification timestamp to chrome.storage.session.
 * Uses session storage so it resets when the browser session ends.
 */
const persistLastNotificationTime = async (time: number): Promise<void> => {
  lastNotificationTime = time;
  try {
    await chrome.storage.session.set({ [LAST_NOTIFICATION_KEY]: time });
  } catch {
    // Non-critical: session storage may not be available
  }
};

/**
 * Load the last notification timestamp from session storage.
 */
const loadLastNotificationTime = async (): Promise<number | null> => {
  if (lastNotificationTime !== null) {
    return lastNotificationTime;
  }
  try {
    const result = await chrome.storage.session.get(LAST_NOTIFICATION_KEY);
    lastNotificationTime = (result[LAST_NOTIFICATION_KEY] as number) ?? null;
    return lastNotificationTime;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Notification creation
// ---------------------------------------------------------------------------

export interface NotificationResult {
  shown: boolean;
  notifiedMissionIds: string[];
}

/**
 * Creates Chrome notifications for high-score missions.
 *
 * Features:
 * - Respects user notification settings (enabled + score threshold)
 * - Rate limited: max 1 notification per 5 minutes
 * - Groups multiple missions: 1-3 titles listed, 4+ grouped with count
 * - Clicking the notification opens the side panel
 *
 * @param missions - All missions from the scan
 * @returns Whether a notification was shown, and which mission IDs were included
 */
export const notifyHighScoreMissions = async (
  missions: Mission[],
  admittedSnapshot?: SettingsReleaseSnapshot
): Promise<NotificationResult> => {
  if (missions.length === 0) {
    return { shown: false, notifiedMissionIds: [] };
  }

  // Check if notifications are enabled
  let settings: AppSettings;
  try {
    settings = (admittedSnapshot ?? (await readSettingsReleaseSnapshot())).settings;
  } catch {
    return { shown: false, notifiedMissionIds: [] };
  }

  if (!settings.notifications) {
    return { shown: false, notifiedMissionIds: [] };
  }

  // Check rate limit
  const lastTime = await loadLastNotificationTime();
  const now = Date.now();

  if (!canNotify(lastTime, now)) {
    return { shown: false, notifiedMissionIds: [] };
  }

  // Filter missions above threshold that haven't been seen
  let seenIds: string[] = [];
  try {
    seenIds = await getSeenIds();
  } catch {
    // If we can't load seen IDs, proceed without filtering
  }

  const connectedAlertPreferences = await getConnectedAlertPreferences();

  if (connectedAlertPreferences && !connectedAlertPreferences.enabled) {
    return { shown: false, notifiedMissionIds: [] };
  }

  if (connectedAlertPreferences && isMutedUntilActive(connectedAlertPreferences.mutedUntil, now)) {
    return { shown: false, notifiedMissionIds: [] };
  }

  const notifiableMissions = connectedAlertPreferences
    ? filterSmartNotifications(missions, seenIds, {
        scoreThreshold: connectedAlertPreferences.scoreThreshold,
        requiredStacks: connectedAlertPreferences.requiredStacks,
        minTJM: connectedAlertPreferences.minDailyRate,
        maxResults: connectedAlertPreferences.maxResults,
      })
    : filterNotifiableMissions(missions, seenIds, settings.notificationScoreThreshold);

  if (notifiableMissions.length === 0) {
    return { shown: false, notifiedMissionIds: [] };
  }

  // Build notification content based on count
  const missionCount = notifiableMissions.length;
  let title: string;
  let message: string;

  if (missionCount === 1) {
    const mission = notifiableMissions[0];
    title = '🎯 Nouvelle mission pertinente';
    message = `${mission.title}${mission.client ? ` — ${mission.client}` : ''}`;
  } else if (missionCount <= 3) {
    title = `🎯 ${missionCount} nouvelles missions pertinentes`;
    message = notifiableMissions.map((m) => `• ${m.title}`).join('\n');
  } else {
    title = `🎯 ${missionCount} nouvelles missions pertinentes`;
    const topMissions = notifiableMissions
      .slice(0, 3)
      .map((m) => `• ${m.title}`)
      .join('\n');
    message = `${topMissions}\n• ...et ${missionCount - 3} autres`;
  }

  try {
    // Persist the deep-link focus intent BEFORE the notification is shown so a
    // fast click can never race ahead of the write (thread C). Last-writer-wins:
    // the most recent notification is what the user expects to land on. If the
    // notification creation fails below, we roll the intent back so a stale
    // intent doesn't hijack the next panel open.
    const intent = createDeepLinkIntent(
      notifiableMissions.map((mission) => mission.id),
      'notification',
      now
    );
    if (intent) {
      await setDeepLinkIntent(intent);
    }

    await chrome.notifications.create('high-score-missions', {
      type: 'basic',
      iconUrl: 'static/icons/icon-128.png',
      title,
      message,
      priority: 2,
      isClickable: true,
    });

    // Update rate limit timestamp
    await persistLastNotificationTime(now);

    await recordAlertHistoryEntry({
      id: buildAlertHistoryId(now, notifiableMissions),
      triggeredAt: now,
      missionCount,
      missionIds: notifiableMissions.map((mission) => mission.id),
      missionTitles: notifiableMissions.map((mission) => mission.title),
      scoreThreshold:
        connectedAlertPreferences?.scoreThreshold ?? settings.notificationScoreThreshold,
      minDailyRate: connectedAlertPreferences?.minDailyRate ?? 0,
      requiredStacks: connectedAlertPreferences?.requiredStacks ?? [],
      maxResults: connectedAlertPreferences?.maxResults ?? Math.min(Math.max(missionCount, 1), 20),
    }).catch(() => {});

    return {
      shown: true,
      notifiedMissionIds: notifiableMissions.map((mission) => mission.id),
    };
  } catch (err) {
    console.error('[MissionPulse] Failed to create notification:', err);
    // Rollback the intent we wrote optimistically above so the next panel open
    // doesn't land on missions the user was never actually notified about.
    await clearDeepLinkIntent().catch(() => {});
    return { shown: false, notifiedMissionIds: [] };
  }
};

/**
 * Sets up the notification click handler to open the side panel.
 * Should be called once during service worker initialization.
 */
export const setupNotificationClickHandler = (): void => {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'high-score-missions' || notificationId === 'daily-digest') {
      // Open the side panel when notification is clicked
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab?.windowId) {
          try {
            await chrome.sidePanel.open({ tabId: tab.id });
          } catch {
            // Fallback: open extension in a new tab if side panel fails
            chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/index.html') });
          }
        } else {
          // No active tab, open in new tab
          chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/index.html') });
        }

        // Broadcast to any already-open panel so it re-consumes a freshly-written
        // deep-link intent. chrome.sidePanel.open() is a no-op when the panel is
        // already mounted, so without this broadcast the panel's mount effect
        // would not re-fire and the intent would stay pending (thread A).
        try {
          await chrome.runtime.sendMessage({ type: 'NOTIFICATION_CLICKED' });
        } catch {
          // Non-critical: if no panel is listening (panel was just opened), the
          // mount effect handles the consume instead.
        }
      });

      // Clear the notification after click
      chrome.notifications.clear(notificationId);
    }
  });
};
