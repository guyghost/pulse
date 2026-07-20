import { isAllowedApplicationTransition } from '@pulse/domain';
import type {
  PersistedTrackingEnvelopeV2,
  SerializedApplicationTrackingErrorV2,
  TrackingControlIdentityV2,
  TrackingMutationIntentV2,
  TrackingSettlementV2,
  TrackingUndoTokenV2,
} from '../../../models/application-tracking.machine.contract';
import type { ApplicationStatus, MissionTracking, StatusTransition } from '../types/tracking';

export type {
  PersistedTrackingEnvelopeV2,
  SerializedApplicationTrackingErrorV2,
  TrackingControlIdentityV2,
  TrackingMutationCommandV2,
  TrackingMutationIntentV2,
  TrackingRevisionTokenV2,
  TrackingSettlementV2,
  TrackingUndoTokenV2,
} from '../../../models/application-tracking.machine.contract';

export const TRACKING_MISSION_ID_MAX_CHARS = 256;
export const TRACKING_NOTE_MAX_CHARS = 2_048;
export const TRACKING_NOTES_MAX_CHARS = 10_000;
export const TRACKING_HISTORY_MAX_ITEMS = 200;
export const TRACKING_ASSET_IDS_MAX_ITEMS = 100;
export const TRACKING_RECORD_MAX_BYTES = 40_000;
export const TRACKING_ENVELOPE_MAX_BYTES = 85_000;
export const TRACKING_LEDGER_MAX_BYTES = 2_048;
export const TRACKING_OUTBOX_MAX_BYTES = 45_000;
export const TRACKING_LOAD_PAGE_MAX_ITEMS = 50;
export const TRACKING_LOAD_PAGE_MAX_BYTES = 512_000;
export const TRACKING_CURSOR_MAX_CHARS = 512;
export const TRACKING_EFFECT_IDS_MAX_ITEMS = 256;
export const TRACKING_DIAGNOSTIC_WARNING_BYTES = 64 * 1024 * 1024;
export const TRACKING_MIN_QUOTA_HEADROOM_BYTES = 1024 * 1024;

export type TrackingMutationPhaseV2 =
  'prepared' | 'committed' | 'rejected' | 'failed' | 'cancelled' | 'worker_restarted';

export interface PersistedTrackingMutationV2 {
  schemaVersion: 2;
  dataEpoch: string;
  mutationId: string;
  missionId: string;
  intent: TrackingMutationIntentV2;
  commandDigest: string;
  phase: TrackingMutationPhaseV2;
  ownerWorkerEpoch: string;
  baseRevision: number;
  baseLastMutationId: string | null;
  committedRevision: number | null;
  failureCode: SerializedApplicationTrackingErrorV2['code'] | null;
  createdAt: number;
  settledAt: number | null;
}

export type TrackingPlanFailureCodeV2 =
  | 'INVALID_TRANSITION'
  | 'INVALID_DETAILS'
  | 'INVALID_RESTORE'
  | 'STALE_UNDO'
  | 'PERSIST_FAILED'
  | 'PROTOCOL_ERROR'
  | 'EPOCH_CHANGED';

const APPLICATION_STATUSES = new Set<ApplicationStatus>([
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'archived',
]);

const TRACKING_INTENTS = new Set<TrackingMutationIntentV2>(['transition', 'details', 'restore']);

const MUTATION_ERROR_MESSAGES: Record<
  Exclude<SerializedApplicationTrackingErrorV2['code'], 'LOAD_FAILED'>,
  string | Partial<Record<TrackingMutationIntentV2, string>>
> = {
  PERSIST_FAILED: {
    transition: 'Impossible d’enregistrer le nouveau statut.',
    details: 'Impossible d’enregistrer les détails de suivi.',
    restore: 'Impossible d’annuler la modification.',
  },
  INVALID_TRANSITION: 'Ce changement de statut n’est pas autorisé.',
  INVALID_DETAILS: 'Les détails de suivi sont invalides.',
  INVALID_RESTORE: 'Cette annulation n’est pas valide.',
  TRANSPORT_ERROR:
    'La confirmation du suivi n’a pas été reçue. Rechargez le suivi avant de réessayer.',
  PROTOCOL_ERROR: 'La réponse du suivi est invalide. Rechargez le suivi avant de réessayer.',
  STALE_UNDO: 'Cette annulation n’est plus applicable car la candidature a changé.',
  APPLICATION_BUSY:
    'Une autre modification de cette candidature est en cours. Réessayez après son règlement.',
  CANCELLED: 'La modification a été annulée avant son enregistrement.',
  WORKER_RESTARTED:
    'Le service de l’extension a redémarré avant de confirmer la modification. L’état local a été rechargé.',
  EPOCH_CHANGED:
    'Les données locales ont été réinitialisées. Rechargez le suivi avant de continuer.',
};

