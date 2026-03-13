import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';

export interface SemanticResult {
  score: number;
  reason: string;
}

export function buildScoringPrompt(mission: Mission, profile: UserProfile): string {
  return `Evalue la pertinence de cette mission freelance pour ce profil. Reponds uniquement en JSON: {"score": 0-100, "reason": "explication en 1 phrase"}.

Mission:
- Titre: ${mission.title}
- Stack: ${mission.stack.join(', ') || 'non precise'}
- TJM: ${mission.tjm ? `${mission.tjm} EUR/jour` : 'non precise'}
- Lieu: ${mission.location ?? 'non precise'}
- Remote: ${mission.remote ?? 'non precise'}
- Duree: ${mission.duration ?? 'non precise'}

Profil:
- Poste: ${profile.jobTitle}
- Stack: ${profile.stack.join(', ')}
- TJM: ${profile.tjmMin}-${profile.tjmMax} EUR/jour
- Lieu: ${profile.location}
- Remote: ${profile.remote}
- Seniorite: ${profile.seniority}`;
}

export function parseSemanticResult(raw: string): SemanticResult | null {
  const match = raw.match(/\{[^}]*"score"\s*:\s*\d+[^}]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.score !== 'number' || typeof parsed.reason !== 'string') return null;
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
}
