import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { scoreMission } from '../../core/scoring/relevance';
import { buildScoreBreakdown, computeFinalBreakdown } from '../../core/scoring/final-score';
import { getMissions, saveMissions } from '../storage/db';
import { getSettings } from '../storage/chrome-storage';
import { scoreMissionsSemantic } from '../ai/semantic-scorer';

export async function rescoreStoredMissions(profile: UserProfile): Promise<Mission[]> {
  const missions = await getMissions();
  if (missions.length === 0) {
    return [];
  }

  const now = new Date();
  const rescored: Mission[] = missions.map((mission): Mission => {
    const result = scoreMission(mission, profile, now);
    return {
      ...mission,
      scoreBreakdown: buildScoreBreakdown(result.total, result.breakdown),
      score: result.total,
      semanticScore: null,
      semanticReason: null,
    };
  });

  try {
    const settings = await getSettings();
    const semanticResults = await scoreMissionsSemantic(
      rescored,
      profile,
      settings.maxSemanticPerScan
    );

    for (const mission of rescored) {
      const semantic = semanticResults.get(mission.id);
      if (semantic && mission.scoreBreakdown) {
        mission.scoreBreakdown = computeFinalBreakdown(
          mission.scoreBreakdown.deterministic,
          mission.scoreBreakdown.criteria,
          semantic.score,
          semantic.reason
        );
        mission.semanticScore = semantic.score;
        mission.semanticReason = semantic.reason;
        mission.score = mission.scoreBreakdown.total;
      }
    }
  } catch {
    // Semantic rescoring is optional.
  }

  await saveMissions(rescored);
  return rescored;
}
