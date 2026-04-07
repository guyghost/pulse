import type { Mission } from '../types/mission';
import type { SeniorityLevel } from '../types/profile';

/**
 * Compute bonus points for seniority match (0-5).
 * Added on top of the base 0-100 score, then clamped.
 *
 * - Exact match: +5
 * - Adjacent match (senior↔confirmed, confirmed↔junior): +2
 * - Mismatch by 2 levels: 0
 * - Unknown seniority on mission: +2 (neutral)
 *
 * Pure function — no I/O, no side effects.
 */
export const scoreSeniorityBonus = (
  missionSeniority: SeniorityLevel | null,
  profileSeniority: SeniorityLevel,
): number => {
  if (missionSeniority === null) return 2;
  if (missionSeniority === profileSeniority) return 5;

  const levels: SeniorityLevel[] = ['junior', 'confirmed', 'senior'];
  const missionIdx = levels.indexOf(missionSeniority);
  const profileIdx = levels.indexOf(profileSeniority);
  const distance = Math.abs(missionIdx - profileIdx);

  return distance === 1 ? 2 : 0;
};

/**
 * Compute bonus points for mission start date urgency (0-5).
 * Missions starting soon get a higher bonus.
 *
 * - Starts within 7 days: +5
 * - Starts within 14 days: +4
 * - Starts within 30 days: +3
 * - Starts within 60 days: +1
 * - No start date or past: 0
 * - Starts in >60 days: 0
 *
 * @param missionStartDate - ISO 8601 date string (e.g. "2026-04-15") or null
 * @param now - Current date for comparison (injected for purity)
 */
export const scoreStartDateBonus = (
  missionStartDate: string | null,
  now: Date,
): number => {
  if (!missionStartDate) return 0;

  const startDate = new Date(missionStartDate);
  if (isNaN(startDate.getTime())) return 0;

  const diffMs = startDate.getTime() - now.getTime();
  if (diffMs < 0) return 0; // Past date

  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return 5;
  if (diffDays <= 14) return 4;
  if (diffDays <= 30) return 3;
  if (diffDays <= 60) return 1;
  return 0;
};
