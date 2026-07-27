import { describe, expect, it } from 'vitest';
import { buildScanSummary } from '../../../src/lib/core/scan/scan-summary';

describe('buildScanSummary', () => {
  it('is nominal when new or high-score missions exist and no source is broken', () => {
    const summary = buildScanSummary({
      newCount: 3,
      highScoreCount: 1,
      brokenConnectorCount: 0,
      alertScoreThreshold: 80,
    });

    expect(summary.tone).toBe('nominal');
    expect(summary.headline).toBe('Scan terminé');
    expect(summary.caption).toBe('1 mission prioritaire (80+)');
    expect(summary.evidence).toEqual([
      { label: 'Nouvelles', value: 3, tone: 'accent' },
      { label: 'Prioritaires 80+', value: 1, tone: 'success' },
    ]);
  });

  it('falls back to a new-missions caption when there are no priorities', () => {
    const summary = buildScanSummary({
      newCount: 5,
      highScoreCount: 0,
      brokenConnectorCount: 0,
      alertScoreThreshold: 80,
    });

    expect(summary.tone).toBe('nominal');
    expect(summary.caption).toBe('5 nouvelles missions');
    expect(summary.evidence).toEqual([{ label: 'Nouvelles', value: 5, tone: 'accent' }]);
  });

  it('is quiet (file à jour) when nothing new landed', () => {
    const summary = buildScanSummary({
      newCount: 0,
      highScoreCount: 0,
      brokenConnectorCount: 0,
      alertScoreThreshold: 80,
    });

    expect(summary.tone).toBe('quiet');
    expect(summary.headline).toBe('File à jour');
    expect(summary.caption).toBe('Aucune nouvelle mission depuis le dernier scan.');
    // Calm minimalism: no evidence rows on the quiet tone.
    expect(summary.evidence).toEqual([]);
  });

  it('is partial and transparent (never alarming) when sources are broken', () => {
    const summary = buildScanSummary({
      newCount: 2,
      highScoreCount: 1,
      brokenConnectorCount: 1,
      alertScoreThreshold: 80,
    });

    expect(summary.tone).toBe('partial');
    // Headline stays calm; the caption + critical evidence carry the nuance.
    expect(summary.headline).toBe('Scan terminé');
    expect(summary.caption).toBe('1 source à vérifier');
    expect(summary.evidence).toContainEqual({
      label: 'Sources à vérifier',
      value: 1,
      tone: 'critical',
    });
  });

  it('pluralizes broken sources and stays calm when a partial scan finds nothing', () => {
    const summary = buildScanSummary({
      newCount: 0,
      highScoreCount: 0,
      brokenConnectorCount: 2,
      alertScoreThreshold: 80,
    });

    expect(summary.tone).toBe('partial');
    expect(summary.caption).toBe('2 sources à vérifier');
    expect(summary.evidence).toEqual([
      { label: 'Nouvelles', value: 0, tone: 'accent' },
      { label: 'Sources à vérifier', value: 2, tone: 'critical' },
    ]);
  });

  it('clamps negative / NaN / non-finite inputs to 0 (defense in depth)', () => {
    const summary = buildScanSummary({
      newCount: Number.NaN,
      highScoreCount: -3,
      brokenConnectorCount: Number.POSITIVE_INFINITY,
      alertScoreThreshold: 0,
    });

    // Everything clamped to 0 → quiet.
    expect(summary.tone).toBe('quiet');
    expect(summary.evidence).toEqual([]);
  });

  it('uses the bare "Prioritaires" label when the threshold is 0', () => {
    const summary = buildScanSummary({
      newCount: 1,
      highScoreCount: 2,
      brokenConnectorCount: 0,
      alertScoreThreshold: 0,
    });

    expect(summary.tone).toBe('nominal');
    expect(summary.caption).toBe('2 missions prioritaires');
    expect(summary.evidence).toContainEqual({
      label: 'Prioritaires',
      value: 2,
      tone: 'success',
    });
  });

  it('omits the priority row when highScoreCount is 0 even if threshold is set', () => {
    const summary = buildScanSummary({
      newCount: 4,
      highScoreCount: 0,
      brokenConnectorCount: 0,
      alertScoreThreshold: 80,
    });

    expect(summary.evidence).toEqual([{ label: 'Nouvelles', value: 4, tone: 'accent' }]);
  });
});
