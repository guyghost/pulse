import type { MissionSource } from '../types/mission';

export const DWELL_THRESHOLD_MS = 1500;
export const DWELL_INTERSECTION_RATIO = 0.6;
export const ARRIVAL_PREVIEW_LIMIT = 3;

export type FeedState = 'empty' | 'loading' | 'loaded' | 'error';
export type OwnedActiveScanState =
  'starting' | 'scanning' | 'retrying' | 'persisting' | 'cancelling';

export interface OwnedActiveScan {
  operationId: string;
  state: OwnedActiveScanState;
}

export interface FeedPresentationFacts {
  feedState: FeedState;
  ownedScan: OwnedActiveScan | null;
  networkOnline: boolean;
}

export type FeedPresentation =
  | {
      value: 'loading';
      primaryAction: 'cancel';
      actionEnabled: boolean;
      arrivalCompatible: false;
    }
  | {
      value: 'empty';
      primaryAction: 'start';
      actionEnabled: boolean;
      arrivalCompatible: false;
    }
  | {
      value: 'error';
      primaryAction: 'retry';
      actionEnabled: boolean;
      arrivalCompatible: false;
    }
  | {
      value: 'loaded';
      primaryAction: 'start';
      actionEnabled: boolean;
      arrivalCompatible: true;
    }
  | {
      value: 'inconsistent';
      primaryAction: null;
      actionEnabled: false;
      arrivalCompatible: false;
    };

export interface ArrivalCandidate {
  id: string;
  source: MissionSource;
}

export interface PendingSnapshot {
  revision: number;
  orderedIds: readonly string[];
  sourceById: Readonly<Record<string, MissionSource>>;
}

export type MissionDwellSignal =
  | { type: 'started'; at: number }
  | { type: 'cancelled'; at: number }
  | { type: 'elapsed'; at: number };

export type MissionQueueRegion =
  | { value: 'all-feed' }
  | {
      value: 'stable-queue';
      queueIds: readonly string[];
      dwells: Readonly<Record<string, number>>;
      seenInFlight: Readonly<Record<string, number>>;
      confirmedSeenIds: readonly string[];
    };

export type ProjectionFailureReason =
  'CATALOGUE_READ_FAILED' | 'CATALOGUE_INCOMPLETE' | 'FEED_WRITE_FAILED' | 'INVALID_CANDIDATE';

export interface ProjectionCandidate {
  applyId: number;
  appliedRevision: number;
  scopeRevision: number;
  baseFeedRevision: number;
  orderedAllFeedIds: readonly string[];
  orderedUnseenIds: readonly string[];
}

export type MissionArrivalStackRegion =
  | { value: 'empty' }
  | { value: 'collapsed'; pending: PendingSnapshot }
  | { value: 'open'; pending: PendingSnapshot; previewIds: readonly string[] }
  | {
      value: 'applying';
      applyId: number;
      applied: PendingSnapshot;
      appliedScopeRevision: number;
      baseFeedRevision: number;
      orderedBaseFeedIds: readonly string[];
      latest: PendingSnapshot | null;
      prepared: ProjectionCandidate | null;
      returnView: 'collapsed' | 'open';
      previewIds: readonly string[];
    }
  | {
      value: 'projection-error';
      pending: PendingSnapshot;
      failedApplyId: number;
      reason: ProjectionFailureReason;
      drawerOpen: boolean;
      previewIds: readonly string[];
    };

export interface MissionArrivalQueueState {
  lifecycle: 'active' | 'disposed';
  presentationRevision: number;
  presentation: FeedPresentation;
  pendingRevision: number;
  applyOrdinal: number;
  seenOperationOrdinal: number;
  scopeRevision: number;
  feedRevision: number;
  enabledSources: ReadonlySet<MissionSource>;
  orderedVisibleFeedIds: readonly string[];
  visibleFeedIds: ReadonlySet<string>;
  queue: MissionQueueRegion;
  stack: MissionArrivalStackRegion;
}

