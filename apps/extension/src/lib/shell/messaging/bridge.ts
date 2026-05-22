import type { Mission } from '../../core/types/mission';
import type { MissionTracking } from '../../core/types/tracking';
import type { ApplicationStatus } from '../../core/types/tracking';
import type { PersistedConnectorStatus } from '../../core/types/connector-status';
import type { AppSettings } from '../../core/types/app-settings';
import type {
  GeneratedAsset,
  GenerationResultPayload,
  GenerationType,
} from '../../core/types/generation';
import type { UserProfile } from '../../core/types/profile';
import type { ProfileSyncField, VerifyProfileResult } from '../../core/profile/profile-sync';
import type { CanonicalCandidateProfileDraft } from '../../core/profile-extractors/types';
import type { ConnectorState } from '../../core/types/connector-status';
import type { ConnectorHealthSnapshot } from '../../core/types/health';
import type { AuthStatus, AuthUser } from '../../core/types/auth';
import type { AppError } from '../../core/errors/app-error';
import type { ToastType } from '../../state/toast.svelte';
import type { ConnectedDashboardSyncStatus } from '../sync/connected-dashboard';

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
  | { type: 'GET_FEED_MISSIONS' }
  | { type: 'FEED_MISSIONS_RESULT'; payload: Mission[] }
  | { type: 'GET_FEED_FAVORITES' }
  | { type: 'FEED_FAVORITES_RESULT'; payload: Record<string, number> }
  | { type: 'SAVE_FEED_FAVORITES'; payload: Record<string, number> }
  | { type: 'FEED_FAVORITES_SAVED'; payload: { saved: boolean } }
  | { type: 'GET_FEED_HIDDEN' }
  | { type: 'FEED_HIDDEN_RESULT'; payload: Record<string, number> }
  | { type: 'SAVE_FEED_HIDDEN'; payload: Record<string, number> }
  | { type: 'FEED_HIDDEN_SAVED'; payload: { saved: boolean } }
  | { type: 'GET_FEED_SORT' }
  | { type: 'FEED_SORT_RESULT'; payload: 'score' | 'date' | 'tjm' }
  | { type: 'SAVE_FEED_SORT'; payload: 'score' | 'date' | 'tjm' }
  | { type: 'FEED_SORT_SAVED'; payload: { saved: boolean } }
  | { type: 'GET_SEEN_MISSIONS' }
  | { type: 'SEEN_MISSIONS_RESULT'; payload: string[] }
  | { type: 'SAVE_SEEN_MISSIONS'; payload: string[] }
  | { type: 'SEEN_MISSIONS_SAVED'; payload: { saved: boolean } }
  | { type: 'RESET_NEW_MISSION_COUNT' }
  | { type: 'NEW_MISSION_COUNT_RESET'; payload: { reset: boolean } }
  | { type: 'CLEAR_EXTENSION_BADGE' }
  | { type: 'EXTENSION_BADGE_CLEARED'; payload: { cleared: boolean } }
  | { type: 'OPEN_EXTERNAL_URL'; payload: { url: string } }
  | { type: 'EXTERNAL_URL_OPENED'; payload: { opened: boolean } }
  | { type: 'GET_FIRST_SCAN_DONE' }
  | { type: 'FIRST_SCAN_DONE_RESULT'; payload: boolean }
  | { type: 'GET_PROFILE_BANNER_DISMISSED' }
  | { type: 'PROFILE_BANNER_DISMISSED_RESULT'; payload: boolean }
  | { type: 'SET_PROFILE_BANNER_DISMISSED' }
  | { type: 'PROFILE_BANNER_DISMISSED_SET'; payload: { saved: boolean } }
  | { type: 'GET_ONBOARDING_COMPLETED' }
  | { type: 'ONBOARDING_COMPLETED_RESULT'; payload: boolean }
  | { type: 'SET_ONBOARDING_COMPLETED' }
  | { type: 'ONBOARDING_COMPLETED_SET'; payload: { saved: boolean } }
  | { type: 'CLEAR_ONBOARDING_COMPLETED' }
  | { type: 'ONBOARDING_COMPLETED_CLEARED'; payload: { cleared: boolean } }
  | { type: 'GET_FEED_TOUR_SEEN' }
  | { type: 'FEED_TOUR_SEEN_RESULT'; payload: boolean }
  | { type: 'SET_FEED_TOUR_SEEN' }
  | { type: 'FEED_TOUR_SEEN_SET'; payload: { saved: boolean } }
  | { type: 'CLEAR_FEED_TOUR_SEEN' }
  | { type: 'FEED_TOUR_SEEN_CLEARED'; payload: { cleared: boolean } }
  | { type: 'GET_PERSISTED_CONNECTOR_STATUSES' }
  | { type: 'PERSISTED_CONNECTOR_STATUSES_RESULT'; payload: PersistedConnectorStatus[] }
  | { type: 'GET_SETTINGS' }
  | { type: 'SETTINGS_RESULT'; payload: AppSettings }
  | { type: 'SAVE_SETTINGS'; payload: AppSettings }
  | { type: 'SETTINGS_SAVED'; payload: { saved: boolean; settings: AppSettings | null } }
  | { type: 'SETTINGS_UPDATED'; payload: AppSettings }
  | { type: 'GET_PROFILE' }
  | { type: 'PROFILE_RESULT'; payload: UserProfile | null }
  | { type: 'SAVE_PROFILE'; payload: UserProfile }
  | { type: 'VERIFY_PROFILE_PAGE'; payload: { url: string; fields: ProfileSyncField[] } }
  | { type: 'PROFILE_PAGE_VERIFIED'; payload: VerifyProfileResult }
  | { type: 'PREVIEW_LINKEDIN_PROFILE'; payload?: { tabId?: number } }
  | {
      type: 'LINKEDIN_PROFILE_PREVIEWED';
      payload:
        | { extracted: true; profile: CanonicalCandidateProfileDraft }
        | { extracted: false; errorCode: string; errorMessage: string };
    }
  | { type: 'SYNC_LINKEDIN_PROFILE_IMPORT'; payload: { profile: CanonicalCandidateProfileDraft } }
  | { type: 'IMPORT_LINKEDIN_PROFILE'; payload?: { tabId?: number } }
  | {
      type: 'LINKEDIN_PROFILE_IMPORTED';
      payload:
        | { imported: true; profile: CanonicalCandidateProfileDraft }
        | { imported: false; errorCode: string; errorMessage: string };
    }
  // Scan orchestration (panel ↔ service worker)
  | { type: 'SCAN_START' }
  | { type: 'SCAN_PROGRESS'; payload: ScanProgressPayload }
  | { type: 'SCAN_COMPLETE'; payload: Mission[] }
  | { type: 'SCAN_ERROR'; payload: { message: string; code: string } }
  | { type: 'SCAN_CANCEL' }
  // Tracking
  | {
      type: 'UPDATE_TRACKING';
      payload: { missionId: string; status: ApplicationStatus; note?: string };
    }
  | {
      type: 'UPDATE_TRACKING_DETAILS';
      payload: { missionId: string; nextActionAt?: string | null };
    }
  | { type: 'TRACKING_UPDATED'; payload: MissionTracking }
  | { type: 'GET_TRACKINGS'; payload?: { status?: ApplicationStatus } }
  | { type: 'TRACKINGS_RESULT'; payload: MissionTracking[] }
  // Generation
  | { type: 'GENERATE_ASSET'; payload: { missionId: string; generationType: GenerationType } }
  | { type: 'GENERATION_RESULT'; payload: GenerationResultPayload }
  | { type: 'GET_GENERATED_ASSETS'; payload: { missionId: string } }
  | { type: 'GENERATED_ASSETS_RESULT'; payload: GeneratedAsset[] }
  // Toast
  | { type: 'SHOW_TOAST'; payload: { message: string; toastType: ToastType; duration?: number } }
  | { type: 'TOAST_SHOWN' }
  // Profile
  | { type: 'PROFILE_UPDATED' }
  | { type: 'RESET_LOCAL_DATA' }
  | { type: 'LOCAL_DATA_RESET'; payload: { reset: boolean; reason?: string } }
  // Auth
  | { type: 'AUTH_LOGIN'; payload: { email: string; password: string } }
  | { type: 'AUTH_SIGNUP'; payload: { email: string; password: string } }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_STATUS' }
  | { type: 'AUTH_RESULT'; payload: { status: AuthStatus; user: AuthUser | null; error?: string } }
  // Account sync
  | { type: 'SYNC_FAVORITE_MISSION'; payload: { missionId: string; favoritedAt: number | null } }
  | {
      type: 'FAVORITE_MISSION_SYNCED';
      payload: { missionId: string; synced: boolean; reason?: string };
    }
  | { type: 'GET_CONNECTED_SYNC_STATUS' }
  | { type: 'CONNECTED_SYNC_STATUS_RESULT'; payload: ConnectedDashboardSyncStatus }
  | { type: 'SYNC_CONNECTED_DASHBOARD' }
  | { type: 'RETRY_CONNECTED_SYNC' }
  | {
      type: 'CONNECTED_DASHBOARD_SYNCED';
      payload: {
        synced: boolean;
        missions?: number;
        applications?: number;
        skippedApplications?: number;
        connectorHealth?: number;
        reason?: string;
      };
    }
  // Connector health (service worker → side panel)
  | { type: 'GET_CONNECTOR_HEALTH' }
  | { type: 'CONNECTOR_HEALTH_RESULT'; payload: ConnectorHealthSnapshot[] }
  | {
      type: 'RECHECK_CONNECTOR_HEALTH';
      payload: { connectorId: string; enable?: boolean };
    }
  | { type: 'CONNECTOR_HEALTH_UPDATED'; payload: ConnectorHealthPayload }
  | {
      type: 'CONNECTOR_SKIPPED';
      payload: { connectorId: string; connectorName: string; reason: 'circuit-open' };
    };

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

export function subscribeMessages(
  handler: (message: BridgeMessage, sender: chrome.runtime.MessageSender) => void
): () => void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return () => {};
  }

  const listener = (
    message: BridgeMessage,
    sender: chrome.runtime.MessageSender,
    _sendResponse: (response: BridgeMessage) => void
  ): void => {
    devLog('←', message.type, 'payload' in message ? message.payload : undefined);
    handler(message, sender);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
