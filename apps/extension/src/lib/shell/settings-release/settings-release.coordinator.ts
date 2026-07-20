import { createActor } from 'xstate';

import type { AppSettings } from '../../core/types/app-settings';
import {
  CANONICAL_INCLUDED_CONNECTOR_IDS,
  INCLUDED_CONNECTOR_IDS,
} from '../connectors/build-config';
import { getAllConnectorsMeta } from '../connectors/meta';
import {
  SETTINGS_RELEASE_ENVELOPE_KEY,
  SETTINGS_RELEASE_LEGACY_KEYS,
  SETTINGS_RELEASE_OUTCOME_LIMIT,
  SETTINGS_RELEASE_QUEUE_LIMIT,
  SETTINGS_RELEASE_STARTUP_QUEUE_LIMIT,
  connectorCatalogFingerprint,
  decodeSettingsReleaseEnvelope,
  expectedAutoScanAlarm,
  isReleaseUuid,
  normalizeReleaseSettings,
  sameEnvelope,
  sameSettings,
  settingsReleaseIntentDigest,
  settingsReleaseScanDigest,
  settingsReleaseSnapshot,
  type AutoScanExpectation,
  type SettingsReleaseEnvelopeV1,
  type SettingsReleaseMutationIntent,
  type SettingsReleaseMutationResult,
  type SettingsReleaseOutcome,
  type SettingsReleaseReadResult,
  type SettingsReleaseQueueRejection,
  type SettingsReleaseSnapshot,
} from './settings-release.contract';
import { settingsReleaseMachine } from './settings-release.machine';
import {
  CONNECTOR_CATALOGUE_HISTORY_V1,
  connectorCatalogueForFingerprint,
  recognizedConnectorIdsFromHistory,
  validateConnectorCatalogueHistory,
  type ConnectorCatalogueHistoryV1,
  type ConnectorCatalogueTupleV1,
} from './connector-catalogue-history';

export interface SettingsReleaseStoragePort {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
}

export interface SettingsReleaseAlarmPort {
  get(): Promise<unknown>;
  create(periodInMinutes: number): Promise<void>;
  clear(): Promise<void>;
}

export interface SettingsReleasePermissionsPort {
  contains(origins: readonly string[]): Promise<unknown>;
}

export interface SettingsReleaseBroadcastPort {
  publish(message: {
    type: 'SETTINGS_RELEASE_UPDATED';
    payload: { snapshot: SettingsReleaseSnapshot; commandId: string; broadcastId: string };
  }): Promise<'delivered' | 'no_receiver'>;
}

export type ScanAdmissionResult =
  | { status: 'accepted'; operationId: `missionpulse-scan:${string}:${number}` }
  | { status: 'skipped'; reason: 'permission_missing' | 'already_running' };

export type ScanAdmissionQueryResult =
  ScanAdmissionResult | { status: 'not_found' } | { status: 'retired' };

export interface SettingsReleaseScanPort {
  tryAdmit(input: {
    token: string;
    identity: number;
    snapshot: SettingsReleaseSnapshot;
    snapshotDigest: string;
    scanAckThrough: number;
  }): Promise<unknown>;
  query(input: {
    token: string;
    identity: number;
    snapshotDigest: string;
    scanAckThrough: number;
  }): Promise<unknown>;
}

export interface SettingsReleasePorts {
  storage: SettingsReleaseStoragePort;
  alarm: SettingsReleaseAlarmPort;
  permissions: SettingsReleasePermissionsPort;
  broadcast: SettingsReleaseBroadcastPort;
  scan: SettingsReleaseScanPort;
  uuid(): string;
}

export type SettingsScanDisposition =
  | ScanAdmissionResult
  | { status: 'skipped'; reason: 'catalog_changed' }
  | SettingsReleaseQueueRejection
  | { status: 'blocked'; reason: 'protocol_unknown' | 'timeout' | 'identity_error' };

export interface SettingsReleaseCoordinator {
  boot(): Promise<void>;
  read(): Promise<SettingsReleaseReadResult>;
  mutate(intent: SettingsReleaseMutationIntent): Promise<SettingsReleaseMutationResult>;
  admitAutoScan(scheduledTimeMs: number): Promise<SettingsScanDisposition>;
  retry(): Promise<{
    status: 'retry_accepted' | 'retry_already_queued' | 'retry_not_applicable';
    snapshot: null;
  }>;
}

const MAX = Number.MAX_SAFE_INTEGER;
const SCAN_PORT_DEADLINE_MS = 10_000;

const catalog = getAllConnectorsMeta();
const RECOGNIZED_CONNECTOR_IDS = new Set(
  recognizedConnectorIdsFromHistory(CONNECTOR_CATALOGUE_HISTORY_V1)
);
const included = new Set<string>(INCLUDED_CONNECTOR_IDS);
const CATALOG_TUPLES = catalog
  .map(
    (connector) =>
      [connector.id, included.has(connector.id), [...connector.hostPermissions].sort()] as const
  )
  .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

function defaultSettings(): AppSettings {
  return {
    scanIntervalMinutes: 30,
    enabledConnectors: [...CANONICAL_INCLUDED_CONNECTOR_IDS],
    notifications: true,
    autoScan: true,
    maxSemanticPerScan: 10,
    notificationScoreThreshold: 70,
    respectRateLimits: true,
    customDelayMs: 0,
    theme: 'system',
  };
}

function ownDataValue(record: unknown, key: string): { present: boolean; value: unknown } | null {
  if (record === null || typeof record !== 'object') {
    return null;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) {
      return { present: false, value: undefined };
    }
    if (!('value' in descriptor) || !descriptor.enumerable) {
      return null;
    }
    return { present: true, value: descriptor.value };
  } catch {
    return null;
  }
}

function alarmMatches(raw: unknown, expectation: AutoScanExpectation): boolean {
  if ('absent' in expectation) {
    return raw === null || raw === undefined;
  }
  if (raw === null || typeof raw !== 'object') {
    return false;
  }
  try {
    const name = Object.getOwnPropertyDescriptor(raw, 'name');
    const period = Object.getOwnPropertyDescriptor(raw, 'periodInMinutes');
    if (!name || !('value' in name) || name.value !== 'auto-scan') {
      return false;
    }
    if (!period || !('value' in period) || period.value !== expectation.periodInMinutes) {
      return false;
    }
    const persist = Object.getOwnPropertyDescriptor(raw, 'persistAcrossSessions');
    return !persist || ('value' in persist && persist.value === true);
  } catch {
    return false;
  }
}