export type MissionArrivalQueueEvent =
  | { type: 'FEED_FACTS_CHANGED'; revision: number; facts: FeedPresentationFacts }
  | {
      type: 'PENDING_SCOPE_CHANGED';
      scopeRevision: number;
      feedRevision: number;
      enabledSources: ReadonlySet<MissionSource>;
      orderedVisibleFeedIds: readonly string[];
      visibleFeedIds: ReadonlySet<string>;
    }
  | {
      type: 'ALARM_MISSIONS_RECEIVED';
      scopeRevision: number;
      candidates: readonly ArrivalCandidate[];
    }
  | { type: 'OPEN_STACK' }
  | { type: 'CLOSE_STACK' }
  | { type: 'APPLY_REQUESTED' }
  | { type: 'PROJECTION_PREPARED'; candidate: ProjectionCandidate }
  | {
      type: 'PROJECTION_LOAD_FAILED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
      reason: 'CATALOGUE_READ_FAILED' | 'CATALOGUE_INCOMPLETE';
    }
  | {
      type: 'PROJECTION_WRITE_SUCCEEDED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
    }
  | {
      type: 'PROJECTION_WRITE_FAILED';
      applyId: number;
      appliedRevision: number;
      scopeRevision: number;
      baseFeedRevision: number;
    }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'ENTER_NEW_QUEUE'; orderedUnseenIds: readonly string[] }
  | { type: 'EXIT_NEW_QUEUE' }
  | { type: 'SORT_QUEUE'; orderedQueueIds: readonly string[] }
  | { type: 'DWELL_STARTED'; missionId: string; now: number }
  | { type: 'DWELL_CANCELLED'; missionId: string }
  | { type: 'DWELL_ELAPSED'; missionId: string; now: number }
  | { type: 'SEEN_PERSISTED'; missionId: string; seenOpId: number }
  | { type: 'SEEN_PERSIST_FAILED'; missionId: string; seenOpId: number }
  | { type: 'FEED_UNMOUNTED' }
  | { type: 'PANEL_CLOSED' };

export type MissionArrivalQueueEffect =
  | {
      type: 'hydrate-cold-feed-sync';
      scopeRevision: number;
      baseFeedRevision: number;
      orderedIds: readonly string[];
    }
  | {
      type: 'load-feed-projection';
      applyId: number;
      snapshot: PendingSnapshot;
      scopeRevision: number;
      baseFeedRevision: number;
      orderedBaseFeedIds: readonly string[];
      queueMode: 'all-feed' | 'stable-queue';
    }
  | { type: 'write-feed-projection-sync'; candidate: ProjectionCandidate }
  | { type: 'persist-seen'; missionId: string; seenOpId: number }
  | { type: 'focus-drawer-heading' }
  | { type: 'focus-stack-trigger' }
  | { type: 'scroll-feed-start' }
  | { type: 'report-arrival-error'; reason: ProjectionFailureReason }
  | { type: 'report-seen-error'; missionId: string; seenOpId: number };

export interface MissionArrivalQueueTransition {
  state: MissionArrivalQueueState;
  effects: readonly MissionArrivalQueueEffect[];
}

export interface MissionArrivalStackView {
  state: 'empty' | 'collapsed' | 'open' | 'refreshing' | 'refresh-error';
  count: number;
  pendingIds: readonly string[];
  previewIds: readonly string[];
  errorMessage: string | null;
  drawerOpen: boolean;
}

const INCONSISTENT_PRESENTATION: FeedPresentation = {
  value: 'inconsistent',
  primaryAction: null,
  actionEnabled: false,
  arrivalCompatible: false,
};

function isSafeOrdinal(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function isExactPermutation(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((id) => right.includes(id))
  );
}

function isOrderedSubset(subset: readonly string[], complete: readonly string[]): boolean {
  if (!sameIds(subset, uniqueIds(subset)) || !sameIds(complete, uniqueIds(complete))) {
    return false;
  }
  let cursor = 0;
  for (const id of complete) {
    if (subset[cursor] === id) {
      cursor += 1;
    }
  }
  return cursor === subset.length;
}

function unchanged(state: MissionArrivalQueueState): MissionArrivalQueueTransition {
  return { state, effects: [] };
}

function sourcesForCandidates(
  candidates: readonly ArrivalCandidate[]
): Readonly<Record<string, MissionSource>> {
  const result: Record<string, MissionSource> = {};
  for (const candidate of candidates) {
    if (!(candidate.id in result)) {
      result[candidate.id] = candidate.source;
    }
  }
  return result;
}

function createSnapshot(
  revision: number,
  orderedIds: readonly string[],
  sourceById: Readonly<Record<string, MissionSource>>
): PendingSnapshot {
  const filteredSources: Record<string, MissionSource> = {};
  for (const id of orderedIds) {
    const source = sourceById[id];
    if (source) {
      filteredSources[id] = source;
    }
  }
  return { revision, orderedIds: [...orderedIds], sourceById: filteredSources };
}

