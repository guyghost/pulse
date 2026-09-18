/**
 * Parse and validate raw Jev evaluation answers into a `MissionClassification`.
 *
 * The entry point takes `unknown` on purpose: the Shell passes the SDK result
 * object, the Core narrows it with explicit guards (no `any`, no SDK import).
 * Returns `null` whenever the answers are malformed or the confidence is
 * below the configured threshold — callers must then fall back to leaving the
 * mission unclassified.
 *
 * Pure module: no I/O, no async, no randomness.
 */

import {
  MISSION_CATEGORIES,
  type MissionClassification,
  type MissionCategory,
} from '../types/mission-classification';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

interface ParsedCategoryAnswer {
  choice: MissionCategory;
  /** Probability of the selected choice, when the model reports a distribution. */
  probability: number | null;
}

const isMissionCategory = (value: string): value is MissionCategory =>
  MISSION_CATEGORIES.includes(value as MissionCategory);

const parseCategoryAnswer = (value: unknown): ParsedCategoryAnswer | null => {
  if (!isRecord(value) || value.type !== 'choice') {
    return null;
  }
  const choice = value.choice;
  if (typeof choice !== 'string' || !isMissionCategory(choice)) {
    return null;
  }
  const probabilities = value.probabilities;
  const probability =
    isRecord(probabilities) && isProbability(probabilities[choice])
      ? (probabilities[choice] as number)
      : null;
  return { choice, probability };
};

interface ParsedRemoteAnswer {
  probabilityTrue: number;
}

const parseRemoteAnswer = (value: unknown): ParsedRemoteAnswer | null => {
  if (!isRecord(value) || value.type !== 'boolean') {
    return null;
  }
  // P(true) is always reported for boolean questions.
  if (!isProbability(value.probability)) {
    return null;
  }
  return { probabilityTrue: value.probability };
};

export interface ParseClassificationOptions {
  /** Minimum overall confidence required to accept the classification. */
  confidenceThreshold: number;
  /** Epoch milliseconds recorded as the classification date. */
  now: number;
}

/**
 * Convert raw evaluation answers into a validated classification.
 * Overall confidence is the minimum of the per-question outcome
 * confidences: the choice distribution for `category`, and — for the
 * boolean — the probability of the selected outcome (its distance from
 * 0.5), since P(true) itself is not confidence in the answer. The model
 * must be sure on every question, not on average.
 */
export const parseClassification = (
  answers: unknown,
  options: ParseClassificationOptions
): MissionClassification | null => {
  if (!isRecord(answers)) {
    return null;
  }

  const category = parseCategoryAnswer(answers['category']);
  const remote = parseRemoteAnswer(answers['remoteCompatible']);
  if (!category || !remote) {
    return null;
  }

  // For the boolean, confidence attaches to the selected outcome (its
  // distance from 0.5), not to P(true) itself.
  const probabilities = [
    category.probability,
    Math.max(remote.probabilityTrue, 1 - remote.probabilityTrue),
  ].filter((p): p is number => p !== null);
  // If no probability at all is available, treat as fully uncertain.
  const confidence = probabilities.length > 0 ? Math.min(...probabilities) : 0;
  if (confidence < options.confidenceThreshold) {
    return null;
  }

  return {
    category: category.choice,
    remoteCompatible: remote.probabilityTrue >= 0.5,
    confidence,
    classifiedAt: options.now,
  };
};
