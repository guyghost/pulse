import {
  getProfile,
  saveProfile,
  saveConnectorStatuses,
  getConnectorStatuses,
  getMissions,
  saveMissions,
  purgeOldMissions,
  runMigrations,
  getMigrationStatus,
} from '../lib/shell/storage/db';
import type {
  BridgeMessage,
  ScanProgressPayload,
  ConnectorProgress,
} from '../lib/shell/messaging/bridge';
import type { PersistedConnectorStatus } from '../lib/core/types/connector-status';
import type { Mission } from '../lib/core/types/mission';
import type { MissionTracking } from '../lib/core/types/tracking';
import { analyzeTJMHistory } from '../lib/core/tjm-history';
import type { TJMHistory, TJMRegion } from '../lib/core/types/tjm';
import { resolvePremiumFeatureFlag, shouldPremiumGate } from '../lib/core/features/flags';
import {
  DEFAULT_SETTINGS,
  getFeedSavedViews,
  getFeedSortBy,
  getSettings,
  setFeedSavedViews,
  setFeedSortBy,
  setSettings,
} from '../lib/shell/storage/chrome-storage';
import {
  runScan,
  ScanError,
  type ScanResult,
  type ConnectorScanState,
} from '../lib/shell/scan/scanner';
import { createActor, type ActorRefFrom } from 'xstate';
import {
  scanLifecycleMachine,
  type ScanCheckpoint,
  type ScanTerminalDecision,
  type ScanTrigger,
} from '../models/scan-lifecycle.machine';
import { waitForScanRecovery } from './scan-recovery';
import { rescoreStoredMissions } from '../lib/shell/scan/rescore';
import { getConnectorIds } from '../lib/shell/connectors/index';
import { getSeenIds, saveSeenIds } from '../lib/shell/storage/seen-missions';
import { getFavorites, saveFavorites, getHidden, saveHidden } from '../lib/shell/storage/favorites';
import {
  getConnectedAlertPreferences,
  saveConnectedAlertPreferences,
} from '../lib/shell/storage/connected-alert-preferences';
import { getAlertHistory } from '../lib/shell/storage/alert-history';
import {
  clearScanCheckpoint,
  setNewMissionCount,
  resetNewMissionCount,
  consumeDeepLinkIntent,
  saveScanCheckpoint,
} from '../lib/shell/storage/session-storage';
import { markAsSeen } from '../lib/core/seen/mark-seen';
import {
  notifyHighScoreMissions,
  setupNotificationClickHandler,
} from '../lib/shell/notifications/notify-missions';
import {
  sendDailyDigest,
  scheduleDailyDigestAlarm,
  DIGEST_ALARM_NAME,
} from '../lib/shell/notifications/daily-digest';
import { clearExpiredSemanticCache } from '../lib/shell/storage/semantic-cache';
import {
  getAllHealthSnapshots,
  readHealthSnapshotsForProbeReconciliation,
  resetHealthSnapshot,
} from '../lib/shell/storage/connector-health';
import { collectDiagnosticExport } from '../lib/shell/diagnostics/collect-diagnostic-export';
import { getAllParserHealth } from '../lib/shell/scan/parser-health';
import {
  clearFeedTourSeen,
  clearOnboardingCompleted,
  getFeedTourSeen,
  getFirstScanDone,
  getKbdCheatsheetTipSeen,
  getOnboardingCompleted,
  getProfileBannerDismissed,
  setFeedTourSeen,
  setKbdCheatsheetTipSeen,
  setOnboardingCompleted,
  setProfileBannerDismissed,
} from '../lib/shell/storage/first-scan';
import {
  connectorIdFromAlarm,
  isProbeAlarm,
  reconcileProbeAlarmsLocally,
  syncProbeAlarm,
} from '../lib/shell/health/probe-scheduler';
import { automaticScanConsentAuthorized } from '../models/background-scheduling.contract';

import {
  getTracking,
  saveTracking,
  deleteTracking,
  getAllTrackings,
  getTrackingsByStatus,
} from '../lib/shell/storage/tracking';
import { createTracking, transitionStatus } from '../lib/core/tracking/transitions';
import { isTerminalStatus } from '../lib/core/tracking/pipeline-summary';
import { getGeneratedAssetsForMission } from '../lib/shell/storage/generated-assets';
import { isMissionTrackingPayload, validateMessage } from '../lib/shell/messaging/schemas';
import {
  createSerializedApplicationTrackingError,
  type ApplicationTrackingIntent,
  type Task5ApplicationTrackingErrorCode,
} from '../lib/core/tracking/application-tracking-error';
import { classifyError } from '../lib/shell/messaging/error-boundary';
import { getProfileExtractor } from '../lib/shell/profile-extractors';
import { mergeCandidateProfileIntoUserProfile } from '../lib/core/profile-extractors/merge-candidate-profile';
import { countNewlyAddedExperiences } from '../lib/core/cv/experience-helpers';
import { verifyProfilePage } from '../lib/shell/profile/profile-page-verification';
import { resetLocalData } from '../lib/shell/storage/local-data-reset';
import { loadTJMHistory, recordTJMFromMissions } from '../lib/shell/storage/tjm-history';
import { clearConnectorDynamicRules } from '../lib/shell/connectors/cookie-rules';

if (import.meta.env.DEV) {
  console.debug('[MissionPulse] Service worker started');
}

type LinkedInProfilePreviewMessage = Extract<BridgeMessage, { type: 'LINKEDIN_PROFILE_PREVIEWED' }>;
type TrackingFailureMessage = Extract<BridgeMessage, { type: 'TRACKING_FAILED' }>;

function trackingFailureMessage(
  intent: ApplicationTrackingIntent,
  missionId: string | null,
  code: Task5ApplicationTrackingErrorCode
): TrackingFailureMessage {
  return {
    type: 'TRACKING_FAILED',
    payload: createSerializedApplicationTrackingError(intent, missionId, code),
  };
}

function buildTJMAnalysis(
  history: TJMHistory,
  profileStacks: string[] | undefined,
  region: TJMRegion | undefined
) {
  const hasStackFilter = profileStacks !== undefined && profileStacks.length > 0;
  const hasRegionFilter = region !== undefined;

  if (!hasStackFilter && !hasRegionFilter) {
    return analyzeTJMHistory(history);
  }

  const normalizedStacks = hasStackFilter
    ? new Set(profileStacks.map((stack) => stack.toLowerCase().trim()).filter(Boolean))
    : null;

  return analyzeTJMHistory({
    records: history.records.filter((record) => {
      if (normalizedStacks && !normalizedStacks.has(record.stack)) {
        return false;
      }
      if (hasRegionFilter && record.region !== region) {
        return false;
      }
      return true;
    }),
  });
}

function getBridgeErrorCode(error: import('../lib/core/errors/app-error').AppError): string {
  const code = error.context?.profileExtractorCode;
  return typeof code === 'string' ? code : error.type;
}

async function previewLinkedInProfile(
  startedAt: number,
  tabId?: number
): Promise<LinkedInProfilePreviewMessage> {
  const extractor = getProfileExtractor('linkedin');
  const result = await extractor.extractProfile(startedAt, tabId);

  if (!result.ok) {
    const errorCode = getBridgeErrorCode(result.error);
    return {
      type: 'LINKEDIN_PROFILE_PREVIEWED',
      payload: {
        extracted: false,
        errorCode,
        errorMessage: result.error.message,
      },
    };
  }

  return {
    type: 'LINKEDIN_PROFILE_PREVIEWED',
    payload: { extracted: true, profile: result.value },
  };
}

// Trigger expired semantic cache cleanup on startup
clearExpiredSemanticCache().catch((err) => {
  console.warn('[MissionPulse] Failed to cleanup expired semantic cache:', err);
});

// Health snapshots are persisted across service worker wake-ups so the side panel
// can show the latest known connector state even when the worker hibernates.

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Remove stale connector DNR rules from previous versions. Connectors now install
// short-lived, domain-scoped rules only around the network calls that need them.
clearConnectorDynamicRules().catch((err) => {
  console.warn('[MissionPulse] Failed to clear connector header rules:', err);
});

// Setup notification click handler
setupNotificationClickHandler();

// ── Scan orchestration helpers ──

/**
 * Convertit les ConnectorScanState du scanner en ConnectorProgress pour le bridge.
 */
function toConnectorProgress(states: ConnectorScanState[]): ConnectorProgress[] {
  return states.map((s) => ({
    connectorId: s.connectorId,
    connectorName: s.connectorName,
    state: s.state,
    missionsCount: s.missionsCount,
    error: s.error,
    retryCount: s.retryCount,
  }));
}

/**
 * Envoie un message SCAN_PROGRESS au side panel (si ouvert).
 * Les erreurs de messaging sont ignorées (panel peut être fermé).
 */
