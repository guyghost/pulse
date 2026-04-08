import { describe, it, expect } from 'vitest';
import { deduplicateMissions } from '../../../src/lib/core/scoring/dedup';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionSource, RemoteType } from '../../../src/lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-1',
    title: 'Test Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    url: 'https://example.com',
    source: 'free-work' as MissionSource,
    scrapedAt: new Date(),
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

describe('deduplicateMissions', () => {
  it('returns empty array for empty input', () => {
    const result = deduplicateMissions([]);
    expect(result).toEqual([]);
  });

  it('returns single mission as-is', () => {
    const mission = makeMission({ id: '1', title: 'Dev React' });
    const result = deduplicateMissions([mission]);
    expect(result).toEqual([mission]);
  });

  it('keeps all missions when no duplicates exist', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React', stack: ['React', 'TypeScript'] }),
      makeMission({ id: '2', title: 'Dev Angular', stack: ['Angular', 'TypeScript'] }),
      makeMission({ id: '3', title: 'Dev Python', stack: ['Python', 'Django'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(3);
  });

  it('keeps exact duplicate with more info (higher TJM)', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 500,
        description: 'Short',
      }),
      makeMission({
        id: '2',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 600,
        description: 'Long description with more details',
      }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].tjm).toBe(600);
  });

  it('deduplicates near-duplicate titles', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React Senior', stack: ['React'] }),
      makeMission({ id: '2', title: 'Dev React Senior H/F', stack: ['React'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('does NOT deduplicate different missions with shared words', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React', stack: ['React', 'TypeScript'] }),
      makeMission({ id: '2', title: 'Dev Angular', stack: ['Angular', 'TypeScript'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(2);
  });

  it('catches more duplicates with lower threshold', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React Fullstack Paris', stack: ['React', 'Node.js'] }),
      makeMission({ id: '2', title: 'Dev React Paris', stack: ['React'] }),
    ];
    const resultHigh = deduplicateMissions(missions, 0.8);
    expect(resultHigh).toHaveLength(2);

    const resultLow = deduplicateMissions(missions, 0.4);
    expect(resultLow).toHaveLength(1);
  });

  it('prefers mission with TJM when deduplicating', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React',
        stack: ['React'],
        tjm: null,
        description: 'Description A',
      }),
      makeMission({
        id: '2',
        title: 'Dev React',
        stack: ['React'],
        tjm: 500,
        description: 'Description B',
      }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].tjm).toBe(500);
  });

  it('prefers mission with longer description when TJM is same', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React',
        stack: ['React'],
        tjm: 500,
        description: 'Short',
      }),
      makeMission({
        id: '2',
        title: 'Dev React',
        stack: ['React'],
        tjm: 500,
        description: 'Longer description with more details',
      }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].description).toBe('Longer description with more details');
  });

  it('preserves order of first encountered mission', () => {
    const missions = [
      makeMission({ id: '1', title: 'Dev React Senior', stack: ['React'] }),
      makeMission({ id: '2', title: 'Dev Angular Senior', stack: ['Angular'] }),
      makeMission({ id: '3', title: 'Dev Vue Senior', stack: ['Vue'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('2');
    expect(result[2].id).toBe('3');
  });

  it('keeps same-title missions when client metadata disagrees', () => {
    const missions = [
      makeMission({ id: '1', title: 'Developpeur React Senior', client: 'Acme', stack: [] }),
      makeMission({ id: '2', title: 'Developpeur React Senior', client: 'Globex', stack: [] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(2);
  });

  it('handles complex duplicate scenarios', () => {
    const missions = [
      makeMission({
        id: '1',
        title: 'Dev React Senior',
        stack: ['React', 'TypeScript'],
        tjm: 500,
        description: 'Short desc',
      }),
      makeMission({ id: '2', title: 'Dev Angular', stack: ['Angular', 'TypeScript'], tjm: 450 }),
      makeMission({
        id: '3',
        title: 'Dev React Senior H/F',
        stack: ['React', 'TypeScript'],
        tjm: 600,
        description: 'Complete description with details',
      }),
      makeMission({ id: '4', title: 'Dev React Junior', stack: ['React'] }),
    ];
    const result = deduplicateMissions(missions);
    expect(result).toHaveLength(3);
    expect(result.find((m) => m.id === '1')).toBeUndefined(); // Replaced by id=3
    expect(result.find((m) => m.id === '3')).toBeDefined(); // Kept (has more info)
    expect(result.find((m) => m.id === '2')).toBeDefined(); // Different mission
    expect(result.find((m) => m.id === '4')).toBeDefined(); // Different mission
  });

  describe('regression: undefined safety', () => {
    it('should not crash when mission has undefined title (cast via as any)', () => {
      const mission = makeMission({ title: undefined } as any);
      // This test passes if it doesn't throw
      expect(() => deduplicateMissions([mission])).not.toThrow();
    });

    it('should not crash when mission has undefined entries in stack', () => {
      const mission = makeMission({
        stack: ['React', undefined, 'TypeScript', undefined] as any,
      });
      expect(() => deduplicateMissions([mission])).not.toThrow();
    });

    it('should not crash when mission has undefined description', () => {
      const mission = makeMission({ description: undefined } as any);
      expect(() => deduplicateMissions([mission])).not.toThrow();
    });

    it('should handle gracefully mission with all fields being minimal/empty', () => {
      const mission = makeMission({
        title: '',
        description: '',
        stack: [],
      });
      const result = deduplicateMissions([mission]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mission);
    });
  });
});
