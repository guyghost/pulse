import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { ConnectorState } from '../../core/types/connector-status';
import type { AppError } from '../../core/errors/app-error';
import type { ToastType } from '../../state/toast.svelte';

/**
 * Progression d'un connecteur individuel pendant le scan
 */
export interface ConnectorProgress {
  connectorId: string;
  connectorName: string;
  state: ConnectorState;
  missionsCount: number;
  error: AppError | null;
  retryCount: number;
}

/**
 * Payload du message SCAN_PROGRESS
 */
export interface ScanProgressPayload {
  phase: 'connecting' | 'scanning' | 'post-processing' | 'done';
  current: number;
  total: number;
  connectorProgress: ConnectorProgress[];
}

export type BridgeMessage =
  | { type: 'MISSIONS_UPDATED'; payload: Mission[] }
  | { type: 'GET_PROFILE' }
  | { type: 'PROFILE_RESULT'; payload: UserProfile | null }
  | { type: 'SAVE_PROFILE'; payload: UserProfile }
  // Scan orchestration (panel ↔ service worker)
  | { type: 'SCAN_START' }
  | { type: 'SCAN_PROGRESS'; payload: ScanProgressPayload }
  | { type: 'SCAN_COMPLETE'; payload: Mission[] }
  | { type: 'SCAN_ERROR'; payload: { message: string; code: string } }
  | { type: 'SCAN_CANCEL' }
  // Toast
  | { type: 'SHOW_TOAST'; payload: { message: string; toastType: ToastType; duration?: number } }
  | { type: 'TOAST_SHOWN' }
  // Profile
  | { type: 'PROFILE_UPDATED' };

function devLog(direction: '→' | '←', type: string, payload?: unknown): void {
  if (import.meta.env.DEV) {
    import('../../../dev/bridge-logger')
      .then(({ logBridgeMessage }) => {
        logBridgeMessage(direction, type, payload);
      })
      .catch((err) => console.warn('[Dev] bridge-logger load failed', err));
  }
}

export function sendMessage<T extends BridgeMessage>(message: T): Promise<BridgeMessage> {
  devLog('→', message.type, 'payload' in message ? message.payload : undefined);
  return chrome.runtime.sendMessage(message);
}

export function onMessage(
  handler: (
    message: BridgeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: BridgeMessage) => void
  ) => boolean | void
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    devLog('←', message.type, 'payload' in message ? message.payload : undefined);
    return handler(message, sender, sendResponse);
  });
}
