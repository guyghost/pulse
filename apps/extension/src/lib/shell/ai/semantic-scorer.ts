/// <reference types="./chrome-ai.d.ts" />

import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import {
  buildScoringPrompt,
  parseSemanticResult,
  type SemanticResult,
} from '../../core/scoring/semantic-scoring';
import { createPromptSession, isPromptApiAvailable } from './capabilities';
import { getCachedSemanticScores, cacheSemanticScores } from '../storage/semantic-cache';
import type { AILanguageModelSession } from './chrome-ai';
import { abortableDelay } from '../utils/retry-strategy';

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function promptWithCancellation(
  session: AILanguageModelSession,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    const settle = (callback: () => void): void => {
      cleanup();
      callback();
    };
    const onAbort = (): void =>
      settle(() => reject(new DOMException('The operation was aborted.', 'AbortError')));
    const timeout = setTimeout(() => settle(() => reject(new Error('timeout'))), TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    session.prompt(prompt).then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error))
    );
  });
}

/**
 * Score a single mission using an existing AI session with retry logic.
 * Reuses the provided session instead of creating a new one per mission.
 */
const scoreSingleMission = async (
  mission: Mission,
  profile: UserProfile,
  session: AILanguageModelSession,
  signal?: AbortSignal
): Promise<SemanticResult | null> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      throwIfAborted(signal);
      const prompt = buildScoringPrompt(mission, profile);
      const response = await promptWithCancellation(session, prompt, signal);
      throwIfAborted(signal);

      const parsed = parseSemanticResult(response);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      throwIfAborted(signal);

      if (import.meta.env.DEV) {
        console.warn(
          '[SemanticScorer]',
          `Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for mission ${mission.id}:`,
          lastError.message
        );
      }

      // Wait before retry (except on last attempt)
      if (attempt < MAX_RETRIES) {
        await abortableDelay(RETRY_DELAYS_MS[attempt], signal);
      }
    }
  }

  if (import.meta.env.DEV) {
    console.warn(
      '[SemanticScorer]',
      `All attempts failed for mission ${mission.id}:`,
      lastError?.message
    );
  }

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
  maxPerScan = 10,
  signal?: AbortSignal
): Promise<Map<string, SemanticResult>> => {
  throwIfAborted(signal);
  const results = new Map<string, SemanticResult>();

  const availability = await isPromptApiAvailable();
  throwIfAborted(signal);
  if (availability === 'no') {
    return results;
  }

  if (missions.length === 0) {
    return results;
  }

  // Step 1: Check cache for all missions
  const missionIds = missions.map((m) => m.id);
  let cachedResults = new Map<string, SemanticResult>();
  try {
    cachedResults = await getCachedSemanticScores(missionIds, profile);
    throwIfAborted(signal);
  } catch {
    throwIfAborted(signal);
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
    session = await createPromptSession();
    throwIfAborted(signal);

    for (const mission of batch) {
      const result = await scoreSingleMission(mission, profile, session, signal);
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
    throwIfAborted(signal);
    try {
      await cacheSemanticScores(newResults, profile);
      throwIfAborted(signal);
    } catch {
      throwIfAborted(signal);
      // Cache write failed, scores are still returned
    }
  }

  return results;
};
