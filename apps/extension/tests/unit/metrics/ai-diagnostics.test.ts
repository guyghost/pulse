import { describe, expect, it } from 'vitest';
import {
  AI_DIAGNOSTICS_WINDOW_MS,
  MAX_AI_DIAGNOSTICS_ENTRIES,
  buildAiDiagnosticsUpdate,
  summarizeAiDiagnostics,
  type AiScanDiagnosticsEntry,
} from '$lib/core/metrics/ai-diagnostics';

const NOW = 1_758_201_600_000; // 2026-09-18T12:00:00Z

const entry = (overrides: Partial<AiScanDiagnosticsEntry> = {}): AiScanDiagnosticsEntry => ({
  scanAt: NOW,
  candidates: 10,
  classified: 8,
  rejectedLowConfidence: 1,
  failures: 1,
  evaluations: 9,
  averageConfidence: 0.85,
  ...overrides,
});

describe('buildAiDiagnosticsUpdate', () => {
  it('appends the new entry after the previous ones', () => {
    const first = entry({ scanAt: NOW - 1_000 });
    const second = entry({ scanAt: NOW });

    const updated = buildAiDiagnosticsUpdate([first], second);

    expect(updated).toEqual([first, second]);
  });

  it('prunes entries older than the 30-day window relative to the newest scan', () => {
    const stale = entry({ scanAt: NOW - AI_DIAGNOSTICS_WINDOW_MS - 1 });
    const fresh = entry({ scanAt: NOW });
    const boundary = entry({ scanAt: NOW - AI_DIAGNOSTICS_WINDOW_MS });

    const updated = buildAiDiagnosticsUpdate([stale, boundary], fresh);

    expect(updated).toEqual([boundary, fresh]);
  });

  it('caps the window length, evicting the oldest entries first', () => {
    const history = Array.from({ length: MAX_AI_DIAGNOSTICS_ENTRIES }, (_, index) =>
      entry({ scanAt: NOW - (MAX_AI_DIAGNOSTICS_ENTRIES - index) * 1_000 })
    );

    const updated = buildAiDiagnosticsUpdate(history, entry({ scanAt: NOW }));

    expect(updated.length).toBe(MAX_AI_DIAGNOSTICS_ENTRIES);
    expect(updated.at(-1)?.scanAt).toBe(NOW);
    expect(updated[0].scanAt).toBe(history[1].scanAt);
  });
});

describe('summarizeAiDiagnostics', () => {
  it('totals counters over the retained window', () => {
    const summary = summarizeAiDiagnostics([
      entry({
        candidates: 10,
        classified: 8,
        rejectedLowConfidence: 1,
        failures: 1,
        evaluations: 9,
        averageConfidence: 0.8,
      }),
      entry({
        candidates: 5,
        classified: 4,
        rejectedLowConfidence: 1,
        failures: 0,
        evaluations: 5,
        averageConfidence: 0.9,
      }),
    ]);

    expect(summary).toEqual({
      scans: 2,
      candidates: 15,
      classified: 12,
      rejectedLowConfidence: 2,
      failures: 1,
      evaluations: 14,
      averageConfidence: expect.closeTo(0.8333, 3),
    });
  });

  it('returns a null average when nothing was classified', () => {
    const summary = summarizeAiDiagnostics([
      entry({
        classified: 0,
        rejectedLowConfidence: 3,
        failures: 2,
        evaluations: 3,
        averageConfidence: null,
      }),
    ]);

    expect(summary.averageConfidence).toBeNull();
    expect(summary.scans).toBe(1);
  });

  it('weights the average by classified counts, not by scan', () => {
    const summary = summarizeAiDiagnostics([
      entry({ classified: 1, averageConfidence: 0.5 }),
      entry({ classified: 3, averageConfidence: 0.9 }),
    ]);

    // (1*0.5 + 3*0.9) / 4 = 0.8
    expect(summary.averageConfidence).toBeCloseTo(0.8, 10);
  });

  it('handles an empty window', () => {
    expect(summarizeAiDiagnostics([])).toEqual({
      scans: 0,
      candidates: 0,
      classified: 0,
      rejectedLowConfidence: 0,
      failures: 0,
      evaluations: 0,
      averageConfidence: null,
    });
  });
});
