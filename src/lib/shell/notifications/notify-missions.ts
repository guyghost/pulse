import type { Mission } from '../../core/types/mission';

/**
 * Creates Chrome notifications for high-score missions.
 * 
 * - 1-3 missions: Single notification with titles listed
 * - 4+ missions: Grouped notification with count
 * 
 * Clicking the notification opens the side panel.
 */
export const notifyHighScoreMissions = async (missions: Mission[]): Promise<boolean> => {
  if (missions.length === 0) return false;

  const missionCount = missions.length;

  // Build notification content based on count
  let title: string;
  let message: string;

  if (missionCount === 1) {
    const mission = missions[0];
    title = '🎯 Nouvelle mission pertinente';
    message = `${mission.title}${mission.client ? ` — ${mission.client}` : ''}`;
  } else if (missionCount <= 3) {
    title = `🎯 ${missionCount} nouvelles missions pertinentes`;
    message = missions.map((m) => `• ${m.title}`).join('\n');
  } else {
    title = `🎯 ${missionCount} nouvelles missions pertinentes`;
    const topMissions = missions.slice(0, 3).map((m) => `• ${m.title}`).join('\n');
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
    return true;
  } catch (err) {
    console.error('[MissionPulse] Failed to create notification:', err);
    return false;
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