function cloneEnvelope(envelope: SettingsReleaseEnvelopeV1): SettingsReleaseEnvelopeV1 {
  return structuredClone(envelope);
}

function operationIdMatches(
  value: unknown,
  installId: string,
  identity: number
): value is `missionpulse-scan:${string}:${number}` {
  return value === `missionpulse-scan:${installId}:${identity}`;
}

function parseScanResult(
  raw: unknown,
  installId: string,
  identity: number
): ScanAdmissionQueryResult | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const status = ownDataValue(raw, 'status');
  if (!status?.present || typeof status.value !== 'string') {
    return null;
  }
  const keys = Reflect.ownKeys(raw);
  if (keys.some((key) => typeof key !== 'string')) {
    return null;
  }
  if (status.value === 'accepted') {
    if (keys.length !== 2) {
      return null;
    }
    const operationId = ownDataValue(raw, 'operationId');
    return operationId?.present && operationIdMatches(operationId.value, installId, identity)
      ? { status: 'accepted', operationId: operationId.value }
      : null;
  }
  if (status.value === 'skipped') {
    if (keys.length !== 2) {
      return null;
    }
    const reason = ownDataValue(raw, 'reason');
    return reason?.value === 'permission_missing' || reason?.value === 'already_running'
      ? { status: 'skipped', reason: reason.value }
      : null;
  }
  if ((status.value === 'not_found' || status.value === 'retired') && keys.length === 1) {
    return { status: status.value };
  }
  return null;
}

