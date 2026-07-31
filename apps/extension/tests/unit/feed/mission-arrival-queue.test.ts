import { describe, expect, it } from 'vitest';
import * as arrival from '../../../src/lib/core/feed/mission-arrival-queue';

type State = ReturnType<typeof arrival.createMissionArrivalQueueState>;

const loadedFacts = {
  feedState: 'loaded' as const,
  ownedScan: null,
  networkOnline: true,
};

function dispatch(state: State, event: arrival.MissionArrivalQueueEvent) {
  return arrival.transitionMissionArrivalQueue(state, event);
}

function initialized(feedState: 'empty' | 'loaded' = 'loaded'): State {
  let state = arrival.createMissionArrivalQueueState();
  state = dispatch(state, {
    type: 'FEED_FACTS_CHANGED',
    revision: 0,
    facts: { ...loadedFacts, feedState },
  }).state;
  return dispatch(state, {
    type: 'PENDING_SCOPE_CHANGED',
    scopeRevision: 0,
    feedRevision: 0,
    enabledSources: new Set(['free-work']),
    orderedVisibleFeedIds: feedState === 'loaded' ? ['base-1'] : [],
    visibleFeedIds: new Set(feedState === 'loaded' ? ['base-1'] : []),
  }).state;
}

function withPending(ids = ['new-1']): State {
  return dispatch(initialized(), {
    type: 'ALARM_MISSIONS_RECEIVED',
    scopeRevision: 0,
    candidates: ids.map((id) => ({ id, source: 'free-work' as const })),
  }).state;
}

function applying(ids = ['new-1']): State {
  return dispatch(withPending(ids), { type: 'APPLY_REQUESTED' }).state;
}

function preparedCandidate(state: State, orderedAllFeedIds = ['base-1', 'new-1']) {
  if (state.stack.value !== 'applying') {
    throw new Error('expected applying state');
  }
  return {
    applyId: state.stack.applyId,
    appliedRevision: state.stack.applied.revision,
    scopeRevision: state.stack.appliedScopeRevision,
    baseFeedRevision: state.stack.baseFeedRevision,
    orderedAllFeedIds,
    orderedUnseenIds: ['new-1'],
  };
}

describe('approved Feed presentation', () => {
  it.each([
    [
      {
        feedState: 'loading',
        ownedScan: { operationId: 'scan-1', state: 'scanning' },
        networkOnline: true,
      },
      { value: 'loading', primaryAction: 'cancel', actionEnabled: true, arrivalCompatible: false },
    ],
    [
      { feedState: 'empty', ownedScan: null, networkOnline: false },
      { value: 'empty', primaryAction: 'start', actionEnabled: false, arrivalCompatible: false },
    ],
    [
      { feedState: 'error', ownedScan: null, networkOnline: true },
      { value: 'error', primaryAction: 'retry', actionEnabled: true, arrivalCompatible: false },
    ],
    [
      loadedFacts,
      { value: 'loaded', primaryAction: 'start', actionEnabled: true, arrivalCompatible: true },
    ],
  ] as const)('derives the sole action %#', (facts, expected) => {
    expect(arrival.deriveFeedPresentation(facts)).toEqual(expected);
  });

  it('fails closed for an owned scan outside loading', () => {
    expect(
      arrival.deriveFeedPresentation({
        feedState: 'loaded',
        ownedScan: { operationId: 'scan-1', state: 'scanning' },
        networkOnline: true,
      })
    ).toMatchObject({ value: 'inconsistent', primaryAction: null });
  });
});

