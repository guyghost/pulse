import type { Mission } from '../../core/types/mission';
import type { MissionTracking } from '../../core/types/tracking';
import type { ApplicationStatus } from '../../core/types/tracking';
import type { GeneratedAsset, GenerationType } from '../../core/types/generation';
import type { UserProfile } from '../../core/types/profile';
import type { ConnectorState } from '../../core/types/connector-status';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import type { AuthStatus, AuthUser } from '../../core/types/auth';
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

/**
 * Payload du message CONNECTOR_HEALTH_UPDATED
 */
export interface ConnectorHealthPayload {
  snapshot: ConnectorHealthSnapshot;
  /** true si le circuit vient de changer d'état dans ce cycle */
  stateChanged: boolean;
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
  // Tracking
  | { type: 'UPDATE_TRACKING'; payload: { missionId: string; status: ApplicationStatus; note?: string } }
  | { type: 'TRACKING_UPDATED'; payload: MissionTracking }
  | { type: 'GET_TRACKINGS'; payload?: { status?: ApplicationStatus } }
  | { type: 'TRACKINGS_RESULT'; payload: MissionTracking[] }
  // Generation
  | { type: 'GENERATE_ASSET'; payload: { missionId: string; generationType: GenerationType } }
  | { type: 'GENERATION_RESULT'; payload: GeneratedAsset | null }
  | { type: 'GET_GENERATED_ASSETS'; payload: { missionId: string } }
  | { type: 'GENERATED_ASSETS_RESULT'; payload: GeneratedAsset[] }
  // Toast
  | { type: 'SHOW_TOAST'; payload: { message: string; toastType: ToastType; duration?: number } }
  | { type: 'TOAST_SHOWN' }
  // Profile
  | { type: 'PROFILE_UPDATED' }
  // Auth
  | { type: 'AUTH_LOGIN'; payload: { email: string; password: string } }
  | { type: 'AUTH_SIGNUP'; payload: { email: string; password: string } }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_STATUS' }
  | { type: 'AUTH_RESULT'; payload: { status: AuthStatus; user: AuthUser | null; error?: string } }
  // Connector health (service worker → side panel)
  | { type: 'CONNECTOR_HEALTH_UPDATED'; payload: ConnectorHealthPayload }
  | { type: 'CONNECTOR_SKIPPED'; payload: { connectorId: string; connectorName: string; reason: 'circuit-open' } };

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
