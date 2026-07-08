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

/**
 * Pre-computes every text-derived value the comparison helpers need for a
 * mission: the four token sets (title/client/location/stack) plus the derived
 * client flags, structural signature, remote/tjm, and normalized URL shape.
 * Building this bundle once per mission lets compareMissions avoid
 * re-tokenizing the same fields on every candidate pair — a mission is
 * compared against many candidates, so this is the hot path.
 *
 * Invariant: each field equals what the on-the-fly computation produced
 * before (tokenize/normalizeClientName/isProxyClientName/buildMissionSignature/
 * normalizeUrl/hasSpecificMissionPath are all pure and idempotent), so cached
 * comparisons are byte-identical to uncached ones.
 */
interface MissionComparisonCache {
  readonly title: Set<string>;
  readonly clientTokens: Set<string>;
  readonly locationTokens: Set<string>;
  readonly stackTokens: Set<string>;
  readonly clientProxy: boolean;
  readonly normalizedClient: string;
  readonly signature: string;
  readonly remote: Mission['remote'];
  readonly tjm: Mission['tjm'];
  readonly normalizedUrl: string;
  readonly hasSpecificPath: boolean;
}

const SOURCE_CANONICAL_PRIORITY: Record<Mission['source'], number> = {
  'cherry-pick': 5,
  lehibou: 4,
  hiway: 4,
  collective: 4,
  'free-work': 1,
  malt: 6,
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
const PROXY_REPOST_MIN_TITLE_SCORE = 0.75;
const PROXY_REPOST_MIN_STACK_SCORE = 0.5;
const PROXY_REPOST_CONFIDENCE_FLOOR = 0.82;

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

/**
 * Counts shared elements between two sets, iterating the smaller set to minimise
 * membership checks. Allocates no intermediate arrays/sets — important because
 * this runs per mission-pair during deduplication.
 */
const intersectionSize = (a: Set<string>, b: Set<string>): number => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const token of small) {
    if (large.has(token)) {
      count++;
    }
  }
  return count;
};

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  const shared = intersectionSize(a, b);
  // Inclusion-exclusion: |A ∪ B| = |A| + |B| − |A ∩ B|. Avoids a Set allocation.
  const union = a.size + b.size - shared;
  return shared / union;
};

const overlapCoefficient = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  return intersectionSize(a, b) / Math.min(a.size, b.size);
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

/**
 * Builds the per-mission comparison cache. Every field here is what the
 * comparison helpers used to recompute inline on each pair; centralizing it
 * preserves exact outputs while removing redundant tokenization.
 */
const buildComparisonCache = (mission: Mission): MissionComparisonCache => ({
  title: tokenize(mission.title),
  clientTokens: tokenize(normalizeClientName(mission.client)),
  locationTokens: tokenize(mission.location),
  stackTokens: tokenize(getStackItems(mission).join(' ')),
  clientProxy: isProxyClientName(mission.client),
  normalizedClient: normalizeClientName(mission.client),
  signature: buildMissionSignature(mission),
  remote: mission.remote,
  tjm: mission.tjm,
  normalizedUrl: normalizeUrl(mission.url),
  hasSpecificPath: hasSpecificMissionPath(mission.url),
});

const compareClients = (
  a: MissionComparisonCache,
  b: MissionComparisonCache
): FieldCompatibility => {
  if (a.clientProxy || b.clientProxy) {
    return { compatible: true, score: 0.65, usesProxyClient: true };
  }

  if (!a.normalizedClient && !b.normalizedClient) {
    return { compatible: true, score: 0.55 };
  }

  if (!a.normalizedClient || !b.normalizedClient) {
    return { compatible: true, score: 0.5 };
  }

  if (compact(a.normalizedClient) === compact(b.normalizedClient)) {
    return { compatible: true, score: 1 };
  }

  const score = weightedTokenSimilarity(a.clientTokens, b.clientTokens);
  return { compatible: score >= 0.75, score };
};

const compareLocations = (
  a: MissionComparisonCache,
  b: MissionComparisonCache
): FieldCompatibility => {
  const aTokens = a.locationTokens;
  const bTokens = b.locationTokens;

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

const compareStacks = (a: MissionComparisonCache, b: MissionComparisonCache): number => {
  const aTokens = a.stackTokens;
  const bTokens = b.stackTokens;

  if (aTokens.size === 0 && bTokens.size === 0) {
    return 0.55;
  }

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0.45;
  }

  return weightedTokenSimilarity(aTokens, bTokens);
};

