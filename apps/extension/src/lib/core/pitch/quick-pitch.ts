/**
 * Quick pitch generator — Pure Core function.
 *
 * Generates an instant, high-impact introductory message for a freelancer
 * applying to a mission. Deterministic, zero I/O, zero async, testable
 * without mocks.
 *
 * Follows the Functional Core & Imperative Shell architectural rule.
 */

import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';

export interface QuickPitchOptions {
  /** Custom greeting (default: "Bonjour") */
  greeting?: string;
  /** Custom call to action sentence */
  callToAction?: string;
}

/**
 * Finds intersecting skills between the user's keywords and the mission stack.
 * Case-insensitive, preserving canonical casing from mission or profile.
 */
export function extractMatchingSkills(
  missionStack: readonly string[] | undefined,
  profileKeywords: readonly string[] | undefined
): string[] {
  if (
    !missionStack ||
    !profileKeywords ||
    missionStack.length === 0 ||
    profileKeywords.length === 0
  ) {
    return [];
  }

  const normalizedProfile = new Map<string, string>();
  for (const kw of profileKeywords) {
    const trimmed = kw.trim();
    if (trimmed) {
      normalizedProfile.set(trimmed.toLowerCase(), trimmed);
    }
  }

  const matches: string[] = [];
  for (const tech of missionStack) {
    const trimmed = tech.trim();
    if (!trimmed) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (normalizedProfile.has(lower)) {
      matches.push(trimmed);
    } else {
      // Check partial match (e.g. "React" matches "React.js" or "React / Next")
      for (const [pLower, pOriginal] of normalizedProfile) {
        if (lower.includes(pLower) || pLower.includes(lower)) {
          matches.push(trimmed);
          break;
        }
      }
    }
  }

  return Array.from(new Set(matches));
}

/**
 * Generates a tailored, professional 1-click pitch message ready to paste into
 * platform application inputs (Free-Work, Malt, etc.).
 */
export function generateQuickPitch(
  mission: Mission,
  profile: UserProfile | null,
  options: QuickPitchOptions = {}
): string {
  const greeting = options.greeting ?? 'Bonjour';
  const cta =
    options.callToAction ??
    'Disponible immédiatement, je serais ravi d’échanger de vive voix sur vos enjeux et votre calendrier.';

  const cleanTitle = (mission.title || 'cette opportunité').trim();
  const matchingSkills = extractMatchingSkills(mission.stack, profile?.keywords);

  // If no user profile is configured, provide a polished generic freelance pitch
  if (!profile) {
    const stackPart =
      mission.stack && mission.stack.length > 0
        ? ` Disposant d’une solide expérience technique sur ${mission.stack.slice(0, 3).join(', ')},`
        : '';
    return `${greeting},\n\nVotre mission « ${cleanTitle} » correspond parfaitement à mon profil freelance.${stackPart} ${cta}`;
  }

  // With a user profile: craft a personalized introduction
  const roleName = profile.jobTitle?.trim() || 'freelance';
  const rolePart = profile.seniority === 'senior' ? `${roleName} senior` : roleName;

  let competenceSentence = '';
  if (matchingSkills.length > 0) {
    const topSkills = matchingSkills.slice(0, 3).join(', ');
    competenceSentence = ` Disposant d’une expertise éprouvée sur ${topSkills},`;
  }

  // TJM alignment sentence if rates are known
  let tjmSentence = '';
  if (profile.tjmMin > 0 && typeof mission.tjm === 'number' && mission.tjm > 0) {
    if (profile.tjmMin <= mission.tjm) {
      tjmSentence = ` Mon TJM (${profile.tjmMin} €/j) s’inscrit dans votre enveloppe.`;
    } else {
      tjmSentence = ` Mon TJM de référence est de ${profile.tjmMin} €/j.`;
    }
  } else if (profile.tjmMin > 0) {
    tjmSentence = ` Mon TJM de référence est de ${profile.tjmMin} €/j.`;
  }

  const intro = `${greeting},\n\nEn tant que ${rolePart}, votre mission « ${cleanTitle} » a vivement retenu mon attention.${competenceSentence}`;
  const middle = tjmSentence ? `\n\n${tjmSentence.trim()}` : '';
  const conclusion = `\n\n${cta}`;

  return `${intro}${middle}${conclusion}`;
}
