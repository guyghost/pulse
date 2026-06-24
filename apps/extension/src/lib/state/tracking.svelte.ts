/**
 * Tracking state module — manages mission tracking state for the UI.
 *
 * Provides reactive access to tracking records and methods for
 * status transitions, all delegated through the messaging bridge.
 */

import type { MissionTracking } from '$lib/core/types/tracking';
import type { ApplicationStatus } from '$lib/core/types/tracking';
import { STATUS_LABELS } from '$lib/core/types/tracking';
import { sendMessage } from '$lib/shell/messaging/bridge';

export type TrackingState = 'idle' | 'loading' | 'loaded' | 'error';

export function createTrackingStore() {
  let state = $state<TrackingState>('idle');
  let trackings = $state<Map<string, MissionTracking>>(new Map());
  let error = $state<string | null>(null);

  /**
   * Load tracking records from the service worker bridge.
   */
  async function loadTrackings(): Promise<void> {
    state = 'loading';
    error = null;

    try {
      const response = await sendMessage({
        type: 'GET_TRACKINGS',
        payload: {},
      });

      if (response.type === 'TRACKINGS_RESULT' && Array.isArray(response.payload)) {
        const map = new Map<string, MissionTracking>();
        for (const t of response.payload) {
          map.set(t.missionId, t);
        }
        trackings = map;
        state = 'loaded';
      } else {
        error = 'Failed to load tracking data';
        state = 'error';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load tracking data';
      state = 'error';
    }
  }

  /**
   * Transition a mission to a new status.
   */
  async function transitionStatus(
    missionId: string,
    newStatus: ApplicationStatus,
    note?: string
  ): Promise<void> {
    try {
      const response = await sendMessage({
        type: 'UPDATE_TRACKING',
        payload: { missionId, status: newStatus, note },
      });

      if (response.type === 'TRACKING_UPDATED' && response.payload) {
        const updated = response.payload;
        const newMap = new Map(trackings);
        newMap.set(updated.missionId, updated);
        trackings = newMap;
      } else {
        error = 'Failed to update tracking';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update tracking';
    }
  }

  async function updateNextActionAt(missionId: string, nextActionAt: string | null): Promise<void> {
    try {
      const response = await sendMessage({
        type: 'UPDATE_TRACKING_DETAILS',
        payload: { missionId, nextActionAt },
      });

      if (response.type === 'TRACKING_UPDATED' && response.payload) {
        const updated = response.payload;
        const newMap = new Map(trackings);
        newMap.set(updated.missionId, updated);
        trackings = newMap;
      } else {
        error = 'Failed to update next action';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update next action';
    }
  }

  async function restoreTracking(
    missionId: string,
    previousTracking: MissionTracking | null
  ): Promise<void> {
    try {
      const response = await sendMessage({
        type: 'RESTORE_TRACKING',
        payload: { missionId, tracking: previousTracking },
      });

      if (response.type === 'TRACKING_RESTORED') {
        const newMap = new Map(trackings);
        if (response.payload) {
          newMap.set(response.payload.missionId, response.payload);
        } else {
          newMap.delete(missionId);
        }
        trackings = newMap;
      } else {
        error = 'Failed to restore tracking';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore tracking';
    }
  }

  /**
   * Get tracking for a specific mission.
   */
  function getTrackingForMission(missionId: string): MissionTracking | undefined {
    return trackings.get(missionId);
  }

  /**
   * Get the status label for a mission, or null if not tracked.
   */
  function getStatusLabel(missionId: string): string | null {
    const tracking = trackings.get(missionId);
    if (!tracking) {
      return null;
    }
    return STATUS_LABELS[tracking.currentStatus];
  }

  return {
    get state() {
      return state;
    },
    get trackings() {
      return trackings;
    },
    get error() {
      return error;
    },
    loadTrackings,
    transitionStatus,
    updateNextActionAt,
    restoreTracking,
    getTrackingForMission,
    getStatusLabel,
  };
}
