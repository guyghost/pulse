import type { AppSettings } from '../lib/core/types/app-settings';
import type { ConnectorId, ConnectorMeta } from '../lib/shell/connectors/meta';
import {
  cloneSettings,
  commandId as settingsCommandId,
  isUuidV4,
  normalizeCorrelationIds,
  originDigest,
  parseSettingsActivationRegistryResultV1,
  parseSettingsCommandDigest,
  parseSettledSettingsSnapshot,
  readStrictJsonRecord,
  sameSettings,
  settingsCommandDigest,
  settingsDigest,
  type SettingsPersistenceRawEvent,
  type SettingsActivationRegistryResultV1,
  type SettingsSnapshotV1,
} from './settings-persistence.contract';

export const ONBOARDING_SOURCE_MODEL_VERSION = 1 as const;
export const ONBOARDING_SOURCE_ERROR_MAX_CHARS = 500;
export const ONBOARDING_SOURCE_MAX_CONSUMED_CORRELATIONS = 307;
const ONBOARDING_SOURCE_MAX_CAPTURE_ARRAY_LENGTH = 4096;
const ONBOARDING_SOURCE_MAX_CAPTURE_OBJECT_KEYS = 64;
const ONBOARDING_SOURCE_MAX_CAPTURE_NODES = 262_144;

export type OnboardingSourceState =
  | 'selecting'
  | 'persisting'
  | 'checking'
  | 'ready'
  | 'skipping'
  | 'consenting'
  | 'cancelling'
  | 'recovering'
  | 'permission_denied'
  | 'session_missing'
  | 'failed'
  | 'completed'
  | 'cancelled'
  | 'skipped';

export type ConnectorCheckStatus =
  'checking' | 'ready' | 'permission_denied' | 'session_missing' | 'failed';

export type OnboardingPermission = 'unknown' | 'not_required' | 'granted' | 'denied';
export type OnboardingSession = 'unknown' | 'present' | 'missing';
export type OnboardingSettingsPurpose = 'selection' | 'skip_auto_scan';
export type OnboardingFailurePhase =
  | 'persistence'
  | 'permission'
  | 'session'
  | 'offline'
  | 'consent'
  | 'skip'
  | 'recovery'
  | 'correlation';
export type OnboardingRecoveryReason =
  | 'selecting'
  | 'selection'
  | 'checking'
  | 'consent'
  | 'skip_settings'
  | 'skip_completion'
  | 'cancel_settings'
  | 'cancel_consent';

export interface OnboardingSourceError {
  version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
  code:
    | 'SETTINGS_PERSISTENCE_FAILED'
    | 'PERMISSION_CHECK_FAILED'
    | 'SESSION_CHECK_FAILED'
    | 'NETWORK_OFFLINE'
    | 'CONSENT_PERSISTENCE_FAILED'
    | 'SKIP_FAILED'
    | 'RECOVERY_FAILED'
    | 'CORRELATION_CAPACITY_EXHAUSTED';
  phase: OnboardingFailurePhase;
  message: string;
  retryable: boolean;
}

export interface OnboardingSourceOperationIds {
  operationId: string;
  mutationId: string;
  permissionRequestId: string;
  activationId: string;
  storageReservationId: string;
  activationResult: SettingsActivationRegistryResultV1;
}

export interface OnboardingSettingsTransactionExpectationV1 {
  version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
  dataEpoch: string;
  purpose: OnboardingSettingsPurpose;
  operationId: string;
  mutationId: string;
  baseRevision: number;
  baseGeneration: number;
  previousDigest: string;
  candidateDigest: string;
  originDigest: string;
  baseCorrelationIds: string[];
  commandDigest: string;
  snapshotRequestId: string;
  snapshotCommandId: string;
  candidateSettings: AppSettings;
}

export type OnboardingSourceActiveOperation =
  | {
      purpose: 'selection';
      ids: OnboardingSourceOperationIds;
      expectation: OnboardingSettingsTransactionExpectationV1;
    }
  | {
      purpose: 'skip_auto_scan';
      ids: OnboardingSourceOperationIds;
      expectation: OnboardingSettingsTransactionExpectationV1;
    }
  | {
      purpose: 'check';
      operationId: string;
    }
  | {
      purpose: 'consent';
      operationId: string;
    }
  | {
      purpose: 'skip_completion';
      operationId: string;
    }
  | {
      purpose: 'cancel_settings';
      operationId: string;
      mutationId: string;
      requestId: string;
    }
  | {
      purpose: 'cancel_consent';
      operationId: string;
      requestId: string;
    };

export interface OnboardingSourceRecovery {
  reason: OnboardingRecoveryReason;
  requestId: string;
  commandId: string;
  snapshotRequestId: string;
  snapshotCommandId: string;
  invalidatedOperationId: string | null;
}

export interface OnboardingCompletionReadProofV1 {
  version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  onboardingCompleted: boolean;
}

export interface OnboardingCompletionProofV1 {
  version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
  dataEpoch: string;
  attemptId: string;
  operationId: string;
  onboardingCompleted: true;
}

type SettingsMutateEvent = Extract<SettingsPersistenceRawEvent, { type: 'MUTATE' }>;
type SettingsCancelEvent = Extract<SettingsPersistenceRawEvent, { type: 'CANCEL' }>;

export type OnboardingSourceCommand =
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'DISPATCH_SETTINGS_SELECTION';
      commandId: string;
      event: SettingsMutateEvent;
      expectation: OnboardingSettingsTransactionExpectationV1;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'DISPATCH_SETTINGS_SKIP_AUTO_SCAN';
      commandId: string;
      event: SettingsMutateEvent;
      expectation: OnboardingSettingsTransactionExpectationV1;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'CHECK_CONNECTOR_PERMISSION';
      commandId: string;
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
      origins: string[];
      userGesture: true;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'CHECK_CONNECTOR_SESSION';
      commandId: string;
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'PERSIST_ONBOARDING_COMPLETED';
      commandId: string;
      dataEpoch: string;
      attemptId: string;
      operationId: string;
      completionKind: 'confirmed_source' | 'skipped';
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'DISPATCH_SETTINGS_CANCEL';
      commandId: string;
      event: SettingsCancelEvent;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'CANCEL_ONBOARDING_COMPLETION_WRITE';
      commandId: string;
      dataEpoch: string;
      attemptId: string;
      operationId: string;
      requestId: string;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'READ_CANONICAL_ONBOARDING_SOURCE';
      commandId: string;
      requestId: string;
      dataEpoch: string;
      snapshotRequestId: string;
      snapshotCommandId: string;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'CLEAR_ONBOARDING_COMPLETED';
      commandId: string;
      dataEpoch: string;
      attemptId: string;
      requestId: string;
    }
  | {
      version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
      type: 'ADVANCE_ONBOARDING';
      commandId: string;
      dataEpoch: string;
      attemptId: string;
      connectorId: ConnectorId | null;
      completionKind: 'confirmed_source' | 'skipped';
    };