const NON_RECOVERABLE_CODES = new Set<SerializedApplicationTrackingErrorV2['code']>([
  'INVALID_TRANSITION',
  'INVALID_DETAILS',
  'INVALID_RESTORE',
  'STALE_UNDO',
]);

const ERROR_ALLOWED_INTENTS: Record<
  Exclude<SerializedApplicationTrackingErrorV2['code'], 'LOAD_FAILED'>,
  readonly TrackingMutationIntentV2[]
> = {
  PERSIST_FAILED: ['transition', 'details', 'restore'],
  INVALID_TRANSITION: ['transition'],
  INVALID_DETAILS: ['details'],
  INVALID_RESTORE: ['restore'],
  TRANSPORT_ERROR: ['transition', 'details', 'restore'],
  PROTOCOL_ERROR: ['transition', 'details', 'restore'],
  STALE_UNDO: ['restore'],
  APPLICATION_BUSY: ['transition', 'details', 'restore'],
  CANCELLED: ['transition', 'details', 'restore'],
  WORKER_RESTARTED: ['transition', 'details', 'restore'],
  EPOCH_CHANGED: ['transition', 'details', 'restore'],
};

/** Capture an admissible flat JSON object from data descriptors without property reads. */
export function inspectPlainTrackingRecordV2(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        return null;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function isPlainTrackingRecordV2(value: unknown): value is Record<string, unknown> {
  return inspectPlainTrackingRecordV2(value) !== null;
}

/** Strict dense JSON array: exact prototype/length/indices, data descriptors only, no extras. */
function inspectPlainTrackingArrayV2(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined ||
      !('value' in lengthDescriptor) ||
      lengthDescriptor.enumerable ||
      lengthDescriptor.configurable ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      (lengthDescriptor.value as number) < 0 ||
      keys.length !== (lengthDescriptor.value as number) + 1
    ) {
      return null;
    }

    const length = lengthDescriptor.value as number;
    const values: unknown[] = [];
    for (const key of keys) {
      if (key === 'length') {
        continue;
      }
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) {
        return null;
      }
      const index = Number(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= length ||
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        return null;
      }
      values[index] = descriptor.value;
    }
    return values.length === length ? values : null;
  } catch {
    return null;
  }
}

const TRACKING_JSON_SNAPSHOT_FAILED = Symbol('tracking-json-snapshot-failed');

/** Recursively detach one strict JSON graph while each unknown descriptor is read exactly once. */
function snapshotTrackingJsonValueV2(
  value: unknown,
  ancestors = new Set<object>()
): unknown | typeof TRACKING_JSON_SNAPSHOT_FAILED {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (typeof value !== 'object') {
    return TRACKING_JSON_SNAPSHOT_FAILED;
  }

  let isArray: boolean;
  try {
    isArray = Array.isArray(value);
  } catch {
    return TRACKING_JSON_SNAPSHOT_FAILED;
  }
  if (ancestors.has(value)) {
    return TRACKING_JSON_SNAPSHOT_FAILED;
  }
  ancestors.add(value);
  try {
    if (isArray) {
      const items = inspectPlainTrackingArrayV2(value);
      if (items === null) {
        return TRACKING_JSON_SNAPSHOT_FAILED;
      }
      const snapshot: unknown[] = [];
      for (const item of items) {
        const child = snapshotTrackingJsonValueV2(item, ancestors);
        if (child === TRACKING_JSON_SNAPSHOT_FAILED) {
          return TRACKING_JSON_SNAPSHOT_FAILED;
        }
        snapshot.push(child);
      }
      return snapshot;
    }

    const record = inspectPlainTrackingRecordV2(value);
    if (record === null) {
      return TRACKING_JSON_SNAPSHOT_FAILED;
    }
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const child = snapshotTrackingJsonValueV2(record[key], ancestors);
      if (child === TRACKING_JSON_SNAPSHOT_FAILED) {
        return TRACKING_JSON_SNAPSHOT_FAILED;
      }
      snapshot[key] = child;
    }
    return snapshot;
  } finally {
    ancestors.delete(value);
  }
}

export function hasExactTrackingKeysV2(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean {
  const snapshot = inspectPlainTrackingRecordV2(value);
  if (snapshot === null) {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(snapshot, key)) &&
    Object.keys(snapshot).every((key) => allowed.has(key))
  );
}

