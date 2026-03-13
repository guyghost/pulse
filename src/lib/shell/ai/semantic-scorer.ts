import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { buildScoringPrompt, parseSemanticResult, type SemanticResult } from '../../core/scoring/semantic-scoring';
import { isPromptApiAvailable } from './capabilities';

const TIMEOUT_MS = 5000;
const MAX_PER_SCAN = 10;

export async function scoreMissionsSemantic(
  missions: Mission[],
  profile: UserProfile,
): Promise<Map<string, SemanticResult>> {
  const results = new Map<string, SemanticResult>();

  const availability = await isPromptApiAvailable();
  if (availability === 'no') return results;

  const ai = (self as any).ai;
  const batch = missions.slice(0, MAX_PER_SCAN);

  for (const mission of batch) {
    try {
      const session = await ai.languageModel.create();
      const prompt = buildScoringPrompt(mission, profile);

      const response = await Promise.race([
        session.prompt(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
        ),
      ]);

      const parsed = parseSemanticResult(response);
      if (parsed) results.set(mission.id, parsed);
      session.destroy();
    } catch {
      // Skip this mission, continue with next
    }
  }

  return results;
}