export interface OnboardingSourceInput {
  attemptId: string;
  dataEpoch: string;
  workerEpoch: string;
  connectorCatalog: readonly ConnectorMeta[];
  settingsSnapshot: unknown;
  onboardingCompleted: boolean;
  onboardingCompletionDataEpoch: string;
}

export interface ParsedOnboardingSourceInput {
  attemptId: string;
  dataEpoch: string;
  workerEpoch: string;
  connectorCatalog: ConnectorMeta[];
  settingsSnapshot: SettingsSnapshotV1;
  onboardingCompleted: boolean;
  onboardingCompletionDataEpoch: string;
}

export interface OnboardingSourceContext {
  attemptId: string;
  dataEpoch: string;
  workerEpoch: string;
  connectorCatalog: ConnectorMeta[];
  includedConnectorIds: ConnectorId[];
  initialSettings: AppSettings;
  canonicalSettings: AppSettings;
  settingsRevision: number;
  settingsGeneration: number;
  consumedCorrelationIds: string[];
  onboardingCompleted: boolean;
  selectedConnectorId: ConnectorId | null;
  permission: OnboardingPermission;
  session: OnboardingSession;
  lastSync: string | null;
  activeOperation: OnboardingSourceActiveOperation | null;
  recovery: OnboardingSourceRecovery | null;
  failure: OnboardingSourceError | null;
  command: OnboardingSourceCommand | null;
  advanceIssued: boolean;
}

export type OnboardingSourceEvent =
  | { type: 'SELECT_SOURCE'; connectorId: ConnectorId }
  | { type: 'CONTINUE'; ids: OnboardingSourceOperationIds }
  | {
      type: 'SETTINGS_TRANSACTION_SETTLED';
      dataEpoch: string;
      purpose: OnboardingSettingsPurpose;
      operationId: string;
      mutationId: string;
      commandDigest: string;
      snapshot: SettingsSnapshotV1;
    }
  | {
      type: 'SETTINGS_TRANSACTION_FAILED';
      dataEpoch: string;
      purpose: OnboardingSettingsPurpose;
      operationId: string;
      mutationId: string;
      commandDigest: string;
      error: OnboardingSourceError;
    }
  | {
      type: 'PERMISSION_GRANTED';
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
      required: boolean;
    }
  | {
      type: 'PERMISSION_REFUSED';
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
    }
  | {
      type: 'SESSION_FOUND';
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
      lastSync: string | null;
    }
  | {
      type: 'SESSION_MISSING';
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
    }
  | {
      type: 'CHECK_FAILED';
      dataEpoch: string;
      operationId: string;
      connectorId: ConnectorId;
      error: OnboardingSourceError;
    }
  | { type: 'NETWORK_OFFLINE'; dataEpoch: string; operationId: string }
  | { type: 'CONFIRM_SOURCE'; ids: OnboardingSourceOperationIds }
  | {
      type: 'ONBOARDING_COMPLETION_PERSISTED';
      dataEpoch: string;
      operationId: string;
      proof: OnboardingCompletionProofV1;
    }
  | {
      type: 'ONBOARDING_COMPLETION_FAILED';
      dataEpoch: string;
      operationId: string;
      error: OnboardingSourceError;
    }
  | { type: 'RETRY'; ids: OnboardingSourceOperationIds }
  | { type: 'CANCEL'; dataEpoch: string; requestId: string }
  | {
      type: 'SETTINGS_CANCEL_CONFIRMED';
      dataEpoch: string;
      operationId: string;
      mutationId: string;
      requestId: string;
      snapshot: SettingsSnapshotV1;
    }
  | {
      type: 'SETTINGS_CANCEL_OUTCOME_UNKNOWN';
      dataEpoch: string;
      operationId: string;
      mutationId: string;
      requestId: string;
      nextRequestId: string;
    }
  | {
      type: 'CONSENT_CANCEL_CONFIRMED';
      dataEpoch: string;
      operationId: string;
      requestId: string;
    }
  | {
      type: 'CONSENT_CANCEL_OUTCOME_UNKNOWN';
      dataEpoch: string;
      operationId: string;
      requestId: string;
      nextRequestId: string;
    }
  | { type: 'SERVICE_WORKER_RESTARTED'; dataEpoch: string; requestId: string }
  | {
      type: 'CANONICAL_STATE_REHYDRATED';
      dataEpoch: string;
      requestId: string;
      nextOperationId: string;
      snapshot: SettingsSnapshotV1;
      completionReadProof: OnboardingCompletionReadProofV1;
    }
  | { type: 'ONBOARDING_COMPLETION_CLEARED'; dataEpoch: string; requestId: string }
  | {
      type: 'DATA_EPOCH_INVALIDATED';
      resetId: string;
      previousDataEpoch: string;
      nextDataEpoch: string;
    }
  | { type: 'SKIP'; ids: OnboardingSourceOperationIds };

export interface ConnectorSourceProjection {
  id: ConnectorId;
  enabled: boolean;
  status: ConnectorCheckStatus;
  permission: OnboardingPermission;
  session: OnboardingSession;
  lastSync: string | null;
  error: OnboardingSourceError | null;
}

export interface OnboardingSourcePublicSnapshot {
  version: typeof ONBOARDING_SOURCE_MODEL_VERSION;
  state: OnboardingSourceState;
  attemptId: string;
  connectorCatalog: readonly Readonly<ConnectorMeta>[];
  selectedConnectorId: ConnectorId | null;
  persistedEnabledConnectorIds: readonly ConnectorId[];
  onboardingCompleted: boolean;
  autoScanEnabled: boolean;
  automaticScanAuthorized: boolean;
  permission: OnboardingPermission;
  session: OnboardingSession;
  lastSync: string | null;
  failure: Readonly<OnboardingSourceError> | null;
  command: Readonly<OnboardingSourceCommand> | null;
  canContinue: boolean;
  canRetry: boolean;
  canCancel: boolean;
  advanceIssued: boolean;
  settingsRevision: number;
  settingsGeneration: number;
  correlationCapacityRemaining: number;
}

const CONNECTOR_IDS = new Set<ConnectorId>([
  'free-work',
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
  'malt',
]);

export function isOnboardingSourceUuidV4(value: unknown): value is string {
  return isUuidV4(value);
}

function connectorId(value: unknown): ConnectorId | null {
  return typeof value === 'string' && CONNECTOR_IDS.has(value as ConnectorId)
    ? (value as ConnectorId)
    : null;
}

function cloneConnectorMeta(meta: ConnectorMeta): ConnectorMeta {
  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    url: meta.url,
    hostPermissions: [...meta.hostPermissions],
  };
}

