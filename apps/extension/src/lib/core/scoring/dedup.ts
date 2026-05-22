import type { Mission } from '../types/mission';

export interface MissionDuplicateRelation {
  readonly canonicalMissionId: string;
  readonly duplicateMissionId: string;
  readonly confidence: number;
  readonly reason: string;
}

export interface DeduplicateMissionsResult {
  readonly missions: Mission[];
  readonly duplicateRelations: MissionDuplicateRelation[];
}

/**
 * Tokenizes text into a set of lowercase words (length > 2)
 */
const tokenize = (text: string): Set<string> =>
  new Set(
    (text ?? '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

/**
 * Computes Jaccard similarity between two token sets
 */
const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
};

/**
 * Normalizes free text for tokenization/comparison.
 */
const normalizeText = (text: string | null): string =>
  (text ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Builds the text signature used for duplicate detection.
 * Including structured fields beyond the title prevents generic job titles
 * from collapsing unrelated missions.
 */
const buildMissionSignature = (mission: Mission): string =>
  [mission.title, mission.client, mission.stack.join(' ')]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ');

/**
 * Computes a score for mission quality (used to pick the better duplicate)
 * Higher score = more valuable mission (has TJM, longer description)
 */
const computeMissionScore = (mission: Mission): number =>
  (mission.tjm !== null ? 1 : 0) + (mission.description ?? '').length;

/**
 * Deduplicates missions using optimized two-phase strategy:
 *
 * Phase 1: Token inverted index to narrow candidate comparisons
 * Phase 2: Jaccard similarity on a structured mission signature
 *
 * This reduces from O(n²) full comparisons to O(n * avg_candidates_sharing_tokens)
 *
 * @param missions - Array of missions to deduplicate
 * @param threshold - Jaccard similarity threshold (default 0.8)
 * @returns Deduplicated array, keeping higher-quality duplicates
 */
export const deduplicateMissionsDetailed = (
  missions: Mission[],
  threshold = 0.8
): DeduplicateMissionsResult => {
  const result: Mission[] = [];
  const duplicateRelations: MissionDuplicateRelation[] = [];
  const tokenCache = new Map<string, Set<string>>();

  // Inverted index (token → set of result indices containing it)
  const invertedIndex = new Map<string, Set<number>>();

  /**
   * Updates inverted index: removes old tokens, adds new tokens for given index
   */
  const updateInvertedIndex = (
    idx: number,
    oldTokens: Set<string>,
    newTokens: Set<string>
  ): void => {
    for (const token of oldTokens) {
      invertedIndex.get(token)?.delete(idx);
    }
    for (const token of newTokens) {
      const idxSet = invertedIndex.get(token);
      if (idxSet) {
        idxSet.add(idx);
      } else {
        invertedIndex.set(token, new Set([idx]));
      }
    }
  };

  for (const mission of missions) {
    const key = buildMissionSignature(mission);
    const tokens = tokenize(key);
    tokenCache.set(mission.id, tokens);
    const missionScore = computeMissionScore(mission);

    // Find candidates via inverted index
    // Only compare against missions that share at least one token
    const candidateIndices = new Set<number>();
    for (const token of tokens) {
      const indices = invertedIndex.get(token);
      if (indices) {
        for (const idx of indices) {
          candidateIndices.add(idx);
        }
      }
    }

    // Compute Jaccard only against candidates (not all results)
    let isDuplicate = false;
    for (const idx of candidateIndices) {
      const existing = result[idx];
      const existingTokens = tokenCache.get(existing.id);
      if (!existingTokens) {
        continue;
      }

      const confidence = jaccardSimilarity(tokens, existingTokens);
      if (confidence >= threshold) {
        const existingScore = computeMissionScore(existing);

        if (missionScore > existingScore) {
          for (let relationIndex = 0; relationIndex < duplicateRelations.length; relationIndex++) {
            const relation = duplicateRelations[relationIndex];
            if (relation.canonicalMissionId === existing.id) {
              duplicateRelations[relationIndex] = {
                ...relation,
                canonicalMissionId: mission.id,
              };
            }
          }
          duplicateRelations.push({
            canonicalMissionId: mission.id,
            duplicateMissionId: existing.id,
            confidence,
            reason: 'same_structured_signature',
          });
          // Replace with higher-quality mission
          updateInvertedIndex(idx, existingTokens, tokens);
          result[idx] = mission;
        } else {
          duplicateRelations.push({
            canonicalMissionId: existing.id,
            duplicateMissionId: mission.id,
            confidence,
            reason: 'same_structured_signature',
          });
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      // New unique mission - add to index
      const newIdx = result.length;
      result.push(mission);
      updateInvertedIndex(newIdx, new Set(), tokens);
    }
  }

  return { missions: result, duplicateRelations };
};

export const deduplicateMissions = (missions: Mission[], threshold = 0.8): Mission[] =>
  deduplicateMissionsDetailed(missions, threshold).missions;
