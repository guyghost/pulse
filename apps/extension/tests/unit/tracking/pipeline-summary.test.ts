import { describe, expect, it } from 'vitest';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import { summarizeApplicationPipeline } from '../../../src/lib/core/tracking/pipeline-summary';

function tracking(overrides: Partial<MissionTracking>): MissionTracking {
  return {
    missionId: 'mission-1',
    currentStatus: 'selected',
    history: [],
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
    ...overrides,
  };
}

describe('summarizeApplicationPipeline', () => {
  it('counts active stages, due follow-ups and outcomes', () => {
    const summary = summarizeApplicationPipeline(
      [
        tracking({ missionId: 'selected-1', currentStatus: 'selected' }),
        tracking({
          missionId: 'prepared-1',
          currentStatus: 'application_prepared',
          nextActionAt: '2026-06-18T09:00:00.000Z',
        }),
        tracking({ missionId: 'prepared-2', currentStatus: 'application_prepared' }),
        tracking({ missionId: 'accepted-1', currentStatus: 'accepted' }),
        tracking({ missionId: 'rejected-1', currentStatus: 'rejected' }),
        tracking({ missionId: 'detected-1', currentStatus: 'detected' }),
        tracking({ missionId: 'archived-1', currentStatus: 'archived' }),
      ],
      Date.parse('2026-06-18T12:00:00.000Z')
    );

    expect(summary.trackedCount).toBe(5);
    expect(summary.activeCount).toBe(3);
    expect(summary.dueFollowUps).toBe(1);
    expect(summary.preparedNotApplied).toBe(2);
    expect(summary.acceptanceRate).toBe(50);
    expect(summary.bottleneck).toEqual({
      status: 'application_prepared',
      label: 'Préparée',
      count: 2,
    });
  });

  it('returns null acceptance rate when there are no terminal outcomes', () => {
    const summary = summarizeApplicationPipeline(
      [tracking({ missionId: 'applied-1', currentStatus: 'applied' })],
      Date.parse('2026-06-18T12:00:00.000Z')
    );

    expect(summary.acceptanceRate).toBeNull();
    expect(summary.acceptedCount).toBe(0);
    expect(summary.rejectedCount).toBe(0);
  });
});