function sendScanProgress(payload: ScanProgressPayload): void {
  chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS', payload }).catch(() => {
    // Side panel not open, ignore
  });
}

function sendScanPartialResult(payload: {
  operationId: string;
  connectorId: string;
  connectorName: string;
  missions: Mission[];
}): void {
  chrome.runtime.sendMessage({ type: 'SCAN_PARTIAL_RESULT', payload }).catch(() => {
    // Side panel not open, ignore
  });
}

type ScanLifecycleActor = ActorRefFrom<typeof scanLifecycleMachine>;
type ScanTerminalMessage = Extract<
  BridgeMessage,
  { type: 'SCAN_COMPLETE' | 'SCAN_ERROR' | 'SCAN_CANCELLED' }
>;
type ScanExecutionMessage = ScanTerminalMessage | Extract<BridgeMessage, { type: 'SCAN_BUSY' }>;
type ScanStartedMessage = Extract<BridgeMessage, { type: 'SCAN_STARTED' }>;
type ScanCancelRequestedMessage = Extract<BridgeMessage, { type: 'SCAN_CANCEL_REQUESTED' }>;
type ScanStartRejectedMessage = Extract<BridgeMessage, { type: 'SCAN_START_REJECTED' }>;
type ScanCancelRejectedMessage = Extract<BridgeMessage, { type: 'SCAN_CANCEL_REJECTED' }>;

interface ActiveScanOperation {
  operationId: string;
  trigger: ScanTrigger;
  controller: AbortController;
  actor: ScanLifecycleActor;
  terminalMessage: ScanTerminalMessage | null;
  terminalBroadcasted: boolean;
  checkpointTail: Promise<void>;
  checkpointFailure: unknown | null;
}

interface ScanExecutionOutcome {
  message: ScanExecutionMessage;
  result: ScanResult | null;
}

interface ExecuteScanOptions {
  pageDelayMs: number;
  profileOverride?: import('../lib/core/types/profile').UserProfile;
  connectorIdsOverride?: readonly string[];
  emitProgress?: boolean;
  emitPartialResults?: boolean;
}

type BeginScanResult =
  | { kind: 'busy'; outcome: ScanExecutionOutcome }
  | {
      kind: 'started';
      operation: ActiveScanOperation;
      complete: () => Promise<ScanExecutionOutcome>;
    };

let activeScanOperation: ActiveScanOperation | null = null;
const settledScanOperationIds = new Set<string>();

type ProvisionalScanAdmissionDecision =
  | { kind: 'accepted' }
  | { kind: 'busy'; activeOperationId: string }
  | { kind: 'rejected'; code: string; message: string };

interface ProvisionalScanAdmission {
  decision: Promise<ProvisionalScanAdmissionDecision>;
  resolve: (decision: ProvisionalScanAdmissionDecision) => void;
}

const provisionalScanAdmissions = new Map<string, ProvisionalScanAdmission>();
let provisionalScanAdmissionTail: Promise<void> = Promise.resolve();

function createProvisionalScanAdmission(): ProvisionalScanAdmission {
  let resolveDecision: ((decision: ProvisionalScanAdmissionDecision) => void) | undefined;
  const decision = new Promise<ProvisionalScanAdmissionDecision>((resolve) => {
    resolveDecision = resolve;
  });
  return {
    decision,
    resolve: (result) => {
      resolveDecision?.(result);
    },
  };
}

async function serializeProvisionalScanAdmission<T>(work: () => Promise<T>): Promise<T> {
  const predecessor = provisionalScanAdmissionTail;
  let release: (() => void) | undefined;
  provisionalScanAdmissionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await predecessor;
  try {
    return await work();
  } finally {
    release?.();
  }
}

interface ScanAdmissionState {
  operationId: string | null;
  observed: Promise<void>;
  failure: unknown | null;
  retry: (() => Promise<void>) | null;
  retrying: boolean;
}

class ScanCommandRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ScanCommandRejectedError';
  }
}

let scanAdmissionState: ScanAdmissionState = {
  operationId: null,
  observed: Promise.resolve(),
  failure: null,
  retry: null,
  retrying: false,
};

function installScanAdmissionBarrier(
  work: Promise<unknown>,
  operationId: string,
  retry: () => Promise<void>
): void {
  const state: ScanAdmissionState = {
    operationId,
    observed: Promise.resolve(),
    failure: null,
    retry,
    retrying: false,
  };
  state.observed = work.then(
    () => undefined,
    (error: unknown) => {
      state.failure = error;
    }
  );
  scanAdmissionState = state;
}

async function waitForScanAdmission(): Promise<void> {
  const state = scanAdmissionState;
  await state.observed;
  if (state.failure && state.retry && !state.retrying) {
    state.failure = null;
    state.retrying = true;
    state.observed = state.retry().then(
      () => {
        state.retrying = false;
      },
      (error: unknown) => {
        state.failure = error;
        state.retrying = false;
      }
    );
  }
  await state.observed;
  if (state.failure) {
    throw new ScanCommandRejectedError(
      'CHECKPOINT_CLEANUP_PENDING',
      `Le checkpoint terminal de ${state.operationId ?? 'l’opération précédente'} doit être récupéré.`
    );
  }
}

function rememberSettledScanOperation(operationId: string): void {
  settledScanOperationIds.add(operationId);
  if (settledScanOperationIds.size > 32) {
    const oldestOperationId = settledScanOperationIds.values().next().value;
    if (typeof oldestOperationId === 'string') {
      settledScanOperationIds.delete(oldestOperationId);
    }
  }
}

async function waitForScanRecoveryAndRemember(): Promise<string | null> {
  const recoveredOperationId = await waitForScanRecovery();
  if (recoveredOperationId) {
    rememberSettledScanOperation(recoveredOperationId);
  }
  return recoveredOperationId;
}

function isCancelledScan(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof ScanError && error.code === 'CANCELLED') ||
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 'CANCELLED')
  );
}

function assertOperationNotCancelled(operation: ActiveScanOperation): void {
  if (operation.controller.signal.aborted) {
    throw new ScanError('Scan annulé.', 'CANCELLED');
  }
}

function checkpointStorageError(error: unknown): { code: 'CHECKPOINT_STORAGE'; message: string } {
  return {
    code: 'CHECKPOINT_STORAGE',
    message: error instanceof Error ? error.message : 'Le checkpoint du scan est indisponible.',
  };
}

function scanCommandRejection(error: unknown): { code: string; message: string } {
  if (error instanceof ScanCommandRejectedError) {
    return { code: error.code, message: error.message };
  }
  return checkpointStorageError(error);
}

function checkpointState(operation: ActiveScanOperation): ScanCheckpoint['state'] {
  const state = operation.actor.getSnapshot().value;
  if (typeof state !== 'string' || state === 'idle' || state === 'busy') {
    throw new Error(`Cannot checkpoint scan lifecycle state: ${String(state)}`);
  }
  return state;
}

function terminalDecisionFromMessage(message: ScanTerminalMessage): ScanTerminalDecision {
  if (message.type === 'SCAN_COMPLETE') {
    return { type: 'SCAN_COMPLETE', missionIds: message.payload.missions.map(({ id }) => id) };
  }
  if (message.type === 'SCAN_ERROR') {
    return {
      type: 'SCAN_ERROR',
      code: message.payload.code,
      message: message.payload.message,
    };
  }
  return { type: 'SCAN_CANCELLED' };
}

function createScanCheckpoint(
  operation: ActiveScanOperation,
  terminal: ScanTerminalDecision | null = null
): ScanCheckpoint {
  const snapshot = operation.actor.getSnapshot();
  return {
    version: 1,
    operationId: operation.operationId,
    state: checkpointState(operation),
    trigger: operation.trigger,
    connectorResults: { ...snapshot.context.connectorResults },
    cancellationRequested: snapshot.context.cancellationRequested,
    terminal,
  };
}

function queueLiveCheckpoint(operation: ActiveScanOperation): void {
  const write = saveScanCheckpoint(createScanCheckpoint(operation));
  operation.checkpointTail = write.then(
    () => undefined,
    (error: unknown) => {
      operation.checkpointFailure ??= error;
    }
  );
}

async function awaitQueuedCheckpoints(operation: ActiveScanOperation): Promise<void> {
  await operation.checkpointTail;
  if (operation.checkpointFailure) {
    const error = checkpointStorageError(operation.checkpointFailure);
    throw new ScanError(error.message, error.code);
  }
}

async function persistLiveCheckpoint(operation: ActiveScanOperation): Promise<void> {
  await awaitQueuedCheckpoints(operation);
  try {
    await saveScanCheckpoint(createScanCheckpoint(operation));
  } catch (error) {
    operation.checkpointFailure = error;
    const storageError = checkpointStorageError(error);
    throw new ScanError(storageError.message, storageError.code);
  }
}

