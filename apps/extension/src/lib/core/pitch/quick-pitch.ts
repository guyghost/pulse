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
 * Compares a mission tech string with a profile keyword safely.
 * Avoids false positives from raw substring inclusion (e.g. "C" matching "React" or "Go" matching "Django")
 * while supporting common variations like "React" <-> "React.js" or "React / Next.js".
 */
export function matchesSkill(tech: string, profileKeyword: string): boolean {
  const techLower = tech.trim().toLowerCase();
  const profileLower = profileKeyword.trim().toLowerCase();

  if (!techLower || !profileLower) {
    return false;
  }

  // Exact match
  if (techLower === profileLower) {
    return true;
  }

  // Normalize runtime extensions (.js, .ts)
  const stripExtension = (s: string) => s.replace(/\.(js|ts)$/i, '');
  if (stripExtension(techLower) === stripExtension(profileLower)) {
    return true;
  }

  // Tokenize compound tech strings like "React / Next.js" or "TypeScript, Node"
  const techTokens = techLower
    .split(/[/,\s|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const profileTokens = profileLower
    .split(/[/,\s|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Exact match within token list
  if (techTokens.includes(profileLower) || profileTokens.includes(techLower)) {
    return true;
  }

  // Match token with stripped extension (e.g. "React.js" in token list vs "React")
  if (
    techTokens.some((t) => stripExtension(t) === stripExtension(profileLower)) ||
    profileTokens.some((t) => stripExtension(t) === stripExtension(techLower))
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts matching skills between mission stack and profile keywords.
 * Pure core function: zero I/O, zero async, strictly deterministic.
 */
export function extractMatchingSkills(
  missionStack?: string[] | null,
  profileKeywords?: string[] | null
): string[] {
  if (
    !missionStack ||
    !profileKeywords ||
    missionStack.length === 0 ||
    profileKeywords.length === 0
  ) {
    return [];
  }

  const validProfileKeywords = profileKeywords.map((k) => k.trim()).filter(Boolean);
  if (validProfileKeywords.length === 0) {
    return [];
  }

  const matches: string[] = [];
  for (const tech of missionStack) {
    const trimmed = tech.trim();
    if (!trimmed) {
      continue;
    }
    for (const kw of validProfileKeywords) {
      if (matchesSkill(trimmed, kw)) {
        matches.push(trimmed);
        break;
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
