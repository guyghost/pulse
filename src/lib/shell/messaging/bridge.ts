import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';

export type BridgeMessage =
  | { type: 'MISSIONS_UPDATED'; payload: Mission[] }
  | { type: 'GET_PROFILE' }
  | { type: 'PROFILE_RESULT'; payload: UserProfile | null }
  | { type: 'SAVE_PROFILE'; payload: UserProfile }
  | { type: 'SCAN_COMPLETE'; payload: Mission[] };

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
