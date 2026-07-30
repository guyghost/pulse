/**
 * Pure presentation projection of a finished scan.
 *
 * This resolver introduces NO state transition. The authoritative scan state
 * lives in the shell (`scan-lifecycle.model.md`); it decides `completed` /
 * `partial` / `failed` / `cancelled`. `buildScanSummary` only projects those
 * facts into copy, tone, and evidence rows for the transient completion card.
 *
 * Core rules respected: no I/O, no async, no Date, no randomness, no console.
 * Count inputs are clamped defensively to non-negative integers.
 *
 * Model: src/models/scan-completion-delight.model.md
 */

export type ScanSummaryTone = 'nominal' | 'quiet' | 'partial';

export type ScanSummaryEvidenceTone = 'accent' | 'success' | 'critical';

export interface ScanSummaryEvidence {
  readonly label: string;
  readonly value: number;
  readonly tone: ScanSummaryEvidenceTone;
}

export interface ScanSummary {
  readonly tone: ScanSummaryTone;
  readonly headline: string;
  readonly caption: string;
  readonly evidence: readonly ScanSummaryEvidence[];
}

export interface ScanSummaryInput {
  /** Missions new since the previous scan. */
  readonly newCount: number;
  /** Missions at/above the alert threshold (alertMatchCount). */
  readonly highScoreCount: number;
  /** Sources in error after the scan (>0 means partial completion). */
  readonly brokenConnectorCount: number;
  /** Internal alert threshold, retained for projection input compatibility. */
  readonly alertScoreThreshold: number;
}

function clampCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function plural(n: number): string {
  return n > 1 ? 's' : '';
}

export function buildScanSummary(input: ScanSummaryInput): ScanSummary {
  const newCount = clampCount(input.newCount);
  const highScoreCount = clampCount(input.highScoreCount);
  const brokenConnectorCount = clampCount(input.brokenConnectorCount);

  const hasSignal = newCount > 0 || highScoreCount > 0;
  const isPartial = brokenConnectorCount > 0;

  // Partial takes precedence: a finished scan with broken sources stays calm;
  // the broken-sources evidence row (critical tone) carries the nuance.
  const tone: ScanSummaryTone = isPartial ? 'partial' : hasSignal ? 'nominal' : 'quiet';

  if (tone === 'quiet') {
    return {
      tone,
      headline: 'File à jour',
      caption: 'Aucune nouvelle mission depuis le dernier scan.',
      evidence: [],
    };
  }

  const evidence: ScanSummaryEvidence[] = [{ label: 'Nouvelles', value: newCount, tone: 'accent' }];
  if (highScoreCount > 0) {
    evidence.push({ label: 'Prioritaires', value: highScoreCount, tone: 'success' });
  }
  if (isPartial) {
    evidence.push({ label: 'Sources à vérifier', value: brokenConnectorCount, tone: 'critical' });
  }

  let caption: string;
  if (isPartial) {
    caption = `${brokenConnectorCount} source${plural(brokenConnectorCount)} à vérifier`;
  } else if (highScoreCount > 0) {
    caption = `${highScoreCount} mission${plural(highScoreCount)} prioritaire${plural(highScoreCount)}`;
  } else {
    caption = `${newCount} nouvelle${plural(newCount)} mission${plural(newCount)}`;
  }

  return {
    tone,
    headline: 'Scan terminé',
    caption,
    evidence,
  };
}
