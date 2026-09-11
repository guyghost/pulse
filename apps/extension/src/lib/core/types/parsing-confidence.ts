/**
 * Types for extraction-confidence review queue (« À vérifier »).
 *
 * Model: src/models/parsing-confidence.model.md
 * Pure data — no I/O, no dates, no randomness.
 */

import type { Mission } from './mission';

/** Signals lowering extraction confidence. See model for firing conditions. */
export type ParsingConfidenceSignalId =
  'tjm_missing' | 'date_ambiguous' | 'incomplete_fields' | 'near_duplicate' | 'parser_suspect';

/** Immutable review decisions a user can record on a flagged mission. */
export type ReviewDecisionStatus = 'kept' | 'dismissed';

/** A recorded user review decision for one mission. */
export interface ReviewQueueDecision {
  readonly status: ReviewDecisionStatus;
  /** Decision timestamp (ms epoch) — injected by the Shell. */
  readonly decidedAt: number;
}

/** Decisions keyed by mission id. */
export type ReviewDecisionMap = Record<string, ReviewQueueDecision>;

/** One flagged mission in the review queue, as produced by pure derivation. */
export interface ReviewQueueEntry {
  readonly mission: Mission;
  /** Clamped to [0, 1], rounded to 2 decimals. Always < FLAG_THRESHOLD. */
  readonly confidence: number;
  /** All active signals for this mission. */
  readonly signals: readonly ParsingConfidenceSignalId[];
  /** Parser anomaly detected for the mission's source connector. */
  readonly parserSuspect: boolean;
  /** Short reason label shown under the title (French, per model). */
  readonly primaryReasonLabel: string;
}
