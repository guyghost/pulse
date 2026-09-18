/**
 * Persistence of review-queue decisions (« Garder » / « Ignorer »).
 *
 * Imperative shell: owns chrome.storage I/O only — all computation stays in
 * core. Model: src/models/parsing-confidence.model.md (decisions are
 * immutable; capped to the most recent MAX_REVIEW_DECISIONS entries).
 */

import type { ReviewDecisionMap } from '$lib/core/types/parsing-confidence';

const STORAGE_KEY = 'reviewQueueDecisions';
const MAX_REVIEW_DECISIONS = 2000;

export async function getReviewDecisions(): Promise<ReviewDecisionMap> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] as ReviewDecisionMap | undefined) ?? {};
}

export async function saveReviewDecisions(decisions: ReviewDecisionMap): Promise<void> {
  // Cap storage: keep the most recent decisions by timestamp.
  const entries = Object.entries(decisions);
  if (entries.length > MAX_REVIEW_DECISIONS) {
    entries.sort(([, a], [, b]) => b.decidedAt - a.decidedAt);
    const kept: ReviewDecisionMap = {};
    for (const [id, decision] of entries.slice(0, MAX_REVIEW_DECISIONS)) {
      kept[id] = decision;
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: kept });
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: decisions });
}
