import type { ApplicationStatus, MissionTracking } from '../types/tracking';

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

const TERMINAL_FOLLOW_UP_STATUSES = new Set<ApplicationStatus>([
  'accepted',
  'rejected',
  'archived',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && APPLICATION_STATUSES.has(value as ApplicationStatus);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isSerializedWithinLimit(value: unknown, maxBytes: number): boolean {
  try {
    return JSON.stringify(value).length <= maxBytes;
  } catch {
    return false;
  }
}

/**
 * Task 5 canonical acknowledgement guard.
 *
 * This deliberately validates the invariants shipped by Task 5 only. Full
 * contiguous-history, revision, CAS and mutation-ID validation belongs to the
 * revisioned transaction actor introduced by Task 5b.
 */
export function isCanonicalMissionTracking(value: unknown): value is MissionTracking {
  if (!isRecord(value) || !isSerializedWithinLimit(value, 40_000)) {
    return false;
  }
  if (
    !isBoundedString(value.missionId, 256) ||
    value.missionId.length === 0 ||
    !isApplicationStatus(value.currentStatus) ||
    !Array.isArray(value.history) ||
    value.history.length === 0 ||
    value.history.length > 200 ||
    !Array.isArray(value.generatedAssetIds) ||
    value.generatedAssetIds.length > 100 ||
    !value.generatedAssetIds.every((id) => isBoundedString(id, 256)) ||
    !isBoundedString(value.notes, 10_000)
  ) {
    return false;
  }

  if (
    value.userRating !== null &&
    (typeof value.userRating !== 'number' ||
      !Number.isInteger(value.userRating) ||
      value.userRating < 1 ||
      value.userRating > 5)
  ) {
    return false;
  }

  for (const transition of value.history) {
    if (
      !isRecord(transition) ||
      (transition.from !== null && !isApplicationStatus(transition.from)) ||
      !isApplicationStatus(transition.to) ||
      typeof transition.timestamp !== 'number' ||
      !Number.isInteger(transition.timestamp) ||
      transition.timestamp < 0 ||
      (transition.note !== null && !isBoundedString(transition.note, 2048))
    ) {
      return false;
    }
  }

  const lastTransition = value.history[value.history.length - 1];
  if (lastTransition.to !== value.currentStatus) {
    return false;
  }

  if (TERMINAL_FOLLOW_UP_STATUSES.has(value.currentStatus)) {
    return value.nextActionAt === null;
  }

  return (
    value.nextActionAt === undefined ||
    value.nextActionAt === null ||
    (isBoundedString(value.nextActionAt, 64) && Number.isFinite(Date.parse(value.nextActionAt)))
  );
}
