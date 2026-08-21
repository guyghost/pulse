import { describe, expect, it } from 'vitest';
import type { Mission } from '$lib/core/types/mission';
import type { ApplicationStatus, MissionTracking } from '$lib/core/types/tracking';
import { buildKanbanBoard, getTrackingLastActivity } from '$lib/core/tracking/kanban-projection';

const makeMission = (id: string): Mission =>
  ({
    id,
    title: `Mission ${id}`,
    client: `Client ${id}`,
  }) as unknown as Mission;

const makeTracking = (
  missionId: string,
  currentStatus: ApplicationStatus,
  lastTimestamp = 0
): MissionTracking =>
  ({
    missionId,
    currentStatus,
    history:
      lastTimestamp > 0 ? [{ status: currentStatus, timestamp: lastTimestamp, note: null }] : [],
  }) as unknown as MissionTracking;

describe('getTrackingLastActivity', () => {
  it('returns 0 for null records and empty histories', () => {
    expect(getTrackingLastActivity(null)).toBe(0);
    expect(getTrackingLastActivity(makeTracking('m1', 'selected'))).toBe(0);
  });

  it('returns the last history entry timestamp', () => {
    expect(getTrackingLastActivity(makeTracking('m1', 'applied', 42))).toBe(42);
  });
});

describe('buildKanbanBoard', () => {
  it('always returns the five active pipeline columns in order', () => {
    const columns = buildKanbanBoard([], []);

    expect(columns.map((column) => column.status)).toEqual([
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
    ]);
  });

  it('places each tracked record in the column matching its currentStatus', () => {
    const missions = [makeMission('m1'), makeMission('m2')];
    const columns = buildKanbanBoard(missions, [
      makeTracking('m1', 'interview', 10),
      makeTracking('m2', 'selected', 20),
    ]);

    const byStatus = new Map(columns.map((column) => [column.status, column.cards]));
    expect(byStatus.get('interview')?.map((card) => card.missionId)).toEqual(['m1']);
    expect(byStatus.get('selected')?.map((card) => card.missionId)).toEqual(['m2']);
  });

  it('excludes terminal, archived and undetected records', () => {
    const missions = [makeMission('m1')];
    const columns = buildKanbanBoard(missions, [
      makeTracking('m1', 'accepted'),
      makeTracking('m2', 'rejected'),
      makeTracking('m3', 'archived'),
      makeTracking('m4', 'detected'),
    ]);

    const total = columns.reduce((sum, column) => sum + column.cards.length, 0);
    expect(total).toBe(0);
  });

  it('orders cards by descending last activity within a column', () => {
    const missions = [makeMission('m1'), makeMission('m2'), makeMission('m3')];
    const columns = buildKanbanBoard(missions, [
      makeTracking('m1', 'applied', 100),
      makeTracking('m2', 'applied', 300),
      makeTracking('m3', 'applied', 200),
    ]);

    const applied = columns.find((column) => column.status === 'applied');
    expect(applied?.cards.map((card) => card.missionId)).toEqual(['m2', 'm3', 'm1']);
  });

  it('falls back to placeholder copy when the mission is missing from the feed', () => {
    const columns = buildKanbanBoard([], [makeTracking('ghost', 'offer', 5)]);

    const offer = columns.find((column) => column.status === 'offer');
    expect(offer?.cards[0].title).toBe('Dossier suivi');
    expect(offer?.cards[0].client).toBeNull();
  });

  it('keeps the card total equal to the number of active tracked dossiers', () => {
    const missions = Array.from({ length: 6 }, (_, i) => makeMission(`m${i}`));
    const trackings = [
      makeTracking('m0', 'selected', 1),
      makeTracking('m1', 'application_prepared', 2),
      makeTracking('m2', 'applied', 3),
      makeTracking('m3', 'interview', 4),
      makeTracking('m4', 'offer', 5),
      makeTracking('m5', 'rejected', 6),
    ];

    const total = buildKanbanBoard(missions, trackings).reduce(
      (sum, column) => sum + column.cards.length,
      0
    );

    expect(total).toBe(5);
  });
});
