import { createActor } from 'xstate';
import { tjmMachine } from '../../../src/machines/tjm.machine';
import type { TJMAnalysis, TJMDataPoint } from '../../../src/lib/core/types/tjm';

const mockDataPoints: TJMDataPoint[] = [
  { title: 'Dev React', tjm: 600, location: 'Paris', date: new Date('2026-01-15'), source: 'free-work' },
  { title: 'Dev React', tjm: 650, location: 'Paris', date: new Date('2026-02-01'), source: 'free-work' },
];

const mockAnalysis: TJMAnalysis = {
  junior: { min: 350, median: 450, max: 550 },
  confirmed: { min: 500, median: 600, max: 700 },
  senior: { min: 650, median: 750, max: 900 },
  trend: 'up',
  trendDetail: 'Hausse de 5%',
  recommendation: 'Bon positionnement',
  confidence: 0.82,
  dataPoints: 47,
  analyzedAt: new Date('2026-03-01'),
};

describe('tjm machine', () => {
  it('starts in idle state', () => {
    const actor = createActor(tjmMachine).start();
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.query).toBeNull();
    expect(actor.getSnapshot().context.analysis).toBeNull();
    actor.stop();
  });

  it('follows happy path: idle → aggregating → callingLLM → ready', () => {
    const actor = createActor(tjmMachine).start();

    actor.send({ type: 'ANALYZE', title: 'Dev React', location: 'Paris', seniority: 'senior' });
    expect(actor.getSnapshot().value).toBe('aggregating');
    expect(actor.getSnapshot().context.query).toEqual({
      title: 'Dev React', location: 'Paris', seniority: 'senior',
    });

    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    expect(actor.getSnapshot().value).toBe('callingLLM');
    expect(actor.getSnapshot().context.aggregatedData).toHaveLength(2);

    actor.send({ type: 'LLM_DONE', analysis: mockAnalysis });
    expect(actor.getSnapshot().value).toBe('ready');
    expect(actor.getSnapshot().context.analysis).toBe(mockAnalysis);
    actor.stop();
  });

  it('handles ERROR from aggregating', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'ERROR', error: 'No data points' });

    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('No data points');
    actor.stop();
  });

  it('handles ERROR from callingLLM', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    actor.send({ type: 'ERROR', error: 'LLM timeout' });

    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('LLM timeout');
    actor.stop();
  });

  it('RESET from ready goes to idle with clean context', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'senior' });
    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    actor.send({ type: 'LLM_DONE', analysis: mockAnalysis });

    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.query).toBeNull();
    expect(actor.getSnapshot().context.aggregatedData).toEqual([]);
    expect(actor.getSnapshot().context.analysis).toBeNull();
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });

  it('RESET from error goes to idle', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'ERROR', error: 'fail' });

    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });

  it('ANALYZE from ready starts new analysis', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev React', location: 'Paris', seniority: 'senior' });
    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    actor.send({ type: 'LLM_DONE', analysis: mockAnalysis });

    actor.send({ type: 'ANALYZE', title: 'Dev Vue', location: 'Lyon', seniority: 'confirmed' });
    expect(actor.getSnapshot().value).toBe('aggregating');
    expect(actor.getSnapshot().context.query?.title).toBe('Dev Vue');
    actor.stop();
  });

  it('ANALYZE from error retries', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'ERROR', error: 'fail' });

    actor.send({ type: 'ANALYZE', title: 'Dev React', location: 'Paris', seniority: 'senior' });
    expect(actor.getSnapshot().value).toBe('aggregating');
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });
});
