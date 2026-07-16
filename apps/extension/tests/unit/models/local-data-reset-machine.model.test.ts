import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  BACKGROUND_SCHEDULING_HANDOFF_KEY,
  BACKGROUND_SCHEDULING_HANDOFF_MAX_PAYLOAD_ENCODED_BYTES,
  BACKGROUND_SCHEDULING_HANDOFF_MAX_SIDECAR_ENCODED_BYTES,
  BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA,
  BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT,
  LOCAL_DATA_RESET_EMPTY_STORES,
  LOCAL_DATA_RESET_JOURNAL_KEY,
  LOCAL_DATA_RESET_LOCAL_CLEAR_PRESERVED_KEYS,
  acquireResetFence,
  advanceBackgroundSchedulingHandoffCasCursorAfterFailure,
  advanceBackgroundSchedulingHandoffMaterialization,
  backgroundSchedulingHandoffSidecarEncodedBytes,
  backgroundSchedulingHandoffBundleDigest,
  backgroundSchedulingSha256Hex,
  deriveBackgroundSchedulingHandoffCapabilityManifestFacts,
  deriveBackgroundSchedulingHandoffPayloadFacts,
  isFreshResetSettingsEnvelope,
  issueBackgroundSchedulingHandoffReplacementLane,
  parseBackgroundSchedulingHandoffCheckpointProof,
  parseBackgroundSchedulingHandoffClearProof,
  parseBackgroundSchedulingHandoffReference,
  parseBackgroundSchedulingHandoffSidecar,
  parseLocalDataResetFreshPreflightProof,
  parseLocalDataResetAdmissionOpenedProof,
  parseLocalDataResetInitialDatabaseProof,
  parseLocalDataResetJournal,
  parseLocalDataResetPostClearCompletionProof,
  parseLocalDataResetReceipt,
  parseResetOwnedSettingsAlignmentProof,
  rehydrateResetPreAdmission,
  settingsResetRecoveryCommandId,
  type LocalDataResetJournalV1,
  type LocalDataResetPostClearCompletionProofV1,
  type LocalDataResetProofExpectation,
  type LocalDataResetReceiptV1,
  type BackgroundSchedulingHandoffReferenceV1,
  type BackgroundSchedulingHandoffCapabilityManifestV1,
  type BackgroundSchedulingHandoffPayloadV1,
  type BackgroundSchedulingHandoffSidecarV1,
  type ResetOwnedSettingsAlignmentProofV1,
} from '../../../src/models/local-data-reset.contract';
import { parseLocalDataResetEpochEvent } from '../../../src/models/local-data-reset-epoch.contract';
import { localDataResetMachine } from '../../../src/models/local-data-reset.machine';
import {
  expectedAlarm,
  settingsDigest,
  type SettingsEnvelopeV2,
} from '../../../src/models/settings-persistence.contract';

