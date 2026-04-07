import type { Mission } from '../types/mission';

/**
 * Contract type keywords that indicate a salaried position (not freelance).
 * Matched case-insensitively against mission title + description.
 */
const SALARIED_KEYWORDS = [
  'cdi',
  'cdd',
  'contrat salarié',
  'contrat salarie',
  'temps plein',
  'temps partiel',
  'permanent contract',
  'fixed-term contract',
  'salaried',
  'en cdi',
  'en cdd',
  'poste en cdi',
  'poste en cdd',
];

/**
 * Regex pattern matching salaried contract keywords as whole words.
 * Uses word boundaries to avoid matching "CDI" inside "CREDIT" etc.
 */
const SALARIED_REGEX = new RegExp(
  `\\b(${SALARIED_KEYWORDS.join('|')})\\b`,
  'i',
);

/**
 * Check if a mission looks like a freelance mission (not a salaried CDD/CDI).
 *
 * Pure function — no I/O, no side effects.
 *
 * @param mission - The mission to check
 * @returns true if the mission appears to be freelance, false if it's salaried
 */
export function isFreelanceMission(mission: Mission): boolean {
  const text = `${mission.title} ${mission.description ?? ''}`;
  return !SALARIED_REGEX.test(text);
}

/**
 * Filter out salaried missions from an array.
 *
 * @param missions - Missions to filter
 * @returns Only missions that appear to be freelance
 */
export function filterSalariedMissions(missions: Mission[]): Mission[] {
  return missions.filter(isFreelanceMission);
}
