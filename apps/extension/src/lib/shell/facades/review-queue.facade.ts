/**
 * Facade for review-queue decisions (« À vérifier »).
 *
 * The side panel never touches chrome.* directly — it goes through this
 * facade, which owns the storage I/O (direct chrome.storage.local, same
 * pattern as seen-missions/favorites storage: decisions are UI-local and do
 * not need the service-worker bridge).
 */

import type { ReviewDecisionMap } from '$lib/core/types/parsing-confidence';
import { getReviewDecisions, saveReviewDecisions } from '../storage/review-decisions';

export async function loadReviewDecisions(): Promise<ReviewDecisionMap> {
  return getReviewDecisions();
}

export async function persistReviewDecisions(decisions: ReviewDecisionMap): Promise<void> {
  await saveReviewDecisions(decisions);
}