async function broadcastTerminalOnce(
  operation: ActiveScanOperation,
  message: ScanTerminalMessage
): Promise<void> {
  if (operation.terminalBroadcasted) {
    return;
  }
  operation.terminalMessage = message;
  operation.terminalBroadcasted = true;
  rememberSettledScanOperation(operation.operationId);
  await chrome.runtime.sendMessage(message).catch(() => {
    // Side panel not open, ignore
  });
}

function releaseOperationRuntime(operation: ActiveScanOperation): void {
  if (activeScanOperation === operation) {
    activeScanOperation = null;
  }
  operation.actor.stop();
}

async function settleTerminalOperation(
  operation: ActiveScanOperation,
  message: ScanTerminalMessage,
  afterTerminal?: () => Promise<void>
): Promise<ScanTerminalMessage> {
  let afterTerminalCompleted = false;
  let afterTerminalAttempt: Promise<void> | null = null;
  const runAfterTerminalOnce = (): Promise<void> => {
    if (!afterTerminal || afterTerminalCompleted) {
      return Promise.resolve();
    }
    afterTerminalAttempt ??= afterTerminal().then(
      () => {
        afterTerminalCompleted = true;
      },
      (error: unknown) => {
        afterTerminalAttempt = null;
        throw error;
      }
    );
    return afterTerminalAttempt;
  };
  const finalize = async (): Promise<void> => {
    try {
      await operation.checkpointTail;
      await saveScanCheckpoint(
        createScanCheckpoint(operation, terminalDecisionFromMessage(message))
      );
      await broadcastTerminalOnce(operation, message);
      const cleared = await clearScanCheckpoint(operation.operationId);
      if (!cleared) {
        throw new Error(
          `Terminal checkpoint ${operation.operationId} was not cleared conditionally.`
        );
      }
    } finally {
      releaseOperationRuntime(operation);
    }
    await runAfterTerminalOnce();
  };
  const finalization = finalize();
  installScanAdmissionBarrier(finalization, operation.operationId, finalize);
  await finalization;
  return message;
}

async function requestCancellation(
  operation: ActiveScanOperation
): Promise<ScanCancelRequestedMessage> {
  const snapshot = operation.actor.getSnapshot();
  if (snapshot.status === 'active' && snapshot.value !== 'cancelling') {
    operation.actor.send({ type: 'CANCEL', operationId: operation.operationId });
  }
  operation.controller.abort();
  if (operation.actor.getSnapshot().status === 'active') {
    try {
      await persistLiveCheckpoint(operation);
    } catch {
      // The terminal checkpoint is still attempted after scanner/transaction
      // quiescence. This rejection is retained on the operation and observed.
    }
  }
  return {
    type: 'SCAN_CANCEL_REQUESTED',
    payload: { operationId: operation.operationId },
  };
}

async function settleCancelledAfterQuiescence(
  operation: ActiveScanOperation
): Promise<ScanTerminalMessage> {
  if (operation.actor.getSnapshot().value === 'cancelling') {
    operation.actor.send({ type: 'ABORT_CONFIRMED', operationId: operation.operationId });
  }

  const message: ScanTerminalMessage = {
    type: 'SCAN_CANCELLED',
    payload: { operationId: operation.operationId },
  };
  return settleTerminalOperation(operation, message);
}

function createBusyOutcome(operationId: string, trigger: ScanTrigger): ScanExecutionOutcome {
  const activeOperationId = activeScanOperation?.operationId;
  if (!activeOperationId) {
    throw new Error('Cannot create a busy result without an active scan lease.');
  }
  const actor = createActor(scanLifecycleMachine, {
    input: {
      now: Date.now(),
      maxRetries: 2,
      activeLeaseOperationId: activeOperationId,
    },
  });
  actor.start();
  actor.send({ type: 'START', operationId, trigger });
  actor.stop();

  return {
    message: {
      type: 'SCAN_BUSY',
      payload: { operationId, activeOperationId },
    },
    result: null,
  };
}

function forwardScanRuntimeEvent(
  operation: ActiveScanOperation,
  event: import('../lib/shell/scan/scanner').ScanRuntimeEvent
): void {
  if (operation.controller.signal.aborted || operation.actor.getSnapshot().status !== 'active') {
    return;
  }
  const operationId = operation.operationId;
  switch (event.type) {
    case 'CONNECTOR_STARTED':
      operation.actor.send({ ...event, operationId });
      break;
    case 'CONNECTOR_SUCCEEDED':
      operation.actor.send({ ...event, operationId });
      break;
    case 'CONNECTOR_FAILED':
      operation.actor.send({ ...event, operationId });
      break;
    case 'RETRY_TIMER_FIRED':
      operation.actor.send({ ...event, operationId });
      break;
    case 'NETWORK_OFFLINE':
      operation.actor.send({ type: 'NETWORK_OFFLINE', operationId });
      break;
  }
  if (operation.actor.getSnapshot().status === 'active') {
    queueLiveCheckpoint(operation);
  }
}

async function executeAcceptedScanOperation(
  operation: ActiveScanOperation,
  options: ExecuteScanOptions
): Promise<ScanExecutionOutcome> {
  const { actor, operationId, trigger } = operation;

  try {
    const settings = await getSettings();
    assertOperationNotCancelled(operation);
    const connectorIds = options.connectorIdsOverride
      ? [...options.connectorIdsOverride]
      : settings.enabledConnectors;
    if (connectorIds.length === 0) {
      const error = { code: 'NO_CONNECTORS', message: 'Aucun connecteur actif.' };
      actor.send({ type: 'START_FAILED', operationId, error });
      const message: ScanTerminalMessage = {
        type: 'SCAN_ERROR',
        payload: { operationId, ...error },
      };
      return { message: await settleTerminalOperation(operation, message), result: null };
    }

    actor.send({ type: 'START_READY', operationId, connectorIds });
    await persistLiveCheckpoint(operation);
    const result = await runScan(operation.controller.signal, undefined, {
      pageDelayMs: options.pageDelayMs,
      profileOverride: options.profileOverride,
      connectorIdsOverride: connectorIds,
      onDetailedProgress: options.emitProgress
        ? (info) => {
            if (activeScanOperation?.operationId !== operationId) {
              return;
            }
            sendScanProgress({
              operationId,
              phase: info.phase,
              current: info.current,
              total: info.total,
              connectorProgress: toConnectorProgress(info.connectorStates),
            });
          }
        : undefined,
      onConnectorResult: options.emitPartialResults
        ? (info) => {
            if (activeScanOperation?.operationId !== operationId) {
              return;
            }
            sendScanPartialResult({ operationId, ...info });
          }
        : undefined,
      onLifecycleEvent: (event) => {
        forwardScanRuntimeEvent(operation, event);
      },
    });
    assertOperationNotCancelled(operation);
    await awaitQueuedCheckpoints(operation);

    if (actor.getSnapshot().value === 'failed') {
      const message: ScanTerminalMessage = {
        type: 'SCAN_ERROR',
        payload: {
          operationId,
          code: 'ALL_CONNECTORS_FAILED',
          message: 'Tous les connecteurs ont échoué.',
        },
      };
      return { message: await settleTerminalOperation(operation, message), result };
    }
    if (actor.getSnapshot().value !== 'persisting') {
      throw new Error(`Invalid scan lifecycle before persistence: ${actor.getSnapshot().value}`);
    }

    await persistLiveCheckpoint(operation);
    await saveMissions(result.missions, operation.controller.signal);
    actor.send({ type: 'PERSIST_SUCCEEDED', operationId });
    const committedState = actor.getSnapshot().value;
    if (committedState !== 'completed' && committedState !== 'partial') {
      throw new Error(`Invalid scan lifecycle after persistence: ${committedState}`);
    }

    const message: ScanTerminalMessage = {
      type: 'SCAN_COMPLETE',
      payload: { operationId, missions: result.missions },
    };
    // Claim and publish the canonical terminal synchronously before any
    // suspendable projection. The actor can be released after terminal clear,
    // but scan admission remains fenced until every older projection settles
    // so its badge/status writes cannot overtake a newer scan.
    await settleTerminalOperation(operation, message, async () => {
      if (trigger === 'alarm') {
        await chrome.runtime
          .sendMessage({
            type: 'MISSIONS_UPDATED',
            projection: 'cold-only',
            payload: result.missions,
          })
          .catch(() => {
            // Side panel not open, durable missions remain committed.
          });
      }

      try {
        await persistPostCommitEffects(result);
      } catch (error) {
        console.warn('[MissionPulse] Post-commit scan effects failed:', error);
      }
    });

    return { message, result };
  } catch (error) {
    if (actor.getSnapshot().status === 'done') {
      throw error;
    }
    if (isCancelledScan(error, operation.controller.signal)) {
      return { message: await settleCancelledAfterQuiescence(operation), result: null };
    }

    const scanError = {
      code: error instanceof ScanError ? error.code : 'UNKNOWN',
      message: error instanceof Error ? error.message : 'Erreur inconnue lors du scan',
    };
    const snapshot = actor.getSnapshot();
    if (snapshot.status === 'active' && snapshot.value === 'starting') {
      actor.send({ type: 'START_FAILED', operationId, error: scanError });
    } else if (snapshot.status === 'active' && snapshot.value === 'persisting') {
      actor.send({ type: 'PERSIST_FAILED', operationId, error: scanError });
    } else if (snapshot.status === 'active') {
      actor.send({ type: 'RUNTIME_FAILED', operationId, error: scanError });
    }
    const message: ScanTerminalMessage = {
      type: 'SCAN_ERROR',
      payload: { operationId, ...scanError },
    };
    return { message: await settleTerminalOperation(operation, message), result: null };
  }
}

