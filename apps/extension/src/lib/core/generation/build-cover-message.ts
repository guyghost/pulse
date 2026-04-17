/**
 * Build a prompt for generating a cover message to a recruiter.
 *
 * Core module: pure function, no I/O, no side effects.
 */

import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';

/**
 * Build the cover message generation prompt.
 *
 * @param mission - Target mission
 * @param profile - User profile
 * @returns Prompt string for the LLM
 */
export const buildCoverMessagePrompt = (mission: Mission, profile: UserProfile): string => {
  return `Écris un message court (5-6 phrases max) pour contacter un recruteur à propos de cette mission freelance.
Style: direct, senior, confiant. Pas de formules creuses.
Tu expliques pourquoi tu es le bon profil et tu proposes un échange.

Mission:
- Titre: ${mission.title}
- Client: ${mission.client ?? 'non précisé'}
- Stack: ${mission.stack.join(', ') || 'non précisée'}
- TJM: ${mission.tjm ? `${mission.tjm}€/jour` : 'non précisé'}
- Remote: ${mission.remote ?? 'non précisé'}
- Description: ${(mission.description ?? '').slice(0, 400)}

Profil:
- Prénom: ${profile.firstName}
- Poste: ${profile.jobTitle}
- Stack: ${profile.stack.join(', ')}
- Seniorité: ${profile.seniority}
- TJM: ${profile.tjmMin}-${profile.tjmMax}€/jour

Réponds uniquement avec le message, sans objet d'email ni signature.`;
};