function filterSnapshot(
  snapshot: PendingSnapshot,
  enabledSources: ReadonlySet<MissionSource>,
  visibleFeedIds: ReadonlySet<string>,
  revision: number
): PendingSnapshot | null {
  const orderedIds = snapshot.orderedIds.filter((id) => {
    const source = snapshot.sourceById[id];
    return source !== undefined && enabledSources.has(source) && !visibleFeedIds.has(id);
  });
  return orderedIds.length === 0 ? null : createSnapshot(revision, orderedIds, snapshot.sourceById);
}

function mergeSnapshots(
  left: PendingSnapshot | null,
  right: PendingSnapshot | null,
  revision: number
): PendingSnapshot | null {
  if (!left) {
    return right ? createSnapshot(revision, right.orderedIds, right.sourceById) : null;
  }
  if (!right) {
    return createSnapshot(revision, left.orderedIds, left.sourceById);
  }
  const orderedIds = uniqueIds([...left.orderedIds, ...right.orderedIds]);
  return createSnapshot(revision, orderedIds, { ...left.sourceById, ...right.sourceById });
}

function stackPending(stack: MissionArrivalStackRegion): PendingSnapshot | null {
  switch (stack.value) {
    case 'collapsed':
    case 'open':
    case 'projection-error':
      return stack.pending;
    case 'applying':
      return stack.applied;
    case 'empty':
      return null;
  }
}

function pendingStack(snapshot: PendingSnapshot | null): MissionArrivalStackRegion {
  return snapshot ? { value: 'collapsed', pending: snapshot } : { value: 'empty' };
}

function nextRevision(state: MissionArrivalQueueState): number | null {
  const revision = state.pendingRevision + 1;
  return Number.isSafeInteger(revision) ? revision : null;
}

function filterPendingForState(
  state: MissionArrivalQueueState,
  snapshot: PendingSnapshot | null,
  enabledSources = state.enabledSources,
  visibleFeedIds = state.visibleFeedIds
): { snapshot: PendingSnapshot | null; pendingRevision: number } {
  if (!snapshot) {
    return { snapshot: null, pendingRevision: state.pendingRevision };
  }
  const revision = nextRevision(state);
  if (revision === null) {
    return { snapshot: null, pendingRevision: state.pendingRevision };
  }
  const filtered = filterSnapshot(snapshot, enabledSources, visibleFeedIds, revision);
  if (filtered && sameIds(filtered.orderedIds, snapshot.orderedIds)) {
    return { snapshot, pendingRevision: state.pendingRevision };
  }
  return { snapshot: filtered, pendingRevision: filtered ? revision : state.pendingRevision };
}

function mergePendingForState(
  state: MissionArrivalQueueState,
  left: PendingSnapshot | null,
  right: PendingSnapshot | null
): { snapshot: PendingSnapshot | null; pendingRevision: number } {
  const ids = uniqueIds([...(left?.orderedIds ?? []), ...(right?.orderedIds ?? [])]);
  if (ids.length === 0) {
    return { snapshot: null, pendingRevision: state.pendingRevision };
  }
  if (left && sameIds(ids, left.orderedIds)) {
    return { snapshot: left, pendingRevision: state.pendingRevision };
  }
  const revision = nextRevision(state);
  if (revision === null) {
    return { snapshot: left, pendingRevision: state.pendingRevision };
  }
  return {
    snapshot: mergeSnapshots(left, right, revision),
    pendingRevision: revision,
  };
}

function applyingMatches(
  stack: Extract<MissionArrivalStackRegion, { value: 'applying' }>,
  correlation: {
    applyId: number;
    appliedRevision: number;
    scopeRevision: number;
    baseFeedRevision: number;
  }
): boolean {
  return (
    stack.applyId === correlation.applyId &&
    stack.applied.revision === correlation.appliedRevision &&
    stack.appliedScopeRevision === correlation.scopeRevision &&
    stack.baseFeedRevision === correlation.baseFeedRevision
  );
}