function parseConnectorCatalog(value: unknown): ConnectorMeta[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const result: ConnectorMeta[] = [];
  const ids = new Set<ConnectorId>();
  for (const item of value) {
    const record = readExactRecord(item, ['id', 'name', 'icon', 'url', 'hostPermissions']);
    if (record === null) {
      return null;
    }
    const id = connectorId(record.id);
    if (
      id === null ||
      ids.has(id) ||
      typeof record.name !== 'string' ||
      record.name.length === 0 ||
      record.name.length > 120 ||
      typeof record.icon !== 'string' ||
      record.icon.length === 0 ||
      record.icon.length > 2048 ||
      typeof record.url !== 'string' ||
      record.url.length === 0 ||
      record.url.length > 2048 ||
      !Array.isArray(record.hostPermissions) ||
      record.hostPermissions.length === 0 ||
      !record.hostPermissions.every(
        (origin): origin is string =>
          typeof origin === 'string' && origin.length > 0 && origin.length <= 2048
      ) ||
      new Set(record.hostPermissions).size !== record.hostPermissions.length
    ) {
      return null;
    }
    ids.add(id);
    result.push(
      cloneConnectorMeta({
        id,
        name: record.name,
        icon: record.icon,
        url: record.url,
        hostPermissions: record.hostPermissions,
      })
    );
  }
  return result;
}

export function parseOnboardingSourceInput(value: unknown): ParsedOnboardingSourceInput | null {
  const captured = captureBoundary(value);
  const record =
    captured === INVALID_CAPTURE
      ? null
      : readExactRecord(captured, [
          'attemptId',
          'dataEpoch',
          'workerEpoch',
          'connectorCatalog',
          'settingsSnapshot',
          'onboardingCompleted',
          'onboardingCompletionDataEpoch',
        ]);
  if (
    record === null ||
    !isOnboardingSourceUuidV4(record.attemptId) ||
    !isOnboardingSourceUuidV4(record.dataEpoch) ||
    !isOnboardingSourceUuidV4(record.workerEpoch) ||
    new Set([record.attemptId, record.dataEpoch, record.workerEpoch]).size !== 3 ||
    typeof record.onboardingCompleted !== 'boolean' ||
    record.onboardingCompletionDataEpoch !== record.dataEpoch
  ) {
    return null;
  }
  const catalog = parseConnectorCatalog(record.connectorCatalog);
  if (catalog === null) {
    return null;
  }
  const includedIds = catalog.map((item) => item.id);
  const snapshot = parseSettledSettingsSnapshot(
    record.settingsSnapshot,
    record.dataEpoch,
    includedIds
  );
  if (snapshot === null) {
    return null;
  }
  return {
    attemptId: record.attemptId,
    dataEpoch: record.dataEpoch,
    workerEpoch: record.workerEpoch,
    connectorCatalog: catalog,
    settingsSnapshot: snapshot,
    onboardingCompleted: record.onboardingCompleted,
    onboardingCompletionDataEpoch: record.onboardingCompletionDataEpoch,
  };
}

export function initialOnboardingSourceContext(
  input: ParsedOnboardingSourceInput
): OnboardingSourceContext {
  const settings = cloneSettings(input.settingsSnapshot.envelope.settings);
  return {
    attemptId: input.attemptId,
    dataEpoch: input.dataEpoch,
    workerEpoch: input.workerEpoch,
    connectorCatalog: input.connectorCatalog.map(cloneConnectorMeta),
    includedConnectorIds: input.connectorCatalog.map((item) => item.id),
    initialSettings: cloneSettings(settings),
    canonicalSettings: cloneSettings(settings),
    settingsRevision: input.settingsSnapshot.envelope.revision,
    settingsGeneration: input.settingsSnapshot.envelope.generation,
    consumedCorrelationIds: [],
    onboardingCompleted: input.onboardingCompleted,
    selectedConnectorId: null,
    permission: 'unknown',
    session: 'unknown',
    lastSync: null,
    activeOperation: null,
    recovery: null,
    failure: null,
    command: null,
    advanceIssued: false,
  };
}

function activeCorrelationIds(context: OnboardingSourceContext): string[] {
  const operation = context.activeOperation;
  if (operation === null) {
    return [];
  }
  if (operation.purpose === 'selection' || operation.purpose === 'skip_auto_scan') {
    return onboardingOperationCorrelationIds(operation.ids);
  }
  if (operation.purpose === 'cancel_settings') {
    return [operation.operationId, operation.mutationId, operation.requestId];
  }
  if (operation.purpose === 'cancel_consent') {
    return [operation.operationId, operation.requestId];
  }
  return [operation.operationId];
}

export function onboardingOperationCorrelationIds(ids: OnboardingSourceOperationIds): string[] {
  return [
    ids.operationId,
    ids.mutationId,
    ids.permissionRequestId,
    ids.activationId,
    ids.activationResult.resultId,
    ids.storageReservationId,
  ];
}

export function correlationIdsAreFresh(
  context: OnboardingSourceContext,
  values: readonly unknown[]
): values is readonly string[] {
  if (
    values.length === 0 ||
    !values.every(isOnboardingSourceUuidV4) ||
    new Set(values).size !== values.length
  ) {
    return false;
  }
  const forbidden = new Set([
    context.attemptId,
    context.dataEpoch,
    ...context.consumedCorrelationIds,
    ...activeCorrelationIds(context),
    ...(context.recovery === null
      ? []
      : [context.recovery.requestId, context.recovery.invalidatedOperationId].filter(
          (value): value is string => value !== null
        )),
  ]);
  return values.every((value) => !forbidden.has(value));
}

export function correlationIdsHaveCapacity(
  context: OnboardingSourceContext,
  values: readonly unknown[],
  reservedFollowUpIds = 0
): boolean {
  return (
    values.length > 0 &&
    Number.isSafeInteger(reservedFollowUpIds) &&
    reservedFollowUpIds >= 0 &&
    context.consumedCorrelationIds.length + new Set(values).size + reservedFollowUpIds <=
      ONBOARDING_SOURCE_MAX_CONSUMED_CORRELATIONS
  );
}

export function rememberCorrelationIds(
  context: OnboardingSourceContext,
  values: readonly string[]
): string[] {
  if (!correlationIdsAreFresh(context, values) || !correlationIdsHaveCapacity(context, values)) {
    throw new RangeError('Onboarding correlation IDs are stale or capacity is exhausted');
  }
  return [...context.consumedCorrelationIds, ...values];
}

