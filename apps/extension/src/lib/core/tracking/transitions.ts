/**
 * Pure tracking state machine — manages status transitions.
 *
 * Core module: no I/O, no async, no side effects.
 * All timestamps are injected from the shell.
 */

import { APPLICATION_STAGES } from '@pulse/domain';
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
  currentStatus: 'detected',
  history: [{ from: null, to: 'detected', timestamp, note: null }],
  generatedAssetIds: [],
  userRating: null,
  notes: '',
  nextActionAt: null,
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
 * Update the next follow-up/action timestamp on a tracking record.
 * Timestamp must be an ISO-parseable date string or null.
 */
export const setTrackingNextActionAt = (
  tracking: MissionTracking,
  nextActionAt: string | null
): MissionTracking => {
  if (nextActionAt !== null && !Number.isFinite(Date.parse(nextActionAt))) {
    return tracking.nextActionAt === undefined ? { ...tracking, nextActionAt: null } : tracking;
  }

  return { ...tracking, nextActionAt };
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
 * Add a generated application asset and materialize the canonical prepared stage when possible.
 *
 * Generating a pitch/message is an explicit "prepare application" action. If the mission was only
 * detected or selected, we advance through valid pipeline transitions so Supabase receives a
 * coherent application timeline. Later terminal/advanced stages are not regressed.
 */
export const addGeneratedAssetAndMarkPrepared = (
  tracking: MissionTracking,
  assetId: string,
  timestamp: number
): MissionTracking => {
  const withAsset = addGeneratedAsset(tracking, assetId);

  if (withAsset.currentStatus === 'detected') {
    const selected = transitionStatus(
      withAsset,
      'selected',
      timestamp,
      'Mission sélectionnée automatiquement après génération.'
    );
    return selected
      ? (transitionStatus(
          selected,
          'application_prepared',
          timestamp,
          'Candidature préparée par assistant.'
        ) ?? selected)
      : withAsset;
  }

  if (withAsset.currentStatus === 'selected') {
    return (
      transitionStatus(
        withAsset,
        'application_prepared',
        timestamp,
        'Candidature préparée par assistant.'
      ) ?? withAsset
    );
  }

  return withAsset;
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
  const counts = Object.fromEntries(APPLICATION_STAGES.map((stage) => [stage, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const t of trackings) {
    counts[t.currentStatus] = (counts[t.currentStatus] ?? 0) + 1;
  }
  return counts;
};
