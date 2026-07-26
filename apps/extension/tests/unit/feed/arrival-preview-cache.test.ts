import { describe, expect, it } from 'vitest';
import {
  createArrivalPreviewCacheState,
  transitionArrivalPreviewCache,
} from '../../../src/lib/core/feed/arrival-preview-cache';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(id: string, title = `Mission ${id}`): Mission {
  return {
    id,
    title,
    client: 'Client',
    description: 'Description',
    stack: ['TypeScript'],
    tjm: 700,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: `https://example.com/${id}`,
    source: 'hiway',
    scrapedAt: new Date('2026-07-16T12:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: 88,
    semanticScore: null,
    semanticReason: null,
  };
}

describe('arrival preview cache', () => {
  it('keeps the exact state identity for empty and identical observations', () => {
    const mission = makeMission('mission-1');
    const initial = createArrivalPreviewCacheState([mission]);

    const afterEmpty = transitionArrivalPreviewCache(initial, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source: 'facade-pending-snapshot',
      missions: [],
    });
    const afterFreshWrapper = transitionArrivalPreviewCache(afterEmpty, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source: 'facade-pending-snapshot',
      missions: [...[mission]],
    });

    expect(afterEmpty).toBe(initial);
    expect(afterFreshWrapper).toBe(initial);
    expect(afterFreshWrapper.byId).toBe(initial.byId);
  });

  it('merges additions and changed mission objects without dropping unrelated previews', () => {
    const first = makeMission('mission-1');
    const second = makeMission('mission-2');
    const updatedFirst = makeMission('mission-1', 'Mission mise à jour');
    const initial = createArrivalPreviewCacheState([first]);

    const withSecond = transitionArrivalPreviewCache(initial, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source: 'alarm-ingress',
      missions: [second],
    });
    const withUpdate = transitionArrivalPreviewCache(withSecond, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source: 'facade-pending-snapshot',
      missions: [updatedFirst],
    });

    expect(withSecond).not.toBe(initial);
    expect(withSecond.byId).toEqual({ 'mission-1': first, 'mission-2': second });
    expect(withUpdate.byId).toEqual({ 'mission-1': updatedFirst, 'mission-2': second });
  });

  it('clears only when an Apply cycle settles without remaining preview membership', () => {
    const initial = createArrivalPreviewCacheState([makeMission('mission-1')]);

    const retained = transitionArrivalPreviewCache(initial, {
      type: 'APPLY_CYCLE_SETTLED',
      hasRemainingPreviewMembership: true,
    });
    const cleared = transitionArrivalPreviewCache(retained, {
      type: 'APPLY_CYCLE_SETTLED',
      hasRemainingPreviewMembership: false,
    });
    const clearedAgain = transitionArrivalPreviewCache(cleared, {
      type: 'APPLY_CYCLE_SETTLED',
      hasRemainingPreviewMembership: false,
    });

    expect(retained).toBe(initial);
    expect(cleared.lifecycle).toBe('active');
    expect(cleared.byId).toEqual({});
    expect(clearedAgain).toBe(cleared);
  });

  it('clears terminally on disposal and ignores every late event', () => {
    const mission = makeMission('mission-1');
    const active = createArrivalPreviewCacheState([mission]);
    const disposed = transitionArrivalPreviewCache(active, {
      type: 'PREVIEW_CACHE_DISPOSED',
      reason: 'feed-unmounted',
    });

    const afterLateAlarm = transitionArrivalPreviewCache(disposed, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source: 'alarm-ingress',
      missions: [makeMission('mission-2')],
    });
    const afterLateFacade = transitionArrivalPreviewCache(afterLateAlarm, {
      type: 'PREVIEW_OBJECTS_OBSERVED',
      source: 'facade-pending-snapshot',
      missions: [makeMission('mission-3')],
    });
    const afterLateApply = transitionArrivalPreviewCache(afterLateFacade, {
      type: 'APPLY_CYCLE_SETTLED',
      hasRemainingPreviewMembership: false,
    });
    const afterSecondDispose = transitionArrivalPreviewCache(afterLateApply, {
      type: 'PREVIEW_CACHE_DISPOSED',
      reason: 'panel-closed',
    });

    expect(disposed).toEqual({ lifecycle: 'disposed', byId: {} });
    expect(afterLateAlarm).toBe(disposed);
    expect(afterLateFacade).toBe(disposed);
    expect(afterLateApply).toBe(disposed);
    expect(afterSecondDispose).toBe(disposed);
  });
});
