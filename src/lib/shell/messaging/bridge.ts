import type { Mission } from '../../core/types/mission';
import type { TJMAnalysis } from '../../core/types/tjm';
import type { UserProfile } from '../../core/types/profile';
import type { SeniorityLevel } from '../../core/types/tjm';

export interface ScanSnapshot {
  state: string;
  currentConnector: string | null;
  progress: number;
  missionsFound: number;
}

export interface TJMQuery {
  title: string;
  location: string;
  seniority: SeniorityLevel;
}

export type BridgeMessage =
  | { type: 'SCAN_START' }
  | { type: 'SCAN_STATUS'; payload: ScanSnapshot }
  | { type: 'MISSIONS_UPDATED'; payload: Mission[] }
  | { type: 'SCRAPE_URL'; payload: { url: string; connectorId: string } }
  | { type: 'SCRAPE_RESULT'; payload: { html: string } }
  | { type: 'SCRAPE_ERROR'; payload: { error: string } }
  | { type: 'TJM_REQUEST'; payload: TJMQuery }
  | { type: 'TJM_RESULT'; payload: TJMAnalysis }
  | { type: 'GET_PROFILE' }
  | { type: 'PROFILE_RESULT'; payload: UserProfile | null }
  | { type: 'SAVE_PROFILE'; payload: UserProfile };

function devLog(direction: '→' | '←', type: string, payload?: unknown): void {
  if (import.meta.env.DEV) {
    import('../../../dev/bridge-logger').then(({ logBridgeMessage }) => {
      logBridgeMessage(direction, type, payload);
    }).catch((err) => console.warn('[Dev] bridge-logger load failed', err));
  }
}

export function sendMessage<T extends BridgeMessage>(
  message: T,
): Promise<BridgeMessage> {
  devLog('→', message.type, 'payload' in message ? message.payload : undefined);
  return chrome.runtime.sendMessage(message);
}

export function onMessage(
  handler: (
    message: BridgeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: BridgeMessage) => void,
  ) => boolean | void,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    devLog('←', message.type, 'payload' in message ? message.payload : undefined);
    return handler(message, sender, sendResponse);
  });
}
