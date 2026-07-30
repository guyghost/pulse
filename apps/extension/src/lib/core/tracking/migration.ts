import { canonicalizeLegacyApplicationStage, type ApplicationStage } from '@pulse/domain';
import type { MissionTracking, StatusTransition } from '../types/tracking';
import { isCanonicalMissionTracking } from './application-tracking-contract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStage(value: unknown): ApplicationStage | null {
  return typeof value === 'string' ? canonicalizeLegacyApplicationStage(value) : null;
}

function normalizeTransition(value: unknown): StatusTransition | null {
  if (!isRecord(value)) {
    return null;
  }

  const to = normalizeStage(value.to);
  const from = value.from === null ? null : normalizeStage(value.from);
  const timestamp = value.timestamp;
  const note = value.note;

  if (
    !to ||
    (value.from !== null && !from) ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp) ||
    (note !== undefined && note !== null && typeof note !== 'string')
  ) {
    return null;
  }

  return {
    from,
    to,
    timestamp,
    note: typeof note === 'string' ? note : null,
  };
}

function normalizeHistory(value: unknown): StatusTransition[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const history: StatusTransition[] = [];
  for (const item of value) {
    const transition = normalizeTransition(item);
    if (!transition) {
      return null;
    }
    history.push(transition);
  }
  return history;
}

export function normalizeStoredMissionTracking(value: unknown): MissionTracking | null {
  if (!isRecord(value) || typeof value.missionId !== 'string') {
    return null;
  }

  const currentStatus = normalizeStage(value.currentStatus);
  if (!currentStatus) {
    return null;
  }

  const history = normalizeHistory(value.history);
  if (!history) {
    return null;
  }

  const generatedAssetIds = value.generatedAssetIds === undefined ? [] : value.generatedAssetIds;
  if (
    !Array.isArray(generatedAssetIds) ||
    !generatedAssetIds.every((item): item is string => typeof item === 'string')
  ) {
    return null;
  }

  const userRating = value.userRating === undefined ? null : value.userRating;
  if (userRating !== null && typeof userRating !== 'number') {
    return null;
  }

  const notes = value.notes === undefined ? '' : value.notes;
  if (typeof notes !== 'string') {
    return null;
  }

  if (
    value.nextActionAt !== undefined &&
    value.nextActionAt !== null &&
    typeof value.nextActionAt !== 'string'
  ) {
    return null;
  }
  const nextActionAt =
    typeof value.nextActionAt === 'string' || value.nextActionAt === null
      ? value.nextActionAt
      : null;

  const normalized: MissionTracking = {
    missionId: value.missionId,
    currentStatus,
    history,
    generatedAssetIds,
    userRating,
    notes,
    nextActionAt,
  };

  return isCanonicalMissionTracking(normalized) ? normalized : null;
}
