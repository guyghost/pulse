import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  createTracking,
  transitionStatus,
  setTrackingRating,
  setTrackingNotes,
  addGeneratedAsset,
  getLastTransitionTime,
  countByStatus,
} from '../../../src/lib/core/tracking/transitions';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

describe('tracking transitions', () => {
  describe('isValidTransition', () => {
    it('allows new → interested', () => {
      expect(isValidTransition('new', 'interested')).toBe(true);
    });

    it('allows new → archived', () => {
      expect(isValidTransition('new', 'archived')).toBe(true);
    });

    it('allows interested → applying', () => {
      expect(isValidTransition('interested', 'applying')).toBe(true);
    });

    it('allows applying → applied', () => {
      expect(isValidTransition('applying', 'applied')).toBe(true);
    });

    it('allows applied → rejected', () => {
      expect(isValidTransition('applied', 'rejected')).toBe(true);
    });

    it('allows applied → accepted', () => {
      expect(isValidTransition('applied', 'accepted')).toBe(true);
    });

    it('allows archived → new (re-activate)', () => {
      expect(isValidTransition('archived', 'new')).toBe(true);
    });

    it('rejects new → applied (skipping steps)', () => {
      expect(isValidTransition('new', 'applied')).toBe(false);
    });

    it('rejects new → new (same status)', () => {
      expect(isValidTransition('new', 'new')).toBe(false);
    });

    it('rejects rejected → applied (backwards)', () => {
      expect(isValidTransition('rejected', 'applied')).toBe(false);
    });
  });

  describe('createTracking', () => {
    it('creates a tracking record with "new" status', () => {
      const tracking = createTracking('mission-1', 1000);

      expect(tracking.missionId).toBe('mission-1');
      expect(tracking.currentStatus).toBe('new');
      expect(tracking.history).toHaveLength(1);
      expect(tracking.history[0]).toEqual({
        from: null,
        to: 'new',
        timestamp: 1000,
        note: null,
      });
      expect(tracking.generatedAssetIds).toEqual([]);
      expect(tracking.userRating).toBeNull();
      expect(tracking.notes).toBe('');
    });
  });

  describe('transitionStatus', () => {
    it('transitions from new to interested', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'interested', 2000);

      expect(updated).not.toBeNull();
      expect(updated!.currentStatus).toBe('interested');
      expect(updated!.history).toHaveLength(2);
      expect(updated!.history[1]).toEqual({
        from: 'new',
        to: 'interested',
        timestamp: 2000,
        note: null,
      });
    });

    it('transitions with a note', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'interested', 2000, 'Bonne mission');

      expect(updated!.history[1].note).toBe('Bonne mission');
    });

    it('returns null for invalid transition', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'applied', 2000);

      expect(updated).toBeNull();
    });

    it('preserves immutability', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'interested', 2000);

      // Original should be unchanged
      expect(tracking.currentStatus).toBe('new');
      expect(tracking.history).toHaveLength(1);
      expect(updated!.currentStatus).toBe('interested');
    });

    it('supports full lifecycle: new → interested → applying → applied → accepted', () => {
      let tracking = createTracking('m1', 1000);
      tracking = transitionStatus(tracking, 'interested', 2000)!;
      tracking = transitionStatus(tracking, 'applying', 3000)!;
      tracking = transitionStatus(tracking, 'applied', 4000)!;
      tracking = transitionStatus(tracking, 'accepted', 5000)!;

      expect(tracking.currentStatus).toBe('accepted');
      expect(tracking.history).toHaveLength(5);
    });

    it('supports rejection path', () => {
      let tracking = createTracking('m1', 1000);
      tracking = transitionStatus(tracking, 'interested', 2000)!;
      tracking = transitionStatus(tracking, 'applying', 3000)!;
      tracking = transitionStatus(tracking, 'applied', 4000)!;
      tracking = transitionStatus(tracking, 'rejected', 5000)!;

      expect(tracking.currentStatus).toBe('rejected');
    });

    it('allows archiving from any active status', () => {
      const statuses = ['new', 'interested', 'applying', 'applied'] as const;

      for (const status of statuses) {
        let tracking = createTracking('m1', 1000);
        if (status !== 'new') {
          // Walk through to get to the desired status
          tracking = transitionStatus(tracking, 'interested', 2000)!;
          if (status === 'applying' || status === 'applied') {
            tracking = transitionStatus(tracking, 'applying', 3000)!;
            if (status === 'applied') {
              tracking = transitionStatus(tracking, 'applied', 4000)!;
            }
          }
        }
        const archived = transitionStatus(tracking, 'archived', 9000);
        expect(archived).not.toBeNull();
        expect(archived!.currentStatus).toBe('archived');
      }
    });
  });

  describe('setTrackingRating', () => {
    it('sets a rating', () => {
      const tracking = createTracking('m1', 1000);
      const updated = setTrackingRating(tracking, 4);

      expect(updated.userRating).toBe(4);
    });

    it('sets rating to null', () => {
      const tracking = createTracking('m1', 1000);
      const rated = setTrackingRating(tracking, 4);
      const cleared = setTrackingRating(rated, null);

      expect(cleared.userRating).toBeNull();
    });

    it('ignores invalid ratings', () => {
      const tracking = createTracking('m1', 1000);
      const updated = setTrackingRating(tracking, 6);

      expect(updated.userRating).toBeNull();
    });

    it('ignores zero rating', () => {
      const tracking = createTracking('m1', 1000);
      const updated = setTrackingRating(tracking, 0);

      expect(updated.userRating).toBeNull();
    });
  });

  describe('setTrackingNotes', () => {
    it('sets notes', () => {
      const tracking = createTracking('m1', 1000);
      const updated = setTrackingNotes(tracking, 'Good mission for Go');

      expect(updated.notes).toBe('Good mission for Go');
    });

    it('clears notes with empty string', () => {
      const tracking = createTracking('m1', 1000);
      const noted = setTrackingNotes(tracking, 'Note');
      const cleared = setTrackingNotes(noted, '');

      expect(cleared.notes).toBe('');
    });
  });

  describe('addGeneratedAsset', () => {
    it('adds an asset ID', () => {
      const tracking = createTracking('m1', 1000);
      const updated = addGeneratedAsset(tracking, 'asset-1');

      expect(updated.generatedAssetIds).toEqual(['asset-1']);
    });

    it('does not duplicate asset IDs', () => {
      const tracking = createTracking('m1', 1000);
      const step1 = addGeneratedAsset(tracking, 'asset-1');
      const step2 = addGeneratedAsset(step1, 'asset-1');

      expect(step2.generatedAssetIds).toEqual(['asset-1']);
    });

    it('adds multiple different assets', () => {
      const tracking = createTracking('m1', 1000);
      const step1 = addGeneratedAsset(tracking, 'asset-1');
      const step2 = addGeneratedAsset(step1, 'asset-2');

      expect(step2.generatedAssetIds).toEqual(['asset-1', 'asset-2']);
    });
  });

  describe('getLastTransitionTime', () => {
    it('returns the last transition timestamp', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'interested', 2000)!;

      expect(getLastTransitionTime(updated)).toBe(2000);
    });

    it('returns creation time for fresh tracking', () => {
      const tracking = createTracking('m1', 1000);

      expect(getLastTransitionTime(tracking)).toBe(1000);
    });
  });

  describe('countByStatus', () => {
    it('counts missions by status', () => {
      const trackings: MissionTracking[] = [
        createTracking('m1', 1000),
        createTracking('m2', 1000),
        transitionStatus(createTracking('m3', 1000), 'interested', 2000)!,
        transitionStatus(createTracking('m4', 1000), 'archived', 2000)!,
      ];

      const counts = countByStatus(trackings);

      expect(counts.new).toBe(2);
      expect(counts.interested).toBe(1);
      expect(counts.archived).toBe(1);
      expect(counts.applied).toBe(0);
    });

    it('returns zero counts for empty array', () => {
      const counts = countByStatus([]);

      expect(counts.new).toBe(0);
      expect(counts.applied).toBe(0);
    });
  });
});
