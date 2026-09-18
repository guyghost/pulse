/**
 * Mission classifier — Jev (TypeSafe AI) through Vercel AI Gateway.
 *
 * Jev is a probabilistic decision model: instead of generating text, it
 * evaluates every declared question in parallel against one shared state and
 * returns typed answers (Choice / Boolean) with probabilities. Classifying a
 * mission is therefore cheap, fast and type-safe end to end.
 *
 * Shell module: all I/O lives here (gateway call, cache, settings). Pure
 * question/state building and answer parsing are delegated to
 * `core/classification/`.
 *
 * Failure policy: any error (no API key, network, timeout, low confidence)
 * degrades silently — missions are simply left unclassified and the rest of
 * the scan is unaffected.
 */

import { experimental_evaluate as evaluate } from 'ai';
import type { JSONValue } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import type { Mission } from '../../core/types/mission';
import type { MissionClassification } from '../../core/types/mission-classification';
import {
  buildClassificationQuestions,
  buildClassificationState,
  type ClassificationQuestions,
  type ClassificationState,
} from '../../core/classification/questions';
import { parseClassification } from '../../core/classification/parse-evaluation';
import { getAiGatewayApiKey } from '../storage/chrome-storage';
import {
  buildCacheInput,
  cacheClassifications,
  getCachedClassifications,
  type ClassificationCacheWrite,
} from '../storage/classification-cache';
import { abortableDelay } from '../utils/retry-strategy';

const JEV_MODEL_ID = 'typesafe-ai/jev' as const;
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

export interface ClassificationSettings {
  /** Feature flag — when false the classifier is never called. */
  enabled: boolean;
  /** Cost budget: maximum missions evaluated per scan (cached ones are free). */
  maxPerScan: number;
  /** Minimum overall confidence in [0, 1] to keep a classification. */
  confidenceThreshold: number;
}

/**
 * Abort `evaluate` after TIMEOUT_MS even when the caller passes no signal,
 * and forward the caller's abort to the in-flight request.
 */
const withTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
};

/**
 * Adapt the pure classification state to the SDK's JSON-object input type
 * (explicit index signature — the alias alone does not carry one).
 */
const toEvaluationState = (state: ClassificationState): Record<string, JSONValue> => ({
  title: state.title,
  stack: [...state.stack],
  remote: state.remote,
  description: state.description,
});

/** True when a gateway key is configured — cheap pre-flight check. */
export const isClassificationAvailable = async (): Promise<boolean> => {
  const apiKey = await getAiGatewayApiKey();
  return apiKey.length > 0;
};

/**
 * Classify the given missions.
 *
 * - Missions already cached (fresh fingerprint) cost nothing.
 * - Uncached missions are evaluated up to `settings.maxPerScan`, sequentially.
 * - Uncertain or malformed answers are dropped (mission stays unclassified).
 *
 * @returns Map of mission ID to its validated classification (cached + new).
 */
export const classifyMissions = async (
  missions: readonly Mission[],
  settings: ClassificationSettings,
  signal?: AbortSignal
): Promise<Map<string, MissionClassification>> => {
  const results = new Map<string, MissionClassification>();
  if (!settings.enabled || missions.length === 0) {
    return results;
  }

  const apiKey = await getAiGatewayApiKey();
  if (apiKey.length === 0) {
    return results;
  }

  const cacheInputs = missions.map(buildCacheInput);
  const cached = await getCachedClassifications(cacheInputs);
  for (const [id, classification] of cached) {
    results.set(id, classification);
  }

  const pending = missions
    .filter((mission) => !cached.has(mission.id))
    .slice(0, Math.max(0, settings.maxPerScan));
  if (pending.length === 0) {
    return results;
  }

  const gateway = createGateway({ apiKey });
  const questions: ClassificationQuestions = buildClassificationQuestions();
  const toCache: ClassificationCacheWrite[] = [];

  for (const mission of pending) {
    if (signal?.aborted) {
      break;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await withTimeout(
          (timeoutSignal) =>
            evaluate({
              model: gateway.evaluationModel(JEV_MODEL_ID),
              state: toEvaluationState(buildClassificationState(mission)),
              questions,
              maxRetries: 0,
              abortSignal: timeoutSignal,
              providerOptions: {
                gateway: { zeroDataRetention: true },
              },
            }),
          signal
        );

        const classification = parseClassification(result.answers, {
          confidenceThreshold: settings.confidenceThreshold,
          now: Date.now(),
        });

        if (classification) {
          results.set(mission.id, classification);
          toCache.push({ ...buildCacheInput(mission), classification });
        }
        // A successful call (even a dropped low-confidence one) is final.
        break;
      } catch {
        if (attempt + 1 < MAX_ATTEMPTS) {
          await abortableDelay(RETRY_DELAY_MS, signal);
          continue;
        }
        // Last attempt failed: leave this mission unclassified and move on.
      }
    }
  }

  try {
    await cacheClassifications(toCache);
  } catch {
    // Cache write failures must never lose fresh classifications.
  }

  return results;
};

export interface ClassificationEnrichResult {
  missions: Mission[];
  changed: boolean;
}

/**
 * Apply classifications to missions in place, mirroring the semantic
 * enrichment contract. Only missions above the confidence threshold get a
 * `classification`; the scraped `remote` field is never overwritten.
 */
export const enrichMissionsWithClassification = async (
  missions: Mission[],
  settings: ClassificationSettings,
  signal?: AbortSignal
): Promise<ClassificationEnrichResult> => {
  if (!settings.enabled || missions.length === 0) {
    return { missions, changed: false };
  }

  const results = await classifyMissions(missions, settings, signal);
  if (results.size === 0) {
    return { missions, changed: false };
  }

  let changed = false;
  for (const mission of missions) {
    const classification = results.get(mission.id);
    if (classification) {
      mission.classification = classification;
      changed = true;
    }
  }
  return { missions, changed };
};
