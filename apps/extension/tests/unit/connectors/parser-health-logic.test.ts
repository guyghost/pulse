import { describe, it, expect } from 'vitest';
import {
  evaluateParserHealth,
  buildParserWarning,
  deriveParserHealthAlert,
  BROKEN_PARSER_THRESHOLD,
  type ConnectorHealthRecord,
} from '../../../src/lib/core/connectors/parser-health-logic';

const NOW = 1_700_000_000_000;
const EARLIER = 1_699_999_000_000;

function makeRecord(overrides: Partial<ConnectorHealthRecord> = {}): ConnectorHealthRecord {
  return {
    connectorId: 'free-work',
    lastMissionCount: 0,
    lastSuccessAt: null,
    consecutiveZeros: 0,
    ...overrides,
  };
}

describe('parser-health-logic (Core)', () => {
  describe('evaluateParserHealth', () => {
    // ── Not suspicious cases ──────────────────────────────────────────────

    it('is not suspicious when previousCount=0 and missionCount=0 (both empty)', () => {
      const prev = makeRecord({ lastMissionCount: 0, consecutiveZeros: 0 });
      const { record, status } = evaluateParserHealth('free-work', prev, 0, NOW);

      expect(status.isSuspicious).toBe(false);
      expect(status.warning).toBeUndefined();
      expect(status.previousCount).toBe(0);
      expect(status.missionCount).toBe(0);
      expect(record.consecutiveZeros).toBe(1);
    });

    it('is suspicious when previousCount>0 and missionCount=0', () => {
      const prev = makeRecord({ lastMissionCount: 5, consecutiveZeros: 0 });
      const { record, status } = evaluateParserHealth('free-work', prev, 0, NOW);

      expect(status.isSuspicious).toBe(true);
      expect(status.warning).toBeDefined();
      expect(status.previousCount).toBe(5);
      expect(status.missionCount).toBe(0);
      // First zero after a success resets/starts the counter at 1
      expect(record.consecutiveZeros).toBe(1);
    });

    it('is not suspicious when previousCount>0 and missionCount>0', () => {
      const prev = makeRecord({ lastMissionCount: 5, consecutiveZeros: 2 });
      const { record, status } = evaluateParserHealth('free-work', prev, 3, NOW);

      expect(status.isSuspicious).toBe(false);
      expect(status.warning).toBeUndefined();
      expect(status.previousCount).toBe(5);
      expect(status.missionCount).toBe(3);
      // A non-zero result resets the consecutive-zeros counter
      expect(record.consecutiveZeros).toBe(0);
    });

    it('sets lastSuccessAt=now when missionCount>0', () => {
      const prev = makeRecord({ lastMissionCount: 0, consecutiveZeros: 1, lastSuccessAt: null });
      const { record } = evaluateParserHealth('free-work', prev, 4, NOW);

      expect(record.lastSuccessAt).toBe(NOW);
      expect(record.lastMissionCount).toBe(4);
    });

    // ── First run (prev = null) ───────────────────────────────────────────

    it('is not suspicious on first run (prev=null) regardless of count', () => {
      const { record, status } = evaluateParserHealth('free-work', null, 0, NOW);

      expect(status.isSuspicious).toBe(false);
      expect(status.warning).toBeUndefined();
      expect(status.previousCount).toBe(0);
      expect(record.consecutiveZeros).toBe(1);
      expect(record.lastSuccessAt).toBeNull();
      expect(record.connectorId).toBe('free-work');
    });

    it('is not suspicious on first run with a positive count', () => {
      const { record, status } = evaluateParserHealth('lehibou', null, 7, NOW);

      expect(status.isSuspicious).toBe(false);
      expect(status.missionCount).toBe(7);
      expect(record.lastMissionCount).toBe(7);
      expect(record.lastSuccessAt).toBe(NOW);
    });

    // ── Consecutive zeros climbing to the broken-parser threshold ─────────

    it('climbs consecutiveZeros 1→5 and crosses the broken-parser threshold', () => {
      // Start from a healthy state (had missions before)
      let prev: ConnectorHealthRecord | null = makeRecord({
        lastMissionCount: 10,
        consecutiveZeros: 0,
        lastSuccessAt: EARLIER,
      });
      const counts: number[] = [];

      for (let i = 1; i <= 5; i++) {
        const result = evaluateParserHealth('free-work', prev, 0, NOW + i);
        counts.push(result.record.consecutiveZeros);
        // Feed the record back in for the next iteration
        prev = result.record;
      }

      expect(counts).toEqual([1, 2, 3, 4, 5]);
      // At count 5 the threshold is crossed
      expect(counts[4]).toBeGreaterThanOrEqual(BROKEN_PARSER_THRESHOLD);
      expect(BROKEN_PARSER_THRESHOLD).toBe(5);
    });

    it('is suspicious only on the >0→0 transition, not on subsequent 0→0', () => {
      // isSuspicious compares previousCount (last recorded count) to the new count.
      // Only the first zero after a success is "suspicious"; ongoing zeros climb
      // the consecutiveZeros counter toward the broken-parser threshold instead.
      let prev: ConnectorHealthRecord | null = makeRecord({
        lastMissionCount: 8,
        consecutiveZeros: 0,
      });

      // Step 1: 8 → 0 is the suspicious transition
      const step1 = evaluateParserHealth('free-work', prev, 0, NOW + 1);
      expect(step1.status.isSuspicious).toBe(true);
      prev = step1.record;

      // Steps 2 & 3: 0 → 0 are NOT suspicious (but consecutiveZeros keeps climbing)
      const step2 = evaluateParserHealth('free-work', prev, 0, NOW + 2);
      expect(step2.status.isSuspicious).toBe(false);
      expect(step2.record.consecutiveZeros).toBe(2);
      prev = step2.record;

      const step3 = evaluateParserHealth('free-work', prev, 0, NOW + 3);
      expect(step3.status.isSuspicious).toBe(false);
      expect(step3.record.consecutiveZeros).toBe(3);
    });

    it('resets consecutiveZeros to 0 on a non-zero result mid-climb', () => {
      const prev = makeRecord({ lastMissionCount: 6, consecutiveZeros: 4 });
      const { record, status } = evaluateParserHealth('free-work', prev, 2, NOW);

      expect(record.consecutiveZeros).toBe(0);
      expect(status.isSuspicious).toBe(false);
    });

    // ── lastSuccessAt preservation on zero results ────────────────────────

    it('preserves lastSuccessAt from previous record when missionCount=0', () => {
      const prev = makeRecord({
        lastMissionCount: 5,
        consecutiveZeros: 0,
        lastSuccessAt: EARLIER,
      });
      const { record } = evaluateParserHealth('free-work', prev, 0, NOW);

      expect(record.lastSuccessAt).toBe(EARLIER);
    });

    it('updates lastMissionCount to the new count', () => {
      const prev = makeRecord({ lastMissionCount: 5, consecutiveZeros: 0 });
      const { record } = evaluateParserHealth('free-work', prev, 12, NOW);

      expect(record.lastMissionCount).toBe(12);
    });

    // ── Warning content ───────────────────────────────────────────────────

    it('produces the expected warning string for the suspicious case', () => {
      const prev = makeRecord({ lastMissionCount: 9, consecutiveZeros: 0 });
      const { status } = evaluateParserHealth('lehibou', prev, 0, NOW);

      expect(status.warning).toBe(
        'Parser anomaly: lehibou returned 0 missions after previously returning 9'
      );
    });

    // ── Purity ────────────────────────────────────────────────────────────

    it('is pure: same inputs produce same outputs (no side effects)', () => {
      const prev = makeRecord({ lastMissionCount: 7, consecutiveZeros: 3, lastSuccessAt: EARLIER });

      const a = evaluateParserHealth('free-work', prev, 0, NOW);
      const b = evaluateParserHealth('free-work', prev, 0, NOW);

      // The input record must not be mutated
      expect(prev.consecutiveZeros).toBe(3);
      expect(prev.lastMissionCount).toBe(7);

      // Outputs are structurally equal
      expect(a).toEqual(b);
    });

    it('does not mutate the input record', () => {
      const prev = makeRecord({ lastMissionCount: 4, consecutiveZeros: 2, lastSuccessAt: EARLIER });
      const snapshot = { ...prev };

      evaluateParserHealth('free-work', prev, 0, NOW);

      expect(prev).toEqual(snapshot);
    });
  });

  describe('buildParserWarning', () => {
    it('builds the canonical warning message', () => {
      expect(buildParserWarning('hiway', 42)).toBe(
        'Parser anomaly: hiway returned 0 missions after previously returning 42'
      );
    });
  });

  describe('deriveParserHealthAlert', () => {
    it('returns incident when consecutive zeros reach threshold', () => {
      const alert = deriveParserHealthAlert(
        makeRecord({ consecutiveZeros: BROKEN_PARSER_THRESHOLD, lastMissionCount: 0 })
      );
      expect(alert?.severity).toBe('incident');
      expect(alert?.statusLabel).toBe('Parser probablement cassé');
    });

    it('returns attention when last scan empty after prior success', () => {
      const alert = deriveParserHealthAlert(
        makeRecord({ lastMissionCount: 0, lastSuccessAt: EARLIER, consecutiveZeros: 1 })
      );
      expect(alert?.severity).toBe('attention');
      expect(alert?.statusLabel).toBe('Signal parser anormal');
    });

    it('returns null for healthy record', () => {
      expect(
        deriveParserHealthAlert(
          makeRecord({ lastMissionCount: 4, consecutiveZeros: 0, lastSuccessAt: NOW })
        )
      ).toBeNull();
    });
  });

  describe('BROKEN_PARSER_THRESHOLD', () => {
    it('is 5', () => {
      expect(BROKEN_PARSER_THRESHOLD).toBe(5);
    });
  });
});