export function deriveFeedPresentation(facts: Readonly<FeedPresentationFacts>): FeedPresentation {
  const validOwned =
    facts.ownedScan !== null &&
    facts.ownedScan.operationId.trim().length > 0 &&
    ['starting', 'scanning', 'retrying', 'persisting', 'cancelling'].includes(
      facts.ownedScan.state
    );
  if (facts.feedState === 'loading' && validOwned) {
    return {
      value: 'loading',
      primaryAction: 'cancel',
      actionEnabled: facts.ownedScan?.state !== 'cancelling',
      arrivalCompatible: false,
    };
  }
  if (facts.ownedScan !== null) {
    return INCONSISTENT_PRESENTATION;
  }
  if (facts.feedState === 'empty') {
    return {
      value: 'empty',
      primaryAction: 'start',
      actionEnabled: facts.networkOnline,
      arrivalCompatible: false,
    };
  }
  if (facts.feedState === 'error') {
    return {
      value: 'error',
      primaryAction: 'retry',
      actionEnabled: facts.networkOnline,
      arrivalCompatible: false,
    };
  }
  if (facts.feedState === 'loaded') {
    return {
      value: 'loaded',
      primaryAction: 'start',
      actionEnabled: facts.networkOnline,
      arrivalCompatible: true,
    };
  }
  return INCONSISTENT_PRESENTATION;
}

export function mergeAppliedIntoBase(
  orderedBaseFeedIds: readonly string[],
  orderedAppliedIds: readonly string[]
): readonly string[] {
  if (
    !sameIds(orderedBaseFeedIds, uniqueIds(orderedBaseFeedIds)) ||
    !sameIds(orderedAppliedIds, uniqueIds(orderedAppliedIds)) ||
    orderedAppliedIds.some((id) => orderedBaseFeedIds.includes(id))
  ) {
    return [];
  }
  return [...orderedBaseFeedIds, ...orderedAppliedIds];
}

export function selectPendingArrivalIds(input: {
  candidates: readonly ArrivalCandidate[];
  enabledSources: ReadonlySet<MissionSource>;
  visibleFeedIds: ReadonlySet<string>;
  excludedApplyIds: ReadonlySet<string>;
}): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    if (
      candidate.id.length === 0 ||
      seen.has(candidate.id) ||
      !input.enabledSources.has(candidate.source) ||
      input.visibleFeedIds.has(candidate.id) ||
      input.excludedApplyIds.has(candidate.id)
    ) {
      continue;
    }
    seen.add(candidate.id);
    result.push(candidate.id);
  }
  return result;
}

export function createMissionArrivalQueueState(): MissionArrivalQueueState {
  return {
    lifecycle: 'active',
    presentationRevision: -1,
    presentation: INCONSISTENT_PRESENTATION,
    pendingRevision: 0,
    applyOrdinal: 0,
    seenOperationOrdinal: 0,
    scopeRevision: -1,
    feedRevision: -1,
    enabledSources: new Set(),
    orderedVisibleFeedIds: [],
    visibleFeedIds: new Set(),
    queue: { value: 'all-feed' },
    stack: { value: 'empty' },
  };
}

function failApplying(
  state: MissionArrivalQueueState,
  stack: Extract<MissionArrivalStackRegion, { value: 'applying' }>,
  reason: ProjectionFailureReason
): MissionArrivalQueueTransition {
  const merged = mergePendingForState(state, stack.applied, stack.latest);
  const filtered = filterPendingForState(
    { ...state, pendingRevision: merged.pendingRevision },
    merged.snapshot
  );
  if (!filtered.snapshot) {
    return {
      state: { ...state, pendingRevision: filtered.pendingRevision, stack: { value: 'empty' } },
      effects: [{ type: 'report-arrival-error', reason }],
    };
  }
  return {
    state: {
      ...state,
      pendingRevision: filtered.pendingRevision,
      stack: {
        value: 'projection-error',
        pending: filtered.snapshot,
        failedApplyId: stack.applyId,
        reason,
        drawerOpen: stack.returnView === 'open',
        previewIds: stack.previewIds.filter((id) => filtered.snapshot?.orderedIds.includes(id)),
      },
    },
    effects: [{ type: 'report-arrival-error', reason }],
  };
}

function beginApply(
  state: MissionArrivalQueueState,
  pending: PendingSnapshot,
  returnView: 'collapsed' | 'open',
  previewIds: readonly string[]
): MissionArrivalQueueTransition {
  const applyId = state.applyOrdinal + 1;
  if (!Number.isSafeInteger(applyId) || state.scopeRevision < 0 || state.feedRevision < 0) {
    return unchanged(state);
  }
  const nextStack: Extract<MissionArrivalStackRegion, { value: 'applying' }> = {
    value: 'applying',
    applyId,
    applied: pending,
    appliedScopeRevision: state.scopeRevision,
    baseFeedRevision: state.feedRevision,
    orderedBaseFeedIds: [...state.orderedVisibleFeedIds],
    latest: null,
    prepared: null,
    returnView,
    previewIds: [...previewIds],
  };
  return {
    state: { ...state, applyOrdinal: applyId, stack: nextStack },
    effects: [
      {
        type: 'load-feed-projection',
        applyId,
        snapshot: pending,
        scopeRevision: state.scopeRevision,
        baseFeedRevision: state.feedRevision,
        orderedBaseFeedIds: [...state.orderedVisibleFeedIds],
        queueMode: state.queue.value,
      },
    ],
  };
}

