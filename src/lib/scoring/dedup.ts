import type { Mission } from '../core/types/mission';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

export function deduplicateMissions(
  missions: Mission[],
  threshold = 0.8,
): Mission[] {
  const result: Mission[] = [];
  const tokenCache = new Map<string, Set<string>>();

  for (const mission of missions) {
    const key = `${mission.title} ${mission.stack.join(' ')}`;
    const tokens = tokenize(key);
    tokenCache.set(mission.id, tokens);

    let isDuplicate = false;
    for (const existing of result) {
      const existingTokens = tokenCache.get(existing.id)!;
      if (jaccardSimilarity(tokens, existingTokens) >= threshold) {
        const missionScore =
          (mission.tjm !== null ? 1 : 0) + mission.description.length;
        const existingScore =
          (existing.tjm !== null ? 1 : 0) + existing.description.length;
        if (missionScore > existingScore) {
          const idx = result.indexOf(existing);
          result[idx] = mission;
        }
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(mission);
    }
  }

  return result;
}
