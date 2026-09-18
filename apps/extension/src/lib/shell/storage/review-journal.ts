/**
 * Persistence of the first-viewed journal (chrome.storage.local).
 * Shell event at mark-seen time on the feed side — see
 * src/models/time-to-review.model.md. Automatic markings (notification,
 * digest) must NOT call journalFirstViews.
 */
import {
  mergeFirstViewed,
  coerceIso,
  type FirstViewedEntryInput,
  type ReviewJournal,
} from '../../core/seen/first-viewed';
import type { Mission } from '../../core/types/mission';

const STORAGE_KEY = 'reviewJournal';

export async function getReviewJournal(): Promise<ReviewJournal> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const value = result[STORAGE_KEY];
  if (value === undefined || value === null || typeof value !== 'object') {
    return {};
  }
  return value as ReviewJournal;
}

/**
 * Journals the first review of the given missions (first-write-wins).
 * `capturedAt` is a snapshot of Mission.scrapedAt; null if the mission is not
 * in `missions` (or its timestamp is unreadable).
 */
export async function journalFirstViews(missionIds: string[], missions: Mission[]): Promise<void> {
  if (missionIds.length === 0) {
    return;
  }

  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));
  const viewedAt = new Date().toISOString();
  const entries: FirstViewedEntryInput[] = missionIds.map((missionId) => {
    const mission = missionsById.get(missionId);
    return {
      missionId,
      viewedAt,
      capturedAt: mission ? coerceIso(mission.scrapedAt) : null,
    };
  });

  const current = await getReviewJournal();
  const updated = mergeFirstViewed(current, entries);
  if (updated !== current) {
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  }
}