export function operationIdsAreFresh(
  context: OnboardingSourceContext,
  value: unknown,
  reservedFollowUpIds = 0
): value is OnboardingSourceOperationIds {
  const parsed = parseOperationIds(value, context);
  if (parsed === null) {
    return false;
  }
  const values = onboardingOperationCorrelationIds(parsed);
  return (
    correlationIdsAreFresh(context, values) &&
    correlationIdsHaveCapacity(context, values, reservedFollowUpIds)
  );
}

export function cancellationCorrelationReserve(context: OnboardingSourceContext): number {
  const purpose = context.activeOperation?.purpose;
  return purpose === 'selection' ||
    purpose === 'skip_auto_scan' ||
    purpose === 'consent' ||
    purpose === 'skip_completion'
    ? 2
    : 0;
}

export function selectedConnectorIsIncluded(context: OnboardingSourceContext): boolean {
  return (
    context.selectedConnectorId !== null &&
    context.includedConnectorIds.includes(context.selectedConnectorId)
  );
}

export function selectedConnectorIsPersisted(context: OnboardingSourceContext): boolean {
  return (
    selectedConnectorIsIncluded(context) &&
    context.canonicalSettings.enabledConnectors.includes(context.selectedConnectorId as ConnectorId)
  );
}

export function selectedConnectorOrigins(context: OnboardingSourceContext): string[] {
  const selected = context.connectorCatalog.find((item) => item.id === context.selectedConnectorId);
  return selected === undefined ? [] : [...selected.hostPermissions];
}

export function candidateEnabledConnectorIds(context: OnboardingSourceContext): ConnectorId[] {
  if (context.selectedConnectorId === null) {
    return [...context.canonicalSettings.enabledConnectors] as ConnectorId[];
  }
  return [...new Set([...context.canonicalSettings.enabledConnectors, context.selectedConnectorId])]
    .filter((id): id is ConnectorId => context.includedConnectorIds.includes(id as ConnectorId))
    .sort();
}

export function settingsMutationEvent(
  context: OnboardingSourceContext,
  purpose: OnboardingSettingsPurpose,
  ids: OnboardingSourceOperationIds
): SettingsMutateEvent {
  return {
    type: 'MUTATE',
    dataEpoch: context.dataEpoch,
    mutationId: ids.mutationId,
    permissionCheckId: ids.permissionRequestId,
    activationId: ids.activationId,
    storageReservationId: ids.storageReservationId,
    activationResult: ids.activationResult,
    key: purpose === 'selection' ? 'enabledConnectors' : 'autoScan',
    candidate: purpose === 'selection' ? candidateEnabledConnectorIds(context) : false,
  };
}

function expectedSettingsCandidate(
  context: OnboardingSourceContext,
  purpose: OnboardingSettingsPurpose
): AppSettings {
  return purpose === 'selection'
    ? {
        ...cloneSettings(context.canonicalSettings),
        enabledConnectors: candidateEnabledConnectorIds(context),
      }
    : { ...cloneSettings(context.canonicalSettings), autoScan: false };
}

export function settingsTransactionExpectation(
  context: OnboardingSourceContext,
  purpose: OnboardingSettingsPurpose,
  ids: OnboardingSourceOperationIds
): OnboardingSettingsTransactionExpectationV1 {
  const candidateSettings = expectedSettingsCandidate(context, purpose);
  const previousDigest = settingsDigest(context.canonicalSettings);
  const candidateDigest = settingsDigest(candidateSettings);
  const baseCorrelationIds = normalizeCorrelationIds([
    ids.mutationId,
    ids.permissionRequestId,
    ids.activationId,
    ids.storageReservationId,
  ]);
  const expectedOriginDigest = originDigest(
    purpose === 'selection' ? selectedConnectorOrigins(context) : []
  );
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    dataEpoch: context.dataEpoch,
    purpose,
    operationId: ids.operationId,
    mutationId: ids.mutationId,
    baseRevision: context.settingsRevision,
    baseGeneration: context.settingsGeneration,
    previousDigest,
    candidateDigest,
    originDigest: expectedOriginDigest,
    baseCorrelationIds,
    commandDigest: settingsCommandDigest({
      dataEpoch: context.dataEpoch,
      mutationId: ids.mutationId,
      baseRevision: context.settingsRevision,
      baseGeneration: context.settingsGeneration,
      previousDigest,
      candidateDigest,
      originDigest: expectedOriginDigest,
      baseCorrelationIds,
    }),
    snapshotRequestId: ids.mutationId,
    snapshotCommandId: settingsCommandId('write', ids.mutationId),
    candidateSettings,
  };
}

export function cloneSettingsTransactionExpectation(
  expectation: OnboardingSettingsTransactionExpectationV1
): OnboardingSettingsTransactionExpectationV1 {
  return {
    ...expectation,
    baseCorrelationIds: [...expectation.baseCorrelationIds],
    candidateSettings: cloneSettings(expectation.candidateSettings),
  };
}

function activeSettingsOperation(
  context: OnboardingSourceContext,
  purpose: OnboardingSettingsPurpose
): Extract<OnboardingSourceActiveOperation, { purpose: 'selection' | 'skip_auto_scan' }> | null {
  return context.activeOperation?.purpose === purpose ? context.activeOperation : null;
}

export function settingsSettlementMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent,
  purpose: OnboardingSettingsPurpose
): boolean {
  if (event.type !== 'SETTINGS_TRANSACTION_SETTLED' || event.purpose !== purpose) {
    return false;
  }
  const active = activeSettingsOperation(context, purpose);
  if (
    active === null ||
    event.dataEpoch !== context.dataEpoch ||
    event.operationId !== active.ids.operationId ||
    event.mutationId !== active.ids.mutationId ||
    event.commandDigest !== active.expectation.commandDigest ||
    event.snapshot.dataEpoch !== context.dataEpoch ||
    event.snapshot.requestId !== active.expectation.snapshotRequestId ||
    event.snapshot.commandId !== active.expectation.snapshotCommandId ||
    event.snapshot.envelope.revision !== active.expectation.baseRevision + 1 ||
    event.snapshot.envelope.generation !== active.expectation.baseGeneration + 2 ||
    !sameSettings(event.snapshot.envelope.settings, active.expectation.candidateSettings)
  ) {
    return false;
  }
  const outcome = event.snapshot.envelope.outcomes.find(
    (candidate) => candidate.mutationId === event.mutationId
  );
  if (
    outcome === undefined ||
    outcome.outcome !== 'committed' ||
    outcome.dataEpoch !== active.expectation.dataEpoch ||
    outcome.commandDigest !== active.expectation.commandDigest ||
    outcome.previousDigest !== active.expectation.previousDigest ||
    outcome.candidateDigest !== active.expectation.candidateDigest ||
    outcome.baseRevision !== active.expectation.baseRevision ||
    outcome.baseGeneration !== active.expectation.baseGeneration ||
    outcome.settledRevision !== event.snapshot.envelope.revision ||
    outcome.settledGeneration !== event.snapshot.envelope.generation ||
    !active.expectation.baseCorrelationIds.every((id) => outcome.correlationIds.includes(id))
  ) {
    return false;
  }
  const decodedCommand = parseSettingsCommandDigest(outcome.commandDigest);
  return (
    decodedCommand !== null &&
    decodedCommand.dataEpoch === active.expectation.dataEpoch &&
    decodedCommand.mutationId === active.expectation.mutationId &&
    decodedCommand.baseRevision === active.expectation.baseRevision &&
    decodedCommand.baseGeneration === active.expectation.baseGeneration &&
    decodedCommand.previousDigest === active.expectation.previousDigest &&
    decodedCommand.candidateDigest === active.expectation.candidateDigest &&
    decodedCommand.originDigest === active.expectation.originDigest &&
    decodedCommand.baseCorrelationIds.length === active.expectation.baseCorrelationIds.length &&
    decodedCommand.baseCorrelationIds.every(
      (id, index) => id === active.expectation.baseCorrelationIds[index]
    )
  );
}

