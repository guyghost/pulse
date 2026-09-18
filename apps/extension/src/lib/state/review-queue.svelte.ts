/**
 * State module for the « À vérifier » review queue.
 *
 * Svelte 5 runes factory. The flagged list is a pure derivation
 * (core/connectors/parsing-confidence.ts) over (missions, decisions, dedup
 * relations, parser health) — this module only owns reactivity, decision
 * timestamps and persistence through the shell facade.
 *
 * Model: src/models/parsing-confidence.model.md — a decided mission never
 * reappears; decisions are immutable.
 */

import {
  collectDuplicateMissionIds,
  collectSuspectConnectorIds,
  deriveReviewQueue,
} from '$lib/core/connectors/parsing-confidence';
import type { ConnectorHealthRecord } from '$lib/core/connectors/parser-health-logic';
import type { Mission } from '$lib/core/types/mission';
import type {
  ReviewDecisionMap,
  ReviewDecisionStatus,
  ReviewQueueEntry,
} from '$lib/core/types/parsing-confidence';
import {
  loadReviewDecisions,
  persistReviewDecisions,
} from '$lib/shell/facades/review-queue.facade';

export interface ReviewQueueState {
  /** Flagged missions, worst confidence first (pure derivation). */
  readonly entries: ReviewQueueEntry[];
  /** Recorded decisions count (kept + dismissed), for diagnostics. */
  readonly decidedCount: number;
  /** Loads persisted decisions, then re-derives the queue. */
  load(): Promise<void>;
  /** Re-derives the queue from fresh inputs (missions, parser health). */
  sync(
    missions: readonly Mission[],
    parserHealthRecords: ReadonlyMap<string, ConnectorHealthRecord>
  ): void;
  /** Records a « Garder » decision (kept) and persists it. */
  keep(missionId: string): void;
  /** Records a « Ignorer » decision (dismissed) and persists it. */
  dismiss(missionId: string): void;
}

export function createReviewQueueState(): ReviewQueueState {
  let decisions = $state<ReviewDecisionMap>({});
  // $state.raw: shallow reactivity — sync() reassigns wholesale, so no deep
  // proxying of the (potentially large) mission catalogue.
  let missions = $state.raw<readonly Mission[]>([]);
  let parserHealthRecords = $state.raw<Record<string, ConnectorHealthRecord>>({});

  const duplicateMissionIds = $derived.by(() => {
    // Dedup is O(n²)-ish — recomputed only when missions change.
    return collectDuplicateMissionIds([...missions]);
  });

  const suspectConnectorIds = $derived.by(() => {
    return collectSuspectConnectorIds(Object.values(parserHealthRecords));
  });

  const entries = $derived(
    deriveReviewQueue(missions, decisions, duplicateMissionIds, suspectConnectorIds)
  );

  const decidedCount = $derived(Object.keys(decisions).length);

  function recordDecision(missionId: string, status: ReviewDecisionStatus): void {
    if (decisions[missionId] !== undefined) {
      return; // Immutable once recorded (model invariant).
    }
    decisions = { ...decisions, [missionId]: { status, decidedAt: Date.now() } };
    void persistReviewDecisions(decisions).catch((error: unknown) => {
      // Fire-and-forget: in-memory decision stands; a failed write means the
      // mission may be flagged again next session (safe per model).
      console.warn('[review-queue] Failed to persist decision', error);
    });
  }

  return {
    get entries() {
      return entries;
    },
    get decidedCount() {
      return decidedCount;
    },
    async load() {
      decisions = await loadReviewDecisions();
    },
    sync(nextMissions, nextParserHealthRecords) {
      missions = nextMissions;
      parserHealthRecords = Object.fromEntries(nextParserHealthRecords);
    },
    keep(missionId) {
      recordDecision(missionId, 'kept');
    },
    dismiss(missionId) {
      recordDecision(missionId, 'dismissed');
    },
  };
}
