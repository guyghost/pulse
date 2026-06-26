import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  createTracking,
  transitionStatus,
  setTrackingRating,
  setTrackingNotes,
  setTrackingNextActionAt,
  addGeneratedAsset,
  addGeneratedAssetAndMarkPrepared,
  getLastTransitionTime,
  countByStatus,
} from '../../../src/lib/core/tracking/transitions';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

describe('tracking transitions', () => {
  describe('isValidTransition', () => {
    it('allows detected → selected', () => {
      expect(isValidTransition('detected', 'selected')).toBe(true);
    });

    it('allows detected → archived', () => {
      expect(isValidTransition('detected', 'archived')).toBe(true);
    });

    it('allows selected → application_prepared', () => {
      expect(isValidTransition('selected', 'application_prepared')).toBe(true);
    });

    it('allows application_prepared → applied', () => {
      expect(isValidTransition('application_prepared', 'applied')).toBe(true);
    });

    it('allows applied → interview', () => {
      expect(isValidTransition('applied', 'interview')).toBe(true);
    });

    it('allows interview → offer', () => {
      expect(isValidTransition('interview', 'offer')).toBe(true);
    });

    it('allows offer → accepted', () => {
      expect(isValidTransition('offer', 'accepted')).toBe(true);
    });

    it('allows archived → detected (re-activate)', () => {
      expect(isValidTransition('archived', 'detected')).toBe(true);
    });

    it('rejects detected → applied (skipping steps)', () => {
      expect(isValidTransition('detected', 'applied')).toBe(false);
    });

    it('rejects detected → detected (same status)', () => {
      expect(isValidTransition('detected', 'detected')).toBe(false);
    });

    it('rejects rejected → applied (backwards)', () => {
      expect(isValidTransition('rejected', 'applied')).toBe(false);
    });
  });

  describe('createTracking', () => {
    it('creates a tracking record with "detected" status', () => {
      const tracking = createTracking('mission-1', 1000);

      expect(tracking.missionId).toBe('mission-1');
      expect(tracking.currentStatus).toBe('detected');
      expect(tracking.history).toHaveLength(1);
      expect(tracking.history[0]).toEqual({
        from: null,
        to: 'detected',
        timestamp: 1000,
        note: null,
      });
      expect(tracking.generatedAssetIds).toEqual([]);
      expect(tracking.userRating).toBeNull();
      expect(tracking.notes).toBe('');
      expect(tracking.nextActionAt).toBeNull();
    });
  });

  describe('transitionStatus', () => {
    it('transitions from detected to selected', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'selected', 2000);

      expect(updated).not.toBeNull();
      expect(updated!.currentStatus).toBe('selected');
      expect(updated!.history).toHaveLength(2);
      expect(updated!.history[1]).toEqual({
        from: 'detected',
        to: 'selected',
        timestamp: 2000,
        note: null,
      });
    });

    it('transitions with a note', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'selected', 2000, 'Bonne mission');

      expect(updated!.history[1].note).toBe('Bonne mission');
    });

    it('returns null for invalid transition', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'applied', 2000);

      expect(updated).toBeNull();
    });

    it('preserves immutability', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'selected', 2000);

      // Original should be unchanged
      expect(tracking.currentStatus).toBe('detected');
      expect(tracking.history).toHaveLength(1);
      expect(updated!.currentStatus).toBe('selected');
    });

    it('supports full lifecycle: detected → selected → application_prepared → applied → interview → offer → accepted', () => {
      let tracking = createTracking('m1', 1000);
      tracking = transitionStatus(tracking, 'selected', 2000)!;
      tracking = transitionStatus(tracking, 'application_prepared', 3000)!;
      tracking = transitionStatus(tracking, 'applied', 4000)!;
      tracking = transitionStatus(tracking, 'interview', 5000)!;
      tracking = transitionStatus(tracking, 'offer', 6000)!;
      tracking = transitionStatus(tracking, 'accepted', 7000)!;

      expect(tracking.currentStatus).toBe('accepted');
      expect(tracking.history).toHaveLength(7);
    });

    it('supports rejection path', () => {
      let tracking = createTracking('m1', 1000);
      tracking = transitionStatus(tracking, 'selected', 2000)!;
      tracking = transitionStatus(tracking, 'application_prepared', 3000)!;
      tracking = transitionStatus(tracking, 'applied', 4000)!;
      tracking = transitionStatus(tracking, 'rejected', 5000)!;

      expect(tracking.currentStatus).toBe('rejected');
    });

    it('allows archiving from any active status', () => {
      const statuses = ['detected', 'selected', 'application_prepared', 'applied'] as const;

      for (const status of statuses) {
        let tracking = createTracking('m1', 1000);
        if (status !== 'detected') {
          // Walk through to get to the desired status
          tracking = transitionStatus(tracking, 'selected', 2000)!;
          if (status === 'application_prepared' || status === 'applied') {
            tracking = transitionStatus(tracking, 'application_prepared', 3000)!;
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

  describe('setTrackingNextActionAt', () => {
    it('sets a follow-up timestamp', () => {
      const tracking = createTracking('m1', 1000);
      const updated = setTrackingNextActionAt(tracking, '2026-05-24T09:00:00.000Z');

      expect(updated.nextActionAt).toBe('2026-05-24T09:00:00.000Z');
    });

    it('clears the follow-up timestamp', () => {
      const tracking = setTrackingNextActionAt(
        createTracking('m1', 1000),
        '2026-05-24T09:00:00.000Z'
      );
      const updated = setTrackingNextActionAt(tracking, null);

      expect(updated.nextActionAt).toBeNull();
    });

    it('ignores invalid timestamps', () => {
      const tracking = createTracking('m1', 1000);
      const updated = setTrackingNextActionAt(tracking, 'demain');

      expect(updated.nextActionAt).toBeNull();
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

  describe('addGeneratedAssetAndMarkPrepared', () => {
    it('adds an asset and advances detected missions through selected to prepared', () => {
      const tracking = createTracking('m1', 1000);
      const updated = addGeneratedAssetAndMarkPrepared(tracking, 'asset-1', 2000);

      expect(updated.currentStatus).toBe('application_prepared');
      expect(updated.generatedAssetIds).toEqual(['asset-1']);
      expect(updated.history.slice(1)).toEqual([
        {
          from: 'detected',
          to: 'selected',
          timestamp: 2000,
          note: 'Mission sélectionnée automatiquement après génération.',
        },
        {
          from: 'selected',
          to: 'application_prepared',
          timestamp: 2000,
          note: 'Candidature préparée par assistant.',
        },
      ]);
    });

    it('advances selected missions to prepared without duplicating assets', () => {
      const tracking = transitionStatus(createTracking('m1', 1000), 'selected', 1500)!;
      const withAsset = addGeneratedAssetAndMarkPrepared(tracking, 'asset-1', 2000);
      const repeated = addGeneratedAssetAndMarkPrepared(withAsset, 'asset-1', 3000);

      expect(repeated.currentStatus).toBe('application_prepared');
      expect(repeated.generatedAssetIds).toEqual(['asset-1']);
      expect(repeated.history).toHaveLength(3);
      expect(repeated.history[2]).toMatchObject({
        from: 'selected',
        to: 'application_prepared',
        timestamp: 2000,
      });
    });

    it('does not regress applications already past the prepared stage', () => {
      let tracking = createTracking('m1', 1000);
      tracking = transitionStatus(tracking, 'selected', 1500)!;
      tracking = transitionStatus(tracking, 'application_prepared', 2000)!;
      tracking = transitionStatus(tracking, 'applied', 2500)!;

      const updated = addGeneratedAssetAndMarkPrepared(tracking, 'asset-1', 3000);

      expect(updated.currentStatus).toBe('applied');
      expect(updated.generatedAssetIds).toEqual(['asset-1']);
      expect(updated.history).toHaveLength(4);
    });
  });

  describe('getLastTransitionTime', () => {
    it('returns the last transition timestamp', () => {
      const tracking = createTracking('m1', 1000);
      const updated = transitionStatus(tracking, 'selected', 2000)!;

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
        transitionStatus(createTracking('m3', 1000), 'selected', 2000)!,
        transitionStatus(createTracking('m4', 1000), 'archived', 2000)!,
      ];

      const counts = countByStatus(trackings);

      expect(counts.detected).toBe(2);
      expect(counts.selected).toBe(1);
      expect(counts.archived).toBe(1);
      expect(counts.applied).toBe(0);
    });

    it('returns zero counts for empty array', () => {
      const counts = countByStatus([]);

      expect(counts.detected).toBe(0);
      expect(counts.applied).toBe(0);
    });
  });
});
