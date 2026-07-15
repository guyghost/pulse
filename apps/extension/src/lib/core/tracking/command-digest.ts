import type { TrackingMutationCommandV2 } from '../../../models/application-tracking.machine.contract';
import type { ApplicationStatus } from '../types/tracking';
import {
  TRACKING_MISSION_ID_MAX_CHARS,
  TRACKING_NOTE_MAX_CHARS,
  canonicalTrackingIsoV2,
  canonicalTrackingJsonV2,
  hasExactTrackingKeysV2,
  inspectPlainTrackingRecordV2,
  isCanonicalTrackingUuidV4,
  isTrackingApplicationStatusV2,
  normalizeMissionTrackingV2,
} from './v2-contract';

function normalizedMissionId(value: unknown): string | null {
  if (typeof value !== 'string' || canonicalTrackingJsonV2(value) === null) {
    return null;
  }
  const normalized = value.normalize('NFC');
  return normalized.length > 0 && normalized.length <= TRACKING_MISSION_ID_MAX_CHARS
    ? normalized
    : null;
}

function baseCommandValid(value: Record<string, unknown>): boolean {
  return (
    isCanonicalTrackingUuidV4(value.dataEpoch) &&
    isCanonicalTrackingUuidV4(value.mutationId) &&
    normalizedMissionId(value.missionId) !== null
  );
}

/** Runtime-normalize one strict public mutation command before preflight or digesting. */
export function normalizeTrackingMutationCommandV2(
  value: unknown
): TrackingMutationCommandV2 | null {
  const record = inspectPlainTrackingRecordV2(value);
  if (record === null || !baseCommandValid(record)) {
    return null;
  }
  const missionId = normalizedMissionId(record.missionId);
  if (missionId === null) {
    return null;
  }

  if (
    record.intent === 'transition' &&
    hasExactTrackingKeysV2(
      record,
      ['dataEpoch', 'mutationId', 'missionId', 'intent', 'status'],
      ['note']
    ) &&
    isTrackingApplicationStatusV2(record.status)
  ) {
    const note = record.note === undefined || record.note === null ? null : record.note;
    if (
      note !== null &&
      (typeof note !== 'string' ||
        canonicalTrackingJsonV2(note) === null ||
        note.normalize('NFC').length > TRACKING_NOTE_MAX_CHARS)
    ) {
      return null;
    }
    return {
      dataEpoch: record.dataEpoch as string,
      mutationId: record.mutationId as string,
      missionId,
      intent: 'transition',
      status: record.status as ApplicationStatus,
      note: note === null ? null : note.normalize('NFC'),
    };
  }

  if (
    record.intent === 'details' &&
    hasExactTrackingKeysV2(
      record,
      ['dataEpoch', 'mutationId', 'missionId', 'intent'],
      ['nextActionAt']
    )
  ) {
    const nextActionAt =
      record.nextActionAt === undefined || record.nextActionAt === null
        ? null
        : canonicalTrackingIsoV2(record.nextActionAt);
    if (
      record.nextActionAt !== undefined &&
      record.nextActionAt !== null &&
      nextActionAt === null
    ) {
      return null;
    }
    return {
      dataEpoch: record.dataEpoch as string,
      mutationId: record.mutationId as string,
      missionId,
      intent: 'details',
      nextActionAt,
    };
  }

  if (
    record.intent === 'restore' &&
    hasExactTrackingKeysV2(record, [
      'dataEpoch',
      'mutationId',
      'missionId',
      'intent',
      'previousTracking',
      'expectedCurrentRevision',
      'expectedCurrentMutationId',
    ]) &&
    Number.isSafeInteger(record.expectedCurrentRevision) &&
    (record.expectedCurrentRevision as number) >= 1 &&
    isCanonicalTrackingUuidV4(record.expectedCurrentMutationId)
  ) {
    const previousTracking =
      record.previousTracking === null ? null : normalizeMissionTrackingV2(record.previousTracking);
    if (
      record.previousTracking !== null &&
      (previousTracking === null || previousTracking.missionId !== missionId)
    ) {
      return null;
    }
    return {
      dataEpoch: record.dataEpoch as string,
      mutationId: record.mutationId as string,
      missionId,
      intent: 'restore',
      previousTracking,
      expectedCurrentRevision: record.expectedCurrentRevision as number,
      expectedCurrentMutationId: record.expectedCurrentMutationId,
    };
  }

  return null;
}

/**
 * Produce the canonical JCS command bytes as a UTF-8 string.
 * SHA-256 remains a Shell concern and is deliberately not computed here.
 */
export function canonicalizeTrackingCommandV2(value: unknown): string | null {
  const command = normalizeTrackingMutationCommandV2(value);
  if (command === null) {
    return null;
  }

  switch (command.intent) {
    case 'transition':
      return canonicalTrackingJsonV2([
        2,
        command.dataEpoch,
        command.intent,
        command.missionId,
        command.status,
        command.note,
      ]);
    case 'details':
      return canonicalTrackingJsonV2([
        2,
        command.dataEpoch,
        command.intent,
        command.missionId,
        command.nextActionAt,
      ]);
    case 'restore':
      return canonicalTrackingJsonV2([
        2,
        command.dataEpoch,
        command.intent,
        command.missionId,
        command.expectedCurrentRevision,
        command.expectedCurrentMutationId,
        command.previousTracking,
      ]);
  }
}