async function beginScanOperation(
  operationId: string,
  trigger: ScanTrigger,
  options: ExecuteScanOptions
): Promise<BeginScanResult> {
  if (provisionalScanAdmissions.has(operationId)) {
    throw new ScanCommandRejectedError(
      'DUPLICATE_OPERATION',
      'Cette opération de scan est déjà en cours d’admission.'
    );
  }
  const provisionalAdmission = createProvisionalScanAdmission();
  provisionalScanAdmissions.set(operationId, provisionalAdmission);

  try {
    const result = await serializeProvisionalScanAdmission(async (): Promise<BeginScanResult> => {
      await waitForScanRecoveryAndRemember();
      await waitForScanAdmission();
      if (activeScanOperation) {
        const activeOperationId = activeScanOperation.operationId;
        provisionalAdmission.resolve({ kind: 'busy', activeOperationId });
        return { kind: 'busy', outcome: createBusyOutcome(operationId, trigger) };
      }

      const actor = createActor(scanLifecycleMachine, {
        input: { now: Date.now(), maxRetries: 2, activeLeaseOperationId: null },
      });
      const operation: ActiveScanOperation = {
        operationId,
        trigger,
        controller: new AbortController(),
        actor,
        terminalMessage: null,
        terminalBroadcasted: false,
        checkpointTail: Promise.resolve(),
        checkpointFailure: null,
      };
      actor.start();
      actor.send({ type: 'START', operationId, trigger });

      try {
        await saveScanCheckpoint(createScanCheckpoint(operation));
      } catch (error) {
        const startFailure = checkpointStorageError(error);
        if (actor.getSnapshot().value === 'starting') {
          actor.send({ type: 'START_FAILED', operationId, error: startFailure });
        }
        releaseOperationRuntime(operation);
        throw new ScanCommandRejectedError(startFailure.code, startFailure.message);
      }

      activeScanOperation = operation;
      provisionalAdmission.resolve({ kind: 'accepted' });

      let completion: Promise<ScanExecutionOutcome> | null = null;
      const complete = (): Promise<ScanExecutionOutcome> => {
        completion ??= executeAcceptedScanOperation(operation, options);
        return completion;
      };

      return {
        kind: 'started',
        operation,
        complete,
      };
    });
    return result;
  } catch (error) {
    const rejection = scanCommandRejection(error);
    provisionalAdmission.resolve({ kind: 'rejected', ...rejection });
    throw error;
  } finally {
    if (provisionalScanAdmissions.get(operationId) === provisionalAdmission) {
      provisionalScanAdmissions.delete(operationId);
    }
  }
}

async function executeScanOperation(
  operationId: string,
  trigger: ScanTrigger,
  options: ExecuteScanOptions
): Promise<ScanExecutionOutcome> {
  const begun = await beginScanOperation(operationId, trigger, options);
  return begun.kind === 'busy' ? begun.outcome : begun.complete();
}

/**
 * Projette les effets secondaires dérivés d'un scan déjà commité.
 *
 * La transaction missions est l'unique commit canonique. Tout ce qui suit est
 * best-effort : une projection défaillante ne peut ni annuler le commit, ni
 * transformer son terminal en erreur.
 */
async function clearNewMissionBadge(): Promise<void> {
  await setNewMissionCount(0);
  await chrome.action.setBadgeText({ text: '' });
}

async function loadConnectorHealthSnapshots() {
  const now = Date.now();
  const connectorIds = getConnectorIds();
  const snapshots = await getAllHealthSnapshots(connectorIds, now);
  return [...snapshots.values()];
}

async function recheckConnectorHealth(
  connectorId: string,
  enable = false
): Promise<import('../lib/core/types/mission').Mission[]> {
  const settings = await getSettings();
  const persistedEnabled = enable
    ? Array.from(new Set([...settings.enabledConnectors, connectorId]))
    : settings.enabledConnectors;

  await resetHealthSnapshot(connectorId);

  try {
    const outcome = await executeScanOperation(crypto.randomUUID(), 'manual', {
      pageDelayMs: 300,
      connectorIdsOverride: [connectorId],
    });
    if (outcome.message.type === 'SCAN_BUSY') {
      throw new ScanError('Un scan est déjà en cours. Veuillez patienter.', 'MUTEX');
    }
    if (outcome.message.type === 'SCAN_ERROR') {
      throw new ScanError(outcome.message.payload.message, 'UNKNOWN');
    }
    if (outcome.message.type === 'SCAN_CANCELLED') {
      throw new ScanError('Scan annulé.', 'CANCELLED');
    }
    return outcome.result?.missions ?? [];
  } finally {
    if (enable) {
      await setSettings({ ...settings, enabledConnectors: persistedEnabled });
    }
  }
}

