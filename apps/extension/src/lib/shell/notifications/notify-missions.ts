import type { Mission } from '../../core/types/mission';
import type { AppSettings } from '../storage/chrome-storage';
import { filterNotifiableMissions } from '../../core/scoring/notification-filter';
import { canNotify } from '../../core/scoring/notification-rate-limit';
import { getSettings } from '../storage/chrome-storage';
import { getSeenIds } from '../storage/seen-missions';

// ---------------------------------------------------------------------------
// Rate limit state (in-memory, reset on service worker restart)
// ---------------------------------------------------------------------------

let lastNotificationTime: number | null = null;

const LAST_NOTIFICATION_KEY = 'last_notification_time';

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
export const notifyHighScoreMissions = async (missions: Mission[]): Promise<NotificationResult> => {
  if (missions.length === 0) {
    return { shown: false, notifiedMissionIds: [] };
  }

  // Check if notifications are enabled
  let settings: AppSettings;
  try {
    settings = await getSettings();
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

  const notifiableMissions = filterNotifiableMissions(
    missions,
    seenIds,
    settings.notificationScoreThreshold
  );

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
    await chrome.notifications.create('high-score-missions', {
      type: 'basic',
      iconUrl: 'static/icons/icon-128.svg',
      title,
      message,
      priority: 2,
      isClickable: true,
    });

    // Update rate limit timestamp
    await persistLastNotificationTime(now);
    return {
      shown: true,
      notifiedMissionIds: notifiableMissions.map((mission) => mission.id),
    };
  } catch (err) {
    console.error('[MissionPulse] Failed to create notification:', err);
    return { shown: false, notifiedMissionIds: [] };
  }
};

/**
 * Sets up the notification click handler to open the side panel.
 * Should be called once during service worker initialization.
 */
export const setupNotificationClickHandler = (): void => {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'high-score-missions') {
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
      });

      // Clear the notification after click
      chrome.notifications.clear(notificationId);
    }
  });
};
