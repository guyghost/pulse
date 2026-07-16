import { describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import { createMissionArrivalActor } from '../../../src/lib/shell/arrival/mission-arrival-actor';

function mission(id: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Client',
    description: 'Description',
    stack: ['TypeScript'],
    tjm: 700,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: '2026-07-16T12:00:00.000Z',
    url: `https://example.test/${id}`,
    source: 'free-work',
    scrapedAt: '2026-07-16T12:00:00.000Z',
    seniority: 'senior',
    scoreBreakdown: null,
    score: 90,
    semanticScore: null,
    semanticReason: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createHarness(initial = [mission('base-1')]) {
  let feed = [...initial];
  let onReplace: (() => void) | null = null;
  const replaceFeedSync = vi.fn((next: readonly Mission[]) => {
    feed = [...next];
    onReplace?.();
  });
  const catalogue = new Map(
    [mission('base-1'), mission('new-1'), mission('new-2'), mission('new-3')].map((item) => [
      item.id,
      item,
    ])
  );
  const loadProjection = vi.fn(async (orderedIds: readonly string[]) => ({
    missions: orderedIds.map((id) => catalogue.get(id)).filter((item): item is Mission => !!item),
    orderedUnseenIds: orderedIds.filter((id) => id.startsWith('new-')),
  }));
  const persistSeen = vi.fn(async () => undefined);
  const actor = createMissionArrivalActor({
    readFeed: () => feed,
    replaceFeedSync,
    loadProjection,
    persistSeen,
  });
  actor.synchronizePresentation({
    feedState: feed.length === 0 ? 'empty' : 'loaded',
    ownedScan: null,
    networkOnline: true,
  });
  actor.synchronizeScope(new Set(['free-work']));
  return {
    actor,
    get feed() {
      return feed;
    },
    replaceFeedSync,
    loadProjection,
    persistSeen,
    setReplaceHook(hook: (() => void) | null) {
      onReplace = hook;
    },
  };
}

describe('ephemeral mission arrival actor', () => {
  it('hydrates an empty Feed exactly once and rejects a reentrant publication from the stale scope', () => {
    const harness = createHarness([]);
    harness.setReplaceHook(() => {
      harness.actor.publishAlarm([mission('new-2')]);
    });

    harness.actor.publishAlarm([mission('new-1')]);

    expect(harness.replaceFeedSync).toHaveBeenCalledTimes(1);
    expect(harness.actor.state.scopeRevision).toBe(1);
    expect(harness.actor.state.feedRevision).toBe(1);
    expect(harness.actor.state.stack).toEqual({ value: 'empty' });
  });

  it('routes the next cold publication in the new scope to pending', () => {
    const harness = createHarness([]);

    harness.actor.publishAlarm([mission('new-1')]);
    harness.actor.publishAlarm([mission('new-2')]);

    expect(harness.replaceFeedSync).toHaveBeenCalledTimes(1);
    expect(harness.feed.map((item) => item.id)).toEqual(['new-1']);
    expect(harness.actor.state.stack).toMatchObject({
      value: 'collapsed',
      pending: { orderedIds: ['new-2'] },
    });
  });

  it('keeps a warm Feed stable until one exact apply commit', async () => {
    const harness = createHarness();
    harness.actor.publishAlarm([mission('new-1'), mission('new-2')]);

    expect(harness.feed.map((item) => item.id)).toEqual(['base-1']);
    expect(harness.replaceFeedSync).not.toHaveBeenCalled();

    harness.actor.dispatch({ type: 'APPLY_REQUESTED' });
    await harness.actor.whenIdle();

    expect(harness.loadProjection).toHaveBeenCalledWith(['base-1', 'new-1', 'new-2']);
    expect(harness.replaceFeedSync).toHaveBeenCalledTimes(1);
    expect(harness.feed.map((item) => item.id)).toEqual(['base-1', 'new-1', 'new-2']);
    expect(harness.actor.state.stack.value).toBe('empty');
  });

  it('does not silently consume arrivals when the indivisible Feed write fails', async () => {
    const harness = createHarness();
    harness.actor.publishAlarm([mission('new-1')]);
    harness.replaceFeedSync.mockImplementationOnce(() => {
      throw new Error('atomic replacement failed');
    });

    harness.actor.dispatch({ type: 'APPLY_REQUESTED' });
    await harness.actor.whenIdle();

    expect(harness.feed.map((item) => item.id)).toEqual(['base-1']);
    expect(harness.actor.state.stack).toMatchObject({
      value: 'projection-error',
      pending: { orderedIds: ['new-1'] },
      reason: 'FEED_WRITE_FAILED',
    });
  });

  it('retains arrivals published while the asynchronous projection is loading', async () => {
    const harness = createHarness();
    const pendingLoad = deferred<{ missions: Mission[]; orderedUnseenIds: string[] }>();
    harness.loadProjection.mockReturnValueOnce(pendingLoad.promise);
    harness.actor.publishAlarm([mission('new-1')]);
    harness.actor.dispatch({ type: 'APPLY_REQUESTED' });
    harness.actor.publishAlarm([mission('new-2')]);

    pendingLoad.resolve({
      missions: [mission('base-1'), mission('new-1')],
      orderedUnseenIds: ['new-1'],
    });
    await harness.actor.whenIdle();

    expect(harness.feed.map((item) => item.id)).toEqual(['base-1', 'new-1']);
    expect(harness.actor.state.stack).toMatchObject({
      value: 'collapsed',
      pending: { orderedIds: ['new-2'] },
    });
  });

  it('discards late preparation after panel disposal without writing', async () => {
    const harness = createHarness();
    const pendingLoad = deferred<{ missions: Mission[]; orderedUnseenIds: string[] }>();
    harness.loadProjection.mockReturnValueOnce(pendingLoad.promise);
    harness.actor.publishAlarm([mission('new-1')]);
    harness.actor.dispatch({ type: 'APPLY_REQUESTED' });
    harness.actor.dispose();

    pendingLoad.resolve({
      missions: [mission('base-1'), mission('new-1')],
      orderedUnseenIds: ['new-1'],
    });
    await harness.actor.whenIdle();

    expect(harness.replaceFeedSync).not.toHaveBeenCalled();
    expect(harness.actor.state.lifecycle).toBe('disposed');
  });

  it('correlates seen persistence and ignores a late result after disposal', async () => {
    const harness = createHarness();
    const persistence = deferred<void>();
    harness.persistSeen.mockReturnValueOnce(persistence.promise);
    harness.actor.dispatch({ type: 'ENTER_NEW_QUEUE', orderedUnseenIds: ['base-1'] });
    harness.actor.dispatch({ type: 'DWELL_STARTED', missionId: 'base-1', now: 0 });
    harness.actor.dispatch({ type: 'DWELL_ELAPSED', missionId: 'base-1', now: 1500 });

    expect(harness.persistSeen).toHaveBeenCalledWith('base-1');
    harness.actor.dispose();
    persistence.resolve();
    await harness.actor.whenIdle();

    expect(harness.actor.state.lifecycle).toBe('disposed');
  });

  it('serializes deferred seen writes so each ACK observes the durable union', async () => {
    const harness = createHarness([mission('base-1'), mission('base-2')]);
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    let durableSeenIds: string[] = [];
    const proposedWrites: string[][] = [];
    harness.persistSeen.mockImplementation(async (missionId: string) => {
      const nextSeenIds = [...new Set([...durableSeenIds, missionId])];
      proposedWrites.push(nextSeenIds);
      await (missionId === 'base-1' ? firstWrite.promise : secondWrite.promise);
      durableSeenIds = nextSeenIds;
    });
    harness.actor.dispatch({
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['base-1', 'base-2'],
    });
    harness.actor.dispatch({ type: 'DWELL_STARTED', missionId: 'base-1', now: 0 });
    harness.actor.dispatch({ type: 'DWELL_ELAPSED', missionId: 'base-1', now: 1500 });
    harness.actor.dispatch({ type: 'DWELL_STARTED', missionId: 'base-2', now: 0 });
    harness.actor.dispatch({ type: 'DWELL_ELAPSED', missionId: 'base-2', now: 1500 });

    expect(harness.persistSeen).toHaveBeenCalledTimes(1);
    expect(harness.actor.state.queue).toMatchObject({
      confirmedSeenIds: [],
      seenInFlight: { 'base-1': 1, 'base-2': 2 },
    });

    firstWrite.resolve();
    await vi.waitFor(() => {
      expect(harness.persistSeen).toHaveBeenCalledTimes(2);
      expect(harness.actor.state.queue).toMatchObject({
        confirmedSeenIds: ['base-1'],
        seenInFlight: { 'base-2': 2 },
      });
    });
    expect(proposedWrites).toEqual([['base-1'], ['base-1', 'base-2']]);

    secondWrite.resolve();
    await harness.actor.whenIdle();
    expect(durableSeenIds).toEqual(['base-1', 'base-2']);
    expect(harness.actor.state.queue).toMatchObject({
      confirmedSeenIds: ['base-1', 'base-2'],
      seenInFlight: {},
    });
  });

  it('keeps queued durable seen writes alive after disposal and reports idle only after both settle', async () => {
    const harness = createHarness([mission('base-1'), mission('base-2')]);
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    harness.persistSeen.mockImplementation((missionId: string) =>
      missionId === 'base-1' ? firstWrite.promise : secondWrite.promise
    );
    harness.actor.dispatch({
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['base-1', 'base-2'],
    });
    harness.actor.dispatch({ type: 'DWELL_STARTED', missionId: 'base-1', now: 0 });
    harness.actor.dispatch({ type: 'DWELL_ELAPSED', missionId: 'base-1', now: 1500 });
    harness.actor.dispatch({ type: 'DWELL_STARTED', missionId: 'base-2', now: 0 });
    harness.actor.dispatch({ type: 'DWELL_ELAPSED', missionId: 'base-2', now: 1500 });
    harness.actor.dispose();
    let idleSettled = false;
    void harness.actor.whenIdle().then(() => {
      idleSettled = true;
    });

    await Promise.resolve();
    expect(harness.actor.state.lifecycle).toBe('disposed');
    expect(harness.persistSeen).toHaveBeenCalledTimes(1);
    expect(idleSettled).toBe(false);

    firstWrite.resolve();
    await vi.waitFor(() => expect(harness.persistSeen).toHaveBeenCalledTimes(2));
    expect(idleSettled).toBe(false);

    secondWrite.resolve();
    await harness.actor.whenIdle();
    expect(idleSettled).toBe(true);
  });
});
