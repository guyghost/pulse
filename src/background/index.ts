import { createActor } from 'xstate';
import { scanMachine } from './machines/scan.machine';
import { getProfile, saveProfile, getMissions, saveMissions } from '../lib/shell/storage/db';
import { getSettings } from '../lib/shell/storage/chrome-storage';
import { getConnector } from '../lib/shell/connectors/index';
import { scoreMission } from '../lib/core/scoring/relevance';
import { deduplicateMissions } from '../lib/core/scoring/dedup';
import type { BridgeMessage } from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';
import { getSeenIds } from '../lib/shell/storage/seen-missions';

console.log('[MissionPulse] Service worker started');

// Create scan actor
const scanActor = createActor(scanMachine);
scanActor.start();

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Set up periodic scan alarm
async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.create('periodic-scan', {
    periodInMinutes: settings.scanIntervalMinutes,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-scan') {
    await startScan();
  }
});

// Scan logic
async function startScan() {
  const settings = await getSettings();
  const enabledIds = settings.enabledConnectors;

  if (enabledIds.length === 0) return;

  scanActor.send({ type: 'START_SCAN', connectors: enabledIds });

  for (const connectorId of enabledIds) {
    const connector = getConnector(connectorId);
    if (!connector) {
      scanActor.send({
        type: 'CONNECTOR_ERROR',
        error: { connectorId, message: 'Connecteur introuvable', timestamp: new Date(), recoverable: false },
      });
      continue;
    }

    try {
      const hasSession = await connector.detectSession();
      if (!hasSession) {
        scanActor.send({
          type: 'CONNECTOR_ERROR',
          error: { connectorId, message: 'Session expirée', timestamp: new Date(), recoverable: true },
        });
        continue;
      }

      const missions = await connector.fetchMissions();
      scanActor.send({ type: 'CONNECTOR_DONE', missions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      scanActor.send({
        type: 'CONNECTOR_ERROR',
        error: { connectorId, message, timestamp: new Date(), recoverable: true },
      });
    }
  }

  // Post-scan: deduplicate and score
  const snapshot = scanActor.getSnapshot();
  const allMissions = snapshot.context.missions;
  const deduped = deduplicateMissions(allMissions);

  const profile = await getProfile();
  const scored = profile
    ? deduped.map(m => ({ ...m, score: scoreMission(m, profile) }))
    : deduped;

  await saveMissions(scored);

  // Broadcast to side panel
  broadcastToSidePanel({ type: 'MISSIONS_UPDATED', payload: scored });

  // Update badge with unseen count
  const seenIds = await getSeenIds();
  const unseenCount = scored.filter(m => !seenIds.includes(m.id)).length;
  chrome.action.setBadgeText({ text: unseenCount > 0 ? String(unseenCount) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' });

  scanActor.send({ type: 'RESET' });
}

function broadcastToSidePanel(message: BridgeMessage) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be open
  });
}

// Message handler
chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // async response
});

async function handleMessage(message: BridgeMessage): Promise<BridgeMessage | null> {
  switch (message.type) {
    case 'SCAN_START':
      startScan();
      return { type: 'SCAN_STATUS', payload: { state: 'scanning', currentConnector: null, progress: 0, missionsFound: 0 } };

    case 'GET_PROFILE': {
      const profile = await getProfile();
      return { type: 'PROFILE_RESULT', payload: profile };
    }

    case 'SAVE_PROFILE': {
      await saveProfile(message.payload as UserProfile);
      return { type: 'PROFILE_RESULT', payload: message.payload as UserProfile };
    }

    case 'MISSIONS_SEEN': {
      const seenIds = message.payload as string[];
      const missions = await getMissions();
      const unseenCount = missions.filter(m => !seenIds.includes(m.id)).length;
      chrome.action.setBadgeText({ text: unseenCount > 0 ? String(unseenCount) : '' });
      return null;
    }

    default:
      return null;
  }
}

// Initialize
setupAlarm();

export {};
