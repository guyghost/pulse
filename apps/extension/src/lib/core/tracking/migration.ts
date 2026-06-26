import { canonicalizeLegacyApplicationStage, type ApplicationStage } from '@pulse/domain';
import type { MissionTracking, StatusTransition } from '../types/tracking';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStage(value: unknown): ApplicationStage | null {
  return typeof value === 'string' ? canonicalizeLegacyApplicationStage(value) : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeUserRating(value: unknown): number | null {
  return typeof value === 'number' && value >= 1 && value <= 5 ? value : null;
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
    !Number.isFinite(timestamp)
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

function normalizeHistory(value: unknown): StatusTransition[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const transition = normalizeTransition(item);
        return transition ? [transition] : [];
      })
    : [];
}

export function normalizeStoredMissionTracking(value: unknown): MissionTracking | null {
  if (!isRecord(value) || typeof value.missionId !== 'string') {
    return null;
  }

  const currentStatus = normalizeStage(value.currentStatus);
  if (!currentStatus) {
    return null;
  }

  const nextActionAt =
    typeof value.nextActionAt === 'string' || value.nextActionAt === null
      ? value.nextActionAt
      : null;

  return {
    missionId: value.missionId,
    currentStatus,
    history: normalizeHistory(value.history),
    generatedAssetIds: normalizeStringArray(value.generatedAssetIds),
    userRating: normalizeUserRating(value.userRating),
    notes: typeof value.notes === 'string' ? value.notes : '',
    nextActionAt,
  };
}
