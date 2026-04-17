/**
 * Tracking state module — manages mission tracking state for the UI.
 *
 * Provides reactive access to tracking records and methods for
 * status transitions, all delegated through the messaging bridge.
 */

import type { MissionTracking } from '$lib/core/types/tracking';
import type { ApplicationStatus } from '$lib/core/types/tracking';
import { STATUS_LABELS } from '$lib/core/types/tracking';

export type TrackingState = 'idle' | 'loading' | 'loaded' | 'error';

export function createTrackingStore() {
  let state = $state<TrackingState>('idle');
  let trackings = $state<Map<string, MissionTracking>>(new Map());
  let error = $state<string | null>(null);

  /**
   * Load tracking records (from bridge or local storage).
   */
  async function loadTrackings(): Promise<void> {
    state = 'loading';
    error = null;

    try {
      // Try bridge first (extension context)
      const { sendMessage } = await import('$lib/shell/messaging/bridge');
      const response = await sendMessage({
        type: 'GET_TRACKINGS',
        payload: {},
      });

      if (response.type === 'TRACKINGS_RESULT' && Array.isArray(response.payload)) {
        const map = new Map<string, MissionTracking>();
        for (const t of response.payload as MissionTracking[]) {
          map.set(t.missionId, t);
        }
        trackings = map;
        state = 'loaded';
      } else {
        // Fallback: load directly from storage
        await loadFromStorage();
      }
    } catch {
      // Outside extension context — load from IndexedDB directly
      await loadFromStorage();
    }
  }

  async function loadFromStorage(): Promise<void> {
    try {
      const { getAllTrackings } = await import('$lib/shell/storage/tracking');
      const records = await getAllTrackings();
      const map = new Map<string, MissionTracking>();
      for (const t of records) {
        map.set(t.missionId, t);
      }
      trackings = map;
      state = 'loaded';
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
      const { sendMessage } = await import('$lib/shell/messaging/bridge');
      const response = await sendMessage({
        type: 'UPDATE_TRACKING',
        payload: { missionId, status: newStatus, note },
      });

      if (response.type === 'TRACKING_UPDATED' && response.payload) {
        const updated = response.payload as MissionTracking;
        const newMap = new Map(trackings);
        newMap.set(updated.missionId, updated);
        trackings = newMap;
      }
    } catch {
      // Outside extension context — try direct storage
      try {
        const { getTracking, saveTracking } = await import('$lib/shell/storage/tracking');
        const { transitionStatus: transition } = await import('$lib/core/tracking/transitions');
        const { createTracking } = await import('$lib/core/tracking/transitions');

        const tracking = (await getTracking(missionId)) ?? createTracking(missionId, Date.now());
        const updated = transition(tracking, newStatus, Date.now(), note ?? null);
        if (updated) {
          await saveTracking(updated);
          const newMap = new Map(trackings);
          newMap.set(updated.missionId, updated);
          trackings = newMap;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to update tracking';
      }
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
    getTrackingForMission,
    getStatusLabel,
  };
}