export function transitionMissionArrivalQueue(
  state: MissionArrivalQueueState,
  event: MissionArrivalQueueEvent
): MissionArrivalQueueTransition {
  if (state.lifecycle === 'disposed') {
    return unchanged(state);
  }

  switch (event.type) {
    case 'FEED_FACTS_CHANGED': {
      if (!isSafeOrdinal(event.revision) || event.revision <= state.presentationRevision) {
        return unchanged(state);
      }
      const presentation = deriveFeedPresentation(event.facts);
      const base = { ...state, presentationRevision: event.revision, presentation };
      if (presentation.value !== 'loaded' && state.stack.value === 'applying') {
        const merged = mergePendingForState(base, state.stack.applied, state.stack.latest);
        return {
          state: {
            ...base,
            pendingRevision: merged.pendingRevision,
            stack: pendingStack(merged.snapshot),
          },
          effects: [],
        };
      }
      return { state: base, effects: [] };
    }

    case 'PENDING_SCOPE_CHANGED': {
      if (
        !isSafeOrdinal(event.scopeRevision) ||
        event.scopeRevision <= state.scopeRevision ||
        !isSafeOrdinal(event.feedRevision) ||
        event.feedRevision < state.feedRevision ||
        !sameIds(event.orderedVisibleFeedIds, uniqueIds(event.orderedVisibleFeedIds)) ||
        !sameSet(new Set(event.orderedVisibleFeedIds), event.visibleFeedIds) ||
        (event.feedRevision === state.feedRevision &&
          !sameIds(event.orderedVisibleFeedIds, state.orderedVisibleFeedIds))
      ) {
        return unchanged(state);
      }
      const base: MissionArrivalQueueState = {
        ...state,
        scopeRevision: event.scopeRevision,
        feedRevision: event.feedRevision,
        enabledSources: new Set(event.enabledSources),
        orderedVisibleFeedIds: [...event.orderedVisibleFeedIds],
        visibleFeedIds: new Set(event.visibleFeedIds),
      };
      if (state.stack.value === 'empty') {
        return { state: base, effects: [] };
      }
      if (state.stack.value === 'applying') {
        const merged = mergePendingForState(base, state.stack.applied, state.stack.latest);
        const filtered = filterPendingForState(
          { ...base, pendingRevision: merged.pendingRevision },
          merged.snapshot,
          base.enabledSources,
          base.visibleFeedIds
        );
        return {
          state: {
            ...base,
            pendingRevision: filtered.pendingRevision,
            stack: pendingStack(filtered.snapshot),
          },
          effects: [],
        };
      }
      const pending = stackPending(state.stack);
      const filtered = filterPendingForState(
        base,
        pending,
        base.enabledSources,
        base.visibleFeedIds
      );
      if (!filtered.snapshot) {
        return {
          state: { ...base, pendingRevision: filtered.pendingRevision, stack: { value: 'empty' } },
          effects: [],
        };
      }
      let stack: MissionArrivalStackRegion;
      if (state.stack.value === 'open') {
        stack = {
          value: 'open',
          pending: filtered.snapshot,
          previewIds: state.stack.previewIds.filter((id) =>
            filtered.snapshot?.orderedIds.includes(id)
          ),
        };
      } else if (state.stack.value === 'projection-error') {
        stack = {
          ...state.stack,
          pending: filtered.snapshot,
          previewIds: state.stack.previewIds.filter((id) =>
            filtered.snapshot?.orderedIds.includes(id)
          ),
        };
      } else {
        stack = { value: 'collapsed', pending: filtered.snapshot };
      }
      return {
        state: { ...base, pendingRevision: filtered.pendingRevision, stack },
        effects: [],
      };
    }

    case 'ALARM_MISSIONS_RECEIVED': {
      if (event.scopeRevision !== state.scopeRevision || state.scopeRevision < 0) {
        return unchanged(state);
      }
      const excluded =
        state.stack.value === 'applying'
          ? new Set(state.stack.applied.orderedIds)
          : new Set<string>();
      const orderedIds = selectPendingArrivalIds({
        candidates: event.candidates,
        enabledSources: state.enabledSources,
        visibleFeedIds: state.visibleFeedIds,
        excludedApplyIds: excluded,
      });
      if (orderedIds.length === 0) {
        return unchanged(state);
      }
      if (state.presentation.value === 'empty' && state.orderedVisibleFeedIds.length === 0) {
        return {
          state,
          effects: [
            {
              type: 'hydrate-cold-feed-sync',
              scopeRevision: state.scopeRevision,
              baseFeedRevision: state.feedRevision,
              orderedIds,
            },
          ],
        };
      }
      if (state.presentation.value !== 'loaded') {
        return unchanged(state);
      }
      const revision = nextRevision(state);
      if (revision === null) {
        return unchanged(state);
      }
      const incoming = createSnapshot(revision, orderedIds, sourcesForCandidates(event.candidates));
      if (state.stack.value === 'applying') {
        const merged = mergePendingForState(state, state.stack.latest, incoming);
        return {
          state: {
            ...state,
            pendingRevision: merged.pendingRevision,
            stack: { ...state.stack, latest: merged.snapshot },
          },
          effects: [],
        };
      }
      if (state.stack.value === 'projection-error') {
        const merged = mergePendingForState(state, state.stack.pending, incoming);
        return {
          state: {
            ...state,
            pendingRevision: merged.pendingRevision,
            stack: { ...state.stack, pending: merged.snapshot ?? state.stack.pending },
          },
          effects: [],
        };
      }
      const current = stackPending(state.stack);
      const merged = mergePendingForState(state, current, incoming);
      if (!merged.snapshot) {
        return unchanged(state);
      }
      if (state.stack.value === 'open') {
        return {
          state: {
            ...state,
            pendingRevision: merged.pendingRevision,
            stack: { ...state.stack, pending: merged.snapshot },
          },
          effects: [],
        };
      }
      return {
        state: {
          ...state,
          pendingRevision: merged.pendingRevision,
          stack: { value: 'collapsed', pending: merged.snapshot },
        },
        effects: [],
      };
    }

    case 'OPEN_STACK':
      if (state.stack.value === 'collapsed') {
        return {
          state: {
            ...state,
            stack: {
              value: 'open',
              pending: state.stack.pending,
              previewIds: state.stack.pending.orderedIds.slice(0, ARRIVAL_PREVIEW_LIMIT),
            },
          },
          effects: [{ type: 'focus-drawer-heading' }],
        };
      }
      if (state.stack.value === 'projection-error') {
        return {
          state: { ...state, stack: { ...state.stack, drawerOpen: true } },
          effects: [{ type: 'focus-drawer-heading' }],
        };
      }
      return unchanged(state);

    case 'CLOSE_STACK':
      if (state.stack.value === 'open') {
        return {
          state: { ...state, stack: { value: 'collapsed', pending: state.stack.pending } },
          effects: [{ type: 'focus-stack-trigger' }],
        };
      }
      if (state.stack.value === 'projection-error') {
        return {
          state: { ...state, stack: { ...state.stack, drawerOpen: false } },
          effects: [{ type: 'focus-stack-trigger' }],
        };
      }
      return unchanged(state);

    case 'APPLY_REQUESTED': {
      if (state.presentation.value !== 'loaded') {
        return unchanged(state);
      }
      if (state.stack.value === 'collapsed') {
        return beginApply(state, state.stack.pending, 'collapsed', []);
      }
      if (state.stack.value === 'open') {
        return beginApply(state, state.stack.pending, 'open', state.stack.previewIds);
      }
      return unchanged(state);
    }

    case 'RETRY_REQUESTED':
      if (state.presentation.value === 'loaded' && state.stack.value === 'projection-error') {
        return beginApply(
          state,
          state.stack.pending,
          state.stack.drawerOpen ? 'open' : 'collapsed',
          state.stack.previewIds
        );
      }
      return unchanged(state);

    case 'PROJECTION_PREPARED': {
      if (
        state.stack.value !== 'applying' ||
        state.presentation.value !== 'loaded' ||
        !applyingMatches(state.stack, event.candidate) ||
        state.scopeRevision !== event.candidate.scopeRevision ||
        state.feedRevision !== event.candidate.baseFeedRevision ||
        !sameIds(state.orderedVisibleFeedIds, state.stack.orderedBaseFeedIds)
      ) {
        return unchanged(state);
      }
      const expected = mergeAppliedIntoBase(
        state.stack.orderedBaseFeedIds,
        state.stack.applied.orderedIds
      );
      if (
        expected.length === 0 ||
        !sameIds(event.candidate.orderedAllFeedIds, expected) ||
        !isOrderedSubset(event.candidate.orderedUnseenIds, expected)
      ) {
        return failApplying(state, state.stack, 'INVALID_CANDIDATE');
      }
      return {
        state: { ...state, stack: { ...state.stack, prepared: event.candidate } },
        effects: [{ type: 'write-feed-projection-sync', candidate: event.candidate }],
      };
    }

    case 'PROJECTION_LOAD_FAILED':
      return state.stack.value === 'applying' && applyingMatches(state.stack, event)
        ? failApplying(state, state.stack, event.reason)
        : unchanged(state);

    case 'PROJECTION_WRITE_FAILED':
      return state.stack.value === 'applying' && applyingMatches(state.stack, event)
        ? failApplying(state, state.stack, 'FEED_WRITE_FAILED')
        : unchanged(state);

    case 'PROJECTION_WRITE_SUCCEEDED': {
      if (
        state.stack.value !== 'applying' ||
        !state.stack.prepared ||
        !applyingMatches(state.stack, event) ||
        state.scopeRevision !== event.scopeRevision ||
        state.feedRevision !== event.baseFeedRevision ||
        !sameIds(state.orderedVisibleFeedIds, state.stack.orderedBaseFeedIds)
      ) {
        return unchanged(state);
      }
      const nextScopeRevision = state.scopeRevision + 1;
      const nextFeedRevision = state.feedRevision + 1;
      if (!Number.isSafeInteger(nextScopeRevision) || !Number.isSafeInteger(nextFeedRevision)) {
        return failApplying(state, state.stack, 'FEED_WRITE_FAILED');
      }
      const candidate = state.stack.prepared;
      const nextVisible = new Set(candidate.orderedAllFeedIds);
      const filteredLatest = filterPendingForState(
        state,
        state.stack.latest,
        state.enabledSources,
        nextVisible
      );
      let queue = state.queue;
      if (queue.value === 'stable-queue') {
        const ids = new Set(candidate.orderedUnseenIds);
        queue = {
          value: 'stable-queue',
          queueIds: [...candidate.orderedUnseenIds],
          dwells: Object.fromEntries(
            Object.entries(queue.dwells).filter(([missionId]) => ids.has(missionId))
          ),
          seenInFlight: { ...queue.seenInFlight },
          confirmedSeenIds: queue.confirmedSeenIds.filter((missionId) => ids.has(missionId)),
        };
      }
      return {
        state: {
          ...state,
          scopeRevision: nextScopeRevision,
          feedRevision: nextFeedRevision,
          orderedVisibleFeedIds: [...candidate.orderedAllFeedIds],
          visibleFeedIds: nextVisible,
          pendingRevision: filteredLatest.pendingRevision,
          queue,
          stack: pendingStack(filteredLatest.snapshot),
        },
        effects: [{ type: 'scroll-feed-start' }],
      };
    }

    case 'ENTER_NEW_QUEUE':
      return {
        state: {
          ...state,
          queue: {
            value: 'stable-queue',
            queueIds: uniqueIds(event.orderedUnseenIds),
            dwells: {},
            seenInFlight: {},
            confirmedSeenIds: [],
          },
        },
        effects: [],
      };

    case 'EXIT_NEW_QUEUE':
      return state.queue.value === 'all-feed'
        ? unchanged(state)
        : { state: { ...state, queue: { value: 'all-feed' } }, effects: [] };

    case 'SORT_QUEUE':
      if (
        state.queue.value !== 'stable-queue' ||
        !isExactPermutation(event.orderedQueueIds, state.queue.queueIds)
      ) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          queue: { ...state.queue, queueIds: [...event.orderedQueueIds] },
        },
        effects: [],
      };

    case 'DWELL_STARTED':
      if (
        state.queue.value !== 'stable-queue' ||
        !state.queue.queueIds.includes(event.missionId) ||
        event.missionId in state.queue.dwells ||
        event.missionId in state.queue.seenInFlight ||
        state.queue.confirmedSeenIds.includes(event.missionId) ||
        !Number.isFinite(event.now)
      ) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          queue: {
            ...state.queue,
            dwells: { ...state.queue.dwells, [event.missionId]: event.now },
          },
        },
        effects: [],
      };

    case 'DWELL_CANCELLED': {
      if (state.queue.value !== 'stable-queue' || !(event.missionId in state.queue.dwells)) {
        return unchanged(state);
      }
      const dwells = { ...state.queue.dwells };
      delete dwells[event.missionId];
      return { state: { ...state, queue: { ...state.queue, dwells } }, effects: [] };
    }

    case 'DWELL_ELAPSED': {
      if (state.queue.value !== 'stable-queue') {
        return unchanged(state);
      }
      const startedAt = state.queue.dwells[event.missionId];
      const seenOpId = state.seenOperationOrdinal + 1;
      if (
        startedAt === undefined ||
        event.missionId in state.queue.seenInFlight ||
        state.queue.confirmedSeenIds.includes(event.missionId) ||
        !Number.isFinite(event.now) ||
        event.now - startedAt < DWELL_THRESHOLD_MS ||
        !Number.isSafeInteger(seenOpId)
      ) {
        return unchanged(state);
      }
      const dwells = { ...state.queue.dwells };
      delete dwells[event.missionId];
      return {
        state: {
          ...state,
          seenOperationOrdinal: seenOpId,
          queue: {
            ...state.queue,
            dwells,
            seenInFlight: { ...state.queue.seenInFlight, [event.missionId]: seenOpId },
          },
        },
        effects: [{ type: 'persist-seen', missionId: event.missionId, seenOpId }],
      };
    }

    case 'SEEN_PERSISTED':
    case 'SEEN_PERSIST_FAILED': {
      if (
        state.queue.value !== 'stable-queue' ||
        state.queue.seenInFlight[event.missionId] !== event.seenOpId
      ) {
        return unchanged(state);
      }
      const seenInFlight = { ...state.queue.seenInFlight };
      delete seenInFlight[event.missionId];
      const confirmedSeenIds =
        event.type === 'SEEN_PERSISTED' &&
        state.queue.queueIds.includes(event.missionId) &&
        !state.queue.confirmedSeenIds.includes(event.missionId)
          ? [...state.queue.confirmedSeenIds, event.missionId]
          : state.queue.confirmedSeenIds;
      return {
        state: {
          ...state,
          queue: { ...state.queue, seenInFlight, confirmedSeenIds },
        },
        effects:
          event.type === 'SEEN_PERSIST_FAILED'
            ? [{ type: 'report-seen-error', missionId: event.missionId, seenOpId: event.seenOpId }]
            : [],
      };
    }

    case 'FEED_UNMOUNTED':
    case 'PANEL_CLOSED':
      return {
        state: { ...state, lifecycle: 'disposed', stack: { value: 'empty' } },
        effects: [],
      };
  }
}

