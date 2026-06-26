/**
 * Build a prompt for generating an adapted CV summary for a specific mission.
 *
 * Core module: pure function, no I/O, no side effects.
 */

import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';

/**
 * Build the CV summary generation prompt.
 *
 * @param mission - Target mission
 * @param profile - User profile
 * @returns Prompt string for the LLM
 */
export const buildCvSummaryPrompt = (mission: Mission, profile: UserProfile): string => {
  // Find overlapping stack items
  const profileStackLower = profile.stack.map((s) => s.toLowerCase());
  const matchingStack = mission.stack.filter((s) => profileStackLower.includes(s.toLowerCase()));
  const missingStack = mission.stack.filter((s) => !profileStackLower.includes(s.toLowerCase()));

  return `Génère un résumé de profil (4-5 phrases) adapté à cette mission freelance.
Mets en avant les compétences qui matchent la mission.
Si des technos de la mission ne sont pas dans ton profil, ne les mentionne pas.
Le ton doit être professionnel et factuel.

Mission cible:
- Titre: ${mission.title}
- Stack requise: ${mission.stack.join(', ') || 'non précisée'}
- Description: ${(mission.description ?? '').slice(0, 400)}

Ton profil:
- Poste: ${profile.jobTitle}
- Stack: ${profile.stack.join(', ')}
- Seniorité: ${profile.seniority}
${matchingStack.length > 0 ? `- Compétences matchantes: ${matchingStack.join(', ')}` : ''}
${missingStack.length > 0 ? `- Compétences manquantes (ne pas mentionner): ${missingStack.join(', ')}` : ''}

Réponds uniquement avec le résumé, sans introduction.`;
};
