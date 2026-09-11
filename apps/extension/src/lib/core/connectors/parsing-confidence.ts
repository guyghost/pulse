/**
 * Extraction-confidence scoring for the « À vérifier » review queue.
 *
 * Pure (FC&IS): no I/O, no async, no Date/Math randomness. Everything is a
 * deterministic function of its arguments. Model:
 * src/models/parsing-confidence.model.md — this module is its implementation.
 */

import { deduplicateMissionsDetailed } from '../scoring/dedup';
import { deriveParserHealthAlert, type ConnectorHealthRecord } from './parser-health-logic';
import type { Mission } from '../types/mission';
import type {
  ParsingConfidenceSignalId,
  ReviewDecisionMap,
  ReviewQueueEntry,
} from '../types/parsing-confidence';

/** A mission is flagged (shown in the review queue) below this confidence. */
export const FLAG_THRESHOLD = 0.75;

/** Minimum believable title length, in trimmed characters. */
export const MIN_TITLE_LENGTH = 8;

/** Minimum believable description length, in trimmed characters. */
export const MIN_DESCRIPTION_LENGTH = 40;

/**
 * Per-signal confidence penalties. A mission with no signal has confidence 1;
 * confidence = clamp01(1 − Σ weights of active signals), rounded to 2 decimals.
 */
export const SIGNAL_WEIGHTS: Readonly<Record<ParsingConfidenceSignalId, number>> = {
  tjm_missing: 0.3,
  date_ambiguous: 0.2,
  incomplete_fields: 0.2,
  near_duplicate: 0.3,
  parser_suspect: 0.15,
};

/** Short French reason labels, in primary-reason priority order (see model). */
export const REASON_LABELS: Readonly<
  Record<Exclude<ParsingConfidenceSignalId, 'parser_suspect'>, string>
> = {
  tjm_missing: 'TJM manquant',
  date_ambiguous: 'Date ambiguë',
  near_duplicate: 'Doublon potentiel',
  incomplete_fields: 'Champs incomplets',
};

const PRIMARY_REASON_ORDER: readonly Exclude<ParsingConfidenceSignalId, 'parser_suspect'>[] = [
  'tjm_missing',
  'date_ambiguous',
  'near_duplicate',
  'incomplete_fields',
];

const hasTjm = (mission: Mission): boolean =>
  mission.tjm !== null ||
  (mission.tjmMin !== null && mission.tjmMin !== undefined) ||
  (mission.tjmMax !== null && mission.tjmMax !== undefined);

/**
 * An ISO-like date string is parseable if Date accepts it and yields a finite
 * timestamp. Pure: `new Date(value)` on a string is deterministic.
 */
const isParseableDate = (value: string): boolean => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed);
};

/**
 * Signals derivable from the mission alone (field-level quality).
 * `near_duplicate` and `parser_suspect` are context signals supplied by the
 * caller — see model.
 */
export const detectFieldSignals = (mission: Mission): ParsingConfidenceSignalId[] => {
  const signals: ParsingConfidenceSignalId[] = [];

  if (!hasTjm(mission)) {
    signals.push('tjm_missing');
  }

  const startDate = mission.startDate;
  const publishedAt = mission.publishedAt;
  const startDateBad = startDate !== null && startDate !== undefined && !isParseableDate(startDate);
  const publishedAtBad =
    publishedAt !== null && publishedAt !== undefined && !isParseableDate(publishedAt);
  const noDateAtAll =
    (startDate === null || startDate === undefined) &&
    (publishedAt === null || publishedAt === undefined);
  if (startDateBad || publishedAtBad || noDateAtAll) {
    signals.push('date_ambiguous');
  }

  const titleLength = mission.title.trim().length;
  const descriptionLength = mission.description.trim().length;
  if (titleLength < MIN_TITLE_LENGTH || descriptionLength < MIN_DESCRIPTION_LENGTH) {
    signals.push('incomplete_fields');
  }

  return signals;
};

/** Clamp to [0, 1] and round to 2 decimals. */
export const clampConfidence = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 100) / 100;
};

/**
 * Computes extraction confidence in [0, 1]: 1 − Σ weights of active signals,
 * clamped. `externalSignals` carries context signals (near_duplicate,
 * parser_suspect) the caller derived once for the whole catalogue.
 */
export const computeParsingConfidence = (
  mission: Mission,
  externalSignals: ReadonlySet<ParsingConfidenceSignalId> = new Set()
): number => {
  const active = new Set([...detectFieldSignals(mission), ...externalSignals]);
  let weight = 0;
  for (const signal of active) {
    weight += SIGNAL_WEIGHTS[signal];
  }
  return clampConfidence(1 - weight);
};

/**
 * Mission ids flagged as near-duplicates at the canonical threshold.
 * Pure, but O(n²)-ish — call once per derivation, not per mission.
 */
export const collectDuplicateMissionIds = (missions: Mission[]): Set<string> => {
  const { duplicateRelations } = deduplicateMissionsDetailed(missions);
  return new Set(duplicateRelations.map((relation) => relation.duplicateMissionId));
};

/** Connector ids with an active parser-health alert (suspect parsers). */
export const collectSuspectConnectorIds = (
  healthRecords: readonly ConnectorHealthRecord[]
): Set<string> => {
  const suspect = new Set<string>();
  for (const record of healthRecords) {
    if (deriveParserHealthAlert(record) !== null) {
      suspect.add(record.connectorId);
    }
  }
  return suspect;
};

/** Primary reason label for a signal set; '' when none has a label. */
export const primaryReasonLabel = (signals: readonly ParsingConfidenceSignalId[]): string => {
  for (const candidate of PRIMARY_REASON_ORDER) {
    if (signals.includes(candidate)) {
      return REASON_LABELS[candidate];
    }
  }
  return '';
};

/**
 * Derives the review queue: flagged missions (confidence < FLAG_THRESHOLD)
 * without a recorded decision, worst confidence first.
 *
 * Invariants (model): confidence ∈ [0,1]; decided missions never reappear;
 * pure function of its arguments.
 */
export const deriveReviewQueue = (
  missions: readonly Mission[],
  decisions: ReviewDecisionMap,
  duplicateMissionIds: ReadonlySet<string>,
  suspectConnectorIds: ReadonlySet<string>
): ReviewQueueEntry[] => {
  const entries: ReviewQueueEntry[] = [];

  for (const mission of missions) {
    if (decisions[mission.id] !== undefined) {
      continue;
    }

    const externalSignals = new Set<ParsingConfidenceSignalId>();
    if (duplicateMissionIds.has(mission.id)) {
      externalSignals.add('near_duplicate');
    }
    if (suspectConnectorIds.has(mission.source)) {
      externalSignals.add('parser_suspect');
    }

    const signals = [...detectFieldSignals(mission), ...externalSignals];
    if (signals.length === 0) {
      continue;
    }

    const confidence = computeParsingConfidence(mission, externalSignals);
    if (confidence >= FLAG_THRESHOLD) {
      continue;
    }

    entries.push({
      mission,
      confidence,
      signals,
      parserSuspect: externalSignals.has('parser_suspect'),
      primaryReasonLabel: primaryReasonLabel(signals),
    });
  }

  return entries.sort((a, b) => a.confidence - b.confidence);
};
