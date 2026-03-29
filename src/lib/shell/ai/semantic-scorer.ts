/// <reference types="./chrome-ai.d.ts" />

import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import {
  buildScoringPrompt,
  parseSemanticResult,
  type SemanticResult,
} from '../../core/scoring/semantic-scoring';
import { isPromptApiAvailable } from './capabilities';
import { getCachedSemanticScores, cacheSemanticScores } from '../storage/semantic-cache';
import type { AILanguageModelSession } from './chrome-ai';

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

/**
 * Sleep for a given number of milliseconds.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Score a single mission using an existing AI session with retry logic.
 * Reuses the provided session instead of creating a new one per mission.
 */
const scoreSingleMission = async (
  mission: Mission,
  profile: UserProfile,
  session: AILanguageModelSession
): Promise<SemanticResult | null> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt = buildScoringPrompt(mission, profile);

      const response = await Promise.race<string>([
        session.prompt(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
        ),
      ]);

      const parsed = parseSemanticResult(response);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.warn(
        '[SemanticScorer]',
        `Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for mission ${mission.id}:`,
        lastError.message
      );

      // Wait before retry (except on last attempt)
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  console.warn(
    '[SemanticScorer]',
    `All attempts failed for mission ${mission.id}:`,
    lastError?.message
  );

  return null;
};

/**
 * Score missions using the Chrome built-in AI (Prompt API).
 *
 * Uses a SINGLE session for the entire batch (create once, destroy once).
 * First checks the cache for existing scores. Only uncached missions
 * are sent to the LLM, up to maxPerScan new scores per call.
 * Newly computed scores are cached for future use.
 *
 * @param missions The missions to score.
 * @param profile The user profile for matching.
 * @param maxPerScan Maximum number of NEW missions to process per scan (default: 10).
 *                   Cached missions are returned without counting toward this limit.
 * @returns A map of mission IDs to their semantic scores (cached + newly computed).
 */
export const scoreMissionsSemantic = async (
  missions: Mission[],
  profile: UserProfile,
  maxPerScan = 10
): Promise<Map<string, SemanticResult>> => {
  const results = new Map<string, SemanticResult>();

  const availability = await isPromptApiAvailable();
  if (availability === 'no') return results;

  if (missions.length === 0) return results;

  // Step 1: Check cache for all missions
  const missionIds = missions.map((m) => m.id);
  let cachedResults = new Map<string, SemanticResult>();
  try {
    cachedResults = await getCachedSemanticScores(missionIds, profile);
  } catch {
    // Cache unavailable, continue without it
  }

  // Add cached results to output
  for (const [id, result] of cachedResults) {
    results.set(id, result);
  }

  // Step 2: Filter out missions that already have cached scores
  const uncachedMissions = missions.filter((m) => !cachedResults.has(m.id));

  if (uncachedMissions.length === 0) {
    return results;
  }

  // Step 3: Score only uncached missions, up to maxPerScan
  // Use a SINGLE session for the entire batch (performance fix)
  const batch = uncachedMissions.slice(0, maxPerScan);
  const newResults = new Map<string, SemanticResult>();
  let session: AILanguageModelSession | null = null;

  try {
    session = await self.ai.languageModel.create();

    for (const mission of batch) {
      const result = await scoreSingleMission(mission, profile, session);
      if (result) {
        newResults.set(mission.id, result);
        results.set(mission.id, result);
      }
    }
  } finally {
    session?.destroy();
  }

  // Step 4: Cache newly computed scores
  if (newResults.size > 0) {
    try {
      await cacheSemanticScores(newResults, profile);
    } catch {
      // Cache write failed, scores are still returned
    }
  }

  return results;
};
