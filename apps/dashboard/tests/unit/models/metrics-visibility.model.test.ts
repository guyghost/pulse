import { describe, expect, it } from 'vitest';
import {
  deriveMetricAvailability,
  deriveMetricsPhase,
  deriveMetricsVisibility,
} from '../../../src/models/metrics-visibility.model';
import type { MissionApplication } from '../../../src/lib/core/dashboard';

const sampleApp = (overrides: Partial<MissionApplication> = {}): MissionApplication => ({
  id: 'app-1',
  title: 'Mission',
  company: 'Acme',
  source: 'linkedin',
  stage: 'detected',
  score: 70,
  dailyRate: 500,
  location: 'Paris',
  sourceUrl: null,
  appliedAt: null,
  nextActionAt: '2026-08-01',
  notes: '',
  userRating: null,
  ...overrides,
});

describe('deriveMetricAvailability', () => {
  it('marks everything empty when no applications and no follow-up', () => {
    const a = deriveMetricAvailability({
      applicationCount: 0,
      averageScore: 0,
      interviewCount: 0,
      nextFollowUp: null,
    });
    expect(a).toEqual({
      applications: 'empty',
      averageScore: 'empty',
      interviews: 'empty',
      nextFollowUp: 'empty',
    });
  });

  it('marks averageScore empty even with a nonzero number when there are no applications', () => {
    // Defensive: averageScore is meaningless without applications.
    const a = deriveMetricAvailability({
      applicationCount: 0,
      averageScore: 50,
      interviewCount: 0,
      nextFollowUp: null,
    });
    expect(a.averageScore).toBe('empty');
  });

  it('marks all metrics has_data when populated', () => {
    const a = deriveMetricAvailability({
      applicationCount: 3,
      averageScore: 72,
      interviewCount: 1,
      nextFollowUp: sampleApp(),
    });
    expect(Object.values(a).every((v) => v === 'has_data')).toBe(true);
  });
});

describe('deriveMetricsPhase', () => {
  const allEmpty = {
    applications: 'empty',
    averageScore: 'empty',
    interviews: 'empty',
    nextFollowUp: 'empty',
  } as const;
  const allHave = {
    applications: 'has_data',
    averageScore: 'has_data',
    interviews: 'has_data',
    nextFollowUp: 'has_data',
  } as const;
  const mixed = {
    applications: 'has_data',
    averageScore: 'has_data',
    interviews: 'empty',
    nextFollowUp: 'empty',
  } as const;

  it('returns hidden when all empty', () => {
    expect(deriveMetricsPhase(allEmpty)).toBe('hidden');
  });

  it('returns ready when all have data', () => {
    expect(deriveMetricsPhase(allHave)).toBe('ready');
  });

  it('returns partial when mixed', () => {
    expect(deriveMetricsPhase(mixed)).toBe('partial');
  });
});

describe('deriveMetricsVisibility (convenience)', () => {
  it('hidden phase on a fully empty input', () => {
    const { phase, availability } = deriveMetricsVisibility({
      applicationCount: 0,
      averageScore: 0,
      interviewCount: 0,
      nextFollowUp: null,
    });
    expect(phase).toBe('hidden');
    expect(availability.applications).toBe('empty');
  });

  it('ready phase on a fully populated input', () => {
    const { phase } = deriveMetricsVisibility({
      applicationCount: 2,
      averageScore: 60,
      interviewCount: 1,
      nextFollowUp: sampleApp(),
    });
    expect(phase).toBe('ready');
  });
});
