import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_PREVIEW_LIMIT,
  DWELL_THRESHOLD_MS,
  createMissionArrivalQueueState,
  transitionMissionArrivalQueue,
} from '../../../src/lib/core/feed/mission-arrival-queue';

describe('mission arrival queue model', () => {
  it('captures a deduplicated stable queue without changing the stack region', () => {
    const initial = createMissionArrivalQueueState();
    const buffered = transitionMissionArrivalQueue(initial, {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['pending-1'],
    }).state;

    const transition = transitionMissionArrivalQueue(buffered, {
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['mission-1', 'mission-1', 'mission-2'],
    });

    expect(transition.state.queue).toEqual({
      value: 'stable-queue',
      queueIds: ['mission-1', 'mission-2'],
      dwells: {},
    });
    expect(transition.state.stack).toEqual(buffered.stack);
    expect(transition.effects).toEqual([]);
  });

  it('marks a mission seen only after an uninterrupted dwell reaches the threshold', () => {
    const initial = createMissionArrivalQueueState();
    const started = transitionMissionArrivalQueue(initial, {
      type: 'DWELL_STARTED',
      missionId: 'mission-1',
      now: 100,
    }).state;

    const early = transitionMissionArrivalQueue(started, {
      type: 'DWELL_ELAPSED',
      missionId: 'mission-1',
      now: 100 + DWELL_THRESHOLD_MS - 1,
    });
    expect(early.state).toEqual(started);
    expect(early.effects).toEqual([]);

    const elapsed = transitionMissionArrivalQueue(started, {
      type: 'DWELL_ELAPSED',
      missionId: 'mission-1',
      now: 100 + DWELL_THRESHOLD_MS,
    });
    expect(elapsed.effects).toEqual([{ type: 'mark-seen', missionId: 'mission-1' }]);
    expect(elapsed.state.queue.dwells).toEqual({});
  });

  it('cancels only the matching mission dwell', () => {
    const initial = createMissionArrivalQueueState();
    const first = transitionMissionArrivalQueue(initial, {
      type: 'DWELL_STARTED',
      missionId: 'mission-1',
      now: 100,
    }).state;
    const second = transitionMissionArrivalQueue(first, {
      type: 'DWELL_STARTED',
      missionId: 'mission-2',
      now: 200,
    }).state;

    const cancelled = transitionMissionArrivalQueue(second, {
      type: 'DWELL_CANCELLED',
      missionId: 'mission-1',
    });

    expect(cancelled.state.queue.dwells).toEqual({ 'mission-2': 200 });
    expect(cancelled.effects).toEqual([]);
  });

  it('freezes at most three previews while pending arrivals continue', () => {
    const initial = createMissionArrivalQueueState();
    const buffered = transitionMissionArrivalQueue(initial, {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['n1', 'n2', 'n3', 'n4'],
    }).state;
    const opened = transitionMissionArrivalQueue(buffered, {
      type: 'OPEN_STACK',
      orderedPreviewIds: ['n1', 'n2', 'n3', 'n4'],
    });

    expect(opened.state.stack.value).toBe('open');
    expect(opened.state.stack.previewIds).toEqual(['n1', 'n2', 'n3']);
    expect(opened.state.stack.previewIds).toHaveLength(ARRIVAL_PREVIEW_LIMIT);
    expect(opened.effects).toEqual([{ type: 'focus-drawer-heading' }]);

    const updated = transitionMissionArrivalQueue(opened.state, {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['n1', 'n2', 'n3', 'n4', 'n5'],
    });
    expect(updated.state.stack.pendingIds).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(updated.state.stack.previewIds).toEqual(['n1', 'n2', 'n3']);
  });

  it('keeps queue membership intact while opening and closing arrivals', () => {
    const entered = transitionMissionArrivalQueue(createMissionArrivalQueueState(), {
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['mission-1', 'mission-2'],
    }).state;
    const buffered = transitionMissionArrivalQueue(entered, {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['n1'],
    }).state;
    const opened = transitionMissionArrivalQueue(buffered, {
      type: 'OPEN_STACK',
      orderedPreviewIds: ['n1'],
    }).state;
    const closed = transitionMissionArrivalQueue(opened, { type: 'CLOSE_STACK' });

    expect(closed.state.queue).toEqual(entered.queue);
    expect(closed.state.stack.value).toBe('collapsed');
    expect(closed.effects).toEqual([{ type: 'focus-stack-trigger' }]);
  });

  it('refreshes atomically and rebuilds only an active stable queue', () => {
    const entered = transitionMissionArrivalQueue(createMissionArrivalQueueState(), {
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['old-1'],
    }).state;
    const buffered = transitionMissionArrivalQueue(entered, {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['new-1', 'new-2'],
    }).state;
    const refreshing = transitionMissionArrivalQueue(buffered, { type: 'REFRESH_QUEUE' });

    expect(refreshing.state.stack.value).toBe('refreshing');
    expect(refreshing.effects).toEqual([{ type: 'apply-pending' }]);

    const completed = transitionMissionArrivalQueue(refreshing.state, {
      type: 'REFRESH_SUCCEEDED',
      orderedUnseenIds: ['new-1', 'new-2'],
    });
    expect(completed.state.queue).toMatchObject({
      value: 'stable-queue',
      queueIds: ['new-1', 'new-2'],
    });
    expect(completed.state.stack).toEqual({
      value: 'empty',
      pendingIds: [],
      previewIds: [],
      message: null,
    });
    expect(completed.effects).toEqual([{ type: 'scroll-feed-start' }]);
  });

  it('preserves pending arrivals on refresh failure and allows retry', () => {
    const buffered = transitionMissionArrivalQueue(createMissionArrivalQueueState(), {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['new-1'],
    }).state;
    const refreshing = transitionMissionArrivalQueue(buffered, {
      type: 'REFRESH_QUEUE',
    }).state;
    const failed = transitionMissionArrivalQueue(refreshing, {
      type: 'REFRESH_FAILED',
      message: 'Impossible d’actualiser la file. Réessayer.',
    });

    expect(failed.state.stack).toMatchObject({
      value: 'refresh-error',
      pendingIds: ['new-1'],
      message: 'Impossible d’actualiser la file. Réessayer.',
    });

    const retried = transitionMissionArrivalQueue(failed.state, { type: 'RETRY_REFRESH' });
    expect(retried.state.stack.value).toBe('refreshing');
    expect(retried.effects).toEqual([{ type: 'apply-pending' }]);
  });

  it('allows a failed drawer to collapse without interrupting an active refresh', () => {
    const buffered = transitionMissionArrivalQueue(createMissionArrivalQueueState(), {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['new-1'],
    }).state;
    const refreshing = transitionMissionArrivalQueue(buffered, { type: 'REFRESH_QUEUE' }).state;
    const failed = transitionMissionArrivalQueue(refreshing, {
      type: 'REFRESH_FAILED',
      message: 'Impossible d’actualiser la file. Réessayer.',
    }).state;

    const collapsed = transitionMissionArrivalQueue(failed, { type: 'CLOSE_STACK' });
    expect(collapsed.state.stack).toEqual({
      value: 'collapsed',
      pendingIds: ['new-1'],
      previewIds: [],
      message: null,
    });
    expect(collapsed.effects).toEqual([{ type: 'focus-stack-trigger' }]);

    const ignored = transitionMissionArrivalQueue(refreshing, { type: 'CLOSE_STACK' });
    expect(ignored.state).toBe(refreshing);
    expect(ignored.effects).toEqual([]);
  });

  it('clears only the stack on scan cancellation and resets both regions on panel close', () => {
    const entered = transitionMissionArrivalQueue(createMissionArrivalQueueState(), {
      type: 'ENTER_NEW_QUEUE',
      orderedUnseenIds: ['mission-1'],
    }).state;
    const buffered = transitionMissionArrivalQueue(entered, {
      type: 'ARRIVALS_BUFFERED',
      orderedPendingIds: ['new-1'],
    }).state;

    const cancelled = transitionMissionArrivalQueue(buffered, { type: 'SCAN_CANCELLED' });
    expect(cancelled.state.queue).toEqual(entered.queue);
    expect(cancelled.state.stack.value).toBe('empty');

    const closed = transitionMissionArrivalQueue(buffered, { type: 'PANEL_CLOSED' });
    expect(closed.state).toEqual(createMissionArrivalQueueState());
  });
});