export function inspectExactTrackingRecordV2(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | null {
  const snapshot = inspectPlainTrackingRecordV2(value);
  return snapshot !== null && hasExactTrackingKeysV2(snapshot, required, optional)
    ? snapshot
    : null;
}

export function isCanonicalTrackingUuidV4(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}

export function isTrackingCommandDigestV2(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function isTrackingMutationIntentV2(value: unknown): value is TrackingMutationIntentV2 {
  return typeof value === 'string' && TRACKING_INTENTS.has(value as TrackingMutationIntentV2);
}

export function isTrackingApplicationStatusV2(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && APPLICATION_STATUSES.has(value as ApplicationStatus);
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function serializeCanonicalValue(value: unknown, normalizeStrings: boolean): string | null {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    if (!hasWellFormedUnicode(value)) {
      return null;
    }
    return JSON.stringify(normalizeStrings ? value.normalize('NFC') : value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(Object.is(value, -0) ? 0 : value) : null;
  }
  const arrayItems = inspectPlainTrackingArrayV2(value);
  if (arrayItems !== null) {
    const items: string[] = [];
    for (const item of arrayItems) {
      const serialized = serializeCanonicalValue(item, normalizeStrings);
      if (serialized === null) {
        return null;
      }
      items.push(serialized);
    }
    return `[${items.join(',')}]`;
  }
  const record = inspectPlainTrackingRecordV2(value);
  if (record === null) {
    return null;
  }

  const properties: string[] = [];
  for (const key of Object.keys(record).sort()) {
    if (!hasWellFormedUnicode(key)) {
      return null;
    }
    const child = record[key];
    if (child === undefined) {
      continue;
    }
    const serialized = serializeCanonicalValue(child, normalizeStrings);
    if (serialized === null) {
      return null;
    }
    const serializedKey = normalizeStrings ? key.normalize('NFC') : key;
    properties.push(`${JSON.stringify(serializedKey)}:${serialized}`);
  }
  return `{${properties.join(',')}}`;
}

/** RFC 8785/JCS-compatible representation for the bounded JSON values used by tracking. */
export function canonicalTrackingJsonV2(value: unknown): string | null {
  return serializeCanonicalValue(value, true);
}

export function trackingSerializedBytesV2(value: unknown): number | null {
  const serialized = canonicalTrackingJsonV2(value);
  return serialized === null ? null : new TextEncoder().encode(serialized).byteLength;
}

function boundedNfcString(value: unknown, maxChars: number, allowEmpty = true): string | null {
  if (typeof value !== 'string' || !hasWellFormedUnicode(value)) {
    return null;
  }
  const normalized = value.normalize('NFC');
  return normalized.length <= maxChars && (allowEmpty || normalized.length > 0) ? normalized : null;
}

const ISO_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const MILLISECONDS_PER_DAY = 86_400_000;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthLengths[month - 1] ?? 0;
}

/** Proleptic-Gregorian civil date to a day offset from 1970-01-01. */
function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** Inverse of daysFromCivil for the supported four-digit-year wire range. */
function civilFromDays(dayOffset: number): { year: number; month: number; day: number } {
  const shifted = dayOffset + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function paddedInteger(value: number, width: number): string {
  return value.toString().padStart(width, '0');
}

export function canonicalTrackingIsoV2(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) {
    return null;
  }
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3));
  const offsetHour = match[8] === 'Z' ? 0 : Number(match[10]);
  const offsetMinute = match[8] === 'Z' ? 0 : Number(match[11]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    (offsetHour === 14 && offsetMinute !== 0) ||
    offsetMinute > 59
  ) {
    return null;
  }

  const offsetDirection = match[9] === '-' ? -1 : 1;
  const offsetMilliseconds = offsetDirection * (offsetHour * 60 + offsetMinute) * 60 * 1_000;
  const utcMilliseconds =
    daysFromCivil(year, month, day) * MILLISECONDS_PER_DAY +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1_000 +
    milliseconds -
    offsetMilliseconds;
  const utcDay = Math.floor(utcMilliseconds / MILLISECONDS_PER_DAY);
  let remainder = utcMilliseconds - utcDay * MILLISECONDS_PER_DAY;
  const utcHour = Math.floor(remainder / 3_600_000);
  remainder -= utcHour * 3_600_000;
  const utcMinute = Math.floor(remainder / 60_000);
  remainder -= utcMinute * 60_000;
  const utcSecond = Math.floor(remainder / 1_000);
  const utcMillisecond = remainder - utcSecond * 1_000;
  const utcDate = civilFromDays(utcDay);
  if (utcDate.year < 0 || utcDate.year > 9_999) {
    return null;
  }

  return `${paddedInteger(utcDate.year, 4)}-${paddedInteger(utcDate.month, 2)}-${paddedInteger(utcDate.day, 2)}T${paddedInteger(utcHour, 2)}:${paddedInteger(utcMinute, 2)}:${paddedInteger(utcSecond, 2)}.${paddedInteger(utcMillisecond, 3)}Z`;
}

