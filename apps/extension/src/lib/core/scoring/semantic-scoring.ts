import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';
import type { SemanticResult } from '../types/type-guards';
import { SemanticResultSchema } from '../types/schemas';

// Ré-export pour compatibilité avec les modules existants
export type { SemanticResult } from '../types/type-guards';

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
  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 2. Find first { and use brace-counting to find matching }
  const startIndex = cleaned.indexOf('{');
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;

  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const jsonStr = cleaned.slice(startIndex, endIndex + 1);

  // 3. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  // 4. Validate avec Zod
  const result = SemanticResultSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  return result.data;
}