export function settingsFailureMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent,
  purpose: OnboardingSettingsPurpose
): boolean {
  const active = activeSettingsOperation(context, purpose);
  return (
    event.type === 'SETTINGS_TRANSACTION_FAILED' &&
    event.dataEpoch === context.dataEpoch &&
    event.purpose === purpose &&
    active !== null &&
    event.operationId === active.ids.operationId &&
    event.mutationId === active.ids.mutationId &&
    event.commandDigest === active.expectation.commandDigest &&
    event.error.phase === (purpose === 'selection' ? 'persistence' : 'skip')
  );
}

export function parseOnboardingCompletionProof(
  value: unknown,
  expected: { dataEpoch: string; attemptId: string; operationId: string }
): OnboardingCompletionProofV1 | null {
  const captured = captureBoundary(value);
  const record =
    captured === INVALID_CAPTURE
      ? null
      : readExactRecord(captured, [
          'version',
          'dataEpoch',
          'attemptId',
          'operationId',
          'onboardingCompleted',
        ]);
  return record !== null &&
    record.version === ONBOARDING_SOURCE_MODEL_VERSION &&
    record.dataEpoch === expected.dataEpoch &&
    record.attemptId === expected.attemptId &&
    record.operationId === expected.operationId &&
    record.onboardingCompleted === true
    ? {
        version: ONBOARDING_SOURCE_MODEL_VERSION,
        dataEpoch: expected.dataEpoch,
        attemptId: expected.attemptId,
        operationId: expected.operationId,
        onboardingCompleted: true,
      }
    : null;
}

export function consentPersistenceMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'ONBOARDING_COMPLETION_PERSISTED' &&
    event.dataEpoch === context.dataEpoch &&
    context.activeOperation?.purpose === 'consent' &&
    event.operationId === context.activeOperation.operationId &&
    parseOnboardingCompletionProof(event.proof, {
      dataEpoch: context.dataEpoch,
      attemptId: context.attemptId,
      operationId: context.activeOperation.operationId,
    }) !== null
  );
}

export function consentFailureMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'ONBOARDING_COMPLETION_FAILED' &&
    event.dataEpoch === context.dataEpoch &&
    context.activeOperation?.purpose === 'consent' &&
    event.operationId === context.activeOperation.operationId &&
    event.error.phase === 'consent'
  );
}

export function skipCompletionPersistenceMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'ONBOARDING_COMPLETION_PERSISTED' &&
    event.dataEpoch === context.dataEpoch &&
    context.activeOperation?.purpose === 'skip_completion' &&
    event.operationId === context.activeOperation.operationId &&
    parseOnboardingCompletionProof(event.proof, {
      dataEpoch: context.dataEpoch,
      attemptId: context.attemptId,
      operationId: context.activeOperation.operationId,
    }) !== null
  );
}

export function skipCompletionFailureMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'ONBOARDING_COMPLETION_FAILED' &&
    event.dataEpoch === context.dataEpoch &&
    context.activeOperation?.purpose === 'skip_completion' &&
    event.operationId === context.activeOperation.operationId &&
    event.error.phase === 'skip'
  );
}

export function checkEventMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  if (context.activeOperation?.purpose !== 'check' || context.selectedConnectorId === null) {
    return false;
  }
  return (
    'operationId' in event &&
    'dataEpoch' in event &&
    event.dataEpoch === context.dataEpoch &&
    event.operationId === context.activeOperation.operationId &&
    (!('connectorId' in event) || event.connectorId === context.selectedConnectorId)
  );
}

export function sessionCheckAllowed(context: OnboardingSourceContext): boolean {
  return context.permission === 'granted' || context.permission === 'not_required';
}

export function cancellationMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  if (context.activeOperation?.purpose !== 'cancel_settings') {
    return false;
  }
  const baseMatches =
    (event.type === 'SETTINGS_CANCEL_CONFIRMED' ||
      event.type === 'SETTINGS_CANCEL_OUTCOME_UNKNOWN') &&
    event.dataEpoch === context.dataEpoch &&
    event.operationId === context.activeOperation.operationId &&
    event.mutationId === context.activeOperation.mutationId &&
    event.requestId === context.activeOperation.requestId;
  return (
    baseMatches &&
    (event.type !== 'SETTINGS_CANCEL_OUTCOME_UNKNOWN' ||
      (correlationIdsAreFresh(context, [event.nextRequestId]) &&
        correlationIdsHaveCapacity(context, [event.nextRequestId], 1)))
  );
}

export function rehydrationMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'CANONICAL_STATE_REHYDRATED' &&
    event.dataEpoch === context.dataEpoch &&
    context.recovery !== null &&
    event.requestId === context.recovery.requestId &&
    event.snapshot.dataEpoch === context.dataEpoch &&
    event.snapshot.requestId === context.recovery.snapshotRequestId &&
    event.snapshot.commandId === context.recovery.snapshotCommandId &&
    event.completionReadProof.dataEpoch === context.dataEpoch &&
    event.completionReadProof.requestId === context.recovery.requestId &&
    event.completionReadProof.commandId === context.recovery.commandId &&
    event.snapshot.envelope.generation >= context.settingsGeneration &&
    correlationIdsAreFresh(context, [event.nextOperationId]) &&
    correlationIdsHaveCapacity(context, [event.nextOperationId])
  );
}

export function rehydratedSelectionIsPersisted(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'CANONICAL_STATE_REHYDRATED' &&
    context.selectedConnectorId !== null &&
    event.snapshot.envelope.settings.enabledConnectors.includes(context.selectedConnectorId)
  );
}