export function getMissionArrivalStackView(
  state: MissionArrivalQueueState
): MissionArrivalStackView {
  const pending = stackPending(state.stack);
  if (!pending) {
    return {
      state: 'empty',
      count: 0,
      pendingIds: [],
      previewIds: [],
      errorMessage: null,
      drawerOpen: false,
    };
  }
  if (state.stack.value === 'applying') {
    return {
      state: 'refreshing',
      count: pending.orderedIds.length,
      pendingIds: pending.orderedIds,
      previewIds: state.stack.previewIds,
      errorMessage: null,
      drawerOpen: true,
    };
  }
  if (state.stack.value === 'projection-error') {
    return {
      state: 'refresh-error',
      count: pending.orderedIds.length,
      pendingIds: pending.orderedIds,
      previewIds: state.stack.previewIds,
      errorMessage: 'Impossible d’actualiser la file. Réessayer.',
      drawerOpen: state.stack.drawerOpen,
    };
  }
  return {
    state: state.stack.value,
    count: pending.orderedIds.length,
    pendingIds: pending.orderedIds,
    previewIds: state.stack.value === 'open' ? state.stack.previewIds : [],
    errorMessage: null,
    drawerOpen: state.stack.value === 'open',
  };
}

export function isArrivalStackRenderable(state: MissionArrivalQueueState): boolean {
  const pending = stackPending(state.stack);
  return (
    state.lifecycle === 'active' &&
    state.presentation.value === 'loaded' &&
    state.presentation.arrivalCompatible &&
    pending !== null &&
    pending.orderedIds.length > 0
  );
}
