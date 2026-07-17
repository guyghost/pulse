import type { Mission } from '$lib/core/types/mission';

export type ArrivalPreviewCacheSource = 'facade-pending-snapshot' | 'alarm-ingress';

export type ArrivalPreviewCacheState =
  | {
      lifecycle: 'active';
      byId: Readonly<Record<string, Mission>>;
    }
  | {
      lifecycle: 'disposed';
      byId: Readonly<Record<string, never>>;
    };

export type ArrivalPreviewCacheEvent =
  | {
      type: 'PREVIEW_OBJECTS_OBSERVED';
      source: ArrivalPreviewCacheSource;
      missions: readonly Mission[];
    }
  | {
      type: 'APPLY_CYCLE_SETTLED';
      hasRemainingPreviewMembership: boolean;
    }
  | {
      type: 'PREVIEW_CACHE_DISPOSED';
      reason: 'feed-unmounted' | 'panel-closed';
    };

export function createArrivalPreviewCacheState(
  initialMissions: readonly Mission[] = []
): ArrivalPreviewCacheState {
  const initial: ArrivalPreviewCacheState = { lifecycle: 'active', byId: {} };
  return transitionArrivalPreviewCache(initial, {
    type: 'PREVIEW_OBJECTS_OBSERVED',
    source: 'facade-pending-snapshot',
    missions: initialMissions,
  });
}

export function transitionArrivalPreviewCache(
  state: ArrivalPreviewCacheState,
  event: ArrivalPreviewCacheEvent
): ArrivalPreviewCacheState {
  if (state.lifecycle === 'disposed') {
    return state;
  }

  if (event.type === 'PREVIEW_OBJECTS_OBSERVED') {
    let nextById: Record<string, Mission> | null = null;

    for (const mission of event.missions) {
      if (Object.is(state.byId[mission.id], mission)) {
        continue;
      }
      nextById ??= { ...state.byId };
      nextById[mission.id] = mission;
    }

    return nextById === null ? state : { lifecycle: 'active', byId: nextById };
  }

  if (event.type === 'APPLY_CYCLE_SETTLED') {
    if (event.hasRemainingPreviewMembership || Object.keys(state.byId).length === 0) {
      return state;
    }
    return { lifecycle: 'active', byId: {} };
  }

  return { lifecycle: 'disposed', byId: {} };
}
