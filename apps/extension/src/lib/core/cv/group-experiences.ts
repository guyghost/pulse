import type { Experience } from '../types/profile';

/**
 * A year group in the CV timeline (models/cv-experience-timeline.model.md).
 * `year` is 0 for experiences without a start date, rendered last.
 */
export interface ExperienceYearGroup {
  year: number;
  experiences: Experience[];
}

/**
 * Group experiences by start year, most recent year first.
 *
 * Pure projection: preserves the incoming order (most recent → oldest)
 * inside each group, never re-sorts, never drops entries. Experiences
 * without a start date fall into the trailing year-0 group.
 */
export const groupExperiencesByYear = (experiences: Experience[]): ExperienceYearGroup[] => {
  const groups = new Map<number, Experience[]>();
  for (const experience of experiences) {
    const year = experience.startDate ? Number(experience.startDate.slice(0, 4)) : 0;
    if (!Number.isFinite(year) || year < 0) {
      groups.set(0, [...(groups.get(0) ?? []), experience]);
      continue;
    }
    groups.set(year, [...(groups.get(year) ?? []), experience]);
  }

  return [...groups.entries()]
    .sort((a, b) => {
      // Year 0 ("Sans date") always sorts last.
      if (a[0] === 0) {
        return 1;
      }
      if (b[0] === 0) {
        return -1;
      }
      return b[0] - a[0];
    })
    .map(([year, grouped]) => ({ year, experiences: grouped }));
};