export function dataEpochInvalidationMatches(
  context: OnboardingSourceContext,
  event: OnboardingSourceEvent
): boolean {
  return (
    event.type === 'DATA_EPOCH_INVALIDATED' &&
    event.previousDataEpoch === context.dataEpoch &&
    event.nextDataEpoch !== context.dataEpoch &&
    isOnboardingSourceUuidV4(event.resetId) &&
    isOnboardingSourceUuidV4(event.nextDataEpoch) &&
    event.resetId !== event.nextDataEpoch
  );
}

export function canonicalSettingsRecoveryCommandId(requestId: string): string {
  return settingsCommandId('recover', requestId);
}

export function parseOnboardingCompletionReadProof(
  value: unknown,
  expected: { dataEpoch: string; requestId: string; commandId: string }
): OnboardingCompletionReadProofV1 | null {
  const captured = captureBoundary(value);
  const record =
    captured === INVALID_CAPTURE
      ? null
      : readExactRecord(captured, [
          'version',
          'dataEpoch',
          'requestId',
          'commandId',
          'onboardingCompleted',
        ]);
  return record !== null &&
    record.version === ONBOARDING_SOURCE_MODEL_VERSION &&
    record.dataEpoch === expected.dataEpoch &&
    record.requestId === expected.requestId &&
    record.commandId === expected.commandId &&
    typeof record.onboardingCompleted === 'boolean'
    ? {
        version: ONBOARDING_SOURCE_MODEL_VERSION,
        dataEpoch: expected.dataEpoch,
        requestId: expected.requestId,
        commandId: expected.commandId,
        onboardingCompleted: record.onboardingCompleted,
      }
    : null;
}

export function parseOnboardingSourceError(value: unknown): OnboardingSourceError | null {
  const captured = captureBoundary(value);
  const record =
    captured === INVALID_CAPTURE
      ? null
      : readExactRecord(captured, ['version', 'code', 'phase', 'message', 'retryable']);
  if (record === null) {
    return null;
  }
  const matrix = {
    SETTINGS_PERSISTENCE_FAILED: { phase: 'persistence', retryable: true },
    PERMISSION_CHECK_FAILED: { phase: 'permission', retryable: true },
    SESSION_CHECK_FAILED: { phase: 'session', retryable: true },
    NETWORK_OFFLINE: { phase: 'offline', retryable: true },
    CONSENT_PERSISTENCE_FAILED: { phase: 'consent', retryable: true },
    SKIP_FAILED: { phase: 'skip', retryable: true },
    RECOVERY_FAILED: { phase: 'recovery', retryable: true },
    CORRELATION_CAPACITY_EXHAUSTED: { phase: 'correlation', retryable: false },
  } as const satisfies Record<
    OnboardingSourceError['code'],
    { phase: OnboardingFailurePhase; retryable: boolean }
  >;
  const code =
    typeof record.code === 'string' && Object.prototype.hasOwnProperty.call(matrix, record.code)
      ? record.code
      : null;
  const rule = code === null ? null : matrix[code as OnboardingSourceError['code']];
  if (
    record.version !== ONBOARDING_SOURCE_MODEL_VERSION ||
    code === null ||
    rule === null ||
    record.phase !== rule.phase ||
    typeof record.message !== 'string' ||
    record.message.length === 0 ||
    record.message.length > ONBOARDING_SOURCE_ERROR_MAX_CHARS ||
    record.retryable !== rule.retryable
  ) {
    return null;
  }
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    code: code as OnboardingSourceError['code'],
    phase: rule.phase,
    message: record.message,
    retryable: rule.retryable,
  };
}

function readExactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  return readStrictJsonRecord(value, keys);
}

const INVALID_CAPTURE = Symbol('invalid-onboarding-source-capture');

function captureBoundary(value: unknown): unknown | typeof INVALID_CAPTURE {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const capture = (current: unknown, depth: number): unknown | typeof INVALID_CAPTURE => {
    nodes += 1;
    if (nodes > ONBOARDING_SOURCE_MAX_CAPTURE_NODES || depth > 64) {
      return INVALID_CAPTURE;
    }
    if (current === null || typeof current === 'string' || typeof current === 'boolean') {
      return current;
    }
    if (typeof current === 'number') {
      return Number.isFinite(current) ? current : INVALID_CAPTURE;
    }
    if (typeof current !== 'object' || seen.has(current)) {
      return INVALID_CAPTURE;
    }
    seen.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) {
          return INVALID_CAPTURE;
        }
        const lengthDescriptor = Object.getOwnPropertyDescriptor(current, 'length');
        if (
          lengthDescriptor === undefined ||
          !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          Number(lengthDescriptor.value) < 0 ||
          Number(lengthDescriptor.value) > ONBOARDING_SOURCE_MAX_CAPTURE_ARRAY_LENGTH
        ) {
          return INVALID_CAPTURE;
        }
        const length = Number(lengthDescriptor.value);
        const ownKeys = Reflect.ownKeys(current);
        if (
          ownKeys.length !== length + 1 ||
          ownKeys.some(
            (key) =>
              typeof key !== 'string' ||
              (key !== 'length' &&
                (!/^(0|[1-9]\d*)$/.test(key) ||
                  !Number.isSafeInteger(Number(key)) ||
                  Number(key) >= length))
          )
        ) {
          return INVALID_CAPTURE;
        }
        const result = new Array<unknown>(length);
        for (let index = 0; index < length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (
            descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
            descriptor.enumerable !== true
          ) {
            return INVALID_CAPTURE;
          }
          const item = capture(descriptor.value, depth + 1);
          if (item === INVALID_CAPTURE) {
            return INVALID_CAPTURE;
          }
          result[index] = item;
        }
        return Object.freeze(result);
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        return INVALID_CAPTURE;
      }
      const ownKeys = Reflect.ownKeys(current);
      if (
        ownKeys.length > ONBOARDING_SOURCE_MAX_CAPTURE_OBJECT_KEYS ||
        ownKeys.some((key) => typeof key !== 'string')
      ) {
        return INVALID_CAPTURE;
      }
      const result = Object.create(null) as Record<string, unknown>;
      for (const key of ownKeys) {
        if (typeof key !== 'string') {
          return INVALID_CAPTURE;
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (
          descriptor === undefined ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true
        ) {
          return INVALID_CAPTURE;
        }
        const item = capture(descriptor.value, depth + 1);
        if (item === INVALID_CAPTURE) {
          return INVALID_CAPTURE;
        }
        result[key] = item;
      }
      return Object.freeze(result);
    } catch {
      return INVALID_CAPTURE;
    }
  };
  return capture(value, 0);
}

