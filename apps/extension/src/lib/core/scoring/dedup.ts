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

interface MissionMatch {
  readonly confidence: number;
  readonly reason: string;
}

interface FieldCompatibility {
  readonly compatible: boolean;
  readonly score: number;
  readonly usesProxyClient?: boolean;
}

const SOURCE_CANONICAL_PRIORITY: Record<Mission['source'], number> = {
  'cherry-pick': 5,
  lehibou: 4,
  hiway: 4,
  collective: 4,
  'free-work': 1,
};

const STOP_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'en',
  'au',
  'aux',
  'pour',
  'sur',
  'avec',
  'chez',
  'h',
  'f',
]);

const LEGAL_CLIENT_WORDS = new Set([
  'sa',
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'ltd',
  'limited',
  'inc',
  'corp',
  'corporation',
  'company',
  'societe',
  'groupe',
  'group',
]);

const PROXY_CLIENT_NAMES = new Set([
  'cherrypick',
  'cherry pick',
  'freework',
  'free work',
  'lehibou',
  'le hibou',
  'hiway',
  'collective',
  'collectivework',
  'collective work',
]);

const REMOTE_LOCATION_TOKENS = new Set(['remote', 'teletravail', 'france']);

/**
 * Normalizes free text for tokenization/comparison.
 */
const normalizeText = (text: string | null | undefined): string =>
  (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compact = (text: string): string => text.replace(/\s+/g, '');

/**
 * Tokenizes text into a set of lowercase words.
 */
const tokenize = (text: string | null | undefined): Set<string> =>
  new Set(
    normalizeText(text)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  );

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
};

const overlapCoefficient = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  const intersectionSize = [...a].filter((token) => b.has(token)).length;
  return intersectionSize / Math.min(a.size, b.size);
};

const weightedTokenSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  return jaccardSimilarity(a, b) * 0.75 + overlapCoefficient(a, b) * 0.25;
};

const getStackItems = (mission: Mission): string[] =>
  Array.isArray(mission.stack)
    ? mission.stack.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

const normalizeClientName = (client: string | null | undefined): string =>
  normalizeText(client)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !LEGAL_CLIENT_WORDS.has(token))
    .join(' ');

const isProxyClientName = (client: string | null | undefined): boolean => {
  const normalized = normalizeText(client);
  if (!normalized) {
    return false;
  }
  return PROXY_CLIENT_NAMES.has(normalized) || PROXY_CLIENT_NAMES.has(compact(normalized));
};

const normalizeUrl = (url: string | null | undefined): string => {
  const raw = (url ?? '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/$/, '');
  }
};

const hasSpecificMissionPath = (url: string | null | undefined): boolean => {
  const raw = (url ?? '').trim();
  if (!raw) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    return parsed.pathname.replace(/\/+$/, '').length > 0;
  } catch {
    return (
      raw
        .replace(/[?#].*$/, '')
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/\/+$/, '').length > 0
    );
  }
};

/**
 * Builds the text signature used for duplicate detection.
 * Structured fields beyond the title prevent generic job titles from collapsing
 * unrelated missions, while client/location compatibility is checked separately.
 */
const buildMissionSignature = (mission: Mission): string =>
  [mission.title, normalizeClientName(mission.client), getStackItems(mission).join(' ')]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ');

const buildCandidateKey = (mission: Mission): string =>
  [mission.title, mission.client, mission.location, getStackItems(mission).join(' ')]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ');

const compareClients = (a: Mission, b: Mission): FieldCompatibility => {
  const aProxy = isProxyClientName(a.client);
  const bProxy = isProxyClientName(b.client);
  const aClient = normalizeClientName(a.client);
  const bClient = normalizeClientName(b.client);

  if (aProxy || bProxy) {
    return { compatible: true, score: 0.65, usesProxyClient: true };
  }

  if (!aClient && !bClient) {
    return { compatible: true, score: 0.55 };
  }

  if (!aClient || !bClient) {
    return { compatible: true, score: 0.5 };
  }

  if (compact(aClient) === compact(bClient)) {
    return { compatible: true, score: 1 };
  }

  const score = weightedTokenSimilarity(tokenize(aClient), tokenize(bClient));
  return { compatible: score >= 0.75, score };
};

const compareLocations = (a: Mission, b: Mission): FieldCompatibility => {
  const aTokens = tokenize(a.location);
  const bTokens = tokenize(b.location);

  if (aTokens.size === 0 && bTokens.size === 0) {
    return { compatible: true, score: 0.5 };
  }

  if (aTokens.size === 0 || bTokens.size === 0) {
    return { compatible: true, score: 0.45 };
  }

  const score = weightedTokenSimilarity(aTokens, bTokens);
  if (score > 0) {
    return { compatible: true, score };
  }

  const hasRemoteContext =
    a.remote === 'full' ||
    b.remote === 'full' ||
    [...aTokens, ...bTokens].some((token) => REMOTE_LOCATION_TOKENS.has(token));

  return { compatible: hasRemoteContext, score: hasRemoteContext ? 0.4 : 0 };
};