const uuid = (suffix: number): string =>
  `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const INCLUDED_CONNECTORS = ['free-work'];
const RESET_ID = uuid(1);
const PREVIOUS_EPOCH = uuid(2);
const NEXT_EPOCH = uuid(3);
const SETTINGS_RECOVERY_REQUEST_ID = uuid(4);
const SETTINGS_BOOTSTRAP_REQUEST_ID = uuid(5);
const REQUESTED_AT = 42;
const SIDECAR_ID = uuid(40);
const HANDOFF_ID = uuid(41);
const SOURCE_WORKER_EPOCH = uuid(42);
const ADOPTING_WORKER_EPOCH = uuid(43);
const JOURNAL_PROOF_ID = uuid(44);
const CONTROL_LANE_ID = uuid(45);
const REPLACEMENT_LANE_ID = uuid(46);
const REPLACEMENT_WORKER_EPOCH = uuid(47);

function capabilityManifest(
  sidecarId = SIDECAR_ID,
  handoffId = HANDOFF_ID
): BackgroundSchedulingHandoffCapabilityManifestV1 {
  return {
    version: 1,
    sidecarId,
    handoffId,
    entries: Array.from({ length: 1_587 }, (_, index) => {
      const cleanup = index >= 1_584;
      const controlAttemptIndex = cleanup ? null : (Math.floor(index / (132 * 3)) as 0 | 1 | 2 | 3);
      const controlAttemptOffset = cleanup ? index - 1_584 : index % (132 * 3);
      const transitionIndex = cleanup ? 132 : Math.floor(controlAttemptOffset / 3);
      const casAttempt = (controlAttemptOffset % 3) as 0 | 1 | 2;
      const kind = cleanup
        ? ('sidecar_cleanup' as const)
        : transitionIndex === 0
          ? ('sidecar_initialize' as const)
          : ('slot_materialize' as const);
      const commandId = uuid(1_000 + index * 3);
      const resultId = uuid(1_001 + index * 3);
      const capabilityId = uuid(1_002 + index * 3);
      return {
        kind,
        controlAttemptIndex,
        transitionIndex,
        casAttempt,
        commandId,
        resultId,
        capabilityId,
        bundleDigest: backgroundSchedulingHandoffBundleDigest({
          sidecarId,
          handoffId,
          kind,
          controlAttemptIndex,
          transitionIndex,
          casAttempt,
          commandId,
          resultId,
          capabilityId,
        }),
      };
    }),
  };
}

const BASE_MANIFEST_FACTS =
  deriveBackgroundSchedulingHandoffCapabilityManifestFacts(capabilityManifest());
if (BASE_MANIFEST_FACTS === null) {
  throw new Error('invalid base capability manifest fixture');
}

const request = {
  type: 'RESET_REQUESTED' as const,
  resetId: RESET_ID,
  previousDataEpoch: PREVIOUS_EPOCH,
  nextDataEpoch: NEXT_EPOCH,
  settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
  settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
  requestedAt: REQUESTED_AT,
};

const proofExpectation: LocalDataResetProofExpectation = {
  resetId: RESET_ID,
  previousDataEpoch: PREVIOUS_EPOCH,
  nextDataEpoch: NEXT_EPOCH,
  settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
  settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
  requestedAt: REQUESTED_AT,
  defaultSettings: DEFAULT_SETTINGS,
  includedConnectorIds: INCLUDED_CONNECTORS,
};

function createResetActor(workerEpoch = SOURCE_WORKER_EPOCH) {
  const actor = createActor(localDataResetMachine, {
    input: {
      workerEpoch,
      defaultSettings: DEFAULT_SETTINGS,
      includedConnectorIds: INCLUDED_CONNECTORS,
    },
  });
  actor.start();
  return actor;
}

type ResetActor = ReturnType<typeof createResetActor>;

function expectActiveState(actor: ResetActor, state: string): void {
  expect(actor.getSnapshot().matches({ active: state })).toBe(true);
}

function freshPreflightProof() {
  return {
    version: 1,
    result: 'fresh' as const,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    requestedAt: REQUESTED_AT,
    resetJournalAbsent: true as const,
    backgroundSchedulingHandoffAbsent: true as const,
    canonicalDataEpoch: PREVIOUS_EPOCH,
  };
}

function handoffPayload(): BackgroundSchedulingHandoffPayloadV1 {
  const targetSlots = Array.from({ length: BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT }, () => null);
  return {
    schemaVersion: 1,
    payloadSchema: BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA,
    sidecarId: SIDECAR_ID,
    handoffId: HANDOFF_ID,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    sourceWorkerEpoch: SOURCE_WORKER_EPOCH,
    checkpointRevision: 0,
    handoffClosed: true,
    closedAtMailboxSequence: 7,
    lateCallbackPolicy: 'reject_reset_in_progress',
    controlLaneId: CONTROL_LANE_ID,
    controlLaneAttemptIndex: 0,
    capabilityManifest: BASE_MANIFEST_FACTS.manifest,
    capabilityManifestDigest: BASE_MANIFEST_FACTS.manifestDigest,
    connectorOrder: ['free-work'],
    frozenTargetDigest: backgroundSchedulingSha256Hex(JSON.stringify(targetSlots)),
    targetSlots,
    materializationCursor: BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT,
    casCursor: null,
    slots: [...targetSlots],
    writerTransfer: {
      version: 1,
      sourceWriterWorkerEpoch: SOURCE_WORKER_EPOCH,
      handoffRevision: 0,
      writerRevoked: true,
      activeLoadCommandId: null,
      activeCaptureCommandId: null,
      activeDrainCommandId: null,
      journalAtQuiescence: {
        version: 1,
        kind: 'absent',
        journalRevision: null,
        proofId: JOURNAL_PROOF_ID,
        absenceReadBackVerified: true,
      },
      complete: true,
    },
  };
}

function fullHandoffPayload(): BackgroundSchedulingHandoffPayloadV1 {
  const base = handoffPayload();
  const connectorOrder = Array.from(
    { length: 64 },
    (_, index) => `connector-${String(index).padStart(2, '0')}`
  );
  const slots = Array.from({ length: BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT }, (_, index) => {
    const connectorId =
      index >= 1 && index <= 64
        ? connectorOrder[index - 1]!
        : index >= 66 && index <= 129
          ? connectorOrder[index - 66]!
          : null;
    const slotKind =
      index === 0
        ? ('digest_first' as const)
        : index === 65
          ? ('digest_duplicate' as const)
          : index === 130
            ? ('auto_scan' as const)
            : index <= 64
              ? ('probe_first' as const)
              : ('probe_duplicate' as const);
    return {
      version: 1 as const,
      slotIndex: index,
      slotKind,
      alarmEventId: uuid(3_000 + index),
      name:
        slotKind === 'auto_scan'
          ? 'auto-scan'
          : connectorId === null
            ? 'daily-digest'
            : `probe:${connectorId}`,
      connectorId,
      firedAtMs: 1_000 + index,
      mailboxSequence: index,
      sourceWorkerEpoch: SOURCE_WORKER_EPOCH,
    };
  });
  return {
    ...base,
    checkpointRevision: 131,
    closedAtMailboxSequence: 131,
    connectorOrder,
    frozenTargetDigest: backgroundSchedulingSha256Hex(JSON.stringify(slots)),
    targetSlots: slots,
    materializationCursor: BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT,
    slots,
    writerTransfer: { ...base.writerTransfer, handoffRevision: 131 },
  };
}

function handoffSidecar(
  payload: BackgroundSchedulingHandoffPayloadV1 = handoffPayload()
): BackgroundSchedulingHandoffSidecarV1 {
  const facts = deriveBackgroundSchedulingHandoffPayloadFacts(payload);
  if (facts === null) {
    throw new Error('invalid handoff payload fixture');
  }
  return {
    schemaVersion: 1,
    storageKey: BACKGROUND_SCHEDULING_HANDOFF_KEY,
    payloadSchema: BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA,
    sidecarId: facts.payload.sidecarId,
    handoffId: facts.payload.handoffId,
    resetId: facts.payload.resetId,
    previousDataEpoch: facts.payload.previousDataEpoch,
    sourceWorkerEpoch: facts.payload.sourceWorkerEpoch,
    checkpointRevision: facts.payload.checkpointRevision,
    slotBitmap: facts.slotBitmap,
    slotCount: facts.slotCount,
    writerTransferDigest: facts.writerTransferDigest,
    journalAtQuiescenceDigest: facts.journalAtQuiescenceDigest,
    payloadDigest: facts.payloadDigest,
    payloadEncodedBytes: facts.payloadEncodedBytes,
    payload: facts.payload,
  };
}

function handoffReference(
  sidecar: BackgroundSchedulingHandoffSidecarV1 = handoffSidecar()
): BackgroundSchedulingHandoffReferenceV1 {
  const manifestFacts =
    sidecar.payload.capabilityManifest === BASE_MANIFEST_FACTS.manifest
      ? BASE_MANIFEST_FACTS
      : deriveBackgroundSchedulingHandoffCapabilityManifestFacts(
          sidecar.payload.capabilityManifest
        );
  if (manifestFacts === null) {
    throw new Error('invalid capability manifest fixture');
  }
  return {
    schemaVersion: 1,
    storageKey: BACKGROUND_SCHEDULING_HANDOFF_KEY,
    sidecarId: sidecar.sidecarId,
    handoffId: sidecar.handoffId,
    resetId: sidecar.resetId,
    checkpointRevision: sidecar.checkpointRevision,
    slotCount: sidecar.slotCount,
    payloadDigest: sidecar.payloadDigest,
    sourceControlLaneId: sidecar.payload.controlLaneId,
    sourceControlLaneAttemptIndex: sidecar.payload.controlLaneAttemptIndex,
    sourceWorkerEpoch: sidecar.sourceWorkerEpoch,
    capabilityManifestDigest: manifestFacts.manifestDigest,
    cleanupRecovery: manifestFacts.cleanupRecovery,
    sidecarEncodedBytes: backgroundSchedulingHandoffSidecarEncodedBytes(sidecar),
  };
}

function frozenProvenance(sidecar: BackgroundSchedulingHandoffSidecarV1 = handoffSidecar()) {
  return {
    version: 1,
    laneId: sidecar.payload.controlLaneId,
    attemptIndex: sidecar.payload.controlLaneAttemptIndex,
    sourceWorkerEpoch: sidecar.sourceWorkerEpoch,
    sidecarId: sidecar.sidecarId,
    handoffId: sidecar.handoffId,
    capabilityManifest: sidecar.payload.capabilityManifest,
    capabilityManifestDigest: sidecar.payload.capabilityManifestDigest,
    frozenTargetDigest: sidecar.payload.frozenTargetDigest,
    frozenAtMailboxSequence: sidecar.payload.closedAtMailboxSequence,
  };
}

function handoffExpectation(sidecar: BackgroundSchedulingHandoffSidecarV1 = handoffSidecar()) {
  return {
    version: 1 as const,
    resetId: sidecar.resetId,
    previousDataEpoch: sidecar.previousDataEpoch,
    sourceControlLaneId: sidecar.payload.controlLaneId,
    sourceControlLaneAttemptIndex: sidecar.payload.controlLaneAttemptIndex,
    sourceWorkerEpoch: sidecar.sourceWorkerEpoch,
    sidecarId: sidecar.sidecarId,
    handoffId: sidecar.handoffId,
    capabilityManifestDigest: sidecar.payload.capabilityManifestDigest,
  };
}

function handoffCheckpointProof(sidecar: BackgroundSchedulingHandoffSidecarV1 = handoffSidecar()) {
  return {
    version: 1,
    kind: 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED' as const,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    reference: handoffReference(sidecar),
    sidecar,
    frozenProvenance: frozenProvenance(sidecar),
    sidecarIdPreallocatedBeforeWorkAdmission: true as const,
    readBackVerified: true as const,
  };
}

function sessionClearProof() {
  return {
    version: 1,
    kind: 'RESET_SESSION_CLEARED_WITH_HANDOFF_PRESERVED' as const,
    resetId: RESET_ID,
    storageArea: 'chrome.storage.session' as const,
    reference: handoffReference(),
    sidecarReadBack: handoffSidecar(),
    sessionClearReadBackVerified: true as const,
  };
}

function localClearProof() {
  return {
    version: 1,
    kind: 'RESET_LOCAL_CLEARED_WITH_ALLOWLIST' as const,
    resetId: RESET_ID,
    storageArea: 'chrome.storage.local' as const,
    preservedKeys: [...LOCAL_DATA_RESET_LOCAL_CLEAR_PRESERVED_KEYS],
    reference: handoffReference(),
    sidecarReadBack: handoffSidecar(),
    journalKey: LOCAL_DATA_RESET_JOURNAL_KEY,
    removedKeyCount: 7,
    readBackVerified: true as const,
  };
}

function handoffAdoptionProof() {
  const reference = handoffReference();
  return {
    version: 1,
    kind: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED' as const,
    resetId: RESET_ID,
    reference,
    adoptingWorkerEpoch: ADOPTING_WORKER_EPOCH,
    adoptedSlotCount: reference.slotCount,
    adoptionReadBackVerified: true as const,
    sidecarStillPresent: true as const,
    journalCheckpointReadBackVerified: true as const,
  };
}

function replacementLaneReceipt(
  replacementWorkerEpoch = REPLACEMENT_WORKER_EPOCH,
  replacementLaneId = REPLACEMENT_LANE_ID,
  identityBase = 7_500
) {
  const reference = handoffReference();
  return issueBackgroundSchedulingHandoffReplacementLane({
    resetId: RESET_ID,
    reference,
    replacementWorkerEpoch,
    replacementLaneId,
    commandId: uuid(identityBase),
    resultId: uuid(identityBase + 1),
    receiptId: uuid(identityBase + 2),
    cleanupTokenIds: [uuid(identityBase + 3), uuid(identityBase + 4), uuid(identityBase + 5)],
    previousAuthorityRevision: 20,
  });
}

function handoffClearProof(
  cleanupCasAttempt: 0 | 1 | 2 = 0,
  replacement = false,
  disposition: 'removed' | 'already_absent' = 'removed',
  replacementReceiptOverride?: NonNullable<ReturnType<typeof replacementLaneReceipt>>
) {
  const reference = handoffReference();
  const cleanupBundle = reference.cleanupRecovery.bundles[cleanupCasAttempt];
  const replacementReceipt = replacement
    ? (replacementReceiptOverride ?? replacementLaneReceipt())
    : null;
  if (replacement && replacementReceipt === null) {
    throw new Error('invalid replacement lane receipt fixture');
  }
  return {
    version: 1,
    kind: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED' as const,
    resetId: RESET_ID,
    reference,
    cleanupExecution: {
      version: 1,
      disposition,
      executionLaneId: replacement ? REPLACEMENT_LANE_ID : reference.sourceControlLaneId,
      executingWorkerEpoch: replacement ? REPLACEMENT_WORKER_EPOCH : reference.sourceWorkerEpoch,
      cleanupCasAttempt,
      cleanupCapabilityId: cleanupBundle.capabilityId,
      cleanupBundleDigest: cleanupBundle.bundleDigest,
      replacementLaneReceipt: replacementReceipt,
      cleanupToken: replacementReceipt?.cleanupTokens[cleanupCasAttempt] ?? null,
    },
    absenceReadBackVerified: true as const,
    journalCheckpointReadBackVerified: true as const,
  };
}

function settingsEnvelope(generation: number): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: NEXT_EPOCH,
    revision: 0,
    generation,
    settings: { ...DEFAULT_SETTINGS, enabledConnectors: [...INCLUDED_CONNECTORS] },
    journal: null,
    outcomes: [],
  };
}

function initialDatabaseProof() {
  return {
    version: 1,
    databaseName: 'missionpulse' as const,
    dbVersion: 6,
    appDataVersion: 3,
    schemaVerified: true as const,
    dataEpoch: NEXT_EPOCH,
    trackingMeta: {
      key: 'tracking_meta' as const,
      schemaVersion: 1,
      dataEpoch: NEXT_EPOCH,
      collectionRevision: 0,
    },
    stores: LOCAL_DATA_RESET_EMPTY_STORES.map((name) => ({ name, rowCount: 0 as const })),
  };
}

function alignmentProof(generation: number): ResetOwnedSettingsAlignmentProofV1 {
  const currentEnvelope = settingsEnvelope(generation);
  const commandId = settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID);
  const alarm = expectedAlarm(currentEnvelope.settings);
  return {
    version: 1,
    resetId: RESET_ID,
    dataEpoch: NEXT_EPOCH,
    requestId: SETTINGS_RECOVERY_REQUEST_ID,
    commandId,
    resetPhase: 'database_reinitialized',
    envelope: currentEnvelope,
    alarmProof: {
      ...alarm,
      dataEpoch: NEXT_EPOCH,
      envelopeRevision: 0,
      envelopeGeneration: generation,
      settingsDigest: settingsDigest(DEFAULT_SETTINGS),
      proofId: uuid(10 + generation),
      requestId: SETTINGS_RECOVERY_REQUEST_ID,
      commandId,
    },
  };
}

function resetEpochPayload(stage: 'ready_to_commit' | 'committed') {
  return {
    version: 1,
    stage,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
  };
}

function receipt(resetId = RESET_ID): LocalDataResetReceiptV1 {
  return {
    schemaVersion: 1,
    resetId,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    requestedAt: REQUESTED_AT,
    phase: 'committed',
  };
}

function postClearProof(
  currentReceipt: LocalDataResetReceiptV1 = receipt(),
  collectionRevision = 29
): LocalDataResetPostClearCompletionProofV1 {
  return {
    version: 1,
    result: 'already_completed',
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    requestedAt: REQUESTED_AT,
    resetJournalAbsent: true,
    backgroundSchedulingHandoffAbsent: true,
    canonicalDataEpoch: NEXT_EPOCH,
    receipt: currentReceipt,
    authority: {
      version: 1,
      databaseName: 'missionpulse',
      dbVersion: 6,
      appDataVersion: 3,
      schemaVerified: true,
      dataEpoch: NEXT_EPOCH,
      trackingMeta: {
        key: 'tracking_meta',
        schemaVersion: 1,
        dataEpoch: NEXT_EPOCH,
        collectionRevision,
      },
    },
  };
}

function admissionOpenedProof() {
  return {
    version: 1,
    kind: 'RESET_EPOCH_ADMISSION_OPENED' as const,
    resetId: RESET_ID,
    dataEpoch: NEXT_EPOCH,
    authorityRevision: 1,
    admission: 'open' as const,
    proofId: uuid(31),
  };
}

function journalForPhase(phase: LocalDataResetJournalV1['phase']): LocalDataResetJournalV1 {
  return {
    schemaVersion: 1,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    phase,
    backgroundSchedulingHandoff: ['journaled', 'fenced'].includes(phase)
      ? null
      : handoffReference(),
    requestedAt: REQUESTED_AT,
    retryCount: 0,
    lastError: null,
  };
}

function rehydrationAuthorityFor(
  journal: LocalDataResetJournalV1,
  workerEpoch = SOURCE_WORKER_EPOCH
) {
  const previousDatabasePhases: LocalDataResetJournalV1['phase'][] = [
    'journaled',
    'fenced',
    'quiesced',
  ];
  const absentDatabasePhases: LocalDataResetJournalV1['phase'][] = [
    'handles_closed',
    'database_deleted',
    'session_cleared',
    'local_cleared',
  ];
  const database = previousDatabasePhases.includes(journal.phase)
    ? {
        kind: 'previous_epoch' as const,
        dataEpoch: PREVIOUS_EPOCH,
        readBackVerified: true as const,
      }
    : absentDatabasePhases.includes(journal.phase)
      ? { kind: 'absent' as const, absenceReadBackVerified: true as const }
      : {
          kind: 'next_epoch' as const,
          authority: postClearProof().authority,
          readBackVerified: true as const,
        };
  const handoff = ['journaled', 'fenced'].includes(journal.phase)
    ? { kind: 'not_checkpointed' as const, sidecarAbsent: true as const }
    : journal.phase === 'handoff_adopted'
      ? {
          kind: 'adopted_present' as const,
          reference: handoffReference(),
          sidecar: handoffSidecar(),
          adoption: handoffAdoptionProof(),
        }
      : journal.phase === 'handoff_cleared'
        ? {
            kind: 'cleared_absent' as const,
            reference: handoffReference(),
            absenceReadBackVerified: true as const,
            journalCheckpointReadBackVerified: true as const,
          }
        : {
            kind: 'checkpointed_present' as const,
            reference: handoffReference(),
            sidecar: handoffSidecar(),
          };
  return {
    version: 1 as const,
    journal,
    authorityRevision: 7,
    fenceRevision: 11,
    database,
    receipt: ['committed', 'handoff_adopted', 'handoff_cleared'].includes(journal.phase)
      ? receipt()
      : null,
    handoffExpectation: handoffExpectation(),
    handoff,
    replacementLaneReceipt:
      journal.backgroundSchedulingHandoff !== null &&
      journal.phase !== 'handoff_cleared' &&
      journal.backgroundSchedulingHandoff.sourceWorkerEpoch !== workerEpoch
        ? replacementLaneReceipt(workerEpoch, REPLACEMENT_LANE_ID, 7_500)
        : null,
  };
}

function acquiredFenceProof(
  journal: LocalDataResetJournalV1,
  workerEpoch: string,
  identitySuffix: number
) {
  const physicalAuthority = rehydrationAuthorityFor(journal, workerEpoch);
  const reservation = rehydrateResetPreAdmission({
    journal,
    physicalAuthority,
    workerEpoch,
    reservationId: uuid(identitySuffix),
  });
  if (reservation === null) {
    throw new Error('invalid reset rehydration fixture');
  }
  const proof = acquireResetFence({
    reservation,
    physicalAuthority,
    fenceProofId: uuid(identitySuffix + 1),
  });
  if (proof === null) {
    throw new Error('invalid reset fence fixture');
  }
  return proof;
}

function beginFreshReset(actor: ResetActor): void {
  actor.send(request);
  expectActiveState(actor, 'preflightingCompletion');
  actor.send({ type: 'RESET_PREFLIGHT_FRESH', resetId: RESET_ID, proof: freshPreflightProof() });
  expectActiveState(actor, 'journaling');
}

function advanceToAligningSettings(actor: ResetActor): void {
  beginFreshReset(actor);
  actor.send({ type: 'RESET_JOURNALED', resetId: RESET_ID });
  expectActiveState(actor, 'acquiringFence');
  actor.send({
    type: 'RESET_FENCE_AUTHORITY_ACQUIRED',
    resetId: RESET_ID,
    proof: acquiredFenceProof(journalForPhase('journaled'), SOURCE_WORKER_EPOCH, 6_900),
  });
  expectActiveState(actor, 'checkpointingFence');
  expect(actor.getSnapshot().context.backgroundSchedulingHandoffExpectation).toEqual(
    handoffExpectation()
  );
  actor.send({ type: 'FENCE_CHECKPOINTED', resetId: RESET_ID });
  expectActiveState(actor, 'quiescing');
  actor.send({ type: 'SCAN_QUIESCED', resetId: RESET_ID });
  actor.send({ type: 'TRACKING_QUIESCED', resetId: RESET_ID });
  actor.send({ type: 'MIGRATION_QUIESCED', resetId: RESET_ID });
  actor.send({ type: 'OUTBOX_QUIESCED', resetId: RESET_ID });
  expectActiveState(actor, 'quiescing');
  actor.send({
    type: 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED',
    resetId: RESET_ID,
    proof: handoffCheckpointProof(),
  });
  expectActiveState(actor, 'checkpointingQuiescence');
  actor.send({ type: 'QUIESCENCE_CHECKPOINTED', resetId: RESET_ID });
  expectActiveState(actor, 'closingDatabase');
  actor.send({ type: 'DB_HANDLES_CLOSED', resetId: RESET_ID });
  expectActiveState(actor, 'deletingDatabase');
  actor.send({ type: 'DATABASE_DELETED', resetId: RESET_ID });
  expectActiveState(actor, 'clearingSession');
  actor.send({ type: 'SESSION_CLEARED', resetId: RESET_ID, proof: sessionClearProof() });
  expectActiveState(actor, 'clearingLocal');
  actor.send({ type: 'LOCAL_CLEARED', resetId: RESET_ID, proof: localClearProof() });
  expectActiveState(actor, 'reinitializing');
  actor.send({
    type: 'DATABASE_REINITIALIZED',
    resetId: RESET_ID,
    dataEpoch: NEXT_EPOCH,
    databaseProof: initialDatabaseProof(),
    settingsEnvelope: settingsEnvelope(0),
  });
  expectActiveState(actor, 'aligningSettings');
}

function advanceToWritingReceipt(actor: ResetActor, generation = 0): void {
  advanceToAligningSettings(actor);
  actor.send({ type: 'SETTINGS_ALIGNED', resetId: RESET_ID, proof: alignmentProof(generation) });
  expectActiveState(actor, 'broadcastingReadiness');
  actor.send({
    type: 'RESET_READY_BROADCASTED',
    payload: resetEpochPayload('ready_to_commit'),
    delivery: 'delivered',
  });
  expectActiveState(actor, 'writingReceipt');
}

describe('local data reset model traces', () => {
  it('executes every nominal phase and persists the receipt before committed', () => {
    const actor = createResetActor();
    advanceToWritingReceipt(actor);

    actor.send({ type: 'RESET_COMMIT_CHECKPOINTED', resetId: RESET_ID });
    expectActiveState(actor, 'writingReceipt');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'settings_aligned',
      receiptPersisted: false,
      commitCheckpointed: false,
    });

    actor.send({ type: 'RESET_RECEIPT_WRITTEN', resetId: RESET_ID, receipt: receipt() });
    expectActiveState(actor, 'checkpointingCommit');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'settings_aligned',
      receiptPersisted: true,
      commitCheckpointed: false,
    });

    actor.send({
      type: 'RESET_COMMITTED_BROADCASTED',
      payload: resetEpochPayload('committed'),
      delivery: 'delivered',
    });
    expectActiveState(actor, 'checkpointingCommit');

    actor.send({ type: 'RESET_COMMIT_CHECKPOINTED', resetId: RESET_ID });
    expectActiveState(actor, 'broadcastingCommitted');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'committed',
      receiptPersisted: true,
      commitCheckpointed: true,
    });
    actor.send({
      type: 'RESET_COMMITTED_BROADCASTED',
      payload: resetEpochPayload('committed'),
      delivery: 'no_receiver',
    });
    expectActiveState(actor, 'adoptingBackgroundHandoff');
    actor.send({
      type: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED',
      resetId: RESET_ID,
      proof: handoffAdoptionProof(),
    });
    expectActiveState(actor, 'clearingBackgroundHandoff');
    actor.send({
      type: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED',
      resetId: RESET_ID,
      proof: handoffClearProof(),
    });
    expectActiveState(actor, 'clearingJournal');
    actor.send({ type: 'JOURNAL_CLEARED', resetId: RESET_ID });
    expectActiveState(actor, 'openingEpochAdmission');
    expect(actor.getSnapshot().status).toBe('active');
    actor.send({
      type: 'RESET_EPOCH_ADMISSION_OPENED',
      resetId: RESET_ID,
      proof: admissionOpenedProof(),
    });
    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'handoff_cleared',
      completionDisposition: 'executed',
      journalPersisted: false,
      fenceAcquired: false,
      admissionOpen: true,
      settingsAligned: true,
      receiptPersisted: true,
      commitCheckpointed: true,
    });
  });

  it('reacquires the live fence and resumes the exact durable phase after a crash', () => {
    const journal: LocalDataResetJournalV1 = {
      schemaVersion: 1,
      resetId: RESET_ID,
      previousDataEpoch: PREVIOUS_EPOCH,
      nextDataEpoch: NEXT_EPOCH,
      settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
      settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
      phase: 'database_deleted',
      backgroundSchedulingHandoff: handoffReference(),
      requestedAt: REQUESTED_AT,
      retryCount: 2,
      lastError: null,
    };
    const actor = createResetActor();
    actor.send({ type: 'SERVICE_WORKER_RESTARTED', journal });
    expectActiveState(actor, 'reacquiringFence');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'database_deleted',
      restartDisposition: 'resume',
      databaseDeleted: true,
      sessionCleared: false,
      fenceAcquired: false,
      retryCount: 2,
    });

    const fenceProof = acquiredFenceProof(journal, SOURCE_WORKER_EPOCH, 7_000);
    actor.send({
      type: 'BOOT_FENCE_ACQUIRED',
      resetId: RESET_ID,
      proof: { ...fenceProof },
    });
    expectActiveState(actor, 'reacquiringFence');
    actor.send({ type: 'BOOT_FENCE_ACQUIRED', resetId: RESET_ID, proof: fenceProof });
    expectActiveState(actor, 'clearingSession');
    expect(actor.getSnapshot().context.fenceAcquired).toBe(true);

    actor.send({ type: 'SESSION_CLEARED', resetId: RESET_ID, proof: sessionClearProof() });
    expectActiveState(actor, 'clearingLocal');
    actor.send({ type: 'LOCAL_CLEARED', resetId: RESET_ID, proof: localClearProof() });
    expectActiveState(actor, 'reinitializing');
  });

  it('rehydrates cleanup after adoption and treats handoff-cleared restart as idempotent', () => {
    const journalAt = (phase: 'handoff_adopted' | 'handoff_cleared'): LocalDataResetJournalV1 => ({
      schemaVersion: 1,
      resetId: RESET_ID,
      previousDataEpoch: PREVIOUS_EPOCH,
      nextDataEpoch: NEXT_EPOCH,
      settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
      settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
      phase,
      backgroundSchedulingHandoff: handoffReference(),
      requestedAt: REQUESTED_AT,
      retryCount: 0,
      lastError: null,
    });

    for (const cleanupCasAttempt of [0, 1, 2] as const) {
      const adopted = createResetActor(REPLACEMENT_WORKER_EPOCH);
      const adoptedJournal = journalAt('handoff_adopted');
      adopted.send({ type: 'SERVICE_WORKER_RESTARTED', journal: adoptedJournal });
      expectActiveState(adopted, 'reacquiringFence');
      adopted.send({
        type: 'BOOT_FENCE_ACQUIRED',
        resetId: RESET_ID,
        proof: acquiredFenceProof(
          adoptedJournal,
          REPLACEMENT_WORKER_EPOCH,
          7_100 + cleanupCasAttempt * 10
        ),
      });
      expectActiveState(adopted, 'clearingBackgroundHandoff');
      const authorityReceipt =
        adopted.getSnapshot().context.backgroundSchedulingCleanupReplacementReceipt;
      if (authorityReceipt === null) {
        throw new Error('missing replacement authority receipt');
      }
      adopted.send({
        type: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED',
        resetId: RESET_ID,
        proof: handoffClearProof(cleanupCasAttempt, false),
      });
      expectActiveState(adopted, 'clearingBackgroundHandoff');
      const wrongWorkerProof = handoffClearProof(
        cleanupCasAttempt,
        true,
        'removed',
        authorityReceipt
      );
      adopted.send({
        type: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED',
        resetId: RESET_ID,
        proof: {
          ...wrongWorkerProof,
          cleanupExecution: {
            ...wrongWorkerProof.cleanupExecution,
            cleanupToken: { ...wrongWorkerProof.cleanupExecution.cleanupToken! },
          },
        },
      });
      expectActiveState(adopted, 'clearingBackgroundHandoff');
      adopted.send({
        type: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED',
        resetId: RESET_ID,
        proof: handoffClearProof(
          cleanupCasAttempt,
          true,
          cleanupCasAttempt === 0 ? 'removed' : 'already_absent',
          authorityReceipt
        ),
      });
      expectActiveState(adopted, 'clearingJournal');
    }

    const cleared = createResetActor(REPLACEMENT_WORKER_EPOCH);
    const clearedJournal = journalAt('handoff_cleared');
    cleared.send({ type: 'SERVICE_WORKER_RESTARTED', journal: clearedJournal });
    expectActiveState(cleared, 'reacquiringFence');
    cleared.send({
      type: 'BOOT_FENCE_ACQUIRED',
      resetId: RESET_ID,
      proof: acquiredFenceProof(clearedJournal, REPLACEMENT_WORKER_EPOCH, 7_200),
    });
    expectActiveState(cleared, 'clearingJournal');
  });

  it('rehydrates adopted and cleared phases only from their exact physical authorities', () => {
    for (const phase of ['handoff_adopted', 'handoff_cleared'] as const) {
      const journal = journalForPhase(phase);
      const physicalAuthority = rehydrationAuthorityFor(journal, REPLACEMENT_WORKER_EPOCH);
      expect(
        rehydrateResetPreAdmission({
          journal,
          physicalAuthority,
          workerEpoch: REPLACEMENT_WORKER_EPOCH,
          reservationId: uuid(7_300 + (phase === 'handoff_adopted' ? 0 : 1)),
        })
      ).not.toBeNull();
      expect(
        rehydrateResetPreAdmission({
          journal,
          physicalAuthority: {
            ...physicalAuthority,
            handoff:
              phase === 'handoff_adopted'
                ? {
                    kind: 'cleared_absent',
                    reference: handoffReference(),
                    absenceReadBackVerified: true,
                    journalCheckpointReadBackVerified: true,
                  }
                : {
                    kind: 'adopted_present',
                    reference: handoffReference(),
                    sidecar: handoffSidecar(),
                    adoption: handoffAdoptionProof(),
                  },
          },
          workerEpoch: REPLACEMENT_WORKER_EPOCH,
          reservationId: uuid(7_310 + (phase === 'handoff_adopted' ? 0 : 1)),
        })
      ).toBeNull();
      const sourceWorkerAuthority = rehydrationAuthorityFor(journal, SOURCE_WORKER_EPOCH);
      expect(
        rehydrateResetPreAdmission({
          journal,
          physicalAuthority: sourceWorkerAuthority,
          workerEpoch: SOURCE_WORKER_EPOCH,
          reservationId: uuid(7_320 + (phase === 'handoff_adopted' ? 0 : 1)),
        })
      ).toBeNull();
    }
  });

  it('recognizes an exact latest receipt after E2 writes and rejects the wrong receipt', () => {
    const actor = createResetActor();
    actor.send(request);
    expectActiveState(actor, 'preflightingCompletion');

    const wrongReceipt = { ...receipt(), resetId: uuid(30) };
    actor.send({
      type: 'RESET_COMPLETION_RECOGNIZED',
      resetId: RESET_ID,
      proof: postClearProof(wrongReceipt),
    });
    expectActiveState(actor, 'preflightingCompletion');

    const proof = postClearProof(receipt(), 29);
    expect(parseLocalDataResetPostClearCompletionProof(proof, proofExpectation)).not.toBeNull();
    actor.send({ type: 'RESET_COMPLETION_RECOGNIZED', resetId: RESET_ID, proof });
    expectActiveState(actor, 'openingEpochAdmission');
    expect(actor.getSnapshot().context.completionDisposition).toBe('recognized');
    actor.send({
      type: 'RESET_EPOCH_ADMISSION_OPENED',
      resetId: RESET_ID,
      proof: admissionOpenedProof(),
    });
    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'committed',
      completionDisposition: 'recognized',
      databaseReinitialized: true,
      settingsAligned: true,
      receiptPersisted: true,
      commitCheckpointed: true,
      admissionOpen: true,
    });
  });

  it('requires generation 0 for physical reinitialization but accepts generation 2 alignment', () => {
    const actor = createResetActor();
    advanceToAligningSettings(actor);
    const fresh = settingsEnvelope(0);
    const settled = settingsEnvelope(2);
    expect(
      isFreshResetSettingsEnvelope(fresh, NEXT_EPOCH, DEFAULT_SETTINGS, INCLUDED_CONNECTORS)
    ).toBe(true);
    expect(
      isFreshResetSettingsEnvelope(settled, NEXT_EPOCH, DEFAULT_SETTINGS, INCLUDED_CONNECTORS)
    ).toBe(false);

    const proof = alignmentProof(2);
    expect(
      parseResetOwnedSettingsAlignmentProof(proof, {
        resetId: RESET_ID,
        dataEpoch: NEXT_EPOCH,
        requestId: SETTINGS_RECOVERY_REQUEST_ID,
        commandId: settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID),
        defaultSettings: DEFAULT_SETTINGS,
        includedConnectorIds: INCLUDED_CONNECTORS,
      })
    ).not.toBeNull();
    actor.send({ type: 'SETTINGS_ALIGNED', resetId: RESET_ID, proof });
    expectActiveState(actor, 'broadcastingReadiness');

    const mismatchedAlarm = {
      ...proof,
      alarmProof: { ...proof.alarmProof, envelopeGeneration: 0 },
    };
    expect(
      parseResetOwnedSettingsAlignmentProof(mismatchedAlarm, {
        resetId: RESET_ID,
        dataEpoch: NEXT_EPOCH,
        requestId: SETTINGS_RECOVERY_REQUEST_ID,
        commandId: settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID),
        defaultSettings: DEFAULT_SETTINGS,
        includedConnectorIds: INCLUDED_CONNECTORS,
      })
    ).toBeNull();
  });
});

describe('local data reset strict proof parsers', () => {
  it('accepts only a mailbox-closed handoff and rejects any post-checkpoint payload drift', () => {
    const sidecar = handoffSidecar();
    expect(parseBackgroundSchedulingHandoffSidecar(sidecar)).toEqual(sidecar);
    expect(
      parseBackgroundSchedulingHandoffSidecar({
        ...sidecar,
        payload: { ...sidecar.payload, handoffClosed: false },
      })
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        handoffCheckpointProof(),
        handoffExpectation()
      )
    ).not.toBeNull();
    const laterPayload = { ...handoffPayload(), closedAtMailboxSequence: 8 };
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        { ...handoffCheckpointProof(), sidecar: handoffSidecar(laterPayload) },
        handoffExpectation()
      )
    ).toBeNull();
  });

  it('validates the exact frozen 1584+3 manifest and rejects a cross-lane provenance swap', () => {
    const fullFacts = deriveBackgroundSchedulingHandoffPayloadFacts(fullHandoffPayload());
    expect(fullFacts).not.toBeNull();
    expect(fullFacts?.slotCount).toBe(131);
    expect(fullFacts?.payload.checkpointRevision).toBe(131);
    const manifestFacts = deriveBackgroundSchedulingHandoffCapabilityManifestFacts(
      handoffPayload().capabilityManifest
    );
    expect(manifestFacts?.manifest.entries).toHaveLength(1_587);
    expect(
      manifestFacts?.manifest.entries.filter((entry) => entry.kind !== 'sidecar_cleanup')
    ).toHaveLength(1_584);
    for (const controlAttemptIndex of [0, 1, 2, 3] as const) {
      expect(
        manifestFacts?.manifest.entries.filter(
          (entry) => entry.controlAttemptIndex === controlAttemptIndex
        )
      ).toHaveLength(396);
    }
    expect(manifestFacts?.cleanupRecovery.bundles).toHaveLength(3);

    const proof = handoffCheckpointProof();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(proof, handoffExpectation())
    ).not.toBeNull();
    const otherSidecar = handoffSidecar({ ...handoffPayload(), controlLaneId: uuid(49) });
    const otherProof = handoffCheckpointProof(otherSidecar);
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        { ...proof, frozenProvenance: otherProof.frozenProvenance },
        handoffExpectation()
      )
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        {
          ...proof,
          frozenProvenance: { ...proof.frozenProvenance, laneId: uuid(49) },
        },
        handoffExpectation()
      )
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        {
          ...proof,
          frozenProvenance: { ...proof.frozenProvenance, attemptIndex: 1 },
        },
        handoffExpectation()
      )
    ).toBeNull();

    const corruptEntries = [...proof.frozenProvenance.capabilityManifest.entries];
    corruptEntries[1_586] = {
      ...corruptEntries[1_586]!,
      capabilityId: uuid(9_999),
    };
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        {
          ...proof,
          frozenProvenance: {
            ...proof.frozenProvenance,
            capabilityManifest: {
              ...proof.frozenProvenance.capabilityManifest,
              entries: corruptEntries,
            },
          },
        },
        handoffExpectation()
      )
    ).toBeNull();
  });

  it('rejects a wholly self-consistent foreign lane against the trusted fence expectation', () => {
    const base = handoffPayload();
    const foreignWorkerEpoch = uuid(50);
    const foreignSidecar = handoffSidecar({
      ...base,
      sourceWorkerEpoch: foreignWorkerEpoch,
      controlLaneId: uuid(51),
      controlLaneAttemptIndex: 2,
      writerTransfer: {
        ...base.writerTransfer,
        sourceWriterWorkerEpoch: foreignWorkerEpoch,
      },
    });
    const foreignProof = handoffCheckpointProof(foreignSidecar);
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(foreignProof, handoffExpectation())
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        foreignProof,
        handoffExpectation(foreignSidecar)
      )
    ).not.toBeNull();
  });

  it('persists all twelve one-shot CAS cursors and resumes at 0:37:1 after a crash', () => {
    const target = fullHandoffPayload();
    const cursorBeforeFailure = {
      controlAttemptIndex: 0 as const,
      transitionIndex: 37,
      casAttempt: 0 as const,
    };
    const rawPartial = {
      ...target,
      checkpointRevision: 36,
      materializationCursor: 36,
      casCursor: cursorBeforeFailure,
      slots: target.targetSlots.map((slot, index) => (index < 36 ? slot : null)),
      writerTransfer: { ...target.writerTransfer, handoffRevision: 36 },
    };
    const beforeFailure = deriveBackgroundSchedulingHandoffPayloadFacts(rawPartial);
    expect(beforeFailure).not.toBeNull();
    if (beforeFailure === null) {
      return;
    }
    const beforeFailureCursor = beforeFailure.payload.casCursor;
    expect(beforeFailureCursor).toEqual(cursorBeforeFailure);

    const cursorAfterFailure =
      advanceBackgroundSchedulingHandoffCasCursorAfterFailure(cursorBeforeFailure);
    expect(cursorAfterFailure).toEqual({
      controlAttemptIndex: 0,
      transitionIndex: 37,
      casAttempt: 1,
    });
    const afterFailure = deriveBackgroundSchedulingHandoffPayloadFacts({
      ...beforeFailure.payload,
      casCursor: cursorAfterFailure,
    });
    expect(afterFailure).not.toBeNull();
    if (afterFailure === null) {
      return;
    }
    const afterFailureSidecar = handoffSidecar(afterFailure.payload);
    const restored = parseBackgroundSchedulingHandoffSidecar(
      JSON.parse(JSON.stringify(afterFailureSidecar))
    );
    expect(restored).not.toBeNull();
    if (restored === null) {
      return;
    }
    const restoredCursor = restored.payload.casCursor;
    expect(restoredCursor).toEqual(cursorAfterFailure);
    expect(restored.payload.materializationCursor).toBe(36);
    expect(restored?.payload.frozenTargetDigest).toBe(target.frozenTargetDigest);

    const visited = ['0:37:0'];
    let retryCursor = restoredCursor;
    while (retryCursor !== null) {
      visited.push(
        `${retryCursor.controlAttemptIndex}:${retryCursor.transitionIndex}:${retryCursor.casAttempt}`
      );
      retryCursor = advanceBackgroundSchedulingHandoffCasCursorAfterFailure(retryCursor);
    }
    expect(visited).toEqual(
      [0, 1, 2, 3].flatMap((controlAttemptIndex) =>
        [0, 1, 2].map((casAttempt) => `${controlAttemptIndex}:37:${casAttempt}`)
      )
    );
    expect(new Set(visited).size).toBe(12);

    const afterSuccessfulRetry = advanceBackgroundSchedulingHandoffMaterialization(
      restored.payload
    );
    expect(afterSuccessfulRetry).not.toBeNull();
    if (afterSuccessfulRetry === null) {
      return;
    }
    expect(afterSuccessfulRetry.casCursor).toEqual({
      controlAttemptIndex: 0,
      transitionIndex: 38,
      casAttempt: 0,
    });

    let partial = afterSuccessfulRetry;
    while (partial.materializationCursor < BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT) {
      const next = advanceBackgroundSchedulingHandoffMaterialization(partial);
      expect(next).not.toBeNull();
      partial = next!;
    }
    const completed = deriveBackgroundSchedulingHandoffPayloadFacts(partial);
    expect(completed?.payload.materializationCursor).toBe(131);
    expect(completed?.payload.slots).toEqual(completed?.payload.targetSlots);
    expect(completed?.payload.frozenTargetDigest).toBe(target.frozenTargetDigest);
    expect(completed?.payload.casCursor).toBeNull();
    expect(completed?.slotCount).toBe(131);
  });

  it('recomputes canonical payload, writer, journal, bitmap and count facts', () => {
    expect(backgroundSchedulingSha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    const sidecar = handoffSidecar();
    expect(
      parseBackgroundSchedulingHandoffSidecar({ ...sidecar, storageKey: 'foreign.key' })
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffSidecar({
        ...sidecar,
        slotBitmap: `${sidecar.slotBitmap}0`,
      })
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffSidecar({
        ...sidecar,
        writerTransferDigest: 'f'.repeat(64),
      })
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffSidecar({
        ...sidecar,
        journalAtQuiescenceDigest: 'e'.repeat(64),
      })
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffSidecar({
        ...sidecar,
        payload: { ...sidecar.payload, closedAtMailboxSequence: Number.NaN },
      })
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffReference({
        ...handoffReference(sidecar),
        checkpointRevision: sidecar.slotCount + 1,
      })
    ).toBeNull();
    const slots = [...handoffPayload().slots];
    slots[0] = {
      version: 1,
      slotIndex: 0,
      slotKind: 'digest_first',
      alarmEventId: uuid(48),
      name: 'daily-digest',
      connectorId: null,
      firedAtMs: 99,
      mailboxSequence: 6,
      sourceWorkerEpoch: SOURCE_WORKER_EPOCH,
    };
    const oneSlotBase = handoffPayload();
    const oneSlotSidecar = handoffSidecar({
      ...oneSlotBase,
      checkpointRevision: 1,
      frozenTargetDigest: backgroundSchedulingSha256Hex(JSON.stringify(slots)),
      targetSlots: slots,
      slots,
      writerTransfer: { ...oneSlotBase.writerTransfer, handoffRevision: 1 },
    });
    expect(parseBackgroundSchedulingHandoffSidecar(oneSlotSidecar)).toEqual(oneSlotSidecar);
    expect(oneSlotSidecar.slotCount).toBe(1);
    expect(oneSlotSidecar.slotBitmap[0]).toBe('1');
    expect(
      deriveBackgroundSchedulingHandoffPayloadFacts({
        ...oneSlotSidecar.payload,
        checkpointRevision: 0,
        writerTransfer: { ...oneSlotSidecar.payload.writerTransfer, handoffRevision: 0 },
      })
    ).toBeNull();
    expect(parseBackgroundSchedulingHandoffSidecar({ ...oneSlotSidecar, slotCount: 0 })).toBeNull();
    expect(
      deriveBackgroundSchedulingHandoffPayloadFacts({
        ...oneSlotSidecar.payload,
        slots: oneSlotSidecar.payload.slots.map((slot, index) =>
          index === 0 && slot !== null ? { ...slot, mailboxSequence: 7 } : slot
        ),
      })
    ).toBeNull();
    const foreignHandoffId = uuid(99);
    const foreignManifest = deriveBackgroundSchedulingHandoffCapabilityManifestFacts(
      capabilityManifest(SIDECAR_ID, foreignHandoffId)
    );
    if (foreignManifest === null) {
      throw new Error('invalid foreign manifest fixture');
    }
    const foreignPayloadSidecar = handoffSidecar({
      ...handoffPayload(),
      handoffId: foreignHandoffId,
      capabilityManifest: foreignManifest.manifest,
      capabilityManifestDigest: foreignManifest.manifestDigest,
    });
    expect(
      parseBackgroundSchedulingHandoffSidecar({
        ...foreignPayloadSidecar,
        handoffId: HANDOFF_ID,
      })
    ).toBeNull();
  });

  it('binds the lane-preallocated sidecar identity across proof and reference', () => {
    const proof = handoffCheckpointProof();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(proof, handoffExpectation())
    ).not.toBeNull();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        { ...proof, sidecarIdPreallocatedBeforeWorkAdmission: false },
        handoffExpectation()
      )
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        { ...proof, reference: { ...proof.reference, sidecarId: uuid(98) } },
        handoffExpectation()
      )
    ).toBeNull();
  });

  it('bounds canonical payload and complete sidecar bytes independently', () => {
    const sidecar = handoffSidecar();
    expect(sidecar.payloadEncodedBytes).toBeLessThanOrEqual(
      BACKGROUND_SCHEDULING_HANDOFF_MAX_PAYLOAD_ENCODED_BYTES
    );
    const sidecarEncodedBytes = backgroundSchedulingHandoffSidecarEncodedBytes(sidecar);
    expect(sidecarEncodedBytes).toBeLessThanOrEqual(
      BACKGROUND_SCHEDULING_HANDOFF_MAX_SIDECAR_ENCODED_BYTES
    );
    const proof = handoffCheckpointProof();
    expect(
      parseBackgroundSchedulingHandoffCheckpointProof(
        {
          ...proof,
          reference: {
            ...proof.reference,
            sidecarEncodedBytes: proof.reference.sidecarEncodedBytes + 1,
          },
        },
        handoffExpectation()
      )
    ).toBeNull();
  });

  it('rehydrates each cleanup capability on a replacement lane and rejects old worker tokens', () => {
    for (const cleanupCasAttempt of [0, 1, 2] as const) {
      const proof = handoffClearProof(
        cleanupCasAttempt,
        true,
        cleanupCasAttempt === 0 ? 'removed' : 'already_absent'
      );
      expect(
        parseBackgroundSchedulingHandoffClearProof(proof, {
          resetId: RESET_ID,
          reference: handoffReference(),
          replacementLaneRequired: true,
          currentWorkerEpoch: REPLACEMENT_WORKER_EPOCH,
          replacementLaneReceipt: proof.cleanupExecution.replacementLaneReceipt,
        })
      ).not.toBeNull();
    }
    const expectedReplacementReceipt = replacementLaneReceipt();
    expect(expectedReplacementReceipt).not.toBeNull();
    expect(
      parseBackgroundSchedulingHandoffClearProof(handoffClearProof(0, false), {
        resetId: RESET_ID,
        reference: handoffReference(),
        replacementLaneRequired: true,
        currentWorkerEpoch: REPLACEMENT_WORKER_EPOCH,
        replacementLaneReceipt: expectedReplacementReceipt,
      })
    ).toBeNull();
    expect(replacementLaneReceipt(SOURCE_WORKER_EPOCH, uuid(52), 7_700)).toBeNull();

    const proof = handoffClearProof(1, true, 'already_absent');
    const receipt = proof.cleanupExecution.replacementLaneReceipt!;
    expect(
      parseBackgroundSchedulingHandoffClearProof(
        {
          ...proof,
          cleanupExecution: {
            ...proof.cleanupExecution,
            replacementLaneReceipt: { ...receipt },
          },
        },
        {
          resetId: RESET_ID,
          reference: handoffReference(),
          replacementLaneRequired: true,
          currentWorkerEpoch: REPLACEMENT_WORKER_EPOCH,
          replacementLaneReceipt: receipt,
        }
      )
    ).toBeNull();
    expect(
      parseBackgroundSchedulingHandoffClearProof(
        {
          ...proof,
          cleanupExecution: {
            ...proof.cleanupExecution,
            cleanupToken: { ...proof.cleanupExecution.cleanupToken! },
          },
        },
        {
          resetId: RESET_ID,
          reference: handoffReference(),
          replacementLaneRequired: true,
          currentWorkerEpoch: REPLACEMENT_WORKER_EPOCH,
          replacementLaneReceipt: receipt,
        }
      )
    ).toBeNull();

    const foreignReceipt = replacementLaneReceipt(uuid(53), uuid(54), 7_710);
    expect(foreignReceipt).not.toBeNull();
    expect(
      parseBackgroundSchedulingHandoffClearProof(
        {
          ...proof,
          cleanupExecution: {
            ...proof.cleanupExecution,
            executionLaneId: foreignReceipt!.replacementLaneId,
            executingWorkerEpoch: foreignReceipt!.replacementWorkerEpoch,
            replacementLaneReceipt: foreignReceipt,
            cleanupToken: foreignReceipt!.cleanupTokens[1],
          },
        },
        {
          resetId: RESET_ID,
          reference: handoffReference(),
          replacementLaneRequired: true,
          currentWorkerEpoch: REPLACEMENT_WORKER_EPOCH,
          replacementLaneReceipt: receipt,
        }
      )
    ).toBeNull();
  });

  it('does not clear the reset journal before exact handoff adoption and cleanup', () => {
    const actor = createResetActor();
    advanceToWritingReceipt(actor);
    actor.send({ type: 'RESET_RECEIPT_WRITTEN', resetId: RESET_ID, receipt: receipt() });
    actor.send({ type: 'RESET_COMMIT_CHECKPOINTED', resetId: RESET_ID });
    actor.send({
      type: 'RESET_COMMITTED_BROADCASTED',
      payload: resetEpochPayload('committed'),
      delivery: 'delivered',
    });
    expectActiveState(actor, 'adoptingBackgroundHandoff');
    actor.send({ type: 'JOURNAL_CLEARED', resetId: RESET_ID });
    expectActiveState(actor, 'adoptingBackgroundHandoff');
    actor.send({
      type: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED',
      resetId: RESET_ID,
      proof: { ...handoffAdoptionProof(), sidecarStillPresent: false },
    });
    expectActiveState(actor, 'adoptingBackgroundHandoff');
    actor.send({
      type: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED',
      resetId: RESET_ID,
      proof: handoffAdoptionProof(),
    });
    actor.send({ type: 'JOURNAL_CLEARED', resetId: RESET_ID });
    expectActiveState(actor, 'clearingBackgroundHandoff');
  });

  it('accepts canonical proof shapes and rejects extra symbol keys', () => {
    const epoch = resetEpochPayload('committed');
    expect(parseLocalDataResetEpochEvent(epoch)).toEqual(epoch);
    expect(
      parseLocalDataResetFreshPreflightProof(freshPreflightProof(), proofExpectation)
    ).not.toBeNull();
    expect(
      parseLocalDataResetInitialDatabaseProof(initialDatabaseProof(), NEXT_EPOCH)
    ).not.toBeNull();
    expect(parseLocalDataResetReceipt(receipt())).toEqual(receipt());
    expect(
      parseLocalDataResetAdmissionOpenedProof(admissionOpenedProof(), {
        resetId: RESET_ID,
        dataEpoch: NEXT_EPOCH,
      })
    ).toEqual(admissionOpenedProof());
    expect(
      parseLocalDataResetPostClearCompletionProof(postClearProof(), proofExpectation)
    ).not.toBeNull();

    const withSymbol = { ...epoch, [Symbol('hidden')]: true };
    expect(parseLocalDataResetEpochEvent(withSymbol)).toBeNull();
  });

  it('rejects accessor descriptors without invoking them, including nested proofs', () => {
    let getterCalls = 0;
    const accessorReceipt: Record<string, unknown> = { ...receipt() };
    Object.defineProperty(accessorReceipt, 'resetId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return RESET_ID;
      },
    });
    expect(parseLocalDataResetReceipt(accessorReceipt)).toBeNull();
    expect(getterCalls).toBe(0);

    const nestedAccessor = postClearProof();
    const trackingMeta: Record<string, unknown> = {
      ...nestedAccessor.authority.trackingMeta,
    };
    Object.defineProperty(trackingMeta, 'collectionRevision', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 29;
      },
    });
    const hostileProof = {
      ...nestedAccessor,
      authority: { ...nestedAccessor.authority, trackingMeta },
    };
    expect(parseLocalDataResetPostClearCompletionProof(hostileProof, proofExpectation)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it('returns null without throwing for revoked proxies across all public proof parsers', () => {
    const journal: LocalDataResetJournalV1 = {
      schemaVersion: 1,
      resetId: RESET_ID,
      previousDataEpoch: PREVIOUS_EPOCH,
      nextDataEpoch: NEXT_EPOCH,
      settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
      settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
      phase: 'journaled',
      backgroundSchedulingHandoff: null,
      requestedAt: REQUESTED_AT,
      retryCount: 0,
      lastError: null,
    };
    const parsers: Array<{ value: object; parse: (value: unknown) => unknown }> = [
      { value: resetEpochPayload('committed'), parse: parseLocalDataResetEpochEvent },
      { value: journal, parse: parseLocalDataResetJournal },
      { value: receipt(), parse: parseLocalDataResetReceipt },
      {
        value: freshPreflightProof(),
        parse: (value) => parseLocalDataResetFreshPreflightProof(value, proofExpectation),
      },
      {
        value: initialDatabaseProof(),
        parse: (value) => parseLocalDataResetInitialDatabaseProof(value, NEXT_EPOCH),
      },
      {
        value: alignmentProof(2),
        parse: (value) =>
          parseResetOwnedSettingsAlignmentProof(value, {
            resetId: RESET_ID,
            dataEpoch: NEXT_EPOCH,
            requestId: SETTINGS_RECOVERY_REQUEST_ID,
            commandId: settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID),
            defaultSettings: DEFAULT_SETTINGS,
            includedConnectorIds: INCLUDED_CONNECTORS,
          }),
      },
      {
        value: postClearProof(),
        parse: (value) => parseLocalDataResetPostClearCompletionProof(value, proofExpectation),
      },
    ];

    for (const { value, parse } of parsers) {
      const revocable = Proxy.revocable(value, {});
      revocable.revoke();
      expect(() => parse(revocable.proxy)).not.toThrow();
      expect(parse(revocable.proxy)).toBeNull();
    }
  });

  it('descriptor-snapshots each receipt field once and never rereads the proxy source', () => {
    const source = receipt();
    const descriptorReads = new Map<PropertyKey, number>();
    const proxy = new Proxy(source, {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads.set(key, (descriptorReads.get(key) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(parseLocalDataResetReceipt(proxy)).toEqual(source);
    for (const key of Reflect.ownKeys(source)) {
      expect(descriptorReads.get(key)).toBe(1);
    }
  });
});