function parseOperationIds(
  value: unknown,
  context: OnboardingSourceContext
): OnboardingSourceOperationIds | null {
  const captured = captureBoundary(value);
  const record =
    captured === INVALID_CAPTURE
      ? null
      : readExactRecord(captured, [
          'operationId',
          'mutationId',
          'permissionRequestId',
          'activationId',
          'storageReservationId',
          'activationResult',
        ]);
  if (record === null) {
    return null;
  }
  const ids = [
    record.operationId,
    record.mutationId,
    record.permissionRequestId,
    record.activationId,
    record.storageReservationId,
  ];
  if (!ids.every(isOnboardingSourceUuidV4) || new Set(ids).size !== ids.length) {
    return null;
  }
  const activationResult = parseSettingsActivationRegistryResultV1(record.activationResult, {
    dataEpoch: context.dataEpoch,
    workerEpoch: context.workerEpoch,
    mutationId: record.mutationId as string,
    permissionCheckId: record.permissionRequestId as string,
    activationId: record.activationId as string,
    storageReservationId: record.storageReservationId as string,
  });
  if (activationResult?.kind !== 'SETTINGS_ACTIVATION_CONSUMED') {
    return null;
  }
  return {
    operationId: record.operationId as string,
    mutationId: record.mutationId as string,
    permissionRequestId: record.permissionRequestId as string,
    activationId: record.activationId as string,
    storageReservationId: record.storageReservationId as string,
    activationResult,
  };
}

function parseSnapshot(
  context: OnboardingSourceContext,
  value: unknown
): SettingsSnapshotV1 | null {
  return parseSettledSettingsSnapshot(value, context.dataEpoch, context.includedConnectorIds);
}

export function normalizeOnboardingSourceEvent(
  rawEvent: unknown,
  context: OnboardingSourceContext
): OnboardingSourceEvent | null {
  const captured = captureBoundary(rawEvent);
  if (captured === INVALID_CAPTURE) {
    return null;
  }
  const base = readExactRecord(captured, ['type']);
  const typeRecord =
    base ??
    (captured !== null && typeof captured === 'object' && !Array.isArray(captured)
      ? (captured as Record<string, unknown>)
      : null);
  if (typeRecord === null || typeof typeRecord.type !== 'string') {
    return null;
  }
  const type = typeRecord.type;
  let event: OnboardingSourceEvent | null = null;

  if (type === 'SELECT_SOURCE') {
    const record = readExactRecord(captured, ['type', 'connectorId']);
    const id = connectorId(record?.connectorId);
    event = record !== null && id !== null ? { type, connectorId: id } : null;
  } else if (
    type === 'CONTINUE' ||
    type === 'CONFIRM_SOURCE' ||
    type === 'RETRY' ||
    type === 'SKIP'
  ) {
    const record = readExactRecord(captured, ['type', 'ids']);
    const ids = parseOperationIds(record?.ids, context);
    event =
      record !== null &&
      ids !== null &&
      operationIdsAreFresh(context, ids, type === 'RETRY' && context.recovery !== null ? 1 : 0)
        ? { type, ids }
        : null;
  } else if (type === 'SETTINGS_TRANSACTION_SETTLED') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'purpose',
      'operationId',
      'mutationId',
      'commandDigest',
      'snapshot',
    ]);
    const snapshot = parseSnapshot(context, record?.snapshot);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      (record.purpose === 'selection' || record.purpose === 'skip_auto_scan') &&
      isOnboardingSourceUuidV4(record.operationId) &&
      isOnboardingSourceUuidV4(record.mutationId) &&
      parseSettingsCommandDigest(record.commandDigest) !== null &&
      snapshot !== null
        ? {
            type,
            dataEpoch: context.dataEpoch,
            purpose: record.purpose,
            operationId: record.operationId,
            mutationId: record.mutationId,
            commandDigest: record.commandDigest as string,
            snapshot,
          }
        : null;
  } else if (type === 'SETTINGS_TRANSACTION_FAILED') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'purpose',
      'operationId',
      'mutationId',
      'commandDigest',
      'error',
    ]);
    const error = parseOnboardingSourceError(record?.error);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      (record.purpose === 'selection' || record.purpose === 'skip_auto_scan') &&
      isOnboardingSourceUuidV4(record.operationId) &&
      isOnboardingSourceUuidV4(record.mutationId) &&
      parseSettingsCommandDigest(record.commandDigest) !== null &&
      error !== null
        ? {
            type,
            dataEpoch: context.dataEpoch,
            purpose: record.purpose,
            operationId: record.operationId,
            mutationId: record.mutationId,
            commandDigest: record.commandDigest as string,
            error,
          }
        : null;
  } else if (type === 'ONBOARDING_COMPLETION_PERSISTED') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'operationId', 'proof']);
    const proof =
      isOnboardingSourceUuidV4(record?.operationId) &&
      record?.dataEpoch === context.dataEpoch &&
      (context.activeOperation?.purpose === 'consent' ||
        context.activeOperation?.purpose === 'skip_completion')
        ? parseOnboardingCompletionProof(record?.proof, {
            dataEpoch: context.dataEpoch,
            attemptId: context.attemptId,
            operationId: record.operationId,
          })
        : null;
    event =
      record !== null && isOnboardingSourceUuidV4(record.operationId) && proof !== null
        ? { type, dataEpoch: context.dataEpoch, operationId: record.operationId, proof }
        : null;
  } else if (type === 'ONBOARDING_COMPLETION_FAILED') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'operationId', 'error']);
    const error = parseOnboardingSourceError(record?.error);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      error !== null &&
      (error.phase === 'consent' || error.phase === 'skip')
        ? { type, dataEpoch: context.dataEpoch, operationId: record.operationId, error }
        : null;
  } else if (type === 'PERMISSION_GRANTED') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'operationId',
      'connectorId',
      'required',
    ]);
    const id = connectorId(record?.connectorId);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      id !== null &&
      typeof record.required === 'boolean'
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            connectorId: id,
            required: record.required,
          }
        : null;
  } else if (type === 'PERMISSION_REFUSED' || type === 'SESSION_MISSING') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'operationId', 'connectorId']);
    const id = connectorId(record?.connectorId);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      id !== null
        ? { type, dataEpoch: context.dataEpoch, operationId: record.operationId, connectorId: id }
        : null;
  } else if (type === 'SESSION_FOUND') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'operationId',
      'connectorId',
      'lastSync',
    ]);
    const id = connectorId(record?.connectorId);
    const lastSync = record?.lastSync;
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      id !== null &&
      (lastSync === null ||
        (typeof lastSync === 'string' && lastSync.length > 0 && lastSync.length <= 64))
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            connectorId: id,
            lastSync,
          }
        : null;
  } else if (type === 'CHECK_FAILED') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'operationId',
      'connectorId',
      'error',
    ]);
    const id = connectorId(record?.connectorId);
    const error = parseOnboardingSourceError(record?.error);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      id !== null &&
      error !== null &&
      (error.phase === 'permission' || error.phase === 'session')
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            connectorId: id,
            error,
          }
        : null;
  } else if (type === 'NETWORK_OFFLINE') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'operationId']);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId)
        ? { type, dataEpoch: context.dataEpoch, operationId: record.operationId }
        : null;
  } else if (type === 'CANCEL' || type === 'SERVICE_WORKER_RESTARTED') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'requestId']);
    const reservedFollowUpIds =
      type === 'SERVICE_WORKER_RESTARTED' ? 1 : cancellationCorrelationReserve(context);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      correlationIdsAreFresh(context, [record.requestId]) &&
      correlationIdsHaveCapacity(context, [record.requestId], reservedFollowUpIds)
        ? { type, dataEpoch: context.dataEpoch, requestId: record.requestId as string }
        : null;
  } else if (type === 'SETTINGS_CANCEL_CONFIRMED') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'operationId',
      'mutationId',
      'requestId',
      'snapshot',
    ]);
    const snapshot = parseSnapshot(context, record?.snapshot);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      isOnboardingSourceUuidV4(record.mutationId) &&
      isOnboardingSourceUuidV4(record.requestId) &&
      snapshot !== null
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            mutationId: record.mutationId,
            requestId: record.requestId,
            snapshot,
          }
        : null;
  } else if (type === 'SETTINGS_CANCEL_OUTCOME_UNKNOWN') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'operationId',
      'mutationId',
      'requestId',
      'nextRequestId',
    ]);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      isOnboardingSourceUuidV4(record.mutationId) &&
      isOnboardingSourceUuidV4(record.requestId) &&
      isOnboardingSourceUuidV4(record.nextRequestId) &&
      record.nextRequestId !== record.requestId &&
      correlationIdsAreFresh(context, [record.nextRequestId]) &&
      correlationIdsHaveCapacity(context, [record.nextRequestId], 1)
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            mutationId: record.mutationId,
            requestId: record.requestId,
            nextRequestId: record.nextRequestId,
          }
        : null;
  } else if (type === 'CONSENT_CANCEL_CONFIRMED') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'operationId', 'requestId']);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      isOnboardingSourceUuidV4(record.requestId)
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            requestId: record.requestId,
          }
        : null;
  } else if (type === 'CONSENT_CANCEL_OUTCOME_UNKNOWN') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'operationId',
      'requestId',
      'nextRequestId',
    ]);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.operationId) &&
      isOnboardingSourceUuidV4(record.requestId) &&
      isOnboardingSourceUuidV4(record.nextRequestId) &&
      record.requestId !== record.nextRequestId &&
      correlationIdsAreFresh(context, [record.nextRequestId]) &&
      correlationIdsHaveCapacity(context, [record.nextRequestId], 1)
        ? {
            type,
            dataEpoch: context.dataEpoch,
            operationId: record.operationId,
            requestId: record.requestId,
            nextRequestId: record.nextRequestId,
          }
        : null;
  } else if (type === 'CANONICAL_STATE_REHYDRATED') {
    const record = readExactRecord(captured, [
      'type',
      'dataEpoch',
      'requestId',
      'nextOperationId',
      'snapshot',
      'completionReadProof',
    ]);
    const snapshot = parseSnapshot(context, record?.snapshot);
    const recovery = context.recovery;
    const completionReadProof =
      recovery === null
        ? null
        : parseOnboardingCompletionReadProof(record?.completionReadProof, {
            dataEpoch: context.dataEpoch,
            requestId: recovery.requestId,
            commandId: recovery.commandId,
          });
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.requestId) &&
      recovery !== null &&
      record.requestId === recovery.requestId &&
      correlationIdsAreFresh(context, [record.nextOperationId]) &&
      correlationIdsHaveCapacity(context, [record.nextOperationId]) &&
      snapshot !== null &&
      snapshot.requestId === recovery.snapshotRequestId &&
      snapshot.commandId === recovery.snapshotCommandId &&
      completionReadProof !== null
        ? {
            type,
            dataEpoch: context.dataEpoch,
            requestId: record.requestId,
            nextOperationId: record.nextOperationId as string,
            snapshot,
            completionReadProof,
          }
        : null;
  } else if (type === 'ONBOARDING_COMPLETION_CLEARED') {
    const record = readExactRecord(captured, ['type', 'dataEpoch', 'requestId']);
    event =
      record !== null &&
      record.dataEpoch === context.dataEpoch &&
      isOnboardingSourceUuidV4(record.requestId)
        ? { type, dataEpoch: context.dataEpoch, requestId: record.requestId }
        : null;
  } else if (type === 'DATA_EPOCH_INVALIDATED') {
    const record = readExactRecord(captured, [
      'type',
      'resetId',
      'previousDataEpoch',
      'nextDataEpoch',
    ]);
    event =
      record !== null &&
      isOnboardingSourceUuidV4(record.resetId) &&
      isOnboardingSourceUuidV4(record.previousDataEpoch) &&
      isOnboardingSourceUuidV4(record.nextDataEpoch) &&
      new Set([record.resetId, record.previousDataEpoch, record.nextDataEpoch]).size === 3
        ? {
            type,
            resetId: record.resetId,
            previousDataEpoch: record.previousDataEpoch,
            nextDataEpoch: record.nextDataEpoch,
          }
        : null;
  }

  return event === null ? null : (deepFreeze(event) as OnboardingSourceEvent);
}

