/**
 * Pure tracking state machine — manages status transitions.
 *
 * Core module: no I/O, no async, no side effects.
 * All timestamps are injected from the shell.
 */

import type { ApplicationStatus, MissionTracking, StatusTransition } from '../types/tracking';
import { VALID_TRANSITIONS } from '../types/tracking';

/**
 * Check if a transition from one status to another is valid.
 */
export const isValidTransition = (from: ApplicationStatus, to: ApplicationStatus): boolean => {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
};

/**
 * Create a fresh tracking record for a newly discovered mission.
 */
export const createTracking = (missionId: string, timestamp: number): MissionTracking => ({
  missionId,
  currentStatus: 'new',
  history: [{ from: null, to: 'new', timestamp, note: null }],
  generatedAssetIds: [],
  userRating: null,
  notes: '',
});

/**
 * Apply a status transition to a tracking record.
 *
 * Returns a new MissionTracking with updated status and history.
 * Returns null if the transition is invalid.
 *
 * @param tracking - Current tracking state
 * @param newStatus - Target status
 * @param timestamp - Epoch ms (injected from shell)
 * @param note - Optional user note
 * @returns Updated tracking, or null if transition is invalid
 */
export const transitionStatus = (
  tracking: MissionTracking,
  newStatus: ApplicationStatus,
  timestamp: number,
  note: string | null = null
): MissionTracking | null => {
  if (!isValidTransition(tracking.currentStatus, newStatus)) {
    return null;
  }

  const transition: StatusTransition = {
    from: tracking.currentStatus,
    to: newStatus,
    timestamp,
    note,
  };

  return {
    ...tracking,
    currentStatus: newStatus,
    history: [...tracking.history, transition],
  };
};

/**
 * Update user rating on a tracking record.
 * Rating must be 1-5 or null.
 */
export const setTrackingRating = (
  tracking: MissionTracking,
  rating: number | null
): MissionTracking => {
  if (rating !== null && (rating < 1 || rating > 5)) {
    return tracking;
  }
  return { ...tracking, userRating: rating };
};

/**
 * Update notes on a tracking record.
 */
export const setTrackingNotes = (tracking: MissionTracking, notes: string): MissionTracking => {
  return { ...tracking, notes };
};

/**
 * Add a generated asset ID to a tracking record.
 */
export const addGeneratedAsset = (tracking: MissionTracking, assetId: string): MissionTracking => {
  if (tracking.generatedAssetIds.includes(assetId)) {
    return tracking;
  }
  return { ...tracking, generatedAssetIds: [...tracking.generatedAssetIds, assetId] };
};

/**
 * Get the timestamp of the last status change.
 * Returns null if tracking has no history.
 */
export const getLastTransitionTime = (tracking: MissionTracking): number | null => {
  if (tracking.history.length === 0) {
    return null;
  }
  return tracking.history[tracking.history.length - 1].timestamp;
};

/**
 * Count how many missions have each status.
 */
export const countByStatus = (trackings: MissionTracking[]): Record<ApplicationStatus, number> => {
  const counts: Record<string, number> = {
    new: 0,
    interested: 0,
    applying: 0,
    applied: 0,
    rejected: 0,
    accepted: 0,
    archived: 0,
  };
  for (const t of trackings) {
    counts[t.currentStatus] = (counts[t.currentStatus] ?? 0) + 1;
  }
  return counts as Record<ApplicationStatus, number>;
};