function normalizeStatusTransitionV2(value: unknown): StatusTransition | null {
  const record = inspectExactTrackingRecordV2(value, ['from', 'to', 'timestamp', 'note']);
  if (
    record === null ||
    (record.from !== null && !isTrackingApplicationStatusV2(record.from)) ||
    !isTrackingApplicationStatusV2(record.to) ||
    !Number.isSafeInteger(record.timestamp) ||
    (record.timestamp as number) < 0
  ) {
    return null;
  }
  const note = record.note === null ? null : boundedNfcString(record.note, TRACKING_NOTE_MAX_CHARS);
  if (record.note !== null && note === null) {
    return null;
  }
  return {
    from: record.from as ApplicationStatus | null,
    to: record.to,
    timestamp: record.timestamp as number,
    note,
  };
}

/** Normalize one bounded tracking snapshot to its canonical v2 wire representation. */
export function normalizeMissionTrackingV2(value: unknown): MissionTracking | null {
  const record = inspectExactTrackingRecordV2(
    value,
    ['missionId', 'currentStatus', 'history', 'generatedAssetIds', 'userRating', 'notes'],
    ['nextActionAt']
  );
  if (record === null || !isTrackingApplicationStatusV2(record.currentStatus)) {
    return null;
  }

  const rawHistory = inspectPlainTrackingArrayV2(record.history);
  const rawGeneratedAssetIds = inspectPlainTrackingArrayV2(record.generatedAssetIds);
  if (
    rawHistory === null ||
    rawHistory.length === 0 ||
    rawHistory.length > TRACKING_HISTORY_MAX_ITEMS ||
    rawGeneratedAssetIds === null ||
    rawGeneratedAssetIds.length > TRACKING_ASSET_IDS_MAX_ITEMS
  ) {
    return null;
  }

  const missionId = boundedNfcString(record.missionId, TRACKING_MISSION_ID_MAX_CHARS, false);
  const notes = boundedNfcString(record.notes, TRACKING_NOTES_MAX_CHARS);
  if (missionId === null || notes === null) {
    return null;
  }

  const history: StatusTransition[] = [];
  for (const raw of rawHistory) {
    const transition = normalizeStatusTransitionV2(raw);
    if (transition === null) {
      return null;
    }
    history.push(transition);
  }
  if (history[0].from !== null || history[0].to !== 'detected') {
    return null;
  }
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    if (
      current.from !== previous.to ||
      !isAllowedApplicationTransition(current.from, current.to) ||
      current.timestamp < previous.timestamp
    ) {
      return null;
    }
  }
  if (history[history.length - 1].to !== record.currentStatus) {
    return null;
  }

  const generatedAssetIds: string[] = [];
  for (const raw of rawGeneratedAssetIds) {
    const assetId = boundedNfcString(raw, TRACKING_MISSION_ID_MAX_CHARS, false);
    if (assetId === null) {
      return null;
    }
    generatedAssetIds.push(assetId);
  }

  if (
    record.userRating !== null &&
    (!Number.isInteger(record.userRating) ||
      (record.userRating as number) < 1 ||
      (record.userRating as number) > 5)
  ) {
    return null;
  }

  let nextActionAt: string | null = null;
  if (record.nextActionAt !== undefined && record.nextActionAt !== null) {
    nextActionAt = canonicalTrackingIsoV2(record.nextActionAt);
    if (nextActionAt === null) {
      return null;
    }
  }
  if (
    (record.currentStatus === 'accepted' ||
      record.currentStatus === 'rejected' ||
      record.currentStatus === 'archived') &&
    nextActionAt !== null
  ) {
    return null;
  }

  const normalized: MissionTracking = {
    missionId,
    currentStatus: record.currentStatus,
    history,
    generatedAssetIds,
    userRating: record.userRating as number | null,
    notes,
    nextActionAt,
  };
  const bytes = trackingSerializedBytesV2(normalized);
  return bytes !== null && bytes <= TRACKING_RECORD_MAX_BYTES ? normalized : null;
}

function inspectCanonicalMissionTrackingV2(value: unknown): MissionTracking | null {
  const sourceSnapshot = snapshotTrackingJsonValueV2(value);
  if (sourceSnapshot === TRACKING_JSON_SNAPSHOT_FAILED) {
    return null;
  }
  const normalized = normalizeMissionTrackingV2(sourceSnapshot);
  return normalized !== null &&
    serializeCanonicalValue(sourceSnapshot, false) === serializeCanonicalValue(normalized, false)
    ? normalized
    : null;
}

export function isCanonicalMissionTrackingV2(value: unknown): value is MissionTracking {
  return inspectCanonicalMissionTrackingV2(value) !== null;
}

type TrackingUndoBaseV2 = NonNullable<PersistedTrackingEnvelopeV2['undoBase']>;

