/**
 * State of the "Time to review" card (see src/models/time-to-review.model.md).
 * Runes factory: loads missions (via bridge) + journal, computes via pure core.
 */
import { SvelteDate } from 'svelte/reactivity';
import {
  buildReviewEvents,
  computeTimeToReview,
  type TimeToReviewResult,
} from '../core/metrics/time-to-review';
import { getMissions } from '../shell/facades/feed-data.facade';
import { getReviewJournal } from '../shell/storage/review-journal';

export type TimeToReviewStatus = 'loading' | 'ready' | 'error';

export function createTimeToReviewStore() {
  let status = $state<TimeToReviewStatus>('loading');
  let stats = $state<TimeToReviewResult | null>(null);

  async function load(): Promise<void> {
    status = 'loading';
    try {
      const [missions, journal] = await Promise.all([getMissions(), getReviewJournal()]);
      const events = buildReviewEvents(missions, journal);
      stats = computeTimeToReview(events, new SvelteDate());
      status = 'ready';
    } catch {
      status = 'error';
    }
  }

  return {
    get status() {
      return status;
    },
    get stats() {
      return stats;
    },
    load,
  };
}