export function cloneOnboardingSourceCommand(
  command: OnboardingSourceCommand | null
): OnboardingSourceCommand | null {
  if (command === null) {
    return null;
  }
  return deepFreeze(
    command.type === 'CHECK_CONNECTOR_PERMISSION'
      ? { ...command, origins: [...command.origins] }
      : command.type === 'DISPATCH_SETTINGS_SELECTION' ||
          command.type === 'DISPATCH_SETTINGS_SKIP_AUTO_SCAN'
        ? {
            ...command,
            event: {
              ...command.event,
              candidate: Array.isArray(command.event.candidate)
                ? [...command.event.candidate]
                : command.event.candidate,
            },
            expectation: cloneSettingsTransactionExpectation(command.expectation),
          }
        : command.type === 'DISPATCH_SETTINGS_CANCEL'
          ? { ...command, event: { ...command.event } }
          : { ...command }
  ) as OnboardingSourceCommand;
}

export function cloneOnboardingSourceError(
  error: OnboardingSourceError | null
): OnboardingSourceError | null {
  return error === null ? null : { ...error };
}

export function adoptSettingsSnapshot(
  snapshot: SettingsSnapshotV1
): Pick<OnboardingSourceContext, 'canonicalSettings' | 'settingsRevision' | 'settingsGeneration'> {
  return {
    canonicalSettings: cloneSettings(snapshot.envelope.settings),
    settingsRevision: snapshot.envelope.revision,
    settingsGeneration: snapshot.envelope.generation,
  };
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}