export function createSettingsReleaseCoordinator(
  ports: SettingsReleasePorts
): SettingsReleaseCoordinator {
  const actor = createActor(settingsReleaseMachine).start();
  let envelope: SettingsReleaseEnvelopeV1 | null = null;
  let bootPromise: Promise<void> | null = null;
  let bootSettled = false;
  let blockedReason: 'actor_blocked' | 'storage_ambiguous' | null = null;
  let tail: Promise<void> = Promise.resolve();
  let queued = 0;
  let retryQueued = false;
  let currentFingerprint = '';
  let currentCatalogue: ConnectorCatalogueHistoryV1['catalogues'][number] | null = null;

  const catalogueIds = (
    tuples: readonly ConnectorCatalogueTupleV1[],
    includedOnly: boolean
  ): string[] => tuples.filter((tuple) => !includedOnly || tuple[1]).map((tuple) => tuple[0]);

  const catalogueFor = (
    fingerprint: string
  ): ConnectorCatalogueHistoryV1['catalogues'][number] | null =>
    connectorCatalogueForFingerprint(CONNECTOR_CATALOGUE_HISTORY_V1, fingerprint);

  const block = (reason: 'actor_blocked' | 'storage_ambiguous' = 'storage_ambiguous'): void => {
    blockedReason = reason;
    const value = actor.getSnapshot().value;
    const event =
      value === 'booting'
        ? 'BOOT_PROOF_FAILED'
        : value === 'migrating'
          ? 'MIGRATION_FAILED'
          : value === 'recovering'
            ? 'RECOVERY_AMBIGUOUS'
            : value === 'recoveringScan'
              ? 'SCAN_RECOVERY_UNKNOWN'
              : value === 'retiringScanAdmission'
                ? 'OLD_SCAN_RESULT_UNKNOWN'
                : value === 'catalogMigrating'
                  ? 'CATALOG_MIGRATION_AMBIGUOUS'
                  : value === 'reconciling'
                    ? 'RECONCILIATION_FAILED'
                    : value === 'broadcasting'
                      ? 'OUTBOX_TRANSPORT_OR_CLEAR_AMBIGUOUS'
                      : value === 'ready'
                        ? 'READY_PROOF_FAILED'
                        : null;
    if (event) {
      actor.send({ type: event });
    }
  };

  async function readRawEnvelope(): Promise<
    | { status: 'absent' }
    | { status: 'valid'; envelope: SettingsReleaseEnvelopeV1 }
    | { status: 'invalid' }
  > {
    let raw: Record<string, unknown>;
    try {
      raw = await ports.storage.get([SETTINGS_RELEASE_ENVELOPE_KEY]);
    } catch {
      return { status: 'invalid' };
    }
    const value = ownDataValue(raw, SETTINGS_RELEASE_ENVELOPE_KEY);
    if (value === null) {
      return { status: 'invalid' };
    }
    if (!value.present) {
      return { status: 'absent' };
    }
    for (const entry of CONNECTOR_CATALOGUE_HISTORY_V1.catalogues) {
      const decoded = decodeSettingsReleaseEnvelope(
        value.value,
        catalogueIds(entry.tuples, false),
        catalogueIds(entry.tuples, true)
      );
      if (decoded?.catalogFingerprint === entry.catalogFingerprint) {
        return { status: 'valid', envelope: decoded };
      }
    }
    return { status: 'invalid' };
  }

  async function writeExact(
    previous: SettingsReleaseEnvelopeV1 | null,
    intended: SettingsReleaseEnvelopeV1
  ): Promise<'committed' | 'previous' | 'ambiguous'> {
    try {
      await ports.storage.set({ [SETTINGS_RELEASE_ENVELOPE_KEY]: cloneEnvelope(intended) });
    } catch {
      // Read-back below is the only authority.
    }
    const read = await readRawEnvelope();
    if (read.status !== 'valid') {
      return 'ambiguous';
    }
    if (sameEnvelope(read.envelope, intended)) {
      return 'committed';
    }
    if (previous && sameEnvelope(read.envelope, previous)) {
      return 'previous';
    }
    return 'ambiguous';
  }

  async function proveCurrentEnvelope(): Promise<boolean> {
    if (!envelope) {
      return false;
    }
    const read = await readRawEnvelope();
    if (read.status === 'valid' && sameEnvelope(read.envelope, envelope)) {
      return true;
    }
    block('storage_ambiguous');
    return false;
  }

  async function reconcileAlarm(expectation: AutoScanExpectation): Promise<boolean> {
    try {
      const current = await ports.alarm.get();
      if (alarmMatches(current, expectation)) {
        return true;
      }
      if ('absent' in expectation) {
        await ports.alarm.clear();
      } else {
        await ports.alarm.create(expectation.periodInMinutes);
      }
      return alarmMatches(await ports.alarm.get(), expectation);
    } catch {
      return false;
    }
  }

  function originsFor(
    ids: readonly string[],
    tuples: readonly ConnectorCatalogueTupleV1[]
  ): string[] {
    const wanted = new Set(ids);
    return [
      ...new Set(tuples.filter(([id]) => wanted.has(id)).flatMap((tuple) => tuple[2])),
    ].sort();
  }

  async function permissionProofForNew(
    previousIds: readonly string[],
    candidateIds: readonly string[],
    tuples: readonly ConnectorCatalogueTupleV1[]
  ): Promise<true | false | 'unknown'> {
    const previous = new Set(previousIds);
    const origins = originsFor(
      candidateIds.filter((id) => !previous.has(id)),
      tuples
    );
    if (origins.length === 0) {
      return true;
    }
    try {
      const result = await ports.permissions.contains(origins);
      return result === true ? true : result === false ? false : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async function withScanPortDeadline<T>(operation: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('settings release scan port timeout')),
            SCAN_PORT_DEADLINE_MS
          );
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function publishAndClear(): Promise<boolean> {
    if (!envelope?.outbox) {
      return true;
    }
    const previous = cloneEnvelope(envelope);
    const outbox = previous.outbox;
    if (!outbox) {
      block('storage_ambiguous');
      return false;
    }
    if (previous.generation >= MAX) {
      block('actor_blocked');
      return false;
    }
    try {
      const result = await ports.broadcast.publish({
        type: 'SETTINGS_RELEASE_UPDATED',
        payload: {
          snapshot: structuredClone(outbox.snapshot),
          commandId: outbox.commandId,
          broadcastId: outbox.broadcastId,
        },
      });
      if (result !== 'delivered' && result !== 'no_receiver') {
        throw new Error('unknown publish');
      }
    } catch {
      block('storage_ambiguous');
      return false;
    }
    const intended = {
      ...cloneEnvelope(previous),
      generation: previous.generation + 1,
      outbox: null,
    };
    if ((await writeExact(previous, intended)) !== 'committed') {
      block('storage_ambiguous');
      return false;
    }
    envelope = intended;
    actor.send({ type: 'OUTBOX_ATTEMPT_PROVED_AND_CLEARED' });
    return true;
  }

  async function settleAttempt(
    pendingEnvelope: SettingsReleaseEnvelopeV1,
    confirmed: SettingsReleaseEnvelopeV1['confirmed'],
    status: SettingsReleaseOutcome['status'],
    reason: SettingsReleaseOutcome['reason']
  ): Promise<
    | { status: 'committed'; outcome: SettingsReleaseOutcome }
    | { status: 'previous' }
    | { status: 'ambiguous' }
  > {
    const pending = pendingEnvelope.pending;
    if (!pending || pendingEnvelope.revision >= MAX || pendingEnvelope.generation >= MAX) {
      return { status: 'ambiguous' };
    }
    const settledRevision = pendingEnvelope.revision + 1;
    const settledGeneration = pendingEnvelope.generation + 1;
    const snapshot: SettingsReleaseSnapshot = {
      settings: structuredClone(confirmed.settings),
      onboardingCompleted: confirmed.onboardingCompleted,
      revision: settledRevision,
      generation: settledGeneration,
    };
    const common = {
      commandId: pending.commandId,
      requestId: pending.requestId,
      intentDigest: pending.intentDigest,
      kind: pending.kind,
      settledRevision,
      settledGeneration,
      snapshot,
    };
    const outcome = { ...common, status, reason } as SettingsReleaseOutcome;
    const outcomes = [...pendingEnvelope.outcomes, outcome].slice(-SETTINGS_RELEASE_OUTCOME_LIMIT);
    const intended: SettingsReleaseEnvelopeV1 = {
      ...cloneEnvelope(pendingEnvelope),
      revision: settledRevision,
      generation: settledGeneration,
      confirmed: structuredClone(confirmed),
      pending: null,
      outcomes,
      outbox: {
        broadcastId: `${pending.commandId}:broadcast`,
        commandId: pending.commandId,
        reason: 'mutation_settlement',
        snapshot,
      },
    };
    const write = await writeExact(pendingEnvelope, intended);
    if (write !== 'committed') {
      return { status: write };
    }
    envelope = intended;
    return { status: 'committed', outcome };
  }

  async function settle(
    pendingEnvelope: SettingsReleaseEnvelopeV1,
    confirmed: SettingsReleaseEnvelopeV1['confirmed'],
    status: SettingsReleaseOutcome['status'],
    reason: SettingsReleaseOutcome['reason']
  ): Promise<SettingsReleaseOutcome | null> {
    const attempt = await settleAttempt(pendingEnvelope, confirmed, status, reason);
    return attempt.status === 'committed' ? attempt.outcome : null;
  }

  async function migrate(): Promise<boolean> {
    let legacy: Record<string, unknown>;
    try {
      legacy = await ports.storage.get(SETTINGS_RELEASE_LEGACY_KEYS);
    } catch {
      return false;
    }
    const rawSettings = ownDataValue(legacy, 'settings');
    const rawConsent = ownDataValue(legacy, 'onboarding_completed');
    if (rawSettings === null || rawConsent === null) {
      return false;
    }
    if (!currentCatalogue) {
      return false;
    }
    const settings = rawSettings.present
      ? normalizeReleaseSettings(
          rawSettings.value,
          catalogueIds(currentCatalogue.tuples, false),
          catalogueIds(currentCatalogue.tuples, true)
        )
      : defaultSettings();
    if (!settings) {
      return false;
    }
    if (rawConsent.present && typeof rawConsent.value !== 'boolean') {
      return false;
    }
    const installId = ports.uuid();
    if (!isReleaseUuid(installId)) {
      return false;
    }
    const initial: SettingsReleaseEnvelopeV1 = {
      version: 1,
      installId,
      nextIdentity: 1,
      revision: 0,
      generation: 0,
      scanAckThrough: 0,
      catalogFingerprint: currentFingerprint,
      legacyRetirement: 'pending_removal',
      confirmed: {
        settings,
        onboardingCompleted: rawConsent.present ? rawConsent.value === true : false,
      },
      pending: null,
      outcomes: [],
      outbox: null,
      scanAdmission: null,
    };
    if ((await writeExact(null, initial)) !== 'committed') {
      return false;
    }
    envelope = initial;
    if (!(await reconcileAlarm(expectedAutoScanAlarm(initial.confirmed)))) {
      return false;
    }
    try {
      await ports.storage.remove(SETTINGS_RELEASE_LEGACY_KEYS);
      const proof = await ports.storage.get(SETTINGS_RELEASE_LEGACY_KEYS);
      if (
        ownDataValue(proof, 'settings')?.present ||
        ownDataValue(proof, 'onboarding_completed')?.present
      ) {
        return false;
      }
    } catch {
      return false;
    }
    const retired = {
      ...cloneEnvelope(initial),
      generation: 1,
      legacyRetirement: 'retired' as const,
    };
    if ((await writeExact(initial, retired)) !== 'committed') {
      return false;
    }
    envelope = retired;
    return true;
  }

  async function proveLegacyRetirement(value: SettingsReleaseEnvelopeV1): Promise<boolean> {
    let raw: Record<string, unknown>;
    try {
      raw = await ports.storage.get(SETTINGS_RELEASE_LEGACY_KEYS);
    } catch {
      return false;
    }
    const settings = ownDataValue(raw, 'settings');
    const consent = ownDataValue(raw, 'onboarding_completed');
    if (settings === null || consent === null) {
      return false;
    }
    if (value.legacyRetirement === 'retired') {
      return !settings.present && !consent.present;
    }

    if (settings.present) {
      const valueCatalogue = catalogueFor(value.catalogFingerprint);
      if (!valueCatalogue) {
        return false;
      }
      const normalized = normalizeReleaseSettings(
        settings.value,
        catalogueIds(valueCatalogue.tuples, false),
        catalogueIds(valueCatalogue.tuples, true)
      );
      if (!normalized || !sameSettings(normalized, value.confirmed.settings)) {
        return false;
      }
    }
    if (consent.present && consent.value !== value.confirmed.onboardingCompleted) {
      return false;
    }
    try {
      await ports.storage.remove(SETTINGS_RELEASE_LEGACY_KEYS);
      const proof = await ports.storage.get(SETTINGS_RELEASE_LEGACY_KEYS);
      if (
        ownDataValue(proof, 'settings')?.present ||
        ownDataValue(proof, 'onboarding_completed')?.present
      ) {
        return false;
      }
    } catch {
      return false;
    }
    if (value.generation >= MAX) {
      return false;
    }
    const retired = {
      ...cloneEnvelope(value),
      generation: value.generation + 1,
      legacyRetirement: 'retired' as const,
    };
    if ((await writeExact(value, retired)) !== 'committed') {
      return false;
    }
    envelope = retired;
    return true;
  }

  async function recoverPending(oldCatalogue = false): Promise<boolean> {
    if (!envelope?.pending) {
      return true;
    }
    let current = cloneEnvelope(envelope);
    const pending = current.pending;
    if (!pending) {
      return false;
    }
    if (current.generation > MAX - 3 || current.revision >= MAX) {
      return false;
    }

    if (pending.phase === 'effect_proved') {
      const pendingCatalogue = catalogueFor(current.catalogFingerprint);
      if (!pendingCatalogue) {
        return false;
      }
      const permission = await permissionProofForNew(
        pending.previous.settings.enabledConnectors,
        pending.candidate.settings.enabledConnectors,
        pendingCatalogue.tuples
      );
      const alarmProved = await reconcileAlarm(pending.candidateAlarm);
      if (permission === true && alarmProved) {
        const outcome = await settle(
          current,
          pending.candidate,
          'committed',
          'recovered_candidate'
        );
        if (!outcome) {
          return false;
        }
        actor.send({
          type: oldCatalogue ? 'OLD_CATALOG_RECOVERY_SETTLED' : 'RECOVERY_SETTLED',
        });
        return oldCatalogue ? true : publishAndClear();
      }
      const compensationReason =
        permission === true && !alarmProved ? 'effect_compensated' : 'permission_lost';
      const compensating: SettingsReleaseEnvelopeV1 = {
        ...cloneEnvelope(current),
        generation: current.generation + 1,
        pending: {
          ...pending,
          phase: 'compensating',
          compensationReason,
        },
      };
      if ((await writeExact(current, compensating)) !== 'committed') {
        return false;
      }
      current = compensating;
    }

    const recoveryPending = current.pending;
    if (
      recoveryPending &&
      recoveryPending.phase !== 'reserved' &&
      recoveryPending.phase !== 'compensating'
    ) {
      const compensating: SettingsReleaseEnvelopeV1 = {
        ...cloneEnvelope(current),
        generation: current.generation + 1,
        pending: {
          ...recoveryPending,
          phase: 'compensating',
          compensationReason: 'recovered_previous',
        },
      };
      if ((await writeExact(current, compensating)) !== 'committed') {
        return false;
      }
      current = compensating;
    }
    const currentPending = current.pending;
    if (!currentPending || !(await reconcileAlarm(currentPending.previousAlarm))) {
      return false;
    }
    const storedReason = currentPending.compensationReason;
    const outcome =
      storedReason === 'permission_lost'
        ? await settle(current, currentPending.previous, 'compensated', 'permission_lost')
        : storedReason === 'effect_compensated'
          ? await settle(current, currentPending.previous, 'compensated', 'effect_compensated')
          : await settle(current, currentPending.previous, 'not_committed', 'recovered_previous');
    if (!outcome) {
      return false;
    }
    actor.send({
      type: oldCatalogue ? 'OLD_CATALOG_RECOVERY_SETTLED' : 'RECOVERY_SETTLED',
    });
    return oldCatalogue ? true : publishAndClear();
  }

  async function retireOldCatalogueScan(): Promise<boolean> {
    if (!envelope?.scanAdmission) {
      return false;
    }
    const previous = cloneEnvelope(envelope);
    const record = previous.scanAdmission;
    if (!record) {
      return false;
    }
    let parsed: ScanAdmissionQueryResult | null = null;
    try {
      parsed = parseScanResult(
        await withScanPortDeadline(
          ports.scan.query({
            token: record.token,
            identity: record.identity,
            snapshotDigest: record.snapshotDigest,
            scanAckThrough: previous.scanAckThrough,
          })
        ),
        previous.installId,
        record.identity
      );
    } catch {
      return false;
    }
    const valid =
      record.phase === 'reserved'
        ? parsed?.status === 'accepted' ||
          parsed?.status === 'skipped' ||
          parsed?.status === 'not_found'
        : parsed?.status === 'accepted' && parsed.operationId === record.result?.operationId;
    if (!valid || previous.generation >= MAX) {
      return false;
    }
    const retired: SettingsReleaseEnvelopeV1 = {
      ...previous,
      generation: previous.generation + 1,
      scanAckThrough: Math.max(previous.scanAckThrough, record.identity),
      scanAdmission: null,
    };
    if ((await writeExact(previous, retired)) !== 'committed') {
      return false;
    }
    envelope = retired;
    actor.send({ type: 'OLD_SCAN_RESULT_RETIRED_OR_NOT_FOUND' });
    return true;
  }

  async function recoverScan(): Promise<boolean> {
    if (!envelope?.scanAdmission) {
      return true;
    }
    const previous = cloneEnvelope(envelope);
    const record = previous.scanAdmission;
    if (!record) {
      return false;
    }
    if (previous.generation > MAX - 2) {
      return false;
    }
    let parsed: ScanAdmissionQueryResult | null = null;
    try {
      const raw = await withScanPortDeadline(
        record.phase === 'reserved'
          ? ports.scan.tryAdmit({
              token: record.token,
              identity: record.identity,
              snapshot: record.snapshot,
              snapshotDigest: record.snapshotDigest,
              scanAckThrough: previous.scanAckThrough,
            })
          : ports.scan.query({
              token: record.token,
              identity: record.identity,
              snapshotDigest: record.snapshotDigest,
              scanAckThrough: previous.scanAckThrough,
            })
      );
      parsed = parseScanResult(raw, previous.installId, record.identity);
    } catch {
      return false;
    }
    if (!parsed || parsed.status === 'not_found' || parsed.status === 'retired') {
      return false;
    }
    if (record.phase === 'accepted') {
      if (parsed.status !== 'accepted' || parsed.operationId !== record.result?.operationId) {
        return false;
      }
    }
    const cleared: SettingsReleaseEnvelopeV1 = {
      ...previous,
      generation: previous.generation + 1,
      scanAckThrough: Math.max(previous.scanAckThrough, record.identity),
      scanAdmission: null,
    };
    if ((await writeExact(previous, cleared)) !== 'committed') {
      return false;
    }
    envelope = cleared;
    actor.send({ type: 'SCAN_RECOVERY_SETTLED' });
    return true;
  }

  async function bootInternal(): Promise<void> {
    blockedReason = null;
    if (
      !(await validateConnectorCatalogueHistory(CONNECTOR_CATALOGUE_HISTORY_V1)) ||
      CATALOG_TUPLES.some(([id]) => !RECOGNIZED_CONNECTOR_IDS.has(id))
    ) {
      block('storage_ambiguous');
      return;
    }
    currentFingerprint = await connectorCatalogFingerprint(CATALOG_TUPLES);
    currentCatalogue = catalogueFor(currentFingerprint);
    if (!currentCatalogue) {
      block('storage_ambiguous');
      return;
    }
    const read = await readRawEnvelope();
    if (read.status === 'absent') {
      actor.send({ type: 'ENVELOPE_ABSENT' });
      if (!(await migrate())) {
        block('storage_ambiguous');
        return;
      }
      actor.send({ type: 'MIGRATION_PROVED' });
    } else if (read.status === 'valid') {
      envelope = read.envelope;
      if (!(await proveLegacyRetirement(read.envelope))) {
        block('storage_ambiguous');
        return;
      }
      if (!envelope) {
        return;
      }
      if (envelope.catalogFingerprint !== currentFingerprint) {
        const hasPending = envelope.pending !== null;
        const hasScan = envelope.scanAdmission !== null;
        const generationRoom = hasPending ? 5 : hasScan ? 3 : 2;
        const revisionRoom = hasPending ? 2 : 1;
        if (
          envelope.revision > MAX - revisionRoom ||
          envelope.generation > MAX - generationRoom ||
          envelope.nextIdentity >= MAX
        ) {
          block('actor_blocked');
          return;
        }
        if (hasPending) {
          actor.send({ type: 'PENDING_FOUND' });
          if (!(await recoverPending(true))) {
            block('storage_ambiguous');
            return;
          }
        } else if (hasScan) {
          actor.send({ type: 'OLD_CATALOG_SCAN_ADMISSION_FOUND' });
          if (!(await retireOldCatalogueScan())) {
            actor.send({ type: 'OLD_SCAN_RESULT_UNKNOWN' });
            block('actor_blocked');
            return;
          }
        } else {
          actor.send({ type: 'OLD_CATALOG_OUTBOX_OR_CONFIRMED_FOUND' });
        }
        if (!envelope) {
          return;
        }
        const historicalCatalogue = catalogueFor(envelope.catalogFingerprint);
        if (!historicalCatalogue) {
          block('actor_blocked');
          return;
        }
        const migratedSettings = normalizeReleaseSettings(
          envelope.confirmed.settings,
          catalogueIds(historicalCatalogue.tuples, false),
          catalogueIds(currentCatalogue.tuples, true)
        );
        if (!migratedSettings) {
          block('actor_blocked');
          return;
        }
        const commandId = `settings-release:${envelope.installId}:${envelope.nextIdentity}:command`;
        const migrated: SettingsReleaseEnvelopeV1 = {
          ...cloneEnvelope(envelope),
          nextIdentity: envelope.nextIdentity + 1,
          revision: envelope.revision + 1,
          generation: envelope.generation + 1,
          catalogFingerprint: currentFingerprint,
          confirmed: { ...envelope.confirmed, settings: migratedSettings },
          outcomes: [],
          outbox: {
            broadcastId: `${commandId}:broadcast`,
            commandId,
            reason: 'catalog_migration',
            snapshot: {
              settings: migratedSettings,
              onboardingCompleted: envelope.confirmed.onboardingCompleted,
              revision: envelope.revision + 1,
              generation: envelope.generation + 1,
            },
          },
        };
        if ((await writeExact(envelope, migrated)) !== 'committed') {
          block('storage_ambiguous');
          return;
        }
        envelope = migrated;
        actor.send({ type: 'CURRENT_CATALOG_OUTBOX_PROVED' });
        if (!(await reconcileAlarm(expectedAutoScanAlarm(migrated.confirmed)))) {
          block('storage_ambiguous');
          return;
        }
        actor.send({ type: 'ALARM_PROVED_WITH_OUTBOX' });
      } else if (envelope.pending) {
        actor.send({ type: 'PENDING_FOUND' });
        if (!(await recoverPending())) {
          block('storage_ambiguous');
          return;
        }
      } else if (envelope.scanAdmission) {
        actor.send({ type: 'SCAN_ADMISSION_FOUND' });
        if (!(await recoverScan())) {
          block('actor_blocked');
          return;
        }
      } else if (envelope.outbox) {
        actor.send({ type: 'OUTBOX_FOUND' });
      } else {
        actor.send({ type: 'CONFIRMED_FOUND' });
      }
    } else {
      block('storage_ambiguous');
      return;
    }

    if (envelope?.outbox && !(await publishAndClear())) {
      return;
    }
    if (!envelope) {
      block('storage_ambiguous');
      return;
    }
    if (actor.getSnapshot().value === 'broadcasting') {
      return;
    }
    if (actor.getSnapshot().value !== 'reconciling') {
      // Catalogue migration/outbox clear and recovery all converge here.
      if (actor.getSnapshot().value === 'ready') {
        return;
      }
      block('actor_blocked');
      return;
    }
    if (!(await reconcileAlarm(expectedAutoScanAlarm(envelope.confirmed)))) {
      block('storage_ambiguous');
      return;
    }
    actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
  }

  function ensureBoot(): Promise<void> {
    bootPromise ??= bootInternal().finally(() => {
      bootSettled = true;
    });
    return bootPromise;
  }

  async function enqueue<T>(work: () => Promise<T>, overflow: T): Promise<T> {
    const limit = bootSettled ? SETTINGS_RELEASE_QUEUE_LIMIT : SETTINGS_RELEASE_STARTUP_QUEUE_LIMIT;
    if (queued >= limit) {
      return overflow;
    }
    queued += 1;
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await ensureBoot();
      return await work();
    } finally {
      queued -= 1;
      release();
    }
  }

  async function read(): Promise<SettingsReleaseReadResult> {
    return enqueue<SettingsReleaseReadResult>(
      async () => {
        if (blockedReason || !envelope || actor.getSnapshot().value !== 'ready') {
          return {
            status: 'unavailable',
            reason: blockedReason ?? 'actor_blocked',
            snapshot: null,
          };
        }
        if (!(await proveCurrentEnvelope())) {
          return { status: 'unavailable', reason: 'storage_ambiguous', snapshot: null };
        }
        actor.send({ type: 'READ_REQUESTED' });
        return { status: 'confirmed', snapshot: settingsReleaseSnapshot(envelope) };
      },
      {
        status: 'transport_rejected',
        reason: 'queue_full',
        commandType: 'read',
        correlationId: null,
        snapshot: null,
      }
    );
  }

  async function mutateInternal(
    intent: SettingsReleaseMutationIntent
  ): Promise<SettingsReleaseMutationResult> {
    if (blockedReason || !envelope || actor.getSnapshot().value !== 'ready') {
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId: null,
        reason: 'actor_blocked',
        snapshot: null,
      };
    }
    if (!(await proveCurrentEnvelope())) {
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId: null,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }
    if (
      !isReleaseUuid(intent.requestId) ||
      !Number.isSafeInteger(intent.baseRevision) ||
      intent.baseRevision < 0
    ) {
      block('actor_blocked');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId: null,
        reason: 'request_identity_conflict',
        snapshot: null,
      };
    }
    if (intent.kind === 'save_settings') {
      const normalized = normalizeReleaseSettings(
        intent.settings,
        catalogueIds(currentCatalogue?.tuples ?? [], false),
        catalogueIds(currentCatalogue?.tuples ?? [], true)
      );
      if (!normalized || !sameSettings(normalized, intent.settings)) {
        block('actor_blocked');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId: null,
          reason: 'request_identity_conflict',
          snapshot: null,
        };
      }
    }
    const digest = await settingsReleaseIntentDigest(intent);
    const retained = envelope.outcomes.find((outcome) => outcome.requestId === intent.requestId);
    if (retained) {
      if (retained.intentDigest !== digest) {
        block('actor_blocked');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId: retained.commandId,
          reason: 'request_identity_conflict',
          snapshot: null,
        };
      }
      actor.send({ type: 'DUPLICATE_REQUEST' });
      return { status: 'settled', outcome: structuredClone(retained) };
    }
    const snapshot = settingsReleaseSnapshot(envelope);
    if (intent.baseRevision !== envelope.revision) {
      return {
        status: 'not_admitted',
        requestId: intent.requestId,
        commandId: null,
        reason: 'conflict',
        snapshot,
      };
    }
    const candidate =
      intent.kind === 'save_settings'
        ? {
            settings: structuredClone(intent.settings),
            onboardingCompleted: envelope.confirmed.onboardingCompleted,
          }
        : {
            settings: structuredClone(envelope.confirmed.settings),
            onboardingCompleted: intent.targetConsent,
          };
    if (
      sameSettings(candidate.settings, envelope.confirmed.settings) &&
      candidate.onboardingCompleted === envelope.confirmed.onboardingCompleted
    ) {
      return {
        status: 'not_admitted',
        requestId: intent.requestId,
        commandId: null,
        reason: 'already_confirmed',
        snapshot,
      };
    }
    const initialPermission = await permissionProofForNew(
      envelope.confirmed.settings.enabledConnectors,
      candidate.settings.enabledConnectors,
      currentCatalogue?.tuples ?? []
    );
    if (initialPermission !== true) {
      return {
        status: 'not_admitted',
        requestId: intent.requestId,
        commandId: null,
        reason: initialPermission === false ? 'permission_missing' : 'permission_unknown',
        snapshot,
      };
    }
    if (envelope.generation > MAX - 5 || envelope.revision >= MAX || envelope.nextIdentity >= MAX) {
      actor.send({ type: 'MUTATION_ADMITTED' });
      actor.send({ type: 'IDENTITY_EXHAUSTED' });
      block('actor_blocked');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId: null,
        reason: 'identity_exhausted',
        snapshot: null,
      };
    }
    actor.send({ type: 'MUTATION_ADMITTED' });
    const previous = cloneEnvelope(envelope);
    const identity = previous.nextIdentity;
    const commandId = `settings-release:${previous.installId}:${identity}:command`;
    const reserved: SettingsReleaseEnvelopeV1 = {
      ...cloneEnvelope(previous),
      nextIdentity: identity + 1,
      generation: previous.generation + 1,
      pending: {
        commandId,
        requestId: intent.requestId,
        intentDigest: digest,
        kind: intent.kind,
        baseRevision: intent.baseRevision,
        previous: structuredClone(previous.confirmed),
        candidate,
        previousAlarm: expectedAutoScanAlarm(previous.confirmed),
        candidateAlarm: expectedAutoScanAlarm(candidate),
        phase: 'reserved',
        compensationReason: null,
      },
    };
    const reserveResult = await writeExact(previous, reserved);
    if (reserveResult === 'previous') {
      actor.send({ type: 'RESERVATION_NOT_COMMITTED' });
      envelope = previous;
      return {
        status: 'not_admitted',
        requestId: intent.requestId,
        commandId: null,
        reason: 'storage_failed',
        snapshot,
      };
    }
    if (reserveResult !== 'committed') {
      actor.send({ type: 'RESERVATION_AMBIGUOUS' });
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }
    envelope = reserved;
    actor.send({ type: 'IDENTITY_RESERVED' });
    const reservedPending = reserved.pending;
    if (!reservedPending) {
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }

    const afterReservePermission = await permissionProofForNew(
      reservedPending.previous.settings.enabledConnectors,
      reservedPending.candidate.settings.enabledConnectors,
      currentCatalogue?.tuples ?? []
    );
    if (afterReservePermission !== true) {
      const outcome = await settle(
        reserved,
        reservedPending.previous,
        'not_committed',
        afterReservePermission === false ? 'permission_missing' : 'permission_unknown'
      );
      if (!outcome) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'POST_RESERVATION_SETTLEMENT_PROVED' });
      if (!(await publishAndClear())) {
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'broadcast_ambiguous',
          snapshot: null,
        };
      }
      if (!envelope || !(await reconcileAlarm(expectedAutoScanAlarm(envelope.confirmed)))) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
      return { status: 'settled', outcome };
    }

    const prepared: SettingsReleaseEnvelopeV1 = {
      ...cloneEnvelope(reserved),
      generation: reserved.generation + 1,
      pending: { ...reservedPending, phase: 'prepared', compensationReason: null },
    };
    const prepareResult = await writeExact(reserved, prepared);
    if (prepareResult === 'previous') {
      const outcome = await settle(
        reserved,
        reservedPending.previous,
        'not_committed',
        'storage_failed'
      );
      if (!outcome) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'POST_RESERVATION_SETTLEMENT_PROVED' });
      if (!(await publishAndClear())) {
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'broadcast_ambiguous',
          snapshot: null,
        };
      }
      if (!envelope || !(await reconcileAlarm(expectedAutoScanAlarm(envelope.confirmed)))) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
      return { status: 'settled', outcome };
    }
    if (prepareResult !== 'committed') {
      actor.send({ type: 'PREPARE_AMBIGUOUS' });
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }
    envelope = prepared;
    actor.send({ type: 'PREPARE_PROVED' });
    const preparedPending = prepared.pending;
    if (!preparedPending) {
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }

    const alarmProved = await reconcileAlarm(preparedPending.candidateAlarm);
    const finalPermission = await permissionProofForNew(
      preparedPending.previous.settings.enabledConnectors,
      preparedPending.candidate.settings.enabledConnectors,
      currentCatalogue?.tuples ?? []
    );
    if (!alarmProved || finalPermission !== true) {
      actor.send({ type: 'EFFECT_OR_PERMISSION_FAILED' });
      const compensationReason =
        finalPermission !== true ? 'permission_lost' : 'effect_compensated';
      const compensating: SettingsReleaseEnvelopeV1 = {
        ...cloneEnvelope(prepared),
        generation: prepared.generation + 1,
        pending: {
          ...preparedPending,
          phase: 'compensating',
          compensationReason,
        },
      };
      const compensatingPending = compensating.pending;
      if (!compensatingPending) {
        actor.send({ type: 'COMPENSATION_AMBIGUOUS' });
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      if (
        (await writeExact(prepared, compensating)) !== 'committed' ||
        !(await reconcileAlarm(compensatingPending.previousAlarm))
      ) {
        actor.send({ type: 'COMPENSATION_AMBIGUOUS' });
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'effect_ambiguous',
          snapshot: null,
        };
      }
      const outcome = await settle(
        compensating,
        compensatingPending.previous,
        'compensated',
        compensationReason
      );
      if (!outcome) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'COMPENSATION_PROVED' });
      if (!(await publishAndClear())) {
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'broadcast_ambiguous',
          snapshot: null,
        };
      }
      if (!envelope || !(await reconcileAlarm(expectedAutoScanAlarm(envelope.confirmed)))) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
      return { status: 'settled', outcome };
    }
    actor.send({ type: 'EFFECT_AND_PERMISSION_PROVED' });
    const effectProved: SettingsReleaseEnvelopeV1 = {
      ...cloneEnvelope(prepared),
      generation: prepared.generation + 1,
      pending: { ...preparedPending, phase: 'effect_proved', compensationReason: null },
    };
    if ((await writeExact(prepared, effectProved)) !== 'committed') {
      actor.send({ type: 'COMMIT_AMBIGUOUS' });
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }
    envelope = effectProved;
    const settlement = await settleAttempt(effectProved, candidate, 'committed', 'committed');
    if (settlement.status === 'previous') {
      actor.send({ type: 'COMMIT_REJECTED_WITH_PENDING_READBACK' });
      envelope = effectProved;
      if (!(await recoverPending())) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      const recoveredOutcome = envelope?.outcomes.find(
        (candidateOutcome) => candidateOutcome.requestId === intent.requestId
      );
      if (!recoveredOutcome || !envelope) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      if (!(await reconcileAlarm(expectedAutoScanAlarm(envelope.confirmed)))) {
        block('storage_ambiguous');
        return {
          status: 'blocked',
          requestId: intent.requestId,
          commandId,
          reason: 'storage_ambiguous',
          snapshot: null,
        };
      }
      actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
      return { status: 'settled', outcome: structuredClone(recoveredOutcome) };
    }
    if (settlement.status !== 'committed') {
      actor.send({ type: 'COMMIT_AMBIGUOUS' });
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }
    const outcome = settlement.outcome;
    actor.send({ type: 'COMMIT_PROVED' });
    if (!(await publishAndClear())) {
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'broadcast_ambiguous',
        snapshot: null,
      };
    }
    if (!envelope || !(await reconcileAlarm(expectedAutoScanAlarm(envelope.confirmed)))) {
      block('storage_ambiguous');
      return {
        status: 'blocked',
        requestId: intent.requestId,
        commandId,
        reason: 'storage_ambiguous',
        snapshot: null,
      };
    }
    actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
    return { status: 'settled', outcome };
  }

  async function mutate(
    intent: SettingsReleaseMutationIntent
  ): Promise<SettingsReleaseMutationResult> {
    return enqueue(() => mutateInternal(intent), {
      status: 'transport_rejected',
      reason: 'queue_full',
      commandType: 'mutation',
      correlationId: intent.requestId,
      snapshot: null,
    } satisfies SettingsReleaseMutationResult);
  }

  async function admitAutoScanInternal(scheduledTimeMs: number): Promise<SettingsScanDisposition> {
    if (
      blockedReason ||
      !envelope ||
      actor.getSnapshot().value !== 'ready' ||
      !Number.isSafeInteger(scheduledTimeMs) ||
      scheduledTimeMs < 0
    ) {
      return { status: 'blocked', reason: 'protocol_unknown' };
    }
    if (!(await proveCurrentEnvelope())) {
      return { status: 'blocked', reason: 'protocol_unknown' };
    }
    const snapshot = settingsReleaseSnapshot(envelope);
    const expectation = expectedAutoScanAlarm(envelope.confirmed);
    if ('absent' in expectation || !(await reconcileAlarm(expectation))) {
      return { status: 'skipped', reason: 'catalog_changed' };
    }
    const permission = await permissionProofForNew(
      [],
      snapshot.settings.enabledConnectors,
      currentCatalogue?.tuples ?? []
    );
    if (permission === false) {
      return { status: 'skipped', reason: 'permission_missing' };
    }
    if (permission !== true) {
      return { status: 'blocked', reason: 'protocol_unknown' };
    }
    if (envelope.generation > MAX - 3 || envelope.nextIdentity >= MAX) {
      block('actor_blocked');
      return { status: 'blocked', reason: 'identity_error' };
    }
    actor.send({ type: 'AUTO_SCAN_FIRED' });
    const previous = cloneEnvelope(envelope);
    const identity = previous.nextIdentity;
    const token = `settings-release:${previous.installId}:${identity}:scan`;
    const digest = await settingsReleaseScanDigest(snapshot);
    const reservedScanAdmission: NonNullable<SettingsReleaseEnvelopeV1['scanAdmission']> = {
      identity,
      token,
      snapshot,
      snapshotDigest: digest,
      phase: 'reserved',
      result: null,
    };
    const reserved: SettingsReleaseEnvelopeV1 = {
      ...cloneEnvelope(previous),
      nextIdentity: identity + 1,
      generation: previous.generation + 1,
      scanAdmission: reservedScanAdmission,
    };
    if ((await writeExact(previous, reserved)) !== 'committed') {
      actor.send({ type: 'SCAN_PROOF_AMBIGUOUS' });
      block('storage_ambiguous');
      return { status: 'blocked', reason: 'protocol_unknown' };
    }
    envelope = reserved;
    let raw: unknown;
    try {
      raw = await withScanPortDeadline(
        ports.scan.tryAdmit({
          token,
          identity,
          snapshot,
          snapshotDigest: digest,
          scanAckThrough: previous.scanAckThrough,
        })
      );
    } catch (error) {
      actor.send({ type: 'SCAN_ADMISSION_TIMEOUT' });
      block('actor_blocked');
      return {
        status: 'blocked',
        reason:
          error instanceof Error && error.message === 'settings release scan port timeout'
            ? 'timeout'
            : 'protocol_unknown',
      };
    }
    const result = parseScanResult(raw, previous.installId, identity);
    if (!result || result.status === 'not_found' || result.status === 'retired') {
      actor.send({ type: 'SCAN_PROOF_AMBIGUOUS' });
      block('actor_blocked');
      return { status: 'blocked', reason: 'protocol_unknown' };
    }
    let current = reserved;
    if (result.status === 'accepted') {
      const accepted: SettingsReleaseEnvelopeV1 = {
        ...cloneEnvelope(reserved),
        generation: reserved.generation + 1,
        scanAdmission: { ...reservedScanAdmission, phase: 'accepted', result },
      };
      if ((await writeExact(reserved, accepted)) !== 'committed') {
        actor.send({ type: 'SCAN_PROOF_AMBIGUOUS' });
        block('storage_ambiguous');
        return { status: 'blocked', reason: 'protocol_unknown' };
      }
      current = accepted;
    }
    const cleared: SettingsReleaseEnvelopeV1 = {
      ...cloneEnvelope(current),
      generation: current.generation + 1,
      scanAckThrough: identity,
      scanAdmission: null,
    };
    if ((await writeExact(current, cleared)) !== 'committed') {
      actor.send({ type: 'SCAN_PROOF_AMBIGUOUS' });
      block('storage_ambiguous');
      return { status: 'blocked', reason: 'protocol_unknown' };
    }
    envelope = cleared;
    actor.send({ type: result.status === 'accepted' ? 'SCAN_ADMITTED' : 'SCAN_SKIPPED' });
    return result;
  }

  async function admitAutoScan(scheduledTimeMs: number): Promise<SettingsScanDisposition> {
    return enqueue(() => admitAutoScanInternal(scheduledTimeMs), {
      status: 'transport_rejected',
      reason: 'queue_full',
      commandType: 'auto_scan_fire',
      correlationId: `auto-scan:${scheduledTimeMs}`,
      snapshot: null,
    });
  }

  async function retry(): Promise<{
    status: 'retry_accepted' | 'retry_already_queued' | 'retry_not_applicable';
    snapshot: null;
  }> {
    if (actor.getSnapshot().value !== 'blocked') {
      return { status: 'retry_not_applicable', snapshot: null };
    }
    if (retryQueued) {
      return { status: 'retry_already_queued', snapshot: null };
    }
    retryQueued = true;
    actor.send({ type: 'EXPLICIT_RETRY_REQUESTED' });
    bootPromise = null;
    bootSettled = false;
    envelope = null;
    void ensureBoot().finally(() => {
      retryQueued = false;
    });
    return { status: 'retry_accepted', snapshot: null };
  }

  return { boot: ensureBoot, read, mutate, admitAutoScan, retry };
}
