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

/** Per-scan counters surfaced to the AI diagnostics panel (DAO #207). */
export interface ClassifierScanDiagnostics {
  /** Uncached missions that needed a classification before the budget cap. */
  candidates: number;
  /** Gateway evaluations performed (retries included, cache hits excluded). */
  evaluated: number;
  /** Classifications applied (confidence above threshold). */
  classified: number;
  /** Evaluated missions dropped: malformed answer or low confidence. */
  rejected: number;
  /** Missions abandoned after retries (network, timeout, provider error). */
  failures: number;
  /** Mean confidence of applied classifications in [0, 1]; null when none. */
  averageConfidence: number | null;
}

export interface ClassifierScanResult {
  classifications: Map<string, MissionClassification>;
  diagnostics: ClassifierScanDiagnostics;
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
 * @returns Applied classifications plus the scan's diagnostics counters.
 */
export const classifyMissions = async (
  missions: readonly Mission[],
  settings: ClassificationSettings,
  signal?: AbortSignal
): Promise<ClassifierScanResult> => {
  const classifications = new Map<string, MissionClassification>();
  const diagnostics: ClassifierScanDiagnostics = {
    candidates: 0,
    evaluated: 0,
    classified: 0,
    rejected: 0,
    failures: 0,
    averageConfidence: null,
  };
  if (!settings.enabled || missions.length === 0) {
    return { classifications, diagnostics };
  }

  const apiKey = await getAiGatewayApiKey();
  if (apiKey.length === 0) {
    return { classifications, diagnostics };
  }

  const cacheInputs = missions.map(buildCacheInput);
  const cached = await getCachedClassifications(cacheInputs);
  for (const [id, classification] of cached) {
    classifications.set(id, classification);
  }

  const pending = missions
    .filter((mission) => !cached.has(mission.id))
    .slice(0, Math.max(0, settings.maxPerScan));
  if (pending.length === 0) {
    return { classifications, diagnostics };
  }
  diagnostics.candidates = pending.length;

  const gateway = createGateway({ apiKey });
  const questions: ClassificationQuestions = buildClassificationQuestions();
  const toCache: ClassificationCacheWrite[] = [];
  const appliedConfidences: number[] = [];

  for (const mission of pending) {
    if (signal?.aborted) {
      break;
    }

    let missionFailed = false;
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
        diagnostics.evaluated += 1;

        const classification = parseClassification(result.answers, {
          confidenceThreshold: settings.confidenceThreshold,
          now: Date.now(),
        });

        if (classification) {
          classifications.set(mission.id, classification);
          toCache.push({ ...buildCacheInput(mission), classification });
          appliedConfidences.push(classification.confidence);
        } else {
          diagnostics.rejected += 1;
        }
        // A successful call (even a dropped low-confidence one) is final.
        break;
      } catch {
        if (attempt + 1 < MAX_ATTEMPTS) {
          await abortableDelay(RETRY_DELAY_MS, signal);
          continue;
        }
        missionFailed = true;
      }
    }
    if (missionFailed) {
      diagnostics.failures += 1;
    }
  }

  diagnostics.classified = toCache.length;
  diagnostics.averageConfidence =
    appliedConfidences.length > 0
      ? appliedConfidences.reduce((sum, value) => sum + value, 0) / appliedConfidences.length
      : null;

  try {
    await cacheClassifications(toCache);
  } catch {
    // Cache write failures must never lose fresh classifications.
  }

  return { classifications, diagnostics };
};

export interface ClassificationEnrichResult {
  missions: Mission[];
  changed: boolean;
  /** Per-scan counters for the AI diagnostics panel. */
  diagnostics: ClassifierScanDiagnostics;
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
    return { missions, changed: false, diagnostics: emptyDiagnostics() };
  }

  const { classifications, diagnostics } = await classifyMissions(missions, settings, signal);
  if (classifications.size === 0) {
    return { missions, changed: false, diagnostics };
  }

  let changed = false;
  for (const mission of missions) {
    const classification = classifications.get(mission.id);
    if (classification) {
      mission.classification = classification;
      changed = true;
    }
  }
  return { missions, changed, diagnostics };
};

function emptyDiagnostics(): ClassifierScanDiagnostics {
  return {
    candidates: 0,
    evaluated: 0,
    classified: 0,
    rejected: 0,
    failures: 0,
    averageConfidence: null,
  };
}
