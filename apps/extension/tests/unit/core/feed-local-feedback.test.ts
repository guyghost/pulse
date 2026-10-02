import { describe, expect, it } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import {
  matchesMinimumScore,
  sortByLocalFeedback,
} from '../../../src/lib/core/feed/local-feedback';
const mission = (id: string, score: number): Mission =>
  ({ id, score, scoreBreakdown: null, semanticScore: null }) as Mission;
describe('minimum score and local feedback', () => {
  it.each([
    ['strong', 80],
    ['good', 60],
    ['weak', 40],
  ] as const)('includes the %s boundary and every higher score', (bucket, threshold) => {
    expect(matchesMinimumScore(mission('below', threshold - 1), bucket)).toBe(false);
    expect(matchesMinimumScore(mission('boundary', threshold), bucket)).toBe(true);
    expect(matchesMinimumScore(mission('higher', 100), bucket)).toBe(true);
  });
  it('uses the canonical breakdown before the legacy score', () => {
    const row = { ...mission('canonical', 100), scoreBreakdown: { total: 39 } } as Mission;
    expect(matchesMinimumScore(row, 'weak')).toBe(false);
  });
  it('prioritizes explicit local choices with score tie breaks without changing scores or arrays', () => {
    const rows = [
      mission('off', 99),
      mission('neutral', 90),
      mission('relevant', 40),
      mission('relevant-high', 70),
    ];
    expect(
      sortByLocalFeedback(rows, {
        off: 'off-target',
        relevant: 'relevant',
        'relevant-high': 'relevant',
      }).map((row) => row.id)
    ).toEqual(['relevant-high', 'relevant', 'neutral', 'off']);
    expect(rows.map((row) => row.score)).toEqual([99, 90, 40, 70]);
    expect(sortByLocalFeedback(rows, {}).map((row) => row.id)).toEqual([
      'off',
      'neutral',
      'relevant-high',
      'relevant',
    ]);
  });
});
