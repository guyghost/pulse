import { describe, expect, it } from 'vitest';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import {
  summarizeApplicationPipeline,
  isDueFollowUp,
  isTerminalStatus,
} from '../../../src/lib/core/tracking/pipeline-summary';

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

  // Regression APP-01: terminal statuses (accepted/rejected/archived) with a stale
  // past nextActionAt must NOT inflate "Relance à faire" / dueFollowUps.
  it('excludes terminal-status missions with a past nextActionAt from dueFollowUps', () => {
    const pastDate = '2026-06-18T09:00:00.000Z';
    const now = Date.parse('2026-06-18T12:00:00.000Z');

    const summary = summarizeApplicationPipeline(
      [
        tracking({ missionId: 'accepted-1', currentStatus: 'accepted', nextActionAt: pastDate }),
        tracking({ missionId: 'rejected-1', currentStatus: 'rejected', nextActionAt: pastDate }),
        tracking({ missionId: 'archived-1', currentStatus: 'archived', nextActionAt: pastDate }),
        tracking({ missionId: 'applied-1', currentStatus: 'applied', nextActionAt: pastDate }),
      ],
      now
    );

    // Only the active `applied` mission counts as a due relance.
    expect(summary.dueFollowUps).toBe(1);
    // Terminal missions still count towards tracked/outcomes (AC-P1 only excludes detected/archived).
    expect(summary.acceptedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
  });
});

describe('isTerminalStatus', () => {
  it('returns true for accepted, rejected and archived', () => {
    expect(isTerminalStatus('accepted')).toBe(true);
    expect(isTerminalStatus('rejected')).toBe(true);
    expect(isTerminalStatus('archived')).toBe(true);
  });

  it('returns false for active and detected statuses', () => {
    expect(isTerminalStatus('detected')).toBe(false);
    expect(isTerminalStatus('selected')).toBe(false);
    expect(isTerminalStatus('applied')).toBe(false);
    expect(isTerminalStatus('interview')).toBe(false);
    expect(isTerminalStatus('offer')).toBe(false);
  });
});

describe('isDueFollowUp', () => {
  const now = Date.parse('2026-06-18T12:00:00.000Z');
  const past = '2026-06-18T09:00:00.000Z';
  const future = '2026-06-25T09:00:00.000Z';

  it('counts an active mission with a past next action as due', () => {
    expect(isDueFollowUp(tracking({ currentStatus: 'applied', nextActionAt: past }), now)).toBe(
      true
    );
  });

  it('never counts a terminal mission even with a past next action', () => {
    expect(isDueFollowUp(tracking({ currentStatus: 'accepted', nextActionAt: past }), now)).toBe(
      false
    );
    expect(isDueFollowUp(tracking({ currentStatus: 'rejected', nextActionAt: past }), now)).toBe(
      false
    );
    expect(isDueFollowUp(tracking({ currentStatus: 'archived', nextActionAt: past }), now)).toBe(
      false
    );
  });

  it('ignores active missions with a future or missing next action', () => {
    expect(isDueFollowUp(tracking({ currentStatus: 'selected', nextActionAt: future }), now)).toBe(
      false
    );
    expect(isDueFollowUp(tracking({ currentStatus: 'selected', nextActionAt: null }), now)).toBe(
      false
    );
  });
});