function inspectUndoBaseV2(
  value: unknown,
  envelope: Pick<PersistedTrackingEnvelopeV2, 'missionId' | 'revision' | 'lastMutationId'>
): TrackingUndoBaseV2 | null {
  const record = inspectExactTrackingRecordV2(value, [
    'previousTracking',
    'expectedCurrentRevision',
    'expectedCurrentMutationId',
  ]);
  if (
    record === null ||
    record.expectedCurrentRevision !== envelope.revision ||
    record.expectedCurrentMutationId !== envelope.lastMutationId ||
    !isCanonicalTrackingUuidV4(record.expectedCurrentMutationId)
  ) {
    return null;
  }
  const previousTracking =
    record.previousTracking === null
      ? null
      : inspectCanonicalMissionTrackingV2(record.previousTracking);
  if (
    record.previousTracking !== null &&
    (previousTracking === null || previousTracking.missionId !== envelope.missionId)
  ) {
    return null;
  }
  return {
    previousTracking,
    expectedCurrentRevision: record.expectedCurrentRevision as number,
    expectedCurrentMutationId: record.expectedCurrentMutationId,
  };
}

export function inspectPersistedTrackingEnvelopeV2(
  value: unknown
): PersistedTrackingEnvelopeV2 | null {
  const record = inspectExactTrackingRecordV2(value, [
    'schemaVersion',
    'dataEpoch',
    'missionId',
    'kind',
    'tracking',
    'revision',
    'lastMutationId',
    'lastMutationIntent',
    'committedAt',
    'undoBase',
  ]);
  if (
    record === null ||
    record.schemaVersion !== 2 ||
    !isCanonicalTrackingUuidV4(record.dataEpoch) ||
    boundedNfcString(record.missionId, TRACKING_MISSION_ID_MAX_CHARS, false) !== record.missionId ||
    !Number.isSafeInteger(record.revision) ||
    (record.revision as number) < 1 ||
    typeof record.committedAt !== 'number' ||
    !Number.isFinite(record.committedAt) ||
    record.committedAt < 0
  ) {
    return null;
  }

  const mutationPairValid =
    (record.lastMutationId === null &&
      record.lastMutationIntent === null &&
      record.revision === 1 &&
      record.undoBase === null) ||
    (isCanonicalTrackingUuidV4(record.lastMutationId) &&
      isTrackingMutationIntentV2(record.lastMutationIntent));
  if (!mutationPairValid) {
    return null;
  }

  let trackingSnapshot: MissionTracking | null;
  if (record.kind === 'record') {
    trackingSnapshot = inspectCanonicalMissionTrackingV2(record.tracking);
    if (trackingSnapshot === null || trackingSnapshot.missionId !== record.missionId) {
      return null;
    }
  } else if (record.kind === 'tombstone' && record.tracking === null) {
    trackingSnapshot = null;
  } else {
    return null;
  }

  let undoBase: TrackingUndoBaseV2 | null = null;
  if (record.undoBase !== null) {
    if (record.lastMutationId === null) {
      return null;
    }
    undoBase = inspectUndoBaseV2(record.undoBase, {
      missionId: record.missionId as string,
      revision: record.revision as number,
      lastMutationId: record.lastMutationId as string,
    });
    if (undoBase === null) {
      return null;
    }
  }

  const snapshot: PersistedTrackingEnvelopeV2 = {
    schemaVersion: 2,
    dataEpoch: record.dataEpoch,
    missionId: record.missionId as string,
    kind: record.kind,
    tracking: trackingSnapshot,
    revision: record.revision as number,
    lastMutationId: record.lastMutationId as string | null,
    lastMutationIntent: record.lastMutationIntent as TrackingMutationIntentV2 | null,
    committedAt: record.committedAt,
    undoBase,
  };
  const bytes = trackingSerializedBytesV2(snapshot);
  return bytes !== null && bytes <= TRACKING_ENVELOPE_MAX_BYTES ? snapshot : null;
}

export function isPersistedTrackingEnvelopeV2(
  value: unknown
): value is PersistedTrackingEnvelopeV2 {
  return inspectPersistedTrackingEnvelopeV2(value) !== null;
}

export function inspectTrackingUndoTokenV2(value: unknown): TrackingUndoTokenV2 | null {
  const record = inspectExactTrackingRecordV2(value, [
    'version',
    'dataEpoch',
    'missionId',
    'previousTracking',
    'expectedCurrentRevision',
    'expectedCurrentMutationId',
  ]);
  if (
    record === null ||
    record.version !== 2 ||
    !isCanonicalTrackingUuidV4(record.dataEpoch) ||
    boundedNfcString(record.missionId, TRACKING_MISSION_ID_MAX_CHARS, false) !== record.missionId ||
    !Number.isSafeInteger(record.expectedCurrentRevision) ||
    (record.expectedCurrentRevision as number) < 1 ||
    !isCanonicalTrackingUuidV4(record.expectedCurrentMutationId)
  ) {
    return null;
  }
  const previousTracking =
    record.previousTracking === null
      ? null
      : inspectCanonicalMissionTrackingV2(record.previousTracking);
  if (
    record.previousTracking !== null &&
    (previousTracking === null || previousTracking.missionId !== record.missionId)
  ) {
    return null;
  }
  return {
    version: 2,
    dataEpoch: record.dataEpoch,
    missionId: record.missionId as string,
    previousTracking,
    expectedCurrentRevision: record.expectedCurrentRevision as number,
    expectedCurrentMutationId: record.expectedCurrentMutationId,
  };
}