describe('approved ephemeral arrival reducer', () => {
  it('routes an exact cold alarm to one synchronous hydration effect', () => {
    const result = dispatch(initialized('empty'), {
      type: 'ALARM_MISSIONS_RECEIVED',
      scopeRevision: 0,
      candidates: [
        { id: 'cold-1', source: 'free-work' },
        { id: 'disabled', source: 'malt' },
      ],
    });

    expect(result.state.stack).toEqual({ value: 'empty' });
    expect(result.effects).toEqual([
      {
        type: 'hydrate-cold-feed-sync',
        scopeRevision: 0,
        baseFeedRevision: 0,
        orderedIds: ['cold-1'],
      },
    ]);
  });

  it('captures warm arrivals in order and ignores stale scope publications', () => {
    let state = initialized();
    state = dispatch(state, {
      type: 'ALARM_MISSIONS_RECEIVED',
      scopeRevision: 0,
      candidates: [
        { id: 'base-1', source: 'free-work' },
        { id: 'new-1', source: 'free-work' },
        { id: 'new-1', source: 'free-work' },
        { id: 'disabled', source: 'malt' },
      ],
    }).state;
    expect(state.stack).toMatchObject({
      value: 'collapsed',
      pending: { orderedIds: ['new-1'] },
    });

    const stale = dispatch(state, {
      type: 'ALARM_MISSIONS_RECEIVED',
      scopeRevision: -1,
      candidates: [{ id: 'stale', source: 'free-work' }],
    });
    expect(stale.state).toBe(state);
    expect(stale.effects).toEqual([]);
  });

  it('freezes exact base order and emits one single-flight load', () => {
    const first = dispatch(withPending(), { type: 'APPLY_REQUESTED' });
    expect(first.state.stack).toMatchObject({
      value: 'applying',
      applyId: 1,
      baseFeedRevision: 0,
      orderedBaseFeedIds: ['base-1'],
      applied: { orderedIds: ['new-1'] },
    });
    expect(first.effects).toEqual([
      expect.objectContaining({
        type: 'load-feed-projection',
        applyId: 1,
        baseFeedRevision: 0,
        orderedBaseFeedIds: ['base-1'],
      }),
    ]);

    const duplicate = dispatch(first.state, { type: 'APPLY_REQUESTED' });
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.effects).toEqual([]);
  });

  it.each([
    ['foreign', ['base-1', 'foreign', 'new-1']],
    ['omitted', ['base-1']],
    ['reordered', ['new-1', 'base-1']],
  ])('rejects a %s prepared projection before any write', (_name, orderedIds) => {
    const state = applying();
    const result = dispatch(state, {
      type: 'PROJECTION_PREPARED',
      candidate: preparedCandidate(state, orderedIds),
    });
    expect(result.state.stack).toMatchObject({
      value: 'projection-error',
      reason: 'INVALID_CANDIDATE',
      pending: { orderedIds: ['new-1'] },
    });
    expect(result.effects).not.toContainEqual(
      expect.objectContaining({ type: 'write-feed-projection-sync' })
    );
  });

  it('retains arrivals received during apply and advances Feed/scope atomically on success', () => {
    let state = applying();
    state = dispatch(state, {
      type: 'ALARM_MISSIONS_RECEIVED',
      scopeRevision: 0,
      candidates: [{ id: 'new-2', source: 'free-work' }],
    }).state;
    expect(state.stack).toMatchObject({
      value: 'applying',
      latest: { orderedIds: ['new-2'] },
    });

    const prepared = dispatch(state, {
      type: 'PROJECTION_PREPARED',
      candidate: preparedCandidate(state),
    });
    expect(prepared.effects).toEqual([
      { type: 'write-feed-projection-sync', candidate: preparedCandidate(state) },
    ]);

    const candidate = preparedCandidate(state);
    const committed = dispatch(prepared.state, {
      type: 'PROJECTION_WRITE_SUCCEEDED',
      applyId: candidate.applyId,
      appliedRevision: candidate.appliedRevision,
      scopeRevision: candidate.scopeRevision,
      baseFeedRevision: candidate.baseFeedRevision,
    });
    expect(committed.state).toMatchObject({
      scopeRevision: 1,
      feedRevision: 1,
      orderedVisibleFeedIds: ['base-1', 'new-1'],
      stack: { value: 'collapsed', pending: { orderedIds: ['new-2'] } },
    });

    const oldPublication = dispatch(committed.state, {
      type: 'ALARM_MISSIONS_RECEIVED',
      scopeRevision: 0,
      candidates: [{ id: 'new-1', source: 'free-work' }],
    });
    expect(oldPublication.state).toBe(committed.state);
  });

  it('invalidates an apply before write when scope changes', () => {
    const state = applying();
    const invalidated = dispatch(state, {
      type: 'PENDING_SCOPE_CHANGED',
      scopeRevision: 1,
      feedRevision: 0,
      enabledSources: new Set(),
      orderedVisibleFeedIds: ['base-1'],
      visibleFeedIds: new Set(['base-1']),
    });
    expect(invalidated.state.stack).toEqual({ value: 'empty' });

    const late = dispatch(invalidated.state, {
      type: 'PROJECTION_PREPARED',
      candidate: preparedCandidate(state),
    });
    expect(late.state).toBe(invalidated.state);
    expect(late.effects).toEqual([]);
  });

  it('keeps projection failures retryable without consuming pending', () => {
    const state = applying();
    const failed = dispatch(state, {
      type: 'PROJECTION_LOAD_FAILED',
      applyId: 1,
      appliedRevision: 1,
      scopeRevision: 0,
      baseFeedRevision: 0,
      reason: 'CATALOGUE_READ_FAILED',
    });
    expect(failed.state.stack).toMatchObject({
      value: 'projection-error',
      pending: { orderedIds: ['new-1'] },
    });
    expect(dispatch(failed.state, { type: 'RETRY_REQUESTED' }).effects).toEqual([
      expect.objectContaining({ type: 'load-feed-projection', applyId: 2 }),
    ]);
  });

  it('uses actor-wide non-reusable seen IDs and retries only after persistence failure', () => {
    let state = dispatch(initialized(), {
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['new-1'],
    }).state;
    state = dispatch(state, { type: 'DWELL_STARTED', missionId: 'new-1', now: 0 }).state;
    const first = dispatch(state, { type: 'DWELL_ELAPSED', missionId: 'new-1', now: 1500 });
    expect(first.effects).toEqual([{ type: 'persist-seen', missionId: 'new-1', seenOpId: 1 }]);

    const failed = dispatch(first.state, {
      type: 'SEEN_PERSIST_FAILED',
      missionId: 'new-1',
      seenOpId: 1,
    }).state;
    state = dispatch(failed, { type: 'EXIT_NEW_QUEUE' }).state;
    state = dispatch(state, { type: 'ENTER_NEW_QUEUE', orderedUnseenIds: ['new-1'] }).state;
    state = dispatch(state, { type: 'DWELL_STARTED', missionId: 'new-1', now: 2000 }).state;
    const second = dispatch(state, {
      type: 'DWELL_ELAPSED',
      missionId: 'new-1',
      now: 3500,
    });
    expect(second.effects).toEqual([{ type: 'persist-seen', missionId: 'new-1', seenOpId: 2 }]);
  });

  it('preserves a seen operation across apply success so its ACK can project Vu', () => {
    let state = dispatch(initialized(), {
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['new-1'],
    }).state;
    state = dispatch(state, { type: 'DWELL_STARTED', missionId: 'new-1', now: 0 }).state;
    state = dispatch(state, { type: 'DWELL_ELAPSED', missionId: 'new-1', now: 1500 }).state;
    state = dispatch(state, {
      type: 'ALARM_MISSIONS_RECEIVED',
      scopeRevision: 0,
      candidates: [{ id: 'new-1', source: 'free-work' }],
    }).state;
    state = dispatch(state, { type: 'APPLY_REQUESTED' }).state;
    const candidate = preparedCandidate(state);
    state = dispatch(state, { type: 'PROJECTION_PREPARED', candidate }).state;
    state = dispatch(state, {
      type: 'PROJECTION_WRITE_SUCCEEDED',
      applyId: candidate.applyId,
      appliedRevision: candidate.appliedRevision,
      scopeRevision: candidate.scopeRevision,
      baseFeedRevision: candidate.baseFeedRevision,
    }).state;

    expect(state.queue).toMatchObject({
      value: 'stable-queue',
      seenInFlight: { 'new-1': 1 },
    });
    const acked = dispatch(state, {
      type: 'SEEN_PERSISTED',
      missionId: 'new-1',
      seenOpId: 1,
    }).state;
    expect(acked.queue).toMatchObject({
      confirmedSeenIds: ['new-1'],
      seenInFlight: {},
    });
  });

  it('disposes on unmount and ignores every late write', () => {
    const state = applying();
    const disposed = dispatch(state, { type: 'FEED_UNMOUNTED' }).state;
    expect(disposed).toMatchObject({ lifecycle: 'disposed', stack: { value: 'empty' } });
    const late = dispatch(disposed, {
      type: 'PROJECTION_PREPARED',
      candidate: preparedCandidate(state),
    });
    expect(late.state).toBe(disposed);
    expect(late.effects).toEqual([]);
  });
});
