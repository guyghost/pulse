import { describe, expect, it } from 'vitest';
import type { Experience } from '$lib/core/types/profile';
import { groupExperiencesByYear } from '$lib/core/cv/group-experiences';

const makeExperience = (overrides: Partial<Experience> = {}): Experience => ({
  id: 'exp-1',
  title: 'Dev',
  company: 'Acme',
  employmentType: null,
  location: null,
  startDate: '2025-01',
  endDate: null,
  isCurrent: false,
  description: '',
  skills: [],
  source: 'manual',
  sourceExternalId: null,
  positionIndex: 0,
  updatedAt: 0,
  ...overrides,
});

describe('groupExperiencesByYear', () => {
  it('returns an empty array for empty input', () => {
    expect(groupExperiencesByYear([])).toEqual([]);
  });

  it('groups experiences by start year, most recent first', () => {
    const groups = groupExperiencesByYear([
      makeExperience({ id: 'a', startDate: '2024-03' }),
      makeExperience({ id: 'b', startDate: '2026-01' }),
      makeExperience({ id: 'c', startDate: '2024-11' }),
    ]);

    expect(groups.map((group) => group.year)).toEqual([2026, 2024]);
    expect(groups[0].experiences.map((e) => e.id)).toEqual(['b']);
    expect(groups[1].experiences.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('keeps the incoming order inside each group (no re-sort)', () => {
    const groups = groupExperiencesByYear([
      makeExperience({ id: 'older', startDate: '2024-01' }),
      makeExperience({ id: 'newer', startDate: '2024-12' }),
    ]);

    expect(groups[0].experiences.map((e) => e.id)).toEqual(['older', 'newer']);
  });

  it('places undated experiences in a trailing year-0 group', () => {
    const groups = groupExperiencesByYear([
      makeExperience({ id: 'undated', startDate: null }),
      makeExperience({ id: 'dated', startDate: '2025-06' }),
      makeExperience({ id: 'also-undated', startDate: null }),
    ]);

    expect(groups.map((group) => group.year)).toEqual([2025, 0]);
    expect(groups[1].experiences.map((e) => e.id)).toEqual(['undated', 'also-undated']);
  });

  it('routes malformed years to the year-0 group instead of dropping them', () => {
    const groups = groupExperiencesByYear([
      makeExperience({ id: 'bad', startDate: 'oops-xx' }),
      makeExperience({ id: 'ok', startDate: '2025-02' }),
    ]);

    expect(groups.map((group) => group.year)).toEqual([2025, 0]);
    expect(groups[1].experiences.map((e) => e.id)).toEqual(['bad']);
  });

  it('never drops an experience', () => {
    const experiences = [
      makeExperience({ id: 'a' }),
      makeExperience({ id: 'b', startDate: null }),
      makeExperience({ id: 'c', startDate: '1999-12' }),
    ];

    const total = groupExperiencesByYear(experiences).reduce(
      (sum, group) => sum + group.experiences.length,
      0
    );

    expect(total).toBe(experiences.length);
  });
});