export function isTrackingUndoTokenV2(value: unknown): value is TrackingUndoTokenV2 {
  return inspectTrackingUndoTokenV2(value) !== null;
}

function phaseFieldsValid(value: Record<string, unknown>): boolean {
  const phase = value.phase as TrackingMutationPhaseV2;
  const committedRevision = value.committedRevision;
  const failureCode = value.failureCode;
  const settledAt = value.settledAt;
  if (phase === 'prepared') {
    return committedRevision === null && failureCode === null && settledAt === null;
  }
  if (
    typeof settledAt !== 'number' ||
    !Number.isFinite(settledAt) ||
    typeof value.createdAt !== 'number' ||
    settledAt < value.createdAt
  ) {
    return false;
  }
  if (phase === 'committed') {
    return (
      Number.isSafeInteger(committedRevision) &&
      Number.isSafeInteger(value.baseRevision) &&
      (value.baseRevision as number) < Number.MAX_SAFE_INTEGER &&
      committedRevision === (value.baseRevision as number) + 1 &&
      failureCode === null
    );
  }
  if (committedRevision !== null || typeof failureCode !== 'string') {
    return false;
  }
  if (phase === 'cancelled') {
    return failureCode === 'CANCELLED';
  }
  if (phase === 'worker_restarted') {
    return failureCode === 'WORKER_RESTARTED';
  }
  if (phase === 'failed') {
    if (!['PERSIST_FAILED', 'TRANSPORT_ERROR', 'WORKER_RESTARTED'].includes(failureCode)) {
      return false;
    }
  } else if (
    ![
      'INVALID_TRANSITION',
      'INVALID_DETAILS',
      'INVALID_RESTORE',
      'STALE_UNDO',
      'APPLICATION_BUSY',
      'PROTOCOL_ERROR',
      'EPOCH_CHANGED',
    ].includes(failureCode)
  ) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(ERROR_ALLOWED_INTENTS, failureCode)) {
    return false;
  }
  const code = failureCode as Exclude<SerializedApplicationTrackingErrorV2['code'], 'LOAD_FAILED'>;
  return (
    isTrackingMutationIntentV2(value.intent) && ERROR_ALLOWED_INTENTS[code].includes(value.intent)
  );
}

export function inspectPersistedTrackingMutationV2(
  value: unknown
): PersistedTrackingMutationV2 | null {
  const record = inspectExactTrackingRecordV2(value, [
    'schemaVersion',
    'dataEpoch',
    'mutationId',
    'missionId',
    'intent',
    'commandDigest',
    'phase',
    'ownerWorkerEpoch',
    'baseRevision',
    'baseLastMutationId',
    'committedRevision',
    'failureCode',
    'createdAt',
    'settledAt',
  ]);
  if (
    record === null ||
    record.schemaVersion !== 2 ||
    !isCanonicalTrackingUuidV4(record.dataEpoch) ||
    !isCanonicalTrackingUuidV4(record.mutationId) ||
    boundedNfcString(record.missionId, TRACKING_MISSION_ID_MAX_CHARS, false) !== record.missionId ||
    !isTrackingMutationIntentV2(record.intent) ||
    !isTrackingCommandDigestV2(record.commandDigest) ||
    !['prepared', 'committed', 'rejected', 'failed', 'cancelled', 'worker_restarted'].includes(
      record.phase as string
    ) ||
    !isCanonicalTrackingUuidV4(record.ownerWorkerEpoch) ||
    !Number.isSafeInteger(record.baseRevision) ||
    (record.baseRevision as number) < 0 ||
    (record.baseLastMutationId !== null && !isCanonicalTrackingUuidV4(record.baseLastMutationId)) ||
    record.baseLastMutationId === record.mutationId ||
    !Number.isSafeInteger(record.createdAt) ||
    (record.createdAt as number) < 0 ||
    !phaseFieldsValid(record)
  ) {
    return null;
  }
  const baseTokenValid =
    (record.baseRevision === 0 && record.baseLastMutationId === null) ||
    (record.baseRevision === 1 &&
      (record.baseLastMutationId === null ||
        isCanonicalTrackingUuidV4(record.baseLastMutationId))) ||
    ((record.baseRevision as number) >= 2 && isCanonicalTrackingUuidV4(record.baseLastMutationId));
  if (!baseTokenValid) {
    return null;
  }
  const snapshot: PersistedTrackingMutationV2 = {
    schemaVersion: 2,
    dataEpoch: record.dataEpoch,
    mutationId: record.mutationId,
    missionId: record.missionId as string,
    intent: record.intent,
    commandDigest: record.commandDigest,
    phase: record.phase as TrackingMutationPhaseV2,
    ownerWorkerEpoch: record.ownerWorkerEpoch,
    baseRevision: record.baseRevision as number,
    baseLastMutationId: record.baseLastMutationId as string | null,
    committedRevision: record.committedRevision as number | null,
    failureCode: record.failureCode as SerializedApplicationTrackingErrorV2['code'] | null,
    createdAt: record.createdAt as number,
    settledAt: record.settledAt as number | null,
  };
  const bytes = trackingSerializedBytesV2(snapshot);
  return bytes !== null && bytes <= TRACKING_LEDGER_MAX_BYTES ? snapshot : null;
}