async function persistPostCommitEffects(
  result: Pick<ScanResult, 'missions' | 'sourceMissions' | 'duplicateRelations' | 'errors'>
): Promise<void> {
  const { missions, errors } = result;
  const now = Date.now();

  if (missions.length > 0) {
    try {
      await recordTJMFromMissions(missions, new Date(now).toISOString().slice(0, 10));
    } catch {
      // TJM history is non-critical.
    }
  }
  try {
    await purgeOldMissions(90);
  } catch {
    // Purge is non-critical.
  }

  // Persist connector statuses
  const statusMap = new Map<string, { missions: number; error: string | null }>();
  for (const mission of missions) {
    const entry = statusMap.get(mission.source) ?? { missions: 0, error: null };
    entry.missions++;
    statusMap.set(mission.source, entry);
  }
  for (const err of errors) {
    const entry = statusMap.get(err.connectorId) ?? { missions: 0, error: null };
    entry.error = err.message;
    statusMap.set(err.connectorId, entry);
  }
  const persistedStatuses: PersistedConnectorStatus[] = [...statusMap.entries()].map(
    ([id, data]) => ({
      connectorId: id,
      connectorName: id,
      lastState: data.error && data.missions === 0 ? 'error' : 'done',
      missionsCount: data.missions,
      error: data.error ? { type: 'connector', message: data.error } : null,
      lastSyncAt: now,
      lastSuccessAt: data.missions > 0 ? now : null,
    })
  );
  try {
    await saveConnectorStatuses(persistedStatuses);
  } catch {
    /* Non-critical: status persistence */
  }

  try {
    if (missions.length === 0) {
      await clearNewMissionBadge();
      return;
    }

    // Update badge with new mission count
    const seenIds = await getSeenIds();
    const seenSet = new Set(seenIds);
    const newMissions = missions.filter((m) => !seenSet.has(m.id));
    const newCount = newMissions.length;

    if (newCount > 0) {
      await setNewMissionCount(newCount);
      await chrome.action.setBadgeText({ text: String(newCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    } else {
      await clearNewMissionBadge();
    }

    // notifyHighScoreMissions persists its focus intent before showing Chrome's
    // notification, so a fast click cannot race ahead of that write.
    if (newCount > 0) {
      const notification = await notifyHighScoreMissions(newMissions);
      if (notification.shown && notification.notifiedMissionIds.length > 0) {
        await saveSeenIds(markAsSeen(seenIds, notification.notifiedMissionIds));
      }
    }
  } catch {
    // Badge and notification projections are non-critical after commit.
  }
}

// Message handler — profile management + scan orchestration
chrome.runtime.onMessage.addListener((rawMessage: unknown, _sender, sendResponse) => {
  // ── Input validation ──────────────────────────────────────────────────────
  const validation = validateMessage(rawMessage);
  if (!validation.valid) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Bridge] Validation failed for "${validation.messageType ?? 'unknown'}":`,
        validation.errors,
        { sender: _sender.id ?? _sender.tab?.id }
      );
    }
    sendResponse({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: validation.errors.join('; ') },
    });
    return false;
  }

  // Cast validé — le message a passé les schémas Zod
  const message = rawMessage as BridgeMessage;

  // ── Error boundary global ─────────────────────────────────────────────────
  // Chaque branche a son propre try/catch mais cette enveloppe protège contre
  // toute exception imprévue qui sinon crasherait le service worker.
  try {
    if (message.type === 'GET_PROFILE') {
      getProfile().then((profile) => {
        sendResponse({ type: 'PROFILE_RESULT', payload: profile });
      });
      return true;
    }

    if (message.type === 'SAVE_PROFILE') {
      (async () => {
        try {
          await saveProfile(message.payload);

          try {
            const rescored = await rescoreStoredMissions(message.payload);
            await chrome.runtime.sendMessage({ type: 'MISSIONS_UPDATED', payload: rescored });
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[MissionPulse] Profile saved but mission rescore failed:', err);
            }
          }

          sendResponse({ type: 'PROFILE_RESULT', payload: message.payload });
          chrome.runtime
            .sendMessage({ type: 'PROFILE_UPDATED', payload: message.payload })
            .catch(() => {
              // Side panel not open, ignore
            });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[MissionPulse] SAVE_PROFILE via bridge (legacy):', message);
          sendResponse({ type: 'PROFILE_RESULT', payload: null });
        }
      })();
      return true;
    }

    if (message.type === 'GET_SETTINGS') {
      getSettings()
        .then((settings) => {
          sendResponse({ type: 'SETTINGS_RESULT', payload: settings });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_SETTINGS error:', err);
          sendResponse({ type: 'SETTINGS_RESULT', payload: DEFAULT_SETTINGS });
        });
      return true;
    }

    if (message.type === 'SAVE_SETTINGS') {
      setSettings(message.payload)
        .then(() => {
          chrome.runtime
            .sendMessage({ type: 'SETTINGS_UPDATED', payload: message.payload })
            .catch(() => {
              // Side panel may be closed.
            });
          sendResponse({
            type: 'SETTINGS_SAVED',
            payload: { saved: true, settings: message.payload },
          });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_SETTINGS error:', err);
          sendResponse({ type: 'SETTINGS_SAVED', payload: { saved: false, settings: null } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_MISSIONS') {
      getMissions()
        .then((missions) => {
          sendResponse({ type: 'FEED_MISSIONS_RESULT', payload: missions });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_MISSIONS error:', err);
          sendResponse({ type: 'FEED_MISSIONS_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'GET_TJM_ANALYSIS') {
      loadTJMHistory()
        .then((history) => {
          sendResponse({
            type: 'TJM_ANALYSIS_RESULT',
            payload: {
              analysis: buildTJMAnalysis(
                history,
                message.payload?.profileStacks,
                message.payload?.region
              ),
            },
          });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_TJM_ANALYSIS error:', err);
          sendResponse({ type: 'TJM_ANALYSIS_RESULT', payload: { analysis: null } });
        });
      return true;
    }

    if (message.type === 'GET_PERSISTED_CONNECTOR_STATUSES') {
      getConnectorStatuses()
        .then((statuses) => {
          sendResponse({ type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: statuses });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PERSISTED_CONNECTOR_STATUSES error:', err);
          sendResponse({ type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'GET_FEED_FAVORITES') {
      getFavorites()
        .then((favorites) => {
          sendResponse({ type: 'FEED_FAVORITES_RESULT', payload: favorites });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_FAVORITES error:', err);
          sendResponse({ type: 'FEED_FAVORITES_RESULT', payload: {} });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_FAVORITES') {
      saveFavorites(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_FAVORITES_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_FAVORITES error:', err);
          sendResponse({ type: 'FEED_FAVORITES_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_HIDDEN') {
      getHidden()
        .then((hidden) => {
          sendResponse({ type: 'FEED_HIDDEN_RESULT', payload: hidden });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_HIDDEN error:', err);
          sendResponse({ type: 'FEED_HIDDEN_RESULT', payload: {} });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_HIDDEN') {
      saveHidden(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_HIDDEN_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_HIDDEN error:', err);
          sendResponse({ type: 'FEED_HIDDEN_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_SORT') {
      getFeedSortBy()
        .then((sortBy) => {
          sendResponse({ type: 'FEED_SORT_RESULT', payload: sortBy });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_SORT error:', err);
          sendResponse({ type: 'FEED_SORT_RESULT', payload: 'score' });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_SORT') {
      setFeedSortBy(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_SORT_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_SORT error:', err);
          sendResponse({ type: 'FEED_SORT_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_SAVED_VIEWS') {
      getFeedSavedViews()
        .then((views) => {
          sendResponse({ type: 'FEED_SAVED_VIEWS_RESULT', payload: views });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_SAVED_VIEWS error:', err);
          sendResponse({ type: 'FEED_SAVED_VIEWS_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'SAVE_FEED_SAVED_VIEWS') {
      setFeedSavedViews(message.payload)
        .then(() => {
          sendResponse({ type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_FEED_SAVED_VIEWS error:', err);
          sendResponse({ type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_CONNECTED_ALERT_PREFERENCES') {
      getConnectedAlertPreferences()
        .then((preferences) => {
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_RESULT', payload: preferences });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_CONNECTED_ALERT_PREFERENCES error:', err);
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_RESULT', payload: null });
        });
      return true;
    }

    if (message.type === 'SAVE_CONNECTED_ALERT_PREFERENCES') {
      saveConnectedAlertPreferences(message.payload)
        .then(() => {
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_CONNECTED_ALERT_PREFERENCES error:', err);
          sendResponse({ type: 'CONNECTED_ALERT_PREFERENCES_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_ALERT_HISTORY') {
      getAlertHistory()
        .then((history) => {
          sendResponse({ type: 'ALERT_HISTORY_RESULT', payload: history });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_ALERT_HISTORY error:', err);
          sendResponse({ type: 'ALERT_HISTORY_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'GET_SEEN_MISSIONS') {
      getSeenIds()
        .then((seenIds) => {
          sendResponse({ type: 'SEEN_MISSIONS_RESULT', payload: seenIds });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_SEEN_MISSIONS error:', err);
          sendResponse({ type: 'SEEN_MISSIONS_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'SAVE_SEEN_MISSIONS') {
      saveSeenIds(message.payload)
        .then(() => {
          sendResponse({ type: 'SEEN_MISSIONS_SAVED', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SAVE_SEEN_MISSIONS error:', err);
          sendResponse({ type: 'SEEN_MISSIONS_SAVED', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'RESET_NEW_MISSION_COUNT') {
      resetNewMissionCount()
        .then(() => {
          sendResponse({ type: 'NEW_MISSION_COUNT_RESET', payload: { reset: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] RESET_NEW_MISSION_COUNT error:', err);
          sendResponse({ type: 'NEW_MISSION_COUNT_RESET', payload: { reset: false } });
        });
      return true;
    }

    if (message.type === 'CONSUME_DEEP_LINK_INTENT') {
      consumeDeepLinkIntent()
        .then((intent) => {
          sendResponse({ type: 'DEEP_LINK_INTENT_CONSUMED', payload: { intent } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CONSUME_DEEP_LINK_INTENT error:', err);
          sendResponse({ type: 'DEEP_LINK_INTENT_CONSUMED', payload: { intent: null } });
        });
      return true;
    }

    if (message.type === 'CLEAR_EXTENSION_BADGE') {
      chrome.action
        .setBadgeText({ text: '' })
        .then(() => {
          sendResponse({ type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CLEAR_EXTENSION_BADGE error:', err);
          sendResponse({ type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: false } });
        });
      return true;
    }

    if (message.type === 'OPEN_EXTERNAL_URL') {
      chrome.tabs
        .create({ url: message.payload.url })
        .then(() => {
          sendResponse({ type: 'EXTERNAL_URL_OPENED', payload: { opened: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] OPEN_EXTERNAL_URL error:', err);
          sendResponse({ type: 'EXTERNAL_URL_OPENED', payload: { opened: false } });
        });
      return true;
    }

    if (message.type === 'GET_FIRST_SCAN_DONE') {
      getFirstScanDone()
        .then((done) => {
          sendResponse({ type: 'FIRST_SCAN_DONE_RESULT', payload: done });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FIRST_SCAN_DONE error:', err);
          sendResponse({ type: 'FIRST_SCAN_DONE_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'GET_PROFILE_BANNER_DISMISSED') {
      getProfileBannerDismissed()
        .then((dismissed) => {
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_RESULT', payload: dismissed });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PROFILE_BANNER_DISMISSED error:', err);
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_PROFILE_BANNER_DISMISSED') {
      setProfileBannerDismissed()
        .then(() => {
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_PROFILE_BANNER_DISMISSED error:', err);
          sendResponse({ type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'GET_ONBOARDING_COMPLETED') {
      getOnboardingCompleted()
        .then((completed) => {
          sendResponse({ type: 'ONBOARDING_COMPLETED_RESULT', payload: completed });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_ONBOARDING_COMPLETED error:', err);
          sendResponse({ type: 'ONBOARDING_COMPLETED_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_ONBOARDING_COMPLETED') {
      setOnboardingCompleted()
        .then(() => {
          sendResponse({ type: 'ONBOARDING_COMPLETED_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_ONBOARDING_COMPLETED error:', err);
          sendResponse({ type: 'ONBOARDING_COMPLETED_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'CLEAR_ONBOARDING_COMPLETED') {
      clearOnboardingCompleted()
        .then(() => {
          sendResponse({ type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CLEAR_ONBOARDING_COMPLETED error:', err);
          sendResponse({ type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: false } });
        });
      return true;
    }

    if (message.type === 'GET_FEED_TOUR_SEEN') {
      getFeedTourSeen()
        .then((seen) => {
          sendResponse({ type: 'FEED_TOUR_SEEN_RESULT', payload: seen });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_FEED_TOUR_SEEN error:', err);
          sendResponse({ type: 'FEED_TOUR_SEEN_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_FEED_TOUR_SEEN') {
      setFeedTourSeen()
        .then(() => {
          sendResponse({ type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_FEED_TOUR_SEEN error:', err);
          sendResponse({ type: 'FEED_TOUR_SEEN_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'CLEAR_FEED_TOUR_SEEN') {
      clearFeedTourSeen()
        .then(() => {
          sendResponse({ type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] CLEAR_FEED_TOUR_SEEN error:', err);
          sendResponse({ type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: false } });
        });
      return true;
    }

    if (message.type === 'GET_KBD_CHEATSHEET_TIP_SEEN') {
      getKbdCheatsheetTipSeen()
        .then((seen) => {
          sendResponse({ type: 'KBD_CHEATSHEET_TIP_SEEN_RESULT', payload: seen });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_KBD_CHEATSHEET_TIP_SEEN error:', err);
          sendResponse({ type: 'KBD_CHEATSHEET_TIP_SEEN_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_KBD_CHEATSHEET_TIP_SEEN') {
      setKbdCheatsheetTipSeen()
        .then(() => {
          sendResponse({ type: 'KBD_CHEATSHEET_TIP_SEEN_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_KBD_CHEATSHEET_TIP_SEEN error:', err);
          sendResponse({ type: 'KBD_CHEATSHEET_TIP_SEEN_SET', payload: { saved: false } });
        });
      return true;
    }

    if (message.type === 'VERIFY_PROFILE_PAGE') {
      verifyProfilePage(message.payload.url, message.payload.fields)
        .then((result) => {
          sendResponse({ type: 'PROFILE_PAGE_VERIFIED', payload: result });
        })
        .catch((err) => {
          sendResponse({
            type: 'PROFILE_PAGE_VERIFIED',
            payload: {
              read: {
                status: 'blocked',
                finalUrl: message.payload.url,
                reason: err instanceof Error ? err.message : 'Erreur inconnue',
              },
              comparisons: [],
              summary: { matches: 0, mismatches: 0, missing: 0 },
            },
          });
        });
      return true;
    }

    if (message.type === 'PREVIEW_LINKEDIN_PROFILE') {
      const startedAt = Date.now();
      previewLinkedInProfile(startedAt, message.payload?.tabId)
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          sendResponse({
            type: 'LINKEDIN_PROFILE_PREVIEWED',
            payload: {
              extracted: false,
              errorCode: 'dom_changed',
              errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            },
          });
        });
      return true;
    }

    if (message.type === 'SYNC_LINKEDIN_PROFILE_IMPORT') {
      (async () => {
        try {
          const draft = message.payload.profile;
          const current = await getProfile();
          const addedCount = countNewlyAddedExperiences(
            current?.experiences ?? [],
            draft.experiences
          );
          const merged = mergeCandidateProfileIntoUserProfile(current, draft, Date.now());
          await saveProfile(merged);
          chrome.runtime.sendMessage({ type: 'PROFILE_UPDATED', payload: merged }).catch(() => {
            // Side panel not open, ignore
          });
          sendResponse({
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: { imported: true, profile: draft, addedCount },
          });
        } catch (error) {
          sendResponse({
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: {
              imported: false,
              errorCode: 'sync_failed',
              errorMessage:
                error instanceof Error ? error.message : 'La synchronisation LinkedIn a échoué.',
            },
          });
        }
      })();
      return true;
    }

    if (message.type === 'IMPORT_LINKEDIN_PROFILE') {
      const startedAt = Date.now();
      previewLinkedInProfile(startedAt, message.payload?.tabId)
        .then((preview) => {
          if (!preview.payload.extracted) {
            sendResponse({
              type: 'LINKEDIN_PROFILE_IMPORTED',
              payload: {
                imported: false,
                errorCode: preview.payload.errorCode,
                errorMessage: preview.payload.errorMessage,
              },
            });
            return;
          }

          sendResponse({
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: { imported: true, profile: preview.payload.profile },
          });
        })
        .catch((error) => {
          sendResponse({
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: {
              imported: false,
              errorCode: 'dom_changed',
              errorMessage: error instanceof Error ? error.message : 'Import LinkedIn impossible.',
            },
          });
        });
      return true;
    }

    // ── Scan orchestration (panel → service worker) ──

    if (message.type === 'SCAN_START') {
      void beginScanOperation(message.payload.operationId, 'manual', {
        pageDelayMs: 300,
        emitProgress: true,
        emitPartialResults: true,
      })
        .then((begun) => {
          if (begun.kind === 'busy') {
            sendResponse(begun.outcome.message);
            return;
          }
          const acknowledgement: ScanStartedMessage = {
            type: 'SCAN_STARTED',
            payload: { operationId: message.payload.operationId },
          };
          sendResponse(acknowledgement);
          void begun.complete().catch((error) => {
            // executeAcceptedScanOperation owns terminal settlement. This catch
            // is a last-resort boundary for an unexpected programming failure.
            console.error('[MissionPulse] SCAN_START completion error:', error);
          });
        })
        .catch((error: unknown) => {
          const rejection = scanCommandRejection(error);
          const response: ScanStartRejectedMessage = {
            type: 'SCAN_START_REJECTED',
            payload: { operationId: message.payload.operationId, ...rejection },
          };
          sendResponse(response);
        });
      return true;
    }

    if (message.type === 'SCAN_CANCEL') {
      void (async (): Promise<ScanCancelRequestedMessage> => {
        const provisionalDecision = provisionalScanAdmissions.get(
          message.payload.operationId
        )?.decision;
        await waitForScanRecoveryAndRemember();
        if (provisionalDecision) {
          const decision = await provisionalDecision;
          if (decision.kind === 'rejected') {
            throw new ScanCommandRejectedError(decision.code, decision.message);
          }
          if (decision.kind === 'busy') {
            throw new ScanCommandRejectedError(
              'START_NOT_ACCEPTED',
              `Le scan ${message.payload.operationId} n’a pas été accepté car ${decision.activeOperationId} est actif.`
            );
          }
        }
        await waitForScanAdmission();
        const operation = activeScanOperation;
        if (
          settledScanOperationIds.has(message.payload.operationId) ||
          (operation?.operationId === message.payload.operationId &&
            (operation.terminalMessage || operation.actor.getSnapshot().status === 'done'))
        ) {
          return {
            type: 'SCAN_CANCEL_REQUESTED',
            payload: { operationId: message.payload.operationId },
          };
        }
        if (!operation || operation.operationId !== message.payload.operationId) {
          throw new ScanCommandRejectedError(
            'STALE_OPERATION',
            'Aucun scan actif ne correspond à cette opération.'
          );
        }
        return requestCancellation(operation);
      })()
        .then(sendResponse)
        .catch((error: unknown) => {
          const rejection = scanCommandRejection(error);
          const response: ScanCancelRejectedMessage = {
            type: 'SCAN_CANCEL_REJECTED',
            payload: { operationId: message.payload.operationId, ...rejection },
          };
          sendResponse(response);
        });
      return true;
    }

    if (message.type === 'GET_CONNECTOR_HEALTH') {
      loadConnectorHealthSnapshots()
        .then((snapshots) => {
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: snapshots });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_CONNECTOR_HEALTH error:', err);
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: [] });
        });
      return true;
    }

    if (message.type === 'RECHECK_CONNECTOR_HEALTH') {
      const { connectorId, enable = false } = message.payload;
      recheckConnectorHealth(connectorId, enable)
        .then(async () => {
          const snapshots = await loadConnectorHealthSnapshots();
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: snapshots });
        })
        .catch(async (err) => {
          console.warn('[MissionPulse] RECHECK_CONNECTOR_HEALTH error:', err);
          const snapshots = await loadConnectorHealthSnapshots();
          sendResponse({ type: 'CONNECTOR_HEALTH_RESULT', payload: snapshots });
        });
      return true;
    }

    if (message.type === 'GET_DIAGNOSTIC_EXPORT') {
      collectDiagnosticExport(new Date())
        .then((report) => {
          sendResponse({ type: 'DIAGNOSTIC_EXPORT_RESULT', payload: report });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_DIAGNOSTIC_EXPORT error:', err);
          sendResponse({
            type: 'DIAGNOSTIC_EXPORT_RESULT',
            payload: {
              version: '1',
              exportedAt: new Date().toISOString(),
              extensionVersion: '0.2.2',
              errors: { summary: { total: 0, byType: {}, last24h: 0 }, recent: [] },
              connectors: [],
              environment: {},
            },
          });
        });
      return true;
    }

    if (message.type === 'GET_PARSER_HEALTH') {
      getAllParserHealth()
        .then((records) => {
          sendResponse({ type: 'PARSER_HEALTH_RESULT', payload: records });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PARSER_HEALTH error:', err);
          sendResponse({ type: 'PARSER_HEALTH_RESULT', payload: [] });
        });
      return true;
    }

    // ── DB migration orchestrator handlers ──

    if (message.type === 'GET_MIGRATION_STATUS') {
      sendResponse({
        type: 'MIGRATION_STATUS_RESULT',
        payload: getMigrationStatus(),
      });
      return false;
    }

    if (message.type === 'RUN_MIGRATIONS') {
      runMigrations()
        .then((result) => {
          if (!result.ok) {
            sendResponse({
              type: 'MIGRATION_FAILED',
              payload: getMigrationStatus(),
            });
          } else {
            sendResponse({ type: 'MIGRATION_DONE', payload: result });
          }
        })
        .catch((err) => {
          console.warn('[MissionPulse] RUN_MIGRATIONS error:', err);
          sendResponse({
            type: 'MIGRATION_FAILED',
            payload: getMigrationStatus(),
          });
        });
      return true;
    }

    // ── Tracking handlers ──

    if (message.type === 'UPDATE_TRACKING') {
      const { missionId, status, note } = message.payload;
      const now = Date.now();

      (async () => {
        try {
          let tracking = await getTracking(missionId);
          if (!tracking) {
            tracking = createTracking(missionId, now);
          }

          const updated = transitionStatus(tracking, status, now, note ?? null);
          if (!updated) {
            sendResponse(trackingFailureMessage('transition', missionId, 'INVALID_TRANSITION'));
            return;
          }

          // APP-01: a terminal status (accepted/rejected/archived) ends the
          // follow-up cycle. Clear any stale nextActionAt so a past date can
          // never resurrect as an overdue relance later.
          const persisted = isTerminalStatus(status) ? { ...updated, nextActionAt: null } : updated;

          await saveTracking(persisted);
          sendResponse({ type: 'TRACKING_UPDATED', payload: persisted });
        } catch (err) {
          console.error('[MissionPulse] UPDATE_TRACKING error:', err);
          sendResponse(trackingFailureMessage('transition', missionId, 'PERSIST_FAILED'));
        }
      })();
      return true;
    }

    if (message.type === 'UPDATE_TRACKING_DETAILS') {
      const { missionId, nextActionAt } = message.payload;
      const now = Date.now();

      (async () => {
        try {
          const normalizedNextActionAt = nextActionAt ?? null;
          if (
            normalizedNextActionAt !== null &&
            !Number.isFinite(Date.parse(normalizedNextActionAt))
          ) {
            sendResponse(trackingFailureMessage('details', missionId, 'INVALID_DETAILS'));
            return;
          }

          let tracking = await getTracking(missionId);
          if (!tracking) {
            tracking = createTracking(missionId, now);
          }

          if (normalizedNextActionAt !== null && isTerminalStatus(tracking.currentStatus)) {
            sendResponse(trackingFailureMessage('details', missionId, 'INVALID_DETAILS'));
            return;
          }

          const updated: MissionTracking = { ...tracking, nextActionAt: normalizedNextActionAt };
          await saveTracking(updated);
          sendResponse({ type: 'TRACKING_UPDATED', payload: updated });
        } catch (err) {
          console.error('[MissionPulse] UPDATE_TRACKING_DETAILS error:', err);
          sendResponse(trackingFailureMessage('details', missionId, 'PERSIST_FAILED'));
        }
      })();
      return true;
    }

    if (message.type === 'RESTORE_TRACKING') {
      const { missionId, tracking } = message.payload;

      (async () => {
        try {
          if (tracking !== null) {
            if (!isMissionTrackingPayload(tracking) || tracking.missionId !== missionId) {
              sendResponse(trackingFailureMessage('restore', missionId, 'INVALID_RESTORE'));
              return;
            }
            await saveTracking(tracking);
            sendResponse({
              type: 'TRACKING_RESTORED',
              payload: { missionId, tracking },
            });
            return;
          }

          await deleteTracking(missionId);
          sendResponse({
            type: 'TRACKING_RESTORED',
            payload: { missionId, tracking: null },
          });
        } catch (err) {
          console.error('[MissionPulse] RESTORE_TRACKING error:', err);
          sendResponse(trackingFailureMessage('restore', missionId, 'PERSIST_FAILED'));
        }
      })();
      return true;
    }

    if (message.type === 'GET_TRACKINGS') {
      const { status } = message.payload ?? {};
      const query = status ? getTrackingsByStatus(status) : getAllTrackings();

      query
        .then((trackings) => {
          sendResponse({ type: 'TRACKINGS_RESULT', payload: trackings });
        })
        .catch((err) => {
          console.error('[MissionPulse] GET_TRACKINGS error:', err);
          sendResponse(trackingFailureMessage('load', null, 'LOAD_FAILED'));
        });
      return true;
    }

    // ── Generation handlers ──

    if (message.type === 'GENERATE_ASSET') {
      const { missionId, generationType } = message.payload;

      // Kit generation is a premium-gated feature. The on-device Gemini Nano
      // generator (shell/ai/mission-generator) is loaded lazily so the service
      // worker does not pay the AI module cost until a generation is requested.
      //
      // The premium feature flag deactivates the entire premium system: when
      // dormant (flag off), the gate is skipped and generation is always
      // allowed. See models/premium-feature-flag.model.md.
      (async () => {
        try {
          const { premium_enabled, premium_feature_enabled } = await chrome.storage.local.get([
            'premium_enabled',
            'premium_feature_enabled',
          ]);
          const featureActive = resolvePremiumFeatureFlag(premium_feature_enabled);
          if (shouldPremiumGate(featureActive, premium_enabled === true)) {
            sendResponse({
              type: 'GENERATION_RESULT',
              payload: { asset: null, error: 'PREMIUM_REQUIRED' },
            });
            return;
          }

          const { generateAsset } = await import('../lib/shell/ai/mission-generator');
          const { saveGeneratedAsset } = await import('../lib/shell/storage/generated-assets');

          // Reuse the worker's existing mission/profile read paths (same
          // accessors as GET_FEED_MISSIONS / GET_PROFILE). Only a getAll
          // mission accessor is available, so filter by id.
          const [missions, profile] = await Promise.all([getMissions(), getProfile()]);
          const mission = missions.find((m) => m.id === missionId) ?? null;

          if (!mission || !profile) {
            sendResponse({
              type: 'GENERATION_RESULT',
              payload: { asset: null, error: 'GENERATION_FAILED' },
            });
            return;
          }

          const asset = await generateAsset(missionId, generationType, mission, profile);
          if (!asset) {
            sendResponse({
              type: 'GENERATION_RESULT',
              payload: { asset: null, error: 'GENERATION_FAILED' },
            });
            return;
          }

          await saveGeneratedAsset(asset);
          sendResponse({ type: 'GENERATION_RESULT', payload: { asset } });
        } catch (err) {
          console.warn('[MissionPulse] GENERATE_ASSET error:', err);
          sendResponse({
            type: 'GENERATION_RESULT',
            payload: { asset: null, error: 'GENERATION_FAILED' },
          });
        }
      })();
      return true;
    }

    if (message.type === 'GET_GENERATED_ASSETS') {
      const { missionId } = message.payload;

      getGeneratedAssetsForMission(missionId)
        .then((assets) => {
          sendResponse({ type: 'GENERATED_ASSETS_RESULT', payload: assets });
        })
        .catch((err) => {
          console.error('[MissionPulse] GET_GENERATED_ASSETS error:', err);
          sendResponse({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
        });
      return true;
    }

    // ── Toast handler (forward to side panel) ──

    if (message.type === 'SHOW_TOAST') {
      chrome.runtime.sendMessage(message).catch(() => {
        // Side panel not open, ignore
      });
      sendResponse({ type: 'TOAST_SHOWN' });
      return false;
    }

    // ── Profile broadcast ──

    if (message.type === 'PROFILE_UPDATED') {
      chrome.runtime.sendMessage(message).catch(() => {
        // No listeners, ignore
      });
      return false;
    }

    if (message.type === 'RESET_LOCAL_DATA') {
      resetLocalData()
        .then(() => {
          sendResponse({ type: 'LOCAL_DATA_RESET', payload: { reset: true } });
        })
        .catch((err) => {
          sendResponse({
            type: 'LOCAL_DATA_RESET',
            payload: {
              reset: false,
              reason: err instanceof Error ? err.message : 'Erreur inconnue',
            },
          });
        });
      return true;
    }

    if (message.type === 'GET_PREMIUM_STATUS') {
      chrome.storage.local
        .get('premium_enabled')
        .then((result) => {
          sendResponse({
            type: 'PREMIUM_STATUS_RESULT',
            payload: result.premium_enabled === true,
          });
        })
        .catch((err) => {
          console.warn('[MissionPulse] GET_PREMIUM_STATUS error:', err);
          sendResponse({ type: 'PREMIUM_STATUS_RESULT', payload: false });
        });
      return true;
    }

    if (message.type === 'SET_PREMIUM') {
      chrome.storage.local
        .set({ premium_enabled: message.payload })
        .then(() => {
          sendResponse({ type: 'PREMIUM_SET', payload: { saved: true } });
        })
        .catch((err) => {
          console.warn('[MissionPulse] SET_PREMIUM error:', err);
          sendResponse({ type: 'PREMIUM_SET', payload: { saved: false } });
        });
      return true;
    }
  } catch (err: unknown) {
    // Error boundary — protège le service worker contre les crashes inattendus
    const category = classifyError(err);
    const errMessage = err instanceof Error ? err.message : String(err);

    if (import.meta.env.DEV) {
      console.error('[Bridge] Unhandled error in message handler:', {
        category,
        message: errMessage,
        messageType: (rawMessage as Record<string, unknown>)?.type,
      });
    }

    try {
      sendResponse({ success: false, error: { code: category, message: errMessage } });
    } catch {
      // sendResponse peut échouer si le canal est déjà fermé
    }
    return false;
  }
});

const ALARM_NAME = 'auto-scan';

async function setupAlarm() {
  const connectorIds = getConnectorIds();
  const now = Date.now();
  const [settings, onboardingCompleted, healthRead] = await Promise.all([
    getSettings(),
    getOnboardingCompleted(),
    readHealthSnapshotsForProbeReconciliation(connectorIds, now),
  ]);
  await chrome.alarms.clear(ALARM_NAME);
  if (automaticScanConsentAuthorized({ onboardingCompleted, autoScan: settings.autoScan })) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.scanIntervalMinutes,
    });
    if (import.meta.env.DEV) {
      console.debug(`[MissionPulse] Auto-scan alarm set: every ${settings.scanIntervalMinutes}min`);
    }
  }
  // Daily digest fires independently of auto-scan — it pushes the top unseen
  // missions once per day even if the user never opens the panel.
  await scheduleDailyDigestAlarm();
  if (healthRead.status === 'available') {
    await reconcileProbeAlarmsLocally(connectorIds, healthRead.snapshots, undefined, now);
  } else {
    console.warn(`[MissionPulse] Probe reconciliation skipped: health proof ${healthRead.reason}.`);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DIGEST_ALARM_NAME) {
    if (import.meta.env.DEV) {
      console.debug('[MissionPulse] Daily digest triggered');
    }
    try {
      await sendDailyDigest();
    } catch (error) {
      console.error('[MissionPulse] Daily digest error:', error);
    } finally {
      // Reschedule even when delivery or storage rejects. The alarm is
      // one-shot, so a missing finally would silently stop future digests.
      await scheduleDailyDigestAlarm();
    }
    return;
  }

  if (isProbeAlarm(alarm.name)) {
    const connectorId = connectorIdFromAlarm(alarm.name);
    if (
      connectorId === null ||
      !getConnectorIds().some((includedId) => includedId === connectorId)
    ) {
      return;
    }
    try {
      await executeScanOperation(crypto.randomUUID(), 'alarm', {
        pageDelayMs: 500,
        connectorIdsOverride: [connectorId],
        emitProgress: true,
      });
    } catch (err) {
      console.error(`[MissionPulse] Probe ${connectorId} error:`, err);
    } finally {
      // Final Chrome-local convergence. The durable actor/ledger and crash
      // handoff remain explicitly tracked by background-scheduling.model.md.
      try {
        const healthRead = await readHealthSnapshotsForProbeReconciliation(
          [connectorId],
          Date.now()
        );
        const snapshot =
          healthRead.status === 'available' ? healthRead.snapshots.get(connectorId) : undefined;
        if (snapshot?.connectorId === connectorId) {
          await syncProbeAlarm(snapshot);
        } else {
          const reason = healthRead.status === 'unavailable' ? healthRead.reason : 'identity';
          console.warn(
            `[MissionPulse] Probe ${connectorId} reconciliation skipped: health proof ${reason}.`
          );
        }
      } catch (error) {
        console.error(`[MissionPulse] Probe ${connectorId} reconciliation error:`, error);
      }
    }
    return;
  }

  if (alarm.name !== ALARM_NAME) {
    return;
  }
  const [settings, onboardingCompleted] = await Promise.all([
    getSettings(),
    getOnboardingCompleted(),
  ]);
  if (!automaticScanConsentAuthorized({ onboardingCompleted, autoScan: settings.autoScan })) {
    return;
  }
  if (import.meta.env.DEV) {
    console.debug('[MissionPulse] Auto-scan triggered');
  }
  try {
    const operationId = crypto.randomUUID();
    await executeScanOperation(operationId, 'alarm', {
      pageDelayMs: 500,
      connectorIdsOverride: settings.enabledConnectors,
      emitProgress: true,
    });
  } catch (err) {
    console.error('[MissionPulse] Auto-scan error:', err);
  }
});

// Re-setup alarm when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.onboarding_completed)) {
    void setupAlarm().catch((error) => {
      console.error('[MissionPulse] Alarm reconciliation failed:', error);
    });
  }
});

// Initial setup
void setupAlarm().catch((error) => {
  console.error('[MissionPulse] Initial alarm reconciliation failed:', error);
});

// ── Cold-start migration guard ───────────────────────────────────────────────
// MV3 service workers restart on every event. `onInstalled` only fires on
// install/update, so we also run the orchestrator here to catch the rare
// case where the DB was bumped by a prior SW lifetime that crashed before
// completing, or where the browser restarted without firing onInstalled.
// No-op when the DB is already at the right version. Fire-and-forget:
// openDB() also self-heals on-demand, so we never block startup.
void runMigrations()
  .then((result) => {
    if (!result.ok) {
      console.warn('[MissionPulse] Cold-start migration guard failed:', result.message);
    }
  })
  .catch((err) => {
    console.warn('[MissionPulse] Cold-start migration guard error:', err);
  });

chrome.runtime.onInstalled.addListener(async (details) => {
  // On every install/update: run the DB migration orchestrator FIRST, so
  // the schema is reconciled before any read/write happens. Safe to call
  // on fresh install (no-op) and idempotent on update. See
  // `src/models/db-migration.model.md`.
  try {
    const result = await runMigrations();
    if (!result.ok) {
      console.warn('[MissionPulse] Migration orchestrator failed on install:', result.message);
    } else if (import.meta.env.DEV) {
      console.debug('[MissionPulse] Migration orchestrator result:', result);
    }
    const status = getMigrationStatus();
    if (status.state === 'downgrade') {
      chrome.runtime.sendMessage({ type: 'MIGRATION_DOWNGRADE_DETECTED' }).catch(() => {
        // panel not open — downgrade flag is persisted
      });
    } else if (status.state === 'quarantine') {
      chrome.runtime.sendMessage({ type: 'MIGRATION_QUARANTINED' }).catch(() => {
        // panel not open — quarantine is persisted
      });
    }
  } catch (err) {
    console.error('[MissionPulse] Migration orchestrator failed on install:', err);
    // Non-fatal: openDB() will retry on next access.
  }

  if (details.reason !== 'install') {
    return;
  }

  if (import.meta.env.DEV) {
    console.debug('[MissionPulse] Fresh install — awaiting explicit onboarding consent');
  }
});

chrome.action.onUserSettingsChanged?.addListener(async (change) => {
  if (!change.isOnToolbar) {
    return;
  }

  if (import.meta.env.DEV) {
    console.debug('[MissionPulse] Extension pinned to toolbar');
  }
  const settings = await getSettings();
  if (!settings.autoScan && settings.notifications) {
    try {
      await chrome.notifications.create('suggest-auto-scan', {
        type: 'basic',
        iconUrl: 'static/icons/icon-128.svg',
        title: 'MissionPulse',
        message: 'Activez le scan automatique dans les parametres pour ne rater aucune mission.',
      });
    } catch {
      // Notifications permission not available
    }
  }
});

export {};