const compareStacks = (a: Mission, b: Mission): number => {
  const aTokens = tokenize(getStackItems(a).join(' '));
  const bTokens = tokenize(getStackItems(b).join(' '));

  if (aTokens.size === 0 && bTokens.size === 0) {
    return 0.55;
  }

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0.45;
  }

  return weightedTokenSimilarity(aTokens, bTokens);
};

const compareRemote = (a: Mission, b: Mission): number => {
  if (!a.remote || !b.remote) {
    return 0.5;
  }
  return a.remote === b.remote ? 1 : 0.3;
};

const compareTjm = (a: Mission, b: Mission): number => {
  if (typeof a.tjm !== 'number' || typeof b.tjm !== 'number') {
    return 0.5;
  }

  const average = (a.tjm + b.tjm) / 2;
  if (average <= 0) {
    return 0.5;
  }

  const delta = Math.abs(a.tjm - b.tjm) / average;
  if (delta <= 0.2) {
    return 1;
  }
  if (delta <= 0.35) {
    return 0.6;
  }
  return 0.2;
};

const compareMissions = (mission: Mission, existing: Mission): MissionMatch | null => {
  const missionUrl = normalizeUrl(mission.url);
  const existingUrl = normalizeUrl(existing.url);
  if (
    missionUrl &&
    missionUrl === existingUrl &&
    hasSpecificMissionPath(mission.url) &&
    hasSpecificMissionPath(existing.url)
  ) {
    return { confidence: 1, reason: 'same_url' };
  }

  const client = compareClients(mission, existing);
  if (!client.compatible) {
    return null;
  }

  const location = compareLocations(mission, existing);
  if (!location.compatible) {
    return null;
  }

  const missionSignature = buildMissionSignature(mission);
  const existingSignature = buildMissionSignature(existing);
  if (missionSignature && missionSignature === existingSignature) {
    return { confidence: 1, reason: 'same_structured_signature' };
  }

  const titleScore = weightedTokenSimilarity(tokenize(mission.title), tokenize(existing.title));
  if (titleScore < 0.45) {
    return null;
  }

  const stackScore = compareStacks(mission, existing);
  const confidence =
    titleScore * 0.62 +
    stackScore * 0.18 +
    client.score * 0.1 +
    location.score * 0.06 +
    compareRemote(mission, existing) * 0.02 +
    compareTjm(mission, existing) * 0.02;

  if (client.usesProxyClient) {
    return { confidence, reason: 'same_title_stack_proxy_client' };
  }

  if (client.score >= 0.75) {
    return { confidence, reason: 'same_title_stack_client' };
  }

  return { confidence, reason: 'same_title_stack' };
};

/**
 * Computes a score for mission quality (used to pick the better duplicate)
 * Higher score = more valuable canonical mission.
 *
 * Native connector sources have priority over broad aggregators so a Free-Work
 * repost from "CherryPick" resolves to the Cherry Pick mission when both exist.
 */
const computeMissionScore = (mission: Mission): number => {
  const sourcePriority = SOURCE_CANONICAL_PRIORITY[mission.source] ?? 0;
  const descriptionLength =
    typeof mission.description === 'string' ? Math.min(mission.description.length, 4000) : 0;
  const hasTjm = typeof mission.tjm === 'number' ? 1200 : 0;
  const hasClient = normalizeClientName(mission.client) ? 250 : 0;
  const hasLocation = normalizeText(mission.location) ? 150 : 0;
  const stackScore = getStackItems(mission).length * 80;

  return sourcePriority * 10000 + hasTjm + hasClient + hasLocation + stackScore + descriptionLength;
};

/**
 * Deduplicates missions using optimized two-phase strategy:
 *
 * Phase 1: Token inverted index to narrow candidate comparisons
 * Phase 2: pairwise title/client/stack/location compatibility scoring
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
    const key = buildCandidateKey(mission);
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

      const match = compareMissions(mission, existing);
      if (match && match.confidence >= threshold) {
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
            confidence: match.confidence,
            reason: match.reason,
          });
          // Replace with higher-quality mission
          updateInvertedIndex(idx, existingTokens, tokens);
          result[idx] = mission;
        } else {
          duplicateRelations.push({
            canonicalMissionId: existing.id,
            duplicateMissionId: mission.id,
            confidence: match.confidence,
            reason: match.reason,
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