const compareRemote = (a: MissionComparisonCache, b: MissionComparisonCache): number => {
  if (!a.remote || !b.remote) {
    return 0.5;
  }
  return a.remote === b.remote ? 1 : 0.3;
};

const compareTjm = (a: MissionComparisonCache, b: MissionComparisonCache): number => {
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

const compareMissions = (
  a: MissionComparisonCache,
  b: MissionComparisonCache
): MissionMatch | null => {
  if (
    a.normalizedUrl &&
    a.normalizedUrl === b.normalizedUrl &&
    a.hasSpecificPath &&
    b.hasSpecificPath
  ) {
    return { confidence: 1, reason: 'same_url' };
  }

  const client = compareClients(a, b);
  if (!client.compatible) {
    return null;
  }

  const location = compareLocations(a, b);
  if (!location.compatible) {
    return null;
  }

  if (a.signature && a.signature === b.signature) {
    return { confidence: 1, reason: 'same_structured_signature' };
  }

  const titleScore = weightedTokenSimilarity(a.title, b.title);
  if (titleScore < 0.45) {
    return null;
  }

  const stackScore = compareStacks(a, b);
  const confidence =
    titleScore * 0.62 +
    stackScore * 0.18 +
    client.score * 0.1 +
    location.score * 0.06 +
    compareRemote(a, b) * 0.02 +
    compareTjm(a, b) * 0.02;

  if (client.usesProxyClient) {
    const proxyConfidence =
      titleScore >= PROXY_REPOST_MIN_TITLE_SCORE && stackScore >= PROXY_REPOST_MIN_STACK_SCORE
        ? Math.max(confidence, PROXY_REPOST_CONFIDENCE_FLOOR)
        : confidence;
    return { confidence: proxyConfidence, reason: 'same_title_stack_proxy_client' };
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

  // Per-mission comparison cache: title/client/location/stack token sets plus
  // derived values, built once per mission so compareMissions never
  // re-tokenizes the same fields across candidate pairs.
  const comparisonCache = new Map<string, MissionComparisonCache>();
  const getComparisonCache = (mission: Mission): MissionComparisonCache => {
    const cached = comparisonCache.get(mission.id);
    if (cached) {
      return cached;
    }
    const built = buildComparisonCache(mission);
    comparisonCache.set(mission.id, built);
    return built;
  };

  // canonicalMissionId → indices into duplicateRelations currently pointing at
  // that canonical. Maintained incrementally so that when a canonical mission
  // is replaced we can rewrite its relations in O(affected) instead of scanning
  // the whole relations array on every re-canonicalization.
  const canonicalRelationIndices = new Map<string, number[]>();
  const recordCanonicalRelation = (canonicalId: string, relationIndex: number): void => {
    const indices = canonicalRelationIndices.get(canonicalId);
    if (indices) {
      indices.push(relationIndex);
    } else {
      canonicalRelationIndices.set(canonicalId, [relationIndex]);
    }
  };

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
    const missionComparison = getComparisonCache(mission);

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

      const match = compareMissions(missionComparison, getComparisonCache(existing));
      if (match && match.confidence >= threshold) {
        const existingScore = computeMissionScore(existing);

        if (missionScore > existingScore) {
          // Rewrite every relation that treated `existing` as canonical so it
          // now points at the higher-quality incoming `mission`. Indexed lookup
          // keeps this O(affected) instead of scanning the whole relations
          // array. The final duplicateRelations contents and order are
          // identical to the previous full-scan rewrite.
          const existingCanonicalIndices = canonicalRelationIndices.get(existing.id);
          if (existingCanonicalIndices) {
            for (const relationIndex of existingCanonicalIndices) {
              duplicateRelations[relationIndex] = {
                ...duplicateRelations[relationIndex],
                canonicalMissionId: mission.id,
              };
            }
            canonicalRelationIndices.delete(existing.id);
          }
          duplicateRelations.push({
            canonicalMissionId: mission.id,
            duplicateMissionId: existing.id,
            confidence: match.confidence,
            reason: match.reason,
          });
          // The rewritten relations (plus the new one) now belong to mission.id.
          const missionCanonicalIndices = existingCanonicalIndices ?? [];
          missionCanonicalIndices.push(duplicateRelations.length - 1);
          canonicalRelationIndices.set(mission.id, missionCanonicalIndices);
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
          recordCanonicalRelation(existing.id, duplicateRelations.length - 1);
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
