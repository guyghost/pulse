/**
 * Tracking state module — manages mission tracking state for the UI.
 *
 * Provides reactive access to tracking records and methods for
 * status transitions, all delegated through the messaging bridge.
 */

import type { MissionTracking } from '$lib/core/types/tracking';
import { SvelteMap } from 'svelte/reactivity';
import type { ApplicationStatus } from '$lib/core/types/tracking';
import { STATUS_LABELS } from '$lib/core/types/tracking';
import { sendMessage, type BridgeMessage } from '$lib/shell/messaging/bridge';
import { validateMessage } from '$lib/shell/messaging/schemas';
import {
  ApplicationTrackingError,
  createApplicationTrackingError,
  isSerializedApplicationTrackingError,
  type ApplicationTrackingIntent,
} from '$lib/core/tracking/application-tracking-error';

export type TrackingState = 'idle' | 'loading' | 'loaded' | 'error';

export function createTrackingStore() {
  let state = $state<TrackingState>('idle');
  const trackings = new SvelteMap<string, MissionTracking>();
  let error = $state<ApplicationTrackingError | null>(null);
  let requiresCanonicalLoad = $state(false);

  function protocolError(
    intent: ApplicationTrackingIntent,
    missionId: string | null
  ): ApplicationTrackingError {
    return createApplicationTrackingError(intent, missionId, 'PROTOCOL_ERROR');
  }

  async function requestTracking(
    message: BridgeMessage,
    intent: ApplicationTrackingIntent,
    missionId: string | null
  ): Promise<BridgeMessage> {
    let rawResponse: unknown;
    try {
      rawResponse = await sendMessage(message);
    } catch {
      throw createApplicationTrackingError(intent, missionId, 'TRANSPORT_ERROR');
    }

    const validation = validateMessage(rawResponse);
    if (!validation.valid || typeof rawResponse !== 'object' || rawResponse === null) {
      throw protocolError(intent, missionId);
    }

    const response = rawResponse as BridgeMessage;
    if (response.type === 'TRACKING_FAILED') {
      if (
        !isSerializedApplicationTrackingError(response.payload) ||
        response.payload.intent !== intent ||
        response.payload.missionId !== missionId
      ) {
        throw protocolError(intent, missionId);
      }
      throw new ApplicationTrackingError(response.payload);
    }

    return response;
  }

  function normalizeFailure(
    cause: unknown,
    intent: ApplicationTrackingIntent,
    missionId: string | null
  ): ApplicationTrackingError {
    return cause instanceof ApplicationTrackingError ? cause : protocolError(intent, missionId);
  }

  function rememberFailure(failure: ApplicationTrackingError): void {
    error = failure;
    if (failure.code === 'TRANSPORT_ERROR' || failure.code === 'PROTOCOL_ERROR') {
      requiresCanonicalLoad = true;
      state = 'error';
    }
  }

  function assertMutationCanStart(
    intent: Exclude<ApplicationTrackingIntent, 'load'>,
    missionId: string
  ): void {
    if (requiresCanonicalLoad) {
      throw protocolError(intent, missionId);
    }
  }

  /**
   * Load tracking records from the service worker bridge.
   */
  async function loadTrackings(): Promise<readonly MissionTracking[]> {
    state = 'loading';
    error = null;

    try {
      const response = await requestTracking(
        {
          type: 'GET_TRACKINGS',
          payload: {},
        },
        'load',
        null
      );

      if (response.type !== 'TRACKINGS_RESULT') {
        throw protocolError('load', null);
      }
      const confirmed = response.payload;
      trackings.clear();
      for (const tracking of confirmed) {
        trackings.set(tracking.missionId, tracking);
      }
      requiresCanonicalLoad = false;
      state = 'loaded';
      return confirmed;
    } catch (cause) {
      const failure = normalizeFailure(cause, 'load', null);
      rememberFailure(failure);
      state = 'error';
      throw failure;
    }
  }

  /**
   * Transition a mission to a new status.
   */
  async function transitionStatus(
    missionId: string,
    newStatus: ApplicationStatus,
    note?: string
  ): Promise<MissionTracking> {
    error = null;
    try {
      assertMutationCanStart('transition', missionId);
      const response = await requestTracking(
        {
          type: 'UPDATE_TRACKING',
          payload: { missionId, status: newStatus, note },
        },
        'transition',
        missionId
      );

      if (response.type !== 'TRACKING_UPDATED' || response.payload.missionId !== missionId) {
        throw protocolError('transition', missionId);
      }
      trackings.set(missionId, response.payload);
      return response.payload;
    } catch (cause) {
      const failure = normalizeFailure(cause, 'transition', missionId);
      rememberFailure(failure);
      throw failure;
    }
  }

  async function updateNextActionAt(
    missionId: string,
    nextActionAt: string | null
  ): Promise<MissionTracking> {
    error = null;
    try {
      assertMutationCanStart('details', missionId);
      const response = await requestTracking(
        {
          type: 'UPDATE_TRACKING_DETAILS',
          payload: { missionId, nextActionAt },
        },
        'details',
        missionId
      );

      if (response.type !== 'TRACKING_UPDATED' || response.payload.missionId !== missionId) {
        throw protocolError('details', missionId);
      }
      trackings.set(missionId, response.payload);
      return response.payload;
    } catch (cause) {
      const failure = normalizeFailure(cause, 'details', missionId);
      rememberFailure(failure);
      throw failure;
    }
  }

  async function restoreTracking(
    missionId: string,
    previousTracking: MissionTracking | null
  ): Promise<MissionTracking | null> {
    error = null;
    try {
      assertMutationCanStart('restore', missionId);
      const response = await requestTracking(
        {
          type: 'RESTORE_TRACKING',
          payload: { missionId, tracking: previousTracking },
        },
        'restore',
        missionId
      );

      if (
        response.type !== 'TRACKING_RESTORED' ||
        response.payload.missionId !== missionId ||
        (response.payload.tracking !== null && response.payload.tracking.missionId !== missionId)
      ) {
        throw protocolError('restore', missionId);
      }
      if (response.payload.tracking) {
        trackings.set(missionId, response.payload.tracking);
      } else {
        trackings.delete(missionId);
      }
      return response.payload.tracking;
    } catch (cause) {
      const failure = normalizeFailure(cause, 'restore', missionId);
      rememberFailure(failure);
      throw failure;
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
    get requiresCanonicalLoad() {
      return requiresCanonicalLoad;
    },
    loadTrackings,
    transitionStatus,
    updateNextActionAt,
    restoreTracking,
    getTrackingForMission,
    getStatusLabel,
  };
}