export function isPersistedTrackingMutationV2(
  value: unknown
): value is PersistedTrackingMutationV2 {
  return inspectPersistedTrackingMutationV2(value) !== null;
}

export function trackingValuesEqualV2(left: unknown, right: unknown): boolean {
  const leftJson = canonicalTrackingJsonV2(left);
  return leftJson !== null && leftJson === canonicalTrackingJsonV2(right);
}

export function trackingIdentityMatchesV2(
  left: TrackingControlIdentityV2,
  right: TrackingControlIdentityV2
): boolean {
  const leftSnapshot = inspectTrackingControlIdentityV2(left);
  const rightSnapshot = inspectTrackingControlIdentityV2(right);
  return (
    leftSnapshot !== null &&
    rightSnapshot !== null &&
    leftSnapshot.dataEpoch === rightSnapshot.dataEpoch &&
    leftSnapshot.missionId === rightSnapshot.missionId &&
    leftSnapshot.mutationId === rightSnapshot.mutationId &&
    leftSnapshot.intent === rightSnapshot.intent &&
    leftSnapshot.commandDigest === rightSnapshot.commandDigest
  );
}

export function inspectTrackingControlIdentityV2(value: unknown): TrackingControlIdentityV2 | null {
  const record = inspectExactTrackingRecordV2(value, [
    'dataEpoch',
    'missionId',
    'mutationId',
    'intent',
    'commandDigest',
  ]);
  if (
    record === null ||
    !isCanonicalTrackingUuidV4(record.dataEpoch) ||
    boundedNfcString(record.missionId, TRACKING_MISSION_ID_MAX_CHARS, false) !== record.missionId ||
    !isCanonicalTrackingUuidV4(record.mutationId) ||
    !isTrackingMutationIntentV2(record.intent) ||
    !isTrackingCommandDigestV2(record.commandDigest)
  ) {
    return null;
  }
  return {
    dataEpoch: record.dataEpoch,
    missionId: record.missionId as string,
    mutationId: record.mutationId,
    intent: record.intent,
    commandDigest: record.commandDigest,
  };
}

export function isTrackingControlIdentityV2(value: unknown): value is TrackingControlIdentityV2 {
  return inspectTrackingControlIdentityV2(value) !== null;
}

export function createTrackingMutationErrorV2(
  identity: TrackingControlIdentityV2,
  code: Exclude<SerializedApplicationTrackingErrorV2['code'], 'LOAD_FAILED'>
): SerializedApplicationTrackingErrorV2 {
  const configured = MUTATION_ERROR_MESSAGES[code];
  const message =
    typeof configured === 'string'
      ? configured
      : (configured[identity.intent] ?? 'La réponse du suivi est invalide.');
  return {
    version: 2,
    dataEpoch: identity.dataEpoch,
    requestId: null,
    code,
    intent: identity.intent,
    missionId: identity.missionId,
    mutationId: identity.mutationId,
    message,
    recoverable: !NON_RECOVERABLE_CODES.has(code),
  };
}

function inspectSerializedTrackingMutationErrorV2(
  value: unknown,
  identity: TrackingControlIdentityV2
): SerializedApplicationTrackingErrorV2 | null {
  const identitySnapshot = inspectTrackingControlIdentityV2(identity);
  const record = inspectExactTrackingRecordV2(value, [
    'version',
    'dataEpoch',
    'requestId',
    'code',
    'intent',
    'missionId',
    'mutationId',
    'message',
    'recoverable',
  ]);
  if (
    identitySnapshot === null ||
    record === null ||
    record.version !== 2 ||
    record.dataEpoch !== identitySnapshot.dataEpoch ||
    record.requestId !== null ||
    record.intent !== identitySnapshot.intent ||
    record.missionId !== identitySnapshot.missionId ||
    record.mutationId !== identitySnapshot.mutationId ||
    typeof record.code !== 'string' ||
    record.code === 'LOAD_FAILED' ||
    !Object.prototype.hasOwnProperty.call(MUTATION_ERROR_MESSAGES, record.code)
  ) {
    return null;
  }
  const code = record.code as Exclude<SerializedApplicationTrackingErrorV2['code'], 'LOAD_FAILED'>;
  if (!ERROR_ALLOWED_INTENTS[code].includes(identitySnapshot.intent)) {
    return null;
  }
  const expected = createTrackingMutationErrorV2(identitySnapshot, code);
  return record.message === expected.message && record.recoverable === expected.recoverable
    ? expected
    : null;
}

