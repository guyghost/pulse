/**
 * Build a prompt for generating a short pitch for a mission application.
 *
 * Core module: pure function, no I/O, no side effects.
 */

import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';
import type { ScoreBreakdown } from '../types/score';

/**
 * Build the pitch generation prompt.
 *
 * @param mission - Target mission
 * @param profile - User profile
 * @param scoreBreakdown - Score breakdown for context
 * @returns Prompt string for the LLM
 */
export const buildPitchPrompt = (
  mission: Mission,
  profile: UserProfile,
  scoreBreakdown: ScoreBreakdown | null
): string => {
  const matchContext = scoreBreakdown
    ? `
Score de match: ${scoreBreakdown.total}/100 (grade ${scoreBreakdown.grade})
- Stack: ${scoreBreakdown.criteria.stack}/100
- Localisation: ${scoreBreakdown.criteria.location}/100
- TJM: ${scoreBreakdown.criteria.tjm}/100
- Remote: ${scoreBreakdown.criteria.remote}/100`
    : '';

  return `Tu es un freelance senior. Écris un pitch court (3-4 phrases max) pour candidater à cette mission.
Style: direct, professionnel, sans bullshit. Pas de flatterie.
Mets en avant les compétences pertinentes de ton profil par rapport à la mission.

Mission:
- Titre: ${mission.title}
- Client: ${mission.client ?? 'non précisé'}
- Stack: ${mission.stack.join(', ') || 'non précisée'}
- TJM: ${mission.tjm ? `${mission.tjm}€/jour` : 'non précisé'}
- Lieu: ${mission.location ?? 'non précisé'}
- Remote: ${mission.remote ?? 'non précisé'}
- Description: ${(mission.description ?? '').slice(0, 500)}

Profil:
- Poste: ${profile.jobTitle}
- Stack: ${profile.stack.join(', ')}
- Seniorité: ${profile.seniority}
- TJM attendu: ${profile.tjmMin}-${profile.tjmMax}€/jour
${matchContext}

Réponds uniquement avec le pitch, sans introduction ni guillemets.`;
};
