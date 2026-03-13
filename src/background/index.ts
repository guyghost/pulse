import { getProfile, saveProfile } from '../lib/shell/storage/db';
import type { BridgeMessage } from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';

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

export {};