export function isSerializedTrackingMutationErrorV2(
  value: unknown,
  identity: TrackingControlIdentityV2
): value is SerializedApplicationTrackingErrorV2 {
  return inspectSerializedTrackingMutationErrorV2(value, identity) !== null;
}

export function isValidTrackingSettlementV2(
  value: unknown,
  identity: TrackingControlIdentityV2,
  actorCanonical: PersistedTrackingEnvelopeV2 | null
): value is TrackingSettlementV2 {
  const identitySnapshot = inspectTrackingControlIdentityV2(identity);
  const record = inspectExactTrackingRecordV2(value, [
    'version',
    'dataEpoch',
    'missionId',
    'mutationId',
    'intent',
    'commandDigest',
    'deduplicated',
    'outcome',
    'canonical',
    'committedRevision',
    'undo',
    'failure',
    'broadcastRequired',
  ]);
  const actorSnapshot =
    actorCanonical === null ? null : inspectPersistedTrackingEnvelopeV2(actorCanonical);
  if (
    identitySnapshot === null ||
    record === null ||
    record.version !== 2 ||
    typeof record.deduplicated !== 'boolean' ||
    record.dataEpoch !== identitySnapshot.dataEpoch ||
    record.missionId !== identitySnapshot.missionId ||
    record.mutationId !== identitySnapshot.mutationId ||
    record.intent !== identitySnapshot.intent ||
    record.commandDigest !== identitySnapshot.commandDigest ||
    (actorCanonical !== null && actorSnapshot === null)
  ) {
    return false;
  }

  const canonical =
    record.canonical === null ? null : inspectPersistedTrackingEnvelopeV2(record.canonical);
  if (record.canonical !== null && canonical === null) {
    return false;
  }
  if (
    actorSnapshot !== null &&
    (actorSnapshot.dataEpoch !== identitySnapshot.dataEpoch ||
      actorSnapshot.missionId !== identitySnapshot.missionId)
  ) {
    return false;
  }
  if (
    canonical !== null &&
    (canonical.dataEpoch !== identitySnapshot.dataEpoch ||
      canonical.missionId !== identitySnapshot.missionId)
  ) {
    return false;
  }
  if (actorSnapshot !== null) {
    if (canonical === null || canonical.revision < actorSnapshot.revision) {
      return false;
    }
    if (
      canonical.revision === actorSnapshot.revision &&
      !trackingValuesEqualV2(canonical, actorSnapshot)
    ) {
      return false;
    }
  }

  if (record.outcome === 'committed_current') {
    const undo = inspectTrackingUndoTokenV2(record.undo);
    if (
      canonical === null ||
      !Number.isSafeInteger(record.committedRevision) ||
      record.committedRevision !== canonical.revision ||
      canonical.lastMutationId !== identitySnapshot.mutationId ||
      canonical.lastMutationIntent !== identitySnapshot.intent ||
      canonical.undoBase === null ||
      undo === null ||
      record.failure !== null ||
      record.broadcastRequired !== !record.deduplicated
    ) {
      return false;
    }
    return (
      undo.dataEpoch === identitySnapshot.dataEpoch &&
      undo.missionId === identitySnapshot.missionId &&
      undo.expectedCurrentRevision === canonical.undoBase.expectedCurrentRevision &&
      undo.expectedCurrentMutationId === canonical.undoBase.expectedCurrentMutationId &&
      trackingValuesEqualV2(undo.previousTracking, canonical.undoBase.previousTracking)
    );
  }

  if (record.outcome === 'committed_superseded') {
    return (
      canonical !== null &&
      Number.isSafeInteger(record.committedRevision) &&
      (record.committedRevision as number) >= 1 &&
      canonical.revision > (record.committedRevision as number) &&
      canonical.lastMutationId !== identitySnapshot.mutationId &&
      record.undo === null &&
      record.failure === null &&
      record.broadcastRequired === false
    );
  }

  const failure = inspectSerializedTrackingMutationErrorV2(record.failure, identitySnapshot);
  if (
    !['not_committed', 'inconsistent', 'uncertain'].includes(record.outcome as string) ||
    record.committedRevision !== null ||
    record.undo !== null ||
    record.broadcastRequired !== false ||
    failure === null
  ) {
    return false;
  }
  if (record.outcome === 'inconsistent') {
    return failure.code === 'PROTOCOL_ERROR';
  }
  if (record.outcome === 'uncertain') {
    return ['PERSIST_FAILED', 'TRANSPORT_ERROR', 'WORKER_RESTARTED'].includes(failure.code);
  }
  return canonical?.lastMutationId !== identitySnapshot.mutationId;
}
