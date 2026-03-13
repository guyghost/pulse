import { getProfile, saveProfile } from '../lib/shell/storage/db';
import type { BridgeMessage } from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';
import { getSettings } from '../lib/shell/storage/chrome-storage';
import { runScan } from '../lib/shell/scan/scanner';
import { getSeenIds } from '../lib/shell/storage/seen-missions';
import { setNewMissionCount } from '../lib/shell/storage/session-storage';

console.log('[MissionPulse] Service worker started');

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handler — profile management only (scan is now handled in side panel)
chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    getProfile().then(profile => {
      sendResponse({ type: 'PROFILE_RESULT', payload: profile });
    });
    return true;
  }

  if (message.type === 'SAVE_PROFILE') {
    saveProfile(message.payload as UserProfile).then(() => {
      sendResponse({ type: 'PROFILE_RESULT', payload: message.payload as UserProfile });
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
    const result = await runScan();
    if (result.missions.length === 0) return;
    const seenIds = await getSeenIds();
    const newCount = result.missions.filter(m => !seenIds.includes(m.id)).length;
    await setNewMissionCount(newCount);
    if (newCount > 0) {
      await chrome.action.setBadgeText({ text: String(newCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
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

export {};
